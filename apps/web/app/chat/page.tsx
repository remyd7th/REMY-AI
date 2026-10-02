'use client';
import { useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';

interface Action { label: string; method: string; endpoint: string; body?: unknown }
interface Msg { from: 'me' | 'remy'; text: string; actions?: Action[]; via?: string }

async function runAction(a: Action): Promise<string> {
  const path = a.endpoint.startsWith('/api') ? a.endpoint.slice(4) : a.endpoint;
  const res = await fetch(`${API}${path}`, {
    method: a.method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: a.body ? JSON.stringify(a.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return `Action failed (${res.status}).`;
  if (Array.isArray(json)) return `Done — ${json.length} item${json.length === 1 ? '' : 's'}.`;
  return `Done — ${a.label}.`;
}

export default function ChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { from: 'me', text }]);
    setBusy(true);
    const idx = msgs.length + 1;
    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId(), workspaceId: currentWorkspace(), message: text }),
      });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let reply = '';
      let actions: Action[] = [];
      let via = '';
      setMsgs((m) => [...m, { from: 'remy', text: '' }]);
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const p of parts) {
            const line = p.trim();
            if (!line.startsWith('data:')) continue;
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.token) {
              reply += evt.token;
              const text = reply;
              setMsgs((m) => m.map((mm, i) => (i === idx ? { ...mm, text } : mm)));
            }
            if (evt.done) {
              actions = evt.suggestedActions ?? [];
              via = evt.via ?? '';
            }
          }
        }
      }
      setMsgs((m) => m.map((mm, i) => (i === idx ? { ...mm, text: reply, actions, via } : mm)));
    } catch (e) {
      setMsgs((m) => [...m, { from: 'remy', text: `Couldn't reach Remy: ${String(e)}` }]);
    }
    setBusy(false);
  }

  async function act(a: Action) {
    if (a.method !== 'GET' && !window.confirm(`${a.label}?`)) return;
    setBusy(true);
    const out = await runAction(a);
    setBusy(false);
    setMsgs((m) => [...m, { from: 'remy', text: out }]);
  }

  return (
    <div className="card">
      <b>Chat with Remy</b>
      <div style={{ margin: '12px 0' }}>
        {msgs.map((m, i) => (
          <div key={i}>
            <div className={`bubble ${m.from}`}>{m.text}{m.via && <div className="muted" style={{ fontSize: 11 }}>via {m.via}</div>}</div>
            <div className="row">
              {m.actions?.map((a, j) => <button key={j} className="chip" onClick={() => act(a)}>{a.label}</button>)}
            </div>
          </div>
        ))}
        {msgs.length === 0 && <p className="muted">Try: “organize my tasks for tomorrow” or “what needs my attention?”</p>}
      </div>
      <div className="row">
        <input style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask Remy…" />
        <button className="btn primary" onClick={send} disabled={busy}>{busy ? '…' : 'Send'}</button>
      </div>
    </div>
  );
}
