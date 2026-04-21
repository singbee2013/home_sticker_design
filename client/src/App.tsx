import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import Generate from "./pages/Generate";
import Templates from "./pages/Templates";
import Mockups from "./pages/Mockups";
import History from "./pages/History";
import Videos from "./pages/Videos";
import Login from "./pages/Login";
import Composite from "./pages/Composite";
import VideoGuide from "./pages/VideoGuide";
import Favorites from "./pages/Favorites";
import SettingsPage from "./pages/Settings";

function Router() {
  return (
    <Switch>
      {/* Public routes — no sidebar */}
      <Route path="/login" component={Login} />

      {/* Protected routes — with sidebar */}
      <Route>
        <DashboardLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/generate" component={Generate} />
            <Route path="/templates" component={Templates} />
            <Route path="/composite" component={Composite} />
            <Route path="/mockups" component={Mockups} />
            <Route path="/favorites" component={Favorites} />
            <Route path="/videos" component={Videos} />
            <Route path="/video-guide" component={VideoGuide} />
            <Route path="/history" component={History} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
