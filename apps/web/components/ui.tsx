'use client';
import { ReactNode } from 'react';

export function PageHead({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-h">{title}</h1>
        {action}
      </div>
      <p>{sub}</p>
    </div>
  );
}

export function Stat({ n, label, tone }: { n: number | string; label: string; tone?: string }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  );
}

export function ActivityRow({ icon, tone, title, sub, time }: { icon: string; tone: string; title: string; sub?: string; time?: string }) {
  return (
    <div className="activity">
      <span className="activity-ic" style={{ background: tone }} aria-hidden>{icon}</span>
      <div>
        <b>{title}</b>
        {sub && <div className="muted small">{sub}</div>}
        {time && <div className="caption">{time}</div>}
      </div>
    </div>
  );
}

export function ApprovalCard({ action, body, channel, cc, bcc, subject, attachments, unresolved, status, createdAt, onApprove, onDeny, onEdit, onExecute }: {
  action: string; body?: string; channel?: string; cc?: string; bcc?: string; subject?: string;
  attachments?: string[]; unresolved?: string[]; status: string; createdAt?: string;
  onApprove?: () => void; onDeny?: () => void; onEdit?: () => void; onExecute?: () => void;
}) {
  return (
    <div className="approval-band">
      <div className="approval-band-head"><span aria-hidden>⚡</span> Action needs your approval</div>
      <div className="approval-band-body">
        <div className="row">
          <span className="channel-ic" aria-hidden>✉</span>
          <div>
            <b>{action}</b>
            {channel && <div style={{ marginTop: 4 }}><span className="badge b-info">{channel}</span></div>}
            {cc && <div style={{ marginTop: 4 }}><span className="badge b-info">{cc}</span></div>}
            {bcc && <div style={{ marginTop: 4 }}><span className="badge b-info">{bcc}</span></div>}
            {subject && <div style={{ marginTop: 4 }}><b>Subject:</b> {subject}</div>}
          </div>
        </div>
        {body && <p className="quote">“{body.slice(0, 220)}”</p>}
        {attachments && attachments.length > 0 && <p className="caption">📎 {attachments.join(', ')}</p>}
        {unresolved && unresolved.length > 0 && (
          <p className="caption">⚠ Needs a real address: {unresolved.join(', ')} — press Edit to fill it in.</p>
        )}
        <p className="caption">Created by Remy{createdAt ? ` · ${createdAt}` : ''}</p>
        <div className="row" style={{ marginTop: 6 }}>
          <span className={`badge ${status === 'pending' ? 'b-attn' : 'b-ok'}`}>{status}</span>
        </div>
        {(status === 'pending' || (status === 'approved' && (onEdit || onExecute))) && (
          <div className="row" style={{ marginTop: 10 }}>
            {onEdit && <button className="btn small" onClick={onEdit}>Edit</button>}
            {status === 'pending' && onDeny && <button className="btn small danger" onClick={onDeny}>Reject</button>}
            {status === 'pending' && onApprove && <button className="btn small secondary" onClick={onApprove}>Approve</button>}
            {status === 'approved' && onExecute && <button className="btn small primary" onClick={onExecute}>Execute send</button>}
          </div>
        )}
      </div>
    </div>
  );
}
