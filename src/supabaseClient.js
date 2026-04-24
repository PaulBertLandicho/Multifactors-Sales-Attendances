// supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseAnonKey);
// Debug: show whether env vars are present in the bundled app
console.log('Supabase env:', { supabaseUrl, supabaseAnonKey: Boolean(supabaseAnonKey), SUPABASE_CONFIGURED });
export const supabase = SUPABASE_CONFIGURED
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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
