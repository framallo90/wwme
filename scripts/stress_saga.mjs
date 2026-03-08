#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

function makeRange(count, mapper) {
  return Array.from({ length: count }, (_, index) => mapper(index));
}

function buildSyntheticSaga({
  characters = 400,
  locations = 160,
  events = 1200,
  relationships = 900,
  lanes = 6,
} = {}) {
  const laneDefs = makeRange(lanes, (index) => ({
    id: `lane-${index + 1}`,
    label: `Carril ${index + 1}`,
    color: '#1f5f8b',
    era: index === 0 ? 'Presente' : `Era ${index + 1}`,
    description: '',
  }));

  const locationRows = makeRange(locations, (index) => ({
    id: `loc-${index + 1}`,
    name: `Lugar ${index + 1}`,
    aliases: '',
    summary: 'Descripcion sintetica.',
    notes: '',
  }));

  return {
    metadata: {
      title: 'Saga sintetica',
      worldBible: {
        overview: '',
        characters: makeRange(characters, (index) => ({
          id: `char-${index + 1}`,
          name: `Personaje ${index + 1}`,
          aliases: `Alias ${index + 1}`,
          summary: 'Resumen.',
          notes: '',
          aliasTimeline: [],
          versions: [],
          lifecycle: {
            birthEventId: null,
            deathEventId: null,
            firstAppearanceEventId: null,
            lastKnownEventId: null,
            currentStatus: 'alive',
          },
        })),
        locations: locationRows,
        routes: makeRange(Math.max(1, Math.round(locations / 2)), (index) => ({
          id: `route-${index + 1}`,
          name: `Ruta ${index + 1}`,
          aliases: '',
          summary: 'Ruta sintetica.',
          notes: '',
        })),
        flora: [],
        fauna: [],
        factions: [],
        systems: [],
        artifacts: [],
        secrets: [],
        relationships: makeRange(relationships, (index) => ({
          id: `rel-${index + 1}`,
          from: { kind: 'character', id: `char-${(index % characters) + 1}` },
          to: { kind: index % 2 === 0 ? 'character' : 'location', id: index % 2 === 0 ? `char-${((index + 7) % characters) + 1}` : `loc-${(index % locations) + 1}` },
          type: index % 3 === 0 ? 'ally-of' : index % 5 === 0 ? 'parent' : 'controls',
          notes: '',
          startOrder: index % 40,
          endOrder: (index % 40) + 20,
        })),
        timeline: makeRange(events, (index) => ({
          id: `ev-${index + 1}`,
          title: `Evento ${index + 1}`,
          category: index % 12 === 0 ? 'timeskip' : 'other',
          kind: index % 9 === 0 ? 'span' : 'point',
          startOrder: index + 1,
          endOrder: index % 9 === 0 ? index + 3 : null,
          laneId: laneDefs[index % laneDefs.length].id,
          laneLabel: laneDefs[index % laneDefs.length].label,
          eraLabel: laneDefs[index % laneDefs.length].era,
          displayLabel: `T${index + 1}`,
          summary: 'Evento sintetico con multiples entidades.',
          notes: '',
          bookRefs: [],
          entityIds: [`char-${(index % characters) + 1}`, `loc-${(index % locations) + 1}`],
          characterImpacts: [
            {
              characterId: `char-${(index % characters) + 1}`,
              impactType: 'appearance',
              aliasUsed: `Alias ${index + 1}`,
              stateChange: 'Cambio sintetico.',
            },
          ],
          artifactTransfers: [],
          characterLocations: [
            {
              characterId: `char-${(index % characters) + 1}`,
              locationId: `loc-${(index % locations) + 1}`,
              notes: '',
            },
          ],
          secretReveals: [],
          objectiveTruth: '',
          perceivedTruth: '',
          timeJumpYears: index % 12 === 0 ? 3 : null,
          canonStatus: 'canonical',
        })),
        timelineLanes: laneDefs,
        atlas: {
          mapImagePath: '',
          distanceScale: 1600,
          distanceUnit: 'km',
          defaultTravelMode: 'Caballo',
          showGrid: true,
          layers: [{ id: 'atlas-layer-main', name: 'Principal', description: '', color: '#1f5f8b', visible: true }],
          pins: makeRange(locations, (index) => ({
            id: `pin-${index + 1}`,
            locationId: `loc-${index + 1}`,
            label: `Lugar ${index + 1}`,
            layerId: 'atlas-layer-main',
            xPct: (index * 7) % 100,
            yPct: (index * 11) % 100,
            notes: '',
          })),
          routeMeasurements: [],
        },
        conlangs: [],
        magicSystems: [],
        globalRules: '',
        pinnedAiRules: '',
        glossary: '',
      },
    },
  };
}

function measure(label, fn) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`${label}: ${(end - start).toFixed(2)} ms`);
  return result;
}

function buildLaneRows(saga) {
  const laneMap = new Map(saga.metadata.worldBible.timelineLanes.map((lane) => [lane.id, { ...lane, count: 0 }]));
  for (const event of saga.metadata.worldBible.timeline) {
    const row = laneMap.get(event.laneId);
    if (row) {
      row.count += 1;
    }
  }
  return Array.from(laneMap.values());
}

function buildLocationGraph(saga) {
  const links = new Map();
  for (const relationship of saga.metadata.worldBible.relationships) {
    if (relationship.from.kind !== 'location' || relationship.to.kind !== 'location') {
      continue;
    }
    const key = `${relationship.from.id}->${relationship.to.id}`;
    links.set(key, relationship.type);
  }
  return links;
}

const saga = buildSyntheticSaga();
console.log('Synthetic saga ready:');
console.log(`- characters: ${saga.metadata.worldBible.characters.length}`);
console.log(`- locations: ${saga.metadata.worldBible.locations.length}`);
console.log(`- relationships: ${saga.metadata.worldBible.relationships.length}`);
console.log(`- timeline events: ${saga.metadata.worldBible.timeline.length}`);

measure('JSON stringify', () => JSON.stringify(saga));
measure('Lane grouping', () => buildLaneRows(saga));
measure('Location graph build', () => buildLocationGraph(saga));
measure('Family filter sample', () =>
  saga.metadata.worldBible.relationships.filter((entry) => entry.type.includes('parent') || entry.type.includes('ally')),
);
