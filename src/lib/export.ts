import type { BookMetadata, ChapterDocument } from '../types/book';
import { buildAmazonCopyPack, buildAmazonMetadataCsv } from './amazon';
import { validateAmazonMetadata } from './amazonValidation';
import { htmlToMarkdown, safeFileName, stripHtml } from './text';
import { writeMarkdownExport, writeTextExport } from './storage';

function resolveTrimSize(metadata: BookMetadata): { width: number; height: number } {
  const trim = metadata.interiorFormat.trimSize;
  if (trim === '5x8') {
    return { width: 5, height: 8 };
  }
  if (trim === '5.5x8.5') {
    return { width: 5.5, height: 8.5 };
  }
  if (trim === 'a5') {
    return { width: 5.83, height: 8.27 };
  }
  if (trim === 'custom') {
    return {
      width: metadata.interiorFormat.pageWidthIn,
      height: metadata.interiorFormat.pageHeightIn,
    };
  }

  return { width: 6, height: 9 };
}

export function buildInteriorCss(metadata: BookMetadata): string {
  const trim = resolveTrimSize(metadata);
  const interior = metadata.interiorFormat;
  return `@page {
  size: ${trim.width}in ${trim.height}in;
  margin-top: ${interior.marginTopMm}mm;
  margin-right: ${interior.marginOutsideMm}mm;
  margin-bottom: ${interior.marginBottomMm}mm;
  margin-left: ${interior.marginInsideMm}mm;
}
body {
  margin: 0;
  font-family: "Book Antiqua", "Georgia", serif;
  line-height: ${interior.lineHeight};
  color: #111111;
}
.title-page {
  break-after: page;
  text-align: center;
  padding-top: 30%;
}
.title-page p {
  text-indent: 0;
}
.chapter {
  break-before: page;
}
.chapter h2 {
  text-align: center;
  margin-bottom: 1.2em;
}
p {
  margin: 0 0 0.5em 0;
  text-indent: ${interior.paragraphIndentEm}em;
}`;
}

function buildBookInteriorHtml(metadata: BookMetadata, orderedChapters: ChapterDocument[]): string {
  const chaptersHtml = orderedChapters
    .map(
      (chapter, index) =>
        `<section class="chapter"><h2>${index + 1}. ${chapter.title}</h2>${chapter.content}</section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${metadata.title}</title>
  <style>${buildInteriorCss(metadata)}</style>
</head>
<body>
  <section class="title-page">
    <h1>${metadata.title}</h1>
    <p>${metadata.author}</p>
    <p>${metadata.spineText || metadata.title}</p>
  </section>
  ${chaptersHtml}
</body>
</html>`;
}

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

export async function exportBookAmazonBundle(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
): Promise<string[]> {
  const markdownPath = await exportBookMarkdownSingleFile(bookPath, metadata, orderedChapters);
  const interiorPath = await writeTextExport(
    bookPath,
    `${safeFileName(metadata.title)}-interior-kdp.html`,
    buildBookInteriorHtml(metadata, orderedChapters),
    'html',
  );

  const trim = resolveTrimSize(metadata);
  const amazonPack = [
    buildAmazonCopyPack(metadata),
    '',
    '----',
    `Spine text: ${metadata.spineText || metadata.title}`,
    `Trim: ${trim.width} x ${trim.height} in`,
    `Margins (mm) top:${metadata.interiorFormat.marginTopMm} bottom:${metadata.interiorFormat.marginBottomMm} inside:${metadata.interiorFormat.marginInsideMm} outside:${metadata.interiorFormat.marginOutsideMm}`,
    `Paragraph indent (em): ${metadata.interiorFormat.paragraphIndentEm}`,
    `Line height: ${metadata.interiorFormat.lineHeight}`,
  ].join('\n');
  const packPath = await writeTextExport(bookPath, `${safeFileName(metadata.title)}-amazon-pack.txt`, amazonPack, 'txt');
  const metadataCsvPath = await writeTextExport(
    bookPath,
    `${safeFileName(metadata.title)}-amazon-metadata.csv`,
    buildAmazonMetadataCsv(metadata),
    'csv',
  );
  const validation = validateAmazonMetadata(metadata);
  const validationLines = [
    'AMAZON KDP VALIDATION',
    `Ready: ${validation.isValid ? 'YES' : 'NO'}`,
    `Readiness score: ${validation.readinessScore}/100`,
    `Errors: ${validation.errors.length}`,
    `Warnings: ${validation.warnings.length}`,
    '',
    'Errors:',
    ...(validation.errors.length > 0
      ? validation.errors.map((issue) => `- [${issue.field}] ${issue.message}`)
      : ['- (none)']),
    '',
    'Warnings:',
    ...(validation.warnings.length > 0
      ? validation.warnings.map((issue) => `- [${issue.field}] ${issue.message}`)
      : ['- (none)']),
  ];
  const validationPath = await writeTextExport(
    bookPath,
    `${safeFileName(metadata.title)}-amazon-validation.txt`,
    validationLines.join('\n'),
    'txt',
  );

  return [markdownPath, interiorPath, packPath, metadataCsvPath, validationPath];
}

export function getChapterWordCount(chapter: ChapterDocument): number {
  const plain = stripHtml(chapter.content);
  if (!plain) {
    return 0;
  }

  return plain.split(/\s+/).filter(Boolean).length;
}
