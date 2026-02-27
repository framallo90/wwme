import type { ChapterRangeFilter } from '../types/book';

export interface NormalizedChapterRange {
  from: number;
  to: number;
  isFullRange: boolean;
  label: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeChapterNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.trunc(value);
  if (rounded <= 0) {
    return null;
  }

  return rounded;
}

export function normalizeChapterRange(totalChapters: number, range: ChapterRangeFilter): NormalizedChapterRange {
  const safeTotal = Math.max(0, Math.trunc(totalChapters));
  if (safeTotal === 0) {
    return {
      from: 1,
      to: 0,
      isFullRange: true,
      label: 'sin capitulos',
    };
  }

  const requestedFrom = safeChapterNumber(range.fromChapter) ?? 1;
  const requestedTo = safeChapterNumber(range.toChapter) ?? safeTotal;

  let from = clamp(requestedFrom, 1, safeTotal);
  let to = clamp(requestedTo, 1, safeTotal);
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  const isFullRange = from === 1 && to === safeTotal;

  return {
    from,
    to,
    isFullRange,
    label: isFullRange ? `1-${safeTotal} (todo el libro)` : `${from}-${to}`,
  };
}

export function sliceByChapterRange<T>(items: T[], range: NormalizedChapterRange): T[] {
  if (range.to < range.from) {
    return [];
  }
  return items.slice(range.from - 1, range.to);
}
