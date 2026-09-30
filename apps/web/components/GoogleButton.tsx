'use client';
import { useState } from 'react';
import { API } from '../lib/api';

export default function GoogleButton() {
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: 'google', callbackURL: `${window.location.origin}/` }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn sun" onClick={connect} disabled={busy}>
      {busy ? '…' : 'Connect Google'}
    </button>
  );
}
