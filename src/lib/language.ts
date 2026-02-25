export interface AppLanguageOption {
  code: string;
  label: string;
  aiLabel: string;
}

const LANGUAGE_CODE_FORMAT = /^[a-z]{2,3}(?:-[a-zA-Z]{2,4})?$/;

const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  spanish: 'es',
  espanol: 'es',
  espanollatam: 'es',
  castilian: 'es',
  english: 'en',
  ingles: 'en',
  portuguese: 'pt',
  portugues: 'pt',
  french: 'fr',
  francais: 'fr',
  italiano: 'it',
  italian: 'it',
  german: 'de',
  deutsch: 'de',
  catalan: 'ca',
  catala: 'ca',
  galician: 'gl',
  galego: 'gl',
  basque: 'eu',
  euskara: 'eu',
};

export const APP_LANGUAGE_OPTIONS: AppLanguageOption[] = [
  { code: 'es', label: 'Espanol', aiLabel: 'Espanol neutro' },
  { code: 'en', label: 'English', aiLabel: 'English' },
  { code: 'pt', label: 'Portugues', aiLabel: 'Portugues' },
  { code: 'fr', label: 'Francais', aiLabel: 'Francais' },
  { code: 'it', label: 'Italiano', aiLabel: 'Italiano' },
  { code: 'de', label: 'Deutsch', aiLabel: 'Deutsch' },
  { code: 'ca', label: 'Catala', aiLabel: 'Catala' },
  { code: 'gl', label: 'Galego', aiLabel: 'Galego' },
  { code: 'eu', label: 'Euskara', aiLabel: 'Euskara' },
];

export function normalizeLanguageCode(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return 'es';
  }

  const compactKey = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
  const aliasMatch = LANGUAGE_ALIAS_MAP[compactKey];
  if (aliasMatch) {
    return aliasMatch;
  }

  return trimmed;
}

export function getLanguageOption(code: string): AppLanguageOption | null {
  const normalized = normalizeLanguageCode(code);
  return APP_LANGUAGE_OPTIONS.find((option) => option.code === normalized) ?? null;
}

export function resolveLanguageSelectValue(value: string | null | undefined): string {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) {
    return 'custom';
  }

  return APP_LANGUAGE_OPTIONS.some((option) => option.code === raw) ? raw : 'custom';
}

export function isLanguageCodeFormatValid(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim();
  if (!raw) {
    return false;
  }

  return LANGUAGE_CODE_FORMAT.test(raw);
}

export function getLanguageInstruction(code: string): string {
  const option = getLanguageOption(code);
  if (option) {
    return `Idioma de salida obligatorio: ${option.aiLabel}.`;
  }

  return `Idioma de salida obligatorio: ${normalizeLanguageCode(code)}.`;
}

export function getLanguageDisplayName(code: string): string {
  const option = getLanguageOption(code);
  return option?.label ?? normalizeLanguageCode(code);
}

