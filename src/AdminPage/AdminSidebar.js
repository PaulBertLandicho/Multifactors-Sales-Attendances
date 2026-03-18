import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Attendance Records', path: '/admin/attendance' },
  { label: 'Work Hours Settings', path: '/admin/settings' },
  // { label: 'View Payroll', path: '/admin/payroll' },
  { label: 'View Payroll', path: '/admin/payroll' },
  { label: 'Persons', path: '/admin/persons' },
];

function AdminSidebar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{
      width: 280,
      minHeight: '100vh',
      background: '#181a20',
      borderRight: '1px solid #23272f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      paddingTop: 32,
      position: 'fixed',
      left: 0,
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ fontWeight: 700, fontSize: 22, color: '#fff', textAlign: 'center', marginBottom: 32 }}>
        Multifactors Sales
      </div>
      {navItems.map(item => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          style={{
            background: location.pathname === item.path ? 'rgb(16 185 129)' : 'transparent',
            color: location.pathname === item.path ? '#fff' : '#b0b3b8',
            border: 'none',
            borderRadius: 6,
            margin: '0 16px 12px 16px',
            padding: '14px 0',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {item.label}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button
        onClick={onLogout}
        style={{
          background: '#e53935',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          margin: '24px 16px 32px 16px',
          padding: '14px 0',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Logout
      </button>
    </div>
  );
}

export default AdminSidebar;
