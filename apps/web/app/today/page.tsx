'use client';
import { useEffect, useState } from 'react';
import { API, apif, qs } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { onWorkspaceChange } from '../../lib/workspace';
import { Empty, ApprovalCard } from '../../components/ui';
import { emitApprovalsChanged } from '../../lib/notifications';

interface Task { id: string; title: string; status: string; priority: string; dueAt: string | null; assignee?: string | null; source?: string }
interface Meeting { id: string; title: string; startsAt: string; endsAt: string }
interface Appr {
  id: string; action: string; status: string; createdAt: string;
  payload: { body?: string; subject?: string; to?: string | string[]; cc?: string | string[] };
}
interface Act { at: string; icon: string; tone: string; title: string; sub?: string }
interface Run { id: string; status: string; log: { stepId: string; label: string; status: string; message: string }[]; createdAt: string }
interface WfRuns { id: string; name: string; runs?: Run[] }
interface TodayData {
  tasks: Task[]; overdueCount: number; meetings: Meeting[];
  progress: { done: number; remaining: number };
}
interface ChatAction { label: string; method: string; endpoint: string; body?: unknown }

const TRY_ASKING = ['Schedule a meeting with David', 'Follow up with George', 'Prepare my schedule for tomorrow'];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const t = new Date(now);
  t.setDate(now.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short' });
}
function levelOf(t: Task, overdue: boolean): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (overdue || t.priority === 'high') return 'HIGH';
  if (t.priority === 'low') return 'LOW';
  return 'MEDIUM';
}
const LEVEL_BADGE: Record<string, string> = { HIGH: 'b-over', MEDIUM: 'b-attn', LOW: 'b-ok' };

export default function TodayPage() {
  const [name, setName] = useState('there');
  const [data, setData] = useState<TodayData | null>(null);
  const [appr, setAppr] = useState<Appr[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [running, setRunning] = useState(0);
  const [wsLabel, setWsLabel] = useState('Personal');
  const [featuredRun, setFeaturedRun] = useState<{ wname: string; run: Run } | null>(null);
  const [denied, setDenied] = useState(false);
  const [delegateFor, setDelegateFor] = useState<string | null>(null);
  const [delegateName, setDelegateName] = useState('');

  // Command bar
  const [cmd, setCmd] = useState('');
  const [cmdBusy, setCmdBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [answer, setAnswer] = useState<{ text: string; actions: ChatAction[] } | null>(null);

  const Q = () => qs(currentWorkspace(), currentUserId());

  async function load() {
    const q = Q();
    try {
      const [t, a, ac, w, ws] = await Promise.all([
        apif<TodayData>(`/today?${q}`),
        apif<Appr[]>(`/approvals?${q}`),
        apif<Act[]>(`/activity?${q}`),
        apif<WfRuns[]>(`/workflows?${q}`).catch(() => []),
        apif<{ id: string; name: string; type: string }[]>(`/workspaces?${q}`).catch(() => []),
      ]);
      setData(t);
      setAppr(a.filter((x) => x.status === 'pending'));
      setActs(ac.slice(0, 6));
      const runs = w.flatMap((x) => (x.runs ?? []).map((r) => ({ wname: x.name, run: r })));
      setRunning(runs.filter((x) => x.run.status === 'running').length);
      const feat = runs.find((x) => x.run.status === 'waiting_approval' || x.run.status === 'running') ?? null;
      setFeaturedRun(feat);
      const activeWs = ws.find((x) => x.id === currentWorkspace());
      if (activeWs) setWsLabel(activeWs.type.charAt(0).toUpperCase() + activeWs.type.slice(1));
    } catch (e: unknown) {
      if ((e as { status?: number }).status === 401) setDenied(true);
    }
  }

  useEffect(() => {
    fetch(`${API}/auth/get-session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        const n = s?.user?.name ?? s?.user?.email?.split('@')[0];
        if (n) setName(n.split(' ')[0]);
      })
      .catch(() => {});
    load();
  }, []);
  useEffect(() => onWorkspaceChange(load), []);

  async function runChatAction(a: ChatAction): Promise<string> {
    const path = a.endpoint.startsWith('/api') ? a.endpoint.slice(4) : a.endpoint;
    if (a.method !== 'GET' && !window.confirm(`${a.label}?`)) return 'Cancelled.';
    const res = await fetch(`${API}${path}`, {
      method: a.method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: a.body ? JSON.stringify(a.body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return `Action failed (${res.status}).`;
    if (Array.isArray(json)) return `Done — ${json.length} item${json.length === 1 ? '' : 's'}.`;
    return `Done — ${a.label}.`;
  }

  async function ask(text?: string) {
    const message = (text ?? cmd).trim();
    if (!message || cmdBusy) return;
    setCmdBusy(true);
    setAnswer(null);
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId(), workspaceId: currentWorkspace(), message }),
      });
      const json = await res.json();
      setAnswer({ text: json.reply ?? 'Done.', actions: json.suggestedActions ?? [] });
      setCmd('');
      load();
      emitApprovalsChanged();
    } catch {
      setAnswer({ text: "Couldn't reach Remy. Is the API running?", actions: [] });
    }
    setCmdBusy(false);
  }

  function dictate() {
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) {
      setAnswer({ text: 'Voice input is not supported in this browser — please type instead.', actions: [] });
      return;
    }
    const rec = new (SR as new () => { lang: string; onresult: ((e: { results: { transcript: string }[][] }) => void) | null; onend: (() => void) | null; start: () => void })();
    rec.lang = 'en-US';
    setListening(true);
    rec.onresult = (e) => setCmd((s) => (s ? `${s} ` : '') + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.start();
  }

  async function completeTask(id: string) {
    await apif(`/tasks/${id}/complete`, { method: 'POST' });
    load();
  }
  async function postponeTask(id: string, dueAt: string | null) {
    const base = dueAt ? new Date(dueAt) : new Date();
    base.setDate(base.getDate() + 1);
    await apif(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ dueAt: base.toISOString() }) });
    load();
  }
  async function delegateTask(id: string) {
    if (!delegateName.trim()) return;
    await apif(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ assignee: delegateName.trim() }) });
    setDelegateFor(null);
    setDelegateName('');
    load();
  }

  if (denied) {
    return <div className="card"><b>Please sign in.</b><p className="muted">Your session expired or is missing.</p><a href="/signin"><button className="btn primary">Sign in →</button></a></div>;
  }

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const tasks = data?.tasks ?? [];
  const overdueIds = new Set<string>();
  const now = new Date();
  const dueToday = tasks.filter((t) => t.dueAt && new Date(t.dueAt) <= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59));
  tasks.forEach((t) => { if (t.dueAt && new Date(t.dueAt) < now) overdueIds.add(t.id); });
  const prioRank = { high: 0, normal: 1, low: 2 } as Record<string, number>;
  const queue = [...tasks]
    .sort((a, b) => {
      const oa = overdueIds.has(a.id) ? 0 : 1;
      const ob = overdueIds.has(b.id) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const pa = prioRank[a.priority] ?? 1;
      const pb = prioRank[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999');
    })
    .slice(0, 4);
  const meetings = data?.meetings ?? [];
  const featured = appr[0] ?? null;

  return (
    <div>
      <p className="caption">Your {wsLabel} command center</p>
      <h1 className="display" style={{ marginBottom: 0 }}>{greet}, {name}.</h1>
      <p style={{ fontSize: 17, fontWeight: 700, margin: '2px 0', color: 'var(--remy-heading)' }}>Welcome to Remy AI.</p>
      <p className="muted">Here&apos;s what needs your attention today, and what Remy can help you accomplish.</p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="muted small">{dateStr}</span>
      </div>

      <h2 className="section-h">Your day at a glance</h2>
      <p className="section-sub">Tasks due today, meetings, approvals, and recent activity.</p>
      <div className="stats" aria-label="Today summary">
        <div className="stat"><div className="n">{dueToday.length}</div><div className="l">Tasks due today</div></div>
        <div className="stat"><div className="n">{appr.length}</div><div className="l">Approvals waiting</div></div>
        <div className="stat"><div className="n">{meetings.length}</div><div className="l">Meetings</div></div>
        <div className="stat"><div className="n">{running}</div><div className="l">Workflows running</div></div>
        <div className="stat"><div className="n">{data?.progress.done ?? 0}</div><div className="l">Completed actions</div></div>
      </div>

      <div className="card" aria-label="Ask Remy">
        <b>How can I help you today?</b>
        <p className="muted small" style={{ margin: '2px 0 0' }}>Ask Remy to handle anything below — you&apos;re in control.</p>
        <div className="row" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
          <input
            value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder="What should Remy handle for you?" style={{ flex: 1 }} aria-label="Ask Remy anything"
          />
          <button className="btn" onClick={dictate} disabled={listening} aria-label="Dictate">{listening ? 'Listening…' : 'Dictate'}</button>
          <button className="btn primary" onClick={() => ask()} disabled={cmdBusy}>{cmdBusy ? 'Working…' : 'Ask Remy'}</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="caption">Try asking</span>
          {TRY_ASKING.map((t) => <button key={t} className="chip plain" onClick={() => ask(t)}>{t}</button>)}
        </div>
        {answer && (
          <div className="card" style={{ boxShadow: 'none', marginTop: 10, marginBottom: 0 }}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{answer.text}</p>
            <div className="row">
              {answer.actions.map((a, i) => (
                <button key={i} className="chip" onClick={async () => {
                  const out = await runChatAction(a);
                  setAnswer({ text: out, actions: [] });
                  load();
                }}>{a.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="today-grid">
        <div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="section-h" style={{ marginTop: 0 }}>Priority queue {tasks.length > 0 && <span className="badge b-quiet">{tasks.length}</span>}</h2>
            <a href="/tasks" className="small"><b>All tasks</b></a>
          </div>
          <p className="section-sub">Your highest-priority tasks, then the closest deadlines.</p>
          <div className="card">
            {queue.length === 0 && <Empty>Nothing pressing — enjoy the calm.</Empty>}
            {queue.map((t) => {
              const lv = levelOf(t, overdueIds.has(t.id));
              return (
                <div className="item" key={t.id}>
                  <input type="checkbox" onChange={() => completeTask(t.id)} aria-label={`Complete ${t.title}`} style={{ width: 18, height: 18, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <b>{t.title}</b>
                      <span className={`badge ${LEVEL_BADGE[lv]}`}>{lv}</span>
                    </div>
                    <div className="muted small">
                      {t.dueAt ? `${fmtDay(t.dueAt)} · ${fmtTime(t.dueAt)}` : 'No due date'}
                      {t.assignee ? ` · ${t.assignee}` : ' · You'}
                      {t.source === 'chat' || t.source === 'workflow' ? ' · Created by Remy' : ''}
                    </div>
                    <div className="row" style={{ marginTop: 4 }}>
                      <button className="btn small" onClick={() => { window.location.href = '/chat'; }}>Ask Remy to handle</button>
                      <button className="btn small" onClick={() => postponeTask(t.id, t.dueAt)}>Postpone</button>
                      <button className="btn small" onClick={() => { setDelegateFor(t.id); setDelegateName(t.assignee ?? ''); }}>Delegate</button>
                    </div>
                    {delegateFor === t.id && (
                      <div className="row" style={{ marginTop: 6 }}>
                        <input value={delegateName} onChange={(e) => setDelegateName(e.target.value)} placeholder="Assignee name…" aria-label="Assignee name" />
                        <button className="btn small primary" onClick={() => delegateTask(t.id)}>Save</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="section-h">Remy activity</h2>
            <a href="/activity" className="small"><b>Full history</b></a>
          </div>
          <p className="section-sub">A clear record of what&apos;s happening behind the scenes.</p>
          <div className="card">
            {featuredRun && (
              <div className="card" style={{ boxShadow: 'none', background: 'var(--remy-primary-soft)' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{featuredRun.wname}</b>
                  <span className="badge b-attn">
                    {featuredRun.run.status === 'running' ? 'Running' : 'Waiting for you'}
                  </span>
                </div>
                {(Array.isArray(featuredRun.run.log) ? featuredRun.run.log : []).slice(0, 4).map((l, i) => (
                  <div key={i} className="muted small" style={{ marginTop: 4 }}>
                    {l.status === 'completed' ? '✓' : l.status === 'waiting_approval' ? '⏸' : l.status === 'failed' ? '✗' : '○'} {l.label}
                    {l.status === 'waiting_approval' ? ' — waiting for approval' : ''}
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <a href="/workflows"><b className="small">Review action</b></a>
                </div>
              </div>
            )}
            {acts.length === 0 && !featuredRun && <p className="muted">Nothing yet.</p>}
            {acts.map((a, i) => (
              <div className="item" key={i}>
                <span className="activity-ic" style={{ borderColor: a.tone }} aria-hidden>{a.icon}</span>
                <div style={{ flex: 1 }}>
                  <b>{a.title}</b>
                  {a.sub && <div className="muted small">{a.sub}</div>}
                </div>
                <span className="muted small">{a.at ? new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <b>Your next move, made easier.</b>
            <p className="muted small">Use workflows to give your recurring work a repeatable plan.</p>
            <a href="/workflows"><b className="small">Explore workflows</b></a>
          </div>
        </div>

        <aside className="rail" aria-label="Needs attention">
          {featured ? (
            <div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <b>Your call</b>
                <span className="badge b-attn">{appr.length} Waiting</span>
              </div>
              <ApprovalCard
                action={featured.action}
                body={featured.payload?.body}
                channel={`To ${(Array.isArray(featured.payload?.to) ? featured.payload.to : [featured.payload?.to]).filter(Boolean).join(', ') || '…'}`}
                status={featured.status}
                onApprove={async () => { await apif(`/approvals/${featured.id}/approve`, { method: 'POST' }); load(); emitApprovalsChanged(); }}
                onDeny={async () => { await apif(`/approvals/${featured.id}/deny`, { method: 'POST' }); load(); emitApprovalsChanged(); }}
              />
              <a href="/approvals"><button className="btn primary" style={{ width: '100%' }}>Review &amp; approve</button></a>
              <p className="muted small" style={{ textAlign: 'center' }}>Remy will wait for your decision.</p>
            </div>
          ) : (
            <div className="card"><b>Your call</b><p className="muted">You&apos;re all caught up — no actions waiting for approval.</p></div>
          )}

          <div className="card" style={{ marginBottom: 0 }}>
            <div className="rail-card-head"><b>On your calendar</b></div>
            {meetings.length === 0 && <p className="muted">No meetings today.</p>}
            {meetings.slice(0, 4).map((mtg) => (
              <div className="item" key={mtg.id}>
                <div style={{ flex: 1 }}>
                  <div className="muted small">{fmtTime(mtg.startsAt)}</div>
                  <b>{mtg.title}</b>
                  <div className="muted small">{fmtTime(mtg.startsAt)} – {fmtTime(mtg.endsAt)}</div>
                  <a href="/chat" className="small">Prepare with Remy</a>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
