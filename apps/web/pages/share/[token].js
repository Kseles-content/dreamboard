import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const DEFAULT_API = 'http://localhost:3000';

export default function ShareView() {
  const router = useRouter();
  const { token } = router.query;

  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [board, setBoard] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('db_web_auth');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.baseUrl) setApiBase(parsed.baseUrl);
    } catch {}
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${apiBase}/v1/share/${token}`);
        if (!res.ok) {
          let msg = `HTTP_${res.status}`;
          try {
            const j = await res.json();
            msg = j.code ? `${j.code}: ${j.message || ''}` : (j.message || msg);
          } catch {}
          throw new Error(msg);
        }

        const data = await res.json();
        if (!cancelled) setBoard(data.board || null);
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, apiBase]);

  return <main style={{ padding: 20 }}>
    <h1>DreamBoard Public View</h1>
    <p style={{ opacity: 0.75 }}>View-only page. Editing is disabled.</p>

    {loading ? <p>Loading…</p> : null}
    {error ? <p style={{ color: 'crimson' }}>Error: {error}</p> : null}

    {!loading && !error && board ? <section>
      <h2>{board.title}</h2>
      {board.description ? <p>{board.description}</p> : null}

      <h3>Cards</h3>
      {Array.isArray(board.cards) && board.cards.length > 0 ? (
        <ul>
          {board.cards.map((c) => <li key={c.id} style={{ marginBottom: 10 }}>
            {c.type === 'image'
              ? <div>
                <div><b>Image card</b></div>
                <img src={c.imageUrl} alt="shared" style={{ maxWidth: 320, maxHeight: 220, border: '1px solid #ddd' }} />
              </div>
              : <span>{c.text}</span>}
          </li>)}
        </ul>
      ) : <p>No cards</p>}
    </section> : null}
  </main>;
}
