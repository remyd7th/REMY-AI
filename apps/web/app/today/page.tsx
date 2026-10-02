'use client';
import { useEffect, useState } from 'react';
import { API, apif, qs } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { Empty, ActivityRow, ApprovalCard } from '../../components/ui';

interface Wf { id: string; name: string; description: string; trigger: string; steps: unknown[]; status: string; lastRunAt: string | null }
interface Appr { id: string; action: string; status: string; createdAt: string; payload: { body?: string; to?: string } }
interface Act { at: string; icon: string; tone: string; title: string; sub?: string }

const QUICK: { icon: string; bg: string; label: string; text: string; href: string }[] = [
  { icon: '⚡', bg: '#FFC800', label: 'Create a Workflow', text: 'Turn a repetitive task into an automated workflow.', href: '/workflows' },
  { icon: '💬', bg: '#EC4899', label: 'Ask Remy', text: 'Tell Remy what you need and get help instantly.', href: '/chat' },
  { icon: '🛡', bg: '#06B6D4', label: 'Review Approvals', text: 'See actions waiting for your approval.', href: '/approvals' },
  { icon: '✓', bg: '#A3E635', label: 'Add Task', text: 'Create and organize a task.', href: '/tasks' },
  { icon: '📅', bg: '#EDE9FE', label: 'Schedule', text: 'Create or manage a meeting or reminder.', href: '/calendar' },
  { icon: '👥', bg: '#FCE7F3', label: 'Follow Up', text: 'Find people and tasks that need follow-up.', href: '/followups' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return `${Math.round(hrs / 24)} day${hrs >= 48 ? 's' : ''} ago`;
}

export default function TodayPage() {
  const [name, setName] = useState('there');
  const [wfs, setWfs] = useState<Wf[]>([]);
  const [appr, setAppr] = useState<Appr | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [denied, setDenied] = useState(false);
  const [ready, setReady] = useState(false);
  const [hour, setHour] = useState(9);

  const Q = () => qs(currentWorkspace(), currentUserId());

  useEffect(() => {
    setHour(new Date().getHours());
    fetch(`${API}/auth/get-session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        const n = s?.user?.name ?? s?.user?.email?.split('@')[0];
        if (n) setName(n.split(' ')[0]);
      })
      .catch(() => {});
    const q = Q();
    (async () => {
      try {
        const [w, a, ac] = await Promise.all([
          apif<Wf[]>(`/workflows?${q}`),
          apif<Appr[]>(`/approvals?${q}`),
          apif<Act[]>(`/activity?${q}`),
        ]);
        setWfs(w);
        setAppr(a.find((x) => x.status === 'pending') ?? null);
        setActs(ac.slice(0, 5));
        setReady(true);
      } catch (e: unknown) {
        if ((e as { status?: number }).status === 401) setDenied(true);
      }
    });
  }, []);

  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const featured = wfs[0];

  if (denied) {
    return <div className="card"><b>Please sign in.</b><p className="muted">Your session expired or is missing.</p><a href="/signin"><button className="btn primary">Sign in →</button></a></div>;
  }

  return (
    <div className="today-grid">
      <div>
        <section className="hero" aria-label="Welcome">
          <div>
            <span className="greet">{greet}, {name} 👋</span>
            <h1>Let&apos;s get your admin work under control.</h1>
            <p className="sub">Remy AI helps you organize tasks, manage follow-ups, prepare meetings and automate repetitive workflows.</p>
            <div className="row">
              <a href="/workflows"><button className="btn secondary">Create workflow →</button></a>
              <a href="/chat"><button className="btn accent-pink">◉ Ask Remy</button></a>
            </div>
          </div>
          <div className="mascot" aria-hidden>
            <span className="bubble-tag">REMY</span>
            <span className="antenna" />
            <span className="star">★</span>
            <div className="bot"><div className="face"><span className="smile" /></div></div>
          </div>
        </section>

        <h2 className="section-h">Quick actions</h2>
        <p className="section-sub">Get things done, faster.</p>
        <div className="grid3">
          {QUICK.map((q, i) => (
            <a key={q.label} href={q.href} className="quick" aria-label={q.label}>
              <div className="card feature" style={{ marginBottom: 0 }}>
                <span className="qnum">
                  <span className="qicon" style={{ background: q.bg }}> {q.icon} </span>
                  <b>0{i + 1}</b>
                </span>
                <div className="card-h" style={{ marginTop: 8 }}>{q.label}</div>
                <p className="muted small">{q.text}</p>
                <span className="go" aria-hidden>→</span>
              </div>
            </a>
          ))}
        </div>

        <h2 className="section-h">Your workflows</h2>
        <p className="section-sub">Automate your daily tasks and stay on top of what matters. <a href="/workflows" style={{ float: 'right' }}><button className="btn primary small">+ Create workflow</button></a></p>
        {!featured && <Empty>No workflows yet. <a href="/workflows"><b>Seed the starter set →</b></a></Empty>}
        {featured && (
          <div className="wf-band">
            <div>
              <b style={{ fontSize: 17 }}>{(featured.name + ' → Response → Follow-up').slice(0, 60)}</b>{' '}
              <span className={`badge ${featured.status === 'active' ? 'b-ok' : 'b-quiet'}`}>{featured.status === 'active' ? 'Active' : featured.status}</span>
              <p className="muted small">{featured.description || 'Automatically draft a response to inquiries and schedule a follow-up reminder.'}</p>
              <div className="wf-meta">
                <span>✉ Gmail</span><span>📅 Calendar</span>
                <span>⚙ {featured.steps.length} steps</span>
                <span>◷ Last run: {featured.lastRunAt ? ago(featured.lastRunAt) : 'never'}</span>
              </div>
              <div className="row">
                <a href="/workflows"><button className="btn primary small">View workflow</button></a>
                <button className="btn small outline" onClick={async () => {
                  const p = new URLSearchParams(Q());
                  await fetch(`${API}/workflows/${featured.id}/run`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: p.get('userId'), workspaceId: p.get('workspaceId') }) });
                  location.reload();
                }}>Run workflow</button>
              </div>
            </div>
            <ol className="wf-steps" aria-label="Workflow steps">
              {(featured.steps as string[]).slice(0, 6).map((s, i) => <li key={i}><span className="sn">{i + 1}</span> {s}</li>)}
            </ol>
          </div>
        )}
      </div>

      <aside className="rail" aria-label="Needs attention">
        {appr && (
          <ApprovalCard
            action={appr.action} body={appr.payload?.body}
            channel={appr.payload?.to ? `To ${appr.payload.to}` : 'Gmail'}
            status={appr.status} createdAt={ago(appr.createdAt)}
            onApprove={async () => { await apif(`/approvals/${appr.id}/approve`, { method: 'POST' }); location.reload(); }}
            onDeny={async () => { await apif(`/approvals/${appr.id}/deny`, { method: 'POST' }); location.reload(); }}
          />
        )}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="rail-card-head"><b>Recent activity</b><a href="/activity">View all →</a></div>
          {acts.length === 0 && <p className="muted">Nothing yet.</p>}
          {acts.map((a, i) => <ActivityRow key={i} icon={a.icon} tone={a.tone} title={a.title} sub={a.sub} time={ago(a.at)} />)}
        </div>
      </aside>
    </div>
  );
}
