import { countWordsFromPlainText } from './metrics';
import { stripHtml } from './text';
import type { ChapterDocument } from '../types/book';

export type StyleLevel = 'ok' | 'warn' | 'alert';

export interface StyleRepetitionEntry {
  term: string;
  count: number;
  perThousand: number;
}

export interface StyleAnalysis {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  readingMinutes: number;
  topRepetitions: StyleRepetitionEntry[];
  sentenceLengthLevel: StyleLevel;
  repetitionLevel: StyleLevel;
  overallLevel: StyleLevel;
}

export interface ChapterStyleAnalysis {
  chapterId: string;
  title: string;
  analysis: StyleAnalysis;
}

export interface BookStyleAnalysis {
  book: StyleAnalysis;
  chapters: ChapterStyleAnalysis[];
}

const READING_WORDS_PER_MINUTE = 200;
const TOP_REPETITIONS_LIMIT = 10;
const TOKEN_PATTERN = /[\p{L}\p{N}']+/gu;

const STOPWORDS = new Set<string>([
  'about', 'after', 'again', 'also', 'aunque', 'because', 'been', 'before', 'being', 'between',
  'cada', 'como', 'cuando', 'de', 'del', 'desde', 'donde', 'during', 'each', 'ella', 'ellas',
  'ellos', 'entre', 'esta', 'estar', 'este', 'esto', 'estos', 'fue', 'han', 'hasta', 'have',
  'having', 'into', 'just', 'la', 'las', 'los', 'mas', 'menos', 'mucho', 'muy', 'para', 'pero',
  'por', 'porque', 'que', 'quien', 'ser', 'sobre', 'solo', 'some', 'such', 'sus', 'tambien',
  'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'una', 'uno',
  'unos', 'unas', 'usted', 'ustedes', 'very', 'with', 'without', 'your',
]);

const LEVEL_WEIGHT: Record<StyleLevel, number> = {
  ok: 0,
  warn: 1,
  alert: 2,
};

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function countSentences(plainText: string): number {
  const trimmed = plainText.trim();
  if (!trimmed) {
    return 0;
  }

  const sentenceLike = trimmed
    .replace(/\r\n/g, '\n')
    .split(/[.!?]+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentenceLike.length > 0) {
    return sentenceLike.length;
  }

  return countWordsFromPlainText(trimmed) > 0 ? 1 : 0;
}

function extractTokens(plainText: string): string[] {
  const raw = plainText.match(TOKEN_PATTERN);
  if (!raw) {
    return [];
  }

  return raw.map(normalizeToken);
}

function resolveSentenceLengthLevel(avgWordsPerSentence: number, sentenceCount: number, wordCount: number): StyleLevel {
  if (wordCount === 0 || sentenceCount === 0) {
    return 'ok';
  }

  if (avgWordsPerSentence < 6 || avgWordsPerSentence > 35) {
    return 'alert';
  }

  if (avgWordsPerSentence < 8 || avgWordsPerSentence > 28) {
    return 'warn';
  }

  return 'ok';
}

function resolveRepetitionLevel(topRepetitions: StyleRepetitionEntry[]): StyleLevel {
  if (topRepetitions.length === 0) {
    return 'ok';
  }

  const strongest = topRepetitions[0];
  if (strongest.perThousand >= 45) {
    return 'alert';
  }

  if (strongest.perThousand >= 30) {
    return 'warn';
  }

  return 'ok';
}

function resolveOverallLevel(levels: StyleLevel[]): StyleLevel {
  let maxLevel: StyleLevel = 'ok';
  for (const level of levels) {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[maxLevel]) {
      maxLevel = level;
    }
  }
  return maxLevel;
}

function buildTopRepetitions(tokens: string[], wordCount: number): StyleRepetitionEntry[] {
  if (tokens.length === 0 || wordCount === 0) {
    return [];
  }

  const counter = new Map<string, number>();
  for (const token of tokens) {
    if (token.length < 4 || STOPWORDS.has(token)) {
      continue;
    }

    counter.set(token, (counter.get(token) ?? 0) + 1);
  }

  return Array.from(counter.entries())
    .filter(([, count]) => count >= 2)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, TOP_REPETITIONS_LIMIT)
    .map(([term, count]) => ({
      term,
      count,
      perThousand: Number(((count / wordCount) * 1000).toFixed(1)),
    }));
}

export function analyzePlainTextStyle(plainText: string): StyleAnalysis {
  const normalizedText = plainText.trim();
  const wordCount = countWordsFromPlainText(normalizedText);
  const sentenceCount = countSentences(normalizedText);
  const avgWordsPerSentence = sentenceCount > 0 ? Number((wordCount / sentenceCount).toFixed(1)) : 0;
  const readingMinutes = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / READING_WORDS_PER_MINUTE)) : 0;
  const tokens = extractTokens(normalizedText);
  const topRepetitions = buildTopRepetitions(tokens, wordCount);
  const sentenceLengthLevel = resolveSentenceLengthLevel(avgWordsPerSentence, sentenceCount, wordCount);
  const repetitionLevel = resolveRepetitionLevel(topRepetitions);
  const overallLevel = resolveOverallLevel([sentenceLengthLevel, repetitionLevel]);

  return {
    wordCount,
    sentenceCount,
    avgWordsPerSentence,
    readingMinutes,
    topRepetitions,
    sentenceLengthLevel,
    repetitionLevel,
    overallLevel,
  };
}

export function analyzeHtmlStyle(html: string): StyleAnalysis {
  return analyzePlainTextStyle(stripHtml(html));
}

export function analyzeBookStyleFromChapters(chapters: ChapterDocument[]): BookStyleAnalysis {
  const chapterReports: ChapterStyleAnalysis[] = chapters.map((chapter) => ({
    chapterId: chapter.id,
    title: chapter.title,
    analysis: analyzeHtmlStyle(chapter.content),
  }));

  const bookText = chapters.map((chapter) => stripHtml(chapter.content)).join('\n\n');
  const book = analyzePlainTextStyle(bookText);

  return {
    book,
    chapters: chapterReports,
  };
}

export function getStyleLevelLabel(level: StyleLevel): string {
  if (level === 'alert') {
    return 'Alerta';
  }

  if (level === 'warn') {
    return 'Revision';
  }

  return 'OK';
}
