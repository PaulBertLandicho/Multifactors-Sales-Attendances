import React, { useState, useCallback, useRef, useEffect } from "react";

import Swal from "sweetalert2";
import RegistrationCamera from "../CameraAttendance/RegistrationCamera";
import PersonDetails from "./PersonDetails";
import { FiX } from "react-icons/fi";
import Icon from "../components/Icon";

// --- Voice sound assets (simple beep/notification) ---
const playVoice = (type = "info") => {
  const messages = {
    success: "Operation completed successfully",
    warning: "Warning. Please check your input",
    error: "Error occurred. Please try again",
    info: "Notification received",
  };

  try {
    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(
      messages[type] || messages.info
    );

    // 🌐 Language
    speech.lang = "en-US";

    // ⚙️ Voice settings
    speech.rate = 1; // speed (0.8–1.2 is natural)
    speech.pitch = 1; // tone (0–2)
    speech.volume = 1; // volume (0–1)

    // 🎤 Optional: Choose a better voice (if available)
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang === "en-US" && v.name.toLowerCase().includes("female")
    );
    if (preferredVoice) {
      speech.voice = preferredVoice;
    }

    window.speechSynthesis.speak(speech);
  } catch (err) {
    console.log("Voice error:", err);
  }
};

export default function PersonRegistration({ initialImageUrl = null }) {
  const [countdown, setCountdown] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const modalTimerRef = useRef(null);

  // This handler will be called by CameraPlayer when a new face is detected (not in attendance DB)
  // Automatically trigger modal with scanPayload (including photoDataUrl) when a new face is detected
  const handleFaceScan = useCallback(
    (scanPayload) => {
      // Defensive: ignore if already showing modal, pending scan, or missing payload
      if (!scanPayload || showModal || pendingScan) return;
      // Accept both plain arrays and typed arrays (Float32Array)
      if (
        !scanPayload.descriptor ||
        !(
          Array.isArray(scanPayload.descriptor) ||
          (scanPayload.descriptor &&
            typeof scanPayload.descriptor.length === "number")
        ) ||
        scanPayload.descriptor.length === 0
      )
        return;
      if (!scanPayload.photoDataUrl) {
        playVoice("warning");
        Swal.fire({
          icon: "warning",
          title: "No Photo Captured",
          text: "Face scan did not include a photo. Please try again.",
          timer: 1800,
          showConfirmButton: false,
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
    },
    [showModal, pendingScan]
  );

  const closeModal = () => {
    setShowModal(false);
    setPendingScan(null);
    if (modalTimerRef.current) {
      clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }
  };

  // If an initial static image URL is provided, open the registration modal
  useEffect(() => {
    if (initialImageUrl) {
      // create a minimal scanPayload with photo only
      const payload = { photoDataUrl: initialImageUrl, descriptor: null };
      setPendingScan(payload);
      setShowModal(true);
    }
    // only run on mount/when initialImageUrl changes
  }, [initialImageUrl]);

  // Ensure SweetAlert2 is displayed above this modal by increasing its z-index
  useEffect(() => {
    const styleId = "swal2-zindex-fix";
    if (document.getElementById(styleId)) return;
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = `
      .swal2-container, .swal2-backdrop, .swal2-popup {
        z-index: 100000 !important;
      }
    `;
    document.head.appendChild(s);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  // Prevent background page from scrolling while the Person Details modal is open
  useEffect(() => {
    if (!showModal) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Register Person Camera
</h1>
        <div style={styles.titleUnderline} />
        {/* <button
          style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 16, float: 'right' }}
          onClick={() => window.location.href = '/admin/released-history'}
        >
          Released History Payroll
        </button> */}
      </div>
      <div
        style={{
          maxWidth: 600,
          margin: "40px auto",
          padding: 24,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        }}
      >
        {/* Countdown overlay */}
        {countdown > 0 && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 110000,
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 24,
                padding: "48px 64px",
                fontSize: "3rem",
                fontWeight: 700,
                color: "#237227",
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                border: "2px solid #237227",
              }}
            >
              {countdown}
            </div>
          </div>
        )}
        <div
          style={{
            marginBottom: 8,
            minHeight: 380,
            background: "#0b1120",
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {cameraActive ? (
            <RegistrationCamera
              onFaceScan={handleFaceScan}
              disabled={showModal || countdown > 0}
            />
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#e5e7eb",
                padding: 16,
              }}
            >
              <div style={{ marginBottom: 12, fontSize: 14 }}>
                Camera is currently off.
              </div>
              <button
                type="button"
                onClick={() => setCameraActive(true)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "1px solid #4b5563",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Open Camera
              </button>
            </div>
          )}
        </div>
        {cameraActive && (
          <div style={{ marginBottom: 18, textAlign: "right" }}>
            <button
              type="button"
              onClick={() => setCameraActive(false)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                color: "#4b5563",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Close Camera
            </button>
          </div>
        )}
        {showModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              background: "rgba(0,0,0,0.5)",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                background: "#fff",
                borderRadius: 16,
                padding: 32,
                width: 600,
                maxWidth: "95vw",
                height: "80vh",
                maxHeight: "80vh",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                border: "1px solid #e5e7eb",
                overflowY: "auto",
              }}
            >
              <button
                onClick={closeModal}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 16,
                  background: "transparent",
                  border: "none",
                  color: "#6b7280",
                  fontSize: "1.8rem",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                <Icon as={FiX} size={22} ariaLabel="Close" />
              </button>
              <PersonDetails
                scanPayload={pendingScan}
                onComplete={closeModal}
                hidePersonTable
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "1600px",
    margin: "40px auto",
    padding: "10px 10px",
    color: "#1f2937",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    textAlign: "center",
    marginBottom: "40px",
  },
  title: {
    fontSize: "2.8rem",
    fontWeight: 700,
    color: "#1f2937",
    margin: 0,
    display: "inline-block",
  },
  titleUnderline: {
    height: "4px",
    width: "100px",
    background: "#237227",
    margin: "8px auto 0",
    borderRadius: "2px",
  },
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    marginBottom: "24px",
    padding: "20px 24px",
    backgroundColor: "#f9fafb",
    borderRadius: "20px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
  },
  filterGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
  },
  searchWrapper: {
    position: "relative",
  },
  searchInput: {
    padding: "12px 16px 12px 40px",
    fontSize: "0.95rem",
    borderRadius: "40px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#1f2937",
    outline: "none",
    transition: "all 0.2s",
    backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "16px center",
    backgroundSize: "16px",
    minWidth: "250px",
  },
  select: {
    padding: "12px 20px",
    fontSize: "0.95rem",
    borderRadius: "40px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#1f2937",
    outline: "none",
    cursor: "pointer",
    minWidth: "160px",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 28px",
    borderRadius: "40px",
    fontSize: "1rem",
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
  },
  buttonPrimary: {
    background: "#237227",
    color: "#ffffff",
  },

  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "1rem",
    color: "#6b7280",
  },

  viewButton: {
    padding: "6px 12px",
    borderRadius: "30px",
    border: "none",
    fontSize: "0.85rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    backgroundColor: "#e5e7eb",
    color: "#1f2937",
  },
  tableContainer: {
    borderRadius: "20px",
    overflow: "hidden",
    border: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
  },
  tableWrapper: {
    overflowX: "auto",
    maxHeight: "600px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.95rem",
    minWidth: "1200px",
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "#f9fafb",
    color: "#4b5563",
    fontWeight: 600,
    padding: "16px 12px",
    textAlign: "left",
    borderBottom: "2px solid #e5e7eb",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    fontSize: "0.8rem",
  },
  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #e5e7eb",
    color: "#1f2937",
  },
  tr: {
    transition: "background 0.2s",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#6b7280",
    fontSize: "1.1rem",
  },
  spinnerContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "300px",
    background: "#ffffff",
  },
  spinner: {
    width: "50px",
    height: "50px",
    border: "4px solid #e5e7eb",
    borderTop: "4px solid #237227",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};
