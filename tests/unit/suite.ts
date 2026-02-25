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
  safeFileName,
  slugify,
  splitAiOutputAndSummary,
} from '../../src/lib/text';
import {
  countWordsFromHtml,
  countWordsFromPlainText,
  estimatePagesFromWords,
  formatNumber,
} from '../../src/lib/metrics';
import { diffTextBlocks, summarizeDiffOperations } from '../../src/lib/diff';
import { createZipArchive } from '../../src/lib/zip';
import { analyzePlainTextStyle, analyzeHtmlStyle, getStyleLevelLabel } from '../../src/lib/styleMetrics';
import type { BookFoundation, BookMetadata, ChapterDocument, InteriorFormat, StoryBible } from '../../src/types/book';

interface ElementLike {
  innerHTML: string;
  textContent: string;
  value?: string;
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

function installDomStub(): void {
  const documentStub = {
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
  };

  Object.assign(globalThis, { document: documentStub });
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


