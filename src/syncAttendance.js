require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ATTENDANCE_DIR = path.join(__dirname, 'attendance_exports');

function getLatestCsvPath() {
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
    cols.forEach((c, i) => (row[c] = (vals[i] || '').trim()));
    return row;
  });
}

async function syncOnce() {
  const csvPath = getLatestCsvPath();
  if (!csvPath) {
    console.log('No CSV found');
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);

  const payload = rows.map(r => ({
    person_id: r['Person ID'],
    name: r['Name'],
    department: r['Department'],
    event: r['Attendance Event'],
    point: r['Attendance Point'],
    method: r['Attendance Method'],
    device_time: r['Time'] ? new Date(r['Time']).toISOString() : null,
  }));

  const { error } = await supabase.from('attendance').insert(payload);
  if (error) console.error('Insert error:', error.message);
  else console.log(`Inserted ${payload.length} rows into Supabase.`);
}

syncOnce();