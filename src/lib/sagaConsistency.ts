import type { SagaBookLink, SagaCharacter, SagaProject, SagaSecret, SagaTimelineEvent } from '../types/book';
import { filterSagaWorldByCanon } from './canon';

export type SagaConsistencySeverity = 'error' | 'warning';

export type SagaConsistencyCode =
  | 'missing-event-ref'
  | 'missing-book-ref'
  | 'missing-character-ref'
  | 'missing-location-ref'
  | 'missing-artifact-ref'
  | 'missing-secret-ref'
  | 'missing-entity-ref'
  | 'character-before-birth'
  | 'character-after-death'
  | 'character-mentioned-after-death'
  | 'alias-out-of-range'
  | 'alias-context-mismatch'
  | 'invalid-lifecycle-order'
  | 'character-version-overlap'
  | 'artifact-owner-mismatch'
  | 'impossible-travel'
  | 'relationship-range-invalid'
  | 'timeline-lane-missing'
  | 'timeline-dependency-missing'
  | 'atlas-pin-missing'
  | 'magic-rule-risk';

export interface SagaConsistencyIssue {
  id: string;
  severity: SagaConsistencySeverity;
  code: SagaConsistencyCode;
  message: string;
  eventId: string | null;
  characterId: string | null;
  bookPath: string | null;
}

export interface SagaConsistencyReport {
  issues: SagaConsistencyIssue[];
  errorCount: number;
  warningCount: number;
}

export function buildTimelineEventIndex(saga: SagaProject): Map<string, SagaTimelineEvent> {
  const indexed = new Map<string, SagaTimelineEvent>();
  for (const entry of saga.metadata.worldBible.timeline) {
    if (entry.id.trim()) {
      indexed.set(entry.id, entry);
    }
  }
  return indexed;
}

export function buildLinkedBookIndex(saga: SagaProject): Map<string, SagaBookLink> {
  const indexed = new Map<string, SagaBookLink>();
  for (const entry of saga.metadata.books) {
    if (entry.bookPath.trim()) {
      indexed.set(entry.bookPath, entry);
    }
  }
  return indexed;
}

export function buildCharacterIndex(saga: SagaProject): Map<string, SagaCharacter> {
  const indexed = new Map<string, SagaCharacter>();
  for (const entry of saga.metadata.worldBible.characters) {
    if (entry.id.trim()) {
      indexed.set(entry.id, entry);
    }
  }
  return indexed;
}

export function buildLocationIndex(saga: SagaProject): Map<string, SagaProject['metadata']['worldBible']['locations'][number]> {
  const indexed = new Map<string, SagaProject['metadata']['worldBible']['locations'][number]>();
  for (const entry of saga.metadata.worldBible.locations) {
    if (entry.id.trim()) {
      indexed.set(entry.id, entry);
    }
  }
  return indexed;
}

export function buildArtifactIndex(saga: SagaProject): Map<string, SagaProject['metadata']['worldBible']['artifacts'][number]> {
  const indexed = new Map<string, SagaProject['metadata']['worldBible']['artifacts'][number]>();
  for (const entry of saga.metadata.worldBible.artifacts) {
    if (entry.id.trim()) {
      indexed.set(entry.id, entry);
    }
  }
  return indexed;
}

export function buildSecretIndex(saga: SagaProject): Map<string, SagaSecret> {
  const indexed = new Map<string, SagaSecret>();
  for (const entry of saga.metadata.worldBible.secrets ?? []) {
    if (entry.id.trim()) {
      indexed.set(entry.id, entry);
    }
  }
  return indexed;
}

function buildLocationConnections(saga: SagaProject): Set<string> {
  const links = new Set<string>();
  for (const relationship of saga.metadata.worldBible.relationships) {
    if (relationship.from.kind !== 'location' || relationship.to.kind !== 'location') {
      continue;
    }

    const left = relationship.from.id.trim();
    const right = relationship.to.id.trim();
    if (!left || !right) {
      continue;
    }

    const key = [left, right].sort().join('::');
    links.add(key);
  }
  return links;
}

function hasLocationConnection(links: Set<string>, left: string, right: string): boolean {
  if (!left || !right || left === right) {
    return true;
  }
  return links.has([left, right].sort().join('::'));
}

function normalizeSemanticKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRuleLines(value: string): string[] {
  return value
    .split(/\n+/)
    .map((entry) => normalizeSemanticKey(entry))
    .filter((entry) => entry.length >= 3);
}

export function resolveEventOrderRange(event: SagaTimelineEvent): { start: number; end: number } {
  return {
    start: event.startOrder,
    end: event.endOrder ?? event.startOrder,
  };
}

export function isAliasActiveAtOrder(character: SagaCharacter, aliasUsed: string, order: number): boolean {
  const target = normalizeSemanticKey(aliasUsed);
  if (!target) {
    return true;
  }

  if (normalizeSemanticKey(character.name) === target) {
    return true;
  }

  const matchingAliases = character.aliasTimeline.filter((entry) => normalizeSemanticKey(entry.value) === target);
  if (matchingAliases.length > 0) {
    return matchingAliases.some((entry) => {
      const startsBefore = entry.startOrder === null || entry.startOrder <= order;
      const endsAfter = entry.endOrder === null || entry.endOrder >= order;
      return startsBefore && endsAfter;
    });
  }

  const aliasMatches = character.aliases
    .split(',')
    .map((entry) => normalizeSemanticKey(entry))
    .filter(Boolean)
    .includes(target);

  if (aliasMatches) {
    return true;
  }

  const characterNameKey = normalizeSemanticKey(character.name);
  return Boolean(characterNameKey && target.includes(characterNameKey));
}

export function buildSagaConsistencyReport(saga: SagaProject): SagaConsistencyReport {
  const canonicalSaga: SagaProject = {
    ...saga,
    metadata: {
      ...saga.metadata,
      worldBible: filterSagaWorldByCanon(saga.metadata.worldBible),
    },
  };
  const timelineIndex = buildTimelineEventIndex(canonicalSaga);
  const bookIndex = buildLinkedBookIndex(canonicalSaga);
  const characterIndex = buildCharacterIndex(canonicalSaga);
  const locationIndex = buildLocationIndex(canonicalSaga);
  const artifactIndex = buildArtifactIndex(canonicalSaga);
  const secretIndex = buildSecretIndex(canonicalSaga);
  const locationConnections = buildLocationConnections(canonicalSaga);
  const timelineLaneIds = new Set(canonicalSaga.metadata.worldBible.timelineLanes.map((entry) => entry.id.trim()).filter(Boolean));
  const atlasPinnedLocationIds = new Set(canonicalSaga.metadata.worldBible.atlas.pins.map((entry) => entry.locationId.trim()).filter(Boolean));
  const magicSystems = canonicalSaga.metadata.worldBible.magicSystems;
  const sortedTimeline = [...canonicalSaga.metadata.worldBible.timeline].sort((a, b) => {
    if (a.startOrder !== b.startOrder) {
      return a.startOrder - b.startOrder;
    }
    return a.id.localeCompare(b.id);
  });
  const issues: SagaConsistencyIssue[] = [];

  const addIssue = (issue: Omit<SagaConsistencyIssue, 'id'>): void => {
    issues.push({
      id: `issue-${issues.length + 1}`,
      ...issue,
    });
  };

  const resolveLifecycleEvent = (eventId: string | null): SagaTimelineEvent | null => {
    if (!eventId) {
      return null;
    }
    return timelineIndex.get(eventId) ?? null;
  };

  const hasEntityReference = (kind: SagaProject['metadata']['worldBible']['relationships'][number]['from']['kind'], id: string): boolean => {
    if (!id.trim()) {
      return false;
    }

    switch (kind) {
      case 'character':
        return canonicalSaga.metadata.worldBible.characters.some((entry) => entry.id === id);
      case 'location':
        return canonicalSaga.metadata.worldBible.locations.some((entry) => entry.id === id);
      case 'route':
        return canonicalSaga.metadata.worldBible.routes.some((entry) => entry.id === id);
      case 'flora':
        return canonicalSaga.metadata.worldBible.flora.some((entry) => entry.id === id);
      case 'fauna':
        return canonicalSaga.metadata.worldBible.fauna.some((entry) => entry.id === id);
      case 'faction':
        return canonicalSaga.metadata.worldBible.factions.some((entry) => entry.id === id);
      case 'system':
        return canonicalSaga.metadata.worldBible.systems.some((entry) => entry.id === id);
      case 'artifact':
        return canonicalSaga.metadata.worldBible.artifacts.some((entry) => entry.id === id);
    }
  };

  for (const character of canonicalSaga.metadata.worldBible.characters) {
    const lifecycleRefs: Array<{ label: string; eventId: string | null }> = [
      { label: 'nacimiento', eventId: character.lifecycle.birthEventId },
      { label: 'muerte', eventId: character.lifecycle.deathEventId },
      { label: 'primera aparicion', eventId: character.lifecycle.firstAppearanceEventId },
      { label: 'ultimo evento conocido', eventId: character.lifecycle.lastKnownEventId },
    ];

    for (const ref of lifecycleRefs) {
      if (!ref.eventId) {
        continue;
      }

      if (!timelineIndex.has(ref.eventId)) {
        addIssue({
          severity: 'error',
          code: 'missing-event-ref',
          message: `El personaje "${character.name || character.id}" referencia un evento inexistente en ${ref.label}.`,
          eventId: ref.eventId,
          characterId: character.id,
          bookPath: null,
        });
      }
    }

    const birthEvent = resolveLifecycleEvent(character.lifecycle.birthEventId);
    const deathEvent = resolveLifecycleEvent(character.lifecycle.deathEventId);
    const firstAppearanceEvent = resolveLifecycleEvent(character.lifecycle.firstAppearanceEventId);
    const lastKnownEvent = resolveLifecycleEvent(character.lifecycle.lastKnownEventId);

    if (birthEvent && deathEvent && resolveEventOrderRange(birthEvent).start > resolveEventOrderRange(deathEvent).end) {
      addIssue({
        severity: 'error',
        code: 'invalid-lifecycle-order',
        message: `El nacimiento de "${character.name || character.id}" ocurre despues de su muerte.`,
        eventId: deathEvent.id,
        characterId: character.id,
        bookPath: null,
      });
    }

    if (
      birthEvent &&
      firstAppearanceEvent &&
      resolveEventOrderRange(firstAppearanceEvent).start < resolveEventOrderRange(birthEvent).start
    ) {
      addIssue({
        severity: 'error',
        code: 'invalid-lifecycle-order',
        message: `La primera aparicion de "${character.name || character.id}" ocurre antes de su nacimiento.`,
        eventId: firstAppearanceEvent.id,
        characterId: character.id,
        bookPath: null,
      });
    }

    if (
      deathEvent &&
      lastKnownEvent &&
      resolveEventOrderRange(lastKnownEvent).end > resolveEventOrderRange(deathEvent).end
    ) {
      addIssue({
        severity: 'warning',
        code: 'invalid-lifecycle-order',
        message: `El ultimo evento conocido de "${character.name || character.id}" queda despues de su muerte.`,
        eventId: lastKnownEvent.id,
        characterId: character.id,
        bookPath: null,
      });
    }

    const versions = [...(character.versions ?? [])].sort((a, b) => {
      const aStart = a.startOrder ?? Number.MIN_SAFE_INTEGER;
      const bStart = b.startOrder ?? Number.MIN_SAFE_INTEGER;
      if (aStart !== bStart) {
        return aStart - bStart;
      }
      const aEnd = a.endOrder ?? Number.MAX_SAFE_INTEGER;
      const bEnd = b.endOrder ?? Number.MAX_SAFE_INTEGER;
      return aEnd - bEnd;
    });

    for (let index = 0; index < versions.length; index += 1) {
      const current = versions[index];
      const currentStart = current.startOrder ?? Number.MIN_SAFE_INTEGER;
      const currentEnd = current.endOrder ?? Number.MAX_SAFE_INTEGER;
      if (current.endOrder !== null && current.startOrder !== null && current.endOrder < current.startOrder) {
        addIssue({
          severity: 'warning',
          code: 'character-version-overlap',
          message: `La version "${current.label || current.id}" de "${character.name || character.id}" tiene rango invertido.`,
          eventId: null,
          characterId: character.id,
          bookPath: null,
        });
      }

      const next = versions[index + 1];
      if (!next) {
        continue;
      }
      const nextStart = next.startOrder ?? Number.MIN_SAFE_INTEGER;
      if (nextStart <= currentEnd && currentStart !== Number.MIN_SAFE_INTEGER) {
        addIssue({
          severity: 'warning',
          code: 'character-version-overlap',
          message: `Las versiones "${current.label || current.id}" y "${next.label || next.id}" de "${character.name || character.id}" se superponen.`,
          eventId: null,
          characterId: character.id,
          bookPath: null,
        });
      }
    }
  }

  for (const relationship of canonicalSaga.metadata.worldBible.relationships) {
    if (!hasEntityReference(relationship.from.kind, relationship.from.id)) {
      addIssue({
        severity: 'warning',
        code: 'missing-entity-ref',
        message: `La relacion "${relationship.type || relationship.id}" referencia una entidad de origen inexistente.`,
        eventId: null,
        characterId: relationship.from.kind === 'character' ? relationship.from.id || null : null,
        bookPath: null,
      });
    }

    if (!hasEntityReference(relationship.to.kind, relationship.to.id)) {
      addIssue({
        severity: 'warning',
        code: 'missing-entity-ref',
        message: `La relacion "${relationship.type || relationship.id}" referencia una entidad de destino inexistente.`,
        eventId: null,
        characterId: relationship.to.kind === 'character' ? relationship.to.id || null : null,
        bookPath: null,
      });
    }

    if (
      relationship.startOrder !== null &&
      relationship.startOrder !== undefined &&
      relationship.endOrder !== null &&
      relationship.endOrder !== undefined &&
      relationship.endOrder < relationship.startOrder
    ) {
      addIssue({
        severity: 'warning',
        code: 'relationship-range-invalid',
        message: `La relacion "${relationship.type || relationship.id}" tiene rango temporal invertido.`,
        eventId: null,
        characterId: relationship.from.kind === 'character' ? relationship.from.id || null : null,
        bookPath: null,
      });
    }
  }

  if (canonicalSaga.metadata.worldBible.atlas.mapImagePath.trim()) {
    for (const location of canonicalSaga.metadata.worldBible.locations) {
      if (atlasPinnedLocationIds.has(location.id)) {
        continue;
      }
      addIssue({
        severity: 'warning',
        code: 'atlas-pin-missing',
        message: `El lugar "${location.name || location.id}" no tiene pin en el atlas visual.`,
        eventId: null,
        characterId: null,
        bookPath: null,
      });
    }
  }

  const artifactOwnerById = new Map<string, string | null>();
  const characterLocationHistory = new Map<string, Array<{ eventId: string; order: number; locationId: string }>>();

  for (const event of sortedTimeline) {
    if (event.laneId?.trim() && !timelineLaneIds.has(event.laneId.trim())) {
      addIssue({
        severity: 'warning',
        code: 'timeline-lane-missing',
        message: `El evento "${event.title || event.id}" apunta a un carril temporal inexistente.`,
        eventId: event.id,
        characterId: null,
        bookPath: null,
      });
    }
    for (const dependencyId of event.dependencyIds ?? []) {
      const dependency = timelineIndex.get(dependencyId);
      if (!dependency) {
        addIssue({
          severity: 'warning',
          code: 'timeline-dependency-missing',
          message: `El evento "${event.title || event.id}" depende de un evento inexistente.`,
          eventId: event.id,
          characterId: null,
          bookPath: null,
        });
        continue;
      }

      if (resolveEventOrderRange(dependency).start > resolveEventOrderRange(event).start) {
        addIssue({
          severity: 'warning',
          code: 'timeline-dependency-missing',
          message: `El evento "${event.title || event.id}" depende de "${dependency.title || dependency.id}" pero su orden queda invertido.`,
          eventId: event.id,
          characterId: null,
          bookPath: null,
        });
      }
    }

    const eventHasOccursReference = event.bookRefs.some((reference) => reference.mode === 'occurs');
    const eventSemanticText = normalizeSemanticKey(
      `${event.title} ${event.summary} ${event.notes} ${event.objectiveTruth ?? ''} ${event.perceivedTruth ?? ''}`,
    );
    for (const system of magicSystems) {
      const forbiddenEntries = splitRuleLines(system.forbiddenActs);
      const hintEntries = splitRuleLines(system.validationHints);
      const costs = splitRuleLines(system.costs);
      if (forbiddenEntries.length === 0 || !eventSemanticText) {
        continue;
      }

      const matchedForbidden = forbiddenEntries.find((entry) => eventSemanticText.includes(entry));
      if (!matchedForbidden) {
        continue;
      }

      const mentionsCost = costs.some((entry) => eventSemanticText.includes(entry));
      const mentionsHint = hintEntries.some((entry) => eventSemanticText.includes(entry));
      if (mentionsCost || mentionsHint) {
        continue;
      }

      addIssue({
        severity: 'warning',
        code: 'magic-rule-risk',
        message: `El evento "${event.title || event.id}" parece rozar una prohibicion del sistema "${system.name}" sin evidencia de costo o excepcion.`,
        eventId: event.id,
        characterId: null,
        bookPath: null,
      });
    }

    const characterTouchContext = new Map<
      string,
      {
        entity: boolean;
        impact: boolean;
        location: boolean;
        transfer: boolean;
        reveal: boolean;
      }
    >();
    const markCharacterTouch = (
      characterId: string,
      source: 'entity' | 'impact' | 'location' | 'transfer' | 'reveal',
    ): void => {
      if (!characterId.trim()) {
        return;
      }
      const current = characterTouchContext.get(characterId) ?? {
        entity: false,
        impact: false,
        location: false,
        transfer: false,
        reveal: false,
      };
      current[source] = true;
      characterTouchContext.set(characterId, current);
    };

    for (const reference of event.bookRefs) {
      if (!reference.bookPath.trim()) {
        if (!reference.locationId?.trim()) {
          continue;
        }
      }

      const referenceLocationId = reference.locationId?.trim() ?? '';
      if (referenceLocationId && !locationIndex.has(referenceLocationId)) {
        addIssue({
          severity: 'error',
          code: 'missing-location-ref',
          message: `El evento "${event.title || event.id}" referencia una ubicacion inexistente en una referencia narrativa.`,
          eventId: event.id,
          characterId: null,
          bookPath: reference.bookPath || null,
        });
      }

      if (reference.bookPath.trim() && !bookIndex.has(reference.bookPath)) {
        addIssue({
          severity: 'warning',
          code: 'missing-book-ref',
          message: `El evento "${event.title || event.id}" apunta a un libro no vinculado: ${reference.bookPath}.`,
          eventId: event.id,
          characterId: null,
          bookPath: reference.bookPath,
        });
      }
    }

    const touchedCharacterIds = new Set<string>();
    for (const entityId of event.entityIds) {
      if (characterIndex.has(entityId)) {
        touchedCharacterIds.add(entityId);
        markCharacterTouch(entityId, 'entity');
      }
    }

    for (const impact of event.characterImpacts) {
      const characterId = impact.characterId.trim();
      if (!characterId || !characterIndex.has(characterId)) {
        addIssue({
          severity: 'error',
          code: 'missing-character-ref',
          message: `El evento "${event.title || event.id}" referencia un personaje inexistente en sus impactos.`,
          eventId: event.id,
          characterId: characterId || null,
          bookPath: null,
        });
        continue;
      }

      touchedCharacterIds.add(characterId);
      markCharacterTouch(characterId, 'impact');
      const character = characterIndex.get(characterId);
      if (!character) {
        continue;
      }

      if (impact.aliasUsed.trim() && !isAliasActiveAtOrder(character, impact.aliasUsed, event.startOrder)) {
        addIssue({
          severity: eventHasOccursReference ? 'error' : 'warning',
          code: eventHasOccursReference ? 'alias-out-of-range' : 'alias-context-mismatch',
          message: eventHasOccursReference
            ? `El alias "${impact.aliasUsed}" no esta activo para "${character.name || character.id}" en el orden ${event.startOrder}.`
            : `El alias "${impact.aliasUsed}" no coincide con la fecha del personaje "${character.name || character.id}" en contexto narrativo no-occurs (${event.startOrder}).`,
          eventId: event.id,
          characterId: character.id,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }
    }

    for (const characterLocation of event.characterLocations ?? []) {
      const characterId = characterLocation.characterId.trim();
      const locationId = characterLocation.locationId.trim();
      if (!characterId || !characterIndex.has(characterId)) {
        addIssue({
          severity: 'error',
          code: 'missing-character-ref',
          message: `El evento "${event.title || event.id}" registra una ubicacion con personaje inexistente.`,
          eventId: event.id,
          characterId: characterId || null,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
        continue;
      }
      if (!locationId || !locationIndex.has(locationId)) {
        addIssue({
          severity: 'error',
          code: 'missing-location-ref',
          message: `El evento "${event.title || event.id}" registra una ubicacion inexistente para "${characterIndex.get(characterId)?.name || characterId}".`,
          eventId: event.id,
          characterId,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
        continue;
      }

      touchedCharacterIds.add(characterId);
      markCharacterTouch(characterId, 'location');
      const history = characterLocationHistory.get(characterId) ?? [];
      history.push({ eventId: event.id, order: event.startOrder, locationId });
      characterLocationHistory.set(characterId, history);
    }

    for (const transfer of event.artifactTransfers ?? []) {
      const artifactId = transfer.artifactId.trim();
      const fromCharacterId = transfer.fromCharacterId.trim();
      const toCharacterId = transfer.toCharacterId.trim();

      if (!artifactId || !artifactIndex.has(artifactId)) {
        addIssue({
          severity: 'error',
          code: 'missing-artifact-ref',
          message: `El evento "${event.title || event.id}" registra una transferencia sobre un artefacto inexistente.`,
          eventId: event.id,
          characterId: null,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
        continue;
      }

      if (fromCharacterId && !characterIndex.has(fromCharacterId)) {
        addIssue({
          severity: 'error',
          code: 'missing-character-ref',
          message: `El evento "${event.title || event.id}" usa un personaje origen inexistente en la transferencia de artefacto.`,
          eventId: event.id,
          characterId: fromCharacterId,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }

      if (toCharacterId && !characterIndex.has(toCharacterId)) {
        addIssue({
          severity: 'error',
          code: 'missing-character-ref',
          message: `El evento "${event.title || event.id}" usa un personaje destino inexistente en la transferencia de artefacto.`,
          eventId: event.id,
          characterId: toCharacterId,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }

      if (fromCharacterId && characterIndex.has(fromCharacterId)) {
        touchedCharacterIds.add(fromCharacterId);
        markCharacterTouch(fromCharacterId, 'transfer');
      }
      if (toCharacterId && characterIndex.has(toCharacterId)) {
        touchedCharacterIds.add(toCharacterId);
        markCharacterTouch(toCharacterId, 'transfer');
      }

      const currentOwner = artifactOwnerById.get(artifactId) ?? null;
      if (fromCharacterId && currentOwner && currentOwner !== fromCharacterId) {
        addIssue({
          severity: 'warning',
          code: 'artifact-owner-mismatch',
          message: `El artefacto "${artifactId}" cambia de manos desde "${fromCharacterId}", pero su ultimo poseedor registrado era "${currentOwner}".`,
          eventId: event.id,
          characterId: fromCharacterId,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }

      artifactOwnerById.set(artifactId, toCharacterId || null);
    }

    for (const reveal of event.secretReveals ?? []) {
      const secretId = reveal.secretId.trim();
      const perceiverCharacterId = reveal.perceiverCharacterId.trim();
      if (!secretId || !secretIndex.has(secretId)) {
        addIssue({
          severity: 'error',
          code: 'missing-secret-ref',
          message: `El evento "${event.title || event.id}" referencia un secreto inexistente.`,
          eventId: event.id,
          characterId: null,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }
      if (perceiverCharacterId && !characterIndex.has(perceiverCharacterId)) {
        addIssue({
          severity: 'error',
          code: 'missing-character-ref',
          message: `El evento "${event.title || event.id}" referencia un personaje inexistente en una revelacion.`,
          eventId: event.id,
          characterId: perceiverCharacterId,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }
      if (perceiverCharacterId && characterIndex.has(perceiverCharacterId)) {
        touchedCharacterIds.add(perceiverCharacterId);
        markCharacterTouch(perceiverCharacterId, 'reveal');
      }
    }

    for (const characterId of touchedCharacterIds) {
      const character = characterIndex.get(characterId);
      if (!character) {
        continue;
      }

      const birthEvent = character.lifecycle.birthEventId ? timelineIndex.get(character.lifecycle.birthEventId) ?? null : null;
      const deathEvent = character.lifecycle.deathEventId ? timelineIndex.get(character.lifecycle.deathEventId) ?? null : null;

      if (birthEvent && event.startOrder < resolveEventOrderRange(birthEvent).start) {
        addIssue({
          severity: 'error',
          code: 'character-before-birth',
          message: `El personaje "${character.name || character.id}" aparece antes de su nacimiento en "${event.title || event.id}".`,
          eventId: event.id,
          characterId: character.id,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }

      if (deathEvent && event.startOrder > resolveEventOrderRange(deathEvent).end) {
        const touch = characterTouchContext.get(characterId) ?? {
          entity: false,
          impact: false,
          location: false,
          transfer: false,
          reveal: false,
        };
        const hasActiveParticipation = touch.impact || touch.location || touch.transfer || touch.reveal;
        const mentionOnly = touch.entity && !hasActiveParticipation;
        if (mentionOnly && !eventHasOccursReference) {
          addIssue({
            severity: 'warning',
            code: 'character-mentioned-after-death',
            message: `El personaje "${character.name || character.id}" es mencionado despues de su muerte en "${event.title || event.id}".`,
            eventId: event.id,
            characterId: character.id,
            bookPath: event.bookRefs[0]?.bookPath || null,
          });
          continue;
        }
        addIssue({
          severity: 'error',
          code: 'character-after-death',
          message: `El personaje "${character.name || character.id}" aparece despues de su muerte en "${event.title || event.id}".`,
          eventId: event.id,
          characterId: character.id,
          bookPath: event.bookRefs[0]?.bookPath || null,
        });
      }
    }
  }

  for (const [characterId, entries] of characterLocationHistory.entries()) {
    const sortedEntries = [...entries].sort((a, b) => a.order - b.order || a.eventId.localeCompare(b.eventId));
    for (let index = 1; index < sortedEntries.length; index += 1) {
      const previous = sortedEntries[index - 1];
      const current = sortedEntries[index];
      if (previous.locationId === current.locationId) {
        continue;
      }

      const orderGap = current.order - previous.order;
      if (orderGap > 1) {
        continue;
      }

      if (hasLocationConnection(locationConnections, previous.locationId, current.locationId)) {
        continue;
      }

      addIssue({
        severity: 'warning',
        code: 'impossible-travel',
        message: `El personaje "${characterIndex.get(characterId)?.name || characterId}" cambia de "${previous.locationId}" a "${current.locationId}" sin conexion directa entre eventos consecutivos.`,
        eventId: current.eventId,
        characterId,
        bookPath: null,
      });
    }
  }

  const errorCount = issues.filter((entry) => entry.severity === 'error').length;
  const warningCount = issues.length - errorCount;

  return {
    issues,
    errorCount,
    warningCount,
  };
}
