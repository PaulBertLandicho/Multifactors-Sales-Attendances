import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import {
  FiDownload,
  FiArchive,
  FiEdit,
  FiBriefcase,
  FiPhone,
  FiMail,
  FiUserPlus,
  FiPlusCircle,
} from "react-icons/fi";
import PersonRegistration from "./PersonRegistration";
import { determineAttendanceStatus } from "./attendanceUtils";

export default function PersonsTable() {
  const [showCamera, setShowCamera] = useState(false);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const adminLastLocationRef = useRef({ point: "Location unavailable", ts: 0 });

  const buildLocationResult = (point, status, message) => ({ point, status, message });

  const requestBrowserLocation = () => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => resolve({ error }),
      {
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 0,
      },
    );
  });

  const getCurrentLocationPoint = async () => {
    const now = Date.now();
    if (adminLastLocationRef.current?.point && now - (adminLastLocationRef.current.ts || 0) < 60 * 1000) {
      return buildLocationResult(adminLastLocationRef.current.point, "ok", "Using cached location.");
    }

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
        const lat = latNum.toFixed(6);
        const lng = lngNum.toFixed(6);
        const accuracy = Number(position.coords.accuracy || 0);

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
              locationResult = buildLocationResult(uniqueParts.join(", "), "ok", accuracy && accuracy > 250 ? `Location detected, but GPS accuracy is about ${Math.round(accuracy)} meters.` : "Location detected.");
              break;
            }
            if (data?.display_name) {
              locationResult = buildLocationResult(String(data.display_name), "ok", accuracy && accuracy > 250 ? `Location detected, but GPS accuracy is about ${Math.round(accuracy)} meters.` : "Location detected.");
              break;
            }
          }
        } catch (e) {}

        if (!locationResult) {
          locationResult = buildLocationResult(
            `Coordinates: ${lat}, ${lng}`,
            "ok",
            accuracy && accuracy > 250 ? `Location detected, but GPS accuracy is about ${Math.round(accuracy)} meters.` : "Location detected.",
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
      adminLastLocationRef.current = { point: locationResult.point, ts: now };
    }
    return locationResult;
  };

  useEffect(() => {
    const initialVideoRef = cameraVideoRef.current;
    if (showCamera) {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (initialVideoRef) {
            initialVideoRef.srcObject = stream;
            cameraStreamRef.current = stream;
          }
        } catch (err) {
          showModalAlert({ title: "Camera Error", text: "Unable to access camera.", icon: "error" });
          setShowCamera(false);
        }
      })();
    } else {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks &&
          cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      if (initialVideoRef) {
        initialVideoRef.srcObject = null;
      }
    }
    return () => {
      const localStream = cameraStreamRef.current;
      if (localStream) {
        localStream.getTracks &&
          localStream.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      if (initialVideoRef) {
        initialVideoRef.srcObject = null;
      }
    };
  }, [showCamera]);

  const handleCapturePhoto = () => {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setEditPerson((prev) => ({ ...prev, registration_photo: dataUrl }));
    setShowCamera(false);
  };

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey] = useState("created_at");
  const [sortOrder] = useState("desc");
  const [showArchived, setShowArchived] = useState(false);
  const [persons, setPersons] = useState([]);
  const [photoModal, setPhotoModal] = useState({ visible: false, src: "", title: "" });
  const [payrollMap, setPayrollMap] = useState({});
  const [payrollGrossMap, setPayrollGrossMap] = useState({});
  const [presenceMap, setPresenceMap] = useState({});
  const [departments, setDepartments] = useState([]);
  const [showRegModal, setShowRegModal] = useState(false);
  const [regModalImage, setRegModalImage] = useState(null);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPerson, setEditPerson] = useState(null);
  const [editCashAdvances, setEditCashAdvances] = useState([]);
  const [loadingCashAdvances, setLoadingCashAdvances] = useState(false);
  const [newCashAmount, setNewCashAmount] = useState("");
  const [newCashNote, setNewCashNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const editPhotoInputRef = useRef(null);
  const [adminModal, setAdminModal] = useState({ visible: false, person: null, event: "time-in", datetime: "", photo: null, note: "", point: null, locationStatus: null, locationMessage: "" });

  const showToast = (title, icon = "success") => {
    Swal.fire({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 2000,
      icon,
      title,
      customClass: {
        popup: "!rounded-2xl !shadow-[0_10px_25px_rgba(0,0,0,0.1)] !border !border-gray-100 !px-4 !py-2.5 !w-auto !inline-flex !items-center !gap-2.5 font-sans",
        title: "!text-sm !font-semibold !text-gray-800 !m-0 !whitespace-nowrap",
      },
    });
  };

  const showModalAlert = ({ title, text, icon = "success", confirmText = "OK" }) => {
    Swal.fire({
      icon,
      title,
      text,
      width: "360px",
      padding: "1.5rem",
      confirmButtonText: confirmText,
      confirmButtonColor: "#237227",
      iconColor: icon === "success" ? "#237227" : icon === "error" ? "#ef4444" : "#f59e0b",
      customClass: {
        popup: "!rounded-[24px] !shadow-2xl !border !border-gray-100 font-sans",
        title: "!text-lg !font-bold !text-gray-800 !mt-2",
        htmlContainer: "!text-xs !text-gray-500 !mt-1",
        icon: "!scale-75 !my-2",
        confirmButton: "!px-8 !py-2.5 !min-w-[110px] !rounded-lg !font-semibold !text-sm cursor-pointer !shadow-[0_4px_10px_rgba(35,114,39,0.3)] !bg-[#237227] hover:!bg-[#1a5a1d] !text-white !border-none",
      },
      buttonsStyling: false,
    });
  };

  const Icons = {
    download: <FiDownload color="#ffffff" className="mr-2 inline" />,
    archive: <FiArchive className="inline" />,
    edit: <FiEdit color="#ffffff" className="mr-2 inline" />,
    add: <FiUserPlus color="#ffffff" className="mr-2 inline" />,
    circle: <FiPlusCircle color="#ffffff" className="mr-0 inline" />,
  };

  useEffect(() => {
    async function fetchPersons() {
      if (!supabase) {
        setError(
          "Supabase client not configured. Check REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your environment.",
        );
        return;
      }
      try {
        setError(null);
        const { data, error: err } = await supabase.from("persons").select("*");
        if (err) throw err;
        const list = data || [];
        setPersons(list);

        try {
          const ids = list.map((p) => p.id).filter(Boolean);
          if (ids.length) {
            const [activeRes, historyRes] = await Promise.all([
              supabase
                .from("payroll_periods")
                .select("person_id, net, gross, period")
                .in("person_id", ids)
                .order("period", { ascending: false }),
              supabase
                .from("payroll_released_history")
                .select("person_id, net, gross, period")
                .in("person_id", ids)
                .order("period", { ascending: false }),
            ]);

            const payrolls = [
              ...(Array.isArray(activeRes.data) ? activeRes.data : []),
              ...(Array.isArray(historyRes.data) ? historyRes.data : []),
            ];
            const map = {};
            const gmap = {};
            for (const pr of payrolls) {
              if (!map[pr.person_id]) map[pr.person_id] = pr.net || 0;
              if (!gmap[pr.person_id]) gmap[pr.person_id] = pr.gross || 0;
            }
            setPayrollMap(map);
            setPayrollGrossMap(gmap);

            try {
              const start = new Date();
              start.setHours(0, 0, 0, 0);
              const end = new Date();
              end.setHours(23, 59, 59, 999);
              const { data: atts, error: attErr } = await supabase
                .from("attendance")
                .select("person_id, event, device_time")
                .in("person_id", ids)
                .gte("device_time", start.toISOString())
                .lte("device_time", end.toISOString());
              if (!attErr && Array.isArray(atts)) {
                const pmap = {};
                atts.forEach((r) => {
                  const pid = r.person_id;
                  if (!pmap[pid])
                    pmap[pid] = {
                      morning: false,
                      afternoon: false,
                      firstScan: null,
                    };
                  try {
                    const dt = new Date(r.device_time);
                    const hour = dt.getHours();
                    if ((r.event || "").toLowerCase() === "time-in") {
                      if (hour < 12) pmap[pid].morning = true;
                      else pmap[pid].afternoon = true;
                    }
                    if (!pmap[pid].firstScan)
                      pmap[pid].firstScan = dt.toISOString();
                    else {
                      const existing = new Date(pmap[pid].firstScan);
                      if (dt.getTime() < existing.getTime())
                        pmap[pid].firstScan = dt.toISOString();
                    }
                  } catch (e) {}
                });
                Object.keys(pmap).forEach((k) => {
                  pmap[k].present = !!(pmap[k].morning || pmap[k].afternoon);
                });
                setPresenceMap(pmap);

                try {
                  const { data: deptData, error: deptErr } = await supabase
                    .from("department_rates")
                    .select("department");
                  if (!deptErr && Array.isArray(deptData)) {
                    const uniq = Array.from(
                      new Set(
                        deptData.map((d) => d.department).filter(Boolean),
                      ),
                    );
                    setDepartments(uniq);
                  }
                } catch (e) {}
              }
            } catch (e) {}
          }
        } catch (e) {}
      } catch (err) {
        setError(err.message || "Failed to load persons.");
      }
    }
    fetchPersons();
    const interval = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) fetchPersons(); }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleEdit = (person) => {
    setEditPerson({ ...person });
    setShowEditModal(true);
  };

  const editPersonId = editPerson && editPerson.id ? editPerson.id : null;

  useEffect(() => {
    let mounted = true;
    async function loadCashAdvances() {
      if (!showEditModal || !editPersonId) {
        setEditCashAdvances([]);
        return;
      }
      setLoadingCashAdvances(true);
      try {
        const { data, error } = await supabase
          .from("cash_advances")
          .select("id, amount, note, created_at")
          .eq("person_id", editPersonId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (!mounted) return;
        if (error) {
          console.error("Error fetching cash advances:", error);
          setEditCashAdvances([]);
        } else {
          setEditCashAdvances(data || []);
        }
      } catch (e) {
        console.error(e);
        if (mounted) setEditCashAdvances([]);
      } finally {
        if (mounted) setLoadingCashAdvances(false);
      }
    }
    loadCashAdvances();
    return () => {
      mounted = false;
    };
  }, [showEditModal, editPersonId]);

  const refreshCashAdvances = async () => {
    if (!editPerson || !editPerson.id) return;
    setLoadingCashAdvances(true);
    try {
      const { data, error } = await supabase
        .from("cash_advances")
        .select("id, amount, note, created_at")
        .eq("person_id", editPerson.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setEditCashAdvances(data || []);
    } catch (e) {
      console.error("refreshCashAdvances error", e);
      setEditCashAdvances([]);
    } finally {
      setLoadingCashAdvances(false);
    }
  };

  const computeAndUpdatePersonCashAdvance = async () => {
    if (!editPerson || !editPerson.id) return;
    try {
      const { data: rows, error } = await supabase
        .from("cash_advances")
        .select("amount")
        .eq("person_id", editPerson.id);
      if (error) throw error;
      const total = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      setEditPerson((p) => (p ? { ...p, cash_advance: total } : p));
      setPersons((prev) =>
        prev.map((p) =>
          p.id === editPerson.id ? { ...p, cash_advance: total } : p,
        ),
      );
    } catch (e) {
      console.error("computeAndUpdatePersonCashAdvance", e);
    }
  };

  const addCashAdvance = async () => {
    if (!editPerson || !editPerson.id) return;
    const amt = Number(newCashAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      showModalAlert({
        title: "Invalid Amount",
        text: "Please enter a positive cash advance amount.",
        icon: "warning",
      });
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("cash_advances")
        .insert({
          person_id: editPerson.id,
          amount: amt,
          note: newCashNote || null,
        })
        .select()
        .single();
      if (error) throw error;
      await refreshCashAdvances();
      await computeAndUpdatePersonCashAdvance();
      setNewCashAmount("");
      setNewCashNote("");
      showToast("Cash advance recorded successfully!");
    } catch (e) {
      console.error(e);
      showModalAlert({ title: "Error", text: e.message || String(e), icon: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const deleteCashAdvance = async (id) => {
    if (!id) return;
    const res = await Swal.fire({
      title: "Delete entry?",
      text: "This will remove the cash advance record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#ffffff",
      customClass: {
        popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[380px] font-sans",
        title: "!text-gray-800 !text-[1.35rem] !font-bold !mt-2",
        confirmButton: "!bg-[#ef4444] hover:!bg-[#dc2626] !text-white !font-semibold !rounded-lg !px-8 !py-2.5 !text-sm !border-none cursor-pointer",
        cancelButton: "!bg-white !text-gray-700 !font-semibold !rounded-lg !px-8 !py-2.5 !text-sm !border !border-gray-300 cursor-pointer",
      },
      buttonsStyling: false,
    });
    if (!res.isConfirmed) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("cash_advances")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await refreshCashAdvances();
      await computeAndUpdatePersonCashAdvance();
      showToast("Cash advance removed successfully!");
    } catch (e) {
      console.error(e);
      showModalAlert({ title: "Error", text: e.message || String(e), icon: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async (person) => {
    Swal.fire({
      title: "Archive Person",
      html: `<div class="text-gray-600 text-sm mt-2">Are you sure you want to archive <b class="text-gray-800">${
        person.name || person.id
      }</b>?</div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Archive",
      confirmButtonColor: "#237227",
      cancelButtonColor: "#ffffff",
      customClass: {
        popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[400px] font-sans",
        title: "!text-gray-800 !text-[1.35rem] !font-bold !mt-2",
        actions: "!flex !items-center !justify-center !gap-4 !mt-6 !w-full",
        confirmButton: "!bg-[#237227] hover:!bg-[#1a5a1d] !text-white !font-semibold !rounded-lg !px-6 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]",
        cancelButton: "!bg-white !border !border-gray-300 !text-gray-700 !font-semibold !rounded-lg !px-6 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]",
      },
      buttonsStyling: false,
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { error: archErr } = await supabase
          .from("persons")
          .update({ archived: true })
          .eq("id", person.id);
        if (archErr) {
          showModalAlert({ title: "Error", text: archErr.message, icon: "error" });
        } else {
          setPersons((prev) =>
            prev.map((p) =>
              p.id === person.id ? { ...p, archived: true } : p,
            ),
          );
          showToast("Person archived successfully!");
        }
      }
    });
  };

  const handleRestore = async (person) => {
    Swal.fire({
      title: "Restore Person",
      html: `<div class="text-gray-600 text-sm mt-2">Are you sure you want to restore <b class="text-gray-800">${
        person.name || person.id
      }</b>?</div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Restore",
      confirmButtonColor: "#237227",
      cancelButtonColor: "#ffffff",
      customClass: {
        popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[400px] font-sans",
        title: "!text-gray-800 !text-[1.35rem] !font-bold !mt-2",
        actions: "!flex !items-center !justify-center !gap-4 !mt-6 !w-full",
        confirmButton: "!bg-[#237227] hover:!bg-[#1a5a1d] !text-white !font-semibold !rounded-lg !px-6 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]",
        cancelButton: "!bg-white !border !border-gray-300 !text-gray-700 !font-semibold !rounded-lg !px-6 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]",
      },
      buttonsStyling: false,
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { error: restErr } = await supabase
          .from("persons")
          .update({ archived: false })
          .eq("id", person.id);
        if (restErr) {
          showModalAlert({ title: "Error", text: restErr.message, icon: "error" });
        } else {
          setPersons((prev) =>
            prev.map((p) =>
              p.id === person.id ? { ...p, archived: false } : p,
            ),
          );
          showToast("Person restored successfully!");
        }
      }
    });
  };

  const handleAdminAttendance = async (person) => {
    if (!person || !person.id) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const localIsoForInput = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setLocLoading(true);
    try {
      const locationResult = adminModal.point ? { point: adminModal.point, status: adminModal.locationStatus || "ok", message: adminModal.locationMessage || "" } : await getCurrentLocationPoint();
      setAdminModal({ visible: true, person, event: "time-in", datetime: localIsoForInput, photo: person.registration_photo || null, note: "", point: locationResult.point, locationStatus: locationResult.status, locationMessage: locationResult.message });
    } catch (e) {
      setAdminModal({ visible: true, person, event: "time-in", datetime: localIsoForInput, photo: person.registration_photo || null, note: "", point: null, locationStatus: "unavailable", locationMessage: "Location could not be determined on this device." });
    } finally {
      setLocLoading(false);
    }
  };

  const getPersonPhoto = (person) => {
    if (person && person.registration_photo) return person.registration_photo;
    return null;
  };

  const handleEditModalClose = () => {
    setShowEditModal(false);
    setEditPerson(null);
  };

  const submitAdminAttendance = async () => {
    if (!adminModal.visible || !adminModal.person) return;
    const person = adminModal.person;
    const dtStr = adminModal.datetime;
    if (!dtStr) {
      showModalAlert({ title: "Validation", text: "Please provide date & time.", icon: "warning" });
      return;
    }
    setActionLoading(true);
    try {
      const { data: settingsData } = await supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      const iso = new Date(dtStr).toISOString();
      const hhmm = new Date(dtStr).toTimeString().slice(0, 5);
      const locationResult = adminModal.point ? { point: adminModal.point, status: adminModal.locationStatus || "ok", message: adminModal.locationMessage || "" } : await getCurrentLocationPoint();
      if (locationResult.status !== "ok") {
        setAdminModal((s) => ({ ...s, point: locationResult.point, locationStatus: locationResult.status, locationMessage: locationResult.message }));
        showModalAlert({
          title: "Location Unavailable",
          text: locationResult.message || "Please enable location and try again.",
          icon: locationResult.status === "permission-denied" ? "error" : "warning",
        });
        return;
      }
      const locationPoint = locationResult.point;
      let status = "on-time";
      try {
        status = determineAttendanceStatus(hhmm, adminModal.event, settingsData || {}, false);
      } catch (e) {}

      const payload = {
        person_id: person.id,
        name: person.name,
        department: person.department,
        event: adminModal.event,
        method: "admin-entry",
        device_time: iso,
        status,
        point: locationPoint,
        photo: adminModal.photo || null,
      };

      const { error: insertErr } = await supabase.from("attendance").insert([payload]);
      if (insertErr) throw insertErr;

      try {
        const dt = new Date(iso);
        const start = new Date(dt);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dt);
        end.setHours(23, 59, 59, 999);
        const { data: atts, error: attErr } = await supabase
          .from("attendance")
          .select("person_id, event, device_time")
          .eq("person_id", person.id)
          .gte("device_time", start.toISOString())
          .lte("device_time", end.toISOString());
        if (!attErr && Array.isArray(atts)) {
          const pmap = {};
          pmap[person.id] = { morning: false, afternoon: false, firstScan: null };
          atts.forEach((r) => {
            try {
              const dt2 = new Date(r.device_time);
              const hour = dt2.getHours();
              if ((r.event || "").toLowerCase() === "time-in") {
                if (hour < 12) pmap[person.id].morning = true;
                else pmap[person.id].afternoon = true;
              }
              if (!pmap[person.id].firstScan) pmap[person.id].firstScan = dt2.toISOString();
              else if (new Date(pmap[person.id].firstScan).getTime() > dt2.getTime())
                pmap[person.id].firstScan = dt2.toISOString();
            } catch (e) {}
          });
          pmap[person.id].present = !!(pmap[person.id].morning || pmap[person.id].afternoon);
          setPresenceMap((prev) => ({ ...prev, ...pmap }));
        }
      } catch (e) {}

      showToast("Attendance recorded successfully!");
      setAdminModal({ visible: false, person: null, event: "time-in", datetime: "", photo: null, note: "", point: null, locationStatus: null, locationMessage: "" });
    } catch (err) {
      console.error(err);
      showModalAlert({ title: "Error", text: err.message || String(err), icon: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  function openPhotoModal(src, title) {
    if (!src) return;
    setPhotoModal({ visible: true, src, title: title || "" });
  }

  function closePhotoModal() {
    setPhotoModal({ visible: false, src: "", title: "" });
  }

  useEffect(() => {
    if (!photoModal.visible) return;
    function onKey(e) {
      if (e.key === "Escape") closePhotoModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoModal.visible]);

  const handleEditPhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;
      setEditPerson((prev) =>
        prev ? { ...prev, registration_photo: dataUrl } : prev,
      );
    };
    reader.readAsDataURL(file);
  };

  const handleEditModalSave = async (e) => {
    e.preventDefault();
    const {
      id,
      name,
      department,
      phone_number,
      address,
      email,
      sex,
      cash_advance,
      registration_photo,
    } = editPerson;
    const sssVal = editPerson.sss ? String(editPerson.sss).trim() : null;
    const pagIbigVal = editPerson.pag_ibig ? String(editPerson.pag_ibig).trim() : null;
    const philhealthVal = editPerson.philhealth ? String(editPerson.philhealth).trim() : null;
    const { error } = await supabase
      .from("persons")
      .update({
        name,
        department,
        phone_number,
        address,
        email,
        sex,
        sss: sssVal,
        pag_ibig: pagIbigVal,
        philhealth: philhealthVal,
        cash_advance,
        registration_photo: registration_photo || null,
      })
      .eq("id", id);
    if (error) {
      showModalAlert({ title: "Error", text: error.message, icon: "error" });
    } else {
      setPersons((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                name,
                department,
                phone_number,
                address,
                email,
                sex,
                sss: sssVal,
                pag_ibig: pagIbigVal,
                philhealth: philhealthVal,
                cash_advance,
                registration_photo: registration_photo || null,
              }
            : p,
        ),
      );
      showToast("Person updated successfully!");
      handleEditModalClose();
    }
  };

  const filteredPersons = persons.filter((p) => {
    if (showArchived ? !p.archived : p.archived) return false;
    const matchesSearch =
      !search ||
      (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
      (p.id && p.id.toLowerCase().includes(search.toLowerCase()));
    const matchesDept =
      !departmentFilter || (p.department || "") === departmentFilter;
    return matchesSearch && matchesDept;
  });

  const sortedPersons = [...filteredPersons].sort((a, b) => {
    try {
      const aPresent = !!(
        presenceMap &&
        presenceMap[a.id] &&
        presenceMap[a.id].present
      );
      const bPresent = !!(
        presenceMap &&
        presenceMap[b.id] &&
        presenceMap[b.id].present
      );
      if (aPresent !== bPresent) return aPresent ? -1 : 1;

      if (aPresent && bPresent) {
        const aTime =
          presenceMap[a.id] && presenceMap[a.id].firstScan
            ? new Date(presenceMap[a.id].firstScan).getTime()
            : Infinity;
        const bTime =
          presenceMap[b.id] && presenceMap[b.id].firstScan
            ? new Date(presenceMap[b.id].firstScan).getTime()
            : Infinity;
        if (aTime !== bTime) return aTime - bTime;
      }
    } catch (e) {}

    try {
      let aVal, bVal;
      if (sortKey === "created_at") {
        aVal = new Date(a.created_at).getTime() || 0;
        bVal = new Date(b.created_at).getTime() || 0;
      } else if (sortKey === "name") {
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
      } else if (sortKey === "department") {
        aVal = (a.department || "").toLowerCase();
        bVal = (b.department || "").toLowerCase();
      } else {
        aVal = (a[sortKey] || "").toString().toLowerCase();
        bVal = (b[sortKey] || "").toString().toLowerCase();
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    } catch (e) {}
    return 0;
  });

  if (error) {
    return <p className="text-red-500 text-center p-10 bg-white rounded-[32px] mx-auto my-10 max-w-[800px]">{error}</p>;
  }

  const handleExportExcel = () => {
    if (!Array.isArray(sortedPersons)) return;
    const exportData = sortedPersons.map((row) => ({
      ID: row.id,
      Name: row.name || "",
      Department: row.department || "",
      Phone: row.phone_number || "",
      Address: row.address || "",
      Email: row.email || "",
      Sex: row.sex || "",
      RegisteredAt: row.created_at
        ? new Date(row.created_at).toLocaleString()
        : "",
      SSS: row.sss || "",
      Pag_ibig: row.pag_ibig || "",
      PhilHealth: row.philhealth || "",
      Cash_Advance: row.cash_advance || "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Persons");
    XLSX.writeFile(wb, "persons.xlsx");
  };

  return (
    <div className="max-w-[1600px] mx-auto mt-2 mb-10 px-8 py-10 bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.1)] text-gray-800 font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-[2.8rem] font-bold text-gray-800 m-0 inline-block">Registered Persons</h1>
        <div className="h-1 w-24 bg-[#237227] mx-auto mt-2 rounded-sm" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap justify-between items-end gap-4 mb-6 p-5 sm:px-6 bg-gray-50 rounded-[20px] border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative">
            <label htmlFor="persons-search" className="block mb-1 text-xs text-gray-600 font-semibold">Search</label>
            <input
              id="persons-search"
              name="persons-search"
              type="text"
              placeholder="Search name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none min-w-[250px] transition-all focus:border-[#237227] focus:outline-none focus:ring-0 focus:shadow-none"
              style={{
                outline: "none",
                boxShadow: "none",
                backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "16px center",
                backgroundSize: "16px",
              }}
            />
          </div>
          <div>
            <label htmlFor="persons-department-filter" className="block mb-1 text-xs text-gray-600 font-semibold">Department</label>
            <select
              id="persons-department-filter"
              name="persons-department-filter"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer min-w-[160px] focus:outline-none focus:ring-0 focus:shadow-none"
              style={{ outline: "none", boxShadow: "none" }}
            >
              <option value="">All Departments</option>
              {[...new Set(persons.map((p) => p.department).filter(Boolean))].map(
                (dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ),
              )}
            </select>
          </div>
          <button
            onClick={() => setShowArchived((a) => !a)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 cursor-pointer bg-white text-gray-700"
          >
            {Icons.archive} {showArchived ? "Show Active" : "Show Archived"}
          </button>
          <input
            id="reg-image-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                const url = reader.result;
                setRegModalImage(url);
                setShowRegModal(true);
              };
              reader.readAsDataURL(f);
            }}
          />
          <button
            onClick={() => {
              setRegModalImage(null);
              setShowRegModal(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
          >
            {Icons.add} Open Register Camera
          </button>
        </div>

        <button
          onClick={handleExportExcel}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
        >
          {Icons.download} Export Excel
        </button>
      </div>

      {/* Registration modal */}
      {showRegModal && (
        <div className="fixed inset-0 w-screen h-screen bg-black/50 z-[2000] flex items-center justify-center">
          <div className="bg-white rounded-xl p-5 w-[800px] max-w-[95vw] max-h-[90vh] overflow-auto relative">
            <button
              onClick={() => setShowRegModal(false)}
              className="absolute right-3 top-3 border-none bg-transparent text-xl cursor-pointer text-gray-500 hover:text-gray-900 leading-none"
            >
              &times;
            </button>
            <PersonRegistration initialImageUrl={regModalImage} />
          </div>
        </div>
      )}

      {/* Card Grid */}
      <div className="rounded-[20px] overflow-hidden border border-gray-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 items-stretch">
            {sortedPersons.length === 0 ? (
              <div className="col-span-full text-center py-16 px-5 text-gray-500 text-[1.1rem]">No persons found.</div>
            ) : (
              sortedPersons.map((p) => {
                const initials = (p.name || "")
                  .split(" ")
                  .map((n) => (n ? n[0] : ""))
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                const displayAmount = Number(
                  p.daily_rate ??
                    payrollGrossMap[p.id] ??
                    p.gross ??
                    payrollMap[p.id] ??
                    p.net ??
                    0,
                );
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between shadow-[0_8px_20px_rgba(16,185,129,0.05)] transition-all hover:shadow-md">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center justify-center w-[84px] h-[84px] mr-3">
                        {getPersonPhoto(p) ? (
                          <img
                            src={getPersonPhoto(p)}
                            alt={p.name || "person"}
                            className="w-[84px] h-[84px] rounded-full object-cover border-4 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => openPhotoModal(getPersonPhoto(p), p.name || p.id)}
                          />
                        ) : (
                          <div className="w-[84px] h-[84px] rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl">
                            {initials || "?"}
                          </div>
                        )}
                      </div>
                      <div className="ml-auto">
                        {p.archived ? (
                          <span className="bg-red-500 text-white px-2.5 py-1.5 rounded-[20px] text-xs font-semibold">Archived</span>
                        ) : presenceMap[p.id] && presenceMap[p.id].present ? (
                          <span className="bg-[#237227] text-white px-2.5 py-1.5 rounded-[20px] text-xs font-semibold">Present</span>
                        ) : (
                          <span className="bg-red-500 text-white px-2.5 py-1.5 rounded-[20px] text-xs font-semibold">Absent</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-1.5 pb-3">
                      <h3 className="m-0 text-[1.05rem] font-bold text-gray-900">{p.name || "Unnamed"}</h3>
                      <div className="inline-block mt-1.5 px-2.5 py-1.5 rounded-xl bg-gray-200 text-gray-700 text-xs font-mono">{p.id}</div>

                      <div className="mt-2.5 text-gray-500 text-[0.95rem]">
                        <span className="inline-flex items-center gap-2 text-gray-700 flex-wrap">
                          <FiBriefcase className="text-cyan-500 text-[1.05rem]" />{" "}
                          {p.department || ""}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="inline-flex items-center gap-2 text-gray-700 flex-wrap">
                          <FiMail className="text-gray-500 text-base mr-1.5 mt-0.5" />
                          <span className="max-w-[220px] [overflow-wrap:anywhere] break-words text-gray-700 inline-block">
                            {p.email || ""}
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="inline-flex items-center gap-2 text-gray-700 flex-wrap">
                          <FiPhone className="text-blue-500 text-base" />
                          <span className="max-w-[220px] [overflow-wrap:anywhere] break-words text-gray-700 inline-block">
                            {p.phone_number || ""}
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="inline-flex items-center gap-2 font-bold text-[#237227]">
                          Daily Rate (₱):{" "}
                          <strong>
                            {`₱${displayAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          className="flex items-center justify-center py-2 px-3 rounded-xl border-none text-xs font-semibold cursor-pointer transition-colors bg-[#237227] text-white hover:bg-[#1a5a1d]"
                        >
                          Edit
                        </button>
                        {!p.archived ? (
                          <button
                            type="button"
                            onClick={() => handleArchive(p)}
                            className="flex items-center justify-center py-2 px-3 rounded-xl border border-gray-300 text-xs font-semibold cursor-pointer bg-white text-gray-700"
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRestore(p)}
                            className="flex items-center justify-center py-2 px-3 rounded-xl border border-gray-300 text-xs font-semibold cursor-pointer bg-white text-gray-700"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                      {!p.archived && (
                        <button
                          type="button"
                          onClick={() => handleAdminAttendance(p)}
                          className="w-full flex items-center justify-center py-2 px-3 rounded-xl border border-gray-200 text-xs font-semibold cursor-pointer transition-colors bg-gray-200 text-gray-700"
                        >
                          Customize Attendance
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && editPerson && (
        <div className="fixed inset-0 w-full h-full bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-sm">
          <div className="bg-white text-gray-800 p-7 rounded-[28px] max-w-[900px] w-[95%] overflow-y-auto max-h-[90%] shadow-[0_20px_40px_rgba(0,0,0,0.2)] border border-gray-200 font-sans">
            <h2 className="text-[2rem] font-bold mb-4 text-[#0f3d16] text-center flex items-center justify-center gap-2">
              <FiEdit className="text-[#237227] text-2xl" /> Edit Person
            </h2>
            <form onSubmit={handleEditModalSave}>
              <div className="mb-4.5 block">
                <label className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Registration Photo</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {editPerson.registration_photo ? (
                    <img
                      src={editPerson.registration_photo}
                      alt="person"
                      className="w-[88px] h-[88px] object-cover rounded-full shadow-[0_6px_18px_rgba(16,185,129,0.08)] cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => openPhotoModal(editPerson.registration_photo, editPerson.name || editPerson.id)}
                    />
                  ) : (
                    <span className="text-gray-400 text-[0.9rem]">
                      No photo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      editPhotoInputRef.current &&
                      editPhotoInputRef.current.click()
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-gray-300 cursor-pointer bg-white text-gray-700"
                  >
                    Upload New Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
                  >
                    Use Camera
                  </button>
                </div>
                <input
                  ref={editPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleEditPhotoChange}
                />

                {/* Camera Modal for capturing photo */}
                {showCamera && (
                  <div className="fixed inset-0 w-screen h-screen bg-black/50 z-[2000] flex items-center justify-center">
                    <div className="bg-white p-8 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] relative">
                      <button
                        onClick={() => setShowCamera(false)}
                        className="absolute top-3 right-4 bg-transparent border-none text-2xl text-gray-500 cursor-pointer leading-none hover:text-gray-800"
                      >
                        &times;
                      </button>
                      <h3 className="mb-4 font-bold text-lg">Capture Photo</h3>
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        width={320}
                        height={240}
                        className="rounded-xl bg-black"
                      />
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
                          onClick={handleCapturePhoto}
                        >
                          Capture
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-gray-300 cursor-pointer bg-white text-gray-700"
                          onClick={() => setShowCamera(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div className="mb-4.5 block">
                  <label htmlFor="edit-person-name" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Name</label>
                  <input
                    id="edit-person-name"
                    name="edit-person-name"
                    value={editPerson.name || ""}
                    onChange={(e) =>
                      setEditPerson({ ...editPerson, name: e.target.value })
                    }
                    className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                  />
                </div>
                <div className="mb-4.5 block">
                  <label htmlFor="edit-person-department" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Department</label>
                  <select
                    id="edit-person-department"
                    name="edit-person-department"
                    value={editPerson.department || ""}
                    onChange={(e) =>
                      setEditPerson({ ...editPerson, department: e.target.value })
                    }
                    className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none cursor-pointer focus:border-[#237227]"
                  >
                    <option value="">(Select department)</option>
                    {departments && departments.length
                      ? departments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))
                      : Array.from(
                          new Set(
                            persons.map((p) => p.department).filter(Boolean),
                          ),
                        ).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                  </select>
                </div>

                <div className="mb-4.5 block">
                  <label htmlFor="edit-person-phone" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Phone</label>
                  <input
                    id="edit-person-phone"
                    name="edit-person-phone"
                    value={editPerson.phone_number || ""}
                    onChange={(e) =>
                      setEditPerson({
                        ...editPerson,
                        phone_number: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                  />
                </div>
                <div className="mb-4.5 block">
                  <label htmlFor="edit-person-email" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Email</label>
                  <input
                    id="edit-person-email"
                    name="edit-person-email"
                    value={editPerson.email || ""}
                    onChange={(e) =>
                      setEditPerson({ ...editPerson, email: e.target.value })
                    }
                    className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                  />
                </div>

                <div className="mb-4.5 block">
                  <label htmlFor="edit-person-address" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Address</label>
                  <input
                    id="edit-person-address"
                    name="edit-person-address"
                    value={editPerson.address || ""}
                    onChange={(e) =>
                      setEditPerson({ ...editPerson, address: e.target.value })
                    }
                    className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                  />
                </div>
                <div className="mb-4.5 block">
                  <label htmlFor="edit-person-sex" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Sex</label>
                  <select
                    id="edit-person-sex"
                    name="edit-person-sex"
                    value={editPerson.sex || ""}
                    onChange={(e) =>
                      setEditPerson({ ...editPerson, sex: e.target.value })
                    }
                    className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none cursor-pointer focus:border-[#237227]"
                  >
                    <option value="">Select sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="col-span-full">
                  <label className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Mandatory Contributions</label>
                  <div className="flex gap-3 items-center flex-wrap">
                    <div className="min-w-[200px] flex-1">
                      <label htmlFor="edit-person-sss" className="block text-xs text-gray-700 mb-1.5">SSS Number</label>
                      <input
                        id="edit-person-sss"
                        name="edit-person-sss"
                        type="text"
                        placeholder="e.g. 12-3456789-0"
                        value={editPerson.sss ?? ''}
                        onChange={(e) =>
                          setEditPerson({ ...editPerson, sss: e.target.value })
                        }
                        className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                      />
                    </div>

                    <div className="min-w-[200px] flex-1">
                      <label htmlFor="edit-person-pag-ibig" className="block text-xs text-gray-700 mb-1.5">Pag-ibig Number</label>
                      <input
                        id="edit-person-pag-ibig"
                        name="edit-person-pag-ibig"
                        type="text"
                        placeholder="e.g. 0000-0000-0000"
                        value={editPerson.pag_ibig ?? ''}
                        onChange={(e) =>
                          setEditPerson({ ...editPerson, pag_ibig: e.target.value })
                        }
                        className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                      />
                    </div>

                    <div className="min-w-[200px] flex-1">
                      <label htmlFor="edit-person-philhealth" className="block text-xs text-gray-700 mb-1.5">PhilHealth Number</label>
                      <input
                        id="edit-person-philhealth"
                        name="edit-person-philhealth"
                        type="text"
                        placeholder="e.g. 123456789012"
                        value={editPerson.philhealth ?? ''}
                        onChange={(e) =>
                          setEditPerson({ ...editPerson, philhealth: e.target.value })
                        }
                        className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                      />
                    </div>
                  </div>
                </div>

                <div className="col-span-full">
                  <label className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Add Cash Advance</label>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input
                      id="cash-advance-amount"
                      name="cash-advance-amount"
                      type="number"
                      placeholder="Amount"
                      value={newCashAmount}
                      onChange={(e) => setNewCashAmount(e.target.value)}
                      className="max-w-[160px] px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                    />
                    <input
                      id="cash-advance-note"
                      name="cash-advance-note"
                      placeholder="Note (optional)"
                      value={newCashNote}
                      onChange={(e) => setNewCashNote(e.target.value)}
                      className="flex-1 px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]"
                    />
                    <button
                      type="button"
                      onClick={addCashAdvance}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
                    >
                      {Icons.circle} {actionLoading ? "Working..." : "Add"}
                    </button>
                  </div>
                </div>

                <div className="col-span-full mt-1.5">
                  <label className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Cash Advance History</label>
                  {loadingCashAdvances ? (
                    <div className="text-gray-500">Loading...</div>
                  ) : editCashAdvances && editCashAdvances.length ? (
                    <div className="max-h-[140px] overflow-auto border border-[#e6eef6] rounded-lg p-1.5">
                      {editCashAdvances.map((c) => (
                        <div
                          key={c.id}
                          className="flex justify-between items-center py-1.5 px-2 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="text-gray-700 text-xs">
                            {new Date(c.created_at).toLocaleString()}
                          </div>
                          <div className="text-right flex gap-3 items-center">
                            <div>
                              <div className="font-bold text-slate-900">{`₱${Number(c.amount || 0).toFixed(2)}`}</div>
                              {c.note ? (
                                <div className="text-xs text-gray-400">
                                  {c.note}
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => deleteCashAdvance(c.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-[30px] border border-gray-300 text-[0.85rem] font-medium cursor-pointer bg-white text-gray-700"
                                disabled={actionLoading}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400">
                      No cash advance history
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-5">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 min-w-[100px] rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleEditModalClose}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 min-w-[100px] rounded-lg text-sm font-semibold border border-gray-300 cursor-pointer bg-white text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Attendance Modal */}
      {adminModal.visible && adminModal.person && (
        <div className="fixed inset-0 w-full h-full bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-sm">
          <div className="bg-white text-gray-800 p-7 rounded-[28px] max-w-[500px] w-[95%] overflow-y-auto max-h-[90%] shadow-[0_20px_40px_rgba(0,0,0,0.2)] border border-gray-200 font-sans">
            <h2 className="text-2xl font-bold mb-4 text-[#0f3d16] text-center">Record Attendance</h2>
            <div className="grid gap-3">
              <div>
                <label className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Person</label>
                <div className="p-2 bg-gray-50 rounded-lg text-sm">{adminModal.person.name} • ID: {adminModal.person.id}</div>
              </div>
              <div>
                <label htmlFor="admin-attendance-event" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Event</label>
                <select id="admin-attendance-event" name="admin-attendance-event" value={adminModal.event} onChange={(e) => setAdminModal((s) => ({ ...s, event: e.target.value }))} className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none cursor-pointer focus:border-[#237227]">
                  <option value="time-in">Time In</option>
                  <option value="time-out">Time Out</option>
                </select>
              </div>
              <div>
                <label htmlFor="admin-attendance-datetime" className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Date & time</label>
                <input id="admin-attendance-datetime" name="admin-attendance-datetime" type="datetime-local" value={adminModal.datetime} onChange={(e) => setAdminModal((s) => ({ ...s, datetime: e.target.value }))} className="w-full px-3.5 py-3 text-base rounded-xl border border-[#e6eef6] bg-white text-slate-900 outline-none transition-all box-border focus:border-[#237227]" />
              </div>
              <div>
                <label className="block text-[0.85rem] font-semibold text-gray-700 mb-2">Location</label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 p-2 bg-gray-50 rounded-lg min-h-[40px] text-sm flex items-center">{adminModal.point ? adminModal.point : <span className="text-gray-400">—</span>}</div>
                  <button
                    onClick={async () => {
                      try {
                        setLocLoading(true);
                        const locationResult = await getCurrentLocationPoint();
                        setAdminModal((s) => ({ ...s, point: locationResult.point, locationStatus: locationResult.status, locationMessage: locationResult.message }));
                      } catch (e) {
                        setAdminModal((s) => ({ ...s, point: null, locationStatus: "unavailable", locationMessage: "Location could not be determined on this device." }));
                      } finally {
                        setLocLoading(false);
                      }
                    }}
                    className="px-3 py-2 rounded-md border border-gray-200 bg-white cursor-pointer hover:bg-gray-50 transition-colors text-sm"
                    disabled={locLoading}
                  >
                    {locLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
                {adminModal.locationMessage && adminModal.locationStatus && adminModal.locationStatus !== "ok" && (
                  <div className="mt-1.5 text-amber-700 text-xs leading-snug">
                    {adminModal.locationMessage}
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-end mt-5">
                <button
                  onClick={() => setAdminModal({ visible: false, person: null, event: "time-in", datetime: "", photo: null, note: "", point: null })}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-w-[100px] rounded-lg text-sm font-semibold border border-gray-300 cursor-pointer bg-white text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={submitAdminAttendance}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-w-[100px] rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
                >
                  {actionLoading ? "Recording..." : "Record"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo modal for Registered Persons */}
      {photoModal.visible && (
        <div
          onClick={() => closePhotoModal()}
          className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-5"
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90%] max-h-[90%] rounded-lg overflow-hidden bg-white p-3 shadow-[0_12px_40px_rgba(2,6,23,0.4)]">
            <div className="flex justify-end">
              <button onClick={() => closePhotoModal()} aria-label="Close photo" className="bg-transparent border-none text-slate-900 text-[22px] cursor-pointer leading-none hover:text-red-500 transition-colors">×</button>
            </div>
            <div className="text-center">
              <img src={photoModal.src} alt={photoModal.title} className="max-w-full max-h-[80vh] block mx-auto" />
              {photoModal.title && <div className="mt-2 text-slate-900">{photoModal.title}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
