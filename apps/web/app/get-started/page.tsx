'use client';
import { useEffect, useState } from 'react';
import { API, storeUid } from '../../lib/api';
import GoogleButton from '../../components/GoogleButton';

interface Session { user?: { id: string; name?: string; email?: string } }

const STEPS = ['Create account', 'Onboarding', 'Dashboard'];

export default function GetStartedPage() {
  const [step, setStep] = useState(0);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [meetingTime, setMeetingTime] = useState('after 10am');
  const [emailTone, setEmailTone] = useState('short and professional');
  const [wsName, setWsName] = useState('');
  const [wsType, setWsType] = useState('personal');
  const [done, setDone] = useState('');

  async function load() {
    try {
      const res = await fetch(`${API}/auth/get-session`, { credentials: 'include' });
      const s = await res.json();
      setSession(s);
      if (s?.user?.id) {
        storeUid(s.user.id);
        setStep((st) => Math.max(st, 1));
      }
    } catch {
      setSession(null);
    }
  }
  useEffect(() => { load(); }, []);

  async function finish() {
    const uid = session?.user?.id;
    if (!uid) return;
    await fetch(`${API}/memories`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, key: 'meeting_time', value: meetingTime }) });
    await fetch(`${API}/memories`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, key: 'email_tone', value: emailTone }) });
    let target = '/today';
    if (wsName.trim()) {
      const w = await fetch(`${API}/workspaces`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, name: wsName, type: wsType }) }).then((r) => r.json());
      target = `/today?workspaceId=${w.id}`;
    }
    setDone(target);
    setStep(2);
  }

  return (
    <div className="grid2">
      <div className="hero">
        <b style={{ fontSize: 26 }}>Get started with Remy.</b>
        <p style={{ fontSize: 15, maxWidth: 420 }}>Remy is your intelligent AI work assistant.</p>
        <p style={{ fontSize: 14 }}>It helps you <b>organize</b>, <b>assist</b>, <b>suggest</b> and <b>execute</b> — while you stay in control.</p>
        <p style={{ fontSize: 14 }}><span className="hl">Nothing</span> sends, schedules or shares without your rule.</p>
        <div className="row" style={{ marginTop: 12 }}>
          {STEPS.map((s, i) => (
            <span key={s} className="badge" style={{ background: i <= step ? '#ffc800' : '#fff', color: '#0a0a0f' }}>{i + 1}. {s}</span>
          ))}
        </div>
      </div>
      <div className="card">
        {step === 0 && (
          <>
            <b>1 · Create account</b>
            <p className="muted">One click with Google — connects calendar + Gmail and creates your profile.</p>
            <GoogleButton />
            <p className="muted">Already have an account? <a href="/signin"><b>Sign in →</b></a></p>
          </>
        )}
        {step === 1 && (
          <>
            <b>2 · Onboarding — how do you work?</b>
            <p className="muted">Signed in as <b>{session?.user?.email}</b>. Tell Remy your defaults (changeable anytime).</p>
            <p>Meetings <input value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} placeholder="e.g. after 10am" /></p>
            <p>Emails <input value={emailTone} onChange={(e) => setEmailTone(e.target.value)} placeholder="e.g. short and professional" /></p>
            <p>First workspace <input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="e.g. Sarah — CEO (optional)" /></p>
            <p><select value={wsType} onChange={(e) => setWsType(e.target.value)}>
              <option value="personal">personal</option><option value="executive">executive</option>
              <option value="client">client</option><option value="team">team</option>
            </select></p>
            <button className="btn primary" onClick={finish}>Save & open dashboard →</button>
          </>
        )}
        {step === 2 && (
          <>
            <b>3 · You&apos;re in 🎉</b>
            <p className="muted">Remy saved your preferences and workspace. Your morning briefing is waiting.</p>
            <a href={done || '/today'}><button className="btn primary">Open Remy dashboard →</button></a>
          </>
        )}
      </div>
    </div>
  );
}
