'use client';
import { useState } from 'react';
import { API, storeUid } from '../lib/api';

type Mode = 'signin' | 'signup' | 'forgot';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyError(status: number, body: unknown): string {
  const b = body as { code?: string; message?: string } | null;
  const code = (b?.code ?? '').toUpperCase();
  if (code.includes('USER_ALREADY_EXISTS') || status === 422) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (code.includes('INVALID_EMAIL_OR_PASSWORD') || code.includes('INVALID_PASSWORD') || status === 401) {
    return 'Invalid email or password.';
  }
  if (code.includes('PASSWORD_TOO_SHORT')) return 'Password must be at least 8 characters.';
  if (code.includes('PASSWORD_TOO_LONG')) return 'That password is too long (max 128 characters).';
  if (code.includes('USER_NOT_FOUND')) return 'Invalid email or password.';
  if (code.includes('RESET_PASSWORD_DISABLED') || code.includes('EMAIL_NOT_CONFIGURED')) {
    return 'Password-reset email is not available yet — email delivery has not been configured. Contact your administrator.';
  }
  const msg = b?.message;
  if (msg && msg.length < 200) return msg;
  return 'Something went wrong. Please try again.';
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

export default function EmailPasswordForm({
  mode,
  next,
  onModeChange,
}: {
  mode: 'signin' | 'signup';
  next: string;
  onModeChange?: (m: 'signin' | 'signup') => void;
}) {
  const [view, setView] = useState<Mode>(mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  function switchView(v: Mode) {
    setView(v);
    setError('');
    setInfo('');
    onModeChange?.(v === 'forgot' ? mode : v);
  }

  function validate(): string {
    if (view === 'forgot') {
      if (!email.trim()) return 'Enter your email address.';
      if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
      return '';
    }
    if (view === 'signup' && !name.trim()) return 'Enter your name.';
    if (!email.trim()) return 'Enter your email address.';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (!password) return 'Enter your password.';
    if (view === 'signup' && password.length < 8) return 'Password must be at least 8 characters.';
    if (view === 'signup' && password !== confirm) return 'Passwords do not match.';
    return '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      if (view === 'forgot') {
        const { res, json } = await post('/request-password-reset', {
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (!res.ok) {
          setError(friendlyError(res.status, json));
        } else {
          setInfo(
            'If this email is registered, a reset link is on its way. ' +
              'If nothing arrives, email delivery may not be configured yet — contact your administrator.',
          );
        }
        return;
      }
      if (view === 'signup') {
        const { res, json } = await post('/sign-up/email', {
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: next,
        });
        if (!res.ok) {
          setError(friendlyError(res.status, json));
          return;
        }
        const uid = (json as { user?: { id?: string } } | null)?.user?.id;
        if (uid) storeUid(uid);
        window.location.href = next;
        return;
      }
      const { res, json } = await post('/sign-in/email', {
        email: email.trim(),
        password,
        rememberMe: true,
      });
      if (!res.ok) {
        setError(friendlyError(res.status, json));
        return;
      }
      const uid = (json as { user?: { id?: string } } | null)?.user?.id;
      if (uid) storeUid(uid);
      window.location.href = next;
    } catch {
      setError(`Could not reach the API at ${API}. Is it running?`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label={view === 'signup' ? 'Create account with email' : view === 'forgot' ? 'Reset password' : 'Sign in with email'}>
      {view === 'signup' && (
        <p>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ada Lovelace"
              autoComplete="name"
              style={{ width: '100%' }}
            />
          </label>
        </p>
      )}
      <p>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            style={{ width: '100%' }}
          />
        </label>
      </p>
      {view !== 'forgot' && (
        <p>
          <label>
            Password
            <span className="row" style={{ gap: 8 }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={view === 'signup' ? 'At least 8 characters' : 'Your password'}
                type={showPw ? 'text' : 'password'}
                autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
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
      )}
      {view === 'signup' && (
        <p>
          <label>
            Confirm password
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              style={{ width: '100%' }}
            />
          </label>
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--remy-danger)' }}>
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="muted">
          {info}
        </p>
      )}
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? '…' : view === 'signup' ? 'Create account' : view === 'forgot' ? 'Send reset link' : 'Sign in'}
        </button>
        {view === 'signin' && (
          <button type="button" className="link-btn" onClick={() => switchView('forgot')}>
            Forgot password?
          </button>
        )}
        {view === 'forgot' && (
          <button type="button" className="link-btn" onClick={() => switchView(mode)}>
            ← Back to sign in
          </button>
        )}
      </div>
      {view !== 'forgot' && (
        <p className="muted small">
          {view === 'signin' ? (
            <>
              New to Remy?{' '}
              <a href={`/get-started?next=${encodeURIComponent(next)}`}>
                <b>Create an account →</b>
              </a>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <a href={`/signin?next=${encodeURIComponent(next)}`}>
                <b>Sign in →</b>
              </a>
            </>
          )}
        </p>
      )}
    </form>
  );
}
