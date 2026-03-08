#!/usr/bin/env node

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const tmpDir = path.join(projectRoot, '.tmp-export-qa');
const runnerTsPath = path.join(projectRoot, 'scripts', 'export_qa_e2e_runner.ts');
const runnerJsPath = path.join(tmpDir, 'scripts', 'export_qa_e2e_runner.js');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(projectRoot, 'reports', 'export-qa', `e2e-${timestamp}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function compileRunner() {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir: projectRoot,
    outDir: tmpDir,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    types: ['node'],
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  };

  const host = ts.createCompilerHost(options);
  const program = ts.createProgram([runnerTsPath], options, host);
  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => projectRoot,
      getNewLine: () => '\n',
    });
    fail(formatted);
  }

  writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'commonjs' }), 'utf8');
}

function runNode(commandArgs, cwd = projectRoot) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd,
    stdio: 'inherit',
  });
  if (typeof result.status !== 'number') {
    fail(`No se obtuvo codigo de salida para: node ${commandArgs.join(' ')}`);
  }
  return result.status;
}

function main() {
  compileRunner();
  mkdirSync(outputDir, { recursive: true });

  const runStatus = runNode([runnerJsPath, outputDir]);
  if (runStatus !== 0) {
    process.exit(runStatus);
  }

  const zipNames = [
    'demo-pack-cartografo.zip',
    'demo-pack-cronologia.zip',
    'demo-pack-editorial.zip',
    'demo-pack-maquetacion.zip',
    'demo-pack-consultoria.zip',
  ];
  const zipPaths = zipNames.map((name) => path.join(outputDir, name));
  const verifyStatus = runNode([path.join(projectRoot, 'scripts', 'verify_export_packs.mjs'), ...zipPaths]);
  if (verifyStatus !== 0) {
    process.exit(verifyStatus);
  }

  console.log(`\nPASS export QA E2E: ${outputDir}`);
}

main();
