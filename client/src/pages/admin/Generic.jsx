import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FilePlus2, RefreshCcw, ExternalLink, Eye, MessageCircle, Phone, Copy, KeyRound } from 'lucide-react';
import ResourcePage from '../../components/admin/ResourcePage';
import { Icon, StatusBadge, Avatar } from '../../components/ui';
import api, { errMsg } from '../../lib/api';
import { asset, fmtDate, money, titleCase, waLink, cn } from '../../lib/utils';
import { NotFound } from '../site/Pages';
import { useNavigate } from 'react-router-dom';

const STATUS = { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], noEmpty: true };
const SORT = { name: 'sort_order', label: 'Sort order', type: 'number' };
const ICON_HINT = 'Icon name, e.g. globe, code, smartphone, server, trending-up, landmark, pen-tool, cloud, database, rocket, shield-check, users, award, briefcase';
const thumb = (k) => (r) => r[k] ? <img src={asset(r[k])} alt="" className="h-10 w-16 rounded-lg object-cover ring-1 ring-slate-200" /> : <div className="h-10 w-16 rounded-lg bg-slate-100" />;

/* ======================================================================== Website CMS */
const CMS = {
  sliders: {
    title: 'Hero Slides',
    subtitle: 'Main banner slides on the home page',
    columns: [{ key: 'image', label: '', render: thumb('image') }, { key: 'title', label: 'Title', render: (r) => <span className="font-medium">{r.title} <span className="text-brand-600">{r.highlight}</span></span> }, { key: 'sort_order', label: 'Order' }, { key: 'status', label: 'Status' }],
    fields: [
      { name: 'badge', label: 'Badge text' }, { name: 'title', label: 'Title', required: true }, { name: 'highlight', label: 'Highlighted text (gradient)' },
      { name: 'subtitle', label: 'Subtitle', type: 'textarea', span: 2 }, { name: 'button_text', label: 'Button text' }, { name: 'button_link', label: 'Button link' },
      { name: 'button2_text', label: 'Second button text' }, { name: 'button2_link', label: 'Second button link' },
      { name: 'image', label: 'Side image (optional – an animated visual is shown if empty)', type: 'image', span: 2, folder: 'website' }, SORT, STATUS,
    ],
    defaults: { status: 'active', sort_order: 0 },
  },
  services: {
    title: 'Services',
    columns: [{ key: 'icon', label: '', render: (r) => <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-600"><Icon name={r.icon} className="h-4 w-4" /></span> }, { key: 'title', label: 'Service' }, { key: 'starting_price', label: 'Price' }, { key: 'sort_order', label: 'Order' }, { key: 'status', label: 'Status' }],
    fields: [
      { name: 'title', label: 'Title', required: true }, { name: 'slug', label: 'URL slug', hint: 'Auto-generated if empty' },
      { name: 'icon', label: 'Icon', hint: ICON_HINT }, { name: 'starting_price', label: 'Starting price', placeholder: '₹ 9,999' },
      { name: 'short_description', label: 'Short description', type: 'textarea', span: 2, rows: 2 },
      { name: 'description', label: 'Full description', type: 'rich', span: 2 }, { name: 'features', label: 'Features (one per line)', type: 'lines', span: 2 },
      { name: 'image', label: 'Banner image', type: 'image', folder: 'website' },
      { name: 'meta_title', label: 'SEO title' }, { name: 'meta_description', label: 'SEO description', type: 'textarea', rows: 2 },
      { name: 'is_featured', label: 'Show on home page', type: 'switch' }, SORT, STATUS,
    ],
    defaults: { status: 'active', is_featured: 1, sort_order: 0 },
  },
  portfolio: {
    title: 'Portfolio',
    columns: [{ key: 'image', label: '', render: thumb('image') }, { key: 'title', label: 'Project' }, { key: 'category', label: 'Category' }, { key: 'client_name', label: 'Client' }, { key: 'status', label: 'Status' }],
    fields: [
      { name: 'title', label: 'Project title', required: true }, { name: 'slug', label: 'URL slug' }, { name: 'category', label: 'Category', placeholder: 'Website / Software / App' },
      { name: 'client_name', label: 'Client name' }, { name: 'technologies', label: 'Technologies', placeholder: 'React, Node.js, MySQL' }, { name: 'project_url', label: 'Live URL' },
      { name: 'completed_on', label: 'Completed on', type: 'date' }, { name: 'image', label: 'Cover image', type: 'image', folder: 'portfolio' },
      { name: 'short_description', label: 'Short description', type: 'textarea', span: 2, rows: 2 }, { name: 'description', label: 'Case study', type: 'rich', span: 2 },
      { name: 'is_featured', label: 'Feature on home page', type: 'switch' }, SORT, STATUS,
    ],
    defaults: { status: 'active', is_featured: 1, sort_order: 0 },
  },
  blog_posts: {
    title: 'Blog Posts',
    columns: [{ key: 'image', label: '', render: thumb('image') }, { key: 'title', label: 'Title', render: (r) => <span className="font-medium">{r.title}</span> }, { key: 'category', label: 'Category' }, { key: 'published_at', label: 'Published', render: (r) => fmtDate(r.published_at) }, { key: 'views', label: 'Views' }, { key: 'status', label: 'Status' }],
    fields: [
      { name: 'title', label: 'Title', required: true, span: 2 }, { name: 'slug', label: 'URL slug' }, { name: 'category', label: 'Category' },
      { name: 'author', label: 'Author' }, { name: 'published_at', label: 'Publish date', type: 'date' }, { name: 'tags', label: 'Tags (comma separated)', span: 2 },
      { name: 'excerpt', label: 'Excerpt', type: 'textarea', span: 2, rows: 2 }, { name: 'content', label: 'Content', type: 'rich', span: 2 },
      { name: 'image', label: 'Featured image', type: 'image', folder: 'blog' }, { name: 'meta_title', label: 'SEO title' }, { name: 'meta_description', label: 'SEO description', type: 'textarea', rows: 2 },
      { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft'], noEmpty: true },
    ],
    defaults: { status: 'published', published_at: new Date().toISOString().slice(0, 10) },
    filters: [{ name: 'status', label: 'Status', options: ['published', 'draft'] }],
  },
  testimonials: {
    title: 'Testimonials',
    columns: [{ key: 'name', label: 'Name', render: (r) => <div className="flex items-center gap-3"><Avatar src={r.photo} name={r.name} /><div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.company}</p></div></div> }, { key: 'rating', label: 'Rating', render: (r) => '★'.repeat(r.rating || 5) }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'designation', label: 'Designation' }, { name: 'company', label: 'Company' }, { name: 'rating', label: 'Rating', type: 'select', options: [5, 4, 3].map((v) => ({ value: v, label: `${v} stars` })), noEmpty: true }, { name: 'message', label: 'Testimonial', type: 'textarea', span: 2, required: true }, { name: 'photo', label: 'Photo', type: 'image', folder: 'website', aspect: 'aspect-square' }, SORT, STATUS],
    defaults: { status: 'active', rating: 5, sort_order: 0 },
  },
  team_members: {
    title: 'Team Members',
    columns: [{ key: 'name', label: 'Name', render: (r) => <div className="flex items-center gap-3"><Avatar src={r.photo} name={r.name} /><span className="font-medium">{r.name}</span></div> }, { key: 'designation', label: 'Designation' }, { key: 'sort_order', label: 'Order' }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'designation', label: 'Designation' }, { name: 'email', label: 'Email' }, { name: 'linkedin', label: 'LinkedIn URL' }, { name: 'twitter', label: 'Twitter / X URL' }, { name: 'bio', label: 'Short bio', type: 'textarea', span: 2 }, { name: 'photo', label: 'Photo', type: 'image', folder: 'team', aspect: 'aspect-square' }, SORT, STATUS],
    defaults: { status: 'active', sort_order: 0 },
  },
  partners: {
    title: 'Client Logos',
    subtitle: 'Logos shown in the “Trusted by” strip on the home page',
    columns: [{ key: 'logo', label: '', render: thumb('logo') }, { key: 'name', label: 'Name' }, { key: 'website', label: 'Website' }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'website', label: 'Website' }, { name: 'logo', label: 'Logo', type: 'image', folder: 'website' }, SORT, STATUS],
    defaults: { status: 'active', sort_order: 0 },
  },
  technologies: {
    title: 'Technologies',
    columns: [{ key: 'logo', label: '', render: thumb('logo') }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category' }, { name: 'logo', label: 'Logo', type: 'image', folder: 'website' }, SORT, STATUS],
    defaults: { status: 'active', sort_order: 0 },
  },
  stats: {
    title: 'Counters',
    subtitle: 'Animated numbers shown on the home & about pages',
    columns: [{ key: 'label', label: 'Label' }, { key: 'value', label: 'Value', render: (r) => `${r.value}${r.suffix || ''}` }, { key: 'icon', label: 'Icon' }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'label', label: 'Label', required: true }, { name: 'value', label: 'Number', type: 'number', required: true }, { name: 'suffix', label: 'Suffix', placeholder: '+' }, { name: 'icon', label: 'Icon', hint: ICON_HINT }, SORT, STATUS],
    defaults: { status: 'active', sort_order: 0, suffix: '+' },
  },
  pricing_plans: {
    title: 'Pricing Plans',
    columns: [{ key: 'name', label: 'Plan' }, { key: 'price', label: 'Price' }, { key: 'period', label: 'Period' }, { key: 'is_highlighted', label: 'Popular', render: (r) => (Number(r.is_highlighted) ? '⭐' : '') }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'name', label: 'Plan name', required: true }, { name: 'price', label: 'Price', placeholder: '₹9,999' }, { name: 'period', label: 'Period', placeholder: 'one time / month / year' }, { name: 'button_text', label: 'Button text' }, { name: 'description', label: 'Description', span: 2 }, { name: 'features', label: 'Features (one per line)', type: 'lines', span: 2 }, { name: 'is_highlighted', label: 'Mark as most popular', type: 'switch' }, SORT, STATUS],
    defaults: { status: 'active', sort_order: 0, button_text: 'Get Started' },
  },
  faqs: {
    title: 'FAQs',
    columns: [{ key: 'question', label: 'Question', render: (r) => <span className="whitespace-normal">{r.question}</span> }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'question', label: 'Question', required: true, span: 2 }, { name: 'answer', label: 'Answer', type: 'textarea', span: 2, required: true }, { name: 'category', label: 'Category' }, SORT, STATUS],
    defaults: { status: 'active', sort_order: 0 },
  },
  pages: {
    title: 'Pages',
    subtitle: 'Privacy policy, terms and other static pages (shown in the footer)',
    columns: [{ key: 'title', label: 'Title' }, { key: 'slug', label: 'URL', render: (r) => <a href={`/page/${r.slug}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">/page/{r.slug}</a> }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'title', label: 'Title', required: true }, { name: 'slug', label: 'URL slug' }, { name: 'content', label: 'Content', type: 'rich', span: 2 }, { name: 'meta_title', label: 'SEO title' }, { name: 'meta_description', label: 'SEO description' }, { name: 'show_in_footer', label: 'Show link in footer', type: 'switch' }, STATUS],
    defaults: { status: 'active', show_in_footer: 1 },
  },
  subscribers: {
    title: 'Subscribers',
    columns: [{ key: 'email', label: 'Email' }, { key: 'created_at', label: 'Subscribed', render: (r) => fmtDate(r.created_at) }, { key: 'status', label: 'Status' }],
    fields: [{ name: 'email', label: 'Email', required: true }, { name: 'status', label: 'Status', type: 'select', options: ['active', 'unsubscribed'], noEmpty: true }],
    defaults: { status: 'active' },
  },
};

export function CmsResource() {
  const { resource } = useParams();
  const cfg = CMS[resource];
  if (!cfg) return <NotFound />;
  return <ResourcePage key={resource} resource={resource} {...cfg} />;
}

/* ======================================================================== Billing helpers */
const CLIENT_FIELDS = [
  { name: 'name', label: 'Client / Company name', required: true, span: 2 }, { name: 'contact_person', label: 'Contact person' }, { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone' }, { name: 'whatsapp', label: 'WhatsApp number' }, { name: 'gstin', label: 'GSTIN' }, { name: 'website', label: 'Website' },
  { name: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 }, { name: 'city', label: 'City' }, { name: 'state', label: 'State' }, { name: 'pincode', label: 'PIN code' }, STATUS,
  { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
];

export function Clients() {
  const navigate = useNavigate();
  return (
    <ResourcePage
      resource="clients"
      title="Clients"
      subtitle="Customers you bill – used in quotations, invoices and server renewals"
      columns={[
        { key: 'name', label: 'Client', render: (r) => <div><p className="font-medium text-navy-900">{r.name}</p><p className="text-xs text-slate-500">{r.contact_person}</p></div> },
        { key: 'phone', label: 'Contact', render: (r) => <div className="text-xs"><p>{r.phone}</p><p className="text-slate-500">{r.email}</p></div> },
        { key: 'city', label: 'City' },
        { key: 'billed', label: 'Billed', render: (r) => money(r.billed, 0) },
        { key: 'outstanding', label: 'Outstanding', render: (r) => <span className={Number(r.outstanding) > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{money(r.outstanding, 0)}</span> },
        { key: 'status', label: 'Status' },
      ]}
      fields={CLIENT_FIELDS}
      defaults={{ status: 'active', state: 'Chhattisgarh' }}
      createLabel="Add client"
      rowActions={(r) => (
        <>
          <button className="btn-ghost btn-sm" title="New invoice" onClick={() => navigate(`/admin/invoices/new?client=${r.id}`)}>
            <FilePlus2 className="h-4 w-4" /> Invoice
          </button>
          {(r.whatsapp || r.phone) && (
            <a className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" href={waLink(r.whatsapp || r.phone)} target="_blank" rel="noreferrer" title="WhatsApp">
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </>
      )}
    />
  );
}

export function BillingItems() {
  return (
    <ResourcePage
      resource="billing_items"
      title="Items Catalogue"
      subtitle="Saved products & services for quick invoice entry"
      columns={[{ key: 'name', label: 'Item' }, { key: 'hsn_sac', label: 'HSN/SAC' }, { key: 'rate', label: 'Rate', render: (r) => money(r.rate) }, { key: 'tax_rate', label: 'GST', render: (r) => `${Number(r.tax_rate)}%` }, { key: 'unit', label: 'Unit' }, { key: 'status', label: 'Status' }]}
      fields={[{ name: 'name', label: 'Name', required: true, span: 2 }, { name: 'description', label: 'Description', type: 'textarea', span: 2, rows: 2 }, { name: 'hsn_sac', label: 'HSN / SAC code' }, { name: 'unit', label: 'Unit' }, { name: 'rate', label: 'Rate (₹)', type: 'number' }, { name: 'tax_rate', label: 'GST %', type: 'select', options: [0, 5, 12, 18, 28].map((v) => ({ value: v, label: `${v}%` })), noEmpty: true }, STATUS]}
      defaults={{ status: 'active', unit: 'Nos', tax_rate: 18 }}
      createLabel="Add item"
    />
  );
}

const SERVER_TYPES = ['shared_hosting', 'vps', 'dedicated', 'cloud', 'domain', 'ssl', 'email', 'amc', 'other'];
export function Servers() {
  const navigate = useNavigate();
  const renewInvoice = async (r) => {
    try {
      const { data } = await api.post(`/billing/servers/${r.id}/renew-invoice`);
      toast.success(`Invoice ${data.invoice_no} created`);
      navigate(`/admin/invoices/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const markRenewed = async (r, reload) => {
    try {
      const { data } = await api.post(`/billing/servers/${r.id}/mark-renewed`);
      toast.success(`Renewed till ${fmtDate(data.expiry_date)}`);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <ResourcePage
      resource="client_servers"
      title="Servers & Domains"
      subtitle="Hosting, VPS, domains, SSL & AMC of your clients – with automatic renewal reminders"
      columns={[
        { key: 'name', label: 'Service', render: (r) => <div><p className="font-medium text-navy-900">{r.name}</p><p className="text-xs text-slate-500">{r.domain || r.ip_address}</p></div> },
        { key: 'client_name', label: 'Client' },
        { key: 'type', label: 'Type', render: (r) => titleCase(r.type) },
        { key: 'provider', label: 'Provider' },
        { key: 'expiry_date', label: 'Expiry', render: (r) => <div><p>{fmtDate(r.expiry_date)}</p>{r.days_left !== null && r.days_left !== undefined && <p className={cn('text-xs font-semibold', r.days_left < 0 ? 'text-red-600' : r.days_left <= 30 ? 'text-amber-600' : 'text-emerald-600')}>{r.days_left < 0 ? `Expired ${-r.days_left}d ago` : `${r.days_left} days left`}</p>}</div> },
        { key: 'renewal_amount', label: 'Renewal', render: (r) => money(r.renewal_amount, 0) },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'client_id', label: 'Client', type: 'select', optionsFrom: { url: '/admin/clients', label: 'name' }, required: true },
        { name: 'name', label: 'Service name', required: true, placeholder: 'Business Hosting' },
        { name: 'type', label: 'Type', type: 'select', options: SERVER_TYPES, noEmpty: true }, { name: 'provider', label: 'Provider', placeholder: 'Hostinger / AWS / GoDaddy' },
        { name: 'domain', label: 'Domain' }, { name: 'ip_address', label: 'IP address' }, { name: 'plan', label: 'Plan' }, { name: 'panel_url', label: 'Control panel URL' },
        { name: 'username', label: 'Username' }, { name: 'password', label: 'Password' },
        { name: 'start_date', label: 'Start date', type: 'date' }, { name: 'expiry_date', label: 'Expiry date', type: 'date' },
        { name: 'billing_cycle', label: 'Billing cycle', type: 'select', options: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'biennial', 'one_time'], noEmpty: true },
        { name: 'renewal_amount', label: 'Renewal amount (₹)', type: 'number' }, { name: 'cost_price', label: 'Our cost (₹)', type: 'number' },
        { name: 'tax_rate', label: 'GST %', type: 'number' }, { name: 'auto_reminder', label: 'Send renewal reminders', type: 'switch' },
        { name: 'status', label: 'Status', type: 'select', options: ['active', 'suspended', 'expired', 'cancelled'], noEmpty: true },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
      ]}
      defaults={{ type: 'shared_hosting', billing_cycle: 'yearly', status: 'active', auto_reminder: 1, tax_rate: 18 }}
      filters={[{ name: 'type', label: 'Type', options: SERVER_TYPES }, { name: 'status', label: 'Status', options: ['active', 'suspended', 'expired', 'cancelled'] }]}
      createLabel="Add service"
      rowActions={(r, reload) => (
        <>
          <button className="btn-ghost btn-sm" onClick={() => renewInvoice(r)} title="Generate renewal invoice">
            <FilePlus2 className="h-4 w-4" /> Bill
          </button>
          <button className="btn-ghost btn-sm" onClick={() => markRenewed(r, reload)} title="Extend expiry by one billing cycle">
            <RefreshCcw className="h-4 w-4" /> Renewed
          </button>
          {r.password && (
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Copy password" onClick={() => navigator.clipboard.writeText(r.password).then(() => toast.success('Password copied'))}>
              <KeyRound className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    />
  );
}

export function Expenses() {
  return (
    <ResourcePage
      resource="expenses"
      title="Expenses"
      columns={[{ key: 'expense_date', label: 'Date', render: (r) => fmtDate(r.expense_date) }, { key: 'title', label: 'Expense' }, { key: 'category', label: 'Category' }, { key: 'vendor', label: 'Vendor' }, { key: 'mode', label: 'Mode' }, { key: 'amount', label: 'Amount', render: (r) => <b>{money(r.amount)}</b> }, { key: 'receipt', label: '', render: (r) => r.receipt && <a href={asset(r.receipt)} target="_blank" rel="noreferrer" className="text-brand-700"><Eye className="h-4 w-4" /></a> }]}
      fields={[{ name: 'title', label: 'Title', required: true, span: 2 }, { name: 'category', label: 'Category', type: 'select', options: ['Rent', 'Salary', 'Hosting & Domains', 'Software', 'Marketing', 'Travel', 'Office', 'Utilities', 'Hardware', 'Other'] }, { name: 'amount', label: 'Amount (₹)', type: 'number', required: true }, { name: 'expense_date', label: 'Date', type: 'date', required: true }, { name: 'mode', label: 'Payment mode', type: 'select', options: ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'] }, { name: 'vendor', label: 'Vendor' }, { name: 'receipt', label: 'Receipt / Bill', type: 'file', folder: 'receipts' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 }]}
      defaults={{ expense_date: new Date().toISOString().slice(0, 10) }}
      createLabel="Add expense"
    />
  );
}

export function Enquiries() {
  const navigate = useNavigate();
  const convert = async (r) => {
    try {
      const { data } = await api.post('/admin/clients', { name: r.company || r.name, contact_person: r.name, email: r.email, phone: r.phone, whatsapp: r.phone, status: 'active' });
      await api.put(`/admin/enquiries/${r.id}`, { status: 'converted' });
      toast.success('Client created');
      navigate(`/admin/quotations/new?client=${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <ResourcePage
      resource="enquiries"
      title="Leads & Enquiries"
      subtitle="Contact and quote requests from the website"
      columns={[
        { key: 'created_at', label: 'Date', render: (r) => fmtDate(r.created_at) },
        { key: 'name', label: 'Name', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.company}</p></div> },
        { key: 'phone', label: 'Contact', render: (r) => <div className="text-xs"><p>{r.phone}</p><p className="text-slate-500">{r.email}</p></div> },
        { key: 'service', label: 'Service' },
        { key: 'source', label: 'Source', render: (r) => titleCase(r.source) },
        { key: 'status', label: 'Status' },
      ]}
      fields={[{ name: 'name', label: 'Name', required: true }, { name: 'company', label: 'Company' }, { name: 'email', label: 'Email' }, { name: 'phone', label: 'Phone' }, { name: 'service', label: 'Service' }, { name: 'budget', label: 'Budget' }, { name: 'message', label: 'Message', type: 'textarea', span: 2 }, { name: 'status', label: 'Status', type: 'select', options: ['new', 'contacted', 'qualified', 'converted', 'closed'], noEmpty: true }, { name: 'source', label: 'Source', type: 'select', options: ['contact', 'quote', 'phone', 'walk_in', 'referral', 'other'] }, { name: 'notes', label: 'Internal notes', type: 'textarea', span: 2 }]}
      defaults={{ status: 'new', source: 'phone' }}
      filters={[{ name: 'status', label: 'Status', options: ['new', 'contacted', 'qualified', 'converted', 'closed'] }]}
      createLabel="Add lead"
      rowActions={(r) => (
        <>
          {r.phone && <a className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" href={waLink(r.phone, `Hello ${r.name}, thank you for contacting us.`)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>}
          {r.phone && <a className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" href={`tel:${r.phone}`}><Phone className="h-4 w-4" /></a>}
          {r.status !== 'converted' && <button className="btn-ghost btn-sm" onClick={() => convert(r)}>→ Client</button>}
        </>
      )}
    />
  );
}

/* ======================================================================== HR masters */
export function Departments() {
  return <ResourcePage resource="departments" title="Departments" columns={[{ key: 'name', label: 'Department' }, { key: 'description', label: 'Description' }, { key: 'employee_count', label: 'Employees' }, { key: 'status', label: 'Status' }]} fields={[{ name: 'name', label: 'Name', required: true }, STATUS, { name: 'description', label: 'Description', span: 2 }]} defaults={{ status: 'active' }} modalSize="max-w-xl" />;
}
export function Designations() {
  return <ResourcePage resource="designations" title="Designations" columns={[{ key: 'name', label: 'Designation' }, { key: 'department_name', label: 'Department' }, { key: 'status', label: 'Status' }]} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'department_id', label: 'Department', type: 'select', optionsFrom: { url: '/admin/departments' } }, STATUS]} defaults={{ status: 'active' }} modalSize="max-w-xl" />;
}
export function Holidays() {
  return <ResourcePage resource="holidays" title="Holidays" columns={[{ key: 'date', label: 'Date', render: (r) => fmtDate(r.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }, { key: 'title', label: 'Holiday' }, { key: 'type', label: 'Type', render: (r) => titleCase(r.type) }]} fields={[{ name: 'title', label: 'Title', required: true }, { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['public', 'optional', 'company'], noEmpty: true }]} defaults={{ type: 'public' }} modalSize="max-w-xl" limit={50} />;
}
export function LeaveTypes() {
  return <ResourcePage resource="leave_types" title="Leave Types" columns={[{ key: 'name', label: 'Leave type', render: (r) => <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} />{r.name}</span> }, { key: 'days_per_year', label: 'Days / year' }, { key: 'is_paid', label: 'Paid', render: (r) => (Number(r.is_paid) ? 'Yes' : 'No') }, { key: 'status', label: 'Status' }]} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'days_per_year', label: 'Days per year', type: 'number' }, { name: 'is_paid', label: 'Paid leave', type: 'switch' }, { name: 'color', label: 'Colour', type: 'color' }, STATUS]} defaults={{ status: 'active', is_paid: 1, days_per_year: 12, color: '#1d6fb8' }} modalSize="max-w-xl" />;
}
export function Announcements() {
  return <ResourcePage resource="announcements" title="Announcements" subtitle="Shown on every employee’s dashboard" columns={[{ key: 'title', label: 'Title' }, { key: 'priority', label: 'Priority', render: (r) => <StatusBadge status={r.priority} /> }, { key: 'created_at', label: 'Posted', render: (r) => fmtDate(r.created_at) }, { key: 'status', label: 'Status' }]} fields={[{ name: 'title', label: 'Title', required: true, span: 2 }, { name: 'message', label: 'Message', type: 'textarea', span: 2, required: true }, { name: 'priority', label: 'Priority', type: 'select', options: ['normal', 'important'], noEmpty: true }, STATUS]} defaults={{ status: 'active', priority: 'normal' }} />;
}
export function Projects() {
  return (
    <ResourcePage
      resource="projects"
      title="Projects"
      columns={[
        { key: 'name', label: 'Project', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.client_name}</p></div> },
        { key: 'deadline', label: 'Deadline', render: (r) => fmtDate(r.deadline) },
        { key: 'progress', label: 'Tasks', render: (r) => { const pct = r.task_count ? Math.round((r.done_count / r.task_count) * 100) : 0; return <div className="w-32"><div className="flex justify-between text-xs"><span>{r.done_count}/{r.task_count}</span><span>{pct}%</span></div><div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div></div>; } },
        { key: 'status', label: 'Status' },
      ]}
      fields={[{ name: 'name', label: 'Project name', required: true, span: 2 }, { name: 'client_id', label: 'Client', type: 'select', optionsFrom: { url: '/admin/clients' } }, { name: 'status', label: 'Status', type: 'select', options: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'], noEmpty: true }, { name: 'start_date', label: 'Start date', type: 'date' }, { name: 'deadline', label: 'Deadline', type: 'date' }, { name: 'budget', label: 'Budget (₹)', type: 'number' }, { name: 'description', label: 'Description', type: 'textarea', span: 2 }]}
      defaults={{ status: 'in_progress' }}
      filters={[{ name: 'status', label: 'Status', options: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'] }]}
      rowActions={(r) => <><Link to={`/admin/projects/${r.id}`} className="btn-ghost btn-sm">Open</Link><Link to={`/admin/tasks?project=${r.id}`} className="btn-ghost btn-sm">Tasks</Link></>}
    />
  );
}

const JOB_TYPES = ['full_time', 'part_time', 'internship', 'contract', 'remote'];
export function Jobs() {
  return (
    <ResourcePage
      resource="job_openings"
      title="Job Openings"
      subtitle="Published on the Careers page of the website"
      columns={[
        { key: 'title', label: 'Position', render: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-slate-500">{r.department} · {r.location}</p></div> },
        { key: 'job_type', label: 'Type', render: (r) => titleCase(r.job_type) },
        { key: 'openings', label: 'Openings' },
        { key: 'applications', label: 'Applicants', render: (r) => <Link onClick={(e) => e.stopPropagation()} to={`/admin/applications?job=${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.applications}</Link> },
        { key: 'last_date', label: 'Last date', render: (r) => fmtDate(r.last_date) },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'title', label: 'Job title', required: true }, { name: 'slug', label: 'URL slug' }, { name: 'department', label: 'Department' }, { name: 'location', label: 'Location' },
        { name: 'job_type', label: 'Type', type: 'select', options: JOB_TYPES, noEmpty: true }, { name: 'experience', label: 'Experience' }, { name: 'salary_range', label: 'Salary / Stipend' },
        { name: 'openings', label: 'Openings', type: 'number' }, { name: 'last_date', label: 'Last date', type: 'date' }, { name: 'status', label: 'Status', type: 'select', options: ['open', 'closed', 'draft'], noEmpty: true },
        { name: 'short_description', label: 'Short description', type: 'textarea', span: 2, rows: 2 }, { name: 'description', label: 'Job description', type: 'rich', span: 2 }, { name: 'requirements', label: 'Requirements', type: 'rich', span: 2 },
      ]}
      defaults={{ job_type: 'full_time', status: 'open', openings: 1 }}
      filters={[{ name: 'status', label: 'Status', options: ['open', 'closed', 'draft'] }, { name: 'job_type', label: 'Type', options: JOB_TYPES }]}
      rowActions={(r) => <a href={`/careers/${r.slug}`} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="View on website"><ExternalLink className="h-4 w-4" /></a>}
    />
  );
}

const LETTER_TYPES = ['internship_offer', 'offer', 'appointment', 'joining', 'experience', 'relieving', 'internship_completion', 'warning', 'custom'];
const PLACEHOLDER_HELP = 'Placeholders: {{name}} {{first_name}} {{designation}} {{department}} {{joining_date}} {{start_date}} {{end_date}} {{duration}} {{stipend}} {{salary}} {{ctc}} {{probation}} {{emp_code}} {{reporting_to}} {{last_working_day}} {{location}} {{working_hours}} {{acceptance_date}} {{company}} – any other {{custom_field}} becomes an input while creating the letter.';
export function LetterTemplates() {
  return (
    <ResourcePage
      resource="letter_templates"
      title="Letter Templates"
      subtitle="Reusable templates for offer, internship, joining, experience letters and more"
      columns={[{ key: 'name', label: 'Template' }, { key: 'type', label: 'Type', render: (r) => titleCase(r.type) }, { key: 'title', label: 'Letter heading' }, { key: 'status', label: 'Status' }]}
      fields={[
        { name: 'name', label: 'Template name', required: true }, { name: 'type', label: 'Type', type: 'select', options: LETTER_TYPES, noEmpty: true },
        { name: 'title', label: 'Letter heading (printed)', required: true }, { name: 'subject', label: 'Subject line' },
        { name: 'body', label: 'Letter body', type: 'rich', span: 2, required: true, hint: PLACEHOLDER_HELP }, STATUS,
      ]}
      defaults={{ type: 'custom', status: 'active' }}
      modalSize="max-w-4xl"
    />
  );
}

