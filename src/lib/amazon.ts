import type { AmazonKdpData, AmazonPresetType, BookMetadata, ChapterDocument } from '../types/book';
import { stripHtml } from './text';

interface PresetDefinition {
  categories: string[];
  keywordSeeds: string[];
  subtitleHint: string;
  notes: string;
}

const PRESET_MAP: Record<AmazonPresetType, PresetDefinition> = {
  'non-fiction-reflexive': {
    categories: [
      'Libros > Literatura y ficcion > Ensayos',
      'Libros > Salud familia y desarrollo personal > Escritura',
      'Libros > Negocios y dinero > Productividad',
    ],
    keywordSeeds: ['escritura reflexiva', 'claridad mental', 'pensar escribiendo', 'ensayo personal'],
    subtitleHint: 'Reflexiones practicas para pensar mejor escribiendo',
    notes: 'Ideal para ensayo personal, no ficcion y tono sobrio.',
  },
  'practical-essay': {
    categories: [
      'Libros > Negocios y dinero > Habilidades profesionales',
      'Libros > Salud familia y desarrollo personal > Exito personal',
      'Libros > Educacion y ensenanza > Material didactico',
    ],
    keywordSeeds: ['metodo de escritura', 'escritura productiva', 'organizar ideas', 'pensamiento critico'],
    subtitleHint: 'Metodo practico para ordenar ideas y escribir con criterio',
    notes: 'Ideal para contenido aplicable, frameworks y ejercicios.',
  },
  'intimate-narrative': {
    categories: [
      'Libros > Literatura y ficcion > Historias cortas',
      'Libros > Literatura y ficcion > Narrativa contemporanea',
      'Libros > Literatura y ficcion > Ficcion literaria',
    ],
    keywordSeeds: ['voz intima', 'narrativa reflexiva', 'prosa sobria', 'historia personal'],
    subtitleHint: 'Una narrativa intima sobre experiencia y sentido',
    notes: 'Ideal para narrativa en primera persona y tono contemplativo.',
  },
};

function uniqueNonEmpty(values: string[], max: number): string[] {
  const set = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (set.has(key)) {
      continue;
    }
    set.add(key);
    result.push(normalized);
    if (result.length >= max) {
      break;
    }
  }

  return result;
}

function ensureLength(values: string[], length: number): string[] {
  const next = [...values];
  while (next.length < length) {
    next.push('');
  }
  return next.slice(0, length);
}

function splitCommaValues(value: string): string[] {
  return value
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function applyAmazonPreset(
  amazon: AmazonKdpData,
  presetType: AmazonPresetType,
  context: { bookTitle: string; author: string },
): AmazonKdpData {
  const preset = PRESET_MAP[presetType];
  const keywords = ensureLength(uniqueNonEmpty([...preset.keywordSeeds], 7), 7);

  return {
    ...amazon,
    presetType,
    kdpTitle: amazon.kdpTitle || context.bookTitle,
    penName: amazon.penName || context.author,
    subtitle: amazon.subtitle || preset.subtitleHint,
    keywords,
    categories: preset.categories,
    kdpNotes: amazon.kdpNotes || preset.notes,
  };
}

function getChapterPreview(chapters: ChapterDocument[]): string {
  if (chapters.length === 0) {
    return '';
  }

  const first = stripHtml(chapters[0].content);
  return first.slice(0, 320);
}

export function generateAmazonCopy(
  metadata: BookMetadata,
  chapters: ChapterDocument[],
  source: AmazonKdpData,
): AmazonKdpData {
  const preset = PRESET_MAP[source.presetType];
  const foundation = metadata.foundation;

  const subtitle =
    source.subtitle || foundation.promise || foundation.centralIdea || preset.subtitleHint;

  const preview = getChapterPreview(chapters);

  const backCoverText =
    source.backCoverText ||
    [
      foundation.centralIdea || metadata.title,
      foundation.promise || 'Una propuesta clara para avanzar con foco y criterio.',
      foundation.audience ? `Pensado para: ${foundation.audience}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

  const longDescription =
    source.longDescription ||
    [
      `"${metadata.title}" es un libro en ${source.language.toLowerCase()} orientado a ${foundation.audience || 'lectores que buscan claridad y profundidad'}.`,
      foundation.promise || 'Ofrece una promesa concreta y aplicable.',
      '',
      'Que vas a encontrar:',
      `- ${foundation.centralIdea || 'Una idea central sostenida y coherente.'}`,
      `- ${foundation.styleRules || 'Una voz clara, sobria y sin relleno.'}`,
      `- ${foundation.structureNotes || 'Un recorrido progresivo con foco practico.'}`,
      '',
      preview ? `Extracto: ${preview}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  const glossaryPreferred = splitCommaValues(foundation.glossaryPreferred);
  const seededKeywords = uniqueNonEmpty(
    [
      ...source.keywords,
      ...preset.keywordSeeds,
      ...glossaryPreferred,
      metadata.title,
      foundation.centralIdea,
      foundation.promise,
    ],
    7,
  );

  const authorBio =
    source.authorBio ||
    `${source.penName || metadata.author} escribe con enfoque ${foundation.narrativeVoice || 'intimo y sobrio'}, priorizando claridad y consistencia.`;

  return {
    ...source,
    kdpTitle: source.kdpTitle || metadata.title,
    subtitle,
    backCoverText,
    longDescription,
    authorBio,
    keywords: ensureLength(seededKeywords, 7),
    categories: source.categories.length > 0 ? source.categories : preset.categories,
  };
}

export function buildAmazonCopyPack(metadata: BookMetadata): string {
  const amazon = metadata.amazon;
  const contributorsLines =
    amazon.contributors.length > 0
      ? amazon.contributors.map((contributor) => `- ${contributor.role}: ${contributor.name}`)
      : ['(sin colaboradores)'];

  return [
    'AMAZON KDP PACK',
    `Marketplace: ${amazon.marketplace}`,
    `Idioma: ${amazon.language}`,
    '',
    `Titulo: ${amazon.kdpTitle}`,
    `Subtitulo: ${amazon.subtitle}`,
    `Autor / Pen Name: ${amazon.penName}`,
    `Serie: ${amazon.seriesName}`,
    `Edicion: ${amazon.edition}`,
    `ISBN: ${amazon.isbn || '(sin definir)'}`,
    `Derechos de publicacion: ${amazon.ownCopyright ? 'Poseo derechos' : 'Dominio publico'}`,
    `Contenido para adultos (+18): ${amazon.isAdultContent ? 'Si' : 'No'}`,
    `DRM eBook: ${amazon.enableDRM ? 'Activado' : 'Desactivado'}`,
    `KDP Select: ${amazon.enrollKDPSelect ? 'Inscripto' : 'No inscripto'}`,
    '',
    'Colaboradores:',
    ...contributorsLines,
    '',
    'Descripcion corta (contratapa):',
    amazon.backCoverText,
    '',
    'Descripcion larga (KDP):',
    amazon.longDescription,
    '',
    'Keywords (1 por linea):',
    ...amazon.keywords,
    '',
    'Categorias (1 por linea):',
    ...amazon.categories,
    '',
    'Bio autor:',
    amazon.authorBio,
    '',
    'Notas KDP:',
    amazon.kdpNotes,
  ].join('\n');
}

export function keywordsAsLines(amazon: AmazonKdpData): string {
  return amazon.keywords.join('\n');
}

export function categoriesAsLines(amazon: AmazonKdpData): string {
  return amazon.categories.join('\n');
}
