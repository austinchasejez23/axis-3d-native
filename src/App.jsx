import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageTransition from '@/components/PageTransition';
import RouteTransition from '@/components/RouteTransition';
import { ProAccessProvider } from '@/lib/ProAccessContext';
import ScrollToTop from '@/components/ScrollToTop';
import Modeler from '@/pages/Modeler';
import Splash from '@/pages/Splash';
import SplashExperiment from '@/pages/SplashExperiment';
import Library from '@/pages/Library';
import AccountDeletion from '@/pages/AccountDeletion';
import About from '@/pages/About';
import Contact from '@/pages/Contact';
import PageNotFound from '@/lib/PageNotFound';
import ProjectLockGate from '@/components/library/ProjectLockGate';
import CloudBackups from '@/pages/Cloud';
import PasswordRecovery from '@/pages/PasswordRecovery';

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence initial={false} mode="sync">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Splash />} />
        <Route path="/splash-experiment" element={<SplashExperiment />} />
        <Route path="/library" element={<RouteTransition><Library /></RouteTransition>} />
        <Route path="/modeler" element={<ProjectLockGate><PageTransition><Modeler /></PageTransition></ProjectLockGate>} />
        <Route path="/cloud" element={<CloudBackups />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/account-deletion" element={<AccountDeletion />} />
        {/* Legacy entry points never contact the retired authentication server. */}
        <Route path="/login" element={<Navigate to="/library" replace />} />
        <Route path="/register" element={<Navigate to="/library" replace />} />
        <Route path="/forgot-password" element={<PasswordRecovery />} />
        <Route path="/reset-password" element={<PasswordRecovery />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ProAccessProvider>
          <ScrollToTop />
          <AppRoutes />
        </ProAccessProvider>
      </Router>
      <Toaster />
      <SonnerToaster position="top-center" toastOptions={{ style: { background: '#333', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
    </QueryClientProvider>
  );
}
