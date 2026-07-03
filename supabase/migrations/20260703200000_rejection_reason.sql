-- Add rejection reason to timesheet entries so employees can see why their entries were rejected
alter table timesheet_entries
  add column if not exists rejection_reason text;
