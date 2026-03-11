#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const tokensCssPath = path.join(projectRoot, 'src', 'styles', 'tokens.css');

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

function extractVarBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const match = css.match(regex);
  if (!match) {
    return {};
  }

  const block = match[1];
  const output = {};
  for (const declaration of block.matchAll(/--([a-z0-9-_]+)\s*:\s*([^;]+);/gi)) {
    output[declaration[1]] = declaration[2].trim();
  }
  return output;
}

function buildTokenDictionary(base, variants) {
  const names = new Set(Object.keys(base));
  for (const variantValues of Object.values(variants)) {
    for (const tokenName of Object.keys(variantValues)) {
      names.add(tokenName);
    }
  }

  const dictionary = {};
  for (const tokenName of [...names].sort((left, right) => left.localeCompare(right))) {
    dictionary[tokenName] = {
      value: base[tokenName] ?? null,
      extensions: Object.fromEntries(
        Object.entries(variants).map(([variantName, values]) => [variantName, values[tokenName] ?? null]),
      ),
    };
  }
  return dictionary;
}

function resolveOutputPaths(customOutput) {
  if (customOutput && customOutput.trim()) {
    const absolute = path.resolve(projectRoot, customOutput);
    mkdirSync(path.dirname(absolute), { recursive: true });
    return {
      outputPath: absolute,
      latestPath: '',
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportsDir = path.join(projectRoot, 'reports', 'design-tokens');
  mkdirSync(reportsDir, { recursive: true });
  return {
    outputPath: path.join(reportsDir, `tokens-${timestamp}.json`),
    latestPath: path.join(reportsDir, 'latest.json'),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const css = readFileSync(tokensCssPath, 'utf8');
  const base = extractVarBlock(css, ':root');
  const dark = extractVarBlock(css, ":root[data-theme='dark']");
  const sepia = extractVarBlock(css, ":root[data-theme='sepia']");
  const highContrast = extractVarBlock(css, ":root[data-contrast='high']");
  const largeText = extractVarBlock(css, ":root[data-text-size='large']");

  const variants = {
    dark,
    sepia,
    highContrast,
    largeText,
  };

  const dictionary = buildTokenDictionary(base, variants);
  const report = {
    generatedAt: new Date().toISOString(),
    source: 'src/styles/tokens.css',
    themes: {
      base,
      dark,
      sepia,
      highContrast,
      largeText,
    },
    tokenCount: Object.keys(dictionary).length,
    dictionary,
  };

  const { outputPath, latestPath } = resolveOutputPaths(options.output);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (latestPath) {
    writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  console.log(outputPath);
  if (latestPath) {
    console.log(latestPath);
  }
}

main();
