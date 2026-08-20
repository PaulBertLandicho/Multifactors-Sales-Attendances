import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { calculatePayroll } from "./Payroll";
import PayslipModal from "../AdminPage/PayslipModals/PayslipModal";
import { getDetailedAttendance } from "./attendanceDetails";
import { generateAllPayslipsPdf } from "./PayslipModals/generatePayslipPdf";
import * as XLSX from "xlsx";
import { FiSearch, FiEye, FiDownload, FiPrinter } from "react-icons/fi";
import { supabase } from "../supabaseClient";

export default function PayrollPage() {
  const [persons, setPersons] = useState([]);
  const [deptRates, setDeptRates] = useState([]);
  const [payrollPeriods, setPayrollPeriods] = useState([]); // [{personId, period, payroll, released}]
  const [, setHolidays] = useState([]);
  const [settings, setSettings] = useState({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showPayslip, setShowPayslip] = useState(false);

  // Add filter, sort, and export state
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");

  const Icons = {
    search: <FiSearch />,
    download: <FiDownload />,
    eye: <FiEye />,
  };

  useEffect(() => {
    async function fetchData() {
      const [
        attRes,
        personsRes,
        deptRes,
        settingsRes,
        payrollRes,
        holidaysRes,
      ] = await Promise.all([
        // Limit attendance to recent records (last 6 months) to reduce egress
        (function() {
          const cutoff = new Date();
          cutoff.setMonth(cutoff.getMonth() - 6);
          return supabase.from("attendance").select("*").gte('device_time', cutoff.toISOString());
        })(),
        supabase
          .from("persons")
          .select(
            "id, name, department, daily_rate, late_penalty, sss, pag_ibig, philhealth, cash_advance, registration_photo",
          ),
        supabase.from("department_rates").select("*"),
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("payroll_periods").select("*"),
        supabase.from("holidays").select("*"),
      ]);

      const attData = attRes.data || [];
      const personsData = personsRes.data || [];
      const deptData = deptRes.data || [];
      const settingsData = settingsRes.data || {};
      const holidaysData = holidaysRes.data || [];
      const payrollDb = Array.isArray(payrollRes.data)
        ? payrollRes.data.filter(Boolean)
        : [];

      setPersons(personsData);
      setDeptRates(deptData);
      setSettings(settingsData);
      setHolidays(holidaysData);

      // Group attendance by person and by dynamic payroll period length
      let periods = [];
      const periodDays = Number(settingsData.payroll_period_days) || 15;
      personsData.forEach((person) => {
        const personAttendance = attData.filter(
          (a) => a.person_id === person.id,
        );
        const sortedAttendance = [...personAttendance].sort(
          (a, b) => new Date(a.device_time) - new Date(b.device_time),
        );
        if (!sortedAttendance.length) return;
        const firstDate = new Date(sortedAttendance[0].device_time);
        const lastDate = new Date(
          sortedAttendance[sortedAttendance.length - 1].device_time,
        );
        let periodStart = new Date(firstDate);
        while (periodStart <= lastDate) {
          let periodEnd = new Date(periodStart);
          periodEnd.setDate(periodEnd.getDate() + periodDays - 1);
          const periodAttendance = sortedAttendance.filter((a) => {
            const dt = new Date(a.device_time);
            return dt >= periodStart && dt <= periodEnd;
          });
          const periodStr = `${periodStart
            .toISOString()
            .slice(0, 10)}_to_${periodEnd.toISOString().slice(0, 10)}`;
          const alreadyReleased = payrollDb.some(
            (row) =>
              row &&
              row.person_id === person.id &&
              row.period === periodStr &&
              row.released,
          );
          if (periodAttendance.length > 0 && !alreadyReleased) {
            periods.push({
              person,
              period: periodStr,
              attendance: periodAttendance,
            });
          }
          periodStart.setDate(periodStart.getDate() + periodDays);
        }
      });

      // Calculate payroll for each period and sync with DB
      const payrollPeriods = (
        await Promise.all(
          periods.map(async ({ person, period, attendance }) => {
            const basePayroll = calculatePayroll(
              attendance,
              [person],
              deptData,
              settingsData,
            )[0];
            const detailed = getDetailedAttendance(
              attendance,
              person.id,
              settingsData,
            );
            const lateCount = detailed
              .map((rec) => rec.lateDetails || [])
              .flat().length;
            const latePenalty = Number(person.late_penalty || 0);
            const lateCountLimit = Number(settingsData.late_count_limit || 5);
            const totalLateDeduction =
              lateCount >= lateCountLimit ? lateCount * latePenalty : 0;
            const totalDeductions =
              basePayroll.sss +
              basePayroll.pag_ibig +
              basePayroll.philhealth +
              basePayroll.cashAdvance +
              totalLateDeduction;
            const net = basePayroll.gross - totalDeductions;
            
            let dbRow = null;
            try {
              const { data: existing, error: selErr } = await supabase
                .from("payroll_periods")
                .select("*")
                .eq("person_id", person.id)
                .eq("period", period)
                .limit(1)
                .maybeSingle();
              if (selErr)
                console.error("Error checking payroll_periods", selErr);
              if (existing) dbRow = existing;
            } catch (e) {
              console.error("Error querying payroll_periods", e);
            }

            if (!dbRow) {
              const payload = {
                person_id: person.id,
                period,
                days_present: basePayroll.daysPresent,
                daily_rate: Number(basePayroll.dailyRate ?? 0),
                late_penalty: Number(person.late_penalty || 0),
                late_count: lateCount,
                gross: basePayroll.gross,
                total_late_deduction: totalLateDeduction,
                total_deductions: totalDeductions,
                net,
                released: false,
              };

              try {
                const { data: upserted, error: upsertErr } = await supabase
                  .from("payroll_periods")
                  .upsert([payload], { onConflict: ["person_id", "period"] })
                  .select()
                  .single();

                if (upsertErr) {
                  const { data: inserted, error: insertError } = await supabase
                    .from("payroll_periods")
                    .insert([payload])
                    .select()
                    .single();
                  if (insertError || !inserted) {
                    console.error(
                      "Failed to insert payroll_periods row",
                      insertError || upsertErr,
                    );
                    return null;
                  }
                  dbRow = inserted;
                } else {
                  dbRow = upserted;
                }
              } catch (e) {
                console.error("Error upserting/inserting payroll_periods", e);
                return null;
              }
            }

            if (!dbRow) {
              return null;
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
                net,
              },
              attendance,
              released: !!dbRow.released,
              dbId: dbRow.id,
              absentCount: (() => {
                try {
                  if (!period) return 0;
                  const [start, end] = period.split("_to_");
                  const startDate = new Date(start);
                  const endDate = new Date(end);
                  const todayStr = new Date().toISOString().slice(0, 10);

                  const allDates = [];
                  for (
                    let d = new Date(startDate);
                    d <= endDate;
                    d.setDate(d.getDate() + 1)
                  ) {
                    if (d.getDay() === 0 || d.getDay() === 6) continue;
                    allDates.push(new Date(d).toISOString().slice(0, 10));
                  }

                  const attendedDatesSet = new Set(
                    (detailed || []).map((a) => {
                      try {
                        return new Date(a.date).toISOString().slice(0, 10);
                      } catch (e) {
                        return String(a.date || "").slice(0, 10);
                      }
                    }),
                  );

                  const holidaysForDept = (holidaysData || []).filter(
                    (h) =>
                      (h.department || "").toLowerCase().trim() ===
                      (person.department || "").toLowerCase().trim(),
                  );
                  const holidaySet = new Set(
                    (holidaysForDept || []).map((h) =>
                      new Date(h.date).toISOString().slice(0, 10),
                    ),
                  );

                  const absentDates = allDates.filter(
                    (dateStr) =>
                      dateStr < todayStr &&
                      !attendedDatesSet.has(dateStr) &&
                      !holidaySet.has(dateStr),
                  );
                  return absentDates.length;
                } catch (e) {
                  return 0;
                }
              })(),
            };
          }),
        )
      ).filter(Boolean);

      setPayrollPeriods(payrollPeriods);
    }
    fetchData();
  }, []);

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

  function isPeriodEndedNow(period, settings) {
    if (!period) return false;
    const s = String(period).trim();
    const matches = Array.from(s.matchAll(/(\d{4}[-/]\d{2}[-/]\d{2})/g)).map(m => m[1]);
    if (!matches.length) return false;
    const endStr = matches[matches.length - 1].replace(/\//g, '-');
    const end = new Date(endStr);
    if (Number.isNaN(end.getTime())) return false;
    const now = new Date();
    if (end.getFullYear() === now.getFullYear() && end.getMonth() === now.getMonth() && end.getDate() === now.getDate()) {
      try {
        const hhmm = (settings && settings.afternoon_end) || null;
        if (hhmm) {
          const parts = String(hhmm).split(":").map(Number);
          const h = Number.isFinite(parts[0]) ? parts[0] : 17;
          const m = Number.isFinite(parts[1]) ? parts[1] : 0;
          const endOfPeriod = new Date(end.getFullYear(), end.getMonth(), end.getDate(), h, m, 0, 0);
          return now >= endOfPeriod;
        }
      } catch (e) {}
      const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
      return now >= endOfDay;
    }
    const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    return endOfDay <= now;
  }

  const handleShowPayslip = (payrollPeriod) => {
    const { person, payroll, attendance, period } = payrollPeriod;
    const detailedAttendance = getDetailedAttendance(
      attendance,
      person.id,
      settings,
    );
    setSelected({
      person,
      payslip: payroll,
      detailedAttendance,
      period,
    });
    setShowPayslip(true);
  };

  const handleReleasePayroll = async (dbId) => {
    const idx = payrollPeriods.findIndex((p) => p.dbId === dbId);
    if (idx === -1) return;
    const period = payrollPeriods[idx];
    if (!period || !period.dbId) return;
    
    const periodHasEnded = isPeriodEndedNow(period.period, settings);
    const isAdvanceRelease = !periodHasEnded;
    
    try {
      const { error: updateErr } = await supabase
        .from("payroll_periods")
        .update({ released: true })
        .eq("id", period.dbId);
      if (updateErr) throw updateErr;

      setPayrollPeriods((prev) =>
        prev.map((p) => (p.dbId === dbId ? { ...p, released: true } : p)),
      );

      let releasedBy = "admin";
      try {
        const sessionStr = localStorage.getItem("sb-session");
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          if (session && session.user && session.user.email) {
            releasedBy = session.user.email;
          }
        }
      } catch (e) {}

      try {
        await supabase.from("payroll_activity_logs").insert([
          {
            payroll_period_id: period.dbId,
            person_id: period.person?.id || null,
            person_name: period.person?.name || null,
            released_by: releasedBy,
            action: isAdvanceRelease ? "Advance Release" : "Period Released",
            timestamp: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        Swal.fire("Failed to log payroll release", err.message || err, "error");
      }

      try {
        if (settings && settings.auto_create_next_period) {
          const periodDays = Number(settings.payroll_period_days) || 15;
          const [, endStr] = (period.period || "").split("_to_");
          if (endStr) {
            const endDate = new Date(endStr);
            const nextStart = new Date(endDate);
            nextStart.setDate(nextStart.getDate() + 1);
            const nextEnd = new Date(nextStart);
            nextEnd.setDate(nextEnd.getDate() + periodDays - 1);
            const nextPeriodStr = `${nextStart.toISOString().slice(0, 10)}_to_${nextEnd
              .toISOString()
              .slice(0, 10)}`;

            const payload = {
              person_id: period.person.id,
              period: nextPeriodStr,
              days_present: 0,
              daily_rate: Number(period.person.daily_rate || 0),
              late_penalty: Number(period.person.late_penalty || 0),
              late_count: 0,
              gross: 0,
              total_late_deduction: 0,
              total_deductions: 0,
              net: 0,
              released: false,
            };

            let created = null;
            try {
              const { data: upserted, error: upsertErr } = await supabase
                .from("payroll_periods")
                .upsert([payload], { onConflict: ["person_id", "period"] })
                .select()
                .single();
              if (upsertErr) {
                const { data: inserted, error: insertErr } = await supabase
                  .from("payroll_periods")
                  .insert([payload])
                  .select()
                  .single();
                if (insertErr) throw insertErr;
                created = inserted;
              } else {
                created = upserted;
              }
            } catch (e) {
              console.error("Failed to create next payroll_periods row", e);
            }

            if (created && created.id) {
              setPayrollPeriods((prev) => [
                ...prev,
                {
                  personId: period.person.id,
                  person: period.person,
                  period: nextPeriodStr,
                  payroll: {
                    daysPresent: 0,
                    dailyRate: Number(payload.daily_rate || 0),
                    lateCount: 0,
                    lateCountLimit: Number(settings.late_count_limit || 5),
                    totalLateDeduction: 0,
                    totalDeductions: 0,
                    net: 0,
                  },
                  attendance: [],
                  released: false,
                  dbId: created.id,
                },
              ]);
            }
          }
        }
      } catch (e) {
        console.error("Error during auto-create next payroll period", e);
      }
    } catch (e) {
      console.error("Error releasing payroll", e);
      Swal.fire("Failed to release payroll", e.message || e, "error");
    }
  };

  const handleClosePayslip = () => {
    setShowPayslip(false);
    setSelected(null);
  };

  const handlePrintPayslip = () => {
    if (!selected) return;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(
      document.querySelector(".payslip-container")?.outerHTML || "",
    );
    printWindow.document.close();
    printWindow.print();
  };

  const handleGenerateAllPayslipPdf = async () => {
    if (!payrollPeriods.length) {
      Swal.fire(
        "No payroll records",
        "There are no payroll records to generate.",
        "info",
      );
      return;
    }

    const pdfParamsList = [];

    for (const periodEntry of payrollPeriods) {
      try {
        const { person, payroll, attendance, period } = periodEntry;
        if (!person || !payroll) continue;

        const detailedAttendance = getDetailedAttendance(
          attendance,
          person.id,
          settings,
        );

        let absentDates = [];
        if (period) {
          const [start, end] = period.split("_to_");
          const startDate = new Date(start);
          const endDate = new Date(end);
          const todayStr = new Date().toISOString().slice(0, 10);

          const allDates = [];
          for (
            let d = new Date(startDate);
            d <= endDate;
            d.setDate(d.getDate() + 1)
          ) {
            if (d.getDay() !== 0 && d.getDay() !== 6) {
              allDates.push(new Date(d));
            }
          }

          const attendedDates = detailedAttendance.map((a) => {
            const dt = new Date(a.date);
            return dt.toISOString().slice(0, 10);
          });

          absentDates = allDates
            .map((d) => d.toISOString().slice(0, 10))
            .filter(
              (dateStr) =>
                dateStr < todayStr && !attendedDates.includes(dateStr),
            );
        }
        const absentCount = absentDates.length;

        let holidayDetails = [];
        try {
          if (person && period) {
            const [start, end] = period.split("_to_");
            const { data: holidays, error } = await supabase
              .from("holidays")
              .select("*")
              .eq("department", person.department)
              .gte("date", start)
              .lte("date", end);
            if (error) throw error;
            holidayDetails = holidays || [];
          }
        } catch (err) {
          console.error("Error fetching holidays for bulk PDF:", err);
          holidayDetails = [];
        }

        const deptRate =
          deptRates.find(
            (d) =>
              (d.department || "").toLowerCase().trim() ===
              (person.department || "").toLowerCase().trim(),
          ) || {};

        const deptHolidayRates = {
          regular: Number(
            deptRate.regular_holiday_rate ?? deptRate.holiday_rate ?? 0,
          ),
          special: Number(deptRate.special_holiday_rate ?? 0),
        };

        let holidayPayDetails = [];
        let totalHolidayPay = 0;
        if (holidayDetails.length > 0) {
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

        let cashAdvanceEntries = [];
        let cashAdvanceTotalInPeriod = 0;
        try {
          if (person && period) {
            const [start, end] = period.split("_to_");
            const { data: caData, error: caErr } = await supabase
              .from("cash_advances")
              .select("id, amount, created_at, note")
              .eq("person_id", person.id)
              .gte("created_at", start)
              .lte("created_at", end)
              .order("created_at", { ascending: true });
            if (caErr) throw caErr;
            cashAdvanceEntries = caData || [];
            cashAdvanceTotalInPeriod = cashAdvanceEntries.reduce(
              (s, r) => s + Number(r.amount || 0),
              0,
            );
          }
        } catch (err) {
          console.error("Error fetching cash advances for bulk PDF:", err);
          cashAdvanceEntries = [];
          cashAdvanceTotalInPeriod = 0;
        }

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
          {
            label: "Cash Advance",
            value: Number(cashAdvanceTotalInPeriod || 0),
          },
        ];

        const lateCountLimit =
          payroll.lateCountLimit || payroll.late_count_limit || 5;
        const latePenalty = person.late_penalty || 0;
        const lateDeduction =
          payroll.lateCount >= lateCountLimit
            ? payroll.lateCount * latePenalty
            : 0;
        const totalDeductions =
          lateDeduction + deductions.reduce((acc, d) => acc + d.value, 0);

        let totalOtMinutes = 0;
        try {
          const sched = payroll && payroll.settings ? payroll.settings : {};
          const schedMorningEnd = sched.morning_end || "12:00";
          const schedAfternoonEnd = sched.afternoon_end || "17:00";
          (detailedAttendance || []).forEach((rec) => {
            try {
              const mOut =
                (rec.morningOut && String(rec.morningOut).trim()) || null;
              const aOut =
                (rec.afternoonOut && String(rec.afternoonOut).trim()) || null;
              const parseT = (t) => {
                if (!t) return null;
                const mm = String(t)
                  .trim()
                  .match(/^(\d{1,2}):(\d{2})/);
                if (!mm) return null;
                return Number(mm[1]) * 60 + Number(mm[2]);
              };
              const mOutMin = parseT(mOut);
              const aOutMin = parseT(aOut);
              const mEndMin = parseT(schedMorningEnd);
              const aEndMin = parseT(schedAfternoonEnd);
              if (
                typeof mOutMin === "number" &&
                typeof mEndMin === "number" &&
                mOutMin > mEndMin
              )
                totalOtMinutes += mOutMin - mEndMin;
              if (
                typeof aOutMin === "number" &&
                typeof aEndMin === "number" &&
                aOutMin > aEndMin
              )
                totalOtMinutes += aOutMin - aEndMin;
            } catch (e) {}
          });
        } catch (e) {}
        const totalOtHours = Math.round((totalOtMinutes / 60) * 100) / 100;

        pdfParamsList.push({
          payroll,
          person,
          period,
          holidayPayDetails,
          totalHolidayPay,
          absentCount,
          totalDeductions,
          cashAdvanceEntries,
          cashAdvanceTotalInPeriod,
          otHours: totalOtHours,
        });
      } catch (err) {
        console.error(
          "Failed to prepare payslip PDF data for",
          periodEntry.person?.name,
          err,
        );
      }
    }

    if (!pdfParamsList.length) {
      Swal.fire(
        "No data",
        "Could not prepare any payslip data for PDF.",
        "warning",
      );
      return;
    }

    await generateAllPayslipsPdf(pdfParamsList);
    Swal.fire(
      "PDF generated",
      "A combined PDF with all payslips has been downloaded.",
      "success",
    );
  };

  const handleExportPayslipExcel = () => {
    if (!payrollPeriods.length) return;
    const exportData = payrollPeriods.map((p) => {
      const { person, period, payroll } = p;
      return {
        ID: person.id,
        Name: person.name,
        Department: person.department,
        Period: period,
        "Daily Rate": person.daily_rate,
        "Late Penalty": person.late_penalty,
        "Days Present": payroll.daysPresent,
        "Late Count": payroll.lateCount,
        Gross: payroll.gross,
        "Late Deduction": payroll.totalLateDeduction,
        "Net Pay": payroll.net,
        "Absent Count": p.absentCount ?? 0,
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, "payroll_summary.xlsx");
  };

  const filteredPayrollPeriods = (payrollPeriods || [])
    .filter((entry) => {
      if (!entry) return false;
      const { person } = entry;
      if (!person) return false;
      if (departmentFilter && (person.department || "") !== departmentFilter)
        return false;
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const idMatch = String(person.id || "")
          .toLowerCase()
          .includes(q);
        const nameMatch = (person.name || "").toLowerCase().includes(q);
        return idMatch || nameMatch;
      }
      return true;
    })
    .sort((a, b) => {
      const idA = Number(a.person?.id);
      const idB = Number(b.person?.id);
      if (!isNaN(idA) && !isNaN(idB)) {
        return sortOrder === "asc" ? idA - idB : idB - idA;
      }
      const strA = String(a.person?.id || "").toLowerCase();
      const strB = String(b.person?.id || "").toLowerCase();
      return sortOrder === "asc"
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });

  return (
    <div className="max-w-[1600px] mx-auto my-10 px-8 py-10 bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.1)] text-gray-800 font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-[2.8rem] font-bold text-gray-800 m-0 inline-block">Payroll Summary</h1>
        <div className="h-1 w-24 bg-[#237227] mx-auto mt-2 rounded-sm" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6 p-5 sm:px-6 bg-gray-50 rounded-[20px] border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none min-w-[250px] transition-all"
              style={{
                backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "16px center",
                backgroundSize: "16px",
              }}
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer min-w-[160px]"
          >
            <option value="">All Departments</option>
            {Array.from(
              new Set(persons.map((p) => p.department).filter(Boolean)),
            ).map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <button
            aria-label="Toggle sort order"
            onClick={() => setSortOrder((s) => (s === "asc" ? "desc" : "asc"))}
            className="px-4 py-2.5 rounded-lg bg-[#237227] text-white text-sm cursor-pointer min-w-[72px] text-center font-semibold border-none"
          >
            {sortOrder === "asc" ? "Asc" : "Desc"}
          </button>
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={handleExportPayslipExcel}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
          >
            {Icons.download} Export Excel
          </button>
          <button
            onClick={handleGenerateAllPayslipPdf}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
          >
            <FiPrinter className="mr-1" />
            Generate All Payslips PDF
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full border-collapse text-[0.95rem] min-w-[1200px]">
            <thead>
              <tr>
                {["ID", "Name", "Department", "Period", "Daily Rate (₱)", "Late Penalty (₱)", "Days Present", "Late Count", "Absent", "Payslip", "Advance Release"].map((thText) => (
                  <th key={thText} className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem]">{thText}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPayrollPeriods.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 px-5 text-gray-500 text-[1.1rem]">
                    No payroll records found.
                  </td>
                </tr>
              ) : (
                filteredPayrollPeriods.map((p, idx) => {
                  const { person, period, payroll, released } = p;
                  return (
                    <tr key={person.id + period} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800 font-mono">
                        {person.id}
                      </td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{person.name}</td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{person.department}</td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{formatPeriod(period)}</td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                        {person.daily_rate != null
                          ? `₱${Number(person.daily_rate).toFixed(2)}`
                          : "-"}
                      </td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                        {person.late_penalty != null
                          ? `₱${Number(person.late_penalty).toFixed(2)}`
                          : "-"}
                      </td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{payroll.daysPresent}</td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{payroll.lateCount}</td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{p.absentCount ?? 0}</td>

                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                        <button
                          onClick={() => handleShowPayslip(p)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium border-none cursor-pointer bg-[#237227] text-white"
                        >
                          {Icons.eye} View
                        </button>
                      </td>
                      <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                        {released ? (
                          <span className="text-[#556156] font-semibold">
                            ✔ Released
                          </span>
                        ) : (
                          <button
                            onClick={() => handleReleasePayroll(p.dbId)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-gray-300 cursor-pointer bg-white text-gray-800"
                          >
                            Advance Release Payroll
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
              (p) =>
                p.person.id === selected.person.id &&
                p.period === selected.period,
            );
            return match ? match.released : false;
          })()}
        />
      )}
    </div>
  );
}
