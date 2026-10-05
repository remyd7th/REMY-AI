'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';

const TOP: [string, string, string][] = [
  ['Today', '/today', '☀'],
  ['Workflow', '/workflows', '⚙'],
];

const SIDE: [string, string, string][] = [
  ['Chat', '/chat', '💬'],
  ['Calendar', '/calendar', '📅'],
  ['Tasks', '/tasks', '✓'],
  ['Approvals', '/approvals', '☑'],
  ['Inbox', '/emails', '✉'],
  ['Settings', '/settings', '⚙'],
];

const MORE: [string, string, string][] = [
  ['Docs', '/documents', '📄'],
  ['Follow-ups', '/followups', '🔔'],
  ['Activity', '/activity', '⚡'],
  ['Permissions', '/permissions', '🛡'],
];

const SEARCH_INDEX: [string, string][] = [
  ['Today dashboard', '/today'],
  ['Chat with Remy', '/chat'],
  ['Workflows', '/workflows'],
  ['Approvals', '/approvals'],
  ['Tasks', '/tasks'],
  ['Calendar', '/calendar'],
  ['Activity', '/activity'],
  ['Inbox', '/emails'],
  ['Docs', '/documents'],
  ['Follow-ups', '/followups'],
  ['Permissions', '/permissions'],
  ['Settings', '/settings'],
  ['Get started', '/get-started'],
  ['Sign in', '/signin'],
];

function isActive(path: string, href: string) {
  return path === href || (href !== '/today' && path.startsWith(href));
}

export function PillNav() {
  const path = usePathname();
  return (
    <nav className="pillnav" aria-label="Primary">
      {TOP.map(([label, href, icon]) => (
        <a key={href} href={href} className={isActive(path, href) ? 'active' : ''} aria-current={isActive(path, href) ? 'page' : undefined}>
          <span aria-hidden>{icon}</span> {label}
        </a>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const path = usePathname();
  const link = ([label, href, icon]: [string, string, string]) => (
    <a key={href} className={`sidelink${isActive(path, href) ? ' active' : ''}`} href={href} aria-current={isActive(path, href) ? 'page' : undefined}>
      <span className="sic" aria-hidden>{icon}</span> {label}
    </a>
  );
  return (
    <>
      {SIDE.map(link)}
      <div className="caption" style={{ margin: '14px 4px 6px', color: 'rgba(255,255,255,.65)' }}>More</div>
      {MORE.map(link)}
      <div className="side-assistant">
        <div style={{ fontSize: 20 }} aria-hidden>✦</div>
        <b>Your AI Executive Assistant</b>
        <p className="muted small" style={{ margin: '4px 0 0' }}>Work smarter. Get more done.</p>
      </div>
    </>
  );
}

export function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const hits = q.trim()
    ? SEARCH_INDEX.filter(([label]) => label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="searchbox" role="search">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits.length > 0) router.push(hits[0][1]);
          if (e.key === 'Escape') setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search anything…"
        aria-label="Search pages"
      />
      {open && hits.length > 0 && (
        <div className="search-hits" role="listbox">
          {hits.map(([label, href]) => (
            <a key={href} href={href} role="option" aria-selected="false">{label}</a>
          ))}
        </div>
      )}
    </div>
  );
}

interface Session { user?: { name?: string; email?: string } }

export function SessionArea() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    fetch(`${API}/auth/get-session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        setSession(s);
        if (s?.user) {
          fetch(`${API}/approvals?userId=x&workspaceId=y`, { credentials: 'include' })
            .then((r) => r.json())
            .then((a: { status: string }[]) => setPending(a.filter((x) => x.status === 'pending').length))
            .catch(() => {});
        }
      })
      .catch(() => setSession(null));
  }, []);

  if (session === undefined) return null;
  if (!session?.user) {
    return <a href="/signin" style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Sign in</a>;
  }
  const name = session.user.name ?? session.user.email ?? 'You';
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <>
      <a className="bell" href="/activity" aria-label={`Notifications${pending > 0 ? `, ${pending} pending approvals` : ''}`}>
        <span aria-hidden>🔔</span>
        {pending > 0 && <span className="dot-alert" aria-hidden />}
      </a>
      <a className="userchip" href="/signin">
        <span className="avatar" aria-hidden>{initials}</span>
        <span>{name.split(' ')[0]} ⌄</span>
      </a>
    </>
  );
}
