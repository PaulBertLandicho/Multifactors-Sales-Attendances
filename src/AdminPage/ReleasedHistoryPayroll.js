import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import PayslipModal from "./PayslipModals/PayslipModal";
import { getDetailedAttendance } from "./attendanceDetails";
import { calculatePayroll } from "./Payroll";
import { FiDownload, FiEye, FiSearch } from "react-icons/fi";

export default function ReleasedHistoryPayroll() {
  const [releasedPayrolls, setReleasedPayrolls] = useState([]);
  const [activityLogsMap, setActivityLogsMap] = useState({});
  const [selected, setSelected] = useState(null);
  const [showPayslip, setShowPayslip] = useState(false);
  const [modalData, setModalData] = useState({
    loading: false,
    person: null,
    detailedAttendance: [],
    settings: {},
    payroll: null,
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("period");
  const [sortOrder, setSortOrder] = useState("desc");
  const [departmentFilter, setDepartmentFilter] = useState("");

  useEffect(() => {
    async function fetchReleased() {
      const { data } = await supabase
        .from("payroll_periods")
        .select(
          "id, person_id, period, released, daily_rate, late_penalty, gross, net, days_present, person:persons(id,name,department)",
        )
        .eq("released", true)
        .order("period", { ascending: false })
        .limit(2000);
      setReleasedPayrolls(data || []);

      try {
        const { data: logs } = await supabase
          .from("payroll_activity_logs")
          .select("payroll_period_id, action")
          .order("timestamp", { ascending: false });

        const logsMap = {};
        (logs || []).forEach((log) => {
          if (log.payroll_period_id && !logsMap[log.payroll_period_id]) {
            logsMap[log.payroll_period_id] = log.action;
          }
        });
        setActivityLogsMap(logsMap);
      } catch (err) {
        console.error("Error fetching activity logs:", err);
      }
    }
    fetchReleased();
  }, []);

  const filteredPayrolls = releasedPayrolls.filter((p) => {
    const searchLower = search.toLowerCase();
    return (
      !search ||
      (p.person_id && p.person_id.toLowerCase().includes(searchLower)) ||
      (p.person &&
        p.person.name &&
        p.person.name.toLowerCase().includes(searchLower)) ||
      (p.person &&
        p.person.department &&
        p.person.department.toLowerCase().includes(searchLower)) ||
      (p.period && p.period.toLowerCase().includes(searchLower))
    );
  });

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const handleViewPayslip = async (payroll) => {
    setModalData({
      loading: true,
      person: null,
      detailedAttendance: [],
      settings: {},
      payroll: null,
    });
    setShowPayslip(true);
    const { data: person } = await supabase
      .from("persons")
      .select(
        "id, name, department, daily_rate, late_penalty, sss, pag_ibig, philhealth, cash_advance, registration_photo",
      )
      .eq("id", payroll.person_id)
      .single();
    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("id", 1)
      .single();
    const { data: deptRates } = await supabase
      .from("department_rates")
      .select(
        "department, daily_rate, late_penalty, sss, pag_ibig, philhealth, ot_rate, regular_holiday_rate, special_holiday_rate",
      );
    let detailedAttendance = [];
    let fullPayroll = null;
    if (payroll.period && person) {
      const [start, end] = payroll.period.split("_to_");
      const { data: attendance } = await supabase
        .from("attendance")
        .select("id, event, device_time, photo, status, method")
        .eq("person_id", payroll.person_id)
        .gte("device_time", start)
        .lte("device_time", end)
        .order("device_time", { ascending: true });
      detailedAttendance = getDetailedAttendance(
        attendance || [],
        payroll.person_id,
        settings || {},
      );
      const basePayroll = calculatePayroll(
        attendance || [],
        [person],
        deptRates || [],
        settings || {},
      )[0];
      const lateCount = detailedAttendance
        .map((rec) => rec.lateDetails || [])
        .flat().length;
      const latePenalty = Number(person.late_penalty || 0);
      const lateCountLimit = Number(settings.late_count_limit || 5);
      const totalLateDeduction =
        lateCount >= lateCountLimit ? lateCount * latePenalty : 0;
      const totalDeductions =
        basePayroll.sss +
        basePayroll.pag_ibig +
        basePayroll.philhealth +
        basePayroll.cashAdvance +
        totalLateDeduction;
      const net = basePayroll.gross - totalDeductions;
      fullPayroll = {
        ...basePayroll,
        lateCount,
        lateCountLimit,
        totalLateDeduction,
        totalDeductions,
        net,
      };
    }
    setModalData({
      loading: false,
      person,
      detailedAttendance,
      settings,
      payroll: fullPayroll,
    });
    setSelected(payroll);
  };

  const handleExportExcel = () => {
    if (!Array.isArray(sortedPayrollsFinal)) return;
    const exportData = sortedPayrollsFinal.map((row) => ({
      ID: row.person_id,
      Name: row.person?.name || "",
      Department: row.person?.department || "",
      Period: row.period || "",
      "Daily Rate": row.daily_rate ?? "",
      "Late Penalty": row.late_penalty ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Released Payrolls");
    XLSX.writeFile(wb, "released_payrolls.xlsx");
  };

  const departmentOptions = [
    ...new Set(
      releasedPayrolls.map((p) => p.person?.department).filter(Boolean),
    ),
  ];

  const filteredAndDeptPayrolls = filteredPayrolls.filter((p) => {
    if (!departmentFilter) return true;
    return (p.person?.department || "") === departmentFilter;
  });

  const sortedPayrollsFinal = [...filteredAndDeptPayrolls].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];
    if (sortKey === "period") {
      aVal = (aVal || "").toLowerCase();
      bVal = (bVal || "").toLowerCase();
    } else if (sortKey === "person_id") {
      aVal = (a.person_id || "").toLowerCase();
      bVal = (b.person_id || "").toLowerCase();
    } else if (sortKey === "name") {
      aVal = (a.person?.name || "").toLowerCase();
      bVal = (b.person?.name || "").toLowerCase();
    } else if (sortKey === "department") {
      aVal = (a.person?.department || "").toLowerCase();
      bVal = (b.person?.department || "").toLowerCase();
    } else {
      aVal = (a[sortKey] || "").toString().toLowerCase();
      bVal = (b[sortKey] || "").toString().toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="max-w-[1600px] mx-auto my-10 px-8 py-10 bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.1)] text-gray-800 font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-[2.8rem] font-bold text-gray-800 m-0 inline-block">Released Payroll History</h1>
        <div className="h-1 w-24 bg-[#237227] mx-auto mt-2 rounded-sm" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6 p-5 sm:px-6 bg-gray-50 rounded-[20px] border border-gray-200 shadow-md">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex items-center">
            <FiSearch className="absolute left-3.5 text-gray-400 text-base pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] min-w-[250px] transition-all"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-800 outline-none cursor-pointer min-w-[160px]"
          >
            <option value="">All Departments</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleExportExcel}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer bg-[#237227] text-white"
        >
          <FiDownload color="#ffffff" className="mr-1 inline" /> Export Excel
        </button>
      </div>

      {/* Table Container */}
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full border-collapse text-[0.95rem] min-w-[1200px]">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("person_id")}>
                  ID{" "}
                  {sortKey === "person_id" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("name")}>
                  NAME {sortKey === "name" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("department")}>
                  DEPARTMENT{" "}
                  {sortKey === "department" &&
                    (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("period")}>
                  PERIOD{" "}
                  {sortKey === "period" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem]">DAILY RATE (₱)</th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem]">LATE PENALTY (₱)</th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem]">PAYSLIP</th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem]">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {sortedPayrollsFinal.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 px-5 text-gray-500 text-[1.1rem]">
                    No released payrolls found.
                  </td>
                </tr>
              ) : (
                sortedPayrollsFinal.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                  >
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{p.person_id}</td>
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{p.person?.name || "-"}</td>
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{p.person?.department || "-"}</td>
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{p.period}</td>
                    {(() => {
                      const isSelected =
                        modalData.payroll && selected && selected.id === p.id;
                      const fromModal = modalData.payroll || {};

                      const dailyRate = isSelected
                        ? (fromModal.dailyRate ??
                          fromModal.daily_rate ??
                          p.daily_rate)
                        : p.daily_rate;
                      const latePenalty = isSelected
                        ? (fromModal.latePenalty ??
                          fromModal.late_penalty ??
                          p.late_penalty)
                        : p.late_penalty;
                      return (
                        <>
                          <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                            ₱
                            {dailyRate != null
                              ? Number(dailyRate).toFixed(2)
                              : "-"}
                          </td>
                          <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                            ₱
                            {latePenalty != null
                              ? Number(latePenalty).toFixed(2)
                              : "-"}
                          </td>
                        </>
                      );
                    })()}
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                      <button
                        onClick={() => handleViewPayslip(p)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium border-none cursor-pointer bg-[#237227] text-white"
                      >
                        <FiEye color="#ffffff" className="mr-1 inline" />
                        View
                      </button>
                    </td>
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                      <span className="text-[#237227] font-semibold">
                        {activityLogsMap[p.id] || "Released"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPayslip &&
        selected &&
        (modalData.loading ? (
          <div className="text-center p-10 text-gray-600">
            Loading payslip...
          </div>
        ) : (
          <PayslipModal
            payroll={modalData.payroll || selected}
            person={
              modalData.person || {
                id: selected.person_id,
                name: selected.name,
                department: selected.department,
              }
            }
            detailedAttendance={modalData.detailedAttendance}
            onClose={() => {
              setShowPayslip(false);
              setSelected(null);
            }}
            showPrintButton={true}
            period={selected.period}
            released={true}
            settings={modalData.settings}
          />
        ))}
    </div>
  );
}
