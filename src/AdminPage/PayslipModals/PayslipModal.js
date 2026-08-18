import React, { useEffect, useState } from "react";
import {
  FiPrinter,
  FiCalendar,
  FiClipboard,
  FiX,
  FiClock,
  FiTrendingDown,
} from "react-icons/fi";
import Icon from "../../components/Icon";
import { supabase } from "../../supabaseClient";
import { generatePayslipPdf } from "./generatePayslipPdf";

export default function PayslipModal({
  payroll,
  person,
  detailedAttendance = [],
  onClose,
  showPrintButton,
  period,
  released,
}) {
  const [holidayDetails, setHolidayDetails] = useState([]);
  const [deptHolidayRates, setDeptHolidayRates] = useState({
    regular: 0,
    special: 0,
  });
  const [loadingHoliday, setLoadingHoliday] = useState(true);
  const [cashAdvanceTotalInPeriod, setCashAdvanceTotalInPeriod] = useState(0);
  const [cashAdvanceEntries, setCashAdvanceEntries] = useState([]);

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

  useEffect(() => {
    async function getHolidays() {
      try {
        if (!person || !period) return;
        const [start, end] = period.split("_to_");
        const { data: holidays, error } = await supabase
          .from("holidays")
          .select("*")
          .or(`department.eq.${person.department},department.is.null`)
          .gte("date", start)
          .lte("date", end);
        if (error) throw error;
        const all = (holidays || []).sort((a, b) =>
          a.date.localeCompare(b.date),
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

  useEffect(() => {
    let mounted = true;
    async function fetchCashAdvanceTotal() {
      if (!person?.id || !period) {
        if (mounted) setCashAdvanceTotalInPeriod(0);
        return;
      }

      try {
        const [start, end] = period.split("_to_");
        const { data, error } = await supabase
          .from("cash_advances")
          .select("id, amount, created_at, note")
          .eq("person_id", person.id)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: true });
        if (error) throw error;
        const entries = data || [];
        const total = entries.reduce((s, r) => s + Number(r.amount || 0), 0);
        if (mounted) {
          setCashAdvanceEntries(entries);
          setCashAdvanceTotalInPeriod(Math.round(total * 100) / 100);
        }
      } catch (err) {
        console.error("Error fetching cash advance total:", err);
        if (mounted) setCashAdvanceTotalInPeriod(0);
      }
    }
    fetchCashAdvanceTotal();
    return () => {
      mounted = false;
    };
  }, [person, period]);

  const handlePdf = async () => {
    const grossPay =
      Math.round((standardPayAmount + otPay + totalHolidayPay) * 100) / 100;
    let totalOtMinutesForPdf = 0;
    try {
      const sched = payroll && payroll.settings ? payroll.settings : {};
      const schedMorningEnd = sched.morning_end || "12:00";
      const schedAfternoonEnd = sched.afternoon_end || "17:00";
      (detailedAttendance || []).forEach((rec) => {
        try {
          const mOut = parseTimeToMinutes(rec.morningOut);
          const aOut = parseTimeToMinutes(rec.afternoonOut);
          const mEnd = parseTimeToMinutes(schedMorningEnd);
          const aEnd = parseTimeToMinutes(schedAfternoonEnd);
          if (
            typeof mOut === "number" &&
            typeof mEnd === "number" &&
            mOut > mEnd
          )
            totalOtMinutesForPdf += mOut - mEnd;
          if (
            typeof aOut === "number" &&
            typeof aEnd === "number" &&
            aOut > aEnd
          )
            totalOtMinutesForPdf += aOut - aEnd;
        } catch (e) {}
      });
    } catch (e) {}
    const totalOtHoursForPdf =
      Math.round((totalOtMinutesForPdf / 60) * 100) / 100;
    try {
      payroll.otHours = totalOtHoursForPdf;
    } catch (e) {}
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
      otHours: totalOtHoursForPdf,
      gross: grossPay,
      cashAdvanceEntries,
      cashAdvanceTotalInPeriod,
    });
  };

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

  function formatPeriod(period) {
    if (!period) return "";
    try {
      const s = String(period).replace(/_/g, " ");
      const matches = Array.from(s.matchAll(/(\d{4}[-/]\d{2}[-/]\d{2})/g)).map(
        (m) => m[1],
      );
      if (matches.length >= 2) {
        const d1 = new Date(matches[0].replace(/\//g, "-"));
        const d2 = new Date(matches[1].replace(/\//g, "-"));
        if (!Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime())) {
          const f1 = d1.toLocaleDateString("en-US", {
            month: "long",
            day: "2-digit",
            year: "numeric",
          });
          const f2 = d2.toLocaleDateString("en-US", {
            month: "long",
            day: "2-digit",
            year: "numeric",
          });
          return `${f1} to ${f2}`;
        }
      }
      const single = s.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
      if (single) {
        const d = new Date(single[1].replace(/\//g, "-"));
        if (!Number.isNaN(d.getTime()))
          return d.toLocaleDateString("en-US", {
            month: "long",
            day: "2-digit",
            year: "numeric",
          });
      }
      const p = new Date(s);
      if (!Number.isNaN(p.getTime()))
        return p.toLocaleDateString("en-US", {
          month: "long",
          day: "2-digit",
          year: "numeric",
        });
    } catch (e) {}
    return String(period);
  }

  const formatDateWithWeekday = (isoDateStr) => {
    try {
      const d = new Date(isoDateStr);
      if (Number.isNaN(d.getTime())) return isoDateStr;
      const dateLabel = d.toLocaleDateString("en-US", {
        month: "long",
        day: "2-digit",
        year: "numeric",
      });
      const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
      return `${dateLabel} (${weekday})`;
    } catch (e) {
      return isoDateStr;
    }
  };

  function parseTimeToMinutes(t) {
    if (!t) return null;
    const m = String(t)
      .trim()
      .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = m[3] ? Number(m[3]) : 0;
    const ampm = m[4];
    if (ampm) {
      const a = ampm.toLowerCase();
      if (a === "pm" && hh !== 12) hh += 12;
      if (a === "am" && hh === 12) hh = 0;
    }
    return hh * 60 + mm + Math.round(ss / 60);
  }

  if (!payroll || !person) return null;

  let absentDates = [];
  if (period) {
    const [start, end] = period.split("_to_");
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate) || isNaN(endDate)) return null;
    const todayStr = new Date().toISOString().slice(0, 10);

    const holidaySet = new Set(
      (holidayDetails || [])
        .map((h) => {
          const raw = h && (h.date || h.holiday_date || h.holiday);
          if (!raw) return null;
          try {
            return new Date(raw).toISOString().slice(0, 10);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean),
    );

    let allDates = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const dCopy = new Date(d);
      if (isNaN(dCopy)) continue;
      const dateStr = dCopy.toISOString().slice(0, 10);
      if (holidaySet.has(dateStr)) continue;
      allDates.push(dCopy);
    }

    const attendanceByDate = Object.fromEntries(
      (detailedAttendance || [])
        .map((a) => {
          const parsed = new Date(a.date);
          if (isNaN(parsed)) return null;
          const dt = parsed.toISOString().slice(0, 10);
          return [dt, a];
        })
        .filter(Boolean),
    );

    const ps = String(
      person && (person.shift || person.work_hours || ""),
    ).toLowerCase();
    const expectsMorningOnly =
      (ps.includes("morning") && ps.includes("half")) ||
      ps === "morning" ||
      ps === "morning-half";
    const expectsAfternoonOnly =
      (ps.includes("afternoon") && ps.includes("half")) ||
      ps === "afternoon" ||
      ps === "afternoon-half";
    const expectsSingleSession =
      ps === "half" ||
      ps === "half-day" ||
      ps === "4" ||
      ps === "4h" ||
      ps.includes("half");

    absentDates = allDates
      .map((d) => {
        if (isNaN(d)) return null;
        return d.toISOString().slice(0, 10);
      })
      .filter((dateStr) => dateStr && dateStr < todayStr)
      .map((dateStr) => {
        const rec = attendanceByDate[dateStr] || null;
        if (!rec) {
          return { date: dateStr, missing: "Full Day" };
        }
        const hasMorning = !!rec.morningIn;
        const hasAfternoon = !!rec.afternoonIn;

        if (expectsMorningOnly) {
          if (!hasMorning) return { date: dateStr, missing: "Morning" };
          return null;
        }
        if (expectsAfternoonOnly) {
          if (!hasAfternoon) return { date: dateStr, missing: "Afternoon" };
          return null;
        }
        if (expectsSingleSession) {
          if (!hasMorning && !hasAfternoon)
            return { date: dateStr, missing: "Session" };
          return null;
        }
        if (!hasMorning && !hasAfternoon)
          return { date: dateStr, missing: "Full Day" };
        if (!hasMorning) return { date: dateStr, missing: "Morning" };
        if (!hasAfternoon) return { date: dateStr, missing: "Afternoon" };
        return null;
      })
      .filter(Boolean);
  }
  const absentCount = absentDates.length;

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

  let daysWorked = 0;
  let daysWorkedDisplay = "";
  const payrollDaysPresent =
    payroll && (payroll.daysPresent ?? payroll.days_present ?? null);
  if (payrollDaysPresent != null) {
    daysWorked = Number(payrollDaysPresent) || 0;
    daysWorkedDisplay = `${daysWorked} day(s)`;
  } else if (detailedAttendance.length) {
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

  const standardPayAmount =
    Math.round(daysWorked * (payroll.dailyRate ?? 0) * 100) / 100;

  const hourlyRate = Math.round(((payroll.dailyRate ?? 0) / 8) * 100) / 100;
  const otHours = Math.round((payroll.otHours ?? 0) * 100) / 100;
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
  ];

  const lateCountLimit =
    payroll.lateCountLimit || payroll.late_count_limit || 5;
  const latePenalty = person.late_penalty || 0;
  const lateDeduction =
    payroll.totalLateDeduction ??
    payroll.total_late_deduction ??
    (payroll.lateCount >= lateCountLimit ? payroll.lateCount * latePenalty : 0);
  const computedDeductionsSum =
    lateDeduction + deductions.reduce((acc, d) => acc + d.value, 0) +
    Number(cashAdvanceTotalInPeriod || 0);
  const totalDeductions =
    Math.round(
      (Number(payroll.totalDeductions ?? payroll.total_deductions ?? computedDeductionsSum) || computedDeductionsSum) *
        100,
    ) / 100;

  const totalLateOccurrences = detailedAttendance
    .map((rec) => (rec.lateDetails ? rec.lateDetails.length : 0))
    .reduce((sum, n) => sum + n, 0);

  const allLateDetails = detailedAttendance
    .map((rec) =>
      rec.lateDetails
        ? rec.lateDetails.map((ld) => ({ date: rec.date, ...ld }))
        : [],
    )
    .flat();

  return (
    <div className="fixed inset-0 w-full h-full bg-black/50 flex justify-center items-center z-[1000] backdrop-blur-sm">
      <div className="bg-white text-gray-800 p-6 sm:p-8 rounded-2xl max-w-[900px] w-[95%] overflow-y-auto max-h-[90%] shadow-[0_20px_40px_rgba(0,0,0,0.2)] border border-gray-200 font-sans">
        {/* PDF / Content Container */}
        <div className="payslip-modal-content-inner">
          <h2 className="text-3xl font-bold text-[#237227] text-center m-0 mb-2">Payslip</h2>
          <p className="text-center text-gray-500 mb-6 text-base">
            {person.name} • {person.department} • ID: {person.id}
          </p>
          {period && (
            <p className="text-center text-[#237227] font-semibold mb-2">
              Period: {formatPeriod(period)}
            </p>
          )}
          {released && (
            <p className="text-center text-[#237227] font-bold text-lg mb-2">
              Payslip Released
            </p>
          )}

          {/* Holiday Table */}
          {!loadingHoliday && holidayPayDetails.length > 0 && (
            <>
              <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b-2 border-[#237227] pb-2 flex items-center">
                <Icon
                  as={FiCalendar}
                  className="mr-2 inline text-emerald-700"
                  ariaLabel="Holidays"
                />
                Holidays This Month
              </h3>
              <div className="overflow-x-auto mb-6 border border-gray-200">
                <table className="w-full border-collapse text-[0.95rem]">
                  <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-xs tracking-wider border-b-2 border-gray-200">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">Rate (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {holidayPayDetails.map((h) => (
                      <tr key={h.date + h.type} className="hover:bg-gray-50 transition-colors">
                        <td className="p-2.5 px-3 text-gray-800">{h.date}</td>
                        <td className="p-2.5 px-3 text-gray-800">
                          {h.type === "regular"
                            ? "Regular Holiday"
                            : "Special Holiday"}
                        </td>
                        <td className="p-2.5 px-3 text-gray-800">{h.ratePercent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Attendance Table */}
          <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b-2 border-[#237227] pb-2 flex items-center">
            <Icon
              as={FiClipboard}
              className="mr-2 inline text-emerald-700"
              ariaLabel="Attendance"
            />
            Attendance Details
          </h3>

          <div className="overflow-x-auto mb-6 border border-gray-200">
            <table className="w-full border-collapse text-[0.95rem]">
              <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-xs tracking-wider border-b-2 border-gray-200">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Morning In</th>
                  <th className="p-3 text-left">Morning Out</th>
                  <th className="p-3 text-left">Afternoon In</th>
                  <th className="p-3 text-left">Afternoon Out</th>
                  <th className="p-3 text-left">OT</th>
                  <th className="p-3 text-left">Late Count</th>
                  <th className="p-3 text-left">Late Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {detailedAttendance.length ? (
                  detailedAttendance.map((rec, i) => {
                    const settings =
                      payroll && payroll.settings ? payroll.settings : {};

                    const morningStart = settings.morning_start || "08:00";
                    const morningEnd = settings.morning_end || "12:00";
                    const afternoonStart = settings.afternoon_start || "13:00";
                    const afternoonEnd = settings.afternoon_end || "17:00";

                    function isNotYetTime(session, date, type) {
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

                    let morningInDisplay = "-";
                    if (rec.morningIn) {
                      morningInDisplay = rec.morningIn;
                    } else if (!isNotYetTime("morning", rec.date, "in")) {
                      morningInDisplay = "Not time-in";
                    }

                    let morningOutDisplay = "-";
                    if (rec.morningOut) {
                      morningOutDisplay = rec.morningOut;
                    } else if (!isNotYetTime("morning", rec.date, "out")) {
                      morningOutDisplay = "Not time-out";
                    }

                    let afternoonInDisplay = "-";
                    if (rec.afternoonIn) {
                      afternoonInDisplay = rec.afternoonIn;
                    } else if (!isNotYetTime("afternoon", rec.date, "in")) {
                      afternoonInDisplay = "Not time-in";
                    }

                    let afternoonOutDisplay = "-";
                    if (rec.afternoonOut) {
                      afternoonOutDisplay = rec.afternoonOut;
                    } else if (!isNotYetTime("afternoon", rec.date, "out")) {
                      afternoonOutDisplay = "Not time-out";
                    }

                    let otMinutes = 0;
                    try {
                      const scheduledMorningEnd =
                        (settings && settings.morning_end) || "12:00";
                      const scheduledAfternoonEnd =
                        (settings && settings.afternoon_end) || "17:00";
                      const morningOutMin = parseTimeToMinutes(rec.morningOut);
                      const afternoonOutMin = parseTimeToMinutes(
                        rec.afternoonOut,
                      );
                      const schedMorningEndMin =
                        parseTimeToMinutes(scheduledMorningEnd);
                      const schedAfternoonEndMin = parseTimeToMinutes(
                        scheduledAfternoonEnd,
                      );
                      if (
                        typeof afternoonOutMin === "number" &&
                        typeof schedAfternoonEndMin === "number" &&
                        afternoonOutMin > schedAfternoonEndMin
                      ) {
                        otMinutes += afternoonOutMin - schedAfternoonEndMin;
                      }
                      if (
                        typeof morningOutMin === "number" &&
                        typeof schedMorningEndMin === "number" &&
                        morningOutMin > schedMorningEndMin
                      ) {
                        otMinutes += morningOutMin - schedMorningEndMin;
                      }
                    } catch (e) {
                      otMinutes = 0;
                    }

                    const recOtHours = Math.round((otMinutes / 60) * 100) / 100;

                    return (
                      <tr
                        key={i}
                        className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}
                      >
                        <td className="p-2.5 px-3 text-gray-800 font-mono text-sm">{rec.date}</td>
                        <td
                          className={`p-2.5 px-3 ${
                            rec.morningInStatus === "late"
                              ? "text-red-500 font-medium"
                              : "text-gray-800"
                          }`}
                        >
                          {morningInDisplay}
                        </td>
                        <td className="p-2.5 px-3 text-gray-800">{morningOutDisplay}</td>
                        <td
                          className={`p-2.5 px-3 ${
                            rec.afternoonInStatus === "late"
                              ? "text-red-500 font-medium"
                              : "text-gray-800"
                          }`}
                        >
                          {afternoonInDisplay}
                        </td>
                        <td className="p-2.5 px-3 text-gray-800">{afternoonOutDisplay}</td>
                        <td className="p-2.5 px-3 text-gray-800">
                          {getHourMinute(recOtHours)} ({recOtHours.toFixed(2)})
                        </td>
                        <td className="p-2.5 px-3 text-gray-800">{rec.lateCount || 0}</td>
                        <td className="p-2.5 px-3 text-gray-800">
                          {rec.lateDetails && rec.lateDetails.length ? (
                            <ul className="m-0 pl-4 list-disc">
                              {rec.lateDetails.map((d, idx) => (
                                <li key={idx} className="text-red-500 text-xs">
                                  {d.session}: {d.time} ({d.status})
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan="8"
                      className="p-4 text-center text-gray-400"
                    >
                      No attendance records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b-2 border-[#237227] pb-2 flex items-center">
            <Icon as={FiX} className="mr-2 inline text-red-500" ariaLabel="Absent days" />
            Absent Days in Period
          </h3>
          <div className="overflow-x-auto mb-6 border border-gray-200">
            <table className="w-full border-collapse text-[0.95rem]">
              <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-xs tracking-wider border-b-2 border-gray-200">
                <tr>
                  <th className="p-3 text-left">Absent Day</th>
                  <th className="p-3 text-left">Missing Session</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {absentCount > 0 ? (
                  absentDates.map((item, idx) => (
                    <tr
                      key={item.date}
                      className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                    >
                      <td className="p-2.5 px-3 text-gray-800">
                        {formatDateWithWeekday(item.date)}
                      </td>
                      <td className="p-2.5 px-3 text-red-500 font-medium">{item.missing}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={2}
                      className="p-4 text-[#237227] text-center font-medium"
                    >
                      No absences in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Late Records */}
          <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b-2 border-[#237227] pb-2 flex items-center">
            <Icon
              as={FiClock}
              className="mr-2 inline text-amber-600"
              ariaLabel="Late records"
            />
            All Late Records
          </h3>
          <div className="overflow-x-auto mb-6 border border-gray-200">
            <table className="w-full border-collapse text-[0.95rem]">
              <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-xs tracking-wider border-b-2 border-gray-200">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Session</th>
                  <th className="p-3 text-left">Time</th>
                  <th className="p-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allLateDetails.length ? (
                  allLateDetails.map((d, i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}
                    >
                      <td className="p-2.5 px-3 text-gray-800">{d.date}</td>
                      <td className="p-2.5 px-3 text-gray-800">{d.session}</td>
                      <td className="p-2.5 px-3 text-gray-800 font-mono">{d.time}</td>
                      <td
                        className={`p-2.5 px-3 ${
                          d.status === "late"
                            ? "text-red-500 font-semibold"
                            : "text-gray-800"
                        }`}
                      >
                        {d.status}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="4"
                      className="p-4 text-center text-gray-400"
                    >
                      No late records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Earnings */}
          <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b-2 border-[#237227] pb-2 flex items-center">
            <span
              aria-label="Peso"
              className="mr-2 text-lg font-bold text-[#237227]"
            >
              ₱
            </span>
            Earnings
          </h3>
          <div className="overflow-x-auto mb-6 border border-gray-200">
            <table className="w-full border-collapse text-[0.95rem]">
              <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-xs tracking-wider border-b-2 border-gray-200">
                <tr>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Days/Hours</th>
                  <th className="p-3 text-left">Rate</th>
                  <th className="p-3 text-left">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr className="bg-gray-50">
                  <td className="p-2.5 px-3 text-gray-800 font-medium">Standard Pay</td>
                  <td className="p-2.5 px-3 text-gray-800">{daysWorkedDisplay}</td>
                  <td className="p-2.5 px-3 text-gray-800 font-mono">
                    ₱{(payroll.dailyRate ?? 0).toFixed(2)}
                  </td>
                  <td className="p-2.5 px-3 text-gray-800 font-bold">
                    ₱
                    {standardPayAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
                <tr className="bg-white">
                  <td className="p-2.5 px-3 text-gray-800 font-medium">Overtime Pay</td>
                  <td className="p-2.5 px-3 text-gray-800">{getHourMinute(otHours)}</td>
                  <td className="p-2.5 px-3 text-gray-800 text-xs">
                    (Daily Rate) ÷ 8hrs = ₱{hourlyRate.toFixed(2)}
                  </td>
                  <td className="p-2.5 px-3 text-gray-800 font-bold">₱{otPay.toFixed(2)}</td>
                </tr>
                {/* Holiday Pay */}
                {holidayPayDetails.length > 0 ? (
                  <>
                    {holidayPayDetails.map((h, idx) => (
                      <tr
                        key={idx}
                        className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                      >
                        <td className="p-2.5 px-3 text-gray-800">Holiday Pay</td>
                        <td className="p-2.5 px-3 text-gray-800">
                          {h.date} (
                          {h.type === "regular"
                            ? "Regular Holiday"
                            : "Special Holiday"}
                          )
                        </td>
                        <td className="p-2.5 px-3 text-gray-800">
                          <span className="text-[#237227] font-semibold">
                            {" "}
                            ({h.ratePercent}%)
                          </span>
                        </td>
                        <td className="p-2.5 px-3 text-gray-800 font-bold">
                          ₱{(h.amount ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}

                    <tr className="bg-gray-100 font-semibold text-gray-900">
                      <td colSpan="3" className="p-2.5 px-3">
                        Total Holiday Pay
                      </td>
                      <td className="p-2.5 px-3 font-bold text-[#237227]">
                        ₱{totalHolidayPay.toLocaleString()}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td
                      colSpan="4"
                      className="p-4 text-center text-gray-400"
                    >
                      No holiday pay for this period
                    </td>
                  </tr>
                )}
                <tr className="bg-gray-100 font-semibold text-gray-900">
                  <td colSpan="3" className="p-2.5 px-3">
                    Gross Pay
                  </td>
                  <td className="p-2.5 px-3 font-bold text-[#237227]">
                    ₱{(
                      Number(
                        payroll.gross ??
                          Math.round((standardPayAmount + otPay + totalHolidayPay) * 100) / 100,
                      )
                    ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Deductions */}
          <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-b-2 border-[#237227] pb-2 flex items-center">
            <Icon
              as={FiTrendingDown}
              className="mr-2 inline text-rose-600"
              ariaLabel="Deductions"
            />
            Deductions
          </h3>
          <div className="overflow-x-auto mb-6 border border-gray-200">
            <table className="w-full border-collapse text-[0.95rem]">
              <tbody className="divide-y divide-gray-200">
                <tr className="bg-gray-50">
                  <td className="p-2.5 px-3 text-gray-800">Total Late Occurrences</td>
                  <td className="p-2.5 px-3 text-gray-800">{totalLateOccurrences} occurrence(s)</td>
                </tr>
                <tr className="bg-white">
                  <td className="p-2.5 px-3 text-gray-800">Late Count</td>
                  <td className="p-2.5 px-3 text-gray-800">{payroll.lateCount} occurrence(s)</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-2.5 px-3 text-gray-800">Late Count Limit for Deduction</td>
                  <td className="p-2.5 px-3 text-gray-800">{lateCountLimit} occurrence(s)</td>
                </tr>
                <tr className="bg-white">
                  <td className="p-2.5 px-3 text-gray-800">Total Late Deduction</td>
                  <td className="p-2.5 px-3 text-red-500 font-semibold">₱{lateDeduction.toLocaleString()}</td>
                </tr>
                {deductions.map((d, i) => (
                  <tr
                    key={d.label}
                    className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}
                  >
                    <td className="p-2.5 px-3 text-gray-800">{d.label}</td>
                    <td className="p-2.5 px-3 text-gray-800">
                      {d.loading ? (
                        <span className="text-gray-500">Loading...</span>
                      ) : (
                        `₱${Number(d.value || 0).toLocaleString()}`
                      )}
                    </td>
                  </tr>
                ))}
                {cashAdvanceEntries && cashAdvanceEntries.length > 0 && (
                  <>
                    <tr className="bg-gray-100 font-bold text-gray-900">
                      <td colSpan={2} className="p-2.5 px-3">
                        Cash Advance Details
                      </td>
                    </tr>
                    {cashAdvanceEntries.map((h, idx) => (
                      <tr
                        key={h.id}
                        className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                      >
                        <td className="p-2.5 px-3 text-gray-700 text-xs">
                          {h.created_at
                            ? new Date(h.created_at).toLocaleString()
                            : "-"}
                        </td>
                        <td className="p-2.5 px-3 text-gray-800 font-mono">₱{Number(h.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold text-gray-900">
                      <td className="p-2.5 px-3">
                        Cash Advance Total
                      </td>
                      <td className="p-2.5 px-3 text-red-500 font-bold">
                        ₱{Number(cashAdvanceTotalInPeriod || 0).toFixed(2)}
                      </td>
                    </tr>
                  </>
                )}
                <tr className="bg-gray-100 font-bold text-gray-900">
                  <td className="p-2.5 px-3">Total Deductions</td>
                  <td className="p-2.5 px-3 text-red-600 font-bold">₱{totalDeductions.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Pay */}
          <h3 className="text-right text-2xl sm:text-3xl font-bold text-[#237227] mt-4 mb-2">
            Net Pay: ₱{(
              Number(
                payroll.net ??
                  (Math.round(
                    ((standardPayAmount ?? 0) +
                      otPay +
                      totalHolidayPay -
                      totalDeductions) *
                      100,
                  ) / 100),
              )
            ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3 flex-wrap">
          {showPrintButton && (
            <button
              onClick={handlePdf}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
            >
              <FiPrinter className="text-base text-white" />
              PDF
            </button>
          )}
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border border-[#DF301C] cursor-pointer bg-white text-[#DF301C]"
          >
            <FiX className="text-base" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
