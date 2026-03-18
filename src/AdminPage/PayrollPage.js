import React, { useEffect, useState } from 'react';
// import { supabase } from './supabaseClient';
import { calculatePayroll } from '../Payroll';
import PayslipModal from '../AdminPage/PayslipModals/PayslipModal';
import { getDetailedAttendance } from './attendanceDetails';
import * as XLSX from 'xlsx';
import { MdFilterList } from 'react-icons/md';
import {
  FiSearch,
  FiEye,
  FiDownload,
} from 'react-icons/fi';

import { supabase } from '../supabaseClient';

export default function PayrollPage() {

  const [attendance, setAttendance] = useState([]);
  const [persons, setPersons] = useState([]);
  const [deptRates, setDeptRates] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [settings, setSettings] = useState({});
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState(null);
  const [showPayslip, setShowPayslip] = useState(false);

  // Add filter, sort, and export state
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  const Icons = {
    search: <FiSearch />,
    download: <FiDownload />,
    eye: <FiEye />
  };
  

  useEffect(() => {
    async function fetchData() {
      const [attRes, personsRes, deptRes, settingsRes] = await Promise.all([
        supabase.from('attendance').select('*'),
        supabase.from('persons')
          .select('id, name, department, daily_rate, late_penalty, sss, pag_ibig, philhealth, cash_advance'),
        supabase.from('department_rates').select('*'),
        supabase.from('settings').select('*').eq('id', 1).single()
      ]);

      const attData = attRes.data || [];
      const personsData = personsRes.data || [];
      const deptData = deptRes.data || [];
      const settingsData = settingsRes.data || {};

      setAttendance(attData);
      setPersons(personsData);
      setDeptRates(deptData);
      setSettings(settingsData);

      // Use getDetailedAttendance to get lateCount for each person (sum all late occurrences)
      const payrollWithLate = personsData.map(person => {
        const detailed = getDetailedAttendance(attData, person.id, settingsData);
        // Sum all late occurrences across all attendance records (flatten lateDetails)
        const lateCount = detailed.map(rec => rec.lateDetails || []).flat().length;
        // Calculate deduction based on late count and limit
        const latePenalty = Number(person.late_penalty || 0);
        const lateCountLimit = Number(settingsData.late_count_limit || 5);
        const totalLateDeduction = lateCount >= lateCountLimit ? lateCount * latePenalty : 0;
        const basePayroll = calculatePayroll(attData, [person], deptData, settingsData)[0];
        return {
          ...basePayroll,
          lateCount,
          lateCountLimit, // ensure this is always passed
          totalLateDeduction,
          totalDeductions: basePayroll.sss + basePayroll.pag_ibig + basePayroll.philhealth + basePayroll.cashAdvance + totalLateDeduction,
          net: basePayroll.gross - (basePayroll.sss + basePayroll.pag_ibig + basePayroll.philhealth + basePayroll.cashAdvance + totalLateDeduction)
        };
      });
      setPayroll(payrollWithLate);
    }
    fetchData();
  }, []);

  // SEARCH FILTER
  const filtered = persons.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.id || '').toLowerCase().includes(search.toLowerCase())
  );

  // Filter and sort
  const filteredPersons = persons.filter(p => {
    const matchesSearch =
      !search ||
      (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
      (p.id && p.id.toLowerCase().includes(search.toLowerCase()));
    const matchesDept = !departmentFilter || p.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  const sortedPersons = [...filteredPersons].sort((a, b) => {
    let aVal = a[sortKey], bVal = b[sortKey];
    if (sortKey === "name" || sortKey === "department") {
      aVal = (aVal || "").toLowerCase();
      bVal = (bVal || "").toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // OPEN PAYSLIP
  const handleShowPayslip = (person) => {
    const payslip = payroll.find(p => p.id === person.id) || {};
    const daysWorked = attendance
      .filter(r => r.person_id === person.id && r.event === 'time-in')
      .map(r => new Date(r.device_time));
    const detailedAttendance = getDetailedAttendance(attendance, person.id, settings);
    setSelected({
      person,
      payslip,
      daysWorked,
      detailedAttendance
    });
    setShowPayslip(true);
  };


  const handleClosePayslip = () => {
    setShowPayslip(false);
    setSelected(null);
  };


  const handlePrintPayslip = () => {

    if (!selected) return;

    const printWindow = window.open('', '_blank');

    printWindow.document.write(
      document.querySelector('.payslip-container')?.outerHTML || ''
    );

    printWindow.document.close();
    printWindow.print();

  };


  // Export to Excel
  const handleExportPayslipExcel = () => {
    if (!sortedPersons.length) return;
    const exportData = sortedPersons.map(person => {
      const personAttendance = attendance.filter(r => r.person_id === person.id);
      const daysPresent = personAttendance.filter(r => r.event === 'time-in').length;
      const detailed = getDetailedAttendance(attendance, person.id, settings);
      const lateCount = detailed.map(rec => rec.lateDetails || []).flat().length;
      const payslip = payroll.find(p => p.id === person.id) || {};
      return {
        ID: person.id,
        Name: person.name,
        Department: person.department,
        'Daily Rate': person.daily_rate,
        'Late Penalty': person.late_penalty,
        'Days Present': daysPresent,
        'Late Count': lateCount,
        Gross: payslip.gross,
        'Late Deduction': payslip.totalLateDeduction,
        'Net Pay': payslip.net,
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    XLSX.writeFile(wb, 'payroll_summary.xlsx');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Payroll Summary</h1>
        <div style={styles.titleUnderline} />
      </div>

      {/* Filter Bar */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <div style={styles.searchWrapper}>
            <input
              type="text"
              placeholder="Search by name or ID"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <select
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            style={styles.select}
          >
            <option value="">All Departments</option>
            {Array.from(new Set(persons.map(p => p.department).filter(Boolean))).map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            style={styles.select}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <button
  onClick={handleExportPayslipExcel}
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
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Daily Rate (₱)</th>
                <th style={styles.th}>Late Penalty (₱)</th>
                <th style={styles.th}>Days Present</th>
                <th style={styles.th}>Late Count</th>
                <th style={styles.th}>Gross</th>
                <th style={styles.th}>Late Deduction</th>
                <th style={styles.th}>Net Pay</th>
                <th style={styles.th}>Payslip</th>
              </tr>
            </thead>
            <tbody>
              {sortedPersons.length === 0 ? (
                <tr>
                  <td colSpan={11} style={styles.emptyState}>
                    No payroll records found.
                  </td>
                </tr>
              ) : (
                sortedPersons.map((person, idx) => {
                  const personAttendance = attendance.filter(r => r.person_id === person.id);
                  const daysPresent = personAttendance.filter(r => r.event === 'time-in').length;
                  const detailed = getDetailedAttendance(attendance, person.id, settings);
                  const lateCount = detailed.map(rec => rec.lateDetails || []).flat().length;
                  const payslip = payroll.find(p => p.id === person.id) || {};
                  const rowStyle = {
                    ...styles.tr,
                    backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#ffffff',
                  };
                  return (
                    <tr key={person.id} style={rowStyle}>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>{person.id}</td>
                      <td style={styles.td}>{person.name}</td>
                      <td style={styles.td}>{person.department}</td>
                      <td style={styles.td}>{person.daily_rate != null ? `₱${Number(person.daily_rate).toFixed(2)}` : '-'}</td>
                      <td style={styles.td}>{person.late_penalty != null ? `₱${Number(person.late_penalty).toFixed(2)}` : '-'}</td>
                      <td style={styles.td}>{daysPresent}</td>
                      <td style={styles.td}>{lateCount}</td>
                      <td style={styles.td}>{payslip.gross != null ? `₱${payslip.gross.toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>{payslip.totalLateDeduction != null ? `₱${payslip.totalLateDeduction.toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>{payslip.net != null ? `₱${payslip.net.toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleShowPayslip(person)}
                          style={styles.viewButton}
                        >
                          {Icons.eye} View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payslip Modal */}
      {showPayslip && selected && (
        <PayslipModal
          payroll={selected.payslip}
          person={selected.person}
          daysWorked={selected.daysWorked}
          detailedAttendance={selected.detailedAttendance}
          onClose={handleClosePayslip}
          onPrint={handlePrintPayslip}
          showPrintButton={true}
        />
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

  searchIcon: {
  position: 'absolute',
  left: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '1rem',
  color: '#6b7280',
},

  viewButton: {
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
    backgroundColor: '#e5e7eb',
    color: '#1f2937',
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
  },
  td: {
    padding: '14px 12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#1f2937',
  },
  tr: {
    transition: 'background 0.2s',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#6b7280',
    fontSize: '1.1rem',
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
};

// Add global keyframes and focus styles
const styleSheet = document.createElement('style');
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