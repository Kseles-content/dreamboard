import fs from 'node:fs';

const required = [
  'pages/index.js',
  'package.json',
  'lib/history.js',
  'lib/autosave.js',
];

for (const f of required) {
  if (!fs.existsSync(new URL(`../${f}`, import.meta.url))) {
    throw new Error(`Missing required web file: ${f}`);
  }
}

await import('./history.test.mjs');
await import('./autosave.test.mjs');

console.log('web smoke test ok');
