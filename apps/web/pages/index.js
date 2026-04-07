import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cloneCards,
  createHistory,
  deserializeHistory,
  pushHistory,
  redoHistory,
  serializeHistory,
  undoHistory,
} from '../lib/history';
import { AUTOSAVE_DEBOUNCE_MS, createDebouncedAutosave, diffCards } from '../lib/autosave';
import { captureError, trackEvent } from '../lib/observability';

const DEFAULT_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const HISTORY_KEY_PREFIX = 'db_web_history_';
const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function Home() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API);
  const [token, setToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [email, setEmail] = useState('demo@example.com');
  const [name, setName] = useState('Demo');

  const [boards, setBoards] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [history, setHistory] = useState(createHistory([]));
  const [savedCards, setSavedCards] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsCursor, setVersionsCursor] = useState(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const savingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const autosaveRef = useRef(null);
  const uploadInputRef = useRef(null);

  const cards = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => {
    const saved = localStorage.getItem('db_web_auth');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setToken(parsed.token || '');
      setRefreshToken(parsed.refreshToken || '');
      setBaseUrl(parsed.baseUrl || DEFAULT_API);
    } catch {}
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem('db_web_auth', JSON.stringify({ token, refreshToken, baseUrl }));
    }
  }, [token, refreshToken, baseUrl]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!activeBoardId) return;
    localStorage.setItem(`${HISTORY_KEY_PREFIX}${activeBoardId}`, serializeHistory(history));
  }, [activeBoardId, history]);

  const authed = useMemo(() => Boolean(token), [token]);

  async function api(path, opts = {}) {
    const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
    if (opts.auth !== false && token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { ...opts, headers });
    if (!res.ok) {
      if (res.status === 401) {
        setToken('');
        setRefreshToken('');
      }
      let msg = `HTTP_${res.status}`;
      try {
        const j = await res.json();
        msg = j.code ? `${j.code}: ${j.message || ''}` : (j.message || msg);
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function uploadBinary(url, file, headers = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, String(v)));

      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(true);
        else reject(new Error(`UPLOAD_HTTP_${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('UPLOAD_NETWORK_ERROR'));
      xhr.send(file);
    });
  }

  async function login(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const auth = await api('/v1/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email, name }),
      });
      setToken(auth.accessToken);
      setRefreshToken(auth.refreshToken);
      await trackEvent('login', { email });
      await loadBoards(auth.accessToken);
    } catch (e2) {
      await captureError(e2, { action: 'login' });
      setError(String(e2.message || e2));
    } finally { setLoading(false); }
  }

  async function logout() {
    try {
      if (refreshToken) {
        await api('/v1/auth/logout', {
          method: 'POST',
          auth: false,
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {}
    setToken('');
    setRefreshToken('');
    setBoards([]);
    setActiveBoardId(null);
    setHistory(createHistory([]));
    setSavedCards([]);
    setDirty(false);
    localStorage.removeItem('db_web_auth');
  }

  async function loadBoards(tempToken) {
    setLoading(true); setError('');
    try {
      const authHeaderToken = tempToken || token;
      const res = await fetch(`${baseUrl}/v1/boards?limit=50`, {
        headers: { authorization: `Bearer ${authHeaderToken}` },
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const data = await res.json();
      setBoards(data.items || []);
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally { setLoading(false); }
  }

  async function createBoard() {
    const title = prompt('Board title');
    if (!title) return;
    setLoading(true); setError('');
    try {
      await api('/v1/boards', { method: 'POST', body: JSON.stringify({ title }) });
      await trackEvent('create_board', { titleLength: title.length });
      await loadBoards();
    } catch (e2) {
      await captureError(e2, { action: 'create_board' });
      setError(String(e2.message || e2));
    }
    finally { setLoading(false); }
  }

  const applyLocalCards = useCallback((nextCards) => {
    setHistory((prev) => pushHistory(prev, nextCards));
    setDirty(true);
    setSaveError('');
    autosaveRef.current?.schedule();
  }, []);

  const persistCards = useCallback(async () => {
    if (!activeBoardId) return;
    if (savingRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    const currentCards = cloneCards(history.present);
    const baseCards = cloneCards(savedCards);
    const { creates, updates, deletes } = diffCards(baseCards, currentCards);

    if (creates.length === 0 && updates.length === 0 && deletes.length === 0) {
      setDirty(false);
      return;
    }

    savingRef.current = true;
    setSaving(true);

    try {
      let workingCards = cloneCards(currentCards);

      for (const card of creates) {
        const payload = card.type === 'image'
          ? { type: 'image', objectKey: card.objectKey }
          : { type: 'text', text: card.text };
        const data = await api(`/v1/boards/${activeBoardId}/cards`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const created = data.created;
        await trackEvent('create_card', { boardId: activeBoardId, type: created.type || card.type || 'text' });
        workingCards = workingCards.map((c) => (c.id === card.id ? created : c));
      }

      for (const card of updates) {
        if (card.type === 'image') continue;
        if (String(card.id).startsWith('tmp_')) continue;
        await api(`/v1/boards/${activeBoardId}/cards/${card.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ text: card.text }),
        });
      }

      for (const card of deletes) {
        if (String(card.id).startsWith('tmp_')) continue;
        await api(`/v1/boards/${activeBoardId}/cards/${card.id}`, { method: 'DELETE' });
      }

      setSavedCards(workingCards);
      setHistory((prev) => ({ ...prev, present: workingCards }));
      setDirty(false);
      setSaveError('');
    } catch (e2) {
      await captureError(e2, { action: 'persist_cards', boardId: activeBoardId });
      setSaveError(String(e2.message || e2));
      setDirty(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        autosaveRef.current?.schedule();
      }
    }
  }, [activeBoardId, history.present, savedCards]);

  useEffect(() => {
    autosaveRef.current?.cancel?.();
    autosaveRef.current = createDebouncedAutosave(() => {
      persistCards();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => autosaveRef.current?.cancel?.();
  }, [persistCards]);

  async function openBoard(id) {
    if (dirty && !confirm('Есть несохранённые изменения. Открыть другую доску?')) return;
    setActiveBoardId(id);
    setLoading(true); setError('');
    try {
      const data = await api(`/v1/boards/${id}/cards`);
      const remoteCards = data.items || [];
      setSavedCards(remoteCards);

      const raw = localStorage.getItem(`${HISTORY_KEY_PREFIX}${id}`);
      const parsed = raw ? deserializeHistory(raw) : null;
      if (parsed) {
        setHistory(parsed);
        setDirty(true);
      } else {
        setHistory(createHistory(remoteCards));
        setDirty(false);
      }
      setSaveError('');
      setUploadError('');
      setVersions([]);
      setVersionsCursor(null);
      setShareLinks([]);
    } catch (e2) { setError(String(e2.message || e2)); }
    finally { setLoading(false); }
  }

  function addCard() {
    const text = prompt('Card text');
    if (!text || !activeBoardId) return;
    applyLocalCards([...cards, { id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: 'text', text }]);
  }

  function editCard(card) {
    if (card.type === 'image') return;
    const text = prompt('Edit card text', card.text);
    if (text === null || !activeBoardId) return;
    applyLocalCards(cards.map((c) => (c.id === card.id ? { ...c, text } : c)));
  }

  function deleteCard(card) {
    if (!confirm('Delete card?') || !activeBoardId) return;
    applyLocalCards(cards.filter((c) => c.id !== card.id));
  }

  function undo() {
    setHistory((prev) => undoHistory(prev));
    setDirty(true);
    autosaveRef.current?.schedule();
  }

  function redo() {
    setHistory((prev) => redoHistory(prev));
    setDirty(true);
    autosaveRef.current?.schedule();
  }

  function retrySave() {
    autosaveRef.current?.flushNow();
  }

  async function loadVersions({ reset = false } = {}) {
    if (!activeBoardId) return;
    setVersionsLoading(true);
    setError('');
    try {
      const cursor = reset ? null : versionsCursor;
      const q = cursor ? `?limit=5&cursor=${cursor}` : '?limit=5';
      const data = await api(`/v1/boards/${activeBoardId}/versions${q}`);
      setVersions((prev) => (reset ? (data.items || []) : [...prev, ...(data.items || [])]));
      setVersionsCursor(data.nextCursor || null);
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally {
      setVersionsLoading(false);
    }
  }

  async function createVersion() {
    if (!activeBoardId) return;
    setVersionsLoading(true);
    setError('');
    try {
      await api(`/v1/boards/${activeBoardId}/versions`, { method: 'POST' });
      await loadVersions({ reset: true });
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restoreVersion(versionId) {
    if (!activeBoardId) return;
    if (!confirm('Restore this version? Current state will be replaced.')) return;
    setVersionsLoading(true);
    setError('');
    try {
      await api(`/v1/boards/${activeBoardId}/versions/${versionId}/restore`, { method: 'POST' });
      const cardsData = await api(`/v1/boards/${activeBoardId}/cards`);
      const remoteCards = cardsData.items || [];
      setSavedCards(remoteCards);
      setHistory(createHistory(remoteCards));
      setDirty(false);
      await loadBoards();
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally {
      setVersionsLoading(false);
    }
  }

  async function loadShareLinks() {
    if (!activeBoardId) return;
    setShareLoading(true);
    setError('');
    try {
      const data = await api(`/v1/boards/${activeBoardId}/share-links`);
      setShareLinks(data.items || []);
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally {
      setShareLoading(false);
    }
  }

  async function createShareLink() {
    if (!activeBoardId) return;
    setShareLoading(true);
    setError('');
    try {
      await api(`/v1/boards/${activeBoardId}/share-links`, { method: 'POST' });
      await trackEvent('create_share_link', { boardId: activeBoardId });
      await loadShareLinks();
    } catch (e2) {
      await captureError(e2, { action: 'create_share_link', boardId: activeBoardId });
      setError(String(e2.message || e2));
    } finally {
      setShareLoading(false);
    }
  }

  async function revokeShareLink(linkId) {
    if (!activeBoardId) return;
    if (!confirm('Revoke this share link?')) return;
    setShareLoading(true);
    setError('');
    try {
      await api(`/v1/boards/${activeBoardId}/share-links/${linkId}`, { method: 'DELETE' });
      await loadShareLinks();
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally {
      setShareLoading(false);
    }
  }

  async function copyShareUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      alert('Share URL copied');
    } catch {
      prompt('Copy share URL', url);
    }
  }

  async function renderBoardToCanvas(format = 'png') {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('EXPORT_CONTEXT_ERROR');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 28px sans-serif';
    const boardTitle = boards.find((b) => b.id === activeBoardId)?.title || `Board ${activeBoardId}`;
    ctx.fillText(boardTitle, 32, 48);

    let y = 90;
    for (const card of cards) {
      if (y > 820) break;
      if (card.type === 'image' && card.imageUrl) {
        try {
          const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.crossOrigin = 'anonymous';
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = card.imageUrl;
          });
          ctx.drawImage(img, 32, y, 220, 140);
          ctx.strokeStyle = '#d1d5db';
          ctx.strokeRect(32, y, 220, 140);
          y += 160;
        } catch {
          ctx.fillStyle = '#b91c1c';
          ctx.fillText('[image unavailable]', 32, y + 20);
          y += 40;
        }
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.font = '20px sans-serif';
        ctx.fillText(card.text || '', 32, y + 20);
        y += 44;
      }
    }

    return canvas.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
  }

  async function exportBoard(format = 'png') {
    if (!activeBoardId) return;
    setExporting(true);
    try {
      const dataUrl = await renderBoardToCanvas(format);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `dreamboard-${activeBoardId}.${format === 'jpg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      await trackEvent('export_board', { format, boardId: activeBoardId });
    } catch (e) {
      await captureError(e, { action: 'export_board', format, boardId: activeBoardId });
      setError(String(e.message || e));
    } finally {
      setExporting(false);
    }
  }

  function triggerTestError() {
    const err = new Error('SENTRY_TEST_ERROR_WEEK11');
    captureError(err, { trigger: 'manual_test_button' });
    alert('Test error sent to Sentry (if DSN configured).');
  }

  function askImageUpload() {
    uploadInputRef.current?.click();
  }

  async function onImagePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeBoardId) return;

    setUploadError('');

    if (file.size > MAX_ASSET_SIZE_BYTES) {
      setUploadError('ASSET_TOO_LARGE: max 10MB');
      return;
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      setUploadError('UNSUPPORTED_ASSET_TYPE: only jpeg/png/webp');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const intent = await api(`/v1/boards/${activeBoardId}/uploads/intents`, {
        method: 'POST',
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size, fileName: file.name }),
      });

      await uploadBinary(intent.uploadUrl, file, intent.headers || { 'content-type': file.type });

      const finalized = await api(`/v1/boards/${activeBoardId}/uploads/finalize`, {
        method: 'POST',
        body: JSON.stringify({ objectKey: intent.objectKey }),
      });
      await trackEvent('upload_image', { boardId: activeBoardId, mimeType: file.type, sizeBytes: file.size });

      applyLocalCards([
        ...cards,
        {
          id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'image',
          objectKey: finalized.objectKey,
          imageUrl: finalized.publicUrl || intent.publicUrl,
        },
      ]);
      setUploadProgress(100);
    } catch (e2) {
      await captureError(e2, { action: 'upload_image', boardId: activeBoardId });
      setUploadError(String(e2.message || e2));
    } finally {
      setUploading(false);
    }
  }

  if (!authed) {
    return <main style={{ padding: 20 }}>
      <h1>DreamBoard Web Login</h1>
      <form onSubmit={login} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="API Base URL" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <button disabled={loading}>{loading ? 'Loading...' : 'Login'}</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>;
  }

  return <main style={{ padding: 20, display: 'grid', gap: 16 }}>
    <h1>DreamBoard Web Editor v1 (text + image cards)</h1>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button onClick={loadBoards}>Reload boards</button>
      <button onClick={createBoard}>Create board</button>
      <button onClick={logout}>Logout</button>
      <button onClick={undo} disabled={!canUndo || !activeBoardId}>Undo</button>
      <button onClick={redo} disabled={!canRedo || !activeBoardId}>Redo</button>
      <button onClick={retrySave} disabled={!dirty || !activeBoardId}>Save now</button>
      <button onClick={askImageUpload} disabled={!activeBoardId || uploading}>Upload image</button>
      <button onClick={() => exportBoard('png')} disabled={!activeBoardId || exporting}>Export PNG</button>
      <button onClick={() => exportBoard('jpg')} disabled={!activeBoardId || exporting}>Export JPG</button>
      <button onClick={triggerTestError}>Test Sentry Error</button>
      <button onClick={() => {
        const next = !versionsOpen;
        setVersionsOpen(next);
        if (next && activeBoardId) loadVersions({ reset: true });
      }} disabled={!activeBoardId}>Versions</button>
      <button onClick={() => {
        const next = !shareOpen;
        setShareOpen(next);
        if (next && activeBoardId) loadShareLinks();
      }} disabled={!activeBoardId}>Share</button>
      <input ref={uploadInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onImagePicked} />
    </div>
    {loading && <p>Loading...</p>}
    {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

    {activeBoardId && <p>
      Save status:{' '}
      {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
      {saveError ? <span style={{ color: 'crimson' }}> — Save failed: {saveError} <button onClick={retrySave}>Retry</button></span> : null}
    </p>}

    {activeBoardId && uploading ? <p>Upload progress: {uploadProgress}%</p> : null}
    {activeBoardId && uploadError ? <p style={{ color: 'crimson' }}>Upload error: {uploadError}</p> : null}

    {versionsOpen && activeBoardId ? <section>
      <h2>Versions</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={createVersion} disabled={versionsLoading}>Create snapshot</button>
        <button onClick={() => loadVersions({ reset: true })} disabled={versionsLoading}>Reload versions</button>
      </div>
      {versions.length === 0 ? <p>No versions yet</p> : <ul>
        {versions.map((v) => <li key={v.id}>
          #{v.id} — {new Date(v.createdAt).toLocaleString()} {' '}
          <button onClick={() => restoreVersion(v.id)} disabled={versionsLoading}>Restore</button>
        </li>)}
      </ul>}
      {versionsCursor ? <button onClick={() => loadVersions()} disabled={versionsLoading}>Load more</button> : null}
    </section> : null}

    {shareOpen && activeBoardId ? <section>
      <h2>Share links</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={createShareLink} disabled={shareLoading}>Create share link</button>
        <button onClick={loadShareLinks} disabled={shareLoading}>Reload links</button>
      </div>
      {shareLinks.length === 0 ? <p>No share links</p> : <ul>
        {shareLinks.map((s) => <li key={s.id}>
          #{s.id} {s.revokedAt ? '(revoked)' : '(active)'} {' '}
          <button onClick={() => copyShareUrl(s.url)}>Copy URL</button>{' '}
          {!s.revokedAt ? <button onClick={() => revokeShareLink(s.id)} disabled={shareLoading}>Revoke</button> : null}
          <div style={{ fontSize: 12 }}>{s.url}</div>
        </li>)}
      </ul>}
    </section> : null}

    <section>
      <h2>Boards list</h2>
      {boards.length === 0 ? <p>Empty: no boards</p> :
        <ul>{boards.map((b) => <li key={b.id}><button onClick={() => openBoard(b.id)}>Open</button> {b.title}</li>)}</ul>}
    </section>

    <section>
      <h2>Open board: {activeBoardId || 'none'}</h2>
      {activeBoardId && <button onClick={addCard}>Add text card</button>}
      {!activeBoardId ? <p>Select board first</p> : cards.length === 0 ? <p>Empty: no cards</p> :
        <ul>{cards.map((c) => <li key={c.id} style={{ marginBottom: 10 }}>
          {c.type === 'image'
            ? <div>
              <div><b>Image card</b></div>
              <img src={c.imageUrl} alt="uploaded" style={{ maxWidth: 260, maxHeight: 180, display: 'block', border: '1px solid #ddd' }} />
            </div>
            : <span>{c.text}</span>}
          {' '}
          {c.type !== 'image' ? <button onClick={() => editCard(c)}>Edit</button> : null}
          <button onClick={() => deleteCard(c)}>Delete</button>
        </li>)}</ul>}
    </section>
  </main>;
}
