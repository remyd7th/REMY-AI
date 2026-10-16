'use client';
import { useEffect, useState } from 'react';
import { API, apif } from '../../lib/api';
import { currentWorkspace } from '../../components/WorkspaceBar';
import { PageHead } from '../../components/ui';
import { useTheme, type ThemeChoice } from '../../lib/theme';
import { NOTIF_PREFS_EVENT } from '../../lib/notifications';
import { clearDisplayPrefsCache } from '../../lib/displayPrefs';

interface Session { user?: { id: string; name?: string; email?: string } }
interface MemoryRow { id: string; key: string; value: string; scope: string; workspaceId: string | null }
interface Access { isSuperAdmin: boolean }

const THEME_OPTIONS: { id: ThemeChoice; title: string; desc: string; swatch: string }[] = [
  { id: 'light', title: 'Light Mode', desc: 'Bright, clean interface with white surfaces.', swatch: 'linear-gradient(135deg,#ffffff 60%,#f3f4f6 60%)' },
  { id: 'dark', title: 'Dark Mode', desc: 'Comfortable dark interface, easy on the eyes.', swatch: 'linear-gradient(135deg,#1f2937 60%,#111827 60%)' },
  { id: 'system', title: 'System Default', desc: 'Follows your device appearance setting.', swatch: 'linear-gradient(135deg,#ffffff 50%,#111827 50%)' },
];

type Section = 'appearance' | 'account' | 'preferences' | 'permissions' | 'integrations' | 'administration';

const LANGUAGES = ['English', 'French', 'Spanish', 'German', 'Portuguese', 'Italian', 'Dutch', 'Yoruba', 'Igbo', 'Hausa'];
const TIMEZONES = (() => {
  try {
    const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    return all.filter((z) => z.includes('/')).slice(0, 400);
  } catch {
    return ['UTC', 'Africa/Lagos', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'];
  }
})();

const DEFAULTS: Record<string, string> = {
  ai_response_length: 'balanced',
  ai_tone: 'professional',
  ai_language: 'English',
  ai_action_oriented: 'true',
  email_tone: 'short and professional',
  tasks_sort: 'due',
  display_timezone: '',
  display_date_format: 'mon-day',
  display_time_format: '12h',
  notif_approvals: 'true',
  notif_chat: 'true',
  notif_poll_ms: '20000',
  proactivity_muted: 'false',
};

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="switch-knob" aria-hidden />
    </button>
  );
}

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [section, setSection] = useState<Section>('appearance');
  const [prefs, setPrefs] = useState<Record<string, string>>({ ...DEFAULTS });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const { choice, set } = useTheme();

  const setPref = (key: string, value: string) => setPrefs((p) => ({ ...p, [key]: value }));

  async function load() {
    try {
      const s = await fetch(`${API}/auth/get-session`, { credentials: 'include' }).then((r) => r.json());
      setSession(s);
      if (s?.user?.id) {
        const ws = currentWorkspace();
        const rows = await apif<MemoryRow[]>(`/memories?userId=${s.user.id}&workspaceId=${ws}`).catch((): MemoryRow[] => []);
        const next = { ...DEFAULTS };
        for (const key of Object.keys(DEFAULTS)) {
          const scoped = rows.find((r) => r.key === key && r.workspaceId === ws)
            ?? rows.find((r) => r.key === key && r.scope === 'global');
          if (scoped) next[key] = scoped.value;
        }
        // Legacy free-text values map onto the new selects where they match.
        setPrefs(next);
        apif<Access>('/admin/access').then((a) => setIsSuperAdmin(a.isSuperAdmin)).catch(() => {});
      }
    } catch { /* offline */ }
  }
  useEffect(() => { load(); }, []);

  function validate(): string | null {
    if (!['concise', 'balanced', 'detailed'].includes(prefs.ai_response_length)) return 'Choose a valid response length.';
    if (!['professional', 'friendly', 'formal'].includes(prefs.ai_tone)) return 'Choose a valid tone.';
    if (!prefs.ai_language.trim()) return 'Preferred language is required.';
    if (!['due', 'priority', 'created'].includes(prefs.tasks_sort)) return 'Choose a valid task sort.';
    if (prefs.display_timezone.trim()) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: prefs.display_timezone.trim() });
      } catch {
        return 'That time zone is not recognized. Pick one from the list.';
      }
    }
    if (!['mon-day', 'day-mon', 'iso'].includes(prefs.display_date_format)) return 'Choose a valid date format.';
    if (!['12h', '24h'].includes(prefs.display_time_format)) return 'Choose a valid time format.';
    if (!['10000', '20000', '60000'].includes(prefs.notif_poll_ms)) return 'Choose a valid check frequency.';
    return null;
  }

  async function save() {
    const uid = session?.user?.id;
    if (!uid || saving) return;
    const problem = validate();
    if (problem) { setErr(problem); setMsg(''); return; }
    setSaving(true);
    setErr('');
    try {
      const ws = currentWorkspace();
      for (const key of Object.keys(DEFAULTS)) {
        await apif('/memories', {
          method: 'POST',
          body: JSON.stringify({ userId: uid, workspaceId: ws, key, value: prefs[key] }),
        });
      }
      clearDisplayPrefsCache();
      window.dispatchEvent(new Event(NOTIF_PREFS_EVENT));
      setMsg('Preferences saved. They apply immediately and persist across sign-ins.');
    } catch {
      setErr('Could not save preferences. Check your connection and retry.');
      setMsg('');
    } finally {
      setSaving(false);
    }
  }

  async function resetDefaults() {
    setPrefs({ ...DEFAULTS });
    setErr('');
    setMsg('Defaults restored below — press Save to apply them.');
  }

  async function logout() {
    await fetch(`${API}/auth/sign-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: window.location.origin }, credentials: 'include',
    });
    window.location.href = '/signin';
  }

  const groups: { label: string; items: { id: Section; label: string }[] }[] = [
    { label: 'Personal', items: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'account', label: 'Account' },
      { id: 'preferences', label: 'Working preferences' },
    ] },
    { label: 'Workspace and access', items: [
      { id: 'permissions', label: 'Permissions' },
      { id: 'integrations', label: 'Integrations' },
    ] },
    { label: 'Administration', items: [
      { id: 'administration', label: 'Admin' },
    ] },
  ];

  return (
    <>
      <PageHead title="Settings" sub="Personalize your workspace, manage connections, and control how Remy AI works for you." />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="side-section-label">{g.label}</div>
              {g.items.map((t) => (
                <button
                  key={t.id} role="tab" aria-selected={section === t.id}
                  className={`sidelink settings-link${section === t.id ? ' active' : ''}`}
                  onClick={() => setSection(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'appearance' && (
            <div className="card">
              <b>Appearance</b>
              <p className="muted small">Choose how Remy AI looks. Your choice is saved and applies everywhere.</p>
              <div className="theme-options" role="radiogroup" aria-label="Theme">
                {THEME_OPTIONS.map((o) => (
                  <button key={o.id} className="theme-option" role="radio"
                    aria-checked={choice === o.id} aria-pressed={choice === o.id}
                    onClick={() => set(o.id)}>
                    <div className="theme-swatch" style={{ background: o.swatch }} aria-hidden />
                    <b>{o.title}{choice === o.id ? ' — selected' : ''}</b>
                    <span>{o.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {section === 'account' && (
            <div className="card">
              <b>Account</b>
              {session?.user ? (
                <>
                  <p><b>{session.user.name ?? session.user.email}</b></p>
                  <p className="muted">{session.user.email}</p>
                  <button className="btn" onClick={logout}>Sign out</button>
                </>
              ) : (
                <p className="muted">Not signed in. <a href="/signin"><b>Sign in →</b></a></p>
              )}
            </div>
          )}

          {section === 'preferences' && (
            <>
              <div className="card">
                <b>AI responses</b>
                <p className="muted small">Shapes how Remy replies in chat — length, tone, language, and action-first style.</p>
                <div className="settings-grid">
                  <label className="field-label">Response length
                    <select value={prefs.ai_response_length} onChange={(e) => setPref('ai_response_length', e.target.value)}>
                      <option value="concise">Concise</option>
                      <option value="balanced">Balanced</option>
                      <option value="detailed">Detailed</option>
                    </select>
                  </label>
                  <label className="field-label">Communication tone
                    <select value={prefs.ai_tone} onChange={(e) => setPref('ai_tone', e.target.value)}>
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="formal">Formal</option>
                    </select>
                  </label>
                  <label className="field-label">Preferred language
                    <select value={LANGUAGES.includes(prefs.ai_language) ? prefs.ai_language : 'English'} onChange={(e) => setPref('ai_language', e.target.value)}>
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                  <label className="field-label">Default email tone
                    <select value={['short and professional', 'friendly', 'formal', 'concise'].includes(prefs.email_tone) ? prefs.email_tone : 'short and professional'} onChange={(e) => setPref('email_tone', e.target.value)}>
                      <option value="short and professional">Short and professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="formal">Formal</option>
                      <option value="concise">Concise</option>
                    </select>
                    <small>Used for drafts when your message doesn&apos;t specify a tone.</small>
                  </label>
                </div>
                <div className="settings-switch-row">
                  <div><b>Action-oriented answers</b><p className="muted small">Remy leads with what to do next and offers follow-up actions.</p></div>
                  <Switch on={prefs.ai_action_oriented !== 'false'} onChange={(v) => setPref('ai_action_oriented', v ? 'true' : 'false')} label="Action-oriented answers" />
                </div>
              </div>

              <div className="card">
                <b>Work organization</b>
                <p className="muted small">Task defaults plus how dates and times display across Remy.</p>
                <div className="settings-grid">
                  <label className="field-label">Default task sort
                    <select value={prefs.tasks_sort} onChange={(e) => setPref('tasks_sort', e.target.value)}>
                      <option value="due">Due date</option>
                      <option value="priority">Priority</option>
                      <option value="created">Recently added</option>
                    </select>
                    <small>Applied when the Tasks page loads.</small>
                  </label>
                  <label className="field-label">Time zone
                    <input value={prefs.display_timezone} onChange={(e) => setPref('display_timezone', e.target.value)} placeholder="e.g. Africa/Lagos" list="tz-list" />
                    <datalist id="tz-list">{TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
                    <small>Blank means your device time zone. Used by the Calendar clock.</small>
                  </label>
                  <label className="field-label">Date format
                    <select value={prefs.display_date_format} onChange={(e) => setPref('display_date_format', e.target.value)}>
                      <option value="mon-day">Oct 15</option>
                      <option value="day-mon">15 Oct</option>
                      <option value="iso">2026-10-15</option>
                    </select>
                  </label>
                  <label className="field-label">Time format
                    <select value={prefs.display_time_format} onChange={(e) => setPref('display_time_format', e.target.value)}>
                      <option value="12h">12-hour (2:30 PM)</option>
                      <option value="24h">24-hour (14:30)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="card">
                <b>Notifications</b>
                <p className="muted small">In-app alerts only — Remy sends no emails or push messages.</p>
                <div className="settings-switch-row">
                  <div><b>Approval alerts</b><p className="muted small">Toast when new requests need your review.</p></div>
                  <Switch on={prefs.notif_approvals !== 'false'} onChange={(v) => setPref('notif_approvals', v ? 'true' : 'false')} label="Approval alerts" />
                </div>
                <div className="settings-switch-row">
                  <div><b>Chat reply alerts</b><p className="muted small">Toast when Remy finishes a response while you&apos;re elsewhere.</p></div>
                  <Switch on={prefs.notif_chat !== 'false'} onChange={(v) => setPref('notif_chat', v ? 'true' : 'false')} label="Chat reply alerts" />
                </div>
                <div className="settings-switch-row">
                  <div><b>Morning briefings &amp; suggestions</b><p className="muted small">Daily briefings and proactive suggestions.</p></div>
                  <Switch on={prefs.proactivity_muted !== 'true'} onChange={(v) => setPref('proactivity_muted', v ? 'false' : 'true')} label="Morning briefings and suggestions" />
                </div>
                <label className="field-label" style={{ maxWidth: 280 }}>Check for updates every
                  <select value={prefs.notif_poll_ms} onChange={(e) => setPref('notif_poll_ms', e.target.value)}>
                    <option value="10000">10 seconds</option>
                    <option value="20000">20 seconds</option>
                    <option value="60000">1 minute</option>
                  </select>
                </label>
              </div>

              {err && <p className="admin-alert" role="alert">{err}</p>}
              {msg && <p className="admin-notice" role="status">{msg}</p>}
              <div className="row">
                <button className="btn primary" onClick={save} disabled={saving || !session?.user}>{saving ? 'Saving…' : 'Save preferences'}</button>
                <button className="btn" onClick={resetDefaults}>Reset to defaults</button>
              </div>
            </>
          )}

          {section === 'permissions' && (
            <div className="card">
              <b>Permissions</b>
              <p className="muted small">Control what Remy may do alone vs ask first — per action, always / ask / never.</p>
              <a href="/permissions"><button className="btn primary">Open permission rules →</button></a>
              <p className="muted small" style={{ marginTop: 8 }}>Your existing rules are preserved on the Permissions page.</p>
            </div>
          )}

          {section === 'integrations' && (
            <div className="card">
              <b>Integrations</b>
              <p className="muted small">Remy works with email, calendars, files, team chat, notes and payments. Google (Gmail + Calendar) connects with OAuth when configured. Others show honest “Not available yet” status until credentials and adapters are configured.</p>
              <p style={{ marginTop: 10 }}>
                <a href="/integrations"><button className="btn primary">Manage integrations →</button></a>
              </p>
            </div>
          )}

          {section === 'administration' && (
            <>
              <div className="card">
                <b>Admin</b>
                <p className="muted small">Visible to every signed-in user. Opens your access level, organization info, and only the actions you&apos;re authorized to use.</p>
                <a href="/organization-admin"><button className="btn primary">Open Admin →</button></a>
              </div>
              {isSuperAdmin && (
                <div className="card">
                  <b>Super Admin Portal</b>
                  <p className="muted small">Platform-wide user, organization, session, and audit administration. Restricted to the designated Super Admin.</p>
                  <a href="/admin"><button className="btn primary">Open Super Admin Portal →</button></a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
