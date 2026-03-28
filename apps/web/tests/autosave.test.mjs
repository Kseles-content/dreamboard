import assert from 'node:assert/strict';
import { AUTOSAVE_DEBOUNCE_MS, createDebouncedAutosave, diffCards } from '../lib/autosave.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let calls = 0;
const debounced = createDebouncedAutosave(() => {
  calls += 1;
}, AUTOSAVE_DEBOUNCE_MS);

debounced.schedule();
await sleep(200);
debounced.schedule();
await sleep(200);
debounced.schedule();

await sleep(AUTOSAVE_DEBOUNCE_MS + 100);
assert.equal(calls, 1, 'autosave should run once after 800ms idle window');

const diff = diffCards(
  [{ id: '1', text: 'A' }, { id: '2', text: 'B' }],
  [{ id: '1', text: 'A2' }, { id: '3', text: 'C' }],
);
assert.equal(diff.creates.length, 1, 'one create expected');
assert.equal(diff.updates.length, 1, 'one update expected');
assert.equal(diff.deletes.length, 1, 'one delete expected');

console.log('autosave tests ok');
