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

export function ApprovalCard({ action, body, channel, status, onApprove, onDeny, onEdit }: {
  action: string; body?: string; channel?: string; status: string;
  onApprove?: () => void; onDeny?: () => void; onEdit?: () => void;
}) {
  return (
    <div className="approval">
      <div className="approval-head"><span aria-hidden>⚡</span> Action needs your approval</div>
      <p style={{ margin: '10px 0 0' }}><b>{action}</b></p>
      {body && <div className="approval-body">{body.slice(0, 400)}</div>}
      <div className="row">
        {channel && <span className="badge b-info">{channel}</span>}
        <span className={`badge ${status === 'pending' ? 'b-attn' : 'b-ok'}`}>{status}</span>
      </div>
      {status === 'pending' && (onApprove || onDeny || onEdit) && (
        <div className="row" style={{ marginTop: 10 }}>
          {onEdit && <button className="btn" onClick={onEdit}>Edit</button>}
          {onDeny && <button className="btn danger" onClick={onDeny}>Reject</button>}
          {onApprove && <button className="btn primary" onClick={onApprove}>Approve &amp; Send</button>}
        </div>
      )}
    </div>
  );
}
