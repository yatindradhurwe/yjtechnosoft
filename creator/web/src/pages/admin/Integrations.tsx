import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { PageHeader, QueryView } from '@/components/ui/misc';

const SPEC: Record<string, { title: string; help: string; config: { key: string; label: string; options?: string[] }[] }> = {
  RAZORPAY: { title: 'Razorpay', help: 'India payments (UPI, cards, net banking). Webhook URL: {API}/api/webhooks/razorpay – enable payment.captured, payment.failed, order.paid, refund.processed, refund.failed.', config: [{ key: 'keyId', label: 'Key ID' }] },
  STRIPE: { title: 'Stripe', help: 'International payments. Webhook URL: {API}/api/webhooks/stripe – enable checkout.session.completed, checkout.session.async_payment_succeeded/failed, checkout.session.expired, refund.created, refund.updated.', config: [] },
  SMTP: { title: 'Email (SMTP)', help: 'Transactional and marketing email. Works with Amazon SES, Resend SMTP, Postmark, Zoho, Gmail Workspace, etc.', config: [{ key: 'host', label: 'Host' }, { key: 'port', label: 'Port' }, { key: 'user', label: 'Username' }, { key: 'from', label: 'From address, e.g. Brand <no-reply@brand.com>' }, { key: 'secure', label: 'Use TLS on connect (port 465)', options: ['false', 'true'] }] },
  AI: { title: 'AI provider', help: 'Powers the creator AI assistant. Usage is metered per workspace in AI credits.', config: [{ key: 'provider', label: 'Provider', options: ['anthropic', 'openai'] }, { key: 'model', label: 'Model (e.g. claude-opus-5-5)' }] },
};

function IntegrationCard({ item, secretFields, onSaved, readOnly }: { item: any; secretFields: string[]; onSaved: () => void; readOnly: boolean }) {
  const spec = SPEC[item.kind];
  const [enabled, setEnabled] = useState<boolean>(item.configured ? item.enabled : true);
  const [config, setConfig] = useState<Record<string, string>>(Object.fromEntries(spec.config.map((c) => [c.key, String(item.config[c.key] ?? c.options?.[0] ?? '')])));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle>{spec.title}</CardTitle><CardDescription>{spec.help.replace('{API}', location.origin)}</CardDescription></div>
        {item.configured ? <Badge variant={item.enabled ? 'success' : 'secondary'}>{item.enabled ? 'Connected' : 'Disabled'}</Badge> : <Badge variant="outline">Not configured</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        {spec.config.map((c) => (
          <Field key={c.key} label={c.label}>
            {c.options ? <Select value={config[c.key]} onChange={(e) => setConfig({ ...config, [c.key]: e.target.value })} disabled={readOnly}>{c.options.map((o) => <option key={o}>{o}</option>)}</Select> : <Input value={config[c.key]} onChange={(e) => setConfig({ ...config, [c.key]: e.target.value })} disabled={readOnly} />}
          </Field>
        ))}
        {secretFields.map((s) => (
          <Field key={s} label={s.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())} hint={item.secretsSet[s] ? 'Saved (hidden). Leave blank to keep it.' : 'Not set'}>
            <Input type="password" autoComplete="off" value={secrets[s] ?? ''} onChange={(e) => setSecrets({ ...secrets, [s]: e.target.value })} disabled={readOnly} />
          </Field>
        ))}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm"><Switch checked={enabled} onChange={setEnabled} label="Enabled" disabled={readOnly} /> Enabled</label>
          <Button disabled={readOnly} loading={busy} onClick={async () => {
            setBusy(true);
            try {
              const cfg: Record<string, string | number | boolean> = { ...config };
              if (item.kind === 'SMTP') { cfg.port = Number(config.port || 587); cfg.secure = config.secure === 'true'; }
              await api.put(`/admin/integrations/${item.kind}`, { enabled, config: cfg, secrets });
              setSecrets({});
              toast.success(`${spec.title} saved`);
              onSaved();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Integrations() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['admin-integrations'], queryFn: () => api.get('/admin/integrations') });
  return (
    <>
      <PageHeader title="Provider integrations" description="Secrets are encrypted at rest (AES-256-GCM) and never sent back to the browser. Changes are audited without secret values." />
      <QueryView q={q}>
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-2">
            {d.integrations.filter((i: any) => SPEC[i.kind]).map((i: any) => <IntegrationCard key={i.kind} item={i} secretFields={d.secretFields[i.kind]} onSaved={() => q.refetch()} readOnly={user?.platformRole !== 'SUPER_ADMIN'} />)}
            <Card>
              <CardHeader><CardTitle>Per-workspace integrations</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>WhatsApp Business (Meta Cloud API) and Zoom are connected by each creator in their own workspace settings, so messages and meetings use the creator's accounts.</p>
                <p>Video transcoding (Mux / Cloudflare Stream) and S3 object storage are configured with environment variables – see docs/PROVIDERS.md.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </QueryView>
    </>
  );
}
