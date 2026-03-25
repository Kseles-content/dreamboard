import { useEffect, useMemo, useState } from 'react';

const DEFAULT_API = 'http://localhost:3000';

export default function Home() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API);
  const [token, setToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [email, setEmail] = useState('demo@example.com');
  const [name, setName] = useState('Demo');

  const [boards, setBoards] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    setCards([]);
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

  async function openBoard(id) {
    setActiveBoardId(id);
    setLoading(true); setError('');
    try {
      const data = await api(`/v1/boards/${id}/cards`);
      setCards(data.items || []);
    } catch (e2) { setError(String(e2.message || e2)); }
    finally { setLoading(false); }
  }

  async function addCard() {
    const text = prompt('Card text');
    if (!text || !activeBoardId) return;
    setLoading(true); setError('');
    try {
      const data = await api(`/v1/boards/${activeBoardId}/cards`, { method: 'POST', body: JSON.stringify({ text }) });
      setCards(data.items || []);
    } catch (e2) { setError(String(e2.message || e2)); }
    finally { setLoading(false); }
  }

  async function editCard(card) {
    const text = prompt('Edit card text', card.text);
    if (!text || !activeBoardId) return;
    setLoading(true); setError('');
    try {
      const data = await api(`/v1/boards/${activeBoardId}/cards/${card.id}`, { method: 'PATCH', body: JSON.stringify({ text }) });
      setCards(data.items || []);
    } catch (e2) { setError(String(e2.message || e2)); }
    finally { setLoading(false); }
  }

  async function deleteCard(card) {
    if (!confirm('Delete card?') || !activeBoardId) return;
    setLoading(true); setError('');
    try {
      const data = await api(`/v1/boards/${activeBoardId}/cards/${card.id}`, { method: 'DELETE' });
      setCards(data.items || []);
    } catch (e2) { setError(String(e2.message || e2)); }
    finally { setLoading(false); }
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
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={loadBoards}>Reload boards</button>
      <button onClick={createBoard}>Create board</button>
      <button onClick={logout}>Logout</button>
    </div>
    {loading && <p>Loading...</p>}
    {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

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
