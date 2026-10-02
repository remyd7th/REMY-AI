'use client';
import { useState } from 'react';
import { API, uid } from '../../../lib/api';
import { currentUserId, currentWorkspace } from '../../../components/WorkspaceBar';

export default function NewWorkspacePage() {
  const [name, setName] = useState('');
  const [type, setType] = useState('personal');
  const [msg, setMsg] = useState('');

  async function create() {
    if (!name.trim()) return;
    const res = await fetch(`${API}/workspaces`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid(), name, type }) });
    const ws = await res.json();
    setMsg(`Created ${ws.name}`);
    window.location.href = `/today?workspaceId=${ws.id}&userId=${currentUserId()}`;
  }

  return (
    <div className="card">
      <b>New workspace</b>
      <div className="row" style={{ marginTop: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah — CEO" style={{ flex: 1 }} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="personal">personal</option>
          <option value="executive">executive</option>
          <option value="client">client</option>
          <option value="team">team</option>
        </select>
        <button className="btn primary" onClick={create}>Create</button>
      </div>
      {msg && <p>{msg}</p>}
      <p className="muted">Current: {currentWorkspace()}</p>
    </div>
  );
}
