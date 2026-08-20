const { spawn } = require("child_process");
const path = require("path");

console.log("=========================================================");
console.log("  Starting MultiFactors Attendance & Dahua Camera Stream");
console.log("=========================================================");

const rootDir = path.join(__dirname, "..");

// 1. Launch the Dahua WebSocket stream bridge
const streamProcess = spawn("node", ["server-websocket.js"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
});

// 2. Launch CRACO / React App
const cracoCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const reactProcess = spawn(cracoCmd, ["craco", "start"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
});

let isShuttingDown = false;
const cleanup = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\nStopping all services...");
  try {
    if (streamProcess && !streamProcess.killed) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(streamProcess.pid), "/f", "/t"]);
      } else {
        streamProcess.kill("SIGTERM");
      }
    }
  } catch (e) {}

  try {
    if (reactProcess && !reactProcess.killed) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(reactProcess.pid), "/f", "/t"]);
      } else {
        reactProcess.kill("SIGTERM");
      }
    }
  } catch (e) {}

  setTimeout(() => process.exit(0), 500);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

reactProcess.on("exit", (code) => {
  cleanup();
});
