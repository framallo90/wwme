import { APP_LANGUAGE_OPTIONS, getLanguageDisplayName, getLanguageOption, normalizeLanguageCode } from '../lib/language';
import type { AppConfig } from '../types/book';

interface LanguagePanelProps {
  config: AppConfig;
  bookPath: string | null;
  onChange: (next: AppConfig) => void;
  onSave: () => void;
}

function LanguagePanel(props: LanguagePanelProps) {
  const normalizedLanguage = normalizeLanguageCode(props.config.language);
  const isKnown = Boolean(getLanguageOption(normalizedLanguage));

  return (
    <section className="settings-view">
      <header>
        <h2>Idioma</h2>
        <p>
          Defini el idioma de trabajo para la IA y la salida editorial. El modelo va a responder y reescribir en este
          idioma.
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
          value={isKnown ? normalizedLanguage : 'custom'}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'custom') {
              props.onChange({ ...props.config, language: normalizedLanguage });
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
          value={props.config.language}
          onChange={(event) => props.onChange({ ...props.config, language: normalizeLanguageCode(event.target.value) })}
          placeholder="es, en, pt, fr, de, it..."
        />
      </label>

      <p className="muted">Idioma activo: {getLanguageDisplayName(props.config.language)}</p>

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
