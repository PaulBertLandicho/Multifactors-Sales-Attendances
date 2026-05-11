-- ===============================================================
-- COMPLETE DATABASE SCHEMA (Fixed for Supabase SQL Editor)
-- This version returns a single JSON object at the end so the
-- Supabase SQL editor can coerce the result to one JSON object.
-- Ready to COPY / PASTE in Supabase SQL Editor
-- ===============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- reduce client noise so the editor receives only the final JSON
SET client_min_messages TO WARNING;

BEGIN;

-- ===============================================================
-- DROP OLD TABLES (SAFE ORDER)
-- ===============================================================

DROP TABLE IF EXISTS public.payroll_activity_logs CASCADE;
DROP TABLE IF EXISTS public.payroll_periods CASCADE;
DROP TABLE IF EXISTS public.cash_advances CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.holidays CASCADE;
DROP TABLE IF EXISTS public.department_rates CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.persons CASCADE;

DROP FUNCTION IF EXISTS public.prevent_multiple_settings();
DROP FUNCTION IF EXISTS public.update_persons_from_dept_rates();

-- ===============================================================
-- PERSONS TABLE
-- ===============================================================

CREATE TABLE public.persons (
  id text PRIMARY KEY,
  name text,
  department text,
  created_at timestamptz DEFAULT timezone('utc', now()),
  descriptor double precision[],
  daily_rate numeric(10,2) DEFAULT 500.00,
  late_penalty numeric(10,2) DEFAULT 50.00,
  phone_number text,
  address text,
  sex text,
  approved boolean NOT NULL DEFAULT false,
  registration_photo text,
  sss boolean DEFAULT false,
  pag_ibig boolean DEFAULT false,
  philhealth boolean DEFAULT false,
  cash_advance numeric(10,2) DEFAULT 0,
  email varchar(255) UNIQUE
);

-- ===============================================================
-- SETTINGS TABLE (ONLY ONE RECORD)
-- ===============================================================

CREATE TABLE public.settings (
  id integer PRIMARY KEY DEFAULT 1,
  morning_start time NOT NULL DEFAULT '08:00:00',
  morning_end time NOT NULL DEFAULT '11:59:00',
  afternoon_start time NOT NULL DEFAULT '13:00:00',
  afternoon_end time NOT NULL DEFAULT '17:00:00',
  updated_at timestamptz DEFAULT now(),
  morning_grace_minutes integer DEFAULT 15,
  afternoon_grace_minutes integer DEFAULT 15,
  late_count_limit integer DEFAULT 5,
  late_penalty integer DEFAULT 50,
  payroll_period_days integer NOT NULL DEFAULT 15
);

-- ===============================================================
-- DEPARTMENT RATES
-- ===============================================================

CREATE TABLE public.department_rates (
  department text PRIMARY KEY,
  daily_rate numeric(10,2) NOT NULL DEFAULT 0,
  late_penalty numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  sss numeric(10,2) DEFAULT 0,
  pag_ibig numeric(10,2) DEFAULT 0,
  philhealth numeric(10,2) DEFAULT 0,
  cash_advance numeric(10,2) DEFAULT 0,
  holiday_rate numeric DEFAULT 0,
  ot_rate numeric DEFAULT 0,
  regular_holiday_rate numeric(10,2) DEFAULT 0,
  special_holiday_rate numeric(10,2) DEFAULT 0
);

-- ===============================================================
-- ATTENDANCE TABLE
-- ===============================================================

CREATE TABLE public.attendance (
  id bigserial PRIMARY KEY,
  person_id text REFERENCES public.persons(id) ON DELETE CASCADE,
  name text,
  department text,
  event text,
  point text,
  method text,
  device_time timestamptz,
  created_at timestamptz DEFAULT now(),
  status text,
  archived boolean DEFAULT false,
  photo text
);

-- ===============================================================
-- CASH ADVANCES
-- ===============================================================

CREATE TABLE public.cash_advances (
  id bigserial PRIMARY KEY,
  person_id text NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_cash_advances_person
ON public.cash_advances(person_id);

-- ===============================================================
-- HOLIDAYS
-- ===============================================================

CREATE TABLE public.holidays (
  id serial PRIMARY KEY,
  department varchar(255),
  date date NOT NULL,
  type varchar(20) NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_holidays_dept_month_year
ON public.holidays(department, month, year);

-- ===============================================================
-- PAYROLL PERIODS
-- ===============================================================

CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id text REFERENCES public.persons(id) ON DELETE CASCADE,
  period text NOT NULL,
  days_present integer NOT NULL,
  daily_rate numeric NOT NULL,
  late_penalty numeric NOT NULL,
  late_count integer NOT NULL,
  gross numeric NOT NULL,
  total_late_deduction numeric NOT NULL,
  total_deductions numeric NOT NULL,
  net numeric NOT NULL,
  released boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT unique_person_period UNIQUE(person_id, period)
);

-- ===============================================================
-- PAYROLL ACTIVITY LOGS
-- ===============================================================

CREATE TABLE public.payroll_activity_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_name text,
  released_by text NOT NULL,
  action text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  payroll_period_id uuid,
  person_id text
);

-- ===============================================================
-- PAYROLL RELEASED HISTORY
-- ===============================================================

CREATE TABLE public.payroll_released_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_period_id uuid NOT NULL UNIQUE REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  person_name text,
  department text,
  period text NOT NULL,
  days_present integer NOT NULL,
  daily_rate numeric NOT NULL,
  late_penalty numeric NOT NULL,
  late_count integer NOT NULL,
  gross numeric NOT NULL,
  total_late_deduction numeric NOT NULL,
  total_deductions numeric NOT NULL,
  net numeric NOT NULL,
  detailed_attendance jsonb NOT NULL DEFAULT '[]'::jsonb,
  released boolean NOT NULL DEFAULT true,
  action text NOT NULL DEFAULT 'Released',
  released_by text,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX payroll_released_history_person_id_idx
  ON public.payroll_released_history(person_id);

CREATE INDEX payroll_released_history_period_idx
  ON public.payroll_released_history(period);

CREATE INDEX payroll_released_history_released_at_idx
  ON public.payroll_released_history(released_at DESC);

INSERT INTO public.payroll_released_history (
  payroll_period_id,
  person_id,
  person_name,
  department,
  period,
  days_present,
  daily_rate,
  late_penalty,
  late_count,
  gross,
  total_late_deduction,
  total_deductions,
  net,
  detailed_attendance,
  released,
  action,
  released_at,
  created_at,
  updated_at
)
SELECT
  pp.id,
  pp.person_id,
  p.name,
  p.department,
  pp.period,
  pp.days_present,
  pp.daily_rate,
  pp.late_penalty,
  pp.late_count,
  pp.gross,
  pp.total_late_deduction,
  pp.total_deductions,
  pp.net,
  '[]'::jsonb,
  true,
  'Released',
  COALESCE(pp.updated_at, pp.created_at, now()),
  COALESCE(pp.created_at, now()),
  COALESCE(pp.updated_at, now())
FROM public.payroll_periods pp
LEFT JOIN public.persons p ON p.id = pp.person_id
WHERE pp.released IS TRUE
ON CONFLICT (payroll_period_id) DO NOTHING;

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

ALTER TABLE public.payroll_released_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own released history"
ON public.payroll_released_history
FOR SELECT
USING (auth.uid()::text = person_id);

CREATE POLICY "admin released history"
ON public.payroll_released_history
FOR ALL
USING (public._is_admin_for_current_user());

-- ===============================================================
-- FUNCTIONS
-- ===============================================================

-- only one settings row
CREATE OR REPLACE FUNCTION public.prevent_multiple_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.settings) THEN
        RAISE EXCEPTION 'Only one settings record allowed.';
    END IF;

    RETURN NEW;
END;
$$;

-- auto update persons when department rates changes
CREATE OR REPLACE FUNCTION public.update_persons_from_dept_rates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.persons
    SET
        daily_rate   = NEW.daily_rate,
        late_penalty = NEW.late_penalty
    WHERE department = NEW.department;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_payroll_released_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.released IS TRUE AND COALESCE(OLD.released, FALSE) IS DISTINCT FROM TRUE THEN
    INSERT INTO public.payroll_released_history (
      payroll_period_id,
      person_id,
      person_name,
      department,
      period,
      days_present,
      daily_rate,
      late_penalty,
      late_count,
      gross,
      total_late_deduction,
      total_deductions,
      net,
      detailed_attendance,
      released,
      action,
      released_at,
      created_at,
      updated_at
    )
    SELECT
      NEW.id,
      NEW.person_id,
      p.name,
      p.department,
      NEW.period,
      NEW.days_present,
      NEW.daily_rate,
      NEW.late_penalty,
      NEW.late_count,
      NEW.gross,
      NEW.total_late_deduction,
      NEW.total_deductions,
      NEW.net,
      '[]'::jsonb,
      TRUE,
      'Released',
      now(),
      now(),
      now()
    FROM public.persons p
    WHERE p.id = NEW.person_id
    ON CONFLICT (payroll_period_id) DO UPDATE SET
      person_id = EXCLUDED.person_id,
      person_name = EXCLUDED.person_name,
      department = EXCLUDED.department,
      period = EXCLUDED.period,
      days_present = EXCLUDED.days_present,
      daily_rate = EXCLUDED.daily_rate,
      late_penalty = EXCLUDED.late_penalty,
      late_count = EXCLUDED.late_count,
      gross = EXCLUDED.gross,
      total_late_deduction = EXCLUDED.total_late_deduction,
      total_deductions = EXCLUDED.total_deductions,
      net = EXCLUDED.net,
      detailed_attendance = EXCLUDED.detailed_attendance,
      released = EXCLUDED.released,
      action = EXCLUDED.action,
      released_at = EXCLUDED.released_at,
      updated_at = now();

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_payroll_released_history ON public.payroll_periods;

CREATE TRIGGER trigger_sync_payroll_released_history
AFTER UPDATE OF released ON public.payroll_periods
FOR EACH ROW
WHEN (NEW.released IS TRUE)
EXECUTE FUNCTION public.sync_payroll_released_history();

-- ===============================================================
-- TRIGGERS
-- ===============================================================

CREATE TRIGGER trigger_prevent_multiple_settings
BEFORE INSERT ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_multiple_settings();

CREATE TRIGGER trigger_update_persons
AFTER UPDATE ON public.department_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_persons_from_dept_rates();

CREATE TRIGGER trigger_update_persons_insert
AFTER INSERT ON public.department_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_persons_from_dept_rates();

-- ===============================================================
-- DEFAULT SETTINGS RECORD
-- ===============================================================

INSERT INTO public.settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Return a single JSON object so the Supabase SQL editor can parse
-- the script result without the "Cannot coerce the result to a single JSON object" error.
COMMIT;
SELECT json_build_object('status','ok') AS result;
