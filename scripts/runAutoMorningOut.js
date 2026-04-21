// One-off runner to invoke autoGenerateMorningOut logic against your Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function toMinutes(currentTime) {
  const [hours, minutes] = currentTime.split(':').map(Number);
  return hours * 60 + minutes;
}

async function run() {
  try {
    const { data: settings, error: settingsErr } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (settingsErr) throw settingsErr;
    if (!settings) throw new Error('No settings found');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const outHHMM = settings.morning_end || '11:59';
    const [oh, om] = outHHMM.split(':').map(Number);
    const outDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), oh, om, 0, 0);
    const outIso = outDate.toISOString();

    const dayStartIso = `${year}-${month}-${day}T00:00:00.000Z`;
    const dayEndIso = `${year}-${month}-${day}T23:59:59.999Z`;

    console.log('Using morning_end:', outHHMM, 'outIso:', outIso);

    const { data: persons, error: personsErr } = await supabase.from('persons').select('id, name, department');
    if (personsErr) throw personsErr;

    const results = [];

    for (const p of persons || []) {
      try {
        const { data: att, error: attErr } = await supabase
          .from('attendance')
          .select('id,event,device_time,photo')
          .eq('person_id', p.id)
          .gte('device_time', dayStartIso)
          .lte('device_time', dayEndIso)
          .order('device_time', { ascending: true });
        if (attErr) {
          console.warn('read attendance failed for', p.id, attErr.message || attErr);
          continue;
        }

        const morningStartMin = toMinutes(settings.morning_start);
        const morningEndMin = toMinutes(settings.morning_end);
        let morningInRow = null;
        let hasMorningOut = false;
        if (Array.isArray(att)) {
          for (const r of att) {
            if (!r || !r.device_time) continue;
            const dt = new Date(r.device_time);
            const hhmm = dt.toTimeString().slice(0,5);
            const minutes = toMinutes(hhmm);
            if (r.event === 'time-in' && minutes >= morningStartMin && minutes <= morningEndMin) {
              if (!morningInRow) morningInRow = r;
            }
            if (r.event === 'time-out' && morningInRow) {
              const dtOut = new Date(r.device_time);
              if (dtOut.getTime() >= new Date(morningInRow.device_time).getTime()) {
                hasMorningOut = true;
              }
            }
          }
        }

        if (morningInRow && !hasMorningOut) {
          const DUPLICATE_WINDOW_MS = 30 * 1000;
          const dupWindowIso = new Date(outDate.getTime() - DUPLICATE_WINDOW_MS).toISOString();
          const { data: recentDup } = await supabase
            .from('attendance')
            .select('id')
            .eq('person_id', p.id)
            .eq('event', 'time-out')
            .gte('device_time', dupWindowIso)
            .order('device_time', { ascending: false })
            .limit(1);
          if (Array.isArray(recentDup) && recentDup.length > 0) {
            results.push({ person_id: p.id, inserted: false, reason: 'recent duplicate' });
            continue;
          }

          // compute status: overtime if after afternoon_end
          const currentTime = outDate.toTimeString().slice(0,5);
          const afternoonEnd = toMinutes(settings.afternoon_end);
          const status = toMinutes(currentTime) > afternoonEnd ? 'overtime' : 'on-time';

          const { error: insErr } = await supabase.from('attendance').insert({
            person_id: p.id,
            name: p.name,
            department: p.department,
            event: 'time-out',
            method: 'auto-morning-out',
            device_time: outIso,
            status,
            photo: morningInRow.photo || null,
          });
          if (insErr) {
            console.warn('insert failed for', p.id, insErr.message || insErr);
            results.push({ person_id: p.id, inserted: false, reason: insErr.message });
          } else {
            results.push({ person_id: p.id, inserted: true });
          }
        }
      } catch (e) {
        console.error('error for person', p.id, e.message || e);
      }
    }

    console.log('Auto morning-out results:', results);
    process.exit(0);
  } catch (e) {
    console.error('Runner failed', e.message || e);
    process.exit(2);
  }
}

run();
