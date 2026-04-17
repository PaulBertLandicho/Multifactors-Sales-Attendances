import PersonRegistration from "./AdminPage/PersonRegistration";
import PayrollPage from "./AdminPage/PayrollPage";
// App.js
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useLoading } from "./LoadingContext";
import { supabase } from "./supabaseClient";

import CameraPlayer from "./CameraAttendance/CameraPlayer";
import AdminLogin from "./AdminPage/AdminLogin";
import Dashboard from "./AdminPage/Dashboard";
import ReleasedHistoryPayroll from "./AdminPage/ReleasedHistoryPayroll";
import ReleasedPayrollLogs from "./AdminPage/ReleasedPayrollLogs";
import AdminSettings from "./AdminPage/AdminSettings";
import AttendanceTable from "./AdminPage/AttendanceTable";
import AdminSidebar from "./AdminPage/AdminSidebar";
import DepartmentRates from "./AdminPage/DepartmentRates";
import PersonsTable from "./AdminPage/PersonsTable";

function App() {
  const modalTimerRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [session, setSession] = useState(() => {
    // Try to get session from localStorage if available
    const stored = localStorage.getItem("sb-session");
    return stored ? JSON.parse(stored) : null;
  });

  // Check for active session on mount and listen for changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) localStorage.setItem("sb-session", JSON.stringify(session));
      else localStorage.removeItem("sb-session");
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session)
          localStorage.setItem("sb-session", JSON.stringify(session));
        else localStorage.removeItem("sb-session");
      }
    );
    return () => listener?.subscription.unsubscribe();
  }, []);

  // show global loading on navigation
  const { setLoading } = useLoading();
  const location = useLocation();
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

  return (
      <div className="App">
        <header className="App-header">
          {!window.location.pathname.startsWith("/admin") && (
            <h1 style={styles.headerTitle}>Employee Attendance Camera</h1>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <div style={{ maxWidth: 900, margin: "0 auto" }}>
                  {cameraActive ? (
                    <CameraPlayer />
                  ) : (
                    <div
                      style={{
                        marginTop: 24,
                        padding: "40px 24px",
                        borderRadius: 24,
                        background: "#0b1120",
                        color: "#e5e7eb",
                        textAlign: "center",
                      }}
                    >
                      <p style={{ marginBottom: 12, fontSize: 15 }}>
                        Camera is currently off. Click below to open the camera.
                      </p>
                      <button
                        type="button"
                        onClick={() => setCameraActive(true)}
                        style={{
                          padding: "10px 24px",
                          borderRadius: 999,
                          border: "1px solid #237227",
                          background: "#237227",
                          color: "#ffffff",
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        Open Camera
                      </button>
                    </div>
                  )}
                  {cameraActive && (
                    <div style={{ marginTop: 12, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => setCameraActive(false)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: "1px solid #d1d5db",
                          background: "#f9fafb",
                          color: "#4b5563",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Close Camera
                      </button>
                    </div>
                  )}
                </div>
              }
            />
            <Route
              path="/admin/register-person"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <PersonRegistration />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <Dashboard />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route path="/admin" element={session ? <Navigate to="/admin/dashboard" /> : <AdminLogin />} />
            <Route
              path="/admin/settings"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <AdminSettings />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route
              path="/admin/attendance"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <AttendanceTable />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route
              path="/admin/department-rates"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <DepartmentRates />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route
              path="/admin/persons"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <PersonsTable />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route
              path="/admin/payroll"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <PayrollPage />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route
              path="/admin/released-history"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <ReleasedHistoryPayroll />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
            <Route
              path="/admin/ReleasedPayrollLogs"
              element={
                session ? (
                  <div style={styles.adminLayout}>
                    <AdminSidebar
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("sb-session");
                        window.location.href = "/admin";
                      }}
                    />
                    <div style={styles.adminContent}>
                      <ReleasedPayrollLogs />
                    </div>
                  </div>
                ) : (
                  <Navigate to="/admin" />
                )
              }
            />
          </Routes>
        </header>
      </div>
  );
}

// Light theme styles with green accent
const styles = {
  headerTitle: {
    color: "#237227",
    fontSize: "2rem",
    fontWeight: 600,
    textAlign: "center",
    margin: "20px 0",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modalContent: {
    background: "#ffffff",
    padding: "32px",
    borderRadius: "28px",
    minWidth: "340px",
    maxWidth: "500px",
    width: "90%",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
    border: "1px solid #e5e7eb",
    position: "relative",
  },
  modalClose: {
    position: "absolute",
    top: "12px",
    right: "16px",
    background: "transparent",
    border: "none",
    color: "#6b7280",
    fontSize: "1.8rem",
    cursor: "pointer",
    lineHeight: 1,
    transition: "color 0.2s",
  },
  adminLayout: {
    display: "flex",
    minHeight: "100vh",
    background: "#ffffff",
  },
  adminContent: {
    marginLeft: "280px", // matches sidebar width
    flex: 1,
    padding: "40px",
    background: "#ffffff",
  },
};

export default App;
