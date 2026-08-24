// Updated DepartmentRates.js with fixed navigation tabs

import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { supabase } from "../supabaseClient";
import { FiPlusCircle, FiHome, FiTrendingDown } from "react-icons/fi";
import Icon from "../components/Icon";

export default function DepartmentRates() {
  const [rates, setRates] = useState([]);
  const [originalNames, setOriginalNames] = useState([]);
  const [saving, setSaving] = useState(false);

  const Icons = {
    circlePlus: <Icon as={FiPlusCircle} ariaLabel="Add" color="#ffffff" />,
  };

  useEffect(() => {
    fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRates = async () => {
    try {
      const { data, error } = await supabase
        .from("department_rates")
        .select("*")
        .order("department");
      if (!error && data) {
        setRates(data);
        setOriginalNames(data.map((row) => row.department));
      }
    } catch (e) {
      console.error("Error fetching department rates:", e);
    }
  };

  const handleAddDepartment = async () => {
    const { value: deptName } = await Swal.fire({
      title: "Add Department",
      html: `
        <div style="text-align: left; margin-top: 1.25rem;">
          <div style="margin-bottom: 0.5rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #374151; margin-bottom: 0.35rem;">
              Department Name
            </label>
            <input 
              id="swal-dept-name" 
              type="text"
              placeholder="Enter department name" 
              style="display: block; width: 100%; padding: 0.65rem 0.85rem; font-size: 0.95rem; border: 1px solid #d1d5db; border-radius: 0.75rem; outline: none; box-sizing: border-box; background: #ffffff; color: #1f2937;"
            />
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Add Department",
      confirmButtonColor: "#237227",
      cancelButtonColor: "#E5E7EB",
      buttonsStyling: false,
      customClass: {
        popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[420px] font-sans",
        title: "!text-gray-800 !text-[1.4rem] !font-bold !mt-1 !mb-0",
        actions: "!flex !items-center !justify-center !gap-3 !mt-6 !w-full",
        confirmButton: "!bg-[#237227] !text-white !font-semibold !rounded-lg !px-5 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[130px] border-none",
        cancelButton: "!bg-white !border !border-gray-300 !text-gray-700 !font-semibold !rounded-lg !px-5 !py-2.5 !text-sm cursor-pointer !m-0 !min-w-[90px]",
      },
      didOpen: () => {
        const input = document.getElementById("swal-dept-name");
        if (input) input.focus();
      },
      preConfirm: () => {
        const input = document.getElementById("swal-dept-name");
        const trimmed = (input ? input.value : "").trim();
        if (!trimmed) {
          Swal.showValidationMessage("Department name is required!");
          return false;
        }
        const exists = rates.find(
          (r) => r.department.toLowerCase() === trimmed.toLowerCase()
        );
        if (exists) {
          Swal.showValidationMessage("Department name already exists!");
          return false;
        }
        return trimmed;
      },
    });

    if (!deptName || !deptName.trim()) return;

    const trimmedDept = deptName.trim();

    const { error } = await supabase.from("department_rates").insert({
      department: trimmedDept,
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
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error",
        width: "360px",
        padding: "1.25rem",
        confirmButtonColor: "#237227",
        customClass: {
          popup: "rounded-[24px] shadow-2xl border border-gray-100",
          title: "text-lg font-bold text-gray-800",
        },
      });
    } else {
      Swal.fire({
        title: "Success",
        text: `Department "${trimmedDept}" added!`,
        icon: "success",
        width: "360px",
        padding: "1.25rem",
        timer: 1800,
        showConfirmButton: false,
        iconColor: "#237227",
        customClass: {
          popup: "rounded-[24px] shadow-2xl border border-gray-100",
          title: "text-lg font-bold text-gray-800",
          htmlContainer: "text-xs text-gray-500",
          icon: "scale-75 my-2",
        },
      });
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

  const handleSave = async (index) => {
    setSaving(true);
    const item = rates[index];
    const originalName = originalNames[index];
    let error = null;

    if (item.department !== originalName) {
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

    if (error) {
      Swal.fire({
        icon: "error",
        title: "Error Saving",
        text: error.message,
        width: "360px",
        padding: "1.25rem",
        confirmButtonText: "OK",
        confirmButtonColor: "#237227",
        customClass: {
          popup: "rounded-[24px] shadow-2xl border border-gray-100",
          title: "text-lg font-bold text-gray-800",
          htmlContainer: "text-xs text-gray-500",
          icon: "scale-75 my-2",
          confirmButton: "px-10 py-2.5 min-w-[120px] rounded-lg font-semibold text-sm cursor-pointer",
        },
      });
    } else {
      Swal.fire({
        icon: "success",
        title: "Saved Successfully!",
        text: "Department rates have been updated.",
        width: "360px",
        padding: "1.25rem",
        confirmButtonText: "OK",
        confirmButtonColor: "#237227",
        iconColor: "#237227",
        customClass: {
          popup: "rounded-[24px] shadow-2xl border border-gray-100",
          title: "text-lg font-bold text-gray-800",
          htmlContainer: "text-xs text-gray-500",
          icon: "scale-75 my-2",
          confirmButton: "px-10 py-2.5 min-w-[120px] rounded-lg font-semibold text-sm cursor-pointer shadow-[0_4px_10px_rgba(16,185,129,0.3)] hover:opacity-90",
        },
      });
    }
    setSaving(false);
    fetchRates();
  };

  return (
    <div className="max-w-[1600px] mx-auto mt-2 mb-10 px-6 sm:px-8 py-10 bg-white rounded-[32px] shadow-md text-gray-800 font-sans">

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-[2.8rem] font-bold text-gray-800 m-0 inline-block">Employee Rates</h1>
        <div className="h-1 w-24 bg-[#237227] mx-auto mt-2 rounded-sm" />
      </div>

      {/* Add Department Button */}
      <div className="mb-6">
        <button
          onClick={handleAddDepartment}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border-none bg-[#237227] text-white font-semibold text-base cursor-pointer   transition-all min-w-[180px] justify-center"
        >
          {Icons.circlePlus} Add Department
        </button>
      </div>

      {/* Department Cards Grid (3 Columns / Vertical Scroll) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {rates.map((row, idx) => (
          <div
            key={row.department}
            className="w-full bg-gray-50 rounded-3xl p-6 sm:p-7 border border-gray-200 shadow-md flex flex-col transition-all"
          >
            {/* Card Header */}
            <div className="flex items-center gap-2.5 mb-6 flex-wrap sm:flex-nowrap">
              <span className="text-[1.8rem] flex-shrink-0">
                <Icon as={FiHome} size={26} ariaLabel="Department" />
              </span>
              <input
                type="text"
                id={`department-name-${row.department || idx}`}
                name={`department-name-${row.department || idx}`}
                value={row.department}
                onChange={(e) => handleChange(idx, "department", e.target.value)}
                className="text-xl font-semibold text-gray-800 border border-gray-300 rounded-lg px-2.5 py-1 flex-1 min-w-[100px] outline-none focus:border-[#237227] transition-all"
              />
              <button
                onClick={() => handleSave(idx)}
                disabled={saving}
                className={`bg-[#237227] text-white border-none rounded-lg px-3 py-1.5 font-semibold text-sm transition-all flex-shrink-0 ${saving ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
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
                    iconColor: "#ef4444",
                    width: "380px",
                    padding: "1.75rem",
                    backdrop: false,
                    showCancelButton: true,
                    confirmButtonText: "Yes, delete it",
                    cancelButtonText: "Cancel",
                    buttonsStyling: false,
                    customClass: {
                      container: "!bg-transparent !backdrop-blur-none",
                      popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !border !border-gray-100 font-sans",
                      title: "!text-xl !font-bold !text-gray-800 !mt-2",
                      htmlContainer: "!text-sm !text-gray-600",
                      icon: "!scale-90 !my-2",
                      actions: "!flex !items-center !justify-center !gap-3 !mt-5 !w-full",
                      confirmButton: "!bg-[#ef4444] !text-white !font-semibold !rounded-xl !px-6 !py-2.5 !text-sm !border-none cursor-pointer !m-0 !shadow-sm",
                      cancelButton: "!bg-white !text-gray-700 !font-semibold !rounded-xl !px-6 !py-2.5 !text-sm !border !border-gray-300 cursor-pointer !m-0",
                    },
                  });
                  if (confirm.isConfirmed) {
                    const { error } = await supabase
                      .from("department_rates")
                      .delete()
                      .eq("department", row.department);
                    if (error) {
                      Swal.fire({
                        icon: "error",
                        title: "Error",
                        text: error.message,
                        width: "360px",
                        padding: "1.25rem",
                        confirmButtonColor: "#237227",
                        customClass: {
                          popup: "rounded-[24px] shadow-2xl border border-gray-100",
                          title: "text-lg font-bold text-gray-800",
                        },
                      });
                    } else {
                      Swal.fire({
                        icon: "success",
                        title: "Deleted!",
                        text: `${row.department} has been removed.`,
                        width: "360px",
                        padding: "1.25rem",
                        confirmButtonText: "OK",
                        confirmButtonColor: "#237227",
                        iconColor: "#237227",
                        customClass: {
                          popup: "rounded-[24px] shadow-2xl border border-gray-100",
                          title: "text-lg font-bold text-gray-800",
                          htmlContainer: "text-xs text-gray-500",
                          icon: "scale-75 my-2",
                          confirmButton: "px-10 py-2.5 min-w-[120px] rounded-lg font-semibold text-sm cursor-pointer shadow-md",
                        },
                      });
                      fetchRates();
                    }
                  }
                }}
                className="bg-[#ef4444] text-white border-none rounded-lg px-3 py-1 font-semibold cursor-pointer transition-all ml-1"
                title="Delete Department"
              >
                Delete
              </button>
            </div>

            {/* Rates Form */}
            <div className="flex flex-col gap-5 mb-6">
              {/* Daily Rate & Late Penalty */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`daily-rate-${row.department || idx}`}
                    className="text-[0.85rem] font-medium text-gray-600 uppercase tracking-wide"
                  >
                    Daily Rate (₱)
                  </label>
                  <input
                    id={`daily-rate-${row.department || idx}`}
                    name={`daily-rate-${row.department || idx}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.daily_rate || 0}
                    onChange={(e) => handleChange(idx, "daily_rate", e.target.value)}
                    className="px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-800 outline-none w-full box-border focus:border-[#237227] transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`late-penalty-${row.department || idx}`}
                    className="text-[0.85rem] font-medium text-gray-600 uppercase tracking-wide"
                  >
                    Late Penalty (₱)
                  </label>
                  <input
                    id={`late-penalty-${row.department || idx}`}
                    name={`late-penalty-${row.department || idx}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.late_penalty || 0}
                    onChange={(e) => handleChange(idx, "late_penalty", e.target.value)}
                    className="px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-800 outline-none w-full box-border focus:border-[#237227] transition-all"
                  />
                </div>
              </div>

              {/* Regular & Special Holiday Rates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`regular-holiday-rate-${row.department || idx}`}
                    className="text-[0.85rem] font-medium text-gray-600 uppercase tracking-wide"
                  >
                    Regular Holiday Rate (%)
                  </label>
                  <input
                    id={`regular-holiday-rate-${row.department || idx}`}
                    name={`regular-holiday-rate-${row.department || idx}`}
                    type="number"
                    step="1"
                    min="0"
                    value={row.regular_holiday_rate || 100}
                    onChange={(e) => handleChange(idx, "regular_holiday_rate", e.target.value)}
                    className="px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-800 outline-none w-full box-border focus:border-[#237227] transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`special-holiday-rate-${row.department || idx}`}
                    className="text-[0.85rem] font-medium text-gray-600 uppercase tracking-wide"
                  >
                    Special Holiday Rate (%)
                  </label>
                  <input
                    id={`special-holiday-rate-${row.department || idx}`}
                    name={`special-holiday-rate-${row.department || idx}`}
                    type="number"
                    step="1"
                    min="0"
                    value={row.special_holiday_rate || 30}
                    onChange={(e) => handleChange(idx, "special_holiday_rate", e.target.value)}
                    className="px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-800 outline-none w-full box-border focus:border-[#237227] transition-all"
                  />
                </div>
              </div>

              {/* Deductions Header */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                <span className="text-xl">
                  <Icon as={FiTrendingDown} size={20} ariaLabel="Deductions" />
                </span>
                <span className="font-semibold text-base text-gray-800">Deductions</span>
              </div>

              {/* SSS, Pag-IBIG, PhilHealth */}
              <div className="grid grid-cols-3 gap-3">
                {/* SSS */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`sss-${row.department || idx}`}
                    className="text-[0.85rem] font-medium text-gray-600 uppercase tracking-wide"
                  >
                    SSS (₱)
                  </label>
                  <input
                    id={`sss-${row.department || idx}`}
                    name={`sss-${row.department || idx}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.sss || 0}
                    onChange={(e) => handleChange(idx, "sss", e.target.value)}
                    className="px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-800 outline-none w-full box-border focus:border-[#237227] transition-all"
                  />
                </div>

                {/* Pag-IBIG */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`pag-ibig-${row.department || idx}`}
                    className="text-[0.85rem] font-medium text-gray-600 uppercase tracking-wide"
                  >
                    Pag-IBIG (₱)
                  </label>
                  <input
                    id={`pag-ibig-${row.department || idx}`}
                    name={`pag-ibig-${row.department || idx}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.pag_ibig || 0}
                    onChange={(e) => handleChange(idx, "pag_ibig", e.target.value)}
                    className="px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-800 outline-none w-full box-border focus:border-[#237227] transition-all"
                  />
                </div>

                {/* PhilHealth */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`philhealth-${row.department || idx}`}
                    className="text-[0.85rem] font-medium text-gray-600 uppercase tracking-wide"
                  >
                    PhilHealth (₱)
                  </label>
                  <input
                    id={`philhealth-${row.department || idx}`}
                    name={`philhealth-${row.department || idx}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.philhealth || 0}
                    onChange={(e) => handleChange(idx, "philhealth", e.target.value)}
                    className="px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-800 outline-none w-full box-border focus:border-[#237227] transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-auto text-center">
              <button
                onClick={() => handleSave(idx)}
                disabled={saving}
                className={`px-6 py-3 text-base font-semibold rounded-lg border-none transition-all bg-[#237227] text-white w-full max-w-[200px] ${
                  saving
                    ? "opacity-70 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
