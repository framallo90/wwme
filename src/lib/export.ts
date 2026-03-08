import type { BookMetadata, ChapterDocument, SagaProject } from '../types/book';
import { buildAmazonCopyPack, buildAmazonMetadataCsv } from './amazon';
import { validateAmazonMetadata } from './amazonValidation';
import { normalizeLanguageCode } from './language';
import { htmlToMarkdown, randomId, safeFileName, sanitizeHtmlForPreview, stripHtml } from './text';
import { writeBinaryExport, writeMarkdownExport, writeTextExport } from './storage';
import { analyzeBookStyleFromChapters, getStyleLevelLabel } from './styleMetrics';
import { createZipArchive } from './zip';
import { countWordsFromHtml } from './metrics';

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

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
}

export function buildSagaCartographerPackArchive(saga: SagaProject): Uint8Array {
  const atlas = saga.metadata.worldBible.atlas;
  const layersCsv = buildCsv([
    ['layerId', 'name', 'color', 'visible', 'description'],
    ...atlas.layers.map((layer) => [
      layer.id,
      layer.name,
      layer.color,
      layer.visible ? 'yes' : 'no',
      layer.description,
    ]),
  ]);
  const pinsCsv = buildCsv([
    ['pinId', 'locationId', 'label', 'layerId', 'xPct', 'yPct', 'notes'],
    ...atlas.pins.map((pin) => [
      pin.id,
      pin.locationId,
      pin.label,
      pin.layerId,
      pin.xPct.toFixed(2),
      pin.yPct.toFixed(2),
      pin.notes,
    ]),
  ]);
  const locationsCsv = buildCsv([
    ['locationId', 'name', 'aliases', 'summary', 'notes'],
    ...saga.metadata.worldBible.locations.map((location) => [
      location.id,
      location.name,
      location.aliases,
      location.summary,
      location.notes,
    ]),
  ]);
  const routesCsv = buildCsv([
    ['measurementId', 'routeId', 'fromPinId', 'toPinId', 'distanceOverride', 'travelHours', 'notes'],
    ...atlas.routeMeasurements.map((measurement) => [
      measurement.id,
      measurement.routeId,
      measurement.fromPinId,
      measurement.toPinId,
      measurement.distanceOverride ?? '',
      measurement.travelHours ?? '',
      measurement.notes,
    ]),
  ]);
  const notesMd = [
    `# Pack cartografo - ${saga.metadata.title}`,
    '',
    `Mapa base: ${atlas.mapImagePath || '(sin mapa cargado)'}`,
    `Escala horizontal: ${atlas.distanceScale} ${atlas.distanceUnit}`,
    `Modo de viaje por defecto: ${atlas.defaultTravelMode || '(sin definir)'}`,
    '',
    '## Capas',
    ...atlas.layers.map((layer) => `- ${layer.name} (${layer.color})${layer.description ? `: ${layer.description}` : ''}`),
    '',
    '## Rutas medidas',
    ...(atlas.routeMeasurements.length > 0
      ? atlas.routeMeasurements.map((measurement) => {
          const fromPin = atlas.pins.find((pin) => pin.id === measurement.fromPinId);
          const toPin = atlas.pins.find((pin) => pin.id === measurement.toPinId);
          return `- ${fromPin?.label || measurement.fromPinId} -> ${toPin?.label || measurement.toPinId} | distancia: ${measurement.distanceOverride ?? 'auto'} | horas: ${measurement.travelHours ?? 'sin dato'}`;
        })
      : ['- (sin rutas medidas)']),
  ].join('\n');

  return createZipArchive([
    {
      name: 'atlas-config.json',
      data: JSON.stringify(
        {
          title: saga.metadata.title,
          atlas,
        },
        null,
        2,
      ),
    },
    { name: 'layers.csv', data: layersCsv },
    { name: 'locations.csv', data: locationsCsv },
    { name: 'pins.csv', data: pinsCsv },
    { name: 'routes.csv', data: routesCsv },
    { name: 'notes.md', data: notesMd },
  ]);
}

export function buildSagaHistorianPackArchive(saga: SagaProject): Uint8Array {
  const secrets = saga.metadata.worldBible.secrets ?? [];
  const timelineRows = buildCsv([
    ['eventId', 'title', 'lane', 'era', 'startOrder', 'endOrder', 'category', 'books', 'summary'],
    ...saga.metadata.worldBible.timeline.map((event) => [
      event.id,
      event.title,
      event.laneLabel || event.laneId || '',
      event.eraLabel || '',
      event.startOrder,
      event.endOrder ?? '',
      event.category,
      event.bookRefs.map((entry) => entry.bookPath).filter(Boolean).join(' | '),
      event.summary,
    ]),
  ]);
  const notesMd = [
    `# Pack cronologia - ${saga.metadata.title}`,
    '',
    '## Carriles',
    ...saga.metadata.worldBible.timelineLanes.map((lane) => `- ${lane.label} (${lane.era || 'sin era'})`),
    '',
    '## Secretos',
    ...(secrets.length > 0
      ? secrets.map((secret) => `- ${secret.title}: ${secret.summary || secret.objectiveTruth}`)
      : ['- (sin secretos cargados)']),
  ].join('\n');

  return createZipArchive([
    {
      name: 'timeline.json',
      data: JSON.stringify(saga.metadata.worldBible.timeline, null, 2),
    },
    { name: 'timeline.csv', data: timelineRows },
    {
      name: 'secrets.json',
      data: JSON.stringify(secrets, null, 2),
    },
    { name: 'chronicle.md', data: notesMd },
  ]);
}

export function buildBookEditorPackArchive(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
  saga?: SagaProject | null,
): Uint8Array {
  const manuscriptMd = [
    `# ${metadata.title}`,
    `Autor: ${metadata.author}`,
    '',
    ...orderedChapters.map((chapter, index) => {
      const markdown = htmlToMarkdown(chapter.content);
      return `## ${index + 1}. ${chapter.title}\n\n${markdown}`;
    }),
  ].join('\n\n');
  const sagaConnections = saga
    ? saga.metadata.worldBible.timeline
        .filter((event) => event.bookRefs.some((entry) => entry.bookPath === bookPath))
        .map((event) => {
          const relatedBooks = event.bookRefs
            .filter((entry) => entry.bookPath !== bookPath)
            .map((entry) => saga.metadata.books.find((book) => book.bookPath === entry.bookPath)?.title || entry.bookPath)
            .filter(Boolean);
          return [
            `- ${event.title || event.id}`,
            `  Carril: ${event.laneLabel || event.laneId || 'sin carril'}`,
            `  Orden: ${event.startOrder}${event.endOrder ? `-${event.endOrder}` : ''}`,
            `  Otros libros: ${relatedBooks.length > 0 ? relatedBooks.join(', ') : '(solo este libro)'}`,
            `  Resumen: ${event.summary || 'Sin resumen.'}`,
          ].join('\n');
        })
    : [];
  const editorialContextMd = [
    `# Contexto editorial - ${metadata.title}`,
    '',
    saga
      ? `Saga: ${saga.metadata.title}`
      : 'Saga: (libro no vinculado a saga activa)',
    '',
    '## Conexiones narrativas registradas',
    ...(sagaConnections.length > 0 ? sagaConnections : ['- (sin conexiones externas registradas)']),
  ].join('\n');

  return createZipArchive([
    { name: 'manuscript.md', data: manuscriptMd },
    { name: 'editorial-context.md', data: editorialContextMd },
    {
      name: 'book-metadata.json',
      data: JSON.stringify(metadata, null, 2),
    },
  ]);
}

export function buildBookLayoutPackArchive(
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
): Uint8Array {
  const chapterRows = buildCsv([
    ['chapterId', 'title', 'wordCount', 'paragraphCount'],
    ...orderedChapters.map((chapter) => {
      const paragraphs = extractChapterParagraphs(chapter);
      const wordCount = countWordsFromHtml(chapter.content);
      return [chapter.id, chapter.title, wordCount, paragraphs.length];
    }),
  ]);

  const layoutSummary = [
    `# Pack maquetacion - ${metadata.title}`,
    '',
    `Autor: ${metadata.author}`,
    '',
    '## Formato interior',
    `- Trim: ${metadata.interiorFormat.trimSize}`,
    `- Tamano custom: ${metadata.interiorFormat.pageWidthIn} x ${metadata.interiorFormat.pageHeightIn} in`,
    `- Margenes mm: top ${metadata.interiorFormat.marginTopMm}, bottom ${metadata.interiorFormat.marginBottomMm}, inside ${metadata.interiorFormat.marginInsideMm}, outside ${metadata.interiorFormat.marginOutsideMm}`,
    `- Sangria parrafo: ${metadata.interiorFormat.paragraphIndentEm}em`,
    `- Interlineado: ${metadata.interiorFormat.lineHeight}`,
    `- Control viudas/huerfanas: ${metadata.interiorFormat.widowOrphanControl ? 'si' : 'no'}`,
    `- Apertura capitulo: ${metadata.interiorFormat.chapterOpeningStyle}`,
    `- Capitulare: ${metadata.interiorFormat.dropCapEnabled ? 'si' : 'no'}`,
    `- Ornamento de escena: ${metadata.interiorFormat.sceneBreakGlyph || '* * *'}`,
    '',
    '## Entregables',
    '- interior.css',
    '- interior-sample.html',
    '- chapter-metrics.csv',
    '- interior-format.json',
  ].join('\n');

  return createZipArchive([
    {
      name: 'interior.css',
      data: buildInteriorCss(metadata),
    },
    {
      name: 'interior-sample.html',
      data: buildBookInteriorHtml(metadata, orderedChapters),
    },
    {
      name: 'chapter-metrics.csv',
      data: chapterRows,
    },
    {
      name: 'interior-format.json',
      data: JSON.stringify(metadata.interiorFormat, null, 2),
    },
    {
      name: 'README.md',
      data: layoutSummary,
    },
  ]);
}

export function buildBookConsultantPackArchive(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
  saga?: SagaProject | null,
): Uint8Array {
  const manuscriptMd = [
    `# ${metadata.title}`,
    `Autor: ${metadata.author}`,
    '',
    ...orderedChapters.map((chapter, index) => {
      const markdown = htmlToMarkdown(chapter.content);
      return `## ${index + 1}. ${chapter.title}\n\n${markdown}`;
    }),
  ].join('\n\n');

  const storyBibleJson = JSON.stringify(
    {
      foundation: metadata.foundation,
      storyBible: metadata.storyBible,
      looseThreads: metadata.looseThreads ?? [],
      editorialChecklistCustom: metadata.editorialChecklistCustom ?? [],
    },
    null,
    2,
  );

  const timelineRows = saga
    ? buildCsv([
        ['eventId', 'displayLabel', 'title', 'lane', 'startOrder', 'endOrder', 'mode', 'chapterId', 'summary'],
        ...saga.metadata.worldBible.timeline
          .filter((event) => event.bookRefs.some((ref) => ref.bookPath === bookPath))
          .flatMap((event) =>
            event.bookRefs
              .filter((ref) => ref.bookPath === bookPath)
              .map((ref) => [
                event.id,
                event.displayLabel || `T${event.startOrder}`,
                event.title,
                event.laneLabel || event.laneId || '',
                event.startOrder,
                event.endOrder ?? '',
                ref.mode,
                ref.chapterId || '',
                event.summary,
              ]),
          ),
      ])
    : buildCsv([['eventId', 'displayLabel', 'title', 'lane', 'startOrder', 'endOrder', 'mode', 'chapterId', 'summary']]);

  const notes = [
    `# Pack consultoria - ${metadata.title}`,
    '',
    `Saga vinculada: ${saga ? saga.metadata.title : '(sin saga activa)'}`,
    '',
    'Este paquete esta pensado para lectura analitica (mundo, tono, politica, economia, continuidad).',
    '',
    'Incluye:',
    '- manuscript.md',
    '- consultant-context.json',
    '- timeline-links.csv',
  ].join('\n');

  return createZipArchive([
    {
      name: 'manuscript.md',
      data: manuscriptMd,
    },
    {
      name: 'consultant-context.json',
      data: storyBibleJson,
    },
    {
      name: 'timeline-links.csv',
      data: timelineRows,
    },
    {
      name: 'README.md',
      data: notes,
    },
  ]);
}

export function buildSagaBibleDossierHtml(saga: SagaProject): string {
  const world = saga.metadata.worldBible;
  const timelineItems = world.timeline
    .slice()
    .sort((left, right) => left.startOrder - right.startOrder || left.title.localeCompare(right.title))
    .map(
      (event) => `
        <li>
          <strong>${escapeXml(event.displayLabel || `T${event.startOrder}`)} · ${escapeXml(event.title || 'Evento sin titulo')}</strong>
          <div>${escapeXml(event.summary || 'Sin resumen.')}</div>
          <small>${escapeXml(event.laneLabel || event.laneId || 'sin carril')} · ${escapeXml(event.category)}</small>
        </li>`,
    )
    .join('');
  const relationshipItems = world.relationships
    .map(
      (relationship) => `
        <li>
          <strong>${escapeXml(relationship.type || 'Relacion')}</strong>
          <div>${escapeXml(`${relationship.from.id} -> ${relationship.to.id}`)}</div>
          <small>${escapeXml(relationship.notes || 'Sin notas.')}</small>
        </li>`,
    )
    .join('');
  const conlangItems = world.conlangs
    .map(
      (conlang) => `
        <li>
          <strong>${escapeXml(conlang.name)}</strong>
          <div>${escapeXml(conlang.phonetics || 'Sin fonetica registrada.')}</div>
          <small>${escapeXml(conlang.grammarNotes || conlang.styleRules || 'Sin gramatica registrada.')}</small>
        </li>`,
    )
    .join('');
  const magicItems = world.magicSystems
    .map(
      (system) => `
        <li>
          <strong>${escapeXml(system.name)}</strong>
          <div>${escapeXml(system.source || 'Sin fuente definida.')}</div>
          <small>${escapeXml(system.summary || system.limits || 'Sin reglas registradas.')}</small>
        </li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(saga.metadata.title)} · Biblia de saga</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #17345f;
        --muted: #52627c;
        --paper: #f7f1e8;
        --card: rgba(255,255,255,0.94);
        --line: rgba(23,52,95,0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Georgia", "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top, rgba(210,190,163,0.18), transparent 34%),
          linear-gradient(180deg, #fcfaf6, var(--paper));
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 2.5rem 1.5rem 4rem;
      }
      header, section {
        margin-bottom: 1.4rem;
        padding: 1.2rem 1.3rem;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--card);
        box-shadow: 0 18px 38px rgba(19, 41, 75, 0.05);
      }
      h1, h2, h3 { margin: 0 0 0.55rem; }
      p, li, small { line-height: 1.55; }
      .kicker { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.75rem; color: var(--muted); }
      .grid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      ul { margin: 0.5rem 0 0; padding-left: 1.2rem; display: grid; gap: 0.5rem; }
      .muted { color: var(--muted); }
      @media print {
        body { background: white; }
        header, section { box-shadow: none; break-inside: avoid; }
      }
      @media (max-width: 800px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="kicker">Biblia de saga</div>
        <h1>${escapeXml(saga.metadata.title)}</h1>
        <p class="muted">${escapeXml(saga.metadata.description || 'Sin descripcion general.')}</p>
      </header>

      <section>
        <h2>Volumenes vinculados</h2>
        <ul>
          ${
            saga.metadata.books.length > 0
              ? saga.metadata.books
                  .map(
                    (book) =>
                      `<li><strong>Vol. ${book.volumeNumber || '?'}</strong> · ${escapeXml(book.title)} <small>${escapeXml(book.author || 'Autor sin definir')}</small></li>`,
                  )
                  .join('')
              : '<li>Sin libros vinculados todavia.</li>'
          }
        </ul>
      </section>

      <div class="grid">
        <section>
          <h2>Canon de personajes</h2>
          <ul>
            ${
              world.characters.length > 0
                ? world.characters
                    .map(
                      (character) =>
                        `<li><strong>${escapeXml(character.name)}</strong><div>${escapeXml(character.summary || 'Sin resumen.')}</div></li>`,
                    )
                    .join('')
                : '<li>Sin personajes cargados.</li>'
            }
          </ul>
        </section>
        <section>
          <h2>Lugares y geografia</h2>
          <ul>
            ${
              world.locations.length > 0
                ? world.locations
                    .map(
                      (location) =>
                        `<li><strong>${escapeXml(location.name)}</strong><div>${escapeXml(location.summary || 'Sin resumen.')}</div></li>`,
                    )
                    .join('')
                : '<li>Sin lugares cargados.</li>'
            }
          </ul>
        </section>
      </div>

      <div class="grid">
        <section>
          <h2>Atlas y capas</h2>
          <p><strong>Mapa base:</strong> ${escapeXml(world.atlas.mapImagePath || '(sin mapa cargado)')}</p>
          <p><strong>Capas:</strong> ${world.atlas.layers.length}</p>
          <p><strong>Pines:</strong> ${world.atlas.pins.length}</p>
          <p><strong>Rutas medidas:</strong> ${world.atlas.routeMeasurements.length}</p>
        </section>
        <section>
          <h2>Carriles y cronologia</h2>
          <p><strong>Carriles:</strong> ${world.timelineLanes.length}</p>
          <p><strong>Eventos:</strong> ${world.timeline.length}</p>
          <ul>${timelineItems || '<li>Sin eventos cronologicos cargados.</li>'}</ul>
        </section>
      </div>

      <div class="grid">
        <section>
          <h2>Genealogias y relaciones</h2>
          <ul>${relationshipItems || '<li>Sin relaciones registradas.</li>'}</ul>
        </section>
        <section>
          <h2>Sistemas de poder</h2>
          <ul>${magicItems || '<li>Sin sistemas de poder registrados.</li>'}</ul>
        </section>
      </div>

      <section>
        <h2>Conlangs y voces del mundo</h2>
        <ul>${conlangItems || '<li>Sin lenguas registradas.</li>'}</ul>
      </section>
    </main>
  </body>
</html>`;
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
  <AppVersion>0.3.0</AppVersion>
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
  const sceneBreakGlyph = (metadata.interiorFormat.sceneBreakGlyph || '* * *').trim() || '* * *';
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
  ${metadata.interiorFormat.widowOrphanControl ? 'orphans: 3;\n  widows: 3;' : ''}
}
.scene-break {
  text-align: center;
  letter-spacing: 0.35em;
  text-indent: 0;
}
.scene-break::before {
  content: "${escapeXml(sceneBreakGlyph)}";
}
${metadata.interiorFormat.dropCapEnabled || metadata.interiorFormat.chapterOpeningStyle === 'dropcap'
    ? `.chapter p:first-of-type::first-letter {
  float: left;
  font-size: 3em;
  line-height: 0.86;
  padding-right: 0.12em;
}`
    : ''}`;

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
  const sceneBreakGlyph = (interior.sceneBreakGlyph || '* * *').trim() || '* * *';
  const openingSelector =
    interior.chapterOpeningStyle === 'dropcap' || interior.dropCapEnabled
      ? `.chapter p:first-of-type::first-letter {
  float: left;
  font-size: 3.2em;
  line-height: 0.86;
  padding-right: 0.12em;
  font-family: "Palatino Linotype", "Book Antiqua", serif;
}`
      : interior.chapterOpeningStyle === 'ornamental'
        ? `.chapter p:first-of-type::before {
  content: "§";
  display: inline-block;
  margin-right: 0.45em;
  color: #8c6a2e;
  font-weight: 700;
}`
        : '';
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
  ${interior.widowOrphanControl ? 'orphans: 3;\n  widows: 3;' : ''}
}
.scene-break {
  text-align: center;
  letter-spacing: 0.35em;
  margin: 1.4em 0 1.1em;
  text-indent: 0;
}
.scene-break span {
  display: inline-block;
  padding-left: 0.35em;
}
${openingSelector}
/* glyph: ${sceneBreakGlyph} */`;
}

export function sanitizeChapterHtmlForExport(html: string): string {
  const sanitized = sanitizeHtmlForPreview(html);
  if (!sanitized.trim()) {
    return '<p></p>';
  }

  return sanitized.replace(
    /<p>\s*(\* \* \*|\*\*\*|~\s*~\s*~|—\s*—\s*—)\s*<\/p>/g,
    (_match, glyph: string) => `<p class="scene-break"><span>${escapeXml(glyph.replace(/\s+/g, ' ').trim())}</span></p>`,
  );
}

function buildBookInteriorHtml(metadata: BookMetadata, orderedChapters: ChapterDocument[]): string {
  const chaptersHtml = orderedChapters
    .map(
      (chapter, index) =>
        `<section class="chapter"><h2>${index + 1}. ${escapeXml(chapter.title)}</h2>${sanitizeChapterHtmlForExport(chapter.content)}</section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(metadata.title)}</title>
  <style>${buildInteriorCss(metadata)}</style>
</head>
<body>
  <section class="title-page">
    <h1>${escapeXml(metadata.title)}</h1>
    <p>${escapeXml(metadata.author)}</p>
    <p>${escapeXml(metadata.spineText || metadata.title)}</p>
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

export async function exportSagaCartographerPack(
  sagaPath: string,
  saga: SagaProject,
): Promise<string> {
  const archive = buildSagaCartographerPackArchive(saga);

  return writeBinaryExport(
    sagaPath,
    `${safeFileName(saga.metadata.title)}-pack-cartografo.zip`,
    archive,
    'zip',
  );
}

export async function exportSagaHistorianPack(
  sagaPath: string,
  saga: SagaProject,
): Promise<string> {
  const archive = buildSagaHistorianPackArchive(saga);

  return writeBinaryExport(
    sagaPath,
    `${safeFileName(saga.metadata.title)}-pack-cronologia.zip`,
    archive,
    'zip',
  );
}

export async function exportSagaBibleDossier(
  sagaPath: string,
  saga: SagaProject,
): Promise<string> {
  return writeTextExport(
    sagaPath,
    `${safeFileName(saga.metadata.title)}-biblia-de-saga.html`,
    buildSagaBibleDossierHtml(saga),
    'html',
  );
}

export async function exportBookEditorPack(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
  saga?: SagaProject | null,
): Promise<string> {
  const archive = buildBookEditorPackArchive(bookPath, metadata, orderedChapters, saga);

  return writeBinaryExport(
    bookPath,
    `${safeFileName(metadata.title)}-pack-editorial.zip`,
    archive,
    'zip',
  );
}

export async function exportBookLayoutPack(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
): Promise<string> {
  const archive = buildBookLayoutPackArchive(metadata, orderedChapters);

  return writeBinaryExport(
    bookPath,
    `${safeFileName(metadata.title)}-pack-maquetacion.zip`,
    archive,
    'zip',
  );
}

export async function exportBookConsultantPack(
  bookPath: string,
  metadata: BookMetadata,
  orderedChapters: ChapterDocument[],
  saga?: SagaProject | null,
): Promise<string> {
  const archive = buildBookConsultantPackArchive(bookPath, metadata, orderedChapters, saga);

  return writeBinaryExport(
    bookPath,
    `${safeFileName(metadata.title)}-pack-consultoria.zip`,
    archive,
    'zip',
  );
}

export function getChapterWordCount(chapter: ChapterDocument): number {
  const plain = stripHtml(chapter.content);
  if (!plain) {
    return 0;
  }

  return plain.split(/\s+/).filter(Boolean).length;
}
