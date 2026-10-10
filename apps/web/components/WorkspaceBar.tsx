'use client';
import { useEffect, useState } from 'react';
import { DEMO_WORKSPACE, apif, uid } from '../lib/api';
import { WS_EVENT, metaOf, readActiveId, writeActiveId } from '../lib/workspace';

interface Ws { id: string; name: string; type: string; prefs?: { description?: string } }

export function currentWorkspace(): string {
  if (typeof window === 'undefined') return DEMO_WORKSPACE;
  return readActiveId(DEMO_WORKSPACE);
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

const TYPE_ORDER = ['personal', 'executive', 'client', 'team'];

function typeKey(t: string): string {
  const k = (t ?? 'personal').toLowerCase();
  return k === 'teams' ? 'team' : k;
}

/** Workspace selector — sits at the top of the sidebar, visually distinct from Chat. */
export default function WorkspaceBar() {
  const [list, setList] = useState<Ws[]>([]);
  const [cur, setCur] = useState(DEMO_WORKSPACE);

  useEffect(() => {
    setCur(currentWorkspace());
    apif<Ws[]>(`/workspaces?workspaceId=${currentWorkspace()}&userId=${currentUserId()}`).then((ws) => {
      setList(ws);
      if (ws.length === 0) return;
      if (!ws.some((w) => w.id === currentWorkspace())) {
        const personal = ws.find((w) => typeKey(w.type) === 'personal') ?? ws[0];
        setCur(personal.id);
        writeActiveId(personal.id);
      }
    }).catch(() => {});
    const h = (e: Event) => setCur((e as CustomEvent<string>).detail ?? currentWorkspace());
    window.addEventListener(WS_EVENT, h);
    return () => window.removeEventListener(WS_EVENT, h);
  }, []);

  function switchTo(id: string) {
    if (id === '__new__') {
      window.location.href = '/workspaces/new';
      return;
    }
    setCur(id);
    writeActiveId(id);
  }

  return (
    <div className="ws-side" aria-label="Workspace selector">
      <div className="caption" style={{ margin: '0 2px 6px' }}>Workspace</div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        {list.length === 0 ? (
          <a href="/workspaces/new" style={{ flex: 1 }}><button className="btn small primary" style={{ width: '100%', margin: 0 }}>+ New workspace</button></a>
        ) : (
          <select
            value={cur} onChange={(e) => switchTo(e.target.value)} aria-label="Active workspace"
            style={{ flex: 1, minWidth: 0 }}
          >
            {TYPE_ORDER.map((t) => {
              const group = list.filter((w) => typeKey(w.type) === t);
              if (group.length === 0) return null;
              return (
                <optgroup key={t} label={metaOf(t).label}>
                  {group.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </optgroup>
              );
            })}
            <option value="__new__">+ New workspace…</option>
          </select>
        )}
        <a href="/workspaces/new" aria-label="New workspace" style={{ flex: 'none' }}>
          <button className="btn small" style={{ margin: 0 }} aria-hidden>+</button>
        </a>
      </div>
    </div>
  );
}
