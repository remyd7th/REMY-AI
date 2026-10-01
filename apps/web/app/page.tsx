const FEATURES = [
  ['☀️', 'Morning briefing', 'Priority tasks, meetings, emails and follow-ups — what needs attention, first thing.'],
  ['💬', 'AI chat + voice-ready', 'Tell Remy in plain words. It organizes, drafts and prepares — you approve.'],
  ['📅', 'Calendar that defends you', 'Conflict detection, smart time suggestions, prep checklists before meetings.'],
  ['✉️', 'Email triage + drafts', 'Important-first inbox, one-click summaries, follow-up drafts that wait for approval.'],
  ['🔔', 'Follow-ups never die', 'Outstanding actions across email, meetings and docs — nudged, never nagged.'],
  ['🛡️', 'You stay in control', 'Always / ask / never per action. Nothing sends, schedules or shares without your rule.'],
];

export default function Landing() {
  return (
    <>
      <div className="hero">
        <b style={{ fontSize: 30 }}>Your intelligent AI work assistant.</b>
        <p style={{ fontSize: 16, maxWidth: 640 }}>
          Remy helps executive assistants, virtual assistants and busy professionals organize work,
          manage communication, coordinate schedules and stay on top of everything —
          <span className="hl"> while you stay in control.</span>
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <a href="/get-started"><button className="btn sun">Get started →</button></a>
          <a href="/signin"><button className="btn">Sign in</button></a>
          <a href="/today"><button className="btn">See today&apos;s demo</button></a>
        </div>
      </div>
      <div className="grid2">
        {FEATURES.map(([icon, title, text]) => (
          <div className="card" key={title}>
            <div style={{ fontSize: 26 }}>{icon}</div>
            <b>{title}</b>
            <p className="muted">{text}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <b>How it works</b>
        <p><b>1. Connect Google</b> <span className="muted">— calendar + Gmail, read-first.</span></p>
        <p><b>2. Set your rules</b> <span className="muted">— what Remy may do alone vs ask first.</span></p>
        <p><b>3. Work your day</b> <span className="muted">— Remy notices, suggests, you decide.</span></p>
      </div>
    </>
  );
}
