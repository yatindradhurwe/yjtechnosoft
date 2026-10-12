-- ===========================================================================
-- YJTechnosoft – complete database (all tables + default data)
-- Import: phpMyAdmin › select your database › Import › choose this file › Go
-- Works on MySQL 5.7+/8.x and MariaDB 10.4+
--
-- Default admin login (CHANGE THE PASSWORD after first login):
--   Email:    admin@yjtechnosoft.com
--   Password: Admin@123
--
-- After importing, set DB_NAME / DB_USER / DB_PASSWORD in server/.env
-- ===========================================================================
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+05:30";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) DEFAULT NULL,
  `entity` varchar(50) DEFAULT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `priority` enum('normal','important') DEFAULT 'normal',
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `announcements` DISABLE KEYS */;
INSERT INTO `announcements` VALUES
(1,'Welcome to the new employee portal','Mark your attendance, apply for leave, track tasks and submit daily reports – all from one place.','normal','active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `announcements` ENABLE KEYS */;
DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `check_in` datetime DEFAULT NULL,
  `check_out` datetime DEFAULT NULL,
  `work_minutes` int(11) DEFAULT 0,
  `status` enum('present','absent','half_day','late','leave','holiday','wfh') DEFAULT 'present',
  `check_in_ip` varchar(60) DEFAULT NULL,
  `check_in_location` varchar(120) DEFAULT NULL,
  `check_out_location` varchar(120) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `marked_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_emp_date` (`employee_id`,`date`),
  CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
DROP TABLE IF EXISTS `billing_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `billing_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `hsn_sac` varchar(20) DEFAULT NULL,
  `unit` varchar(30) DEFAULT 'Nos',
  `rate` decimal(12,2) DEFAULT 0.00,
  `tax_rate` decimal(5,2) DEFAULT 0.00,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `billing_items` DISABLE KEYS */;
INSERT INTO `billing_items` VALUES
(1,'Website Design & Development',NULL,'998314','Nos',15000.00,18.00,'active','2026-10-12 08:37:47'),
(2,'Custom Software Module',NULL,'998314','Nos',25000.00,18.00,'active','2026-10-12 08:37:47'),
(3,'Domain Registration (.com) – 1 Year',NULL,'998315','Nos',999.00,18.00,'active','2026-10-12 08:37:47'),
(4,'Shared Hosting – 1 Year',NULL,'998315','Nos',2999.00,18.00,'active','2026-10-12 08:37:47'),
(5,'Annual Maintenance Contract',NULL,'998713','Nos',12000.00,18.00,'active','2026-10-12 08:37:47'),
(6,'SEO – Monthly',NULL,'998366','Month',4999.00,18.00,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `billing_items` ENABLE KEYS */;
DROP TABLE IF EXISTS `blog_posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `blog_posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `slug` varchar(270) NOT NULL,
  `excerpt` varchar(500) DEFAULT NULL,
  `content` mediumtext DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `category` varchar(80) DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `author` varchar(120) DEFAULT NULL,
  `meta_title` varchar(255) DEFAULT NULL,
  `meta_description` varchar(500) DEFAULT NULL,
  `views` int(11) DEFAULT 0,
  `published_at` date DEFAULT NULL,
  `status` enum('published','draft') DEFAULT 'published',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `blog_posts` DISABLE KEYS */;
/*!40000 ALTER TABLE `blog_posts` ENABLE KEYS */;
DROP TABLE IF EXISTS `client_servers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_servers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `type` enum('shared_hosting','vps','dedicated','cloud','domain','ssl','email','amc','other') DEFAULT 'shared_hosting',
  `provider` varchar(120) DEFAULT NULL,
  `domain` varchar(255) DEFAULT NULL,
  `ip_address` varchar(60) DEFAULT NULL,
  `plan` varchar(120) DEFAULT NULL,
  `panel_url` varchar(255) DEFAULT NULL,
  `username` varchar(150) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `billing_cycle` enum('monthly','quarterly','half_yearly','yearly','biennial','one_time') DEFAULT 'yearly',
  `renewal_amount` decimal(12,2) DEFAULT 0.00,
  `cost_price` decimal(12,2) DEFAULT 0.00,
  `tax_rate` decimal(5,2) DEFAULT 18.00,
  `auto_reminder` tinyint(1) DEFAULT 1,
  `last_reminder_on` date DEFAULT NULL,
  `status` enum('active','suspended','expired','cancelled') DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `client_servers_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `client_servers` DISABLE KEYS */;
/*!40000 ALTER TABLE `client_servers` ENABLE KEYS */;
DROP TABLE IF EXISTS `clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `clients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `whatsapp` varchar(30) DEFAULT NULL,
  `gstin` varchar(30) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `pincode` varchar(15) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `clients` DISABLE KEYS */;
INSERT INTO `clients` VALUES
(1,'SP Office, Raigarh',NULL,NULL,NULL,NULL,NULL,'Office of the Superintendent of Police','Raigarh','Chhattisgarh',NULL,NULL,NULL,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `clients` ENABLE KEYS */;
DROP TABLE IF EXISTS `contract_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `contract_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `type` enum('service_agreement','website_development','software_development','amc','hosting','nda','freelancer','mou','custom') DEFAULT 'service_agreement',
  `title` varchar(200) NOT NULL,
  `body` mediumtext NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `contract_templates` DISABLE KEYS */;
INSERT INTO `contract_templates` VALUES
(1,'Website Development Agreement','website_development','Website Development Agreement','<p>This Website Development Agreement (“Agreement”) is entered into on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong>, having its office at {{company_address}} (“Service Provider”), and <strong>{{client_name}}</strong>, {{client_address}} (“Client”).</p>\n<h3>1. Scope of Work</h3><p>The Service Provider shall design and develop the website for the Client as described below:</p><p>{{scope_of_work}}</p>\n<h3>2. Deliverables & Timeline</h3><p>Deliverables: {{deliverables}}. The project shall commence on {{start_date}} and is expected to be completed by {{end_date}}, subject to timely receipt of content, approvals and payments from the Client.</p>\n<h3>3. Fees & Payment Terms</h3><p>The total fee for the project is <strong>Rs. {{contract_value}}/-</strong> ({{contract_value_words}}), exclusive of applicable taxes. Payment terms: {{payment_terms}}. Domain, hosting, premium plugins and third-party services are charged separately unless specifically included.</p>\n<h3>4. Client Responsibilities</h3><p>The Client shall provide text content, images, logos, credentials and feedback in a timely manner. Delays in providing the same shall extend the timeline accordingly.</p>\n<h3>5. Revisions & Change Requests</h3><p>Up to two rounds of design revisions are included. Any new feature or change outside the agreed scope will be quoted and billed separately.</p>\n<h3>6. Intellectual Property</h3><p>Upon receipt of full payment, ownership of the final website design and content shall transfer to the Client. The Service Provider may display the work in its portfolio unless the Client objects in writing. Third-party components remain subject to their respective licences.</p>\n<h3>7. Support & Warranty</h3><p>The Service Provider shall provide free bug-fix support for {{support_period}} from the date of launch. Post this period, support can be availed under an Annual Maintenance Contract.</p>\n<h3>8. Confidentiality</h3><p>Both parties shall keep confidential all information received from the other party and shall not disclose it to any third party without prior written consent.</p>\n<h3>9. Termination</h3><p>Either party may terminate this Agreement with 15 days written notice. On termination, the Client shall pay for all work completed up to the date of termination.</p>\n<h3>10. Governing Law</h3><p>This Agreement shall be governed by the laws of India and the courts at {{jurisdiction}} shall have exclusive jurisdiction.</p>','active','2026-10-12 08:37:47'),
(2,'Software Development & Service Agreement','software_development','Software Development & Service Agreement','<p>This Agreement is made on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> (“Developer”) and <strong>{{client_name}}</strong> (“Client”) for the project <strong>{{project_name}}</strong>.</p>\n<h3>1. Project Scope</h3><p>{{scope_of_work}}</p>\n<h3>2. Project Period</h3><p>The development shall be carried out from {{start_date}} to {{end_date}}. Milestones and demos will be shared periodically for the Client’s review and approval.</p>\n<h3>3. Consideration</h3><p>The Client agrees to pay <strong>Rs. {{contract_value}}/-</strong> ({{contract_value_words}}) plus applicable GST as per the following schedule: {{payment_terms}}.</p>\n<h3>4. Acceptance</h3><p>Each module shall be deemed accepted if no material defect is reported in writing within 7 days of delivery. Defects reported shall be rectified by the Developer free of cost.</p>\n<h3>5. Source Code & Ownership</h3><p>On receipt of full and final payment, the Client shall own the custom source code developed specifically for this project. Pre-existing libraries, frameworks and tools of the Developer remain the Developer’s property and are licensed to the Client for use with the software.</p>\n<h3>6. Data Security & Confidentiality</h3><p>The Developer shall take reasonable measures to protect the Client’s data and shall not disclose any confidential information, including official records, to third parties.</p>\n<h3>7. Warranty & Support</h3><p>The Developer warrants that the software will substantially perform as per the agreed specification for {{support_period}} after go-live, during which bugs will be fixed at no cost.</p>\n<h3>8. Limitation of Liability</h3><p>The Developer’s total liability under this Agreement shall not exceed the total fee paid by the Client under this Agreement.</p>\n<h3>9. Termination</h3><p>Either party may terminate this Agreement by giving 30 days written notice. All dues for work completed shall be settled within 15 days of termination.</p>\n<h3>10. Dispute Resolution</h3><p>Disputes shall first be resolved amicably; failing which they shall be subject to the exclusive jurisdiction of the courts at {{jurisdiction}}.</p>','active','2026-10-12 08:37:47'),
(3,'Annual Maintenance Contract (AMC)','amc','Annual Maintenance Contract','<p>This Annual Maintenance Contract (“AMC”) is entered into on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> (“Service Provider”) and <strong>{{client_name}}</strong> (“Client”).</p>\n<h3>1. Period</h3><p>This AMC is valid from <strong>{{start_date}}</strong> to <strong>{{end_date}}</strong>.</p>\n<h3>2. Services Covered</h3><p>{{services}}</p><ul><li>Bug fixing and troubleshooting of the existing application / website</li><li>Minor content and design updates</li><li>Security updates and regular backups</li><li>Technical support over phone, email and WhatsApp during working hours</li></ul>\n<h3>3. Response Time</h3><p>Critical issues will be attended within {{response_time}}; other requests within 2 working days.</p>\n<h3>4. Exclusions</h3><p>New modules, major redesign, third-party software licences, hardware and issues caused by unauthorised changes are not covered and will be charged separately.</p>\n<h3>5. AMC Charges</h3><p>The AMC fee is <strong>Rs. {{contract_value}}/-</strong> ({{contract_value_words}}) plus GST, payable {{payment_terms}}.</p>\n<h3>6. Renewal</h3><p>This AMC may be renewed for a further period on mutually agreed terms. The Service Provider will send a renewal reminder before expiry.</p>\n<h3>7. Termination & Jurisdiction</h3><p>Either party may terminate with 30 days written notice; fees paid for the current period are non-refundable. Subject to {{jurisdiction}} jurisdiction.</p>','active','2026-10-12 08:37:47'),
(4,'Hosting, Domain & Email Service Agreement','hosting','Hosting & Domain Service Agreement','<p>This Agreement dated <strong>{{agreement_date}}</strong> is between <strong>{{company}}</strong> (“Provider”) and <strong>{{client_name}}</strong> (“Customer”).</p>\n<h3>1. Services</h3><p>{{services}}</p>\n<h3>2. Term & Renewal</h3><p>Services are provided from {{start_date}} to {{end_date}}. Services must be renewed before expiry; the Provider will send reminders 30, 15 and 7 days in advance. Services not renewed may be suspended after expiry.</p>\n<h3>3. Fees</h3><p>The fee for the term is <strong>Rs. {{contract_value}}/-</strong> plus GST, payable in advance.</p>\n<h3>4. Uptime & Backups</h3><p>The Provider shall make reasonable efforts to maintain 99.5% uptime and take periodic backups. The Customer is advised to maintain independent backups of critical data.</p>\n<h3>5. Acceptable Use</h3><p>The Customer shall not host illegal, infringing or malicious content, send spam or misuse server resources. Violation may result in suspension without refund.</p>\n<h3>6. Ownership</h3><p>Domain names registered on behalf of the Customer shall be registered in the Customer’s name. Login credentials will be shared on request after clearance of all dues.</p>\n<h3>7. Liability</h3><p>The Provider shall not be liable for losses due to data centre outages, force majeure or actions of third-party providers beyond its control. Subject to {{jurisdiction}} jurisdiction.</p>','active','2026-10-12 08:37:47'),
(5,'Non-Disclosure Agreement (NDA)','nda','Non-Disclosure Agreement','<p>This Non-Disclosure Agreement is made on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> and <strong>{{client_name}}</strong> (each a “Party”, together the “Parties”).</p>\n<h3>1. Purpose</h3><p>The Parties wish to share certain confidential information for the purpose of {{purpose}} (“Purpose”).</p>\n<h3>2. Confidential Information</h3><p>“Confidential Information” means all business, technical, financial and personal information, source code, designs, data and documents disclosed by either Party, whether oral, written or electronic.</p>\n<h3>3. Obligations</h3><ol><li>Use the Confidential Information solely for the Purpose.</li><li>Not disclose it to any third party without prior written consent.</li><li>Protect it with at least the same care used for its own confidential information.</li><li>Return or destroy all Confidential Information on request.</li></ol>\n<h3>4. Exclusions</h3><p>Obligations do not apply to information that is publicly available, already known to the receiving Party, independently developed, or required to be disclosed by law.</p>\n<h3>5. Term</h3><p>This Agreement remains in force from {{start_date}} and the confidentiality obligations shall survive for {{nda_period}} after its termination.</p>\n<h3>6. Governing Law</h3><p>This Agreement is governed by the laws of India, subject to the jurisdiction of courts at {{jurisdiction}}.</p>','active','2026-10-12 08:37:47'),
(6,'Freelancer / Consultant Agreement','freelancer','Consultant Agreement','<p>This Agreement is made on <strong>{{agreement_date}}</strong> between <strong>{{company}}</strong> (“Company”) and <strong>{{client_name}}</strong>, {{client_address}} (“Consultant”).</p>\n<h3>1. Engagement</h3><p>The Company engages the Consultant on a contract basis for: {{scope_of_work}}</p>\n<h3>2. Term</h3><p>From {{start_date}} to {{end_date}}, unless terminated earlier.</p>\n<h3>3. Fees</h3><p>The Company shall pay the Consultant Rs. {{contract_value}}/- ({{contract_value_words}}) {{payment_terms}}, subject to applicable TDS.</p>\n<h3>4. Independent Contractor</h3><p>The Consultant is an independent contractor and not an employee of the Company, and is responsible for their own taxes and statutory compliance.</p>\n<h3>5. Intellectual Property & Confidentiality</h3><p>All work product created under this Agreement shall be the exclusive property of the Company. The Consultant shall keep all Company and client information strictly confidential.</p>\n<h3>6. Non-Solicitation</h3><p>During the term and for 12 months thereafter, the Consultant shall not directly solicit the Company’s clients introduced under this engagement.</p>\n<h3>7. Termination & Jurisdiction</h3><p>Either party may terminate with 15 days written notice. Subject to {{jurisdiction}} jurisdiction.</p>','active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `contract_templates` ENABLE KEYS */;
DROP TABLE IF EXISTS `contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `contracts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `contract_no` varchar(60) NOT NULL,
  `template_id` int(11) DEFAULT NULL,
  `type` varchar(40) NOT NULL DEFAULT 'service_agreement',
  `title` varchar(200) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `project_id` int(11) DEFAULT NULL,
  `party_name` varchar(200) NOT NULL,
  `party_representative` varchar(150) DEFAULT NULL,
  `party_address` text DEFAULT NULL,
  `party_email` varchar(150) DEFAULT NULL,
  `party_phone` varchar(30) DEFAULT NULL,
  `agreement_date` date NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `contract_value` decimal(12,2) DEFAULT 0.00,
  `data` mediumtext DEFAULT NULL,
  `body` mediumtext NOT NULL,
  `status` enum('draft','sent','accepted','signed','active','expired','terminated') DEFAULT 'draft',
  `accepted_by` varchar(150) DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `accepted_ip` varchar(60) DEFAULT NULL,
  `signed_file` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `viewed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contract_no` (`contract_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `contracts` DISABLE KEYS */;
/*!40000 ALTER TABLE `contracts` ENABLE KEYS */;
DROP TABLE IF EXISTS `daily_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `report_date` date NOT NULL,
  `work_done` text NOT NULL,
  `hours` decimal(4,1) DEFAULT 0.0,
  `plan_tomorrow` text DEFAULT NULL,
  `blockers` text DEFAULT NULL,
  `status` enum('submitted','reviewed') DEFAULT 'submitted',
  `reviewer_remarks` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_emp_day` (`employee_id`,`report_date`),
  CONSTRAINT `daily_reports_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `daily_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `daily_reports` ENABLE KEYS */;
DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES
(1,'Development',NULL,'active','2026-10-12 08:37:47'),
(2,'Design',NULL,'active','2026-10-12 08:37:47'),
(3,'Digital Marketing',NULL,'active','2026-10-12 08:37:47'),
(4,'Sales & Support',NULL,'active','2026-10-12 08:37:47'),
(5,'HR & Admin',NULL,'active','2026-10-12 08:37:47'),
(6,'Accounts',NULL,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
DROP TABLE IF EXISTS `designations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `designations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `department_id` int(11) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `designations` DISABLE KEYS */;
INSERT INTO `designations` VALUES
(1,'Software Developer',1,'active','2026-10-12 08:37:47'),
(2,'Senior Software Developer',1,'active','2026-10-12 08:37:47'),
(3,'Web Developer Intern',1,'active','2026-10-12 08:37:47'),
(4,'Mobile App Developer',1,'active','2026-10-12 08:37:47'),
(5,'Project Manager',1,'active','2026-10-12 08:37:47'),
(6,'UI/UX Designer',2,'active','2026-10-12 08:37:47'),
(7,'Graphic Designer',2,'active','2026-10-12 08:37:47'),
(8,'SEO Executive',3,'active','2026-10-12 08:37:47'),
(9,'Digital Marketing Executive',3,'active','2026-10-12 08:37:47'),
(10,'Business Development Executive',4,'active','2026-10-12 08:37:47'),
(11,'Support Executive',4,'active','2026-10-12 08:37:47'),
(12,'HR Executive',5,'active','2026-10-12 08:37:47'),
(13,'Accountant',6,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `designations` ENABLE KEYS */;
DROP TABLE IF EXISTS `employee_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `title` varchar(150) NOT NULL,
  `file` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_documents_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `employee_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `employee_documents` ENABLE KEYS */;
DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `employees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `emp_code` varchar(30) NOT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `gender` enum('male','female','other') DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `father_name` varchar(150) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `department_id` int(11) DEFAULT NULL,
  `designation_id` int(11) DEFAULT NULL,
  `reporting_to` int(11) DEFAULT NULL,
  `employment_type` enum('full_time','part_time','intern','contract') DEFAULT 'full_time',
  `joining_date` date DEFAULT NULL,
  `probation_end` date DEFAULT NULL,
  `exit_date` date DEFAULT NULL,
  `salary` decimal(12,2) DEFAULT 0.00,
  `shift_start` time DEFAULT '10:00:00',
  `shift_end` time DEFAULT '18:00:00',
  `bank_name` varchar(120) DEFAULT NULL,
  `account_no` varchar(40) DEFAULT NULL,
  `ifsc` varchar(20) DEFAULT NULL,
  `pan` varchar(20) DEFAULT NULL,
  `aadhaar` varchar(20) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `emergency_contact` varchar(150) DEFAULT NULL,
  `status` enum('active','on_notice','resigned','terminated') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `emp_code` (`emp_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `employees` DISABLE KEYS */;
/*!40000 ALTER TABLE `employees` ENABLE KEYS */;
DROP TABLE IF EXISTS `enquiries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `enquiries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `company` varchar(150) DEFAULT NULL,
  `service` varchar(150) DEFAULT NULL,
  `budget` varchar(80) DEFAULT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `source` varchar(50) DEFAULT 'contact',
  `status` enum('new','contacted','qualified','converted','closed') DEFAULT 'new',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `enquiries` DISABLE KEYS */;
/*!40000 ALTER TABLE `enquiries` ENABLE KEYS */;
DROP TABLE IF EXISTS `expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `category` varchar(80) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `expense_date` date NOT NULL,
  `mode` varchar(40) DEFAULT NULL,
  `vendor` varchar(150) DEFAULT NULL,
  `receipt` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `expenses` DISABLE KEYS */;
/*!40000 ALTER TABLE `expenses` ENABLE KEYS */;
DROP TABLE IF EXISTS `faqs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `faqs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `category` varchar(80) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `faqs` DISABLE KEYS */;
INSERT INTO `faqs` VALUES
(1,'How long does it take to build a website?','A standard business website takes 7–15 working days. Custom software and apps are delivered in phases; we share a clear timeline with the quotation.',NULL,1,'active','2026-10-12 08:37:47'),
(2,'Do you provide support after delivery?','Yes. Every project includes free support (3 to 12 months depending on the plan) and we offer affordable annual maintenance contracts (AMC).',NULL,2,'active','2026-10-12 08:37:47'),
(3,'Will I be able to update my website myself?','Absolutely. Our dynamic websites come with an easy admin panel to manage content, images, blogs and more without any coding.',NULL,3,'active','2026-10-12 08:37:47'),
(4,'Do you work with government departments?','Yes, we have developed and maintain software modules for several government offices, including police and court-related systems.',NULL,4,'active','2026-10-12 08:37:47'),
(5,'What are the payment terms?','Usually 50% advance and 50% on delivery. For larger projects we follow milestone-based payments. We accept bank transfer, UPI and cheque.',NULL,5,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `faqs` ENABLE KEYS */;
DROP TABLE IF EXISTS `holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `holidays` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(150) NOT NULL,
  `date` date NOT NULL,
  `type` enum('public','optional','company') DEFAULT 'public',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `holidays` DISABLE KEYS */;
/*!40000 ALTER TABLE `holidays` ENABLE KEYS */;
DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(11) NOT NULL,
  `description` varchar(500) NOT NULL,
  `hsn_sac` varchar(20) DEFAULT NULL,
  `quantity` decimal(12,2) DEFAULT 1.00,
  `unit` varchar(30) DEFAULT NULL,
  `rate` decimal(12,2) DEFAULT 0.00,
  `tax_rate` decimal(5,2) DEFAULT 0.00,
  `amount` decimal(12,2) DEFAULT 0.00,
  `sort_order` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_items_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `invoice_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoice_items` ENABLE KEYS */;
DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(50) NOT NULL,
  `client_id` int(11) NOT NULL,
  `quotation_id` int(11) DEFAULT NULL,
  `server_id` int(11) DEFAULT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `subtotal` decimal(12,2) DEFAULT 0.00,
  `discount` decimal(12,2) DEFAULT 0.00,
  `tax_total` decimal(12,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT 0.00,
  `amount_paid` decimal(12,2) DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `terms` text DEFAULT NULL,
  `status` enum('draft','unpaid','partial','paid','overdue','cancelled') DEFAULT 'unpaid',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `project_id` int(11) DEFAULT NULL,
  `viewed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_no` (`invoice_no`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoices` ENABLE KEYS */;
DROP TABLE IF EXISTS `job_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `job_id` int(11) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `qualification` varchar(150) DEFAULT NULL,
  `college` varchar(200) DEFAULT NULL,
  `experience` varchar(80) DEFAULT NULL,
  `current_ctc` varchar(50) DEFAULT NULL,
  `expected_ctc` varchar(50) DEFAULT NULL,
  `notice_period` varchar(50) DEFAULT NULL,
  `resume` varchar(255) DEFAULT NULL,
  `portfolio_url` varchar(255) DEFAULT NULL,
  `cover_letter` text DEFAULT NULL,
  `stage` enum('applied','shortlisted','interview','selected','offered','hired','rejected') DEFAULT 'applied',
  `interview_at` datetime DEFAULT NULL,
  `interview_mode` enum('in_person','phone','video') DEFAULT NULL,
  `interview_link` varchar(255) DEFAULT NULL,
  `rating` tinyint(4) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `job_applications` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_applications` ENABLE KEYS */;
DROP TABLE IF EXISTS `job_openings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_openings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `slug` varchar(220) NOT NULL,
  `department` varchar(120) DEFAULT NULL,
  `location` varchar(120) DEFAULT NULL,
  `job_type` enum('full_time','part_time','internship','contract','remote') DEFAULT 'full_time',
  `experience` varchar(80) DEFAULT NULL,
  `salary_range` varchar(80) DEFAULT NULL,
  `openings` int(11) DEFAULT 1,
  `short_description` varchar(500) DEFAULT NULL,
  `description` mediumtext DEFAULT NULL,
  `requirements` mediumtext DEFAULT NULL,
  `last_date` date DEFAULT NULL,
  `status` enum('open','closed','draft') DEFAULT 'open',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `job_openings` DISABLE KEYS */;
INSERT INTO `job_openings` VALUES
(1,'Web Developer Intern','web-developer-intern','Development','Kawardha (On-site)','internship','Fresher','₹3,000 – ₹8,000 / month',5,'Kick-start your career working on live React, Node.js and PHP projects.','<p>Work alongside our senior developers on real client projects. Learn modern web technologies and best practices.</p>','<ul><li>Basic knowledge of HTML, CSS, JavaScript</li><li>Familiarity with React or PHP is a plus</li><li>Eagerness to learn</li></ul>',NULL,'open','2026-10-12 08:37:47'),
(2,'Full Stack Developer','full-stack-developer','Development','Kawardha / Remote','full_time','1–3 years','₹15,000 – ₹35,000 / month',2,'Build web applications with React, Node.js and MySQL.','<p>Design, build and maintain web applications and APIs for our clients.</p>','<ul><li>Strong JavaScript, React & Node.js</li><li>MySQL & REST APIs</li><li>Git</li></ul>',NULL,'open','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `job_openings` ENABLE KEYS */;
DROP TABLE IF EXISTS `leave_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `leave_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `leave_type_id` int(11) NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `half_day` tinyint(1) DEFAULT 0,
  `days` decimal(5,1) NOT NULL,
  `reason` text DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') DEFAULT 'pending',
  `approved_by` int(11) DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `leave_requests_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `leave_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `leave_requests` ENABLE KEYS */;
DROP TABLE IF EXISTS `leave_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `leave_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `days_per_year` decimal(5,1) DEFAULT 12.0,
  `is_paid` tinyint(1) DEFAULT 1,
  `color` varchar(20) DEFAULT '#1d6fb8',
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `leave_types` DISABLE KEYS */;
INSERT INTO `leave_types` VALUES
(1,'Casual Leave',12.0,1,'#1d6fb8','active','2026-10-12 08:37:47'),
(2,'Sick Leave',6.0,1,'#0ea5e9','active','2026-10-12 08:37:47'),
(3,'Earned Leave',12.0,1,'#16a34a','active','2026-10-12 08:37:47'),
(4,'Leave Without Pay',365.0,0,'#dc2626','active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `leave_types` ENABLE KEYS */;
DROP TABLE IF EXISTS `letter_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `letter_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `type` enum('internship_offer','offer','appointment','joining','experience','relieving','internship_completion','warning','custom') DEFAULT 'custom',
  `title` varchar(200) NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `body` mediumtext NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `letter_templates` DISABLE KEYS */;
INSERT INTO `letter_templates` VALUES
(1,'Internship Offer Letter','internship_offer','Internship Offer Letter','Offer of Internship – {{designation}}','<p>Dear {{name}},</p>\n<p>We are pleased to offer you an internship opportunity with <strong>{{company}}</strong> as a <strong>{{designation}}</strong>. We were impressed with your profile and believe this internship will be a great learning experience for you.</p>\n<p>The details of your internship are as follows:</p>\n<ul><li><strong>Position:</strong> {{designation}}</li><li><strong>Department:</strong> {{department}}</li><li><strong>Start Date:</strong> {{start_date}}</li><li><strong>Duration:</strong> {{duration}}</li><li><strong>Stipend:</strong> {{stipend}}</li><li><strong>Working Hours:</strong> {{working_hours}} (Monday to Saturday)</li><li><strong>Location:</strong> {{location}}</li></ul>\n<p>During the internship you will work on live projects under the guidance of our senior team members. On successful completion you will receive an Internship Completion Certificate. Based on your performance, you may be considered for a full-time position.</p>\n<p>You are required to maintain confidentiality of all company information, source code and client data during and after the internship. The internship may be terminated by either party with 7 days written notice.</p>\n<p>Please sign and return a copy of this letter as a token of your acceptance on or before {{acceptance_date}}.</p>\n<p>We look forward to having you on our team!</p>','active','2026-10-12 08:37:47'),
(2,'Offer Letter','offer','Offer Letter','Offer of Employment – {{designation}}','<p>Dear {{name}},</p>\n<p>With reference to your application and the subsequent interview, we are delighted to offer you the position of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at <strong>{{company}}</strong>.</p>\n<ul><li><strong>Date of Joining:</strong> {{joining_date}}</li><li><strong>Annual CTC:</strong> Rs. {{ctc}}/- (Monthly Rs. {{salary}}/-)</li><li><strong>Probation Period:</strong> {{probation}}</li><li><strong>Working Hours:</strong> {{working_hours}}</li><li><strong>Place of Work:</strong> {{location}}</li></ul>\n<p>Your detailed appointment letter will be issued at the time of joining. Kindly bring the following documents on your joining day: educational certificates, ID proof (Aadhaar & PAN), two passport-size photographs, previous employment relieving letter (if any) and bank account details.</p>\n<p>This offer is subject to verification of your documents and references. Please confirm your acceptance by signing and returning a copy of this letter on or before {{acceptance_date}}.</p>\n<p>We welcome you to the {{company}} family and look forward to a long and mutually rewarding association.</p>','active','2026-10-12 08:37:47'),
(3,'Appointment Letter','appointment','Appointment Letter','Appointment as {{designation}}','<p>Dear {{name}},</p>\n<p>We are pleased to appoint you as <strong>{{designation}}</strong> in <strong>{{company}}</strong> with effect from <strong>{{joining_date}}</strong> on the following terms and conditions:</p>\n<ol><li><strong>Remuneration:</strong> Your monthly gross salary will be Rs. {{salary}}/- (Annual CTC Rs. {{ctc}}/-), subject to applicable deductions.</li><li><strong>Probation:</strong> You will be on probation for {{probation}}, which may be extended at the discretion of the management. On satisfactory completion you will be confirmed in writing.</li><li><strong>Working Hours:</strong> {{working_hours}}, Monday to Saturday. You may be required to work additional hours as per project needs.</li><li><strong>Leave:</strong> You will be entitled to leave as per the company leave policy.</li><li><strong>Notice Period:</strong> During probation either party may terminate employment with 15 days notice; after confirmation the notice period will be 30 days.</li><li><strong>Confidentiality:</strong> You shall not disclose any confidential information, source code, client data or trade secrets of the company during or after your employment.</li><li><strong>Intellectual Property:</strong> All work, code and material created during employment shall remain the sole property of the company.</li><li><strong>Code of Conduct:</strong> You are expected to follow all company policies as amended from time to time.</li></ol>\n<p>Please sign the duplicate copy of this letter in token of your acceptance.</p>\n<p>We wish you a successful career with us.</p>','active','2026-10-12 08:37:47'),
(4,'Joining Letter','joining','Joining Letter','Confirmation of Joining','<p>Dear {{name}},</p>\n<p>This is to confirm that you have joined <strong>{{company}}</strong> as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department on <strong>{{joining_date}}</strong>.</p>\n<p>Your Employee Code is <strong>{{emp_code}}</strong>. You will be reporting to <strong>{{reporting_to}}</strong>. Your official working hours are {{working_hours}}.</p>\n<p>Your employee portal account has been created – please use it to mark daily attendance, apply for leave, view assigned tasks and submit your daily work report.</p>\n<p>We are happy to have you with us and wish you a long and successful career at {{company}}.</p>','active','2026-10-12 08:37:47'),
(5,'Internship Completion Certificate','internship_completion','Internship Certificate','','<p class=\"ql-align-center\"><strong>TO WHOMSOEVER IT MAY CONCERN</strong></p>\n<p>This is to certify that <strong>{{name}}</strong> has successfully completed an internship with <strong>{{company}}</strong> as <strong>{{designation}}</strong> from <strong>{{start_date}}</strong> to <strong>{{end_date}}</strong>.</p>\n<p>During the internship {{pronoun_his}} work included {{project}}. We found {{first_name}} to be sincere, hardworking and eager to learn. {{pronoun}} showed good technical understanding and worked well with the team.</p>\n<p>We wish {{first_name}} all the best for future endeavours.</p>','active','2026-10-12 08:37:47'),
(6,'Experience Letter','experience','Experience Letter','','<p class=\"ql-align-center\"><strong>TO WHOMSOEVER IT MAY CONCERN</strong></p>\n<p>This is to certify that <strong>{{name}}</strong> (Employee Code: {{emp_code}}) was employed with <strong>{{company}}</strong> as <strong>{{designation}}</strong> from <strong>{{joining_date}}</strong> to <strong>{{last_working_day}}</strong>.</p>\n<p>During this tenure we found {{pronoun_his}} conduct and performance to be good. {{pronoun}} was a dedicated team member and handled responsibilities sincerely.</p>\n<p>We wish {{first_name}} every success in future.</p>','active','2026-10-12 08:37:47'),
(7,'Relieving Letter','relieving','Relieving Letter','Relieving from services','<p>Dear {{name}},</p>\n<p>This has reference to your resignation letter. We would like to inform you that your resignation has been accepted and you are relieved from the services of <strong>{{company}}</strong> at the close of business hours on <strong>{{last_working_day}}</strong>.</p>\n<p>We confirm that you have handed over all company assets and your full & final settlement has been processed.</p>\n<p>We thank you for your contribution and wish you all the best for your future endeavours.</p>','active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `letter_templates` ENABLE KEYS */;
DROP TABLE IF EXISTS `letters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `letters` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `letter_no` varchar(60) NOT NULL,
  `template_id` int(11) DEFAULT NULL,
  `type` varchar(40) NOT NULL,
  `title` varchar(200) NOT NULL,
  `recipient_name` varchar(150) NOT NULL,
  `recipient_email` varchar(150) DEFAULT NULL,
  `recipient_phone` varchar(30) DEFAULT NULL,
  `recipient_address` text DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `application_id` int(11) DEFAULT NULL,
  `data` mediumtext DEFAULT NULL,
  `body` mediumtext NOT NULL,
  `issue_date` date NOT NULL,
  `status` enum('draft','issued','sent','accepted','revoked') DEFAULT 'issued',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `letter_no` (`letter_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `letters` DISABLE KEYS */;
/*!40000 ALTER TABLE `letters` ENABLE KEYS */;
DROP TABLE IF EXISTS `notification_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `channel` enum('email','sms','whatsapp') NOT NULL,
  `recipient` varchar(255) NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `status` enum('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  `error` text DEFAULT NULL,
  `ref_type` varchar(50) DEFAULT NULL,
  `ref_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ref_type` (`ref_type`,`ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `notification_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_logs` ENABLE KEYS */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `type` varchar(40) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `body` varchar(500) DEFAULT NULL,
  `link` varchar(255) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`,`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
DROP TABLE IF EXISTS `pages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `slug` varchar(170) NOT NULL,
  `content` mediumtext DEFAULT NULL,
  `meta_title` varchar(255) DEFAULT NULL,
  `meta_description` varchar(500) DEFAULT NULL,
  `show_in_footer` tinyint(1) DEFAULT 1,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `pages` DISABLE KEYS */;
INSERT INTO `pages` VALUES
(1,'Privacy Policy','privacy-policy','<h2>Privacy Policy</h2><p>We respect your privacy. Information submitted through our website forms (name, email, phone) is used only to respond to your enquiry and is never sold to third parties.</p><p>For any privacy-related questions contact us at yjtechnosoft@gmail.com.</p>',NULL,NULL,1,'active','2026-10-12 08:37:47'),
(2,'Terms & Conditions','terms-and-conditions','<h2>Terms & Conditions</h2><p>By using this website you agree to these terms. All project work is governed by the quotation / agreement signed with the client. Payments once made for completed milestones are non-refundable.</p>',NULL,NULL,1,'active','2026-10-12 08:37:47'),
(3,'Refund Policy','refund-policy','<h2>Refund Policy</h2><p>Advance payments are refundable only if work has not started. Domain registrations and third-party licences are non-refundable.</p>',NULL,NULL,1,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `pages` ENABLE KEYS */;
DROP TABLE IF EXISTS `partners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `partners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `partners` DISABLE KEYS */;
/*!40000 ALTER TABLE `partners` ENABLE KEYS */;
DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `receipt_no` varchar(50) DEFAULT NULL,
  `invoice_id` int(11) NOT NULL,
  `client_id` int(11) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_date` date NOT NULL,
  `mode` enum('cash','upi','bank_transfer','cheque','card','other') DEFAULT 'bank_transfer',
  `reference` varchar(150) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
DROP TABLE IF EXISTS `payslips`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `payslips` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `month` tinyint(4) NOT NULL,
  `year` smallint(6) NOT NULL,
  `working_days` decimal(5,1) DEFAULT 0.0,
  `paid_days` decimal(5,1) DEFAULT 0.0,
  `lop_days` decimal(5,1) DEFAULT 0.0,
  `gross` decimal(12,2) DEFAULT 0.00,
  `basic` decimal(12,2) DEFAULT 0.00,
  `hra` decimal(12,2) DEFAULT 0.00,
  `allowances` decimal(12,2) DEFAULT 0.00,
  `bonus` decimal(12,2) DEFAULT 0.00,
  `deductions` decimal(12,2) DEFAULT 0.00,
  `lop_amount` decimal(12,2) DEFAULT 0.00,
  `net_pay` decimal(12,2) DEFAULT 0.00,
  `status` enum('generated','paid') DEFAULT 'generated',
  `paid_on` date DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_emp_month` (`employee_id`,`month`,`year`),
  CONSTRAINT `payslips_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `payslips` DISABLE KEYS */;
/*!40000 ALTER TABLE `payslips` ENABLE KEYS */;
DROP TABLE IF EXISTS `portfolio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `portfolio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(150) NOT NULL,
  `slug` varchar(170) NOT NULL,
  `category` varchar(80) DEFAULT NULL,
  `client_name` varchar(150) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `short_description` varchar(500) DEFAULT NULL,
  `description` mediumtext DEFAULT NULL,
  `technologies` varchar(255) DEFAULT NULL,
  `project_url` varchar(255) DEFAULT NULL,
  `completed_on` date DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `is_featured` tinyint(1) DEFAULT 1,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `portfolio` DISABLE KEYS */;
/*!40000 ALTER TABLE `portfolio` ENABLE KEYS */;
DROP TABLE IF EXISTS `pricing_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pricing_plans` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `price` varchar(50) DEFAULT NULL,
  `period` varchar(50) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `features` text DEFAULT NULL,
  `is_highlighted` tinyint(1) DEFAULT 0,
  `button_text` varchar(60) DEFAULT 'Get Started',
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `pricing_plans` DISABLE KEYS */;
INSERT INTO `pricing_plans` VALUES
(1,'Starter Website','₹7,999','one time','Perfect for small businesses & professionals','5 page responsive website\nContact form & WhatsApp chat\nBasic SEO setup\nFree domain for 1 year\n1 year hosting\n3 months support',0,'Get Started',1,'active','2026-10-12 08:37:47'),
(2,'Business Website','₹19,999','one time','Dynamic website with admin panel','Unlimited pages\nAdmin panel / CMS\nBlog & gallery\nAdvanced SEO\nBusiness email\n1 year support',1,'Get Started',2,'active','2026-10-12 08:37:47'),
(3,'E-Commerce','₹34,999','one time','Sell online with a complete store','Product catalogue\nCart & checkout\nPayment gateway\nOrder management\nInvoice & SMS alerts\n1 year support',0,'Get Started',3,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `pricing_plans` ENABLE KEYS */;
DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `deadline` date DEFAULT NULL,
  `budget` decimal(12,2) DEFAULT 0.00,
  `status` enum('planning','in_progress','on_hold','completed','cancelled') DEFAULT 'in_progress',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
DROP TABLE IF EXISTS `push_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `push_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `endpoint` varchar(600) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(100) NOT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_endpoint` (`endpoint`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `push_subscriptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `push_subscriptions` ENABLE KEYS */;
DROP TABLE IF EXISTS `quotation_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotation_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `quotation_id` int(11) NOT NULL,
  `description` varchar(500) NOT NULL,
  `hsn_sac` varchar(20) DEFAULT NULL,
  `quantity` decimal(12,2) DEFAULT 1.00,
  `unit` varchar(30) DEFAULT NULL,
  `rate` decimal(12,2) DEFAULT 0.00,
  `tax_rate` decimal(5,2) DEFAULT 0.00,
  `amount` decimal(12,2) DEFAULT 0.00,
  `sort_order` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `quotation_id` (`quotation_id`),
  CONSTRAINT `quotation_items_ibfk_1` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `quotation_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `quotation_items` ENABLE KEYS */;
DROP TABLE IF EXISTS `quotations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `quote_no` varchar(50) NOT NULL,
  `client_id` int(11) NOT NULL,
  `quote_date` date NOT NULL,
  `valid_until` date DEFAULT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `subtotal` decimal(12,2) DEFAULT 0.00,
  `discount` decimal(12,2) DEFAULT 0.00,
  `tax_total` decimal(12,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `terms` text DEFAULT NULL,
  `status` enum('draft','sent','accepted','rejected','converted') DEFAULT 'draft',
  `invoice_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `project_id` int(11) DEFAULT NULL,
  `accepted_by` varchar(150) DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `accepted_ip` varchar(60) DEFAULT NULL,
  `viewed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `quote_no` (`quote_no`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `quotations_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `quotations` DISABLE KEYS */;
/*!40000 ALTER TABLE `quotations` ENABLE KEYS */;
DROP TABLE IF EXISTS `services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `services` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(150) NOT NULL,
  `slug` varchar(170) NOT NULL,
  `icon` varchar(60) DEFAULT NULL,
  `short_description` varchar(500) DEFAULT NULL,
  `description` mediumtext DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `features` text DEFAULT NULL,
  `starting_price` varchar(60) DEFAULT NULL,
  `meta_title` varchar(255) DEFAULT NULL,
  `meta_description` varchar(500) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `is_featured` tinyint(1) DEFAULT 1,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `services` DISABLE KEYS */;
INSERT INTO `services` VALUES
(1,'Website Development','website-development','globe','Fast, responsive and SEO-ready websites that turn visitors into customers.','<p>From corporate websites to e-commerce stores and web portals, we design and develop websites that look stunning on every device, load in a blink and rank well on Google.</p>',NULL,'Responsive design\nSEO-friendly structure\nAdmin panel / CMS\nE-commerce & payment gateway\nSpeed & security optimised\n1 year free support','₹ 7,999',NULL,NULL,1,1,'active','2026-10-12 08:37:47'),
(2,'Custom Software Development','custom-software-development','code','Tailor-made software – ERP, CRM, billing, school & hospital management.','<p>We build robust business software that automates your workflows – billing, inventory, HR, CRM, school and hospital management and much more.</p>',NULL,'Requirement analysis\nCloud or on-premise\nRole based access\nReports & dashboards\nData migration\nTraining & support','₹ 24,999',NULL,NULL,2,1,'active','2026-10-12 08:37:47'),
(3,'Mobile App Development','mobile-app-development','smartphone','Native-quality Android & iOS apps built with Flutter and React Native.','<p>Engaging mobile applications for Android and iOS with beautiful UI, push notifications, payments and real-time features.</p>',NULL,'Android & iOS\nFlutter / React Native\nPush notifications\nPayment integration\nPlay Store publishing\nAPI & admin panel','₹ 29,999',NULL,NULL,3,1,'active','2026-10-12 08:37:47'),
(4,'E-Governance Solutions','e-governance-solutions','landmark','Secure software for government departments, police & courts.','<p>We have delivered mission-critical modules for government offices including court user modules, case tracking and departmental MIS – built with security, audit trails and ease of use in mind.</p>',NULL,'Department MIS\nCourt & case tracking modules\nRole based workflows\nAudit trails\nSMS / Email alerts\nOn-site training','On request',NULL,NULL,4,1,'active','2026-10-12 08:37:47'),
(5,'Digital Marketing & SEO','digital-marketing-seo','trending-up','Grow traffic, leads and sales with SEO, social media and Google Ads.','<p>Data-driven digital marketing – search engine optimisation, social media management, Google & Meta ads and content marketing that delivers measurable ROI.</p>',NULL,'On-page & off-page SEO\nSocial media management\nGoogle & Meta Ads\nContent marketing\nMonthly reports\nLocal SEO / Google Business','₹ 4,999/mo',NULL,NULL,5,1,'active','2026-10-12 08:37:47'),
(6,'Domain, Hosting & Email','domain-hosting-email','server','Reliable hosting, domains, SSL and business email with 24x7 support.','<p>Blazing-fast and secure hosting, VPS and cloud servers with daily backups, free SSL and business email – fully managed by our team.</p>',NULL,'Domain registration\nShared, VPS & cloud hosting\nFree SSL certificate\nBusiness email\nDaily backups\nServer management','₹ 2,499/yr',NULL,NULL,6,1,'active','2026-10-12 08:37:47'),
(7,'UI/UX & Graphic Design','ui-ux-graphic-design','pen-tool','Logos, branding, UI design and marketing creatives that stand out.','<p>Beautiful, user-centred design – from brand identity and logos to app/web UI and social media creatives.</p>',NULL,'Logo & branding\nUI/UX design\nSocial media creatives\nBrochures & flyers\nPresentation design','₹ 1,999',NULL,NULL,7,1,'active','2026-10-12 08:37:47'),
(8,'Bulk SMS & WhatsApp','bulk-sms-whatsapp','message-circle','Reach customers instantly with bulk SMS, WhatsApp & voice campaigns.','<p>DLT-approved bulk SMS, WhatsApp Business API and voice call solutions for alerts, OTPs and promotions.</p>',NULL,'DLT registration help\nTransactional & promotional SMS\nWhatsApp Business API\nAPI integration\nDelivery reports','On request',NULL,NULL,8,1,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `services` ENABLE KEYS */;
DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `settings` (
  `key` varchar(100) NOT NULL,
  `value` mediumtext DEFAULT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `settings` DISABLE KEYS */;
INSERT INTO `settings` VALUES
('about_image',''),
('about_text','<p>YJTechnosoft Private Limited is a registered IT company headquartered in Kawardha, Chhattisgarh. Since 2021 we have been delivering websites, custom software, mobile applications and e-governance solutions to businesses, institutions and government departments across India.</p><p>Our team of developers, designers and digital marketers combines deep technical expertise with a genuine understanding of local needs – delivering reliable, secure and affordable technology with dedicated after-sales support.</p>'),
('about_title','We build digital products that move businesses & governments forward'),
('address','Rajmahal Chowk, Kawardha, Chhattisgarh'),
('attendance_grace_minutes','15'),
('bank_account_holder','YJTECHNOSOFT PRIVATE LIMITED'),
('bank_account_number','50200063127366'),
('bank_account_type','CURRENT'),
('bank_branch','KAWARDHA'),
('bank_ifsc','HDFC0001654'),
('bank_name','HDFC Bank'),
('birthday_wishes','1'),
('cin','U72900CT2021PTC012188'),
('city','Kawardha, Chhattisgarh'),
('company_name','YJTECHNOSOFT PRIVATE LIMITED'),
('contract_prefix','YJ/AGR'),
('cta_text','Get a free consultation and a detailed quotation within 24 hours.'),
('cta_title','Have a project in mind? Let’s build it together.'),
('email','yjtechnosoft@gmail.com'),
('emp_code_prefix','YJT'),
('enquiry_autoreply','1'),
('enquiry_whatsapp_alert','0'),
('facebook','https://facebook.com/'),
('favicon','/assets/logo-icon.png'),
('footer_about','One stop solution for websites, software, mobile apps, e-governance and digital marketing. Trusted by businesses and government departments across Chhattisgarh.'),
('gstin',''),
('gst_split','1'),
('half_day_hours','4'),
('hero_video',''),
('instagram','https://instagram.com/'),
('invoice_due_days','15'),
('invoice_prefix','YJ/INV'),
('invoice_reminders','0'),
('invoice_terms','1. Payment is due within 15 days from the invoice date.\n2. Please mention the invoice number while making payment.\n3. This is a computer generated invoice.'),
('letter_prefix','YJ/HR'),
('linkedin','https://linkedin.com/'),
('logo','/assets/logo.png'),
('logo_light',''),
('mail_from_email',''),
('mail_from_name','YJTechnosoft'),
('map_embed','https://www.google.com/maps?q=Rajmahal+Chowk+Kawardha+Chhattisgarh&output=embed'),
('meta_description','YJTechnosoft Private Limited is a one stop IT solution company offering website development, custom software, mobile apps, e-governance solutions, digital marketing and hosting services.'),
('meta_keywords','software company kawardha, website development chhattisgarh, mobile app development, e-governance software, digital marketing'),
('meta_title','YJTechnosoft – Software, Web & Mobile App Development Company in Chhattisgarh'),
('mission','To make world-class technology accessible and affordable for every business and public institution.'),
('notify_admin_emails','yjtechnosoft@gmail.com'),
('office_end_time','18:00'),
('office_ip_whitelist',''),
('office_start_time','10:00'),
('payroll_missing_as_absent','1'),
('phone','+91 7000796585'),
('phone2','+91 8770510012'),
('primary_color','#1d6fb8'),
('quotation_prefix','YJ/QT'),
('quotation_terms','1. This quotation is valid for 30 days.\n2. 50% advance payment is required to start the work; balance on delivery.\n3. Domain, hosting and third-party charges are extra unless mentioned.\n4. Any additional requirement will be charged separately.'),
('receipt_prefix','YJ/RCPT'),
('salary_basic_pct','50'),
('salary_hra_pct','20'),
('server_reminders','1'),
('server_reminder_days','30,15,7,3,1,0'),
('server_reminder_whatsapp','0'),
('signatory_designation','Director'),
('signatory_name','Authorised Signatory'),
('site_name','YJTechnosoft'),
('site_url','http://localhost:5173'),
('sms_provider','none'),
('smtp_host',''),
('smtp_pass',''),
('smtp_port','587'),
('smtp_secure','0'),
('smtp_user',''),
('tagline','One Stop Solution'),
('twitter',''),
('upi_id','7000796585@hdfcbank'),
('vision','To be the most trusted technology partner in Central India, known for quality, transparency and long-term support.'),
('weekly_off','0'),
('whatsapp_admin_number','917000796585'),
('whatsapp_number','917000796585'),
('whatsapp_provider','none'),
('working_hours','Mon – Sat : 10:00 AM – 6:00 PM'),
('youtube','');
/*!40000 ALTER TABLE `settings` ENABLE KEYS */;
DROP TABLE IF EXISTS `sliders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sliders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `badge` varchar(100) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `highlight` varchar(150) DEFAULT NULL,
  `subtitle` text DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `button_text` varchar(60) DEFAULT NULL,
  `button_link` varchar(255) DEFAULT NULL,
  `button2_text` varchar(60) DEFAULT NULL,
  `button2_link` varchar(255) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `sliders` DISABLE KEYS */;
INSERT INTO `sliders` VALUES
(1,'🚀 Trusted IT Partner since 2021','We build software that','grows your business','Websites, custom software, mobile apps and e-governance solutions – designed, developed and supported by one expert team.',NULL,'Get Free Quote','/get-quote','Our Services','/services',1,'active','2026-10-12 08:37:47'),
(2,'🏛️ E-Governance Experts','Digital solutions for','government & enterprises','Secure, scalable and easy-to-use systems trusted by government departments across Chhattisgarh.',NULL,'View Portfolio','/portfolio','Contact Us','/contact',2,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `sliders` ENABLE KEYS */;
DROP TABLE IF EXISTS `stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `stats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(100) NOT NULL,
  `value` int(11) NOT NULL DEFAULT 0,
  `suffix` varchar(10) DEFAULT NULL,
  `icon` varchar(60) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `stats` DISABLE KEYS */;
INSERT INTO `stats` VALUES
(1,'Projects Delivered',150,'+','briefcase',1,'active','2026-10-12 08:37:47'),
(2,'Happy Clients',100,'+','smile',2,'active','2026-10-12 08:37:47'),
(3,'Government Departments',15,'+','landmark',3,'active','2026-10-12 08:37:47'),
(4,'Years of Excellence',5,'+','award',4,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `stats` ENABLE KEYS */;
DROP TABLE IF EXISTS `subscribers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscribers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(150) NOT NULL,
  `status` enum('active','unsubscribed') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `subscribers` DISABLE KEYS */;
/*!40000 ALTER TABLE `subscribers` ENABLE KEYS */;
DROP TABLE IF EXISTS `task_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_comments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `comment` text NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `task_id` (`task_id`),
  CONSTRAINT `task_comments_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `task_comments` DISABLE KEYS */;
/*!40000 ALTER TABLE `task_comments` ENABLE KEYS */;
DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `project_id` int(11) DEFAULT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `assigned_by` int(11) DEFAULT NULL,
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `status` enum('todo','in_progress','review','done','blocked') DEFAULT 'todo',
  `start_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `progress` tinyint(4) DEFAULT 0,
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `tasks` DISABLE KEYS */;
/*!40000 ALTER TABLE `tasks` ENABLE KEYS */;
DROP TABLE IF EXISTS `team_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `team_members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `designation` varchar(120) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `bio` text DEFAULT NULL,
  `linkedin` varchar(255) DEFAULT NULL,
  `twitter` varchar(255) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `team_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `team_members` ENABLE KEYS */;
DROP TABLE IF EXISTS `technologies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `technologies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `category` varchar(80) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `technologies` DISABLE KEYS */;
INSERT INTO `technologies` VALUES
(1,'React','Technology',NULL,1,'active','2026-10-12 08:37:47'),
(2,'Node.js','Technology',NULL,2,'active','2026-10-12 08:37:47'),
(3,'PHP','Technology',NULL,3,'active','2026-10-12 08:37:47'),
(4,'Laravel','Technology',NULL,4,'active','2026-10-12 08:37:47'),
(5,'Flutter','Technology',NULL,5,'active','2026-10-12 08:37:47'),
(6,'React Native','Technology',NULL,6,'active','2026-10-12 08:37:47'),
(7,'MySQL','Technology',NULL,7,'active','2026-10-12 08:37:47'),
(8,'MongoDB','Technology',NULL,8,'active','2026-10-12 08:37:47'),
(9,'WordPress','Technology',NULL,9,'active','2026-10-12 08:37:47'),
(10,'AWS','Technology',NULL,10,'active','2026-10-12 08:37:47'),
(11,'Python','Technology',NULL,11,'active','2026-10-12 08:37:47'),
(12,'Figma','Technology',NULL,12,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `technologies` ENABLE KEYS */;
DROP TABLE IF EXISTS `testimonials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `testimonials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `designation` varchar(120) DEFAULT NULL,
  `company` varchar(150) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `message` text NOT NULL,
  `rating` tinyint(4) DEFAULT 5,
  `sort_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `testimonials` DISABLE KEYS */;
INSERT INTO `testimonials` VALUES
(1,'Rakesh Verma','Owner','Verma Traders',NULL,'YJTechnosoft built our billing and inventory software. It has saved us hours every day. Very professional team with excellent support.',5,1,'active','2026-10-12 08:37:47'),
(2,'Dr. Anjali Singh','Director','City Care Hospital',NULL,'Our hospital website and appointment system were delivered on time and work flawlessly. Highly recommended!',5,2,'active','2026-10-12 08:37:47'),
(3,'Amit Tiwari','Principal','Bright Future School',NULL,'The school management software and mobile app made communication with parents so easy. Great value for money.',5,3,'active','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `testimonials` ENABLE KEYS */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','hr','accounts','employee') NOT NULL DEFAULT 'employee',
  `employee_id` int(11) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `last_login` datetime DEFAULT NULL,
  `reset_token` varchar(100) DEFAULT NULL,
  `reset_expires` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'Administrator','admin@yjtechnosoft.com',NULL,'$2b$10$Gi9SXMD.I/MluUUe1FwzuuGAdOPhLIcuR/.euPIVNDpNLQq2uKqrC','admin',NULL,NULL,'active',NULL,NULL,NULL,'2026-10-12 08:37:47','2026-10-12 08:37:47');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
DROP TABLE IF EXISTS `vault_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vault_documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `category` enum('contract','agreement','proposal','purchase_order','work_order','invoice','legal','certificate','kyc','policy','credentials','other') DEFAULT 'other',
  `file` varchar(255) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `client_id` int(11) DEFAULT NULL,
  `project_id` int(11) DEFAULT NULL,
  `contract_id` int(11) DEFAULT NULL,
  `document_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `vault_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `vault_documents` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

