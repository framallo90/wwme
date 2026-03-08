import { useMemo, useState } from 'react';

import { buildRelationshipGraphModel } from '../lib/relationshipGraph';
import type { SagaEntityKind, SagaProject, SagaWorldRelationship } from '../types/book';

interface RelationshipGraphViewProps {
  saga: SagaProject | null;
  activeSaga: SagaProject | null;
  onUpsertRelationship: (relationship: SagaWorldRelationship) => void;
  onDeleteRelationship: (relationshipId: string) => void;
}

function makeRelId(): string {
  return `rel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

interface RelFormProps {
  relationship: SagaWorldRelationship | null;
  worldBible: SagaProject['metadata']['worldBible'];
  onSave: (rel: SagaWorldRelationship) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function RelationshipForm(props: RelFormProps) {
  const allEntities = [
    ...props.worldBible.characters.map((e) => ({ kind: 'character' as SagaEntityKind, id: e.id, name: e.name })),
    ...props.worldBible.locations.map((e) => ({ kind: 'location' as SagaEntityKind, id: e.id, name: e.name })),
    ...props.worldBible.factions.map((e) => ({ kind: 'faction' as SagaEntityKind, id: e.id, name: e.name })),
    ...props.worldBible.artifacts.map((e) => ({ kind: 'artifact' as SagaEntityKind, id: e.id, name: e.name })),
    ...props.worldBible.systems.map((e) => ({ kind: 'system' as SagaEntityKind, id: e.id, name: e.name })),
  ];

  const defaultFrom = allEntities[0];
  const defaultTo = allEntities[1] ?? allEntities[0];

  const [draft, setDraft] = useState<SagaWorldRelationship>(
    props.relationship ?? {
      id: makeRelId(),
      from: { kind: defaultFrom?.kind ?? 'character', id: defaultFrom?.id ?? '' },
      to: { kind: defaultTo?.kind ?? 'character', id: defaultTo?.id ?? '' },
      type: '',
      notes: '',
    },
  );

  const patch = (partial: Partial<SagaWorldRelationship>) => setDraft((prev) => ({ ...prev, ...partial }));

  return (
    <div className="timeline-event-form">
      <h4>{props.onDelete ? 'Editar relacion' : 'Nueva relacion'}</h4>
      <div className="bible-two-col">
        <label>
          Desde (entidad)
          <select
            value={`${draft.from.kind}:${draft.from.id}`}
            onChange={(e) => {
              const [kind, ...idParts] = e.target.value.split(':');
              patch({ from: { kind: kind as SagaEntityKind, id: idParts.join(':') } });
            }}
          >
            {allEntities.map((en) => (
              <option key={`${en.kind}:${en.id}`} value={`${en.kind}:${en.id}`}>
                [{en.kind}] {en.name || en.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hacia (entidad)
          <select
            value={`${draft.to.kind}:${draft.to.id}`}
            onChange={(e) => {
              const [kind, ...idParts] = e.target.value.split(':');
              patch({ to: { kind: kind as SagaEntityKind, id: idParts.join(':') } });
            }}
          >
            {allEntities.map((en) => (
              <option key={`${en.kind}:${en.id}`} value={`${en.kind}:${en.id}`}>
                [{en.kind}] {en.name || en.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Tipo de relacion
        <input
          value={draft.type}
          onChange={(e) => patch({ type: e.target.value })}
          placeholder="Ej: aliado, enemigo, padre, mentor..."
        />
      </label>
      <label>
        Notas
        <textarea
          rows={2}
          value={draft.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Contexto, historia, condiciones..."
        />
      </label>
      <div className="timeline-form-actions">
        <button type="button" onClick={() => props.onSave(draft)}>
          Guardar relacion
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancelar
        </button>
        {props.onDelete ? (
          <button type="button" className="timeline-form-delete-btn" onClick={props.onDelete}>
            Eliminar relacion
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RelationshipGraphView(props: RelationshipGraphViewProps) {
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | SagaEntityKind>('all');
  const [query, setQuery] = useState('');
  const [focusMode, setFocusMode] = useState<'overview' | 'neighborhood'>('overview');
  const [nodeLimit, setNodeLimit] = useState(90);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [isCreatingRel, setIsCreatingRel] = useState(false);
  const saga = props.saga;
  const worldBible = saga?.metadata.worldBible ?? null;

  const graph = useMemo(
    () =>
      buildRelationshipGraphModel({
        worldBible,
        kindFilter,
        query,
        selectedNodeKey,
        nodeLimit,
        focusMode,
      }),
    [focusMode, kindFilter, nodeLimit, query, selectedNodeKey, worldBible],
  );

  const effectiveSelectedNodeKey = graph.nodeByKey.has(selectedNodeKey ?? '')
    ? selectedNodeKey
    : graph.nodes[0]?.key ?? null;
  const selectedNode = effectiveSelectedNodeKey
    ? graph.nodeByKey.get(effectiveSelectedNodeKey) ?? null
    : null;
  const selectedEdges = selectedNode
    ? graph.edges.filter((edge) => edge.fromKey === selectedNode.key || edge.toKey === selectedNode.key)
    : [];

  if (!saga || !worldBible) {
    return (
      <section className="settings-view atlas-view">
        <header>
          <h2>Grafo de relaciones</h2>
          <p>Abri una saga para visualizar relaciones entre personajes, facciones y entidades.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="settings-view atlas-view">
      <header>
        <h2>Grafo de relaciones</h2>
        <p>Vista conectada de relaciones entre entidades para detectar densidad, vacios y nodos clave.</p>
      </header>

      <div className="bible-two-col">
        <label>
          Filtrar por tipo
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | SagaEntityKind)}>
            <option value="all">Todos</option>
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
          Buscar nodo
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Elara, faction-corona, ally-of..."
          />
        </label>
      </div>

      <div className="bible-two-col">
        <label>
          Modo de lectura
          <select value={focusMode} onChange={(event) => setFocusMode(event.target.value as 'overview' | 'neighborhood')}>
            <option value="overview">Panorama</option>
            <option value="neighborhood">Vecindad del nodo</option>
          </select>
        </label>
        <label>
          Maximo de nodos visibles
          <select value={String(nodeLimit)} onChange={(event) => setNodeLimit(Number(event.target.value) || 90)}>
            <option value="60">60</option>
            <option value="90">90</option>
            <option value="140">140</option>
            <option value="220">220</option>
          </select>
        </label>
      </div>

      <div className="atlas-layout">
        <section className="atlas-canvas-shell">
          <div className="bible-section-head">
            <h3>Red de conexiones</h3>
            <span className="muted">
              {graph.nodes.length}/{graph.totalNodeCount} nodos visibles | {graph.edges.length}/{graph.totalEdgeCount} relaciones
            </span>
          </div>
          {graph.trimmedNodeCount > 0 ? (
            <p className="muted">
              Vista recortada para mantener lectura y rendimiento. Hay {graph.trimmedNodeCount} nodo(s) fuera del lienzo actual.
            </p>
          ) : null}
          {focusMode === 'neighborhood' ? (
            <p className="muted">En vecindad, el grafo prioriza el nodo seleccionado y sus conexiones directas.</p>
          ) : null}
          {graph.nodes.length === 0 ? (
            <p className="muted">No hay nodos para los filtros actuales.</p>
          ) : (
            <div className="atlas-canvas">
              <svg className="atlas-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {graph.edges.map((edge) => {
                  const from = graph.nodeByKey.get(edge.fromKey);
                  const to = graph.nodeByKey.get(edge.toKey);
                  if (!from || !to) {
                    return null;
                  }
                  return <line key={`graph-edge-${edge.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
                })}
              </svg>
              {graph.nodes.map((node) => (
                <button
                  key={node.key}
                  type="button"
                  className={`atlas-node ${effectiveSelectedNodeKey === node.key ? 'is-selected' : ''}`}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  onClick={() => setSelectedNodeKey(node.key)}
                >
                  <strong>{node.label}</strong>
                  <small>
                    {node.kind} | grado {node.degree}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="atlas-side">
          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Nodo seleccionado</h3>
              <span className="muted">{selectedEdges.length} relaciones</span>
            </div>
            {!selectedNode ? (
              <p className="muted">Selecciona un nodo para inspeccionar sus enlaces.</p>
            ) : (
              <>
                <strong>{selectedNode.label}</strong>
                <small className="muted">
                  {selectedNode.kind} | {selectedNode.id}
                </small>
                <p>{selectedNode.summary || 'Sin resumen.'}</p>
                <p>{selectedNode.notes || 'Sin notas.'}</p>
              </>
            )}
          </section>

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Relaciones del nodo</h3>
              <div className="timeline-detail-header-actions">
                <span className="muted">{selectedEdges.length}</span>
                {props.activeSaga ? (
                  <button type="button" onClick={() => { setIsCreatingRel(true); setEditingRelId(null); }}>
                    + Nueva
                  </button>
                ) : null}
              </div>
            </div>
            {isCreatingRel && props.activeSaga ? (
              <RelationshipForm
                relationship={null}
                worldBible={worldBible}
                onSave={(rel) => { props.onUpsertRelationship(rel); setIsCreatingRel(false); }}
                onCancel={() => setIsCreatingRel(false)}
              />
            ) : null}
            {!isCreatingRel && (selectedEdges.length === 0 || !selectedNode) ? (
              <p className="muted">Sin relaciones para el nodo seleccionado.</p>
            ) : (
              <div className="atlas-summary-list">
                {selectedEdges.map((edge) => {
                  const otherKey = edge.fromKey === selectedNode?.key ? edge.toKey : edge.fromKey;
                  const otherNode = graph.nodeByKey.get(otherKey);
                  const isEditing = editingRelId === edge.id;
                  const rawRel = worldBible.relationships.find((entry) => entry.id === edge.id) ?? null;
                  return (
                    <div key={`selected-edge-${edge.id}`} className="atlas-summary-item">
                      {isEditing && props.activeSaga && rawRel ? (
                        <RelationshipForm
                          relationship={rawRel}
                          worldBible={worldBible}
                          onSave={(rel) => { props.onUpsertRelationship(rel); setEditingRelId(null); }}
                          onCancel={() => setEditingRelId(null)}
                          onDelete={() => { props.onDeleteRelationship(edge.id); setEditingRelId(null); }}
                        />
                      ) : (
                        <>
                          <strong>{edge.type}</strong>
                          <small>
                            {selectedNode?.label} {edge.fromKey === selectedNode?.key ? '->' : '<-'} {otherNode?.label || otherKey}
                          </small>
                          <small>{edge.notes || 'Sin notas.'}</small>
                          {props.activeSaga ? (
                            <button type="button" onClick={() => { setEditingRelId(edge.id); setIsCreatingRel(false); }}>
                              Editar
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

export default RelationshipGraphView;
