import { validateAmazonMetadata } from './amazonValidation';
import { normalizeLanguageCode } from './language';
import type { AppConfig, BookMetadata } from '../types/book';

export type EditorialIssueLevel = 'error' | 'warning';

export interface EditorialIssue {
  id: string;
  level: EditorialIssueLevel;
  title: string;
  message: string;
}

export interface EditorialChecklistReport {
  score: number;
  isReady: boolean;
  errors: EditorialIssue[];
  warnings: EditorialIssue[];
  issues: EditorialIssue[];
}

function inferMarketplaceLanguageHint(marketplace: string): string | null {
  const raw = marketplace.trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw.endsWith('.com')) return 'en';
  if (raw.endsWith('.es') || raw.endsWith('.com.mx')) return 'es';
  if (raw.endsWith('.com.br')) return 'pt';
  if (raw.endsWith('.fr')) return 'fr';
  if (raw.endsWith('.de')) return 'de';
  if (raw.endsWith('.it')) return 'it';
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasValidPrice(value: number | null): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toIssue(
  id: string,
  level: EditorialIssueLevel,
  title: string,
  message: string,
): EditorialIssue {
  return { id, level, title, message };
}

export function buildEditorialChecklist(metadata: BookMetadata, config: AppConfig): EditorialChecklistReport {
  const issues: EditorialIssue[] = [];
  const amazon = metadata.amazon;

  if (!metadata.coverImage) {
    issues.push(
      toIssue(
        'cover.missing',
        'error',
        'Portada faltante',
        'Carga una portada antes de exportar o publicar.',
      ),
    );
  }

  if (!metadata.backCoverImage) {
    issues.push(
      toIssue(
        'cover.back.missing',
        'warning',
        'Contraportada faltante',
        'Para eBook no es obligatoria, pero para flujo editorial completo conviene cargarla.',
      ),
    );
  }

  const normalizedConfigLanguage = normalizeLanguageCode(config.language);
  const normalizedAmazonLanguage = normalizeLanguageCode(amazon.language);
  if (
    normalizedConfigLanguage &&
    normalizedAmazonLanguage &&
    normalizedConfigLanguage !== normalizedAmazonLanguage
  ) {
    issues.push(
      toIssue(
        'language.mismatch',
        'warning',
        'Idioma desalineado',
        `Config usa "${normalizedConfigLanguage}" y Amazon usa "${normalizedAmazonLanguage}".`,
      ),
    );
  }

  const marketplaceHint = inferMarketplaceLanguageHint(amazon.marketplace);
  if (marketplaceHint && normalizedAmazonLanguage && !normalizedAmazonLanguage.startsWith(marketplaceHint)) {
    issues.push(
      toIssue(
        'marketplace.language',
        'warning',
        'Idioma y marketplace no coinciden',
        'Revisa marketplace principal y lenguaje de publicacion.',
      ),
    );
  }

  const pricingRows = amazon.marketPricing.filter((row) => row.marketplace.trim().length > 0);
  if (pricingRows.length === 0) {
    issues.push(
      toIssue(
        'pricing.missing',
        'error',
        'Precios faltantes',
        'Define al menos un marketplace con precio valido.',
      ),
    );
  } else {
    const rowsWithPrice = pricingRows.filter(
      (row) => hasValidPrice(row.ebookPrice) || hasValidPrice(row.printPrice),
    );
    if (rowsWithPrice.length === 0) {
      issues.push(
        toIssue(
          'pricing.invalid',
          'error',
          'Precios invalidos',
          'No hay precios > 0 para eBook o print.',
        ),
      );
    }
  }

  const amazonValidation = validateAmazonMetadata(metadata);
  for (const issue of amazonValidation.issues) {
    issues.push(
      toIssue(
        `amazon.${issue.field}`,
        issue.level === 'error' ? 'error' : 'warning',
        issue.level === 'error' ? 'Metadata Amazon incompleta' : 'Metadata Amazon a revisar',
        issue.message,
      ),
    );
  }

  const errors = issues.filter((item) => item.level === 'error');
  const warnings = issues.filter((item) => item.level === 'warning');
  const score = clamp(100 - errors.length * 18 - warnings.length * 6, 0, 100);

  return {
    score,
    isReady: errors.length === 0,
    errors,
    warnings,
    issues,
  };
}
