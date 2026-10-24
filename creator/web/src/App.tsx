import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/misc';
import { MarketingLayout } from '@/layouts/MarketingLayout';

const CmsPage = lazy(() => import('@/pages/marketing/CmsPage'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Signup = lazy(() => import('@/pages/auth/Signup'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'));
const AuthCallback = lazy(() => import('@/pages/auth/AuthCallback'));
const Onboarding = lazy(() => import('@/pages/auth/Onboarding'));
const CertificateVerify = lazy(() => import('@/pages/marketing/CertificateVerify'));
const CreatorApp = lazy(() => import('@/pages/app/CreatorApp'));
const LearnApp = lazy(() => import('@/pages/learn/LearnApp'));
const AdminApp = lazy(() => import('@/pages/admin/AdminApp'));
const StoreApp = lazy(() => import('@/pages/store/StoreApp'));
const CommunityApp = lazy(() => import('@/pages/community/CommunityApp'));

const Loading = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Spinner />
  </div>
);

function AppIndex() {
  const { workspaces, user } = useAuth();
  const staff = workspaces.filter((w) => w.roles.some((r) => ['OWNER', 'ADMIN', 'TEAM_MEMBER', 'INSTRUCTOR', 'MODERATOR'].includes(r)));
  if (staff[0]) return <Navigate to={`/app/${staff[0].slug}`} replace />;
  if (user && !user.emailVerified) return <Navigate to="/verify-email" replace />;
  return <Navigate to="/onboarding" replace />;
}

/**
 * Creator subdomains and verified custom domains open the creator's store.
 * The main app host gets a 404 from the lookup and shows the marketing site.
 */
function HomeOrStore() {
  const host = window.location.hostname;
  const q = useQuery({ queryKey: ['host', host], queryFn: () => api.get<{ tenantSlug: string }>(`/domains?host=${encodeURIComponent(host)}`), retry: false, staleTime: Infinity, enabled: host !== 'localhost' && host !== '127.0.0.1' });
  if (q.isFetching) return <Loading />;
  if (q.data?.tenantSlug) return <Navigate to={`/s/${q.data.tenantSlug}`} replace />;
  return <CmsPage slug="home" />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<HomeOrStore />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify/:code" element={<CertificateVerify />} />
          <Route path="/verify-email" element={<RequireAuth><VerifyEmail /></RequireAuth>} />
          <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
          <Route path="/*" element={<CmsPage />} />
        </Route>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/app" element={<RequireAuth><AppIndex /></RequireAuth>} />
        <Route path="/app/:ws/*" element={<RequireAuth><CreatorApp /></RequireAuth>} />
        <Route path="/learn/*" element={<RequireAuth><LearnApp /></RequireAuth>} />
        <Route path="/admin/*" element={<RequireAuth><AdminApp /></RequireAuth>} />
        <Route path="/community/:communityId" element={<RequireAuth><CommunityApp /></RequireAuth>} />
        <Route path="/s/:slug/*" element={<StoreApp />} />
      </Routes>
    </Suspense>
  );
}
