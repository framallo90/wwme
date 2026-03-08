import { type DragEvent, useMemo, useState } from 'react';

import { buildSagaConsistencyReport, type SagaConsistencyReport } from '../lib/sagaConsistency';
import { buildTimelineOverviewModel } from '../lib/timelineOverview';
import type { SagaCharacter, SagaCharacterVersion, SagaProject, SagaTimelineEvent, SagaTimelineEventCategory, SagaTimelineEventKind } from '../types/book';

interface TimelineViewProps {
  saga: SagaProject | null;
  activeSaga: SagaProject | null;
  onOpenBook: (bookPath: string) => void;
  onUpsertEvent: (event: SagaTimelineEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onReorderTimeline?: (reorderedTimeline: SagaTimelineEvent[]) => void;
}

function makeEmptyEvent(): SagaTimelineEvent {
  return {
    id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    category: 'other',
    kind: 'point',
    startOrder: 1,
    endOrder: null,
    dependencyIds: [],
    laneId: 'lane-main',
    laneLabel: 'Linea principal',
    eraLabel: 'Presente',
    displayLabel: '',
    summary: '',
    notes: '',
    bookRefs: [],
    entityIds: [],
    characterImpacts: [],
  };
}

interface EventFormProps {
  event: SagaTimelineEvent;
  availableEvents: SagaTimelineEvent[];
  onSave: (event: SagaTimelineEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function EventForm(props: EventFormProps) {
  const [draft, setDraft] = useState<SagaTimelineEvent>(props.event);
  const patch = (partial: Partial<SagaTimelineEvent>) => setDraft((prev) => ({ ...prev, ...partial }));

  return (
    <div className="timeline-event-form">
      <h4>{props.onDelete ? 'Editar evento' : 'Nuevo evento'}</h4>
      <label>Titulo<input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Nombre del evento" /></label>
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
        <label>Orden inicio<input type="number" value={draft.startOrder} onChange={(e) => patch({ startOrder: Number(e.target.value) || 1 })} /></label>
        {draft.kind === 'span' && (
          <label>Orden fin<input type="number" value={draft.endOrder ?? ''} onChange={(e) => patch({ endOrder: Number(e.target.value) || null })} placeholder="Opcional" /></label>
        )}
        <label>Etiqueta<input value={draft.displayLabel} onChange={(e) => patch({ displayLabel: e.target.value })} placeholder="Ej: Año 340" /></label>
      </div>
      <div className="bible-two-col">
        <label>
          Carril
          <input
            value={draft.laneLabel ?? ''}
            onChange={(e) =>
              patch({
                laneLabel: e.target.value,
                laneId: e.target.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              })
            }
            placeholder="Linea principal"
          />
        </label>
        <label>
          Era
          <input
            value={draft.eraLabel ?? ''}
            onChange={(e) => patch({ eraLabel: e.target.value })}
            placeholder="Presente, pasado, profecia..."
          />
        </label>
      </div>
      <label>
        Dependencias
        <select
          multiple
          size={Math.min(5, Math.max(3, props.availableEvents.length || 3))}
          value={draft.dependencyIds ?? []}
          onChange={(event) =>
            patch({
              dependencyIds: Array.from(event.target.selectedOptions).map((option) => option.value),
            })
          }
        >
          {props.availableEvents
            .filter((entry) => entry.id !== draft.id)
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {(entry.displayLabel || `T${entry.startOrder}`)} | {entry.title || entry.id}
              </option>
            ))}
        </select>
      </label>
      <label>Resumen<textarea rows={2} value={draft.summary} onChange={(e) => patch({ summary: e.target.value })} placeholder="Que pasa en este evento" /></label>
      <label>Notas<textarea rows={2} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Detalles, contexto, consecuencias" /></label>
      {draft.category === 'timeskip' && (
        <label>
          Anos de salto temporal
          <input
            type="number"
            min={0}
            value={draft.timeJumpYears ?? ''}
            onChange={(e) => patch({ timeJumpYears: e.target.value ? Number(e.target.value) : null })}
            placeholder="Ej: 10 (anos que pasan en este salto)"
          />
        </label>
      )}
      {draft.objectiveTruth !== undefined || draft.perceivedTruth !== undefined ? (
        <>
          <label>Verdad objetiva<input value={draft.objectiveTruth ?? ''} onChange={(e) => patch({ objectiveTruth: e.target.value })} /></label>
          <label>Verdad percibida<input value={draft.perceivedTruth ?? ''} onChange={(e) => patch({ perceivedTruth: e.target.value })} /></label>
        </>
      ) : (
        <button type="button" onClick={() => patch({ objectiveTruth: '', perceivedTruth: '' })} className="timeline-form-optional-btn">
          + Agregar verdad objetiva / percibida
        </button>
      )}
      {draft.kind === 'span' && draft.endOrder !== null && draft.endOrder < draft.startOrder && (
        <p className="timeline-form-validation-error" style={{ color: '#c33', fontWeight: 600 }}>El orden de fin debe ser mayor o igual al orden de inicio.</p>
      )}
      <div className="timeline-form-actions">
        <button type="button" onClick={() => props.onSave(draft)} disabled={draft.kind === 'span' && draft.endOrder !== null && draft.endOrder < draft.startOrder}>Guardar evento</button>
        <button type="button" onClick={props.onCancel}>Cancelar</button>
        {props.onDelete && (
          <button type="button" className="timeline-form-delete-btn" onClick={props.onDelete}>Eliminar evento</button>
        )}
      </div>
    </div>
  );
}

function eventTouchesCharacter(event: SagaTimelineEvent, characterId: string): boolean {
  return (
    event.characterImpacts.some((impact) => impact.characterId === characterId) ||
    event.entityIds.some((entry) => entry === characterId) ||
    (event.characterLocations ?? []).some((entry) => entry.characterId === characterId) ||
    (event.artifactTransfers ?? []).some(
      (entry) => entry.fromCharacterId === characterId || entry.toCharacterId === characterId,
    ) ||
    (event.secretReveals ?? []).some((entry) => entry.perceiverCharacterId === characterId)
  );
}

function getActiveAliases(character: SagaCharacter, order: number): string[] {
  const aliases = character.aliasTimeline
    .filter((entry) => {
      const startsBefore = entry.startOrder === null || entry.startOrder <= order;
      const endsAfter = entry.endOrder === null || entry.endOrder >= order;
      return startsBefore && endsAfter;
    })
    .map((entry) => entry.value.trim())
    .filter(Boolean);

  if (aliases.length > 0) {
    return Array.from(new Set(aliases));
  }

  return character.aliases
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getActiveCharacterVersion(character: SagaCharacter, order: number): SagaCharacterVersion | null {
  const versions = character.versions ?? [];
  if (versions.length === 0) {
    return null;
  }

  const active = versions.find((entry) => {
    const startsBefore = entry.startOrder === null || entry.startOrder <= order;
    const endsAfter = entry.endOrder === null || entry.endOrder >= order;
    return startsBefore && endsAfter;
  });

  return active ?? null;
}

const FAMILY_RELATIONSHIP_TERMS = new Set([
  'parent', 'hijo', 'hija', 'madre', 'padre', 'hermano', 'hermana',
  'sibling', 'spouse', 'esposo', 'esposa', 'familia', 'familiar',
  'abuelo', 'abuela', 'nieto', 'nieta', 'tio', 'tia', 'primo', 'prima',
  'suegro', 'suegra', 'cunado', 'cunada', 'yerno', 'nuera',
  'ancestor', 'descendant', 'child', 'son', 'daughter', 'father', 'mother',
  'brother', 'sister', 'uncle', 'aunt', 'cousin', 'grandparent', 'grandchild',
  'husband', 'wife', 'married',
]);

function isFamilyRelationshipType(value: string): boolean {
  const words = value.toLowerCase().split(/[\s\-_.,;:]+/);
  return words.some((word) => FAMILY_RELATIONSHIP_TERMS.has(word));
}

function isParentRelationship(value: string): boolean {
  return /parent|padre|madre|father|mother|ancestor|abuelo|abuela|grandparent/i.test(value);
}

function isChildRelationship(value: string): boolean {
  return /child|son|daughter|hijo|hija|descendant|nieto|nieta|grandchild/i.test(value);
}

function isSpouseRelationship(value: string): boolean {
  return /spouse|husband|wife|esposo|esposa|consorte|married/i.test(value);
}

function isSiblingRelationship(value: string): boolean {
  return /sibling|brother|sister|herman[oa]/i.test(value);
}

interface FamilyLevelEntry {
  id: string;
  label: string;
  relationLabel: string;
  notes: string;
}

function buildFamilyLevels(
  startId: string,
  relationMap: Map<string, FamilyLevelEntry[]>,
  maxDepth = 4,
): FamilyLevelEntry[][] {
  const levels: FamilyLevelEntry[][] = [];
  let frontier = [startId];
  const visited = new Set<string>([startId]);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const nextLevel: FamilyLevelEntry[] = [];
    const nextFrontier: string[] = [];

    for (const personId of frontier) {
      for (const relation of relationMap.get(personId) ?? []) {
        if (visited.has(relation.id)) {
          continue;
        }
        visited.add(relation.id);
        nextLevel.push(relation);
        nextFrontier.push(relation.id);
      }
    }

    if (nextLevel.length === 0) {
      break;
    }

    levels.push(nextLevel);
    frontier = nextFrontier;
  }

  return levels;
}

function normalizeTimelineSequence(timeline: SagaTimelineEvent[]): SagaTimelineEvent[] {
  return timeline
    .sort((left, right) => left.startOrder - right.startOrder || left.title.localeCompare(right.title))
    .map((entry, index) => {
      const nextStartOrder = index + 1;
      return {
        ...entry,
        startOrder: nextStartOrder,
        endOrder:
          entry.kind === 'span'
            ? Math.max(nextStartOrder, entry.endOrder ?? nextStartOrder)
            : null,
      };
    });
}

function TimelineView(props: TimelineViewProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedBookPath, setSelectedBookPath] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<SagaTimelineEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverEventId, setDragOverEventId] = useState<string | null>(null);

  const isFiltered = Boolean(selectedCharacterId || selectedBookPath);
  const canDrag = Boolean(props.onReorderTimeline) && Boolean(props.activeSaga) && !isFiltered;

  const handleDragStart = (eventId: string): void => {
    if (!canDrag) return;
    setDraggedEventId(eventId);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>, eventId: string): void => {
    if (!draggedEventId || !canDrag) return;
    e.preventDefault();
    setDragOverEventId(eventId);
  };

  const handleDrop = (targetEventId: string): void => {
    if (!draggedEventId || !canDrag || !props.saga || draggedEventId === targetEventId) {
      setDraggedEventId(null);
      setDragOverEventId(null);
      return;
    }

    const orderedTimeline = [...props.saga.metadata.worldBible.timeline].sort(
      (a, b) => a.startOrder - b.startOrder || a.title.localeCompare(b.title),
    );
    const sourceIndex = orderedTimeline.findIndex((e) => e.id === draggedEventId);
    const targetIndex = orderedTimeline.findIndex((e) => e.id === targetEventId);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedEventId(null);
      setDragOverEventId(null);
      return;
    }

    const nextTimeline = [...orderedTimeline];
    const [moved] = nextTimeline.splice(sourceIndex, 1);
    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextTimeline.splice(insertIndex, 0, moved);

    props.onReorderTimeline?.(normalizeTimelineSequence(nextTimeline));
    setDraggedEventId(null);
    setDragOverEventId(null);
  };

  const handleDragEnd = (): void => {
    setDraggedEventId(null);
    setDragOverEventId(null);
  };

  const saga = props.saga;
  const consistencyReport: SagaConsistencyReport | null = useMemo(
    () => (saga ? buildSagaConsistencyReport(saga) : null),
    [saga],
  );
  const sortedEvents = useMemo(
    () => (saga
      ? [...saga.metadata.worldBible.timeline].sort((a, b) => {
          if (a.startOrder !== b.startOrder) {
            return a.startOrder - b.startOrder;
          }
          return a.title.localeCompare(b.title);
        })
      : []),
    [saga],
  );

  const filteredEvents = useMemo(
    () => sortedEvents.filter((event) => {
      if (selectedBookPath && !event.bookRefs.some((ref) => ref.bookPath === selectedBookPath)) {
        return false;
      }

      if (selectedCharacterId && !eventTouchesCharacter(event, selectedCharacterId)) {
        return false;
      }

      return true;
    }),
    [selectedBookPath, selectedCharacterId, sortedEvents],
  );

  // Cumulative years elapsed up to and including each event (based on timeskip events)
  const cumulativeYearsByEventId = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const event of sortedEvents) {
      if (event.category === 'timeskip' && event.timeJumpYears) {
        total += event.timeJumpYears;
      }
      map.set(event.id, total);
    }
    return map;
  }, [sortedEvents]);

  const totalElapsedYears = useMemo(
    () => sortedEvents.reduce((acc, e) => acc + (e.category === 'timeskip' && e.timeJumpYears ? e.timeJumpYears : 0), 0),
    [sortedEvents],
  );
  const timelineOverview = useMemo(() => buildTimelineOverviewModel(filteredEvents), [filteredEvents]);
  const effectiveSelectedEventId =
    filteredEvents.some((entry) => entry.id === selectedEventId) ? selectedEventId : filteredEvents[0]?.id ?? null;
  const selectedEvent = filteredEvents.find((entry) => entry.id === effectiveSelectedEventId) ?? filteredEvents[0] ?? null;
  const selectedCharacter = saga?.metadata.worldBible.characters.find((entry) => entry.id === selectedCharacterId) ?? null;
  const characterJourney = selectedCharacter
    ? sortedEvents.filter((event) => eventTouchesCharacter(event, selectedCharacter.id))
    : [];
  const selectedCharacterAliases =
    selectedCharacter && selectedEvent ? getActiveAliases(selectedCharacter, selectedEvent.startOrder) : [];
  const selectedCharacterVersion =
    selectedCharacter && selectedEvent ? getActiveCharacterVersion(selectedCharacter, selectedEvent.startOrder) : null;
  const selectedOrder = selectedEvent?.startOrder ?? null;
  const activeFamilyRelationships = !saga
    ? []
    : saga.metadata.worldBible.relationships.filter((entry) => {
        if (!isFamilyRelationshipType(entry.type || '')) {
          return false;
        }
        if (entry.from.kind !== 'character' || entry.to.kind !== 'character') {
          return false;
        }
        if (selectedOrder !== null) {
          const startsBefore = entry.startOrder === null || entry.startOrder === undefined || entry.startOrder <= selectedOrder;
          const endsAfter = entry.endOrder === null || entry.endOrder === undefined || entry.endOrder >= selectedOrder;
          if (!startsBefore || !endsAfter) {
            return false;
          }
        }
        return true;
      });
  const selectedCharacterFamilyLinks = !selectedCharacter
    ? []
    : activeFamilyRelationships.filter((entry) => (
        entry.from.id === selectedCharacter.id || entry.to.id === selectedCharacter.id
      ));
  const characterLabelById = new Map(
    (saga?.metadata.worldBible.characters ?? []).map((entry) => [entry.id, entry.name || entry.id]),
  );
  const parentMap = new Map<string, FamilyLevelEntry[]>();
  const childMap = new Map<string, FamilyLevelEntry[]>();
  const spouseMap = new Map<string, FamilyLevelEntry[]>();
  const siblingMap = new Map<string, FamilyLevelEntry[]>();
  const pushFamilyEntry = (target: Map<string, FamilyLevelEntry[]>, key: string, entry: FamilyLevelEntry) => {
    const current = target.get(key) ?? [];
    if (current.some((item) => item.id === entry.id && item.relationLabel === entry.relationLabel)) {
      return;
    }
    target.set(key, [...current, entry]);
  };
  for (const relationship of activeFamilyRelationships) {
    const fromLabel = characterLabelById.get(relationship.from.id) || relationship.from.id;
    const toLabel = characterLabelById.get(relationship.to.id) || relationship.to.id;
    if (isParentRelationship(relationship.type)) {
      pushFamilyEntry(parentMap, relationship.to.id, {
        id: relationship.from.id,
        label: fromLabel,
        relationLabel: relationship.type || 'Ancestro',
        notes: relationship.notes,
      });
      pushFamilyEntry(childMap, relationship.from.id, {
        id: relationship.to.id,
        label: toLabel,
        relationLabel: relationship.type || 'Descendencia',
        notes: relationship.notes,
      });
      continue;
    }
    if (isChildRelationship(relationship.type)) {
      pushFamilyEntry(parentMap, relationship.from.id, {
        id: relationship.to.id,
        label: toLabel,
        relationLabel: relationship.type || 'Ancestro',
        notes: relationship.notes,
      });
      pushFamilyEntry(childMap, relationship.to.id, {
        id: relationship.from.id,
        label: fromLabel,
        relationLabel: relationship.type || 'Descendencia',
        notes: relationship.notes,
      });
      continue;
    }
    if (isSpouseRelationship(relationship.type)) {
      pushFamilyEntry(spouseMap, relationship.from.id, {
        id: relationship.to.id,
        label: toLabel,
        relationLabel: relationship.type || 'Consorte',
        notes: relationship.notes,
      });
      pushFamilyEntry(spouseMap, relationship.to.id, {
        id: relationship.from.id,
        label: fromLabel,
        relationLabel: relationship.type || 'Consorte',
        notes: relationship.notes,
      });
      continue;
    }
    if (isSiblingRelationship(relationship.type)) {
      pushFamilyEntry(siblingMap, relationship.from.id, {
        id: relationship.to.id,
        label: toLabel,
        relationLabel: relationship.type || 'Hermandad',
        notes: relationship.notes,
      });
      pushFamilyEntry(siblingMap, relationship.to.id, {
        id: relationship.from.id,
        label: fromLabel,
        relationLabel: relationship.type || 'Hermandad',
        notes: relationship.notes,
      });
    }
  }
  const selectedCharacterFamilyTree = !selectedCharacter
    ? null
    : {
        ancestors: buildFamilyLevels(selectedCharacter.id, parentMap),
        descendants: buildFamilyLevels(selectedCharacter.id, childMap),
        spouses: spouseMap.get(selectedCharacter.id) ?? [],
        siblings: siblingMap.get(selectedCharacter.id) ?? [],
        bonds: selectedCharacterFamilyLinks.filter(
          (entry) =>
            !isParentRelationship(entry.type) &&
            !isChildRelationship(entry.type) &&
            !isSpouseRelationship(entry.type) &&
            !isSiblingRelationship(entry.type),
        ),
      };
  const laneDefinitions = saga?.metadata.worldBible.timelineLanes ?? [];
  const ganttMinOrder = filteredEvents.length > 0 ? Math.min(...filteredEvents.map((event) => event.startOrder)) : 1;
  const ganttMaxOrder = filteredEvents.length > 0
    ? Math.max(...filteredEvents.map((event) => event.endOrder ?? event.startOrder))
    : 1;
  const ganttSpan = Math.max(1, ganttMaxOrder - ganttMinOrder + 1);
  const ganttMarkCount = Math.min(8, ganttSpan + 1);
  const ganttMarks = Array.from({ length: ganttMarkCount }, (_entry, index) => {
    const value =
      ganttMarkCount === 1
        ? ganttMinOrder
        : Math.round(ganttMinOrder + ((ganttSpan - 1) * index) / Math.max(ganttMarkCount - 1, 1));
    return {
      value,
      leftPct: ganttSpan <= 1 ? 0 : ((value - ganttMinOrder) / ganttSpan) * 100,
    };
  });
  const laneMap = new Map<string, { id: string; label: string; color: string; era: string; description: string; events: SagaTimelineEvent[] }>();
  for (const lane of laneDefinitions) {
    laneMap.set(lane.id, { ...lane, events: [] });
  }
  for (const event of filteredEvents) {
    const laneId = event.laneId?.trim() || 'lane-main';
    const existing = laneMap.get(laneId);
    if (existing) {
      existing.events.push(event);
      continue;
    }
    laneMap.set(laneId, {
      id: laneId,
      label: event.laneLabel?.trim() || 'Carril emergente',
      color: '#1f5f8b',
      era: event.eraLabel?.trim() || 'Presente',
      description: '',
      events: [event],
    });
  }
  const laneRows = Array.from(laneMap.values())
    .filter((lane) => lane.events.length > 0)
    .map((lane) => {
      const rowEndOrders: number[] = [];
      const rowHeightRem = 3.6;
      const barTopOffsetRem = 0.35;
      const placedEvents = [...lane.events]
        .sort((left, right) => left.startOrder - right.startOrder || left.title.localeCompare(right.title))
        .map((event) => {
          const eventEnd = event.endOrder ?? event.startOrder;
          let rowIndex = 0;
          while ((rowEndOrders[rowIndex] ?? Number.NEGATIVE_INFINITY) >= event.startOrder) {
            rowIndex += 1;
          }
          rowEndOrders[rowIndex] = eventEnd;
          return {
            event,
            rowIndex,
            leftPct: ((event.startOrder - ganttMinOrder) / ganttSpan) * 100,
            widthPct: Math.max(8, ((eventEnd - event.startOrder + 1) / ganttSpan) * 100),
            topRem: rowIndex * rowHeightRem + barTopOffsetRem,
          };
        });

      const rowCount = Math.max(1, rowEndOrders.length);
      return {
        ...lane,
        rowCount,
        trackHeightRem: Math.max(4.25, rowCount * 4.1),
        events: placedEvents,
      };
    });
  const atlasPinsByLocationId = new Map(
    (saga?.metadata.worldBible.atlas.pins ?? []).map((pin) => [pin.locationId, pin]),
  );
  const atlasRouteMeasurements = saga?.metadata.worldBible.atlas.routeMeasurements ?? [];
  const atlasDistanceScale = saga?.metadata.worldBible.atlas.distanceScale ?? null;
  const atlasDistanceUnit = saga?.metadata.worldBible.atlas.distanceUnit || 'km';
  const atlasTravelMode = saga?.metadata.worldBible.atlas.defaultTravelMode || 'viaje';
  const locationLabelById = new Map(
    (saga?.metadata.worldBible.locations ?? []).map((entry) => [entry.id, entry.name || entry.id]),
  );
  const characterLabelByIdForTravel = new Map(
    (saga?.metadata.worldBible.characters ?? []).map((entry) => [entry.id, entry.name || entry.id]),
  );

  const findAtlasTravelHint = (fromEvent: SagaTimelineEvent, toEvent: SagaTimelineEvent): string | null => {
    const fromLocations = fromEvent.characterLocations ?? [];
    const toLocations = toEvent.characterLocations ?? [];
    if (fromLocations.length === 0 || toLocations.length === 0) {
      return null;
    }

    for (const toLocation of toLocations) {
      const previousLocation = fromLocations.find((entry) => entry.characterId === toLocation.characterId);
      if (!previousLocation || previousLocation.locationId === toLocation.locationId) {
        continue;
      }

      const fromPin = atlasPinsByLocationId.get(previousLocation.locationId);
      const toPin = atlasPinsByLocationId.get(toLocation.locationId);
      if (!fromPin || !toPin) {
        continue;
      }

      const measurement = atlasRouteMeasurements.find(
        (entry) =>
          (entry.fromPinId === fromPin.id && entry.toPinId === toPin.id) ||
          (entry.fromPinId === toPin.id && entry.toPinId === fromPin.id),
      );
      const directDistance =
        measurement?.distanceOverride !== null && measurement?.distanceOverride !== undefined
          ? measurement.distanceOverride
          : atlasDistanceScale && Number.isFinite(atlasDistanceScale) && atlasDistanceScale > 0
            ? (Math.hypot(fromPin.xPct - toPin.xPct, fromPin.yPct - toPin.yPct) / 100) * atlasDistanceScale
            : null;
      const distanceText =
        directDistance !== null && Number.isFinite(directDistance)
          ? `${directDistance >= 10 ? directDistance.toFixed(1) : directDistance.toFixed(2)} ${atlasDistanceUnit}`
          : 'distancia sin medir';
      const travelText =
        measurement?.travelHours !== null && measurement?.travelHours !== undefined && Number.isFinite(measurement.travelHours)
          ? `${measurement.travelHours.toFixed(1)} h (${atlasTravelMode})`
          : 'tiempo sin medir';
      const characterName =
        characterLabelByIdForTravel.get(toLocation.characterId) || toLocation.characterId || 'Personaje';
      const fromName = locationLabelById.get(previousLocation.locationId) || previousLocation.locationId;
      const toName = locationLabelById.get(toLocation.locationId) || toLocation.locationId;
      return `${characterName}: ${fromName} -> ${toName} (${distanceText}, ${travelText})`;
    }

    return null;
  };

  const eventPlacementById = new Map(
    laneRows.flatMap((lane) =>
      lane.events.map((placement) => [
        placement.event.id,
        {
          event: placement.event,
          laneId: lane.id,
          laneLabel: lane.label,
          rowIndex: placement.rowIndex,
          leftPct: placement.leftPct,
          widthPct: placement.widthPct,
          topRem: placement.topRem,
          trackHeightRem: lane.trackHeightRem,
          label: placement.event.displayLabel || `T${placement.event.startOrder}`,
          title: placement.event.title || placement.event.id,
        },
      ] as const),
    ),
  );
  const laneDependencyMap = new Map<
    string,
    {
      paths: Array<{
        id: string;
        dependencyId: string;
        eventId: string;
        dependencyLabel: string;
        eventLabel: string;
        d: string;
      }>;
      crossLaneCount: number;
      crossLaneLinks: Array<{
        id: string;
        dependencyId: string;
        eventId: string;
        dependencyLabel: string;
        eventLabel: string;
        dependencyLaneLabel: string;
        eventLaneLabel: string;
        travelHint: string | null;
      }>;
    }
  >();

  for (const lane of laneRows) {
    const paths: Array<{
      id: string;
      dependencyId: string;
      eventId: string;
      dependencyLabel: string;
      eventLabel: string;
      d: string;
    }> = [];
    const crossLaneLinks: Array<{
      id: string;
      dependencyId: string;
      eventId: string;
      dependencyLabel: string;
      eventLabel: string;
      dependencyLaneLabel: string;
      eventLaneLabel: string;
      travelHint: string | null;
    }> = [];
    let crossLaneCount = 0;

    for (const placement of lane.events) {
      for (const dependencyId of placement.event.dependencyIds ?? []) {
        const dependencyPlacement = eventPlacementById.get(dependencyId);
        if (!dependencyPlacement) {
          continue;
        }

        if (dependencyPlacement.laneId !== lane.id) {
          crossLaneCount += 1;
          crossLaneLinks.push({
            id: `${placement.event.id}-${dependencyId}`,
            dependencyId,
            eventId: placement.event.id,
            dependencyLabel: dependencyPlacement.label,
            eventLabel: placement.event.displayLabel || `T${placement.event.startOrder}`,
            dependencyLaneLabel: dependencyPlacement.laneLabel,
            eventLaneLabel: lane.label,
            travelHint: findAtlasTravelHint(dependencyPlacement.event, placement.event),
          });
          continue;
        }

        const fromX = Math.max(0, Math.min(99, dependencyPlacement.leftPct + dependencyPlacement.widthPct));
        const toX = Math.max(0, Math.min(99, placement.leftPct));
        const fromY = Math.max(
          2,
          Math.min(
            98,
            ((dependencyPlacement.topRem + 1.2) / Math.max(0.1, lane.trackHeightRem)) * 100,
          ),
        );
        const toY = Math.max(
          2,
          Math.min(
            98,
            ((placement.topRem + 1.2) / Math.max(0.1, lane.trackHeightRem)) * 100,
          ),
        );
        const controlX = (fromX + toX) / 2;

        paths.push({
          id: `${placement.event.id}-${dependencyId}`,
          dependencyId,
          eventId: placement.event.id,
          dependencyLabel: dependencyPlacement.label,
          eventLabel: placement.event.displayLabel || `T${placement.event.startOrder}`,
          d: `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${controlX.toFixed(2)} ${fromY.toFixed(2)}, ${controlX.toFixed(2)} ${toY.toFixed(2)}, ${toX.toFixed(2)} ${toY.toFixed(2)}`,
        });
      }
    }

    laneDependencyMap.set(lane.id, { paths, crossLaneCount, crossLaneLinks });
  }
  const crossLaneCountByEventId = new Map<string, number>();
  for (const laneEntry of laneDependencyMap.values()) {
    for (const link of laneEntry.crossLaneLinks) {
      crossLaneCountByEventId.set(link.eventId, (crossLaneCountByEventId.get(link.eventId) ?? 0) + 1);
    }
  }
  const eventIndex = new Map(sortedEvents.map((entry) => [entry.id, entry]));
  const selectedEventDependencies = selectedEvent
    ? (selectedEvent.dependencyIds ?? [])
        .map((dependencyId) => eventIndex.get(dependencyId) ?? null)
        .filter((entry): entry is SagaTimelineEvent => Boolean(entry))
    : [];
  const selectedEventDependents = selectedEvent
    ? sortedEvents.filter((entry) => (entry.dependencyIds ?? []).includes(selectedEvent.id))
    : [];
  const selectedEventCrossLaneLinks = selectedEvent
    ? [
        ...selectedEventDependencies
          .filter((dependency) => (dependency.laneId || '') !== (selectedEvent.laneId || ''))
          .map((dependency) => ({
            id: `in-${dependency.id}-${selectedEvent.id}`,
            direction: 'in' as const,
            fromEvent: dependency,
            toEvent: selectedEvent,
            fromLane: dependency.laneLabel || dependency.laneId || 'Carril sin nombre',
            toLane: selectedEvent.laneLabel || selectedEvent.laneId || 'Carril sin nombre',
            travelHint: findAtlasTravelHint(dependency, selectedEvent),
          })),
        ...selectedEventDependents
          .filter((dependent) => (dependent.laneId || '') !== (selectedEvent.laneId || ''))
          .map((dependent) => ({
            id: `out-${selectedEvent.id}-${dependent.id}`,
            direction: 'out' as const,
            fromEvent: selectedEvent,
            toEvent: dependent,
            fromLane: selectedEvent.laneLabel || selectedEvent.laneId || 'Carril sin nombre',
            toLane: dependent.laneLabel || dependent.laneId || 'Carril sin nombre',
            travelHint: findAtlasTravelHint(selectedEvent, dependent),
          })),
      ]
    : [];
  const timelineSummaryCards = [
    {
      label: 'Eventos',
      value: filteredEvents.length,
      note: `${sortedEvents.length} en cronologia total`,
    },
    {
      label: 'Carriles',
      value: laneRows.length,
      note: `${laneDefinitions.length} definidos en saga`,
    },
    {
      label: 'Alertas',
      value: consistencyReport?.issues.length ?? 0,
      note:
        consistencyReport && consistencyReport.errorCount > 0
          ? `${consistencyReport.errorCount} errores`
          : `${consistencyReport?.warningCount ?? 0} avisos`,
    },
    {
      label: 'Escala',
      value: totalElapsedYears,
      note: totalElapsedYears > 0 ? 'anios acumulados' : 'sin saltos temporales',
    },
  ];

  if (!saga) {
    return (
      <section className="settings-view timeline-view">
        <header>
          <h2>Timeline</h2>
          <p>Abri una saga para ver la cronologia canonica y las rutas de personaje.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="settings-view timeline-view chronicle-view">
      <header className="timeline-chronicle-hero">
        <div className="timeline-chronicle-copy">
          <span className="section-kicker">Cronica viva</span>
          <h2>Timeline canonica</h2>
          <p>Segui la cronologia global de la saga, detecta cruces entre libros y revisa el avance de cada personaje.</p>
          {totalElapsedYears > 0 && (
            <p className="muted">
              Escala temporal total: <strong>{totalElapsedYears} anos</strong> acumulados en saltos temporales (
              {sortedEvents.filter((e) => e.category === 'timeskip' && e.timeJumpYears).length}
              {' '}
              eventos timeskip)
            </p>
          )}
        </div>
        <div className="timeline-chronicle-ledger" aria-label="Resumen de la cronologia">
          {timelineSummaryCards.map((card) => (
            <article key={card.label} className="timeline-chronicle-card">
              <span className="section-kicker">{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </article>
          ))}
        </div>
      </header>

      <div className="timeline-toolbar timeline-toolbar-shell">
        <label>
          Filtrar por personaje
          <select value={selectedCharacterId} onChange={(event) => setSelectedCharacterId(event.target.value)}>
            <option value="">Todos</option>
            {saga.metadata.worldBible.characters.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name || 'Personaje sin nombre'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtrar por libro
          <select value={selectedBookPath} onChange={(event) => setSelectedBookPath(event.target.value)}>
            <option value="">Todos</option>
            {saga.metadata.books.map((entry) => (
              <option key={entry.bookPath} value={entry.bookPath}>
                {entry.volumeNumber ? `Vol. ${entry.volumeNumber} - ` : ''}
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {canDrag
            ? 'Arrastra eventos para reordenar la cronologia'
            : isFiltered
              ? 'Limpia filtros para habilitar drag-and-drop'
              : 'Validacion en vivo'}
        </span>
        {props.activeSaga && (
          <button type="button" onClick={() => { setIsCreatingEvent(true); setEditingEvent(null); }}>
            + Nuevo evento
          </button>
        )}
      </div>

      {/* Formulario de creacion */}
      {isCreatingEvent && props.activeSaga && (
        <EventForm
          event={makeEmptyEvent()}
          availableEvents={sortedEvents}
          onSave={(event) => { props.onUpsertEvent(event); setIsCreatingEvent(false); setSelectedEventId(event.id); }}
          onCancel={() => setIsCreatingEvent(false)}
        />
      )}

      <section className="bible-section timeline-scale-panel">
        <div className="bible-section-head">
          <h3>Escala visual</h3>
          <span className="muted">
            {timelineOverview.axisMode === 'years'
              ? `${timelineOverview.totalAxisValue} anos entre eventos`
              : `${timelineOverview.totalAxisValue} pasos canon`}
          </span>
        </div>
        {filteredEvents.length <= 1 ? (
          <p className="muted">Necesitas al menos dos eventos para ver huecos y escala cronologica.</p>
        ) : (
          <>
            <div className="timeline-scale-track" aria-label="Escala visual de la timeline">
              <div className="timeline-scale-axis" />
              {timelineOverview.topGaps.map((gap) => (
                <button
                  key={`${gap.fromEventId}-${gap.toEventId}`}
                  type="button"
                  className="timeline-scale-gap"
                  style={{
                    left: `${gap.positionStartPct}%`,
                    width: `${Math.max(2, gap.positionEndPct - gap.positionStartPct)}%`,
                  }}
                  onClick={() => setSelectedEventId(gap.toEventId)}
                  title={
                    timelineOverview.axisMode === 'years'
                      ? `Hueco de ${gap.distance} anos entre ${gap.fromLabel} y ${gap.toLabel}`
                      : `Hueco de ${gap.distance} pasos entre ${gap.fromLabel} y ${gap.toLabel}`
                  }
                />
              ))}
              {timelineOverview.markers.map((marker, index) => {
                const shouldShowLabel =
                  index === 0 ||
                  index === timelineOverview.markers.length - 1 ||
                  marker.eventId === effectiveSelectedEventId;

                return (
                  <button
                    key={marker.eventId}
                    type="button"
                    className={`timeline-scale-marker ${marker.eventId === effectiveSelectedEventId ? 'is-selected' : ''}`}
                    style={{ left: `${marker.positionPct}%` }}
                    onClick={() => setSelectedEventId(marker.eventId)}
                    title={`${marker.label} | ${marker.title}`}
                  >
                    <span className="timeline-scale-dot" />
                    {shouldShowLabel ? <span className="timeline-scale-label">{marker.label}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="timeline-scale-legend">
              <span>{timelineOverview.markers[0]?.label ?? 'Inicio'}</span>
              <span>
                {timelineOverview.axisMode === 'years'
                  ? `${timelineOverview.totalAxisValue} anos acumulados`
                  : `${filteredEvents.length} eventos visibles`}
              </span>
              <span>{timelineOverview.markers[timelineOverview.markers.length - 1]?.label ?? 'Final'}</span>
            </div>
            {timelineOverview.topGaps.length > 0 ? (
              <div className="timeline-gap-list">
                {timelineOverview.topGaps.map((gap) => (
                  <button
                    key={`gap-card-${gap.fromEventId}-${gap.toEventId}`}
                    type="button"
                    className="timeline-gap-card"
                    onClick={() => setSelectedEventId(gap.toEventId)}
                  >
                    <strong>
                      {timelineOverview.axisMode === 'years' ? `Hueco +${gap.distance} anos` : `Hueco +${gap.distance}`}
                    </strong>
                    <span>
                      {gap.fromLabel} {'->'} {gap.toLabel}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No se detectan huecos medibles entre los eventos filtrados.</p>
            )}
          </>
        )}
      </section>

      <div className="timeline-layout">
        <section className="timeline-rail">
          <section className="bible-section timeline-lanes-panel">
            <div className="bible-section-head">
              <h3>Vista por carriles</h3>
              <span className="muted">{laneRows.length} carriles visibles</span>
            </div>
            {laneRows.length === 0 ? (
              <p className="muted">No hay carriles visibles con los filtros activos.</p>
            ) : (
              <div className="timeline-lane-board timeline-gantt-board">
                <div className="timeline-gantt-axis" aria-hidden="true">
                  {ganttMarks.map((mark) => (
                    <span
                      key={`axis-${mark.value}-${mark.leftPct}`}
                      className="timeline-gantt-axis-mark"
                      style={{ left: `${mark.leftPct}%` }}
                    >
                      {mark.value}
                    </span>
                  ))}
                </div>
                {laneRows.map((lane) => (
                  <section key={lane.id} className="timeline-lane-row">
                    <div className="timeline-lane-meta" style={{ borderColor: lane.color }}>
                      <strong>{lane.label}</strong>
                      <small>{lane.era || 'Sin era'}</small>
                      {lane.description ? <small>{lane.description}</small> : null}
                      <small>
                        {lane.events.length} hitos / {lane.rowCount} nivel(es) /{' '}
                        {laneDependencyMap.get(lane.id)?.paths.length ?? 0} enlaces
                      </small>
                      {(laneDependencyMap.get(lane.id)?.crossLaneCount ?? 0) > 0 ? (
                        <small>{laneDependencyMap.get(lane.id)?.crossLaneCount ?? 0} dependencia/s cruzan carriles</small>
                      ) : null}
                      {(laneDependencyMap.get(lane.id)?.crossLaneLinks.length ?? 0) > 0 ? (
                        <div className="timeline-cross-lane-list">
                          {laneDependencyMap.get(lane.id)?.crossLaneLinks.slice(0, 2).map((link) => (
                            <small key={`cross-lane-${lane.id}-${link.id}`}>
                              {link.dependencyLabel} ({link.dependencyLaneLabel}) {'->'} {link.eventLabel} ({link.eventLaneLabel})
                            </small>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className="timeline-lane-track timeline-gantt-track"
                      style={{ minHeight: `${lane.trackHeightRem}rem` }}
                    >
                      <div className="timeline-gantt-grid" aria-hidden="true">
                        {ganttMarks.map((mark) => (
                          <span
                            key={`grid-${lane.id}-${mark.value}-${mark.leftPct}`}
                            className="timeline-gantt-grid-line"
                            style={{ left: `${mark.leftPct}%` }}
                          />
                        ))}
                      </div>
                      {(laneDependencyMap.get(lane.id)?.paths.length ?? 0) > 0 ? (
                        <svg
                          className="timeline-dependency-overlay"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <defs>
                            <marker
                              id={`timeline-dependency-arrow-${lane.id}`}
                              markerWidth="4"
                              markerHeight="4"
                              refX="3.2"
                              refY="2"
                              orient="auto"
                            >
                              <path d="M0,0 L4,2 L0,4 z" fill={lane.color || '#1f5f8b'} />
                            </marker>
                          </defs>
                          {laneDependencyMap.get(lane.id)?.paths.map((path) => (
                            <path
                              key={`lane-dependency-${lane.id}-${path.id}`}
                              className="timeline-dependency-path"
                              d={path.d}
                              stroke={lane.color || '#1f5f8b'}
                              markerEnd={`url(#timeline-dependency-arrow-${lane.id})`}
                            />
                          ))}
                        </svg>
                      ) : null}
                      {lane.events.map(({ event, rowIndex, leftPct, widthPct }) => (
                        <button
                          key={`${lane.id}-${event.id}`}
                          type="button"
                          className={`timeline-lane-card timeline-gantt-bar ${selectedEvent?.id === event.id ? 'is-selected' : ''}`}
                          style={{
                            left: `${leftPct}%`,
                            width: `calc(${widthPct}% - 0.2rem)`,
                            top: `${rowIndex * 3.6 + 0.35}rem`,
                            borderColor: lane.color,
                          }}
                          onClick={() => setSelectedEventId(event.id)}
                        >
                          <strong>{event.displayLabel || `T${event.startOrder}`}</strong>
                          <span>{event.title || 'Evento sin titulo'}</span>
                          <small>
                            {event.kind === 'span'
                              ? `${event.startOrder}-${event.endOrder ?? event.startOrder}`
                              : `Punto ${event.startOrder}`}
                          </small>
                          {(event.dependencyIds?.length ?? 0) > 0 ? (
                            <small>Dep: {event.dependencyIds?.length ?? 0}</small>
                          ) : null}
                          {(crossLaneCountByEventId.get(event.id) ?? 0) > 0 ? (
                            <small>Cruces: {crossLaneCountByEventId.get(event.id)}</small>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
          {filteredEvents.length === 0 ? (
            <p className="muted">No hay eventos que coincidan con los filtros activos.</p>
          ) : (
            filteredEvents.map((event) => {
              const activeImpact = selectedCharacterId
                ? event.characterImpacts.find((impact) => impact.characterId === selectedCharacterId)
                : null;
              const activeAliases =
                selectedCharacterId && selectedCharacter ? getActiveAliases(selectedCharacter, event.startOrder) : [];
              const activeLocation = selectedCharacterId
                ? (event.characterLocations ?? []).find((entry) => entry.characterId === selectedCharacterId)
                : null;
              const relatedBooks = Array.from(
                new Set(
                  event.bookRefs
                    .map((entry) => {
                      const linkedBook = saga.metadata.books.find((book) => book.bookPath === entry.bookPath);
                      return linkedBook?.title || entry.bookPath || '';
                    })
                    .filter(Boolean),
                ),
              );

              return (
                <button
                  key={event.id}
                  type="button"
                  draggable={canDrag}
                  onDragStart={() => handleDragStart(event.id)}
                  onDragOver={(e) => handleDragOver(e, event.id)}
                  onDrop={() => handleDrop(event.id)}
                  onDragEnd={handleDragEnd}
                  className={`timeline-event ${selectedEvent?.id === event.id ? 'is-selected' : ''} ${draggedEventId === event.id ? 'is-dragging' : ''} ${dragOverEventId === event.id && draggedEventId !== event.id ? 'is-drag-over' : ''}`}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <div className="timeline-event-head">
                    <span className="timeline-order">{event.displayLabel || `T${event.startOrder}`}</span>
                    <strong>{event.title || 'Evento sin titulo'}</strong>
                  </div>
                  <p>{event.summary || 'Sin resumen todavia.'}</p>
                  <div className="timeline-badges">
                    <span className="timeline-badge">{event.kind === 'span' ? `Tramo ${event.startOrder}-${event.endOrder ?? event.startOrder}` : `Punto ${event.startOrder}`}</span>
                    <span className="timeline-badge">{event.category}</span>
                    {event.laneLabel ? <span className="timeline-badge">{event.laneLabel}</span> : null}
                    {event.eraLabel ? <span className="timeline-badge">{event.eraLabel}</span> : null}
                    {(event.dependencyIds?.length ?? 0) > 0 ? <span className="timeline-badge">Dep: {event.dependencyIds?.length ?? 0}</span> : null}
                    {event.category === 'timeskip' && event.timeJumpYears ? <span className="timeline-badge timeline-badge-timejump">+{event.timeJumpYears} años</span> : null}
                    {relatedBooks.length > 0 && <span className="timeline-badge">{relatedBooks.join(' / ')}</span>}
                    {activeImpact?.aliasUsed && <span className="timeline-badge">{activeImpact.aliasUsed}</span>}
                    {!activeImpact?.aliasUsed && activeAliases.length > 0 && <span className="timeline-badge">{activeAliases.join(', ')}</span>}
                    {activeLocation?.locationId ? <span className="timeline-badge">Loc: {activeLocation.locationId}</span> : null}
                    {(event.secretReveals?.length ?? 0) > 0 ? (
                      <span className="timeline-badge">Revelaciones: {event.secretReveals?.length ?? 0}</span>
                    ) : null}
                    {(event.artifactTransfers?.length ?? 0) > 0 ? (
                      <span className="timeline-badge">Transferencias: {event.artifactTransfers?.length ?? 0}</span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </section>

        <aside className="timeline-side">
          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Revisor de coherencia</h3>
              <span className="muted">
                {consistencyReport
                  ? `${consistencyReport.errorCount} errores / ${consistencyReport.warningCount} avisos`
                  : 'Calculando...'}
              </span>
            </div>
            {!consistencyReport ? (
              <p className="muted">Cargando validacion en vivo de la saga...</p>
            ) : consistencyReport.issues.length === 0 ? (
              <p className="muted">No se detectaron problemas estructurales en la saga cargada.</p>
            ) : (
              <div className="timeline-check-list">
                {consistencyReport.issues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className={`timeline-check-item is-${issue.severity}`}
                    onClick={() => {
                      setSelectedCharacterId('');
                      setSelectedBookPath('');
                      if (issue.eventId) {
                        setSelectedEventId(issue.eventId);
                      }
                    }}
                  >
                    <strong>{issue.code}</strong>
                    <span>{issue.message}</span>
                    <small>
                      {issue.eventId ? `Evento: ${issue.eventId}` : 'Sin evento'}
                      {issue.characterId ? ` | Personaje: ${issue.characterId}` : ''}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Ruta del personaje</h3>
              <span className="muted">{selectedCharacter ? `${characterJourney.length} hitos` : 'Sin filtro'}</span>
            </div>
            {!selectedCharacter ? (
              <p className="muted">Elegi un personaje para ver su progreso, apodos activos y eventos vinculados.</p>
            ) : (
              <>
                <strong>{selectedCharacter.name || 'Personaje sin nombre'}</strong>
                <p>{selectedCharacter.summary || 'Sin resumen.'}</p>
                <div className="timeline-badges">
                  <span className="timeline-badge">Estado: {selectedCharacter.lifecycle.currentStatus}</span>
                  {selectedCharacterVersion ? (
                    <span className="timeline-badge">Version activa: {selectedCharacterVersion.label || 'Sin etiqueta'}</span>
                  ) : null}
                  {selectedCharacterAliases.map((alias) => (
                    <span key={alias} className="timeline-badge">
                      {alias}
                    </span>
                  ))}
                </div>
                {characterJourney.length === 0 ? (
                  <p className="muted">No hay eventos ligados a este personaje.</p>
                ) : (
                  <div className="timeline-journey">
                    {characterJourney.map((event) => {
                      const impact = event.characterImpacts.find((entry) => entry.characterId === selectedCharacter.id);
                      return (
                        <button
                          key={`${selectedCharacter.id}-${event.id}`}
                          type="button"
                          className="timeline-journey-item"
                          onClick={() => setSelectedEventId(event.id)}
                        >
                          <strong>{event.displayLabel || `T${event.startOrder}`}</strong>
                          <span>{event.title || 'Evento sin titulo'}</span>
                          <small>{impact?.stateChange || impact?.impactType || event.summary || 'Sin detalle'}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Genealogia dinamica</h3>
              <span className="muted">{selectedCharacter ? `${selectedCharacterFamilyLinks.length} vinculos` : 'Sin filtro'}</span>
            </div>
            {!selectedCharacter ? (
              <p className="muted">Selecciona un personaje para visualizar su red familiar y dinastica.</p>
            ) : !selectedCharacterFamilyTree || (
              selectedCharacterFamilyTree.ancestors.length === 0 &&
              selectedCharacterFamilyTree.descendants.length === 0 &&
              selectedCharacterFamilyTree.spouses.length === 0 &&
              selectedCharacterFamilyTree.siblings.length === 0 &&
              selectedCharacterFamilyTree.bonds.length === 0
            ) ? (
              <p className="muted">No hay relaciones familiares cargadas para este personaje.</p>
            ) : (
              <div className="timeline-family-tree">
                {selectedCharacterFamilyTree.ancestors.map((level, index) => (
                  <div key={`ancestor-level-${index + 1}`} className="timeline-family-generation">
                    <strong>Ancestros G-{index + 1}</strong>
                    {level.map((entry) => (
                      <div key={`ancestor-${index + 1}-${entry.id}`} className="timeline-detail-stack">
                        <strong>{entry.label}</strong>
                        <span>{entry.relationLabel}</span>
                        <small>{entry.notes || 'Sin notas.'}</small>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="timeline-family-generation is-focus">
                  <strong>{selectedCharacter.name || 'Personaje'}</strong>
                  <small>{selectedCharacter.summary || 'Sin resumen.'}</small>
                  {selectedCharacterFamilyTree.spouses.length > 0 ? (
                    <div className="timeline-detail-stack">
                      <strong>Consortes</strong>
                      {selectedCharacterFamilyTree.spouses.map((entry) => (
                        <small key={`spouse-${entry.id}`}>{entry.label}</small>
                      ))}
                    </div>
                  ) : null}
                  {selectedCharacterFamilyTree.siblings.length > 0 ? (
                    <div className="timeline-detail-stack">
                      <strong>Hermandad</strong>
                      {selectedCharacterFamilyTree.siblings.map((entry) => (
                        <small key={`sibling-${entry.id}`}>{entry.label}</small>
                      ))}
                    </div>
                  ) : null}
                </div>
                {selectedCharacterFamilyTree.descendants.map((level, index) => (
                  <div key={`descendant-level-${index + 1}`} className="timeline-family-generation">
                    <strong>Descendencia G+{index + 1}</strong>
                    {level.map((entry) => (
                      <div key={`descendant-${index + 1}-${entry.id}`} className="timeline-detail-stack">
                        <strong>{entry.label}</strong>
                        <span>{entry.relationLabel}</span>
                        <small>{entry.notes || 'Sin notas.'}</small>
                      </div>
                    ))}
                  </div>
                ))}
                {selectedCharacterFamilyTree.bonds.length > 0 ? (
                  <div className="timeline-family-generation">
                    <strong>Vinculos dinasticos</strong>
                    {selectedCharacterFamilyTree.bonds.map((relationship) => {
                      const fromName =
                        saga.metadata.worldBible.characters.find((entry) => entry.id === relationship.from.id)?.name ||
                        relationship.from.id ||
                        'Personaje';
                      const toName =
                        saga.metadata.worldBible.characters.find((entry) => entry.id === relationship.to.id)?.name ||
                        relationship.to.id ||
                        'Personaje';
                      return (
                        <div key={`bond-${relationship.id}`} className="timeline-detail-stack">
                          <strong>{relationship.type || 'Relacion familiar'}</strong>
                          <span>
                            {fromName} {'->'} {toName}
                          </span>
                          <small>{relationship.notes || 'Sin notas.'}</small>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Detalle del evento</h3>
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
              <EventForm
                event={editingEvent}
                availableEvents={sortedEvents}
                onSave={(event) => { props.onUpsertEvent(event); setEditingEvent(null); }}
                onCancel={() => setEditingEvent(null)}
                onDelete={() => { props.onDeleteEvent(editingEvent.id); setEditingEvent(null); setSelectedEventId(null); }}
              />
            ) : !selectedEvent ? (
              <p className="muted">No hay eventos para mostrar.</p>
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
                  {selectedEvent.laneLabel ? <span className="timeline-badge">{selectedEvent.laneLabel}</span> : null}
                  {selectedEvent.eraLabel ? <span className="timeline-badge">{selectedEvent.eraLabel}</span> : null}
                  {(selectedEvent.dependencyIds?.length ?? 0) > 0 ? (
                    <span className="timeline-badge">Dep: {selectedEvent.dependencyIds?.length ?? 0}</span>
                  ) : null}
                  {selectedEvent.category === 'timeskip' && selectedEvent.timeJumpYears ? (
                    <span className="timeline-badge timeline-badge-timejump">Salto: +{selectedEvent.timeJumpYears} años</span>
                  ) : null}
                  {cumulativeYearsByEventId.get(selectedEvent.id) ? (
                    <span className="timeline-badge">Año acumulado: {cumulativeYearsByEventId.get(selectedEvent.id)}</span>
                  ) : null}
                  {selectedEvent.entityIds.slice(0, 4).map((entityId) => {
                    const wb = saga.metadata.worldBible;
                    const resolved =
                      wb.characters.find((e) => e.id === entityId)?.name ||
                      wb.locations.find((e) => e.id === entityId)?.name ||
                      wb.factions.find((e) => e.id === entityId)?.name ||
                      wb.artifacts.find((e) => e.id === entityId)?.name ||
                      wb.systems.find((e) => e.id === entityId)?.name ||
                      wb.fauna.find((e) => e.id === entityId)?.name ||
                      wb.flora.find((e) => e.id === entityId)?.name ||
                      wb.routes.find((e) => e.id === entityId)?.name ||
                      entityId;
                    return (
                      <span key={entityId} className="timeline-badge">
                        {resolved}
                      </span>
                    );
                  })}
                </div>
                <p>{selectedEvent.notes || 'Sin notas adicionales.'}</p>
                {selectedEvent.objectiveTruth ? (
                  <p>
                    <strong>Verdad objetiva:</strong> {selectedEvent.objectiveTruth}
                  </p>
                ) : null}
                {selectedEvent.perceivedTruth ? (
                  <p>
                    <strong>Verdad percibida:</strong> {selectedEvent.perceivedTruth}
                  </p>
                ) : null}

                <div className="timeline-detail-list">
                  <strong>Dependencias</strong>
                  {selectedEventDependencies.length === 0 && selectedEventDependents.length === 0 ? (
                    <p className="muted">Sin dependencias registradas para este evento.</p>
                  ) : (
                    <>
                      {selectedEventDependencies.map((dependency) => (
                        <div key={`dependency-${dependency.id}`} className="timeline-detail-row">
                          <span>
                            Requiere: {dependency.displayLabel || `T${dependency.startOrder}`} | {dependency.title || dependency.id}
                          </span>
                          <button type="button" onClick={() => setSelectedEventId(dependency.id)}>
                            Ver
                          </button>
                        </div>
                      ))}
                      {selectedEventDependents.map((dependent) => (
                        <div key={`dependent-${dependent.id}`} className="timeline-detail-row">
                          <span>
                            Desbloquea: {dependent.displayLabel || `T${dependent.startOrder}`} | {dependent.title || dependent.id}
                          </span>
                          <button type="button" onClick={() => setSelectedEventId(dependent.id)}>
                            Ver
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <div className="timeline-detail-list">
                  <strong>Cruces entre carriles</strong>
                  {selectedEventCrossLaneLinks.length === 0 ? (
                    <p className="muted">Sin cruces de carril para este evento.</p>
                  ) : (
                    selectedEventCrossLaneLinks.map((link) => (
                      <div key={`cross-lane-detail-${link.id}`} className="timeline-detail-stack">
                        <strong>
                          {link.direction === 'in' ? 'Dependencia entrante' : 'Dependencia saliente'}
                        </strong>
                        <span>
                          {link.fromEvent.displayLabel || `T${link.fromEvent.startOrder}`} ({link.fromLane}) {'->'}{' '}
                          {link.toEvent.displayLabel || `T${link.toEvent.startOrder}`} ({link.toLane})
                        </span>
                        <small>{link.travelHint || 'Sin ruta atlas medible entre los eventos vinculados.'}</small>
                      </div>
                    ))
                  )}
                </div>

                <div className="timeline-detail-list">
                  <strong>Libros y capitulos</strong>
                  {selectedEvent.bookRefs.length === 0 ? (
                    <p className="muted">Sin referencias narrativas.</p>
                  ) : (
                    selectedEvent.bookRefs.map((reference, index) => {
                      const linkedBook = saga.metadata.books.find((entry) => entry.bookPath === reference.bookPath);
                      return (
                        <div key={`${selectedEvent.id}-book-${index}`} className="timeline-detail-row">
                          <span>
                            {linkedBook?.title || reference.bookPath || 'Libro no vinculado'}
                            {reference.chapterId ? ` | ${reference.chapterId}` : ''}
                            {reference.mode ? ` | ${reference.mode}` : ''}
                            {reference.locationId ? ` | loc: ${reference.locationId}` : ''}
                          </span>
                          {reference.bookPath ? (
                            <button type="button" onClick={() => props.onOpenBook(reference.bookPath)}>
                              Abrir
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="timeline-detail-list">
                  <strong>Impactos de personajes</strong>
                  {selectedEvent.characterImpacts.length === 0 ? (
                    <p className="muted">Sin impactos registrados.</p>
                  ) : (
                    selectedEvent.characterImpacts.map((impact, index) => {
                      const linkedCharacter =
                        saga.metadata.worldBible.characters.find((entry) => entry.id === impact.characterId)?.name ||
                        impact.characterId ||
                        'Personaje no identificado';

                      return (
                        <div key={`${selectedEvent.id}-impact-${index}`} className="timeline-detail-stack">
                          <strong>{linkedCharacter}</strong>
                          <span>{impact.impactType}</span>
                          {impact.aliasUsed ? <span className="muted">Alias: {impact.aliasUsed}</span> : null}
                          <small>{impact.stateChange || 'Sin detalle.'}</small>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="timeline-detail-list">
                  <strong>Ubicaciones de personajes</strong>
                  {(selectedEvent.characterLocations ?? []).length === 0 ? (
                    <p className="muted">Sin ubicaciones registradas.</p>
                  ) : (
                    (selectedEvent.characterLocations ?? []).map((entry, index) => {
                      const characterName =
                        saga.metadata.worldBible.characters.find((character) => character.id === entry.characterId)?.name ||
                        entry.characterId ||
                        'Personaje';
                      const locationName =
                        saga.metadata.worldBible.locations.find((location) => location.id === entry.locationId)?.name ||
                        entry.locationId ||
                        'Ubicacion';
                      return (
                        <div key={`${selectedEvent.id}-location-${index}`} className="timeline-detail-stack">
                          <strong>{characterName}</strong>
                          <span>{locationName}</span>
                          <small>{entry.notes || 'Sin notas.'}</small>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="timeline-detail-list">
                  <strong>Transferencias de artefactos</strong>
                  {(selectedEvent.artifactTransfers ?? []).length === 0 ? (
                    <p className="muted">Sin transferencias registradas.</p>
                  ) : (
                    (selectedEvent.artifactTransfers ?? []).map((entry, index) => {
                      const artifactName =
                        saga.metadata.worldBible.artifacts.find((artifact) => artifact.id === entry.artifactId)?.name ||
                        entry.artifactId ||
                        'Artefacto';
                      const fromName =
                        saga.metadata.worldBible.characters.find((character) => character.id === entry.fromCharacterId)
                          ?.name ||
                        entry.fromCharacterId ||
                        'Origen sin definir';
                      const toName =
                        saga.metadata.worldBible.characters.find((character) => character.id === entry.toCharacterId)
                          ?.name ||
                        entry.toCharacterId ||
                        'Destino sin definir';
                      return (
                        <div key={`${selectedEvent.id}-transfer-${index}`} className="timeline-detail-stack">
                          <strong>{artifactName}</strong>
                          <span>
                            {fromName} {'->'} {toName}
                          </span>
                          <small>{entry.notes || 'Sin notas.'}</small>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="timeline-detail-list">
                  <strong>Revelaciones</strong>
                  {(selectedEvent.secretReveals ?? []).length === 0 ? (
                    <p className="muted">Sin revelaciones registradas.</p>
                  ) : (
                    (selectedEvent.secretReveals ?? []).map((entry, index) => {
                      const secretTitle =
                        (saga.metadata.worldBible.secrets ?? []).find((secret) => secret.id === entry.secretId)?.title ||
                        entry.secretId ||
                        'Secreto';
                      const perceiverName =
                        saga.metadata.worldBible.characters.find((character) => character.id === entry.perceiverCharacterId)
                          ?.name ||
                        entry.perceiverCharacterId ||
                        'Sin personaje';
                      return (
                        <div key={`${selectedEvent.id}-reveal-${index}`} className="timeline-detail-stack">
                          <strong>{secretTitle}</strong>
                          <span>
                            {entry.truthMode} | {perceiverName}
                          </span>
                          <small>{entry.summary || 'Sin resumen.'}</small>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

export default TimelineView;
