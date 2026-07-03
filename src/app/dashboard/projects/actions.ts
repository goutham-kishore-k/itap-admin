'use server';

import { createAdminClient } from '@/lib/supabase-admin';

export interface Project {
  id: string;
  name: string;
  code: string | null;
  client: string | null;
  description: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface AssignedEmployee {
  employee_id: string;
  full_name: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('projects').select('*').order('name');
  return (data ?? []) as Project[];
}

export async function createProject(payload: {
  name: string; code?: string; client?: string; description?: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from('projects').insert({
    name:        payload.name.trim(),
    code:        payload.code?.trim()        || null,
    client:      payload.client?.trim()      || null,
    description: payload.description?.trim() || null,
  });
}

export async function updateProject(id: string, payload: {
  name: string; code?: string; client?: string; description?: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from('projects').update({
    name:        payload.name.trim(),
    code:        payload.code?.trim()        || null,
    client:      payload.client?.trim()      || null,
    description: payload.description?.trim() || null,
  }).eq('id', id);
}

export async function toggleProjectStatus(id: string, status: 'active' | 'inactive'): Promise<void> {
  const admin = createAdminClient();
  await admin.from('projects').update({ status }).eq('id', id);
}

export async function deleteProject(id: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from('projects').delete().eq('id', id);
}

export async function fetchProjectAssignments(projectId: string): Promise<AssignedEmployee[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('project_assignments')
    .select('employee_id, employees!employee_id(full_name)')
    .eq('project_id', projectId);
  return (data ?? []).map((r: any) => ({
    employee_id: r.employee_id,
    full_name:   r.employees?.full_name ?? '',
  }));
}

export async function fetchAllActiveEmployees(): Promise<{ id: string; full_name: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('employees')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name');
  return (data ?? []) as { id: string; full_name: string }[];
}

export async function assignEmployee(projectId: string, employeeId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from('project_assignments').upsert(
    { project_id: projectId, employee_id: employeeId },
    { onConflict: 'project_id,employee_id', ignoreDuplicates: true },
  );
}

export async function removeAssignment(projectId: string, employeeId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from('project_assignments').delete()
    .eq('project_id', projectId).eq('employee_id', employeeId);
}
