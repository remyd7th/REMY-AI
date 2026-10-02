'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { PageHead, Tabs, ApprovalCard, Empty } from '../../components/ui';

interface Approval { id: string; action: string; status: string; payload: { body?: string; to?: string; subject?: string } }

type Tab = 'pending' | 'approved' | 'rejected';

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;
  const auth = { credentials: 'include' as const, headers: { 'Content-Type': 'application/json' } };

  async function load() {
    setItems(await fetch(`${API}/approvals?${Q()}`, { credentials: 'include' }).then((r) => r.json()));
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, how: 'approve' | 'deny') {
    await fetch(`${API}/approvals/${id}/${how}`, { ...auth, method: 'POST' });
    load();
  }

  async function saveEdit(a: Approval) {
    await fetch(`${API}/approvals/${a.id}`, { ...auth, method: 'PATCH',
      body: JSON.stringify({ payload: { ...a.payload, body: draft } }) });
    setEditing(null);
    load();
  }

  const counts = (s: string) => items.filter((a) => a.status === (s === 'rejected' ? 'denied' : s)).length;
  const shown = items.filter((a) => (tab === 'rejected' ? a.status === 'denied' : a.status === tab));

  return (
    <>
      <PageHead title="Approvals" sub="Review actions before Remy executes them. Sending emails, messages, calendar changes and payments always wait for you." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pending', label: 'Pending', count: counts('pending') },
          { id: 'approved', label: 'Approved', count: counts('approved') },
          { id: 'rejected', label: 'Rejected', count: counts('rejected') },
        ]}
      />
      {shown.length === 0 && <Empty>{tab === 'pending' ? 'Nothing waiting — enjoy the calm.' : `No ${tab} approvals.`}</Empty>}
      {shown.map((a) => (
        <div key={a.id}>
          <ApprovalCard
            action={a.action}
            body={editing === a.id ? undefined : a.payload?.body}
            channel={a.payload?.to ? `To ${a.payload.to}` : undefined}
            status={a.status}
            onApprove={a.status === 'pending' ? () => decide(a.id, 'approve') : undefined}
            onDeny={a.status === 'pending' ? () => decide(a.id, 'deny') : undefined}
            onEdit={a.status === 'pending' ? () => { setDraft(a.payload?.body ?? ''); setEditing(a.id); } : undefined}
          />
          {editing === a.id && (
            <div className="card">
              <b>Edit draft</b>
              <p><textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ width: '100%' }} aria-label="Edit draft body" /></p>
              <div className="row">
                <button className="btn primary" onClick={() => saveEdit(a)}>Save</button>
                <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
