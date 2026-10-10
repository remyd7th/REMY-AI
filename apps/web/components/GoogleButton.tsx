'use client';
import { useState } from 'react';
import { API } from '../lib/api';

export default function GoogleButton({ callbackPath }: { callbackPath?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: 'google', callbackURL: `${window.location.origin}${callbackPath ?? '/'}` }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (json as { message?: string } | null)?.message ?? 'no details from server';
        setError(`Sign-in failed (${res.status}): ${msg}`);
        return;
      }
      if (json && (json as { url?: string }).url) window.location.href = (json as { url: string }).url;
      else setError(`No sign-in URL returned. Is the API running at ${API}?`);
    } catch (e) {
      setError(`Could not reach the API at ${API}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn sun" onClick={connect} disabled={busy}>
        {busy ? '…' : 'Continue with Google'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
