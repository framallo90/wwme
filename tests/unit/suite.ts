import assert from 'node:assert/strict';
import {
  getChapterLengthInstruction,
  getChapterLengthProfile,
  resolveChapterLengthPreset,
} from '../../src/lib/chapterLength';
import {
  APP_LANGUAGE_OPTIONS,
  getLanguageDisplayName,
  getLanguageInstruction,
  isLanguageCodeFormatValid,
  normalizeLanguageCode,
  resolveLanguageSelectValue,
} from '../../src/lib/language';
import {
  buildAmazonCopyPack,
  buildAmazonMetadataCsv,
  generateAmazonCopy,
  applyAmazonPreset,
  categoriesAsLines,
  keywordsAsLines,
  sanitizeKdpDescriptionHtml,
} from '../../src/lib/amazon';
import {
  AMAZON_LIMITS,
  estimateEbookRoyalty,
  estimatePrintRoyalty,
  getAmazonFieldCounters,
  validateAmazonMetadata,
} from '../../src/lib/amazonValidation';
import {
  buildActionPrompt,
  buildAutoRewritePrompt,
  buildSagaWorldBlock,
  buildChatPrompt,
  buildContinuityGuardPrompt,
  buildContinuousChapterPrompt,
  buildFoundationBlock,
  parseContinuousAgentOutput,
  parseContinuityGuardOutput,
  selectStoryBibleForPrompt,
} from '../../src/lib/prompts';
import { buildUnifiedStoryBibleIndex } from '../../src/lib/canon';
import {
  htmlToMarkdown,
  joinPath,
  normalizePath,
  plainTextToHtml,
  sanitizeHtmlForPreview,
  safeFileName,
  slugify,
  stripUtf8Bom,
  splitAiOutputAndSummary,
} from '../../src/lib/text';
import { parseLocaleIntegerOr, parseLocaleNumber, parseLocaleNumberOr } from '../../src/lib/numberInput';
import { buildBookReplacePreview, replaceMatchesInTextLiteral } from '../../src/lib/searchReplace';
import {
  countWordsFromHtml,
  countWordsFromPlainText,
  estimatePagesFromWords,
  formatNumber,
} from '../../src/lib/metrics';
import { diffTextBlocks, summarizeDiffOperations } from '../../src/lib/diff';
import { createZipArchive } from '../../src/lib/zip';
import { analyzePlainTextStyle, analyzeHtmlStyle, getStyleLevelLabel } from '../../src/lib/styleMetrics';
import { buildEditorialChecklist } from '../../src/lib/editorialChecklist';
import {
  buildCollaborationPatchPreview,
  formatCollaborationPatchPreviewMessage,
} from '../../src/lib/collaborationPatchPreview';
import { buildCharacterTrackingReport, formatCharacterTrackingReport } from '../../src/lib/characterTracking';
import { normalizeChapterRange, sliceByChapterRange } from '../../src/lib/chapterRange';
import { buildKdpMarketInsight } from '../../src/lib/kdpMarketRules';
import { buildStoryBibleAutoSyncFromChapter } from '../../src/lib/storyBibleSync';
import {
  buildStoryProgressDigest,
  buildStoryProgressPrompt,
  formatStoryProgressFallback,
} from '../../src/lib/storyProgressSummary';
import { buildContinuityGuardReport, buildContinuityHighlights } from '../../src/lib/continuityGuard';
import { buildChapterContinuityBriefing } from '../../src/lib/chapterContinuityBriefing';
import {
  buildSemanticReferenceCatalog,
  buildSemanticReferenceShortcode,
  convertSemanticReferenceShortcodesToHtml,
  findSemanticReferenceMatch,
} from '../../src/lib/semanticReferences';
import { applyBookCreationTemplate } from '../../src/lib/projectTemplates';
import {
  buildBookConsultantPackArchive,
  buildBookEditorPackArchive,
  buildBookLayoutPackArchive,
  buildSagaBibleDossierHtml,
  buildSagaCartographerPackArchive,
  buildSagaHistorianPackArchive,
  sanitizeChapterHtmlForExport,
} from '../../src/lib/export';
import { buildPlotBoardModel, getPlotStageLabel } from '../../src/lib/plotBoard';
import { buildSagaConsistencyReport } from '../../src/lib/sagaConsistency';
import { buildWorldMapModel } from '../../src/lib/worldMap';
import { buildRelationshipGraphModel } from '../../src/lib/relationshipGraph';
import { extractZipEntryText, parseStoredZipEntries } from '../../src/lib/zipInspect';
import {
  buildBackupSnapshotFolderName,
  buildBackupSnapshotManifest,
  detectBookMetadataQuickFixIssues,
  formatBackupSnapshotStamp,
} from '../../src/lib/storage';
import { buildOllamaServiceStatus, extractOllamaModelNames } from '../../src/lib/ollamaClient';
import { buildTimelineOverviewModel } from '../../src/lib/timelineOverview';
import {
  applyImpactDrivenVersioning,
  applyTimeskipToCharacterVersions,
  eventIndexForId,
  isKnownRelationshipType,
  renameSagaIdEverywhere,
  suggestArtifactTransferOwnersForEvent,
  suggestCharacterLocationsForEvent,
  suggestRelationshipTypes,
} from '../../src/lib/sagaAutomation';
import {
  buildBookAudioExportPath,
  buildBookAudioText,
  buildChapterAudioExportPath,
  buildChapterAudioText,
  pickSpeechVoice,
  resolveSpeechLanguageTag,
} from '../../src/lib/audio';
import type { AppConfig, BookFoundation, BookMetadata, ChapterDocument, InteriorFormat, SagaProject, StoryBible } from '../../src/types/book';

interface ElementLike {
  innerHTML: string;
  textContent: string;
  value?: string;
}

interface TextNodeLike {
  textContent: string;
}

interface BodyLike {
  innerHTML: string;
  textContent: string;
  __textNode: TextNodeLike;
}

interface DomDocumentLike {
  body: BodyLike;
  createTreeWalker: (_root: BodyLike, _whatToShow: number) => {
    nextNode: () => TextNodeLike | null;
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToText(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

function createBodyLike(initialHtml: string): BodyLike {
  const textNode: TextNodeLike = { textContent: htmlToText(initialHtml) };
  let html = initialHtml;

  return {
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
      textNode.textContent = htmlToText(value);
    },
    get textContent() {
      return textNode.textContent;
    },
    set textContent(value: string) {
      textNode.textContent = value;
      html = value;
    },
    __textNode: textNode,
  };
}

function createDomDocumentStub(html: string): DomDocumentLike {
  const body = createBodyLike(html);

  return {
    body,
    createTreeWalker(root: BodyLike) {
      let consumed = false;
      const node = root.__textNode;

      return {
        nextNode() {
          if (consumed) {
            return null;
          }
          consumed = true;

          return {
            get textContent() {
              return node.textContent;
            },
            set textContent(value: string) {
              node.textContent = value ?? '';
              root.textContent = node.textContent;
            },
          };
        },
      };
    },
  };
}

function installDomStub(): void {
  const documentStub: {
    createElement: (tag: string) => ElementLike;
    createTreeWalker: (root: BodyLike, whatToShow: number) => { nextNode: () => TextNodeLike | null };
  } = {
    createElement(tag: string): ElementLike {
      const lower = tag.toLowerCase();
      let html = '';
      let text = '';
      return {
        get innerHTML() {
          return html;
        },
        set innerHTML(value: string) {
          html = value;
          if (lower === 'textarea') {
            text = decodeEntities(value);
            this.value = text;
            return;
          }

          text = htmlToText(value);
        },
        get textContent() {
          return text;
        },
        set textContent(value: string) {
          text = value;
        },
        value: '',
      };
    },
    createTreeWalker(root: BodyLike, whatToShow: number) {
      return createDomDocumentStub(root.innerHTML).createTreeWalker(root, whatToShow);
    },
  };

  class DomParserStub {
    parseFromString(value: string): DomDocumentLike {
      const matched = value.match(/<body>([\s\S]*)<\/body>/i);
      const bodyHtml = matched ? matched[1] : value;
      return createDomDocumentStub(bodyHtml);
    }
  }

  Object.assign(globalThis, {
    document: documentStub,
    DOMParser: DomParserStub,
    NodeFilter: { SHOW_TEXT: 4 },
  });
}

function createFoundation(): BookFoundation {
  return {
    centralIdea: 'La memoria tambien escribe.',
    promise: 'Un metodo claro para convertir recuerdos en novela.',
    audience: 'Escritores de narrativa intima',
    narrativeVoice: 'intima y sobria',
    styleRules: 'frases limpias, sin relleno',
    structureNotes: '3 actos, giro en capitulo 5',
    glossaryPreferred: 'faro, niebla, puerto',
    glossaryAvoid: 'milagro, energia',
  };
}

function createInterior(trimSize: InteriorFormat['trimSize'] = '6x9'): InteriorFormat {
  return {
    trimSize,
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
  };
}

function createStoryBible(): StoryBible {
  return {
    characters: [
      {
        id: 'char-lena',
        name: 'Lena',
        aliases: 'Helena, la chica del faro',
        role: 'Protagonista',
        traits: 'cinica, observadora, impulsiva bajo presion',
        goal: 'encontrar a su hermano desaparecido',
        notes: 'evita confiar rapido en figuras de autoridad',
      },
    ],
    locations: [
      {
        id: 'loc-bar',
        name: 'Bar El Muelle',
        aliases: 'bar del puerto, el muelle',
        description: 'bar pequeño frente al puerto',
        atmosphere: 'humo, tension, secretos',
        notes: 'punto de encuentro de contrabandistas',
      },
    ],
    continuityRules: 'Lena no revela su objetivo real hasta el capitulo 4.',
  };
}

function createMetadata(): BookMetadata {
  return {
    title: 'El faro y la niebla',
    author: 'Demo WriteWMe',
    chapterOrder: ['01'],
    sagaId: null,
    sagaPath: null,
    sagaVolume: null,
    coverImage: null,
    backCoverImage: null,
    spineText: 'El faro y la niebla',
    foundation: createFoundation(),
    storyBible: createStoryBible(),
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
      marketPricing: [
        { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 4.99, printPrice: 12.99 },
      ],
      keywords: [],
      categories: [],
      backCoverText: '',
      longDescription: '',
      authorBio: '',
      kdpNotes: '',
    },
    interiorFormat: createInterior(),
    isPublished: false,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    chats: { book: [], chapters: {} },
  };
}

function createConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    model: 'llama3.2:3b',
    language: 'es',
    systemPrompt: '',
    temperature: 0.6,
    audioVoiceName: '',
    audioRate: 1,
    audioVolume: 1,
    aiResponseMode: 'equilibrado',
    autoVersioning: true,
    aiSafeMode: true,
    autoApplyChatChanges: false,
    bookAutoApplyEnabled: false,
    chatApplyIterations: 1,
    continuousAgentEnabled: false,
    continuousAgentMaxRounds: 3,
    continuityGuardEnabled: true,
    ollamaOptions: {},
    autosaveIntervalMs: 2000,
    backupEnabled: false,
    backupDirectory: '',
    backupIntervalMs: 120000,
    expertWriterMode: false,
    accessibilityHighContrast: false,
    accessibilityLargeText: false,
    ...overrides,
  };
}

function createChapters(): ChapterDocument[] {
  return [
  {
      id: '01',
      title: 'Capitulo 1',
      content: '<p>El faro corta la niebla con una luz azul.</p><p>Aria avanza.</p>',
      lengthPreset: 'media',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

function createSagaFixture(): SagaProject {
  return {
    path: 'C:/sagas/cronicas-del-faro',
    metadata: {
      id: 'saga-faro',
      title: 'Cronicas del Faro',
      description: 'Saga de prueba para continuidad.',
      books: [
        {
          bookId: 'book-1',
          bookPath: 'C:/books/vol-1',
          title: 'Volumen 1',
          author: 'Demo',
          volumeNumber: 1,
          linkedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      worldBible: {
        overview: '',
        characters: [
          {
            id: 'char-elara',
            name: 'Elara',
            aliases: 'La Heredera',
            summary: 'Heroina central',
            notes: '',
            aliasTimeline: [
              {
                id: 'alias-1',
                value: 'La Heredera',
                type: 'title',
                startOrder: 10,
                endOrder: null,
                notes: 'Tras la coronacion',
              },
            ],
            lifecycle: {
              birthEventId: 'event-birth',
              deathEventId: 'event-death',
              firstAppearanceEventId: 'event-arrival',
              lastKnownEventId: 'event-death',
              currentStatus: 'dead',
            },
          },
        ],
        locations: [
          {
            id: 'loc-ciudadela',
            name: 'Ciudadela del Norte',
            aliases: '',
            summary: 'Capital del reino.',
            notes: 'Centro politico',
          },
          {
            id: 'loc-puerto',
            name: 'Puerto Bruma',
            aliases: '',
            summary: 'Puerto principal.',
            notes: 'Entrada al reino',
          },
        ],
        routes: [
          {
            id: 'route-hielo',
            name: 'Camino del Hielo',
            aliases: '',
            summary: 'Ruta entre la capital y el puerto.',
            notes: 'Transitaba el ejercito',
          },
        ],
        flora: [],
        fauna: [],
        factions: [
          {
            id: 'faction-corona',
            name: 'La Corona del Norte',
            aliases: '',
            summary: 'Faccion regente',
            notes: '',
          },
        ],
        systems: [],
        artifacts: [],
        relationships: [
          {
            id: 'rel-1',
            from: { kind: 'character', id: 'char-elara' },
            to: { kind: 'faction', id: 'faction-corona' },
            type: 'lidera',
            notes: 'Tras la coronacion',
          },
          {
            id: 'rel-2',
            from: { kind: 'location', id: 'loc-ciudadela' },
            to: { kind: 'location', id: 'loc-puerto' },
            type: 'conecta',
            notes: 'Ruta comercial central',
          },
        ],
        timeline: [
          {
            id: 'event-birth',
            title: 'Nacimiento de Elara',
            category: 'birth',
            kind: 'point',
            startOrder: 2,
            endOrder: null,
            displayLabel: 'A-2',
            summary: '',
            notes: '',
            bookRefs: [],
            entityIds: [],
            characterImpacts: [{ characterId: 'char-elara', impactType: 'birth', aliasUsed: '', stateChange: 'Nace' }],
          },
          {
            id: 'event-arrival',
            title: 'Llegada al reino',
            category: 'journey',
            kind: 'point',
            startOrder: 5,
            endOrder: null,
            displayLabel: 'A-5',
            summary: '',
            notes: '',
            bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '01', mode: 'occurs' }],
            entityIds: ['char-elara'],
            characterImpacts: [{ characterId: 'char-elara', impactType: 'appearance', aliasUsed: 'Elara', stateChange: 'Entra en escena' }],
          },
          {
            id: 'event-crowning',
            title: 'Coronacion',
            category: 'political',
            kind: 'point',
            startOrder: 10,
            endOrder: null,
            displayLabel: 'A-10',
            summary: '',
            notes: '',
            bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '07', mode: 'occurs' }],
            entityIds: ['char-elara'],
            characterImpacts: [{ characterId: 'char-elara', impactType: 'identity-change', aliasUsed: 'La Heredera', stateChange: 'Asume el titulo' }],
          },
          {
            id: 'event-death',
            title: 'Caida final',
            category: 'death',
            kind: 'point',
            startOrder: 20,
            endOrder: null,
            displayLabel: 'A-20',
            summary: '',
            notes: '',
            bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '12', mode: 'occurs' }],
            entityIds: ['char-elara'],
            characterImpacts: [{ characterId: 'char-elara', impactType: 'death', aliasUsed: 'La Heredera', stateChange: 'Muere' }],
          },
        ],
        timelineLanes: [],
        atlas: {
          mapImagePath: '',
          distanceScale: 100,
          distanceUnit: 'km',
          defaultTravelMode: 'Caballo',
          showGrid: true,
          layers: [],
          pins: [],
          routeMeasurements: [],
        },
        conlangs: [],
        magicSystems: [],
        globalRules: '',
        pinnedAiRules: '',
        glossary: '',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

interface TestCase {
  name: string;
  run: () => void;
}

installDomStub();

const tests: TestCase[] = [
  {
    name: 'text: normaliza paths y nombres seguros',
    run: () => {
      assert.equal(normalizePath('C:\\libros\\\\novela'), 'C:/libros/novela');
      assert.equal(joinPath('C:/libros/', '/novela', 'chapters'), 'C:/libros/novela/chapters');
      assert.equal(slugify('  Mi Novela!!!  '), 'mi-novela');
      assert.equal(safeFileName('capitulo 1?.md'), 'capitulo-1--md');
    },
  },
  {
    name: 'storage: backup snapshot usa timestamp legible y manifest estable',
    run: () => {
      assert.equal(formatBackupSnapshotStamp('2026-03-06T12:34:56.000Z'), '20260306-123456');
      assert.equal(
        buildBackupSnapshotFolderName('C:/Libros/La Decalogia', '2026-03-06T12:34:56.000Z'),
        '20260306-123456-La-Decalogia',
      );

      const manifest = buildBackupSnapshotManifest({
        createdAt: '2026-03-06T12:34:56.000Z',
        sourceBookPath: 'C:\\Libros\\La Decalogia',
        linkedSagaPath: 'C:\\Sagas\\Reino',
        snapshotFolderName: '20260306-123456-La-Decalogia',
        items: [
          {
            kind: 'book',
            sourcePath: 'C:\\Libros\\La Decalogia',
            targetRelativePath: 'La-Decalogia',
            copied: true,
          },
          {
            kind: 'saga',
            sourcePath: 'C:\\Sagas\\Reino',
            targetRelativePath: 'linked-saga/Reino',
            copied: false,
            note: 'No se encontro saga.json en la ruta vinculada.',
          },
        ],
      });

      assert.equal(manifest.sourceBookPath, 'C:/Libros/La Decalogia');
      assert.equal(manifest.linkedSagaPath, 'C:/Sagas/Reino');
      assert.equal(manifest.items[1].targetRelativePath, 'linked-saga/Reino');
      assert.equal(manifest.items[1].copied, false);
    },
  },
  {
    name: 'ollama: detecta modelos instalados y diferencia servicio listo vs modelo faltante',
    run: () => {
      const models = extractOllamaModelNames({
        models: [
          { name: 'llama3.2:3b' },
          { model: 'mistral:7b' },
          { name: 'llama3.2:3b' },
        ],
      });
      assert.deepEqual(models, ['llama3.2:3b', 'mistral:7b']);

      const ready = buildOllamaServiceStatus('llama3.2:3b', models);
      assert.equal(ready.state, 'ready');
      assert.ok(ready.message.includes('Modelo detectado'));

      const missing = buildOllamaServiceStatus('qwen2.5:7b', models);
      assert.equal(missing.state, 'missing-model');
      assert.ok(missing.message.includes('no esta descargado'));
    },
  },
  {
    name: 'timeline overview: calcula escala y huecos mas grandes por orden o anos',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline.splice(2, 0, {
        id: 'event-timeskip',
        title: 'Exilio de dos siglos',
        category: 'timeskip',
        kind: 'point',
        startOrder: 8,
        endOrder: null,
        displayLabel: 'A-8',
        summary: '',
        notes: '',
        timeJumpYears: 200,
        bookRefs: [],
        entityIds: [],
        characterImpacts: [],
      });

      const withYears = buildTimelineOverviewModel(saga.metadata.worldBible.timeline);
      assert.equal(withYears.axisMode, 'years');
      assert.equal(withYears.topGaps[0]?.distance, 200);
      assert.equal(withYears.markers[0]?.positionPct, 0);
      assert.equal(withYears.markers[withYears.markers.length - 1]?.positionPct, 100);

      const byOrder = buildTimelineOverviewModel(createSagaFixture().metadata.worldBible.timeline);
      assert.equal(byOrder.axisMode, 'order');
      assert.equal(byOrder.topGaps[0]?.distance, 10);
    },
  },
  {
    name: 'text: convierte plain text a html escapando entidades',
    run: () => {
      const html = plainTextToHtml('Linea & una\nlinea 2\n\n<bloque>');
      assert.equal(html, '<p>Linea &amp; una<br>linea 2</p><p>&lt;bloque&gt;</p>');
    },
  },
  {
    name: 'text: separa resumen final de cambios para no contaminar editor',
    run: () => {
      const parsed = splitAiOutputAndSummary(
        'Texto final del capitulo.\n\nResumen de cambios:\n- Ajuste de ritmo\n- Mejor transicion\n- Voz consistente\n- Menos repeticion\n- Mejor cierre',
      );
      assert.equal(parsed.cleanText, 'Texto final del capitulo.');
      assert.equal(parsed.summaryBullets.length, 5);
      assert.ok(parsed.summaryText.includes('Ajuste de ritmo'));
    },
  },
  {
    name: 'text: limpia cabeceras de control del agente continuo',
    run: () => {
      const parsed = splitAiOutputAndSummary(
        'ESTADO: CONTINUE\nRESUMEN: Ajuste de tono y continuidad.\nTEXTO:\nLena cruza el muelle sin mirar atras.',
      );
      assert.equal(parsed.cleanText, 'Lena cruza el muelle sin mirar atras.');
      assert.ok(parsed.summaryText.includes('Ajuste de tono'));
    },
  },
  {
    name: 'text: separa resumen inline con bullets unicode al final',
    run: () => {
      const parsed = splitAiOutputAndSummary(
        'Lena cruza el muelle en silencio.\n\n\u2022 Ajuste de ritmo \u2022 Menos adjetivos \u2022 Continuidad reforzada \u2022 Cierre mas directo',
      );
      assert.equal(parsed.cleanText, 'Lena cruza el muelle en silencio.');
      assert.equal(parsed.summaryBullets.length, 4);
      assert.ok(parsed.summaryText.includes('Continuidad reforzada'));
    },
  },
  {
    name: 'prompts: parsea salida continua con metadatos en HTML',
    run: () => {
      const parsed = parseContinuousAgentOutput(
        '<p>ESTADO: CONTINUE<br>RESUMEN: Mantener tension y foco.</p><p>Lena entra al bar y evita saludar.</p>',
      );
      assert.equal(parsed.status, 'CONTINUE');
      assert.equal(parsed.summary, 'Mantener tension y foco.');
      assert.equal(parsed.text, 'Lena entra al bar y evita saludar.');
    },
  },
  {
    name: 'text: markdown simple desde html',
    run: () => {
      const markdown = htmlToMarkdown('<h2>Titulo</h2><p>Texto <strong>fuerte</strong></p>');
      assert.equal(markdown, '## Titulo\n\nTexto **fuerte**');
    },
  },
  {
    name: 'text: sanitiza html peligroso para preview',
    run: () => {
      const sanitized = sanitizeHtmlForPreview(
        '<p onclick="alert(1)" style="color:red">Hola</p><script>alert(1)</script><a href="javascript:alert(2)" onmouseover="x()">link</a><img src="javascript:alert(3)">',
      );

      assert.ok(!sanitized.toLowerCase().includes('<script'));
      assert.ok(!sanitized.toLowerCase().includes('onclick='));
      assert.ok(!sanitized.toLowerCase().includes('onmouseover='));
      assert.ok(!sanitized.toLowerCase().includes('style='));
      assert.ok(sanitized.includes('<p>Hola</p>'));
      assert.ok(sanitized.includes('href="#"'));
      assert.ok(sanitized.includes('src="#"'));
      assert.equal(
        sanitizeHtmlForPreview('<a href="https://example.com">ok</a>'),
        '<a href="https://example.com">ok</a>',
      );
    },
  },
  {
    name: 'export: sanitiza html peligroso antes de interior-kdp',
    run: () => {
      const sanitized = sanitizeChapterHtmlForExport(
        '<p onclick="x()" style="color:red">Hola</p><script>alert(1)</script><a href="javascript:alert(2)">link</a><img src="javascript:alert(3)">',
      );

      assert.ok(!sanitized.toLowerCase().includes('<script'));
      assert.ok(!sanitized.toLowerCase().includes('onclick='));
      assert.ok(!sanitized.toLowerCase().includes('style='));
      assert.ok(sanitized.includes('href="#"'));
      assert.ok(sanitized.includes('src="#"'));
      assert.ok(sanitized.includes('<p>Hola</p>'));
    },
  },
  {
    name: 'text: elimina BOM UTF-8 al inicio',
    run: () => {
      assert.equal(stripUtf8Bom('\uFEFF{"ok":true}'), '{"ok":true}');
      assert.equal(stripUtf8Bom('{"ok":true}'), '{"ok":true}');
    },
  },
  {
    name: 'storage: detecta quick-fix cuando book.json no tiene chats',
    run: () => {
      const issues = detectBookMetadataQuickFixIssues({
        title: 'Libro',
        author: 'Autor',
        chapterOrder: ['01'],
        sagaId: null,
        sagaPath: null,
        sagaVolume: null,
        coverImage: null,
        backCoverImage: null,
        spineText: 'Libro',
        foundation: {},
        storyBible: {},
        amazon: {},
        interiorFormat: {},
        isPublished: false,
        publishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      assert.ok(issues.some((entry) => entry.includes('chats')));
    },
  },
  {
    name: 'numbers: parsea coma/punto y evita NaN en fallback',
    run: () => {
      assert.equal(parseLocaleNumber('4,50'), 4.5);
      assert.equal(parseLocaleNumber('1.234,56'), 1234.56);
      assert.equal(parseLocaleNumber('1,234.56'), 1234.56);
      assert.equal(parseLocaleNumber(''), null);
      assert.equal(parseLocaleNumberOr('.', 0.6, { min: 0, max: 2 }), 0.6);
      assert.equal(parseLocaleIntegerOr('', 5000, { min: 1000 }), 5000);
      assert.equal(parseLocaleIntegerOr('850', 5000, { min: 1000 }), 1000);
    },
  },
  {
    name: 'searchReplace: reemplaza literal sin interpretar $',
    run: () => {
      const replaced = replaceMatchesInTextLiteral('Dolar y Dolar', 'Dolar', 'g', '$');
      assert.equal(replaced.text, '$ y $');
      assert.equal(replaced.replacements, 2);
    },
  },
  {
    name: 'searchReplace: simula reemplazo global por capitulo',
    run: () => {
      const preview = buildBookReplacePreview(
        [
          {
            id: '01',
            title: 'Capitulo 1',
            content: 'Lena entra al bar. Lena sale del bar.',
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: '02',
            title: 'Capitulo 2',
            content: 'Bruno vigila el puerto.',
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        'Lena',
        'Helena',
        { caseSensitive: false, wholeWord: true },
      );

      assert.equal(preview.query, 'Lena');
      assert.equal(preview.totalMatches, 2);
      assert.equal(preview.affectedChapters, 1);
      assert.equal(preview.items.length, 1);
      assert.equal(preview.items[0].chapterId, '01');
      assert.ok(preview.items[0].afterSample.includes('Helena'));
    },
  },
  {
    name: 'editorialChecklist: bloquea sin portada y precios',
    run: () => {
      const metadata = createMetadata();
      metadata.amazon.kdpTitle = 'Titulo KDP';
      metadata.amazon.penName = 'Autor Demo';
      metadata.amazon.longDescription = 'x'.repeat(250);
      metadata.amazon.categories = ['Libros > Literatura y ficcion > Ensayos'];
      metadata.amazon.keywords = ['uno', 'dos', '', '', '', '', ''];
      metadata.amazon.marketPricing = [];

      const report = buildEditorialChecklist(metadata, createConfig({ language: 'en' }));
      assert.equal(report.isReady, false);
      assert.ok(report.errors.some((issue) => issue.id === 'cover.missing'));
      assert.ok(report.errors.some((issue) => issue.id === 'pricing.missing'));
      assert.ok(report.warnings.some((issue) => issue.id === 'language.mismatch'));
    },
  },
  {
    name: 'editorialChecklist: habilita continuar con minimos completos',
    run: () => {
      const metadata = createMetadata();
      metadata.coverImage = 'assets/cover.jpg';
      metadata.backCoverImage = 'assets/back.jpg';
      metadata.amazon.kdpTitle = 'El faro y la niebla';
      metadata.amazon.penName = 'Demo WriteWMe';
      metadata.amazon.longDescription = 'x'.repeat(280);
      metadata.amazon.categories = ['Libros > Literatura y ficcion > Ensayos'];
      metadata.amazon.keywords = ['uno', 'dos', 'tres', '', '', '', ''];
      metadata.amazon.marketPricing = [
        { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 4.99, printPrice: 12.99 },
      ];

      const report = buildEditorialChecklist(metadata, createConfig({ language: 'es' }));
      assert.equal(report.isReady, true);
      assert.equal(report.errors.length, 0);
      assert.ok(report.score >= 70);
    },
  },
  {
    name: 'editorialChecklist: incorpora items personalizados pendientes y resueltos',
    run: () => {
      const metadata = createMetadata();
      metadata.coverImage = 'assets/cover.jpg';
      metadata.backCoverImage = 'assets/back.jpg';
      metadata.amazon.kdpTitle = 'El faro y la niebla';
      metadata.amazon.penName = 'Demo WriteWMe';
      metadata.amazon.longDescription = 'x'.repeat(280);
      metadata.amazon.categories = ['Libros > Literatura y ficcion > Ensayos'];
      metadata.amazon.keywords = ['uno', 'dos', 'tres', '', '', '', ''];
      metadata.amazon.marketPricing = [
        { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 4.99, printPrice: 12.99 },
      ];
      metadata.editorialChecklistCustom = [
        {
          id: 'custom-1',
          title: 'Revisar dialogos del antagonista',
          description: 'Verificar tension y subtexto en cada escena clave.',
          level: 'warning',
          checked: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'custom-2',
          title: 'Cerrar simbolo del reloj',
          description: 'Comprobar su resolucion en el ultimo tercio.',
          level: 'error',
          checked: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      const report = buildEditorialChecklist(metadata, createConfig({ language: 'es' }));
      assert.equal(report.isReady, true);
      assert.ok(report.warnings.some((issue) => issue.id === 'editorial.custom.custom-1'));
      assert.equal(report.errors.some((issue) => issue.id === 'editorial.custom.custom-2'), false);
    },
  },
  {
    name: 'storyBibleSync: detecta personajes y lugares nuevos desde capitulo',
    run: () => {
      const storyBible = createStoryBible();
      const sync = buildStoryBibleAutoSyncFromChapter(storyBible, {
        id: '02',
        title: 'Capitulo 2',
        content:
          '<p>En Puerto Umbral, Bruno espera a Lena bajo la lluvia.</p><p>Bruno vuelve al Puerto Umbral con el Comisario Vega.</p>',
      });

      assert.ok(sync.addedCharacters.some((entry) => entry.name === 'Bruno'));
      assert.ok(sync.addedLocations.some((entry) => entry.name === 'Puerto Umbral'));
      assert.equal(sync.nextStoryBible.characters.length, storyBible.characters.length + sync.addedCharacters.length);
      assert.equal(sync.nextStoryBible.locations.length, storyBible.locations.length + sync.addedLocations.length);
    },
  },
  {
    name: 'storyBibleSync: evita duplicar entidades ya existentes',
    run: () => {
      const storyBible = createStoryBible();
      const sync = buildStoryBibleAutoSyncFromChapter(storyBible, {
        id: '03',
        title: 'Capitulo 3',
        content: '<p>Lena vuelve al Bar El Muelle y habla con Lena.</p>',
      });

      assert.equal(sync.addedCharacters.length, 0);
      assert.equal(sync.addedLocations.length, 0);
      assert.equal(sync.nextStoryBible.characters.length, storyBible.characters.length);
      assert.equal(sync.nextStoryBible.locations.length, storyBible.locations.length);
    },
  },
  {
    name: 'storyBibleSync: evita falsos positivos comunes en espanol',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters = [];
      storyBible.locations = [];
      storyBible.continuityRules = '';

      const sync = buildStoryBibleAutoSyncFromChapter(storyBible, {
        id: '04',
        title: 'Capitulo 4',
        content:
          '<p>Con la lluvia encima, Lena cruza el puerto sin mirar atras.</p><p>Habia silencio en la cubierta.</p><p>Bruno espera en Puerto Umbral.</p>',
      });

      assert.ok(sync.addedLocations.some((entry) => entry.name === 'Puerto Umbral'));
      assert.equal(
        sync.addedLocations.some((entry) => ['Con', 'Habia', 'Lena'].includes(entry.name)),
        false,
      );
    },
  },
  {
    name: 'characterTracking: rastrea menciones por nombre y alias en todo el libro',
    run: () => {
      const report = buildCharacterTrackingReport({
        requestedName: 'Lena',
        storyBible: createStoryBible(),
        chapters: [
          {
            id: '01',
            title: 'Capitulo 1',
            content: '<p>Lena entra al bar. Helena observa la puerta.</p>',
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: '02',
            title: 'Capitulo 2',
            content: '<p>La chica del faro corre hacia el muelle.</p><p>Bruno intenta detenerla.</p>',
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      assert.ok(report.mentions.length >= 3);
      assert.equal(report.mentionsByChapter.length, 2);
      assert.ok(report.trackedTerms.some((term) => term.toLowerCase().includes('helena')));
      const formatted = formatCharacterTrackingReport(report);
      assert.ok(formatted.includes('Seguimiento de personaje'));
      assert.ok(formatted.includes('Capitulo 1 - Capitulo 1'));
      assert.ok(formatted.includes('Capitulo 2 - Capitulo 2'));
    },
  },
  {
    name: 'characterTracking: devuelve mensaje claro sin menciones',
    run: () => {
      const report = buildCharacterTrackingReport({
        requestedName: 'Nora',
        storyBible: createStoryBible(),
        chapters: createChapters(),
      });

      assert.equal(report.mentions.length, 0);
      const formatted = formatCharacterTrackingReport(report);
      assert.ok(formatted.includes('No encontre menciones'));
    },
  },
  {
    name: 'characterTracking: incluye aliases de SagaWorldBible si no estan en story bible',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters = storyBible.characters.filter((entry) => entry.name !== 'Lena');

      const sagaWorld = createSagaFixture().metadata.worldBible;
      sagaWorld.characters.push({
        id: 'char-lena-saga',
        name: 'Lena',
        aliases: 'La chica del faro',
        summary: '',
        notes: '',
        aliasTimeline: [
          {
            id: 'alias-lena-helena',
            value: 'Helena',
            type: 'nickname',
            startOrder: null,
            endOrder: null,
            notes: '',
          },
        ],
        lifecycle: {
          birthEventId: null,
          deathEventId: null,
          firstAppearanceEventId: null,
          lastKnownEventId: null,
          currentStatus: 'alive',
        },
        versions: [],
      });

      const report = buildCharacterTrackingReport({
        requestedName: 'Helena',
        storyBible,
        sagaWorld,
        chapters: [
          {
            id: '01',
            title: 'Capitulo 1',
            content: '<p>Helena entra al puerto y evita mirar el faro.</p>',
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      assert.ok(report.trackedTerms.includes('Helena'));
      assert.ok(report.trackedTerms.includes('Lena'));
      assert.ok(report.mentions.length > 0);
      assert.equal(report.canonicalName, 'Lena');
    },
  },
  {
    name: 'continuityGuard: genera terminos resaltables para biblia activa',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters.push({
        id: 'char-stopword',
        name: 'La',
        aliases: '',
        role: '',
        traits: '',
        goal: '',
        notes: '',
      });
      const highlights = buildContinuityHighlights(storyBible);
      assert.ok(highlights.some((entry) => entry.kind === 'character' && entry.term === 'Lena'));
      assert.ok(highlights.some((entry) => entry.kind === 'location' && entry.term === 'Bar El Muelle'));
      assert.ok(highlights.some((entry) => entry.term.toLowerCase().includes('helena')));
      assert.equal(highlights.some((entry) => entry.term === 'La'), false);
    },
  },
  {
    name: 'continuityGuard: detecta contradiccion de regla no revela y lesion de brazo',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].notes = 'Brazo derecho inmovilizado desde el capitulo 1.';
      const report = buildContinuityGuardReport({
        chapterText:
          'Lena revela su objetivo real a todos en el bar y abre la puerta con la mano derecha para escapar.',
        storyBible,
      });

      assert.ok(report.mentions.some((entry) => entry.label === 'Lena'));
      assert.ok(report.issues.some((issue) => issue.message.includes('no revela')));
      assert.ok(report.issues.some((issue) => issue.message.toLowerCase().includes('brazo derecho')));
    },
  },
  {
    name: 'continuityGuard: respeta regla no revela cuando ya paso el capitulo limite',
    run: () => {
      const storyBible = createStoryBible();
      const report = buildContinuityGuardReport({
        chapterText: 'Lena revela su objetivo real en el cierre del volumen.',
        storyBible,
        chapterNumber: 4,
      });

      assert.equal(report.issues.some((issue) => issue.message.includes('no revela')), false);
    },
  },
  {
    name: 'continuityGuard: procesa texto largo repetitivo sin perder deteccion clave',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].notes = 'Brazo derecho inmovilizado desde el capitulo 1.';
      const repeated = 'Lena camina por el pasillo y piensa en silencio. '.repeat(900);
      const report = buildContinuityGuardReport({
        chapterText: `${repeated}Lena abre la puerta con la mano derecha y corre.`,
        storyBible,
      });

      assert.ok(report.issues.some((issue) => issue.message.toLowerCase().includes('brazo derecho')));
    },
  },
  {
    name: 'continuityGuard: detecta conocimiento adelantado con regla semantica',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].name = 'Elara';
      storyBible.characters[0].aliases = 'la heredera';
      storyBible.continuityRules = 'Elara no sabe de la traicion de Maeron hasta el capitulo 8.';

      const report = buildContinuityGuardReport({
        chapterText: 'Elara entiende la traicion de Maeron y cambia su estrategia.',
        storyBible,
        chapterNumber: 3,
      });

      assert.ok(report.issues.some((issue) => issue.message.toLowerCase().includes('conocimiento adelantado')));
    },
  },
  {
    name: 'continuityGuard: detecta conocimiento implicito antes del capitulo limite',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].name = 'Elara';
      storyBible.characters[0].aliases = 'la heredera';
      storyBible.continuityRules = 'Elara no sabe de la traicion de Maeron hasta el capitulo 8.';

      const report = buildContinuityGuardReport({
        chapterText: 'Elara confiesa la traicion de Maeron ante el consejo y detalla el complot.',
        storyBible,
        chapterNumber: 4,
      });

      assert.ok(report.issues.some((issue) => issue.message.toLowerCase().includes('conocimiento adelantado')));
    },
  },
  {
    name: 'continuityGuard: detecta regresion de conocimiento en multi-escena',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].name = 'Elara';
      storyBible.characters[0].aliases = 'la heredera';
      storyBible.continuityRules = 'Elara no sabe de la traicion de Maeron hasta el capitulo 8.';

      const report = buildContinuityGuardReport({
        chapterText: 'Elara no sabe de la traicion de Maeron y firma una alianza ingenua.',
        storyBible,
        chapterNumber: 6,
        priorChapterTexts: [
          'Elara descubre la traicion de Maeron en los archivos del templo.',
          'La heredera confirma el complot y ajusta su estrategia.',
        ],
      });

      assert.ok(report.issues.some((issue) => issue.message.toLowerCase().includes('regresion de conocimiento')));
    },
  },
  {
    name: 'continuityGuard: ignora regresion de conocimiento cuando hay narrador no fiable',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].name = 'Elara';
      storyBible.characters[0].aliases = 'la heredera';
      storyBible.continuityRules = 'Elara no sabe de la traicion de Maeron hasta el capitulo 8.';

      const report = buildContinuityGuardReport({
        chapterText: 'Elara miente: no sabe de la traicion de Maeron, segun afirma para despistar.',
        storyBible,
        chapterNumber: 6,
        priorChapterTexts: [
          'Elara descubre la traicion de Maeron y cambia su plan.',
        ],
      });

      assert.equal(
        report.issues.some((issue) => issue.message.toLowerCase().includes('regresion de conocimiento')),
        false,
      );
    },
  },
  {
    name: 'semanticReferences: resuelve alias y convierte shortcodes del canon',
    run: () => {
      const storyBible = createStoryBible();
      const catalog = buildSemanticReferenceCatalog({
        storyBible,
        targetView: 'bible',
      });

      const location = findSemanticReferenceMatch(catalog, 'location', 'el muelle');
      assert.equal(location?.id, 'loc-bar');

      const html = convertSemanticReferenceShortcodesToHtml(
        `<p>${buildSemanticReferenceShortcode('character', 'Lena')} visita ${buildSemanticReferenceShortcode('location', 'Bar El Muelle')}.</p>`,
        catalog,
      );

      assert.ok(html.includes('data-semantic-ref-kind="character"'));
      assert.ok(html.includes('data-semantic-ref-kind="location"'));
      assert.ok(html.includes('@Lena'));
      assert.ok(html.includes('#Bar El Muelle'));
    },
  },
  {
    name: 'semanticReferences: marca warning cuando el canon ya trae alerta de continuidad',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].name = 'Elara';
      storyBible.continuityRules = 'Elara no sabe de la traicion de Maeron hasta el capitulo 8.';
      const continuityReport = buildContinuityGuardReport({
        chapterText: 'Elara entiende la traicion de Maeron y actua.',
        storyBible,
        chapterNumber: 3,
      });

      const catalog = buildSemanticReferenceCatalog({
        storyBible,
        targetView: 'saga',
        continuityReport,
      });
      const elara = catalog.find((entry) => entry.kind === 'character' && entry.label === 'Elara');
      assert.ok(elara?.warning?.toLowerCase().includes('conocimiento adelantado'));

      const html = convertSemanticReferenceShortcodesToHtml(
        `<p>${buildSemanticReferenceShortcode('character', 'Elara')}</p>`,
        catalog,
      );
      assert.ok(html.includes('data-semantic-ref-status="warning"'));
    },
  },
  {
    name: 'chapterContinuityBriefing: usa el capitulo anterior como arrastre si el actual esta vacio',
    run: () => {
      const storyBible = createStoryBible();
      const chapters: ChapterDocument[] = [
        {
          id: '01',
          title: 'Capitulo 1',
          content: '<p>Lena entra al Bar El Muelle y oculta su objetivo real.</p>',
          synopsis: 'Lena llega al puerto.',
          pointOfView: 'Lena',
          manuscriptNotes: [],
          lengthPreset: 'media',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '02',
          title: 'Capitulo 2',
          content: '<p></p>',
          synopsis: '',
          pointOfView: 'Lena',
          manuscriptNotes: [],
          lengthPreset: 'media',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ];

      const briefing = buildChapterContinuityBriefing({
        chapters,
        activeChapterId: '02',
        storyBible,
        looseThreads: [
          {
            id: 'thread-1',
            title: 'Paradero del hermano',
            description: 'Aun no se sabe donde esta Tomas.',
            status: 'open',
            chapterRef: '01',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
          },
        ],
      });

      assert.equal(briefing?.source, 'previous');
      assert.equal(briefing?.sourceChapterId, '01');
      assert.equal(briefing?.characters[0]?.label, 'Lena');
      assert.equal(briefing?.characters[0]?.lastMentionChapterTitle, 'Capitulo 1');
      assert.equal(briefing?.characters[0]?.chaptersAgo, 1);
      assert.equal(briefing?.openThreads[0]?.title, 'Paradero del hermano');
    },
  },
  {
    name: 'chapterContinuityBriefing: conserva alertas y ultima referencia del capitulo activo',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters[0].notes = 'Brazo derecho inmovilizado desde el capitulo 1.';
      const chapters: ChapterDocument[] = [
        {
          id: '01',
          title: 'Capitulo 1',
          content: '<p>Lena vigila el Bar El Muelle.</p>',
          synopsis: '',
          pointOfView: 'Lena',
          manuscriptNotes: [],
          lengthPreset: 'media',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '02',
          title: 'Capitulo 2',
          content: '<p>Lena abre la puerta con la mano derecha en el Bar El Muelle.</p>',
          synopsis: 'La tension escala.',
          pointOfView: 'Lena',
          manuscriptNotes: [],
          lengthPreset: 'media',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ];

      const briefing = buildChapterContinuityBriefing({
        chapters,
        activeChapterId: '02',
        storyBible,
        looseThreads: [],
      });

      assert.equal(briefing?.source, 'active');
      assert.equal(briefing?.sourceChapterId, '02');
      assert.ok((briefing?.alerts.length ?? 0) > 0);
      assert.ok(briefing?.alerts.some((entry) => entry.message.toLowerCase().includes('brazo derecho')));
      assert.equal(briefing?.locations[0]?.lastMentionChapterTitle, 'Capitulo 2');
    },
  },
  {
    name: 'projectTemplates: saga precarga dossier, reglas y hilos base',
    run: () => {
      const metadata = createMetadata();
      metadata.foundation.structureNotes = '';
      metadata.storyBible.continuityRules = '';
      metadata.scratchpad = '';
      metadata.looseThreads = [];
      const project = {
        path: 'C:/books/demo-saga',
        metadata,
        chapters: {
          '01': createChapters()[0],
        },
      };

      const templated = applyBookCreationTemplate(project, 'saga');
      assert.ok(templated.metadata.foundation.structureNotes.includes('Cosmogonia'));
      assert.ok(templated.metadata.storyBible.continuityRules.includes('Registrar cambios de poder'));
      assert.ok((templated.metadata.looseThreads?.length ?? 0) >= 2);
      assert.equal(templated.chapters['01']?.title, 'Prologo / Apertura');
    },
  },
  {
    name: 'projectTemplates: blank conserva proyecto sin cambios',
    run: () => {
      const chapter = createChapters()[0];
      const project = {
        path: 'C:/books/demo-blank',
        metadata: createMetadata(),
        chapters: {
          '01': chapter,
        },
      };

      const templated = applyBookCreationTemplate(project, 'blank');
      assert.equal(templated.metadata.title, project.metadata.title);
      assert.equal(templated.chapters['01']?.title, chapter.title);
      assert.equal(templated.metadata.looseThreads, project.metadata.looseThreads);
    },
  },
  {
    name: 'chapterRange: normaliza y recorta rango invalido',
    run: () => {
      const range = normalizeChapterRange(12, { fromChapter: 9, toChapter: 3 });
      assert.equal(range.from, 3);
      assert.equal(range.to, 9);
      assert.equal(range.isFullRange, false);
      assert.equal(range.label, '3-9');

      const fullRange = normalizeChapterRange(4, { fromChapter: null, toChapter: null });
      assert.equal(fullRange.isFullRange, true);
      assert.ok(fullRange.label.includes('todo el libro'));

      const slice = sliceByChapterRange(['a', 'b', 'c', 'd'], range);
      assert.deepEqual(slice, ['c', 'd']);
    },
  },
  {
    name: 'storyProgressSummary: genera digest, prompt y fallback',
    run: () => {
      const chapters: ChapterDocument[] = [
        {
          id: '01',
          title: 'Capitulo 1',
          content: '<p>Lena descubre un mapa en el bar del puerto. Bruno la persigue.</p>',
          lengthPreset: 'media',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '02',
          title: 'Capitulo 2',
          content: '<p>Lena regresa al Faro Norte y confiesa su plan a Mara.</p>',
          lengthPreset: 'media',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      const digest = buildStoryProgressDigest({
        chapters,
        storyBible: createStoryBible(),
      });
      assert.equal(digest.chapters.length, 2);
      assert.ok(digest.totalWords > 0);
      assert.ok(digest.totalHighlights >= 2);

      const range = normalizeChapterRange(chapters.length, { fromChapter: 1, toChapter: 2 });
      const prompt = buildStoryProgressPrompt({
        bookTitle: 'El faro y la niebla',
        language: 'es',
        storyBible: createStoryBible(),
        range,
        digest,
      });
      assert.ok(prompt.includes('MODO: resumen de progreso narrativo'));
      assert.ok(prompt.includes('Rango analizado: capitulos'));

      const fallback = formatStoryProgressFallback('El faro y la niebla', range, digest);
      assert.ok(fallback.includes('Resumen historia'));
      assert.ok(fallback.includes('Hechos relevantes detectados'));
    },
  },
  {
    name: 'chapterLength: resuelve presets e instrucciones',
    run: () => {
      assert.equal(resolveChapterLengthPreset('corta'), 'corta');
      assert.equal(resolveChapterLengthPreset('invalid'), 'media');
      const profile = getChapterLengthProfile('larga');
      assert.equal(profile.maxWords, 7000);
      assert.ok(getChapterLengthInstruction('media').includes('3000-4500'));
    },
  },
  {
    name: 'language: normaliza codigo, select value e instruccion',
    run: () => {
      assert.equal(normalizeLanguageCode(' ES '), 'es');
      assert.equal(normalizeLanguageCode(undefined), 'es');
      assert.equal(normalizeLanguageCode('Espanol'), 'es');
      assert.equal(normalizeLanguageCode('Spanish'), 'es');
      assert.equal(normalizeLanguageCode('Ingles'), 'en');
      assert.equal(isLanguageCodeFormatValid('pt-BR'), true);
      assert.equal(isLanguageCodeFormatValid('es-MX'), true);
      assert.equal(isLanguageCodeFormatValid('en-US'), true);
      assert.equal(isLanguageCodeFormatValid('Espanol'), false);
      assert.equal(isLanguageCodeFormatValid('english'), false);
      assert.ok(APP_LANGUAGE_OPTIONS.length >= 5);
      assert.equal(resolveLanguageSelectValue(''), 'custom');
      assert.equal(resolveLanguageSelectValue(' es '), 'es');
      assert.equal(resolveLanguageSelectValue('es-ar'), 'custom');
      assert.ok(getLanguageDisplayName('fr').toLowerCase().includes('fran'));
      assert.ok(getLanguageInstruction('en').includes('English'));
    },
  },
  {
    name: 'audio: resuelve idioma, voz y texto exportable',
    run: () => {
      assert.equal(resolveSpeechLanguageTag('es'), 'es');
      assert.equal(resolveSpeechLanguageTag('es-mx'), 'es-MX');

      const voices = [
        { name: 'English Voice', lang: 'en-US' },
        { name: 'Sabina', lang: 'es-ES' },
        { name: 'Helena', lang: 'es-MX' },
      ] as SpeechSynthesisVoice[];

      assert.equal(pickSpeechVoice(voices, 'es', '')?.name, 'Sabina');
      assert.equal(pickSpeechVoice(voices, 'es-mx', '')?.name, 'Helena');
      assert.equal(pickSpeechVoice(voices, 'es', 'Helena')?.name, 'Helena');

      const chapter = createChapters()[0];
      const chapterAudioText = buildChapterAudioText(chapter);
      assert.ok(chapterAudioText.includes('Capitulo 01.'));
      assert.ok(chapterAudioText.includes(chapter.title));

      const metadata = createMetadata();
      const bookAudioText = buildBookAudioText(metadata, createChapters());
      assert.ok(bookAudioText.includes(metadata.title));
      assert.ok(bookAudioText.includes(metadata.author));

      const chapterPath = buildChapterAudioExportPath('C:/books/demo', metadata, chapter);
      assert.ok(chapterPath.endsWith('.wav'));
      assert.ok(chapterPath.includes('/exports/'));

      const bookPath = buildBookAudioExportPath('C:/books/demo', metadata);
      assert.ok(bookPath.endsWith('-audiolibro.wav'));
    },
  },
  {
    name: 'metrics: cuenta palabras y estima paginas',
    run: () => {
      assert.equal(countWordsFromPlainText('uno dos tres'), 3);
      assert.equal(countWordsFromHtml('<p>uno dos</p><p>tres</p>'), 3);
      const pages = estimatePagesFromWords(1600, createInterior('6x9'));
      assert.ok(pages >= 5);
      assert.equal(formatNumber(12500), '12.500');
    },
  },
  {
    name: 'diff: detecta bloques iguales, insertados y eliminados',
    run: () => {
      const operations = diffTextBlocks(
        'Parrafo uno.\n\nParrafo dos.',
        'Parrafo uno.\n\nParrafo nuevo.\n\nParrafo dos.',
      );
      const summary = summarizeDiffOperations(operations);

      assert.ok(operations.some((entry) => entry.type === 'insert'));
      assert.equal(summary.insertCount, 1);
      assert.ok(summary.equalCount >= 1);
      assert.equal(summary.deleteCount, 0);
    },
  },
  {
    name: 'collaborationPatchPreview: resume altas y cambios antes de importar',
    run: () => {
      const chapters = {
        '01': {
          id: '01',
          title: 'Capitulo 1',
          content: '<p>Lena llega al puerto.</p>',
          lengthPreset: 'media' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      };
      const patch = {
        version: 1 as const,
        patchId: 'patch-01',
        createdAt: '2026-01-02T00:00:00.000Z',
        sourceBookTitle: 'Libro remoto',
        sourceAuthor: 'Coautor',
        sourceLanguage: 'es',
        notes: '',
        chapters: [
          {
            chapterId: '01',
            title: 'Capitulo 1',
            content: '<p>Lena llega al puerto. Bruno la sigue.</p>',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          {
            chapterId: '02',
            title: 'Capitulo 2',
            content: '<p>El faro parpadea en la noche.</p>',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      };

      const preview = buildCollaborationPatchPreview({ patch, chapters });
      assert.equal(preview.updatedCount, 1);
      assert.equal(preview.createdCount, 1);
      assert.equal(preview.unchangedCount, 0);

      const message = formatCollaborationPatchPreviewMessage(patch, preview);
      assert.ok(message.includes('Preview diff'));
      assert.ok(message.includes('Se crearan: 1'));
      assert.ok(message.includes('[UPDATE] 01'));
      assert.ok(message.includes('[NUEVO] 02'));
    },
  },
  {
    name: 'kdpMarketRules: aplica reglas transparentes por categoria y marketplace',
    run: () => {
      const fictionInsight = buildKdpMarketInsight({
        presetType: 'intimate-narrative',
        categories: ['Libros > Literatura y ficcion > Narrativa contemporanea'],
        marketplace: 'amazon.es',
        language: 'es',
        wordCount: 95000,
      });
      assert.equal(fictionInsight.ruleVersion, 'kdp-rules-v1');
      assert.equal(fictionInsight.genre, 'fiction');
      assert.equal(fictionInsight.currency, 'EUR');
      assert.ok(fictionInsight.rationales.some((reason) => reason.toLowerCase().includes('marketplace detectado')));

      const essayInsight = buildKdpMarketInsight({
        presetType: 'practical-essay',
        categories: ['Libros > Negocios y economia > Emprendimiento'],
        marketplace: 'amazon.com',
        language: 'es',
        wordCount: 45000,
      });
      assert.equal(essayInsight.genre, 'non-fiction');
      assert.equal(essayInsight.currency, 'USD');
      assert.ok(essayInsight.suggestedEbookPrice >= 4.99);
      assert.ok(essayInsight.descriptionHint.toLowerCase().includes('problema concreto'));
    },
  },
  {
    name: 'zip: genera contenedor PK con entradas y cierre',
    run: () => {
      const archive = createZipArchive([
        { name: 'mimetype', data: 'application/test' },
        { name: 'folder/file.txt', data: 'hola' },
      ]);
      const decoded = new TextDecoder().decode(archive);

      assert.equal(archive[0], 0x50);
      assert.equal(archive[1], 0x4b);
      assert.ok(decoded.includes('mimetype'));
      assert.ok(decoded.includes('folder/file.txt'));
      assert.equal(archive[archive.length - 22], 0x50);
      assert.equal(archive[archive.length - 21], 0x4b);
      assert.equal(archive[archive.length - 20], 0x05);
      assert.equal(archive[archive.length - 19], 0x06);
    },
  },
  {
    name: 'zipInspect: parsea entradas store y permite extraer texto',
    run: () => {
      const archive = createZipArchive([
        { name: 'alpha.txt', data: 'uno' },
        { name: 'nested/beta.txt', data: 'dos' },
      ]);

      const entries = parseStoredZipEntries(archive);
      assert.deepEqual(
        entries.map((entry) => entry.name),
        ['alpha.txt', 'nested/beta.txt'],
      );
      assert.equal(extractZipEntryText(archive, 'nested/beta.txt'), 'dos');
      assert.equal(extractZipEntryText(archive, 'missing.txt'), null);
    },
  },
  {
    name: 'export packs: cartografo, cronologia y editorial contienen artefactos requeridos',
    run: () => {
      const saga = createSagaFixture();
      const metadata = createMetadata();
      const chapters = createChapters();

      const cartographerArchive = buildSagaCartographerPackArchive(saga);
      const historianArchive = buildSagaHistorianPackArchive(saga);
      const editorialArchive = buildBookEditorPackArchive('C:/books/demo', metadata, chapters, saga);

      const cartographerEntries = parseStoredZipEntries(cartographerArchive).map((entry) => entry.name);
      const historianEntries = parseStoredZipEntries(historianArchive).map((entry) => entry.name);
      const editorialEntries = parseStoredZipEntries(editorialArchive).map((entry) => entry.name);

      assert.deepEqual(cartographerEntries, [
        'atlas-config.json',
        'layers.csv',
        'locations.csv',
        'pins.csv',
        'routes.csv',
        'notes.md',
      ]);
      assert.deepEqual(historianEntries, [
        'timeline.json',
        'timeline.csv',
        'secrets.json',
        'chronicle.md',
      ]);
      assert.deepEqual(editorialEntries, [
        'manuscript.md',
        'editorial-context.md',
        'book-metadata.json',
      ]);

      const atlasConfigText = extractZipEntryText(cartographerArchive, 'atlas-config.json');
      const timelineText = extractZipEntryText(historianArchive, 'timeline.json');
      const metadataText = extractZipEntryText(editorialArchive, 'book-metadata.json');

      assert.ok(atlasConfigText?.includes('"atlas"'));
      assert.ok(timelineText?.includes('"title"'));
      assert.ok(metadataText?.includes(`"${metadata.title}"`));
      assert.ok(extractZipEntryText(editorialArchive, 'editorial-context.md')?.includes('Contexto editorial'));
    },
  },
  {
    name: 'export packs: maquetacion y consultoria contienen artefactos requeridos',
    run: () => {
      const saga = createSagaFixture();
      const metadata = createMetadata();
      const chapters = createChapters();

      const layoutArchive = buildBookLayoutPackArchive(metadata, chapters);
      const consultantArchive = buildBookConsultantPackArchive(
        saga.metadata.books[0]?.bookPath || 'C:/books/demo',
        metadata,
        chapters,
        saga,
      );

      const layoutEntries = parseStoredZipEntries(layoutArchive).map((entry) => entry.name);
      const consultantEntries = parseStoredZipEntries(consultantArchive).map((entry) => entry.name);

      assert.deepEqual(layoutEntries, [
        'interior.css',
        'interior-sample.html',
        'chapter-metrics.csv',
        'interior-format.json',
        'README.md',
      ]);
      assert.deepEqual(consultantEntries, [
        'manuscript.md',
        'consultant-context.json',
        'timeline-links.csv',
        'README.md',
      ]);

      assert.ok(extractZipEntryText(layoutArchive, 'interior.css')?.includes('@page'));
      assert.ok(extractZipEntryText(layoutArchive, 'interior-sample.html')?.includes(metadata.title));
      assert.ok(extractZipEntryText(consultantArchive, 'manuscript.md')?.includes('# El faro y la niebla'));
      assert.ok(extractZipEntryText(consultantArchive, 'timeline-links.csv')?.includes('event-arrival'));
    },
  },
  {
    name: 'export: biblia de saga compila html imprimible con secciones clave',
    run: () => {
      const saga = createSagaFixture();
      const html = buildSagaBibleDossierHtml(saga);

      assert.ok(html.includes('Biblia de saga'));
      assert.ok(html.includes('Cronicas del Faro'));
      assert.ok(html.includes('Canon de personajes'));
      assert.ok(html.includes('Carriles y cronologia'));
    },
  },
  {
    name: 'styleMetrics: calcula ritmo, repeticion y semaforo',
    run: () => {
      const plain = 'Lena camina bajo la niebla. Lena mira el faro. Lena escucha el puerto.';
      const report = analyzePlainTextStyle(plain);
      assert.equal(report.wordCount, 13);
      assert.equal(report.sentenceCount, 3);
      assert.ok(report.avgWordsPerSentence > 4);
      assert.ok(report.readingMinutes >= 1);
      assert.ok(report.topRepetitions.some((entry) => entry.term === 'lena'));
      assert.ok(['ok', 'warn', 'alert'].includes(report.overallLevel));
      assert.ok(getStyleLevelLabel(report.overallLevel).length > 0);

      const htmlReport = analyzeHtmlStyle('<p>Lena vuelve.</p><p>Lena duda.</p>');
      assert.equal(htmlReport.wordCount, 4);
      assert.equal(htmlReport.sentenceCount, 2);
    },
  },
  {
    name: 'amazon: aplica preset y completa campos vacios',
    run: () => {
      const metadata = createMetadata();
      const presetApplied = applyAmazonPreset(metadata.amazon, 'intimate-narrative', {
        bookTitle: metadata.title,
        author: metadata.author,
      });
      assert.equal(presetApplied.kdpTitle, metadata.title);
      assert.equal(presetApplied.penName, metadata.author);
      assert.equal(presetApplied.keywords.length, 7);
      assert.ok(presetApplied.categories.length >= 3);
      assert.equal(presetApplied.ownCopyright, true);
      assert.equal(presetApplied.isAdultContent, false);
    },
  },
  {
    name: 'amazon: genera copy final con extracto y pack',
    run: () => {
      const metadata = createMetadata();
      const chapters = createChapters();
      const generated = generateAmazonCopy(metadata, chapters, metadata.amazon);
      assert.ok(generated.longDescription.includes('Que vas a encontrar:'));
      assert.ok(generated.longDescription.includes('Extracto:'));
      assert.equal(keywordsAsLines(generated).split('\n').length, 7);
      assert.ok(categoriesAsLines(generated).includes('Libros >'));

      const pack = buildAmazonCopyPack({ ...metadata, amazon: generated });
      assert.ok(pack.includes('AMAZON KDP PACK'));
      assert.ok(pack.includes('Descripcion larga (KDP):'));
      assert.ok(pack.includes('DRM eBook:'));
      assert.ok(pack.includes('KDP Select:'));
    },
  },
  {
    name: 'amazon: valida metadata, sanitiza html y exporta csv',
    run: () => {
      const metadata = createMetadata();
      metadata.amazon.kdpTitle = 'Mi libro';
      metadata.amazon.penName = 'Autor Demo';
      metadata.amazon.longDescription = '<b>Descripcion</b>\n<script>alert(1)</script><ul><li>Item</li></ul>';
      metadata.amazon.keywords = ['uno', 'dos', 'tres', '', '', '', ''];
      metadata.amazon.categories = ['Libros > Literatura y ficcion > Ensayos'];
      metadata.amazon.marketPricing = [
        { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 4.99, printPrice: 12.99 },
      ];

      const result = validateAmazonMetadata(metadata);
      assert.ok(result.isValid);
      assert.ok(result.readinessScore > 70);

      const sanitized = sanitizeKdpDescriptionHtml(metadata.amazon.longDescription);
      assert.ok(!sanitized.includes('<script>'));
      assert.ok(sanitized.includes('<b>Descripcion</b>'));

      const csv = buildAmazonMetadataCsv(metadata);
      assert.ok(csv.includes('field,value'));
      assert.ok(csv.includes('pricing_Amazon.com_USD'));

      assert.equal(estimateEbookRoyalty(4.99, 70), 3.49);
      assert.equal(estimatePrintRoyalty(12.99, 3.5), 4.29);

      metadata.amazon.longDescription = 'x'.repeat(AMAZON_LIMITS.longDescriptionMax + 10);
      const invalidResult = validateAmazonMetadata(metadata);
      assert.ok(!invalidResult.isValid);
    },
  },
  {
    name: 'amazon: contadores y advertencias de categorias/precios',
    run: () => {
      const metadata = createMetadata();
      metadata.amazon.kdpTitle = 'Titulo KDP';
      metadata.amazon.penName = 'Autor';
      metadata.amazon.longDescription = 'x'.repeat(260);
      metadata.amazon.keywords = ['clave 1', 'clave 2', '', '', '', '', ''];
      metadata.amazon.categories = ['Categoria inventada'];
      metadata.amazon.ownCopyright = false;
      metadata.amazon.ebookRoyaltyPlan = 70;
      metadata.amazon.marketPricing = [
        { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 1.99, printPrice: 12.5 },
      ];

      const counters = getAmazonFieldCounters(metadata);
      assert.equal(counters.title.current, 10);
      assert.equal(counters.longDescription.max, AMAZON_LIMITS.longDescriptionMax);

      const result = validateAmazonMetadata(metadata);
      assert.ok(result.isValid);
      assert.ok(result.warnings.some((warning) => warning.field.startsWith('categories.')));
      assert.ok(result.warnings.some((warning) => warning.field === 'ownCopyright'));
      assert.ok(result.warnings.some((warning) => warning.field === 'marketPricing'));
      assert.ok(result.warnings.some((warning) => warning.field === 'isbn'));
    },
  },
  {
    name: 'amazon: sanitizado html fallback y csv escapa comillas/comas',
    run: () => {
      assert.equal(sanitizeKdpDescriptionHtml('   '), '<p>(sin descripcion)</p>');
      const sanitized = sanitizeKdpDescriptionHtml(
        '<P onclick="x()">Hola</P><img src="x"><br><script>alert(1)</script>',
      );
      assert.ok(sanitized.includes('<p>Hola</p>'));
      assert.ok(sanitized.includes('<br>'));
      assert.ok(!sanitized.includes('<img'));
      assert.ok(!sanitized.includes('<script'));

      const metadata = createMetadata();
      metadata.amazon.kdpTitle = 'Mi, "Gran" libro';
      metadata.amazon.penName = 'Autor';
      metadata.amazon.longDescription = 'x'.repeat(250);
      metadata.amazon.keywords = ['uno', '', '', '', '', '', ''];
      metadata.amazon.categories = ['Libros > Literatura y ficcion > Ensayos'];
      metadata.amazon.kdpNotes = 'nota 1\nnota 2';
      metadata.amazon.marketPricing = [
        { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 4.99, printPrice: null },
      ];

      const csv = buildAmazonMetadataCsv(metadata);
      assert.ok(csv.includes('"Mi, ""Gran"" libro"'));
      assert.ok(csv.includes('"nota 1\nnota 2"'));
    },
  },
  {
    name: 'prompts: selecciona contexto de biblia por relevancia',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters.push({
        id: 'char-bruno',
        name: 'Bruno',
        aliases: 'el hombre del abrigo',
        role: 'Antagonista',
        traits: 'frio',
        goal: 'encubrir el contrabando',
        notes: '',
      });
      storyBible.locations.push({
        id: 'loc-faro',
        name: 'Faro Norte',
        aliases: 'torre norte',
        description: 'torre abandonada',
        atmosphere: 'viento y sal',
        notes: '',
      });

      const scoped = selectStoryBibleForPrompt(
        storyBible,
        'Helena entra al bar del puerto para buscar pistas.',
        { maxCharacters: 1, maxLocations: 1 },
      );

      assert.equal(scoped.characters.length, 1);
      assert.equal(scoped.characters[0].name, 'Lena');
      assert.equal(scoped.locations.length, 1);
      assert.equal(scoped.locations[0].name, 'Bar El Muelle');
      assert.ok(scoped.continuityRules.length > 0);

      const scopedByRecency = selectStoryBibleForPrompt(
        storyBible,
        'Se intensifica el conflicto en el puerto.',
        {
          maxCharacters: 1,
          maxLocations: 1,
          recentText: 'Asistente: el hombre del abrigo entra al muelle.',
          recencyWeight: 1.5,
        },
      );
      assert.equal(scopedByRecency.characters[0].name, 'Bruno');
    },
  },
  {
    name: 'prompts: excluye apocrifos por defecto y permite incluirlos',
    run: () => {
      const storyBible = createStoryBible();
      storyBible.characters.push({
        id: 'char-what-if',
        name: 'Kael',
        aliases: 'El heredero oculto',
        role: 'Borrador',
        traits: '',
        goal: '',
        notes: '',
        canonStatus: 'apocryphal',
      });

      const canonicalOnly = selectStoryBibleForPrompt(
        storyBible,
        'Kael aparece en la ciudadela para reclamar su linaje.',
        { maxCharacters: 6, maxLocations: 2 },
      );
      assert.equal(canonicalOnly.characters.some((entry) => entry.name === 'Kael'), false);

      const withApocrypha = selectStoryBibleForPrompt(
        storyBible,
        'Kael aparece en la ciudadela para reclamar su linaje.',
        { maxCharacters: 6, maxLocations: 2, includeApocryphal: true },
      );
      assert.equal(withApocrypha.characters.some((entry) => entry.name === 'Kael'), true);
    },
  },
  {
    name: 'canon: indice unificado mezcla canon de libro+saga y aísla apocrifos',
    run: () => {
      const storyBible = createStoryBible();
      const saga = createSagaFixture();

      saga.metadata.worldBible.characters.push({
        id: 'char-kael-alt',
        name: 'Kael',
        aliases: 'Principe sombra',
        summary: 'Linea alternativa',
        notes: '',
        canonStatus: 'apocryphal',
        aliasTimeline: [],
        versions: [],
        lifecycle: {
          birthEventId: null,
          deathEventId: null,
          firstAppearanceEventId: null,
          lastKnownEventId: null,
          currentStatus: 'alive',
        },
      });
      saga.metadata.worldBible.locations.push({
        id: 'loc-isla-alt',
        name: 'Isla Espectral',
        aliases: '',
        summary: 'Version alternativa del mapa',
        notes: '',
        canonStatus: 'apocryphal',
      });
      saga.metadata.worldBible.globalRules = 'En saga, la Corona no cruza el Hielo sin juramento.';

      const unified = buildUnifiedStoryBibleIndex(storyBible, saga.metadata.worldBible);
      assert.equal(unified.characters.some((entry) => entry.name === 'Elara'), true);
      assert.equal(unified.characters.some((entry) => entry.name === 'Kael'), false);
      assert.equal(unified.locations.some((entry) => entry.name === 'Ciudadela del Norte'), true);
      assert.equal(unified.locations.some((entry) => entry.name === 'Isla Espectral'), false);
      assert.ok(
        unified.characters
          .find((entry) => entry.name === 'Elara')
          ?.aliases.includes('La Heredera') ?? false,
      );
      assert.ok(unified.continuityRules.includes('Lena no revela su objetivo real'));
      assert.ok(unified.continuityRules.includes('En saga, la Corona no cruza el Hielo sin juramento.'));

      const unifiedWithApocrypha = buildUnifiedStoryBibleIndex(storyBible, saga.metadata.worldBible, {
        includeApocryphal: true,
      });
      assert.equal(unifiedWithApocrypha.characters.some((entry) => entry.name === 'Kael'), true);
      assert.equal(unifiedWithApocrypha.locations.some((entry) => entry.name === 'Isla Espectral'), true);
    },
  },
  {
    name: 'prompts: action/chat/autorewrite/continuous incluyen reglas clave',
    run: () => {
      const foundation = createFoundation();
      const storyBible = createStoryBible();
      const actionPrompt = buildActionPrompt({
        actionId: 'polish-style',
        selectedText: 'Texto base',
        chapterTitle: 'Capitulo 1',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        storyBible,
        chapterLengthPreset: 'media',
      });
      assert.ok(actionPrompt.includes('Idioma de salida obligatorio'));
      assert.ok(actionPrompt.includes('Objetivo de extension del capitulo'));
      assert.ok(actionPrompt.includes('Biblia de la historia:'));
      assert.ok(actionPrompt.includes('Lena'));

      const draftPrompt = buildActionPrompt({
        actionId: 'draft-from-idea',
        selectedText: 'Aria conoce al dragon en el puerto.',
        ideaText: 'Aria conoce al dragon en el puerto.',
        chapterTitle: 'Capitulo 1',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        storyBible,
        chapterLengthPreset: 'media',
        chapterContext: '',
      });
      assert.ok(draftPrompt.includes('Idea del usuario para este capitulo:'));
      assert.ok(draftPrompt.includes('Aria conoce al dragon en el puerto.'));

      const chatPrompt = buildChatPrompt({
        scope: 'chapter',
        mode: 'rewrite',
        message: 'Mejora el cierre',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        storyBible,
        chapterTitle: 'Capitulo 1',
        chapterLengthPreset: 'media',
        chapterText: 'Texto del capitulo',
        fullBookText: 'Texto del libro',
        compactHistory: 'user: hola',
      });
      assert.ok(chatPrompt.includes('Historial reciente:'));
      assert.ok(chatPrompt.includes('Mensaje actual del usuario:'));

      const bookChatPrompt = buildChatPrompt({
        scope: 'book',
        mode: 'rewrite',
        message: 'Reordena el libro completo',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        storyBible,
        bookLengthInstruction: '8 capitulos, 12.000-17.000 palabras',
        chapterText: '',
        fullBookText: 'Texto del libro',
        compactHistory: '',
      });
      assert.ok(bookChatPrompt.includes('Longitud objetivo del libro:'));

      const autoPrompt = buildAutoRewritePrompt({
        userInstruction: 'Expandir a 1800 palabras',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        storyBible,
        chapterTitle: 'Capitulo 1',
        chapterLengthPreset: 'media',
        chapterText: 'Texto',
        fullBookText: 'Libro completo',
        chapterIndex: 1,
        chapterTotal: 8,
        iteration: 1,
        totalIterations: 2,
      });
      assert.ok(autoPrompt.includes('MODO: reescritura automatica'));

      const continuousPrompt = buildContinuousChapterPrompt({
        userInstruction: 'Itera hasta mejorar ritmo',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        storyBible,
        chapterTitle: 'Capitulo 1',
        chapterLengthPreset: 'media',
        chapterText: 'Texto',
        fullBookText: 'Libro completo',
        round: 1,
        maxRounds: 3,
      });
      assert.ok(continuousPrompt.includes('ESTADO: DONE o CONTINUE'));

      const continuityPrompt = buildContinuityGuardPrompt({
        userInstruction: 'Mantener voz de Lena',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        storyBible,
        chapterTitle: 'Capitulo 1',
        originalText: 'Lena entra al bar.',
        candidateText: 'Lena revela todo su plan en la primera escena.',
      });
      assert.ok(continuityPrompt.includes('MODO: bloqueo de continuidad'));
      assert.ok(continuityPrompt.includes('ESTADO: PASS o FAIL'));
      assert.ok(continuityPrompt.includes('EVIDENCIA:'));
      assert.ok(continuityPrompt.includes('TEXTO:'));

      const parsedContinuity = parseContinuityGuardOutput(
        'ESTADO: FAIL\nRAZON: Lena no puede revelar ese dato aun.\nEVIDENCIA: Regla de biblia: no revela el objetivo real hasta capitulo 4.\nTEXTO:\nLena evita hablar del plan real.',
      );
      assert.equal(parsedContinuity.status, 'FAIL');
      assert.ok(parsedContinuity.reason.includes('Lena'));
      assert.ok(parsedContinuity.evidence.includes('capitulo 4'));
      assert.ok(parsedContinuity.text.includes('Lena evita'));

      const parsedContinuityFallback = parseContinuityGuardOutput('Salida sin formato estructurado');
      assert.equal(parsedContinuityFallback.status, 'PASS');
      assert.equal(parsedContinuityFallback.text, 'Salida sin formato estructurado');

      const foundationBlock = buildFoundationBlock(foundation);
      assert.ok(foundationBlock.includes('Base fija del libro:'));
    },
  },
  {
    name: 'journey: idea vaga a novela con coherencia y salida mercado',
    run: () => {
      const foundation = createFoundation();
      const storyBible = createStoryBible();
      const metadata = createMetadata();
      const config = createConfig({ language: 'es' });
      const chapterText =
        '<p>Lena vuelve al puerto para vender la casa de su madre.</p><p>Encuentra cuadernos con desapariciones en el muelle.</p>';

      const actionPrompt = buildActionPrompt({
        actionId: 'draft-from-idea',
        selectedText: chapterText,
        ideaText:
          'Novela extensa: una mujer vuelve al pueblo costero y descubre una deuda moral ligada a desapariciones.',
        chapterTitle: 'Capitulo 1',
        bookTitle: metadata.title,
        language: 'es',
        foundation,
        storyBible,
        chapterLengthPreset: 'media',
        chapterContext: chapterText,
      });
      assert.ok(actionPrompt.includes('Idea del usuario para este capitulo:'));
      assert.ok(actionPrompt.includes('Biblia de la historia:'));

      const aiLikeOutput =
        '<p>Lena vuelve al puerto para vender la casa.</p><p>Los cuadernos revelan nombres, fechas y una deuda moral que compromete a su familia.</p>\n\nResumen de cambios:\n- Refuerzo del conflicto\n- Mayor tension\n- Continuidad preservada\n- Voz narrativa estable\n- Cierre abierto';
      const parsed = splitAiOutputAndSummary(aiLikeOutput);
      assert.ok(parsed.cleanText.includes('deuda moral'));
      assert.equal(parsed.summaryBullets.length, 5);

      const sync = buildStoryBibleAutoSyncFromChapter(storyBible, {
        id: '01',
        title: 'Capitulo 1',
        content: parsed.cleanText + '<p>Bruno espera en Puerto Umbral.</p>',
      });
      assert.ok(sync.addedCharacters.length + sync.addedLocations.length >= 1);
      assert.ok(sync.nextStoryBible.locations.some((entry) => entry.name === 'Puerto Umbral'));

      const tracking = buildCharacterTrackingReport({
        requestedName: 'Lena',
        storyBible: sync.nextStoryBible,
        chapters: [
          {
            id: '01',
            title: 'Capitulo 1',
            content: parsed.cleanText,
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
      assert.ok(tracking.mentions.length >= 1);

      const digest = buildStoryProgressDigest({
        chapters: [
          {
            id: '01',
            title: 'Capitulo 1',
            content: parsed.cleanText,
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        storyBible: sync.nextStoryBible,
      });
      const range = normalizeChapterRange(1, { fromChapter: 1, toChapter: 1 });
      const progressPrompt = buildStoryProgressPrompt({
        bookTitle: metadata.title,
        language: 'es',
        storyBible: sync.nextStoryBible,
        range,
        digest,
      });
      assert.ok(progressPrompt.includes('MODO: resumen de progreso narrativo'));

      const style = analyzeHtmlStyle(parsed.cleanText);
      assert.ok(style.wordCount > 10);

      const amazonSuggested = generateAmazonCopy(
        { ...metadata, foundation, storyBible: sync.nextStoryBible },
        [
          {
            id: '01',
            title: 'Capitulo 1',
            content: parsed.cleanText,
            lengthPreset: 'media',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        metadata.amazon,
      );
      const metadataWithAmazon = {
        ...metadata,
        storyBible: sync.nextStoryBible,
        amazon: {
          ...amazonSuggested,
          kdpTitle: metadata.title,
          penName: metadata.author,
          longDescription: amazonSuggested.longDescription || 'x'.repeat(260),
          categories: amazonSuggested.categories.length
            ? amazonSuggested.categories
            : ['Libros > Literatura y ficcion > Narrativa contemporanea'],
          keywords: amazonSuggested.keywords.length
            ? amazonSuggested.keywords
            : ['misterio', 'puerto', 'familia', 'deuda moral', '', '', ''],
          marketPricing: [
            { marketplace: 'Amazon.com', currency: 'USD', ebookPrice: 4.99, printPrice: 12.99 },
          ],
        },
        coverImage: 'assets/cover.jpg',
      };

      const marketInsight = buildKdpMarketInsight({
        presetType: 'intimate-narrative',
        categories: metadataWithAmazon.amazon.categories,
        marketplace: metadataWithAmazon.amazon.marketplace,
        language: metadataWithAmazon.amazon.language,
        wordCount: 90000,
      });
      assert.equal(marketInsight.genre, 'fiction');

      const amazonValidation = validateAmazonMetadata(metadataWithAmazon);
      assert.ok(amazonValidation.readinessScore >= 70);

      const editorial = buildEditorialChecklist(metadataWithAmazon, config);
      assert.equal(editorial.errors.length, 0);
      assert.equal(editorial.isReady, true);
    },
  },
  {
    name: 'saga consistency: saga valida no reporta issues',
    run: () => {
      const report = buildSagaConsistencyReport(createSagaFixture());
      assert.equal(report.errorCount, 0);
      assert.equal(report.warningCount, 0);
      assert.equal(report.issues.length, 0);
    },
  },
  {
    name: 'prompts: biblia de saga incluye relaciones formales',
    run: () => {
      const saga = createSagaFixture();
      const block = buildSagaWorldBlock(saga.metadata.title, saga.metadata.worldBible);

      assert.ok(block.includes('Relaciones clave:'));
      assert.ok(block.includes('Elara lidera La Corona del Norte'));
    },
  },
  {
    name: 'plot board: deriva etapas narrativas y relaciones del arco',
    run: () => {
      const saga = createSagaFixture();
      const plot = buildPlotBoardModel(saga, 'char-elara', 'all');

      assert.ok(plot.steps.length >= 4);
      assert.equal(plot.steps[0].stageLabel, 'Apertura');
      assert.ok(plot.steps.some((step) => step.stageLabel === 'Climax' || step.stageLabel === 'Consecuencia'));
      assert.ok(plot.relationships.some((entry) => entry.label.includes('Elara lidera La Corona del Norte')));
      assert.ok(plot.categories.some((entry) => entry.count >= 1));
      assert.ok(plot.acts.length >= 2);
      assert.ok(plot.characterArc.some((beat) => beat.impactLabel.includes('Asume el titulo')));
    },
  },
  {
    name: 'plot board: resuelve etiquetas de etapa en extremos',
    run: () => {
      assert.equal(getPlotStageLabel(0, 5), 'Apertura');
      assert.equal(getPlotStageLabel(4, 5), 'Consecuencia');
      assert.equal(getPlotStageLabel(0, 1), 'Nucleo');
    },
  },
  {
    name: 'world map: construye nodos y conexiones logicas entre lugares',
    run: () => {
      const saga = createSagaFixture();
      const map = buildWorldMapModel(saga);

      assert.equal(map.nodes.length, 2);
      assert.ok(map.connections.some((entry) => entry.label.includes('Ciudadela del Norte conecta Puerto Bruma')));
      assert.ok(map.routeCards.some((entry) => entry.label === 'Camino del Hielo'));
      assert.ok(map.nodes.every((node) => node.x >= 8 && node.x <= 92));
      assert.ok(map.nodes.every((node) => node.y >= 8 && node.y <= 92));
    },
  },
  {
    name: 'relationship graph: recorta vista overview en sagas densas',
    run: () => {
      const saga = createSagaFixture();
      for (let index = 0; index < 80; index += 1) {
        saga.metadata.worldBible.characters.push({
          id: `char-extra-${index}`,
          name: `Extra ${index}`,
          aliases: '',
          summary: '',
          notes: '',
          aliasTimeline: [],
          versions: [],
          lifecycle: {
            birthEventId: null,
            deathEventId: null,
            firstAppearanceEventId: null,
            lastKnownEventId: null,
            currentStatus: 'alive',
          },
        });
        saga.metadata.worldBible.relationships.push({
          id: `rel-extra-${index}`,
          from: { kind: 'character', id: 'char-elara' },
          to: { kind: 'character', id: `char-extra-${index}` },
          type: 'ally-of',
          notes: '',
        });
      }

      const graph = buildRelationshipGraphModel({
        worldBible: saga.metadata.worldBible,
        kindFilter: 'all',
        query: '',
        nodeLimit: 24,
        focusMode: 'overview',
      });

      assert.equal(graph.nodes.length, 24);
      assert.ok(graph.trimmedNodeCount > 0);
      assert.ok(graph.nodeByKey.has('character:char-elara'));
    },
  },
  {
    name: 'relationship graph: modo vecindad conserva nodo y enlaces directos',
    run: () => {
      const saga = createSagaFixture();
      const graph = buildRelationshipGraphModel({
        worldBible: saga.metadata.worldBible,
        kindFilter: 'all',
        query: '',
        selectedNodeKey: 'character:char-elara',
        nodeLimit: 12,
        focusMode: 'neighborhood',
      });

      assert.ok(graph.nodeByKey.has('character:char-elara'));
      assert.ok(graph.nodes.length <= 12);
      assert.ok(graph.edges.some((edge) => edge.fromKey === 'character:char-elara' || edge.toKey === 'character:char-elara'));
    },
  },
  {
    name: 'saga consistency: detecta referencias rotas a eventos, libros y personajes',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.characters[0].lifecycle.birthEventId = 'event-inexistente';
      saga.metadata.worldBible.timeline[1].bookRefs[0].bookPath = 'C:/books/fuera-de-saga';
      saga.metadata.worldBible.timeline[1].characterImpacts[0].characterId = 'char-fantasma';
      saga.metadata.worldBible.relationships[0].to.id = 'faction-inexistente';

      const report = buildSagaConsistencyReport(saga);
      assert.ok(report.issues.some((issue) => issue.code === 'missing-event-ref'));
      assert.ok(report.issues.some((issue) => issue.code === 'missing-book-ref'));
      assert.ok(report.issues.some((issue) => issue.code === 'missing-character-ref'));
      assert.ok(report.issues.some((issue) => issue.code === 'missing-entity-ref'));
    },
  },
  {
    name: 'saga consistency: detecta apariciones antes de nacer y despues de morir',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline.push(
        {
          id: 'event-early',
          title: 'Profecia temprana',
          category: 'other',
          kind: 'point',
          startOrder: 1,
          endOrder: null,
          displayLabel: 'A-1',
          summary: '',
          notes: '',
          bookRefs: [],
          entityIds: ['char-elara'],
          characterImpacts: [],
        },
        {
          id: 'event-late',
          title: 'Eco final',
          category: 'other',
          kind: 'point',
          startOrder: 25,
          endOrder: null,
          displayLabel: 'A-25',
          summary: '',
          notes: '',
          bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '14', mode: 'occurs' }],
          entityIds: ['char-elara'],
          characterImpacts: [
            {
              characterId: 'char-elara',
              impactType: 'betrayal',
              aliasUsed: 'La Heredera',
              stateChange: 'Actua despues de su muerte',
            },
          ],
        },
      );

      const report = buildSagaConsistencyReport(saga);
      assert.ok(report.issues.some((issue) => issue.code === 'character-before-birth' && issue.eventId === 'event-early'));
      assert.ok(report.issues.some((issue) => issue.code === 'character-after-death' && issue.eventId === 'event-late'));
    },
  },
  {
    name: 'saga consistency: detecta alias fuera de rango temporal',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline[1].characterImpacts[0].aliasUsed = 'La Heredera';

      const report = buildSagaConsistencyReport(saga);
      assert.ok(report.issues.some((issue) => issue.code === 'alias-out-of-range' && issue.eventId === 'event-arrival'));
    },
  },
  {
    name: 'saga consistency: detecta dependencias temporales faltantes o invertidas',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline[0].dependencyIds = ['event-missing'];
      saga.metadata.worldBible.timeline[1].dependencyIds = ['event-crowning'];

      const report = buildSagaConsistencyReport(saga);
      assert.ok(report.issues.some((issue) => issue.code === 'timeline-dependency-missing' && issue.eventId === 'event-birth'));
      assert.ok(report.issues.some((issue) => issue.code === 'timeline-dependency-missing' && issue.eventId === 'event-arrival'));
    },
  },
  {
    name: 'saga consistency: menciones post-mortem se marcan distinto a acciones',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline.push({
        id: 'event-mention-after-death',
        title: 'Leyenda posterior',
        category: 'other',
        kind: 'point',
        startOrder: 21,
        endOrder: null,
        displayLabel: 'A-21',
        summary: '',
        notes: '',
        bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '13', mode: 'mentioned' }],
        entityIds: ['char-elara'],
        characterImpacts: [],
      });

      const report = buildSagaConsistencyReport(saga);
      assert.equal(
        report.issues.some(
          (issue) =>
            issue.code === 'character-mentioned-after-death' &&
            issue.eventId === 'event-mention-after-death',
        ),
        true,
      );
      assert.equal(
        report.issues.some(
          (issue) => issue.code === 'character-after-death' && issue.eventId === 'event-mention-after-death',
        ),
        false,
      );
    },
  },
  {
    name: 'saga consistency: alias fuera de fecha en contexto no-occurs usa codigo contextual',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline.push({
        id: 'event-contextual-alias',
        title: 'Rumor de taberna',
        category: 'other',
        kind: 'point',
        startOrder: 6,
        endOrder: null,
        displayLabel: 'A-6',
        summary: '',
        notes: '',
        bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: '03', mode: 'mentioned' }],
        entityIds: [],
        characterImpacts: [
          {
            characterId: 'char-elara',
            impactType: 'appearance',
            aliasUsed: 'La Heredera',
            stateChange: 'La nombran asi en un rumor',
          },
        ],
      });

      const report = buildSagaConsistencyReport(saga);
      assert.equal(
        report.issues.some(
          (issue) => issue.code === 'alias-context-mismatch' && issue.eventId === 'event-contextual-alias',
        ),
        true,
      );
    },
  },
  {
    name: 'saga consistency: detecta viaje imposible entre ubicaciones consecutivas',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.characters.push({
        id: 'char-brun',
        name: 'Brun',
        aliases: '',
        summary: '',
        notes: '',
        aliasTimeline: [],
        versions: [],
        lifecycle: {
          birthEventId: null,
          deathEventId: null,
          firstAppearanceEventId: null,
          lastKnownEventId: null,
          currentStatus: 'alive',
        },
      });
      saga.metadata.worldBible.locations.push({
        id: 'loc-isla-lejana',
        name: 'Isla Lejana',
        aliases: '',
        summary: '',
        notes: '',
      });
      saga.metadata.worldBible.timeline.push(
        {
          id: 'event-brun-1',
          title: 'Brun en la ciudadela',
          category: 'journey',
          kind: 'point',
          startOrder: 11,
          endOrder: null,
          displayLabel: 'A-11',
          summary: '',
          notes: '',
          bookRefs: [],
          entityIds: ['char-brun'],
          characterImpacts: [],
          characterLocations: [{ characterId: 'char-brun', locationId: 'loc-ciudadela', notes: '' }],
        },
        {
          id: 'event-brun-2',
          title: 'Brun en la isla',
          category: 'journey',
          kind: 'point',
          startOrder: 12,
          endOrder: null,
          displayLabel: 'A-12',
          summary: '',
          notes: '',
          bookRefs: [],
          entityIds: ['char-brun'],
          characterImpacts: [],
          characterLocations: [{ characterId: 'char-brun', locationId: 'loc-isla-lejana', notes: '' }],
        },
      );

      const report = buildSagaConsistencyReport(saga);
      assert.ok(
        report.issues.some(
          (issue) => issue.code === 'impossible-travel' && issue.eventId === 'event-brun-2' && issue.characterId === 'char-brun',
        ),
      );
    },
  },
  {
    name: 'saga consistency: no marca viaje imposible cuando hay conexion directa',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline.push(
        {
          id: 'event-elara-1',
          title: 'Elara sale de la ciudadela',
          category: 'journey',
          kind: 'point',
          startOrder: 8,
          endOrder: null,
          displayLabel: 'A-8',
          summary: '',
          notes: '',
          bookRefs: [],
          entityIds: ['char-elara'],
          characterImpacts: [],
          characterLocations: [{ characterId: 'char-elara', locationId: 'loc-ciudadela', notes: '' }],
        },
        {
          id: 'event-elara-2',
          title: 'Elara llega al puerto',
          category: 'journey',
          kind: 'point',
          startOrder: 9,
          endOrder: null,
          displayLabel: 'A-9',
          summary: '',
          notes: '',
          bookRefs: [],
          entityIds: ['char-elara'],
          characterImpacts: [],
          characterLocations: [{ characterId: 'char-elara', locationId: 'loc-puerto', notes: '' }],
        },
      );

      const report = buildSagaConsistencyReport(saga);
      assert.equal(
        report.issues.some((issue) => issue.code === 'impossible-travel' && issue.eventId === 'event-elara-2'),
        false,
      );
    },
  },
  {
    name: 'saga consistency: detecta lifecycle invalido',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.characters[0].lifecycle.birthEventId = 'event-crowning';
      saga.metadata.worldBible.characters[0].lifecycle.deathEventId = 'event-arrival';

      const report = buildSagaConsistencyReport(saga);
      assert.ok(report.issues.some((issue) => issue.code === 'invalid-lifecycle-order'));
      assert.ok(report.errorCount >= 1);
    },
  },
  {
    name: 'saga automation: sugiere tipos de relacion conocidos',
    run: () => {
      assert.equal(isKnownRelationshipType('parent-of'), true);
      assert.equal(isKnownRelationshipType('lidera'), false);
      assert.ok(suggestRelationshipTypes('par').includes('parent-of'));
    },
  },
  {
    name: 'saga automation: sugiere ubicacion por continuidad de personaje',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.timeline.push({
        id: 'event-bridge',
        title: 'Puente',
        category: 'journey',
        kind: 'point',
        startOrder: 6,
        endOrder: null,
        displayLabel: 'A-6',
        summary: '',
        notes: '',
        bookRefs: [],
        entityIds: ['char-elara'],
        characterImpacts: [{ characterId: 'char-elara', impactType: 'appearance', aliasUsed: '', stateChange: '' }],
        characterLocations: [],
      });

      const event = saga.metadata.worldBible.timeline.find((entry) => entry.id === 'event-arrival');
      if (event) {
        event.characterLocations = [{ characterId: 'char-elara', locationId: 'loc-puerto', notes: '' }];
      }

      const suggestions = suggestCharacterLocationsForEvent(saga.metadata.worldBible, 'event-bridge');
      assert.ok(suggestions.some((entry) => entry.characterId === 'char-elara' && entry.locationId === 'loc-puerto'));
    },
  },
  {
    name: 'saga automation: autocompleta origen de transferencia de artefacto',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.artifacts.push({
        id: 'artifact-crown',
        name: 'Corona del Norte',
        aliases: '',
        summary: '',
        notes: '',
      });
      saga.metadata.worldBible.timeline.push(
        {
          id: 'event-art-1',
          title: 'Entrega inicial',
          category: 'discovery',
          kind: 'point',
          startOrder: 11,
          endOrder: null,
          displayLabel: 'A-11',
          summary: '',
          notes: '',
          bookRefs: [],
          entityIds: [],
          characterImpacts: [],
          artifactTransfers: [
            { artifactId: 'artifact-crown', fromCharacterId: 'char-elara', toCharacterId: 'char-elara', notes: '' },
          ],
        },
        {
          id: 'event-art-2',
          title: 'Robo',
          category: 'other',
          kind: 'point',
          startOrder: 12,
          endOrder: null,
          displayLabel: 'A-12',
          summary: '',
          notes: '',
          bookRefs: [],
          entityIds: [],
          characterImpacts: [],
          artifactTransfers: [
            { artifactId: 'artifact-crown', fromCharacterId: '', toCharacterId: 'char-elara', notes: '' },
          ],
        },
      );

      const suggested = suggestArtifactTransferOwnersForEvent(saga.metadata.worldBible, 'event-art-2');
      assert.equal(suggested[0]?.fromCharacterId, 'char-elara');
    },
  },
  {
    name: 'saga automation: aplica timeskip en edades de versiones',
    run: () => {
      const saga = createSagaFixture();
      saga.metadata.worldBible.characters[0].versions = [
        {
          id: 'version-elara-1',
          label: 'Princesa',
          startOrder: 1,
          endOrder: null,
          ageStart: 16,
          ageEnd: 18,
          status: 'alive',
          summary: '',
          notes: '',
        },
      ];
      const nextWorld = applyTimeskipToCharacterVersions(saga.metadata.worldBible, 'event-crowning', 10);
      const nextVersion = nextWorld.characters[0].versions?.[0];
      assert.equal(nextVersion?.ageEnd, 28);
    },
  },
  {
    name: 'saga automation: crea version desde impacto de identidad',
    run: () => {
      const saga = createSagaFixture();
      const nextWorld = applyImpactDrivenVersioning(saga.metadata.worldBible, 'event-crowning');
      const character = nextWorld.characters.find((entry) => entry.id === 'char-elara');
      assert.ok((character?.versions?.length ?? 0) >= 1);
      assert.ok((character?.versions ?? []).some((entry) => entry.startOrder === 10));
    },
  },
  {
    name: 'saga automation: refactoriza id de personaje y propaga referencias',
    run: () => {
      const saga = createSagaFixture();
      const refactored = renameSagaIdEverywhere(
        saga.metadata.worldBible,
        'character',
        'char-elara',
        'char-elara-prime',
      );
      assert.equal(refactored.characters.some((entry) => entry.id === 'char-elara-prime'), true);
      assert.equal(
        refactored.relationships.some((entry) => entry.from.id === 'char-elara-prime' || entry.to.id === 'char-elara-prime'),
        true,
      );
      assert.equal(eventIndexForId(refactored, 'event-crowning') >= 0, true);
    },
  },
];

let failures = 0;
for (const testCase of tests) {
  try {
    testCase.run();
    console.log(`[PASS] ${testCase.name}`);
  } catch (error) {
    failures += 1;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Error desconocido';
    console.error(`[FAIL] ${testCase.name}`);
    console.error(`  ${message}`);
  }
}

if (failures > 0) {
  console.error(`\nTests fallidos: ${failures}`);
  process.exit(1);
}

console.log(`\nSuite OK: ${tests.length} tests`);


