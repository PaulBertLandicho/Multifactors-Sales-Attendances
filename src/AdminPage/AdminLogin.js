import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  FaEye,
  FaEyeSlash,
  FaEnvelope,
  FaLock,
  FaSignInAlt,
} from "react-icons/fa";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!supabase || !supabase.auth) {
        setError(
          "Supabase client is not configured. Please check environment variables."
        );
        setLoading(false);
        return;
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }

      // After successful admin login, navigate to dashboard
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-1 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-[420px] bg-white rounded-2xl p-8 shadow-xl shadow-slate-200/60 border border-gray-100">
        
        {/* Header Section */}
        <div className="flex flex-col items-center gap-2 mb-6 text-center pt-1">
          <div aria-hidden="true" className="mb-1">
            <img
              src="/image/logo/LOGO_3.png"
              alt="Multifactors Sales Logo"
              className="w-250 h-150 object-contain mx-auto drop-shadow-sm"
            />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 m-0 tracking-tight">
            Welcome back
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Sign in to access the admin dashboard
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          
          {/* Email Input */}
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 transition-colors focus-within:border-[#237227]">
              <FaEnvelope className="text-gray-400 mr-2.5 text-base flex-shrink-0" />
              <input
                type="email"
                value={email}
                placeholder="you@company.com"
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none text-gray-900 text-sm placeholder-gray-400 font-medium"
                style={{ outline: "none", boxShadow: "none" }}
                aria-label="Email"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 transition-colors ">
              <FaLock className="text-gray-400 mr-2.5 text-base flex-shrink-0" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder="Enter your password"
                onChange={(e) => setPassword(e.target.value)}
                required
                className="flex-1 w-full pr-8 bg-transparent border-none outline-none  text-gray-900 text-sm placeholder-gray-400 font-medium"
                style={{ outline: "none", boxShadow: "none" }}
                aria-label="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 text-gray-400 hover:text-gray-700 focus:outline-none transition-colors p-1 cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {/* Form Actions (Remember Me & Forgot Password) */}
          <div className="flex justify-between items-center text-sm mt-1">
            <label className="flex items-center gap-2 text-gray-600 cursor-pointer hover:text-gray-900 select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 text-[#237227] bg-gray-50 border-gray-300 rounded focus:ring-[#237227] cursor-pointer accent-[#237227]"
              />
              <span>Remember me</span>
            </label>
            <button
              type="button"
              onClick={() => {
                // placeholder: implement forgot password flow
              }}
              className="text-sm text-[#237227] hover:text-[#1a551d] font-medium bg-transparent border-none p-0 cursor-pointer transition-colors hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 border border-red-200 py-2.5 px-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full flex items-center justify-center gap-2 bg-[#237227] hover:bg-[#1a551d] active:bg-[#154617] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl shadow-md shadow-[#237227]/20 hover:shadow-lg hover:shadow-[#237227]/30 transition-all cursor-pointer"
          >
            {loading ? (
              "Logging in..."
            ) : (
              <>
                <FaSignInAlt className="text-base" />
                <span>Sign in</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}