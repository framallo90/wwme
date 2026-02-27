import type { AmazonPresetType } from '../types/book';

export type KdpMarketGenre = 'fiction' | 'non-fiction' | 'general';

export interface KdpMarketInsightInput {
  presetType: AmazonPresetType;
  categories: string[];
  marketplace: string;
  language: string;
  wordCount: number;
}

export interface KdpMarketInsight {
  segment: string;
  genre: KdpMarketGenre;
  currency: string;
  priceRange: string;
  suggestedEbookPrice: number;
  descriptionHint: string;
  rationales: string[];
  ruleVersion: 'kdp-rules-v1';
}

interface MarketplaceProfile {
  id: 'us' | 'es' | 'mx' | 'br' | 'eu' | 'global';
  label: string;
  currency: string;
  fictionBand: [number, number];
  nonFictionBand: [number, number];
  generalBand: [number, number];
}

const MARKETPLACE_PROFILES: Array<{ pattern: RegExp; profile: MarketplaceProfile }> = [
  {
    pattern: /amazon\.(com|ca|co\.uk|com\.au)/i,
    profile: {
      id: 'us',
      label: 'Amazon internacional (USD)',
      currency: 'USD',
      fictionBand: [2.99, 5.99],
      nonFictionBand: [4.99, 9.99],
      generalBand: [3.99, 6.99],
    },
  },
  {
    pattern: /amazon\.es/i,
    profile: {
      id: 'es',
      label: 'Amazon Espana',
      currency: 'EUR',
      fictionBand: [2.99, 5.99],
      nonFictionBand: [3.99, 8.99],
      generalBand: [3.49, 6.49],
    },
  },
  {
    pattern: /amazon\.com\.mx/i,
    profile: {
      id: 'mx',
      label: 'Amazon Mexico',
      currency: 'MXN',
      fictionBand: [59, 109],
      nonFictionBand: [89, 179],
      generalBand: [69, 139],
    },
  },
  {
    pattern: /amazon\.com\.br/i,
    profile: {
      id: 'br',
      label: 'Amazon Brasil',
      currency: 'BRL',
      fictionBand: [9.99, 24.9],
      nonFictionBand: [14.9, 34.9],
      generalBand: [11.9, 27.9],
    },
  },
  {
    pattern: /amazon\.(de|fr|it|nl|pl|se)/i,
    profile: {
      id: 'eu',
      label: 'Amazon Europa continental',
      currency: 'EUR',
      fictionBand: [2.99, 6.99],
      nonFictionBand: [4.99, 9.99],
      generalBand: [3.99, 7.49],
    },
  },
];

const GENERIC_PROFILE: MarketplaceProfile = {
  id: 'global',
  label: 'Marketplace global',
  currency: 'USD',
  fictionBand: [2.99, 5.99],
  nonFictionBand: [4.99, 9.99],
  generalBand: [3.99, 6.99],
};

const FICTION_TOKENS = ['ficcion', 'narrativa', 'novela', 'thriller', 'misterio', 'fantasia', 'romance'];
const NON_FICTION_TOKENS = ['no ficcion', 'ensayo', 'autoayuda', 'negocios', 'liderazgo', 'marketing', 'biografia'];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectMarketplaceProfile(marketplace: string): MarketplaceProfile {
  const normalized = normalize(marketplace.trim());
  for (const entry of MARKETPLACE_PROFILES) {
    if (entry.pattern.test(normalized)) {
      return entry.profile;
    }
  }
  return GENERIC_PROFILE;
}

function detectGenre(input: KdpMarketInsightInput): { genre: KdpMarketGenre; reasons: string[] } {
  const reasons: string[] = [];
  const normalizedCategories = input.categories.map((item) => normalize(item));
  const hasFictionCategory = normalizedCategories.some((category) =>
    FICTION_TOKENS.some((token) => category.includes(token)),
  );
  const hasNonFictionCategory = normalizedCategories.some((category) =>
    NON_FICTION_TOKENS.some((token) => category.includes(token)),
  );

  if (hasFictionCategory || input.presetType === 'intimate-narrative') {
    reasons.push('Detectado segmento ficcion/narrativa por categorias o preset.');
    return { genre: 'fiction', reasons };
  }

  if (
    hasNonFictionCategory ||
    input.presetType === 'practical-essay' ||
    input.presetType === 'non-fiction-reflexive'
  ) {
    reasons.push('Detectado segmento no ficcion/ensayo por categorias o preset.');
    return { genre: 'non-fiction', reasons };
  }

  reasons.push('Sin categoria dominante clara: se aplica segmento general.');
  return { genre: 'general', reasons };
}

function getBandForGenre(profile: MarketplaceProfile, genre: KdpMarketGenre): [number, number] {
  if (genre === 'fiction') {
    return profile.fictionBand;
  }
  if (genre === 'non-fiction') {
    return profile.nonFictionBand;
  }
  return profile.generalBand;
}

function pickPsychologicalPrice(min: number, max: number): number {
  const candidates = [2.99, 3.49, 3.99, 4.49, 4.99, 5.99, 6.99, 7.99, 8.99, 9.99, 10.99, 12.99, 14.99, 19.99, 24.9];
  const valid = candidates.filter((value) => value >= min && value <= max);
  if (valid.length === 0) {
    return Number(((min + max) / 2).toFixed(2));
  }
  return valid[Math.floor(valid.length / 2)];
}

function estimateDescriptionHint(genre: KdpMarketGenre): string {
  if (genre === 'fiction') {
    return 'Hook emocional inicial + conflicto central + promesa de tension narrativa.';
  }
  if (genre === 'non-fiction') {
    return 'Problema concreto + beneficio medible + autoridad del autor + llamada a accion.';
  }
  return 'Hook inicial + propuesta de valor + cierre con llamada a lectura.';
}

function getSegmentLabel(genre: KdpMarketGenre): string {
  if (genre === 'fiction') {
    return 'Ficcion / narrativa';
  }
  if (genre === 'non-fiction') {
    return 'No ficcion / ensayo';
  }
  return 'General';
}

export function buildKdpMarketInsight(input: KdpMarketInsightInput): KdpMarketInsight {
  const profile = detectMarketplaceProfile(input.marketplace);
  const genreResult = detectGenre(input);
  const band = getBandForGenre(profile, genreResult.genre);

  const rationales: string[] = [
    ...genreResult.reasons,
    `Marketplace detectado: ${profile.label}.`,
    `Banda de precio aplicada para ${getSegmentLabel(genreResult.genre)}: ${band[0]}-${band[1]} ${profile.currency}.`,
  ];

  if (input.wordCount >= 90_000 && genreResult.genre === 'fiction') {
    rationales.push('Manuscrito extenso detectado (>90k palabras): rango medio-alto recomendado.');
  }

  if (normalize(input.language).startsWith('es') && profile.currency === 'USD') {
    rationales.push('Idioma en espanol con marketplace USD: revisar pricing por pais para evitar conversiones poco psicologicas.');
  }

  const suggestedEbookPrice = pickPsychologicalPrice(band[0], band[1]);

  return {
    segment: getSegmentLabel(genreResult.genre),
    genre: genreResult.genre,
    currency: profile.currency,
    priceRange: `${profile.currency} ${band[0]} - ${band[1]}`,
    suggestedEbookPrice,
    descriptionHint: estimateDescriptionHint(genreResult.genre),
    rationales,
    ruleVersion: 'kdp-rules-v1',
  };
}
