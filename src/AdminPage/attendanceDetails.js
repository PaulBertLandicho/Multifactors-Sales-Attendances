// Utility to generate detailed attendance for PayslipModal
// Returns [{ date, morningIn, morningOut, afternoonIn, afternoonOut, lateCount, lateDetails }]
export function getDetailedAttendance(attendance, personId, settings = {}) {
  // Group attendance by date
  const byDate = {};
  attendance
    .filter(r => r.person_id === personId)
    .forEach(r => {
      const dt = new Date(r.device_time);
      const dateStr = dt.toLocaleDateString();
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push({ ...r, dt });
    });


  const morningStart = settings.morning_start || '08:00';
  const morningLateMinutes = Number(settings.morning_late_minutes ?? settings.morning_grace_minutes ?? 0);
  const afternoonStart = settings.afternoon_start || '13:00';
  const afternoonLateMinutes = Number(settings.afternoon_late_minutes ?? settings.afternoon_grace_minutes ?? 0);

  function isLate(dt, session) {
    // Returns true if dt is after (start + late_minutes)
    const mins = dt.getHours() * 60 + dt.getMinutes();
    if (session === 'morning') {
      const [h, m] = morningStart.split(':').map(Number);
      const startMins = h * 60 + m;
      return mins > (startMins + morningLateMinutes);
    } else {
      const [h, m] = afternoonStart.split(':').map(Number);
      const startMins = h * 60 + m;
      return mins > (startMins + afternoonLateMinutes);
    }
  }

  return Object.entries(byDate).map(([date, recs]) => {
    // Sort by time
    recs.sort((a, b) => a.dt - b.dt);
    // Find morning/afternoon in/out
    let morningIn = null, morningOut = null, afternoonIn = null, afternoonOut = null;
    let morningInStatus = null, afternoonInStatus = null;
    let lateCount = 0;
    let lateDetails = [];
    recs.forEach(r => {
      const hour = r.dt.getHours();
      const timeStr = r.dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (hour < 12) {
        if (r.event === 'time-in' && !morningIn) {
          morningIn = timeStr;
          if (r.status === 'late' || isLate(r.dt, 'morning')) {
            morningInStatus = 'late';
            lateCount++;
            lateDetails.push({ session: 'Morning In', time: timeStr, status: 'late' });
          } else {
            morningInStatus = 'on-time';
          }
        } else if (r.event === 'time-out') {
          morningOut = timeStr;
        }
      } else {
        if (r.event === 'time-in' && !afternoonIn) {
          afternoonIn = timeStr;
          if (r.status === 'late' || isLate(r.dt, 'afternoon')) {
            afternoonInStatus = 'late';
            lateCount++;
            lateDetails.push({ session: 'Afternoon In', time: timeStr, status: 'late' });
          } else {
            afternoonInStatus = 'on-time';
          }
        } else if (r.event === 'time-out') {
          afternoonOut = timeStr;
        }
      }
    });
    return {
      date,
      morningIn,
      morningOut,
      afternoonIn,
      afternoonOut,
      morningInStatus,
      afternoonInStatus,
      lateCount,
      lateDetails
    };
  });
}
