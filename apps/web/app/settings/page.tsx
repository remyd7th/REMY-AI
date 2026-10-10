'use client';
import { useEffect, useState } from 'react';
import { API, apif } from '../../lib/api';
import { currentWorkspace } from '../../components/WorkspaceBar';
import { PageHead } from '../../components/ui';
import { useTheme, type ThemeChoice } from '../../lib/theme';

interface Session { user?: { id: string; name?: string; email?: string } }

const THEME_OPTIONS: { id: ThemeChoice; title: string; desc: string; swatch: string }[] = [
  { id: 'light', title: 'Light Mode', desc: 'Bright, clean interface with white surfaces.', swatch: 'linear-gradient(135deg,#ffffff 60%,#f3f4f6 60%)' },
  { id: 'dark', title: 'Dark Mode', desc: 'Comfortable dark interface, easy on the eyes.', swatch: 'linear-gradient(135deg,#1f2937 60%,#111827 60%)' },
  { id: 'system', title: 'System Default', desc: 'Follows your device appearance setting.', swatch: 'linear-gradient(135deg,#ffffff 50%,#111827 50%)' },
];

type Section = 'appearance' | 'account' | 'preferences' | 'permissions' | 'integrations';

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [meetingTime, setMeetingTime] = useState('after 10am');
  const [emailTone, setEmailTone] = useState('short and professional');
  const [msg, setMsg] = useState('');
  const [section, setSection] = useState<Section>('appearance');
  const { choice, set } = useTheme();

  async function load() {
    try {
      const s = await fetch(`${API}/auth/get-session`, { credentials: 'include' }).then((r) => r.json());
      setSession(s);
      if (s?.user?.id) {
        const eff = await apif<Record<string, string>>(
          `/memories/effective?userId=${s.user.id}&workspaceId=${currentWorkspace()}`,
        ).catch((): Record<string, string> => ({}));
        if (eff.meeting_time) setMeetingTime(eff.meeting_time);
        if (eff.email_tone) setEmailTone(eff.email_tone);
      }
    } catch { /* offline */ }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const uid = session?.user?.id;
    if (!uid) return;
    const base = { userId: uid, workspaceId: currentWorkspace() };
    await apif('/memories', { method: 'POST', body: JSON.stringify({ ...base, key: 'meeting_time', value: meetingTime }) });
    await apif('/memories', { method: 'POST', body: JSON.stringify({ ...base, key: 'email_tone', value: emailTone }) });
    setMsg('Preferences saved.');
  }

  async function logout() {
    await fetch(`${API}/auth/sign-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: window.location.origin }, credentials: 'include',
    });
    window.location.href = '/signin';
  }

  const tabs: { id: Section; label: string }[] = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Working preferences' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'integrations', label: 'Integrations' },
  ];

  return (
    <>
      <PageHead title="Settings" sub="Your account, appearance, and how Remy works for you." />
      <div className="tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={section === t.id} onClick={() => setSection(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

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
        <div className="card">
          <b>Working preferences</b>
          <p className="muted small">Remy uses these when drafting and scheduling.</p>
          <p><label>Meetings <input value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} style={{ width: '100%' }} /></label></p>
          <p><label>Email tone <input value={emailTone} onChange={(e) => setEmailTone(e.target.value)} style={{ width: '100%' }} /></label></p>
          <button className="btn primary" onClick={save}>Save</button>
          {msg && <p className="muted">{msg}</p>}
        </div>
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
          <p className="muted small">Remy works with email, calendars, files, team chat, notes and payments. Status below is live — anything not connected is clearly marked and Remy drafts internally instead of pretending to use it.</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="badge b-quiet">Microsoft Outlook — see Integrations</span>
            <span className="badge b-quiet">Outlook Calendar — see Integrations</span>
            <span className="badge b-quiet">Google Drive — see Integrations</span>
            <span className="badge b-quiet">Slack — see Integrations</span>
            <span className="badge b-quiet">Notion — see Integrations</span>
            <span className="badge b-quiet">Paystack — see Integrations</span>
            <span className="badge b-quiet">Flutterwave — see Integrations</span>
          </div>
          <p style={{ marginTop: 10 }}>
            <a href="/integrations"><button className="btn primary">Manage integrations →</button></a>
          </p>
          <p className="muted small">Google (Gmail + Calendar) connects with OAuth when configured. Outlook, Slack, Notion, Paystack and Flutterwave show honest “Not available yet” status until credentials and adapters are configured — no fake Connected states.</p>
        </div>
      )}
    </>
  );
}
