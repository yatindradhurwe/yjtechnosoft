import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import SiteLayout from './components/site/Layout';
import Home from './pages/site/Home';
import { About, Services, ServiceDetail, Portfolio, PortfolioDetail, Blog, BlogPost, Careers, CareerDetail, Contact, GetQuote, CmsPage, NotFound } from './pages/site/Pages';
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/auth/Auth';
import { PageLoader } from './components/ui';
import SharePage from './pages/site/SharePage';

// Admin panel is code-split so the public website stays fast
const AdminRoutes = lazy(() => import('./AdminRoutes'));
// Profile builder (SaaS) is code-split as well
const builder = () => import('./pages/builder/Builder');
const AppLayout = lazy(() => builder().then((m) => ({ default: m.AppLayout })));
const ProfileList = lazy(() => builder().then((m) => ({ default: m.Dashboard })));
const PublicProfile = lazy(() => builder().then((m) => ({ default: m.PublicProfile })));
const BuilderLanding = lazy(() => builder().then((m) => ({ default: m.Landing })));
const ProfileEditor = lazy(() => import('./pages/builder/Editor'));
const lazyEl = (el) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="services" element={<Services />} />
        <Route path="services/:slug" element={<ServiceDetail />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="portfolio/:slug" element={<PortfolioDetail />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="careers" element={<Careers />} />
        <Route path="careers/:slug" element={<CareerDetail />} />
        <Route path="contact" element={<Contact />} />
        <Route path="get-quote" element={<GetQuote />} />
        <Route path="page/:slug" element={<CmsPage />} />
        <Route path="profile-builder" element={lazyEl(<BuilderLanding />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="d/:type/:id/:token" element={<SharePage />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="p/:slug" element={lazyEl(<PublicProfile />)} />
      <Route path="app" element={lazyEl(<AppLayout />)}>
        <Route index element={lazyEl(<ProfileList />)} />
        <Route path="profiles/:id" element={lazyEl(<ProfileEditor />)} />
      </Route>
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route
        path="admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRoutes />
          </Suspense>
        }
      />
    </Routes>
  );
}
