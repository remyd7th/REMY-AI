'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';

type Status = 'checking' | 'verified' | 'unverified' | 'unavailable' | 'error';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/get-session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((s: { user?: { email?: string; emailVerified?: boolean } }) => {
        setEmail(s?.user?.email ?? '');
        setStatus(s?.user ? (s.user.emailVerified ? 'verified' : 'unverified') : 'error');
      })
      .catch(() => setStatus('error'));
  }, []);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setDetail('');
    try {
      const res = await fetch(`${API}/auth/send-verification-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, callbackURL: `${window.location.origin}/verify-email` }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus('unavailable');
        const msg = (json as { message?: string } | null)?.message;
        setDetail(
          msg && msg.length < 250
            ? msg
            : 'Verification email could not be sent — email delivery has not been configured yet. Contact your administrator.',
        );
        return;
      }
      setDetail('Verification email sent — check your inbox.');
    } catch {
      setStatus('unavailable');
      setDetail(`Could not reach the API at ${API}. Is it running?`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="hero">
        <b style={{ fontSize: 26 }}>Email verification.</b>
        <p style={{ fontSize: 15, maxWidth: 420 }}>
          Verification confirms you own your email address. A verification email is sent automatically when
          you register — click its link to verify.
        </p>
      </div>
      <div className="card">
        {status === 'checking' && <b>Checking…</b>}
        {status === 'verified' && (
          <>
            <b>Verified ✓</b>
            <p className="muted">Your email address is verified.</p>
            <a href="/today">
              <button className="btn primary">Continue →</button>
            </a>
          </>
        )}
        {(status === 'unverified' || status === 'unavailable' || status === 'error') && (
          <>
            <b>{status === 'error' ? 'Sign in first' : 'Not verified yet'}</b>
            {status === 'error' ? (
              <p className="muted">
                <a href="/signin">
                  <b>Sign in →</b>
                </a>
              </p>
            ) : (
              <>
                <p className="muted">
                  Signed in as <b>{email}</b>. No verification email yet? Check spam, then resend below.
                  Signing in works either way — verification just proves the address is yours.
                </p>
                <form onSubmit={resend}>
                  <button className="btn" type="submit" disabled={busy}>
                    {busy ? '…' : 'Resend verification email'}
                  </button>
                </form>
                {detail && (
                  <p role="status" className="muted">
                    {detail}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
