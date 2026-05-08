import { useEffect, useState } from "react";
import { useLoading } from "../LoadingContext";

export default function DeviceStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const { setLoading } = useLoading();

  useEffect(() => {
    async function fetchStatus() {
      setLoading(true);
      try {
        const res = await fetch("http://localhost:4000/api/device/status");
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        // Validate content-type before parsing as JSON
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const txt = await res.text();
          throw new Error(`Expected JSON but got ${contentType || 'unknown'}: ${txt.substring(0, 100)}`);
        }
        const data = await res.json().catch((err) => {
          throw new Error(`Failed to parse JSON: ${err.message}`);
        });
        setStatus(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) fetchStatus(); }, 30_000); // 30s
    return () => clearInterval(interval);
  }, [setLoading]);

  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!status) return <p>No status data.</p>;

  return (
    <div>
      <p>Device IP: {status.deviceIp}</p>
      <p>
        Connection: {" "}
        <strong style={{ color: status.online ? "limegreen" : "red" }}>
          {status.online ? "Online" : "Offline"}
        </strong>
      </p>
      {status.statusCode && <p>HTTP Status Code: {status.statusCode}</p>}
      {status.error && <p>Error: {status.error}</p>}
    </div>
  );
}
