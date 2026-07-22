'use client';

import { useState } from 'react';

export interface OrgChartEmployee {
  id: string;
  full_name: string;
  email: string | null;
  designation: string | null;
  department_id: string | null;
  manager_id: string | null;
  role: 'employee' | 'manager' | 'hr_admin';
  dept_name?: string;
}

interface OrgNode extends OrgChartEmployee {
  children: OrgNode[];
}

function buildTree(employees: OrgChartEmployee[]) {
  const map = new Map<string, OrgNode>();
  employees.forEach(e => map.set(e.id, { ...e, children: [] }));
  const roots: OrgNode[] = [];
  map.forEach(node => {
    if (node.manager_id && map.has(node.manager_id)) {
      map.get(node.manager_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  map.forEach(node => node.children.sort((a, b) => a.full_name.localeCompare(b.full_name)));
  return roots;
}

const ROLE_BADGE: Record<string, string> = {
  hr_admin: 'bg-brand/10 text-brand',
  manager:  'bg-ink/10 text-ink',
};
const ROLE_LABEL: Record<string, string> = {
  hr_admin: 'HR Admin',
  manager:  'Manager',
};

type Highlight = 'self' | 'manager' | 'teammate' | null;

function NodeCard({
  node, depth, currentEmpId, currentManagerId,
}: {
  node: OrgNode;
  depth: number;
  currentEmpId?: string;
  currentManagerId?: string;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;

  const highlight: Highlight =
    node.id === currentEmpId          ? 'self'     :
    node.id === currentManagerId       ? 'manager'  :
    currentManagerId && node.manager_id === currentManagerId && node.id !== currentEmpId
                                       ? 'teammate' : null;

  const ringClass =
    highlight === 'self'     ? 'ring-2 ring-brand ring-offset-2'      :
    highlight === 'manager'  ? 'ring-2 ring-violet-500 ring-offset-2'  :
    highlight === 'teammate' ? 'ring-2 ring-amber-400 ring-offset-2'   : '';

  const relBadge =
    highlight === 'self'     ? <span className="mt-1.5 inline-block text-[9px] font-bold tracking-widest uppercase bg-brand text-white px-2 py-0.5 rounded-full">You</span>           :
    highlight === 'manager'  ? <span className="mt-1.5 inline-block text-[9px] font-bold tracking-widest uppercase bg-violet-500 text-white px-2 py-0.5 rounded-full">Your Manager</span> :
    highlight === 'teammate' ? <span className="mt-1.5 inline-block text-[9px] font-bold tracking-widest uppercase bg-amber-400 text-white px-2 py-0.5 rounded-full">Teammate</span>      :
    null;

  const roleBadge = ROLE_LABEL[node.role] ? (
    <span className={`mt-1 inline-block text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${ROLE_BADGE[node.role]}`}>
      {ROLE_LABEL[node.role]}
    </span>
  ) : null;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={`bg-white border border-gray-200 px-4 py-3 rounded-2xl shadow-sm min-w-[150px] max-w-[200px] text-center select-none transition-all ${ringClass}`}
        title={node.email ?? undefined}
      >
        <p className="text-sm font-bold leading-snug text-gray-900">{node.full_name}</p>
        {node.designation && (
          <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{node.designation}</p>
        )}
        {node.dept_name && (
          <p className="text-[10px] text-gray-400 mt-0.5">{node.dept_name}</p>
        )}
        {roleBadge}
        {relBadge}
      </div>

      {/* Expand/collapse toggle + children */}
      {hasChildren && (
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-6 h-6 rounded-full border border-gray-200 bg-white text-gray-400 text-xs flex items-center justify-center hover:border-brand hover:text-brand transition-colors z-10"
            title={expanded ? 'Collapse' : `Expand (${node.children.length})`}
          >
            {expanded ? '−' : '+'}
          </button>

          {expanded && (
            <>
              <div className="w-px h-4 bg-gray-200" />
              <div className="flex">
                {node.children.map((child, i) => {
                  const isFirst = i === 0;
                  const isLast  = i === node.children.length - 1;
                  const isOnly  = node.children.length === 1;
                  return (
                    <div key={child.id} className="flex flex-col items-center px-4 min-w-[180px] relative">
                      <div className="w-full h-5 relative">
                        {!isFirst && <div className="absolute top-0 left-0 right-1/2 h-px bg-gray-200" />}
                        {!isLast  && <div className="absolute top-0 left-1/2 right-0 h-px bg-gray-200" />}
                        {!isOnly  && <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-gray-200" />}
                      </div>
                      <NodeCard
                        node={child}
                        depth={depth + 1}
                        currentEmpId={currentEmpId}
                        currentManagerId={currentManagerId}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrgChart({
  employees,
  currentEmpId,
  currentManagerId,
}: {
  employees: OrgChartEmployee[];
  currentEmpId?: string;
  currentManagerId?: string;
}) {
  const roots = buildTree(employees);

  if (roots.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No org structure yet. Add employees and assign managers to build the chart.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-6">
      <div className="flex gap-10 justify-center pt-4 min-w-max mx-auto">
        {roots.map(root => (
          <NodeCard
            key={root.id}
            node={root}
            depth={0}
            currentEmpId={currentEmpId}
            currentManagerId={currentManagerId}
          />
        ))}
      </div>
    </div>
  );
}
