import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import 'react-native-url-polyfill/auto';

// SecureStore adapter for Supabase auth (v1.x compatible)
const ExpoSecureStoreAdapter = {
  getItem: (key) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key, value) => {
    SecureStore.setItemAsync(key, value);
  },
  removeItem: (key) => {
    SecureStore.deleteItemAsync(key);
  },
};

// Supabase configuration
const supabaseUrl = '**';
const supabaseAnonKey = '***';

// create Supabase client (v1.x configuration)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  localStorage: ExpoSecureStoreAdapter,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
});
