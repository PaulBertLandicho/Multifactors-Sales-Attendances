export function calculatePayroll(attendance = [], persons = [], deptRates = [], settings = {}) {
  const morningStart = settings.morning_start || '08:00';
  const afternoonStart = settings.afternoon_start || '13:00';
  const morningGrace = Number(settings.morning_grace_minutes) || 0;
  const afternoonGrace = Number(settings.afternoon_grace_minutes) || 0;
  const lateAttemptLimit = Number(settings.late_count_limit) || 5; // number of late occurrences before deduction

  return persons.map(person => {
    // Filter attendance for this person
    const personAttendance = attendance
      .filter(a => a.person_id === person.id && a.event === 'time-in')
      .map(a => new Date(a.device_time));

    // Get department rates
    const deptRate = deptRates.find(d =>
      (d.department || '').toLowerCase().trim() === (person.department || '').toLowerCase().trim()
    ) || {};

    // Apply deductions based on checkbox
    const sss = person.sss ? Number(deptRate.sss || 0) : 0;
    const pag_ibig = person.pag_ibig ? Number(deptRate.pag_ibig || 0) : 0;
    const philhealth = person.philhealth ? Number(deptRate.philhealth || 0) : 0;
    const cashAdvance = Number(person.cash_advance || 0);

    const daysPresent = personAttendance.length;
    const dailyRate = Number(person.daily_rate || 0);

    // --- OT Calculation ---
    let otHourlyRate = Number(deptRate.ot_rate || 0);
    if (!otHourlyRate && dailyRate) otHourlyRate = dailyRate / 8;

    let otHours = 0;
    // Calculate OT from attendance records with event='time-out' and status='overtime'
    const afternoonEnd = settings.afternoon_end || '17:00';
    const [endHour, endMinute] = afternoonEnd.split(':').map(Number);
    const endTotal = endHour * 60 + endMinute;
    attendance
      .filter(a => a.person_id === person.id && a.event === 'time-out' && a.status === 'overtime')
      .forEach(a => {
        const dt = new Date(a.device_time);
        const outTotal = dt.getHours() * 60 + dt.getMinutes();
        if (outTotal > endTotal) {
          otHours += (outTotal - endTotal) / 60;
        }
      });

    const otPay = otHourlyRate * otHours;

    // --- End OT Calculation ---

    // Late count and deduction will be injected from PayrollPage
    // (lateCount and totalLateDeduction will be set there)
    return {
      id: person.id,
      daysPresent,
      dailyRate,
      gross: dailyRate * daysPresent + otPay,
      totalLateDeduction: 0, // will be set in PayrollPage
      sss,
      pag_ibig,
      philhealth,
      cashAdvance,
      totalDeductions: 0, // will be set in PayrollPage
      net: 0, // will be set in PayrollPage
      otHours,
      otHourlyRate,
      otPay,
      holidayDays: 0,
      holidayPay: 0,
      lateCount: 0 // will be set in PayrollPage
    };
  });
}