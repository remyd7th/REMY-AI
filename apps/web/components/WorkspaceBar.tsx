'use client';
import { useEffect, useState } from 'react';
import { DEMO_WORKSPACE, apif, uid } from '../lib/api';

interface Ws { id: string; name: string; type: string }

export function currentWorkspace(): string {
  if (typeof window === 'undefined') return DEMO_WORKSPACE;
  return new URLSearchParams(window.location.search).get('workspaceId') ?? DEMO_WORKSPACE;
}

export function currentUserId(): string {
  if (typeof window === 'undefined') return uid();
  return new URLSearchParams(window.location.search).get('userId') ?? uid();
}

export function withWorkspace(path: string, ws: string): string {
  const [base, query] = path.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('workspaceId', ws);
  if (!params.get('userId')) params.set('userId', currentUserId());
  return `${base}?${params.toString()}`;
}

export default function WorkspaceBar() {
  const [list, setList] = useState<Ws[]>([]);
  const [cur, setCur] = useState(DEMO_WORKSPACE);

  useEffect(() => {
    setCur(currentWorkspace());
    apif<Ws[]>(`/workspaces?workspaceId=${currentWorkspace()}&userId=${currentUserId()}`).then(setList).catch(() => {});
  }, []);

  return (
    <div className="wsbar">
      <b>Workspace</b>
      <select
        value={cur}
        onChange={(e) => { window.location.href = withWorkspace(window.location.pathname + window.location.search, e.target.value); }}
      >
        {list.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
        {list.length === 0 && <option value={cur}>My Work</option>}
      </select>
      <a href="/workspaces/new"><button className="btn">+ New</button></a>
    </div>
  );
}
