import type { CanonStatus, SagaProject, SagaWorldBible, StoryBible } from '../types/book';

export function normalizeCanonStatus(value: unknown): CanonStatus {
  return value === 'apocryphal' ? 'apocryphal' : 'canonical';
}

export function isCanonicalStatus(value: unknown): boolean {
  return normalizeCanonStatus(value) === 'canonical';
}

function shouldIncludeEntry(status: unknown, includeApocryphal: boolean): boolean {
  if (includeApocryphal) {
    return true;
  }
  return isCanonicalStatus(status);
}

export function filterStoryBibleByCanon(
  storyBible: StoryBible,
  options?: { includeApocryphal?: boolean },
): StoryBible {
  const includeApocryphal = options?.includeApocryphal === true;
  return {
    continuityRules: storyBible.continuityRules,
    characters: storyBible.characters
      .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
      .map((entry) => ({
        ...entry,
        canonStatus: normalizeCanonStatus(entry.canonStatus),
      })),
    locations: storyBible.locations
      .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
      .map((entry) => ({
        ...entry,
        canonStatus: normalizeCanonStatus(entry.canonStatus),
      })),
  };
}

export function filterSagaWorldByCanon(
  sagaWorld: SagaWorldBible,
  options?: { includeApocryphal?: boolean },
): SagaWorldBible {
  const includeApocryphal = options?.includeApocryphal === true;

  const characters = sagaWorld.characters
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const locations = sagaWorld.locations
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const routes = sagaWorld.routes
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const flora = sagaWorld.flora
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const fauna = sagaWorld.fauna
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const factions = sagaWorld.factions
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const systems = sagaWorld.systems
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const artifacts = sagaWorld.artifacts
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));
  const secrets = (sagaWorld.secrets ?? [])
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
    }));

  const relationships = sagaWorld.relationships.map((entry) => ({ ...entry }));
  const timelineLanes = sagaWorld.timelineLanes.map((entry) => ({ ...entry }));
  const atlas = {
    ...sagaWorld.atlas,
    layers: sagaWorld.atlas.layers.map((entry) => ({ ...entry })),
    pins: sagaWorld.atlas.pins.map((entry) => ({ ...entry })),
    routeMeasurements: sagaWorld.atlas.routeMeasurements.map((entry) => ({ ...entry })),
  };
  const conlangs = sagaWorld.conlangs.map((entry) => ({
    ...entry,
    lexicon: entry.lexicon.map((term) => ({ ...term })),
  }));
  const magicSystems = sagaWorld.magicSystems.map((entry) => ({ ...entry }));

  const timeline = sagaWorld.timeline
    .filter((entry) => shouldIncludeEntry(entry.canonStatus, includeApocryphal))
    .map((entry) => ({
      ...entry,
      canonStatus: normalizeCanonStatus(entry.canonStatus),
      bookRefs: entry.bookRefs.map((reference) => ({ ...reference })),
      entityIds: [...entry.entityIds],
      characterImpacts: entry.characterImpacts.map((impact) => ({ ...impact })),
      artifactTransfers: (entry.artifactTransfers ?? []).map((transfer) => ({ ...transfer })),
      characterLocations: (entry.characterLocations ?? []).map((locationEntry) => ({ ...locationEntry })),
      secretReveals: (entry.secretReveals ?? []).map((reveal) => ({ ...reveal })),
    }));

  return {
    ...sagaWorld,
    characters,
    locations,
    routes,
    flora,
    fauna,
    factions,
    systems,
    artifacts,
    secrets: secrets.map((entry) => ({ ...entry })),
    relationships,
    timeline,
    timelineLanes,
    atlas,
    conlangs,
    magicSystems,
  };
}

export function buildSagaCanonicalView(
  saga: SagaProject | null,
  options?: { includeApocryphal?: boolean },
): SagaProject | null {
  if (!saga) {
    return null;
  }

  return {
    ...saga,
    metadata: {
      ...saga.metadata,
      worldBible: filterSagaWorldByCanon(saga.metadata.worldBible, options),
    },
  };
}

function normalizeLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitAliasValues(value: string): string[] {
  return value
    .split(/[,\n;|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeAliasValues(...values: string[]): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of values) {
    for (const alias of splitAliasValues(value)) {
      const key = normalizeLookupKey(alias);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(alias);
    }
  }

  return merged.join(', ');
}

function mergeTextBlocks(...values: string[]): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of values) {
    const cleanValue = value.trim();
    if (!cleanValue) {
      continue;
    }
    if (seen.has(cleanValue)) {
      continue;
    }
    seen.add(cleanValue);
    merged.push(cleanValue);
  }

  return merged.join('\n');
}

function buildConlangContinuityLines(sagaWorld: SagaWorldBible): string {
  const lines: string[] = [];
  for (const conlang of sagaWorld.conlangs) {
    const name = conlang.name.trim();
    if (!name) {
      continue;
    }
    const ruleParts: string[] = [];
    if (conlang.styleRules.trim()) {
      ruleParts.push(`ortografia: ${conlang.styleRules.trim()}`);
    }
    if (conlang.phonetics.trim()) {
      ruleParts.push(`fonetica: ${conlang.phonetics.trim()}`);
    }
    const lexiconTerms = conlang.lexicon
      .map((entry) => entry.term.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (lexiconTerms.length > 0) {
      ruleParts.push(`terminos canon: ${lexiconTerms.join(', ')}`);
    }
    if (ruleParts.length > 0) {
      lines.push(`Conlang ${name}: ${ruleParts.join(' | ')}`);
    }
  }
  return lines.join('\n');
}

function buildMagicContinuityLines(sagaWorld: SagaWorldBible): string {
  const lines: string[] = [];
  for (const system of sagaWorld.magicSystems) {
    const name = system.name.trim();
    if (!name) {
      continue;
    }
    const ruleParts: string[] = [];
    if (system.source.trim()) {
      ruleParts.push(`fuente: ${system.source.trim()}`);
    }
    if (system.costs.trim()) {
      ruleParts.push(`costos: ${system.costs.trim()}`);
    }
    if (system.limits.trim()) {
      ruleParts.push(`limites: ${system.limits.trim()}`);
    }
    if (system.forbiddenActs.trim()) {
      ruleParts.push(`prohibiciones: ${system.forbiddenActs.trim()}`);
    }
    if (system.validationHints.trim()) {
      ruleParts.push(`pistas de validacion: ${system.validationHints.trim()}`);
    }
    if (ruleParts.length > 0) {
      lines.push(`Sistema ${name}: ${ruleParts.join(' | ')}`);
    }
  }
  return lines.join('\n');
}

export function buildUnifiedStoryBibleIndex(
  storyBible: StoryBible,
  sagaWorld?: SagaWorldBible | null,
  options?: { includeApocryphal?: boolean },
): StoryBible {
  const scopedStoryBible = filterStoryBibleByCanon(storyBible, options);
  if (!sagaWorld) {
    return scopedStoryBible;
  }

  const scopedSagaWorld = filterSagaWorldByCanon(sagaWorld, options);
  const nextCharacters = scopedStoryBible.characters.map((entry) => ({
    ...entry,
    canonStatus: normalizeCanonStatus(entry.canonStatus),
  }));
  const nextLocations = scopedStoryBible.locations.map((entry) => ({
    ...entry,
    canonStatus: normalizeCanonStatus(entry.canonStatus),
  }));

  const characterIndexByName = new Map<string, number>();
  for (let index = 0; index < nextCharacters.length; index += 1) {
    const key = normalizeLookupKey(nextCharacters[index].name);
    if (key) {
      characterIndexByName.set(key, index);
    }
  }

  for (const sagaCharacter of scopedSagaWorld.characters) {
    const cleanName = sagaCharacter.name.trim();
    if (!cleanName) {
      continue;
    }
    const aliasTimeline = sagaCharacter.aliasTimeline.map((entry) => entry.value).join(', ');
    const key = normalizeLookupKey(cleanName);
    const existingIndex = characterIndexByName.get(key);
    if (existingIndex === undefined) {
      nextCharacters.push({
        id: `saga-${sagaCharacter.id}`,
        name: cleanName,
        aliases: mergeAliasValues(sagaCharacter.aliases, aliasTimeline),
        role: '',
        traits: sagaCharacter.summary.trim(),
        goal: '',
        notes: sagaCharacter.notes.trim(),
        canonStatus: normalizeCanonStatus(sagaCharacter.canonStatus),
      });
      characterIndexByName.set(key, nextCharacters.length - 1);
      continue;
    }

    const current = nextCharacters[existingIndex];
    nextCharacters[existingIndex] = {
      ...current,
      aliases: mergeAliasValues(current.aliases, sagaCharacter.aliases, aliasTimeline),
      traits: current.traits.trim() || sagaCharacter.summary.trim(),
      notes: mergeTextBlocks(current.notes, sagaCharacter.notes),
      canonStatus: normalizeCanonStatus(current.canonStatus),
    };
  }

  const locationIndexByName = new Map<string, number>();
  for (let index = 0; index < nextLocations.length; index += 1) {
    const key = normalizeLookupKey(nextLocations[index].name);
    if (key) {
      locationIndexByName.set(key, index);
    }
  }

  for (const sagaLocation of scopedSagaWorld.locations) {
    const cleanName = sagaLocation.name.trim();
    if (!cleanName) {
      continue;
    }
    const key = normalizeLookupKey(cleanName);
    const existingIndex = locationIndexByName.get(key);
    if (existingIndex === undefined) {
      nextLocations.push({
        id: `saga-${sagaLocation.id}`,
        name: cleanName,
        aliases: mergeAliasValues(sagaLocation.aliases),
        description: sagaLocation.summary.trim(),
        atmosphere: '',
        notes: sagaLocation.notes.trim(),
        canonStatus: normalizeCanonStatus(sagaLocation.canonStatus),
      });
      locationIndexByName.set(key, nextLocations.length - 1);
      continue;
    }

    const current = nextLocations[existingIndex];
    nextLocations[existingIndex] = {
      ...current,
      aliases: mergeAliasValues(current.aliases, sagaLocation.aliases),
      description: current.description.trim() || sagaLocation.summary.trim(),
      notes: mergeTextBlocks(current.notes, sagaLocation.notes),
      canonStatus: normalizeCanonStatus(current.canonStatus),
    };
  }

  return {
    continuityRules: mergeTextBlocks(
      scopedStoryBible.continuityRules,
      scopedSagaWorld.pinnedAiRules,
      scopedSagaWorld.globalRules,
      buildConlangContinuityLines(scopedSagaWorld),
      buildMagicContinuityLines(scopedSagaWorld),
    ),
    characters: nextCharacters,
    locations: nextLocations,
  };
}
