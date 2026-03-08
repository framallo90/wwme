#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

const decoder = new TextDecoder();

function parseStoredZipEntries(archive) {
  const entries = [];
  let offset = 0;

  while (offset + 30 <= archive.length) {
    const view = new DataView(archive.buffer, archive.byteOffset + offset);
    const signature = view.getUint32(0, true);

    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }

    if (signature !== 0x04034b50) {
      throw new Error(`ZIP invalido: firma local inesperada en offset ${offset}.`);
    }

    const compressionMethod = view.getUint16(8, true);
    if (compressionMethod !== 0) {
      throw new Error(`ZIP invalido: metodo de compresion no soportado (${compressionMethod}).`);
    }

    const compressedSize = view.getUint32(18, true);
    const fileNameLength = view.getUint16(26, true);
    const extraFieldLength = view.getUint16(28, true);
    const nameOffset = offset + 30;
    const dataOffset = nameOffset + fileNameLength + extraFieldLength;
    const dataEnd = dataOffset + compressedSize;

    if (dataEnd > archive.length) {
      throw new Error('ZIP invalido: una entrada excede el tamano del archivo.');
    }

    const name = decoder.decode(archive.slice(nameOffset, nameOffset + fileNameLength));
    const data = archive.slice(dataOffset, dataEnd);
    entries.push({ name, data });
    offset = dataEnd;
  }

  return entries;
}

function parseArgs(argv) {
  const args = { kind: '', zipPaths: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--kind') {
      args.kind = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    args.zipPaths.push(token);
  }

  return args;
}

function inferKind(zipPath) {
  const lower = path.basename(zipPath).toLowerCase();
  if (lower.includes('cartografo')) {
    return 'cartografo';
  }
  if (lower.includes('cronologia')) {
    return 'cronologia';
  }
  if (lower.includes('editorial')) {
    return 'editorial';
  }
  if (lower.includes('maquetacion')) {
    return 'maquetacion';
  }
  if (lower.includes('consultoria')) {
    return 'consultoria';
  }
  return '';
}

function validateCartografo(entries) {
  const required = ['atlas-config.json', 'layers.csv', 'locations.csv', 'pins.csv', 'routes.csv', 'notes.md'];
  const names = new Set(entries.map((entry) => entry.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Faltan archivos requeridos: ${missing.join(', ')}`);
  }

  const atlasConfig = JSON.parse(decoder.decode(entries.find((entry) => entry.name === 'atlas-config.json').data));
  if (!atlasConfig.atlas || !Array.isArray(atlasConfig.atlas.layers) || !Array.isArray(atlasConfig.atlas.pins)) {
    throw new Error('atlas-config.json no contiene atlas/layers/pins validos.');
  }
}

function validateCronologia(entries) {
  const required = ['timeline.json', 'timeline.csv', 'secrets.json', 'chronicle.md'];
  const names = new Set(entries.map((entry) => entry.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Faltan archivos requeridos: ${missing.join(', ')}`);
  }

  const timeline = JSON.parse(decoder.decode(entries.find((entry) => entry.name === 'timeline.json').data));
  if (!Array.isArray(timeline)) {
    throw new Error('timeline.json no contiene una lista valida.');
  }
}

function validateEditorial(entries) {
  const required = ['manuscript.md', 'editorial-context.md', 'book-metadata.json'];
  const names = new Set(entries.map((entry) => entry.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Faltan archivos requeridos: ${missing.join(', ')}`);
  }

  const metadata = JSON.parse(decoder.decode(entries.find((entry) => entry.name === 'book-metadata.json').data));
  if (!metadata.title || !metadata.author) {
    throw new Error('book-metadata.json no contiene title/author validos.');
  }
}

function validateMaquetacion(entries) {
  const required = ['interior.css', 'interior-sample.html', 'chapter-metrics.csv', 'interior-format.json', 'README.md'];
  const names = new Set(entries.map((entry) => entry.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Faltan archivos requeridos: ${missing.join(', ')}`);
  }

  const css = decoder.decode(entries.find((entry) => entry.name === 'interior.css').data);
  if (!css.includes('@page') || !css.includes('line-height')) {
    throw new Error('interior.css no contiene reglas clave esperadas.');
  }

  const interiorFormat = JSON.parse(decoder.decode(entries.find((entry) => entry.name === 'interior-format.json').data));
  if (!interiorFormat.trimSize) {
    throw new Error('interior-format.json no contiene trimSize.');
  }
}

function validateConsultoria(entries) {
  const required = ['manuscript.md', 'consultant-context.json', 'timeline-links.csv', 'README.md'];
  const names = new Set(entries.map((entry) => entry.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Faltan archivos requeridos: ${missing.join(', ')}`);
  }

  const context = JSON.parse(decoder.decode(entries.find((entry) => entry.name === 'consultant-context.json').data));
  if (!context.foundation || !context.storyBible) {
    throw new Error('consultant-context.json no contiene foundation/storyBible.');
  }

  const timelineLinks = decoder.decode(entries.find((entry) => entry.name === 'timeline-links.csv').data);
  if (!timelineLinks.includes('eventId') || !timelineLinks.includes('chapterId')) {
    throw new Error('timeline-links.csv no contiene cabeceras esperadas.');
  }
}

function validateByKind(kind, entries) {
  if (kind === 'cartografo') {
    validateCartografo(entries);
    return;
  }
  if (kind === 'cronologia') {
    validateCronologia(entries);
    return;
  }
  if (kind === 'editorial') {
    validateEditorial(entries);
    return;
  }
  if (kind === 'maquetacion') {
    validateMaquetacion(entries);
    return;
  }
  if (kind === 'consultoria') {
    validateConsultoria(entries);
    return;
  }

  throw new Error(`No se pudo inferir el tipo de pack. Usa --kind cartografo|cronologia|editorial|maquetacion|consultoria.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.zipPaths.length === 0) {
    console.error('Uso: node scripts/verify_export_packs.mjs [--kind cartografo|cronologia|editorial|maquetacion|consultoria] <pack.zip> [otro-pack.zip]');
    process.exit(1);
  }

  let failures = 0;

  for (const zipPath of args.zipPaths) {
    try {
      const bytes = new Uint8Array(readFileSync(zipPath));
      const entries = parseStoredZipEntries(bytes);
      const kind = args.kind || inferKind(zipPath);
      validateByKind(kind, entries);
      console.log(`PASS ${zipPath} (${kind})`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${zipPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

main();
