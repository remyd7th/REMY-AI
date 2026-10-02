'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';

interface Fu { id: string; kind: string; refId: string; status: string; dueAt: string | null }

export default function FollowupsPage() {
  const [items, setItems] = useState<Fu[]>([]);

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;
  const auth = { credentials: 'include' as const, headers: { 'Content-Type': 'application/json' } };

  async function load() {
    const res = await fetch(`${API}/followups/due?${Q()}`, { credentials: 'include' });
    setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function scan() {
    const q = new URLSearchParams(Q());
    await fetch(`${API}/followups/scan`, { ...auth, method: 'POST',
      body: JSON.stringify({ userId: q.get('userId'), workspaceId: q.get('workspaceId') }) });
    load();
  }
  async function act(id: string, how: 'nudge' | 'resolve') {
    await fetch(`${API}/followups/${id}/${how}`, { ...auth, method: 'POST' });
    load();
  }

  return (
    <div className="card">
      <div className="row"><b>Follow-ups</b><button className="btn" onClick={scan}>Scan now</button></div>
      {items.map((f) => (
        <p key={f.id}>• <b>{f.kind}</b> <span className="muted">{f.status}{f.dueAt ? ` due ${f.dueAt.slice(0, 10)}` : ''}</span>
        <button className="btn" style={{ marginLeft: 8 }} onClick={() => act(f.id, 'nudge')}>Nudge</button>
        <button className="btn" onClick={() => act(f.id, 'resolve')}>Resolve</button></p>
      ))}
      {items.length === 0 && <p className="muted">Nothing outstanding. Run a scan anytime.</p>}
    </div>
  );
}
