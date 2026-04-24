// Lightweight helpers to fetch common data from Supabase.
import { supabase, SUPABASE_CONFIGURED } from '../supabaseClient';

async function fetchViaRest(path) {
  const urlBase = process.env.REACT_APP_SUPABASE_URL;
  const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!urlBase || !anon) throw new Error('Missing SUPABASE url or anon key for REST fallback');
  const url = `${urlBase.replace(/\/$/, '')}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`Supabase REST error ${res.status}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function getSettings() {
  if (SUPABASE_CONFIGURED && supabase) {
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  const json = await fetchViaRest('settings?select=*&id=eq.1');
  return Array.isArray(json) ? json[0] || null : json;
}

export async function getPersons() {
  if (SUPABASE_CONFIGURED && supabase) {
    const { data, error } = await supabase.from('persons').select('id, name, department, daily_rate, late_penalty, sss, pag_ibig, philhealth, cash_advance');
    if (error) throw error;
    return data || [];
  }
  return fetchViaRest('persons?select=id,name,department,daily_rate,late_penalty,sss,pag_ibig,philhealth,cash_advance');
}

export async function getDepartmentRates() {
  if (SUPABASE_CONFIGURED && supabase) {
    const { data, error } = await supabase.from('department_rates').select('*');
    if (error) throw error;
    return data || [];
  }
  return fetchViaRest('department_rates?select=*');
}

export async function getAttendanceForPersonOnDay(personId, dayStartIso, dayEndIso) {
  if (SUPABASE_CONFIGURED && supabase) {
    const { data, error } = await supabase.from('attendance')
      .select('id,event,device_time,photo')
      .eq('person_id', personId)
      .gte('device_time', dayStartIso)
      .lte('device_time', dayEndIso)
      .order('device_time', { ascending: true });
    if (error) throw error;
    return data || [];
  }
  const qs = `attendance?select=id,event,device_time,photo&person_id=eq.${personId}&device_time=gte.${encodeURIComponent(dayStartIso)}&device_time=lte.${encodeURIComponent(dayEndIso)}&order=device_time.asc`;
  return fetchViaRest(qs);
}

export default {
  getSettings,
  getPersons,
  getDepartmentRates,
  getAttendanceForPersonOnDay,
};
