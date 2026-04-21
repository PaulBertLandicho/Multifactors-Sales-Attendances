-- Migration: add unique constraint/index to prevent duplicate payroll_periods per person+period
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_payroll_person_period' AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX idx_payroll_person_period ON public.payroll_periods (person_id, period);
  END IF;
END
$$;
