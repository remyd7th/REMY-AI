import { api, qs, DEMO_WORKSPACE } from '../lib/api';

interface Today {
  tasks: { id: string; title: string; priority: string; dueAt: string | null }[];
  overdueCount: number;
  meetings: { id: string; title: string; startsAt: string }[];
  emails: { id: string; subject: string; from: string }[];
  followups: { id: string; kind: string; status: string }[];
  docs: { id: string; title: string }[];
  progress: { done: number; remaining: number };
}

interface Digest {
  headline: string;
  suggestions: { notice: string; label: string }[];
}

export default async function TodayPage({ searchParams }: { searchParams: { workspaceId?: string } }) {
  const ws = searchParams.workspaceId ?? DEMO_WORKSPACE;
  const q = qs(ws);
  const [today, digest] = await Promise.all([
    api<Today>(`/today?${q}`),
    api<Digest>(`/digests/morning?${q}`),
  ]);
  return (
    <>
      <div className="hero"><b>{digest.headline}</b></div>
      <div className="stats">
        <div className="stat s-red"><div className="n">{today.overdueCount}</div><div className="l">Overdue</div></div>
        <div className="stat s-violet"><div className="n">{today.meetings.length}</div><div className="l">Meetings</div></div>
        <div className="stat s-cyan"><div className="n">{today.emails.length}</div><div className="l">Emails</div></div>
        <div className="stat s-sun"><div className="n">{today.followups.length}</div><div className="l">Follow-ups</div></div>
      </div>
      <div className="grid2">
        <div className="card">
          <b>Priority tasks {today.overdueCount > 0 && <span className="badge b-over">{today.overdueCount} overdue</span>}</b>
          {today.tasks.length === 0 && <div className="empty">Nothing open. Enjoy it.</div>}
          {today.tasks.map((t) => (
            <div className="item" key={t.id}>
              <div className="dot" style={{ background: t.dueAt && new Date(t.dueAt) < new Date() ? '#ff3b30' : '#6d28d9' }} />
              <div><b>{t.title}</b> <span className="muted">[{t.priority}]{t.dueAt ? ` due ${t.dueAt.slice(0, 10)}` : ''}</span></div>
            </div>
          ))}
        </div>
        <div className="card">
          <b>Suggestions</b>
          {digest.suggestions.length === 0 && <p className="muted">All clear — nothing needs you right now.</p>}
          {digest.suggestions.map((s, i) => <p key={i}>→ {s.notice} <b>{s.label}</b></p>)}
        </div>
      </div>
      <div className="grid2">
        <div className="card"><b>Progress</b><p style={{ fontSize: 22, fontWeight: 900 }}>{today.progress.done} <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>done · {today.progress.remaining} remaining</span></p></div>
        <div className="card"><b>Docs</b>{today.docs.map((d) => <p key={d.id}>• {d.title}</p>)}{today.docs.length === 0 && <p className="muted">No docs yet.</p>}</div>
      </div>
    </>
  );
}
