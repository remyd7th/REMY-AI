'use client';
import { useEffect, useState } from 'react';
import { API, storeUid } from '../../lib/api';
import GoogleButton from '../../components/GoogleButton';
import EmailPasswordForm from '../../components/EmailPasswordForm';
import { InstallButton } from '../../lib/pwa';

interface Session { user?: { id: string; name?: string; email?: string } }

export default function SignInPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [next, setNext] = useState('/today');
  const [autoGo, setAutoGo] = useState(false);

  useEffect(() => {
    try {
      const n = new URLSearchParams(window.location.search).get('next');
      if (n && n.startsWith('/') && !n.startsWith('//')) {
        setNext(n);
        setAutoGo(true);
      }
    } catch { /* ignore */ }
    load();
  }, []);

  async function load() {
    try {
      const res = await fetch(`${API}/auth/get-session`, { credentials: 'include' });
      const s = await res.json();
      setSession(s);
      if (s?.user?.id) storeUid(s.user.id);
    } catch {
      setSession(null);
    }
  }
  useEffect(() => {
    if (session?.user && autoGo) {
      try {
        if (window.location.pathname === '/signin') window.location.href = next;
      } catch { /* ignore */ }
    }
  }, [session, next, autoGo]);

  async function logout() {
    await fetch(`${API}/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
      credentials: 'include',
    });
    load();
  }

  if (session === undefined) return <div className="card"><b>Checking session…</b></div>;

  if (session?.user) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '48px auto' }}>
        <b>Signed in as {session.user.name ?? session.user.email}</b>
        <p className="muted">{session.user.email}</p>
        <div className="row">
          <a href={next}><button className="btn primary">Continue →</button></a>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid2">
      <div className="hero">
        <b style={{ fontSize: 26 }}>Welcome back.</b>
        <p style={{ fontSize: 15, maxWidth: 420 }}>Remy is your intelligent AI work assistant.</p>
        <p style={{ fontSize: 14 }}>It helps you <b>organize</b>, <b>assist</b>, <b>suggest</b> and <b>execute</b> — while you stay in control.</p>
        <p style={{ fontSize: 14 }}><span className="hl">Nothing</span> sends, schedules or shares without your rule.</p>
        <p className="muted" style={{ color: '#fff', fontSize: 13 }}>Tasks · Calendar · Email · Follow-ups · Docs · Dashboard</p>
      </div>
      <div className="card">
        <b>Sign in</b>
        <p className="muted">Existing Remy account. Use Google, or your email and password.</p>
        <GoogleButton callbackPath={`/signin?next=${encodeURIComponent(next)}`} />
        <div className="row" style={{ alignItems: 'center', margin: '12px 0' }} aria-hidden>
          <span style={{ flex: 1, borderTop: 'var(--remy-border)' }} />
          <span className="muted small" style={{ padding: '0 10px' }}>or</span>
          <span style={{ flex: 1, borderTop: 'var(--remy-border)' }} />
        </div>
        <EmailPasswordForm mode="signin" next={next} />
        <div className="install-row">
          <span className="muted small">Prefer the app?</span> <InstallButton />
        </div>
      </div>
    </div>
  );
}
