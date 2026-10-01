'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import GoogleButton from '../../components/GoogleButton';

interface Session { user?: { name?: string; email?: string; image?: string } }

export default function SignInPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  async function load() {
    try {
      const res = await fetch(`${API}/auth/get-session`, { credentials: 'include' });
      setSession(await res.json());
    } catch {
      setSession(null);
    }
  }
  useEffect(() => { load(); }, []);

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
      <div className="card">
        <b>Signed in as {session.user.name ?? session.user.email}</b>
        <p className="muted">{session.user.email}</p>
        <div className="row">
          <a href="/today"><button className="btn primary">Open dashboard</button></a>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <b>Sign in to Remy AI</b>
      <p className="muted">One account — Google connects your calendar and Gmail and creates your Remy profile. No passwords.</p>
      <GoogleButton />
      <p className="muted">New here? Same button — signing in creates your account automatically.</p>
    </div>
  );
}
