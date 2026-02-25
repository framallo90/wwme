import type { ChapterLengthPreset } from '../types/book';

export interface ChapterLengthProfile {
  preset: ChapterLengthPreset;
  label: string;
  minWords: number;
  maxWords: number;
}

const CHAPTER_LENGTH_PROFILES: Record<ChapterLengthPreset, ChapterLengthProfile> = {
  corta: {
    preset: 'corta',
    label: 'Corta',
    minWords: 1800,
    maxWords: 2800,
  },
  media: {
    preset: 'media',
    label: 'Media',
    minWords: 3000,
    maxWords: 4500,
  },
  larga: {
    preset: 'larga',
    label: 'Larga',
    minWords: 5000,
    maxWords: 7000,
  },
};

export const CHAPTER_LENGTH_OPTIONS: ChapterLengthProfile[] = [
  CHAPTER_LENGTH_PROFILES.corta,
  CHAPTER_LENGTH_PROFILES.media,
  CHAPTER_LENGTH_PROFILES.larga,
];

export function resolveChapterLengthPreset(value: unknown): ChapterLengthPreset {
  if (value === 'corta' || value === 'media' || value === 'larga') {
    return value;
  }

  return 'media';
}

export function getChapterLengthProfile(value: unknown): ChapterLengthProfile {
  const preset = resolveChapterLengthPreset(value);
  return CHAPTER_LENGTH_PROFILES[preset];
}

export function getChapterLengthInstruction(value: unknown): string {
  const profile = getChapterLengthProfile(value);
  return `Objetivo de extension del capitulo: ${profile.label} (${profile.minWords}-${profile.maxWords} palabras aprox).`;
}

export function formatChapterLengthLabel(value: unknown): string {
  const profile = getChapterLengthProfile(value);
  return `${profile.label} (${profile.minWords}-${profile.maxWords} palabras)`;
}
