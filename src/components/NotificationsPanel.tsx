'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import type { Notification } from '@/types';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsPanel({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const unreadCount = items.filter(n => !n.read_at).length;

  async function markRead(id: string) {
    const target = items.find(n => n.id === id);
    if (!target || target.read_at) return;
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    const supabase = createClient();
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  }

  async function markAllRead() {
    const unreadIds = items.filter(n => !n.read_at).map(n => n.id);
    if (!unreadIds.length) return;
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    const supabase = createClient();
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 w-72 max-w-full shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-gray-900 text-sm">
          Notifications{unreadCount > 0 && <span className="ml-1.5 text-brand">({unreadCount})</span>}
        </p>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-[11px] text-brand font-semibold hover:underline">
            Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-2 py-8">
          <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"/>
          </svg>
          <p className="text-xs text-gray-400">
            You&apos;ll see alerts here when a timesheet is approved or rejected.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {items.map(n => (
            <Link
              key={n.id}
              href={n.link ?? '/portal/timesheet'}
              onClick={() => markRead(n.id)}
              className={`block rounded-xl px-3 py-2.5 transition-colors ${
                n.read_at ? 'hover:bg-gray-50' : 'bg-brand/5 hover:bg-brand/10'
              }`}>
              <div className="flex items-start gap-2">
                {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${n.read_at ? 'text-gray-600' : 'text-gray-900'}`}>
                    {n.title}
                  </p>
                  {n.body && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-gray-300 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
