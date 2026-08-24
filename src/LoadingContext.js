import React, { createContext, useContext, useState } from "react";
import { FiLoader } from "react-icons/fi";

const LoadingContext = createContext({ loading: false, setLoading: () => {} });

export function LoadingProvider({ children }) {
  const [loading, setLoading] = useState(false);

  return (
    <LoadingContext.Provider value={{ loading, setLoading }}>
      {children}
      {loading && (
        <div
          aria-hidden={false}
          className="fixed inset-0 flex items-center justify-center bg-black/15 z-[9999]"
        >
          <div className="flex flex-col items-center justify-center">
            <FiLoader className="text-[#237227] text-5xl animate-spin" />
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
