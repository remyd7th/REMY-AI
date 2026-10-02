'use client';
import { useState } from 'react';

const LINKS = [
  ['Today', '/today'],
  ['Chat', '/chat'],
  ['Workflows', '/workflows'],
  ['Approvals', '/approvals'],
  ['Tasks', '/tasks'],
  ['Calendar', '/calendar'],
  ['Activity', '/activity'],
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className={`nav${open ? '' : ' collapsed'}`} aria-label="Main">
      <button className="btn small burger" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>☰</button>
      {LINKS.map(([label, href]) => (
        <a key={href} className="navlink" href={href}>{label}</a>
      ))}
    </nav>
  );
}
