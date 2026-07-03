'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';

async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function inviteEmployee(formData: FormData) {
  const admin = createAdminClient();

  const email        = formData.get('email') as string;
  const full_name    = formData.get('full_name') as string;
  const password     = formData.get('password') as string;
  const designation  = (formData.get('designation') as string) || null;
  const department_id = (formData.get('department_id') as string) || null;
  const manager_id   = (formData.get('manager_id') as string) || null;
  const role         = (formData.get('role') as string) || 'employee';
  const phone        = (formData.get('phone') as string) || null;
  const hire_date    = (formData.get('hire_date') as string) || null;

  if (!password || password.length < 6) {
    throw new Error('Temporary password must be at least 6 characters.');
  }

  // Check if already in employees table
  const { data: existingEmp } = await admin.from('employees')
    .select('id').eq('email', email).maybeSingle();
  if (existingEmp) throw new Error('An employee with this email already exists.');

  let userId: string;
  const existingAuthUser = await findAuthUserByEmail(email);

  if (existingAuthUser) {
    // Update their password and confirm email
    await admin.auth.admin.updateUserById(existingAuthUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    userId = existingAuthUser.id;
  } else {
    // Create new user — email_confirm: true skips confirmation email
    const { data: newUser, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) throw new Error(error.message);
    userId = newUser.user.id;
  }

  const { error: empErr } = await admin.from('employees').insert({
    user_id: userId, full_name, email, designation,
    department_id, manager_id, role, phone, hire_date,
  });
  if (empErr) throw new Error(empErr.message);

  redirect('/dashboard/employees');
}

export async function updateEmployee(id: string, formData: FormData) {
  const admin = createAdminClient();
  const { error } = await admin.from('employees').update({
    full_name:      formData.get('full_name') as string,
    designation:    (formData.get('designation') as string) || null,
    department_id:  (formData.get('department_id') as string) || null,
    manager_id:     (formData.get('manager_id') as string) || null,
    role:           (formData.get('role') as string) || 'employee',
    phone:          (formData.get('phone') as string) || null,
    hire_date:      (formData.get('hire_date') as string) || null,
    is_active:      formData.getAll('is_active').includes('true'),
  }).eq('id', id);
  if (error) throw new Error(error.message);
  redirect('/dashboard/employees');
}

export async function setTempPassword(userId: string, password: string) {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}
