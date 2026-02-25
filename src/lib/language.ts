export interface AppLanguageOption {
  code: string;
  label: string;
  aiLabel: string;
}

export const APP_LANGUAGE_OPTIONS: AppLanguageOption[] = [
  { code: 'es', label: 'Español', aiLabel: 'Español neutro' },
  { code: 'en', label: 'English', aiLabel: 'English' },
  { code: 'pt', label: 'Português', aiLabel: 'Português' },
  { code: 'fr', label: 'Français', aiLabel: 'Français' },
  { code: 'it', label: 'Italiano', aiLabel: 'Italiano' },
  { code: 'de', label: 'Deutsch', aiLabel: 'Deutsch' },
  { code: 'ca', label: 'Català', aiLabel: 'Català' },
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
