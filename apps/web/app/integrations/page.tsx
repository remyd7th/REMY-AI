'use client';
import { useEffect, useState } from 'react';
import { apif } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { onWorkspaceChange } from '../../lib/workspace';
import { PageHead, Empty } from '../../components/ui';
import GoogleButton from '../../components/GoogleButton';

interface Provider {
  name: string; icon: string; desc: string;
  kind: 'google' | 'coming';
}

const GROUPS: { title: string; items: Provider[] }[] = [
  {
    title: 'Communication',
    items: [
      { name: 'Gmail', icon: '✉', desc: 'Send and read mail through approvals.', kind: 'google' },
      { name: 'Outlook', icon: '📨', desc: 'Microsoft mail and accounts.', kind: 'coming' },
      { name: 'Slack', icon: '💬', desc: 'Team messages and notifications.', kind: 'coming' },
    ],
  },
  {
    title: 'Calendar',
    items: [
      { name: 'Google Calendar', icon: '📅', desc: 'Meetings, prep and reminders.', kind: 'google' },
      { name: 'Outlook Calendar', icon: '🗓', desc: 'Microsoft calendar events.', kind: 'coming' },
    ],
  },
  {
    title: 'Productivity',
    items: [
      { name: 'Google Drive', icon: '📁', desc: 'Documents and attachments.', kind: 'coming' },
      { name: 'Notion', icon: '📝', desc: 'Notes and knowledge base.', kind: 'coming' },
    ],
  },
  {
    title: 'Payments',
    items: [
      { name: 'Paystack', icon: '💳', desc: 'Accept and track payments.', kind: 'coming' },
      { name: 'Flutterwave', icon: '💸', desc: 'Payments across Africa.', kind: 'coming' },
    ],
  },
];

export default function IntegrationsPage() {
  const [connected, setConnected] = useState<boolean | null>(null);

  async function load() {
    try {
      const s = await apif<{ connected: boolean }>(`/google/status?userId=${currentUserId()}&workspaceId=${currentWorkspace()}`);
      setConnected(s.connected);
    } catch {
      setConnected(null);
    }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => onWorkspaceChange(load), []);

  return (
    <>
      <PageHead title="Integrations" sub="Connect the tools Remy works with. Anything not connected is clearly marked — Remy never pretends to use it." />
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h2 className="section-h">{g.title}</h2>
          <div className="grid2">
            {g.items.map((p) => (
              <div className="card" key={p.name}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b><span aria-hidden>{p.icon}</span> {p.name}</b>
                  {p.kind === 'google' ? (
                    connected === null ? <span className="badge b-quiet">…</span>
                    : connected ? <span className="badge b-ok">● Connected</span>
                    : <span className="badge b-attn">○ Not connected</span>
                  ) : (
                    <span className="badge b-quiet">Not available yet</span>
                  )}
                </div>
                <p className="muted small">{p.desc}</p>
                {p.kind === 'google' && !connected && <GoogleButton />}
                {p.kind === 'google' && connected && (
                  <p className="muted small">Signed in with Google — Gmail and Calendar are live.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {connected === null && <Empty>Sign in to see connection status.</Empty>}
    </>
  );
}
