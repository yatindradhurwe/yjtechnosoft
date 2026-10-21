# Template JSON Specification (schemaVersion 1)

Machine-readable schema: [`../schemas/template.schema.json`](../schemas/template.schema.json) (JSON
Schema 2020-12, validated with Ajv in `src/template/validate.js`).
Examples: [`../templates`](../templates) and [`../frames`](../frames).

A single format describes two kinds of document:

| `kind` | What it is | Rendered how |
|---|---|---|
| `template` | A complete creative: festival post, flyer or reel cover | `renderTemplate(template, data, options)` |
| `frame` | A reusable branding strip (footer, header, side band or full border) | Placed into a template's `frame` layer, scaled to the slot |

## 1. Document

```jsonc
{
  "schemaVersion": 1,
  "kind": "template",
  "id": "festival-diwali-square",       // slug, unique in the catalogue
  "version": 3,                          // immutable once published; part of the render cache key
  "name": "Diwali greeting (1:1)",
  "canvas": { "width": 1080, "height": 1080, "background": "#1c0a00" },
  "meta": {                              // catalogue filters; the renderer ignores this
    "aspectRatio": "1:1",
    "languages": ["hi", "en"],
    "contentStyle": "greeting",          // promotional | educational | emotional | lead_generation | showcase | greeting
    "categories": ["all"],               // or ["real-estate", "real-estate.2bhk"]
    "festivalKeys": ["diwali"],
    "tags": ["diya"],
    "premium": false
  },
  "fonts": ["Noto Sans", "Noto Sans Devanagari"],
  "layers": [ /* bottom → top */ ]
}
```

**Coordinates.** Every `box` is `{ x, y, w, h }` in canvas pixels, with the origin at the top-left
corner. The design size is usually 1080 px wide. At render time `options.width` scales the whole
document: boxes, font sizes, radii, padding, letter spacing and shadows. One template therefore
produces a 270 px thumbnail, a 1080 px post and a 2160 px print export.

**Painting order.** Layers are painted in array order. The first layer is at the bottom. Groups and
frames are painted in the position where they appear in the array.

## 2. Common layer properties

| Property | Type | Meaning |
|---|---|---|
| `id` | slug | Unique in its group. Child ids inside groups and frames become `parent/child` (e.g. `frame/phone`) |
| `type` | enum | `image`, `shape`, `text`, `logo`, `badge`, `qr`, `group`, `frame` |
| `box` | box | Bounding box. Content never draws outside it (text shrinks, images are cropped or fitted) |
| `opacity` | 0–1 | Multiplied with the opacity of parent groups |
| `rotation` | degrees | Rotation around the centre of the box |
| `hidden` | bool | Not rendered (the editor can toggle it) |
| `locked` | bool | Editor hint: the layer cannot be selected or moved |
| `editable` | string[] | Editor hint: which properties the user may override: `text`, `src`, `box`, `style`, `hidden`, `opacity` |

## 3. Bindings

Any string property can contain `{{ expression }}`:

| Expression | Result |
|---|---|
| `{{ business.name }}` | Value at the path in the render data |
| `{{ business.whatsapp \|\| business.phone }}` | The first non-empty alternative |
| `{{ event.greeting \|\| 'शुभ दीपावली' }}` | A quoted literal as the last fallback |

Missing values resolve to `''`. A `text`, `badge`, `logo` or `qr` layer whose content resolves to
empty is **skipped** (`hideIfEmpty`, default `true`). A business without a website therefore gets no
empty website pill, and the rest of the layout stays the same.

Standard render data, assembled by the API from `business_profiles`, `brand_assets` and the festival
calendar:

```jsonc
{
  "business": { "name", "tagline", "category", "phone", "altPhone", "whatsapp", "email",
                "website", "address", "city", "social": { "instagram", "facebook", "youtube" },
                "extra": { "rera": "…", "gstin": "…" } },
  "brand":    { "logo": { "primary", "light", "dark", "watermark" },   // asset keys
                "colors": { "primary", "secondary", "accent", "text" },
                "fonts": { "heading", "body" } },
  "event":    { "key", "name", "date", "greeting", "message" },        // in the user's language
  "post":     { /* free fields of this template: headline, price, photo, features, link … */ }
}
```

Colours can be bindings too (`"color": "{{ brand.colors.primary || '#1e3a8a' }}"`). This is how one
frame design takes on each business's brand colours.

## 4. Layer types

### `image`
Background artwork, property photos and product shots.
```json
{ "id": "photo", "type": "image", "src": "{{ post.photo || 'property.svg' }}",
  "box": { "x": 0, "y": 0, "w": 1080, "h": 860 },
  "fit": "cover", "position": "attention", "radius": 0 }
```
`fit`: `cover` (crop to fill), `contain` (fit inside), `fill` (stretch). `position` chooses the crop
anchor. `attention` and `entropy` are content-aware crops, useful for user photos. Phone photos are
rotated according to their EXIF orientation.

### `shape`
Rectangles, ellipses and SVG paths (for wave or curved footers), filled with a colour or a linear
gradient.
```json
{ "id": "wave", "type": "shape", "shape": "path", "viewBox": [0, 0, 1080, 220],
  "path": "M0 60 C 270 0, 540 110, 1080 30 L 1080 220 L 0 220 Z",
  "box": { "x": 0, "y": 0, "w": 1080, "h": 220 },
  "fill": { "type": "linear", "angle": 0, "stops": [
    { "offset": 0, "color": "{{ brand.colors.primary }}" },
    { "offset": 1, "color": "{{ brand.colors.secondary }}", "opacity": 0.9 } ] },
  "stroke": { "color": "#ffffff", "width": 2 }, "radius": 0 }
```
Gradient `angle`: 0 = left to right, 90 = top to bottom.

### `text`
```json
{ "id": "headline", "type": "text", "text": "{{ post.headline }}",
  "box": { "x": 60, "y": 760, "w": 960, "h": 150 },
  "fit": "shrink", "maxLines": 2,
  "style": { "fontFamily": "Noto Sans", "fontWeight": 800, "fontSize": 68, "italic": false,
             "color": "#ffffff", "align": "left", "verticalAlign": "bottom",
             "lineHeight": 1.1, "letterSpacing": 0, "textTransform": "none",
             "shadow": { "color": "#000000", "blur": 6, "dx": 0, "dy": 4, "opacity": 0.6 } } }
```
- `fontSize` is the **maximum** size. With `fit: "shrink"` (the default) the renderer wraps the text
  to the box width and reduces the size until it fits the box height. Long business names therefore
  never overflow. `fit: "fixed"` keeps the size and clips at the box edge.
- `maxLines: 1` disables wrapping (names, phone numbers).
- Text is shaped by Pango and HarfBuzz, so Devanagari, Gujarati, Bengali, Tamil, Telugu, Kannada,
  Malayalam, Gurmukhi and Odia render with correct conjuncts and matras, as long as the font is
  installed on the worker.

### `logo`
```json
{ "id": "logo", "type": "logo", "src": "{{ brand.logo.light || brand.logo.primary }}",
  "box": { "x": 32, "y": 0, "w": 190, "h": 190 }, "align": "center", "verticalAlign": "middle",
  "trim": true, "plate": { "fill": "#ffffff", "radius": 28, "padding": 18 } }
```
The logo is always fitted inside the box (never cropped or stretched). Empty borders in the uploaded
file are removed first (`trim`), so logos of different shapes look equally large. The optional
`plate` draws a rounded background sized to the logo, which keeps dark logos readable on dark artwork.

### `badge`
A contact pill: an icon plus one line of text.
```json
{ "id": "phone", "type": "badge", "icon": "phone", "text": "{{ business.phone }}",
  "box": { "x": 250, "y": 144, "w": 380, "h": 56 }, "width": "auto", "align": "left",
  "style": { "background": "#ffffff", "color": "{{ brand.colors.primary }}", "iconColor": "#16a34a",
             "fontFamily": "Noto Sans", "fontWeight": 700, "fontSize": 26,
             "radius": 28, "paddingX": 18, "gap": 10, "border": { "color": "#ffffff88", "width": 2 } } }
```
`icon`: `none`, `phone`, `whatsapp`, `globe`, `mail`, `location`, `instagram`, `facebook`.
With `width: "auto"` the pill fits its content and is aligned in the box. With `width: "fill"` it
uses the full box width. Text that is too long shrinks to fit.

### `qr`
```json
{ "id": "qr", "type": "qr", "data": "{{ post.link || business.website }}",
  "box": { "x": 820, "y": 920, "w": 200, "h": 200 }, "color": "#000000", "background": "#ffffff", "margin": 2 }
```
Square, error-correction level M, drawn with nearest-neighbour scaling so it stays sharp. The data
can also be a vCard string for digital business cards.

### `group`
Child layers in their own coordinate space (`designSize`), scaled into `box`. Use groups for
reusable components and for moving several elements together in the editor.
```json
{ "id": "price-tag", "type": "group", "box": { "x": 700, "y": 80, "w": 300, "h": 120 },
  "designSize": { "width": 600, "height": 240 }, "layers": [ … ] }
```
Font sizes and radii scale by `min(scaleX, scaleY)`, so text is never distorted.

### `frame`
A placeholder that the renderer fills with a frame document:
```json
{ "id": "frame", "type": "frame", "slot": "footer", "defaultFrameId": "footer-classic",
  "accepts": [], "box": { "x": 0, "y": 860, "w": 1080, "h": 220 } }
```
The frame comes from `options.frameId` (the user's choice) or `defaultFrameId`. It is validated, its
`meta.slot` must match `slot`, and it is expanded into a group scaled into `box`. Each child can be
overridden as `frame/<childId>`. Any footer frame therefore works with any template that has a footer
slot. A catalogue of N templates and M frames gives N × M combinations with no extra design work.

## 5. Overrides (editor output)

```json
{
  "greeting":      { "text": "Happy Diwali", "style": { "color": "#ffffff" } },
  "frame/address": { "hidden": true },
  "logo":          { "box": { "x": 40, "y": 40, "w": 180, "h": 120 } },
  "photo":         { "src": "tenants/…/uploads/site-photo.jpg" }
}
```
Allowed keys: `text`, `src`, `data`, `box`, `style` (merged with the layer's style), `hidden`,
`opacity`, `fill`. The API should reject overrides on a property that is not in the layer's
`editable` list. Overrides are stored in `generated_creatives.overrides` and are part of the cache key.

## 6. Versioning and authoring rules

- `schemaVersion` changes only for breaking changes to the format. The renderer keeps support for
  older schema versions.
- A template `version` is immutable after publishing. Edits create a new row in `template_versions`.
- CI checks for every template: the schema is valid; every font is installed in the worker image;
  every referenced asset exists; and a render with a "worst-case" profile (40-character name, no
  website, square logo, very wide logo) has no layer errors.
