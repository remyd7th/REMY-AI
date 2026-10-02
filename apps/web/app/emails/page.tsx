'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';

interface Email { id: string; from: string; subject: string; snippet: string | null; importance: string; needsReply: boolean; status: string }

export default function EmailsPage() {
  const [items, setItems] = useState<Email[]>([]);
  const [imp, setImp] = useState('');
  const [onlyReply, setOnlyReply] = useState(false);
  const [sel, setSel] = useState<{ subject: string; from: string; preview: string; wordCount: number } | null>(null);
  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [dTo, setDTo] = useState('');
  const [dMsg, setDMsg] = useState('');

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;
  const auth = { credentials: 'include' as const, headers: { 'Content-Type': 'application/json' } };

  async function load() {
    const p = new URLSearchParams({ workspaceId: currentWorkspace(), userId: currentUserId() });
    if (imp) p.set('importance', imp);
    if (onlyReply) p.set('needsReply', 'true');
    setItems(await fetch(`${API}/emails?${p}`, { credentials: 'include' }).then((r) => r.json()));
  }
  useEffect(() => { load(); }, []);

  async function ingest() {
    if (!from.trim() || !subject.trim()) return;
    const q = new URLSearchParams(Q());
    await fetch(`${API}/emails/ingest`, { ...auth, method: 'POST',
      body: JSON.stringify({ userId: q.get('userId'), workspaceId: q.get('workspaceId'), from, subject, importance: 'normal', needsReply: true }) });
    setFrom(''); setSubject('');
    load();
  }

  async function summarize(id: string) {
    setSel(await fetch(`${API}/emails/${id}/summary`, { credentials: 'include' }).then((r) => r.json()));
  }

  async function draft() {
    if (!dTo.trim()) return;
    const q = new URLSearchParams(Q());
    const ap = await fetch(`${API}/emails/draft`, { ...auth, method: 'POST',
      body: JSON.stringify({ userId: q.get('userId'), workspaceId: q.get('workspaceId'), to: dTo, purpose: 'follow-up', tone: 'friendly' }) }).then((r) => r.json());
    setDMsg(`Draft pending approval: ${ap.id}`);
    setDTo('');
  }

  async function markReplied(id: string) {
    await fetch(`${API}/emails/${id}/replied`, { ...auth, method: 'PATCH' });
    load();
  }

  return (
    <>
      <div className="card">
        <div className="row"><b>Inbox</b>
          <select value={imp} onChange={(e) => setImp(e.target.value)}>
            <option value="">all importance</option><option value="high">high</option><option value="normal">normal</option><option value="low">low</option>
          </select>
          <label><input type="checkbox" checked={onlyReply} onChange={(e) => setOnlyReply(e.target.checked)} /> needs reply</label>
          <button className="btn" onClick={load}>Filter</button>
        </div>
        {items.map((m) => (
          <div className="item" key={m.id}>
            <div className="dot" style={{ background: m.importance === 'high' ? '#ff3b30' : '#06b6d4' }} />
            <div style={{ flex: 1 }}>
              <b>{m.subject}</b> <span className="muted">from {m.from} [{m.importance}]{m.needsReply && ' · needs reply'}</span>
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn" onClick={() => summarize(m.id)}>Summarize</button>
                {m.needsReply && <button className="btn" onClick={() => markReplied(m.id)}>Mark replied</button>}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="muted">No emails match.</p>}
        {sel && <div className="card" style={{ boxShadow: 'none' }}><b>{sel.subject}</b><p>{sel.preview}</p><p className="muted">{sel.wordCount} words · from {sel.from}</p></div>}
      </div>
      <div className="grid2">
        <div className="card">
          <b>Log an email</b>
          <p><input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" style={{ width: '100%' }} /></p>
          <p><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={{ width: '100%' }} /></p>
          <button className="btn primary" onClick={ingest}>Add (needs reply)</button>
        </div>
        <div className="card">
          <b>Draft follow-up</b>
          <p><input value={dTo} onChange={(e) => setDTo(e.target.value)} placeholder="To (name)" style={{ width: '100%' }} /></p>
          <button className="btn primary" onClick={draft}>Draft → approval</button>
          {dMsg && <p>{dMsg}</p>}
        </div>
      </div>
    </>
  );
}
