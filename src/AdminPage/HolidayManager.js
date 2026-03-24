// HolidayManager.js
// Component for managing multiple holidays per month per department

import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';

export default function HolidayManager({ department, regularRate = 100, specialRate = 30 }) {
  const [regularHolidays, setRegularHolidays] = useState([]);
  const [specialHolidays, setSpecialHolidays] = useState([]);
  // Set default month to current month (YYYY-MM)
  const getDefaultMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };
  const [month, setMonth] = useState(getDefaultMonth());

  // Clear pending holidays when month changes
  useEffect(() => {
    setRegularHolidays([]);
    setSpecialHolidays([]);
  }, [month]);
  const [saving, setSaving] = useState(false);
  const [allHolidays, setAllHolidays] = useState([]);
  useEffect(() => {
    async function fetchAllHolidays() {
      if (!department || !month) return;
      const [year, monthNum] = month.split('-');
      const { data, error } = await supabase
        .from('holidays')
        .select('date, type, id')
        .eq('department', department)
        .eq('month', parseInt(monthNum))
        .eq('year', parseInt(year));
      if (!error && data) setAllHolidays(data);
      else setAllHolidays([]);
    }
    fetchAllHolidays();
  }, [department, month, saving]);

  // Delete a saved holiday from DB
  const handleDeleteSavedHoliday = async (holiday) => {
    if (!window.confirm(`Delete holiday on ${holiday.date} (${holiday.type})?`)) return;
    const { error } = await supabase
      .from('holidays')
      .delete()
      .eq('department', department)
      .eq('date', holiday.date)
      .eq('type', holiday.type);
    if (error) Swal.fire('Error', error.message, 'error');
    setSaving(s => !s); // trigger refresh
  };

  const addHoliday = (type) => {
    if (type === 'regular') setRegularHolidays([...regularHolidays, '']);
    else setSpecialHolidays([...specialHolidays, '']);
  };

  const updateHoliday = (type, idx, value) => {
    if (type === 'regular') {
      const updated = [...regularHolidays];
      updated[idx] = value;
      setRegularHolidays(updated);
    } else {
      const updated = [...specialHolidays];
      updated[idx] = value;
      setSpecialHolidays(updated);
    }
  };

  const removeHoliday = (type, idx) => {
    if (type === 'regular') {
      setRegularHolidays(regularHolidays.filter((_, i) => i !== idx));
    } else {
      setSpecialHolidays(specialHolidays.filter((_, i) => i !== idx));
    }
  };

  const handleSave = async () => {
    if (!month) {
      Swal.fire('Please select a month.', '', 'warning');
      return;
    }
    setSaving(true);
    const [year, monthNum] = month.split('-');
    // Insert new holidays (append, do not delete existing)
    const inserts = [];
    for (const date of regularHolidays.filter(Boolean)) {
      inserts.push({ department, date, type: 'regular', month: parseInt(monthNum), year: parseInt(year) });
    }
    for (const date of specialHolidays.filter(Boolean)) {
      inserts.push({ department, date, type: 'special', month: parseInt(monthNum), year: parseInt(year) });
    }
    if (inserts.length) {
      const { error } = await supabase.from('holidays').insert(inserts);
      if (error) Swal.fire('Error saving holidays', error.message, 'error');
      else Swal.fire('Holidays saved!', '', 'success');
    } else {
      Swal.fire('No holidays to save.', '', 'info');
    }
    setSaving(false);
  };

  return (
    <div style={{ margin: '24px 0' }}>
      {/* Display all holidays for selected month from DB */}
      {month && allHolidays.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <strong>All Holidays for {month} (Saved):</strong>
          <ul style={{ marginTop: 8 }}>
            {allHolidays.map((h, idx) => (
              <li key={h.id || idx} style={{ color: h.type === 'regular' ? '#10b981' : '#f59e42', display: 'flex', alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{h.date} ({h.type === 'regular' ? 'Regular Holiday' : 'Special Holiday'})</span>
                <button onClick={() => handleDeleteSavedHoliday(h)} style={{ marginLeft: 8, color: '#fff', background: '#e11d48', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Display holidays being added before saving */}
      {(regularHolidays.length > 0 || specialHolidays.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <strong>Pending Holidays for {month} (To Save):</strong>
          <ul style={{ marginTop: 8 }}>
            {regularHolidays.filter(Boolean).map((date, idx) => (
              <li key={'reg-' + idx} style={{ color: '#10b981' }}>
                {date} (Regular Holiday)
              </li>
            ))}
            {specialHolidays.filter(Boolean).map((date, idx) => (
              <li key={'spec-' + idx} style={{ color: '#f59e42' }}>
                {date} (Special Holiday)
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3>Manage Holidays for {department}</h3>
      <label>Month:
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ marginLeft: 8 }} />
      </label>
      <div style={{ marginTop: 16 }}>
        <strong>Regular Holidays ({regularRate}%):</strong>
        {regularHolidays.map((date, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <input type="date" value={date} onChange={e => updateHoliday('regular', idx, e.target.value)} />
            <button onClick={() => removeHoliday('regular', idx)} style={{ marginLeft: 8 }}>Remove</button>
          </div>
        ))}
        <button onClick={() => addHoliday('regular')}>Add Regular Holiday</button>
      </div>
      <div style={{ marginTop: 16 }}>
        <strong>Special Holidays ({specialRate}%):</strong>
        {specialHolidays.map((date, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <input type="date" value={date} onChange={e => updateHoliday('special', idx, e.target.value)} />
            <button onClick={() => removeHoliday('special', idx)} style={{ marginLeft: 8 }}>Remove</button>
          </div>
        ))}
        <button onClick={() => addHoliday('special')}>Add Special Holiday</button>
      </div>
      <button onClick={handleSave} style={{ marginTop: 24 }} disabled={saving}>{saving ? 'Saving...' : 'Save Holidays'}</button>
    </div>
  );
}
