import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

// Light theme styles with green accent (copied from PersonsTable)
const styles = {
  container: {
    maxWidth: '1600px',
    margin: '40px auto',
    padding: '40px 32px',
    background: '#ffffff',
    borderRadius: '32px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
    color: '#1f2937',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '2.8rem',
    fontWeight: 700,
    color: '#1f2937',
    margin: 0,
    display: 'inline-block',
  },
  titleUnderline: {
    height: '4px',
    width: '100px',
    background: '#10b981',
    margin: '8px auto 0',
    borderRadius: '2px',
  },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    padding: '20px 24px',
    backgroundColor: '#f9fafb',
    borderRadius: '20px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  searchWrapper: {
    position: 'relative',
  },
  searchInput: {
    padding: '12px 16px 12px 40px',
    fontSize: '0.95rem',
    borderRadius: '40px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'all 0.2s',
    backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '16px center',
    backgroundSize: '16px',
    minWidth: '250px',
  },
  tableContainer: {
    borderRadius: '20px',
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  tableWrapper: {
    overflowX: 'auto',
    maxHeight: '600px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.95rem',
    minWidth: '1200px',
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backgroundColor: '#f9fafb',
    color: '#4b5563',
    fontWeight: 600,
    padding: '16px 12px',
    textAlign: 'left',
    borderBottom: '2px solid #e5e7eb',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  td: {
    padding: '14px 12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#1f2937',
  },
  tr: {
    transition: 'background 0.2s',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#6b7280',
    fontSize: '1.1rem',
  },
};

export default function ReleasedPayrollLogs() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");

  useEffect(() => {
    async function fetchLogs() {
      const { data } = await supabase
        .from('payroll_activity_logs')
        .select('*');
      setLogs(data || []);
    }
    fetchLogs();
  }, []);

  // Filter and sort
  const filteredLogs = logs.filter(log => {
    const searchLower = search.toLowerCase();
    return (
      !search ||
      (log.person_id && log.person_id.toLowerCase().includes(searchLower)) ||
      (log.payroll_period_id && String(log.payroll_period_id).toLowerCase().includes(searchLower)) ||
      (log.released_by && log.released_by.toLowerCase().includes(searchLower)) ||
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
      aVal = (aVal || '').toString().toLowerCase();
      bVal = (bVal || '').toString().toLowerCase();
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Sorting handler
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!Array.isArray(sortedLogs)) return;
    const exportData = sortedLogs.map(row => ({
      Timestamp: row.timestamp ? new Date(row.timestamp).toLocaleString() : '',
      'Payroll Period ID': row.payroll_period_id,
      'Person ID': row.person_id,
      'Released By': row.released_by,
      Action: row.action,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Released Payroll Logs');
    XLSX.writeFile(wb, 'released_payroll_logs.xlsx');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Payroll Released Activity Logs</h1>
        <div style={styles.titleUnderline} />
      </div>
      {/* Filter Bar - match PersonsTable */}
      <div style={styles.filterBar}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={styles.searchWrapper}>
            <input
              type="text"
              placeholder="Search person, period, released by, action"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>
        </div>
        <button
          onClick={handleExportExcel}
          style={{ ...styles.button, ...styles.buttonPrimary }}
        >
          Export Excel
        </button>
      </div>
      <div style={styles.tableContainer}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => handleSort('timestamp')}>
                  Timestamp {sortKey === 'timestamp' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('payroll_period_id')}>
                  Payroll Period ID {sortKey === 'payroll_period_id' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('person_id')}>
                  Person ID {sortKey === 'person_id' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('released_by')}>
                  Released By {sortKey === 'released_by' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={styles.th} onClick={() => handleSort('action')}>
                  Action {sortKey === 'action' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedLogs.length === 0 ? (
                <tr><td colSpan={5} style={styles.emptyState}>No activity logs found.</td></tr>
              ) : (
                sortedLogs.map((log, idx) => (
                  <tr key={log.id} style={{ ...styles.tr, backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                    <td style={styles.td}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={styles.td}>{log.payroll_period_id}</td>
                    <td style={styles.td}>{log.person_id}</td>
                    <td style={styles.td}>{log.released_by}</td>
                    <td style={styles.td}>{log.action}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
