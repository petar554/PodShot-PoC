import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

// supabase client with service key for admin access
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// User management functions
export const getUserById = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
};

export const updateUserProfile = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

// auth verification
export const verifyToken = async (token) => {
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    return data.user;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
};
