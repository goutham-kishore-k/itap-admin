'use client';

import { useState } from 'react';
import type { Employee } from '@/types';

interface OrgNode extends Employee {
  children: OrgNode[];
  dept_name?: string;
}

function buildTree(employees: (Employee & { dept_name?: string })[]) {
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
  // Sort children alphabetically for consistent order
  map.forEach(node => node.children.sort((a, b) => a.full_name.localeCompare(b.full_name)));
  return roots;
}

const ROLE_COLOR: Record<string, string> = {
  hr_admin: 'bg-brand text-white shadow-brand/20',
  manager:  'bg-ink text-white shadow-ink/20',
  employee: 'bg-white text-gray-900 border border-gray-200',
};

function NodeCard({ node, depth }: { node: OrgNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={`px-4 py-3 rounded-2xl shadow-sm min-w-[150px] max-w-[200px] text-center select-none ${ROLE_COLOR[node.role] ?? ROLE_COLOR.employee}`}
        title={node.email}
      >
        <p className="text-sm font-bold leading-snug">{node.full_name}</p>
        {node.designation && (
          <p className="text-[11px] opacity-70 mt-0.5 leading-tight">{node.designation}</p>
        )}
        {node.dept_name && (
          <p className="text-[10px] opacity-40 mt-0.5">{node.dept_name}</p>
        )}
      </div>

      {/* Expand/collapse toggle + children */}
      {hasChildren && (
        <div className="flex flex-col items-center">
          {/* Vertical line from card down to toggle */}
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
              {/* Vertical line from toggle down to horizontal bar */}
              <div className="w-px h-4 bg-gray-200" />

              {/* Children row — each child gets half-borders to form the T-connector */}
              <div className="flex">
                {node.children.map((child, i) => {
                  const isFirst = i === 0;
                  const isLast  = i === node.children.length - 1;
                  const isOnly  = node.children.length === 1;

                  return (
                    <div
                      key={child.id}
                      className="flex flex-col items-center px-4 min-w-[180px] relative"
                    >
                      {/* Horizontal connector: left half, right half, and vertical drop */}
                      <div className="w-full h-5 relative">
                        {/* Left horizontal segment */}
                        {!isFirst && (
                          <div className="absolute top-0 left-0 right-1/2 h-px bg-gray-200" />
                        )}
                        {/* Right horizontal segment */}
                        {!isLast && (
                          <div className="absolute top-0 left-1/2 right-0 h-px bg-gray-200" />
                        )}
                        {/* Vertical drop to child */}
                        {!isOnly && (
                          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-gray-200" />
                        )}
                      </div>

                      <NodeCard node={child} depth={depth + 1} />
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
}: {
  employees: (Employee & { dept_name?: string })[];
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
          <NodeCard key={root.id} node={root} depth={0} />
        ))}
      </div>
    </div>
  );
}
