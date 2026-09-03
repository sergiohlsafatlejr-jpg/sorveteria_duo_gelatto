export const FINANCIAL_MODULE_KEYS = [
  "fin-dashboard",
  "fin-payables",
  "fin-receivables",
  "fin-cashflow",
  "fin-dre",
  "fin-forecast",
  "fin-goals",
  "fin-costs",
  "fin-banks",
] as const;

export function canAccessFinancialModule(role: string | null | undefined): boolean {
  return role === "admin";
}

export function isFinancialModuleKey(module: string): boolean {
  return module === "finance" || module.startsWith("fin-");
}

export function isFinancialPath(path: string): boolean {
  return path === "/finance" || path.startsWith("/finance/") || path === "/fin" || path.startsWith("/fin/");
}

export function removeFinancialPermissions<T extends {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}>(permissions: T[]): T[] {
  return permissions.map((permission) =>
    isFinancialModuleKey(permission.module)
      ? {
          ...permission,
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
        }
      : permission
  );
}
