import PersonRegistration from "./AdminPage/PersonRegistration";
import PayrollPage from "./AdminPage/PayrollPage";
// App.js
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useLoading } from "./LoadingContext";
import { supabase } from "./supabaseClient";

import CameraPlayer from "./CameraAttendance/CameraPlayer";
import AdminLogin from "./AdminPage/AdminLogin";
import { FiLogIn, FiCamera, FiShield } from "react-icons/fi";
import Dashboard from "./AdminPage/Dashboard";
import ReleasedHistoryPayroll from "./AdminPage/ReleasedHistoryPayroll";
import ReleasedPayrollLogs from "./AdminPage/ReleasedPayrollLogs";
import AdminSettings from "./AdminPage/AdminSettings";
import AttendanceTable from "./AdminPage/AttendanceTable";
import AdminSidebar from "./AdminPage/AdminSidebar";
import DepartmentRates from "./AdminPage/DepartmentRates";
import PersonsTable from "./AdminPage/PersonsTable";
import StaffLoginModal from "./AdminPage/StaffLoginModal";
import {
  ADMIN_ROLE,
  STAFF_ROLES,
  getLoginRedirectPath,
  getSessionRole,
  hasAllowedRole,
} from "./utils/authRoles";

function App() {
  const modalTimerRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [session, setSession] = useState(() => {
    // Try to get session from localStorage if available
    const stored = localStorage.getItem("sb-session");
    return stored ? JSON.parse(stored) : null;
  });

  // Check for active session on mount and listen for changes
  useEffect(() => {
    if (!supabase || !supabase.auth) return;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        if (session) localStorage.setItem("sb-session", JSON.stringify(session));
        else localStorage.removeItem("sb-session");
      })
      .catch((err) => {
        console.warn("Session check error:", err);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session)
          localStorage.setItem("sb-session", JSON.stringify(session));
        else localStorage.removeItem("sb-session");
      },
    );
    return () => listener?.subscription?.unsubscribe();
  }, []);

  // detect mobile viewport to conditionally hide the header
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 600 : false,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 600);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // show global loading on navigation
  const { setLoading } = useLoading();
  const location = useLocation();
  const navigate = useNavigate();
  // const isAdminPath = location.pathname.startsWith("/admin");
  const isCameraPath = location.pathname === "/" || location.pathname === "";
  const isAdminLoginPath = location.pathname === "/admin";
  const currentRole = getSessionRole(session);
  const hasStaffAccess = hasAllowedRole(session, STAFF_ROLES);

  useEffect(() => {
    if (!session) return;
    if (!hasStaffAccess) {
      if (supabase && supabase.auth) {
        supabase.auth.signOut().finally(() => {
          localStorage.removeItem("sb-session");
          setSession(null);
        });
      } else {
        localStorage.removeItem("sb-session");
        setSession(null);
      }
    }
  }, [hasStaffAccess, session]);

  const handleAdminLogout = async () => {
    if (supabase && supabase.auth) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Sign out error:", err);
      }
    }
    localStorage.removeItem("sb-session");
    window.location.href = "/admin";
  };

  const ProtectedRoute = ({ allowedRoles = STAFF_ROLES, children }) =>
    hasAllowedRole(session, allowedRoles) ? (
      children
    ) : (
      <Navigate to="/admin" replace />
    );

  useEffect(() => {
    // show overlay immediately on navigation
    setLoading(true);
    // hide after a small delay — components that fetch data can still toggle this off
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, [location.pathname, setLoading]);

  useEffect(() => {
    const timer = modalTimerRef.current;
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  // Removed unused: handleFaceScan, closeModal

  /* ── Reusable admin layout wrapper ── */
  const AdminLayout = ({ children }) => (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar role={currentRole} onLogout={handleAdminLogout} />
      <div className={`flex-1 p-10 bg-white ${isMobile ? "ml-0" : "ml-[280px]"}`}>
        {children}
      </div>
    </div>
  );

  return (
    <div className="App">
      <header className="App-header">
        {/* Top header bar — only on camera / admin-login paths, desktop only */}
        {(isCameraPath || isAdminLoginPath) && !isMobile && (
          <div className="w-full bg-[#f9fafc] border-b border-[#eef2f6] py-4 shadow-[0_6px_18px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between w-full px-6 py-2">

              {/* LEFT — Logo + Text */}
              <div className="flex items-center gap-3">
                <img
                  src="/image/logo-final.jpg"
                  alt="Multifactors Sales Logo"
                  className="w-40 h-auto bg-white"
                />
                <div className="flex flex-col">
                  <h2 className="text-[#000000] text-xl font-bold leading-tight m-0">
                    Face Recognition Time and Attendance
                  </h2>
                </div>
              </div>

              {/* RIGHT — Button */}
              {isAdminLoginPath ? (
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-[#237227] bg-[#237227] text-white text-sm font-bold cursor-pointer  transition-colors"
                >
                  <FiCamera className="align-middle" />
                  Attendance Camera
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/admin")}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-[#237227] bg-[#237227] text-white text-sm font-bold cursor-pointer transition-colors"
                  >
                    <FiLogIn className="align-middle" />
                    Admin Login
                  </button>
                </div>
              )}

            </div>
          </div>
        )}


        <Routes>
          {/* Camera / Home route */}
          <Route
            path="/"
            element={
              <div className="max-w-[900px] mx-auto">
                {hasStaffAccess ? (
                  cameraActive ? (
                    <CameraPlayer />
                  ) : (
                    <div className="mt-6 px-6 py-16 rounded-3xl bg-white border border-gray-200 shadow-sm text-center">
                      {/* Camera Icon */}
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#237227] shadow-sm mb-6">
                        <FiCamera className="text-white" size={34} />
                      </div>

                      {/* Heading */}
                      <h2 className="text-[1.45rem] font-bold text-gray-800 m-0 mb-2">
                        Camera is Off
                      </h2>

                      {/* Subtext */}
                      <p className="text-gray-500 text-[0.95rem] font-normal max-w-[320px] mx-auto mb-8 leading-relaxed">
                        The camera is currently inactive. Open it to start recording attendance via face recognition.
                      </p>

                      {/* CTA Button */}
                      <button
                        type="button"
                        onClick={() => setCameraActive(true)}
                        className="inline-flex items-center gap-2.5 px-8 py-3 rounded-full bg-[#237227] text-white text-sm font-semibold cursor-pointer border-none"
                      >
                        <FiCamera size={16} />
                        Open Camera
                      </button>
                    </div>
                  )
                ) : (
                  /* Staff Gate Card */
                  <div className="mt-6 px-6 py-16 rounded-3xl bg-white border border-gray-200 shadow-sm text-center">
                    {/* Shield Icon */}
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#237227] shadow-sm mb-6">
                      <FiShield className="text-white" size={34} />
                    </div>

                    {/* Heading */}
                    <h2 className="text-[1.45rem] font-bold text-gray-800 m-0 mb-2">
                      Sign in to Record Attendance
                    </h2>

                    {/* Subtext */}
                    <p className="text-gray-500 text-[0.95rem] font-normal max-w-[320px] mx-auto mb-8 leading-relaxed">
                      Please log in with your staff account to start recording attendance.
                    </p>

                    {/* CTA Button */}
                    <button
                      type="button"
                      onClick={() => setShowStaffLogin(true)}
                      className="inline-flex items-center gap-2.5 px-8 py-3 rounded-full bg-[#237227] text-white text-sm font-semibold cursor-pointer border-none"
                    >
                      <FiLogIn size={16} />
                      Open Attendance Login
                    </button>
                  </div>
                )}

                {cameraActive && hasStaffAccess && (
                  <div className="mt-3 text-right">
                    <button
                      type="button"
                      onClick={() => setCameraActive(false)}
                      className="px-3 py-1.5 rounded-full border border-gray-300 bg-gray-50 text-gray-600 cursor-pointer text-xs hover:bg-gray-100 transition-colors"
                    >
                      Close Camera
                    </button>
                  </div>
                )}
              </div>
            }
          />

          {/* Staff Login route */}
          <Route
            path="/staff-login"
            element={
              <div className="max-w-[900px] mx-auto">
                <div className="mt-6 px-7 py-10 rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#111827] text-[#e5e7eb] text-center border border-white/[0.08] shadow-sm">
                  <div className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-[rgba(35,114,39,0.16)] text-[#86efac] text-xs font-bold tracking-wide uppercase mb-3.5">
                    Staff login
                  </div>
                  <h2 className="m-0 text-[26px] leading-snug text-white">
                    Open the secretary account
                  </h2>
                  <p className="max-w-[560px] mx-auto mt-3.5 mb-6 text-[15px] leading-relaxed text-slate-300">
                    Use the popup login to sign in with the staff email and password.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowStaffLogin(true)}
                    className="px-5 py-3 rounded-full border border-[#237227] bg-[#237227] text-white text-sm font-bold cursor-pointer shadow-sm transition-colors"
                  >
                    Open Staff Login
                  </button>
                </div>
              </div>
            }
          />

          {/* Admin Login */}
          <Route
            path="/admin"
            element={
              currentRole === ADMIN_ROLE ? (
                <Navigate to={getLoginRedirectPath(session)} />
              ) : (
                <AdminLogin />
              )
            }
          />

          {/* Protected Admin Routes */}
          <Route
            path="/admin/register-person"
            element={
              <ProtectedRoute allowedRoles={[ADMIN_ROLE]}>
                <AdminLayout><PersonRegistration /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <AdminLayout><Dashboard /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={[ADMIN_ROLE]}>
                <AdminLayout><AdminSettings /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/attendance"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <AdminLayout><AttendanceTable /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/department-rates"
            element={
              <ProtectedRoute allowedRoles={[ADMIN_ROLE]}>
                <AdminLayout><DepartmentRates /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/persons"
            element={
              <ProtectedRoute allowedRoles={[ADMIN_ROLE]}>
                <AdminLayout><PersonsTable /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/payroll"
            element={
              <ProtectedRoute allowedRoles={[ADMIN_ROLE]}>
                <AdminLayout><PayrollPage /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/released-history"
            element={
              <ProtectedRoute allowedRoles={[ADMIN_ROLE]}>
                <AdminLayout><ReleasedHistoryPayroll /></AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/ReleasedPayrollLogs"
            element={
              <ProtectedRoute allowedRoles={[ADMIN_ROLE]}>
                <AdminLayout><ReleasedPayrollLogs /></AdminLayout>
              </ProtectedRoute>
            }
          />
        </Routes>

        <StaffLoginModal
          open={showStaffLogin}
          onClose={() => setShowStaffLogin(false)}
          onStaffLoggedIn={() => setShowStaffLogin(false)}
        />

        {/* Footer */}
        {(isCameraPath || isAdminLoginPath) && !isMobile && (
          <footer className="fixed bottom-0 left-0 right-0 z-50 bg-[#f9fafc] border-t border-[#eef2f6] py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between w-full px-6">
              {/* Copyright */}
              <div className="text-[#8a96a3] text-xs">
                &copy; {new Date().getFullYear()} Multifactors Sales Corporation. All rights reserved.
              </div>
            </div>
          </footer>
        )}
      </header>
    </div>
  );
}

export default App;
