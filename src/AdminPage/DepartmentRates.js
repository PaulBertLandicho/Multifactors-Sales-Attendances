// Updated DepartmentRates.js with fixed navigation tabs

import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function DepartmentRates() {
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
    if (field === 'department') {
      updated[index][field] = value;
    } else {
      updated[index][field] = parseFloat(value) || 0;
    }
    setRates(updated);
  };

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
        ot_rate: item.ot_rate,
        holiday_rate: item.holiday_rate,
        updated_at: new Date(),
      });
    if (error) alert('Error: ' + error.message);
    else alert('Saved');
    setSaving(false);
  };

  if (loading) return <div>Loading department rates...</div>;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Department Rates</h1>
        <div style={styles.titleUnderline} />
      </div>

      {/* Navigation Tabs */}
      <div style={styles.tabContainer}>
        <button
          onClick={() => navigate('/admin/settings')}
          style={{
            ...styles.tab,
            ...(window.location.pathname === '/admin/settings'
              ? styles.activeTab
              : styles.inactiveTab),
          }}
        >
          Work Hours Settings
        </button>
        <button
          onClick={() => navigate('/admin/department-rates')}
          style={{
            ...styles.tab,
            ...(window.location.pathname === '/admin/department-rates'
              ? styles.activeTab
              : styles.inactiveTab),
          }}
        >
          Department Rates
        </button>
      </div>

      {/* Horizontal scrollable cards */}
      <div style={styles.cardsContainer}>
        {rates.map((row, idx) => (
          <div key={row.department} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>🏢</span>
              <h2 style={styles.departmentName}>{row.department}</h2>
            </div>

            {/* Rates Section */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>💰 Rates</h3>
              <div style={styles.inputGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Daily Rate (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.daily_rate}
                    onChange={(e) => handleChange(idx, 'daily_rate', e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Late Penalty (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.late_penalty}
                    onChange={(e) => handleChange(idx, 'late_penalty', e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>OT Rate (₱/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.ot_rate || 0}
                    onChange={(e) => handleChange(idx, 'ot_rate', e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Holiday Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.holiday_rate || 0}
                    onChange={(e) => handleChange(idx, 'holiday_rate', e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            {/* Deductions Section */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>📉 Deductions</h3>
              <div style={styles.inputGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>SSS (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.sss || 0}
                    onChange={(e) => handleChange(idx, 'sss', e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Pag-ibig (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.pag_ibig || 0}
                    onChange={(e) => handleChange(idx, 'pag_ibig', e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>PhilHealth (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.philhealth || 0}
                    onChange={(e) => handleChange(idx, 'philhealth', e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div style={styles.action}>
              <button
                onClick={() => handleSave(idx)}
                disabled={saving}
                style={{
                  ...styles.saveButton,
                  opacity: saving ? 0.7 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Light theme styles with green accent
const styles = {
  container: {
    maxWidth: '1400px',
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
    marginBottom: '32px',
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
  tabContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '32px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '8px',
  },
  tab: {
    padding: '10px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    borderRadius: '30px 30px 0 0',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: 'transparent',
    color: '#6b7280',
    borderBottom: '3px solid transparent',
  },
  activeTab: {
    color: '#10b981',
    borderBottom: '3px solid #10b981',
    backgroundColor: 'transparent',
  },
  inactiveTab: {
    color: '#6b7280',
    '&:hover': {
      color: '#1f2937',
      borderBottom: '3px solid #d1d5db',
    },
  },
  cardsContainer: {
    display: 'flex',
    flexDirection: 'row',
    overflowX: 'auto',
    gap: '24px',
    paddingBottom: '8px',
    scrollbarWidth: 'thin',
    scrollbarColor: '#cbd5e0 #f1f5f9',
  },
  card: {
    flex: '0 0 auto',
    width: '400px',
    background: '#f9fafb',
    borderRadius: '24px',
    padding: '28px 24px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  cardIcon: {
    fontSize: '2rem',
  },
  departmentName: {
    fontSize: '1.8rem',
    fontWeight: 600,
    margin: 0,
    color: '#1f2937',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '1.2rem',
    fontWeight: 500,
    color: '#4b5563',
    marginBottom: '16px',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '8px',
  },
  inputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '10px 12px',
    fontSize: '1rem',
    borderRadius: '12px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    width: '100%',
    boxSizing: 'border-box',
  },
  action: {
    marginTop: 'auto',
    textAlign: 'center',
  },
  saveButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    borderRadius: '30px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: '#10b981',
    color: '#ffffff',
    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)',
    width: '100%',
    maxWidth: '200px',
  },
  spinnerContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '300px',
    background: '#ffffff',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #10b981',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// Add global keyframes and focus styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  input:focus {
    border-color: #10b981 !important;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2) !important;
  }
  button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
  .saveButton:hover {
    background: #0f9e6e !important;
  }
  .inactiveTab:hover {
    color: #1f2937 !important;
    border-bottom: 3px solid #d1d5db !important;
  }
  /* Custom scrollbar for light theme */
  .cardsContainer::-webkit-scrollbar {
    height: 8px;
  }
  .cardsContainer::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 10px;
  }
  .cardsContainer::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 10px;
  }
  .cardsContainer::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
`;
document.head.appendChild(styleSheet);