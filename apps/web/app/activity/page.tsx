'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { PageHead, ActivityRow, Empty } from '../../components/ui';

interface Act { at: string; icon: string; tone: string; title: string; sub?: string }

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return `${Math.round(hrs / 24)} day${hrs >= 48 ? 's' : ''} ago`;
}

export default function ActivityPage() {
  const [items, setItems] = useState<Act[]>([]);

  useEffect(() => {
    fetch(`${API}/activity?workspaceId=${currentWorkspace()}&userId=${currentUserId()}`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {});
  }, []);

  return (
    <>
      <PageHead title="Activity" sub="Everything Remy and you did recently — approvals, completions and executions." />
      <div className="card">
        {items.length === 0 && <Empty>No activity yet. Approve something or complete a task.</Empty>}
        {items.map((a, i) => (
          <ActivityRow key={i} icon={a.icon} tone={a.tone} title={a.title} sub={a.sub} time={ago(a.at)} />
        ))}
      </div>
    </>
  );
}
