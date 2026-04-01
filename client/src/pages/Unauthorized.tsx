import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ROLE_LABELS } from "@/hooks/usePermission";

export default function Unauthorized() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="flex flex-col items-center gap-6 p-10 max-w-md w-full bg-card rounded-2xl shadow-lg border text-center">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10">
          <ShieldX className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">Acesso Restrito</h1>
          <p className="text-muted-foreground text-sm">
            Você não tem permissão para acessar esta página.
          </p>
          {user && (
            <p className="text-xs text-muted-foreground mt-2">
              Seu perfil atual é{" "}
              <span className="font-semibold text-foreground">
                {ROLE_LABELS[user.role ?? "user"] ?? "Funcionário"}
              </span>
              . Entre em contato com um administrador para solicitar acesso.
            </p>
          )}
        </div>
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => window.history.back()}
          >
            Voltar
          </Button>
          <Button
            className="flex-1"
            onClick={() => setLocation("/dashboard")}
          >
            Ir ao Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
