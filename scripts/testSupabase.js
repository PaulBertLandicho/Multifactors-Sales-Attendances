// Quick tester to verify Supabase REST/JS access using values from .env
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  try {
    const { data, error, status } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    console.log('HTTP status:', status);
    if (error) {
      console.error('Supabase error:', error);
      return;
    }
    if (!data) {
      console.log('No settings row found (returned null).');
      return;
    }
    console.log('settings row:', data);
    return;
  } catch (e) {
    console.error('Exception:', e && e.message ? e.message : e);
    return;
  }
}

run();
