import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// The modeling manager gets its methods from explicit prototype modules. Its
// type contract must be syntactically valid and match the functions installed
// at runtime, rather than silently drifting away from the real API.
const contractPath = 'src/lib/SceneManager.extensions.d.ts';
const contract = readFileSync(contractPath, 'utf8');
const source = ts.createSourceFile(contractPath, contract, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
assert.equal(
  source.parseDiagnostics.length, 0,
  source.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'),
);

const interfaceNames = new Set();
function collect(node) {
  if (ts.isInterfaceDeclaration(node) && node.name.text === 'SceneManager') {
    for (const method of node.members) {
      if (ts.isMethodSignature(method) && ts.isIdentifier(method.name)) interfaceNames.add(method.name.text);
    }
  }
  ts.forEachChild(node, collect);
}
collect(source);
assert.ok(interfaceNames.size > 100, 'The actual split-out methods must have declarations');

const manager = readFileSync('src/lib/SceneManager.js', 'utf8');
const classMethods = new Set(
  [...manager.matchAll(/^  (?:async )?([A-Za-z_$][\w$]*)\([^\n)]*\)\s*\{/gm)].map(m => m[1]),
);
const files = [
  'sceneUndo', 'sceneRadialArray', 'sceneExtrude', 'sceneTexture',
  'sceneReflections', 'sceneConvert', 'sceneSelection', 'sceneLights',
  'sceneMouse', 'sceneGestures', 'sceneCut', 'sceneMeasure',
  'sceneAddVertex', 'sceneReference', 'sceneDrawFace', 'focusRenderBoost',
];
const installed = new Set();
for (const moduleName of files) {
  const source = readFileSync(`src/lib/${moduleName}.js`, 'utf8');
  for (const match of source.matchAll(
    /(?:\bP|SceneManager(?:Class)?\.prototype)\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\(/g,
  )) {
    if (!classMethods.has(match[1])) installed.add(match[1]);
  }
}
for (const method of installed) {
  assert.ok(interfaceNames.has(method), `Missing SceneManager extension declaration: ${method}`);
}
for (const method of interfaceNames) {
  assert.ok(installed.has(method), `SceneManager extension is not implemented: ${method}`);
}
console.log(`PASS: ${interfaceNames.size} declared SceneManager extensions match installed implementations`);
