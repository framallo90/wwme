import { countWordsFromHtml } from './metrics';
import { stripHtml } from './text';
import { buildStoryBibleBlock } from './prompts';
import type { ChapterDocument, StoryBible } from '../types/book';
import type { NormalizedChapterRange } from './chapterRange';

const SENTENCE_SPLIT_PATTERN = /(?<=[.!?])\s+/g;
const ACTION_TERMS = [
  'descubre',
  'encuentra',
  'revela',
  'escapa',
  'ataca',
  'decide',
  'confiesa',
  'oculta',
  'investiga',
  'traiciona',
  'negocia',
  'enfrenta',
  'pierde',
  'gana',
  'mata',
  'rescata',
  'huye',
  'regresa',
  'acuerda',
  'rompe',
  'promete',
];

interface RankedSentence {
  value: string;
  score: number;
}

export interface StoryProgressChapterDigest {
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  wordCount: number;
  highlights: string[];
}

export interface StoryProgressDigest {
  chapters: StoryProgressChapterDigest[];
  totalWords: number;
  totalHighlights: number;
}

interface BuildDigestInput {
  chapters: ChapterDocument[];
  storyBible: StoryBible;
  maxHighlightsPerChapter?: number;
}

interface StoryProgressPromptInput {
  bookTitle: string;
  language: string;
  storyBible: StoryBible;
  range: NormalizedChapterRange;
  digest: StoryProgressDigest;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function splitSentences(value: string): string[] {
  return value
    .replace(/\r\n/g, '\n')
    .split(SENTENCE_SPLIT_PATTERN)
    .map((item) => item.trim())
    .filter((item) => item.length >= 28);
}

function clipSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 230) {
    return cleaned;
  }
  return `${cleaned.slice(0, 227).trimEnd()}...`;
}

function extractStoryTerms(storyBible: StoryBible): string[] {
  const terms = new Set<string>();
  const addTerm = (value: string) => {
    const normalized = normalize(value).trim();
    if (!normalized || normalized.length < 3) {
      return;
    }
    terms.add(normalized);
  };

  for (const character of storyBible.characters) {
    addTerm(character.name);
    for (const alias of character.aliases.split(/[,\n;|]+/g)) {
      addTerm(alias);
    }
  }

  for (const location of storyBible.locations) {
    addTerm(location.name);
    for (const alias of location.aliases.split(/[,\n;|]+/g)) {
      addTerm(alias);
    }
  }

  return Array.from(terms);
}

function scoreSentence(sentence: string, terms: string[]): number {
  const normalizedSentence = normalize(sentence);
  let score = 0;

  for (const term of terms) {
    if (normalizedSentence.includes(term)) {
      score += term.includes(' ') ? 3 : 2;
    }
  }

  for (const action of ACTION_TERMS) {
    if (normalizedSentence.includes(action)) {
      score += 1.4;
    }
  }

  if (sentence.length >= 45 && sentence.length <= 220) {
    score += 1;
  }

  return score;
}

function pickHighlights(text: string, terms: string[], maxHighlights: number): string[] {
  const ranked: RankedSentence[] = splitSentences(text)
    .map((sentence) => ({
      value: clipSentence(sentence),
      score: scoreSentence(sentence, terms),
    }))
    .filter((item) => item.value.length > 0)
    .sort((left, right) => right.score - left.score);

  const highlights: string[] = [];
  const seen = new Set<string>();

  for (const candidate of ranked) {
    if (highlights.length >= maxHighlights) {
      break;
    }
    const key = normalize(candidate.value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    highlights.push(candidate.value);
  }

  if (highlights.length > 0) {
    return highlights;
  }

  const fallbackSentences = splitSentences(text).slice(0, maxHighlights);
  return fallbackSentences.map(clipSentence);
}

export function buildStoryProgressDigest(input: BuildDigestInput): StoryProgressDigest {
  const maxHighlightsPerChapter = Math.max(1, Math.min(4, input.maxHighlightsPerChapter ?? 2));
  const terms = extractStoryTerms(input.storyBible);
  const chapters: StoryProgressChapterDigest[] = [];
  let totalWords = 0;
  let totalHighlights = 0;

  for (let index = 0; index < input.chapters.length; index += 1) {
    const chapter = input.chapters[index];
    const chapterText = stripHtml(chapter.content);
    const wordCount = countWordsFromHtml(chapter.content);
    const highlights = pickHighlights(chapterText, terms, maxHighlightsPerChapter);
    totalWords += wordCount;
    totalHighlights += highlights.length;

    chapters.push({
      chapterId: chapter.id,
      chapterIndex: index + 1,
      chapterTitle: chapter.title,
      wordCount,
      highlights,
    });
  }

  return {
    chapters,
    totalWords,
    totalHighlights,
  };
}

function formatDigestForPrompt(digest: StoryProgressDigest): string {
  const lines: string[] = [];
  for (const chapter of digest.chapters) {
    lines.push(`Capitulo ${chapter.chapterIndex} - ${chapter.chapterTitle} (${chapter.wordCount} palabras)`);
    if (chapter.highlights.length === 0) {
      lines.push('- (sin hitos detectados)');
      continue;
    }
    for (const highlight of chapter.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function buildStoryProgressPrompt(input: StoryProgressPromptInput): string {
  const digestBlock = formatDigestForPrompt(input.digest);
  const storyBibleBlock = buildStoryBibleBlock(input.storyBible);

  return [
    `MODO: resumen de progreso narrativo del libro "${input.bookTitle}".`,
    `Idioma de salida obligatorio: ${input.language}.`,
    `Rango analizado: capitulos ${input.range.label}.`,
    '',
    'OBJETIVO:',
    '- Resumir de forma cronologica los hechos mas relevantes desde el inicio hasta el estado actual.',
    '- Mantener coherencia con personajes y lugares definidos.',
    '',
    'FORMATO DE SALIDA OBLIGATORIO:',
    '1) Resumen ejecutivo (6-10 lineas).',
    '2) Linea de tiempo por hitos (bullets cortos, orden cronologico).',
    '3) Estado actual de personajes clave (quien cambio y como).',
    '4) Cabos abiertos / conflictos pendientes.',
    '',
    storyBibleBlock,
    '',
    'HITOS POR CAPITULO:',
    digestBlock || '(sin hitos detectados)',
    '',
    'No inventes capitulos ni eventos no presentes en los hitos.',
  ].join('\n');
}

export function formatStoryProgressFallback(
  bookTitle: string,
  range: NormalizedChapterRange,
  digest: StoryProgressDigest,
): string {
  if (digest.chapters.length === 0) {
    return `Resumen historia - ${bookTitle}\nNo hay capitulos en el rango seleccionado (${range.label}).`;
  }

  const lines: string[] = [
    `Resumen historia - ${bookTitle}`,
    `Rango: capitulos ${range.label}`,
    `Capitulos analizados: ${digest.chapters.length} | Palabras aproximadas: ${digest.totalWords}`,
    '',
    'Hechos relevantes detectados:',
  ];

  for (const chapter of digest.chapters) {
    lines.push(`Capitulo ${chapter.chapterIndex} - ${chapter.chapterTitle}`);
    if (chapter.highlights.length === 0) {
      lines.push('- (sin eventos destacados detectados)');
      continue;
    }
    for (const highlight of chapter.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
