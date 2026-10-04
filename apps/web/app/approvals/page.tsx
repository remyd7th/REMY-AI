'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { PageHead, Tabs, ApprovalCard, Empty } from '../../components/ui';

interface Approval {
  id: string; action: string; status: string;
  payload: {
    body?: string; subject?: string;
    to?: string | string[]; cc?: string | string[]; bcc?: string | string[];
    attachments?: string[]; unresolved?: string[];
  };
}

const listOf = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : (v ? [v] : []);

type Tab = 'pending' | 'approved' | 'rejected';

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [toDraft, setToDraft] = useState('');
  const [ccDraft, setCcDraft] = useState('');
  const [bccDraft, setBccDraft] = useState('');
  const [subjectDraft, setSubjectDraft] = useState('');
  const [notice, setNotice] = useState('');

  const csv = (v: string | string[] | undefined) => listOf(v).join(', ');
  const startEdit = (a: Approval) => {
    setDraft(a.payload?.body ?? '');
    setToDraft(csv(a.payload?.to));
    setCcDraft(csv(a.payload?.cc));
    setBccDraft(csv(a.payload?.bcc));
    setSubjectDraft(a.payload?.subject ?? '');
    setEditing(a.id);
  };
  const splitCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

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
      body: JSON.stringify({ payload: {
        ...a.payload,
        to: splitCsv(toDraft),
        cc: splitCsv(ccDraft),
        bcc: splitCsv(bccDraft),
        subject: subjectDraft,
        body: draft,
        unresolved: [],
      } }) });
    setEditing(null);
    load();
  }

  async function execute(a: Approval) {
    setNotice('');
    const res = await fetch(`${API}/approvals/execute`, { ...auth, method: 'POST',
      body: JSON.stringify({ userId: currentUserId(), workspaceId: currentWorkspace(), action: a.action, approvalId: a.id }) });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json as { message?: string })?.message ?? `Execute failed (${res.status}).`;
      setNotice(Array.isArray(msg) ? msg.join(' ') : String(msg));
      return;
    }
    const delivered = (json as { delivered?: unknown })?.delivered;
    setNotice(`Sent — ${JSON.stringify(delivered)}`);
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
      {notice && <p role="status">{notice}</p>}
      {shown.length === 0 && <Empty>{tab === 'pending' ? 'Nothing waiting — enjoy the calm.' : `No ${tab} approvals.`}</Empty>}
      {shown.map((a) => (
        <div key={a.id}>
          <ApprovalCard
            action={a.action}
            body={editing === a.id ? undefined : a.payload?.body}
            channel={listOf(a.payload?.to).length > 0 ? `To ${listOf(a.payload?.to).join(', ')}` : undefined}
            cc={listOf(a.payload?.cc).length > 0 ? `CC ${listOf(a.payload?.cc).join(', ')}` : undefined}
            bcc={listOf(a.payload?.bcc).length > 0 ? `BCC ${listOf(a.payload?.bcc).join(', ')}` : undefined}
            subject={a.payload?.subject}
            attachments={a.payload?.attachments}
            unresolved={a.payload?.unresolved}
            status={a.status}
            onApprove={a.status === 'pending' ? () => decide(a.id, 'approve') : undefined}
            onDeny={(a.status === 'pending' || a.status === 'approved') ? () => decide(a.id, 'deny') : undefined}
            onEdit={(a.status === 'pending' || a.status === 'approved') ? () => startEdit(a) : undefined}
            onExecute={a.status === 'approved' ? () => execute(a) : undefined}
          />
          {editing === a.id && (
            <div className="card">
              <b>Edit draft</b>
              <p><label>To (comma-separated) <input value={toDraft} onChange={(e) => setToDraft(e.target.value)} style={{ width: '100%' }} aria-label="Edit recipients" /></label></p>
              <p><label>CC <input value={ccDraft} onChange={(e) => setCcDraft(e.target.value)} style={{ width: '100%' }} aria-label="Edit CC recipients" /></label></p>
              <p><label>BCC <input value={bccDraft} onChange={(e) => setBccDraft(e.target.value)} style={{ width: '100%' }} aria-label="Edit BCC recipients" /></label></p>
              <p><label>Subject <input value={subjectDraft} onChange={(e) => setSubjectDraft(e.target.value)} style={{ width: '100%' }} aria-label="Edit subject" /></label></p>
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
