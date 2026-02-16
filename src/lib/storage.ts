import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';

import { DEFAULT_APP_CONFIG } from './config';
import { getNowIso, joinPath, normalizePath, safeFileName, slugify } from './text';
import type {
  AppConfig,
  BookChats,
  BookFoundation,
  BookMetadata,
  BookProject,
  ChapterDocument,
  ChapterSnapshot,
} from '../types/book';

const BOOK_FILE = 'book.json';
const CHAPTERS_DIR = 'chapters';
const ASSETS_DIR = 'assets';
const VERSIONS_DIR = 'versions';
const EXPORTS_DIR = 'exports';
const CONFIG_FILE = 'config.json';

function buildDefaultChats(): BookChats {
  return {
    book: [],
    chapters: {},
  };
}

export function buildDefaultFoundation(): BookFoundation {
  return {
    centralIdea: '',
    promise: '',
    audience: '',
    narrativeVoice: 'Intimo, sobrio, reflexivo.',
    styleRules: 'Frases claras, sin relleno, evitar tono de autoayuda.',
    structureNotes: '',
    glossaryPreferred: '',
    glossaryAvoid: '',
  };
}

function chapterFilePath(bookPath: string, chapterId: string): string {
  return joinPath(bookPath, CHAPTERS_DIR, `${chapterId}.json`);
}

function bookFilePath(bookPath: string): string {
  return joinPath(bookPath, BOOK_FILE);
}

function configFilePath(bookPath: string): string {
  return joinPath(bookPath, CONFIG_FILE);
}

function versionsDirPath(bookPath: string): string {
  return joinPath(bookPath, VERSIONS_DIR);
}

function exportsDirPath(bookPath: string): string {
  return joinPath(bookPath, EXPORTS_DIR);
}

function parseVersion(fileName: string, chapterId: string): number {
  const matcher = new RegExp(`^${chapterId}_v(\\d+)\\.json$`);
  const match = fileName.match(matcher);
  return match ? Number(match[1]) : 0;
}

function ensureChapterDocument(chapter: ChapterDocument): ChapterDocument {
  return {
    ...chapter,
    contentJson: chapter.contentJson ?? null,
  };
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeTextFile(path, JSON.stringify(data, null, 2));
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readTextFile(path);
  return JSON.parse(raw) as T;
}

function getNextChapterId(order: string[]): string {
  let max = 0;
  for (const id of order) {
    const value = Number.parseInt(id, 10);
    if (Number.isFinite(value)) {
      max = Math.max(max, value);
    }
  }

  return String(max + 1).padStart(2, '0');
}

function ensureBookMetadata(metadata: BookMetadata): BookMetadata {
  return {
    ...metadata,
    chats: metadata.chats ?? buildDefaultChats(),
    coverImage: metadata.coverImage ?? null,
    foundation: metadata.foundation ?? buildDefaultFoundation(),
  };
}

export async function loadAppConfig(bookPath: string): Promise<AppConfig> {
  const normalizedBookPath = normalizePath(bookPath);
  const targetConfigPath = configFilePath(normalizedBookPath);

  await mkdir(normalizedBookPath, { recursive: true });

  if (!(await exists(targetConfigPath))) {
    await writeJson(targetConfigPath, DEFAULT_APP_CONFIG);
    return DEFAULT_APP_CONFIG;
  }

  const loaded = await readJson<Partial<AppConfig>>(targetConfigPath);
  return {
    ...DEFAULT_APP_CONFIG,
    ...loaded,
    ollamaOptions: {
      ...DEFAULT_APP_CONFIG.ollamaOptions,
      ...(loaded.ollamaOptions ?? {}),
    },
  };
}

export async function saveAppConfig(bookPath: string, config: AppConfig): Promise<void> {
  const normalizedBookPath = normalizePath(bookPath);
  await mkdir(normalizedBookPath, { recursive: true });
  await writeJson(configFilePath(normalizedBookPath), config);
}

export async function createBookProject(
  parentDirectory: string,
  title: string,
  author: string,
): Promise<BookProject> {
  const now = getNowIso();
  const folderName = slugify(title) || `book-${Date.now()}`;
  const projectPath = joinPath(normalizePath(parentDirectory), folderName);

  if (await exists(projectPath)) {
    throw new Error('La carpeta de destino ya existe.');
  }

  await mkdir(projectPath, { recursive: true });
  await mkdir(joinPath(projectPath, CHAPTERS_DIR), { recursive: true });
  await mkdir(joinPath(projectPath, ASSETS_DIR), { recursive: true });
  await mkdir(joinPath(projectPath, VERSIONS_DIR), { recursive: true });

  const firstChapter: ChapterDocument = {
    id: '01',
    title: 'Capitulo 1',
    content: '<p>Escribe aqui...</p>',
    contentJson: null,
    createdAt: now,
    updatedAt: now,
  };

  const metadata: BookMetadata = {
    title,
    author,
    chapterOrder: [firstChapter.id],
    coverImage: null,
    foundation: buildDefaultFoundation(),
    createdAt: now,
    updatedAt: now,
    chats: buildDefaultChats(),
  };

  await writeJson(bookFilePath(projectPath), metadata);
  await writeJson(chapterFilePath(projectPath, firstChapter.id), firstChapter);
  await writeJson(configFilePath(projectPath), DEFAULT_APP_CONFIG);

  return {
    path: projectPath,
    metadata,
    chapters: {
      [firstChapter.id]: firstChapter,
    },
  };
}

export async function loadBookProject(path: string): Promise<BookProject> {
  const projectPath = normalizePath(path);
  const bookPath = bookFilePath(projectPath);

  if (!(await exists(bookPath))) {
    throw new Error('No se encontro book.json en la carpeta seleccionada.');
  }

  const metadata = ensureBookMetadata(await readJson<BookMetadata>(bookPath));
  const chapters: Record<string, ChapterDocument> = {};

  for (const chapterId of metadata.chapterOrder) {
    const chapterPath = chapterFilePath(projectPath, chapterId);
    if (await exists(chapterPath)) {
      chapters[chapterId] = ensureChapterDocument(await readJson<ChapterDocument>(chapterPath));
    }
  }

  return {
    path: projectPath,
    metadata,
    chapters,
  };
}

export async function saveBookMetadata(
  bookPath: string,
  metadata: BookMetadata,
): Promise<BookMetadata> {
  const nextMetadata: BookMetadata = {
    ...metadata,
    updatedAt: getNowIso(),
    chats: metadata.chats ?? buildDefaultChats(),
    foundation: metadata.foundation ?? buildDefaultFoundation(),
  };

  await writeJson(bookFilePath(bookPath), nextMetadata);
  return nextMetadata;
}

export async function saveChapter(bookPath: string, chapter: ChapterDocument): Promise<ChapterDocument> {
  const nextChapter: ChapterDocument = ensureChapterDocument({
    ...chapter,
    updatedAt: getNowIso(),
  });

  await writeJson(chapterFilePath(bookPath, chapter.id), nextChapter);
  return nextChapter;
}

export async function createChapter(
  bookPath: string,
  metadata: BookMetadata,
  title = 'Nuevo capitulo',
): Promise<{ metadata: BookMetadata; chapter: ChapterDocument }> {
  const id = getNextChapterId(metadata.chapterOrder);
  const now = getNowIso();

  const chapter: ChapterDocument = {
    id,
    title,
    content: '<p></p>',
    contentJson: null,
    createdAt: now,
    updatedAt: now,
  };

  const nextMetadata: BookMetadata = {
    ...metadata,
    chapterOrder: [...metadata.chapterOrder, id],
    updatedAt: now,
  };

  await writeJson(chapterFilePath(bookPath, id), chapter);
  await saveBookMetadata(bookPath, nextMetadata);

  return {
    metadata: nextMetadata,
    chapter,
  };
}

export async function duplicateChapter(
  bookPath: string,
  metadata: BookMetadata,
  sourceChapter: ChapterDocument,
): Promise<{ metadata: BookMetadata; chapter: ChapterDocument }> {
  const id = getNextChapterId(metadata.chapterOrder);
  const now = getNowIso();

  const chapter: ChapterDocument = ensureChapterDocument({
    ...sourceChapter,
    id,
    title: `${sourceChapter.title} copia`,
    createdAt: now,
    updatedAt: now,
  });

  const nextMetadata: BookMetadata = {
    ...metadata,
    chapterOrder: [...metadata.chapterOrder, id],
    updatedAt: now,
  };

  await writeJson(chapterFilePath(bookPath, id), chapter);
  await saveBookMetadata(bookPath, nextMetadata);

  return {
    metadata: nextMetadata,
    chapter,
  };
}

export async function renameChapter(
  bookPath: string,
  chapter: ChapterDocument,
  nextTitle: string,
): Promise<ChapterDocument> {
  const nextChapter: ChapterDocument = ensureChapterDocument({
    ...chapter,
    title: nextTitle,
    updatedAt: getNowIso(),
  });

  await writeJson(chapterFilePath(bookPath, chapter.id), nextChapter);
  return nextChapter;
}

export async function deleteChapter(
  bookPath: string,
  metadata: BookMetadata,
  chapterId: string,
): Promise<BookMetadata> {
  const chapterPath = chapterFilePath(bookPath, chapterId);
  if (await exists(chapterPath)) {
    await remove(chapterPath);
  }

  const nextOrder = metadata.chapterOrder.filter((item) => item !== chapterId);
  const nextChats = {
    ...metadata.chats,
    chapters: { ...metadata.chats.chapters },
  };
  delete nextChats.chapters[chapterId];

  const nextMetadata: BookMetadata = {
    ...metadata,
    chapterOrder: nextOrder,
    chats: nextChats,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

export async function moveChapter(
  bookPath: string,
  metadata: BookMetadata,
  chapterId: string,
  direction: 'up' | 'down',
): Promise<BookMetadata> {
  const index = metadata.chapterOrder.indexOf(chapterId);
  if (index < 0) {
    return metadata;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= metadata.chapterOrder.length) {
    return metadata;
  }

  const nextOrder = [...metadata.chapterOrder];
  const temp = nextOrder[index];
  nextOrder[index] = nextOrder[targetIndex];
  nextOrder[targetIndex] = temp;

  const nextMetadata: BookMetadata = {
    ...metadata,
    chapterOrder: nextOrder,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

export async function saveChapterSnapshot(
  bookPath: string,
  chapter: ChapterDocument,
  reason: string,
): Promise<ChapterSnapshot> {
  const versionsPath = versionsDirPath(bookPath);
  await mkdir(versionsPath, { recursive: true });

  const entries = await readDir(versionsPath);
  const versions = entries
    .filter((entry) => entry.isFile)
    .map((entry) => parseVersion(entry.name, chapter.id))
    .filter((value) => value > 0);

  const nextVersion = versions.length > 0 ? Math.max(...versions) + 1 : 1;

  const snapshot: ChapterSnapshot = {
    version: nextVersion,
    chapterId: chapter.id,
    reason,
    createdAt: getNowIso(),
    chapter,
  };

  const fileName = `${chapter.id}_v${nextVersion}.json`;
  await writeJson(joinPath(versionsPath, fileName), snapshot);
  return snapshot;
}

export async function restoreLastSnapshot(
  bookPath: string,
  chapterId: string,
): Promise<ChapterDocument | null> {
  const versionsPath = versionsDirPath(bookPath);
  if (!(await exists(versionsPath))) {
    return null;
  }

  const entries = await readDir(versionsPath);
  const versionFileNames = entries
    .filter((entry) => entry.isFile)
    .map((entry) => entry.name)
    .filter((fileName) => parseVersion(fileName, chapterId) > 0)
    .sort((a, b) => parseVersion(a, chapterId) - parseVersion(b, chapterId));

  if (versionFileNames.length === 0) {
    return null;
  }

  const latestFileName = versionFileNames[versionFileNames.length - 1];
  const snapshot = await readJson<ChapterSnapshot>(joinPath(versionsPath, latestFileName));

  const restored: ChapterDocument = ensureChapterDocument({
    ...snapshot.chapter,
    updatedAt: getNowIso(),
  });

  await saveChapter(bookPath, restored);
  return restored;
}

export async function setCoverImage(
  bookPath: string,
  metadata: BookMetadata,
  sourceImagePath: string,
): Promise<BookMetadata> {
  const extensionMatch = sourceImagePath.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'png';
  const safeExtension = safeFileName(extension) || 'png';

  const relativeTarget = joinPath(ASSETS_DIR, `cover.${safeExtension}`);
  const absoluteTarget = joinPath(bookPath, relativeTarget);

  await mkdir(joinPath(bookPath, ASSETS_DIR), { recursive: true });
  await copyFile(normalizePath(sourceImagePath), absoluteTarget);

  const nextMetadata: BookMetadata = {
    ...metadata,
    coverImage: relativeTarget,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

export async function clearCoverImage(bookPath: string, metadata: BookMetadata): Promise<BookMetadata> {
  if (metadata.coverImage) {
    const absolute = joinPath(bookPath, metadata.coverImage);
    if (await exists(absolute)) {
      await remove(absolute);
    }
  }

  const nextMetadata: BookMetadata = {
    ...metadata,
    coverImage: null,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

export function getCoverAbsolutePath(bookPath: string, metadata: BookMetadata): string | null {
  if (!metadata.coverImage) {
    return null;
  }

  return joinPath(bookPath, metadata.coverImage);
}

export async function updateBookChats(
  bookPath: string,
  metadata: BookMetadata,
  chats: BookChats,
): Promise<BookMetadata> {
  const nextMetadata: BookMetadata = {
    ...metadata,
    chats,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

export async function writeMarkdownExport(
  bookPath: string,
  fileName: string,
  content: string,
): Promise<string> {
  const exportPath = exportsDirPath(bookPath);
  await mkdir(exportPath, { recursive: true });

  const safeName = safeFileName(fileName) || 'export.md';
  const absolutePath = joinPath(exportPath, safeName.endsWith('.md') ? safeName : `${safeName}.md`);
  await writeTextFile(absolutePath, content);
  return absolutePath;
}
