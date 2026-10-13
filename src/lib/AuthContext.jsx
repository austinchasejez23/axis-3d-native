import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

// A rejected token is dropped in place and the app continues as a guest.
// It must NEVER reload: the preview re-supplies the same dead token on load,
// so reloading here spun the app in an endless 401 → reload loop that froze it.
const clearExpiredSession = () => {
  localStorage.removeItem('base44_access_token');
  localStorage.removeItem('token');
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !user || !user.id) return;
    const createdDate = String(user.created_date || '');
    const createdDateUtc = /(?:Z|[+-]\d{2}:?\d{2})$/.test(createdDate)
      ? createdDate
      : createdDate + 'Z';
    const createdAtMs = Date.parse(createdDateUtc);
    const isNewSignup = Number.isFinite(createdAtMs) &&
      Date.now() - createdAtMs < 24 * 60 * 60 * 1000;
    const key = '_aw_signup_fired_AW-18485410634/dLfxCJDlhIwdEMr2w-5E_' + user.id;
    if (!isNewSignup || localStorage.getItem(key)) return;
    let tries = 0;
    const fire = () => {
      if (!window.gtag) { if (tries++ < 20) setTimeout(fire, 250); return; }
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      window.gtag('event', 'conversion', {
        send_to: 'AW-18485410634/dLfxCJDlhIwdEMr2w-5E',
        transaction_id: user.id,
      });
    };
    fire();
  }, [user]);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        if ((appError.status === 401 || appError.response?.status === 401) && appParams.token) {
          clearExpiredSession();
          setIsAuthenticated(false);
          setAuthChecked(true);
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
          return;
        }
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // Expired sessions must not block this guest-enabled app. Remove the
      // rejected token and reload once so the client restarts anonymously.
      const status = error.status || error.response?.status;
      if (status === 401) {
        // Guest from here on — no reload, no loop.
        clearExpiredSession();
        return;
      }
      if (status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = async (redirectTo = true) => {
    setUser(null);
    setIsAuthenticated(false);

    // Never return to the current URL: builder/SSO URLs can contain a token and
    // immediately recreate the session. Callers may provide a clean app route.
    const destination = typeof redirectTo === 'string' ? redirectTo : redirectTo ? '/' : undefined;
    await base44.auth.logout(destination);
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};