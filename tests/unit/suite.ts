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
  normalizeLanguageCode,
  resolveLanguageSelectValue,
} from '../../src/lib/language';
import {
  buildAmazonCopyPack,
  generateAmazonCopy,
  applyAmazonPreset,
  categoriesAsLines,
  keywordsAsLines,
} from '../../src/lib/amazon';
import {
  buildActionPrompt,
  buildAutoRewritePrompt,
  buildChatPrompt,
  buildContinuousChapterPrompt,
  buildFoundationBlock,
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
import type { BookFoundation, BookMetadata, ChapterDocument, InteriorFormat } from '../../src/types/book';

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

function createMetadata(): BookMetadata {
  return {
    title: 'El faro y la niebla',
    author: 'Demo WriteWMe',
    chapterOrder: ['01'],
    coverImage: null,
    backCoverImage: null,
    spineText: 'El faro y la niebla',
    foundation: createFoundation(),
    amazon: {
      presetType: 'intimate-narrative',
      marketplace: 'amazon.com',
      language: 'Espanol',
      kdpTitle: '',
      subtitle: '',
      penName: '',
      seriesName: '',
      edition: '',
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
      assert.equal(profile.maxWords, 3500);
      assert.ok(getChapterLengthInstruction('media').includes('1500-2200'));
    },
  },
  {
    name: 'language: normaliza codigo, select value e instruccion',
    run: () => {
      assert.equal(normalizeLanguageCode(' ES '), 'es');
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
    },
  },
  {
    name: 'prompts: action/chat/autorewrite/continuous incluyen reglas clave',
    run: () => {
      const foundation = createFoundation();
      const actionPrompt = buildActionPrompt({
        actionId: 'polish-style',
        selectedText: 'Texto base',
        chapterTitle: 'Capitulo 1',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
        chapterLengthPreset: 'media',
      });
      assert.ok(actionPrompt.includes('Idioma de salida obligatorio'));
      assert.ok(actionPrompt.includes('Objetivo de extension del capitulo'));

      const draftPrompt = buildActionPrompt({
        actionId: 'draft-from-idea',
        selectedText: 'Aria conoce al dragon en el puerto.',
        ideaText: 'Aria conoce al dragon en el puerto.',
        chapterTitle: 'Capitulo 1',
        bookTitle: 'Libro',
        language: 'es',
        foundation,
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
        chapterTitle: 'Capitulo 1',
        chapterLengthPreset: 'media',
        chapterText: 'Texto',
        fullBookText: 'Libro completo',
        round: 1,
        maxRounds: 3,
      });
      assert.ok(continuousPrompt.includes('ESTADO: DONE o CONTINUE'));

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

