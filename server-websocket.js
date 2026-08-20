// server-websocket.js
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const http = require("http");
const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const ffmpeg = require("fluent-ffmpeg");

const PORT = parseInt(process.env.WS_PORT || process.env.PORT || "4000", 10);
const RTSP_URL =
  process.env.DAHUA_RTSP_URL ||
  "rtsp://admin:12a34s56d@192.168.111.222:554/cam/realmonitor?channel=1&subtype=0";

// WSS (Secure WebSocket) support for HTTPS/Vercel deployments.
// Set SSL_CERT_PATH and SSL_KEY_PATH in .env.local to enable wss://.
// Without these, the server runs in plain ws:// mode (local dev).
const SSL_CERT_PATH = (process.env.SSL_CERT_PATH || "").trim();
const SSL_KEY_PATH = (process.env.SSL_KEY_PATH || "").trim();
const useSSL = SSL_CERT_PATH && SSL_KEY_PATH && fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH);

const requestHandler = (req, res) => {
  // CORS headers so Vercel-deployed frontend can reach this server
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", clients: wss.clients.size, ssl: useSSL }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Dahua WebSocket Stream Server is running" + (useSSL ? " (WSS/SSL)" : " (WS)"));
};

let server;
if (useSSL) {
  server = https.createServer(
    {
      cert: fs.readFileSync(SSL_CERT_PATH),
      key: fs.readFileSync(SSL_KEY_PATH),
    },
    requestHandler,
  );
  console.log("[SSL] Secure WebSocket (wss://) mode enabled.");
} else {
  server = http.createServer(requestHandler);
  console.log("[SSL] Plain WebSocket (ws://) mode. Set SSL_CERT_PATH & SSL_KEY_PATH for wss://.");
}

const wss = new WebSocket.Server({ server });

let ffmpegProcess = null;
let streamPipe = null;
let restartTimeout = null;

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

function startStream() {
  if (ffmpegProcess) return;

  console.log(`[FFmpeg] Connecting to Dahua RTSP: ${RTSP_URL}`);
  let buffer = Buffer.alloc(0);

  const cmd = ffmpeg(RTSP_URL)
    .inputOptions([
      "-rtsp_transport",
      "tcp",
      "-fflags",
      "nobuffer",
      "-flags",
      "low_delay",
      "-probesize",
      "32",
      "-analyzeduration",
      "0",
    ])
    .addOptions([
      "-an",
      "-vf",
      "fps=25",
      "-q:v",
      "6",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
    ])
    .format("mjpeg")
    .on("start", (cmdLine) => {
      console.log("[FFmpeg] Stream process started");
    })
    .on("error", (err) => {
      console.error("[FFmpeg] Stream error:", err.message);
      stopStream();
      if (wss.clients.size > 0 && !restartTimeout) {
        restartTimeout = setTimeout(() => {
          restartTimeout = null;
          startStream();
        }, 2000);
      }
    })
    .on("end", () => {
      console.log("[FFmpeg] Stream ended");
      stopStream();
      if (wss.clients.size > 0 && !restartTimeout) {
        restartTimeout = setTimeout(() => {
          restartTimeout = null;
          startStream();
        }, 2000);
      }
    });

  streamPipe = cmd.pipe();
  ffmpegProcess = cmd;

  streamPipe.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Parse complete JPEG frames between SOI (0xFF, 0xD8) and EOI (0xFF, 0xD9)
    while (true) {
      const startIndex = buffer.indexOf(SOI);
      if (startIndex === -1) {
        buffer = Buffer.alloc(0);
        break;
      }
      const endIndex = buffer.indexOf(EOI, startIndex + 2);
      if (endIndex === -1) {
        if (startIndex > 0) {
          buffer = buffer.subarray(startIndex);
        }
        break;
      }

      const frame = buffer.subarray(startIndex, endIndex + 2);
      buffer = buffer.subarray(endIndex + 2);

      const base64Data = "data:image/jpeg;base64," + frame.toString("base64");

      // Broadcast to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(base64Data);
        }
      });
    }

    // Safety guard to avoid memory buildup if stream corrupts
    if (buffer.length > 5 * 1024 * 1024) {
      buffer = Buffer.alloc(0);
    }
  });
}

function stopStream() {
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  if (streamPipe) {
    try {
      streamPipe.destroy();
    } catch (e) {}
    streamPipe = null;
  }
  if (ffmpegProcess) {
    try {
      ffmpegProcess.kill("SIGKILL");
    } catch (e) {}
    ffmpegProcess = null;
  }
}

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WebSocket] Client connected from ${clientIp}. Total: ${wss.clients.size}`);

  if (wss.clients.size === 1) {
    startStream();
  }

  ws.on("close", () => {
    console.log(`[WebSocket] Client disconnected. Total: ${wss.clients.size}`);
    if (wss.clients.size === 0) {
      console.log("[WebSocket] No active clients. Pausing FFmpeg stream to save resources.");
      stopStream();
    }
  });

  ws.on("error", (err) => {
    console.error("[WebSocket] Client error:", err.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const protocol = useSSL ? "wss" : "ws";
  // Try to show the machine's LAN IP for convenience
  let lanIp = "localhost";
  try {
    const os = require("os");
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) {
          lanIp = net.address;
          break;
        }
      }
      if (lanIp !== "localhost") break;
    }
  } catch (e) {}
  console.log(`====================================================`);
  console.log(`  Dahua RTSP-to-WebSocket Bridge Running on Port ${PORT}`);
  console.log(`  Mode: ${useSSL ? "WSS (Secure)" : "WS (Plain)"}`);
  console.log(`  Target RTSP: ${RTSP_URL}`);
  console.log(`  Local URL:   ${protocol}://localhost:${PORT}`);
  console.log(`  LAN URL:     ${protocol}://${lanIp}:${PORT}`);
  console.log(`====================================================`);
  console.log(`  Set REACT_APP_WS_URL=${protocol}://${lanIp}:${PORT} in Vercel env vars`);
  console.log(`  to connect from the Vercel-deployed frontend.`);
  console.log(`====================================================`);
});
