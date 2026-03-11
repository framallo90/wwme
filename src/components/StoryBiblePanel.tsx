import { useCallback, useEffect, useState } from 'react';

import { normalizeCanonStatus } from '../lib/canon';
import type { BookSecret, StoryBible, StoryCharacter, StoryLocation } from '../types/book';

interface StoryBiblePanelProps {
  storyBible: StoryBible;
  hasActiveChapter: boolean;
  onChange: (next: StoryBible) => void;
  onSyncFromActiveChapter: (baseStoryBible?: StoryBible) => void;
  onSave: (nextStoryBible?: StoryBible) => void;
}

function createLocalId(prefix: 'char' | 'loc' | 'secret'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptySecret(): BookSecret {
  return {
    id: createLocalId('secret'),
    title: '',
    objectiveTruth: '',
    perceivedTruth: '',
    notes: '',
    relatedCharacterIds: [],
    canonStatus: 'canonical',
  };
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
    canonStatus: 'canonical',
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
    canonStatus: 'canonical',
  };
}

function StoryBiblePanel(props: StoryBiblePanelProps) {
  const [showAdvice, setShowAdvice] = useState(false);
  const [showApocryphal, setShowApocryphal] = useState(false);
  const [draftStoryBible, setDraftStoryBible] = useState<StoryBible>(props.storyBible);
  const [isDraftDirty, setIsDraftDirty] = useState(false);

  useEffect(() => {
    // Sincroniza draft local cuando cambia la fuente externa (abrir libro/sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftStoryBible(props.storyBible);
    setIsDraftDirty(false);
  }, [props.storyBible]);

  const applyDraft = useCallback((updater: (current: StoryBible) => StoryBible) => {
    setDraftStoryBible((previous) => updater(previous));
    setIsDraftDirty(true);
  }, []);

  const commitDraft = useCallback(() => {
    if (!isDraftDirty) {
      return;
    }
    props.onChange(draftStoryBible);
    setIsDraftDirty(false);
  }, [draftStoryBible, isDraftDirty, props]);

  const handleFormBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      if (!isDraftDirty) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable) {
        commitDraft();
      }
    },
    [commitDraft, isDraftDirty],
  );

  const updateCharacter = (id: string, patch: Partial<StoryCharacter>) => {
    applyDraft((current) => ({
      ...current,
      characters: current.characters.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  };

  const confirmRemoval = (label: string): boolean =>
    globalThis.confirm(`Quitar ${label}? Esta accion se guardara cuando guardes la biblia.`);

  const removeCharacter = (id: string) => {
    const character = draftStoryBible.characters.find((entry) => entry.id === id);
    const label = character?.name?.trim() || 'este personaje';
    if (!confirmRemoval(label)) {
      return;
    }
    applyDraft((current) => ({
      ...current,
      characters: current.characters.filter((entry) => entry.id !== id),
    }));
  };

  const updateLocation = (id: string, patch: Partial<StoryLocation>) => {
    applyDraft((current) => ({
      ...current,
      locations: current.locations.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  };

  const removeLocation = (id: string) => {
    const location = draftStoryBible.locations.find((entry) => entry.id === id);
    const label = location?.name?.trim() || 'esta ubicacion';
    if (!confirmRemoval(label)) {
      return;
    }
    applyDraft((current) => ({
      ...current,
      locations: current.locations.filter((entry) => entry.id !== id),
    }));
  };

  const updateSecret = (id: string, patch: Partial<BookSecret>) => {
    applyDraft((current) => {
      const secrets = current.secrets ?? [];
      return {
        ...current,
        secrets: secrets.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
      };
    });
  };

  const removeSecret = (id: string) => {
    const secret = (draftStoryBible.secrets ?? []).find((entry) => entry.id === id);
    const label = secret?.title?.trim() || 'este secreto';
    if (!confirmRemoval(label)) {
      return;
    }
    applyDraft((current) => ({
      ...current,
      secrets: (current.secrets ?? []).filter((entry) => entry.id !== id),
    }));
  };

  const visibleCharacters = showApocryphal
    ? draftStoryBible.characters
    : draftStoryBible.characters.filter((entry) => normalizeCanonStatus(entry.canonStatus) === 'canonical');
  const visibleLocations = showApocryphal
    ? draftStoryBible.locations
    : draftStoryBible.locations.filter((entry) => normalizeCanonStatus(entry.canonStatus) === 'canonical');
  const apocryphalCharactersCount = draftStoryBible.characters.filter(
    (entry) => normalizeCanonStatus(entry.canonStatus) === 'apocryphal',
  ).length;
  const apocryphalLocationsCount = draftStoryBible.locations.filter(
    (entry) => normalizeCanonStatus(entry.canonStatus) === 'apocryphal',
  ).length;

  return (
    <section className="settings-view story-bible-view" onBlurCapture={handleFormBlurCapture}>
      <header>
        <div className="story-bible-header-top">
          <h2>Biblia de la historia</h2>
          <div className="story-bible-header-actions">
            <button type="button" onClick={() => setShowApocryphal((previous) => !previous)}>
              {showApocryphal ? 'Modo canonico' : 'Ver apocrifos'}
            </button>
            <button type="button" onClick={() => setShowAdvice((previous) => !previous)}>
              {showAdvice ? 'Ocultar consejo' : 'Consejo de coherencia'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isDraftDirty) {
                  props.onChange(draftStoryBible);
                  setIsDraftDirty(false);
                }
                props.onSyncFromActiveChapter(draftStoryBible);
              }}
              disabled={!props.hasActiveChapter}
              title="Detecta personajes y lugares nuevos del capitulo activo y los agrega a la biblia."
            >
              Sincronizar capitulo activo
            </button>
            <button
              type="button"
              onClick={() => {
                if (isDraftDirty) {
                  props.onChange(draftStoryBible);
                  setIsDraftDirty(false);
                }
                props.onSave(draftStoryBible);
              }}
              title="Guarda todos los cambios de la biblia."
            >
              Guardar biblia
            </button>
          </div>
        </div>
        <p>Define personajes, lugares y reglas de continuidad para dar contexto estable a la IA.</p>
        <p className="muted">
          Modo actual: {showApocryphal ? 'Canonico + apocrifo' : 'Solo canonico'} | Apocrifos: {apocryphalCharactersCount}
          {' '}personaje/s y {apocryphalLocationsCount} lugar/es.
        </p>
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
              applyDraft((current) => ({
                ...current,
                characters: [...current.characters, createEmptyCharacter()],
              }))
            }
          >
            Agregar personaje
          </button>
        </div>
        {visibleCharacters.length === 0 ? (
          <p className="muted">Todavia no hay personajes cargados.</p>
        ) : (
          <div className="bible-card-list">
            {visibleCharacters.map((entry) => (
              <article key={entry.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{entry.name || 'Personaje sin nombre'}</strong>
                  <div className="top-toolbar-actions">
                    {normalizeCanonStatus(entry.canonStatus) === 'apocryphal' ? (
                      <button type="button" onClick={() => updateCharacter(entry.id, { canonStatus: 'canonical' })}>
                        Canonizar
                      </button>
                    ) : null}
                    <button type="button" onClick={() => removeCharacter(entry.id)}>Quitar</button>
                  </div>
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
                  <label>
                    Estado narrativo
                    <select
                      value={normalizeCanonStatus(entry.canonStatus)}
                      onChange={(event) =>
                        updateCharacter(entry.id, {
                          canonStatus: event.target.value as StoryCharacter['canonStatus'],
                        })
                      }
                    >
                      <option value="canonical">Canonico</option>
                      <option value="apocryphal">Apocrifo</option>
                    </select>
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
                <div className="bible-two-col">
                  <label>
                    Edad / rango etario
                    <input
                      value={entry.age ?? ''}
                      onChange={(event) => updateCharacter(entry.id, { age: event.target.value })}
                      placeholder="Ej: 34 años / adulto joven"
                    />
                  </label>
                  <label>
                    Descripcion fisica
                    <input
                      value={entry.physicalDescription ?? ''}
                      onChange={(event) => updateCharacter(entry.id, { physicalDescription: event.target.value })}
                      placeholder="Altura, color de ojos, marcas..."
                    />
                  </label>
                </div>
                <label>
                  Trasfondo / historia previa
                  <textarea
                    rows={2}
                    value={entry.backstory ?? ''}
                    onChange={(event) => updateCharacter(entry.id, { backstory: event.target.value })}
                    placeholder="Eventos clave antes del inicio de la historia..."
                  />
                </label>
                <label>
                  Arco emocional
                  <textarea
                    rows={2}
                    value={entry.emotionalArc ?? ''}
                    onChange={(event) => updateCharacter(entry.id, { emotionalArc: event.target.value })}
                    placeholder="Como cambia internamente a lo largo del libro: miedo → valentía, desconfianza → amor..."
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
              applyDraft((current) => ({
                ...current,
                locations: [...current.locations, createEmptyLocation()],
              }))
            }
          >
            Agregar lugar
          </button>
        </div>
        {visibleLocations.length === 0 ? (
          <p className="muted">Todavia no hay lugares cargados.</p>
        ) : (
          <div className="bible-card-list">
            {visibleLocations.map((entry) => (
              <article key={entry.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{entry.name || 'Lugar sin nombre'}</strong>
                  <div className="top-toolbar-actions">
                    {normalizeCanonStatus(entry.canonStatus) === 'apocryphal' ? (
                      <button type="button" onClick={() => updateLocation(entry.id, { canonStatus: 'canonical' })}>
                        Canonizar
                      </button>
                    ) : null}
                    <button type="button" onClick={() => removeLocation(entry.id)}>Quitar</button>
                  </div>
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
                <label>
                  Estado narrativo
                  <select
                    value={normalizeCanonStatus(entry.canonStatus)}
                    onChange={(event) =>
                      updateLocation(entry.id, {
                        canonStatus: event.target.value as StoryLocation['canonStatus'],
                      })
                    }
                  >
                    <option value="canonical">Canonico</option>
                    <option value="apocryphal">Apocrifo</option>
                  </select>
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
          value={draftStoryBible.continuityRules}
          onChange={(event) =>
            applyDraft((current) => ({
              ...current,
              continuityRules: event.target.value,
            }))
          }
          placeholder="Hechos que no se deben contradecir en ningun capitulo."
        />
      </label>

      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Secretos y misterios</h3>
          <button
            type="button"
            onClick={() =>
              applyDraft((current) => ({
                ...current,
                secrets: [...(current.secrets ?? []), createEmptySecret()],
              }))
            }
          >
            Agregar secreto
          </button>
        </div>
        <p className="muted">Verdades ocultas que el lector o los personajes no saben todavia. Separadas de los hilos abiertos: esto es lo que ES, no lo que falta resolver.</p>
        {(draftStoryBible.secrets ?? []).length === 0 ? (
          <p className="muted">Sin secretos definidos.</p>
        ) : (
          <div className="bible-card-list">
            {(draftStoryBible.secrets ?? []).map((secret) => (
              <article key={secret.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{secret.title || 'Secreto sin titulo'}</strong>
                  <button type="button" onClick={() => removeSecret(secret.id)}>Quitar</button>
                </div>
                <label>
                  Titulo / nombre del secreto
                  <input
                    value={secret.title}
                    onChange={(e) => updateSecret(secret.id, { title: e.target.value })}
                    placeholder="Ej: La identidad real del Portador"
                  />
                </label>
                <label>
                  Verdad objetiva (lo que realmente es)
                  <textarea
                    rows={2}
                    value={secret.objectiveTruth}
                    onChange={(e) => updateSecret(secret.id, { objectiveTruth: e.target.value })}
                    placeholder="Lo que en realidad ocurrio o existe, independiente de lo que los personajes creen."
                  />
                </label>
                <label>
                  Verdad percibida (lo que los personajes creen)
                  <textarea
                    rows={2}
                    value={secret.perceivedTruth}
                    onChange={(e) => updateSecret(secret.id, { perceivedTruth: e.target.value })}
                    placeholder="La version falsa o incompleta que tienen los personajes o el lector."
                  />
                </label>
                <label>
                  Notas y consecuencias narrativas
                  <textarea
                    rows={2}
                    value={secret.notes}
                    onChange={(e) => updateSecret(secret.id, { notes: e.target.value })}
                    placeholder="Cuando se revela, quien lo sabe, que cambia cuando se descubre..."
                  />
                </label>
              </article>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => {
          if (isDraftDirty) {
            props.onChange(draftStoryBible);
            setIsDraftDirty(false);
          }
          props.onSave(draftStoryBible);
        }}
      >
        Guardar biblia de la historia
      </button>
    </section>
  );
}

export default StoryBiblePanel;
