require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 4000;
const STREAM_STALE_MS = 5000;
const MAX_RESTART_DELAY_MS = 10000;

// Dahua RTSP URL with your credentials.
// If this path is wrong for your model, the log in this terminal will show 401/404 errors.
const RTSP_URL = process.env.DAHUA_RTSP_URL ||
  'rtsp://admin:12a34s56d@192.168.111.227:554/cam/realmonitor?channel=1&subtype=0';

const hlsDir = path.join(__dirname, 'hls');
if (!fs.existsSync(hlsDir)) {
  fs.mkdirSync(hlsDir);
}

let ffmpegCommand = null;
let restartTimer = null;
let restartCount = 0;
const streamState = {
  status: 'idle',
  lastError: null,
  lastStartAt: null,
  pid: null,
};

// Supabase client (server-side, uses service role key)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_KEY not set. /api/attendance endpoints will not work until you configure them.');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

function clearHlsArtifacts() {
  for (const fileName of fs.readdirSync(hlsDir)) {
    if (fileName.endsWith('.m3u8') || fileName.endsWith('.ts')) {
      fs.rmSync(path.join(hlsDir, fileName), { force: true });
    }
  }
}

function getStreamHealth() {
  const playlistPath = path.join(hlsDir, 'index.m3u8');
  const playlistExists = fs.existsSync(playlistPath);
  const segmentFiles = fs.readdirSync(hlsDir).filter((fileName) => fileName.endsWith('.ts'));

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
    segmentsUpdating: newestSegmentMtimeMs !== null && Date.now() - newestSegmentMtimeMs < STREAM_STALE_MS,
    lastSegmentAt: newestSegmentMtimeMs ? new Date(newestSegmentMtimeMs).toISOString() : null,
  };
}

function scheduleRestart(reason) {
  if (restartTimer) {
    return;
  }

  restartCount += 1;
  const delayMs = Math.min(1000 * restartCount, MAX_RESTART_DELAY_MS);
  streamState.status = 'restarting';
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
  streamState.status = 'starting';
  streamState.lastError = null;
  streamState.lastStartAt = new Date().toISOString();
  console.log('Starting ffmpeg from RTSP to HLS...');

  const command = ffmpeg(RTSP_URL)
    .inputOptions([
      '-rtsp_transport', 'tcp',
      '-fflags', 'nobuffer',
      '-analyzeduration', '0',
      '-probesize', '32',
      '-flags', 'low_delay',
    ])
    .addOptions([
      '-an',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-g', '10',
      '-keyint_min', '10',
      '-sc_threshold', '0',
      '-f', 'hls',
      // Shorter segments and smaller playlist = lower latency
      '-hls_time', '0.5',
      '-hls_list_size', '2',
      '-hls_flags', 'delete_segments+omit_endlist+independent_segments+program_date_time',
      '-muxdelay', '0',
      '-muxpreload', '0',
    ])
    .output(path.join(hlsDir, 'index.m3u8'))
    .on('start', commandLine => {
      ffmpegCommand = command;
      restartCount = 0;
      streamState.status = 'running';
      streamState.pid = command.ffmpegProc ? command.ffmpegProc.pid : null;
      console.log('ffmpeg command:', commandLine);
    })
    .on('error', err => {
      ffmpegCommand = null;
      streamState.status = 'error';
      streamState.lastError = err.message;
      streamState.pid = null;
      console.error('ffmpeg error:', err.message);
      console.error('Check RTSP_URL, credentials, and that the device is reachable.');
      scheduleRestart('ffmpeg error');
    })
    .on('end', () => {
      ffmpegCommand = null;
      streamState.status = 'ended';
      streamState.pid = null;
      console.log('ffmpeg process ended');
      scheduleRestart('ffmpeg end');
    })
    .run();

  ffmpegCommand = command;
  return command;
}

startFfmpeg();

// Serve HLS segments and playlist
app.use('/hls', express.static(hlsDir, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (filePath.toLowerCase().endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    }
  },
}));
app.use('/models', express.static(path.join(__dirname, 'models')));

app.get('/health/stream', (req, res) => {
  res.json({
    ...streamState,
    ...getStreamHealth(),
  });
});
// Supabase-backed attendance API
app.get('/api/attendance', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured on server.' });
  }

  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .order('device_time', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Supabase select error:', error.message);
      return res.status(500).json({ error: 'Failed to load attendance from Supabase.' });
    }

    // Always return JSON, never use res.send or res.end here
    res.json({ records: data || [] });
  } catch (err) {
    console.error('Unexpected /api/attendance error:', err.message);
    res.status(500).json({ error: 'Unexpected error loading attendance.' });
  }
});

// Endpoint you (or the device) can POST to in order to record a scan directly into Supabase
app.post('/api/attendance', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured on server.' });
  }

  const { person_id, name, department, event, point, method, device_time } = req.body || {};

  try {
    // Ensure a person record exists for this ID (first scan creates a new person)
    if (person_id) {
      const { error: upsertError } = await supabase
        .from('persons')
        .upsert([
          {
            id: person_id,
            name: name || null,
            department: department || null,
          },
        ], { onConflict: 'id' });

      if (upsertError) {
        console.error('Supabase persons upsert error:', upsertError.message);
      }
    }

    const { error } = await supabase.from('attendance').insert([
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
      console.error('Supabase insert error:', error.message);
      return res.status(500).json({ error: 'Failed to insert attendance into Supabase.' });
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Unexpected POST /api/attendance error:', err.message);
    res.status(500).json({ error: 'Unexpected error inserting attendance.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`HLS server running at http://localhost:${PORT}/hls/index.m3u8`);
});