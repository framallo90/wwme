import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import TimelineView from '../src/components/TimelineView';
import WorldMapView from '../src/components/WorldMapView';
import RelationshipGraphView from '../src/components/RelationshipGraphView';
import PlotBoardView from '../src/components/PlotBoardView';
import type {
  SagaProject,
  SagaTimelineEvent,
  SagaWorldRelationship,
} from '../src/types/book';

function makeRange<T>(count: number, factory: (index: number) => T): T[] {
  const output: T[] = [];
  for (let index = 0; index < count; index += 1) {
    output.push(factory(index));
  }
  return output;
}

function createStressSaga(): SagaProject {
  const laneCount = 8;
  const characterCount = 180;
  const locationCount = 240;
  const routeCount = 180;
  const timelineCount = 1400;

  const lanes = makeRange(laneCount, (index) => ({
    id: `lane-${index + 1}`,
    label: `Carril ${index + 1}`,
    color: ['#1f5f8b', '#8c6a2e', '#4f46e5', '#0f766e', '#9333ea', '#b45309', '#3b82f6', '#374151'][index % 8],
    era: index < 2 ? 'Historia antigua' : index < 5 ? 'Linea principal' : 'Consecuencias',
    description: '',
  }));

  const characters = makeRange(characterCount, (index) => ({
    id: `char-${index + 1}`,
    name: `Personaje ${index + 1}`,
    aliases: index % 4 === 0 ? `Alias ${index + 1}` : '',
    summary: 'Figura central en conflictos cruzados.',
    notes: '',
    aliasTimeline: [],
    versions: [],
    lifecycle: {
      birthEventId: null,
      deathEventId: null,
      firstAppearanceEventId: null,
      lastKnownEventId: null,
      currentStatus: 'alive' as const,
    },
  }));

  const locations = makeRange(locationCount, (index) => ({
    id: `loc-${index + 1}`,
    name: `Lugar ${index + 1}`,
    aliases: '',
    summary: 'Nodo geografico de prueba.',
    notes: '',
  }));

  const routes = makeRange(routeCount, (index) => ({
    id: `route-${index + 1}`,
    name: `Ruta ${index + 1}`,
    aliases: '',
    summary: '',
    notes: '',
  }));

  const timeline: SagaTimelineEvent[] = makeRange(timelineCount, (index) => {
    const lane = lanes[index % laneCount];
    const characterId = characters[index % characterCount].id;
    const nextCharacterId = characters[(index + 3) % characterCount].id;
    const fromLoc = locations[index % locationCount].id;
    const toLoc = locations[(index + 5) % locationCount].id;
    const dependencyIds = index > 0 ? [`event-${index}`] : [];
    return {
      id: `event-${index + 1}`,
      title: `Evento ${index + 1}`,
      category: index % 17 === 0 ? 'timeskip' : index % 5 === 0 ? 'political' : 'journey',
      kind: index % 11 === 0 ? 'span' : 'point',
      startOrder: index + 1,
      endOrder: index % 11 === 0 ? index + 2 : null,
      displayLabel: `T${index + 1}`,
      laneId: lane.id,
      laneLabel: lane.label,
      eraLabel: lane.era,
      summary: 'Evento sintetico para stress visual.',
      notes: '',
      dependencyIds,
      bookRefs: [{ bookPath: 'C:/books/vol-1', chapterId: String((index % 70) + 1).padStart(2, '0'), mode: 'occurs' }],
      entityIds: [characterId, fromLoc, toLoc],
      characterImpacts: [
        { characterId, impactType: 'appearance', aliasUsed: '', stateChange: 'Participa en el evento.' },
        { characterId: nextCharacterId, impactType: 'other', aliasUsed: '', stateChange: 'Responde al conflicto.' },
      ],
      characterLocations: [
        { characterId, locationId: fromLoc, notes: '' },
        { characterId: nextCharacterId, locationId: toLoc, notes: '' },
      ],
      timeJumpYears: index % 17 === 0 ? 3 : null,
    };
  });

  const relationships: SagaWorldRelationship[] = makeRange(620, (index) => ({
    id: `rel-${index + 1}`,
    from: { kind: 'character', id: characters[index % characterCount].id },
    to: { kind: 'character', id: characters[(index + 9) % characterCount].id },
    type: index % 9 === 0 ? 'parent-of' : index % 4 === 0 ? 'ally-of' : 'enemy-of',
    notes: '',
    startOrder: null,
    endOrder: null,
  }));

  const pins = locations.slice(0, 220).map((location, index) => ({
    id: `pin-${location.id}`,
    locationId: location.id,
    label: location.name,
    layerId: 'atlas-layer-main',
    xPct: ((index * 37) % 90) + 5,
    yPct: ((index * 29) % 90) + 5,
    notes: '',
  }));

  const routeMeasurements = makeRange(180, (index) => ({
    id: `atlas-route-${index + 1}`,
    fromPinId: pins[index % pins.length].id,
    toPinId: pins[(index + 7) % pins.length].id,
    routeId: routes[index % routes.length].id,
    distanceOverride: 35 + (index % 140),
    travelHours: 6 + (index % 20),
    notes: '',
  }));

  return {
    path: 'C:/sagas/stress-ui',
    metadata: {
      id: 'saga-stress-ui',
      title: 'Stress UI Saga',
      description: 'Dataset sintetico para stress visual.',
      books: [
        {
          bookId: 'book-1',
          bookPath: 'C:/books/vol-1',
          title: 'Volumen 1',
          author: 'QA',
          volumeNumber: 1,
          linkedAt: '2026-03-08T00:00:00.000Z',
        },
      ],
      worldBible: {
        overview: '',
        characters,
        locations,
        routes,
        flora: [],
        fauna: [],
        factions: [],
        systems: [],
        artifacts: [],
        relationships,
        timeline,
        timelineLanes: lanes,
        atlas: {
          mapImagePath: '',
          distanceScale: 120,
          distanceUnit: 'km',
          defaultTravelMode: 'Caballo',
          showGrid: true,
          layers: [{ id: 'atlas-layer-main', name: 'Principal', description: '', color: '#1f5f8b', visible: true }],
          pins,
          routeMeasurements,
        },
        conlangs: [],
        magicSystems: [],
        globalRules: '',
        pinnedAiRules: '',
        glossary: '',
        secrets: [],
      },
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    },
  };
}

function measureRender(label: string, render: () => string): { label: string; durationMs: number; markupLength: number } {
  const started = performance.now();
  const markup = render();
  const finished = performance.now();
  return {
    label,
    durationMs: Number((finished - started).toFixed(2)),
    markupLength: markup.length,
  };
}

function main(): void {
  const outputArg = process.argv[2] || 'reports/stress-ui/render-latest';
  const outputDir = path.resolve(process.cwd(), outputArg);
  mkdirSync(outputDir, { recursive: true });

  const saga = createStressSaga();
  const noopOpenBook: (bookPath: string) => void = () => {};
  const noopUpsertEvent: (event: SagaTimelineEvent) => void = () => {};
  const noopDeleteEvent: (eventId: string) => void = () => {};
  const noopUpsertRelationship: (relationship: SagaWorldRelationship) => void = () => {};
  const noopDeleteRelationship: (relationshipId: string) => void = () => {};
  const noopSagaChange: (next: SagaProject['metadata']) => void = () => {};
  const noopSave = () => {};

  const scenarios = [
    measureRender('TimelineView', () =>
      renderToStaticMarkup(
        React.createElement(TimelineView, {
          saga,
          activeSaga: saga,
          onOpenBook: noopOpenBook,
          onUpsertEvent: noopUpsertEvent,
          onDeleteEvent: noopDeleteEvent,
          onReorderTimeline: () => {},
        }),
      ),
    ),
    measureRender('WorldMapView', () =>
      renderToStaticMarkup(
        React.createElement(WorldMapView, {
          saga,
          onChange: noopSagaChange,
          onSave: noopSave,
        }),
      ),
    ),
    measureRender('RelationshipGraphView', () =>
      renderToStaticMarkup(
        React.createElement(RelationshipGraphView, {
          saga,
          activeSaga: saga,
          onUpsertRelationship: noopUpsertRelationship,
          onDeleteRelationship: noopDeleteRelationship,
        }),
      ),
    ),
    measureRender('PlotBoardView', () =>
      renderToStaticMarkup(
        React.createElement(PlotBoardView, {
          saga,
          activeSaga: saga,
          onOpenBook: noopOpenBook,
          onUpsertEvent: noopUpsertEvent,
          onDeleteEvent: noopDeleteEvent,
        }),
      ),
    ),
  ];

  const totalDuration = scenarios.reduce((total, scenario) => total + scenario.durationMs, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    dataset: {
      timelineEvents: saga.metadata.worldBible.timeline.length,
      relationships: saga.metadata.worldBible.relationships.length,
      atlasPins: saga.metadata.worldBible.atlas.pins.length,
      routeMeasurements: saga.metadata.worldBible.atlas.routeMeasurements.length,
      characters: saga.metadata.worldBible.characters.length,
      locations: saga.metadata.worldBible.locations.length,
    },
    scenarios,
    totalDurationMs: Number(totalDuration.toFixed(2)),
  };

  const reportPath = path.join(outputDir, 'render-stress-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(reportPath);
}

main();
