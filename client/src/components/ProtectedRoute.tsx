/**
 * ProtectedRoute — redireciona para /unauthorized se o usuário não tem permissão
 * para a rota atual.
 */
import { useLocation } from "wouter";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Caminho da rota que está sendo protegida */
  path: string;
}

export function ProtectedRoute({ children, path }: ProtectedRouteProps) {
  const { loading } = useAuth();
  const { canAccess } = usePermission();
  const [, setLocation] = useLocation();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!canAccess(path)) {
    // Redireciona imediatamente para a página de acesso negado
    setLocation("/unauthorized");
    return null;
  }

  return <>{children}</>;
}
