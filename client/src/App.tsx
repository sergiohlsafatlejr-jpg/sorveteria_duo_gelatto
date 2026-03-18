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
      <Route path="/users" component={Users} />
      <Route path="/connector" component={Connector} />
      <Route path="/notifications" component={Notifications} />
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
