require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ATTENDANCE_DIR = path.join(__dirname, "attendance_exports");

function getLatestCsvPath() {
  const files = fs
    .readdirSync(ATTENDANCE_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"));
  if (!files.length) return null;

  return files
    .map((name) => {
      const full = path.join(ATTENDANCE_DIR, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0].full;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0];
  const delim =
    (header.match(/;/g) || []).length > (header.match(/,/g) || []).length
      ? ";"
      : ",";
  const cols = header.split(delim).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const vals = line.split(delim);
    const row = {};
    cols.forEach((c, i) => (row[c] = (vals[i] || "").trim()));
    return row;
  });
}

async function syncOnce() {
  const csvPath = getLatestCsvPath();
  if (!csvPath) {
    console.log("No CSV found");
    return;
  }

  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(content);

  const payload = rows.map((r) => ({
    person_id: r["Person ID"],
    name: r["Name"],
    department: r["Department"],
    event: r["Attendance Event"],
    point: r["Attendance Point"],
    method: r["Attendance Method"],
    device_time: r["Time"] ? new Date(r["Time"]).toISOString() : null,
  }));
  // Deduplicate payload against existing attendance rows (exact match on person,event,device_time)
  try {
    const keys = payload
      .filter((p) => p.person_id && p.device_time)
      .map((p) => ({ person_id: p.person_id, device_time: p.device_time, event: p.event }));

    if (keys.length > 0) {
      // Build filter to fetch existing matching rows
      // Query by person_id and device_time ranges (grouped by day) could be expensive; use exact device_time IN filter
      const deviceTimes = [...new Set(keys.map((k) => k.device_time))];
      const { data: existing = [], error: fetchErr } = await supabase
        .from("attendance")
        .select("person_id,event,device_time")
        .in("device_time", deviceTimes);

      if (fetchErr) {
        console.error("Could not fetch existing attendance for dedupe:", fetchErr.message || fetchErr);
      } else {
        const existingSet = new Set(
          existing.map((r) => `${r.person_id}|${r.event}|${r.device_time}`)
        );
        const filtered = payload.filter((p) => {
          if (!p.person_id || !p.device_time) return true;
          return !existingSet.has(`${p.person_id}|${p.event}|${p.device_time}`);
        });

        if (!filtered.length) {
          console.log("No new rows to insert after deduplication.");
          return;
        }

        const { error } = await supabase.from("attendance").insert(filtered);
        if (error) console.error("Insert error:", error.message);
        else console.log(`Inserted ${filtered.length} rows into Supabase.`);
        return;
      }
    }

    // Fallback: insert everything if dedupe step couldn't run
    const { error } = await supabase.from("attendance").insert(payload);
    if (error) console.error("Insert error:", error.message);
    else console.log(`Inserted ${payload.length} rows into Supabase.`);
  } catch (err) {
    console.error("Sync failed:", err);
  }
}

syncOnce();
