// Fails the build when the table window bundle – or a worker it starts – can reach DM-side code.
// The table must only contain the frame renderer, never scene, store or sample data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
const FORBIDDEN = ['createSampleScene', 'selectedTokenId', 'dc.layout', 'dc.dock', 'Thorin', 'produceFrame'];

const html = readFileSync(join(dist, 'table.html'), 'utf8');
const queue = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const seen = new Set();
const problems = [];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const code = readFileSync(join(dist, file), 'utf8');
  for (const word of FORBIDDEN) if (code.includes(word)) problems.push(`${file} contains "${word}"`);
  for (const m of code.matchAll(/(?:from|import\()\s*["']\.\/([^"']+\.js)["']/g)) queue.push(`assets/${m[1]}`);
  // Workers it starts (`new URL("/assets/x.js", import.meta.url)`) run its code too (E-53).
  for (const m of code.matchAll(/new URL\(\s*[`"']\/?(assets\/[^`"']+\.js)[`"']/g)) queue.push(m[1]);
}
if (problems.length) {
  console.error('Table bundle check FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Table bundle check passed (${seen.size} chunks, no DM code).`);
