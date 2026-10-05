import type { ReactNode } from 'react';
import './globals.css';
import WorkspaceBar from '../components/WorkspaceBar';
import { PillNav, Sidebar, SessionArea, SearchBox } from '../components/Chrome';

export const metadata = { title: 'Remy AI', description: 'Your intelligent AI work assistant' };

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="cmdbar">
          <div className="cmdbar-in">
            <a className="brand" href="/today" aria-label="Remy AI home"><span className="brand-mark" aria-hidden>✦</span> REMY-AI</a>
            <PillNav />
            <SearchBox />
            <div className="cmd-right"><SessionArea /></div>
          </div>
        </header>
        <div className="shell">
          <aside className="sidebar" aria-label="Section">
            <Sidebar />
          </aside>
          <div>
            <WorkspaceBar />
            <main id="main">{children}</main>
            <div className="footer">Remy AI · organize, assist, suggest, execute — you stay in control.</div>
          </div>
        </div>
      </body>
    </html>
  );
}
