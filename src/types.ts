export interface CareerPosition {
  id: string;
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
  date: string;
  project: string;
  hours: number;
  notes: string | null;
  rejection_reason: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  employees?: { id: string; full_name: string } | null;
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
