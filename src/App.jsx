import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageTransition from '@/components/PageTransition';
import RouteTransition from '@/components/RouteTransition';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ProAccessProvider } from '@/lib/ProAccessContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Modeler from './pages/Modeler';
import Splash from './pages/Splash';
import Library from './pages/Library';
import AccountDeletion from './pages/AccountDeletion';
import About from './pages/About';
import Contact from './pages/Contact';
import ProjectLockGate from '@/components/library/ProjectLockGate';
// Add page imports here

if (typeof document !== 'undefined' && !window.__gads_loaded) {
  window.__gads_loaded = true;
  window.dataLayer = window.dataLayer || [];
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
    if (inIframe) {
      try {
        const args = Array.prototype.slice.call(arguments);
        const cmd = args[0];
        window.parent.postMessage({
          type: 'base44_gtag_event',
          event: {
            source: 'gtag',
            timestamp: new Date().toLocaleTimeString(),
            command: cmd,
            params: args.slice(1),
            type: cmd === 'event' ? (args[1] || 'event') : cmd,
          },
        }, '*');
      } catch (_e) { /* relay must not break gtag */ }
    }
  };
  const s = document.createElement('script');
  s.src = 'https://www.googletagmanager.com/gtag/js?id=AW-18485410634';
  s.async = true;
  document.head.appendChild(s);
  window.gtag('js', new Date());
  window.gtag('config', 'AW-18485410634', { send_page_view: false });
}

const SIGN_IN_DISABLED = false;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  // On first launch, let the splash cover startup work instead of showing a
  // separate spinner before/after it. Other routes still get the normal loader.
  if ((isLoadingPublicSettings || isLoadingAuth) && location.pathname !== '/') {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors. Auth pages must render normally — redirecting
  // from them would bounce the user back and forth forever.
  const onAuthPage = ['/login', '/register', '/forgot-password', '/reset-password']
    .includes(location.pathname);

  const onPublicInfoPage = ['/about', '/contact'].includes(location.pathname);
  if (authError && !onAuthPage && !onPublicInfoPage && !SIGN_IN_DISABLED) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <Navigate to="/login" replace />;
    }
  }

  // Render the main app
  return (
    <AnimatePresence initial={false} mode="sync">
      <Routes location={location} key={location.pathname}>
        {/* Add your page Route elements here */}
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/account-deletion" element={<AccountDeletion />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        {/* Sign-in is optional for now: the modeler and library are open, and
            guests can use the app without an account. */}
        <Route path="/library" element={<RouteTransition><Library /></RouteTransition>} />
        <Route path="/modeler" element={<ProjectLockGate><PageTransition><Modeler /></PageTransition></ProjectLockGate>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AnimatePresence>
  );
};


function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ProAccessProvider>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
        </ProAccessProvider>
        <Toaster />
        <SonnerToaster position="top-center" toastOptions={{ style: { background: '#333', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App