'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';

interface Action { label: string; method: string; endpoint: string; body?: unknown }
interface Msg { from: 'me' | 'remy'; text: string; actions?: Action[]; via?: string }
interface Convo { id: string; title: string; at: number; msgs: Msg[] }

const KEY = 'remy-convos';

function loadConvos(): Convo[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

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
  const [convos, setConvos] = useState<Convo[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  // Voice input (Web Speech API): dictation lands in the same box, so voice
  // instructions flow through the identical draft → review → approve → send path.
  function dictate() {
    const SR = (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      persist(cur as string, (m) => [...m, { from: 'remy', text: 'Voice input is not supported in this browser — please type instead.' }]);
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (e: { results: { transcript: string }[][] }) => {
      setInput((s) => (s ? `${s} ` : '') + e.results[0][0].transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
  }

  useEffect(() => { setConvos(loadConvos()); }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(convos.slice(0, 20)));
    } catch { /* private mode */ }
  }, [convos]);

  const convo = convos.find((c) => c.id === cur);
  const msgs = convo?.msgs ?? [];

  function persist(id: string, updater: (m: Msg[]) => Msg[]) {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, msgs: updater(c.msgs) } : c)));
  }

  function start() {
    const id = `c-${Date.now()}`;
    setConvos((cs) => [{ id, title: 'New conversation', at: Date.now(), msgs: [] }, ...cs]);
    setCur(id);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    let id = cur;
    if (!id) {
      id = `c-${Date.now()}`;
      setConvos((cs) => [{ id: id as string, title: text.slice(0, 34), at: Date.now(), msgs: [] }, ...cs]);
      setCur(id);
    } else {
      setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, title: c.msgs.length === 0 ? text.slice(0, 34) : c.title } : c)));
    }
    const cid = id as string;
    persist(cid, (m) => [...m, { from: 'me', text }]);
    setBusy(true);
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
      persist(cid, (m) => [...m, { from: 'remy', text: '' }]);
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
              const t = reply;
              setConvos((cs) => cs.map((c) => {
                if (c.id !== cid) return c;
                const mm = [...c.msgs];
                mm[mm.length - 1] = { ...mm[mm.length - 1], text: t };
                return { ...c, msgs: mm };
              }));
            }
            if (evt.done) {
              actions = evt.suggestedActions ?? [];
              via = evt.via ?? '';
            }
          }
        }
      }
      setConvos((cs) => cs.map((c) => {
        if (c.id !== cid) return c;
        const mm = [...c.msgs];
        mm[mm.length - 1] = { ...mm[mm.length - 1], text: reply, actions, via };
        return { ...c, msgs: mm };
      }));
    } catch (e) {
      persist(cid, (m) => [...m, { from: 'remy', text: `Couldn't reach Remy: ${String(e)}` }]);
    }
    setBusy(false);
  }

  async function act(a: Action) {
    if (a.method !== 'GET' && !window.confirm(`${a.label}?`)) return;
    const out = await runAction(a);
    if (cur) persist(cur, (m) => [...m, { from: 'remy', text: out }]);
  }

  return (
    <div className="chat-layout">
      <aside className="card chat-history" aria-label="Conversation history">
        <button className="btn primary small" onClick={start}>+ New chat</button>
        <div className="hist-list">
          {convos.map((c) => (
            <button key={c.id} className={c.id === cur ? 'active' : ''} onClick={() => setCur(c.id)}>{c.title}</button>
          ))}
        </div>
        {convos.length === 0 && <p className="muted small">No conversations yet.</p>}
      </aside>
      <section className="card" aria-label="Remy conversation" aria-live="polite">
        <b>Remy AI conversation</b>
        <div style={{ margin: '12px 0' }}>
          {msgs.map((m, i) => (
            <div key={i}>
              <div className={`bubble ${m.from}`}>{m.text}{m.via && <div className="muted" style={{ fontSize: 11 }}>via {m.via}</div>}</div>
              <div className="row">
                {m.actions?.map((a, j) => <button key={j} className="chip" onClick={() => act(a)}>{a.label}</button>)}
              </div>
            </div>
          ))}
          {msgs.length === 0 && <p className="muted">Try: “Follow up with everyone I contacted this week.” Remy turns requests into workflow proposals.</p>}
        </div>
        <div className="row">
          <input style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask Remy… (or dictate with the mic)" aria-label="Message Remy" />
          <button className="btn" onClick={dictate} disabled={listening} aria-label="Dictate message">{listening ? '●' : '🎙'}</button>
          <button className="btn primary" onClick={send} disabled={busy}>{busy ? '…' : 'Send'}</button>
        </div>
      </section>
    </div>
  );
}
