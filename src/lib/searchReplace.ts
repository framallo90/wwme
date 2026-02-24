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
      const regex = new RegExp(pattern, flags);
      node.textContent = currentText.replace(regex, replacement);
      replacements += currentCount;
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
