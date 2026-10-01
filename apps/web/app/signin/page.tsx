'use client';
import GoogleButton from '../../components/GoogleButton';

export default function SignInPage() {
  return (
    <div className="grid2">
      <div className="hero">
        <b style={{ fontSize: 26 }}>Welcome back.</b>
        <p style={{ fontSize: 15, maxWidth: 420 }}>Remy is your intelligent AI work assistant.</p>
        <p style={{ fontSize: 14 }}>It helps you <b>organize</b>, <b>assist</b>, <b>suggest</b> and <b>execute</b> — while you stay in control.</p>
        <p style={{ fontSize: 14 }}><span className="hl">Nothing</span> sends, schedules or shares without your rule.</p>
        <p className="muted" style={{ color: '#fff', fontSize: 13 }}>Tasks · Calendar · Email · Follow-ups · Docs · Dashboard</p>
      </div>
      <div className="card">
        <b>Sign in</b>
        <p className="muted">Existing Remy account. One click with Google — no passwords.</p>
        <GoogleButton />
        <p className="muted">New to Remy? <a href="/get-started"><b>Get started →</b></a></p>
      </div>
    </div>
  );
}
