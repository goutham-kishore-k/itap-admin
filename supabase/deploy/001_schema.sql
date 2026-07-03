-- ============================================================
-- iTAP Admin — Complete Schema (fresh environment deploy)
-- Generated from migrations: 20260702100000 → 20260703200000
-- Run once in: Supabase Dashboard → SQL Editor
-- ============================================================


-- ============================================================
-- TABLES (creation order respects FK dependencies)
-- ============================================================

-- 1. Departments
create table if not exists departments (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  created_at timestamptz not null default now()
);

-- 2. Employees
create table if not exists employees (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        unique references auth.users(id) on delete cascade,
  full_name     text        not null,
  email         text        not null unique,
  designation   text,
  department_id uuid        references departments(id) on delete set null,
  manager_id    uuid        references employees(id)   on delete set null,
  role          text        not null default 'employee'
                            check (role in ('employee', 'manager', 'hr_admin')),
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

-- 4. Projects
create table if not exists projects (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  code        text,
  client      text,
  description text,
  status      text        not null default 'active'
              check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now()
);

-- 5. Timesheet approvals (must exist before timesheet_entries references it)
create table if not exists timesheet_approvals (
  id           uuid         primary key default gen_random_uuid(),
  employee_id  uuid         not null references employees(id) on delete cascade,
  period_type  text         not null check (period_type in ('daily', 'weekly', 'monthly')),
  period_start date         not null,
  period_end   date         not null,
  total_hours  numeric(6,2) not null default 0,
  entry_count  integer      not null default 0,
  status       text         not null default 'approved'
               check (status in ('approved', 'reverted')),
  notes        text,
  approved_by  uuid         references employees(id),
  approved_at  timestamptz  not null default now(),
  reverted_by  uuid         references employees(id),
  reverted_at  timestamptz,
  created_at   timestamptz  not null default now()
);

-- 6. Timesheet entries (all columns from all migrations combined)
create table if not exists timesheet_entries (
  id               uuid         primary key default gen_random_uuid(),
  employee_id      uuid         not null references employees(id)          on delete cascade,
  date             date         not null,
  project          text         not null default 'General',
  project_id       uuid         references projects(id)                    on delete set null,
  hours            numeric(4,2) not null check (hours > 0 and hours <= 24),
  notes            text,
  status           text         not null default 'draft'
                   check (status in ('draft', 'submitted', 'approved', 'rejected')),
  rejection_reason text,
  approval_id      uuid         references timesheet_approvals(id)         on delete set null,
  reviewed_by      uuid         references employees(id),
  reviewed_at      timestamptz,
  created_at       timestamptz  not null default now()
);

-- 7. Attendance
create table if not exists attendance (
  id          uuid        primary key default gen_random_uuid(),
  employee_id uuid        not null references employees(id) on delete cascade,
  date        date        not null,
  clock_in    timestamptz,
  clock_out   timestamptz,
  status      text        not null default 'present'
              check (status in ('present', 'absent', 'half_day', 'wfh', 'on_leave')),
  notes       text,
  created_at  timestamptz not null default now(),
  unique (employee_id, date)
);

-- 8. HR requests
create table if not exists hr_requests (
  id          uuid        primary key default gen_random_uuid(),
  employee_id uuid        not null references employees(id) on delete cascade,
  type        text        not null check (type in ('leave', 'expense', 'grievance', 'asset')),
  status      text        not null default 'pending'
              check (status in ('pending', 'approved', 'rejected', 'closed')),
  title       text        not null,
  details     jsonb       not null default '{}',
  admin_notes text,
  reviewed_by uuid        references employees(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 9. Project assignments
create table if not exists project_assignments (
  id          uuid        primary key default gen_random_uuid(),
  project_id  uuid        not null references projects(id)   on delete cascade,
  employee_id uuid        not null references employees(id)  on delete cascade,
  assigned_by uuid        references employees(id)           on delete set null,
  assigned_at timestamptz not null default now(),
  unique (project_id, employee_id)
);


-- ============================================================
-- SEED DATA
-- ============================================================

insert into departments (name) values
  ('Engineering'), ('Delivery'), ('Marketing'),
  ('Operations'), ('Finance'), ('Human Resources')
on conflict (name) do nothing;

insert into leave_types (name, days_per_year) values
  ('Annual Leave', 20), ('Sick Leave', 10), ('WFH', 0), ('Unpaid Leave', 0)
on conflict (name) do nothing;


-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

create or replace function get_my_employee_id()
returns uuid language sql security definer stable as $$
  select id from employees where user_id = auth.uid();
$$;

create or replace function get_my_employee_role()
returns text language sql security definer stable as $$
  select role from employees where user_id = auth.uid();
$$;

-- Returns UUIDs of employees who directly report to the current user
create or replace function get_my_subordinate_ids()
returns setof uuid language sql security definer stable as $$
  select id from employees where manager_id = get_my_employee_id();
$$;


-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table departments         enable row level security;
alter table employees           enable row level security;
alter table leave_types         enable row level security;
alter table projects            enable row level security;
alter table timesheet_approvals enable row level security;
alter table timesheet_entries   enable row level security;
alter table attendance          enable row level security;
alter table hr_requests         enable row level security;
alter table project_assignments enable row level security;


-- ============================================================
-- RLS POLICIES  (final state — idempotent drop-before-create)
-- ============================================================

do $$ begin
  -- departments
  drop policy if exists "dept_read"       on departments;
  drop policy if exists "dept_admin"      on departments;
  -- leave_types
  drop policy if exists "lt_read"         on leave_types;
  drop policy if exists "lt_admin"        on leave_types;
  -- employees
  drop policy if exists "emp_read"        on employees;
  drop policy if exists "emp_admin"       on employees;
  -- projects
  drop policy if exists "proj_select"     on projects;
  drop policy if exists "proj_write"      on projects;
  -- timesheet_approvals
  drop policy if exists "ta_select"       on timesheet_approvals;
  drop policy if exists "ta_write"        on timesheet_approvals;
  -- timesheet_entries
  drop policy if exists "ts_select"       on timesheet_entries;
  drop policy if exists "ts_insert"       on timesheet_entries;
  drop policy if exists "ts_update"       on timesheet_entries;
  drop policy if exists "ts_delete"       on timesheet_entries;
  -- attendance
  drop policy if exists "att_select"      on attendance;
  drop policy if exists "att_insert"      on attendance;
  drop policy if exists "att_update"      on attendance;
  drop policy if exists "att_delete"      on attendance;
  -- hr_requests
  drop policy if exists "req_select"      on hr_requests;
  drop policy if exists "req_insert"      on hr_requests;
  drop policy if exists "req_update"      on hr_requests;
  -- project_assignments
  drop policy if exists "pa_own_select"   on project_assignments;
  drop policy if exists "pa_admin_all"    on project_assignments;
end $$;

-- ── Departments ───────────────────────────────────────────────
create policy "dept_read"  on departments for select to authenticated using (true);
create policy "dept_admin" on departments for all    to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');

-- ── Leave types ───────────────────────────────────────────────
create policy "lt_read"    on leave_types for select to authenticated using (true);
create policy "lt_admin"   on leave_types for all    to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');

-- ── Employees ─────────────────────────────────────────────────
-- Own row always readable; managers and admins see all
create policy "emp_read"   on employees for select to authenticated
  using (user_id = auth.uid() or get_my_employee_role() in ('hr_admin', 'manager'));
create policy "emp_admin"  on employees for all    to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');

-- ── Projects ──────────────────────────────────────────────────
-- All authenticated users can read; only hr_admin can write
create policy "proj_select" on projects for select to authenticated using (true);
create policy "proj_write"  on projects for all    to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');

-- ── Timesheet approvals ───────────────────────────────────────
-- Own approvals + manager sees reports' + admin sees all
create policy "ta_select" on timesheet_approvals for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );
-- hr_admin and managers can create/update approval records
create policy "ta_write"  on timesheet_approvals for all to authenticated
  using     (get_my_employee_role() in ('hr_admin', 'manager'))
  with check (get_my_employee_role() in ('hr_admin', 'manager'));

-- ── Timesheet entries ─────────────────────────────────────────
create policy "ts_select" on timesheet_entries for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );
create policy "ts_insert" on timesheet_entries for insert to authenticated
  with check (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );
create policy "ts_update" on timesheet_entries for update to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  )
  with check (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );
create policy "ts_delete" on timesheet_entries for delete to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );

-- ── Attendance ────────────────────────────────────────────────
create policy "att_select" on attendance for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );
create policy "att_insert" on attendance for insert to authenticated
  with check (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );
create policy "att_update" on attendance for update to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  )
  with check (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );
create policy "att_delete" on attendance for delete to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );

-- ── HR requests ───────────────────────────────────────────────
create policy "req_select" on hr_requests for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );
create policy "req_insert" on hr_requests for insert to authenticated
  with check (employee_id = get_my_employee_id());
create policy "req_update" on hr_requests for update to authenticated
  using (
    get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  )
  with check (
    get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );

-- ── Project assignments ───────────────────────────────────────
-- Employees see only their own assignments (for portal timesheet dropdown)
create policy "pa_own_select" on project_assignments for select to authenticated
  using (employee_id = get_my_employee_id());
-- HR admin can read/write everything
create policy "pa_admin_all"  on project_assignments for all    to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');
