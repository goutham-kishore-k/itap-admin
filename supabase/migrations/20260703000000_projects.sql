-- ============================================================
-- Projects: billable project tracking for timesheets
-- ============================================================

create table if not exists projects (
  id          uuid         primary key default gen_random_uuid(),
  name        text         not null,
  code        text,
  client      text,
  description text,
  status      text         not null default 'active'
              check (status in ('active', 'inactive')),
  created_at  timestamptz  not null default now()
);

-- Link timesheet entries to projects (keep text column for backward compat)
alter table timesheet_entries
  add column if not exists project_id uuid references projects(id) on delete set null;

-- RLS
alter table projects enable row level security;

drop policy if exists "proj_select" on projects;
drop policy if exists "proj_write"  on projects;

-- All authenticated users can read projects (employees need the list)
create policy "proj_select" on projects for select to authenticated
  using (true);

-- Only hr_admin can create / update / delete
create policy "proj_write" on projects for all to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');
