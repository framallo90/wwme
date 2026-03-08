import { randomId } from './text';
import type {
  SagaCharacter,
  SagaCharacterStatus,
  SagaEntityKind,
  SagaTimelineArtifactTransfer,
  SagaTimelineCharacterLocation,
  SagaWorldBible,
} from '../types/book';

export const SAGA_RELATIONSHIP_TYPES = [
  'parent-of',
  'child-of',
  'sibling-of',
  'spouse-of',
  'ally-of',
  'enemy-of',
  'member-of',
  'leads',
  'controls',
  'located-in',
  'owns',
  'mentor-of',
  'betrayed-by',
] as const;

const KNOWN_RELATIONSHIP_TYPE_SET = new Set<string>(
  SAGA_RELATIONSHIP_TYPES.map((entry) => entry.toLowerCase()),
);

const VERSION_TRIGGER_IMPACTS = new Set([
  'identity-change',
  'promotion',
  'betrayal',
  'death',
  'disappearance',
]);

function sortTimeline(worldBible: SagaWorldBible): SagaWorldBible['timeline'] {
  return [...worldBible.timeline].sort((left, right) => {
    if (left.startOrder !== right.startOrder) {
      return left.startOrder - right.startOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

function findTimelineIndexById(worldBible: SagaWorldBible, eventId: string): number {
  const timeline = sortTimeline(worldBible);
  return timeline.findIndex((entry) => entry.id === eventId);
}

function getCharacterSet(worldBible: SagaWorldBible): Set<string> {
  return new Set(worldBible.characters.map((entry) => entry.id));
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase();
}

function sortCharacterVersions(character: SagaCharacter): SagaCharacter {
  const versions = [...(character.versions ?? [])].sort((left, right) => {
    const leftStart = left.startOrder ?? Number.MAX_SAFE_INTEGER;
    const rightStart = right.startOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    return left.label.localeCompare(right.label);
  });

  return {
    ...character,
    versions,
  };
}

export function isKnownRelationshipType(type: string): boolean {
  const normalized = normalizeType(type);
  if (!normalized) {
    return false;
  }
  return KNOWN_RELATIONSHIP_TYPE_SET.has(normalized);
}

export function suggestRelationshipTypes(input: string): string[] {
  const normalized = normalizeType(input);
  if (!normalized) {
    return [...SAGA_RELATIONSHIP_TYPES];
  }

  return SAGA_RELATIONSHIP_TYPES.filter((entry) => entry.includes(normalized));
}

export function suggestCharacterLocationsForEvent(
  worldBible: SagaWorldBible,
  eventId: string,
): SagaTimelineCharacterLocation[] {
  const timeline = sortTimeline(worldBible);
  const eventIndex = timeline.findIndex((entry) => entry.id === eventId);
  if (eventIndex < 0) {
    return [];
  }

  const event = timeline[eventIndex];
  const currentLocations = event.characterLocations ?? [];
  const currentCharacterIds = new Set(currentLocations.map((entry) => entry.characterId).filter(Boolean));
  const characterSet = getCharacterSet(worldBible);
  const latestLocationByCharacter = new Map<string, string>();

  for (let index = 0; index < eventIndex; index += 1) {
    const previousEvent = timeline[index];
    for (const locationEntry of previousEvent.characterLocations ?? []) {
      const characterId = locationEntry.characterId.trim();
      const locationId = locationEntry.locationId.trim();
      if (!characterId || !locationId) {
        continue;
      }
      latestLocationByCharacter.set(characterId, locationId);
    }
  }

  const touchedCharacters = new Set<string>();
  for (const impact of event.characterImpacts) {
    if (impact.characterId.trim()) {
      touchedCharacters.add(impact.characterId.trim());
    }
  }
  for (const entityId of event.entityIds) {
    if (characterSet.has(entityId)) {
      touchedCharacters.add(entityId);
    }
  }
  for (const existingEntry of currentLocations) {
    if (existingEntry.characterId.trim()) {
      touchedCharacters.add(existingEntry.characterId.trim());
    }
  }

  const suggestions: SagaTimelineCharacterLocation[] = [];
  for (const characterId of touchedCharacters) {
    if (!characterSet.has(characterId) || currentCharacterIds.has(characterId)) {
      continue;
    }

    const locationId = latestLocationByCharacter.get(characterId);
    if (!locationId) {
      continue;
    }

    suggestions.push({
      characterId,
      locationId,
      notes: 'Sugerida por continuidad automatica',
    });
  }

  return suggestions;
}

export function suggestArtifactTransferOwnersForEvent(
  worldBible: SagaWorldBible,
  eventId: string,
): SagaTimelineArtifactTransfer[] {
  const timeline = sortTimeline(worldBible);
  const eventIndex = timeline.findIndex((entry) => entry.id === eventId);
  if (eventIndex < 0) {
    return [];
  }

  const ownerByArtifact = new Map<string, string>();
  for (let index = 0; index < eventIndex; index += 1) {
    const previousEvent = timeline[index];
    for (const transfer of previousEvent.artifactTransfers ?? []) {
      const artifactId = transfer.artifactId.trim();
      const toCharacterId = transfer.toCharacterId.trim();
      if (!artifactId || !toCharacterId) {
        continue;
      }
      ownerByArtifact.set(artifactId, toCharacterId);
    }
  }

  const currentEvent = timeline[eventIndex];
  return (currentEvent.artifactTransfers ?? []).map((transfer) => {
    if (transfer.fromCharacterId.trim() || !transfer.artifactId.trim()) {
      return transfer;
    }

    const suggestedOwner = ownerByArtifact.get(transfer.artifactId.trim());
    if (!suggestedOwner) {
      return transfer;
    }

    return {
      ...transfer,
      fromCharacterId: suggestedOwner,
      notes: transfer.notes
        ? `${transfer.notes}\nOrigen sugerido automaticamente`
        : 'Origen sugerido automaticamente',
    };
  });
}

export function applyTimeskipToCharacterVersions(
  worldBible: SagaWorldBible,
  eventId: string,
  jumpYears: number,
): SagaWorldBible {
  const roundedJump = Math.round(jumpYears);
  if (!Number.isFinite(roundedJump) || roundedJump <= 0) {
    return worldBible;
  }

  const event = worldBible.timeline.find((entry) => entry.id === eventId);
  if (!event) {
    return worldBible;
  }

  const timeline = worldBible.timeline.map((entry) =>
    entry.id === eventId
      ? {
          ...entry,
          category: 'timeskip' as const,
          timeJumpYears: roundedJump,
        }
      : entry,
  );

  const characters = worldBible.characters.map((character) => {
    const versions = (character.versions ?? []).map((version) => {
      const startsAfterJump =
        version.startOrder !== null && version.startOrder > event.startOrder;
      const overlapsJump =
        (version.startOrder === null || version.startOrder <= event.startOrder) &&
        (version.endOrder === null || version.endOrder >= event.startOrder);

      if (!startsAfterJump && !overlapsJump) {
        return version;
      }

      const ageStart =
        startsAfterJump && typeof version.ageStart === 'number'
          ? version.ageStart + roundedJump
          : version.ageStart ?? null;
      const ageEnd =
        (startsAfterJump || overlapsJump) && typeof version.ageEnd === 'number'
          ? version.ageEnd + roundedJump
          : version.ageEnd ?? null;

      return {
        ...version,
        ageStart,
        ageEnd,
        notes: version.notes
          ? `${version.notes}\nTimeskip +${roundedJump}y aplicado`
          : `Timeskip +${roundedJump}y aplicado`,
      };
    });

    return sortCharacterVersions({
      ...character,
      versions,
    });
  });

  return {
    ...worldBible,
    timeline,
    characters,
  };
}

function deriveImpactVersionStatus(
  impactType: SagaWorldBible['timeline'][number]['characterImpacts'][number]['impactType'],
  fallback: SagaCharacterStatus,
): SagaCharacterStatus {
  if (impactType === 'death') {
    return 'dead';
  }
  if (impactType === 'disappearance') {
    return 'missing';
  }
  return fallback;
}

export function applyImpactDrivenVersioning(
  worldBible: SagaWorldBible,
  eventId: string,
): SagaWorldBible {
  const event = worldBible.timeline.find((entry) => entry.id === eventId);
  if (!event) {
    return worldBible;
  }

  const characterById = new Map(worldBible.characters.map((entry) => [entry.id, entry]));
  let hasChanges = false;
  const nextCharacters = worldBible.characters.map((character) => ({ ...character }));

  for (const impact of event.characterImpacts) {
    const characterId = impact.characterId.trim();
    if (!characterId || !VERSION_TRIGGER_IMPACTS.has(impact.impactType)) {
      continue;
    }

    const character = characterById.get(characterId);
    if (!character) {
      continue;
    }

    const label =
      impact.stateChange.trim() ||
      impact.aliasUsed.trim() ||
      impact.impactType;
    const versions = [...(character.versions ?? [])];
    const hasSimilar = versions.some(
      (entry) =>
        entry.startOrder === event.startOrder &&
        normalizeType(entry.label) === normalizeType(label),
    );
    if (hasSimilar) {
      continue;
    }

    const nextVersion = {
      id: randomId('saga-version'),
      label,
      startOrder: event.startOrder,
      endOrder: null,
      ageStart: null,
      ageEnd: null,
      status: deriveImpactVersionStatus(
        impact.impactType,
        character.lifecycle.currentStatus,
      ),
      summary: impact.stateChange.trim() || impact.impactType,
      notes: `Creada automaticamente desde ${event.displayLabel || event.title || event.id}`,
    };

    const characterIndex = nextCharacters.findIndex((entry) => entry.id === characterId);
    if (characterIndex < 0) {
      continue;
    }

    hasChanges = true;
    nextCharacters[characterIndex] = sortCharacterVersions({
      ...nextCharacters[characterIndex],
      versions: [...versions, nextVersion],
    });
  }

  if (!hasChanges) {
    return worldBible;
  }

  return {
    ...worldBible,
    characters: nextCharacters,
  };
}

type SagaRefactorKind = SagaEntityKind | 'secret' | 'timeline-event';

function renameEntityCollectionId(
  worldBible: SagaWorldBible,
  kind: SagaEntityKind,
  oldId: string,
  newId: string,
): SagaWorldBible {
  const keyMap: Record<SagaEntityKind, keyof SagaWorldBible> = {
    character: 'characters',
    location: 'locations',
    route: 'routes',
    flora: 'flora',
    fauna: 'fauna',
    faction: 'factions',
    system: 'systems',
    artifact: 'artifacts',
  };

  const key = keyMap[kind];
  const collection = worldBible[key];
  if (!Array.isArray(collection)) {
    return worldBible;
  }

  if ((collection as Array<{ id: string }>).some((entry) => entry.id === newId)) {
    return worldBible;
  }

  const nextCollection = (collection as Array<{ id: string }>).map((entry) =>
    entry.id === oldId ? { ...entry, id: newId } : entry,
  );

  return {
    ...worldBible,
    [key]: nextCollection,
  };
}

export function renameSagaIdEverywhere(
  worldBible: SagaWorldBible,
  kind: SagaRefactorKind,
  oldId: string,
  newId: string,
): SagaWorldBible {
  const sourceId = oldId.trim();
  const targetId = newId.trim();
  if (!sourceId || !targetId || sourceId === targetId) {
    return worldBible;
  }

  let nextWorld = worldBible;

  if (kind !== 'secret' && kind !== 'timeline-event') {
    nextWorld = renameEntityCollectionId(nextWorld, kind, sourceId, targetId);
  } else if (kind === 'secret') {
    if ((nextWorld.secrets ?? []).some((entry) => entry.id === targetId)) {
      return worldBible;
    }
    nextWorld = {
      ...nextWorld,
      secrets: (nextWorld.secrets ?? []).map((entry) =>
        entry.id === sourceId ? { ...entry, id: targetId } : entry,
      ),
    };
  } else if (kind === 'timeline-event') {
    if (nextWorld.timeline.some((entry) => entry.id === targetId)) {
      return worldBible;
    }
    nextWorld = {
      ...nextWorld,
      timeline: nextWorld.timeline.map((entry) =>
        entry.id === sourceId ? { ...entry, id: targetId } : entry,
      ),
      characters: nextWorld.characters.map((character) => ({
        ...character,
        lifecycle: {
          birthEventId:
            character.lifecycle.birthEventId === sourceId
              ? targetId
              : character.lifecycle.birthEventId,
          deathEventId:
            character.lifecycle.deathEventId === sourceId
              ? targetId
              : character.lifecycle.deathEventId,
          firstAppearanceEventId:
            character.lifecycle.firstAppearanceEventId === sourceId
              ? targetId
              : character.lifecycle.firstAppearanceEventId,
          lastKnownEventId:
            character.lifecycle.lastKnownEventId === sourceId
              ? targetId
              : character.lifecycle.lastKnownEventId,
          currentStatus: character.lifecycle.currentStatus,
        },
      })),
    };
  }

  const typedKind = kind as SagaEntityKind;
  return {
    ...nextWorld,
    relationships: nextWorld.relationships.map((relationship) => ({
      ...relationship,
      from:
        relationship.from.kind === typedKind && relationship.from.id === sourceId
          ? { ...relationship.from, id: targetId }
          : relationship.from,
      to:
        relationship.to.kind === typedKind && relationship.to.id === sourceId
          ? { ...relationship.to, id: targetId }
          : relationship.to,
    })),
    timeline: nextWorld.timeline.map((event) => ({
      ...event,
      entityIds: event.entityIds.map((entry) => (entry === sourceId ? targetId : entry)),
      bookRefs: (event.bookRefs ?? []).map((reference) => ({
        ...reference,
        locationId:
          kind === 'location' && reference.locationId === sourceId
            ? targetId
            : reference.locationId,
      })),
      characterImpacts: (event.characterImpacts ?? []).map((impact) => ({
        ...impact,
        characterId:
          kind === 'character' && impact.characterId === sourceId
            ? targetId
            : impact.characterId,
      })),
      characterLocations: (event.characterLocations ?? []).map((location) => ({
        ...location,
        characterId:
          kind === 'character' && location.characterId === sourceId
            ? targetId
            : location.characterId,
        locationId:
          kind === 'location' && location.locationId === sourceId
            ? targetId
            : location.locationId,
      })),
      artifactTransfers: (event.artifactTransfers ?? []).map((transfer) => ({
        ...transfer,
        artifactId:
          kind === 'artifact' && transfer.artifactId === sourceId
            ? targetId
            : transfer.artifactId,
        fromCharacterId:
          kind === 'character' && transfer.fromCharacterId === sourceId
            ? targetId
            : transfer.fromCharacterId,
        toCharacterId:
          kind === 'character' && transfer.toCharacterId === sourceId
            ? targetId
            : transfer.toCharacterId,
      })),
      secretReveals: (event.secretReveals ?? []).map((reveal) => ({
        ...reveal,
        secretId:
          kind === 'secret' && reveal.secretId === sourceId
            ? targetId
            : reveal.secretId,
        perceiverCharacterId:
          kind === 'character' && reveal.perceiverCharacterId === sourceId
            ? targetId
            : reveal.perceiverCharacterId,
      })),
    })),
    secrets: (nextWorld.secrets ?? []).map((secret) => ({
      ...secret,
      relatedEntityIds: secret.relatedEntityIds.map((entry) =>
        entry === sourceId ? targetId : entry,
      ),
    })),
  };
}

export function eventIndexForId(worldBible: SagaWorldBible, eventId: string): number {
  return findTimelineIndexById(worldBible, eventId);
}
