import { supabase } from '../lib/supabase';
import { Platform } from 'react-native';
// import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// webClientId is Google OAuth client ID without any http:// prefix
// GoogleSignin.configure({
//   // Correct format for webClientId (remove http:// prefix)
//   webClientId: '644963085990-n1kg20nc39ppjl90uih5lvjvq4u6q72r.apps.googleusercontent.com',
//   offlineAccess: true,
// });

// Google Sign In
// export const signInWithGoogle = async () => {
//   try {
//     console.log('Starting Google sign in process');
    
//     // different approach based on platform
//     if (Platform.OS === 'ios' || Platform.OS === 'android') {
//       // for native platforms, use the native Google Sign In
//       try {
//         // check if play services are available (Android only)
//         if (Platform.OS === 'android') {
//           await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
//         }
        
//         // sign in with Google
//         const { idToken } = await GoogleSignin.signIn();
//         console.log('Google sign in successful, got ID token');
        
//         if (!idToken) {
//           throw new Error('No ID token returned from Google Sign In');
//         }
        
//         // sign in to Supabase with the Google ID token
//         const { data, error } = await supabase.auth.signInWithIdToken({
//           provider: 'google',
//           token: idToken,
//         });
        
//         if (error) {
//           console.error('Error signing in to Supabase with Google token:', error);
//           throw error;
//         }
        
//         console.log('Successfully signed in to Supabase with Google token:', data);
//         return data;
//       } catch (nativeError) {
//         console.error('Native Google Sign In failed, falling back to browser:', nativeError);
        
//         // if native sign-in fails, fall back to browser-based OAuth
//         return await signInWithGoogleBrowser();
//       }
//     } else {
//       // For web or other platforms, use browser-based OAuth
//       return await signInWithGoogleBrowser();
//     }
//   } catch (error) {
//     console.error('Error signing in with Google:', error);
//     throw error;
//   }
// };

// // browser-based Google Sign In (fallback method)
// const signInWithGoogleBrowser = async () => {
//   try {
//     console.log('Starting browser-based Google sign in');
    
//     // Prepare the browser for auth session
//     WebBrowser.maybeCompleteAuthSession();
    
//     // Get the redirect URL
//     const redirectUrl = AuthSession.makeRedirectUri({ 
//       scheme: 'shotcast',
//       path: 'auth/callback'
//     });
//     console.log('Redirect URL:', redirectUrl);
    
//     // Start the auth flow with Supabase
//     const { data, error } = await supabase.auth.signInWithOAuth({
//       provider: 'google',
//       options: {
//         redirectTo: redirectUrl,
//         skipBrowserRedirect: true,
//       },
//     });
    
//     if (error) {
//       console.error('Error starting OAuth flow:', error);
//       throw error;
//     }
    
//     if (!data?.url) {
//       throw new Error('No OAuth URL returned from Supabase');
//     }
    
//     console.log('Opening browser for authentication...');
    
//     // Open the URL in a browser
//     const result = await WebBrowser.openAuthSessionAsync(
//       data.url,
//       redirectUrl
//     );
    
//     console.log('Browser auth result:', result);
    
//     if (result.type === 'success') {
//       // The user was redirected back to our app
//       // Get the session to confirm the sign-in worked
//       const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
//       if (sessionError) {
//         console.error('Error getting session after OAuth:', sessionError);
//         throw sessionError;
//       }
      
//       if (!sessionData?.session) {
//         console.warn('No session after OAuth completion');
//         throw new Error('Authentication failed');
//       }
      
//       console.log('Successfully signed in with Google via browser');
//       return sessionData;
//     } else {
//       // The user cancelled or the auth failed
//       console.warn('Browser auth was not successful:', result.type);
//       throw new Error(`Authentication ${result.type}`);
//     }
//   } catch (error) {
//     console.error('Error in browser-based Google sign in:', error);
//     throw error;
//   }
// };

// // Sign out
// export const signOut = async () => {
//   try {
//     // Sign out from Google
//     try {
//       const isSignedIn = await GoogleSignin.isSignedIn();
//       if (isSignedIn) {
//         await GoogleSignin.signOut();
//         console.log('Signed out from Google');
//       }
//     } catch (googleError) {
//       console.warn('Error signing out from Google:', googleError);
//       // Continue with Supabase sign out even if Google sign out fails
//     }
    
//     // Sign out from Supabase
//     const { error } = await supabase.auth.signOut();
//     if (error) throw error;
    
//     console.log('Signed out from Supabase');
//   } catch (error) {
//     console.error('Error signing out:', error);
//     throw error;
//   }
// };

// Get current session
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

// Get current user
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

// Magic Link 
// Sign in with email magic link
export const signInWithMagicLink = async (email) => {
  try {
    console.log('Sending magic link to:', email);
    
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        // this will create a new user if they don't exist
        shouldCreateUser: true,
        emailRedirectTo: undefined, //we handle this in the app
      }
    });
    
    if (error) {
      console.error('Error sending magic link:', error);
      throw error;
    }
    
    console.log('Magic link sent successfully:', data);
    return data;
  } catch (error) {
    console.error('Error in signInWithMagicLink:', error);
    throw error;
  }
};

// sign out
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    console.log('Signed out successfully');
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};
