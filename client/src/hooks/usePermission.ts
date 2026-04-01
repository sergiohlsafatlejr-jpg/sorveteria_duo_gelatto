/**
 * usePermission — controle de acesso por papel (RBAC)
 *
 * Papéis:
 *  admin      → acesso total
 *  manager    → gerente: sem telas financeiras sensíveis e sem administração
 *  attendant  → funcionário: apenas vendas e clientes
 *  user       → mesmo que attendant (fallback)
 */

import { useAuth } from "@/_core/hooks/useAuth";

// Hierarquia numérica para comparações simples
const HIERARCHY: Record<string, number> = {
  admin: 3,
  manager: 2,
  attendant: 1,
  user: 1,
};

// Rotas permitidas por papel (além das rotas públicas)
// "admin" tem tudo, então não precisa de lista — verificamos pelo nível
const MANAGER_ALLOWED_PATHS = new Set([
  "/",
  "/products-register",
  "/products",
  "/reports",
  "/customers",
  "/points",
  "/points-rules",
  "/whatsapp",
  "/instagram",
  "/sales",
  "/sales-import",
  "/notifications",
  "/fin/forecast",
  "/fin/goals",
  "/fin/monthly-comparison",
]);

const ATTENDANT_ALLOWED_PATHS = new Set([
  "/",
  "/customers",
  "/points",
  "/sales",
]);

// Rotas que requerem nível mínimo
export function getRequiredLevel(path: string): number {
  // Rotas de administração — apenas admin
  if (path.startsWith("/users") || path.startsWith("/connector")) return 3;

  // Rotas financeiras sensíveis — apenas admin
  const finAdminOnly = [
    "/fin/dashboard",
    "/fin/payables",
    "/fin/receivables",
    "/fin/bank-statements",
    "/fin/costs",
    "/fin/dre",
    "/fin/cashflow",
    "/fin/categories",
    "/fin/banks",
    "/fin/costs-register",
    "/fin/settings",
  ];
  if (finAdminOnly.some((p) => path.startsWith(p))) return 3;

  // Rotas financeiras de gerência
  if (path.startsWith("/fin/")) return 2;

  // Estoque — gerente ou acima
  if (
    path.startsWith("/products") ||
    path.startsWith("/reports")
  )
    return 2;

  // Pontos/regras, WhatsApp, Instagram — gerente ou acima
  if (
    path.startsWith("/points-rules") ||
    path.startsWith("/whatsapp") ||
    path.startsWith("/instagram")
  )
    return 2;

  // Importação de vendas, notificações — gerente ou acima
  if (path.startsWith("/sales-import") || path.startsWith("/notifications"))
    return 2;

  // Tudo mais (dashboard, clientes, pontos, vendas) — qualquer usuário logado
  return 1;
}

export function usePermission() {
  const { user } = useAuth();
  const role = (user?.role as string) ?? "user";
  const level = HIERARCHY[role] ?? 1;

  /**
   * Verifica se o usuário pode acessar determinada rota
   */
  function canAccess(path: string): boolean {
    if (level >= 3) return true; // admin tem tudo
    const required = getRequiredLevel(path);
    return level >= required;
  }

  /**
   * Verifica se o usuário tem pelo menos o papel informado
   */
  function hasRole(minRole: "admin" | "manager" | "attendant"): boolean {
    return level >= (HIERARCHY[minRole] ?? 1);
  }

  /**
   * Filtra uma lista de itens de menu, mantendo apenas os permitidos
   */
  function filterMenu<T extends { path?: string; items?: Array<{ path: string }> }>(
    items: T[]
  ): T[] {
    return items
      .map((item) => {
        if (item.items) {
          const filtered = item.items.filter((sub) => canAccess(sub.path));
          return { ...item, items: filtered };
        }
        return item;
      })
      .filter((item) => {
        if (item.items) return item.items.length > 0;
        if (item.path) return canAccess(item.path);
        return true;
      });
  }

  return {
    role,
    level,
    canAccess,
    hasRole,
    filterMenu,
    isAdmin: level >= 3,
    isManager: level >= 2,
    isAttendant: level >= 1,
  };
}

// Labels legíveis para cada papel
export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  attendant: "Funcionário",
  user: "Funcionário",
};

export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  manager: "bg-blue-100 text-blue-800",
  attendant: "bg-green-100 text-green-800",
  user: "bg-green-100 text-green-800",
};
