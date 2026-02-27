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
  buildChatPrompt,
  buildContinuityGuardPrompt,
  buildContinuousChapterPrompt,
  buildFoundationBlock,
  parseContinuityGuardOutput,
  selectStoryBibleForPrompt,
} from '../../src/lib/prompts';
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
import {
  buildBookAudioExportPath,
  buildBookAudioText,
  buildChapterAudioExportPath,
  buildChapterAudioText,
  pickSpeechVoice,
  resolveSpeechLanguageTag,
} from '../../src/lib/audio';
import type { AppConfig, BookFoundation, BookMetadata, ChapterDocument, InteriorFormat, StoryBible } from '../../src/types/book';

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
    chatApplyIterations: 1,
    continuousAgentEnabled: false,
    continuousAgentMaxRounds: 3,
    continuityGuardEnabled: true,
    ollamaOptions: {},
    autosaveIntervalMs: 2000,
    backupEnabled: false,
    backupDirectory: '',
    backupIntervalMs: 120000,
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
    name: 'text: elimina BOM UTF-8 al inicio',
    run: () => {
      assert.equal(stripUtf8Bom('\uFEFF{"ok":true}'), '{"ok":true}');
      assert.equal(stripUtf8Bom('{"ok":true}'), '{"ok":true}');
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
      assert.ok(continuityPrompt.includes('TEXTO:'));

      const parsedContinuity = parseContinuityGuardOutput(
        'ESTADO: FAIL\nRAZON: Lena no puede revelar ese dato aun.\nTEXTO:\nLena evita hablar del plan real.',
      );
      assert.equal(parsedContinuity.status, 'FAIL');
      assert.ok(parsedContinuity.reason.includes('Lena'));
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


