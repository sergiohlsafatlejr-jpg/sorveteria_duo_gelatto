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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
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

const menuGroups = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { icon: Users, label: "Clientes", path: "/customers" },
      { icon: Gift, label: "Programa de Pontos", path: "/points" },
      { icon: ShoppingCart, label: "Vendas", path: "/sales" },
      { icon: Bell, label: "Notificações", path: "/notifications" },
    ],
  },
  {
    label: "Operacional",
    items: [
      { icon: Package, label: "Estoque", path: "/products" },
      { icon: Package, label: "Cadastro de Produtos", path: "/products-register" },
      { icon: BarChart3, label: "Relatórios", path: "/reports" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { icon: DollarSign, label: "Painel Financeiro", path: "/fin/dashboard" },
      { icon: Receipt, label: "Contas a Pagar", path: "/fin/payables" },
      { icon: Wallet, label: "Contas a Receber", path: "/fin/receivables" },
      { icon: Building2, label: "Extratos Bancários", path: "/fin/bank-statements" },
      { icon: PiggyBank, label: "Custos", path: "/fin/costs" },
      { icon: BookOpen, label: "DRE", path: "/fin/dre" },
      { icon: CalendarDays, label: "Previsão de Faturamento", path: "/fin/forecast" },
      { icon: Settings, label: "Config. Financeiras", path: "/fin/settings" },
      { icon: Tag, label: "Categorias", path: "/fin/categories" },
      { icon: Landmark, label: "Bancos / Caixas", path: "/fin/banks" },
      { icon: PiggyBank, label: "Cadastro de Custos", path: "/fin/costs-register" },
    ],
  },
  {
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

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
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
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2">
            {menuGroups.map((group) => (
              <SidebarGroup key={group.label}>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-widest px-3 mb-1">
                    {group.label}
                  </SidebarGroupLabel>
                )}
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                    return (
                      <SidebarMenuItem key={item.path + item.label}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-9 mx-1 rounded-lg transition-all"
                        >
                          <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70"}`} />
                          <span className={isActive ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/80"}>
                            {item.label}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

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
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
