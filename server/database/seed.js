/**
 * Creates the database (if needed), runs schema.sql and inserts default data.
 *   npm run db:setup        -> schema + defaults (safe to run multiple times)
 *   npm run db:setup -- --demo  -> also inserts demo employees/clients/invoices
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const { fixUrl, normaliseEnvUrls } = require('../src/config/urls');
normaliseEnvUrls();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { dbSettings } = require('../src/config/dbSettings');


const SETTINGS = {
  company_name: 'YJTECHNOSOFT PRIVATE LIMITED',
  site_name: 'YJTechnosoft',
  tagline: 'One Stop Solution',
  logo: '/logo.png',
  logo_light: '',
  favicon: '/favicon.png',
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

const CONTRACT_TEMPLATES = [
  {
    name: 'Website Development Agreement',
    type: 'website_development',
    title: 'Website Development Agreement',
    body: `<p>This Website Development Agreement (“Agreement”) is entered into on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong>, having its office at {{company_address}} (“Service Provider”), and <strong>{{client_name}}</strong>, {{client_address}} (“Client”).</p>
<h3>1. Scope of Work</h3><p>The Service Provider shall design and develop the website for the Client as described below:</p><p>{{scope_of_work}}</p>
<h3>2. Deliverables & Timeline</h3><p>Deliverables: {{deliverables}}. The project shall commence on {{start_date}} and is expected to be completed by {{end_date}}, subject to timely receipt of content, approvals and payments from the Client.</p>
<h3>3. Fees & Payment Terms</h3><p>The total fee for the project is <strong>Rs. {{contract_value}}/-</strong> ({{contract_value_words}}), exclusive of applicable taxes. Payment terms: {{payment_terms}}. Domain, hosting, premium plugins and third-party services are charged separately unless specifically included.</p>
<h3>4. Client Responsibilities</h3><p>The Client shall provide text content, images, logos, credentials and feedback in a timely manner. Delays in providing the same shall extend the timeline accordingly.</p>
<h3>5. Revisions & Change Requests</h3><p>Up to two rounds of design revisions are included. Any new feature or change outside the agreed scope will be quoted and billed separately.</p>
<h3>6. Intellectual Property</h3><p>Upon receipt of full payment, ownership of the final website design and content shall transfer to the Client. The Service Provider may display the work in its portfolio unless the Client objects in writing. Third-party components remain subject to their respective licences.</p>
<h3>7. Support & Warranty</h3><p>The Service Provider shall provide free bug-fix support for {{support_period}} from the date of launch. Post this period, support can be availed under an Annual Maintenance Contract.</p>
<h3>8. Confidentiality</h3><p>Both parties shall keep confidential all information received from the other party and shall not disclose it to any third party without prior written consent.</p>
<h3>9. Termination</h3><p>Either party may terminate this Agreement with 15 days written notice. On termination, the Client shall pay for all work completed up to the date of termination.</p>
<h3>10. Governing Law</h3><p>This Agreement shall be governed by the laws of India and the courts at {{jurisdiction}} shall have exclusive jurisdiction.</p>`,
  },
  {
    name: 'Software Development & Service Agreement',
    type: 'software_development',
    title: 'Software Development & Service Agreement',
    body: `<p>This Agreement is made on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> (“Developer”) and <strong>{{client_name}}</strong> (“Client”) for the project <strong>{{project_name}}</strong>.</p>
<h3>1. Project Scope</h3><p>{{scope_of_work}}</p>
<h3>2. Project Period</h3><p>The development shall be carried out from {{start_date}} to {{end_date}}. Milestones and demos will be shared periodically for the Client’s review and approval.</p>
<h3>3. Consideration</h3><p>The Client agrees to pay <strong>Rs. {{contract_value}}/-</strong> ({{contract_value_words}}) plus applicable GST as per the following schedule: {{payment_terms}}.</p>
<h3>4. Acceptance</h3><p>Each module shall be deemed accepted if no material defect is reported in writing within 7 days of delivery. Defects reported shall be rectified by the Developer free of cost.</p>
<h3>5. Source Code & Ownership</h3><p>On receipt of full and final payment, the Client shall own the custom source code developed specifically for this project. Pre-existing libraries, frameworks and tools of the Developer remain the Developer’s property and are licensed to the Client for use with the software.</p>
<h3>6. Data Security & Confidentiality</h3><p>The Developer shall take reasonable measures to protect the Client’s data and shall not disclose any confidential information, including official records, to third parties.</p>
<h3>7. Warranty & Support</h3><p>The Developer warrants that the software will substantially perform as per the agreed specification for {{support_period}} after go-live, during which bugs will be fixed at no cost.</p>
<h3>8. Limitation of Liability</h3><p>The Developer’s total liability under this Agreement shall not exceed the total fee paid by the Client under this Agreement.</p>
<h3>9. Termination</h3><p>Either party may terminate this Agreement by giving 30 days written notice. All dues for work completed shall be settled within 15 days of termination.</p>
<h3>10. Dispute Resolution</h3><p>Disputes shall first be resolved amicably; failing which they shall be subject to the exclusive jurisdiction of the courts at {{jurisdiction}}.</p>`,
  },
  {
    name: 'Annual Maintenance Contract (AMC)',
    type: 'amc',
    title: 'Annual Maintenance Contract',
    body: `<p>This Annual Maintenance Contract (“AMC”) is entered into on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> (“Service Provider”) and <strong>{{client_name}}</strong> (“Client”).</p>
<h3>1. Period</h3><p>This AMC is valid from <strong>{{start_date}}</strong> to <strong>{{end_date}}</strong>.</p>
<h3>2. Services Covered</h3><p>{{services}}</p><ul><li>Bug fixing and troubleshooting of the existing application / website</li><li>Minor content and design updates</li><li>Security updates and regular backups</li><li>Technical support over phone, email and WhatsApp during working hours</li></ul>
<h3>3. Response Time</h3><p>Critical issues will be attended within {{response_time}}; other requests within 2 working days.</p>
<h3>4. Exclusions</h3><p>New modules, major redesign, third-party software licences, hardware and issues caused by unauthorised changes are not covered and will be charged separately.</p>
<h3>5. AMC Charges</h3><p>The AMC fee is <strong>Rs. {{contract_value}}/-</strong> ({{contract_value_words}}) plus GST, payable {{payment_terms}}.</p>
<h3>6. Renewal</h3><p>This AMC may be renewed for a further period on mutually agreed terms. The Service Provider will send a renewal reminder before expiry.</p>
<h3>7. Termination & Jurisdiction</h3><p>Either party may terminate with 30 days written notice; fees paid for the current period are non-refundable. Subject to {{jurisdiction}} jurisdiction.</p>`,
  },
  {
    name: 'Hosting, Domain & Email Service Agreement',
    type: 'hosting',
    title: 'Hosting & Domain Service Agreement',
    body: `<p>This Agreement dated <strong>{{agreement_date}}</strong> is between <strong>{{company}}</strong> (“Provider”) and <strong>{{client_name}}</strong> (“Customer”).</p>
<h3>1. Services</h3><p>{{services}}</p>
<h3>2. Term & Renewal</h3><p>Services are provided from {{start_date}} to {{end_date}}. Services must be renewed before expiry; the Provider will send reminders 30, 15 and 7 days in advance. Services not renewed may be suspended after expiry.</p>
<h3>3. Fees</h3><p>The fee for the term is <strong>Rs. {{contract_value}}/-</strong> plus GST, payable in advance.</p>
<h3>4. Uptime & Backups</h3><p>The Provider shall make reasonable efforts to maintain 99.5% uptime and take periodic backups. The Customer is advised to maintain independent backups of critical data.</p>
<h3>5. Acceptable Use</h3><p>The Customer shall not host illegal, infringing or malicious content, send spam or misuse server resources. Violation may result in suspension without refund.</p>
<h3>6. Ownership</h3><p>Domain names registered on behalf of the Customer shall be registered in the Customer’s name. Login credentials will be shared on request after clearance of all dues.</p>
<h3>7. Liability</h3><p>The Provider shall not be liable for losses due to data centre outages, force majeure or actions of third-party providers beyond its control. Subject to {{jurisdiction}} jurisdiction.</p>`,
  },
  {
    name: 'Non-Disclosure Agreement (NDA)',
    type: 'nda',
    title: 'Non-Disclosure Agreement',
    body: `<p>This Non-Disclosure Agreement is made on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> and <strong>{{client_name}}</strong> (each a “Party”, together the “Parties”).</p>
<h3>1. Purpose</h3><p>The Parties wish to share certain confidential information for the purpose of {{purpose}} (“Purpose”).</p>
<h3>2. Confidential Information</h3><p>“Confidential Information” means all business, technical, financial and personal information, source code, designs, data and documents disclosed by either Party, whether oral, written or electronic.</p>
<h3>3. Obligations</h3><ol><li>Use the Confidential Information solely for the Purpose.</li><li>Not disclose it to any third party without prior written consent.</li><li>Protect it with at least the same care used for its own confidential information.</li><li>Return or destroy all Confidential Information on request.</li></ol>
<h3>4. Exclusions</h3><p>Obligations do not apply to information that is publicly available, already known to the receiving Party, independently developed, or required to be disclosed by law.</p>
<h3>5. Term</h3><p>This Agreement remains in force from {{start_date}} and the confidentiality obligations shall survive for {{nda_period}} after its termination.</p>
<h3>6. Governing Law</h3><p>This Agreement is governed by the laws of India, subject to the jurisdiction of courts at {{jurisdiction}}.</p>`,
  },
  {
    name: 'Freelancer / Consultant Agreement',
    type: 'freelancer',
    title: 'Consultant Agreement',
    body: `<p>This Agreement is made on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> (“Company”) and <strong>{{client_name}}</strong>, {{client_address}} (“Consultant”).</p>
<h3>1. Engagement</h3><p>The Company engages the Consultant on a contract basis for: {{scope_of_work}}</p>
<h3>2. Term</h3><p>From {{start_date}} to {{end_date}}, unless terminated earlier.</p>
<h3>3. Fees</h3><p>The Company shall pay the Consultant Rs. {{contract_value}}/- ({{contract_value_words}}) {{payment_terms}}, subject to applicable TDS.</p>
<h3>4. Independent Contractor</h3><p>The Consultant is an independent contractor and not an employee of the Company, and is responsible for their own taxes and statutory compliance.</p>
<h3>5. Intellectual Property & Confidentiality</h3><p>All work product created under this Agreement shall be the exclusive property of the Company. The Consultant shall keep all Company and client information strictly confidential.</p>
<h3>6. Non-Solicitation</h3><p>During the term and for 12 months thereafter, the Consultant shall not directly solicit the Company’s clients introduced under this engagement.</p>
<h3>7. Termination & Jurisdiction</h3><p>Either party may terminate with 15 days written notice. Subject to {{jurisdiction}} jurisdiction.</p>`,
  },
];


/** Our own products shown on the website (images ship in assets/products) */
const BUILTIN_PRODUCTS = [
  {
    name: 'MakeMyProfile',
    slug: 'makemyprofile',
    tagline: 'Company & personal profiles, ready as PDF',
    stage: 'Live',
    logo: '/uploads/products/makemyprofile-logo.png',
    image: '/uploads/products/makemyprofile.png',
    short_description: 'An online platform where firms and professionals create a premium company profile or personal profile from ready templates, edit every section and download a print-ready PDF.',
    description: `<p><strong>MakeMyProfile</strong> helps businesses, institutions and professionals present themselves the way large companies do – with a well-designed profile document – without hiring a designer.</p>
<h3>How it works</h3>
<ol><li><strong>Pick a template</strong> – choose Firm / Business or Individual, then your category: IT, construction, legal, CA, healthcare, education, NGO, government supplier, doctor, advocate, student and more.</li>
<li><strong>Fill in your details</strong> – edit every section, upload your logo, photos and project screenshots, and choose your colours. Changes are saved automatically.</li>
<li><strong>Download the PDF</strong> – an A4, print-ready profile with cover page and page numbers, ready for clients, tenders and government offices.</li></ol>
<h3>Built for</h3>
<p>Contractors and suppliers preparing tender documents, consultants and agencies making profiles for their clients, firms introducing themselves to new customers, and professionals who need a polished profile or resume.</p>`,
    features: '30+ templates for firms and individuals\nCategory-wise templates: IT, construction, legal, CA, healthcare, education, NGO, government supplier…\nSection-by-section editor with live preview\nYour logo, photos and brand colours\nPrint-ready A4 PDF download\nShareable public link\nAdmin panel to manage customers, profiles and templates',
    audience: 'Firms, contractors, consultants, institutions and professionals',
    website_url: '',
    cta_text: 'Create your profile',
    sort_order: 1,
    is_featured: 1,
  },
  {
    name: 'Litigation & Legal Chamber',
    slug: 'litigation',
    tagline: 'Case, hearing and client management for advocates and law firms',
    stage: 'Live',
    logo: '/uploads/products/litigation-logo.png',
    image: '/uploads/products/litigation.png',
    short_description: 'An online practice-management system for advocates and legal chambers: track litigation, stay on top of hearing dates, keep client records and manage legal documents in one place.',
    description: `<p><strong>Litigation &amp; Legal Chamber</strong> brings the day-to-day work of a legal practice into one secure online system, so advocates and their teams always know what is due and where every case stands.</p>
<h3>What it covers</h3>
<ul><li><strong>Litigation tracking</strong> – keep every case with its court, parties, stage and history.</li>
<li><strong>Hearing schedules</strong> – see upcoming hearing dates at a glance and plan the week ahead.</li>
<li><strong>Client records</strong> – client details and their matters, organised and easy to find.</li>
<li><strong>Legal document management</strong> – store and retrieve the documents for each case.</li></ul>
<h3>Built for</h3>
<p>Independent advocates, legal chambers and law firms who want to move from diaries and files to an organised digital practice.</p>`,
    features: 'Litigation and case tracking\nHearing schedules and upcoming dates\nClient records\nLegal document management\nAccess from any device, online',
    audience: 'Advocates, legal chambers and law firms',
    website_url: 'https://litigation.yjtechnosoft.com',
    cta_text: 'Open Litigation',
    sort_order: 2,
    is_featured: 1,
  },
];

/**
 * Creates/upgrades all tables and inserts missing default data. Idempotent –
 * runs automatically every time the server starts, and via `npm run setup`.
 */
async function setupDatabase({ demo: withDemo = false, quiet = false } = {}) {
  const { database: dbName, ...cfg } = dbSettings();
  const console = quiet ? { log: () => {} } : global.console;
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true, charset: 'utf8mb4' });
  // Shared/cPanel hosting users usually cannot CREATE DATABASE – that's fine if the
  // database was already created in the hosting panel, so only try and carry on.
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (e) {
    console.log(`ℹ Could not create database "${dbName}" (${e.code}) – using the existing database.`);
  }
  try {
    await conn.query(`USE \`${dbName}\``);
  } catch (e) {
    throw new Error(
      `Cannot open database "${dbName}" as user "${cfg.user}" (${e.code}).\n` +
        '  → Create the database and user in your hosting panel (MySQL Databases), give the user ALL PRIVILEGES on it,\n' +
        '    and put the exact names in server/.env (DB_NAME, DB_USER, DB_PASSWORD). No MySQL admin/root login is needed.'
    );
  }
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  console.log('✔ Schema ready');

  const q = async (sql, params) => (await conn.query(sql, params))[0];
  const count = async (table) => (await q(`SELECT COUNT(*) c FROM \`${table}\``))[0].c;

  // ---- incremental migrations (safe on existing databases) ----
  const addColumn = async (table, column, definition) => {
    const exists = await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
    if (!exists.length) await q(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  };
  await addColumn('quotations', 'project_id', 'INT NULL');
  await addColumn('quotations', 'accepted_by', 'VARCHAR(150) NULL');
  await addColumn('quotations', 'accepted_at', 'DATETIME NULL');
  await addColumn('quotations', 'accepted_ip', 'VARCHAR(60) NULL');
  await addColumn('quotations', 'viewed_at', 'DATETIME NULL');
  await addColumn('invoices', 'project_id', 'INT NULL');
  await addColumn('invoices', 'viewed_at', 'DATETIME NULL');
  await addColumn('contracts', 'viewed_at', 'DATETIME NULL');
  // logo/favicon now ship with the website build (works when site & API are served separately)
  await q("UPDATE settings SET `value` = '/logo.png' WHERE `key` = 'logo' AND `value` = '/assets/logo.png'");
  await q("UPDATE settings SET `value` = '/favicon.png' WHERE `key` = 'favicon' AND `value` = '/assets/logo-icon.png'");
  // repair website / API URLs saved with a typo such as "https:/site.com"
  for (const key of ['site_url', 'api_public_url']) {
    const row = (await q('SELECT `value` FROM settings WHERE `key` = ?', [key]))[0];
    if (row && row.value && fixUrl(row.value) !== row.value) await q('UPDATE settings SET `value` = ? WHERE `key` = ?', [fixUrl(row.value), key]);
  }
  console.log('✔ Migrations');

  // settings – only insert missing keys, never overwrite admin changes
  for (const [k, v] of Object.entries(SETTINGS)) await q('INSERT IGNORE INTO settings (`key`, `value`) VALUES (?, ?)', [k, v]);
  console.log('✔ Settings');

  // admin user
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@yjtechnosoft.com').toLowerCase();
  if (!(await q('SELECT id FROM users WHERE email = ?', [adminEmail])).length) {
    await q('INSERT INTO users SET ?', [{ name: process.env.ADMIN_NAME || 'Administrator', email: adminEmail, role: 'admin', password_hash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10) }]);
    global.console.log(`✔ Admin user created: ${adminEmail} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}`);
  }

  // our own products. Each built-in product is added once (remembered in
  // settings.seeded_products), so a product deleted in the admin stays deleted.
  const seeded = new Set(String((await q("SELECT `value` FROM settings WHERE `key` = 'seeded_products'"))[0]?.value || '').split(',').filter(Boolean));
  const productDir = path.join(__dirname, '..', 'uploads', 'products');
  for (const prod of BUILTIN_PRODUCTS) {
    if (seeded.has(prod.slug)) continue;
    if (!(await q('SELECT id FROM products WHERE slug = ?', [prod.slug])).length) {
      fs.mkdirSync(productDir, { recursive: true });
      for (const f of [prod.logo, prod.image].filter(Boolean).map((u) => path.basename(u))) {
        const src = path.join(__dirname, '..', 'assets', 'products', f);
        if (fs.existsSync(src) && !fs.existsSync(path.join(productDir, f))) fs.copyFileSync(src, path.join(productDir, f));
      }
      await q('INSERT INTO products SET ?', [prod]);
    }
    seeded.add(prod.slug);
  }
  await q("INSERT INTO settings (`key`, `value`) VALUES ('seeded_products', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", [[...seeded].join(',')]);

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
  if (!(await count('contract_templates'))) {
    await q('INSERT INTO contract_templates (name, type, title, body) VALUES ?', [CONTRACT_TEMPLATES.map((t) => [t.name, t.type, t.title, t.body])]);
  }
  await q("INSERT IGNORE INTO settings (`key`, `value`) VALUES ('contract_prefix', 'YJ/AGR')");
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

  if (withDemo) await demo(q);
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

module.exports = { setupDatabase };

if (require.main === module) setupDatabase({ demo: process.argv.includes('--demo') }).catch((e) => {
  console.error('✖ Setup failed:', e.message);
  if (e.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('  → The DB_USER / DB_PASSWORD in server/.env are wrong, or the user is not allowed to connect from this host.');
    console.error('    On cPanel hosting the names usually have a prefix, e.g. DB_USER=cpaneluser_yj and DB_NAME=cpaneluser_yjtechnosoft.');
  }
  process.exit(1);
});
