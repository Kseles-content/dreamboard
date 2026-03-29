import assert from 'node:assert/strict';
import {
  HISTORY_LIMIT,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../lib/history.js';

let h = createHistory([]);
h = pushHistory(h, [{ id: '1', text: 'A' }]);
assert.equal(h.present.length, 1, 'present should update after push');
assert.equal(h.past.length, 1, 'past should store previous state');

h = pushHistory(h, [{ id: '1', text: 'B' }]);
assert.equal(h.present[0].text, 'B');
assert.equal(h.past.length, 2);

h = undoHistory(h);
assert.equal(h.present[0].text, 'A', 'undo should restore previous state');
assert.equal(h.future.length, 1, 'undo should move state to future');

h = redoHistory(h);
assert.equal(h.present[0].text, 'B', 'redo should restore undone state');

let bounded = createHistory([]);
for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
  bounded = pushHistory(bounded, [{ id: '1', text: String(i) }]);
}
assert.equal(bounded.past.length, HISTORY_LIMIT, 'history depth must be capped at 50');

console.log('history tests ok');
