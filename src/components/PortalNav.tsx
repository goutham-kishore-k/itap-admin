'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import SignOutButton from './SignOutButton';

// ─── icons ───────────────────────────────────────────────────────────────────

function Ico({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home:      <Ico d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />,
  timesheet: <Ico d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
  requests:  <Ico d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />,
  org: (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <rect x="2" y="17" width="6" height="4" rx="1" />
      <rect x="16" y="17" width="6" height="4" rx="1" />
      <path d="M12 6v4M5 17v-4h14v4" />
    </svg>
  ),
  profile:   <Ico d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />,
  admin:     <Ico d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />,
  signout:   <Ico d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />,
};

const NAV_ME = [
  { href: '/portal',           label: 'Home',      icon: ICONS.home,      exact: true  },
  { href: '/portal/timesheet', label: 'Timesheet', icon: ICONS.timesheet, exact: false },
  { href: '/portal/requests',  label: 'Requests',  icon: ICONS.requests,  exact: false },
  { href: '/portal/org',       label: 'Org Chart', icon: ICONS.org,       exact: false },
  { href: '/portal/profile',   label: 'Profile',   icon: ICONS.profile,   exact: false },
];

const NAV_TEAM = [
  { href: '/portal/team/timesheets', label: 'Timesheets', icon: ICONS.timesheet, badge: 'timesheets' as const },
  { href: '/portal/team/requests',   label: 'Requests',   icon: ICONS.requests,  badge: 'requests'   as const },
];

// ─── link components ──────────────────────────────────────────────────────────

function SidebarLink({ href, label, icon, exact, badge }: {
  href: string; label: string; icon: React.ReactNode; exact?: boolean; badge?: number;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? 'bg-brand text-white shadow-sm' : 'text-white/55 hover:text-white hover:bg-white/8'
      }`}>
      <span className={active ? 'opacity-100' : 'opacity-60'}>{icon}</span>
      <span className="flex-1 leading-none">{label}</span>
      {(badge ?? 0) > 0 && (
        <span className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ${
          active ? 'bg-white/25 text-white' : 'bg-brand text-white'
        }`}>
          {(badge ?? 0) > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

function MobileLink({ href, label, exact, badge }: {
  href: string; label: string; exact?: boolean; badge?: number;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link href={href}
      className={`relative shrink-0 text-sm font-medium transition-colors whitespace-nowrap pb-1 ${
        active ? 'text-white border-b-2 border-brand' : 'text-white/50 hover:text-white'
      }`}>
      {label}
      {(badge ?? 0) > 0 && (
        <span className="absolute -top-1 -right-3 min-w-[16px] h-4 px-1 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {(badge ?? 0) > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PortalNav({ employeeName, role }: { employeeName: string; role: string }) {
  const [pendingTeamTimesheets, setPendingTeamTimesheets] = useState(0);
  const [pendingTeamRequests,   setPendingTeamRequests]   = useState(0);

  const isManager  = role === 'manager';
  const isHrAdmin  = role === 'hr_admin';

  useEffect(() => {
    if (!isManager) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('employees').select('id').eq('user_id', user.id).single()
        .then(({ data: emp }) => {
          if (!emp) return;
          Promise.all([
            supabase.from('timesheet_entries')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'submitted')
              .neq('employee_id', emp.id),
            supabase.from('hr_requests')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
              .neq('employee_id', emp.id),
          ]).then(([{ count: tc }, { count: rc }]) => {
            setPendingTeamTimesheets(tc ?? 0);
            setPendingTeamRequests(rc ?? 0);
          });
        });
    });
  }, [isManager]);

  const teamBadge = (key: 'timesheets' | 'requests') =>
    key === 'timesheets' ? pendingTeamTimesheets : pendingTeamRequests;

  // Initial letter for avatar
  const initial = employeeName?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-ink h-screen sticky top-0 overflow-y-auto">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <Image src="/images/itap-logo.png" alt="iTAP" width={30} height={30} className="shrink-0" />
            <div>
              <p className="text-white font-bold text-sm leading-tight tracking-tight">iTAP</p>
              <p className="text-white/35 text-[10px] uppercase tracking-widest font-semibold leading-tight">Employee Portal</p>
            </div>
          </div>
        </div>

        {/* Employee card */}
        <div className="mx-3 mb-4 px-3 py-2.5 rounded-xl bg-white/6 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{initial}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">{employeeName}</p>
            <p className="text-white/35 text-[10px] capitalize leading-tight mt-0.5">{role.replace('_', ' ')}</p>
          </div>
        </div>

        {/* My section */}
        <div className="px-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-white/25 px-3 mb-1.5">My Space</p>
          <div className="space-y-0.5">
            {NAV_ME.map(n => <SidebarLink key={n.href} {...n} />)}
          </div>
        </div>

        {/* My Team — managers only */}
        {isManager && (
          <div className="px-3 mt-5">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-white/25 px-3 mb-1.5">My Team</p>
            <div className="space-y-0.5">
              {NAV_TEAM.map(n => (
                <SidebarLink key={n.href} {...n} badge={teamBadge(n.badge)} />
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/8 space-y-0.5">
          {isHrAdmin && (
            <Link href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/45 hover:text-white hover:bg-white/8 transition-all">
              <span className="opacity-60">{ICONS.admin}</span>
              Admin Panel
            </Link>
          )}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/45 hover:text-white hover:bg-white/8 transition-all">
            <span className="opacity-60">{ICONS.signout}</span>
            <SignOutButton className="text-inherit" />
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <nav className="md:hidden bg-ink shadow-sm">
        <div className="h-12 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Image src="/images/itap-logo.png" alt="iTAP" width={22} height={22} />
            <span className="text-white font-bold text-sm tracking-tight">iTAP</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-xs truncate max-w-[100px]">{employeeName}</span>
            {isHrAdmin && (
              <Link href="/dashboard" className="text-white/50 text-xs hover:text-white transition-colors font-medium">
                Admin
              </Link>
            )}
            <SignOutButton className="text-white/50 text-sm hover:text-white transition-colors" />
          </div>
        </div>
        <div className="px-4 pb-2.5 pt-0.5 flex gap-5 overflow-x-auto border-t border-white/10">
          {NAV_ME.map(n => <MobileLink key={n.href} {...n} />)}
          {isManager && (
            <>
              <span className="text-white/20 text-[10px] self-center shrink-0">·</span>
              {NAV_TEAM.map(n => (
                <MobileLink key={n.href} {...n} badge={teamBadge(n.badge)} />
              ))}
            </>
          )}
        </div>
      </nav>
    </>
  );
}
