/**
 * usePermission — controle de acesso granular por módulo (RBAC + permissões customizadas)
 *
 * Hierarquia de papéis:
 *  admin      → acesso total, ignora permissões customizadas
 *  manager    → gerente: acesso padrão + permissões customizadas do banco
 *  attendant  → funcionário: acesso restrito + permissões customizadas do banco
 *  user       → mesmo que attendant (fallback)
 *
 * Para usuários não-admin, as permissões granulares do banco têm prioridade.
 * Se não houver permissão salva para um módulo, usa as regras padrão do papel.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

// Hierarquia numérica para comparações simples
const HIERARCHY: Record<string, number> = {
  admin: 3,
  manager: 2,
  attendant: 1,
  user: 1,
};

// Mapeamento de caminhos de rota para chaves de módulo no banco
const PATH_TO_MODULE: Record<string, string> = {
  "/products-register": "products",
  "/products": "products-stock",
  "/giro-estoque": "giro-estoque",
  "/reports": "reports",
  "/customers": "customers",
  "/points": "points",
  "/points-rules": "points-rules",
  "/sales": "sales",
  "/sales-import": "sales-import",
  "/whatsapp": "whatsapp",
  "/instagram": "instagram",
  "/meta-ads": "meta-ads",
  "/ad-library": "ad-library",
  "/notifications": "notifications",
  "/users": "users",
  "/connector": "connector",
  "/fin/dashboard": "fin-dashboard",
  "/fin/payables": "fin-payables",
  "/fin/receivables": "fin-receivables",
  "/fin/cashflow": "fin-cashflow",
  "/fin/dre": "fin-dre",
  "/fin/forecast": "fin-forecast",
  "/fin/goals": "fin-goals",
  "/fin/costs": "fin-costs",
  "/fin/banks": "fin-banks",
  "/fin/bank-statements": "fin-banks",
  "/fin/categories": "fin-costs",
  "/fin/costs-register": "fin-costs",
  "/fin/settings": "fin-dashboard",
  "/fin/monthly-comparison": "fin-dre",
  "/inove/product-sales": "inove-product-sales",
  "/inove/cost-margin": "inove-cost-margin",
  "/inove/managerial": "inove-managerial",
};

// Permissões padrão por papel (fallback quando não há permissão customizada)
const DEFAULT_ROLE_MODULES: Record<string, string[]> = {
  manager: [
    "sales", "sales-import", "products", "products-stock", "giro-estoque",
    "reports", "customers", "points", "points-rules", "fin-forecast",
    "fin-goals", "notifications", "whatsapp", "instagram",
  ],
  attendant: ["sales", "customers", "points"],
  user: ["sales", "customers", "points"],
};

// Mantém compatibilidade com código legado que usa getRequiredLevel
export function getRequiredLevel(path: string): number {
  if (path.startsWith("/users") || path.startsWith("/connector")) return 3;
  const finAdminOnly = ["/fin/dashboard","/fin/payables","/fin/receivables","/fin/bank-statements","/fin/costs","/fin/dre","/fin/cashflow","/fin/categories","/fin/banks","/fin/costs-register","/fin/settings"];
  if (finAdminOnly.some((p) => path.startsWith(p))) return 3;
  if (path.startsWith("/fin/")) return 2;
  if (path.startsWith("/products") || path.startsWith("/reports")) return 2;
  if (path.startsWith("/points-rules") || path.startsWith("/whatsapp") || path.startsWith("/instagram")) return 2;
  if (path.startsWith("/sales-import") || path.startsWith("/notifications")) return 2;
  return 1;
}

export function usePermission() {
  const { user } = useAuth();
  const role = (user?.role as string) ?? "user";
  const level = HIERARCHY[role] ?? 1;

  // Busca permissões granulares do banco para usuários não-admin
  const { data: dbPermissions } = trpc.users.getPermissions.useQuery(
    { userId: user?.id ?? 0 },
    { enabled: !!user && level < 3 }
  );

  /**
   * Verifica se o usuário pode visualizar um módulo específico
   */
  function canViewModule(moduleKey: string): boolean {
    if (level >= 3) return true;
    if (dbPermissions && dbPermissions.length > 0) {
      const perm = dbPermissions.find((p) => p.module === moduleKey);
      if (perm !== undefined) return perm.canView;
      return false;
    }
    const allowed = DEFAULT_ROLE_MODULES[role] ?? [];
    return allowed.includes(moduleKey);
  }

  /**
   * Verifica se o usuário pode criar em um módulo
   */
  function canCreate(moduleKey: string): boolean {
    if (level >= 3) return true;
    if (dbPermissions && dbPermissions.length > 0) {
      const perm = dbPermissions.find((p) => p.module === moduleKey);
      return perm?.canCreate ?? false;
    }
    return level >= 2;
  }

  /**
   * Verifica se o usuário pode editar em um módulo
   */
  function canEdit(moduleKey: string): boolean {
    if (level >= 3) return true;
    if (dbPermissions && dbPermissions.length > 0) {
      const perm = dbPermissions.find((p) => p.module === moduleKey);
      return perm?.canEdit ?? false;
    }
    return level >= 2;
  }

  /**
   * Verifica se o usuário pode excluir em um módulo
   */
  function canDelete(moduleKey: string): boolean {
    if (level >= 3) return true;
    if (dbPermissions && dbPermissions.length > 0) {
      const perm = dbPermissions.find((p) => p.module === moduleKey);
      return perm?.canDelete ?? false;
    }
    return false;
  }

  /**
   * Verifica se o usuário pode acessar uma rota (baseado no módulo mapeado)
   */
  function canAccess(path: string): boolean {
    if (level >= 3) return true;
    const moduleKey = Object.entries(PATH_TO_MODULE).find(([p]) =>
      path === p || path.startsWith(p + "/")
    )?.[1];
    if (!moduleKey) return true;
    return canViewModule(moduleKey);
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
    canViewModule,
    canCreate,
    canEdit,
    canDelete,
    hasRole,
    filterMenu,
    isAdmin: level >= 3,
    isManager: level >= 2,
    isAttendant: level >= 1,
    dbPermissions,
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
