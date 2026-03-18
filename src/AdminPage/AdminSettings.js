import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AttendanceTable from '../AdminPage/AttendanceTable';

function AdminSettings() {
  const [settings, setSettings] = useState({
    morning_start: '08:00',
    morning_end: '11:59',
    afternoon_start: '13:00',
    afternoon_end: '17:00',
    morning_grace_minutes: 15,
    afternoon_grace_minutes: 15,
    late_count_limit: 5,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchSettings() {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (!error && data) {
        // Fallbacks for missing/invalid values
        setSettings({
          morning_start: data.morning_start ? data.morning_start.slice(0,5) : '08:00',
          morning_end: data.morning_end ? data.morning_end.slice(0,5) : '11:59',
          afternoon_start: data.afternoon_start ? data.afternoon_start.slice(0,5) : '13:00',
          afternoon_end: data.afternoon_end ? data.afternoon_end.slice(0,5) : '17:00',
          morning_grace_minutes: Number.isFinite(data.morning_grace_minutes) ? data.morning_grace_minutes : 15,
          afternoon_grace_minutes: Number.isFinite(data.afternoon_grace_minutes) ? data.afternoon_grace_minutes : 15,
          late_count_limit: Number.isFinite(data.late_count_limit) ? data.late_count_limit : 5,
        });
      }
      setLoading(false);
    }
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setSettings({
      ...settings,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // Check if settings row exists
    const { data: existing, error: fetchError } = await supabase
      .from('settings')
      .select('id')
      .eq('id', 1)
      .single();

    let error = null;
    if (!fetchError && existing) {
      // Update existing row
      ({ error } = await supabase
        .from('settings')
        .update({
          morning_start: settings.morning_start,
          morning_end: settings.morning_end,
          afternoon_start: settings.afternoon_start,
          afternoon_end: settings.afternoon_end,
          morning_grace_minutes: settings.morning_grace_minutes,
          afternoon_grace_minutes: settings.afternoon_grace_minutes,
          late_count_limit: settings.late_count_limit,
          updated_at: new Date(),
        })
        .eq('id', 1));
    } else {
      // Insert new row
      ({ error } = await supabase
        .from('settings')
        .insert({
          id: 1,
          morning_start: settings.morning_start,
          morning_end: settings.morning_end,
          afternoon_start: settings.afternoon_start,
          afternoon_end: settings.afternoon_end,
          morning_grace_minutes: settings.morning_grace_minutes,
          afternoon_grace_minutes: settings.afternoon_grace_minutes,
          updated_at: new Date(),
        }));
    }
    if (error) alert('Error saving: ' + error.message);
    else alert('Settings updated!');
    setSaving(false);
  };


  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 32, background: 'rgba(24,26,32,0.98)', borderRadius: 12, boxShadow: '0 2px 24px #0008' }}>
      <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 700, marginBottom: 32 }}>Work Hours Settings</h2>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 64, marginBottom: 32 }}>
              <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <label style={{ fontWeight: 500 }}>Late Count Limit for Deduction:</label>
                <input type="number" name="late_count_limit" value={settings.late_count_limit} onChange={handleChange} min="1" step="1" style={{ marginLeft: 8, width: 60, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#23272f', color: '#fff' }} />
                <span style={{ marginLeft: 8, fontSize: 13, color: '#aaa' }}>Late occurrences before deduction</span>
              </div>
        <div>
          <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>Morning Shift</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 500 }}>Start Time:</label>
            <input type="time" name="morning_start" value={settings.morning_start} onChange={handleChange} style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#23272f', color: '#fff' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 500 }}>End Time:</label>
            <input type="time" name="morning_end" value={settings.morning_end} onChange={handleChange} style={{ marginLeft: 18, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#23272f', color: '#fff' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 500 }}>Late time (minutes):</label>
            <input type="number" name="morning_grace_minutes" value={settings.morning_grace_minutes} onChange={handleChange} min="0" step="1" style={{ marginLeft: 8, width: 60, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#23272f', color: '#fff' }} />
            <span style={{ marginLeft: 8, fontSize: 13, color: '#aaa' }}>Minutes after start considered on‑time</span>
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>Afternoon Shift</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 500 }}>Start Time:</label>
            <input type="time" name="afternoon_start" value={settings.afternoon_start} onChange={handleChange} style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#23272f', color: '#fff' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 500 }}>End Time:</label>
            <input type="time" name="afternoon_end" value={settings.afternoon_end} onChange={handleChange} style={{ marginLeft: 18, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#23272f', color: '#fff' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 500 }}>Late time (minutes):</label>
            <input type="number" name="afternoon_grace_minutes" value={settings.afternoon_grace_minutes} onChange={handleChange} min="0" step="1" style={{ marginLeft: 8, width: 60, padding: 4, borderRadius: 4, border: '1px solid #444', background: '#23272f', color: '#fff' }} />
            <span style={{ marginLeft: 8, fontSize: 13, color: '#aaa' }}>Minutes after start considered on‑time</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', fontSize: 16, fontWeight: 600, borderRadius: 6, border: 'none', background: 'rgb(16 185 129)', color: '#fff', marginRight: 16, cursor: 'pointer', boxShadow: '0 2px 8px #0004' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {/* <button onClick={() => navigate('/admin/payroll')} style={{ padding: '10px 24px', fontSize: 16, fontWeight: 600, borderRadius: 6, border: 'none', background: '#1976d2', color: '#fff', marginRight: 16, cursor: 'pointer', boxShadow: '0 2px 8px #0004' }}>View Payroll</button> */}
      </div>
      <button onClick={() => navigate('/admin/department-rates')} style={{ padding: '10px 24px', fontSize: 16, fontWeight: 600, borderRadius: 6, border: 'none', background: 'rgb(16 185 129)', color: '#fff', marginRight: 16, cursor: 'pointer', boxShadow: '0 2px 8px #0004' }}>
  Department Rates
</button>
    </div>
  );
}

export default AdminSettings;