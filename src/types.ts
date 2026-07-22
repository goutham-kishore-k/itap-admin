export interface CareerPosition {
  id: string;
  job_id?: string;
  title: string;
  department: string;
  location: string;
  type: string;
  category: string;
  work_arrangement: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  nice_to_haves: string[];
  salary_range: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  created_at: string;
}

export interface Employee {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  designation: string | null;
  department_id: string | null;
  manager_id: string | null;
  role: 'employee' | 'manager' | 'hr_admin';
  phone: string | null;
  hire_date: string | null;
  is_active: boolean;
  created_at: string;
  departments?: Department | null;
  manager?: { id: string; full_name: string } | null;
}

export interface LeaveType {
  id: string;
  name: string;
  days_per_year: number;
  is_active: boolean;
}

export interface TimesheetEntry {
  id: string;
  employee_id: string;
  timesheet_id: string | null;
  date: string;
  project: string;
  project_id: string | null;
  hours: number;
  notes: string | null;
  rejection_reason: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  approval_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_at: string;
  employees?: { id: string; full_name: string } | null;
}

export interface TimesheetApproval {
  id: string;
  employee_id: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'range';
  period_start: string;
  period_end: string;
  total_hours: number;
  entry_count: number;
  status: 'approved' | 'reverted';
  notes: string | null;
  approved_by: string | null;
  approved_at: string;
  reverted_by: string | null;
  reverted_at: string | null;
  created_at: string;
}

export interface TimesheetAttachment {
  id: string;
  employee_id: string;
  timesheet_id: string;
  period_type: 'weekly' | 'monthly' | 'range';
  period_start: string;
  period_end: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface TimesheetPeriodTotal {
  id: string;
  employee_id: string;
  period_type: 'weekly' | 'monthly' | 'range';
  period_start: string;
  period_end: string;
  total_hours: number;
  updated_at: string;
}

export interface Notification {
  id: string;
  employee_id: string;
  type: 'timesheet_approved' | 'timesheet_rejected';
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'present' | 'absent' | 'half_day' | 'wfh' | 'on_leave';
  notes: string | null;
  created_at: string;
}

export interface ContactRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  phone: string | null;
  service: string | null;
  message: string;
  status: 'new' | 'contacted' | 'closed';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface HrRequest {
  id: string;
  employee_id: string;
  type: 'leave' | 'expense' | 'grievance' | 'asset';
  status: 'pending' | 'approved' | 'rejected' | 'closed';
  title: string;
  details: Record<string, unknown>;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  employees?: { id: string; full_name: string; designation: string | null } | null;
}
