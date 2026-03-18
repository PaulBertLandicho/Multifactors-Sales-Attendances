import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

export default function AttendanceTable() {
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

    const Icons = {
    search: '🔍',
    filter: '⚙️',
    download: '⬇️',
    archive: '📦',
    restore: '↩️',
    add: '➕',
    close: '✖️',
  };

  // Light theme styles with green accent
  const styles = {
    container: {
      margin: '0 auto',
      padding: '32px 24px',
      maxWidth: '1600px',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      backgroundColor: '#ffffff',
      minHeight: '100vh',
      color: '#1f2937',
    },
    header: {
      marginBottom: '32px',
      textAlign: 'center',
    },
    title: {
      fontSize: '2.5rem',
      fontWeight: 700,
      color: '#1f2937',
      marginBottom: '8px',
      display: 'inline-block',
    },
    titleUnderline: {
      height: '4px',
      width: '80px',
      background: '#10b981',
      margin: '0 auto',
      borderRadius: '2px',
    },
    filterBar: {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '24px',
      padding: '20px 24px',
      backgroundColor: '#f9fafb',
      borderRadius: '24px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      border: '1px solid #e5e7eb',
    },
    filterGroup: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      alignItems: 'center',
    },
    filterInput: {
      padding: '10px 16px 10px 36px',
      fontSize: '0.95rem',
      borderRadius: '40px',
      border: '1px solid #d1d5db',
      backgroundColor: '#ffffff',
      color: '#1f2937',
      outline: 'none',
      transition: 'all 0.2s',
      backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: '12px center',
      backgroundSize: '16px',
    },
    filterSelect: {
      padding: '10px 16px',
      fontSize: '0.95rem',
      borderRadius: '40px',
      border: '1px solid #d1d5db',
      backgroundColor: '#ffffff',
      color: '#1f2937',
      outline: 'none',
      cursor: 'pointer',
      minWidth: '140px',
    },
    actionButtons: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
    },
    button: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 20px',
      borderRadius: '40px',
      fontSize: '0.95rem',
      fontWeight: 500,
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
    },
    buttonPrimary: {
      background: '#10b981',
      color: '#ffffff',
    },
    buttonSecondary: {
      background: '#e5e7eb',
      color: '#1f2937',
      border: '1px solid #d1d5db',
    },
    buttonWarning: {
      background: '#f59e0b',
      color: '#ffffff',
    },
    buttonDanger: {
      background: '#ef4444',
      color: '#ffffff',
    },
    tableContainer: {
      borderRadius: '24px',
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.95rem',
      minWidth: '1200px',
    },
    th: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: '#f9fafb',
      color: '#4b5563',
      fontWeight: 600,
      padding: '16px 12px',
      textAlign: 'left',
      borderBottom: '2px solid #e5e7eb',
      letterSpacing: '0.03em',
      textTransform: 'uppercase',
      fontSize: '0.8rem',
    },
    td: {
      padding: '14px 12px',
      borderBottom: '1px solid #e5e7eb',
      color: '#1f2937',
    },
    trHover: {
      transition: 'background 0.2s',
    },
    photoCell: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
    },
    photo: {
      width: '60px',
      height: '60px',
      objectFit: 'cover',
      borderRadius: '12px',
      border: '2px solid #e5e7eb',
    },
    photoTime: {
      fontSize: '0.7rem',
      color: '#6b7280',
    },
    lateText: {
      color: '#ef4444',
      fontWeight: 600,
    },
    actionCell: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
    },
    smallButton: {
      padding: '6px 12px',
      borderRadius: '30px',
      border: 'none',
      fontSize: '0.8rem',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      backgroundColor: '#f3f4f6',
      color: '#1f2937',
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: '#6b7280',
      fontSize: '1.1rem',
    },
  };
  
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
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Attendance Records</h1>
        <div style={styles.titleUnderline} />
      </div>

      {/* Filter Bar */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search name or ID"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={styles.filterInput}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Status</option>
            <option value="late">Late</option>
            <option value="">On-time</option>
          </select>
          <select
            value={eventFilter}
            onChange={e => setEventFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Events</option>
            <option value="time-in">Time-in</option>
            <option value="time-out">Time-out</option>
          </select>
          <select
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Departments</option>
            {Array.from(new Set(persons.map(p => p.department).filter(Boolean))).map(dept => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <div style={styles.actionButtons}>
          <button
            onClick={() => showArchivedModal()}
            style={{ ...styles.button, ...styles.buttonSecondary }}
          >
            <span>{Icons.archive}</span> Archived
          </button>
          <button
            onClick={handleExportExcel}
            style={{ ...styles.button, ...styles.buttonPrimary }}
          >
            <span>{Icons.download}</span> Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableContainer}>
        <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key} style={styles.th}>
                    {col.label}
                  </th>
                ))}
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} style={styles.emptyState}>
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                sortedRecords.map((row, idx) => {
                  const person = persons.find(p => p.id === row.person_id) || {};
                  const rowStyle = {
                    ...styles.trHover,
                    backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#ffffff',
                  };
                  return (
                    <tr key={row.id} style={rowStyle}>
                      {columns.map(col => {
                        if (col.key === 'photo') {
                          return (
                            <td key="photo" style={styles.td}>
                              {row.photo ? (
                                <div style={styles.photoCell}>
                                  <img
                                    src={row.photo}
                                    alt="scan"
                                    style={styles.photo}
                                  />
                                  <span style={styles.photoTime}>
                                    {row.device_time
                                      ? new Date(row.device_time).toLocaleString(undefined, {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit',
                                        })
                                      : ''}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: '#9ca3af' }}>No photo</span>
                              )}
                            </td>
                          );
                        }
                        let value = row[col.key];
                        if (col.key === 'name') value = person.name || '';
                        if (col.key === 'department') value = person.department || '';
                        if (col.key === 'device_time' && row[col.key])
                          value = new Date(row[col.key]).toLocaleString();
                        const isLate = col.key === 'status' && value === 'late';
                        const cellStyle = {
                          ...styles.td,
                          fontFamily: col.key === 'person_id' ? 'monospace' : 'inherit',
                          color: isLate ? styles.lateText.color : styles.td.color,
                          fontWeight: isLate ? 600 : 400,
                        };
                        return (
                          <td key={col.key} style={cellStyle}>
                            {value || '-'}
                          </td>
                        );
                      })}
                      <td style={styles.td}>
                        <div style={styles.actionCell}>
                          {!row.archived ? (
                            <button
                              onClick={() => handleArchive(row)}
                              style={styles.smallButton}
                            >
                              <span>{Icons.archive}</span> Archive
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRestore(row)}
                              style={styles.smallButton}
                            >
                              <span>{Icons.restore}</span> Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

