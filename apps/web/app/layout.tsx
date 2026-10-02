import type { ReactNode } from 'react';
import './globals.css';
import WorkspaceBar from '../components/WorkspaceBar';
import GoogleButton from '../components/GoogleButton';

export const metadata = { title: 'Remy AI', description: 'Your intelligent AI work assistant' };

const LINKS = [
  ['Today', '/today'],
  ['Chat', '/chat'],
  ['Tasks', '/tasks'],
  ['Calendar', '/calendar'],
  ['Inbox', '/emails'],
  ['Docs', '/documents'],
  ['Follow-ups', '/followups'],
  ['Approvals', '/approvals'],
  ['Permissions', '/permissions'],
  ['Get started', '/get-started'],
  ['Sign in', '/signin'],
];

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <div className="topbar">
            <span className="brand"><span className="brand-mark">☀</span> Remy AI</span>
            <span className="row"><GoogleButton /><span className="tag">Can draft · asks before sending</span></span>
          </div>
          <WorkspaceBar />
          <nav className="nav">
            {LINKS.map(([label, href]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          {children}
          <div className="footer">Remy AI · organize, assist, suggest, execute — you stay in control.</div>
        </div>
      </body>
    </html>
  );
}
