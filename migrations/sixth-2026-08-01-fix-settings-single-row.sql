-- Fix duplicated or missing settings row and enforce a single-row configuration
-- Run this in the Supabase SQL editor.

BEGIN;

-- Keep only the canonical settings row (id=1)
DELETE FROM public.settings
WHERE id <> 1;

-- Ensure the default row exists with sane values
INSERT INTO public.settings (
  id,
  morning_start,
  morning_end,
  afternoon_start,
  afternoon_end,
  morning_grace_minutes,
  afternoon_grace_minutes,
  late_count_limit,
  late_penalty,
  payroll_period_days,
  updated_at
)
VALUES (
  1,
  '08:00:00',
  '11:59:00',
  '13:00:00',
  '17:00:00',
  15,
  15,
  5,
  50,
  15,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  morning_start = EXCLUDED.morning_start,
  morning_end = EXCLUDED.morning_end,
  afternoon_start = EXCLUDED.afternoon_start,
  afternoon_end = EXCLUDED.afternoon_end,
  morning_grace_minutes = EXCLUDED.morning_grace_minutes,
  afternoon_grace_minutes = EXCLUDED.afternoon_grace_minutes,
  late_count_limit = EXCLUDED.late_count_limit,
  late_penalty = EXCLUDED.late_penalty,
  payroll_period_days = EXCLUDED.payroll_period_days,
  updated_at = NOW();

COMMIT;

-- The table already uses id as PRIMARY KEY, so this guarantees a single row in practice.
-- If you still want a defensive trigger for application safety, keep this function:
CREATE OR REPLACE FUNCTION public.prevent_multiple_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.settings
    WHERE id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Only one settings row is allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_multiple_settings ON public.settings;
CREATE TRIGGER trigger_prevent_multiple_settings
BEFORE INSERT OR UPDATE OF id
ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_multiple_settings();
