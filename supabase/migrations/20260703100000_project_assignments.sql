-- ============================================================
-- Project Assignments: which employees are assigned to each project
-- ============================================================

create table if not exists project_assignments (
  id          uuid        primary key default gen_random_uuid(),
  project_id  uuid        not null references projects(id) on delete cascade,
  employee_id uuid        not null references employees(id) on delete cascade,
  assigned_by uuid        references employees(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (project_id, employee_id)
);

alter table project_assignments enable row level security;

drop policy if exists "pa_own_select"  on project_assignments;
drop policy if exists "pa_admin_all"   on project_assignments;

-- Employees can read only their own assignments (used in portal timesheet dropdown)
create policy "pa_own_select" on project_assignments for select to authenticated
  using (employee_id = get_my_employee_id());

-- HR admin can read/write everything
create policy "pa_admin_all" on project_assignments for all to authenticated
  using     (get_my_employee_role() = 'hr_admin')
  with check (get_my_employee_role() = 'hr_admin');
