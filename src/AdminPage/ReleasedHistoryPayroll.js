import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import PayslipModal from './PayslipModals/PayslipModal';
import { getDetailedAttendance } from './attendanceDetails';
import { calculatePayroll } from '../Payroll';

export default function ReleasedHistoryPayroll() {
  const [releasedPayrolls, setReleasedPayrolls] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showPayslip, setShowPayslip] = useState(false);
  const [modalData, setModalData] = useState({ loading: false, person: null, detailedAttendance: [], settings: {}, payroll: null });

  useEffect(() => {
    async function fetchReleased() {
      // Join persons table to get name and department
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*, person:persons(id, name, department)')
        .eq('released', true)
        .order('period', { ascending: false });
      setReleasedPayrolls(data || []);
    }
    fetchReleased();
  }, []);

  // Helper to open payslip modal with full data
  const handleViewPayslip = async (payroll) => {
    setModalData({ loading: true, person: null, detailedAttendance: [], settings: {}, payroll: null });
    setShowPayslip(true);
    // Fetch person details
    const { data: person } = await supabase.from('persons').select('*').eq('id', payroll.person_id).single();
    // Fetch settings
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
    // Fetch department rates
    const { data: deptRates } = await supabase.from('department_rates').select('*');
    // Fetch attendance for this period
    let detailedAttendance = [];
    let fullPayroll = null;
    if (payroll.period && person) {
      // Parse period string: yyyy-mm-dd_to_yyyy-mm-dd
      const [start, end] = payroll.period.split('_to_');
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('person_id', payroll.person_id)
        .gte('device_time', start)
        .lte('device_time', end);
      detailedAttendance = getDetailedAttendance(attendance || [], payroll.person_id, settings || {});
      // Recalculate payroll using the same logic as PayrollPage
      const basePayroll = calculatePayroll(attendance || [], [person], deptRates || [], settings || {})[0];
      const lateCount = detailedAttendance.map(rec => rec.lateDetails || []).flat().length;
      const latePenalty = Number(person.late_penalty || 0);
      const lateCountLimit = Number(settings.late_count_limit || 5);
      const totalLateDeduction = lateCount >= lateCountLimit ? lateCount * latePenalty : 0;
      const totalDeductions = basePayroll.sss + basePayroll.pag_ibig + basePayroll.philhealth + basePayroll.cashAdvance + totalLateDeduction;
      const net = basePayroll.gross - totalDeductions;
      fullPayroll = {
        ...basePayroll,
        lateCount,
        lateCountLimit,
        totalLateDeduction,
        totalDeductions,
        net
      };
    }
    setModalData({ loading: false, person, detailedAttendance, settings, payroll: fullPayroll });
    setSelected(payroll);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '40px auto', padding: 32, background: '#fff', borderRadius: 24 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981', marginBottom: 24 }}>Released Payroll History</h1>
      <button
        style={{ padding: '10px 24px', borderRadius: 20, background: '#e5e7eb', color: '#1f2937', border: '1px solid #d1d5db', marginBottom: 24 }}
        onClick={() => window.location.href = '/admin/ReleasedPayrollLogs'}
      >
        View Released Payroll Logs
      </button>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>NAME</th>
            <th>DEPARTMENT</th>
            <th>PERIOD</th>
            <th>DAILY RATE (₱)</th>
            <th>LATE PENALTY (₱)</th>
            <th>DAYS PRESENT</th>
            <th>LATE COUNT</th>
            <th>GROSS</th>
            <th>LATE DEDUCTION</th>
            <th>NET PAY</th>
            <th>PAYSLIP</th>
            <th>RELEASE</th>
          </tr>
        </thead>
        <tbody>
          {releasedPayrolls.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9ca3af' }}>No released payrolls found.</td></tr>
          ) : (
            releasedPayrolls.map((p, idx) => (
              <tr key={p.id} style={{ background: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                <td>{p.person_id}</td>
                <td>{p.person?.name || '-'}</td>
                <td>{p.person?.department || '-'}</td>
                <td>{p.period}</td>
                <td>₱{modalData.payroll && selected && selected.id === p.id ? (modalData.payroll.dailyRate ?? 0).toFixed(2) : '-'}</td>
                <td>₱{modalData.payroll && selected && selected.id === p.id ? (modalData.payroll.latePenalty ?? 0).toFixed(2) : '-'}</td>
                <td>{modalData.payroll && selected && selected.id === p.id ? modalData.payroll.daysPresent : '-'}</td>
                <td>{modalData.payroll && selected && selected.id === p.id ? modalData.payroll.lateCount : '-'}</td>
                <td>₱{modalData.payroll && selected && selected.id === p.id ? (modalData.payroll.gross ?? 0).toLocaleString() : '-'}</td>
                <td>₱{modalData.payroll && selected && selected.id === p.id ? (modalData.payroll.totalLateDeduction ?? 0).toLocaleString() : '-'}</td>
                <td>₱{modalData.payroll && selected && selected.id === p.id ? (modalData.payroll.net ?? 0).toLocaleString() : (p.net ? p.net.toLocaleString() : '-')}</td>
                <td>
                  <button onClick={() => handleViewPayslip(p)} style={{ padding: '6px 12px', borderRadius: 20, background: '#10b981', color: '#fff', border: 'none' }}>View</button>
                </td>
                <td><span style={{ color: '#10b981', fontWeight: 600 }}>&#10003; Released</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {showPayslip && selected && (
        modalData.loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>Loading payslip...</div>
        ) : (
          <PayslipModal
            payroll={modalData.payroll || selected}
            person={modalData.person || { id: selected.person_id, name: selected.name, department: selected.department }}
            detailedAttendance={modalData.detailedAttendance}
            onClose={() => { setShowPayslip(false); setSelected(null); }}
            showPrintButton={true}
            period={selected.period}
            released={true}
            settings={modalData.settings}
          />
        )
      )}
    </div>
  );
}
