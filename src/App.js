import PayrollPage from './AdminPage/PayrollPage';
// App.js
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

import CameraPlayer from './CameraAttendance/CameraPlayer';
import CameraIframe from './CameraAttendance/CameraIframe';
// import AttendanceTable from './AttendanceTable';
import PersonDetails from './AdminPage/PersonDetails';
import AdminLogin from './AdminPage/AdminLogin';
import AdminSettings from './AdminPage/AdminSettings';
// import PayrollPage from './PayrollPage';
import AttendanceTable from './AdminPage/AttendanceTable';
import AdminSidebar from './AdminPage/AdminSidebar';
import DepartmentRates from './AdminPage/DepartmentRates';
import PersonsTable from './AdminPage/PersonsTable';

function App() {
  const [showModal, setShowModal] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const modalTimerRef = useRef(null);
  const [session, setSession] = useState(() => {
    // Try to get session from localStorage if available
    const stored = localStorage.getItem('sb-session');
    return stored ? JSON.parse(stored) : null;
  });

  // Check for active session on mount and listen for changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) localStorage.setItem('sb-session', JSON.stringify(session));
      else localStorage.removeItem('sb-session');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) localStorage.setItem('sb-session', JSON.stringify(session));
      else localStorage.removeItem('sb-session');
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (modalTimerRef.current) {
        clearTimeout(modalTimerRef.current);
      }
    };
  }, []);

  const handleFaceScan = (scanPayload) => {
    if (!scanPayload || pendingScan || showModal) {
      return;
    }

    if (modalTimerRef.current) {
      clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }

    setPendingScan(scanPayload);
    modalTimerRef.current = setTimeout(() => {
      setShowModal(true);
      modalTimerRef.current = null;
    }, 1600);
  };

  const closeModal = () => {
    if (modalTimerRef.current) {
      clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }
    setShowModal(false);
    setPendingScan(null);
  };

  return (
    <BrowserRouter>
      <div className="App">
        <header className="App-header">
          {!(window.location.pathname.startsWith('/admin')) && (
            <h1>Dahua Camera Viewer</h1>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <>
                  {/* If ?ipcam=1 in URL, use CameraIframe, else use CameraPlayer */}
                  {window.location.search.includes('ipcam=1') ? (
                    <CameraIframe />
                  ) : (
                    <CameraPlayer onFaceScan={handleFaceScan} registrationActive={Boolean(pendingScan) || showModal} />
                  )}
                  {showModal && (
                    <div style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      width: '100vw',
                      height: '100vh',
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1000
                    }}>
                      <div style={{
                        background: '#222',
                        padding: '32px',
                        borderRadius: '8px',
                        minWidth: '340px',
                        boxShadow: '0 2px 16px #0008',
                        position: 'relative'
                      }}>
                        <button onClick={closeModal} style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          fontSize: '1.5rem',
                          cursor: 'pointer'
                        }}>&times;</button>
                        <PersonDetails scanPayload={pendingScan} onComplete={closeModal} />
                      </div>
                    </div>
                  )}
                </>
              }
            />
            <Route path="/admin" element={<AdminLogin />} />
            <Route
              path="/admin/settings"
              element={session ? (
                <div style={{ display: 'flex', minHeight: '100vh' }}>
                  <AdminSidebar onLogout={async () => { await supabase.auth.signOut(); localStorage.removeItem('sb-session'); window.location.href = '/admin'; }} />
                  <div style={{ marginLeft: 220, flex: 1 }}>
                    <AdminSettings />
                  </div>
                </div>
              ) : <Navigate to="/admin" />}
            />
            <Route
              path="/admin/attendance"
              element={session ? (
                <div style={{ display: 'flex', minHeight: '100vh' }}>
                  <AdminSidebar onLogout={async () => { await supabase.auth.signOut(); localStorage.removeItem('sb-session'); window.location.href = '/admin'; }} />
                  <div style={{ marginLeft: 220, flex: 1, padding: 40 }}>
                    <AttendanceTable />
                  </div>
                </div>
              ) : <Navigate to="/admin" />}
            />
            {/* <Route
              path="/admin/payroll"
              element={session ? (
                <div style={{ display: 'flex', minHeight: '100vh' }}>
                  <AdminSidebar onLogout={async () => { await supabase.auth.signOut(); localStorage.removeItem('sb-session'); window.location.href = '/admin'; }} />
                  <div style={{ marginLeft: 220, flex: 1 }}>
                    <PayrollPage />
                  </div>
                </div>
              ) : <Navigate to="/admin" />}
            /> */}
            <Route
              path="/admin/department-rates"
              element={session ? (
                <div style={{ display: 'flex', minHeight: '100vh' }}>
                  <AdminSidebar onLogout={async () => { await supabase.auth.signOut(); localStorage.removeItem('sb-session'); window.location.href = '/admin'; }} />
                  <div style={{ marginLeft: 220, flex: 1 }}>
                    <DepartmentRates />
                  </div>
                </div>
              ) : <Navigate to="/admin" />}
            />
            <Route
              path="/admin/persons"
              element={session ? (
                <div style={{ display: 'flex', minHeight: '100vh' }}>
                  <AdminSidebar onLogout={async () => { await supabase.auth.signOut(); localStorage.removeItem('sb-session'); window.location.href = '/admin'; }} />
                  <div style={{ marginLeft: 220, flex: 1, padding: 40 }}>
                    <PersonsTable />
                  </div>
                </div>
              ) : <Navigate to="/admin" />}
            />
            <Route
              path="/admin/payroll"
              element={session ? (
                <div style={{ display: 'flex', minHeight: '100vh' }}>
                  <AdminSidebar onLogout={async () => { await supabase.auth.signOut(); localStorage.removeItem('sb-session'); window.location.href = '/admin'; }} />
                  <div style={{ marginLeft: 220, flex: 1 }}>
                    <PayrollPage />
                  </div>
                </div>
              ) : <Navigate to="/admin" />}
            />
          </Routes>
        </header>
      </div>
    </BrowserRouter>
  );
}

export default App;