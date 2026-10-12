import { Route, Routes } from 'react-router-dom';
import AdminLayout, { RequireRole } from './layouts/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import { CmsResource, Clients, BillingItems, Servers, Expenses, Enquiries, Departments, Designations, Holidays, LeaveTypes, Announcements, Projects, Jobs, LetterTemplates } from './pages/admin/Generic';
import { Invoices, Quotations, InvoiceForm, QuotationForm, InvoiceView, QuotationView, Payments } from './pages/admin/Billing';
import { Employees, EmployeeView, Attendance, Leaves, Payroll } from './pages/admin/Hr';
import { Applications, Letters, LetterForm } from './pages/admin/Recruitment';
import { TaskBoard, DailyReports } from './pages/admin/Work';
import { MyAttendance, MyLeaves, MyPayslips, MyLetters } from './pages/admin/My';
import { Settings, Users, Logs, Profile } from './pages/admin/System';
import { NotFound } from './pages/site/Pages';

const ACC = ['accounts'];
const HR = ['hr'];
const ADMIN = [];
const guard = (roles, el) => <RequireRole roles={roles}>{el}</RequireRole>;

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="profile" element={<Profile />} />

        {/* self service */}
        <Route path="my/attendance" element={<MyAttendance />} />
        <Route path="my/leaves" element={<MyLeaves />} />
        <Route path="my/tasks" element={<TaskBoard mine />} />
        <Route path="my/reports" element={<DailyReports mine />} />
        <Route path="my/payslips" element={<MyPayslips />} />
        <Route path="my/letters" element={<MyLetters />} />

        {/* billing */}
        <Route path="clients" element={guard(ACC, <Clients />)} />
        <Route path="quotations" element={guard(ACC, <Quotations />)} />
        <Route path="quotations/new" element={guard(ACC, <QuotationForm />)} />
        <Route path="quotations/:id" element={guard(ACC, <QuotationView />)} />
        <Route path="quotations/:id/edit" element={guard(ACC, <QuotationForm />)} />
        <Route path="invoices" element={guard(ACC, <Invoices />)} />
        <Route path="invoices/new" element={guard(ACC, <InvoiceForm />)} />
        <Route path="invoices/:id" element={guard(ACC, <InvoiceView />)} />
        <Route path="invoices/:id/edit" element={guard(ACC, <InvoiceForm />)} />
        <Route path="payments" element={guard(ACC, <Payments />)} />
        <Route path="servers" element={guard(ACC, <Servers />)} />
        <Route path="billing-items" element={guard(ACC, <BillingItems />)} />
        <Route path="expenses" element={guard(ACC, <Expenses />)} />
        <Route path="enquiries" element={guard(ACC, <Enquiries />)} />

        {/* HR */}
        <Route path="employees" element={guard(HR, <Employees />)} />
        <Route path="employees/:id" element={guard(HR, <EmployeeView />)} />
        <Route path="attendance" element={guard(HR, <Attendance />)} />
        <Route path="leaves" element={guard(HR, <Leaves />)} />
        <Route path="payroll" element={guard([...HR, ...ACC], <Payroll />)} />
        <Route path="holidays" element={guard(HR, <Holidays />)} />
        <Route path="departments" element={guard(HR, <Departments />)} />
        <Route path="designations" element={guard(HR, <Designations />)} />
        <Route path="leave-types" element={guard(HR, <LeaveTypes />)} />
        <Route path="announcements" element={guard(HR, <Announcements />)} />
        <Route path="jobs" element={guard(HR, <Jobs />)} />
        <Route path="applications" element={guard(HR, <Applications />)} />
        <Route path="letters" element={guard(HR, <Letters />)} />
        <Route path="letters/new" element={guard(HR, <LetterForm />)} />
        <Route path="letters/:id/edit" element={guard(HR, <LetterForm />)} />
        <Route path="letter-templates" element={guard(HR, <LetterTemplates />)} />
        <Route path="projects" element={guard(HR, <Projects />)} />
        <Route path="tasks" element={guard(HR, <TaskBoard />)} />
        <Route path="reports" element={guard(HR, <DailyReports />)} />

        {/* admin only */}
        <Route path="cms/:resource" element={guard(ADMIN, <CmsResource />)} />
        <Route path="settings" element={guard(ADMIN, <Settings />)} />
        <Route path="users" element={guard(ADMIN, <Users />)} />
        <Route path="logs" element={guard(ADMIN, <Logs />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
