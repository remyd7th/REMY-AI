'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'remy-theme';

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return choice;
}

function apply(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolve(choice));
}

export function readThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  const v = window.localStorage.getItem(KEY);
  return v === 'dark' || v === 'system' || v === 'light' ? v : 'light';
}

const ThemeCtx = createContext<{ choice: ThemeChoice; resolved: ResolvedTheme; set: (t: ThemeChoice) => void }>({
  choice: 'light',
  resolved: 'light',
  set: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>('light');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const initial = readThemeChoice();
    setChoice(initial);
    setResolved(resolve(initial));
    apply(initial);
  }, []);

  useEffect(() => {
    if (choice !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setResolved(mq.matches ? 'dark' : 'light');
      apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const set = useCallback((t: ThemeChoice) => {
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* private mode */
    }
    setChoice(t);
    setResolved(resolve(t));
    apply(t);
  }, []);

  return <ThemeCtx.Provider value={{ choice, resolved, set }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

/** Inline script for <head>: applies saved theme before first paint (no flash). */
export const THEME_INIT_SCRIPT = `(function(){try{var k='remy-theme';var v=localStorage.getItem(k)||'light';var r=v;if(v==='system'){r=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
