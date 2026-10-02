'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { PageHead, Empty } from '../../components/ui';

interface Wf { id: string; name: string; description: string; trigger: string; steps: unknown[]; status: string; lastRunAt: string | null }

export default function WorkflowsPage() {
  const [items, setItems] = useState<Wf[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;
  const auth = { credentials: 'include' as const, headers: { 'Content-Type': 'application/json' } };
  const ids = () => {
    const p = new URLSearchParams(Q());
    return { userId: p.get('userId')!, workspaceId: p.get('workspaceId')! };
  };

  async function load() {
    setItems(await fetch(`${API}/workflows?${Q()}`, { credentials: 'include' }).then((r) => r.json()));
  }
  useEffect(() => { load(); }, []);

  async function seed() {
    await fetch(`${API}/workflows/seed`, { ...auth, method: 'POST', body: JSON.stringify(ids()) });
    load();
  }

  async function create() {
    if (!name.trim()) return;
    await fetch(`${API}/workflows`, { ...auth, method: 'POST',
      body: JSON.stringify({ ...ids(), name, description: '', trigger: 'manual', steps: [] }) });
    setName('');
    load();
  }

  async function run(id: string) {
    setMsg('Running…');
    const run = await fetch(`${API}/workflows/${id}/run`, { ...auth, method: 'POST', body: JSON.stringify(ids()) }).then((r) => r.json());
    setMsg(`Run completed — ${run.log.length} tasks created. See Tasks.`);
    load();
  }

  async function toggle(w: Wf) {
    await fetch(`${API}/workflows/${w.id}`, { ...auth, method: 'PATCH', body: JSON.stringify({ status: w.status === 'active' ? 'paused' : 'active' }) });
    load();
  }

  return (
    <>
      <PageHead
        title="Workflows"
        sub="Automate the repetitive work you do every day. A run turns each step into a tracked task — side-effects still need your approval."
        action={<div className="row"><button className="btn" onClick={seed}>Seed starters</button></div>}
      />
      <div className="card">
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New workflow name…" style={{ flex: 1 }} />
          <button className="btn primary" onClick={create}>+ Create workflow</button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>
      {items.length === 0 && <Empty>No workflows yet. Seed the starter set above.</Empty>}
      <div className="grid2">
        {items.map((w) => (
          <div className="card" key={w.id}>
            <div className="row">
              <b>{w.name}</b>
              <span className={`badge ${w.status === 'active' ? 'b-ok' : 'b-quiet'}`}>● {w.status}</span>
            </div>
            <p className="muted small">{w.description || 'No description.'}</p>
            <p className="small"><b>Trigger:</b> {w.trigger} · <b>{w.steps.length} steps</b>{w.lastRunAt ? ` · last run ${w.lastRunAt.slice(0, 10)}` : ' · never run'}</p>
            <ol className="workflow-steps">
              {(w.steps as string[]).map((s, i) => <li key={i} data-n={i + 1}>{s}</li>)}
            </ol>
            <div className="row">
              <button className="btn primary small" onClick={() => run(w.id)}>Run workflow</button>
              <button className="btn small" onClick={() => toggle(w)}>{w.status === 'active' ? 'Pause' : 'Activate'}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
