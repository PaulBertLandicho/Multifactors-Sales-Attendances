export function isTimeBetween(current, start, end) {
  const now = current.split(':').map(Number);
  const startTime = start.split(':').map(Number);
  const endTime = end.split(':').map(Number);
  const nowMinutes = now[0] * 60 + now[1];
  const startMinutes = startTime[0] * 60 + startTime[1];
  const endMinutes = endTime[0] * 60 + endTime[1];
  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

export function toMinutes(currentTime) {
  const [hours, minutes] = currentTime.split(':').map(Number);
  return hours * 60 + minutes;
}

export function determineExpectedEvent(currentTime, lastEvent, settings) {
  if (!settings) return 'time-in';

  const nowMinutes = toMinutes(currentTime);
  const morningStartMinutes = toMinutes(settings.morning_start);
  const morningEndMinutes = toMinutes(settings.morning_end);
  const afternoonStartMinutes = toMinutes(settings.afternoon_start);
  const afternoonEndMinutes = toMinutes(settings.afternoon_end);

  // Morning shift: time-in
  if (nowMinutes >= morningStartMinutes && nowMinutes <= morningEndMinutes) {
    if (!lastEvent || lastEvent === 'time-out') return 'time-in';
    if (lastEvent === 'time-in') return 'already-timed-in';
    return 'attendance-closed';
  }
  // Morning shift: time-out after morning window
  if (nowMinutes > morningEndMinutes && nowMinutes < afternoonStartMinutes) {
    // Allow time-out even if there was no prior morning time-in,
    // but prevent multiple time-outs in the same window.
    if (!lastEvent) return 'time-out';
    if (lastEvent === 'time-in') return 'time-out';
    if (lastEvent === 'time-out') return 'attendance-closed';
    return 'attendance-closed';
  }
  if (nowMinutes <= morningEndMinutes && lastEvent === 'time-in') {
    return 'attendance-closed';
  }

  // Afternoon shift: time-in
  if (nowMinutes >= afternoonStartMinutes && nowMinutes <= afternoonEndMinutes) {
    // Allow time-in for afternoon even if there was no time-out in the morning
    // Only block if already timed-in in the afternoon window
    if (!lastEvent || lastEvent === 'time-out') return 'time-in';
    if (lastEvent === 'time-in') return 'already-timed-in';
    // If lastEvent was a morning time-in and no time-out, still allow afternoon time-in
    return 'time-in';
  }
  // Afternoon shift: time-out after afternoon window
  if (nowMinutes > afternoonEndMinutes) {
    // Allow time-out even if there was no prior afternoon time-in or any time-in,
    // but prevent multiple time-outs in the same window.
    if (!lastEvent) return 'time-out';
    if (lastEvent === 'time-in') return 'time-out';
    if (lastEvent === 'time-out') return 'attendance-closed';
    return 'time-out'; // Fallback: allow time-out
  }
  // Allow time-out in afternoon window even if no prior time-in
  if (nowMinutes >= afternoonStartMinutes && nowMinutes <= afternoonEndMinutes && (!lastEvent || lastEvent === 'time-in')) {
    return 'time-out';
  }
  if (nowMinutes <= afternoonEndMinutes && lastEvent === 'time-in') {
    return 'attendance-closed';
  }

  return 'attendance-closed';
}

export function determineAttendanceStatus(currentTime, eventToRecord, settings, hadMorningTimeIn = false) {
  const nowMinutes = toMinutes(currentTime);
  const morningStart = toMinutes(settings.morning_start);
  const morningEnd = toMinutes(settings.morning_end);
  const afternoonStart = toMinutes(settings.afternoon_start);
  const afternoonEnd = toMinutes(settings.afternoon_end);
  const morningGrace = Number(settings.morning_grace_minutes) || 15;
  const afternoonGrace = Number(settings.afternoon_grace_minutes) || 15;

  if (eventToRecord === 'time-in') {
    // Determine if it's morning or afternoon time-in based on current time
    if (nowMinutes >= morningStart && nowMinutes <= morningEnd) {
      // Morning time-in
      if (nowMinutes <= morningStart + morningGrace) {
        return 'on-time';
      } else {
        return 'late';
      }
    } else if (nowMinutes >= afternoonStart && nowMinutes <= afternoonEnd) {
      // Afternoon time-in
      if (nowMinutes <= afternoonStart + afternoonGrace) {
        return 'on-time';
      } else {
        return 'late';
      }
    } else {
      // Outside both windows? Should not happen if eventToRecord is 'time-in'
      // But fallback: treat as on-time
      return 'on-time';
    }
  }

  if (eventToRecord === 'time-out') {
    // Only mark overtime when time-out is after afternoon_end
    // AND the person already had a morning time-in this day.
    if (nowMinutes > afternoonEnd && hadMorningTimeIn) {
      return 'overtime';
    }
    // Otherwise, on-time
    return 'on-time';
  }

  // For any other event (like break-in, time-in-afternoon) - we might not need
  return 'on-time';
}



function buildBlockedMessage(eventToRecord, settings) {
  if (eventToRecord === 'already-timed-in') {
    return 'You have already timed in for this work window. Please time out before scanning again.';
  }

  if (eventToRecord === 'attendance-closed') {
    return 'You have already completed your attendance for this work window, or the attendance window is closed.';
  }

  if (eventToRecord === 'time-out') {
    return 'You have already timed out for this work window, or the attendance window is closed.';
  }

  if (settings?.morning_start && settings?.afternoon_end) {
    return `Attendance was not recorded because the scan time is outside the configured work hours (${settings.morning_start} - ${settings.afternoon_end}).`;
  }

  return 'Attendance was not recorded because the scan does not match the current attendance rules.';
}

export async function recordAttendanceForPerson({
  supabase,
  person,
  settings,
  scanPayload,
  method = 'face-scan',
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available.');
  }

  if (!person?.id) {
    throw new Error('Cannot record attendance without a person id.');
  }

  if (!settings) {
    throw new Error('Work-hours settings are not loaded.');
  }

  const deviceTime = scanPayload?.deviceTime || new Date().toISOString();
  const deviceDate = new Date(deviceTime);
  const currentTime = deviceDate.toTimeString().slice(0,5);

  // Compute current workday window (local day based on deviceTime) so
  // we only consider today's attendance when deciding already-timed-in.
  const year = deviceDate.getFullYear();
  const month = String(deviceDate.getMonth() + 1).padStart(2, '0');
  const day = String(deviceDate.getDate()).padStart(2, '0');
  const dayStartIso = `${year}-${month}-${day}T00:00:00.000Z`;
  const dayEndIso = `${year}-${month}-${day}T23:59:59.999Z`;

  // Debug output: show current time and settings values
  console.log('DEBUG: Current time for attendance:', currentTime);
  console.log('DEBUG: Settings used:', settings);
  const { data: attData, error: lastAttendanceError } = await supabase
    .from('attendance')
    .select('event, device_time')
    .eq('person_id', person.id)
    .gte('device_time', dayStartIso)
    .lte('device_time', dayEndIso)
    .order('device_time', { ascending: false });

  if (lastAttendanceError) {
    throw lastAttendanceError;
  }

  const lastEvent = attData?.[0]?.event || null;
  const event = determineExpectedEvent(currentTime, lastEvent, settings);

  // Block only when rules say already-timed-in or attendance-closed;
  // time-out is now allowed even without a prior time-in.
  if (event === 'already-timed-in' || event === 'attendance-closed') {
    return {
      inserted: false,
      blocked: true,
      event,
      message: buildBlockedMessage(event, settings),
    };
  }

    // Debug output: show last event for this person
    console.log('DEBUG: Last attendance event for person', person.id, '=', attData?.[0]?.event);
  // Determine if there was any morning time-in earlier today
  let hadMorningTimeIn = false;
  if (Array.isArray(attData) && attData.length > 0) {
    const morningStartMinutes = toMinutes(settings.morning_start);
    const morningEndMinutes = toMinutes(settings.morning_end);
    for (const row of attData) {
      if (row.event !== 'time-in' || !row.device_time) continue;
      const dt = new Date(row.device_time);
      const hhmm = dt.toTimeString().slice(0,5);
      const minutes = toMinutes(hhmm);
      if (minutes >= morningStartMinutes && minutes <= morningEndMinutes) {
        hadMorningTimeIn = true;
        break;
      }
    }
  }

  const status = determineAttendanceStatus(currentTime, event, settings, hadMorningTimeIn);

  const { error } = await supabase
    .from('attendance')
    .insert({
      person_id: person.id,
      name: person.name,
      department: person.department,
      event,
      method,
      device_time: deviceTime,
      status,
      photo: scanPayload?.photoDataUrl || null,
    });

  if (error) {
    throw error;
  }

  return {
    inserted: true,
    blocked: false,
    event,
    status,
  };
}