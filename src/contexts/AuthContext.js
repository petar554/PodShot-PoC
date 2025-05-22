import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { signInWithGoogle, signOut, getCurrentUser } from '../services/authService';

// create context
const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // check for session on mount
  useEffect(() => {
    const getInitialSession = async () => {
      try {
        setLoading(true);
        
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        
        if (session) {
          // get user data
          const { data: { user } } = await supabase.auth.getUser();
          setUser(user);
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // set up auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // clean up subscription
    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  // auth methods
  const handleSignInWithGoogle = async () => {
    try {
      console.log('AuthContext: Starting Google sign-in');
      const result = await signInWithGoogle();
      console.log('AuthContext: Sign-in result:', result);
      
      if (result && result.session) {
        setSession(result.session);
        setUser(result.session.user);
        return { session: result.session, user: result.session.user };
      } else {
        console.warn('AuthContext: No session in sign-in result');
        return null;
      }
    } catch (error) {
      console.error('AuthContext: Error in handleSignInWithGoogle:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setSession(null);
      setUser(null);
    } catch (error) {
      console.error('Error in handleSignOut:', error);
      throw error;
    }
  };

  // context value
  const value = {
    user,
    session,
    loading,
    signInWithGoogle: handleSignInWithGoogle,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
