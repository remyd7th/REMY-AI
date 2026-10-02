'use client';
import { useEffect, useState } from 'react';
import { qs, apif } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';

interface Task { id: string; title: string; status: string; priority: string; dueAt: string | null }

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');

  const Q = () => qs(currentWorkspace(), currentUserId());

  async function load() {
    setTasks(await apif<Task[]>(`/tasks?${Q()}`));
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title.trim()) return;
    const p = new URLSearchParams(Q());
    await apif('/tasks', { method: 'POST', body: JSON.stringify({ userId: p.get('userId'), workspaceId: p.get('workspaceId'), title }) });
    setTitle('');
    load();
  }
  async function complete(id: string) {
    await apif(`/tasks/${id}/complete`, { method: 'POST' });
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
