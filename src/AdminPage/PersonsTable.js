import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

function PersonsTable() {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showArchived, setShowArchived] = useState(false);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // person being edited
  const [showModal, setShowModal] = useState(false);
  const [pendingPerson, setPendingPerson] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPerson, setEditPerson] = useState(null);

  useEffect(() => {
    async function fetchPersons() {
      try {
        setError(null);
        const { data, error: err } = await supabase
          .from('persons')
          .select('*');
        if (err) throw err;
        setPersons(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPersons();
    const interval = setInterval(fetchPersons, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleEdit = (person) => {
    setEditPerson({ ...person });
    setShowEditModal(true);
  };

  // Sorting handler
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // Archive modal
  const handleArchive = async (person) => {
    Swal.fire({
      title: 'Archive Person',
      html: `<div style='margin-bottom:12px;'>Are you sure you want to archive <b>${person.name || person.id}</b>?</div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Archive',
      cancelButtonText: 'Cancel',
      focusCancel: true,
      customClass: { popup: 'swal2-modal' }
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { error: archErr } = await supabase.from('persons').update({ archived: true }).eq('id', person.id);
        if (archErr) {
          Swal.fire('Error', archErr.message, 'error');
        } else {
          setPersons((prev) => prev.map(p => p.id === person.id ? { ...p, archived: true } : p));
          Swal.fire('Archived!', '', 'success');
        }
      }
    });
  };

  // Helper to get photo for a person (latest attendance photo or registration photo)
  const getPersonPhoto = (person) => {
    // Prefer attendance photo if available
    if (attendanceRecords && person && person.id) {
      const att = attendanceRecords.find(r => r.person_id === person.id && r.photo);
      if (att && att.photo) return att.photo;
    }
    // Fallback: use registration photo if available
    if (person && person.registration_photo) return person.registration_photo;
    return null;
  };

  // Fetch attendance records for photos
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  useEffect(() => {
    async function fetchAttendance() {
      const { data, error } = await supabase.from('attendance').select('person_id, photo, device_time').order('device_time', { ascending: false });
      if (!error && data) setAttendanceRecords(data);
    }
    fetchAttendance();
  }, []);

  const closeModal = () => {
    setShowModal(false);
    setPendingPerson(null);
  };

  const handleEditModalClose = () => {
    setShowEditModal(false);
    setEditPerson(null);
  };

  const handleEditModalSave = async (e) => {
    e.preventDefault();
    const { id, name, department, phone_number, address, sex, cash_advance } = editPerson;
    // Ensure checkboxes are stored as 1/0
    const sssVal = !!Number(editPerson.sss) ? 1 : 0;
    const pagIbigVal = !!Number(editPerson.pag_ibig) ? 1 : 0;
    const philhealthVal = !!Number(editPerson.philhealth) ? 1 : 0;
    const { error } = await supabase.from('persons').update({ name, department, phone_number, address, sex, sss: sssVal, pag_ibig: pagIbigVal, philhealth: philhealthVal, cash_advance }).eq('id', id);
    if (error) {
      Swal.fire('Error', error.message, 'error');
    } else {
      setPersons((prev) => prev.map(p => p.id === id ? { ...p, name, department, phone_number, address, sex, sss: sssVal, pag_ibig: pagIbigVal, philhealth: philhealthVal, cash_advance } : p));
      Swal.fire('Updated!', '', 'success');
      handleEditModalClose();
    }
  };

  // Filter and sort
  const filteredPersons = persons.filter(p => {
    if (showArchived ? !p.archived : p.archived) return false;
    const matchesSearch =
      !search ||
      (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
      (p.id && p.id.toLowerCase().includes(search.toLowerCase()));
    const matchesDept = !departmentFilter || (p.department || "") === departmentFilter;
    return matchesSearch && matchesDept;
  });

  const sortedPersons = [...filteredPersons].sort((a, b) => {
    let aVal, bVal;
    if (sortKey === "created_at") {
      aVal = new Date(a.created_at);
      bVal = new Date(b.created_at);
    } else if (sortKey === "name") {
      aVal = (a.name || "").toLowerCase();
      bVal = (b.name || "").toLowerCase();
    } else if (sortKey === "department") {
      aVal = (a.department || "").toLowerCase();
      bVal = (b.department || "").toLowerCase();
    } else {
      aVal = (a[sortKey] || "").toLowerCase();
      bVal = (b[sortKey] || "").toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  if (loading && !persons.length && !error) {
    return <p>Loading persons...</p>;
  }
  if (error) {
    return <p style={{ color: 'red' }}>{error}</p>;
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (!Array.isArray(sortedPersons)) return;
    const exportData = sortedPersons.map(row => ({
      ID: row.id,
      Name: row.name || '',
      Department: row.department || '',
      Phone: row.phone_number || '',
      Address: row.address || '',
      Sex: row.sex || '',
      RegisteredAt: row.created_at ? new Date(row.created_at).toLocaleString() : '',
      SSS: row.sss || '',
      Pag_ibig: row.pag_ibig || '',
      PhilHealth: row.philhealth || '',
      Cash_Advance: row.cash_advance || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Persons');
    XLSX.writeFile(wb, 'persons.xlsx');
  };

  return (
    <div style={{ padding: 32 }}>
      <h2>Registered Persons</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search name or ID"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: 8, minWidth: 200 }}
        />
        <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
          <option value="">All Departments</option>
          {[...new Set(persons.map(p => p.department).filter(Boolean))].map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        <button onClick={() => setShowArchived(a => !a)}>{showArchived ? 'Show Active' : 'Show Archived'}</button>
        <button onClick={handleExportExcel}>Export to Excel</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, border: '1px solid #333', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 16px #0002' }}>
        <thead>
          <tr style={{ background: '#23272f' }}>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('photo')}>Photo</th>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('id')}>ID {sortKey === 'id' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('name')}>Name {sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('department')}>Department {sortKey === 'department' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('phone_number')}>Phone {sortKey === 'phone_number' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('address')}>Address {sortKey === 'address' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('sex')}>Sex {sortKey === 'sex' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th style={{ borderBottom: '1px solid #444', borderRight: '1px solid #444', padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('created_at')}>Registered At {sortKey === 'created_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th style={{ borderBottom: '1px solid #444', padding: 8, textAlign: 'left' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedPersons.map(p => (
            <tr key={p.id} style={{ backgroundColor: p.archived ? '#222' : 'inherit' }}>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>
                {getPersonPhoto(p) ? (
                  <img src={getPersonPhoto(p)} alt="person" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #444' }} />
                ) : (
                  <span style={{ color: '#888' }}>No photo</span>
                )}
              </td>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>{p.id}</td>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>{p.name || ''}</td>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>{p.department || ''}</td>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>{p.phone_number || ''}</td>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>{p.address || ''}</td>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>{p.sex || ''}</td>
              <td style={{ borderBottom: '1px solid #333', borderRight: '1px solid #333', padding: 6 }}>
                {p.created_at ? new Date(p.created_at).toLocaleString() : ''}
              </td>
              <td style={{ borderBottom: '1px solid #333', padding: 6 }}>
                <button onClick={() => handleEdit(p)} style={{ marginRight: 8 }}>Edit</button>
                {!p.archived && <button onClick={() => handleArchive(p)}>Archive</button>}
              </td>
            </tr>
          ))}
          {!sortedPersons.length && (
            <tr>
              <td colSpan={8} style={{ padding: 8 }}>No persons found.</td>
            </tr>
          )}
        </tbody>
      </table>
      {showEditModal && editPerson && (
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
          zIndex: 1001
        }}>
          <div style={{
            background: '#222',
            padding: '32px',
            borderRadius: '8px',
            minWidth: '340px',
            boxShadow: '0 2px 16px #0008',
            position: 'relative'
          }}>
            <button onClick={handleEditModalClose} style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              cursor: 'pointer'
            }}>&times;</button>
            <h3>Edit Person Details</h3>
            <form onSubmit={handleEditModalSave}>
              <div style={{ marginBottom: 8 }}>
                <label>Name<br />
                  <input value={editPerson.name || ''} onChange={e => setEditPerson({ ...editPerson, name: e.target.value })} style={{ width: '100%', padding: 6 }} />
                </label>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>Department<br />
                  <input value={editPerson.department || ''} onChange={e => setEditPerson({ ...editPerson, department: e.target.value })} style={{ width: '100%', padding: 6 }} />
                </label>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>Phone<br />
                  <input value={editPerson.phone_number || ''} onChange={e => setEditPerson({ ...editPerson, phone_number: e.target.value })} style={{ width: '100%', padding: 6 }} />
                </label>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>Address<br />
                  <input value={editPerson.address || ''} onChange={e => setEditPerson({ ...editPerson, address: e.target.value })} style={{ width: '100%', padding: 6 }} />
                </label>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>Sex<br />
                  <select value={editPerson.sex || ''} onChange={e => setEditPerson({ ...editPerson, sex: e.target.value })} style={{ width: '100%', padding: 6 }}>
                    <option value="">Select sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={!!Number(editPerson.sss)} onChange={e => setEditPerson({ ...editPerson, sss: e.target.checked ? 1 : 0 })} /> SSS
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={!!Number(editPerson.pag_ibig)} onChange={e => setEditPerson({ ...editPerson, pag_ibig: e.target.checked ? 1 : 0 })} /> Pag-ibig
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={!!Number(editPerson.philhealth)} onChange={e => setEditPerson({ ...editPerson, philhealth: e.target.checked ? 1 : 0 })} /> PhilHealth
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>Cash Advance<br />
                  <input type="number" value={editPerson.cash_advance || 0} onChange={e => setEditPerson({ ...editPerson, cash_advance: e.target.value })} style={{ width: '100%', padding: 6 }} />
                </label>
              </div>
              <button type="submit" style={{ padding: '8px 16px' }}>Save</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PersonsTable;
