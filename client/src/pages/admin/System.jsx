import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Settings as SettingsIcon, Save, Shield, Bell, BellRing, Send, UserCircle, KeyRound, Plus, Pencil, Trash2, Mail, MessageSquare, MessageCircle } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useSite } from '../../context/SiteContext';
import { titleCase } from '../../lib/utils';
import { PageHeader, Tabs, FormField, Spinner, PageLoader, Modal, Field, StatusBadge, Pagination, useConfirm, ImageUpload } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';

const MSG_HINT = 'Placeholders: {{client_name}} {{number}} {{date}} {{due_date}} {{valid_until}} {{amount}} {{balance}} {{title}} {{company}} {{link}}';

const SECTIONS = {
  company: {
    label: 'Company',
    fields: [
      { name: 'company_name', label: 'Registered company name' }, { name: 'site_name', label: 'Brand / site name' }, { name: 'tagline', label: 'Tagline' },
      { name: 'cin', label: 'CIN' }, { name: 'gstin', label: 'GSTIN', hint: 'Invoices are titled “Tax Invoice” when GSTIN is set' }, { name: 'phone', label: 'Phone' },
      { name: 'phone2', label: 'Alternate phone' }, { name: 'email', label: 'Email' }, { name: 'whatsapp_number', label: 'WhatsApp number (with country code)', hint: 'Used for the floating WhatsApp button' },
      { name: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 }, { name: 'city', label: 'City, State' }, { name: 'working_hours', label: 'Working hours' },
      { name: 'site_url', label: 'Website URL', hint: 'Used in emails & links, e.g. https://yjtechnosoft.com' },
    ],
  },
  branding: {
    label: 'Branding & Social',
    fields: [
      { name: 'logo', label: 'Logo', type: 'image', folder: 'settings' }, { name: 'logo_light', label: 'Logo for dark backgrounds (optional)', type: 'image', folder: 'settings' },
      { name: 'favicon', label: 'Favicon / app icon', type: 'image', folder: 'settings', aspect: 'aspect-square' }, { name: 'facebook', label: 'Facebook URL' },
      { name: 'instagram', label: 'Instagram URL' }, { name: 'linkedin', label: 'LinkedIn URL' }, { name: 'twitter', label: 'X / Twitter URL' }, { name: 'youtube', label: 'YouTube URL' },
    ],
  },
  website: {
    label: 'Website content',
    fields: [
      { name: 'about_title', label: 'About heading', span: 2 }, { name: 'about_text', label: 'About text', type: 'rich', span: 2 }, { name: 'about_image', label: 'About image', type: 'image', folder: 'website' },
      { name: 'footer_about', label: 'Footer description', type: 'textarea', rows: 4 }, { name: 'mission', label: 'Mission', type: 'textarea', rows: 2 }, { name: 'vision', label: 'Vision', type: 'textarea', rows: 2 },
      { name: 'cta_title', label: 'Call-to-action heading' }, { name: 'cta_text', label: 'Call-to-action text' },
      { name: 'map_embed', label: 'Google Map embed URL', span: 2, hint: 'Google Maps › Share › Embed a map › copy the src URL' },
      { name: 'meta_title', label: 'SEO title', span: 2 }, { name: 'meta_description', label: 'SEO description', type: 'textarea', span: 2, rows: 2 }, { name: 'meta_keywords', label: 'SEO keywords', span: 2 },
      { name: 'enquiry_autoreply', label: 'Auto-reply to website enquiries', type: 'switch' }, { name: 'enquiry_autoreply_text', label: 'Auto-reply message', type: 'textarea', rows: 2 },
    ],
  },
  billing: {
    label: 'Billing & Bank',
    fields: [
      { name: 'invoice_prefix', label: 'Invoice prefix', hint: 'YJ/INV → YJ/INV/2026-27/0001' }, { name: 'quotation_prefix', label: 'Quotation prefix' }, { name: 'receipt_prefix', label: 'Receipt prefix' },
      { name: 'invoice_start_number', label: 'Invoice start number', type: 'number', hint: 'To continue your existing series' }, { name: 'invoice_due_days', label: 'Default due days', type: 'number' },
      { name: 'gst_split', label: 'Show GST as CGST + SGST', type: 'switch' },
      { name: 'invoice_terms', label: 'Default invoice terms', type: 'textarea', span: 2, rows: 3 }, { name: 'quotation_terms', label: 'Default quotation terms', type: 'textarea', span: 2, rows: 4 },
      { name: 'bank_account_holder', label: 'Account holder' }, { name: 'bank_name', label: 'Bank name' }, { name: 'bank_account_number', label: 'Account number' }, { name: 'bank_ifsc', label: 'IFSC' },
      { name: 'bank_branch', label: 'Branch' }, { name: 'bank_account_type', label: 'Account type' }, { name: 'upi_id', label: 'UPI / VPA' },
      { name: 'invoice_reminders', label: 'Auto email payment reminders for overdue invoices', type: 'switch' },
    ],
  },
  documents: {
    label: 'Letterhead & Signature',
    fields: [
      { name: 'letterhead_image', label: 'Letterhead background (A4, JPG/PNG)', type: 'image', folder: 'settings', aspect: 'aspect-[0.707]', hint: 'Leave empty to use the built-in YJTECHNOSOFT letterhead' },
      { name: 'signature_image', label: 'Authorised signature (transparent PNG)', type: 'image', folder: 'settings' },
      { name: 'stamp_image', label: 'Company stamp / seal (PNG)', type: 'image', folder: 'settings', aspect: 'aspect-square' },
      { name: 'signatory_name', label: 'Signatory name' }, { name: 'signatory_designation', label: 'Signatory designation' }, { name: 'letter_prefix', label: 'HR letter reference prefix' }, { name: 'contract_prefix', label: 'Agreement number prefix', hint: 'YJ/AGR → YJ/AGR/2026-27/0001' },
      { name: 'api_public_url', label: 'Public API URL for shared PDF links', hint: 'e.g. https://yjtechnosoft.com (needed for WhatsApp document sending)' },
    ],
  },
  hr: {
    label: 'HR & Attendance',
    fields: [
      { name: 'emp_code_prefix', label: 'Employee code prefix' }, { name: 'office_start_time', label: 'Office start', type: 'time' }, { name: 'office_end_time', label: 'Office end', type: 'time' },
      { name: 'attendance_grace_minutes', label: 'Late grace (minutes)', type: 'number' }, { name: 'half_day_hours', label: 'Half-day if worked less than (hours)', type: 'number' },
      { name: 'weekly_off', label: 'Weekly off days', hint: '0=Sun … 6=Sat. Comma separated, e.g. 0 or 0,6' },
      { name: 'salary_basic_pct', label: 'Basic % of salary', type: 'number' }, { name: 'salary_hra_pct', label: 'HRA % of salary', type: 'number' },
      { name: 'payroll_missing_as_absent', label: 'Treat unmarked working days as LOP', type: 'switch' },
      { name: 'office_ip_whitelist', label: 'Restrict web check-in to office IPs', hint: 'Comma separated public IPs. Leave empty to allow anywhere. Not applied to the mobile app (use the geofence instead).', span: 2 },
      { name: 'birthday_wishes', label: 'Email birthday wishes to employees', type: 'switch' },
      {
        name: 'geofence_mode', label: 'Geofenced check-in', type: 'select', noEmpty: true, span: 2,
        options: [{ value: 'off', label: 'Off – record location only' }, { value: 'flag', label: 'Flag – allow anywhere, mark check-ins outside the geofence' }, { value: 'enforce', label: 'Enforce – block check-in outside the office / assigned project sites' }],
        hint: 'Geofences are the office location below plus every project site (Projects › Edit) the employee is a member of. Check-out is never blocked, only flagged.',
      },
      { name: 'office_latitude', label: 'Office latitude', placeholder: '22.0136', hint: 'Google Maps › right-click the office › copy the numbers' }, { name: 'office_longitude', label: 'Office longitude', placeholder: '81.2459' },
      { name: 'office_geofence_radius', label: 'Office geofence radius (metres)', type: 'number' }, { name: 'geofence_max_accuracy', label: 'Reject GPS fixes less accurate than (metres)', type: 'number', hint: 'Enforce mode only. 0 = accept any accuracy.' },
      { name: 'geofence_allow_wfh', label: 'Allow "Work from home" check-in outside the geofence', type: 'switch' },
      { name: 'attendance_selfie_required', label: 'Require a selfie to check in from the mobile app', type: 'switch' },
    ],
  },
  integrations: {
    label: 'Email / SMS / WhatsApp / Push',
    groups: [
      {
        title: 'Email (SMTP)', icon: Mail, channel: 'email',
        fields: [
          { name: 'smtp_host', label: 'SMTP host', placeholder: 'smtp.gmail.com' }, { name: 'smtp_port', label: 'Port', placeholder: '587' }, { name: 'smtp_user', label: 'Username / email' },
          { name: 'smtp_pass', label: 'Password / App password', type: 'password' }, { name: 'smtp_secure', label: 'Use SSL (port 465)', type: 'switch' },
          { name: 'mail_from_name', label: 'From name' }, { name: 'mail_from_email', label: 'From email' }, { name: 'notify_admin_emails', label: 'Admin alert emails (comma separated)', span: 2 },
          { name: 'campaign_rate_per_minute', label: 'Campaign emails per minute', type: 'number', hint: 'Bulk campaigns are sent in batches. Keep it low (10–30) on a new mail server to protect deliverability.' },
          { name: 'campaign_reply_to', label: 'Campaign reply-to email', hint: 'Replies to campaigns go here. Defaults to the company email.' },
        ],
      },
      {
        title: 'SMS', icon: MessageSquare, channel: 'sms',
        fields: [
          { name: 'sms_provider', label: 'Provider', type: 'select', noEmpty: true, options: [{ value: 'none', label: 'Disabled' }, { value: 'fast2sms', label: 'Fast2SMS' }, { value: 'msg91', label: 'MSG91 (Flow)' }, { value: 'twilio', label: 'Twilio' }, { value: 'custom', label: 'Custom HTTP API' }] },
          { name: 'sms_api_key', label: 'API key / Auth key', type: 'password' }, { name: 'sms_sender_id', label: 'Sender ID (DLT)' }, { name: 'sms_route', label: 'Route (Fast2SMS)', placeholder: 'q / dlt' },
          { name: 'sms_template_id', label: 'Template / Flow ID (MSG91)' }, { name: 'twilio_sid', label: 'Twilio Account SID' }, { name: 'twilio_token', label: 'Twilio Auth token', type: 'password' }, { name: 'twilio_from', label: 'Twilio SMS number' },
          { name: 'sms_custom_url', label: 'Custom API URL', span: 2, hint: 'Placeholders {{to}} {{to10}} {{message}} – e.g. https://sms.example.com/send?key=XXX&to={{to10}}&msg={{message}}' },
        ],
      },
      {
        title: 'WhatsApp', icon: MessageCircle, channel: 'whatsapp',
        fields: [
          { name: 'whatsapp_provider', label: 'Provider', type: 'select', noEmpty: true, options: [{ value: 'none', label: 'Disabled (click-to-chat links)' }, { value: 'meta', label: 'Meta WhatsApp Cloud API' }, { value: 'twilio', label: 'Twilio WhatsApp' }, { value: 'custom', label: 'Custom HTTP API' }] },
          { name: 'whatsapp_token', label: 'Access token (Meta)', type: 'password' }, { name: 'whatsapp_phone_id', label: 'Phone number ID (Meta)' }, { name: 'twilio_whatsapp_from', label: 'Twilio WhatsApp number', placeholder: '+14155238886' },
          { name: 'whatsapp_custom_url', label: 'Custom API URL', span: 2, hint: 'Placeholders {{to}} {{to10}} {{message}} {{file}} {{filename}}' },
          { name: 'whatsapp_admin_number', label: 'Admin WhatsApp (for alerts)' }, { name: 'enquiry_whatsapp_alert', label: 'WhatsApp me on new enquiry', type: 'switch' },
        ],
      },
      {
        title: 'Push notifications (web & mobile app)', icon: BellRing, channel: 'push',
        intro: 'Browser push works out of the box: each user turns it on from the bell menu. To reach the employee mobile app, add a Firebase service account.',
        fields: [
          {
            name: 'fcm_service_account', label: 'Firebase service account JSON (mobile app)', type: 'textarea', span: 2, rows: 4, placeholder: '{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }',
            hint: 'Firebase console › Project settings › Service accounts › Generate new private key – paste the whole file. Use the same Firebase project as the Flutter app.',
          },
          { name: 'notify_daily_reports', label: 'Notify HR when an employee submits a daily report', type: 'switch', default: 1 },
          { name: 'notify_attendance_flags', label: 'Notify HR on check-ins outside the geofence / mock location', type: 'switch', default: 1 },
        ],
      },
    ],
  },
  messages: {
    label: 'Message templates',
    fields: [
      { name: 'msg_invoice', label: 'Invoice message', type: 'textarea', span: 2, rows: 3, hint: MSG_HINT },
      { name: 'msg_quotation', label: 'Quotation message', type: 'textarea', span: 2, rows: 3 },
      { name: 'msg_receipt', label: 'Payment receipt message', type: 'textarea', span: 2, rows: 2 },
      { name: 'msg_letter', label: 'HR letter message', type: 'textarea', span: 2, rows: 2 },
      { name: 'msg_payslip', label: 'Payslip message', type: 'textarea', span: 2, rows: 2 },
      { name: 'msg_contract', label: 'Agreement message', type: 'textarea', span: 2, rows: 2 },
      { name: 'msg_vault', label: 'Vault document message', type: 'textarea', span: 2, rows: 2 },
      { name: 'server_reminders', label: 'Send server / domain renewal reminders', type: 'switch' },
      { name: 'server_reminder_days', label: 'Reminder days before expiry', placeholder: '30,15,7,3,1,0' },
      { name: 'server_reminder_whatsapp', label: 'Also send renewal reminders on WhatsApp', type: 'switch' },
    ],
  },
};

function TestBox({ channel }) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/settings/test/${channel}`, { to });
      toast.success(data.message);
      if (data.waLink) window.open(data.waLink, '_blank', 'noopener');
    } catch (e) {
      toast.error(errMsg(e), { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3">
      <input className="input" placeholder={channel === 'email' ? 'Send test email to…' : channel === 'push' ? 'Send test push to user (email or phone)…' : 'Send test to mobile…'} value={to} onChange={(e) => setTo(e.target.value)} />
      <button type="button" className="btn-outline shrink-0" onClick={test} disabled={busy || !to}>{busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Test</button>
    </div>
  );
}

export function Settings() {
  const { data, loading } = useFetch('/settings');
  const { reload: reloadSite } = useSite();
  const [tab, setTab] = useState('company');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (loading) return <PageLoader />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings', form);
      toast.success('Settings saved');
      reloadSite();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const sec = SECTIONS[tab];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" subtitle="Everything on the website, documents and integrations is controlled from here" icon={SettingsIcon} actions={<button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />} Save settings</button>} />
      <Tabs className="mb-6" tabs={Object.entries(SECTIONS).map(([k, v]) => ({ value: k, label: v.label }))} value={tab} onChange={setTab} />
      {sec.groups ? (
        <div className="space-y-6">
          {sec.groups.map((g) => (
            <div key={g.title} className="card p-6">
              <h3 className={g.intro ? 'mb-1 flex items-center gap-2 font-semibold' : 'mb-5 flex items-center gap-2 font-semibold'}><g.icon className="h-5 w-5 text-brand-600" /> {g.title}</h3>
              {g.intro && <p className="mb-5 text-sm text-slate-500">{g.intro}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                {g.fields.map((f) => <FormField key={f.name} field={f} value={form[f.name] ?? f.default} onChange={set} />)}
              </div>
              <TestBox channel={g.channel} />
              <p className="mt-2 text-xs text-slate-400">Save settings before testing.</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="card grid gap-5 p-6 sm:grid-cols-2">
          {sec.fields.map((f) => <FormField key={f.name} field={f} value={form[f.name]} onChange={set} />)}
        </div>
      )}
      <div className="mt-6 flex justify-end"><button className="btn-primary" onClick={save} disabled={saving}><Save className="h-4 w-4" /> Save settings</button></div>
    </div>
  );
}

/* ====================================================================== Users */
export function Users() {
  const { data, loading, reload } = useFetch('/auth/users');
  const { data: emps } = useFetch('/hr/employees', { all: 1 });
  const [edit, setEdit] = useState(null);
  const confirm = useConfirm();
  const save = async () => {
    try {
      if (edit.id) await api.put(`/auth/users/${edit.id}`, edit);
      else await api.post('/auth/users', edit);
      toast.success('User saved');
      setEdit(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const del = async (u) => {
    if (!(await confirm({ text: `Delete user ${u.email}?` }))) return;
    try {
      await api.delete(`/auth/users/${u.id}`);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div>
      <PageHeader title="Users & Roles" subtitle="Admin = everything · HR = people, recruitment, letters, tasks · Accounts = clients & billing · Employee = self-service portal" icon={Shield} actions={<button className="btn-primary" onClick={() => setEdit({ name: '', email: '', phone: '', role: 'employee', status: 'active', password: '', employee_id: '' })}><Plus className="h-4 w-4" /> Add user</button>} />
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'name', label: 'Name', render: (u) => <div><p className="font-medium">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
          { key: 'role', label: 'Role', render: (u) => <span className="badge bg-brand-50 text-brand-700">{titleCase(u.role)}</span> },
          { key: 'emp_code', label: 'Employee', render: (u) => u.emp_code || '—' },
          { key: 'last_login', label: 'Last login', render: (u) => (u.last_login ? new Date(u.last_login.replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never') },
          { key: 'status', label: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          { key: 'a', label: '', render: (u) => <div className="flex justify-end gap-1"><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEdit({ ...u, password: '', employee_id: u.employee_id || '' })}><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del(u)}><Trash2 className="h-4 w-4" /></button></div> },
        ]}
      />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit user' : 'Add user'} size="max-w-lg" footer={<><button className="btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label={edit.id ? 'New password (optional)' : 'Password'}><input className="input" type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{['admin', 'hr', 'accounts', 'employee'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</select></Field>
            <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            <Field label="Linked employee profile" className="sm:col-span-2" hint="Link to use attendance, leave & tasks from this login">
              <select className="input" value={edit.employee_id} onChange={(e) => setEdit({ ...edit, employee_id: e.target.value || null })}>
                <option value="">—</option>
                {emps?.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.emp_code})</option>)}
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ====================================================================== Logs */
export function Logs() {
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState('');
  const { data, loading } = useFetch('/notification-logs', { page, channel });
  return (
    <div>
      <PageHeader title="Message Logs" subtitle="Every email, SMS and WhatsApp message sent by the system" icon={Bell} />
      <Tabs className="mb-4 w-fit" tabs={['', 'email', 'sms', 'whatsapp'].map((c) => ({ value: c, label: c ? titleCase(c) : 'All' }))} value={channel} onChange={(v) => { setChannel(v); setPage(1); }} />
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'created_at', label: 'Time', render: (r) => new Date(r.created_at.replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) },
          { key: 'channel', label: 'Channel', render: (r) => titleCase(r.channel) },
          { key: 'recipient', label: 'To' },
          { key: 'subject', label: 'Subject / Message', render: (r) => <p className="max-w-md truncate">{r.subject || r.message?.replace(/<[^>]+>/g, '')}</p> },
          { key: 'ref_type', label: 'For', render: (r) => (r.ref_type ? `${titleCase(r.ref_type)} #${r.ref_id || ''}` : '—') },
          { key: 'status', label: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.error && <p className="mt-1 max-w-xs truncate text-[11px] text-red-500" title={r.error}>{r.error}</p>}</div> },
        ]}
        footer={<Pagination page={page} total={data?.total} limit={data?.limit || 30} onChange={setPage} />}
      />
    </div>
  );
}

/* ====================================================================== Profile */
export function Profile() {
  const { user, setUser } = useAuth();
  const [p, setP] = useState({ name: user.name, phone: user.phone || '', avatar: user.avatar || '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const saveProfile = async () => {
    try {
      const { data } = await api.put('/auth/profile', p);
      setUser(data);
      toast.success('Profile updated');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const savePw = async () => {
    if (pw.new_password !== pw.confirm) return toast.error('Passwords do not match');
    try {
      await api.put('/auth/password', pw);
      toast.success('Password changed');
      setPw({ current_password: '', new_password: '', confirm: '' });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My Profile" icon={UserCircle} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-4 p-6">
          <h3 className="font-semibold">Profile</h3>
          <div className="w-32"><ImageUpload value={p.avatar} onChange={(v) => setP({ ...p, avatar: v })} folder="avatars" aspect="aspect-square" /></div>
          <Field label="Name"><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={user.email} disabled /></Field>
          <Field label="Phone"><input className="input" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">Role: <b>{titleCase(user.role)}</b>{user.emp_code ? ` · Employee code ${user.emp_code}` : ''}</p>
          <button className="btn-primary" onClick={saveProfile}><Save className="h-4 w-4" /> Save profile</button>
        </div>
        <div className="card h-fit space-y-4 p-6">
          <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" /> Change password</h3>
          <Field label="Current password"><input type="password" className="input" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New password"><input type="password" className="input" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Field label="Confirm new password"><input type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <button className="btn-primary" onClick={savePw}>Update password</button>
        </div>
      </div>
    </div>
  );
}
