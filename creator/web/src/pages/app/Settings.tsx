import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { Pagination, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { UploadButton } from '@/components/app/MediaPicker';
import { useWs } from './workspace';

const STATES: [string, string][] = [['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['36', 'Telangana'], ['37', 'Andhra Pradesh']];

function useSaveWorkspace() {
  const ws = useWs();
  const qc = useQueryClient();
  return async (data: object, msg = 'Saved') => {
    try {
      await ws.patch('/workspaces/current', data);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['ws', ws.slug] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
}

function Branding() {
  const ws = useWs();
  const save = useSaveWorkspace();
  const w = ws.workspace;
  const [f, setF] = useState({ name: w.name, tagline: w.tagline ?? '', about: w.about ?? '', logoUrl: w.logoUrl ?? '', faviconUrl: w.faviconUrl ?? '', socialImageUrl: w.socialImageUrl ?? '', primaryColor: w.primaryColor, accentColor: w.accentColor, fontFamily: w.fontFamily, supportEmail: w.supportEmail ?? '', timezone: w.timezone });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save({ ...f, tagline: f.tagline || null, about: f.about || null, logoUrl: f.logoUrl || null, faviconUrl: f.faviconUrl || null, socialImageUrl: f.socialImageUrl || null, supportEmail: f.supportEmail || null });
  };
  const img = (k: 'logoUrl' | 'faviconUrl' | 'socialImageUrl', label: string) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        {f[k] && <img src={f[k]} alt="" className="h-10 w-10 rounded object-cover" />}
        <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder="https://…" />
        <UploadButton onUploaded={(a) => setF({ ...f, [k]: a.url ?? '' })} />
      </div>
    </Field>
  );
  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-4">
      <Card>
        <CardHeader><CardTitle>Business</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Tagline"><Input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
          <Field label="About"><Textarea rows={4} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Support email"><Input type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} /></Field>
            <Field label="Time zone"><Input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Brand</CardTitle><CardDescription>Used on your storefront, login, emails and certificates.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {img('logoUrl', 'Logo')}
          {img('faviconUrl', 'Favicon')}
          {img('socialImageUrl', 'Social sharing image')}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Primary colour"><Input type="color" value={f.primaryColor} onChange={(e) => setF({ ...f, primaryColor: e.target.value })} className="h-10 p-1" /></Field>
            <Field label="Accent colour"><Input type="color" value={f.accentColor} onChange={(e) => setF({ ...f, accentColor: e.target.value })} className="h-10 p-1" /></Field>
            <Field label="Font"><Select value={f.fontFamily} onChange={(e) => setF({ ...f, fontFamily: e.target.value })}>{['Inter', 'Poppins', 'Lora', 'Playfair Display', 'DM Sans', 'Space Grotesk'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          </div>
          <div className="rounded-lg border p-4" style={{ fontFamily: f.fontFamily }}>
            <p className="text-sm text-muted-foreground">Preview</p>
            <p className="text-xl font-bold" style={{ color: f.primaryColor }}>{f.name}</p>
            <button type="button" className="mt-2 rounded-md px-3 py-1.5 text-sm text-white" style={{ background: f.primaryColor }}>Buy now</button>
            <span className="ml-2 rounded-full px-2 py-0.5 text-xs text-white" style={{ background: f.accentColor }}>Bestseller</span>
          </div>
        </CardContent>
      </Card>
      <div><Button type="submit" disabled={!ws.can('workspace.manage')}>Save branding</Button></div>
    </form>
  );
}

function Tax() {
  const ws = useWs();
  const save = useSaveWorkspace();
  const w = ws.workspace;
  const [f, setF] = useState({ legalName: w.legalName ?? '', address: w.address ?? '', gstin: w.gstin ?? '', gstStateCode: w.gstStateCode ?? '', taxRate: String(w.taxRateBps / 100), pricesIncludeTax: w.pricesIncludeTax });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save({ legalName: f.legalName || null, address: f.address || null, gstin: f.gstin || null, gstStateCode: f.gstStateCode || null, taxRateBps: Math.round(Number(f.taxRate) * 100), pricesIncludeTax: f.pricesIncludeTax }, 'Tax settings saved'); }} className="max-w-2xl">
      <Card>
        <CardHeader><CardTitle>GST & invoices</CardTitle><CardDescription>GST is charged only when a GSTIN is set, and only to buyers in India. Check rates with your tax adviser.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Legal name"><Input value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></Field>
          <Field label="Registered address"><Textarea rows={3} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GSTIN"><Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" /></Field>
            <Field label="State"><Select value={f.gstStateCode} onChange={(e) => setF({ ...f, gstStateCode: e.target.value })}><option value="">From GSTIN</option>{STATES.map(([c, n]) => <option key={c} value={c}>{c} – {n}</option>)}</Select></Field>
            <Field label="GST rate (%)"><Input type="number" min={0} max={50} step="0.01" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} /></Field>
          </div>
          <Checkbox checked={f.pricesIncludeTax} onChange={(v) => setF({ ...f, pricesIncludeTax: v })} label="My prices already include GST" description="Otherwise GST is added at checkout." />
          <Button type="submit" disabled={!ws.can('workspace.manage')}>Save</Button>
        </CardContent>
      </Card>
    </form>
  );
}

const ROLES: Record<string, string> = { ADMIN: 'Admin – everything except billing', TEAM_MEMBER: 'Team member – read-only, add permissions below', INSTRUCTOR: 'Instructor – courses, workshops, sessions', MODERATOR: 'Moderator – community' };

function Team() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['team', ws.slug], queryFn: () => ws.get('/workspaces/current/team') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', name: '', role: 'TEAM_MEMBER', permissions: [] as string[] });
  const [edit, setEdit] = useState<any>(null);
  return (
    <QueryView q={q}>
      {(d) => (
        <div className="max-w-4xl space-y-4">
          <Button onClick={() => setOpen(true)}><Plus /> Invite teammate</Button>
          <Table head={['Member', 'Role', 'Extra permissions', 'Status', '']}>
            {d.members.map((m: any) => (
              <tr key={m.id}>
                <Td>{m.user.name}<span className="block text-xs text-muted-foreground">{m.user.email}</span></Td>
                <Td><div className="flex flex-wrap gap-1">{m.roles.filter((r: string) => r !== 'STUDENT' && r !== 'AFFILIATE').map((r: string) => <Badge key={r}>{r.toLowerCase().replace('_', ' ')}</Badge>)}</div></Td>
                <Td className="text-xs text-muted-foreground">{m.permissions.join(', ') || '—'}</Td>
                <Td><StatusBadge status={m.status} /></Td>
                <Td>
                  {!m.roles.includes('OWNER') && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ ...m })}>Edit</Button>
                      <ConfirmButton title={`Remove ${m.user.name}?`} description="They lose access to this dashboard immediately." onConfirm={async () => { try { await ws.del(`/workspaces/current/team/${m.id}`); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Remove</ConfirmButton>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <Modal open={open} onOpenChange={setOpen} title="Invite a teammate" description="They sign in with this email (using a one-time code if they have no password)." wide>
            <form onSubmit={async (e) => { e.preventDefault(); try { await ws.post('/workspaces/current/team', { email: f.email, name: f.name || undefined, roles: [f.role], permissions: f.permissions }); toast.success('Invitation sent'); setOpen(false); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
                <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              </div>
              <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <PermissionPicker all={d.availablePermissions} value={f.permissions} onChange={(p) => setF({ ...f, permissions: p })} />
              <div className="flex justify-end"><Button type="submit">Send invite</Button></div>
            </form>
          </Modal>
          {edit && (
            <Modal open onOpenChange={() => setEdit(null)} title={`Edit ${edit.user.name}`} wide footer={<Button onClick={async () => { try { await ws.patch(`/workspaces/current/team/${edit.id}`, { roles: edit.roles.filter((r: string) => ROLES[r]), permissions: edit.permissions, status: edit.status }); setEdit(null); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Save</Button>}>
              <div className="space-y-3">
                <Field label="Role"><Select value={edit.roles.find((r: string) => ROLES[r]) ?? 'TEAM_MEMBER'} onChange={(e) => setEdit({ ...edit, roles: [e.target.value] })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <PermissionPicker all={d.availablePermissions} value={edit.permissions} onChange={(p) => setEdit({ ...edit, permissions: p })} />
                <label className="flex items-center gap-2 text-sm"><Switch checked={edit.status === 'ACTIVE'} onChange={(v) => setEdit({ ...edit, status: v ? 'ACTIVE' : 'SUSPENDED' })} label="Active" /> Access enabled</label>
              </div>
            </Modal>
          )}
        </div>
      )}
    </QueryView>
  );
}

function PermissionPicker({ all, value, onChange }: { all: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field label="Extra permissions" hint="Added on top of the role's defaults">
      <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
        {all.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.includes(p)} onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))} />
            <code className="text-xs">{p}</code>
          </label>
        ))}
      </div>
    </Field>
  );
}

function Domains() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['domains', ws.slug], queryFn: () => ws.get('/pages/domains/all') });
  const [host, setHost] = useState('');
  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader><CardTitle>Your addresses</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Storefront: <a className="text-primary underline" href={`/s/${ws.slug}`} target="_blank" rel="noreferrer">{location.origin}/s/{ws.slug}</a></p>
          {ws.plan?.limits.customDomain === false && <p className="text-muted-foreground">Custom domains are available on higher plans.</p>}
        </CardContent>
      </Card>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { await ws.post('/pages/domains/all', { hostname: host }); setHost(''); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }}>
        <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="courses.yourdomain.com" aria-label="Domain" required />
        <Button type="submit">Add domain</Button>
      </form>
      <QueryView q={q}>
        {(d) => (
          <div className="space-y-3">
            {d.domains.map((dm: any) => (
              <Card key={dm.id}>
                <CardHeader className="flex-row items-center justify-between"><CardTitle>{dm.hostname}</CardTitle><StatusBadge status={dm.status} /></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">Add these DNS records at your domain provider, then verify. HTTPS certificates are issued automatically after verification.</p>
                  <Table head={['Type', 'Name', 'Value']}>
                    {dm.dns.map((r: any) => <tr key={r.type}><Td>{r.type}</Td><Td className="font-mono text-xs">{r.name}</Td><Td className="break-all font-mono text-xs">{r.value}</Td></tr>)}
                  </Table>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={async () => { const r = await ws.post(`/pages/domains/${dm.id}/verify`); (r.verified ? toast.success : toast.message)(r.message); q.refetch(); }}>Verify now</Button>
                    <ConfirmButton title={`Remove ${dm.hostname}?`} onConfirm={async () => { await ws.del(`/pages/domains/${dm.id}`); q.refetch(); }}>Remove</ConfirmButton>
                  </div>
                  {dm.lastCheckedAt && <p className="text-xs text-muted-foreground">Last checked {dateTime(dm.lastCheckedAt)}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function Themes() {
  const ws = useWs();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['themes', ws.slug], queryFn: () => ws.get('/pages/themes/all') });
  const [t, setT] = useState({ name: '', primaryColor: ws.workspace.primaryColor, accentColor: ws.workspace.accentColor, background: '#ffffff', surface: '#f8fafc', text: '#0f172a', font: ws.workspace.fontFamily, radius: 'md', mode: 'light' });
  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Saved themes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <QueryView q={q}>
            {(d) => (
              <>
                {d.themes.length === 0 && <p className="text-sm text-muted-foreground">No saved themes.</p>}
                {d.themes.map((th: any) => (
                  <div key={th.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span className="flex items-center gap-2"><span className="h-5 w-5 rounded-full" style={{ background: th.tokens.primaryColor }} />{th.name}{th.isActive && <Badge variant="success">active</Badge>}</span>
                    {!th.isActive && <Button size="sm" variant="outline" onClick={async () => { await ws.post(`/pages/themes/${th.id}/activate`); q.refetch(); qc.invalidateQueries({ queryKey: ['ws', ws.slug] }); toast.success('Theme applied'); }}>Apply</Button>}
                  </div>
                ))}
              </>
            )}
          </QueryView>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Create theme</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const { name, ...tokens } = t; try { await ws.post('/pages/themes/all', { name, tokens, activate: true }); q.refetch(); qc.invalidateQueries({ queryKey: ['ws', ws.slug] }); toast.success('Theme saved and applied'); } catch (err) { toast.error(errorMessage(err)); } }}>
            <Field label="Name"><Input required value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2">
              {(['primaryColor', 'accentColor', 'background', 'surface', 'text'] as const).map((k) => <Field key={k} label={k.replace('Color', '')}><Input type="color" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} className="h-9 p-1" /></Field>)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Font"><Select value={t.font} onChange={(e) => setT({ ...t, font: e.target.value })}>{['Inter', 'Poppins', 'Lora', 'Playfair Display', 'DM Sans', 'Space Grotesk'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Corners"><Select value={t.radius} onChange={(e) => setT({ ...t, radius: e.target.value })}>{['none', 'sm', 'md', 'lg', 'full'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Mode"><Select value={t.mode} onChange={(e) => setT({ ...t, mode: e.target.value })}><option value="light">Light</option><option value="dark">Dark</option></Select></Field>
            </div>
            <Button type="submit">Save & apply</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Integrations() {
  const ws = useWs();
  const zoom = useQuery({ queryKey: ['zoom', ws.slug], queryFn: () => ws.get('/workshops/integrations/zoom') });
  const [z, setZ] = useState({ accountId: '', clientId: '', clientSecret: '', enabled: true });
  useEffect(() => {
    if (zoom.data) setZ((x) => ({ ...x, accountId: String(zoom.data.config.accountId ?? ''), clientId: String(zoom.data.config.clientId ?? ''), enabled: zoom.data.enabled || !zoom.data.configured }));
  }, [zoom.data]);
  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader><CardTitle>Zoom</CardTitle><CardDescription>Create a Server-to-Server OAuth app in the Zoom App Marketplace (scope: meeting:write) and paste its credentials. Status: {zoom.data?.configured ? 'connected' : 'not connected'}.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Account ID"><Input value={z.accountId} onChange={(e) => setZ({ ...z, accountId: e.target.value })} /></Field>
          <Field label="Client ID"><Input value={z.clientId} onChange={(e) => setZ({ ...z, clientId: e.target.value })} /></Field>
          <Field label="Client secret" hint={zoom.data?.secretsSet?.clientSecret ? 'Saved. Leave blank to keep it.' : undefined}><Input type="password" autoComplete="off" value={z.clientSecret} onChange={(e) => setZ({ ...z, clientSecret: e.target.value })} /></Field>
          <Button onClick={async () => { try { await ws.put('/workshops/integrations/zoom', { ...z, clientSecret: z.clientSecret || undefined }); toast.success('Zoom saved'); zoom.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Save</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>WhatsApp</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Connect your WhatsApp Business number under Email & WhatsApp › WhatsApp.</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Payments are collected by the platform through Razorpay (India) and Stripe (international) and paid out to you from Earnings & payouts.</CardContent>
      </Card>
    </div>
  );
}

function Security() {
  const ws = useWs();
  const grants = useQuery({ queryKey: ['support-grants', ws.slug], queryFn: () => ws.get('/workspaces/current/support-access') });
  const [page, setPage] = useState(1);
  const logs = useQuery({ queryKey: ['audit', ws.slug, page], queryFn: () => ws.get(`/workspaces/current/audit-logs?page=${page}`), enabled: ws.can('audit.read') });
  const [hours, setHours] = useState('4');
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-6">
      {ws.roles.includes('OWNER') && (
        <Card className="max-w-2xl">
          <CardHeader><CardTitle>Support access</CardTitle><CardDescription>Platform support can only view your workspace after you grant time-limited, read-only access here.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Hours"><Input type="number" min={1} max={72} value={hours} onChange={(e) => setHours(e.target.value)} className="w-24" /></Field>
              <Field label="Reason / ticket" className="flex-1"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <Button onClick={async () => { try { await ws.post('/workspaces/current/support-access', { hours: Number(hours), reason: reason || undefined }); grants.refetch(); toast.success('Support access granted'); } catch (e) { toast.error(errorMessage(e)); } }}>Grant</Button>
            </div>
            {grants.data?.grants.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <span>Until {dateTime(g.expiresAt)} · {g.reason ?? 'no reason'}{g.revokedAt && ' (revoked)'}</span>
                {!g.revokedAt && new Date(g.expiresAt) > new Date() && <Button size="sm" variant="outline" onClick={async () => { await ws.del(`/workspaces/current/support-access/${g.id}`); grants.refetch(); }}>Revoke</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {ws.can('audit.read') && (
        <Card>
          <CardHeader><CardTitle>Audit log</CardTitle></CardHeader>
          <CardContent>
            <QueryView q={logs}>
              {(d) => (
                <>
                  <Table head={['When', 'Action', 'Entity', 'IP']} empty={!d.items.length}>
                    {d.items.map((l: any) => <tr key={l.id}><Td className="whitespace-nowrap text-muted-foreground">{dateTime(l.createdAt)}</Td><Td><code className="text-xs">{l.action}</code></Td><Td className="text-xs">{l.entityType} {l.entityId?.slice(0, 8)}</Td><Td className="text-xs">{l.ip}</Td></tr>)}
                  </Table>
                  <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
                </>
              )}
            </QueryView>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Settings() {
  const ws = useWs();
  const [tab, setTab] = useState('branding');
  const tabs = [
    { value: 'branding', label: 'Brand', show: true },
    { value: 'tax', label: 'Tax & invoices', show: ws.can('workspace.manage') },
    { value: 'team', label: 'Team', show: ws.can('team.manage') },
    { value: 'domains', label: 'Domains', show: ws.can('workspace.manage') },
    { value: 'themes', label: 'Themes', show: ws.can('pages.write') },
    { value: 'integrations', label: 'Integrations', show: ws.can('workspace.manage') },
    { value: 'security', label: 'Security & audit', show: ws.can('audit.read') || ws.roles.includes('OWNER') },
  ].filter((t) => t.show);
  return (
    <>
      <PageHeader title="Settings" description={`Plan: ${ws.plan?.name ?? '—'} · platform fee ${(ws.plan?.platformFeeBps ?? 0) / 100}%`} />
      <Tabs value={tab} onValueChange={setTab} tabs={tabs}>
        <TabPanel value="branding"><Branding /></TabPanel>
        <TabPanel value="tax"><Tax /></TabPanel>
        <TabPanel value="team"><Team /></TabPanel>
        <TabPanel value="domains"><Domains /></TabPanel>
        <TabPanel value="themes"><Themes /></TabPanel>
        <TabPanel value="integrations"><Integrations /></TabPanel>
        <TabPanel value="security"><Security /></TabPanel>
      </Tabs>
    </>
  );
}
