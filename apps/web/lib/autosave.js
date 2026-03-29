export const AUTOSAVE_DEBOUNCE_MS = 800;

export function createDebouncedAutosave(callback, delay = AUTOSAVE_DEBOUNCE_MS) {
  let timer = null;

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delay);
    },
    flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      callback();
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export function diffCards(savedCards = [], currentCards = []) {
  const savedMap = new Map(savedCards.map((c) => [c.id, c]));
  const currentMap = new Map(currentCards.map((c) => [c.id, c]));

  const creates = [];
  const updates = [];
  const deletes = [];

  for (const c of currentCards) {
    const prev = savedMap.get(c.id);
    if (!prev) creates.push(c);
    else if (prev.text !== c.text) updates.push(c);
  }

  for (const c of savedCards) {
    if (!currentMap.has(c.id)) deletes.push(c);
  }

  return { creates, updates, deletes };
}
