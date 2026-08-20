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

const FACE_MATCH_THRESHOLD = 0.35;

export default function PersonDetails({
  scanPayload,
  onComplete,
  hidePersonTable = false,
}) {
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
    email: "",
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
  
  const departmentList = deptRates.map((d) => d.department).filter(Boolean);

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
      if (!opts.force && now - lastFetchAtRef.current < 2000) return;

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

        if (!selectedId && mapped.length && !descriptor) {
          const first = mapped[0];
          setSelectedId(first.id);
          setForm({
            id: first.id || "",
            name: first.name || "",
            phone_number: first.phone_number || "",
            email: first.email || "",
            address: first.address || "",
            sex: first.sex || "",
          });
          if (
            first.department &&
            !departmentList.includes(first.department)
          ) {
            setCustomDepartment(true);
            setCustomDeptValue(first.department);
          } else {
            setCustomDepartment(false);
            setCustomDeptValue("");
          }
        }

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
    [descriptor, selectedId, departmentList]
  );

  useEffect(() => {
    loadPersons();

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
      email: person.email || "",
      address: person.address || "",
      sex: person.sex || "",
    });
    if (person.department && !departmentList.includes(person.department)) {
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
        personId = uuidv4();
      }
    }

    let finalDepartment = form.department;
    if (customDepartment) {
      finalDepartment = customDeptValue.trim() || null;
    }

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

      if (descriptor) {
        const newDesc = descriptor;
        const duplicateFace = persons.find((p) => {
          if (p.id === personId) return false;
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

      if (form.name && form.name.trim() !== "") {
        const newName = form.name.trim();
        const duplicateName = persons.find((p) => {
          if (p.id === personId) return false;
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

      const registrationPhoto =
        isNew && scanPayload && scanPayload.photoDataUrl
          ? scanPayload.photoDataUrl
          : undefined;

      const payload = {
        id: personId,
        name: form.name || null,
        department: finalDepartment,
        phone_number: form.phone_number || null,
        email: form.email || null,
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
        email: form.email,
        address: form.address,
        sex: form.sex,
      });

      if (finalDepartment && !departmentList.includes(finalDepartment)) {
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
    <div className="mt-6 w-full max-w-full font-sans text-gray-800">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Person Details Registration</h2>
      {isRegistrationMode &&
        (matchedCandidate ? (
          <div className="mb-4 p-3.5 px-4 rounded-xl bg-blue-950/80 border border-blue-800 text-blue-100 flex justify-between items-center text-sm shadow-sm">
            <div>
              Face appears to match{" "}
              <strong className="font-semibold text-white">{matchedCandidate.name || matchedCandidate.id}</strong>{" "}
              (distance {matchedCandidate.dist.toFixed(3)}). You can confirm or
              choose another person.
            </div>
            <div className="ml-3">
              <button
                type="button"
                onClick={handleRejectMatch}
                className="px-3 py-1.5 bg-amber-600 text-white border-none rounded-lg text-xs font-semibold cursor-pointer hover:bg-amber-700 transition-colors"
              >
                Not my face
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-4 p-3.5 px-4 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-100 text-sm shadow-sm">
            Face not enrolled yet. Complete registration first, or select an
            existing person without a saved face to link this scan before
            attendance can be logged.
          </div>
        ))}

      {!hidePersonTable && loading && <p className="text-gray-500 my-2 text-sm">Loading persons...</p>}
      {!hidePersonTable && error && (
        <div className="mb-3">
          <p className="text-red-500 m-0 text-sm">{error}</p>
          <div className="mt-2">
            <button
              onClick={() => {
                setError(null);
                loadPersons({ force: true });
              }}
              className="px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6 items-start w-full">
        {!hidePersonTable && (
          <div className="flex-1 max-h-[360px] overflow-y-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-2.5 text-left">ID</th>
                  <th className="p-2.5 text-left">Name</th>
                  <th className="p-2.5 text-left">Department</th>
                  <th className="p-2.5 text-left">Phone</th>
                  <th className="p-2.5 text-left">Address</th>
                  <th className="p-2.5 text-left">Gender</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {persons.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className={`cursor-pointer transition-colors ${
                      selectedId === p.id ? "bg-green-100 text-[#237227] font-medium" : "hover:bg-gray-50 text-gray-800"
                    }`}
                  >
                    <td className="p-2">{p.id}</td>
                    <td className="p-2">{p.name || ""}</td>
                    <td className="p-2">{p.department || ""}</td>
                    <td className="p-2">{p.phone_number || ""}</td>
                    <td className="p-2">{p.address || ""}</td>
                    <td className="p-2">{p.sex || ""}</td>
                  </tr>
                ))}
                {!persons.length && !loading && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
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
          className={hidePersonTable ? "w-full" : "w-[280px] flex-shrink-0"}
        >
          <h3 className="text-lg font-bold mb-2 text-gray-800">
            {isLinkingExistingPerson
              ? "Link Face To Existing Person"
              : selectedId
              ? "Edit Person"
              : "Add Person"}
          </h3>
          {isRegistrationMode && !selectedId && (
            <p className="mt-0 mb-3 text-gray-600 text-xs leading-relaxed">
              This face is not enrolled yet. Save a new profile or select an
              existing person without a saved face, and the current scan will be
              used right away unless the work-hours rules block attendance for
              this time window.
            </p>
          )}
          {isLinkingExistingPerson && !selectedPersonHasFace && (
            <p className="mt-0 mb-3 text-gray-600 text-xs leading-relaxed">
              You are linking this scanned face to the selected existing person
              record.
            </p>
          )}

          {/* Person ID */}
          {selectedId && (
            <div className="mb-3 text-left">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Person ID
              </label>
              <input
                name="id"
                value={form.id}
                readOnly
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-gray-100 text-gray-500 font-mono outline-none cursor-not-allowed"
              />
            </div>
          )}

          {/* Name field */}
          <div className="mb-3 text-left">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Name
            </label>
            <input
              name="name"
              value={form.name}
              onChange={onChange}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white text-gray-800 outline-none transition-all focus:border-[#237227]"
            />
          </div>

          {/* Phone number field */}
          <div className="mb-3 text-left">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              name="phone_number"
              value={form.phone_number}
              onChange={onChange}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white text-gray-800 outline-none transition-all focus:border-[#237227]"
            />
          </div>

          {/* Email field */}
          <div className="mb-3 text-left">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Email
            </label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white text-gray-800 outline-none transition-all focus:border-[#237227]"
            />
          </div>

          {/* Address field */}
          <div className="mb-3 text-left">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Address
            </label>
            <input
              name="address"
              value={form.address}
              onChange={onChange}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white text-gray-800 outline-none transition-all focus:border-[#237227]"
            />
          </div>

          {/* Sex field */}
          <div className="mb-3 text-left">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Sex
            </label>
            <select
              name="sex"
              value={form.sex}
              onChange={onChange}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer focus:border-[#237227]"
            >
              <option value="">Select sex</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Department dropdown */}
          <div className="mb-4 text-left">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Department
            </label>
            <select
              value={customDepartment ? "" : form.department}
              onChange={handleDepartmentChange}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer focus:border-[#237227]"
            >
              <option value="">Select department</option>
              {departmentList.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            {customDepartment && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Enter department"
                  value={customDeptValue}
                  onChange={handleCustomDeptChange}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white text-gray-800 outline-none transition-all focus:border-[#237227]"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-full text-base font-semibold border-none cursor-pointer transition-all shadow-[0_4px_10px_rgba(0,0,0,0.1)] bg-[#237227] text-white hover:bg-[#1a5a1d] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
