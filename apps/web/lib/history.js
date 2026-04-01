export const HISTORY_LIMIT = 50;

export function createHistory(initialPresent = []) {
  return {
    past: [],
    present: cloneCards(initialPresent),
    future: [],
  };
}

export function pushHistory(history, nextPresent) {
  const next = cloneCards(nextPresent);
  if (cardsEqual(history.present, next)) return history;

  const past = [...history.past, cloneCards(history.present)];
  if (past.length > HISTORY_LIMIT) past.shift();

  return {
    past,
    present: next,
    future: [],
  };
}

export function undoHistory(history) {
  if (history.past.length === 0) return history;
  const prev = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneCards(prev),
    future: [cloneCards(history.present), ...history.future],
  };
}

export function redoHistory(history) {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, cloneCards(history.present)],
    present: cloneCards(next),
    future: history.future.slice(1),
  };
}

export function serializeHistory(history) {
  return JSON.stringify(history);
}

export function deserializeHistory(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || !Array.isArray(parsed.past) || !Array.isArray(parsed.present) || !Array.isArray(parsed.future)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function cloneCards(cards) {
  return (cards || []).map((c) => ({ ...c }));
}

function cardSig(card) {
  if (!card) return '';
  if (card.type === 'image') {
    return `${card.id}|image|${card.objectKey || ''}|${card.imageUrl || ''}`;
  }
  return `${card.id}|text|${card.text || ''}`;
}

export function cardsEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (cardSig(a[i]) !== cardSig(b[i])) return false;
  }
  return true;
}
