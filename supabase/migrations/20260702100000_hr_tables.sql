-- ============================================================
-- HR Tables for iTAP Admin
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Departments
create table if not exists departments (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  created_at timestamptz not null default now()
);

insert into departments (name) values
  ('Engineering'),('Delivery'),('Marketing'),
  ('Operations'),('Finance'),('Human Resources')
on conflict (name) do nothing;

-- 2. Employees (one row per auth user)
create table if not exists employees (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        unique references auth.users(id) on delete cascade,
  full_name     text        not null,
  email         text        not null unique,
  designation   text,
  department_id uuid        references departments(id) on delete set null,
  manager_id    uuid        references employees(id) on delete set null,
  role          text        not null default 'employee'
                            check (role in ('employee','manager','hr_admin')),
  phone         text,
  hire_date     date,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- 3. Leave types
create table if not exists leave_types (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null unique,
  days_per_year integer     not null default 0,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

insert into leave_types (name, days_per_year) values
  ('Annual Leave',20),('Sick Leave',10),('WFH',0),('Unpaid Leave',0)
on conflict (name) do nothing;

-- 4. Timesheet entries
create table if not exists timesheet_entries (
  id          uuid          primary key default gen_random_uuid(),
  employee_id uuid          not null references employees(id) on delete cascade,
  date        date          not null,
  project     text          not null default 'General',
  hours       numeric(4,2)  not null check (hours > 0 and hours <= 24),
  notes       text,
  status      text          not null default 'draft'
              check (status in ('draft','submitted','approved','rejected')),
  reviewed_by uuid          references employees(id),
  reviewed_at timestamptz,
  created_at  timestamptz   not null default now()
);

-- 5. Attendance
create table if not exists attendance (
  id          uuid        primary key default gen_random_uuid(),
  employee_id uuid        not null references employees(id) on delete cascade,
  date        date        not null,
  clock_in    timestamptz,
  clock_out   timestamptz,
  status      text        not null default 'present'
              check (status in ('present','absent','half_day','wfh','on_leave')),
  notes       text,
  created_at  timestamptz not null default now(),
  unique (employee_id, date)
);

-- 6. HR requests
create table if not exists hr_requests (
  id          uuid        primary key default gen_random_uuid(),
  employee_id uuid        not null references employees(id) on delete cascade,
  type        text        not null check (type in ('leave','expense','grievance','asset')),
  status      text        not null default 'pending'
              check (status in ('pending','approved','rejected','closed')),
  title       text        not null,
  details     jsonb       not null default '{}',
  admin_notes text,
  reviewed_by uuid        references employees(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- RLS helper functions
-- ============================================================
create or replace function get_my_employee_id()
returns uuid language sql security definer stable as $$
  select id from employees where user_id = auth.uid();
$$;

create or replace function get_my_employee_role()
returns text language sql security definer stable as $$
  select role from employees where user_id = auth.uid();
$$;

-- ============================================================
-- Enable RLS
-- ============================================================
alter table departments        enable row level security;
alter table employees          enable row level security;
alter table leave_types        enable row level security;
alter table timesheet_entries  enable row level security;
alter table attendance         enable row level security;
alter table hr_requests        enable row level security;

-- ============================================================
-- Policies — drop first for idempotency
-- ============================================================
do $$ begin
  drop policy if exists "dept_read"   on departments;
  drop policy if exists "dept_admin"  on departments;
  drop policy if exists "lt_read"     on leave_types;
  drop policy if exists "lt_admin"    on leave_types;
  drop policy if exists "emp_read"    on employees;
  drop policy if exists "emp_admin"   on employees;
  drop policy if exists "ts_all"      on timesheet_entries;
  drop policy if exists "att_all"     on attendance;
  drop policy if exists "req_read"    on hr_requests;
  drop policy if exists "req_insert"  on hr_requests;
  drop policy if exists "req_update"  on hr_requests;
end $$;

-- Departments
create policy "dept_read"  on departments for select to authenticated using (true);
create policy "dept_admin" on departments for all    to authenticated
  using (get_my_employee_role() = 'hr_admin') with check (get_my_employee_role() = 'hr_admin');

-- Leave types
create policy "lt_read"    on leave_types for select to authenticated using (true);
create policy "lt_admin"   on leave_types for all    to authenticated
  using (get_my_employee_role() = 'hr_admin') with check (get_my_employee_role() = 'hr_admin');

-- Employees: own row always readable; managers/admins see all
create policy "emp_read"   on employees for select to authenticated
  using (user_id = auth.uid() or get_my_employee_role() in ('hr_admin','manager'));
create policy "emp_admin"  on employees for all    to authenticated
  using (get_my_employee_role() = 'hr_admin') with check (get_my_employee_role() = 'hr_admin');

-- Timesheet: own or admin
create policy "ts_all" on timesheet_entries for all to authenticated
  using     (employee_id = get_my_employee_id() or get_my_employee_role() = 'hr_admin')
  with check (employee_id = get_my_employee_id() or get_my_employee_role() = 'hr_admin');

-- Attendance: own or admin
create policy "att_all" on attendance for all to authenticated
  using     (employee_id = get_my_employee_id() or get_my_employee_role() = 'hr_admin')
  with check (employee_id = get_my_employee_id() or get_my_employee_role() = 'hr_admin');

-- HR requests
create policy "req_read"   on hr_requests for select to authenticated
  using (employee_id = get_my_employee_id() or get_my_employee_role() = 'hr_admin');
create policy "req_insert" on hr_requests for insert to authenticated
  with check (employee_id = get_my_employee_id());
create policy "req_update" on hr_requests for update to authenticated
  using (get_my_employee_role() = 'hr_admin') with check (get_my_employee_role() = 'hr_admin');
