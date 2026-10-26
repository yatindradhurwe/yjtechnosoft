-- YJTechnosoft – complete database schema (MySQL 5.7+/8 / MariaDB 10.4+)
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Core
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(30),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','hr','accounts','employee') NOT NULL DEFAULT 'employee',
  employee_id INT NULL,
  avatar VARCHAR(255),
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  last_login DATETIME NULL,
  reset_token VARCHAR(100) NULL,
  reset_expires DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` MEDIUMTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel ENUM('email','sms','whatsapp') NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  message TEXT,
  status ENUM('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  error TEXT,
  ref_type VARCHAR(50),
  ref_id INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100),
  entity VARCHAR(50),
  entity_id INT,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Website CMS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sliders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  badge VARCHAR(100),
  title VARCHAR(255) NOT NULL,
  highlight VARCHAR(150),
  subtitle TEXT,
  image VARCHAR(255),
  button_text VARCHAR(60),
  button_link VARCHAR(255),
  button2_text VARCHAR(60),
  button2_link VARCHAR(255),
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  slug VARCHAR(170) NOT NULL UNIQUE,
  icon VARCHAR(60),
  short_description VARCHAR(500),
  description MEDIUMTEXT,
  image VARCHAR(255),
  features TEXT,
  starting_price VARCHAR(60),
  meta_title VARCHAR(255),
  meta_description VARCHAR(500),
  sort_order INT DEFAULT 0,
  is_featured TINYINT(1) DEFAULT 1,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portfolio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  slug VARCHAR(170) NOT NULL UNIQUE,
  category VARCHAR(80),
  client_name VARCHAR(150),
  image VARCHAR(255),
  short_description VARCHAR(500),
  description MEDIUMTEXT,
  technologies VARCHAR(255),
  project_url VARCHAR(255),
  completed_on DATE NULL,
  sort_order INT DEFAULT 0,
  is_featured TINYINT(1) DEFAULT 1,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(170) NOT NULL UNIQUE,
  tagline VARCHAR(255),
  stage VARCHAR(40) DEFAULT 'Live',
  logo VARCHAR(255),
  image VARCHAR(255),
  short_description VARCHAR(500),
  description MEDIUMTEXT,
  features TEXT,
  audience VARCHAR(255),
  website_url VARCHAR(255),
  cta_text VARCHAR(60),
  sort_order INT DEFAULT 0,
  is_featured TINYINT(1) DEFAULT 1,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS testimonials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  designation VARCHAR(120),
  company VARCHAR(150),
  photo VARCHAR(255),
  message TEXT NOT NULL,
  rating TINYINT DEFAULT 5,
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  designation VARCHAR(120),
  photo VARCHAR(255),
  bio TEXT,
  linkedin VARCHAR(255),
  twitter VARCHAR(255),
  email VARCHAR(150),
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS partners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  logo VARCHAR(255),
  website VARCHAR(255),
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS technologies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(80),
  logo VARCHAR(255),
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  value INT NOT NULL DEFAULT 0,
  suffix VARCHAR(10),
  icon VARCHAR(60),
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pricing_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price VARCHAR(50),
  period VARCHAR(50),
  description VARCHAR(255),
  features TEXT,
  is_highlighted TINYINT(1) DEFAULT 0,
  button_text VARCHAR(60) DEFAULT 'Get Started',
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(255) NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(80),
  sort_order INT DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blog_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(270) NOT NULL UNIQUE,
  excerpt VARCHAR(500),
  content MEDIUMTEXT,
  image VARCHAR(255),
  category VARCHAR(80),
  tags VARCHAR(255),
  author VARCHAR(120),
  meta_title VARCHAR(255),
  meta_description VARCHAR(500),
  views INT DEFAULT 0,
  published_at DATE NULL,
  status ENUM('published','draft') DEFAULT 'published',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(170) NOT NULL UNIQUE,
  content MEDIUMTEXT,
  meta_title VARCHAR(255),
  meta_description VARCHAR(500),
  show_in_footer TINYINT(1) DEFAULT 1,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(30),
  company VARCHAR(150),
  service VARCHAR(150),
  budget VARCHAR(80),
  subject VARCHAR(255),
  message TEXT,
  source VARCHAR(50) DEFAULT 'contact',
  status ENUM('new','contacted','qualified','converted','closed') DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL UNIQUE,
  status ENUM('active','unsubscribed') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Clients, billing & servers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(150),
  email VARCHAR(150),
  phone VARCHAR(30),
  whatsapp VARCHAR(30),
  gstin VARCHAR(30),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(15),
  website VARCHAR(255),
  notes TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  hsn_sac VARCHAR(20),
  unit VARCHAR(30) DEFAULT 'Nos',
  rate DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quote_no VARCHAR(50) NOT NULL UNIQUE,
  client_id INT NOT NULL,
  quote_date DATE NOT NULL,
  valid_until DATE NULL,
  subject VARCHAR(255),
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  tax_total DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  terms TEXT,
  status ENUM('draft','sent','accepted','rejected','converted') DEFAULT 'draft',
  invoice_id INT NULL,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotation_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT NOT NULL,
  description VARCHAR(500) NOT NULL,
  hsn_sac VARCHAR(20),
  quantity DECIMAL(12,2) DEFAULT 1,
  unit VARCHAR(30),
  rate DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  amount DECIMAL(12,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(50) NOT NULL UNIQUE,
  client_id INT NOT NULL,
  quotation_id INT NULL,
  server_id INT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NULL,
  subject VARCHAR(255),
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  tax_total DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  terms TEXT,
  status ENUM('draft','unpaid','partial','paid','overdue','cancelled') DEFAULT 'unpaid',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  description VARCHAR(500) NOT NULL,
  hsn_sac VARCHAR(20),
  quantity DECIMAL(12,2) DEFAULT 1,
  unit VARCHAR(30),
  rate DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  amount DECIMAL(12,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(50),
  invoice_id INT NOT NULL,
  client_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  mode ENUM('cash','upi','bank_transfer','cheque','card','other') DEFAULT 'bank_transfer',
  reference VARCHAR(150),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_servers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  type ENUM('shared_hosting','vps','dedicated','cloud','domain','ssl','email','amc','other') DEFAULT 'shared_hosting',
  provider VARCHAR(120),
  domain VARCHAR(255),
  ip_address VARCHAR(60),
  plan VARCHAR(120),
  panel_url VARCHAR(255),
  username VARCHAR(150),
  password VARCHAR(255),
  start_date DATE NULL,
  expiry_date DATE NULL,
  billing_cycle ENUM('monthly','quarterly','half_yearly','yearly','biennial','one_time') DEFAULT 'yearly',
  renewal_amount DECIMAL(12,2) DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 18,
  auto_reminder TINYINT(1) DEFAULT 1,
  last_reminder_on DATE NULL,
  status ENUM('active','suspended','expired','cancelled') DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(80),
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  mode VARCHAR(40),
  vendor VARCHAR(150),
  receipt VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- HR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255),
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS designations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  department_id INT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emp_code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(30),
  gender ENUM('male','female','other') NULL,
  dob DATE NULL,
  father_name VARCHAR(150),
  address TEXT,
  department_id INT NULL,
  designation_id INT NULL,
  reporting_to INT NULL,
  employment_type ENUM('full_time','part_time','intern','contract') DEFAULT 'full_time',
  joining_date DATE NULL,
  probation_end DATE NULL,
  exit_date DATE NULL,
  salary DECIMAL(12,2) DEFAULT 0,
  shift_start TIME DEFAULT '10:00:00',
  shift_end TIME DEFAULT '18:00:00',
  bank_name VARCHAR(120),
  account_no VARCHAR(40),
  ifsc VARCHAR(20),
  pan VARCHAR(20),
  aadhaar VARCHAR(20),
  photo VARCHAR(255),
  emergency_contact VARCHAR(150),
  status ENUM('active','on_notice','resigned','terminated') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  file VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  check_in DATETIME NULL,
  check_out DATETIME NULL,
  work_minutes INT DEFAULT 0,
  status ENUM('present','absent','half_day','late','leave','holiday','wfh') DEFAULT 'present',
  check_in_ip VARCHAR(60),
  check_in_location VARCHAR(120),
  check_out_location VARCHAR(120),
  project_id INT NULL,
  source VARCHAR(20) NULL,
  check_in_lat DECIMAL(10,7) NULL,
  check_in_lng DECIMAL(10,7) NULL,
  check_in_accuracy INT NULL,
  check_in_distance INT NULL,
  check_in_geofence VARCHAR(20) NULL,
  check_in_photo VARCHAR(255) NULL,
  check_out_lat DECIMAL(10,7) NULL,
  check_out_lng DECIMAL(10,7) NULL,
  check_out_accuracy INT NULL,
  check_out_distance INT NULL,
  check_out_geofence VARCHAR(20) NULL,
  device_info VARCHAR(255) NULL,
  notes VARCHAR(255),
  marked_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_emp_date (employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  date DATE NOT NULL,
  type ENUM('public','optional','company') DEFAULT 'public',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leave_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  days_per_year DECIMAL(5,1) DEFAULT 12,
  is_paid TINYINT(1) DEFAULT 1,
  color VARCHAR(20) DEFAULT '#1d6fb8',
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  half_day TINYINT(1) DEFAULT 0,
  days DECIMAL(5,1) NOT NULL,
  reason TEXT,
  status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
  approved_by INT NULL,
  remarks VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  client_id INT NULL,
  description TEXT,
  start_date DATE NULL,
  deadline DATE NULL,
  budget DECIMAL(12,2) DEFAULT 0,
  status ENUM('planning','in_progress','on_hold','completed','cancelled') DEFAULT 'in_progress',
  site_address VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  geofence_radius INT DEFAULT 200,
  geofence_enabled TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employees assigned to a project (they can check in at its geofence)
CREATE TABLE IF NOT EXISTS project_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  employee_id INT NOT NULL,
  role VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_project_employee (project_id, employee_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  project_id INT NULL,
  assigned_to INT NULL,
  assigned_by INT NULL,
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  status ENUM('todo','in_progress','review','done','blocked') DEFAULT 'todo',
  start_date DATE NULL,
  due_date DATE NULL,
  progress TINYINT DEFAULT 0,
  completed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  report_date DATE NOT NULL,
  work_done TEXT NOT NULL,
  hours DECIMAL(4,1) DEFAULT 0,
  plan_tomorrow TEXT,
  blockers TEXT,
  project_id INT NULL,
  status ENUM('submitted','reviewed') DEFAULT 'submitted',
  reviewer_remarks VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_emp_day (employee_id, report_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payslips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  month TINYINT NOT NULL,
  year SMALLINT NOT NULL,
  working_days DECIMAL(5,1) DEFAULT 0,
  paid_days DECIMAL(5,1) DEFAULT 0,
  lop_days DECIMAL(5,1) DEFAULT 0,
  gross DECIMAL(12,2) DEFAULT 0,
  basic DECIMAL(12,2) DEFAULT 0,
  hra DECIMAL(12,2) DEFAULT 0,
  allowances DECIMAL(12,2) DEFAULT 0,
  bonus DECIMAL(12,2) DEFAULT 0,
  deductions DECIMAL(12,2) DEFAULT 0,
  lop_amount DECIMAL(12,2) DEFAULT 0,
  net_pay DECIMAL(12,2) DEFAULT 0,
  status ENUM('generated','paid') DEFAULT 'generated',
  paid_on DATE NULL,
  notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_emp_month (employee_id, month, year),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Recruitment
CREATE TABLE IF NOT EXISTS job_openings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  department VARCHAR(120),
  location VARCHAR(120),
  job_type ENUM('full_time','part_time','internship','contract','remote') DEFAULT 'full_time',
  experience VARCHAR(80),
  salary_range VARCHAR(80),
  openings INT DEFAULT 1,
  short_description VARCHAR(500),
  description MEDIUMTEXT,
  requirements MEDIUMTEXT,
  last_date DATE NULL,
  status ENUM('open','closed','draft') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS job_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  city VARCHAR(100),
  qualification VARCHAR(150),
  college VARCHAR(200),
  experience VARCHAR(80),
  current_ctc VARCHAR(50),
  expected_ctc VARCHAR(50),
  notice_period VARCHAR(50),
  resume VARCHAR(255),
  portfolio_url VARCHAR(255),
  cover_letter TEXT,
  stage ENUM('applied','shortlisted','interview','selected','offered','hired','rejected') DEFAULT 'applied',
  interview_at DATETIME NULL,
  interview_mode ENUM('in_person','phone','video') NULL,
  interview_link VARCHAR(255),
  rating TINYINT NULL,
  notes TEXT,
  employee_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Letters (offer / internship / joining / experience ...)
CREATE TABLE IF NOT EXISTS letter_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('internship_offer','offer','appointment','joining','experience','relieving','internship_completion','warning','custom') DEFAULT 'custom',
  title VARCHAR(200) NOT NULL,
  subject VARCHAR(255),
  body MEDIUMTEXT NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS letters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  letter_no VARCHAR(60) NOT NULL UNIQUE,
  template_id INT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  recipient_name VARCHAR(150) NOT NULL,
  recipient_email VARCHAR(150),
  recipient_phone VARCHAR(30),
  recipient_address TEXT,
  employee_id INT NULL,
  application_id INT NULL,
  data MEDIUMTEXT,
  body MEDIUMTEXT NOT NULL,
  issue_date DATE NOT NULL,
  status ENUM('draft','issued','sent','accepted','revoked') DEFAULT 'issued',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Announcements for staff portal
CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  priority ENUM('normal','important') DEFAULT 'normal',
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Contracts, agreements & documents vault
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('service_agreement','website_development','software_development','amc','hosting','nda','freelancer','mou','custom') DEFAULT 'service_agreement',
  title VARCHAR(200) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(60) NOT NULL UNIQUE,
  template_id INT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'service_agreement',
  title VARCHAR(200) NOT NULL,
  client_id INT NULL,
  project_id INT NULL,
  party_name VARCHAR(200) NOT NULL,
  party_representative VARCHAR(150),
  party_address TEXT,
  party_email VARCHAR(150),
  party_phone VARCHAR(30),
  agreement_date DATE NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  contract_value DECIMAL(12,2) DEFAULT 0,
  data MEDIUMTEXT,
  body MEDIUMTEXT NOT NULL,
  status ENUM('draft','sent','accepted','signed','active','expired','terminated') DEFAULT 'draft',
  accepted_by VARCHAR(150) NULL,
  accepted_at DATETIME NULL,
  accepted_ip VARCHAR(60) NULL,
  signed_file VARCHAR(255) NULL,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vault_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category ENUM('contract','agreement','proposal','purchase_order','work_order','invoice','legal','certificate','kyc','policy','credentials','other') DEFAULT 'other',
  file VARCHAR(255) NOT NULL,
  file_name VARCHAR(255),
  client_id INT NULL,
  project_id INT NULL,
  contract_id INT NULL,
  document_date DATE NULL,
  expiry_date DATE NULL,
  tags VARCHAR(255),
  notes TEXT,
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- In-app & push notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(40),
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500),
  link VARCHAR(255),
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint VARCHAR(600) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(100) NOT NULL,
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_endpoint (endpoint(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Mobile app (Flutter) sessions: one row per signed-in device
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobile_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  device_id VARCHAR(120),
  device_name VARCHAR(150),
  platform VARCHAR(20),
  app_version VARCHAR(30),
  fcm_token VARCHAR(255),
  ip VARCHAR(60),
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_refresh (refresh_token_hash),
  INDEX (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
