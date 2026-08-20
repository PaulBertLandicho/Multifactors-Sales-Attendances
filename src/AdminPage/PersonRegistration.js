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
    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(
      messages[type] || messages.info
    );

    speech.lang = "en-US";
    speech.rate = 1;
    speech.pitch = 1;
    speech.volume = 1;

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

  const handleFaceScan = useCallback(
    (scanPayload) => {
      if (!scanPayload || showModal || pendingScan) return;
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
          }, 100);
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

  useEffect(() => {
    if (initialImageUrl) {
      const payload = { photoDataUrl: initialImageUrl, descriptor: null };
      setPendingScan(payload);
      setShowModal(true);
    }
  }, [initialImageUrl]);

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

  useEffect(() => {
    if (!showModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  return (
    <div className="max-w-[1600px] mx-auto my-10 px-2.5 py-2.5 text-gray-800 font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-[2.8rem] font-bold text-gray-800 m-0 inline-block">
          Register Person Camera
        </h1>
        <div className="h-1 w-24 bg-[#237227] mx-auto mt-2 rounded-sm" />
      </div>

      {/* Main Container Card */}
      <div className="max-w-[600px] mx-auto my-10 p-6 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
        {/* Countdown overlay */}
        {countdown > 0 && (
          <div className="fixed inset-0 w-screen h-screen bg-black/45 flex items-center justify-center z-[110000]">
            <div className="bg-white rounded-3xl px-16 py-12 text-5xl font-bold text-[#237227] shadow-[0_8px_32px_rgba(0,0,0,0.18)] border-2 border-[#237227]">
              {countdown}
            </div>
          </div>
        )}

        {/* Camera View Area */}
        <div className="mb-2 min-h-[380px] bg-[#0b1120] rounded-xl overflow-hidden relative">
          {cameraActive ? (
            <RegistrationCamera
              onFaceScan={handleFaceScan}
              disabled={showModal || countdown > 0}
            />
          ) : (
            <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-gray-200 p-4">
              <div className="mb-3 text-sm">
                Camera is currently off.
              </div>
              <button
                type="button"
                onClick={() => setCameraActive(true)}
                className="px-4 py-2 rounded-full border border-gray-600 bg-gray-900 text-gray-200 cursor-pointer text-[13px] hover:bg-gray-800 transition-colors"
              >
                Open Camera
              </button>
            </div>
          )}
        </div>

        {/* Camera Toggle Button */}
        {cameraActive && (
          <div className="mb-4 text-right">
            <button
              type="button"
              onClick={() => setCameraActive(false)}
              className="px-3 py-1.5 rounded-full border border-gray-300 bg-gray-50 text-gray-600 cursor-pointer text-xs hover:bg-gray-100 transition-colors"
            >
              Close Camera
            </button>
          </div>
        )}

        {/* Registration Modal */}
        {showModal && (
          <div className="fixed inset-0 w-screen h-screen bg-black/50 z-[1000]">
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-8 w-[600px] max-w-[95vw] h-[80vh] max-h-[80vh] shadow-[0_20px_40px_rgba(0,0,0,0.2)] border border-gray-200 overflow-y-auto">
              <button
                onClick={closeModal}
                className="absolute top-3 right-4 bg-transparent border-none text-gray-500 text-[1.8rem] cursor-pointer leading-none hover:text-gray-800 transition-colors"
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
