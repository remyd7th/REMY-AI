'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER, qs } from '../../lib/api';
import { currentWorkspace } from '../../components/WorkspaceBar';

interface Task { id: string; title: string; status: string; priority: string; dueAt: string | null }

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [ws, setWs] = useState('');

  const W = () => ws || currentWorkspace();

  async function load() {
    const w = W();
    if (!ws) setWs(w);
    const res = await fetch(`${API}/tasks?${qs(w)}`);
    setTasks(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title.trim()) return;
    await fetch(`${API}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: DEMO_USER, workspaceId: W(), title }) });
    setTitle('');
    load();
  }
  async function complete(id: string) {
    await fetch(`${API}/tasks/${id}/complete`, { method: 'POST' });
    load();
  }

  return (
    <div className="card">
      <b>Tasks</b>
      <div className="row" style={{ margin: '12px 0' }}>
        <input style={{ flex: 1 }} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="New task…" />
        <button className="btn primary" onClick={create}>Add</button>
      </div>
      {tasks.map((t) => (
        <p key={t.id}>• <b style={t.status === 'done' ? { textDecoration: 'line-through' } : {}}>{t.title}</b>
        <span className="muted"> [{t.priority}] {t.status}</span>
        {t.status !== 'done' && <button className="btn" style={{ marginLeft: 8 }} onClick={() => complete(t.id)}>Done</button>}</p>
      ))}
      {tasks.length === 0 && <p className="muted">No tasks.</p>}
    </div>
  );
}
