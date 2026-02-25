import { useMemo } from 'react';
import {
  APP_LANGUAGE_OPTIONS,
  getLanguageDisplayName,
  resolveLanguageSelectValue,
} from '../lib/language';
import type { AppConfig } from '../types/book';

interface LanguagePanelProps {
  config: AppConfig;
  bookPath: string | null;
  onChange: (next: AppConfig) => void;
  onSave: () => void;
}

function LanguagePanel(props: LanguagePanelProps) {
  const languageInput = props.config.language;

  const selectValue = useMemo(() => resolveLanguageSelectValue(languageInput), [languageInput]);

  const activeLabel = useMemo(() => {
    const raw = languageInput.trim();
    if (!raw) {
      return 'Personalizado (sin definir)';
    }

    return getLanguageDisplayName(raw);
  }, [languageInput]);

  return (
    <section className="settings-view">
      <header>
        <h2>Idioma</h2>
        <p>
          Defini el idioma de trabajo para la IA y la salida editorial. El modelo va a responder y reescribir en
          este idioma.
        </p>
        <p>
          {props.bookPath
            ? `Ruta: ${props.bookPath}/config.json`
            : 'Abri un libro para guardar el idioma en mi-libro/config.json'}
        </p>
      </header>

      <label>
        Idioma principal
        <select
          value={selectValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'custom') {
              props.onChange({ ...props.config, language: '' });
              return;
            }

            props.onChange({ ...props.config, language: value });
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
          value={languageInput}
          onChange={(event) => {
            const rawValue = event.target.value;
            props.onChange({ ...props.config, language: rawValue });
          }}
          placeholder="es, en, pt, fr, de, it..."
        />
      </label>

      <p className="muted">Idioma activo: {activeLabel}</p>

      <button
        type="button"
        onClick={props.onSave}
        disabled={!props.bookPath}
        title="Guarda el idioma en config.json del libro activo."
      >
        Guardar idioma
      </button>
    </section>
  );
}

export default LanguagePanel;

