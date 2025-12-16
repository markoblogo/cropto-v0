import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Web3Provider } from "@/contexts/Web3Context";
import { WaitlistProvider } from "@/contexts/WaitlistContext";
import DemoBanner from "@/components/DemoBanner";
import Dashboard from "@/pages/Dashboard";
import Portfolio from "@/pages/Portfolio";
import OptionChain from "@/pages/OptionChain";
import SpotTrading from "@/pages/SpotTrading";
import MarketData from "@/pages/MarketData";
import DesignArchitecture from "@/pages/DesignArchitecture";
import PartnersContracts from "@/pages/PartnersContracts";
import OnchainTx from "@/pages/OnchainTx";
import Wallet from "@/pages/Wallet";
import Education from "@/pages/Education";
import AboutPage from "@/pages/AboutPage";
import Testing from "@/pages/Testing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Admin from "@/pages/Admin";
import AdminFeedback from "@/pages/AdminFeedback";
import AdminReconciliation from "@/pages/AdminReconciliation";
import AdminIndex from "@/pages/AdminIndex";
import RiskDashboard from "@/pages/RiskDashboard";
import AdminPartners from "@/pages/AdminPartners";
import AdminFees from "@/pages/AdminFees";
import AdminAudit from "@/pages/AdminAudit";
import IndexDetail from "@/pages/IndexDetail";
import Feedback from "@/pages/Feedback";
import ForwardMarket from "@/pages/ForwardMarket";
import OptionForwardChainPage from "@/pages/OptionForwardChainPage";
import AdminWaitlist from "@/pages/AdminWaitlist";
import NotFound from "@/pages/not-found";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfUse from "@/pages/TermsOfUse";
import RiskDisclosure from "@/pages/RiskDisclosure";
import { useEffect } from "react";

function RedirectToAbout() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/about");
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/options" component={OptionChain} />
      <Route path="/spot-trading" component={SpotTrading} />
      <Route path="/market-data" component={MarketData} />
      <Route path="/forward-market" component={ForwardMarket} />
      <Route path="/markets/chain" component={OptionForwardChainPage} />
      <Route path="/wallet" component={Wallet} />
      <Route path="/education" component={Education} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/design-architecture" component={DesignArchitecture} />
      <Route path="/partners-contracts" component={PartnersContracts} />
      <Route path="/onchain-tx" component={OnchainTx} />
      <Route path="/about" component={AboutPage} />
      <Route path="/docs" component={RedirectToAbout} />
      <Route path="/faq" component={RedirectToAbout} />
      <Route path="/testing" component={Testing} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/feedback" component={AdminFeedback} />
      <Route path="/admin/reconciliation" component={AdminReconciliation} />
      <Route path="/admin/risk" component={RiskDashboard} />
      <Route path="/admin/index" component={AdminIndex} />
      <Route path="/admin/partners" component={AdminPartners} />
      <Route path="/admin/fees" component={AdminFees} />
      <Route path="/admin/audit" component={AdminAudit} />
      <Route path="/admin/waitlist" component={AdminWaitlist} />
      <Route path="/index/:slug" component={IndexDetail} />
      <Route path="/feedback" component={Feedback} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfUse} />
      <Route path="/risk-disclosure" component={RiskDisclosure} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Web3Provider>
          <WaitlistProvider>
            <Toaster />
            <DemoBanner />
            <Router />
          </WaitlistProvider>
        </Web3Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
