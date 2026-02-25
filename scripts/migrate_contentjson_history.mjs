import fs from 'node:fs/promises';
import path from 'node:path';

const IGNORED_SCAN_DIRS = new Set(['.git', 'node_modules', 'dist', '.tmp-tests', 'target']);
const DEFAULT_SCAN_DEPTH = 4;

function printUsage() {
  const usage = [
    'Usage:',
    '  node ./scripts/migrate_contentjson_history.mjs [options]',
    '',
    'Options:',
    '  --book <path>     Book directory (can repeat). Default: current directory.',
    '  --scan <path>     Scan a root directory for books (can repeat).',
    '  --depth <number>  Max depth for --scan (default: 4).',
    '  --apply           Write changes to disk. Default is dry-run.',
    '  --backup          Create backups before writing (used with --apply).',
    '  --verbose         Print every modified file.',
    '  --help            Show this help.',
    '',
    'Examples:',
    '  node ./scripts/migrate_contentjson_history.mjs --book ./examples/demo-book',
    '  node ./scripts/migrate_contentjson_history.mjs --book ./examples/demo-book --apply --backup',
    '  node ./scripts/migrate_contentjson_history.mjs --scan ./examples --apply',
  ];
  console.log(usage.join('\n'));
}

function parseArgs(argv) {
  const options = {
    books: [],
    scans: [],
    apply: false,
    backup: false,
    verbose: false,
    depth: DEFAULT_SCAN_DEPTH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--book') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --book');
      }
      options.books.push(value);
      index += 1;
      continue;
    }

    if (arg === '--scan') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --scan');
      }
      options.scans.push(value);
      index += 1;
      continue;
    }

    if (arg === '--depth') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --depth');
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --depth value: ${value}`);
      }
      options.depth = parsed;
      index += 1;
      continue;
    }

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--backup') {
      options.backup = true;
      continue;
    }

    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function isBookDirectory(bookPath) {
  const bookFile = path.join(bookPath, 'book.json');
  const chaptersDir = path.join(bookPath, 'chapters');
  const versionsDir = path.join(bookPath, 'versions');
  return (
    (await pathExists(bookFile)) &&
    (await directoryExists(chaptersDir)) &&
    (await directoryExists(versionsDir))
  );
}

async function scanForBooks(rootPath, maxDepth) {
  const found = new Set();
  const queue = [{ dir: path.resolve(rootPath), depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const normalizedDir = path.resolve(current.dir);
    if (visited.has(normalizedDir)) {
      continue;
    }
    visited.add(normalizedDir);

    if (await isBookDirectory(normalizedDir)) {
      found.add(normalizedDir);
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    let entries = [];
    try {
      entries = await fs.readdir(normalizedDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (IGNORED_SCAN_DIRS.has(entry.name)) {
        continue;
      }

      queue.push({
        dir: path.join(normalizedDir, entry.name),
        depth: current.depth + 1,
      });
    }
  }

  return Array.from(found).sort((left, right) => left.localeCompare(right));
}

function migratePayload(payload) {
  let cleanedFields = 0;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if ('contentJson' in payload && payload.contentJson !== null) {
      payload.contentJson = null;
      cleanedFields += 1;
    }

    if (
      payload.chapter &&
      typeof payload.chapter === 'object' &&
      !Array.isArray(payload.chapter) &&
      'contentJson' in payload.chapter &&
      payload.chapter.contentJson !== null
    ) {
      payload.chapter.contentJson = null;
      cleanedFields += 1;
    }
  }

  return cleanedFields;
}

function buildBackupPath(backupRoot, bookPath, filePath) {
  const relative = path.relative(bookPath, filePath);
  return path.join(backupRoot, relative);
}

async function listJsonFiles(directoryPath) {
  let entries = [];
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function processBook(bookPath, options) {
  const chaptersDir = path.join(bookPath, 'chapters');
  const versionsDir = path.join(bookPath, 'versions');
  const chapterFiles = await listJsonFiles(chaptersDir);
  const versionFiles = await listJsonFiles(versionsDir);
  const targets = [...chapterFiles, ...versionFiles];
  const nowTag = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = options.apply && options.backup
    ? path.join(bookPath, `.backup-contentjson-${nowTag}`)
    : null;

  const report = {
    bookPath,
    filesScanned: targets.length,
    filesChanged: 0,
    fieldsCleaned: 0,
    parseErrors: 0,
    writeErrors: 0,
    changedFiles: [],
    errorFiles: [],
  };

  if (backupRoot) {
    await fs.mkdir(backupRoot, { recursive: true });
  }

  for (const filePath of targets) {
    let raw = '';
    let payload = null;
    try {
      raw = await fs.readFile(filePath, 'utf8');
      payload = JSON.parse(raw);
    } catch (error) {
      report.parseErrors += 1;
      report.errorFiles.push({
        path: filePath,
        reason: `parse: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const cleanedFields = migratePayload(payload);
    if (cleanedFields === 0) {
      continue;
    }

    report.filesChanged += 1;
    report.fieldsCleaned += cleanedFields;
    report.changedFiles.push(filePath);

    if (!options.apply) {
      continue;
    }

    try {
      if (backupRoot) {
        const backupPath = buildBackupPath(backupRoot, bookPath, filePath);
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.writeFile(backupPath, raw, 'utf8');
      }

      await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    } catch (error) {
      report.writeErrors += 1;
      report.errorFiles.push({
        path: filePath,
        reason: `write: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (options.verbose && report.changedFiles.length > 0) {
    for (const changedFile of report.changedFiles) {
      console.log(`  changed: ${changedFile}`);
    }
  }

  return report;
}

async function resolveBooks(options) {
  const directBooks = options.books.length > 0 ? options.books : [process.cwd()];
  const books = new Set();

  for (const directBook of directBooks) {
    books.add(path.resolve(directBook));
  }

  for (const scanRoot of options.scans) {
    const scanned = await scanForBooks(scanRoot, options.depth);
    for (const bookPath of scanned) {
      books.add(bookPath);
    }
  }

  return Array.from(books).sort((left, right) => left.localeCompare(right));
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Argument error: ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exit(1);
  }

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (options.backup && !options.apply) {
    console.error('Option --backup requires --apply.');
    process.exit(1);
  }

  const candidates = await resolveBooks(options);
  if (candidates.length === 0) {
    console.error('No book paths to process.');
    process.exit(1);
  }

  const validBooks = [];
  const invalidBooks = [];

  for (const candidate of candidates) {
    if (await isBookDirectory(candidate)) {
      validBooks.push(candidate);
    } else {
      invalidBooks.push(candidate);
    }
  }

  if (validBooks.length === 0) {
    console.error('No valid books found (requires book.json + chapters/ + versions/).');
    for (const invalidBook of invalidBooks) {
      console.error(`  invalid: ${invalidBook}`);
    }
    process.exit(1);
  }

  console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Books: ${validBooks.length}`);
  if (invalidBooks.length > 0) {
    console.log(`Ignored invalid paths: ${invalidBooks.length}`);
  }

  const reports = [];
  for (const bookPath of validBooks) {
    console.log(`\nBook: ${bookPath}`);
    const report = await processBook(bookPath, options);
    reports.push(report);
    console.log(
      `  scanned=${report.filesScanned} changed=${report.filesChanged} fields=${report.fieldsCleaned} parseErrors=${report.parseErrors} writeErrors=${report.writeErrors}`,
    );
  }

  const totals = reports.reduce(
    (accumulator, report) => ({
      scanned: accumulator.scanned + report.filesScanned,
      changed: accumulator.changed + report.filesChanged,
      fields: accumulator.fields + report.fieldsCleaned,
      parseErrors: accumulator.parseErrors + report.parseErrors,
      writeErrors: accumulator.writeErrors + report.writeErrors,
    }),
    { scanned: 0, changed: 0, fields: 0, parseErrors: 0, writeErrors: 0 },
  );

  console.log('\nSummary');
  console.log(`  scanned=${totals.scanned}`);
  console.log(`  changed=${totals.changed}`);
  console.log(`  fieldsCleaned=${totals.fields}`);
  console.log(`  parseErrors=${totals.parseErrors}`);
  console.log(`  writeErrors=${totals.writeErrors}`);

  if (totals.parseErrors > 0 || totals.writeErrors > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
