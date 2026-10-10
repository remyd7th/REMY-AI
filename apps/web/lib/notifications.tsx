'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from './api';
import { currentUserId, currentWorkspace } from '../components/WorkspaceBar';
import { WS_EVENT } from './workspace';

export type NoticeType = 'chat' | 'approval' | 'task' | 'workflow' | 'calendar' | 'email' | 'followup' | 'info';

export interface Toast {
  id: string;
  type: NoticeType;
  title: string;
  message: string;
  href?: string;
  at: number;
}

interface ChatDoneDetail {
  convoId: string;
  preview: string;
  msgId: string;
}

interface NotifyState {
  pendingApprovals: number;
  refreshApprovals: () => void;
  chatUnreadByConvo: Record<string, number>;
  chatUnreadTotal: number;
  markConvoRead: (convoId: string) => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id' | 'at'> & { id?: string }) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<NotifyState | null>(null);

export const APPROVALS_EVENT = 'remy:approvals-changed';
export const CHAT_DONE_EVENT = 'remy:chat-done';
export const ACTIVE_CONVO_KEY = 'remy-active-convo';
const UNREAD_KEY = 'remy-chat-unread';
const SEEN_KEY = 'remy-seen-chat-msgs';

export function emitApprovalsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APPROVALS_EVENT));
}

export function emitChatDone(convoId: string, preview: string, msgId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ChatDoneDetail>(CHAT_DONE_EVENT, { detail: { convoId, preview, msgId } }));
}

function loadUnread(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(UNREAD_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function loadSeen(): Set<string> {
  try {
    const arr = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch { /* private mode */ }
}

export function useNotifications(): NotifyState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications must be used inside NotificationProvider');
  return v;
}

/** Optional hook for components that may render outside the provider (e.g. tests). */
export function useNotificationsOptional(): NotifyState | null {
  return useContext(Ctx);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [chatUnreadByConvo, setChatUnreadByConvo] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const toastIdsRef = useRef<Set<string>>(new Set());
  const prevPendingRef = useRef(0);
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    seenRef.current = loadSeen();
    setChatUnreadByConvo(loadUnread());
  }, []);

  const persistUnread = useCallback((next: Record<string, number>) => {
    setChatUnreadByConvo(next);
    try {
      window.localStorage.setItem(UNREAD_KEY, JSON.stringify(next));
    } catch { /* private mode */ }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    toastIdsRef.current.delete(id);
  }, []);

  const pushToast = useCallback((t: Omit<Toast, 'id' | 'at'> & { id?: string }) => {
    const id = t.id ?? `${t.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (toastIdsRef.current.has(id)) return;
    toastIdsRef.current.add(id);
    const toast: Toast = { ...t, id, at: Date.now() };
    setToasts((ts) => [...ts.slice(-3), toast]);
    window.setTimeout(() => {
      setToasts((ts) => (ts.some((x) => x.id === id) ? ts.filter((x) => x.id !== id) : ts));
      toastIdsRef.current.delete(id);
    }, 6000);
  }, []);

  const refreshApprovals = useCallback(async () => {
    try {
      const ws = currentWorkspace();
      if (!ws) return;
      const res = await fetch(`${API}/approvals?workspaceId=${ws}&userId=${currentUserId()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const items = (await res.json()) as { status: string }[];
      const pending = items.filter((x) => x.status === 'pending').length;
      const prev = prevPendingRef.current;
      prevPendingRef.current = pending;
      setPendingApprovals(pending);
      if (pending > prev) {
        const added = pending - prev;
        pushToast({
          id: `approval-pending-${pending}-${Date.now()}`,
          type: 'approval',
          title: `${pending} approval${pending === 1 ? '' : 's'} waiting`,
          message: added === 1 ? 'A new request needs your review.' : `${added} new requests need your review.`,
          href: '/approvals',
        });
      }
    } catch { /* offline — keep last count */ }
  }, [pushToast]);

  useEffect(() => {
    refreshApprovals();
    const onChanged = () => refreshApprovals();
    const onWs = () => refreshApprovals();
    const onFocus = () => refreshApprovals();
    window.addEventListener(APPROVALS_EVENT, onChanged);
    window.addEventListener(WS_EVENT, onWs);
    window.addEventListener('focus', onFocus);
    const t = window.setInterval(refreshApprovals, 20000);
    return () => {
      window.removeEventListener(APPROVALS_EVENT, onChanged);
      window.removeEventListener(WS_EVENT, onWs);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(t);
    };
  }, [refreshApprovals]);

  const markConvoRead = useCallback((convoId: string) => {
    const cur = loadUnread();
    if (!cur[convoId]) return;
    const next = { ...cur };
    delete next[convoId];
    persistUnread(next);
  }, [persistUnread]);

  useEffect(() => {
    const onChatDone = (e: Event) => {
      const { convoId, preview, msgId } = (e as CustomEvent<ChatDoneDetail>).detail;
      if (!preview.trim()) return; // never notify for empty/failed responses
      if (seenRef.current.has(msgId)) return; // dedupe across listeners
      seenRef.current.add(msgId);
      saveSeen(seenRef.current);

      let active: string | null = null;
      try {
        active = window.localStorage.getItem(ACTIVE_CONVO_KEY);
      } catch { /* ignore */ }
      const onChatPage = (pathRef.current ?? '').startsWith('/chat');
      const viewing = onChatPage && active === convoId && document.visibilityState === 'visible';
      if (viewing) return; // user already sees the response

      const cur = loadUnread();
      persistUnread({ ...cur, [convoId]: (cur[convoId] ?? 0) + 1 });
      pushToast({
        id: `chat-${msgId}`,
        type: 'chat',
        title: 'Remy has responded',
        message: preview.slice(0, 120) || 'A new response is waiting for you.',
        href: `/chat?convo=${encodeURIComponent(convoId)}`,
      });
    };
    window.addEventListener(CHAT_DONE_EVENT, onChatDone);
    return () => window.removeEventListener(CHAT_DONE_EVENT, onChatDone);
  }, [persistUnread, pushToast]);

  const chatUnreadTotal = useMemo(
    () => Object.values(chatUnreadByConvo).reduce((a, b) => a + b, 0),
    [chatUnreadByConvo],
  );

  const value = useMemo<NotifyState>(
    () => ({ pendingApprovals, refreshApprovals, chatUnreadByConvo, chatUnreadTotal, markConvoRead, toasts, pushToast, dismissToast }),
    [pendingApprovals, refreshApprovals, chatUnreadByConvo, chatUnreadTotal, markConvoRead, toasts, pushToast, dismissToast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastStack />
    </Ctx.Provider>
  );
}

function ToastStack() {
  const ctx = useContext(Ctx);
  const router = useRouter();
  if (!ctx) return null;
  const { toasts, dismissToast, markConvoRead } = ctx;
  if (toasts.length === 0) return null;

  const go = (t: Toast) => {
    if (!t.href) return;
    const m = t.href.match(/\/chat\?convo=([^&]+)/);
    if (m) {
      try {
        window.localStorage.setItem(ACTIVE_CONVO_KEY, decodeURIComponent(m[1]));
      } catch { /* ignore */ }
      markConvoRead(decodeURIComponent(m[1]));
    }
    dismissToast(t.id);
    router.push(t.href);
  };

  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span className="toast-ic" aria-hidden>{t.type === 'chat' ? '✉' : t.type === 'approval' ? '✓' : '●'}</span>
          <div className="toast-body">
            <b>{t.title}</b>
            <div className="muted small">{t.message}</div>
          </div>
          {t.href && (
            <button className="btn small" onClick={() => go(t)} aria-label={`Open ${t.title}`}>
              View
            </button>
          )}
          <button className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
