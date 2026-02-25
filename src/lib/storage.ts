import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

import { resolveChapterLengthPreset } from './chapterLength';
import { DEFAULT_APP_CONFIG } from './config';
import { normalizeLanguageCode } from './language';
import { getNowIso, joinPath, normalizePath, randomId, safeFileName, slugify } from './text';
import type {
  AppConfig,
  AmazonKdpData,
  BookStatus,
  BookChats,
  ChatMessage,
  BookFoundation,
  InteriorFormat,
  LibraryBookEntry,
  LibraryIndex,
  BookMetadata,
  BookProject,
  ChapterDocument,
  ChapterSnapshot,
} from '../types/book';

const BOOK_FILE = 'book.json';
const CHAPTERS_DIR = 'chapters';
const ASSETS_DIR = 'assets';
const VERSIONS_DIR = 'versions';
const CHATS_DIR = 'chats';
const EXPORTS_DIR = 'exports';
const CONFIG_FILE = 'config.json';
const LIBRARY_FILE = 'library.json';

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

export function buildDefaultAmazon(bookTitle: string, author: string): AmazonKdpData {
  return {
    presetType: 'non-fiction-reflexive',
    marketplace: 'Amazon.com',
    language: 'es',
    kdpTitle: bookTitle,
    subtitle: '',
    penName: author,
    seriesName: '',
    edition: '1',
    contributors: [],
    ownCopyright: true,
    isAdultContent: false,
    isbn: '',
    enableDRM: false,
    enrollKDPSelect: false,
    ebookRoyaltyPlan: 70,
    printCostEstimate: 3.5,
    marketPricing: [
      { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 4.99, printPrice: 12.99 },
      { marketplace: 'Amazon.es', currency: 'EUR', ebookPrice: 4.99, printPrice: 12.99 },
      { marketplace: 'Amazon.com.mx', currency: 'MXN', ebookPrice: 89, printPrice: 249 },
    ],
    keywords: ['', '', '', '', '', '', ''],
    categories: [
      'Libros > Literatura y ficcion > Ensayos',
      'Libros > Salud familia y desarrollo personal > Escritura',
      'Libros > Negocios y dinero > Productividad',
    ],
    backCoverText: '',
    longDescription: '',
    authorBio: '',
    kdpNotes: '',
  };
}

function ensureAmazonKeywords(values: unknown): string[] {
  const source = Array.isArray(values) ? values : [];
  const normalized = source.map((value) => String(value ?? '').trim());
  while (normalized.length < 7) {
    normalized.push('');
  }
  return normalized.slice(0, 7);
}

function ensureAmazonCategories(values: unknown, defaults: string[]): string[] {
  const source = Array.isArray(values) ? values : [];
  const normalized = source
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
  return normalized.length > 0 ? normalized : defaults;
}

function ensureAmazonContributors(values: unknown): AmazonKdpData['contributors'] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: AmazonKdpData['contributors'] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as { role?: unknown; name?: unknown };
    const role = String(payload.role ?? '').trim() || 'Contribuidor';
    const name = String(payload.name ?? '').trim();
    if (!name) {
      continue;
    }

    normalized.push({ role, name });
  }

  return normalized;
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function ensureAmazonMarketPricing(values: unknown, defaults: AmazonKdpData['marketPricing']): AmazonKdpData['marketPricing'] {
  if (!Array.isArray(values)) {
    return defaults;
  }

  const normalized = values
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const payload = entry as {
        marketplace?: unknown;
        currency?: unknown;
        ebookPrice?: unknown;
        printPrice?: unknown;
      };

      const marketplace = String(payload.marketplace ?? '').trim();
      const currency = String(payload.currency ?? '').trim().toUpperCase();
      if (!marketplace || !currency) {
        return null;
      }

      return {
        marketplace,
        currency,
        ebookPrice: parseNullableNumber(payload.ebookPrice),
        printPrice: parseNullableNumber(payload.printPrice),
      };
    })
    .filter((value): value is AmazonKdpData['marketPricing'][number] => Boolean(value));

  return normalized.length > 0 ? normalized : defaults;
}

function ensureAmazonData(
  amazon: AmazonKdpData | null | undefined,
  bookTitle: string,
  author: string,
): AmazonKdpData {
  const defaults = buildDefaultAmazon(bookTitle, author);
  if (!amazon) {
    return defaults;
  }

  return {
    ...defaults,
    ...amazon,
    language: normalizeLanguageCode(amazon.language),
    contributors: ensureAmazonContributors(amazon.contributors),
    ownCopyright: amazon.ownCopyright ?? defaults.ownCopyright,
    isAdultContent: amazon.isAdultContent ?? defaults.isAdultContent,
    isbn: amazon.isbn ?? defaults.isbn,
    enableDRM: amazon.enableDRM ?? defaults.enableDRM,
    enrollKDPSelect: amazon.enrollKDPSelect ?? defaults.enrollKDPSelect,
    ebookRoyaltyPlan: amazon.ebookRoyaltyPlan === 35 || amazon.ebookRoyaltyPlan === 70 ? amazon.ebookRoyaltyPlan : defaults.ebookRoyaltyPlan,
    printCostEstimate: parseNullableNumber(amazon.printCostEstimate) ?? defaults.printCostEstimate,
    marketPricing: ensureAmazonMarketPricing(amazon.marketPricing, defaults.marketPricing),
    keywords: ensureAmazonKeywords(amazon.keywords),
    categories: ensureAmazonCategories(amazon.categories, defaults.categories),
  };
}

export function buildDefaultInteriorFormat(): InteriorFormat {
  return {
    trimSize: '6x9',
    pageWidthIn: 6,
    pageHeightIn: 9,
    marginTopMm: 18,
    marginBottomMm: 18,
    marginInsideMm: 20,
    marginOutsideMm: 16,
    paragraphIndentEm: 1.4,
    lineHeight: 1.55,
  };
}

export function buildDefaultLibraryIndex(): LibraryIndex {
  return {
    books: [],
    statusRules: {
      advancedChapterThreshold: 6,
    },
    updatedAt: getNowIso(),
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

function chatsDirPath(bookPath: string): string {
  return joinPath(bookPath, CHATS_DIR);
}

function bookChatFilePath(bookPath: string): string {
  return joinPath(chatsDirPath(bookPath), 'book.json');
}

function chapterChatFilePath(bookPath: string, chapterId: string): string {
  return joinPath(chatsDirPath(bookPath), `${chapterId}.json`);
}

function normalizeFolderPath(path: string): string {
  const normalized = normalizePath(path).trim();
  if (!normalized) {
    return normalized;
  }

  if (/^[a-zA-Z]:\/$/.test(normalized)) {
    return normalized;
  }

  return normalized.replace(/\/$/, '');
}

function sanitizeIncomingPath(path: string): string {
  let next = path.trim();
  if (!next) {
    return next;
  }

  next = next.replace(/^\\\\\?\\/, '').replace(/^\/\/\?\//, '');

  if (next.startsWith('file://')) {
    try {
      const uri = new URL(next);
      next = decodeURIComponent(uri.pathname);
      if (/^\/[a-zA-Z]:\//.test(next)) {
        next = next.slice(1);
      }
    } catch {
      next = next.replace(/^file:\/\//i, '');
    }
  }

  return next;
}

function isBookJsonPath(path: string): boolean {
  return /(^|\/)book\.json$/i.test(normalizePath(path));
}

function toBookFolderPath(path: string): string {
  return normalizePath(path).replace(/\/book\.json$/i, '');
}

function buildPathCandidates(path: string): string[] {
  const candidates = new Set<string>();
  const push = (value: string) => {
    const normalized = normalizeFolderPath(value);
    if (normalized) {
      candidates.add(normalized);
    }
  };

  const sanitized = sanitizeIncomingPath(path);

  push(path);
  push(sanitized);
  push(normalizePath(path));
  push(normalizePath(sanitized));

  if (isBookJsonPath(path)) {
    push(toBookFolderPath(path));
  }

  if (isBookJsonPath(sanitized)) {
    push(toBookFolderPath(sanitized));
  }

  return Array.from(candidates);
}

async function collectNestedBookCandidates(
  basePath: string,
  maxDepth = 3,
  maxDirectories = 400,
): Promise<string[]> {
  const found = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: basePath, depth: 0 }];
  let scanned = 0;

  while (queue.length > 0 && scanned < maxDirectories) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (current.depth > maxDepth || visited.has(current.path)) {
      continue;
    }

    visited.add(current.path);
    scanned += 1;

    let entries: Awaited<ReturnType<typeof readDir>>;
    try {
      entries = await readDir(current.path);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory) {
        continue;
      }

      const childPath = normalizeFolderPath(joinPath(current.path, entry.name));
      if (!childPath || visited.has(childPath)) {
        continue;
      }

      if ((await exists(bookFilePath(childPath))) || (await isBookScaffoldDirectory(childPath))) {
        found.add(childPath);
      }

      if (current.depth < maxDepth) {
        queue.push({ path: childPath, depth: current.depth + 1 });
      }
    }
  }

  return Array.from(found);
}

async function libraryFilePath(): Promise<string> {
  const libraryRoot = normalizePath(await appDataDir());
  await mkdir(libraryRoot, { recursive: true });
  return joinPath(libraryRoot, LIBRARY_FILE);
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

function stripHtmlForMetrics(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(html: string): number {
  const plain = stripHtmlForMetrics(html);
  if (!plain) {
    return 0;
  }
  return plain.split(/\s+/).filter(Boolean).length;
}

function normalizeChatRole(value: unknown): ChatMessage['role'] {
  return value === 'assistant' ? 'assistant' : 'user';
}

function normalizeChatScope(value: unknown, fallbackScope: ChatMessage['scope']): ChatMessage['scope'] {
  return value === 'book' || value === 'chapter' ? value : fallbackScope;
}

function ensureChatMessages(values: unknown, fallbackScope: ChatMessage['scope']): ChatMessage[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const messages: ChatMessage[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<ChatMessage>;
    const content = String(payload.content ?? '').trim();
    if (!content) {
      continue;
    }

    messages.push({
      id: typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomId('msg'),
      role: normalizeChatRole(payload.role),
      scope: normalizeChatScope(payload.scope, fallbackScope),
      content,
      createdAt:
        typeof payload.createdAt === 'string' && payload.createdAt.trim()
          ? payload.createdAt.trim()
          : getNowIso(),
    });
  }

  return messages;
}

function ensureBookChats(chats: unknown): BookChats {
  if (!chats || typeof chats !== 'object') {
    return buildDefaultChats();
  }

  const payload = chats as { book?: unknown; chapters?: unknown };
  const normalized: BookChats = {
    book: ensureChatMessages(payload.book, 'book'),
    chapters: {},
  };

  if (payload.chapters && typeof payload.chapters === 'object' && !Array.isArray(payload.chapters)) {
    for (const [chapterId, chapterMessages] of Object.entries(payload.chapters as Record<string, unknown>)) {
      const safeChapterId = chapterId.trim();
      if (!safeChapterId) {
        continue;
      }
      normalized.chapters[safeChapterId] = ensureChatMessages(chapterMessages, 'chapter');
    }
  }

  return normalized;
}

function stripChatsFromMetadata(metadata: BookMetadata): Omit<BookMetadata, 'chats'> {
  const payload = { ...metadata } as Partial<BookMetadata>;
  delete payload.chats;
  return payload as Omit<BookMetadata, 'chats'>;
}

async function loadChatsFromDisk(
  bookPath: string,
  chapterOrder: string[],
  legacyChats: unknown,
): Promise<BookChats> {
  const fallback = ensureBookChats(legacyChats);
  const result: BookChats = {
    book: [...fallback.book],
    chapters: { ...fallback.chapters },
  };

  const chatsDirectory = chatsDirPath(bookPath);
  if (!(await exists(chatsDirectory))) {
    return result;
  }

  const bookChatPath = bookChatFilePath(bookPath);
  if (await exists(bookChatPath)) {
    try {
      const loadedBookMessages = await readJson<unknown>(bookChatPath);
      result.book = ensureChatMessages(loadedBookMessages, 'book');
    } catch {
      // Mantiene fallback legado.
    }
  }

  const knownChapterIds = new Set<string>([...chapterOrder, ...Object.keys(result.chapters)]);
  for (const chapterId of knownChapterIds) {
    const chapterPath = chapterChatFilePath(bookPath, chapterId);
    if (!(await exists(chapterPath))) {
      continue;
    }

    try {
      const loadedChapterMessages = await readJson<unknown>(chapterPath);
      result.chapters[chapterId] = ensureChatMessages(loadedChapterMessages, 'chapter');
    } catch {
      // Mantiene fallback legado.
    }
  }

  try {
    const entries = await readDir(chatsDirectory);
    for (const entry of entries) {
      if (!entry.isFile || !entry.name.toLowerCase().endsWith('.json')) {
        continue;
      }

      if (entry.name.toLowerCase() === 'book.json') {
        continue;
      }

      const chapterId = entry.name.replace(/\.json$/i, '').trim();
      if (!chapterId || knownChapterIds.has(chapterId)) {
        continue;
      }

      try {
        const loadedChapterMessages = await readJson<unknown>(joinPath(chatsDirectory, entry.name));
        result.chapters[chapterId] = ensureChatMessages(loadedChapterMessages, 'chapter');
      } catch {
        // Ignora archivos de chat corruptos.
      }
    }
  } catch {
    // Ignora errores de lectura de carpeta chats.
  }

  return result;
}

async function saveChatsToDisk(bookPath: string, chats: BookChats): Promise<BookChats> {
  const normalizedChats = ensureBookChats(chats);
  const chatsDirectory = chatsDirPath(bookPath);
  await mkdir(chatsDirectory, { recursive: true });

  await writeJson(bookChatFilePath(bookPath), normalizedChats.book);

  const chapterIds = Object.keys(normalizedChats.chapters);
  for (const chapterId of chapterIds) {
    await writeJson(chapterChatFilePath(bookPath, chapterId), normalizedChats.chapters[chapterId]);
  }

  try {
    const entries = await readDir(chatsDirectory);
    for (const entry of entries) {
      if (!entry.isFile || !entry.name.toLowerCase().endsWith('.json')) {
        continue;
      }

      if (entry.name.toLowerCase() === 'book.json') {
        continue;
      }

      const chapterId = entry.name.replace(/\.json$/i, '').trim();
      if (!chapterId || chapterIds.includes(chapterId)) {
        continue;
      }

      await remove(joinPath(chatsDirectory, entry.name));
    }
  } catch {
    // Ignora limpieza fallida de chats obsoletos.
  }

  return normalizedChats;
}

function deriveBookStatus(
  metadata: BookMetadata,
  chapterCount: number,
  statusRules: LibraryIndex['statusRules'],
): BookStatus {
  if (metadata.isPublished) {
    return 'publicado';
  }

  return chapterCount >= statusRules.advancedChapterThreshold ? 'avanzado' : 'recien_creado';
}

function ensureChapterDocument(chapter: ChapterDocument): ChapterDocument {
  return {
    ...chapter,
    // Persistimos HTML como fuente de verdad para reducir peso en disco.
    contentJson: null,
    lengthPreset: resolveChapterLengthPreset(chapter.lengthPreset),
  };
}

function inferTitleFromBookPath(bookPath: string): string {
  const parts = normalizeFolderPath(bookPath).split('/').filter(Boolean);
  const folder = parts[parts.length - 1] ?? 'mi-libro';
  const title = folder.replace(/[-_]+/g, ' ').trim();
  return title || 'Mi libro';
}

function chapterSortValue(chapterId: string): number {
  const numeric = Number.parseInt(chapterId, 10);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function sortChapterIds(chapterIds: string[]): string[] {
  return chapterIds.sort((a, b) => {
    const aValue = chapterSortValue(a);
    const bValue = chapterSortValue(b);
    if (aValue !== bValue) {
      return aValue - bValue;
    }
    return a.localeCompare(b);
  });
}

function chapterDisplayTitle(chapterId: string, index: number): string {
  const numeric = Number.parseInt(chapterId, 10);
  return Number.isFinite(numeric) ? `Capitulo ${numeric}` : `Capitulo ${index + 1}`;
}

function buildDefaultChapterDocument(chapterId: string, index: number, now: string): ChapterDocument {
  return {
    id: chapterId,
    title: chapterDisplayTitle(chapterId, index),
    content: '<p>Escribe aqui...</p>',
    contentJson: null,
    lengthPreset: 'media',
    createdAt: now,
    updatedAt: now,
  };
}

function buildInitialBookMetadata(
  title: string,
  author: string,
  chapterOrder: string[],
  now: string,
): BookMetadata {
  return {
    title,
    author,
    chapterOrder,
    coverImage: null,
    backCoverImage: null,
    spineText: title,
    foundation: buildDefaultFoundation(),
    amazon: buildDefaultAmazon(title, author),
    interiorFormat: buildDefaultInteriorFormat(),
    isPublished: false,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    chats: buildDefaultChats(),
  };
}

async function inferChapterIdsFromDisk(bookPath: string): Promise<string[]> {
  const chaptersPath = joinPath(bookPath, CHAPTERS_DIR);
  if (!(await exists(chaptersPath))) {
    return [];
  }

  const entries = await readDir(chaptersPath);
  const chapterIds = entries
    .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name.replace(/\.json$/i, '').trim())
    .filter(Boolean);

  return sortChapterIds(Array.from(new Set(chapterIds)));
}

async function ensureBookProjectFiles(
  bookPath: string,
  defaults?: { title?: string; author?: string },
): Promise<{ metadata: BookMetadata; chapters: Record<string, ChapterDocument> }> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const now = getNowIso();

  await mkdir(normalizedBookPath, { recursive: true });
  await mkdir(joinPath(normalizedBookPath, CHAPTERS_DIR), { recursive: true });
  await mkdir(joinPath(normalizedBookPath, ASSETS_DIR), { recursive: true });
  await mkdir(joinPath(normalizedBookPath, VERSIONS_DIR), { recursive: true });
  await mkdir(joinPath(normalizedBookPath, CHATS_DIR), { recursive: true });

  const chapterIdsFromDisk = await inferChapterIdsFromDisk(normalizedBookPath);
  const titleFromPath = inferTitleFromBookPath(normalizedBookPath);
  const defaultTitle = defaults?.title?.trim() || titleFromPath;
  const defaultAuthor = defaults?.author?.trim() || 'Autor';

  let metadata: BookMetadata;
  if (await exists(bookFilePath(normalizedBookPath))) {
    try {
      metadata = ensureBookMetadata(await readJson<BookMetadata>(bookFilePath(normalizedBookPath)));
    } catch {
      const fallbackOrder = chapterIdsFromDisk.length > 0 ? chapterIdsFromDisk : ['01'];
      metadata = buildInitialBookMetadata(defaultTitle, defaultAuthor, fallbackOrder, now);
    }
  } else {
    const initialOrder = chapterIdsFromDisk.length > 0 ? chapterIdsFromDisk : ['01'];
    metadata = buildInitialBookMetadata(defaultTitle, defaultAuthor, initialOrder, now);
  }

  const mergedOrder = metadata.chapterOrder.length > 0 ? metadata.chapterOrder : chapterIdsFromDisk;
  const normalizedOrder = sortChapterIds(Array.from(new Set(mergedOrder.length > 0 ? mergedOrder : ['01'])));
  const normalizedTitle = metadata.title?.trim() || defaultTitle;
  const normalizedAuthor = metadata.author?.trim() || defaultAuthor;

  metadata = ensureBookMetadata({
    ...metadata,
    title: normalizedTitle,
    author: normalizedAuthor,
    chapterOrder: normalizedOrder,
    spineText: metadata.spineText?.trim() || normalizedTitle,
  });

  const chapters: Record<string, ChapterDocument> = {};
  for (const [index, chapterId] of metadata.chapterOrder.entries()) {
    const chapterPath = chapterFilePath(normalizedBookPath, chapterId);
    let chapter: ChapterDocument;

    if (await exists(chapterPath)) {
      try {
        const loaded = ensureChapterDocument(await readJson<ChapterDocument>(chapterPath));
        chapter = {
          ...loaded,
          id: loaded.id?.trim() || chapterId,
          title: loaded.title?.trim() || chapterDisplayTitle(chapterId, index),
          content: loaded.content ?? '<p>Escribe aqui...</p>',
          createdAt: loaded.createdAt ?? now,
          updatedAt: loaded.updatedAt ?? loaded.createdAt ?? now,
          contentJson: loaded.contentJson ?? null,
        };
      } catch {
        chapter = buildDefaultChapterDocument(chapterId, index, now);
      }
    } else {
      chapter = buildDefaultChapterDocument(chapterId, index, now);
    }

    chapters[chapterId] = chapter;
    await writeJson(chapterPath, chapter);
  }

  const loadedChats = await loadChatsFromDisk(
    normalizedBookPath,
    metadata.chapterOrder,
    metadata.chats,
  );
  metadata = {
    ...metadata,
    chats: loadedChats,
  };

  await saveChatsToDisk(normalizedBookPath, loadedChats);
  await writeJson(bookFilePath(normalizedBookPath), stripChatsFromMetadata(metadata));
  if (!(await exists(configFilePath(normalizedBookPath)))) {
    await writeJson(configFilePath(normalizedBookPath), DEFAULT_APP_CONFIG);
  }

  return { metadata, chapters };
}

async function isBookScaffoldDirectory(path: string): Promise<boolean> {
  const normalized = normalizeFolderPath(path);
  const hasChapters = await exists(joinPath(normalized, CHAPTERS_DIR));
  const hasAssets = await exists(joinPath(normalized, ASSETS_DIR));
  const hasVersions = await exists(joinPath(normalized, VERSIONS_DIR));
  return hasChapters && hasAssets && hasVersions;
}

async function resolveCreationPath(parentPath: string, baseFolderName: string): Promise<{ path: string; reused: boolean }> {
  const preferredPath = joinPath(parentPath, baseFolderName);
  if (!(await exists(preferredPath))) {
    return { path: preferredPath, reused: false };
  }

  if ((await exists(bookFilePath(preferredPath))) || (await isBookScaffoldDirectory(preferredPath))) {
    return { path: preferredPath, reused: true };
  }

  let suffix = 2;
  let candidatePath = joinPath(parentPath, `${baseFolderName}-${suffix}`);
  while (await exists(candidatePath)) {
    suffix += 1;
    candidatePath = joinPath(parentPath, `${baseFolderName}-${suffix}`);
  }

  return { path: candidatePath, reused: false };
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
    chats: ensureBookChats(metadata.chats),
    coverImage: metadata.coverImage ?? null,
    backCoverImage: metadata.backCoverImage ?? null,
    spineText: metadata.spineText ?? metadata.title ?? '',
    foundation: metadata.foundation ?? buildDefaultFoundation(),
    amazon: ensureAmazonData(metadata.amazon, metadata.title, metadata.author),
    interiorFormat: metadata.interiorFormat ?? buildDefaultInteriorFormat(),
    isPublished: metadata.isPublished ?? false,
    publishedAt: metadata.publishedAt ?? null,
  };
}

function formatStorageError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const payload = error as { message?: unknown; code?: unknown; name?: unknown };
    const details: string[] = [];

    if (typeof payload.name === 'string' && payload.name.trim()) {
      details.push(payload.name.trim());
    }

    if (typeof payload.code === 'string' || typeof payload.code === 'number') {
      details.push(`code=${String(payload.code)}`);
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      details.push(payload.message.trim());
    }

    if (details.length > 0) {
      return details.join(' | ');
    }
  }

  return 'Error de acceso a archivos.';
}

export async function loadAppConfig(bookPath: string): Promise<AppConfig> {
  const normalizedBookPath = normalizePath(bookPath);
  const targetConfigPath = configFilePath(normalizedBookPath);

  await mkdir(normalizedBookPath, { recursive: true });

  let bookLanguageHint = DEFAULT_APP_CONFIG.language;
  const targetBookPath = bookFilePath(normalizedBookPath);
  if (await exists(targetBookPath)) {
    try {
      const metadata = await readJson<Partial<BookMetadata> & { amazon?: Partial<AmazonKdpData> }>(
        targetBookPath,
      );
      const amazonLanguage = metadata.amazon?.language;
      if (typeof amazonLanguage === 'string' && amazonLanguage.trim()) {
        bookLanguageHint = normalizeLanguageCode(amazonLanguage);
      }
    } catch {
      // Ignora book.json corrupto para no bloquear carga de config.
    }
  }

  if (!(await exists(targetConfigPath))) {
    const createdConfig: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      language: bookLanguageHint,
    };
    await writeJson(targetConfigPath, createdConfig);
    return createdConfig;
  }

  const loaded = await readJson<Partial<AppConfig>>(targetConfigPath);
  const hasExplicitLanguage = typeof loaded.language === 'string' && loaded.language.trim().length > 0;
  return {
    ...DEFAULT_APP_CONFIG,
    ...loaded,
    language: hasExplicitLanguage
      ? normalizeLanguageCode(loaded.language)
      : bookLanguageHint,
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
  const normalizedTitle = title.trim() || 'Mi libro';
  const normalizedAuthor = author.trim() || 'Autor';
  const folderName = slugify(normalizedTitle) || `book-${Date.now()}`;
  const parentPath = normalizeFolderPath(sanitizeIncomingPath(parentDirectory));
  const { path: projectPath } = await resolveCreationPath(parentPath, folderName);
  await mkdir(projectPath, { recursive: true });
  const ensured = await ensureBookProjectFiles(projectPath, {
    title: normalizedTitle,
    author: normalizedAuthor,
  });

  return {
    path: projectPath,
    metadata: ensured.metadata,
    chapters: ensured.chapters,
  };
}

export async function resolveBookDirectory(path: string): Promise<string> {
  const pathCandidates = buildPathCandidates(path);
  const candidateBooks = new Set<string>();
  let firstAccessError: string | null = null;

  for (const candidatePath of pathCandidates) {
    try {
      if ((await exists(bookFilePath(candidatePath))) || (await isBookScaffoldDirectory(candidatePath))) {
        return candidatePath;
      }
    } catch (error) {
      if (!firstAccessError) {
        firstAccessError = `${candidatePath}: ${formatStorageError(error)}`;
      }
    }
  }

  for (const candidatePath of pathCandidates) {
    let entries: Awaited<ReturnType<typeof readDir>>;
    try {
      entries = await readDir(candidatePath);
    } catch (error) {
      if (!firstAccessError) {
        firstAccessError = `${candidatePath}: ${formatStorageError(error)}`;
      }
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory) {
        continue;
      }

      const nestedPath = normalizeFolderPath(joinPath(candidatePath, entry.name));
      try {
        if ((await exists(bookFilePath(nestedPath))) || (await isBookScaffoldDirectory(nestedPath))) {
          candidateBooks.add(nestedPath);
        }
      } catch (error) {
        if (!firstAccessError) {
          firstAccessError = `${nestedPath}: ${formatStorageError(error)}`;
        }
      }
    }

    try {
      const deepCandidates = await collectNestedBookCandidates(candidatePath, 3, 600);
      for (const deepCandidate of deepCandidates) {
        candidateBooks.add(deepCandidate);
      }
    } catch (error) {
      if (!firstAccessError) {
        firstAccessError = `${candidatePath}: ${formatStorageError(error)}`;
      }
    }
  }

  if (candidateBooks.size === 1) {
    return Array.from(candidateBooks)[0];
  }

  if (candidateBooks.size > 1) {
    const withDate: Array<{ path: string; updatedAt: string }> = [];
    for (const candidate of candidateBooks) {
      try {
        const metadata = await readJson<Partial<BookMetadata>>(bookFilePath(candidate));
        withDate.push({
          path: candidate,
          updatedAt: metadata.updatedAt ?? metadata.createdAt ?? '',
        });
      } catch {
        withDate.push({
          path: candidate,
          updatedAt: '',
        });
      }
    }

    withDate.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return withDate[0].path;
  }

  if (firstAccessError) {
    throw new Error(`No se pudo acceder a la carpeta seleccionada (${firstAccessError}).`);
  }

  throw new Error(
    'No se encontro book.json en la carpeta seleccionada. Elegi la carpeta del libro (la que contiene chapters, assets y versions).',
  );
}

export async function loadBookProject(path: string): Promise<BookProject> {
  const projectPath = await resolveBookDirectory(path);
  const ensured = await ensureBookProjectFiles(projectPath);

  return {
    path: projectPath,
    metadata: ensured.metadata,
    chapters: ensured.chapters,
  };
}

export async function saveBookMetadata(
  bookPath: string,
  metadata: BookMetadata,
): Promise<BookMetadata> {
  const nextMetadata: BookMetadata = {
    ...metadata,
    updatedAt: getNowIso(),
    chats: ensureBookChats(metadata.chats),
    foundation: metadata.foundation ?? buildDefaultFoundation(),
    amazon: ensureAmazonData(metadata.amazon, metadata.title, metadata.author),
    backCoverImage: metadata.backCoverImage ?? null,
    spineText: metadata.spineText ?? metadata.title,
    interiorFormat: metadata.interiorFormat ?? buildDefaultInteriorFormat(),
    isPublished: metadata.isPublished ?? false,
    publishedAt: metadata.publishedAt ?? null,
  };

  await writeJson(bookFilePath(bookPath), stripChatsFromMetadata(nextMetadata));
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
    lengthPreset: 'media',
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
  const currentChats = ensureBookChats(metadata.chats);
  const nextChats = {
    ...currentChats,
    chapters: { ...currentChats.chapters },
  };
  delete nextChats.chapters[chapterId];

  const nextMetadata: BookMetadata = {
    ...metadata,
    chapterOrder: nextOrder,
    chats: nextChats,
    updatedAt: getNowIso(),
  };

  await saveChatsToDisk(bookPath, nextChats);
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
    chapter: {
      ...chapter,
      // Guarda snapshot liviano: HTML como fuente de restauracion y JSON opcional en null.
      contentJson: null,
    },
  };

  const fileName = `${chapter.id}_v${nextVersion}.json`;
  await writeJson(joinPath(versionsPath, fileName), snapshot);
  return snapshot;
}

export async function listChapterSnapshots(
  bookPath: string,
  chapterId: string,
): Promise<ChapterSnapshot[]> {
  const versionsPath = versionsDirPath(bookPath);
  if (!(await exists(versionsPath))) {
    return [];
  }

  const entries = await readDir(versionsPath);
  const versionFileNames = entries
    .filter((entry) => entry.isFile)
    .map((entry) => entry.name)
    .filter((fileName) => parseVersion(fileName, chapterId) > 0)
    .sort((a, b) => parseVersion(a, chapterId) - parseVersion(b, chapterId));

  const snapshots: ChapterSnapshot[] = [];
  for (const fileName of versionFileNames) {
    try {
      const snapshot = await readJson<ChapterSnapshot>(joinPath(versionsPath, fileName));
      snapshots.push(snapshot);
    } catch {
      // Ignora snapshots corruptos y sigue con los demas.
    }
  }

  return snapshots;
}

export async function restoreLastSnapshot(
  bookPath: string,
  chapterId: string,
): Promise<ChapterDocument | null> {
  const snapshots = await listChapterSnapshots(bookPath, chapterId);
  if (snapshots.length === 0) {
    return null;
  }

  const snapshot = snapshots[snapshots.length - 1];

  const restored: ChapterDocument = ensureChapterDocument({
    ...snapshot.chapter,
    updatedAt: getNowIso(),
  });

  await saveChapter(bookPath, restored);
  return restored;
}

async function setBookImage(
  bookPath: string,
  metadata: BookMetadata,
  sourceImagePath: string,
  targetName: 'cover' | 'back-cover',
  field: 'coverImage' | 'backCoverImage',
): Promise<BookMetadata> {
  const extensionMatch = sourceImagePath.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'png';
  const safeExtension = safeFileName(extension) || 'png';

  const relativeTarget = joinPath(ASSETS_DIR, `${targetName}.${safeExtension}`);
  const absoluteTarget = joinPath(bookPath, relativeTarget);

  await mkdir(joinPath(bookPath, ASSETS_DIR), { recursive: true });
  await copyFile(normalizePath(sourceImagePath), absoluteTarget);

  const nextMetadata: BookMetadata = {
    ...metadata,
    [field]: relativeTarget,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

async function clearBookImage(
  bookPath: string,
  metadata: BookMetadata,
  field: 'coverImage' | 'backCoverImage',
): Promise<BookMetadata> {
  const value = metadata[field];
  if (value) {
    const absolute = joinPath(bookPath, value);
    if (await exists(absolute)) {
      await remove(absolute);
    }
  }

  const nextMetadata: BookMetadata = {
    ...metadata,
    [field]: null,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

export async function setCoverImage(
  bookPath: string,
  metadata: BookMetadata,
  sourceImagePath: string,
): Promise<BookMetadata> {
  return setBookImage(bookPath, metadata, sourceImagePath, 'cover', 'coverImage');
}

export async function setBackCoverImage(
  bookPath: string,
  metadata: BookMetadata,
  sourceImagePath: string,
): Promise<BookMetadata> {
  return setBookImage(bookPath, metadata, sourceImagePath, 'back-cover', 'backCoverImage');
}

export async function clearCoverImage(bookPath: string, metadata: BookMetadata): Promise<BookMetadata> {
  return clearBookImage(bookPath, metadata, 'coverImage');
}

export async function clearBackCoverImage(bookPath: string, metadata: BookMetadata): Promise<BookMetadata> {
  return clearBookImage(bookPath, metadata, 'backCoverImage');
}

export function getCoverAbsolutePath(bookPath: string, metadata: BookMetadata): string | null {
  if (!metadata.coverImage) {
    return null;
  }

  return joinPath(bookPath, metadata.coverImage);
}

export function getBackCoverAbsolutePath(bookPath: string, metadata: BookMetadata): string | null {
  if (!metadata.backCoverImage) {
    return null;
  }

  return joinPath(bookPath, metadata.backCoverImage);
}

export async function updateBookChats(
  bookPath: string,
  metadata: BookMetadata,
  chats: BookChats,
): Promise<BookMetadata> {
  const normalizedChats = await saveChatsToDisk(bookPath, chats);
  const nextMetadata: BookMetadata = {
    ...metadata,
    chats: normalizedChats,
    updatedAt: getNowIso(),
  };

  await saveBookMetadata(bookPath, nextMetadata);
  return nextMetadata;
}

function sanitizeExportFileName(fileName: string, fallbackExtension: string): string {
  const trimmed = fileName.trim();
  const extensionMatch = trimmed.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1] ? extensionMatch[1].toLowerCase() : fallbackExtension;
  const nameWithoutExtension = extensionMatch
    ? trimmed.slice(0, trimmed.length - extensionMatch[0].length)
    : trimmed;
  const safeBase = safeFileName(nameWithoutExtension) || 'export';
  const safeExtension = safeFileName(extension) || fallbackExtension;
  return `${safeBase}.${safeExtension}`;
}

export async function writeTextExport(
  bookPath: string,
  fileName: string,
  content: string,
  fallbackExtension = 'txt',
): Promise<string> {
  const exportPath = exportsDirPath(bookPath);
  await mkdir(exportPath, { recursive: true });

  const safeName = sanitizeExportFileName(fileName, fallbackExtension);
  const absolutePath = joinPath(exportPath, safeName);
  await writeTextFile(absolutePath, content);
  return absolutePath;
}

export async function writeMarkdownExport(
  bookPath: string,
  fileName: string,
  content: string,
): Promise<string> {
  return writeTextExport(bookPath, fileName, content, 'md');
}

export async function loadLibraryIndex(): Promise<LibraryIndex> {
  const path = await libraryFilePath();
  if (!(await exists(path))) {
    const defaults = buildDefaultLibraryIndex();
    await writeJson(path, defaults);
    return defaults;
  }

  const loaded = await readJson<Partial<LibraryIndex>>(path);
  return {
    ...buildDefaultLibraryIndex(),
    ...loaded,
    books: loaded.books ?? [],
    statusRules: {
      ...buildDefaultLibraryIndex().statusRules,
      ...(loaded.statusRules ?? {}),
    },
  };
}

export async function saveLibraryIndex(index: LibraryIndex): Promise<void> {
  const path = await libraryFilePath();
  const next: LibraryIndex = {
    ...index,
    updatedAt: getNowIso(),
  };
  await writeJson(path, next);
}

export async function upsertBookInLibrary(
  project: BookProject,
  options?: { markOpened?: boolean },
): Promise<LibraryIndex> {
  const index = await loadLibraryIndex();
  const chapterCount = project.metadata.chapterOrder.length;
  const wordCount = project.metadata.chapterOrder.reduce((total, chapterId) => {
    const chapter = project.chapters[chapterId];
    if (!chapter) {
      return total;
    }
    return total + countWords(chapter.content);
  }, 0);
  const status = deriveBookStatus(project.metadata, chapterCount, index.statusRules);
  const now = getNowIso();

  const existing = index.books.find((entry) => entry.path === project.path);
  const nextEntry: LibraryBookEntry = {
    id: existing?.id ?? randomId('book'),
    path: project.path,
    title: project.metadata.title,
    author: project.metadata.author,
    status,
    chapterCount,
    wordCount,
    coverImage: project.metadata.coverImage,
    publishedAt: project.metadata.publishedAt,
    lastOpenedAt: options?.markOpened ? now : existing?.lastOpenedAt ?? now,
    updatedAt: now,
  };

  const nextBooks = [...index.books.filter((entry) => entry.path !== project.path), nextEntry].sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  );
  const nextIndex: LibraryIndex = {
    ...index,
    books: nextBooks,
    updatedAt: now,
  };
  await saveLibraryIndex(nextIndex);
  return nextIndex;
}

export async function removeBookFromLibrary(
  bookPath: string,
  options?: { deleteFiles?: boolean },
): Promise<LibraryIndex> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));

  if (options?.deleteFiles && (await exists(normalizedBookPath))) {
    const hasBookJson = await exists(bookFilePath(normalizedBookPath));
    const hasScaffold = await isBookScaffoldDirectory(normalizedBookPath);
    if (!hasBookJson && !hasScaffold) {
      throw new Error('La carpeta no parece un proyecto de libro valido. Se cancelo el borrado por seguridad.');
    }

    await remove(normalizedBookPath, { recursive: true });
  }

  const index = await loadLibraryIndex();
  const nextIndex: LibraryIndex = {
    ...index,
    books: index.books.filter((entry) => normalizeFolderPath(entry.path) !== normalizedBookPath),
    updatedAt: getNowIso(),
  };
  await saveLibraryIndex(nextIndex);
  return nextIndex;
}
