require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 4000;
const STREAM_STALE_MS = 5000;
const MAX_RESTART_DELAY_MS = 10000;

// Dahua RTSP URL with your credentials.
// If this path is wrong for your model, the log in this terminal will show 401/404 errors.
const RTSP_URL =
  process.env.DAHUA_RTSP_URL ||
  "rtsp://admin:12a34s56d@192.168.111.222:554/cam/realmonitor?channel=1&subtype=0";

const hlsDir = path.join(__dirname, "hls");
if (!fs.existsSync(hlsDir)) {
  fs.mkdirSync(hlsDir);
}

let ffmpegCommand = null;
let restartTimer = null;
let restartCount = 0;
const streamState = {
  status: "idle",
  lastError: null,
  lastStartAt: null,
  pid: null,
};

// Supabase client (server-side, uses service role key)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "Warning: SUPABASE_URL or SUPABASE_SERVICE_KEY not set. /api/attendance endpoints will not work until you configure them."
  );
}

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

function clearHlsArtifacts() {
  for (const fileName of fs.readdirSync(hlsDir)) {
    if (fileName.endsWith(".m3u8") || fileName.endsWith(".ts")) {
      fs.rmSync(path.join(hlsDir, fileName), { force: true });
    }
  }
}

function getStreamHealth() {
  const playlistPath = path.join(hlsDir, "index.m3u8");
  const playlistExists = fs.existsSync(playlistPath);
  const segmentFiles = fs
    .readdirSync(hlsDir)
    .filter((fileName) => fileName.endsWith(".ts"));

  let newestSegmentMtimeMs = null;
  for (const fileName of segmentFiles) {
    const filePath = path.join(hlsDir, fileName);
    const stats = fs.statSync(filePath);
    if (newestSegmentMtimeMs === null || stats.mtimeMs > newestSegmentMtimeMs) {
      newestSegmentMtimeMs = stats.mtimeMs;
    }
  }

  return {
    playlistExists,
    segmentCount: segmentFiles.length,
    segmentsUpdating:
      newestSegmentMtimeMs !== null &&
      Date.now() - newestSegmentMtimeMs < STREAM_STALE_MS,
    lastSegmentAt: newestSegmentMtimeMs
      ? new Date(newestSegmentMtimeMs).toISOString()
      : null,
  };
}

function scheduleRestart(reason) {
  if (restartTimer) {
    return;
  }

  restartCount += 1;
  const delayMs = Math.min(1000 * restartCount, MAX_RESTART_DELAY_MS);
  streamState.status = "restarting";
  console.warn(`Scheduling ffmpeg restart in ${delayMs}ms after ${reason}.`);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    startFfmpeg();
  }, delayMs);
}

function startFfmpeg() {
  if (ffmpegCommand) {
    return ffmpegCommand;
  }

  clearHlsArtifacts();
  streamState.status = "starting";
  streamState.lastError = null;
  streamState.lastStartAt = new Date().toISOString();
  console.log("Starting ffmpeg from RTSP to HLS...");

  const command = ffmpeg(RTSP_URL)
    .inputOptions([
      "-rtsp_transport",
      "tcp",
      "-fflags",
      "nobuffer",
      "-analyzeduration",
      "0",
      "-probesize",
      "32",
      "-flags",
      "low_delay",
    ])
    .addOptions([
      "-an",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-g",
      "10",
      "-keyint_min",
      "10",
      "-sc_threshold",
      "0",
      "-f",
      "hls",
      // Shorter segments and smaller playlist = lower latency
      "-hls_time",
      "0.5",
      "-hls_list_size",
      "2",
      "-hls_flags",
      "delete_segments+omit_endlist+independent_segments+program_date_time",
      "-muxdelay",
      "0",
      "-muxpreload",
      "0",
    ])
    .output(path.join(hlsDir, "index.m3u8"))
    .on("start", (commandLine) => {
      ffmpegCommand = command;
      restartCount = 0;
      streamState.status = "running";
      streamState.pid = command.ffmpegProc ? command.ffmpegProc.pid : null;
      console.log("ffmpeg command:", commandLine);
    })
    .on("error", (err) => {
      ffmpegCommand = null;
      streamState.status = "error";
      streamState.lastError = err.message;
      streamState.pid = null;
      console.error("ffmpeg error:", err.message);
      console.error(
        "Check RTSP_URL, credentials, and that the device is reachable."
      );
      scheduleRestart("ffmpeg error");
    })
    .on("end", () => {
      ffmpegCommand = null;
      streamState.status = "ended";
      streamState.pid = null;
      console.log("ffmpeg process ended");
      scheduleRestart("ffmpeg end");
    })
    .run();

  ffmpegCommand = command;
  return command;
}

startFfmpeg();

// Serve HLS segments and playlist
app.use(
  "/hls",
  express.static(hlsDir, {
    setHeaders: (res, filePath) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Length, Content-Range"
      );
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );

      if (filePath.toLowerCase().endsWith(".m3u8")) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      }
    },
  })
);
app.use(
  "/models",
  express.static(path.join(__dirname, "models"), {
    setHeaders: (res, filePath) => {
      // Allow cross-origin requests for model files
      res.setHeader("Access-Control-Allow-Origin", "*");
      // Cache model files aggressively (long-lived immutable assets)
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

app.get("/health/stream", (req, res) => {
  res.json({
    ...streamState,
    ...getStreamHealth(),
  });
});

// Compatibility endpoint expected by the frontend DeviceStatus component
app.get("/api/device/status", (req, res) => {
  try {
    const health = getStreamHealth();
    res.json({
      online:
        streamState.status === "running" &&
        health.playlistExists &&
        health.segmentsUpdating,
      deviceIp: process.env.DAHUA_DEVICE_IP || null,
      statusCode: streamState.status,
      error: streamState.lastError || null,
      ...health,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read stream status." });
  }
});
// Supabase-backed attendance API
app.get("/api/persons", async (req, res) => {
  if (!supabase) {
    return res
      .status(500)
      .json({ error: "Supabase not configured on server." });
  }

  try {
    const { data, error } = await supabase
      .from("persons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(req.query.limit ? Number(req.query.limit) : 200);

    if (error) {
      console.error("Supabase persons select error:", error.message);
      return res.status(500).json({ error: "Failed to load persons." });
    }

    res.json({ persons: data || [] });
  } catch (err) {
    console.error("Unexpected /api/persons GET error:", err.message);
    res.status(500).json({ error: "Unexpected error loading persons." });
  }
});

app.post("/api/persons", async (req, res) => {
  if (!supabase) {
    return res
      .status(500)
      .json({ error: "Supabase not configured on server." });
  }

  const body = req.body || {};
  const payload = {
    id: body.id || null,
    name: body.name || null,
    department: body.department || null,
    phone_number: body.phone_number || null,
    email: body.email || null,
    address: body.address || null,
    sex: body.sex || null,
    descriptor: body.descriptor || null,
    daily_rate: body.daily_rate ?? null,
    late_penalty: body.late_penalty ?? null,
    registration_photo: body.registration_photo || null,
  };

  if (!payload.id) {
    return res.status(400).json({ error: "Person id is required." });
  }

  try {
    if (payload.email) {
      const { data: existingEmail, error: emailError } = await supabase
        .from("persons")
        .select("id")
        .eq("email", payload.email)
        .maybeSingle();

      if (emailError) {
        console.error("Supabase duplicate-email check error:", emailError.message);
      }

      if (existingEmail && existingEmail.id !== payload.id) {
        return res.status(409).json({
          error: "A person with this email already exists.",
          code: "duplicate_email",
        });
      }
    }

    if (payload.name) {
      const { data: existingName, error: nameError } = await supabase
        .from("persons")
        .select("id, name")
        .ilike("name", payload.name)
        .limit(1);

      if (nameError) {
        console.error("Supabase duplicate-name check error:", nameError.message);
      }

      const duplicateName = (existingName || []).find(
        (person) => person.id !== payload.id && person.name && person.name.toLowerCase() === payload.name.toLowerCase()
      );

      if (duplicateName) {
        return res.status(409).json({
          error: `A person named "${payload.name}" already exists.`,
          code: "duplicate_name",
        });
      }
    }

    const { data, error } = await supabase
      .from("persons")
      .upsert([payload], { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("Supabase persons upsert error:", error.message);
      return res.status(500).json({ error: "Failed to save person." });
    }

    res.status(201).json({ ok: true, person: data });
  } catch (err) {
    console.error("Unexpected /api/persons POST error:", err.message);
    res.status(500).json({ error: "Unexpected error saving person." });
  }
});

app.get("/api/attendance", async (req, res) => {
  if (!supabase) {
    return res
      .status(500)
      .json({ error: "Supabase not configured on server." });
  }

  try {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .order("device_time", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Supabase select error:", error.message);
      return res
        .status(500)
        .json({ error: "Failed to load attendance from Supabase." });
    }

    // Always return JSON, never use res.send or res.end here
    res.json({ records: data || [] });
  } catch (err) {
    console.error("Unexpected /api/attendance error:", err.message);
    res.status(500).json({ error: "Unexpected error loading attendance." });
  }
});

// Endpoint you (or the device) can POST to in order to record a scan directly into Supabase
app.post("/api/attendance", async (req, res) => {
  if (!supabase) {
    return res
      .status(500)
      .json({ error: "Supabase not configured on server." });
  }

  const { person_id, name, department, event, point, method, device_time } =
    req.body || {};

  try {
    // Ensure a person record exists for this ID (first scan creates a new person)
    if (person_id) {
      const { error: upsertError } = await supabase.from("persons").upsert(
        [
          {
            id: person_id,
            name: name || null,
            department: department || null,
          },
        ],
        { onConflict: "id" }
      );

      if (upsertError) {
        console.error("Supabase persons upsert error:", upsertError.message);
      }
    }

    const { error } = await supabase.from("attendance").insert([
      {
        person_id: person_id || null,
        name: name || null,
        department: department || null,
        event: event || null,
        point: point || null,
        method: method || null,
        device_time: device_time || null,
      },
    ]);

    if (error) {
      console.error("Supabase insert error:", error.message);
      return res
        .status(500)
        .json({ error: "Failed to insert attendance into Supabase." });
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Unexpected POST /api/attendance error:", err.message);
    res.status(500).json({ error: "Unexpected error inserting attendance." });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`HLS server running at http://localhost:${PORT}/hls/index.m3u8`);
});
