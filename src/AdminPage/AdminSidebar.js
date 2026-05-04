import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

// ✅ Icons
import { FiLogOut, FiUsers, FiHome, FiMenu } from "react-icons/fi";
import {
  MdOutlineAccessTime,
  MdSettings,
  MdPayments,
  MdPersonAddAlt1,
  MdBusiness,
  MdHistory,
} from "react-icons/md";

// ✅ Navigation Items with Icons
const navItems = [
  { label: "Dashboard", path: "/admin/dashboard", icon: <FiHome /> },
  {
    label: "Attendance Records",
    path: "/admin/attendance",
    icon: <MdOutlineAccessTime />,
  },
  {
    label: "Work Hours Settings",
    path: "/admin/settings",
    icon: <MdSettings />,
  },
  { label: "View Payroll", path: "/admin/payroll", icon: <MdPayments /> },
  { label: "Persons", path: "/admin/persons", icon: <FiUsers /> },
  // {
  //   label: "Register Person",
  //   path: "/admin/register-person",
  //   icon: <MdPersonAddAlt1 />,
  // },
  {
    label: "Department rates",
    path: "/admin/department-rates",
    icon: <MdBusiness />,
  },
  {
    label: "Payroll Released Activity Logs",
    path: "/admin/ReleasedPayrollLogs",
    icon: <MdPersonAddAlt1 />,
  },
  {
    label: "Released History Payrolls",
    path: "/admin/released-history",
    icon: <MdHistory />,
  },
];

export default function AdminSidebar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 760 : false
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 760);
      if (window.innerWidth > 760) setIsMobileOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // close drawer on navigation
  useEffect(() => setIsMobileOpen(false), [location.pathname]);

  return (
    <>
      {isMobile && (
        <div style={styles.mobileTopBar}>
          <button
            aria-label="Open menu"
            onClick={() => setIsMobileOpen(true)}
            style={styles.mobileMenuButton}
          >
            <FiMenu />
          </button>
          <div style={styles.mobileTopTitle}>Multifactors Sales</div>
        </div>
      )}

      <div style={isMobile ? (isMobileOpen ? styles.sidebarMobileOpen : { display: "none" }) : styles.sidebar}>
      {/* Logo */}
      <div style={styles.logo}>
        <img
          src={
            process.env.PUBLIC_URL + "/image/logo/multifactors-sales_logo.png"
          }
          alt="Multifactors Sales Logo"
          style={{
            ...styles.logoIcon,
            objectFit: "cover",
            padding: 5,
          }}
        />
<h1 style={{ marginLeft: -5, color: "#237227", fontSize: "1.2rem", width: "100%", fontWeight: 700, }}>Multifactors Sales</h1>
      <span style={{ color: "#6b7280", marginTop: 50, width: "100%", marginLeft: -180, fontSize: "0.7rem", }}>Facial Recognition for Attendances </span>      </div>

      {/* Navigation */}
      <nav style={styles.nav}>
        {navItems.map((item) => {
          // Mark active when current path starts with the item's path
          // This allows child routes (e.g. /admin/dashboard/stats) to keep the parent highlighted
          const isActive = location.pathname.startsWith(item.path);

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
                  e.currentTarget.style.backgroundColor = "#e6f7f0";
                  e.currentTarget.style.color = "#237227";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "#4b5563";
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
          e.currentTarget.style.backgroundColor = "#df4343";
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(220, 38, 38, 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#666666";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <FiLogOut style={styles.logoutIcon} />
        <span>Logout</span>
      </button>
      {isMobile && isMobileOpen && (
        <div role="button" aria-label="Close menu" onClick={() => setIsMobileOpen(false)} style={styles.mobileBackdrop} />
      )}
      </div>
    </>
  );
}

// ✅ Styles
const styles = {
  sidebar: {
    width: 295,
    minHeight: "100vh",
    background: "#ffffff",
    borderRight: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    paddingTop: 20,
    position: "fixed",
    left: 0,
    top: 0,
    zIndex: 100,
    boxShadow: "10px 0 50px rgba(0, 0, 0, 0.07)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },

  logo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "0 24px",
    marginBottom: 40,
  },

  logoIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    background: "#237227",
  },

  logoText: {
    fontSize: "1.2rem",
    fontWeight: 700,
    color: "#1f2937",
  },

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "0 16px",
  },

  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    background: "transparent",
    color: "#4b5563",
    border: "none",
    borderRadius: 8,
    padding: "14px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left",
    width: "100%",
  },

  navItemActive: {
    background: "#237227",
    color: "#ffffff",
    boxShadow: "0 4px 14px rgba(40, 56, 51, 0.4)",
  },

  navIcon: {
    fontSize: "1.4rem",
    minWidth: 24,
    display: "flex",
    alignItems: "center",
  },

  spacer: {
    flex: 1,
  },

  logoutButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    background: "#666666",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    margin: "24px 16px 65px",
    padding: "16px 0",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },

  logoutIcon: {
    fontSize: "1.4rem",
  },
  mobileTopBar: {
    position: "fixed",
    top: 12,
    left: 12,
    right: 12,
    height: 56,
    display: "flex",
    alignItems: "center",
    gap: 12,
    zIndex: 120,
  },
  mobileMenuButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    border: "none",
    background: "#237227",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 20,
  },
  mobileTopTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "#1f2937",
  },
  mobileBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.36)",
    zIndex: 119,
  },
  sidebarMobileOpen: {
    width: 260,
    minHeight: "100vh",
    background: "#ffffff",
    borderRight: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    paddingTop: 20,
    position: "fixed",
    left: 0,
    top: 0,
    zIndex: 120,
    boxShadow: "0 6px 40px rgba(0,0,0,0.4)",
  },
};
