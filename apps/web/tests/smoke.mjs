import fs from 'node:fs';

const required = [
  'pages/index.js',
  'package.json',
];

for (const f of required) {
  if (!fs.existsSync(new URL(`../${f}`, import.meta.url))) {
    throw new Error(`Missing required web file: ${f}`);
  }
}

console.log('web smoke test ok');
