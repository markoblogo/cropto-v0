import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Web3Provider } from "@/contexts/Web3Context";
import Dashboard from "@/pages/Dashboard";
import Portfolio from "@/pages/Portfolio";
import DesignArchitecture from "@/pages/DesignArchitecture";
import PartnersContracts from "@/pages/PartnersContracts";
import OnchainTx from "@/pages/OnchainTx";
import Docs from "@/pages/Docs";
import FAQ from "@/pages/FAQ";
import Testing from "@/pages/Testing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Admin from "@/pages/Admin";
import AdminFeedback from "@/pages/AdminFeedback";
import AdminReconciliation from "@/pages/AdminReconciliation";
import AdminIndex from "@/pages/AdminIndex";
import Feedback from "@/pages/Feedback";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/design-architecture" component={DesignArchitecture} />
      <Route path="/partners-contracts" component={PartnersContracts} />
      <Route path="/onchain-tx" component={OnchainTx} />
      <Route path="/docs" component={Docs} />
      <Route path="/faq" component={FAQ} />
      <Route path="/testing" component={Testing} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/feedback" component={AdminFeedback} />
      <Route path="/admin/reconciliation" component={AdminReconciliation} />
      <Route path="/admin/index" component={AdminIndex} />
      <Route path="/feedback" component={Feedback} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Web3Provider>
          <Toaster />
          <Router />
        </Web3Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
