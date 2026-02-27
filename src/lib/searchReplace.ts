import type { ChapterDocument } from '../types/book';

export interface SearchReplaceOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface ChapterSearchMatch {
  chapterId: string;
  chapterTitle: string;
  matches: number;
}

export interface ReplacePreviewItem {
  chapterId: string;
  chapterTitle: string;
  matches: number;
  beforeSample: string;
  afterSample: string;
}

export interface ReplacePreviewReport {
  query: string;
  replacement: string;
  totalMatches: number;
  affectedChapters: number;
  items: ReplacePreviewItem[];
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(query: string, wholeWord: boolean): string {
  const escaped = escapeRegExp(query);
  return wholeWord ? `\\b${escaped}\\b` : escaped;
}

function buildFlags(caseSensitive: boolean): string {
  return caseSensitive ? 'g' : 'gi';
}

function parseHtmlToBody(html: string): HTMLElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body;
}

function countMatchesInText(text: string, pattern: string, flags: string): number {
  const regex = new RegExp(pattern, flags);
  const matched = text.match(regex);
  return matched ? matched.length : 0;
}

function getTextContentFromHtml(html: string): string {
  const body = parseHtmlToBody(html);
  return (body.textContent || '').replace(/\s+/g, ' ').trim();
}

function buildSample(text: string, query: string, options: SearchReplaceOptions): string {
  const pattern = buildPattern(query, options.wholeWord);
  const flags = buildFlags(options.caseSensitive);
  const regex = new RegExp(pattern, flags);
  const match = regex.exec(text);
  if (!match || typeof match.index !== 'number') {
    return text.slice(0, 180);
  }

  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + match[0].length + 60);
  return text.slice(start, end).trim();
}

export function replaceMatchesInTextLiteral(
  text: string,
  pattern: string,
  flags: string,
  replacement: string,
): { text: string; replacements: number } {
  const regex = new RegExp(pattern, flags);
  let replacements = 0;
  const nextText = text.replace(regex, () => {
    replacements += 1;
    return replacement;
  });

  return { text: nextText, replacements };
}

export function countMatchesInHtml(html: string, query: string, options: SearchReplaceOptions): number {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return 0;
  }

  const body = parseHtmlToBody(html);
  const pattern = buildPattern(normalizedQuery, options.wholeWord);
  const flags = buildFlags(options.caseSensitive);
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);

  let total = 0;
  let node = walker.nextNode();
  while (node) {
    total += countMatchesInText(node.textContent ?? '', pattern, flags);
    node = walker.nextNode();
  }

  return total;
}

export function replaceMatchesInHtml(
  html: string,
  query: string,
  replacement: string,
  options: SearchReplaceOptions,
): { html: string; replacements: number } {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return { html, replacements: 0 };
  }

  const body = parseHtmlToBody(html);
  const pattern = buildPattern(normalizedQuery, options.wholeWord);
  const flags = buildFlags(options.caseSensitive);
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);

  let replacements = 0;
  let node = walker.nextNode();
  while (node) {
    const currentText = node.textContent ?? '';
    const currentCount = countMatchesInText(currentText, pattern, flags);
    if (currentCount > 0) {
      const replaced = replaceMatchesInTextLiteral(currentText, pattern, flags, replacement);
      node.textContent = replaced.text;
      replacements += replaced.replacements;
    }
    node = walker.nextNode();
  }

  return { html: body.innerHTML, replacements };
}

export function buildBookSearchMatches(
  orderedChapters: ChapterDocument[],
  query: string,
  options: SearchReplaceOptions,
): { matches: ChapterSearchMatch[]; totalMatches: number } {
  const results: ChapterSearchMatch[] = [];
  let totalMatches = 0;

  for (const chapter of orderedChapters) {
    const chapterMatches = countMatchesInHtml(chapter.content, query, options);
    if (chapterMatches > 0) {
      results.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        matches: chapterMatches,
      });
      totalMatches += chapterMatches;
    }
  }

  return {
    matches: results,
    totalMatches,
  };
}

export async function buildBookSearchMatchesAsync(
  orderedChapters: ChapterDocument[],
  query: string,
  options: SearchReplaceOptions,
  chunkSize = 6,
): Promise<{ matches: ChapterSearchMatch[]; totalMatches: number }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return {
      matches: [],
      totalMatches: 0,
    };
  }

  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  const results: ChapterSearchMatch[] = [];
  let totalMatches = 0;

  for (let index = 0; index < orderedChapters.length; index += 1) {
    const chapter = orderedChapters[index];
    const chapterMatches = countMatchesInHtml(chapter.content, normalizedQuery, options);
    if (chapterMatches > 0) {
      results.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        matches: chapterMatches,
      });
      totalMatches += chapterMatches;
    }

    if ((index + 1) % safeChunkSize === 0) {
      await yieldToEventLoop();
    }
  }

  return {
    matches: results,
    totalMatches,
  };
}

export function buildBookReplacePreview(
  orderedChapters: ChapterDocument[],
  query: string,
  replacement: string,
  options: SearchReplaceOptions,
  maxItems = 20,
): ReplacePreviewReport {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return {
      query: '',
      replacement,
      totalMatches: 0,
      affectedChapters: 0,
      items: [],
    };
  }

  const items: ReplacePreviewItem[] = [];
  let totalMatches = 0;

  for (const chapter of orderedChapters) {
    const updated = replaceMatchesInHtml(chapter.content, normalizedQuery, replacement, options);
    if (updated.replacements === 0) {
      continue;
    }

    const beforeText = getTextContentFromHtml(chapter.content);
    const afterText = getTextContentFromHtml(updated.html);

    items.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      matches: updated.replacements,
      beforeSample: buildSample(beforeText, normalizedQuery, options),
      afterSample: buildSample(afterText, replacement || normalizedQuery, {
        ...options,
        wholeWord: false,
      }),
    });
    totalMatches += updated.replacements;
  }

  return {
    query: normalizedQuery,
    replacement,
    totalMatches,
    affectedChapters: items.length,
    items: items.slice(0, Math.max(1, maxItems)),
  };
}

export async function buildBookReplacePreviewAsync(
  orderedChapters: ChapterDocument[],
  query: string,
  replacement: string,
  options: SearchReplaceOptions,
  maxItems = 20,
  chunkSize = 6,
): Promise<ReplacePreviewReport> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return {
      query: '',
      replacement,
      totalMatches: 0,
      affectedChapters: 0,
      items: [],
    };
  }

  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  const items: ReplacePreviewItem[] = [];
  let totalMatches = 0;

  for (let index = 0; index < orderedChapters.length; index += 1) {
    const chapter = orderedChapters[index];
    const updated = replaceMatchesInHtml(chapter.content, normalizedQuery, replacement, options);
    if (updated.replacements > 0) {
      const beforeText = getTextContentFromHtml(chapter.content);
      const afterText = getTextContentFromHtml(updated.html);

      items.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        matches: updated.replacements,
        beforeSample: buildSample(beforeText, normalizedQuery, options),
        afterSample: buildSample(afterText, replacement || normalizedQuery, {
          ...options,
          wholeWord: false,
        }),
      });
      totalMatches += updated.replacements;
    }

    if ((index + 1) % safeChunkSize === 0) {
      await yieldToEventLoop();
    }
  }

  return {
    query: normalizedQuery,
    replacement,
    totalMatches,
    affectedChapters: items.length,
    items: items.slice(0, Math.max(1, maxItems)),
  };
}
