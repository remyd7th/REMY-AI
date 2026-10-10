'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { onWorkspaceChange } from '../../lib/workspace';
import { PageHead, Empty } from '../../components/ui';
import { emitApprovalsChanged, useNotificationsOptional } from '../../lib/notifications';

interface Step { id: string; kind: string; op: string; label: string; params?: Record<string, unknown> }
interface RunLog { stepId: string; kind: string; op: string; label: string; status: string; message: string; approvalIds?: string[]; at: string }
interface Run { id: string; status: string; log: RunLog[]; createdAt: string }
interface Wf {
  id: string; name: string; description: string; trigger: string;
  steps: Step[]; status: string; lastRunAt: string | null; runs?: Run[];
}

const KIND_BADGE: Record<string, string> = { gather: 'b-info', prepare: 'b-quiet', approval: 'b-attn', side_effect: 'b-pink' };
const STATUS_ICON: Record<string, string> = {
  queued: '○', running: '◉', completed: '✓', waiting_approval: '●', skipped: '–', failed: '✗',
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const day = sameDay ? 'Today' : (d.toDateString() === yest.toDateString() ? 'Yesterday' : d.toLocaleDateString());
  return `${day} — ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function runOutcome(run: Run): string {
  const log = Array.isArray(run.log) ? run.log : [];
  const done = log.filter((l) => l.status === 'completed').length;
  const waiting = log.filter((l) => l.status === 'waiting_approval').length;
  const failed = log.filter((l) => l.status === 'failed').length;
  if (run.status === 'failed' || failed > 0) return `✗ Failed — ${done}/${log.length} steps done`;
  if (run.status === 'waiting_approval' || waiting > 0) return `● Completed with approval required`;
  return `✓ Completed — ${done}/${log.length} steps done`;
}

export default function WorkflowsPage() {
  const [items, setItems] = useState<Wf[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);

  // Generate box
  const [genText, setGenText] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  interface Draft { goal: string; trigger: string; steps: Step[] }
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftDesc, setDraftDesc] = useState('');

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eTrigger, setETrigger] = useState('');
  const [eSteps, setESteps] = useState<Step[]>([]);
  const notify = useNotificationsOptional();

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;
  const auth = { credentials: 'include' as const, headers: { 'Content-Type': 'application/json' } };
  const ids = () => {
    const p = new URLSearchParams(Q());
    return { userId: p.get('userId')!, workspaceId: p.get('workspaceId')! };
  };

  async function load() {
    const [w, a] = await Promise.all([
      fetch(`${API}/workflows?${Q()}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/approvals?${Q()}`, { credentials: 'include' }).then((r) => r.json()).catch(() => []),
    ]);
    setItems(w);
    setPendingApprovals((a as { status: string; action: string }[]).filter((x) => x.status === 'pending').length);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => onWorkspaceChange(load), []);

  // Live progress polling while a run is active.
  useEffect(() => {
    if (!liveId) return;
    const t = setInterval(async () => {
      try {
        const w: Wf = await fetch(`${API}/workflows/${liveId}?${Q()}`, { credentials: 'include' }).then((r) => r.json());
        setItems((xs) => xs.map((x) => (x.id === liveId ? w : x)));
        const latest = w.runs?.[0];
        if (latest && latest.status !== 'running') setLiveId(null);
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(t);
  }, [liveId]);

  async function seed() {
    await fetch(`${API}/workflows/seed`, { ...auth, method: 'POST', body: JSON.stringify(ids()) });
    load();
  }

  async function generate() {
    if (!genText.trim()) return;
    setGenBusy(true);
    try {
      const plan = await fetch(`${API}/workflows/generate`, { ...auth, method: 'POST',
        body: JSON.stringify({ message: genText }) }).then((r) => r.json());
      setDraft({ goal: plan.goal, trigger: plan.trigger, steps: plan.steps });
    } finally {
      setGenBusy(false);
    }
  }

  async function activateDraft() {
    if (!draft) return;
    await fetch(`${API}/workflows`, { ...auth, method: 'POST',
      body: JSON.stringify({ ...ids(), name: draft.goal || 'Untitled workflow', description: draftDesc, trigger: draft.trigger, steps: draft.steps, status: 'active' }) });
    setDraft(null);
    setDraftDesc('');
    setGenText('');
    load();
  }

  function moveStep(i: number, dir: -1 | 1) {
    if (!draft) return;
    const steps = [...draft.steps];
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setDraft({ ...draft, steps });
  }

  async function run(id: string) {
    setMsg('');
    setLiveId(id);
    setOpen(id);
    try {
      const res = await fetch(`${API}/workflows/${id}/run`, { ...auth, method: 'POST', body: JSON.stringify(ids()) }).then((r) => r.json());
      const s = res.summary as { completed?: number; total?: number; waiting?: number; failed?: number; seconds?: number; lines?: string[] };
      const bits = [`${s.completed ?? 0}/${s.total ?? 0} steps done in ${s.seconds ?? 0}s`];
      if (s.waiting) bits.push(`${s.waiting} awaiting approval`);
      if (s.failed) bits.push(`${s.failed} failed`);
      setMsg(`Run finished — ${bits.join(' · ')}.`);
      if (s.waiting) {
        notify?.pushToast({
          type: 'workflow',
          title: 'Workflow run needs approval',
          message: `${s.waiting} step${s.waiting === 1 ? '' : 's'} waiting for your review.`,
          href: '/approvals',
        });
      } else if (!s.failed) {
        notify?.pushToast({ type: 'workflow', title: 'Workflow run finished', message: bits.join(' · '), href: '/workflows' });
      }
    } catch {
      setMsg('Run failed to start. Is the API running?');
      setLiveId(null);
    }
    load();
    emitApprovalsChanged();
  }

  async function toggle(w: Wf) {
    const next = w.status === 'active' ? 'paused' : 'active';
    await fetch(`${API}/workflows/${w.id}`, { ...auth, method: 'PATCH', body: JSON.stringify({ status: next }) });
    load();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this workflow? Run history goes with it.')) return;
    await fetch(`${API}/workflows/${id}`, { ...auth, method: 'DELETE' });
    if (open === id) setOpen(null);
    load();
  }

  async function duplicate(w: Wf) {
    await fetch(`${API}/workflows`, { ...auth, method: 'POST',
      body: JSON.stringify({ ...ids(), name: `${w.name} (copy)`, description: w.description, trigger: w.trigger, steps: w.steps, status: 'draft' }) });
    load();
  }

  function startEdit(w: Wf) {
    setEditId(w.id);
    setEName(w.name);
    setEDesc(w.description ?? '');
    setETrigger(w.trigger);
    setESteps((Array.isArray(w.steps) ? w.steps : []).map((s) => (typeof s === 'string' ? { id: `legacy-${Math.random()}`, kind: 'gather', op: 'note', label: s } : s as Step)));
  }

  async function saveEdit() {
    if (!editId) return;
    await fetch(`${API}/workflows/${editId}`, { ...auth, method: 'PATCH',
      body: JSON.stringify({ name: eName, description: eDesc, trigger: eTrigger, steps: eSteps }) });
    setEditId(null);
    load();
  }

  const active = items.filter((w) => w.status === 'active');
  const paused = items.filter((w) => w.status !== 'active');
  const allRuns = items.flatMap((w) => (w.runs ?? []).map((r) => ({ w, r })))
    .sort((a, b) => +new Date(b.r.createdAt) - +new Date(a.r.createdAt)).slice(0, 5);

  return (
    <>
      <PageHead
        title="Workflows"
        sub="Automate the repetitive work you do every day. Each run turns every step into a tracked task, while actions with side effects still require your approval."
        action={<button className="btn" onClick={seed}>Seed starters</button>}
      />

      <div className="card">
        <b>Tell Remy what you want to automate</b>
        <p className="muted small">Describe it in plain words — Remy turns it into steps you review before anything runs. One-time reminder? Just ask in chat instead.</p>
        <div className="row">
          <input value={genText} onChange={(e) => setGenText(e.target.value)} placeholder="Every morning, check my emails, summarize the urgent ones, and create follow-up tasks…" style={{ flex: 1 }} aria-label="Describe a workflow" />
          <button className="btn primary" onClick={generate} disabled={genBusy}>{genBusy ? '…' : 'Generate'}</button>
        </div>
        {draft && (
          <div className="card" style={{ boxShadow: 'none', marginTop: 12 }}>
            <b>Goal:</b> {draft.goal}<br />
            <b>Trigger:</b> {draft.trigger}
            <p style={{ marginTop: 8 }}><label>Description
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                rows={2}
                style={{ width: '100%' }}
                aria-label="New workflow description"
                placeholder="What does this workflow do?"
              />
            </label></p>
            <ol className="workflow-steps" style={{ marginTop: 8 }}>
              {draft.steps.map((s, i) => (
                <li key={s.id} data-n={i + 1}>
                  {s.label} <span className="badge b-quiet">{s.kind}</span>
                  <span style={{ marginLeft: 6 }}>
                    <button className="btn small" onClick={() => moveStep(i, -1)} aria-label="Move step up">↑</button>
                    <button className="btn small" onClick={() => moveStep(i, 1)} aria-label="Move step down">↓</button>
                    <button className="btn small danger" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((x) => x.id !== s.id) })}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="row">
              <button className="btn primary" onClick={activateDraft}>Activate workflow</button>
              <button className="btn" onClick={() => setDraft(null)}>Discard</button>
            </div>
          </div>
        )}
      </div>

      {pendingApprovals > 0 && (
        <div className="card">
          <b>● {pendingApprovals} action{pendingApprovals === 1 ? '' : 's'} waiting for your approval</b>{' '}
          <a href="/approvals"><button className="btn small primary">Review approvals →</button></a>
        </div>
      )}

      {msg && <p role="status">{msg}</p>}

      <h2 className="section-h">Active workflows</h2>
      {items.length === 0 && (
        <Empty>No workflows yet. Turn repetitive work into automation — describe it above and review the steps before anything runs.</Empty>
      )}
      <div className="grid2">
        {active.map((w) => {
          const latest = w.runs?.[0];
          const doneCount = latest ? (Array.isArray(latest.log) ? latest.log.filter((l) => l.status === 'completed').length : 0) : 0;
          const totalCount = latest && Array.isArray(latest.log) ? latest.log.length : w.steps.length;
          return (
            <div className="card" key={w.id}>
              <div className="row">
                <b>{w.name}</b>
                <span className="badge b-ok">● Active</span>
              </div>
              <p className="muted small">{w.description || 'No description.'}</p>
              <p className="small"><b>Trigger:</b> {w.trigger}</p>
              <p className="small">
                {latest ? <>Last run {fmtTime(latest.createdAt)} — {runOutcome(latest)}</> : 'Never run'}
                {latest && totalCount > 0 && <> · {doneCount}/{totalCount} steps</>}
              </p>
              <div className="row">
                <button className="btn primary small" onClick={() => run(w.id)}>Run now</button>
                <button className="btn small" onClick={() => setOpen(open === w.id ? null : w.id)}>{open === w.id ? 'Hide details' : 'View details'}</button>
                <button className="btn small" onClick={() => toggle(w)}>Pause</button>
              </div>
              {open === w.id && <WorkflowDetails w={w} live={liveId === w.id} onChanged={load} onEdit={() => startEdit(w)} onDuplicate={() => duplicate(w)} onDelete={() => remove(w.id)} openRun={openRun} setOpenRun={setOpenRun} />}
            </div>
          );
        })}
      </div>

      {paused.length > 0 && (
        <>
          <h2 className="section-h">Paused & drafts</h2>
          <div className="grid2">
            {paused.map((w) => (
              <div className="card" key={w.id}>
                <div className="row">
                  <b>{w.name}</b>
                  <span className="badge b-quiet">{w.status === 'draft' ? 'Draft' : 'Paused'}</span>
                </div>
                <p className="muted small">{w.description || 'No description.'}</p>
                <div className="row">
                  <button className="btn small" onClick={() => setOpen(open === w.id ? null : w.id)}>{open === w.id ? 'Hide details' : 'View details'}</button>
                  <button className="btn small" onClick={() => toggle(w)}>{w.status === 'draft' ? 'Activate' : 'Resume'}</button>
                </div>
                {open === w.id && <WorkflowDetails w={w} live={false} onChanged={load} onEdit={() => startEdit(w)} onDuplicate={() => duplicate(w)} onDelete={() => remove(w.id)} openRun={openRun} setOpenRun={setOpenRun} />}
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-h">Recent runs</h2>
      {allRuns.length === 0 && <Empty>No runs yet. Press Run now on any workflow.</Empty>}
      {allRuns.map(({ w, r }) => (
        <div className="card" key={r.id}>
          <div className="row">
            <b>{w.name}</b>
            <span className="muted small">{fmtTime(r.createdAt)}</span>
          </div>
          <p className="small">{runOutcome(r)}</p>
          <button className="btn small" onClick={() => setOpenRun(openRun === r.id ? null : r.id)}>
            {openRun === r.id ? 'Hide log' : 'View log'}
          </button>
          {openRun === r.id && <RunLogView log={r.log} />}
        </div>
      ))}

      {editId && (
        <div className="card">
          <b>Edit workflow</b>
          <p><label>Name <input value={eName} onChange={(e) => setEName(e.target.value)} style={{ width: '100%' }} aria-label="Edit workflow name" /></label></p>
          <p><label>Description
            <textarea
              value={eDesc}
              onChange={(e) => setEDesc(e.target.value)}
              rows={3}
              style={{ width: '100%' }}
              aria-label="Edit workflow description"
              placeholder="What does this workflow do?"
            />
          </label></p>
          <p><label>Trigger <input value={eTrigger} onChange={(e) => setETrigger(e.target.value)} style={{ width: '100%' }} /></label></p>
          {eSteps.map((s, i) => (
            <div className="row" key={s.id}>
              <input value={s.label} onChange={(e) => {
                const steps = [...eSteps];
                steps[i] = { ...steps[i], label: e.target.value };
                setESteps(steps);
              }} style={{ flex: 1 }} aria-label={`Step ${i + 1} label`} />
              <select value={s.kind} onChange={(e) => {
                const steps = [...eSteps];
                steps[i] = { ...steps[i], kind: e.target.value };
                setESteps(steps);
              }} aria-label={`Step ${i + 1} kind`}>
                <option value="gather">Gather</option>
                <option value="prepare">Prepare</option>
                <option value="approval">Approval</option>
                <option value="side_effect">Send</option>
              </select>
              <button className="btn small" onClick={() => {
                const steps = [...eSteps];
                if (i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; setESteps(steps); }
              }}>↑</button>
              <button className="btn small" onClick={() => {
                const steps = [...eSteps];
                if (i < steps.length - 1) { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; setESteps(steps); }
              }}>↓</button>
              <button className="btn small danger" onClick={() => setESteps(eSteps.filter((x) => x.id !== s.id))}>✕</button>
            </div>
          ))}
          <div className="row">
            <button className="btn small" onClick={() => setESteps([...eSteps, { id: `new-${Date.now()}`, kind: 'gather', op: 'tasks.open', label: 'New step' }])}>+ Add step</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={saveEdit}>Save</button>
            <button className="btn" onClick={() => setEditId(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

function RunLogView({ log }: { log: RunLog[] }) {
  const lines = Array.isArray(log) ? log : [];
  if (lines.length === 0) return <p className="muted small">No steps recorded.</p>;
  return (
    <ol className="workflow-steps">
      {lines.map((l, i) => (
        <li key={i} data-n={i + 1}>
          <b>{l.label}</b> <span className="badge b-quiet">{STATUS_ICON[l.status] ?? '○'} {l.status.replace('_', ' ')}</span>
          <div className="muted small">{l.message}</div>
          {l.status === 'waiting_approval' && (
            <div><a href="/approvals"><button className="btn small primary">Review approvals →</button></a></div>
          )}
          {l.status === 'failed' && <div className="small">Fix the cause above, then run the workflow again.</div>}
        </li>
      ))}
    </ol>
  );
}

function WorkflowDetails({ w, live, onChanged, onEdit, onDuplicate, onDelete, openRun, setOpenRun }: {
  w: Wf; live: boolean; onChanged: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
  openRun: string | null; setOpenRun: (id: string | null) => void;
}) {
  const steps = (Array.isArray(w.steps) ? w.steps : []).map((s) => (typeof s === 'string' ? { id: s, kind: 'gather', op: 'note', label: s } : s as Step));
  const latest = w.runs?.[0];
  const byId = new Map((latest && Array.isArray(latest.log) ? latest.log : []).map((l) => [l.stepId, l]));
  return (
    <div style={{ marginTop: 12 }}>
      <p className="caption">Trigger — {w.trigger}</p>
      <ol className="workflow-steps">
        {steps.map((s, i) => {
          const r = byId.get(s.id);
          const st = live && !r ? (i === byId.size ? 'running' : 'queued') : (r?.status ?? 'queued');
          return (
            <li key={s.id} data-n={i + 1}>
              <b>{s.label}</b>{' '}
              <span className={`badge ${KIND_BADGE[s.kind] ?? 'b-quiet'}`}>{s.kind.replace('_', ' ')}</span>{' '}
              <span className="badge b-quiet">{STATUS_ICON[st] ?? '○'} {st.replace('_', ' ')}</span>
              {r?.message && <div className="muted small">{r.message}</div>}
              {r?.status === 'waiting_approval' && (
                <div><a href="/approvals"><button className="btn small primary">Review approvals →</button></a></div>
              )}
            </li>
          );
        })}
      </ol>
      {latest && (
        <>
          <p className="small"><b>Last run:</b> {fmtTime(latest.createdAt)} — {runOutcome(latest)}</p>
          <button className="btn small" onClick={() => setOpenRun(openRun === latest.id ? null : latest.id)}>
            {openRun === latest.id ? 'Hide run log' : 'View run log'}
          </button>
          {openRun === latest.id && <RunLogView log={latest.log} />}
        </>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={onEdit}>Edit</button>
        <button className="btn small" onClick={onDuplicate}>Duplicate</button>
        <button className="btn small danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
