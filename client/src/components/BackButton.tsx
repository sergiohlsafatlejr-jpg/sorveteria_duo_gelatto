import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  to?: string;
  label?: string;
  className?: string;
}

/**
 * Botão de voltar reutilizável.
 * - Se `to` for fornecido, navega para aquela rota.
 * - Caso contrário, usa window.history.back().
 */
export default function BackButton({ to, label = "Voltar", className = "" }: BackButtonProps) {
  const [, navigate] = useLocation();

  function handleBack() {
    if (to) {
      navigate(to);
    } else {
      window.history.back();
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={`gap-1.5 text-muted-foreground hover:text-foreground -ml-2 ${className}`}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Button>
  );
}
