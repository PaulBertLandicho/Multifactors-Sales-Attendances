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

function CameraPlayer({ onFaceScan, registrationActive = false }) {
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
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {useLocalCamera ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', maxWidth: '800px', backgroundColor: 'black' }}
        />
      ) : (
        <img
          ref={imgRef}
          alt="Camera Stream"
          onLoad={() => setFrameReady(imgRef.current?.naturalWidth > 0 && imgRef.current?.naturalHeight > 0)}
          style={{ width: '100%', maxWidth: '800px', backgroundColor: 'black' }}
        />
      )}
      <canvas
        ref={overlayCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {settings && validSettings && (
        <div style={{ background: '#e3f2fd', color: '#1565c0', marginTop: 10, padding: 8, borderRadius: 8 }}>
          <b>Morning:</b> {settings.morning_start} - {settings.morning_end}, Late: {settings.morning_grace_minutes} min<br/>
          <b>Afternoon:</b> {settings.afternoon_start} - {settings.afternoon_end}, Late: {settings.afternoon_grace_minutes} min
        </div>
      )}
      {!validSettings && <div style={{ color: '#ff6b6b', marginTop: 8 }}>Work hour settings missing/invalid</div>}
      {cameraStatus === CAMERA_STATUS.CONNECTING && <div style={{ color: '#fff' }}>Connecting to camera stream...</div>}
      {cameraStatus === CAMERA_STATUS.ERROR && <div style={{ color: '#ff6b6b' }}>{cameraError}</div>}
      {!modelsLoaded && <div style={{ color: '#fff' }}>Loading face recognition models...</div>}
      {scanning && !verifying && validSettings && <div style={{ color: '#0f0' }}>Scanning for faces...</div>}
      {verifying && validSettings && <div style={{ color: '#ff0' }}>Verifying face...</div>}
    </div>
  );
}

export default CameraPlayer;