import type { AppConfig } from '../types/book';

interface SettingsPanelProps {
  config: AppConfig;
  bookPath: string | null;
  onChange: (next: AppConfig) => void;
  onSave: () => void;
}

function SettingsPanel(props: SettingsPanelProps) {
  const { config } = props;

  return (
    <section className="settings-view">
      <header>
        <h2>Settings</h2>
        <p>Configuracion persistente local para IA y versionado.</p>
        <p>
          {props.bookPath
            ? `Ruta: ${props.bookPath}/config.json`
            : 'Abri un libro para guardar en mi-libro/config.json'}
        </p>
      </header>

      <label>
        Modelo por defecto
        <input
          value={config.model}
          onChange={(event) => props.onChange({ ...config, model: event.target.value })}
          placeholder="llama3.2:3b"
        />
      </label>

      <label>
        Temperatura
        <input
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={config.temperature}
          onChange={(event) =>
            props.onChange({
              ...config,
              temperature: Number.parseFloat(event.target.value || '0.6'),
            })
          }
        />
      </label>

      <label>
        Auto-guardado (ms)
        <input
          type="number"
          min="1000"
          value={config.autosaveIntervalMs}
          onChange={(event) =>
            props.onChange({
              ...config,
              autosaveIntervalMs: Number.parseInt(event.target.value || '5000', 10),
            })
          }
        />
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.autoVersioning}
          onChange={(event) => props.onChange({ ...config, autoVersioning: event.target.checked })}
        />
        Auto-versionado antes de aplicar IA
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.autoApplyChatChanges}
          onChange={(event) => props.onChange({ ...config, autoApplyChatChanges: event.target.checked })}
        />
        Chat aplica cambios automaticamente sin preguntar
      </label>

      <label>
        Iteraciones automaticas del chat
        <input
          type="number"
          min="1"
          max="10"
          value={config.chatApplyIterations}
          onChange={(event) =>
            props.onChange({
              ...config,
              chatApplyIterations: Math.max(1, Math.min(10, Number.parseInt(event.target.value || '1', 10))),
            })
          }
        />
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.continuousAgentEnabled}
          onChange={(event) => props.onChange({ ...config, continuousAgentEnabled: event.target.checked })}
        />
        Agente continuo por chat (capitulo)
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.accessibilityHighContrast}
          onChange={(event) => props.onChange({ ...config, accessibilityHighContrast: event.target.checked })}
        />
        Alto contraste visual
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.accessibilityLargeText}
          onChange={(event) => props.onChange({ ...config, accessibilityLargeText: event.target.checked })}
        />
        Texto grande en interfaz
      </label>

      <label>
        Rondas maximas del agente continuo
        <input
          type="number"
          min="1"
          max="12"
          value={config.continuousAgentMaxRounds}
          onChange={(event) =>
            props.onChange({
              ...config,
              continuousAgentMaxRounds: Math.max(1, Math.min(12, Number.parseInt(event.target.value || '3', 10))),
            })
          }
        />
      </label>

      <div className="preset-row">
        <button
          type="button"
          title="Ajuste rapido para generar borradores con mayor creatividad."
          onClick={() =>
            props.onChange({
              ...config,
              temperature: 0.75,
              chatApplyIterations: 1,
              continuousAgentEnabled: false,
              continuousAgentMaxRounds: 2,
            })
          }
        >
          Preset borrador
        </button>
        <button
          type="button"
          title="Ajuste balanceado para reescritura precisa y controlada."
          onClick={() =>
            props.onChange({
              ...config,
              temperature: 0.45,
              chatApplyIterations: 2,
              continuousAgentEnabled: true,
              continuousAgentMaxRounds: 3,
            })
          }
        >
          Preset precision
        </button>
        <button
          type="button"
          title="Ajuste mas estricto para revision final y consistencia."
          onClick={() =>
            props.onChange({
              ...config,
              temperature: 0.3,
              chatApplyIterations: 2,
              continuousAgentEnabled: true,
              continuousAgentMaxRounds: 4,
            })
          }
        >
          Preset revision final
        </button>
      </div>

      <label>
        System prompt fijo
        <textarea
          value={config.systemPrompt}
          rows={14}
          onChange={(event) => props.onChange({ ...config, systemPrompt: event.target.value })}
        />
      </label>

      <button
        type="button"
        onClick={props.onSave}
        disabled={!props.bookPath}
        title="Guarda config.json en la carpeta del libro activo."
      >
        Guardar settings
      </button>
    </section>
  );
}

export default SettingsPanel;
