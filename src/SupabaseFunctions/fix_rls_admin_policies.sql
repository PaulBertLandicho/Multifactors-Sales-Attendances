-- Fix RLS admin policies to avoid recursion by using a SECURITY DEFINER helper
-- Run this in the Supabase SQL editor (connected as DB owner / postgres).

-- 0) Inspect existing policies for persons (optional)
SELECT polname, polcmd, polqual, polwithcheck
FROM pg_policy
WHERE polrelid = 'public.persons'::regclass;

-- 1) Drop possibly conflicting admin policies (safe)
DROP POLICY IF EXISTS "admin_full_access_persons" ON public.persons;
DROP POLICY IF EXISTS "admin full access persons" ON public.persons;
DROP POLICY IF EXISTS "admin attendance" ON public.attendance;
DROP POLICY IF EXISTS "admin attendance" ON public.attendance;
DROP POLICY IF EXISTS "admin cash advances" ON public.cash_advances;
DROP POLICY IF EXISTS "admin cash advances" ON public.cash_advances;
DROP POLICY IF EXISTS "admin payroll" ON public.payroll_periods;
DROP POLICY IF EXISTS "admin settings" ON public.settings;
DROP POLICY IF EXISTS "admin dept rates" ON public.department_rates;
DROP POLICY IF EXISTS "admin holidays" ON public.holidays;
DROP POLICY IF EXISTS "admin logs" ON public.payroll_activity_logs;

-- 2) Create SECURITY DEFINER helper that checks auth.users for role = 'admin'
-- This function must be created by the DB owner (Supabase SQL editor runs as owner).
CREATE OR REPLACE FUNCTION public._is_admin_for_current_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce((raw_user_meta_data->>'role') = 'admin', false)
  FROM auth.users
  WHERE id = auth.uid();
$$;

-- 3) Recreate non-recursive admin policies calling the helper
CREATE POLICY "admin_full_access_persons" ON public.persons
  FOR ALL
  USING (public._is_admin_for_current_user());

CREATE POLICY "admin_attendance" ON public.attendance
  FOR ALL
  USING (public._is_admin_for_current_user());

CREATE POLICY "admin_cash_advances" ON public.cash_advances
  FOR ALL
  USING (public._is_admin_for_current_user());

CREATE POLICY "admin_payroll" ON public.payroll_periods
  FOR ALL
  USING (public._is_admin_for_current_user());

CREATE POLICY "admin_settings" ON public.settings
  FOR ALL
  USING (public._is_admin_for_current_user());

CREATE POLICY "admin_dept_rates" ON public.department_rates
  FOR ALL
  USING (public._is_admin_for_current_user());

CREATE POLICY "admin_holidays" ON public.holidays
  FOR ALL
  USING (public._is_admin_for_current_user());

CREATE POLICY "admin_logs" ON public.payroll_activity_logs
  FOR ALL
  USING (public._is_admin_for_current_user());

-- Notes:
-- - Run this as the DB owner. The SECURITY DEFINER function will execute
--   with the function owner's privileges and will not re-enter persons policies.
-- - If you prefer using JWT claims instead of querying auth.users, replace
--   the USING clauses with a check like:
--     current_setting('request.jwt.claims.role', true) = 'admin'
--   (only works if the role claim is included in JWTs)
