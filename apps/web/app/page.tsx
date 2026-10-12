'use client';

import { useEffect, useState } from 'react';
import { API } from '../lib/api';

interface Session { user?: { name?: string; email?: string } }

const FEATURES = [
  { icon: '✦', title: 'A calmer start to the day', text: 'See your priorities, meetings and follow-ups together, so the next step is clear.' },
  { icon: '↗', title: 'From busywork to done', text: 'Ask Remy to organize tasks, prepare a meeting or draft a thoughtful reply.' },
  { icon: '◷', title: 'Follow through with confidence', text: 'Keep important promises and open loops from slipping through the cracks.' },
];

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

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Remy AI home">
          <span className="landing-brand-mark" aria-hidden>✦</span> Remy<span>AI</span>
        </a>
        <nav aria-label="Account">
          <a className="landing-nav-link" href="/signin">Sign in</a>
          <a className="btn landing-nav-cta" href={session ? '/today' : '/get-started'}>
            {session ? 'Open workspace' : 'Get started'}
          </a>
        </nav>
      </header>

      <main className="landing-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-copy">
            <span className="landing-eyebrow"><span className="landing-eyebrow-dot" /> YOUR CALM, CAPABLE WORK PARTNER</span>
            <h1 id="landing-title">Make room for the work <em>that matters.</em></h1>
            <p className="landing-lede">
              Remy brings your tasks, meetings and follow-ups into focus, then helps you move each one forward. You stay in charge of every decision.
            </p>
            <div className="landing-actions">
              <a className="landing-primary" href={session ? '/today' : '/get-started'}>
                {session ? 'Open my workspace' : 'Get started for free'} <span aria-hidden>→</span>
              </a>
              <a className="landing-secondary" href="/signin">I already have an account</a>
            </div>
            <div className="landing-trust"><span aria-hidden>✓</span> Nothing is sent, scheduled or shared without your rule.</div>
          </div>

          <div className="landing-preview" aria-label="Preview of the Remy daily briefing">
            <div className="preview-topline"><span>MONDAY · YOUR BRIEFING</span><span className="preview-live"><i /> READY FOR YOU</span></div>
            <h2>Good morning.</h2>
            <p className="preview-intro">Here&apos;s what deserves your attention today.</p>
            <div className="preview-item preview-item-featured"><span className="preview-icon violet">◷</span><div><b>Prepare for your 10:30</b><small>Quarterly planning · 3 people</small></div><span className="preview-arrow">↗</span></div>
            <div className="preview-item"><span className="preview-icon yellow">✓</span><div><b>2 priority tasks</b><small>One due before lunch</small></div></div>
            <div className="preview-item"><span className="preview-icon blue">↩</span><div><b>1 follow-up to send</b><small>Draft ready for your review</small></div></div>
            <div className="preview-footer"><span className="preview-spark">✦</span><span><b>A little more focus.</b><small> Your day, with the details handled.</small></span></div>
          </div>
          <div className="landing-orbit orbit-one" aria-hidden>✦</div>
          <div className="landing-orbit orbit-two" aria-hidden>✳</div>
        </section>

        <section className="landing-benefits" aria-label="What Remy helps with">
          <div className="landing-section-heading"><span>LESS TO JUGGLE. MORE ROOM TO THINK.</span><h2>Your workday, working better.</h2></div>
          <div className="landing-feature-grid">
            {FEATURES.map((feature) => (
              <article className="landing-feature" key={feature.title}>
                <span className="landing-feature-icon" aria-hidden>{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="landing-footer"><span>Remy AI</span><span>Organize. Assist. Suggest. You decide.</span></footer>
      </main>
    </div>
  );
}
