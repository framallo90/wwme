import type { SagaProject, SagaTimelineEvent, SagaWorldRelationship } from '../types/book';

export interface PlotArcStep {
  eventId: string;
  title: string;
  displayLabel: string;
  stageLabel: string;
  category: SagaTimelineEvent['category'];
  summary: string;
  startOrder: number;
  primaryImpact: string;
}

export interface PlotRelationshipHighlight {
  relationshipId: string;
  label: string;
  notes: string;
}

export interface PlotCategorySummary {
  category: SagaTimelineEvent['category'];
  count: number;
}

export interface PlotActGroup {
  stageLabel: string;
  steps: PlotArcStep[];
}

export interface PlotCharacterArcBeat {
  eventId: string;
  displayLabel: string;
  title: string;
  impactLabel: string;
  summary: string;
}

export interface PlotBoardModel {
  steps: PlotArcStep[];
  relationships: PlotRelationshipHighlight[];
  categories: PlotCategorySummary[];
  acts: PlotActGroup[];
  characterArc: PlotCharacterArcBeat[];
}

export function plotEventTouchesCharacter(event: SagaTimelineEvent, characterId: string): boolean {
  return (
    event.characterImpacts.some((impact) => impact.characterId === characterId) ||
    event.entityIds.some((entityId) => entityId === characterId)
  );
}

export function getPlotStageLabel(index: number, total: number): string {
  if (total <= 1) {
    return 'Nucleo';
  }

  const ratio = index / Math.max(1, total - 1);
  if (ratio <= 0.15) {
    return 'Apertura';
  }
  if (ratio <= 0.4) {
    return 'Escalada';
  }
  if (ratio <= 0.65) {
    return 'Giro';
  }
  if (ratio <= 0.85) {
    return 'Climax';
  }
  return 'Consecuencia';
}

function resolveRelationshipLabel(saga: SagaProject, relationship: SagaWorldRelationship): string {
  const collections = {
    character: saga.metadata.worldBible.characters,
    location: saga.metadata.worldBible.locations,
    route: saga.metadata.worldBible.routes,
    flora: saga.metadata.worldBible.flora,
    fauna: saga.metadata.worldBible.fauna,
    faction: saga.metadata.worldBible.factions,
    system: saga.metadata.worldBible.systems,
    artifact: saga.metadata.worldBible.artifacts,
  };

  const from = collections[relationship.from.kind].find((entry) => entry.id === relationship.from.id);
  const to = collections[relationship.to.kind].find((entry) => entry.id === relationship.to.id);
  const fromLabel = from?.name || relationship.from.id || relationship.from.kind;
  const toLabel = to?.name || relationship.to.id || relationship.to.kind;

  return `${fromLabel} ${relationship.type || 'se relaciona con'} ${toLabel}`.trim();
}

export function buildPlotBoardModel(
  saga: SagaProject,
  selectedCharacterId: string,
  selectedCategory: SagaTimelineEvent['category'] | 'all',
  selectedLaneId: string | 'all' = 'all',
): PlotBoardModel {
  const filteredEvents = saga.metadata.worldBible.timeline
    .filter((event) => {
      if (selectedCategory !== 'all' && event.category !== selectedCategory) {
        return false;
      }

      const eventLaneId = event.laneId?.trim() || 'lane-main';
      if (selectedLaneId !== 'all' && eventLaneId !== selectedLaneId) {
        return false;
      }

      if (selectedCharacterId && !plotEventTouchesCharacter(event, selectedCharacterId)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (a.startOrder !== b.startOrder) {
        return a.startOrder - b.startOrder;
      }

      return a.title.localeCompare(b.title);
    });

  const steps = filteredEvents.map((event, index) => {
    const directImpact = selectedCharacterId
      ? event.characterImpacts.find((impact) => impact.characterId === selectedCharacterId)
      : event.characterImpacts[0];

    return {
      eventId: event.id,
      title: event.title || 'Evento sin titulo',
      displayLabel: event.displayLabel || `T${event.startOrder}`,
      stageLabel: getPlotStageLabel(index, filteredEvents.length),
      category: event.category,
      summary: event.summary || 'Sin resumen.',
      startOrder: event.startOrder,
      primaryImpact: directImpact?.stateChange || directImpact?.impactType || '',
    };
  });

  const relevantRelationships = saga.metadata.worldBible.relationships.filter((relationship) => {
    if (!selectedCharacterId) {
      return true;
    }

    return (
      (relationship.from.kind === 'character' && relationship.from.id === selectedCharacterId) ||
      (relationship.to.kind === 'character' && relationship.to.id === selectedCharacterId)
    );
  });

  const relationships = relevantRelationships.slice(0, 12).map((relationship) => ({
    relationshipId: relationship.id,
    label: resolveRelationshipLabel(saga, relationship),
    notes: relationship.notes,
  }));

  const categoryCount = new Map<SagaTimelineEvent['category'], number>();
  for (const step of steps) {
    categoryCount.set(step.category, (categoryCount.get(step.category) ?? 0) + 1);
  }

  const categories = Array.from(categoryCount.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const acts = steps.reduce<PlotActGroup[]>((groups, step) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.stageLabel === step.stageLabel) {
      lastGroup.steps.push(step);
      return groups;
    }

    groups.push({
      stageLabel: step.stageLabel,
      steps: [step],
    });
    return groups;
  }, []);

  const characterArc = selectedCharacterId
    ? filteredEvents
        .map((event) => {
          const impact = event.characterImpacts.find((entry) => entry.characterId === selectedCharacterId);
          if (!impact) {
            return null;
          }

          return {
            eventId: event.id,
            displayLabel: event.displayLabel || `T${event.startOrder}`,
            title: event.title || 'Evento sin titulo',
            impactLabel: impact.stateChange || impact.impactType || 'Cambio sin detallar',
            summary: event.summary || 'Sin resumen.',
          };
        })
        .filter((entry): entry is PlotCharacterArcBeat => Boolean(entry))
    : [];

  return {
    steps,
    relationships,
    categories,
    acts,
    characterArc,
  };
}
