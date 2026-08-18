import React, { useEffect, useState } from "react";
import {
  FaEnvelope,
  FaLock,
  FaTimes,
  FaSignInAlt,
  FaUserShield,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import { supabase } from "../supabaseClient";
import {
  SECRETARY_ROLE,
  getLoginRedirectPath,
  getSessionRole,
} from "../utils/authRoles";

export default function StaffLoginModal({ open, onClose, onStaffLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setError("");
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!supabase || !supabase.auth) {
        setError("Supabase client is not configured. Please check environment variables.");
        setLoading(false);
        return;
      }

      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError) {
        setError(signInError.message || "Unable to sign in.");
        setLoading(false);
        return;
      }

      const role = getSessionRole(data);
      if (role !== SECRETARY_ROLE) {
        if (supabase && supabase.auth) {
          await supabase.auth.signOut();
        }
        setError(
          role === "admin"
            ? "This is the admin account. Please use secretary account instead."
            : "That account does not have secretary access yet.",
        );
        setLoading(false);
        return;
      }

      setMessage("Signed in successfully.");
      if (typeof onStaffLoggedIn === "function") {
        onStaffLoggedIn({
          email: email.trim(),
          redirectTo: getLoginRedirectPath(data),
        });
      }
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-[rgba(2,6,23,0.68)] backdrop-blur-[6px] flex items-center justify-center z-[200000] p-4"
      onClick={onClose}
      role="presentation"
    >
      {/* Modal Card */}
      <div
        className="w-full max-w-[520px] bg-gradient-to-b from-white to-[#f8fafc] rounded-3xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] border border-slate-200/20 px-6 pt-7 pb-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-gray-200 text-gray-900 border-none cursor-pointer flex items-center justify-center hover:bg-gray-300 transition-colors"
          aria-label="Close staff login modal"
        >
          <FaTimes />
        </button>

        {/* Badge */}
        <div className="inline-flex items-center gap-1 px-3.5 py-2 rounded-full bg-[#237227] text-white text-xs font-extrabold tracking-wide uppercase mb-3.5">
          <FaUserShield className="mr-2" />
          Secretary Login
        </div>

        {/* Title */}
        <h2 className="m-0 text-[26px] leading-tight text-slate-900">
          Open the attendance account
        </h2>

        {/* Subtitle */}
        <p className="mt-2.5 mb-5 text-slate-500 leading-relaxed text-sm">
          Sign in with the secretary email and password. Admin accounts must use
          the Admin Login page.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          {/* Email */}
          <label className="text-[13px] font-bold text-slate-700">
            Attendance email
          </label>
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[14px] border border-slate-300 bg-white">
            <FaEnvelope className="text-slate-500 flex-shrink-0" />
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="attendances@gmail.com"
              required
              className="flex-1 border-none outline-none text-[15px] bg-transparent text-gray-900 placeholder-gray-400"
              style={{ border: "none", outline: "none", boxShadow: "none" }}
            />
          </div>

          {/* Password */}
          <label className="text-[13px] font-bold text-slate-700">
            Password
          </label>
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[14px] border border-slate-300 bg-white">
            <FaLock className="text-slate-500 flex-shrink-0" />
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter attendance password"
              required
              className="flex-1 border-none outline-none text-[15px] bg-transparent text-gray-900 placeholder-gray-400"
              style={{ border: "none", outline: "none", boxShadow: "none" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer p-0 flex items-center"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-red-100 text-red-800 text-[13px]">
              {error}
            </div>
          )}

          {/* Success Message */}
          {message && (
            <div className="px-3 py-2.5 rounded-xl bg-green-100 text-green-800 text-[13px]">
              {message}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2.5 inline-flex items-center justify-center gap-2 px-[18px] py-3 rounded-[14px] border-none bg-[#237227] text-white text-[15px] font-bold cursor-pointer shadow-[0_14px_30px_rgba(35,114,39,0.25)] hover:bg-[#1a5a1d] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FaSignInAlt />
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
