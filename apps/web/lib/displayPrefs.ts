'use client';

import { apif } from './api';
import { currentWorkspace } from '../components/WorkspaceBar';

// Display preferences (Settings → Working preferences → Regional).
// Stored per user in global memories scope; cached per session.
// Genuinely applied by the Calendar live clock and the Today header.
export interface DisplayPrefs {
  timezone: string;
  dateFormat: 'mon-day' | 'day-mon' | 'iso';
  timeFormat: '12h' | '24h';
}

export const DEFAULT_DISPLAY: DisplayPrefs = { timezone: '', dateFormat: 'mon-day', timeFormat: '12h' };

let cache: { at: number; prefs: DisplayPrefs } | null = null;

function sanitize(raw: Record<string, string>): DisplayPrefs {
  const dateFormat = raw.display_date_format === 'day-mon' || raw.display_date_format === 'iso' ? raw.display_date_format : 'mon-day';
  const timeFormat = raw.display_time_format === '24h' ? '24h' : '12h';
  let timezone = (raw.display_timezone ?? '').trim().slice(0, 60);
  try {
    if (timezone) new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    else timezone = '';
  } catch {
    timezone = '';
  }
  return { timezone, dateFormat, timeFormat };
}

export async function loadDisplayPrefs(userId: string): Promise<DisplayPrefs> {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.prefs;
  try {
    const rows = await apif<{ key: string; value: string; workspaceId: string | null }[]>(
      `/memories?userId=${userId}&workspaceId=${currentWorkspace()}`,
    );
    const ws = currentWorkspace();
    const raw: Record<string, string> = {};
    for (const key of ['display_timezone', 'display_date_format', 'display_time_format']) {
      const hit = rows.find((r) => r.key === key && r.workspaceId === ws)
        ?? rows.find((r) => r.key === key && (r.workspaceId === null || r.scope === 'global'));
      if (hit) raw[key] = hit.value;
    }
    cache = { at: Date.now(), prefs: sanitize(raw) };
    return cache.prefs;
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function clearDisplayPrefsCache() {
  cache = null;
}

function tz(prefs: DisplayPrefs): string | undefined {
  return prefs.timezone || undefined;
}

export function formatDateLine(date: Date, prefs: DisplayPrefs): string {
  const timeZone = tz(prefs);
  if (prefs.dateFormat === 'iso') {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const weekday = new Intl.DateTimeFormat([], { timeZone, weekday: 'long' }).format(date);
    return `${weekday}, ${parts}`;
  }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const month = get('month');
  const day = get('day');
  return prefs.dateFormat === 'day-mon' ? `${weekday}, ${day} ${month}` : `${weekday}, ${month} ${day}`;
}

export function formatClockTime(date: Date, prefs: DisplayPrefs, seconds = false): string {
  return new Intl.DateTimeFormat([], {
    timeZone: tz(prefs), hour: 'numeric', minute: '2-digit',
    ...(seconds ? { second: '2-digit' as const } : {}),
    hour12: prefs.timeFormat === '12h',
  }).format(date);
}
