'use client';

// Shared workspace state: one active workspace id across the app.
// Switching writes localStorage + URL param and fires WS_EVENT so every
// data page refetches in place — no full page reload.
export const WS_EVENT = 'remy:workspace';
const WS_KEY = 'remy-ws';

export const TYPE_META: Record<string, { label: string; icon: string; description: string }> = {
  personal: { label: 'Personal', icon: '🌿', description: 'Your personal tasks, reminders and activities.' },
  team: { label: 'Team', icon: '👥', description: 'Collaborate with your team and manage shared work.' },
  teams: { label: 'Team', icon: '👥', description: 'Collaborate with your team and manage shared work.' },
  executive: { label: 'Executive', icon: '💼', description: "Manage your executive's schedule, tasks, communications and priorities." },
  client: { label: 'Client', icon: '🏢', description: 'Manage client tasks, communications, documents and follow-ups.' },
};

export function metaOf(type?: string) {
  return TYPE_META[(type ?? 'personal').toLowerCase()] ?? TYPE_META.personal;
}

export function readActiveId(fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  return new URLSearchParams(window.location.search).get('workspaceId')
    ?? window.localStorage.getItem(WS_KEY)
    ?? fallback;
}

export function writeActiveId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WS_KEY, id);
  } catch { /* private mode */ }
  const url = new URL(window.location.href);
  url.searchParams.set('workspaceId', id);
  window.history.replaceState(null, '', url.toString());
  window.dispatchEvent(new CustomEvent(WS_EVENT, { detail: id }));
}

/** Re-run `load` whenever the active workspace changes (mount loads separately). */
export function onWorkspaceChange(load: () => void): () => void {
  const h = () => load();
  window.addEventListener(WS_EVENT, h);
  return () => window.removeEventListener(WS_EVENT, h);
}
