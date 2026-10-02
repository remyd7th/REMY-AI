'use client';
import { useEffect, useState } from 'react';
import { qs, apif } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';

interface Approval { id: string; action: string; status: string; payload: { body?: string; to?: string } }

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);

  const Q = () => qs(currentWorkspace(), currentUserId());

  async function load() {
    setItems(await apif<Approval[]>(`/approvals?${Q()}`));
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, how: 'approve' | 'deny') {
    await apif(`/approvals/${id}/${how}`, { method: 'POST' });
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
