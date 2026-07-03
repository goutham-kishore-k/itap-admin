-- ============================================================
-- Timesheet Approvals: period-level batch approval tracking
-- Run after: 20260702200000_manager_rls.sql
-- ============================================================

-- Add approval_id to timesheet_entries first (before creating the approvals table)
-- so the FK can reference the new table
create table if not exists timesheet_approvals (
  id           uuid         primary key default gen_random_uuid(),
  employee_id  uuid         not null references employees(id)  on delete cascade,
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

-- Link entries to approval batch
alter table timesheet_entries
  add column if not exists approval_id uuid references timesheet_approvals(id) on delete set null;

-- RLS
alter table timesheet_approvals enable row level security;

drop policy if exists "ta_select" on timesheet_approvals;
drop policy if exists "ta_write"  on timesheet_approvals;

-- Employees can see their own approvals; managers see their reports'; admins see all
create policy "ta_select" on timesheet_approvals for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager'
        and employee_id in (select get_my_subordinate_ids()))
  );

-- Only hr_admin and managers can create/update approval records
create policy "ta_write" on timesheet_approvals for all to authenticated
  using     (get_my_employee_role() in ('hr_admin', 'manager'))
  with check (get_my_employee_role() in ('hr_admin', 'manager'));
