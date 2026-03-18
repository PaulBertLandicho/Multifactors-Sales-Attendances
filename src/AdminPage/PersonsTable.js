import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { MdFilterList } from 'react-icons/md';
import {
  FiDownload,
  FiArchive,
  FiEdit,
} from 'react-icons/fi';


export default function PersonsTable() {
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

  const Icons = {
    download: <FiDownload />,
    archive: <FiArchive />,
    edit: <FiEdit />,
  };
  

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
            {[...new Set(persons.map((p) => p.department).filter(Boolean))].map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
         <button
  onClick={() => setShowArchived((a) => !a)}
  style={{ ...styles.button, ...styles.buttonSecondary }}
>
  {showArchived ? (
    <>
      {Icons.archive} Show Active
    </>
  ) : (
    <>
      {Icons.archive} Show Archived
    </>
  )}
</button>

</div>

<button
  onClick={handleExportExcel}
  style={{ ...styles.button, ...styles.buttonPrimary }}
>
  {Icons.download} Export Excel
</button>
      </div>

      {/* Table */}
      <div style={styles.tableContainer}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => handleSort('photo')}>
                  Photo {sortKey === 'photo' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('id')}>
                  ID {sortKey === 'id' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('name')}>
                  Name {sortKey === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('department')}>
                  Department {sortKey === 'department' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('phone_number')}>
                  Phone {sortKey === 'phone_number' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('address')}>
                  Address {sortKey === 'address' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('sex')}>
                  Sex {sortKey === 'sex' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('created_at')}>
                  Registered At {sortKey === 'created_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPersons.length === 0 ? (
                <tr>
                  <td colSpan={9} style={styles.emptyState}>
                    No persons found.
                  </td>
                </tr>
              ) : (
                sortedPersons.map((p, idx) => {
                  const rowStyle = {
                    ...styles.tr,
                    backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#ffffff',
                  };
                  return (
                    <tr key={p.id} style={rowStyle}>
                      <td style={styles.td}>
                        {getPersonPhoto(p) ? (
                          <img src={getPersonPhoto(p)} alt="person" style={styles.photo} />
                        ) : (
                          <span style={{ color: '#9ca3af' }}>No photo</span>
                        )}
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>{p.id}</td>
                      <td style={styles.td}>{p.name || ''}</td>
                      <td style={styles.td}>{p.department || ''}</td>
                      <td style={styles.td}>{p.phone_number || ''}</td>
                      <td style={styles.td}>{p.address || ''}</td>
                      <td style={styles.td}>{p.sex || ''}</td>
                      <td style={styles.td}>
                        {p.created_at ? new Date(p.created_at).toLocaleString() : ''}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionCell}>
                          <button
                            onClick={() => handleEdit(p)}
                            style={{ ...styles.smallButton, ...styles.buttonSuccess }}
                          >
                            {Icons.edit} Edit
                          </button>
                          {!p.archived && (
                            <button
                              onClick={() => handleArchive(p)}
                              style={{ ...styles.smallButton, ...styles.buttonSecondary }}
                            >
                             {Icons.archive} Export Excel
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
                <label style={styles.modalLabel}>Name</label>
                <input
                  value={editPerson.name || ''}
                  onChange={(e) => setEditPerson({ ...editPerson, name: e.target.value })}
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Department</label>
                <input
                  value={editPerson.department || ''}
                  onChange={(e) => setEditPerson({ ...editPerson, department: e.target.value })}
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Phone</label>
                <input
                  value={editPerson.phone_number || ''}
                  onChange={(e) => setEditPerson({ ...editPerson, phone_number: e.target.value })}
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Address</label>
                <input
                  value={editPerson.address || ''}
                  onChange={(e) => setEditPerson({ ...editPerson, address: e.target.value })}
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Sex</label>
                <select
                  value={editPerson.sex || ''}
                  onChange={(e) => setEditPerson({ ...editPerson, sex: e.target.value })}
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
                      onChange={(e) => setEditPerson({ ...editPerson, sss: e.target.checked ? 1 : 0 })}
                    />
                    SSS
                  </label>
                  <label style={styles.modalCheckbox}>
                    <input
                      type="checkbox"
                      checked={!!Number(editPerson.pag_ibig)}
                      onChange={(e) => setEditPerson({ ...editPerson, pag_ibig: e.target.checked ? 1 : 0 })}
                    />
                    Pag-ibig
                  </label>
                  <label style={styles.modalCheckbox}>
                    <input
                      type="checkbox"
                      checked={!!Number(editPerson.philhealth)}
                      onChange={(e) => setEditPerson({ ...editPerson, philhealth: e.target.checked ? 1 : 0 })}
                    />
                    PhilHealth
                  </label>
                </div>
              </div>
              <div style={styles.modalField}>
                <label style={styles.modalLabel}>Cash Advance</label>
                <input
                  type="number"
                  value={editPerson.cash_advance || 0}
                  onChange={(e) => setEditPerson({ ...editPerson, cash_advance: e.target.value })}
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalActions}>
                <button type="submit" style={{ ...styles.button, ...styles.buttonPrimary }}>
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
    maxWidth: '1600px',
    margin: '40px auto',
    padding: '40px 32px',
    background: '#ffffff',
    borderRadius: '32px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
    color: '#1f2937',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '2.8rem',
    fontWeight: 700,
    color: '#1f2937',
    margin: 0,
    display: 'inline-block',
  },
  titleUnderline: {
    height: '4px',
    width: '100px',
    background: '#10b981',
    margin: '8px auto 0',
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
    borderRadius: '20px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  filterGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  },
  searchWrapper: {
    position: 'relative',
  },
  searchInput: {
    padding: '12px 16px 12px 40px',
    fontSize: '0.95rem',
    borderRadius: '40px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'all 0.2s',
    backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '16px center',
    backgroundSize: '16px',
    minWidth: '250px',
  },
  select: {
    padding: '12px 20px',
    fontSize: '0.95rem',
    borderRadius: '40px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '160px',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 28px',
    borderRadius: '40px',
    fontSize: '1rem',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
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
  buttonSuccess: {
    background: '#10b981',
    color: '#ffffff',
  },
  smallButton: {
    padding: '6px 12px',
    borderRadius: '30px',
    border: 'none',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  tableContainer: {
    borderRadius: '20px',
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  tableWrapper: {
    overflowX: 'auto',
    maxHeight: '600px',
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
    cursor: 'pointer',
  },
  td: {
    padding: '14px 12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#1f2937',
  },
  tr: {
    transition: 'background 0.2s',
  },
  photo: {
    width: '48px',
    height: '48px',
    objectFit: 'cover',
    borderRadius: '12px',
    border: '2px solid #e5e7eb',
  },
  actionCell: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#6b7280',
    fontSize: '1.1rem',
  },
  error: {
    color: '#ef4444',
    textAlign: 'center',
    padding: '40px',
    background: '#ffffff',
    borderRadius: '32px',
    margin: '40px auto',
    maxWidth: '800px',
  },
  spinnerContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '300px',
    background: '#ffffff',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #10b981',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    background: '#ffffff',
    padding: '40px',
    borderRadius: '28px',
    minWidth: '400px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
    border: '1px solid #e5e7eb',
    position: 'relative',
    color: '#1f2937',
  },
  modalClose: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    fontSize: '1.8rem',
    cursor: 'pointer',
    lineHeight: 1,
  },
  modalTitle: {
    fontSize: '1.8rem',
    fontWeight: 600,
    marginBottom: '24px',
    color: '#1f2937',
    textAlign: 'center',
  },
  modalField: {
    marginBottom: '16px',
  },
  modalLabel: {
    display: 'block',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#4b5563',
    marginBottom: '6px',
  },
  modalInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '1rem',
    borderRadius: '12px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
  },
  modalSelect: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '1rem',
    borderRadius: '12px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#1f2937',
    outline: 'none',
  },
  modalCheckboxGroup: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  modalCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#1f2937',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  },
};

// Add global keyframes and focus styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  input:focus, select:focus, button:focus {
    border-color: #10b981 !important;
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
    background: #10b981 !important;
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

