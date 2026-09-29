'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER, DEMO_WORKSPACE } from '../lib/api';

interface Ws { id: string; name: string; type: string }

export function currentWorkspace(): string {
  if (typeof window === 'undefined') return DEMO_WORKSPACE;
  return new URLSearchParams(window.location.search).get('workspaceId') ?? DEMO_WORKSPACE;
}

export function withWorkspace(path: string, ws: string): string {
  const [base, query] = path.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('workspaceId', ws);
  return `${base}?${params.toString()}`;
}

export default function WorkspaceBar() {
  const [list, setList] = useState<Ws[]>([]);
  const [cur, setCur] = useState(DEMO_WORKSPACE);

  useEffect(() => {
    setCur(currentWorkspace());
    fetch(`${API}/workspaces?userId=${DEMO_USER}`).then((r) => r.json()).then(setList).catch(() => {});
  }, []);

  return (
    <div className="row" style={{ marginBottom: 12 }}>
      <b>Workspace:</b>
      <select
        value={cur}
        onChange={(e) => { window.location.href = withWorkspace(window.location.pathname, e.target.value); }}
      >
        {list.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
        {list.length === 0 && <option value={cur}>My Work</option>}
      </select>
      <a href="/workspaces/new"><button className="btn">+ New</button></a>
    </div>
  );
}
