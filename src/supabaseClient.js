// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = SUPABASE_CONFIGURED ? createClient(supabaseUrl, supabaseAnonKey) : null;