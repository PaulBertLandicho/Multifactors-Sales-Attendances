import React, { createContext, useContext, useState } from "react";

const LoadingContext = createContext({ loading: false, setLoading: () => {} });

export function LoadingProvider({ children }) {
  const [loading, setLoading] = useState(false);

  return (
    <LoadingContext.Provider value={{ loading, setLoading }}>
      {children}
      {loading && (
        <div
          aria-hidden={false}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.15)",
            zIndex: 9999,
          }}
        >
          <style>{`@keyframes lc-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {/* thinner ring: smaller outer size and larger inner cutout */}
            {/* thinnest ring: outer 56px, inner inset 6px => ring thickness ~6px */}
            <div style={{ width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="56" height="56" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <g style={{ transformOrigin: "32px 32px", animation: "lc-spin 1s linear infinite" }}>
                  {/* outer dotted ring */}
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#e5e7eb" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
                  {/* inner rotating arc */}
                  <circle cx="32" cy="32" r="18" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeDasharray="36 113" transform="rotate(-90 32 32)" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  return useContext(LoadingContext);
}

export default LoadingContext;
