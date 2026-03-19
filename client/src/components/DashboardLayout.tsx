import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Database,
  DollarSign,
  Gift,
  IceCream,
  Landmark,
  LayoutDashboard,
  LogOut,
  Package,
  PiggyBank,
  Receipt,
  Settings,
  ShoppingCart,
  Tag,
  TrendingUp,
  Users,
  UserCog,
  Wallet,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

// ─── Menu structure ──────────────────────────────────────────────────────────
type MenuItem = { icon: React.ElementType; label: string; path: string; badgeKey?: string };
type MenuGroup = { icon: React.ElementType; label: string; badgeKey?: string; items: MenuItem[] };
type TopItem = { icon: React.ElementType; label: string; path: string };

const topItems: TopItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
];

const menuGroups: MenuGroup[] = [
  {
    icon: Package,
    label: "Estoque",
    badgeKey: "lowStock",
    items: [
      { icon: Package, label: "Cadastro de Produtos", path: "/products-register" },
      { icon: Package, label: "Estoque", path: "/products", badgeKey: "lowStock" },
      { icon: BarChart3, label: "Relatórios de Estoque", path: "/reports" },
    ],
  },
  {
    icon: Gift,
    label: "Pontos",
    items: [
      { icon: Users, label: "Cadastro de Clientes", path: "/customers" },
      { icon: Gift, label: "Programa de Pontos", path: "/points" },
      { icon: Settings, label: "Regras de Pontos", path: "/points-rules" },
    ],
  },
  {
    icon: ShoppingCart,
    label: "Vendas",
    items: [
      { icon: ShoppingCart, label: "Vendas", path: "/sales" },
      { icon: Bell, label: "Notificações", path: "/notifications" },
    ],
  },
  {
    icon: DollarSign,
    label: "Financeiro",
    badgeKey: "totalFinancial",
    items: [
      { icon: DollarSign, label: "Painel Financeiro", path: "/fin/dashboard" },
      { icon: Receipt, label: "Contas a Pagar", path: "/fin/payables", badgeKey: "overduePayables" },
      { icon: Wallet, label: "Contas a Receber", path: "/fin/receivables", badgeKey: "overdueReceivables" },
      { icon: Building2, label: "Extratos Bancários", path: "/fin/bank-statements" },
      { icon: PiggyBank, label: "Custos", path: "/fin/costs" },
      { icon: BookOpen, label: "DRE", path: "/fin/dre" },
      { icon: CalendarDays, label: "Previsão de Faturamento", path: "/fin/forecast" },
      { icon: Tag, label: "Categorias", path: "/fin/categories" },
      { icon: Landmark, label: "Bancos / Caixas", path: "/fin/banks" },
      { icon: PiggyBank, label: "Cadastro de Custos", path: "/fin/costs-register" },
      { icon: Activity, label: "Fluxo de Caixa", path: "/fin/cashflow" },
      { icon: Settings, label: "Config. Financeiras", path: "/fin/settings" },
    ],
  },
  {
    icon: UserCog,
    label: "Administração",
    items: [
      { icon: UserCog, label: "Usuários", path: "/users" },
      { icon: Database, label: "Conector Externo", path: "/connector" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/5 to-accent/10">
        <div className="flex flex-col items-center gap-8 p-10 max-w-md w-full bg-card rounded-2xl shadow-xl border">
          <div className="flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <IceCream className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-center">Duo Gelatto</h1>
            <p className="text-sm text-muted-foreground text-center">
              Sistema de Gestão — faça login para continuar
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full"
          >
            Entrar no Sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

// ─── Alert badge component ────────────────────────────────────────────────────
function AlertBadge({ count, variant = "destructive" }: { count: number; variant?: "destructive" | "warning" }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none min-w-[18px] h-[18px] px-1 shrink-0 ${
        variant === "warning"
          ? "bg-orange-500 text-white"
          : "bg-destructive text-destructive-foreground"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Fetch alert counts with polling every 60 seconds
  const { data: alertCounts } = trpc.alerts.counts.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Map badge keys to counts
  const badgeValues: Record<string, number> = {
    lowStock: alertCounts?.lowStock ?? 0,
    overduePayables: alertCounts?.overduePayables ?? 0,
    overdueReceivables: alertCounts?.overdueReceivables ?? 0,
    totalFinancial: alertCounts?.totalFinancial ?? 0,
  };

  // Track which groups are open — default open the group containing the current route
  const getDefaultOpenGroups = () => {
    const open: Record<string, boolean> = {};
    menuGroups.forEach((g) => {
      if (g.items.some((item) => location === item.path || (item.path !== "/" && location.startsWith(item.path)))) {
        open[g.label] = true;
      }
    });
    return open;
  };
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(getDefaultOpenGroups);

  const roleLabel: Record<string, string> = {
    admin: "Administrador",
    manager: "Gerente",
    attendant: "Atendente",
    user: "Usuário",
  };

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
          {/* Header */}
          <SidebarHeader className="h-16 border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-3 h-full">
              <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <IceCream className="h-5 w-5 text-primary" />
              </div>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="font-bold text-sidebar-foreground text-sm leading-tight">Duo Gelatto</p>
                  <p className="text-xs text-sidebar-foreground/60 leading-tight">Sistema de Gestão</p>
                </div>
              )}
              {/* Total alert indicator when collapsed */}
              {isCollapsed && (alertCounts?.total ?? 0) > 0 && (
                <AlertBadge count={alertCounts?.total ?? 0} />
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2 overflow-y-auto">
            <SidebarMenu>
              {/* Top-level single items (Dashboard) */}
              {topItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-9 mx-1 rounded-lg transition-all"
                    >
                      <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70"}`} />
                      <span className={isActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}>
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Collapsible groups */}
              {menuGroups.map((group) => {
                const isGroupActive = group.items.some(
                  (item) => location === item.path || (item.path !== "/" && location.startsWith(item.path))
                );
                const isOpen = openGroups[group.label] ?? false;
                const groupBadgeCount = group.badgeKey ? (badgeValues[group.badgeKey] ?? 0) : 0;
                const isFinancialGroup = group.badgeKey === "totalFinancial";

                return (
                  <Collapsible
                    key={group.label}
                    open={isOpen}
                    onOpenChange={() => toggleGroup(group.label)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip={group.label}
                          isActive={isGroupActive && !isOpen}
                          className="h-9 mx-1 rounded-lg transition-all"
                        >
                          <group.icon className={`h-4 w-4 shrink-0 ${isGroupActive ? "text-sidebar-primary" : "text-sidebar-foreground/70"}`} />
                          <span className={`flex-1 ${isGroupActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}`}>
                            {group.label}
                          </span>
                          {/* Badge on group header */}
                          {groupBadgeCount > 0 && (
                            <AlertBadge
                              count={groupBadgeCount}
                              variant={isFinancialGroup ? "destructive" : "warning"}
                            />
                          )}
                          <ChevronRight
                            className={`h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <SidebarMenuSub className="ml-1 border-l border-sidebar-border/50 pl-2 mt-0.5 mb-0.5">
                          {group.items.map((item) => {
                            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                            const itemBadgeCount = item.badgeKey ? (badgeValues[item.badgeKey] ?? 0) : 0;
                            const isItemFinancial = item.badgeKey === "overduePayables" || item.badgeKey === "overdueReceivables";
                            return (
                              <SidebarMenuSubItem key={item.path + item.label}>
                                <SidebarMenuSubButton
                                  isActive={isActive}
                                  onClick={() => setLocation(item.path)}
                                  className="h-8 rounded-md transition-all cursor-pointer"
                                >
                                  <item.icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60"}`} />
                                  <span className={`text-xs flex-1 ${isActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/75"}`}>
                                    {item.label}
                                  </span>
                                  {/* Badge on sub-item */}
                                  {itemBadgeCount > 0 && (
                                    <AlertBadge
                                      count={itemBadgeCount}
                                      variant={isItemFinancial ? "destructive" : "warning"}
                                    />
                                  )}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                        {user?.name ?? "Usuário"}
                      </p>
                      <Badge variant="secondary" className="text-[10px] mt-0.5 h-4 px-1.5">
                        {roleLabel[user?.role ?? "user"] ?? "Usuário"}
                      </Badge>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/users")} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors"
            onMouseDown={() => setIsResizing(true)}
            style={{ zIndex: 50 }}
          />
        )}
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center gap-3 bg-background px-4 sticky top-0 z-40">
            <SidebarTrigger className="h-9 w-9 rounded-lg" />
            <div className="flex items-center gap-2">
              <IceCream className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Duo Gelatto</span>
            </div>
            {/* Mobile total alert badge */}
            {(alertCounts?.total ?? 0) > 0 && (
              <AlertBadge count={alertCounts?.total ?? 0} />
            )}
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
