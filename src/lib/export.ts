import type { BookMetadata, ChapterDocument } from '../types/book';
import { buildAmazonCopyPack, buildAmazonMetadataCsv } from './amazon';
import { validateAmazonMetadata } from './amazonValidation';
import { normalizeLanguageCode } from './language';
import { htmlToMarkdown, randomId, safeFileName, stripHtml } from './text';
import { writeBinaryExport, writeMarkdownExport, writeTextExport } from './storage';
import { analyzeBookStyleFromChapters, getStyleLevelLabel } from './styleMetrics';
import { createZipArchive } from './zip';

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

function mmToTwips(value: number): number {
  return Math.max(0, Math.round((value / 25.4) * 1440));
}

function inchesToTwips(value: number): number {
  return Math.max(0, Math.round(value * 1440));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeBookLanguage(metadata: BookMetadata): string {
  const normalized = normalizeLanguageCode(metadata.amazon.language);
  if (!normalized) {
    return 'es';
  }

  const [base, region] = normalized.split('-');
  if (!region) {
    return base.toLowerCase();
  }

  return `${base.toLowerCase()}-${region.toUpperCase()}`;
}

function extractChapterParagraphs(chapter: ChapterDocument): string[] {
  const plain = stripHtml(chapter.content);
  if (!plain.trim()) {
    return [];
  }

  return plain
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function buildDocxParagraph(
  text: string,
  options?: {
    bold?: boolean;
    fontHalfPoints?: number;
    spacingBefore?: number;
    spacingAfter?: number;
    alignCenter?: boolean;
  },
): string {
  const runProps = [
    options?.bold ? '<w:b />' : '',
    options?.fontHalfPoints ? `<w:sz w:val="${options.fontHalfPoints}" />` : '',
    options?.fontHalfPoints ? `<w:szCs w:val="${options.fontHalfPoints}" />` : '',
  ]
    .filter(Boolean)
    .join('');

  const paragraphProps = [
    options?.alignCenter ? '<w:jc w:val="center" />' : '',
    options?.spacingBefore || options?.spacingAfter
      ? `<w:spacing w:before="${options?.spacingBefore ?? 0}" w:after="${options?.spacingAfter ?? 0}" />`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const textNode = `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`;
  const paragraphProperties = paragraphProps ? `<w:pPr>${paragraphProps}</w:pPr>` : '';
  const runProperties = runProps ? `<w:rPr>${runProps}</w:rPr>` : '';
  return `<w:p>${paragraphProperties}<w:r>${runProperties}${textNode}</w:r></w:p>`;
}

function buildDocxDocumentXml(metadata: BookMetadata, orderedChapters: ChapterDocument[]): string {
  const trim = resolveTrimSize(metadata);
  const pageWidth = inchesToTwips(trim.width);
  const pageHeight = inchesToTwips(trim.height);
  const marginTop = mmToTwips(metadata.interiorFormat.marginTopMm);
  const marginBottom = mmToTwips(metadata.interiorFormat.marginBottomMm);
  const marginInside = mmToTwips(metadata.interiorFormat.marginInsideMm);
  const marginOutside = mmToTwips(metadata.interiorFormat.marginOutsideMm);

  const bodyParts: string[] = [];
  bodyParts.push(
    buildDocxParagraph(metadata.title, {
      bold: true,
      fontHalfPoints: 44,
      alignCenter: true,
      spacingAfter: 220,
    }),
  );
  bodyParts.push(
    buildDocxParagraph(`Autor: ${metadata.author}`, {
      fontHalfPoints: 24,
      alignCenter: true,
      spacingAfter: 420,
    }),
  );

  orderedChapters.forEach((chapter, index) => {
    bodyParts.push(
      buildDocxParagraph(`${index + 1}. ${chapter.title}`, {
        bold: true,
        fontHalfPoints: 30,
        spacingBefore: 260,
        spacingAfter: 160,
      }),
    );

    const paragraphs = extractChapterParagraphs(chapter);
    if (paragraphs.length === 0) {
      bodyParts.push(buildDocxParagraph(''));
      return;
    }

    paragraphs.forEach((paragraph) => {
      bodyParts.push(
        buildDocxParagraph(paragraph, {
          spacingAfter: 120,
        }),
      );
    });
  });

  const section = `<w:sectPr>
    <w:pgSz w:w="${pageWidth}" w:h="${pageHeight}" />
    <w:pgMar w:top="${marginTop}" w:right="${marginOutside}" w:bottom="${marginBottom}" w:left="${marginInside}" w:header="708" w:footer="708" w:gutter="0" />
  </w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    ${bodyParts.join('\n')}
    ${section}
  </w:body>
</w:document>`;
}

function buildDocxArchive(metadata: BookMetadata, orderedChapters: ChapterDocument[]): Uint8Array {
  const nowIso = new Date().toISOString();
  const documentXml = buildDocxDocumentXml(metadata, orderedChapters);
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(metadata.title)}</dc:title>
  <dc:creator>${escapeXml(metadata.author)}</dc:creator>
  <cp:lastModifiedBy>WriteWMe</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`;
  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>WriteWMe</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>0.2.0</AppVersion>
</Properties>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml" />
</Types>`;
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml" />
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml" />
</Relationships>`;
  const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  return createZipArchive([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'docProps/core.xml', data: coreXml },
    { name: 'docProps/app.xml', data: appXml },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/_rels/document.xml.rels', data: documentRelsXml },
  ]);
}

function buildEpubChapterXhtml(
  title: string,
  language: string,
  paragraphs: string[],
): string {
  const paragraphHtml = paragraphs.length > 0
    ? paragraphs.map((paragraph) => `<p>${escapeXml(paragraph)}</p>`).join('\n')
    : '<p></p>';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>
    <section class="chapter">
      <h2>${escapeXml(title)}</h2>
      ${paragraphHtml}
    </section>
  </body>
</html>`;
}

function buildEpubArchive(metadata: BookMetadata, orderedChapters: ChapterDocument[]): Uint8Array {
  const language = normalizeBookLanguage(metadata);
  const nowIso = new Date().toISOString();
  const bookId = `urn:uuid:${randomId('writewme')}-${Date.now()}`;
  const titlePage = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <title>${escapeXml(metadata.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>
    <section class="title-page">
      <h1>${escapeXml(metadata.title)}</h1>
      <p>${escapeXml(metadata.author)}</p>
    </section>
  </body>
</html>`;
  const stylesheet = `body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.5;
  margin: 6%;
}
.title-page {
  text-align: center;
  margin-top: 30%;
}
.chapter h2 {
  page-break-before: always;
  break-before: page;
  margin-bottom: 1.1em;
}
p {
  margin: 0 0 0.8em;
  text-indent: 1.2em;
}`;

  const chapterEntries = orderedChapters.map((chapter, index) => {
    const href = `chapter-${String(index + 1).padStart(2, '0')}.xhtml`;
    return {
      id: `chapter_${index + 1}`,
      href,
      title: `${index + 1}. ${chapter.title}`,
      content: buildEpubChapterXhtml(
        `${index + 1}. ${chapter.title}`,
        language,
        extractChapterParagraphs(chapter),
      ),
    };
  });

  const manifestItems = [
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />',
    '<item id="css" href="styles.css" media-type="text/css" />',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml" />',
    ...chapterEntries.map(
      (entry) => `<item id="${entry.id}" href="${entry.href}" media-type="application/xhtml+xml" />`,
    ),
  ].join('\n    ');

  const spineItems = [
    '<itemref idref="title" />',
    ...chapterEntries.map((entry) => `<itemref idref="${entry.id}" />`),
  ].join('\n    ');

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(metadata.author)}</dc:creator>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:identifier id="BookId">${escapeXml(bookId)}</dc:identifier>
    <dc:date>${escapeXml(nowIso)}</dc:date>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`;

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)}</text>
  </docTitle>
  <navMap>
    <navPoint id="nav-title" playOrder="1">
      <navLabel><text>Portada</text></navLabel>
      <content src="title.xhtml" />
    </navPoint>
    ${chapterEntries
      .map(
        (entry, index) => `<navPoint id="nav-${entry.id}" playOrder="${index + 2}">
      <navLabel><text>${escapeXml(entry.title)}</text></navLabel>
      <content src="${entry.href}" />
    </navPoint>`,
      )
      .join('\n    ')}
  </navMap>
</ncx>`;

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;

  const zipEntries: Array<{ name: string; data: string | Uint8Array }> = [
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: containerXml },
    { name: 'OEBPS/content.opf', data: contentOpf },
    { name: 'OEBPS/toc.ncx', data: tocNcx },
    { name: 'OEBPS/styles.css', data: stylesheet },
    { name: 'OEBPS/title.xhtml', data: titlePage },
    ...chapterEntries.map((entry) => ({
      name: `OEBPS/${entry.href}`,
      data: entry.content,
    })),
  ];

  return createZipArchive(zipEntries);
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

export async function exportBookDocx(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
): Promise<string> {
  const archive = buildDocxArchive(metadata, orderedChapters);
  return writeBinaryExport(
    bookPath,
    `${safeFileName(metadata.title)}-editorial.docx`,
    archive,
    'docx',
  );
}

export async function exportBookEpub(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
): Promise<string> {
  const archive = buildEpubArchive(metadata, orderedChapters);
  return writeBinaryExport(
    bookPath,
    `${safeFileName(metadata.title)}-editorial.epub`,
    archive,
    'epub',
  );
}

export async function exportBookStyleReport(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
): Promise<string> {
  const style = analyzeBookStyleFromChapters(orderedChapters);
  const now = new Date().toISOString();
  const bookTop = style.book.topRepetitions.slice(0, 10);
  const chapterLines = style.chapters.map((entry) => {
    const topTerm = entry.analysis.topRepetitions[0];
    return [
      `- ${entry.chapterId} | ${entry.title}`,
      `  Palabras: ${entry.analysis.wordCount}`,
      `  Oraciones: ${entry.analysis.sentenceCount}`,
      `  Promedio por oracion: ${entry.analysis.avgWordsPerSentence}`,
      `  Lectura estimada: ${entry.analysis.readingMinutes} min`,
      `  Ritmo: ${getStyleLevelLabel(entry.analysis.sentenceLengthLevel)}`,
      `  Repeticion: ${getStyleLevelLabel(entry.analysis.repetitionLevel)}`,
      `  Global: ${getStyleLevelLabel(entry.analysis.overallLevel)}`,
      `  Top repeticion: ${topTerm ? `${topTerm.term} (${topTerm.count} veces)` : '(sin dato relevante)'}`,
    ].join('\n');
  });

  const lines = [
    'WRITEWME STYLE REPORT',
    `Fecha: ${now}`,
    `Libro: ${metadata.title}`,
    `Autor: ${metadata.author}`,
    '',
    '[Resumen libro]',
    `Palabras: ${style.book.wordCount}`,
    `Oraciones: ${style.book.sentenceCount}`,
    `Promedio por oracion: ${style.book.avgWordsPerSentence}`,
    `Lectura estimada: ${style.book.readingMinutes} min`,
    `Ritmo: ${getStyleLevelLabel(style.book.sentenceLengthLevel)}`,
    `Repeticion: ${getStyleLevelLabel(style.book.repetitionLevel)}`,
    `Global: ${getStyleLevelLabel(style.book.overallLevel)}`,
    '',
    '[Top repeticiones libro]',
    ...(bookTop.length > 0
      ? bookTop.map((entry) => `- ${entry.term}: ${entry.count} veces (${entry.perThousand}/1000 palabras)`)
      : ['- (sin repeticiones relevantes)']),
    '',
    '[Detalle por capitulo]',
    ...chapterLines,
  ];

  return writeTextExport(
    bookPath,
    `${safeFileName(metadata.title)}-style-report.txt`,
    lines.join('\n'),
    'txt',
  );
}

export function getChapterWordCount(chapter: ChapterDocument): number {
  const plain = stripHtml(chapter.content);
  if (!plain) {
    return 0;
  }

  return plain.split(/\s+/).filter(Boolean).length;
}
