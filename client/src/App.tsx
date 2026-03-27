import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Landing from "./pages/landing";
import AuditForm from "./pages/audit-form";
import Results from "./pages/results";
import AdminQueue from "./pages/admin-queue";
import NotFound from "./pages/not-found";

function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/audit" component={AuditForm} />
        <Route path="/audit/:encodedUrl" component={AuditForm} />
        <Route path="/results/:id" component={Results} />
        <Route path="/admin/queue" component={AdminQueue} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
