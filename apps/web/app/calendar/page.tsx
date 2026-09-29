'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER } from '../../lib/api';
import { currentWorkspace } from '../../components/WorkspaceBar';

interface Ev { id: string; title: string; startsAt: string; endsAt: string }

export default function CalendarPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [prep, setPrep] = useState<(Ev & { hasPrep: boolean })[]>([]);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [msg, setMsg] = useState('');
  const ws = currentWorkspace();

  async function load(w = ws) {
    const [e, p] = await Promise.all([
      fetch(`${API}/events?workspaceId=${w}&userId=${DEMO_USER}`).then((r) => r.json()),
      fetch(`${API}/events/needing-prep?workspaceId=${w}&userId=${DEMO_USER}`).then((r) => r.json()),
    ]);
    setEvents(e);
    setPrep(p);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setMsg('');
    const res = await fetch(`${API}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: DEMO_USER, workspaceId: ws, title, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }) });
    if (res.status === 409) {
      const j = await res.json();
      setMsg(`Conflict with "${j.with?.title ?? 'another meeting'}"`);
      return;
    }
    setTitle(''); setStart(''); setEnd('');
    load();
  }

  return (
    <>
      <div className="card">
        <b>Schedule a meeting</b>
        <div className="row" style={{ marginTop: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ flex: 1 }} />
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button className="btn primary" onClick={create}>Schedule</button>
        </div>
        {msg && <p><span className="badge b-over">Conflict</span> {msg}</p>}
      </div>
      <div className="card">
        <b>Needs prep {prep.filter((p) => !p.hasPrep).length > 0 && <span className="badge b-attn">action</span>}</b>
        {prep.map((m) => <p key={m.id}>• <b>{m.title}</b> <span className="muted">{m.startsAt.slice(0, 16).replace('T', ' ')}</span> {m.hasPrep ? <span className="badge b-ok">prepped</span> : <span className="badge b-attn">no prep</span>}</p>)}
        {prep.length === 0 && <p className="muted">Nothing in the next 24h.</p>}
      </div>
      <div className="card">
        <b>All meetings</b>
        {events.map((m) => <p key={m.id}>• <b>{m.title}</b> <span className="muted">{m.startsAt.slice(0, 16).replace('T', ' ')} → {m.endsAt.slice(11, 16)}</span></p>)}
        {events.length === 0 && <p className="muted">None yet.</p>}
      </div>
    </>
  );
}
