import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';
import { recordAttendanceForPerson } from '../AdminPage/attendanceUtils';

// Face recognition threshold – adjust based on your model
const FACE_MATCH_THRESHOLD = 0.6;

// Euclidean distance between two vectors
function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Predefined department options
const DEFAULT_DEPARTMENTS = ['HR', 'IT', 'Finance', 'Sales', 'Admin', 'Operations'];

export default function PersonDetails({ scanPayload, onComplete }) {
  const descriptor = scanPayload?.descriptor || null;
  const isRegistrationMode = Array.isArray(descriptor) && descriptor.length > 0;
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ id: '', name: '', department: '', phone_number: '', address: '', sex: '' });
  const [deptRates, setDeptRates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [customDepartment, setCustomDepartment] = useState(false);
  const [customDeptValue, setCustomDeptValue] = useState('');
  const [settings, setSettings] = useState(null);
  const selectedPerson = persons.find((person) => person.id === selectedId) || null;
  const isLinkingExistingPerson = isRegistrationMode && Boolean(selectedId);
  const selectedPersonHasFace = Boolean(selectedPerson?.descriptor && Array.isArray(selectedPerson.descriptor) && selectedPerson.descriptor.length);

  useEffect(() => {
    if (!supabase) {
      setError('Supabase not configured in frontend (.env REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY).');
      setLoading(false);
      return;
    }

    async function loadPersons() {
      try {
        setError(null);
        setLoading(true);
        const { data, error: err } = await supabase
          .from('persons')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (err) throw err;
        const list = data || [];
        setPersons(list);

        // Only auto-select the first person if we are NOT in registration mode (i.e., no descriptor)
        if (!selectedId && list.length && !descriptor) {
          const first = list[0];
          setSelectedId(first.id);
          setForm({
            id: first.id || '',
            name: first.name || '',
            department: first.department || '',
            phone_number: first.phone_number || '',
            address: first.address || '',
            sex: first.sex || '',
          });
          // If the department is not in the default list, treat as custom
          if (first.department && !DEFAULT_DEPARTMENTS.includes(first.department)) {
            setCustomDepartment(true);
            setCustomDeptValue(first.department);
          } else {
            setCustomDepartment(false);
            setCustomDeptValue('');
          }
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    loadPersons();
    // Fetch department rates
    async function fetchDeptRates() {
      const { data, error } = await supabase
        .from('department_rates')
        .select('*');
      if (!error && data) setDeptRates(data);
    }
    async function fetchSettings() {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (!error && data) setSettings(data);
    }
    fetchDeptRates();
    fetchSettings();
  }, [selectedId, descriptor]); // Re-run if descriptor changes

  function onSelect(person) {
    setSelectedId(person.id);
    setForm({
      id: person.id || '',
      name: person.name || '',
      department: person.department || '',
      phone_number: person.phone_number || '',
      address: person.address || '',
      sex: person.sex || '',
    });
    // Handle department type (custom or predefined)
    if (person.department && !DEFAULT_DEPARTMENTS.includes(person.department)) {
      setCustomDepartment(true);
      setCustomDeptValue(person.department);
    } else {
      setCustomDepartment(false);
      setCustomDeptValue('');
    }
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleDepartmentChange(e) {
    const value = e.target.value;
    if (value === 'Other') {
      setCustomDepartment(true);
      setForm(prev => ({ ...prev, department: '' }));
    } else {
      setCustomDepartment(false);
      setCustomDeptValue('');
      setForm(prev => ({ ...prev, department: value }));
    }
  }

  function handleCustomDeptChange(e) {
    setCustomDeptValue(e.target.value);
  }

  async function onSave(e) {
    e.preventDefault();
    if (!supabase) return;


    let personId = form.id;
    const isNew = !personId;
    if (isNew) {
      personId = uuidv4(); // auto-generate ID
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
      const dept = deptRates.find(d => d.department === finalDepartment);
      if (dept) {
        daily_rate = dept.daily_rate;
        late_penalty = dept.late_penalty;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const isLinkingExistingRecord = Boolean(form.id);
      const existingPersonForSave = persons.find((person) => person.id === personId) || null;
      const isLinkingFaceEnrollment = isRegistrationMode && isLinkingExistingRecord && !existingPersonForSave?.descriptor;

      // --- FACE DUPLICATE VALIDATION ---
      if (descriptor && Array.isArray(descriptor)) {
        const newDesc = Array.from(descriptor);

        const duplicateFace = persons.find(p => {
          if (p.id === personId) return false; // skip current person
          if (!p.descriptor || !Array.isArray(p.descriptor)) return false;
          const dist = euclideanDistance(newDesc, p.descriptor);
          return dist < FACE_MATCH_THRESHOLD;
        });

        if (duplicateFace) {
          await Swal.fire({
            icon: 'error',
            title: 'Duplicate Face',
            text: `This face already belongs to ${duplicateFace.name || 'another person'} (ID: ${duplicateFace.id}). Registration denied.`,
            confirmButtonText: 'OK'
          });
          setSaving(false);
          return;
        }
      }

      // --- NAME DUPLICATE VALIDATION (optional) ---
      if (form.name && form.name.trim() !== '') {
        const newName = form.name.trim();
        const duplicateName = persons.find(p => {
          if (p.id === personId) return false; // skip current person
          return p.name && p.name.trim().toLowerCase() === newName.toLowerCase();
        });

        if (duplicateName) {
          await Swal.fire({
            icon: 'error',
            title: 'Duplicate Name',
            text: `The name "${form.name}" is already used by ${duplicateName.name} (ID: ${duplicateName.id}). Please use a different name.`,
            confirmButtonText: 'OK'
          });
          setSaving(false);
          return;
        }
      }

      // --- END VALIDATION ---

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
        // Save registration photo if available (for new registration only)
        registration_photo: (!isLinkingExistingRecord && scanPayload && scanPayload.photoDataUrl) ? scanPayload.photoDataUrl : undefined,
      };

      const { error: err } = await supabase
        .from('persons')
        .upsert([payload], { onConflict: 'id' });

      if (err) throw err;

      // Refresh list
      const { data } = await supabase
        .from('persons')
        .select('*')
        .order('created_at', { ascending: false })
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
        setCustomDeptValue('');
      }

      const savedPerson = {
        id: personId,
        name: form.name || null,
        department: finalDepartment,
      };

      // Only record attendance if linking a face to an existing person (not for new registration)
      if (isRegistrationMode && scanPayload && settings && isLinkingFaceEnrollment) {
        const attendanceResult = await recordAttendanceForPerson({
          supabase,
          person: savedPerson,
          settings,
          scanPayload,
        });

        if (attendanceResult.inserted) {
          await Swal.fire({
            icon: attendanceResult.status === 'late' ? 'warning' : 'success',
            title: 'Face linked and attendance recorded!',
            text: attendanceResult.status === 'late'
              ? 'The face was linked to the existing person and this same scan was logged as late attendance.'
              : 'The face was linked to the existing person and this same scan was logged immediately.',
            showConfirmButton: false,
            timer: 2200,
          });
        } else {
          let blockedMessage = attendanceResult.message;
          if (attendanceResult.event === 'already-timed-in') {
            blockedMessage = 'The face was linked to the selected person, but attendance was not added because this person is already timed in for the current work window.';
          }
          await Swal.fire({
            icon: 'info',
            title: 'Face linked successfully!',
            text: blockedMessage,
            showConfirmButton: true,
          });
        }
      } else {
        await Swal.fire({
          icon: 'success',
          title: 'Person registered successfully!',
          text: 'Registration completed.',
          showConfirmButton: false,
          timer: 1800,
        });
      }

      if (typeof onComplete === 'function') {
        onComplete();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: '32px', width: '100%', maxWidth: '960px' }}>
      <h2>Person Details Registration</h2>
      {isRegistrationMode && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '6px', background: '#1f3b2f', border: '1px solid #2f855a', color: '#e6fffa' }}>
          Face not enrolled yet. Complete registration first, or select an existing person without a saved face to link this scan before attendance can be logged.
        </div>
      )}
      {loading && <p>Loading persons...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', width: '100%' }}>
        <div style={{ flex: 1, maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #444', padding: '8px', textAlign: 'left' }}>ID</th>
                <th style={{ borderBottom: '1px solid #444', padding: '8px', textAlign: 'left' }}>Name</th>
                <th style={{ borderBottom: '1px solid #444', padding: '8px', textAlign: 'left' }}>Department</th>
                <th style={{ borderBottom: '1px solid #444', padding: '8px', textAlign: 'left' }}>Phone</th>
                <th style={{ borderBottom: '1px solid #444', padding: '8px', textAlign: 'left' }}>Address</th>
                <th style={{ borderBottom: '1px solid #444', padding: '8px', textAlign: 'left' }}>Sex</th>
              </tr>
            </thead>
            <tbody>
              {persons.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p)}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: selectedId === p.id ? '#333' : 'transparent',
                  }}
                >
                  <td style={{ borderBottom: '1px solid #333', padding: '6px' }}>{p.id}</td>
                  <td style={{ borderBottom: '1px solid #333', padding: '6px' }}>{p.name || ''}</td>
                  <td style={{ borderBottom: '1px solid #333', padding: '6px' }}>{p.department || ''}</td>
                  <td style={{ borderBottom: '1px solid #333', padding: '6px' }}>{p.phone_number || ''}</td>
                  <td style={{ borderBottom: '1px solid #333', padding: '6px' }}>{p.address || ''}</td>
                  <td style={{ borderBottom: '1px solid #333', padding: '6px' }}>{p.sex || ''}</td>
                </tr>
              ))}
              {!persons.length && !loading && (
                <tr>
                  <td colSpan={3} style={{ padding: '8px' }}>
                    No persons yet. They will appear after the first scan or you can add one manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={onSave} style={{ flexBasis: '280px' }}>
          <h3>{isLinkingExistingPerson ? 'Link Face To Existing Person' : selectedId ? 'Edit Person' : 'Add Person'}</h3>
          {isRegistrationMode && !selectedId && (
            <p style={{ marginTop: 0, marginBottom: '12px', color: '#cbd5e1', fontSize: '13px', lineHeight: 1.4 }}>
              This face is not enrolled yet. Save a new profile or select an existing person without a saved face, and the current scan will be used right away unless the work-hours rules block attendance for this time window.
            </p>
          )}
          {isLinkingExistingPerson && !selectedPersonHasFace && (
            <p style={{ marginTop: 0, marginBottom: '12px', color: '#cbd5e1', fontSize: '13px', lineHeight: 1.4 }}>
              You are linking this scanned face to the selected existing person record.
            </p>
          )}
          
          {/* Person ID - only show when editing, read-only */}
          {selectedId && (
            <div style={{ marginBottom: '8px', textAlign: 'left' }}>
              <label>
                Person ID
                <input
                  name="id"
                  value={form.id}
                  readOnly
                  style={{ width: '100%', padding: '6px', marginTop: '4px', backgroundColor: '#444', color: '#ccc' }}
                />
              </label>
            </div>
          )}
          
          {/* Name field */}
          <div style={{ marginBottom: '8px', textAlign: 'left' }}>
            <label>
              Name
              <input
                name="name"
                value={form.name}
                onChange={onChange}
                style={{ width: '100%', padding: '6px', marginTop: '4px' }}
              />
            </label>
          </div>
          
          {/* Phone number field */}
          <div style={{ marginBottom: '8px', textAlign: 'left' }}>
            <label>
              Phone Number
              <input
                name="phone_number"
                value={form.phone_number}
                onChange={onChange}
                style={{ width: '100%', padding: '6px', marginTop: '4px' }}
              />
            </label>
          </div>

          {/* Address field */}
          <div style={{ marginBottom: '8px', textAlign: 'left' }}>
            <label>
              Address
              <input
                name="address"
                value={form.address}
                onChange={onChange}
                style={{ width: '100%', padding: '6px', marginTop: '4px' }}
              />
            </label>
          </div>

          {/* Sex field */}
          <div style={{ marginBottom: '8px', textAlign: 'left' }}>
            <label>
              Sex
              <select
                name="sex"
                value={form.sex}
                onChange={onChange}
                style={{ width: '100%', padding: '6px', marginTop: '4px' }}
              >
                <option value="">Select sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          {/* Department dropdown */}
          <div style={{ marginBottom: '12px', textAlign: 'left' }}>
            <label>
              Department
              <select
                value={customDepartment ? 'Other' : form.department}
                onChange={handleDepartmentChange}
                style={{ width: '100%', padding: '6px', marginTop: '4px' }}
              >
                <option value="">Select department</option>
                {DEFAULT_DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </label>
            {customDepartment && (
              <div style={{ marginTop: '4px' }}>
                <input
                  type="text"
                  placeholder="Enter department"
                  value={customDeptValue}
                  onChange={handleCustomDeptChange}
                  style={{ width: '100%', padding: '6px', marginTop: '4px' }}
                />
              </div>
            )}
          </div>
          
          <button type="submit" disabled={saving} style={{ padding: '8px 16px' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}

