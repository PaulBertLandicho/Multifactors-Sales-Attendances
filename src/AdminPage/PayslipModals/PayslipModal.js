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
  showPrintButton,
  period,
  released
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

// ✅ FETCH HOLIDAYS (accurate for payroll period)
useEffect(() => {
  async function getHolidays() {
    try {
      if (!person || !period) return;
      const [start, end] = period.split('_to_');
      // Fetch all holidays for the department within the period
      const { data: holidays, error } = await supabase
        .from('holidays')
        .select('*')
        .eq('department', person.department)
        .gte('date', start)
        .lte('date', end);
      if (error) throw error;
      setHolidayDetails(holidays || []);
    } catch (err) {
      console.error('Error fetching holidays:', err);
      setHolidayDetails([]);
    } finally {
      setLoadingHoliday(false);
    }
  }
  getHolidays();
}, [person, period]);
  const handlePdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const left = 10;
    const right = 200;
    const lineHeight = 7;
    let y = 10;

    // Header
    doc.setFontSize(10);
    doc.text(`Date: ${(new Date()).toISOString().slice(0,10)}`, right - 50, y);
    y += lineHeight * 1.5;

    doc.setFontSize(12);
    doc.text('Full Name:', left, y);
    doc.text(person.name || '', left + 35, y);
    // Person image (if available and valid data URL)
    let imageDrawn = false;
    if (person.registration_photo && typeof person.registration_photo === 'string' && person.registration_photo.startsWith('data:image/')) {
      try {
        doc.addImage(person.registration_photo, 'JPEG', right - 50, y - 8, 30, 20);
        imageDrawn = true;
      } catch (e) {
        try {
          doc.addImage(person.registration_photo, 'PNG', right - 50, y - 8, 30, 20);
          imageDrawn = true;
        } catch (e2) {
          // fallback below
        }
      }
    }
    if (!imageDrawn) {
      doc.rect(right - 50, y - 8, 30, 20, 'S');
      doc.text('image', right - 35, y - 5, { align: 'center' });
    }

    y += lineHeight;
    doc.setFontSize(10);
    doc.text('Period:', left, y);
    doc.text(period || '', left + 50, y);
    y += lineHeight;
    doc.text('Total Days:', left, y);
    doc.text(String(payroll.daysPresent || ''), left + 35, y);

    y += lineHeight * 1.5;
    // Use Unicode peso sign (U+20B1), fallback to 'PHP' if not supported
    let peso = 'PHP';
    // Test if peso sign is supported by jsPDF font
    try {
      doc.getStringUnitWidth(peso);
    } catch (e) {
      peso = 'PHP';
    }
    doc.text('Basic Salary Rate:', left, y);
    doc.text(`${peso} ${(payroll.dailyRate ?? 0).toFixed(2)}`, left + 50, y);
    y += lineHeight;
    doc.text('Total of days worked (present):', left, y);
    doc.text(String(payroll.daysPresent || ''), left + 70, y);
    y += lineHeight;
    doc.text('Overtime hrs:', left, y);
    doc.text(String(payroll.otHours || ''), left + 35, y);
    y += lineHeight;
    doc.text('Holiday Day(s):', left, y);
    doc.text(String(holidayPayDetails.length || ''), left + 35, y);
    y += lineHeight;
    doc.text('Allowance:', left, y);
    doc.text('_____________', left + 35, y);
    y += lineHeight;
    doc.text('Total:', left, y);
    doc.text(`${peso} ${(payroll.gross + totalHolidayPay).toLocaleString()}`, left + 35, y);

    y += lineHeight * 2;
    doc.setFont(undefined, 'bold');
    doc.text('Late / Absent', left, y);
    doc.setFont(undefined, 'normal');
    y += lineHeight;
    doc.text('Total numbers of Late:', left, y);
    doc.text(String(payroll.lateCount || 0), left + 50, y);
    y += lineHeight;
    doc.text('Total numbers of Absent:', left, y);
    doc.text(String(absentCount || 0), left + 60, y);
    y += lineHeight;
    // Monthly Share = SSS + Pag-ibig + PhilHealth
    const monthlyShare = (person.sss ? Number(payroll.sss) : 0) + (person.pag_ibig ? Number(payroll.pag_ibig) : 0) + (person.philhealth ? Number(payroll.philhealth) : 0);
    doc.text('Monthly Share:', left, y);
    doc.text(`${peso} ${monthlyShare.toLocaleString()}`, left + 35, y);
    y += lineHeight;
    doc.text('Cash Advance:', left, y);
    doc.text(`${peso} ${Number(payroll.cashAdvance || 0).toLocaleString()}`, left + 35, y);
    y += lineHeight;
    doc.text('Total:', left, y);
    doc.text(`${peso} ${totalDeductions.toLocaleString()}`, left + 35, y);

    y += lineHeight * 2;
    doc.text('Received from MULTIFACTORS SALES', left, y);
    // doc.text('Received from MULTIFACTORS SALES', left + 70, y);

    doc.save(`${person.name}_payslip.pdf`);
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

  // Calculate absent days in the 15-day period
  // Get the period start and end from the period string (e.g. 2024-03-01_to_2024-03-15)
  let absentDates = [];
  if (period) {
    const [start, end] = period.split('_to_');
    const startDate = new Date(start);
    const endDate = new Date(end);
    const todayStr = new Date().toISOString().slice(0, 10);
    // Build all dates in the period
    let allDates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      // Exclude Saturday (6) and Sunday (0)
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        allDates.push(new Date(d));
      }
    }
    // Get all attendance dates (convert to yyyy-mm-dd)
    const attendedDates = detailedAttendance.map(a => {
      const dt = new Date(a.date);
      return dt.toISOString().slice(0, 10);
    });
    // Find dates in allDates not in attendedDates, but only if date is before today
    absentDates = allDates
      .map(d => d.toISOString().slice(0, 10))
      .filter(dateStr => dateStr < todayStr && !attendedDates.includes(dateStr));
  }
  const absentCount = absentDates.length;

  // Calculate holiday pay for each holiday (accurate for payroll period)
  let holidayPayDetails = [];
  let totalHolidayPay = 0;

  if (!loadingHoliday && holidayDetails.length > 0) {
    holidayPayDetails = holidayDetails.map(h => {
      let ratePercent = 0;
      if (h.type === 'regular') {
        ratePercent = deptHolidayRates.regular;
      } else if (h.type === 'special') {
        ratePercent = deptHolidayRates.special;
      }
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
          {period && (
            <p style={{ textAlign: 'center', color: '#10b981', fontWeight: 600, marginBottom: 8 }}>Period: {period}</p>
          )}
          {released && (
            <p style={{ textAlign: 'center', color: '#10b981', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Payslip Released</p>
          )}

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
                    {/* <th style={styles.th}>Amount</th> */}
                  </tr>
                </thead>
                <tbody>
                  {holidayPayDetails.map((h, i) => (
                    <tr key={h.date + h.type}>
                      <td style={styles.td}>{h.date}</td>
                      <td style={styles.td}>{h.type === 'regular' ? 'Regular Holiday' : 'Special Holiday'}</td>
                      <td style={styles.td}>{h.ratePercent}</td>
                      {/* <td style={styles.td}>₱{h.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td> */}
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

            {detailedAttendance.length ? detailedAttendance.map((rec, i) => {
                const rowStyle = i % 2 === 0 ? styles.trEven : styles.trOdd;
                let otDisplay = '-';
                if (rec.otHours && rec.otHours > 0) {
                  otDisplay = getHourMinute(rec.otHours);
                } else if (payroll.otHours && payroll.otHours > 0) {
                  otDisplay = getHourMinute(payroll.otHours);
                }

                // Settings for time-in/time-out
                const settings = payroll && payroll.settings ? payroll.settings : {};

                const morningStart = settings.morning_start || '08:00';
                const morningEnd = settings.morning_end || '12:00';
                const afternoonStart = settings.afternoon_start || '13:00';
                const afternoonEnd = settings.afternoon_end || '17:00';

                // Helper to check if it's not yet time for time-in/time-out
                function isNotYetTime(session, date, type) {
                  // type: 'in' or 'out'
                  const now = new Date();
                  const dateObj = new Date(date);
                  let sessionTime;
                  if (session === 'morning') {
                    sessionTime = type === 'in' ? morningStart : morningEnd;
                  } else {
                    sessionTime = type === 'in' ? afternoonStart : afternoonEnd;
                  }
                  const [h, m] = sessionTime.split(':').map(Number);
                  dateObj.setHours(h, m, 0, 0);
                  return now < dateObj;
                }

                // Morning In
                let morningInDisplay = '-';
                if (rec.morningIn) {
                  morningInDisplay = rec.morningIn;
                } else if (!isNotYetTime('morning', rec.date, 'in')) {
                  morningInDisplay = 'Not time-in';
                }

                // Morning Out
                let morningOutDisplay = '-';
                if (rec.morningOut) {
                  morningOutDisplay = rec.morningOut;
                } else if (!isNotYetTime('morning', rec.date, 'out')) {
                  morningOutDisplay = 'Not time-out';
                }

                // Afternoon In
                let afternoonInDisplay = '-';
                if (rec.afternoonIn) {
                  afternoonInDisplay = rec.afternoonIn;
                } else if (!isNotYetTime('afternoon', rec.date, 'in')) {
                  afternoonInDisplay = 'Not time-in';
                }

                // Afternoon Out
                let afternoonOutDisplay = '-';
                if (rec.afternoonOut) {
                  afternoonOutDisplay = rec.afternoonOut;
                } else if (!isNotYetTime('afternoon', rec.date, 'out')) {
                  afternoonOutDisplay = 'Not time-out';
                }

                return (
                  <tr key={i} style={rowStyle}>
                    <td style={styles.td}>{rec.date}</td>
                    <td style={{...styles.td, color: rec.morningInStatus === 'late' ? styles.lateText.color : undefined}}>{morningInDisplay}</td>
                    <td style={styles.td}>{morningOutDisplay}</td>
                    <td style={{...styles.td, color: rec.afternoonInStatus === 'late' ? styles.lateText.color : undefined}}>{afternoonInDisplay}</td>
                    <td style={styles.td}>{afternoonOutDisplay}</td>
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

<h3 style={styles.sectionTitle}>🚫 Absent Days in Period</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Absent Day</th>
              </tr>
            </thead>
            <tbody>
              {absentCount > 0 ? (
                absentDates.map((date, idx) => (
                  <tr key={date} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.td}>{date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={{...styles.td, color:'#10b981', textAlign:'center'}}>No absences in this period</td>
                </tr>
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
                <td style={styles.td}>₱{(payroll.dailyRate ?? 0).toFixed(2)}</td>
                <td style={styles.td}>₱{(payroll.gross ?? 0).toLocaleString()}</td>
              </tr>
              <tr style={styles.trOdd}>
                <td style={styles.td}>Overtime Pay</td>
                <td style={styles.td}>{getHourMinute(payroll.otHours)}</td>
                <td style={styles.td}>₱{(payroll.otHourlyRate ?? 0).toFixed(2)}</td>
                <td style={styles.td}>₱{(payroll.otPay ?? 0).toLocaleString()}</td>
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
          {/* ₱{(h.rate ?? 0).toFixed(2)}  */}
          <span style={{ color:'#10b981', fontWeight:600 }}>
            {' '}({h.ratePercent}%)
          </span>
        </td>
        <td style={styles.td}>₱{(h.amount ?? 0).toLocaleString()}</td>
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