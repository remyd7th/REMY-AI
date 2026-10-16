'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apif, qs } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { onWorkspaceChange } from '../../lib/workspace';

type TaskStatus = 'open' | 'in_progress' | 'done';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
interface Task { id: string; title: string; description: string; status: TaskStatus | string; priority: Priority | string; dueAt: string | null; remindAt: string | null; completedAt?: string | null; createdAt: string }
interface TaskDraft { title: string; description: string; priority: Priority; dueAt: string; remindAt: string; status: TaskStatus }
type TaskFilter = 'active' | 'all' | 'upcoming' | 'overdue' | 'reminders' | 'completed';

const EMPTY_DRAFT: TaskDraft = { title: '', description: '', priority: 'normal', dueAt: '', remindAt: '', status: 'open' };
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function scope() { return qs(currentWorkspace(), currentUserId()); }
function localDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
function isOverdue(task: Task) { return task.status !== 'done' && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now(); }
function displayStatus(task: Task) { return isOverdue(task) ? 'Overdue' : task.status === 'done' ? 'Completed' : task.status === 'in_progress' ? 'In progress' : 'Open'; }

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminderCount, setReminderCount] = useState(0);
  const [reminderIds, setReminderIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [sort, setSort] = useState<'due' | 'priority' | 'created'>('due');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = scope();
      const [items, reminders] = await Promise.all([
        apif<Task[]>(`/tasks?${query}`),
        apif<{ due: Task[]; overdue: Task[] }>(`/tasks/reminders?${query}`),
      ]);
      setTasks(items);
      setReminderCount(reminders.due.length + reminders.overdue.length);
      setReminderIds(new Set([...reminders.due, ...reminders.overdue].map((task) => task.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tasks could not be loaded.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); return onWorkspaceChange(() => { void load(); }); }, [load]);

  // Working preference: default task sort (Settings → Working preferences).
  useEffect(() => {
    apif<{ key: string; value: string; workspaceId: string | null }[]>(`/memories?${scope()}`)
      .then((rows) => {
        const ws = new URLSearchParams(scope()).get('workspaceId');
        const hit = rows.find((r) => r.key === 'tasks_sort' && r.workspaceId === ws)
          ?? rows.find((r) => r.key === 'tasks_sort');
        if (hit && ['due', 'priority', 'created'].includes(hit.value)) {
          setSort(hit.value as 'due' | 'priority' | 'created');
        }
      })
      .catch(() => {});
  }, []);

  const counts = useMemo(() => ({
    active: tasks.filter((task) => task.status !== 'done').length,
    overdue: tasks.filter(isOverdue).length,
    upcoming: tasks.filter((task) => task.status !== 'done' && task.dueAt && new Date(task.dueAt).getTime() >= Date.now()).length,
    completed: tasks.filter((task) => task.status === 'done').length,
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = tasks.filter((task) => {
      const overdue = isOverdue(task);
      if (filter === 'active' && task.status === 'done') return false;
      if (filter === 'upcoming' && (task.status === 'done' || !task.dueAt || new Date(task.dueAt).getTime() < Date.now())) return false;
      if (filter === 'overdue' && !overdue) return false;
      if (filter === 'reminders' && !reminderIds.has(task.id)) return false;
      if (filter === 'completed' && task.status !== 'done') return false;
      return !query || `${task.title} ${task.description ?? ''}`.toLowerCase().includes(query);
    });
    return filtered.sort((a, b) => {
      if (sort === 'priority') return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) || (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      return (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || b.createdAt.localeCompare(a.createdAt);
    });
  }, [tasks, filter, search, sort, reminderIds]);

  function newTask() { setEditingId(null); setDraft(EMPTY_DRAFT); setFormOpen(true); setError(''); }
  function editTask(task: Task) {
    setEditingId(task.id);
    setDraft({ title: task.title, description: task.description ?? '', priority: (task.priority as Priority) || 'normal', dueAt: localDateTime(task.dueAt), remindAt: localDateTime(task.remindAt), status: task.status === 'done' ? 'done' : task.status === 'in_progress' ? 'in_progress' : 'open' });
    setFormOpen(true);
    setError('');
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) { setError('Add a title for this task.'); return; }
    setSaving(true);
    setError('');
    const body = {
      title,
      description: draft.description.trim(),
      priority: draft.priority,
      dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
      remindAt: draft.remindAt ? new Date(draft.remindAt).toISOString() : null,
      status: draft.status,
    };
    try {
      const path = editingId ? `/tasks/${encodeURIComponent(editingId)}?${scope()}` : '/tasks';
      await apif<Task>(path, { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(editingId ? body : { ...body, userId: currentUserId(), workspaceId: currentWorkspace() }) });
      setFormOpen(false);
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Task could not be saved.'); }
    finally { setSaving(false); }
  }

  async function setStatus(task: Task, status: TaskStatus) {
    setError('');
    try {
      if (status === 'done') await apif(`/tasks/${encodeURIComponent(task.id)}/complete?${scope()}`, { method: 'POST' });
      else await apif(`/tasks/${encodeURIComponent(task.id)}?${scope()}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Task status could not be updated.'); }
  }

  async function deleteTask() {
    if (!deleteId) return;
    try {
      await apif(`/tasks/${encodeURIComponent(deleteId)}?${scope()}`, { method: 'DELETE' });
      setDeleteId(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Task could not be deleted.'); setDeleteId(null); }
  }

  return (
    <div className="task-workspace">
      <header className="task-page-head"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Tasks</h1><p>Keep the next step clear, and the important things moving.</p></div><button className="btn primary" onClick={newTask}>＋ Add task</button></header>

      {error && <div className="task-alert" role="alert"><span>{error}</span><button className="link-btn" onClick={() => void load()}>Retry</button></div>}
      {reminderCount > 0 && <div className="task-reminder-banner"><span className="task-reminder-icon">◷</span><span><b>{reminderCount} task reminder{reminderCount === 1 ? '' : 's'} need your attention</b><small>Review due reminders and incomplete tasks here.</small></span><button className="link-btn" onClick={() => setFilter('reminders')}>Review reminders →</button></div>}

      <section className="task-stats" aria-label="Task totals">
        <button className={filter === 'active' ? 'task-stat selected' : 'task-stat'} onClick={() => setFilter('active')}><span>Active</span><b>{counts.active}</b></button>
        <button className={filter === 'upcoming' ? 'task-stat selected' : 'task-stat'} onClick={() => setFilter('upcoming')}><span>Upcoming</span><b>{counts.upcoming}</b></button>
        <button className={filter === 'overdue' ? 'task-stat overdue selected' : 'task-stat overdue'} onClick={() => setFilter('overdue')}><span>Overdue</span><b>{counts.overdue}</b></button>
        <button className={filter === 'completed' ? 'task-stat selected' : 'task-stat'} onClick={() => setFilter('completed')}><span>Completed</span><b>{counts.completed}</b></button>
      </section>

      <section className="card task-list-card">
        <div className="task-list-head"><div><span className="eyebrow">TASK MANAGER</span><h2>{filter === 'active' ? 'Your active tasks' : `${filter[0].toUpperCase()}${filter.slice(1)} tasks`}</h2></div><button className="btn primary small task-add-mobile" onClick={newTask}>＋ Add task</button></div>
        <div className="task-controls"><label className="task-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" aria-label="Search tasks" /></label><label className="task-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort tasks"><option value="due">Due date</option><option value="priority">Priority</option><option value="created">Recently added</option></select></label>
          <div className="task-tabs" role="tablist" aria-label="Filter tasks">{([['active', 'Active'], ['all', 'All'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['reminders', 'Reminders'], ['completed', 'Completed']] as [TaskFilter, string][]).map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}{value === 'overdue' && counts.overdue > 0 ? ` ${counts.overdue}` : ''}</button>)}</div>
        </div>
        {loading ? <div className="task-empty"><span className="spinner" /> Loading tasks…</div> : visibleTasks.length === 0 ? <div className="task-empty"><span className="task-empty-icon">✓</span><h3>{search ? 'No matching tasks' : filter === 'completed' ? 'Nothing completed yet' : 'You’re all caught up'}</h3><p>{search ? 'Try a different search.' : filter === 'completed' ? 'Completed tasks will stay here for reference.' : 'Add a task or choose another view to see what’s next.'}</p>{!search && filter === 'active' && <button className="btn primary" onClick={newTask}>Add your first task</button>}</div> : <div className="task-list" role="list">{visibleTasks.map((task) => {
          const overdue = isOverdue(task);
          return <article className={`task-row${task.status === 'done' ? ' completed' : ''}${overdue ? ' is-overdue' : ''}`} key={task.id} role="listitem">
            <button className={`task-check${task.status === 'done' ? ' checked' : ''}`} aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Complete ${task.title}`} title={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'} onClick={() => void setStatus(task, task.status === 'done' ? 'open' : 'done')}>{task.status === 'done' ? '✓' : ''}</button>
            <div className="task-main"><div className="task-title-line"><h3>{task.title}</h3><span className={`task-status status-${overdue ? 'overdue' : task.status}`}>{displayStatus(task)}</span></div>{task.description && <p className="task-description">{task.description}</p>}<div className="task-meta"><span className={`priority priority-${task.priority}`}>{task.priority}</span>{task.dueAt && <span className={overdue ? 'task-deadline overdue' : 'task-deadline'}><span aria-hidden="true">◷</span> Due {formatDate(task.dueAt)}</span>}{task.remindAt && <span className="task-reminder-at"><span aria-hidden="true">♧</span> Reminder {formatDate(task.remindAt)}</span>}</div></div>
            <div className="task-actions"><button className="btn small" onClick={() => editTask(task)}>Edit</button>{task.status === 'done' ? <button className="link-btn" onClick={() => void setStatus(task, 'open')}>Reopen</button> : <button className="link-btn" onClick={() => void setStatus(task, 'in_progress')}>{task.status === 'in_progress' ? 'In progress' : 'Start'}</button>}<button className="icon-btn" aria-label={`Delete ${task.title}`} title="Delete task" onClick={() => setDeleteId(task.id)}>×</button></div>
          </article>;
        })}</div>}
      </section>

      {formOpen && <div className="confirm-scrim" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}><section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-form-title"><header><div><span className="eyebrow">TASK DETAILS</span><h2 id="task-form-title">{editingId ? 'Edit task' : 'Add a task'}</h2></div><button className="icon-btn" onClick={() => setFormOpen(false)} aria-label="Close task form" disabled={saving}>×</button></header>
        <form onSubmit={(event) => void saveTask(event)}><label className="field-label">Task title <span>*</span><input autoFocus maxLength={200} required value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="What needs to get done?" /></label><label className="field-label">Notes <small>Optional</small><textarea maxLength={5000} rows={3} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Add details or context" /></label>
          <div className="task-form-grid"><label className="field-label">Priority<select value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: event.target.value as Priority }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="field-label">Status<select value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value as TaskStatus }))}><option value="open">Open</option><option value="in_progress">In progress</option><option value="done">Completed</option></select></label><label className="field-label">Due date and time<input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft((value) => ({ ...value, dueAt: event.target.value }))} /></label><label className="field-label">Remind me<input type="datetime-local" value={draft.remindAt} onChange={(event) => setDraft((value) => ({ ...value, remindAt: event.target.value }))} /></label></div>
          <p className="task-form-note">Reminders are stored with the task and shown in the app when you open Tasks. Background or push alerts need a scheduler and notification setup.</p>
          <div className="task-dialog-actions"><button type="button" className="btn" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create task'}</button></div>
        </form></section></div>}

      {deleteId && <div className="confirm-scrim" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setDeleteId(null); }}><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-task-title"><h2 id="delete-task-title">Delete this task?</h2><p>This task will be permanently removed.</p><div className="row"><button className="btn" onClick={() => setDeleteId(null)}>Keep task</button><button className="btn danger" onClick={() => void deleteTask()}>Delete task</button></div></div></div>}
    </div>
  );
}
