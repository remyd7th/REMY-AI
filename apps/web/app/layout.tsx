import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Remy AI', description: 'Your intelligent AI work assistant' };

const LINKS = [
  ['Today', '/'],
  ['Chat', '/chat'],
  ['Tasks', '/tasks'],
  ['Approvals', '/approvals'],
];

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <div className="topbar">
            <b>Remy AI</b>
            <span className="muted" style={{ color: '#fff' }}>My Work · Can draft, asks before sending</span>
          </div>
          <nav className="nav">
            {LINKS.map(([label, href]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
