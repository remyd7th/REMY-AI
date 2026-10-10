'use client';
import { useState } from 'react';
import { API, uid } from '../../../lib/api';
import { currentUserId } from '../../../components/WorkspaceBar';
import { metaOf } from '../../../lib/workspace';

const TYPES = ['personal', 'executive', 'client', 'team'];

export default function NewWorkspacePage() {
  const [name, setName] = useState('');
  const [type, setType] = useState('personal');
  const [person, setPerson] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');

  async function create() {
    if (!name.trim()) return;
    const res = await fetch(`${API}/workspaces`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uid(), name, type,
        prefs: {
          description: metaOf(type).description,
          ...(person.trim() ? { person: person.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }) });
    const ws = await res.json();
    setMsg(`Created ${ws.name}`);
    window.location.href = `/today?workspaceId=${ws.id}&userId=${currentUserId()}`;
  }

  const showExtra = type === 'client' || type === 'executive';

  return (
    <div className="card">
      <b>New workspace</b>
      <p className="muted">{metaOf(type).description}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah — CEO" style={{ flex: 1 }} aria-label="Workspace name" />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Workspace type">
          {TYPES.map((t) => <option key={t} value={t}>{metaOf(t).icon} {metaOf(t).label}</option>)}
        </select>
        <button className="btn primary" onClick={create}>Create</button>
      </div>
      {showExtra && (
        <>
          <p><label>Person / company <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="e.g. Sarah" style={{ width: '100%' }} /></label></p>
          <p><label>Email <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. sarah@company.com" style={{ width: '100%' }} /></label></p>
          <p><label>Notes <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="Anything Remy should know about this workspace" /></label></p>
        </>
      )}
      {msg && <p>{msg}</p>}
    </div>
  );
}
