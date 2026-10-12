/**
 * Declarative configuration for every "simple" admin-managed table.
 * The generic CRUD router (crud.js) exposes:
 *   GET    /api/admin/:resource          list (search, filters, pagination)
 *   GET    /api/admin/:resource/:id      single
 *   POST   /api/admin/:resource          create
 *   PUT    /api/admin/:resource/:id      update
 *   DELETE /api/admin/:resource/:id      delete
 *
 * roles      – roles allowed to write (admin is always allowed)
 * readRoles  – roles allowed to read (defaults to roles); 'all' = any logged-in user
 */
const CMS = ['admin'];
const ACCOUNTS = ['accounts'];
const HR = ['hr'];

const resources = {
  // ----------------------------------------------------------- Website CMS
  sliders: {
    table: 'sliders',
    fields: ['badge', 'title', 'highlight', 'subtitle', 'image', 'button_text', 'button_link', 'button2_text', 'button2_link', 'sort_order', 'status'],
    search: ['title'],
    order: 'sort_order ASC, id DESC',
    roles: CMS,
  },
  services: {
    table: 'services',
    fields: ['title', 'slug', 'icon', 'short_description', 'description', 'image', 'features', 'starting_price', 'meta_title', 'meta_description', 'sort_order', 'is_featured', 'status'],
    search: ['title', 'short_description'],
    slugFrom: 'title',
    order: 'sort_order ASC, id DESC',
    roles: CMS,
  },
  portfolio: {
    table: 'portfolio',
    fields: ['title', 'slug', 'category', 'client_name', 'image', 'short_description', 'description', 'technologies', 'project_url', 'completed_on', 'sort_order', 'is_featured', 'status'],
    search: ['title', 'category', 'client_name'],
    slugFrom: 'title',
    order: 'sort_order ASC, id DESC',
    roles: CMS,
  },
  testimonials: {
    table: 'testimonials',
    fields: ['name', 'designation', 'company', 'photo', 'message', 'rating', 'sort_order', 'status'],
    search: ['name', 'company'],
    order: 'sort_order ASC, id DESC',
    roles: CMS,
  },
  team_members: {
    table: 'team_members',
    fields: ['name', 'designation', 'photo', 'bio', 'linkedin', 'twitter', 'email', 'sort_order', 'status'],
    search: ['name', 'designation'],
    order: 'sort_order ASC, id ASC',
    roles: CMS,
  },
  partners: {
    table: 'partners',
    fields: ['name', 'logo', 'website', 'sort_order', 'status'],
    search: ['name'],
    order: 'sort_order ASC, id DESC',
    roles: CMS,
  },
  technologies: {
    table: 'technologies',
    fields: ['name', 'category', 'logo', 'sort_order', 'status'],
    search: ['name', 'category'],
    order: 'sort_order ASC, id ASC',
    roles: CMS,
  },
  stats: {
    table: 'stats',
    fields: ['label', 'value', 'suffix', 'icon', 'sort_order', 'status'],
    search: ['label'],
    order: 'sort_order ASC, id ASC',
    roles: CMS,
  },
  pricing_plans: {
    table: 'pricing_plans',
    fields: ['name', 'price', 'period', 'description', 'features', 'is_highlighted', 'button_text', 'sort_order', 'status'],
    search: ['name'],
    order: 'sort_order ASC, id ASC',
    roles: CMS,
  },
  faqs: {
    table: 'faqs',
    fields: ['question', 'answer', 'category', 'sort_order', 'status'],
    search: ['question'],
    order: 'sort_order ASC, id ASC',
    roles: CMS,
  },
  blog_posts: {
    table: 'blog_posts',
    fields: ['title', 'slug', 'excerpt', 'content', 'image', 'category', 'tags', 'author', 'meta_title', 'meta_description', 'published_at', 'status'],
    search: ['title', 'category', 'tags'],
    slugFrom: 'title',
    order: 'published_at DESC, id DESC',
    roles: CMS,
  },
  pages: {
    table: 'pages',
    fields: ['title', 'slug', 'content', 'meta_title', 'meta_description', 'show_in_footer', 'status'],
    search: ['title'],
    slugFrom: 'title',
    order: 'id ASC',
    roles: CMS,
  },
  enquiries: {
    table: 'enquiries',
    fields: ['name', 'email', 'phone', 'company', 'service', 'budget', 'subject', 'message', 'source', 'status', 'notes'],
    search: ['name', 'email', 'phone', 'company', 'service'],
    order: 'id DESC',
    roles: ['accounts'],
  },
  subscribers: {
    table: 'subscribers',
    fields: ['email', 'status'],
    search: ['email'],
    order: 'id DESC',
    roles: CMS,
  },

  // ----------------------------------------------------------- Billing / CRM
  clients: {
    table: 'clients',
    select: `clients.*,
      (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.client_id = clients.id AND i.status <> 'cancelled') AS billed,
      (SELECT COALESCE(SUM(total - amount_paid),0) FROM invoices i WHERE i.client_id = clients.id AND i.status IN ('unpaid','partial','overdue')) AS outstanding`,
    fields: ['name', 'contact_person', 'email', 'phone', 'whatsapp', 'gstin', 'address', 'city', 'state', 'pincode', 'website', 'notes', 'status'],
    search: ['clients.name', 'clients.contact_person', 'clients.email', 'clients.phone', 'clients.city'],
    order: 'clients.name ASC',
    roles: ACCOUNTS,
    readRoles: ['accounts', 'hr'],
  },
  billing_items: {
    table: 'billing_items',
    fields: ['name', 'description', 'hsn_sac', 'unit', 'rate', 'tax_rate', 'status'],
    search: ['name', 'hsn_sac'],
    order: 'name ASC',
    roles: ACCOUNTS,
  },
  client_servers: {
    table: 'client_servers',
    select: `client_servers.*, c.name AS client_name, DATEDIFF(client_servers.expiry_date, CURDATE()) AS days_left`,
    joins: 'LEFT JOIN clients c ON c.id = client_servers.client_id',
    fields: ['client_id', 'name', 'type', 'provider', 'domain', 'ip_address', 'plan', 'panel_url', 'username', 'password', 'start_date', 'expiry_date', 'billing_cycle', 'renewal_amount', 'cost_price', 'tax_rate', 'auto_reminder', 'status', 'notes'],
    search: ['client_servers.name', 'client_servers.domain', 'client_servers.provider', 'c.name'],
    filters: ['client_id', 'type', 'status'],
    order: 'client_servers.expiry_date IS NULL, client_servers.expiry_date ASC',
    roles: ACCOUNTS,
  },
  expenses: {
    table: 'expenses',
    fields: ['title', 'category', 'amount', 'expense_date', 'mode', 'vendor', 'receipt', 'notes'],
    search: ['title', 'category', 'vendor'],
    filters: ['category'],
    order: 'expense_date DESC, id DESC',
    roles: ACCOUNTS,
  },

  // ----------------------------------------------------------- HR masters
  departments: {
    table: 'departments',
    select: "departments.*, (SELECT COUNT(*) FROM employees e WHERE e.department_id = departments.id AND e.status = 'active') AS employee_count",
    fields: ['name', 'description', 'status'],
    search: ['name'],
    order: 'name ASC',
    roles: HR,
    readRoles: 'all',
  },
  designations: {
    table: 'designations',
    select: 'designations.*, d.name AS department_name',
    joins: 'LEFT JOIN departments d ON d.id = designations.department_id',
    fields: ['name', 'department_id', 'status'],
    search: ['designations.name', 'd.name'],
    filters: ['department_id'],
    order: 'designations.name ASC',
    roles: HR,
    readRoles: 'all',
  },
  holidays: {
    table: 'holidays',
    fields: ['title', 'date', 'type'],
    search: ['title'],
    order: 'date ASC',
    roles: HR,
    readRoles: 'all',
  },
  leave_types: {
    table: 'leave_types',
    fields: ['name', 'days_per_year', 'is_paid', 'color', 'status'],
    search: ['name'],
    order: 'id ASC',
    roles: HR,
    readRoles: 'all',
  },
  projects: {
    table: 'projects',
    select: `projects.*, c.name AS client_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = projects.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = projects.id AND t.status = 'done') AS done_count`,
    joins: 'LEFT JOIN clients c ON c.id = projects.client_id',
    fields: ['name', 'client_id', 'description', 'start_date', 'deadline', 'budget', 'status'],
    search: ['projects.name', 'c.name'],
    filters: ['status', 'client_id'],
    order: 'projects.id DESC',
    roles: HR,
    readRoles: 'all',
  },
  announcements: {
    table: 'announcements',
    fields: ['title', 'message', 'priority', 'status'],
    search: ['title'],
    order: 'id DESC',
    roles: HR,
    readRoles: 'all',
  },
  job_openings: {
    table: 'job_openings',
    select: 'job_openings.*, (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = job_openings.id) AS applications',
    fields: ['title', 'slug', 'department', 'location', 'job_type', 'experience', 'salary_range', 'openings', 'short_description', 'description', 'requirements', 'last_date', 'status'],
    search: ['title', 'department', 'location'],
    filters: ['status', 'job_type'],
    slugFrom: 'title',
    order: 'id DESC',
    roles: HR,
  },
  letter_templates: {
    table: 'letter_templates',
    fields: ['name', 'type', 'title', 'subject', 'body', 'status'],
    search: ['name', 'title'],
    filters: ['type'],
    order: 'id ASC',
    roles: HR,
  },
  employee_documents: {
    table: 'employee_documents',
    fields: ['employee_id', 'title', 'file'],
    search: ['title'],
    filters: ['employee_id'],
    order: 'id DESC',
    roles: HR,
  },
};

module.exports = resources;
