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
