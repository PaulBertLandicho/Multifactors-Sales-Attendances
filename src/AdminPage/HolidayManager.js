import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { FiCalendar, FiTrash2, FiClock, FiX } from "react-icons/fi";
import Icon from "../components/Icon";
import { supabase } from "../supabaseClient";

export default function HolidayManagerGlobal({
  regularRate = 100,
  specialRate = 30,
}) {
  const [regularHolidays, setRegularHolidays] = useState([]);
  const [specialHolidays, setSpecialHolidays] = useState([]);
  const getDefaultMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  };
  const [month, setMonth] = useState(getDefaultMonth());

  useEffect(() => {
    setRegularHolidays([]);
    setSpecialHolidays([]);
  }, [month]);
  const [saving, setSaving] = useState(false);
  const [allHolidays, setAllHolidays] = useState([]);
  useEffect(() => {
    async function fetchAllHolidays() {
      if (!month) return;
      const [year, monthNum] = month.split("-");
      const { data, error } = await supabase
        .from("holidays")
        .select("date, type, id")
        .is("department", null)
        .eq("month", parseInt(monthNum))
        .eq("year", parseInt(year));
      if (!error && data) setAllHolidays(data);
      else setAllHolidays([]);
    }
    fetchAllHolidays();
  }, [month, saving]);

  const showToast = (title, icon = "success") => {
    Swal.fire({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 2500,
      icon,
      title,
      customClass: {
        popup: "!rounded-2xl !shadow-[0_10px_25px_rgba(0,0,0,0.1)] !border !border-gray-100 !px-4 !py-2.5 !w-auto !inline-flex !items-center !gap-2.5 font-sans",
        title: "!text-sm !font-semibold !text-gray-800 !m-0 !whitespace-nowrap",
      },
    });
  };

  const showModalAlert = ({ title, text, html, icon = "success", confirmText = "OK" }) => {
    Swal.fire({
      icon,
      title,
      text,
      html,
      width: "380px",
      padding: "1.5rem",
      confirmButtonText: confirmText,
      confirmButtonColor: "#237227",
      iconColor: icon === "success" ? "#237227" : icon === "error" ? "#ef4444" : "#f59e0b",
      customClass: {
        popup: "!rounded-3xl !shadow-2xl !border !border-gray-100 font-sans",
        title: "!text-lg !font-bold !text-gray-800 !mt-2",
        htmlContainer: "!text-sm !text-gray-600 !mt-1",
        icon: "!scale-75 !my-2",
        confirmButton: "!px-8 !py-2.5 !min-w-[110px] !rounded-xl !font-semibold !text-sm cursor-pointer !shadow-[0_4px_10px_rgba(35,114,39,0.3)] !bg-[#237227] hover:!bg-[#1a5a1d] !text-white !border-none",
      },
    });
  };

  const handleDeleteSavedHoliday = async (holiday) => {
    const isRegular = holiday.type === "regular";
    const typeLabel = isRegular ? "Regular Holiday" : "Special Holiday";

    const result = await Swal.fire({
      title: "Delete Holiday?",
      html: `
        <div class="text-gray-600 text-sm mt-1 leading-relaxed">
          Are you sure you want to delete the <b class="${isRegular ? "text-[#237227]" : "text-amber-600"}">${typeLabel}</b> on <b class="text-gray-800">${holiday.date}</b> for all departments?
        </div>
      `,
      icon: "warning",
      iconColor: "#ef4444",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      width: "400px",
      padding: "1.75rem",
      customClass: {
        popup: "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !border !border-gray-100 font-sans",
        title: "!text-xl !font-bold !text-gray-800 !mt-2",
        htmlContainer: "!text-sm !text-gray-600",
        icon: "!scale-90 !my-2",
        actions: "!flex !items-center !justify-center !gap-3 !mt-5 !w-full",
        confirmButton: "!bg-[#ef4444] hover:!bg-[#dc2626] !text-white !font-semibold !rounded-xl !px-6 !py-2.5 !text-sm !border-none cursor-pointer !m-0 !shadow-sm transition-all",
        cancelButton: "!bg-white hover:!bg-gray-50 !text-gray-700 !font-semibold !rounded-xl !px-6 !py-2.5 !text-sm !border !border-gray-300 cursor-pointer !m-0 transition-all",
      },
      buttonsStyling: false,
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from("holidays")
        .delete()
        .is("department", null)
        .eq("date", holiday.date)
        .eq("type", holiday.type);

      if (error) throw error;

      showToast("Holiday deleted successfully!");
      setSaving((s) => !s);
    } catch (error) {
      showModalAlert({
        title: "Delete Failed",
        text: error.message || "Failed to delete holiday.",
        icon: "error",
      });
    }
  };

  const addHoliday = (type) => {
    if (type === "regular") setRegularHolidays([...regularHolidays, ""]);
    else setSpecialHolidays([...specialHolidays, ""]);
  };

  const updateHoliday = (type, idx, value) => {
    if (type === "regular") {
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
    if (type === "regular") {
      setRegularHolidays(regularHolidays.filter((_, i) => i !== idx));
    } else {
      setSpecialHolidays(specialHolidays.filter((_, i) => i !== idx));
    }
  };

  const handleSave = async () => {
    if (!month) {
      showModalAlert({
        title: "Month Required",
        text: "Please select a month before saving holidays.",
        icon: "warning",
      });
      return;
    }

    const regDates = regularHolidays.filter(Boolean);
    const specDates = specialHolidays.filter(Boolean);

    if (regDates.length === 0 && specDates.length === 0) {
      showModalAlert({
        title: "No Holidays to Save",
        text: "Please add at least one holiday date to save.",
        icon: "info",
      });
      return;
    }

    setSaving(true);
    const [year, monthNum] = month.split("-");
    const inserts = [];
    for (const date of regDates) {
      inserts.push({
        department: null,
        date,
        type: "regular",
        month: parseInt(monthNum),
        year: parseInt(year),
      });
    }
    for (const date of specDates) {
      inserts.push({
        department: null,
        date,
        type: "special",
        month: parseInt(monthNum),
        year: parseInt(year),
      });
    }

    try {
      const { error } = await supabase.from("holidays").insert(inserts);
      if (error) throw error;

      showToast("Global holidays saved successfully!");
      setRegularHolidays([]);
      setSpecialHolidays([]);
    } catch (error) {
      showModalAlert({
        title: "Error Saving Holidays",
        text: error.message || "Failed to save holidays.",
        icon: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 rounded-3xl p-6 sm:p-8 mx-auto max-w-[900px] shadow-[0_6px_24px_rgba(16,185,129,0.08)] border border-gray-200 font-sans text-gray-800">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800 m-0 inline-block">Manage Holidays</h2>
        <div className="h-1 w-24 bg-[#237227] mx-auto mt-2 rounded-sm" />
      </div>

      {/* Month Selector */}
      <div className="flex justify-center items-center mb-6">
        <label className="text-base text-gray-700 font-medium flex items-center">
          <span className="mr-2.5 font-medium">Month:</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 px-3.5 py-2 rounded-xl border border-gray-300 text-base bg-white text-gray-800 outline-none focus:border-[#237227] transition-all cursor-pointer"
          />
        </label>
      </div>

      {/* Saved Holidays Card */}
      {month && allHolidays.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(16,185,129,0.07)] p-5 sm:px-6 mb-6 border border-gray-200">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-2xl text-emerald-700">
              <Icon as={FiCalendar} size={22} ariaLabel="Holidays" />
            </span>
            <span className="font-semibold text-lg text-gray-800">
              All Global Holidays for {month} (Saved)
            </span>
          </div>
          <ul className="list-none p-0 m-0 space-y-2">
            {allHolidays.map((h, idx) => (
              <li
                key={h.id || idx}
                className={`flex items-center bg-gray-100 rounded-lg px-3.5 py-2 font-medium text-base shadow-sm ${
                  h.type === "regular" ? "text-[#237227]" : "text-amber-600"
                }`}
              >
                <span className="flex-1 font-semibold tracking-wide text-gray-800">{h.date}</span>
                <span className="ml-3 text-[0.98rem] font-medium opacity-90">
                  {h.type === "regular" ? "Regular Holiday" : "Special Holiday"}
                </span>
                <button
                  onClick={() => handleDeleteSavedHoliday(h)}
                  className="ml-4 bg-rose-600 text-white border-none rounded-md px-2.5 py-1 cursor-pointer text-sm inline-flex items-center"
                  title="Delete holiday"
                >
                  <Icon
                    as={FiTrash2}
                    ariaLabel="Delete holiday"
                    color="#ffffff"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending Holidays Card */}
      {(regularHolidays.length > 0 || specialHolidays.length > 0) && (
        <div className="bg-amber-50 rounded-2xl shadow-[0_1px_4px_rgba(251,191,36,0.08)] p-4 sm:px-5 mb-6 border border-amber-200">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="text-xl text-amber-600">
              <Icon as={FiClock} size={20} ariaLabel="Pending" />
            </span>
            <span className="font-semibold text-[1.05rem] text-amber-800">
              Pending Holidays for {month} (To Save)
            </span>
          </div>
          <ul className="list-none p-0 m-0 space-y-1 text-sm">
            {regularHolidays.filter(Boolean).map((date, idx) => (
              <li key={"reg-" + idx} className="text-[#237227] font-medium">
                {date} (Regular Holiday)
              </li>
            ))}
            {specialHolidays.filter(Boolean).map((date, idx) => (
              <li key={"spec-" + idx} className="text-amber-600 font-medium">
                {date} (Special Holiday)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add Holidays Cards */}
      <div className="flex gap-6 mb-8 flex-wrap justify-center">
        {/* Regular Holidays Card */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(16,185,129,0.06)] p-5 min-w-[270px] flex-1 border border-gray-200 flex flex-col items-stretch">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="font-semibold text-[1.08rem] text-gray-800">
              Regular Holidays{" "}
              <span className="text-[#237227] font-semibold">
                ({regularRate}%)
              </span>
            </span>
          </div>
          {regularHolidays.map((date, idx) => (
            <div key={idx} className="flex items-center mb-2">
              <input
                type="date"
                value={date}
                onChange={(e) => updateHoliday("regular", idx, e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-base bg-gray-50 text-gray-800 outline-none focus:border-[#237227] transition-all"
              />
              <button
                onClick={() => removeHoliday("regular", idx)}
                className="ml-2 bg-rose-600 text-white border-none rounded-md px-2.5 py-2 cursor-pointer"
                title="Remove date"
              >
                <Icon as={FiX} ariaLabel="Remove date" color="#ffffff" />
              </button>
            </div>
          ))}
          <button
            onClick={() => addHoliday("regular")}
            className="mt-2 bg-[#237227] text-white border-none rounded-lg py-2 font-semibold text-base cursor-pointer"
          >
            + Add Regular Holiday
          </button>
        </div>

        {/* Special Holidays Card */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(16,185,129,0.06)] p-5 min-w-[270px] flex-1 border border-gray-200 flex flex-col items-stretch">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="font-semibold text-[1.08rem] text-gray-800">
              Special Holidays{" "}
              <span className="text-amber-500 font-semibold">
                ({specialRate}%)
              </span>
            </span>
          </div>
          {specialHolidays.map((date, idx) => (
            <div key={idx} className="flex items-center mb-2">
              <input
                type="date"
                value={date}
                onChange={(e) => updateHoliday("special", idx, e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-base bg-gray-50 text-gray-800 outline-none focus:border-[#237227] transition-all"
              />
              <button
                onClick={() => removeHoliday("special", idx)}
                className="ml-2 bg-rose-600 text-white border-none rounded-md px-2.5 py-2 cursor-pointer"
                title="Remove date"
              >
                <Icon as={FiX} ariaLabel="Remove date" color="#ffffff" />
              </button>
            </div>
          ))}
          <button
            onClick={() => addHoliday("special")}
            className="mt-2 bg-[#237227] text-white border-none rounded-lg py-2 font-semibold text-base cursor-pointer"
          >
            + Add Special Holiday
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-center mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#237227] text-white border-none rounded-lg px-9 py-3 font-bold text-base cursor-pointer shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Holidays"}
        </button>
      </div>
    </div>
  );
}
