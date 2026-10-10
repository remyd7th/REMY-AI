'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Registers /sw.js once. Safe on browsers without service workers. */
export function PwaBoot() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reloading = false;
    const onController = () => {
      // A new worker took over (update installed) — load it once.
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    navigator.serviceWorker
      .register('/sw.js')
      .catch(() => {
        /* offline on first load or unsupported — app still works */
      });
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onController);
    };
  }, []);
  return null;
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setDeferred(null);
    return outcome;
  }, [deferred]);

  return { canPrompt: !!deferred, installed, install };
}

/** Step-by-step install help when the browser won't show its own prompt (iOS, etc.). */
export function InstallHelp({ onClose }: { onClose: () => void }) {
  const ios = isIos();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <b id="install-help-title" style={{ fontSize: 17 }}>Install Remy AI</b>
        {ios ? (
          <ol className="install-steps">
            <li>Tap the <b>Share</b> button in Safari&apos;s toolbar.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b> — Remy opens like a native app.</li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>Open Remy in <b>Chrome or Edge</b>.</li>
            <li>Click the <b>install icon</b> at the right of the address bar (or menu → <b>Install Remy AI</b>).</li>
            <li>Confirm <b>Install</b> — Remy gets its own window and home-screen icon.</li>
          </ol>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={onClose} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Visible install entry point. Renders nothing once installed.
 * `variant="header"` is a compact header button; `variant="hero"` is a large CTA.
 */
export function InstallButton({ variant = 'header' }: { variant?: 'header' | 'hero' }) {
  const { canPrompt, installed, install } = useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (installed) return null;

  async function onClick() {
    if (!canPrompt) {
      setHelpOpen(true);
      return;
    }
    setBusy(true);
    try {
      const outcome = await install();
      if (outcome === 'dismissed') setHelpOpen(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === 'header' ? (
        <button
          className="btn small install-btn"
          onClick={onClick}
          disabled={busy}
          aria-label="Install Remy AI on this device"
          title="Install Remy AI"
        >
          <span aria-hidden>⤓</span> Install
        </button>
      ) : (
        <button className="btn primary install-hero" onClick={onClick} disabled={busy}>
          {busy ? '…' : '⤓ Install Remy AI'}
        </button>
      )}
      {helpOpen && <InstallHelp onClose={() => setHelpOpen(false)} />}
    </>
  );
}

export function PwaGate({ children }: { children: ReactNode }) {
  return (
    <>
      <PwaBoot />
      {children}
    </>
  );
}
