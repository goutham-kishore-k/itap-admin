-- ============================================================
-- iTAP Admin — Complete Schema (fresh environment deploy)
-- Includes: core HR schema, contact_requests, career_positions job_id
-- Safe to re-run — every statement is idempotent.
-- Run in: Supabase Dashboard → SQL Editor
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
  period_type  text         not null check (period_type in ('daily', 'weekly', 'monthly', 'range')),
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

-- Added after initial deploy — widen to allow custom-range approvals, matching
-- the admin dashboard's Monthly/Custom Range review support.
do $$ begin
  alter table timesheet_approvals drop constraint if exists timesheet_approvals_period_type_check;
  alter table timesheet_approvals add constraint timesheet_approvals_period_type_check
    check (period_type in ('daily', 'weekly', 'monthly', 'range'));
end $$;

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
  submitted_at     timestamptz,
  created_at       timestamptz  not null default now()
);

-- Added after initial deploy — lets the admin queue group entries by the exact
-- moment they were bulk-submitted together, instead of guessing batches from
-- date gaps (which incorrectly merges unrelated submissions separated by only
-- a few days, e.g. a weekly submission ending Jul 3 and a monthly one starting Jul 6).
alter table timesheet_entries add column if not exists submitted_at timestamptz;

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

-- 10. Contact requests (public website contact form submissions)
create table if not exists contact_requests (
  id          uuid        primary key default gen_random_uuid(),
  first_name  text        not null,
  last_name   text        not null,
  email       text        not null,
  company     text,
  phone       text,
  service     text,
  message     text        not null,
  status      text        not null default 'new'
              check (status in ('new', 'contacted', 'closed')),
  admin_notes text,
  reviewed_by uuid        references employees(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 10c. Timesheets — the canonical identity for "one employee's timesheet for
-- one period" (e.g. Goutham's July 2026 monthly timesheet). Attachments (and
-- anything else that's "about a timesheet" going forward) reference this by
-- id instead of duplicating/loosely date-matching period_type/start/end —
-- an exact FK join instead of a date-range guess that can pull in the wrong
-- period's files. Rows are only ever written by service-role server actions.
create table if not exists timesheets (
  id           uuid        primary key default gen_random_uuid(),
  employee_id  uuid        not null references employees(id) on delete cascade,
  period_type  text        not null check (period_type in ('weekly', 'monthly', 'range')),
  period_start date        not null,
  period_end   date        not null,
  created_at   timestamptz not null default now(),
  unique (employee_id, period_type, period_start, period_end)
);

-- 11. Timesheet attachments (employee-uploaded supporting files, per period)
create table if not exists timesheet_attachments (
  id            uuid        primary key default gen_random_uuid(),
  employee_id   uuid        not null references employees(id) on delete cascade,
  period_type   text        not null check (period_type in ('weekly', 'monthly', 'range')),
  period_start  date        not null,
  period_end    date        not null,
  file_name     text        not null,
  storage_path  text        not null,
  file_size     integer,
  mime_type     text,
  notes         text,
  uploaded_by   uuid        references employees(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Added after initial deploy — safe to re-run against an existing table
alter table timesheet_attachments add column if not exists notes text;

-- Superseded by timesheet_period_totals (one cumulative figure per period,
-- not one per file) — drop if an earlier deploy of this script added it.
alter table timesheet_attachments drop column if exists total_hours;

-- Added after initial deploy — the real link attachments now use to find
-- "which timesheet is this for", replacing loose period_type/start/end
-- matching. Backfilled below for any attachments uploaded before this column
-- existed, then locked to not-null once every row has a value.
alter table timesheet_attachments add column if not exists timesheet_id uuid references timesheets(id) on delete cascade;

insert into timesheets (employee_id, period_type, period_start, period_end)
select distinct employee_id, period_type, period_start, period_end
from timesheet_attachments
on conflict (employee_id, period_type, period_start, period_end) do nothing;

update timesheet_attachments a
set timesheet_id = t.id
from timesheets t
where a.timesheet_id is null
  and a.employee_id  = t.employee_id
  and a.period_type  = t.period_type
  and a.period_start = t.period_start
  and a.period_end   = t.period_end;

alter table timesheet_attachments alter column timesheet_id set not null;

-- Added after initial deploy — same idea as attachments' timesheet_id, but
-- left nullable here: unlike attachments (which always carry their own
-- period_type/start/end to backfill from), entries only have a `date`, so
-- historical rows can't be confidently mapped to the timesheet they belonged
-- to and are left untagged. The admin queue falls back to its old
-- date-span-inference heuristic only for entries where this is null.
alter table timesheet_entries add column if not exists timesheet_id uuid references timesheets(id) on delete set null;
create index if not exists timesheet_entries_timesheet_idx on timesheet_entries (timesheet_id);

-- 11b. Employee-declared cumulative total hours for a period (checked against
-- logged hours before submit), independent of how many files are attached.
create table if not exists timesheet_period_totals (
  id            uuid         primary key default gen_random_uuid(),
  employee_id   uuid         not null references employees(id) on delete cascade,
  period_type   text         not null check (period_type in ('weekly', 'monthly', 'range')),
  period_start  date         not null,
  period_end    date         not null,
  total_hours   numeric(6,2) not null,
  updated_at    timestamptz  not null default now(),
  unique (employee_id, period_type, period_start, period_end)
);

-- 12. Notifications (in-app alerts for employees — e.g. timesheet approved/rejected).
-- Rows are only ever written by service-role server actions (approve/reject),
-- never by a regular authenticated insert, so there's no insert policy below.
create table if not exists notifications (
  id          uuid        primary key default gen_random_uuid(),
  employee_id uuid        not null references employees(id) on delete cascade,
  type        text        not null check (type in ('timesheet_approved', 'timesheet_rejected')),
  title       text        not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_employee_idx on notifications (employee_id, created_at desc);


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
alter table contact_requests    enable row level security;
alter table timesheet_attachments   enable row level security;
alter table timesheet_period_totals enable row level security;
alter table notifications           enable row level security;
alter table timesheets              enable row level security;


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
  -- contact_requests
  drop policy if exists "cr_insert_public" on contact_requests;
  drop policy if exists "cr_admin_all"     on contact_requests;
  -- timesheet_attachments
  drop policy if exists "tsa_select"      on timesheet_attachments;
  drop policy if exists "tsa_insert"      on timesheet_attachments;
  drop policy if exists "tsa_delete"      on timesheet_attachments;
  -- timesheet_period_totals
  drop policy if exists "tpt_select"      on timesheet_period_totals;
  -- notifications
  drop policy if exists "notif_select"    on notifications;
  drop policy if exists "notif_update"    on notifications;
  -- timesheets
  drop policy if exists "tms_select"      on timesheets;
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

-- ── Contact requests ──────────────────────────────────────────
-- Anonymous visitors on the public website can submit a contact request
create policy "cr_insert_public" on contact_requests for insert
  to anon, authenticated with check (true);
-- Only hr_admin can read / update / delete submissions
create policy "cr_admin_all" on contact_requests for all to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');

-- ── Timesheet attachments ─────────────────────────────────────
-- Mirrors ts_select/ts_insert/ts_delete on timesheet_entries
create policy "tsa_select" on timesheet_attachments for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );
create policy "tsa_insert" on timesheet_attachments for insert to authenticated
  with check (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );
create policy "tsa_delete" on timesheet_attachments for delete to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );

-- ── Timesheet period totals ───────────────────────────────────
-- Read-only via RLS; all writes go through service-role server actions
create policy "tpt_select" on timesheet_period_totals for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );

-- ── Notifications ─────────────────────────────────────────────
-- Employees read their own; hr_admin reads all. Employees may mark their own
-- as read (update read_at) but never insert — that only happens via the
-- service-role client inside approvePeriod/rejectPeriod.
create policy "notif_select" on notifications for select to authenticated
  using (employee_id = get_my_employee_id() or get_my_employee_role() = 'hr_admin');
create policy "notif_update" on notifications for update to authenticated
  using     (employee_id = get_my_employee_id())
  with check (employee_id = get_my_employee_id());

-- ── Timesheets ────────────────────────────────────────────────
-- Read-only via RLS; all writes (find-or-create on attachment upload) go
-- through the service-role client in uploadTimesheetAttachment.
create policy "tms_select" on timesheets for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );


-- ============================================================
-- STORAGE BUCKETS (private — all access via server-generated signed URLs)
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('timesheet-attachments', 'timesheet-attachments', false)
  on conflict (id) do nothing;


-- ============================================================
-- CAREER POSITIONS — Job ID support
-- career_positions itself is managed outside this script (created via
-- the Supabase dashboard), so this block is guarded to be a no-op
-- until that table exists, and safe to re-run any number of times.
-- ============================================================

do $$ begin
  if to_regclass('public.career_positions') is not null then
    create sequence if not exists career_positions_job_id_seq start 1001;

    if not exists (
      select 1 from information_schema.columns
      where table_name = 'career_positions' and column_name = 'job_id'
    ) then
      alter table career_positions add column job_id text;
    end if;

    update career_positions
      set job_id = 'ITAP-' || nextval('career_positions_job_id_seq')
      where job_id is null;

    alter table career_positions
      alter column job_id set default ('ITAP-' || nextval('career_positions_job_id_seq'));
    alter table career_positions alter column job_id set not null;

    begin
      alter table career_positions add constraint career_positions_job_id_key unique (job_id);
    -- Adding a unique constraint creates a backing index; if one with this name
    -- already exists, Postgres raises duplicate_table (42P07), not duplicate_object.
    exception when duplicate_object or duplicate_table then null;
    end;

    create index if not exists career_positions_title_idx  on career_positions (lower(title));
    create index if not exists career_positions_job_id_idx on career_positions (lower(job_id));
  end if;
end $$;

-- PostgREST caches the table schema and won't expose a newly added
-- column to select('*') queries until it's told to reload.
notify pgrst, 'reload schema';
