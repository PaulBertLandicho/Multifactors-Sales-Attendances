import React from 'react';

// detailedAttendance: [{ date, morningIn, morningOut, afternoonIn, afternoonOut, lateCount, lateDetails: [{session, time, status}]}]
export default function PayslipModal({ payroll, person, daysWorked = [], detailedAttendance = [], onClose, onPrint, showPrintButton }) {
  if (!payroll || !person) return null;

  const deductions = [
    { label: 'SSS', value: person.sss ? Number(payroll.sss) : 0 },
    { label: 'Pag-ibig', value: person.pag_ibig ? Number(payroll.pag_ibig) : 0 },
    { label: 'PhilHealth', value: person.philhealth ? Number(payroll.philhealth) : 0 },
    { label: 'Cash Advance', value: Number(payroll.cashAdvance || 0) }
  ];

  // Calculate late deduction based on late count limit
  const lateCountLimit = payroll.lateCountLimit || payroll.late_count_limit || 5;
  const latePenalty = person.late_penalty || 0;
  const lateDeduction = payroll.lateCount >= lateCountLimit ? payroll.lateCount * latePenalty : 0;
  const totalDeductions = lateDeduction + deductions.reduce((acc, d) => acc + d.value, 0);

    // Calculate total late occurrences across all days
    const totalLateOccurrences = detailedAttendance.map(rec => rec.lateDetails ? rec.lateDetails.length : 0).reduce((sum, n) => sum + n, 0);

    // Gather all late details for listing
    const allLateDetails = detailedAttendance
      .map(rec => rec.lateDetails ? rec.lateDetails.map(ld => ({ date: rec.date, ...ld })) : [])
      .flat();

  const tableHeaderStyle = { background: '#f0f4f8', fontWeight: 'bold', padding: '8px', border: '1px solid #ccc' };
  const tableCellStyle = { padding: '8px', border: '1px solid #ccc' };
  const summaryRowStyle = { background: '#e2e8f0', fontWeight: 'bold' };

  return (
    <div style={{
      position: 'fixed', top:0, left:0, width:'100%', height:'100%',
      background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000
    }}>
      <div style={{
        background:'#ffffff', color:'#111827', padding:24, borderRadius:10, maxWidth:750, width:'95%',
        overflowY:'auto', maxHeight:'90%', boxShadow:'0 10px 25px rgba(0,0,0,0.2)'
      }}>

        <h2 style={{ textAlign:'center', marginBottom:16 }}>Payslip - {person.name}</h2>
        <p style={{ textAlign:'center', marginBottom:24 }}>
          <strong>Department:</strong> {person.department} | <strong>ID:</strong> {person.id}
        </p>

        {/* Detailed Attendance Table */}
        <h3>Attendance Details</h3>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:20 }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Date</th>
              <th style={tableHeaderStyle}>Morning In</th>
              <th style={tableHeaderStyle}>Morning Out</th>
              <th style={tableHeaderStyle}>Afternoon In</th>
              <th style={tableHeaderStyle}>Afternoon Out</th>
              <th style={tableHeaderStyle}>Late Count</th>
              <th style={tableHeaderStyle}>Late Details</th>
              <th style={tableHeaderStyle}>Overtime (hrs)</th>
            </tr>
          </thead>
          <tbody>
            {detailedAttendance.length ? detailedAttendance.map((rec, i) => {
              // Estimate OT for each day: if afternoonOut is after 17:00
              let otHours = 0;
              if (rec.afternoonOut) {
                const [h, m] = rec.afternoonOut.split(':').map(Number);
                if (h > 17 || (h === 17 && m > 0)) {
                  otHours = (h - 17) + (m / 60);
                }
              }
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? '#f9fafb' : '#ffffff' }}>
                  <td style={tableCellStyle}>{rec.date}</td>
                  <td style={{...tableCellStyle, color: rec.morningInStatus === 'late' ? '#f44336' : undefined}}>{rec.morningIn || '-'}</td>
                  <td style={tableCellStyle}>{rec.morningOut || '-'}</td>
                  <td style={{...tableCellStyle, color: rec.afternoonInStatus === 'late' ? '#f44336' : undefined}}>{rec.afternoonIn || '-'}</td>
                  <td style={tableCellStyle}>{rec.afternoonOut || '-'}</td>
                  <td style={tableCellStyle}>{rec.lateCount || 0}</td>
                  <td style={tableCellStyle}>
                    {rec.lateDetails && rec.lateDetails.length ? (
                      <ul style={{margin:0, paddingLeft:16}}>
                        {rec.lateDetails.map((d, idx) => (
                          <li key={idx} style={{color:'#f44336'}}>
                            {d.session}: {d.time} ({d.status})
                          </li>
                        ))}
                      </ul>
                    ) : '-'}
                  </td>
                  <td style={tableCellStyle}>{otHours > 0 ? otHours.toFixed(2) : '-'}</td>
                </tr>
              );
            }) : <tr><td colSpan="8" style={tableCellStyle}>No records</td></tr>}
          </tbody>
        </table>

        {/* All Late Records Table */}
        <h3>All Late Records</h3>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:20 }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Date</th>
              <th style={tableHeaderStyle}>Session</th>
              <th style={tableHeaderStyle}>Time</th>
              <th style={tableHeaderStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {allLateDetails.length ? allLateDetails.map((d, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#f9fafb' : '#ffffff' }}>
                <td style={tableCellStyle}>{d.date}</td>
                <td style={tableCellStyle}>{d.session}</td>
                <td style={tableCellStyle}>{d.time}</td>
                <td style={{...tableCellStyle, color: d.status === 'late' ? '#f44336' : undefined}}>{d.status}</td>
              </tr>
            )) : <tr><td colSpan="4" style={tableCellStyle}>No late records</td></tr>}
          </tbody>
        </table>

        {/* Earnings */}
        <h3>Earnings</h3>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:20 }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Type</th>
              <th style={tableHeaderStyle}>Days/Hours</th>
              <th style={tableHeaderStyle}>Rate</th>
              <th style={tableHeaderStyle}>Current</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background:'#f9fafb' }}>
              <td style={tableCellStyle}>Standard Pay</td>
              <td style={tableCellStyle}>{payroll.daysPresent} day(s)</td>
              <td style={tableCellStyle}>{payroll.dailyRate.toFixed(2)}</td>
              <td style={tableCellStyle}>{payroll.gross.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={tableCellStyle}>Overtime Pay</td>
              <td style={tableCellStyle}>{payroll.otHours} hour(s)</td>
              <td style={tableCellStyle}>{payroll.otHourlyRate.toFixed(2)}</td>
              <td style={tableCellStyle}>{payroll.otPay.toLocaleString()}</td>
            </tr>
            <tr style={{ background:'#f9fafb' }}>
              <td style={tableCellStyle}>Holiday Pay</td>
              <td style={tableCellStyle}>{payroll.holidayDays}</td>
              <td style={tableCellStyle}>{payroll.dailyRate.toFixed(2)}</td>
              <td style={tableCellStyle}>{payroll.holidayPay.toLocaleString()}</td>
            </tr>
            <tr style={summaryRowStyle}>
              <td colSpan="3" style={tableCellStyle}>Gross Pay</td>
              <td style={tableCellStyle}>{payroll.gross.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* Deductions */}
        <h3>Deductions</h3>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:20 }}>
          <tbody>
              <tr style={{ background:'#e2e8f0' }}>
                <td style={tableCellStyle}><strong>Total Late Occurrences</strong></td>
                <td style={tableCellStyle}><strong>{totalLateOccurrences} occurrence(s)</strong></td>
              </tr>
            <tr style={{ background:'#f9fafb' }}>
              <td style={tableCellStyle}>Late Count</td>
              <td style={tableCellStyle}>{payroll.lateCount} occurrence(s)</td>
            </tr>
            <tr>
              <td style={tableCellStyle}>Late Count Limit for Deduction</td>
              <td style={tableCellStyle}>{lateCountLimit} occurrence(s)</td>
            </tr>
            <tr>
              <td style={tableCellStyle}>Late Deduction</td>
              <td style={tableCellStyle}>₱{lateDeduction.toLocaleString()}</td>
            </tr>
            {deductions.map((d,i) => (
              <tr key={d.label} style={{ background: i % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                <td style={tableCellStyle}>{d.label}</td>
                <td style={tableCellStyle}>₱{d.value.toLocaleString()}</td>
              </tr>
            ))}
            <tr style={summaryRowStyle}>
              <td style={tableCellStyle}>Total Deductions</td>
              <td style={tableCellStyle}>₱{totalDeductions.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ textAlign:'right', color:'#1e3a8a' }}>Net Pay: ₱{(payroll.gross - totalDeductions).toLocaleString()}</h3>

        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end', gap:8 }}>
          {showPrintButton && <button onClick={onPrint} style={{ padding:'8px 16px', background:'#1e3a8a', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}>Print</button>}
          <button onClick={onClose} style={{ padding:'8px 16px', background:'#6b7280', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}>Close</button>
        </div>

      </div>
    </div>
  );
}