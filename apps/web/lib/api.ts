export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export const DEMO_USER = 'demo-user';
export const DEMO_WORKSPACE = 'cmukn26260000vz0ob9gj9x8a';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const qs = (workspaceId = DEMO_WORKSPACE, userId = DEMO_USER) =>
  `workspaceId=${workspaceId}&userId=${userId}`;
