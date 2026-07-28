import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageSpinner } from '@/components/feedback/PageSpinner';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useHousehold } from '@/features/auth/hooks/useHousehold';

/** Exige sessão + household. Sem casa → onboarding. */
export function RequireAuth() {
  const { configured, loading, user } = useAuth();
  const { household, loading: householdLoading } = useHousehold();
  const location = useLocation();

  if (!configured) {
    return <Navigate to="/setup" replace />;
  }

  if (loading) return <PageSpinner />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (householdLoading) return <PageSpinner label="Carregando casa…" />;

  if (!household) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
