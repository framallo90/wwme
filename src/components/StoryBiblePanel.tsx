import { useState } from 'react';

import type { StoryBible, StoryCharacter, StoryLocation } from '../types/book';

interface StoryBiblePanelProps {
  storyBible: StoryBible;
  hasActiveChapter: boolean;
  onChange: (next: StoryBible) => void;
  onSyncFromActiveChapter: () => void;
  onSave: () => void;
}

function createLocalId(prefix: 'char' | 'loc'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyCharacter(): StoryCharacter {
  return {
    id: createLocalId('char'),
    name: '',
    aliases: '',
    role: '',
    traits: '',
    goal: '',
    notes: '',
  };
}

function createEmptyLocation(): StoryLocation {
  return {
    id: createLocalId('loc'),
    name: '',
    aliases: '',
    description: '',
    atmosphere: '',
    notes: '',
  };
}

function StoryBiblePanel(props: StoryBiblePanelProps) {
  const [showAdvice, setShowAdvice] = useState(false);

  const updateCharacter = (id: string, patch: Partial<StoryCharacter>) => {
    props.onChange({
      ...props.storyBible,
      characters: props.storyBible.characters.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const removeCharacter = (id: string) => {
    props.onChange({
      ...props.storyBible,
      characters: props.storyBible.characters.filter((entry) => entry.id !== id),
    });
  };

  const updateLocation = (id: string, patch: Partial<StoryLocation>) => {
    props.onChange({
      ...props.storyBible,
      locations: props.storyBible.locations.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const removeLocation = (id: string) => {
    props.onChange({
      ...props.storyBible,
      locations: props.storyBible.locations.filter((entry) => entry.id !== id),
    });
  };

  return (
    <section className="settings-view story-bible-view">
      <header>
        <div className="story-bible-header-top">
          <h2>Biblia de la historia</h2>
          <div className="story-bible-header-actions">
            <button type="button" onClick={() => setShowAdvice((previous) => !previous)}>
              {showAdvice ? 'Ocultar consejo' : 'Consejo de coherencia'}
            </button>
            <button
              type="button"
              onClick={props.onSyncFromActiveChapter}
              disabled={!props.hasActiveChapter}
              title="Detecta personajes y lugares nuevos del capitulo activo y los agrega a la biblia."
            >
              Sincronizar capitulo activo
            </button>
          </div>
        </div>
        <p>Define personajes, lugares y reglas de continuidad para dar contexto estable a la IA.</p>
      </header>
      {showAdvice ? (
        <section className="story-bible-advice">
          <h3>Como usarla para mantener coherencia</h3>
          <ol>
            <li>Completa nombre, rol y objetivo de protagonistas antes de arrancar.</li>
            <li>Cada vez que cierres una escena importante, guarda un hito desde IA.</li>
            <li>Tras cada hito, WriteWMe sincroniza automaticamente la biblia con entidades nuevas detectadas.</li>
            <li>Revisa esas altas automaticas y completa rasgos, notas y reglas para evitar contradicciones.</li>
            <li>Si queres forzar la sincronizacion, usa "Sincronizar capitulo activo".</li>
          </ol>
          <p className="muted">
            Flujo recomendado: escribir, guardar hito, revisar biblia y continuar con el siguiente capitulo.
          </p>
        </section>
      ) : null}

      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Personajes</h3>
          <button
            type="button"
            onClick={() =>
              props.onChange({
                ...props.storyBible,
                characters: [...props.storyBible.characters, createEmptyCharacter()],
              })
            }
          >
            Agregar personaje
          </button>
        </div>
        {props.storyBible.characters.length === 0 ? (
          <p className="muted">Todavia no hay personajes cargados.</p>
        ) : (
          <div className="bible-card-list">
            {props.storyBible.characters.map((entry) => (
              <article key={entry.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{entry.name || 'Personaje sin nombre'}</strong>
                  <button type="button" onClick={() => removeCharacter(entry.id)}>Quitar</button>
                </div>
                <div className="bible-two-col">
                  <label>
                    Nombre
                    <input value={entry.name} onChange={(event) => updateCharacter(entry.id, { name: event.target.value })} />
                  </label>
                  <label>
                    Alias
                    <input
                      value={entry.aliases}
                      onChange={(event) => updateCharacter(entry.id, { aliases: event.target.value })}
                      placeholder="Separados por coma"
                    />
                  </label>
                </div>
                <div className="bible-two-col">
                  <label>
                    Rol
                    <input value={entry.role} onChange={(event) => updateCharacter(entry.id, { role: event.target.value })} />
                  </label>
                </div>
                <label>
                  Rasgos
                  <textarea
                    rows={2}
                    value={entry.traits}
                    onChange={(event) => updateCharacter(entry.id, { traits: event.target.value })}
                    placeholder="Personalidad, forma de hablar, tics, contradicciones..."
                  />
                </label>
                <label>
                  Objetivo
                  <textarea
                    rows={2}
                    value={entry.goal}
                    onChange={(event) => updateCharacter(entry.id, { goal: event.target.value })}
                    placeholder="Que quiere y por que"
                  />
                </label>
                <label>
                  Notas
                  <textarea
                    rows={2}
                    value={entry.notes}
                    onChange={(event) => updateCharacter(entry.id, { notes: event.target.value })}
                    placeholder="Detalles de continuidad, relaciones, secretos..."
                  />
                </label>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Lugares</h3>
          <button
            type="button"
            onClick={() =>
              props.onChange({
                ...props.storyBible,
                locations: [...props.storyBible.locations, createEmptyLocation()],
              })
            }
          >
            Agregar lugar
          </button>
        </div>
        {props.storyBible.locations.length === 0 ? (
          <p className="muted">Todavia no hay lugares cargados.</p>
        ) : (
          <div className="bible-card-list">
            {props.storyBible.locations.map((entry) => (
              <article key={entry.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{entry.name || 'Lugar sin nombre'}</strong>
                  <button type="button" onClick={() => removeLocation(entry.id)}>Quitar</button>
                </div>
                <label>
                  Nombre
                  <input value={entry.name} onChange={(event) => updateLocation(entry.id, { name: event.target.value })} />
                </label>
                <label>
                  Alias
                  <input
                    value={entry.aliases}
                    onChange={(event) => updateLocation(entry.id, { aliases: event.target.value })}
                    placeholder="Separados por coma"
                  />
                </label>
                <label>
                  Descripcion
                  <textarea
                    rows={2}
                    value={entry.description}
                    onChange={(event) => updateLocation(entry.id, { description: event.target.value })}
                    placeholder="Como es fisicamente"
                  />
                </label>
                <label>
                  Atmosfera
                  <textarea
                    rows={2}
                    value={entry.atmosphere}
                    onChange={(event) => updateLocation(entry.id, { atmosphere: event.target.value })}
                    placeholder="Tono emocional del lugar"
                  />
                </label>
                <label>
                  Notas
                  <textarea
                    rows={2}
                    value={entry.notes}
                    onChange={(event) => updateLocation(entry.id, { notes: event.target.value })}
                    placeholder="Reglas del lugar, conexiones, pistas, riesgos..."
                  />
                </label>
              </article>
            ))}
          </div>
        )}
      </section>

      <label>
        Reglas de continuidad global
        <textarea
          rows={4}
          value={props.storyBible.continuityRules}
          onChange={(event) =>
            props.onChange({
              ...props.storyBible,
              continuityRules: event.target.value,
            })
          }
          placeholder="Hechos que no se deben contradecir en ningun capitulo."
        />
      </label>

      <button type="button" onClick={props.onSave}>Guardar biblia de la historia</button>
    </section>
  );
}

export default StoryBiblePanel;
