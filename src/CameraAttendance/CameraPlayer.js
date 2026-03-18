import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js/build/commonjs/index.js';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';
import { recordAttendanceForPerson } from '../AdminPage/attendanceUtils';

const DETECTION_INTERVAL_MS = 80;
const PERSON_COOLDOWN_MS = 1200;
const UNKNOWN_FACE_COOLDOWN_MS = 3500;
const BUFFER_SIZE = 2;
const TINY_DETECTOR_INPUT_SIZE = 320;
const CAMERA_STATUS = {
  CONNECTING: 'connecting',
  LIVE: 'live',
  ERROR: 'error',
};

// Global error handler
window.onerror = (msg, src, line, col, error) => {
  console.error('Global error:', msg, src, line, col, error);
  if (error && typeof error !== 'string') {
    Swal.fire({ icon: 'error', title: 'Runtime Error', text: error.message || String(error) });
  }
};

export default function CameraPlayer({ onFaceScan, registrationActive = false }) {
  const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:4000';
  const imgRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const videoRef = useRef(null); // For local webcam fallback
  const [currentTime, setCurrentTime] = useState(new Date());
  const [frameReady, setFrameReady] = useState(false);
  const wsRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [persons, setPersons] = useState([]);
  const [settings, setSettings] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [cameraStatus, setCameraStatus] = useState(CAMERA_STATUS.CONNECTING);
  const [cameraError, setCameraError] = useState('');
  const [useLocalCamera, setUseLocalCamera] = useState(false); // Fallback flag
  const lastScanRef = useRef({});
  const popupLockRef = useRef(null);
  const unknownFaceLockRef = useRef(false);
  const animationFrameRef = useRef();
  const lastDetectionTimeRef = useRef(0);
  const matchBufferRef = useRef([]);

  // ------------------- Helpers -------------------
  const toArray = (desc) => {
    if (!desc) return null;
    if (Array.isArray(desc)) return desc;
    if (desc.buffer && typeof desc.length === 'number') return Array.from(desc);
    return desc;
  };

  const captureCurrentFrame = useCallback(() => {
    if (useLocalCamera) {
      const video = videoRef.current;
      if (!video || video.readyState !== 4) return null;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    } else {
      const img = imgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    }
  }, [useLocalCamera]);

  const drawDetection = useCallback((detection) => {
    const canvas = overlayCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !detection || img.naturalWidth === 0 || img.naturalHeight === 0) return;

    // Guard: Only draw if detection box values are valid numbers
    if (!detection.box ||
        typeof detection.box.x !== 'number' ||
        typeof detection.box.y !== 'number' ||
        typeof detection.box.width !== 'number' ||
        typeof detection.box.height !== 'number' ||
        isNaN(detection.box.x) ||
        isNaN(detection.box.y) ||
        isNaN(detection.box.width) ||
        isNaN(detection.box.height)) {
      return;
    }

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
    faceapi.draw.drawDetections(canvas, [resized]);
    faceapi.draw.drawFaceLandmarks(canvas, [resized]);
  }, []);

  const cleanupWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const toMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const validSettings = settings &&
    settings.morning_start && settings.morning_end &&
    settings.afternoon_start && settings.afternoon_end &&
    !isNaN(Number(settings.morning_grace_minutes)) &&
    !isNaN(Number(settings.afternoon_grace_minutes));

  // ------------------- Load persons -------------------
  useEffect(() => {
    async function loadPersons() {
      if (!supabase) return;
      const { data, error } = await supabase.from('persons').select('id, name, department, descriptor');
      if (!error && data) {
        setPersons(data.map(p => ({ ...p, descriptor: toArray(p.descriptor) })));
      }
    }

    loadPersons();
    const subscription = supabase
      .channel('persons-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'persons' }, loadPersons)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'persons' }, loadPersons)
      .subscribe();
    return () => subscription.unsubscribe();
  }, []);

  // ------------------- Load settings -------------------
  useEffect(() => {
    async function loadSettings() {
      if (!supabase) return;
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (!error && data) setSettings(data);
    }
    loadSettings();
  }, []);

  // ------------------- Load models -------------------
  useEffect(() => {
    async function loadModels() {
      const LOCAL_URL = '/models';
      const CDN_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
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
          Swal.fire({ icon: 'error', title: 'Model Loading Failed', text: 'Face recognition models could not be loaded.' });
        }
      }
    }
    loadModels();
  }, []);

  // ------------------- WebSocket -------------------
  useEffect(() => {
    let disposed = false;
    setCameraStatus(CAMERA_STATUS.CONNECTING);
    setCameraError('');
    cleanupWs();
    setUseLocalCamera(false);
    const ws = new window.WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { if (!disposed) setCameraStatus(CAMERA_STATUS.LIVE); };
    ws.onerror = () => {
      if (!disposed) {
        setCameraStatus(CAMERA_STATUS.ERROR);
        setCameraError('WebSocket connection error. Switching to local camera...');
        setUseLocalCamera(true);
      }
    };
    ws.onclose = () => {
      if (!disposed) {
        setCameraStatus(CAMERA_STATUS.ERROR);
        setCameraError('WebSocket closed. Switching to local camera...');
        setUseLocalCamera(true);
      }
    };
    ws.onmessage = (event) => { if (!disposed && imgRef.current) { setFrameReady(false); imgRef.current.src = event.data; }};

    return () => { disposed = true; cleanupWs(); };
  }, [wsUrl, cleanupWs]);
  // Fallback: Use local webcam if WebSocket fails
  useEffect(() => {
    if (!useLocalCamera) return;
    let stream = null;
    async function startLocalCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setFrameReady(true);
          };
        }
      } catch (err) {
        setCameraError('Unable to access local webcam.');
      }
    }
    startLocalCamera();
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [useLocalCamera]);

  // ------------------- Detection loop -------------------
  useEffect(() => {
    if (!modelsLoaded || !validSettings) return;

    const detect = async () => {
      const img = imgRef.current;
      const canvas = overlayCanvasRef.current;
      const now = Date.now();

      if (!img || !frameReady || cooldown || registrationActive || cameraStatus !== CAMERA_STATUS.LIVE) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      if (now - lastDetectionTimeRef.current < DETECTION_INTERVAL_MS) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectionTimeRef.current = now;

      try {
        const detectionOptions = new faceapi.TinyFaceDetectorOptions({
          inputSize: TINY_DETECTOR_INPUT_SIZE,
          scoreThreshold: 0.45,
        });

        const fullDetection = await faceapi.detectSingleFace(img, detectionOptions)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (fullDetection) {
          // --- FIX: Validate detection box to avoid face-api errors ---
          const box = fullDetection.detection?.box || fullDetection.box;
          if (!box || 
              typeof box.x !== 'number' || 
              typeof box.y !== 'number' || 
              typeof box.width !== 'number' || 
              typeof box.height !== 'number' ||
              isNaN(box.x) || isNaN(box.y) || isNaN(box.width) || isNaN(box.height)) {
            // Invalid detection, skip
            console.warn('Skipping detection with invalid box:', box);
            if (overlayCanvasRef.current) {
              overlayCanvasRef.current.getContext('2d')?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
            }
            matchBufferRef.current = [];
            setVerifying(false);
            animationFrameRef.current = requestAnimationFrame(detect);
            return;
          }
          // -------------------------------------------------------------

          drawDetection(fullDetection);
          const alignedDescriptor = toArray(fullDetection.descriptor);

          let bestMatch = null;
          let bestDist = Infinity;
          for (const p of persons) {
            if (!p.descriptor) continue;
            const dist = faceapi.euclideanDistance(alignedDescriptor, p.descriptor);
            if (dist < bestDist) { bestDist = dist; bestMatch = p; }
          }

          const FACE_MATCH_THRESHOLD = 0.7;
          const currentPersonId = bestMatch && bestDist < FACE_MATCH_THRESHOLD ? bestMatch.id : 'unknown';
          matchBufferRef.current.push(currentPersonId);
          if (matchBufferRef.current.length > BUFFER_SIZE) matchBufferRef.current.shift();
          const allSame = matchBufferRef.current.length === BUFFER_SIZE &&
                          matchBufferRef.current.every(id => id === currentPersonId);
          if (!allSame) { setVerifying(true); animationFrameRef.current = requestAnimationFrame(detect); return; }

          setVerifying(false);
          const lastScan = lastScanRef.current[currentPersonId] || 0;
          if (now - lastScan < PERSON_COOLDOWN_MS) { animationFrameRef.current = requestAnimationFrame(detect); return; }

          if (bestMatch && bestDist < FACE_MATCH_THRESHOLD) {
            lastScanRef.current[currentPersonId] = now;
            setCooldown(true);
            const scanPayload = {
              descriptor: alignedDescriptor,
              photoDataUrl: captureCurrentFrame(),
              deviceTime: new Date().toISOString()
            };

            // Correctly handle attendance recording with success/error alerts
            recordAttendanceForPerson({
              supabase,
              person: bestMatch,
              settings,
              scanPayload,
              method: 'face-scan'
            })
              .then(result => {
                if (result.inserted) {
                  let message = '';
                  if (result.event === 'time-in') {
                    message = `Time-in recorded as ${result.status}.`;
                  } else if (result.event === 'time-out') {
                    message = `Time-out recorded as ${result.status}.`;
                  } else {
                    message = `Attendance recorded: ${result.event} (${result.status})`;
                  }

                  Swal.fire({
                    icon: 'success',
                    title: 'Attendance Recorded',
                    text: message,
                    timer: 3000,
                    showConfirmButton: false
                  });
                } else if (result.blocked) {
                  Swal.fire({
                    icon: 'warning',
                    title: 'Attendance Not Recorded',
                    text: result.message,
                    timer: 3000,
                    showConfirmButton: false
                  });
                }
              })
              .catch(error => {
                Swal.fire({
                  icon: 'error',
                  title: 'Attendance Error',
                  text: error.message
                });
              })
              .finally(() => setCooldown(false));
          } else if (!registrationActive && !unknownFaceLockRef.current && now - (lastScanRef.current.unknown || 0) > UNKNOWN_FACE_COOLDOWN_MS) {
            lastScanRef.current.unknown = now;
            unknownFaceLockRef.current = true;
            matchBufferRef.current = [];
            setCooldown(true);
            const scanPayload = { descriptor: alignedDescriptor, photoDataUrl: captureCurrentFrame(), deviceTime: new Date().toISOString() };
            if (onFaceScan) onFaceScan(scanPayload);
            Swal.fire({ icon: 'info', title: 'New person detected', text: 'Face not enrolled yet.', showConfirmButton: false, timer: 2200 });
            setTimeout(() => setCooldown(false), 1200);
          }
        } else {
          if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          matchBufferRef.current = [];
          setVerifying(false);
        }

      } catch (err) {
        console.error('Detection error:', err);
        Swal.fire({ icon: 'error', title: 'Detection Error', text: err.message || String(err) });
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    setScanning(true);
    animationFrameRef.current = requestAnimationFrame(detect);
    return () => { setScanning(false); cancelAnimationFrame(animationFrameRef.current); };
  }, [modelsLoaded, validSettings, frameReady, cooldown, registrationActive, cameraStatus, persons, drawDetection, captureCurrentFrame, onFaceScan]);

  // ------------------- Update current time -------------------
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ------------------- Reset registration state -------------------
  useEffect(() => {
    if (!registrationActive) { unknownFaceLockRef.current = false; matchBufferRef.current = []; setVerifying(false); }
  }, [registrationActive]);

  // ------------------- Render -------------------
 return (
    <div style={styles.container}>
      {/* Camera card */}
      <div style={styles.cameraCard}>
        <div style={styles.cameraHeader}>
          <span style={styles.cameraTitle}>📷 Live Feed</span>
          <div style={styles.statusBadges}>
            {cameraStatus === CAMERA_STATUS.CONNECTING && (
              <span style={{ ...styles.badge, ...styles.badgeConnecting }}>
                ⏳ Connecting...
              </span>
            )}
            {cameraStatus === CAMERA_STATUS.LIVE && (
              <span style={{ ...styles.badge, ...styles.badgeLive }}>
                ● Live
              </span>
            )}
            {cameraStatus === CAMERA_STATUS.ERROR && (
              <span style={{ ...styles.badge, ...styles.badgeError }}>
                ⚠️ Error
              </span>
            )}
            {!modelsLoaded && (
              <span style={{ ...styles.badge, ...styles.badgeLoading }}>
                🔄 Loading models
              </span>
            )}
            {modelsLoaded && scanning && !verifying && validSettings && (
              <span style={{ ...styles.badge, ...styles.badgeScanning }}>
                👤 Scanning
              </span>
            )}
            {verifying && validSettings && (
              <span style={{ ...styles.badge, ...styles.badgeVerifying }}>
                🔍 Verifying<span style={styles.dots}>...</span>
              </span>
            )}
          </div>
        </div>

        {/* Camera feed area */}
        <div style={styles.feedWrapper}>
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
              onLoad={() => setFrameReady(imgRef.current?.naturalWidth > 0 && imgRef.current?.naturalHeight > 0)}
              style={styles.feed}
            />
          )}
          <canvas
            ref={overlayCanvasRef}
            style={styles.overlayCanvas}
          />
        </div>

        {/* Settings info card */}
        {settings && validSettings && (
          <div style={styles.settingsCard}>
            <div style={styles.settingRow}>
              <span style={styles.settingIcon}>🌅</span>
              <span style={styles.settingLabel}>Morning:</span>
              <span style={styles.settingValue}>
                {settings.morning_start} – {settings.morning_end}
              </span>
              <span style={styles.graceBadge}>
                ⏱️ {settings.morning_grace_minutes} min grace
              </span>
            </div>
            <div style={styles.settingRow}>
              <span style={styles.settingIcon}>☀️</span>
              <span style={styles.settingLabel}>Afternoon:</span>
              <span style={styles.settingValue}>
                {settings.afternoon_start} – {settings.afternoon_end}
              </span>
              <span style={styles.graceBadge}>
                ⏱️ {settings.afternoon_grace_minutes} min grace
              </span>
            </div>
          </div>
        )}

        {/* Error or missing settings messages */}
        {!validSettings && (
          <div style={styles.errorMessage}>
            ⚠️ Work hour settings are missing or invalid
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
    display: 'flex',
    justifyContent: 'center',
    padding: '20px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  cameraCard: {
    width: '100%',
    maxWidth: '900px',
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.08), 0 6px 12px rgba(0,0,0,0.05)',
    overflow: 'hidden',
    transition: 'box-shadow 0.3s ease',
  },
  cameraHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#f9fafc',
    borderBottom: '1px solid #eef2f6',
  },
  cameraTitle: {
    fontSize: '1.2rem',
    fontWeight: 600,
    color: '#1e293b',
    letterSpacing: '-0.01em',
  },
  statusBadges: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: '30px',
    fontSize: '0.85rem',
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  badgeConnecting: {
    backgroundColor: '#e9f0ff',
    color: '#2563eb',
  },
  badgeLive: {
    backgroundColor: '#e6f7e6',
    color: '#16a34a',
  },
  badgeError: {
    backgroundColor: '#fee9e7',
    color: '#dc2626',
  },
  badgeLoading: {
    backgroundColor: '#fff3cd',
    color: '#b45309',
  },
  badgeScanning: {
    backgroundColor: '#e0f2fe',
    color: '#0284c7',
  },
  badgeVerifying: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
  },
  dots: {
    animation: 'blink 1.4s infinite',
    display: 'inline-block',
    width: '1.5em',
    textAlign: 'left',
  },
  feedWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    backgroundColor: '#0b1120',
  },
  feed: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  overlayCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  settingsCard: {
    margin: '16px 24px 24px',
    padding: '18px 20px',
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    borderRadius: '20px',
    border: '1px solid #e2e8f0',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    padding: '8px 0',
    borderBottom: '1px dashed #cbd5e1',
  },
  settingRowLast: {
    borderBottom: 'none',
  },
  settingIcon: {
    fontSize: '1.3rem',
  },
  settingLabel: {
    fontWeight: 600,
    color: '#334155',
    minWidth: '75px',
  },
  settingValue: {
    color: '#0f172a',
    fontWeight: 500,
    background: '#ffffff',
    padding: '4px 12px',
    borderRadius: '30px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  graceBadge: {
    background: '#dbeafe',
    color: '#1e40af',
    padding: '4px 10px',
    borderRadius: '30px',
    fontSize: '0.8rem',
    fontWeight: 500,
    marginLeft: 'auto',
  },
  errorMessage: {
    margin: '16px 24px 24px',
    padding: '12px 16px',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderRadius: '12px',
    border: '1px solid #fecaca',
    fontSize: '0.95rem',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
};

// Add keyframes for blinking dots (injected via style tag)
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;
document.head.appendChild(styleSheet);

