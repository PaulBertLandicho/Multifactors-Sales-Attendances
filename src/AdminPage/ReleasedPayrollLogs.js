import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function ReleasedPayrollLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    async function fetchLogs() {
      const { data, error } = await supabase
        .from('payroll_activity_logs')
        .select('*')
        .order('timestamp', { ascending: false });
      setLogs(data || []);
    }
    fetchLogs();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 32, background: '#fff', borderRadius: 24 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981', marginBottom: 24 }}>Payroll Released Activity Logs</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Payroll Period ID</th>
            <th>Person ID</th>
            <th>Released By</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af' }}>No activity logs found.</td></tr>
          ) : (
            logs.map((log, idx) => (
              <tr key={log.id} style={{ background: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>{log.payroll_period_id}</td>
                <td>{log.person_id}</td>
                <td>{log.released_by}</td>
                <td>{log.action}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
