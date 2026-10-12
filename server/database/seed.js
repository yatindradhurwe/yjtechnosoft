/**
 * Creates the database (if needed), runs schema.sql and inserts default data.
 *   npm run db:setup        -> schema + defaults (safe to run multiple times)
 *   npm run db:setup -- --demo  -> also inserts demo employees/clients/invoices
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DEMO = process.argv.includes('--demo');

const SETTINGS = {
  company_name: 'YJTECHNOSOFT PRIVATE LIMITED',
  site_name: 'YJTechnosoft',
  tagline: 'One Stop Solution',
  logo: '/assets/logo.png',
  logo_light: '',
  favicon: '/assets/logo-icon.png',
  phone: '+91 7000796585',
  phone2: '+91 8770510012',
  email: 'yjtechnosoft@gmail.com',
  whatsapp_number: '917000796585',
  address: 'Rajmahal Chowk, Kawardha, Chhattisgarh',
  city: 'Kawardha, Chhattisgarh',
  cin: 'U72900CT2021PTC012188',
  gstin: '',
  site_url: process.env.APP_URL || 'http://localhost:5173',
  working_hours: 'Mon – Sat : 10:00 AM – 6:00 PM',
  map_embed: 'https://www.google.com/maps?q=Rajmahal+Chowk+Kawardha+Chhattisgarh&output=embed',
  facebook: 'https://facebook.com/',
  instagram: 'https://instagram.com/',
  linkedin: 'https://linkedin.com/',
  twitter: '',
  youtube: '',
  meta_title: 'YJTechnosoft – Software, Web & Mobile App Development Company in Chhattisgarh',
  meta_description: 'YJTechnosoft Private Limited is a one stop IT solution company offering website development, custom software, mobile apps, e-governance solutions, digital marketing and hosting services.',
  meta_keywords: 'software company kawardha, website development chhattisgarh, mobile app development, e-governance software, digital marketing',
  about_title: 'We build digital products that move businesses & governments forward',
  about_text:
    '<p>YJTechnosoft Private Limited is a registered IT company headquartered in Kawardha, Chhattisgarh. Since 2021 we have been delivering websites, custom software, mobile applications and e-governance solutions to businesses, institutions and government departments across India.</p><p>Our team of developers, designers and digital marketers combines deep technical expertise with a genuine understanding of local needs – delivering reliable, secure and affordable technology with dedicated after-sales support.</p>',
  about_image: '',
  mission: 'To make world-class technology accessible and affordable for every business and public institution.',
  vision: 'To be the most trusted technology partner in Central India, known for quality, transparency and long-term support.',
  footer_about: 'One stop solution for websites, software, mobile apps, e-governance and digital marketing. Trusted by businesses and government departments across Chhattisgarh.',
  hero_video: '',
  cta_title: 'Have a project in mind? Let’s build it together.',
  cta_text: 'Get a free consultation and a detailed quotation within 24 hours.',
  primary_color: '#1d6fb8',
  // billing
  invoice_prefix: 'YJ/INV',
  quotation_prefix: 'YJ/QT',
  receipt_prefix: 'YJ/RCPT',
  letter_prefix: 'YJ/HR',
  invoice_due_days: '15',
  gst_split: '1',
  invoice_terms: '1. Payment is due within 15 days from the invoice date.\n2. Please mention the invoice number while making payment.\n3. This is a computer generated invoice.',
  quotation_terms: '1. This quotation is valid for 30 days.\n2. 50% advance payment is required to start the work; balance on delivery.\n3. Domain, hosting and third-party charges are extra unless mentioned.\n4. Any additional requirement will be charged separately.',
  bank_account_holder: 'YJTECHNOSOFT PRIVATE LIMITED',
  bank_name: 'HDFC Bank',
  bank_account_number: '50200063127366',
  bank_ifsc: 'HDFC0001654',
  bank_branch: 'KAWARDHA',
  bank_account_type: 'CURRENT',
  upi_id: '7000796585@hdfcbank',
  signatory_name: 'Authorised Signatory',
  signatory_designation: 'Director',
  // HR
  emp_code_prefix: 'YJT',
  office_start_time: '10:00',
  office_end_time: '18:00',
  attendance_grace_minutes: '15',
  half_day_hours: '4',
  weekly_off: '0',
  salary_basic_pct: '50',
  salary_hra_pct: '20',
  payroll_missing_as_absent: '1',
  office_ip_whitelist: '',
  // notifications
  notify_admin_emails: 'yjtechnosoft@gmail.com',
  mail_from_name: 'YJTechnosoft',
  mail_from_email: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_secure: '0',
  sms_provider: 'none',
  whatsapp_provider: 'none',
  whatsapp_admin_number: '917000796585',
  enquiry_autoreply: '1',
  enquiry_whatsapp_alert: '0',
  server_reminders: '1',
  server_reminder_days: '30,15,7,3,1,0',
  server_reminder_whatsapp: '0',
  invoice_reminders: '0',
  birthday_wishes: '1',
};

const SERVICES = [
  ['Website Development', 'globe', 'Fast, responsive and SEO-ready websites that turn visitors into customers.', '<p>From corporate websites to e-commerce stores and web portals, we design and develop websites that look stunning on every device, load in a blink and rank well on Google.</p>', 'Responsive design\nSEO-friendly structure\nAdmin panel / CMS\nE-commerce & payment gateway\nSpeed & security optimised\n1 year free support', '₹ 7,999'],
  ['Custom Software Development', 'code', 'Tailor-made software – ERP, CRM, billing, school & hospital management.', '<p>We build robust business software that automates your workflows – billing, inventory, HR, CRM, school and hospital management and much more.</p>', 'Requirement analysis\nCloud or on-premise\nRole based access\nReports & dashboards\nData migration\nTraining & support', '₹ 24,999'],
  ['Mobile App Development', 'smartphone', 'Native-quality Android & iOS apps built with Flutter and React Native.', '<p>Engaging mobile applications for Android and iOS with beautiful UI, push notifications, payments and real-time features.</p>', 'Android & iOS\nFlutter / React Native\nPush notifications\nPayment integration\nPlay Store publishing\nAPI & admin panel', '₹ 29,999'],
  ['E-Governance Solutions', 'landmark', 'Secure software for government departments, police & courts.', '<p>We have delivered mission-critical modules for government offices including court user modules, case tracking and departmental MIS – built with security, audit trails and ease of use in mind.</p>', 'Department MIS\nCourt & case tracking modules\nRole based workflows\nAudit trails\nSMS / Email alerts\nOn-site training', 'On request'],
  ['Digital Marketing & SEO', 'trending-up', 'Grow traffic, leads and sales with SEO, social media and Google Ads.', '<p>Data-driven digital marketing – search engine optimisation, social media management, Google & Meta ads and content marketing that delivers measurable ROI.</p>', 'On-page & off-page SEO\nSocial media management\nGoogle & Meta Ads\nContent marketing\nMonthly reports\nLocal SEO / Google Business', '₹ 4,999/mo'],
  ['Domain, Hosting & Email', 'server', 'Reliable hosting, domains, SSL and business email with 24x7 support.', '<p>Blazing-fast and secure hosting, VPS and cloud servers with daily backups, free SSL and business email – fully managed by our team.</p>', 'Domain registration\nShared, VPS & cloud hosting\nFree SSL certificate\nBusiness email\nDaily backups\nServer management', '₹ 2,499/yr'],
  ['UI/UX & Graphic Design', 'pen-tool', 'Logos, branding, UI design and marketing creatives that stand out.', '<p>Beautiful, user-centred design – from brand identity and logos to app/web UI and social media creatives.</p>', 'Logo & branding\nUI/UX design\nSocial media creatives\nBrochures & flyers\nPresentation design', '₹ 1,999'],
  ['Bulk SMS & WhatsApp', 'message-circle', 'Reach customers instantly with bulk SMS, WhatsApp & voice campaigns.', '<p>DLT-approved bulk SMS, WhatsApp Business API and voice call solutions for alerts, OTPs and promotions.</p>', 'DLT registration help\nTransactional & promotional SMS\nWhatsApp Business API\nAPI integration\nDelivery reports', 'On request'],
];

const LETTER_TEMPLATES = [
  {
    name: 'Internship Offer Letter',
    type: 'internship_offer',
    title: 'Internship Offer Letter',
    subject: 'Offer of Internship – {{designation}}',
    body: `<p>Dear {{name}},</p>
<p>We are pleased to offer you an internship opportunity with <strong>{{company}}</strong> as a <strong>{{designation}}</strong>. We were impressed with your profile and believe this internship will be a great learning experience for you.</p>
<p>The details of your internship are as follows:</p>
<ul><li><strong>Position:</strong> {{designation}}</li><li><strong>Department:</strong> {{department}}</li><li><strong>Start Date:</strong> {{start_date}}</li><li><strong>Duration:</strong> {{duration}}</li><li><strong>Stipend:</strong> {{stipend}}</li><li><strong>Working Hours:</strong> {{working_hours}} (Monday to Saturday)</li><li><strong>Location:</strong> {{location}}</li></ul>
<p>During the internship you will work on live projects under the guidance of our senior team members. On successful completion you will receive an Internship Completion Certificate. Based on your performance, you may be considered for a full-time position.</p>
<p>You are required to maintain confidentiality of all company information, source code and client data during and after the internship. The internship may be terminated by either party with 7 days written notice.</p>
<p>Please sign and return a copy of this letter as a token of your acceptance on or before {{acceptance_date}}.</p>
<p>We look forward to having you on our team!</p>`,
  },
  {
    name: 'Offer Letter',
    type: 'offer',
    title: 'Offer Letter',
    subject: 'Offer of Employment – {{designation}}',
    body: `<p>Dear {{name}},</p>
<p>With reference to your application and the subsequent interview, we are delighted to offer you the position of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at <strong>{{company}}</strong>.</p>
<ul><li><strong>Date of Joining:</strong> {{joining_date}}</li><li><strong>Annual CTC:</strong> Rs. {{ctc}}/- (Monthly Rs. {{salary}}/-)</li><li><strong>Probation Period:</strong> {{probation}}</li><li><strong>Working Hours:</strong> {{working_hours}}</li><li><strong>Place of Work:</strong> {{location}}</li></ul>
<p>Your detailed appointment letter will be issued at the time of joining. Kindly bring the following documents on your joining day: educational certificates, ID proof (Aadhaar & PAN), two passport-size photographs, previous employment relieving letter (if any) and bank account details.</p>
<p>This offer is subject to verification of your documents and references. Please confirm your acceptance by signing and returning a copy of this letter on or before {{acceptance_date}}.</p>
<p>We welcome you to the {{company}} family and look forward to a long and mutually rewarding association.</p>`,
  },
  {
    name: 'Appointment Letter',
    type: 'appointment',
    title: 'Appointment Letter',
    subject: 'Appointment as {{designation}}',
    body: `<p>Dear {{name}},</p>
<p>We are pleased to appoint you as <strong>{{designation}}</strong> in <strong>{{company}}</strong> with effect from <strong>{{joining_date}}</strong> on the following terms and conditions:</p>
<ol><li><strong>Remuneration:</strong> Your monthly gross salary will be Rs. {{salary}}/- (Annual CTC Rs. {{ctc}}/-), subject to applicable deductions.</li><li><strong>Probation:</strong> You will be on probation for {{probation}}, which may be extended at the discretion of the management. On satisfactory completion you will be confirmed in writing.</li><li><strong>Working Hours:</strong> {{working_hours}}, Monday to Saturday. You may be required to work additional hours as per project needs.</li><li><strong>Leave:</strong> You will be entitled to leave as per the company leave policy.</li><li><strong>Notice Period:</strong> During probation either party may terminate employment with 15 days notice; after confirmation the notice period will be 30 days.</li><li><strong>Confidentiality:</strong> You shall not disclose any confidential information, source code, client data or trade secrets of the company during or after your employment.</li><li><strong>Intellectual Property:</strong> All work, code and material created during employment shall remain the sole property of the company.</li><li><strong>Code of Conduct:</strong> You are expected to follow all company policies as amended from time to time.</li></ol>
<p>Please sign the duplicate copy of this letter in token of your acceptance.</p>
<p>We wish you a successful career with us.</p>`,
  },
  {
    name: 'Joining Letter',
    type: 'joining',
    title: 'Joining Letter',
    subject: 'Confirmation of Joining',
    body: `<p>Dear {{name}},</p>
<p>This is to confirm that you have joined <strong>{{company}}</strong> as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department on <strong>{{joining_date}}</strong>.</p>
<p>Your Employee Code is <strong>{{emp_code}}</strong>. You will be reporting to <strong>{{reporting_to}}</strong>. Your official working hours are {{working_hours}}.</p>
<p>Your employee portal account has been created – please use it to mark daily attendance, apply for leave, view assigned tasks and submit your daily work report.</p>
<p>We are happy to have you with us and wish you a long and successful career at {{company}}.</p>`,
  },
  {
    name: 'Internship Completion Certificate',
    type: 'internship_completion',
    title: 'Internship Certificate',
    subject: '',
    body: `<p class="ql-align-center"><strong>TO WHOMSOEVER IT MAY CONCERN</strong></p>
<p>This is to certify that <strong>{{name}}</strong> has successfully completed an internship with <strong>{{company}}</strong> as <strong>{{designation}}</strong> from <strong>{{start_date}}</strong> to <strong>{{end_date}}</strong>.</p>
<p>During the internship {{pronoun_his}} work included {{project}}. We found {{first_name}} to be sincere, hardworking and eager to learn. {{pronoun}} showed good technical understanding and worked well with the team.</p>
<p>We wish {{first_name}} all the best for future endeavours.</p>`,
  },
  {
    name: 'Experience Letter',
    type: 'experience',
    title: 'Experience Letter',
    subject: '',
    body: `<p class="ql-align-center"><strong>TO WHOMSOEVER IT MAY CONCERN</strong></p>
<p>This is to certify that <strong>{{name}}</strong> (Employee Code: {{emp_code}}) was employed with <strong>{{company}}</strong> as <strong>{{designation}}</strong> from <strong>{{joining_date}}</strong> to <strong>{{last_working_day}}</strong>.</p>
<p>During this tenure we found {{pronoun_his}} conduct and performance to be good. {{pronoun}} was a dedicated team member and handled responsibilities sincerely.</p>
<p>We wish {{first_name}} every success in future.</p>`,
  },
  {
    name: 'Relieving Letter',
    type: 'relieving',
    title: 'Relieving Letter',
    subject: 'Relieving from services',
    body: `<p>Dear {{name}},</p>
<p>This has reference to your resignation letter. We would like to inform you that your resignation has been accepted and you are relieved from the services of <strong>{{company}}</strong> at the close of business hours on <strong>{{last_working_day}}</strong>.</p>
<p>We confirm that you have handed over all company assets and your full & final settlement has been processed.</p>
<p>We thank you for your contribution and wish you all the best for your future endeavours.</p>`,
  },
];

async function main() {
  const dbName = process.env.DB_NAME || 'yjtechnosoft';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  console.log('✔ Schema ready');

  const q = async (sql, params) => (await conn.query(sql, params))[0];
  const count = async (table) => (await q(`SELECT COUNT(*) c FROM \`${table}\``))[0].c;

  // settings – only insert missing keys, never overwrite admin changes
  for (const [k, v] of Object.entries(SETTINGS)) await q('INSERT IGNORE INTO settings (`key`, `value`) VALUES (?, ?)', [k, v]);
  console.log('✔ Settings');

  // admin user
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@yjtechnosoft.com').toLowerCase();
  if (!(await q('SELECT id FROM users WHERE email = ?', [adminEmail])).length) {
    await q('INSERT INTO users SET ?', [{ name: process.env.ADMIN_NAME || 'Administrator', email: adminEmail, role: 'admin', password_hash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10) }]);
    console.log(`✔ Admin user created: ${adminEmail} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}`);
  }

  if (!(await count('sliders'))) {
    await q('INSERT INTO sliders (badge, title, highlight, subtitle, button_text, button_link, button2_text, button2_link, sort_order) VALUES ?', [[
      ['🚀 Trusted IT Partner since 2021', 'We build software that', 'grows your business', 'Websites, custom software, mobile apps and e-governance solutions – designed, developed and supported by one expert team.', 'Get Free Quote', '/get-quote', 'Our Services', '/services', 1],
      ['🏛️ E-Governance Experts', 'Digital solutions for', 'government & enterprises', 'Secure, scalable and easy-to-use systems trusted by government departments across Chhattisgarh.', 'View Portfolio', '/portfolio', 'Contact Us', '/contact', 2],
    ]]);
  }
  if (!(await count('services'))) {
    await q('INSERT INTO services (title, slug, icon, short_description, description, features, starting_price, sort_order) VALUES ?', [
      SERVICES.map((s, i) => [s[0], s[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''), s[1], s[2], s[3], s[4], s[5], i + 1]),
    ]);
  }
  if (!(await count('stats'))) {
    await q('INSERT INTO stats (label, value, suffix, icon, sort_order) VALUES ?', [[
      ['Projects Delivered', 150, '+', 'briefcase', 1],
      ['Happy Clients', 100, '+', 'smile', 2],
      ['Government Departments', 15, '+', 'landmark', 3],
      ['Years of Excellence', 5, '+', 'award', 4],
    ]]);
  }
  if (!(await count('testimonials'))) {
    await q('INSERT INTO testimonials (name, designation, company, message, rating, sort_order) VALUES ?', [[
      ['Rakesh Verma', 'Owner', 'Verma Traders', 'YJTechnosoft built our billing and inventory software. It has saved us hours every day. Very professional team with excellent support.', 5, 1],
      ['Dr. Anjali Singh', 'Director', 'City Care Hospital', 'Our hospital website and appointment system were delivered on time and work flawlessly. Highly recommended!', 5, 2],
      ['Amit Tiwari', 'Principal', 'Bright Future School', 'The school management software and mobile app made communication with parents so easy. Great value for money.', 5, 3],
    ]]);
  }
  if (!(await count('technologies'))) {
    await q('INSERT INTO technologies (name, category, sort_order) VALUES ?', [
      ['React', 'Node.js', 'PHP', 'Laravel', 'Flutter', 'React Native', 'MySQL', 'MongoDB', 'WordPress', 'AWS', 'Python', 'Figma'].map((n, i) => [n, 'Technology', i + 1]),
    ]);
  }
  if (!(await count('pricing_plans'))) {
    await q('INSERT INTO pricing_plans (name, price, period, description, features, is_highlighted, sort_order) VALUES ?', [[
      ['Starter Website', '₹7,999', 'one time', 'Perfect for small businesses & professionals', '5 page responsive website\nContact form & WhatsApp chat\nBasic SEO setup\nFree domain for 1 year\n1 year hosting\n3 months support', 0, 1],
      ['Business Website', '₹19,999', 'one time', 'Dynamic website with admin panel', 'Unlimited pages\nAdmin panel / CMS\nBlog & gallery\nAdvanced SEO\nBusiness email\n1 year support', 1, 2],
      ['E-Commerce', '₹34,999', 'one time', 'Sell online with a complete store', 'Product catalogue\nCart & checkout\nPayment gateway\nOrder management\nInvoice & SMS alerts\n1 year support', 0, 3],
    ]]);
  }
  if (!(await count('faqs'))) {
    await q('INSERT INTO faqs (question, answer, sort_order) VALUES ?', [[
      ['How long does it take to build a website?', 'A standard business website takes 7–15 working days. Custom software and apps are delivered in phases; we share a clear timeline with the quotation.', 1],
      ['Do you provide support after delivery?', 'Yes. Every project includes free support (3 to 12 months depending on the plan) and we offer affordable annual maintenance contracts (AMC).', 2],
      ['Will I be able to update my website myself?', 'Absolutely. Our dynamic websites come with an easy admin panel to manage content, images, blogs and more without any coding.', 3],
      ['Do you work with government departments?', 'Yes, we have developed and maintain software modules for several government offices, including police and court-related systems.', 4],
      ['What are the payment terms?', 'Usually 50% advance and 50% on delivery. For larger projects we follow milestone-based payments. We accept bank transfer, UPI and cheque.', 5],
    ]]);
  }
  if (!(await count('pages'))) {
    await q('INSERT INTO pages (title, slug, content) VALUES ?', [[
      ['Privacy Policy', 'privacy-policy', '<h2>Privacy Policy</h2><p>We respect your privacy. Information submitted through our website forms (name, email, phone) is used only to respond to your enquiry and is never sold to third parties.</p><p>For any privacy-related questions contact us at yjtechnosoft@gmail.com.</p>'],
      ['Terms & Conditions', 'terms-and-conditions', '<h2>Terms & Conditions</h2><p>By using this website you agree to these terms. All project work is governed by the quotation / agreement signed with the client. Payments once made for completed milestones are non-refundable.</p>'],
      ['Refund Policy', 'refund-policy', '<h2>Refund Policy</h2><p>Advance payments are refundable only if work has not started. Domain registrations and third-party licences are non-refundable.</p>'],
    ]]);
  }
  if (!(await count('departments'))) {
    await q('INSERT INTO departments (name) VALUES ?', [[['Development'], ['Design'], ['Digital Marketing'], ['Sales & Support'], ['HR & Admin'], ['Accounts']]]);
    await q('INSERT INTO designations (name, department_id) VALUES ?', [[
      ['Software Developer', 1], ['Senior Software Developer', 1], ['Web Developer Intern', 1], ['Mobile App Developer', 1], ['Project Manager', 1],
      ['UI/UX Designer', 2], ['Graphic Designer', 2], ['SEO Executive', 3], ['Digital Marketing Executive', 3],
      ['Business Development Executive', 4], ['Support Executive', 4], ['HR Executive', 5], ['Accountant', 6],
    ]]);
  }
  if (!(await count('leave_types'))) {
    await q('INSERT INTO leave_types (name, days_per_year, is_paid, color) VALUES ?', [[
      ['Casual Leave', 12, 1, '#1d6fb8'], ['Sick Leave', 6, 1, '#0ea5e9'], ['Earned Leave', 12, 1, '#16a34a'], ['Leave Without Pay', 365, 0, '#dc2626'],
    ]]);
  }
  if (!(await count('letter_templates'))) {
    await q('INSERT INTO letter_templates (name, type, title, subject, body) VALUES ?', [LETTER_TEMPLATES.map((t) => [t.name, t.type, t.title, t.subject, t.body])]);
  }
  if (!(await count('billing_items'))) {
    await q('INSERT INTO billing_items (name, hsn_sac, unit, rate, tax_rate) VALUES ?', [[
      ['Website Design & Development', '998314', 'Nos', 15000, 18], ['Custom Software Module', '998314', 'Nos', 25000, 18], ['Domain Registration (.com) – 1 Year', '998315', 'Nos', 999, 18],
      ['Shared Hosting – 1 Year', '998315', 'Nos', 2999, 18], ['Annual Maintenance Contract', '998713', 'Nos', 12000, 18], ['SEO – Monthly', '998366', 'Month', 4999, 18],
    ]]);
  }
  if (!(await count('job_openings'))) {
    await q('INSERT INTO job_openings (title, slug, department, location, job_type, experience, salary_range, openings, short_description, description, requirements) VALUES ?', [[
      ['Web Developer Intern', 'web-developer-intern', 'Development', 'Kawardha (On-site)', 'internship', 'Fresher', '₹3,000 – ₹8,000 / month', 5, 'Kick-start your career working on live React, Node.js and PHP projects.', '<p>Work alongside our senior developers on real client projects. Learn modern web technologies and best practices.</p>', '<ul><li>Basic knowledge of HTML, CSS, JavaScript</li><li>Familiarity with React or PHP is a plus</li><li>Eagerness to learn</li></ul>'],
      ['Full Stack Developer', 'full-stack-developer', 'Development', 'Kawardha / Remote', 'full_time', '1–3 years', '₹15,000 – ₹35,000 / month', 2, 'Build web applications with React, Node.js and MySQL.', '<p>Design, build and maintain web applications and APIs for our clients.</p>', '<ul><li>Strong JavaScript, React & Node.js</li><li>MySQL & REST APIs</li><li>Git</li></ul>'],
    ]]);
  }
  if (!(await count('clients'))) {
    await q('INSERT INTO clients (name, address, city, state) VALUES ?', [[['SP Office, Raigarh', 'Office of the Superintendent of Police', 'Raigarh', 'Chhattisgarh']]]);
  }
  if (!(await count('announcements'))) {
    await q('INSERT INTO announcements (title, message) VALUES (?, ?)', ['Welcome to the new employee portal', 'Mark your attendance, apply for leave, track tasks and submit daily reports – all from one place.']);
  }

  if (DEMO) await demo(q);
  await conn.end();
  console.log('✔ Done');
}

async function demo(q) {
  if ((await q("SELECT COUNT(*) c FROM employees"))[0].c) return;
  const pass = await bcrypt.hash('Employee@123', 10);
  const emps = [
    ['YJT001', 'Rohit Sahu', 'rohit@yjtechnosoft.com', '9000000001', 'male', 1, 2, 'full_time', '2023-04-01', 30000],
    ['YJT002', 'Priya Patel', 'priya@yjtechnosoft.com', '9000000002', 'female', 2, 6, 'full_time', '2024-01-15', 22000],
    ['YJT003', 'Aman Yadav', 'aman@yjtechnosoft.com', '9000000003', 'male', 1, 3, 'intern', '2026-08-01', 5000],
  ];
  for (const e of emps) {
    const r = await q('INSERT INTO employees (emp_code, name, email, phone, gender, department_id, designation_id, employment_type, joining_date, salary) VALUES (?)', [e]);
    await q('INSERT INTO users (name, email, phone, role, employee_id, password_hash) VALUES (?)', [[e[1], e[2], e[3], 'employee', r.insertId, pass]]);
  }
  console.log('✔ Demo employees (password Employee@123): rohit@, priya@, aman@yjtechnosoft.com');
}

main().catch((e) => {
  console.error('✖ Setup failed:', e.message);
  process.exit(1);
});
