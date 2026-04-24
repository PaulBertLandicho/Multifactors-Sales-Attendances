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
