import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { useLoading } from "../LoadingContext";
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
} from "react-icons/fi";
import PersonRegistration from "./PersonRegistration";

export default function PersonsTable() {
  // Camera state/hooks for Edit Person modal
  const [showCamera, setShowCamera] = useState(false);
  const cameraVideoRef = useRef(null);

  const cameraStreamRef = useRef(null);

  // Start camera when modal opens

  useEffect(() => {
    // Capture refs at effect start for cleanup
    const initialVideoRef = cameraVideoRef.current;
    if (showCamera) {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          if (initialVideoRef) {
            initialVideoRef.srcObject = stream;
            cameraStreamRef.current = stream;
          }
        } catch (err) {
          Swal.fire("Camera Error", "Unable to access camera.", "error");
          setShowCamera(false);
        }
      })();
    } else {
      // Stop camera
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks &&
          cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      if (initialVideoRef) {
        initialVideoRef.srcObject = null;
      }
    }
    // Cleanup on unmount
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

  // Handler to capture photo from camera
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
  const [payrollMap, setPayrollMap] = useState({});
  const [payrollGrossMap, setPayrollGrossMap] = useState({});
  const [presenceMap, setPresenceMap] = useState({});
  const { setLoading } = useLoading();
  const [departments, setDepartments] = useState([]);
  const [showRegModal, setShowRegModal] = useState(false);
  const [regModalImage, setRegModalImage] = useState(null);
  const initialLoadRef = useRef(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPerson, setEditPerson] = useState(null);
  const [editCashAdvances, setEditCashAdvances] = useState([]);
  const [loadingCashAdvances, setLoadingCashAdvances] = useState(false);
  const [newCashAmount, setNewCashAmount] = useState("");
  const [newCashNote, setNewCashNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const editPhotoInputRef = useRef(null);

  const Icons = {
    download: <FiDownload color="#ffffff" style={{ marginRight: 8 }} />,
    archive: <FiArchive />,
    edit: <FiEdit color="#ffffff" style={{ marginRight: 8 }} />,
    add: <FiUserPlus color="#ffffff" style={{ marginRight: 8 }} />,
  };

  useEffect(() => {
    async function fetchPersons() {
      if (!supabase) {
        setError(
          'Supabase client not configured. Check REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your environment.'
        );
        setLoading(false);
        initialLoadRef.current = false;
        return;
      }
      if (initialLoadRef.current) setLoading(true);
      try {
        setError(null);
        const { data, error: err } = await supabase.from("persons").select("*");
        if (err) throw err;
        const list = data || [];
        setPersons(list);

        // Fetch latest payroll/net for these persons
        try {
          const ids = list.map((p) => p.id).filter(Boolean);
          if (ids.length) {
            const { data: payrolls, error: payErr } = await supabase
              .from("payroll_periods")
              .select("person_id, net, gross, period")
              .in("person_id", ids)
              .order("period", { ascending: false });
            if (!payErr && Array.isArray(payrolls)) {
              const map = {};
              const gmap = {};
              for (const pr of payrolls) {
                if (!map[pr.person_id]) map[pr.person_id] = pr.net || 0;
                if (!gmap[pr.person_id]) gmap[pr.person_id] = pr.gross || 0;
              }
              setPayrollMap(map);
              setPayrollGrossMap(gmap);
            }
            // Fetch today's attendance for presence
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
                    // track earliest time-in for the person today
                    if (!pmap[pid].firstScan)
                      pmap[pid].firstScan = dt.toISOString();
                    else {
                      const existing = new Date(pmap[pid].firstScan);
                      if (dt.getTime() < existing.getTime())
                        pmap[pid].firstScan = dt.toISOString();
                    }
                  } catch (e) {}
                });
                // mark present if any session true
                Object.keys(pmap).forEach((k) => {
                  pmap[k].present = !!(pmap[k].morning || pmap[k].afternoon);
                });
                setPresenceMap(pmap);
                // fetch department rates list (for edit dropdown)
                try {
                  const { data: deptData, error: deptErr } = await supabase
                    .from("department_rates")
                    .select("department");
                  if (!deptErr && Array.isArray(deptData)) {
                    const uniq = Array.from(
                      new Set(deptData.map((d) => d.department).filter(Boolean)),
                    );
                    setDepartments(uniq);
                  }
                } catch (e) {
                  // ignore department fetch errors
                }
              }
            } catch (e) {
              // ignore attendance fetch errors
            }
          }
        } catch (e) {
          // ignore payroll fetch errors
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        initialLoadRef.current = false;
      }
    }
    fetchPersons();
    const interval = setInterval(fetchPersons, 5000);
    return () => clearInterval(interval);
  }, [setLoading]);

  const handleEdit = (person) => {
    setEditPerson({ ...person });
    setShowEditModal(true);
  };

  const editPersonId = editPerson && editPerson.id ? editPerson.id : null;

  // Load recent cash advance history for the person when opening the edit modal
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
      // Update local editPerson and main persons list
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
      Swal.fire(
        "Invalid amount",
        "Enter a positive cash advance amount.",
        "error",
      );
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
      Swal.fire("Added", "Cash advance recorded.", "success");
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e.message || String(e), "error");
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
      Swal.fire("Deleted", "Cash advance removed.", "success");
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e.message || String(e), "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Note: sorting is controlled by `sortKey`/`sortOrder` state via UI inputs.

  // Archive modal
  const handleArchive = async (person) => {
    Swal.fire({
      title: "Archive Person",
      html: `<div style='margin-bottom:12px;'>Are you sure you want to archive <b>${
        person.name || person.id
      }</b>?</div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Archive",
      cancelButtonText: "Cancel",
      focusCancel: true,
      customClass: { popup: "swal2-modal" },
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { error: archErr } = await supabase
          .from("persons")
          .update({ archived: true })
          .eq("id", person.id);
        if (archErr) {
          Swal.fire("Error", archErr.message, "error");
        } else {
          setPersons((prev) =>
            prev.map((p) =>
              p.id === person.id ? { ...p, archived: true } : p,
            ),
          );
          Swal.fire("Archived!", "", "success");
        }
      }
    });
  };

  // Helper to get photo for a person (latest attendance photo or registration photo)
  const getPersonPhoto = (person) => {
    // Always use registration photo if available
    if (person && person.registration_photo) return person.registration_photo;
    return null;
  };

  // Removed unused: closeModal

  const handleEditModalClose = () => {
    setShowEditModal(false);
    setEditPerson(null);
  };

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
    // Ensure checkboxes are stored as 1/0
    const sssVal = !!Number(editPerson.sss) ? 1 : 0;
    const pagIbigVal = !!Number(editPerson.pag_ibig) ? 1 : 0;
    const philhealthVal = !!Number(editPerson.philhealth) ? 1 : 0;
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
      Swal.fire("Error", error.message, "error");
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
      Swal.fire("Updated!", "", "success");
      handleEditModalClose();
    }
  };

  // Filter and sort
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
    // Always prioritize present persons first
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

      // If both present, sort by earliest attendance time (firstScan) ascending
      if (aPresent && bPresent) {
        const aTime =
          presenceMap[a.id] && presenceMap[a.id].firstScan
            ? new Date(presenceMap[a.id].firstScan).getTime()
            : Infinity;
        const bTime =
          presenceMap[b.id] && presenceMap[b.id].firstScan
            ? new Date(presenceMap[b.id].firstScan).getTime()
            : Infinity;
        if (aTime !== bTime) return aTime - bTime; // earlier (smaller) first
      }
    } catch (e) {}

    // Within the same group (both absent or both present with same time), apply sortKey/sortOrder
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

  // Page-level loading handled by LoadingContext overlay
  if (error) {
    return <p style={{ color: "red" }}>{error}</p>;
  }

  // Export to Excel
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
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Registered Persons</h1>
        <div style={styles.titleUnderline} />
      </div>

      {/* Filter Bar */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <div style={styles.searchWrapper}>
            <input
              type="text"
              placeholder="Search name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={styles.select}
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
          <button
            onClick={() => setShowArchived((a) => !a)}
            style={{ ...styles.button, ...styles.buttonSecondary }}
          >
            {showArchived ? (
              <>{Icons.archive} Show Active</>
            ) : (
              <>{Icons.archive} Show Archived</>
            )}
          </button>
          <input
            id="reg-image-input"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
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
            style={{ ...styles.button, ...styles.buttonPrimary, marginLeft: 8 }}
          >
            {Icons.add} Open Register Camera
          </button>
        </div>

        <button
          onClick={handleExportExcel}
          style={{ ...styles.button, ...styles.buttonPrimary }}
        >
          {Icons.download} Export Excel
        </button>
      </div>

      {/* Registration modal */}
      {showRegModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 20,
              width: 800,
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowRegModal(false)}
              style={{ position: "absolute", right: 12, top: 12, border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}
            >
              &times;
            </button>
            <PersonRegistration initialImageUrl={regModalImage} />
          </div>
        </div>
      )}

      {/* Card Grid */}
      <div style={styles.tableContainer}>
        <div style={{ padding: 24 }}>
          <div style={styles.cardsGrid}>
            {sortedPersons.length === 0 ? (
              <div style={styles.emptyState}>No persons found.</div>
            ) : (
              sortedPersons.map((p) => {
                const initials = (p.name || "")
                  .split(" ")
                  .map((n) => (n ? n[0] : ""))
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                // Compute display amount: prefer explicit daily_rate, then payroll gross, then net
                const displayAmount = Number(
                  p.daily_rate ??
                    payrollGrossMap[p.id] ??
                    p.gross ??
                    payrollMap[p.id] ??
                    p.net ??
                    0,
                );
                return (
                  <div key={p.id} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <div style={styles.cardAvatarWrapper}>
                        {getPersonPhoto(p) ? (
                          <img
                            src={getPersonPhoto(p)}
                            alt={p.name || "person"}
                            style={styles.cardAvatar}
                          />
                        ) : (
                          <div style={styles.cardAvatarPlaceholder}>
                            {initials || "?"}
                          </div>
                        )}
                      </div>
                      <div style={styles.cardStatus}>
                        {p.archived ? (
                          <span style={styles.badgeArchived}>Archived</span>
                        ) : presenceMap[p.id] && presenceMap[p.id].present ? (
                          <span style={styles.badgePresent}>Present</span>
                        ) : (
                          <span style={styles.badgeAbsent}>Absent</span>
                        )}
                      </div>
                    </div>

                    <div style={styles.cardBody}>
                      <h3 style={styles.cardName}>{p.name || "Unnamed"}</h3>
                      <div style={styles.cardId}>{p.id}</div>

                      <div style={styles.cardInfoRow}>
                        <span style={styles.iconAndText}>
                          <FiBriefcase style={styles.deptIcon} />{" "}
                          {p.department || ""}
                        </span>
                      </div>
                      <div style={styles.phoneRow}>
                        <span style={styles.iconAndText}>
                          <FiMail style={styles.emailIcon} />
                          <span style={styles.contactText}>{p.email || ""}</span>
                        </span>
                      </div>
                      <div style={styles.phoneRow}>
                        <span style={styles.iconAndText}>
                          <FiPhone style={styles.phoneIcon} />
                          <span style={styles.contactText}>{p.phone_number || ""}</span>
                        </span>
                      </div>
                      <div style={styles.netPayRow}>
                        <div style={styles.iconAndTexts}>
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

                    <div style={styles.cardActions}>
                      <button
                        onClick={() => handleEdit(p)}
                        style={{
                          ...styles.smallButton,
                          ...styles.buttonSuccess,
                        }}
                      >
                        {Icons.edit} Edit
                      </button>
                      {!p.archived && (
                        <button
                          onClick={() => handleArchive(p)}
                          style={{
                            ...styles.smallButton,
                            ...styles.buttonSecondary,
                          }}
                        >
                          {Icons.archive} Archive
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
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <button onClick={handleEditModalClose} style={styles.modalClose}>
              &times;
            </button>
            <h2 style={styles.modalTitle}>Edit Person</h2>
            <form onSubmit={handleEditModalSave}>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Registration Photo</label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  {editPerson.registration_photo ? (
                    <img
                      src={editPerson.registration_photo}
                      alt="person"
                      style={styles.photoPreview}
                    />
                  ) : (
                    <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
                      No photo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      editPhotoInputRef.current &&
                      editPhotoInputRef.current.click()
                    }
                    style={{
                      ...styles.button,
                      ...styles.buttonSecondary,
                      padding: "8px 16px",
                    }}
                  >
                    Upload New Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    style={{
                      ...styles.button,
                      ...styles.buttonPrimary,
                      padding: "8px 16px",
                    }}
                  >
                    Use Camera
                  </button>
                </div>
                <input
                  ref={editPhotoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleEditPhotoChange}
                />

                {/* Camera Modal for capturing photo */}
                {showCamera && (
                  <div
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      width: "100vw",
                      height: "100vh",
                      background: "rgba(0,0,0,0.5)",
                      zIndex: 2000,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        padding: 32,
                        borderRadius: 20,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                        position: "relative",
                      }}
                    >
                      <button
                        onClick={() => setShowCamera(false)}
                        style={{
                          position: "absolute",
                          top: 12,
                          right: 16,
                          background: "transparent",
                          border: "none",
                          fontSize: 28,
                          color: "#888",
                          cursor: "pointer",
                        }}
                      >
                        &times;
                      </button>
                      <h3 style={{ marginBottom: 16 }}>Capture Photo</h3>
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        width={320}
                        height={240}
                        style={{ borderRadius: 12, background: "#000" }}
                      />
                      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                        <button
                          type="button"
                          style={{ ...styles.button, ...styles.buttonPrimary }}
                          onClick={handleCapturePhoto}
                        >
                          Capture
                        </button>
                        <button
                          type="button"
                          style={{
                            ...styles.button,
                            ...styles.buttonSecondary,
                          }}
                          onClick={() => setShowCamera(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Name</label>
                <input
                  value={editPerson.name || ""}
                  onChange={(e) =>
                    setEditPerson({ ...editPerson, name: e.target.value })
                  }
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Department</label>
                <select
                  value={editPerson.department || ""}
                  onChange={(e) =>
                    setEditPerson({ ...editPerson, department: e.target.value })
                  }
                  style={styles.modalSelect}
                >
                  <option value="">(Select department)</option>
                  {departments && departments.length
                    ? departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))
                    : // fallback to departments seen on persons list
                      Array.from(new Set(persons.map((p) => p.department).filter(Boolean))).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                </select>
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Phone</label>
                <input
                  value={editPerson.phone_number || ""}
                  onChange={(e) =>
                    setEditPerson({
                      ...editPerson,
                      phone_number: e.target.value,
                    })
                  }
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Email</label>
                <input
                  value={editPerson.email || ""}
                  onChange={(e) =>
                    setEditPerson({ ...editPerson, email: e.target.value })
                  }
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Address</label>
                <input
                  value={editPerson.address || ""}
                  onChange={(e) =>
                    setEditPerson({ ...editPerson, address: e.target.value })
                  }
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Sex</label>
                <select
                  value={editPerson.sex || ""}
                  onChange={(e) =>
                    setEditPerson({ ...editPerson, sex: e.target.value })
                  }
                  style={styles.modalSelect}
                >
                  <option value="">Select sex</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={styles.modalField}>
                <div style={styles.modalCheckboxGroup}>
                  <label style={styles.modalCheckbox}>
                    <input
                      type="checkbox"
                      checked={!!Number(editPerson.sss)}
                      onChange={(e) =>
                        setEditPerson({
                          ...editPerson,
                          sss: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    SSS
                  </label>
                  <label style={styles.modalCheckbox}>
                    <input
                      type="checkbox"
                      checked={!!Number(editPerson.pag_ibig)}
                      onChange={(e) =>
                        setEditPerson({
                          ...editPerson,
                          pag_ibig: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    Pag-ibig
                  </label>
                  <label style={styles.modalCheckbox}>
                    <input
                      type="checkbox"
                      checked={!!Number(editPerson.philhealth)}
                      onChange={(e) =>
                        setEditPerson({
                          ...editPerson,
                          philhealth: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    PhilHealth
                  </label>
                </div>
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Add Cash Advance</label>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="number"
                    placeholder="Amount"
                    value={newCashAmount}
                    onChange={(e) => setNewCashAmount(e.target.value)}
                    style={{ ...styles.modalInput, maxWidth: 160 }}
                  />
                  <input
                    placeholder="Note (optional)"
                    value={newCashNote}
                    onChange={(e) => setNewCashNote(e.target.value)}
                    style={{ ...styles.modalInput, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={addCashAdvance}
                    disabled={actionLoading}
                    style={{
                      ...styles.button,
                      ...styles.buttonPrimary,
                      padding: "8px 12px",
                    }}
                  >
                    {actionLoading ? "Working..." : "Add"}
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={styles.modalLabel}>Cash Advance History</label>
                  {loadingCashAdvances ? (
                    <div style={{ color: "#6b7280" }}>Loading...</div>
                  ) : editCashAdvances && editCashAdvances.length ? (
                    <div
                      style={{
                        maxHeight: 140,
                        overflow: "auto",
                        border: "1px solid #e6eef6",
                        borderRadius: 8,
                        padding: 6,
                      }}
                    >
                      {editCashAdvances.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 8px",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <div style={{ color: "#374151", fontSize: 13 }}>
                            {new Date(c.created_at).toLocaleString()}
                          </div>
                          <div
                            style={{
                              textAlign: "right",
                              display: "flex",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div
                                style={{ fontWeight: 700, color: "#0f172a" }}
                              >{`₱${Number(c.amount || 0).toFixed(2)}`}</div>
                              {c.note ? (
                                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                                  {c.note}
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => deleteCashAdvance(c.id)}
                                style={{
                                  ...styles.smallButton,
                                  ...styles.buttonSecondary,
                                }}
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
                    <div style={{ color: "#9ca3af" }}>
                      No cash advance history
                    </div>
                  )}
                </div>
              </div>
              <div style={styles.modalActions}>
                <button
                  type="submit"
                  style={{ ...styles.button, ...styles.buttonPrimary }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleEditModalClose}
                  style={{ ...styles.button, ...styles.buttonSecondary }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Light theme styles with green accent
const styles = {
  container: {
    maxWidth: "1600px",
    margin: "40px auto",
    padding: "40px 32px",
    background: "#ffffff",
    borderRadius: "32px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
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
  buttonSecondary: {
    background: "#e5e7eb",
    color: "#1f2937",
    border: "1px solid #d1d5db",
  },
  buttonSuccess: {
    background: "#237227",
    color: "#ffffff",
  },
  smallButton: {
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
    cursor: "pointer",
  },
  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #e5e7eb",
    color: "#1f2937",
  },
  tr: {
    transition: "background 0.2s",
  },
  photo: {
    width: "48px",
    height: "48px",
    objectFit: "cover",
    borderRadius: "12px",
    border: "2px solid #e5e7eb",
  },
  photoPreview: {
    width: "56px",
    height: "56px",
    objectFit: "cover",
    borderRadius: "14px",
    border: "2px solid #e5e7eb",
  },
  actionCell: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "20px",
    alignItems: "stretch",
  },
  card: {
    background: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: "0 8px 20px rgba(16,185,129,0.05)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  cardAvatarWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "84px",
    height: "84px",
    marginRight: "12px",
  },
  cardAvatar: {
    width: "84px",
    height: "84px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "4px solid #fff",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  cardAvatarPlaceholder: {
    width: "84px",
    height: "84px",
    borderRadius: "50%",
    background: "linear-gradient(135deg,#3b82f6,#06b6d4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: "1.2rem",
  },
  cardStatus: {
    marginLeft: "auto",
  },
  badgePresent: {
    background: "#237227",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  badgeAbsent: {
    background: "#ef4444",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  badgeActive: {
    background: "#237227",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  badgeArchived: {
    background: "#ef4444",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  cardBody: {
    paddingTop: "6px",
    paddingBottom: "12px",
  },
  cardName: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#111827",
  },
  cardId: {
    display: "inline-block",
    marginTop: "6px",
    padding: "6px 10px",
    borderRadius: "12px",
    background: "#e5e7eb",
    color: "#374151",
    fontSize: "0.8rem",
    fontFamily: "monospace",
  },
  cardInfoRow: {
    marginTop: "10px",
    color: "#6b7280",
    fontSize: "0.95rem",
  },
  iconAndText: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    color: "#374151",
    flexWrap: "wrap",
  },
  deptIcon: {
    color: "#06b6d4",
    fontSize: "1.05rem",
  },
  phoneRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "8px",
  },
  phoneIcon: {
    color: "#3b82f6",
    fontSize: "1rem",
  },
  emailIcon: {
    color: "#6b7280",
    fontSize: "1rem",
    marginRight: 6,
    marginTop: 2,
  },
  contactText: {
    maxWidth: "220px",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    color: "#374151",
    display: "inline-block",
  },
  netPayRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "8px",
  },
  iconAndTexts: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 700,
    color: "#237227",
  },
  cardActions: {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
    justifyContent: "flex-start",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#6b7280",
    fontSize: "1.1rem",
  },
  error: {
    color: "#ef4444",
    textAlign: "center",
    padding: "40px",
    background: "#ffffff",
    borderRadius: "32px",
    margin: "40px auto",
    maxWidth: "800px",
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
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1001,
    backdropFilter: "blur(4px)",
  },
  modalContent: {
    background: "#ffffff",
    padding: "40px",
    borderRadius: "28px",
    minWidth: "400px",
    maxWidth: "500px",
    width: "90%",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
    border: "1px solid #e5e7eb",
    position: "relative",
    color: "#1f2937",
  },
  modalClose: {
    position: "absolute",
    top: "16px",
    right: "16px",
    background: "transparent",
    border: "none",
    color: "#6b7280",
    fontSize: "1.8rem",
    cursor: "pointer",
    lineHeight: 1,
  },
  modalTitle: {
    fontSize: "1.8rem",
    fontWeight: 600,
    marginBottom: "24px",
    color: "#1f2937",
    textAlign: "center",
  },
  modalField: {
    marginBottom: "16px",
  },
  modalLabel: {
    display: "block",
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "#4b5563",
    marginBottom: "6px",
  },
  modalInput: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "1rem",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#1f2937",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box",
  },
  modalSelect: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "1rem",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#1f2937",
    outline: "none",
  },
  modalCheckboxGroup: {
    display: "flex",
    gap: "20px",
    flexWrap: "wrap",
  },
  modalCheckbox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#1f2937",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "24px",
  },
};

// Add global keyframes and focus styles
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  input:focus, select:focus, button:focus {
    border-color: #237227 !important;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2) !important;
    outline: none;
  }
  button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
  /* SweetAlert2 light theme overrides */
  .swal-light-popup {
    background: #ffffff !important;
    color: #1f2937 !important;
    border-radius: 28px !important;
    border: 1px solid #e5e7eb !important;
  }
  .swal-light-title {
    color: #1f2937 !important;
  }
  .swal-light-html {
    color: #4b5563 !important;
  }
  .swal-light-confirm {
    background: #237227 !important;
    border: none !important;
    border-radius: 40px !important;
    padding: 10px 24px !important;
    font-weight: 600 !important;
  }
  .swal-light-cancel {
    background: #e5e7eb !important;
    color: #1f2937 !important;
    border-radius: 40px !important;
    border: 1px solid #d1d5db !important;
  }
`;
document.head.appendChild(styleSheet);