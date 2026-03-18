import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

function DepartmentRates() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    const { data, error } = await supabase
      .from('department_rates')
      .select('*')
      .order('department');
    if (!error && data) setRates(data);
    setLoading(false);
  };

  const handleChange = (index, field, value) => {
    const updated = [...rates];
    if (["department"].includes(field)) {
      updated[index][field] = value;
    } else {
      updated[index][field] = parseFloat(value) || 0;
    }
    setRates(updated);
  }

  const handleSave = async (index) => {
    setSaving(true);
    const item = rates[index];
    const { error } = await supabase
      .from('department_rates')
      .upsert({
        department: item.department,
        daily_rate: item.daily_rate,
        late_penalty: item.late_penalty,
        sss: item.sss,
        pag_ibig: item.pag_ibig,
        philhealth: item.philhealth,
        // cash_advance: item.cash_advance,
        ot_rate: item.ot_rate,
        holiday_rate: item.holiday_rate,
        updated_at: new Date(),
      });
    if (error) alert('Error: ' + error.message);
    else alert('Saved');
    setSaving(false);
  }


  if (loading) return <div>Loading department rates...</div>;

  return (
    <div style={{ maxWidth: 600, margin: '50px auto', padding: 20 }}>
      <h2>Department Rates</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Department</th>
            <th>Daily Rate (₱)</th>
            <th>Late Penalty (₱)</th>
            <th>OT Rate (₱/hr)</th>
            <th>Holiday Rate (%)</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((row, idx) => (
            <tr key={row.department}>
              <td>{row.department}</td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.daily_rate}
                  onChange={(e) => handleChange(idx, 'daily_rate', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.late_penalty}
                  onChange={(e) => handleChange(idx, 'late_penalty', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.ot_rate || 0}
                  onChange={(e) => handleChange(idx, 'ot_rate', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.holiday_rate || 0}
                  onChange={(e) => handleChange(idx, 'holiday_rate', e.target.value)}
                />
              </td>
              <td>
                <button onClick={() => handleSave(idx)} disabled={saving}>
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{marginTop: 32}}>
        <h3>Deductions</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Department</th>
              <th>SSS (₱)</th>
              <th>Pag-ibig (₱)</th>
              <th>PhilHealth (₱)</th>
              {/* <th>Cash Advance (₱)</th> */}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((row, idx) => (
              <tr key={row.department + '-deductions'}>
                <td>{row.department}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.sss || 0}
                    onChange={(e) => handleChange(idx, 'sss', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.pag_ibig || 0}
                    onChange={(e) => handleChange(idx, 'pag_ibig', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.philhealth || 0}
                    onChange={(e) => handleChange(idx, 'philhealth', e.target.value)}
                  />
                </td>
                {/* <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.cash_advance || 0}
                    onChange={(e) => handleChange(idx, 'cash_advance', e.target.value)}
                  />
                </td> */}
                <td>
                  <button onClick={() => handleSave(idx)} disabled={saving}>
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary for all departments */}
        {/* Summary rows removed as requested */}
      </div>
    </div>
  );
}

export default DepartmentRates;