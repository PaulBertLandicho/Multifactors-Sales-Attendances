import { useEffect, useState } from "react";
// import { supabase } from '../supabaseClient';
import { supabase } from "../supabaseClient";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import { MdFilterList } from "react-icons/md";
import {
  FiDownload,
  FiArchive,
  FiRotateCcw,
  FiPlus,
  FiX,
} from "react-icons/fi";

export default function AttendanceTable() {
  // Search, filter, and sort state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey] = useState("device_time");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedDate, setSelectedDate] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [records, setRecords] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  // Removed unused form and setForm state
  // const [showForm, setShowForm] = useState(false); // Removed as unused

  // Helper to format ISO date/time as "April 07, 2026 10:15:30"
  const formatDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const datePart = date.toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    // Insert a dash between date and time for clearer separation
    return `${datePart} - ${timePart}`;
  };

  const Icons = {
    filter: <MdFilterList />,
    download: <FiDownload />,
    archive: <FiArchive />,
    restore: <FiRotateCcw />,
    add: <FiPlus />,
    close: <FiX />,
  };

  // Light theme styles with green accent
  const styles = {
    container: {
      margin: "0 auto",
      padding: "32px 24px",
      maxWidth: "1600px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      backgroundColor: "#ffffff",
      minHeight: "100vh",
      color: "#1f2937",
    },
    header: {
      marginBottom: "32px",
      textAlign: "center",
    },
    title: {
      fontSize: "2.5rem",
      fontWeight: 700,
      color: "#1f2937",
      marginBottom: "8px",
      display: "inline-block",
    },
    titleUnderline: {
      height: "4px",
      width: "80px",
      background: "#10b981",
      margin: "0 auto",
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
      borderRadius: "24px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
      border: "1px solid #e5e7eb",
    },
    filterGroup: {
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      alignItems: "center",
    },
    filterInput: {
      padding: "10px 16px 10px 36px",
      fontSize: "0.95rem",
      borderRadius: "40px",
      border: "1px solid #d1d5db",
      backgroundColor: "#ffffff",
      color: "#1f2937",
      outline: "none",
      transition: "all 0.2s",
      backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "12px center",
      backgroundSize: "16px",
    },
    filterSelect: {
      padding: "10px 16px",
      fontSize: "0.95rem",
      borderRadius: "40px",
      border: "1px solid #d1d5db",
      backgroundColor: "#ffffff",
      color: "#1f2937",
      outline: "none",
      cursor: "pointer",
      minWidth: "140px",
    },
    actionButtons: {
      display: "flex",
      gap: "12px",
      flexWrap: "wrap",
    },
    button: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      padding: "10px 20px",
      borderRadius: "40px",
      fontSize: "0.95rem",
      fontWeight: 500,
      border: "none",
      cursor: "pointer",
      transition: "all 0.2s",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
    },
    buttonPrimary: {
      background: "#10b981",
      color: "#ffffff",
    },
    buttonSecondary: {
      background: "#e5e7eb",
      color: "#1f2937",
      border: "1px solid #d1d5db",
    },
    buttonWarning: {
      background: "#f59e0b",
      color: "#ffffff",
    },
    buttonDanger: {
      background: "#ef4444",
      color: "#ffffff",
    },
    tableContainer: {
      borderRadius: "24px",
      overflow: "hidden",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
      backgroundColor: "#ffffff",
      border: "1px solid #e5e7eb",
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
    },
    td: {
      padding: "14px 12px",
      borderBottom: "1px solid #e5e7eb",
      color: "#1f2937",
    },
    trHover: {
      transition: "background 0.2s",
    },
    photoCell: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
    },
    photo: {
      width: "60px",
      height: "60px",
      objectFit: "cover",
      borderRadius: "12px",
      border: "2px solid #e5e7eb",
    },
    photoTime: {
      fontSize: "0.7rem",
      color: "#6b7280",
    },
    lateText: {
      color: "#ef4444",
      fontWeight: 600,
    },
    actionCell: {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
    },
    smallButton: {
      padding: "6px 12px",
      borderRadius: "30px",
      border: "none",
      fontSize: "0.8rem",
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.2s",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      backgroundColor: "#f3f4f6",
      color: "#1f2937",
    },
    emptyState: {
      textAlign: "center",
      padding: "60px 20px",
      color: "#6b7280",
      fontSize: "1.1rem",
    },
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setError(null);
        // Fetch attendance from supabase
        const { data: attData, error: attErr } = await supabase
          .from("attendance")
          .select("*");
        if (attErr) throw attErr;
        setRecords(attData || []);
        // Fetch persons from supabase
        const { data: personsData, error: personsErr } = await supabase
          .from("persons")
          .select("id, name, department");
        if (personsErr) throw personsErr;
        setPersons(personsData || []);
        // Fetch work hours settings from supabase
        const { data: settingsData, error: settingsErr } = await supabase
          .from("settings")
          .select("*")
          .eq("id", 1)
          .single();
        if (settingsErr) throw settingsErr;
        setSettings(settingsData || null);
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
    return <p style={{ color: "red" }}>{error}</p>;
  }

  // Form handlers
  // const handleFormChange = (e) => {
  //   const { name, value } = e.target;
  //   setForm((prev) => ({ ...prev, [name]: value }));
  // };

  // const handleAdd = () => {
  //   setForm({ person_id: '', event: 'time-in', status: '', method: '', device_time: '' });
  //   setEditing(null);
  //   setShowForm(true);
  // };

  // const handleEdit = (rec) => {
  //   setForm({
  //     person_id: rec.person_id,
  //     event: rec.event,
  //     status: rec.status,
  //     method: rec.method,
  //     device_time: rec.device_time ? new Date(rec.device_time).toISOString().slice(0, 16) : '',
  //   });
  //   setEditing(rec);
  //   showEditModal({
  //     ...rec,
  //     device_time: rec.device_time ? new Date(rec.device_time).toISOString().slice(0, 16) : '',
  //   });
  // };

  // Show edit form in SweetAlert2 modal
  // Removed unused showEditModal function

  // Archive (soft delete)
  const handleArchive = async (rec) => {
    const confirm = await Swal.fire({
      title: "Archive Attendance",
      text: "Are you sure you want to archive this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Archive",
    });
    if (confirm.isConfirmed) {
      const { error: archErr } = await supabase
        .from("attendance")
        .update({ archived: true })
        .eq("id", rec.id);
      if (archErr) {
        Swal.fire("Error", archErr.message, "error");
      } else {
        setRecords((prev) =>
          prev.map((r) => (r.id === rec.id ? { ...r, archived: true } : r))
        );
        Swal.fire("Archived!", "", "success");
      }
    }
  };

  // Restore archived record
  const handleRestore = async (rec) => {
    const { error: resErr } = await supabase
      .from("attendance")
      .update({ archived: false })
      .eq("id", rec.id);
    if (resErr) {
      Swal.fire("Error", resErr.message, "error");
    } else {
      setRecords((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, archived: false } : r))
      );
      Swal.fire("Restored!", "", "success");
    }
  };

  // const handleFormSubmit = async (e) => {
  //   e.preventDefault();
  //   if (!form.person_id || !form.event || !form.device_time) {
  //     Swal.fire('Error', 'Person, event, and time are required.', 'error');
  //     return;
  //   }
  //   const payload = {
  //     person_id: form.person_id,
  //     event: form.event,
  //     status: form.status,
  //     method: form.method,
  //     device_time: new Date(form.device_time).toISOString(),
  //   };
  //   if (editing) {
  //     // Update
  //     const { error: upErr } = await supabase.from('attendance').update(payload).eq('id', editing.id);
  //     if (upErr) {
  //       Swal.fire('Error', upErr.message, 'error');
  //       return;
  //     }
  //   } else {
  //     // Insert
  //     const { error: inErr } = await supabase.from('attendance').insert([payload]);
  //     if (inErr) {
  //       Swal.fire('Error', inErr.message, 'error');
  //       return;
  //     }
  //   }
  //   setShowForm(false);
  //   setEditing(null);
  //   setForm({ person_id: '', event: 'time-in', status: '', method: '', device_time: '' });
  //   // Refresh
  //   setLoading(true);
  //   const { data: attData } = await supabase.from('attendance').select('*');
  //   setRecords(attData || []);
  //   setLoading(false);
  // };

  // Sort by device_time descending (latest first)
  // Filter and sort records
  const filteredRecords = records.filter((r) => {
    if (r.archived) return false;
    const person = persons.find((p) => p.id === r.person_id) || {};
    // Search by name or person_id
    const matchesSearch =
      !search ||
      (person.name &&
        person.name.toLowerCase().includes(search.toLowerCase())) ||
      (r.person_id && r.person_id.toLowerCase().includes(search.toLowerCase()));
    // Status filter
    const matchesStatus = !statusFilter || (r.status || "") === statusFilter;
    // Department filter
    const matchesDept =
      !departmentFilter || (person.department || "") === departmentFilter;
    // Date filter (match full yyyy-mm-dd)
    const recordDate = r.device_time
      ? new Date(r.device_time).toISOString().slice(0, 10)
      : null;
    const matchesDate = !selectedDate || recordDate === selectedDate;
    return matchesSearch && matchesStatus && matchesDept && matchesDate;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let aVal, bVal;
    if (sortKey === "device_time") {
      aVal = new Date(a.device_time);
      bVal = new Date(b.device_time);
    } else if (sortKey === "name") {
      const aPerson = persons.find((p) => p.id === a.person_id) || {};
      const bPerson = persons.find((p) => p.id === b.person_id) || {};
      aVal = (aPerson.name || "").toLowerCase();
      bVal = (bPerson.name || "").toLowerCase();
    } else if (sortKey === "department") {
      const aPerson = persons.find((p) => p.id === a.person_id) || {};
      const bPerson = persons.find((p) => p.id === b.person_id) || {};
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
  const archivedRecords = [...records]
    .filter((r) => r.archived)
    .filter((r) => {
      if (!selectedDate) return true;
      const rd = r.device_time ? new Date(r.device_time).toISOString().slice(0, 10) : null;
      return rd === selectedDate;
    })
    .sort((a, b) => new Date(b.device_time) - new Date(a.device_time));

  const columns = [
    { key: "photo", label: "Photo" },
    { key: "device_time", label: "Attendance Time" },
    { key: "person_id", label: "Person ID" },
    { key: "name", label: "Employee Name" },
    { key: "department", label: "Department" },
    // { key: 'shift', label: 'Shift' },
    { key: "work_hours", label: "Work Hours" },
    { key: "status", label: "Attendance Status" },
    { key: "method", label: "Attendance Method" },
  ];

  // Export to Excel
  const handleExportExcel = () => {
    if (!Array.isArray(sortedRecords) || !Array.isArray(persons)) return;
    const exportData = sortedRecords.map((row) => {
      const person = persons.find((p) => p.id === row.person_id) || {};
      return {
        Time: row.device_time ? formatDateTime(row.device_time) : "",
        "Person ID": row.person_id,
        Name: person.name || "",
        Department: person.department || "",
        "Attendance Event": row.event,
        Status: row.status,
        "Attendance Method": row.method,
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, "attendance_records.xlsx");
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Attendance Records</h1>
        <div style={styles.titleUnderline} />
      </div>

      {/* Filter Bar */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <div style={{ position: "relative" }}>
            <span style={styles.searchIcon}>{Icons.search}</span>
            <input
              type="text"
              placeholder="Search name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.filterInput}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Status</option>
            <option value="late">Late</option>
            <option value="on-time">On-time</option>
            <option value="overtime">Overtime</option>
          </select>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Departments</option>
            {Array.from(
              new Set(persons.map((p) => p.department).filter(Boolean))
            ).map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={styles.filterSelect}
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              style={{ ...styles.smallButton, marginLeft: 4 }}
            >
              {Icons.close} Clear
            </button>
          )}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <div style={styles.actionButtons}>
          <button
            onClick={() => setShowArchived((a) => !a)}
            style={{ ...styles.button, ...styles.buttonSecondary }}
          >
            {Icons.archive} {showArchived ? "Show Active" : "Show Archived"}
          </button>
          <button
            onClick={handleExportExcel}
            style={{ ...styles.button, ...styles.buttonPrimary }}
          >
            {Icons.download} Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableContainer}>
        <div style={{ overflowX: "auto", maxHeight: "600px" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} style={styles.th}>
                    {col.label}
                  </th>
                ))}
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(showArchived ? archivedRecords : sortedRecords).length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} style={styles.emptyState}>
                    {showArchived
                      ? "No archived attendance records found."
                      : "No attendance records found."}
                  </td>
                </tr>
              ) : (
                (showArchived ? archivedRecords : sortedRecords).map(
                  (row, idx) => {
                    const person =
                      persons.find((p) => p.id === row.person_id) || {};
                    const rowStyle = {
                      ...styles.trHover,
                      backgroundColor: idx % 2 === 0 ? "#f9fafb" : "#ffffff",
                    };
                    return (
                      <tr key={row.id} style={rowStyle}>
                        {columns.map((col) => {
                          if (col.key === "photo") {
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
                                        ? new Date(
                                            row.device_time
                                          ).toLocaleString(undefined, {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            second: "2-digit",
                                          })
                                        : ""}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ color: "#9ca3af" }}>
                                    No photo
                                  </span>
                                )}
                              </td>
                            );
                          }
                          let value = row[col.key];
                          if (col.key === "name") value = person.name || "";
                          if (col.key === "department")
                            value = person.department || "";
                          if (col.key === "device_time" && row[col.key])
                            value = formatDateTime(row[col.key]);
                          if (col.key === "shift") {
                            if (!settings) value = "-";
                            else {
                              const time = new Date(row.device_time);
                              const hour = time.getHours();
                              const minute = time.getMinutes();
                              const totalMinutes = hour * 60 + minute;
                              const morningStart = settings.morning_start
                                ? settings.morning_start.split(":").map(Number)
                                : [0, 0];
                              const morningEnd = settings.morning_end
                                ? settings.morning_end.split(":").map(Number)
                                : [0, 0];
                              const afternoonStart = settings.afternoon_start
                                ? settings.afternoon_start
                                    .split(":")
                                    .map(Number)
                                : [0, 0];
                              const afternoonEnd = settings.afternoon_end
                                ? settings.afternoon_end.split(":").map(Number)
                                : [0, 0];
                              const morningStartMin =
                                morningStart[0] * 60 + morningStart[1];
                              const morningEndMin =
                                morningEnd[0] * 60 + morningEnd[1];
                              const afternoonStartMin =
                                afternoonStart[0] * 60 + afternoonStart[1];
                              const afternoonEndMin =
                                afternoonEnd[0] * 60 + afternoonEnd[1];
                              if (
                                totalMinutes >= morningStartMin &&
                                totalMinutes <= morningEndMin
                              )
                                value = "Morning Shift";
                              else if (
                                totalMinutes >= afternoonStartMin &&
                                totalMinutes <= afternoonEndMin
                              )
                                value = "Afternoon Shift";
                              else value = "-";
                            }
                          }
                          if (col.key === "work_hours") {
                            if (!settings) {
                              value = "-";
                            } else {
                              let label = "";
                              let configTime = "";
                              if (row.event === "time-in") {
                                // Show Morning In or Afternoon In based on device_time proximity
                                label = "Morning In";
                                configTime = settings.morning_start;
                                // If device_time is after morning_end, use Afternoon In
                                if (
                                  settings.morning_end &&
                                  settings.afternoon_start
                                ) {
                                  const d = new Date(row.device_time);
                                  const minutes =
                                    d.getHours() * 60 + d.getMinutes();
                                  const morningEnd = settings.morning_end
                                    .split(":")
                                    .map(Number);
                                  const morningEndMin =
                                    morningEnd[0] * 60 + morningEnd[1];
                                  const morningGrace = Number(settings.morning_grace_minutes) || 0;
                                  // Treat times within the morning end + grace as still morning
                                  if (minutes > morningEndMin + morningGrace) {
                                    label = "Afternoon In";
                                    configTime = settings.afternoon_start;
                                  }
                                }
                              } else if (row.event === "time-out") {
                                label = "Morning Out";
                                configTime = settings.morning_end;
                                // If device_time is after morning_end, use Afternoon Out
                                if (
                                  settings.morning_end &&
                                  settings.afternoon_end
                                ) {
                                  const d = new Date(row.device_time);
                                  const minutes =
                                    d.getHours() * 60 + d.getMinutes();
                                  const morningEnd = settings.morning_end
                                    .split(":")
                                    .map(Number);
                                  const morningEndMin =
                                    morningEnd[0] * 60 + morningEnd[1];
                                  const morningGrace = Number(settings.morning_grace_minutes) || 0;
                                  // Treat times within the morning end + grace as still morning
                                  if (minutes > morningEndMin + morningGrace) {
                                    label = "Afternoon Out";
                                    configTime = settings.afternoon_end;
                                  }
                                }
                              } else {
                                value = "-";
                              }
                              value =
                                label && configTime
                                  ? `${label}: ${configTime}`
                                  : "-";
                            }
                          }
                          const isLate =
                            col.key === "status" && value === "late";
                          const cellStyle = {
                            ...styles.td,
                            fontFamily:
                              col.key === "person_id" ? "monospace" : "inherit",
                            color: isLate
                              ? styles.lateText.color
                              : styles.td.color,
                            fontWeight: isLate ? 600 : 400,
                          };
                          return (
                            <td key={col.key} style={cellStyle}>
                              {value || "-"}
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
                                {Icons.archive} Archive
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestore(row)}
                                style={styles.smallButton}
                              >
                                {Icons.restore} Restore
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
