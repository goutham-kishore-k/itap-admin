'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchNavCounts } from '@/app/dashboard/nav-counts';
import SignOutButton from './SignOutButton';

// ─── icons ───────────────────────────────────────────────────────────────────

function Ico({ d, d2 }: { d: string; d2?: string }) {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const ICONS = {
  overview:   <Ico d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />,
  employees:  <Ico d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
  timesheets: <Ico d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
  requests:   <Ico d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />,
  org: (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <rect x="2" y="17" width="6" height="4" rx="1" />
      <rect x="16" y="17" width="6" height="4" rx="1" />
      <path d="M12 6v4M5 17v-4h14v4" />
    </svg>
  ),
  projects:   <Ico d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />,
  jobs:       <Ico d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />,
  contacts:   <Ico d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />,
  portal:     <Ico d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />,
  signout:    <Ico d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />,
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

// ─── types ────────────────────────────────────────────────────────────────────

type Counts = { requests: number; timesheets: number; contacts: number };
type BadgeKey = keyof Counts;

interface NavItemDef {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  badge?: BadgeKey;
}

// ─── nav sections ─────────────────────────────────────────────────────────────

const HR_NAV: NavItemDef[] = [
  { href: '/dashboard/employees', label: 'Employees',   icon: ICONS.employees  },
  { href: '/dashboard/timesheets',label: 'Timesheets',  icon: ICONS.timesheets, badge: 'timesheets' },
  // HR Requests tab hidden for now — re-add { href: '/dashboard/requests', label: 'HR Requests', icon: ICONS.requests, badge: 'requests' } when ready.
  { href: '/dashboard/projects',  label: 'Projects',    icon: ICONS.projects   },
  { href: '/dashboard/org',       label: 'Org Chart',   icon: ICONS.org        },
];

const WEBSITE_NAV: NavItemDef[] = [
  { href: '/dashboard/jobs', label: 'Job Postings', icon: ICONS.jobs },
  { href: '/dashboard/contacts', label: 'Contact Requests', icon: ICONS.contacts, badge: 'contacts' },
];

// ─── link component ──────────────────────────────────────────────────────────

function SidebarLink({ href, label, icon, exact, badge, counts, collapsed }: NavItemDef & { counts: Counts; collapsed: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  const count = badge ? counts[badge] : 0;

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
      {!collapsed && count > 0 && (
        <span className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ${
          active ? 'bg-white/25 text-white' : 'bg-brand text-white'
        }`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
      {collapsed && count > 0 && (
        <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-brand ring-1 ring-ink" />
      )}
    </Link>
  );
}

function MobileLink({ href, label, exact, badge, counts }: NavItemDef & { counts: Counts }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  const count = badge ? counts[badge] : 0;
  return (
    <Link href={href}
      className={`relative shrink-0 text-sm font-medium transition-colors whitespace-nowrap pb-1 ${
        active ? 'text-white border-b-2 border-brand' : 'text-white/50 hover:text-white'
      }`}>
      {label}
      {count > 0 && (
        <span className="absolute -top-1 -right-3 min-w-[16px] h-4 px-1 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AdminNav() {
  const [counts, setCounts] = useState<Counts>({ requests: 0, timesheets: 0, contacts: 0 });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetchNavCounts().then(setCounts);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('admin-nav-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed(c => {
      localStorage.setItem('admin-nav-collapsed', String(!c));
      return !c;
    });
  }

  const allNav = [
    { href: '/dashboard', label: 'Overview', icon: ICONS.overview, exact: true },
    ...HR_NAV,
    ...WEBSITE_NAV,
  ];

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
                <p className="text-white/35 text-[10px] uppercase tracking-widest font-semibold leading-tight">Admin Panel</p>
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

        {/* Overview */}
        <div className="px-2">
          <SidebarLink href="/dashboard" label="Overview" icon={ICONS.overview} exact counts={counts} collapsed={collapsed} />
        </div>

        {/* HR section */}
        <div className="px-2 mt-5">
          {!collapsed && <p className="text-[10px] uppercase tracking-widest font-semibold text-white/25 px-3 mb-1.5">HR Management</p>}
          {collapsed && <div className="border-t border-white/10 mx-2 mb-2" />}
          <div className="space-y-0.5">
            {HR_NAV.map(n => <SidebarLink key={n.href} {...n} counts={counts} collapsed={collapsed} />)}
          </div>
        </div>

        {/* Website section */}
        <div className="px-2 mt-5">
          {!collapsed && <p className="text-[10px] uppercase tracking-widest font-semibold text-white/25 px-3 mb-1.5">Website</p>}
          {collapsed && <div className="border-t border-white/10 mx-2 mb-2" />}
          <div className="space-y-0.5">
            {WEBSITE_NAV.map(n => <SidebarLink key={n.href} {...n} counts={counts} collapsed={collapsed} />)}
          </div>
        </div>

        {/* New posting button */}
        {!collapsed && (
          <div className="px-3 mt-4">
            <Link href="/dashboard/new"
              className="flex items-center justify-center gap-1.5 w-full py-2 bg-white/8 hover:bg-white/12 text-white/70 hover:text-white text-xs font-semibold rounded-xl border border-white/8 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M6 1v10M1 6h10"/>
              </svg>
              New Job Posting
            </Link>
          </div>
        )}
        {collapsed && (
          <div className="px-2 mt-4">
            <Link href="/dashboard/new" title="New Job Posting"
              className="flex items-center justify-center p-3 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M6 1v10M1 6h10"/>
              </svg>
            </Link>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className={`px-2 py-4 border-t border-white/8 space-y-0.5`}>
          {!collapsed ? (
            <>
              <Link href="/portal"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/45 hover:text-white hover:bg-white/8 transition-all">
                <span className="opacity-60 shrink-0">{ICONS.portal}</span>
                <span className="whitespace-nowrap">Employee Portal</span>
              </Link>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/45 hover:text-white hover:bg-white/8 transition-all">
                <span className="opacity-60 shrink-0">{ICONS.signout}</span>
                <SignOutButton className="text-inherit whitespace-nowrap" />
              </div>
            </>
          ) : (
            <>
              <Link href="/portal" title="Employee Portal"
                className="flex items-center justify-center p-3 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-all">
                <span className="opacity-60">{ICONS.portal}</span>
              </Link>
              <div className="flex items-center justify-center p-3 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-all">
                <span className="opacity-60">{ICONS.signout}</span>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <nav className="md:hidden bg-ink shadow-sm">
        <div className="h-12 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/images/itap-logo.png" alt="iTAP" width={24} height={24} className="shrink-0" />
            <span className="text-white font-bold text-sm tracking-tight">iTAP Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/new"
              className="flex items-center gap-1 px-3 py-1.5 bg-brand text-white text-xs font-semibold rounded-full">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
              New
            </Link>
            <SignOutButton className="text-white/50 text-sm hover:text-white transition-colors" />
          </div>
        </div>
        <div className="px-4 pb-2.5 pt-0.5 flex gap-5 overflow-x-auto border-t border-white/10 scrollbar-hide">
          {allNav.map(n => <MobileLink key={n.href} {...n} counts={counts} />)}
        </div>
      </nav>
    </>
  );
}
