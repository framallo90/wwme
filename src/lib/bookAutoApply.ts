import { buildAutoRewritePrompt, selectStoryBibleForPrompt } from './prompts';
import { saveChapter, saveChapterSnapshot } from './storage';
import { getNowIso, plainTextToHtml, stripHtml } from './text';
import type { AppConfig, BookProject, SagaWorldBible } from '../types/book';

interface ExpansionGuardLikeResult {
  text: string;
  summaryText: string;
  corrected: boolean;
  highRisk: boolean;
  riskReason: string;
}

interface ContinuityGuardLikeResult {
  text: string;
  summaryText: string;
  corrected: boolean;
  highRisk: boolean;
  riskReason: string;
}

interface SagaPromptContext {
  sagaTitle: string | null;
  sagaWorld: SagaWorldBible | null;
}

interface BuildSagaPromptContextOptions {
  recentText?: string;
  recencyWeight?: number;
  maxEntitiesPerSection?: number;
  maxTimelineEvents?: number;
}

interface AiSafeReviewInput {
  title: string;
  subtitle: string;
  beforeText: string;
  afterText: string;
}

interface ApplyBookAutoRewriteInput {
  book: BookProject;
  config: AppConfig;
  message: string;
  iterations: number;
  activeLanguage: string;
  compactHistory: string;
  buildBookContext: (book: BookProject, chaptersOverride?: BookProject['chapters']) => string;
  buildSagaPromptContext: (focusText: string, options?: BuildSagaPromptContextOptions) => SagaPromptContext;
  generateText: (prompt: string) => Promise<string>;
  enforceExpansionResult: (input: {
    actionId: null;
    instruction: string;
    originalText: string;
    candidateText: string;
    bookTitle: string;
    chapterTitle: string;
  }) => Promise<ExpansionGuardLikeResult>;
  enforceContinuityResult: (input: {
    userInstruction: string;
    originalText: string;
    candidateText: string;
    chapterTitle: string;
    recentText: string;
  }) => Promise<ContinuityGuardLikeResult>;
  shouldRequireAiSafeReview: (beforeText: string, afterText: string) => boolean;
  requestAiSafeReview: (input: AiSafeReviewInput) => Promise<boolean>;
  onStatus: (status: string) => void;
}

export interface ApplyBookAutoRewriteResult {
  workingChapters: BookProject['chapters'];
  extractedSummaries: number;
  continuityCorrections: number;
  appliedChapterUpdates: number;
  appliedChapterIds: string[];
  cancelledBySafeMode: boolean;
  cancelledByRiskReview: boolean;
}

export async function applyBookAutoRewrite(
  input: ApplyBookAutoRewriteInput,
): Promise<ApplyBookAutoRewriteResult> {
  let workingChapters: BookProject['chapters'] = { ...input.book.chapters };
  let extractedSummaries = 0;
  let continuityCorrections = 0;
  let appliedChapterUpdates = 0;
  const appliedChapterIdsSet = new Set<string>();
  let cancelledBySafeMode = false;
  let cancelledByRiskReview = false;

  bookIterationsLoop: for (let iteration = 1; iteration <= input.iterations; iteration += 1) {
    for (let index = 0; index < input.book.metadata.chapterOrder.length; index += 1) {
      const chapterId = input.book.metadata.chapterOrder[index];
      const chapter = workingChapters[chapterId];
      if (!chapter) {
        continue;
      }

      if (input.config.autoVersioning) {
        await saveChapterSnapshot(
          input.book.path,
          chapter,
          `Chat auto-aplicar libro cap ${index + 1} iter ${iteration}/${input.iterations}`,
        );
      }

      const currentChapterText = stripHtml(chapter.content);
      const storyBibleForChapter = selectStoryBibleForPrompt(
        input.book.metadata.storyBible,
        `${input.message}\n${chapter.title}\n${currentChapterText}`,
        {
          recentText: input.compactHistory,
          recencyWeight: 1.2,
        },
      );
      const sagaContextForChapter = input.buildSagaPromptContext(
        `${input.message}\n${chapter.title}\n${currentChapterText}`,
        {
          recentText: input.compactHistory,
          recencyWeight: 1.2,
        },
      );
      const prompt = buildAutoRewritePrompt({
        userInstruction: input.message,
        bookTitle: input.book.metadata.title,
        language: input.activeLanguage,
        foundation: input.book.metadata.foundation,
        storyBible: storyBibleForChapter,
        sagaTitle: sagaContextForChapter.sagaTitle,
        sagaWorld: sagaContextForChapter.sagaWorld,
        chapterTitle: chapter.title,
        chapterLengthPreset: chapter.lengthPreset,
        chapterText: currentChapterText,
        fullBookText: input.buildBookContext(input.book, workingChapters),
        chapterIndex: index + 1,
        chapterTotal: input.book.metadata.chapterOrder.length,
        iteration,
        totalIterations: input.iterations,
      });

      const response = await input.generateText(prompt);
      const guardedResult = await input.enforceExpansionResult({
        actionId: null,
        instruction: input.message,
        originalText: currentChapterText,
        candidateText: response,
        bookTitle: input.book.metadata.title,
        chapterTitle: chapter.title,
      });
      const continuityResult = await input.enforceContinuityResult({
        userInstruction: input.message,
        originalText: currentChapterText,
        candidateText: guardedResult.text,
        chapterTitle: chapter.title,
        recentText: input.compactHistory,
      });
      const nextChapterText = continuityResult.text;
      if (guardedResult.summaryText) {
        extractedSummaries += 1;
      }
      if (continuityResult.corrected) {
        continuityCorrections += 1;
      }

      const requiresHighRiskReview = guardedResult.highRisk || continuityResult.highRisk;
      const requiresSafeModeReview =
        input.config.aiSafeMode &&
        input.shouldRequireAiSafeReview(currentChapterText, nextChapterText);
      if (requiresHighRiskReview || requiresSafeModeReview) {
        const riskReasons = [guardedResult.riskReason, continuityResult.riskReason]
          .map((entry) => entry.trim())
          .filter(Boolean)
          .join(' | ');
        const approved = await input.requestAiSafeReview({
          title: requiresHighRiskReview
            ? `Riesgo alto IA - Libro (${chapter.title})`
            : `Modo seguro IA - Libro (${chapter.title})`,
          subtitle: requiresHighRiskReview
            ? `Riesgo alto detectado en cap ${index + 1}/${input.book.metadata.chapterOrder.length}, iter ${iteration}/${input.iterations}. ${riskReasons || 'Requiere aprobacion manual antes de aplicar.'}`
            : `Chat auto-aplicar cap ${index + 1}/${input.book.metadata.chapterOrder.length}, iter ${iteration}/${input.iterations}.`,
          beforeText: currentChapterText,
          afterText: nextChapterText,
        });
        if (!approved) {
          cancelledBySafeMode = true;
          cancelledByRiskReview = requiresHighRiskReview;
          input.onStatus(
            requiresHighRiskReview
              ? 'Riesgo alto IA: cambio cancelado durante auto-aplicado de libro.'
              : 'Modo seguro IA: cambio cancelado durante auto-aplicado de libro.',
          );
          break bookIterationsLoop;
        }
      }

      const chapterDraft = {
        ...chapter,
        content: plainTextToHtml(nextChapterText),
        contentJson: null,
        updatedAt: getNowIso(),
      };
      const persisted = await saveChapter(input.book.path, chapterDraft);
      workingChapters = {
        ...workingChapters,
        [chapterId]: persisted,
      };
      appliedChapterUpdates += 1;
      appliedChapterIdsSet.add(chapterId);

      input.onStatus(
        `Aplicando cambios al libro: cap ${index + 1}/${input.book.metadata.chapterOrder.length}, iter ${iteration}/${input.iterations}...`,
      );
    }
  }

  return {
    workingChapters,
    extractedSummaries,
    continuityCorrections,
    appliedChapterUpdates,
    appliedChapterIds: Array.from(appliedChapterIdsSet),
    cancelledBySafeMode,
    cancelledByRiskReview,
  };
}
