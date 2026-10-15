'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { onWorkspaceChange } from '../../lib/workspace';

interface Ev { id: string; title: string; startsAt: string; endsAt: string }

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function keyOfIso(iso: string): string {
  return toDayKey(new Date(iso));
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [prep, setPrep] = useState<(Ev & { hasPrep: boolean })[]>([]);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [sel, setSel] = useState(() => toDayKey(new Date()));

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;

  async function load() {
    const q = Q();
    const [e, p] = await Promise.all([
      fetch(`${API}/events?${q}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/events/needing-prep?${q}`, { credentials: 'include' }).then((r) => r.json()),
    ]);
    setEvents(e);
    setPrep(p);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => onWorkspaceChange(load), []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function create() {
    setMsg('');
    const q = new URLSearchParams(Q());
    const res = await fetch(`${API}/events`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: q.get('userId'), workspaceId: q.get('workspaceId'), title, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }) });
    if (res.status === 409) {
      const j = await res.json();
      setMsg(`Conflict with "${j.with?.title ?? 'another meeting'}"`);
      return;
    }
    setTitle(''); setStart(''); setEnd('');
    load();
  }

  const todayKey = toDayKey(now);
  const first = new Date(view.y, view.m, 1);
  const monthLabel = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const leadBlanks = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    const k = keyOfIso(e.startsAt);
    const arr = byDay.get(k) ?? [];
    arr.push(e);
    byDay.set(k, arr);
  }
  const selEvents = (byDay.get(sel) ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const selDate = new Date(`${sel}T12:00:00`);
  const selLabel = selDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const timeLabel = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const dateLabel = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <>
      <div className="card cal-live">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="caption">Live calendar</span>
            <h1 className="page-h" style={{ margin: '2px 0 0' }}>{dateLabel}</h1>
            <p className="muted small" style={{ margin: '2px 0 0' }}><span className="cal-pulse" aria-hidden /> {timeLabel} · live</p>
          </div>
          <div className="row" style={{ flex: 'none' }}>
            <button className="btn small" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <button className="btn small" onClick={() => { const d = new Date(); setView({ y: d.getFullYear(), m: d.getMonth() }); setSel(toDayKey(d)); }}>Today</button>
            <button className="btn small" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          </div>
        </div>
        <p style={{ fontWeight: 800, margin: '12px 0 8px', color: 'var(--remy-heading)' }}>{monthLabel}</p>
        <div className="cal-grid" role="grid" aria-label={monthLabel}>
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {Array.from({ length: leadBlanks }).map((_, i) => <div key={`b${i}`} className="cal-day cal-blank" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = toDayKey(new Date(view.y, view.m, day));
            const dayEvents = byDay.get(key) ?? [];
            const cls = `cal-day${key === todayKey ? ' cal-today' : ''}${key === sel ? ' cal-sel' : ''}${dayEvents.length > 0 ? ' cal-has' : ''}`;
            return (
              <button key={key} className={cls} onClick={() => setSel(key)} aria-label={`${key}${dayEvents.length > 0 ? `, ${dayEvents.length} meetings` : ''}`}>
                <span className="cal-num">{day}</span>
                {dayEvents.slice(0, 2).map((e) => (
                  <span key={e.id} className="cal-ev">{fmtTime(e.startsAt)} {e.title}</span>
                ))}
                {dayEvents.length > 2 && <span className="cal-more">+{dayEvents.length - 2} more</span>}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          <b>{selLabel}</b>
          {selEvents.length === 0 && <p className="muted small" style={{ margin: '4px 0 0' }}>No meetings scheduled.</p>}
          {selEvents.map((m) => (
            <p key={m.id} style={{ margin: '4px 0' }}>• <b>{m.title}</b> <span className="muted">{fmtTime(m.startsAt)} → {fmtTime(m.endsAt)}</span></p>
          ))}
        </div>
      </div>
      <div className="card">
        <b>Schedule a meeting</b>
        <div className="row" style={{ marginTop: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ flex: 1 }} />
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button className="btn primary" onClick={create}>Schedule</button>
        </div>
        {msg && <p><span className="badge b-over">Conflict</span> {msg}</p>}
      </div>
      <div className="card">
        <b>Needs prep {prep.filter((p) => !p.hasPrep).length > 0 && <span className="badge b-attn">action</span>}</b>
        {prep.map((m) => <p key={m.id}>• <b>{m.title}</b> <span className="muted">{m.startsAt.slice(0, 16).replace('T', ' ')}</span> {m.hasPrep ? <span className="badge b-ok">prepped</span> : <span className="badge b-attn">no prep</span>}</p>)}
        {prep.length === 0 && <p className="muted">Nothing in the next 24h.</p>}
      </div>
      <div className="card">
        <b>All meetings</b>
        {events.map((m) => <p key={m.id}>• <b>{m.title}</b> <span className="muted">{m.startsAt.slice(0, 16).replace('T', ' ')} → {m.endsAt.slice(11, 16)}</span></p>)}
        {events.length === 0 && <p className="muted">None yet.</p>}
      </div>
    </>
  );
}
