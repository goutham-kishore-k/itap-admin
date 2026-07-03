'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  fetchProjects, createProject, updateProject, toggleProjectStatus, deleteProject,
  fetchProjectAssignments, fetchAllActiveEmployees, assignEmployee, removeAssignment,
  type Project, type AssignedEmployee,
} from './actions';

interface FormState { name: string; code: string; client: string; description: string; }
const EMPTY_FORM: FormState = { name: '', code: '', client: '', description: '' };

function ProjectForm({ initial, onSave, onCancel, saving }: {
  initial: FormState; onSave: (f: FormState) => void; onCancel: () => void; saving: boolean;
}) {
  const [f, setF] = useState(initial);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Project name <span className="text-red-500">*</span></label>
          <input value={f.name} onChange={set('name')} autoFocus placeholder="e.g. Website Redesign"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Project code</label>
          <input value={f.code} onChange={set('code')} placeholder="e.g. WEB-001"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Client</label>
          <input value={f.client} onChange={set('client')} placeholder="Client name (optional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
          <input value={f.description} onChange={set('description')} placeholder="Short description (optional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(f)} disabled={!f.name.trim() || saving}
          className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-full hover:border-gray-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Assignment state
  const [assigningId, setAssigningId]   = useState<string | null>(null);
  const [assignees, setAssignees]       = useState<AssignedEmployee[]>([]);
  const [allEmployees, setAllEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [pickEmployee, setPickEmployee] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setProjects(await fetchProjects());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load assignees + employee list when opening assignment panel
  useEffect(() => {
    if (!assigningId) return;
    fetchProjectAssignments(assigningId).then(setAssignees);
    if (!allEmployees.length) fetchAllActiveEmployees().then(setAllEmployees);
  }, [assigningId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(f: FormState) {
    setSaving(true);
    await createProject(f);
    setSaving(false);
    setCreating(false);
    load();
  }

  async function handleUpdate(id: string, f: FormState) {
    setSaving(true);
    await updateProject(id, f);
    setSaving(false);
    setEditingId(null);
    load();
  }

  async function handleToggle(p: Project) {
    setToggling(p.id);
    await toggleProjectStatus(p.id, p.status === 'active' ? 'inactive' : 'active');
    setToggling(null);
    load();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await deleteProject(id);
    setDeleting(null);
    setConfirmDelete(null);
    load();
  }

  async function handleAssign() {
    if (!assigningId || !pickEmployee) return;
    setAssignSaving(true);
    await assignEmployee(assigningId, pickEmployee);
    const updated = await fetchProjectAssignments(assigningId);
    setAssignees(updated);
    setPickEmployee('');
    setAssignSaving(false);
  }

  async function handleRemove(employeeId: string) {
    if (!assigningId) return;
    await removeAssignment(assigningId, employeeId);
    setAssignees(prev => prev.filter(a => a.employee_id !== employeeId));
  }

  function openAssign(projectId: string) {
    setAssigningId(prev => prev === projectId ? null : projectId);
    setEditingId(null);
    setPickEmployee('');
  }

  const active   = projects.filter(p => p.status === 'active').length;
  const inactive = projects.filter(p => p.status === 'inactive').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Projects</h1>
          <p className="text-sm text-gray-400 mt-0.5">{active} active · {inactive} inactive</p>
        </div>
        {!creating && (
          <button onClick={() => { setCreating(true); setEditingId(null); setAssigningId(null); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark transition-colors">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            New Project
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-white rounded-2xl border border-brand/20 px-5 py-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4">New Project</h2>
          <ProjectForm initial={EMPTY_FORM} onSave={handleCreate} onCancel={() => setCreating(false)} saving={saving} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <p className="text-gray-400 text-sm mb-3">No projects yet.</p>
          <button onClick={() => setCreating(true)} className="text-brand font-semibold text-sm hover:underline">
            Create your first project →
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Code</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Client</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {projects.map(p => (
                <Fragment key={p.id}>
                  {/* Edit row */}
                  {editingId === p.id ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-4">
                        <ProjectForm
                          initial={{ name: p.name, code: p.code ?? '', client: p.client ?? '', description: p.description ?? '' }}
                          onSave={f => handleUpdate(p.id, f)}
                          onCancel={() => setEditingId(null)}
                          saving={saving}
                        />
                      </td>
                    </tr>
                  ) : (
                    /* Normal row */
                    <tr className={`hover:bg-gray-50/40 transition-colors ${p.status === 'inactive' ? 'opacity-55' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        {p.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{p.description}</p>}
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        {p.code
                          ? <span className="font-mono text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.code}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell text-gray-500">{p.client ?? '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          p.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {p.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <button onClick={() => openAssign(p.id)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                              assigningId === p.id
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                            }`}>
                            Assign
                          </button>
                          <button onClick={() => { setEditingId(p.id); setCreating(false); setAssigningId(null); }}
                            className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                            Edit
                          </button>
                          <button onClick={() => handleToggle(p)} disabled={toggling === p.id}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                              p.status === 'active'
                                ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
                                : 'text-green-700 border-green-200 bg-green-50 hover:bg-green-100'
                            }`}>
                            {toggling === p.id ? '…' : p.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                          {confirmDelete === p.id ? (
                            <>
                              <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                                className="text-xs font-semibold text-red-600 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-50">
                                {deleting === p.id ? '…' : 'Confirm'}
                              </button>
                              <button onClick={() => setConfirmDelete(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDelete(p.id)}
                              className="text-xs font-semibold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-transparent hover:border-red-100 hover:bg-red-50 transition-all">
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Assignment panel */}
                  {assigningId === p.id && editingId !== p.id && (
                    <tr>
                      <td colSpan={5} className="px-5 py-4 bg-indigo-50/40 border-t border-indigo-100">
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-gray-800">
                            Team for <span className="text-indigo-700">{p.name}</span>
                          </p>

                          {/* Current assignees */}
                          <div className="flex flex-wrap gap-2 min-h-[32px]">
                            {assignees.length === 0 ? (
                              <p className="text-xs text-gray-400 self-center">No employees assigned yet.</p>
                            ) : (
                              assignees.map(a => (
                                <span key={a.employee_id}
                                  className="flex items-center gap-1.5 pl-3 pr-2 py-1 bg-white border border-indigo-200 rounded-full text-sm font-medium text-gray-700 shadow-sm">
                                  {a.full_name}
                                  <button onClick={() => handleRemove(a.employee_id)}
                                    className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors text-xs leading-none">
                                    ×
                                  </button>
                                </span>
                              ))
                            )}
                          </div>

                          {/* Add employee picker */}
                          {(() => {
                            const assignedIds = new Set(assignees.map(a => a.employee_id));
                            const unassigned  = allEmployees.filter(e => !assignedIds.has(e.id));
                            return unassigned.length > 0 ? (
                              <div className="flex gap-2 flex-wrap">
                                <select value={pickEmployee} onChange={e => setPickEmployee(e.target.value)}
                                  className="flex-1 max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand bg-white">
                                  <option value="">Add employee…</option>
                                  {unassigned.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                                </select>
                                <button onClick={handleAssign} disabled={!pickEmployee || assignSaving}
                                  className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                  {assignSaving ? '…' : 'Assign'}
                                </button>
                              </div>
                            ) : (
                              allEmployees.length > 0 && (
                                <p className="text-xs text-gray-400">All active employees are already assigned.</p>
                              )
                            );
                          })()}

                          <button onClick={() => setAssigningId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            Done
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
