-- Poster Engine: multi-tenant PostgreSQL schema (PostgreSQL 15+)
--
-- Tenancy model: every tenant-owned row carries tenant_id, and row-level security limits each
-- request to the tenant set by the API in `SET LOCAL app.tenant_id = '<uuid>'`.
-- The global catalog (templates, frames, festivals, categories) has tenant_id NULL and is read-only
-- for tenants. Agencies may add private templates or frames with their own tenant_id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy template search

-- ---------------------------------------------------------------------------
-- 1. Tenants, users, plans, subscriptions
-- ---------------------------------------------------------------------------

CREATE TYPE tenant_kind  AS ENUM ('business', 'agency');
CREATE TYPE member_role  AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE sub_status   AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');
CREATE TYPE pay_provider AS ENUM ('razorpay', 'stripe', 'apple', 'google_play', 'manual');

CREATE TABLE plans (
  id              text PRIMARY KEY,                       -- 'free', 'pro_monthly', 'pro_yearly', 'agency'
  name            text NOT NULL,
  price_minor     integer NOT NULL DEFAULT 0,             -- paise / cents
  currency        char(3) NOT NULL DEFAULT 'INR',
  interval        text CHECK (interval IN ('month', 'year')),
  -- Feature limits checked by the API: {"downloadsPerDay":5,"watermark":true,"businesses":1,
  -- "videoRendersPerMonth":0,"premiumTemplates":false,"gbp":false,"seats":1}
  limits          jsonb NOT NULL DEFAULT '{}',
  is_public       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            tenant_kind NOT NULL DEFAULT 'business',
  name            text NOT NULL,
  plan_id         text NOT NULL DEFAULT 'free' REFERENCES plans(id),
  parent_id       uuid REFERENCES tenants(id),            -- agency → client businesses
  locale          text NOT NULL DEFAULT 'en-IN',
  timezone        text NOT NULL DEFAULT 'Asia/Kolkata',   -- decides what "today" means for the feed
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text UNIQUE,                            -- E.164; OTP login is the main path in India
  email           citext UNIQUE,
  password_hash   text,                                   -- null for OTP/Google-only accounts
  google_sub      text UNIQUE,
  name            text,
  preferred_lang  text NOT NULL DEFAULT 'en',
  is_staff        boolean NOT NULL DEFAULT false,         -- internal template designers / support
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE memberships (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            member_role NOT NULL DEFAULT 'owner',
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id             text NOT NULL REFERENCES plans(id),
  status              sub_status NOT NULL,
  provider            pay_provider NOT NULL,
  provider_sub_id     text,                               -- Razorpay subscription id / Stripe sub id
  current_period_end  timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_sub_id)
);
CREATE INDEX subscriptions_tenant_idx ON subscriptions (tenant_id, status);

-- Idempotency log for Razorpay/Stripe webhooks (providers retry deliveries).
CREATE TABLE payment_events (
  provider        pay_provider NOT NULL,
  event_id        text NOT NULL,
  payload         jsonb NOT NULL,
  processed_at    timestamptz,
  received_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- 2. Business profiles and brand assets
-- ---------------------------------------------------------------------------

CREATE TABLE categories (                                 -- niche tree: real-estate > real-estate.2bhk
  id              text PRIMARY KEY,                       -- dotted slug
  parent_id       text REFERENCES categories(id),
  names           jsonb NOT NULL,                         -- {"en":"2 BHK","hi":"2 बीएचके"}
  sort_order      integer NOT NULL DEFAULT 0,
  is_industry     boolean NOT NULL DEFAULT false          -- top level, chosen at onboarding
);

CREATE TABLE business_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  tagline         text,
  industry_id     text REFERENCES categories(id),
  sub_categories  text[] NOT NULL DEFAULT '{}',           -- drives the personalised feed
  phone           text,
  alt_phone       text,
  whatsapp        text,
  email           citext,
  website         text,
  address         text,
  city            text,
  state           text,
  pincode         text,
  geo             point,
  social          jsonb NOT NULL DEFAULT '{}',            -- {"instagram":"@x","facebook":"...","youtube":"..."}
  -- Brand kit used by bindings ({{ brand.colors.primary }}) and the editor palette.
  brand_colors    jsonb NOT NULL DEFAULT '{}',            -- {"primary":"#1e3a8a","secondary":"#0f172a","accent":"#f59e0b"}
  brand_fonts     jsonb NOT NULL DEFAULT '{}',            -- {"heading":"Poppins","body":"Noto Sans"}
  default_frame_id text,                                  -- preferred footer frame
  frame_prefs     jsonb NOT NULL DEFAULT '{}',            -- per slot: {"footer":"footer-classic","header":null}
  extra_fields    jsonb NOT NULL DEFAULT '{}',            -- RERA no., GSTIN, registration no. ...
  is_default      boolean NOT NULL DEFAULT true,
  -- Bumped on every change. Part of the render cache key, so old renders are never served after an edit.
  revision        integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_profiles_tenant_idx ON business_profiles (tenant_id);
CREATE UNIQUE INDEX business_profiles_one_default ON business_profiles (tenant_id) WHERE is_default;

CREATE TYPE asset_kind AS ENUM ('logo_primary', 'logo_light', 'logo_dark', 'watermark', 'photo', 'audio', 'video', 'font', 'other');

CREATE TABLE brand_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id     uuid REFERENCES business_profiles(id) ON DELETE CASCADE,
  kind            asset_kind NOT NULL,
  storage_key     text NOT NULL,                          -- r2://bucket/tenants/<tenant>/assets/<id>.png
  mime_type       text NOT NULL,
  bytes           bigint NOT NULL,
  width           integer,
  height          integer,
  has_alpha       boolean,
  dominant_colors text[],                                 -- extracted on upload, suggested as brand colours
  sha256          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brand_assets_business_idx ON brand_assets (business_id, kind);
CREATE UNIQUE INDEX brand_assets_dedupe ON brand_assets (tenant_id, sha256);

-- ---------------------------------------------------------------------------
-- 3. Templates and frames (JSON spec in schemas/template.schema.json)
-- ---------------------------------------------------------------------------

CREATE TYPE template_status AS ENUM ('draft', 'review', 'published', 'archived');
CREATE TYPE media_type      AS ENUM ('image', 'video');

CREATE TABLE templates (
  id              text PRIMARY KEY,                       -- slug, same as spec.id
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global catalog
  kind            text NOT NULL CHECK (kind IN ('template', 'frame')),
  media           media_type NOT NULL DEFAULT 'image',
  status          template_status NOT NULL DEFAULT 'draft',
  current_version integer NOT NULL DEFAULT 1,
  name            text NOT NULL,
  -- Denormalised from spec.meta so the feed query never parses JSON.
  aspect_ratio    text NOT NULL,                          -- '1:1', '4:5', '9:16' ...
  languages       text[] NOT NULL DEFAULT '{}',           -- ISO 639: en, hi, mr, gu, ta, te, bn, kn, ml, pa
  content_style   text,                                   -- promotional | educational | emotional | lead_generation | showcase | greeting
  categories      text[] NOT NULL DEFAULT '{}',           -- category ids; 'all' = any industry
  festival_keys   text[] NOT NULL DEFAULT '{}',
  frame_slot      text,                                   -- frames only: footer | header | full | side
  tags            text[] NOT NULL DEFAULT '{}',
  is_premium      boolean NOT NULL DEFAULT false,
  thumbnail_key   text,                                   -- unbranded preview for the feed
  sort_weight     integer NOT NULL DEFAULT 0,             -- editorial boost
  use_count       bigint NOT NULL DEFAULT 0,              -- popularity (updated in batches)
  published_at    timestamptz,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX templates_feed_idx      ON templates (status, kind, aspect_ratio) WHERE status = 'published';
CREATE INDEX templates_languages_idx ON templates USING gin (languages);
CREATE INDEX templates_categories_idx ON templates USING gin (categories);
CREATE INDEX templates_festivals_idx ON templates USING gin (festival_keys);
CREATE INDEX templates_tags_idx      ON templates USING gin (tags);
CREATE INDEX templates_name_trgm     ON templates USING gin (name gin_trgm_ops);

-- Immutable versions. A published version is never edited; a fix creates version n+1, so existing
-- GeneratedCreatives can always be re-rendered exactly.
CREATE TABLE template_versions (
  template_id     text NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  spec            jsonb NOT NULL,                         -- full template JSON (layers, boxes, bindings)
  asset_keys      text[] NOT NULL DEFAULT '{}',           -- artwork referenced by the spec
  -- Video templates: composition id plus input props schema for the Remotion/FFmpeg worker.
  video_spec      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);

-- ---------------------------------------------------------------------------
-- 4. Festival and event calendar
-- ---------------------------------------------------------------------------

CREATE TYPE event_kind AS ENUM ('festival', 'national', 'jayanti', 'memorial', 'awareness', 'commercial', 'seasonal');

-- One row per event concept ("diwali"). Dates live in festival_occurrences, because most Indian
-- festivals follow the lunar calendar and move every year.
CREATE TABLE festivals (
  key             text PRIMARY KEY,                       -- 'diwali', 'independence-day', 'ambedkar-jayanti'
  kind            event_kind NOT NULL,
  names           jsonb NOT NULL,                         -- {"en":"Diwali","hi":"दीपावली","mr":"दिवाळी"}
  greetings       jsonb NOT NULL DEFAULT '{}',            -- {"en":"Happy Diwali","hi":"शुभ दीपावली"} → {{ event.greeting }}
  regions         text[] NOT NULL DEFAULT '{IN}',         -- 'IN', 'IN-MH', 'IN-TN', 'GLOBAL'
  religions       text[] NOT NULL DEFAULT '{}',
  tags            text[] NOT NULL DEFAULT '{}',
  lead_days       smallint NOT NULL DEFAULT 3,            -- start showing in "Upcoming" this many days before
  importance      smallint NOT NULL DEFAULT 2 CHECK (importance BETWEEN 1 AND 3),
  -- Fixed-date events: generate occurrences automatically. {"month":8,"day":15}
  fixed_date      jsonb
);

CREATE TABLE festival_occurrences (
  festival_key    text NOT NULL REFERENCES festivals(key) ON DELETE CASCADE,
  date            date NOT NULL,
  end_date        date,                                   -- multi-day: Navratri, Durga Puja
  region          text NOT NULL DEFAULT 'IN',
  verified        boolean NOT NULL DEFAULT false,         -- checked against the published panchang
  PRIMARY KEY (festival_key, date, region)
);
CREATE INDEX festival_occurrences_date_idx ON festival_occurrences (date);

-- Curated templates for an event. Templates tagged with festival_keys are also picked up
-- automatically; this table pins order and per-language picks.
CREATE TABLE festival_templates (
  festival_key    text NOT NULL REFERENCES festivals(key) ON DELETE CASCADE,
  template_id     text NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  position        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (festival_key, template_id)
);

-- ---------------------------------------------------------------------------
-- 5. Generated creatives, render jobs, sharing, scheduling
-- ---------------------------------------------------------------------------

CREATE TYPE render_status AS ENUM ('queued', 'rendering', 'done', 'failed');

CREATE TABLE generated_creatives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  template_id     text NOT NULL REFERENCES templates(id),
  template_version integer NOT NULL,
  frame_id        text REFERENCES templates(id),
  festival_key    text REFERENCES festivals(key),
  media           media_type NOT NULL DEFAULT 'image',
  overrides       jsonb NOT NULL DEFAULT '{}',            -- editor changes keyed by layer id
  profile_revision integer NOT NULL,                       -- business_profiles.revision used
  render_key      text NOT NULL,                          -- sha256 from renderCacheKey()
  status          render_status NOT NULL DEFAULT 'queued',
  output_key      text,                                   -- r2://.../creatives/<render_key>.png
  format          text NOT NULL DEFAULT 'png',
  width           integer,
  height          integer,
  bytes           bigint,
  duration_ms     integer,                                -- video length
  render_ms       integer,
  error           text,
  is_watermarked  boolean NOT NULL DEFAULT false,         -- free tier
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generated_creatives_history_idx ON generated_creatives (business_id, created_at DESC);
CREATE INDEX generated_creatives_render_key_idx ON generated_creatives (render_key);
CREATE INDEX generated_creatives_template_idx ON generated_creatives (template_id);

CREATE TYPE share_channel AS ENUM ('download', 'whatsapp', 'whatsapp_status', 'instagram', 'facebook', 'linkedin', 'gbp', 'other');

CREATE TABLE share_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  creative_id     uuid NOT NULL REFERENCES generated_creatives(id) ON DELETE CASCADE,
  channel         share_channel NOT NULL,
  external_id     text,                                   -- post id from Meta/GBP for direct publishing
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_events_tenant_idx ON share_events (tenant_id, created_at DESC);

-- Daily usage counters for plan limits (also mirrored in Redis for fast checks).
CREATE TABLE usage_daily (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day             date NOT NULL,
  metric          text NOT NULL,                          -- 'image_downloads', 'video_renders', 'gbp_posts'
  count           integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day, metric)
);

-- ---------------------------------------------------------------------------
-- 6. Integrations (Google Business Profile, Meta, WhatsApp)
-- ---------------------------------------------------------------------------

CREATE TABLE integration_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('google_business', 'meta_facebook', 'meta_instagram', 'linkedin', 'whatsapp_cloud')),
  external_id     text NOT NULL,                          -- GBP location name, IG business account id ...
  display_name    text,
  -- Encrypted with a KMS data key (envelope encryption). Never returned by the API.
  token_ciphertext bytea NOT NULL,
  scopes          text[] NOT NULL DEFAULT '{}',
  expires_at      timestamptz,
  status          text NOT NULL DEFAULT 'active',         -- active | revoked | error
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, provider, external_id)
);

CREATE TABLE scheduled_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  creative_id     uuid NOT NULL REFERENCES generated_creatives(id) ON DELETE CASCADE,
  integration_id  uuid NOT NULL REFERENCES integration_accounts(id) ON DELETE CASCADE,
  caption         text,
  publish_at      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending',        -- pending | publishing | published | failed
  attempts        smallint NOT NULL DEFAULT 0,
  external_post_id text,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_posts_due_idx ON scheduled_posts (publish_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 7. Growth utilities: microsites, leads, quotations, digital cards
-- ---------------------------------------------------------------------------

CREATE TABLE microsites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  slug            text NOT NULL UNIQUE,                   -- shreeramhomes.brand.site
  custom_domain   text UNIQUE,
  theme           text NOT NULL DEFAULT 'default',
  sections        jsonb NOT NULL DEFAULT '[]',            -- hero, about, catalogue, gallery, contact
  published       boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  source          text NOT NULL,                          -- microsite | vcard | qr | gbp
  name            text,
  phone           text,
  email           citext,
  message         text,
  meta            jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_business_idx ON leads (business_id, created_at DESC);

CREATE TABLE billing_documents (                          -- quotations and invoices
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('quotation', 'invoice')),
  number          text NOT NULL,
  customer        jsonb NOT NULL,
  items           jsonb NOT NULL,                         -- [{description, qty, rate, taxPct}]
  totals          jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'draft',
  pdf_key         text,
  issued_on       date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, type, number)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- The API connects as role `app` and runs `SET LOCAL app.tenant_id = $1` in each transaction.
-- Workers that need cross-tenant access (scheduler, billing webhooks) use a separate BYPASSRLS role.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_profiles', 'brand_assets', 'subscriptions', 'generated_creatives', 'share_events',
                           'usage_daily', 'integration_accounts', 'scheduled_posts', 'microsites', 'leads', 'billing_documents']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::uuid)', t);
  END LOOP;
END $$;

-- Templates: the global catalog plus the tenant's own private templates.
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY templates_read ON templates FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY templates_write ON templates FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Seed: plans
-- ---------------------------------------------------------------------------
INSERT INTO plans (id, name, price_minor, interval, limits) VALUES
  ('free',        'Free',          0,      NULL,    '{"downloadsPerDay":3,"watermark":true,"businesses":1,"videoRendersPerMonth":0,"premiumTemplates":false,"gbp":false,"seats":1}'),
  ('pro_monthly', 'Pro (monthly)', 29900,  'month', '{"downloadsPerDay":null,"watermark":false,"businesses":1,"videoRendersPerMonth":60,"premiumTemplates":true,"gbp":true,"seats":2}'),
  ('pro_yearly',  'Pro (yearly)',  249900, 'year',  '{"downloadsPerDay":null,"watermark":false,"businesses":1,"videoRendersPerMonth":60,"premiumTemplates":true,"gbp":true,"seats":2}'),
  ('agency',      'Agency',        199900, 'month', '{"downloadsPerDay":null,"watermark":false,"businesses":25,"videoRendersPerMonth":500,"premiumTemplates":true,"gbp":true,"seats":10}')
ON CONFLICT (id) DO NOTHING;
