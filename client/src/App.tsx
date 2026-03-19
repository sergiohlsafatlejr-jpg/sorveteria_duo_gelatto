import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Customers from "./pages/Customers";
import Points from "./pages/Points";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Finance from "./pages/Finance";
import Users from "./pages/Users";
import Connector from "./pages/Connector";
import Notifications from "./pages/Notifications";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
// Finance module pages
import FinanceDashboard from "./pages/fin/FinanceDashboard";
import FinPayables from "./pages/fin/FinPayables";
import FinReceivables from "./pages/fin/FinReceivables";
import FinBankStatements from "./pages/fin/FinBankStatements";
import FinCosts from "./pages/fin/FinCosts";
import FinDRE from "./pages/fin/FinDRE";
import FinRevenueForecast from "./pages/fin/FinRevenueForecast";
import FinSettings from "./pages/fin/FinSettings";
import FinCategories from "./pages/fin/FinCategories";
import FinBanks from "./pages/fin/FinBanks";
import FinCostsRegister from "./pages/fin/FinCostsRegister";
import FinCashflow from "./pages/fin/FinCashflow";
import ProductsRegister from "./pages/ProductsRegister";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/customers" component={Customers} />
      <Route path="/points" component={Points} />
      <Route path="/products" component={Products} />
      <Route path="/sales" component={Sales} />
      <Route path="/finance" component={Finance} />
      <Route path="/reports" component={Reports} />
      <Route path="/users" component={Users} />
      <Route path="/connector" component={Connector} />
      <Route path="/notifications" component={Notifications} />
      {/* Finance module routes */}
      <Route path="/fin/dashboard" component={FinanceDashboard} />
      <Route path="/fin/payables" component={FinPayables} />
      <Route path="/fin/receivables" component={FinReceivables} />
      <Route path="/fin/bank-statements" component={FinBankStatements} />
      <Route path="/fin/costs" component={FinCosts} />
      <Route path="/fin/dre" component={FinDRE} />
      <Route path="/fin/forecast" component={FinRevenueForecast} />
      <Route path="/fin/settings" component={FinSettings} />
      <Route path="/fin/categories" component={FinCategories} />
      <Route path="/fin/banks" component={FinBanks} />
      <Route path="/fin/costs-register" component={FinCostsRegister} />
      <Route path="/fin/cashflow" component={FinCashflow} />
      <Route path="/products-register" component={ProductsRegister} />
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
