import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.json',
  '.txt',
  '.svg',
  '.xml',
]);

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
]);

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }

  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(rootDirectory) {
  const files = [];
  const queue = [rootDirectory];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }
  return files;
}

function classifyByExtension(extension) {
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return 'js';
  }
  if (extension === '.css') {
    return 'css';
  }
  if (extension === '.html') {
    return 'html';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (extension === '.map') {
    return 'map';
  }
  return 'other';
}

async function main() {
  const rootDirectory = process.cwd();
  const distDirectory = path.join(rootDirectory, 'dist');

  if (!(await pathExists(distDirectory))) {
    throw new Error('No se encontro ./dist. Ejecuta primero "npm run build".');
  }

  const files = (await listFilesRecursive(distDirectory)).sort((left, right) => left.localeCompare(right));
  if (files.length === 0) {
    throw new Error('La carpeta dist esta vacia.');
  }

  const entries = [];
  const totalsByKind = new Map();
  let totalBytes = 0;
  let totalGzipBytes = 0;
  let gzipCount = 0;

  for (const absolutePath of files) {
    const relativePath = toPosix(path.relative(distDirectory, absolutePath));
    const extension = path.extname(absolutePath).toLowerCase();
    const buffer = await fs.readFile(absolutePath);
    const rawBytes = buffer.length;
    const kind = classifyByExtension(extension);
    const gzipBytes = TEXT_EXTENSIONS.has(extension) ? gzipSync(buffer, { level: 9 }).length : null;

    entries.push({
      path: relativePath,
      extension,
      kind,
      rawBytes,
      gzipBytes,
    });

    totalBytes += rawBytes;
    if (gzipBytes !== null) {
      totalGzipBytes += gzipBytes;
      gzipCount += 1;
    }

    const accumulator = totalsByKind.get(kind) ?? { rawBytes: 0, count: 0 };
    accumulator.rawBytes += rawBytes;
    accumulator.count += 1;
    totalsByKind.set(kind, accumulator);
  }

  entries.sort((left, right) => {
    if (right.rawBytes !== left.rawBytes) {
      return right.rawBytes - left.rawBytes;
    }
    return left.path.localeCompare(right.path);
  });

  const topEntries = entries.slice(0, 20).map((entry) => ({
    path: entry.path,
    raw: formatBytes(entry.rawBytes),
    gzip: entry.gzipBytes === null ? '-' : formatBytes(entry.gzipBytes),
    kind: entry.kind,
  }));

  const byKind = Array.from(totalsByKind.entries())
    .sort((left, right) => right[1].rawBytes - left[1].rawBytes)
    .map(([kind, stats]) => ({
      kind,
      files: stats.count,
      rawBytes: stats.rawBytes,
      raw: formatBytes(stats.rawBytes),
    }));

  const now = new Date();
  const iso = now.toISOString();
  const stamp = iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const reportsDirectory = path.join(rootDirectory, 'reports', 'build');
  await fs.mkdir(reportsDirectory, { recursive: true });
  const reportJsonPath = path.join(reportsDirectory, `build-size-${stamp}.json`);
  const latestJsonPath = path.join(reportsDirectory, 'build-size-latest.json');
  const report = {
    generatedAt: iso,
    distDirectory: toPosix(path.relative(rootDirectory, distDirectory)),
    summary: {
      fileCount: entries.length,
      totalRawBytes: totalBytes,
      totalRaw: formatBytes(totalBytes),
      textFileCount: gzipCount,
      totalEstimatedGzipBytes: totalGzipBytes,
      totalEstimatedGzip: formatBytes(totalGzipBytes),
    },
    byKind,
    topEntries,
  };

  await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('Build size report:');
  console.log(`- Dist: ${report.distDirectory}`);
  console.log(`- Archivos: ${report.summary.fileCount}`);
  console.log(`- Peso total: ${report.summary.totalRaw}`);
  console.log(`- Gzip estimado (texto): ${report.summary.totalEstimatedGzip}`);
  console.log(`- Reporte JSON: ${toPosix(path.relative(rootDirectory, reportJsonPath))}`);
  console.log('');
  console.log('Top 20 archivos por peso:');
  for (const entry of topEntries) {
    console.log(`- ${entry.path} | raw ${entry.raw} | gzip ${entry.gzip} | ${entry.kind}`);
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error inesperado';
  console.error(`report_build_sizes fallo: ${message}`);
  process.exit(1);
});
