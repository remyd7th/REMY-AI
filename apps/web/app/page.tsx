import { api, qs } from '../lib/api';

interface Today {
  tasks: { id: string; title: string; priority: string; dueAt: string | null }[];
  overdueCount: number;
  meetings: { id: string; title: string; startsAt: string }[];
  emails: { id: string; subject: string; from: string }[];
  followups: { id: string; kind: string; status: string }[];
  docs: { id: string; title: string }[];
  progress: { done: number; remaining: number };
}

export default async function TodayPage() {
  const q = qs();
  const [today, digest] = await Promise.all([
    api<Today>(`/today?${q}`),
    api<{ headline: string; suggestions: { notice: string; label: string }[] }>(`/digests/morning?${q}`),
  ]);
  return (
    <>
      <div className="card"><b>{digest.headline}</b></div>
      <div className="grid2">
        <div className="card">
          <b>Priority tasks {today.overdueCount > 0 && <span className="badge b-over">{today.overdueCount} overdue</span>}</b>
          {today.tasks.length === 0 && <p className="muted">Nothing open. Enjoy it.</p>}
          {today.tasks.map((t) => (
            <p key={t.id}>• <b>{t.title}</b> <span className="muted">[{t.priority}]{t.dueAt ? ` due ${t.dueAt.slice(0, 10)}` : ''}</span></p>
          ))}
        </div>
        <div className="card">
          <b>Meetings · Emails · Follow-ups</b>
          <p><span className="badge b-vip">{today.meetings.length} meetings</span>
          <span className="badge b-info">{today.emails.length} emails</span>
          <span className="badge b-attn">{today.followups.length} follow-ups</span></p>
          {digest.suggestions.map((s, i) => <p key={i}>→ {s.notice} <b>{s.label}</b></p>)}
        </div>
      </div>
      <div className="grid2">
        <div className="card"><b>Progress</b><p>{today.progress.done} done · {today.progress.remaining} remaining</p></div>
        <div className="card"><b>Docs</b>{today.docs.map((d) => <p key={d.id}>• {d.title}</p>)}{today.docs.length === 0 && <p className="muted">No docs yet.</p>}</div>
      </div>
    </>
  );
}
