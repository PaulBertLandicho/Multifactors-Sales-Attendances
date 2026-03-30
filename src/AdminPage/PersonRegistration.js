
import React, { useState, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';
import CameraPlayer from '../CameraAttendance/CameraPlayer';

import PersonDetails from './PersonDetails';



export default function PersonRegistration() {
  const [showModal, setShowModal] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const modalTimerRef = useRef(null);

  // This handler will be called by CameraPlayer when a new face is detected (not in attendance DB)
  const handleFaceScan = useCallback((scanPayload) => {
    if (!scanPayload || showModal || pendingScan) return;
    setPendingScan(scanPayload);
    if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    modalTimerRef.current = setTimeout(() => {
      setShowModal(true);
      modalTimerRef.current = null;
    }, 1200);
  }, [showModal, pendingScan]);

  const closeModal = () => {
    setShowModal(false);
    setPendingScan(null);
    if (modalTimerRef.current) {
      clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
      <h2>Person Registration</h2>
      <div style={{ marginBottom: 18, minHeight: 380, background: '#0b1120', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
        {/* registrationActive is true only when modal is open, so mesh overlay and detection run normally otherwise */}
        <CameraPlayer onFaceScan={handleFaceScan} registrationActive={showModal} hideSettingsCard={true} />
      </div>
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, minWidth: 340, maxWidth: 600, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb', position: 'relative' }}>
            <button onClick={closeModal} style={{ position: 'absolute', top: 12, right: 16, background: 'transparent', border: 'none', color: '#6b7280', fontSize: '1.8rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            <PersonDetails scanPayload={pendingScan} onComplete={closeModal} />
          </div>
        </div>
      )}
    </div>
  );
}
