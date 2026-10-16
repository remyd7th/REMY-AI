'use client';

import { FormEvent, useEffect, useState } from 'react';
import { API, apif } from '../../lib/api';
import { Empty, PageHead, Stat, Tabs } from '../../components/ui';

type Section = 'overview' | 'organizations' | 'users' | 'sessions' | 'history' | 'access' | 'audit' | 'settings';
type UserRow = {
  id: string; name: string | null; email: string; createdAt: string; emailVerified: boolean;
  status: string; platformRole: string; lastLoginAt: string | null; lastActivityAt: string | null;
  authMethods: string[]; activeSessionCount: number;
  memberships: { role: string; organization: { id: string; name: string; slug: string } }[];
};
type Org = { id: string; name: string; slug: string; _count: { memberships: number } };
type OrgMember = { id: string; role: string; createdAt: string; user: { id: string; name: string | null; email: string; status: string } };
type SessionRow = { id: string; userId: string; createdAt: string; updatedAt: string; expiresAt: string; userAgent: string | null; user: { name: string | null; email: string; lastActivityAt: string | null } };
type EventRow = { id: string; userId: string | null; actorId: string | null; type: string; outcome: string; createdAt: string; user?: { name: string | null; email: string } | null; details: unknown };
type Overview = { users: number; activeSessions: number; recentlyActiveUsers: number; suspendedUsers: number; recentEvents: EventRow[]; isSuperAdmin: boolean };
type Detail = UserRow & { suspensionReason: string | null; sessions: { id: string; createdAt: string; updatedAt: string; expiresAt: string; userAgent: string | null }[]; securityEvents: EventRow[]; accounts: { providerId: string; createdAt: string }[] };
type Page<T> = { page: number; pageSize: number; total: number; users?: T[]; sessions?: T[]; events?: T[]; members?: T[] };

const sections: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'organizations', label: 'Organizations' },
  { id: 'users', label: 'Users & Sessions' }, { id: 'sessions', label: 'Active Sessions' },
  { id: 'history', label: 'Login History' }, { id: 'access', label: 'Access Control' },
  { id: 'audit', label: 'Audit Logs' }, { id: 'settings', label: 'Global Settings' },
];

function when(value?: string | null) { return value ? new Date(value).toLocaleString() : 'No recorded activity'; }
function message(error: unknown) { return error instanceof Error ? error.message : 'Could not load administration data.'; }
function sessionDetails(event: EventRow) {
  if (!event.details || typeof event.details !== 'object') return null;
  const details = event.details as Record<string, unknown>;
  return {
    createdAt: typeof details.sessionCreatedAt === 'string' ? details.sessionCreatedAt : null,
    expiresAt: typeof details.sessionExpiresAt === 'string' ? details.sessionExpiresAt : null,
    userAgent: typeof details.userAgent === 'string' ? details.userAgent : null,
  };
}

export default function AdminPage() {
  const [section, setSection] = useState<Section>('overview');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [orgMembersPage, setOrgMembersPage] = useState(1);
  const [orgMembersTotal, setOrgMembersTotal] = useState(0);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [orgId, setOrgId] = useState('');
  const [activeDays, setActiveDays] = useState('');
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [registeredTo, setRegisteredTo] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventOutcome, setEventOutcome] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('member');

  useEffect(() => {
    apif<Overview>('/admin/overview').then((data) => {
      setOverview(data); setIsSuperAdmin(data.isSuperAdmin); setAuthorized(true);
      return apif<Org[]>('/admin/organizations');
    }).then(setOrgs).catch((e) => {
      setAuthorized(false);
      setError((e as Error & { status?: number }).status === 403 ? 'This account is not authorized for the Super Admin portal.' : message(e));
    });
  }, []);

  async function loadPage(nextPage = page) {
    if (!authorized) return;
    setBusy(true); setError('');
    try {
      if (section === 'users' || section === 'access') {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: '25' });
        if (section === 'users') {
          if (q) params.set('q', q);
          if (status) params.set('status', status);
          if (method) params.set('authMethod', method);
          if (orgId) params.set('organizationId', orgId);
          if (activeDays) params.set('activeWithinDays', activeDays);
          if (registeredFrom) params.set('registeredFrom', registeredFrom);
          if (registeredTo) params.set('registeredTo', registeredTo);
          params.set('sort', sort); params.set('direction', sortDir);
          const result = await apif<Page<UserRow>>(`/admin/users?${params}`);
          setUsers(result.users ?? []); setTotal(result.total);
        } else {
          const result = await apif<UserRow[]>('/admin/access-control');
          setUsers(result); setTotal(result.length);
        }
      } else if (section === 'sessions') {
        const result = await apif<Page<SessionRow>>(`/admin/sessions?page=${nextPage}&pageSize=25`);
        setSessions(result.sessions ?? []); setTotal(result.total);
      } else if (section === 'history' || section === 'audit') {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: '25' });
        if (section === 'history') {
          if (eventType) params.set('type', eventType);
          if (eventOutcome) params.set('outcome', eventOutcome);
        }
        const result = await apif<Page<EventRow>>(`/admin/login-history?${params}`);
        setEvents(result.events ?? []); setTotal(result.total);
      } else if (section === 'overview') {
        const data = await apif<Overview>('/admin/overview'); setOverview(data); setIsSuperAdmin(data.isSuperAdmin);
      } else if (section === 'organizations') {
        setOrgs(await apif<Org[]>('/admin/organizations'));
        if (orgId) {
          const result = await apif<Page<OrgMember>>(`/admin/organizations/${orgId}/members?page=${orgMembersPage}&pageSize=25`);
          setOrgMembers(result.members ?? []); setOrgMembersTotal(result.total);
        } else { setOrgMembers([]); setOrgMembersTotal(0); }
      }
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (authorized) { setPage(1); void loadPage(1); } }, [authorized, section, status, method, orgId, orgMembersPage, activeDays, registeredFrom, registeredTo, sort, sortDir, eventType, eventOutcome]);
  useEffect(() => { if (authorized && section === 'users') { const timer = setTimeout(() => { setPage(1); void loadPage(1); }, 250); return () => clearTimeout(timer); } }, [q]);
  useEffect(() => { if (selectedId) apif<Detail>(`/admin/users/${selectedId}`).then(setDetail).catch((e) => setError(message(e))); }, [selectedId]);

  function flash(text: string) { setNotice(text); window.setTimeout(() => setNotice(''), 3500); }
  async function act(url: string, methodName = 'POST', body?: unknown) {
    setError(''); setBusy(true);
    try {
      await apif(url, { method: methodName, body: body === undefined ? undefined : JSON.stringify(body) });
      flash('Action completed successfully.');
      if (selectedId) setDetail(await apif<Detail>(`/admin/users/${selectedId}`));
      if (section === 'users') await loadPage(page);
      if (section === 'overview') setOverview(await apif<Overview>('/admin/overview'));
      if (section === 'access') await loadPage(page);
      if (section === 'organizations') {
        setOrgs(await apif<Org[]>('/admin/organizations'));
        if (orgId) {
          const result = await apif<Page<OrgMember>>(`/admin/organizations/${orgId}/members?page=${orgMembersPage}&pageSize=25`);
          setOrgMembers(result.members ?? []); setOrgMembersTotal(result.total);
        }
      }
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function createOrganization(event: FormEvent) {
    event.preventDefault();
    await act('/admin/organizations', 'POST', { name: newOrgName, slug: newOrgSlug });
    setNewOrgName(''); setNewOrgSlug('');
  }
  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!orgId) { setError('Select an organization first.'); return; }
    await act(`/admin/organizations/${orgId}/members`, 'POST', { userId: memberUserId, role: memberRole });
    setMemberUserId('');
  }

  if (authorized === null) return <main className="admin-page"><PageHead title="Super Admin" sub="Checking administrator access…" /></main>;
  if (!authorized) return <main className="admin-page"><PageHead title="Super Admin" sub="Private platform administration." /><div className="admin-alert" role="alert">{error}</div><p><a href="/today">Return to Remy AI</a></p></main>;

  return <main className="admin-page">
    <PageHead title="Super Admin" sub="Platform users, active sessions, organizations, and security events." />
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {busy && <p className="muted" role="status">Loading administration data…</p>}
    <Tabs<Section> value={section} onChange={(value) => { setSection(value); setPage(1); setError(''); setDetail(null); }} tabs={sections.filter((tab) => isSuperAdmin || !['sessions', 'history', 'access', 'audit', 'settings'].includes(tab.id))} />

    {section === 'overview' && <>
      <div className="admin-stats">
        <Stat n={overview?.users ?? '—'} label="Registered users" />
        <Stat n={overview?.activeSessions ?? '—'} label="Valid sessions · not an online count" />
        <Stat n={overview?.recentlyActiveUsers ?? '—'} label="Recorded activity · last 7 days" />
        <Stat n={overview?.suspendedUsers ?? '—'} label="Suspended accounts" />
      </div>
      <section className="card admin-card"><h2>Recent security events</h2>
        {overview?.recentEvents.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Event</th><th>Account</th><th>When</th></tr></thead><tbody>
          {overview.recentEvents.map((event) => <tr key={event.id}><td>{event.type}</td><td>{event.user?.email ?? event.userId ?? 'Platform'}</td><td>{when(event.createdAt)}</td></tr>)}
        </tbody></table></div> : <Empty>No recorded events yet. Login monitoring starts when this module is enabled.</Empty>}
      </section>
    </>}

    {section === 'users' && <div className="admin-layout">
      <section className="card admin-card admin-main-card">
        <div className="admin-controls">
          <label className="field-label">Search<input aria-label="Search users" placeholder="Name, email, or user ID" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="field-label">Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="pending_verification">Pending verification</option></select></label>
          <label className="field-label">Auth method<select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option><option value="google">Google</option><option value="credential">Email / password</option></select></label>
          <label className="field-label">Organization<select value={orgId} onChange={(e) => setOrgId(e.target.value)}><option value="">All organizations</option>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
          <label className="field-label">Active within<select value={activeDays} onChange={(e) => setActiveDays(e.target.value)}><option value="">Any time</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
          <label className="field-label">Registered after<input type="date" value={registeredFrom} onChange={(e) => setRegisteredFrom(e.target.value)} /></label>
          <label className="field-label">Registered before<input type="date" value={registeredTo} onChange={(e) => setRegisteredTo(e.target.value)} /></label>
          <label className="field-label">Sort<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="createdAt">Registration</option><option value="lastLoginAt">Last login</option><option value="lastActivityAt">Last activity</option><option value="email">Email</option><option value="name">Name</option></select></label>
          <label className="field-label">Order<select value={sortDir} onChange={(e) => setSortDir(e.target.value)}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>
        </div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Status</th><th>Auth</th><th>Organizations / roles</th><th>Last sign-in</th><th>Last activity</th><th>Sessions</th><th /></tr></thead><tbody>
          {users.map((user) => <tr key={user.id}><td><strong>{user.name || 'Unnamed user'}</strong><div className="muted small">{user.email}</div><div className="caption">{user.id}</div></td><td>{user.status}</td><td>{user.authMethods.join(', ') || 'Unknown'}</td><td>{user.memberships.map((m) => `${m.organization.name} (${m.role})`).join(', ') || '—'}</td><td>{when(user.lastLoginAt)}</td><td>{when(user.lastActivityAt)}</td><td>{user.activeSessionCount}</td><td><button className="btn small" onClick={() => setSelectedId(user.id)}>Details</button></td></tr>)}
        </tbody></table></div>
        {!users.length && !busy && <Empty>No users match these filters.</Empty>}
        <Pager page={page} total={total} onPage={(next) => { setPage(next); void loadPage(next); }} />
      </section>
      {detail && <section className="card admin-card admin-detail">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2>User profile</h2><button className="btn small" onClick={() => { setDetail(null); setSelectedId(''); }}>Close</button></div>
        <p><strong>{detail.name || 'Unnamed user'}</strong><br />{detail.email}<br /><span className="caption">{detail.id}</span></p>
        <p>Status: <b>{detail.status}</b> · Role: <b>{detail.platformRole}</b><br />Joined {when(detail.createdAt)}<br />Email verified: {detail.emailVerified ? 'Yes' : 'No'}<br />Last login: {when(detail.lastLoginAt)}<br />Last activity: {when(detail.lastActivityAt)}</p>
        <p>Auth: {detail.accounts.map((account) => account.providerId).join(', ') || 'Unknown'}<br />Organizations: {detail.memberships.map((m) => `${m.organization.name} (${m.role})`).join(', ') || 'None'}</p>
        <h3>Current valid sessions</h3>
        {!detail.sessions.length && <p className="muted">No valid sessions.</p>}
        {detail.sessions.map((s) => <div className="admin-session" key={s.id}><span>Created {when(s.createdAt)}<br />Session updated {when(s.updatedAt)}<br />Expires {when(s.expiresAt)}{s.userAgent ? <><br />Browser: {s.userAgent.slice(0, 120)}</> : null}</span><button className="btn small danger" disabled={busy} onClick={() => void act(`/admin/sessions/${s.id}/revoke`)}>Revoke</button></div>)}
        <h3>Recent recorded session history</h3><p className="muted small">Session history is recorded from module activation onward.</p>
        {detail.securityEvents.filter((event) => event.type === 'logout.success' || event.type === 'session.revoked').map((event) => {
          const info = sessionDetails(event);
          return <div className="admin-session" key={event.id}><span>{event.type === 'logout.success' ? 'Signed out' : 'Revoked'} · {when(event.createdAt)}{info?.createdAt ? <><br />Session created {when(info.createdAt)}</> : null}{info?.expiresAt ? <><br />Session expired {when(info.expiresAt)}</> : null}{info?.userAgent ? <><br />Browser: {info.userAgent.slice(0, 120)}</> : null}</span></div>;
        })}
        {isSuperAdmin && <div className="row admin-actions">
          {detail.status === 'suspended' ? <button className="btn secondary" disabled={busy} onClick={() => void act(`/admin/users/${detail.id}/reactivate`)}>Reactivate account</button> : <button className="btn danger" disabled={busy} onClick={() => { const reason = window.prompt('Reason for suspension (optional):'); if (reason !== null) void act(`/admin/users/${detail.id}/suspend`, 'POST', { reason }); }}>Suspend account</button>}
          <button className="btn" disabled={busy} onClick={() => void act(`/admin/users/${detail.id}/revoke-sessions`)}>Revoke all sessions</button>
          {detail.platformRole === 'admin' ? <button className="btn" disabled={busy} onClick={() => void act(`/admin/users/${detail.id}/role`, 'PATCH', { role: 'user' })}>Remove platform admin</button> : <button className="btn" disabled={busy} onClick={() => void act(`/admin/users/${detail.id}/role`, 'PATCH', { role: 'admin' })}>Grant platform admin</button>}
        </div>}
        {isSuperAdmin && <><h3>Recent security events</h3>{detail.securityEvents.map((event) => <p className="caption" key={event.id}>{event.type} · {when(event.createdAt)}</p>)}</>}
      </section>}
    </div>}

    {section === 'sessions' && <section className="card admin-card"><p className="muted">A valid session means the stored session has not expired. It does not prove that the user is online.</p>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Created</th><th>Last activity (account)</th><th>Expires</th><th>Browser metadata</th><th /></tr></thead><tbody>
        {sessions.map((session) => <tr key={session.id}><td>{session.user.name || 'Unnamed user'}<div className="muted small">{session.user.email}</div></td><td>{when(session.createdAt)}</td><td>{when(session.updatedAt)}<div className="muted small">Account: {when(session.user.lastActivityAt)}</div></td><td>{when(session.expiresAt)}</td><td>{session.userAgent?.slice(0, 120) || 'Unavailable'}</td><td><button className="btn small danger" disabled={busy} onClick={() => void act(`/admin/sessions/${session.id}/revoke`)}>Revoke</button></td></tr>)}
      </tbody></table></div>{!sessions.length && !busy && <Empty>No unexpired sessions.</Empty>}<Pager page={page} total={total} onPage={(next) => { setPage(next); void loadPage(next); }} />
    </section>}

    {section === 'history' && <section className="card admin-card"><p className="muted">Sign-in outcomes are recorded from module activation onward. Older sign-ins are not reconstructed. Failed login records contain no email, password, IP address, or token.</p><div className="admin-controls"><label className="field-label">Event<select value={eventType} onChange={(e) => setEventType(e.target.value)}><option value="">All security events</option><option value="login.success">Successful sign-in</option><option value="login.failed">Failed sign-in</option><option value="logout.success">Sign-out</option><option value="email.verified">Email verified</option><option value="password.reset">Password reset</option><option value="session.revoked">Session revoked</option><option value="account.suspended">Account suspended</option><option value="account.reactivated">Account reactivated</option><option value="admin.role.changed">Admin role changed</option></select></label><label className="field-label">Outcome<select value={eventOutcome} onChange={(e) => setEventOutcome(e.target.value)}><option value="">All outcomes</option><option value="success">Success</option><option value="failure">Failure</option></select></label></div><EventTable events={events} empty="No security events match these filters." /><Pager page={page} total={total} onPage={(next) => { setPage(next); void loadPage(next); }} /></section>}
    {section === 'audit' && <section className="card admin-card"><p className="muted">Append-only security and administrative events. Credential values and tokens are never included.</p><EventTable events={events} empty="No audit events recorded yet." /><Pager page={page} total={total} onPage={(next) => { setPage(next); void loadPage(next); }} /></section>}

    {section === 'organizations' && <div className="admin-layout"><section className="card admin-card"><h2>Organizations</h2>
      {isSuperAdmin && <>
      <form className="admin-controls" onSubmit={createOrganization}><label className="field-label">Name<input required value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} /></label><label className="field-label">Slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={newOrgSlug} onChange={(e) => setNewOrgSlug(e.target.value)} /></label><button className="btn primary" disabled={busy}>Create organization</button></form>
      </>}
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Organization</th><th>Slug</th><th>Members</th><th /></tr></thead><tbody>{orgs.map((org) => <tr key={org.id}><td>{org.name}</td><td>{org.slug}</td><td>{org._count.memberships}</td><td><button className="btn small" onClick={() => { setOrgId(org.id); setOrgMembersPage(1); }}>Manage members</button></td></tr>)}</tbody></table></div>
      {!orgs.length && !busy && <Empty>No organizations have been created.</Empty>}
      {orgId && <><h3>Organization members</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Status</th><th>Joined</th><th>Role</th><th /></tr></thead><tbody>
        {orgMembers.map((member) => <tr key={member.id}><td><strong>{member.user.name || 'Unnamed user'}</strong><div className="muted small">{member.user.email}</div><div className="caption">{member.user.id}</div></td><td>{member.user.status}</td><td>{when(member.createdAt)}</td><td><select aria-label={`Role for ${member.user.email}`} value={member.role} onChange={(e) => void act(`/admin/organizations/${orgId}/members/${member.user.id}`, 'PATCH', { role: e.target.value })}><option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select></td><td><button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.user.email} from ${orgs.find((org) => org.id === orgId)?.name ?? 'this organization'}?`)) void act(`/admin/organizations/${orgId}/members/${member.user.id}`, 'DELETE'); }}>Remove</button></td></tr>)}
      </tbody></table></div>{!orgMembers.length && !busy && <Empty>No members in this organization yet.</Empty>}<Pager page={orgMembersPage} total={orgMembersTotal} onPage={setOrgMembersPage} /></>}
    </section>{isSuperAdmin && <section className="card admin-card"><h2>Add or update membership</h2><p className="muted">Paste the user ID from the directory profile.</p><form className="admin-form" onSubmit={addMember}><label className="field-label">Organization<select required value={orgId} onChange={(e) => setOrgId(e.target.value)}><option value="">Choose organization</option>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label className="field-label">User ID<input required value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} /></label><label className="field-label">Role<select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}><option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select></label><button className="btn primary" disabled={busy}>Save membership</button></form></section>}</div>}

    {section === 'access' && <section className="card admin-card"><p className="muted">Configured Super Admins are set with <code>SUPER_ADMIN_EMAILS</code>. Platform admins can view the directory; sensitive account controls require Super Admin access.</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Platform role</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name || 'Unnamed user'}</td><td>{user.email}</td><td>{user.platformRole}</td><td><button className="btn small" onClick={() => { setSection('users'); setSelectedId(user.id); }}>Open profile</button></td></tr>)}</tbody></table></div></section>}
    {section === 'settings' && <section className="card admin-card"><h2>Global settings</h2><p className="muted">This project does not yet have a persisted global settings store. Super Admin identity is configured through <code>SUPER_ADMIN_EMAILS</code> on the API server.</p></section>}
  </main>;
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 25));
  return <div className="admin-pager"><span>{total} records · page {page} of {pages}</span><div className="row"><button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><button className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}

function EventTable({ events, empty }: { events: EventRow[]; empty: string }) {
  if (!events.length) return <Empty>{empty}</Empty>;
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Event</th><th>Account</th><th>Outcome</th><th>When</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.type}</td><td>{event.user?.email ?? event.userId ?? 'Platform'}</td><td>{event.outcome}</td><td>{when(event.createdAt)}</td></tr>)}</tbody></table></div>;
}
