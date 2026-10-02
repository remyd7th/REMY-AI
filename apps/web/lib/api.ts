export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export const DEMO_USER = 'demo-user';
export const DEMO_WORKSPACE = 'cmukn26260000vz0ob9gj9x8a';
const UID_KEY = 'remy-uid';

// Signed-in user id, persisted at sign-in/onboarding. Falls back to the
// legacy demo id (which the API now rejects without a session).
export function uid(): string {
  if (typeof window === 'undefined') return DEMO_USER;
  return window.localStorage.getItem(UID_KEY) ?? DEMO_USER;
}

export function storeUid(id: string) {
  try {
    window.localStorage.setItem(UID_KEY, id);
  } catch {
    /* private mode — session still works per-request */
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Authenticated fetch: carries the Better Auth session cookie. Use for
// every browser → API call; the API rejects sessionless requests (401).
export async function apif<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const qs = (workspaceId = DEMO_WORKSPACE, userId?: string) =>
  `workspaceId=${workspaceId}&userId=${userId ?? uid()}`;
