export interface AppLanguageOption {
  code: string;
  label: string;
  aiLabel: string;
}

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

