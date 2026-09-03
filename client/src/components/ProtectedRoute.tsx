/**
 * ProtectedRoute — redireciona para /unauthorized se o usuário não tem permissão
 * para a rota atual.
 */
import { useLocation } from "wouter";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { useEffect } from "react";
import { toast } from "sonner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Caminho da rota que está sendo protegida */
  path: string;
}

export function ProtectedRoute({ children, path }: ProtectedRouteProps) {
  const { loading } = useAuth();
  const { canAccess } = usePermission();
  const [, setLocation] = useLocation();
  const allowed = canAccess(path);

  useEffect(() => {
    if (!loading && !allowed) {
      toast.error("Acesso negado", {
        description: "Seu perfil não possui acesso a este módulo.",
      });
      setLocation("/unauthorized");
    }
  }, [allowed, loading, setLocation]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!allowed) return null;

  return <>{children}</>;
}
