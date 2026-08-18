// supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseAnonKey);
// Debug: show whether env vars are present in the bundled app
let supabaseClient = null;
if (SUPABASE_CONFIGURED) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }
}
export const supabase = supabaseClient;

// Helper to subscribe to table changes. Returns the subscription object.
export function subscribeToTable({ table = 'attendance', schema = 'public', event = '*', callback }) {
  if (!supabase) return null;
  const channel = supabase.channel(`${table}-changes`);
  channel.on('postgres_changes', { event, schema, table }, (payload) => {
    try {
      if (typeof callback === 'function') callback(payload);
    } catch (e) {
      console.error('subscription callback error', e);
    }
  });
  channel.subscribe();
  return channel;
}
