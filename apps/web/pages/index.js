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

const DEFAULT_API = 'http://localhost:3000';
const HISTORY_KEY_PREFIX = 'db_web_history_';

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

  const savingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const autosaveRef = useRef(null);

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
        msg = j.message || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
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
      await loadBoards(auth.accessToken);
    } catch (e2) {
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
      await loadBoards();
    } catch (e2) { setError(String(e2.message || e2)); }
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
        const data = await api(`/v1/boards/${activeBoardId}/cards`, {
          method: 'POST',
          body: JSON.stringify({ text: card.text }),
        });
        const created = data.created;
        workingCards = workingCards.map((c) => (c.id === card.id ? created : c));
      }

      for (const card of updates) {
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
  }, [activeBoardId, api, history.present, savedCards]);

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
    } catch (e2) { setError(String(e2.message || e2)); }
    finally { setLoading(false); }
  }

  function addCard() {
    const text = prompt('Card text');
    if (!text || !activeBoardId) return;
    applyLocalCards([...cards, { id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text }]);
  }

  function editCard(card) {
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
    <h1>DreamBoard Web Editor v1 (text cards)</h1>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button onClick={loadBoards}>Reload boards</button>
      <button onClick={createBoard}>Create board</button>
      <button onClick={logout}>Logout</button>
      <button onClick={undo} disabled={!canUndo || !activeBoardId}>Undo</button>
      <button onClick={redo} disabled={!canRedo || !activeBoardId}>Redo</button>
      <button onClick={retrySave} disabled={!dirty || !activeBoardId}>Save now</button>
    </div>
    {loading && <p>Loading...</p>}
    {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

    {activeBoardId && <p>
      Save status:{' '}
      {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
      {saveError ? <span style={{ color: 'crimson' }}> — Save failed: {saveError} <button onClick={retrySave}>Retry</button></span> : null}
    </p>}

    <section>
      <h2>Boards list</h2>
      {boards.length === 0 ? <p>Empty: no boards</p> :
        <ul>{boards.map((b) => <li key={b.id}><button onClick={() => openBoard(b.id)}>Open</button> {b.title}</li>)}</ul>}
    </section>

    <section>
      <h2>Open board: {activeBoardId || 'none'}</h2>
      {activeBoardId && <button onClick={addCard}>Add text card</button>}
      {!activeBoardId ? <p>Select board first</p> : cards.length === 0 ? <p>Empty: no cards</p> :
        <ul>{cards.map((c) => <li key={c.id}>{c.text} <button onClick={() => editCard(c)}>Edit</button> <button onClick={() => deleteCard(c)}>Delete</button></li>)}</ul>}
    </section>
  </main>;
}
