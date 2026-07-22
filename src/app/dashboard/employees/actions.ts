'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdminId } from '@/lib/require-admin';

async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function inviteEmployee(formData: FormData) {
  await requireAdminId();
  const admin = createAdminClient();

  const email        = formData.get('email') as string;
  const full_name    = formData.get('full_name') as string;
  const password     = (formData.get('password') as string) || '';
  const designation  = (formData.get('designation') as string) || null;
  const department_id = (formData.get('department_id') as string) || null;
  const manager_id   = (formData.get('manager_id') as string) || null;
  const role         = (formData.get('role') as string) || 'employee';
  const phone        = (formData.get('phone') as string) || null;
  const hire_date    = (formData.get('hire_date') as string) || null;

  if (!full_name.trim()) throw new Error('Full name is required.');
  if (!email.trim()) throw new Error('Email is required.');
  // hr_admin commonly sits outside the reporting line (and is often the
  // first employee ever created, with no one to report to yet) — everyone
  // else needs a manager for the org chart and approval routing to work.
  if (role !== 'hr_admin' && !manager_id) throw new Error('Manager is required.');
  if (password && password.length < 6) {
    throw new Error('Temporary password must be at least 6 characters.');
  }

  // Check if already in employees table
  const { data: existingEmp } = await admin.from('employees')
    .select('id').eq('email', email).maybeSingle();
  if (existingEmp) throw new Error('An employee with this email already exists.');

  let userId: string;
  const existingAuthUser = await findAuthUserByEmail(email);

  if (existingAuthUser) {
    // Re-adding a former employee whose auth account still exists — there's
    // no "invite" flow for an account that already exists, so a temp
    // password is required here regardless of the option chosen above.
    if (!password) throw new Error('An account with this email already exists — set a temporary password to reuse it.');
    await admin.auth.admin.updateUserById(existingAuthUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    userId = existingAuthUser.id;
  } else if (password) {
    // Option 1: admin sets a temp password — account is active immediately,
    // no email sent. The admin shares the password with the employee directly.
    const { data: newUser, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) throw new Error(error.message);
    userId = newUser.user.id;
  } else {
    // Option 2: no password set — email the employee an invite to set their
    // own password. Sent via whatever SMTP is configured in Supabase's own
    // Auth settings (Project Settings → Auth → SMTP Settings), not this
    // app's own mailer — inviteUserByEmail is a Supabase Auth email, separate
    // from the notify.ts/mailer.ts path used for approve/reject alerts.
    const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: appUrl ? `${appUrl}/portal/profile` : undefined,
    });
    if (error) throw new Error(error.message);
    userId = invited.user.id;
  }

  const { error: empErr } = await admin.from('employees').insert({
    user_id: userId, full_name, email, designation,
    department_id, manager_id, role, phone, hire_date,
  });
  if (empErr) throw new Error(empErr.message);

  redirect('/dashboard/employees');
}

export async function updateEmployee(id: string, formData: FormData) {
  await requireAdminId();
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

export async function deleteEmployee(id: string) {
  await requireAdminId();
  const admin = createAdminClient();

  // Fetch the employee to get their auth user id
  const { data: emp, error: fetchErr } = await admin.from('employees')
    .select('user_id').eq('id', id).single();
  if (fetchErr) throw new Error(fetchErr.message);

  // Delete the employee row (related rows cascade via DB foreign keys)
  const { error: delErr } = await admin.from('employees').delete().eq('id', id);
  if (delErr) throw new Error(delErr.message);

  // Delete the auth user so they can no longer log in
  if (emp?.user_id) {
    await admin.auth.admin.deleteUser(emp.user_id);
  }

  redirect('/dashboard/employees');
}

export async function setTempPassword(userId: string, password: string) {
  await requireAdminId();
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}
