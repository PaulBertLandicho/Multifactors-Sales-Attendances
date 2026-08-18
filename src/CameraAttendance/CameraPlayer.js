import React, { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js/build/commonjs/index.js";
import Swal from "sweetalert2";
import { FiCamera, FiLoader, FiCircle, FiUser, FiSearch, FiRefreshCw, FiAlertTriangle, FiSun, FiMoon, FiClock } from "react-icons/fi";
import Icon from "../components/Icon";
import { supabase } from "../supabaseClient";
import { recordAttendanceForPerson, autoGenerateMorningOut } from "../AdminPage/attendanceUtils";
import {
  toFloat32Array,
  normalizeDescriptor,
  euclideanDistance,
  averageDescriptors,
} from "../utils/faceUtils";
import offlineQueue from "../utils/offlineQueue";
import OfflineQueuePanel from "./OfflineQueuePanel";

// --- Voice sound assets (speech synthesis) ---
const playVoice = (type = "info") => {
  let message = "";
  if (type === "success") message = "Attendance recorded successfully.";
  else if (type === "warning") message = "That face is not registered.";
  else if (type === "location") message = "Location could not be determined. Please enable location and try again.";
  else if (type === "error") message = "Error occurred. Please try again.";
  else message = "You have already recorded attendance.";
  try {
    window.speechSynthesis.cancel();
    const speech = new window.SpeechSynthesisUtterance(message);
    speech.lang = "en-US";
    speech.rate = 1;
    speech.pitch = 1;
    speech.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang === "en-US" && v.name.toLowerCase().includes("female")
    );
    if (preferredVoice) speech.voice = preferredVoice;
    window.speechSynthesis.speak(speech);
  } catch (err) {
    console.log("Voice error:", err);
  }
};

const isDuplicateAttendanceError = (error) => {
  const candidates = [
    error?.message,
    error?.details,
    error?.hint,
    error?.error_description,
    error?.description,
    error?.cause?.message,
    typeof error === "string" ? error : "",
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  try {
    candidates.push(JSON.stringify(error).toLowerCase());
  } catch (e) {}

  return candidates.some((text) =>
    /duplicate attendance detected recently|duplicate attendance|already recorded|duplicate|unique|constraint|p0001/.test(
      text,
    ),
  );
};

const notifyDuplicateAttendance = (name, showAlert) => {
  playVoice("info");
  const text = "You have already recorded attendance.";
  console.info(`Duplicate attendance ignored for ${name}.`);

  try {
    const fire = typeof showAlert === "function" ? showAlert : Swal.fire;
    fire({
      icon: "info",
      title: name || "Attendance",
      text,
      timer: 2500,
      showConfirmButton: false,
    });
  } catch (e) {
    // Non-fatal: duplicate alert fallback failed.
  }
};

const DETECTION_INTERVAL_MS = 70;
const PERSON_COOLDOWN_MS = 1200;
// const UNKNOWN_FACE_COOLDOWN_MS = 3500; // Removed: unused constant
// Require several consecutive high-confidence matches before accepting a face
// Make attendance verification as fast as registration
const BUFFER_SIZE = 1; // Only require 1 stable frame
const MIN_VERIFICATION_MS = 0; // No minimum verification time
const TINY_DETECTOR_INPUT_SIZE = 320;
const CAMERA_STATUS = {
  CONNECTING: "connecting",
  LIVE: "live",
  ERROR: "error",
};

// Global error handler
window.onerror = (msg, src, line, col, error) => {
  console.error("Global error:", msg, src, line, col, error);
  if (error && typeof error !== "string") {
    playVoice("error");
    Swal.fire({
      icon: "error",
      title: "Runtime Error",
      text: error.message || String(error),
    });
  }
};

export default function CameraPlayer({
  onFaceScan,
  registrationActive = false,
  hideSettingsCard = false,
}) {
  // If REACT_APP_WS_URL is not set, we skip WebSocket entirely and use local webcam.
  const wsUrl = (process.env.REACT_APP_WS_URL || "").trim() || null;
  const imgRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const videoRef = useRef(null); // For local webcam fallback
  // Removed: unused currentTime state
  const [frameReady, setFrameReady] = useState(false);
  const wsRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [persons, setPersons] = useState([]);
  const [settings, setSettings] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [debugMode, ] = useState(false);
  const [cameraStatus, setCameraStatus] = useState(CAMERA_STATUS.CONNECTING);
  const [cameraError, setCameraError] = useState("");
  const [useLocalCamera, setUseLocalCamera] = useState(false); // Fallback flag
  const [locationInfo, setLocationInfo] = useState({ point: "", status: "idle", message: "Getting exact device location..." });
  const [currentTime, setCurrentTime] = useState(new Date());
  const lastScanRef = useRef({});
  const fullscreenRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [queueCount, setQueueCount] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    function handleResize() {
      // isMobile is determined from initial window width
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Save settings to offline cache when updated
  useEffect(() => {
    (async () => {
      try {
        if (settings && offlineQueue) await offlineQueue.saveSettings(settings);
      } catch (e) {}
    })();
  }, [settings]);

  // Sync offline queue when browser regains network connectivity
  useEffect(() => {
    const trySync = async () => {
      try {
        if (navigator.onLine && offlineQueue && supabase) {
          setSyncingOffline(true);
          const res = await offlineQueue.syncQueue(supabase);
          if (res && res.length) console.log("Offline queue sync results", res);
          // refresh queue count after sync
          try {
            const q = await offlineQueue.getAllQueue();
            setQueueCount(Array.isArray(q) ? q.length : 0);
          } catch (e) {}
          if (res && res.length) {
            showSwal({ icon: "info", title: "Sync Results", text: `${res.length} queued items processed.` });
          }
          // after processing, request background sync for any remaining items
          try { await offlineQueue.requestBackgroundSync(); } catch (e) {}
        }
      } catch (e) {
        console.warn("Offline sync failed", e);
        try { showSwal({ icon: 'error', title: 'Sync Failed', text: String(e) }); } catch (ee) {}
      } finally {
        setSyncingOffline(false);
      }
    };
    window.addEventListener("online", trySync);
    // attempt sync on mount if online
    trySync();
    return () => window.removeEventListener("online", trySync);
  // `supabase` is a stable singleton client and does not trigger re-renders;
  // intentionally omit it from dependencies to avoid unnecessary effect re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track online/offline status to toggle UI controls
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    try {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    } catch (e) {}
    // initialize
    try { setIsOnline(navigator.onLine); } catch (e) {}
    return () => {
      try {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      } catch (e) {}
    };
  }, []);

  // Listen for service-worker triggered sync requests and run retry
  useEffect(() => {
    const handler = async (ev) => {
      try {
        const detail = ev.detail || {};
        if (detail && detail.type === 'SYNC_OFFLINE_QUEUE_REQUEST') {
          // attempt to sync when SW asks
          if (navigator.onLine && offlineQueue && supabase) {
            setSyncingOffline(true);
            try {
              const res = await offlineQueue.syncQueue(supabase);
              console.log('Sw-triggered sync results', res);
            } catch (e) {
              console.warn('Sw-triggered sync failed', e);
            } finally {
              setSyncingOffline(false);
              try { const q = await offlineQueue.getAllQueue(); setQueueCount(Array.isArray(q) ? q.length : 0); } catch (e) {}
            }
          }
        }
      } catch (e) {}
    };
    try { window.addEventListener('sw:sync-offline-queue', handler); } catch (e) {}
    return () => { try { window.removeEventListener('sw:sync-offline-queue', handler); } catch (e) {} };
  // `supabase` is a stable singleton client and does not trigger re-renders;
  // intentionally omit it from dependencies to avoid unnecessary effect re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Removed: unused popupLockRef
  const unknownFaceLockRef = useRef(false);
  const animationFrameRef = useRef();
  const lastDetectionTimeRef = useRef(0);
  const matchBufferRef = useRef([]);
  const verificationIdRef = useRef(null);
  const verificationStartRef = useRef(0);
  const settingsAlertShownRef = useRef(false);
  const descriptorBufferRef = useRef([]);
  const lastLocationRef = useRef({ point: "Location unavailable", ts: 0 });
  const lastLocationWarningRef = useRef({ key: "", ts: 0 });
  const DESCR_BUFFER_SIZE = 3;
  const DESCR_STABILITY = 0.07;
  const lastLandmarksRef = useRef(null);
  const lastBoxRef = useRef(null);
  const autoTimeoutRef = useRef(null);

  // Helper to show SweetAlert in the fullscreen element when active
  const showSwal = (opts) => {
    try {
      const fsActive = document.fullscreenElement === fullscreenRef.current && fullscreenRef.current;
      if (fsActive) {
        // ensure a dedicated wrapper exists inside the fullscreen element
        let wrapper = fullscreenRef.current.querySelector('#swal-fullscreen-wrapper');
        if (!wrapper) {
          wrapper = document.createElement('div');
          wrapper.id = 'swal-fullscreen-wrapper';
          wrapper.style.position = 'relative';
          wrapper.style.zIndex = '2147483646';
          fullscreenRef.current.appendChild(wrapper);
        }
        return Swal.fire({ target: wrapper, ...opts });
      }
      const target = document.body;
      return Swal.fire({ target, ...opts });
    } catch (e) {
      return Swal.fire(opts);
    }
  };

  const buildLocationResult = (point, status, message) => ({ point, status, message });

  const requestBrowserLocation = () => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => resolve({ error }),
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      },
    );
  });

  const getCurrentLocationPoint = useCallback(async () => {
    const now = Date.now();

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      return buildLocationResult(
        "Location unavailable",
        "insecure-context",
        "Location requires HTTPS or localhost. Open the app over a secure connection.",
      );
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return buildLocationResult(
        "Location unavailable",
        "unsupported",
        "This device or browser does not support location services.",
      );
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        if (permission.state === "denied") {
          return buildLocationResult(
            "Location unavailable",
            "permission-denied",
            "Browser location permission is denied. Allow location for this site in the browser settings and retry.",
          );
        }
      }
    } catch (e) {}

    let lastError = null;
    let locationResult = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await requestBrowserLocation();
      if (result && !result.error) {
        const position = result;
        const latNum = Number(position.coords.latitude || 0);
        const lngNum = Number(position.coords.longitude || 0);
        const lat = latNum.toFixed(7);
        const lng = lngNum.toFixed(7);
        const accuracy = Number(position.coords.accuracy || 0);
        const exactPoint = `${lat}, ${lng}`;
        const accuracyText = accuracy ? `GPS accuracy: ±${Math.round(accuracy)} m` : "GPS accuracy: unknown";

        try {
          const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
          const res = await fetch(reverseUrl, {
            headers: {
              Accept: "application/json",
              "Accept-Language": "en",
            },
          });
          if (res.ok) {
            const data = await res.json();
            const addr = data?.address || {};
            const placeParts = [
              addr.road || addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.city || addr.municipality,
              addr.city || addr.town || addr.village || addr.municipality,
              addr.state || addr.region || addr.province,
              addr.country,
            ].filter(Boolean);

const uniqueParts = [...new Set(placeParts)];

if (uniqueParts.length) {
  const address = uniqueParts.join(", ");

  locationResult = buildLocationResult(
    address,
    "ok",
    "Location detected."
  );
  break;
}
            if (data?.display_name) {
              locationResult = buildLocationResult(
                exactPoint,
                "ok",
                `${String(data.display_name)} • ${accuracyText}`,
              );
              break;
            }
          }
        } catch (e) {
          // Fallback handled below when reverse geocoding fails.
        }

        if (!locationResult) {
       locationResult = buildLocationResult(
    "Unknown Address",
    "ok",
    "Location detected."
);
        }

        if (accuracy && accuracy > 300 && attempt < 2) {
          lastError = { code: "LOW_ACCURACY", message: `GPS accuracy is too coarse (${Math.round(accuracy)} meters). Retrying.` };
          locationResult = null;
          continue;
        }
        break;
      }

      lastError = result?.error || result || lastError;
      if (lastError?.code === 1) {
        locationResult = buildLocationResult(
          "Location unavailable",
          "permission-denied",
          "Browser location permission is denied. Allow location for this site in the browser settings and retry.",
        );
        break;
      }
      if (attempt < 2) {
        continue;
      }
    }

    if (!locationResult) {
      if (lastError?.code === 2) {
        locationResult = buildLocationResult(
          "Location unavailable",
          "position-unavailable",
          "The device could not determine a GPS or network location. Move to an open area and try again.",
        );
      } else if (lastError?.code === 3) {
        locationResult = buildLocationResult(
          "Location unavailable",
          "timeout",
          "Location request timed out. Try again with better signal or wait a few seconds.",
        );
      } else if (lastError?.code === "LOW_ACCURACY") {
        locationResult = buildLocationResult(
          "Location unavailable",
          "position-unavailable",
          lastError.message,
        );
      } else {
        locationResult = buildLocationResult(
          "Location unavailable",
          "unavailable",
          "Location could not be determined on this device.",
        );
      }
    }

    if (locationResult.status === "ok" && locationResult.point && locationResult.point !== "Location unavailable") {
      lastLocationRef.current = { point: locationResult.point, ts: now };
    }
    return locationResult;
  }, []);

  const refreshCurrentLocation = useCallback(async () => {
  const result = await getCurrentLocationPoint();
  setLocationInfo(result);
  return result;
}, [getCurrentLocationPoint]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await refreshCurrentLocation();
        if (!cancelled && result?.status === "ok") {
          setLocationInfo(result);
        }
      } catch (e) {
        console.warn("Automatic location enable failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCurrentLocation]);

  // ------------------- Helpers -------------------
  const captureCurrentFrame = useCallback(() => {
    if (useLocalCamera) {
      const video = videoRef.current;
      if (!video || video.readyState !== 4) return null;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85);
    } else {
      const img = imgRef.current;
      if (
        !img ||
        !img.complete ||
        img.naturalWidth === 0 ||
        img.naturalHeight === 0
      )
        return null;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85);
    }
  }, [useLocalCamera]);

  const drawDetection = useCallback((detection) => {
    const canvas = overlayCanvasRef.current;
    // Support both image (Dahua stream) and video (local webcam)
    const img = imgRef.current;
    const video = videoRef.current;

    // Prefer video if it is playing, otherwise fall back to image
    const source = video && video.readyState === 4 ? video : img;
    if (!canvas || !source || !detection) return;

    // Defensive: ensure detection has a valid bounding box before resizing/drawing
    const box = detection?.detection?.box;
    const boxValid =
      box &&
      [box.x, box.y, box.width, box.height].every(
        (v) => typeof v === "number" && !isNaN(v)
      );
    if (!boxValid) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      console.warn("Skipping drawDetection due to invalid detection box:", box);
      return;
    }

    // Size canvas to match the current source frame
    const width = source.videoWidth || source.naturalWidth || 0;
    const height = source.videoHeight || source.naturalHeight || 0;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let resized;
    try {
      resized = faceapi.resizeResults(detection, {
        width: canvas.width,
        height: canvas.height,
      });
    } catch (err) {
      console.warn("faceapi.resizeResults failed, skipping draw:", err);
      return;
    }

    const landmarks = resized.landmarks;
    if (!landmarks) return;

    // Build landmark parts
    const parts = {
      jaw: landmarks.getJawOutline(),
      leftBrow: landmarks.getLeftEyeBrow(),
      rightBrow: landmarks.getRightEyeBrow(),
      nose: landmarks.getNose(),
      leftEye: landmarks.getLeftEye(),
      rightEye: landmarks.getRightEye(),
      mouth: landmarks.getMouth(),
      positions: landmarks.positions,
    };

    // Smooth bounding box as well to reduce jitter
    const rawBox = resized.detection?.box;
    const prevBox = lastBoxRef.current;
    const boxAlpha = 0.65;
    let smoothBox = rawBox;
    if (prevBox && rawBox) {
      smoothBox = {
        x: rawBox.x * boxAlpha + prevBox.x * (1 - boxAlpha),
        y: rawBox.y * boxAlpha + prevBox.y * (1 - boxAlpha),
        width:
          rawBox.width * boxAlpha + (prevBox.width || rawBox.width) * (1 - boxAlpha),
        height:
          rawBox.height * boxAlpha + (prevBox.height || rawBox.height) * (1 - boxAlpha),
      };
    }
    lastBoxRef.current = smoothBox;

    // Draw confidence label background (blue) and box
    try {
      const score = (resized.detection && typeof resized.detection.score === 'number') ? resized.detection.score : null;
      // box stroke
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0b63ff"; // deep blue
      ctx.strokeRect(smoothBox.x, smoothBox.y, smoothBox.width, smoothBox.height);

      if (score !== null) {
        const label = score.toFixed(2);
        const padX = 6;
        ctx.font = "14px Arial";
        const textW = ctx.measureText(label).width;
        const boxW = textW + padX * 2;
        const boxH = 18;
        const labelX = smoothBox.x;
        const labelY = Math.max(0, smoothBox.y - boxH - 4);
        ctx.fillStyle = "#0b63ff";
        ctx.fillRect(labelX - 1, labelY - 1, boxW + 2, boxH + 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, labelX + padX, labelY + boxH - 5);
      }
      // reset styling for landmarks drawing
      ctx.lineWidth = 2;
    } catch (err) {
      // non-fatal
    }

    // Smooth landmark positions with previous frame to reduce jitter
    const prev = lastLandmarksRef.current || {};
    const alpha = 0.6; // current weight
    const smoothPoints = (curArr, prevArr) => {
      if (!prevArr || prevArr.length !== curArr.length) return curArr;
      return curArr.map((p, i) => ({
        x: p.x * alpha + prevArr[i].x * (1 - alpha),
        y: p.y * alpha + prevArr[i].y * (1 - alpha),
      }));
    };

    const smoothParts = {};
    Object.keys(parts).forEach((k) => {
      smoothParts[k] = smoothPoints(parts[k], prev[k]);
    });
    lastLandmarksRef.current = smoothParts;

    ctx.save();
    // cyan lines
    ctx.shadowColor = "#00eaff";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#00eaff";
    ctx.lineWidth = 2;

    const drawPath = (points, close = false) => {
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (close) ctx.closePath();
      ctx.stroke();
    };

    drawPath(smoothParts.jaw);
    drawPath(smoothParts.leftBrow);
    drawPath(smoothParts.rightBrow);
    drawPath(smoothParts.nose);
    drawPath(smoothParts.nose.slice(4, 9), true);
    drawPath(smoothParts.leftEye, true);
    drawPath(smoothParts.rightEye, true);
    drawPath(smoothParts.mouth, true);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff4da6"; // magenta points
    smoothParts.positions.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.4, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.restore();
  }, []);
  const cleanupWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Removed: unused toMinutes function

  const validSettings =
    settings &&
    settings.morning_start &&
    settings.morning_end &&
    settings.afternoon_start &&
    settings.afternoon_end &&
    !isNaN(Number(settings.morning_grace_minutes)) &&
    !isNaN(Number(settings.afternoon_grace_minutes));

  // Quickly surface a clear warning if settings are loaded but invalid,
  // so the user doesn't wait wondering why scanning isn't working.
  useEffect(() => {
    if (settings && !validSettings && !settingsAlertShownRef.current) {
      settingsAlertShownRef.current = true;
      showSwal({
        icon: "warning",
        title: "Work Hour Settings",
        text: "Work hour settings are missing or invalid. Please configure them in Admin \u003e Settings before using face attendance.",
      });
    }
  }, [settings, validSettings]);

  // Live clock for display in header
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fullscreen change handler
  useEffect(() => {
    // Ensure SweetAlert targets body by default
    try {
      Swal.setDefaults({ target: document.body });
    } catch (e) {}

    const onFsChange = () => {
      const fs = document.fullscreenElement === fullscreenRef.current;
      setIsFullscreen(!!fs);
      try {
        const container = Swal.getContainer ? Swal.getContainer() : null;
        if (fs) {
          document.body.style.overflow = "hidden";
          // Move SweetAlert container into the fullscreen element so modals appear on top
          if (container && fullscreenRef.current && !fullscreenRef.current.contains(container)) {
            try {
              fullscreenRef.current.appendChild(container);
            } catch (e) {
              // fallback to setting Swal target
              try { Swal.setDefaults({ target: fullscreenRef.current || document.body }); } catch (e) {}
            }
          } else {
            try { Swal.setDefaults({ target: fullscreenRef.current || document.body }); } catch (e) {}
          }
          if (container) container.style.zIndex = "2147483647";
        } else {
          document.body.style.overflow = "";
          if (container && !document.body.contains(container)) {
            try { document.body.appendChild(container); } catch (e) {}
          }
          try { Swal.setDefaults({ target: document.body }); } catch (e) {}
          if (container) container.style.zIndex = "";
        }
      } catch (e) {
        // ignore
      }
    };

    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      try {
        Swal.setDefaults({ target: document.body });
      } catch (e) {}
    };
  }, []);

  // ------------------- Load persons -------------------
  useEffect(() => {
    async function loadPersons() {
      if (!supabase) return;
      let data = null;
      try {
        const res = await supabase.from("persons").select("id, name, department, descriptor");
        if (!res.error && res.data) data = res.data;
      } catch (e) {
        console.warn('loadPersons: supabase read failed, will try offline cache', e);
      }

      if (!data && offlineQueue) {
        try {
          const cached = await offlineQueue.getPersons();
          data = Array.isArray(cached) ? cached : null;
        } catch (e) {
          data = null;
        }
      }

      if (data) {
        // Process descriptors into normalized Float32Array for runtime use,
        // and store a plain-number-array copy for offline caching (IndexedDB).
        const processed = data.map((p) => {
          const raw = p.descriptor;
          let norm = null;
          try {
            if (raw) {
              if (Array.isArray(raw) && Array.isArray(raw[0])) {
                norm = averageDescriptors(raw);
              } else {
                norm = normalizeDescriptor(toFloat32Array(raw));
              }
            }
          } catch (e) {
            norm = null;
          }
          return {
            original: p,
            descriptorNorm: norm,
            descriptorForCache: norm ? Array.from(norm) : null,
          };
        });

        // Set runtime persons array with Float32Array descriptors
        setPersons(
          processed.map((it) => ({ ...it.original, descriptor: it.descriptorNorm }))
        );

        try {
          // cache persons locally for offline matching using plain arrays
          const cacheData = processed.map((it) => ({ ...it.original, descriptor: it.descriptorForCache }));
          offlineQueue && offlineQueue.savePersons(cacheData);
        } catch (e) {
          console.warn('Failed to save persons to offline cache', e);
        }

        // Debugging: surface how many persons and descriptor availability
        try {
          const total = data.length;
          const withDesc = processed.filter((it) => it.descriptorNorm).length;
          console.info(`loadPersons: loaded ${total} persons (${withDesc} with descriptors)`);
          if (processed.length && processed[0] && processed[0].descriptorForCache) {
            console.debug('Example descriptor length:', processed[0].descriptorForCache.length);
          }
        } catch (e) {}
      }
    }

    // refresh offline queue count
    (async () => {
      try {
        if (offlineQueue) {
          const q = await offlineQueue.getAllQueue();
          setQueueCount(Array.isArray(q) ? q.length : 0);
        }
      } catch (e) {}
    })();

    loadPersons();
    if (!supabase) return;
    const subscription = supabase
      .channel("persons-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "persons" },
        loadPersons
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "persons" },
        loadPersons
      )
      .subscribe();
    return () => subscription.unsubscribe();
  }, []);

  // ------------------- Load settings -------------------
  useEffect(() => {
    let subscription;
    async function loadSettings() {
      // If Supabase is not available, try to load cached settings
      if (!supabase) {
        try {
          const cached = offlineQueue && (await offlineQueue.getSettings());
          if (cached) setSettings(cached);
        } catch (e) {
          console.warn("loadSettings: no supabase and failed to read cached settings", e);
        }
        return;
      }

      try {
        const res = await supabase.from("settings").select("*").eq("id", 1).single();
        if (!res.error && res.data) {
          setSettings(res.data);
          try {
            offlineQueue && offlineQueue.saveSettings(res.data);
          } catch (e) {}
        } else {
          // fallback to cached settings when server read returns no data or error
          try {
            const cached = offlineQueue && (await offlineQueue.getSettings());
            if (cached) setSettings(cached);
          } catch (e) {}
        }
      } catch (e) {
        console.warn("loadSettings: supabase read failed, will try offline cache", e);
        try {
          const cached = offlineQueue && (await offlineQueue.getSettings());
          if (cached) setSettings(cached);
        } catch (err) {}
      }
    }

    loadSettings();

    // Subscribe to real-time updates for settings (if supabase available)
    if (supabase && supabase.channel) {
      subscription = supabase
        .channel("settings-changes")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "settings",
            filter: "id=eq.1",
          },
          (payload) => {
            if (payload.new) {
              setSettings(payload.new);
              try { offlineQueue && offlineQueue.saveSettings(payload.new); } catch (e) {}
            }
          }
        )
        .subscribe();
    }

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // ------------------- Auto Morning-Out scheduler -------------------
  useEffect(() => {
    if (!validSettings || !settings) return;
    let cancelled = false;

    const runAuto = async () => {
      try {
        console.log('AutoMorningOut: running autoGenerateMorningOut (client scheduler)', new Date().toISOString());
        // If online and supabase client is available, prefer server-side generation
        if (navigator.onLine && supabase) {
          try {
            const res = await autoGenerateMorningOut({ supabase, settings });
            console.log('AutoMorningOut (server) result', res);
            const inserted = Array.isArray(res) ? res.filter((r) => r.inserted).length : 0;
            try { showSwal({ icon: 'info', title: 'Auto Morning Out', text: `Auto-generated morning-outs: ${inserted}` }); } catch (e) {}
          } catch (e) {
            console.error('AutoMorningOut (server) failed', e);
          }
        } else {
          // Offline: enqueue time-outs using cached persons/settings
            try {
              if (offlineQueue && typeof offlineQueue.enqueueAutoMorningOuts === 'function') {
                const res = await offlineQueue.enqueueAutoMorningOuts();
                console.log('AutoMorningOut (offline enqueue) result', res);
                const queued = Array.isArray(res) ? res.filter((r) => r.queued).length : 0;
                const blocked = Array.isArray(res) ? res.filter((r) => r.queued === false).length : 0;
                try {
                  const text = `Queued ${queued} auto morning-outs for later sync.` + (blocked ? ` ${blocked} items blocked.` : '');
                  showSwal({ icon: 'info', title: 'Offline Auto Morning Out', text });
                } catch (e) {}
                if (queued > 0) {
                  try {
                    const q = await offlineQueue.getAllQueue();
                    setQueueCount(Array.isArray(q) ? q.length : 0);
                  } catch (e) {}
                  setShowQueuePanel(true);
                }
              } else {
                console.warn('Offline auto morning-out not available (offlineQueue missing or function absent)');
              }
            } catch (e) {
              console.error('AutoMorningOut (offline enqueue) failed', e);
            }
        }
      } catch (e) {
        console.error('AutoMorningOut failed', e);
      }
    };

    const schedule = () => {
      const now = new Date();
      const [hStr, mStr] = (settings?.morning_end || '11:59').split(':');
      const h = Number(hStr || 11);
      const m = Number(mStr || 59);
      let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      if (now.getTime() > target.getTime()) {
        // schedule for next day
        target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
      }
      const ms = target.getTime() - now.getTime();
      if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
      autoTimeoutRef.current = setTimeout(async () => {
        if (cancelled) return;
        await runAuto();
        if (cancelled) return;
        // schedule next day
        autoTimeoutRef.current = setTimeout(async function loop() {
          if (cancelled) return;
          await runAuto();
          if (cancelled) return;
          autoTimeoutRef.current = setTimeout(loop, 24 * 60 * 60 * 1000);
        }, 24 * 60 * 60 * 1000);
      }, ms);
    };

    schedule();
    return () => {
      cancelled = true;
      if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
    };
  }, [validSettings, settings]);

  // ------------------- Load models -------------------
  useEffect(() => {
    async function loadModels() {
      const LOCAL_URL = "/models";
      const CDN_URL = "https://justadudewhohacks.github.io/face-api.js/models";
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_URL),
        ]);
        setModelsLoaded(true);
      } catch {
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL),
          ]);
          setModelsLoaded(true);
        } catch (err) {
          showSwal({
              icon: "error",
              title: "Model Loading Failed",
              text: "Face recognition models could not be loaded.",
            });
        }
      }
    }
    loadModels();
  }, []);

  // ------------------- WebSocket -------------------
  useEffect(() => {
    let disposed = false;
    setCameraError("");
    cleanupWs();
    // If no WebSocket URL is configured, go straight to local webcam.
    if (!wsUrl) {
      setUseLocalCamera(true);
      setCameraStatus(CAMERA_STATUS.CONNECTING);
      return () => {
        disposed = true;
        cleanupWs();
      };
    }
    // If the browser is currently offline, immediately use the local camera
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setUseLocalCamera(true);
        // allow local camera effect to mark LIVE when ready
        return () => {
          disposed = true;
          cleanupWs();
        };
      }
    } catch (e) {}

    setUseLocalCamera(false);
    setCameraStatus(CAMERA_STATUS.CONNECTING);
    const ws = new window.WebSocket(wsUrl);
    wsRef.current = ws;
    // If WS doesn't connect within timeout, fallback to local camera
    const connectTimeout = setTimeout(() => {
      try {
        if (wsRef.current && wsRef.current.readyState !== 1) {
          setCameraError('WebSocket connection timed out. Switching to local camera...');
          setUseLocalCamera(true);
          setCameraStatus(CAMERA_STATUS.CONNECTING);
          try { wsRef.current.close(); } catch (e) {}
        }
      } catch (e) {}
    }, 3000);

    ws.onopen = () => {
      if (!disposed) setCameraStatus(CAMERA_STATUS.LIVE);
    };
    ws.onerror = () => {
      if (!disposed) {
        setCameraStatus(CAMERA_STATUS.ERROR);
        setCameraError(
          "WebSocket connection error. Switching to local camera..."
        );
        setUseLocalCamera(true);
      }
    };
    ws.onclose = () => {
      if (!disposed) {
        setCameraStatus(CAMERA_STATUS.ERROR);
        setCameraError("WebSocket closed. Switching to local camera...");
        setUseLocalCamera(true);
      }
    };
    ws.onmessage = (event) => {
      if (!disposed && imgRef.current) {
        setFrameReady(false);
        imgRef.current.src = event.data;
      }
    };

    return () => {
      disposed = true;
      try { clearTimeout(connectTimeout); } catch (e) {}
      cleanupWs();
    };
  }, [wsUrl, cleanupWs]);
  // Fallback: Use local webcam if WebSocket fails
  useEffect(() => {
    if (!useLocalCamera) return;
    let stream = null;
    let videoEl = null;
    async function startLocalCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoEl = videoRef.current;
          videoEl.srcObject = stream;
          videoEl.onloadedmetadata = () => {
            videoEl.play();
            setFrameReady(true);
            // When falling back to local webcam, mark camera as live so detection can run.
            setCameraStatus(CAMERA_STATUS.LIVE);
          };
        }
      } catch (err) {
        setCameraError("Unable to access local webcam.");
      }
    }
    startLocalCamera();
    return () => {
      if (videoEl) videoEl.srcObject = null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [useLocalCamera]);

  // ------------------- Detection loop -------------------
  useEffect(() => {
    if (!modelsLoaded || !validSettings) return;

    let isMounted = true;

    const detect = async () => {
      if (!isMounted) return;

      const source = useLocalCamera ? videoRef.current : imgRef.current;
      const canvas = overlayCanvasRef.current;
      const now = Date.now();

      // ✅ Basic guards
      if (
        !source ||
        !frameReady ||
        cooldown ||
        registrationActive ||
        cameraStatus !== CAMERA_STATUS.LIVE
      ) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      // ✅ Ensure valid frame
      const isVideo = useLocalCamera;
      if (
        (!isVideo && (!source.complete || source.naturalWidth === 0)) ||
        (isVideo && source.readyState !== 4)
      ) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      // ✅ Throttle detection
      if (now - lastDetectionTimeRef.current < DETECTION_INTERVAL_MS) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectionTimeRef.current = now;

      try {
        const detectionOptions = new faceapi.TinyFaceDetectorOptions({
          inputSize: TINY_DETECTOR_INPUT_SIZE,
          scoreThreshold: 0.5, // slightly improved accuracy
        });

        const fullDetection = await faceapi
          .detectSingleFace(source, detectionOptions)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!fullDetection) {
          canvas
            ?.getContext("2d")
            ?.clearRect(0, 0, canvas.width, canvas.height);
          matchBufferRef.current = [];
          verificationIdRef.current = null;
          verificationStartRef.current = 0;
          setVerifying(false);
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        // ✅ Validate detection box
        const box = fullDetection.detection?.box;
        if (
          !box ||
          [box.x, box.y, box.width, box.height].some(
            (v) => typeof v !== "number" || isNaN(v) || v === null
          )
        ) {
          canvas
            ?.getContext("2d")
            ?.clearRect(0, 0, canvas.width, canvas.height);
          matchBufferRef.current = [];
          verificationIdRef.current = null;
          verificationStartRef.current = 0;
          setVerifying(false);
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        // ✅ Draw mesh
        drawDetection(fullDetection);

        // Descriptor smoothing: buffer descriptors across a few frames
        const descriptor = normalizeDescriptor(
          toFloat32Array(fullDetection.descriptor)
        );
        const dbuf = descriptorBufferRef.current || [];
        dbuf.push(descriptor);
        if (dbuf.length > DESCR_BUFFER_SIZE) dbuf.shift();
        descriptorBufferRef.current = dbuf;

        // Only attempt matching when descriptor buffer is full and stable
        if (dbuf.length < DESCR_BUFFER_SIZE) {
          setVerifying(true);
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        const avgDesc = averageDescriptors(dbuf);
        const deviations = dbuf.map((d) => euclideanDistance(d, avgDesc));
        const maxDev = Math.max(...deviations);
        if (maxDev > DESCR_STABILITY) {
          // unstable descriptor across frames — wait
          setVerifying(true);
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }
        setVerifying(false);

        // ---------------- MATCHING (use averaged descriptor) ----------------
        const candidates = persons
          .filter((p) => p.descriptor)
          .map((p) => ({ p, dist: euclideanDistance(avgDesc, p.descriptor) }))
          .sort((a, b) => a.dist - b.dist);

        const best = candidates.length ? candidates[0] : null;
        const second = candidates.length > 1 ? candidates[1] : null;
        const FACE_MATCH_THRESHOLD = 0.28;
        const margin = second ? second.dist - best.dist : Infinity;
        const CONFIDENCE_MARGIN = 0.07;

        const currentId =
          best && best.dist < FACE_MATCH_THRESHOLD && margin >= CONFIDENCE_MARGIN
            ? best.p.id
            : "unknown";

        const bestMatch = best ? best.p : null;
        const bestDist = best ? best.dist : Infinity;

        // Track how long the currentId has been consistently seen
        if (verificationIdRef.current !== currentId) {
          verificationIdRef.current = currentId;
          verificationStartRef.current = now;
        }

        // ---------------- BUFFER (ANTI-FLICKER) ----------------
        matchBufferRef.current.push(currentId);
        if (matchBufferRef.current.length > BUFFER_SIZE) {
          matchBufferRef.current.shift();
        }

        const verificationElapsed = now - (verificationStartRef.current || 0);
        const stable =
          matchBufferRef.current.length === BUFFER_SIZE &&
          matchBufferRef.current.every((id) => id === currentId) &&
          verificationElapsed >= MIN_VERIFICATION_MS;

        if (!stable) {
          setVerifying(true);
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        setVerifying(false);

        // ---------------- COOLDOWN ----------------
        const lastScan = lastScanRef.current[currentId] || 0;
        if (now - lastScan < PERSON_COOLDOWN_MS) {
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        // ---------------- KNOWN PERSON ----------------
        if (bestMatch && bestDist < FACE_MATCH_THRESHOLD) {
          // clear descriptor buffer so next person starts fresh
          descriptorBufferRef.current = [];
          lastScanRef.current[currentId] = now;
          setCooldown(true);

          // Do NOT update registration_photo when recording attendance
          const scanPayload = {
            descriptor,
            // photoDataUrl is still captured for attendance logs, but should NOT be used to update registration_photo
            photoDataUrl: captureCurrentFrame(),
            deviceTime: new Date().toISOString(),
          };

          // Debug: log match info before recording attendance
          console.log(
            "ATTENDANCE DEBUG: bestMatch=",
            bestMatch,
            "bestDist=",
            bestDist,
            "threshold=",
            FACE_MATCH_THRESHOLD
          );
          console.log(
            "ATTENDANCE DEBUG: candidates=",
            candidates
              .map((c) => ({ id: c.p.id, name: c.p.name, dist: c.dist }))
              .slice(0, 5)
          );
          console.log("ATTENDANCE DEBUG: settings=", settings);
          console.log(
            "ATTENDANCE DEBUG: scanPayload present=",
            Boolean(scanPayload.photoDataUrl),
            scanPayload.deviceTime
          );
          // Update debug overlay if present
          try {
            if (debugMode) {
              const el = document.getElementById("face-debug-pre");
              if (el)
                el.textContent = JSON.stringify(
                  candidates
                    .slice(0, 8)
                    .map((c) => ({
                      id: c.p.id,
                      name: c.p.name,
                      dist: c.dist.toFixed(3),
                    })),
                  null,
                  2
                );
            }
          } catch (e) {}

          // Ensure recordAttendanceForPerson or any attendance logic does NOT update registration_photo
          // (Assumes recordAttendanceForPerson does not update registration_photo for existing persons)
          (async () => {
            const locationResult = await refreshCurrentLocation();
            if (locationResult.status !== "ok") {
              const warnKey = `${locationResult.status}:${locationResult.message}`;
              const nowMs = Date.now();
              if (!lastLocationWarningRef.current.key || lastLocationWarningRef.current.key !== warnKey || nowMs - lastLocationWarningRef.current.ts > 10000) {
                lastLocationWarningRef.current = { key: warnKey, ts: nowMs };
                playVoice("location");
                showSwal({
                  icon: locationResult.status === "permission-denied" ? "error" : "warning",
                  title: "Location unavailable",
                  text: locationResult.message,
                  timer: 4000,
                  showConfirmButton: false,
                });
              }
              return { inserted: false, blocked: true, event: "location-unavailable", message: locationResult.message };
            }
            return recordAttendanceForPerson({
              supabase,
              person: bestMatch,
              settings,
              scanPayload: {
                ...scanPayload,
                point: locationResult.point,
              },
              method: "face-scan",
            });
          })()
            .then((result) => {
              console.log("ATTENDANCE DEBUG: recordAttendance result=", result);
              if (result.inserted) {
                const message =
                  result.event === "time-in"
                    ? `Time-in (${result.status})`
                    : result.event === "time-out"
                    ? `Time-out (${result.status})`
                    : `${result.event} (${result.status})`;

                playVoice("success");
                      showSwal({
                        icon: "success",
                        title: bestMatch.name,
                        text: message,
                        timer: 2500,
                        showConfirmButton: false,
                      });
              } else if (result.blocked && result.event === "location-unavailable") {
                // Location warning already shown; keep the scan cooldown brief and do not treat this like a duplicate.
              } else if (result.blocked) {
                // Throttle duplicate/info voice feedback to once every 5 seconds.
                const nowMs = Date.now();
                if (
                  !lastScanRef.current.blockedInfoTs ||
                  nowMs - lastScanRef.current.blockedInfoTs > 5000
                ) {
                  notifyDuplicateAttendance(bestMatch.name, showSwal);
                  lastScanRef.current.blockedInfoTs = nowMs;
                }
              }
            })
            .catch((err) => {
              console.error("ATTENDANCE ERROR:", err);
              if (isDuplicateAttendanceError(err)) {
                notifyDuplicateAttendance(bestMatch.name, showSwal);
                return;
              }

              playVoice("error");
              showSwal({
                icon: "error",
                title: "Attendance Error",
                text: err.message || String(err),
              });
            })
            .finally(() => setCooldown(false));
        }

        // ---------------- UNKNOWN PERSON ----------------
        else {
          // clear descriptor buffer so next person starts fresh
          descriptorBufferRef.current = [];
          // Only trigger onFaceScan for unknown faces if NOT in registrationActive mode
          // (registrationActive disables scanning to avoid duplicate popups)
          if (!registrationActive && typeof onFaceScan === "function") {
            const photoDataUrl = captureCurrentFrame();
            if (photoDataUrl) {
              const scanPayload = {
                descriptor,
                photoDataUrl,
                deviceTime: new Date().toISOString(),
              };
              onFaceScan(scanPayload);
            }
          }
          // Throttle SweetAlert for unregistered faces: only show once every 5 seconds
          const nowMs = Date.now();
          if (
            !unknownFaceLockRef.current ||
            nowMs - unknownFaceLockRef.current > 5000
          ) {
            playVoice("warning");
            showSwal({
              icon: "warning",
              title: "That face is not registered",
              text: "",
              timer: 2500,
              showConfirmButton: false,
            });
            unknownFaceLockRef.current = nowMs;
          }
          lastScanRef.current.unknown = now;
          matchBufferRef.current = [];
          setCooldown(true);
          setTimeout(() => setCooldown(false), 1200);
        }
      } catch (err) {
        console.error(err);
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    setScanning(true);
    animationFrameRef.current = requestAnimationFrame(detect);

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameRef.current);
      setScanning(false);
    };
  }, [
    modelsLoaded,
    validSettings,
    frameReady,
    cooldown,
    registrationActive,
    cameraStatus,
    persons,
    drawDetection,
    captureCurrentFrame,
    onFaceScan,
    useLocalCamera,
    debugMode,
    settings,
    getCurrentLocationPoint,
    refreshCurrentLocation,
  ]);

  // ------------------- Update current time -------------------
  // Removed: unused currentTime update effect

  // ------------------- Reset registration state -------------------
  useEffect(() => {
    if (!registrationActive) {
      unknownFaceLockRef.current = false;
      matchBufferRef.current = [];
      setVerifying(false);
    }
  }, [registrationActive, settings]); // settings dependency included for completeness

  // ------------------- Render -------------------
  const toggleFullScreen = async () => {
    try {
      if (isFullscreen) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      } else {
        const el = fullscreenRef.current;
        if (el) {
          if (el.requestFullscreen) await el.requestFullscreen();
          else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        }
      }
    } catch (e) {
      console.warn('Fullscreen toggle failed', e);
    }
  };
  return (
    <div
      ref={fullscreenRef}
      className={isFullscreen
        ? "fixed top-0 left-0 w-screen h-screen p-0 flex justify-center items-center bg-black z-[9999]"
        : "flex justify-center p-5 font-sans"}
    >
      {/* Camera card */}
      <div className={[
        "w-full h-full bg-white overflow-hidden transition-shadow duration-300",
        isFullscreen
          ? "max-w-full rounded-none shadow-none"
          : "max-w-[900px] rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.08),0_6px_12px_rgba(0,0,0,0.05)]"
      ].join(" ")}>

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 bg-[#f9fafc] border-b border-[#eef2f6]">
          <span className="flex items-center gap-2 text-[1.2rem] font-semibold text-[#1e293b] tracking-tight">
            <Icon as={FiCamera} ariaLabel="Camera" />
            Live Feed
          </span>
          <span className="text-[#475569] font-semibold text-sm">
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <div className="flex gap-2 flex-wrap justify-end items-center">
            {cameraStatus === CAMERA_STATUS.CONNECTING && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-[#e9f0ff] text-[#2563eb] whitespace-nowrap">
                <Icon as={FiLoader} ariaLabel="Connecting" />Connecting...
              </span>
            )}
            {cameraStatus === CAMERA_STATUS.LIVE && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-[#e6f7e6] text-[#16a34a] whitespace-nowrap">
                <Icon as={FiCircle} ariaLabel="Live" />Live
              </span>
            )}
            <button
              onClick={toggleFullScreen}
              className={[
                "ml-2 px-3 py-1.5 rounded-lg border-none cursor-pointer font-bold text-sm",
                isFullscreen
                  ? "bg-[#f3f4f6] text-[#111827]"
                  : "bg-[#237227] text-white"
              ].join(" ")}
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            {cameraStatus === CAMERA_STATUS.ERROR && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-[#fee9e7] text-[#dc2626] whitespace-nowrap">
                <Icon as={FiAlertTriangle} ariaLabel="Error" />Error
              </span>
            )}
            {!modelsLoaded && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-[#fff3cd] text-[#b45309] whitespace-nowrap">
                <Icon as={FiRefreshCw} ariaLabel="Loading models" />Loading models
              </span>
            )}
            {modelsLoaded && scanning && !verifying && validSettings && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-[#237227] border border-[#237227] whitespace-nowrap">
                <Icon as={FiUser} ariaLabel="Scanning" color="#237227" />Scanning
              </span>
            )}
            {verifying && validSettings && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-[#fef3c7] text-[#d97706] whitespace-nowrap">
                <Icon as={FiSearch} ariaLabel="Verifying" />Verifying
                <span className="inline-block w-6 text-left animate-[blink_1.4s_infinite]">...</span>
              </span>
            )}
          </div>
        </div>

        {/* Camera feed area */}
        <div className={[
          "relative w-full bg-[#0b1120]",
          isFullscreen ? "h-[calc(100vh-72px)]" : "aspect-video"
        ].join(" ")}>
          {useLocalCamera ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover block"
            />
          ) : (
            <img
              ref={imgRef}
              alt="Camera Stream"
              onLoad={() =>
                setFrameReady(
                  imgRef.current?.naturalWidth > 0 &&
                    imgRef.current?.naturalHeight > 0
                )
              }
              className="w-full h-full object-cover block"
            />
          )}
          <canvas
            ref={overlayCanvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
        </div>

        {/* Settings info card */}
        {!hideSettingsCard && settings && validSettings && (
          <div className="mx-6 my-4 p-5 bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] rounded-[20px] border border-[#e2e8f0]">
            {/* Morning row */}
            <div className="flex items-center gap-2.5 flex-wrap py-2 border-b border-dashed border-[#cbd5e1]">
              <span className="text-[1.3rem]"><Icon as={FiSun} ariaLabel="Sun" /></span>
              <span className="font-semibold text-[#334155] min-w-[75px]">Morning:</span>
              <span className=" font-medium bg-[#237227] text-[#ffffff] px-3.5 py-1 rounded-lg shadow-sm text-sm">
                {settings.morning_start} – {settings.morning_end}
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 bg-[#50] border border-[#237227] text-[#000000] px-3.5 py-1 rounded-full text-xs font-medium">
                <FiClock className="inline" />{settings.morning_grace_minutes} min grace
              </span>
            </div>

            {/* Afternoon row */}
            <div className="flex items-center gap-2.5 flex-wrap py-2 border-b border-dashed border-[#cbd5e1]">
              <span className="text-[1.3rem]"><Icon as={FiMoon} ariaLabel="Moon" /></span>
              <span className="font-semibold text-[#334155] min-w-[75px]">Afternoon:</span>
              <span className=" font-medium bg-[#237227] text-[#ffffff] px-3.5 py-1 rounded-lg shadow-sm text-sm">
                {settings.afternoon_start} – {settings.afternoon_end}
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 bg-[#50] border border-[#237227] text-[#000000] px-3.5 py-1 rounded-full text-xs font-medium">
                <FiClock className="inline" />{settings.afternoon_grace_minutes} min grace
              </span>
            </div>

            {/* Location row */}
            <div className="flex items-center gap-2.5 flex-wrap py-2">
              <span className="text-[1.3rem]"><Icon as={FiUser} ariaLabel="Location" /></span>
              <span className="font-semibold text-[#334155] min-w-[75px]">Location:</span>
              <span className=" font-medium bg-[#237227] text-[#ffffff] px-3.5 py-1 rounded-lg shadow-sm text-sm">
                {locationInfo.point || "Detecting location..."}
              </span>
              {locationInfo.status === "ok" ? (
                <span className="ml-auto inline-flex items-center gap-1.5 bg-gray-50 border border-[#237227] text-[#000000] px-4 py-1 rounded-full text-xs font-medium">
                  Location detected.
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] px-2.5 py-1 rounded-full text-xs font-medium">
                  {locationInfo.message}
                </span>
              )}
            </div>

            {/* Actions row */}
            <div className="flex justify-between items-center pt-3 pb-3 gap-3">
              <div className="flex items-center gap-2">
                {queueCount > 0 && (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-[#fff4e6] text-[#92400e] whitespace-nowrap">
                    <Icon as={FiAlertTriangle} ariaLabel="Offline queued" />Offline: {queueCount}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {!isOnline && (
                  <>
                    <button
                      onClick={async () => {
                        if (!offlineQueue || !supabase) {
                          try { showSwal({ icon: "info", title: "Sync Unavailable", text: "Offline sync not configured." }); } catch (e) {}
                          return;
                        }
                        if (!queueCount) return;
                        if (queueCount >= 5) {
                          try {
                            const confirm = await showSwal({
                              title: `Sync ${queueCount} queued items?`,
                              text: "This will attempt to send all queued attendance records to the server.",
                              icon: "question",
                              showCancelButton: true,
                              confirmButtonText: "Yes, sync now",
                            });
                            if (!confirm || !confirm.isConfirmed) return;
                          } catch (e) {}
                        }
                        try {
                          setSyncingOffline(true);
                          const res = await offlineQueue.syncQueue(supabase);
                          try { showSwal({ icon: "success", title: "Sync Complete", text: `Processed ${res.length} item(s).` }); } catch (e) {}
                        } catch (e) {
                          try { showSwal({ icon: "error", title: "Sync Failed", text: String(e) }); } catch (ee) {}
                        } finally {
                          setSyncingOffline(false);
                          try { const q = await offlineQueue.getAllQueue(); setQueueCount(Array.isArray(q) ? q.length : 0); } catch (e) {}
                        }
                      }}
                      disabled={!queueCount || syncingOffline}
                      className={[
                        "px-2.5 py-1.5 rounded-lg border-none cursor-pointer bg-emerald-500 text-white font-bold text-sm",
                        (!queueCount || syncingOffline) ? "opacity-60" : ""
                      ].join(" ")}
                      title={!queueCount ? "No queued items to sync" : "Synchronize queued attendance"}
                    >
                      {syncingOffline ? "Syncing..." : "Sync"}
                    </button>
                    <button
                      onClick={() => setShowQueuePanel((s) => !s)}
                      className="px-2.5 py-1.5 rounded-lg border-none cursor-pointer bg-[#eef2ff] text-[#2563eb] font-bold text-sm"
                    >
                      {showQueuePanel ? "Hide Queue" : "Show Queue"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Compact fullscreen settings overlay */}
        {isFullscreen && !hideSettingsCard && settings && validSettings && (
          <div className="fixed top-3 left-3 bg-[rgba(16,185,129,0.12)] border border-white/[0.08] px-3 py-2.5 rounded-xl z-[2147483646] backdrop-blur-md shadow-[0_6px_18px_rgba(0,0,0,0.4)] min-w-[220px]">
            <div className="flex items-center gap-2.5 py-1.5">
              <span className="mr-1.5"><FiSun /></span>
              <div className="flex flex-col">
                <div className="font-bold text-[#f8fafc]">Morning</div>
                <div className="text-[#e5e7eb] text-[13px]">
                  {settings.morning_start} – {settings.morning_end}
                  <span className="ml-2 inline-flex items-center gap-1.5">
                    <Icon as={FiClock} ariaLabel="Morning grace" />{settings.morning_grace_minutes}m
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 py-1.5">
              <span className="mr-1.5"><Icon as={FiMoon} ariaLabel="Moon" /></span>
              <div className="flex flex-col">
                <div className="font-bold text-[#f8fafc]">Afternoon</div>
                <div className="text-[#e5e7eb] text-[13px]">
                  {settings.afternoon_start} – {settings.afternoon_end}
                  <span className="ml-2 inline-flex items-center gap-1.5">
                    <Icon as={FiClock} ariaLabel="Afternoon grace" />{settings.afternoon_grace_minutes}m
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {debugMode && (
          <div className="px-4 py-2 text-xs text-[#062b6d]">
            <div><strong>DEBUG — Top candidates</strong></div>
            <pre className="whitespace-pre-wrap max-h-[120px] overflow-auto m-0" id="face-debug-pre">
              (waiting...)
            </pre>
          </div>
        )}

        {showQueuePanel && (
          <OfflineQueuePanel
            onClose={() => setShowQueuePanel(false)}
            onQueueChange={(n) => setQueueCount(n)}
          />
        )}

        {/* Error or missing settings messages */}
        {!validSettings && (
          <div className="mx-6 my-4 px-4 py-3 bg-[#fee2e2] text-[#b91c1c] rounded-xl border border-[#fecaca] text-[0.95rem] flex items-center gap-2">
            <Icon as={FiAlertTriangle} ariaLabel="Work hour warning" />Work hour settings are missing or invalid
          </div>
        )}
        {cameraStatus === CAMERA_STATUS.ERROR && (
          <div className="mx-6 my-4 px-4 py-3 bg-[#fee2e2] text-[#b91c1c] rounded-xl border border-[#fecaca] text-[0.95rem] flex items-center gap-2">
            {cameraError}
          </div>
        )}
      </div>
    </div>
  );
}

// Blink keyframe animation for Tailwind
(() => {
  if (typeof document === 'undefined') return;
  const id = 'camera-blink-kf';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = '@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }';
    document.head.appendChild(s);
  }
})();



// Add keyframes for blinking dots (injected via style tag)
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;
document.head.appendChild(styleSheet);
