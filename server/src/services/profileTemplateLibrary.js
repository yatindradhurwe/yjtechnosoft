/**
 * Built-in template library, grouped by category. These are copied into the
 * `profile_templates` table on first setup, after which admins can edit,
 * hide, duplicate or delete them from the admin panel.
 *
 * Text in [square brackets] is guidance the customer replaces. "[Company Name]"
 * and "[Your Full Name]" are swapped for the name entered when a profile is created.
 */
const { yjCompany, yjFounder, companyTemplate, personalTemplate } = require('./profileTemplates');

let n = 0;
const id = () => `t${(n++).toString(36)}`;
const S = (kind, fields) => ({ id: id(), kind, kicker: '', title: '', intro: '', newPage: false, hidden: false, ...fields });
const cards = (pairs) => pairs.map(([title, text]) => ({ title, text }));
const items = (list) => list.map((text) => ({ text }));
const N = '[Company Name]';
const P = '[Your Full Name]';

/* ------------------------------------------------------------------ firm builder */
function firm(o) {
  const num = (i) => String(i).padStart(2, '0');
  let k = 1;
  const sections = [
    S('text', {
      kicker: `${num(k++)} · About Us`,
      title: `About ${N}`,
      intro: o.intro,
      body: o.about,
      callout: o.callout || '',
      newPage: true,
    }),
    S('facts', { title: `${o.short || 'Company'} at a glance`, items: o.facts.map(([label, value]) => ({ label, value })) }),
    S('cards', { kicker: `${num(k++)} · Who We Are`, title: 'Mission & Vision', style: 'dark', columns: 2, items: cards([['Mission', o.mission], ['Vision', o.vision]]), newPage: true }),
    S('cards', { title: o.servicesTitle || 'What we do', intro: o.servicesIntro || '', columns: 3, items: cards(o.services) }),
  ];
  for (const x of o.extra || []) sections.push(S(x.kind, { ...x, kicker: x.kicker === undefined ? `${num(k++)} · ${x.title}` : x.kicker }));
  if (o.portfolio) {
    sections.push(
      S('projects', {
        kicker: `${num(k++)} · ${o.portfolio.kicker || 'Portfolio'}`,
        title: o.portfolio.title,
        items: o.portfolio.items.map(([name, category, summary, features]) => ({ name, category, summary, features: features.join('\n'), client: '[Client or "Confidential"]', year: '[Year]', image: '' })),
        newPage: true,
      })
    );
  }
  if (o.clients) sections.push(S('chips', { title: o.clients.title || 'Our clients', items: items(o.clients.items) }));
  if (o.process) {
    sections.push(S('table', { kicker: `${num(k++)} · How We Work`, title: o.process.title || 'Our process', columns: ['Step', 'What happens', 'Outcome'], rows: o.process.rows, newPage: true }));
  }
  if (o.why) sections.push(S('list', { title: o.whyTitle || `Why choose ${N}`, columns: 2, items: items(o.why) }));
  if (o.certs) sections.push(S('cards', { title: 'Registrations & certifications', columns: 3, items: cards(o.certs) }));
  sections.push(S('contact', { kicker: 'Contact', title: o.closing || "Let's work together.", body: o.closingText || '[One line inviting the reader to get in touch.]', newPage: true }));
  return {
    theme: o.theme,
    colors: {},
    basics: {
      name: N,
      subtitle: o.subtitle ?? 'Private Limited',
      headline: o.headline,
      tagline: o.tagline,
      docLabel: o.docLabel || 'Company Profile',
      edition: `Edition ${new Date().getFullYear()}`,
      logo: '',
      address: '[Registered office address]',
      phone: '[+91 00000 00000]',
      phone2: '',
      email: '[info@yourfirm.com]',
      website: '[www.yourfirm.com]',
      hours: o.hours || 'Monday – Saturday, 10:00 AM – 6:00 PM',
      idLine: o.idLine || '[CIN / GSTIN / Registration no.]',
    },
    sections,
  };
}

/* ------------------------------------------------------------------ individual builder */
function person(o) {
  const sections = [
    S('text', { title: o.profileTitle || 'Profile', intro: o.intro, body: o.about }),
    S('chips', { title: o.skillsTitle || 'Areas of expertise', items: items(o.skills) }),
    S('list', { title: o.highlightsTitle || 'Highlights', items: items(o.highlights) }),
  ];
  for (const x of o.before || []) sections.push(S(x.kind, x));
  sections.push(
    S('timeline', {
      kicker: o.timelineKicker || 'Career',
      title: o.timelineTitle || 'Experience',
      items: o.timeline.map(([when, title, text]) => ({ when, title, text })),
      newPage: true,
    })
  );
  for (const x of o.extra || []) sections.push(S(x.kind, x));
  sections.push(S('cards', { title: o.eduTitle || 'Education & certifications', columns: 2, items: cards(o.education || [['Education', '[Degree · Institution · Year]'], ['Certifications', '[Only those actually held]']]) }));
  return {
    theme: o.theme,
    colors: {},
    basics: {
      name: P,
      subtitle: o.role,
      docLabel: o.docLabel || 'Professional Profile',
      photo: '',
      address: '[City, State]',
      phone: '[+91 00000 00000]',
      email: '[you@email.com]',
      website: '',
      linkedin: o.linkedin === false ? '' : '[linkedin.com/in/you]',
    },
    sections,
  };
}

const steps = (rows) => rows;

/* ------------------------------------------------------------------ firms */
const FIRMS = [
  {
    code: 'company', name: 'General business', category: 'General Business', description: 'A clean all-purpose company profile for any kind of business.',
    data: () => companyTemplate(N),
  },
  {
    code: 'firm-it', name: 'IT & software company', category: 'IT & Software', description: 'Services, technology stack, project portfolio and delivery process.',
    data: () => firm({
      theme: 'navy-gold', headline: 'Engineering\nDigital Transformation.', tagline: 'Software Development · Web & Mobile Apps · Cloud & Support',
      intro: '[Company Name] builds software that helps organizations work faster and serve their customers better.',
      about: '[When the company was founded, where it is based and the industries it serves.]\n\n[What makes your team different: domain knowledge, quality, support.]',
      callout: '[Core focus in one line.]',
      facts: [['Legal name', '[Legal name]'], ['Year of incorporation', '[Year]'], ['Team size', '[Number of developers, designers, testers]'], ['Head office', '[City, State]']],
      mission: '[Your mission]', vision: '[Your vision]',
      services: [['Custom software', 'Business applications built around your workflows.'], ['Web & mobile apps', 'Responsive websites, portals and Android / iOS apps.'], ['Cloud & hosting', 'Deployment, hosting, backups and monitoring.'], ['E-governance', 'Digital systems for government departments.'], ['Integrations', 'Payment gateways, SMS, WhatsApp and third-party APIs.'], ['Support & AMC', 'Maintenance, updates and user support.']],
      extra: [{ kind: 'chips', title: 'Technology stack', kicker: '', items: items(['[React]', '[Node.js]', '[Flutter]', '[MySQL]', '[AWS]']) }],
      portfolio: { title: 'Selected projects', items: [['[Project name]', '[Sector]', '[What the system does]', ['[Feature 1]', '[Feature 2]', '[Feature 3]']], ['[Project name]', '[Sector]', '[What the system does]', ['[Feature 1]', '[Feature 2]']]] },
      process: { title: 'How we deliver', rows: steps([['Discovery', 'Requirement study with your team', 'Scope document'], ['Design', 'Screens, data and user roles', 'Approved design'], ['Development', 'Phase-wise build with demos', 'Working modules'], ['Testing', 'Functional and user testing', 'UAT sign-off'], ['Go-live', 'Deployment and training', 'Live system'], ['Support', 'Maintenance and updates', 'AMC']]) },
      why: ['One team from requirement to support', 'Transparent pricing and timelines', 'Local support and on-site training', 'Secure, well-documented code'],
    }),
  },
  {
    code: 'firm-construction', name: 'Construction & contractor', category: 'Construction & Infrastructure', description: 'Projects executed, equipment, registrations and safety for contractors and builders.',
    data: () => firm({
      theme: 'charcoal', headline: 'Building Quality.\nDelivering on Time.', tagline: 'Civil Works · Roads & Bridges · Buildings · Government Contracts',
      intro: '[Company Name] is a civil construction company executing government and private infrastructure projects.',
      about: '[Year established, class of registration, regions where you work.]\n\n[Types of works executed and the scale of projects handled.]',
      facts: [['Contractor class', '[Class A / B / C – Department]'], ['Year established', '[Year]'], ['Works completed', '[Number] projects'], ['Annual turnover', '[Only if you wish to disclose]'], ['Workforce', '[Engineers, supervisors, labour]']],
      mission: 'To deliver safe, durable infrastructure on schedule and within budget.', vision: '[Your vision]',
      servicesTitle: 'Our services',
      services: [['Buildings', 'Residential, commercial and institutional buildings.'], ['Roads & bridges', 'PMGSY, PWD and municipal road works.'], ['Water & drainage', 'Pipelines, tanks and drainage systems.'], ['Electrical works', 'Internal and external electrification.'], ['Renovation', 'Repair, retrofitting and maintenance.'], ['Turnkey projects', 'Design-to-handover execution.']],
      extra: [{ kind: 'table', title: 'Plant & machinery', columns: ['Equipment', 'Quantity', 'Ownership'], rows: [['[JCB / Excavator]', '[2]', '[Owned]'], ['[Concrete mixer]', '[4]', '[Owned]'], ['[Tipper / Dumper]', '[3]', '[Hired]']] }],
      portfolio: { kicker: 'Works Executed', title: 'Major projects', items: [['[Name of work]', '[Department]', '[Scope, location and value]', ['[Length / area]', '[Completion period]', '[Status: completed]']], ['[Name of work]', '[Department]', '[Scope, location and value]', ['[Key quantities]', '[Completion period]']]] },
      clients: { title: 'Departments & clients', items: ['[PWD]', '[Municipal Corporation]', '[RES]', '[Private developer]'] },
      why: ['Experienced engineers on every site', 'Own machinery for faster execution', 'Strict quality and safety checks', 'Record of on-time completion'],
      certs: [['Contractor registration', '[Department · Class · No.]'], ['GST & PAN', '[GSTIN]'], ['Labour licence / ESI / EPF', '[Numbers]']],
    }),
  },
  {
    code: 'firm-legal', name: 'Law firm / advocate chamber', category: 'Legal', description: 'Practice areas, courts, team of advocates and notable matters.',
    data: () => firm({
      theme: 'maroon', subtitle: 'Advocates & Legal Consultants', docLabel: 'Firm Profile', short: 'Firm',
      headline: 'Counsel You Can Trust.', tagline: 'Litigation · Corporate · Property · Arbitration',
      intro: '[Company Name] is a full-service law firm advising individuals, businesses and institutions.',
      about: '[Year founded, founding partners, courts where the firm practices.]\n\n[Approach to clients: confidentiality, clarity on costs, responsiveness.]',
      facts: [['Founded', '[Year]'], ['Courts', '[High Court, District Court, Tribunals]'], ['Advocates', '[Number]'], ['Office', '[Chamber address]']],
      mission: 'To provide sound, ethical and timely legal counsel.', vision: '[Your vision]',
      servicesTitle: 'Practice areas',
      services: [['Civil litigation', 'Suits, appeals and execution proceedings.'], ['Criminal law', 'Bail, trial and appellate matters.'], ['Corporate & commercial', 'Contracts, compliance and company matters.'], ['Property & real estate', 'Title search, registration and disputes.'], ['Family law', 'Divorce, custody and succession.'], ['Arbitration & mediation', 'Dispute resolution outside court.']],
      extra: [{ kind: 'cards', title: 'Our advocates', columns: 3, items: cards([['[Name], Senior Partner', '[Enrolment year · Practice areas]'], ['[Name], Partner', '[Enrolment year · Practice areas]'], ['[Name], Associate', '[Enrolment year · Practice areas]']]) }],
      portfolio: { kicker: 'Notable Matters', title: 'Representative matters', items: [['[Matter description]', '[Court]', '[Outcome, without confidential details]', ['[Area of law]']]] },
      why: ['Strict client confidentiality', 'Clear advice and fee estimates', 'Experienced in trial and appellate courts', 'Regular case updates'],
      idLine: '[Bar Council enrolment no.]',
    }),
  },
  {
    code: 'firm-ca', name: 'CA / accounting firm', category: 'Finance & Accounting', description: 'Audit, tax, GST and advisory services with partners and clients.',
    data: () => firm({
      theme: 'royal', subtitle: 'Chartered Accountants', docLabel: 'Firm Profile', short: 'Firm',
      headline: 'Numbers You Can Rely On.', tagline: 'Audit · Taxation · GST · Business Advisory',
      intro: '[Company Name] is a firm of Chartered Accountants providing audit, tax and advisory services.',
      about: '[Year of establishment, FRN, partners and branches.]\n\n[Types of clients served: companies, banks, government bodies, individuals.]',
      facts: [['Firm Registration No.', '[FRN]'], ['Established', '[Year]'], ['Partners', '[Number]'], ['Empanelment', '[C&AG / RBI / Bank panels]']],
      mission: 'To help clients stay compliant and make better financial decisions.', vision: '[Your vision]',
      services: [['Statutory & internal audit', 'Companies, banks, societies and trusts.'], ['Income tax', 'Returns, assessments and appeals.'], ['GST', 'Registration, returns, audit and notices.'], ['Company law', 'ROC filings and compliance.'], ['Bank audits', 'Concurrent, stock and branch audits.'], ['Advisory', 'Project reports, valuation and CMA data.']],
      extra: [{ kind: 'cards', title: 'Partners', columns: 2, items: cards([['CA [Name], FCA', '[Membership no. · Experience · Specialisation]'], ['CA [Name], ACA', '[Membership no. · Experience · Specialisation]']]) }],
      clients: { title: 'Clients served', items: ['[Public sector banks]', '[Private companies]', '[Cooperative societies]', '[Trusts & NGOs]'] },
      why: ['Partners involved in every assignment', 'Deadlines tracked for every filing', 'Confidential handling of records', 'Clear fee structure'],
      idLine: '[FRN · ICAI membership]',
    }),
  },
  {
    code: 'firm-healthcare', name: 'Hospital / clinic', category: 'Healthcare', description: 'Departments, doctors, facilities, empanelments and patient care.',
    data: () => firm({
      theme: 'teal', subtitle: 'Multi-Speciality Hospital', docLabel: 'Hospital Profile', short: 'Hospital',
      headline: 'Care That Comes First.', tagline: 'Emergency · Surgery · Diagnostics · 24×7 Pharmacy',
      intro: '[Company Name] provides quality healthcare with experienced doctors and modern facilities.',
      about: '[Year started, number of beds, specialities and the community you serve.]\n\n[Accreditations and patient-care approach.]',
      facts: [['Beds', '[Number] (ICU [n], NICU [n])'], ['Established', '[Year]'], ['Doctors', '[Number] specialists'], ['Registration', '[Clinical Establishment Reg. no.]']],
      mission: 'To provide accessible, ethical and quality healthcare to every patient.', vision: '[Your vision]',
      servicesTitle: 'Departments',
      services: [['General medicine', '[Details]'], ['General & laparoscopic surgery', '[Details]'], ['Obstetrics & gynaecology', '[Details]'], ['Paediatrics', '[Details]'], ['Orthopaedics', '[Details]'], ['Emergency & trauma', '24×7 emergency care.']],
      extra: [
        { kind: 'list', title: 'Facilities', columns: 2, items: items(['[Modular OT]', '[ICU / NICU]', '[Digital X-ray, ultrasound, CT]', '[Pathology lab]', '[Ambulance]', '[24×7 pharmacy]']) },
        { kind: 'cards', title: 'Our doctors', columns: 3, items: cards([['Dr. [Name]', '[Qualification · Speciality]'], ['Dr. [Name]', '[Qualification · Speciality]'], ['Dr. [Name]', '[Qualification · Speciality]']]) },
      ],
      clients: { title: 'Empanelments & insurance', items: ['[Ayushman Bharat]', '[State health scheme]', '[TPA / insurance companies]'] },
      why: ['Experienced specialists', '24×7 emergency services', 'Cashless treatment under major schemes', 'Clean, patient-friendly environment'],
      hours: 'Open 24 × 7', idLine: '[Registration no. · NABH status]',
    }),
  },
  {
    code: 'firm-education', name: 'School / college / coaching', category: 'Education', description: 'Courses, faculty, infrastructure, results and achievements.',
    data: () => firm({
      theme: 'royal', subtitle: '[Affiliated to CBSE / University]', docLabel: 'Institution Profile', short: 'Institution',
      headline: 'Learning That Shapes Futures.', tagline: '[Classes / Courses offered]',
      intro: '[Company Name] is committed to quality education and the all-round development of every student.',
      about: '[Year founded, affiliation, managing society or trust.]\n\n[Teaching approach and what makes the institution special.]',
      facts: [['Established', '[Year]'], ['Affiliation', '[Board / University · Affiliation no.]'], ['Students', '[Number]'], ['Faculty', '[Number]'], ['Campus', '[Area]']],
      mission: '[Your mission]', vision: '[Your vision]',
      servicesTitle: 'Courses & programmes',
      services: [['[Primary / Course 1]', '[Details]'], ['[Secondary / Course 2]', '[Details]'], ['[Senior secondary / Course 3]', '[Details]']],
      extra: [
        { kind: 'list', title: 'Infrastructure', columns: 2, items: items(['[Smart classrooms]', '[Science & computer labs]', '[Library]', '[Sports ground]', '[Transport]', '[CCTV campus]']) },
        { kind: 'table', title: 'Results', columns: ['Year', 'Pass %', 'Toppers'], rows: [['[Year]', '[%]', '[Name – marks]'], ['[Year]', '[%]', '[Name – marks]']] },
      ],
      why: ['Qualified, caring teachers', 'Safe and disciplined campus', 'Focus on academics and activities', 'Regular parent communication'],
    }),
  },
  {
    code: 'firm-manufacturing', name: 'Manufacturing / industry', category: 'Manufacturing & Industry', description: 'Products, plant capacity, quality control and certifications.',
    data: () => firm({
      theme: 'charcoal', headline: 'Precision in Every Product.', tagline: '[Product range]',
      intro: '[Company Name] manufactures [products] for [industries / markets].',
      about: '[Year established, plant location and capacity.]\n\n[Markets served and growth.]',
      facts: [['Plant location', '[Industrial area, City]'], ['Installed capacity', '[Quantity per month]'], ['Established', '[Year]'], ['Employees', '[Number]']],
      mission: '[Your mission]', vision: '[Your vision]',
      servicesTitle: 'Product range',
      services: [['[Product 1]', '[Specifications / grades]'], ['[Product 2]', '[Specifications / grades]'], ['[Product 3]', '[Specifications / grades]']],
      extra: [
        { kind: 'list', title: 'Quality control', items: items(['[In-house testing laboratory]', '[Raw material inspection]', '[Batch-wise test certificates]']) },
        { kind: 'gallery', title: 'Our plant', items: [{ image: '', caption: '[Production line]' }, { image: '', caption: '[Warehouse]' }] },
      ],
      clients: { title: 'Customers & markets', items: ['[Customer 1]', '[Customer 2]', '[Export markets]'] },
      certs: [['ISO certification', '[ISO 9001:2015 – only if held]'], ['BIS / product licence', '[Number]'], ['Udyam / MSME', '[Number]']],
    }),
  },
  {
    code: 'firm-realestate', name: 'Real estate developer', category: 'Real Estate', description: 'Completed and ongoing projects, amenities and approvals.',
    data: () => firm({
      theme: 'emerald', subtitle: 'Builders & Developers', docLabel: 'Company Profile',
      headline: 'Homes Built on Trust.', tagline: 'Residential · Commercial · Plotted Developments',
      intro: '[Company Name] develops quality residential and commercial projects.',
      about: '[Year started, number of projects, area developed and families housed.]\n\n[Commitment to quality, timely possession and clear titles.]',
      facts: [['Projects delivered', '[Number]'], ['Area developed', '[Sq. ft.]'], ['Happy families', '[Number]'], ['RERA registration', '[Number]']],
      mission: '[Your mission]', vision: '[Your vision]',
      servicesTitle: 'What we build',
      services: [['Residential apartments', '[Details]'], ['Independent villas', '[Details]'], ['Commercial spaces', '[Details]']],
      portfolio: { kicker: 'Projects', title: 'Completed & ongoing projects', items: [['[Project name]', '[Completed]', '[Location · type · units]', ['[Amenity 1]', '[Amenity 2]', '[Possession year]']], ['[Project name]', '[Ongoing]', '[Location · type · units]', ['[RERA no.]', '[Expected possession]']]] },
      extra: [{ kind: 'list', title: 'Amenities we offer', columns: 2, items: items(['[Clubhouse]', '[Garden]', '[24×7 security]', '[Power backup]']) }],
      why: ['Clear titles and approvals', 'Timely possession', 'Quality materials', 'Transparent pricing'],
      idLine: '[RERA registration no.]',
    }),
  },
  {
    code: 'firm-hospitality', name: 'Restaurant / hotel / caterer', category: 'Hospitality & Food', description: 'Menu highlights, facilities, events and catering services.',
    data: () => firm({
      theme: 'maroon', subtitle: '[Restaurant · Banquet · Catering]', docLabel: 'Profile',
      headline: 'Great Food.\nWarm Hospitality.', tagline: '[Cuisine] · Dine-in · Banquets · Outdoor Catering',
      intro: '[Company Name] serves [cuisine] with a focus on taste, hygiene and service.',
      about: '[Your story: when you started, your chef and what guests love.]',
      facts: [['Seating', '[Number] covers'], ['Banquet capacity', '[Number] guests'], ['Rooms', '[Number, if a hotel]'], ['FSSAI licence', '[Number]']],
      mission: '[Your mission]', vision: '[Your vision]',
      servicesTitle: 'Our services',
      services: [['Dine-in', '[Details]'], ['Banquets & parties', '[Details]'], ['Outdoor catering', 'Weddings, corporate and government events.'], ['Corporate meals', '[Details]'], ['Takeaway & delivery', '[Details]'], ['Rooms', '[Details, if applicable]']],
      extra: [{ kind: 'cards', title: 'Signature dishes', columns: 3, items: cards([['[Dish]', '[Description]'], ['[Dish]', '[Description]'], ['[Dish]', '[Description]']]) }, { kind: 'gallery', title: 'Gallery', items: [{ image: '', caption: '[Dining area]' }, { image: '', caption: '[Banquet hall]' }] }],
      clients: { title: 'Events we have catered for', items: ['[Corporate client]', '[Government event]', '[Weddings]'] },
      hours: '[Open daily, 11:00 AM – 11:00 PM]', idLine: '[FSSAI licence no. · GSTIN]',
    }),
  },
  {
    code: 'firm-ngo', name: 'NGO / trust / society', category: 'NGO & Trust', description: 'Cause, programmes, impact, partners and registrations (12A, 80G, CSR).',
    data: () => firm({
      theme: 'emerald', subtitle: '[Registered Trust / Society / Section 8 Company]', docLabel: 'Organisation Profile', short: 'Organisation',
      headline: 'Changing Lives,\nTogether.', tagline: '[Education · Health · Livelihood · Environment]',
      intro: '[Company Name] works with communities in [area] on [cause].',
      about: '[Why the organisation was founded, where it works and who it serves.]\n\n[Your approach to programmes and community participation.]',
      facts: [['Registered', '[Year · Act]'], ['Area of work', '[Districts / States]'], ['Beneficiaries reached', '[Number]'], ['Team & volunteers', '[Number]']],
      mission: '[Your mission]', vision: '[Your vision]',
      servicesTitle: 'Our programmes',
      services: [['[Programme 1]', '[What you do and for whom]'], ['[Programme 2]', '[What you do and for whom]'], ['[Programme 3]', '[What you do and for whom]']],
      portfolio: { kicker: 'Impact', title: 'Projects & impact', items: [['[Project name]', '[Funded by]', '[What was done]', ['[Beneficiaries]', '[Outcome]']]] },
      clients: { title: 'Partners & funders', items: ['[Government department]', '[CSR partner]', '[Foundation]'] },
      certs: [['Registration', '[Reg. no.]'], ['12A & 80G', '[Numbers]'], ['CSR-1 / FCRA / NGO Darpan', '[Numbers, if held]']],
      closing: 'Partner with us.', idLine: '[Registration · 12A · 80G]',
    }),
  },
  {
    code: 'firm-trading', name: 'Trading / distribution / retail', category: 'Trading & Retail', description: 'Brands, product categories, network and supply capability.',
    data: () => firm({
      theme: 'navy-gold', subtitle: '[Traders & Distributors]', headline: 'Reliable Supply.\nFair Prices.', tagline: '[Product categories]',
      intro: '[Company Name] supplies [products] to [retailers, institutions, government buyers].',
      about: '[Year started, warehouses, delivery network and key brands.]',
      facts: [['Established', '[Year]'], ['Warehouse', '[Location · area]'], ['Delivery network', '[Districts covered]'], ['GeM seller', '[Yes / No]']],
      mission: '[Your mission]', vision: '[Your vision]',
      servicesTitle: 'Product categories',
      services: [['[Category 1]', '[Brands / items]'], ['[Category 2]', '[Brands / items]'], ['[Category 3]', '[Brands / items]']],
      extra: [{ kind: 'chips', title: 'Brands we deal in', items: items(['[Brand]', '[Brand]', '[Brand]']) }],
      clients: { title: 'Customers', items: ['[Retail chain]', '[Institution]', '[Government department]'] },
      why: ['Genuine products with bills and warranty', 'Timely delivery', 'Competitive pricing', 'Bulk and government supply experience'],
    }),
  },
  {
    code: 'firm-logistics', name: 'Transport & logistics', category: 'Transport & Logistics', description: 'Fleet, routes, services and safety record.',
    data: () => firm({
      theme: 'royal', headline: 'On Time.\nEvery Time.', tagline: 'Full Truck Load · Part Load · Warehousing · Fleet on Hire',
      intro: '[Company Name] provides road transport and logistics across [regions].',
      about: '[Years in business, fleet size and key routes.]',
      facts: [['Fleet', '[Number] vehicles'], ['Routes', '[States / corridors]'], ['Warehousing', '[Area]'], ['Established', '[Year]']],
      mission: '[Your mission]', vision: '[Your vision]',
      services: [['Full truck load', '[Details]'], ['Part load', '[Details]'], ['Warehousing', '[Details]'], ['Vehicle on hire', 'Buses, cars and trucks for government and corporate use.']],
      extra: [{ kind: 'table', title: 'Fleet details', columns: ['Vehicle type', 'Capacity', 'Number'], rows: [['[Truck]', '[Tonnes]', '[n]'], ['[Bus]', '[Seats]', '[n]']] }],
      clients: { title: 'Clients', items: ['[Client]', '[Client]', '[Department]'] },
      why: ['GPS-tracked fleet', 'Trained, verified drivers', 'Insurance on every consignment', '24×7 support'],
    }),
  },
  {
    code: 'firm-events', name: 'Event management / advertising agency', category: 'Events & Media', description: 'Services, events delivered, creative work and clients.',
    data: () => firm({
      theme: 'charcoal', headline: 'Ideas That\nGet Noticed.', tagline: 'Events · Branding · Outdoor Advertising · Digital Marketing',
      intro: '[Company Name] plans and delivers events and campaigns that people remember.',
      about: '[Years in business, team and the kind of events and campaigns you handle.]',
      facts: [['Events delivered', '[Number]'], ['Cities', '[Number]'], ['Established', '[Year]'], ['Team', '[Number]']],
      mission: '[Your mission]', vision: '[Your vision]',
      services: [['Corporate events', 'Conferences, launches and annual days.'], ['Government events', 'Mahotsavs, exhibitions and campaigns.'], ['Weddings', '[Details]'], ['Outdoor advertising', 'Hoardings, unipoles and transit media.'], ['Digital marketing', 'Social media and online campaigns.'], ['Printing & branding', 'Flex, standees and merchandise.']],
      portfolio: { kicker: 'Work', title: 'Events & campaigns', items: [['[Event name]', '[Client]', '[What you delivered]', ['[Audience size]', '[Highlights]']]] },
      extra: [{ kind: 'gallery', title: 'Gallery', items: [{ image: '', caption: '[Event photo]' }, { image: '', caption: '[Campaign photo]' }] }],
      clients: { title: 'Clients', items: ['[Client]', '[Client]', '[Department]'] },
    }),
  },
  {
    code: 'firm-architecture', name: 'Architecture & interior design', category: 'Architecture & Interiors', description: 'Design services, featured projects with photos, and design process.',
    data: () => firm({
      theme: 'teal', subtitle: 'Architects & Interior Designers', docLabel: 'Studio Profile', short: 'Studio',
      headline: 'Spaces Designed\nAround People.', tagline: 'Architecture · Interiors · Landscape · Project Management',
      intro: '[Company Name] designs homes, workplaces and public spaces.',
      about: '[Principal architect, year founded and design philosophy.]',
      facts: [['Principal architect', '[Name, COA reg. no.]'], ['Founded', '[Year]'], ['Projects', '[Number]'], ['Studio', '[City]']],
      mission: '[Your mission]', vision: '[Your vision]',
      services: [['Architecture', 'Residential, commercial and institutional.'], ['Interior design', 'Homes, offices, retail and hospitality.'], ['Landscape', '[Details]'], ['3D visualisation', 'Walkthroughs and renders.'], ['Approvals', 'Drawings for building permission.'], ['Project management', 'Site supervision to handover.']],
      portfolio: { kicker: 'Projects', title: 'Featured projects', items: [['[Project]', '[Residential]', '[Location · area · scope]', ['[Design highlight]']], ['[Project]', '[Commercial]', '[Location · area · scope]', ['[Design highlight]']]] },
      process: { title: 'Design process', rows: [['Brief', 'Understanding needs and budget', 'Design brief'], ['Concept', 'Layouts and mood boards', 'Concept approval'], ['Design', 'Working drawings and 3D views', 'Final drawings'], ['Execution', 'Site supervision', 'Completed space']] },
      idLine: '[COA registration no. · GSTIN]',
    }),
  },
  {
    code: 'firm-consulting', name: 'Consultancy firm', category: 'Consulting & Services', description: 'Advisory services, sectors, team expertise and assignments.',
    data: () => firm({
      theme: 'navy-gold', headline: 'Insight.\nStrategy. Results.', tagline: '[Management · Project · Technical consulting]',
      intro: '[Company Name] helps organisations plan, implement and evaluate projects.',
      about: '[Founding team, years of experience and the sectors you advise.]',
      facts: [['Established', '[Year]'], ['Assignments completed', '[Number]'], ['Experts on panel', '[Number]'], ['Sectors', '[List]']],
      mission: '[Your mission]', vision: '[Your vision]',
      services: [['DPR & feasibility studies', '[Details]'], ['Project management (PMC)', '[Details]'], ['Third-party inspection', '[Details]'], ['Training & capacity building', '[Details]'], ['Surveys & evaluation', '[Details]'], ['Policy advisory', '[Details]']],
      portfolio: { kicker: 'Assignments', title: 'Key assignments', items: [['[Assignment]', '[Client]', '[Scope and outcome]', ['[Duration]', '[Value, if disclosed]']]] },
      extra: [{ kind: 'cards', title: 'Key experts', columns: 3, items: cards([['[Name]', '[Qualification · experience]'], ['[Name]', '[Qualification · experience]'], ['[Name]', '[Qualification · experience]']]) }],
    }),
  },
  {
    code: 'firm-govt-vendor', name: 'Government supplier / tender profile', category: 'Government Supplier', description: 'A tender-ready profile: registrations, turnover, past orders and capacity.',
    data: () => firm({
      theme: 'navy-gold', docLabel: 'Tender Profile', headline: 'Trusted Partner for\nPublic Procurement.', tagline: '[Supply · Works · Services] for Government Departments',
      intro: '[Company Name] supplies [goods / services] to government departments and PSUs.',
      about: '[Year started, departments served and the categories you are registered for.]',
      callout: 'All documents listed below are available for verification on request.',
      facts: [['Constitution', '[Proprietorship / Partnership / Pvt Ltd]'], ['PAN', '[PAN]'], ['GSTIN', '[GSTIN]'], ['Udyam / MSME', '[Number]'], ['GeM seller ID', '[ID]'], ['Bank', '[Bank name, branch]']],
      mission: '[Your mission]', vision: '[Your vision]',
      servicesTitle: 'Categories of supply / work',
      services: [['[Category 1]', '[Items / scope]'], ['[Category 2]', '[Items / scope]'], ['[Category 3]', '[Items / scope]']],
      extra: [
        { kind: 'table', title: 'Turnover (last 3 years)', columns: ['Financial year', 'Turnover', 'Audited'], rows: [['[2023-24]', '[₹]', '[Yes]'], ['[2024-25]', '[₹]', '[Yes]'], ['[2025-26]', '[₹]', '[Yes]']] },
        { kind: 'table', title: 'Past orders executed', columns: ['Department', 'Work / supply', 'Value', 'Year'], rows: [['[Department]', '[Description]', '[₹]', '[Year]']] },
      ],
      certs: [['Registrations', '[Vendor registrations with departments]'], ['Certifications', '[ISO / BIS – only if held]'], ['Statutory', '[EPF · ESI · Labour licence]']],
      why: ['Experience with government procedures', 'Timely supply and documentation', 'Competitive and transparent rates', 'After-sales support'],
    }),
  },
  {
    code: 'firm-agri', name: 'Agriculture / FPO / agro business', category: 'Agriculture', description: 'Farmer members, crops, processing, market linkages and schemes.',
    data: () => firm({
      theme: 'emerald', subtitle: '[Farmer Producer Company / Agro Enterprise]', headline: 'From Farm\nto Market.', tagline: '[Crops · Processing · Inputs · Market linkage]',
      intro: '[Company Name] works with farmers in [area] to improve incomes through better practices and markets.',
      about: '[Year formed, number of farmer members, villages covered and promoting institution.]',
      facts: [['Farmer members', '[Number]'], ['Villages', '[Number]'], ['Main crops', '[Crops]'], ['Registered', '[Year · Reg. no.]']],
      mission: '[Your mission]', vision: '[Your vision]',
      services: [['Input supply', 'Seeds, fertilisers and equipment.'], ['Aggregation & marketing', '[Details]'], ['Processing', '[Details]'], ['Training', 'Crop advisory and good practices.']],
      extra: [{ kind: 'table', title: 'Business summary', columns: ['Year', 'Activity', 'Volume', 'Turnover'], rows: [['[Year]', '[Activity]', '[Quantity]', '[₹]']] }],
      clients: { title: 'Partners & schemes', items: ['[NABARD]', '[SFAC]', '[Buyer company]'] },
    }),
  },
];

/* ------------------------------------------------------------------ individuals */
const PEOPLE = [
  {
    code: 'personal', name: 'General professional', category: 'General Professional', description: 'An all-purpose professional profile for anyone.',
    data: () => personalTemplate(P),
  },
  {
    code: 'person-doctor', name: 'Doctor', category: 'Healthcare', description: 'Qualifications, specialisation, hospital experience, procedures and memberships.',
    data: () => person({
      theme: 'teal', role: '[MBBS, MD – Speciality] · [Hospital]', docLabel: 'Doctor Profile',
      intro: 'Dr. [Name] is a [speciality] with [n] years of clinical experience.',
      about: '[Areas of practice, patient-care approach and current position.]',
      skillsTitle: 'Specialisations', skills: ['[Speciality]', '[Procedure]', '[Procedure]', '[Area of interest]'],
      highlightsTitle: 'Clinical highlights', highlights: ['[Number] procedures performed', '[Award / recognition]', '[Research or publication]'],
      timelineTitle: 'Clinical experience', timeline: [['[Year — Present]', '[Designation · Hospital]', '[Responsibilities]'], ['[Years]', '[Designation · Hospital]', '[Responsibilities]']],
      extra: [{ kind: 'cards', title: 'Consultation', columns: 2, items: cards([['OPD timings', '[Days · time]'], ['Clinic address', '[Address]']]) }],
      education: [['Qualifications', '[MBBS – College, Year]\n[MD / MS – College, Year]'], ['Registration & memberships', '[Medical Council reg. no.]\n[IMA / association]']],
      eduTitle: 'Qualifications & registration',
    }),
  },
  {
    code: 'person-advocate', name: 'Advocate / lawyer', category: 'Legal', description: 'Practice areas, courts, enrolment, notable matters and chamber details.',
    data: () => person({
      theme: 'maroon', role: 'Advocate · [Court]', docLabel: 'Advocate Profile',
      intro: '[Your Full Name] is an advocate practising at [courts] since [year].',
      about: '[Practice areas, type of clients and approach.]',
      skillsTitle: 'Practice areas', skills: ['[Civil]', '[Criminal]', '[Property]', '[Family]', '[Service matters]'],
      highlightsTitle: 'Notable matters', highlights: ['[Matter description – without confidential details]', '[Panel advocate for … ]'],
      timelineTitle: 'Practice', timeline: [['[Year — Present]', 'Independent practice · [Court]', '[Areas]'], ['[Years]', 'Junior to [Senior Advocate]', '[Experience gained]']],
      education: [['Education', '[LL.B – University, Year]\n[LL.M – University, Year]'], ['Enrolment', '[Bar Council · Enrolment no. · Year]']],
      eduTitle: 'Education & enrolment',
    }),
  },
  {
    code: 'person-ca', name: 'Chartered accountant', category: 'Finance & Accounting', description: 'Audit, tax and advisory experience with membership details.',
    data: () => person({
      theme: 'royal', role: 'Chartered Accountant · [Firm]', docLabel: 'Professional Profile',
      intro: 'CA [Name] is a Chartered Accountant with [n] years of experience in [audit, tax, advisory].',
      about: '[Key industries, notable assignments and current role.]',
      skills: ['[Statutory audit]', '[Income tax]', '[GST]', '[Company law]', '[Financial advisory]'],
      highlights: ['[Number] audits handled', '[Specialisation or recognition]'],
      timeline: [['[Year — Present]', '[Partner / Proprietor · Firm]', '[Responsibilities]'], ['[Years]', '[Role · Organisation]', '[Responsibilities]']],
      education: [['Qualifications', '[CA – ICAI, Year]\n[B.Com – University, Year]'], ['Membership', '[ICAI membership no. · DISA / other certificates]']],
    }),
  },
  {
    code: 'person-developer', name: 'Software developer / freelancer', category: 'IT & Software', description: 'Tech skills, projects with links and screenshots, and work history.',
    data: () => person({
      theme: 'navy-gold', role: '[Full-stack Developer] · Freelancer', docLabel: 'Developer Profile',
      intro: '[Your Full Name] is a [role] who builds [web apps, mobile apps, APIs].',
      about: '[Years of experience, types of clients and what you enjoy building.]',
      skillsTitle: 'Tech stack', skills: ['[JavaScript]', '[React]', '[Node.js]', '[Flutter]', '[MySQL]', '[AWS]'],
      highlights: ['[Number] projects delivered', '[Open-source contribution or notable product]'],
      extra: [{ kind: 'projects', kicker: 'Work', title: 'Projects', newPage: true, items: [{ name: '[Project]', category: '[Web app]', summary: '[What it does and your role]', features: '[Tech used]\n[Result]', client: '', year: '[Year]', image: '' }] }],
      timeline: [['[Year — Present]', 'Freelance developer', '[Clients and work]'], ['[Years]', '[Role · Company]', '[Responsibilities]']],
    }),
  },
  {
    code: 'person-teacher', name: 'Teacher / professor', category: 'Education', description: 'Subjects, teaching experience, research, publications and achievements.',
    data: () => person({
      theme: 'royal', role: '[Designation] · [Institution]', docLabel: 'Academic Profile',
      intro: '[Your Full Name] has [n] years of teaching experience in [subject].',
      about: '[Teaching philosophy, classes taught and student achievements.]',
      skillsTitle: 'Subjects', skills: ['[Subject]', '[Subject]', '[Subject]'],
      highlightsTitle: 'Achievements', highlights: ['[Award]', '[Students qualified / results]', '[Workshop conducted]'],
      timelineTitle: 'Teaching experience', timeline: [['[Year — Present]', '[Designation · Institution]', '[Classes / courses]'], ['[Years]', '[Designation · Institution]', '[Classes / courses]']],
      extra: [{ kind: 'list', title: 'Publications & research', items: items(['[Paper title – Journal, Year]']) }],
      education: [['Qualifications', '[Ph.D / M.A. / B.Ed – University, Year]'], ['Certifications', '[NET / SET / TET]']],
    }),
  },
  {
    code: 'person-engineer', name: 'Engineer / architect', category: 'Architecture & Interiors', description: 'Technical expertise, projects handled, software and registrations.',
    data: () => person({
      theme: 'teal', role: '[Civil Engineer / Architect] · [Organisation]', docLabel: 'Professional Profile',
      intro: '[Your Full Name] is a [discipline] with experience in [type of projects].',
      about: '[Projects handled, responsibilities and strengths.]',
      skills: ['[Structural design]', '[Estimation & costing]', '[Site supervision]', '[AutoCAD]', '[STAAD Pro]'],
      highlights: ['[Major project and your role]', '[Value / size of works handled]'],
      extra: [{ kind: 'table', title: 'Projects handled', columns: ['Project', 'Role', 'Value / size', 'Year'], rows: [['[Project]', '[Role]', '[₹ / sq. ft.]', '[Year]']] }],
      timeline: [['[Year — Present]', '[Designation · Organisation]', '[Responsibilities]'], ['[Years]', '[Designation · Organisation]', '[Responsibilities]']],
      education: [['Education', '[B.E. / B.Arch – College, Year]'], ['Registrations', '[COA / Institution of Engineers – no.]']],
    }),
  },
  {
    code: 'person-creative', name: 'Designer / photographer / artist', category: 'Creative & Media', description: 'Portfolio-first profile with a large image gallery.',
    data: () => person({
      theme: 'charcoal', role: '[Graphic Designer / Photographer]', docLabel: 'Portfolio', linkedin: false,
      intro: '[Your Full Name] creates [designs / photographs / art] for [clients].',
      about: '[Style, specialities and the kind of work you love.]',
      skills: ['[Branding]', '[Photography]', '[Illustration]', '[Adobe Photoshop]', '[Figma]'],
      highlightsTitle: 'Clients & features', highlights: ['[Client / brand]', '[Exhibition / feature]'],
      before: [{ kind: 'gallery', kicker: 'Portfolio', title: 'Selected work', newPage: true, items: [{ image: '', caption: '[Project]' }, { image: '', caption: '[Project]' }, { image: '', caption: '[Project]' }, { image: '', caption: '[Project]' }] }],
      timeline: [['[Year — Present]', 'Freelance', '[Clients and work]']],
    }),
  },
  {
    code: 'person-sales', name: 'Sales & marketing professional', category: 'Business & Management', description: 'Targets achieved, territories, key accounts and career growth.',
    data: () => person({
      theme: 'royal', role: '[Designation] · [Company]', docLabel: 'Professional Profile',
      intro: '[Your Full Name] is a sales professional with [n] years in [industry].',
      about: '[Territories handled, channels and key strengths.]',
      skills: ['[B2B sales]', '[Channel management]', '[Key accounts]', '[Team leadership]', '[CRM]'],
      highlightsTitle: 'Achievements', highlights: ['[Achieved x% of target in year]', '[Opened n new accounts]', '[Award]'],
      timeline: [['[Year — Present]', '[Designation · Company]', '[Territory, targets, results]'], ['[Years]', '[Designation · Company]', '[Territory, targets, results]']],
    }),
  },
  {
    code: 'person-entrepreneur', name: 'Entrepreneur / business owner', category: 'Business & Management', description: 'Founder story, businesses, achievements and recognitions.',
    data: () => person({
      theme: 'navy-gold', role: 'Founder & Director, [Company]', docLabel: 'Founder Profile',
      intro: '[Your Full Name] is the founder of [Company], a [type of business] based in [city].',
      about: '[How you started, what the business does today and your role.]\n\n[Your vision for the business.]',
      skillsTitle: 'Leadership areas', skills: ['[Strategy]', '[Business development]', '[Operations]', '[Team building]'],
      highlightsTitle: 'Milestones', highlights: ['[Year: company founded]', '[Milestone]', '[Recognition / award]'],
      timeline: [['[Year — Present]', 'Founder · [Company]', '[What you built]'], ['[Years]', '[Earlier role]', '[Experience]']],
      extra: [{ kind: 'cards', title: 'Businesses', columns: 2, items: cards([['[Company]', '[What it does · role]'], ['[Company]', '[What it does · role]']]) }],
    }),
  },
  {
    code: 'person-student', name: 'Student / fresher resume', category: 'Students & Freshers', description: 'Education first: academics, projects, internships and skills.',
    data: () => person({
      theme: 'teal', role: '[Course] · [College]', docLabel: 'Resume',
      profileTitle: 'Career objective', intro: '[One line on the role you are looking for.]', about: '[Two lines on your interests and strengths.]',
      skillsTitle: 'Skills', skills: ['[Skill]', '[Skill]', '[Skill]', '[Language]'],
      highlightsTitle: 'Achievements', highlights: ['[Rank / award]', '[Competition / hackathon]'],
      before: [{ kind: 'table', title: 'Education', columns: ['Qualification', 'Institution', 'Year', 'Score'], rows: [['[B.Tech / B.Com]', '[College]', '[Year]', '[CGPA / %]'], ['[12th]', '[School · Board]', '[Year]', '[%]'], ['[10th]', '[School · Board]', '[Year]', '[%]']] }],
      timelineKicker: 'Experience', timelineTitle: 'Internships & projects', timeline: [['[Month Year]', '[Intern · Company]', '[What you did]'], ['[Month Year]', '[Project title]', '[What you built]']],
      eduTitle: 'Certifications & activities', education: [['Certifications', '[Course – Platform]'], ['Activities', '[NSS / sports / clubs]']],
    }),
  },
  {
    code: 'person-consultant', name: 'Consultant / trainer', category: 'Consulting & Services', description: 'Expertise, assignments, trainings delivered and clients.',
    data: () => person({
      theme: 'emerald', role: '[Consultant / Trainer] · [Domain]', docLabel: 'Consultant Profile',
      intro: '[Your Full Name] advises organisations on [domain].',
      about: '[Experience, sectors and the results you deliver.]',
      skills: ['[Domain 1]', '[Domain 2]', '[Training]', '[Facilitation]'],
      highlightsTitle: 'Key assignments', highlights: ['[Assignment · client]', '[Number] trainings delivered to [n] participants'],
      timeline: [['[Year — Present]', 'Independent consultant', '[Clients]'], ['[Years]', '[Role · Organisation]', '[Responsibilities]']],
      extra: [{ kind: 'chips', title: 'Clients', items: items(['[Client]', '[Client]', '[Department]']) }],
    }),
  },
];

/* ------------------------------------------------------------------ YJ Technosoft (staff only) */
const STAFF = [
  { code: 'yj-company', name: 'YJ Technosoft company profile', category: 'YJ Technosoft', description: 'Our own corporate capability profile.', audience: 'firm', type: 'company', staff_only: 1, data: yjCompany },
  { code: 'yj-founder', name: 'YJ Technosoft founder profile', category: 'YJ Technosoft', description: 'Founder & director profile.', audience: 'individual', type: 'personal', staff_only: 1, data: yjFounder },
];

const BUILTIN_TEMPLATES = [
  ...FIRMS.map((t) => ({ audience: 'firm', type: 'company', staff_only: 0, ...t })),
  ...PEOPLE.map((t) => ({ audience: 'individual', type: 'personal', staff_only: 0, ...t })),
  ...STAFF,
].map((t, i) => ({ ...t, sort_order: i + 1 }));

/**
 * Copies the built-in templates into the database.
 * @param q            (sql, params) => rows
 * @param onlyMissing  true: add only built-ins whose code is not in the table (admin "Restore")
 */
async function seedTemplates(q, { onlyMissing = false } = {}) {
  const existing = new Set((await q('SELECT code FROM profile_templates WHERE code IS NOT NULL')).map((r) => r.code));
  if (!onlyMissing && existing.size) return 0;
  const rows = BUILTIN_TEMPLATES.filter((t) => !existing.has(t.code)).map((t) => [
    t.code, t.name, t.category, t.type, t.description, JSON.stringify(t.data()), t.staff_only ? 1 : 0, t.sort_order,
  ]);
  if (rows.length) await q('INSERT INTO profile_templates (code, name, category, type, description, data, staff_only, sort_order) VALUES ?', [rows]);
  return rows.length;
}

module.exports = { BUILTIN_TEMPLATES, seedTemplates };
