'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import WorkspaceBar from './WorkspaceBar';
import { Sidebar, SearchBox, SessionArea, TopTabs } from './Chrome';
import { InstallButton } from '../lib/pwa';

const FULL_CHROME = ['/today', '/workflows', '/chat', '/tasks', '/calendar', '/approvals', '/emails', '/followups', '/documents', '/activity', '/integrations', '/settings', '/permissions', '/workspaces'];

function useChrome(path: string): boolean {
  if (path === '/') return true;
  return FULL_CHROME.some((p) => path === p || path.startsWith(`${p}/`));
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const chrome = useChrome(path);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!chrome) {
    return <main id="main">{children}</main>;
  }

  return (
    <>
      <header className="cmdbar">
        <div className="cmdbar-in">
          <button className="topbar-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? '✕' : '☰'}
          </button>
          <a className="brand" href="/today" aria-label="Remy AI home">
            <span className="brand-mark" aria-hidden>✦</span> REMY&nbsp;AI
          </a>
          <SearchBox />
          <div className="cmd-right">
            <InstallButton />
            <SessionArea />
          </div>
        </div>
      </header>
      <div className="shell">
        {open && <div className="side-scrim" onClick={() => setOpen(false)} aria-hidden />}
        <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Section">
          <WorkspaceBar />
          <Sidebar mobileOpen={open} onNavigate={() => setOpen(false)} />
        </aside>
        <div className="content-col">
          <TopTabs />
          <main id="main">{children}</main>
          <div className="footer">Remy AI · organize, assist, suggest, execute — you stay in control.</div>
        </div>
      </div>
    </>
  );
}
