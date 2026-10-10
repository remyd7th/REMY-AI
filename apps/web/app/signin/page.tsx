'use client';
import { useEffect, useState } from 'react';
import { API, storeUid } from '../../lib/api';
import GoogleButton from '../../components/GoogleButton';
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
        <p className="muted">Existing Remy account. One click with Google — no passwords.</p>
        <GoogleButton callbackPath={`/signin?next=${encodeURIComponent(next)}`} />
        <p className="muted">New to Remy? <a href="/get-started"><b>Get started →</b></a></p>
        <div className="install-row">
          <span className="muted small">Prefer the app?</span> <InstallButton />
        </div>
      </div>
    </div>
  );
}
