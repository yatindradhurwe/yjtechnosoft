/**
 * Starting points for new profiles. Text in [square brackets] is guidance the
 * customer replaces with their own details.
 */
let n = 0;
const id = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;
const S = (kind, fields) => ({ id: id(), kind, kicker: '', title: '', intro: '', newPage: false, hidden: false, ...fields });

function companyTemplate(name = '[Company Name]') {
  return {
    theme: 'navy-gold',
    colors: {},
    basics: {
      name,
      subtitle: 'Private Limited',
      headline: '[Your headline,\ne.g. Engineering Digital Transformation.]',
      tagline: '[Service 1 · Service 2 · Service 3]',
      docLabel: 'Company Profile',
      edition: `Edition ${new Date().getFullYear()}`,
      logo: '',
      address: '[Registered office address]',
      phone: '[+91 00000 00000]',
      phone2: '',
      email: '[info@company.com]',
      website: '[www.company.com]',
      hours: 'Monday – Saturday, 10:00 AM – 6:00 PM',
      idLine: '[CIN / GSTIN / Registration no.]',
    },
    sections: [
      S('text', { kicker: '01 · Introduction', title: `About ${name}`, intro: '[One or two sentences on what the company does and for whom.]', body: '[Describe the company: when it was founded, where it is based, the sectors it serves and how it works with clients.]\n\n[Second paragraph: capabilities and approach.]', callout: '[Core focus: one line that sums up your value.]', newPage: true }),
      S('facts', { title: 'Company at a glance', items: [{ label: 'Legal name', value: '[Legal name]' }, { label: 'Year of incorporation', value: '[Year]' }, { label: 'Registered office', value: '[Address]' }, { label: 'Leadership', value: '[Director names]' }] }),
      S('cards', { kicker: '02 · Who We Are', title: 'Mission & Vision', style: 'dark', columns: 2, items: [{ title: 'Mission', text: '[Your mission]' }, { title: 'Vision', text: '[Your vision]' }], newPage: true }),
      S('cards', { title: 'What we do', columns: 3, items: [{ title: '[Service 1]', text: '[Short description]' }, { title: '[Service 2]', text: '[Short description]' }, { title: '[Service 3]', text: '[Short description]' }] }),
      S('projects', { kicker: '03 · Portfolio', title: 'Selected Projects', items: [{ name: '[Project name]', category: '[Sector]', summary: '[What the project does]', features: '[Feature 1]\n[Feature 2]\n[Feature 3]', client: '[Client or "Confidential"]', year: '[Year]', image: '' }], newPage: true }),
      S('table', { kicker: '04 · Methodology', title: 'How We Deliver', columns: ['Phase', 'What happens', 'Output'], rows: [['Discovery', 'Study of current process and users', 'Requirement document'], ['Design', 'Screens, data and user roles', 'Design approval'], ['Development', 'Phase-wise build with demonstrations', 'Working modules'], ['Deployment', 'Go-live, training and handover', 'Live system'], ['Support', 'Maintenance and updates', 'Support plan']], newPage: true }),
      S('contact', { kicker: 'Contact', title: "Let's work together.", body: '[A short closing line inviting the reader to get in touch.]', newPage: true }),
    ],
  };
}

function personalTemplate(name = '[Your Full Name]') {
  return {
    theme: 'navy-gold',
    colors: {},
    basics: {
      name,
      subtitle: '[Designation, Organization]',
      docLabel: 'Professional Profile',
      photo: '',
      address: '[City, State]',
      phone: '[+91 00000 00000]',
      email: '[you@email.com]',
      website: '',
      linkedin: '[linkedin.com/in/you]',
    },
    sections: [
      S('text', { title: 'Profile', intro: '[One-line professional summary.]', body: '[Two or three short paragraphs about your work, focus and achievements.]' }),
      S('chips', { title: 'Areas of expertise', items: [{ text: '[Skill 1]' }, { text: '[Skill 2]' }, { text: '[Skill 3]' }] }),
      S('list', { title: 'Highlights', items: [{ text: '[Achievement 1]' }, { text: '[Achievement 2]' }] }),
      S('timeline', { kicker: 'Career', title: 'Experience', items: [{ when: '[2021 — Present]', title: '[Role · Organization]', text: '[Responsibilities and outcomes]' }], newPage: true }),
      S('cards', { title: 'Education & certifications', columns: 2, items: [{ title: 'Education', text: '[Degree · Institution · Year]' }, { title: 'Certifications', text: '[Only those actually held]' }] }),
    ],
  };
}

// --------------------------------------------------------------- YJ Technosoft
const YJ = {
  address: 'Rajmahal Chowk, Kawardha, Chhattisgarh',
  phone: '+91 70007 96585',
  phone2: '+91 87705 10012',
  email: 'yjtechnosoft@gmail.com',
  idLine: 'CIN U72900CT2021PTC012188',
};

const proj = (name, category, summary, features, extra = {}) => ({ name, category, summary, features: features.join('\n'), client: '', year: '', image: '', ...extra });

function yjCompany() {
  return {
    theme: 'navy-gold',
    colors: {},
    basics: {
      name: 'YJ Technosoft',
      monogram: 'YJ',
      subtitle: 'Private Limited',
      headline: 'Engineering\nDigital Transformation.',
      tagline: 'Government Digitization · Enterprise Software · Intelligent Business Solutions',
      docLabel: 'Corporate Capability Profile',
      edition: `Edition ${new Date().getFullYear()}`,
      logo: '',
      ...YJ,
      website: 'yjtechnosoft.com',
      hours: 'Monday – Saturday, 10:00 AM – 6:00 PM',
    },
    sections: [
      S('text', {
        kicker: '01 · Executive Introduction',
        title: 'About YJ Technosoft Private Limited',
        intro: 'YJ Technosoft Private Limited is a technology and software development company focused on building digital solutions that help organizations improve operational efficiency, streamline workflows and modernize business processes.',
        body: "Incorporated in 2021 and headquartered in Kawardha, Chhattisgarh, the company's project portfolio spans government digitization, enterprise application development, healthcare technology, business communication platforms, legal case management, real estate CRM, procurement support, human resources and payroll systems, and digital marketplaces.\n\nYJ Technosoft approaches software development with an emphasis on understanding operational requirements, designing practical technology solutions, developing user-oriented applications and supporting digital implementation. Its capabilities encompass web and mobile application development, backend systems, API integration, database design, workflow automation and application deployment.",
        callout: 'Core focus: practical technology, process digitization and custom software solutions aligned with organizational needs.',
        newPage: true,
      }),
      S('facts', { title: 'Company at a glance', items: [{ label: 'Legal name', value: 'YJTECHNOSOFT PRIVATE LIMITED' }, { label: 'Corporate Identity Number', value: 'U72900CT2021PTC012188' }, { label: 'Year of incorporation', value: '2021' }, { label: 'Registered office', value: YJ.address }, { label: 'Delivered projects in this profile', value: '12, across 10 sectors' }] }),
      S('cards', { kicker: '02 · Who We Are', title: 'Mission, Vision & Capabilities', style: 'dark', columns: 2, items: [{ title: 'Mission', text: 'To make dependable technology accessible and affordable for every business and public institution.' }, { title: 'Vision', text: 'To be the most trusted technology partner in Central India, known for quality, transparency and long-term support.' }], newPage: true }),
      S('cards', { title: 'What we do', columns: 3, items: [
        { title: 'Government Digitization', text: 'Digitizing registers, complaints and departmental workflows with role-based access and audit trails.' },
        { title: 'Enterprise Applications', text: 'HR, payroll, CRM, procurement and operations software built around how the organization actually works.' },
        { title: 'Web & Mobile Products', text: 'Customer-facing portals, marketplaces and Android / iOS applications with admin panels.' },
        { title: 'Communication Platforms', text: 'SMS, email and WhatsApp Business messaging integrated into business workflows.' },
        { title: 'Integration & Automation', text: 'API integration, payment gateways, notifications and scheduled workflow automation.' },
        { title: 'Hosting & Support', text: 'Deployment, domains, hosting, SSL, backups and annual maintenance support.' },
      ] }),
      S('text', { kicker: '03 · Government Digital Transformation', title: 'Digitizing Public Service Workflows', intro: 'Government offices run on registers, files and follow-ups. YJ Technosoft builds systems that move those records into secure, searchable digital workflows, without forcing staff to change how the work itself is done.', body: '', newPage: true }),
      S('list', { title: 'Our approach for public institutions', items: [
        { text: 'Understand the register first: each system starts from the registers, forms and reporting formats already in use.' },
        { text: 'Role-based access: officers, operators and supervisors see only what their role permits.' },
        { text: 'Audit trails: entries and changes are recorded so records remain accountable.' },
        { text: 'Search and retrieval: archived records are retrievable by number, date, name or category.' },
        { text: 'On-site training and support after go-live.' },
      ] }),
      S('facts', { kicker: 'Flagship Case Study · Government', title: 'CGP Digital — Raigarh Police', items: [
        { label: 'Client', value: 'Office of the Superintendent of Police, Raigarh, Chhattisgarh' },
        { label: 'Sector', value: 'Government · Law enforcement' },
        { label: 'Solution', value: 'Digital complaint registration, archiving and police-station register management' },
        { label: "YJ Technosoft's role", value: '[Development / implementation / deployment / maintenance]' },
        { label: 'Delivery year', value: '[Year]' },
        { label: 'Status', value: 'Completed and delivered' },
      ], newPage: true }),
      S('text', { title: 'The challenge', body: 'Police stations maintain complaints and a range of statutory and administrative registers on paper. Paper records are slow to search, difficult to consolidate for supervisory review and vulnerable to wear and loss over time.' }),
      S('list', { title: 'The solution', items: [
        { text: 'Complaint registration: structured digital entry of complaints with unique numbering and status tracking.' },
        { text: 'Register management: police-station registers maintained in digital form.' },
        { text: 'Digital archive: historical records stored securely and retrievable through search.' },
        { text: 'Role-based access: separate permissions for station staff and supervising officers.' },
      ] }),
      S('cards', { kicker: '04 · Enterprise Application Development', title: 'Architecture & Engineering', intro: 'Every platform follows the same architecture: a responsive web or mobile front end, a secure API layer, a relational database and an administrative back office.', columns: 2, items: [
        { title: 'Front end', text: 'Responsive web applications, admin panels and Android / iOS apps.\nReact · Vite · Tailwind CSS · Flutter · React Native' },
        { title: 'Back end & APIs', text: 'REST APIs with token-based authentication and role-based authorization.\nNode.js · Express · JWT' },
        { title: 'Data', text: 'Relational database design, reporting queries and scheduled backups.\nMySQL · MariaDB' },
        { title: 'Integrations', text: 'SMTP · SMS gateways · WhatsApp Cloud API · UPI / payment gateways · PDF generation · Web push' },
      ], newPage: true }),
      S('projects', { kicker: '05 · Selected Project Portfolio', title: 'Delivered Platforms', items: [
        proj('Heal Mirror', 'Healthcare', 'A healthcare platform connecting doctors and patients for appointment booking and remote consultation.', ['Doctor discovery and appointment scheduling', 'Audio and video consultation workflows', 'Patient and doctor accounts with consultation history']),
        proj('ASP Utility — SMS & WhatsApp Business', 'Communications', 'A business messaging platform for SMS campaigns and WhatsApp Business communication.', ['Bulk and transactional SMS campaigns', 'WhatsApp Business messaging workflows', 'Contact lists, templates and delivery logs']),
        proj('Tobacco Monitoring Platform', 'Monitoring', 'A monitoring and reporting platform supporting field activities and compliance tracking.', ['Recording of monitoring activities', 'Reporting workflows and consolidated dashboards', 'Role-based access for field and supervisory users']),
        proj('Litigation & Legal Chamber Platform', 'LegalTech', 'A practice-management platform for advocates and legal chambers.', ['Litigation and case tracking', 'Hearing schedules and reminders', 'Client records and legal document management']),
        proj('Real Estate CRM', 'PropTech', 'A CRM for property developers and brokers to manage inventory and the sales pipeline.', ['Property inventory', 'Customer lead capture and follow-ups', 'Sales pipeline dashboard']),
        proj('Tender Support Platform', 'Procurement', 'A platform for discovering government and private tenders and managing bid preparation.', ['Tender discovery and search', 'Opportunity tracking and deadlines', 'Bid-management support']),
        proj('HR & Payroll System', 'Enterprise', 'A workforce administration system covering the employee lifecycle from joining to payroll.', ['Employee records, attendance and leave', 'Payroll and payslip generation', 'Offer, appointment and experience letters']),
        proj('Cloud Tiffin', 'Food-tech', 'A meal subscription platform connecting customers with tiffin and food vendors.', ['Customer meal subscriptions and plans', 'Vendor management', 'Order processing']),
        proj('Job Portal', 'Recruitment', 'A recruitment portal connecting employers and job seekers.', ['Job listings and search', 'Employer and candidate accounts', 'Applications and recruitment management']),
        proj('All In One Service', 'Marketplace', 'A multi-service marketplace for booking local service providers.', ['Customer booking across service categories', 'Service-provider onboarding', 'Order and booking management']),
        proj('AdOnRoute', 'Ad-tech', 'An outdoor advertising platform for discovering billboard sites and managing campaigns.', ['Map-based billboard discovery', 'Advertising inventory management', 'Campaign management']),
      ], newPage: true }),
      S('table', { kicker: '06 · Technology & Delivery Methodology', title: 'How We Deliver', columns: ['Phase', 'What happens', 'Output'], rows: [
        ['Discovery', 'Study of current process, registers, forms and users', 'Requirement document'],
        ['Proposal', 'Scope, timeline and commercial proposal', 'Quotation / agreement'],
        ['Design', 'Database design, user roles and screen layouts', 'Design approval'],
        ['Development', 'Phase-wise build with regular demonstrations', 'Working modules'],
        ['Testing', 'Functional testing with sample data and user acceptance', 'UAT sign-off'],
        ['Deployment', 'Installation on client server or managed hosting; SSL and backups', 'Live system'],
        ['Training', 'Orientation for operators and administrators', 'Trained users'],
        ['Support', 'Bug fixing, updates and annual maintenance', 'AMC / support plan'],
      ], newPage: true }),
      S('cards', { kicker: '07 · Information Security & Data Management', title: 'Protecting Records', columns: 2, items: [
        { title: 'Access control', points: 'Individual user logins\nRole-based permissions\nHashed passwords; token-based sessions' },
        { title: 'Data protection', points: 'HTTPS / SSL on all deployments\nScheduled database backups\nPrivate storage for uploaded documents' },
        { title: 'Accountability', points: 'Audit trails on record changes\nMessage and activity logs' },
        { title: 'Confidentiality', points: 'NDA available for every engagement\nClient data never used in marketing' },
      ], newPage: true }),
      S('cards', { kicker: '08 · Engagement Models', title: 'Working With Us', style: 'dark', columns: 3, items: [
        { title: 'Custom Development', text: 'A system built to your requirements: fixed scope, phase-wise milestones and full handover.' },
        { title: 'Implementation', text: 'Configuration and deployment of an existing YJ Technosoft platform, adapted to your workflows.' },
        { title: 'Maintenance & AMC', text: 'Bug fixes, updates, backups, security patches and user support.' },
      ] }),
      S('contact', { kicker: 'Contact', title: "Let's build it together.", body: 'For project discussions, demonstrations or a detailed proposal, contact our team.', newPage: true }),
    ],
  };
}

function yjFounder() {
  const t = personalTemplate('[Your Full Name]');
  t.basics = { ...t.basics, subtitle: 'Director, YJ Technosoft Private Limited', docLabel: 'Founder & Director · Professional Profile', address: 'Kawardha, Chhattisgarh', phone: YJ.phone, email: '[your email]' };
  t.sections = [
    S('text', { title: 'Profile', intro: 'Technology entrepreneur and founder of YJ Technosoft Private Limited, a software development company incorporated in 2021 in Kawardha, Chhattisgarh.', body: "Leads the company's work in government digitization and enterprise software, from requirement study through design, development, deployment and long-term support. Under this leadership the company has delivered platforms across policing, healthcare, legal, real estate, procurement, HR and payroll, communications and consumer services, including CGP Digital for Raigarh Police." }),
    S('chips', { title: 'Areas of expertise', items: ['Government digitization', 'E-governance systems', 'Enterprise application design', 'Product management', 'Requirement analysis', 'Web & mobile development', 'Database design', 'API integration', 'Project delivery', 'Team leadership'].map((text) => ({ text })) }),
    S('list', { title: 'Leadership highlights', items: [
      { text: 'Founded and incorporated YJ Technosoft Private Limited (CIN U72900CT2021PTC012188) in 2021.' },
      { text: 'Led delivery of CGP Digital, a complaint registration, archiving and register management system for Raigarh Police.' },
      { text: 'Built a portfolio of 12 delivered platforms across 10 sectors.' },
    ] }),
    S('timeline', { kicker: 'Career', title: 'Experience', items: [{ when: '2021 — Present', title: 'Founder & Director · YJ Technosoft Private Limited', text: 'Leads strategy, client engagement and delivery for government and enterprise software projects.' }, { when: '[Years]', title: '[Previous role · Organization]', text: '[Responsibilities and outcomes]' }], newPage: true }),
    S('cards', { title: 'Education & certifications', columns: 2, items: [{ title: 'Education', text: '[Degree · Institution · Year]' }, { title: 'Certifications', text: '[Only those actually held]' }] }),
  ];
  return t;
}

module.exports = { companyTemplate, personalTemplate, yjCompany, yjFounder };
