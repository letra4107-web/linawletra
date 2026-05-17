import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { getUserByIdOrEmail } from '../services/supabaseService';
import { logoutUser } from '../services/supabaseAuth';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isCustomTokenAuthRef = React.useRef(false);

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
          isCustomTokenAuthRef.current = true;
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const supabaseUser = session.user;
          console.log('[AuthContext] ✓ Found Supabase session for:', supabaseUser.email);

          const userData = await getUserByIdOrEmail(supabaseUser.id, supabaseUser.email);
          if (!userData) {
            console.warn('[AuthContext] User exists in Auth but not in database');
            setUser(null);
            return;
          }

          const normalizedRole = String(userData?.role || '').toLowerCase() || 'parent';
          const isEmailVerified = Boolean(supabaseUser.email_confirmed_at);

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
          localStorage.setItem('user', JSON.stringify(userObject));
          localStorage.setItem('authToken', session.access_token);
        } else {
          console.log('[AuthContext] No active Supabase session found');
          setUser(null);
          isCustomTokenAuthRef.current = false;
        }
      } catch (error) {
        console.error('[AuthContext] Error during initialization:', error);
        setUser(null);
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
            const userData = await getUserByIdOrEmail(supabaseUser.id, supabaseUser.email);

            if (!userData) {
              console.warn('[AuthContext] User in Auth but not in database');
              setUser(null);
              return;
            }

            const normalizedRole = String(userData?.role || '').toLowerCase() || 'parent';
            const isEmailVerified = Boolean(supabaseUser.email_confirmed_at);

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
            localStorage.setItem('user', JSON.stringify(userObject));
            localStorage.setItem('authToken', session.access_token);
          } else {
            console.log('[AuthContext] Supabase session ended');
            setUser(null);
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

  const logout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      isCustomTokenAuthRef.current = false;
      localStorage.removeItem('user');
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      localStorage.removeItem('verificationOtpSent');
      localStorage.removeItem('verificationResendAvailableAt');
      return true;
    }
  };

  const login = (userData, token) => {
    console.log('[AuthContext] Login called with user:', userData?.email);
    const normalizedRole = String(userData?.role || 'parent').toLowerCase();
    const userObject = {
      ...userData,
      role: normalizedRole,
      emailVerified: Boolean(userData?.emailVerified),
    };

    setUser(userObject);
    localStorage.setItem('user', JSON.stringify(userObject));
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('authToken', token);
      isCustomTokenAuthRef.current = true;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
