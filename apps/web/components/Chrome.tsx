'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';
import { useNotificationsOptional } from '../lib/notifications';

function fmtCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/* Inline SVG icons (18px, stroke=currentColor) — no emoji, no new deps. */
function Icon({ d, filled }: { d: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  workspace: <Icon d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  chat: <Icon d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" />,
  tasks: <Icon d="M4 6h16M4 12h16M4 18h10" />,
  calendar: <Icon d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
  approvals: <Icon d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4zM9 12l2 2 4-4" />,
  emails: <Icon d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6" />,
  followups: <Icon d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21a2 2 0 0 0 4 0" />,
  documents: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6" />,
  activity: <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  integrations: <Icon d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4" />,
  settings: <Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  today: <Icon d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />,
  workflow: <Icon d="M14.7 6.3a4 4 0 1 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4L14 13l-3-3 3.7-3.7z" />,
  bell: <Icon d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21a2 2 0 0 0 4 0" />,
};

/** Sidebar order, grouped by workflow: daily workspace, review queue,
 *  organized library, system. Every primary destination lives here exactly
 *  once — the old Today|Workflow tab strip is retired in favor of this. */
const GROUPS: { label: string; items: [string, string][] }[] = [
  { label: 'Workspace', items: [['Today', '/today'], ['Chat', '/chat'], ['Tasks', '/tasks'], ['Calendar', '/calendar']] },
  { label: 'Review', items: [['Approvals', '/approvals'], ['Workflows', '/workflows'], ['Follow-ups', '/followups']] },
  { label: 'Organize', items: [['Emails', '/emails'], ['Documents', '/documents'], ['Activity', '/activity']] },
  { label: 'System', items: [['Integrations', '/integrations'], ['Settings', '/settings']] },
];

/** @deprecated Kept for compatibility; sidebar groups replaced the tab strip. */

const SEARCH_INDEX: [string, string][] = [
  ['Today dashboard', '/today'],
  ['Chat with Remy', '/chat'],
  ['Workflows', '/workflows'],
  ['Approvals', '/approvals'],
  ['Tasks', '/tasks'],
  ['Calendar', '/calendar'],
  ['Activity', '/activity'],
  ['Emails', '/emails'],
  ['Documents', '/documents'],
  ['Follow-ups', '/followups'],
  ['Permissions', '/permissions'],
  ['Integrations', '/integrations'],
  ['Settings', '/settings'],
  ['New workspace', '/workspaces/new'],
  ['Get started', '/get-started'],
  ['Sign in', '/signin'],
];

function isActive(path: string, href: string) {
  if (path === href) return true;
  if (href === '/today' || href === '/workflows') return path.startsWith(href);
  return path.startsWith(href);
}

/** Today | Workflow tabs — retired: both destinations now live in the grouped
 *  sidebar. Kept exported so older imports keep compiling. */
export function TopTabs() {
  return null;
}

export function Sidebar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  const path = usePathname();
  const notify = useNotificationsOptional();
  const approvals = notify?.pendingApprovals ?? 0;
  const chatUnread = notify?.chatUnreadTotal ?? 0;
  const iconKey: Record<string, string> = {
    today: 'today', chat: 'chat', tasks: 'tasks', calendar: 'calendar', approvals: 'approvals',
    workflows: 'workflow', followups: 'followups', emails: 'emails', documents: 'documents',
    activity: 'activity', integrations: 'integrations', settings: 'settings',
  };
  const link = ([label, href]: [string, string]) => {
    const key = label.toLowerCase().replace(/[^a-z]/g, '');
    const active = isActive(path, href) || (href === '/settings' && path.startsWith('/permissions'));
    const badge =
      href === '/approvals' && approvals > 0 ? (
        <span className="side-badge side-badge-approval" aria-hidden>{fmtCount(approvals)}</span>
      ) : href === '/chat' && chatUnread > 0 ? (
        <span className="side-badge side-badge-chat" aria-hidden>{fmtCount(chatUnread)}</span>
      ) : null;
    const countLabel =
      href === '/approvals' && approvals > 0 ? `, ${approvals} pending approvals`
      : href === '/chat' && chatUnread > 0 ? `, ${chatUnread} unread responses`
      : '';
    return (
      <a key={href} className={`sidelink${active ? ' active' : ''}`} href={href}
        aria-current={active ? 'page' : undefined}
        aria-label={`${label}${countLabel}${active ? ', current page' : ''}`}
        onClick={onNavigate}>
        <span className="sic">{ICONS[iconKey[key] ?? 'activity']}</span>
        <span className="side-label">{label}</span>
        {badge}
      </a>
    );
  };
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="side-section-label">{group.label}</div>
          <nav className="side-nav" aria-label={group.label}>
            {group.items.map(link)}
          </nav>
        </div>
      ))}
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
  const notify = useNotificationsOptional();
  const pending = notify?.pendingApprovals ?? 0;

  useEffect(() => {
    fetch(`${API}/auth/get-session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        setSession(s);
        if (s?.user) notify?.refreshApprovals();
      })
      .catch(() => setSession(null));
  }, [notify]);

  if (session === undefined) return null;
  if (!session?.user) {
    return <a href="/signin" style={{ fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Sign in</a>;
  }
  const name = session.user.name ?? session.user.email ?? 'You';
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

  async function logout() {
    await fetch(`${API}/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
      credentials: 'include',
    }).catch(() => {});
    window.location.href = '/signin';
  }

  return (
    <>
      <a className="bell" href="/approvals" aria-label={`Approvals${pending > 0 ? `, ${pending} pending` : ''}`} title="Approvals">
        <span aria-hidden style={{ display: 'inline-flex', width: 18, height: 18 }}>{ICONS.bell}</span>
        {pending > 0 && <span className="dot-alert" aria-hidden />}
      </a>
      <a className="userchip" href="/settings">
        <span className="avatar" aria-hidden>{initials}</span>
        <span>{name.split(' ')[0]}</span>
      </a>
      <button className="btn small" onClick={logout} aria-label="Sign out">
        Sign out
      </button>
    </>
  );
}

/** Legacy export kept for any stray imports — renders the new top tabs. */
export function PillNav() {
  return <TopTabs />;
}

export { ICONS };
