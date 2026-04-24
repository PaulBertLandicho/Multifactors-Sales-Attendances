create table public.attendance (
  id bigserial not null,
  person_id text null,
  name text null,
  department text null,
  event text null,
  point text null,
  method text null,
  device_time timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  status text null,
  archived boolean null default false,
  photo text null,
  constraint attendance_pkey primary key (id)
) TABLESPACE pg_default;


create table public.cash_advances (
  id bigserial not null,
  person_id text not null,
  amount numeric(10, 2) not null,
  note text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint cash_advances_pkey primary key (id),
  constraint cash_advances_person_id_fkey foreign KEY (person_id) references persons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_cash_advances_person on public.cash_advances using btree (person_id) TABLESPACE pg_default;


create table public.department_rates (
  department text not null,
  daily_rate numeric(10, 2) not null default 0,
  late_penalty numeric(10, 2) not null default 0,
  updated_at timestamp with time zone null default now(),
  sss numeric(10, 2) not null default 0,
  pag_ibig numeric(10, 2) not null default 0,
  philhealth numeric(10, 2) not null default 0,
  cash_advance numeric(10, 2) not null default 0,
  holiday_rate numeric null default 0,
  ot_rate numeric null default 0,
  regular_holiday_rate numeric(10, 2) null default 0,
  special_holiday_rate numeric(10, 2) null default 0,
  constraint department_rates_pkey primary key (department)
) TABLESPACE pg_default;


create trigger trigger_update_persons
after
update on department_rates for EACH row
execute FUNCTION update_persons_from_dept_rates ();

create trigger trigger_update_persons_insert
after INSERT on department_rates for EACH row
execute FUNCTION update_persons_from_dept_rates ();


create table public.holidays (
  id serial not null,
  department character varying(255) null,
  date date not null,
  type character varying(20) not null,
  month integer not null,
  year integer not null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint holidays_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_holidays_dept_month_year on public.holidays using btree (department, month, year) TABLESPACE pg_default;


create table public.payroll_activity_logs (
  id uuid not null default extensions.uuid_generate_v4 (),
  person_name text null,
  released_by text not null,
  action text not null,
  timestamp timestamp with time zone not null default now(),
  payroll_period_id uuid not null,
  person_id text null,
  constraint payroll_activity_logs_pkey primary key (id),
  constraint fk_payroll_period foreign KEY (payroll_period_id) references payroll_periods (id)
) TABLESPACE pg_default;


create table public.payroll_periods (
  id uuid not null default extensions.uuid_generate_v4 (),
  person_id text null,
  period text not null,
  days_present integer not null,
  daily_rate numeric not null,
  late_penalty numeric not null,
  late_count integer not null,
  gross numeric not null,
  total_late_deduction numeric not null,
  total_deductions numeric not null,
  net numeric not null,
  released boolean not null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint payroll_periods_pkey primary key (id),
  constraint payroll_periods_person_id_fkey foreign KEY (person_id) references persons (id)
) TABLESPACE pg_default;


create table public.persons (
  id text not null,
  name text null,
  department text null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  descriptor double precision[] null,
  daily_rate numeric(10, 2) null default 500.00,
  late_penalty numeric(10, 2) null default 50.00,
  phone_number text null,
  address text null,
  sex text null,
  approved boolean not null default false,
  registration_photo text null,
  sss boolean null default false,
  pag_ibig boolean null default false,
  philhealth boolean null default false,
  cash_advance numeric(10, 2) null default 0,
  email character varying(255) null,
  constraint persons_pkey primary key (id),
  constraint unique_email unique (email)
) TABLESPACE pg_default;


create table public.settings (
  id integer not null default 1,
  morning_start time without time zone not null default '08:00:00'::time without time zone,
  morning_end time without time zone not null default '11:59:00'::time without time zone,
  afternoon_start time without time zone not null default '13:00:00'::time without time zone,
  afternoon_end time without time zone not null default '17:00:00'::time without time zone,
  updated_at timestamp with time zone null default now(),
  morning_grace_minutes integer null default 15,
  afternoon_grace_minutes integer null default 15,
  late_count_limit integer null default 5,
  late_penalty integer null default 50,
  payroll_period_days integer not null default 15,
  constraint settings_pkey primary key (id)
) TABLESPACE pg_default;

create trigger trigger_prevent_multiple_settings BEFORE INSERT on settings for EACH row
execute FUNCTION prevent_multiple_settings ();


----- RLS ENABLE --------------------------------------------------------------------

ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_activity_logs ENABLE ROW LEVEL SECURITY;

-- user can read their own profile
CREATE POLICY "read own profile"
ON public.persons
FOR SELECT
USING (auth.uid()::text = id);

-- user can update their own profile
CREATE POLICY "update own profile"
ON public.persons
FOR UPDATE
USING (auth.uid()::text = id);

-- admin can do everything
CREATE POLICY "admin full access persons"
ON public.persons
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);

-------------------------------------
-- users see only their attendance
CREATE POLICY "read own attendance"
ON public.attendance
FOR SELECT
USING (auth.uid()::text = person_id);

-- users insert their own attendance
CREATE POLICY "insert own attendance"
ON public.attendance
FOR INSERT
WITH CHECK (auth.uid()::text = person_id);

-- admin full access
CREATE POLICY "admin attendance"
ON public.attendance
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);

-------------------------------------
CREATE POLICY "own cash advances"
ON public.cash_advances
FOR SELECT
USING (auth.uid()::text = person_id);

CREATE POLICY "admin cash advances"
ON public.cash_advances
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);

-----------------------------------------
-- users can only see their payroll
CREATE POLICY "read own payroll"
ON public.payroll_periods
FOR SELECT
USING (auth.uid()::text = person_id);

-- admin controls payroll
CREATE POLICY "admin payroll"
ON public.payroll_periods
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);

--------------------------------------
-- everyone can read settings
CREATE POLICY "read settings"
ON public.settings
FOR SELECT
USING (true);

-- admin only modify
CREATE POLICY "admin settings"
ON public.settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);

-- department rates
CREATE POLICY "read dept rates"
ON public.department_rates
FOR SELECT
USING (true);

CREATE POLICY "admin dept rates"
ON public.department_rates
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);

----------------------------------
CREATE POLICY "read holidays"
ON public.holidays
FOR SELECT
USING (true);

CREATE POLICY "admin holidays"
ON public.holidays
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);

-----------------------------------
CREATE POLICY "admin logs"
ON public.payroll_activity_logs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = auth.uid()::text
    AND p.role = 'admin'
  )
);



update auth.users
set raw_user_meta_data =
  coalesce(raw_user_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'
where email = 'multifactors-sales@gmail.com';