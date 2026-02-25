import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { confirm, open } from '@tauri-apps/plugin-dialog';

import AppShell from './app/AppShell';
import AIPanel from './components/AIPanel';
import AmazonPanel from './components/AmazonPanel';
import BookFoundationPanel from './components/BookFoundationPanel';
import CoverView from './components/CoverView';
import EditorPane from './components/EditorPane';
import HelpPanel from './components/HelpPanel';
import LanguagePanel from './components/LanguagePanel';
import OutlineView from './components/OutlineView';
import PreviewView from './components/PreviewView';
import SearchReplacePanel from './components/SearchReplacePanel';
import SettingsPanel from './components/SettingsPanel';
import Sidebar from './components/Sidebar';
import TopToolbar from './components/TopToolbar';
import type { TiptapEditorHandle } from './components/TiptapEditor';
import { formatChapterLengthLabel, getChapterLengthProfile, resolveChapterLengthPreset } from './lib/chapterLength';
import { DEFAULT_APP_CONFIG } from './lib/config';
import {
  exportBookAmazonBundle,
  exportBookMarkdownByChapter,
  exportBookMarkdownSingleFile,
  exportChapterMarkdown,
} from './lib/export';
import { countWordsFromHtml, countWordsFromPlainText, estimatePagesFromWords, formatNumber } from './lib/metrics';
import { generateWithOllama } from './lib/ollamaClient';
import {
  AI_ACTIONS,
  buildActionPrompt,
  buildAutoRewritePrompt,
  buildChatPrompt,
  buildContinuousChapterPrompt,
} from './lib/prompts';
import { getLanguageInstruction, normalizeLanguageCode } from './lib/language';
import PromptModal from './components/PromptModal';
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
  resolveBookDirectory,
  moveChapter,
  renameChapter,
  removeBookFromLibrary,
  saveAppConfig,
  saveBookMetadata,
  saveChapter,
  saveChapterSnapshot,
  setBackCoverImage,
  setCoverImage,
  upsertBookInLibrary,
  updateBookChats,
} from './lib/storage';
import {
  buildBookSearchMatches,
  replaceMatchesInHtml,
  type ChapterSearchMatch,
  type SearchReplaceOptions,
} from './lib/searchReplace';
import { getNowIso, normalizeAiOutput, plainTextToHtml, randomId, splitAiOutputAndSummary, stripHtml } from './lib/text';
import type {
  AppConfig,
  BookProject,
  ChapterLengthPreset,
  ChatMessage,
  ChatScope,
  LibraryIndex,
  MainView,
} from './types/book';

import './App.css';

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
    const firstPath = value.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return firstPath ? firstPath.trim() : null;
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

interface ExpansionGuardResult {
  text: string;
  summaryText: string;
  corrected: boolean;
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
  const snapshotUndoCursorRef = useRef<Record<string, number | undefined>>({});
  const snapshotRedoStackRef = useRef<Record<string, BookProject['chapters'][string][]>>({});

  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [book, setBook] = useState<BookProject | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>('editor');
  const [status, setStatus] = useState('Listo.');
  const [aiBusy, setAiBusy] = useState(false);
  const [chatScope, setChatScope] = useState<ChatScope>('chapter');
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
  const [focusMode, setFocusMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMatches, setSearchMatches] = useState<ChapterSearchMatch[]>([]);
  const [searchTotalMatches, setSearchTotalMatches] = useState(0);
  const [canUndoEdit, setCanUndoEdit] = useState(false);
  const [canRedoEdit, setCanRedoEdit] = useState(false);
  const [snapshotRedoNonce, setSnapshotRedoNonce] = useState(0);
  const [promptModal, setPromptModal] = useState<{
    title: string;
    label: string;
    defaultValue?: string;
    placeholder?: string;
    multiline?: boolean;
    confirmLabel?: string;
    onConfirm: (value: string) => void;
  } | null>(null);

  const orderedChapters = useMemo(() => {
    if (!book) {
      return [];
    }

    return book.metadata.chapterOrder
      .map((chapterId) => book.chapters[chapterId])
      .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
  }, [book]);

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
      return book.metadata.chats.book;
    }

    if (!activeChapterId) {
      return [] as ChatMessage[];
    }

    return book.metadata.chats.chapters[activeChapterId] ?? [];
  }, [book, chatScope, activeChapterId]);

  const currentSearchOptions = useMemo<SearchReplaceOptions>(
    () => ({
      caseSensitive: searchCaseSensitive,
      wholeWord: searchWholeWord,
    }),
    [searchCaseSensitive, searchWholeWord],
  );

  const activeLanguage = useMemo(() => normalizeLanguageCode(config.language), [config.language]);

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
    () => orderedChapters.reduce((total, chapter) => total + countWordsFromHtml(chapter.content), 0),
    [orderedChapters],
  );

  const chapterPageMap = useMemo(() => {
    const map: Record<string, { start: number; end: number; pages: number }> = {};
    let cursor = 1;

    for (const chapter of orderedChapters) {
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
  }, [orderedChapters, interiorFormat]);

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

    return `${orderedChapters.length} capitulos | ${formatNumber(totalMinWords)}-${formatNumber(totalMaxWords)} palabras aprox (${breakdownParts.join(', ')}).`;
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

  const refreshCovers = useCallback((project: BookProject | null) => {
    if (!project) {
      setCoverSrc(null);
      setBackCoverSrc(null);
      return;
    }

    const timestamp = Date.now();
    const absoluteFrontPath = getCoverAbsolutePath(project.path, project.metadata);
    const absoluteBackPath = getBackCoverAbsolutePath(project.path, project.metadata);
    setCoverSrc(absoluteFrontPath ? `${convertFileSrc(absoluteFrontPath)}?v=${timestamp}` : null);
    setBackCoverSrc(absoluteBackPath ? `${convertFileSrc(absoluteBackPath)}?v=${timestamp}` : null);
  }, []);

  const refreshLibrary = useCallback(async () => {
    const index = await loadLibraryIndex();
    setLibraryIndex(index);
  }, []);

  const syncBookToLibrary = useCallback(
    async (project: BookProject, options?: { markOpened?: boolean }) => {
      const nextIndex = await upsertBookInLibrary(project, options);
      setLibraryIndex(nextIndex);
    },
    [],
  );

  const toggleFocusMode = useCallback(() => {
    setFocusMode((previous) => !previous);
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

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

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
    refreshSearchResults(book, searchQuery, currentSearchOptions);
  }, [book, searchQuery, currentSearchOptions, refreshSearchResults]);

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

    saveInFlightRef.current = true;
    try {
      const saved = await saveChapter(book.path, chapter);
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [saved.id]: saved,
          },
        };
      });
      dirtyRef.current = false;
      setStatus(`Guardado automatico ${new Date().toLocaleTimeString()}`);
      await syncBookToLibrary({
        ...book,
        chapters: {
          ...book.chapters,
          [saved.id]: saved,
        },
      });
    } catch (error) {
      setStatus(`Error al guardar: ${(error as Error).message}`);
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

  const applyOpenedProjectState = useCallback(
    (project: BookProject, loadedConfig: AppConfig) => {
      setBook(project);
      setConfig({
        ...loadedConfig,
        language: normalizeLanguageCode(loadedConfig.language),
      });
      setActiveChapterId(project.metadata.chapterOrder[0] ?? null);
      setMainView('editor');
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
    setPromptModal({
      title: 'Crear nuevo libro',
      label: 'Titulo del libro',
      defaultValue: 'Mi libro',
      onConfirm: async (title) => {
        setPromptModal({
          title: 'Crear nuevo libro',
          label: 'Autor',
          defaultValue: 'Autor',
          onConfirm: async (author) => {
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

              setStatus('Crear libro: creando estructura del libro...');
              const created = await createBookProject(selectedDirectory, title, author);

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
      },
    });
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

    setBook(null);
    setActiveChapterId(null);
    setMainView('editor');
    setFocusMode(false);
    setChatScope('chapter');
    setSearchMatches([]);
    setSearchTotalMatches(0);
    refreshCovers(null);
    setCanUndoEdit(false);
    setCanRedoEdit(false);
    dirtyRef.current = false;
    snapshotUndoCursorRef.current = {};
    snapshotRedoStackRef.current = {};
    setSnapshotRedoNonce((value) => value + 1);
    setStatus('Libro cerrado.');
  }, [flushChapterSave, refreshCovers]);

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
      return;
    }

    try {
      const normalizedConfig: AppConfig = {
        ...config,
        language: activeLanguage,
      };
      await saveAppConfig(book.path, normalizedConfig);
      setConfig(normalizedConfig);
      setStatus('Settings guardados en config.json del libro.');
    } catch (error) {
      setStatus(`Error guardando settings: ${(error as Error).message}`);
    }
  }, [book, config, activeLanguage]);

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
      setStatus(`No se pudo guardar la base: ${(error as Error).message}`);
    }
  }, [book, syncBookToLibrary]);

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
      setStatus(`No se pudo guardar Amazon: ${(error as Error).message}`);
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
          setStatus(`No se pudo crear el capitulo: ${(error as Error).message}`);
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
            setStatus(`No se pudo renombrar: ${(error as Error).message}`);
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
        setStatus(`No se pudo duplicar: ${(error as Error).message}`);
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

        if (activeChapterId === chapterId) {
          setActiveChapterId(metadata.chapterOrder[0] ?? null);
        }

        setStatus('Capitulo eliminado.');
      } catch (error) {
        setStatus(`No se pudo eliminar: ${(error as Error).message}`);
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
        setStatus(`No se pudo mover: ${(error as Error).message}`);
      }
    },
    [book, syncBookToLibrary],
  );

  const handleRunBookSearch = useCallback(() => {
    if (!book) {
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setSearchMatches([]);
      setSearchTotalMatches(0);
      setStatus('Buscar: escribe texto para iniciar la busqueda.');
      return;
    }

    setSearchBusy(true);
    try {
      const report = buildBookSearchMatches(orderedChapters, query, currentSearchOptions);
      setSearchMatches(report.matches);
      setSearchTotalMatches(report.totalMatches);
      setStatus(`Busqueda completada: ${report.totalMatches} coincidencia/s en ${report.matches.length} capitulo/s.`);
    } finally {
      setSearchBusy(false);
    }
  }, [book, searchQuery, orderedChapters, currentSearchOptions]);

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

    setSearchBusy(true);
    try {
      let totalReplacements = 0;
      let changedChapters = 0;
      let workingChapters: BookProject['chapters'] = { ...book.chapters };

      for (const chapterId of book.metadata.chapterOrder) {
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

      if (ctrlOrMeta && shift && key === 'h') {
        event.preventDefault();
        setHelpOpen((previous) => !previous);
        return;
      }

      if (ctrlOrMeta && shift && key === 'f') {
        event.preventDefault();
        setFocusMode((previous) => !previous);
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
  }, [activeChapterId, book, flushChapterSave, handleCreateChapter, handleMoveChapter, promptModal]);

  const persistScopeMessages = useCallback(
    async (scope: ChatScope, messages: ChatMessage[]) => {
      if (!book) {
        return;
      }

      const nextChats = {
        ...book.metadata.chats,
        chapters: {
          ...book.metadata.chats.chapters,
        },
      };

      if (scope === 'book') {
        nextChats.book = messages;
      } else if (activeChapterId) {
        nextChats.chapters[activeChapterId] = messages;
      }

      const nextMetadata = await updateBookChats(book.path, book.metadata, nextChats);
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
    [book, activeChapterId],
  );

  const handleSendChat = useCallback(
    async (message: string, scope: ChatScope) => {
      if (!book) {
        return;
      }

      const history =
        scope === 'book' ? book.metadata.chats.book : book.metadata.chats.chapters[activeChapterId ?? ''] ?? [];

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
        await persistScopeMessages(scope, withUser);

        const chapterText = activeChapter ? stripHtml(activeChapter.content) : '';
        const compactHistory = history
          .slice(-8)
          .map((item) => `${item.role === 'user' ? 'Usuario' : 'Asistente'}: ${item.content}`)
          .join('\n');

        if (!config.autoApplyChatChanges) {
          const prompt = buildChatPrompt({
            scope,
            message,
            bookTitle: book.metadata.title,
            language: activeLanguage,
            foundation: book.metadata.foundation,
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

          await persistScopeMessages(scope, [...withUser, assistantMessage]);
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

          if (config.continuousAgentEnabled) {
            const maxRounds = Math.max(1, Math.min(12, config.continuousAgentMaxRounds));
            let previousSummary = '';

            for (let round = 1; round <= maxRounds; round += 1) {
              if (config.autoVersioning) {
                await saveChapterSnapshot(book.path, chapter, `Agente continuo ronda ${round}/${maxRounds}`);
              }

              const currentChapterText = stripHtml(chapter.content);
              const prompt = buildContinuousChapterPrompt({
                userInstruction: message,
                bookTitle: book.metadata.title,
                language: activeLanguage,
                foundation: book.metadata.foundation,
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
              const nextChapterText = guardedResult.text;
              previousSummary = parsed.summary;
              lastSummaryMessage = guardedResult.summaryText || parsed.summary || lastSummaryMessage;

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
              const prompt = buildAutoRewritePrompt({
                userInstruction: message,
                bookTitle: book.metadata.title,
                language: activeLanguage,
                foundation: book.metadata.foundation,
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
              const nextChapterText = guardedResult.text;
              lastSummaryMessage = guardedResult.summaryText || lastSummaryMessage;

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

              setStatus(`Aplicando cambios al capitulo (${iteration}/${iterations})...`);
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
            content:
              buildSummaryMessage(lastSummaryMessage) ||
              `Cambios aplicados automaticamente en "${chapter.title}".`,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(scope, [...withUser, assistantMessage]);
          setStatus(
            config.continuousAgentEnabled
              ? 'Chat aplicado con agente continuo al capitulo.'
              : 'Chat aplicado automaticamente al capitulo.',
          );
          return;
        }

        let workingChapters: BookProject['chapters'] = { ...book.chapters };
        let extractedSummaries = 0;

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
            const prompt = buildAutoRewritePrompt({
              userInstruction: message,
              bookTitle: book.metadata.title,
              language: activeLanguage,
              foundation: book.metadata.foundation,
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
            const nextChapterText = guardedResult.text;
            if (guardedResult.summaryText) {
              extractedSummaries += 1;
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
          content: `Cambios aplicados automaticamente en todo el libro (${book.metadata.chapterOrder.length} capitulos, ${iterations} iteracion/es).${extractedSummaries > 0 ? ` Resumenes detectados: ${extractedSummaries}.` : ''}`,
          createdAt: getNowIso(),
        };

        await persistScopeMessages(scope, [...withUser, assistantMessage]);
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
      syncBookToLibrary,
      enforceExpansionResult,
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

      const prompt = buildActionPrompt({
        actionId,
        selectedText: promptTargetText,
        ideaText: normalizedIdea,
        chapterTitle: activeChapter.title,
        bookTitle: book.metadata.title,
        language: activeLanguage,
        foundation: book.metadata.foundation,
        chapterLengthPreset: activeChapter.lengthPreset,
        chapterContext: stripHtml(activeChapter.content),
        fullBookContext: buildBookContext(book),
      });

      setAiBusy(true);
      setStatus(actionId === 'draft-from-idea' ? 'Generando capitulo desde idea...' : 'Aplicando accion IA...');

      try {
        const action = AI_ACTIONS.find((item) => item.id === actionId);
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
            instruction:
              actionId === 'draft-from-idea'
                ? `Escribir desde idea. ${normalizedIdea}`
                : `${action.label}. ${action.description}`,
            originalText: expansionSourceText,
            candidateText: outputText,
            bookTitle: book.metadata.title,
            chapterTitle: activeChapter.title,
          });
          outputText = expansionResult.text;
          summaryText = expansionResult.summaryText || summaryText;
        }

        if (action?.modifiesText) {
          if (actionId === 'draft-from-idea' || !hasSelection) {
            editor.replaceDocumentWithText(outputText);
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
            const currentChapterMessages = book.metadata.chats.chapters[activeChapter.id] ?? [];
            const summaryMessage: ChatMessage = {
              id: randomId('msg'),
              role: 'assistant',
              scope: 'chapter',
              content: buildSummaryMessage(summaryText, `Resumen de cambios (${action?.label ?? actionId}):`),
              createdAt: getNowIso(),
            };
            await persistScopeMessages('chapter', [...currentChapterMessages, summaryMessage]);
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
              ? book.metadata.chats.book
              : book.metadata.chats.chapters[activeChapter.id] ?? [];

          const feedbackMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope: feedbackScope,
            content: `Devolucion (${action?.label ?? actionId}):\n${outputText}`,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(feedbackScope, [...history, feedbackMessage]);
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
      syncBookToLibrary,
      enforceExpansionResult,
      activeLanguage,
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
      setStatus(`No se pudo quitar portada: ${(error as Error).message}`);
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
      setStatus(`No se pudo quitar contraportada: ${(error as Error).message}`);
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
      setStatus(`No se pudieron guardar los datos de portada: ${(error as Error).message}`);
    }
  }, [book, syncBookToLibrary]);

  const handleExportChapter = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    try {
      const path = await exportChapterMarkdown(book.path, activeChapter);
      setStatus(`Capitulo exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar capitulo: ${(error as Error).message}`);
    }
  }, [book, activeChapter]);

  const handleExportBookSingle = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const path = await exportBookMarkdownSingleFile(book.path, book.metadata, orderedChapters);
      setStatus(`Libro exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar libro: ${(error as Error).message}`);
    }
  }, [book, orderedChapters]);

  const handleExportBookSplit = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const files = await exportBookMarkdownByChapter(book.path, orderedChapters);
      setStatus(`Capitulos exportados: ${files.length} archivos`);
    } catch (error) {
      setStatus(`No se pudo exportar libro: ${(error as Error).message}`);
    }
  }, [book, orderedChapters]);

  const handleExportAmazonBundle = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const files = await exportBookAmazonBundle(book.path, book.metadata, orderedChapters);
      setStatus(`Pack Amazon exportado (${files.length} archivos).`);
    } catch (error) {
      setStatus(`No se pudo exportar pack Amazon: ${(error as Error).message}`);
    }
  }, [book, orderedChapters]);

  const handleOpenLibraryBook = useCallback(
    async (bookPath: string) => {
      const entry = libraryIndex.books.find((item) => item.path === bookPath);
      setStatus(`Abriendo libro: ${entry?.title ?? bookPath}`);
      try {
        await loadProject(bookPath);
        setMainView('editor');
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
        setMainView('editor');
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
        setStatus(`No se pudo eliminar el libro: ${(error as Error).message}`);
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
        setStatus(`No se pudo actualizar estado de publicacion: ${(error as Error).message}`);
      }
    },
    [book, libraryIndex.books, syncBookToLibrary],
  );

  const centerView = useMemo(() => {
    if (mainView === 'outline') {
      return (
        <OutlineView
          chapters={orderedChapters}
          onSelectChapter={(chapterId) => {
            setActiveChapterId(chapterId);
            setMainView('editor');
          }}
        />
      );
    }

    if (mainView === 'preview' && book) {
      return (
        <PreviewView
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

    if (mainView === 'cover') {
      return (
        <CoverView
          coverSrc={coverSrc}
          backCoverSrc={backCoverSrc}
          spineText={book?.metadata.spineText ?? ''}
          onPickCover={handlePickCover}
          onClearCover={handleClearCover}
          onPickBackCover={handlePickBackCover}
          onClearBackCover={handleClearBackCover}
          onSpineTextChange={handleSpineTextChange}
          onSaveSpineText={handleSaveCoverData}
        />
      );
    }

    if (mainView === 'foundation') {
      return (
        <BookFoundationPanel
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

    if (mainView === 'amazon' && book) {
      return (
        <AmazonPanel
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
        <SearchReplacePanel
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
        />
      );
    }

    if (mainView === 'settings') {
      return <SettingsPanel config={config} bookPath={book?.path ?? null} onChange={setConfig} onSave={handleSaveSettings} />;
    }

    if (mainView === 'language') {
      return <LanguagePanel config={config} bookPath={book?.path ?? null} onChange={setConfig} onSave={handleSaveSettings} />;
    }

    return (
      <EditorPane
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
        onUndoEdit={() => {
          void handleUndoEdit();
        }}
        onRedoEdit={() => {
          void handleRedoEdit();
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
    flushChapterSave,
    handleClearBackCover,
    handleClearCover,
    handleChapterLengthPresetChange,
    handleEditorChange,
    handleAmazonMetadataChange,
    handleExportAmazonBundle,
    handleSaveAmazon,
    handleReplaceInBook,
    handleReplaceInActiveChapter,
    handleRunBookSearch,
    handlePickBackCover,
    handleFoundationChange,
    handleSaveFoundation,
    handlePickCover,
    handleSaveCoverData,
    handleSaveSettings,
    handleSpineTextChange,
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
    canUndoEdit,
    canRedoEdit,
    replaceQuery,
    searchBusy,
    searchCaseSensitive,
    searchMatches,
    searchQuery,
    searchTotalMatches,
    searchWholeWord,
  ]);

  return (
    <>
      <AppShell
        focusMode={focusMode}
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
                      onClick={toggleFocusMode}
                      className={focusMode ? 'is-active' : ''}
                      title="Oculta o muestra paneles laterales para escribir sin distracciones."
                    >
                      {focusMode ? 'Salir foco' : 'Modo foco'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHelpOpen(true)}
                      title="Abre la guia con funciones, atajos y pasos recomendados."
                    >
                      Ayuda
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
                      onClick={() => setHelpOpen(true)}
                      title="Abre la guia con funciones, atajos y pasos recomendados."
                    >
                      Ayuda
                    </button>
                  </div>
                </div>
              </header>
            )}
            <TopToolbar
              hasBook={Boolean(book)}
              currentView={mainView}
              onCreateBook={handleCreateBook}
              onOpenBook={handleOpenBook}
              onCloseBook={handleCloseBook}
              onShowEditor={() => setMainView('editor')}
              onShowOutline={() => setMainView('outline')}
              onShowPreview={() => setMainView('preview')}
              onShowCover={() => setMainView('cover')}
              onShowFoundation={() => setMainView('foundation')}
              onShowAmazon={() => setMainView('amazon')}
              onShowSearch={() => setMainView('search')}
              onShowSettings={() => setMainView('settings')}
              onShowLanguage={() => setMainView('language')}
            />
            {centerView}
          </div>
        }
        right={
          <AIPanel
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
            onScopeChange={setChatScope}
            onRunAction={handleRunAction}
            onSendChat={handleSendChat}
            onUndoSnapshot={handleUndoSnapshot}
            onRedoSnapshot={handleRedoSnapshot}
          />
        }
        status={book ? `Libro activo: ${book.metadata.title} | ${status}` : status}
      />
      <button
        type="button"
        className="help-fab"
        onClick={() => setHelpOpen(true)}
        title="Guia rapida de uso: funciones, atajos y flujo recomendado."
      >
        Ayuda
      </button>
      <HelpPanel
        isOpen={helpOpen}
        focusMode={focusMode}
        onClose={() => setHelpOpen(false)}
        onCreateBook={handleCreateBook}
        onOpenBook={handleOpenBook}
        onToggleFocusMode={toggleFocusMode}
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
          onConfirm={promptModal.onConfirm}
          onClose={() => setPromptModal(null)}
        />
      )}
    </>
  );
}

export default App;
