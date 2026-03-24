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
  // Morning shift: time-out only after end
  if (nowMinutes > morningEndMinutes && nowMinutes < afternoonStartMinutes) {
    if (lastEvent === 'time-in') return 'time-out';
    return 'attendance-closed';
  }
  if (nowMinutes <= morningEndMinutes && lastEvent === 'time-in') {
    return 'attendance-closed';
  }

  // Afternoon shift: time-in
  if (nowMinutes >= afternoonStartMinutes && nowMinutes <= afternoonEndMinutes) {
    if (!lastEvent || lastEvent === 'time-out') return 'time-in';
    if (lastEvent === 'time-in') return 'already-timed-in';
    return 'attendance-closed';
  }
  // Afternoon shift: time-out only after end
  if (nowMinutes > afternoonEndMinutes) {
    if (lastEvent === 'time-in') return 'time-out';
    return 'attendance-closed';
  }
  if (nowMinutes <= afternoonEndMinutes && lastEvent === 'time-in') {
    return 'attendance-closed';
  }

  return 'attendance-closed';
}

export function determineAttendanceStatus(currentTime, eventToRecord, settings) {
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
    // Only allow overtime if time-out is after afternoon_end AND the person timed-in during the afternoon session
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const afternoonStartMinutes = settings && settings.afternoon_start ? toMinutes(settings.afternoon_start) : 0;
    const afternoonEndMinutes = settings && settings.afternoon_end ? toMinutes(settings.afternoon_end) : 0;

    // Check if time-out is after afternoon_end
    if (nowMinutes > afternoonEndMinutes) {
      // Only overtime if the person timed-in during the afternoon
      // We'll check if the last time-in was after afternoonStartMinutes
      // This requires passing the last time-in event time (not available in current params)
      // So, we will check scanPayload.lastTimeInMinutes if available, else fallback to on-time
      if (typeof arguments[3] === 'object' && arguments[3] && arguments[3].lastTimeInMinutes !== undefined) {
        if (arguments[3].lastTimeInMinutes >= afternoonStartMinutes) {
          return 'overtime';
        } else {
          return 'on-time';
        }
      }
      // If we can't check, fallback to on-time
      return 'on-time';
    }
    return 'on-time';
  }

  // For any other event (like break-in, time-in-afternoon) - we might not need
  return 'on-time';
}



function buildBlockedMessage(eventToRecord, settings) {
  if (eventToRecord === 'already-timed-in') {
    return 'You must time out before timing in again.';
  }

  if (eventToRecord === 'attendance-closed') {
    return 'Attendance is closed for this work window.';
  }

  if (eventToRecord === 'time-out') {
    return 'You must time in before timing out.';
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

  // Debug output: show current time and settings values
  console.log('DEBUG: Current time for attendance:', currentTime);
  console.log('DEBUG: Settings used:', settings);
  const { data: attData, error: lastAttendanceError } = await supabase
    .from('attendance')
    .select('event')
    .eq('person_id', person.id)
    .order('device_time', { ascending: false })
    .limit(1);

  if (lastAttendanceError) {
    throw lastAttendanceError;
  }

  const lastEvent = attData?.[0]?.event || null;
  const event = determineExpectedEvent(currentTime, lastEvent, settings);

  // Allow time-out if event is 'time-out' and last event is 'time-in'
  if (event === 'already-timed-in' || event === 'attendance-closed' || (event === 'time-out' && lastEvent !== 'time-in')) {
    return {
      inserted: false,
      blocked: true,
      event,
      message: buildBlockedMessage(event, settings),
    };
  }

    // Debug output: show last event for this person
    console.log('DEBUG: Last attendance event for person', person.id, '=', attData?.[0]?.event);
  const status = determineAttendanceStatus(currentTime, event, settings);

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