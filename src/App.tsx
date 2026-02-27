import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { exists, readFile } from '@tauri-apps/plugin-fs';

import AppShell from './app/AppShell';
import Sidebar from './components/Sidebar';
import TopToolbar from './components/TopToolbar';
import type { TiptapEditorHandle } from './components/TiptapEditor';
import { formatChapterLengthLabel, getChapterLengthProfile, resolveChapterLengthPreset } from './lib/chapterLength';
import { DEFAULT_APP_CONFIG } from './lib/config';
import { countWordsFromHtml, countWordsFromPlainText, estimatePagesFromWords, formatNumber } from './lib/metrics';
import {
  buildBookAudioExportPath,
  buildBookAudioText,
  buildChapterAudioExportPath,
  buildChapterAudioText,
  exportAudiobookToWav,
  pickSpeechVoice,
  type AudioPlaybackState,
} from './lib/audio';
import { generateWithOllama } from './lib/ollamaClient';
import {
  AI_ACTIONS,
  buildActionPrompt,
  buildAutoRewritePrompt,
  buildChatPrompt,
  buildContinuityGuardPrompt,
  buildContinuousChapterPrompt,
  parseContinuityGuardOutput,
  selectStoryBibleForPrompt,
} from './lib/prompts';
import { getLanguageInstruction, normalizeLanguageCode } from './lib/language';
import PromptModal from './components/PromptModal';
import OnboardingPanel from './components/OnboardingPanel';
import ChangeReviewModal from './components/ChangeReviewModal';
import EditorialChecklistModal from './components/EditorialChecklistModal';
import {
  clearBackCoverImage,
  clearCoverImage,
  createBookProject,
  createChapter,
  deleteChapter,
  duplicateChapter,
  getBackCoverAbsolutePath,
  getCoverAbsolutePath,
  listChapterSnapshots,
  loadAppConfig,
  loadLibraryIndex,
  loadBookProject,
  loadBookChatMessages,
  loadChapterChatMessages,
  loadPromptTemplates,
  savePromptTemplates,
  readCollaborationPatchFile,
  writeCollaborationPatchExport,
  syncBookToBackupDirectory,
  resolveBookDirectory,
  moveChapter,
  renameChapter,
  removeBookFromLibrary,
  saveAppConfig,
  saveBookMetadata,
  saveBookChatMessages,
  saveChapter,
  saveChapterChatMessages,
  saveChapterSnapshot,
  setBackCoverImage,
  setCoverImage,
  upsertBookInLibrary,
} from './lib/storage';
import {
  buildBookSearchMatches,
  buildBookSearchMatchesAsync,
  buildBookReplacePreviewAsync,
  replaceMatchesInHtml,
  type ChapterSearchMatch,
  type ReplacePreviewReport,
  type SearchReplaceOptions,
} from './lib/searchReplace';
import { buildCharacterTrackingReport, formatCharacterTrackingReport } from './lib/characterTracking';
import { normalizeChapterRange, sliceByChapterRange } from './lib/chapterRange';
import {
  buildCollaborationPatchPreview,
  formatCollaborationPatchPreviewMessage,
} from './lib/collaborationPatchPreview';
import { buildStoryBibleAutoSyncFromChapter } from './lib/storyBibleSync';
import {
  buildStoryProgressDigest,
  buildStoryProgressPrompt,
  formatStoryProgressFallback,
} from './lib/storyProgressSummary';
import { buildEditorialChecklist, type EditorialChecklistReport } from './lib/editorialChecklist';
import { getNowIso, normalizeAiOutput, plainTextToHtml, randomId, splitAiOutputAndSummary, stripHtml } from './lib/text';
import type {
  AppConfig,
  BookChats,
  BookProject,
  ChapterLengthPreset,
  ChapterRangeFilter,
  ChatMessage,
  ChatScope,
  CollaborationPatch,
  LibraryIndex,
  MainView,
  PromptTemplate,
} from './types/book';

import './App.css';

const LazyAIPanel = lazy(() => import('./components/AIPanel'));
const LazyAmazonPanel = lazy(() => import('./components/AmazonPanel'));
const LazyBookFoundationPanel = lazy(() => import('./components/BookFoundationPanel'));
const LazyCoverView = lazy(() => import('./components/CoverView'));
const LazyEditorPane = lazy(() => import('./components/EditorPane'));
const LazyHelpPanel = lazy(() => import('./components/HelpPanel'));
const LazyLanguagePanel = lazy(() => import('./components/LanguagePanel'));
const LazyOutlineView = lazy(() => import('./components/OutlineView'));
const LazyPreviewView = lazy(() => import('./components/PreviewView'));
const LazySearchReplacePanel = lazy(() => import('./components/SearchReplacePanel'));
const LazySettingsPanel = lazy(() => import('./components/SettingsPanel'));
const LazyStoryBiblePanel = lazy(() => import('./components/StoryBiblePanel'));
const LazyStylePanel = lazy(() => import('./components/StylePanel'));
const LazyVersionDiffView = lazy(() => import('./components/VersionDiffView'));

let exportModulePromise: Promise<typeof import('./lib/export')> | null = null;

async function loadExportModule(): Promise<typeof import('./lib/export')> {
  if (!exportModulePromise) {
    exportModulePromise = import('./lib/export');
  }

  return exportModulePromise;
}

function buildBookContext(book: BookProject, chaptersOverride?: BookProject['chapters']): string {
  const chapters = chaptersOverride ?? book.chapters;
  return book.metadata.chapterOrder
    .map((chapterId, index) => {
      const chapter = chapters[chapterId];
      if (!chapter) {
        return '';
      }
      return `Capitulo ${index + 1}: ${chapter.title}\n${stripHtml(chapter.content)}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function parseContinuousAgentOutput(raw: string): { status: 'DONE' | 'CONTINUE'; summary: string; text: string } {
  const normalized = raw.trim();
  const statusMatch = normalized.match(/ESTADO:\s*(DONE|CONTINUE)/i);
  const summaryMatch = normalized.match(/RESUMEN:\s*(.*)/i);
  const textMatch = normalized.match(/TEXTO:\s*([\s\S]*)$/i);

  const status = (statusMatch?.[1]?.toUpperCase() as 'DONE' | 'CONTINUE' | undefined) ?? 'CONTINUE';
  const summary = summaryMatch?.[1]?.trim() ?? '';
  const text = textMatch?.[1]?.trim() || normalized;

  return { status, summary, text };
}

function buildSummaryMessage(summaryText: string, title?: string): string {
  const trimmed = summaryText.trim();
  if (!trimmed) {
    return '';
  }

  if (!title) {
    return `Resumen de cambios:\n${trimmed}`;
  }

  return `${title}\n${trimmed}`;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (typeof error === 'number' || typeof error === 'boolean') {
    return String(error);
  }

  if (error && typeof error === 'object') {
    const payload = error as { name?: unknown; code?: unknown; message?: unknown };
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

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch {
      // Ignora errores de serializacion.
    }
  }

  return 'Error desconocido';
}

function extractDialogPath(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        return item.trim();
      }

      if (item && typeof item === 'object') {
        const payload = item as { path?: unknown };
        if (typeof payload.path === 'string' && payload.path.trim()) {
          return payload.path.trim();
        }
      }
    }
    return null;
  }

  if (value && typeof value === 'object') {
    const payload = value as { path?: unknown };
    if (typeof payload.path === 'string' && payload.path.trim()) {
      return payload.path.trim();
    }
  }

  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest('[contenteditable="true"]'));
}

function getNextChapterIdFromOrder(order: string[]): string {
  const existing = new Set(order);
  for (let index = 1; index <= 9999; index += 1) {
    const candidate = String(index).padStart(2, '0');
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `${Date.now()}`;
}

const EXPANSION_INTENT_PATTERN = /\b(alarg(?:a|ar|ue|uen|ado|ando)?|expand(?:e|ir|io|ido|iendo)?|ampli(?:a|ar|e|en|ado|ando)?|ext(?:ender|iende|endido)|desarroll(?:a|ar|ado)|profundiz(?:a|ar|ado)|mas largo|m[aá]s largo)\b/i;
const SHORTEN_INTENT_PATTERN = /\b(acort(?:a|ar|ado)|resum(?:e|ir|ido)|reduc(?:e|ir|ido)|sintetiz(?:a|ar|ado)|abrevi(?:a|ar|ado))\b/i;
const WORD_TARGET_PATTERN = /\b(\d{2,5})\s*(?:palabras?|words?)\b/i;
const EXPANSION_ACTIONS = new Set<(typeof AI_ACTIONS)[number]['id']>([
  'expand-examples',
  'deepen-argument',
  'draft-from-idea',
]);
const FALLBACK_INTERIOR_FORMAT = {
  trimSize: '6x9' as const,
  pageWidthIn: 6,
  pageHeightIn: 9,
  marginTopMm: 18,
  marginBottomMm: 18,
  marginInsideMm: 20,
  marginOutsideMm: 16,
  paragraphIndentEm: 1.4,
  lineHeight: 1.55,
};
const AUTOSAVE_TIMEOUT_MS = 15_000;
const REPLACE_BOOK_YIELD_EVERY = 3;
const ONBOARDING_DISMISSED_KEY = 'writewme:onboarding-dismissed-v1';
const AI_SAFE_MIN_DIFF_WORDS = 120;
const AI_SAFE_MIN_CHANGE_RATIO = 0.28;

interface CoverFileInfo {
  extension: string;
  bytes: number;
}

interface CoverLoadResult {
  url: string | null;
  diagnostic: string | null;
  fileInfo: CoverFileInfo | null;
}

interface AiSafeReviewState {
  title: string;
  subtitle: string;
  beforeText: string;
  afterText: string;
  resolve: (approved: boolean) => void;
}

interface EditorialIntentState {
  isOpen: boolean;
  allowProceed: boolean;
  report: EditorialChecklistReport | null;
  intentLabel: string;
  onProceed?: (() => void) | null;
}

function inferImageMimeFromPath(path: string): string {
  const normalized = path.trim().toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'image/png';
  }
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (normalized.endsWith('.webp')) {
    return 'image/webp';
  }
  if (normalized.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'application/octet-stream';
}

function inferImageExtensionFromPath(path: string): string {
  const normalized = path.trim().toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'jpg';
  }
  if (normalized.endsWith('.png')) {
    return 'png';
  }
  if (normalized.endsWith('.webp')) {
    return 'webp';
  }
  if (normalized.endsWith('.gif')) {
    return 'gif';
  }
  return 'unknown';
}

function shouldRequireAiSafeReview(beforeText: string, afterText: string): boolean {
  const beforeWords = countWordsFromPlainText(beforeText);
  const afterWords = countWordsFromPlainText(afterText);
  const baseline = Math.max(1, beforeWords);
  const absoluteDiff = Math.abs(afterWords - beforeWords);
  const ratioDiff = absoluteDiff / baseline;

  if (beforeText.trim() !== afterText.trim() && beforeWords === 0 && afterWords >= 90) {
    return true;
  }

  return absoluteDiff >= AI_SAFE_MIN_DIFF_WORDS || ratioDiff >= AI_SAFE_MIN_CHANGE_RATIO;
}

function revokeBlobUrl(value: string | null): void {
  if (!value || !value.startsWith('blob:')) {
    return;
  }
  URL.revokeObjectURL(value);
}

interface ExpansionGuardResult {
  text: string;
  summaryText: string;
  corrected: boolean;
}

interface ContinuityGuardResult {
  text: string;
  summaryText: string;
  corrected: boolean;
}

type CoverProject = {
  path: string;
  metadata: Pick<BookProject['metadata'], 'coverImage' | 'backCoverImage'>;
};

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  let timer: number | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${context}: timeout (${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

function parseWordTarget(value: string): number | null {
  const match = value.match(WORD_TARGET_PATTERN);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 30 || parsed > 50000) {
    return null;
  }

  return parsed;
}

function shouldEnforceExpansion(actionId: (typeof AI_ACTIONS)[number]['id'] | null, instruction: string): boolean {
  if (actionId === 'shorten-20') {
    return false;
  }

  if (actionId && EXPANSION_ACTIONS.has(actionId)) {
    return true;
  }

  if (!instruction.trim()) {
    return false;
  }

  if (SHORTEN_INTENT_PATTERN.test(instruction)) {
    return false;
  }

  return EXPANSION_INTENT_PATTERN.test(instruction);
}

function resolveExpansionMinimumWords(instruction: string, originalText: string): number {
  const originalWords = countWordsFromPlainText(originalText);
  const explicitTarget = parseWordTarget(instruction);

  if (explicitTarget !== null) {
    return Math.max(explicitTarget, originalWords);
  }

  return originalWords;
}

function buildExpansionRecoveryPrompt(input: {
  instruction: string;
  bookTitle: string;
  chapterTitle: string;
  language: string;
  minWords: number;
  originalText: string;
  candidateText: string;
}): string {
  return [
    'MODO: correccion de longitud.',
    `Libro: ${input.bookTitle}`,
    `Capitulo: ${input.chapterTitle}`,
    getLanguageInstruction(input.language),
    `Objetivo minimo: ${input.minWords} palabras.`,
    '',
    'La salida previa redujo el texto y no cumplio la instruccion de expansion.',
    '',
    'Instruccion original del usuario:',
    input.instruction,
    '',
    'Texto original antes del cambio:',
    input.originalText || '(vacio)',
    '',
    'Salida previa que no cumple:',
    input.candidateText || '(vacio)',
    '',
    'Reglas de salida:',
    '- Devuelve solo el texto final del capitulo.',
    `- Debe tener al menos ${input.minWords} palabras.`,
    '- Mantene continuidad, tono y coherencia narrativa.',
    '- No agregues resumen de cambios ni explicaciones.',
  ].join('\n');
}

function App() {
  const editorRef = useRef<TiptapEditorHandle | null>(null);
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const languageSaveResetTimerRef = useRef<number | null>(null);
  const snapshotUndoCursorRef = useRef<Record<string, number | undefined>>({});
  const snapshotRedoStackRef = useRef<Record<string, BookProject['chapters'][string][]>>({});
  const coverRefreshTokenRef = useRef(0);
  const coverSrcRef = useRef<string | null>(null);
  const backCoverSrcRef = useRef<string | null>(null);
  const backupInFlightRef = useRef(false);
  const lastBackupAtRef = useRef(0);
  const audioUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const chatMessagesRef = useRef<BookChats>({
    book: [],
    chapters: {},
  });
  const loadedChatScopesRef = useRef<{
    bookPath: string | null;
    book: boolean;
    chapters: Record<string, boolean>;
  }>({
    bookPath: null,
    book: false,
    chapters: {},
  });

  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [book, setBook] = useState<BookProject | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>('editor');
  const [status, setStatus] = useState('Listo.');
  const [aiBusy, setAiBusy] = useState(false);
  const [audioPlaybackState, setAudioPlaybackState] = useState<AudioPlaybackState>('idle');
  const [chatScope, setChatScope] = useState<ChatScope>('chapter');
  const [chatMessages, setChatMessages] = useState<BookChats>({
    book: [],
    chapters: {},
  });
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [backCoverSrc, setBackCoverSrc] = useState<string | null>(null);
  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex>({
    books: [],
    statusRules: {
      advancedChapterThreshold: 6,
    },
    updatedAt: getNowIso(),
  });
  const [libraryExpanded, setLibraryExpanded] = useState(true);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMatches, setSearchMatches] = useState<ChapterSearchMatch[]>([]);
  const [searchTotalMatches, setSearchTotalMatches] = useState(0);
  const [searchPreviewReport, setSearchPreviewReport] = useState<ReplacePreviewReport | null>(null);
  const [canUndoEdit, setCanUndoEdit] = useState(false);
  const [canRedoEdit, setCanRedoEdit] = useState(false);
  const [snapshotRedoNonce, setSnapshotRedoNonce] = useState(0);
  const [coverLoadDiagnostics, setCoverLoadDiagnostics] = useState<{ cover: string | null; backCover: string | null }>({
    cover: null,
    backCover: null,
  });
  const [coverFileInfo, setCoverFileInfo] = useState<{ cover: CoverFileInfo | null; backCover: CoverFileInfo | null }>({
    cover: null,
    backCover: null,
  });
  const [savedLanguageState, setSavedLanguageState] = useState<{
    bookPath: string;
    configLanguage: string;
    amazonLanguage: string;
  } | null>(null);
  const [languageSaveState, setLanguageSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [aiSafeReview, setAiSafeReview] = useState<AiSafeReviewState | null>(null);
  const [editorialIntent, setEditorialIntent] = useState<EditorialIntentState>({
    isOpen: false,
    allowProceed: false,
    report: null,
    intentLabel: 'Continuar',
    onProceed: null,
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [promptModal, setPromptModal] = useState<{
    title: string;
    label: string;
    defaultValue?: string;
    placeholder?: string;
    multiline?: boolean;
    confirmLabel?: string;
    secondaryLabel?: string;
    onSecondary?: () => void;
    onConfirm: (value: string) => void;
  } | null>(null);
  const focusMode = leftPanelCollapsed && rightPanelCollapsed;

  const orderedChapters = useMemo(() => {
    if (!book) {
      return [];
    }

    return book.metadata.chapterOrder
      .map((chapterId) => book.chapters[chapterId])
      .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
  }, [book]);

  const [metricsChapters, setMetricsChapters] = useState<BookProject['chapters'][string][]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMetricsChapters(orderedChapters);
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [orderedChapters]);

  const activeChapter = useMemo(() => {
    if (!book || !activeChapterId) {
      return null;
    }

    return book.chapters[activeChapterId] ?? null;
  }, [activeChapterId, book]);

  const currentMessages = useMemo(() => {
    if (!book) {
      return [] as ChatMessage[];
    }

    if (chatScope === 'book') {
      return chatMessages.book;
    }

    if (!activeChapterId) {
      return [] as ChatMessage[];
    }

    return chatMessages.chapters[activeChapterId] ?? [];
  }, [book, chatScope, activeChapterId, chatMessages]);

  const hasFoundationData = useMemo(() => {
    if (!book) {
      return false;
    }

    const foundation = book.metadata.foundation;
    const values = [
      foundation.centralIdea,
      foundation.promise,
      foundation.audience,
      foundation.narrativeVoice,
      foundation.styleRules,
      foundation.structureNotes,
      foundation.glossaryPreferred,
      foundation.glossaryAvoid,
    ];
    return values.some((value) => value.trim().length > 0);
  }, [book]);

  const hasStoryBibleData = useMemo(() => {
    if (!book) {
      return false;
    }

    return (
      book.metadata.storyBible.characters.length > 0 ||
      book.metadata.storyBible.locations.length > 0 ||
      book.metadata.storyBible.continuityRules.trim().length > 0
    );
  }, [book]);

  const hasAmazonCoreData = useMemo(() => {
    if (!book) {
      return false;
    }

    const amazon = book.metadata.amazon;
    const hasKeyword = amazon.keywords.some((item) => item.trim().length > 0);
    const hasCategory = amazon.categories.some((item) => item.trim().length > 0);
    return Boolean(
      amazon.kdpTitle.trim() &&
      amazon.penName.trim() &&
      amazon.longDescription.trim().length >= 40 &&
      hasKeyword &&
      hasCategory,
    );
  }, [book]);

  const editorialChecklistReport = useMemo(() => {
    if (!book) {
      return null;
    }

    return buildEditorialChecklist(book.metadata, config);
  }, [book, config]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    if (!book) {
      setPromptTemplates([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadPromptTemplates(book.path);
        if (!cancelled) {
          setPromptTemplates(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          setPromptTemplates([]);
          setStatus(`No se pudo cargar biblioteca de prompts: ${formatUnknownError(error)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [book]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ONBOARDING_DISMISSED_KEY);
      const dismissed = stored === '1';
      if (!dismissed) {
        setOnboardingOpen(true);
      }
    } catch {
      setOnboardingOpen(true);
    }
  }, []);

  const ensureScopeMessagesLoaded = useCallback(
    async (scope: ChatScope, chapterId?: string): Promise<ChatMessage[]> => {
      if (!book) {
        return [];
      }

      if (loadedChatScopesRef.current.bookPath !== book.path) {
        loadedChatScopesRef.current = {
          bookPath: book.path,
          book: false,
          chapters: {},
        };
      }

      if (scope === 'book') {
        if (loadedChatScopesRef.current.book) {
          return chatMessagesRef.current.book;
        }

        const fallbackMessages =
          chatMessagesRef.current.book.length > 0 ? chatMessagesRef.current.book : book.metadata.chats.book;
        const loadedMessages = await loadBookChatMessages(book.path, fallbackMessages);
        loadedChatScopesRef.current.book = true;
        setChatMessages((previous) => ({
          ...previous,
          book: loadedMessages,
        }));
        return loadedMessages;
      }

      if (!chapterId) {
        return [];
      }

      if (loadedChatScopesRef.current.chapters[chapterId]) {
        return chatMessagesRef.current.chapters[chapterId] ?? [];
      }

      const fallbackMessages =
        chatMessagesRef.current.chapters[chapterId] ??
        book.metadata.chats.chapters[chapterId] ??
        [];
      const loadedMessages = await loadChapterChatMessages(book.path, chapterId, fallbackMessages);
      loadedChatScopesRef.current.chapters[chapterId] = true;
      setChatMessages((previous) => ({
        ...previous,
        chapters: {
          ...previous.chapters,
          [chapterId]: loadedMessages,
        },
      }));
      return loadedMessages;
    },
    [book],
  );

  const currentSearchOptions = useMemo<SearchReplaceOptions>(
    () => ({
      caseSensitive: searchCaseSensitive,
      wholeWord: searchWholeWord,
    }),
    [searchCaseSensitive, searchWholeWord],
  );

  const activeLanguage = useMemo(() => normalizeLanguageCode(config.language), [config.language]);
  const amazonActiveLanguage = useMemo(
    () => normalizeLanguageCode(book?.metadata.amazon.language ?? ''),
    [book?.metadata.amazon.language],
  );
  const languageDirty = useMemo(() => {
    if (!book) {
      return false;
    }

    if (!savedLanguageState || savedLanguageState.bookPath !== book.path) {
      return true;
    }

    return (
      activeLanguage !== savedLanguageState.configLanguage ||
      amazonActiveLanguage !== savedLanguageState.amazonLanguage
    );
  }, [book, savedLanguageState, activeLanguage, amazonActiveLanguage]);

  const stopReadAloud = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setAudioPlaybackState('idle');
      audioUtteranceRef.current = null;
      return;
    }

    window.speechSynthesis.cancel();
    audioUtteranceRef.current = null;
    setAudioPlaybackState('idle');
  }, []);

  const readTextAloud = useCallback(
    (text: string) => {
      const normalizedText = text.trim();
      if (!normalizedText) {
        setStatus('No hay texto suficiente para leer en audio.');
        return;
      }

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setStatus('La lectura en voz alta no esta disponible en este entorno.');
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(normalizedText);
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = pickSpeechVoice(voices, activeLanguage, config.audioVoiceName);

      utterance.lang = activeLanguage;
      utterance.rate = config.audioRate;
      utterance.volume = config.audioVolume;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang || activeLanguage;
      }

      utterance.onstart = () => {
        audioUtteranceRef.current = utterance;
        setAudioPlaybackState('playing');
        setStatus(`Leyendo en voz alta (${utterance.lang}).`);
      };
      utterance.onend = () => {
        if (audioUtteranceRef.current === utterance) {
          audioUtteranceRef.current = null;
          setAudioPlaybackState('idle');
          setStatus('Lectura en voz alta finalizada.');
        }
      };
      utterance.onerror = () => {
        if (audioUtteranceRef.current === utterance) {
          audioUtteranceRef.current = null;
        }
        setAudioPlaybackState('idle');
        setStatus('No se pudo reproducir el audio.');
      };

      window.speechSynthesis.speak(utterance);
    },
    [activeLanguage, config.audioRate, config.audioVoiceName, config.audioVolume],
  );

  const handleReadActiveChapterAloud = useCallback(() => {
    if (!activeChapter) {
      setStatus('No hay capitulo activo para leer.');
      return;
    }

    readTextAloud(buildChapterAudioText(activeChapter));
  }, [activeChapter, readTextAloud]);

  const handleTogglePauseReadAloud = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setStatus('La lectura en voz alta no esta disponible en este entorno.');
      return;
    }

    if (audioPlaybackState === 'playing') {
      window.speechSynthesis.pause();
      setAudioPlaybackState('paused');
      setStatus('Lectura en voz alta en pausa.');
      return;
    }

    if (audioPlaybackState === 'paused') {
      window.speechSynthesis.resume();
      setAudioPlaybackState('playing');
      setStatus('Lectura en voz alta reanudada.');
    }
  }, [audioPlaybackState]);

  const exportAudioToWav = useCallback(
    async (text: string, outputPath: string, successLabel: string) => {
      const normalizedText = text.trim();
      if (!normalizedText) {
        setStatus('No hay texto suficiente para exportar audio.');
        return;
      }

      try {
        const exportedPath = await exportAudiobookToWav({
          text: normalizedText,
          outputPath,
          language: activeLanguage,
          voiceName: config.audioVoiceName,
          rate: config.audioRate,
          volume: config.audioVolume,
        });
        setStatus(`${successLabel}: ${exportedPath}`);
      } catch (error) {
        setStatus(`No se pudo exportar audio: ${formatUnknownError(error)}`);
      }
    },
    [activeLanguage, config.audioRate, config.audioVoiceName, config.audioVolume],
  );

  const handleExportActiveChapterAudio = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    await exportAudioToWav(
      buildChapterAudioText(activeChapter),
      buildChapterAudioExportPath(book.path, book.metadata, activeChapter),
      'Audio de capitulo exportado',
    );
  }, [book, activeChapter, exportAudioToWav]);

  const interiorFormat = useMemo(
    () => book?.metadata.interiorFormat ?? FALLBACK_INTERIOR_FORMAT,
    [book?.metadata.interiorFormat],
  );

  const chapterWordCount = useMemo(() => {
    if (!activeChapter) {
      return 0;
    }

    return countWordsFromHtml(activeChapter.content);
  }, [activeChapter]);

  const bookWordCount = useMemo(
    () => metricsChapters.reduce((total, chapter) => total + countWordsFromHtml(chapter.content), 0),
    [metricsChapters],
  );

  const chapterPageMap = useMemo(() => {
    const map: Record<string, { start: number; end: number; pages: number }> = {};
    let cursor = 1;

    for (const chapter of metricsChapters) {
      const words = countWordsFromHtml(chapter.content);
      const estimatedPages = Math.max(1, estimatePagesFromWords(words, interiorFormat));
      map[chapter.id] = {
        start: cursor,
        end: cursor + estimatedPages - 1,
        pages: estimatedPages,
      };
      cursor += estimatedPages;
    }

    return map;
  }, [metricsChapters, interiorFormat]);

  const activeChapterPageRange = useMemo(() => {
    if (!activeChapterId) {
      return null;
    }

    return chapterPageMap[activeChapterId] ?? null;
  }, [activeChapterId, chapterPageMap]);

  const bookEstimatedPages = useMemo(() => {
    if (orderedChapters.length === 0) {
      return 0;
    }

    return Math.max(...Object.values(chapterPageMap).map((entry) => entry.end));
  }, [orderedChapters.length, chapterPageMap]);

  const chapterLengthInfo = useMemo(() => {
    if (!activeChapter) {
      return 'Sin capitulo activo.';
    }

    return formatChapterLengthLabel(activeChapter.lengthPreset);
  }, [activeChapter]);

  const bookLengthInfo = useMemo(() => {
    if (orderedChapters.length === 0) {
      return 'Sin capitulos cargados.';
    }

    let totalMinWords = 0;
    let totalMaxWords = 0;
    const presetCounts: Record<ChapterLengthPreset, number> = {
      corta: 0,
      media: 0,
      larga: 0,
    };

    for (const chapter of orderedChapters) {
      const profile = getChapterLengthProfile(chapter.lengthPreset);
      totalMinWords += profile.minWords;
      totalMaxWords += profile.maxWords;
      presetCounts[profile.preset] += 1;
    }

    const breakdownParts: string[] = [];
    if (presetCounts.corta > 0) {
      breakdownParts.push(`${presetCounts.corta} corta`);
    }
    if (presetCounts.media > 0) {
      breakdownParts.push(`${presetCounts.media} media`);
    }
    if (presetCounts.larga > 0) {
      breakdownParts.push(`${presetCounts.larga} larga`);
    }
    const midpoint = Math.round((totalMinWords + totalMaxWords) / 2);
    let targetScale = 'objetivo abierto';
    if (midpoint >= 20000 && midpoint < 50000) {
      targetScale = 'novela corta';
    } else if (midpoint >= 50000 && midpoint < 90000) {
      targetScale = 'novela mediana';
    } else if (midpoint >= 100000 && midpoint <= 200000) {
      targetScale = 'novela larga/epica';
    }

    return `${orderedChapters.length} capitulos | ${formatNumber(totalMinWords)}-${formatNumber(totalMaxWords)} palabras aprox (${breakdownParts.join(', ')}) | escala estimada: ${targetScale}. Referencia: corta 20.000-50.000, mediana 50.000-90.000, larga 100.000-200.000.`;
  }, [orderedChapters]);

  const updateEditorHistoryState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      setCanUndoEdit(false);
      setCanRedoEdit(false);
      return;
    }

    setCanUndoEdit(editor.canUndo());
    setCanRedoEdit(editor.canRedo());
  }, []);

  const resetSnapshotNavigation = useCallback((chapterId: string | null) => {
    if (!chapterId) {
      return;
    }

    snapshotUndoCursorRef.current[chapterId] = undefined;
    snapshotRedoStackRef.current[chapterId] = [];
    setSnapshotRedoNonce((value) => value + 1);
  }, []);

  const canRedoSnapshots = useMemo(() => {
    const refreshToken = snapshotRedoNonce;
    void refreshToken;

    if (!activeChapterId) {
      return false;
    }

    const stack = snapshotRedoStackRef.current[activeChapterId] ?? [];
    return stack.length > 0;
  }, [activeChapterId, snapshotRedoNonce]);

  const enforceExpansionResult = useCallback(
    async (input: {
      actionId: (typeof AI_ACTIONS)[number]['id'] | null;
      instruction: string;
      originalText: string;
      candidateText: string;
      bookTitle: string;
      chapterTitle: string;
    }): Promise<ExpansionGuardResult> => {
      const parsedCandidate = splitAiOutputAndSummary(input.candidateText);
      const cleanedCandidate = parsedCandidate.cleanText || input.candidateText;

      if (!shouldEnforceExpansion(input.actionId, input.instruction)) {
        return {
          text: cleanedCandidate,
          summaryText: parsedCandidate.summaryText,
          corrected: false,
        };
      }

      const minimumWords = resolveExpansionMinimumWords(input.instruction, input.originalText);
      if (minimumWords <= 0) {
        return {
          text: cleanedCandidate,
          summaryText: parsedCandidate.summaryText,
          corrected: false,
        };
      }

      const candidateWords = countWordsFromPlainText(cleanedCandidate);
      if (candidateWords >= minimumWords) {
        return {
          text: cleanedCandidate,
          summaryText: parsedCandidate.summaryText,
          corrected: false,
        };
      }

      const recoveryPrompt = buildExpansionRecoveryPrompt({
        instruction: input.instruction,
        bookTitle: input.bookTitle,
        chapterTitle: input.chapterTitle,
        language: activeLanguage,
        minWords: minimumWords,
        originalText: input.originalText,
        candidateText: cleanedCandidate,
      });
      const recoveredRaw = normalizeAiOutput(
        await generateWithOllama({
          config,
          prompt: recoveryPrompt,
        }),
      );
      const recoveredParsed = splitAiOutputAndSummary(recoveredRaw);
      const recoveredText = recoveredParsed.cleanText || recoveredRaw;

      if (countWordsFromPlainText(recoveredText) >= minimumWords) {
        return {
          text: recoveredText,
          summaryText: recoveredParsed.summaryText || parsedCandidate.summaryText,
          corrected: true,
        };
      }

      if (countWordsFromPlainText(input.originalText) >= minimumWords) {
        return {
          text: input.originalText,
          summaryText: recoveredParsed.summaryText || parsedCandidate.summaryText,
          corrected: true,
        };
      }

      return {
        text: cleanedCandidate,
        summaryText: recoveredParsed.summaryText || parsedCandidate.summaryText,
        corrected: false,
      };
    },
    [config, activeLanguage],
  );

  const enforceContinuityResult = useCallback(
    async (input: {
      userInstruction: string;
      originalText: string;
      candidateText: string;
      chapterTitle: string;
      recentText?: string;
    }): Promise<ContinuityGuardResult> => {
      const parsedCandidate = splitAiOutputAndSummary(input.candidateText);
      const cleanedCandidate = parsedCandidate.cleanText || input.candidateText;

      if (!config.continuityGuardEnabled || !book) {
        return {
          text: cleanedCandidate,
          summaryText: '',
          corrected: false,
        };
      }

      const storyBibleForGuard = selectStoryBibleForPrompt(
        book.metadata.storyBible,
        `${input.userInstruction}\n${input.chapterTitle}\n${input.originalText}\n${cleanedCandidate}`,
        {
          recentText: input.recentText ?? '',
          recencyWeight: 1.3,
        },
      );
      const guardPrompt = buildContinuityGuardPrompt({
        userInstruction: input.userInstruction,
        bookTitle: book.metadata.title,
        language: activeLanguage,
        foundation: book.metadata.foundation,
        storyBible: storyBibleForGuard,
        chapterTitle: input.chapterTitle,
        originalText: input.originalText,
        candidateText: cleanedCandidate,
      });

      const guardRaw = normalizeAiOutput(
        await generateWithOllama({
          config,
          prompt: guardPrompt,
        }),
      );
      const parsed = parseContinuityGuardOutput(guardRaw);
      const parsedText = splitAiOutputAndSummary(parsed.text);
      const guardedText = (parsedText.cleanText || parsed.text).trim();
      const finalText = guardedText || cleanedCandidate;
      const corrected = parsed.status === 'FAIL' || finalText !== cleanedCandidate;

      return {
        text: finalText,
        summaryText:
          parsed.status === 'FAIL'
            ? parsed.reason
              ? `Continuidad corregida: ${parsed.reason}`
              : 'Continuidad corregida automaticamente.'
            : '',
        corrected,
      };
    },
    [book, config, activeLanguage],
  );

  const refreshCovers = useCallback((project: CoverProject | null) => {
    const token = ++coverRefreshTokenRef.current;

    if (!project) {
      setCoverSrc((previous) => {
        revokeBlobUrl(previous);
        return null;
      });
      setBackCoverSrc((previous) => {
        revokeBlobUrl(previous);
        return null;
      });
      setCoverLoadDiagnostics({ cover: null, backCover: null });
      setCoverFileInfo({ cover: null, backCover: null });
      return;
    }

    const absoluteFrontPath = getCoverAbsolutePath(project.path, project.metadata);
    const absoluteBackPath = getBackCoverAbsolutePath(project.path, project.metadata);

    const readImageAsObjectUrl = async (absolutePath: string | null): Promise<CoverLoadResult> => {
      const buildFileProtocolFallback = (pathValue: string, reason: string): CoverLoadResult => {
        const directUrl = convertFileSrc(pathValue);
        const separator = directUrl.includes('?') ? '&' : '?';
        const cacheBustedUrl = `${directUrl}${separator}v=${token}`;
        return {
          url: cacheBustedUrl,
          diagnostic: `Carga directa de imagen activada (${reason}).`,
          fileInfo: {
            extension: inferImageExtensionFromPath(pathValue),
            bytes: 0,
          },
        };
      };

      try {
        if (!absolutePath) {
          return {
            url: null,
            diagnostic: null,
            fileInfo: null,
          };
        }

        if (!(await exists(absolutePath))) {
          return {
            url: null,
            diagnostic: `No se encontro el archivo en disco: ${absolutePath}`,
            fileInfo: null,
          };
        }

        try {
          const bytes = await readFile(absolutePath);
          const blob = new Blob([bytes], { type: inferImageMimeFromPath(absolutePath) });
          const url = URL.createObjectURL(blob);

          return {
            url,
            diagnostic: null,
            fileInfo: {
              extension: inferImageExtensionFromPath(absolutePath),
              bytes: bytes.length,
            },
          };
        } catch (readError) {
          try {
            return buildFileProtocolFallback(absolutePath, formatUnknownError(readError));
          } catch (fallbackError) {
            return {
              url: null,
              diagnostic: `Fallo la lectura del archivo (${formatUnknownError(readError)}). Fallback no disponible (${formatUnknownError(fallbackError)}).`,
              fileInfo: null,
            };
          }
        }
      } catch (error) {
        return {
          url: null,
          diagnostic: `Fallo la lectura del archivo (${formatUnknownError(error)}).`,
          fileInfo: null,
        };
      }
    };

    void (async () => {
      try {
        const [nextFront, nextBack] = await Promise.all([
          readImageAsObjectUrl(absoluteFrontPath),
          readImageAsObjectUrl(absoluteBackPath),
        ]);

        if (coverRefreshTokenRef.current !== token) {
          revokeBlobUrl(nextFront.url);
          revokeBlobUrl(nextBack.url);
          return;
        }

        setCoverSrc((previous) => {
          if (previous !== nextFront.url) {
            revokeBlobUrl(previous);
          }
          return nextFront.url;
        });
        setBackCoverSrc((previous) => {
          if (previous !== nextBack.url) {
            revokeBlobUrl(previous);
          }
          return nextBack.url;
        });
        setCoverLoadDiagnostics({
          cover: nextFront.diagnostic,
          backCover: nextBack.diagnostic,
        });
        setCoverFileInfo({
          cover: nextFront.fileInfo,
          backCover: nextBack.fileInfo,
        });
      } catch {
        if (coverRefreshTokenRef.current !== token) {
          return;
        }

        setCoverSrc((previous) => {
          revokeBlobUrl(previous);
          return null;
        });
        setBackCoverSrc((previous) => {
          revokeBlobUrl(previous);
          return null;
        });
        setCoverLoadDiagnostics({
          cover: 'Error inesperado al cargar portada.',
          backCover: 'Error inesperado al cargar contraportada.',
        });
        setCoverFileInfo({ cover: null, backCover: null });
      }
    })();
  }, []);

  const refreshLibrary = useCallback(async () => {
    const index = await loadLibraryIndex();
    setLibraryIndex(index);
  }, []);

  const handleRetryCoverLoad = useCallback(() => {
    if (!book) {
      return;
    }

    refreshCovers({
      path: book.path,
      metadata: {
        coverImage: book.metadata.coverImage,
        backCoverImage: book.metadata.backCoverImage,
      },
    });
    setStatus('Reintentando carga de portada/contraportada...');
  }, [book, refreshCovers]);

  const syncBookToLibrary = useCallback(
    async (project: BookProject, options?: { markOpened?: boolean }) => {
      const nextIndex = await upsertBookInLibrary(project, options);
      setLibraryIndex(nextIndex);
    },
    [],
  );

  const runBackup = useCallback(
    async (mode: 'auto' | 'manual') => {
      if (!book) {
        return false;
      }

      const backupDirectory = config.backupDirectory.trim();
      if (!config.backupEnabled || !backupDirectory) {
        if (mode === 'manual') {
          setStatus('Backup: activa el toggle y define una carpeta destino.');
        }
        return false;
      }

      if (backupInFlightRef.current) {
        return false;
      }

      if (mode === 'auto') {
        const elapsed = Date.now() - lastBackupAtRef.current;
        if (elapsed < Math.max(20000, config.backupIntervalMs)) {
          return false;
        }
      }

      backupInFlightRef.current = true;
      try {
        const targetPath = await syncBookToBackupDirectory(book.path, backupDirectory);
        lastBackupAtRef.current = Date.now();
        if (mode === 'manual') {
          setStatus(`Backup completado en: ${targetPath}`);
        }
        return true;
      } catch (error) {
        setStatus(`Backup fallido: ${formatUnknownError(error)}`);
        return false;
      } finally {
        backupInFlightRef.current = false;
      }
    },
    [book, config.backupEnabled, config.backupDirectory, config.backupIntervalMs],
  );

  useEffect(() => {
    if (!book || !config.backupEnabled || !config.backupDirectory.trim()) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runBackup('auto');
    }, Math.max(2500, Math.min(config.backupIntervalMs, 12000)));

    return () => {
      window.clearTimeout(timer);
    };
  }, [book, config.backupEnabled, config.backupDirectory, config.backupIntervalMs, runBackup]);

  useEffect(() => {
    return () => {
      stopReadAloud();
    };
  }, [stopReadAloud]);

  const toggleFocusMode = useCallback(() => {
    const shouldCollapseBoth = !(leftPanelCollapsed && rightPanelCollapsed);
    setLeftPanelCollapsed(shouldCollapseBoth);
    setRightPanelCollapsed(shouldCollapseBoth);
  }, [leftPanelCollapsed, rightPanelCollapsed]);

  const toggleLeftPanel = useCallback(() => {
    setLeftPanelCollapsed((previous) => !previous);
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed((previous) => !previous);
  }, []);

  const refreshSearchResults = useCallback(
    (nextBook: BookProject | null, query: string, options: SearchReplaceOptions) => {
      if (!nextBook || !query.trim()) {
        setSearchMatches([]);
        setSearchTotalMatches(0);
        return;
      }

      const ordered = nextBook.metadata.chapterOrder
        .map((chapterId) => nextBook.chapters[chapterId])
        .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
      const report = buildBookSearchMatches(ordered, query, options);
      setSearchMatches(report.matches);
      setSearchTotalMatches(report.totalMatches);
    },
    [],
  );

  const dismissOnboardingForever = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    } catch {
      // Ignora errores de almacenamiento local.
    }
    setOnboardingOpen(false);
    setStatus('Onboarding desactivado para este equipo.');
  }, []);

  const requestAiSafeReview = useCallback(
    (input: { title: string; subtitle: string; beforeText: string; afterText: string }): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setAiSafeReview({
          title: input.title,
          subtitle: input.subtitle,
          beforeText: input.beforeText,
          afterText: input.afterText,
          resolve,
        });
      });
    },
    [],
  );

  const openEditorialChecklist = useCallback(
    (intentLabel: string, onProceed?: (() => void) | null) => {
      const report = editorialChecklistReport;
      if (!report) {
        return;
      }

      setEditorialIntent({
        isOpen: true,
        report,
        allowProceed: report.isReady,
        intentLabel,
        onProceed: onProceed ?? null,
      });
    },
    [editorialChecklistReport],
  );

  const closeEditorialChecklist = useCallback(() => {
    setEditorialIntent((previous) => ({
      ...previous,
      isOpen: false,
      onProceed: null,
    }));
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const coverBookPath = book?.path ?? null;
  const coverImage = book?.metadata.coverImage ?? null;
  const backCoverImage = book?.metadata.backCoverImage ?? null;

  useEffect(() => {
    if (!coverBookPath) {
      refreshCovers(null);
      return;
    }

    refreshCovers({
      path: coverBookPath,
      metadata: {
        coverImage,
        backCoverImage,
      },
    });
  }, [backCoverImage, coverBookPath, coverImage, refreshCovers]);

  useEffect(() => {
    if (!book) {
      setActiveChapterId(null);
      return;
    }

    if (!activeChapterId || !book.chapters[activeChapterId]) {
      setActiveChapterId(book.metadata.chapterOrder[0] ?? null);
    }
  }, [book, activeChapterId]);

  useEffect(() => {
    if (!book) {
      return;
    }

    if (chatScope === 'book') {
      void ensureScopeMessagesLoaded('book');
      return;
    }

    if (activeChapterId) {
      void ensureScopeMessagesLoaded('chapter', activeChapterId);
    }
  }, [book, chatScope, activeChapterId, ensureScopeMessagesLoaded]);

  useEffect(() => {
    if (book && searchQuery.trim()) {
      return;
    }
    setSearchMatches([]);
    setSearchTotalMatches(0);
  }, [book, searchQuery]);

  useEffect(() => {
    setSearchPreviewReport(null);
  }, [searchQuery, replaceQuery, searchCaseSensitive, searchWholeWord]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-contrast', config.accessibilityHighContrast ? 'high' : 'normal');
    root.setAttribute('data-text-size', config.accessibilityLargeText ? 'large' : 'normal');
    root.lang = activeLanguage;
  }, [config.accessibilityHighContrast, config.accessibilityLargeText, activeLanguage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateEditorHistoryState();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeChapterId, activeChapter?.updatedAt, updateEditorHistoryState]);

  const flushChapterSave = useCallback(async () => {
    if (!book || !activeChapterId || !dirtyRef.current || saveInFlightRef.current) {
      return;
    }

    const chapter = book.chapters[activeChapterId];
    if (!chapter) {
      return;
    }

    const chapterContentAtStart = chapter.content;
    saveInFlightRef.current = true;
    try {
      const saved = await withTimeout(
        saveChapter(book.path, chapter),
        AUTOSAVE_TIMEOUT_MS,
        'Auto-guardado de capitulo',
      );
      let mergedProjectForLibrary: BookProject | null = null;
      let savedApplied = false;
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        const latestChapter = previous.chapters[saved.id];
        if (latestChapter && latestChapter.content !== chapterContentAtStart) {
          // Hubo nuevas teclas mientras se guardaba. No pisar estado en memoria con un save viejo.
          mergedProjectForLibrary = {
            ...previous,
            chapters: {
              ...previous.chapters,
            },
          };
          return previous;
        }

        savedApplied = true;
        const nextProject: BookProject = {
          ...previous,
          chapters: {
            ...previous.chapters,
            [saved.id]: saved,
          },
        };
        mergedProjectForLibrary = nextProject;

        return nextProject;
      });
      dirtyRef.current = !savedApplied;
      setStatus(`Guardado automatico ${new Date().toLocaleTimeString()}`);
      if (mergedProjectForLibrary) {
        await withTimeout(
          syncBookToLibrary(mergedProjectForLibrary),
          AUTOSAVE_TIMEOUT_MS,
          'Actualizacion de biblioteca',
        );
      }
    } catch (error) {
      setStatus(`Error al guardar: ${formatUnknownError(error)}`);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [book, activeChapterId, syncBookToLibrary]);

  useEffect(() => {
    if (!book || !activeChapterId) {
      return;
    }

    const timer = window.setInterval(() => {
      void flushChapterSave();
    }, Math.max(1200, config.autosaveIntervalMs));

    return () => {
      window.clearInterval(timer);
    };
  }, [book, activeChapterId, config.autosaveIntervalMs, flushChapterSave]);

  useEffect(() => {
    return () => {
      if (languageSaveResetTimerRef.current !== null) {
        window.clearTimeout(languageSaveResetTimerRef.current);
        languageSaveResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    coverSrcRef.current = coverSrc;
  }, [coverSrc]);

  useEffect(() => {
    backCoverSrcRef.current = backCoverSrc;
  }, [backCoverSrc]);

  useEffect(() => {
    return () => {
      coverRefreshTokenRef.current += 1;
      revokeBlobUrl(coverSrcRef.current);
      revokeBlobUrl(backCoverSrcRef.current);
    };
  }, []);

  const applyOpenedProjectState = useCallback(
    (project: BookProject, loadedConfig: AppConfig) => {
      const normalizedConfigLanguage = normalizeLanguageCode(loadedConfig.language);
      const normalizedAmazonLanguage = normalizeLanguageCode(project.metadata.amazon.language);
      const initialChats: BookChats = {
        book: [...project.metadata.chats.book],
        chapters: { ...project.metadata.chats.chapters },
      };

      setBook(project);
      setChatMessages(initialChats);
      loadedChatScopesRef.current = {
        bookPath: project.path,
        book: false,
        chapters: {},
      };
      setConfig({
        ...loadedConfig,
        language: normalizedConfigLanguage,
      });
      setSavedLanguageState({
        bookPath: project.path,
        configLanguage: normalizedConfigLanguage,
        amazonLanguage: normalizedAmazonLanguage,
      });
      setLanguageSaveState('idle');
      if (languageSaveResetTimerRef.current !== null) {
        window.clearTimeout(languageSaveResetTimerRef.current);
        languageSaveResetTimerRef.current = null;
      }
      setActiveChapterId(project.metadata.chapterOrder[0] ?? null);
      setMainView('outline');
      setChatScope('chapter');
      refreshCovers(project);
      dirtyRef.current = false;
      snapshotUndoCursorRef.current = {};
      snapshotRedoStackRef.current = {};
      setSnapshotRedoNonce((value) => value + 1);
      setCanUndoEdit(false);
      setCanRedoEdit(false);
    },
    [refreshCovers],
  );

  const loadProject = useCallback(
    async (projectPath: string) => {
      const loaded = await loadBookProject(projectPath);
      let loadedConfig: AppConfig = DEFAULT_APP_CONFIG;

      try {
        loadedConfig = await loadAppConfig(loaded.path);
      } catch (error) {
        try {
          await saveAppConfig(loaded.path, DEFAULT_APP_CONFIG);
        } catch {
          // Continua con defaults aunque no se pueda reescribir config.
        }
        setStatus(`Abrir libro: config dañada, se aplicaron defaults (${formatUnknownError(error)})`);
      }

      applyOpenedProjectState(loaded, loadedConfig);

      try {
        await syncBookToLibrary(loaded, { markOpened: true });
      } catch (error) {
        setStatus(
          `Abrir libro: ${loaded.metadata.title} (no se pudo actualizar biblioteca: ${formatUnknownError(error)})`,
        );
        return;
      }

      setStatus(`Libro abierto: ${loaded.metadata.title}`);
    },
    [applyOpenedProjectState, syncBookToLibrary],
  );

  const handleCreateBook = useCallback(async () => {
    function openTitleStep(defaultValue = 'Mi libro'): void {
      setPromptModal({
        title: 'Crear nuevo libro',
        label: 'Titulo del libro',
        defaultValue,
        confirmLabel: 'Siguiente',
        onConfirm: async (titleInput) => {
          openAuthorStep(titleInput.trim() || 'Mi libro');
        },
      });
    }

    function openAuthorStep(resolvedTitle: string): void {
      setPromptModal({
        title: 'Crear nuevo libro',
        label: 'Autor',
        defaultValue: 'Autor',
        confirmLabel: 'Crear libro',
        secondaryLabel: 'Atras',
        onSecondary: () => {
          openTitleStep(resolvedTitle);
        },
        onConfirm: async (authorInput) => {
          setPromptModal(null);
          try {
            const selectedDirectoryResult = await open({
              directory: true,
              multiple: false,
              recursive: true,
              title: 'Selecciona carpeta padre del libro',
            });
            const selectedDirectory = extractDialogPath(selectedDirectoryResult);

            if (!selectedDirectory) {
              setStatus('Crear libro: operacion cancelada.');
              return;
            }

            const author = authorInput.trim() || 'Autor';
            setStatus('Crear libro: creando estructura del libro...');
            const created = await createBookProject(selectedDirectory, resolvedTitle, author);

            let loadedConfig: AppConfig = DEFAULT_APP_CONFIG;
            try {
              loadedConfig = await loadAppConfig(created.path);
            } catch {
              try {
                await saveAppConfig(created.path, DEFAULT_APP_CONFIG);
              } catch {
                // Continua con defaults aunque falle la escritura.
              }
            }

            applyOpenedProjectState(created, loadedConfig);
            try {
              await syncBookToLibrary(created, { markOpened: true });
            } catch (error) {
              setStatus(
                `Crear libro: ${created.metadata.title} (sin actualizar biblioteca: ${formatUnknownError(error)})`,
              );
              return;
            }

            setStatus(`Libro creado y abierto: ${created.metadata.title}`);
          } catch (error) {
            setStatus(`Crear libro: ${formatUnknownError(error)}`);
          }
        },
      });
    }

    openTitleStep();
  }, [applyOpenedProjectState, syncBookToLibrary]);

  const handleOpenBook = useCallback(async () => {
    try {
      const selectedDirectoryResult = await open({
        directory: true,
        multiple: false,
        recursive: true,
        title: 'Selecciona carpeta del libro',
      });
      const selectedDirectory = extractDialogPath(selectedDirectoryResult);

      if (!selectedDirectory) {
        setStatus('Abrir libro: operacion cancelada.');
        return;
      }

      const resolvedPath = await resolveBookDirectory(selectedDirectory);
      await loadProject(resolvedPath);
    } catch (error) {
      setStatus(`Abrir libro: ${formatUnknownError(error)}`);
    }
  }, [loadProject]);

  const handleCloseBook = useCallback(async () => {
    try {
      await flushChapterSave();
    } catch {
      // Ignora errores de guardado al cerrar para no bloquear al usuario.
    }

    stopReadAloud();
    setBook(null);
    setChatMessages({
      book: [],
      chapters: {},
    });
    setPromptTemplates([]);
    loadedChatScopesRef.current = {
      bookPath: null,
      book: false,
      chapters: {},
    };
    setActiveChapterId(null);
    setMainView('editor');
    setLeftPanelCollapsed(false);
    setRightPanelCollapsed(false);
    setChatScope('chapter');
    setSearchMatches([]);
    setSearchTotalMatches(0);
    refreshCovers(null);
    setCanUndoEdit(false);
    setCanRedoEdit(false);
    dirtyRef.current = false;
    setSavedLanguageState(null);
    setLanguageSaveState('idle');
    if (languageSaveResetTimerRef.current !== null) {
      window.clearTimeout(languageSaveResetTimerRef.current);
      languageSaveResetTimerRef.current = null;
    }
    snapshotUndoCursorRef.current = {};
    snapshotRedoStackRef.current = {};
    setSnapshotRedoNonce((value) => value + 1);
    setStatus('Libro cerrado.');
  }, [flushChapterSave, refreshCovers, stopReadAloud]);

  const handleRenameBookTitle = useCallback(() => {
    if (!book) {
      setStatus('Abri un libro para renombrar el titulo.');
      return;
    }

    const currentTitle = book.metadata.title;
    const currentKdpTitle = book.metadata.amazon.kdpTitle;
    const currentSpineText = book.metadata.spineText;

    setPromptModal({
      title: 'Renombrar libro',
      label: 'Nuevo titulo del libro',
      defaultValue: currentTitle,
      confirmLabel: 'Guardar titulo',
      onConfirm: async (nextTitleInput) => {
        const nextTitle = nextTitleInput.trim();
        if (!nextTitle) {
          return;
        }

        try {
          const metadataDraft = {
            ...book.metadata,
            title: nextTitle,
            spineText: currentSpineText.trim() === currentTitle.trim() ? nextTitle : currentSpineText,
            amazon: {
              ...book.metadata.amazon,
              kdpTitle:
                !currentKdpTitle.trim() || currentKdpTitle.trim() === currentTitle.trim()
                  ? nextTitle
                  : currentKdpTitle,
            },
          };
          const savedMetadata = await saveBookMetadata(book.path, metadataDraft);
          const updatedProject: BookProject = {
            ...book,
            metadata: savedMetadata,
          };
          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }
            return updatedProject;
          });
          setPromptModal(null);
          await syncBookToLibrary(updatedProject, { markOpened: true });
          setStatus(`Titulo actualizado: ${nextTitle}`);
        } catch (error) {
          setStatus(`No se pudo renombrar libro: ${formatUnknownError(error)}`);
        }
      },
    });
  }, [book, syncBookToLibrary]);

  const handleRenameBookAuthor = useCallback(() => {
    if (!book) {
      setStatus('Abri un libro para renombrar autor.');
      return;
    }

    const currentAuthor = book.metadata.author;
    const currentPenName = book.metadata.amazon.penName;

    setPromptModal({
      title: 'Renombrar autor',
      label: 'Nuevo autor del libro',
      defaultValue: currentAuthor,
      confirmLabel: 'Guardar autor',
      onConfirm: async (nextAuthorInput) => {
        const nextAuthor = nextAuthorInput.trim();
        if (!nextAuthor) {
          return;
        }

        try {
          const metadataDraft = {
            ...book.metadata,
            author: nextAuthor,
            amazon: {
              ...book.metadata.amazon,
              penName:
                !currentPenName.trim() || currentPenName.trim() === currentAuthor.trim()
                  ? nextAuthor
                  : currentPenName,
            },
          };
          const savedMetadata = await saveBookMetadata(book.path, metadataDraft);
          const updatedProject: BookProject = {
            ...book,
            metadata: savedMetadata,
          };
          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }
            return updatedProject;
          });
          setPromptModal(null);
          await syncBookToLibrary(updatedProject, { markOpened: true });
          setStatus(`Autor actualizado: ${nextAuthor}`);
        } catch (error) {
          setStatus(`No se pudo renombrar autor: ${formatUnknownError(error)}`);
        }
      },
    });
  }, [book, syncBookToLibrary]);

  const handleEditorChange = useCallback(
    (payload: { html: string; json: unknown }) => {
      if (!book || !activeChapterId) {
        return;
      }

      dirtyRef.current = true;
      resetSnapshotNavigation(activeChapterId);

      setBook((previous) => {
        if (!previous || !activeChapterId) {
          return previous;
        }

        const chapter = previous.chapters[activeChapterId];
        if (!chapter) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [activeChapterId]: {
              ...chapter,
              content: payload.html,
              contentJson: payload.json,
              updatedAt: getNowIso(),
            },
          },
        };
      });
      updateEditorHistoryState();
    },
    [book, activeChapterId, resetSnapshotNavigation, updateEditorHistoryState],
  );

  const handleChapterLengthPresetChange = useCallback(
    async (preset: ChapterLengthPreset) => {
      if (!book || !activeChapterId) {
        return;
      }

      const nextPreset = resolveChapterLengthPreset(preset);
      const currentChapter = book.chapters[activeChapterId];
      if (!currentChapter) {
        return;
      }

      const chapterDraft = {
        ...currentChapter,
        lengthPreset: nextPreset,
        updatedAt: getNowIso(),
      };

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [activeChapterId]: chapterDraft,
          },
        };
      });

      try {
        const persistedChapter = await saveChapter(book.path, chapterDraft);
        const nextProject: BookProject = {
          ...book,
          chapters: {
            ...book.chapters,
            [activeChapterId]: persistedChapter,
          },
        };

        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            chapters: {
              ...previous.chapters,
              [activeChapterId]: persistedChapter,
            },
          };
        });

        await syncBookToLibrary(nextProject);
        setStatus(`Extension del capitulo: ${formatChapterLengthLabel(nextPreset)}.`);
      } catch (error) {
        setStatus(`No se pudo guardar extension de capitulo: ${formatUnknownError(error)}`);
      }
    },
    [book, activeChapterId, syncBookToLibrary],
  );

  const handleSaveSettings = useCallback(async () => {
    if (!book) {
      setStatus('Abri un libro para guardar config en mi-libro/config.json.');
      setLanguageSaveState('idle');
      return;
    }

    setLanguageSaveState('saving');
    try {
      const normalizedConfig: AppConfig = {
        ...config,
        language: activeLanguage,
      };
      await saveAppConfig(book.path, normalizedConfig);
      setConfig(normalizedConfig);

      const normalizedAmazonLanguage = normalizeLanguageCode(book.metadata.amazon.language);
      if (normalizedAmazonLanguage !== activeLanguage) {
        const metadataDraft = {
          ...book.metadata,
          amazon: {
            ...book.metadata.amazon,
            language: activeLanguage,
          },
        };
        const savedMetadata = await saveBookMetadata(book.path, metadataDraft);
        const nextProject: BookProject = {
          ...book,
          metadata: savedMetadata,
        };
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }
          return nextProject;
        });
        await syncBookToLibrary(nextProject);
        setSavedLanguageState({
          bookPath: book.path,
          configLanguage: activeLanguage,
          amazonLanguage: activeLanguage,
        });
        setLanguageSaveState('saved');
        if (languageSaveResetTimerRef.current !== null) {
          window.clearTimeout(languageSaveResetTimerRef.current);
        }
        languageSaveResetTimerRef.current = window.setTimeout(() => {
          setLanguageSaveState('idle');
          languageSaveResetTimerRef.current = null;
        }, 2200);
        setStatus('Settings guardados y idioma Amazon sincronizado en book.json.');
        return;
      }

      setSavedLanguageState({
        bookPath: book.path,
        configLanguage: activeLanguage,
        amazonLanguage: normalizedAmazonLanguage,
      });
      setLanguageSaveState('saved');
      if (languageSaveResetTimerRef.current !== null) {
        window.clearTimeout(languageSaveResetTimerRef.current);
      }
      languageSaveResetTimerRef.current = window.setTimeout(() => {
        setLanguageSaveState('idle');
        languageSaveResetTimerRef.current = null;
      }, 2200);
      setStatus('Settings guardados en config.json del libro.');
    } catch (error) {
      setLanguageSaveState('idle');
      setStatus(`Error guardando settings: ${formatUnknownError(error)}`);
    }
  }, [book, config, activeLanguage, syncBookToLibrary]);

  const handlePickBackupDirectory = useCallback(async () => {
    const selectedDirectoryResult = await open({
      directory: true,
      multiple: false,
      recursive: true,
      title: 'Selecciona carpeta para backup (Google Drive/OneDrive/Dropbox opcional)',
    });
    const selectedDirectory = extractDialogPath(selectedDirectoryResult);
    if (!selectedDirectory) {
      return;
    }

    setConfig((previous) => ({
      ...previous,
      backupEnabled: true,
      backupDirectory: selectedDirectory,
    }));
    setStatus(`Backup habilitado en: ${selectedDirectory}`);
  }, []);

  const handleBackupNow = useCallback(() => {
    void runBackup('manual');
  }, [runBackup]);

  const handleLanguageChange = useCallback(
    (language: string) => {
      setLanguageSaveState('idle');
      setConfig((previous) => ({
        ...previous,
        language,
      }));

      if (!book) {
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: {
            ...previous.metadata,
            amazon: {
              ...previous.metadata.amazon,
              language,
            },
          },
        };
      });
    },
    [book],
  );

  const handleFoundationChange = useCallback(
    (foundation: BookProject['metadata']['foundation']) => {
      if (!book) {
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: {
            ...previous.metadata,
            foundation,
          },
        };
      });
    },
    [book],
  );

  const handleStoryBibleChange = useCallback(
    (storyBible: BookProject['metadata']['storyBible']) => {
      if (!book) {
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: {
            ...previous.metadata,
            storyBible,
          },
        };
      });
    },
    [book],
  );

  const handleSaveFoundation = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const savedMetadata = await saveBookMetadata(book.path, book.metadata);
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: savedMetadata,
        };
      });
      await syncBookToLibrary({
        ...book,
        metadata: savedMetadata,
      });
      setStatus('Base del libro guardada.');
    } catch (error) {
      setStatus(`No se pudo guardar la base: ${formatUnknownError(error)}`);
    }
  }, [book, syncBookToLibrary]);

  const handleSaveStoryBible = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const savedMetadata = await saveBookMetadata(book.path, book.metadata);
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: savedMetadata,
        };
      });
      await syncBookToLibrary({
        ...book,
        metadata: savedMetadata,
      });
      setStatus('Biblia de la historia guardada.');
    } catch (error) {
      setStatus(`No se pudo guardar la biblia: ${formatUnknownError(error)}`);
    }
  }, [book, syncBookToLibrary]);

  const syncStoryBibleFromChapter = useCallback(
    async (chapter: { id: string; title: string; content: string }) => {
      if (!book) {
        return { addedCharacters: 0, addedLocations: 0 };
      }

      const syncResult = buildStoryBibleAutoSyncFromChapter(book.metadata.storyBible, chapter);
      if (syncResult.addedCharacters.length === 0 && syncResult.addedLocations.length === 0) {
        return { addedCharacters: 0, addedLocations: 0 };
      }

      const metadataDraft = {
        ...book.metadata,
        storyBible: syncResult.nextStoryBible,
      };
      const savedMetadata = await saveBookMetadata(book.path, metadataDraft);

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: savedMetadata,
        };
      });
      await syncBookToLibrary({
        ...book,
        metadata: savedMetadata,
      });

      return {
        addedCharacters: syncResult.addedCharacters.length,
        addedLocations: syncResult.addedLocations.length,
      };
    },
    [book, syncBookToLibrary],
  );

  const handleSyncStoryBibleFromActiveChapter = useCallback(async () => {
    if (!book || !activeChapter) {
      setStatus('Abre un capitulo para sincronizar la biblia.');
      return;
    }

    try {
      const sync = await syncStoryBibleFromChapter(activeChapter);
      if (sync.addedCharacters === 0 && sync.addedLocations === 0) {
        setStatus('Sincronizacion completada: no se detectaron personajes o lugares nuevos.');
        return;
      }

      setStatus(
        `Biblia actualizada desde ${activeChapter.title}: +${sync.addedCharacters} personaje/s, +${sync.addedLocations} lugar/es.`,
      );
    } catch (error) {
      setStatus(`No se pudo sincronizar la biblia: ${formatUnknownError(error)}`);
    }
  }, [book, activeChapter, syncStoryBibleFromChapter]);

  const handleAmazonMetadataChange = useCallback(
    (nextMetadata: BookProject['metadata']) => {
      if (!book) {
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: nextMetadata,
        };
      });
    },
    [book],
  );

  const handleSaveAmazon = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const savedMetadata = await saveBookMetadata(book.path, book.metadata);
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: savedMetadata,
        };
      });
      await syncBookToLibrary({
        ...book,
        metadata: savedMetadata,
      });
      setStatus('Seccion Amazon guardada.');
    } catch (error) {
      setStatus(`No se pudo guardar Amazon: ${formatUnknownError(error)}`);
    }
  }, [book, syncBookToLibrary]);

  const handleCreateChapter = useCallback(async () => {
    if (!book) {
      return;
    }

    setPromptModal({
      title: 'Crear nuevo capitulo',
      label: 'Titulo del capitulo',
      defaultValue: 'Nuevo capitulo',
      onConfirm: async (title) => {
        setPromptModal(null);
        if (!book) return;
        try {
          const result = await createChapter(book.path, book.metadata, title);

          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }

            return {
              ...previous,
              metadata: result.metadata,
              chapters: {
                ...previous.chapters,
                [result.chapter.id]: result.chapter,
              },
            };
          });
          await syncBookToLibrary({
            ...book,
            metadata: result.metadata,
            chapters: {
              ...book.chapters,
              [result.chapter.id]: result.chapter,
            },
          });

          setActiveChapterId(result.chapter.id);
          setMainView('editor');
          setStatus(`Capitulo creado: ${result.chapter.title}`);
        } catch (error) {
          setStatus(`No se pudo crear el capitulo: ${formatUnknownError(error)}`);
        }
      },
    });
  }, [book, syncBookToLibrary]);

  const handleRenameChapter = useCallback(
    async (chapterId: string) => {
      if (!book) {
        return;
      }

      const chapter = book.chapters[chapterId];
      if (!chapter) {
        return;
      }

      setPromptModal({
        title: 'Renombrar capitulo',
        label: 'Nuevo titulo',
        defaultValue: chapter.title,
        onConfirm: async (nextTitle) => {
          setPromptModal(null);
          if (!book || !nextTitle) return;
          try {
            const updated = await renameChapter(book.path, chapter, nextTitle);
            setBook((previous) => {
              if (!previous || previous.path !== book.path) {
                return previous;
              }

              return {
                ...previous,
                chapters: {
                  ...previous.chapters,
                  [chapterId]: updated,
                },
                };
              });

            await syncBookToLibrary({
              ...book,
              chapters: {
                ...book.chapters,
                [chapterId]: updated,
              },
            });
            setStatus('Capitulo renombrado.');
          } catch (error) {
            setStatus(`No se pudo renombrar: ${formatUnknownError(error)}`);
          }
        },
      });
    },
    [book, syncBookToLibrary],
  );

  const handleDuplicateChapter = useCallback(
    async (chapterId: string) => {
      if (!book) {
        return;
      }

      const chapter = book.chapters[chapterId];
      if (!chapter) {
        return;
      }

      try {
        const result = await duplicateChapter(book.path, book.metadata, chapter);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            metadata: result.metadata,
            chapters: {
              ...previous.chapters,
              [result.chapter.id]: result.chapter,
            },
          };
        });
        await syncBookToLibrary({
          ...book,
          metadata: result.metadata,
          chapters: {
            ...book.chapters,
            [result.chapter.id]: result.chapter,
          },
        });
        setStatus('Capitulo duplicado.');
      } catch (error) {
        setStatus(`No se pudo duplicar: ${formatUnknownError(error)}`);
      }
    },
    [book, syncBookToLibrary],
  );

  const handleDeleteChapter = useCallback(
    async (chapterId: string) => {
      if (!book) {
        return;
      }

      if (book.metadata.chapterOrder.length <= 1) {
        setStatus('Debe quedar al menos un capitulo.');
        return;
      }

      try {
        const metadata = await deleteChapter(book.path, book.metadata, chapterId);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          const nextChapters = { ...previous.chapters };
          delete nextChapters[chapterId];

          return {
            ...previous,
            metadata,
            chapters: nextChapters,
          };
        });
        const nextChapters = { ...book.chapters };
        delete nextChapters[chapterId];
        await syncBookToLibrary({
          ...book,
          metadata,
          chapters: nextChapters,
        });
        setChatMessages((previous) => {
          const nextChatChapters = { ...previous.chapters };
          delete nextChatChapters[chapterId];
          return {
            ...previous,
            chapters: nextChatChapters,
          };
        });
        delete loadedChatScopesRef.current.chapters[chapterId];

        if (activeChapterId === chapterId) {
          setActiveChapterId(metadata.chapterOrder[0] ?? null);
        }

        setStatus('Capitulo eliminado.');
      } catch (error) {
        setStatus(`No se pudo eliminar: ${formatUnknownError(error)}`);
      }
    },
    [book, activeChapterId, syncBookToLibrary],
  );

  const handleMoveChapter = useCallback(
    async (chapterId: string, direction: 'up' | 'down') => {
      if (!book) {
        return;
      }

      try {
        const metadata = await moveChapter(book.path, book.metadata, chapterId, direction);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            metadata,
          };
        });
        await syncBookToLibrary({
          ...book,
          metadata,
        });
      } catch (error) {
        setStatus(`No se pudo mover: ${formatUnknownError(error)}`);
      }
    },
    [book, syncBookToLibrary],
  );

  const handleMoveChapterToPosition = useCallback(
    async (chapterId: string, position: number) => {
      if (!book) {
        return;
      }

      const targetIndex = Math.max(0, Math.min(book.metadata.chapterOrder.length - 1, position - 1));
      const currentIndex = book.metadata.chapterOrder.indexOf(chapterId);
      if (currentIndex < 0 || currentIndex === targetIndex) {
        return;
      }

      try {
        let metadata = book.metadata;
        let cursor = currentIndex;
        while (cursor < targetIndex) {
          metadata = await moveChapter(book.path, metadata, chapterId, 'down');
          cursor += 1;
        }
        while (cursor > targetIndex) {
          metadata = await moveChapter(book.path, metadata, chapterId, 'up');
          cursor -= 1;
        }

        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            metadata,
          };
        });

        await syncBookToLibrary({
          ...book,
          metadata,
        });
      } catch (error) {
        setStatus(`No se pudo reordenar capitulo: ${formatUnknownError(error)}`);
      }
    },
    [book, syncBookToLibrary],
  );

  const handleRunBookSearch = useCallback(async () => {
    if (!book) {
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setSearchMatches([]);
      setSearchTotalMatches(0);
      setSearchPreviewReport(null);
      setStatus('Buscar: escribe texto para iniciar la busqueda.');
      return;
    }

    setSearchBusy(true);
    try {
      const report = await buildBookSearchMatchesAsync(orderedChapters, query, currentSearchOptions, 4);
      setSearchMatches(report.matches);
      setSearchTotalMatches(report.totalMatches);
      setStatus(`Busqueda completada: ${report.totalMatches} coincidencia/s en ${report.matches.length} capitulo/s.`);
    } finally {
      setSearchBusy(false);
    }
  }, [book, searchQuery, orderedChapters, currentSearchOptions]);

  const handlePreviewReplaceInBook = useCallback(async () => {
    if (!book) {
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setSearchPreviewReport(null);
      setStatus('Simular reemplazo: define primero el texto a buscar.');
      return;
    }

    setSearchBusy(true);
    try {
      const report = await buildBookReplacePreviewAsync(
        orderedChapters,
        query,
        replaceQuery,
        currentSearchOptions,
        20,
        4,
      );
      setSearchPreviewReport(report);
      setStatus(
        `Simulacion lista: ${report.totalMatches} cambio/s potenciales en ${report.affectedChapters} capitulo/s.`,
      );
    } finally {
      setSearchBusy(false);
    }
  }, [book, searchQuery, replaceQuery, orderedChapters, currentSearchOptions]);

  const handleReplaceInActiveChapter = useCallback(async () => {
    if (!book || !activeChapterId) {
      return;
    }

    const chapter = book.chapters[activeChapterId];
    if (!chapter) {
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setStatus('Reemplazar: define primero el texto a buscar.');
      return;
    }

    setSearchBusy(true);
    try {
      if (config.autoVersioning) {
        await saveChapterSnapshot(book.path, chapter, 'Buscar/Reemplazar capitulo activo');
      }

      const updated = replaceMatchesInHtml(chapter.content, query, replaceQuery, currentSearchOptions);
      if (updated.replacements === 0) {
        setStatus('No hubo coincidencias en el capitulo activo.');
        return;
      }

      const chapterDraft = {
        ...chapter,
        content: updated.html,
        contentJson: null,
        updatedAt: getNowIso(),
      };
      const persisted = await saveChapter(book.path, chapterDraft);
      const nextProject: BookProject = {
        ...book,
        chapters: {
          ...book.chapters,
          [chapter.id]: persisted,
        },
      };

      setBook(nextProject);
      await syncBookToLibrary(nextProject);
      dirtyRef.current = false;
      resetSnapshotNavigation(chapter.id);

      refreshSearchResults(nextProject, query, currentSearchOptions);
      setSearchPreviewReport(null);
      setStatus(`Reemplazo aplicado en capitulo activo: ${updated.replacements} cambio/s.`);
    } catch (error) {
      setStatus(`Reemplazar capitulo: ${formatUnknownError(error)}`);
    } finally {
      setSearchBusy(false);
    }
  }, [
    book,
    activeChapterId,
    searchQuery,
    replaceQuery,
    currentSearchOptions,
    config.autoVersioning,
    resetSnapshotNavigation,
    syncBookToLibrary,
    refreshSearchResults,
  ]);

  const handleReplaceInBook = useCallback(async () => {
    if (!book) {
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setStatus('Reemplazar libro: define primero el texto a buscar.');
      return;
    }

    if (
      !searchPreviewReport ||
      searchPreviewReport.query !== query ||
      searchPreviewReport.replacement !== replaceQuery
    ) {
      setStatus('Antes de reemplazar todo el libro, ejecuta "Simular reemplazo global".');
      return;
    }

    setSearchBusy(true);
    try {
      let totalReplacements = 0;
      let changedChapters = 0;
      let workingChapters: BookProject['chapters'] = { ...book.chapters };

      for (const [index, chapterId] of book.metadata.chapterOrder.entries()) {
        const chapter = workingChapters[chapterId];
        if (!chapter) {
          continue;
        }

        const updated = replaceMatchesInHtml(chapter.content, query, replaceQuery, currentSearchOptions);
        if (updated.replacements === 0) {
          continue;
        }

        if (config.autoVersioning) {
          await saveChapterSnapshot(book.path, chapter, 'Buscar/Reemplazar libro completo');
        }

        const persisted = await saveChapter(book.path, {
          ...chapter,
          content: updated.html,
          contentJson: null,
          updatedAt: getNowIso(),
        });

        workingChapters = {
          ...workingChapters,
          [chapterId]: persisted,
        };

        changedChapters += 1;
        totalReplacements += updated.replacements;
        if ((index + 1) % REPLACE_BOOK_YIELD_EVERY === 0) {
          await yieldToBrowser();
        }
      }

      if (totalReplacements === 0) {
        setStatus('No hubo coincidencias para reemplazar en el libro.');
        return;
      }

      const nextProject: BookProject = {
        ...book,
        chapters: workingChapters,
      };
      setBook(nextProject);
      await syncBookToLibrary(nextProject);
      dirtyRef.current = false;
      for (const chapterId of book.metadata.chapterOrder) {
        resetSnapshotNavigation(chapterId);
      }

      refreshSearchResults(nextProject, query, currentSearchOptions);
      setSearchPreviewReport(null);
      setStatus(`Reemplazo global aplicado: ${totalReplacements} cambio/s en ${changedChapters} capitulo/s.`);
    } catch (error) {
      setStatus(`Reemplazar libro: ${formatUnknownError(error)}`);
    } finally {
      setSearchBusy(false);
    }
  }, [
    book,
    searchQuery,
    replaceQuery,
    searchPreviewReport,
    currentSearchOptions,
    config.autoVersioning,
    refreshSearchResults,
    resetSnapshotNavigation,
    syncBookToLibrary,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const shift = event.shiftKey;

      if (ctrlOrMeta && shift && key === 'f') {
        event.preventDefault();
        toggleFocusMode();
        return;
      }

      if (ctrlOrMeta && shift && key === 'h') {
        event.preventDefault();
        setHelpOpen((previous) => !previous);
        return;
      }

      if (ctrlOrMeta && !shift && key === 'f') {
        event.preventDefault();
        if (book) {
          setMainView('search');
        }
        return;
      }

      if (ctrlOrMeta && key === 's') {
        event.preventDefault();
        void flushChapterSave();
        setStatus('Guardado manual solicitado.');
        return;
      }

      if (promptModal) {
        return;
      }

      if (ctrlOrMeta && shift && key === 'n') {
        event.preventDefault();
        void handleCreateChapter();
        return;
      }

      if (!activeChapterId || isEditableTarget(event.target)) {
        return;
      }

      if (event.altKey && key === 'arrowup') {
        event.preventDefault();
        void handleMoveChapter(activeChapterId, 'up');
        return;
      }

      if (event.altKey && key === 'arrowdown') {
        event.preventDefault();
        void handleMoveChapter(activeChapterId, 'down');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeChapterId, book, flushChapterSave, handleCreateChapter, handleMoveChapter, promptModal, toggleFocusMode]);

  const persistScopeMessages = useCallback(
    async (scope: ChatScope, messages: ChatMessage[], chapterIdOverride?: string) => {
      if (!book) {
        return;
      }

      if (scope === 'book') {
        const persisted = await saveBookChatMessages(book.path, messages);
        loadedChatScopesRef.current.book = true;
        setChatMessages((previous) => ({
          ...previous,
          book: persisted,
        }));
        return;
      }

      const chapterId = chapterIdOverride ?? activeChapterId;
      if (!chapterId) {
        return;
      }

      const persisted = await saveChapterChatMessages(book.path, chapterId, messages);
      loadedChatScopesRef.current.chapters[chapterId] = true;
      setChatMessages((previous) => ({
        ...previous,
        chapters: {
          ...previous.chapters,
          [chapterId]: persisted,
        },
      }));
    },
    [book, activeChapterId],
  );

  const handleTrackCharacter = useCallback(
    async (characterName: string, scope: ChatScope, rangeFilter: ChapterRangeFilter) => {
      if (!book) {
        return;
      }

      const normalizedName = characterName.trim();
      if (!normalizedName) {
        setStatus('Escribe un nombre de personaje para generar el seguimiento.');
        return;
      }

      if (scope === 'chapter' && !activeChapterId) {
        setStatus('No hay capitulo activo para guardar el seguimiento en ese chat.');
        return;
      }

      const scopeChapterId = scope === 'chapter' ? activeChapterId ?? undefined : undefined;
      const history =
        scope === 'book'
          ? await ensureScopeMessagesLoaded('book')
          : await ensureScopeMessagesLoaded('chapter', scopeChapterId);
      const normalizedRange = normalizeChapterRange(orderedChapters.length, rangeFilter);
      const rangeChapters = sliceByChapterRange(orderedChapters, normalizedRange);
      if (rangeChapters.length === 0) {
        setStatus(`No hay capitulos para rastrear en el rango ${normalizedRange.label}.`);
        return;
      }

      const report = buildCharacterTrackingReport({
        requestedName: normalizedName,
        chapters: rangeChapters,
        storyBible: book.metadata.storyBible,
      });
      const timelineMessage = formatCharacterTrackingReport(report);

      const userMessage: ChatMessage = {
        id: randomId('msg'),
        role: 'user',
        scope,
        content: `Seguimiento de personaje: ${normalizedName} (caps ${normalizedRange.label})`,
        createdAt: getNowIso(),
      };

      const assistantMessage: ChatMessage = {
        id: randomId('msg'),
        role: 'assistant',
        scope,
        content: timelineMessage,
        createdAt: getNowIso(),
      };

      await persistScopeMessages(scope, [...history, userMessage, assistantMessage], scopeChapterId);

      if (report.mentions.length === 0) {
        setStatus(`Seguimiento generado: sin menciones de "${normalizedName}" en caps ${normalizedRange.label}.`);
        return;
      }

      setStatus(
        `Seguimiento generado para "${normalizedName}" (caps ${normalizedRange.label}): ${report.mentions.length} menciones en ${report.mentionsByChapter.length} capitulo/s.`,
      );
    },
    [book, activeChapterId, ensureScopeMessagesLoaded, orderedChapters, persistScopeMessages],
  );

  const handleSummarizeStory = useCallback(
    async (scope: ChatScope, rangeFilter: ChapterRangeFilter) => {
      if (!book) {
        return;
      }

      if (scope === 'chapter' && !activeChapterId) {
        setStatus('No hay capitulo activo para guardar el resumen en ese chat.');
        return;
      }

      const scopeChapterId = scope === 'chapter' ? activeChapterId ?? undefined : undefined;
      const history =
        scope === 'book'
          ? await ensureScopeMessagesLoaded('book')
          : await ensureScopeMessagesLoaded('chapter', scopeChapterId);

      const normalizedRange = normalizeChapterRange(orderedChapters.length, rangeFilter);
      const rangeChapters = sliceByChapterRange(orderedChapters, normalizedRange);
      if (rangeChapters.length === 0) {
        setStatus(`No hay capitulos para resumir en el rango ${normalizedRange.label}.`);
        return;
      }

      const digest = buildStoryProgressDigest({
        chapters: rangeChapters,
        storyBible: book.metadata.storyBible,
      });
      const userMessage: ChatMessage = {
        id: randomId('msg'),
        role: 'user',
        scope,
        content: `Resumen historia (caps ${normalizedRange.label})`,
        createdAt: getNowIso(),
      };

      setAiBusy(true);
      setStatus(`Generando resumen de historia (caps ${normalizedRange.label})...`);

      try {
        const prompt = buildStoryProgressPrompt({
          bookTitle: book.metadata.title,
          language: activeLanguage,
          storyBible: book.metadata.storyBible,
          range: normalizedRange,
          digest,
        });

        const aiSummary = normalizeAiOutput(
          await generateWithOllama({
            config,
            prompt,
          }),
        );

        const summaryText =
          aiSummary ||
          formatStoryProgressFallback(book.metadata.title, normalizedRange, digest);

        const assistantMessage: ChatMessage = {
          id: randomId('msg'),
          role: 'assistant',
          scope,
          content: summaryText,
          createdAt: getNowIso(),
        };
        await persistScopeMessages(scope, [...history, userMessage, assistantMessage], scopeChapterId);
        setStatus(`Resumen generado (caps ${normalizedRange.label}).`);
      } catch (error) {
        const fallbackSummary = formatStoryProgressFallback(book.metadata.title, normalizedRange, digest);
        const assistantMessage: ChatMessage = {
          id: randomId('msg'),
          role: 'assistant',
          scope,
          content: fallbackSummary,
          createdAt: getNowIso(),
        };
        await persistScopeMessages(scope, [...history, userMessage, assistantMessage], scopeChapterId);
        setStatus(
          `Resumen generado en modo local por error IA (${formatUnknownError(error)}).`,
        );
      } finally {
        setAiBusy(false);
      }
    },
    [book, activeChapterId, ensureScopeMessagesLoaded, orderedChapters, activeLanguage, config, persistScopeMessages],
  );

  const handleSendChat = useCallback(
    async (message: string, scope: ChatScope) => {
      if (!book) {
        return;
      }

      if (scope === 'chapter' && !activeChapterId) {
        setStatus('No hay capitulo activo para enviar mensaje en modo capitulo.');
        return;
      }

      const scopeChapterId = scope === 'chapter' ? activeChapterId ?? undefined : undefined;
      const history =
        scope === 'book'
          ? await ensureScopeMessagesLoaded('book')
          : await ensureScopeMessagesLoaded('chapter', scopeChapterId);

      const userMessage: ChatMessage = {
        id: randomId('msg'),
        role: 'user',
        scope,
        content: message,
        createdAt: getNowIso(),
      };
      const withUser = [...history, userMessage];

      setAiBusy(true);
      setStatus('Consultando Ollama...');

      try {
        await persistScopeMessages(scope, withUser, scopeChapterId);

        const chapterText = activeChapter ? stripHtml(activeChapter.content) : '';
        const compactHistory = history
          .slice(-8)
          .map((item) => `${item.role === 'user' ? 'Usuario' : 'Asistente'}: ${item.content}`)
          .join('\n');
        const storyBibleForChat = selectStoryBibleForPrompt(
          book.metadata.storyBible,
          `${message}\n${activeChapter?.title ?? ''}\n${chapterText}\n${compactHistory}`,
          {
            recentText: compactHistory,
            recencyWeight: 1.2,
          },
        );

        if (!config.autoApplyChatChanges) {
          const prompt = buildChatPrompt({
            scope,
            message,
            bookTitle: book.metadata.title,
            language: activeLanguage,
            foundation: book.metadata.foundation,
            storyBible: storyBibleForChat,
            bookLengthInstruction: scope === 'book' ? bookLengthInfo : undefined,
            chapterTitle: activeChapter?.title,
            chapterLengthPreset: activeChapter?.lengthPreset,
            chapterText,
            fullBookText: buildBookContext(book),
            compactHistory,
          });

          const answer = normalizeAiOutput(
            await generateWithOllama({
              config,
              prompt,
            }),
          );

          const assistantMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope,
            content: answer,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
          setStatus('Respuesta IA recibida.');
          return;
        }

        const iterations = Math.max(1, Math.min(10, config.chatApplyIterations));

        if (scope === 'chapter') {
          if (!activeChapterId) {
            throw new Error('No hay capitulo activo para aplicar cambios.');
          }

          let workingChapters: BookProject['chapters'] = { ...book.chapters };
          let chapter = workingChapters[activeChapterId];

          if (!chapter) {
            throw new Error('No se encontro el capitulo activo.');
          }

          let lastSummaryMessage = '';
          let appliedIterations = 0;
          let cancelledBySafeMode = false;

          if (config.continuousAgentEnabled) {
            const maxRounds = Math.max(1, Math.min(12, config.continuousAgentMaxRounds));
            let previousSummary = '';

            for (let round = 1; round <= maxRounds; round += 1) {
              if (config.autoVersioning) {
                await saveChapterSnapshot(book.path, chapter, `Agente continuo ronda ${round}/${maxRounds}`);
              }

              const currentChapterText = stripHtml(chapter.content);
              const storyBibleForChapter = selectStoryBibleForPrompt(
                book.metadata.storyBible,
                `${message}\n${chapter.title}\n${currentChapterText}`,
                {
                  recentText: compactHistory,
                  recencyWeight: 1.2,
                },
              );
              const prompt = buildContinuousChapterPrompt({
                userInstruction: message,
                bookTitle: book.metadata.title,
                language: activeLanguage,
                foundation: book.metadata.foundation,
                storyBible: storyBibleForChapter,
                chapterTitle: chapter.title,
                chapterLengthPreset: chapter.lengthPreset,
                chapterText: currentChapterText,
                fullBookText: buildBookContext(book, workingChapters),
                round,
                maxRounds,
                previousSummary,
              });

              const rawResponse = normalizeAiOutput(
                await generateWithOllama({
                  config,
                  prompt,
                }),
              );
              const parsed = parseContinuousAgentOutput(rawResponse);
              const guardedResult = await enforceExpansionResult({
                actionId: null,
                instruction: message,
                originalText: currentChapterText,
                candidateText: parsed.text,
                bookTitle: book.metadata.title,
                chapterTitle: chapter.title,
              });
              const continuityResult = await enforceContinuityResult({
                userInstruction: message,
                originalText: currentChapterText,
                candidateText: guardedResult.text,
                chapterTitle: chapter.title,
                recentText: compactHistory,
              });
              const nextChapterText = continuityResult.text;
              previousSummary = parsed.summary;
              lastSummaryMessage =
                continuityResult.summaryText ||
                guardedResult.summaryText ||
                parsed.summary ||
                lastSummaryMessage;

              if (
                config.aiSafeMode &&
                shouldRequireAiSafeReview(currentChapterText, nextChapterText)
              ) {
                const approved = await requestAiSafeReview({
                  title: `Modo seguro IA - ${chapter.title}`,
                  subtitle: `Agente continuo ronda ${round}/${maxRounds}. Revisa el diff antes de aplicar.`,
                  beforeText: currentChapterText,
                  afterText: nextChapterText,
                });
                if (!approved) {
                  cancelledBySafeMode = true;
                  setStatus('Modo seguro IA: cambio cancelado por el usuario.');
                  break;
                }
              }

              const chapterDraft = {
                ...chapter,
                content: plainTextToHtml(nextChapterText),
                contentJson: null,
                updatedAt: getNowIso(),
              };
              chapter = await saveChapter(book.path, chapterDraft);
              workingChapters = {
                ...workingChapters,
                [chapter.id]: chapter,
              };
              appliedIterations += 1;

              setStatus(`Agente continuo en capitulo (${round}/${maxRounds})...`);

              if (parsed.status === 'DONE') {
                break;
              }
            }
          } else {
            for (let iteration = 1; iteration <= iterations; iteration += 1) {
              if (config.autoVersioning) {
                await saveChapterSnapshot(book.path, chapter, `Chat auto-aplicar ${iteration}/${iterations}`);
              }

              const currentChapterText = stripHtml(chapter.content);
              const storyBibleForChapter = selectStoryBibleForPrompt(
                book.metadata.storyBible,
                `${message}\n${chapter.title}\n${currentChapterText}`,
                {
                  recentText: compactHistory,
                  recencyWeight: 1.2,
                },
              );
              const prompt = buildAutoRewritePrompt({
                userInstruction: message,
                bookTitle: book.metadata.title,
                language: activeLanguage,
                foundation: book.metadata.foundation,
                storyBible: storyBibleForChapter,
                chapterTitle: chapter.title,
                chapterLengthPreset: chapter.lengthPreset,
                chapterText: currentChapterText,
                fullBookText: buildBookContext(book, workingChapters),
                chapterIndex: book.metadata.chapterOrder.indexOf(chapter.id) + 1,
                chapterTotal: book.metadata.chapterOrder.length,
                iteration,
                totalIterations: iterations,
              });

              const response = normalizeAiOutput(
                await generateWithOllama({
                  config,
                  prompt,
                }),
              );
              const guardedResult = await enforceExpansionResult({
                actionId: null,
                instruction: message,
                originalText: currentChapterText,
                candidateText: response,
                bookTitle: book.metadata.title,
                chapterTitle: chapter.title,
              });
              const continuityResult = await enforceContinuityResult({
                userInstruction: message,
                originalText: currentChapterText,
                candidateText: guardedResult.text,
                chapterTitle: chapter.title,
                recentText: compactHistory,
              });
              const nextChapterText = continuityResult.text;
              lastSummaryMessage = continuityResult.summaryText || guardedResult.summaryText || lastSummaryMessage;

              if (
                config.aiSafeMode &&
                shouldRequireAiSafeReview(currentChapterText, nextChapterText)
              ) {
                const approved = await requestAiSafeReview({
                  title: `Modo seguro IA - ${chapter.title}`,
                  subtitle: `Chat auto-aplicar iteracion ${iteration}/${iterations}. Revisa el diff antes de aplicar.`,
                  beforeText: currentChapterText,
                  afterText: nextChapterText,
                });
                if (!approved) {
                  cancelledBySafeMode = true;
                  setStatus('Modo seguro IA: cambio cancelado por el usuario.');
                  break;
                }
              }

              const chapterDraft = {
                ...chapter,
                content: plainTextToHtml(nextChapterText),
                contentJson: null,
                updatedAt: getNowIso(),
              };
              chapter = await saveChapter(book.path, chapterDraft);
              workingChapters = {
                ...workingChapters,
                [chapter.id]: chapter,
              };
              appliedIterations += 1;

              setStatus(`Aplicando cambios al capitulo (${iteration}/${iterations})...`);
            }
          }

          if (appliedIterations === 0 && cancelledBySafeMode) {
            const assistantMessage: ChatMessage = {
              id: randomId('msg'),
              role: 'assistant',
              scope,
              content: 'Modo seguro IA: no se aplicaron cambios porque el diff fue rechazado.',
              createdAt: getNowIso(),
            };
            await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
            return;
          }

          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }

            return {
              ...previous,
              chapters: workingChapters,
            };
          });
          await syncBookToLibrary({
            ...book,
            chapters: workingChapters,
          });

          dirtyRef.current = false;

          const assistantMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope,
            content:
              buildSummaryMessage(lastSummaryMessage) ||
              `Cambios aplicados automaticamente en "${chapter.title}".`,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
          setStatus(
            config.continuousAgentEnabled
              ? 'Chat aplicado con agente continuo al capitulo.'
              : 'Chat aplicado automaticamente al capitulo.',
          );
          return;
        }

        let workingChapters: BookProject['chapters'] = { ...book.chapters };
        let extractedSummaries = 0;
        let continuityCorrections = 0;

        for (let iteration = 1; iteration <= iterations; iteration += 1) {
          for (let index = 0; index < book.metadata.chapterOrder.length; index += 1) {
            const chapterId = book.metadata.chapterOrder[index];
            const chapter = workingChapters[chapterId];
            if (!chapter) {
              continue;
            }

            if (config.autoVersioning) {
              await saveChapterSnapshot(
                book.path,
                chapter,
                `Chat auto-aplicar libro cap ${index + 1} iter ${iteration}/${iterations}`,
              );
            }

            const currentChapterText = stripHtml(chapter.content);
            const storyBibleForChapter = selectStoryBibleForPrompt(
              book.metadata.storyBible,
              `${message}\n${chapter.title}\n${currentChapterText}`,
              {
                recentText: compactHistory,
                recencyWeight: 1.2,
              },
            );
            const prompt = buildAutoRewritePrompt({
              userInstruction: message,
              bookTitle: book.metadata.title,
              language: activeLanguage,
              foundation: book.metadata.foundation,
              storyBible: storyBibleForChapter,
              chapterTitle: chapter.title,
              chapterLengthPreset: chapter.lengthPreset,
              chapterText: currentChapterText,
              fullBookText: buildBookContext(book, workingChapters),
              chapterIndex: index + 1,
              chapterTotal: book.metadata.chapterOrder.length,
              iteration,
              totalIterations: iterations,
            });

            const response = normalizeAiOutput(
              await generateWithOllama({
                config,
                prompt,
              }),
            );
            const guardedResult = await enforceExpansionResult({
              actionId: null,
              instruction: message,
              originalText: currentChapterText,
              candidateText: response,
              bookTitle: book.metadata.title,
              chapterTitle: chapter.title,
            });
            const continuityResult = await enforceContinuityResult({
              userInstruction: message,
              originalText: currentChapterText,
              candidateText: guardedResult.text,
              chapterTitle: chapter.title,
              recentText: compactHistory,
            });
            const nextChapterText = continuityResult.text;
            if (guardedResult.summaryText) {
              extractedSummaries += 1;
            }
            if (continuityResult.corrected) {
              continuityCorrections += 1;
            }

            const chapterDraft = {
              ...chapter,
              content: plainTextToHtml(nextChapterText),
              contentJson: null,
              updatedAt: getNowIso(),
            };
            const persisted = await saveChapter(book.path, chapterDraft);
            workingChapters = {
              ...workingChapters,
              [chapterId]: persisted,
            };

            setStatus(
              `Aplicando cambios al libro: cap ${index + 1}/${book.metadata.chapterOrder.length}, iter ${iteration}/${iterations}...`,
            );
          }
        }

        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            chapters: workingChapters,
          };
        });
        await syncBookToLibrary({
          ...book,
          chapters: workingChapters,
        });

        dirtyRef.current = false;

        const assistantMessage: ChatMessage = {
          id: randomId('msg'),
          role: 'assistant',
          scope,
          content: `Cambios aplicados automaticamente en todo el libro (${book.metadata.chapterOrder.length} capitulos, ${iterations} iteracion/es).${extractedSummaries > 0 ? ` Resumenes detectados: ${extractedSummaries}.` : ''}${continuityCorrections > 0 ? ` Correcciones de continuidad: ${continuityCorrections}.` : ''}`,
          createdAt: getNowIso(),
        };

        await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
        setStatus('Chat aplicado automaticamente al libro completo.');
      } catch (error) {
        setStatus(`Error de IA: ${formatUnknownError(error)}`);
      } finally {
        setAiBusy(false);
      }
    },
    [
      book,
      activeChapter,
      activeChapterId,
      config,
      persistScopeMessages,
      ensureScopeMessagesLoaded,
      syncBookToLibrary,
      enforceExpansionResult,
      enforceContinuityResult,
      requestAiSafeReview,
      activeLanguage,
      bookLengthInfo,
    ],
  );

  const executeAction = useCallback(
    async (actionId: (typeof AI_ACTIONS)[number]['id'], ideaText = '') => {
      if (!book || !activeChapter) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        setStatus('Activa el editor para aplicar acciones IA en el capitulo.');
        return;
      }

      const allowEmptyTargetActions = new Set(['feedback-book', 'feedback-chapter', 'draft-from-idea']);
      const hasSelection = editor.hasSelection();
      const chapterText = editor.getDocumentText();
      const selectedText = hasSelection ? editor.getSelectionText() : chapterText;
      const normalizedIdea = ideaText.trim();
      const promptTargetText = actionId === 'draft-from-idea' ? normalizedIdea : selectedText;

      if (actionId === 'draft-from-idea' && !normalizedIdea) {
        setStatus('Escribi una idea para generar el capitulo.');
        return;
      }

      if (!promptTargetText.trim() && !allowEmptyTargetActions.has(actionId)) {
        setStatus('No hay texto para procesar.');
        return;
      }

      const recentActionHistory = currentMessages
        .slice(-8)
        .map((item) => `${item.role === 'user' ? 'Usuario' : 'Asistente'}: ${item.content}`)
        .join('\n');
      const storyBibleForAction = selectStoryBibleForPrompt(
        book.metadata.storyBible,
        `${normalizedIdea}\n${promptTargetText}\n${activeChapter.title}\n${stripHtml(activeChapter.content)}`,
        {
          recentText: recentActionHistory,
          recencyWeight: 1.15,
        },
      );

      const prompt = buildActionPrompt({
        actionId,
        selectedText: promptTargetText,
        ideaText: normalizedIdea,
        chapterTitle: activeChapter.title,
        bookTitle: book.metadata.title,
        language: activeLanguage,
        foundation: book.metadata.foundation,
        storyBible: storyBibleForAction,
        chapterLengthPreset: activeChapter.lengthPreset,
        chapterContext: stripHtml(activeChapter.content),
        fullBookContext: buildBookContext(book),
      });

      setAiBusy(true);
      setStatus(actionId === 'draft-from-idea' ? 'Generando capitulo desde idea...' : 'Aplicando accion IA...');

      try {
        const action = AI_ACTIONS.find((item) => item.id === actionId);
        const actionInstruction =
          actionId === 'draft-from-idea'
            ? `Escribir desde idea. ${normalizedIdea}`
            : `${action?.label ?? actionId}. ${action?.description ?? ''}`.trim();
        if (action?.modifiesText && config.autoVersioning) {
          await saveChapterSnapshot(book.path, activeChapter, action.label);
        }

        const response = normalizeAiOutput(
          await generateWithOllama({
            config,
            prompt,
          }),
        );
        const parsedOutput = splitAiOutputAndSummary(response);
        let outputText = parsedOutput.cleanText || response;
        let summaryText = parsedOutput.summaryText;

        if (action?.modifiesText) {
          const expansionSourceText = actionId === 'draft-from-idea' ? chapterText : selectedText;
          const expansionResult = await enforceExpansionResult({
            actionId,
            instruction: actionInstruction,
            originalText: expansionSourceText,
            candidateText: outputText,
            bookTitle: book.metadata.title,
            chapterTitle: activeChapter.title,
          });
          outputText = expansionResult.text;
          summaryText = expansionResult.summaryText || summaryText;
        }

        if (action?.modifiesText) {
          const candidateChapterText =
            actionId === 'draft-from-idea' || !hasSelection
              ? outputText
              : editor.previewSelectionReplacement(outputText);
          const continuityResult = await enforceContinuityResult({
            userInstruction: actionInstruction,
            originalText: chapterText,
            candidateText: candidateChapterText,
            chapterTitle: activeChapter.title,
            recentText: recentActionHistory,
          });
          summaryText = continuityResult.summaryText || summaryText;

          if (
            config.aiSafeMode &&
            shouldRequireAiSafeReview(chapterText, continuityResult.text)
          ) {
            const approved = await requestAiSafeReview({
              title: `Modo seguro IA - ${action?.label ?? actionId}`,
              subtitle: 'Se detecto un cambio grande. Revisa el diff antes de aplicar.',
              beforeText: chapterText,
              afterText: continuityResult.text,
            });
            if (!approved) {
              setStatus('Modo seguro IA: cambio rechazado antes de aplicar.');
              return;
            }
          }

          if (actionId === 'draft-from-idea' || !hasSelection) {
            editor.replaceDocumentWithText(continuityResult.text);
          } else if (continuityResult.corrected) {
            editor.replaceDocumentWithText(continuityResult.text);
          } else {
            editor.replaceSelectionWithText(outputText);
          }

          const nextHtml = editor.getHTML();
          const nextJson = editor.getJSON();
          const updatedChapter = {
            ...activeChapter,
            content: nextHtml,
            contentJson: nextJson,
            updatedAt: getNowIso(),
          };
          const persistedChapter = await saveChapter(book.path, updatedChapter);
          dirtyRef.current = false;

          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }

            return {
              ...previous,
              chapters: {
                ...previous.chapters,
                [activeChapter.id]: persistedChapter,
              },
            };
          });
          await syncBookToLibrary({
            ...book,
            chapters: {
              ...book.chapters,
              [activeChapter.id]: persistedChapter,
            },
          });

          if (summaryText) {
            const currentChapterMessages = await ensureScopeMessagesLoaded('chapter', activeChapter.id);
            const summaryMessage: ChatMessage = {
              id: randomId('msg'),
              role: 'assistant',
              scope: 'chapter',
              content: buildSummaryMessage(summaryText, `Resumen de cambios (${action?.label ?? actionId}):`),
              createdAt: getNowIso(),
            };
            await persistScopeMessages('chapter', [...currentChapterMessages, summaryMessage], activeChapter.id);
          }

          setStatus(
            actionId === 'draft-from-idea' ? 'Capitulo generado desde la idea ingresada.' : `Accion aplicada: ${action?.label ?? actionId}`,
          );
        } else {
          const feedbackScope: ChatScope = actionId === 'feedback-book' ? 'book' : 'chapter';
          if (feedbackScope === 'chapter' && !activeChapterId) {
            throw new Error('No hay capitulo activo para guardar la devolucion.');
          }

          const history =
            feedbackScope === 'book'
              ? await ensureScopeMessagesLoaded('book')
              : await ensureScopeMessagesLoaded('chapter', activeChapter.id);

          const feedbackMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope: feedbackScope,
            content: `Devolucion (${action?.label ?? actionId}):\n${outputText}`,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(
            feedbackScope,
            [...history, feedbackMessage],
            feedbackScope === 'chapter' ? activeChapter.id : undefined,
          );
          setChatScope(feedbackScope);
          setStatus(`Devolucion enviada al chat: ${action?.label ?? actionId}`);
        }
      } catch (error) {
        setStatus(`Error IA: ${formatUnknownError(error)}`);
      } finally {
        setAiBusy(false);
      }
    },
    [
      book,
      activeChapter,
      activeChapterId,
      config,
      persistScopeMessages,
      ensureScopeMessagesLoaded,
      syncBookToLibrary,
      enforceExpansionResult,
      enforceContinuityResult,
      requestAiSafeReview,
      activeLanguage,
      currentMessages,
    ],
  );

  const handleRunAction = useCallback(
    (actionId: (typeof AI_ACTIONS)[number]['id']) => {
      if (actionId === 'draft-from-idea') {
        if (!activeChapter) {
          setStatus('No hay capitulo activo para generar desde idea.');
          return;
        }

        setPromptModal({
          title: `Escribir desde idea - ${activeChapter.title}`,
          label: 'Idea del capitulo',
          defaultValue: '',
          placeholder: 'Describe que tiene que pasar en este capitulo, tono, conflicto y objetivo...',
          multiline: true,
          confirmLabel: 'Generar capitulo',
          onConfirm: (ideaValue) => {
            setPromptModal(null);
            void executeAction(actionId, ideaValue);
          },
        });
        return;
      }

      void executeAction(actionId);
    },
    [activeChapter, executeAction],
  );

  const persistEditorChapter = useCallback(
    async (statusMessage: string) => {
      if (!book || !activeChapterId) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const chapter = book.chapters[activeChapterId];
      if (!chapter) {
        return;
      }

      const updatedChapter = {
        ...chapter,
        content: editor.getHTML(),
        contentJson: editor.getJSON(),
        updatedAt: getNowIso(),
      };
      const persistedChapter = await saveChapter(book.path, updatedChapter);

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [persistedChapter.id]: persistedChapter,
          },
        };
      });

      await syncBookToLibrary({
        ...book,
        chapters: {
          ...book.chapters,
          [persistedChapter.id]: persistedChapter,
        },
      });
      dirtyRef.current = false;
      updateEditorHistoryState();
      setStatus(statusMessage);
    },
    [book, activeChapterId, syncBookToLibrary, updateEditorHistoryState],
  );

  const handleUndoEdit = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !editor.canUndo()) {
      setStatus('No hay cambios para deshacer en el editor.');
      return;
    }

    editor.undo();
    await persistEditorChapter('Cambio deshecho.');
  }, [persistEditorChapter]);

  const handleRedoEdit = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !editor.canRedo()) {
      setStatus('No hay cambios para rehacer en el editor.');
      return;
    }

    editor.redo();
    await persistEditorChapter('Cambio rehecho.');
  }, [persistEditorChapter]);

  const handleUndoSnapshot = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    try {
      const snapshots = await listChapterSnapshots(book.path, activeChapter.id);
      if (snapshots.length === 0) {
        setStatus('No hay snapshots para restaurar.');
        return;
      }

      const currentChapter = book.chapters[activeChapter.id];
      if (!currentChapter) {
        return;
      }

      const currentPointer = snapshotUndoCursorRef.current[activeChapter.id];
      const targetIndex = currentPointer ?? snapshots.length - 1;

      if (targetIndex < 0) {
        setStatus('No hay snapshots anteriores para deshacer.');
        return;
      }

      const targetSnapshot = snapshots[targetIndex];
      const redoStack = snapshotRedoStackRef.current[activeChapter.id] ?? [];
      snapshotRedoStackRef.current[activeChapter.id] = [...redoStack, currentChapter];
      setSnapshotRedoNonce((value) => value + 1);

      const restored = await saveChapter(book.path, {
        ...targetSnapshot.chapter,
        updatedAt: getNowIso(),
      });

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [restored.id]: restored,
          },
        };
      });

      await syncBookToLibrary({
        ...book,
        chapters: {
          ...book.chapters,
          [restored.id]: restored,
        },
      });

      snapshotUndoCursorRef.current[activeChapter.id] = targetIndex - 1;
      dirtyRef.current = false;
      setStatus(`Snapshot restaurado (v${targetSnapshot.version}).`);
    } catch (error) {
      setStatus(`No se pudo restaurar snapshot: ${formatUnknownError(error)}`);
    }
  }, [book, activeChapter, syncBookToLibrary]);

  const handleRedoSnapshot = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    try {
      const stack = snapshotRedoStackRef.current[activeChapter.id] ?? [];
      if (stack.length === 0) {
        setStatus('No hay snapshot para rehacer.');
        return;
      }

      const targetChapter = stack[stack.length - 1];
      snapshotRedoStackRef.current[activeChapter.id] = stack.slice(0, -1);
      setSnapshotRedoNonce((value) => value + 1);

      const persisted = await saveChapter(book.path, {
        ...targetChapter,
        updatedAt: getNowIso(),
      });

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [persisted.id]: persisted,
          },
        };
      });

      await syncBookToLibrary({
        ...book,
        chapters: {
          ...book.chapters,
          [persisted.id]: persisted,
        },
      });

      const snapshots = await listChapterSnapshots(book.path, activeChapter.id);
      const currentPointer = snapshotUndoCursorRef.current[activeChapter.id] ?? -1;
      snapshotUndoCursorRef.current[activeChapter.id] = Math.min(currentPointer + 1, snapshots.length - 1);
      dirtyRef.current = false;
      setStatus('Snapshot rehecho.');
    } catch (error) {
      setStatus(`No se pudo rehacer snapshot: ${formatUnknownError(error)}`);
    }
  }, [book, activeChapter, syncBookToLibrary]);

  const handleSaveMilestone = useCallback(() => {
    if (!book || !activeChapter) {
      setStatus('Abre un capitulo para guardar un hito.');
      return;
    }

    setPromptModal({
      title: `Guardar hito - ${activeChapter.title}`,
      label: 'Nombre del hito',
      defaultValue: '',
      placeholder: 'Ej: Antes de correccion final',
      confirmLabel: 'Guardar hito',
      onConfirm: (milestoneLabel) => {
        setPromptModal(null);
        void (async () => {
          try {
            const snapshot = await saveChapterSnapshot(
              book.path,
              activeChapter,
              `Hito manual: ${milestoneLabel}`,
              { milestoneLabel },
            );
            snapshotRedoStackRef.current[activeChapter.id] = [];
            setSnapshotRedoNonce((value) => value + 1);

            let syncNote = '';
            try {
              const sync = await syncStoryBibleFromChapter(activeChapter);
              if (sync.addedCharacters > 0 || sync.addedLocations > 0) {
                syncNote = ` Biblia auto-actualizada (+${sync.addedCharacters} personaje/s, +${sync.addedLocations} lugar/es).`;
              }
            } catch (syncError) {
              syncNote = ` Auto-sincronizacion de biblia pendiente (${formatUnknownError(syncError)}).`;
            }

            setStatus(`Hito guardado: "${milestoneLabel}" (v${snapshot.version}).${syncNote}`);
          } catch (error) {
            setStatus(`No se pudo guardar el hito: ${formatUnknownError(error)}`);
          }
        })();
      },
    });
  }, [book, activeChapter, syncStoryBibleFromChapter]);

  const handleCreatePromptTemplate = useCallback(
    async (title: string, content: string) => {
      if (!book) {
        return;
      }

      const now = getNowIso();
      const template: PromptTemplate = {
        id: randomId('prompt'),
        title: title.trim(),
        content: content.trim(),
        createdAt: now,
        updatedAt: now,
      };

      const nextTemplates = [...promptTemplates, template];
      setPromptTemplates(nextTemplates);
      try {
        await savePromptTemplates(book.path, nextTemplates);
        setStatus(`Prompt guardado: ${template.title}`);
      } catch (error) {
        setStatus(`No se pudo guardar prompt: ${formatUnknownError(error)}`);
      }
    },
    [book, promptTemplates],
  );

  const handleDeletePromptTemplate = useCallback(
    async (templateId: string) => {
      if (!book) {
        return;
      }

      const nextTemplates = promptTemplates.filter((template) => template.id !== templateId);
      setPromptTemplates(nextTemplates);
      try {
        await savePromptTemplates(book.path, nextTemplates);
      } catch (error) {
        setStatus(`No se pudo eliminar prompt: ${formatUnknownError(error)}`);
      }
    },
    [book, promptTemplates],
  );

  const handlePickCover = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const selectedResult = await open({
        multiple: false,
        title: 'Selecciona portada',
        filters: [
          {
            name: 'Imagenes',
            extensions: ['png', 'jpg', 'jpeg', 'webp'],
          },
        ],
      });
      const selected = extractDialogPath(selectedResult);

      if (!selected) {
        return;
      }

      const metadata = await setCoverImage(book.path, book.metadata, selected);
      const updated: BookProject = {
        ...book,
        metadata,
      };

      setBook(updated);
      refreshCovers(updated);
      await syncBookToLibrary(updated);
      setStatus('Portada actualizada.');
    } catch (error) {
      setStatus(`Portada: ${formatUnknownError(error)}`);
    }
  }, [book, refreshCovers, syncBookToLibrary]);

  const handleClearCover = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const metadata = await clearCoverImage(book.path, book.metadata);
      const updated = { ...book, metadata };
      setBook(updated);
      refreshCovers(updated);
      await syncBookToLibrary(updated);
      setStatus('Portada eliminada.');
    } catch (error) {
      setStatus(`No se pudo quitar portada: ${formatUnknownError(error)}`);
    }
  }, [book, refreshCovers, syncBookToLibrary]);

  const handlePickBackCover = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const selectedResult = await open({
        multiple: false,
        title: 'Selecciona contraportada',
        filters: [
          {
            name: 'Imagenes',
            extensions: ['png', 'jpg', 'jpeg', 'webp'],
          },
        ],
      });
      const selected = extractDialogPath(selectedResult);

      if (!selected) {
        return;
      }

      const metadata = await setBackCoverImage(book.path, book.metadata, selected);
      const updated: BookProject = {
        ...book,
        metadata,
      };

      setBook(updated);
      refreshCovers(updated);
      await syncBookToLibrary(updated);
      setStatus('Contraportada actualizada.');
    } catch (error) {
      setStatus(`Contraportada: ${formatUnknownError(error)}`);
    }
  }, [book, refreshCovers, syncBookToLibrary]);

  const handleClearBackCover = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const metadata = await clearBackCoverImage(book.path, book.metadata);
      const updated = { ...book, metadata };
      setBook(updated);
      refreshCovers(updated);
      await syncBookToLibrary(updated);
      setStatus('Contraportada eliminada.');
    } catch (error) {
      setStatus(`No se pudo quitar contraportada: ${formatUnknownError(error)}`);
    }
  }, [book, refreshCovers, syncBookToLibrary]);

  const handleSpineTextChange = useCallback(
    (value: string) => {
      if (!book) {
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: {
            ...previous.metadata,
            spineText: value,
          },
        };
      });
    },
    [book],
  );

  const handleSaveCoverData = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const savedMetadata = await saveBookMetadata(book.path, book.metadata);
      const updated = {
        ...book,
        metadata: savedMetadata,
      };
      setBook(updated);
      await syncBookToLibrary(updated);
      setStatus('Datos de portada guardados.');
    } catch (error) {
      setStatus(`No se pudieron guardar los datos de portada: ${formatUnknownError(error)}`);
    }
  }, [book, syncBookToLibrary]);

  const queueEditorialGuardedAction = useCallback(
    (intentLabel: string, action: () => Promise<void>) => {
      if (!book) {
        return;
      }

      const report = buildEditorialChecklist(book.metadata, config);
      setEditorialIntent({
        isOpen: true,
        report,
        allowProceed: report.isReady,
        intentLabel,
        onProceed: report.isReady
          ? () => {
              void action();
            }
          : null,
      });

      if (!report.isReady) {
        setStatus('Checklist editorial: hay errores bloqueantes antes de exportar/publicar.');
      }
    },
    [book, config],
  );

  const handleExportCollaborationPatch = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const patch: CollaborationPatch = {
        version: 1,
        patchId: randomId('patch'),
        createdAt: getNowIso(),
        sourceBookTitle: book.metadata.title,
        sourceAuthor: book.metadata.author,
        sourceLanguage: normalizeLanguageCode(book.metadata.amazon.language),
        notes: '',
        chapters: orderedChapters.map((chapter) => ({
          chapterId: chapter.id,
          title: chapter.title,
          content: chapter.content,
          updatedAt: chapter.updatedAt,
        })),
      };
      const outputPath = await writeCollaborationPatchExport(book.path, patch);
      setStatus(`Patch colaborativo exportado: ${outputPath}`);
    } catch (error) {
      setStatus(`No se pudo exportar patch colaborativo: ${formatUnknownError(error)}`);
    }
  }, [book, orderedChapters]);

  const handleImportCollaborationPatch = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const selectedResult = await open({
        multiple: false,
        title: 'Selecciona patch de colaboracion',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      const selectedPath = extractDialogPath(selectedResult);
      if (!selectedPath) {
        return;
      }

      const patch = await readCollaborationPatchFile(selectedPath);
      const preview = buildCollaborationPatchPreview({
        patch,
        chapters: book.chapters,
      });
      const accepted = await confirm(
        formatCollaborationPatchPreviewMessage(patch, preview, { maxItems: 10 }),
        {
          title: 'Importar patch colaborativo',
          kind: 'warning',
          okLabel: 'Aplicar patch',
          cancelLabel: 'Cancelar',
        },
      );

      if (!accepted) {
        return;
      }

      let nextMetadata = {
        ...book.metadata,
        chapterOrder: [...book.metadata.chapterOrder],
        updatedAt: getNowIso(),
      };
      let nextChapters: BookProject['chapters'] = { ...book.chapters };
      const now = getNowIso();
      let createdCount = 0;
      let updatedCount = 0;

      for (const patchChapter of patch.chapters) {
        let targetChapterId = patchChapter.chapterId.trim();
        const existing = nextChapters[targetChapterId];
        if (!targetChapterId || (targetChapterId in nextChapters && !existing)) {
          targetChapterId = getNextChapterIdFromOrder(nextMetadata.chapterOrder);
        }

        if (nextChapters[targetChapterId]) {
          if (config.autoVersioning) {
            await saveChapterSnapshot(book.path, nextChapters[targetChapterId], `Patch colaborativo ${patch.patchId}`);
          }
          updatedCount += 1;
        } else {
          createdCount += 1;
          nextMetadata = {
            ...nextMetadata,
            chapterOrder: [...nextMetadata.chapterOrder, targetChapterId],
          };
        }

        const baseChapter = nextChapters[targetChapterId];
        const persisted = await saveChapter(book.path, {
          id: targetChapterId,
          title: patchChapter.title || baseChapter?.title || `Capitulo ${targetChapterId}`,
          content: patchChapter.content,
          contentJson: null,
          lengthPreset: baseChapter?.lengthPreset ?? 'media',
          createdAt: baseChapter?.createdAt ?? now,
          updatedAt: now,
        });

        nextChapters = {
          ...nextChapters,
          [targetChapterId]: persisted,
        };
      }

      const savedMetadata = await saveBookMetadata(book.path, nextMetadata);
      const nextProject: BookProject = {
        ...book,
        metadata: savedMetadata,
        chapters: nextChapters,
      };

      setBook(nextProject);
      await syncBookToLibrary(nextProject);
      setStatus(`Patch aplicado: ${updatedCount} capitulo/s actualizados, ${createdCount} creados.`);
    } catch (error) {
      setStatus(`No se pudo importar patch colaborativo: ${formatUnknownError(error)}`);
    }
  }, [book, config.autoVersioning, syncBookToLibrary]);

  const handleExportChapter = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    try {
      const { exportChapterMarkdown } = await loadExportModule();
      const path = await exportChapterMarkdown(book.path, activeChapter);
      setStatus(`Capitulo exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar capitulo: ${formatUnknownError(error)}`);
    }
  }, [book, activeChapter]);

  const handleExportBookSingle = useCallback(async () => {
    if (!book) {
      return;
    }

    queueEditorialGuardedAction('Exportar libro (archivo unico)', async () => {
      try {
        const { exportBookMarkdownSingleFile } = await loadExportModule();
        const path = await exportBookMarkdownSingleFile(book.path, book.metadata, orderedChapters);
        setStatus(`Libro exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar libro: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportBookSplit = useCallback(async () => {
    if (!book) {
      return;
    }

    queueEditorialGuardedAction('Exportar libro por capitulos', async () => {
      try {
        const { exportBookMarkdownByChapter } = await loadExportModule();
        const files = await exportBookMarkdownByChapter(book.path, orderedChapters);
        setStatus(`Capitulos exportados: ${files.length} archivos`);
      } catch (error) {
        setStatus(`No se pudo exportar libro: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportAmazonBundle = useCallback(async () => {
    if (!book) {
      return;
    }

    queueEditorialGuardedAction('Exportar pack Amazon', async () => {
      try {
        const { exportBookAmazonBundle } = await loadExportModule();
        const files = await exportBookAmazonBundle(book.path, book.metadata, orderedChapters);
        setStatus(`Pack Amazon exportado (${files.length} archivos).`);
      } catch (error) {
        setStatus(`No se pudo exportar pack Amazon: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportBookDocx = useCallback(async () => {
    if (!book) {
      return;
    }

    queueEditorialGuardedAction('Exportar DOCX editorial', async () => {
      try {
        const { exportBookDocx } = await loadExportModule();
        const path = await exportBookDocx(book.path, book.metadata, orderedChapters);
        setStatus(`DOCX editorial exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar DOCX: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportBookEpub = useCallback(async () => {
    if (!book) {
      return;
    }

    queueEditorialGuardedAction('Exportar EPUB editorial', async () => {
      try {
        const { exportBookEpub } = await loadExportModule();
        const path = await exportBookEpub(book.path, book.metadata, orderedChapters);
        setStatus(`EPUB editorial exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar EPUB: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportBookAudiobook = useCallback(async () => {
    if (!book) {
      return;
    }

    queueEditorialGuardedAction('Exportar audiolibro WAV', async () => {
      await exportAudioToWav(
        buildBookAudioText(book.metadata, orderedChapters),
        buildBookAudioExportPath(book.path, book.metadata),
        'Audiolibro exportado',
      );
    });
  }, [book, orderedChapters, queueEditorialGuardedAction, exportAudioToWav]);

  const handleExportStyleReport = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const { exportBookStyleReport } = await loadExportModule();
      const path = await exportBookStyleReport(book.path, book.metadata, orderedChapters);
      setStatus(`Reporte de estilo exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar reporte de estilo: ${formatUnknownError(error)}`);
    }
  }, [book, orderedChapters]);

  const handleOpenLibraryBook = useCallback(
    async (bookPath: string) => {
      const entry = libraryIndex.books.find((item) => item.path === bookPath);
      setStatus(`Abriendo libro: ${entry?.title ?? bookPath}`);
      try {
        await loadProject(bookPath);
        setMainView('outline');
      } catch (error) {
        setStatus(`Biblioteca abrir: ${formatUnknownError(error)}`);
      }
    },
    [libraryIndex.books, loadProject],
  );

  const handleOpenLibraryBookChat = useCallback(
    async (bookPath: string) => {
      const entry = libraryIndex.books.find((item) => item.path === bookPath);
      setStatus(`Abriendo chat de libro: ${entry?.title ?? bookPath}`);
      try {
        await loadProject(bookPath);
        setChatScope('book');
        setMainView('outline');
        setStatus('Libro abierto en modo chat de libro.');
      } catch (error) {
        setStatus(`Biblioteca chat: ${formatUnknownError(error)}`);
      }
    },
    [libraryIndex.books, loadProject],
  );

  const handleOpenLibraryBookAmazon = useCallback(
    async (bookPath: string) => {
      const entry = libraryIndex.books.find((item) => item.path === bookPath);
      setStatus(`Abriendo seccion Amazon: ${entry?.title ?? bookPath}`);
      try {
        await loadProject(bookPath);
        setMainView('amazon');
      } catch (error) {
        setStatus(`Biblioteca Amazon: ${formatUnknownError(error)}`);
      }
    },
    [libraryIndex.books, loadProject],
  );

  const handleDeleteLibraryBook = useCallback(
    async (bookPath: string) => {
      const libraryEntry = libraryIndex.books.find((entry) => entry.path === bookPath);
      const title = libraryEntry?.title ?? 'este libro';
      const accepted = await confirm(
        `Vas a eliminar "${title}" de la biblioteca y tambien su carpeta en disco.\nEsta accion es permanente.`,
        {
          title: 'Eliminar libro',
          kind: 'warning',
          okLabel: 'Eliminar',
          cancelLabel: 'Cancelar',
        },
      );

      if (!accepted) {
        return;
      }

      try {
        if (book && book.path === bookPath) {
          try {
            await flushChapterSave();
          } catch {
            // Sigue el cierre aunque falle un guardado tardio.
          }
          setBook(null);
          setActiveChapterId(null);
          setMainView('editor');
          setChatScope('chapter');
          refreshCovers(null);
          dirtyRef.current = false;
          snapshotUndoCursorRef.current = {};
          snapshotRedoStackRef.current = {};
          setSnapshotRedoNonce((value) => value + 1);
          setCanUndoEdit(false);
          setCanRedoEdit(false);
        }

        const nextIndex = await removeBookFromLibrary(bookPath, { deleteFiles: true });
        setLibraryIndex(nextIndex);
        setStatus(`Libro eliminado: ${title}`);
      } catch (error) {
        setStatus(`No se pudo eliminar el libro: ${formatUnknownError(error)}`);
      }
    },
    [book, flushChapterSave, libraryIndex.books, refreshCovers],
  );

  const handleSetBookPublished = useCallback(
    async (bookPath: string, published: boolean) => {
      const entry = libraryIndex.books.find((item) => item.path === bookPath);
      setStatus(
        published
          ? `Marcando como publicado: ${entry?.title ?? bookPath}`
          : `Marcando como no publicado: ${entry?.title ?? bookPath}`,
      );
      try {
        const project = book && book.path === bookPath ? book : await loadBookProject(bookPath);
        if (published) {
          const report = buildEditorialChecklist(project.metadata, config);
          if (!report.isReady) {
            if (book && book.path === project.path) {
              setEditorialIntent({
                isOpen: true,
                report,
                allowProceed: false,
                intentLabel: 'Marcar como publicado',
                onProceed: null,
              });
            }
            setStatus('No se puede marcar como publicado: checklist editorial con errores.');
            return;
          }
        }
        const nextMetadata = await saveBookMetadata(project.path, {
          ...project.metadata,
          isPublished: published,
          publishedAt: published ? getNowIso() : null,
        });
        const updatedProject: BookProject = {
          ...project,
          metadata: nextMetadata,
        };

        if (book && book.path === bookPath) {
          setBook(updatedProject);
        }

        await syncBookToLibrary(updatedProject);
        setStatus(published ? 'Libro marcado como publicado.' : 'Libro marcado como no publicado.');
      } catch (error) {
        setStatus(`No se pudo actualizar estado de publicacion: ${formatUnknownError(error)}`);
      }
    },
    [book, libraryIndex.books, syncBookToLibrary, config],
  );

  const centerView = useMemo(() => {
    if (mainView === 'outline') {
      return (
        <LazyOutlineView
          chapters={orderedChapters}
          onMoveChapter={(chapterId, direction) => {
            void handleMoveChapter(chapterId, direction);
          }}
          onMoveToPosition={(chapterId, position) => {
            void handleMoveChapterToPosition(chapterId, position);
          }}
          onSelectChapter={(chapterId) => {
            setActiveChapterId(chapterId);
            setMainView('editor');
          }}
        />
      );
    }

    if (mainView === 'preview' && book) {
      return (
        <LazyPreviewView
          title={book.metadata.title}
          author={book.metadata.author}
          chapters={orderedChapters}
          interiorFormat={interiorFormat}
          coverSrc={coverSrc}
          backCoverSrc={backCoverSrc}
          chapterPageMap={chapterPageMap}
        />
      );
    }

    if (mainView === 'diff') {
      return (
        <LazyVersionDiffView
          bookPath={book?.path ?? null}
          chapters={orderedChapters}
          activeChapterId={activeChapterId}
        />
      );
    }

    if (mainView === 'style') {
      return (
        <LazyStylePanel
          hasBook={Boolean(book)}
          bookTitle={book?.metadata.title ?? ''}
          chapters={orderedChapters}
          activeChapterId={activeChapterId}
          onExportReport={handleExportStyleReport}
        />
      );
    }

    if (mainView === 'cover') {
      return (
        <LazyCoverView
          coverSrc={coverSrc}
          backCoverSrc={backCoverSrc}
          coverDiagnostic={coverLoadDiagnostics.cover}
          backCoverDiagnostic={coverLoadDiagnostics.backCover}
          coverFileInfo={coverFileInfo.cover}
          backCoverFileInfo={coverFileInfo.backCover}
          spineText={book?.metadata.spineText ?? ''}
          onPickCover={handlePickCover}
          onClearCover={handleClearCover}
          onPickBackCover={handlePickBackCover}
          onClearBackCover={handleClearBackCover}
          onRetryLoad={handleRetryCoverLoad}
          onSpineTextChange={handleSpineTextChange}
          onSaveSpineText={handleSaveCoverData}
        />
      );
    }

    if (mainView === 'foundation') {
      return (
        <LazyBookFoundationPanel
          foundation={book?.metadata.foundation ?? {
            centralIdea: '',
            promise: '',
            audience: '',
            narrativeVoice: '',
            styleRules: '',
            structureNotes: '',
            glossaryPreferred: '',
            glossaryAvoid: '',
          }}
          onChange={handleFoundationChange}
          onSave={handleSaveFoundation}
        />
      );
    }

    if (mainView === 'bible') {
      return (
        <LazyStoryBiblePanel
          storyBible={book?.metadata.storyBible ?? {
            characters: [],
            locations: [],
            continuityRules: '',
          }}
          hasActiveChapter={Boolean(activeChapter)}
          onChange={handleStoryBibleChange}
          onSyncFromActiveChapter={() => {
            void handleSyncStoryBibleFromActiveChapter();
          }}
          onSave={handleSaveStoryBible}
        />
      );
    }

    if (mainView === 'amazon' && book) {
      return (
        <LazyAmazonPanel
          metadata={book.metadata}
          chapters={orderedChapters}
          onChangeMetadata={handleAmazonMetadataChange}
          onSave={handleSaveAmazon}
          onExportAmazonBundle={handleExportAmazonBundle}
        />
      );
    }

    if (mainView === 'search') {
      return (
        <LazySearchReplacePanel
          hasBook={Boolean(book)}
          bookTitle={book?.metadata.title ?? ''}
          query={searchQuery}
          replacement={replaceQuery}
          caseSensitive={searchCaseSensitive}
          wholeWord={searchWholeWord}
          activeChapterId={activeChapterId}
          results={searchMatches}
          totalMatches={searchTotalMatches}
          busy={searchBusy}
          onQueryChange={setSearchQuery}
          onReplacementChange={setReplaceQuery}
          onCaseSensitiveChange={setSearchCaseSensitive}
          onWholeWordChange={setSearchWholeWord}
          onRunSearch={handleRunBookSearch}
          onPreviewReplaceInBook={handlePreviewReplaceInBook}
          onReplaceInChapter={() => {
            void handleReplaceInActiveChapter();
          }}
          onReplaceInBook={() => {
            void handleReplaceInBook();
          }}
          onSelectChapter={(chapterId) => {
            setActiveChapterId(chapterId);
            setMainView('editor');
          }}
          previewReport={searchPreviewReport}
        />
      );
    }

    if (mainView === 'settings') {
      return (
        <LazySettingsPanel
          key={book?.path ?? 'no-book'}
          config={config}
          bookPath={book?.path ?? null}
          onChange={setConfig}
          onSave={handleSaveSettings}
          onPickBackupDirectory={handlePickBackupDirectory}
          onRunBackupNow={handleBackupNow}
        />
      );
    }

    if (mainView === 'language') {
      return (
        <LazyLanguagePanel
          config={config}
          bookPath={book?.path ?? null}
          amazonLanguage={book?.metadata.amazon.language ?? null}
          amazonMarketplace={book?.metadata.amazon.marketplace ?? null}
          marketPricing={book?.metadata.amazon.marketPricing ?? []}
          onChangeLanguage={handleLanguageChange}
          onOpenAmazon={() => setMainView('amazon')}
          onSave={handleSaveSettings}
          isDirty={languageDirty}
          saveState={languageSaveState}
        />
      );
    }

    if (!activeChapter) {
      return (
        <section className="editor-pane empty-state">
          <h2>Editor</h2>
          <p>Abri o crea un libro para empezar.</p>
        </section>
      );
    }

    return (
      <LazyEditorPane
        ref={editorRef}
        chapter={activeChapter}
        interiorFormat={interiorFormat}
        autosaveIntervalMs={config.autosaveIntervalMs}
        canUndoEdit={canUndoEdit}
        canRedoEdit={canRedoEdit}
        chapterWordCount={chapterWordCount}
        chapterEstimatedPages={activeChapterPageRange?.pages ?? 0}
        chapterPageStart={activeChapterPageRange?.start ?? 0}
        chapterPageEnd={activeChapterPageRange?.end ?? 0}
        bookWordCount={bookWordCount}
        bookEstimatedPages={bookEstimatedPages}
        audioPlaybackState={audioPlaybackState}
        onUndoEdit={() => {
          void handleUndoEdit();
        }}
        onRedoEdit={() => {
          void handleRedoEdit();
        }}
        onReadAloud={handleReadActiveChapterAloud}
        onTogglePauseReadAloud={handleTogglePauseReadAloud}
        onStopReadAloud={stopReadAloud}
        onExportChapterAudio={() => {
          void handleExportActiveChapterAudio();
        }}
        onLengthPresetChange={handleChapterLengthPresetChange}
        onContentChange={handleEditorChange}
        onBlur={() => {
          void flushChapterSave();
        }}
      />
    );
  }, [
    activeChapterId,
    activeChapter,
    book,
    config,
    coverSrc,
    backCoverSrc,
    coverLoadDiagnostics,
    coverFileInfo,
    flushChapterSave,
    handleClearBackCover,
    handleClearCover,
    handleChapterLengthPresetChange,
    handleEditorChange,
    handleAmazonMetadataChange,
    handleExportAmazonBundle,
    handleExportStyleReport,
    handleSaveAmazon,
    handleLanguageChange,
    languageDirty,
    languageSaveState,
    handleReplaceInBook,
    handleReplaceInActiveChapter,
    handlePreviewReplaceInBook,
    handleRunBookSearch,
    handlePickBackCover,
    handleFoundationChange,
    handleSaveFoundation,
    handleStoryBibleChange,
    handleSaveStoryBible,
    handleSyncStoryBibleFromActiveChapter,
    handleMoveChapter,
    handleMoveChapterToPosition,
    handlePickCover,
    handleSaveCoverData,
    handleRetryCoverLoad,
    handleSaveSettings,
    handlePickBackupDirectory,
    handleBackupNow,
    handleSpineTextChange,
    handleReadActiveChapterAloud,
    handleTogglePauseReadAloud,
    handleExportActiveChapterAudio,
    stopReadAloud,
    handleUndoEdit,
    handleRedoEdit,
    interiorFormat,
    mainView,
    orderedChapters,
    chapterPageMap,
    chapterWordCount,
    activeChapterPageRange,
    bookWordCount,
    bookEstimatedPages,
    audioPlaybackState,
    canUndoEdit,
    canRedoEdit,
    replaceQuery,
    searchBusy,
    searchCaseSensitive,
    searchMatches,
    searchQuery,
    searchTotalMatches,
    searchWholeWord,
    searchPreviewReport,
  ]);

  return (
    <>
      <AppShell
        focusMode={focusMode}
        leftCollapsed={leftPanelCollapsed}
        rightCollapsed={rightPanelCollapsed}
        onToggleLeft={toggleLeftPanel}
        onToggleRight={toggleRightPanel}
        sidebar={
          <Sidebar
            hasBook={Boolean(book)}
            activeBookPath={book?.path ?? null}
            bookTitle={book?.metadata.title ?? 'Sin libro'}
            chapters={orderedChapters}
            libraryBooks={libraryIndex.books}
            libraryExpanded={libraryExpanded}
            activeChapterId={activeChapterId}
            onToggleLibrary={() => setLibraryExpanded((previous) => !previous)}
            onOpenLibraryBook={handleOpenLibraryBook}
            onOpenLibraryBookChat={handleOpenLibraryBookChat}
            onOpenLibraryBookAmazon={handleOpenLibraryBookAmazon}
            onDeleteLibraryBook={handleDeleteLibraryBook}
            onSetBookPublished={handleSetBookPublished}
            onCreateChapter={handleCreateChapter}
            onRenameChapter={handleRenameChapter}
            onDuplicateChapter={handleDuplicateChapter}
            onDeleteChapter={handleDeleteChapter}
            onMoveChapter={handleMoveChapter}
            onSelectChapter={(chapterId) => {
              setActiveChapterId(chapterId);
              setMainView('editor');
            }}
            onExportChapter={handleExportChapter}
            onExportBookSingle={handleExportBookSingle}
            onExportBookSplit={handleExportBookSplit}
            onExportAmazonBundle={handleExportAmazonBundle}
            onExportBookDocx={handleExportBookDocx}
            onExportBookEpub={handleExportBookEpub}
            onExportAudiobook={handleExportBookAudiobook}
            onExportCollaborationPatch={handleExportCollaborationPatch}
            onImportCollaborationPatch={handleImportCollaborationPatch}
            onOpenEditorialChecklist={() => openEditorialChecklist('Continuar de todos modos')}
          />
        }
        center={
          <div className="center-stack">
            {book ? (
              <header className="active-book-banner">
                <div className="active-book-banner-row">
                  <div>
                    <h2>{book.metadata.title}</h2>
                    <p>{book.path}</p>
                  </div>
                  <div className="active-book-banner-actions">
                    <button
                      type="button"
                      onClick={handleRenameBookTitle}
                      title="Renombra el titulo del libro activo."
                    >
                      Renombrar libro
                    </button>
                    <button
                      type="button"
                      onClick={handleRenameBookAuthor}
                      title="Renombra el autor del libro activo."
                    >
                      Renombrar autor
                    </button>
                    <button
                      type="button"
                      onClick={toggleFocusMode}
                      className={focusMode ? 'is-active' : ''}
                      title="Oculta o muestra paneles laterales para escribir sin distracciones."
                    >
                      {focusMode ? 'Salir foco' : 'Modo foco'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHelpOpen(false);
                        setOnboardingOpen(true);
                      }}
                      title="Abre la guia inicial con checklist y recorrido paso a paso."
                    >
                      Guia inicial
                    </button>
                    <button
                      type="button"
                      onClick={() => setHelpOpen(true)}
                      title="Abre la guia completa de uso por funciones."
                    >
                      Ayuda completa
                    </button>
                  </div>
                </div>
              </header>
            ) : (
              <header className="active-book-banner is-empty">
                <div className="active-book-banner-row">
                  <div>
                    <h2>Sin libro abierto</h2>
                    <p>Crea o abre una carpeta de libro para empezar.</p>
                  </div>
                  <div className="active-book-banner-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setHelpOpen(false);
                        setOnboardingOpen(true);
                      }}
                      title="Abre la guia inicial con checklist y recorrido paso a paso."
                    >
                      Guia inicial
                    </button>
                    <button
                      type="button"
                      onClick={() => setHelpOpen(true)}
                      title="Abre la guia completa de uso por funciones."
                    >
                      Ayuda completa
                    </button>
                  </div>
                </div>
              </header>
            )}
            <TopToolbar
              hasBook={Boolean(book)}
              currentView={mainView}
              focusMode={focusMode}
              onCreateBook={handleCreateBook}
              onOpenBook={handleOpenBook}
              onCloseBook={handleCloseBook}
              onToggleFocusMode={toggleFocusMode}
              onShowEditor={() => setMainView('editor')}
              onShowOutline={() => setMainView('outline')}
              onShowPreview={() => setMainView('preview')}
              onShowDiff={() => setMainView('diff')}
              onShowStyle={() => setMainView('style')}
              onShowCover={() => setMainView('cover')}
              onShowFoundation={() => setMainView('foundation')}
              onShowBible={() => setMainView('bible')}
              onShowAmazon={() => setMainView('amazon')}
              onShowSearch={() => setMainView('search')}
              onShowSettings={() => setMainView('settings')}
              onShowLanguage={() => setMainView('language')}
            />
            <Suspense
              fallback={
                <section className="view-loading" role="status" aria-live="polite">
                  Cargando vista...
                </section>
              }
            >
              {centerView}
            </Suspense>
          </div>
        }
        right={
          book ? (
            <Suspense
              fallback={
                <section className="ai-panel" role="status" aria-live="polite">
                  <header>
                    <h2>Asistente IA</h2>
                    <p className="muted">Cargando panel IA...</p>
                  </header>
                </section>
              }
            >
              <LazyAIPanel
                actions={AI_ACTIONS}
                aiBusy={aiBusy}
                canUndoSnapshots={Boolean(book && activeChapter)}
                canRedoSnapshots={canRedoSnapshots}
                scope={chatScope}
                chapterLengthInfo={chapterLengthInfo}
                bookLengthInfo={bookLengthInfo}
                messages={currentMessages}
                autoApplyChatChanges={config.autoApplyChatChanges}
                chatApplyIterations={config.chatApplyIterations}
                continuousAgentEnabled={config.continuousAgentEnabled}
                continuousAgentMaxRounds={config.continuousAgentMaxRounds}
                promptTemplates={promptTemplates}
                onScopeChange={setChatScope}
                onRunAction={handleRunAction}
                onSendChat={handleSendChat}
                onTrackCharacter={handleTrackCharacter}
                onSummarizeStory={handleSummarizeStory}
                chapterCount={orderedChapters.length}
                onUndoSnapshot={handleUndoSnapshot}
                onRedoSnapshot={handleRedoSnapshot}
                onSaveMilestone={handleSaveMilestone}
                onCreatePromptTemplate={handleCreatePromptTemplate}
                onDeletePromptTemplate={handleDeletePromptTemplate}
              />
            </Suspense>
          ) : (
            <section className="ai-panel">
              <header>
                <h2>Asistente IA</h2>
                <p>Abri un libro para activar chat, acciones y snapshots IA.</p>
              </header>
            </section>
          )
        }
        status={book ? `Libro activo: ${book.metadata.title} | ${status}` : status}
      />
      <OnboardingPanel
        isOpen={onboardingOpen}
        hasBook={Boolean(book)}
        hasChapters={orderedChapters.length > 0}
        hasFoundation={hasFoundationData}
        hasStoryBible={hasStoryBibleData}
        hasCover={Boolean(book?.metadata.coverImage || book?.metadata.backCoverImage)}
        hasAmazonCore={hasAmazonCoreData}
        onClose={() => setOnboardingOpen(false)}
        onDismissForever={dismissOnboardingForever}
        onCreateBook={() => {
          setOnboardingOpen(false);
          void handleCreateBook();
        }}
        onOpenBook={() => {
          setOnboardingOpen(false);
          void handleOpenBook();
        }}
        onGoToView={(view) => {
          setMainView(view);
        }}
      />
      <Suspense fallback={null}>
        <LazyHelpPanel
          isOpen={helpOpen}
          focusMode={focusMode}
          onClose={() => setHelpOpen(false)}
          onCreateBook={() => {
            void handleCreateBook();
          }}
          onOpenBook={() => {
            void handleOpenBook();
          }}
          onToggleFocusMode={toggleFocusMode}
        />
      </Suspense>
      {aiSafeReview ? (
        <ChangeReviewModal
          isOpen
          title={aiSafeReview.title}
          subtitle={aiSafeReview.subtitle}
          beforeText={aiSafeReview.beforeText}
          afterText={aiSafeReview.afterText}
          confirmLabel="Aplicar cambios"
          cancelLabel="Cancelar cambios"
          onConfirm={() => {
            const resolver = aiSafeReview.resolve;
            setAiSafeReview(null);
            resolver(true);
          }}
          onCancel={() => {
            const resolver = aiSafeReview.resolve;
            setAiSafeReview(null);
            resolver(false);
          }}
        />
      ) : null}
      <EditorialChecklistModal
        isOpen={editorialIntent.isOpen}
        report={editorialIntent.report}
        intentLabel={editorialIntent.intentLabel}
        allowProceed={editorialIntent.allowProceed}
        onClose={closeEditorialChecklist}
        onProceed={() => {
          const proceed = editorialIntent.onProceed;
          closeEditorialChecklist();
          proceed?.();
        }}
      />
      {promptModal && (
        <PromptModal
          key={`${promptModal.title}-${promptModal.label}-${promptModal.defaultValue ?? ''}`}
          isOpen
          title={promptModal.title}
          label={promptModal.label}
          defaultValue={promptModal.defaultValue}
          placeholder={promptModal.placeholder}
          multiline={promptModal.multiline}
          confirmLabel={promptModal.confirmLabel}
          secondaryLabel={promptModal.secondaryLabel}
          onSecondary={promptModal.onSecondary}
          onConfirm={promptModal.onConfirm}
          onClose={() => setPromptModal(null)}
        />
      )}
    </>
  );
}

export default App;
