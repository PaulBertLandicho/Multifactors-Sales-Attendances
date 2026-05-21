-- =====================================================
-- EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- DROP OLD OBJECTS (OPTIONAL RESET)
-- =====================================================

DROP TABLE IF EXISTS public.payroll_activity_logs CASCADE;
DROP TABLE IF EXISTS public.payroll_periods CASCADE;
DROP TABLE IF EXISTS public.cash_advances CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.holidays CASCADE;
DROP TABLE IF EXISTS public.department_rates CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.persons CASCADE;

DROP FUNCTION IF EXISTS public.update_persons_from_dept_rates() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_multiple_settings() CASCADE;
DROP FUNCTION IF EXISTS public._is_admin_for_current_user() CASCADE;

-- =====================================================
-- FUNCTIONS FIRST
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_persons_from_dept_rates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

  UPDATE public.persons
  SET
    daily_rate = NEW.daily_rate,
    late_penalty = NEW.late_penalty,
    cash_advance = NEW.cash_advance
  WHERE department = NEW.department;

  RETURN NEW;

END;
$$;

--------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_multiple_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

  IF EXISTS (
    SELECT 1
    FROM public.settings
  ) THEN
    RAISE EXCEPTION 'Only one settings row is allowed';
  END IF;

  RETURN NEW;

END;
$$;

--------------------------------------------------------

CREATE OR REPLACE FUNCTION public._is_admin_for_current_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (raw_user_meta_data->>'role') = 'admin',
    false
  )
  FROM auth.users
  WHERE id = auth.uid();
$$;

-- =====================================================
-- PERSONS
-- =====================================================

CREATE TABLE public.persons (
  id text NOT NULL,
  name text NULL,
  department text NULL,

  created_at timestamp with time zone NULL
  DEFAULT timezone('utc'::text, now()),

  descriptor double precision[] NULL,

  daily_rate numeric(10,2) NULL DEFAULT 500.00,
  late_penalty numeric(10,2) NULL DEFAULT 50.00,

  phone_number text NULL,
  address text NULL,
  sex text NULL,

  approved boolean NOT NULL DEFAULT false,

  registration_photo text NULL,

  sss text NULL,
  pag_ibig text NULL,
  philhealth text NULL,

  cash_advance numeric(10,2) NULL DEFAULT 0,

  email varchar(255) NULL,

  CONSTRAINT persons_pkey PRIMARY KEY (id),
  CONSTRAINT unique_email UNIQUE (email)
);

-- =====================================================
-- SETTINGS
-- =====================================================

CREATE TABLE public.settings (
  id integer NOT NULL DEFAULT 1,

  morning_start time NOT NULL DEFAULT '08:00:00',
  morning_end time NOT NULL DEFAULT '11:59:00',

  afternoon_start time NOT NULL DEFAULT '13:00:00',
  afternoon_end time NOT NULL DEFAULT '17:00:00',

  updated_at timestamp with time zone NULL DEFAULT now(),

  morning_grace_minutes integer NULL DEFAULT 15,
  afternoon_grace_minutes integer NULL DEFAULT 15,

  late_count_limit integer NULL DEFAULT 5,
  late_penalty integer NULL DEFAULT 50,

  payroll_period_days integer NOT NULL DEFAULT 15,

  CONSTRAINT settings_pkey PRIMARY KEY (id)
);

-- =====================================================
-- DEPARTMENT RATES
-- =====================================================

CREATE TABLE public.department_rates (
  department text NOT NULL,

  daily_rate numeric(10,2) NOT NULL DEFAULT 0,
  late_penalty numeric(10,2) NOT NULL DEFAULT 0,

  updated_at timestamp with time zone NULL DEFAULT now(),

  sss numeric(10,2) NOT NULL DEFAULT 0,
  pag_ibig numeric(10,2) NOT NULL DEFAULT 0,
  philhealth numeric(10,2) NOT NULL DEFAULT 0,

  cash_advance numeric(10,2) NOT NULL DEFAULT 0,

  holiday_rate numeric(10,2) NULL DEFAULT 0,
  ot_rate numeric(10,2) NULL DEFAULT 0,

  regular_holiday_rate numeric(10,2) NULL DEFAULT 0,
  special_holiday_rate numeric(10,2) NULL DEFAULT 0,

  CONSTRAINT department_rates_pkey PRIMARY KEY (department)
);

-- =====================================================
-- ATTENDANCE
-- =====================================================

CREATE TABLE public.attendance (
  id bigserial NOT NULL,

  person_id text NULL,
  name text NULL,
  department text NULL,

  event text NULL,
  point text NULL,
  method text NULL,

  device_time timestamp with time zone NULL,

  created_at timestamp with time zone NULL DEFAULT now(),

  status text NULL,

  archived boolean NULL DEFAULT false,

  photo text NULL,

  CONSTRAINT attendance_pkey PRIMARY KEY (id),

  CONSTRAINT attendance_person_id_fkey
  FOREIGN KEY (person_id)
  REFERENCES public.persons(id)
  ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_person
ON public.attendance(person_id);

-- =====================================================
-- CASH ADVANCES
-- =====================================================

CREATE TABLE public.cash_advances (
  id bigserial NOT NULL,

  person_id text NOT NULL,

  amount numeric(10,2) NOT NULL,

  note text NULL,

  created_at timestamp with time zone NOT NULL
  DEFAULT timezone('utc'::text, now()),

  CONSTRAINT cash_advances_pkey PRIMARY KEY (id),

  CONSTRAINT cash_advances_person_id_fkey
  FOREIGN KEY (person_id)
  REFERENCES public.persons(id)
  ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cash_advances_person
ON public.cash_advances(person_id);

-- =====================================================
-- HOLIDAYS
-- =====================================================

CREATE TABLE public.holidays (
  id serial NOT NULL,

  department varchar(255) NULL,

  date date NOT NULL,

  type varchar(20) NOT NULL,

  month integer NOT NULL,
  year integer NOT NULL,

  created_at timestamp without time zone NULL
  DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT holidays_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_holidays_dept_month_year
ON public.holidays(department, month, year);

-- =====================================================
-- PAYROLL PERIODS
-- =====================================================

CREATE TABLE public.payroll_periods (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),

  person_id text NULL,

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

  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),

  CONSTRAINT payroll_periods_pkey PRIMARY KEY (id),

  CONSTRAINT payroll_periods_person_id_fkey
  FOREIGN KEY (person_id)
  REFERENCES public.persons(id)
  ON DELETE CASCADE,

  CONSTRAINT unique_person_period
  UNIQUE(person_id, period)
);

-- =====================================================
-- PAYROLL ACTIVITY LOGS
-- =====================================================

CREATE TABLE public.payroll_activity_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),

  person_name text NULL,

  released_by text NOT NULL,

  action text NOT NULL,

  timestamp timestamp with time zone NOT NULL DEFAULT now(),

  payroll_period_id uuid NOT NULL,

  person_id text NULL,

  CONSTRAINT payroll_activity_logs_pkey PRIMARY KEY (id),

  CONSTRAINT fk_payroll_period
  FOREIGN KEY (payroll_period_id)
  REFERENCES public.payroll_periods(id)
  ON DELETE CASCADE
);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER trigger_update_persons
AFTER UPDATE
ON public.department_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_persons_from_dept_rates();

--------------------------------------------------------

CREATE TRIGGER trigger_update_persons_insert
AFTER INSERT
ON public.department_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_persons_from_dept_rates();

--------------------------------------------------------

CREATE TRIGGER trigger_prevent_multiple_settings
BEFORE INSERT
ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_multiple_settings();

-- =====================================================
-- DEFAULT SETTINGS ROW
-- =====================================================

INSERT INTO public.settings (id)
VALUES (1);

-- =====================================================
-- ENABLE RLS
-- =====================================================

ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_activity_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PERSONS POLICIES
-- =====================================================

CREATE POLICY "read own profile"
ON public.persons
FOR SELECT
USING (
  auth.uid()::text = id
);

--------------------------------------------------------

CREATE POLICY "update own profile"
ON public.persons
FOR UPDATE
USING (
  auth.uid()::text = id
);

--------------------------------------------------------

CREATE POLICY "admin full access persons"
ON public.persons
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- ATTENDANCE POLICIES
-- =====================================================

CREATE POLICY "read own attendance"
ON public.attendance
FOR SELECT
USING (
  auth.uid()::text = person_id
);

--------------------------------------------------------

CREATE POLICY "insert own attendance"
ON public.attendance
FOR INSERT
WITH CHECK (
  auth.uid()::text = person_id
);

--------------------------------------------------------

CREATE POLICY "admin attendance"
ON public.attendance
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- CASH ADVANCES POLICIES
-- =====================================================

CREATE POLICY "own cash advances"
ON public.cash_advances
FOR SELECT
USING (
  auth.uid()::text = person_id
);

--------------------------------------------------------

CREATE POLICY "admin cash advances"
ON public.cash_advances
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- PAYROLL POLICIES
-- =====================================================

CREATE POLICY "read own payroll"
ON public.payroll_periods
FOR SELECT
USING (
  auth.uid()::text = person_id
);

--------------------------------------------------------

CREATE POLICY "admin payroll"
ON public.payroll_periods
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- SETTINGS POLICIES
-- =====================================================

CREATE POLICY "read settings"
ON public.settings
FOR SELECT
USING (true);

--------------------------------------------------------

CREATE POLICY "admin settings"
ON public.settings
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- DEPARTMENT RATES POLICIES
-- =====================================================

CREATE POLICY "read dept rates"
ON public.department_rates
FOR SELECT
USING (true);

--------------------------------------------------------

CREATE POLICY "admin dept rates"
ON public.department_rates
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- HOLIDAYS POLICIES
-- =====================================================

CREATE POLICY "read holidays"
ON public.holidays
FOR SELECT
USING (true);

--------------------------------------------------------

CREATE POLICY "admin holidays"
ON public.holidays
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- PAYROLL LOGS POLICIES
-- =====================================================

CREATE POLICY "admin logs"
ON public.payroll_activity_logs
FOR ALL
USING (
  public._is_admin_for_current_user()
);

-- =====================================================
-- MAKE USER ADMIN
-- =====================================================

UPDATE auth.users
SET raw_user_meta_data =
  COALESCE(raw_user_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'
WHERE email = 'multifactors-sales@gmail.com';

------------------------------ additional -----------------

ALTER TABLE public.persons
ADD COLUMN role text DEFAULT 'employee'
CHECK (role IN ('employee'));

update auth.users
set raw_user_meta_data =
  coalesce(raw_user_meta_data, '{}'::jsonb)
  || '{"role":"secretary"}'
where email = 'attendance@gmail.com';