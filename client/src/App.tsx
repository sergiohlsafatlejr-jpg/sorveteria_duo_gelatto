import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Customers from "./pages/Customers";
import Points from "./pages/Points";
import PointsRules from "./pages/PointsRules";
import Products from "./pages/Products";
import NfeImport from "./pages/NfeImport";
import Sales from "./pages/Sales";
import Finance from "./pages/Finance";
import Users from "./pages/Users";
import Connector from "./pages/Connector";
import Notifications from "./pages/Notifications";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import GerencialReports from "./pages/GerencialReports";
// Finance module pages
import FinanceDashboard from "./pages/fin/FinanceDashboard";
import FinPayables from "./pages/fin/FinPayables";
import FinWeekdayReport from "./pages/fin/FinWeekdayReport";
import FinReceivables from "./pages/fin/FinReceivables";
import FinBankStatements from "./pages/fin/FinBankStatements";
import FinCosts from "./pages/fin/FinCosts";
import FinDRE from "./pages/fin/FinDRE";
import FinRevenueForecast from "./pages/fin/FinRevenueForecast";
import FinGoals from "./pages/fin/FinGoals";
import FinSettings from "./pages/fin/FinSettings";
import FinCategories from "./pages/fin/FinCategories";
import FinBanks from "./pages/fin/FinBanks";
import FinCostsRegister from "./pages/fin/FinCostsRegister";
import FinCashflow from "./pages/fin/FinCashflow";
import FinMonthlyComparison from "./pages/fin/FinMonthlyComparison";
import WhatsApp from "./pages/WhatsApp";
import InstagramPage from "./pages/Instagram";
import ProductsRegister from "./pages/ProductsRegister";
import SalesImport from "./pages/SalesImport";
import ProductMapping from "./pages/ProductMapping";
import SalesReport from "./pages/SalesReport";
import SalesAverage from "./pages/SalesAverage";
import Unauthorized from "./pages/Unauthorized";
import MetaAds from "./pages/MetaAds";
import { ProtectedRoute } from "./components/ProtectedRoute";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/customers" component={Customers} />
      <Route path="/points" component={Points} />
      <Route path="/nfe-import" component={NfeImport} />
      <Route path="/sales" component={Sales} />
      <Route path="/finance" component={Finance} />
      {/* Rotas protegidas — Estoque (gerente+) */}
      <Route path="/products-register">{() => <ProtectedRoute path="/products-register"><ProductsRegister /></ProtectedRoute>}</Route>
      <Route path="/products">{() => <ProtectedRoute path="/products"><Products /></ProtectedRoute>}</Route>
      <Route path="/reports">{() => <ProtectedRoute path="/reports"><Reports /></ProtectedRoute>}</Route>
      <Route path="/gerencial">{() => <ProtectedRoute path="/gerencial"><GerencialReports /></ProtectedRoute>}</Route>
      {/* Pontos — regras e canais (gerente+) */}
      <Route path="/points-rules">{() => <ProtectedRoute path="/points-rules"><PointsRules /></ProtectedRoute>}</Route>
      <Route path="/whatsapp">{() => <ProtectedRoute path="/whatsapp"><WhatsApp /></ProtectedRoute>}</Route>
      <Route path="/instagram">{() => <ProtectedRoute path="/instagram"><InstagramPage /></ProtectedRoute>}</Route>
      <Route path="/meta-ads">{() => <ProtectedRoute path="/meta-ads"><MetaAds /></ProtectedRoute>}</Route>
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
      <Route path="/fin/categories">{() => <ProtectedRoute path="/fin/categories"><FinCategories /></ProtectedRoute>}</Route>
      <Route path="/fin/banks">{() => <ProtectedRoute path="/fin/banks"><FinBanks /></ProtectedRoute>}</Route>
      <Route path="/fin/costs-register">{() => <ProtectedRoute path="/fin/costs-register"><FinCostsRegister /></ProtectedRoute>}</Route>
      <Route path="/fin/cashflow">{() => <ProtectedRoute path="/fin/cashflow"><FinCashflow /></ProtectedRoute>}</Route>
      <Route path="/fin/settings">{() => <ProtectedRoute path="/fin/settings"><FinSettings /></ProtectedRoute>}</Route>
      {/* Finance — gerente+ */}
      <Route path="/fin/forecast">{() => <ProtectedRoute path="/fin/forecast"><FinRevenueForecast /></ProtectedRoute>}</Route>
      <Route path="/fin/goals">{() => <ProtectedRoute path="/fin/goals"><FinGoals /></ProtectedRoute>}</Route>
      <Route path="/fin/monthly-comparison">{() => <ProtectedRoute path="/fin/monthly-comparison"><FinMonthlyComparison /></ProtectedRoute>}</Route>
      {/* Administração — admin only */}
      <Route path="/users">{() => <ProtectedRoute path="/users"><Users /></ProtectedRoute>}</Route>
      <Route path="/connector">{() => <ProtectedRoute path="/connector"><Connector /></ProtectedRoute>}</Route>
      {/* Acesso negado */}
      <Route path="/unauthorized" component={Unauthorized} />
      <Route path="/nfe-import" component={NfeImport} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
