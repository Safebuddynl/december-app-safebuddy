import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route as RouterRoute, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { warnAboutMissingEnv } from "@/lib/env";
import Auth from "./pages/Auth";
import Community from "./pages/Community";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Route from "./pages/Route";
import TripView from "./pages/TripView";

warnAboutMissingEnv();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A failed load of ~15.000 rows is worth one retry, not three.
      retry: 1,
    },
  },
});

/**
 * Application shell: global providers and the route table.
 *
 * Toasts come from `sonner` only. An earlier version also mounted the Radix
 * toaster, which nothing ever triggered.
 */
const App = () => (
  <ThemeProvider>
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <Routes>
              <RouterRoute path="/" element={<Route />} />
              <RouterRoute path="/auth" element={<Auth />} />
              <RouterRoute path="/community" element={<Community />} />
              <RouterRoute path="/profile" element={<Profile />} />
              {/* Openbaar: wie de deellink heeft is niet ingelogd. */}
              <RouterRoute path="/trip/:token" element={<TripView />} />
              {/* Keep the catch-all last. */}
              <RouterRoute path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  </ThemeProvider>
);

export default App;
