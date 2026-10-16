'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      setToken(new URLSearchParams(window.location.search).get('token') ?? '');
    } catch {
      /* ignore */
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('This reset link is missing its token. Request a new one from the sign-in page.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword: password, token }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const code = String((json as { code?: string } | null)?.code ?? '').toUpperCase();
        setError(
          code.includes('INVALID_TOKEN')
            ? 'This reset link is invalid or has expired. Request a new one from the sign-in page.'
            : code.includes('PASSWORD_TOO_SHORT')
              ? 'Password must be at least 8 characters.'
              : 'Could not reset your password. Request a new link and try again.',
        );
        return;
      }
      setDone(true);
    } catch {
      setError(`Could not reach the API at ${API}. Is it running?`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="hero">
        <b style={{ fontSize: 26 }}>Reset your password.</b>
        <p style={{ fontSize: 15, maxWidth: 420 }}>Choose a new password for your Remy account.</p>
      </div>
      <div className="card">
        {done ? (
          <>
            <b>Password updated ✓</b>
            <p className="muted">Your password was changed. All other sessions were signed out.</p>
            <a href="/signin">
              <button className="btn primary">Sign in →</button>
            </a>
          </>
        ) : (
          <form onSubmit={submit} noValidate aria-label="Reset password">
            <p>
              <label>
                New password
                <span className="row" style={{ gap: 8 }}>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    style={{ width: '100%' }}
                  />
                  <button
                    type="button"
                    className="btn small"
                    aria-pressed={showPw}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((s) => !s)}
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            </p>
            <p>
              <label>
                Confirm new password
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  style={{ width: '100%' }}
                />
              </label>
            </p>
            {error && (
              <p role="alert" style={{ color: 'var(--remy-danger)' }}>
                {error}
              </p>
            )}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? '…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
