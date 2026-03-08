import { useState } from 'react';

import { buildPlotBoardModel } from '../lib/plotBoard';
import type { SagaProject, SagaTimelineEvent, SagaTimelineEventCategory, SagaTimelineEventKind } from '../types/book';

interface PlotBoardViewProps {
  saga: SagaProject | null;
  activeSaga: SagaProject | null;
  onOpenBook: (bookPath: string) => void;
  onUpsertEvent: (event: SagaTimelineEvent) => void;
  onDeleteEvent: (eventId: string) => void;
}

function makePlotEmptyEvent(): SagaTimelineEvent {
  return {
    id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    category: 'other',
    kind: 'point',
    startOrder: 1,
    endOrder: null,
    displayLabel: '',
    summary: '',
    notes: '',
    bookRefs: [],
    entityIds: [],
    characterImpacts: [],
  };
}

interface PlotEventFormProps {
  event: SagaTimelineEvent;
  onSave: (event: SagaTimelineEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function PlotEventForm(props: PlotEventFormProps) {
  const [draft, setDraft] = useState<SagaTimelineEvent>(props.event);
  const patch = (partial: Partial<SagaTimelineEvent>) => setDraft((prev) => ({ ...prev, ...partial }));

  return (
    <div className="timeline-event-form">
      <h4>{props.onDelete ? 'Editar paso' : 'Nuevo paso'}</h4>
      <label>Titulo<input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Nombre del paso narrativo" /></label>
      <div className="bible-two-col">
        <label>
          Categoria
          <select value={draft.category} onChange={(e) => patch({ category: e.target.value as SagaTimelineEventCategory })}>
            <option value="war">Guerra</option>
            <option value="journey">Viaje</option>
            <option value="birth">Nacimiento</option>
            <option value="death">Muerte</option>
            <option value="political">Politico</option>
            <option value="discovery">Descubrimiento</option>
            <option value="timeskip">Salto temporal</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label>
          Tipo
          <select value={draft.kind} onChange={(e) => patch({ kind: e.target.value as SagaTimelineEventKind })}>
            <option value="point">Punto</option>
            <option value="span">Tramo</option>
          </select>
        </label>
      </div>
      <div className="bible-two-col">
        <label>Orden<input type="number" value={draft.startOrder} onChange={(e) => patch({ startOrder: Number(e.target.value) || 1 })} /></label>
        <label>Etiqueta<input value={draft.displayLabel} onChange={(e) => patch({ displayLabel: e.target.value })} placeholder="Ej: Acto I" /></label>
      </div>
      <label>Resumen<textarea rows={2} value={draft.summary} onChange={(e) => patch({ summary: e.target.value })} placeholder="Que ocurre en este paso del arco" /></label>
      <label>Notas<textarea rows={2} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} /></label>
      <div className="timeline-form-actions">
        <button type="button" onClick={() => props.onSave(draft)}>Guardar paso</button>
        <button type="button" onClick={props.onCancel}>Cancelar</button>
        {props.onDelete && (
          <button type="button" className="timeline-form-delete-btn" onClick={props.onDelete}>Eliminar paso</button>
        )}
      </div>
    </div>
  );
}

function PlotBoardView(props: PlotBoardViewProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SagaTimelineEventCategory | 'all'>('all');
  const [selectedLaneId, setSelectedLaneId] = useState<string | 'all'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<SagaTimelineEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  const saga = props.saga;
  const plotModel = saga
    ? buildPlotBoardModel(saga, selectedCharacterId, selectedCategory, selectedLaneId)
    : { steps: [], relationships: [], categories: [], acts: [], characterArc: [] };
  const selectedCharacterName =
    saga?.metadata.worldBible.characters.find((entry) => entry.id === selectedCharacterId)?.name || 'Personaje';
  const laneOptions = saga
    ? Array.from(
        new Map(
          [
            ...saga.metadata.worldBible.timelineLanes.map((lane) => [lane.id, lane.label || lane.id]),
            ...saga.metadata.worldBible.timeline.map((event) => [
              event.laneId?.trim() || 'lane-main',
              event.laneLabel?.trim() || event.laneId?.trim() || 'Linea principal',
            ]),
          ].map(([id, label]) => [id.trim() || 'lane-main', label.trim() || 'Linea principal']),
        ),
      ).map(([id, label]) => ({ id, label }))
    : [];

  if (!saga) {
    return (
      <section className="settings-view plot-view">
        <header>
          <h2>Plot</h2>
          <p>Abri una saga para visualizar arcos, escalada y conflictos narrativos.</p>
        </header>
      </section>
    );
  }

  const selectedEvent =
    saga.metadata.worldBible.timeline.find(
      (entry) => entry.id === (plotModel.steps.some((step) => step.eventId === selectedEventId) ? selectedEventId : plotModel.steps[0]?.eventId ?? null),
    ) ?? null;

  return (
    <section className="settings-view plot-view">
      <header>
        <h2>Plot Board</h2>
        <p>Lee el canon como arco narrativo: apertura, escalada, giros, climax y consecuencias.</p>
      </header>

      <div className="plot-toolbar">
        <label>
          Personaje
          <select value={selectedCharacterId} onChange={(event) => setSelectedCharacterId(event.target.value)}>
            <option value="">Saga completa</option>
            {saga.metadata.worldBible.characters.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name || 'Personaje sin nombre'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value as SagaTimelineEventCategory | 'all')}
          >
            <option value="all">Todas</option>
            <option value="war">Guerra</option>
            <option value="journey">Viaje</option>
            <option value="birth">Nacimiento</option>
            <option value="death">Muerte</option>
            <option value="political">Politico</option>
            <option value="discovery">Descubrimiento</option>
            <option value="timeskip">Salto temporal</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label>
          Subtrama / carril
          <select value={selectedLaneId} onChange={(event) => setSelectedLaneId(event.target.value as string | 'all')}>
            <option value="all">Todos los carriles</option>
            {laneOptions.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.label}
              </option>
            ))}
          </select>
        </label>
        {props.activeSaga && (
          <button type="button" onClick={() => { setIsCreatingEvent(true); setEditingEvent(null); }}>
            + Nuevo paso
          </button>
        )}
      </div>

      {isCreatingEvent && props.activeSaga && (
        <PlotEventForm
          event={makePlotEmptyEvent()}
          onSave={(event) => { props.onUpsertEvent(event); setIsCreatingEvent(false); setSelectedEventId(event.id); }}
          onCancel={() => setIsCreatingEvent(false)}
        />
      )}

      <div className="plot-layout">
        <section className="plot-arc">
          <div className="bible-section-head">
            <h3>Arco principal</h3>
            <span className="muted">{plotModel.steps.length} pasos</span>
          </div>
          {plotModel.steps.length === 0 ? (
            <p className="muted">No hay eventos para el filtro actual.</p>
          ) : (
            <div className="plot-act-list">
              {plotModel.acts.map((act) => (
                <section key={act.stageLabel} className="plot-act-group">
                  <div className="plot-act-head">
                    <h4>{act.stageLabel}</h4>
                    <span className="muted">{act.steps.length} paso/s</span>
                  </div>
                  <div className="plot-step-list">
                    {act.steps.map((step) => (
                      <button
                        key={step.eventId}
                        type="button"
                        className={`plot-step ${selectedEvent?.id === step.eventId ? 'is-selected' : ''}`}
                        onClick={() => setSelectedEventId(step.eventId)}
                      >
                        <div className="plot-step-head">
                          <span className="timeline-order">{step.displayLabel}</span>
                          <strong>{step.title}</strong>
                        </div>
                        <div className="timeline-badges">
                          <span className="timeline-badge">{step.stageLabel}</span>
                          <span className="timeline-badge">{step.category}</span>
                        </div>
                        <p>{step.summary}</p>
                        {step.primaryImpact ? <small>{step.primaryImpact}</small> : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="plot-side">
          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Ritmo del arco</h3>
              <span className="muted">{plotModel.categories.length} categorias</span>
            </div>
            {plotModel.categories.length === 0 ? (
              <p className="muted">No hay ritmo medible con el filtro actual.</p>
            ) : (
              <div className="plot-summary-list">
                {plotModel.categories.map((entry) => (
                  <div key={entry.category} className="plot-summary-item">
                    <strong>{entry.category}</strong>
                    <span>{entry.count} eventos</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Conflictos y relaciones</h3>
              <span className="muted">{plotModel.relationships.length}</span>
            </div>
            {plotModel.relationships.length === 0 ? (
              <p className="muted">No hay relaciones relevantes para el filtro actual.</p>
            ) : (
              <div className="plot-summary-list">
                {plotModel.relationships.map((entry) => (
                  <div key={entry.relationshipId} className="plot-summary-item is-rich">
                    <strong>{entry.label}</strong>
                    <small>{entry.notes || 'Sin notas.'}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          {selectedCharacterId ? (
            <section className="bible-section">
              <div className="bible-section-head">
                <h3>Trayectoria del personaje</h3>
                <span className="muted">{selectedCharacterName}</span>
              </div>
              {plotModel.characterArc.length === 0 ? (
                <p className="muted">No hay impactos narrativos registrados para este personaje todavia.</p>
              ) : (
                <div className="plot-character-arc">
                  {plotModel.characterArc.map((beat) => (
                    <article key={beat.eventId} className="plot-character-beat">
                      <span className="timeline-order">{beat.displayLabel}</span>
                      <div>
                        <strong>{beat.title}</strong>
                        <p>{beat.summary}</p>
                        <small>{beat.impactLabel}</small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Detalle del paso</h3>
              <div className="timeline-detail-header-actions">
                <span className="muted">{selectedEvent ? selectedEvent.category : 'Sin seleccion'}</span>
                {selectedEvent && props.activeSaga && editingEvent?.id !== selectedEvent.id && (
                  <button type="button" onClick={() => { setEditingEvent(selectedEvent); setIsCreatingEvent(false); }}>
                    Editar
                  </button>
                )}
              </div>
            </div>
            {editingEvent && selectedEvent && editingEvent.id === selectedEvent.id && props.activeSaga ? (
              <PlotEventForm
                event={editingEvent}
                onSave={(event) => { props.onUpsertEvent(event); setEditingEvent(null); }}
                onCancel={() => setEditingEvent(null)}
                onDelete={() => { props.onDeleteEvent(editingEvent.id); setEditingEvent(null); setSelectedEventId(null); }}
              />
            ) : !selectedEvent ? (
              <p className="muted">Selecciona un paso para ver su impacto narrativo.</p>
            ) : (
              <>
                <strong>{selectedEvent.title || 'Evento sin titulo'}</strong>
                <p>{selectedEvent.summary || 'Sin resumen.'}</p>
                <div className="timeline-badges">
                  <span className="timeline-badge">{selectedEvent.displayLabel || `T${selectedEvent.startOrder}`}</span>
                  <span className="timeline-badge">
                    {selectedEvent.kind === 'span'
                      ? `${selectedEvent.startOrder}-${selectedEvent.endOrder ?? selectedEvent.startOrder}`
                      : String(selectedEvent.startOrder)}
                  </span>
                </div>
                {selectedEvent.bookRefs.length === 0 ? (
                  <p className="muted">Sin referencias narrativas.</p>
                ) : (
                  <div className="plot-summary-list">
                    {selectedEvent.bookRefs.map((reference, index) => {
                      const linkedBook = saga.metadata.books.find((entry) => entry.bookPath === reference.bookPath);
                      return (
                        <div key={`${selectedEvent.id}-plot-book-${index}`} className="timeline-detail-row">
                          <span>
                            {linkedBook?.title || reference.bookPath || 'Libro no vinculado'}
                            {reference.chapterId ? ` | ${reference.chapterId}` : ''}
                            {reference.mode ? ` | ${reference.mode}` : ''}
                          </span>
                          {reference.bookPath ? (
                            <button type="button" onClick={() => props.onOpenBook(reference.bookPath)}>
                              Abrir
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

export default PlotBoardView;
