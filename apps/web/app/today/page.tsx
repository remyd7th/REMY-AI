'use client';
import { useEffect, useState } from 'react';
import { apif, qs } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { Stat, Empty, ActivityRow, ApprovalCard } from '../../components/ui';

interface Today {
  tasks: { id: string; title: string; priority: string; dueAt: string | null }[];
  overdueCount: number;
  meetings: { id: string; title: string; startsAt: string }[];
  emails: { id: string; subject: string; from: string }[];
  followups: { id: string; kind: string; status: string }[];
  docs: { id: string; title: string }[];
  progress: { done: number; remaining: number };
}

interface Wf { id: string; name: string; description: string; trigger: string; steps: unknown[]; status: string; lastRunAt: string | null }
interface Appr { id: string; action: string; status: string; payload: { body?: string; to?: string } }
interface Act { at: string; icon: string; tone: string; title: string; sub?: string }

const QUICK: { icon: string; label: string; text: string; href: string }[] = [
  { icon: '⚙', label: 'Create a Workflow', text: 'Turn a repetitive task into an automated workflow.', href: '/workflows' },
  { icon: '💬', label: 'Ask Remy', text: 'Tell Remy what you need and get help instantly.', href: '/chat' },
  { icon: '⚡', label: 'Review Approvals', text: 'See actions waiting for your approval.', href: '/approvals' },
  { icon: '✓', label: 'Add Task', text: 'Create and organize a task.', href: '/tasks' },
  { icon: '📅', label: 'Schedule', text: 'Create or manage a meeting or reminder.', href: '/calendar' },
  { icon: '🔔', label: 'Follow Up', text: 'Find people and tasks that need follow-up.', href: '/followups' },
];

export default function TodayPage() {
  const [today, setToday] = useState<Today | null>(null);
  const [head, setHead] = useState('');
  const [wfs, setWfs] = useState<Wf[]>([]);
  const [appr, setAppr] = useState<Appr | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [denied, setDenied] = useState(false);

  const Q = () => qs(currentWorkspace(), currentUserId());

  useEffect(() => {
    const q = Q();
    (async () => {
      try {
        const [t, d, w, a, ac] = await Promise.all([
          apif<Today>(`/today?${q}`),
          apif<{ headline: string }>(`/digests/morning?${q}`),
          apif<Wf[]>(`/workflows?${q}`),
          apif<Appr[]>(`/approvals?${q}`),
          apif<Act[]>(`/activity?${q}`),
        ]);
        setToday(t);
        setHead(d.headline);
        setWfs(w.slice(0, 3));
        setAppr(a.find((x) => x.status === 'pending') ?? null);
        setActs(ac.slice(0, 4));
      } catch (e: unknown) {
        if ((e as { status?: number }).status === 401) setDenied(true);
      }
    });
  }, []);

  if (denied) {
    return <div className="card"><b>Please sign in.</b><p className="muted">Your session expired or is missing.</p><a href="/signin"><button className="btn primary">Sign in →</button></a></div>;
  }
  if (!today) return <div className="card"><b>Loading today…</b></div>;

  return (
    <>
      <section className="hero" aria-label="Welcome">
        <h1 className="display">Good morning, Remy 👋</h1>
        <p style={{ fontSize: 17, margin: '6px 0' }}>Let&apos;s get your admin work under control.</p>
        <p className="muted" style={{ maxWidth: 620 }}>{head || 'Remy helps you organize tasks, manage follow-ups, prepare meetings and automate repetitive workflows.'}</p>
        <div className="row" style={{ marginTop: 14 }}>
          <a href="/workflows"><button className="btn secondary">Create workflow</button></a>
          <a href="/chat"><button className="btn" style={{ background: '#fff' }}>Ask Remy</button></a>
        </div>
      </section>

      <h2 className="section-h">Quick actions</h2>
      <div className="grid3">
        {QUICK.map((q, i) => (
          <a key={q.label} href={q.href} style={{ textDecoration: 'none' }}>
            <div className="card feature">
              <div className="caption">0{i + 1}</div>
              <div style={{ fontSize: 24 }} aria-hidden>{q.icon}</div>
              <div className="card-h">{q.label}</div>
              <p className="muted small">{q.text}</p>
            </div>
          </a>
        ))}
      </div>

      <h2 className="section-h">Your workflows</h2>
      {wfs.length === 0 ? (
        <Empty>No workflows yet — seed the starter set or create your own. <a href="/workflows"><b>Open workflows →</b></a></Empty>
      ) : (
        <div className="grid2">
          {wfs.map((w) => (
            <div className="card" key={w.id}>
              <div className="row"><b>{w.name}</b><span className={`badge ${w.status === 'active' ? 'b-ok' : 'b-quiet'}`}>● {w.status}</span></div>
              <p className="muted small">{w.description}</p>
              <ol className="workflow-steps">
                {(w.steps as string[]).slice(0, 4).map((s, i) => <li key={i} data-n={i + 1}>{s}</li>)}
              </ol>
              <a href="/workflows"><button className="btn small">View workflow</button></a>
            </div>
          ))}
        </div>
      )}

      {appr && (
        <>
          <h2 className="section-h">Needs your decision</h2>
          <ApprovalCard
            action={appr.action} body={appr.payload?.body} status={appr.status}
            onApprove={async () => { await apif(`/approvals/${appr.id}/approve`, { method: 'POST' }); location.reload(); }}
            onDeny={async () => { await apif(`/approvals/${appr.id}/deny`, { method: 'POST' }); location.reload(); }}
          />
        </>
      )}

      <div className="grid2">
        <div className="card">
          <b>Today at a glance</b>
          <div className="stats" style={{ marginTop: 10 }}>
            <Stat n={today.overdueCount} label="Overdue" tone="s-red" />
            <Stat n={today.meetings.length} label="Meetings" tone="s-violet" />
            <Stat n={today.emails.length} label="Emails" tone="s-cyan" />
            <Stat n={today.followups.length} label="Follow-ups" tone="s-sun" />
          </div>
          <p className="muted small">{today.progress.done} done · {today.progress.remaining} remaining</p>
        </div>
        <div className="card">
          <b>Recent activity</b>
          {acts.length === 0 && <p className="muted">Nothing yet.</p>}
          {acts.map((a, i) => <ActivityRow key={i} icon={a.icon} tone={a.tone} title={a.title} sub={a.sub} />)}
          <a href="/activity"><button className="btn small">View all</button></a>
        </div>
      </div>
    </>
  );
}
