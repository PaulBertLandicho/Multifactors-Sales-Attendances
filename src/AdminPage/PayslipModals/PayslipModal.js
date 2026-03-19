import React from 'react';
import { useEffect, useState } from 'react';
import { fetchHolidays } from '../../SupabaseFunctions/fetchHolidays';
import { supabase } from '../../supabaseClient';

// detailedAttendance: [{ date, morningIn, morningOut, afternoonIn, afternoonOut, lateCount, lateDetails: [{session, time, status}]}]
export default function PayslipModal({
  payroll,
  person,
  detailedAttendance = [],
  onClose,
  showPrintButton
}) {
  // useState declarations (only once)
  const [holidayDetails, setHolidayDetails] = useState([]);
  const [deptHolidayRates, setDeptHolidayRates] = useState({ regular: 0, special: 0 });
  const [loadingHoliday, setLoadingHoliday] = useState(true);

  // Debug output for troubleshooting
  React.useEffect(() => {
    if (!loadingHoliday) {
      console.log('Fetched holidays:', holidayDetails);
      console.log('Department holiday rates:', deptHolidayRates);
      console.log('Attendance dates:', detailedAttendance.map(a => a.date));
    }
  }, [loadingHoliday, holidayDetails, deptHolidayRates, detailedAttendance]);

// ✅ FETCH DEPARTMENT RATES
useEffect(() => {
  async function getDeptHolidayRates() {
    if (!person?.department) return;

    const { data, error } = await supabase
      .from('department_rates')
      .select('*')
      .eq('department', person.department)
      .single();

    if (!error && data) {
      setDeptHolidayRates({
        regular: Number(data.regular_holiday_rate ?? data.holiday_rate ?? 0),
        special: Number(data.special_holiday_rate ?? 0)
      });
    }
  }

  getDeptHolidayRates();
}, [person]);

// ✅ FETCH HOLIDAYS
useEffect(() => {
  async function getHolidays() {
    try {
      if (!person || !detailedAttendance.length) return;

      const firstDate = detailedAttendance[0]?.date;
      if (!firstDate) return;

      const [year, month] = firstDate.split('-');

      const holidays = await fetchHolidays(
        person.department,
        parseInt(month),
        parseInt(year)
      );

      setHolidayDetails(holidays || []);
    } catch (err) {
      console.error('Error fetching holidays:', err);
      setHolidayDetails([]);
    } finally {
      setLoadingHoliday(false);
    }
  }

  getHolidays();
}, [person, detailedAttendance]);  // PDF generation handler for payslip content only
  const handlePdf = async () => {
    const contentElement = document.querySelector('.payslip-modal-content-inner');
    if (!contentElement) return;

    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;

    const canvas = await html2canvas(contentElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#fff',
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${person.name}_payslip.pdf`);
  };

  // Helper to display hours and minutes
  const getHourMinute = (hours) => {
    if (!hours || hours <= 0) return '-';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    let str = '';
    if (h > 0 && m > 0) str = `${h}hr and ${m}min`;
    else if (h > 0) str = `${h}hr`;
    else if (m > 0) str = `${m}min`;
    return str || '0min';
  };

  if (!payroll || !person) return null;

  // Calculate holiday pay for each holiday
  let holidayPayDetails = [];
  let totalHolidayPay = 0;

  if (!loadingHoliday && holidayDetails.length > 0) {
    // Show all holidays for the selected month and department
    holidayPayDetails = holidayDetails.map(h => {
      let ratePercent = 0;
      if (h.type === 'regular') {
        ratePercent = deptHolidayRates.regular;
      } else if (h.type === 'special') {
        ratePercent = deptHolidayRates.special;
      }
      // skip if no rate
      if (!ratePercent) return null;
      const amount = (payroll.dailyRate * ratePercent) / 100;
      totalHolidayPay += amount;
      return {
        date: h.date,
        type: h.type,
        rate: payroll.dailyRate,
        amount,
        ratePercent
      };
    }).filter(Boolean);
  }
  const deductions = [
    { label: 'SSS', value: person.sss ? Number(payroll.sss) : 0 },
    { label: 'Pag-ibig', value: person.pag_ibig ? Number(payroll.pag_ibig) : 0 },
    { label: 'PhilHealth', value: person.philhealth ? Number(payroll.philhealth) : 0 },
    { label: 'Cash Advance', value: Number(payroll.cashAdvance || 0) }
  ];

  const lateCountLimit = payroll.lateCountLimit || payroll.late_count_limit || 5;
  const latePenalty = person.late_penalty || 0;
  const lateDeduction = payroll.lateCount >= lateCountLimit ? payroll.lateCount * latePenalty : 0;
  const totalDeductions = lateDeduction + deductions.reduce((acc, d) => acc + d.value, 0);

  const totalLateOccurrences = detailedAttendance
    .map(rec => rec.lateDetails ? rec.lateDetails.length : 0)
    .reduce((sum, n) => sum + n, 0);

  const allLateDetails = detailedAttendance
    .map(rec => rec.lateDetails ? rec.lateDetails.map(ld => ({ date: rec.date, ...ld })) : [])
    .flat();

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
    },
    modal: {
      background: '#fff',
      color: '#1f2937',
      padding: '32px',
      borderRadius: '28px',
      maxWidth: '900px',
      width: '95%',
      overflowY: 'auto',
      maxHeight: '90%',
      boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
      border: '1px solid #e5e7eb',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    title: { fontSize: '2rem', fontWeight: 700, color: '#10b981', textAlign: 'center', margin: '0 0 8px 0' },
    subtitle: { textAlign: 'center', color: '#6b7280', marginBottom: '32px', fontSize: '1rem' },
    sectionTitle: { fontSize: '1.4rem', fontWeight: 600, color: '#1f2937', margin: '32px 0 16px 0', borderBottom: '2px solid #10b981', paddingBottom: '8px' },
    table: { width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '0.95rem' },
    th: { background: '#f9fafb', color: '#4b5563', fontWeight: 600, padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.03em' },
    td: { padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#1f2937' },
    trEven: { backgroundColor: '#f9fafb' },
    trOdd: { backgroundColor: '#ffffff' },
    summaryRow: { background: '#f3f4f6', fontWeight: 600 },
    lateText: { color: '#ef4444' },
    netPay: { textAlign: 'right', fontSize: '1.6rem', fontWeight: 700, color: '#10b981', margin: '16px 0 0 0' },
    buttonContainer: { marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' },
    button: { padding: '10px 24px', borderRadius: '40px', fontSize: '0.95rem', fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
    buttonPrimary: { background: '#10b981', color: '#fff' },
    buttonSecondary: { background: '#e5e7eb', color: '#1f2937', border: '1px solid #d1d5db' },
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* ✅ PDF ONLY CONTENT */}
        <div className="payslip-modal-content-inner">
          <h2 style={styles.title}>Payslip</h2>
          <p style={styles.subtitle}>{person.name} • {person.department} • ID: {person.id}</p>

          {/* Holiday Table */}
          {!loadingHoliday && holidayPayDetails.length > 0 && (
            <>
              <h3 style={styles.sectionTitle}>🎉 Holidays This Month</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Rate (%)</th>
                    <th style={styles.th}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {holidayPayDetails.map((h, i) => (
                    <tr key={h.date + h.type}>
                      <td style={styles.td}>{h.date}</td>
                      <td style={styles.td}>{h.type === 'regular' ? 'Regular Holiday' : 'Special Holiday'}</td>
                      <td style={styles.td}>{h.ratePercent}</td>
                      <td style={styles.td}>₱{h.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Attendance Table */}
          <h3 style={styles.sectionTitle}>📋 Attendance Details</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Morning In</th>
                <th style={styles.th}>Morning Out</th>
                <th style={styles.th}>Afternoon In</th>
                <th style={styles.th}>Afternoon Out</th>
                <th style={styles.th}>Late Count</th>
                <th style={styles.th}>Late Details</th>
                <th style={styles.th}>OT (hrs)</th>
              </tr>
            </thead>
            <tbody>
            // ...existing code...

            {detailedAttendance.length ? detailedAttendance.map((rec, i) => {
                // Use otHours directly from rec (getDetailedAttendance)
                const rowStyle = i % 2 === 0 ? styles.trEven : styles.trOdd;
                // If rec.otHours is 0, but payroll.otHours > 0, show payroll.otHours for the period
                let otDisplay = '-';
                if (rec.otHours && rec.otHours > 0) {
                  otDisplay = getHourMinute(rec.otHours);
                } else if (payroll.otHours && payroll.otHours > 0) {
                  otDisplay = getHourMinute(payroll.otHours);
                }
                return (
                  <tr key={i} style={rowStyle}>
                    <td style={styles.td}>{rec.date}</td>
                    <td style={{...styles.td, color: rec.morningInStatus === 'late' ? styles.lateText.color : undefined}}>{rec.morningIn || '-'}</td>
                    <td style={styles.td}>{rec.morningOut || '-'}</td>
                    <td style={{...styles.td, color: rec.afternoonInStatus === 'late' ? styles.lateText.color : undefined}}>{rec.afternoonIn || '-'}</td>
                    <td style={styles.td}>{rec.afternoonOut || '-'}</td>
                    <td style={styles.td}>{rec.lateCount || 0}</td>
                    <td style={styles.td}>
                      {rec.lateDetails && rec.lateDetails.length ? (
                        <ul style={{margin:0, paddingLeft:16}}>
                          {rec.lateDetails.map((d, idx) => <li key={idx} style={styles.lateText}>{d.session}: {d.time} ({d.status})</li>)}
                        </ul>
                      ) : '-'}
                    </td>
                    <td style={styles.td}>{otDisplay}</td>
                  </tr>
                )
              }) : (
                <tr><td colSpan="8" style={{...styles.td, textAlign:'center', color:'#9ca3af'}}>No attendance records</td></tr>
              )}
            </tbody>
          </table>

          {/* Late Records */}
          <h3 style={styles.sectionTitle}>⏰ All Late Records</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Session</th>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {allLateDetails.length ? allLateDetails.map((d, i) => {
                const rowStyle = i % 2 === 0 ? styles.trEven : styles.trOdd;
                return (
                  <tr key={i} style={rowStyle}>
                    <td style={styles.td}>{d.date}</td>
                    <td style={styles.td}>{d.session}</td>
                    <td style={styles.td}>{d.time}</td>
                    <td style={{...styles.td, color: d.status === 'late' ? styles.lateText.color : undefined}}>{d.status}</td>
                  </tr>
                )
              }) : (
                <tr><td colSpan="4" style={{...styles.td, textAlign:'center', color:'#9ca3af'}}>No late records</td></tr>
              )}
            </tbody>
          </table>

          {/* Earnings */}
          <h3 style={styles.sectionTitle}>� Earnings</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Days/Hours</th>
                <th style={styles.th}>Rate</th>
                <th style={styles.th}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={styles.trEven}>
                <td style={styles.td}>Standard Pay</td>
                <td style={styles.td}>{payroll.daysPresent} day(s)</td>
                <td style={styles.td}>₱{payroll.dailyRate.toFixed(2)}</td>
                <td style={styles.td}>₱{payroll.gross.toLocaleString()}</td>
              </tr>
              <tr style={styles.trOdd}>
                <td style={styles.td}>Overtime Pay</td>
                <td style={styles.td}>{getHourMinute(payroll.otHours)}</td>
                <td style={styles.td}>₱{payroll.otHourlyRate.toFixed(2)}</td>
                <td style={styles.td}>₱{payroll.otPay.toLocaleString()}</td>
              </tr>
             {/* ✅ Holiday Pay */}
{holidayPayDetails.length > 0 ? (
  <>
    {holidayPayDetails.map((h, idx) => (
      <tr key={idx} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
        <td style={styles.td}>Holiday Pay</td>
        <td style={styles.td}>
          {h.date} ({h.type === 'regular' ? 'Regular Holiday' : 'Special Holiday'})
        </td>
        <td style={styles.td}>
          ₱{h.rate.toFixed(2)} 
          <span style={{ color:'#10b981', fontWeight:600 }}>
            {' '}({h.ratePercent}%)
          </span>
        </td>
        <td style={styles.td}>₱{h.amount.toLocaleString()}</td>
      </tr>
    ))}

    <tr style={styles.summaryRow}>
      <td colSpan="3" style={styles.td}>Total Holiday Pay</td>
      <td style={styles.td}>₱{totalHolidayPay.toLocaleString()}</td>
    </tr>
  </>
) : (
  <tr>
    <td colSpan="4" style={{ textAlign:'center', color:'#9ca3af' }}>
      No holiday pay for this period
    </td>
  </tr>
)}
              <tr style={styles.summaryRow}>
                <td colSpan="3" style={styles.td}>Gross Pay</td>
                <td style={styles.td}>₱{(payroll.gross + totalHolidayPay).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          {/* Deductions */}
          <h3 style={styles.sectionTitle}>📉 Deductions</h3>
          <table style={styles.table}>
            <tbody>
              <tr style={styles.trEven}>
                <td style={styles.td}>Total Late Occurrences</td>
                <td style={styles.td}>{totalLateOccurrences} occurrence(s)</td>
              </tr>
              <tr style={styles.trOdd}>
                <td style={styles.td}>Late Count</td>
                <td style={styles.td}>{payroll.lateCount} occurrence(s)</td>
              </tr>
              <tr style={styles.trEven}>
                <td style={styles.td}>Late Count Limit for Deduction</td>
                <td style={styles.td}>{lateCountLimit} occurrence(s)</td>
              </tr>
              <tr style={styles.trOdd}>
                <td style={styles.td}>Late Deduction</td>
                <td style={styles.td}>₱{lateDeduction.toLocaleString()}</td>
              </tr>
              {deductions.map((d, i) => (
                <tr key={d.label} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                  <td style={styles.td}>{d.label}</td>
                  <td style={styles.td}>₱{d.value.toLocaleString()}</td>
                </tr>
              ))}
              <tr style={styles.summaryRow}>
                <td style={styles.td}>Total Deductions</td>
                <td style={styles.td}>₱{totalDeductions.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={styles.netPay}>Net Pay: ₱{((payroll.gross + totalHolidayPay) - totalDeductions).toLocaleString()}</h3>
        </div>

        {/* ✅ BUTTONS OUTSIDE PDF */}
        <div style={styles.buttonContainer}>
          {showPrintButton && <button onClick={handlePdf} style={{...styles.button, ...styles.buttonPrimary}}>🖨️ PDF</button>}
          <button onClick={onClose} style={{...styles.button, ...styles.buttonSecondary}}>✖️ Close</button>
        </div>
      </div>
    </div>
  )
}