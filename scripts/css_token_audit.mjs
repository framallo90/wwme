#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_SCAN_DIRS = ['src/styles', 'src'];
const EXCLUDED_FILES = new Set([
  path.normalize('src/styles/tokens.css'),
]);

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_COLOR_PATTERN = /\brgba?\(([^)]+)\)/g;

function listCssFiles(relativeDir) {
  const absoluteDir = path.join(projectRoot, relativeDir);
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCssFiles(path.join(relativeDir, entry.name)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.css')) {
      continue;
    }
    files.push(path.normalize(path.join(relativeDir, entry.name)));
  }
  return files;
}

function parseArgs(argv) {
  const options = {
    output: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--output' && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function collectMatches(content, pattern) {
  const matches = new Map();
  for (const match of content.matchAll(pattern)) {
    const literal = match[0];
    const currentCount = matches.get(literal) ?? 0;
    matches.set(literal, currentCount + 1);
  }
  return matches;
}

function toTopList(matchMap, limit = 8) {
  return [...matchMap.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([literal, count]) => ({ literal, count }));
}

function ensureOutputPath(customOutput) {
  if (customOutput && customOutput.trim()) {
    const absolute = path.resolve(projectRoot, customOutput);
    mkdirSync(path.dirname(absolute), { recursive: true });
    return absolute;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportsDir = path.join(projectRoot, 'reports', 'visual-qa');
  mkdirSync(reportsDir, { recursive: true });
  return path.join(reportsDir, `css-token-audit-${timestamp}.json`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = ensureOutputPath(options.output);

  const discoveredFiles = DEFAULT_SCAN_DIRS.flatMap((entry) => listCssFiles(entry));
  const uniqueFiles = [...new Set(discoveredFiles)]
    .filter((relativePath) => !EXCLUDED_FILES.has(path.normalize(relativePath)))
    .sort((left, right) => left.localeCompare(right));

  const files = [];
  let totalHex = 0;
  let totalRgb = 0;

  for (const relativePath of uniqueFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    const raw = readFileSync(absolutePath, 'utf8');
    const content = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const hexMatches = collectMatches(content, HEX_COLOR_PATTERN);
    const rgbMatches = collectMatches(content, RGB_COLOR_PATTERN);
    const hexCount = [...hexMatches.values()].reduce((sum, value) => sum + value, 0);
    const rgbCount = [...rgbMatches.values()].reduce((sum, value) => sum + value, 0);

    if (hexCount === 0 && rgbCount === 0) {
      continue;
    }

    totalHex += hexCount;
    totalRgb += rgbCount;
    files.push({
      path: relativePath.replace(/\\/g, '/'),
      hexCount,
      rgbCount,
      topHex: toTopList(hexMatches),
      topRgb: toTopList(rgbMatches),
    });
  }

  const sortedFiles = files.sort(
    (left, right) =>
      (right.hexCount + right.rgbCount) - (left.hexCount + left.rgbCount) ||
      left.path.localeCompare(right.path),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'scripts/css_token_audit.mjs',
    totals: {
      filesScanned: uniqueFiles.length,
      filesWithLiterals: sortedFiles.length,
      hexLiterals: totalHex,
      rgbLiterals: totalRgb,
    },
    files: sortedFiles,
  };

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(outputPath);
}

main();
