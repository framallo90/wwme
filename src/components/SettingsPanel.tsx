import type { AppConfig } from '../types/book';

interface SettingsPanelProps {
  config: AppConfig;
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

      <label>
        System prompt fijo
        <textarea
          value={config.systemPrompt}
          rows={14}
          onChange={(event) => props.onChange({ ...config, systemPrompt: event.target.value })}
        />
      </label>

      <button onClick={props.onSave}>Guardar settings</button>
    </section>
  );
}

export default SettingsPanel;
