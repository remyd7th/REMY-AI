'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER, qs } from '../../lib/api';
import { currentWorkspace } from '../../components/WorkspaceBar';

interface Approval { id: string; action: string; status: string; payload: { body?: string; to?: string } }

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [ws, setWs] = useState('');

  const W = () => ws || currentWorkspace();

  async function load() {
    const w = W();
    if (!ws) setWs(w);
    const res = await fetch(`${API}/approvals?${qs(w)}`);
    setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, how: 'approve' | 'deny') {
    await fetch(`${API}/approvals/${id}/${how}`, { method: 'POST' });
    load();
  }

  const pending = items.filter((a) => a.status === 'pending');
  return (
    <div className="card">
      <b>Approvals {pending.length > 0 && <span className="badge b-attn">{pending.length} pending</span>}</b>
      {items.map((a) => (
        <div key={a.id} className="card" style={{ boxShadow: 'none' }}>
          <b>{a.action}</b> <span className={`badge ${a.status === 'pending' ? 'b-attn' : 'b-ok'}`}>{a.status}</span>
          {a.payload?.body && <p className="muted">{String(a.payload.body).slice(0, 200)}</p>}
          {a.status === 'pending' && (
            <div className="row">
              <button className="btn primary" onClick={() => decide(a.id, 'approve')}>Approve</button>
              <button className="btn danger" onClick={() => decide(a.id, 'deny')}>Deny</button>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <p className="muted">Nothing awaiting approval.</p>}
    </div>
  );
}
