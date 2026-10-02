'use client';
import { useEffect, useState } from 'react';
import { API, uid } from '../../lib/api';
import { currentWorkspace } from '../../components/WorkspaceBar';

interface Rule { action: string; level: string; scope: string }

const ACTIONS = ['sendEmail', 'schedule', 'shareDoc', 'payment'];

export default function PermissionsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const ws = currentWorkspace();

  async function load() {
    const res = await fetch(`${API}/permissions?userId=${uid()}`, { credentials: 'include' });
    setRules(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function set(action: string, level: string) {
    await fetch(`${API}/permissions`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid(), scope: 'global', action, level }) });
    load();
  }

  const level = (a: string) => rules.find((r) => r.action === a)?.level ?? 'ask (default)';

  return (
    <div className="card">
      <b>Permission center</b>
      <p className="muted">What Remy may do alone. <b>ask</b> creates an approval card · <b>never</b> blocks · <b>always</b> executes + logs.</p>
      {ACTIONS.map((a) => (
        <div key={a} className="row" style={{ margin: '10px 0' }}>
          <b style={{ minWidth: 120 }}>{a}</b>
          <span className="badge b-info">{level(a)}</span>
          {(['always', 'ask', 'never'] as const).map((l) => (
            <button key={l} className="btn" onClick={() => set(a, l)}>{l}</button>
          ))}
        </div>
      ))}
      <p className="muted">Workspace: {ws} (global rules apply everywhere; per-workspace scoping next)</p>
      <a href="/approvals"><button className="btn primary">Review approvals</button></a>
    </div>
  );
}
