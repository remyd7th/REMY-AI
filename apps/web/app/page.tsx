'use client';

import { useEffect, useState } from 'react';
import { API } from '../lib/api';

interface Session { user?: { name?: string; email?: string } }

export default function Landing() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API}/auth/get-session`, { credentials: 'include' })
      .then((response) => response.json())
      .then((value) => { if (active && value?.user) setSession(value); })
      .catch(() => { /* The welcome page remains useful when the API is offline. */ });
    return () => { active = false; };
  }, []);

  const ctaHref = session ? '/today' : '/get-started';

  return (
    <div className="landing-page landing-dark">
      <div className="dark-bg" aria-hidden />
      <div className="dark-wrap">
        <header className="dark-nav">
          <a className="dark-brand" href="/" aria-label="Remy AI home">✦ Remy AI</a>
          <nav aria-label="Account">
            <a className="dark-pill" href="/signin">Sign in</a>
            <a className="dark-pill dark-pill-solid" href={ctaHref}>{session ? 'Open workspace →' : 'Get started →'}</a>
          </nav>
        </header>

        <main>
          <section className="dark-hero" aria-labelledby="landing-title">
            <div className="dark-eyebrow">✦ AI WORK ASSISTANT FOR EA&apos;S &amp; TEAMS</div>
            <h1 id="landing-title">Your work, <span>on autopilot.</span> You in control.</h1>
            <p className="dark-lede">Chat, voice, and dashboard in one intelligent assistant. Tasks, calendar, email, docs and follow-ups — handled.</p>
            <div className="dark-cta">
              <a className="dark-btn dark-btn-primary" href={ctaHref}>{session ? 'Open my workspace' : 'Start free today'}</a>
              <a className="dark-btn dark-btn-secondary" href="/signin">▶ Live demo</a>
            </div>
            <div className="dark-sub">✓ No credit card · ✓ 2-min setup · ✓ Cancel anytime</div>
          </section>

          <section className="dark-dash" aria-label="Preview of Remy today">
            <div className="dark-dash-bar"><span className="dark-dot" /><span className="dark-dot" /><span className="dark-dot" /><span className="dark-url">remy.ai / today</span></div>
            <div className="dark-dash-body">
              <div className="dark-chat">
                <div className="dark-chat-label">TODAY&apos;S CHAT</div>
                <div className="dark-msg">You: organize my tasks for tomorrow</div>
                <div className="dark-msg dark-msg-ai">Remy: Done — 3 priorities sorted, 2 meetings prepped, 1 draft ready for review. ✓</div>
                <div className="dark-msg dark-msg-ai">Remy: Shall I send the follow-up to Sarah?</div>
              </div>
              <div className="dark-stats">
                <div className="dark-stat"><b>12</b><br /><small>tasks organized today</small></div>
                <div className="dark-stat"><b>3</b><br /><small>meetings prepped</small></div>
                <div className="dark-stat"><b>100%</b><br /><small>nothing slipped</small></div>
              </div>
            </div>
          </section>

          <section className="dark-grid" aria-label="What Remy helps with">
            <div><span>💬</span><h3>AI Chat + Voice</h3><p>Natural-language instructions, hands-free actions.</p></div>
            <div><span>📅</span><h3>Calendar &amp; Email</h3><p>Scheduling, conflicts, summaries and drafts.</p></div>
            <div><span>🛡️</span><h3>Permission-first</h3><p>Nothing sent without your approval.</p></div>
          </section>

          <footer className="dark-footer"><span>Remy AI — Dark Modern</span><span>Organize. Assist. Suggest. You decide.</span></footer>
        </main>
      </div>
    </div>
  );
}
