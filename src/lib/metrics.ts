import type { InteriorFormat } from '../types/book';
import { stripHtml } from './text';

const BASE_AREA_SQIN = 54; // 6x9
const BASE_WORDS_PER_PAGE = 300;
const BASE_LINE_HEIGHT = 1.55;

function resolveAreaSqIn(interior: InteriorFormat | null | undefined): number {
  if (!interior) {
    return BASE_AREA_SQIN;
  }

  const trim = interior.trimSize;
  if (trim === '5x8') {
    return 5 * 8;
  }
  if (trim === '5.5x8.5') {
    return 5.5 * 8.5;
  }
  if (trim === 'a5') {
    return 5.83 * 8.27;
  }
  if (trim === 'custom') {
    return Math.max(1, interior.pageWidthIn * interior.pageHeightIn);
  }

  return 6 * 9;
}

export function countWordsFromPlainText(value: string): number {
  const text = value.trim();
  if (!text) {
    return 0;
  }

  return text.split(/\s+/).filter(Boolean).length;
}

export function countWordsFromHtml(html: string): number {
  return countWordsFromPlainText(stripHtml(html));
}

export function estimatePagesFromWords(
  words: number,
  interior: InteriorFormat | null | undefined,
): number {
  if (words <= 0) {
    return 0;
  }

  const areaSqIn = resolveAreaSqIn(interior);
  const areaFactor = Math.max(0.65, Math.min(1.6, areaSqIn / BASE_AREA_SQIN));
  const lineHeight = interior?.lineHeight ?? BASE_LINE_HEIGHT;
  const lineFactor = Math.max(0.6, Math.min(1.6, BASE_LINE_HEIGHT / lineHeight));
  const wordsPerPage = Math.max(120, BASE_WORDS_PER_PAGE * areaFactor * lineFactor);

  return Math.max(1, Math.ceil(words / wordsPerPage));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value);
}
