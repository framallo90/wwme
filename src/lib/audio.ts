import { getLanguageDisplayName, normalizeLanguageCode } from './language';
import { joinPath, safeFileName, stripHtml } from './text';
import type { BookMetadata, ChapterDocument } from '../types/book';

export type AudioPlaybackState = 'idle' | 'playing' | 'paused';

export function resolveSpeechLanguageTag(language: string): string {
  const normalized = normalizeLanguageCode(language);
  const [base, region] = normalized.split('-');
  if (!region) {
    return base.toLowerCase();
  }

  return `${base.toLowerCase()}-${region.toUpperCase()}`;
}

export function pickSpeechVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
  preferredVoiceName = '',
): SpeechSynthesisVoice | null {
  const normalizedLanguage = resolveSpeechLanguageTag(language);
  const normalizedBase = normalizedLanguage.split('-')[0];
  const preferred = preferredVoiceName.trim().toLowerCase();

  if (preferred) {
    const exact = voices.find((voice) => voice.name.trim().toLowerCase() === preferred);
    if (exact) {
      return exact;
    }
  }

  const exactLanguage = voices.find((voice) => voice.lang.toLowerCase() === normalizedLanguage.toLowerCase());
  if (exactLanguage) {
    return exactLanguage;
  }

  const sameBaseLanguage = voices.find((voice) => voice.lang.toLowerCase().startsWith(`${normalizedBase.toLowerCase()}-`));
  if (sameBaseLanguage) {
    return sameBaseLanguage;
  }

  const fallbackBase = voices.find((voice) => voice.lang.toLowerCase() === normalizedBase.toLowerCase());
  if (fallbackBase) {
    return fallbackBase;
  }

  return voices[0] ?? null;
}

function normalizeSpeechText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildChapterAudioText(chapter: ChapterDocument): string {
  const chapterText = stripHtml(chapter.content);
  return normalizeSpeechText(`Capitulo ${chapter.id}. ${chapter.title}.\n\n${chapterText}`);
}

export function buildBookAudioText(metadata: BookMetadata, orderedChapters: ChapterDocument[]): string {
  const intro = `${metadata.title}. Autor: ${metadata.author}. Idioma: ${getLanguageDisplayName(metadata.amazon.language)}.`;
  const chapterBlocks = orderedChapters
    .map((chapter) => buildChapterAudioText(chapter))
    .filter((block) => block.length > 0);

  return normalizeSpeechText([intro, ...chapterBlocks].join('\n\n'));
}

export function buildChapterAudioExportPath(bookPath: string, metadata: BookMetadata, chapter: ChapterDocument): string {
  const fileName = `${safeFileName(metadata.title)}-${chapter.id}-${safeFileName(chapter.title)}-audio.wav`;
  return joinPath(bookPath, 'exports', fileName);
}

export function buildBookAudioExportPath(bookPath: string, metadata: BookMetadata): string {
  return joinPath(bookPath, 'exports', `${safeFileName(metadata.title)}-audiolibro.wav`);
}

interface ExportAudiobookInput {
  text: string;
  outputPath: string;
  language: string;
  voiceName?: string;
  rate: number;
  volume: number;
}

export async function exportAudiobookToWav(input: ExportAudiobookInput): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('export_audiobook_wav', {
    ...input,
    language: resolveSpeechLanguageTag(input.language),
    voiceName: input.voiceName?.trim() || null,
  });
}
