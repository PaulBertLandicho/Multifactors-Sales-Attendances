import React, { useEffect, useState } from 'react';
// import { supabase } from './supabaseClient';
import Swal from 'sweetalert2';
import { calculatePayroll } from '../Payroll';
import { applyHolidayRates } from '../SupabaseFunctions/applyHolidayRates';
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
import { logPayrollRelease } from './payrollActivityLogs';

export default function PayrollPage() {

  const [attendance, setAttendance] = useState([]);
  const [persons, setPersons] = useState([]);
  const [deptRates, setDeptRates] = useState([]);
  const [payrollPeriods, setPayrollPeriods] = useState([]); // [{personId, period, payroll, released}]
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
      const [attRes, personsRes, deptRes, settingsRes, payrollRes] = await Promise.all([
        supabase.from('attendance').select('*'),
        supabase.from('persons')
          .select('id, name, department, daily_rate, late_penalty, sss, pag_ibig, philhealth, cash_advance'),
        supabase.from('department_rates').select('*'),
        supabase.from('settings').select('*').eq('id', 1).single(),
        supabase.from('payroll_periods').select('*')
      ]);

      const attData = attRes.data || [];
      const personsData = personsRes.data || [];
      const deptData = deptRes.data || [];
      const settingsData = settingsRes.data || {};
      const payrollDb = payrollRes.data || [];

      setAttendance(attData);
      setPersons(personsData);
      setDeptRates(deptData);
      setSettings(settingsData);

      // Group attendance by person and by dynamic payroll period length
      let periods = [];
      const periodDays = Number(settingsData.payroll_period_days) || 15;
      personsData.forEach(person => {
        // Get all attendance for this person (include both time-in and time-out)
        const personAttendance = attData.filter(a => a.person_id === person.id);
        // Sort attendance by date
        const sortedAttendance = [...personAttendance].sort((a, b) => new Date(a.device_time) - new Date(b.device_time));
        if (!sortedAttendance.length) return;
        // Find the range of dates
        const firstDate = new Date(sortedAttendance[0].device_time);
        const lastDate = new Date(sortedAttendance[sortedAttendance.length - 1].device_time);
        // Start from the firstDate, create periods of periodDays
        let periodStart = new Date(firstDate);
        while (periodStart <= lastDate) {
          let periodEnd = new Date(periodStart);
          periodEnd.setDate(periodEnd.getDate() + periodDays - 1);
          // Get all attendance in this period
          const periodAttendance = sortedAttendance.filter(a => {
            const dt = new Date(a.device_time);
            return dt >= periodStart && dt <= periodEnd;
          });
          // Format period string: yyyy-mm-dd_to_yyyy-mm-dd
          const periodStr = `${periodStart.toISOString().slice(0,10)}_to_${periodEnd.toISOString().slice(0,10)}`;
          // Check if this period is already released in payrollDb
          const alreadyReleased = payrollDb.some(row => row.person_id === person.id && row.period === periodStr && row.released);
          if (periodAttendance.length > 0 && !alreadyReleased) {
            periods.push({ person, period: periodStr, attendance: periodAttendance });
          }
          // Move to next period
          periodStart.setDate(periodStart.getDate() + periodDays);
        }
      });

      // Calculate payroll for each period and sync with DB
      const payrollPeriods = await Promise.all(periods.map(async ({ person, period, attendance }) => {
        // Calculate payroll for this period only
        const basePayroll = calculatePayroll(attendance, [person], deptData, settingsData)[0];
        const detailed = getDetailedAttendance(attendance, person.id, settingsData);
        const lateCount = detailed.map(rec => rec.lateDetails || []).flat().length;
        const latePenalty = Number(person.late_penalty || 0);
        const lateCountLimit = Number(settingsData.late_count_limit || 5);
        const totalLateDeduction = lateCount >= lateCountLimit ? lateCount * latePenalty : 0;
        const totalDeductions = basePayroll.sss + basePayroll.pag_ibig + basePayroll.philhealth + basePayroll.cashAdvance + totalLateDeduction;
        const net = basePayroll.gross - totalDeductions;
        // Find if this period exists in DB
        let dbRow = payrollDb.find(row => row.person_id === person.id && row.period === period);
        if (!dbRow) {
          // Insert new row
          const { data: inserted } = await supabase.from('payroll_periods').insert([{
            person_id: person.id,
            period,
            days_present: basePayroll.daysPresent,
            daily_rate: person.daily_rate,
            late_penalty: person.late_penalty,
            late_count: lateCount,
            gross: basePayroll.gross,
            total_late_deduction: totalLateDeduction,
            total_deductions: totalDeductions,
            net,
            released: false
          }]).select().single();
          dbRow = inserted;
        }
        return {
          personId: person.id,
          person,
          period,
          payroll: {
            ...basePayroll,
            lateCount,
            lateCountLimit,
            totalLateDeduction,
            totalDeductions,
            net
          },
          attendance,
          released: dbRow.released,
          dbId: dbRow.id
        };
      }));
      setPayrollPeriods(payrollPeriods);
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


  // OPEN PAYSLIP for a period
  const handleShowPayslip = (payrollPeriod) => {
    const { person, payroll, attendance, period } = payrollPeriod;
    const detailedAttendance = getDetailedAttendance(attendance, person.id, settings);
    setSelected({
      person,
      payslip: payroll,
      detailedAttendance,
      period
    });
    setShowPayslip(true);
  };
  // RELEASE PAYROLL
  const handleReleasePayroll = async (periodIdx) => {
    const period = payrollPeriods[periodIdx];
    if (!period || !period.dbId) return;
    // Update released in Supabase
    await supabase.from('payroll_periods').update({ released: true }).eq('id', period.dbId);
    setPayrollPeriods(prev => prev.map((p, i) => i === periodIdx ? { ...p, released: true } : p));
    // Log activity with better user info and error handling
    let releasedBy = 'admin';
    try {
      const sessionStr = localStorage.getItem('sb-session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (session && session.user && session.user.email) {
          releasedBy = session.user.email;
        }
      }
    } catch (e) {}
    try {
      await logPayrollRelease({ payrollPeriodId: period.dbId, personId: period.personId, releasedBy });
    } catch (err) {
      // Optionally show/log error
      Swal.fire('Failed to log payroll release', err.message || err, 'error');
    }
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
    if (!payrollPeriods.length) return;
    // Export each payroll period as a row
    const exportData = payrollPeriods.map(p => {
      const { person, period, payroll } = p;
      return {
        ID: person.id,
        Name: person.name,
        Department: person.department,
        Period: period,
        'Daily Rate': person.daily_rate,
        'Late Penalty': person.late_penalty,
        'Days Present': payroll.daysPresent,
        'Late Count': payroll.lateCount,
        Gross: payroll.gross,
        'Late Deduction': payroll.totalLateDeduction,
        'Net Pay': payroll.net,
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
        {/* <button
          style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 16, float: 'right' }}
          onClick={() => window.location.href = '/admin/released-history'}
        >
          Released History Payroll
        </button> */}
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
        {/* <button
          style={{ ...styles.button, ...styles.buttonSecondary, marginLeft: 12 }}
          onClick={() => window.location.href = '/admin/ReleasedPayrollLogs'}
        >
          Released Payroll Logs
        </button> */}
<button
          style={{ ...styles.button, ...styles.buttonSecondary, marginTop: 16, float: 'right' }}
          onClick={() => window.location.href = '/admin/released-history'}
        >
          Released History Payroll
        </button>
      </div>

      {/* Table: Payroll by 15-day period */}
      <div style={styles.tableContainer}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Period</th>
                <th style={styles.th}>Daily Rate (₱)</th>
                <th style={styles.th}>Late Penalty (₱)</th>
                <th style={styles.th}>Days Present</th>
                <th style={styles.th}>Late Count</th>
                <th style={styles.th}>Gross</th>
                <th style={styles.th}>Late Deduction</th>
                <th style={styles.th}>Net Pay</th>
                <th style={styles.th}>Payslip</th>
                <th style={styles.th}>Release</th>
              </tr>
            </thead>
            <tbody>
              {payrollPeriods.length === 0 ? (
                <tr>
                  <td colSpan={13} style={styles.emptyState}>
                    No payroll records found.
                  </td>
                </tr>
              ) : (
                payrollPeriods.map((p, idx) => {
                  const { person, period, payroll, released } = p;
                  const rowStyle = {
                    ...styles.tr,
                    backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#ffffff',
                  };
                  return (
                    <tr key={person.id + period} style={rowStyle}>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>{person.id}</td>
                      <td style={styles.td}>{person.name}</td>
                      <td style={styles.td}>{person.department}</td>
                      <td style={styles.td}>{period}</td>
                      <td style={styles.td}>{person.daily_rate != null ? `₱${Number(person.daily_rate).toFixed(2)}` : '-'}</td>
                      <td style={styles.td}>{person.late_penalty != null ? `₱${Number(person.late_penalty).toFixed(2)}` : '-'}</td>
                      <td style={styles.td}>{payroll.daysPresent}</td>
                      <td style={styles.td}>{payroll.lateCount}</td>
                      <td style={styles.td}>{payroll.gross != null ? `₱${payroll.gross.toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>{payroll.totalLateDeduction != null ? `₱${payroll.totalLateDeduction.toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>{payroll.net != null ? `₱${payroll.net.toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleShowPayslip(p)}
                          style={styles.viewButton}
                        >
                          {Icons.eye} View
                        </button>
                      </td>
                      <td style={styles.td}>
                        {released ? (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>✔ Released</span>
                        ) : (
                          <button
                            onClick={() => handleReleasePayroll(idx)}
                            style={{ ...styles.button, ...styles.buttonPrimary, padding: '4px 12px', fontSize: '0.9em' }}
                          >
                            Release Payroll
                          </button>
                        )}
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
          period={selected.period}
          released={(() => {
            const match = payrollPeriods.find(
              p => p.person.id === selected.person.id && p.period === selected.period
            );
            return match ? match.released : false;
          })()}
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