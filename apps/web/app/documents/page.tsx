'use client';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { currentUserId, currentWorkspace } from '../../components/WorkspaceBar';
import { onWorkspaceChange } from '../../lib/workspace';

interface Doc { id: string; title: string; type: string; summary: string | null; extracted: { keyPoints?: string[] } | null }

export default function DocsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sel, setSel] = useState<Doc | null>(null);
  const [text, setText] = useState('');
  const [nTitle, setNTitle] = useState('');
  const [nNotes, setNNotes] = useState('');
  const [msg, setMsg] = useState('');

  const Q = () => `workspaceId=${currentWorkspace()}&userId=${currentUserId()}`;
  const auth = { credentials: 'include' as const, headers: { 'Content-Type': 'application/json' } };

  async function load() {
    setDocs(await fetch(`${API}/documents?${Q()}`, { credentials: 'include' }).then((r) => r.json()));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => onWorkspaceChange(load), []);

  async function fromNotes() {
    if (!nTitle.trim() || !nNotes.trim()) return;
    const q = new URLSearchParams(Q());
    const d = await fetch(`${API}/documents/from-notes`, { ...auth, method: 'POST',
      body: JSON.stringify({ userId: q.get('userId'), workspaceId: q.get('workspaceId'), title: nTitle, notes: nNotes }) }).then((r) => r.json());
    setNTitle(''); setNNotes('');
    setSel(d);
    load();
  }

  async function analyze(kind: 'summarize' | 'extract') {
    if (!sel || !text.trim()) return;
    const d = await fetch(`${API}/documents/${sel.id}/${kind}`, { ...auth, method: 'POST',
      body: JSON.stringify({ text }) }).then((r) => r.json());
    setSel(d);
  }

  async function upload(file: File) {
    setMsg('Requesting upload URL…');
    const pres = await fetch(`${API}/documents/upload-url`, { ...auth, method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }) }).then((r) => r.json());
    setMsg('Uploading to R2…');
    await fetch(pres.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    const q = new URLSearchParams(Q());
    const d = await fetch(`${API}/documents`, { ...auth, method: 'POST',
      body: JSON.stringify({ userId: q.get('userId'), workspaceId: q.get('workspaceId'), title: file.name, type: 'upload', storageKey: pres.key }) }).then((r) => r.json());
    setMsg(`Uploaded: ${d.title}`);
    load();
  }

  return (
    <>
      <div className="card">
        <div className="row"><b>Documents</b>
          <label className="btn">Upload file<input type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          {msg && <span className="muted">{msg}</span>}
        </div>
        {docs.map((d) => (
          <p key={d.id}>• <a href="#" onClick={(e) => { e.preventDefault(); setSel(d); setText(''); }}><b>{d.title}</b></a> <span className="muted">[{d.type}]</span></p>
        ))}
        {docs.length === 0 && <p className="muted">No documents yet.</p>}
      </div>
      <div className="grid2">
        <div className="card">
          <b>Notes → polished doc</b>
          <p><input value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="Title" style={{ width: '100%' }} /></p>
          <p><textarea value={nNotes} onChange={(e) => setNNotes(e.target.value)} placeholder="Paste rough notes…" rows={4} style={{ width: '100%' }} /></p>
          <button className="btn primary" onClick={fromNotes}>Create doc</button>
        </div>
        <div className="card">
          <b>{sel ? `Analyze: ${sel.title}` : 'Analyze'}</b>
          {!sel && <p className="muted">Select a document above first.</p>}
          {sel && <>
            {sel.summary && <p><b>Summary:</b> {sel.summary}</p>}
            {sel.extracted?.keyPoints && <p><b>Key points:</b> {sel.extracted.keyPoints.join(' · ')}</p>}
            <p><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text to analyze…" rows={4} style={{ width: '100%' }} /></p>
            <div className="row">
              <button className="btn" onClick={() => analyze('summarize')}>Summarize</button>
              <button className="btn" onClick={() => analyze('extract')}>Extract key points</button>
            </div>
          </>}
        </div>
      </div>
    </>
  );
}
