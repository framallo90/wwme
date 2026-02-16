import type { BookMetadata, ChapterDocument } from '../types/book';
import { htmlToMarkdown, safeFileName, stripHtml } from './text';
import { writeMarkdownExport } from './storage';

export async function exportChapterMarkdown(
  bookPath: string,
  chapter: ChapterDocument,
): Promise<string> {
  const fileName = `${chapter.id}-${safeFileName(chapter.title)}.md`;
  const markdown = htmlToMarkdown(chapter.content);
  return writeMarkdownExport(bookPath, fileName, markdown);
}

export async function exportBookMarkdownSingleFile(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
): Promise<string> {
  const chunks = orderedChapters.map((chapter, index) => {
    const markdown = htmlToMarkdown(chapter.content);
    return `## ${index + 1}. ${chapter.title}\n\n${markdown}`;
  });

  const content = [`# ${metadata.title}`, `Autor: ${metadata.author}`, '', ...chunks].join('\n\n');
  return writeMarkdownExport(bookPath, `${safeFileName(metadata.title)}-completo.md`, content);
}

export async function exportBookMarkdownByChapter(
  bookPath: string,
  orderedChapters: ChapterDocument[],
): Promise<string[]> {
  const results: string[] = [];
  for (const chapter of orderedChapters) {
    const path = await exportChapterMarkdown(bookPath, chapter);
    results.push(path);
  }
  return results;
}

export function getChapterWordCount(chapter: ChapterDocument): number {
  const plain = stripHtml(chapter.content);
  if (!plain) {
    return 0;
  }

  return plain.split(/\s+/).filter(Boolean).length;
}
