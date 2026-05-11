-- Dedicated released payroll history table.
-- Inserts a snapshot automatically when payroll_periods.released changes to true.

create table if not exists public.payroll_released_history (
  id uuid not null default extensions.uuid_generate_v4(),
  payroll_period_id uuid not null,
  person_id text not null,
  person_name text null,
  department text null,
  period text not null,
  days_present integer not null,
  daily_rate numeric not null,
  late_penalty numeric not null,
  late_count integer not null,
  gross numeric not null,
  total_late_deduction numeric not null,
  total_deductions numeric not null,
  net numeric not null,
  detailed_attendance jsonb not null default '[]'::jsonb,
  released boolean not null default true,
  action text not null default 'Released',
  released_by text null,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_released_history_pkey primary key (id),
  constraint payroll_released_history_payroll_period_id_key unique (payroll_period_id),
  constraint payroll_released_history_person_id_fkey foreign key (person_id) references public.persons(id) on delete cascade
);

create index if not exists payroll_released_history_person_id_idx
  on public.payroll_released_history (person_id);

create index if not exists payroll_released_history_period_idx
  on public.payroll_released_history (period);

create index if not exists payroll_released_history_released_at_idx
  on public.payroll_released_history (released_at desc);

insert into public.payroll_released_history (
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
select
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
  coalesce(pp.updated_at, pp.created_at, now()),
  coalesce(pp.created_at, now()),
  coalesce(pp.updated_at, now())
from public.payroll_periods pp
left join public.persons p on p.id = pp.person_id
where pp.released is true
on conflict (payroll_period_id) do nothing;

create or replace function public._is_admin_for_current_user()
returns boolean
language sql
stable
security definer
as $$
  select coalesce((raw_user_meta_data->>'role') = 'admin', false)
  from auth.users
  where id = auth.uid();
$$;

alter table public.payroll_released_history enable row level security;

drop policy if exists "read own released history" on public.payroll_released_history;
drop policy if exists "admin released history" on public.payroll_released_history;

create policy "read own released history"
on public.payroll_released_history
for select
using (auth.uid()::text = person_id);

create policy "admin released history"
on public.payroll_released_history
for all
using (public._is_admin_for_current_user());

create or replace function public.sync_payroll_released_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.released is true and coalesce(old.released, false) is distinct from true then
    insert into public.payroll_released_history (
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
      released_by,
      released_at,
      created_at,
      updated_at
    )
    select
      new.id,
      new.person_id,
      p.name,
      p.department,
      new.period,
      new.days_present,
      new.daily_rate,
      new.late_penalty,
      new.late_count,
      new.gross,
      new.total_late_deduction,
      new.total_deductions,
      new.net,
      '[]'::jsonb,
      true,
      'Released',
      null,
      now(),
      now(),
      now()
    from public.persons p
    where p.id = new.person_id
    on conflict (payroll_period_id) do update set
      person_id = excluded.person_id,
      person_name = excluded.person_name,
      department = excluded.department,
      period = excluded.period,
      days_present = excluded.days_present,
      daily_rate = excluded.daily_rate,
      late_penalty = excluded.late_penalty,
      late_count = excluded.late_count,
      gross = excluded.gross,
      total_late_deduction = excluded.total_late_deduction,
      total_deductions = excluded.total_deductions,
      net = excluded.net,
      detailed_attendance = excluded.detailed_attendance,
      released = excluded.released,
      action = excluded.action,
      released_at = excluded.released_at,
      updated_at = now();

  end if;

  return new;
end;
$$;

drop trigger if exists trigger_sync_payroll_released_history on public.payroll_periods;

create trigger trigger_sync_payroll_released_history
after update of released on public.payroll_periods
for each row
when (new.released is true)
execute function public.sync_payroll_released_history();
