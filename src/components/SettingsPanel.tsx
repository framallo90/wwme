import { useEffect, useState, type InputHTMLAttributes } from 'react';
import type { AppConfig } from '../types/book';

interface SettingsPanelProps {
  config: AppConfig;
  bookPath: string | null;
  onChange: (next: AppConfig) => void;
  onSave: () => void;
  onPickBackupDirectory: () => void;
  onRunBackupNow: () => void;
}

// Componente helper para inputs numericos que permite borrar el valor temporalmente
function NumericInput({
  value,
  onChange,
  ...props
}: { value: number; onChange: (val: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [localValue, setLocalValue] = useState(value.toString());

  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  return (
    <input
      {...props}
      type="number"
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value);
        const parsed = parseFloat(e.target.value);
        if (!isNaN(parsed)) onChange(parsed);
      }}
      onBlur={() => setLocalValue(value.toString())}
    />
  );
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
        Idioma de trabajo
        <input
          value={config.language}
          onChange={(event) => props.onChange({ ...config, language: event.target.value.trim().toLowerCase() })}
          placeholder="es"
        />
      </label>

      <label>
        Temperatura
        <NumericInput
          step="0.1"
          min="0"
          max="2"
          value={config.temperature}
          onChange={(val) => props.onChange({ ...config, temperature: val })}
        />
      </label>

      <label>
        Voz preferida (opcional)
        <input
          value={config.audioVoiceName}
          onChange={(event) => props.onChange({ ...config, audioVoiceName: event.target.value })}
          placeholder="Ej: Microsoft Sabina Desktop"
        />
      </label>

      <label>
        Velocidad de lectura
        <NumericInput
          step="0.1"
          min="0.5"
          max="2"
          value={config.audioRate}
          onChange={(val) =>
            props.onChange({
              ...config,
              audioRate: Math.max(0.5, Math.min(2, val)),
            })
          }
        />
      </label>

      <label>
        Volumen de lectura
        <NumericInput
          step="0.1"
          min="0"
          max="1"
          value={config.audioVolume}
          onChange={(val) =>
            props.onChange({
              ...config,
              audioVolume: Math.max(0, Math.min(1, val)),
            })
          }
        />
      </label>

      <label>
        Auto-guardado (ms)
        <NumericInput
          min="1000"
          value={config.autosaveIntervalMs}
          onChange={(val) => props.onChange({ ...config, autosaveIntervalMs: val })}
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
          checked={config.continuityGuardEnabled}
          onChange={(event) => props.onChange({ ...config, continuityGuardEnabled: event.target.checked })}
        />
        Bloqueo de continuidad IA (revisa contradicciones antes de guardar)
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

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.backupEnabled}
          onChange={(event) => props.onChange({ ...config, backupEnabled: event.target.checked })}
        />
        Backup automatico opcional (carpeta cloud/local)
      </label>

      <label>
        Carpeta de backup
        <div className="field-inline">
          <input
            value={config.backupDirectory}
            onChange={(event) => props.onChange({ ...config, backupDirectory: event.target.value })}
            placeholder="Ej: C:/Users/TuUsuario/Google Drive/WriteWMe"
          />
          <button type="button" onClick={props.onPickBackupDirectory}>
            Elegir...
          </button>
        </div>
      </label>

      <label>
        Intervalo backup (ms)
        <NumericInput
          min="20000"
          value={config.backupIntervalMs}
          onChange={(val) =>
            props.onChange({
              ...config,
              backupIntervalMs: Math.max(20000, Math.round(val)),
            })
          }
        />
      </label>

      <button
        type="button"
        onClick={props.onRunBackupNow}
        disabled={!props.bookPath || !config.backupDirectory.trim()}
      >
        Backup ahora
      </button>

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
              continuityGuardEnabled: false,
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
              continuityGuardEnabled: true,
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
              continuityGuardEnabled: true,
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
