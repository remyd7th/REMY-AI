'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API } from '../lib/api';
import { InstallButton } from '../lib/pwa';

const FEATURES = [
  ['☀️', 'Morning briefing', 'Priority tasks, meetings, emails and follow-ups — what needs attention, first thing.'],
  ['💬', 'AI chat + voice-ready', 'Tell Remy in plain words. It organizes, drafts and prepares — you approve.'],
  ['📅', 'Calendar that defends you', 'Conflict detection, smart time suggestions, prep checklists before meetings.'],
  ['✉️', 'Email triage + drafts', 'Important-first inbox, one-click summaries, follow-up drafts that wait for approval.'],
  ['🔔', 'Follow-ups never die', 'Outstanding actions across email, meetings and docs — nudged, never nagged.'],
  ['🛡️', 'You stay in control', 'Always / ask / never per action. Nothing sends, schedules or shares without your rule.'],
];

export default function Landing() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Signed-in users skip the landing and go straight to their dashboard.
  useEffect(() => {
    fetch(`${API}/auth/get-session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        if (s?.user) router.replace('/today');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '48px auto' }} aria-busy="true">
        <b>Loading Remy AI…</b>
      </div>
    );
  }

  return (
    <>
      <div className="hero landing-hero">
        <span className="greet">Remy AI · your work assistant</span>
        <h1>Your intelligent AI work assistant.</h1>
        <p className="sub">
          Remy helps executive assistants, virtual assistants and busy professionals organize work,
          manage communication, coordinate schedules and stay on top of everything —
          while you stay in control.
        </p>
        <div className="row landing-cta" style={{ marginTop: 16 }}>
          <a href="/get-started"><button className="btn primary">Sign up — it&apos;s free</button></a>
          <a href="/signin"><button className="btn">Sign in</button></a>
          <InstallButton variant="hero" />
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          One click with Google — no passwords. Installs on phone and desktop.
        </p>
      </div>
      <div className="grid2">
        {FEATURES.map(([icon, title, text]) => (
          <div className="card" key={title}>
            <div style={{ fontSize: 26 }} aria-hidden>{icon}</div>
            <b>{title}</b>
            <p className="muted">{text}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <b>How it works</b>
        <p><b>1. Create your account</b> <span className="muted">— sign up in one click with Google.</span></p>
        <p><b>2. Connect Google</b> <span className="muted">— calendar + Gmail, read-first.</span></p>
        <p><b>3. Set your rules</b> <span className="muted">— what Remy may do alone vs ask first.</span></p>
        <p><b>4. Work your day</b> <span className="muted">— Remy notices, suggests, you decide.</span></p>
        <div className="row" style={{ marginTop: 10 }}>
          <a href="/get-started"><button className="btn primary">Get started →</button></a>
        </div>
      </div>
    </>
  );
}
