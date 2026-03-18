import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ✅ Icons
import { FiLogOut, FiUsers } from 'react-icons/fi';
import { MdOutlineAccessTime, MdSettings, MdPayments } from 'react-icons/md';

// ✅ Navigation Items with Icons
const navItems = [
  { label: 'Attendance Records', path: '/admin/attendance', icon: <MdOutlineAccessTime /> },
  { label: 'Work Hours Settings', path: '/admin/settings', icon: <MdSettings /> },
  { label: 'View Payroll', path: '/admin/payroll', icon: <MdPayments /> },
  { label: 'Persons', path: '/admin/persons', icon: <FiUsers /> },
];

export default function AdminSidebar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={styles.sidebar}>
      
      {/* Logo */}
      <div style={styles.logo}>
        <img
          src={process.env.PUBLIC_URL + '/image/logo/multifactorssales_logo.png'}
          alt="Multifactors Sales Logo"
          style={{
            ...styles.logoIcon,
            objectFit: 'cover',
            padding: 6,
          }}
        />
        <span style={styles.logoText}>Multifactors Sales</span>
      </div>

      {/* Navigation */}
      <nav style={styles.nav}>
        {navItems.map(item => {
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '#e6f7f0';
                  e.currentTarget.style.color = '#10b981';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#4b5563';
                }
              }}
            >
              {/* ✅ ICON */}
              <span style={styles.navIcon}>{item.icon}</span>

              {/* TEXT */}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={styles.spacer} />

      {/* Logout */}
      <button
        onClick={onLogout}
        style={styles.logoutButton}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#df4343';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(220, 38, 38, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#666666';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <FiLogOut style={styles.logoutIcon} />
        <span>Logout</span>
      </button>

    </div>
  );
}

// ✅ Styles
const styles = {
  sidebar: {
    width: 295,
    minHeight: '100vh',
    background: '#ffffff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 20,
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 100,
    boxShadow: '10px 0 50px rgba(0, 0, 0, 0.07)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 24px',
    marginBottom: 40,
  },

  logoIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    background: '#10b981',
  },

  logoText: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: '#1f2937',
  },

  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0 16px',
  },

  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'transparent',
    color: '#4b5563',
    border: 'none',
    borderRadius: 8,
    padding: '14px 20px',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left',
    width: '100%',
  },

  navItemActive: {
    background: '#10b981',
    color: '#ffffff',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
  },

  navIcon: {
    fontSize: '1.4rem',
    minWidth: 24,
    display: 'flex',
    alignItems: 'center',
  },

  spacer: {
    flex: 1,
  },

  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    background: '#666666',
    color: '#fff',
    border: 'none',
    borderRadius: 14,
    margin: '24px 16px 65px',
    padding: '16px 0',
    fontSize: '1.1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  logoutIcon: {
    fontSize: '1.4rem',
  },
};