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
import { Api as DreamboardApi, ContentType } from '../src/lib/api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import Modal from '../components/ui/Modal';
import { Toast, useToast } from '../components/ui/Toast';

const DEFAULT_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function normalizeApiBaseUrl(url) {
  if (!url) return DEFAULT_API;
  try {
    const parsed = new URL(url);
    const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocalHost = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (isLocalHost && pageHost && !['localhost', '127.0.0.1'].includes(pageHost)) {
      parsed.hostname = pageHost;
      parsed.port = '3000';
      return parsed.toString().replace(/\/$/, '');
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_API;
  }
}
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
  const [currentUser, setCurrentUser] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [emptyBoardTitle, setEmptyBoardTitle] = useState('');
  const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterPinnedOnly, setFilterPinnedOnly] = useState(false);
  const [filterUpdated7Days, setFilterUpdated7Days] = useState(false);
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
  const onboardingStartedTrackedRef = useRef(false);
  const { toast, showToast, clearToast } = useToast();

  const cards = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => {
    const saved = localStorage.getItem('db_web_auth');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const normalizedBaseUrl = normalizeApiBaseUrl(parsed.baseUrl || DEFAULT_API);
      setToken(parsed.token || '');
      setRefreshToken(parsed.refreshToken || '');
      setBaseUrl(normalizedBaseUrl);
      setCurrentUser(parsed.user || null);

      if (normalizedBaseUrl !== (parsed.baseUrl || DEFAULT_API)) {
        localStorage.setItem('db_web_auth', JSON.stringify({
          token: parsed.token || '',
          refreshToken: parsed.refreshToken || '',
          baseUrl: normalizedBaseUrl,
          user: parsed.user || null,
        }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem('db_web_auth', JSON.stringify({ token, refreshToken, baseUrl, user: currentUser }));
    }
  }, [token, refreshToken, baseUrl, currentUser]);

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

  useEffect(() => {
    if (error) showToast(`Ошибка API: ${error}`, 'error');
  }, [error, showToast]);

  useEffect(() => {
    if (uploadError) showToast(`Ошибка загрузки: ${uploadError}`, 'warning');
  }, [uploadError, showToast]);

  const authed = useMemo(() => Boolean(token), [token]);
  const resumeBoard = useMemo(() => {
    const withLastOpened = boards.filter((b) => Boolean(b.lastOpenedAt));
    if (withLastOpened.length === 0) return null;
    return withLastOpened.sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime())[0];
  }, [boards]);

  useEffect(() => {
    if (!authed) return;
    loadTemplates();
  }, [authed]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!authed) return;
    loadBoards();
  }, [authed, debouncedSearch, filterPinnedOnly, filterUpdated7Days]);
  const typedApi = useMemo(() => new DreamboardApi({
    baseUrl,
    baseApiParams: {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    },
  }), [baseUrl, token]);

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
      const { data: auth } = await typedApi.v1.authLoginCreate(
        { email, name },
        { type: ContentType.Json },
      );
      setToken(auth.accessToken);
      setRefreshToken(auth.refreshToken || '');
      setCurrentUser(auth.user || null);
      await trackEvent('login', { email });
      await loadBoards(auth.accessToken);
      if (!auth.user?.onboardedAt) {
        await loadTemplates();
        if (!onboardingStartedTrackedRef.current) {
          onboardingStartedTrackedRef.current = true;
          await trackEvent('onboarding_started', { source: 'login' });
        }
        setShowOnboarding(true);
      }
    } catch (e2) {
      await captureError(e2, { action: 'login' });
      setError(String(e2.message || e2));
    } finally { setLoading(false); }
  }

  async function logout() {
    try {
      if (refreshToken) {
        await typedApi.v1.authLogoutCreate();
      }
    } catch {}
    setToken('');
    setRefreshToken('');
    setBoards([]);
    setActiveBoardId(null);
    setHistory(createHistory([]));
    setCurrentUser(null);
    setTemplates([]);
    setShowOnboarding(false);
    onboardingStartedTrackedRef.current = false;
    setSavedCards([]);
    setDirty(false);
    localStorage.removeItem('db_web_auth');
  }

  async function loadBoards(tempToken) {
    setLoading(true); setError('');
    try {
      const authHeaderToken = tempToken || token;
      const client = authHeaderToken
        ? new DreamboardApi({
            baseUrl,
            baseApiParams: { headers: { authorization: `Bearer ${authHeaderToken}` } },
          })
        : typedApi;

      const query = {
        limit: 50,
        ...(debouncedSearch.trim() ? { query: debouncedSearch.trim() } : {}),
        ...(filterPinnedOnly ? { pinned: true } : {}),
        ...(filterUpdated7Days ? { updatedSince: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() } : {}),
      };

      const res = await client.request({
        path: '/v1/boards',
        method: 'GET',
        query,
        format: 'json',
      });
      setBoards(res.data || []);
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally { setLoading(false); }
  }

  async function loadTemplates() {
    try {
      const res = await typedApi.request({
        path: '/v1/templates',
        method: 'GET',
        format: 'json',
      });
      setTemplates(res.data?.items || []);
    } catch (e) {
      await captureError(e, { action: 'load_templates' });
      setTemplates([]);
    }
  }

  async function startOnboardingScenario(scenario) {
    setOnboardingLoading(true);
    try {
      const match = templates.find((t) => {
        const id = String(t.id || '').toLowerCase();
        if (scenario === 'goal') return id.includes('tpl-goal-');
        if (scenario === 'moodboard') return id.includes('tpl-moodboard-');
        return id.includes('tpl-sprint-');
      });
      if (!match) throw new Error('TEMPLATE_FOR_SCENARIO_NOT_FOUND');

      await trackEvent('template_selected', { templateId: match.id, source: 'onboarding', scenario });

      const createdRes = await typedApi.request({
        path: '/v1/boards/from-template',
        method: 'POST',
        type: ContentType.Json,
        body: { templateId: match.id },
        format: 'json',
      });

      const created = createdRes.data;
      setCurrentUser((prev) => ({ ...(prev || {}), onboardedAt: new Date().toISOString() }));
      setShowOnboarding(false);
      await trackEvent('board_created', { source: 'template', templateId: match.id });
      await trackEvent('onboarding_completed', { templateId: match.id, scenario });
      await loadBoards();
      if (created?.id) await openBoard(Number(created.id));
      showToast('Онбординг завершён, доска создана', 'success');
    } catch (e) {
      await captureError(e, { action: 'onboarding_start', scenario });
      showToast('Не удалось создать доску из шаблона', 'error');
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function createBoardFromTemplate(template) {
    if (!template?.id) return;
    setLoading(true);
    setError('');
    try {
      const createdRes = await typedApi.request({
        path: '/v1/boards/from-template',
        method: 'POST',
        type: ContentType.Json,
        body: { templateId: template.id },
        format: 'json',
      });
      const created = createdRes.data;
      setTemplateConfirmOpen(false);
      setSelectedTemplate(null);
      await trackEvent('board_created', { source: 'template', templateId: template.id });
      await loadBoards();
      if (created?.id) await openBoard(Number(created.id));
      showToast('Доска из шаблона создана', 'success');
    } catch (e) {
      await captureError(e, { action: 'create_board_from_template', templateId: template.id });
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function createBoard() {
    setLoading(true); setError('');
    const title = emptyBoardTitle.trim();
    try {
      const { data: created } = await typedApi.v1.boardsCreate(
        title ? { title } : { title: 'Untitled board' },
        { type: ContentType.Json },
      );
      setEmptyBoardTitle('');
      if (created && created.id) {
        setBoards((prev) => {
          const exists = prev.some((b) => String(b.id) === String(created.id));
          return exists ? prev : [created, ...prev];
        });
        await openBoard(Number(created.id));
      }
      await trackEvent('board_created', { source: 'empty', titleLength: title.length });
      showToast('Пустая доска создана', 'success');
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
        const { data } = await typedApi.v1.boardsCardsCreate(
          String(activeBoardId),
          payload,
          { type: ContentType.Json },
        );
        const created = data.created;
        workingCards = workingCards.map((c) => (c.id === card.id ? created : c));
      }

      if (baseCards.length === 0 && creates.length > 0) {
        const firstType = creates[0]?.type || 'text';
        await trackEvent('first_card_added', { boardId: activeBoardId, cardType: firstType });
      }

      for (const card of updates) {
        if (card.type === 'image') continue;
        if (String(card.id).startsWith('tmp_')) continue;
        await typedApi.v1.boardsCardsPartialUpdate(
          String(activeBoardId),
          String(card.id),
          { text: card.text },
          { type: ContentType.Json },
        );
      }

      for (const card of deletes) {
        if (String(card.id).startsWith('tmp_')) continue;
        await typedApi.v1.boardsCardsDelete(String(activeBoardId), String(card.id));
      }

      setSavedCards(workingCards);
      setHistory((prev) => ({ ...prev, present: workingCards }));
      setDirty(false);
      setSaveError('');
      if (creates.length > 0) showToast(`Добавлено карточек: ${creates.length}`, 'success');
      if (deletes.length > 0) showToast(`Удалено карточек: ${deletes.length}`, 'success');
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
  }, [activeBoardId, history.present, savedCards, showToast]);

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
      await typedApi.v1.boardsDetail(String(id));
      const { data: remoteCards } = await typedApi.v1.boardsCardsList(String(id));
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
      const { data } = await typedApi.v1.boardsVersionsList(String(activeBoardId));
      const items = data?.items || [];
      setVersions((prev) => (reset ? items : [...prev, ...items]));
      setVersionsCursor(data?.nextCursor || null);
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
      await typedApi.v1.boardsVersionsCreate(String(activeBoardId));
      showToast('Версия сохранена', 'success');
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
      await typedApi.v1.boardsVersionsRestoreCreate(String(activeBoardId), String(versionId));
      showToast('Версия восстановлена', 'success');
      const { data: remoteCards } = await typedApi.v1.boardsCardsList(String(activeBoardId));
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
      const { data } = await typedApi.v1.boardsShareLinksList(String(activeBoardId));
      setShareLinks(data?.items || []);
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
      await typedApi.v1.boardsShareLinksCreate(String(activeBoardId));
      await trackEvent('share_link_created', { boardId: activeBoardId });
      showToast('Ссылка для шаринга создана', 'success');
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
      await typedApi.v1.boardsShareLinksDelete(String(activeBoardId), String(linkId));
      showToast('Ссылка отозвана', 'success');
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
      await trackEvent('export_clicked', { format, boardId: activeBoardId });
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
      const intentRes = await typedApi.request({
        path: `/v1/boards/${activeBoardId}/uploads/intents`,
        method: 'POST',
        type: ContentType.Json,
        body: { mimeType: file.type, sizeBytes: file.size, fileName: file.name },
        format: 'json',
      });
      const intent = intentRes.data;

      await uploadBinary(intent.uploadUrl, file, intent.headers || { 'content-type': file.type });
      showToast('Изображение загружено', 'success');

      const finalizedRes = await typedApi.request({
        path: `/v1/boards/${activeBoardId}/uploads/finalize`,
        method: 'POST',
        type: ContentType.Json,
        body: { objectKey: intent.objectKey },
        format: 'json',
      });
      const finalized = finalizedRes.data;
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
    return <main className="page-shell login-shell">
      <h1>DreamBoard Web Login</h1>
      <form onSubmit={login} className="login-form">
        <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="API Base URL" />
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Button type="submit" disabled={loading}>{loading ? 'Loading...' : 'Login'}</Button>
      </form>
      {loading ? <Spinner label="Authorizing..." /> : null}
      {error && <p role="alert" aria-live="assertive" style={{ color: 'var(--color-error)' }}>{error}</p>}
      <div className="ui-toast-wrap">
        <Toast message={toast?.message} kind={toast?.kind || 'error'} onClose={clearToast} />
      </div>
    </main>;
  }

  return <main className="page-shell">
    <h1>DreamBoard Web Editor v1 (text + image cards)</h1>
    <div className="toolbar">
      <Button variant="secondary" onClick={loadBoards}>Reload boards</Button>
      <Button variant="ghost" onClick={logout}>Logout</Button>
      <Button variant="ghost" onClick={undo} disabled={!canUndo || !activeBoardId}>Undo</Button>
      <Button variant="ghost" onClick={redo} disabled={!canRedo || !activeBoardId}>Redo</Button>
      <Button variant="secondary" onClick={retrySave} disabled={!dirty || !activeBoardId}>Save now</Button>
      <Button onClick={askImageUpload} disabled={!activeBoardId || uploading}>Upload image</Button>
      <Button variant="ghost" onClick={() => exportBoard('png')} disabled={!activeBoardId || exporting}>Export PNG</Button>
      <Button variant="ghost" onClick={() => exportBoard('jpg')} disabled={!activeBoardId || exporting}>Export JPG</Button>
      <Button variant="danger" onClick={triggerTestError}>Test Sentry Error</Button>
      <Button variant="secondary" onClick={() => {
        const next = !versionsOpen;
        setVersionsOpen(next);
        if (next && activeBoardId) loadVersions({ reset: true });
      }} disabled={!activeBoardId}>Versions</Button>
      <Button variant="secondary" onClick={() => {
        const next = !shareOpen;
        setShareOpen(next);
        if (next && activeBoardId) loadShareLinks();
      }} disabled={!activeBoardId}>Share</Button>
      <input ref={uploadInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onImagePicked} />
    </div>
    {loading ? <Spinner /> : null}

    {activeBoardId && <p role="status" aria-live="polite">
      Save status:{' '}
      {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
      {saveError ? <span style={{ color: 'var(--color-error)' }}> — Save failed: {saveError} <Button variant="danger" onClick={retrySave} aria-label="Повторить сохранение">Retry</Button></span> : null}
    </p>}

    {activeBoardId && uploading ? <p role="status" aria-live="polite">Upload progress: {uploadProgress}%</p> : null}
    {activeBoardId && uploadError ? <p role="alert" aria-live="assertive" style={{ color: 'var(--color-error)' }}>Upload error: {uploadError}</p> : null}

    {versionsOpen && activeBoardId ? <section>
      <h2>Versions</h2>
      <div className="inline-actions">
        <Button onClick={createVersion} disabled={versionsLoading}>Create snapshot</Button>
        <Button variant="secondary" onClick={() => loadVersions({ reset: true })} disabled={versionsLoading}>Reload versions</Button>
      </div>
      {versions.length === 0 ? <p>Нет версий</p> : <ul className="versions-list">
        {versions.map((v) => <li className="list-item-card" key={v.id}>
          #{v.id} — {new Date(v.createdAt).toLocaleString()} {' '}
          <Button variant="ghost" onClick={() => restoreVersion(v.id)} disabled={versionsLoading} aria-label={`Восстановить версию ${v.id}`}>Restore</Button>
        </li>)}
      </ul>}
      {versionsCursor ? <Button variant="secondary" onClick={() => loadVersions()} disabled={versionsLoading}>Load more</Button> : null}
    </section> : null}

    {shareOpen && activeBoardId ? <section>
      <h2>Share links</h2>
      <div className="inline-actions">
        <Button onClick={createShareLink} disabled={shareLoading}>Create share link</Button>
        <Button variant="secondary" onClick={loadShareLinks} disabled={shareLoading}>Reload links</Button>
      </div>
      {shareLinks.length === 0 ? <p>Нет share-ссылок</p> : <ul className="share-list">
        {shareLinks.map((s) => <li className="list-item-card" key={s.id}>
          #{s.id} {s.revokedAt ? '(revoked)' : '(active)'} {' '}
          <Button variant="ghost" onClick={() => copyShareUrl(s.url)} aria-label={`Скопировать ссылку ${s.id}`}>Copy URL</Button>{' '}
          {!s.revokedAt ? <Button variant="danger" onClick={() => revokeShareLink(s.id)} disabled={shareLoading} aria-label={`Отозвать ссылку ${s.id}`}>Revoke</Button> : null}
          <div style={{ fontSize: 12 }}>{s.url}</div>
        </li>)}
      </ul>}
    </section> : null}

    <section>
      <h2>Home Dashboard</h2>
      {resumeBoard ? (
        <div className="list-item-card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Continue where you left off</h3>
          <div style={{ marginBottom: 8 }}>
            <b>{resumeBoard.title}</b>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Last opened: {new Date(resumeBoard.lastOpenedAt).toLocaleString()}
            </div>
          </div>
          <Button onClick={async () => {
            await trackEvent('resume_clicked', { boardId: Number(resumeBoard.id) });
            await openBoard(Number(resumeBoard.id));
          }}>Continue</Button>
        </div>
      ) : null}
      <div className="list-item-card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Create empty board</h3>
        <div className="inline-actions">
          <Input
            placeholder="Board name (optional)"
            value={emptyBoardTitle}
            onChange={(e) => setEmptyBoardTitle(e.target.value)}
          />
          <Button onClick={createBoard}>Create empty board</Button>
        </div>
      </div>

      <div className="list-item-card">
        <h3 style={{ marginTop: 0 }}>Start with template</h3>
        {templates.length === 0 ? <p>Шаблоны загружаются...</p> : (
          <ul className="board-list">
            {templates.slice(0, 8).map((tpl) => (
              <li className="list-item-card" key={tpl.id}>
                <div style={{ fontWeight: 600 }}>{tpl.name}</div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>{tpl.description || 'Без описания'}</div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await trackEvent('template_selected', { templateId: tpl.id, source: 'dashboard' });
                    setSelectedTemplate(tpl);
                    setTemplateConfirmOpen(true);
                  }}
                >
                  Use template
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>

    <section>
      <h2>Boards list</h2>
      <div className="list-item-card" style={{ marginBottom: 12 }}>
        <div className="inline-actions" style={{ alignItems: 'center' }}>
          <Input
            placeholder="Search by title..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={filterPinnedOnly}
              onChange={(e) => setFilterPinnedOnly(e.target.checked)}
            />
            Pinned only
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={filterUpdated7Days}
              onChange={(e) => setFilterUpdated7Days(e.target.checked)}
            />
            Updated last 7 days
          </label>
        </div>
      </div>
      {boards.length === 0 ? <p>Нет досок</p> :
        <ul className="board-list">{boards.map((b) => <li className="list-item-card" key={b.id}><Button variant="secondary" onClick={() => openBoard(b.id)}>Open</Button> {b.title}</li>)}</ul>}
    </section>

    <section>
      <h2>Open board: {activeBoardId || 'none'}</h2>
      {activeBoardId && <Button onClick={addCard}>Add text card</Button>}
      {!activeBoardId ? <p>Сначала выберите доску</p> : cards.length === 0 ? (
        <div className="list-item-card" style={{ marginTop: 12, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🗂️</div>
          <p style={{ marginBottom: 12 }}>У этой доски пока нет карточек</p>
          <Button onClick={() => applyLocalCards([
            ...cards,
            { id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: 'text', text: 'Первая карточка' },
          ])}>Добавить первую карточку</Button>
        </div>
      ) : (
        <ul className="card-list">{cards.map((c) => <li className="list-item-card" key={c.id}>
          {c.type === 'image'
            ? <div>
              <div><b>Image card</b></div>
              <img src={c.imageUrl} alt="uploaded" style={{ maxWidth: 260, maxHeight: 180, display: 'block', border: '1px solid var(--color-border)' }} />
            </div>
            : <span>{c.text}</span>}
          {' '}
          {c.type !== 'image' ? <Button variant="ghost" onClick={() => editCard(c)} aria-label={`Редактировать карточку ${c.id}`}>Edit</Button> : null}
          <Button variant="danger" onClick={() => deleteCard(c)} aria-label={`Удалить карточку ${c.id}`}>Delete</Button>
        </li>)}</ul>
      )}
    </section>

    <Modal open={showOnboarding} onClose={() => {}} title="Выбери стартовый сценарий">
      <p style={{ marginTop: 0 }}>Создадим первую доску из готового шаблона:</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <Button disabled={onboardingLoading} onClick={() => startOnboardingScenario('goal')}>Goal board (доска для целей)</Button>
        <Button disabled={onboardingLoading} onClick={() => startOnboardingScenario('moodboard')}>Moodboard (визуальная доска)</Button>
        <Button disabled={onboardingLoading} onClick={() => startOnboardingScenario('sprint')}>Sprint board (доска для спринта)</Button>
      </div>
      {onboardingLoading ? <p style={{ marginTop: 8 }}>Создаю доску…</p> : null}
    </Modal>

    <Modal
      open={templateConfirmOpen}
      onClose={() => {
        setTemplateConfirmOpen(false);
        setSelectedTemplate(null);
      }}
      title="Создать доску из шаблона?"
    >
      <p style={{ marginTop: 0 }}>
        {selectedTemplate ? `Шаблон: ${selectedTemplate.name}` : 'Выбран шаблон'}
      </p>
      <div className="inline-actions">
        <Button
          variant="secondary"
          onClick={() => {
            setTemplateConfirmOpen(false);
            setSelectedTemplate(null);
          }}
        >
          Cancel
        </Button>
        <Button onClick={() => createBoardFromTemplate(selectedTemplate)}>
          Confirm
        </Button>
      </div>
    </Modal>

    <div className="ui-toast-wrap">
      <Toast message={toast?.message} kind={toast?.kind || 'error'} onClose={clearToast} />
    </div>
  </main>;
}
