import { useEffect, useState, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Swal from "sweetalert2";
import { supabase, SUPABASE_CONFIGURED } from "../supabaseClient";
import {
  toFloat32Array,
  normalizeDescriptor,
  euclideanDistance,
  averageDescriptors,
} from "../utils/faceUtils";
import { recordAttendanceForPerson } from "../AdminPage/attendanceUtils";

// Face recognition threshold – adjust based on your model
const FACE_MATCH_THRESHOLD = 0.35;

// Predefined department options
const DEFAULT_DEPARTMENTS = [
  "HR",
  "IT",
  "Finance",
  "Sales",
  "Admin",
  "Operations",
];

export default function PersonDetails({
  scanPayload,
  onComplete,
  hidePersonTable = false,
}) {
  // Ensure SweetAlert2 renders above any modals by increasing z-index
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
  const rawDescriptor = scanPayload?.descriptor || null;
  const descriptor = rawDescriptor
    ? normalizeDescriptor(toFloat32Array(rawDescriptor))
    : null;
  const isRegistrationMode = descriptor && descriptor.length > 0;

  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({
    id: "",
    name: "",
    department: "",
    phone_number: "",
    address: "",
    sex: "",
  });
  const [deptRates, setDeptRates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [customDepartment, setCustomDepartment] = useState(false);
  const [customDeptValue, setCustomDeptValue] = useState("");
  const [settings, setSettings] = useState(null);
  const [matchedCandidate, setMatchedCandidate] = useState(null);

  const selectedPerson =
    persons.find((person) => person.id === selectedId) || null;
  const isLinkingExistingPerson = isRegistrationMode && Boolean(selectedId);
  const selectedPersonHasFace = Boolean(
    selectedPerson?.descriptor && selectedPerson.descriptor.length
  );

  // Guard refs to avoid overlapping fetches
  const fetchInProgressRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const rejectedMatchRef = useRef(false);

  const loadPersons = useCallback(
    async (opts = { force: false }) => {
      if (!SUPABASE_CONFIGURED || !supabase) {
        setError(
          "Supabase not configured in frontend. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY."
        );
        setLoading(false);
        return;
      }

      const now = Date.now();
      if (!opts.force && fetchInProgressRef.current) return;
      if (!opts.force && now - lastFetchAtRef.current < 2000) return; // rate-limit

      fetchInProgressRef.current = true;
      setError(null);
      setLoading(true);
      try {
        const { data, error: err } = await supabase
          .from("persons")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);

        if (err) throw err;
        const list = data || [];

        const mapped = list.map((p) => ({
          ...p,
          descriptor: p.descriptor
            ? Array.isArray(p.descriptor) && Array.isArray(p.descriptor[0])
              ? averageDescriptors(p.descriptor)
              : normalizeDescriptor(toFloat32Array(p.descriptor))
            : null,
        }));
        setPersons(mapped);

        // Auto-select first person if appropriate (only when NOT in registration mode)
        if (!selectedId && mapped.length && !descriptor) {
          const first = mapped[0];
          setSelectedId(first.id);
          setForm({
            id: first.id || "",
            phone_number: first.phone_number || "",
            address: first.address || "",
            sex: first.sex || "",
          });
          if (
            first.department &&
            !DEFAULT_DEPARTMENTS.includes(first.department)
          ) {
            setCustomDepartment(true);
            setCustomDeptValue(first.department);
          } else {
            setCustomDepartment(false);
            setCustomDeptValue("");
          }
        }

        // If we have a live descriptor (registration scan), try to find a confident match and pre-select it
        if (descriptor && mapped.length) {
          if (rejectedMatchRef.current) {
            setMatchedCandidate(null);
          } else {
            const candidates = mapped
              .filter((p) => p.descriptor)
              .map((p) => ({
                p,
                dist: euclideanDistance(descriptor, p.descriptor),
              }))
              .sort((a, b) => a.dist - b.dist);
            const best = candidates.length ? candidates[0] : null;
            const second = candidates.length > 1 ? candidates[1] : null;
            const margin = second ? second.dist - best.dist : Infinity;
            if (best && best.dist < FACE_MATCH_THRESHOLD && margin >= 0.05) {
              // pre-select the matched person but allow user to change
              setSelectedId(best.p.id);
              setMatchedCandidate({
                id: best.p.id,
                name: best.p.name || "",
                dist: best.dist,
              });
              setForm((prev) => ({
                ...prev,
                id: best.p.id,
                name: best.p.name || prev.name,
                department: best.p.department || prev.department,
                phone_number: best.p.phone_number || prev.phone_number,
                address: best.p.address || prev.address,
                sex: best.p.sex || prev.sex,
              }));
            } else {
              setMatchedCandidate(null);
            }
          }
        } else {
          setMatchedCandidate(null);
        }

        lastFetchAtRef.current = Date.now();
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
          setError(
            "Network error: unable to reach Supabase. Check your internet connection and REACT_APP_SUPABASE_URL."
          );
        } else {
          setError(msg);
        }
        console.error("Error loading persons:", e);
      } finally {
        fetchInProgressRef.current = false;
        setLoading(false);
      }
    },
    [descriptor, selectedId]
  );

  useEffect(() => {
    // initial load
    loadPersons();

    // fetch department rates and settings once
    async function fetchDeptRates() {
      if (!SUPABASE_CONFIGURED || !supabase) return;
      try {
        const { data, error } = await supabase
          .from("department_rates")
          .select("*");
        if (!error && data) setDeptRates(data);
      } catch (err) {
        console.error("Error fetching department rates:", err);
      }
    }
    async function fetchSettings() {
      if (!SUPABASE_CONFIGURED || !supabase) return;
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle();
        if (!error && data) setSettings(data);
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    }

    fetchDeptRates();
    fetchSettings();
  }, [loadPersons]);

  function onSelect(person) {
    setSelectedId(person.id);
    setForm({
      id: person.id || "",
      name: person.name || "",
      department: person.department || "",
      phone_number: person.phone_number || "",
      address: person.address || "",
      sex: person.sex || "",
    });
    if (person.department && !DEFAULT_DEPARTMENTS.includes(person.department)) {
      setCustomDepartment(true);
      setCustomDeptValue(person.department);
    } else {
      setCustomDepartment(false);
      setCustomDeptValue("");
    }
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleDepartmentChange(e) {
    const value = e.target.value;
    if (value === "Other") {
      setCustomDepartment(true);
      setForm((prev) => ({ ...prev, department: "" }));
    } else {
      setCustomDepartment(false);
      setCustomDeptValue("");
      setForm((prev) => ({ ...prev, department: value }));
    }
  }

  function handleCustomDeptChange(e) {
    setCustomDeptValue(e.target.value);
  }

  function handleRejectMatch() {
    rejectedMatchRef.current = true;
    setMatchedCandidate(null);
    setSelectedId("");
    setForm({
      id: "",
      name: "",
      department: "",
      phone_number: "",
      address: "",
      sex: "",
    });
  }

  useEffect(() => {
    // When a new scan payload arrives, clear any previous "reject" state so matching can run again
    rejectedMatchRef.current = false;
  }, [scanPayload]);

  async function onSave(e) {
    e.preventDefault();
    if (!SUPABASE_CONFIGURED || !supabase) {
      setError(
        "Supabase not configured in frontend. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY."
      );
      return;
    }

    let personId = form.id;
    const isNew = !personId;
    if (isNew) {
      // Generate a readable incremental employee ID like EMP001, EMP002, ...
      // We look for existing IDs starting with 'EMP' and pick the next number.
      try {
        const { data: empRows, error: empErr } = await supabase
          .from("persons")
          .select("id")
          .like("id", "EMP%");

        if (empErr) throw empErr;
        const numbers = (empRows || [])
          .map((r) => {
            const m = /^EMP0*(\d+)$/.exec(r.id || "");
            return m ? parseInt(m[1], 10) : null;
          })
          .filter((n) => n !== null);
        const max = numbers.length ? Math.max(...numbers) : 0;
        const next = max + 1;
        personId = `EMP${String(next).padStart(3, "0")}`;
      } catch (e) {
        // Fallback to UUID if anything goes wrong with the ID generation
        personId = uuidv4();
      }
    }

    // Determine final department value
    let finalDepartment = form.department;
    if (customDepartment) {
      finalDepartment = customDeptValue.trim() || null;
    }

    // Get department rate
    let daily_rate = null;
    let late_penalty = null;
    if (finalDepartment) {
      const dept = deptRates.find((d) => d.department === finalDepartment);
      if (dept) {
        daily_rate = dept.daily_rate;
        late_penalty = dept.late_penalty;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const isLinkingExistingRecord = Boolean(form.id);
      const existingPersonForSave =
        persons.find((person) => person.id === personId) || null;
      const isLinkingFaceEnrollment =
        isRegistrationMode &&
        isLinkingExistingRecord &&
        !existingPersonForSave?.descriptor;

      // --- FACE DUPLICATE VALIDATION ---
      if (descriptor) {
        const newDesc = descriptor; // already normalized Float32Array
        const duplicateFace = persons.find((p) => {
          if (p.id === personId) return false; // skip current person
          if (!p.descriptor) return false;
          const dist = euclideanDistance(newDesc, p.descriptor);
          return dist < FACE_MATCH_THRESHOLD;
        });

        if (duplicateFace) {
          await Swal.fire({
            icon: "error",
            title: "Duplicate Face",
            text: `This face already belongs to ${
              duplicateFace.name || "another person"
            } (ID: ${duplicateFace.id}). Registration denied.`,
            confirmButtonText: "OK",
          });
          setSaving(false);
          return;
        }
      }

      // --- NAME DUPLICATE VALIDATION (optional) ---
      if (form.name && form.name.trim() !== "") {
        const newName = form.name.trim();
        const duplicateName = persons.find((p) => {
          if (p.id === personId) return false; // skip current person
          return (
            p.name && p.name.trim().toLowerCase() === newName.toLowerCase()
          );
        });

        if (duplicateName) {
          await Swal.fire({
            icon: "error",
            title: "Duplicate Name",
            text: `The name "${form.name}" is already used by ${duplicateName.name} (ID: ${duplicateName.id}). Please use a different name.`,
            confirmButtonText: "OK",
          });
          setSaving(false);
          return;
        }
      }

      // --- END VALIDATION ---

      // Decide whether to store a registration photo.
      // To avoid unexpected image changes, we only ever set
      // registration_photo when creating a brand-new person here.
      // Existing persons keep whatever registration_photo they already have.
      const registrationPhoto =
        isNew && scanPayload && scanPayload.photoDataUrl
          ? scanPayload.photoDataUrl
          : undefined;

      const payload = {
        id: personId,
        name: form.name || null,
        department: finalDepartment,
        phone_number: form.phone_number || null,
        address: form.address || null,
        sex: form.sex || null,
        descriptor: descriptor ? Array.from(descriptor) : null,
        daily_rate,
        late_penalty,
        registration_photo: registrationPhoto,
      };

      const { error: err } = await supabase
        .from("persons")
        .upsert([payload], { onConflict: "id" });

      if (err) throw err;

      // Refresh list
      const { data } = await supabase
        .from("persons")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      setPersons(data || []);
      setSelectedId(personId);
      setForm({
        id: personId,
        name: form.name,
        department: finalDepartment,
        phone_number: form.phone_number,
        address: form.address,
        sex: form.sex,
      });

      // Reset custom department state
      if (finalDepartment && !DEFAULT_DEPARTMENTS.includes(finalDepartment)) {
        setCustomDepartment(true);
        setCustomDeptValue(finalDepartment);
      } else {
        setCustomDepartment(false);
        setCustomDeptValue("");
      }

      const savedPerson = {
        id: personId,
        name: form.name || null,
        department: finalDepartment,
      };

      // Only record attendance if linking a face to an existing person (not for new registration)
      if (
        isRegistrationMode &&
        scanPayload &&
        settings &&
        isLinkingFaceEnrollment
      ) {
        const attendanceResult = await recordAttendanceForPerson({
          supabase,
          person: savedPerson,
          settings,
          scanPayload,
        });

        if (attendanceResult.inserted) {
          await Swal.fire({
            icon: attendanceResult.status === "late" ? "warning" : "success",
            title: "Face linked and attendance recorded!",
            text:
              attendanceResult.status === "late"
                ? "The face was linked to the existing person and this same scan was logged as late attendance."
                : "The face was linked to the existing person and this same scan was logged immediately.",
            showConfirmButton: false,
            timer: 2200,
          });
        } else {
          let blockedMessage = attendanceResult.message;
          if (attendanceResult.event === "already-timed-in") {
            blockedMessage =
              "The face was linked to the selected person, but attendance was not added because this person is already timed in for the current work window.";
          }
          await Swal.fire({
            icon: "info",
            title: "Face linked successfully!",
            text: blockedMessage,
            showConfirmButton: true,
          });
        }
      } else {
        await Swal.fire({
          icon: "success",
          title: "Person registered successfully!",
          text: "Registration completed.",
          showConfirmButton: false,
          timer: 1800,
        });
      }

      if (typeof onComplete === "function") {
        onComplete();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: "24px", width: "100%", maxWidth: "100%" }}>
      <h2>Person Details Registration</h2>
      {isRegistrationMode &&
        (matchedCandidate ? (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 16px",
              borderRadius: "6px",
              background: "#1e3a8a",
              border: "1px solid #1e40af",
              color: "#e6f0ff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              Face appears to match{" "}
              <strong>{matchedCandidate.name || matchedCandidate.id}</strong>{" "}
              (distance {matchedCandidate.dist.toFixed(3)}). You can confirm or
              choose another person.
            </div>
            <div style={{ marginLeft: "12px" }}>
              <button
                type="button"
                onClick={handleRejectMatch}
                style={{
                  padding: "6px 10px",
                  background: "#f97316",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Not my face
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 16px",
              borderRadius: "6px",
              background: "#1f3b2f",
              border: "1px solid #2f855a",
              color: "#e6fffa",
            }}
          >
            Face not enrolled yet. Complete registration first, or select an
            existing person without a saved face to link this scan before
            attendance can be logged.
          </div>
        ))}

      {!hidePersonTable && loading && <p>Loading persons...</p>}
      {!hidePersonTable && error && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ color: "red", margin: 0 }}>{error}</p>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => {
                setError(null);
                loadPersons({ force: true });
              }}
              style={{ padding: "6px 10px" }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "flex-start",
          width: "100%",
        }}
      >
        {!hidePersonTable && (
          <div style={{ flex: 1, maxHeight: "360px", overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      borderBottom: "1px solid #444",
                      padding: "8px",
                      textAlign: "left",
                    }}
                  >
                    ID
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #444",
                      padding: "8px",
                      textAlign: "left",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #444",
                      padding: "8px",
                      textAlign: "left",
                    }}
                  >
                    Department
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #444",
                      padding: "8px",
                      textAlign: "left",
                    }}
                  >
                    Phone
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #444",
                      padding: "8px",
                      textAlign: "left",
                    }}
                  >
                    Address
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #444",
                      padding: "8px",
                      textAlign: "left",
                    }}
                  >
                    Gender
                  </th>
                </tr>
              </thead>
              <tbody>
                {persons.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelect(p)}
                    style={{
                      cursor: "pointer",
                      backgroundColor:
                        selectedId === p.id ? "#333" : "transparent",
                    }}
                  >
                    <td
                      style={{ borderBottom: "1px solid #333", padding: "6px" }}
                    >
                      {p.id}
                    </td>
                    <td
                      style={{ borderBottom: "1px solid #333", padding: "6px" }}
                    >
                      {p.name || ""}
                    </td>
                    <td
                      style={{ borderBottom: "1px solid #333", padding: "6px" }}
                    >
                      {p.department || ""}
                    </td>
                    <td
                      style={{ borderBottom: "1px solid #333", padding: "6px" }}
                    >
                      {p.phone_number || ""}
                    </td>
                    <td
                      style={{ borderBottom: "1px solid #333", padding: "6px" }}
                    >
                      {p.address || ""}
                    </td>
                    <td
                      style={{ borderBottom: "1px solid #333", padding: "6px" }}
                    >
                      {p.sex || ""}
                    </td>
                  </tr>
                ))}
                {!persons.length && !loading && (
                  <tr>
                    <td colSpan={6} style={{ padding: "8px" }}>
                      No persons yet. They will appear after the first scan or
                      you can add one manually.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <form
          onSubmit={onSave}
          style={{
            flexBasis: hidePersonTable ? "100%" : "280px",
            flex: hidePersonTable ? 1 : undefined,
          }}
        >
          <h3>
            {isLinkingExistingPerson
              ? "Link Face To Existing Person"
              : selectedId
              ? "Edit Person"
              : "Add Person"}
          </h3>
          {isRegistrationMode && !selectedId && (
            <p
              style={{
                marginTop: 0,
                marginBottom: "12px",
                color: "#cbd5e1",
                fontSize: "13px",
                lineHeight: 1.4,
              }}
            >
              This face is not enrolled yet. Save a new profile or select an
              existing person without a saved face, and the current scan will be
              used right away unless the work-hours rules block attendance for
              this time window.
            </p>
          )}
          {isLinkingExistingPerson && !selectedPersonHasFace && (
            <p
              style={{
                marginTop: 0,
                marginBottom: "12px",
                color: "#cbd5e1",
                fontSize: "13px",
                lineHeight: 1.4,
              }}
            >
              You are linking this scanned face to the selected existing person
              record.
            </p>
          )}

          {/* Person ID - only show when editing, read-only */}
          {selectedId && (
            <div style={{ marginBottom: "8px", textAlign: "left" }}>
              <label>
                Person ID
                <input
                  name="id"
                  value={form.id}
                  readOnly
                  style={{
                    width: "100%",
                    padding: "6px",
                    marginTop: "4px",
                    backgroundColor: "#444",
                    color: "#ccc",
                  }}
                />
              </label>
            </div>
          )}

          {/* Name field */}
          <div style={{ marginBottom: "8px", textAlign: "left" }}>
            <label>
              Name
              <input
                name="name"
                value={form.name}
                onChange={onChange}
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              />
            </label>
          </div>

          {/* Phone number field */}
          <div style={{ marginBottom: "8px", textAlign: "left" }}>
            <label>
              Phone Number
              <input
                name="phone_number"
                value={form.phone_number}
                onChange={onChange}
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              />
            </label>
          </div>

          {/* Address field */}
          <div style={{ marginBottom: "8px", textAlign: "left" }}>
            <label>
              Address
              <input
                name="address"
                value={form.address}
                onChange={onChange}
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              />
            </label>
          </div>

          {/* Sex field */}
          <div style={{ marginBottom: "8px", textAlign: "left" }}>
            <label>
              Sex
              <select
                name="sex"
                value={form.sex}
                onChange={onChange}
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              >
                <option value="">Select sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          {/* Department dropdown */}
          <div style={{ marginBottom: "12px", textAlign: "left" }}>
            <label>
              Department
              <select
                value={customDepartment ? "Other" : form.department}
                onChange={handleDepartmentChange}
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              >
                <option value="">Select department</option>
                {DEFAULT_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </label>
            {customDepartment && (
              <div style={{ marginTop: "4px" }}>
                <input
                  type="text"
                  placeholder="Enter department"
                  value={customDeptValue}
                  onChange={handleCustomDeptChange}
                  style={{ width: "100%", padding: "6px", marginTop: "4px" }}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{ padding: "8px 16px" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
