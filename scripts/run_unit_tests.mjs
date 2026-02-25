import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const tmpDir = path.join(projectRoot, '.tmp-tests');
const tsconfigPath = path.join(projectRoot, 'tests', 'tsconfig.tests.json');
const outputFile = path.join(tmpDir, 'tests', 'unit', 'suite.js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const loadedConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (loadedConfig.error) {
    fail(ts.formatDiagnosticsWithColorAndContext([loadedConfig.error], formatHost));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    loadedConfig.config,
    ts.sys,
    path.dirname(tsconfigPath),
  );
  const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    fail(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
  }

  writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'commonjs' }), 'utf8');

  const result = spawnSync(process.execPath, [outputFile], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  fail('La suite de tests termino sin codigo de salida.');
}

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => projectRoot,
  getNewLine: () => '\n',
};

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error inesperado';
  fail(`Runner de tests fallo: ${message}`);
});
