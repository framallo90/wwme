import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';

import { normalizeCanonStatus } from '../lib/canon';
import type {
  SagaCharacter,
  SagaCharacterAlias,
  SagaCharacterVersion,
  SagaConlang,
  SagaConlangLexiconEntry,
  SagaEntityKind,
  SagaMagicSystem,
  SagaMetadata,
  SagaProject,
  SagaSecret,
  SagaTimelineArtifactTransfer,
  SagaTimelineCharacterImpact,
  SagaTimelineCharacterLocation,
  SagaTimelineChapterRef,
  SagaTimelineEvent,
  SagaTimelineLane,
  SagaTimelineSecretReveal,
  SagaWorldRelationship,
  SagaWorldBible,
  SagaWorldEntity,
} from '../types/book';
import {
  applyImpactDrivenVersioning,
  applyTimeskipToCharacterVersions,
  isKnownRelationshipType,
  renameSagaIdEverywhere,
  suggestCharacterLocationsForEvent,
  suggestArtifactTransferOwnersForEvent,
  suggestRelationshipTypes,
} from '../lib/sagaAutomation';
import { buildSagaConsistencyReport, type SagaConsistencyIssue } from '../lib/sagaConsistency';

interface SagaPanelProps {
  saga: SagaProject | null;
  chapterOptionsByBook: Record<string, Array<{ id: string; title: string }>>;
  onChange: (next: SagaMetadata) => void;
  onSave: () => void;
  onOpenBook: (bookPath: string) => void;
  onUpdateBookVolume: (bookPath: string, volumeNumber: number) => void;
  onMoveBook: (bookPath: string, direction: 'up' | 'down') => void;
}

type EntitySectionKey = 'locations' | 'routes' | 'flora' | 'fauna' | 'factions' | 'systems' | 'artifacts';
type SagaRefactorKind = SagaEntityKind | 'secret' | 'timeline-event';

function createLocalId(
  prefix: 'entity' | 'event' | 'alias' | 'version' | 'secret' | 'transfer' | 'location' | 'reveal',
): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAliasSummary(aliasTimeline: SagaCharacterAlias[], fallbackAliases = ''): string {
  const values = aliasTimeline.map((entry) => entry.value.trim()).filter(Boolean);
  if (values.length === 0) {
    return fallbackAliases;
  }

  return Array.from(new Set(values)).join(', ');
}

function parseOptionalNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createEmptyEntity(): SagaWorldEntity {
  return { id: createLocalId('entity'), name: '', aliases: '', summary: '', notes: '', canonStatus: 'canonical' };
}

function createEmptyCharacterAlias(): SagaCharacterAlias {
  return { id: createLocalId('alias'), value: '', type: 'public-name', startOrder: null, endOrder: null, notes: '' };
}

function createEmptyCharacter(): SagaCharacter {
  return {
    id: createLocalId('entity'),
    name: '',
    aliases: '',
    summary: '',
    notes: '',
    canonStatus: 'canonical',
    aliasTimeline: [],
    versions: [],
    lifecycle: {
      birthEventId: null,
      deathEventId: null,
      firstAppearanceEventId: null,
      lastKnownEventId: null,
      currentStatus: 'unknown',
    },
  };
}

function createEmptyTimelineEvent(order: number): SagaTimelineEvent {
  return {
    id: createLocalId('event'),
    title: '',
    category: 'other',
    kind: 'point',
    startOrder: order,
    endOrder: null,
    laneId: 'lane-main',
    laneLabel: 'Linea principal',
    eraLabel: 'Presente',
    displayLabel: '',
    summary: '',
    notes: '',
    bookRefs: [],
    entityIds: [],
    characterImpacts: [],
    artifactTransfers: [],
    characterLocations: [],
    secretReveals: [],
    objectiveTruth: '',
    perceivedTruth: '',
    timeJumpYears: null,
    canonStatus: 'canonical',
  };
}

function createEmptyTimelineBookRef(): SagaTimelineChapterRef {
  return {
    bookPath: '',
    chapterId: '',
    mode: 'occurs',
    locationId: '',
  };
}

function createEmptyTimelineCharacterImpact(): SagaTimelineCharacterImpact {
  return {
    characterId: '',
    impactType: 'other',
    aliasUsed: '',
    stateChange: '',
  };
}

function createEmptyCharacterVersion(): SagaCharacterVersion {
  return {
    id: createLocalId('version'),
    label: '',
    startOrder: null,
    endOrder: null,
    status: 'unknown',
    summary: '',
    notes: '',
  };
}

function createEmptySecret(): SagaSecret {
  return {
    id: createLocalId('secret'),
    title: '',
    summary: '',
    objectiveTruth: '',
    notes: '',
    relatedEntityIds: [],
    canonStatus: 'canonical',
  };
}

function createEmptyTimelineArtifactTransfer(): SagaTimelineArtifactTransfer {
  return {
    artifactId: '',
    fromCharacterId: '',
    toCharacterId: '',
    notes: '',
  };
}

function createEmptyTimelineCharacterLocation(): SagaTimelineCharacterLocation {
  return {
    characterId: '',
    locationId: '',
    notes: '',
  };
}

function createEmptyTimelineSecretReveal(): SagaTimelineSecretReveal {
  return {
    secretId: '',
    truthMode: 'perceived',
    perceiverCharacterId: '',
    summary: '',
  };
}

function createEmptyRelationship(): SagaWorldRelationship {
  return {
    id: createLocalId('entity'),
    from: {
      kind: 'character',
      id: '',
    },
    to: {
      kind: 'faction',
      id: '',
    },
    type: '',
    notes: '',
    startOrder: null,
    endOrder: null,
  };
}

function createEmptyTimelineLane(): SagaTimelineLane {
  return {
    id: createLocalId('entity'),
    label: '',
    color: '#1f5f8b',
    era: '',
    description: '',
  };
}

function createEmptyConlangLexiconEntry(): SagaConlangLexiconEntry {
  return {
    id: createLocalId('entity'),
    term: '',
    translation: '',
    notes: '',
  };
}

function createEmptyConlang(): SagaConlang {
  return {
    id: createLocalId('entity'),
    name: '',
    phonetics: '',
    grammarNotes: '',
    styleRules: '',
    sampleText: '',
    lexicon: [],
  };
}

function createEmptyMagicSystem(): SagaMagicSystem {
  return {
    id: createLocalId('entity'),
    name: '',
    summary: '',
    source: '',
    costs: '',
    limits: '',
    forbiddenActs: '',
    validationHints: '',
  };
}

const sagaCountFormatter = new Intl.NumberFormat('es-AR');

function formatSagaCount(value: number): string {
  return sagaCountFormatter.format(value);
}

function SagaPanel(props: SagaPanelProps) {
  type SagaTab = 'overview' | 'characters' | 'world' | 'secrets' | 'timeline' | 'relations' | 'rules';
  const [activeTab, setActiveTab] = useState<SagaTab>('overview');
  const [volumeDrafts, setVolumeDrafts] = useState<Record<string, string>>({});
  const [refactorKind, setRefactorKind] = useState<SagaRefactorKind>('character');
  const [refactorSourceId, setRefactorSourceId] = useState('');
  const [refactorTargetId, setRefactorTargetId] = useState('');
  const [autofillSourceByEventId, setAutofillSourceByEventId] = useState<Record<string, string>>({});
  const [timelineEntityDraftByEventId, setTimelineEntityDraftByEventId] = useState<Record<string, string>>({});
  const [secretEntityDraftBySecretId, setSecretEntityDraftBySecretId] = useState<Record<string, string>>({});
  const [showOnlyFlaggedEvents, setShowOnlyFlaggedEvents] = useState(false);
  const [draggedTimelineEventId, setDraggedTimelineEventId] = useState<string | null>(null);
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [issueCodeFilter, setIssueCodeFilter] = useState('all');
  const [issueEntityFilter, setIssueEntityFilter] = useState('');
  const [autofixPreviewIssueId, setAutofixPreviewIssueId] = useState<string | null>(null);
  const saga = props.saga;
  const worldBible = saga?.metadata.worldBible ?? null;
  const consistencyReport = useMemo(
    () =>
      saga
        ? buildSagaConsistencyReport(saga)
        : {
            issues: [],
            errorCount: 0,
            warningCount: 0,
          },
    [saga],
  );

  const issueCountByEventId = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>();
    for (const issue of consistencyReport.issues) {
      if (!issue.eventId) {
        continue;
      }
      const current = map.get(issue.eventId) ?? { errors: 0, warnings: 0 };
      if (issue.severity === 'error') {
        current.errors += 1;
      } else {
        current.warnings += 1;
      }
      map.set(issue.eventId, current);
    }
    return map;
  }, [consistencyReport.issues]);
  const issueCountByCharacterId = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>();
    for (const issue of consistencyReport.issues) {
      if (!issue.characterId) {
        continue;
      }
      const current = map.get(issue.characterId) ?? { errors: 0, warnings: 0 };
      if (issue.severity === 'error') {
        current.errors += 1;
      } else {
        current.warnings += 1;
      }
      map.set(issue.characterId, current);
    }
    return map;
  }, [consistencyReport.issues]);
  const visibleTimelineEvents = useMemo(() => {
    if (!worldBible) {
      return [];
    }
    if (!showOnlyFlaggedEvents) {
      return worldBible.timeline;
    }
    return worldBible.timeline.filter((entry) => issueCountByEventId.has(entry.id));
  }, [showOnlyFlaggedEvents, worldBible, issueCountByEventId]);
  const issueCodeOptions = useMemo(
    () => Array.from(new Set(consistencyReport.issues.map((issue) => issue.code))).sort(),
    [consistencyReport.issues],
  );
  const characterNameById = useMemo(
    () =>
      new Map(
        (worldBible?.characters ?? []).map((entry) => [
          entry.id,
          entry.name.trim() || entry.aliases.trim() || entry.id,
        ]),
      ),
    [worldBible?.characters],
  );
  const timelineEventById = useMemo(
    () => new Map((worldBible?.timeline ?? []).map((entry) => [entry.id, entry])),
    [worldBible?.timeline],
  );
  const timelineSortedByOrder = useMemo(
    () =>
      [...(worldBible?.timeline ?? [])].sort(
        (left, right) => left.startOrder - right.startOrder || left.title.localeCompare(right.title),
      ),
    [worldBible?.timeline],
  );
  const filteredIssues = useMemo(() => {
    const entitySearch = issueEntityFilter.trim().toLowerCase();
    return consistencyReport.issues.filter((issue) => {
      if (issueSeverityFilter !== 'all' && issue.severity !== issueSeverityFilter) {
        return false;
      }
      if (issueCodeFilter !== 'all' && issue.code !== issueCodeFilter) {
        return false;
      }
      if (entitySearch) {
        const haystack = `${issue.eventId ?? ''} ${issue.characterId ?? ''} ${issue.bookPath ?? ''} ${issue.message}`.toLowerCase();
        if (!haystack.includes(entitySearch)) {
          return false;
        }
      }
      return true;
    });
  }, [consistencyReport.issues, issueCodeFilter, issueEntityFilter, issueSeverityFilter]);
  const entityDomIdById = useMemo(() => {
    const map = new Map<string, string>();
    if (!worldBible) {
      return map;
    }

    for (const character of worldBible.characters) {
      map.set(character.id, `saga-character-${character.id}`);
    }
    for (const entry of worldBible.locations) {
      map.set(entry.id, `saga-entity-${entry.id}`);
    }
    for (const entry of worldBible.routes) {
      map.set(entry.id, `saga-entity-${entry.id}`);
    }
    for (const entry of worldBible.flora) {
      map.set(entry.id, `saga-entity-${entry.id}`);
    }
    for (const entry of worldBible.fauna) {
      map.set(entry.id, `saga-entity-${entry.id}`);
    }
    for (const entry of worldBible.factions) {
      map.set(entry.id, `saga-entity-${entry.id}`);
    }
    for (const entry of worldBible.systems) {
      map.set(entry.id, `saga-entity-${entry.id}`);
    }
    for (const entry of worldBible.artifacts) {
      map.set(entry.id, `saga-entity-${entry.id}`);
    }
    for (const entry of worldBible.timeline) {
      map.set(entry.id, `saga-event-${entry.id}`);
    }
    for (const entry of worldBible.secrets ?? []) {
      map.set(entry.id, `saga-secret-${entry.id}`);
    }
    return map;
  }, [worldBible]);

  if (!saga || !worldBible) {
    return (
      <section className="settings-view">
        <header>
          <h2>Sagas</h2>
          <p>Abri o crea una saga para empezar a construir la biblia ampliada del mundo.</p>
        </header>
      </section>
    );
  }
  const timelineOptions = worldBible.timeline.map((entry) => ({
    id: entry.id,
    label: `${entry.displayLabel || `T${entry.startOrder}`} | ${entry.title || 'Evento sin titulo'}`,
  }));
  const linkedBookOptions = saga.metadata.books.map((entry) => ({
    path: entry.bookPath,
    label: `${entry.volumeNumber ? `Vol. ${entry.volumeNumber} - ` : ''}${entry.title}`,
  }));
  const characterOptions = worldBible.characters.map((entry) => ({
    id: entry.id,
    label: entry.name || 'Personaje sin nombre',
  }));
  const locationOptions = worldBible.locations.map((entry) => ({
    id: entry.id,
    label: entry.name || 'Lugar sin nombre',
  }));
  const artifactOptions = worldBible.artifacts.map((entry) => ({
    id: entry.id,
    label: entry.name || 'Artefacto sin nombre',
  }));
  const secretOptions = (worldBible.secrets ?? []).map((entry) => ({
    id: entry.id,
    label: entry.title || 'Secreto sin titulo',
  }));
  const laneOptions = worldBible.timelineLanes.map((entry) => ({
    id: entry.id,
    label: entry.label || entry.id,
  }));
  const sagaTabs: Array<{ key: SagaTab; label: string; summary: string }> = [
    { key: 'overview', label: 'General', summary: 'Salud canonica, libros vinculados y estado global del mundo.' },
    { key: 'characters', label: `Personajes (${worldBible.characters.length})`, summary: 'Versiones, alias, linajes y ciclos de vida del reparto.' },
    { key: 'world', label: 'Mundo', summary: 'Lugares, rutas, facciones, sistemas y artefactos del archivo comun.' },
    { key: 'secrets', label: `Secretos (${worldBible.secrets?.length ?? 0})`, summary: 'Verdades objetivas, mentiras utiles y revelaciones controladas.' },
    { key: 'timeline', label: `Timeline (${worldBible.timeline.length})`, summary: 'Cronologia multirriel con impactos, dependencias y giros de era.' },
    { key: 'relations', label: `Relaciones (${worldBible.relationships.length})`, summary: 'Alianzas, tensiones, parentescos y deudas que atan la saga.' },
    { key: 'rules', label: 'Reglas / Glosario', summary: 'Leyes del mundo, glosario, conlangs y sistemas de poder.' },
  ];
  const activeTabMeta = sagaTabs.find((entry) => entry.key === activeTab) ?? sagaTabs[0];
  const sagaHealthCards = [
    {
      label: 'Libros',
      value: formatSagaCount(saga.metadata.books.length),
      note: `${formatSagaCount(saga.metadata.books.filter((entry) => entry.volumeNumber != null).length)} con volumen asignado`,
    },
    {
      label: 'Personajes',
      value: formatSagaCount(worldBible.characters.length),
      note: `${formatSagaCount(worldBible.relationships.length)} relaciones trazadas`,
    },
    {
      label: 'Timeline',
      value: formatSagaCount(worldBible.timeline.length),
      note: `${formatSagaCount(worldBible.timelineLanes.length)} carriles activos`,
    },
    {
      label: 'Alertas',
      value: formatSagaCount(consistencyReport.errorCount + consistencyReport.warningCount),
      note:
        consistencyReport.errorCount > 0
          ? `${formatSagaCount(consistencyReport.errorCount)} errores graves`
          : `${formatSagaCount(consistencyReport.warningCount)} avisos editoriales`,
    },
  ];
  const entityOptionsByKind: Record<SagaEntityKind, Array<{ id: string; label: string }>> = {
    character: characterOptions,
    location: locationOptions,
    route: worldBible.routes.map((entry) => ({ id: entry.id, label: entry.name || 'Ruta sin nombre' })),
    flora: worldBible.flora.map((entry) => ({ id: entry.id, label: entry.name || 'Flora sin nombre' })),
    fauna: worldBible.fauna.map((entry) => ({ id: entry.id, label: entry.name || 'Fauna sin nombre' })),
    faction: worldBible.factions.map((entry) => ({ id: entry.id, label: entry.name || 'Faccion sin nombre' })),
    system: worldBible.systems.map((entry) => ({ id: entry.id, label: entry.name || 'Sistema sin nombre' })),
    artifact: artifactOptions,
  };
  const timelineEntityOptions = [
    ...characterOptions.map((entry) => ({ id: entry.id, label: `Personaje | ${entry.label}` })),
    ...locationOptions.map((entry) => ({ id: entry.id, label: `Lugar | ${entry.label}` })),
    ...worldBible.routes.map((entry) => ({ id: entry.id, label: `Ruta | ${entry.name || entry.id}` })),
    ...worldBible.flora.map((entry) => ({ id: entry.id, label: `Flora | ${entry.name || entry.id}` })),
    ...worldBible.fauna.map((entry) => ({ id: entry.id, label: `Fauna | ${entry.name || entry.id}` })),
    ...worldBible.factions.map((entry) => ({ id: entry.id, label: `Faccion | ${entry.name || entry.id}` })),
    ...worldBible.systems.map((entry) => ({ id: entry.id, label: `Sistema | ${entry.name || entry.id}` })),
    ...artifactOptions.map((entry) => ({ id: entry.id, label: `Artefacto | ${entry.label}` })),
  ];
  const timelineEntityLabelById = new Map(timelineEntityOptions.map((entry) => [entry.id, entry.label]));
  const refactorOptionsByKind: Record<SagaRefactorKind, Array<{ id: string; label: string }>> = {
    ...entityOptionsByKind,
    secret: (worldBible.secrets ?? []).map((entry) => ({ id: entry.id, label: entry.title || entry.id })),
    'timeline-event': worldBible.timeline.map((entry) => ({
      id: entry.id,
      label: `${entry.displayLabel || `T${entry.startOrder}`} | ${entry.title || entry.id}`,
    })),
  };

  const updateWorldBible = (patch: Partial<SagaWorldBible>): void => {
    props.onChange({
      ...saga.metadata,
      worldBible: {
        ...worldBible,
        ...patch,
      },
    });
  };

  const updateEntity = (section: EntitySectionKey, id: string, patch: Partial<SagaWorldEntity>): void => {
    updateWorldBible({
      [section]: worldBible[section].map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    } as Partial<SagaWorldBible>);
  };

  const updateCharacter = (id: string, patch: Partial<SagaCharacter>): void => {
    updateWorldBible({
      characters: worldBible.characters.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        const aliasTimeline = patch.aliasTimeline ?? entry.aliasTimeline;
        return {
          ...entry,
          ...patch,
          aliasTimeline,
          aliases: buildAliasSummary(aliasTimeline, patch.aliasTimeline === undefined ? entry.aliases : ''),
        };
      }),
    });
  };

  const updateTimelineEvent = (id: string, patch: Partial<SagaTimelineEvent>): void => {
    updateWorldBible({
      timeline: worldBible.timeline
        .map((entry) => {
          if (entry.id !== id) {
            return entry;
          }

          const nextKind = patch.kind ?? entry.kind;
          const nextStart = patch.startOrder ?? entry.startOrder;
          const nextEnd = patch.endOrder === undefined ? entry.endOrder : patch.endOrder;

          return {
            ...entry,
            ...patch,
            kind: nextKind,
            startOrder: nextStart,
            endOrder: nextKind === 'span' ? Math.max(nextStart, nextEnd ?? nextStart) : null,
          };
        })
        .sort((a, b) => a.startOrder - b.startOrder || a.title.localeCompare(b.title)),
    });
  };

  const updateTimelineLane = (id: string, patch: Partial<SagaTimelineLane>): void => {
    updateWorldBible({
      timelineLanes: worldBible.timelineLanes.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const updateConlang = (id: string, patch: Partial<SagaConlang>): void => {
    updateWorldBible({
      conlangs: worldBible.conlangs.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const updateConlangLexiconEntry = (
    conlangId: string,
    entryId: string,
    patch: Partial<SagaConlangLexiconEntry>,
  ): void => {
    updateWorldBible({
      conlangs: worldBible.conlangs.map((entry) =>
        entry.id === conlangId
          ? {
              ...entry,
              lexicon: entry.lexicon.map((term) => (term.id === entryId ? { ...term, ...patch } : term)),
            }
          : entry,
      ),
    });
  };

  const updateMagicSystem = (id: string, patch: Partial<SagaMagicSystem>): void => {
    updateWorldBible({
      magicSystems: worldBible.magicSystems.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const normalizeTimelineSequence = (timeline: SagaTimelineEvent[]): SagaTimelineEvent[] =>
    timeline
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

  const moveTimelineEventBefore = (draggedEventId: string, targetEventId: string): void => {
    const normalizedDraggedId = draggedEventId.trim();
    const normalizedTargetId = targetEventId.trim();
    if (!normalizedDraggedId || !normalizedTargetId || normalizedDraggedId === normalizedTargetId) {
      return;
    }

    const orderedTimeline = [...worldBible.timeline].sort(
      (left, right) => left.startOrder - right.startOrder || left.title.localeCompare(right.title),
    );
    const sourceIndex = orderedTimeline.findIndex((entry) => entry.id === normalizedDraggedId);
    const targetIndex = orderedTimeline.findIndex((entry) => entry.id === normalizedTargetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextTimeline = [...orderedTimeline];
    const [moved] = nextTimeline.splice(sourceIndex, 1);
    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextTimeline.splice(insertIndex, 0, moved);

    updateWorldBible({
      timeline: normalizeTimelineSequence(nextTimeline),
    });
  };

  const handleTimelineDragStart = (eventId: string): void => {
    if (showOnlyFlaggedEvents) {
      return;
    }
    setDraggedTimelineEventId(eventId);
  };

  const handleTimelineDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!draggedTimelineEventId || showOnlyFlaggedEvents) {
      return;
    }
    event.preventDefault();
  };

  const handleTimelineDrop = (targetEventId: string): void => {
    if (!draggedTimelineEventId || showOnlyFlaggedEvents) {
      return;
    }
    moveTimelineEventBefore(draggedTimelineEventId, targetEventId);
    setDraggedTimelineEventId(null);
  };

  const handleTimelineDragEnd = (): void => {
    setDraggedTimelineEventId(null);
  };

  const updateRelationship = (id: string, patch: Partial<SagaWorldRelationship>): void => {
    updateWorldBible({
      relationships: worldBible.relationships.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const updateRelationshipRef = (
    id: string,
    side: 'from' | 'to',
    patch: Partial<SagaWorldRelationship['from']>,
  ): void => {
    updateWorldBible({
      relationships: worldBible.relationships.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        const nextRef = {
          ...entry[side],
          ...patch,
        };

        if (patch.kind && patch.kind !== entry[side].kind) {
          nextRef.id = '';
        }

        return {
          ...entry,
          [side]: nextRef,
        };
      }),
    });
  };

  const updateTimelineBookRefs = (eventId: string, nextBookRefs: SagaTimelineChapterRef[]): void => {
    updateTimelineEvent(eventId, { bookRefs: nextBookRefs });
  };

  const updateTimelineEntityDraft = (eventId: string, entityId: string): void => {
    setTimelineEntityDraftByEventId((previous) => ({
      ...previous,
      [eventId]: entityId,
    }));
  };

  const addTimelineEntityRelation = (eventId: string): void => {
    const targetEvent = timelineEventById.get(eventId);
    if (!targetEvent) {
      return;
    }

    const selectedEntityId = timelineEntityDraftByEventId[eventId]?.trim() ?? '';
    const fallbackEntityId =
      timelineEntityOptions.find((entry) => !targetEvent.entityIds.includes(entry.id))?.id ?? '';
    const nextEntityId = selectedEntityId || fallbackEntityId;
    if (!nextEntityId || targetEvent.entityIds.includes(nextEntityId)) {
      return;
    }

    updateTimelineEvent(eventId, {
      entityIds: [...targetEvent.entityIds, nextEntityId],
    });

    updateTimelineEntityDraft(eventId, '');
  };

  const removeTimelineEntityRelation = (eventId: string, entityId: string): void => {
    const targetEvent = timelineEventById.get(eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineEvent(eventId, {
      entityIds: targetEvent.entityIds.filter((entry) => entry !== entityId),
    });
  };

  const updateSecretEntityDraft = (secretId: string, entityId: string): void => {
    setSecretEntityDraftBySecretId((previous) => ({
      ...previous,
      [secretId]: entityId,
    }));
  };

  const addSecretRelatedEntity = (secretId: string): void => {
    const targetSecret = (worldBible.secrets ?? []).find((entry) => entry.id === secretId);
    if (!targetSecret) {
      return;
    }

    const selectedEntityId = secretEntityDraftBySecretId[secretId]?.trim() ?? '';
    const fallbackEntityId =
      timelineEntityOptions.find((entry) => !targetSecret.relatedEntityIds.includes(entry.id))?.id ?? '';
    const nextEntityId = selectedEntityId || fallbackEntityId;
    if (!nextEntityId || targetSecret.relatedEntityIds.includes(nextEntityId)) {
      return;
    }

    updateSecret(secretId, {
      relatedEntityIds: [...targetSecret.relatedEntityIds, nextEntityId],
    });
    updateSecretEntityDraft(secretId, '');
  };

  const removeSecretRelatedEntity = (secretId: string, entityId: string): void => {
    const targetSecret = (worldBible.secrets ?? []).find((entry) => entry.id === secretId);
    if (!targetSecret) {
      return;
    }

    updateSecret(secretId, {
      relatedEntityIds: targetSecret.relatedEntityIds.filter((entry) => entry !== entityId),
    });
  };

  const getAutofillSourceEventId = (eventId: string): string => {
    if (Object.prototype.hasOwnProperty.call(autofillSourceByEventId, eventId)) {
      const selectedEventId = autofillSourceByEventId[eventId]?.trim() ?? '';
      if (selectedEventId && selectedEventId !== eventId && timelineEventById.has(selectedEventId)) {
        return selectedEventId;
      }
      return '';
    }

    const currentEvent = timelineEventById.get(eventId);
    if (!currentEvent) {
      return '';
    }

    const previousCandidates = timelineSortedByOrder.filter(
      (entry) => entry.id !== eventId && entry.startOrder <= currentEvent.startOrder,
    );
    if (previousCandidates.length > 0) {
      return previousCandidates[previousCandidates.length - 1].id;
    }

    const firstOtherEvent = timelineSortedByOrder.find((entry) => entry.id !== eventId);
    return firstOtherEvent?.id ?? '';
  };

  const updateAutofillSourceEvent = (eventId: string, sourceEventId: string): void => {
    setAutofillSourceByEventId((previous) => ({
      ...previous,
      [eventId]: sourceEventId,
    }));
  };

  const buildTimelineBookRefSignature = (entry: SagaTimelineChapterRef): string => {
    const locationId = (entry.locationId ?? '').trim();
    return `${entry.bookPath.trim()}|${entry.chapterId.trim()}|${entry.mode}|${locationId}`;
  };

  const normalizeTimelineBookRef = (entry: SagaTimelineChapterRef): SagaTimelineChapterRef => ({
    ...entry,
    bookPath: entry.bookPath.trim(),
    chapterId: entry.chapterId.trim(),
    locationId: (entry.locationId ?? '').trim(),
  });

  const buildTimelineCharacterImpactSignature = (entry: SagaTimelineCharacterImpact): string =>
    `${entry.characterId.trim()}|${entry.impactType}|${entry.aliasUsed.trim()}|${entry.stateChange.trim()}`;

  const normalizeTimelineCharacterImpact = (
    entry: SagaTimelineCharacterImpact,
  ): SagaTimelineCharacterImpact => ({
    ...entry,
    characterId: entry.characterId.trim(),
    aliasUsed: entry.aliasUsed.trim(),
    stateChange: entry.stateChange.trim(),
  });

  const buildTimelineCharacterLocationSignature = (entry: SagaTimelineCharacterLocation): string =>
    `${entry.characterId.trim()}|${entry.locationId.trim()}`;

  const normalizeTimelineCharacterLocation = (
    entry: SagaTimelineCharacterLocation,
  ): SagaTimelineCharacterLocation => ({
    ...entry,
    characterId: entry.characterId.trim(),
    locationId: entry.locationId.trim(),
    notes: entry.notes.trim(),
  });

  const buildTimelineArtifactTransferSignature = (
    entry: SagaTimelineArtifactTransfer,
  ): string =>
    `${entry.artifactId.trim()}|${entry.fromCharacterId.trim()}|${entry.toCharacterId.trim()}`;

  const normalizeTimelineArtifactTransfer = (
    entry: SagaTimelineArtifactTransfer,
  ): SagaTimelineArtifactTransfer => ({
    ...entry,
    artifactId: entry.artifactId.trim(),
    fromCharacterId: entry.fromCharacterId.trim(),
    toCharacterId: entry.toCharacterId.trim(),
    notes: entry.notes.trim(),
  });

  const mergeUniqueBySignature = <T,>(
    baseEntries: T[],
    incomingEntries: T[],
    getSignature: (entry: T) => string,
  ): T[] => {
    const merged = [...baseEntries];
    const signatures = new Set(baseEntries.map(getSignature));
    for (const entry of incomingEntries) {
      const signature = getSignature(entry);
      if (signatures.has(signature)) {
        continue;
      }
      signatures.add(signature);
      merged.push(entry);
    }
    return merged;
  };

  const autofillTimelineBookRefsFromEvent = (eventId: string): void => {
    const targetEvent = timelineEventById.get(eventId);
    const sourceEventId = getAutofillSourceEventId(eventId);
    const sourceEvent = timelineEventById.get(sourceEventId);
    if (!targetEvent || !sourceEvent) {
      return;
    }

    const incomingRows = sourceEvent.bookRefs
      .map(normalizeTimelineBookRef)
      .filter((entry) => entry.bookPath || entry.chapterId);
    const mergedRows = mergeUniqueBySignature(
      targetEvent.bookRefs,
      incomingRows,
      buildTimelineBookRefSignature,
    );
    if (mergedRows.length === targetEvent.bookRefs.length) {
      return;
    }
    updateTimelineBookRefs(eventId, mergedRows);
  };

  const autofillTimelineCharacterImpactsFromEvent = (eventId: string): void => {
    const targetEvent = timelineEventById.get(eventId);
    const sourceEventId = getAutofillSourceEventId(eventId);
    const sourceEvent = timelineEventById.get(sourceEventId);
    if (!targetEvent || !sourceEvent) {
      return;
    }

    const incomingRows = sourceEvent.characterImpacts
      .map(normalizeTimelineCharacterImpact)
      .filter((entry) => entry.characterId);
    const mergedRows = mergeUniqueBySignature(
      targetEvent.characterImpacts,
      incomingRows,
      buildTimelineCharacterImpactSignature,
    );
    if (mergedRows.length === targetEvent.characterImpacts.length) {
      return;
    }
    updateTimelineCharacterImpacts(eventId, mergedRows);
  };

  const generateTimelineCharacterImpactsFromEntities = (eventId: string): void => {
    const targetEvent = timelineEventById.get(eventId);
    if (!targetEvent) {
      return;
    }

    const existingCharacterIds = new Set(
      targetEvent.characterImpacts.map((entry) => entry.characterId.trim()).filter(Boolean),
    );

    const generatedRows: SagaTimelineCharacterImpact[] = [];
    for (const entityId of targetEvent.entityIds) {
      const normalizedId = entityId.trim();
      if (!normalizedId || !characterNameById.has(normalizedId) || existingCharacterIds.has(normalizedId)) {
        continue;
      }

      generatedRows.push({
        characterId: normalizedId,
        impactType: 'appearance',
        aliasUsed: characterNameById.get(normalizedId) ?? '',
        stateChange: `Impacto generado automaticamente desde entidades en ${targetEvent.displayLabel || targetEvent.title || targetEvent.id}`,
      });
      existingCharacterIds.add(normalizedId);
    }

    if (generatedRows.length === 0) {
      return;
    }

    updateTimelineCharacterImpacts(eventId, [...targetEvent.characterImpacts, ...generatedRows]);
  };

  const autofillTimelineEventMetadata = (eventId: string): void => {
    const targetEvent = timelineEventById.get(eventId);
    if (!targetEvent) {
      return;
    }

    const sourceEventId = getAutofillSourceEventId(eventId);
    const sourceEvent = timelineEventById.get(sourceEventId);

    const sourceBookRefs = (sourceEvent?.bookRefs ?? [])
      .map(normalizeTimelineBookRef)
      .filter((entry) => entry.bookPath || entry.chapterId);
    const mergedBookRefs = mergeUniqueBySignature(
      targetEvent.bookRefs,
      sourceBookRefs,
      buildTimelineBookRefSignature,
    );

    const sourceImpacts = (sourceEvent?.characterImpacts ?? [])
      .map(normalizeTimelineCharacterImpact)
      .filter((entry) => entry.characterId);
    const mergedImpactsFromSource = mergeUniqueBySignature(
      targetEvent.characterImpacts,
      sourceImpacts,
      buildTimelineCharacterImpactSignature,
    );

    const touchedCharacterIds = new Set(
      mergedImpactsFromSource.map((entry) => entry.characterId.trim()).filter(Boolean),
    );
    const generatedImpacts: SagaTimelineCharacterImpact[] = [];
    for (const entityId of targetEvent.entityIds) {
      const normalizedId = entityId.trim();
      if (!normalizedId || !characterNameById.has(normalizedId) || touchedCharacterIds.has(normalizedId)) {
        continue;
      }
      generatedImpacts.push({
        characterId: normalizedId,
        impactType: 'appearance',
        aliasUsed: characterNameById.get(normalizedId) ?? '',
        stateChange: `Impacto generado automaticamente desde entidades en ${targetEvent.displayLabel || targetEvent.title || targetEvent.id}`,
      });
      touchedCharacterIds.add(normalizedId);
    }
    const mergedImpacts = mergeUniqueBySignature(
      mergedImpactsFromSource,
      generatedImpacts,
      buildTimelineCharacterImpactSignature,
    );

    const locationSuggestions = suggestCharacterLocationsForEvent(worldBible, eventId)
      .map(normalizeTimelineCharacterLocation)
      .filter((entry) => entry.characterId && entry.locationId);
    const mergedLocations = mergeUniqueBySignature(
      (targetEvent.characterLocations ?? []).map(normalizeTimelineCharacterLocation),
      locationSuggestions,
      buildTimelineCharacterLocationSignature,
    );

    const sourceTransfers = (sourceEvent?.artifactTransfers ?? [])
      .map(normalizeTimelineArtifactTransfer)
      .filter((entry) => entry.artifactId);
    const mergedTransfersFromSource = mergeUniqueBySignature(
      (targetEvent.artifactTransfers ?? []).map(normalizeTimelineArtifactTransfer),
      sourceTransfers,
      buildTimelineArtifactTransferSignature,
    );
    const projectedWorldBible: SagaWorldBible = {
      ...worldBible,
      timeline: worldBible.timeline.map((entry) =>
        entry.id === eventId ? { ...entry, artifactTransfers: mergedTransfersFromSource } : entry,
      ),
    };
    const completedTransfers = suggestArtifactTransferOwnersForEvent(projectedWorldBible, eventId).map(
      normalizeTimelineArtifactTransfer,
    );

    updateTimelineEvent(eventId, {
      bookRefs: mergedBookRefs,
      characterImpacts: mergedImpacts,
      characterLocations: mergedLocations,
      artifactTransfers: completedTransfers,
    });
  };

  const updateTimelineBookRef = (eventId: string, index: number, patch: Partial<SagaTimelineChapterRef>): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const requestedBookPath =
      patch.bookPath !== undefined ? patch.bookPath : targetEvent.bookRefs[index]?.bookPath ?? '';
    const requestedChapterId =
      patch.chapterId !== undefined ? patch.chapterId : targetEvent.bookRefs[index]?.chapterId ?? '';
    const chapterOptions = props.chapterOptionsByBook[requestedBookPath] ?? [];
    const shouldSuggestChapter =
      patch.bookPath !== undefined &&
      patch.chapterId === undefined &&
      !requestedChapterId &&
      chapterOptions.length > 0;

    const normalizedPatch: Partial<SagaTimelineChapterRef> = shouldSuggestChapter
      ? {
          ...patch,
          chapterId: chapterOptions[0]?.id ?? '',
        }
      : patch;

    updateTimelineBookRefs(
      eventId,
      targetEvent.bookRefs.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...normalizedPatch } : entry,
      ),
    );
  };

  const addTimelineBookRef = (eventId: string): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const sourceEvent = timelineEventById.get(getAutofillSourceEventId(eventId));
    const sourceRef = sourceEvent?.bookRefs[0];
    const defaultBookPath = sourceRef?.bookPath?.trim() || linkedBookOptions[0]?.path || '';
    const defaultChapterOptions = props.chapterOptionsByBook[defaultBookPath] ?? [];

    const nextRef: SagaTimelineChapterRef = sourceRef
      ? {
          ...sourceRef,
          bookPath: sourceRef.bookPath.trim(),
          chapterId: sourceRef.chapterId.trim(),
          locationId: (sourceRef.locationId ?? '').trim(),
        }
      : {
          ...createEmptyTimelineBookRef(),
          bookPath: defaultBookPath,
          chapterId: defaultChapterOptions[0]?.id ?? '',
        };

    updateTimelineBookRefs(eventId, [...targetEvent.bookRefs, nextRef]);
  };

  const removeTimelineBookRef = (eventId: string, index: number): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineBookRefs(
      eventId,
      targetEvent.bookRefs.filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const updateTimelineCharacterImpacts = (
    eventId: string,
    nextImpacts: SagaTimelineCharacterImpact[],
  ): void => {
    updateTimelineEvent(eventId, { characterImpacts: nextImpacts });
  };

  const updateTimelineCharacterImpact = (
    eventId: string,
    index: number,
    patch: Partial<SagaTimelineCharacterImpact>,
  ): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineCharacterImpacts(
      eventId,
      targetEvent.characterImpacts.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const addTimelineCharacterImpact = (eventId: string): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const sourceEvent = timelineEventById.get(getAutofillSourceEventId(eventId));
    const sourceImpact = sourceEvent?.characterImpacts[0];
    const firstCharacterEntityId =
      targetEvent.entityIds.find((entityId) => characterNameById.has(entityId.trim()))?.trim() ?? '';

    const nextImpact: SagaTimelineCharacterImpact = sourceImpact
      ? {
          ...sourceImpact,
          characterId: sourceImpact.characterId.trim(),
          aliasUsed: sourceImpact.aliasUsed.trim(),
          stateChange: sourceImpact.stateChange.trim(),
        }
      : firstCharacterEntityId
        ? {
            characterId: firstCharacterEntityId,
            impactType: 'appearance',
            aliasUsed: characterNameById.get(firstCharacterEntityId) ?? '',
            stateChange: `Impacto inicial sugerido para ${targetEvent.displayLabel || targetEvent.title || targetEvent.id}`,
          }
        : createEmptyTimelineCharacterImpact();

    updateTimelineCharacterImpacts(
      eventId,
      [...targetEvent.characterImpacts, nextImpact],
    );
  };

  const removeTimelineCharacterImpact = (eventId: string, index: number): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineCharacterImpacts(
      eventId,
      targetEvent.characterImpacts.filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const applyImpactVersionAutomation = (eventId: string): void => {
    const nextWorldBible = applyImpactDrivenVersioning(worldBible, eventId);
    updateWorldBible(nextWorldBible);
  };

  const updateSecret = (id: string, patch: Partial<SagaSecret>): void => {
    updateWorldBible({
      secrets: (worldBible.secrets ?? []).map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const updateTimelineArtifactTransfers = (
    eventId: string,
    nextTransfers: SagaTimelineArtifactTransfer[],
  ): void => {
    updateTimelineEvent(eventId, { artifactTransfers: nextTransfers });
  };

  const updateTimelineArtifactTransfer = (
    eventId: string,
    index: number,
    patch: Partial<SagaTimelineArtifactTransfer>,
  ): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineArtifactTransfers(
      eventId,
      (targetEvent.artifactTransfers ?? []).map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const addTimelineArtifactTransfer = (eventId: string): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const sourceEvent = timelineEventById.get(getAutofillSourceEventId(eventId));
    const sourceTransfer = sourceEvent?.artifactTransfers?.[0];
    const fallbackArtifactId = artifactOptions[0]?.id ?? '';
    const nextTransfer: SagaTimelineArtifactTransfer = sourceTransfer
      ? normalizeTimelineArtifactTransfer(sourceTransfer)
      : {
          ...createEmptyTimelineArtifactTransfer(),
          artifactId: fallbackArtifactId,
        };

    updateTimelineArtifactTransfers(
      eventId,
      [...(targetEvent.artifactTransfers ?? []), nextTransfer],
    );
  };

  const suggestTimelineArtifactTransferOwners = (eventId: string): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const suggestedTransfers = suggestArtifactTransferOwnersForEvent(worldBible, eventId);
    updateTimelineArtifactTransfers(eventId, suggestedTransfers);
  };

  const removeTimelineArtifactTransfer = (eventId: string, index: number): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineArtifactTransfers(
      eventId,
      (targetEvent.artifactTransfers ?? []).filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const applyTimeskipAutomation = (eventId: string): void => {
    const event = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!event) {
      return;
    }

    const jumpYears = Number(event.timeJumpYears ?? 0);
    if (!Number.isFinite(jumpYears) || jumpYears <= 0) {
      return;
    }

    const nextWorldBible = applyTimeskipToCharacterVersions(worldBible, eventId, jumpYears);
    updateWorldBible(nextWorldBible);
  };

  const applySafeIdRefactor = (): void => {
    const sourceId = refactorSourceId.trim();
    const targetId = refactorTargetId.trim();
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const nextWorldBible = renameSagaIdEverywhere(worldBible, refactorKind, sourceId, targetId);
    updateWorldBible(nextWorldBible);
    setRefactorSourceId(targetId);
  };

  const jumpToIssueContext = (issue: SagaConsistencyIssue): void => {
    const targetEventId = issue.eventId ? `saga-event-${issue.eventId}` : '';
    const targetCharacterId = issue.characterId ? `saga-character-${issue.characterId}` : '';
    const targetId = targetEventId || targetCharacterId;
    if (!targetId) {
      return;
    }
    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const jumpToEntityContext = (entityId: string): void => {
    const normalizedId = entityId.trim();
    if (!normalizedId) {
      return;
    }
    const targetId = entityDomIdById.get(normalizedId);
    if (!targetId) {
      return;
    }
    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const canApplySuggestedFixForIssue = (issue: SagaConsistencyIssue): boolean => {
    switch (issue.code) {
      case 'character-mentioned-after-death':
        return false;
      default:
        return true;
    }
  };

  const buildAutofixPreviewSteps = (issue: SagaConsistencyIssue): string[] => {
    switch (issue.code) {
      case 'missing-event-ref':
        return ['Crear evento placeholder con el ID faltante.', 'Revalidar lifecycle y referencias relacionadas.'];
      case 'missing-book-ref':
        return ['Reasignar referencias a un libro vinculado valido.', 'Completar capitulo sugerido para evitar referencias huerfanas.'];
      case 'missing-character-ref':
        return ['Crear personaje placeholder con ID faltante.', 'Reaplicar autocompletado del evento para completar metadatos.'];
      case 'missing-location-ref':
        return ['Crear o reasignar ubicacion faltante en referencias/ubicaciones del evento.'];
      case 'missing-artifact-ref':
        return ['Crear o reasignar artefacto faltante en transferencias.'];
      case 'missing-secret-ref':
        return ['Crear o reasignar secreto faltante en revelaciones.'];
      case 'missing-entity-ref':
        return ['Crear placeholders de entidades faltantes usadas en relaciones.'];
      case 'alias-out-of-range':
      case 'alias-context-mismatch':
        return ['Ajustar rango de alias o crear alias temporal para cubrir el evento.'];
      case 'character-before-birth':
        return ['Mover nacimiento del personaje al evento conflictivo.', 'Normalizar lifecycle (primera/ultima aparicion).'];
      case 'character-after-death':
        return ['Mover muerte del personaje al evento conflictivo.', 'Normalizar lifecycle para evitar inconsistencias secundarias.'];
      case 'invalid-lifecycle-order':
        return ['Reordenar lifecycle para mantener nacimiento <= muerte y apariciones validas.'];
      case 'character-version-overlap':
        return ['Recortar rangos de versiones superpuestas para evitar solapes.'];
      case 'artifact-owner-mismatch':
        return ['Autocompletar origen de transferencia usando propietario previo detectado.'];
      case 'impossible-travel':
        return ['Alinear ubicacion del personaje con continuidad previa para evitar viaje imposible.'];
      case 'character-mentioned-after-death':
        return ['Sin autofix automatico: requiere decision narrativa (mencion historica vs inconsistencia).'];
      default:
        return ['Aplicar autocompletado del evento y revalidar coherencia.'];
    }
  };

  const applySuggestedFixForIssue = (issue: SagaConsistencyIssue): void => {
    setAutofixPreviewIssueId(null);
    const issueEvent = issue.eventId ? timelineEventById.get(issue.eventId) ?? null : null;
    const linkedBookPathSet = new Set(saga.metadata.books.map((entry) => entry.bookPath));
    const fallbackBookPath = saga.metadata.books[0]?.bookPath ?? '';
    const fallbackLocationId = worldBible.locations[0]?.id ?? '';
    const fallbackArtifactId = worldBible.artifacts[0]?.id ?? '';
    const fallbackSecretId = (worldBible.secrets ?? [])[0]?.id ?? '';
    const fallbackCharacterId = worldBible.characters[0]?.id ?? '';

    const ensureTimelineEventExists = (eventId: string): void => {
      const normalizedEventId = eventId.trim();
      if (!normalizedEventId || timelineEventById.has(normalizedEventId)) {
        return;
      }

      const nextOrder =
        worldBible.timeline.reduce((maxOrder, entry) => Math.max(maxOrder, entry.startOrder), 0) + 1;
      updateWorldBible({
        timeline: [...worldBible.timeline, {
          ...createEmptyTimelineEvent(nextOrder),
          id: normalizedEventId,
          title: `Evento pendiente (${normalizedEventId})`,
          displayLabel: `AUTO-${nextOrder}`,
          summary: 'Creado automaticamente desde autofix de referencia faltante.',
        }].sort((left, right) => left.startOrder - right.startOrder || left.title.localeCompare(right.title)),
      });
    };

    const ensureCharacterExists = (characterId: string): void => {
      const normalizedCharacterId = characterId.trim();
      if (!normalizedCharacterId || worldBible.characters.some((entry) => entry.id === normalizedCharacterId)) {
        return;
      }

      updateWorldBible({
        characters: [
          ...worldBible.characters,
          {
            ...createEmptyCharacter(),
            id: normalizedCharacterId,
            name: `Pendiente ${normalizedCharacterId}`,
            summary: 'Personaje creado automaticamente por autofix.',
          },
        ],
      });
    };

    const ensureLocationExists = (locationId: string): void => {
      const normalizedLocationId = locationId.trim();
      if (!normalizedLocationId || worldBible.locations.some((entry) => entry.id === normalizedLocationId)) {
        return;
      }

      updateWorldBible({
        locations: [
          ...worldBible.locations,
          {
            ...createEmptyEntity(),
            id: normalizedLocationId,
            name: `Ubicacion pendiente ${normalizedLocationId}`,
            summary: 'Ubicacion creada automaticamente por autofix.',
          },
        ],
      });
    };

    const ensureArtifactExists = (artifactId: string): void => {
      const normalizedArtifactId = artifactId.trim();
      if (!normalizedArtifactId || worldBible.artifacts.some((entry) => entry.id === normalizedArtifactId)) {
        return;
      }

      updateWorldBible({
        artifacts: [
          ...worldBible.artifacts,
          {
            ...createEmptyEntity(),
            id: normalizedArtifactId,
            name: `Artefacto pendiente ${normalizedArtifactId}`,
            summary: 'Artefacto creado automaticamente por autofix.',
          },
        ],
      });
    };

    const ensureSecretExists = (secretId: string): void => {
      const normalizedSecretId = secretId.trim();
      if (!normalizedSecretId || (worldBible.secrets ?? []).some((entry) => entry.id === normalizedSecretId)) {
        return;
      }

      updateWorldBible({
        secrets: [
          ...(worldBible.secrets ?? []),
          {
            ...createEmptySecret(),
            id: normalizedSecretId,
            title: `Secreto pendiente ${normalizedSecretId}`,
            summary: 'Secreto creado automaticamente por autofix.',
          },
        ],
      });
    };

    const resolveEventOrder = (eventId: string | null): number => {
      if (!eventId) {
        return Number.POSITIVE_INFINITY;
      }
      return timelineEventById.get(eventId)?.startOrder ?? Number.POSITIVE_INFINITY;
    };

    const normalizeCharacterLifecycle = (characterId: string): void => {
      const character = worldBible.characters.find((entry) => entry.id === characterId);
      if (!character) {
        return;
      }

      let nextLifecycle = { ...character.lifecycle };
      const birthOrder = resolveEventOrder(nextLifecycle.birthEventId);
      const deathOrder = resolveEventOrder(nextLifecycle.deathEventId);
      if (Number.isFinite(birthOrder) && Number.isFinite(deathOrder) && birthOrder > deathOrder) {
        const previousBirth = nextLifecycle.birthEventId;
        nextLifecycle = {
          ...nextLifecycle,
          birthEventId: nextLifecycle.deathEventId,
          deathEventId: previousBirth,
        };
      }

      const nextBirthOrder = resolveEventOrder(nextLifecycle.birthEventId);
      const firstAppearanceOrder = resolveEventOrder(nextLifecycle.firstAppearanceEventId);
      if (Number.isFinite(nextBirthOrder) && Number.isFinite(firstAppearanceOrder) && firstAppearanceOrder < nextBirthOrder) {
        nextLifecycle = {
          ...nextLifecycle,
          firstAppearanceEventId: nextLifecycle.birthEventId,
        };
      }

      const nextDeathOrder = resolveEventOrder(nextLifecycle.deathEventId);
      const lastKnownOrder = resolveEventOrder(nextLifecycle.lastKnownEventId);
      if (Number.isFinite(nextDeathOrder) && Number.isFinite(lastKnownOrder) && lastKnownOrder > nextDeathOrder) {
        nextLifecycle = {
          ...nextLifecycle,
          lastKnownEventId: nextLifecycle.deathEventId,
        };
      }

      updateCharacter(characterId, { lifecycle: nextLifecycle });
    };

    const fixAliasRangeForIssue = (): void => {
      if (!issueEvent || !issue.characterId) {
        return;
      }

      const character = worldBible.characters.find((entry) => entry.id === issue.characterId);
      if (!character) {
        return;
      }

      const impactedAliases = issueEvent.characterImpacts
        .filter((entry) => entry.characterId === character.id)
        .map((entry) => entry.aliasUsed.trim())
        .filter(Boolean);
      if (impactedAliases.length === 0) {
        return;
      }

      const nextAliasTimeline = [...character.aliasTimeline];
      for (const aliasValue of impactedAliases) {
        const aliasIndex = nextAliasTimeline.findIndex(
          (entry) => entry.value.trim().toLowerCase() === aliasValue.toLowerCase(),
        );
        if (aliasIndex >= 0) {
          const alias = nextAliasTimeline[aliasIndex];
          nextAliasTimeline[aliasIndex] = {
            ...alias,
            startOrder:
              alias.startOrder === null || alias.startOrder <= issueEvent.startOrder
                ? alias.startOrder
                : issueEvent.startOrder,
            endOrder:
              alias.endOrder === null || alias.endOrder >= issueEvent.startOrder
                ? alias.endOrder
                : issueEvent.startOrder,
          };
          continue;
        }

        nextAliasTimeline.push({
          ...createEmptyCharacterAlias(),
          value: aliasValue,
          type: 'public-name',
          startOrder: issueEvent.startOrder,
          endOrder: issueEvent.endOrder ?? issueEvent.startOrder,
          notes: 'Creado automaticamente por autofix de alias fuera de rango.',
        });
      }

      updateCharacter(character.id, {
        aliasTimeline: nextAliasTimeline,
        aliases: buildAliasSummary(nextAliasTimeline, character.aliases),
      });
    };

    const fixImpossibleTravel = (): void => {
      if (!issueEvent || !issue.characterId) {
        return;
      }

      const orderedEvents = [...worldBible.timeline].sort(
        (left, right) => left.startOrder - right.startOrder || left.id.localeCompare(right.id),
      );
      const targetIndex = orderedEvents.findIndex((entry) => entry.id === issueEvent.id);
      if (targetIndex < 0) {
        return;
      }

      let previousLocationId = '';
      for (let index = 0; index < targetIndex; index += 1) {
        const previousEvent = orderedEvents[index];
        const previousEntry = (previousEvent.characterLocations ?? []).find(
          (entry) => entry.characterId.trim() === issue.characterId,
        );
        if (previousEntry?.locationId.trim()) {
          previousLocationId = previousEntry.locationId.trim();
        }
      }

      const nextTimeline = worldBible.timeline.map((eventEntry) => {
        if (eventEntry.id !== issueEvent.id) {
          return eventEntry;
        }

        const nextCharacterLocations = (eventEntry.characterLocations ?? []).map((locationEntry) => {
          if (locationEntry.characterId.trim() !== issue.characterId) {
            return locationEntry;
          }
          if (previousLocationId) {
            return {
              ...locationEntry,
              locationId: previousLocationId,
              notes: locationEntry.notes
                ? `${locationEntry.notes}\nAutofix: ubicacion alineada por continuidad`
                : 'Autofix: ubicacion alineada por continuidad',
            };
          }
          return {
            ...locationEntry,
            locationId: '',
            notes: locationEntry.notes
              ? `${locationEntry.notes}\nAutofix: ubicacion removida por viaje imposible`
              : 'Autofix: ubicacion removida por viaje imposible',
          };
        });

        return {
          ...eventEntry,
          characterLocations: nextCharacterLocations,
        };
      });

      updateWorldBible({ timeline: nextTimeline });
    };

    switch (issue.code) {
      case 'missing-event-ref':
        if (issue.eventId) {
          ensureTimelineEventExists(issue.eventId);
        }
        break;
      case 'missing-character-ref':
        if (issue.characterId) {
          ensureCharacterExists(issue.characterId);
        }
        if (issue.eventId) {
          autofillTimelineEventMetadata(issue.eventId);
        }
        break;
      case 'missing-location-ref':
        if (issueEvent) {
          const nextBookRefs = issueEvent.bookRefs.map((reference) => {
            const locationId = reference.locationId?.trim() ?? '';
            if (!locationId) {
              return reference;
            }
            if (worldBible.locations.some((entry) => entry.id === locationId)) {
              return reference;
            }
            ensureLocationExists(locationId);
            return fallbackLocationId
              ? { ...reference, locationId: fallbackLocationId }
              : { ...reference, locationId: locationId };
          });
          const nextCharacterLocations = (issueEvent.characterLocations ?? []).map((entry) => {
            const locationId = entry.locationId.trim();
            if (!locationId) {
              return entry;
            }
            if (worldBible.locations.some((location) => location.id === locationId)) {
              return entry;
            }
            ensureLocationExists(locationId);
            return fallbackLocationId
              ? { ...entry, locationId: fallbackLocationId }
              : entry;
          });
          updateTimelineEvent(issueEvent.id, {
            bookRefs: nextBookRefs,
            characterLocations: nextCharacterLocations,
          });
        }
        break;
      case 'missing-book-ref':
        if (issueEvent) {
          const nextBookRefs = issueEvent.bookRefs.map((reference) => {
            const normalizedBookPath = reference.bookPath.trim();
            if (normalizedBookPath && linkedBookPathSet.has(normalizedBookPath)) {
              return reference;
            }
            if (!fallbackBookPath) {
              return reference;
            }
            const fallbackChapterId = props.chapterOptionsByBook[fallbackBookPath]?.[0]?.id ?? reference.chapterId;
            return {
              ...reference,
              bookPath: fallbackBookPath,
              chapterId: reference.chapterId || fallbackChapterId,
            };
          });
          updateTimelineBookRefs(issueEvent.id, nextBookRefs);
        }
        break;
      case 'missing-artifact-ref':
        if (issueEvent) {
          const nextArtifactTransfers = (issueEvent.artifactTransfers ?? []).map((transfer) => {
            const artifactId = transfer.artifactId.trim();
            if (artifactId && worldBible.artifacts.some((entry) => entry.id === artifactId)) {
              return transfer;
            }
            if (artifactId) {
              ensureArtifactExists(artifactId);
            }
            return fallbackArtifactId
              ? { ...transfer, artifactId: fallbackArtifactId }
              : transfer;
          });
          updateTimelineArtifactTransfers(issueEvent.id, nextArtifactTransfers);
        }
        break;
      case 'missing-secret-ref':
        if (issueEvent) {
          const nextReveals = (issueEvent.secretReveals ?? []).map((reveal) => {
            const secretId = reveal.secretId.trim();
            if (secretId && (worldBible.secrets ?? []).some((entry) => entry.id === secretId)) {
              return reveal;
            }
            if (secretId) {
              ensureSecretExists(secretId);
            }
            return fallbackSecretId
              ? { ...reveal, secretId: fallbackSecretId }
              : reveal;
          });
          updateTimelineSecretReveals(issueEvent.id, nextReveals);
        }
        break;
      case 'missing-entity-ref': {
        const pushEntityIfMissing = (
          kind: SagaEntityKind,
          id: string,
          makeName: (entityId: string) => string,
        ): void => {
          const normalizedId = id.trim();
          if (!normalizedId) {
            return;
          }
          if (kind === 'character') {
            ensureCharacterExists(normalizedId);
            return;
          }
          if (kind === 'location') {
            ensureLocationExists(normalizedId);
            return;
          }
          if (kind === 'artifact') {
            ensureArtifactExists(normalizedId);
            return;
          }
          const collectionMap: Record<Exclude<SagaEntityKind, 'character' | 'location' | 'artifact'>, EntitySectionKey> = {
            route: 'routes',
            flora: 'flora',
            fauna: 'fauna',
            faction: 'factions',
            system: 'systems',
          };
          const section = collectionMap[kind as keyof typeof collectionMap];
          if (!section) {
            return;
          }
          if (worldBible[section].some((entry) => entry.id === normalizedId)) {
            return;
          }
          updateWorldBible({
            [section]: [
              ...worldBible[section],
              {
                ...createEmptyEntity(),
                id: normalizedId,
                name: makeName(normalizedId),
                summary: 'Entidad creada automaticamente por autofix.',
              },
            ],
          } as Partial<SagaWorldBible>);
        };

        for (const relationship of worldBible.relationships) {
          const sourceId = relationship.from.id.trim();
          const targetId = relationship.to.id.trim();
          const isSourceMissing =
            sourceId &&
            !timelineEntityOptions.some((entry) => entry.id === sourceId);
          const isTargetMissing =
            targetId &&
            !timelineEntityOptions.some((entry) => entry.id === targetId);
          if (isSourceMissing) {
            pushEntityIfMissing(
              relationship.from.kind,
              sourceId,
              (entityId) => `${relationship.from.kind} pendiente ${entityId}`,
            );
          }
          if (isTargetMissing) {
            pushEntityIfMissing(
              relationship.to.kind,
              targetId,
              (entityId) => `${relationship.to.kind} pendiente ${entityId}`,
            );
          }
        }
        break;
      }
      case 'alias-out-of-range':
      case 'alias-context-mismatch':
        fixAliasRangeForIssue();
        break;
      case 'character-before-birth':
        if (issue.characterId && issueEvent) {
          updateCharacter(issue.characterId, {
            lifecycle: {
              ...(worldBible.characters.find((entry) => entry.id === issue.characterId)?.lifecycle ?? createEmptyCharacter().lifecycle),
              birthEventId: issueEvent.id,
            },
          });
          normalizeCharacterLifecycle(issue.characterId);
        }
        break;
      case 'character-after-death':
        if (issue.characterId && issueEvent) {
          updateCharacter(issue.characterId, {
            lifecycle: {
              ...(worldBible.characters.find((entry) => entry.id === issue.characterId)?.lifecycle ?? createEmptyCharacter().lifecycle),
              deathEventId: issueEvent.id,
            },
          });
          normalizeCharacterLifecycle(issue.characterId);
        }
        break;
      case 'invalid-lifecycle-order':
        if (issue.characterId) {
          normalizeCharacterLifecycle(issue.characterId);
        }
        break;
      case 'character-version-overlap':
        if (issue.characterId) {
          const character = worldBible.characters.find((entry) => entry.id === issue.characterId);
          if (character) {
            const sortedVersions = [...(character.versions ?? [])].sort((left, right) => {
              const leftStart = left.startOrder ?? Number.MIN_SAFE_INTEGER;
              const rightStart = right.startOrder ?? Number.MIN_SAFE_INTEGER;
              if (leftStart !== rightStart) {
                return leftStart - rightStart;
              }
              return (left.endOrder ?? Number.MAX_SAFE_INTEGER) - (right.endOrder ?? Number.MAX_SAFE_INTEGER);
            });
            const nextVersions = sortedVersions.map((entry) => ({ ...entry }));
            for (let index = 0; index < nextVersions.length - 1; index += 1) {
              const current = nextVersions[index];
              const next = nextVersions[index + 1];
              if (current.startOrder === null || next.startOrder === null) {
                continue;
              }
              const currentEnd = current.endOrder ?? Number.MAX_SAFE_INTEGER;
              if (currentEnd >= next.startOrder) {
                current.endOrder = Math.max(current.startOrder, next.startOrder - 1);
              }
            }
            updateCharacter(issue.characterId, { versions: nextVersions });
          }
        }
        break;
      case 'artifact-owner-mismatch':
        if (issue.eventId) {
          suggestTimelineArtifactTransferOwners(issue.eventId);
        }
        break;
      case 'impossible-travel':
        fixImpossibleTravel();
        break;
      case 'character-mentioned-after-death':
        break;
      default:
        if (issue.eventId) {
          autofillTimelineEventMetadata(issue.eventId);
        } else if (issue.characterId) {
          ensureCharacterExists(issue.characterId);
        } else if (!fallbackCharacterId && worldBible.characters.length === 0) {
          updateWorldBible({
            characters: [
              ...worldBible.characters,
              {
                ...createEmptyCharacter(),
                id: 'char-autofix',
                name: 'Personaje autofix',
                summary: 'Creado automaticamente por autofix general.',
              },
            ],
          });
        }
        break;
    }

    if (issue.eventId) {
      autofillTimelineEventMetadata(issue.eventId);
    }
    jumpToIssueContext(issue);
  };

  const updateTimelineCharacterLocations = (
    eventId: string,
    nextLocations: SagaTimelineCharacterLocation[],
  ): void => {
    updateTimelineEvent(eventId, { characterLocations: nextLocations });
  };

  const updateTimelineCharacterLocation = (
    eventId: string,
    index: number,
    patch: Partial<SagaTimelineCharacterLocation>,
  ): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineCharacterLocations(
      eventId,
      (targetEvent.characterLocations ?? []).map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const addTimelineCharacterLocation = (eventId: string): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const suggestions = suggestCharacterLocationsForEvent(worldBible, eventId)
      .map(normalizeTimelineCharacterLocation)
      .filter((entry) => entry.characterId && entry.locationId);
    const existingLocations = (targetEvent.characterLocations ?? []).map(normalizeTimelineCharacterLocation);
    const mergedLocations = mergeUniqueBySignature(
      existingLocations,
      suggestions,
      buildTimelineCharacterLocationSignature,
    );
    if (mergedLocations.length > existingLocations.length) {
      updateTimelineCharacterLocations(eventId, mergedLocations);
      return;
    }

    updateTimelineCharacterLocations(
      eventId,
      [...existingLocations, createEmptyTimelineCharacterLocation()],
    );
  };

  const suggestTimelineCharacterLocations = (eventId: string): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const suggestions = suggestCharacterLocationsForEvent(worldBible, eventId)
      .map(normalizeTimelineCharacterLocation)
      .filter((entry) => entry.characterId && entry.locationId);
    if (suggestions.length === 0) {
      return;
    }

    const existingLocations = (targetEvent.characterLocations ?? []).map(normalizeTimelineCharacterLocation);
    const mergedLocations = mergeUniqueBySignature(
      existingLocations,
      suggestions,
      buildTimelineCharacterLocationSignature,
    );
    if (mergedLocations.length === existingLocations.length) {
      return;
    }

    updateTimelineCharacterLocations(
      eventId,
      mergedLocations,
    );
  };

  const removeTimelineCharacterLocation = (eventId: string, index: number): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineCharacterLocations(
      eventId,
      (targetEvent.characterLocations ?? []).filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const updateTimelineSecretReveals = (
    eventId: string,
    nextReveals: SagaTimelineSecretReveal[],
  ): void => {
    updateTimelineEvent(eventId, { secretReveals: nextReveals });
  };

  const updateTimelineSecretReveal = (
    eventId: string,
    index: number,
    patch: Partial<SagaTimelineSecretReveal>,
  ): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineSecretReveals(
      eventId,
      (targetEvent.secretReveals ?? []).map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const addTimelineSecretReveal = (eventId: string): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    const sourceEvent = timelineEventById.get(getAutofillSourceEventId(eventId));
    const sourceReveal = sourceEvent?.secretReveals?.[0];
    const nextReveal: SagaTimelineSecretReveal = sourceReveal
      ? {
          ...sourceReveal,
          secretId: sourceReveal.secretId.trim(),
          perceiverCharacterId: sourceReveal.perceiverCharacterId.trim(),
          summary: sourceReveal.summary.trim(),
        }
      : {
          ...createEmptyTimelineSecretReveal(),
          secretId: secretOptions[0]?.id ?? '',
          perceiverCharacterId: characterOptions[0]?.id ?? '',
        };

    updateTimelineSecretReveals(eventId, [...(targetEvent.secretReveals ?? []), nextReveal]);
  };

  const removeTimelineSecretReveal = (eventId: string, index: number): void => {
    const targetEvent = worldBible.timeline.find((entry) => entry.id === eventId);
    if (!targetEvent) {
      return;
    }

    updateTimelineSecretReveals(
      eventId,
      (targetEvent.secretReveals ?? []).filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const renderEntitySection = (section: EntitySectionKey, title: string, emptyLabel: string) => (
    <section className="bible-section">
      <div className="bible-section-head">
        <h3>{title}</h3>
        <button type="button" onClick={() => updateWorldBible({ [section]: [...worldBible[section], createEmptyEntity()] } as Partial<SagaWorldBible>)}>
          Agregar
        </button>
      </div>
      {worldBible[section].length === 0 ? (
        <p className="muted">{emptyLabel}</p>
      ) : (
        <div className="bible-card-list">
          {worldBible[section].map((entry) => (
            <article key={entry.id} id={`saga-entity-${entry.id}`} className="bible-card">
              <div className="bible-card-head">
                <strong>{entry.name || `${title} sin nombre`}</strong>
                <div className="top-toolbar-actions">
                  {normalizeCanonStatus(entry.canonStatus) === 'apocryphal' ? (
                    <button type="button" onClick={() => updateEntity(section, entry.id, { canonStatus: 'canonical' })}>
                      Canonizar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      updateWorldBible({ [section]: worldBible[section].filter((item) => item.id !== entry.id) } as Partial<SagaWorldBible>)
                    }
                  >
                    Quitar
                  </button>
                </div>
              </div>
              <div className="bible-two-col">
                <label>
                  Nombre
                  <input value={entry.name} onChange={(event) => updateEntity(section, entry.id, { name: event.target.value })} />
                </label>
                <label>
                  Alias
                  <input value={entry.aliases} onChange={(event) => updateEntity(section, entry.id, { aliases: event.target.value })} />
                </label>
              </div>
              <label>
                Resumen
                <textarea rows={2} value={entry.summary} onChange={(event) => updateEntity(section, entry.id, { summary: event.target.value })} />
              </label>
              <label>
                Notas
                <textarea rows={3} value={entry.notes} onChange={(event) => updateEntity(section, entry.id, { notes: event.target.value })} />
              </label>
              <label>
                Estado narrativo
                <select
                  value={normalizeCanonStatus(entry.canonStatus)}
                  onChange={(event) =>
                    updateEntity(section, entry.id, {
                      canonStatus: event.target.value as SagaWorldEntity['canonStatus'],
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
  );

  return (
    <section className="settings-view story-bible-view saga-command-view">
      <header className="saga-command-hero">
        <div className="saga-command-copy">
          <span className="section-kicker">Puente de mando</span>
          <div className="story-bible-header-top saga-command-titlebar">
            <div>
              <h2>Planificador de saga</h2>
              <p>Administra el mundo compartido, la continuidad global y los libros que forman parte de la saga.</p>
            </div>
            <div className="story-bible-header-actions saga-command-actions">
              <span className="saga-command-pill">{activeTabMeta.label}</span>
              <button type="button" onClick={props.onSave}>
                Guardar saga
              </button>
            </div>
          </div>
          <p className="saga-command-summary">{activeTabMeta.summary}</p>
        </div>
        <div className="saga-command-ledger" aria-label="Resumen de salud de la saga">
          {sagaHealthCards.map((card) => (
            <article key={card.label} className="saga-command-card">
              <span className="section-kicker">{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </article>
          ))}
        </div>
      </header>

      <nav className="saga-tab-nav" aria-label="Secciones de la saga">
        {sagaTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`saga-tab-btn ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            title={tab.summary}
          >
            {tab.label}
          </button>
        ))}
        {consistencyReport.errorCount > 0 || consistencyReport.warningCount > 0 ? (
          <button
            type="button"
            className={`saga-tab-btn saga-tab-btn-issues ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('overview')}
            title="Ver validacion inteligente"
          >
            {consistencyReport.errorCount > 0 ? `⚠ ${consistencyReport.errorCount} errores` : `${consistencyReport.warningCount} avisos`}
          </button>
        ) : null}
      </nav>

      {activeTab === 'overview' && <>
      <div className="saga-overview-grid">
      <section className="bible-section saga-overview-core">
        <div className="bible-section-head">
          <h3>Nucleo editorial</h3>
          <span className="muted">Identidad, resumen y panorama maestro.</span>
        </div>
        <div className="bible-two-col">
          <label>
            Titulo de la saga
            <input value={saga.metadata.title} onChange={(event) => props.onChange({ ...saga.metadata, title: event.target.value })} />
          </label>
          <label>
            ID interno
            <input value={saga.metadata.id} disabled />
          </label>
        </div>

        <label>
          Descripcion general
          <textarea rows={3} value={saga.metadata.description} onChange={(event) => props.onChange({ ...saga.metadata, description: event.target.value })} />
        </label>

        <label>
          Panorama maestro del mundo
          <textarea rows={5} value={worldBible.overview} onChange={(event) => updateWorldBible({ overview: event.target.value })} />
        </label>
      </section>

      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Libros vinculados</h3>
          <span className="muted">{saga.metadata.books.length} libros</span>
        </div>
        {saga.metadata.books.length === 0 ? (
          <p className="muted">Todavia no hay libros vinculados a esta saga.</p>
        ) : (
          <div className="bible-card-list">
            {saga.metadata.books.map((entry) => (
              <article key={entry.bookPath} className="bible-card">
                <div className="bible-card-head">
                  <strong>{entry.volumeNumber ? `Vol. ${entry.volumeNumber} - ` : ''}{entry.title}</strong>
                  <button type="button" onClick={() => props.onOpenBook(entry.bookPath)}>Abrir libro</button>
                </div>
                <p>{entry.author || 'Autor sin definir'}</p>
                <p className="muted">{entry.bookPath}</p>
                <div className="bible-two-col">
                  <label>
                    Volumen
                    <input
                      type="number"
                      min={1}
                      value={volumeDrafts[entry.bookPath] ?? String(entry.volumeNumber ?? '')}
                      onChange={(event) => setVolumeDrafts((previous) => ({ ...previous, [entry.bookPath]: event.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = Number.parseInt(volumeDrafts[entry.bookPath] ?? '', 10);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        props.onUpdateBookVolume(entry.bookPath, parsed);
                      }
                    }}
                  >
                    Aplicar volumen
                  </button>
                </div>
                <div className="library-actions">
                  <button type="button" onClick={() => props.onMoveBook(entry.bookPath, 'up')}>Subir</button>
                  <button type="button" onClick={() => props.onMoveBook(entry.bookPath, 'down')}>Bajar</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bible-section saga-overview-validation">
        <div className="bible-section-head">
          <h3>Validacion inteligente</h3>
          <span className="muted">
            {consistencyReport.errorCount} errores / {consistencyReport.warningCount} avisos
          </span>
        </div>
        <label>
          <input
            type="checkbox"
            checked={saga.metadata.strictValidationMode === true}
            onChange={(event) =>
              props.onChange({
                ...saga.metadata,
                strictValidationMode: event.target.checked,
              })
            }
          />{' '}
          Modo estricto: mantener alertas fuertes y frenar exportaciones finales si hay incoherencias graves
        </label>
        {saga.metadata.strictValidationMode ? (
          <p className="muted">El guardado del manuscrito no se bloquea. Usa este modo como consejero editorial, no como cerrojo.</p>
        ) : null}
        {consistencyReport.issues.length === 0 ? (
          <p className="muted">No se detectaron problemas estructurales en la saga cargada.</p>
        ) : (
          <>
            {saga.metadata.strictValidationMode && consistencyReport.errorCount > 0 ? (
              <p className="warning-text">
                Hay incoherencias graves marcadas. Puedes guardar igual, pero conviene corregirlas antes de exportar.
              </p>
            ) : null}
            <div className="timeline-badges saga-validation-summary">
              <span className="timeline-badge">Issues totales: {consistencyReport.issues.length}</span>
              <span className="timeline-badge">Eventos con alertas: {issueCountByEventId.size}</span>
              <span className="timeline-badge">Personajes con alertas: {issueCountByCharacterId.size}</span>
            </div>
            <div className="bible-two-col">
              <label>
                Severidad
                <select
                  value={issueSeverityFilter}
                  onChange={(event) => setIssueSeverityFilter(event.target.value as 'all' | 'error' | 'warning')}
                >
                  <option value="all">Todas</option>
                  <option value="error">Errores</option>
                  <option value="warning">Avisos</option>
                </select>
              </label>
              <label>
                Codigo
                <select value={issueCodeFilter} onChange={(event) => setIssueCodeFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {issueCodeOptions.map((code) => (
                    <option key={`issue-code-${code}`} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Buscar en entidad/contexto
              <input
                value={issueEntityFilter}
                onChange={(event) => setIssueEntityFilter(event.target.value)}
                placeholder="char-12, ev-44, missing-book-ref..."
              />
            </label>
            <div className="timeline-check-list">
              {filteredIssues.length === 0 ? (
                <p className="muted">No hay issues para los filtros activos.</p>
              ) : (
                filteredIssues.map((issue) => (
                  <article
                    key={`saga-issue-${issue.id}`}
                    className={`timeline-check-item is-${issue.severity}`}
                  >
                    <strong>{issue.code}</strong>
                    <span>{issue.message}</span>
                    <small>
                      {issue.eventId ? `Evento: ${issue.eventId}` : 'Sin evento'}
                      {issue.characterId ? ` | Personaje: ${issue.characterId}` : ''}
                    </small>
                    <div className="top-toolbar-actions">
                      <button type="button" onClick={() => jumpToIssueContext(issue)}>
                        Ir al contexto
                      </button>
                      {canApplySuggestedFixForIssue(issue) ? (
                        <button
                          type="button"
                          onClick={() =>
                            setAutofixPreviewIssueId((previous) =>
                              previous === issue.id ? null : issue.id,
                            )
                          }
                        >
                          {autofixPreviewIssueId === issue.id ? 'Ocultar preview' : 'Autofix sugerido'}
                        </button>
                      ) : null}
                    </div>
                    {autofixPreviewIssueId === issue.id ? (
                      <div className="bible-section">
                        <div className="bible-section-head">
                          <h3>Preview de autofix</h3>
                        </div>
                        <div className="atlas-summary-list">
                          {buildAutofixPreviewSteps(issue).map((step, index) => (
                            <div key={`${issue.id}-autofix-step-${index}`} className="atlas-summary-item">
                              <strong>Paso {index + 1}</strong>
                              <small>{step}</small>
                            </div>
                          ))}
                        </div>
                        <div className="top-toolbar-actions">
                          <button type="button" onClick={() => applySuggestedFixForIssue(issue)}>
                            Aplicar autofix
                          </button>
                          <button type="button" onClick={() => setAutofixPreviewIssueId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </section>
      </div>
      </>}

      {activeTab === 'characters' && <section className="bible-section">
        <div className="bible-section-head">
          <h3>Personajes de saga</h3>
          <button type="button" onClick={() => updateWorldBible({ characters: [...worldBible.characters, createEmptyCharacter()] })}>Agregar personaje</button>
        </div>
        {worldBible.characters.length === 0 ? (
          <p className="muted">No hay personajes globales cargados.</p>
        ) : (
          <div className="bible-card-list">
            {worldBible.characters.map((entry) => (
              <article key={entry.id} id={`saga-character-${entry.id}`} className="bible-card">
                <div className="bible-card-head">
                  <strong>{entry.name || 'Personaje sin nombre'}</strong>
                  <div className="timeline-badges">
                    {issueCountByCharacterId.get(entry.id)?.errors ? (
                      <span className="timeline-badge">
                        Errores: {issueCountByCharacterId.get(entry.id)?.errors}
                      </span>
                    ) : null}
                    {issueCountByCharacterId.get(entry.id)?.warnings ? (
                      <span className="timeline-badge">
                        Avisos: {issueCountByCharacterId.get(entry.id)?.warnings}
                      </span>
                    ) : null}
                  </div>
                  <div className="top-toolbar-actions">
                    {normalizeCanonStatus(entry.canonStatus) === 'apocryphal' ? (
                      <button type="button" onClick={() => updateCharacter(entry.id, { canonStatus: 'canonical' })}>
                        Canonizar
                      </button>
                    ) : null}
                    <button type="button" onClick={() => updateWorldBible({ characters: worldBible.characters.filter((item) => item.id !== entry.id) })}>Quitar</button>
                  </div>
                </div>
                <div className="bible-two-col">
                  <label>
                    Nombre canonico
                    <input value={entry.name} onChange={(event) => updateCharacter(entry.id, { name: event.target.value })} />
                  </label>
                  <label>
                    Estado actual
                    <select
                      value={entry.lifecycle.currentStatus}
                      onChange={(event) =>
                        updateCharacter(entry.id, { lifecycle: { ...entry.lifecycle, currentStatus: event.target.value as SagaCharacter['lifecycle']['currentStatus'] } })
                      }
                    >
                      <option value="unknown">Sin definir</option>
                      <option value="alive">Vivo</option>
                      <option value="dead">Muerto</option>
                      <option value="missing">Desaparecido</option>
                    </select>
                  </label>
                </div>
                <label>
                  Estado narrativo
                  <select
                    value={normalizeCanonStatus(entry.canonStatus)}
                    onChange={(event) =>
                      updateCharacter(entry.id, {
                        canonStatus: event.target.value as SagaCharacter['canonStatus'],
                      })
                    }
                  >
                    <option value="canonical">Canonico</option>
                    <option value="apocryphal">Apocrifo</option>
                  </select>
                </label>
                <label>
                  Resumen
                  <textarea rows={2} value={entry.summary} onChange={(event) => updateCharacter(entry.id, { summary: event.target.value })} />
                </label>
                <label>
                  Notas
                  <textarea rows={3} value={entry.notes} onChange={(event) => updateCharacter(entry.id, { notes: event.target.value })} />
                </label>
                <div className="bible-two-col">
                  <label>
                    Evento de nacimiento
                    <select
                      value={entry.lifecycle.birthEventId ?? ''}
                      onChange={(event) => updateCharacter(entry.id, { lifecycle: { ...entry.lifecycle, birthEventId: event.target.value || null } })}
                    >
                      <option value="">Sin definir</option>
                      {timelineOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Evento de muerte
                    <select
                      value={entry.lifecycle.deathEventId ?? ''}
                      onChange={(event) => updateCharacter(entry.id, { lifecycle: { ...entry.lifecycle, deathEventId: event.target.value || null } })}
                    >
                      <option value="">Sin definir</option>
                      {timelineOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="bible-two-col">
                  <label>
                    Primera aparicion
                    <select
                      value={entry.lifecycle.firstAppearanceEventId ?? ''}
                      onChange={(event) => updateCharacter(entry.id, { lifecycle: { ...entry.lifecycle, firstAppearanceEventId: event.target.value || null } })}
                    >
                      <option value="">Sin definir</option>
                      {timelineOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Ultimo evento conocido
                    <select
                      value={entry.lifecycle.lastKnownEventId ?? ''}
                      onChange={(event) => updateCharacter(entry.id, { lifecycle: { ...entry.lifecycle, lastKnownEventId: event.target.value || null } })}
                    >
                      <option value="">Sin definir</option>
                      {timelineOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Apodos y titulos</h3>
                    <button
                      type="button"
                      onClick={() => updateCharacter(entry.id, { aliasTimeline: [...entry.aliasTimeline, createEmptyCharacterAlias()] })}
                    >
                      Agregar alias
                    </button>
                  </div>
                  {entry.aliasTimeline.length === 0 ? (
                    <p className="muted">No hay apodos cargados. Cada alias puede tener rango cronologico.</p>
                  ) : (
                    <div className="bible-card-list">
                      {entry.aliasTimeline.map((alias) => (
                        <article key={alias.id} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{alias.value || 'Alias sin nombre'}</strong>
                            <button
                              type="button"
                              onClick={() => updateCharacter(entry.id, { aliasTimeline: entry.aliasTimeline.filter((item) => item.id !== alias.id) })}
                            >
                              Quitar
                            </button>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Alias
                              <input
                                value={alias.value}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    aliasTimeline: entry.aliasTimeline.map((item) => (item.id === alias.id ? { ...item, value: event.target.value } : item)),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Tipo
                              <select
                                value={alias.type}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    aliasTimeline: entry.aliasTimeline.map((item) =>
                                      item.id === alias.id ? { ...item, type: event.target.value as SagaCharacterAlias['type'] } : item,
                                    ),
                                  })
                                }
                              >
                                <option value="public-name">Nombre publico</option>
                                <option value="birth-name">Nombre de nacimiento</option>
                                <option value="nickname">Apodo</option>
                                <option value="title">Titulo</option>
                                <option value="codename">Clave</option>
                                <option value="secret-name">Nombre secreto</option>
                              </select>
                            </label>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Desde orden
                              <input
                                type="number"
                                value={alias.startOrder ?? ''}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    aliasTimeline: entry.aliasTimeline.map((item) =>
                                      item.id === alias.id ? { ...item, startOrder: parseOptionalNumber(event.target.value) } : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Hasta orden
                              <input
                                type="number"
                                value={alias.endOrder ?? ''}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    aliasTimeline: entry.aliasTimeline.map((item) =>
                                      item.id === alias.id ? { ...item, endOrder: parseOptionalNumber(event.target.value) } : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>
                          <label>
                            Notas
                            <textarea
                              rows={2}
                              value={alias.notes}
                              onChange={(event) =>
                                updateCharacter(entry.id, {
                                  aliasTimeline: entry.aliasTimeline.map((item) => (item.id === alias.id ? { ...item, notes: event.target.value } : item)),
                                })
                              }
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Versiones por era</h3>
                    <button
                      type="button"
                      onClick={() =>
                        updateCharacter(entry.id, {
                          versions: [...(entry.versions ?? []), createEmptyCharacterVersion()],
                        })
                      }
                    >
                      Agregar version
                    </button>
                  </div>
                  {(entry.versions ?? []).length === 0 ? (
                    <p className="muted">No hay versiones. Usa esto para etapas como "antes de la guerra", "exilio", "rey".</p>
                  ) : (
                    <div className="bible-card-list">
                      {(entry.versions ?? []).map((version) => (
                        <article key={version.id} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{version.label || 'Version sin etiqueta'}</strong>
                            <button
                              type="button"
                              onClick={() =>
                                updateCharacter(entry.id, {
                                  versions: (entry.versions ?? []).filter((item) => item.id !== version.id),
                                })
                              }
                            >
                              Quitar
                            </button>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Etiqueta
                              <input
                                value={version.label}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    versions: (entry.versions ?? []).map((item) =>
                                      item.id === version.id ? { ...item, label: event.target.value } : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Estado
                              <select
                                value={version.status}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    versions: (entry.versions ?? []).map((item) =>
                                      item.id === version.id
                                        ? { ...item, status: event.target.value as SagaCharacterVersion['status'] }
                                        : item,
                                    ),
                                  })
                                }
                              >
                                <option value="unknown">Sin definir</option>
                                <option value="alive">Vivo</option>
                                <option value="dead">Muerto</option>
                                <option value="missing">Desaparecido</option>
                              </select>
                            </label>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Desde orden
                              <input
                                type="number"
                                value={version.startOrder ?? ''}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    versions: (entry.versions ?? []).map((item) =>
                                      item.id === version.id
                                        ? { ...item, startOrder: parseOptionalNumber(event.target.value) }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Hasta orden
                              <input
                                type="number"
                                value={version.endOrder ?? ''}
                                onChange={(event) =>
                                  updateCharacter(entry.id, {
                                    versions: (entry.versions ?? []).map((item) =>
                                      item.id === version.id
                                        ? { ...item, endOrder: parseOptionalNumber(event.target.value) }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>
                          <label>
                            Resumen
                            <textarea
                              rows={2}
                              value={version.summary}
                              onChange={(event) =>
                                updateCharacter(entry.id, {
                                  versions: (entry.versions ?? []).map((item) =>
                                    item.id === version.id ? { ...item, summary: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            Notas
                            <textarea
                              rows={2}
                              value={version.notes}
                              onChange={(event) =>
                                updateCharacter(entry.id, {
                                  versions: (entry.versions ?? []).map((item) =>
                                    item.id === version.id ? { ...item, notes: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </article>
            ))}
          </div>
        )}
      </section>}

      {activeTab === 'world' && <>
      {renderEntitySection('locations', 'Lugares y regiones', 'No hay lugares o regiones cargados.')}
      {renderEntitySection('routes', 'Caminos y rutas', 'No hay rutas, caminos o portales cargados.')}
      {renderEntitySection('flora', 'Flora', 'No hay flora registrada.')}
      {renderEntitySection('fauna', 'Fauna', 'No hay fauna registrada.')}
      {renderEntitySection('factions', 'Facciones y culturas', 'No hay facciones o culturas registradas.')}
      {renderEntitySection('systems', 'Sistemas', 'No hay sistemas globales registrados.')}
      {renderEntitySection('artifacts', 'Artefactos y elementos', 'No hay artefactos o elementos clave registrados.')}
      </>}

      {activeTab === 'secrets' && <section className="bible-section">
        <div className="bible-section-head">
          <h3>Secretos</h3>
          <button
            type="button"
            onClick={() => updateWorldBible({ secrets: [...(worldBible.secrets ?? []), createEmptySecret()] })}
          >
            Agregar secreto
          </button>
        </div>
        {(worldBible.secrets ?? []).length === 0 ? (
          <p className="muted">No hay secretos registrados. Usa esta seccion para verdad objetiva, retcons y revelaciones.</p>
        ) : (
          <div className="bible-card-list">
            {(worldBible.secrets ?? []).map((secret) => (
              <article key={secret.id} id={`saga-secret-${secret.id}`} className="bible-card">
                <div className="bible-card-head">
                  <strong>{secret.title || 'Secreto sin titulo'}</strong>
                  <div className="top-toolbar-actions">
                    {normalizeCanonStatus(secret.canonStatus) === 'apocryphal' ? (
                      <button type="button" onClick={() => updateSecret(secret.id, { canonStatus: 'canonical' })}>
                        Canonizar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        updateWorldBible({
                          secrets: (worldBible.secrets ?? []).filter((entry) => entry.id !== secret.id),
                        })
                      }
                    >
                      Quitar
                    </button>
                  </div>
                </div>
                <label>
                  Titulo
                  <input value={secret.title} onChange={(event) => updateSecret(secret.id, { title: event.target.value })} />
                </label>
                <label>
                  Resumen
                  <textarea rows={2} value={secret.summary} onChange={(event) => updateSecret(secret.id, { summary: event.target.value })} />
                </label>
                <label>
                  Verdad objetiva
                  <textarea
                    rows={2}
                    value={secret.objectiveTruth}
                    onChange={(event) => updateSecret(secret.id, { objectiveTruth: event.target.value })}
                  />
                </label>
                <label>
                  Estado narrativo
                  <select
                    value={normalizeCanonStatus(secret.canonStatus)}
                    onChange={(event) =>
                      updateSecret(secret.id, {
                        canonStatus: event.target.value as SagaSecret['canonStatus'],
                      })
                    }
                  >
                    <option value="canonical">Canonico</option>
                    <option value="apocryphal">Apocrifo</option>
                  </select>
                </label>
                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Entidades relacionadas</h3>
                    <div className="top-toolbar-actions">
                      <select
                        value={secretEntityDraftBySecretId[secret.id] ?? ''}
                        onChange={(event) => updateSecretEntityDraft(secret.id, event.target.value)}
                      >
                        <option value="">Seleccionar entidad</option>
                        {timelineEntityOptions
                          .filter((option) => !secret.relatedEntityIds.includes(option.id))
                          .map((option) => (
                            <option key={`${secret.id}-related-option-${option.id}`} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                      </select>
                      <button type="button" onClick={() => addSecretRelatedEntity(secret.id)}>
                        Agregar
                      </button>
                    </div>
                  </div>
                  {secret.relatedEntityIds.length === 0 ? (
                    <p className="muted">Sin entidades relacionadas.</p>
                  ) : (
                    <div className="bible-card-list">
                      {secret.relatedEntityIds.map((entityId) => (
                        <article key={`${secret.id}-related-${entityId}`} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{timelineEntityLabelById.get(entityId) ?? entityId}</strong>
                            <div className="top-toolbar-actions">
                              <button type="button" onClick={() => jumpToEntityContext(entityId)}>
                                Ir a entidad
                              </button>
                              <button type="button" onClick={() => removeSecretRelatedEntity(secret.id, entityId)}>
                                Quitar
                              </button>
                            </div>
                          </div>
                          <p className="muted">{entityId}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <label>
                  Notas
                  <textarea rows={2} value={secret.notes} onChange={(event) => updateSecret(secret.id, { notes: event.target.value })} />
                </label>
              </article>
            ))}
          </div>
        )}
      </section>}

      {activeTab === 'relations' && <section className="bible-section">
        <div className="bible-section-head">
          <h3>Relaciones del mundo</h3>
          <button
            type="button"
            onClick={() => updateWorldBible({ relationships: [...worldBible.relationships, createEmptyRelationship()] })}
          >
            Agregar relacion
          </button>
        </div>
        {worldBible.relationships.length === 0 ? (
          <p className="muted">No hay relaciones registradas. Usa esta seccion para familia, politica, control, alianzas o posesion.</p>
        ) : (
          <div className="bible-card-list">
            {worldBible.relationships.map((relationship) => (
              <article key={relationship.id} className="bible-card">
                {/** Sugerencias guiadas para reducir tipado inconsistente en relaciones */ }
                {(() => {
                  const relationTypeOptions = suggestRelationshipTypes(relationship.type);
                  const relationTypeListId = `${relationship.id}-relationship-type-options`;
                  return (
                    <>
                      <div className="bible-card-head">
                        <strong>{relationship.type || 'Relacion sin tipo'}</strong>
                        <button
                          type="button"
                          onClick={() =>
                            updateWorldBible({
                              relationships: worldBible.relationships.filter((entry) => entry.id !== relationship.id),
                            })
                          }
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="bible-two-col">
                        <label>
                          Desde tipo
                          <select
                            value={relationship.from.kind}
                            onChange={(event) =>
                              updateRelationshipRef(relationship.id, 'from', {
                                kind: event.target.value as SagaEntityKind,
                              })
                            }
                          >
                            <option value="character">Personaje</option>
                            <option value="location">Lugar</option>
                            <option value="route">Ruta</option>
                            <option value="flora">Flora</option>
                            <option value="fauna">Fauna</option>
                            <option value="faction">Faccion</option>
                            <option value="system">Sistema</option>
                            <option value="artifact">Artefacto</option>
                          </select>
                        </label>
                        <label>
                          Desde entidad
                          <select
                            value={relationship.from.id}
                            onChange={(event) =>
                              updateRelationshipRef(relationship.id, 'from', {
                                id: event.target.value,
                              })
                            }
                          >
                            <option value="">Sin entidad</option>
                            {entityOptionsByKind[relationship.from.kind].map((option) => (
                              <option key={`${relationship.id}-from-${option.id}`} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="bible-two-col">
                        <label>
                          Hacia tipo
                          <select
                            value={relationship.to.kind}
                            onChange={(event) =>
                              updateRelationshipRef(relationship.id, 'to', {
                                kind: event.target.value as SagaEntityKind,
                              })
                            }
                          >
                            <option value="character">Personaje</option>
                            <option value="location">Lugar</option>
                            <option value="route">Ruta</option>
                            <option value="flora">Flora</option>
                            <option value="fauna">Fauna</option>
                            <option value="faction">Faccion</option>
                            <option value="system">Sistema</option>
                            <option value="artifact">Artefacto</option>
                          </select>
                        </label>
                        <label>
                          Hacia entidad
                          <select
                            value={relationship.to.id}
                            onChange={(event) =>
                              updateRelationshipRef(relationship.id, 'to', {
                                id: event.target.value,
                              })
                            }
                          >
                            <option value="">Sin entidad</option>
                            {entityOptionsByKind[relationship.to.kind].map((option) => (
                              <option key={`${relationship.id}-to-${option.id}`} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="top-toolbar-actions">
                        {relationship.from.id ? (
                          <button type="button" onClick={() => jumpToEntityContext(relationship.from.id)}>
                            Ir a origen
                          </button>
                        ) : null}
                        {relationship.to.id ? (
                          <button type="button" onClick={() => jumpToEntityContext(relationship.to.id)}>
                            Ir a destino
                          </button>
                        ) : null}
                      </div>
                      <label>
                        Tipo de relacion
                        <input
                          list={relationTypeListId}
                          value={relationship.type}
                          onChange={(event) => updateRelationship(relationship.id, { type: event.target.value })}
                          placeholder="Ej: parent-of, enemy-of, controls, ally-of"
                        />
                        <datalist id={relationTypeListId}>
                          {relationTypeOptions.map((option) => (
                            <option key={`${relationship.id}-type-${option}`} value={option} />
                          ))}
                        </datalist>
                        {relationship.type.trim() && !isKnownRelationshipType(relationship.type) ? (
                          <small className="muted">
                            Tipo personalizado. Recomendado: usar uno del catalogo para mejorar consistencia.
                          </small>
                        ) : null}
                      </label>
                      <div className="bible-two-col">
                        <label>
                          Desde orden
                          <input
                            type="number"
                            value={relationship.startOrder ?? ''}
                            onChange={(event) => updateRelationship(relationship.id, { startOrder: parseOptionalNumber(event.target.value) })}
                            placeholder="Opcional"
                          />
                        </label>
                        <label>
                          Hasta orden
                          <input
                            type="number"
                            value={relationship.endOrder ?? ''}
                            onChange={(event) => updateRelationship(relationship.id, { endOrder: parseOptionalNumber(event.target.value) })}
                            placeholder="Opcional"
                          />
                        </label>
                      </div>
                      <label>
                        Notas
                        <textarea
                          rows={2}
                          value={relationship.notes}
                          onChange={(event) => updateRelationship(relationship.id, { notes: event.target.value })}
                          placeholder="Contexto, condiciones, excepciones o periodo de vigencia"
                        />
                      </label>
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
        )}
      </section>}

      {activeTab === 'timeline' && <section className="bible-section">
        <div className="bible-section-head">
          <h3>Linea temporal</h3>
          <div className="top-toolbar-actions">
            <button type="button" onClick={() => setShowOnlyFlaggedEvents((previous) => !previous)}>
              {showOnlyFlaggedEvents ? 'Mostrar todos' : 'Solo con alertas'}
            </button>
            <button
              type="button"
              onClick={() =>
                updateWorldBible({
                  timeline: [...worldBible.timeline, createEmptyTimelineEvent(worldBible.timeline.length + 1)].sort(
                    (a, b) => a.startOrder - b.startOrder || a.title.localeCompare(b.title),
                  ),
                })
              }
            >
              Agregar evento
            </button>
          </div>
        </div>
        <p className="muted">
          Cada evento puede apuntar a uno o varios libros/capitulos y registrar cambios puntuales sobre personajes.
          {showOnlyFlaggedEvents
            ? ' (Reordenamiento drag-and-drop deshabilitado mientras filtras solo eventos con alertas.)'
            : ' Arrastra y suelta tarjetas para reordenar rapidamente la cronologia visual.'}
        </p>
        {visibleTimelineEvents.length === 0 ? (
          <p className="muted">No hay eventos cronologicos registrados.</p>
        ) : (
          <div className="bible-card-list">
            {visibleTimelineEvents.map((entry) => (
              <article
                key={entry.id}
                id={`saga-event-${entry.id}`}
                draggable={!showOnlyFlaggedEvents}
                onDragStart={() => handleTimelineDragStart(entry.id)}
                onDragOver={handleTimelineDragOver}
                onDrop={() => handleTimelineDrop(entry.id)}
                onDragEnd={handleTimelineDragEnd}
                className={`bible-card ${
                  draggedTimelineEventId === entry.id ? 'is-selected' :
                  ''
                } ${
                  (issueCountByEventId.get(entry.id)?.errors ?? 0) > 0
                    ? 'timeline-check-item is-error'
                    : (issueCountByEventId.get(entry.id)?.warnings ?? 0) > 0
                      ? 'timeline-check-item is-warning'
                      : ''
                }`}
              >
                <div className="bible-card-head">
                  <strong>{entry.title || 'Evento sin titulo'}</strong>
                  <div className="timeline-badges">
                    {(issueCountByEventId.get(entry.id)?.errors ?? 0) > 0 ? (
                      <span className="timeline-badge">
                        Errores: {issueCountByEventId.get(entry.id)?.errors ?? 0}
                      </span>
                    ) : null}
                    {(issueCountByEventId.get(entry.id)?.warnings ?? 0) > 0 ? (
                      <span className="timeline-badge">
                        Avisos: {issueCountByEventId.get(entry.id)?.warnings ?? 0}
                      </span>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => autofillTimelineEventMetadata(entry.id)}>
                    Autocompletar evento
                  </button>
                  {normalizeCanonStatus(entry.canonStatus) === 'apocryphal' ? (
                    <button type="button" onClick={() => updateTimelineEvent(entry.id, { canonStatus: 'canonical' })}>
                      Canonizar
                    </button>
                  ) : null}
                  <button type="button" onClick={() => updateWorldBible({ timeline: worldBible.timeline.filter((item) => item.id !== entry.id) })}>Quitar</button>
                </div>
                <div className="bible-two-col">
                  <label>
                    Titulo
                    <input value={entry.title} onChange={(event) => updateTimelineEvent(entry.id, { title: event.target.value })} />
                  </label>
                  <label>
                    Etiqueta visible
                    <input value={entry.displayLabel} onChange={(event) => updateTimelineEvent(entry.id, { displayLabel: event.target.value })} />
                  </label>
                </div>
                <div className="bible-two-col">
                  <label>
                    Categoria
                    <select value={entry.category} onChange={(event) => updateTimelineEvent(entry.id, { category: event.target.value as SagaTimelineEvent['category'] })}>
                      <option value="other">Otro</option>
                      <option value="war">Guerra</option>
                      <option value="journey">Viaje</option>
                      <option value="birth">Nacimiento</option>
                      <option value="death">Muerte</option>
                      <option value="political">Politico</option>
                      <option value="discovery">Descubrimiento</option>
                      <option value="timeskip">Salto temporal</option>
                    </select>
                  </label>
                  <label>
                    Tipo
                    <select
                      value={entry.kind}
                      onChange={(event) => updateTimelineEvent(entry.id, { kind: event.target.value as SagaTimelineEvent['kind'], endOrder: event.target.value === 'span' ? entry.endOrder ?? entry.startOrder : null })}
                    >
                      <option value="point">Puntual</option>
                      <option value="span">Tramo</option>
                    </select>
                  </label>
                </div>
                <div className="bible-two-col">
                  <label>
                    Carril
                    <select
                      value={entry.laneId ?? ''}
                      onChange={(event) => {
                        const lane = worldBible.timelineLanes.find((option) => option.id === event.target.value);
                        updateTimelineEvent(entry.id, {
                          laneId: event.target.value,
                          laneLabel: lane?.label ?? entry.laneLabel ?? '',
                          eraLabel: lane?.era ?? entry.eraLabel ?? '',
                        });
                      }}
                    >
                      <option value="">Sin carril</option>
                      {laneOptions.map((option) => (
                        <option key={`${entry.id}-lane-${option.id}`} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Era / capa temporal
                    <input value={entry.eraLabel ?? ''} onChange={(event) => updateTimelineEvent(entry.id, { eraLabel: event.target.value })} />
                  </label>
                </div>
                <label>
                  Estado narrativo
                  <select
                    value={normalizeCanonStatus(entry.canonStatus)}
                    onChange={(event) =>
                      updateTimelineEvent(entry.id, {
                        canonStatus: event.target.value as SagaTimelineEvent['canonStatus'],
                      })
                    }
                  >
                    <option value="canonical">Canonico</option>
                    <option value="apocryphal">Apocrifo</option>
                  </select>
                </label>
                <div className="bible-two-col">
                  <label>
                    Inicio
                    <input type="number" min={1} value={entry.startOrder} onChange={(event) => updateTimelineEvent(entry.id, { startOrder: parsePositiveNumber(event.target.value, entry.startOrder) })} />
                  </label>
                  <label>
                    Fin
                    <input type="number" min={entry.startOrder} disabled={entry.kind === 'point'} value={entry.endOrder ?? ''} onChange={(event) => updateTimelineEvent(entry.id, { endOrder: parseOptionalNumber(event.target.value) })} />
                  </label>
                </div>
                <div className="bible-two-col">
                  <label>
                    Salto temporal (años)
                    <input
                      type="number"
                      min={0}
                      value={entry.timeJumpYears ?? ''}
                      onChange={(event) =>
                        updateTimelineEvent(entry.id, {
                          timeJumpYears: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="Ej: 10"
                    />
                  </label>
                  <label>
                    Automatizacion
                    <button type="button" onClick={() => applyTimeskipAutomation(entry.id)}>
                      Aplicar salto a edades
                    </button>
                  </label>
                </div>
                <label>
                  Resumen
                  <textarea rows={2} value={entry.summary} onChange={(event) => updateTimelineEvent(entry.id, { summary: event.target.value })} />
                </label>
                <label>
                  Notas
                  <textarea rows={3} value={entry.notes} onChange={(event) => updateTimelineEvent(entry.id, { notes: event.target.value })} />
                </label>
                <div className="bible-two-col">
                  <label>
                    Verdad objetiva
                    <textarea
                      rows={2}
                      value={entry.objectiveTruth ?? ''}
                      onChange={(event) => updateTimelineEvent(entry.id, { objectiveTruth: event.target.value })}
                    />
                  </label>
                  <label>
                    Verdad percibida
                    <textarea
                      rows={2}
                      value={entry.perceivedTruth ?? ''}
                      onChange={(event) => updateTimelineEvent(entry.id, { perceivedTruth: event.target.value })}
                    />
                  </label>
                </div>
                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Entidades relacionadas</h3>
                    <div className="top-toolbar-actions">
                      <select
                        value={timelineEntityDraftByEventId[entry.id] ?? ''}
                        onChange={(event) => updateTimelineEntityDraft(entry.id, event.target.value)}
                      >
                        <option value="">Seleccionar entidad</option>
                        {timelineEntityOptions
                          .filter((option) => !entry.entityIds.includes(option.id))
                          .map((option) => (
                            <option key={`${entry.id}-entity-option-${option.id}`} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                      </select>
                      <button type="button" onClick={() => addTimelineEntityRelation(entry.id)}>
                        Agregar
                      </button>
                    </div>
                  </div>
                  {entry.entityIds.length === 0 ? (
                    <p className="muted">Sin entidades vinculadas. Agrega personajes, lugares u objetos relevantes.</p>
                  ) : (
                    <div className="bible-card-list">
                      {entry.entityIds.map((entityId) => (
                        <article key={`${entry.id}-entity-${entityId}`} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{timelineEntityLabelById.get(entityId) ?? entityId}</strong>
                            <div className="top-toolbar-actions">
                              <button type="button" onClick={() => jumpToEntityContext(entityId)}>
                                Ir a entidad
                              </button>
                              <button type="button" onClick={() => removeTimelineEntityRelation(entry.id, entityId)}>
                                Quitar
                              </button>
                            </div>
                          </div>
                          <p className="muted">{entityId}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Referencias narrativas</h3>
                    <div className="top-toolbar-actions">
                      <label className="compact-label">
                        Evento origen
                        <select
                          value={getAutofillSourceEventId(entry.id)}
                          onChange={(event) => updateAutofillSourceEvent(entry.id, event.target.value)}
                        >
                          <option value="">Sin origen</option>
                          {timelineSortedByOrder
                            .filter((timelineEntry) => timelineEntry.id !== entry.id)
                            .map((timelineEntry) => (
                              <option key={`${entry.id}-ref-seed-${timelineEntry.id}`} value={timelineEntry.id}>
                                {timelineEntry.displayLabel || `T${timelineEntry.startOrder}`} |{' '}
                                {timelineEntry.title || timelineEntry.id}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="button" onClick={() => autofillTimelineBookRefsFromEvent(entry.id)}>
                        Autocompletar
                      </button>
                      <button type="button" onClick={() => addTimelineBookRef(entry.id)}>
                        Agregar referencia
                      </button>
                    </div>
                  </div>
                  {entry.bookRefs.length === 0 ? (
                    <p className="muted">Sin referencias. Podes marcar donde ocurre, se menciona o se revela el evento.</p>
                  ) : (
                    <div className="bible-card-list">
                      {entry.bookRefs.map((reference, index) => (
                        <article key={`${entry.id}-book-ref-${index}`} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{reference.chapterId || 'Referencia sin capitulo'}</strong>
                            <div className="top-toolbar-actions">
                              {reference.bookPath ? (
                                <button type="button" onClick={() => props.onOpenBook(reference.bookPath)}>
                                  Abrir libro
                                </button>
                              ) : null}
                              <button type="button" onClick={() => removeTimelineBookRef(entry.id, index)}>
                                Quitar
                              </button>
                            </div>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Libro
                              <select
                                value={reference.bookPath}
                                onChange={(event) =>
                                  updateTimelineBookRef(entry.id, index, { bookPath: event.target.value })
                                }
                              >
                                <option value="">Sin libro</option>
                                {linkedBookOptions.map((option) => (
                                  <option key={option.path} value={option.path}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Modo
                              <select
                                value={reference.mode}
                                onChange={(event) =>
                                  updateTimelineBookRef(entry.id, index, {
                                    mode: event.target.value as SagaTimelineChapterRef['mode'],
                                  })
                                }
                              >
                                <option value="occurs">Ocurre</option>
                                <option value="mentioned">Se menciona</option>
                                <option value="revealed">Se revela</option>
                              </select>
                            </label>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Capitulo
                              <input
                                list={`${entry.id}-chapter-options-${index}`}
                                value={reference.chapterId}
                                onChange={(event) =>
                                  updateTimelineBookRef(entry.id, index, { chapterId: event.target.value })
                                }
                                placeholder={
                                  (props.chapterOptionsByBook[reference.bookPath] ?? []).length > 0
                                    ? 'Selecciona o escribe capitulo'
                                    : 'ID o numero de capitulo'
                                }
                              />
                              <datalist id={`${entry.id}-chapter-options-${index}`}>
                                {(props.chapterOptionsByBook[reference.bookPath] ?? []).map((option) => (
                                  <option key={`${entry.id}-chapter-option-${option.id}`} value={option.id}>
                                    {option.title}
                                  </option>
                                ))}
                              </datalist>
                            </label>
                            <label>
                              Ubicacion (opcional)
                              <select
                                value={reference.locationId ?? ''}
                                onChange={(event) =>
                                  updateTimelineBookRef(entry.id, index, { locationId: event.target.value })
                                }
                              >
                                <option value="">Sin ubicacion</option>
                                {locationOptions.map((option) => (
                                  <option key={`${entry.id}-book-ref-location-${option.id}`} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Impactos de personajes</h3>
                    <div className="top-toolbar-actions">
                      <label className="compact-label">
                        Evento origen
                        <select
                          value={getAutofillSourceEventId(entry.id)}
                          onChange={(event) => updateAutofillSourceEvent(entry.id, event.target.value)}
                        >
                          <option value="">Sin origen</option>
                          {timelineSortedByOrder
                            .filter((timelineEntry) => timelineEntry.id !== entry.id)
                            .map((timelineEntry) => (
                              <option key={`${entry.id}-impact-seed-${timelineEntry.id}`} value={timelineEntry.id}>
                                {timelineEntry.displayLabel || `T${timelineEntry.startOrder}`} |{' '}
                                {timelineEntry.title || timelineEntry.id}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="button" onClick={() => autofillTimelineCharacterImpactsFromEvent(entry.id)}>
                        Autocompletar
                      </button>
                      <button type="button" onClick={() => generateTimelineCharacterImpactsFromEntities(entry.id)}>
                        Generar desde entidades
                      </button>
                      <button type="button" onClick={() => applyImpactVersionAutomation(entry.id)}>
                        Crear versiones
                      </button>
                      <button type="button" onClick={() => addTimelineCharacterImpact(entry.id)}>
                        Agregar impacto
                      </button>
                    </div>
                  </div>
                  {entry.characterImpacts.length === 0 ? (
                    <p className="muted">Sin impactos. Usa esta seccion para cambios de estado, heridas, titulos o apariciones.</p>
                  ) : (
                    <div className="bible-card-list">
                      {entry.characterImpacts.map((impact, index) => (
                        <article key={`${entry.id}-character-impact-${index}`} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{impact.aliasUsed || impact.impactType || 'Impacto sin detalle'}</strong>
                            <button type="button" onClick={() => removeTimelineCharacterImpact(entry.id, index)}>
                              Quitar
                            </button>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Personaje
                              <select
                                value={impact.characterId}
                                onChange={(event) =>
                                  updateTimelineCharacterImpact(entry.id, index, {
                                    characterId: event.target.value,
                                  })
                                }
                              >
                                <option value="">Sin personaje</option>
                                {characterOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Tipo
                              <select
                                value={impact.impactType}
                                onChange={(event) =>
                                  updateTimelineCharacterImpact(entry.id, index, {
                                    impactType: event.target.value as SagaTimelineCharacterImpact['impactType'],
                                  })
                                }
                              >
                                <option value="other">Otro</option>
                                <option value="birth">Nacimiento</option>
                                <option value="death">Muerte</option>
                                <option value="appearance">Aparicion</option>
                                <option value="disappearance">Desaparicion</option>
                                <option value="injury">Herida</option>
                                <option value="promotion">Ascenso</option>
                                <option value="betrayal">Traicion</option>
                                <option value="identity-change">Cambio de identidad</option>
                                <option value="relationship-change">Cambio relacional</option>
                              </select>
                            </label>
                          </div>
                          <label>
                            Alias usado
                            <input
                              value={impact.aliasUsed}
                              onChange={(event) =>
                                updateTimelineCharacterImpact(entry.id, index, {
                                  aliasUsed: event.target.value,
                                })
                              }
                              placeholder="Como aparece nombrado en este evento"
                            />
                          </label>
                          <label>
                            Cambio de estado
                            <textarea
                              rows={2}
                              value={impact.stateChange}
                              onChange={(event) =>
                                updateTimelineCharacterImpact(entry.id, index, {
                                  stateChange: event.target.value,
                                })
                              }
                              placeholder="Que cambia exactamente para este personaje"
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Ubicaciones de personajes</h3>
                    <div className="top-toolbar-actions">
                      <button type="button" onClick={() => suggestTimelineCharacterLocations(entry.id)}>
                        Sugerir por continuidad
                      </button>
                      <button type="button" onClick={() => addTimelineCharacterLocation(entry.id)}>
                        Agregar ubicacion
                      </button>
                    </div>
                  </div>
                  {(entry.characterLocations ?? []).length === 0 ? (
                    <p className="muted">Sin ubicaciones. Define donde esta cada personaje en este evento.</p>
                  ) : (
                    <div className="bible-card-list">
                      {(entry.characterLocations ?? []).map((locationEntry, index) => (
                        <article key={`${entry.id}-character-location-${index}`} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{locationEntry.characterId || 'Ubicacion sin personaje'}</strong>
                            <button type="button" onClick={() => removeTimelineCharacterLocation(entry.id, index)}>
                              Quitar
                            </button>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Personaje
                              <select
                                value={locationEntry.characterId}
                                onChange={(event) =>
                                  updateTimelineCharacterLocation(entry.id, index, { characterId: event.target.value })
                                }
                              >
                                <option value="">Sin personaje</option>
                                {characterOptions.map((option) => (
                                  <option key={`${entry.id}-loc-char-${option.id}`} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Ubicacion
                              <select
                                value={locationEntry.locationId}
                                onChange={(event) =>
                                  updateTimelineCharacterLocation(entry.id, index, { locationId: event.target.value })
                                }
                              >
                                <option value="">Sin ubicacion</option>
                                {locationOptions.map((option) => (
                                  <option key={`${entry.id}-loc-place-${option.id}`} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label>
                            Notas
                            <textarea
                              rows={2}
                              value={locationEntry.notes}
                              onChange={(event) =>
                                updateTimelineCharacterLocation(entry.id, index, { notes: event.target.value })
                              }
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Transferencias de artefactos</h3>
                    <div className="top-toolbar-actions">
                      <button type="button" onClick={() => suggestTimelineArtifactTransferOwners(entry.id)}>
                        Autocompletar origen
                      </button>
                      <button type="button" onClick={() => addTimelineArtifactTransfer(entry.id)}>
                        Agregar transferencia
                      </button>
                    </div>
                  </div>
                  {(entry.artifactTransfers ?? []).length === 0 ? (
                    <p className="muted">Sin transferencias. Registra quien tenia y quien recibe cada artefacto.</p>
                  ) : (
                    <div className="bible-card-list">
                      {(entry.artifactTransfers ?? []).map((transfer, index) => (
                        <article key={`${entry.id}-artifact-transfer-${index}`} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{transfer.artifactId || 'Transferencia sin artefacto'}</strong>
                            <button type="button" onClick={() => removeTimelineArtifactTransfer(entry.id, index)}>
                              Quitar
                            </button>
                          </div>
                          <label>
                            Artefacto
                            <select
                              value={transfer.artifactId}
                              onChange={(event) =>
                                updateTimelineArtifactTransfer(entry.id, index, { artifactId: event.target.value })
                              }
                            >
                              <option value="">Sin artefacto</option>
                              {artifactOptions.map((option) => (
                                <option key={`${entry.id}-artifact-${option.id}`} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="bible-two-col">
                            <label>
                              Desde personaje
                              <select
                                value={transfer.fromCharacterId}
                                onChange={(event) =>
                                  updateTimelineArtifactTransfer(entry.id, index, {
                                    fromCharacterId: event.target.value,
                                  })
                                }
                              >
                                <option value="">Sin origen</option>
                                {characterOptions.map((option) => (
                                  <option key={`${entry.id}-artifact-from-${option.id}`} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Hacia personaje
                              <select
                                value={transfer.toCharacterId}
                                onChange={(event) =>
                                  updateTimelineArtifactTransfer(entry.id, index, {
                                    toCharacterId: event.target.value,
                                  })
                                }
                              >
                                <option value="">Sin destino</option>
                                {characterOptions.map((option) => (
                                  <option key={`${entry.id}-artifact-to-${option.id}`} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label>
                            Notas
                            <textarea
                              rows={2}
                              value={transfer.notes}
                              onChange={(event) =>
                                updateTimelineArtifactTransfer(entry.id, index, { notes: event.target.value })
                              }
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Revelaciones y retcons</h3>
                    <button type="button" onClick={() => addTimelineSecretReveal(entry.id)}>
                      Agregar revelacion
                    </button>
                  </div>
                  {(entry.secretReveals ?? []).length === 0 ? (
                    <p className="muted">Sin revelaciones. Define si el evento muestra verdad objetiva, percibida, retcon o narrador no fiable.</p>
                  ) : (
                    <div className="bible-card-list">
                      {(entry.secretReveals ?? []).map((reveal, index) => (
                        <article key={`${entry.id}-secret-reveal-${index}`} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{reveal.secretId || 'Revelacion sin secreto'}</strong>
                            <button type="button" onClick={() => removeTimelineSecretReveal(entry.id, index)}>
                              Quitar
                            </button>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Secreto
                              <select
                                value={reveal.secretId}
                                onChange={(event) =>
                                  updateTimelineSecretReveal(entry.id, index, { secretId: event.target.value })
                                }
                              >
                                <option value="">Sin secreto</option>
                                {secretOptions.map((option) => (
                                  <option key={`${entry.id}-secret-${option.id}`} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Tipo de verdad
                              <select
                                value={reveal.truthMode}
                                onChange={(event) =>
                                  updateTimelineSecretReveal(entry.id, index, {
                                    truthMode: event.target.value as SagaTimelineSecretReveal['truthMode'],
                                  })
                                }
                              >
                                <option value="perceived">Percibida</option>
                                <option value="objective">Objetiva</option>
                                <option value="retcon">Retcon</option>
                                <option value="unreliable">Narrador no fiable</option>
                              </select>
                            </label>
                          </div>
                          <label>
                            Personaje que lo percibe
                            <select
                              value={reveal.perceiverCharacterId}
                              onChange={(event) =>
                                updateTimelineSecretReveal(entry.id, index, {
                                  perceiverCharacterId: event.target.value,
                                })
                              }
                            >
                              <option value="">Sin personaje</option>
                              {characterOptions.map((option) => (
                                <option key={`${entry.id}-reveal-char-${option.id}`} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Resumen
                            <textarea
                              rows={2}
                              value={reveal.summary}
                              onChange={(event) =>
                                updateTimelineSecretReveal(entry.id, index, { summary: event.target.value })
                              }
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </article>
            ))}
          </div>
        )}
      </section>}

      {activeTab === 'rules' && <>
      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Refactor seguro de IDs</h3>
        </div>
        <p className="muted">
          Renombra IDs sin romper relaciones, timeline, impactos, ubicaciones, transferencias ni revelaciones.
        </p>
        <div className="bible-two-col">
          <label>
            Tipo
            <select
              value={refactorKind}
              onChange={(event) => {
                const nextKind = event.target.value as SagaRefactorKind;
                setRefactorKind(nextKind);
                setRefactorSourceId('');
              }}
            >
              <option value="character">Personaje</option>
              <option value="location">Lugar</option>
              <option value="route">Ruta</option>
              <option value="flora">Flora</option>
              <option value="fauna">Fauna</option>
              <option value="faction">Faccion</option>
              <option value="system">Sistema</option>
              <option value="artifact">Artefacto</option>
              <option value="secret">Secreto</option>
              <option value="timeline-event">Evento timeline</option>
            </select>
          </label>
          <label>
            ID actual
            <select value={refactorSourceId} onChange={(event) => setRefactorSourceId(event.target.value)}>
              <option value="">Seleccionar</option>
              {refactorOptionsByKind[refactorKind].map((option) => (
                <option key={`refactor-source-${refactorKind}-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Nuevo ID
          <input
            value={refactorTargetId}
            onChange={(event) => setRefactorTargetId(event.target.value)}
            placeholder="Ej: char-elara-prime"
          />
        </label>
        <button type="button" onClick={applySafeIdRefactor}>
          Aplicar refactor de ID
        </button>
      </section>

      <label>
        Reglas globales de continuidad
        <textarea rows={4} value={worldBible.globalRules} onChange={(event) => updateWorldBible({ globalRules: event.target.value })} />
      </label>

      <label>
        Reglas fijadas para IA
        <textarea
          rows={4}
          value={worldBible.pinnedAiRules}
          onChange={(event) => updateWorldBible({ pinnedAiRules: event.target.value })}
          placeholder="Una regla por linea. Ej:\nLos dragones no hablan.\nLa magia no resucita muertos."
        />
      </label>

      <label>
        Glosario
        <textarea rows={4} value={worldBible.glossary} onChange={(event) => updateWorldBible({ glossary: event.target.value })} />
      </label>

      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Carriles temporales</h3>
          <button type="button" onClick={() => updateWorldBible({ timelineLanes: [...worldBible.timelineLanes, createEmptyTimelineLane()] })}>
            Agregar carril
          </button>
        </div>
        {worldBible.timelineLanes.length === 0 ? (
          <p className="muted">No hay carriles definidos. Usa esta seccion para historia antigua, linea principal, flashbacks o profecias.</p>
        ) : (
          <div className="bible-card-list">
            {worldBible.timelineLanes.map((lane) => (
              <article key={lane.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{lane.label || 'Carril sin nombre'}</strong>
                  <button type="button" onClick={() => updateWorldBible({ timelineLanes: worldBible.timelineLanes.filter((entry) => entry.id !== lane.id) })}>
                    Quitar
                  </button>
                </div>
                <div className="bible-two-col">
                  <label>
                    Nombre
                    <input value={lane.label} onChange={(event) => updateTimelineLane(lane.id, { label: event.target.value })} />
                  </label>
                  <label>
                    Era
                    <input value={lane.era} onChange={(event) => updateTimelineLane(lane.id, { era: event.target.value })} />
                  </label>
                </div>
                <div className="bible-two-col">
                  <label>
                    Color
                    <input value={lane.color} onChange={(event) => updateTimelineLane(lane.id, { color: event.target.value })} />
                  </label>
                  <label>
                    Descripcion
                    <input value={lane.description} onChange={(event) => updateTimelineLane(lane.id, { description: event.target.value })} />
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Conlangs</h3>
          <button type="button" onClick={() => updateWorldBible({ conlangs: [...worldBible.conlangs, createEmptyConlang()] })}>
            Agregar lengua
          </button>
        </div>
        {worldBible.conlangs.length === 0 ? (
          <p className="muted">No hay lenguas construidas. Define fonetica, gramatica y un lexicon controlado para mantener coherencia.</p>
        ) : (
          <div className="bible-card-list">
            {worldBible.conlangs.map((conlang) => (
              <article key={conlang.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{conlang.name || 'Lengua sin nombre'}</strong>
                  <button type="button" onClick={() => updateWorldBible({ conlangs: worldBible.conlangs.filter((entry) => entry.id !== conlang.id) })}>
                    Quitar
                  </button>
                </div>
                <label>
                  Nombre
                  <input value={conlang.name} onChange={(event) => updateConlang(conlang.id, { name: event.target.value })} />
                </label>
                <label>
                  Fonetica
                  <textarea rows={2} value={conlang.phonetics} onChange={(event) => updateConlang(conlang.id, { phonetics: event.target.value })} />
                </label>
                <label>
                  Notas gramaticales
                  <textarea rows={2} value={conlang.grammarNotes} onChange={(event) => updateConlang(conlang.id, { grammarNotes: event.target.value })} />
                </label>
                <label>
                  Reglas de estilo y ortografia
                  <textarea rows={2} value={conlang.styleRules} onChange={(event) => updateConlang(conlang.id, { styleRules: event.target.value })} />
                </label>
                <label>
                  Texto de muestra
                  <textarea rows={2} value={conlang.sampleText} onChange={(event) => updateConlang(conlang.id, { sampleText: event.target.value })} />
                </label>
                <section className="bible-section">
                  <div className="bible-section-head">
                    <h3>Lexicon</h3>
                    <button
                      type="button"
                      onClick={() =>
                        updateConlang(conlang.id, {
                          lexicon: [...conlang.lexicon, createEmptyConlangLexiconEntry()],
                        })
                      }
                    >
                      Agregar termino
                    </button>
                  </div>
                  {conlang.lexicon.length === 0 ? (
                    <p className="muted">Sin terminos registrados.</p>
                  ) : (
                    <div className="bible-card-list">
                      {conlang.lexicon.map((term) => (
                        <article key={term.id} className="bible-card">
                          <div className="bible-card-head">
                            <strong>{term.term || 'Termino sin texto'}</strong>
                            <button
                              type="button"
                              onClick={() =>
                                updateConlang(conlang.id, {
                                  lexicon: conlang.lexicon.filter((entry) => entry.id !== term.id),
                                })
                              }
                            >
                              Quitar
                            </button>
                          </div>
                          <div className="bible-two-col">
                            <label>
                              Termino
                              <input value={term.term} onChange={(event) => updateConlangLexiconEntry(conlang.id, term.id, { term: event.target.value })} />
                            </label>
                            <label>
                              Traduccion
                              <input value={term.translation} onChange={(event) => updateConlangLexiconEntry(conlang.id, term.id, { translation: event.target.value })} />
                            </label>
                          </div>
                          <label>
                            Notas
                            <textarea rows={2} value={term.notes} onChange={(event) => updateConlangLexiconEntry(conlang.id, term.id, { notes: event.target.value })} />
                          </label>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bible-section">
        <div className="bible-section-head">
          <h3>Sistemas de magia y poder</h3>
          <button type="button" onClick={() => updateWorldBible({ magicSystems: [...worldBible.magicSystems, createEmptyMagicSystem()] })}>
            Agregar sistema
          </button>
        </div>
        {worldBible.magicSystems.length === 0 ? (
          <p className="muted">No hay sistemas de magia definidos. Declara fuente, costos, limites y actos prohibidos para que la validacion pueda auditar el canon.</p>
        ) : (
          <div className="bible-card-list">
            {worldBible.magicSystems.map((system) => (
              <article key={system.id} className="bible-card">
                <div className="bible-card-head">
                  <strong>{system.name || 'Sistema sin nombre'}</strong>
                  <button type="button" onClick={() => updateWorldBible({ magicSystems: worldBible.magicSystems.filter((entry) => entry.id !== system.id) })}>
                    Quitar
                  </button>
                </div>
                <label>
                  Nombre
                  <input value={system.name} onChange={(event) => updateMagicSystem(system.id, { name: event.target.value })} />
                </label>
                <label>
                  Resumen
                  <textarea rows={2} value={system.summary} onChange={(event) => updateMagicSystem(system.id, { summary: event.target.value })} />
                </label>
                <label>
                  Fuente
                  <textarea rows={2} value={system.source} onChange={(event) => updateMagicSystem(system.id, { source: event.target.value })} placeholder="De donde nace el poder" />
                </label>
                <label>
                  Costos
                  <textarea rows={2} value={system.costs} onChange={(event) => updateMagicSystem(system.id, { costs: event.target.value })} placeholder="Que se paga por usarlo" />
                </label>
                <label>
                  Limites
                  <textarea rows={2} value={system.limits} onChange={(event) => updateMagicSystem(system.id, { limits: event.target.value })} placeholder="Que no puede hacer" />
                </label>
                <label>
                  Actos prohibidos
                  <textarea rows={2} value={system.forbiddenActs} onChange={(event) => updateMagicSystem(system.id, { forbiddenActs: event.target.value })} placeholder="Una prohibicion por linea" />
                </label>
                <label>
                  Pistas para validacion
                  <textarea rows={2} value={system.validationHints} onChange={(event) => updateMagicSystem(system.id, { validationHints: event.target.value })} placeholder="Palabras o indicios validos para excepciones/costos" />
                </label>
              </article>
            ))}
          </div>
        )}
      </section>
      </>}
    </section>
  );
}

export default SagaPanel;
