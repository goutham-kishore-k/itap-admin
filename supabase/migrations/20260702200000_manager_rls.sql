-- ============================================================
-- Manager RLS: direct reports can be seen/approved by their manager
-- Run after: 20260702100000_hr_tables.sql
-- ============================================================

-- Helper: returns set of employee IDs that directly report to me
create or replace function get_my_subordinate_ids()
returns setof uuid language sql security definer stable as $$
  select id from employees where manager_id = get_my_employee_id();
$$;

-- ============================================================
-- Timesheet entries: split ALL policy into per-operation policies
-- ============================================================
drop policy if exists "ts_all"    on timesheet_entries;
drop policy if exists "ts_select" on timesheet_entries;
drop policy if exists "ts_insert" on timesheet_entries;
drop policy if exists "ts_update" on timesheet_entries;
drop policy if exists "ts_delete" on timesheet_entries;

-- SELECT: own entries, hr_admin sees all, manager sees direct reports
create policy "ts_select" on timesheet_entries for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager' and employee_id in (select get_my_subordinate_ids()))
  );

-- INSERT: only own entries (admins use service role key)
create policy "ts_insert" on timesheet_entries for insert to authenticated
  with check (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );

-- UPDATE: own entries, hr_admin, manager can approve/reject direct reports
create policy "ts_update" on timesheet_entries for update to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager' and employee_id in (select get_my_subordinate_ids()))
  )
  with check (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager' and employee_id in (select get_my_subordinate_ids()))
  );

-- DELETE: only own draft entries
create policy "ts_delete" on timesheet_entries for delete to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
  );

-- ============================================================
-- Attendance: manager can view direct reports
-- ============================================================
drop policy if exists "att_all"    on attendance;
drop policy if exists "att_select" on attendance;
drop policy if exists "att_insert" on attendance;
drop policy if exists "att_update" on attendance;
drop policy if exists "att_delete" on attendance;

create policy "att_select" on attendance for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager' and employee_id in (select get_my_subordinate_ids()))
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

-- ============================================================
-- HR Requests: manager can view and action direct reports' requests
-- ============================================================
drop policy if exists "req_read"   on hr_requests;
drop policy if exists "req_insert" on hr_requests;
drop policy if exists "req_update" on hr_requests;
drop policy if exists "req_select" on hr_requests;

create policy "req_select" on hr_requests for select to authenticated
  using (
    employee_id = get_my_employee_id()
    or get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager' and employee_id in (select get_my_subordinate_ids()))
  );

create policy "req_insert" on hr_requests for insert to authenticated
  with check (employee_id = get_my_employee_id());

create policy "req_update" on hr_requests for update to authenticated
  using (
    get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager' and employee_id in (select get_my_subordinate_ids()))
  )
  with check (
    get_my_employee_role() = 'hr_admin'
    or (get_my_employee_role() = 'manager' and employee_id in (select get_my_subordinate_ids()))
  );
