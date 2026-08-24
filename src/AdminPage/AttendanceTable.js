import { Fragment, useEffect, useState } from "react";
import { useLoading } from "../LoadingContext";
import { supabase } from "../supabaseClient";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import { MdFilterList } from "react-icons/md";
import { FiDownload, FiArchive, FiRotateCcw, FiPlus, FiX, FiChevronLeft, FiChevronRight } from "react-icons/fi";

export default function AttendanceTable() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey] = useState("person_id");
  const [sortOrder, setSortOrder] = useState("asc");
  const [selectedDate, setSelectedDate] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [records, setRecords] = useState([]);
  const [persons, setPersons] = useState([]);
  const [photoModal, setPhotoModal] = useState({ visible: false, src: "", title: "" });
  const { setLoading } = useLoading();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, departmentFilter, selectedDate, showArchived]);

  const formatDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const datePart = date.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
    const timePart = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${datePart} - ${timePart}`;
  };

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

  const Icons = {
    filter: <MdFilterList />,
    download: <FiDownload />,
    archive: <FiArchive />,
    restore: <FiRotateCcw />,
    add: <FiPlus />,
    close: <FiX />,
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setError(null);
        const { data: attData, error: attErr } = await supabase.from("attendance").select("*");
        if (attErr) throw attErr;
        setRecords(attData || []);
        const { data: personsData, error: personsErr } = await supabase.from("persons").select("id, name, department");
        if (personsErr) throw personsErr;
        setPersons(personsData || []);
        const { data: settingsData, error: settingsErr } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
        if (settingsErr) throw settingsErr;
        setSettings(settingsData || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) fetchData(); }, 60_000);
    return () => clearInterval(interval);
  }, [setLoading]);

  function openPhotoModal(src, title) {
    if (!src) return;
    setPhotoModal({ visible: true, src, title: title || "" });
  }

  function closePhotoModal() {
    setPhotoModal({ visible: false, src: "", title: "" });
  }

  useEffect(() => {
    if (!photoModal.visible) return;
    function onKey(e) { if (e.key === "Escape") closePhotoModal(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoModal.visible]);

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  const handleEdit = async (rec) => {
    try {
      const d = rec.device_time ? new Date(rec.device_time) : new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const defaultTime = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const { value: formValues } = await Swal.fire({
        title: 'Edit Attendance',
        html: `
          <div style="text-align: left; margin-top: 1.25rem;">
            <!-- Time Field (Full Width) -->
            <div style="margin-bottom: 1rem;">
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #374151; margin-bottom: 0.35rem;">
                Time
              </label>
              <input 
                id="swal-time" 
                type="time"
                step="1"
                value="${defaultTime}" 
                style="display: block; width: 100%; padding: 0.65rem 0.85rem; font-size: 0.95rem; border: 1px solid #d1d5db; border-radius: 0.75rem; outline: none; box-sizing: border-box; background: #ffffff; color: #1f2937; cursor: pointer;"
              />
            </div>

            <!-- 2-Column Grid for Event and Status -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-bottom: 0.5rem;">
              <!-- Column 1: Event Field -->
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #374151; margin-bottom: 0.35rem;">
                  Attendance Event
                </label>
                <select 
                  id="swal-event" 
                  style="display: block; width: 100%; padding: 0.65rem 0.85rem; font-size: 0.95rem; border: 1px solid #d1d5db; border-radius: 0.75rem; outline: none; box-sizing: border-box; background: #ffffff; color: #1f2937; cursor: pointer;"
                >
                  <option value="time-in" ${rec.event === 'time-in' ? 'selected' : ''}>Time In</option>
                  <option value="time-out" ${rec.event === 'time-out' ? 'selected' : ''}>Time Out</option>
                </select>
              </div>

              <!-- Column 2: Status Field -->
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #374151; margin-bottom: 0.35rem;">
                  Attendance Status
                </label>
                <select 
                  id="swal-status" 
                  style="display: block; width: 100%; padding: 0.65rem 0.85rem; font-size: 0.95rem; border: 1px solid #d1d5db; border-radius: 0.75rem; outline: none; box-sizing: border-box; background: #ffffff; color: #1f2937; cursor: pointer;"
                >
                  <option value="on-time" ${rec.status === 'on-time' ? 'selected' : ''}>on-time</option>
                  <option value="late" ${rec.status === 'late' ? 'selected' : ''}>late</option>
                  <option value="overtime" ${rec.status === 'overtime' ? 'selected' : ''}>overtime</option>
                </select>
              </div>
            </div>
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Save',
        confirmButtonColor: '#237227',
        cancelButtonColor: '#E5E7EB',
        customClass: {
          popup: '!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[460px]',
          title: '!text-gray-800 !text-[1.4rem] !font-bold !mt-1 !mb-0',
          actions: '!flex !items-center !justify-center !gap-4 !mt-6 !w-full',
          confirmButton: '!bg-[#237227] hover:!bg-[#1a5a1d] !text-white !font-semibold !rounded-lg !px-7 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]',
          cancelButton: '!bg-white !border !border-gray-300 !text-gray-700 !font-semibold !rounded-lg !px-7 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]',
        },
        buttonsStyling: false,
        didOpen: () => {
          const timeInput = document.getElementById('swal-time');
          if (timeInput) {
            timeInput.addEventListener('click', () => {
              try {
                if (typeof timeInput.showPicker === 'function') {
                  timeInput.showPicker();
                }
              } catch (err) {}
            });
          }
        },
        preConfirm: () => {
          const timeVal = document.getElementById('swal-time').value.trim();
          const eventVal = document.getElementById('swal-event').value;
          const statusVal = document.getElementById('swal-status').value;
          if (!timeVal) { Swal.showValidationMessage('Time is required'); return false; }
          const fullTime = timeVal.length === 5 ? `${timeVal}:00` : timeVal;
          return { time: fullTime, event: eventVal, status: statusVal };
        }
      });
      if (!formValues) return;
      const { time, event, status } = formValues;
      const targetDate = rec.device_time ? new Date(rec.device_time) : new Date();
      const [h, m, s] = time.split(':').map(Number);
      targetDate.setHours(h || 0, m || 0, s || 0, 0);
      const iso = targetDate.toISOString();
      const { error } = await supabase.from('attendance').update({ device_time: iso, event, status }).eq('id', rec.id);
      if (error) { Swal.fire('Error', error.message, 'error'); return; }
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, device_time: iso, event, status } : r)));
      showToast('Attendance updated successfully!');
    } catch (e) {
      console.error('handleEdit failed', e);
      Swal.fire('Error', e.message || String(e), 'error');
    }
  };

  const handleArchive = async (rec) => {
    const confirm = await Swal.fire({
      title: "Archive Attendance",
      text: "Are you sure you want to archive this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Archive",
      confirmButtonColor: "#237227",
      cancelButtonColor: "#ffffff",
      customClass: {
        popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[380px]",
        title: "!text-gray-800 !text-[1.35rem] !font-bold !mt-2",
        actions: "!flex !items-center !justify-center !gap-4 !mt-6 !w-full",
        confirmButton: "!bg-[#237227] hover:!bg-[#1a5a1d] !text-white !font-semibold !rounded-lg !px-6 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]",
        cancelButton: "!bg-white !border !border-gray-300 !text-gray-700 !font-semibold !rounded-lg !px-6 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[100px]",
      },
      buttonsStyling: false,
    });
    if (confirm.isConfirmed) {
      const { error: archErr } = await supabase.from("attendance").update({ archived: true }).eq("id", rec.id);
      if (archErr) {
        Swal.fire({
          title: "Error",
          text: archErr.message,
          icon: "error",
          confirmButtonText: "OK",
          customClass: {
            popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[380px]",
            confirmButton: "!bg-red-500 hover:!bg-red-600 !text-white !font-semibold !rounded-lg !px-8 !py-2.5 !text-sm",
          },
          buttonsStyling: false,
        });
      } else {
        setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, archived: true } : r)));
        showToast("Attendance archived successfully!");
      }
    }
  };

  const handleRestore = async (rec) => {
    const { error: resErr } = await supabase.from("attendance").update({ archived: false }).eq("id", rec.id);
    if (resErr) {
      Swal.fire({
        title: "Error",
        text: resErr.message,
        icon: "error",
        confirmButtonText: "OK",
        customClass: {
          popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[380px]",
          confirmButton: "!bg-red-500 hover:!bg-red-600 !text-white !font-semibold !rounded-lg !px-8 !py-2.5 !text-sm",
        },
        buttonsStyling: false,
      });
    } else {
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, archived: false } : r)));
      showToast("Attendance restored successfully!");
    }
  };

  const filteredRecords = records.filter((r) => {
    if (r.archived) return false;
    const person = persons.find((p) => p.id === r.person_id) || {};
    const matchesSearch = !search || (person.name && person.name.toLowerCase().includes(search.toLowerCase())) || (r.person_id && r.person_id.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = !statusFilter || (r.status || "") === statusFilter;
    const matchesDept = !departmentFilter || (person.department || "") === departmentFilter;
    const recordDate = r.device_time ? new Date(r.device_time).toISOString().slice(0, 10) : null;
    const matchesDate = !selectedDate || recordDate === selectedDate;
    return matchesSearch && matchesStatus && matchesDept && matchesDate;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let aVal, bVal;
    if (sortKey === "person_id") {
      const aNum = Number(a.person_id);
      const bNum = Number(b.person_id);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        aVal = aNum;
        bVal = bNum;
      } else {
        aVal = String(a.person_id || "").toLowerCase();
        bVal = String(b.person_id || "").toLowerCase();
      }
    } else if (sortKey === "device_time") {
      aVal = new Date(a.device_time).getTime() || 0;
      bVal = new Date(b.device_time).getTime() || 0;
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

    // Tie-breaker: sort by person_id (numeric ascending)
    const aIdNum = Number(a.person_id);
    const bIdNum = Number(b.person_id);
    if (!isNaN(aIdNum) && !isNaN(bIdNum)) {
      return aIdNum - bIdNum;
    }
    return String(a.person_id || "").localeCompare(String(b.person_id || ""));
  });

  const archivedRecords = [...records]
    .filter((r) => r.archived)
    .filter((r) => {
      if (!selectedDate) return true;
      const rd = r.device_time ? new Date(r.device_time).toISOString().slice(0, 10) : null;
      return rd === selectedDate;
    })
    .sort((a, b) => {
      const aIdNum = Number(a.person_id);
      const bIdNum = Number(b.person_id);
      if (!isNaN(aIdNum) && !isNaN(bIdNum)) {
        return aIdNum - bIdNum;
      }
      return String(a.person_id || "").localeCompare(String(b.person_id || ""));
    });

  const activeRecords = showArchived ? archivedRecords : sortedRecords;
  const totalPages = Math.max(1, Math.ceil(activeRecords.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = activeRecords.slice(startIndex, startIndex + itemsPerPage);

  const columns = [
    { key: "photo", label: "Photo" },
    { key: "device_time", label: "Attendance Time" },
    { key: "person_id", label: "Person ID" },
    { key: "name", label: "Employee Name" },
    { key: "department", label: "Department" },
    { key: "point", label: "Location" },
    { key: "work_hours", label: "Work Hours" },
    { key: "status", label: "Attendance Status" },
    { key: "method", label: "Attendance Method" },
  ];

  const handleExportExcel = () => {
    if (!Array.isArray(sortedRecords) || !Array.isArray(persons)) return;
    const exportData = sortedRecords.map((row) => {
      const person = persons.find((p) => p.id === row.person_id) || {};
      return {
        Time: row.device_time ? formatDateTime(row.device_time) : "",
        "Person ID": row.person_id,
        Name: person.name || "",
        Department: person.department || "",
        Location: row.point || "",
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
    <div className="mx-auto px-6 pt-2 pb-8 max-w-[1600px] font-sans bg-white min-h-screen text-gray-800">

      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-[2.5rem] font-bold text-gray-800 mb-2 inline-block">Attendance Records</h1>
        <div className="h-1 w-20 bg-[#237227] mx-auto rounded-sm" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6 px-6 py-5 bg-gray-50 rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-gray-200">
        {/* Left filter group */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none transition-all"
              style={{
                backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "12px center",
                backgroundSize: "16px",
              }}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer min-w-[140px]"
          >
            <option value="">All Status</option>
            <option value="late">Late</option>
            <option value="on-time">On-time</option>
            <option value="overtime">Overtime</option>
          </select>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer min-w-[140px]"
          >
            <option value="">All Departments</option>
            {Array.from(new Set(persons.map((p) => p.department).filter(Boolean))).map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          {/* Date Filter */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer min-w-[140px]"
          />

          {/* Clear Date */}
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border-none text-xs font-semibold cursor-pointer bg-gray-100 text-gray-800"
            >
              {Icons.close} Clear
            </button>
          )}

          {/* Sort Toggle */}
          <button
            aria-label="Toggle sort order"
            onClick={() => setSortOrder((s) => (s === "asc" ? "desc" : "asc"))}
            className="px-4 py-2.5 rounded-lg bg-[#237227] text-white text-sm cursor-pointer min-w-[72px] text-center font-semibold border-none"
          >
            {sortOrder === "asc" ? "Asc" : "Desc"}
          </button>


        </div>

        {/* Right action buttons */}
        <div className="flex gap-3 flex-wrap items-center">
          {/* Record count badge */}
          <div className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg border border-[#237227] bg-white text-[#1a5a1d] text-sm min-w-[84px] text-center mr-1 font-semibold">
            {(showArchived ? archivedRecords.length : sortedRecords.length) + " records"}
          </div>

          <button
            onClick={() => setShowArchived((a) => !a)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-[#237227] cursor-pointer bg-gray-100 text-[#1a5a1d]"
          >
            {Icons.archive} {showArchived ? "Show Active" : "Show Archived"}
          </button>

          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
          >
            {Icons.download} Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.08)] bg-white border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.95rem] min-w-[1200px]">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wide uppercase text-[0.8rem]"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wide uppercase text-[0.8rem]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {activeRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="text-center py-16 px-5 text-gray-500 text-[1.1rem]"
                  >
                    {showArchived ? "No archived attendance records found." : "No attendance records found."}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((row, idx) => {
                  const person = persons.find((p) => p.id === row.person_id) || {};
                  return (
                    <tr
                      key={row.id}
                      className={`${idx % 2 === 0 ? "bg-gray-50" : "bg-white"}`}
                    >
                      {columns.map((col) => {
                        if (col.key === "photo") {
                          return (
                            <td key="photo" className="px-3 py-3.5 border-b border-gray-200 text-gray-800">
                              {row.photo ? (
                                <div className="flex flex-col items-center gap-1">
                                  <img
                                    src={row.photo}
                                    alt="scan"
                                    className="w-[60px] h-[60px] object-cover rounded-xl border-2 border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => openPhotoModal(row.photo, person.name || row.person_id)}
                                  />
                                  <span className="text-[0.7rem] text-gray-500">
                                    {row.device_time ? new Date(row.device_time).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400">No photo</span>
                              )}
                            </td>
                          );
                        }

                        let value = row[col.key];
                        if (col.key === "name") value = person.name || "";
                        if (col.key === "department") value = person.department || "";
                        if (col.key === "device_time" && row[col.key]) value = formatDateTime(row[col.key]);
                        if (col.key === "work_hours") {
                          if (!settings) {
                            value = "-";
                          } else {
                            let label = "";
                            let configTime = "";
                            if (row.event === "time-in") {
                              label = "Morning In";
                              configTime = settings.morning_start;
                              if (settings.morning_end && settings.afternoon_start) {
                                const d = new Date(row.device_time);
                                const minutes = d.getHours() * 60 + d.getMinutes();
                                const morningEnd = settings.morning_end.split(":").map(Number);
                                const morningEndMin = morningEnd[0] * 60 + morningEnd[1];
                                const morningGrace = Number(settings.morning_grace_minutes) || 0;
                                if (minutes > morningEndMin + morningGrace) {
                                  label = "Afternoon In";
                                  configTime = settings.afternoon_start;
                                }
                              }
                            } else if (row.event === "time-out") {
                              label = "Morning Out";
                              configTime = settings.morning_end;
                              if (settings.morning_end && settings.afternoon_end) {
                                const d = new Date(row.device_time);
                                const minutes = d.getHours() * 60 + d.getMinutes();
                                const morningEnd = settings.morning_end.split(":").map(Number);
                                const morningEndMin = morningEnd[0] * 60 + morningEnd[1];
                                const morningGrace = Number(settings.morning_grace_minutes) || 0;
                                if (minutes > morningEndMin + morningGrace) {
                                  label = "Afternoon Out";
                                  configTime = settings.afternoon_end;
                                }
                              }
                            } else {
                              value = "-";
                            }
                            value = label && configTime ? `${label}: ${configTime}` : "-";
                          }
                        }

                        if (col.key === "status") {
                          const normStatus = String(value || "").toLowerCase().trim();
                          let badgeStyle = "bg-gray-100 text-gray-700 border border-gray-200";
                          if (normStatus === "on-time" || normStatus === "ontime" || normStatus === "on_time") {
                            badgeStyle = "bg-[#237227]/10 text-[#237227] border border-[#237227]/30";
                          } else if (normStatus === "late") {
                            badgeStyle = "bg-red-50 text-red-600 border border-red-200";
                          } else if (normStatus === "overtime") {
                            badgeStyle = "bg-blue-50 text-blue-600 border border-blue-200";
                          }

                          return (
                            <td key={col.key} className="px-3 py-3.5 border-b border-gray-200">
                              {value ? (
                                <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold ${badgeStyle}`}>
                                  {value}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.key}
                            className={[
                              "px-3 py-3.5 border-b border-gray-200",
                              col.key === "person_id" ? "font-mono" : "",
                              col.key === "point" ? "break-words max-w-[220px]" : "",
                              "text-gray-800",
                            ].join(" ")}
                          >
                            {value || "-"}
                          </td>
                        );
                      })}

                      {/* Actions */}
                      <td className="px-3 py-3.5 border-b border-gray-200">
                        <div className="grid grid-cols-2 gap-1.5">
                          {!row.archived ? (
                            <>
                              <button
                                onClick={() => handleEdit(row)}
                                className="flex items-center justify-center py-1.5 px-2 rounded-lg border-none text-[0.78rem] font-semibold cursor-pointer bg-[#237227] text-white hover:bg-[#1a5a1d] transition-colors whitespace-nowrap"
                              >
                                Edit Time
                              </button>
                              <button
                                onClick={() => handleArchive(row)}
                                className="flex items-center justify-center py-1.5 px-2 rounded-lg border border-gray-300 text-[0.78rem] font-semibold cursor-pointer bg-white text-gray-700 whitespace-nowrap"
                              >
                                Archive
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleRestore(row)}
                              className="col-span-2 flex items-center justify-center py-1.5 px-2 rounded-lg border border-gray-300 text-[0.78rem] font-semibold cursor-pointer bg-white text-gray-700 whitespace-nowrap"
                            >
                              Restore
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

        {/* Pagination Footer */}
        {activeRecords.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-gray-50 border-t border-gray-200">
            {/* Left: Record Count Info */}
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-800">{startIndex + 1}</span> to{" "}
              <span className="font-semibold text-gray-800">
                {Math.min(startIndex + itemsPerPage, activeRecords.length)}
              </span>{" "}
              of <span className="font-semibold text-gray-800">{activeRecords.length}</span> records
            </div>

            {/* Right: Page Navigation with Chevron Icons */}
            <div className="flex items-center gap-1.5">
              {/* Previous Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-medium transition-all hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                title="Previous Page"
              >
                <FiChevronLeft className="text-lg" />
              </button>

              {/* Page Number Buttons */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((pageNum) => {
                  if (totalPages <= 7) return true;
                  if (pageNum === 1 || pageNum === totalPages) return true;
                  if (Math.abs(pageNum - currentPage) <= 1) return true;
                  return false;
                })
                .map((pageNum, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && pageNum - prevPage > 1;

                  return (
                    <Fragment key={pageNum}>
                      {showEllipsis && (
                        <span className="px-1 text-gray-400 select-none text-sm">...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`inline-flex items-center justify-center min-w-[36px] h-9 px-2.5 rounded-xl text-sm font-semibold transition-all ${
                          currentPage === pageNum
                            ? "bg-[#237227] text-white shadow-sm"
                            : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {pageNum}
                      </button>
                    </Fragment>
                  );
                })}

              {/* Next Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-medium transition-all hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                title="Next Page"
              >
                <FiChevronRight className="text-lg" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {photoModal.visible && (
        <div
          onClick={() => closePhotoModal()}
          className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90%] max-h-[90%] rounded-lg overflow-hidden bg-white p-3 shadow-[0_12px_40px_rgba(2,6,23,0.4)]"
          >
            <div className="flex justify-end">
              <button
                onClick={() => closePhotoModal()}
                aria-label="Close photo"
                className="bg-transparent border-none text-slate-900 text-[22px] cursor-pointer leading-none hover:text-red-500 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="text-center">
              <img
                src={photoModal.src}
                alt={photoModal.title}
                className="max-w-full max-h-[80vh] block mx-auto"
              />
              {photoModal.title && <div className="mt-2 text-slate-900">{photoModal.title}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
