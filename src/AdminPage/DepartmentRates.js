// Updated DepartmentRates.js with fixed navigation tabs

import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { supabase } from "../supabaseClient";
import { FiPlusCircle } from "react-icons/fi";

export default function DepartmentRates() {
  const [rates, setRates] = useState([]);
  // Track original department names for rename
  const [originalNames, setOriginalNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Removed unused navigate
  const Icons = {
    circlePlus: <FiPlusCircle />,
  };
  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    const { data, error } = await supabase
      .from("department_rates")
      .select("*")
      .order("department");
    if (!error && data) {
      setRates(data);
      setOriginalNames(data.map((row) => row.department));
    }
    setLoading(false);
  };

  // Add Department (modal version)
  const handleAddDepartment = async () => {
    const { value: deptName } = await Swal.fire({
      title: "Add Department",
      input: "text",
      inputLabel: "Department Name",
      inputPlaceholder: "Enter department name",
      showCancelButton: true,
    });

    if (!deptName) return;

    // Check duplicate
    const exists = rates.find(
      (r) => r.department.toLowerCase() === deptName.toLowerCase()
    );

    if (exists) {
      return Swal.fire("Error", "Department already exists", "error");
    }

    const { error } = await supabase.from("department_rates").insert({
      department: deptName,
      daily_rate: 0,
      late_penalty: 0,
      sss: 0,
      pag_ibig: 0,
      philhealth: 0,
      ot_rate: 0,
      regular_holiday_rate: 100,
      special_holiday_rate: 30,
    });

    if (error) {
      Swal.fire("Error", error.message, "error");
    } else {
      Swal.fire("Success", "Department added", "success");
      fetchRates();
    }
  };

  const handleChange = (index, field, value) => {
    const updated = [...rates];
    if (field === "department") {
      updated[index][field] = value;
    } else {
      updated[index][field] = parseFloat(value) || 0;
    }
    setRates(updated);
  };

  // Handle holiday type checkbox
  // Removed unused handleHolidayTypeChange

  // Handle holiday date change
  // Removed unused handleHolidayDateChange

  const handleSave = async (index) => {
    setSaving(true);
    const item = rates[index];
    const originalName = originalNames[index];
    let error = null;
    // If department name changed, update by filtering on original name
    if (item.department !== originalName) {
      // Check for duplicate
      if (
        rates.some(
          (r, i) =>
            i !== index &&
            r.department.toLowerCase() === item.department.toLowerCase()
        )
      ) {
        Swal.fire("Error", "Department name already exists", "error");
        setSaving(false);
        return;
      }
      const { error: updateError } = await supabase
        .from("department_rates")
        .update({
          department: item.department,
          daily_rate: item.daily_rate,
          late_penalty: item.late_penalty,
          sss: item.sss,
          pag_ibig: item.pag_ibig,
          philhealth: item.philhealth,
          ot_rate: item.ot_rate,
          regular_holiday_rate: item.regular_holiday_rate || 100,
          special_holiday_rate: item.special_holiday_rate || 30,
          updated_at: new Date(),
        })
        .eq("department", originalName);
      error = updateError;
    } else {
      const { error: updateError } = await supabase
        .from("department_rates")
        .update({
          daily_rate: item.daily_rate,
          late_penalty: item.late_penalty,
          sss: item.sss,
          pag_ibig: item.pag_ibig,
          philhealth: item.philhealth,
          ot_rate: item.ot_rate,
          regular_holiday_rate: item.regular_holiday_rate || 100,
          special_holiday_rate: item.special_holiday_rate || 30,
          updated_at: new Date(),
        })
        .eq("department", item.department);
      error = updateError;
    }
    if (error) Swal.fire("Error", error.message, "error");
    else Swal.fire("Saved", "", "success");
    setSaving(false);
    fetchRates();
  };

  if (loading) return <div>Loading employee rates...</div>;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Employee Rates</h1>
        <div style={styles.titleUnderline} />
      </div>

      {/* Add Department Button (modal) */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={handleAddDepartment}
          style={{ ...styles.saveButton, minWidth: 180 }}
        >
          {Icons.circlePlus} Add Department
        </button>
      </div>

      {/* Horizontal scrollable cards */}
      <div style={styles.cardsContainer}>
        {rates.map((row, idx) => (
          <div key={row.department} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>🏢</span>
              <input
                type="text"
                value={row.department}
                onChange={(e) =>
                  handleChange(idx, "department", e.target.value)
                }
                style={{
                  ...styles.departmentName,
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "2px 8px",
                  minWidth: 120,
                }}
              />
              <button
                onClick={() => handleSave(idx)}
                disabled={saving}
                style={{
                  marginLeft: 8,
                  background: "#237227",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "4px 12px",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
                title="Save Department Name"
              >
                Save
              </button>
              <button
                onClick={async () => {
                  const confirm = await Swal.fire({
                    title: `Delete ${row.department}?`,
                    text: "This will remove the department and all its rates.",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Delete",
                    cancelButtonText: "Cancel",
                  });
                  if (confirm.isConfirmed) {
                    setSaving(true);
                    const { error } = await supabase
                      .from("department_rates")
                      .delete()
                      .eq("department", row.department);
                    if (error) Swal.fire("Error", error.message, "error");
                    else {
                      Swal.fire("Deleted", "", "success");
                      fetchRates();
                    }
                    setSaving(false);
                  }
                }}
                style={{
                  marginLeft: 8,
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "4px 12px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
                disabled={saving}
                title="Delete Department"
              >
                Delete
              </button>
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
                    onChange={(e) =>
                      handleChange(idx, "daily_rate", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleChange(idx, "late_penalty", e.target.value)
                    }
                    style={styles.input}
                  />
                </div>
                {/* <div style={styles.inputGroup}>
                  <label style={styles.label}>OT Rate (Hrs of Work)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.ot_rate || 0}
                    onChange={(e) => handleChange(idx, 'ot_rate', e.target.value)}
                    style={styles.input}
                  />
                </div> */}
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Regular Holiday Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.regular_holiday_rate || 100}
                    onChange={(e) =>
                      handleChange(idx, "regular_holiday_rate", e.target.value)
                    }
                    style={styles.input}
                  />
                  <label style={styles.label}>Special Holiday Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.special_holiday_rate || 30}
                    onChange={(e) =>
                      handleChange(idx, "special_holiday_rate", e.target.value)
                    }
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
                    onChange={(e) => handleChange(idx, "sss", e.target.value)}
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
                    onChange={(e) =>
                      handleChange(idx, "pag_ibig", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleChange(idx, "philhealth", e.target.value)
                    }
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
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {/* Holiday Manager Integration */}
            {/* <HolidayManager
              department={row.department}
              regularRate={row.regular_holiday_rate || 100}
              specialRate={row.special_holiday_rate || 30}
              onSave={holidayData => {
                // You can handle saving holidayData to your database here
                // Example: console.log('Holiday Data:', holidayData);
                Swal.fire('Saved holidays for ' + row.department, JSON.stringify(holidayData, null, 2), 'success');
              }}
            /> */}
          </div>
        ))}
      </div>
    </div>
  );
}

// Light theme styles with green accent
const styles = {
  container: {
    maxWidth: "1400px",
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
    marginBottom: "32px",
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
    background: "#237227",
    margin: "8px auto 0",
    borderRadius: "2px",
  },
  tabContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    marginBottom: "32px",
    borderBottom: "2px solid #e5e7eb",
    paddingBottom: "8px",
  },
  tab: {
    padding: "10px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "30px 30px 0 0",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s",
    backgroundColor: "transparent",
    color: "#6b7280",
    borderBottom: "3px solid transparent",
  },
  activeTab: {
    color: "#237227",
    borderBottom: "3px solid #237227",
    backgroundColor: "transparent",
  },
  inactiveTab: {
    color: "#6b7280",
    "&:hover": {
      color: "#1f2937",
      borderBottom: "3px solid #d1d5db",
    },
  },
  cardsContainer: {
    display: "flex",
    flexDirection: "row",
    overflowX: "auto",
    gap: "24px",
    paddingBottom: "8px",
    scrollbarWidth: "thin",
    scrollbarColor: "#cbd5e0 #f1f5f9",
  },
  card: {
    flex: "0 0 auto",
    width: "400px",
    background: "#f9fafb",
    borderRadius: "24px",
    padding: "28px 24px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    transition: "transform 0.2s, box-shadow 0.2s",
    display: "flex",
    flexDirection: "column",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "24px",
  },
  cardIcon: {
    fontSize: "2rem",
  },
  departmentName: {
    fontSize: "1.8rem",
    fontWeight: 600,
    margin: 0,
    color: "#1f2937",
  },
  section: {
    marginBottom: "24px",
  },
  sectionTitle: {
    fontSize: "1.2rem",
    fontWeight: 500,
    color: "#4b5563",
    marginBottom: "16px",
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: "8px",
  },
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "16px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  input: {
    padding: "10px 12px",
    fontSize: "1rem",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#1f2937",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  action: {
    marginTop: "auto",
    textAlign: "center",
  },
  saveButton: {
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "30px",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s",
    background: "#237227",
    color: "#ffffff",
    boxShadow: "0 4px 10px rgba(16, 185, 129, 0.3)",
    width: "100%",
    maxWidth: "200px",
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
  input:focus {
    border-color: #237227 !important;
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
