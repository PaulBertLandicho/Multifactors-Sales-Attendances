import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';

export async function logPayrollRelease({ payrollPeriodId, personId, releasedBy }) {
  const { error } = await supabase.from('payroll_activity_logs').insert([
    {
      payroll_period_id: payrollPeriodId,
      person_id: personId,
      released_by: releasedBy,
      action: 'release',
      timestamp: new Date().toISOString(),
    },
  ]);
  if (error) {
    console.error('Failed to insert payroll activity log:', error);
    Swal.fire('Failed to insert payroll activity log', error.message || error, 'error');
    throw error;
  }
}

// Usage: logPayrollRelease({ payrollPeriodId, personId, releasedBy })
