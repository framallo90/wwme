import type { ChapterDocument, StoryBible } from '../types/book';
import { stripHtml } from './text';

export interface CharacterTrackingMention {
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  excerpt: string;
}

export interface CharacterTrackingReport {
  requestedName: string;
  canonicalName: string | null;
  trackedTerms: string[];
  mentions: CharacterTrackingMention[];
  mentionsByChapter: Array<{
    chapterId: string;
    chapterTitle: string;
    chapterIndex: number;
    mentions: CharacterTrackingMention[];
  }>;
}

interface BuildCharacterTrackingInput {
  requestedName: string;
  chapters: ChapterDocument[];
  storyBible: StoryBible;
  maxMentions?: number;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAliases(value: string): string[] {
  return value
    .split(/[,\n;|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesNormalizedTerm(text: string, term: string): boolean {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) {
    return false;
  }
  return normalizedText.includes(` ${normalizedTerm} `);
}

function splitSentences(value: string): string[] {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/([.!?])\s+/g, '$1\n')
    .split(/\n+/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  return normalized;
}

function shortenExcerpt(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 230) {
    return trimmed;
  }
  return `${trimmed.slice(0, 227).trimEnd()}...`;
}

function resolveTrackedTerms(requestedName: string, storyBible: StoryBible): { canonicalName: string | null; terms: string[] } {
  const requested = requestedName.trim();
  const normalizedRequested = normalize(requested);
  if (!normalizedRequested) {
    return { canonicalName: null, terms: [] };
  }

  let bestMatch: StoryBible['characters'][number] | null = null;
  let bestScore = 0;

  for (const character of storyBible.characters) {
    const aliases = parseAliases(character.aliases);
    const names = [character.name, ...aliases].filter((entry) => entry.trim().length > 0);
    let score = 0;
    for (const name of names) {
      const normalizedName = normalize(name);
      if (!normalizedName) {
        continue;
      }
      if (normalizedName === normalizedRequested) {
        score = Math.max(score, 4);
      } else if (normalizedName.includes(normalizedRequested) || normalizedRequested.includes(normalizedName)) {
        score = Math.max(score, 2);
      } else if (includesNormalizedTerm(normalizedName, normalizedRequested)) {
        score = Math.max(score, 1);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = character;
    }
  }

  const rawTerms = new Set<string>([requested]);
  if (bestMatch) {
    rawTerms.add(bestMatch.name);
    for (const alias of parseAliases(bestMatch.aliases)) {
      rawTerms.add(alias);
    }
  }

  const terms = Array.from(rawTerms)
    .map((item) => item.trim())
    .filter((item) => normalize(item).length > 0);

  return {
    canonicalName: bestMatch?.name?.trim() || null,
    terms,
  };
}

export function buildCharacterTrackingReport(input: BuildCharacterTrackingInput): CharacterTrackingReport {
  const maxMentions = Math.max(8, Math.min(500, input.maxMentions ?? 160));
  const resolved = resolveTrackedTerms(input.requestedName, input.storyBible);
  const mentions: CharacterTrackingMention[] = [];

  if (resolved.terms.length === 0) {
    return {
      requestedName: input.requestedName,
      canonicalName: null,
      trackedTerms: [],
      mentions: [],
      mentionsByChapter: [],
    };
  }

  for (let chapterIndex = 0; chapterIndex < input.chapters.length; chapterIndex += 1) {
    const chapter = input.chapters[chapterIndex];
    const plain = stripHtml(chapter.content);
    const sentences = splitSentences(plain);

    for (const sentence of sentences) {
      const matches = resolved.terms.some((term) => includesNormalizedTerm(sentence, term));
      if (!matches) {
        continue;
      }

      mentions.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterIndex: chapterIndex + 1,
        excerpt: shortenExcerpt(sentence),
      });

      if (mentions.length >= maxMentions) {
        break;
      }
    }

    if (mentions.length >= maxMentions) {
      break;
    }
  }

  const grouped = new Map<string, CharacterTrackingReport['mentionsByChapter'][number]>();
  for (const mention of mentions) {
    const key = mention.chapterId;
    const existing = grouped.get(key);
    if (existing) {
      existing.mentions.push(mention);
      continue;
    }
    grouped.set(key, {
      chapterId: mention.chapterId,
      chapterTitle: mention.chapterTitle,
      chapterIndex: mention.chapterIndex,
      mentions: [mention],
    });
  }

  return {
    requestedName: input.requestedName,
    canonicalName: resolved.canonicalName,
    trackedTerms: resolved.terms,
    mentions,
    mentionsByChapter: Array.from(grouped.values()),
  };
}

export function formatCharacterTrackingReport(report: CharacterTrackingReport): string {
  const cleanRequestedName = report.requestedName.trim() || '(sin nombre)';
  const canonicalLabel = report.canonicalName && report.canonicalName !== cleanRequestedName
    ? ` (${report.canonicalName})`
    : '';

  if (report.trackedTerms.length === 0) {
    return `Seguimiento de personaje: ${cleanRequestedName}\nNo pude procesar el nombre indicado.`;
  }

  if (report.mentions.length === 0) {
    return `Seguimiento de personaje: ${cleanRequestedName}${canonicalLabel}\nNo encontre menciones en los capitulos actuales.`;
  }

  const chaptersCount = report.mentionsByChapter.length;
  const lines: string[] = [
    `Seguimiento de personaje: ${cleanRequestedName}${canonicalLabel}`,
    `Alias rastreados: ${report.trackedTerms.join(', ')}`,
    `Menciones detectadas: ${report.mentions.length} en ${chaptersCount} capitulo/s.`,
    '',
  ];

  for (const chapterGroup of report.mentionsByChapter) {
    lines.push(`Capitulo ${chapterGroup.chapterIndex} - ${chapterGroup.chapterTitle}`);
    for (const mention of chapterGroup.mentions) {
      lines.push(`- ${mention.excerpt}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
