import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const Customers = lazy(() => import("./pages/Customers"));
const Points = lazy(() => import("./pages/Points"));
const PointsRules = lazy(() => import("./pages/PointsRules"));
const Products = lazy(() => import("./pages/Products"));
const NfeImport = lazy(() => import("./pages/NfeImport"));
const Sales = lazy(() => import("./pages/Sales"));
const Finance = lazy(() => import("./pages/Finance"));
const Users = lazy(() => import("./pages/Users"));
const Connector = lazy(() => import("./pages/Connector"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Reports = lazy(() => import("./pages/Reports"));
const GerencialReports = lazy(() => import("./pages/GerencialReports"));
const FinanceDashboard = lazy(() => import("./pages/fin/FinanceDashboard"));
const FinPayables = lazy(() => import("./pages/fin/FinPayables"));
const FinWeekdayReport = lazy(() => import("./pages/fin/FinWeekdayReport"));
const FinReceivables = lazy(() => import("./pages/fin/FinReceivables"));
const FinBankStatements = lazy(() => import("./pages/fin/FinBankStatements"));
const FinCosts = lazy(() => import("./pages/fin/FinCosts"));
const FinDRE = lazy(() => import("./pages/fin/FinDRE"));
const FinOtimizacao = lazy(() => import("./pages/fin/FinOtimizacao"));
const FinRevenueForecast = lazy(() => import("./pages/fin/FinRevenueForecast"));
const FinProductGoals = lazy(() => import("./pages/fin/FinProductGoals"));
const FinGoals = lazy(() => import("./pages/fin/FinGoals"));
const FinSettings = lazy(() => import("./pages/fin/FinSettings"));
const FinCategories = lazy(() => import("./pages/fin/FinCategories"));
const FinBanks = lazy(() => import("./pages/fin/FinBanks"));
const FinCostsRegister = lazy(() => import("./pages/fin/FinCostsRegister"));
const FinCashflow = lazy(() => import("./pages/fin/FinCashflow"));
const FinMonthlyComparison = lazy(() => import("./pages/fin/FinMonthlyComparison"));
const FinBankReconciliation = lazy(() => import("./pages/fin/FinBankReconciliation"));
const WhatsApp = lazy(() => import("./pages/WhatsApp"));
const InstagramPage = lazy(() => import("./pages/Instagram"));
const ProductsRegister = lazy(() => import("./pages/ProductsRegister"));
const PurchaseSuggestion = lazy(() => import("./pages/PurchaseSuggestion"));
const SmartPurchasePlanner = lazy(() => import("./pages/SmartPurchasePlanner"));
const SalesImport = lazy(() => import("./pages/SalesImport"));
const ProductMapping = lazy(() => import("./pages/ProductMapping"));
const SalesReport = lazy(() => import("./pages/SalesReport"));
const SalesAverage = lazy(() => import("./pages/SalesAverage"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const MetaAds = lazy(() => import("./pages/MetaAds"));
const AdLibrary = lazy(() => import("./pages/AdLibrary"));
const GiroEstoque = lazy(() => import("./pages/GiroEstoque"));
const InoveConnector = lazy(() => import("./pages/InoveConnector"));
const CronJobs = lazy(() => import("./pages/CronJobs"));
const InoveReports = lazy(() => import("./pages/InoveReports"));
const InoveProductSales = lazy(() => import("./pages/InoveProductSales"));
const InoveCostMargin = lazy(() => import("./pages/InoveCostMargin"));
const InoveManagerial = lazy(() => import("./pages/InoveManagerial"));
const PublicLoyalty = lazy(() => import("./pages/PublicLoyalty"));
const Purchases = lazy(() => import("./pages/Purchases"));
const PurchaseInvoices = lazy(() => import("./pages/PurchaseInvoices"));
const PurchaseItems = lazy(() => import("./pages/PurchaseItems"));
const PurchaseDashboard = lazy(() => import("./pages/PurchaseDashboard"));
const ReportSales = lazy(() => import("./pages/reports/ReportSales"));
const ReportCMV = lazy(() => import("./pages/reports/ReportCMV"));
const ReportManagerial = lazy(() => import("./pages/reports/ReportManagerial"));
const BoxesControl = lazy(() => import("./pages/stock/BoxesControl"));

function Router() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando módulo...</div>}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/customers" component={Customers} />
      <Route path="/points" component={Points} />
      <Route path="/nfe-import" component={NfeImport} />
      <Route path="/sales" component={Sales} />
      <Route path="/finance">{() => <ProtectedRoute path="/finance"><Finance /></ProtectedRoute>}</Route>
      {/* Rotas protegidas — Estoque (gerente+) */}
      <Route path="/products-register">{() => <ProtectedRoute path="/products-register"><ProductsRegister /></ProtectedRoute>}</Route>
      <Route path="/products">{() => <ProtectedRoute path="/products"><Products /></ProtectedRoute>}</Route>
      <Route path="/purchase-suggestion">{() => <ProtectedRoute path="/purchase-suggestion"><PurchaseSuggestion /></ProtectedRoute>}</Route>
      <Route path="/smart-purchase-plan">{() => <ProtectedRoute path="/smart-purchase-plan"><SmartPurchasePlanner /></ProtectedRoute>}</Route>
      <Route path="/purchases">{() => <ProtectedRoute path="/purchases"><Purchases /></ProtectedRoute>}</Route>
      <Route path="/purchases/dashboard">{() => <ProtectedRoute path="/purchases/dashboard"><PurchaseDashboard /></ProtectedRoute>}</Route>
      <Route path="/purchases/invoices">{() => <ProtectedRoute path="/purchases/invoices"><PurchaseInvoices /></ProtectedRoute>}</Route>
      <Route path="/purchases/items">{() => <ProtectedRoute path="/purchases/items"><PurchaseItems /></ProtectedRoute>}</Route>
      <Route path="/reports">{() => <ProtectedRoute path="/reports"><Reports /></ProtectedRoute>}</Route>
      <Route path="/gerencial">{() => <ProtectedRoute path="/gerencial"><GerencialReports /></ProtectedRoute>}</Route>
      {/* Novos relatórios consolidados */}
      <Route path="/reports/sales">{() => <ProtectedRoute path="/reports/sales"><ReportSales /></ProtectedRoute>}</Route>
      <Route path="/reports/cmv">{() => <ProtectedRoute path="/reports/cmv"><ReportCMV /></ProtectedRoute>}</Route>
      <Route path="/reports/managerial">{() => <ProtectedRoute path="/reports/managerial"><ReportManagerial /></ProtectedRoute>}</Route>
      {/* Pontos — regras e canais (gerente+) */}
      <Route path="/points-rules">{() => <ProtectedRoute path="/points-rules"><PointsRules /></ProtectedRoute>}</Route>
      <Route path="/whatsapp">{() => <ProtectedRoute path="/whatsapp"><WhatsApp /></ProtectedRoute>}</Route>
      <Route path="/instagram">{() => <ProtectedRoute path="/instagram"><InstagramPage /></ProtectedRoute>}</Route>
      <Route path="/meta-ads">{() => <ProtectedRoute path="/meta-ads"><MetaAds /></ProtectedRoute>}</Route>
      <Route path="/ad-library">{() => <ProtectedRoute path="/ad-library"><AdLibrary /></ProtectedRoute>}</Route>
      <Route path="/giro-estoque">{() => <ProtectedRoute path="/giro-estoque"><GiroEstoque /></ProtectedRoute>}</Route>
      {/* Vendas — importação e notificações (gerente+) */}
      <Route path="/sales-import">{() => <ProtectedRoute path="/sales-import"><SalesImport /></ProtectedRoute>}</Route>
      <Route path="/sales/product-mapping">{() => <ProtectedRoute path="/sales/product-mapping"><ProductMapping /></ProtectedRoute>}</Route>
      <Route path="/sales/sales-report">{() => <ProtectedRoute path="/sales/sales-report"><SalesReport /></ProtectedRoute>}</Route>
      <Route path="/sales/average">{() => <ProtectedRoute path="/sales/average"><SalesAverage /></ProtectedRoute>}</Route>
      <Route path="/notifications">{() => <ProtectedRoute path="/notifications"><Notifications /></ProtectedRoute>}</Route>
      {/* Finance module routes — admin only (financeiro sensível) */}
      <Route path="/fin/dashboard">{() => <ProtectedRoute path="/fin/dashboard"><FinanceDashboard /></ProtectedRoute>}</Route>
      <Route path="/fin/payables">{() => <ProtectedRoute path="/fin/payables"><FinPayables /></ProtectedRoute>}</Route>
      <Route path="/fin/weekday-report">{() => <ProtectedRoute path="/fin/weekday-report"><FinWeekdayReport /></ProtectedRoute>}</Route>
      <Route path="/fin/receivables">{() => <ProtectedRoute path="/fin/receivables"><FinReceivables /></ProtectedRoute>}</Route>
      <Route path="/fin/bank-statements">{() => <ProtectedRoute path="/fin/bank-statements"><FinBankStatements /></ProtectedRoute>}</Route>
      <Route path="/fin/costs">{() => <ProtectedRoute path="/fin/costs"><FinCosts /></ProtectedRoute>}</Route>
      <Route path="/fin/dre">{() => <ProtectedRoute path="/fin/dre"><FinDRE /></ProtectedRoute>}</Route>
      <Route path="/fin/otimizacao">{() => <ProtectedRoute path="/fin/otimizacao"><FinOtimizacao /></ProtectedRoute>}</Route>
      <Route path="/fin/categories">{() => <ProtectedRoute path="/fin/categories"><FinCategories /></ProtectedRoute>}</Route>
      <Route path="/fin/banks">{() => <ProtectedRoute path="/fin/banks"><FinBanks /></ProtectedRoute>}</Route>
      <Route path="/fin/costs-register">{() => <ProtectedRoute path="/fin/costs-register"><FinCostsRegister /></ProtectedRoute>}</Route>
      <Route path="/fin/cashflow">{() => <ProtectedRoute path="/fin/cashflow"><FinCashflow /></ProtectedRoute>}</Route>
      <Route path="/fin/settings">{() => <ProtectedRoute path="/fin/settings"><FinSettings /></ProtectedRoute>}</Route>
      {/* Finance — gerente+ */}
      <Route path="/fin/forecast">{() => <ProtectedRoute path="/fin/forecast"><FinRevenueForecast /></ProtectedRoute>}</Route>
      <Route path="/fin/product-goals">{() => <ProtectedRoute path="/fin/product-goals"><FinProductGoals /></ProtectedRoute>}</Route>
      <Route path="/fin/goals">{() => <ProtectedRoute path="/fin/goals"><FinGoals /></ProtectedRoute>}</Route>
      <Route path="/fin/monthly-comparison">{() => <ProtectedRoute path="/fin/monthly-comparison"><FinMonthlyComparison /></ProtectedRoute>}</Route>
      <Route path="/fin/bank-reconciliation">{() => <ProtectedRoute path="/fin/bank-reconciliation"><FinBankReconciliation /></ProtectedRoute>}</Route>
      {/* Administração — admin only */}
      <Route path="/users">{() => <ProtectedRoute path="/users"><Users /></ProtectedRoute>}</Route>
      <Route path="/connector">{() => <ProtectedRoute path="/connector"><Connector /></ProtectedRoute>}</Route>
      <Route path="/inove-connector">{() => <ProtectedRoute path="/inove-connector"><InoveConnector /></ProtectedRoute>}</Route>
      <Route path="/inove-reports">{() => <ProtectedRoute path="/inove-reports"><InoveReports /></ProtectedRoute>}</Route>
      <Route path="/inove/product-sales">{() => <ProtectedRoute path="/inove/product-sales"><InoveProductSales /></ProtectedRoute>}</Route>
      <Route path="/inove/cost-margin">{() => <ProtectedRoute path="/inove/cost-margin"><InoveCostMargin /></ProtectedRoute>}</Route>
      <Route path="/inove/managerial">{() => <ProtectedRoute path="/inove/managerial"><InoveManagerial /></ProtectedRoute>}</Route>
      <Route path="/cron-jobs">{() => <ProtectedRoute path="/cron-jobs"><CronJobs /></ProtectedRoute>}</Route>
      {/* Página pública de fidelidade — sem login */}
      <Route path="/fidelidade/:token" component={PublicLoyalty} />
      {/* Acesso negado */}
      <Route path="/unauthorized" component={Unauthorized} />
      <Route path="/nfe-import" component={NfeImport} />
      <Route path="/stock/boxes">{() => <ProtectedRoute path="/stock/boxes"><BoxesControl /></ProtectedRoute>}</Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
