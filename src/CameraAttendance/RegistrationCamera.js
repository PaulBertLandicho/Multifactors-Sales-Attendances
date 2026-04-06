
import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js/build/commonjs/index.js';
import Swal from 'sweetalert2';

// RegistrationCamera: For registration only, supports Dahua stream or local webcam
import { supabase, SUPABASE_CONFIGURED } from '../supabaseClient';
import { toFloat32Array, normalizeDescriptor, euclideanDistance, averageDescriptors } from '../utils/faceUtils';

export default function RegistrationCamera({ onFaceScan, disabled }) {
    const [persons, setPersons] = useState([]);

    // Load persons with descriptors from Supabase
    useEffect(() => {
      async function loadPersons() {
          if (!SUPABASE_CONFIGURED || !supabase) {
            console.warn('Supabase not configured; skipping person load in RegistrationCamera.');
            return;
          }
          try {
            const { data, error } = await supabase.from('persons').select('id, name, descriptor, registration_photo');
            if (error) {
              console.error('Error loading persons for registration:', error);
              Swal.fire({ icon: 'error', title: 'Data Load Failed', text: 'Could not load persons from the database. Check Supabase configuration and network.' });
              return;
            }
            if (data) {
              setPersons(data.map(p => ({
                ...p,
                descriptor: p.descriptor
                  ? (Array.isArray(p.descriptor) && Array.isArray(p.descriptor[0])
                      ? averageDescriptors(p.descriptor)
                      : normalizeDescriptor(toFloat32Array(p.descriptor)))
                  : null,
              })));
            }
          } catch (err) {
            console.error('Exception loading persons:', err);
            Swal.fire({ icon: 'error', title: 'Data Load Error', text: 'Unexpected error while loading persons.' });
          }
        }
        loadPersons();
    }, []);
  // If REACT_APP_WS_URL is not set, skip WebSocket and go straight to local webcam.
  const wsUrl = (process.env.REACT_APP_WS_URL || '').trim() || null;
  const imgRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [useLocalCamera, setUseLocalCamera] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const wsRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const animationFrameRef = useRef();

  // Load face-api.js models
  useEffect(() => {
    async function loadModels() {
      const LOCAL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_URL),
      ]);
      setModelsLoaded(true);
    }
    loadModels();
  }, []);

  // Setup Dahua stream via WebSocket or fallback to webcam
  useEffect(() => {
    let disposed = false;
    setFrameReady(false);

    // If no WebSocket URL configured, immediately use local webcam.
    if (!wsUrl) {
      setUseLocalCamera(true);
      return () => {
        disposed = true;
        if (wsRef.current) wsRef.current.close();
      };
    }

    setUseLocalCamera(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const ws = new window.WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {};
    ws.onerror = () => {
      if (!disposed) {
        setUseLocalCamera(true);
      }
    };
    ws.onclose = () => {
      if (!disposed) {
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
      if (wsRef.current) wsRef.current.close();
    };
  }, [wsUrl]);

  // Fallback: Use local webcam if Dahua stream fails
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
        Swal.fire({
          icon: 'error',
          title: 'Camera Not Found',
          text: 'No camera device was found or access was denied. Please connect a camera and allow browser access.',
        });
      }
    }
    startLocalCamera();
    return () => {
      const videoEl = videoRef.current;
      if (videoEl) videoEl.srcObject = null;
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [useLocalCamera]);

  // Face detection loop
  useEffect(() => {
    if (!modelsLoaded || disabled) return;
    let isMounted = true;
    async function detect() {
      if (!isMounted) return;
      const source = useLocalCamera ? videoRef.current : imgRef.current;
      if (!source) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      // Ensure valid frame
      const isVideo = useLocalCamera;
      if (
        (!isVideo && (!source.complete || source.naturalWidth === 0)) ||
        (isVideo && source.readyState !== 4)
      ) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      // Detect face
      const detection = await faceapi
        .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      // Draw mesh — validate detection and box before drawing to avoid face-api errors
      const canvas = canvasRef.current;
      if (canvas && source) {
        canvas.width = isVideo ? source.videoWidth : source.naturalWidth;
        canvas.height = isVideo ? source.videoHeight : source.naturalHeight;

        const box = detection?.detection?.box;
        const boxValid = box && [box.x, box.y, box.width, box.height].every(v => typeof v === 'number' && !isNaN(v));

        if (detection && boxValid) {
          try {
            faceapi.draw.drawFaceLandmarks(canvas, detection);
          } catch (err) {
            // Defensive: log unexpected drawing errors and clear canvas
            console.warn('Error drawing face landmarks:', err);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        } else {
          // Nothing valid to draw — clear canvas
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      // If face detected, check for duplicate and send payload
      if (detection && detection.descriptor) {
        // Check for duplicate face (normalize both sides first)
        const newDesc = normalizeDescriptor(toFloat32Array(detection.descriptor));
        // Use a stricter threshold to avoid false positives
        // Lower value = stricter (fewer duplicates). Adjust if needed for your dataset.
        const FACE_MATCH_THRESHOLD = 0.35;
        // Compute distances to all stored descriptors and find best candidate
        const candidates = persons
          .filter(p => p.descriptor)
          .map(p => ({ p, dist: euclideanDistance(newDesc, p.descriptor) }))
          .sort((a, b) => a.dist - b.dist);

        const best = candidates.length ? candidates[0] : null;

        // Require a minimum margin between best and second-best to avoid ambiguous matches
        const second = candidates.length > 1 ? candidates[1] : null;
        const margin = second ? (second.dist - best.dist) : Infinity;

        console.log('REGISTRATION DEBUG: candidate distances=', candidates.map(c=>({id:c.p.id,name:c.p.name,dist:c.dist}))); 

        // Require a larger margin to avoid ambiguous near-matches
        const isConfidentDuplicate = best && best.dist < FACE_MATCH_THRESHOLD && margin >= 0.05 && best.p.registration_photo;

        if (isConfidentDuplicate) {
          // Prompt user — allow override to force new registration
          const res = await Swal.fire({
            icon: 'info',
            title: 'Possible Duplicate',
            html: `This face is similar to <strong>${best.p.name || 'a person'}</strong> (ID: ${best.p.id}) with distance <strong>${best.dist.toFixed(3)}</strong>.<br/>Registering a new person may create a duplicate.`,
            showCancelButton: true,
            confirmButtonText: 'Register Anyway',
            cancelButtonText: 'Cancel',
            focusCancel: true,
          });

          if (res.isConfirmed) {
            // Proceed with registration despite similarity
            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = canvas.width;
            frameCanvas.height = canvas.height;
            const ctx = frameCanvas.getContext('2d');
            ctx.drawImage(source, 0, 0, frameCanvas.width, frameCanvas.height);
            const photoDataUrl = frameCanvas.toDataURL('image/jpeg', 0.85);
            if (typeof onFaceScan === 'function') {
              onFaceScan({ descriptor: newDesc, photoDataUrl });
            }
          }
        } else {
          // Capture frame
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = canvas.width;
          frameCanvas.height = canvas.height;
          const ctx = frameCanvas.getContext('2d');
          ctx.drawImage(source, 0, 0, frameCanvas.width, frameCanvas.height);
          const photoDataUrl = frameCanvas.toDataURL('image/jpeg', 0.85);
          if (typeof onFaceScan === 'function') {
            onFaceScan({ descriptor: newDesc, photoDataUrl });
          }
        }
        // Pause detection until modal closes (handled by disabled prop)
      }
      animationFrameRef.current = requestAnimationFrame(detect);
    }
    animationFrameRef.current = requestAnimationFrame(detect);
    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [modelsLoaded, useLocalCamera, disabled, onFaceScan]);

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#0b1120' }}>
      {useLocalCamera ? (
        <video ref={videoRef} style={{ width: '100%', borderRadius: 12 }} autoPlay muted playsInline />
      ) : (
        <img ref={imgRef} alt="Camera Stream" onLoad={() => setFrameReady(true)} style={{ width: '100%', borderRadius: 12 }} />
      )}
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  );
}
