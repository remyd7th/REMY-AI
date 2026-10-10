'use client';
import { useEffect, useState } from 'react';
import { API, apif } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { WS_EVENT } from '../../lib/workspace';
import { ACTIVE_CONVO_KEY, emitApprovalsChanged, emitChatDone, useNotificationsOptional } from '../../lib/notifications';

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
  const [wsName, setWsName] = useState('');
  const notify = useNotificationsOptional();

  async function loadWsName() {
    try {
      const ws = await apif<{ id: string; name: string; type: string }[]>(
        `/workspaces?workspaceId=${currentWorkspace()}&userId=${currentUserId()}`,
      );
      const active = ws.find((w) => w.id === currentWorkspace());
      setWsName(active ? `${active.name} (${active.type})` : '');
    } catch { /* offline — chat still sends with the raw id */ }
  }

  useEffect(() => {
    loadWsName();
    const h = () => loadWsName();
    window.addEventListener(WS_EVENT, h);
    return () => window.removeEventListener(WS_EVENT, h);
  }, []);

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

  useEffect(() => {
    const stored = loadConvos();
    setConvos(stored);
    // Deep link from toast notifications: /chat?convo=<id>
    try {
      const id = new URLSearchParams(window.location.search).get('convo');
      if (id && stored.some((c) => c.id === id)) {
        setCur(id);
      }
      if (id) {
        const url = new URL(window.location.href);
        url.searchParams.delete('convo');
        window.history.replaceState(null, '', url.toString());
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(convos.slice(0, 20)));
    } catch { /* private mode */ }
  }, [convos]);

  const convo = convos.find((c) => c.id === cur);
  const msgs = convo?.msgs ?? [];

  // Track which conversation is on screen so the notification hub can tell
  // "user already sees this response" apart from "response arrived in background".
  useEffect(() => {
    try {
      if (cur) window.localStorage.setItem(ACTIVE_CONVO_KEY, cur);
    } catch { /* private mode */ }
    if (cur) notify?.markConvoRead(cur);
    return () => {
      try {
        if (window.localStorage.getItem(ACTIVE_CONVO_KEY) === cur) {
          window.localStorage.removeItem(ACTIVE_CONVO_KEY);
        }
      } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  function selectConvo(id: string) {
    setCur(id);
    notify?.markConvoRead(id);
  }

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
    const msgId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
      const ok = reply.trim().length > 0;
      if (ok) {
        // Merge into localStorage directly so the response survives even if the
        // user navigated away mid-stream (component unmounted before completion).
        try {
          const stored = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as Convo[];
          const idx = stored.findIndex((c) => c.id === cid);
          if (idx >= 0) {
            const mm = [...stored[idx].msgs];
            if (mm.length > 0 && mm[mm.length - 1].from === 'remy') {
              mm[mm.length - 1] = { ...mm[mm.length - 1], text: reply, actions, via };
            }
            stored[idx] = { ...stored[idx], msgs: mm };
            window.localStorage.setItem(KEY, JSON.stringify(stored.slice(0, 20)));
          }
        } catch { /* private mode */ }
        emitChatDone(cid, reply, msgId);
        // Chat responses can create approval requests server-side.
        emitApprovalsChanged();
      }
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
            <button key={c.id} className={c.id === cur ? 'active' : ''} onClick={() => selectConvo(c.id)}>
              {c.title}
              {(notify?.chatUnreadByConvo[c.id] ?? 0) > 0 && (
                <span className="side-badge side-badge-chat" aria-label={`${notify?.chatUnreadByConvo[c.id]} unread`}>
                  {(notify?.chatUnreadByConvo[c.id] ?? 0) > 99 ? '99+' : notify?.chatUnreadByConvo[c.id]}
                </span>
              )}
            </button>
          ))}
        </div>
        {convos.length === 0 && <p className="muted small">No conversations yet.</p>}
      </aside>
      <section className="card" aria-label="Remy conversation" aria-live="polite">
        <b>Remy AI conversation</b>
        {wsName && <div className="muted small" style={{ marginTop: 2 }}>Remy is working in: {wsName}</div>}
        <div style={{ margin: '12px 0' }}>
          {msgs.map((m, i) => (
            <div key={i}>
              <div className={`bubble ${m.from}`}>{m.text}{m.via === 'stub' && <div className="muted" style={{ fontSize: 11 }}>offline mode</div>}</div>
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
