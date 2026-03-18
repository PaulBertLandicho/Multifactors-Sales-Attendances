import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

function AttendanceTable() {
    // Search, filter, and sort state
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [eventFilter, setEventFilter] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("");
    const [sortKey, setSortKey] = useState("device_time");
    const [sortOrder, setSortOrder] = useState("desc");
  const [showArchived, setShowArchived] = useState(false);
  const [records, setRecords] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // record being edited
  const [form, setForm] = useState({
    person_id: '',
    event: 'time-in',
    status: '',
    method: '',
    device_time: '',
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setError(null);
        // Fetch attendance from supabase
        const { data: attData, error: attErr } = await supabase
          .from('attendance')
          .select('*');
        if (attErr) throw attErr;
        setRecords(attData || []);
        // Fetch persons from supabase
        const { data: personsData, error: personsErr } = await supabase
          .from('persons')
          .select('id, name, department');
        if (personsErr) throw personsErr;
        setPersons(personsData || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !records.length && !error) {
    return <p>Loading attendance records...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>{error}</p>;
  }

  // Form handlers
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAdd = () => {
    setForm({ person_id: '', event: 'time-in', status: '', method: '', device_time: '' });
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (rec) => {
    setForm({
      person_id: rec.person_id,
      event: rec.event,
      status: rec.status,
      method: rec.method,
      device_time: rec.device_time ? new Date(rec.device_time).toISOString().slice(0, 16) : '',
    });
    setEditing(rec);
    showEditModal({
      ...rec,
      device_time: rec.device_time ? new Date(rec.device_time).toISOString().slice(0, 16) : '',
    });
  };

  // Show edit form in SweetAlert2 modal
  function showEditModal(editRec) {
    let html = `<form id='edit-attendance-form' style='display:flex;flex-direction:column;gap:12px;'>`;
    html += `<label>Person: <select name='person_id' required style='margin-left:8px;'>`;
    html += `<option value=''>Select person</option>`;
    persons.forEach(p => {
      html += `<option value='${p.id}'${editRec.person_id === p.id ? ' selected' : ''}>${p.name} (${p.id})</option>`;
    });
    html += `</select></label>`;
    html += `<label>Event: <select name='event' required style='margin-left:8px;'>`;
    html += `<option value='time-in'${editRec.event === 'time-in' ? ' selected' : ''}>Time-in</option>`;
    html += `<option value='time-out'${editRec.event === 'time-out' ? ' selected' : ''}>Time-out</option>`;
    html += `</select></label>`;
    html += `<label>Status: <select name='status' style='margin-left:8px;'>`;
    html += `<option value=''${!editRec.status ? ' selected' : ''}>Normal</option>`;
    html += `<option value='late'${editRec.status === 'late' ? ' selected' : ''}>Late</option>`;
    html += `</select></label>`;
    html += `<label>Method: <input name='method' value='${editRec.method || ''}' style='margin-left:8px;' placeholder='e.g. face, manual' /></label>`;
    html += `<label>Date/Time: <input type='datetime-local' name='device_time' value='${editRec.device_time || ''}' style='margin-left:8px;' required /></label>`;
    html += `</form>`;
    Swal.fire({
      title: 'Edit Attendance',
      html,
      showCancelButton: true,
      confirmButtonText: 'Update',
      focusConfirm: false,
      preConfirm: () => {
        const formEl = document.getElementById('edit-attendance-form');
        const formData = new FormData(formEl);
        const updated = {
          person_id: formData.get('person_id'),
          event: formData.get('event'),
          status: formData.get('status'),
          method: formData.get('method'),
          device_time: formData.get('device_time'),
        };
        if (!updated.person_id || !updated.event || !updated.device_time) {
          Swal.showValidationMessage('Person, event, and time are required.');
          return false;
        }
        return updated;
      },
    }).then(async (result) => {
      if (result.isConfirmed && editing) {
        const payload = {
          person_id: result.value.person_id,
          event: result.value.event,
          status: result.value.status,
          method: result.value.method,
          device_time: new Date(result.value.device_time).toISOString(),
        };
        const { error: upErr } = await supabase.from('attendance').update(payload).eq('id', editing.id);
        if (upErr) {
          Swal.fire('Error', upErr.message, 'error');
        } else {
          setShowForm(false);
          setEditing(null);
          setLoading(true);
          const { data: attData } = await supabase.from('attendance').select('*');
          setRecords(attData || []);
          setLoading(false);
          Swal.fire('Updated!', '', 'success');
        }
      }
    });
  }

  // Archive (soft delete)
  const handleArchive = async (rec) => {
    const confirm = await Swal.fire({
      title: 'Archive Attendance',
      text: 'Are you sure you want to archive this record?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Archive',
    });
    if (confirm.isConfirmed) {
      const { error: archErr } = await supabase.from('attendance').update({ archived: true }).eq('id', rec.id);
      if (archErr) {
        Swal.fire('Error', archErr.message, 'error');
      } else {
        setRecords((prev) => prev.map(r => r.id === rec.id ? { ...r, archived: true } : r));
        Swal.fire('Archived!', '', 'success');
      }
    }
  };

  // Restore archived record
  const handleRestore = async (rec) => {
    const { error: resErr } = await supabase.from('attendance').update({ archived: false }).eq('id', rec.id);
    if (resErr) {
      Swal.fire('Error', resErr.message, 'error');
    } else {
      setRecords((prev) => prev.map(r => r.id === rec.id ? { ...r, archived: false } : r));
      Swal.fire('Restored!', '', 'success');
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!form.person_id || !form.event || !form.device_time) {
      Swal.fire('Error', 'Person, event, and time are required.', 'error');
      return;
    }
    const payload = {
      person_id: form.person_id,
      event: form.event,
      status: form.status,
      method: form.method,
      device_time: new Date(form.device_time).toISOString(),
    };
    if (editing) {
      // Update
      const { error: upErr } = await supabase.from('attendance').update(payload).eq('id', editing.id);
      if (upErr) {
        Swal.fire('Error', upErr.message, 'error');
        return;
      }
    } else {
      // Insert
      const { error: inErr } = await supabase.from('attendance').insert([payload]);
      if (inErr) {
        Swal.fire('Error', inErr.message, 'error');
        return;
      }
    }
    setShowForm(false);
    setEditing(null);
    setForm({ person_id: '', event: 'time-in', status: '', method: '', device_time: '' });
    // Refresh
    setLoading(true);
    const { data: attData } = await supabase.from('attendance').select('*');
    setRecords(attData || []);
    setLoading(false);
  };

  // Sort by device_time descending (latest first)
  // Filter and sort records
  const filteredRecords = records.filter(r => {
    if (r.archived) return false;
    const person = persons.find(p => p.id === r.person_id) || {};
    // Search by name or person_id
    const matchesSearch =
      !search ||
      (person.name && person.name.toLowerCase().includes(search.toLowerCase())) ||
      (r.person_id && r.person_id.toLowerCase().includes(search.toLowerCase()));
    // Status filter
    const matchesStatus = !statusFilter || (r.status || "") === statusFilter;
    // Event filter
    const matchesEvent = !eventFilter || r.event === eventFilter;
    // Department filter
    const matchesDept = !departmentFilter || (person.department || "") === departmentFilter;
    return matchesSearch && matchesStatus && matchesEvent && matchesDept;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let aVal, bVal;
    if (sortKey === "device_time") {
      aVal = new Date(a.device_time);
      bVal = new Date(b.device_time);
    } else if (sortKey === "name") {
      const aPerson = persons.find(p => p.id === a.person_id) || {};
      const bPerson = persons.find(p => p.id === b.person_id) || {};
      aVal = (aPerson.name || "").toLowerCase();
      bVal = (bPerson.name || "").toLowerCase();
    } else if (sortKey === "department") {
      const aPerson = persons.find(p => p.id === a.person_id) || {};
      const bPerson = persons.find(p => p.id === b.person_id) || {};
      aVal = (aPerson.department || "").toLowerCase();
      bVal = (bPerson.department || "").toLowerCase();
    } else {
      aVal = (a[sortKey] || "").toLowerCase();
      bVal = (b[sortKey] || "").toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Archived records (not filtered)
  const archivedRecords = [...records].filter(r => r.archived).sort((a, b) => new Date(b.device_time) - new Date(a.device_time));

  const columns = [
    { key: 'photo', label: 'Photo' },
    { key: 'device_time', label: 'Time' },
    { key: 'person_id', label: 'Person ID' },
    { key: 'name', label: 'Name' },
    { key: 'department', label: 'Department' },
    { key: 'event', label: 'Attendance Event' },
    { key: 'status', label: 'Status' },
    { key: 'method', label: 'Attendance Method' },
  ];

  // Export to Excel
  const handleExportExcel = () => {
    if (!Array.isArray(sortedRecords) || !Array.isArray(persons)) return;
    const exportData = sortedRecords.map(row => {
      const person = persons.find(p => p.id === row.person_id) || {};
      return {
        Time: row.device_time ? new Date(row.device_time).toLocaleString() : '',
        'Person ID': row.person_id,
        Name: person.name || '',
        Department: person.department || '',
        'Attendance Event': row.event,
        Status: row.status,
        'Attendance Method': row.method,
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, 'attendance_records.xlsx');
  };


  // Show archived table in SweetAlert2 modal
  function showArchivedModal() {
    let html = '';
    if (archivedRecords.length === 0) {
      html = `<div style='color:#aaa;text-align:center;padding:24px;'>No archived records.</div>`;
    } else {
      html = `<div style='max-height:500px;overflow:auto;width:100%;border:1px solid #333;border-radius:10px;background:#181a20;box-shadow:0 2px 16px #0006;margin-bottom:32px;'>`;
      html += `<table style='min-width:1200px;border-collapse:collapse;font-size:16px;table-layout:fixed;width:100%'>`;
      html += `<thead><tr>`;
      columns.forEach(col => {
        html += `<th style='border-bottom:2px solid #444;padding:14px 10px;text-align:left;background-color:#23272f;font-weight:700;letter-spacing:0.5px;min-width:${
          col.key === 'device_time' ? 160 :
          col.key === 'person_id' ? 220 :
          col.key === 'name' ? 160 :
          col.key === 'department' ? 120 :
          col.key === 'event' ? 120 :
          col.key === 'status' ? 90 :
          col.key === 'method' ? 140 :
          100
        }px;'>${col.label}</th>`;
      });
      html += `<th style='border-bottom:2px solid #444;padding:14px 10px;background-color:#23272f;min-width:120px;'>Actions</th>`;
      html += `</tr></thead><tbody>`;
      archivedRecords.forEach((row, idx) => {
        const person = persons.find(p => p.id === row.person_id) || {};
        html += `<tr style='background:${idx % 2 === 0 ? '#20232a' : '#181a20'};'>`;
        columns.forEach(col => {
          let value = row[col.key];
          if (col.key === 'name') value = person.name || '';
          if (col.key === 'department') value = person.department || '';
          if (col.key === 'device_time' && row[col.key]) value = new Date(row[col.key]).toLocaleString();
          const isLate = col.key === 'status' && value === 'late';
          html += `<td style='border-bottom:1px solid #333;padding:12px 8px;font-family:${col.key === 'person_id' ? 'monospace' : 'inherit'};font-size:15px;color:${isLate ? '#f44336' : 'inherit'};font-weight:${isLate ? 'bold' : 'normal'};'>${value || ''}</td>`;
        });
        html += `<td style='border-bottom:1px solid #333;padding:12px 8px;min-width:120px;background:${idx % 2 === 0 ? '#20232a' : '#181a20'};'>`;
        html += `<button class='restore-btn' data-idx='${idx}' style='padding:4px 10px;'>Restore</button>`;
        html += `</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }
    Swal.fire({
      title: 'Archived Attendance Records',
      html,
      width: '90%',
      showCloseButton: true,
      showConfirmButton: false,
      customClass: {
        popup: 'archived-modal-popup',
        htmlContainer: 'archived-modal-html',
      },
      didOpen: () => {
        document.querySelectorAll('.restore-btn').forEach(btn => {
          btn.onclick = () => {
            const idx = btn.getAttribute('data-idx');
            handleRestore(archivedRecords[idx]);
            Swal.close();
          };
        });
      },
    });
  }

  return (
    <div style={{ marginLeft: '32px', marginTop: '32px', width: '100%', Width: '100px' }}>
      <h2 style={{ marginBottom: 24, textAlign: 'center', fontSize: 32, fontWeight: 700 }}>Attendance Records</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search name or ID"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', fontSize: 15, borderRadius: 6, border: '1px solid #888', minWidth: 180 }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
            <option value="">All Status</option>
            <option value="late">Late</option>
            <option value="">On-time</option>
          </select>
          <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
            <option value="">All Events</option>
            <option value="time-in">Time-in</option>
            <option value="time-out">Time-out</option>
          </select>
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
            <option value="">All Departments</option>
            {Array.from(new Set(persons.map(p => p.department).filter(Boolean))).map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
          {/* <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
            <option value="device_time">Sort by Time</option>
            <option value="name">Sort by Name</option>
            <option value="department">Sort by Department</option>
            <option value="status">Sort by Status</option>
            <option value="event">Sort by Event</option>
          </select> */}
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => showArchivedModal()}
            style={{ padding: '8px 18px', fontSize: 16 }}
          >
            Show Archived
          </button>
          <button onClick={handleExportExcel} style={{ padding: '8px 18px', fontSize: 16 }}>Export to Excel</button>
        </div>
      </div>
      {/* Edit form is now shown in a modal, not inline */}
      {/* Show Archived and Export to Excel buttons are now together above */}
      <div id="attendance-table-print" style={{ maxHeight: '500px', overflow: 'auto', width: '100%', border: '1px solid #333', borderRadius: 10, background: '#181a20', boxShadow: '0 2px 16px #0006' }}>
        <table style={{ minWidth: 1200, borderCollapse: 'collapse', fontSize: 16, tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    backgroundColor: '#23272f',
                    borderBottom: '2px solid #444',
                    padding: '14px 10px',
                    textAlign: 'left',
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    minWidth:
                      col.key === 'device_time' ? 160 :
                      col.key === 'person_id' ? 220 :
                      col.key === 'name' ? 160 :
                      col.key === 'department' ? 120 :
                      col.key === 'event' ? 120 :
                      col.key === 'status' ? 90 :
                      col.key === 'method' ? 140 :
                      undefined,
                  }}
                >
                  {col.label}
                </th>
              ))}
              <th
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  backgroundColor: '#23272f',
                  borderBottom: '2px solid #444',
                  padding: '14px 10px',
                  minWidth: 120,
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((row, idx) => {
              const person = persons.find(p => p.id === row.person_id) || {};
              return (
                <tr key={idx} style={{ background: idx % 2 === 0 ? '#20232a' : 'transparent' }}>
                  {columns.map((col) => {
                    if (col.key === 'photo') {
                      return (
                        <td key="photo" style={{ borderBottom: '1px solid #333', padding: '12px 8px', textAlign: 'center', minWidth: 120 }}>
                          {row.photo ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <img src={row.photo} alt="scan" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 4, border: '1px solid #444' }} />
                              <span style={{ fontSize: 12, color: '#bbb' }}>
                                {row.device_time ?
                                  `Attendance Time: ${new Date(row.device_time).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                  : ''}
                              </span>
                            </div>
                          ) : ''}
                        </td>
                      );
                    }
                    let value = row[col.key];
                    if (col.key === 'name') value = person.name || '';
                    if (col.key === 'department') value = person.department || '';
                    if (col.key === 'device_time' && row[col.key]) value = new Date(row[col.key]).toLocaleString();
                    const isLate = col.key === 'status' && value === 'late';
                    return (
                      <td
                        key={col.key}
                        style={{
                          borderBottom: '1px solid #333',
                          padding: '12px 8px',
                          fontFamily: col.key === 'person_id' ? 'monospace' : undefined,
                          fontSize: 15,
                          color: isLate ? '#f44336' : 'inherit',
                          fontWeight: isLate ? 'bold' : 'normal',
                        }}
                      >
                        {value || ''}
                      </td>
                    );
                  })}
                  <td
                    style={{
                      borderBottom: '1px solid #333',
                      padding: '12px 8px',
                      minWidth: 120,
                      background: idx % 2 === 0 ? '#20232a' : '#181a20',
                    }}
                  >
                    {!row.archived ? (
                      <>
                        {/* <button onClick={() => handleEdit(row)} style={{ marginRight: 8, padding: '4px 10px' }}>Edit</button> */}
                        <button onClick={() => handleArchive(row)} style={{ padding: '4px 10px' }}>Archive</button>
                      </>
                    ) : (
                      <button onClick={() => handleRestore(row)} style={{ padding: '4px 10px' }}>Restore</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AttendanceTable;