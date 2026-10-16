import { readFileSync, writeFileSync } from 'node:fs';

const [baseFile, candidateFile, baselineBooleanStatus, candidateBooleanStatus] = process.argv.slice(2);
if (!candidateFile) throw new Error('Usage: compare-typecheck.mjs baseline.log candidate.log baseBoolStatus candidateBoolStatus');

const extract = (file) => {
  const result = new Map();
  const text = readFileSync(file, 'utf8').replace(/\r/g, '');
  // Compare the actual diagnostic message and source, not line numbers that
  // shift when unrelated imports are removed in the migration.
  for (const line of text.split('\n')) {
    const match = line.match(/^([^\n()]+)\(\d+,\d+\): error TS(\d+): (.*)$/);
    if (!match) continue;
    const key = match[1].replace(/\\/g, '/') + ' TS' + match[2] + ': ' + match[3];
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
};
const base = extract(baseFile);
const candidate = extract(candidateFile);
const count = (map) => [...map.values()].reduce((sum, n) => sum + n, 0);
const introduced = [];
const resolved = [];
for (const [key, value] of candidate) {
  const addition = value - (base.get(key) || 0);
  for (let i = 0; i < addition; i++) introduced.push(key);
}
for (const [key, value] of base) {
  const removed = value - (candidate.get(key) || 0);
  for (let i = 0; i < removed; i++) resolved.push(key);
}
const report = [
  '# Migration vs pre-migration baseline',
  '',
  '| Check | Before migration | Migration branch |',
  '| --- | --- | --- |',
  `| Boolean edge regression exit code | ${baselineBooleanStatus} | ${candidateBooleanStatus} |`,
  `| TypeScript diagnostics | ${count(base)} | ${count(candidate)} |`,
  `| Diagnostics introduced (source/code/message count) | 0 | ${introduced.length} |`,
  `| Diagnostics resolved | 0 | ${resolved.length} |`,
  '',
  'Existing diagnostics are retained in the full typecheck job. Baseline parity is not a replacement for it.',
  '',
  ...introduced.length ? [
    '## Newly introduced diagnostics',
    ...introduced.slice(0, 100).map(x => '- `' + x.replaceAll('`', '\\`') + '`'),
  ] : ['No new TypeScript diagnostics at matching source/code/message granularity.'],
  '',
  ...resolved.length ? [
    '## Resolved diagnostics (first 30)',
    ...resolved.slice(0, 30).map(x => '- `' + x.replaceAll('`', '\\`') + '`'),
  ] : [],
].join('\n');
writeFileSync('comparison.md', report + '\n');
console.log(report);
if (introduced.length) process.exitCode = 1;
