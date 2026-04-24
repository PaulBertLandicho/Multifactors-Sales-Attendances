// Scheduler to run the auto morning-out runner at 11:59 AM daily.
// Usage: `npm run auto-morning-scheduler` (keep this process running on the server)

require('dotenv').config();
const cron = require('node-cron');
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// Helper: run the runner script
function runRunner() {
  console.log(new Date().toISOString(), 'Starting runAutoMorningOut runner...');
  const child = exec('node scripts/runAutoMorningOut.js', { env: process.env }, (err, stdout, stderr) => {
    if (err) {
      console.error('Runner process failed:', err);
      return;
    }
    if (stdout) console.log('Runner stdout:\n', stdout);
    if (stderr) console.error('Runner stderr:\n', stderr);
  });
}

// Supabase client for scheduler (use service role if available)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY in environment.');
  process.exit(1);
}
const clientKey = supabaseServiceRole || supabaseAnonKey;
const sb = createClient(supabaseUrl, clientKey);

let scheduledTask = null;
let currentScheduleTime = null; // 'HH:MM'

function hhmmToCron(hhmm) {
  // hhmm expected as 'HH:MM' or 'HH:MM:SS'
  const parts = hhmm.split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  return `${minute} ${hour} * * *`;
}

async function scheduleForSettings() {
  try {
    const { data: settings, error } = await sb.from('settings').select('morning_end').maybeSingle();
    let hhmm = '11:59';
    if (!error && settings && settings.morning_end) {
      // settings.morning_end may be stored as time string like '11:59:00'
      hhmm = settings.morning_end.slice(0,5);
    }
    if (currentScheduleTime === hhmm && scheduledTask) return; // no change

    const cronExpr = hhmmToCron(hhmm);
    if (scheduledTask) {
      console.log('Rescheduling auto morning-out from', currentScheduleTime, 'to', hhmm);
      scheduledTask.destroy();
    } else {
      console.log('Scheduling auto morning-out at', hhmm, '(cron:', cronExpr, ')');
    }
    scheduledTask = cron.schedule(cronExpr, () => runRunner(), {
      scheduled: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    currentScheduleTime = hhmm;
  } catch (e) {
    console.error('Failed to schedule from settings:', e.message || e);
  }
}

// Initial schedule and periodic re-check (every 60 seconds) to pick up admin changes
(async () => {
  await scheduleForSettings();
  setInterval(scheduleForSettings, 60 * 1000);
})();

// Immediate run option
if (process.argv.includes('--now') || process.argv.includes('-n')) runRunner();

// Keep process alive
process.stdin.resume();
