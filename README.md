# YJTechnosoft – Website, Admin Panel, Billing & HR Suite

A complete, fully dynamic replacement for the old PHP website of **YJTECHNOSOFT PRIVATE LIMITED**:

* **Premium public website** (React + Tailwind) – every section is managed from the admin panel.
* **Admin panel** – website CMS, clients, quotations, GST invoices, payments, client servers/domains, expenses.
* **HR suite** – employees & interns, attendance (check-in/out), leave, holidays, payroll, daily tasks, daily work reports.
* **Recruitment** – job openings on the careers page, online applications with resume upload, hiring pipeline.
* **Documents on your letterhead** – invoices, quotations, receipts, payslips, internship offer letters, offer/appointment/joining/experience/relieving letters. All PDFs use the same letterhead as your existing invoices.
* **Email, SMS & WhatsApp** – send any document or message from the panel. Every message is logged.
* **Contracts & agreements** – website, software, AMC, hosting, NDA and consultant agreements from templates. Clients can accept them online.
* **Documents vault** – private storage for agreements, work orders, proposals, KYC and certificates, linked to clients and projects.
* **One-click sharing** – invoices, bills, quotations, receipts, agreements and letters can be shared on WhatsApp or email. Each share opens a branded page with a UPI QR and online acceptance.
* **Push notifications** – browser and mobile push plus an in-app notification bell for leads, payments, acceptances, leave, tasks and renewals.

| Layer    | Tech |
|----------|------|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Framer Motion, Recharts, Quill editor |
| Backend  | Node.js 18+, Express, MySQL 5.7+/8 or MariaDB 10.4+ (`mysql2`), JWT auth |
| Documents| PDFKit with the company letterhead (`server/assets/letterhead.jpg`) and Poppins font |
| Messaging| Nodemailer (SMTP), Fast2SMS / MSG91 / Twilio / custom HTTP SMS, Meta WhatsApp Cloud API / Twilio / custom HTTP WhatsApp |

---

## 1. Quick start (local)

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure the backend
cp server/.env.example server/.env      # then edit DB_* and JWT_SECRET

# 3. Create the database, tables and default content
npm run setup            # or: npm run setup:demo  (adds 3 demo employees)

# 4. Run (two terminals)
npm run dev:server       # API on http://localhost:5000
npm run dev:client       # Website on http://localhost:5173 (proxies /api to :5000)
```

Open **http://localhost:5173** for the website and **http://localhost:5173/login** for the panel.

| Login | Email | Password |
|-------|-------|----------|
| Admin (created by setup) | `ADMIN_EMAIL` from `.env` (default `admin@yjtechnosoft.com`) | `ADMIN_PASSWORD` (default `Admin@123`) |
| Demo employees (`setup:demo` only) | rohit@ / priya@ / aman@yjtechnosoft.com | `Employee@123` |

> **Change the admin password right after the first login** (top-right menu › My profile).

`npm run setup` is safe to run again. It creates missing tables, adds new columns when you update the code (migrations), and inserts default rows. It never overwrites data you changed. **Run it after every update.**

---

## 2. Production deployment

The Express server also serves the built React app, so you deploy **one Node.js application**.

```bash
npm run install:all
npm run build                 # builds client/dist
cp server/.env.example server/.env && nano server/.env
#   NODE_ENV=production
#   APP_URL=https://yjtechnosoft.com
#   API_URL=https://yjtechnosoft.com
#   CORS_ORIGIN=https://yjtechnosoft.com
#   JWT_SECRET=<long random string>
npm run setup
npm start                     # serves website + API on PORT (default 5000)
```

### Option A – VPS (recommended)
1. Install Node 18+, MySQL/MariaDB and Nginx.
2. Run the app with PM2: `pm2 start server/src/index.js --name yjtechnosoft && pm2 save`.
3. Use Nginx as a reverse proxy to `http://127.0.0.1:5000`, and enable HTTPS with Certbot.
   Set `client_max_body_size 20M;` so uploads work.

### Option B – cPanel hosting with "Setup Node.js App"
1. Upload the repository. In **Setup Node.js App**, create an app with **Application root** = repository folder and **Startup file** = `server/src/index.js`.
2. Create the MySQL database and user in cPanel, then put the credentials in `server/.env`.
3. In the app's terminal run `npm run install:all && npm run build && npm run setup`, then restart the app.

### Database on shared / cPanel hosting (no MySQL admin needed)
Some hosting installers show *“Could not log in to MySQL as an administrator”*. This app does **not** need the MySQL admin/root login. Create the database yourself and give the app a normal user:
1. In the hosting panel, open **MySQL Databases**. Create a database (e.g. `yjtechnosoft`) and a user with a strong password. **Add the user to the database with ALL PRIVILEGES.**
2. Put the full names in `server/.env`. cPanel adds your account prefix, for example:
   ```
   DB_HOST=localhost
   DB_NAME=cpaneluser_yjtechnosoft
   DB_USER=cpaneluser_yj
   DB_PASSWORD=your-password
   ```
3. Run `npm run setup`. It uses the existing database and creates all tables.
   **Or import the ready-made file** `server/database/yjtechnosoft.sql` in phpMyAdmin (select your database › Import). It contains every table plus the default data. Admin login: `admin@yjtechnosoft.com` / `Admin@123`, so change the password after logging in.
   If the installer insists on an admin login, skip its Database step and use these steps instead.

After going live, open **Admin › Settings** and set:
* **Company › Website URL**, plus **Letterhead & Signature › Public API URL**. Both are your domain, and they are used for email links and WhatsApp document links.
* **Letterhead & Signature** – upload your signature and company stamp (transparent PNG). These are printed on every document.

---

## 3. Email, SMS & WhatsApp setup (Admin › Settings › Email / SMS / WhatsApp)

Every channel has a **Test** button. All sent, failed and skipped messages appear in **Admin › Message Logs**.

**Email (SMTP)**
* Gmail: host `smtp.gmail.com`, port `587`. Username is your Gmail address. Password is a Google **App Password** (Google Account › Security › App passwords).
* Hostinger / cPanel mail: use the SMTP host, port 465 (SSL on) or 587, and the mailbox credentials.

**SMS**
* **Fast2SMS** – API key, route `q` (quick) or `dlt` with a DLT-approved sender ID.
* **MSG91** – auth key plus Flow/Template ID.
* **Twilio** – Account SID, Auth token and sender number.
* **Custom** – any HTTP GET API, e.g. `https://sms.example.com/send?key=XXX&to={{to10}}&msg={{message}}`.

**WhatsApp**
* **Meta WhatsApp Cloud API** (official): permanent access token plus phone number ID from developers.facebook.com. PDFs are sent as WhatsApp documents through a signed link, so the server must be reachable from the internet.
* **Twilio WhatsApp** or **Custom** HTTP API, for Indian WhatsApp panel providers. Placeholders: `{{to}} {{to10}} {{message}} {{file}} {{filename}}`.
* When no WhatsApp API is configured, the panel opens a **click-to-chat** (`wa.me`) link with the message and the PDF link pre-filled.

Default messages for invoices, quotations, receipts, letters and payslips can be edited in **Settings › Message templates**.

---

## 4. Modules at a glance

### Website (Admin › Website)
Hero slider, services (with detail pages and SEO fields), portfolio, blog, testimonials, team, client logos, technologies, counters, pricing plans, FAQs, static pages (privacy, terms, refund), subscribers. Company details, about text, social links, map, SEO meta and logo are in **Settings**.

Website forms:
* **Contact / Get a Quote** saves to **Leads**, emails the admin and auto-replies to the visitor. A WhatsApp alert is optional.
* **Careers › Apply** saves to **Applications** (with resume upload) and sends an acknowledgement email.
* **Newsletter** saves to **Subscribers**.

### Billing & clients
* **Clients** – billed and outstanding amounts per client, a one-click invoice, and WhatsApp chat.
* **Quotations** – line items, GST, discount and terms. **Convert to invoice** in one click.
* **Invoices** – automatic numbering by financial year (`YJ/INV/2026-27/0001`; prefix and start number are configurable), CGST+SGST split, partial payments, overdue tracking, payment receipts, PDF on the letterhead, and send by email, WhatsApp or SMS.
* **Servers & Domains** – hosting, VPS, domain, SSL, email and AMC records per client, with expiry tracking. **Bill** creates a renewal invoice. **Renewed** extends the expiry by one billing cycle. Automatic reminders go out 30/15/7/3/1/0 days before expiry (configurable).
* **Expenses**, **Items catalogue** (quick line items with HSN/SAC and GST), and **Leads**, where one click converts a lead to a client and a quotation.

### HR & people
* **Employees & interns** – full profile, documents, bank/PAN/Aadhaar, reporting manager and shift. Creates the employee's portal login and emails the credentials.
* **Attendance** – employees check in and out from their dashboard. Late marking uses the shift start plus a grace period. A short day becomes a half day. Work from home is supported. Location and IP are captured, and check-in can optionally be restricted to office IPs. HR has a daily register for manual marking and a monthly report with CSV export.
* **Leaves** – leave types with yearly quotas, balances, and apply/approve/reject with email notification. Approved leave is written into attendance automatically. Weekly offs and holidays are skipped.
* **Payroll** – one click generates payslips from salary, attendance, unpaid leave and holidays (LOP). Bonuses and deductions can be adjusted. Mark as paid, and send the payslip PDF.
* **Tasks** – projects and a drag-and-drop kanban board, with priorities, due dates, progress and comments. Employees get an email when a task is assigned.
* **Daily reports** – employees submit their end-of-day report. Managers review it and see who hasn't submitted.
* **Announcements**, **holidays**, **departments**, **designations**.

### Recruitment & letters
* **Job openings** are published on the website. **Applications** move through a drag-and-drop pipeline (applied › shortlisted › interview › selected › offered › hired). From there you can schedule interviews, notify the candidate by email/WhatsApp/SMS, and **Hire** (which creates the employee record).
* **Letters** – choose an employee or candidate and a template. The details fill in automatically, and the form asks for any extra fields such as duration or acceptance date. You can edit the result in the rich-text editor, then **Save & send**.
  Built-in templates: Internship Offer, Offer, Appointment, Joining, Internship Completion Certificate, Experience, Relieving. Add your own in **Letter Templates** using placeholders such as `{{name}} {{designation}} {{joining_date}} {{stipend}} {{ctc}} {{duration}}`. Any new `{{placeholder}}` automatically becomes an input field.

### Sharing invoices, bills & quotations (email / WhatsApp)
Every invoice, quotation, receipt, agreement, letter and vault file has a **Share** menu:
* **WhatsApp** – opens WhatsApp with the client's number, the message and the share link.
* **Email (your mail app)** – opens Gmail/Outlook with the subject, message and link.
* **Send with PDF attached** – sends through the configured SMTP / WhatsApp API / SMS with the PDF attached, and logs it.
* **Copy share link**, **Open client view**, and native mobile share.

The share link opens a branded page (`/d/...`) for the client, with:
* a summary of the document and its line items, PDF download and print;
* for invoices, a **UPI QR code** with the balance pre-filled, a "Pay with UPI app" button and bank details;
* for quotations and agreements, an **"Accept"** form. The client types their name to accept, and the name, time and IP are recorded and printed on the agreement PDF;
* a WhatsApp, call and email contact box.

The team gets a notification when a client **opens** an invoice, quotation or agreement, and when they **accept** one.

### Contracts, agreements & documents vault
* **Agreements** – choose a client/project and a template, and the party details fill in automatically. Fill the extra fields (scope, payment terms, support period…), click **Generate**, then edit in the rich-text editor.
  * The PDF has the agreement number, a parties box, both signature blocks, page numbers and the online-acceptance stamp.
  * Mark it as sent, signed, active or terminated, upload the signed scan, and **Renew** for the next period.
  * Reminders go out 30/15/7/1 days before the end date.
* **Agreement templates** – Website Development, Software Development & Service, AMC, Hosting & Domain, NDA, and Freelancer/Consultant. Add or edit your own. Any `{{field}}` becomes an input, and fields left empty print as `__________`.
* **Documents vault** – upload any file (PDF, images, Word, Excel), categorise and tag it, link it to a client, project or agreement, and set an expiry date. Files can only be opened by logged-in staff, or through a signed share link.
* **Project page** (Projects › Open) – tasks, team, agreements, documents, quotations and invoices for the project in one place. Invoices and quotations can be linked to a project.

### Push notifications
* Click the **bell** in the admin header and choose **Enable push notifications**. This works per device and browser, including Android Chrome and installed iOS web apps.
* Users are notified of: new leads and quote requests, job applications, leave requests and decisions, task assignments and comments, payments received, clients viewing or accepting documents, expiring servers and agreements, and announcements.
* VAPID keys are generated automatically on first use. Web push needs the site on **HTTPS** (localhost works for testing).

### Roles
| Role | Access |
|------|--------|
| Admin | Everything, including website CMS, settings, users and message logs |
| HR | Employees, attendance, leaves, payroll, recruitment, letters, projects, tasks and the vault |
| Accounts | Clients, quotations, invoices, payments, servers, expenses, leads, payroll, agreements and the vault |
| Employee | Self-service portal: check-in/out, attendance calendar, leaves, tasks, daily reports, payslips, letters |

Any HR, accounts or admin user who is linked to an employee profile also gets the self-service menu.

---

## 5. Project structure

```
client/                 React app (public website + admin panel)
  src/components/site   header, footer, page sections
  src/components/ui     design system (modal, table, form fields, send dialog…)
  src/pages/site        public pages
  src/pages/admin       admin & employee portal pages
server/
  assets/               letterhead.jpg, logo, Poppins fonts used in PDFs
  database/schema.sql   all tables
  database/seed.js      setup script (schema + default content + letter templates)
  src/routes/           auth, public, billing, hr, work, recruitment, documents, settings, generic CRUD
  src/services/         pdf.js (letterhead PDFs), notify.js (email/SMS/WhatsApp), documents.js, cron.js
  uploads/              uploaded files (resumes, documents and receipts need a staff login)
```

## 6. Security notes
* Use a long random `JWT_SECRET` and HTTPS in production.
* Resumes, employee documents, expense receipts and vault files are served only to logged-in admin/HR/accounts users, or through signed share links.
* Server/hosting passwords saved under **Servers & Domains** are stored in the database as entered. Restrict who has the Accounts/Admin role, and keep database backups secure.
* Take regular backups of the MySQL database and the `server/uploads` folder.
