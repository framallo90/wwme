import type { ChapterDocument, LooseThread, StoryBible } from '../types/book';
import { buildContinuityGuardReport, type ContinuityIssue } from './continuityGuard';
import { stripHtml } from './text';

export interface ChapterContinuityBriefingEntity {
  id: string;
  kind: 'character' | 'location';
  label: string;
  occurrences: number;
  lastMentionChapterId: string | null;
  lastMentionChapterTitle: string | null;
  chaptersAgo: number | null;
}

export interface ChapterContinuityBriefingThread {
  id: string;
  title: string;
  description: string;
  chapterRefId: string | null;
  chapterRefTitle: string | null;
  updatedAt: string;
}

export interface ChapterContinuityBriefing {
  source: 'active' | 'previous';
  sourceChapterId: string;
  sourceChapterTitle: string;
  pointOfView: string;
  synopsis: string;
  characters: ChapterContinuityBriefingEntity[];
  locations: ChapterContinuityBriefingEntity[];
  openThreads: ChapterContinuityBriefingThread[];
  alerts: ContinuityIssue[];
}

interface BuildChapterContinuityBriefingInput {
  chapters: ChapterDocument[];
  activeChapterId: string | null;
  storyBible: StoryBible | null;
  looseThreads?: LooseThread[] | null;
}

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function chapterIncludesEntity(chapter: ChapterDocument, terms: string[]): boolean {
  if (terms.length === 0) {
    return false;
  }

  const haystack = normalizeLookupValue(stripHtml(chapter.content));
  if (!haystack) {
    return false;
  }

  return terms.some((term) => haystack.includes(normalizeLookupValue(term)));
}

function buildEntityTerms(
  storyBible: StoryBible,
  kind: 'character' | 'location',
  id: string,
  label: string,
): string[] {
  if (kind === 'character') {
    const entry = storyBible.characters.find((candidate) => candidate.id === id || candidate.name === label);
    return [entry?.name ?? label, ...(entry?.aliases ?? '').split(',')].map((value) => value.trim()).filter(Boolean);
  }

  const entry = storyBible.locations.find((candidate) => candidate.id === id || candidate.name === label);
  return [entry?.name ?? label, ...(entry?.aliases ?? '').split(',')].map((value) => value.trim()).filter(Boolean);
}

function resolveSourceChapter(chapters: ChapterDocument[], activeIndex: number): { chapter: ChapterDocument; index: number; source: 'active' | 'previous' } {
  const activeChapter = chapters[activeIndex];
  const activeText = stripHtml(activeChapter.content).trim();
  const shouldFallbackToPrevious = activeText.length < 40 && activeIndex > 0;
  if (shouldFallbackToPrevious) {
    return {
      chapter: chapters[activeIndex - 1],
      index: activeIndex - 1,
      source: 'previous',
    };
  }

  return {
    chapter: activeChapter,
    index: activeIndex,
    source: 'active',
  };
}

export function buildChapterContinuityBriefing(
  input: BuildChapterContinuityBriefingInput,
): ChapterContinuityBriefing | null {
  if (!input.storyBible || !input.activeChapterId || input.chapters.length === 0) {
    return null;
  }

  const activeIndex = input.chapters.findIndex((chapter) => chapter.id === input.activeChapterId);
  if (activeIndex < 0) {
    return null;
  }

  const sourceChapterState = resolveSourceChapter(input.chapters, activeIndex);
  const sourceChapter = sourceChapterState.chapter;
  const sourceIndex = sourceChapterState.index;
  const priorChapterTexts =
    sourceIndex > 0
      ? input.chapters
          .slice(Math.max(0, sourceIndex - 8), sourceIndex)
          .map((chapter) => stripHtml(chapter.content))
      : [];
  const report = buildContinuityGuardReport({
    chapterText: stripHtml(sourceChapter.content),
    storyBible: input.storyBible,
    chapterNumber: sourceIndex + 1,
    priorChapterTexts,
  });

  const buildEntities = (kind: 'character' | 'location', limit: number): ChapterContinuityBriefingEntity[] =>
    report.mentions
      .filter((entry) => entry.kind === kind)
      .sort((left, right) => right.occurrences - left.occurrences || left.label.localeCompare(right.label))
      .slice(0, limit)
      .map((entry) => {
        const terms = buildEntityTerms(input.storyBible!, kind, entry.id, entry.label);
        let lastMentionChapterId: string | null = null;
        let lastMentionChapterTitle: string | null = null;
        let chaptersAgo: number | null = null;

        for (let index = sourceIndex; index >= 0; index -= 1) {
          const chapter = input.chapters[index];
          if (!chapterIncludesEntity(chapter, terms)) {
            continue;
          }

          lastMentionChapterId = chapter.id;
          lastMentionChapterTitle = chapter.title;
          chaptersAgo = activeIndex - index;
          break;
        }

        return {
          id: entry.id,
          kind,
          label: entry.label,
          occurrences: entry.occurrences,
          lastMentionChapterId,
          lastMentionChapterTitle,
          chaptersAgo,
        };
      });

  const chapterTitleById = new Map(input.chapters.map((chapter) => [chapter.id, chapter.title]));
  const chapterIndexById = new Map(input.chapters.map((chapter, index) => [chapter.id, index]));
  const openThreads = (input.looseThreads ?? [])
    .filter((thread) => thread.status === 'open')
    .slice()
    .sort((left, right) => {
      const leftIndex = left.chapterRef ? (chapterIndexById.get(left.chapterRef) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      const rightIndex = right.chapterRef ? (chapterIndexById.get(right.chapterRef) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      const leftDistance = Number.isFinite(leftIndex) ? Math.abs(activeIndex - leftIndex) : Number.POSITIVE_INFINITY;
      const rightDistance = Number.isFinite(rightIndex) ? Math.abs(activeIndex - rightIndex) : Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 4)
    .map((thread) => ({
      id: thread.id,
      title: thread.title,
      description: thread.description,
      chapterRefId: thread.chapterRef ?? null,
      chapterRefTitle: thread.chapterRef ? chapterTitleById.get(thread.chapterRef) ?? null : null,
      updatedAt: thread.updatedAt,
    }));

  return {
    source: sourceChapterState.source,
    sourceChapterId: sourceChapter.id,
    sourceChapterTitle: sourceChapter.title,
    pointOfView: sourceChapter.pointOfView?.trim() ?? '',
    synopsis: sourceChapter.synopsis?.trim() ?? '',
    characters: buildEntities('character', 4),
    locations: buildEntities('location', 3),
    openThreads,
    alerts: report.issues.slice(0, 4),
  };
}
