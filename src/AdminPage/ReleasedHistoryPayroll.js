import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import PayslipModal from "./PayslipModals/PayslipModal";
import { getDetailedAttendance } from "./attendanceDetails";
import { calculatePayroll } from "./Payroll";
import { FiDownload } from "react-icons/fi";

export default function ReleasedHistoryPayroll() {
  const [releasedPayrolls, setReleasedPayrolls] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showPayslip, setShowPayslip] = useState(false);
  const [modalData, setModalData] = useState({
    loading: false,
    person: null,
    detailedAttendance: [],
    settings: {},
    payroll: null,
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("period");
  const [sortOrder, setSortOrder] = useState("desc");
  // Removed unused Icons variable
  useEffect(() => {
    async function fetchReleased() {
      // Join persons table to get name and department
      const { data } = await supabase
        .from("payroll_periods")
        .select("*, person:persons(id, name, department)")
        .eq("released", true);
      setReleasedPayrolls(data || []);
    }
    fetchReleased();
  }, []);

  // Filter and sort
  const filteredPayrolls = releasedPayrolls.filter((p) => {
    const searchLower = search.toLowerCase();
    return (
      !search ||
      (p.person_id && p.person_id.toLowerCase().includes(searchLower)) ||
      (p.person &&
        p.person.name &&
        p.person.name.toLowerCase().includes(searchLower)) ||
      (p.person &&
        p.person.department &&
        p.person.department.toLowerCase().includes(searchLower)) ||
      (p.period && p.period.toLowerCase().includes(searchLower))
    );
  });

  const sortedPayrolls = [...filteredPayrolls].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];
    if (sortKey === "period") {
      aVal = (aVal || "").toLowerCase();
      bVal = (bVal || "").toLowerCase();
    } else if (sortKey === "person_id") {
      aVal = (a.person_id || "").toLowerCase();
      bVal = (b.person_id || "").toLowerCase();
    } else if (sortKey === "name") {
      aVal = (a.person?.name || "").toLowerCase();
      bVal = (b.person?.name || "").toLowerCase();
    } else if (sortKey === "department") {
      aVal = (a.person?.department || "").toLowerCase();
      bVal = (b.person?.department || "").toLowerCase();
    } else {
      aVal = (a[sortKey] || "").toString().toLowerCase();
      bVal = (b[sortKey] || "").toString().toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Sorting handler
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  // Helper to open payslip modal with full data
  const handleViewPayslip = async (payroll) => {
    setModalData({
      loading: true,
      person: null,
      detailedAttendance: [],
      settings: {},
      payroll: null,
    });
    setShowPayslip(true);
    // Fetch person details
    const { data: person } = await supabase
      .from("persons")
      .select("*")
      .eq("id", payroll.person_id)
      .single();
    // Fetch settings
    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("id", 1)
      .single();
    // Fetch department rates
    const { data: deptRates } = await supabase
      .from("department_rates")
      .select("*");
    // Fetch attendance for this period
    let detailedAttendance = [];
    let fullPayroll = null;
    if (payroll.period && person) {
      // Parse period string: yyyy-mm-dd_to_yyyy-mm-dd
      const [start, end] = payroll.period.split("_to_");
      const { data: attendance } = await supabase
        .from("attendance")
        .select("*")
        .eq("person_id", payroll.person_id)
        .gte("device_time", start)
        .lte("device_time", end);
      detailedAttendance = getDetailedAttendance(
        attendance || [],
        payroll.person_id,
        settings || {}
      );
      // Recalculate payroll using the same logic as PayrollPage
      const basePayroll = calculatePayroll(
        attendance || [],
        [person],
        deptRates || [],
        settings || {}
      )[0];
      const lateCount = detailedAttendance
        .map((rec) => rec.lateDetails || [])
        .flat().length;
      const latePenalty = Number(person.late_penalty || 0);
      const lateCountLimit = Number(settings.late_count_limit || 5);
      const totalLateDeduction =
        lateCount >= lateCountLimit ? lateCount * latePenalty : 0;
      const totalDeductions =
        basePayroll.sss +
        basePayroll.pag_ibig +
        basePayroll.philhealth +
        basePayroll.cashAdvance +
        totalLateDeduction;
      const net = basePayroll.gross - totalDeductions;
      fullPayroll = {
        ...basePayroll,
        lateCount,
        lateCountLimit,
        totalLateDeduction,
        totalDeductions,
        net,
      };
    }
    setModalData({
      loading: false,
      person,
      detailedAttendance,
      settings,
      payroll: fullPayroll,
    });
    setSelected(payroll);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!Array.isArray(sortedPayrolls)) return;
    const exportData = sortedPayrolls.map((row) => ({
      ID: row.person_id,
      Name: row.person?.name || "",
      Department: row.person?.department || "",
      Period: row.period || "",
      "Daily Rate":
        modalData.payroll && selected && selected.id === row.id
          ? modalData.payroll.dailyRate ?? 0
          : "",
      "Late Penalty":
        modalData.payroll && selected && selected.id === row.id
          ? modalData.payroll.latePenalty ?? 0
          : "",
      "Days Present":
        modalData.payroll && selected && selected.id === row.id
          ? modalData.payroll.daysPresent
          : "",
      "Late Count":
        modalData.payroll && selected && selected.id === row.id
          ? modalData.payroll.lateCount
          : "",
      Gross:
        modalData.payroll && selected && selected.id === row.id
          ? modalData.payroll.gross ?? 0
          : "",
      "Late Deduction":
        modalData.payroll && selected && selected.id === row.id
          ? modalData.payroll.totalLateDeduction ?? 0
          : row.total_late_deduction ?? "",
      "Net Pay":
        modalData.payroll && selected && selected.id === row.id
          ? modalData.payroll.net ?? 0
          : row.net ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Released Payrolls");
    XLSX.writeFile(wb, "released_payrolls.xlsx");
  };

  // Get unique departments for filter dropdown
  const departmentOptions = [
    ...new Set(
      releasedPayrolls.map((p) => p.person?.department).filter(Boolean)
    ),
  ];

  const [departmentFilter, setDepartmentFilter] = useState("");

  // Filter by department
  const filteredAndDeptPayrolls = filteredPayrolls.filter((p) => {
    if (!departmentFilter) return true;
    return (p.person?.department || "") === departmentFilter;
  });
  const sortedPayrollsFinal = [...filteredAndDeptPayrolls].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];
    if (sortKey === "period") {
      aVal = (aVal || "").toLowerCase();
      bVal = (bVal || "").toLowerCase();
    } else if (sortKey === "person_id") {
      aVal = (a.person_id || "").toLowerCase();
      bVal = (b.person_id || "").toLowerCase();
    } else if (sortKey === "name") {
      aVal = (a.person?.name || "").toLowerCase();
      bVal = (b.person?.name || "").toLowerCase();
    } else if (sortKey === "department") {
      aVal = (a.person?.department || "").toLowerCase();
      bVal = (b.person?.department || "").toLowerCase();
    } else {
      aVal = (a[sortKey] || "").toString().toLowerCase();
      bVal = (b[sortKey] || "").toString().toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Released Payroll History</h1>
        <div style={styles.titleUnderline} />
      </div>
      {/* Filter Bar - match PersonsTable */}
      <div style={styles.filterBar}>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
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
            style={{
              padding: "12px 20px",
              fontSize: "0.95rem",
              borderRadius: "40px",
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              color: "#1f2937",
              outline: "none",
              cursor: "pointer",
              minWidth: "160px",
            }}
          >
            <option value="">All Departments</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          {/* <button
            style={{ ...styles.button, background: '#e5e7eb', color: '#1f2937', border: '1px solid #d1d5db' }}
            onClick={() => window.location.href = '/admin/ReleasedPayrollLogs'}
          >
            View Released Payroll Logs
          </button> */}
        </div>
        <button
          onClick={handleExportExcel}
          style={{ ...styles.button, ...styles.buttonPrimary }}
        >
          <FiDownload /> Export Excel
        </button>
      </div>
      <div style={styles.tableContainer}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => handleSort("person_id")}>
                  ID{" "}
                  {sortKey === "person_id" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th style={styles.th} onClick={() => handleSort("name")}>
                  NAME {sortKey === "name" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th style={styles.th} onClick={() => handleSort("department")}>
                  DEPARTMENT{" "}
                  {sortKey === "department" &&
                    (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th style={styles.th} onClick={() => handleSort("period")}>
                  PERIOD{" "}
                  {sortKey === "period" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th style={styles.th}>DAILY RATE (₱)</th>
                <th style={styles.th}>LATE PENALTY (₱)</th>
                <th style={styles.th}>DAYS PRESENT</th>
                <th style={styles.th}>LATE COUNT</th>
                <th style={styles.th}>GROSS</th>
                <th style={styles.th}>LATE DEDUCTION</th>
                <th style={styles.th}>NET PAY</th>
                <th style={styles.th}>PAYSLIP</th>
                <th style={styles.th}>RELEASE</th>
              </tr>
            </thead>
            <tbody>
              {sortedPayrollsFinal.length === 0 ? (
                <tr>
                  <td colSpan={13} style={styles.emptyState}>
                    No released payrolls found.
                  </td>
                </tr>
              ) : (
                sortedPayrollsFinal.map((p, idx) => (
                  <tr
                    key={p.id}
                    style={{
                      ...styles.tr,
                      backgroundColor: idx % 2 === 0 ? "#f9fafb" : "#fff",
                    }}
                  >
                    <td style={styles.td}>{p.person_id}</td>
                    <td style={styles.td}>{p.person?.name || "-"}</td>
                    <td style={styles.td}>{p.person?.department || "-"}</td>
                    <td style={styles.td}>{p.period}</td>
                    {(() => {
                      const isSelected =
                        modalData.payroll && selected && selected.id === p.id;
                      const fromModal = modalData.payroll || {};

                      const dailyRate = isSelected
                        ? fromModal.dailyRate ??
                          fromModal.daily_rate ??
                          p.daily_rate
                        : p.daily_rate;
                      const latePenalty = isSelected
                        ? fromModal.latePenalty ??
                          fromModal.late_penalty ??
                          p.late_penalty
                        : p.late_penalty;
                      const daysPresent = isSelected
                        ? fromModal.daysPresent ?? p.days_present
                        : p.days_present;
                      const lateCount = isSelected
                        ? fromModal.lateCount ?? p.late_count
                        : p.late_count;
                      const gross = isSelected
                        ? fromModal.gross ?? p.gross
                        : p.gross;
                      const lateDeduction = isSelected
                        ? fromModal.totalLateDeduction ??
                          p.total_late_deduction ??
                          p.late_deduction
                        : p.total_late_deduction ?? p.late_deduction;
                      const net = isSelected ? fromModal.net ?? p.net : p.net;

                      return (
                        <>
                          <td style={styles.td}>
                            ₱
                            {dailyRate != null
                              ? Number(dailyRate).toFixed(2)
                              : "-"}
                          </td>
                          <td style={styles.td}>
                            ₱
                            {latePenalty != null
                              ? Number(latePenalty).toFixed(2)
                              : "-"}
                          </td>
                          <td style={styles.td}>
                            {daysPresent != null ? daysPresent : "-"}
                          </td>
                          <td style={styles.td}>
                            {lateCount != null ? lateCount : "-"}
                          </td>
                          <td style={styles.td}>
                            ₱
                            {gross != null
                              ? Number(gross).toLocaleString()
                              : "-"}
                          </td>
                          <td style={styles.td}>
                            ₱
                            {lateDeduction != null
                              ? Number(lateDeduction).toLocaleString()
                              : "-"}
                          </td>
                          <td style={styles.td}>
                            ₱{net != null ? Number(net).toLocaleString() : "-"}
                          </td>
                        </>
                      );
                    })()}
                    <td style={styles.td}>
                      <button
                        onClick={() => handleViewPayslip(p)}
                        style={{
                          ...styles.button,
                          ...styles.buttonPrimary,
                          padding: "6px 18px",
                          fontSize: "0.95rem",
                          borderRadius: "30px",
                        }}
                      >
                        View
                      </button>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: "#10b981", fontWeight: 600 }}>
                        &#10003; Released
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showPayslip &&
        selected &&
        (modalData.loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            Loading payslip...
          </div>
        ) : (
          <PayslipModal
            payroll={modalData.payroll || selected}
            person={
              modalData.person || {
                id: selected.person_id,
                name: selected.name,
                department: selected.department,
              }
            }
            detailedAttendance={modalData.detailedAttendance}
            onClose={() => {
              setShowPayslip(false);
              setSelected(null);
            }}
            showPrintButton={true}
            period={selected.period}
            released={true}
            settings={modalData.settings}
          />
        ))}
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
    background: "#10b981",
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
    background: "#10b981",
    color: "#ffffff",
  },

  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "1rem",
    color: "#6b7280",
  },

  viewButton: {
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
    backgroundColor: "#e5e7eb",
    color: "#1f2937",
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
  },
  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #e5e7eb",
    color: "#1f2937",
  },
  tr: {
    transition: "background 0.2s",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#6b7280",
    fontSize: "1.1rem",
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
    borderTop: "4px solid #10b981",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};

// Add global keyframes and focus styles
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  input:focus, select:focus {
    border-color: #10b981 !important;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2) !important;
  }
  button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
`;
document.head.appendChild(styleSheet);
