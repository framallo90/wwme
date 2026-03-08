import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildBookConsultantPackArchive,
  buildBookEditorPackArchive,
  buildBookLayoutPackArchive,
  buildSagaCartographerPackArchive,
  buildSagaHistorianPackArchive,
} from '../src/lib/export';
import type { BookMetadata, ChapterDocument, SagaProject } from '../src/types/book';

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

class DomParserStub {
  parseFromString(value: string): { body: { textContent: string } } {
    const matched = value.match(/<body>([\s\S]*)<\/body>/i);
    const bodyHtml = matched ? matched[1] : value;
    return {
      body: {
        textContent: decodeEntities(
          bodyHtml
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
        ),
      },
    };
  }
}

Object.assign(globalThis, {
  DOMParser: DomParserStub,
});

function createMetadata(): BookMetadata {
  return {
    title: 'Demo Export QA',
    author: 'WriteWMe QA',
    chapterOrder: ['01', '02'],
    sagaId: 'saga-demo-export-qa',
    sagaPath: 'C:/sagas/demo-export-qa',
    sagaVolume: 1,
    coverImage: null,
    backCoverImage: null,
    spineText: 'Demo Export QA',
    foundation: {
      centralIdea: 'Persistencia y memoria en mundos largos.',
      promise: 'Saga consistente con riesgos visibles.',
      audience: 'Lectores de fantasia epica',
      narrativeVoice: 'sobria y precisa',
      styleRules: '',
      structureNotes: '',
      glossaryPreferred: '',
      glossaryAvoid: '',
    },
    storyBible: {
      characters: [
        {
          id: 'char-elara',
          name: 'Elara',
          aliases: 'La Heredera',
          role: 'Protagonista',
          traits: 'disciplinada',
          goal: 'sostener el reino',
          notes: '',
        },
      ],
      locations: [
        {
          id: 'loc-ciudadela',
          name: 'Ciudadela',
          aliases: '',
          description: 'Capital del norte',
          atmosphere: '',
          notes: '',
        },
      ],
      continuityRules: 'Elara no revela su plan hasta el capitulo 4.',
    },
    amazon: {
      presetType: 'intimate-narrative',
      marketplace: 'amazon.com',
      language: 'Espanol',
      kdpTitle: '',
      subtitle: '',
      penName: '',
      seriesName: '',
      edition: '',
      contributors: [],
      ownCopyright: true,
      isAdultContent: false,
      isbn: '',
      enableDRM: false,
      enrollKDPSelect: false,
      ebookRoyaltyPlan: 70,
      printCostEstimate: 3.5,
      marketPricing: [],
      keywords: [],
      categories: [],
      backCoverText: '',
      longDescription: '',
      authorBio: '',
      kdpNotes: '',
    },
    interiorFormat: {
      trimSize: '6x9',
      pageWidthIn: 6,
      pageHeightIn: 9,
      marginTopMm: 16,
      marginBottomMm: 16,
      marginInsideMm: 20,
      marginOutsideMm: 14,
      paragraphIndentEm: 1.2,
      lineHeight: 1.55,
      dropCapEnabled: false,
      sceneBreakGlyph: '* * *',
      widowOrphanControl: true,
      chapterOpeningStyle: 'standard',
    },
    isPublished: false,
    publishedAt: null,
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    chats: { book: [], chapters: {} },
  };
}

function createChapters(): ChapterDocument[] {
  return [
    {
      id: '01',
      title: 'Capitulo 1',
      content: '<p>Elara llega a la ciudadela.</p><p>La niebla tapa el puerto.</p>',
      lengthPreset: 'media',
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    },
    {
      id: '02',
      title: 'Capitulo 2',
      content: '<p>El consejo divide al reino.</p>',
      lengthPreset: 'media',
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    },
  ];
}

function createSaga(): SagaProject {
  return {
    path: 'C:/sagas/demo-export-qa',
    metadata: {
      id: 'saga-demo-export-qa',
      title: 'Saga Demo Export QA',
      description: 'Saga de prueba para QA de exportes.',
      books: [
        {
          bookId: 'book-1',
          bookPath: 'C:/books/vol-1',
          title: 'Volumen 1',
          author: 'WriteWMe QA',
          volumeNumber: 1,
          linkedAt: '2026-03-08T00:00:00.000Z',
        },
      ],
      worldBible: {
        overview: '',
        characters: [],
        locations: [
          { id: 'loc-ciudadela', name: 'Ciudadela', aliases: '', summary: '', notes: '' },
          { id: 'loc-puerto', name: 'Puerto', aliases: '', summary: '', notes: '' },
        ],
        routes: [{ id: 'route-main', name: 'Ruta Real', aliases: '', summary: '', notes: '' }],
        flora: [],
        fauna: [],
        factions: [],
        systems: [],
        artifacts: [],
        relationships: [],
        timeline: [
          {
            id: 'event-arrival',
            title: 'Llegada',
            category: 'journey',
            kind: 'point',
            startOrder: 1,
            endOrder: null,
            displayLabel: 'T1',
            summary: 'Elara llega a la ciudadela',
            notes: '',
            bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '01', mode: 'occurs' }],
            entityIds: ['loc-ciudadela'],
            characterImpacts: [],
            characterLocations: [{ characterId: 'char-elara', locationId: 'loc-ciudadela', notes: '' }],
          },
          {
            id: 'event-council',
            title: 'Consejo',
            category: 'political',
            kind: 'point',
            startOrder: 2,
            endOrder: null,
            displayLabel: 'T2',
            summary: 'Division interna del consejo',
            notes: '',
            dependencyIds: ['event-arrival'],
            bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '02', mode: 'occurs' }],
            entityIds: ['loc-puerto'],
            characterImpacts: [],
            characterLocations: [{ characterId: 'char-elara', locationId: 'loc-puerto', notes: '' }],
          },
        ],
        timelineLanes: [
          {
            id: 'lane-main',
            label: 'Linea principal',
            color: '#1f5f8b',
            era: 'Presente',
            description: '',
          },
        ],
        atlas: {
          mapImagePath: 'C:/maps/demo.png',
          distanceScale: 120,
          distanceUnit: 'km',
          defaultTravelMode: 'Caballo',
          showGrid: true,
          layers: [{ id: 'atlas-layer-main', name: 'Principal', description: '', color: '#1f5f8b', visible: true }],
          pins: [
            { id: 'pin-ciudadela', locationId: 'loc-ciudadela', label: 'Ciudadela', layerId: 'atlas-layer-main', xPct: 20, yPct: 42, notes: '' },
            { id: 'pin-puerto', locationId: 'loc-puerto', label: 'Puerto', layerId: 'atlas-layer-main', xPct: 64, yPct: 58, notes: '' },
          ],
          routeMeasurements: [
            {
              id: 'atlas-route-1',
              fromPinId: 'pin-ciudadela',
              toPinId: 'pin-puerto',
              routeId: 'route-main',
              distanceOverride: 85,
              travelHours: 18,
              notes: 'Ruta principal del reino',
            },
          ],
        },
        conlangs: [],
        magicSystems: [],
        globalRules: '',
        pinnedAiRules: '',
        glossary: '',
        secrets: [
          {
            id: 'secret-1',
            title: 'Pacto roto',
            summary: 'La alianza original fue quebrada.',
            objectiveTruth: 'El pacto se rompio en silencio.',
            notes: '',
            relatedEntityIds: ['loc-ciudadela'],
          },
        ],
      },
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    },
  };
}

function main(): void {
  const outputArg = process.argv[2] || 'reports/export-qa/e2e-latest';
  const outputDir = path.resolve(process.cwd(), outputArg);
  mkdirSync(outputDir, { recursive: true });

  const metadata = createMetadata();
  const chapters = createChapters();
  const saga = createSaga();
  const bookPath = saga.metadata.books[0]?.bookPath || 'C:/books/vol-1';

  const archives = [
    {
      name: 'demo-pack-cartografo.zip',
      bytes: buildSagaCartographerPackArchive(saga),
    },
    {
      name: 'demo-pack-cronologia.zip',
      bytes: buildSagaHistorianPackArchive(saga),
    },
    {
      name: 'demo-pack-editorial.zip',
      bytes: buildBookEditorPackArchive(bookPath, metadata, chapters, saga),
    },
    {
      name: 'demo-pack-maquetacion.zip',
      bytes: buildBookLayoutPackArchive(metadata, chapters),
    },
    {
      name: 'demo-pack-consultoria.zip',
      bytes: buildBookConsultantPackArchive(bookPath, metadata, chapters, saga),
    },
  ];

  const written: string[] = [];
  for (const archive of archives) {
    const filePath = path.join(outputDir, archive.name);
    writeFileSync(filePath, Buffer.from(archive.bytes));
    written.push(filePath);
  }

  writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), files: written }, null, 2),
    'utf8',
  );

  for (const filePath of written) {
    console.log(filePath);
  }
}

main();
