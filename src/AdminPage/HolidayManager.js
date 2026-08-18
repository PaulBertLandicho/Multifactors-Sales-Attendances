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

  const handleDeleteSavedHoliday = async (holiday) => {
    if (
      !window.confirm(
        `Delete holiday on ${holiday.date} (${holiday.type}) for all departments?`,
      )
    )
      return;
    const { error } = await supabase
      .from("holidays")
      .delete()
      .is("department", null)
      .eq("date", holiday.date)
      .eq("type", holiday.type);
    if (error) Swal.fire("Error", error.message, "error");
    setSaving((s) => !s);
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
      Swal.fire("Please select a month.", "", "warning");
      return;
    }
    setSaving(true);
    const [year, monthNum] = month.split("-");
    const inserts = [];
    for (const date of regularHolidays.filter(Boolean)) {
      inserts.push({
        department: null,
        date,
        type: "regular",
        month: parseInt(monthNum),
        year: parseInt(year),
      });
    }
    for (const date of specialHolidays.filter(Boolean)) {
      inserts.push({
        department: null,
        date,
        type: "special",
        month: parseInt(monthNum),
        year: parseInt(year),
      });
    }
    if (inserts.length) {
      const { error } = await supabase.from("holidays").insert(inserts);
      if (error) Swal.fire("Error saving holidays", error.message, "error");
      else Swal.fire("Global holidays saved!", "", "success");
    } else {
      Swal.fire("No holidays to save.", "", "info");
    }
    setSaving(false);
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
            className="ml-2 px-3.5 py-2 rounded-xl border border-gray-300 text-base bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all cursor-pointer"
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
                  className="ml-4 bg-rose-600 text-white border-none rounded-md px-2.5 py-1 cursor-pointer text-sm hover:bg-rose-700 transition-colors inline-flex items-center"
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
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-base bg-gray-50 text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all"
              />
              <button
                onClick={() => removeHoliday("regular", idx)}
                className="ml-2 bg-rose-600 text-white border-none rounded-md px-2.5 py-2 cursor-pointer hover:bg-rose-700 transition-colors"
                title="Remove date"
              >
                <Icon as={FiX} ariaLabel="Remove date" />
              </button>
            </div>
          ))}
          <button
            onClick={() => addHoliday("regular")}
            className="mt-2 bg-[#237227] text-white border-none rounded-lg py-2 font-semibold text-base cursor-pointer hover:bg-[#1a5a1d] transition-colors"
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
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-base bg-gray-50 text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all"
              />
              <button
                onClick={() => removeHoliday("special", idx)}
                className="ml-2 bg-rose-600 text-white border-none rounded-md px-2.5 py-2 cursor-pointer hover:bg-rose-700 transition-colors"
                title="Remove date"
              >
                <Icon as={FiX} ariaLabel="Remove date" />
              </button>
            </div>
          ))}
          <button
            onClick={() => addHoliday("special")}
            className="mt-2 bg-[#237227] text-white border-none rounded-lg py-2 font-semibold text-base cursor-pointer hover:bg-[#1a5a1d] transition-colors"
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
          className="bg-[#237227] text-white border-none rounded-full px-9 py-3 font-bold text-base cursor-pointer shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Holidays"}
        </button>
      </div>
    </div>
  );
}
