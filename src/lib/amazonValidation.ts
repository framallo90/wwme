import { KDP_CATEGORY_CATALOG } from '../data/kdpCategories';
import type { AmazonMarketPricing, BookMetadata } from '../types/book';

export interface AmazonValidationIssue {
  field: string;
  level: 'error' | 'warning';
  message: string;
}

export interface AmazonValidationResult {
  errors: AmazonValidationIssue[];
  warnings: AmazonValidationIssue[];
  issues: AmazonValidationIssue[];
  isValid: boolean;
  readinessScore: number;
}

export interface AmazonFieldCounters {
  title: { current: number; max: number };
  subtitle: { current: number; max: number };
  shortDescription: { current: number; max: number };
  longDescription: { current: number; max: number };
  authorBio: { current: number; max: number };
}

export const AMAZON_LIMITS = {
  titleMax: 200,
  subtitleMax: 200,
  shortDescriptionMax: 1000,
  longDescriptionMax: 4000,
  authorBioMax: 4000,
  maxKeywords: 7,
  maxKeywordChars: 50,
  minLongDescriptionChars: 200,
} as const;

function trimValue(value: string): string {
  return value.trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isCategoryKnown(value: string): boolean {
  return KDP_CATEGORY_CATALOG.some((entry) => entry.toLowerCase() === value.toLowerCase());
}

function hasValidPrice(pricing: AmazonMarketPricing): boolean {
  const ebookValid = typeof pricing.ebookPrice === 'number' && pricing.ebookPrice > 0;
  const printValid = typeof pricing.printPrice === 'number' && pricing.printPrice > 0;
  return ebookValid || printValid;
}

export function getAmazonFieldCounters(metadata: BookMetadata): AmazonFieldCounters {
  return {
    title: { current: metadata.amazon.kdpTitle.length, max: AMAZON_LIMITS.titleMax },
    subtitle: { current: metadata.amazon.subtitle.length, max: AMAZON_LIMITS.subtitleMax },
    shortDescription: { current: metadata.amazon.backCoverText.length, max: AMAZON_LIMITS.shortDescriptionMax },
    longDescription: { current: metadata.amazon.longDescription.length, max: AMAZON_LIMITS.longDescriptionMax },
    authorBio: { current: metadata.amazon.authorBio.length, max: AMAZON_LIMITS.authorBioMax },
  };
}

export function estimateEbookRoyalty(
  price: number | null,
  plan: 35 | 70,
): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const ratio = plan === 70 ? 0.7 : 0.35;
  return Number((price * ratio).toFixed(2));
}

export function estimatePrintRoyalty(
  printPrice: number | null,
  printCostEstimate: number,
): number | null {
  if (
    typeof printPrice !== 'number' ||
    !Number.isFinite(printPrice) ||
    printPrice <= 0 ||
    !Number.isFinite(printCostEstimate) ||
    printCostEstimate < 0
  ) {
    return null;
  }

  return Number(Math.max(0, printPrice * 0.6 - printCostEstimate).toFixed(2));
}

export function validateAmazonMetadata(metadata: BookMetadata): AmazonValidationResult {
  const issues: AmazonValidationIssue[] = [];
  const amazon = metadata.amazon;
  const title = trimValue(amazon.kdpTitle);
  const penName = trimValue(amazon.penName);
  const language = trimValue(amazon.language);
  const longDescription = amazon.longDescription;

  if (!title) {
    issues.push({ field: 'kdpTitle', level: 'error', message: 'Titulo KDP es obligatorio.' });
  }
  if (title.length > AMAZON_LIMITS.titleMax) {
    issues.push({
      field: 'kdpTitle',
      level: 'error',
      message: `Titulo KDP supera ${AMAZON_LIMITS.titleMax} caracteres.`,
    });
  }

  if (amazon.subtitle.length > AMAZON_LIMITS.subtitleMax) {
    issues.push({
      field: 'subtitle',
      level: 'warning',
      message: `Subtitulo supera ${AMAZON_LIMITS.subtitleMax} caracteres.`,
    });
  }

  if (!penName) {
    issues.push({ field: 'penName', level: 'error', message: 'Autor/Pen Name es obligatorio.' });
  }

  if (!language) {
    issues.push({ field: 'language', level: 'error', message: 'Idioma es obligatorio.' });
  }

  if (!trimValue(longDescription)) {
    issues.push({ field: 'longDescription', level: 'error', message: 'Descripcion larga es obligatoria.' });
  }
  if (longDescription.length > AMAZON_LIMITS.longDescriptionMax) {
    issues.push({
      field: 'longDescription',
      level: 'error',
      message: `Descripcion larga supera ${AMAZON_LIMITS.longDescriptionMax} caracteres.`,
    });
  }
  if (
    trimValue(longDescription).length > 0 &&
    trimValue(longDescription).length < AMAZON_LIMITS.minLongDescriptionChars
  ) {
    issues.push({
      field: 'longDescription',
      level: 'warning',
      message: `Descripcion larga muy corta. Recomendado: al menos ${AMAZON_LIMITS.minLongDescriptionChars} caracteres.`,
    });
  }

  if (amazon.backCoverText.length > AMAZON_LIMITS.shortDescriptionMax) {
    issues.push({
      field: 'backCoverText',
      level: 'warning',
      message: `Descripcion corta supera ${AMAZON_LIMITS.shortDescriptionMax} caracteres.`,
    });
  }

  if (amazon.authorBio.length > AMAZON_LIMITS.authorBioMax) {
    issues.push({
      field: 'authorBio',
      level: 'warning',
      message: `Bio autor supera ${AMAZON_LIMITS.authorBioMax} caracteres.`,
    });
  }

  const keywords = amazon.keywords.map((keyword) => normalizeSpaces(keyword)).filter(Boolean);
  if (keywords.length === 0) {
    issues.push({ field: 'keywords', level: 'error', message: 'Debes definir keywords.' });
  }
  if (keywords.length > AMAZON_LIMITS.maxKeywords) {
    issues.push({
      field: 'keywords',
      level: 'error',
      message: `Solo se permiten ${AMAZON_LIMITS.maxKeywords} keywords.`,
    });
  }
  for (const [index, keyword] of keywords.entries()) {
    if (keyword.length > AMAZON_LIMITS.maxKeywordChars) {
      issues.push({
        field: `keywords.${index}`,
        level: 'warning',
        message: `Keyword ${index + 1} supera ${AMAZON_LIMITS.maxKeywordChars} caracteres.`,
      });
    }
  }

  const categories = amazon.categories.map((category) => normalizeSpaces(category)).filter(Boolean);
  if (categories.length === 0) {
    issues.push({ field: 'categories', level: 'error', message: 'Debes definir al menos una categoria.' });
  }
  for (const [index, category] of categories.entries()) {
    if (!isCategoryKnown(category)) {
      issues.push({
        field: `categories.${index}`,
        level: 'warning',
        message: `Categoria no encontrada en catalogo local: "${category}".`,
      });
    }
  }

  for (const [index, contributor] of amazon.contributors.entries()) {
    if (!trimValue(contributor.name)) {
      issues.push({
        field: `contributors.${index}.name`,
        level: 'error',
        message: `Colaborador ${index + 1} sin nombre.`,
      });
    }
    if (!trimValue(contributor.role)) {
      issues.push({
        field: `contributors.${index}.role`,
        level: 'warning',
        message: `Colaborador ${index + 1} sin rol.`,
      });
    }
  }

  if (!amazon.ownCopyright) {
    issues.push({
      field: 'ownCopyright',
      level: 'warning',
      message: 'Marcaste dominio publico. Verifica licencias y derechos para evitar bloqueos en KDP.',
    });
  }

  const pricingRows = amazon.marketPricing.filter(
    (row) => trimValue(row.marketplace) && trimValue(row.currency),
  );
  if (pricingRows.length === 0) {
    issues.push({
      field: 'marketPricing',
      level: 'warning',
      message: 'No hay precios definidos por marketplace.',
    });
  } else {
    const rowsWithPrice = pricingRows.filter(hasValidPrice);
    if (rowsWithPrice.length === 0) {
      issues.push({
        field: 'marketPricing',
        level: 'warning',
        message: 'No hay precios validos (> 0) para eBook o print.',
      });
    }

    for (const row of pricingRows) {
      const marketplaceLabel = `${row.marketplace} (${row.currency})`;
      if (typeof row.ebookPrice === 'number' && row.ebookPrice > 0) {
        if (amazon.ebookRoyaltyPlan === 70 && row.currency === 'USD' && (row.ebookPrice < 2.99 || row.ebookPrice > 9.99)) {
          issues.push({
            field: 'marketPricing',
            level: 'warning',
            message: `Precio eBook ${marketplaceLabel} fuera de rango tipico para 70% (USD 2.99 - 9.99).`,
          });
        }
      }
      if (typeof row.printPrice === 'number' && row.printPrice > 0 && !trimValue(amazon.isbn)) {
        issues.push({
          field: 'isbn',
          level: 'warning',
          message: `Hay precio print en ${marketplaceLabel} y no hay ISBN cargado.`,
        });
      }
    }
  }

  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  const readinessScore = clamp(100 - errors.length * 18 - warnings.length * 6, 0, 100);

  return {
    errors,
    warnings,
    issues,
    isValid: errors.length === 0,
    readinessScore,
  };
}
