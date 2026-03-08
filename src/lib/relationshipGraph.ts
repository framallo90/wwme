import type { SagaEntityKind, SagaProject } from '../types/book';

export interface RelationshipGraphNode {
  key: string;
  id: string;
  kind: SagaEntityKind;
  label: string;
  summary: string;
  notes: string;
  x: number;
  y: number;
  degree: number;
}

export interface RelationshipGraphEdge {
  id: string;
  fromKey: string;
  toKey: string;
  type: string;
  notes: string;
}

export interface RelationshipGraphModel {
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  nodeByKey: Map<string, RelationshipGraphNode>;
  totalNodeCount: number;
  totalEdgeCount: number;
  trimmedNodeCount: number;
  focusMode: 'overview' | 'neighborhood';
}

export interface BuildRelationshipGraphInput {
  worldBible: SagaProject['metadata']['worldBible'] | null;
  kindFilter: 'all' | SagaEntityKind;
  query: string;
  selectedNodeKey?: string | null;
  nodeLimit?: number;
  focusMode?: 'overview' | 'neighborhood';
}

const ENTITY_KIND_ORDER: SagaEntityKind[] = [
  'character',
  'faction',
  'location',
  'artifact',
  'system',
  'route',
  'flora',
  'fauna',
];

function buildNodeKey(kind: SagaEntityKind, id: string): string {
  return `${kind}:${id}`;
}

function buildEntityLabel(
  worldBible: SagaProject['metadata']['worldBible'],
  kind: SagaEntityKind,
  id: string,
): { label: string; summary: string; notes: string } {
  const pick = (entries: Array<{ id: string; name: string; summary: string; notes: string }>) =>
    entries.find((entry) => entry.id === id) ?? null;

  switch (kind) {
    case 'character': {
      const character = worldBible.characters.find((entry) => entry.id === id);
      return {
        label: character?.name || id,
        summary: character?.summary || '',
        notes: character?.notes || '',
      };
    }
    case 'location': {
      const match = pick(worldBible.locations);
      return { label: match?.name || id, summary: match?.summary || '', notes: match?.notes || '' };
    }
    case 'route': {
      const match = pick(worldBible.routes);
      return { label: match?.name || id, summary: match?.summary || '', notes: match?.notes || '' };
    }
    case 'flora': {
      const match = pick(worldBible.flora);
      return { label: match?.name || id, summary: match?.summary || '', notes: match?.notes || '' };
    }
    case 'fauna': {
      const match = pick(worldBible.fauna);
      return { label: match?.name || id, summary: match?.summary || '', notes: match?.notes || '' };
    }
    case 'faction': {
      const match = pick(worldBible.factions);
      return { label: match?.name || id, summary: match?.summary || '', notes: match?.notes || '' };
    }
    case 'system': {
      const match = pick(worldBible.systems);
      return { label: match?.name || id, summary: match?.summary || '', notes: match?.notes || '' };
    }
    case 'artifact': {
      const match = pick(worldBible.artifacts);
      return { label: match?.name || id, summary: match?.summary || '', notes: match?.notes || '' };
    }
  }
}

function scoreNode(node: Omit<RelationshipGraphNode, 'x' | 'y' | 'degree'>, degree: number): number {
  let kindWeight = 1;
  if (node.kind === 'character') {
    kindWeight = 1.5;
  } else if (node.kind === 'faction' || node.kind === 'location') {
    kindWeight = 1.2;
  }
  return degree * kindWeight;
}

export function buildRelationshipGraphModel(input: BuildRelationshipGraphInput): RelationshipGraphModel {
  if (!input.worldBible) {
    return {
      nodes: [],
      edges: [],
      nodeByKey: new Map<string, RelationshipGraphNode>(),
      totalNodeCount: 0,
      totalEdgeCount: 0,
      trimmedNodeCount: 0,
      focusMode: input.focusMode ?? 'overview',
    };
  }

  const worldBible = input.worldBible;
  const focusMode = input.focusMode ?? 'overview';
  const nodeLimit = Math.max(12, input.nodeLimit ?? 90);
  const rawNodeMap = new Map<string, Omit<RelationshipGraphNode, 'x' | 'y' | 'degree'>>();
  const rawEdges: RelationshipGraphEdge[] = [];
  const degreeByKey = new Map<string, number>();

  const allEntities: Array<{ kind: SagaEntityKind; id: string }> = [
    ...worldBible.characters.map((entry) => ({ kind: 'character' as const, id: entry.id })),
    ...worldBible.locations.map((entry) => ({ kind: 'location' as const, id: entry.id })),
    ...worldBible.factions.map((entry) => ({ kind: 'faction' as const, id: entry.id })),
    ...worldBible.artifacts.map((entry) => ({ kind: 'artifact' as const, id: entry.id })),
    ...worldBible.systems.map((entry) => ({ kind: 'system' as const, id: entry.id })),
    ...worldBible.routes.map((entry) => ({ kind: 'route' as const, id: entry.id })),
    ...worldBible.fauna.map((entry) => ({ kind: 'fauna' as const, id: entry.id })),
    ...worldBible.flora.map((entry) => ({ kind: 'flora' as const, id: entry.id })),
  ];

  for (const entity of allEntities) {
    const key = buildNodeKey(entity.kind, entity.id);
    if (!rawNodeMap.has(key)) {
      const info = buildEntityLabel(worldBible, entity.kind, entity.id);
      rawNodeMap.set(key, {
        key,
        id: entity.id,
        kind: entity.kind,
        label: info.label,
        summary: info.summary,
        notes: info.notes,
      });
    }
  }

  for (const relationship of worldBible.relationships) {
    const fromId = relationship.from.id.trim();
    const toId = relationship.to.id.trim();
    if (!fromId || !toId) {
      continue;
    }

    const fromKey = buildNodeKey(relationship.from.kind, fromId);
    const toKey = buildNodeKey(relationship.to.kind, toId);
    if (!rawNodeMap.has(fromKey)) {
      const info = buildEntityLabel(worldBible, relationship.from.kind, fromId);
      rawNodeMap.set(fromKey, {
        key: fromKey,
        id: fromId,
        kind: relationship.from.kind,
        label: info.label,
        summary: info.summary,
        notes: info.notes,
      });
    }
    if (!rawNodeMap.has(toKey)) {
      const info = buildEntityLabel(worldBible, relationship.to.kind, toId);
      rawNodeMap.set(toKey, {
        key: toKey,
        id: toId,
        kind: relationship.to.kind,
        label: info.label,
        summary: info.summary,
        notes: info.notes,
      });
    }

    rawEdges.push({
      id: relationship.id,
      fromKey,
      toKey,
      type: relationship.type || 'related',
      notes: relationship.notes,
    });
    degreeByKey.set(fromKey, (degreeByKey.get(fromKey) ?? 0) + 1);
    degreeByKey.set(toKey, (degreeByKey.get(toKey) ?? 0) + 1);
  }

  const normalizedQuery = input.query.trim().toLowerCase();
  const allNodes = [...rawNodeMap.values()];
  const matchedNodes = allNodes.filter((node) => {
    if (input.kindFilter !== 'all' && node.kind !== input.kindFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = `${node.label} ${node.id} ${node.kind} ${node.summary} ${node.notes}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const visibleKeys = new Set<string>(matchedNodes.map((node) => node.key));
  if (focusMode === 'neighborhood' && input.selectedNodeKey) {
    visibleKeys.add(input.selectedNodeKey);
    for (const edge of rawEdges) {
      if (edge.fromKey === input.selectedNodeKey) {
        visibleKeys.add(edge.toKey);
      }
      if (edge.toKey === input.selectedNodeKey) {
        visibleKeys.add(edge.fromKey);
      }
    }
  } else if (normalizedQuery) {
    for (const edge of rawEdges) {
      if (visibleKeys.has(edge.fromKey)) {
        visibleKeys.add(edge.toKey);
      }
      if (visibleKeys.has(edge.toKey)) {
        visibleKeys.add(edge.fromKey);
      }
    }
  }

  let candidateNodes = allNodes.filter((node) => visibleKeys.has(node.key));
  if (!normalizedQuery && focusMode === 'overview' && candidateNodes.length > nodeLimit) {
    candidateNodes = [...candidateNodes]
      .sort((left, right) => {
        const scoreDiff =
          scoreNode(right, degreeByKey.get(right.key) ?? 0) - scoreNode(left, degreeByKey.get(left.key) ?? 0);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return left.label.localeCompare(right.label);
      })
      .slice(0, nodeLimit);
  }

  const filteredKeySet = new Set(candidateNodes.map((node) => node.key));
  const filteredEdges = rawEdges.filter(
    (edge) => filteredKeySet.has(edge.fromKey) && filteredKeySet.has(edge.toKey),
  );

  const visibleKinds = ENTITY_KIND_ORDER.filter((kind) =>
    candidateNodes.some((node) => node.kind === kind),
  );
  const sectorCount = Math.max(visibleKinds.length, 1);
  const positionedNodes: RelationshipGraphNode[] = [];

  visibleKinds.forEach((kind, kindIndex) => {
    const group = candidateNodes
      .filter((node) => node.kind === kind)
      .sort((left, right) => {
        const degreeDiff = (degreeByKey.get(right.key) ?? 0) - (degreeByKey.get(left.key) ?? 0);
        if (degreeDiff !== 0) {
          return degreeDiff;
        }
        return left.label.localeCompare(right.label);
      });
    if (group.length === 0) {
      return;
    }

    const sectorStart = -Math.PI / 2 + (Math.PI * 2 * kindIndex) / sectorCount;
    const sectorSpan = (Math.PI * 2) / sectorCount;
    group.forEach((node, index) => {
      const ratio = group.length === 1 ? 0.5 : index / Math.max(group.length - 1, 1);
      const angle = sectorStart + sectorSpan * (0.15 + ratio * 0.7);
      const radius = 16 + (index % 5) * 5 + Math.min(12, (degreeByKey.get(node.key) ?? 0) * 0.75);
      positionedNodes.push({
        ...node,
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
        degree: degreeByKey.get(node.key) ?? 0,
      });
    });
  });

  const nodeByKey = new Map(positionedNodes.map((node) => [node.key, node]));
  return {
    nodes: positionedNodes,
    edges: filteredEdges,
    nodeByKey,
    totalNodeCount: rawNodeMap.size,
    totalEdgeCount: rawEdges.length,
    trimmedNodeCount: Math.max(0, rawNodeMap.size - positionedNodes.length),
    focusMode,
  };
}

export { buildNodeKey };
