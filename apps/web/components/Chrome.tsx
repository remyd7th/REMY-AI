'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { API } from '../lib/api';

const LINKS: [string, string, string][] = [
  ['Today', '/today', '⌂'],
  ['Chat', '/chat', '💬'],
  ['Workflows', '/workflows', '⚙'],
  ['Approvals', '/approvals', '☑'],
  ['Tasks', '/tasks', '✓'],
  ['Calendar', '/calendar', '📅'],
  ['Activity', '/activity', '⚡'],
];

function isActive(path: string, href: string) {
  return path === href || (href !== '/today' && path.startsWith(href));
}

export function PillNav() {
  const path = usePathname();
  return (
    <nav className="pillnav" aria-label="Main">
      {LINKS.map(([label, href, icon]) => (
        <a key={href} href={href} className={isActive(path, href) ? 'active' : ''} aria-current={isActive(path, href) ? 'page' : undefined}>
          <span aria-hidden>{icon}</span> {label}
        </a>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <>
      {LINKS.map(([label, href, icon]) => (
        <a key={href} className={`sidelink${isActive(path, href) ? ' active' : ''}`} href={href} aria-current={isActive(path, href) ? 'page' : undefined}>
          <span className="sic" aria-hidden>{icon}</span> {label}
        </a>
      ))}
      <div className="side-assistant">
        <div style={{ fontSize: 20 }} aria-hidden>✦</div>
        <b>Your AI Executive Assistant</b>
        <p className="muted small" style={{ margin: '4px 0 0' }}>Work smarter. Get more done.</p>
      </div>
    </>
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
