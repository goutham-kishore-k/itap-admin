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

function ChevronLeft() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ─── nav definitions ──────────────────────────────────────────────────────────

// Timesheet opens straight into the list ("My Timesheets") — starting a new
// submission is a button on that page, not a separate nav destination.
// activePrefix keeps the nav item highlighted while on either page under
// /portal/timesheet, even though it links to the /history one specifically.
const NAV_ME = [
  { href: '/portal',                   label: 'Home',      icon: ICONS.home,      exact: true },
  { href: '/portal/timesheet/history', label: 'Timesheet', icon: ICONS.timesheet, exact: false, activePrefix: '/portal/timesheet' },
  // Requests tab hidden for now — re-add { href: '/portal/requests', label: 'Requests', icon: ICONS.requests, exact: false } when ready.
  { href: '/portal/org',     label: 'Org Chart', icon: ICONS.org,     exact: false },
  { href: '/portal/profile', label: 'Profile',   icon: ICONS.profile, exact: false },
];

const NAV_TEAM = [
  { href: '/portal/team/timesheets', label: 'Timesheets', icon: ICONS.timesheet, badge: 'timesheets' as const },
  // Requests tab hidden for now — re-add { href: '/portal/team/requests', label: 'Requests', icon: ICONS.requests, badge: 'requests' as const } when ready.
];

// ─── link components ──────────────────────────────────────────────────────────

function SidebarLink({ href, label, icon, exact, badge, collapsed, activePrefix }: {
  href: string; label: string; icon: React.ReactNode; exact?: boolean; badge?: number; collapsed: boolean; activePrefix?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(activePrefix ?? href);
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`relative flex items-center rounded-xl text-sm font-medium transition-all ${
        collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
      } ${active ? 'bg-brand text-white shadow-sm' : 'text-white/55 hover:text-white hover:bg-white/8'}`}
    >
      <span className={active ? 'opacity-100' : 'opacity-60'}>{icon}</span>
      {!collapsed && <span className="flex-1 leading-none whitespace-nowrap">{label}</span>}
      {!collapsed && (badge ?? 0) > 0 && (
        <span className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ${
          active ? 'bg-white/25 text-white' : 'bg-brand text-white'
        }`}>
          {(badge ?? 0) > 99 ? '99+' : badge}
        </span>
      )}
      {collapsed && (badge ?? 0) > 0 && (
        <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-brand ring-1 ring-ink" />
      )}
    </Link>
  );
}

function MobileLink({ href, label, exact, badge, activePrefix }: {
  href: string; label: string; exact?: boolean; badge?: number; activePrefix?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(activePrefix ?? href);
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
  const [collapsed, setCollapsed] = useState(false);

  const isManager = role === 'manager';
  const isHrAdmin = role === 'hr_admin';

  useEffect(() => {
    const saved = localStorage.getItem('portal-nav-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed(c => {
      localStorage.setItem('portal-nav-collapsed', String(!c));
      return !c;
    });
  }

  useEffect(() => {
    if (!isManager) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('employees').select('id').eq('user_id', user.id).single()
        .then(({ data: emp }) => {
          if (!emp) return;
          supabase.from('timesheet_entries')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'submitted')
            .neq('employee_id', emp.id)
            .then(({ count: tc }) => {
              setPendingTeamTimesheets(tc ?? 0);
            });
        });
    });
  }, [isManager]);

  const teamBadge = (key: 'timesheets') =>
    key === 'timesheets' ? pendingTeamTimesheets : 0;

  const initial = employeeName?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-ink h-screen sticky top-0 overflow-x-hidden overflow-y-auto transition-[width] duration-200 ease-in-out ${
          collapsed ? 'w-[60px]' : 'w-60'
        }`}
      >
        {/* Brand + toggle */}
        <div className={`flex items-center pt-6 pb-5 ${collapsed ? 'flex-col gap-2 px-0' : 'px-5 justify-between'}`}>
          <div className="flex items-center gap-2.5">
            <Image src="/images/itap-logo.png" alt="iTAP" width={30} height={30} className="shrink-0" />
            {!collapsed && (
              <div>
                <p className="text-white font-bold text-sm leading-tight tracking-tight">iTAP</p>
                <p className="text-white/35 text-[10px] uppercase tracking-widest font-semibold leading-tight">Employee Portal</p>
              </div>
            )}
          </div>
          <button
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-6 h-6 flex items-center justify-center rounded-md text-white/30 hover:text-white hover:bg-white/8 transition-all shrink-0"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        {/* Employee card */}
        {!collapsed ? (
          <div className="mx-3 mb-4 px-3 py-2.5 rounded-xl bg-white/6 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{initial}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate leading-tight">{employeeName}</p>
              <p className="text-white/35 text-[10px] capitalize leading-tight mt-0.5">{role.replace('_', ' ')}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-3">
            <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center">
              <span className="text-white text-xs font-bold">{initial}</span>
            </div>
          </div>
        )}

        {/* My section */}
        <div className="px-2">
          {!collapsed && <p className="text-[10px] uppercase tracking-widest font-semibold text-white/25 px-3 mb-1.5">My Space</p>}
          <div className="space-y-0.5">
            {NAV_ME.map(n => <SidebarLink key={n.href} {...n} collapsed={collapsed} />)}
          </div>
        </div>

        {/* My Team — managers only */}
        {isManager && (
          <div className="px-2 mt-5">
            {!collapsed && <p className="text-[10px] uppercase tracking-widest font-semibold text-white/25 px-3 mb-1.5">My Team</p>}
            {collapsed && <div className="border-t border-white/10 mx-2 mb-2" />}
            <div className="space-y-0.5">
              {NAV_TEAM.map(n => (
                <SidebarLink key={n.href} {...n} badge={teamBadge(n.badge)} collapsed={collapsed} />
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Footer */}
        <div className="px-2 py-4 border-t border-white/8 space-y-0.5">
          {!collapsed ? (
            <>
              {isHrAdmin && (
                <Link href="/dashboard"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/45 hover:text-white hover:bg-white/8 transition-all">
                  <span className="opacity-60 shrink-0">{ICONS.admin}</span>
                  <span className="whitespace-nowrap">Admin Panel</span>
                </Link>
              )}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/45 hover:text-white hover:bg-white/8 transition-all">
                <span className="opacity-60 shrink-0">{ICONS.signout}</span>
                <SignOutButton className="text-inherit whitespace-nowrap" />
              </div>
            </>
          ) : (
            <>
              {isHrAdmin && (
                <Link href="/dashboard" title="Admin Panel"
                  className="flex items-center justify-center p-3 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-all">
                  <span className="opacity-60">{ICONS.admin}</span>
                </Link>
              )}
              <div className="flex items-center justify-center p-3 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-all">
                <span className="opacity-60">{ICONS.signout}</span>
              </div>
            </>
          )}
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
