interface NumberBounds {
  min?: number;
  max?: number;
}

function clamp(value: number, bounds?: NumberBounds): number {
  let next = value;
  if (typeof bounds?.min === 'number') {
    next = Math.max(bounds.min, next);
  }
  if (typeof bounds?.max === 'number') {
    next = Math.min(bounds.max, next);
  }
  return next;
}

function normalizeNumericText(raw: string): string {
  let normalized = raw.trim().replace(/\s+/g, '');
  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');

  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
    return normalized;
  }

  if (commaIndex >= 0) {
    return normalized.replace(',', '.');
  }

  return normalized;
}

export function parseLocaleNumber(value: string): number | null {
  const normalized = normalizeNumericText(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLocaleNumberOr(
  value: string,
  fallback: number,
  bounds?: NumberBounds,
): number {
  const parsed = parseLocaleNumber(value);
  if (parsed === null) {
    return clamp(fallback, bounds);
  }

  return clamp(parsed, bounds);
}

export function parseLocaleIntegerOr(
  value: string,
  fallback: number,
  bounds?: NumberBounds,
): number {
  const parsed = parseLocaleNumber(value);
  if (parsed === null) {
    return Math.round(clamp(fallback, bounds));
  }

  return Math.round(clamp(parsed, bounds));
}

