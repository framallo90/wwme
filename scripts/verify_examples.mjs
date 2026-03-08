import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const exampleDirs = [
  path.join(projectRoot, 'examples', 'demo-book'),
  path.join(projectRoot, 'examples', 'novela-el-faro-y-la-niebla'),
];

const requiredBookKeys = ['title', 'author', 'chapterOrder', 'coverImage', 'createdAt', 'updatedAt', 'chats'];
const requiredConfigKeys = [
  'model',
  'systemPrompt',
  'temperature',
  'autoVersioning',
  'autoApplyChatChanges',
  'chatApplyIterations',
  'continuousAgentEnabled',
  'continuousAgentMaxRounds',
  'autosaveIntervalMs',
  'ollamaOptions',
];
const requiredChapterKeys = ['id', 'title', 'content', 'createdAt', 'updatedAt'];

function toRelative(targetPath) {
  return path.relative(projectRoot, targetPath).replace(/\\/g, '/');
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function validateRequiredKeys(label, payload, keys, issues) {
  for (const key of keys) {
    if (!(key in payload)) {
      issues.push(`${label} missing key: ${key}`);
    }
  }
}

function validateExample(examplePath) {
  const issues = [];
  const bookJsonPath = path.join(examplePath, 'book.json');
  const configJsonPath = path.join(examplePath, 'config.json');
  const chaptersPath = path.join(examplePath, 'chapters');
  const assetsPath = path.join(examplePath, 'assets');
  const versionsPath = path.join(examplePath, 'versions');
  const chatsPath = path.join(examplePath, 'chats');

  for (const requiredPath of [bookJsonPath, configJsonPath, chaptersPath, assetsPath, versionsPath, chatsPath]) {
    if (!fs.existsSync(requiredPath)) {
      issues.push(`missing path: ${toRelative(requiredPath)}`);
    }
  }

  if (issues.length > 0) {
    return issues;
  }

  let metadata;
  let config;

  try {
    metadata = readJson(bookJsonPath);
  } catch (error) {
    issues.push(`book.json invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return issues;
  }

  try {
    config = readJson(configJsonPath);
  } catch (error) {
    issues.push(`config.json invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return issues;
  }

  validateRequiredKeys('book.json', metadata, requiredBookKeys, issues);
  validateRequiredKeys('config.json', config, requiredConfigKeys, issues);

  if (!Array.isArray(metadata.chapterOrder) || metadata.chapterOrder.length === 0) {
    issues.push('book.json chapterOrder must be a non-empty array');
  }

  if (!metadata.chats || typeof metadata.chats !== 'object') {
    issues.push('book.json chats must be an object');
  } else {
    if (!Array.isArray(metadata.chats.book)) {
      issues.push('book.json chats.book must be an array');
    }
    if (!metadata.chats.chapters || typeof metadata.chats.chapters !== 'object' || Array.isArray(metadata.chats.chapters)) {
      issues.push('book.json chats.chapters must be an object');
    }
  }

  if (typeof metadata.coverImage === 'string' && metadata.coverImage.trim()) {
    const coverPath = path.join(examplePath, metadata.coverImage);
    if (!fs.existsSync(coverPath)) {
      issues.push(`coverImage missing file: ${toRelative(coverPath)}`);
    }
  }

  if (typeof metadata.backCoverImage === 'string' && metadata.backCoverImage.trim()) {
    const backCoverPath = path.join(examplePath, metadata.backCoverImage);
    if (!fs.existsSync(backCoverPath)) {
      issues.push(`backCoverImage missing file: ${toRelative(backCoverPath)}`);
    }
  }

  if (Array.isArray(metadata.chapterOrder)) {
    for (const chapterId of metadata.chapterOrder) {
      const chapterFilePath = path.join(chaptersPath, `${chapterId}.json`);
      if (!fs.existsSync(chapterFilePath)) {
        issues.push(`chapterOrder missing chapter file: ${toRelative(chapterFilePath)}`);
        continue;
      }

      let chapter;
      try {
        chapter = readJson(chapterFilePath);
      } catch (error) {
        issues.push(`${toRelative(chapterFilePath)} invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      validateRequiredKeys(toRelative(chapterFilePath), chapter, requiredChapterKeys, issues);
      if (chapter.id !== chapterId) {
        issues.push(`${toRelative(chapterFilePath)} id mismatch: expected ${chapterId}, received ${chapter.id}`);
      }
    }
  }

  return issues;
}

let failures = 0;

for (const examplePath of exampleDirs) {
  const issues = validateExample(examplePath);
  const label = toRelative(examplePath);

  if (issues.length === 0) {
    console.log(`[PASS] ${label}`);
    continue;
  }

  failures += 1;
  console.log(`[FAIL] ${label}`);
  for (const issue of issues) {
    console.log(`  - ${issue}`);
  }
}

if (failures > 0) {
  console.log(`Final: FAIL (${failures} example${failures === 1 ? '' : 's'})`);
  process.exit(1);
}

console.log('Final: PASS');
