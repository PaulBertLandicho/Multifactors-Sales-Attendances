import React, { useEffect, useState } from "react";
// import { supabase } from './supabaseClient';
import Swal from "sweetalert2";
import { calculatePayroll } from "./Payroll";
import PayslipModal from "../AdminPage/PayslipModals/PayslipModal";
import { getDetailedAttendance } from "./attendanceDetails";
import { generateAllPayslipsPdf } from "./PayslipModals/generatePayslipPdf";
import * as XLSX from "xlsx";
import { FiSearch, FiEye, FiDownload, FiPrinter } from "react-icons/fi";

import { supabase } from "../supabaseClient";
import { logPayrollRelease } from "./payrollActivityLogs";

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
        supabase.from("attendance").select("*"),
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
      // Ensure payrollDb is always a clean array with no null/undefined entries
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
        // Get all attendance for this person (include both time-in and time-out)
        const personAttendance = attData.filter(
          (a) => a.person_id === person.id,
        );
        // Sort attendance by date
        const sortedAttendance = [...personAttendance].sort(
          (a, b) => new Date(a.device_time) - new Date(b.device_time),
        );
        if (!sortedAttendance.length) return;
        // Find the range of dates
        const firstDate = new Date(sortedAttendance[0].device_time);
        const lastDate = new Date(
          sortedAttendance[sortedAttendance.length - 1].device_time,
        );
        // Start from the firstDate, create periods of periodDays
        let periodStart = new Date(firstDate);
        while (periodStart <= lastDate) {
          let periodEnd = new Date(periodStart);
          periodEnd.setDate(periodEnd.getDate() + periodDays - 1);
          // Get all attendance in this period
          const periodAttendance = sortedAttendance.filter((a) => {
            const dt = new Date(a.device_time);
            return dt >= periodStart && dt <= periodEnd;
          });
          // Format period string: yyyy-mm-dd_to_yyyy-mm-dd
          const periodStr = `${periodStart
            .toISOString()
            .slice(0, 10)}_to_${periodEnd.toISOString().slice(0, 10)}`;
          // Check if this period is already released in payrollDb (defensive against unexpected null rows)
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
          // Move to next period
          periodStart.setDate(periodStart.getDate() + periodDays);
        }
      });

      // Calculate payroll for each period and sync with DB
      const payrollPeriods = (
        await Promise.all(
          periods.map(async ({ person, period, attendance }) => {
            // Calculate payroll for this period only
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
            // Find if this period exists in DB (defensive & avoid duplicates)
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
                // Try upsert using person_id+period as conflict target (safer against races)
                const { data: upserted, error: upsertErr } = await supabase
                  .from("payroll_periods")
                  .upsert([payload], { onConflict: ["person_id", "period"] })
                  .select()
                  .single();

                if (upsertErr) {
                  // Fallback to insert if upsert isn't supported or fails
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

            // Extra safety: if dbRow is still somehow null, skip this entry
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
              // Compute absent count for the period (weekdays only, exclude holidays), up to today
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
                    // weekday only
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

                  // holidaysData is available in outer scope; filter to person's department
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

  // Format a period string like '2026-04-07_to_2026-04-21' into
  // 'April 07, 2026 to April 21, 2026'. Falls back to original string.
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

  // Removed unused filtered and sortedPersons variables

  // OPEN PAYSLIP for a period
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
  // RELEASE PAYROLL (by DB id) — works with filtered/sorted lists
  const handleReleasePayroll = async (dbId) => {
    const idx = payrollPeriods.findIndex((p) => p.dbId === dbId);
    if (idx === -1) return;
    const period = payrollPeriods[idx];
    if (!period || !period.dbId) return;
    // Update released in Supabase
    await supabase
      .from("payroll_periods")
      .update({ released: true })
      .eq("id", period.dbId);
    setPayrollPeriods((prev) =>
      prev.map((p) => (p.dbId === dbId ? { ...p, released: true } : p)),
    );
    // Log activity with better user info and error handling
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
      await logPayrollRelease({
        payrollPeriodId: period.dbId,
        personName: period.person?.name || null,
        releasedBy,
      });
    } catch (err) {
      Swal.fire("Failed to log payroll release", err.message || err, "error");
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

  // Generate one combined PDF containing payslips for all payroll records
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

        // Fetch cash advance entries for this person within the period (for accurate per-period deduction)
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

        // compute total OT hours (decimal) for this period to include in PDF
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
              // parse time HH:MM into minutes
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

  // Export to Excel
  const handleExportPayslipExcel = () => {
    if (!payrollPeriods.length) return;
    // Export each payroll period as a row
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

  // Compute filtered and sorted payroll periods for display
  const filteredPayrollPeriods = (payrollPeriods || [])
    .filter((entry) => {
      if (!entry) return false;
      const { person } = entry;
      if (!person) return false;
      // Department filter
      if (departmentFilter && (person.department || "") !== departmentFilter)
        return false;
      // Search (by name or id)
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
      const nameA = (a.person?.name || "").toLowerCase();
      const nameB = (b.person?.name || "").toLowerCase();
      if (nameA < nameB) return sortOrder === "asc" ? -1 : 1;
      if (nameA > nameB) return sortOrder === "asc" ? 1 : -1;
      // fallback to id
      const idA = String(a.person?.id || "");
      const idB = String(b.person?.id || "");
      return sortOrder === "asc"
        ? idA.localeCompare(idB)
        : idB.localeCompare(idA);
    });

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
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={styles.select}
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
            style={styles.sortToggle}
          >
            {sortOrder === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
        <button
          onClick={handleExportPayslipExcel}
          style={{
            marginRight: -300,
            ...styles.button,
            ...styles.buttonPrimary,
          }}
        >
          {Icons.download} Export Excel
        </button>
        <button
          onClick={handleGenerateAllPayslipPdf}
          style={{ ...styles.button, ...styles.buttonPrimary }}
        >
          <FiPrinter style={{ marginRight: 8 }} />
          Generate All Payslips PDF
        </button>
        {/* <button
          style={{ ...styles.button, ...styles.buttonSecondary, marginLeft: 12 }}
          onClick={() => window.location.href = '/admin/ReleasedPayrollLogs'}
        >
          Released Payroll Logs
        </button> */}
        {/* <button
          style={{ ...styles.button, ...styles.buttonSecondary }}
          onClick={() => (window.location.href = "/admin/released-history")}
        >
          <MdHistory style={{ marginRight: 8, fontSize: "1.2em" }} />
          Released History Payroll
        </button> */}
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
                <th style={styles.th}>Absent</th>
                <th style={styles.th}>Payslip</th>
                <th style={styles.th}>Release</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayrollPeriods.length === 0 ? (
                <tr>
                  <td colSpan={11} style={styles.emptyState}>
                    No payroll records found.
                  </td>
                </tr>
              ) : (
                filteredPayrollPeriods.map((p, idx) => {
                  const { person, period, payroll, released } = p;
                  const rowStyle = {
                    ...styles.tr,
                    backgroundColor: idx % 2 === 0 ? "#f9fafb" : "#ffffff",
                  };
                  return (
                    <tr key={person.id + period} style={rowStyle}>
                      <td style={{ ...styles.td, fontFamily: "monospace" }}>
                        {person.id}
                      </td>
                      <td style={styles.td}>{person.name}</td>
                      <td style={styles.td}>{person.department}</td>
                      <td style={styles.td}>{formatPeriod(period)}</td>
                      <td style={styles.td}>
                        {person.daily_rate != null
                          ? `₱${Number(person.daily_rate).toFixed(2)}`
                          : "-"}
                      </td>
                      <td style={styles.td}>
                        {person.late_penalty != null
                          ? `₱${Number(person.late_penalty).toFixed(2)}`
                          : "-"}
                      </td>
                      <td style={styles.td}>{payroll.daysPresent}</td>
                      <td style={styles.td}>{payroll.lateCount}</td>
                      <td style={styles.td}>{p.absentCount ?? 0}</td>
                      {/* Calculate and display Gross and Net Pay using the exact PayslipModal formulas */}

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
                          <span style={{ color: "#237227", fontWeight: 600 }}>
                            ✔ Released
                          </span>
                        ) : (
                          <button
                            onClick={() => handleReleasePayroll(p.dbId)}
                            style={{
                              ...styles.button,
                              ...styles.buttonPrimary,
                              padding: "4px 12px",
                              fontSize: "0.9em",
                            }}
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

// Light theme styles with green accent
const styles = {
  container: {
    maxWidth: "1600px",
    margin: "40px auto",
    padding: "40px 32px",
    background: "#ffffff",
    borderRadius: "32px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
    color: "#1f2937",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    textAlign: "center",
    marginBottom: "40px",
  },
  title: {
    fontSize: "2.8rem",
    fontWeight: 700,
    color: "#1f2937",
    margin: 0,
    display: "inline-block",
  },
  titleUnderline: {
    height: "4px",
    width: "100px",
    background: "#237227", // solid green
    margin: "8px auto 0",
    borderRadius: "2px",
  },
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    marginBottom: "24px",
    padding: "20px 24px",
    backgroundColor: "#f9fafb",
    borderRadius: "20px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
  },
  filterGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
  },
  searchWrapper: {
    position: "relative",
  },
  searchInput: {
    padding: "12px 16px 12px 40px",
    fontSize: "0.95rem",
    borderRadius: "40px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#1f2937",
    outline: "none",
    transition: "all 0.2s",
    backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "16px center",
    backgroundSize: "16px",
    minWidth: "250px",
  },
  select: {
    padding: "12px 20px",
    fontSize: "0.95rem",
    borderRadius: "40px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#1f2937",
    outline: "none",
    cursor: "pointer",
    minWidth: "160px",
  },
  sortToggle: {
    padding: "8px 16px",
    borderRadius: 22,
    background: "#f3f4f6",
    border: "1px solid #e6eef6",
    color: "#374151",
    fontSize: "0.95rem",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(16,24,40,0.06)",
    minWidth: "72px",
    textAlign: "center",
    fontWeight: 600,
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 28px",
    borderRadius: "40px",
    fontSize: "1rem",
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
  },
  buttonPrimary: {
    background: "#237227",
    color: "#ffffff",
  },

  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "1rem",
    color: "#6b7280",
  },

  viewButton: {
    padding: "6px 12px",
    borderRadius: "30px",
    border: "none",
    fontSize: "0.85rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    backgroundColor: "#e5e7eb",
    color: "#1f2937",
  },
  tableContainer: {
    borderRadius: "20px",
    overflow: "hidden",
    border: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
  },
  tableWrapper: {
    overflowX: "auto",
    maxHeight: "600px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.95rem",
    minWidth: "1200px",
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "#f9fafb",
    color: "#4b5563",
    fontWeight: 600,
    padding: "16px 12px",
    textAlign: "left",
    borderBottom: "2px solid #e5e7eb",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    fontSize: "0.8rem",
  },
  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #e5e7eb",
    color: "#1f2937",
  },
  tr: {
    transition: "background 0.2s",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#6b7280",
    fontSize: "1.1rem",
  },
  spinnerContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "300px",
    background: "#ffffff",
  },
  spinner: {
    width: "50px",
    height: "50px",
    border: "4px solid #e5e7eb",
    borderTop: "4px solid #237227",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};

// Add global keyframes and focus styles
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  input:focus, select:focus {
    border-color: #237227 !important;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2) !important;
  }
  button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
`;
document.head.appendChild(styleSheet);
