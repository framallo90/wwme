import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

import { resolveChapterLengthPreset } from './chapterLength';
import { normalizeCanonStatus } from './canon';
import { DEFAULT_APP_CONFIG } from './config';
import { normalizeLanguageCode } from './language';
import {
  getNowIso,
  joinPath,
  normalizePath,
  plainTextToHtml,
  randomId,
  safeFileName,
  slugify,
  splitAiOutputAndSummary,
  stripHtml,
} from './text';
import type {
  AppConfig,
  AmazonKdpData,
  BookStatus,
  BookChats,
  ChatMessage,
  BookFoundation,
  StoryBible,
  StoryCharacter,
  StoryLocation,
  InteriorFormat,
  LibraryBookEntry,
  LibraryIndex,
  LibrarySagaEntry,
  BookMetadata,
  BookProject,
  ChapterDocument,
  ChapterManuscriptNote,
  ChapterSnapshot,
  CollaborationPatch,
  EditorialChecklistCustomItem,
  PromptTemplate,
  SagaBookLink,
  SagaCharacter,
  SagaCharacterAlias,
  SagaCharacterAliasType,
  SagaCharacterLifecycle,
  SagaCharacterVersion,
  SagaCharacterStatus,
  SagaEntityKind,
  SagaEntityRef,
  SagaMetadata,
  SagaProject,
  SagaSecret,
  SagaTimelineArtifactTransfer,
  SagaTimelineLane,
  SagaTimelineChapterRef,
  SagaTimelineChapterRefMode,
  SagaTimelineCharacterImpact,
  SagaTimelineCharacterLocation,
  SagaTimelineEventCategory,
  SagaTimelineEvent,
  SagaTimelineEventKind,
  SagaTimelineImpactType,
  SagaTimelineSecretReveal,
  SagaTruthMode,
  SagaAtlasConfig,
  SagaAtlasLayer,
  SagaAtlasPin,
  SagaAtlasRouteMeasurement,
  SagaConlang,
  SagaConlangLexiconEntry,
  SagaMagicSystem,
  SagaWorldBible,
  SagaWorldRelationship,
  SagaWorldEntity,
} from '../types/book';

const BOOK_FILE = 'book.json';
const SAGA_FILE = 'saga.json';
const CHAPTERS_DIR = 'chapters';
const ASSETS_DIR = 'assets';
const VERSIONS_DIR = 'versions';
const CHATS_DIR = 'chats';
const EXPORTS_DIR = 'exports';
const AI_AUDIT_DIR = 'ai-audit';
const AI_TRANSACTIONS_DIR = 'ai-transactions';
const AI_TRANSACTIONS_PENDING_DIR = 'pending';
const AI_TRANSACTIONS_COMMITTED_DIR = 'committed';
const AI_TRANSACTIONS_RECOVERED_DIR = 'recovered';
const CONFIG_FILE = 'config.json';
const PROMPTS_FILE = 'prompts.json';
const LIBRARY_FILE = 'library.json';
const TRUST_METRICS_FILE = 'trust-metrics.json';
const CHAPTER_SNAPSHOT_RETENTION = 5;
type BookLanguageSource = Partial<BookMetadata> & {
  amazon?: Partial<AmazonKdpData>;
  language?: unknown;
};

export type AiTrustMetricIncident =
  | 'session_applied'
  | 'session_cancelled_safe_mode'
  | 'session_cancelled_risk'
  | 'session_rollback_manual'
  | 'book_auto_apply_blocked'
  | 'book_auto_apply_run'
  | 'transaction_started'
  | 'transaction_committed'
  | 'transaction_rolled_back'
  | 'transaction_recovered';

export interface AiTrustMetrics {
  version: 1;
  updatedAt: string;
  incidents: Record<AiTrustMetricIncident, number>;
}

export interface AiAuditChapterChange {
  chapterId: string;
  chapterTitle: string;
  beforeText: string;
  afterText: string;
}

export interface AiSessionAuditInput {
  sessionId: string;
  scope: 'chapter' | 'book';
  operation: string;
  status: 'applied' | 'cancelled' | 'rolled_back' | 'blocked';
  reason?: string;
  chapterChanges: AiAuditChapterChange[];
  metadata?: Record<string, unknown>;
}

interface AiTransactionChapterSnapshot {
  chapterId: string;
  chapter: ChapterDocument;
}

interface AiTransactionRecord {
  version: 1;
  transactionId: string;
  operation: string;
  scope: 'chapter' | 'book';
  status: 'pending' | 'committed' | 'rolled_back' | 'recovered';
  createdAt: string;
  updatedAt: string;
  chapterOrder: string[];
  snapshots: AiTransactionChapterSnapshot[];
  notes: string;
}

export interface AiTransactionRecoveryReport {
  recoveredTransactions: number;
  restoredChapters: number;
  transactionIds: string[];
}

export interface BackupSnapshotManifestItem {
  kind: 'book' | 'saga';
  sourcePath: string;
  targetRelativePath: string;
  copied: boolean;
  note?: string;
}

export interface BackupSnapshotManifest {
  version: 1;
  createdAt: string;
  sourceBookPath: string;
  linkedSagaPath: string | null;
  snapshotFolderName: string;
  items: BackupSnapshotManifestItem[];
}

export interface BackupSnapshotResult {
  targetPath: string;
  manifestPath: string;
  copiedSaga: boolean;
}

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

export function buildDefaultStoryBible(): StoryBible {
  return {
    characters: [],
    locations: [],
    continuityRules: '',
  };
}

export function buildDefaultSagaAtlas(): SagaAtlasConfig {
  return {
    mapImagePath: '',
    distanceScale: 100,
    distanceUnit: 'km',
    defaultTravelMode: 'Caballo',
    showGrid: true,
    layers: [
      {
        id: 'atlas-layer-main',
        name: 'Mapa principal',
        description: 'Pines canonicos del mapa principal.',
        color: '#1f5f8b',
        visible: true,
      },
    ],
    pins: [],
    routeMeasurements: [],
  };
}

export function buildDefaultSagaTimelineLanes(): SagaTimelineLane[] {
  return [
    {
      id: 'lane-main',
      label: 'Linea principal',
      color: '#1f5f8b',
      era: 'Presente',
      description: 'Eje principal de la saga.',
    },
    {
      id: 'lane-ancient',
      label: 'Historia antigua',
      color: '#8c6a2e',
      era: 'Pasado',
      description: 'Eventos fundacionales, guerras antiguas y origenes.',
    },
    {
      id: 'lane-flashback',
      label: 'Flashbacks',
      color: '#6b4e8f',
      era: 'Memoria',
      description: 'Recuerdos, versiones parciales y escenas retroactivas.',
    },
    {
      id: 'lane-future',
      label: 'Profecias / futuros',
      color: '#2f7c64',
      era: 'Futuro',
      description: 'Visiones, profecias y lineas potenciales.',
    },
  ];
}

export function buildDefaultSagaConlangs(): SagaConlang[] {
  return [];
}

export function buildDefaultSagaMagicSystems(): SagaMagicSystem[] {
  return [];
}

export function buildDefaultSagaWorldBible(): SagaWorldBible {
  return {
    overview: '',
    characters: [],
    locations: [],
    routes: [],
    flora: [],
    fauna: [],
    factions: [],
    systems: [],
    artifacts: [],
    secrets: [],
    relationships: [],
    timeline: [],
    timelineLanes: buildDefaultSagaTimelineLanes(),
    atlas: buildDefaultSagaAtlas(),
    conlangs: buildDefaultSagaConlangs(),
    magicSystems: buildDefaultSagaMagicSystems(),
    globalRules: '',
    pinnedAiRules: '',
    glossary: '',
  };
}

function buildInitialSagaMetadata(title: string, now: string, description = ''): SagaMetadata {
  return {
    id: randomId('saga'),
    title,
    description: description.trim(),
    strictValidationMode: false,
    books: [],
    worldBible: buildDefaultSagaWorldBible(),
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDefaultPromptTemplates(): PromptTemplate[] {
  const now = getNowIso();
  return [
    {
      id: randomId('prompt'),
      title: 'Desarrollar personaje secundario',
      content:
        'Desarrolla un personaje secundario con objetivo claro, conflicto interno y una escena breve de presentacion.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomId('prompt'),
      title: 'Crear dialogo tenso',
      content:
        'Escribe un dialogo tenso entre dos personajes con subtexto, silencios y cierre en suspenso.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomId('prompt'),
      title: 'Pulir ritmo narrativo',
      content:
        'Reescribe el fragmento para mejorar ritmo: alterna frases cortas/largas, reduce repeticiones y mantiene voz.',
      createdAt: now,
      updatedAt: now,
    },
  ];
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

function readAmazonLanguageHint(metadata: BookLanguageSource | null | undefined): string | null {
  if (!metadata) {
    return null;
  }

  const amazonLanguage = metadata.amazon?.language;
  if (typeof amazonLanguage === 'string' && amazonLanguage.trim()) {
    return normalizeLanguageCode(amazonLanguage);
  }

  return null;
}

function resolveBookLanguageHint(metadata: BookLanguageSource | null | undefined): string | null {
  const amazonLanguage = readAmazonLanguageHint(metadata);
  if (amazonLanguage) {
    return amazonLanguage;
  }

  if (!metadata) {
    return null;
  }

  const legacyLanguage = typeof metadata.language === 'string' ? metadata.language.trim() : '';
  if (!legacyLanguage) {
    return null;
  }

  return normalizeLanguageCode(legacyLanguage);
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
    dropCapEnabled: false,
    sceneBreakGlyph: '* * *',
    widowOrphanControl: true,
    chapterOpeningStyle: 'standard',
  };
}

function ensureInteriorFormat(value: InteriorFormat | null | undefined): InteriorFormat {
  const defaults = buildDefaultInteriorFormat();
  if (!value) {
    return defaults;
  }

  return {
    ...defaults,
    ...value,
    trimSize: value.trimSize ?? defaults.trimSize,
    pageWidthIn: parseNullableNumber(value.pageWidthIn) ?? defaults.pageWidthIn,
    pageHeightIn: parseNullableNumber(value.pageHeightIn) ?? defaults.pageHeightIn,
    marginTopMm: parseNullableNumber(value.marginTopMm) ?? defaults.marginTopMm,
    marginBottomMm: parseNullableNumber(value.marginBottomMm) ?? defaults.marginBottomMm,
    marginInsideMm: parseNullableNumber(value.marginInsideMm) ?? defaults.marginInsideMm,
    marginOutsideMm: parseNullableNumber(value.marginOutsideMm) ?? defaults.marginOutsideMm,
    paragraphIndentEm: parseNullableNumber(value.paragraphIndentEm) ?? defaults.paragraphIndentEm,
    lineHeight: parseNullableNumber(value.lineHeight) ?? defaults.lineHeight,
    dropCapEnabled: value.dropCapEnabled === true,
    sceneBreakGlyph: normalizeStoryText(value.sceneBreakGlyph) || defaults.sceneBreakGlyph,
    widowOrphanControl: value.widowOrphanControl !== false,
    chapterOpeningStyle: value.chapterOpeningStyle ?? defaults.chapterOpeningStyle,
  };
}

export function buildDefaultLibraryIndex(): LibraryIndex {
  return {
    books: [],
    sagas: [],
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

function sagaFilePath(sagaPath: string): string {
  return joinPath(sagaPath, SAGA_FILE);
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

function aiAuditDirPath(bookPath: string): string {
  return joinPath(bookPath, AI_AUDIT_DIR);
}

function aiTransactionsBaseDirPath(bookPath: string): string {
  return joinPath(bookPath, AI_TRANSACTIONS_DIR);
}

function aiTransactionsPendingDirPath(bookPath: string): string {
  return joinPath(aiTransactionsBaseDirPath(bookPath), AI_TRANSACTIONS_PENDING_DIR);
}

function aiTransactionsCommittedDirPath(bookPath: string): string {
  return joinPath(aiTransactionsBaseDirPath(bookPath), AI_TRANSACTIONS_COMMITTED_DIR);
}

function aiTransactionsRecoveredDirPath(bookPath: string): string {
  return joinPath(aiTransactionsBaseDirPath(bookPath), AI_TRANSACTIONS_RECOVERED_DIR);
}

function trustMetricsFilePath(bookPath: string): string {
  return joinPath(bookPath, TRUST_METRICS_FILE);
}

function buildDefaultTrustMetrics(): AiTrustMetrics {
  return {
    version: 1,
    updatedAt: getNowIso(),
    incidents: {
      session_applied: 0,
      session_cancelled_safe_mode: 0,
      session_cancelled_risk: 0,
      session_rollback_manual: 0,
      book_auto_apply_blocked: 0,
      book_auto_apply_run: 0,
      transaction_started: 0,
      transaction_committed: 0,
      transaction_rolled_back: 0,
      transaction_recovered: 0,
    },
  };
}

function normalizeTrustMetrics(payload: Partial<AiTrustMetrics> | null | undefined): AiTrustMetrics {
  const defaults = buildDefaultTrustMetrics();
  if (!payload || typeof payload !== 'object') {
    return defaults;
  }

  const sourceIncidents = payload.incidents && typeof payload.incidents === 'object'
    ? payload.incidents
    : {};
  const incidents: AiTrustMetrics['incidents'] = { ...defaults.incidents };
  for (const key of Object.keys(incidents) as AiTrustMetricIncident[]) {
    const raw = (sourceIncidents as Partial<Record<AiTrustMetricIncident, unknown>>)[key];
    incidents[key] = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  }

  return {
    version: 1,
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim()
      ? payload.updatedAt
      : defaults.updatedAt,
    incidents,
  };
}

async function computeSha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return safeFileName(value).slice(0, 64);
  }

  const encoded = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
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

function isAbsoluteFilesystemPath(path: string): boolean {
  if (!path) {
    return false;
  }

  if (/^[a-zA-Z]:\//.test(path)) {
    return true;
  }

  if (path.startsWith('//')) {
    return true;
  }

  return path.startsWith('/');
}

function resolveStoredImagePath(bookPath: string, storedPath: string): string {
  const normalizedStoredPath = normalizePath(sanitizeIncomingPath(storedPath));
  if (!normalizedStoredPath) {
    return '';
  }

  if (isAbsoluteFilesystemPath(normalizedStoredPath)) {
    return normalizedStoredPath;
  }

  return joinPath(bookPath, normalizedStoredPath);
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

function promptsFilePath(bookPath: string): string {
  return joinPath(bookPath, PROMPTS_FILE);
}

function parseVersion(fileName: string, chapterId: string): number {
  const matcher = new RegExp(`^${chapterId}_v(\\d+)\\.json$`);
  const match = fileName.match(matcher);
  return match ? Number(match[1]) : 0;
}

async function pruneChapterSnapshots(bookPath: string, chapterId: string, keepLatest: number): Promise<void> {
  if (!Number.isFinite(keepLatest) || keepLatest < 1) {
    return;
  }

  const versionsPath = versionsDirPath(bookPath);
  if (!(await exists(versionsPath))) {
    return;
  }

  const entries = await readDir(versionsPath);
  const snapshots = entries
    .filter((entry) => entry.isFile)
    .map((entry) => ({
      fileName: entry.name,
      version: parseVersion(entry.name, chapterId),
    }))
    .filter((entry) => entry.version > 0)
    .sort((left, right) => right.version - left.version);

  if (snapshots.length <= keepLatest) {
    return;
  }

  for (const snapshot of snapshots.slice(keepLatest)) {
    const snapshotPath = joinPath(versionsPath, snapshot.fileName);
    if (await exists(snapshotPath)) {
      await remove(snapshotPath);
    }
  }
}

function sanitizeLegacyChapterContent(content: string): { content: string; changed: boolean } {
  const plain = stripHtml(content).trim();
  if (!plain) {
    return { content, changed: false };
  }

  const parsed = splitAiOutputAndSummary(plain);
  const cleanedPlain = parsed.cleanText.trim();
  if (!cleanedPlain || cleanedPlain === plain) {
    return { content, changed: false };
  }

  return {
    content: plainTextToHtml(cleanedPlain),
    changed: true,
  };
}

function normalizeChapterSnapshot(snapshot: ChapterSnapshot): { snapshot: ChapterSnapshot; changed: boolean } {
  const normalizedChapter = ensureChapterDocument(snapshot.chapter ?? {});
  const sanitized = sanitizeLegacyChapterContent(normalizedChapter.content);

  const normalizedSnapshot: ChapterSnapshot = {
    version:
      typeof snapshot.version === 'number' && Number.isFinite(snapshot.version)
        ? Math.max(1, Math.trunc(snapshot.version))
        : 1,
    chapterId: normalizeStoryText(snapshot.chapterId) || normalizedChapter.id,
    reason: normalizeStoryText(snapshot.reason) || 'Snapshot',
    milestoneLabel: normalizeStoryText(snapshot.milestoneLabel),
    createdAt: normalizeStoryText(snapshot.createdAt) || normalizedChapter.updatedAt,
    chapter: {
      ...normalizedChapter,
      content: sanitized.changed ? sanitized.content : normalizedChapter.content,
      contentJson: null,
    },
  };

  return {
    snapshot: normalizedSnapshot,
    changed: JSON.stringify(snapshot) !== JSON.stringify(normalizedSnapshot),
  };
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

function hasChatContent(chats: BookChats): boolean {
  if (chats.book.length > 0) {
    return true;
  }

  return Object.values(chats.chapters).some((messages) => messages.length > 0);
}

function normalizeStoryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeChapterManuscriptNotes(value: unknown): ChapterManuscriptNote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const payload = entry as Partial<ChapterManuscriptNote>;
      const note = normalizeStoryText(payload.note);
      if (!note) {
        return null;
      }

      const now = getNowIso();
      return {
        id: normalizeStoryText(payload.id) || randomId('note'),
        excerpt: typeof payload.excerpt === 'string' ? payload.excerpt.trim() : '',
        note,
        status: payload.status === 'resolved' ? 'resolved' : 'open',
        createdAt: normalizeStoryText(payload.createdAt) || now,
        updatedAt: normalizeStoryText(payload.updatedAt) || normalizeStoryText(payload.createdAt) || now,
      } satisfies ChapterManuscriptNote;
    })
    .filter((entry): entry is ChapterManuscriptNote => Boolean(entry));
}

function parseTimelineOrder(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const matched = trimmed.match(/-?\d+(?:\.\d+)?/);
    if (!matched) {
      return null;
    }

    const parsed = Number.parseFloat(matched[0]);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  return null;
}

function normalizeSagaCharacterAliasType(value: unknown): SagaCharacterAliasType {
  switch (value) {
    case 'birth-name':
    case 'nickname':
    case 'title':
    case 'codename':
    case 'secret-name':
      return value;
    default:
      return 'public-name';
  }
}

function normalizeSagaCharacterStatus(value: unknown): SagaCharacterStatus {
  switch (value) {
    case 'alive':
    case 'dead':
    case 'missing':
      return value;
    default:
      return 'unknown';
  }
}

function buildSagaAliasSummary(aliasTimeline: SagaCharacterAlias[], fallbackAliases = ''): string {
  const aliasValues = aliasTimeline
    .map((entry) => entry.value.trim())
    .filter((entry) => entry.length > 0);

  if (aliasValues.length > 0) {
    return Array.from(new Set(aliasValues)).join(', ');
  }

  return fallbackAliases.trim();
}

function ensureSagaCharacterAliases(values: unknown, legacyAliases: string): SagaCharacterAlias[] {
  const normalized: SagaCharacterAlias[] = [];
  const source = Array.isArray(values) ? values : [];

  for (const entry of source) {
    if (typeof entry === 'string') {
      const aliasValue = normalizeStoryText(entry);
      if (!aliasValue) {
        continue;
      }

      normalized.push({
        id: randomId('saga-alias'),
        value: aliasValue,
        type: 'public-name',
        startOrder: null,
        endOrder: null,
        notes: '',
      });
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaCharacterAlias>;
    const aliasValue = normalizeStoryText(payload.value);
    const notes = normalizeStoryText(payload.notes);
    const startOrder = parseTimelineOrder(payload.startOrder);
    const endOrder = parseTimelineOrder(payload.endOrder);

    if (!aliasValue && !notes) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('saga-alias'),
      value: aliasValue,
      type: normalizeSagaCharacterAliasType(payload.type),
      startOrder,
      endOrder: endOrder === null || startOrder === null ? endOrder : Math.max(startOrder, endOrder),
      notes,
    });
  }

  if (normalized.length === 0 && legacyAliases.trim()) {
    for (const aliasValue of legacyAliases.split(',')) {
      const trimmed = aliasValue.trim();
      if (!trimmed) {
        continue;
      }

      normalized.push({
        id: randomId('saga-alias'),
        value: trimmed,
        type: 'public-name',
        startOrder: null,
        endOrder: null,
        notes: '',
      });
    }
  }

  normalized.sort((a, b) => {
    const aStart = a.startOrder ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.startOrder ?? Number.MAX_SAFE_INTEGER;
    if (aStart !== bStart) {
      return aStart - bStart;
    }

    const aEnd = a.endOrder ?? Number.MAX_SAFE_INTEGER;
    const bEnd = b.endOrder ?? Number.MAX_SAFE_INTEGER;
    if (aEnd !== bEnd) {
      return aEnd - bEnd;
    }

    return a.value.localeCompare(b.value);
  });

  return normalized;
}

function ensureSagaCharacterLifecycle(value: unknown): SagaCharacterLifecycle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      birthEventId: null,
      deathEventId: null,
      firstAppearanceEventId: null,
      lastKnownEventId: null,
      currentStatus: 'unknown',
    };
  }

  const payload = value as Partial<SagaCharacterLifecycle>;
  const normalizeNullableText = (field: unknown): string | null => {
    const normalized = normalizeStoryText(field);
    return normalized || null;
  };

  return {
    birthEventId: normalizeNullableText(payload.birthEventId),
    deathEventId: normalizeNullableText(payload.deathEventId),
    firstAppearanceEventId: normalizeNullableText(payload.firstAppearanceEventId),
    lastKnownEventId: normalizeNullableText(payload.lastKnownEventId),
    currentStatus: normalizeSagaCharacterStatus(payload.currentStatus),
  };
}

function hasSagaCharacterLifecycleContent(lifecycle: SagaCharacterLifecycle): boolean {
  return Boolean(
    lifecycle.birthEventId ||
      lifecycle.deathEventId ||
      lifecycle.firstAppearanceEventId ||
      lifecycle.lastKnownEventId ||
      lifecycle.currentStatus !== 'unknown',
  );
}

function ensureSagaCharacterVersions(values: unknown): SagaCharacterVersion[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaCharacterVersion[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaCharacterVersion>;
    const label = normalizeStoryText(payload.label);
    const summary = normalizeStoryText(payload.summary);
    const notes = normalizeStoryText(payload.notes);
    const startOrder = parseTimelineOrder(payload.startOrder);
    const endOrder = parseTimelineOrder(payload.endOrder);

    if (!label && !summary && !notes && startOrder === null && endOrder === null) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('saga-version'),
      label,
      startOrder,
      endOrder: endOrder === null || startOrder === null ? endOrder : Math.max(startOrder, endOrder),
      status: normalizeSagaCharacterStatus(payload.status),
      summary,
      notes,
    });
  }

  normalized.sort((a, b) => {
    const aStart = a.startOrder ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.startOrder ?? Number.MAX_SAFE_INTEGER;
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    return a.label.localeCompare(b.label);
  });

  return normalized;
}

function ensureStoryCharacters(values: unknown): StoryCharacter[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: StoryCharacter[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<StoryCharacter>;
    const character: StoryCharacter = {
      id: normalizeStoryText(payload.id) || randomId('char'),
      name: normalizeStoryText(payload.name),
      aliases: normalizeStoryText(payload.aliases),
      role: normalizeStoryText(payload.role),
      traits: normalizeStoryText(payload.traits),
      goal: normalizeStoryText(payload.goal),
      notes: normalizeStoryText(payload.notes),
      canonStatus: normalizeCanonStatus(payload.canonStatus),
    };

    if (
      !character.name &&
      !character.aliases &&
      !character.role &&
      !character.traits &&
      !character.goal &&
      !character.notes
    ) {
      continue;
    }

    normalized.push(character);
  }

  return normalized;
}

function ensureStoryLocations(values: unknown): StoryLocation[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: StoryLocation[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<StoryLocation>;
    const location: StoryLocation = {
      id: normalizeStoryText(payload.id) || randomId('loc'),
      name: normalizeStoryText(payload.name),
      aliases: normalizeStoryText(payload.aliases),
      description: normalizeStoryText(payload.description),
      atmosphere: normalizeStoryText(payload.atmosphere),
      notes: normalizeStoryText(payload.notes),
      canonStatus: normalizeCanonStatus(payload.canonStatus),
    };

    if (!location.name && !location.aliases && !location.description && !location.atmosphere && !location.notes) {
      continue;
    }

    normalized.push(location);
  }

  return normalized;
}

function ensureStoryBible(storyBible: unknown): StoryBible {
  if (!storyBible || typeof storyBible !== 'object' || Array.isArray(storyBible)) {
    return buildDefaultStoryBible();
  }

  const payload = storyBible as Partial<StoryBible>;
  return {
    characters: ensureStoryCharacters(payload.characters),
    locations: ensureStoryLocations(payload.locations),
    continuityRules: normalizeStoryText(payload.continuityRules),
  };
}

function ensureSagaWorldEntities(values: unknown): SagaWorldEntity[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaWorldEntity[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaWorldEntity>;
    const entity: SagaWorldEntity = {
      id: normalizeStoryText(payload.id) || randomId('saga-entity'),
      name: normalizeStoryText(payload.name),
      aliases: normalizeStoryText(payload.aliases),
      summary: normalizeStoryText(payload.summary),
      notes: normalizeStoryText(payload.notes),
      canonStatus: normalizeCanonStatus(payload.canonStatus),
    };

    if (!entity.name && !entity.aliases && !entity.summary && !entity.notes) {
      continue;
    }

    normalized.push(entity);
  }

  return normalized;
}

function ensureSagaSecrets(values: unknown): SagaSecret[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaSecret[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaSecret>;
    const title = normalizeStoryText(payload.title);
    const summary = normalizeStoryText(payload.summary);
    const objectiveTruth = normalizeStoryText(payload.objectiveTruth);
    const notes = normalizeStoryText(payload.notes);
    const relatedEntityIds = ensureSagaTimelineEntityIds(payload.relatedEntityIds);

    if (!title && !summary && !objectiveTruth && !notes && relatedEntityIds.length === 0) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('saga-secret'),
      title,
      summary,
      objectiveTruth,
      notes,
      relatedEntityIds,
      canonStatus: normalizeCanonStatus(payload.canonStatus),
    });
  }

  return normalized;
}

function ensureSagaCharacters(values: unknown): SagaCharacter[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaCharacter[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaCharacter>;
    const legacyAliases = normalizeStoryText(payload.aliases);
    const aliasTimeline = ensureSagaCharacterAliases(payload.aliasTimeline, legacyAliases);
    const lifecycle = ensureSagaCharacterLifecycle(payload.lifecycle);
    const versions = ensureSagaCharacterVersions(payload.versions);
    const character: SagaCharacter = {
      id: normalizeStoryText(payload.id) || randomId('saga-char'),
      name: normalizeStoryText(payload.name),
      aliases: buildSagaAliasSummary(aliasTimeline, legacyAliases),
      summary: normalizeStoryText(payload.summary),
      notes: normalizeStoryText(payload.notes),
      canonStatus: normalizeCanonStatus(payload.canonStatus),
      aliasTimeline,
      lifecycle,
      versions,
    };

    if (
      !character.name &&
      !character.aliases &&
      !character.summary &&
      !character.notes &&
      character.aliasTimeline.length === 0 &&
      (character.versions?.length ?? 0) === 0 &&
      !hasSagaCharacterLifecycleContent(lifecycle)
    ) {
      continue;
    }

    normalized.push(character);
  }

  return normalized;
}

function normalizeSagaEntityKind(value: unknown): SagaEntityKind {
  switch (value) {
    case 'character':
    case 'location':
    case 'route':
    case 'flora':
    case 'fauna':
    case 'faction':
    case 'system':
      return value;
    default:
      return 'artifact';
  }
}

function ensureSagaEntityRef(value: unknown, fallbackKind: SagaEntityKind): SagaEntityRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      kind: fallbackKind,
      id: '',
    };
  }

  const payload = value as Partial<SagaEntityRef>;
  return {
    kind: normalizeSagaEntityKind(payload.kind),
    id: normalizeStoryText(payload.id),
  };
}

function clampPercent(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, numeric));
}

function ensureSagaAtlasLayers(values: unknown): SagaAtlasLayer[] {
  if (!Array.isArray(values)) {
    return buildDefaultSagaAtlas().layers;
  }

  const normalized: SagaAtlasLayer[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaAtlasLayer>;
    const name = normalizeStoryText(payload.name);
    const description = normalizeStoryText(payload.description);
    if (!name && !description) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('atlas-layer'),
      name: name || 'Capa sin nombre',
      description,
      color: normalizeStoryText(payload.color) || '#1f5f8b',
      visible: payload.visible !== false,
    });
  }

  return normalized.length > 0 ? normalized : buildDefaultSagaAtlas().layers;
}

function ensureSagaAtlasPins(values: unknown, layers: SagaAtlasLayer[]): SagaAtlasPin[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const fallbackLayerId = layers[0]?.id ?? 'atlas-layer-main';
  const validLayerIds = new Set(layers.map((entry) => entry.id));
  const normalized: SagaAtlasPin[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaAtlasPin>;
    const locationId = normalizeStoryText(payload.locationId);
    const label = normalizeStoryText(payload.label);
    const notes = normalizeStoryText(payload.notes);
    if (!locationId && !label && !notes) {
      continue;
    }

    const requestedLayerId = normalizeStoryText(payload.layerId);
    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('atlas-pin'),
      locationId,
      label,
      layerId: validLayerIds.has(requestedLayerId) ? requestedLayerId : fallbackLayerId,
      xPct: clampPercent(payload.xPct, 50),
      yPct: clampPercent(payload.yPct, 50),
      notes,
    });
  }

  return normalized;
}

function ensureSagaAtlasRoutes(values: unknown): SagaAtlasRouteMeasurement[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaAtlasRouteMeasurement[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaAtlasRouteMeasurement>;
    const fromPinId = normalizeStoryText(payload.fromPinId);
    const toPinId = normalizeStoryText(payload.toPinId);
    const routeId = normalizeStoryText(payload.routeId);
    const notes = normalizeStoryText(payload.notes);
    if (!fromPinId && !toPinId && !routeId && !notes) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('atlas-route'),
      fromPinId,
      toPinId,
      routeId,
      distanceOverride: parseNullableNumber(payload.distanceOverride),
      travelHours: parseNullableNumber(payload.travelHours),
      notes,
    });
  }

  return normalized;
}

function ensureSagaAtlasConfig(value: unknown): SagaAtlasConfig {
  const defaults = buildDefaultSagaAtlas();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const payload = value as Partial<SagaAtlasConfig>;
  const layers = ensureSagaAtlasLayers(payload.layers);
  return {
    mapImagePath: normalizeStoryText(payload.mapImagePath),
    distanceScale: parseNullableNumber(payload.distanceScale) ?? defaults.distanceScale,
    distanceUnit: normalizeStoryText(payload.distanceUnit) || defaults.distanceUnit,
    defaultTravelMode: normalizeStoryText(payload.defaultTravelMode) || defaults.defaultTravelMode,
    showGrid: payload.showGrid !== false,
    layers,
    pins: ensureSagaAtlasPins(payload.pins, layers),
    routeMeasurements: ensureSagaAtlasRoutes(payload.routeMeasurements),
  };
}

function ensureSagaTimelineLanes(values: unknown): SagaTimelineLane[] {
  if (!Array.isArray(values)) {
    return buildDefaultSagaTimelineLanes();
  }

  const normalized: SagaTimelineLane[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaTimelineLane>;
    const label = normalizeStoryText(payload.label);
    const description = normalizeStoryText(payload.description);
    if (!label && !description) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('lane'),
      label: label || 'Carril sin nombre',
      color: normalizeStoryText(payload.color) || '#1f5f8b',
      era: normalizeStoryText(payload.era) || 'Presente',
      description,
    });
  }

  return normalized.length > 0 ? normalized : buildDefaultSagaTimelineLanes();
}

function ensureSagaConlangLexicon(values: unknown): SagaConlangLexiconEntry[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaConlangLexiconEntry[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaConlangLexiconEntry>;
    const term = normalizeStoryText(payload.term);
    const translation = normalizeStoryText(payload.translation);
    const notes = normalizeStoryText(payload.notes);
    if (!term && !translation && !notes) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('conlang-term'),
      term,
      translation,
      notes,
    });
  }

  return normalized;
}

function ensureSagaConlangs(values: unknown): SagaConlang[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaConlang[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaConlang>;
    const name = normalizeStoryText(payload.name);
    const grammarNotes = normalizeStoryText(payload.grammarNotes);
    if (!name && !grammarNotes) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('conlang'),
      name: name || 'Lengua sin nombre',
      phonetics: normalizeStoryText(payload.phonetics),
      grammarNotes,
      styleRules: normalizeStoryText(payload.styleRules),
      sampleText: normalizeStoryText(payload.sampleText),
      lexicon: ensureSagaConlangLexicon(payload.lexicon),
    });
  }

  return normalized;
}

function ensureSagaMagicSystems(values: unknown): SagaMagicSystem[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaMagicSystem[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaMagicSystem>;
    const name = normalizeStoryText(payload.name);
    const summary = normalizeStoryText(payload.summary);
    if (!name && !summary) {
      continue;
    }

    normalized.push({
      id: normalizeStoryText(payload.id) || randomId('magic'),
      name: name || 'Sistema sin nombre',
      summary,
      source: normalizeStoryText(payload.source),
      costs: normalizeStoryText(payload.costs),
      limits: normalizeStoryText(payload.limits),
      forbiddenActs: normalizeStoryText(payload.forbiddenActs),
      validationHints: normalizeStoryText(payload.validationHints),
    });
  }

  return normalized;
}

function ensureSagaWorldRelationships(values: unknown): SagaWorldRelationship[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaWorldRelationship[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaWorldRelationship> & {
      fromKind?: unknown;
      fromId?: unknown;
      toKind?: unknown;
      toId?: unknown;
    };
    const from =
      payload.from && typeof payload.from === 'object'
        ? ensureSagaEntityRef(payload.from, 'character')
        : {
            kind: normalizeSagaEntityKind(payload.fromKind ?? 'character'),
            id: normalizeStoryText(payload.fromId),
          };
    const to =
      payload.to && typeof payload.to === 'object'
        ? ensureSagaEntityRef(payload.to, 'character')
        : {
            kind: normalizeSagaEntityKind(payload.toKind ?? 'character'),
            id: normalizeStoryText(payload.toId),
          };
    const relationship: SagaWorldRelationship = {
      id: normalizeStoryText(payload.id) || randomId('saga-rel'),
      from,
      to,
      type: normalizeStoryText(payload.type),
      notes: normalizeStoryText(payload.notes),
      startOrder: parseTimelineOrder(payload.startOrder),
      endOrder: parseTimelineOrder(payload.endOrder),
    };

    if (!relationship.from.id && !relationship.to.id && !relationship.type && !relationship.notes) {
      continue;
    }

    normalized.push(relationship);
  }

  return normalized;
}

function normalizeSagaTimelineCategory(value: unknown): SagaTimelineEventCategory {
  switch (value) {
    case 'war':
    case 'journey':
    case 'birth':
    case 'death':
    case 'political':
    case 'discovery':
    case 'timeskip':
      return value;
    default:
      return 'other';
  }
}

function normalizeSagaTimelineKind(value: unknown): SagaTimelineEventKind {
  return value === 'span' ? 'span' : 'point';
}

function normalizeSagaTimelineChapterRefMode(value: unknown): SagaTimelineChapterRefMode {
  switch (value) {
    case 'mentioned':
    case 'revealed':
      return value;
    default:
      return 'occurs';
  }
}

function normalizeSagaTruthMode(value: unknown): SagaTruthMode {
  switch (value) {
    case 'objective':
    case 'retcon':
    case 'unreliable':
      return value;
    default:
      return 'perceived';
  }
}

function normalizeSagaTimelineImpactType(value: unknown): SagaTimelineImpactType {
  switch (value) {
    case 'birth':
    case 'death':
    case 'appearance':
    case 'disappearance':
    case 'injury':
    case 'promotion':
    case 'betrayal':
    case 'identity-change':
    case 'relationship-change':
      return value;
    default:
      return 'other';
  }
}

function normalizeOptionalPositiveInt(value: unknown): number | null {
  const parsed = parseTimelineOrder(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

function ensureSagaTimelineBookRefs(values: unknown): SagaTimelineChapterRef[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaTimelineChapterRef[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaTimelineChapterRef> & {
      book?: unknown;
      chapter?: unknown;
      relation?: unknown;
    };

    const rawBookPath = normalizeStoryText(payload.bookPath) || normalizeStoryText(payload.book);
    const bookPath = rawBookPath ? normalizeFolderPath(rawBookPath) || rawBookPath : '';
    const chapterId = normalizeStoryText(payload.chapterId) || normalizeStoryText(payload.chapter);
    const locationId = normalizeStoryText(payload.locationId);

    if (!bookPath && !chapterId && !locationId) {
      continue;
    }

    normalized.push({
      bookPath,
      chapterId,
      mode: normalizeSagaTimelineChapterRefMode(payload.mode ?? payload.relation),
      locationId,
    });
  }

  return normalized;
}

function ensureSagaTimelineEntityIds(values: unknown): string[] {
  const source = Array.isArray(values) ? values : typeof values === 'string' ? values.split(',') : [];
  const normalized = source
    .map((entry) => normalizeStoryText(entry))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

function ensureSagaTimelineCharacterImpacts(values: unknown): SagaTimelineCharacterImpact[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaTimelineCharacterImpact[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaTimelineCharacterImpact>;
    const characterId = normalizeStoryText(payload.characterId);
    const aliasUsed = normalizeStoryText(payload.aliasUsed);
    const stateChange = normalizeStoryText(payload.stateChange);

    if (!characterId && !aliasUsed && !stateChange) {
      continue;
    }

    normalized.push({
      characterId,
      impactType: normalizeSagaTimelineImpactType(payload.impactType),
      aliasUsed,
      stateChange,
    });
  }

  return normalized;
}

function ensureSagaTimelineArtifactTransfers(values: unknown): SagaTimelineArtifactTransfer[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaTimelineArtifactTransfer[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaTimelineArtifactTransfer>;
    const artifactId = normalizeStoryText(payload.artifactId);
    const fromCharacterId = normalizeStoryText(payload.fromCharacterId);
    const toCharacterId = normalizeStoryText(payload.toCharacterId);
    const notes = normalizeStoryText(payload.notes);
    if (!artifactId && !fromCharacterId && !toCharacterId && !notes) {
      continue;
    }

    normalized.push({
      artifactId,
      fromCharacterId,
      toCharacterId,
      notes,
    });
  }

  return normalized;
}

function ensureSagaTimelineCharacterLocations(values: unknown): SagaTimelineCharacterLocation[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaTimelineCharacterLocation[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaTimelineCharacterLocation>;
    const characterId = normalizeStoryText(payload.characterId);
    const locationId = normalizeStoryText(payload.locationId);
    const notes = normalizeStoryText(payload.notes);
    if (!characterId && !locationId && !notes) {
      continue;
    }

    normalized.push({
      characterId,
      locationId,
      notes,
    });
  }

  return normalized;
}

function ensureSagaTimelineSecretReveals(values: unknown): SagaTimelineSecretReveal[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaTimelineSecretReveal[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaTimelineSecretReveal>;
    const secretId = normalizeStoryText(payload.secretId);
    const perceiverCharacterId = normalizeStoryText(payload.perceiverCharacterId);
    const summary = normalizeStoryText(payload.summary);
    if (!secretId && !perceiverCharacterId && !summary) {
      continue;
    }

    normalized.push({
      secretId,
      truthMode: normalizeSagaTruthMode(payload.truthMode),
      perceiverCharacterId,
      summary,
    });
  }

  return normalized;
}

function ensureSagaTimeline(values: unknown): SagaTimelineEvent[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaTimelineEvent[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaTimelineEvent> & {
      name?: unknown;
      era?: unknown;
      orderHint?: unknown;
      chapterRefs?: unknown;
      entityRefs?: unknown;
    };
    const legacyTitle = normalizeStoryText(payload.name);
    const legacyEra = normalizeStoryText(payload.era);
    const legacyOrderHint = normalizeStoryText(payload.orderHint);
    const startOrder = parseTimelineOrder(payload.startOrder) ?? parseTimelineOrder(legacyOrderHint) ?? normalized.length + 1;
    const rawEndOrder = parseTimelineOrder(payload.endOrder);
    const baseKind = normalizeSagaTimelineKind(payload.kind);
    const kind = rawEndOrder !== null && rawEndOrder !== startOrder ? 'span' : baseKind;
    const bookRefs = ensureSagaTimelineBookRefs(payload.bookRefs ?? payload.chapterRefs);
    const entityIds = ensureSagaTimelineEntityIds(payload.entityIds ?? payload.entityRefs);
    const dependencyIds = ensureSagaTimelineEntityIds(payload.dependencyIds);
    const characterImpacts = ensureSagaTimelineCharacterImpacts(payload.characterImpacts);
    const artifactTransfers = ensureSagaTimelineArtifactTransfers(payload.artifactTransfers);
    const characterLocations = ensureSagaTimelineCharacterLocations(payload.characterLocations);
    const secretReveals = ensureSagaTimelineSecretReveals(payload.secretReveals);
    const event: SagaTimelineEvent = {
      id: normalizeStoryText(payload.id) || randomId('saga-event'),
      title: normalizeStoryText(payload.title) || legacyTitle,
      category: normalizeSagaTimelineCategory(payload.category),
      kind,
      startOrder,
      endOrder: kind === 'span' ? Math.max(startOrder, rawEndOrder ?? startOrder) : null,
      dependencyIds,
      laneId: normalizeStoryText(payload.laneId),
      laneLabel: normalizeStoryText(payload.laneLabel),
      eraLabel: normalizeStoryText(payload.eraLabel) || legacyEra,
      displayLabel: normalizeStoryText(payload.displayLabel) || legacyOrderHint || legacyEra || `T${startOrder}`,
      summary: normalizeStoryText(payload.summary),
      notes: normalizeStoryText(payload.notes),
      bookRefs,
      entityIds,
      characterImpacts,
      artifactTransfers,
      characterLocations,
      secretReveals,
      objectiveTruth: normalizeStoryText(payload.objectiveTruth),
      perceivedTruth: normalizeStoryText(payload.perceivedTruth),
      timeJumpYears: normalizeOptionalPositiveInt(payload.timeJumpYears),
      canonStatus: normalizeCanonStatus(payload.canonStatus),
    };

    if (
      !event.title &&
      !event.displayLabel &&
      !event.summary &&
      !event.notes &&
      event.bookRefs.length === 0 &&
      event.entityIds.length === 0 &&
      (event.dependencyIds?.length ?? 0) === 0 &&
      event.characterImpacts.length === 0 &&
      (event.artifactTransfers?.length ?? 0) === 0 &&
      (event.characterLocations?.length ?? 0) === 0 &&
      (event.secretReveals?.length ?? 0) === 0 &&
      !event.objectiveTruth &&
      !event.perceivedTruth
    ) {
      continue;
    }

    normalized.push(event);
  }

  normalized.sort((a, b) => {
    if (a.startOrder !== b.startOrder) {
      return a.startOrder - b.startOrder;
    }

    const aEnd = a.endOrder ?? a.startOrder;
    const bEnd = b.endOrder ?? b.startOrder;
    if (aEnd !== bEnd) {
      return aEnd - bEnd;
    }

    return a.title.localeCompare(b.title);
  });

  return normalized;
}

function normalizeSagaVolume(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.max(1, Math.round(numeric));
}

function ensureSagaBookLinks(values: unknown): SagaBookLink[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: SagaBookLink[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<SagaBookLink>;
    const bookPath = normalizeFolderPath(normalizeStoryText(payload.bookPath));
    const title = normalizeStoryText(payload.title);
    if (!bookPath || !title) {
      continue;
    }

    normalized.push({
      bookId: normalizeStoryText(payload.bookId) || bookPath,
      bookPath,
      title,
      author: normalizeStoryText(payload.author),
      volumeNumber: normalizeSagaVolume(payload.volumeNumber),
      linkedAt: normalizeStoryText(payload.linkedAt) || getNowIso(),
    });
  }

  normalized.sort((a, b) => {
    const aVolume = a.volumeNumber ?? Number.MAX_SAFE_INTEGER;
    const bVolume = b.volumeNumber ?? Number.MAX_SAFE_INTEGER;
    if (aVolume !== bVolume) {
      return aVolume - bVolume;
    }
    return a.title.localeCompare(b.title);
  });

  return normalized;
}

function ensureSagaWorldBible(worldBible: unknown): SagaWorldBible {
  if (!worldBible || typeof worldBible !== 'object' || Array.isArray(worldBible)) {
    return buildDefaultSagaWorldBible();
  }

  const payload = worldBible as Partial<SagaWorldBible>;
  return {
    overview: normalizeStoryText(payload.overview),
    characters: ensureSagaCharacters(payload.characters),
    locations: ensureSagaWorldEntities(payload.locations),
    routes: ensureSagaWorldEntities(payload.routes),
    flora: ensureSagaWorldEntities(payload.flora),
    fauna: ensureSagaWorldEntities(payload.fauna),
    factions: ensureSagaWorldEntities(payload.factions),
    systems: ensureSagaWorldEntities(payload.systems),
    artifacts: ensureSagaWorldEntities(payload.artifacts),
    secrets: ensureSagaSecrets(payload.secrets),
    relationships: ensureSagaWorldRelationships(payload.relationships),
    timeline: ensureSagaTimeline(payload.timeline),
    timelineLanes: ensureSagaTimelineLanes(payload.timelineLanes),
    atlas: ensureSagaAtlasConfig(payload.atlas),
    conlangs: ensureSagaConlangs(payload.conlangs),
    magicSystems: ensureSagaMagicSystems(payload.magicSystems),
    globalRules: normalizeStoryText(payload.globalRules),
    pinnedAiRules: normalizeStoryText(payload.pinnedAiRules),
    glossary: normalizeStoryText(payload.glossary),
  };
}

function ensureSagaMetadata(metadata: SagaMetadata): SagaMetadata {
  return {
    ...metadata,
    id: normalizeStoryText(metadata.id) || randomId('saga'),
    title: normalizeStoryText(metadata.title) || 'Mi saga',
    description: normalizeStoryText(metadata.description),
    strictValidationMode: metadata.strictValidationMode === true,
    books: ensureSagaBookLinks(metadata.books),
    worldBible: ensureSagaWorldBible(metadata.worldBible),
    createdAt: normalizeStoryText(metadata.createdAt) || getNowIso(),
    updatedAt: normalizeStoryText(metadata.updatedAt) || getNowIso(),
  };
}

function stripChatsFromMetadata(metadata: BookMetadata): BookMetadata {
  return {
    ...metadata,
    // Persistimos un stub minimo para mantener compatibilidad con validadores de book.json.
    chats: buildDefaultChats(),
  };
}

export function detectBookMetadataQuickFixIssues(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return ['book.json invalido (objeto requerido)'];
  }

  const payload = metadata as Record<string, unknown>;
  const requiredKeys: Array<keyof BookMetadata> = [
    'title',
    'author',
    'chapterOrder',
    'sagaId',
    'sagaPath',
    'sagaVolume',
    'coverImage',
    'backCoverImage',
    'spineText',
    'foundation',
    'storyBible',
    'amazon',
    'interiorFormat',
    'isPublished',
    'publishedAt',
    'createdAt',
    'updatedAt',
    'chats',
  ];

  const missingKeys = requiredKeys.filter((key) => !(key in payload));
  const issues = missingKeys.map((key) => `falta clave requerida: ${String(key)}`);

  if ('chats' in payload && (typeof payload.chats !== 'object' || payload.chats === null || Array.isArray(payload.chats))) {
    issues.push('chats debe ser un objeto');
  }

  if ('chapterOrder' in payload && !Array.isArray(payload.chapterOrder)) {
    issues.push('chapterOrder debe ser un array');
  }

  return issues;
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

function ensureChapterDocument(chapter: Partial<ChapterDocument>): ChapterDocument {
  const now = getNowIso();
  return {
    ...chapter,
    id: normalizeStoryText(chapter.id) || randomId('chapter'),
    title: normalizeStoryText(chapter.title) || 'Capitulo',
    content: typeof chapter.content === 'string' ? chapter.content : '<p>Escribe aqui...</p>',
    pointOfView: normalizeStoryText(chapter.pointOfView),
    // Persistimos HTML como fuente de verdad para reducir peso en disco.
    contentJson: null,
    manuscriptNotes: normalizeChapterManuscriptNotes(chapter.manuscriptNotes),
    lengthPreset: resolveChapterLengthPreset(chapter.lengthPreset),
    createdAt: normalizeStoryText(chapter.createdAt) || now,
    updatedAt: normalizeStoryText(chapter.updatedAt) || normalizeStoryText(chapter.createdAt) || now,
  };
}

function shouldPersistNormalizedChapter(
  source: Partial<ChapterDocument> | null,
  normalized: ChapterDocument,
): boolean {
  if (!source) {
    return true;
  }

  const sourceId = typeof source.id === 'string' ? source.id.trim() : '';
  const sourceTitle = typeof source.title === 'string' ? source.title.trim() : '';
  const sourceContent = typeof source.content === 'string' ? source.content : '';
  const sourceCreatedAt = typeof source.createdAt === 'string' ? source.createdAt : '';
  const sourceUpdatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : '';
  const sourceLengthPreset = resolveChapterLengthPreset(source.lengthPreset);
  const sourcePointOfView = normalizeStoryText(source.pointOfView);
  const sourceContentJson = source.contentJson ?? null;
  const sourceNotes = JSON.stringify(normalizeChapterManuscriptNotes(source.manuscriptNotes));
  const normalizedNotes = JSON.stringify(normalizeChapterManuscriptNotes(normalized.manuscriptNotes));

  return (
    sourceId !== normalized.id ||
    sourceTitle !== normalized.title ||
    sourceContent !== normalized.content ||
    sourceCreatedAt !== normalized.createdAt ||
    sourceUpdatedAt !== normalized.updatedAt ||
    sourceLengthPreset !== normalized.lengthPreset ||
    sourcePointOfView !== normalizeStoryText(normalized.pointOfView) ||
    sourceContentJson !== normalized.contentJson ||
    sourceNotes !== normalizedNotes
  );
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
    pointOfView: '',
    manuscriptNotes: [],
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
    sagaId: null,
    sagaPath: null,
    sagaVolume: null,
    coverImage: null,
    backCoverImage: null,
    spineText: title,
    foundation: buildDefaultFoundation(),
    storyBible: buildDefaultStoryBible(),
    amazon: buildDefaultAmazon(title, author),
    interiorFormat: buildDefaultInteriorFormat(),
    isPublished: false,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    chats: buildDefaultChats(),
    editorialChecklistCustom: [],
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

async function backupBookJsonBeforeQuickFix(
  bookPath: string,
  reasons: string[],
): Promise<void> {
  if (reasons.length === 0) {
    return;
  }

  const sourcePath = bookFilePath(bookPath);
  if (!(await exists(sourcePath))) {
    return;
  }

  const safeStamp = getNowIso().replaceAll(':', '-');
  const backupPath = joinPath(
    versionsDirPath(bookPath),
    `book.quickfix.${safeStamp}.json.bak`,
  );
  try {
    await copyFile(sourcePath, backupPath);
  } catch {
    // Si falla el backup no interrumpimos apertura, pero mantenemos la normalizacion.
  }
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
  let bookLanguageHint: string | null = null;
  let sourceHasAmazonLanguage = false;
  let shouldPersistChats = false;
  let quickFixReasons: string[] = [];

  let metadata: BookMetadata;
  if (await exists(bookFilePath(normalizedBookPath))) {
    try {
      const loadedMetadata = await readJson<BookLanguageSource>(bookFilePath(normalizedBookPath));
      quickFixReasons = detectBookMetadataQuickFixIssues(loadedMetadata);
      sourceHasAmazonLanguage = Boolean(readAmazonLanguageHint(loadedMetadata));
      bookLanguageHint = resolveBookLanguageHint(loadedMetadata);
      if (hasChatContent(ensureBookChats(loadedMetadata.chats))) {
        shouldPersistChats = true;
      }
      metadata = ensureBookMetadata(loadedMetadata as BookMetadata);
    } catch {
      const fallbackOrder = chapterIdsFromDisk.length > 0 ? chapterIdsFromDisk : ['01'];
      metadata = buildInitialBookMetadata(defaultTitle, defaultAuthor, fallbackOrder, now);
    }
  } else {
    const initialOrder = chapterIdsFromDisk.length > 0 ? chapterIdsFromDisk : ['01'];
    metadata = buildInitialBookMetadata(defaultTitle, defaultAuthor, initialOrder, now);
  }

  if (!sourceHasAmazonLanguage && bookLanguageHint) {
    metadata = ensureBookMetadata({
      ...metadata,
      amazon: {
        ...metadata.amazon,
        language: bookLanguageHint,
      },
    });
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
    let shouldPersistChapter = false;

    if (await exists(chapterPath)) {
      try {
        const rawChapter = await readJson<Partial<ChapterDocument>>(chapterPath);
        const loaded = ensureChapterDocument(rawChapter as ChapterDocument);
        chapter = {
          ...loaded,
          id: loaded.id?.trim() || chapterId,
          title: loaded.title?.trim() || chapterDisplayTitle(chapterId, index),
          content: loaded.content ?? '<p>Escribe aqui...</p>',
          pointOfView: normalizeStoryText(loaded.pointOfView),
          createdAt: loaded.createdAt ?? now,
          updatedAt: loaded.updatedAt ?? loaded.createdAt ?? now,
          contentJson: loaded.contentJson ?? null,
        };
        shouldPersistChapter = shouldPersistNormalizedChapter(rawChapter, chapter);
      } catch {
        chapter = buildDefaultChapterDocument(chapterId, index, now);
        shouldPersistChapter = true;
      }
    } else {
      chapter = buildDefaultChapterDocument(chapterId, index, now);
      shouldPersistChapter = true;
    }

    chapters[chapterId] = chapter;
    if (shouldPersistChapter) {
      await writeJson(chapterPath, chapter);
    }
  }

  const legacyChats = ensureBookChats(metadata.chats);
  metadata = {
    ...metadata,
    chats: legacyChats,
  };
  if (shouldPersistChats || hasChatContent(legacyChats)) {
    await saveChatsToDisk(normalizedBookPath, legacyChats);
  }
  await backupBookJsonBeforeQuickFix(normalizedBookPath, quickFixReasons);
  await writeJson(bookFilePath(normalizedBookPath), stripChatsFromMetadata(metadata));
  if (!(await exists(configFilePath(normalizedBookPath)))) {
    const configLanguage = bookLanguageHint ?? normalizeLanguageCode(metadata.amazon.language);
    await writeJson(configFilePath(normalizedBookPath), {
      ...DEFAULT_APP_CONFIG,
      language: configLanguage,
    });
  }

  return { metadata, chapters };
}

async function ensureSagaProjectFiles(
  sagaPath: string,
  defaults?: { title?: string; description?: string },
): Promise<SagaMetadata> {
  const normalizedSagaPath = normalizeFolderPath(sanitizeIncomingPath(sagaPath));
  const now = getNowIso();
  await mkdir(normalizedSagaPath, { recursive: true });

  const titleFromPath = inferTitleFromBookPath(normalizedSagaPath);
  const defaultTitle = defaults?.title?.trim() || titleFromPath || 'Mi saga';
  const defaultDescription = defaults?.description?.trim() || '';

  let metadata: SagaMetadata;
  if (await exists(sagaFilePath(normalizedSagaPath))) {
    try {
      const loaded = await readJson<Partial<SagaMetadata>>(sagaFilePath(normalizedSagaPath));
      metadata = ensureSagaMetadata(loaded as SagaMetadata);
    } catch {
      metadata = buildInitialSagaMetadata(defaultTitle, now, defaultDescription);
    }
  } else {
    metadata = buildInitialSagaMetadata(defaultTitle, now, defaultDescription);
  }

  metadata = ensureSagaMetadata({
    ...metadata,
    title: metadata.title?.trim() || defaultTitle,
    description: metadata.description?.trim() || defaultDescription,
  });

  await writeJson(sagaFilePath(normalizedSagaPath), metadata);
  return metadata;
}

async function tryLoadExistingSagaProject(sagaPath: string): Promise<SagaProject | null> {
  const normalizedSagaPath = normalizeFolderPath(sanitizeIncomingPath(sagaPath));
  const targetPath = sagaFilePath(normalizedSagaPath);
  if (!(await exists(targetPath))) {
    return null;
  }

  try {
    const loaded = await readJson<Partial<SagaMetadata>>(targetPath);
    const metadata = ensureSagaMetadata(loaded as SagaMetadata);
    await writeJson(targetPath, metadata);
    return {
      path: normalizedSagaPath,
      metadata,
    };
  } catch {
    return null;
  }
}

function buildSagaBookLink(book: BookProject, volumeNumber: number | null, linkedAt?: string): SagaBookLink {
  return {
    bookId: normalizeFolderPath(book.path),
    bookPath: normalizeFolderPath(book.path),
    title: book.metadata.title,
    author: book.metadata.author,
    volumeNumber: normalizeSagaVolume(volumeNumber),
    linkedAt: linkedAt ?? getNowIso(),
  };
}

function getNextSagaVolume(books: SagaBookLink[]): number {
  const volumes = books.map((entry) => entry.volumeNumber).filter((value): value is number => typeof value === 'number');
  if (volumes.length === 0) {
    return 1;
  }

  return Math.max(...volumes) + 1;
}

function syncSagaMetadataWithBook(
  metadata: SagaMetadata,
  book: BookProject,
  preferredVolume?: number | null,
): SagaMetadata {
  const normalizedBookPath = normalizeFolderPath(book.path);
  const existing = metadata.books.find((entry) => normalizeFolderPath(entry.bookPath) === normalizedBookPath);
  const remaining = metadata.books.filter((entry) => normalizeFolderPath(entry.bookPath) !== normalizedBookPath);
  const volumeNumber =
    normalizeSagaVolume(preferredVolume) ??
    existing?.volumeNumber ??
    normalizeSagaVolume(book.metadata.sagaVolume) ??
    getNextSagaVolume(remaining);
  const nextLink = buildSagaBookLink(book, volumeNumber, existing?.linkedAt);
  const nextBooks = rebalanceSagaBookLinks([...remaining, nextLink], nextLink.bookPath, volumeNumber);

  return ensureSagaMetadata({
    ...metadata,
    books: nextBooks,
  });
}

function removeBookFromSagaMetadata(metadata: SagaMetadata, bookPath: string): SagaMetadata {
  const normalizedBookPath = normalizeFolderPath(bookPath);
  return ensureSagaMetadata({
    ...metadata,
    books: metadata.books.filter((entry) => normalizeFolderPath(entry.bookPath) !== normalizedBookPath),
  });
}

function rebalanceSagaBookLinks(
  books: SagaBookLink[],
  preferredBookPath?: string,
  preferredVolume?: number | null,
): SagaBookLink[] {
  const normalized = ensureSagaBookLinks(books);
  if (normalized.length === 0) {
    return [];
  }

  const normalizedPreferredBookPath = preferredBookPath ? normalizeFolderPath(preferredBookPath) : '';
  if (!normalizedPreferredBookPath) {
    return normalized.map((entry, index) => ({
      ...entry,
      volumeNumber: index + 1,
    }));
  }

  const pivot = normalized.find((entry) => normalizeFolderPath(entry.bookPath) === normalizedPreferredBookPath);
  if (!pivot) {
    return normalized.map((entry, index) => ({
      ...entry,
      volumeNumber: index + 1,
    }));
  }

  const remaining = normalized.filter((entry) => normalizeFolderPath(entry.bookPath) !== normalizedPreferredBookPath);
  const requestedVolume = normalizeSagaVolume(preferredVolume) ?? pivot.volumeNumber ?? remaining.length + 1;
  const targetIndex = Math.max(0, Math.min(remaining.length, requestedVolume - 1));
  const reordered = [...remaining];
  reordered.splice(targetIndex, 0, pivot);

  return reordered.map((entry, index) => ({
    ...entry,
    volumeNumber: index + 1,
  }));
}

async function syncSagaLinksToBooks(saga: SagaProject): Promise<BookProject[]> {
  const updatedBooks: BookProject[] = [];

  for (const link of saga.metadata.books) {
    try {
      if (!(await exists(bookFilePath(link.bookPath)))) {
        continue;
      }

      const project = await loadBookProject(link.bookPath);
      const savedMetadata = await saveBookMetadata(project.path, {
        ...project.metadata,
        sagaId: saga.metadata.id,
        sagaPath: saga.path,
        sagaVolume: link.volumeNumber,
      });
      updatedBooks.push({
        ...project,
        metadata: savedMetadata,
      });
    } catch {
      // Mantiene la saga aunque un libro puntual no pueda sincronizarse.
    }
  }

  return updatedBooks;
}

async function clearSagaLinksFromBooks(saga: SagaProject): Promise<BookProject[]> {
  const detachedBooks: BookProject[] = [];

  for (const link of saga.metadata.books) {
    try {
      if (!(await exists(bookFilePath(link.bookPath)))) {
        continue;
      }

      const project = await loadBookProject(link.bookPath);
      const savedMetadata = await saveBookMetadata(project.path, {
        ...project.metadata,
        sagaId: null,
        sagaPath: null,
        sagaVolume: null,
      });
      detachedBooks.push({
        ...project,
        metadata: savedMetadata,
      });
    } catch {
      // Si un libro no puede limpiarse, no bloquea el resto.
    }
  }

  return detachedBooks;
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

async function resolveSagaCreationPath(parentPath: string, baseFolderName: string): Promise<{ path: string; reused: boolean }> {
  const preferredPath = joinPath(parentPath, baseFolderName);
  if (!(await exists(preferredPath))) {
    return { path: preferredPath, reused: false };
  }

  if (await exists(sagaFilePath(preferredPath))) {
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
  const content = JSON.stringify(data, null, 2);
  const tempPath = `${path}.tmp`;
  try {
    await writeTextFile(tempPath, content);
    await rename(tempPath, path);
  } catch {
    // Si rename falla, intentar escritura directa como fallback
    try { await remove(tempPath); } catch { /* ignorar limpieza */ }
    await writeTextFile(path, content);
  }
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readTextFile(path);
  return JSON.parse(raw) as T;
}

async function ensureTrustInfrastructure(bookPath: string): Promise<void> {
  await mkdir(aiAuditDirPath(bookPath), { recursive: true });
  await mkdir(aiTransactionsPendingDirPath(bookPath), { recursive: true });
  await mkdir(aiTransactionsCommittedDirPath(bookPath), { recursive: true });
  await mkdir(aiTransactionsRecoveredDirPath(bookPath), { recursive: true });
}

function transactionPendingFilePath(bookPath: string, transactionId: string): string {
  return joinPath(aiTransactionsPendingDirPath(bookPath), `${transactionId}.json`);
}

function transactionCommittedFilePath(bookPath: string, transactionId: string): string {
  return joinPath(aiTransactionsCommittedDirPath(bookPath), `${transactionId}.json`);
}

function transactionRecoveredFilePath(bookPath: string, transactionId: string): string {
  return joinPath(aiTransactionsRecoveredDirPath(bookPath), `${transactionId}.json`);
}

function toAuditTimestampSegment(iso: string): string {
  return iso
    .replace(/[:.]/g, '-')
    .replace(/T/g, '_')
    .replace(/Z$/g, 'Z');
}

async function writeAuditRecordFile(bookPath: string, fileName: string, payload: unknown): Promise<string> {
  await ensureTrustInfrastructure(bookPath);
  let candidate = joinPath(aiAuditDirPath(bookPath), fileName);
  let suffix = 2;
  while (await exists(candidate)) {
    const nextName = fileName.replace(/\.json$/i, `-${suffix}.json`);
    candidate = joinPath(aiAuditDirPath(bookPath), nextName);
    suffix += 1;
  }
  await writeJson(candidate, payload);
  return candidate;
}

export async function loadAiTrustMetrics(bookPath: string): Promise<AiTrustMetrics> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const targetPath = trustMetricsFilePath(normalizedBookPath);
  if (!(await exists(targetPath))) {
    return buildDefaultTrustMetrics();
  }

  try {
    const loaded = await readJson<Partial<AiTrustMetrics>>(targetPath);
    return normalizeTrustMetrics(loaded);
  } catch {
    return buildDefaultTrustMetrics();
  }
}

export async function recordAiTrustIncident(
  bookPath: string,
  incident: AiTrustMetricIncident,
  increment = 1,
): Promise<AiTrustMetrics> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const targetPath = trustMetricsFilePath(normalizedBookPath);
  const previous = await loadAiTrustMetrics(normalizedBookPath);
  const next: AiTrustMetrics = {
    ...previous,
    updatedAt: getNowIso(),
    incidents: {
      ...previous.incidents,
      [incident]: previous.incidents[incident] + Math.max(1, Math.round(increment)),
    },
  };
  await writeJson(targetPath, next);
  return next;
}

export async function writeAiSessionAudit(
  bookPath: string,
  input: AiSessionAuditInput,
): Promise<{ auditPath: string; hash: string; chapterCount: number }> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const createdAt = getNowIso();
  const chapterSummaries = input.chapterChanges.map((chapter) => {
    const beforeWords = stripHtml(plainTextToHtml(chapter.beforeText)).split(/\s+/).filter(Boolean).length;
    const afterWords = stripHtml(plainTextToHtml(chapter.afterText)).split(/\s+/).filter(Boolean).length;
    return {
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      beforeText: chapter.beforeText,
      afterText: chapter.afterText,
      beforeWords,
      afterWords,
      deltaWords: afterWords - beforeWords,
    };
  });

  const hashSeed = JSON.stringify({
    sessionId: input.sessionId,
    scope: input.scope,
    operation: input.operation,
    status: input.status,
    reason: input.reason ?? '',
    chapterSummaries: chapterSummaries.map((entry) => ({
      chapterId: entry.chapterId,
      chapterTitle: entry.chapterTitle,
      beforeText: entry.beforeText,
      afterText: entry.afterText,
      beforeWords: entry.beforeWords,
      afterWords: entry.afterWords,
      deltaWords: entry.deltaWords,
    })),
    metadata: input.metadata ?? {},
  });
  const hash = await computeSha256Hex(hashSeed);

  const payload = {
    version: 1,
    hash,
    createdAt,
    sessionId: input.sessionId,
    scope: input.scope,
    operation: input.operation,
    status: input.status,
    reason: input.reason ?? '',
    chapterCount: chapterSummaries.length,
    chapterSummaries,
    metadata: input.metadata ?? {},
  };

  const safeSessionId = safeFileName(input.sessionId || randomId('session'));
  const fileName = `${toAuditTimestampSegment(createdAt)}-${safeSessionId}-${hash.slice(0, 12)}.json`;
  const auditPath = await writeAuditRecordFile(normalizedBookPath, fileName, payload);
  return {
    auditPath,
    hash,
    chapterCount: chapterSummaries.length,
  };
}

export async function startAiTransaction(
  bookPath: string,
  input: {
    operation: string;
    scope: 'chapter' | 'book';
    chapterOrder: string[];
    chaptersBefore: Record<string, ChapterDocument>;
    notes?: string;
  },
): Promise<{ transactionId: string; chapterCount: number }> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  await ensureTrustInfrastructure(normalizedBookPath);
  const transactionId = randomId('tx');
  const now = getNowIso();
  const snapshots: AiTransactionChapterSnapshot[] = [];
  for (const chapterId of input.chapterOrder) {
    const chapter = input.chaptersBefore[chapterId];
    if (!chapter) {
      continue;
    }

    snapshots.push({
      chapterId,
      chapter: {
        ...chapter,
        contentJson: chapter.contentJson ?? null,
      },
    });
  }

  const record: AiTransactionRecord = {
    version: 1,
    transactionId,
    operation: input.operation,
    scope: input.scope,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    chapterOrder: input.chapterOrder,
    snapshots,
    notes: input.notes?.trim() || '',
  };
  await writeJson(transactionPendingFilePath(normalizedBookPath, transactionId), record);
  await recordAiTrustIncident(normalizedBookPath, 'transaction_started');
  return {
    transactionId,
    chapterCount: snapshots.length,
  };
}

export async function commitAiTransaction(
  bookPath: string,
  transactionId: string,
  notes = '',
): Promise<boolean> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const pendingPath = transactionPendingFilePath(normalizedBookPath, transactionId);
  if (!(await exists(pendingPath))) {
    return false;
  }

  const loaded = await readJson<AiTransactionRecord>(pendingPath);
  const committed: AiTransactionRecord = {
    ...loaded,
    status: 'committed',
    updatedAt: getNowIso(),
    notes: [loaded.notes, notes.trim()].filter(Boolean).join(' | '),
  };
  await writeJson(transactionCommittedFilePath(normalizedBookPath, transactionId), committed);
  await remove(pendingPath);
  await recordAiTrustIncident(normalizedBookPath, 'transaction_committed');
  return true;
}

export async function rollbackAiTransaction(
  bookPath: string,
  transactionId: string,
  reason = '',
): Promise<{ restoredChapters: number; rolledBack: boolean }> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const pendingPath = transactionPendingFilePath(normalizedBookPath, transactionId);
  if (!(await exists(pendingPath))) {
    return { restoredChapters: 0, rolledBack: false };
  }

  const loaded = await readJson<AiTransactionRecord>(pendingPath);
  if (loaded.status !== 'pending') {
    return { restoredChapters: 0, rolledBack: false };
  }

  let restoredChapters = 0;
  for (const snapshot of loaded.snapshots) {
    const restoredChapter = ensureChapterDocument({
      ...snapshot.chapter,
      updatedAt: getNowIso(),
    });
    await writeJson(chapterFilePath(normalizedBookPath, snapshot.chapterId), restoredChapter);
    restoredChapters += 1;
  }

  const rolledBack: AiTransactionRecord = {
    ...loaded,
    status: 'rolled_back',
    updatedAt: getNowIso(),
    notes: [loaded.notes, reason.trim()].filter(Boolean).join(' | '),
  };
  await writeJson(transactionRecoveredFilePath(normalizedBookPath, transactionId), rolledBack);
  await remove(pendingPath);
  await recordAiTrustIncident(normalizedBookPath, 'transaction_rolled_back');
  return { restoredChapters, rolledBack: true };
}

export async function recoverPendingAiTransactions(bookPath: string): Promise<AiTransactionRecoveryReport> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const pendingDir = aiTransactionsPendingDirPath(normalizedBookPath);
  if (!(await exists(pendingDir))) {
    return {
      recoveredTransactions: 0,
      restoredChapters: 0,
      transactionIds: [],
    };
  }

  const entries = await readDir(pendingDir);
  let recoveredTransactions = 0;
  let restoredChapters = 0;
  const transactionIds: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile || !entry.name.toLowerCase().endsWith('.json')) {
      continue;
    }
    const transactionId = entry.name.replace(/\.json$/i, '').trim();
    if (!transactionId) {
      continue;
    }

    try {
      const outcome = await rollbackAiTransaction(
        normalizedBookPath,
        transactionId,
        'Recuperacion automatica al abrir libro',
      );
      if (!outcome.rolledBack) {
        continue;
      }

      recoveredTransactions += 1;
      restoredChapters += outcome.restoredChapters;
      transactionIds.push(transactionId);
      await recordAiTrustIncident(normalizedBookPath, 'transaction_recovered');
    } catch {
      // Si falla una recuperacion, se mantiene pendiente para reintento posterior.
    }
  }

  return {
    recoveredTransactions,
    restoredChapters,
    transactionIds,
  };
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

function normalizeEditorialChecklistCustomItems(value: unknown): EditorialChecklistCustomItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const item = entry as Partial<EditorialChecklistCustomItem>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      return [];
    }

    return [
      {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomId('editorial'),
        title,
        description: typeof item.description === 'string' ? item.description.trim() : '',
        level: item.level === 'warning' ? 'warning' : 'error',
        checked: Boolean(item.checked),
        createdAt: typeof item.createdAt === 'string' && item.createdAt.trim() ? item.createdAt : getNowIso(),
        updatedAt: typeof item.updatedAt === 'string' && item.updatedAt.trim() ? item.updatedAt : getNowIso(),
      },
    ];
  });
}

function ensureBookMetadata(metadata: BookMetadata): BookMetadata {
  return {
    ...metadata,
    chats: ensureBookChats(metadata.chats),
    sagaId: metadata.sagaId ?? null,
    sagaPath: metadata.sagaPath ? normalizeFolderPath(metadata.sagaPath) : null,
    sagaVolume: normalizeSagaVolume(metadata.sagaVolume),
    coverImage: metadata.coverImage ?? null,
    backCoverImage: metadata.backCoverImage ?? null,
    spineText: metadata.spineText ?? metadata.title ?? '',
    foundation: metadata.foundation ?? buildDefaultFoundation(),
    storyBible: ensureStoryBible(metadata.storyBible),
    amazon: ensureAmazonData(metadata.amazon, metadata.title, metadata.author),
    interiorFormat: ensureInteriorFormat(metadata.interiorFormat),
    isPublished: metadata.isPublished ?? false,
    publishedAt: metadata.publishedAt ?? null,
    editorialChecklistCustom: normalizeEditorialChecklistCustomItems(metadata.editorialChecklistCustom),
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

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeFiniteNumber(
  value: unknown,
  fallback: number,
  bounds?: { min?: number; max?: number },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  let normalized = value;
  if (typeof bounds?.min === 'number') {
    normalized = Math.max(bounds.min, normalized);
  }
  if (typeof bounds?.max === 'number') {
    normalized = Math.min(bounds.max, normalized);
  }
  return normalized;
}

export async function loadAppConfig(bookPath: string): Promise<AppConfig> {
  const normalizedBookPath = normalizePath(bookPath);
  const targetConfigPath = configFilePath(normalizedBookPath);

  await mkdir(normalizedBookPath, { recursive: true });

  let bookLanguageHint = DEFAULT_APP_CONFIG.language;
  const targetBookPath = bookFilePath(normalizedBookPath);
  if (await exists(targetBookPath)) {
    try {
      const metadata = await readJson<BookLanguageSource>(
        targetBookPath,
      );
      const resolvedLanguage = resolveBookLanguageHint(metadata);
      if (resolvedLanguage) {
        bookLanguageHint = resolvedLanguage;
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
  const fallbackTopP = normalizeFiniteNumber(DEFAULT_APP_CONFIG.ollamaOptions.top_p, 0.9, { min: 0, max: 1 });
  const loadedTopP =
    loaded.ollamaOptions && typeof loaded.ollamaOptions === 'object'
      ? (loaded.ollamaOptions as Partial<AppConfig['ollamaOptions']>).top_p
      : undefined;

  return {
    model: typeof loaded.model === 'string' && loaded.model.trim() ? loaded.model.trim() : DEFAULT_APP_CONFIG.model,
    language: hasExplicitLanguage
      ? normalizeLanguageCode(loaded.language)
      : bookLanguageHint,
    theme:
      loaded.theme === 'light' || loaded.theme === 'dark' || loaded.theme === 'sepia'
        ? loaded.theme
        : DEFAULT_APP_CONFIG.theme,
    systemPrompt:
      typeof loaded.systemPrompt === 'string' && loaded.systemPrompt.trim()
        ? loaded.systemPrompt
        : DEFAULT_APP_CONFIG.systemPrompt,
    temperature: normalizeFiniteNumber(loaded.temperature, DEFAULT_APP_CONFIG.temperature, { min: 0, max: 2 }),
    audioVoiceName:
      typeof loaded.audioVoiceName === 'string'
        ? loaded.audioVoiceName.trim()
        : DEFAULT_APP_CONFIG.audioVoiceName,
    audioRate: normalizeFiniteNumber(loaded.audioRate, DEFAULT_APP_CONFIG.audioRate, { min: 0.5, max: 2 }),
    audioVolume: normalizeFiniteNumber(loaded.audioVolume, DEFAULT_APP_CONFIG.audioVolume, { min: 0, max: 1 }),
    aiResponseMode:
      loaded.aiResponseMode === 'rapido' || loaded.aiResponseMode === 'calidad'
        ? loaded.aiResponseMode
        : DEFAULT_APP_CONFIG.aiResponseMode,
    autoVersioning: normalizeBoolean(loaded.autoVersioning, DEFAULT_APP_CONFIG.autoVersioning),
    aiSafeMode: normalizeBoolean(loaded.aiSafeMode, DEFAULT_APP_CONFIG.aiSafeMode),
    autoApplyChatChanges: normalizeBoolean(
      loaded.autoApplyChatChanges,
      DEFAULT_APP_CONFIG.autoApplyChatChanges,
    ),
    bookAutoApplyEnabled: normalizeBoolean(
      loaded.bookAutoApplyEnabled,
      DEFAULT_APP_CONFIG.bookAutoApplyEnabled,
    ),
    chatApplyIterations: Math.round(
      normalizeFiniteNumber(loaded.chatApplyIterations, DEFAULT_APP_CONFIG.chatApplyIterations, {
        min: 1,
        max: 10,
      }),
    ),
    continuousAgentEnabled: normalizeBoolean(
      loaded.continuousAgentEnabled,
      DEFAULT_APP_CONFIG.continuousAgentEnabled,
    ),
    continuousAgentMaxRounds: Math.round(
      normalizeFiniteNumber(loaded.continuousAgentMaxRounds, DEFAULT_APP_CONFIG.continuousAgentMaxRounds, {
        min: 1,
        max: 12,
      }),
    ),
    continuityGuardEnabled: normalizeBoolean(
      loaded.continuityGuardEnabled,
      DEFAULT_APP_CONFIG.continuityGuardEnabled,
    ),
    autosaveIntervalMs: Math.round(
      normalizeFiniteNumber(loaded.autosaveIntervalMs, DEFAULT_APP_CONFIG.autosaveIntervalMs, { min: 1000 }),
    ),
    backupEnabled: normalizeBoolean(loaded.backupEnabled, DEFAULT_APP_CONFIG.backupEnabled),
    backupDirectory:
      typeof loaded.backupDirectory === 'string' ? normalizePath(loaded.backupDirectory.trim()) : '',
    backupIntervalMs: Math.round(
      normalizeFiniteNumber(loaded.backupIntervalMs, DEFAULT_APP_CONFIG.backupIntervalMs, { min: 20000 }),
    ),
    expertWriterMode: normalizeBoolean(loaded.expertWriterMode, DEFAULT_APP_CONFIG.expertWriterMode),
    accessibilityHighContrast: normalizeBoolean(
      loaded.accessibilityHighContrast,
      DEFAULT_APP_CONFIG.accessibilityHighContrast,
    ),
    accessibilityLargeText: normalizeBoolean(
      loaded.accessibilityLargeText,
      DEFAULT_APP_CONFIG.accessibilityLargeText,
    ),
    ollamaOptions: {
      ...DEFAULT_APP_CONFIG.ollamaOptions,
      ...(loaded.ollamaOptions ?? {}),
      top_p: normalizeFiniteNumber(
        loadedTopP,
        fallbackTopP,
        { min: 0, max: 1 },
      ),
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

export async function createSagaProject(
  parentDirectory: string,
  title: string,
  description = '',
): Promise<SagaProject> {
  const normalizedTitle = title.trim() || 'Mi saga';
  const folderName = slugify(normalizedTitle) || `saga-${Date.now()}`;
  const parentPath = normalizeFolderPath(sanitizeIncomingPath(parentDirectory));
  const { path: projectPath } = await resolveSagaCreationPath(parentPath, folderName);
  const metadata = await ensureSagaProjectFiles(projectPath, {
    title: normalizedTitle,
    description,
  });

  return {
    path: projectPath,
    metadata,
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

export async function loadSagaProject(path: string): Promise<SagaProject> {
  const existing = await tryLoadExistingSagaProject(path);
  if (!existing) {
    throw new Error('No se encontro saga.json en la carpeta seleccionada.');
  }

  return existing;
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
    storyBible: ensureStoryBible(metadata.storyBible),
    amazon: ensureAmazonData(metadata.amazon, metadata.title, metadata.author),
    backCoverImage: metadata.backCoverImage ?? null,
    spineText: metadata.spineText ?? metadata.title,
    interiorFormat: ensureInteriorFormat(metadata.interiorFormat),
    isPublished: metadata.isPublished ?? false,
    publishedAt: metadata.publishedAt ?? null,
  };

  await writeJson(bookFilePath(bookPath), stripChatsFromMetadata(nextMetadata));
  return nextMetadata;
}

export async function saveSagaMetadata(
  sagaPath: string,
  metadata: SagaMetadata,
): Promise<SagaMetadata> {
  const normalizedSagaPath = normalizeFolderPath(sanitizeIncomingPath(sagaPath));
  const nextMetadata = ensureSagaMetadata({
    ...metadata,
    updatedAt: getNowIso(),
  });

  await mkdir(normalizedSagaPath, { recursive: true });
  await writeJson(sagaFilePath(normalizedSagaPath), nextMetadata);
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
    pointOfView: '',
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

  await removeChapterChatMessages(bookPath, chapterId);
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
  options?: { milestoneLabel?: string | null },
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
    milestoneLabel: options?.milestoneLabel ?? null,
    createdAt: getNowIso(),
    chapter: {
      ...chapter,
      // Guarda snapshot liviano: HTML como fuente de restauracion y JSON opcional en null.
      contentJson: null,
    },
  };

  const fileName = `${chapter.id}_v${nextVersion}.json`;
  await writeJson(joinPath(versionsPath, fileName), snapshot);
  await pruneChapterSnapshots(bookPath, chapter.id, CHAPTER_SNAPSHOT_RETENTION);
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
      const snapshotPath = joinPath(versionsPath, fileName);
      const loadedSnapshot = await readJson<ChapterSnapshot>(snapshotPath);
      const normalized = normalizeChapterSnapshot(loadedSnapshot);
      if (normalized.changed) {
        await writeJson(snapshotPath, normalized.snapshot);
      }
      snapshots.push(normalized.snapshot);
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
  const normalizedSourceImagePath = normalizePath(sanitizeIncomingPath(sourceImagePath));
  if (!normalizedSourceImagePath) {
    throw new Error('Ruta de imagen invalida.');
  }

  const extensionMatch = normalizedSourceImagePath.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'png';
  const safeExtension = safeFileName(extension) || 'png';

  const relativeTarget = joinPath(ASSETS_DIR, `${targetName}.${safeExtension}`);
  const absoluteTarget = joinPath(bookPath, relativeTarget);

  if (!(await exists(normalizedSourceImagePath))) {
    throw new Error(`No se encontro la imagen seleccionada: ${normalizedSourceImagePath}`);
  }

  await mkdir(joinPath(bookPath, ASSETS_DIR), { recursive: true });
  await copyFile(normalizedSourceImagePath, absoluteTarget);

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
    const absolute = resolveStoredImagePath(bookPath, value);
    if (absolute && (await exists(absolute))) {
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

export function getCoverAbsolutePath(
  bookPath: string,
  metadata: Pick<BookMetadata, 'coverImage'>,
): string | null {
  if (!metadata.coverImage) {
    return null;
  }

  const resolved = resolveStoredImagePath(bookPath, metadata.coverImage);
  return resolved || null;
}

export function getBackCoverAbsolutePath(
  bookPath: string,
  metadata: Pick<BookMetadata, 'backCoverImage'>,
): string | null {
  if (!metadata.backCoverImage) {
    return null;
  }

  const resolved = resolveStoredImagePath(bookPath, metadata.backCoverImage);
  return resolved || null;
}

export async function loadBookChatMessages(
  bookPath: string,
  fallbackMessages: ChatMessage[] = [],
): Promise<ChatMessage[]> {
  const normalizedBookPath = normalizePath(bookPath);
  const fallback = ensureChatMessages(fallbackMessages, 'book');
  const targetPath = bookChatFilePath(normalizedBookPath);

  if (!(await exists(targetPath))) {
    return fallback;
  }

  try {
    const loaded = await readJson<unknown>(targetPath);
    return ensureChatMessages(loaded, 'book');
  } catch {
    return fallback;
  }
}

export async function loadChapterChatMessages(
  bookPath: string,
  chapterId: string,
  fallbackMessages: ChatMessage[] = [],
): Promise<ChatMessage[]> {
  const normalizedBookPath = normalizePath(bookPath);
  const safeChapterId = chapterId.trim();
  const fallback = ensureChatMessages(fallbackMessages, 'chapter');

  if (!safeChapterId) {
    return fallback;
  }

  const targetPath = chapterChatFilePath(normalizedBookPath, safeChapterId);
  if (!(await exists(targetPath))) {
    return fallback;
  }

  try {
    const loaded = await readJson<unknown>(targetPath);
    return ensureChatMessages(loaded, 'chapter');
  } catch {
    return fallback;
  }
}

export async function saveBookChatMessages(bookPath: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
  const normalizedBookPath = normalizePath(bookPath);
  const normalizedMessages = ensureChatMessages(messages, 'book');
  const targetDirectory = chatsDirPath(normalizedBookPath);
  await mkdir(targetDirectory, { recursive: true });
  await writeJson(bookChatFilePath(normalizedBookPath), normalizedMessages);
  return normalizedMessages;
}

export async function saveChapterChatMessages(
  bookPath: string,
  chapterId: string,
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const normalizedBookPath = normalizePath(bookPath);
  const safeChapterId = chapterId.trim();
  const normalizedMessages = ensureChatMessages(messages, 'chapter');

  if (!safeChapterId) {
    return normalizedMessages;
  }

  const targetDirectory = chatsDirPath(normalizedBookPath);
  await mkdir(targetDirectory, { recursive: true });
  await writeJson(chapterChatFilePath(normalizedBookPath, safeChapterId), normalizedMessages);
  return normalizedMessages;
}

export async function removeChapterChatMessages(bookPath: string, chapterId: string): Promise<void> {
  const normalizedBookPath = normalizePath(bookPath);
  const safeChapterId = chapterId.trim();
  if (!safeChapterId) {
    return;
  }

  const targetPath = chapterChatFilePath(normalizedBookPath, safeChapterId);
  if (await exists(targetPath)) {
    await remove(targetPath);
  }
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

export async function writeBinaryExport(
  bookPath: string,
  fileName: string,
  content: Uint8Array,
  fallbackExtension = 'bin',
): Promise<string> {
  const exportPath = exportsDirPath(bookPath);
  await mkdir(exportPath, { recursive: true });

  const safeName = sanitizeExportFileName(fileName, fallbackExtension);
  const absolutePath = joinPath(exportPath, safeName);
  await writeFile(absolutePath, content);
  return absolutePath;
}

export async function writeMarkdownExport(
  bookPath: string,
  fileName: string,
  content: string,
): Promise<string> {
  return writeTextExport(bookPath, fileName, content, 'md');
}

function normalizePromptTemplates(values: unknown): PromptTemplate[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: PromptTemplate[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry as Partial<PromptTemplate>;
    const title = String(payload.title ?? '').trim();
    const content = String(payload.content ?? '').trim();
    if (!title || !content) {
      continue;
    }

    normalized.push({
      id: typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomId('prompt'),
      title,
      content,
      createdAt: typeof payload.createdAt === 'string' && payload.createdAt.trim() ? payload.createdAt : getNowIso(),
      updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim() ? payload.updatedAt : getNowIso(),
    });
  }

  return normalized;
}

export async function loadPromptTemplates(bookPath: string): Promise<PromptTemplate[]> {
  const normalizedBookPath = normalizePath(bookPath);
  const targetPath = promptsFilePath(normalizedBookPath);
  if (!(await exists(targetPath))) {
    const defaults = buildDefaultPromptTemplates();
    await writeJson(targetPath, defaults);
    return defaults;
  }

  try {
    const loaded = await readJson<unknown>(targetPath);
    const normalized = normalizePromptTemplates(loaded);
    if (normalized.length === 0) {
      const defaults = buildDefaultPromptTemplates();
      await writeJson(targetPath, defaults);
      return defaults;
    }
    return normalized;
  } catch {
    const defaults = buildDefaultPromptTemplates();
    await writeJson(targetPath, defaults);
    return defaults;
  }
}

export async function savePromptTemplates(bookPath: string, templates: PromptTemplate[]): Promise<PromptTemplate[]> {
  const normalizedBookPath = normalizePath(bookPath);
  const targetPath = promptsFilePath(normalizedBookPath);
  const normalized = normalizePromptTemplates(templates);
  await writeJson(targetPath, normalized);
  return normalized;
}

export async function writeCollaborationPatchExport(
  bookPath: string,
  patch: CollaborationPatch,
): Promise<string> {
  const safeTitle = safeFileName(patch.sourceBookTitle) || 'libro';
  const safeDate = safeFileName(patch.createdAt.replaceAll(':', '-')) || randomId('patch');
  return writeTextExport(
    bookPath,
    `patch-colaboracion-${safeTitle}-${safeDate}.json`,
    JSON.stringify(patch, null, 2),
    'json',
  );
}

export async function readCollaborationPatchFile(filePath: string): Promise<CollaborationPatch> {
  const raw = await readTextFile(normalizePath(filePath));
  const parsed = JSON.parse(raw) as Partial<CollaborationPatch>;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.chapters)) {
    throw new Error('Patch invalido.');
  }

  const normalizedChapters = parsed.chapters
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const payload = entry as Partial<CollaborationPatch['chapters'][number]>;
      const chapterId = String(payload.chapterId ?? '').trim();
      const title = String(payload.title ?? '').trim();
      const content = String(payload.content ?? '');
      if (!chapterId || !title) {
        return null;
      }
      return {
        chapterId,
        title,
        content,
        updatedAt:
          typeof payload.updatedAt === 'string' && payload.updatedAt.trim()
            ? payload.updatedAt
            : getNowIso(),
      };
    })
    .filter((item): item is CollaborationPatch['chapters'][number] => Boolean(item));

  if (normalizedChapters.length === 0) {
    throw new Error('Patch sin capitulos validos.');
  }

  return {
    version: 1,
    patchId: typeof parsed.patchId === 'string' && parsed.patchId.trim() ? parsed.patchId : randomId('patch'),
    createdAt: typeof parsed.createdAt === 'string' && parsed.createdAt.trim() ? parsed.createdAt : getNowIso(),
    sourceBookTitle:
      typeof parsed.sourceBookTitle === 'string' && parsed.sourceBookTitle.trim()
        ? parsed.sourceBookTitle
        : 'Libro externo',
    sourceAuthor:
      typeof parsed.sourceAuthor === 'string' && parsed.sourceAuthor.trim()
        ? parsed.sourceAuthor
        : 'Autor externo',
    sourceLanguage:
      typeof parsed.sourceLanguage === 'string' && parsed.sourceLanguage.trim()
        ? parsed.sourceLanguage
        : 'es',
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    chapters: normalizedChapters,
  };
}

async function copyDirectoryRecursive(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readDir(sourceDir);
  for (const entry of entries) {
    const sourcePath = joinPath(sourceDir, entry.name);
    const targetPath = joinPath(targetDir, entry.name);
    if (entry.isDirectory) {
      await copyDirectoryRecursive(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
}

function isNestedPath(parentPath: string, childPath: string): boolean {
  const normalizedParent = normalizeFolderPath(parentPath);
  const normalizedChild = normalizeFolderPath(childPath);
  if (!normalizedParent || !normalizedChild || normalizedParent === normalizedChild) {
    return normalizedParent === normalizedChild;
  }

  return normalizedChild.startsWith(`${normalizedParent}/`);
}

export function formatBackupSnapshotStamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return 'snapshot';
  }

  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export function buildBackupSnapshotFolderName(bookPath: string, createdAt: string): string {
  const sourceRoot = normalizeFolderPath(bookPath);
  const folderName = sourceRoot.split('/').filter(Boolean).pop() ?? 'book';
  const safeFolderName = safeFileName(folderName) || 'book';
  return `${formatBackupSnapshotStamp(createdAt)}-${safeFolderName}`;
}

export function buildBackupSnapshotManifest(input: {
  createdAt: string;
  sourceBookPath: string;
  linkedSagaPath: string | null;
  snapshotFolderName: string;
  items: BackupSnapshotManifestItem[];
}): BackupSnapshotManifest {
  return {
    version: 1,
    createdAt: input.createdAt,
    sourceBookPath: normalizeFolderPath(input.sourceBookPath),
    linkedSagaPath: input.linkedSagaPath ? normalizeFolderPath(input.linkedSagaPath) : null,
    snapshotFolderName: input.snapshotFolderName.trim() || 'snapshot',
    items: input.items.map((item) => ({
      ...item,
      sourcePath: normalizeFolderPath(item.sourcePath),
      targetRelativePath: normalizePath(item.targetRelativePath).replace(/^\/+/, ''),
    })),
  };
}

async function resolveUniqueDirectoryPath(rootPath: string, preferredName: string): Promise<string> {
  const safeName = safeFileName(preferredName) || 'snapshot';
  let candidate = joinPath(rootPath, safeName);
  let index = 2;

  while (await exists(candidate)) {
    candidate = joinPath(rootPath, `${safeName}-${index}`);
    index += 1;
  }

  return candidate;
}

export async function syncBookToBackupDirectory(
  bookPath: string,
  backupDirectory: string,
  options?: { linkedSagaPath?: string | null; createdAt?: string },
): Promise<BackupSnapshotResult> {
  const sourceRoot = normalizePath(bookPath);
  const backupRoot = normalizePath(backupDirectory);
  if (!sourceRoot || !backupRoot) {
    throw new Error('Ruta de backup invalida.');
  }

  if (isNestedPath(sourceRoot, backupRoot)) {
    throw new Error('La carpeta de backup no puede estar dentro del libro.');
  }

  const normalizedLinkedSagaPath = options?.linkedSagaPath
    ? normalizeFolderPath(sanitizeIncomingPath(options.linkedSagaPath))
    : null;

  if (normalizedLinkedSagaPath && isNestedPath(normalizedLinkedSagaPath, backupRoot)) {
    throw new Error('La carpeta de backup no puede estar dentro de la saga vinculada.');
  }

  const createdAt = options?.createdAt?.trim() || getNowIso();
  const snapshotFolderName = buildBackupSnapshotFolderName(sourceRoot, createdAt);
  const targetPath = await resolveUniqueDirectoryPath(backupRoot, snapshotFolderName);
  await mkdir(targetPath, { recursive: true });

  const copiedItems: BackupSnapshotManifestItem[] = [];
  const bookFolderName = safeFileName(sourceRoot.split('/').filter(Boolean).pop() ?? 'book') || 'book';
  await copyDirectoryRecursive(sourceRoot, joinPath(targetPath, bookFolderName));
  copiedItems.push({
    kind: 'book',
    sourcePath: sourceRoot,
    targetRelativePath: bookFolderName,
    copied: true,
  });

  let copiedSaga = false;
  if (normalizedLinkedSagaPath) {
    const sagaTargetFolder = joinPath(
      'linked-saga',
      safeFileName(normalizedLinkedSagaPath.split('/').filter(Boolean).pop() ?? 'saga') || 'saga',
    );
    if (await exists(sagaFilePath(normalizedLinkedSagaPath))) {
      await copyDirectoryRecursive(normalizedLinkedSagaPath, joinPath(targetPath, sagaTargetFolder));
      copiedSaga = true;
      copiedItems.push({
        kind: 'saga',
        sourcePath: normalizedLinkedSagaPath,
        targetRelativePath: sagaTargetFolder,
        copied: true,
      });
    } else {
      copiedItems.push({
        kind: 'saga',
        sourcePath: normalizedLinkedSagaPath,
        targetRelativePath: sagaTargetFolder,
        copied: false,
        note: 'No se encontro saga.json en la ruta vinculada.',
      });
    }
  }

  const manifest = buildBackupSnapshotManifest({
    createdAt,
    sourceBookPath: sourceRoot,
    linkedSagaPath: normalizedLinkedSagaPath,
    snapshotFolderName: targetPath.split('/').filter(Boolean).pop() ?? snapshotFolderName,
    items: copiedItems,
  });
  const manifestPath = joinPath(targetPath, 'backup-manifest.json');
  await writeJson(manifestPath, manifest);

  return {
    targetPath,
    manifestPath,
    copiedSaga,
  };
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
    sagas: loaded.sagas ?? [],
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
    sagaId: project.metadata.sagaId,
    sagaPath: project.metadata.sagaPath,
    sagaVolume: project.metadata.sagaVolume,
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

export async function upsertSagaInLibrary(
  project: SagaProject,
  options?: { markOpened?: boolean },
): Promise<LibraryIndex> {
  const index = await loadLibraryIndex();
  const now = getNowIso();
  const existing = index.sagas.find((entry) => entry.path === project.path);
  const nextEntry: LibrarySagaEntry = {
    id: existing?.id ?? project.metadata.id ?? randomId('saga'),
    path: project.path,
    title: project.metadata.title,
    description: project.metadata.description,
    bookCount: project.metadata.books.length,
    lastOpenedAt: options?.markOpened ? now : existing?.lastOpenedAt ?? now,
    updatedAt: now,
  };

  const nextSagas = [...index.sagas.filter((entry) => entry.path !== project.path), nextEntry].sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  );
  const nextIndex: LibraryIndex = {
    ...index,
    sagas: nextSagas,
    updatedAt: now,
  };
  await saveLibraryIndex(nextIndex);
  return nextIndex;
}

export async function syncBookReferenceInLinkedSaga(project: BookProject): Promise<SagaProject | null> {
  if (!project.metadata.sagaPath || !project.metadata.sagaId) {
    return null;
  }

  const existingSaga = await tryLoadExistingSagaProject(project.metadata.sagaPath);
  if (!existingSaga || existingSaga.metadata.id !== project.metadata.sagaId) {
    return null;
  }

  const nextMetadata = syncSagaMetadataWithBook(existingSaga.metadata, project, project.metadata.sagaVolume);
  const savedMetadata = await saveSagaMetadata(existingSaga.path, nextMetadata);
  const savedSaga: SagaProject = {
    path: existingSaga.path,
    metadata: savedMetadata,
  };
  await syncSagaLinksToBooks(savedSaga);
  return savedSaga;
}

export async function attachBookToSaga(
  book: BookProject,
  sagaPath: string,
): Promise<{ book: BookProject; saga: SagaProject; updatedBooks: BookProject[] }> {
  const normalizedTargetSagaPath = normalizeFolderPath(sanitizeIncomingPath(sagaPath));
  if (!normalizedTargetSagaPath) {
    throw new Error('Saga invalida.');
  }

  const targetSaga = await loadSagaProject(normalizedTargetSagaPath);
  if (book.metadata.sagaPath && normalizeFolderPath(book.metadata.sagaPath) !== targetSaga.path) {
    const previousSaga = await tryLoadExistingSagaProject(book.metadata.sagaPath);
    if (previousSaga) {
      const cleanedPrevious = removeBookFromSagaMetadata(previousSaga.metadata, book.path);
      await saveSagaMetadata(previousSaga.path, cleanedPrevious);
    }
  }

  const currentLink = targetSaga.metadata.books.find(
    (entry) => normalizeFolderPath(entry.bookPath) === normalizeFolderPath(book.path),
  );
  const targetVolume =
    currentLink?.volumeNumber ??
    normalizeSagaVolume(book.metadata.sagaVolume) ??
    getNextSagaVolume(targetSaga.metadata.books);
  const savedBookMetadata = await saveBookMetadata(book.path, {
    ...book.metadata,
    sagaId: targetSaga.metadata.id,
    sagaPath: targetSaga.path,
    sagaVolume: targetVolume,
  });
  const savedBook: BookProject = {
    ...book,
    metadata: savedBookMetadata,
  };
  const syncedSaga = await syncBookReferenceInLinkedSaga(savedBook);
  if (!syncedSaga) {
    throw new Error('No se pudo sincronizar el libro con la saga.');
  }
  const refreshedBook = await loadBookProject(savedBook.path);
  const updatedBooks: BookProject[] = [];
  for (const link of syncedSaga.metadata.books) {
    try {
      updatedBooks.push(await loadBookProject(link.bookPath));
    } catch {
      // Ignora libros faltantes en disco.
    }
  }

  return {
    book: refreshedBook,
    saga: syncedSaga,
    updatedBooks,
  };
}

export async function detachBookFromSaga(
  book: BookProject,
): Promise<{ book: BookProject; saga: SagaProject | null }> {
  let updatedSaga: SagaProject | null = null;
  if (book.metadata.sagaPath) {
    const currentSaga = await tryLoadExistingSagaProject(book.metadata.sagaPath);
    if (currentSaga) {
      const detachedMetadata = removeBookFromSagaMetadata(currentSaga.metadata, book.path);
      const nextMetadata = ensureSagaMetadata({
        ...detachedMetadata,
        books: rebalanceSagaBookLinks(detachedMetadata.books),
      });
      const savedMetadata = await saveSagaMetadata(currentSaga.path, nextMetadata);
      updatedSaga = {
        path: currentSaga.path,
        metadata: savedMetadata,
      };
      await syncSagaLinksToBooks(updatedSaga);
    }
  }

  const savedBookMetadata = await saveBookMetadata(book.path, {
    ...book.metadata,
    sagaId: null,
    sagaPath: null,
    sagaVolume: null,
  });

  return {
    book: {
      ...book,
      metadata: savedBookMetadata,
    },
    saga: updatedSaga,
  };
}

export async function updateSagaBookVolume(
  sagaPath: string,
  bookPath: string,
  volumeNumber: number,
): Promise<{ saga: SagaProject; updatedBooks: BookProject[] }> {
  const saga = await loadSagaProject(sagaPath);
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const current = saga.metadata.books.find((entry) => normalizeFolderPath(entry.bookPath) === normalizedBookPath);
  if (!current) {
    throw new Error('El libro no pertenece a la saga seleccionada.');
  }

  const nextBooks = rebalanceSagaBookLinks(
    saga.metadata.books.map((entry) =>
      normalizeFolderPath(entry.bookPath) === normalizedBookPath
        ? {
            ...entry,
            volumeNumber,
          }
        : entry,
    ),
    normalizedBookPath,
    volumeNumber,
  );
  const savedMetadata = await saveSagaMetadata(saga.path, {
    ...saga.metadata,
    books: nextBooks,
  });
  const savedSaga: SagaProject = {
    path: saga.path,
    metadata: savedMetadata,
  };
  const updatedBooks = await syncSagaLinksToBooks(savedSaga);
  return {
    saga: savedSaga,
    updatedBooks,
  };
}

export async function moveSagaBook(
  sagaPath: string,
  bookPath: string,
  direction: 'up' | 'down',
): Promise<{ saga: SagaProject; updatedBooks: BookProject[] }> {
  const saga = await loadSagaProject(sagaPath);
  const normalizedBooks = rebalanceSagaBookLinks(saga.metadata.books);
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  const currentIndex = normalizedBooks.findIndex((entry) => normalizeFolderPath(entry.bookPath) === normalizedBookPath);
  if (currentIndex < 0) {
    throw new Error('El libro no pertenece a la saga seleccionada.');
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= normalizedBooks.length) {
    const savedMetadata = await saveSagaMetadata(saga.path, {
      ...saga.metadata,
      books: normalizedBooks,
    });
    const savedSaga: SagaProject = {
      path: saga.path,
      metadata: savedMetadata,
    };
    const updatedBooks = await syncSagaLinksToBooks(savedSaga);
    return {
      saga: savedSaga,
      updatedBooks,
    };
  }

  const reordered = [...normalizedBooks];
  const pivot = reordered[currentIndex];
  reordered[currentIndex] = reordered[targetIndex];
  reordered[targetIndex] = pivot;
  const nextBooks = reordered.map((entry, index) => ({
    ...entry,
    volumeNumber: index + 1,
  }));
  const savedMetadata = await saveSagaMetadata(saga.path, {
    ...saga.metadata,
    books: nextBooks,
  });
  const savedSaga: SagaProject = {
    path: saga.path,
    metadata: savedMetadata,
  };
  const updatedBooks = await syncSagaLinksToBooks(savedSaga);
  return {
    saga: savedSaga,
    updatedBooks,
  };
}

export async function removeSagaFromLibrary(
  sagaPath: string,
  options?: { deleteFiles?: boolean },
): Promise<{ index: LibraryIndex; detachedBooks: BookProject[] }> {
  const saga = await loadSagaProject(sagaPath);
  const detachedBooks = await clearSagaLinksFromBooks(saga);

  if (options?.deleteFiles) {
    const normalizedSagaPath = normalizeFolderPath(sanitizeIncomingPath(sagaPath));
    if (!(await exists(sagaFilePath(normalizedSagaPath)))) {
      throw new Error('La carpeta no parece una saga valida. Se cancelo el borrado por seguridad.');
    }

    await remove(normalizedSagaPath, { recursive: true });
  }

  const index = await loadLibraryIndex();
  const nextIndex: LibraryIndex = {
    ...index,
    sagas: index.sagas.filter((entry) => normalizeFolderPath(entry.path) !== normalizeFolderPath(saga.path)),
    updatedAt: getNowIso(),
  };
  await saveLibraryIndex(nextIndex);
  return {
    index: nextIndex,
    detachedBooks,
  };
}

export async function removeBookFromLibrary(
  bookPath: string,
  options?: { deleteFiles?: boolean },
): Promise<LibraryIndex> {
  const normalizedBookPath = normalizeFolderPath(sanitizeIncomingPath(bookPath));
  let linkedSagaPath: string | null = null;

  if (options?.deleteFiles && (await exists(normalizedBookPath))) {
    const hasBookJson = await exists(bookFilePath(normalizedBookPath));
    const hasScaffold = await isBookScaffoldDirectory(normalizedBookPath);
    if (!hasBookJson && !hasScaffold) {
      throw new Error('La carpeta no parece un proyecto de libro valido. Se cancelo el borrado por seguridad.');
    }

    if (hasBookJson) {
      try {
        const metadata = await readJson<Partial<BookMetadata>>(bookFilePath(normalizedBookPath));
        linkedSagaPath =
          typeof metadata.sagaPath === 'string' && metadata.sagaPath.trim()
            ? normalizeFolderPath(metadata.sagaPath)
            : null;
      } catch {
        linkedSagaPath = null;
      }
    }

    if (linkedSagaPath) {
      const linkedSaga = await tryLoadExistingSagaProject(linkedSagaPath);
      if (linkedSaga) {
        const detachedMetadata = removeBookFromSagaMetadata(linkedSaga.metadata, normalizedBookPath);
        const nextSagaMetadata = ensureSagaMetadata({
          ...detachedMetadata,
          books: rebalanceSagaBookLinks(detachedMetadata.books),
        });
        const savedMetadata = await saveSagaMetadata(linkedSaga.path, nextSagaMetadata);
        await syncSagaLinksToBooks({
          path: linkedSaga.path,
          metadata: savedMetadata,
        });
      }
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
