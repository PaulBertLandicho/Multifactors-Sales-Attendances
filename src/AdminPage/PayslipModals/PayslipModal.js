import React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { generatePayslipPdf } from "./generatePayslipPdf";

// detailedAttendance: [{ date, morningIn, morningOut, afternoonIn, afternoonOut, lateCount, lateDetails: [{session, time, status}]}]
export default function PayslipModal({
  payroll,
  person,
  detailedAttendance = [],
  onClose,
  showPrintButton,
  period,
  released,
}) {
  // useState declarations (only once)
  const [holidayDetails, setHolidayDetails] = useState([]);
  const [deptHolidayRates, setDeptHolidayRates] = useState({
    regular: 0,
    special: 0,
  });
  const [loadingHoliday, setLoadingHoliday] = useState(true);

  // Debug output for troubleshooting
  React.useEffect(() => {
    if (!loadingHoliday) {
      console.log("Fetched holidays:", holidayDetails);
      console.log("Department holiday rates:", deptHolidayRates);
      console.log(
        "Attendance dates:",
        detailedAttendance.map((a) => a.date)
      );
    }
  }, [loadingHoliday, holidayDetails, deptHolidayRates, detailedAttendance]);

  // ✅ FETCH DEPARTMENT RATES
  useEffect(() => {
    async function getDeptHolidayRates() {
      if (!person?.department) return;

      const { data, error } = await supabase
        .from("department_rates")
        .select("*")
        .eq("department", person.department)
        .single();

      if (!error && data) {
        setDeptHolidayRates({
          regular: Number(data.regular_holiday_rate ?? data.holiday_rate ?? 0),
          special: Number(data.special_holiday_rate ?? 0),
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
        const [start, end] = period.split("_to_");
        // Fetch holidays for the department or global (department is null) within the period
        const { data: holidays, error } = await supabase
          .from("holidays")
          .select("*")
          .or(`department.eq.${person.department},department.is.null`)
          .gte("date", start)
          .lte("date", end);
        if (error) throw error;
        // Sort by date
        const all = (holidays || []).sort((a, b) =>
          a.date.localeCompare(b.date)
        );
        setHolidayDetails(all);
      } catch (err) {
        console.error("Error fetching holidays:", err);
        setHolidayDetails([]);
      } finally {
        setLoadingHoliday(false);
      }
    }
    getHolidays();
  }, [person, period]);
  const handlePdf = async () => {
    const grossPay =
      Math.round((standardPayAmount + otPay + totalHolidayPay) * 100) / 100;
    await generatePayslipPdf({
      payroll,
      person,
      period,
      holidayPayDetails,
      totalHolidayPay,
      absentCount,
      totalDeductions,
      daysWorked,
      standardPayAmount,
      otPay,
      gross: grossPay,
    });
  };

  // Helper to display hours and minutes
  const getHourMinute = (hours) => {
    if (!hours || hours <= 0) return "-";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    let str = "";
    if (h > 0 && m > 0) str = `${h}hr and ${m}min`;
    else if (h > 0) str = `${h}hr`;
    else if (m > 0) str = `${m}min`;
    return str || "0min";
  };

  // Format a period string like '2026-04-07_to_2026-04-21' into
  // 'April 07, 2026 to April 21, 2026'. Falls back to original string.
  function formatPeriod(period) {
    if (!period) return "";
    try {
      const s = String(period).replace(/_/g, " ");
      const matches = Array.from(s.matchAll(/(\d{4}[\-/]\d{2}[\-/]\d{2})/g)).map(m => m[1]);
      if (matches.length >= 2) {
        const d1 = new Date(matches[0].replace(/\//g, '-'));
        const d2 = new Date(matches[1].replace(/\//g, '-'));
        if (!Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime())) {
          const f1 = d1.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
          const f2 = d2.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
          return `${f1} to ${f2}`;
        }
      }
      const single = s.match(/(\d{4}[\-/]\d{2}[\-/]\d{2})/);
      if (single) {
        const d = new Date(single[1].replace(/\//g, '-'));
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
      }
      const p = new Date(s);
      if (!Number.isNaN(p.getTime())) return p.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
    } catch (e) {}
    return String(period);
  }

  if (!payroll || !person) return null;

  // Calculate absent days in the 15-day period
  // Get the period start and end from the period string (e.g. 2024-03-01_to_2024-03-15)
  let absentDates = [];
  if (period) {
    const [start, end] = period.split("_to_");
    const startDate = new Date(start);
    const endDate = new Date(end);
    const todayStr = new Date().toISOString().slice(0, 10);
    // Build all dates in the period
    let allDates = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      // Exclude Saturday (6) and Sunday (0)
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        allDates.push(new Date(d));
      }
    }
    // Get all attendance dates (convert to yyyy-mm-dd)
    const attendedDates = detailedAttendance.map((a) => {
      const dt = new Date(a.date);
      return dt.toISOString().slice(0, 10);
    });
    // Find dates in allDates not in attendedDates, but only if date is before today
    absentDates = allDates
      .map((d) => d.toISOString().slice(0, 10))
      .filter(
        (dateStr) => dateStr < todayStr && !attendedDates.includes(dateStr)
      );
  }
  const absentCount = absentDates.length;

  // Calculate holiday pay for each holiday (accurate for payroll period)
  let holidayPayDetails = [];
  let totalHolidayPay = 0;

  if (!loadingHoliday && holidayDetails.length > 0) {
    holidayPayDetails = holidayDetails
      .map((h) => {
        let ratePercent = 0;
        if (h.type === "regular") {
          ratePercent = deptHolidayRates.regular;
        } else if (h.type === "special") {
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
          ratePercent,
        };
      })
      .filter(Boolean);
  }

  // Calculate Standard Pay based on attendance (full/half days)
  // A full day: both morningIn and afternoonIn are present
  // A half day: only one session present
  let daysWorked = 0;
  let daysWorkedDisplay = "";
  if (detailedAttendance.length) {
    let fullDays = 0;
    let halfDays = 0;
    detailedAttendance.forEach((rec) => {
      const hasMorning = !!rec.morningIn;
      const hasAfternoon = !!rec.afternoonIn;
      if (hasMorning && hasAfternoon) {
        fullDays += 1;
      } else if (hasMorning || hasAfternoon) {
        halfDays += 1;
      }
    });
    daysWorked = fullDays + halfDays * 0.5;
    // Display as e.g. "2 full, 1 half (2.5 days)"
    let parts = [];
    if (fullDays > 0) parts.push(`${fullDays} full`);
    if (halfDays > 0) parts.push(`${halfDays} half`);
    daysWorkedDisplay = parts.length
      ? `${parts.join(", ")} (${daysWorked} day${daysWorked !== 1 ? "s" : ""})`
      : "0 days";
  } else {
    daysWorked = payroll.daysPresent || 0;
    daysWorkedDisplay = `${daysWorked} day(s)`;
  }

  // Standard Pay calculation
  const standardPayAmount =
    Math.round(daysWorked * (payroll.dailyRate ?? 0) * 100) / 100;

  // Overtime calculation: always use dailyRate/8 (no premium) for display and calculation, and round to 2 decimals for all math
  const hourlyRate = Math.round(((payroll.dailyRate ?? 0) / 8) * 100) / 100;
  // Ensure otHours is rounded to 2 decimals for precision
  const otHours = Math.round((payroll.otHours ?? 0) * 100) / 100;
  // Round OT pay to 2 decimals for display and math
  const otPay = Math.round(hourlyRate * otHours * 100) / 100;
  const deductions = [
    { label: "SSS", value: person.sss ? Number(payroll.sss) : 0 },
    {
      label: "Pag-ibig",
      value: person.pag_ibig ? Number(payroll.pag_ibig) : 0,
    },
    {
      label: "PhilHealth",
      value: person.philhealth ? Number(payroll.philhealth) : 0,
    },
    { label: "Cash Advance", value: Number(payroll.cashAdvance || 0) },
  ];

  const lateCountLimit =
    payroll.lateCountLimit || payroll.late_count_limit || 5;
  const latePenalty = person.late_penalty || 0;
  const lateDeduction =
    payroll.lateCount >= lateCountLimit ? payroll.lateCount * latePenalty : 0;
  const totalDeductions =
    lateDeduction + deductions.reduce((acc, d) => acc + d.value, 0);

  const totalLateOccurrences = detailedAttendance
    .map((rec) => (rec.lateDetails ? rec.lateDetails.length : 0))
    .reduce((sum, n) => sum + n, 0);

  const allLateDetails = detailedAttendance
    .map((rec) =>
      rec.lateDetails
        ? rec.lateDetails.map((ld) => ({ date: rec.date, ...ld }))
        : []
    )
    .flat();

  const styles = {
    overlay: {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1000,
      backdropFilter: "blur(4px)",
    },
    modal: {
      background: "#fff",
      color: "#1f2937",
      padding: "32px",
      borderRadius: "28px",
      maxWidth: "900px",
      width: "95%",
      overflowY: "auto",
      maxHeight: "90%",
      boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
      border: "1px solid #e5e7eb",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    title: {
      fontSize: "2rem",
      fontWeight: 700,
      color: "#10b981",
      textAlign: "center",
      margin: "0 0 8px 0",
    },
    subtitle: {
      textAlign: "center",
      color: "#6b7280",
      marginBottom: "32px",
      fontSize: "1rem",
    },
    sectionTitle: {
      fontSize: "1.4rem",
      fontWeight: 600,
      color: "#1f2937",
      margin: "32px 0 16px 0",
      borderBottom: "2px solid #10b981",
      paddingBottom: "8px",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginBottom: "24px",
      fontSize: "0.95rem",
    },
    th: {
      background: "#f9fafb",
      color: "#4b5563",
      fontWeight: 600,
      padding: "12px 8px",
      textAlign: "left",
      borderBottom: "2px solid #e5e7eb",
      textTransform: "uppercase",
      fontSize: "0.8rem",
      letterSpacing: "0.03em",
    },
    td: {
      padding: "10px 8px",
      borderBottom: "1px solid #e5e7eb",
      color: "#1f2937",
    },
    trEven: { backgroundColor: "#f9fafb" },
    trOdd: { backgroundColor: "#ffffff" },
    summaryRow: { background: "#f3f4f6", fontWeight: 600 },
    lateText: { color: "#ef4444" },
    netPay: {
      textAlign: "right",
      fontSize: "1.6rem",
      fontWeight: 700,
      color: "#10b981",
      margin: "16px 0 0 0",
    },
    buttonContainer: {
      marginTop: "24px",
      display: "flex",
      justifyContent: "flex-end",
      gap: "12px",
    },
    button: {
      padding: "10px 24px",
      borderRadius: "40px",
      fontSize: "0.95rem",
      fontWeight: 500,
      border: "none",
      cursor: "pointer",
      transition: "all 0.2s",
      boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    },
    buttonPrimary: { background: "#10b981", color: "#fff" },
    buttonSecondary: {
      background: "#e5e7eb",
      color: "#1f2937",
      border: "1px solid #d1d5db",
    },
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* ✅ PDF ONLY CONTENT */}
        <div className="payslip-modal-content-inner">
          <h2 style={styles.title}>Payslip</h2>
          <p style={styles.subtitle}>
            {person.name} • {person.department} • ID: {person.id}
          </p>
          {period && (
            <p
              style={{
                textAlign: "center",
                color: "#10b981",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Period: {formatPeriod(period)}
            </p>
          )}
          {released && (
            <p
              style={{
                textAlign: "center",
                color: "#10b981",
                fontWeight: 700,
                fontSize: "1.1rem",
                marginBottom: 8,
              }}
            >
              Payslip Released
            </p>
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
                      <td style={styles.td}>
                        {h.type === "regular"
                          ? "Regular Holiday"
                          : "Special Holiday"}
                      </td>
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
                {/* Removed unused OT (hrs) column */}
              </tr>
            </thead>
            <tbody>
              {detailedAttendance.length ? (
                detailedAttendance.map((rec, i) => {
                  const rowStyle = i % 2 === 0 ? styles.trEven : styles.trOdd;
                  // Removed unused otDisplay variable

                  // Settings for time-in/time-out
                  const settings =
                    payroll && payroll.settings ? payroll.settings : {};

                  const morningStart = settings.morning_start || "08:00";
                  const morningEnd = settings.morning_end || "12:00";
                  const afternoonStart = settings.afternoon_start || "13:00";
                  const afternoonEnd = settings.afternoon_end || "17:00";

                  // Helper to check if it's not yet time for time-in/time-out
                  function isNotYetTime(session, date, type) {
                    // type: 'in' or 'out'
                    const now = new Date();
                    const dateObj = new Date(date);
                    let sessionTime;
                    if (session === "morning") {
                      sessionTime = type === "in" ? morningStart : morningEnd;
                    } else {
                      sessionTime =
                        type === "in" ? afternoonStart : afternoonEnd;
                    }
                    const [h, m] = sessionTime.split(":").map(Number);
                    dateObj.setHours(h, m, 0, 0);
                    return now < dateObj;
                  }

                  // Morning In
                  let morningInDisplay = "-";
                  if (rec.morningIn) {
                    morningInDisplay = rec.morningIn;
                  } else if (!isNotYetTime("morning", rec.date, "in")) {
                    morningInDisplay = "Not time-in";
                  }

                  // Morning Out
                  let morningOutDisplay = "-";
                  if (rec.morningOut) {
                    morningOutDisplay = rec.morningOut;
                  } else if (!isNotYetTime("morning", rec.date, "out")) {
                    morningOutDisplay = "Not time-out";
                  }

                  // Afternoon In
                  let afternoonInDisplay = "-";
                  if (rec.afternoonIn) {
                    afternoonInDisplay = rec.afternoonIn;
                  } else if (!isNotYetTime("afternoon", rec.date, "in")) {
                    afternoonInDisplay = "Not time-in";
                  }

                  // Afternoon Out
                  let afternoonOutDisplay = "-";
                  if (rec.afternoonOut) {
                    afternoonOutDisplay = rec.afternoonOut;
                  } else if (!isNotYetTime("afternoon", rec.date, "out")) {
                    afternoonOutDisplay = "Not time-out";
                  }

                  return (
                    <tr key={i} style={rowStyle}>
                      <td style={styles.td}>{rec.date}</td>
                      <td
                        style={{
                          ...styles.td,
                          color:
                            rec.morningInStatus === "late"
                              ? styles.lateText.color
                              : undefined,
                        }}
                      >
                        {morningInDisplay}
                      </td>
                      <td style={styles.td}>{morningOutDisplay}</td>
                      <td
                        style={{
                          ...styles.td,
                          color:
                            rec.afternoonInStatus === "late"
                              ? styles.lateText.color
                              : undefined,
                        }}
                      >
                        {afternoonInDisplay}
                      </td>
                      <td style={styles.td}>{afternoonOutDisplay}</td>
                      <td style={styles.td}>{rec.lateCount || 0}</td>
                      <td style={styles.td}>
                        {rec.lateDetails && rec.lateDetails.length ? (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {rec.lateDetails.map((d, idx) => (
                              <li key={idx} style={styles.lateText}>
                                {d.session}: {d.time} ({d.status})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "-"
                        )}
                      </td>
                      {/* Removed unused otDisplay cell */}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="8"
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      color: "#9ca3af",
                    }}
                  >
                    No attendance records
                  </td>
                </tr>
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
                  <tr
                    key={date}
                    style={idx % 2 === 0 ? styles.trEven : styles.trOdd}
                  >
                    <td style={styles.td}>{date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    style={{
                      ...styles.td,
                      color: "#10b981",
                      textAlign: "center",
                    }}
                  >
                    No absences in this period
                  </td>
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
              {allLateDetails.length ? (
                allLateDetails.map((d, i) => {
                  const rowStyle = i % 2 === 0 ? styles.trEven : styles.trOdd;
                  return (
                    <tr key={i} style={rowStyle}>
                      <td style={styles.td}>{d.date}</td>
                      <td style={styles.td}>{d.session}</td>
                      <td style={styles.td}>{d.time}</td>
                      <td
                        style={{
                          ...styles.td,
                          color:
                            d.status === "late"
                              ? styles.lateText.color
                              : undefined,
                        }}
                      >
                        {d.status}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      color: "#9ca3af",
                    }}
                  >
                    No late records
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Earnings */}

          <h3 style={styles.sectionTitle}>💸 Earnings</h3>
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
                <td style={styles.td}>{daysWorkedDisplay}</td>
                <td style={styles.td}>
                  ₱{(payroll.dailyRate ?? 0).toFixed(2)}
                </td>
                <td style={styles.td}>
                  ₱
                  {standardPayAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </td>
              </tr>
              <tr style={styles.trOdd}>
                <td style={styles.td}>Overtime Pay</td>
                <td style={styles.td}>{getHourMinute(otHours)}</td>
                <td style={styles.td}>
                  (Daily Rate) ÷ 8hrs =₱{hourlyRate.toFixed(2)}
                </td>
                <td style={styles.td}>₱{otPay.toFixed(2)}</td>
              </tr>
              {/* ✅ Holiday Pay */}
              {holidayPayDetails.length > 0 ? (
                <>
                  {holidayPayDetails.map((h, idx) => (
                    <tr
                      key={idx}
                      style={idx % 2 === 0 ? styles.trEven : styles.trOdd}
                    >
                      <td style={styles.td}>Holiday Pay</td>
                      <td style={styles.td}>
                        {h.date} (
                        {h.type === "regular"
                          ? "Regular Holiday"
                          : "Special Holiday"}
                        )
                      </td>
                      <td style={styles.td}>
                        <span style={{ color: "#10b981", fontWeight: 600 }}>
                          {" "}
                          ({h.ratePercent}%)
                        </span>
                      </td>
                      <td style={styles.td}>
                        ₱{(h.amount ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  <tr style={styles.summaryRow}>
                    <td colSpan="3" style={styles.td}>
                      Total Holiday Pay
                    </td>
                    <td style={styles.td}>
                      ₱{totalHolidayPay.toLocaleString()}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    style={{ textAlign: "center", color: "#9ca3af" }}
                  >
                    No holiday pay for this period
                  </td>
                </tr>
              )}
              <tr style={styles.summaryRow}>
                <td colSpan="3" style={styles.td}>
                  Gross Pay
                </td>
                <td style={styles.td}>
                  ₱
                  {(
                    Math.round(
                      (standardPayAmount + otPay + totalHolidayPay) * 100
                    ) / 100
                  ).toFixed(2)}
                </td>
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
                <td style={styles.td}>Total Late Deduction</td>
                <td style={styles.td}>₱{lateDeduction.toLocaleString()}</td>
              </tr>
              {deductions.map((d, i) => (
                <tr
                  key={d.label}
                  style={i % 2 === 0 ? styles.trEven : styles.trOdd}
                >
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

          {/* Net Pay: use rounded OT pay in gross calculation */}
          <h3 style={styles.netPay}>
            Net Pay: ₱
            {(
              Math.round(
                ((standardPayAmount ?? 0) + otPay + totalHolidayPay - totalDeductions) *
                  100
              ) / 100
            ).toFixed(2)}
          </h3>
        </div>

        {/* ✅ BUTTONS OUTSIDE PDF */}
        <div style={styles.buttonContainer}>
          {showPrintButton && (
            <button
              onClick={handlePdf}
              style={{ ...styles.button, ...styles.buttonPrimary }}
            >
              🖨️ PDF
            </button>
          )}
          <button
            onClick={onClose}
            style={{ ...styles.button, ...styles.buttonSecondary }}
          >
            ✖️ Close
          </button>
        </div>
      </div>
    </div>
  );
}
