'use client';
import { useState } from 'react';
import { API, DEMO_USER, DEMO_WORKSPACE } from '../../lib/api';

interface Action { label: string; method: string; endpoint: string; body?: unknown }
interface Msg { from: 'me' | 'remy'; text: string; actions?: Action[]; via?: string }

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
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: DEMO_USER, workspaceId: DEMO_WORKSPACE, message: text }),
      });
      const json = await res.json();
      setMsgs((m) => [...m, { from: 'remy', text: json.reply, actions: json.suggestedActions ?? [], via: json.via }]);
    } catch (e) {
      setMsgs((m) => [...m, { from: 'remy', text: `API unreachable: ${String(e)}` }]);
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <b>Chat with Remy</b>
      <div style={{ margin: '12px 0' }}>
        {msgs.map((m, i) => (
          <div key={i}>
            <div className={`bubble ${m.from}`}>{m.text}{m.via && <div className="muted" style={{ fontSize: 11 }}>via {m.via}</div>}</div>
            {m.actions?.map((a, j) => <span key={j} className="chip" style={{ marginRight: 6 }}>{a.label} → {a.method} {a.endpoint}</span>)}
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
