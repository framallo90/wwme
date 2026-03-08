import type { SagaAtlasRouteMeasurement, SagaProject } from '../types/book';

export interface WorldMapNode {
  pinId: string | null;
  locationId: string;
  label: string;
  x: number;
  y: number;
  summary: string;
  notes: string;
  connectedCount: number;
  layerId: string;
}

export interface WorldMapConnection {
  relationshipId: string;
  fromId: string;
  toId: string;
  label: string;
  notes: string;
  routeId: string;
}

export interface WorldMapRouteCard {
  id: string;
  label: string;
  summary: string;
  notes: string;
  distanceText: string;
  travelText: string;
}

export interface WorldMapModel {
  nodes: WorldMapNode[];
  connections: WorldMapConnection[];
  routeCards: WorldMapRouteCard[];
  atlasConfigured: boolean;
  mapImagePath: string;
  distanceUnit: string;
  defaultTravelMode: string;
  showGrid: boolean;
  layers: SagaProject['metadata']['worldBible']['atlas']['layers'];
}

function clampPercent(value: number): number {
  return Math.max(4, Math.min(96, value));
}

function formatDistance(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Sin medir';
  }

  const rounded = value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${rounded} ${unit}`;
}

function findDirectDistance(
  measurement: SagaAtlasRouteMeasurement,
  nodesByPinId: Map<string, WorldMapNode>,
  distanceScale: number | null,
): number | null {
  if (measurement.distanceOverride !== null && Number.isFinite(measurement.distanceOverride)) {
    return measurement.distanceOverride;
  }

  const fromNode = nodesByPinId.get(measurement.fromPinId);
  const toNode = nodesByPinId.get(measurement.toPinId);
  if (!fromNode || !toNode || !distanceScale || !Number.isFinite(distanceScale) || distanceScale <= 0) {
    return null;
  }

  const dx = fromNode.x - toNode.x;
  const dy = fromNode.y - toNode.y;
  return (Math.hypot(dx, dy) / 100) * distanceScale;
}

export function buildWorldMapModel(saga: SagaProject): WorldMapModel {
  const { worldBible } = saga.metadata;
  const atlas = worldBible.atlas;
  const visibleLayerIds = new Set(atlas.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const atlasPins = atlas.pins.filter((pin) => visibleLayerIds.has(pin.layerId));
  const pinnedLocationIds = new Set(atlasPins.map((pin) => pin.locationId));

  const nodes: WorldMapNode[] = [
    ...atlasPins.map((pin) => {
      const location = worldBible.locations.find((entry) => entry.id === pin.locationId);
      return {
        pinId: pin.id,
        locationId: pin.locationId,
        label: pin.label.trim() || location?.name || 'Lugar sin nombre',
        x: clampPercent(pin.xPct),
        y: clampPercent(pin.yPct),
        summary: location?.summary ?? '',
        notes: [location?.notes ?? '', pin.notes].filter(Boolean).join('\n'),
        connectedCount: 0,
        layerId: pin.layerId,
      };
    }),
    ...worldBible.locations
      .filter((location) => !pinnedLocationIds.has(location.id))
      .map((location, index, source) => {
        if (source.length === 1) {
          return {
            pinId: null,
            locationId: location.id,
            label: location.name || 'Lugar sin nombre',
            x: 50,
            y: 50,
            summary: location.summary,
            notes: location.notes,
            connectedCount: 0,
            layerId: atlas.layers[0]?.id ?? 'atlas-layer-main',
          };
        }

        const angle = (-Math.PI / 2) + (index / source.length) * (Math.PI * 2);
        return {
          pinId: null,
          locationId: location.id,
          label: location.name || 'Lugar sin nombre',
          x: clampPercent(50 + Math.cos(angle) * 34),
          y: clampPercent(50 + Math.sin(angle) * 28),
          summary: location.summary,
          notes: location.notes,
          connectedCount: 0,
          layerId: atlas.layers[0]?.id ?? 'atlas-layer-main',
        };
      }),
  ];

  const nodesByLocationId = new Map(nodes.map((node) => [node.locationId, node]));
  const nodesByPinId = new Map(nodes.filter((node) => node.pinId).map((node) => [node.pinId ?? '', node]));
  const connections = worldBible.relationships
    .filter((relationship) => relationship.from.kind === 'location' && relationship.to.kind === 'location')
    .map((relationship) => {
      const from = nodesByLocationId.get(relationship.from.id);
      const to = nodesByLocationId.get(relationship.to.id);
      if (!from || !to) {
        return null;
      }

      from.connectedCount += 1;
      to.connectedCount += 1;
      const fromLabel = from.label || relationship.from.id;
      const toLabel = to.label || relationship.to.id;
      return {
        relationshipId: relationship.id,
        fromId: relationship.from.id,
        toId: relationship.to.id,
        label: `${fromLabel} ${relationship.type || 'conecta'} ${toLabel}`.trim(),
        notes: relationship.notes,
        routeId: '',
      };
    })
    .filter((entry): entry is WorldMapConnection => Boolean(entry));

  const measuredRouteCards = atlas.routeMeasurements
    .map((measurement) => {
      const fromNode = nodesByPinId.get(measurement.fromPinId);
      const toNode = nodesByPinId.get(measurement.toPinId);
      const linkedRoute = worldBible.routes.find((route) => route.id === measurement.routeId);
      const labelParts = [
        linkedRoute?.name || '',
        fromNode?.label || measurement.fromPinId,
        toNode?.label || measurement.toPinId,
      ].filter(Boolean);
      const directDistance = findDirectDistance(measurement, nodesByPinId, atlas.distanceScale);
      return {
        id: measurement.id,
        label: labelParts.join(' | '),
        summary: linkedRoute?.summary || '',
        notes: [linkedRoute?.notes || '', measurement.notes].filter(Boolean).join('\n'),
        distanceText: formatDistance(directDistance, atlas.distanceUnit || 'km'),
        travelText:
          measurement.travelHours !== null && Number.isFinite(measurement.travelHours)
            ? `${measurement.travelHours.toFixed(1)} h (${atlas.defaultTravelMode || 'viaje'})`
            : 'Tiempo sin medir',
      };
    })
    .filter((entry) => entry.label.trim().length > 0);

  const measuredRouteIds = new Set(
    atlas.routeMeasurements
      .map((entry) => entry.routeId.trim())
      .filter(Boolean),
  );
  const routeCards = [
    ...measuredRouteCards,
    ...worldBible.routes
      .filter((route) => !measuredRouteIds.has(route.id))
      .map((route) => ({
        id: route.id,
        label: route.name || 'Ruta sin nombre',
        summary: route.summary,
        notes: route.notes,
        distanceText: 'Sin medir',
        travelText: 'Tiempo sin medir',
      })),
  ];

  return {
    nodes,
    connections,
    routeCards,
    atlasConfigured: Boolean(atlas.mapImagePath.trim()),
    mapImagePath: atlas.mapImagePath,
    distanceUnit: atlas.distanceUnit,
    defaultTravelMode: atlas.defaultTravelMode,
    showGrid: atlas.showGrid,
    layers: atlas.layers,
  };
}
