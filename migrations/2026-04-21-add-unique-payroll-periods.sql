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


-- Migration: create payroll_periods table with uniqueness on (person_id, period)
-- Creates uuid extension if missing and the payroll_periods table.

-- Use uuid-ossp for uuid generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  person_id text NULL,
  period text NOT NULL,
  days_present integer NOT NULL DEFAULT 0,
  daily_rate numeric NOT NULL DEFAULT 0,
  late_penalty numeric NOT NULL DEFAULT 0,
  late_count integer NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0,
  total_late_deduction numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  released boolean NOT NULL DEFAULT false,
  created_at timestamptz NULL DEFAULT now(),
  updated_at timestamptz NULL DEFAULT now(),
  CONSTRAINT payroll_periods_pkey PRIMARY KEY (id),
  CONSTRAINT unique_person_period UNIQUE (person_id, period),
  CONSTRAINT payroll_periods_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.persons (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Optional: a small trigger/function to keep updated_at current on modification
CREATE OR REPLACE FUNCTION public.payroll_periods_update_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_periods_updated_at ON public.payroll_periods;
CREATE TRIGGER trg_payroll_periods_updated_at
BEFORE UPDATE ON public.payroll_periods
FOR EACH ROW
EXECUTE FUNCTION public.payroll_periods_update_timestamp();

-- Ensure index exists for quicker upsert/conflict checking (unique already enforces it)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_person_period ON public.payroll_periods(person_id, period);



----------------------------------------------------- 2026-04-24-fix-duplicate-payroll-periods --------------------------------------------------------

-- Migration: remove duplicate payroll_periods rows and enforce unique index
-- This safely deletes duplicate rows for the same (person_id, period), keeping the most recent
-- and creates a conditional unique index for non-null person_id to prevent future duplicates.

BEGIN;

-- 1) Review duplicate groups (run manually to inspect before applying):
-- SELECT person_id, period, COUNT(*) FROM public.payroll_periods GROUP BY person_id, period HAVING COUNT(*) > 1;

-- 2) Delete duplicates keeping the most recent row by created_at (if created_at ties, keep highest id)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY person_id, period ORDER BY created_at DESC, id DESC) AS rn
  FROM public.payroll_periods
  WHERE person_id IS NOT NULL
)
DELETE FROM public.payroll_periods
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Create a conditional unique index for rows where person_id is NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_person_period_nonnull
ON public.payroll_periods (person_id, period)
WHERE person_id IS NOT NULL;

COMMIT;

-- Notes:
-- - This migration intentionally ignores rows with NULL person_id. If you want to disallow NULLs,
--   ensure there are no NULL person_id values and then run: ALTER TABLE public.payroll_periods ALTER COLUMN person_id SET NOT NULL;
-- - After running this migration, consider changing application inserts to use an UPSERT (ON CONFLICT) to avoid race conditions.
