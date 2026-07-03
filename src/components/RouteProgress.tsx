'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPath = useRef(pathname);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function start() {
    clearTimers();
    setVisible(true);
    setWidth(0);
    const t1 = setTimeout(() => setWidth(25), 30);
    const t2 = setTimeout(() => setWidth(55), 300);
    const t3 = setTimeout(() => setWidth(75), 700);
    timers.current = [t1, t2, t3];
  }

  function complete() {
    clearTimers();
    setWidth(100);
    const t = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 350);
    timers.current = [t];
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      let el = e.target as HTMLElement | null;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el) return;
      const href = (el as HTMLAnchorElement).getAttribute('href');
      if (!href || !href.startsWith('/') || href === pathname) return;
      start();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      complete();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '3px',
        width: `${width}%`,
        background: '#B0182B',
        zIndex: 9999,
        transition: width === 100
          ? 'width 0.15s ease-out, opacity 0.35s ease 0.15s'
          : 'width 0.5s ease-out',
        borderRadius: '0 2px 2px 0',
        pointerEvents: 'none',
      }}
    />
  );
}
