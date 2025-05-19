import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';

// register the redirect URI scheme in your app.json
const redirectUri = makeRedirectUri({
  scheme: 'shotcast'
});

// initialize WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

// Google Sign In
export const signInWithGoogle = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });
    
    if (error) throw error;
    
    // open the browser for authentication
    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUri
      );
      
      if (result.type === 'success') {
        // Extract the access token from the URL
        const { url } = result;
        if (url) {
          // Exchange the code for a session
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) throw error;
          return data;
        }
      }
    }
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

// sign out
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

// get current session
export const getSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

// get current user
export const getCurrentUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};
