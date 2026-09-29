'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER } from '../../lib/api';
import { currentWorkspace } from '../../components/WorkspaceBar';

interface Fu { id: string; kind: string; refId: string; status: string; dueAt: string | null }

export default function FollowupsPage() {
  const [items, setItems] = useState<Fu[]>([]);
  const ws = currentWorkspace();

  async function load(w = ws) {
    const res = await fetch(`${API}/followups/due?workspaceId=${w}&userId=${DEMO_USER}`);
    setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function scan() {
    await fetch(`${API}/followups/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: DEMO_USER, workspaceId: ws }) });
    load();
  }
  async function act(id: string, how: 'nudge' | 'resolve') {
    await fetch(`${API}/followups/${id}/${how}`, { method: 'POST' });
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
