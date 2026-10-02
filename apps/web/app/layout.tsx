import type { ReactNode } from 'react';
import './globals.css';
import WorkspaceBar from '../components/WorkspaceBar';
import GoogleButton from '../components/GoogleButton';
import Nav from '../components/Nav';

export const metadata = { title: 'Remy AI', description: 'Your intelligent AI work assistant' };

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <div className="wrap">
          <div className="topbar">
            <a className="brand" href="/today" aria-label="Remy AI home"><span className="brand-mark" aria-hidden>☀</span> Remy AI</a>
            <span className="row">
              <a href="/activity" aria-label="Notifications" style={{ textDecoration: 'none' }}><span className="tag">🔔 Activity</span></a>
              <GoogleButton />
              <a href="/signin"><span className="tag">Profile</span></a>
            </span>
          </div>
          <WorkspaceBar />
          <Nav />
          <main id="main">{children}</main>
          <div className="footer">Remy AI · organize, assist, suggest, execute — you stay in control.</div>
        </div>
      </body>
    </html>
  );
}
