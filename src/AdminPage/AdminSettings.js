import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { FiSun, FiMoon, FiAlertTriangle, FiCalendar, FiClock } from "react-icons/fi";
import Icon from "../components/Icon";
import { supabase } from "../supabaseClient";
import HolidayManagerGlobal from "./HolidayManager";

const DEFAULT_SETTINGS = {
  morning_start: "08:00",
  morning_end: "11:59",
  afternoon_start: "13:00",
  afternoon_end: "17:00",
  morning_grace_minutes: 15,
  afternoon_grace_minutes: 15,
  late_count_limit: 5,
  payroll_period_days: 15,
};

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingId, setSettingId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("work-hours");

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          if (data.id) setSettingId(data.id);
          setSettings({
            morning_start: data.morning_start
              ? data.morning_start.slice(0, 5)
              : DEFAULT_SETTINGS.morning_start,
            morning_end: data.morning_end
              ? data.morning_end.slice(0, 5)
              : DEFAULT_SETTINGS.morning_end,
            afternoon_start: data.afternoon_start
              ? data.afternoon_start.slice(0, 5)
              : DEFAULT_SETTINGS.afternoon_start,
            afternoon_end: data.afternoon_end
              ? data.afternoon_end.slice(0, 5)
              : DEFAULT_SETTINGS.afternoon_end,
            morning_grace_minutes: Number.isFinite(data.morning_grace_minutes)
              ? data.morning_grace_minutes
              : DEFAULT_SETTINGS.morning_grace_minutes,
            afternoon_grace_minutes: Number.isFinite(
              data.afternoon_grace_minutes,
            )
              ? data.afternoon_grace_minutes
              : DEFAULT_SETTINGS.afternoon_grace_minutes,
            late_count_limit: Number.isFinite(data.late_count_limit)
              ? data.late_count_limit
              : DEFAULT_SETTINGS.late_count_limit,
            payroll_period_days: Number.isFinite(data.payroll_period_days)
              ? data.payroll_period_days
              : DEFAULT_SETTINGS.payroll_period_days,
          });
        } else if (!error) {
          setSettings(DEFAULT_SETTINGS);
        }
      } catch (e) {
        console.error("Error fetching settings:", e);
      }
    }
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setSettings({
      ...settings,
      [name]: type === "number" ? parseInt(value) || 0 : value,
    });
  };

  const handleSave = async () => {
    setSaving(true);

    const payload = {
      morning_start: settings.morning_start,
      morning_end: settings.morning_end,
      afternoon_start: settings.afternoon_start,
      afternoon_end: settings.afternoon_end,
      morning_grace_minutes: Number(settings.morning_grace_minutes) || 0,
      afternoon_grace_minutes: Number(settings.afternoon_grace_minutes) || 0,
      late_count_limit: Number(settings.late_count_limit) || 0,
      payroll_period_days: Number(settings.payroll_period_days) || 15,
      updated_at: new Date().toISOString(),
    };

    // Check if existing settings row exists
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    let saveError = null;
    if (existing && existing.id) {
      // Use UPDATE to avoid triggering PostgreSQL BEFORE INSERT trigger ("Only one settings row is allowed")
      const { error } = await supabase
        .from("settings")
        .update(payload)
        .eq("id", existing.id);
      saveError = error;
    } else {
      // Only INSERT if table is currently empty
      const { error } = await supabase
        .from("settings")
        .insert({ id: settingId || 1, ...payload });
      saveError = error;
    }

    if (saveError) {
      Swal.fire({
        title: "Save Failed",
        text: saveError.message,
        icon: "error",
        confirmButtonText: "OK",
        customClass: {
          popup:
            "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.15)] !px-8 !py-8 !max-w-[380px]",
          title: "!text-gray-800 !text-[1.35rem] !font-bold !mt-2",
          confirmButton:
            "!bg-red-500 hover:!bg-red-600 !text-white !font-semibold !rounded-lg !px-8 !py-2.5 !text-sm !shadow-none !border-none",
        },
        buttonsStyling: false,
      });
    } else {
      Swal.fire({
        title: "Settings updated!",
        html: `<p style="color:#6b7280;font-size:0.92rem;margin:0">Your work hours settings have been saved successfully.</p>`,
        iconHtml: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" fill="none" style="width:56px;height:56px">
          <circle cx="26" cy="26" r="25" stroke="#237227" stroke-width="2" fill="#f0faf0"/>
          <path d="M14 27l8 8 16-16" stroke="#237227" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        confirmButtonText: "Got it!",
        customClass: {
          popup:
            "!rounded-3xl !shadow-[0_24px_60px_rgba(0,0,0,0.12)] !px-8 !py-8 !max-w-[380px]",
          title: "!text-gray-800 !text-[1.4rem] !font-bold !mt-3 !mb-1",
          htmlContainer: "!mt-1 !mb-4",
          icon: "!border-none !bg-transparent !mb-0",
          confirmButton:
            "!bg-[#237227] !text-white !font-semibold !rounded-lg !px-10 !py-2.5 !text-sm !shadow-none !border-none cursor-pointer",
        },
        buttonsStyling: false,
      });
    }

    setSaving(false);
  };

  return (
    <div className="max-w-[1200px] mx-auto mt-2 mb-10 px-8 py-10 bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.1)] text-gray-800 font-sans">
      {/* Header & Tabs */}
      <div className="text-center mb-10">
        <h1 className="text-[2.6rem] font-bold text-gray-800 m-0 inline-block">Settings</h1>
        <div className="h-1 w-20 bg-[#237227] mx-auto mt-2 mb-6 rounded-sm" />

        {/* Tab Switcher */}
        <div className="inline-flex items-center p-1.5 bg-gray-100 rounded-2xl border border-gray-200 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab("work-hours")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer border-none ${
              activeTab === "work-hours"
                ? "bg-[#237227] text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900 bg-transparent"
            }`}
          >
            <FiClock className="text-base" />
            Work Hours Settings
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("holidays")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer border-none ${
              activeTab === "holidays"
                ? "bg-[#237227] text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900 bg-transparent"
            }`}
          >
            <FiCalendar className="text-base" />
            Manage Holidays
          </button>
        </div>
      </div>

      {/* Tab 1: Work Hours Settings */}
      {activeTab === "work-hours" && (
        <div className="animate-in fade-in duration-200">
          {/* Three cards in a row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Morning Shift Card */}
        <div className="bg-gray-50 rounded-3xl p-6 sm:p-7 border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[2rem] text-amber-500">
              <Icon as={FiSun} size={28} ariaLabel="Morning shift" />
            </span>
            <h2 className="text-2xl font-semibold text-gray-800 m-0">Morning Shift</h2>
          </div>
          <div className="mb-5">
            <label htmlFor="morning_start" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Start Time
            </label>
            <input
              type="time"
              id="morning_start"
              name="morning_start"
              value={settings.morning_start}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base rounded-2xl border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all box-border cursor-pointer"
            />
          </div>
          <div className="mb-5">
            <label htmlFor="morning_end" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              End Time
            </label>
            <input
              type="time"
              id="morning_end"
              name="morning_end"
              value={settings.morning_end}
              onChange={handleChange}
              disabled
              className="w-full px-4 py-3 text-base rounded-2xl border border-gray-300 bg-gray-100 text-gray-500 outline-none box-border cursor-not-allowed"
            />
          </div>
          <div className="mb-5">
            <label htmlFor="morning_grace_minutes" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Grace Period
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                id="morning_grace_minutes"
                name="morning_grace_minutes"
                value={settings.morning_grace_minutes}
                onChange={handleChange}
                min="0"
                step="1"
                className="w-[100px] px-4 py-3 text-base rounded-2xl border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all"
              />
              <span className="text-gray-500 text-sm font-medium">min</span>
            </div>
            <span className="block text-xs text-gray-500 mt-1.5">
              Minutes after start considered on-time
            </span>
          </div>
        </div>

        {/* Afternoon Shift Card */}
        <div className="bg-gray-50 rounded-3xl p-6 sm:p-7 border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[2rem] text-indigo-500">
              <Icon as={FiMoon} size={28} ariaLabel="Afternoon shift" />
            </span>
            <h2 className="text-2xl font-semibold text-gray-800 m-0">Afternoon Shift</h2>
          </div>
          <div className="mb-5">
            <label htmlFor="afternoon_start" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Start Time
            </label>
            <input
              type="time"
              id="afternoon_start"
              name="afternoon_start"
              value={settings.afternoon_start}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base rounded-2xl border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all box-border cursor-pointer"
            />
          </div>
          <div className="mb-5">
            <label htmlFor="afternoon_end" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              End Time
            </label>
            <input
              type="time"
              id="afternoon_end"
              name="afternoon_end"
              value={settings.afternoon_end}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base rounded-2xl border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all box-border cursor-pointer"
            />
          </div>
          <div className="mb-5">
            <label htmlFor="afternoon_grace_minutes" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Grace Period
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                id="afternoon_grace_minutes"
                name="afternoon_grace_minutes"
                value={settings.afternoon_grace_minutes}
                onChange={handleChange}
                min="0"
                step="1"
                className="w-[100px] px-4 py-3 text-base rounded-2xl border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all"
              />
              <span className="text-gray-500 text-sm font-medium">min</span>
            </div>
            <span className="block text-xs text-gray-500 mt-1.5">
              Minutes after start considered on-time
            </span>
          </div>
        </div>

        {/* Late Count Limit & Payroll Length Card */}
        <div className="bg-gray-50 rounded-3xl p-6 sm:p-7 border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[2rem] text-amber-600">
              <Icon as={FiAlertTriangle} size={24} ariaLabel="Warning" />
            </span>
            <h2 className="text-2xl font-semibold text-gray-800 m-0">Late Count Limit</h2>
          </div>
          <div className="mb-5">
            <label htmlFor="late_count_limit" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Limit
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                id="late_count_limit"
                name="late_count_limit"
                value={settings.late_count_limit}
                onChange={handleChange}
                min="1"
                step="1"
                className="w-[100px] px-4 py-3 text-base rounded-2xl border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all"
              />
              <span className="text-gray-500 text-sm font-medium">occurrences</span>
            </div>
            <span className="block text-xs text-gray-500 mt-1.5">Late occurrences before deduction</span>
          </div>

          <div className="flex items-center gap-3 mb-4 mt-2 pt-4 border-t border-gray-200">
            <span className="text-[1.8rem] text-emerald-700">
              <Icon as={FiCalendar} size={24} ariaLabel="Payroll calendar" />
            </span>
            <h2 className="text-xl font-semibold text-gray-800 m-0">Payroll Period Length</h2>
          </div>
          <div className="mb-5">
            <label htmlFor="payroll_period_days" className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Days per Payroll Period
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                id="payroll_period_days"
                name="payroll_period_days"
                value={settings.payroll_period_days}
                onChange={handleChange}
                min="1"
                max="31"
                step="1"
                className="w-[100px] px-4 py-3 text-base rounded-2xl border border-gray-300 bg-white text-gray-800 outline-none focus:border-[#237227] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] transition-all"
              />
              <span className="text-gray-500 text-sm font-medium">days</span>
            </div>
            <span className="block text-xs text-gray-500 mt-1.5">
              Number of days in each payroll period (default: 15)
            </span>
          </div>
        </div>
      </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 flex-wrap items-center mt-8">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-10 py-3.5 text-base font-semibold rounded-lg border-none cursor-pointer transition-all shadow-[0_4px_10px_rgba(0,0,0,0.1)] bg-[#237227] text-white inline-flex items-center justify-center min-w-[200px] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Manage Holidays */}
      {activeTab === "holidays" && (
        <div className="animate-in fade-in duration-200">
          <HolidayManagerGlobal />
        </div>
      )}
    </div>
  );
}
