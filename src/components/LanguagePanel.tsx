import { useMemo } from 'react';
import {
  APP_LANGUAGE_OPTIONS,
  getLanguageDisplayName,
  isLanguageCodeFormatValid,
  normalizeLanguageCode,
  resolveLanguageSelectValue,
} from '../lib/language';
import type { AppConfig } from '../types/book';

interface LanguagePanelProps {
  config: AppConfig;
  bookPath: string | null;
  amazonLanguage: string | null;
  amazonMarketplace: string | null;
  onChangeLanguage: (language: string) => void;
  onSave: () => void;
  isDirty: boolean;
  saveState: 'idle' | 'saving' | 'saved';
}

function inferMarketplaceLanguageHint(marketplace: string | null): string | null {
  const raw = (marketplace ?? '').trim().toLowerCase();
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

function LanguagePanel(props: LanguagePanelProps) {
  const configLanguageInput = typeof props.config.language === 'string' ? props.config.language : '';
  const amazonLanguageInput = typeof props.amazonLanguage === 'string' ? props.amazonLanguage : '';
  const languageInput = configLanguageInput.trim() ? configLanguageInput : amazonLanguageInput;
  const selectValue = useMemo(() => resolveLanguageSelectValue(languageInput), [languageInput]);
  const rawInput = languageInput.trim();
  const showIsoWarning = rawInput.length > 0 && !isLanguageCodeFormatValid(rawInput);
  const normalizedConfigLanguage = configLanguageInput.trim()
    ? normalizeLanguageCode(configLanguageInput)
    : '';
  const normalizedAmazonLanguage = amazonLanguageInput.trim()
    ? normalizeLanguageCode(amazonLanguageInput)
    : '';
  const normalizedActiveLanguage = normalizedConfigLanguage || normalizedAmazonLanguage;
  const marketplaceLanguageHint = inferMarketplaceLanguageHint(props.amazonMarketplace);
  const hasLanguageMismatch = Boolean(
    props.bookPath &&
      normalizedConfigLanguage &&
      normalizedAmazonLanguage &&
      normalizedConfigLanguage !== normalizedAmazonLanguage,
  );
  const shouldReviewMarketplace = Boolean(
    props.bookPath &&
      marketplaceLanguageHint &&
      normalizedActiveLanguage &&
      !normalizedActiveLanguage.startsWith(marketplaceLanguageHint),
  );

  const activeLabel = useMemo(() => {
    if (!rawInput) {
      return 'Personalizado (sin definir)';
    }

    return getLanguageDisplayName(rawInput);
  }, [rawInput]);

  const applyLanguage = (language: string) => {
    props.onChangeLanguage(language);
  };

  return (
    <section className="settings-view">
      <header>
        <h2>Idioma</h2>
        <p>
          {props.bookPath ? (
            'Define el idioma base para prompts de IA y metadatos KDP. Si falta en config, se usa el idioma del libro.'
          ) : (
            'Abri un libro para configurar idioma.'
          )}
        </p>
        <p className="muted">
          Idioma Amazon actual: <strong>{props.amazonLanguage?.trim() || '(sin definir)'}</strong>
        </p>
        {hasLanguageMismatch && (
          <p className="warning-text">
            Advertencia: idioma base y Amazon no coinciden. Guarda para sincronizar metadatos.
          </p>
        )}
        {shouldReviewMarketplace && (
          <p className="warning-text">
            Revisa marketplace y moneda en Amazon: el idioma actual puede no coincidir con el mercado principal.
          </p>
        )}
      </header>

      <label>
        Idioma principal
        <select
          aria-describedby="language-help language-iso-hint"
          value={selectValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'custom') {
              applyLanguage('');
              return;
            }

            applyLanguage(value);
          }}
        >
          {APP_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
          <option value="custom">Personalizado</option>
        </select>
      </label>

      <label>
        Codigo de idioma
        <input
          aria-describedby="language-help language-iso-hint"
          value={languageInput}
          onChange={(event) => {
            applyLanguage(event.target.value);
          }}
          placeholder="es, en, pt, fr, de, it..."
        />
      </label>

      <p className="muted">Idioma activo: {activeLabel}</p>
      <p id="language-help" className="muted">
        El selector rellena este campo automaticamente. Si eliges "Personalizado", puedes escribir el codigo manualmente.
      </p>
      <p id="language-iso-hint" className={`muted ${showIsoWarning ? 'warning-text' : ''}`}>
        {showIsoWarning
          ? "Usa codigos ISO: 'es', 'en', 'pt-BR', 'es-MX', 'en-US'."
          : 'Formato recomendado: codigo ISO (2-3 letras) con region opcional.'}
      </p>

      <button
        type="button"
        onClick={props.onSave}
        disabled={!props.bookPath || !props.isDirty || props.saveState === 'saving'}
        title="Guarda idioma en config.json y book.json."
      >
        {props.saveState === 'saving'
          ? 'Guardando...'
          : props.saveState === 'saved'
            ? 'Guardado OK'
            : 'Guardar idioma'}
      </button>
    </section>
  );
}

export default LanguagePanel;
