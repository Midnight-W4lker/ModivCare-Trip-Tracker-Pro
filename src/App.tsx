import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Dashboard from "./pages/Dashboard";
import ExtractTrips from "./pages/ExtractTrips";
import AllTrips from "./pages/AllTrips";
import ManualEntry from "./pages/ManualEntry";
import Drivers from "./pages/Drivers";
import TripCalendar from "./pages/TripCalendar";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import BillingReport from "./pages/BillingReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/extract" element={<ExtractTrips />} />
            <Route path="/trips" element={<AllTrips />} />
            <Route path="/manual-entry" element={<ManualEntry />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/calendar" element={<TripCalendar />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/billing" element={<BillingReport />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
