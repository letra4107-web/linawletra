import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { getUserByIdOrEmail } from '../services/supabaseService';
import { logoutUser } from '../services/supabaseAuth';

export const AuthContext = createContext();

const isSystemGeneratedStudentEmail = (email = '') => {
  const normalizedEmail = String(email).toLowerCase();
  return normalizedEmail.endsWith('@linawletra.edu.ph') ||
    normalizedEmail.endsWith('@linaw.local') ||
    normalizedEmail.endsWith('@student.linawletra.ph');
};

const isStudentVerified = (role, email, userData, supabaseUser) =>
  role === 'student' ||
  isSystemGeneratedStudentEmail(email) ||
  Boolean(userData?.email_verified || userData?.emailVerified || supabaseUser?.email_confirmed_at);

const AUTH_INIT_TIMEOUT_MS = 8000;

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

const LOGOUT_TIMEOUT_MS = 4000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Holds the in-flight logout promise so repeated clicks (or several
  // sidebar/settings-page logout buttons firing in the same tick) all await
  // the same signOut() call instead of each starting a new one -- that's
  // what previously made "click Logout" feel like it needed several tries.
  const logoutPromiseRef = React.useRef(null);
  const isCustomTokenAuthRef = React.useRef(false);
  // Tracks the id of the user profile currently loaded, so a Supabase auth
  // event that fires for the *same* user (e.g. the SIGNED_IN event that
  // setSession() triggers right after a backend login, or the INITIAL_SESSION
  // event Supabase fires on every subscribe) doesn't redundantly re-fetch the
  // profile and potentially race/overwrite the already-correct user state.
  const loadedUserIdRef = React.useRef(null);

  useEffect(() => {
    let unsub = null;

    const initializeAuth = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        const customToken = localStorage.getItem('token');

        if (storedUser && customToken) {
          const userObject = JSON.parse(storedUser);
          console.log('[AuthContext] ✓ Restored custom token auth:', userObject.email);
          setUser(userObject);
          loadedUserIdRef.current = userObject?.id || null;
          isCustomTokenAuthRef.current = true;
          return;
        }

        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_INIT_TIMEOUT_MS,
          'supabase.auth.getSession()'
        );

        if (session?.user) {
          const supabaseUser = session.user;
          console.log('[AuthContext] ✓ Found Supabase session for:', supabaseUser.email);

          const userData = await withTimeout(
            getUserByIdOrEmail(supabaseUser.id, supabaseUser.email),
            AUTH_INIT_TIMEOUT_MS,
            'profile lookup'
          );
          if (!userData) {
            console.warn('[AuthContext] User exists in Auth but not in database');
            setUser(null);
            loadedUserIdRef.current = null;
            return;
          }

          const normalizedRole = String(userData?.role || '').toLowerCase() || 'parent';
          const isEmailVerified = isStudentVerified(normalizedRole, supabaseUser.email, userData, supabaseUser);

          const userObject = {
            id: supabaseUser.id,
            uid: supabaseUser.id,
            email: supabaseUser.email,
            displayName: userData?.display_name || supabaseUser.user_metadata?.displayName,
            ...userData,
            role: normalizedRole,
            emailVerified: isEmailVerified,
          };

          setUser(userObject);
          loadedUserIdRef.current = userObject.id;
          localStorage.setItem('user', JSON.stringify(userObject));
          localStorage.setItem('authToken', session.access_token);
        } else {
          console.log('[AuthContext] No active Supabase session found');
          setUser(null);
          loadedUserIdRef.current = null;
          isCustomTokenAuthRef.current = false;
        }
      } catch (error) {
        console.error('[AuthContext] Error during initialization:', error);
        setUser(null);
        loadedUserIdRef.current = null;
        isCustomTokenAuthRef.current = false;
      } finally {
        setLoading(false);
      }
    };

    const listenForAuthChanges = () => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[AuthContext] Supabase auth event:', event);

        if (isCustomTokenAuthRef.current) {
          console.log('[AuthContext] Ignoring Supabase event during custom token auth');
          return;
        }

        try {
          if (session?.user) {
            const supabaseUser = session.user;

            // The profile for this exact user is already loaded (e.g. this
            // SIGNED_IN event is just setSession() confirming a login that
            // AuthContext.login() already applied, or this is the
            // INITIAL_SESSION event Supabase fires immediately on
            // subscribe, duplicating initializeAuth()'s own fetch above).
            // Re-fetching here would be redundant and could race the
            // already-correct state with a slower/failing lookup.
            if (loadedUserIdRef.current === supabaseUser.id) {
              console.log('[AuthContext] Profile already loaded for this user, skipping redundant fetch');
              return;
            }

            const userData = await withTimeout(
              getUserByIdOrEmail(supabaseUser.id, supabaseUser.email),
              AUTH_INIT_TIMEOUT_MS,
              'profile lookup'
            );

            if (!userData) {
              console.warn('[AuthContext] User in Auth but not in database');
              setUser(null);
              loadedUserIdRef.current = null;
              return;
            }

            const normalizedRole = String(userData?.role || '').toLowerCase() || 'parent';
            const isEmailVerified = isStudentVerified(normalizedRole, supabaseUser.email, userData, supabaseUser);

            const userObject = {
              id: supabaseUser.id,
              uid: supabaseUser.id,
              email: supabaseUser.email,
              displayName: userData?.display_name || supabaseUser.user_metadata?.displayName,
              ...userData,
              role: normalizedRole,
              emailVerified: isEmailVerified,
            };

            setUser(userObject);
            loadedUserIdRef.current = userObject.id;
            localStorage.setItem('user', JSON.stringify(userObject));
            localStorage.setItem('authToken', session.access_token);
          } else {
            console.log('[AuthContext] Supabase session ended');
            setUser(null);
            loadedUserIdRef.current = null;
            isCustomTokenAuthRef.current = false;
            localStorage.removeItem('user');
            localStorage.removeItem('authToken');
          }
        } catch (error) {
          console.error('[AuthContext] Error in Supabase listener:', error);
          if (error.message?.includes('disabled') ||
              error.message?.includes('not found') ||
              error.message?.includes('expired')) {
            setUser(null);
            localStorage.removeItem('user');
            localStorage.removeItem('authToken');
          }
        }
      });

      return () => {
        if (subscription?.unsubscribe) {
          subscription.unsubscribe();
        }
      };
    };

    initializeAuth().then(() => {
      unsub = listenForAuthChanges();
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const clearLocalAuthState = () => {
    setUser(null);
    loadedUserIdRef.current = null;
    isCustomTokenAuthRef.current = false;
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('verificationOtpSent');
    localStorage.removeItem('verificationResendAvailableAt');
  };

  const logout = () => {
    // Already logging out: return the same in-flight promise instead of
    // starting a second signOut() call (handles rapid double-clicks and
    // several logout buttons on the same page firing together).
    if (logoutPromiseRef.current) {
      return logoutPromiseRef.current;
    }

    setIsLoggingOut(true);
    const promise = (async () => {
      try {
        // A hung signOut() (e.g. a stuck Supabase auth lock across tabs)
        // must not leave the user stuck on a protected page forever -- fall
        // through to clearing local state either way after a short timeout.
        await withTimeout(logoutUser(), LOGOUT_TIMEOUT_MS, 'supabase.auth.signOut()');
      } catch (error) {
        console.error('Logout error:', error);
      } finally {
        clearLocalAuthState();
        setIsLoggingOut(false);
        logoutPromiseRef.current = null;
      }
      return true;
    })();

    logoutPromiseRef.current = promise;
    return promise;
  };

  const login = (userData, token) => {
    console.log('[AuthContext] Login called with user:', userData?.email);
    const normalizedRole = String(userData?.role || 'parent').toLowerCase();
    const isEmailVerified = isStudentVerified(normalizedRole, userData?.email, userData);
    const userObject = {
      ...userData,
      role: normalizedRole,
      emailVerified: isEmailVerified,
    };

    setUser(userObject);
    // Record this as the authoritative, already-loaded profile so the
    // Supabase SIGNED_IN event that setSession() triggers right after this
    // (see Login.js) treats it as already-loaded and skips a redundant,
    // race-prone re-fetch instead of overwriting this known-good state.
    loadedUserIdRef.current = userObject?.id || userObject?.uid || null;
    localStorage.setItem('user', JSON.stringify(userObject));
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('authToken', token);
      isCustomTokenAuthRef.current = true;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isLoggingOut }}>
      {children}
    </AuthContext.Provider>
  );
};
