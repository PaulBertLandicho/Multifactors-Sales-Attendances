require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ATTENDANCE_DIR = process.env.ATTENDANCE_EXPORT_DIR || path.join(__dirname, 'attendance_exports');

function getLatestCsvPath() {
  if (!fs.existsSync(ATTENDANCE_DIR)) {
    console.error('Attendance export folder does not exist:', ATTENDANCE_DIR);
    return null;
  }

  const files = fs.readdirSync(ATTENDANCE_DIR)
    .filter(f => f.toLowerCase().endsWith('.csv'));
  if (!files.length) return null;

  return files
    .map(name => {
      const full = path.join(ATTENDANCE_DIR, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0].full;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  const header = lines[0];
  const delim = (header.match(/;/g) || []).length > (header.match(/,/g) || []).length ? ';' : ',';
  const cols = header.split(delim).map(h => h.trim());

  return lines.slice(1).map(line => {
    const vals = line.split(delim);
    const row = {};
    cols.forEach((c, i) => {
      row[c] = (vals[i] || '').trim();
    });
    return row;
  });
}

async function syncOnce() {
  const csvPath = getLatestCsvPath();
  if (!csvPath) {
    console.log('No CSV found in', ATTENDANCE_DIR);
    return;
  }

  console.log('Reading', csvPath);
  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);

  if (!rows.length) {
    console.log('CSV has no data rows');
    return;
  }

  const payload = rows.map(r => ({
    person_id: r['Person ID'] || null,
    name: r['Name'] || null,
    department: r['Department'] || null,
    event: r['Attendance Event'] || null,
    point: r['Attendance Point'] || null,
    method: r['Attendance Method'] || null,
    device_time: r['Time'] ? new Date(r['Time']).toISOString() : null,
  }));

  const { error } = await supabase.from('attendance').insert(payload);
  if (error) {
    console.error('Insert error:', error.message);
  } else {
    console.log(`Inserted ${payload.length} rows into Supabase.`);
  }
}

syncOnce().then(() => process.exit(0));
