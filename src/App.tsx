import { Suspense, lazy, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { exists, readFile } from '@tauri-apps/plugin-fs';

import AppShell from './app/AppShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import Sidebar from './components/Sidebar';
import TopToolbar from './components/TopToolbar';
import './styles/tokens.css';
import './styles/shell.css';
import './App.css';
import './styles/ai-panel.css';
import './styles/atlas.css';
import './styles/editor.css';
import './styles/saga-panel.css';
import './styles/sidebar.css';
import './styles/timeline.css';
import './styles/top-toolbar.css';
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
import { generateWithOllama, inspectOllamaService, type OllamaServiceStatus } from './lib/ollamaClient';
import {
  AI_ACTIONS,
  buildActionPrompt,
  buildAutoRewritePrompt,
  buildChatPrompt,
  buildContinuityGuardPrompt,
  buildContinuousChapterPrompt,
  parseContinuousAgentOutput,
  parseContinuityGuardOutput,
  selectSagaWorldForPrompt,
  selectStoryBibleForPrompt,
} from './lib/prompts';
import { getLanguageInstruction, normalizeLanguageCode } from './lib/language';
import {
  attachBookToSaga,
  clearBackCoverImage,
  clearCoverImage,
  createBookProject,
  createSagaProject,
  createChapter,
  deleteChapter,
  detachBookFromSaga,
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
  recoverPendingAiTransactions,
  recordAiTrustIncident,
  loadSagaProject,
  savePromptTemplates,
  readCollaborationPatchFile,
  rollbackAiTransaction,
  startAiTransaction,
  saveSagaMetadata,
  writeAiSessionAudit,
  commitAiTransaction,
  writeCollaborationPatchExport,
  syncBookToBackupDirectory,
  syncBookReferenceInLinkedSaga,
  resolveBookDirectory,
  moveChapter,
  moveSagaBook,
  renameChapter,
  removeBookFromLibrary,
  removeSagaFromLibrary,
  saveAppConfig,
  saveBookMetadata,
  saveBookChatMessages,
  saveChapter,
  saveChapterChatMessages,
  saveChapterSnapshot,
  setBackCoverImage,
  setCoverImage,
  updateSagaBookVolume,
  upsertBookInLibrary,
  upsertSagaInLibrary,
} from './lib/storage';
import {
  buildBookSearchMatches,
  buildBookSearchMatchesAsync,
  buildBookReplacePreviewAsync,
  buildSagaSearchMatchesAsync,
  getSearchPatternError,
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
import { buildContinuityGuardReport, buildContinuityHighlights } from './lib/continuityGuard';
import { buildChapterContinuityBriefing } from './lib/chapterContinuityBriefing';
import { applyBookCreationTemplate, type BookCreationTemplateId } from './lib/projectTemplates';
import { buildSagaCanonicalView, buildUnifiedStoryBibleIndex, filterStoryBibleByCanon } from './lib/canon';
import {
  buildSemanticReferenceCatalog,
  findSemanticReferenceMatch,
  type SemanticReferenceKind,
} from './lib/semanticReferences';
import {
  buildStoryProgressDigest,
  buildStoryProgressPrompt,
  formatStoryProgressFallback,
} from './lib/storyProgressSummary';
import { buildSagaConsistencyReport } from './lib/sagaConsistency';
import { buildEditorialChecklist, type EditorialChecklistReport } from './lib/editorialChecklist';
import { applyBookAutoRewrite } from './lib/bookAutoApply';
import { getNowIso, normalizeAiOutput, plainTextToHtml, randomId, splitAiOutputAndSummary, stripHtml } from './lib/text';
import type {
  AiAssistantMode,
  AppConfig,
  BookChats,
  BookProject,
  ChapterDocument,
  ChapterLengthPreset,
  ChapterManuscriptNote,
  ChapterRangeFilter,
  ChatMessage,
  ChatScope,
  CollaborationPatch,
  EditorialChecklistCustomItem,
  LibraryIndex,
  MainView,
  PromptTemplate,
  SagaProject,
} from './types/book';


const LazyAIPanel = lazy(() => import('./components/AIPanel'));
const LazyAmazonPanel = lazy(() => import('./components/AmazonPanel'));
const LazyBookFoundationPanel = lazy(() => import('./components/BookFoundationPanel'));
const LazyChangeReviewModal = lazy(() => import('./components/ChangeReviewModal'));
const LazyCoverView = lazy(() => import('./components/CoverView'));
const LazyEditorPane = lazy(() => import('./components/EditorPane'));
const LazyEditorialChecklistModal = lazy(() => import('./components/EditorialChecklistModal'));
const LazyHelpPanel = lazy(() => import('./components/HelpPanel'));
const LazyLanguagePanel = lazy(() => import('./components/LanguagePanel'));
const LazyOnboardingPanel = lazy(() => import('./components/OnboardingPanel'));
const LazyOutlineView = lazy(() => import('./components/OutlineView'));
const LazyPreviewView = lazy(() => import('./components/PreviewView'));
const LazyPlotBoardView = lazy(() => import('./components/PlotBoardView'));
const LazyPromptModal = lazy(() => import('./components/PromptModal'));
const LazyRelationshipGraphView = lazy(() => import('./components/RelationshipGraphView'));
const LazySagaDashboardView = lazy(() => import('./components/SagaDashboardView'));
const LazySagaPanel = lazy(() => import('./components/SagaPanel'));
const LazySearchReplacePanel = lazy(() => import('./components/SearchReplacePanel'));
const LazySettingsPanel = lazy(() => import('./components/SettingsPanel'));
const LazyStoryBiblePanel = lazy(() => import('./components/StoryBiblePanel'));
const LazyStylePanel = lazy(() => import('./components/StylePanel'));
const LazyTimelineView = lazy(() => import('./components/TimelineView'));
const LazyVersionDiffView = lazy(() => import('./components/VersionDiffView'));
const LazyWorldMapView = lazy(() => import('./components/WorldMapView'));
const LazyScratchpadView = lazy(() => import('./components/ScratchpadView'));
const LazyLooseThreadsView = lazy(() => import('./components/LooseThreadsView'));
const LazyCharacterMatrixView = lazy(() => import('./components/CharacterMatrixView'));

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

function buildIdleOllamaStatus(configuredModel: string): OllamaServiceStatus {
  return {
    state: 'idle',
    configuredModel: configuredModel.trim(),
    availableModels: [],
    message: 'Chequea IA local para validar Ollama y el modelo configurado.',
  };
}

interface AiChangeCardEntry {
  chapterId?: string;
  label: string;
  beforeText: string;
  afterText: string;
}

function formatSignedDelta(value: number): string {
  if (value > 0) {
    return `+${formatNumber(value)}`;
  }
  return formatNumber(value);
}

function splitPinnedRules(value: string): string[] {
  return value
    .split(/\r?\n|;/g)
    .map((entry) => entry.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

const CONTEXT_TOKEN_PATTERN = /[\p{L}\p{N}']+/gu;
const CONTEXT_STOPWORDS = new Set([
  'a',
  'al',
  'con',
  'como',
  'de',
  'del',
  'el',
  'ella',
  'en',
  'es',
  'esta',
  'este',
  'la',
  'las',
  'lo',
  'los',
  'para',
  'por',
  'que',
  'se',
  'sin',
  'un',
  'una',
  'y',
]);

function normalizeContextToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractContextTokens(value: string, maxTokens = 180): Set<string> {
  const tokens = new Set<string>();
  const matches = value.match(CONTEXT_TOKEN_PATTERN) ?? [];
  for (const token of matches) {
    const normalized = normalizeContextToken(token);
    if (normalized.length < 3 || CONTEXT_STOPWORDS.has(normalized)) {
      continue;
    }
    tokens.add(normalized);
    if (tokens.size >= maxTokens) {
      break;
    }
  }
  return tokens;
}

function scoreContextOverlap(base: Set<string>, candidate: Set<string>): number {
  let score = 0;
  for (const token of candidate) {
    if (base.has(token)) {
      score += 1;
    }
  }
  return score;
}

interface ContextJumpMarker {
  kind: 'chapter' | 'timeline' | 'saga-rule';
  id: string;
  label: string;
}

interface ContextEvidenceMarker {
  kind: 'chapter' | 'timeline' | 'saga-rule';
  id: string;
  label: string;
  snippet: string;
}

function sanitizeContextMarkerValue(value: string, maxLength = 200): string {
  const compact = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  const cleaned = compact.replace(/[|\]]+/g, ' ');
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(40, maxLength - 1)).trim()}…`;
}

function extractContextEvidenceSnippet(
  source: string,
  tokens: Set<string>,
  maxLength = 170,
): string {
  const normalizedSource = source.replace(/\s+/g, ' ').trim();
  if (!normalizedSource) {
    return '';
  }

  const sentences = normalizedSource
    .split(/[.!?\n]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (sentences.length === 0) {
    return sanitizeContextMarkerValue(normalizedSource, maxLength);
  }

  let bestSentence = sentences[0];
  let bestScore = -1;
  for (const sentence of sentences) {
    const score = scoreContextOverlap(tokens, extractContextTokens(sentence, 64));
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  return sanitizeContextMarkerValue(bestSentence, maxLength);
}

function appendContextJumpMarkers(
  answer: string,
  markers: ContextJumpMarker[],
  evidenceMarkers: ContextEvidenceMarker[] = [],
): string {
  if (markers.length === 0 && evidenceMarkers.length === 0) {
    return answer;
  }

  const lines: string[] = [answer.trim()];
  if (markers.length > 0) {
    lines.push('', 'Saltos contextuales sugeridos:');
    lines.push(
      ...markers.map((marker) => {
        const label = sanitizeContextMarkerValue(marker.label, 120);
        return `[[JUMP:${marker.kind}:${marker.id}|${label}]]`;
      }),
    );
  }

  if (evidenceMarkers.length > 0) {
    lines.push('', 'Evidencia interna consultada:');
    lines.push(
      ...evidenceMarkers.map((marker) => {
        const label = sanitizeContextMarkerValue(marker.label, 110);
        const snippet = sanitizeContextMarkerValue(marker.snippet, 180);
        return `[[CITE:${marker.kind}:${marker.id}|${label}|${snippet}]]`;
      }),
    );
  }

  return lines.filter((line) => line.length > 0).join('\n');
}

function buildAiChangeCard(input: {
  operation: string;
  scopeLabel: string;
  entries: AiChangeCardEntry[];
  continuityCorrections?: number;
  extractedSummaries?: number;
  interrupted?: boolean;
}): string {
  const scopedEntries = input.entries.filter((entry) => entry.label.trim().length > 0);
  if (scopedEntries.length === 0) {
    return `Tarjeta de cambios IA:\n- Operacion: ${input.operation}\n- Alcance: ${input.scopeLabel}\n- Sin cambios aplicados.`;
  }

  const entryStats = scopedEntries.map((entry) => {
    const beforeWords = countWordsFromPlainText(entry.beforeText);
    const afterWords = countWordsFromPlainText(entry.afterText);
    return {
      ...entry,
      beforeWords,
      afterWords,
      deltaWords: afterWords - beforeWords,
    };
  });

  const totalBeforeWords = entryStats.reduce((total, entry) => total + entry.beforeWords, 0);
  const totalAfterWords = entryStats.reduce((total, entry) => total + entry.afterWords, 0);
  const totalDeltaWords = totalAfterWords - totalBeforeWords;
  const deltaRatio = totalBeforeWords > 0 ? (totalDeltaWords / totalBeforeWords) * 100 : null;

  const lines = [
    'Tarjeta de cambios IA:',
    `- Operacion: ${input.operation}`,
    `- Alcance: ${input.scopeLabel}`,
    `- Capitulos tocados: ${entryStats.length}`,
    `- Palabras: ${formatNumber(totalBeforeWords)} -> ${formatNumber(totalAfterWords)} (${formatSignedDelta(totalDeltaWords)}${deltaRatio === null ? '' : `, ${deltaRatio >= 0 ? '+' : ''}${deltaRatio.toFixed(1)}%`})`,
  ];
  if (typeof input.extractedSummaries === 'number') {
    lines.push(`- Resumenes detectados: ${input.extractedSummaries}`);
  }
  if (typeof input.continuityCorrections === 'number') {
    lines.push(`- Correcciones continuidad: ${input.continuityCorrections}`);
  }
  if (input.interrupted) {
    lines.push('- Estado: proceso interrumpido por validacion manual.');
  }

  lines.push('Detalle:');
  for (const entry of entryStats.slice(0, 6)) {
    lines.push(
      `- ${entry.label}: ${formatNumber(entry.beforeWords)} -> ${formatNumber(entry.afterWords)} (${formatSignedDelta(entry.deltaWords)})`,
    );
  }

  if (entryStats.length > 6) {
    lines.push(`- ... ${entryStats.length - 6} capitulo/s adicional/es.`);
  }

  return lines.join('\n');
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

function resolveEditableElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target;
  }

  if (target instanceof Node) {
    if (target instanceof Element && target instanceof HTMLElement) {
      return target;
    }
    return target.parentElement;
  }

  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const targetElement = resolveEditableElement(target);
  const activeElement =
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const candidate = targetElement ?? activeElement;
  if (!candidate) {
    return false;
  }

  const tagName = candidate.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (candidate.isContentEditable || candidate.getAttribute('role') === 'textbox') {
    return true;
  }

  return Boolean(candidate.closest('[contenteditable="true"], .ProseMirror'));
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

interface ChapterEditorDraft {
  chapterId: string;
  html: string;
  json: unknown;
}

function buildChapterEditorDraft(chapter: ChapterDocument): ChapterEditorDraft {
  return {
    chapterId: chapter.id,
    html: chapter.content,
    json: chapter.contentJson ?? null,
  };
}

function applyChapterEditorDraft(chapter: ChapterDocument, draft: ChapterEditorDraft | null): ChapterDocument {
  if (!draft || draft.chapterId !== chapter.id || draft.html === chapter.content) {
    return chapter;
  }

  return {
    ...chapter,
    content: draft.html,
    contentJson: draft.json,
  };
}

function buildChapterSavePayload(chapter: ChapterDocument, draft: ChapterEditorDraft | null): ChapterDocument {
  if (!draft || draft.chapterId !== chapter.id) {
    return chapter;
  }

  return {
    ...chapter,
    content: draft.html,
    contentJson: draft.json,
  };
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
  dropCapEnabled: false,
  sceneBreakGlyph: '* * *',
  widowOrphanControl: true,
  chapterOpeningStyle: 'standard' as const,
};
const AUTOSAVE_TIMEOUT_MS = 15_000;
const MIN_EDITOR_DRAFT_SYNC_DELAY_MS = 900;
const REPLACE_BOOK_YIELD_EVERY = 3;
const ONBOARDING_DISMISSED_LEGACY_KEY = 'writewme:onboarding-dismissed-v1';
const ONBOARDING_STATE_KEY = 'writewme:onboarding-state-v2';
const SESSION_STATE_KEY = 'writewme:last-session-v1';
const AI_SAFE_MIN_DIFF_WORDS = 120;
const AI_SAFE_MIN_CHANGE_RATIO = 0.28;
const RELEASE_BOOK_AUTO_APPLY_ENABLED =
  String((import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_ALLOW_BOOK_AUTO_APPLY ?? 'false')
    .toLowerCase()
    .trim() === 'true';
const RESTORABLE_MAIN_VIEWS = new Set<MainView>([
  'editor',
  'outline',
  'preview',
  'diff',
  'style',
  'cover',
  'foundation',
  'bible',
  'saga',
  'timeline',
  'plot',
  'relations',
  'atlas',
  'amazon',
  'search',
  'settings',
  'language',
]);

interface PersistedSessionState {
  bookPath: string;
  activeChapterId: string | null;
  mainView: MainView;
  savedAt: string;
}

interface PersistedOnboardingState {
  autoOpenedOnce: boolean;
  dismissedForever: boolean;
  writingStarted: boolean;
  completed: boolean;
  backupGuardMode: 'strict' | 'explore';
  lastUpdated: string;
}

function createDefaultOnboardingState(): PersistedOnboardingState {
  return {
    autoOpenedOnce: false,
    dismissedForever: false,
    writingStarted: false,
    completed: false,
    backupGuardMode: 'strict',
    lastUpdated: '',
  };
}

function loadPersistedOnboardingState(): PersistedOnboardingState {
  const fallback = createDefaultOnboardingState();

  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(ONBOARDING_STATE_KEY);
    if (!raw) {
      const legacyDismissed = window.localStorage.getItem(ONBOARDING_DISMISSED_LEGACY_KEY) === '1';
      return legacyDismissed ? { ...fallback, dismissedForever: true } : fallback;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedOnboardingState> | null;
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    return {
      autoOpenedOnce: parsed.autoOpenedOnce === true,
      dismissedForever: parsed.dismissedForever === true,
      writingStarted: parsed.writingStarted === true,
      completed: parsed.completed === true,
      backupGuardMode: parsed.backupGuardMode === 'explore' ? 'explore' : 'strict',
      lastUpdated: typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : '',
    };
  } catch {
    return fallback;
  }
}

function savePersistedOnboardingState(state: PersistedOnboardingState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(state));
    if (state.dismissedForever) {
      window.localStorage.setItem(ONBOARDING_DISMISSED_LEGACY_KEY, '1');
    } else {
      window.localStorage.removeItem(ONBOARDING_DISMISSED_LEGACY_KEY);
    }
  } catch {
    // Ignora errores de persistencia para no bloquear la app.
  }
}

function loadPersistedSessionState(): PersistedSessionState | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STATE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedSessionState> | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (typeof parsed.bookPath !== 'string' || !parsed.bookPath.trim()) {
      return null;
    }
    if (typeof parsed.mainView !== 'string' || !RESTORABLE_MAIN_VIEWS.has(parsed.mainView as MainView)) {
      return null;
    }
    if (
      parsed.activeChapterId !== null &&
      parsed.activeChapterId !== undefined &&
      typeof parsed.activeChapterId !== 'string'
    ) {
      return null;
    }

    return {
      bookPath: parsed.bookPath.trim(),
      activeChapterId: typeof parsed.activeChapterId === 'string' ? parsed.activeChapterId : null,
      mainView: parsed.mainView as MainView,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}

function savePersistedSessionState(state: PersistedSessionState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignora errores de persistencia para no bloquear la app.
  }
}

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

interface AiRollbackSessionState {
  id: string;
  label: string;
  scope: ChatScope;
  bookPath: string;
  createdAt: string;
  chapterOrder: string[];
  chaptersBefore: Record<string, ChapterDocument>;
}

interface EditorLorePeekMatch {
  id: string;
  kind: 'character' | 'location' | 'timeline';
  label: string;
  detail: string;
  targetView: 'bible' | 'timeline';
}

interface EditorLorePeekState {
  query: string;
  matches: EditorLorePeekMatch[];
}

function cloneContentJsonForRollback(value: unknown | null | undefined): unknown | null {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }
}

function cloneChapterForRollback(chapter: ChapterDocument): ChapterDocument {
  return {
    ...chapter,
    contentJson: cloneContentJsonForRollback(chapter.contentJson),
  };
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

function normalizeLoreLookupValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ExpansionGuardResult {
  text: string;
  summaryText: string;
  corrected: boolean;
  highRisk: boolean;
  riskReason: string;
}

interface ContinuityGuardResult {
  text: string;
  summaryText: string;
  corrected: boolean;
  highRisk: boolean;
  riskReason: string;
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
  const bookRef = useRef<BookProject | null>(null);
  const editorDraftRef = useRef<ChapterEditorDraft | null>(null);
  const editorDraftSyncTimerRef = useRef<number | null>(null);
  const editorAutosaveTimerRef = useRef<number | null>(null);
  const editorHistoryAnimationFrameRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const closeInterceptBusyRef = useRef(false);
  const closeInterceptApprovedRef = useRef(false);
  const persistBookBeforeCloseRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const languageSaveResetTimerRef = useRef<number | null>(null);
  const snapshotUndoCursorRef = useRef<Record<string, number | undefined>>({});
  const snapshotRedoStackRef = useRef<Record<string, BookProject['chapters'][string][]>>({});
  const coverRefreshTokenRef = useRef(0);
  const coverSrcRef = useRef<string | null>(null);
  const backCoverSrcRef = useRef<string | null>(null);
  const backupInFlightRef = useRef(false);
  const lastBackupAtRef = useRef(0);
  const ollamaStatusRequestRef = useRef(0);
  const onboardingAutoHandledRef = useRef(false);
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
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaServiceStatus>(() => buildIdleOllamaStatus(DEFAULT_APP_CONFIG.model));
  const [book, setBook] = useState<BookProject | null>(null);
  const [activeSaga, setActiveSaga] = useState<SagaProject | null>(null);
  const [sagaChapterOptionsByBook, setSagaChapterOptionsByBook] = useState<
    Record<string, Array<{ id: string; title: string }>>
  >({});
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>('editor');
  const [status, setStatus] = useState('Listo.');
  const [exportBusy, setExportBusy] = useState(false);
  const [errorBoundaryNonce, setErrorBoundaryNonce] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [audioPlaybackState, setAudioPlaybackState] = useState<AudioPlaybackState>('idle');
  const [chatScope, setChatScope] = useState<ChatScope>('chapter');
  const [aiAssistantMode, setAiAssistantMode] = useState<AiAssistantMode>('rewrite');
  const [chatMessages, setChatMessages] = useState<BookChats>({
    book: [],
    chapters: {},
  });
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [backCoverSrc, setBackCoverSrc] = useState<string | null>(null);
  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex>({
    books: [],
    sagas: [],
    statusRules: {
      advancedChapterThreshold: 6,
    },
    updatedAt: getNowIso(),
  });
  const [libraryExpanded, setLibraryExpanded] = useState(true);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingBackupGuardMode, setOnboardingBackupGuardMode] = useState<'strict' | 'explore'>(
    () => loadPersistedOnboardingState().backupGuardMode,
  );
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchUseRegex, setSearchUseRegex] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMatches, setSearchMatches] = useState<ChapterSearchMatch[]>([]);
  const [searchTotalMatches, setSearchTotalMatches] = useState(0);
  const [searchPreviewReport, setSearchPreviewReport] = useState<ReplacePreviewReport | null>(null);
  const [sagaSearchResults, setSagaSearchResults] = useState<import('./lib/searchReplace').SagaBookSearchMatch[]>([]);
  const [sagaSearchTotalMatches, setSagaSearchTotalMatches] = useState(0);
  const [canUndoEdit, setCanUndoEdit] = useState(false);
  const [canRedoEdit, setCanRedoEdit] = useState(false);
  const [continuityHighlightEnabled, setContinuityHighlightEnabled] = useState(false);
  const [continuityBriefingRefreshNonce, setContinuityBriefingRefreshNonce] = useState(0);
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
  const [lastAiRollbackSession, setLastAiRollbackSession] = useState<AiRollbackSessionState | null>(null);
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
  const [editorLorePeek, setEditorLorePeek] = useState<EditorLorePeekState | null>(null);
  const [editorDraft, setEditorDraft] = useState<ChapterEditorDraft | null>(null);
  const focusMode = leftPanelCollapsed && rightPanelCollapsed;
  const editorDraftSyncDelayMs = Math.max(
    MIN_EDITOR_DRAFT_SYNC_DELAY_MS,
    Math.min(config.autosaveIntervalMs, 1600),
  );

  const clearEditorAutosaveTimer = useCallback(() => {
    if (editorAutosaveTimerRef.current !== null) {
      window.clearTimeout(editorAutosaveTimerRef.current);
      editorAutosaveTimerRef.current = null;
    }
  }, []);

  const flushEditorDraftState = useCallback((nextDraft: ChapterEditorDraft | null) => {
    if (editorDraftSyncTimerRef.current !== null) {
      window.clearTimeout(editorDraftSyncTimerRef.current);
      editorDraftSyncTimerRef.current = null;
    }

    startTransition(() => {
      setEditorDraft((previous) => {
        if (
          previous?.chapterId === nextDraft?.chapterId &&
          previous?.html === nextDraft?.html &&
          previous?.json === nextDraft?.json
        ) {
          return previous;
        }
        return nextDraft;
      });
    });
  }, []);

  const scheduleEditorDraftState = useCallback((nextDraft: ChapterEditorDraft) => {
    if (editorDraftSyncTimerRef.current !== null) {
      window.clearTimeout(editorDraftSyncTimerRef.current);
    }

    editorDraftSyncTimerRef.current = window.setTimeout(() => {
      editorDraftSyncTimerRef.current = null;
      flushEditorDraftState(nextDraft);
    }, editorDraftSyncDelayMs);
  }, [editorDraftSyncDelayMs, flushEditorDraftState]);

  useEffect(() => {
    return () => {
      if (editorDraftSyncTimerRef.current !== null) {
        window.clearTimeout(editorDraftSyncTimerRef.current);
      }
      if (editorAutosaveTimerRef.current !== null) {
        window.clearTimeout(editorAutosaveTimerRef.current);
      }
      if (editorHistoryAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(editorHistoryAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!activeSaga) {
      setSagaChapterOptionsByBook({});
      return () => {
        cancelled = true;
      };
    }

    const loadOptions = async () => {
      const pairs = await Promise.all(
        activeSaga.metadata.books.map(async (linkedBook) => {
          try {
            const project = await loadBookProject(linkedBook.bookPath);
            const options = project.metadata.chapterOrder.map((chapterId, index) => ({
              id: chapterId,
              title: project.chapters[chapterId]?.title || `Capitulo ${index + 1}`,
            }));
            return [linkedBook.bookPath, options] as const;
          } catch {
            return [linkedBook.bookPath, []] as const;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setSagaChapterOptionsByBook(Object.fromEntries(pairs));
    };

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [activeSaga]);

  const refreshOllamaStatus = useCallback(async () => {
    const requestId = ollamaStatusRequestRef.current + 1;
    ollamaStatusRequestRef.current = requestId;
    setOllamaStatus((previous) => ({
      ...previous,
      state: 'checking',
      configuredModel: config.model.trim(),
      message: 'Comprobando Ollama local...',
    }));

    const statusReport = await inspectOllamaService(config.model);
    if (ollamaStatusRequestRef.current !== requestId) {
      return;
    }

    setOllamaStatus(statusReport);
  }, [config.model]);

  useEffect(() => {
    if (!book?.path) {
      setOllamaStatus(buildIdleOllamaStatus(config.model));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshOllamaStatus();
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [book?.path, config.model, refreshOllamaStatus]);

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

  useEffect(() => {
    if (!book || !activeChapterId) {
      clearEditorAutosaveTimer();
      editorDraftRef.current = null;
      flushEditorDraftState(null);
      return;
    }

    const chapter = book.chapters[activeChapterId];
    if (!chapter) {
      clearEditorAutosaveTimer();
      editorDraftRef.current = null;
      flushEditorDraftState(null);
      return;
    }

    if (editorDraftSyncTimerRef.current !== null) {
      window.clearTimeout(editorDraftSyncTimerRef.current);
      editorDraftSyncTimerRef.current = null;
    }

    if (editorDraftRef.current?.chapterId === chapter.id && dirtyRef.current) {
      flushEditorDraftState(editorDraftRef.current);
      return;
    }

    const nextDraft = buildChapterEditorDraft(chapter);
    editorDraftRef.current = nextDraft;
    flushEditorDraftState(nextDraft);
  }, [activeChapterId, book, clearEditorAutosaveTimer, flushEditorDraftState]);

  const activeEditorChapter = useMemo(() => {
    if (!activeChapter) {
      return null;
    }

    return applyChapterEditorDraft(activeChapter, editorDraft);
  }, [activeChapter, editorDraft]);

  const activeChapterPlainText = useMemo(() => {
    if (!activeEditorChapter) {
      return '';
    }
    return stripHtml(activeEditorChapter.content);
  }, [activeEditorChapter]);
  const deferredActiveChapterPlainText = useDeferredValue(activeChapterPlainText);

  const activeChapterNumber = useMemo(() => {
    if (!book || !activeChapter) {
      return null;
    }

    const index = book.metadata.chapterOrder.indexOf(activeChapter.id);
    return index >= 0 ? index + 1 : null;
  }, [activeChapter, book]);

  const canonicalStoryBible = useMemo(() => {
    if (!book) {
      return null;
    }
    return filterStoryBibleByCanon(book.metadata.storyBible);
  }, [book]);

  const canonicalLinkedSagaWorld = useMemo(() => {
    if (!book?.metadata.sagaPath) {
      return null;
    }

    if (!activeSaga || activeSaga.path !== book.metadata.sagaPath) {
      return null;
    }

    return buildSagaCanonicalView(activeSaga)?.metadata.worldBible ?? null;
  }, [activeSaga, book?.metadata.sagaPath]);

  const storyBibleChronicleIndex = useMemo(() => {
    if (!canonicalStoryBible) {
      return null;
    }

    return buildUnifiedStoryBibleIndex(canonicalStoryBible, canonicalLinkedSagaWorld);
  }, [canonicalLinkedSagaWorld, canonicalStoryBible]);

  const continuityHighlights = useMemo(() => {
    if (!storyBibleChronicleIndex) {
      return [];
    }

    return buildContinuityHighlights(storyBibleChronicleIndex);
  }, [storyBibleChronicleIndex]);

  const activeChapterContinuityReport = useMemo(() => {
    if (!book || !activeEditorChapter) {
      return null;
    }

    const activeIndex = orderedChapters.findIndex((chapter) => chapter.id === activeEditorChapter.id);
    const priorChapterTexts =
      activeIndex > 0
        ? orderedChapters
            .slice(Math.max(0, activeIndex - 8), activeIndex)
            .map((chapter) => stripHtml(chapter.content))
        : [];

    return buildContinuityGuardReport({
      chapterText: deferredActiveChapterPlainText,
      storyBible: storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
      chapterNumber: activeChapterNumber,
      priorChapterTexts,
      language: config.language,
    });
  }, [
    activeEditorChapter,
    activeChapterNumber,
    book,
    canonicalStoryBible,
    config.language,
    deferredActiveChapterPlainText,
    orderedChapters,
    storyBibleChronicleIndex,
  ]);

  const semanticReferencesCatalog = useMemo(
    () =>
      buildSemanticReferenceCatalog({
        storyBible: storyBibleChronicleIndex ?? canonicalStoryBible ?? book?.metadata.storyBible ?? null,
        targetView: activeSaga ? 'saga' : 'bible',
        continuityReport: activeChapterContinuityReport,
      }),
    [activeChapterContinuityReport, activeSaga, book?.metadata.storyBible, canonicalStoryBible, storyBibleChronicleIndex],
  );
  const semanticReferenceCharacterCount = useMemo(
    () => semanticReferencesCatalog.filter((entry) => entry.kind === 'character').length,
    [semanticReferencesCatalog],
  );
  const semanticReferenceLocationCount = useMemo(
    () => semanticReferencesCatalog.filter((entry) => entry.kind === 'location').length,
    [semanticReferencesCatalog],
  );
  const activeChapterContinuityBriefing = useMemo(
    () => {
      void continuityBriefingRefreshNonce;
      return buildChapterContinuityBriefing({
        chapters: orderedChapters,
        activeChapterId,
        storyBible: storyBibleChronicleIndex ?? canonicalStoryBible ?? book?.metadata.storyBible ?? null,
        looseThreads: book?.metadata.looseThreads ?? [],
      });
    },
    [
      activeChapterId,
      book?.metadata.looseThreads,
      book?.metadata.storyBible,
      canonicalStoryBible,
      orderedChapters,
      storyBibleChronicleIndex,
      continuityBriefingRefreshNonce,
    ],
  );

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
    if (!storyBibleChronicleIndex) {
      return false;
    }

    return (
      storyBibleChronicleIndex.characters.length > 0 ||
      storyBibleChronicleIndex.locations.length > 0 ||
      storyBibleChronicleIndex.continuityRules.trim().length > 0
    );
  }, [storyBibleChronicleIndex]);
  const hasBackupConfigured = useMemo(() => config.backupDirectory.trim().length > 0, [config.backupDirectory]);
  const enforceBackupGate = onboardingBackupGuardMode === 'strict';

  const hasMeaningfulWriting = useMemo(
    () =>
      orderedChapters.some((chapter) => {
        if (countWordsFromHtml(chapter.content) > 0) {
          return true;
        }

        return stripHtml(chapter.content).trim().length > 0;
      }),
    [orderedChapters],
  );

  const hasCompletedOnboardingCore =
    Boolean(book) &&
    (!enforceBackupGate || hasBackupConfigured) &&
    orderedChapters.length > 0 &&
    hasMeaningfulWriting &&
    (hasFoundationData || hasStoryBibleData);

  const linkedSagaForBook = useMemo(() => {
    if (!book?.metadata.sagaPath) {
      return null;
    }

    if (!activeSaga || activeSaga.path !== book.metadata.sagaPath) {
      return null;
    }

    return activeSaga;
  }, [activeSaga, book?.metadata.sagaPath]);

  const activeBookSagaTitle = useMemo(() => {
    if (!book?.metadata.sagaPath) {
      return null;
    }

    const fromLibrary = libraryIndex.sagas.find((entry) => entry.path === book.metadata.sagaPath);
    if (fromLibrary) {
      return fromLibrary.title;
    }

    if (activeSaga && activeSaga.path === book.metadata.sagaPath) {
      return activeSaga.metadata.title;
    }

    return 'Saga vinculada';
  }, [activeSaga, book?.metadata.sagaPath, libraryIndex.sagas]);

  const activeSagaChronicleView = useMemo(() => buildSagaCanonicalView(activeSaga), [activeSaga]);

  const editorialChecklistReport = useMemo(() => {
    if (!book) {
      return null;
    }

    return buildEditorialChecklist(book.metadata, config);
  }, [book, config]);

  const buildSagaPromptContext = useCallback(
    (
      queryText: string,
      options?: {
        recentText?: string;
        recencyWeight?: number;
        maxEntitiesPerSection?: number;
        maxTimelineEvents?: number;
      },
    ): { sagaTitle: string | null; sagaWorld: SagaProject['metadata']['worldBible'] | null } => {
      if (!linkedSagaForBook) {
        return {
          sagaTitle: null,
          sagaWorld: null,
        };
      }

      return {
        sagaTitle: linkedSagaForBook.metadata.title,
        sagaWorld: selectSagaWorldForPrompt(linkedSagaForBook.metadata.worldBible, queryText, options),
      };
    },
    [linkedSagaForBook],
  );

  const aiContextSummary = useMemo(() => {
    if (!book) {
      return null;
    }

    const historyPreview = currentMessages
      .slice(-8)
      .map((item) => `${item.role === 'user' ? 'Usuario' : 'Asistente'}: ${item.content}`)
      .join('\n');
    const chapterText = activeEditorChapter ? stripHtml(activeEditorChapter.content) : '';
    const querySeed = [
      book.metadata.title,
      activeEditorChapter?.title ?? '',
      chapterText.slice(0, 3000),
      historyPreview,
    ]
      .filter(Boolean)
      .join('\n');
    const storyBibleSelection = selectStoryBibleForPrompt(
      storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
      querySeed,
      {
        recentText: historyPreview,
        recencyWeight: 1.1,
      },
    );
    const sagaContextSelection = buildSagaPromptContext(querySeed, {
      recentText: historyPreview,
      recencyWeight: 1.1,
    });
    const pinnedRules = splitPinnedRules(sagaContextSelection.sagaWorld?.pinnedAiRules ?? '');

    return {
      scopeLabel: chatScope === 'chapter' ? 'Capitulo activo' : 'Libro completo',
      manuscriptLabel:
        chatScope === 'chapter'
          ? activeEditorChapter?.title?.trim() || 'Capitulo activo'
          : `${orderedChapters.length} capitulo/s del manuscrito`,
      storyBibleCharacters: storyBibleSelection.characters.length,
      storyBibleLocations: storyBibleSelection.locations.length,
      storyBibleHasRules: storyBibleSelection.continuityRules.trim().length > 0,
      sagaTitle: sagaContextSelection.sagaTitle,
      sagaCharacters: sagaContextSelection.sagaWorld?.characters.length ?? 0,
      sagaLocations: sagaContextSelection.sagaWorld?.locations.length ?? 0,
      sagaTimelineEvents: sagaContextSelection.sagaWorld?.timeline.length ?? 0,
      sagaSecrets: sagaContextSelection.sagaWorld?.secrets?.length ?? 0,
      sagaRelationships: sagaContextSelection.sagaWorld?.relationships.length ?? 0,
      pinnedRuleCount: pinnedRules.length,
      pinnedRulesPreview: pinnedRules.slice(0, 3),
      historyMessageCount: Math.min(currentMessages.length, 8),
    };
  }, [
    activeEditorChapter,
    book,
    buildSagaPromptContext,
    canonicalStoryBible,
    chatScope,
    currentMessages,
    orderedChapters.length,
    storyBibleChronicleIndex,
  ]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  useEffect(() => {
    setEditorLorePeek(null);
  }, [activeChapterId, mainView]);

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
    if (!libraryLoaded || onboardingAutoHandledRef.current) {
      return;
    }

    const persisted = loadPersistedOnboardingState();
    const hasExistingWorkspace = libraryIndex.books.length > 0 || libraryIndex.sagas.length > 0;

    if (enforceBackupGate && !hasBackupConfigured) {
      setOnboardingOpen(true);
      savePersistedOnboardingState({
        ...persisted,
        backupGuardMode: onboardingBackupGuardMode,
        autoOpenedOnce: true,
        lastUpdated: getNowIso(),
      });
      onboardingAutoHandledRef.current = true;
      return;
    }

    if (config.expertWriterMode) {
      onboardingAutoHandledRef.current = true;
      return;
    }

    if (persisted.dismissedForever || persisted.autoOpenedOnce || persisted.completed || persisted.writingStarted) {
      onboardingAutoHandledRef.current = true;
      return;
    }

    if (hasExistingWorkspace || hasMeaningfulWriting || hasCompletedOnboardingCore) {
      savePersistedOnboardingState({
        ...persisted,
        backupGuardMode: onboardingBackupGuardMode,
        autoOpenedOnce: true,
        writingStarted: persisted.writingStarted || hasMeaningfulWriting,
        completed: persisted.completed || hasCompletedOnboardingCore,
        lastUpdated: getNowIso(),
      });
      onboardingAutoHandledRef.current = true;
      return;
    }

    setOnboardingOpen(true);
    savePersistedOnboardingState({
      ...persisted,
      backupGuardMode: onboardingBackupGuardMode,
      autoOpenedOnce: true,
      lastUpdated: getNowIso(),
    });
    onboardingAutoHandledRef.current = true;
  }, [
    enforceBackupGate,
    hasCompletedOnboardingCore,
    hasMeaningfulWriting,
    libraryIndex.books.length,
    libraryIndex.sagas.length,
    libraryLoaded,
    config.expertWriterMode,
    hasBackupConfigured,
    onboardingBackupGuardMode,
  ]);

  useEffect(() => {
    if (!hasMeaningfulWriting && !hasCompletedOnboardingCore && enforceBackupGate && !hasBackupConfigured) {
      return;
    }

    const persisted = loadPersistedOnboardingState();
    const nextState: PersistedOnboardingState = {
      ...persisted,
      backupGuardMode: onboardingBackupGuardMode,
      autoOpenedOnce: persisted.autoOpenedOnce || hasMeaningfulWriting || hasCompletedOnboardingCore,
      writingStarted: persisted.writingStarted || hasMeaningfulWriting,
      completed: persisted.completed || hasCompletedOnboardingCore,
      lastUpdated: getNowIso(),
    };

    savePersistedOnboardingState(nextState);
  }, [enforceBackupGate, hasBackupConfigured, hasCompletedOnboardingCore, hasMeaningfulWriting, onboardingBackupGuardMode]);

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
      useRegex: searchUseRegex,
    }),
    [searchCaseSensitive, searchWholeWord, searchUseRegex],
  );
  const searchPatternError = useMemo(
    () => getSearchPatternError(searchQuery, currentSearchOptions),
    [searchQuery, currentSearchOptions],
  );

  const activeLanguage = useMemo(() => normalizeLanguageCode(config.language), [config.language]);
  const resolvedTheme = useMemo<'light' | 'dark' | 'sepia'>(() => {
    if (config.theme === 'system') {
      return systemPrefersDark ? 'dark' : 'light';
    }
    return config.theme;
  }, [config.theme, systemPrefersDark]);
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
    if (!activeEditorChapter) {
      setStatus('No hay capitulo activo para leer.');
      return;
    }

    readTextAloud(buildChapterAudioText(activeEditorChapter));
  }, [activeEditorChapter, readTextAloud]);

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

  const checkStrictSagaValidationBlockForBook = useCallback(async () => {
    if (!book?.metadata.sagaPath) {
      return null;
    }

    let linkedSaga: SagaProject | null = null;
    if (activeSaga && activeSaga.path === book.metadata.sagaPath) {
      linkedSaga = activeSaga;
    } else {
      try {
        linkedSaga = await loadSagaProject(book.metadata.sagaPath);
      } catch {
        return null;
      }
    }

    if (!linkedSaga.metadata.strictValidationMode) {
      return null;
    }

    const report = buildSagaConsistencyReport(linkedSaga);
    if (report.errorCount <= 0) {
      return null;
    }

    return {
      sagaTitle: linkedSaga.metadata.title || 'Saga',
      errorCount: report.errorCount,
    };
  }, [activeSaga, book]);

  const handleExportActiveChapterAudio = useCallback(async () => {
    if (!book || !activeEditorChapter) {
      return;
    }

    const strictBlock = await checkStrictSagaValidationBlockForBook();
    if (strictBlock) {
      setStatus(
        `Exportacion bloqueada por modo estricto en saga "${strictBlock.sagaTitle}": ${strictBlock.errorCount} error(es) de coherencia.`,
      );
      return;
    }

    await exportAudioToWav(
      buildChapterAudioText(activeEditorChapter),
      buildChapterAudioExportPath(book.path, book.metadata, activeEditorChapter),
      'Audio de capitulo exportado',
    );
  }, [book, activeEditorChapter, checkStrictSagaValidationBlockForBook, exportAudioToWav]);

  const interiorFormat = useMemo(
    () => book?.metadata.interiorFormat ?? FALLBACK_INTERIOR_FORMAT,
    [book?.metadata.interiorFormat],
  );

  const chapterWordCount = useMemo(() => {
    if (!activeEditorChapter) {
      return 0;
    }

    return countWordsFromHtml(activeEditorChapter.content);
  }, [activeEditorChapter]);

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

  const scheduleEditorHistoryState = useCallback(() => {
    if (editorHistoryAnimationFrameRef.current !== null) {
      return;
    }

    editorHistoryAnimationFrameRef.current = window.requestAnimationFrame(() => {
      editorHistoryAnimationFrameRef.current = null;
      updateEditorHistoryState();
    });
  }, [updateEditorHistoryState]);

  const resetSnapshotNavigation = useCallback((chapterId: string | null) => {
    if (!chapterId) {
      return;
    }

    const hadUndoCursor = snapshotUndoCursorRef.current[chapterId] !== undefined;
    const hadRedoStack = (snapshotRedoStackRef.current[chapterId]?.length ?? 0) > 0;
    if (!hadUndoCursor && !hadRedoStack) {
      return;
    }

    snapshotUndoCursorRef.current[chapterId] = undefined;
    snapshotRedoStackRef.current[chapterId] = [];
    setSnapshotRedoNonce((value) => value + 1);
  }, []);

  const registerAiRollbackSession = useCallback(
    (input: {
      label: string;
      scope: ChatScope;
      bookPath: string;
      chapterOrder: string[];
      chaptersBefore: Record<string, ChapterDocument>;
    }) => {
      if (input.chapterOrder.length === 0) {
        return;
      }

      setLastAiRollbackSession({
        id: randomId('rollback'),
        label: input.label,
        scope: input.scope,
        bookPath: input.bookPath,
        createdAt: getNowIso(),
        chapterOrder: [...input.chapterOrder],
        chaptersBefore: { ...input.chaptersBefore },
      });
    },
    [],
  );

  const recordTrustIncident = useCallback(
    async (bookPath: string, incident: Parameters<typeof recordAiTrustIncident>[1]) => {
      try {
        await recordAiTrustIncident(bookPath, incident);
      } catch {
        // No bloquea flujo principal si falla metrica local.
      }
    },
    [],
  );

  const writeSessionAudit = useCallback(
    async (bookPath: string, input: Parameters<typeof writeAiSessionAudit>[1]) => {
      try {
        await writeAiSessionAudit(bookPath, input);
      } catch {
        // No bloquea flujo principal si falla auditoria local.
      }
    },
    [],
  );

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
          highRisk: false,
          riskReason: '',
        };
      }

      const minimumWords = resolveExpansionMinimumWords(input.instruction, input.originalText);
      if (minimumWords <= 0) {
        return {
          text: cleanedCandidate,
          summaryText: parsedCandidate.summaryText,
          corrected: false,
          highRisk: false,
          riskReason: '',
        };
      }

      const candidateWords = countWordsFromPlainText(cleanedCandidate);
      if (candidateWords >= minimumWords) {
        return {
          text: cleanedCandidate,
          summaryText: parsedCandidate.summaryText,
          corrected: false,
          highRisk: false,
          riskReason: '',
        };
      }

      const severeShortfallThreshold = Math.max(80, Math.round(minimumWords * 0.7));
      const severeShortfall = candidateWords < severeShortfallThreshold;
      const shortfallReason = `Expansion guard: salida corta (${candidateWords}/${minimumWords} palabras).`;

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
          highRisk: severeShortfall,
          riskReason: severeShortfall ? shortfallReason : '',
        };
      }

      if (countWordsFromPlainText(input.originalText) >= minimumWords) {
        return {
          text: input.originalText,
          summaryText: recoveredParsed.summaryText || parsedCandidate.summaryText,
          corrected: true,
          highRisk: true,
          riskReason: `${shortfallReason} Se restauro texto original por recuperacion incompleta.`,
        };
      }

      return {
        text: cleanedCandidate,
        summaryText: recoveredParsed.summaryText || parsedCandidate.summaryText,
        corrected: false,
        highRisk: true,
        riskReason: `${shortfallReason} Recuperacion no alcanzo el minimo requerido.`,
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
          highRisk: false,
          riskReason: '',
        };
      }

      const storyBibleForGuard = selectStoryBibleForPrompt(
        storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
        `${input.userInstruction}\n${input.chapterTitle}\n${input.originalText}\n${cleanedCandidate}`,
        {
          recentText: input.recentText ?? '',
          recencyWeight: 1.3,
        },
      );
      const sagaContext = buildSagaPromptContext(
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
        sagaTitle: sagaContext.sagaTitle,
        sagaWorld: sagaContext.sagaWorld,
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
      const highRisk = parsed.status === 'FAIL';
      const evidenceText = parsed.evidence?.trim();
      const riskReason = highRisk
        ? parsed.reason?.trim()
          ? `Continuity guard: ${parsed.reason.trim()}${evidenceText ? ` | Evidencia: ${evidenceText}` : ''}`
          : 'Continuity guard: se detectaron contradicciones relevantes.'
        : '';

      return {
        text: finalText,
        summaryText:
          parsed.status === 'FAIL'
            ? parsed.reason
              ? `Continuidad corregida: ${parsed.reason}${evidenceText ? ` | Evidencia: ${evidenceText}` : ''}`
              : 'Continuidad corregida automaticamente.'
            : '',
        corrected,
        highRisk,
        riskReason,
      };
    },
    [book, config, activeLanguage, buildSagaPromptContext, canonicalStoryBible, storyBibleChronicleIndex],
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
    try {
      const index = await loadLibraryIndex();
      setLibraryIndex(index);
    } finally {
      setLibraryLoaded(true);
    }
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

  const syncSagaToLibrary = useCallback(async (project: SagaProject, options?: { markOpened?: boolean }) => {
    const nextIndex = await upsertSagaInLibrary(project, options);
    setLibraryIndex(nextIndex);
  }, []);

  const syncMultipleBooksToLibrary = useCallback(async (projects: BookProject[]): Promise<LibraryIndex> => {
    let nextIndex = await loadLibraryIndex();
    for (const project of projects) {
      nextIndex = await upsertBookInLibrary(project);
    }
    setLibraryIndex(nextIndex);
    return nextIndex;
  }, []);

  const syncBookToLibrary = useCallback(
    async (project: BookProject, options?: { markOpened?: boolean }) => {
      let nextIndex = await upsertBookInLibrary(project, options);
      const syncedSaga = await syncBookReferenceInLinkedSaga(project);
      if (syncedSaga) {
        nextIndex = await upsertSagaInLibrary(syncedSaga);
        setActiveSaga((previous) => (previous && previous.path === syncedSaga.path ? syncedSaga : previous));
      }
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
        const backupResult = await syncBookToBackupDirectory(book.path, backupDirectory, {
          linkedSagaPath: book.metadata.sagaPath,
        });
        lastBackupAtRef.current = Date.now();
        if (mode === 'manual') {
          setStatus(
            backupResult.copiedSaga
              ? `Resguardo versionado creado en: ${backupResult.targetPath} (incluye saga vinculada).`
              : `Resguardo versionado creado en: ${backupResult.targetPath}.`,
          );
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
    const persisted = loadPersistedOnboardingState();
    savePersistedOnboardingState({
      ...persisted,
      backupGuardMode: onboardingBackupGuardMode,
      autoOpenedOnce: true,
      dismissedForever: true,
      lastUpdated: getNowIso(),
    });
    setOnboardingOpen(false);
    onboardingAutoHandledRef.current = true;
    setStatus('La guia inicial ya no se abrira automaticamente en este equipo.');
  }, [onboardingBackupGuardMode]);

  const handleOnboardingClose = useCallback(() => {
    if (enforceBackupGate && !hasBackupConfigured) {
      setMainView('settings');
      setStatus('Configura una carpeta de backup antes de continuar.');
      setOnboardingOpen(true);
      return;
    }
    setOnboardingOpen(false);
  }, [enforceBackupGate, hasBackupConfigured]);

  const handleOnboardingDismissForever = useCallback(() => {
    if (enforceBackupGate && !hasBackupConfigured) {
      setMainView('settings');
      setStatus('No puedes desactivar la guia hasta configurar backup.');
      setOnboardingOpen(true);
      return;
    }
    dismissOnboardingForever();
  }, [dismissOnboardingForever, enforceBackupGate, hasBackupConfigured]);

  const handleOnboardingBackupGuardModeChange = useCallback(
    (mode: 'strict' | 'explore') => {
      setOnboardingBackupGuardMode(mode);
      const persisted = loadPersistedOnboardingState();
      savePersistedOnboardingState({
        ...persisted,
        backupGuardMode: mode,
        lastUpdated: getNowIso(),
      });
      if (mode === 'strict' && !hasBackupConfigured) {
        setStatus('Modo seguro activo: configura backup para continuar.');
      } else if (mode === 'explore') {
        setStatus('Modo exploracion activo: puedes escribir sin backup (recomendado solo para pruebas).');
      }
    },
    [hasBackupConfigured],
  );

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

    savePersistedSessionState({
      bookPath: book.path,
      activeChapterId,
      mainView,
      savedAt: getNowIso(),
    });
  }, [book, activeChapterId, mainView]);

  useEffect(() => {
    setLastAiRollbackSession((previous) => {
      if (!previous) {
        return previous;
      }

      if (!book || previous.bookPath !== book.path) {
        return null;
      }

      return previous;
    });
  }, [book]);

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
  }, [searchQuery, replaceQuery, searchCaseSensitive, searchWholeWord, searchUseRegex]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (eventOrList: MediaQueryListEvent | MediaQueryList) => {
      setSystemPrefersDark(eventOrList.matches);
    };
    update(mediaQuery);
    const listener = (event: MediaQueryListEvent) => update(event);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    root.setAttribute('data-editor-tone', config.editorBackgroundTone);
    root.setAttribute('data-contrast', config.accessibilityHighContrast ? 'high' : 'normal');
    root.setAttribute('data-text-size', config.accessibilityLargeText ? 'large' : 'normal');
    root.lang = activeLanguage;
  }, [
    resolvedTheme,
    config.editorBackgroundTone,
    config.accessibilityHighContrast,
    config.accessibilityLargeText,
    activeLanguage,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateEditorHistoryState();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeChapterId, activeChapter?.updatedAt, updateEditorHistoryState]);

  const flushChapterSave = useCallback(async (): Promise<boolean> => {
    const currentBook = bookRef.current;
    if (!currentBook || !activeChapterId || !dirtyRef.current || saveInFlightRef.current) {
      return true;
    }

    clearEditorAutosaveTimer();
    const chapter = currentBook.chapters[activeChapterId];
    if (!chapter) {
      return true;
    }

    const draftAtStart = editorDraftRef.current?.chapterId === chapter.id ? editorDraftRef.current : null;
    const chapterToSave = buildChapterSavePayload(chapter, draftAtStart);
    saveInFlightRef.current = true;
    try {
      const saved = await withTimeout(
        saveChapter(currentBook.path, chapterToSave),
        AUTOSAVE_TIMEOUT_MS,
        'Auto-guardado de capitulo',
      );
      let savedProjectForLibrary: BookProject | null = null;
      setBook((previous) => {
        if (!previous || previous.path !== currentBook.path) {
          return previous;
        }

        const nextProject: BookProject = {
          ...previous,
          chapters: {
            ...previous.chapters,
            [saved.id]: saved,
          },
        };
        savedProjectForLibrary = nextProject;

        return nextProject;
      });
      const latestDraft = editorDraftRef.current;
      const hasNewerDraft =
        latestDraft?.chapterId === saved.id && latestDraft.html !== chapterToSave.content;
      dirtyRef.current = hasNewerDraft;

      if (!hasNewerDraft) {
        const syncedDraft: ChapterEditorDraft = {
          chapterId: saved.id,
          html: saved.content,
          json: draftAtStart?.json ?? latestDraft?.json ?? null,
        };
        editorDraftRef.current = syncedDraft;
        flushEditorDraftState(syncedDraft);
      }

      if (savedProjectForLibrary) {
        try {
          await withTimeout(
            syncBookToLibrary(savedProjectForLibrary),
            AUTOSAVE_TIMEOUT_MS,
            'Actualizacion de biblioteca',
          );
          setStatus(`Guardado automatico ${new Date().toLocaleTimeString()} (capitulo + biblioteca)`);
        } catch (error) {
          setStatus(`Capitulo guardado, pero fallo sync de biblioteca: ${formatUnknownError(error)}`);
        }
      }
      return true;
    } catch (error) {
      setStatus(`Error al guardar: ${formatUnknownError(error)}`);
      return false;
    } finally {
      saveInFlightRef.current = false;
    }
  }, [activeChapterId, clearEditorAutosaveTimer, flushEditorDraftState, syncBookToLibrary]);

  const persistBookBeforeClose = useCallback(async (): Promise<boolean> => {
    const currentBook = bookRef.current;
    if (!currentBook) {
      return true;
    }

    const chapterSaved = await flushChapterSave();
    if (!chapterSaved) {
      return false;
    }

    try {
      const latestBook = bookRef.current;
      if (!latestBook || latestBook.path !== currentBook.path) {
        return true;
      }
      await saveBookMetadata(latestBook.path, latestBook.metadata);
      const syncedProject = await loadBookProject(latestBook.path);
      await syncBookToLibrary(syncedProject);
      return true;
    } catch (error) {
      setStatus(`No se pudo guardar metadatos al cerrar: ${formatUnknownError(error)}`);
      return false;
    }
  }, [flushChapterSave, syncBookToLibrary]);

  useEffect(() => {
    persistBookBeforeCloseRef.current = persistBookBeforeClose;
  }, [persistBookBeforeClose]);

  const requestAppQuit = useCallback(async (): Promise<boolean> => {
    if (closeInterceptBusyRef.current) {
      return false;
    }

    try {
      getCurrentWindow();
    } catch {
      setStatus('No se puede cerrar desde el navegador.');
      return false;
    }

    try {
      closeInterceptBusyRef.current = true;
      const persisted = await persistBookBeforeCloseRef.current();
      if (!persisted) {
        const accepted = await confirm(
          'No se pudo guardar todo antes de salir. Cerrar de todas formas?',
          {
            title: 'Salir de WriteWMe',
            kind: 'warning',
            okLabel: 'Cerrar igual',
            cancelLabel: 'Cancelar',
          },
        );
        if (!accepted) {
          return false;
        }
      }

      closeInterceptApprovedRef.current = true;
      await invoke('quit_app');
      return true;
    } catch (error) {
      closeInterceptApprovedRef.current = false;
      setStatus(`Salir de la app: ${formatUnknownError(error)}`);
      return false;
    } finally {
      closeInterceptBusyRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!bookRef.current || !dirtyRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    let unlistenCloseRequested: (() => void) | null = null;
    void (async () => {
      try {
        const appWindow = getCurrentWindow();
        unlistenCloseRequested = await appWindow.onCloseRequested((event) => {
          if (closeInterceptApprovedRef.current) {
            closeInterceptApprovedRef.current = false;
            return;
          }

          event.preventDefault();
          if (closeInterceptBusyRef.current) {
            return;
          }
          void requestAppQuit();
        });
      } catch {
        // En navegador puro no existe ventana Tauri.
      }
    })();

    return () => {
      if (unlistenCloseRequested) {
        unlistenCloseRequested();
      }
    };
  }, [requestAppQuit]);

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
      const persistedSession = loadPersistedSessionState();
      const shouldRestoreSession = persistedSession?.bookPath === project.path;
      const restoredChapterId =
        shouldRestoreSession &&
        persistedSession?.activeChapterId &&
        project.chapters[persistedSession.activeChapterId]
          ? persistedSession.activeChapterId
          : project.metadata.chapterOrder[0] ?? null;
      const restoredMainView = shouldRestoreSession ? persistedSession?.mainView ?? 'outline' : 'outline';

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
      setActiveChapterId(restoredChapterId);
      setMainView(restoredMainView);
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
      const resolvedProjectPath = await resolveBookDirectory(projectPath);
      const recovery = await recoverPendingAiTransactions(resolvedProjectPath);
      const loaded = await loadBookProject(resolvedProjectPath);
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
      if (loaded.metadata.sagaPath) {
        try {
          const linkedSaga = await loadSagaProject(loaded.metadata.sagaPath);
          setActiveSaga(linkedSaga);
          await syncSagaToLibrary(linkedSaga, { markOpened: true });
        } catch (error) {
          setStatus(
            `Libro abierto: no se pudo cargar la saga vinculada (${formatUnknownError(error)}).`,
          );
        }
      }

      try {
        await syncBookToLibrary(loaded, { markOpened: true });
      } catch (error) {
        setStatus(
          `Abrir libro: ${loaded.metadata.title} (no se pudo actualizar biblioteca: ${formatUnknownError(error)})`,
        );
        return;
      }

      if (recovery.recoveredTransactions > 0) {
        setStatus(
          `Libro abierto: ${loaded.metadata.title} | Recuperacion automatica aplicada (${recovery.recoveredTransactions} transaccion/es, ${recovery.restoredChapters} capitulo/s restaurados).`,
        );
        return;
      }

      setStatus(`Libro abierto: ${loaded.metadata.title}`);
    },
    [applyOpenedProjectState, syncBookToLibrary, syncSagaToLibrary],
  );

  const handleCreateBook = useCallback(async (template: BookCreationTemplateId = 'blank') => {
    function openTitleStep(defaultValue = 'Mi libro'): void {
      setPromptModal({
        title: template === 'saga' ? 'Crear libro desde plantilla de saga' : 'Crear nuevo libro',
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
        title: template === 'saga' ? 'Crear libro desde plantilla de saga' : 'Crear nuevo libro',
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
            const templated = applyBookCreationTemplate(created, template);
            let initialized = created;
            if (template !== 'blank') {
              const savedMetadata = await saveBookMetadata(templated.path, templated.metadata);
              const primaryChapterId = savedMetadata.chapterOrder[0] ?? null;
              const chapters = { ...templated.chapters };
              if (primaryChapterId && chapters[primaryChapterId]) {
                chapters[primaryChapterId] = await saveChapter(templated.path, chapters[primaryChapterId]);
              }
              initialized = {
                ...templated,
                metadata: savedMetadata,
                chapters,
              };
            }

            let loadedConfig: AppConfig = DEFAULT_APP_CONFIG;
            try {
              loadedConfig = await loadAppConfig(initialized.path);
            } catch {
              try {
                await saveAppConfig(initialized.path, DEFAULT_APP_CONFIG);
              } catch {
                // Continua con defaults aunque falle la escritura.
              }
            }

            applyOpenedProjectState(initialized, loadedConfig);
            try {
              await syncBookToLibrary(initialized, { markOpened: true });
            } catch (error) {
              setStatus(
                `Crear libro: ${initialized.metadata.title} (sin actualizar biblioteca: ${formatUnknownError(error)})`,
              );
              return;
            }

            setStatus(
              template === 'saga'
                ? `Libro de saga creado y abierto: ${initialized.metadata.title}`
                : `Libro creado y abierto: ${initialized.metadata.title}`,
            );
          } catch (error) {
            setStatus(`Crear libro: ${formatUnknownError(error)}`);
          }
        },
      });
    }

    openTitleStep();
  }, [applyOpenedProjectState, syncBookToLibrary]);

  const handleCreateSaga = useCallback(() => {
    setPromptModal({
      title: 'Crear nueva saga',
      label: 'Titulo de la saga',
      defaultValue: 'Mi saga',
      confirmLabel: 'Crear saga',
      onConfirm: async (titleInput) => {
        setPromptModal(null);
        try {
          const selectedDirectoryResult = await open({
            directory: true,
            multiple: false,
            recursive: true,
            title: 'Selecciona carpeta padre de la saga',
          });
          const selectedDirectory = extractDialogPath(selectedDirectoryResult);

          if (!selectedDirectory) {
            setStatus('Crear saga: operacion cancelada.');
            return;
          }

          const created = await createSagaProject(selectedDirectory, titleInput.trim() || 'Mi saga');
          setActiveSaga(created);
          setMainView('saga');
          await syncSagaToLibrary(created, { markOpened: true });
          setStatus(`Saga creada: ${created.metadata.title}`);
        } catch (error) {
          setStatus(`Crear saga: ${formatUnknownError(error)}`);
        }
      },
    });
  }, [syncSagaToLibrary]);

  const handleSagaChange = useCallback((metadata: SagaProject['metadata']) => {
    setActiveSaga((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        metadata,
      };
    });
  }, []);

  const handleSaveActiveSaga = useCallback(async (metadataOverride?: SagaProject['metadata']) => {
    if (!activeSaga) {
      return;
    }

    const metadataToSave = metadataOverride ?? activeSaga.metadata;
    const sagaForValidation =
      metadataOverride
        ? {
            ...activeSaga,
            metadata: metadataOverride,
          }
        : activeSaga;
    const consistencyReport = metadataToSave.strictValidationMode ? buildSagaConsistencyReport(sagaForValidation) : null;

    try {
      const savedMetadata = await saveSagaMetadata(activeSaga.path, metadataToSave);
      const savedProject: SagaProject = {
        ...activeSaga,
        metadata: savedMetadata,
      };
      setActiveSaga(savedProject);
      await syncSagaToLibrary(savedProject, { markOpened: true });
      if (consistencyReport && (consistencyReport.errorCount > 0 || consistencyReport.warningCount > 0)) {
        setStatus(
          `Saga guardada con alertas: ${consistencyReport.errorCount} incoherencia/s grave/s y ${consistencyReport.warningCount} aviso/s. Revisa esto antes de exportar.`,
        );
        return;
      }
      setStatus(`Saga guardada: ${savedMetadata.title}`);
    } catch (error) {
      setStatus(`No se pudo guardar la saga: ${formatUnknownError(error)}`);
    }
  }, [activeSaga, syncSagaToLibrary]);

  const handleUpsertTimelineEvent = useCallback(
    async (event: import('./types/book').SagaTimelineEvent) => {
      if (!activeSaga) return;
      const existing = activeSaga.metadata.worldBible.timeline;
      const idx = existing.findIndex((e) => e.id === event.id);
      const nextTimeline = idx >= 0
        ? existing.map((e) => (e.id === event.id ? event : e))
        : [...existing, event];
      const nextSaga: SagaProject = {
        ...activeSaga,
        metadata: {
          ...activeSaga.metadata,
          worldBible: { ...activeSaga.metadata.worldBible, timeline: nextTimeline },
        },
      };
      setActiveSaga(nextSaga);
      try {
        const saved = await saveSagaMetadata(nextSaga.path, nextSaga.metadata);
        setActiveSaga({ ...nextSaga, metadata: saved });
        setStatus(`Evento guardado: ${event.title || 'sin titulo'}`);
      } catch (error) {
        setStatus(`No se pudo guardar evento de timeline: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga],
  );

  const handleDeleteTimelineEvent = useCallback(
    async (eventId: string) => {
      if (!activeSaga) return;
      const nextTimeline = activeSaga.metadata.worldBible.timeline.filter((e) => e.id !== eventId);
      const nextSaga: SagaProject = {
        ...activeSaga,
        metadata: {
          ...activeSaga.metadata,
          worldBible: { ...activeSaga.metadata.worldBible, timeline: nextTimeline },
        },
      };
      setActiveSaga(nextSaga);
      try {
        const saved = await saveSagaMetadata(nextSaga.path, nextSaga.metadata);
        setActiveSaga({ ...nextSaga, metadata: saved });
        setStatus('Evento eliminado.');
      } catch (error) {
        setStatus(`No se pudo eliminar evento: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga],
  );

  const handleReorderTimeline = useCallback(
    async (reorderedTimeline: import('./types/book').SagaTimelineEvent[]) => {
      if (!activeSaga) return;
      const nextSaga: SagaProject = {
        ...activeSaga,
        metadata: {
          ...activeSaga.metadata,
          worldBible: { ...activeSaga.metadata.worldBible, timeline: reorderedTimeline },
        },
      };
      setActiveSaga(nextSaga);
      try {
        const saved = await saveSagaMetadata(nextSaga.path, nextSaga.metadata);
        setActiveSaga({ ...nextSaga, metadata: saved });
        setStatus('Cronologia reordenada.');
      } catch (error) {
        setStatus(`No se pudo reordenar la cronologia: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga],
  );

  const handleUpsertRelationship = useCallback(
    async (relationship: import('./types/book').SagaWorldRelationship) => {
      if (!activeSaga) return;
      const existing = activeSaga.metadata.worldBible.relationships;
      const idx = existing.findIndex((r) => r.id === relationship.id);
      const nextRelationships = idx >= 0
        ? existing.map((r) => (r.id === relationship.id ? relationship : r))
        : [...existing, relationship];
      const nextSaga: SagaProject = {
        ...activeSaga,
        metadata: {
          ...activeSaga.metadata,
          worldBible: { ...activeSaga.metadata.worldBible, relationships: nextRelationships },
        },
      };
      setActiveSaga(nextSaga);
      try {
        const saved = await saveSagaMetadata(nextSaga.path, nextSaga.metadata);
        setActiveSaga({ ...nextSaga, metadata: saved });
        setStatus('Relacion guardada.');
      } catch (error) {
        setStatus(`No se pudo guardar relacion: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga],
  );

  const handleDeleteRelationship = useCallback(
    async (relationshipId: string) => {
      if (!activeSaga) return;
      const nextRelationships = activeSaga.metadata.worldBible.relationships.filter((r) => r.id !== relationshipId);
      const nextSaga: SagaProject = {
        ...activeSaga,
        metadata: {
          ...activeSaga.metadata,
          worldBible: { ...activeSaga.metadata.worldBible, relationships: nextRelationships },
        },
      };
      setActiveSaga(nextSaga);
      try {
        const saved = await saveSagaMetadata(nextSaga.path, nextSaga.metadata);
        setActiveSaga({ ...nextSaga, metadata: saved });
        setStatus('Relacion eliminada.');
      } catch (error) {
        setStatus(`No se pudo eliminar relacion: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga],
  );

  const handleOpenLibrarySaga = useCallback(
    async (sagaPath: string) => {
      const entry = libraryIndex.sagas.find((item) => item.path === sagaPath);
      setStatus(`Abriendo saga: ${entry?.title ?? sagaPath}`);
      try {
        const loaded = await loadSagaProject(sagaPath);
        setActiveSaga(loaded);
        setMainView('saga');
        await syncSagaToLibrary(loaded, { markOpened: true });
        setStatus(`Saga abierta: ${loaded.metadata.title}`);
      } catch (error) {
        setStatus(`Biblioteca saga: ${formatUnknownError(error)}`);
      }
    },
    [libraryIndex.sagas, syncSagaToLibrary],
  );

  const handleAttachActiveBookToSaga = useCallback(
    async (sagaPath: string) => {
      if (!book) {
        setStatus('No hay libro activo para vincular.');
        return;
      }

      try {
        const result = await attachBookToSaga(book, sagaPath);
        setBook(result.book);
        setActiveSaga(result.saga);
        let nextIndex = await upsertSagaInLibrary(result.saga, { markOpened: true });
        setLibraryIndex(nextIndex);
        if (result.updatedBooks.length > 0) {
          nextIndex = await syncMultipleBooksToLibrary(result.updatedBooks);
        } else {
          nextIndex = await upsertBookInLibrary(result.book, { markOpened: true });
        }
        setLibraryIndex(nextIndex);
        setMainView('saga');
        setStatus(`Libro vinculado a saga: ${result.saga.metadata.title}`);
      } catch (error) {
        setStatus(`No se pudo vincular el libro a la saga: ${formatUnknownError(error)}`);
      }
    },
    [book, syncMultipleBooksToLibrary],
  );

  const handleDetachActiveBookFromSaga = useCallback(async () => {
    if (!book || !book.metadata.sagaPath) {
      setStatus('El libro activo no pertenece a una saga.');
      return;
    }

    try {
      const result = await detachBookFromSaga(book);
      const detachedSaga = result.saga;
      setBook(result.book);
      let nextIndex = await upsertBookInLibrary(result.book, { markOpened: true });
      if (detachedSaga) {
        nextIndex = await upsertSagaInLibrary(detachedSaga);
        setActiveSaga((previous) => (previous && previous.path === detachedSaga.path ? detachedSaga : previous));
      } else {
        setActiveSaga((previous) => (previous && previous.path === book.metadata.sagaPath ? null : previous));
      }
      setLibraryIndex(nextIndex);
      setStatus('Libro desvinculado de la saga.');
    } catch (error) {
      setStatus(`No se pudo desvincular el libro de la saga: ${formatUnknownError(error)}`);
    }
  }, [book]);

  const handleUpdateActiveSagaBookVolume = useCallback(
    async (bookPath: string, volumeNumber: number) => {
      if (!activeSaga) {
        setStatus('No hay saga activa para reorganizar.');
        return;
      }

      try {
        const result = await updateSagaBookVolume(activeSaga.path, bookPath, volumeNumber);
        setActiveSaga(result.saga);
        let nextIndex = await upsertSagaInLibrary(result.saga, { markOpened: true });
        setLibraryIndex(nextIndex);
        if (result.updatedBooks.length > 0) {
          nextIndex = await syncMultipleBooksToLibrary(result.updatedBooks);
        }
        setLibraryIndex(nextIndex);
        const currentBook = result.updatedBooks.find((entry) => book && entry.path === book.path);
        if (currentBook) {
          setBook(currentBook);
        }
        setStatus('Volumen actualizado y saga reordenada.');
      } catch (error) {
        setStatus(`No se pudo actualizar el volumen del libro: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga, book, syncMultipleBooksToLibrary],
  );

  const handleMoveActiveSagaBook = useCallback(
    async (bookPath: string, direction: 'up' | 'down') => {
      if (!activeSaga) {
        setStatus('No hay saga activa para reorganizar.');
        return;
      }

      try {
        const result = await moveSagaBook(activeSaga.path, bookPath, direction);
        setActiveSaga(result.saga);
        let nextIndex = await upsertSagaInLibrary(result.saga, { markOpened: true });
        setLibraryIndex(nextIndex);
        if (result.updatedBooks.length > 0) {
          nextIndex = await syncMultipleBooksToLibrary(result.updatedBooks);
        }
        setLibraryIndex(nextIndex);
        const currentBook = result.updatedBooks.find((entry) => book && entry.path === book.path);
        if (currentBook) {
          setBook(currentBook);
        }
        setStatus(direction === 'up' ? 'Libro movido hacia arriba en la saga.' : 'Libro movido hacia abajo en la saga.');
      } catch (error) {
        setStatus(`No se pudo reordenar el libro en la saga: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga, book, syncMultipleBooksToLibrary],
  );

  const handleDeleteLibrarySaga = useCallback(
    async (sagaPath: string) => {
      const libraryEntry = libraryIndex.sagas.find((entry) => entry.path === sagaPath);
      const title = libraryEntry?.title ?? 'esta saga';
      const accepted = await confirm(
        `Vas a eliminar "${title}" de la biblioteca y tambien su carpeta en disco.\nLos libros quedaran intactos, pero se desvincularan de la saga.`,
        {
          title: 'Eliminar saga',
          kind: 'warning',
          okLabel: 'Eliminar',
          cancelLabel: 'Cancelar',
        },
      );

      if (!accepted) {
        return;
      }

      try {
        const result = await removeSagaFromLibrary(sagaPath, { deleteFiles: true });
        let nextIndex = result.index;
        setLibraryIndex(nextIndex);
        if (result.detachedBooks.length > 0) {
          nextIndex = await syncMultipleBooksToLibrary(result.detachedBooks);
        }

        setLibraryIndex(nextIndex);
        if (activeSaga && activeSaga.path === sagaPath) {
          setActiveSaga(null);
          setMainView((previous) =>
            previous === 'saga' || previous === 'timeline' || previous === 'plot' || previous === 'atlas'
              ? (book ? 'outline' : 'editor')
              : previous,
          );
        }
        const currentBook = result.detachedBooks.find((entry) => book && entry.path === book.path);
        if (currentBook) {
          setBook(currentBook);
        }
        setStatus(`Saga eliminada: ${title}`);
      } catch (error) {
        setStatus(`No se pudo eliminar la saga: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga, book, libraryIndex.sagas, syncMultipleBooksToLibrary],
  );

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
    const persisted = await persistBookBeforeClose();
    if (!persisted) {
      const accepted = await confirm(
        'No se pudo guardar todo antes de cerrar el libro. Cerrar de todas formas?',
        {
          title: 'Cerrar libro',
          kind: 'warning',
          okLabel: 'Cerrar igual',
          cancelLabel: 'Cancelar',
        },
      );
      if (!accepted) {
        return;
      }
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
    setMainView((previous) =>
      ((previous === 'saga' || previous === 'timeline' || previous === 'plot' || previous === 'atlas') && activeSaga
        ? previous
        : 'editor'),
    );
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
  }, [activeSaga, persistBookBeforeClose, refreshCovers, stopReadAloud]);

  const handleQuitApp = useCallback(async () => {
    await requestAppQuit();
  }, [requestAppQuit]);

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
      if (!bookRef.current || !activeChapterId) {
        return;
      }

      const previousDraft = editorDraftRef.current;
      if (previousDraft?.chapterId === activeChapterId && previousDraft.html === payload.html) {
        return;
      }

      dirtyRef.current = true;
      resetSnapshotNavigation(activeChapterId);
      const nextDraft: ChapterEditorDraft = {
        chapterId: activeChapterId,
        html: payload.html,
        json: payload.json,
      };
      editorDraftRef.current = nextDraft;
      scheduleEditorDraftState(nextDraft);
      clearEditorAutosaveTimer();
      editorAutosaveTimerRef.current = window.setTimeout(() => {
        editorAutosaveTimerRef.current = null;
        void flushChapterSave();
      }, Math.max(1200, config.autosaveIntervalMs));
      scheduleEditorHistoryState();
    },
    [
      activeChapterId,
      clearEditorAutosaveTimer,
      config.autosaveIntervalMs,
      flushChapterSave,
      resetSnapshotNavigation,
      scheduleEditorDraftState,
      scheduleEditorHistoryState,
    ],
  );

  const handleOpenSemanticReference = useCallback(
    (reference: { id: string; kind: 'character' | 'location'; label: string; targetView: 'bible' | 'saga' }) => {
      setMainView(reference.targetView);
      setStatus(`Referencia abierta: ${reference.label} (${reference.kind === 'character' ? 'personaje' : 'lugar'}).`);
    },
    [],
  );

  const handleEditorBlur = useCallback(() => {
    clearEditorAutosaveTimer();
    if (editorDraftRef.current?.chapterId === activeChapterId) {
      flushEditorDraftState(editorDraftRef.current);
    }
    void flushChapterSave();
  }, [activeChapterId, clearEditorAutosaveTimer, flushChapterSave, flushEditorDraftState]);

  const handleInsertSemanticReference = useCallback(
    (kind: SemanticReferenceKind) => {
      if (!book || !activeChapterId) {
        setStatus('Abre un libro y un capitulo antes de insertar referencias del canon.');
        return;
      }

      const candidates = semanticReferencesCatalog.filter((entry) => entry.kind === kind);
      if (candidates.length === 0) {
        setStatus(
          kind === 'character'
            ? 'No hay personajes canonicos disponibles para vincular.'
            : 'No hay lugares canonicos disponibles para vincular.',
        );
        return;
      }

      setPromptModal({
        title: kind === 'character' ? 'Insertar referencia a personaje' : 'Insertar referencia a lugar',
        label: kind === 'character' ? 'Personaje (nombre o alias)' : 'Lugar (nombre o alias)',
        placeholder: `Ej: ${candidates
          .slice(0, 6)
          .map((entry) => entry.label)
          .join(', ')}`,
        confirmLabel: 'Insertar referencia',
        onConfirm: (value) => {
          const match = findSemanticReferenceMatch(semanticReferencesCatalog, kind, value);
          if (!match) {
            setStatus(
              kind === 'character'
                ? `No se encontro personaje canonico para "${value}".`
                : `No se encontro lugar canonico para "${value}".`,
            );
            return;
          }

          if (!editorRef.current) {
            setStatus('Activa primero el editor para insertar referencias del canon.');
            return;
          }

          editorRef.current.insertSemanticReference({
            id: match.id,
            kind: match.kind,
            label: match.label,
            tooltip: match.tooltip,
            targetView: match.targetView,
            warning: match.warning,
          });
          setPromptModal(null);
          setStatus(`Referencia insertada: ${match.label}.`);
        },
      });
    },
    [activeChapterId, book, semanticReferencesCatalog],
  );

  const handleAddManuscriptNote = useCallback(() => {
    if (!book || !activeChapterId) {
      setStatus('Abre un capitulo antes de crear notas de manuscrito.');
      return;
    }

    const excerpt = editorRef.current?.getSelectionText().trim() ?? '';
    setPromptModal({
      title: 'Nueva nota al margen',
      label: excerpt ? `Nota privada sobre: "${excerpt.slice(0, 90)}"` : 'Nota privada',
      placeholder: 'Ej: reforzar presagio, revisar voz, mover esta revelacion, cortar repeticion...',
      multiline: true,
      confirmLabel: 'Guardar nota',
      onConfirm: async (value) => {
        const chapter = book.chapters[activeChapterId];
        if (!chapter) {
          return;
        }

        const nextNote: ChapterManuscriptNote = {
          id: randomId('note'),
          excerpt,
          note: value.trim(),
          status: 'open',
          createdAt: getNowIso(),
          updatedAt: getNowIso(),
        };
        const chapterDraft: ChapterDocument = {
          ...chapter,
          manuscriptNotes: [...(chapter.manuscriptNotes ?? []), nextNote],
          updatedAt: getNowIso(),
        };

        setPromptModal(null);
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
          const persisted = await saveChapter(book.path, chapterDraft);
          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }

            return {
              ...previous,
              chapters: {
                ...previous.chapters,
                [activeChapterId]: persisted,
              },
            };
          });
          setStatus('Nota privada guardada en el manuscrito.');
        } catch (error) {
          setStatus(`No se pudo guardar la nota de manuscrito: ${formatUnknownError(error)}`);
        }
      },
    });
  }, [activeChapterId, book]);

  const handlePatchActiveChapterManuscriptNote = useCallback(
    async (noteId: string, mode: 'toggle' | 'delete') => {
      if (!book || !activeChapterId) {
        return;
      }

      const chapter = book.chapters[activeChapterId];
      if (!chapter) {
        return;
      }

      const currentNotes = chapter.manuscriptNotes ?? [];
      const nextNotes: ChapterManuscriptNote[] =
        mode === 'delete'
          ? currentNotes.filter((entry) => entry.id !== noteId)
          : currentNotes.map((entry) =>
              entry.id === noteId
                ? {
                    ...entry,
                    status: entry.status === 'resolved' ? 'open' : 'resolved',
                    updatedAt: getNowIso(),
                  }
                : entry,
            );
      const chapterDraft: ChapterDocument = {
        ...chapter,
        manuscriptNotes: nextNotes,
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
        const persisted = await saveChapter(book.path, chapterDraft);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            chapters: {
              ...previous.chapters,
              [activeChapterId]: persisted,
            },
          };
        });
        setStatus(mode === 'delete' ? 'Nota privada eliminada.' : 'Estado de nota privada actualizado.');
      } catch (error) {
        setStatus(`No se pudo actualizar la nota de manuscrito: ${formatUnknownError(error)}`);
      }
    },
    [activeChapterId, book],
  );

  const handleRefreshContinuityBriefing = useCallback(() => {
    setContinuityBriefingRefreshNonce((previous) => previous + 1);
    setStatus('Briefing de continuidad actualizado.');
  }, []);

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
        setStatus('Preferencias guardadas y idioma Amazon sincronizado en book.json.');
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
      setStatus('Preferencias guardadas en config.json del libro.');
    } catch (error) {
      setLanguageSaveState('idle');
      setStatus(`Error guardando settings: ${formatUnknownError(error)}`);
    }
  }, [book, config, activeLanguage, syncBookToLibrary]);

  const handleEditorBackgroundToneChange = useCallback(
    (tone: AppConfig['editorBackgroundTone']) => {
      setConfig((previous) => {
        if (previous.editorBackgroundTone === tone) {
          return previous;
        }

        const nextConfig: AppConfig = {
          ...previous,
          editorBackgroundTone: tone,
        };

        if (book?.path) {
          void saveAppConfig(book.path, nextConfig).catch((error) => {
            setStatus(`No se pudo guardar el fondo del editor: ${formatUnknownError(error)}`);
          });
        }

        return nextConfig;
      });
    },
    [book?.path],
  );

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

  const handleSaveStoryBible = useCallback(async (storyBibleOverride?: BookProject['metadata']['storyBible']) => {
    if (!book) {
      return;
    }

    try {
      const metadataToSave = storyBibleOverride
        ? {
            ...book.metadata,
            storyBible: storyBibleOverride,
          }
        : book.metadata;
      const savedMetadata = await saveBookMetadata(book.path, metadataToSave);
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
    async (
      chapter: { id: string; title: string; content: string },
      baseStoryBibleOverride?: BookProject['metadata']['storyBible'],
    ) => {
      if (!book) {
        return { addedCharacters: 0, addedLocations: 0 };
      }

      const baseStoryBible = baseStoryBibleOverride ?? book.metadata.storyBible;
      const syncResult = buildStoryBibleAutoSyncFromChapter(baseStoryBible, chapter);
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

  const handleSyncStoryBibleFromActiveChapter = useCallback(
    async (baseStoryBibleOverride?: BookProject['metadata']['storyBible']) => {
      if (!book || !activeEditorChapter) {
        setStatus('Abre un capitulo para sincronizar la biblia.');
        return;
      }

      try {
        const sync = await syncStoryBibleFromChapter(activeEditorChapter, baseStoryBibleOverride);
        if (sync.addedCharacters === 0 && sync.addedLocations === 0) {
          setStatus('Sincronizacion completada: no se detectaron personajes o lugares nuevos.');
          return;
        }

        setStatus(
          `Biblia actualizada desde ${activeEditorChapter.title}: +${sync.addedCharacters} personaje/s, +${sync.addedLocations} lugar/es.`,
        );
      } catch (error) {
        setStatus(`No se pudo sincronizar la biblia: ${formatUnknownError(error)}`);
      }
    },
    [book, activeEditorChapter, syncStoryBibleFromChapter],
  );

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

  const handlePromotePlotEventToChapter = useCallback(
    async (eventId: string) => {
      if (!book) {
        setStatus('Abre un libro para promover pasos del plot a capitulos.');
        return;
      }

      const timelineSource = activeSagaChronicleView?.metadata.worldBible.timeline ?? activeSaga?.metadata.worldBible.timeline ?? [];
      const plotEvent = timelineSource.find((entry) => entry.id === eventId);
      if (!plotEvent) {
        setStatus('No se encontro el paso seleccionado en la timeline activa.');
        return;
      }

      const chapterTitle = plotEvent.title.trim() || plotEvent.displayLabel.trim() || `Escena ${plotEvent.startOrder}`;
      const seedTextParts = [
        'Escena creada desde PlotBoard.',
        plotEvent.summary.trim() ? `Resumen del paso:\n${plotEvent.summary.trim()}` : '',
        plotEvent.notes.trim() ? `Notas de continuidad:\n${plotEvent.notes.trim()}` : '',
      ].filter(Boolean);

      try {
        const result = await createChapter(book.path, book.metadata, chapterTitle);
        const chapterDraft: ChapterDocument = {
          ...result.chapter,
          synopsis: plotEvent.summary.trim() || result.chapter.synopsis || '',
          content: plainTextToHtml(seedTextParts.join('\n\n')),
          contentJson: null,
          updatedAt: getNowIso(),
        };
        const persistedChapter = await saveChapter(book.path, chapterDraft);

        const nextProject: BookProject = {
          ...book,
          metadata: result.metadata,
          chapters: {
            ...book.chapters,
            [persistedChapter.id]: persistedChapter,
          },
        };
        setBook(nextProject);
        await syncBookToLibrary(nextProject);
        setActiveChapterId(persistedChapter.id);
        setMainView('editor');
        setStatus(`Paso promovido a capitulo: ${persistedChapter.title}.`);
      } catch (error) {
        setStatus(`No se pudo promover el paso a capitulo: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga, activeSagaChronicleView, book, syncBookToLibrary],
  );

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

  const handleUpdateChapterPov = useCallback(
    async (chapterId: string, pointOfView: string) => {
      if (!book) {
        return;
      }

      const chapter = book.chapters[chapterId];
      if (!chapter) {
        return;
      }

      const nextPointOfView = pointOfView.trim();
      if ((chapter.pointOfView ?? '').trim() === nextPointOfView) {
        return;
      }

      const chapterDraft = {
        ...chapter,
        pointOfView: nextPointOfView,
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
            [chapterId]: chapterDraft,
          },
        };
      });

      try {
        const persisted = await saveChapter(book.path, chapterDraft);
        const nextProject: BookProject = {
          ...book,
          chapters: {
            ...book.chapters,
            [chapterId]: persisted,
          },
        };
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return nextProject;
        });
        await syncBookToLibrary(nextProject, { markOpened: true });
        setStatus(`POV actualizado en ${persisted.title}.`);
      } catch (error) {
        setStatus(`No se pudo actualizar POV: ${formatUnknownError(error)}`);
      }
    },
    [book, syncBookToLibrary],
  );

  const handleUpdateChapterMeta = useCallback(
    async (chapterId: string, patch: { synopsis?: string; status?: import('./types/book').ChapterStatus; wordTarget?: number | null }) => {
      if (!book) return;
      const chapter = book.chapters[chapterId];
      if (!chapter) return;

      const chapterDraft = { ...chapter, ...patch, updatedAt: getNowIso() };
      setBook((previous) => {
        if (!previous || previous.path !== book.path) return previous;
        return { ...previous, chapters: { ...previous.chapters, [chapterId]: chapterDraft } };
      });

      try {
        const persisted = await saveChapter(book.path, chapterDraft);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) return previous;
          return { ...previous, chapters: { ...previous.chapters, [chapterId]: persisted } };
        });
      } catch (error) {
        setStatus(`No se pudo guardar metadatos del capitulo: ${formatUnknownError(error)}`);
      }
    },
    [book],
  );

  const handleSaveScratchpad = useCallback(
    async (text: string) => {
      if (!book) return;
      const nextMetadata = { ...book.metadata, scratchpad: text, updatedAt: getNowIso() };
      setBook((previous) => (previous && previous.path === book.path ? { ...previous, metadata: nextMetadata } : previous));
      try {
        await saveBookMetadata(book.path, nextMetadata);
      } catch (error) {
        setStatus(`No se pudo guardar el borrador libre: ${formatUnknownError(error)}`);
      }
    },
    [book],
  );

  const handleAddLooseThread = useCallback(
    async (thread: Omit<import('./types/book').LooseThread, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!book) return;
      const now = getNowIso();
      const newThread: import('./types/book').LooseThread = { ...thread, id: randomId(), createdAt: now, updatedAt: now };
      const nextThreads = [...(book.metadata.looseThreads ?? []), newThread];
      const nextMetadata = { ...book.metadata, looseThreads: nextThreads, updatedAt: now };
      setBook((previous) => (previous && previous.path === book.path ? { ...previous, metadata: nextMetadata } : previous));
      try {
        await saveBookMetadata(book.path, nextMetadata);
      } catch (error) {
        setStatus(`No se pudo guardar el hilo: ${formatUnknownError(error)}`);
      }
    },
    [book],
  );

  const handleUpdateLooseThread = useCallback(
    async (id: string, patch: Partial<Pick<import('./types/book').LooseThread, 'title' | 'description' | 'status' | 'chapterRef'>>) => {
      if (!book) return;
      const now = getNowIso();
      const nextThreads = (book.metadata.looseThreads ?? []).map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t));
      const nextMetadata = { ...book.metadata, looseThreads: nextThreads, updatedAt: now };
      setBook((previous) => (previous && previous.path === book.path ? { ...previous, metadata: nextMetadata } : previous));
      try {
        await saveBookMetadata(book.path, nextMetadata);
      } catch (error) {
        setStatus(`No se pudo actualizar el hilo: ${formatUnknownError(error)}`);
      }
    },
    [book],
  );

  const handleDeleteLooseThread = useCallback(
    async (id: string) => {
      if (!book) return;
      const now = getNowIso();
      const nextThreads = (book.metadata.looseThreads ?? []).filter((t) => t.id !== id);
      const nextMetadata = { ...book.metadata, looseThreads: nextThreads, updatedAt: now };
      setBook((previous) => (previous && previous.path === book.path ? { ...previous, metadata: nextMetadata } : previous));
      try {
        await saveBookMetadata(book.path, nextMetadata);
      } catch (error) {
        setStatus(`No se pudo eliminar el hilo: ${formatUnknownError(error)}`);
      }
    },
    [book],
  );

  const handleAddSelectionToLooseThreads = useCallback(() => {
    if (!book || !activeChapter) {
      setStatus('Abre un capitulo para convertir una seleccion en hilo suelto.');
      return;
    }

    const selectedText = editorRef.current?.getSelectionText().trim() ?? '';
    if (!selectedText) {
      setStatus('Selecciona un texto del manuscrito antes de agregarlo como hilo suelto.');
      return;
    }

    const title = selectedText.length > 78 ? `${selectedText.slice(0, 75)}...` : selectedText;
    void handleAddLooseThread({
      title,
      description: selectedText,
      status: 'open',
      chapterRef: activeChapter.id,
    });
    setStatus('Hilo suelto creado desde la seleccion activa.');
  }, [activeChapter, book, handleAddLooseThread]);

  const handleLookupLoreFromSelection = useCallback(() => {
    if (!book) {
      setStatus('Abre un libro para consultar lore contextual.');
      return;
    }

    const selectedText = editorRef.current?.getSelectionText().trim() ?? '';
    if (!selectedText) {
      setStatus('Selecciona texto en el editor para buscar contexto de lore.');
      return;
    }

    const query = selectedText.slice(0, 120);
    const normalizedQuery = normalizeLoreLookupValue(query);
    const matches: EditorLorePeekMatch[] = [];

    for (const character of book.metadata.storyBible.characters) {
      const characterName = character.name.trim();
      if (!characterName) {
        continue;
      }
      const normalizedName = normalizeLoreLookupValue(characterName);
      const aliases = character.aliases
        .split(/[;,]/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const aliasHit = aliases.some((alias) => normalizeLoreLookupValue(alias).includes(normalizedQuery));
      if (normalizedName.includes(normalizedQuery) || aliasHit) {
        matches.push({
          id: character.id,
          kind: 'character',
          label: characterName,
          detail: character.role || character.goal || 'Personaje registrado en biblia.',
          targetView: 'bible',
        });
      }
    }

    for (const location of book.metadata.storyBible.locations) {
      const locationName = location.name.trim();
      if (!locationName) {
        continue;
      }
      const normalizedName = normalizeLoreLookupValue(locationName);
      const aliases = location.aliases
        .split(/[;,]/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const aliasHit = aliases.some((alias) => normalizeLoreLookupValue(alias).includes(normalizedQuery));
      if (normalizedName.includes(normalizedQuery) || aliasHit) {
        matches.push({
          id: location.id,
          kind: 'location',
          label: locationName,
          detail: location.description || location.atmosphere || 'Lugar registrado en biblia.',
          targetView: 'bible',
        });
      }
    }

    const sagaTimeline = activeSagaChronicleView?.metadata.worldBible.timeline ?? activeSaga?.metadata.worldBible.timeline ?? [];
    for (const event of sagaTimeline) {
      const eventTitle = event.title.trim();
      const eventLabel = event.displayLabel.trim();
      const combined = `${eventTitle} ${eventLabel}`.trim();
      if (!combined) {
        continue;
      }
      if (!normalizeLoreLookupValue(combined).includes(normalizedQuery)) {
        continue;
      }
      matches.push({
        id: event.id,
        kind: 'timeline',
        label: eventTitle || eventLabel,
        detail: event.summary || `Evento ${event.category} en orden ${event.startOrder}.`,
        targetView: 'timeline',
      });
    }

    const topMatches = matches.slice(0, 6);
    setEditorLorePeek({
      query,
      matches: topMatches,
    });
    if (topMatches.length === 0) {
      setStatus(`Sin coincidencias de lore para "${query}".`);
      return;
    }
    setStatus(`Contexto encontrado para "${query}": ${topMatches.length} coincidencia/s.`);
  }, [activeSaga, activeSagaChronicleView, book]);

  const handleOpenLorePeek = useCallback((input: { targetView: 'bible' | 'timeline'; id: string; label: string }) => {
    setMainView(input.targetView);
    setStatus(`Contexto abierto: ${input.label}.`);
  }, []);

  const handleAddEditorialChecklistItem = useCallback(
    async (input: { title: string; description: string; level: 'error' | 'warning' }) => {
      if (!book) {
        return;
      }

      const title = input.title.trim();
      if (!title) {
        setStatus('La checklist editorial necesita un titulo antes de guardar el item.');
        return;
      }

      const now = getNowIso();
      const nextItem: EditorialChecklistCustomItem = {
        id: randomId('editorial'),
        title,
        description: input.description.trim(),
        level: input.level,
        checked: false,
        createdAt: now,
        updatedAt: now,
      };
      const nextMetadata = {
        ...book.metadata,
        editorialChecklistCustom: [...(book.metadata.editorialChecklistCustom ?? []), nextItem],
        updatedAt: now,
      };

      setBook((previous) => (previous && previous.path === book.path ? { ...previous, metadata: nextMetadata } : previous));
      try {
        await saveBookMetadata(book.path, nextMetadata);
        setStatus('Item personalizado agregado a la checklist editorial.');
      } catch (error) {
        setStatus(`No se pudo guardar el item editorial: ${formatUnknownError(error)}`);
      }
    },
    [book],
  );

  const handleToggleEditorialChecklistItem = useCallback(
    async (id: string) => {
      if (!book) {
        return;
      }

      const now = getNowIso();
      const nextMetadata = {
        ...book.metadata,
        editorialChecklistCustom: (book.metadata.editorialChecklistCustom ?? []).map((item) =>
          item.id === id
            ? {
                ...item,
                checked: !item.checked,
                updatedAt: now,
              }
            : item,
        ),
        updatedAt: now,
      };

      setBook((previous) => (previous && previous.path === book.path ? { ...previous, metadata: nextMetadata } : previous));
      try {
        await saveBookMetadata(book.path, nextMetadata);
      } catch (error) {
        setStatus(`No se pudo actualizar el item editorial: ${formatUnknownError(error)}`);
      }
    },
    [book],
  );

  const handleDeleteEditorialChecklistItem = useCallback(
    async (id: string) => {
      if (!book) {
        return;
      }

      const now = getNowIso();
      const nextMetadata = {
        ...book.metadata,
        editorialChecklistCustom: (book.metadata.editorialChecklistCustom ?? []).filter((item) => item.id !== id),
        updatedAt: now,
      };

      setBook((previous) => (previous && previous.path === book.path ? { ...previous, metadata: nextMetadata } : previous));
      try {
        await saveBookMetadata(book.path, nextMetadata);
      } catch (error) {
        setStatus(`No se pudo eliminar el item editorial: ${formatUnknownError(error)}`);
      }
    },
    [book],
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
    if (searchPatternError) {
      setSearchMatches([]);
      setSearchTotalMatches(0);
      setSearchPreviewReport(null);
      setStatus(`Regex invalido: ${searchPatternError}`);
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
  }, [book, searchQuery, orderedChapters, currentSearchOptions, searchPatternError]);

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
    if (searchPatternError) {
      setSearchPreviewReport(null);
      setStatus(`Regex invalido: ${searchPatternError}`);
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
  }, [book, searchQuery, replaceQuery, orderedChapters, currentSearchOptions, searchPatternError]);

  const handleRunSagaSearch = useCallback(async () => {
    if (!activeSaga) return;
    const query = searchQuery.trim();
    if (!query) {
      setSagaSearchResults([]);
      setSagaSearchTotalMatches(0);
      setStatus('Busqueda en saga: escribe texto primero.');
      return;
    }
    if (searchPatternError) {
      setSagaSearchResults([]);
      setSagaSearchTotalMatches(0);
      setStatus(`Regex invalido: ${searchPatternError}`);
      return;
    }

    setSearchBusy(true);
    try {
      const linkedBooks: import('./types/book').BookProject[] = [];
      for (const link of activeSaga.metadata.books) {
        try {
          const loaded = await loadBookProject(link.bookPath);
          linkedBooks.push(loaded);
        } catch {
          // Book may not be accessible — skip
        }
      }

      const report = await buildSagaSearchMatchesAsync(linkedBooks, query, currentSearchOptions);
      setSagaSearchResults(report.books);
      setSagaSearchTotalMatches(report.totalMatches);
      setStatus(`Busqueda en saga completada: ${report.totalMatches} coincidencia/s en ${report.books.length} libro/s.`);
    } finally {
      setSearchBusy(false);
    }
  }, [activeSaga, searchQuery, currentSearchOptions, searchPatternError]);

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
    if (searchPatternError) {
      setStatus(`Regex invalido: ${searchPatternError}`);
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
    searchPatternError,
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
    if (searchPatternError) {
      setStatus(`Regex invalido: ${searchPatternError}`);
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
    let appliedChapterIds: string[] = [];
    const chapterBeforeReplace: Record<string, ChapterDocument> = {};
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

        chapterBeforeReplace[chapterId] = chapter;
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
        appliedChapterIds = [...appliedChapterIds, chapterId];

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
      const chapterTitleById = new Map(
        book.metadata.chapterOrder.map((id) => [id, book.chapters[id]?.title ?? id]),
      );
      if (appliedChapterIds.length === 0) {
        setStatus(`Reemplazar libro: ${formatUnknownError(error)}`);
        return;
      }

      let restoredChapterIds: string[] = [];
      const rollbackFailedIds: string[] = [];
      let restoredChapters: BookProject['chapters'] = { ...book.chapters };
      for (const chapterId of appliedChapterIds) {
        const previousChapter = chapterBeforeReplace[chapterId];
        if (!previousChapter) {
          continue;
        }
        try {
          const restored = await saveChapter(book.path, {
            ...previousChapter,
            updatedAt: getNowIso(),
          });
          restoredChapters = {
            ...restoredChapters,
            [chapterId]: restored,
          };
          restoredChapterIds = [...restoredChapterIds, chapterId];
        } catch {
          rollbackFailedIds.push(chapterId);
        }
      }

      const restoredProject: BookProject = {
        ...book,
        chapters: restoredChapters,
      };
      setBook(restoredProject);
      try {
        await syncBookToLibrary(restoredProject);
      } catch {
        // El mensaje principal ya informa estado de recuperacion.
      }

      const changedLabels = appliedChapterIds
        .map((chapterId) => chapterTitleById.get(chapterId) ?? chapterId)
        .slice(0, 6)
        .join(', ');
      const rollbackFailedLabels = rollbackFailedIds
        .map((chapterId) => chapterTitleById.get(chapterId) ?? chapterId)
        .slice(0, 6)
        .join(', ');

      if (rollbackFailedIds.length === 0) {
        setStatus(
          `Reemplazo cancelado por error y rollback completo aplicado (${restoredChapterIds.length} capitulo/s): ${changedLabels}.`,
        );
        return;
      }

      setStatus(
        `Reemplazo parcial por error (${formatUnknownError(error)}). Se tocaron ${appliedChapterIds.length} capitulo/s. Rollback fallido en ${rollbackFailedIds.length}: ${rollbackFailedLabels}.`,
      );
    } finally {
      setSearchBusy(false);
    }
  }, [
    book,
    searchQuery,
    replaceQuery,
    searchPatternError,
    searchPreviewReport,
    currentSearchOptions,
    config.autoVersioning,
    refreshSearchResults,
    resetSnapshotNavigation,
    syncBookToLibrary,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      const key = event.key.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const shift = event.shiftKey;
      const editableTarget = isEditableTarget(event.target);
      const isPrintableKey = key.length === 1;

      if (editableTarget && !(ctrlOrMeta && key === 's')) {
        return;
      }

      if (isPrintableKey && !ctrlOrMeta && !event.altKey) {
        return;
      }

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

      if (!activeChapterId || editableTarget) {
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
        storyBible: canonicalStoryBible ?? book.metadata.storyBible,
        sagaWorld: linkedSagaForBook?.metadata.worldBible ?? null,
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
    [book, activeChapterId, ensureScopeMessagesLoaded, orderedChapters, persistScopeMessages, linkedSagaForBook, canonicalStoryBible],
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
        storyBible: storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
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
        const sagaContext = buildSagaPromptContext(
          `${book.metadata.title}\n${normalizedRange.label}\n${digest.chapters.map((chapter) => chapter.highlights.join('\n')).join('\n')}`,
          {
            recencyWeight: 1.1,
            maxEntitiesPerSection: 3,
            maxTimelineEvents: 4,
          },
        );
        const prompt = buildStoryProgressPrompt({
          bookTitle: book.metadata.title,
          language: activeLanguage,
          storyBible: storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
          sagaTitle: sagaContext.sagaTitle,
          sagaWorld: sagaContext.sagaWorld,
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
    [
      book,
      activeChapterId,
      ensureScopeMessagesLoaded,
      orderedChapters,
      activeLanguage,
      config,
      persistScopeMessages,
      buildSagaPromptContext,
      canonicalStoryBible,
      storyBibleChronicleIndex,
    ],
  );

  const buildConsultorJumpMarkers = useCallback(
    (answer: string, scopedStoryBibleRules: string): ContextJumpMarker[] => {
      const markers: ContextJumpMarker[] = [];
      const answerTokens = extractContextTokens(answer, 220);
      if (answerTokens.size === 0) {
        return markers;
      }

      const chapterScores = orderedChapters
        .map((chapter) => {
          const chapterTokens = extractContextTokens(
            `${chapter.title}\n${stripHtml(chapter.content).slice(0, 2600)}`,
          );
          return {
            chapter,
            score: scoreContextOverlap(answerTokens, chapterTokens),
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 2);

      if (chapterScores.length > 0) {
        for (const entry of chapterScores) {
          markers.push({
            kind: 'chapter',
            id: entry.chapter.id,
            label: `Abrir capitulo ${entry.chapter.id} - ${entry.chapter.title}`,
          });
        }
      } else if (activeChapter) {
        markers.push({
          kind: 'chapter',
          id: activeChapter.id,
          label: `Abrir capitulo activo - ${activeChapter.title}`,
        });
      }

      if (activeSaga) {
        const timelineScore = activeSaga.metadata.worldBible.timeline
          .map((event) => {
            const eventTokens = extractContextTokens(
              `${event.displayLabel} ${event.title} ${event.summary} ${event.notes}`,
              90,
            );
            return {
              event,
              score: scoreContextOverlap(answerTokens, eventTokens),
            };
          })
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)[0];

        if (timelineScore) {
          markers.push({
            kind: 'timeline',
            id: timelineScore.event.id,
            label: `Abrir timeline ${timelineScore.event.displayLabel || `T${timelineScore.event.startOrder}`} - ${timelineScore.event.title || 'evento'}`,
          });
        }
      }

      const ruleLines = scopedStoryBibleRules
        .split(/\n+/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 80);
      const bestRuleMatch = ruleLines
        .map((line, index) => ({
          line,
          index,
          score: scoreContextOverlap(answerTokens, extractContextTokens(line, 40)),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)[0];

      if (bestRuleMatch) {
        markers.push({
          kind: 'saga-rule',
          id: `rule-${bestRuleMatch.index + 1}`,
          label: `Abrir regla canonica #${bestRuleMatch.index + 1}`,
        });
      }

      return markers.slice(0, 4);
    },
    [activeChapter, activeSaga, orderedChapters],
  );

  const buildConsultorEvidenceMarkers = useCallback(
    (answer: string, scopedStoryBibleRules: string): ContextEvidenceMarker[] => {
      const markers: ContextEvidenceMarker[] = [];
      const answerTokens = extractContextTokens(answer, 240);
      if (answerTokens.size === 0) {
        return markers;
      }

      const chapterScores = orderedChapters
        .map((chapter) => {
          const chapterText = stripHtml(chapter.content).slice(0, 3600);
          const chapterTokens = extractContextTokens(`${chapter.title}\n${chapterText}`, 160);
          return {
            chapter,
            chapterText,
            score: scoreContextOverlap(answerTokens, chapterTokens),
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 2);
      for (const entry of chapterScores) {
        markers.push({
          kind: 'chapter',
          id: entry.chapter.id,
          label: `Capitulo ${entry.chapter.id} - ${entry.chapter.title}`,
          snippet: extractContextEvidenceSnippet(entry.chapterText, answerTokens),
        });
      }

      if (activeSaga) {
        const timelineScores = activeSaga.metadata.worldBible.timeline
          .map((event) => {
            const source = `${event.displayLabel || `T${event.startOrder}`} ${event.title} ${event.summary} ${event.notes}`.trim();
            return {
              event,
              source,
              score: scoreContextOverlap(answerTokens, extractContextTokens(source, 96)),
            };
          })
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 2);
        for (const entry of timelineScores) {
          markers.push({
            kind: 'timeline',
            id: entry.event.id,
            label: `Timeline ${entry.event.displayLabel || `T${entry.event.startOrder}`} - ${entry.event.title || 'evento'}`,
            snippet: extractContextEvidenceSnippet(entry.source, answerTokens),
          });
        }
      }

      const ruleLines = scopedStoryBibleRules
        .split(/\n+/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 120);
      const ruleMatches = ruleLines
        .map((line, index) => ({
          index,
          line,
          score: scoreContextOverlap(answerTokens, extractContextTokens(line, 44)),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 2);
      for (const entry of ruleMatches) {
        markers.push({
          kind: 'saga-rule',
          id: `rule-${entry.index + 1}`,
          label: `Regla canonica #${entry.index + 1}`,
          snippet: entry.line,
        });
      }

      return markers.slice(0, 6);
    },
    [activeSaga, orderedChapters],
  );

  const handleContextJump = useCallback(
    (jump: { kind: 'chapter' | 'timeline' | 'saga-rule'; id: string; label: string }) => {
      if (jump.kind === 'chapter') {
        if (!book || !book.chapters[jump.id]) {
          setStatus(`No se encontro el capitulo referenciado para salto: ${jump.label}.`);
          return;
        }
        setActiveChapterId(jump.id);
        setMainView('editor');
        setStatus(`Salto contextual al manuscrito: ${jump.label}.`);
        return;
      }

      if (jump.kind === 'timeline') {
        if (!activeSaga) {
          setStatus('No hay saga activa para abrir el salto contextual de timeline.');
          return;
        }
        setMainView('timeline');
        setStatus(`Salto contextual al timeline: ${jump.label}.`);
        return;
      }

      if (!activeSaga) {
        setStatus('No hay saga activa para abrir reglas canonicas.');
        return;
      }
      setMainView('saga');
      setStatus(`Salto contextual a reglas de saga: ${jump.label}.`);
    },
    [activeSaga, book],
  );

  const handleSendChat = useCallback(
    async (message: string, scope: ChatScope, mode: AiAssistantMode) => {
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
      let activeBookTransactionId: string | null = null;

      try {
        await persistScopeMessages(scope, withUser, scopeChapterId);

        const chapterText = activeEditorChapter ? stripHtml(activeEditorChapter.content) : '';
        const bookAutoApplyAllowedByPolicy = config.bookAutoApplyEnabled && RELEASE_BOOK_AUTO_APPLY_ENABLED;
        const autoApplyEnabledForScope =
          mode === 'rewrite' && config.autoApplyChatChanges && (scope === 'chapter' || bookAutoApplyAllowedByPolicy);
        const compactHistory = history
          .slice(-8)
          .map((item) => `${item.role === 'user' ? 'Usuario' : 'Asistente'}: ${item.content}`)
          .join('\n');
        const storyBibleForChat = selectStoryBibleForPrompt(
          storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
          `${message}\n${activeEditorChapter?.title ?? ''}\n${chapterText}\n${compactHistory}`,
          {
            recentText: compactHistory,
            recencyWeight: 1.2,
          },
        );
        const sagaContextForChat = buildSagaPromptContext(
          `${message}\n${activeEditorChapter?.title ?? ''}\n${chapterText}\n${compactHistory}`,
          {
            recentText: compactHistory,
            recencyWeight: 1.2,
          },
        );

        if (!autoApplyEnabledForScope) {
          const prompt = buildChatPrompt({
            scope,
            mode,
            message,
            bookTitle: book.metadata.title,
            language: activeLanguage,
            foundation: book.metadata.foundation,
            storyBible: storyBibleForChat,
            sagaTitle: sagaContextForChat.sagaTitle,
            sagaWorld: sagaContextForChat.sagaWorld,
            bookLengthInstruction: scope === 'book' ? bookLengthInfo : undefined,
            chapterTitle: activeEditorChapter?.title,
            chapterLengthPreset: activeEditorChapter?.lengthPreset,
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
          const consultorMarkers =
            mode === 'consultor'
              ? buildConsultorJumpMarkers(
                  answer,
                  storyBibleForChat.continuityRules,
                )
              : [];
          const consultorEvidenceMarkers =
            mode === 'consultor'
              ? buildConsultorEvidenceMarkers(
                  answer,
                  storyBibleForChat.continuityRules,
                )
              : [];
          const assistantContent =
            mode === 'consultor'
              ? appendContextJumpMarkers(answer, consultorMarkers, consultorEvidenceMarkers)
              : answer;

          const assistantMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope,
            content: assistantContent,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
          if (scope === 'book' && mode === 'rewrite' && config.autoApplyChatChanges && !bookAutoApplyAllowedByPolicy) {
            void recordTrustIncident(book.path, 'book_auto_apply_blocked');
            void writeSessionAudit(book.path, {
              sessionId: userMessage.id,
              scope: 'book',
              operation: 'chat-auto-apply-blocked-by-trust-mode',
              status: 'blocked',
              reason: RELEASE_BOOK_AUTO_APPLY_ENABLED
                ? 'Trust Mode bloquea auto-aplicado en scope libro sin habilitacion explicita.'
                : 'Politica de release bloquea auto-aplicado en scope libro.',
              chapterChanges: [],
              metadata: {
                requestedIterations: config.chatApplyIterations,
              },
            });
          }
          setStatus(
            scope === 'book' && mode === 'rewrite' && config.autoApplyChatChanges && !bookAutoApplyAllowedByPolicy
              ? RELEASE_BOOK_AUTO_APPLY_ENABLED
                ? 'Respuesta IA recibida (Trust Mode: auto-aplicado de libro desactivado).'
                : 'Respuesta IA recibida (Politica de release: auto-aplicado de libro bloqueado).'
              : 'Respuesta IA recibida.',
          );
          return;
        }

        const iterations = Math.max(1, Math.min(10, config.chatApplyIterations));
        if (scope === 'book') {
          const totalChapterPasses = book.metadata.chapterOrder.length * iterations;
          const chapterListPreview = book.metadata.chapterOrder
            .slice(0, 10)
            .map((id, i) => `  ${i + 1}. ${book.chapters[id]?.title ?? id}`)
            .join('\n');
          const moreChapters = book.metadata.chapterOrder.length > 10 ? `\n  ...y ${book.metadata.chapterOrder.length - 10} mas` : '';
          const accepted = await confirm(
            `Vas a reescribir ${book.metadata.chapterOrder.length} capitulos (${totalChapterPasses} pases de IA).\n\nCapitulos afectados:\n${chapterListPreview}${moreChapters}\n\nEsta accion no se puede deshacer automaticamente. Se recomienda revisar diffs antes de aplicar cambios masivos.`,
            {
              title: 'Aplicar IA en todo el libro',
              kind: 'warning',
              okLabel: 'Aplicar en todo el libro',
              cancelLabel: 'Cancelar',
            },
          );

          if (!accepted) {
            const assistantMessage: ChatMessage = {
              id: randomId('msg'),
              role: 'assistant',
              scope,
              content: 'Proceso cancelado. No se aplicaron cambios automaticos al libro.',
              createdAt: getNowIso(),
            };
            await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
            setStatus('Auto-aplicado de libro cancelado por el usuario.');
            return;
          }
        }

        if (scope === 'chapter') {
          if (!activeChapterId) {
            throw new Error('No hay capitulo activo para aplicar cambios.');
          }

          let workingChapters: BookProject['chapters'] = { ...book.chapters };
          let chapter = workingChapters[activeChapterId];

          if (!chapter) {
            throw new Error('No se encontro el capitulo activo.');
          }

          const rollbackChapterBefore = cloneChapterForRollback(chapter);

          let lastSummaryMessage = '';
          let appliedIterations = 0;
          let cancelledBySafeMode = false;
          let cancelledByRiskReview = false;
          let continuityCorrections = 0;

          if (config.continuousAgentEnabled) {
            const maxRounds = Math.max(1, Math.min(12, config.continuousAgentMaxRounds));
            let previousSummary = '';

            for (let round = 1; round <= maxRounds; round += 1) {
              if (config.autoVersioning) {
                await saveChapterSnapshot(book.path, chapter, `Agente continuo ronda ${round}/${maxRounds}`);
              }

              const currentChapterText = stripHtml(chapter.content);
              const storyBibleForChapter = selectStoryBibleForPrompt(
                storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
                `${message}\n${chapter.title}\n${currentChapterText}`,
                {
                  recentText: compactHistory,
                  recencyWeight: 1.2,
                },
              );
              const sagaContextForChapter = buildSagaPromptContext(
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
                sagaTitle: sagaContextForChapter.sagaTitle,
                sagaWorld: sagaContextForChapter.sagaWorld,
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
              if (continuityResult.corrected) {
                continuityCorrections += 1;
              }

              const requiresHighRiskReview = guardedResult.highRisk || continuityResult.highRisk;
              const requiresSafeModeReview =
                config.aiSafeMode &&
                shouldRequireAiSafeReview(currentChapterText, nextChapterText);
              const riskReason = [guardedResult.riskReason, continuityResult.riskReason]
                .map((entry) => entry.trim())
                .filter(Boolean)
                .join(' | ');
              if (requiresHighRiskReview || requiresSafeModeReview) {
                const approved = await requestAiSafeReview({
                  title: requiresHighRiskReview ? `Riesgo alto IA - ${chapter.title}` : `Modo seguro IA - ${chapter.title}`,
                  subtitle: requiresHighRiskReview
                    ? `Riesgo alto detectado en ronda ${round}/${maxRounds}. ${riskReason || 'Requiere aprobacion manual antes de aplicar.'}`
                    : `Agente continuo ronda ${round}/${maxRounds}. Revisa el diff antes de aplicar.`,
                  beforeText: currentChapterText,
                  afterText: nextChapterText,
                });
                if (!approved) {
                  cancelledBySafeMode = true;
                  cancelledByRiskReview = requiresHighRiskReview;
                  setStatus(
                    requiresHighRiskReview
                      ? 'Riesgo alto IA: cambio cancelado por el usuario.'
                      : 'Modo seguro IA: cambio cancelado por el usuario.',
                  );
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
                storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
                `${message}\n${chapter.title}\n${currentChapterText}`,
                {
                  recentText: compactHistory,
                  recencyWeight: 1.2,
                },
              );
              const sagaContextForChapter = buildSagaPromptContext(
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
                sagaTitle: sagaContextForChapter.sagaTitle,
                sagaWorld: sagaContextForChapter.sagaWorld,
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
              if (continuityResult.corrected) {
                continuityCorrections += 1;
              }

              const requiresHighRiskReview = guardedResult.highRisk || continuityResult.highRisk;
              const requiresSafeModeReview =
                config.aiSafeMode &&
                shouldRequireAiSafeReview(currentChapterText, nextChapterText);
              const riskReason = [guardedResult.riskReason, continuityResult.riskReason]
                .map((entry) => entry.trim())
                .filter(Boolean)
                .join(' | ');
              if (requiresHighRiskReview || requiresSafeModeReview) {
                const approved = await requestAiSafeReview({
                  title: requiresHighRiskReview ? `Riesgo alto IA - ${chapter.title}` : `Modo seguro IA - ${chapter.title}`,
                  subtitle: requiresHighRiskReview
                    ? `Riesgo alto detectado en iteracion ${iteration}/${iterations}. ${riskReason || 'Requiere aprobacion manual antes de aplicar.'}`
                    : `Chat auto-aplicar iteracion ${iteration}/${iterations}. Revisa el diff antes de aplicar.`,
                  beforeText: currentChapterText,
                  afterText: nextChapterText,
                });
                if (!approved) {
                  cancelledBySafeMode = true;
                  cancelledByRiskReview = requiresHighRiskReview;
                  setStatus(
                    requiresHighRiskReview
                      ? 'Riesgo alto IA: cambio cancelado por el usuario.'
                      : 'Modo seguro IA: cambio cancelado por el usuario.',
                  );
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
            void recordTrustIncident(
              book.path,
              cancelledByRiskReview ? 'session_cancelled_risk' : 'session_cancelled_safe_mode',
            );
            void writeSessionAudit(book.path, {
              sessionId: userMessage.id,
              scope: 'chapter',
              operation: config.continuousAgentEnabled ? 'chat-auto-apply-continuous' : 'chat-auto-apply-chapter',
              status: 'cancelled',
              reason: cancelledByRiskReview ? 'Revision manual de riesgo alto rechazada.' : 'Revision manual (safe mode) rechazada.',
              chapterChanges: [],
              metadata: {
                requestedIterations: iterations,
                appliedIterations,
                continuityCorrections,
              },
            });
            const assistantMessage: ChatMessage = {
              id: randomId('msg'),
              role: 'assistant',
              scope,
              content: cancelledByRiskReview
                ? 'Riesgo alto IA: no se aplicaron cambios porque la revision manual fue rechazada.'
                : 'Modo seguro IA: no se aplicaron cambios porque el diff fue rechazado.',
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
          if (appliedIterations > 0) {
            registerAiRollbackSession({
              label: config.continuousAgentEnabled
                ? `Chat auto-aplicar (agente continuo) - ${chapter.title}`
                : `Chat auto-aplicar - ${chapter.title}`,
              scope,
              bookPath: book.path,
              chapterOrder: [chapter.id],
              chaptersBefore: {
                [chapter.id]: rollbackChapterBefore,
              },
            });
          }
          if (appliedIterations > 0) {
            void recordTrustIncident(book.path, 'session_applied');
          }
          if (cancelledBySafeMode) {
            void recordTrustIncident(
              book.path,
              cancelledByRiskReview ? 'session_cancelled_risk' : 'session_cancelled_safe_mode',
            );
          }

          const chapterChangeCard = buildAiChangeCard({
            operation: config.continuousAgentEnabled
              ? `Chat auto-aplicar agente continuo (${appliedIterations} ronda/s aplicada/s)`
              : `Chat auto-aplicar (${appliedIterations} iteracion/es aplicada/s)`,
            scopeLabel: 'Capitulo',
            entries: [
              {
                chapterId: chapter.id,
                label: chapter.title,
                beforeText: stripHtml(rollbackChapterBefore.content),
                afterText: stripHtml(chapter.content),
              },
            ],
            continuityCorrections,
          });

          const assistantMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope,
            content: [
              buildSummaryMessage(lastSummaryMessage),
              chapterChangeCard,
            ]
              .filter((entry) => entry.trim().length > 0)
              .join('\n\n'),
            createdAt: getNowIso(),
          };

          void writeSessionAudit(book.path, {
            sessionId: userMessage.id,
            scope: 'chapter',
            operation: config.continuousAgentEnabled ? 'chat-auto-apply-continuous' : 'chat-auto-apply-chapter',
            status: cancelledBySafeMode ? 'cancelled' : 'applied',
            reason: cancelledBySafeMode
              ? cancelledByRiskReview
                ? 'Interrumpido por revision manual de riesgo alto.'
                : 'Interrumpido por revision manual de safe mode.'
              : '',
            chapterChanges: [
              {
                chapterId: chapter.id,
                chapterTitle: chapter.title,
                beforeText: stripHtml(rollbackChapterBefore.content),
                afterText: stripHtml(chapter.content),
              },
            ],
            metadata: {
              requestedIterations: iterations,
              appliedIterations,
              continuityCorrections,
            },
          });

          await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
          setStatus(
            config.continuousAgentEnabled
              ? 'Chat aplicado con agente continuo al capitulo.'
              : 'Chat aplicado automaticamente al capitulo.',
          );
          return;
        }

        const rollbackBookBefore = Object.fromEntries(
          book.metadata.chapterOrder
            .map((chapterId) => {
              const chapter = book.chapters[chapterId];
              if (!chapter) {
                return null;
              }
              return [chapterId, cloneChapterForRollback(chapter)] as const;
            })
            .filter((entry): entry is readonly [string, ChapterDocument] => Boolean(entry)),
        );
        const transactionStart = await startAiTransaction(book.path, {
          operation: 'chat-auto-apply-book',
          scope: 'book',
          chapterOrder: book.metadata.chapterOrder,
          chaptersBefore: rollbackBookBefore,
          notes: `Mensaje: ${message.slice(0, 180)}`,
        });
        activeBookTransactionId = transactionStart.transactionId;
        void recordTrustIncident(book.path, 'book_auto_apply_run');

        const {
          workingChapters,
          extractedSummaries,
          continuityCorrections,
          appliedChapterUpdates,
          appliedChapterIds,
          cancelledBySafeMode,
          cancelledByRiskReview,
        } = await applyBookAutoRewrite({
          book: storyBibleChronicleIndex
            ? {
                ...book,
                metadata: {
                  ...book.metadata,
                  storyBible: storyBibleChronicleIndex,
                },
              }
            : canonicalStoryBible
              ? {
                  ...book,
                  metadata: {
                    ...book.metadata,
                    storyBible: canonicalStoryBible,
                  },
                }
              : book,
          config,
          message,
          iterations,
          activeLanguage,
          compactHistory,
          buildBookContext,
          buildSagaPromptContext,
          generateText: async (prompt: string) =>
            normalizeAiOutput(
              await generateWithOllama({
                config,
                prompt,
              }),
            ),
          enforceExpansionResult,
          enforceContinuityResult,
          shouldRequireAiSafeReview,
          requestAiSafeReview,
          onStatus: setStatus,
        });

        if (cancelledBySafeMode && appliedChapterUpdates === 0) {
          if (activeBookTransactionId) {
            await commitAiTransaction(
              book.path,
              activeBookTransactionId,
              cancelledByRiskReview ? 'cancelled-risk-no-changes' : 'cancelled-safe-mode-no-changes',
            );
            activeBookTransactionId = null;
          }
          void recordTrustIncident(
            book.path,
            cancelledByRiskReview ? 'session_cancelled_risk' : 'session_cancelled_safe_mode',
          );
          void writeSessionAudit(book.path, {
            sessionId: userMessage.id,
            scope: 'book',
            operation: 'chat-auto-apply-book',
            status: 'cancelled',
            reason: cancelledByRiskReview ? 'Revision manual de riesgo alto rechazada.' : 'Revision manual (safe mode) rechazada.',
            chapterChanges: [],
            metadata: {
              iterations,
              extractedSummaries,
              continuityCorrections,
            },
          });
          const assistantMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope,
            content: cancelledByRiskReview
              ? 'Riesgo alto IA: no se aplicaron cambios porque la revision manual fue rechazada.'
              : 'Modo seguro IA: no se aplicaron cambios porque el diff fue rechazado.',
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
        if (appliedChapterUpdates > 0) {
          registerAiRollbackSession({
            label: 'Chat auto-aplicar - Libro completo',
            scope,
            bookPath: book.path,
            chapterOrder: appliedChapterIds,
            chaptersBefore: rollbackBookBefore,
          });
        }
        if (activeBookTransactionId) {
          await commitAiTransaction(
            book.path,
            activeBookTransactionId,
            cancelledBySafeMode ? 'partial-apply-interrupted' : 'applied',
          );
          activeBookTransactionId = null;
        }
        if (appliedChapterUpdates > 0) {
          void recordTrustIncident(book.path, 'session_applied');
        }
        if (cancelledBySafeMode) {
          void recordTrustIncident(
            book.path,
            cancelledByRiskReview ? 'session_cancelled_risk' : 'session_cancelled_safe_mode',
          );
        }

        const bookChangeEntries = appliedChapterIds.reduce<
          Array<{ chapterId: string; label: string; beforeText: string; afterText: string }>
        >((entries, chapterId) => {
          const beforeChapter = rollbackBookBefore[chapterId];
          const afterChapter = workingChapters[chapterId];
          if (!beforeChapter || !afterChapter) {
            return entries;
          }

          const chapterIndex = book.metadata.chapterOrder.indexOf(chapterId);
          const labelPrefix = chapterIndex >= 0 ? `${chapterIndex + 1}. ` : '';
          entries.push({
            chapterId,
            label: `${labelPrefix}${afterChapter.title}`,
            beforeText: stripHtml(beforeChapter.content),
            afterText: stripHtml(afterChapter.content),
          });
          return entries;
        }, []);
        const bookChangeCard = buildAiChangeCard({
          operation: `Chat auto-aplicar libro (${iterations} iteracion/es)`,
          scopeLabel: 'Libro',
          entries: bookChangeEntries,
          extractedSummaries,
          continuityCorrections,
          interrupted: cancelledBySafeMode,
        });

        const assistantMessage: ChatMessage = {
          id: randomId('msg'),
          role: 'assistant',
          scope,
          content: bookChangeCard,
          createdAt: getNowIso(),
        };

        void writeSessionAudit(book.path, {
          sessionId: userMessage.id,
          scope: 'book',
          operation: 'chat-auto-apply-book',
          status: cancelledBySafeMode ? 'cancelled' : 'applied',
          reason: cancelledBySafeMode
            ? cancelledByRiskReview
              ? 'Interrumpido por revision manual de riesgo alto.'
              : 'Interrumpido por revision manual de safe mode.'
            : '',
          chapterChanges: bookChangeEntries.map((entry, index) => ({
              chapterId: entry.chapterId ?? appliedChapterIds[index] ?? `chapter-${index + 1}`,
              chapterTitle: entry.label,
              beforeText: entry.beforeText,
              afterText: entry.afterText,
          })),
          metadata: {
            iterations,
            extractedSummaries,
            continuityCorrections,
            appliedChapterUpdates,
            interrupted: cancelledBySafeMode,
          },
        });

        await persistScopeMessages(scope, [...withUser, assistantMessage], scopeChapterId);
        setStatus(
          cancelledBySafeMode
            ? 'Chat auto-aplicado parcialmente al libro (interrumpido por Modo seguro IA).'
            : 'Chat aplicado automaticamente al libro completo.',
        );
      } catch (error) {
        if (scope === 'book' && book && activeBookTransactionId) {
          try {
            const rollbackResult = await rollbackAiTransaction(
              book.path,
              activeBookTransactionId,
              `rollback por error: ${formatUnknownError(error)}`,
            );
            if (rollbackResult.rolledBack) {
              void recordTrustIncident(book.path, 'transaction_recovered');
              try {
                const reloadedAfterRollback = await loadBookProject(book.path);
                setBook((previous) =>
                  previous && previous.path === reloadedAfterRollback.path ? reloadedAfterRollback : previous,
                );
              } catch {
                // Si falla la recarga, se conserva estado actual y se informa el error original.
              }
            }
          } catch {
            // Se informa el error original de IA debajo.
          }
        }
        setStatus(`Error de IA: ${formatUnknownError(error)}`);
      } finally {
        setAiBusy(false);
      }
    },
    [
      book,
      activeEditorChapter,
      activeChapterId,
      config,
      persistScopeMessages,
      ensureScopeMessagesLoaded,
      syncBookToLibrary,
      enforceExpansionResult,
      enforceContinuityResult,
      requestAiSafeReview,
      registerAiRollbackSession,
      recordTrustIncident,
      writeSessionAudit,
      activeLanguage,
      bookLengthInfo,
      buildConsultorEvidenceMarkers,
      buildConsultorJumpMarkers,
      buildSagaPromptContext,
      canonicalStoryBible,
      storyBibleChronicleIndex,
    ],
  );

  const executeBookAction = useCallback(
    async (actionId: (typeof AI_ACTIONS)[number]['id']) => {
      if (!book) return;
      const action = AI_ACTIONS.find((item) => item.id === actionId);
      setAiBusy(true);
      setStatus('Analizando libro completo...');
      try {
        const prompt = buildActionPrompt({
          actionId,
          selectedText: '',
          ideaText: '',
          chapterTitle: '',
          bookTitle: book.metadata.title,
          language: activeLanguage,
          foundation: book.metadata.foundation,
          storyBible: canonicalStoryBible ?? book.metadata.storyBible,
          sagaTitle: activeSaga?.metadata.title ?? null,
          sagaWorld: activeSaga?.metadata.worldBible ?? null,
          fullBookContext: buildBookContext(book),
        });
        const response = normalizeAiOutput(await generateWithOllama({ config, prompt }));
        const history = await ensureScopeMessagesLoaded('book');
        const feedbackMessage: ChatMessage = {
          id: randomId('msg'),
          role: 'assistant',
          scope: 'book',
          content: `Analisis (${action?.label ?? actionId}):\n${response}`,
          createdAt: getNowIso(),
        };
        await persistScopeMessages('book', [...history, feedbackMessage]);
        setChatScope('book');
        setStatus(`Analisis completado: ${action?.label ?? actionId}`);
      } catch (error) {
        setStatus(`Error IA: ${formatUnknownError(error)}`);
      } finally {
        setAiBusy(false);
      }
    },
    [book, activeLanguage, config, canonicalStoryBible, activeSaga, ensureScopeMessagesLoaded, persistScopeMessages],
  );

  const executeAction = useCallback(
    async (actionId: (typeof AI_ACTIONS)[number]['id'], ideaText = '') => {
      if (!book || !activeEditorChapter) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        setStatus('Activa el editor para aplicar acciones IA en el capitulo.');
        return;
      }

      const allowEmptyTargetActions = new Set([
        'feedback-book',
        'feedback-chapter',
        'draft-from-idea',
        'verify-pov-voice',
        'suggest-next-chapter',
        'detect-broken-promises',
        'compare-arc-rhythm',
        'loose-ends-check',
        'consult-world',
        'consult-economy',
        'consult-politics',
        'consult-tone-drift',
        'consult-rule-audit',
      ]);
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
        storyBibleChronicleIndex ?? canonicalStoryBible ?? book.metadata.storyBible,
        `${normalizedIdea}\n${promptTargetText}\n${activeEditorChapter.title}\n${stripHtml(activeEditorChapter.content)}`,
        {
          recentText: recentActionHistory,
          recencyWeight: 1.15,
        },
      );
      const sagaContextForAction = buildSagaPromptContext(
        `${normalizedIdea}\n${promptTargetText}\n${activeEditorChapter.title}\n${stripHtml(activeEditorChapter.content)}`,
        {
          recentText: recentActionHistory,
          recencyWeight: 1.15,
        },
      );

      const prompt = buildActionPrompt({
        actionId,
        selectedText: promptTargetText,
        ideaText: normalizedIdea,
        chapterTitle: activeEditorChapter.title,
        bookTitle: book.metadata.title,
        language: activeLanguage,
        foundation: book.metadata.foundation,
        storyBible: storyBibleForAction,
        sagaTitle: sagaContextForAction.sagaTitle,
        sagaWorld: sagaContextForAction.sagaWorld,
        chapterLengthPreset: activeEditorChapter.lengthPreset,
        chapterContext: stripHtml(activeEditorChapter.content),
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
        const rollbackBeforeChapter = action?.modifiesText ? cloneChapterForRollback(activeEditorChapter) : null;
        if (action?.modifiesText && config.autoVersioning) {
          await saveChapterSnapshot(book.path, activeEditorChapter, action.label);
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
        let expansionHighRisk = false;
        let expansionRiskReason = '';

        if (action?.modifiesText) {
          const expansionSourceText = actionId === 'draft-from-idea' ? chapterText : selectedText;
          const expansionResult = await enforceExpansionResult({
            actionId,
            instruction: actionInstruction,
            originalText: expansionSourceText,
            candidateText: outputText,
            bookTitle: book.metadata.title,
            chapterTitle: activeEditorChapter.title,
          });
          outputText = expansionResult.text;
          summaryText = expansionResult.summaryText || summaryText;
          expansionHighRisk = expansionResult.highRisk;
          expansionRiskReason = expansionResult.riskReason;
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
            chapterTitle: activeEditorChapter.title,
            recentText: recentActionHistory,
          });
          summaryText = continuityResult.summaryText || summaryText;

          const requiresHighRiskReview = expansionHighRisk || continuityResult.highRisk;
          const requiresSafeModeReview =
            config.aiSafeMode &&
            shouldRequireAiSafeReview(chapterText, continuityResult.text);
          const riskReason = [expansionRiskReason, continuityResult.riskReason]
            .map((entry) => entry.trim())
            .filter(Boolean)
            .join(' | ');
          if (requiresHighRiskReview || requiresSafeModeReview) {
            const approved = await requestAiSafeReview({
              title: requiresHighRiskReview
                ? `Riesgo alto IA - ${action?.label ?? actionId}`
                : `Modo seguro IA - ${action?.label ?? actionId}`,
              subtitle: requiresHighRiskReview
                ? `${riskReason || 'Se detecto riesgo alto en guardrails.'} Revisa el diff antes de aplicar.`
                : 'Se detecto un cambio grande. Revisa el diff antes de aplicar.',
              beforeText: chapterText,
              afterText: continuityResult.text,
            });
            if (!approved) {
              void recordTrustIncident(
                book.path,
                requiresHighRiskReview ? 'session_cancelled_risk' : 'session_cancelled_safe_mode',
              );
              void writeSessionAudit(book.path, {
                sessionId: randomId('audit'),
                scope: 'chapter',
                operation: `action-${action?.label ?? actionId}`,
                status: 'cancelled',
                reason: requiresHighRiskReview
                  ? riskReason || 'Revision manual de riesgo alto rechazada.'
                  : 'Revision manual (safe mode) rechazada.',
                chapterChanges: [],
                metadata: {
                  actionId,
                },
              });
              setStatus(
                requiresHighRiskReview
                  ? 'Riesgo alto IA: cambio rechazado antes de aplicar.'
                  : 'Modo seguro IA: cambio rechazado antes de aplicar.',
              );
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
            ...activeEditorChapter,
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
                [activeEditorChapter.id]: persistedChapter,
              },
            };
          });
          await syncBookToLibrary({
            ...book,
            chapters: {
              ...book.chapters,
              [activeEditorChapter.id]: persistedChapter,
            },
          });
          if (rollbackBeforeChapter) {
            registerAiRollbackSession({
              label: `Accion IA - ${action?.label ?? actionId}`,
              scope: 'chapter',
              bookPath: book.path,
              chapterOrder: [activeEditorChapter.id],
              chaptersBefore: {
                [activeEditorChapter.id]: rollbackBeforeChapter,
              },
            });
          }
          void recordTrustIncident(book.path, 'session_applied');
          void writeSessionAudit(book.path, {
            sessionId: randomId('audit'),
            scope: 'chapter',
            operation: `action-${action?.label ?? actionId}`,
            status: 'applied',
            chapterChanges: [
              {
                chapterId: activeEditorChapter.id,
                chapterTitle: persistedChapter.title,
                beforeText: stripHtml(rollbackBeforeChapter?.content ?? activeEditorChapter.content),
                afterText: stripHtml(persistedChapter.content),
              },
            ],
            metadata: {
              actionId,
              continuityCorrected: continuityResult.corrected,
              highRiskReview: requiresHighRiskReview,
            },
          });

          const currentChapterMessages = await ensureScopeMessagesLoaded('chapter', activeEditorChapter.id);
          const actionChangeCard = buildAiChangeCard({
            operation: `Accion IA: ${action?.label ?? actionId}`,
            scopeLabel: 'Capitulo',
            entries: [
              {
                chapterId: persistedChapter.id,
                label: persistedChapter.title,
                beforeText: stripHtml(rollbackBeforeChapter?.content ?? activeEditorChapter.content),
                afterText: stripHtml(persistedChapter.content),
              },
            ],
            continuityCorrections: continuityResult.corrected ? 1 : 0,
          });
          const summaryMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope: 'chapter',
            content: [
              buildSummaryMessage(summaryText, `Resumen de cambios (${action?.label ?? actionId}):`),
              actionChangeCard,
            ]
              .filter((entry) => entry.trim().length > 0)
              .join('\n\n'),
            createdAt: getNowIso(),
          };
          await persistScopeMessages('chapter', [...currentChapterMessages, summaryMessage], activeEditorChapter.id);

          setStatus(
            actionId === 'draft-from-idea' ? 'Capitulo generado desde la idea ingresada.' : `Accion aplicada: ${action?.label ?? actionId}`,
          );
        } else {
          const feedbackScope: ChatScope = (actionId === 'feedback-book' || actionId === 'loose-ends-check') ? 'book' : 'chapter';
          if (feedbackScope === 'chapter' && !activeChapterId) {
            throw new Error('No hay capitulo activo para guardar la devolucion.');
          }

          const history =
            feedbackScope === 'book'
              ? await ensureScopeMessagesLoaded('book')
              : await ensureScopeMessagesLoaded('chapter', activeEditorChapter.id);

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
            feedbackScope === 'chapter' ? activeEditorChapter.id : undefined,
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
      activeEditorChapter,
      activeChapterId,
      config,
      persistScopeMessages,
      ensureScopeMessagesLoaded,
      syncBookToLibrary,
      enforceExpansionResult,
      enforceContinuityResult,
      requestAiSafeReview,
      registerAiRollbackSession,
      recordTrustIncident,
      writeSessionAudit,
      activeLanguage,
      currentMessages,
      buildSagaPromptContext,
      canonicalStoryBible,
      storyBibleChronicleIndex,
    ],
  );

  const handleRunAction = useCallback(
    (actionId: (typeof AI_ACTIONS)[number]['id']) => {
      if (actionId === 'draft-from-idea') {
        if (!activeEditorChapter) {
          setStatus('No hay capitulo activo para generar desde idea.');
          return;
        }

        setPromptModal({
          title: `Escribir desde idea - ${activeEditorChapter.title}`,
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

      if (actionId === 'loose-ends-check') {
        void executeBookAction(actionId);
        return;
      }

      if (
        actionId === 'consult-world' ||
        actionId === 'consult-economy' ||
        actionId === 'consult-politics' ||
        actionId === 'consult-tone-drift' ||
        actionId === 'consult-rule-audit'
      ) {
        void executeBookAction(actionId);
        return;
      }

      void executeAction(actionId);
    },
    [activeEditorChapter, executeAction, executeBookAction],
  );

  const persistEditorChapter = useCallback(
    async (statusMessage: string) => {
      if (activeChapterId && editorRef.current) {
        const nextDraft: ChapterEditorDraft = {
          chapterId: activeChapterId,
          html: editorRef.current.getHTML(),
          json: editorRef.current.getJSON(),
        };
        editorDraftRef.current = nextDraft;
        flushEditorDraftState(nextDraft);
      }

      dirtyRef.current = true;
      const saved = await flushChapterSave();
      if (!saved) {
        return;
      }

      updateEditorHistoryState();
      setStatus(statusMessage);
    },
    [activeChapterId, flushChapterSave, flushEditorDraftState, updateEditorHistoryState],
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
        setStatus('No hay puntos de restauracion para recuperar.');
        return;
      }

      const currentChapter = book.chapters[activeChapter.id];
      if (!currentChapter) {
        return;
      }

      const currentPointer = snapshotUndoCursorRef.current[activeChapter.id];
      const targetIndex = currentPointer ?? snapshots.length - 1;

      if (targetIndex < 0) {
        setStatus('No hay versiones anteriores para recuperar.');
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
      setStatus(`Version restaurada (v${targetSnapshot.version}).`);
    } catch (error) {
      setStatus(`No se pudo restaurar la version: ${formatUnknownError(error)}`);
    }
  }, [book, activeChapter, syncBookToLibrary]);

  const handleRestoreSnapshotVersion = useCallback(
    async (chapterId: string, version: number) => {
      if (!book) {
        return;
      }

      const currentChapter = book.chapters[chapterId];
      if (!currentChapter) {
        setStatus(`No se encontro el capitulo ${chapterId} para restaurar.`);
        return;
      }

      try {
        const snapshots = await listChapterSnapshots(book.path, chapterId);
        const targetSnapshot = snapshots.find((entry) => entry.version === version);
        if (!targetSnapshot) {
          setStatus(`No se encontro la version v${version} para ${chapterId}.`);
          return;
        }

        if (config.autoVersioning) {
          await saveChapterSnapshot(
            book.path,
            currentChapter,
            `Pre-restauracion desde diff (v${version})`,
            { milestoneLabel: `Antes de restaurar v${version}` },
          );
        }

        const restored = await saveChapter(book.path, {
          ...targetSnapshot.chapter,
          id: chapterId,
          updatedAt: getNowIso(),
        });

        snapshotUndoCursorRef.current[chapterId] = undefined;
        snapshotRedoStackRef.current[chapterId] = [];
        setSnapshotRedoNonce((value) => value + 1);

        const nextBook: BookProject = {
          ...book,
          chapters: {
            ...book.chapters,
            [chapterId]: restored,
          },
        };

        setBook(nextBook);
        await syncBookToLibrary(nextBook);
        dirtyRef.current = false;
        setStatus(`Capitulo ${chapterId} restaurado a v${version}.`);
      } catch (error) {
        setStatus(`No se pudo restaurar la version seleccionada: ${formatUnknownError(error)}`);
      }
    },
    [book, config.autoVersioning, syncBookToLibrary],
  );

  const handleRedoSnapshot = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    try {
      const stack = snapshotRedoStackRef.current[activeChapter.id] ?? [];
      if (stack.length === 0) {
        setStatus('No hay version para rehacer.');
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
      setStatus('Version rehecha.');
    } catch (error) {
      setStatus(`No se pudo rehacer la version: ${formatUnknownError(error)}`);
    }
  }, [book, activeChapter, syncBookToLibrary]);

  const handleRollbackAiSession = useCallback(async () => {
    if (!book || !lastAiRollbackSession) {
      setStatus('No hay sesion IA reciente para revertir.');
      return;
    }

    if (lastAiRollbackSession.bookPath !== book.path) {
      setLastAiRollbackSession(null);
      setStatus('La ultima sesion IA pertenece a otro libro.');
      return;
    }

    const chapterCount = lastAiRollbackSession.chapterOrder.length;
    const accepted = await confirm(
      `Vas a revertir la sesion "${lastAiRollbackSession.label}" en ${chapterCount} capitulo/s.\nEsta accion restaurara el estado anterior de forma atomica.`,
      {
        title: 'Revertir sesion IA',
        kind: 'warning',
        okLabel: 'Revertir sesion',
        cancelLabel: 'Cancelar',
      },
    );
    if (!accepted) {
      return;
    }

    try {
      const session = lastAiRollbackSession;
      let restoredCount = 0;
      let nextChapters: BookProject['chapters'] = { ...book.chapters };
      for (const chapterId of session.chapterOrder) {
        const baseline = session.chaptersBefore[chapterId];
        if (!baseline) {
          continue;
        }

        const restored = await saveChapter(book.path, {
          ...cloneChapterForRollback(baseline),
          updatedAt: getNowIso(),
        });
        nextChapters = {
          ...nextChapters,
          [chapterId]: restored,
        };
        resetSnapshotNavigation(chapterId);
        restoredCount += 1;
      }

      if (restoredCount === 0) {
        setStatus('No se encontraron capitulos para revertir en la sesion seleccionada.');
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: nextChapters,
        };
      });
      await syncBookToLibrary({
        ...book,
        chapters: nextChapters,
      });
      dirtyRef.current = false;
      setLastAiRollbackSession(null);
      void recordTrustIncident(book.path, 'session_rollback_manual');
      void writeSessionAudit(book.path, {
        sessionId: session.id,
        scope: session.scope,
        operation: `manual-rollback:${session.label}`,
        status: 'rolled_back',
        chapterChanges: session.chapterOrder
          .map((chapterId) => {
            const before = session.chaptersBefore[chapterId];
            const after = nextChapters[chapterId];
            if (!before || !after) {
              return null;
            }

            return {
              chapterId,
              chapterTitle: after.title,
              beforeText: stripHtml(before.content),
              afterText: stripHtml(after.content),
            };
          })
          .filter((entry): entry is {
            chapterId: string;
            chapterTitle: string;
            beforeText: string;
            afterText: string;
          } => Boolean(entry)),
        metadata: {
          restoredCount,
        },
      });
      setStatus(`Sesion IA revertida (${restoredCount} capitulo/s restaurados).`);
    } catch (error) {
      setStatus(`No se pudo revertir sesion IA: ${formatUnknownError(error)}`);
    }
  }, [
    book,
    lastAiRollbackSession,
    resetSnapshotNavigation,
    syncBookToLibrary,
    recordTrustIncident,
    writeSessionAudit,
  ]);

  const handleSaveMilestone = useCallback(() => {
    if (!book || !activeEditorChapter) {
      setStatus('Abre un capitulo para guardar un hito.');
      return;
    }

    setPromptModal({
      title: `Guardar hito - ${activeEditorChapter.title}`,
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
              activeEditorChapter,
              `Hito manual: ${milestoneLabel}`,
              { milestoneLabel },
            );
            snapshotRedoStackRef.current[activeEditorChapter.id] = [];
            setSnapshotRedoNonce((value) => value + 1);

            let syncNote = '';
            try {
              const sync = await syncStoryBibleFromChapter(activeEditorChapter);
              if (sync.addedCharacters > 0 || sync.addedLocations > 0) {
                syncNote = ` Biblia auto-actualizada (+${sync.addedCharacters} personaje/s, +${sync.addedLocations} lugar/es).`;
              }
            } catch (syncError) {
              syncNote = ` Auto-sincronizacion de biblia pendiente (${formatUnknownError(syncError)}).`;
            }

            setStatus(`Hito guardado: "${milestoneLabel}" (version ${snapshot.version}).${syncNote}`);
          } catch (error) {
            setStatus(`No se pudo guardar el hito: ${formatUnknownError(error)}`);
          }
        })();
      },
    });
  }, [book, activeEditorChapter, syncStoryBibleFromChapter]);

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
    async (intentLabel: string, action: () => Promise<void>) => {
      if (!book) {
        return;
      }

      const strictBlock = await checkStrictSagaValidationBlockForBook();
      if (strictBlock) {
        setStatus(
          `Exportacion bloqueada por modo estricto en saga "${strictBlock.sagaTitle}": ${strictBlock.errorCount} error(es) de coherencia.`,
        );
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
    [book, checkStrictSagaValidationBlockForBook, config],
  );

  const handleExportCollaborationPatch = useCallback(async () => {
    if (!book) {
      return;
    }

    const strictBlock = await checkStrictSagaValidationBlockForBook();
    if (strictBlock) {
      setStatus(
        `Exportacion bloqueada por modo estricto en saga "${strictBlock.sagaTitle}": ${strictBlock.errorCount} error(es) de coherencia.`,
      );
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
      setStatus(`Paquete de edicion exportado: ${outputPath}`);
    } catch (error) {
      setStatus(`No se pudo exportar el paquete de edicion: ${formatUnknownError(error)}`);
    }
  }, [book, checkStrictSagaValidationBlockForBook, orderedChapters]);

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
          title: 'Importar paquete de edicion',
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
      setStatus(`No se pudo importar el paquete de edicion: ${formatUnknownError(error)}`);
    }
  }, [book, config.autoVersioning, syncBookToLibrary]);

  const handleExportChapter = useCallback(async () => {
    if (!book || !activeEditorChapter) {
      return;
    }

    const strictBlock = await checkStrictSagaValidationBlockForBook();
    if (strictBlock) {
      setStatus(
        `Exportacion bloqueada por modo estricto en saga "${strictBlock.sagaTitle}": ${strictBlock.errorCount} error(es) de coherencia.`,
      );
      return;
    }

    try {
      const { exportChapterMarkdown } = await loadExportModule();
      const path = await exportChapterMarkdown(book.path, activeEditorChapter);
      setStatus(`Capitulo exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar capitulo: ${formatUnknownError(error)}`);
    }
  }, [book, activeEditorChapter, checkStrictSagaValidationBlockForBook]);

  const handleExportBookSingle = useCallback(async () => {
    if (!book) {
      return;
    }

    void queueEditorialGuardedAction('Exportar libro (archivo unico)', async () => {
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

    void queueEditorialGuardedAction('Exportar libro por capitulos', async () => {
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

    void queueEditorialGuardedAction('Exportar pack Amazon', async () => {
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

    void queueEditorialGuardedAction('Exportar DOCX editorial', async () => {
      try {
        const { exportBookDocx } = await loadExportModule();
        const path = await exportBookDocx(book.path, book.metadata, orderedChapters);
        setStatus(`DOCX editorial exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar DOCX: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportBookPdf = useCallback(async () => {
    if (!book) {
      return;
    }

    void queueEditorialGuardedAction('Exportar PDF editorial', async () => {
      try {
        const { exportBookPdf } = await loadExportModule();
        const path = await exportBookPdf(book.path, book.metadata, orderedChapters);
        setStatus(`PDF editorial exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar PDF: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportBookEpub = useCallback(async () => {
    if (!book) {
      return;
    }

    void queueEditorialGuardedAction('Exportar EPUB editorial', async () => {
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

    void queueEditorialGuardedAction('Exportar audiolibro WAV', async () => {
      await exportAudioToWav(
        buildBookAudioText(book.metadata, orderedChapters),
        buildBookAudioExportPath(book.path, book.metadata),
        'Audiolibro exportado',
      );
    });
  }, [book, orderedChapters, queueEditorialGuardedAction, exportAudioToWav]);

  const handleExportCartographerPack = useCallback(async () => {
    if (!activeSaga) {
      setStatus('Abre una saga para exportar el pack cartografico.');
      return;
    }

    try {
      const { exportSagaCartographerPack } = await loadExportModule();
      const path = await exportSagaCartographerPack(activeSaga.path, activeSaga);
      setStatus(`Pack cartografo exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar el pack cartografo: ${formatUnknownError(error)}`);
    }
  }, [activeSaga]);

  const handleExportHistorianPack = useCallback(async () => {
    if (!activeSaga) {
      setStatus('Abre una saga para exportar el pack cronologico.');
      return;
    }

    try {
      const { exportSagaHistorianPack } = await loadExportModule();
      const path = await exportSagaHistorianPack(activeSaga.path, activeSaga);
      setStatus(`Pack cronologia exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar el pack cronologia: ${formatUnknownError(error)}`);
    }
  }, [activeSaga]);

  const handleExportTimelineInteractive = useCallback(async () => {
    if (!activeSaga) {
      setStatus('Abre una saga para exportar la timeline interactiva.');
      return;
    }

    try {
      const { exportSagaTimelineInteractive } = await loadExportModule();
      const path = await exportSagaTimelineInteractive(activeSaga.path, activeSaga);
      setStatus(`Timeline interactiva exportada: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar la timeline interactiva: ${formatUnknownError(error)}`);
    }
  }, [activeSaga]);

  const handleExportSagaBible = useCallback(async () => {
    if (!activeSaga) {
      setStatus('Abre una saga para exportar la biblia compilada.');
      return;
    }

    try {
      const { exportSagaBibleDossier } = await loadExportModule();
      const path = await exportSagaBibleDossier(activeSaga.path, activeSaga);
      setStatus(`Biblia de saga exportada: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar la biblia de saga: ${formatUnknownError(error)}`);
    }
  }, [activeSaga]);

  const handleExportEditorPack = useCallback(async () => {
    if (!book) {
      return;
    }

    void queueEditorialGuardedAction('Exportar pack editor', async () => {
      try {
        const { exportBookEditorPack } = await loadExportModule();
        const path = await exportBookEditorPack(book.path, book.metadata, orderedChapters, activeSaga);
        setStatus(`Pack editor exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar el pack editor: ${formatUnknownError(error)}`);
      }
    });
  }, [activeSaga, book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportLayoutPack = useCallback(async () => {
    if (!book) {
      return;
    }

    void queueEditorialGuardedAction('Exportar pack maquetacion', async () => {
      try {
        const { exportBookLayoutPack } = await loadExportModule();
        const path = await exportBookLayoutPack(book.path, book.metadata, orderedChapters);
        setStatus(`Pack maquetacion exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar el pack maquetacion: ${formatUnknownError(error)}`);
      }
    });
  }, [book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportConsultantPack = useCallback(async () => {
    if (!book) {
      return;
    }

    void queueEditorialGuardedAction('Exportar pack consultoria', async () => {
      try {
        const { exportBookConsultantPack } = await loadExportModule();
        const path = await exportBookConsultantPack(book.path, book.metadata, orderedChapters, activeSaga);
        setStatus(`Pack consultoria exportado: ${path}`);
      } catch (error) {
        setStatus(`No se pudo exportar el pack consultoria: ${formatUnknownError(error)}`);
      }
    });
  }, [activeSaga, book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportAllRolePacks = useCallback(async () => {
    if (!book && !activeSaga) {
      setStatus('Abre un libro o una saga para exportar packs por rol.');
      return;
    }

    const runExport = async () => {
      const module = await loadExportModule();
      const done: string[] = [];
      const failed: string[] = [];

      if (activeSaga) {
        try {
          await module.exportSagaCartographerPack(activeSaga.path, activeSaga);
          done.push('cartografo');
        } catch {
          failed.push('cartografo');
        }
      }

      if (book) {
        try {
          await module.exportBookEditorPack(book.path, book.metadata, orderedChapters, activeSaga);
          done.push('editor');
        } catch {
          failed.push('editor');
        }

        try {
          await module.exportBookLayoutPack(book.path, book.metadata, orderedChapters);
          done.push('maquetacion');
        } catch {
          failed.push('maquetacion');
        }

        try {
          await module.exportBookConsultantPack(book.path, book.metadata, orderedChapters, activeSaga);
          done.push('consultoria');
        } catch {
          failed.push('consultoria');
        }
      }

      if (activeSaga) {
        try {
          await module.exportSagaHistorianPack(activeSaga.path, activeSaga);
          done.push('cronologia');
        } catch {
          failed.push('cronologia');
        }

        try {
          await module.exportSagaTimelineInteractive(activeSaga.path, activeSaga);
          done.push('timeline-interactiva');
        } catch {
          failed.push('timeline-interactiva');
        }
      }

      if (done.length === 0) {
        setStatus(`Lote por rol sin exportes exitosos.${failed.length > 0 ? ` Fallaron: ${failed.join(', ')}.` : ''}`);
        return;
      }

      setStatus(
        `Lote por rol exportado (${done.join(', ')}).${failed.length > 0 ? ` Fallaron: ${failed.join(', ')}.` : ''}`,
      );
    };

    if (book) {
      void queueEditorialGuardedAction('Exportar lote de packs por rol', async () => {
        await runExport();
      });
      return;
    }

    try {
      await runExport();
    } catch (error) {
      setStatus(`No se pudo exportar el lote por rol: ${formatUnknownError(error)}`);
    }
  }, [activeSaga, book, orderedChapters, queueEditorialGuardedAction]);

  const handleExportStyleReport = useCallback(async () => {
    if (!book) {
      return;
    }

    const strictBlock = await checkStrictSagaValidationBlockForBook();
    if (strictBlock) {
      setStatus(
        `Exportacion bloqueada por modo estricto en saga "${strictBlock.sagaTitle}": ${strictBlock.errorCount} error(es) de coherencia.`,
      );
      return;
    }

    try {
      const { exportBookStyleReport } = await loadExportModule();
      const path = await exportBookStyleReport(book.path, book.metadata, orderedChapters);
      setStatus(`Reporte de estilo exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar reporte de estilo: ${formatUnknownError(error)}`);
    }
  }, [book, checkStrictSagaValidationBlockForBook, orderedChapters]);

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
        const linkedSagaPath = libraryEntry?.sagaPath ?? null;
        if (book && book.path === bookPath) {
          try {
            await flushChapterSave();
          } catch {
            // Sigue el cierre aunque falle un guardado tardio.
          }
          setBook(null);
          setActiveChapterId(null);
          setMainView((previous) =>
            ((previous === 'saga' || previous === 'timeline' || previous === 'plot' || previous === 'atlas') && activeSaga
              ? previous
              : 'editor'),
          );
          setChatScope('chapter');
          refreshCovers(null);
          dirtyRef.current = false;
          snapshotUndoCursorRef.current = {};
          snapshotRedoStackRef.current = {};
          setSnapshotRedoNonce((value) => value + 1);
          setCanUndoEdit(false);
          setCanRedoEdit(false);
        }

        let nextIndex = await removeBookFromLibrary(bookPath, { deleteFiles: true });
        if (linkedSagaPath) {
          try {
            const refreshedSaga = await loadSagaProject(linkedSagaPath);
            nextIndex = await upsertSagaInLibrary(refreshedSaga);
            setActiveSaga((previous) => (previous && previous.path === refreshedSaga.path ? refreshedSaga : previous));
          } catch {
            // Si la saga no se puede refrescar, dejamos al menos el libro fuera de biblioteca.
          }
        }
        setLibraryIndex(nextIndex);
        setStatus(`Libro eliminado: ${title}`);
      } catch (error) {
        setStatus(`No se pudo eliminar el libro: ${formatUnknownError(error)}`);
      }
    },
    [activeSaga, book, flushChapterSave, libraryIndex.books, refreshCovers],
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
    if (mainView === 'saga-dashboard') {
      return (
        <LazySagaDashboardView
          saga={activeSaga}
          book={book}
          orderedChapters={orderedChapters}
          looseThreads={book?.metadata.looseThreads ?? []}
          onOpenBook={(bookPath) => { void handleOpenLibraryBook(bookPath); }}
          onShowView={(view) => { setMainView(view); }}
        />
      );
    }

    if (mainView === 'saga') {
      return (
        <LazySagaPanel
          saga={activeSaga}
          chapterOptionsByBook={sagaChapterOptionsByBook}
          onChange={handleSagaChange}
          onSave={(nextMetadata) => {
            void handleSaveActiveSaga(nextMetadata);
          }}
          onOpenBook={(bookPath) => {
            void handleOpenLibraryBook(bookPath);
          }}
          onUpdateBookVolume={(bookPath, volumeNumber) => {
            void handleUpdateActiveSagaBookVolume(bookPath, volumeNumber);
          }}
          onMoveBook={(bookPath, direction) => {
            void handleMoveActiveSagaBook(bookPath, direction);
          }}
        />
      );
    }

    if (mainView === 'timeline') {
      return (
        <LazyTimelineView
          saga={activeSagaChronicleView}
          activeSaga={activeSaga}
          onOpenBook={(bookPath) => {
            void handleOpenLibraryBook(bookPath);
          }}
          onUpsertEvent={(event) => { void handleUpsertTimelineEvent(event); }}
          onDeleteEvent={(eventId) => { void handleDeleteTimelineEvent(eventId); }}
          onReorderTimeline={(reordered) => { void handleReorderTimeline(reordered); }}
        />
      );
    }

    if (mainView === 'plot') {
      return (
        <LazyPlotBoardView
          saga={activeSagaChronicleView}
          activeSaga={activeSaga}
          onOpenBook={(bookPath) => {
            void handleOpenLibraryBook(bookPath);
          }}
          onUpsertEvent={(event) => { void handleUpsertTimelineEvent(event); }}
          onDeleteEvent={(eventId) => { void handleDeleteTimelineEvent(eventId); }}
          onPromoteEventToChapter={(eventId) => {
            void handlePromotePlotEventToChapter(eventId);
          }}
        />
      );
    }

    if (mainView === 'relations') {
      return (
        <LazyRelationshipGraphView
          saga={activeSagaChronicleView}
          activeSaga={activeSaga}
          onUpsertRelationship={(rel) => { void handleUpsertRelationship(rel); }}
          onDeleteRelationship={(relId) => { void handleDeleteRelationship(relId); }}
        />
      );
    }

    if (mainView === 'atlas') {
      return (
        <LazyWorldMapView
          saga={activeSaga}
          onChange={handleSagaChange}
          onSave={() => {
            void handleSaveActiveSaga();
          }}
        />
      );
    }

    if (mainView === 'outline') {
      return (
        <LazyOutlineView
          chapters={orderedChapters}
          storyBibleCharacters={book?.metadata.storyBible?.characters ?? []}
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
          onUpdateChapterPov={(chapterId, pointOfView) => {
            void handleUpdateChapterPov(chapterId, pointOfView);
          }}
          onUpdateChapterMeta={(chapterId, patch) => {
            void handleUpdateChapterMeta(chapterId, patch);
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
          onRestoreSnapshot={(chapterId, version) => {
            void handleRestoreSnapshotVersion(chapterId, version);
          }}
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
          hasActiveChapter={Boolean(activeEditorChapter)}
          onChange={handleStoryBibleChange}
          onSyncFromActiveChapter={(baseStoryBible) => {
            void handleSyncStoryBibleFromActiveChapter(baseStoryBible);
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
          useRegex={searchUseRegex}
          patternError={searchPatternError}
          activeChapterId={activeChapterId}
          results={searchMatches}
          totalMatches={searchTotalMatches}
          busy={searchBusy}
          onQueryChange={setSearchQuery}
          onReplacementChange={setReplaceQuery}
          onCaseSensitiveChange={setSearchCaseSensitive}
          onWholeWordChange={setSearchWholeWord}
          onUseRegexChange={setSearchUseRegex}
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
          hasSaga={Boolean(activeSaga)}
          sagaTitle={activeSaga?.metadata.title ?? ''}
          sagaSearchResults={sagaSearchResults}
          sagaSearchTotalMatches={sagaSearchTotalMatches}
          onRunSagaSearch={activeSaga ? handleRunSagaSearch : undefined}
          onOpenSagaBook={(bookPath) => { void handleOpenLibraryBook(bookPath); }}
        />
      );
    }

    if (mainView === 'settings') {
      return (
        <LazySettingsPanel
          key={book?.path ?? 'no-book'}
          config={config}
          bookPath={book?.path ?? null}
          bookAutoApplyReleaseEnabled={RELEASE_BOOK_AUTO_APPLY_ENABLED}
          ollamaStatus={ollamaStatus}
          onChange={setConfig}
          onSave={handleSaveSettings}
          onRefreshOllamaStatus={() => {
            void refreshOllamaStatus();
          }}
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

    if (mainView === 'scratchpad') {
      if (!book) {
        return (
          <section className="editor-pane empty-state">
            <h2>Banco de ideas</h2>
            <p>Abri un libro para usar tus recortes e ideas sueltas.</p>
          </section>
        );
      }
      return (
        <LazyScratchpadView
          scratchpad={book.metadata.scratchpad ?? ''}
          bookTitle={book.metadata.title}
          onSave={handleSaveScratchpad}
        />
      );
    }

    if (mainView === 'loose-threads') {
      if (!book) {
        return (
          <section className="editor-pane empty-state">
            <h2>Hilos abiertos</h2>
            <p>Abri un libro para gestionar los hilos narrativos.</p>
          </section>
        );
      }
      return (
        <LazyLooseThreadsView
          threads={book.metadata.looseThreads ?? []}
          chapters={orderedChapters}
          onAddThread={handleAddLooseThread}
          onUpdateThread={handleUpdateLooseThread}
          onDeleteThread={handleDeleteLooseThread}
        />
      );
    }

    if (mainView === 'char-matrix') {
      if (!book) {
        return (
          <section className="editor-pane empty-state">
            <h2>Matriz Personaje × Capitulo</h2>
            <p>Abri un libro para ver la matriz.</p>
          </section>
        );
      }
      return (
        <LazyCharacterMatrixView
          chapters={orderedChapters}
          characters={book.metadata.storyBible?.characters ?? []}
        />
      );
    }

    if (!activeEditorChapter) {
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
        chapter={activeEditorChapter}
        scrollPersistenceKey={`${book!.path}::${activeEditorChapter.id}`}
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
        editorBackgroundTone={config.editorBackgroundTone}
        continuityHighlightEnabled={continuityHighlightEnabled}
        continuityHighlights={continuityHighlights}
        continuityReport={activeChapterContinuityReport}
        continuityBriefing={activeChapterContinuityBriefing}
        semanticReferenceCharacterCount={semanticReferenceCharacterCount}
        semanticReferenceLocationCount={semanticReferenceLocationCount}
        semanticReferencesCatalog={semanticReferencesCatalog}
        audioPlaybackState={audioPlaybackState}
        manuscriptNotes={activeEditorChapter.manuscriptNotes ?? []}
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
        onEditorBackgroundToneChange={handleEditorBackgroundToneChange}
        onLengthPresetChange={handleChapterLengthPresetChange}
        onContinuityHighlightToggle={setContinuityHighlightEnabled}
        onRefreshContinuityBriefing={handleRefreshContinuityBriefing}
        onContentChange={handleEditorChange}
        onInsertCharacterReference={() => {
          handleInsertSemanticReference('character');
        }}
        onInsertLocationReference={() => {
          handleInsertSemanticReference('location');
        }}
        onLookupLoreFromSelection={handleLookupLoreFromSelection}
        lorePeek={editorLorePeek}
        onOpenLorePeek={handleOpenLorePeek}
        onAddSelectionToLooseThreads={handleAddSelectionToLooseThreads}
        onOpenSemanticReference={handleOpenSemanticReference}
        onAddManuscriptNote={handleAddManuscriptNote}
        onToggleManuscriptNote={(noteId) => {
          void handlePatchActiveChapterManuscriptNote(noteId, 'toggle');
        }}
        onDeleteManuscriptNote={(noteId) => {
          void handlePatchActiveChapterManuscriptNote(noteId, 'delete');
        }}
        onBlur={handleEditorBlur}
      />
    );
  }, [
    activeSaga,
    activeSagaChronicleView,
    activeChapterId,
    activeEditorChapter,
    book,
    config,
    sagaChapterOptionsByBook,
    coverSrc,
    backCoverSrc,
    coverLoadDiagnostics,
    coverFileInfo,
    handleClearBackCover,
    handleClearCover,
    handleChapterLengthPresetChange,
    handleEditorChange,
    handleEditorBlur,
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
    handleOpenLibraryBook,
    handlePromotePlotEventToChapter,
    handlePickBackCover,
    handleFoundationChange,
    handleSagaChange,
    handleMoveActiveSagaBook,
    handleSaveActiveSaga,
    handleSaveFoundation,
    handleStoryBibleChange,
    handleUpdateActiveSagaBookVolume,
    handleSaveStoryBible,
    handleSyncStoryBibleFromActiveChapter,
    handleMoveChapter,
    handleMoveChapterToPosition,
    handleUpdateChapterPov,
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
    handleEditorBackgroundToneChange,
    handleInsertSemanticReference,
    handleLookupLoreFromSelection,
    handleOpenLorePeek,
    handleOpenSemanticReference,
    handleAddSelectionToLooseThreads,
    handleAddManuscriptNote,
    handlePatchActiveChapterManuscriptNote,
    handleRefreshContinuityBriefing,
    handleRestoreSnapshotVersion,
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
    continuityHighlightEnabled,
    continuityHighlights,
    activeChapterContinuityReport,
    activeChapterContinuityBriefing,
    semanticReferenceCharacterCount,
    semanticReferenceLocationCount,
    semanticReferencesCatalog,
    audioPlaybackState,
    canUndoEdit,
    canRedoEdit,
    replaceQuery,
    searchBusy,
    searchCaseSensitive,
    searchMatches,
    searchPatternError,
    searchQuery,
    searchTotalMatches,
    sagaSearchResults,
    sagaSearchTotalMatches,
    searchUseRegex,
    searchWholeWord,
    searchPreviewReport,
    editorLorePeek,
    handleRunSagaSearch,
    handleUpsertTimelineEvent,
    handleDeleteTimelineEvent,
    handleReorderTimeline,
    handleUpsertRelationship,
    handleDeleteRelationship,
    handleSaveScratchpad,
    handleAddLooseThread,
    handleUpdateLooseThread,
    handleDeleteLooseThread,
    handleUpdateChapterMeta,
    ollamaStatus,
    refreshOllamaStatus,
  ]);

  const runExportWithLock = useCallback(
    (label: string, action: () => Promise<void> | void) => {
      if (exportBusy) {
        setStatus(`Ya hay una exportacion en curso. Espera para ejecutar: ${label}.`);
        return;
      }

      setExportBusy(true);
      void Promise.resolve(action())
        .catch((error) => {
          setStatus(`${label}: ${formatUnknownError(error)}`);
        })
        .finally(() => {
          setExportBusy(false);
        });
    },
    [exportBusy],
  );

  return (
    <AppErrorBoundary
      key={errorBoundaryNonce}
      onGoEditor={() => {
        setHelpOpen(false);
        setOnboardingOpen(false);
        setPromptModal(null);
        setMainView('editor');
        setErrorBoundaryNonce((value) => value + 1);
      }}
      onRetry={() => {
        setErrorBoundaryNonce((value) => value + 1);
      }}
      onError={(error) => {
        setStatus(`Error de render detectado: ${formatUnknownError(error)}`);
      }}
    >
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
            hasSaga={Boolean(activeSaga)}
            activeBookPath={book?.path ?? null}
            activeSagaPath={activeSaga?.path ?? null}
            bookTitle={book?.metadata.title ?? 'Sin libro'}
            chapters={orderedChapters}
            libraryBooks={libraryIndex.books}
            librarySagas={libraryIndex.sagas}
            libraryExpanded={libraryExpanded}
            activeChapterId={activeChapterId}
            onToggleLibrary={() => setLibraryExpanded((previous) => !previous)}
            onCreateSaga={handleCreateSaga}
            onOpenLibraryBook={handleOpenLibraryBook}
            onOpenLibraryBookChat={handleOpenLibraryBookChat}
            onOpenLibraryBookAmazon={handleOpenLibraryBookAmazon}
            onOpenLibrarySaga={handleOpenLibrarySaga}
            onAttachActiveBookToSaga={handleAttachActiveBookToSaga}
            onDeleteLibrarySaga={handleDeleteLibrarySaga}
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
            onExportChapter={() => runExportWithLock('Exportar capitulo', handleExportChapter)}
            onExportBookSingle={() => runExportWithLock('Exportar libro unico', handleExportBookSingle)}
            onExportBookSplit={() => runExportWithLock('Exportar libro por capitulos', handleExportBookSplit)}
            onExportAmazonBundle={() => runExportWithLock('Exportar pack Amazon', handleExportAmazonBundle)}
            onExportBookDocx={() => runExportWithLock('Exportar DOCX', handleExportBookDocx)}
            onExportBookPdf={() => runExportWithLock('Exportar PDF', handleExportBookPdf)}
            onExportBookEpub={() => runExportWithLock('Exportar EPUB', handleExportBookEpub)}
            onExportAudiobook={() => runExportWithLock('Exportar audiolibro', handleExportBookAudiobook)}
            onExportCartographerPack={() => runExportWithLock('Exportar pack cartografo', handleExportCartographerPack)}
            onExportEditorPack={() => runExportWithLock('Exportar pack editor', handleExportEditorPack)}
            onExportLayoutPack={() => runExportWithLock('Exportar pack maquetacion', handleExportLayoutPack)}
            onExportConsultantPack={() => runExportWithLock('Exportar pack consultoria', handleExportConsultantPack)}
            onExportHistorianPack={() => runExportWithLock('Exportar pack cronologia', handleExportHistorianPack)}
            onExportTimelineInteractive={() =>
              runExportWithLock('Exportar timeline interactiva', handleExportTimelineInteractive)
            }
            onExportAllRolePacks={() => runExportWithLock('Exportar lote de packs', handleExportAllRolePacks)}
            onExportSagaBible={() => runExportWithLock('Exportar biblia de saga', handleExportSagaBible)}
            onExportCollaborationPatch={() =>
              runExportWithLock('Exportar paquete de edicion', handleExportCollaborationPatch)
            }
            onImportCollaborationPatch={() =>
              runExportWithLock('Importar paquete de edicion', handleImportCollaborationPatch)
            }
            onOpenEditorialChecklist={() =>
              runExportWithLock('Abrir checklist editorial', () => {
                openEditorialChecklist('Continuar de todos modos');
              })
            }
            exportBusy={exportBusy}
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
                    {book.metadata.sagaPath ? (
                      <p>
                        {activeBookSagaTitle}
                        {book.metadata.sagaVolume ? ` | Vol. ${book.metadata.sagaVolume}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="active-book-banner-actions">
                    {activeSaga && (!book.metadata.sagaPath || activeSaga.path !== book.metadata.sagaPath) ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleAttachActiveBookToSaga(activeSaga.path);
                        }}
                        title="Vincula el libro activo a la saga abierta."
                      >
                        Vincular a saga abierta
                      </button>
                    ) : null}
                    {book.metadata.sagaPath ? (
                      <button
                        type="button"
                        onClick={() => {
                          const sagaPath = book.metadata.sagaPath;
                          if (!sagaPath) {
                            return;
                          }
                          void handleOpenLibrarySaga(sagaPath);
                        }}
                        title="Abre la saga vinculada en el planificador."
                      >
                        Abrir saga
                      </button>
                    ) : null}
                    {book.metadata.sagaPath ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleDetachActiveBookFromSaga();
                        }}
                        title="Quita este libro de la saga actual."
                      >
                        Quitar de saga
                      </button>
                    ) : null}
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
                      title={
                        config.expertWriterMode
                          ? 'Abre la puesta a punto profesional del proyecto.'
                          : 'Abre la guia inicial con checklist y recorrido paso a paso.'
                      }
                    >
                      {config.expertWriterMode ? 'Inicio rapido' : 'Guia inicial'}
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
                      title={
                        config.expertWriterMode
                          ? 'Abre la puesta a punto profesional del proyecto.'
                          : 'Abre la guia inicial con checklist y recorrido paso a paso.'
                      }
                    >
                      {config.expertWriterMode ? 'Inicio rapido' : 'Guia inicial'}
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
              hasSaga={Boolean(activeSaga)}
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
              onShowSaga={() => setMainView('saga')}
              onShowSagaDashboard={() => setMainView('saga-dashboard')}
              onShowTimeline={() => setMainView('timeline')}
              onShowPlot={() => setMainView('plot')}
              onShowRelations={() => setMainView('relations')}
              onShowAtlas={() => setMainView('atlas')}
              onShowAmazon={() => setMainView('amazon')}
              onShowSearch={() => setMainView('search')}
              onShowSettings={() => setMainView('settings')}
              onShowLanguage={() => setMainView('language')}
              onShowScratchpad={() => setMainView('scratchpad')}
              onShowLooseThreads={() => setMainView('loose-threads')}
              onShowCharMatrix={() => setMainView('char-matrix')}
              onQuitApp={handleQuitApp}
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
                canRollbackAiSession={Boolean(lastAiRollbackSession && book && lastAiRollbackSession.bookPath === book.path)}
                scope={chatScope}
                chapterLengthInfo={chapterLengthInfo}
                bookLengthInfo={bookLengthInfo}
                messages={currentMessages}
                autoApplyChatChanges={config.autoApplyChatChanges}
                bookAutoApplyEnabled={config.bookAutoApplyEnabled}
                bookAutoApplyReleaseEnabled={RELEASE_BOOK_AUTO_APPLY_ENABLED}
                chatApplyIterations={config.chatApplyIterations}
                continuousAgentEnabled={config.continuousAgentEnabled}
                continuousAgentMaxRounds={config.continuousAgentMaxRounds}
                promptTemplates={promptTemplates}
                ollamaStatus={ollamaStatus}
                contextSummary={aiContextSummary}
                assistantMode={aiAssistantMode}
                onScopeChange={setChatScope}
                onAssistantModeChange={setAiAssistantMode}
                onRefreshOllamaStatus={() => {
                  void refreshOllamaStatus();
                }}
                onRunAction={handleRunAction}
                onSendChat={handleSendChat}
                onTrackCharacter={handleTrackCharacter}
                onSummarizeStory={handleSummarizeStory}
                chapterCount={orderedChapters.length}
                onUndoSnapshot={handleUndoSnapshot}
                onRedoSnapshot={handleRedoSnapshot}
                onRollbackAiSession={handleRollbackAiSession}
                onSaveMilestone={handleSaveMilestone}
                onCreatePromptTemplate={handleCreatePromptTemplate}
                onDeletePromptTemplate={handleDeletePromptTemplate}
                onContextJump={handleContextJump}
              />
            </Suspense>
          ) : (
            <section className="ai-panel">
              <header>
                <h2>Asistente IA</h2>
                <p>Abri un libro para activar chat, acciones y versiones IA.</p>
              </header>
            </section>
          )
        }
        status={book ? `Libro activo: ${book.metadata.title} | ${status}` : status}
      />
      <Suspense fallback={null}>
        <LazyOnboardingPanel
          isOpen={onboardingOpen}
          expertMode={config.expertWriterMode}
          backupGuardMode={onboardingBackupGuardMode}
          hasBook={Boolean(book)}
          hasBackupConfigured={hasBackupConfigured}
          hasChapters={orderedChapters.length > 0}
          hasWritingStarted={hasMeaningfulWriting}
          hasFoundation={hasFoundationData}
          hasStoryBible={hasStoryBibleData}
          onClose={handleOnboardingClose}
          onDismissForever={handleOnboardingDismissForever}
          onBackupGuardModeChange={handleOnboardingBackupGuardModeChange}
          onConfigureBackup={() => {
            setMainView('settings');
            void handlePickBackupDirectory();
          }}
          onCreateBook={() => {
            if (enforceBackupGate && !hasBackupConfigured) {
              setMainView('settings');
              setStatus('Configura una carpeta de backup antes de crear el libro.');
              return;
            }
            setOnboardingOpen(false);
            void handleCreateBook('blank');
          }}
          onCreateSagaTemplateBook={() => {
            if (enforceBackupGate && !hasBackupConfigured) {
              setMainView('settings');
              setStatus('Configura una carpeta de backup antes de crear la plantilla.');
              return;
            }
            setOnboardingOpen(false);
            void handleCreateBook('saga');
          }}
          onOpenBook={() => {
            if (enforceBackupGate && !hasBackupConfigured) {
              setMainView('settings');
              setStatus('Configura una carpeta de backup antes de abrir un libro.');
              return;
            }
            setOnboardingOpen(false);
            void handleOpenBook();
          }}
          onGoToView={(view) => {
            setMainView(view);
          }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <LazyHelpPanel
          isOpen={helpOpen}
          hasBook={Boolean(book)}
          hasSaga={Boolean(activeSaga)}
          focusMode={focusMode}
          onClose={() => setHelpOpen(false)}
          onCreateBook={() => {
            void handleCreateBook();
          }}
          onOpenBook={() => {
            void handleOpenBook();
          }}
          onOpenStarterGuide={() => {
            setHelpOpen(false);
            setOnboardingOpen(true);
          }}
          onGoToView={(view) => {
            setHelpOpen(false);
            setMainView(view);
          }}
          onToggleFocusMode={toggleFocusMode}
        />
      </Suspense>
      <Suspense fallback={null}>
        {aiSafeReview ? (
          <LazyChangeReviewModal
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
        <LazyEditorialChecklistModal
          isOpen={editorialIntent.isOpen}
          report={editorialIntent.isOpen ? editorialChecklistReport : null}
          customItems={book?.metadata.editorialChecklistCustom ?? []}
          intentLabel={editorialIntent.intentLabel}
          allowProceed={Boolean(editorialChecklistReport?.isReady)}
          onClose={closeEditorialChecklist}
          onProceed={() => {
            const proceed = editorialIntent.onProceed;
            closeEditorialChecklist();
            proceed?.();
          }}
          onAddCustomItem={(input) => {
            void handleAddEditorialChecklistItem(input);
          }}
          onToggleCustomItem={(id) => {
            void handleToggleEditorialChecklistItem(id);
          }}
          onDeleteCustomItem={(id) => {
            void handleDeleteEditorialChecklistItem(id);
          }}
        />
        {promptModal && (
          <LazyPromptModal
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
      </Suspense>
      </>
    </AppErrorBoundary>
  );
}

export default App;
