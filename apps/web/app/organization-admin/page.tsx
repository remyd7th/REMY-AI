'use client';

import { useEffect, useState } from 'react';
import { apif } from '../../lib/api';
import { Empty, PageHead, Tabs } from '../../components/ui';

type OrgRef = { id: string; name: string; slug: string; role: string };
type Access = {
  user: { id: string; email: string; name: string | null; platformRole: string };
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  orgAdminOf: OrgRef[];
  memberOf: OrgRef[];
};
type Member = { id: string; role: string; createdAt: string; user: { id: string; name: string | null; email: string; status: string; lastActivityAt: string | null } };
type Event = { id: string; type: string; outcome: string; createdAt: string; userId: string | null; user?: { name: string | null; email: string } | null };
type Section = 'members' | 'activity';

function fmt(value: string | null) { return value ? new Date(value).toLocaleString() : 'No activity recorded'; }
function message(e: unknown) { return e instanceof Error ? e.message : 'Could not load administration data.'; }

export default function AdminLandingPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [section, setSection] = useState<Section>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<Member | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    apif<Access>('/admin/access')
      .then((a) => {
        setAccess(a);
        setOrganizationId(a.orgAdminOf[0]?.id ?? '');
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    const path = section === 'members'
      ? `/organization-admin/${organizationId}/members?${params}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      : `/organization-admin/${organizationId}/activity?${params}`;
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}${path}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(`Could not load organization data (${response.status}).`); return response.json(); })
      .then((data) => { if (section === 'members') setMembers(data.members ?? []); else setEvents(data.events ?? []); setTotal(data.total ?? 0); })
      .catch((e) => { if ((e as Error).name !== 'AbortError') setError(message(e)); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [organizationId, section, page, q]);

  async function reloadMembers() {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (q) params.set('q', q);
    try {
      const data = await apif<{ members: Member[]; total: number }>(`/organization-admin/${organizationId}/members?${params}`);
      setMembers(data.members ?? []); setTotal(data.total ?? 0);
    } catch (e) { setError(message(e)); }
  }

  async function confirmSuspend() {
    if (!suspendTarget || busy) return;
    setBusy(true); setError('');
    try {
      await apif(`/organization-admin/${organizationId}/members/${suspendTarget.user.id}/suspend`, {
        method: 'POST', body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      setNotice(`Suspended ${suspendTarget.user.email}. Their sessions were revoked.`);
      setSuspendTarget(null); setReason('');
      await reloadMembers();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function reactivate(member: Member) {
    if (busy) return;
    if (!window.confirm(`Restore access for ${member.user.email}?`)) return;
    setBusy(true); setError('');
    try {
      await apif(`/organization-admin/${organizationId}/members/${member.user.id}/reactivate`, { method: 'POST' });
      setNotice(`Restored access for ${member.user.email}.`);
      await reloadMembers();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  if (loading && !access) return <main className="admin-page"><PageHead title="Admin" sub="Checking your access level…" /></main>;

  const role = access
    ? access.isSuperAdmin ? 'Super Admin' : access.isOrgAdmin ? 'Admin' : 'Member'
    : 'Unknown';

  return <main className="admin-page">
    <PageHead title="Admin" sub="Manage authorized workspace administration and account access." />
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {error && <p className="admin-alert" role="alert">{error}</p>}

    <section className="card admin-card">
      <h2>Your access level: {role}</h2>
      {access && <>
        <p className="muted small">
          Signed in as <b>{access.user.name ?? access.user.email}</b> ({access.user.email}).
          {access.isSuperAdmin && ' You hold platform-wide Super Admin privileges.'}
          {!access.isSuperAdmin && access.isOrgAdmin && ` You administer: ${access.orgAdminOf.map((o) => `${o.name} (${o.role})`).join(', ')}.`}
          {!access.isSuperAdmin && !access.isOrgAdmin && ' You can view this area, but administrative actions require an Admin role.'}
        </p>
        {access.memberOf.length > 0 && (
          <p className="muted small">Your organizations: {access.memberOf.map((o) => `${o.name} (${o.role})`).join(', ')}.</p>
        )}
        {access.isSuperAdmin && <p><a href="/admin"><button className="btn primary">Open Super Admin Portal →</button></a></p>}
      </>}
    </section>

    {access && !access.isOrgAdmin && !access.isSuperAdmin && (
      <Empty>
        <p><b>Administration is read-only for your account.</b></p>
        <p className="muted small">Organization user management, suspension, and platform settings require an Admin or Super Admin role. Ask your organization owner for access if you need it.</p>
        <p><a href="/today">Return to Remy AI</a></p>
      </Empty>
    )}

    {access && (access.isOrgAdmin || access.isSuperAdmin) && access.orgAdminOf.length > 0 && <>
      <label className="field-label admin-org-select">Organization<select value={organizationId} onChange={(e) => { setOrganizationId(e.target.value); setPage(1); }}>
        {access.orgAdminOf.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.role}</option>)}
      </select></label>
      <Tabs<Section> value={section} onChange={(value) => { setSection(value); setPage(1); }} tabs={[{ id: 'members', label: 'Team Members' }, { id: 'activity', label: 'Activity' }]} />
      {section === 'members' && <section className="card admin-card"><div className="admin-controls"><label className="field-label">Search team members<input placeholder="Name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Account status</th><th>Last recorded activity</th><th>Actions</th></tr></thead><tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td><strong>{member.user.name || 'Unnamed user'}</strong><div className="muted small">{member.user.email}</div></td>
              <td>{member.role}</td>
              <td>{member.user.status}</td>
              <td>{fmt(member.user.lastActivityAt)}</td>
              <td>
                {member.role === 'owner'
                  ? <span className="muted small">Owners change via Super Admin Portal</span>
                  : member.user.status === 'suspended'
                    ? <button className="btn small" disabled={busy} onClick={() => reactivate(member)}>Restore</button>
                    : <button className="btn small danger" disabled={busy} onClick={() => setSuspendTarget(member)}>Suspend</button>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
        {!members.length && !loading && <Empty>No team members match this search.</Empty>}<Pager page={page} total={total} onPage={setPage} />
      </section>}
      {section === 'activity' && <section className="card admin-card"><p className="muted">Only administrative activity explicitly associated with this organization is shown. Global sign-in history and session details are not available here.</p>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Event</th><th>Member</th><th>Outcome</th><th>When</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.type}</td><td>{event.user?.email ?? event.userId ?? 'Organization'}</td><td>{event.outcome}</td><td>{fmt(event.createdAt)}</td></tr>)}</tbody></table></div>
        {!events.length && !loading && <Empty>No organization activity recorded yet.</Empty>}<Pager page={page} total={total} onPage={setPage} />
      </section>}
    </>}
    {loading && <p className="muted">Loading organization access…</p>}

    {suspendTarget && (
      <div className="confirm-scrim" onClick={() => setSuspendTarget(null)}>
        <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Suspend member">
          <h2>Suspend {suspendTarget.user.email}?</h2>
          <p>Suspension signs them out immediately on all devices. They cannot sign back in until restored.</p>
          <p><label className="field-label">Reason (optional)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is access being removed?" /></label></p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setSuspendTarget(null)}>Cancel</button>
            <button className="btn danger" onClick={confirmSuspend} disabled={busy}>Suspend member</button>
          </div>
        </div>
      </div>
    )}
  </main>;
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 25));
  return <div className="admin-pager"><span>{total} records · page {page} of {pages}</span><div className="row"><button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><button className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}
