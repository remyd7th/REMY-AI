'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API, apif } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { onWorkspaceChange } from '../../lib/workspace';
import { Empty, PageHead, Stat } from '../../components/ui';

interface Doc {
  id: string; title: string; type: string; storageKey: string;
  mimeType: string | null; size: number | null;
  summary: string | null; extracted: { keyPoints?: string[] } | null;
  createdAt: string; updatedAt: string;
}

const ACCEPT = '.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg';
const MAX_SIZE = 25 * 1024 * 1024;
type SortKey = 'newest' | 'oldest' | 'name' | 'size';
type UpStatus = 'ready' | 'uploading' | 'done' | 'error';
interface UpItem { key: number; file: File; progress: number | null; status: UpStatus; error: string | null; xhr: XMLHttpRequest | null }

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function kindOf(d: Doc): string {
  const ext = d.title.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf', 'doc', 'docx', 'txt', 'csv', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg'].includes(ext)) return ext;
  return (d.type || 'file').toLowerCase();
}

function previewable(d: Doc): boolean {
  const k = kindOf(d);
  if (['pdf', 'png', 'jpg', 'jpeg', 'txt'].includes(k)) return true;
  return (d.mimeType ?? '').startsWith('image/') || d.mimeType === 'application/pdf';
}

function apiError(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    const m = e.message.match(/→ (\d{3})/);
    if (m?.[1] === '404') return 'Not found — it may have been deleted or belong to another workspace.';
    if (m?.[1] === '401') return 'Your session expired. Sign in again and retry.';
    if (m?.[1] === '413') return 'File too large for the server.';
    if (m?.[1] === '503') return 'Storage is temporarily unavailable. Try again in a moment.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(e.message)) return 'Network error. Check your connection and retry.';
    return e.message.length < 160 ? e.message : fallback;
  }
  return fallback;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sel, setSel] = useState<Doc | null>(null);
  const [text, setText] = useState('');
  const [nTitle, setNTitle] = useState('');
  const [nNotes, setNNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list';
    return window.localStorage.getItem('remy-docs-view') === 'grid' ? 'grid' : 'list';
  });
  const [uploads, setUploads] = useState<UpItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [detail, setDetail] = useState<Doc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keySeq = useRef(1);

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetch(`${API}/documents?${Q()}`, { credentials: 'include', cache: 'no-store' }).then(async (r) => {
        if (!r.ok) throw new Error(`GET /documents → ${r.status}`);
        const j = await r.json();
        if (!Array.isArray(j)) throw new Error('Unexpected response from the server.');
        return j as Doc[];
      });
      setDocs(data);
      setSel((s) => (s ? data.find((d) => d.id === s.id) ?? null : null));
    } catch (e) {
      setLoadError(apiError(e, 'Could not load documents.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => onWorkspaceChange(load), []);

  function setViewMode(v: 'list' | 'grid') {
    setView(v);
    try { window.localStorage.setItem('remy-docs-view', v); } catch { /* private mode */ }
  }

  function validate(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const ok = ['pdf', 'doc', 'docx', 'txt', 'csv', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg'];
    if (!ok.includes(ext)) return `“.${ext || '?'}” is not supported. Use PDF, Word, TXT, CSV, Excel, PowerPoint, PNG, or JPG.`;
    if (file.size <= 0) return 'That file appears to be empty.';
    if (file.size > MAX_SIZE) return `“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — the limit is 25 MB.`;
    return null;
  }

  function queueFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setNotice(null);
    setUploads((prev) => [
      ...prev,
      ...arr.map((file) => {
        const error = validate(file);
        return { key: keySeq.current++, file, progress: null, status: (error ? 'error' : 'ready') as UpStatus, error, xhr: null };
      }),
    ]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function patchUpload(key: number, patch: Partial<UpItem>) {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  function runUpload(item: UpItem) {
    const xhr = new XMLHttpRequest();
    patchUpload(item.key, { status: 'uploading', progress: 0, error: null, xhr });
    (async () => {
      try {
        const q = new URLSearchParams(Q());
        const pres = await apif<{ key: string; url: string; mimeType: string }>(`/documents/upload-url`, {
          method: 'POST',
          body: JSON.stringify({
            filename: item.file.name,
            contentType: item.file.type || 'application/octet-stream',
            size: item.file.size,
            workspaceId: q.get('workspaceId'),
            userId: q.get('userId'),
          }),
        });
        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            patchUpload(item.key, { progress: e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null });
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Storage upload failed (${xhr.status}).`));
          };
          xhr.onerror = () => reject(new Error('Storage upload failed. Check your connection and retry.'));
          xhr.onabort = () => reject(new Error('cancelled'));
          xhr.open('PUT', pres.url);
          xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');
          xhr.send(item.file);
        });
        const record = await apif<Doc>(`/documents`, {
          method: 'POST',
          body: JSON.stringify({
            userId: q.get('userId'),
            workspaceId: q.get('workspaceId'),
            title: item.file.name,
            type: 'upload',
            storageKey: pres.key,
            mimeType: pres.mimeType,
            size: item.file.size,
          }),
        });
        setDocs((prev) => (prev.some((d) => d.id === record.id) ? prev : [record, ...prev]));
        patchUpload(item.key, { status: 'done', progress: 100, xhr: null });
      } catch (e) {
        if (e instanceof Error && e.message === 'cancelled') {
          patchUpload(item.key, { status: 'ready', progress: null, error: null, xhr: null });
        } else {
          patchUpload(item.key, { status: 'error', error: apiError(e, 'Upload failed.'), xhr: null });
        }
      }
    })();
  }

  function cancelUpload(item: UpItem) {
    item.xhr?.abort();
  }

  function dismissUpload(key: number) {
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }

  async function downloadDoc(d: Doc, open: boolean) {
    try {
      const q = Q();
      const { url } = await apif<{ url: string }>(`/documents/${d.id}/download-url?${q}`);
      if (open) window.open(url, '_blank', 'noopener');
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = d.title;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      setNotice(apiError(e, 'Could not fetch a download link.'));
    }
  }

  async function saveRename() {
    if (!renaming || busy) return;
    const title = renaming.title.trim();
    if (!title) return;
    setBusy(true);
    try {
      const updated = await apif<Doc>(`/documents/${renaming.id}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ title, userId: currentUserId() }),
      });
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSel((s) => (s?.id === updated.id ? updated : s));
      setDetail((s) => (s?.id === updated.id ? updated : s));
      setRenaming(null);
    } catch (e) {
      setNotice(apiError(e, 'Rename failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    setBusy(true);
    try {
      await apif(`/documents/${id}?userId=${currentUserId()}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setSel((s) => (s?.id === id ? null : s));
      setDetail((s) => (s?.id === id ? null : s));
      setDeleting(null);
    } catch (e) {
      setNotice(apiError(e, 'Delete failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function fromNotes() {
    if (!nTitle.trim() || !nNotes.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const q = new URLSearchParams(Q());
      const d = await apif<Doc>(`/documents/from-notes`, {
        method: 'POST',
        body: JSON.stringify({ userId: q.get('userId'), workspaceId: q.get('workspaceId'), title: nTitle.trim(), notes: nNotes }),
      });
      setNTitle('');
      setNNotes('');
      setDocs((prev) => (prev.some((x) => x.id === d.id) ? prev : [d, ...prev]));
      setSel(d);
    } catch (e) {
      setNotice(apiError(e, 'Could not create the document.'));
    } finally {
      setBusy(false);
    }
  }

  async function analyze(kind: 'summarize' | 'extract') {
    if (!sel || !text.trim() || busy) return;
    setBusy(true);
    try {
      const d = await apif<Doc>(`/documents/${sel.id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ text, userId: currentUserId() }),
      });
      setSel(d);
      setDocs((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    } catch (e) {
      setNotice(apiError(e, 'Analysis failed.'));
    } finally {
      setBusy(false);
    }
  }

  const types = useMemo(() => Array.from(new Set(docs.map(kindOf))).sort(), [docs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = docs.filter(
      (d) =>
        (typeFilter === 'all' || kindOf(d) === typeFilter) &&
        (q === '' || d.title.toLowerCase().includes(q)),
    );
    return list.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title);
      if (sort === 'size') return (b.size ?? -1) - (a.size ?? -1);
      if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [docs, query, typeFilter, sort]);

  const totalBytes = docs.reduce((n, d) => n + (d.size ?? 0), 0);
  const weekCount = docs.filter((d) => Date.now() - new Date(d.createdAt).getTime() < 7 * 864e5).length;
  const filtersOn = query.trim() !== '' || typeFilter !== 'all';

  return (
    <>
      <PageHead
        title="Documents"
        sub="Manage, organize, and access your files in one place."
        action={
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input ref={fileRef} type="file" hidden accept={ACCEPT} multiple onChange={(e) => e.target.files && queueFiles(e.target.files)} />
            <button className="btn primary" style={{ margin: 0 }} onClick={() => fileRef.current?.click()}>Upload document</button>
          </div>
        }
      />

      {notice && <div className="task-alert"><span>{notice}</span><button className="link-btn" onClick={() => setNotice(null)}>Dismiss</button></div>}

      <div className="stats" aria-label="Library overview">
        <Stat n={docs.length} label={docs.length === 1 ? 'Document' : 'Documents'} />
        <Stat n={totalBytes > 0 ? formatBytes(totalBytes) : '—'} label="Storage used" />
        <Stat n={weekCount} label="Added this week" />
      </div>

      {uploads.length > 0 && (
        <div className="card" aria-label="Uploads">
          <b>Uploads</b>
          {uploads.map((u) => (
            <div className="up-row" key={u.key}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b className="up-name">{u.file.name}</b>
                  <span className="muted small">{formatBytes(u.file.size)}</span>
                </div>
                {u.status === 'uploading' && (
                  <div className="up-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.progress ?? undefined}>
                    <div className="up-fill" style={{ width: `${u.progress ?? 100}%` }} />
                  </div>
                )}
                {u.status === 'uploading' && <div className="caption">{u.progress === null ? 'Uploading…' : `${u.progress}%`}</div>}
                {u.status === 'done' && <div className="caption" style={{ color: 'var(--remy-ok)' }}>Uploaded ✓</div>}
                {u.status === 'error' && <div className="up-error">{u.error}</div>}
              </div>
              <div className="row" style={{ flex: 'none' }}>
                {(u.status === 'ready' || u.status === 'error') && <button className="btn small primary" onClick={() => runUpload(u)}>Upload</button>}
                {u.status === 'uploading' && <button className="btn small" onClick={() => cancelUpload(u)}>Cancel</button>}
                {u.status !== 'uploading' && <button className="btn small" onClick={() => dismissUpload(u.key)}>{u.status === 'done' ? 'Clear' : 'Remove'}</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`card doc-toolbar${dragOver ? ' doc-drop' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); queueFiles(e.dataTransfer.files); }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents…" aria-label="Search documents"
            style={{ flex: '1 1 200px', minWidth: 0 }}
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
            <option value="all">All types</option>
            {types.map((t) => <option key={t} value={t}>.{t}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort documents">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
          <div className="row" role="group" aria-label="View" style={{ flexWrap: 'nowrap' }}>
            <button className="btn small" aria-pressed={view === 'list'} onClick={() => setViewMode('list')}>List</button>
            <button className="btn small" aria-pressed={view === 'grid'} onClick={() => setViewMode('grid')}>Grid</button>
          </div>
        </div>
        {dragOver && <p className="doc-drop-hint"><b>Drop files to upload</b> — PDF, Word, TXT, CSV, Excel, PowerPoint, PNG, JPG (25 MB max).</p>}
        {filtersOn && <div className="row" style={{ marginTop: 8 }}><button className="link-btn" onClick={() => { setQuery(''); setTypeFilter('all'); }}>Clear filters</button></div>}
      </div>

      <div className="card" aria-label="Document library">
        {loading && (
          <div aria-label="Loading documents">
            {[0, 1, 2].map((i) => <div key={i} className="doc-skel" />)}
          </div>
        )}
        {!loading && loadError && (
          <Empty>
            <p><b>Could not load documents.</b></p>
            <p className="muted small">{loadError}</p>
            <button className="btn primary" onClick={load}>Retry</button>
          </Empty>
        )}
        {!loading && !loadError && docs.length === 0 && (
          <Empty>
            <div className="doc-empty-ic" aria-hidden>▤</div>
            <p><b>Your document library is ready.</b></p>
            <p className="muted small">Upload contracts, notes, spreadsheets, and reports — Remy keeps them organized and searchable.</p>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>Upload document</button>
            <p className="muted small">…or drag &amp; drop files onto the toolbar above.</p>
          </Empty>
        )}
        {!loading && !loadError && docs.length > 0 && visible.length === 0 && (
          <Empty>
            <p><b>No documents match your filters.</b></p>
            <button className="btn" onClick={() => { setQuery(''); setTypeFilter('all'); }}>Clear filters</button>
          </Empty>
        )}
        {!loading && !loadError && visible.length > 0 && view === 'list' && (
          <div className="doc-list" role="table" aria-label="Documents">
            <div className="doc-row doc-head" role="row">
              <span role="columnheader">Name</span><span role="columnheader">Size</span><span role="columnheader">Uploaded</span><span role="columnheader"><span className="doc-sr">Actions</span></span>
            </div>
            {visible.map((d) => (
              <div className="doc-row" role="row" key={d.id}>
                <span role="cell">
                  <span className="doc-ic" data-kind={kindOf(d)} aria-hidden>{kindOf(d).slice(0, 3).toUpperCase()}</span>{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setDetail(d); }}><b>{d.title}</b></a>{' '}
                  <span className="badge b-quiet">.{kindOf(d)}</span>
                </span>
                <span role="cell" className="muted small">{formatBytes(d.size)}</span>
                <span role="cell" className="muted small">{fmtDate(d.createdAt)}</span>
                <span role="cell" className="doc-actions">
                  <button className="btn small" onClick={() => setMenuId(menuId === d.id ? null : d.id)} aria-expanded={menuId === d.id} aria-label={`Actions for ${d.title}`}>•••</button>
                  {menuId === d.id && (
                    <span className="doc-menu" role="menu">
                      {previewable(d) && <button role="menuitem" onClick={() => { setMenuId(null); downloadDoc(d, true); }}>Open</button>}
                      <button role="menuitem" onClick={() => { setMenuId(null); downloadDoc(d, false); }}>Download</button>
                      <button role="menuitem" onClick={() => { setMenuId(null); setRenaming({ id: d.id, title: d.title }); }}>Rename</button>
                      <button role="menuitem" onClick={() => { setMenuId(null); setDetail(d); }}>Details</button>
                      <button role="menuitem" className="danger" onClick={() => { setMenuId(null); setDeleting(d.id); }}>Delete</button>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {!loading && !loadError && visible.length > 0 && view === 'grid' && (
          <div className="doc-grid">
            {visible.map((d) => (
              <div className="doc-card" key={d.id}>
                <span className="doc-ic doc-ic-lg" data-kind={kindOf(d)} aria-hidden>{kindOf(d).slice(0, 3).toUpperCase()}</span>
                <b className="doc-card-title">{d.title}</b>
                <span className="muted small">{formatBytes(d.size)} · {fmtDate(d.createdAt)}</span>
                <div className="row">
                  {previewable(d) && <button className="btn small" onClick={() => downloadDoc(d, true)}>Open</button>}
                  <button className="btn small" onClick={() => downloadDoc(d, false)}>Download</button>
                  <button className="btn small" onClick={() => setDetail(d)}>Details</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {renaming && (
        <div className="confirm-scrim" onClick={() => setRenaming(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rename document">
            <h2>Rename document</h2>
            <p><input value={renaming.title} onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} style={{ width: '100%' }} aria-label="Document title" /></p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setRenaming(null)}>Cancel</button>
              <button className="btn primary" onClick={saveRename} disabled={busy || !renaming.title.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="confirm-scrim" onClick={() => setDeleting(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Delete document">
            <h2>Delete this document?</h2>
            <p>This removes the file and its record. This cannot be undone.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleting(null)}>Keep</button>
              <button className="btn danger" onClick={() => confirmDelete(deleting)} disabled={busy}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="confirm-scrim" onClick={() => setDetail(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Document details">
            <h2>{detail.title}</h2>
            <p className="muted small">.{kindOf(detail)} · {formatBytes(detail.size)} · Uploaded {fmtDate(detail.createdAt)}</p>
            {detail.summary && <p><b>Summary:</b> {detail.summary}</p>}
            {detail.extracted?.keyPoints && <p><b>Key points:</b> {detail.extracted.keyPoints.join(' · ')}</p>}
            <div className="row">
              {previewable(detail) && <button className="btn small" onClick={() => downloadDoc(detail, true)}>Open</button>}
              <button className="btn small" onClick={() => downloadDoc(detail, false)}>Download</button>
              <button className="btn small" onClick={() => { setDetail(null); setRenaming({ id: detail.id, title: detail.title }); }}>Rename</button>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <b>Notes → polished doc</b>
          <p><input value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="Title" style={{ width: '100%' }} /></p>
          <p><textarea value={nNotes} onChange={(e) => setNNotes(e.target.value)} placeholder="Paste rough notes…" rows={4} style={{ width: '100%' }} /></p>
          <button className="btn primary" onClick={fromNotes} disabled={busy || !nTitle.trim() || !nNotes.trim()}>Create doc</button>
        </div>
        <div className="card">
          <b>{sel ? `Analyze: ${sel.title}` : 'Analyze'}</b>
          {!sel && <p className="muted">Select a document from the library first.</p>}
          {sel && <>
            {sel.summary && <p><b>Summary:</b> {sel.summary}</p>}
            {sel.extracted?.keyPoints && <p><b>Key points:</b> {sel.extracted.keyPoints.join(' · ')}</p>}
            <p><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text to analyze…" rows={4} style={{ width: '100%' }} /></p>
            <div className="row">
              <button className="btn" onClick={() => analyze('summarize')} disabled={busy || !text.trim()}>Summarize</button>
              <button className="btn" onClick={() => analyze('extract')} disabled={busy || !text.trim()}>Extract key points</button>
            </div>
          </>}
        </div>
      </div>
    </>
  );
}
