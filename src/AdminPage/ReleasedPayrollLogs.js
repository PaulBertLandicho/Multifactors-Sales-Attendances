import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { FiDownload } from "react-icons/fi";

export default function ReleasedPayrollLogs() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(100);
  const [loadingPage, setLoadingPage] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");

  useEffect(() => {
    let mounted = true;
    async function fetchLogsPage(p = 0) {
      setLoadingPage(true);
      try {
        const start = p * pageSize;
        const end = start + pageSize - 1;
        const { data, error } = await supabase
          .from("payroll_activity_logs")
          .select(
            "id, payroll_period_id, person_id, person_name, released_by, action, timestamp",
          )
          .order("timestamp", { ascending: false })
          .range(start, end);
        if (error) throw error;
        if (!mounted) return;
        if (Array.isArray(data)) {
          if (p === 0) setLogs(data || []);
          else setLogs((prev) => [...(prev || []), ...(data || [])]);
          setHasMore((data || []).length === pageSize);
          setPage(p);
        }
      } catch (err) {
        console.error("Failed to load payroll activity logs page", err);
      } finally {
        if (mounted) setLoadingPage(false);
      }
    }
    fetchLogsPage(0);

    const sub = supabase
      .channel("public:payroll_activity_logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payroll_activity_logs" },
        (payload) => {
          try {
            const newRow = payload.new;
            setLogs((prev) => {
              if (!prev || !prev.length) return [newRow];
              if (prev.some((r) => r.id === newRow.id)) return prev;
              return [newRow, ...prev];
            });
          } catch (e) {
            console.error("realtime payload error", e);
          }
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      try {
        supabase.removeChannel(sub);
      } catch (e) {}
    };
  }, [pageSize]);

  const filteredLogs = logs.filter((log) => {
    const searchLower = search.toLowerCase();
    return (
      !search ||
      (log.person_id && log.person_id.toLowerCase().includes(searchLower)) ||
      (log.payroll_period_id &&
        String(log.payroll_period_id).toLowerCase().includes(searchLower)) ||
      (log.person_name &&
        log.person_name.toLowerCase().includes(searchLower)) ||
      (log.released_by &&
        log.released_by.toLowerCase().includes(searchLower)) ||
      (log.action && log.action.toLowerCase().includes(searchLower))
    );
  });

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];
    if (sortKey === "timestamp") {
      aVal = new Date(a.timestamp);
      bVal = new Date(b.timestamp);
    } else {
      aVal = (aVal || "").toString().toLowerCase();
      bVal = (bVal || "").toString().toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const handleExportExcel = () => {
    if (!Array.isArray(sortedLogs)) return;
    const exportData = sortedLogs.map((row) => ({
      Timestamp: row.timestamp ? new Date(row.timestamp).toLocaleString() : "",
      "Payroll Period ID": row.payroll_period_id,
      "Person Name": row.person_name,
      "Released By": row.released_by,
      Action: row.action,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Released Payroll Logs");
    XLSX.writeFile(wb, "released_payroll_logs.xlsx");
  };

  return (
    <div className="max-w-[1600px] mx-auto my-10 px-8 py-10 bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.1)] text-gray-800 font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-[2.8rem] font-bold text-gray-800 m-0 inline-block">Payroll Released Activity Logs</h1>
        <div className="h-1 w-24 bg-[#237227] mx-auto mt-2 rounded-sm" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6 p-5 sm:px-6 bg-gray-50 rounded-[20px] border border-gray-200 shadow-md">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative">
            <input
              type="text"
              placeholder="Search name or ID"
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
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("timestamp")}>
                  Timestamp{" "}
                  {sortKey === "timestamp" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("person_name")}>
                  Person Name{" "}
                  {sortKey === "person_name" &&
                    (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("released_by")}>
                  Released By{" "}
                  {sortKey === "released_by" &&
                    (sortOrder === "asc" ? "▲" : "▼")}
                </th>
                <th className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold px-3 py-4 text-left border-b-2 border-gray-200 tracking-wider uppercase text-[0.8rem] cursor-pointer" onClick={() => handleSort("action")}>
                  Action{" "}
                  {sortKey === "action" && (sortOrder === "asc" ? "▲" : "▼")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 px-5 text-gray-500 text-[1.1rem]">
                    No activity logs found.
                  </td>
                </tr>
              ) : (
                sortedLogs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                  >
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{log.person_name}</td>
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800">{log.released_by}</td>
                    <td className="p-3.5 px-3 border-b border-gray-200 text-gray-800 font-medium text-[#237227]">{log.action}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-center">
          {hasMore ? (
            <button
              onClick={async () => {
                if (loadingPage) return;
                const next = page + 1;
                setLoadingPage(true);
                try {
                  const start = next * pageSize;
                  const end = start + pageSize - 1;
                  const { data, error } = await supabase
                    .from("payroll_activity_logs")
                    .select(
                      "id, payroll_period_id, person_id, person_name, released_by, action, timestamp",
                    )
                    .order("timestamp", { ascending: false })
                    .range(start, end);
                  if (error) throw error;
                  setLogs((prev) => [...(prev || []), ...(data || [])]);
                  setPage(next);
                  setHasMore((data || []).length === pageSize);
                } catch (err) {
                  console.error("Failed to load more logs", err);
                } finally {
                  setLoadingPage(false);
                }
              }}
              className="mt-2 px-3.5 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors shadow-sm"
            >
              {loadingPage ? "Loading..." : "Load more"}
            </button>
          ) : (
            <div className="text-gray-500 text-xs">No more logs</div>
          )}
        </div>
      </div>
    </div>
  );
}
