// fetchHolidays.js
// Fetch holidays for a department and month from Supabase
import { supabase } from '../supabaseClient';

/**
 * Fetch holidays for a department and month/year
 * @param {string} department
 * @param {number} month (1-12)
 * @param {number} year
 * @returns {Promise<Array<{date: string, type: string}>>}
 */
export async function fetchHolidays(department, month, year) {
  const { data, error } = await supabase
    .from('holidays')
    .select('date, type')
    .eq('department', department)
    .eq('month', month)
    .eq('year', year);
  if (error) throw error;
  return data || [];
}
