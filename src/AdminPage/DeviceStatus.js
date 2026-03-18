import { useEffect, useState } from 'react';

export default function DeviceStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        setLoading(true);
        const res = await fetch('http://localhost:4000/api/device/status');
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = await res.json();
        setStatus(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !status && !error) {
    return <p>Checking device status...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error: {error}</p>;
  }

  if (!status) {
    return <p>No status data.</p>;
  }

  return (
    <div>
      <p>Device IP: {status.deviceIp}</p>
      <p>
        Connection: {' '}
        <strong style={{ color: status.online ? 'limegreen' : 'red' }}>
          {status.online ? 'Online' : 'Offline'}
        </strong>
      </p>
      {status.statusCode && <p>HTTP Status Code: {status.statusCode}</p>}
      {status.error && <p>Error: {status.error}</p>}
    </div>
  );
}

