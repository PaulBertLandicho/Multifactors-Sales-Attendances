import React, { useEffect, useState, useRef, useCallback } from "react";
import offlineQueue from "../utils/offlineQueue";
import { supabase } from "../supabaseClient";
import Swal from "sweetalert2";
import Icon from "../components/Icon";
import { FiTrash2, FiRefreshCw } from "react-icons/fi";

export default function OfflineQueuePanel({ onClose, onQueueChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const q = await offlineQueue.getAllQueue();
      if (!mountedRef.current) return;
      setItems(Array.isArray(q) ? q : []);
      onQueueChange && onQueueChange(Array.isArray(q) ? q.length : 0);
    } catch (e) {
      console.warn("OfflineQueuePanel: load failed", e);
    }
  }, [onQueueChange]);

  useEffect(() => {
    load();
  }, [load]);

  const retryItem = async (it) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const payload = {
        person_id: it.person_id,
        name: it.name,
        department: it.department,
        event: it.event,
        method: it.method || "offline-queue",
        device_time: it.device_time,
        status: it.status,
        photo: it.photo || null,
      };
      const { error } = await supabase.from("attendance").insert(payload);
      if (error) throw error;
      await offlineQueue.removeQueueItem(it.id);
        // attempt to register background sync for remaining queued items
        try { await offlineQueue.requestBackgroundSync(); } catch (e) {}
      await load();
      Swal.fire({ icon: "success", title: "Synced", text: `${it.name} - ${it.event}` });
    } catch (e) {
      console.warn("retryItem failed", e);
      Swal.fire({ icon: "error", title: "Sync Failed", text: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (it) => {
    try {
      await offlineQueue.removeQueueItem(it.id);
      await load();
    } catch (e) {
      console.warn("deleteItem failed", e);
    }
  };

  return (
    <div style={panelStyle.container} role="dialog" aria-modal="true">
      <div style={panelStyle.header}>
        <div style={{ fontWeight: 700 }}>Offline Queue</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={load}
            style={panelStyle.actionBtn}
            title="Refresh"
          >
            <Icon as={FiRefreshCw} />
          </button>
          <button onClick={onClose} style={panelStyle.actionBtn} title="Close">
            Close
          </button>
        </div>
      </div>
      <div style={panelStyle.body}>
        {items.length === 0 && <div style={{ padding: 12 }}>No queued items.</div>}
        {items.map((it) => (
          <div key={it.id} style={panelStyle.row}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{it.name}</div>
              <div style={{ fontSize: 12, color: "#334155" }}>{it.event} • {new Date(it.device_time).toLocaleString()}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => retryItem(it)} disabled={loading} style={panelStyle.retryBtn}>Retry</button>
              <button onClick={() => deleteItem(it)} style={panelStyle.delBtn}><Icon as={FiTrash2} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const panelStyle = {
  container: {
    position: "fixed",
    right: 16,
    top: 72,
    width: 360,
    maxHeight: "70vh",
    background: "#ffffff",
    border: "1px solid #e6e9ef",
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
    overflow: "hidden",
    zIndex: 2147483646,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #eef2f6",
    background: "#f8fafc",
  },
  body: {
    padding: 8,
    overflow: "auto",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px",
    borderBottom: "1px dashed #eef2f6",
  },
  actionBtn: {
    padding: "6px 8px",
    borderRadius: 8,
    border: "none",
    background: "#eef2ff",
    cursor: "pointer",
  },
  retryBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "none",
    background: "#10b981",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  delBtn: {
    padding: "6px 8px",
    borderRadius: 8,
    border: "none",
    background: "#fee2e2",
    cursor: "pointer",
  },
};
