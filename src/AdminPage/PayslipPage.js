import React, { useEffect, useState } from 'react';
// import { supabase } from './supabaseClient';
import { calculatePayroll } from './Payrollfunction/Payroll';
import PayslipModal from './PayslipModals/PayslipModal';
import { getDetailedAttendance } from './attendanceDetails';
import * as XLSX from 'xlsx';

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

    // Generate PDF from payslip container
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const payslipElement = document.querySelector('.payslip-container');
      if (!payslipElement) return;

      // Use html2canvas for better rendering
      import('html2canvas').then(html2canvas => {
        html2canvas.default(payslipElement).then(canvas => {
          const imgData = canvas.toDataURL('image/png');
          const pdfWidth = doc.internal.pageSize.getWidth();
          const pdfHeight = doc.internal.pageSize.getHeight();
          doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          doc.save('payslip.pdf');
        });
      });
    });

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

    <div style={{ padding: 24 }}>

      <h2>View Payroll</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search by name or ID"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 12px', fontSize: 15, borderRadius: 6, border: '1px solid #888', minWidth: 180 }}
        />
        <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
          <option value="">All Departments</option>
          {Array.from(new Set(persons.map(p => p.department).filter(Boolean))).map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        {/* <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
          <option value="name">Sort by Name</option>
          <option value="department">Sort by Department</option>
          <option value="daily_rate">Sort by Daily Rate</option>
          <option value="late_penalty">Sort by Late Penalty</option>
        </select> */}
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ padding: '6px 10px', fontSize: 15, borderRadius: 6 }}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
        <button onClick={handleExportPayslipExcel} style={{ padding: '8px 18px', fontSize: 16 }}>Export to Excel</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Department</th>
            <th>Daily Rate (₱)</th>
            <th>Late Penalty (₱)</th>
            <th>Days Present</th>
            <th>Late Count</th>
            <th>Gross</th>
            <th>Late Deduction</th>
            <th>Net Pay</th>
            <th>Payslip</th>
          </tr>
        </thead>
        <tbody>
          {sortedPersons.map(person => {
            // Find attendance for this person
            const personAttendance = attendance.filter(r => r.person_id === person.id);
            // Calculate days present
            const daysPresent = personAttendance.filter(r => r.event === 'time-in').length;
            // Calculate late count
            const detailed = getDetailedAttendance(attendance, person.id, settings);
            const lateCount = detailed.map(rec => rec.lateDetails || []).flat().length;
            // Find payroll
            const payslip = payroll.find(p => p.id === person.id) || {};
            return (
              <tr key={person.id}>
                <td>{person.id}</td>
                <td>{person.name}</td>
                <td>{person.department}</td>
                <td>{person.daily_rate != null ? `₱${Number(person.daily_rate).toFixed(2)}` : '-'}</td>
                <td>{person.late_penalty != null ? `₱${Number(person.late_penalty).toFixed(2)}` : '-'}</td>
                <td>{daysPresent}</td>
                <td>{lateCount}</td>
                <td>{payslip.gross != null ? `₱${payslip.gross.toLocaleString()}` : '-'}</td>
                <td>{payslip.totalLateDeduction != null ? `₱${payslip.totalLateDeduction.toLocaleString()}` : '-'}</td>
                <td>{payslip.net != null ? `₱${payslip.net.toLocaleString()}` : '-'}</td>
                <td>
                  <button onClick={() => handleShowPayslip(person)}>
                    View
                  </button>
                </td>
              </tr>
            );
          })}
          {!sortedPersons.length && (
            <tr>
              <td colSpan={11}>No persons found.</td>
            </tr>
          )}
        </tbody>
      </table>

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