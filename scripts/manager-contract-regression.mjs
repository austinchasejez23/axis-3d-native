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
    /(?:\bP|SceneManager(?:Class)?\.prototype)\.([A-Za-z_$][\w$]*)\s*=\s*(?:\/\*\*[\s\S]*?\*\/\s*)?(?:async\s+)?function\s*\(/g,
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

const configFile = ts.readConfigFile('jsconfig.json', ts.sys.readFile);
assert.equal(configFile.error, undefined, 'Project jsconfig must parse');
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const program = ts.createProgram(config.fileNames, config.options);
const classSource = program.getSourceFile('src/lib/SceneManager.js')
  ?? program.getSourceFiles().find(f => f.fileName.endsWith('/src/lib/SceneManager.js'));
assert.ok(classSource, 'Project typecheck must actually include SceneManager');
const clazz = classSource.statements.find(stmt =>
  ts.isClassDeclaration(stmt) && stmt.name?.text === 'SceneManager'
);
assert.ok(clazz, 'SceneManager class was not found by TypeScript');
const checker = program.getTypeChecker();
const instanceSymbol = checker.getSymbolAtLocation(clazz.name);
const instance = checker.getDeclaredTypeOfSymbol(instanceSymbol);
const contractFile = program.getSourceFiles().find(f => f.fileName.endsWith('/src/lib/SceneManager.extensions.d.ts'));
assert.ok(contractFile, 'TypeScript did not load the SceneManager augmentation file');
const contractIssues = program.getSemanticDiagnostics(contractFile);
if (contractIssues.length) {
  console.log('SCENEMANAGER_CONTRACT_DIAGNOSTICS', contractIssues.slice(0, 20).map(d => ({
    code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n')
  })));
}
console.log('SCENEMANAGER_TYPED_PROPS', checker.getPropertiesOfType(instance).slice(0, 20).map(prop => prop.name));
for (const name of ['setupEvents', 'setSelection', 'pushUndo', 'applyLighting']) {
  assert.ok(
    checker.getPropertyOfType(instance, name),
    `TypeScript cannot see SceneManager extension ${name}; the contract is not linked to the real class`,
  );
}
console.log('PASS: TypeScript resolves the SceneManager extension contract against the actual class');
