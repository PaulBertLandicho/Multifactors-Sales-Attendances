import React from 'react';

// detailedAttendance: [{ date, morningIn, morningOut, afternoonIn, afternoonOut, lateCount, lateDetails: [{session, time, status}]}]
export default function PayslipModal({
  payroll,
  person,
  detailedAttendance = [],
  onClose,
  showPrintButton
}) {
  // PDF generation handler for payslip content only
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

  if (!payroll || !person) return null;

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
                const otHours = rec.afternoonOut ? Math.max(0, Number(rec.afternoonOut.split(':')[0]) - 17 + (Number(rec.afternoonOut.split(':')[1])/60)) : 0;
                const rowStyle = i % 2 === 0 ? styles.trEven : styles.trOdd;
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
                    <td style={styles.td}>{otHours ? otHours.toFixed(2) : '-'}</td>
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
          <h3 style={styles.sectionTitle}>💰 Earnings</h3>
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
                <td style={styles.td}>{payroll.otHours} hour(s)</td>
                <td style={styles.td}>₱{payroll.otHourlyRate.toFixed(2)}</td>
                <td style={styles.td}>₱{payroll.otPay.toLocaleString()}</td>
              </tr>
              <tr style={styles.trEven}>
                <td style={styles.td}>Holiday Pay</td>
                <td style={styles.td}>{payroll.holidayDays} day(s)</td>
                <td style={styles.td}>₱{payroll.dailyRate.toFixed(2)}</td>
                <td style={styles.td}>₱{payroll.holidayPay.toLocaleString()}</td>
              </tr>
              <tr style={styles.summaryRow}>
                <td colSpan="3" style={styles.td}>Gross Pay</td>
                <td style={styles.td}>₱{payroll.gross.toLocaleString()}</td>
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

          <h3 style={styles.netPay}>Net Pay: ₱{(payroll.gross - totalDeductions).toLocaleString()}</h3>
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