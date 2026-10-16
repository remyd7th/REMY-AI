'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API, apif, qs } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { WS_EVENT } from '../../lib/workspace';
import { emitApprovalsChanged, emitChatDone, useNotificationsOptional } from '../../lib/notifications';

interface Action { label: string; method: string; endpoint: string; body?: unknown }
interface Msg { id: string; role: 'user' | 'assistant'; content: string; actions: Action[]; createdAt?: string; pending?: boolean; failed?: boolean }
interface Convo { id: string; title: string; createdAt: string; updatedAt: string }
interface PendingRequest { conversationId: string; clientMessageId: string; text: string }

const SUGGESTIONS = [
  'Help me organize my tasks for today.',
  'Draft an email for me.',
  'Summarize this document.',
  'Help me prepare for my next meeting.',
  'Show me my overdue tasks.',
  'Create a follow-up for a client.',
  'Help me plan my week.',
];

function scope() { return qs(currentWorkspace(), currentUserId()); }
function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function ChatPage() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [wsName, setWsName] = useState('');
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingRequest | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const notify = useNotificationsOptional();

  const loadWsName = useCallback(async () => {
    try {
      const ws = await apif<{ id: string; name: string; type: string }[]>(`/workspaces?${scope()}`);
      const active = ws.find((w) => w.id === currentWorkspace());
      setWsName(active ? `${active.name} (${active.type})` : '');
    } catch { setWsName(''); }
  }, []);

  const loadConversations = useCallback(async (preferred: string | null = null) => {
    setLoading(true);
    setError('');
    try {
      const result = await apif<Convo[]>(`/chat/conversations?${scope()}`);
      setConvos(result);
      const wanted = preferred;
      const nextId = wanted && result.some((item) => item.id === wanted) ? wanted : null;
      setCur(nextId);
      if (nextId) {
        const history = await apif<Omit<Msg, 'pending' | 'failed'>[]>(`/chat/conversations/${encodeURIComponent(nextId)}/messages?${scope()}`);
        setMsgs(history.map((message) => ({ ...message, actions: Array.isArray(message.actions) ? message.actions : [] })));
      } else setMsgs([]);
    } catch (e) {
      setError(e instanceof Error ? `Chat history is unavailable: ${e.message}` : 'Chat history is unavailable.');
      setConvos([]);
      setMsgs([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadWsName();
    void loadConversations(null);
    const onWorkspace = () => { loadWsName(); void loadConversations(null); };
    window.addEventListener(WS_EVENT, onWorkspace);
    return () => window.removeEventListener(WS_EVENT, onWorkspace);
  }, [loadConversations, loadWsName]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: busy ? 'smooth' : 'auto', block: 'end' }); }, [msgs, busy]);
  useEffect(() => { if (cur) notify?.markConvoRead(cur); }, [cur, msgs.length, notify]);

  const convo = useMemo(() => convos.find((item) => item.id === cur) ?? null, [convos, cur]);

  async function start() {
    setError('');
    try {
      const created = await apif<Convo>('/chat/conversations', {
        method: 'POST', body: JSON.stringify({ userId: currentUserId(), workspaceId: currentWorkspace() }),
      });
      setConvos((items) => [created, ...items]);
      setCur(created.id);
      setMsgs([]);
      pendingRef.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start a conversation.'); }
  }

  async function selectConvo(id: string) {
    if (busyRef.current) return;
    setCur(id);
    setMsgs([]);
    setError('');
    setLoading(true);
    try {
      const history = await apif<Omit<Msg, 'pending' | 'failed'>[]>(`/chat/conversations/${encodeURIComponent(id)}/messages?${scope()}`);
      setMsgs(history.map((message) => ({ ...message, actions: Array.isArray(message.actions) ? message.actions : [] })));
      notify?.markConvoRead(id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this conversation.'); }
    finally { setLoading(false); }
  }

  async function runAction(action: Action, key: string) {
    if (actionBusy) return;
    if (action.method !== 'GET' && !window.confirm(`${action.label}?`)) return;
    setActionBusy(key);
    try {
      const path = action.endpoint.startsWith('/api') ? action.endpoint.slice(4) : action.endpoint;
      const response = await fetch(`${API}${path}`, {
        method: action.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? `Action failed (${response.status}).`);
      const text = Array.isArray(body) ? `Loaded ${body.length} item${body.length === 1 ? '' : 's'}.` : `Done — ${action.label}.`;
      setMsgs((items) => [...items, { id: `action-${Date.now()}`, role: 'assistant', content: text, actions: [] }]);
      emitApprovalsChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'That action could not be completed.'); }
    finally { setActionBusy(null); }
  }

  async function submit(textValue = input, retry?: PendingRequest) {
    const text = textValue.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setInput('');
    let request = retry;
    try {
      let conversationId = retry?.conversationId ?? cur;
      if (!conversationId) {
        const created = await apif<Convo>('/chat/conversations', {
          method: 'POST', body: JSON.stringify({ userId: currentUserId(), workspaceId: currentWorkspace(), title: text.slice(0, 60) }),
        });
        conversationId = created.id;
        setCur(created.id);
        setConvos((items) => [created, ...items]);
      }
      request = retry ?? { conversationId, clientMessageId: crypto.randomUUID(), text };
      pendingRef.current = request;
      if (!retry) {
        setMsgs((items) => [...items, { id: request!.clientMessageId, role: 'user', content: text, actions: [], pending: true }, { id: `reply-${request!.clientMessageId}`, role: 'assistant', content: '', actions: [], pending: true }]);
      } else {
        setMsgs((items) => items.map((item) => item.id === `reply-${retry.clientMessageId}` ? { ...item, content: '', pending: true, failed: false } : item));
      }

      const response = await fetch(`${API}/chat/stream`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId(), workspaceId: currentWorkspace(), conversationId, clientMessageId: request.clientMessageId, message: request.text }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? `Remy couldn’t respond (${response.status}).`);
      }
      if (!response.body) throw new Error('This browser could not open the response stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let reply = '';
      let actions: Action[] = [];
      let savedMessageId = '';
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const records = buffer.split('\n\n');
        buffer = records.pop() ?? '';
        for (const record of records) {
          const line = record.split('\n').find((part) => part.startsWith('data:'));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim());
          if (event.token) {
            reply += event.token;
            setMsgs((items) => items.map((item) => item.id === `reply-${request!.clientMessageId}` ? { ...item, content: reply } : item));
          }
          if (event.done) {
            actions = Array.isArray(event.suggestedActions) ? event.suggestedActions : [];
            savedMessageId = event.messageId ?? '';
          }
        }
        if (done) break;
      }
      setMsgs((items) => items.map((item) => item.id === `reply-${request!.clientMessageId}`
        ? { ...item, id: savedMessageId || item.id, content: reply, actions, pending: false }
        : item.id === request!.clientMessageId ? { ...item, pending: false } : item));
      const updatedAt = new Date().toISOString();
      setConvos((items) => {
        const updated = items.map((item) => item.id === conversationId
          ? { ...item, title: item.title === 'New conversation' ? text.slice(0, 60) : item.title, updatedAt }
          : item);
        return [...updated].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      pendingRef.current = null;
      emitChatDone(conversationId, reply, request.clientMessageId);
      emitApprovalsChanged();
    } catch (e) {
      const messageText = e instanceof Error ? e.message : 'The request failed. Your message is still available to retry.';
      setError(messageText);
      if (!retry && request) setMsgs((items) => items.map((item) => item.id === request!.clientMessageId ? { ...item, pending: false } : item.id === `reply-${request!.clientMessageId}` ? { ...item, content: messageText, pending: false, failed: true } : item));
      if (retry) setMsgs((items) => items.map((item) => item.id === `reply-${retry.clientMessageId}` ? { ...item, content: messageText, pending: false, failed: true } : item));
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function rename(id: string) {
    const title = renameValue.trim();
    if (!title) return;
    try {
      await apif(`/chat/conversations/${encodeURIComponent(id)}?${scope()}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      setConvos((items) => items.map((item) => item.id === id ? { ...item, title } : item));
      setRenameId(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not rename the conversation.'); }
  }

  async function removeConversation() {
    if (!deleteId) return;
    try {
      await apif(`/chat/conversations/${encodeURIComponent(deleteId)}?${scope()}`, { method: 'DELETE' });
      const remaining = convos.filter((item) => item.id !== deleteId);
      setConvos(remaining);
      if (cur === deleteId) { setCur(null); setMsgs([]); }
      setDeleteId(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the conversation.'); setDeleteId(null); }
  }

  function dictate() {
    type SpeechWindow = Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const w = window as SpeechWindow;
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) { setError('Voice input is not supported in this browser. You can type your message instead.'); return; }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    setListening(true);
    recognition.onresult = (event: { results: { transcript: string }[][] }) => setInput((value) => `${value}${value ? ' ' : ''}${event.results[0][0].transcript}`);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError('Voice input stopped. You can continue by typing.'); };
    recognition.start();
  }

  return (
    <div className="chat-workspace">
      <aside className="card chat-history" aria-label="Conversation history">
        <div className="chat-history-head"><div><span className="eyebrow">WORKSPACE</span><h2>Conversations</h2></div><button className="btn primary small" onClick={start} disabled={busy}>＋ New chat</button></div>
        {wsName && <p className="muted small chat-workspace-name">{wsName}</p>}
        <div className="hist-list">
          {convos.map((item) => (
            <div className={`hist-row${item.id === cur ? ' active' : ''}`} key={item.id}>
              {renameId === item.id ? <form className="hist-rename" onSubmit={(event) => { event.preventDefault(); void rename(item.id); }}>
                <input autoFocus maxLength={120} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} aria-label="Conversation title" />
                <button className="icon-btn" type="submit" aria-label="Save title">✓</button>
                <button className="icon-btn" type="button" onClick={() => setRenameId(null)} aria-label="Cancel rename">×</button>
              </form> : <>
                <button className="hist-select" onClick={() => void selectConvo(item.id)} aria-current={item.id === cur ? 'page' : undefined}>
                  <span className="hist-title">{item.title}</span><span className="hist-date">{displayDate(item.updatedAt)}</span>
                  {(notify?.chatUnreadByConvo[item.id] ?? 0) > 0 && <span className="side-badge side-badge-chat">{notify?.chatUnreadByConvo[item.id]}</span>}
                </button>
                <button className="icon-btn hist-menu" aria-label={`Rename ${item.title}`} title="Rename conversation" onClick={() => { setRenameId(item.id); setRenameValue(item.title); }}>✎</button>
                <button className="icon-btn hist-menu" aria-label={`Delete ${item.title}`} title="Delete conversation" onClick={() => setDeleteId(item.id)}>×</button>
              </>}
            </div>
          ))}
          {!loading && convos.length === 0 && <p className="muted small chat-history-empty">Your saved conversations will appear here.</p>}
        </div>
      </aside>

      <section className="card chat-main" aria-label="Remy conversation">
        <header className="chat-main-head"><div><span className="eyebrow">REMY AI</span><h1>{convo?.title ?? 'Chat'}</h1></div>
          {convo && <button className="btn small" onClick={() => { setRenameId(convo.id); setRenameValue(convo.title); }}>Rename</button>}
        </header>
        {error && <div className="chat-error" role="alert"><span>{error}</span><button className="icon-btn" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        <div className="chat-scroll" aria-live="polite" aria-busy={loading || busy}>
          {loading ? <div className="chat-loading"><span className="spinner" /> Loading saved conversation…</div> : msgs.length === 0 ? (
            <div className="chat-welcome"><div className="chat-welcome-mark">✦</div><span className="eyebrow">A CLEARER WAY THROUGH YOUR DAY</span><h2>What can I help you with?</h2><p>Ask a question, make a plan, or get a task moving. I’ll use your workspace context and keep you in control of external actions.</p>
              <div className="chat-suggestions">{SUGGESTIONS.map((suggestion) => <button key={suggestion} className="chip" onClick={() => void submit(suggestion)} disabled={busy}>{suggestion}<span aria-hidden="true">↗</span></button>)}</div>
            </div>
          ) : <div className="chat-messages">{msgs.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.id}>
              <div className="message-avatar" aria-hidden="true">{message.role === 'assistant' ? '✦' : 'Y'}</div>
              <div className="message-body"><div className="message-label">{message.role === 'assistant' ? 'Remy' : 'You'}{message.pending && <span className="message-status"> · {message.role === 'user' ? 'Sending' : 'Thinking'}</span>}</div>
                <div className="message-content">{message.content || (message.pending ? <span className="typing-dots">Remy is thinking<span>…</span></span> : '')}</div>
                {message.failed && pendingRef.current && <button className="btn small message-retry" onClick={() => void submit(pendingRef.current!.text, pendingRef.current!)} disabled={busy}>Retry response</button>}
                {message.role === 'assistant' && message.content && <div className="message-actions"><button className="link-btn" onClick={() => void navigator.clipboard?.writeText(message.content).then(() => setError('Copied response to clipboard.')).catch(() => setError('Could not copy this response.'))}>Copy</button>
                  {message.actions.map((action, index) => <button key={`${message.id}-${index}`} className="chip" disabled={actionBusy !== null} onClick={() => void runAction(action, `${message.id}-${index}`)}>{actionBusy === `${message.id}-${index}` ? 'Working…' : action.label}</button>)}
                </div>}
              </div>
            </article>
          ))}<div ref={bottomRef} /></div>}
        </div>
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} placeholder="Message Remy… (Shift + Enter for a new line)" aria-label="Message Remy" rows={2} disabled={busy} />
          <div className="composer-footer"><span className="composer-hint">Remy checks your workspace before confirming actions.</span><div className="composer-actions"><button className="btn small" type="button" onClick={dictate} disabled={listening || busy} aria-label="Dictate message">{listening ? 'Listening…' : '🎙 Dictate'}</button><button className="btn primary" type="submit" disabled={busy || !input.trim()}>{busy ? 'Working…' : 'Send'} <span aria-hidden="true">↑</span></button></div></div>
        </form>
      </section>

      {deleteId && <div className="confirm-scrim" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setDeleteId(null); }}><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete this conversation?</h2><p>The saved messages will be removed permanently.</p><div className="row"><button className="btn" onClick={() => setDeleteId(null)}>Keep conversation</button><button className="btn danger" onClick={() => void removeConversation()}>Delete conversation</button></div></div></div>}
    </div>
  );
}
