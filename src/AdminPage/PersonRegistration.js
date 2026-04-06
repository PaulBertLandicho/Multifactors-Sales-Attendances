
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Swal from 'sweetalert2';
import RegistrationCamera from '../CameraAttendance/RegistrationCamera';

import PersonDetails from './PersonDetails';



export default function PersonRegistration() {
  const [countdown, setCountdown] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const modalTimerRef = useRef(null);

  // This handler will be called by CameraPlayer when a new face is detected (not in attendance DB)
  // Automatically trigger modal with scanPayload (including photoDataUrl) when a new face is detected
  const handleFaceScan = useCallback((scanPayload) => {
    // Defensive: ignore if already showing modal, pending scan, or missing payload
    if (!scanPayload || showModal || pendingScan) return;
    // Accept both plain arrays and typed arrays (Float32Array)
    if (!scanPayload.descriptor || !(Array.isArray(scanPayload.descriptor) || (scanPayload.descriptor && typeof scanPayload.descriptor.length === 'number')) || scanPayload.descriptor.length === 0) return;
    if (!scanPayload.photoDataUrl) {
      Swal.fire({
        icon: 'warning',
        title: 'No Photo Captured',
        text: 'Face scan did not include a photo. Please try again.',
        timer: 1800,
        showConfirmButton: false
      });
      return;
    }
    // Show a 3-second countdown before opening the modal
    setCountdown(3);
    let seconds = 3;
    const interval = setInterval(() => {
      seconds -= 1;
      setCountdown(seconds);
      if (seconds <= 0) {
        clearInterval(interval);
        setCountdown(0);
        setPendingScan(scanPayload);
        if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
        modalTimerRef.current = setTimeout(() => {
          setShowModal(true);
          modalTimerRef.current = null;
        }, 100); // minimal delay after countdown
      }
    }, 1000);
  }, [showModal, pendingScan]);

  const closeModal = () => {
    setShowModal(false);
    setPendingScan(null);
    if (modalTimerRef.current) {
      clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }
  };

  // Prevent background page from scrolling while the Person Details modal is open
  useEffect(() => {
    if (!showModal) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
      <h2>Person Registration</h2>
      {/* Countdown overlay */}
      {countdown > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 24,
            padding: '48px 64px',
            fontSize: '3rem',
            fontWeight: 700,
            color: '#10b981',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            border: '2px solid #10b981',
          }}>
            {countdown}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 18, minHeight: 380, background: '#0b1120', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
        <RegistrationCamera onFaceScan={handleFaceScan} disabled={showModal || countdown > 0} />
      </div>
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: 16, padding: 32, minWidth: 340, maxWidth: 600, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={closeModal} style={{ position: 'absolute', top: 12, right: 16, background: 'transparent', border: 'none', color: '#6b7280', fontSize: '1.8rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            <PersonDetails scanPayload={pendingScan} onComplete={closeModal} />
          </div>
        </div>
      )}
    </div>
  );
}