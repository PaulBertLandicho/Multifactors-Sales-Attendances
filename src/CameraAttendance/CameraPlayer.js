import React, { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js/build/commonjs/index.js";
import Swal from "sweetalert2";
import { FiCamera, FiLoader, FiCircle, FiUser, FiSearch, FiRefreshCw, FiAlertTriangle, FiSun, FiMoon, FiClock } from "react-icons/fi";
import Icon from "../components/Icon";
import { supabase } from "../supabaseClient";
import { recordAttendanceForPerson } from "../AdminPage/attendanceUtils";
import {
  toFloat32Array,
  normalizeDescriptor,
  euclideanDistance,
  averageDescriptors,
} from "../utils/faceUtils";

// --- Voice sound assets (speech synthesis) ---
const playVoice = (type = "info") => {
  let message = "";
  if (type === "success") message = "Attendance recorded successfully.";
  else if (type === "warning") message = "That face is not registered.";
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
  const [debugMode, setDebugMode] = useState(false);
  const [cameraStatus, setCameraStatus] = useState(CAMERA_STATUS.CONNECTING);
  const [cameraError, setCameraError] = useState("");
  const [useLocalCamera, setUseLocalCamera] = useState(false); // Fallback flag
  const [currentTime, setCurrentTime] = useState(new Date());
  const lastScanRef = useRef({});
  const fullscreenRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Removed: unused popupLockRef
  const unknownFaceLockRef = useRef(false);
  const animationFrameRef = useRef();
  const lastDetectionTimeRef = useRef(0);
  const matchBufferRef = useRef([]);
  const verificationIdRef = useRef(null);
  const verificationStartRef = useRef(0);
  const settingsAlertShownRef = useRef(false);

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

    ctx.save();

    // 🔥 ADD IT HERE
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

    drawPath(landmarks.getJawOutline());
    drawPath(landmarks.getLeftEyeBrow());
    drawPath(landmarks.getRightEyeBrow());
    drawPath(landmarks.getNose());
    drawPath(landmarks.getNose().slice(4, 9), true);
    drawPath(landmarks.getLeftEye(), true);
    drawPath(landmarks.getRightEye(), true);
    drawPath(landmarks.getMouth(), true);

    // Points (optional glow off for cleaner look)
    ctx.shadowBlur = 0; // 🔥 prevent glowing dots
    ctx.fillStyle = "#ffffff";

    landmarks.positions.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
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
      const { data, error } = await supabase
        .from("persons")
        .select("id, name, department, descriptor");
      if (!error && data) {
        setPersons(
          data.map((p) => ({
            ...p,
            descriptor: p.descriptor
              ? Array.isArray(p.descriptor) && Array.isArray(p.descriptor[0])
                ? averageDescriptors(p.descriptor)
                : normalizeDescriptor(toFloat32Array(p.descriptor))
              : null,
          }))
        );
      }
    }

    loadPersons();
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
      if (!supabase) return;
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (!error && data) setSettings(data);
    }
    loadSettings();

    // Subscribe to real-time updates for settings
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
          if (payload.new) setSettings(payload.new);
        }
      )
      .subscribe();

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

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

    setUseLocalCamera(false);
    setCameraStatus(CAMERA_STATUS.CONNECTING);
    const ws = new window.WebSocket(wsUrl);
    wsRef.current = ws;

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

        const descriptor = normalizeDescriptor(
          toFloat32Array(fullDetection.descriptor)
        );

        // ---------------- MATCHING ----------------
        // Compute distances to all persons and pick best candidate
        const candidates = persons
          .filter((p) => p.descriptor)
          .map((p) => ({
            p,
            dist: euclideanDistance(descriptor, p.descriptor),
          }))
          .sort((a, b) => a.dist - b.dist);

        const best = candidates.length ? candidates[0] : null;
        const second = candidates.length > 1 ? candidates[1] : null;

        // Use same stricter threshold as registration to avoid mis-assignments
        // Tighter threshold: distance must be very close to the
        // stored descriptor (built from the registration_photo)
        const FACE_MATCH_THRESHOLD = 0.28;
        const margin = second ? second.dist - best.dist : Infinity;

        // Require a clear separation between best and second-best match
        const CONFIDENCE_MARGIN = 0.07;

        const currentId =
          best &&
          best.dist < FACE_MATCH_THRESHOLD &&
          margin >= CONFIDENCE_MARGIN
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
          recordAttendanceForPerson({
            supabase,
            person: bestMatch,
            settings,
            scanPayload,
            method: "face-scan",
          })
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
              } else if (result.blocked) {
                // Throttle SweetAlert for blocked/info (already timed in) to once every 5 seconds
                const nowMs = Date.now();
                if (
                  !lastScanRef.current.blockedInfoTs ||
                  nowMs - lastScanRef.current.blockedInfoTs > 5000
                ) {
                  playVoice("info");
                  showSwal({
                    icon: "info",
                    title: bestMatch.name,
                    text: result.message,
                    timer: 2200,
                    showConfirmButton: false,
                  });
                  lastScanRef.current.blockedInfoTs = nowMs;
                }
              }
            })
            .catch((err) => {
              console.error("ATTENDANCE ERROR:", err);
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
    <div ref={fullscreenRef} style={isFullscreen ? styles.containerFull : styles.container}>
      {/* Camera card */}
      <div style={isFullscreen ? { ...styles.cameraCard, ...styles.cameraCardFull } : styles.cameraCard}>
        <div style={styles.cameraHeader}>
          <span style={styles.cameraTitle}><Icon as={FiCamera} style={{ marginRight: 8 }} ariaLabel="Camera" />Live Feed</span>
          <span style={{ marginLeft: 12, color: '#475569', fontWeight: 600 }}>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <div style={styles.statusBadges}>
            {cameraStatus === CAMERA_STATUS.CONNECTING && (
              <span style={{ ...styles.badge, ...styles.badgeConnecting }}>
                <Icon as={FiLoader} style={{ marginRight: 8 }} ariaLabel="Connecting" />Connecting...
              </span>
            )}
            {cameraStatus === CAMERA_STATUS.LIVE && (
              <span style={{ ...styles.badge, ...styles.badgeLive }}>
                <Icon as={FiCircle} style={{ marginRight: 8 }} ariaLabel="Live" />Live
              </span>
            )}
            <button
              onClick={() => setDebugMode((d) => !d)}
              style={{
                marginLeft: 8,
                padding: "6px 10px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "#eef2ff",
                color: "#2563eb",
              }}
            >
              {debugMode ? "Hide" : "Debug"}
            </button>
            <button
              onClick={toggleFullScreen}
              style={{
                marginLeft: 8,
                padding: "6px 10px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: isFullscreen ? "#f3f4f6" : "#237227",
                color: isFullscreen ? "#111827" : "#ffffff",
                fontWeight: 700,
              }}
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            {cameraStatus === CAMERA_STATUS.ERROR && (
              <span style={{ ...styles.badge, ...styles.badgeError }}>
                <Icon as={FiAlertTriangle} style={{ marginRight: 8 }} ariaLabel="Error" />Error
              </span>
            )}
            {!modelsLoaded && (
              <span style={{ ...styles.badge, ...styles.badgeLoading }}>
                <Icon as={FiRefreshCw} style={{ marginRight: 8 }} ariaLabel="Loading models" />Loading models
              </span>
            )}
            {modelsLoaded && scanning && !verifying && validSettings && (
              <span style={{ ...styles.badge, ...styles.badgeScanning }}>
                <Icon as={FiUser} style={{ marginRight: 8 }} ariaLabel="Scanning" />Scanning
              </span>
            )}
            {verifying && validSettings && (
              <span style={{ ...styles.badge, ...styles.badgeVerifying }}>
                <Icon as={FiSearch} style={{ marginRight: 8 }} ariaLabel="Verifying" />Verifying<span style={styles.dots}>...</span>
              </span>
            )}
          </div>
        </div>

        {/* Camera feed area */}
        <div style={isFullscreen ? { ...styles.feedWrapper, ...styles.feedWrapperFull } : styles.feedWrapper}>
          {useLocalCamera ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={styles.feed}
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
              style={styles.feed}
            />
          )}
          <canvas ref={overlayCanvasRef} style={isFullscreen ? { ...styles.overlayCanvas, ...styles.overlayCanvasFull } : styles.overlayCanvas} />
        </div>

        {/* Settings info card */}
        {/* Hide settings info card if hideSettingsCard is true */}
        {!hideSettingsCard && settings && validSettings && (
            <div style={styles.settingsCard}>
            <div style={styles.settingRow}>
              <span style={styles.settingIcon}><Icon as={FiSun} ariaLabel="Sun" /></span>
              <span style={styles.settingLabel}>Morning:</span>
              <span style={styles.settingValue}>
                {settings.morning_start} – {settings.morning_end}
              </span>
              <span style={styles.graceBadge}>
                <Icon as={FiClock} style={{ marginRight: 6 }} ariaLabel="Morning grace" />{settings.morning_grace_minutes} min grace
              </span>
            </div>
            <div style={styles.settingRow}>
              <span style={styles.settingIcon}><Icon as={FiMoon} ariaLabel="Moon small" /></span>
              <span style={styles.settingLabel}>Afternoon:</span>
              <span style={styles.settingValue}>
                {settings.afternoon_start} – {settings.afternoon_end}
              </span>
              <span style={styles.graceBadge}>
                <FiClock style={{ marginRight: 6 }} />{settings.afternoon_grace_minutes} min grace
              </span>
            </div>
          </div>
        )}

        {/* Compact fullscreen settings overlay (visible in fullscreen) */}
        {isFullscreen && !hideSettingsCard && settings && validSettings && (
            <div style={styles.settingsOverlayFull}>
            <div style={styles.settingRowSmall}>
              <span style={{ marginRight: 6 }}><FiSun /></span>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 700, color: "#f8fafc" }}>Morning</div>
                <div style={{ color: "#e5e7eb", fontSize: 13 }}>{settings.morning_start} – {settings.morning_end} <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}><Icon as={FiClock} style={{ marginRight: 6 }} ariaLabel="Morning grace" />{settings.morning_grace_minutes}m</span></div>
              </div>
            </div>
            <div style={styles.settingRowSmall}>
              <span style={{ marginRight: 6 }}><Icon as={FiMoon} ariaLabel="Moon small" /></span>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 700, color: "#f8fafc" }}>Afternoon</div>
                <div style={{ color: "#e5e7eb", fontSize: 13 }}>{settings.afternoon_start} – {settings.afternoon_end} <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}><Icon as={FiClock} style={{ marginRight: 6 }} ariaLabel="Afternoon grace" />{settings.afternoon_grace_minutes}m</span></div>
              </div>
            </div>
          </div>
        )}

        {debugMode && (
          <div
            style={{ padding: "8px 16px", fontSize: "12px", color: "#062b6d" }}
          >
            <div>
              <strong>DEBUG — Top candidates</strong>
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                maxHeight: 120,
                overflow: "auto",
                margin: 0,
              }}
              id="face-debug-pre"
            >
              (waiting...)
            </pre>
          </div>
        )}

        {/* Error or missing settings messages */}
        {!validSettings && (
          <div style={styles.errorMessage}>
            <Icon as={FiAlertTriangle} style={{ marginRight: 8 }} ariaLabel="Work hour warning" />Work hour settings are missing or invalid
          </div>
        )}
        {cameraStatus === CAMERA_STATUS.ERROR && (
          <div style={styles.errorMessage}>{cameraError}</div>
        )}
      </div>
    </div>
  );
}

// Modern inline styles
const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    padding: "20px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  cameraCard: {
    width: "100%",
    height: "100%",
    maxWidth: "900px",
    backgroundColor: "#ffffff",
    borderRadius: "24px",
    boxShadow: "0 20px 40px rgba(0,0,0,0.08), 0 6px 12px rgba(0,0,0,0.05)",
    overflow: "hidden",
    transition: "box-shadow 0.3s ease",
  },
  cameraHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    backgroundColor: "#f9fafc",
    borderBottom: "1px solid #eef2f6",
  },
  cameraTitle: {
    fontSize: "1.2rem",
    fontWeight: 600,
    color: "#1e293b",
    letterSpacing: "-0.01em",
  },
  statusBadges: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: "30px",
    fontSize: "0.85rem",
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  badgeConnecting: {
    backgroundColor: "#e9f0ff",
    color: "#2563eb",
  },
  badgeLive: {
    backgroundColor: "#e6f7e6",
    color: "#16a34a",
  },
  badgeError: {
    backgroundColor: "#fee9e7",
    color: "#dc2626",
  },
  badgeLoading: {
    backgroundColor: "#fff3cd",
    color: "#b45309",
  },
  badgeScanning: {
    backgroundColor: "#e0f2fe",
    color: "#0284c7",
  },
  badgeVerifying: {
    backgroundColor: "#fef3c7",
    color: "#d97706",
  },
  clockBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: '12px',
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    fontWeight: 600,
    marginRight: '6px',
  },
  dots: {
    animation: "blink 1.4s infinite",
    display: "inline-block",
    width: "1.5em",
    textAlign: "left",
  },
  feedWrapper: {
    position: "relative",
    width: "100%",
    aspectRatio: "16/9",
    backgroundColor: "#0b1120",
  },
  containerFull: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    padding: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
    zIndex: 9999,
  },
  cameraCardFull: {
    width: "100%",
    height: "100%",
    maxWidth: "100%",
    borderRadius: 0,
    boxShadow: "none",
  },
  feedWrapperFull: {
    position: "relative",
    width: "100%",
    height: "calc(100vh - 72px)",
    backgroundColor: "#000000",
  },
  settingsOverlayFull: {
    position: "fixed",
    top: 12,
    left: 12,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "10px 12px",
    borderRadius: 12,
    zIndex: 2147483646,
    backdropFilter: "blur(6px)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
    minWidth: 220,
  },
  settingRowSmall: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
  },
  feed: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  overlayCanvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  overlayCanvasFull: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  settingsCard: {
    margin: "16px 24px 24px",
    padding: "18px 20px",
    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    borderRadius: "20px",
    border: "1px solid #e2e8f0",
  },
  settingRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    padding: "8px 0",
    borderBottom: "1px dashed #cbd5e1",
  },
  settingRowLast: {
    borderBottom: "none",
  },
  settingIcon: {
    fontSize: "1.3rem",
  },
  settingLabel: {
    fontWeight: 600,
    color: "#334155",
    minWidth: "75px",
  },
  settingValue: {
    color: "#0f172a",
    fontWeight: 500,
    background: "#ffffff",
    padding: "4px 12px",
    borderRadius: "30px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  graceBadge: {
    background: "#dbeafe",
    color: "#1e40af",
    padding: "4px 10px",
    borderRadius: "30px",
    fontSize: "0.8rem",
    fontWeight: 500,
    marginLeft: "auto",
  },
  errorMessage: {
    margin: "16px 24px 24px",
    padding: "12px 16px",
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    borderRadius: "12px",
    border: "1px solid #fecaca",
    fontSize: "0.95rem",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
};

// Add keyframes for blinking dots (injected via style tag)
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;
document.head.appendChild(styleSheet);
