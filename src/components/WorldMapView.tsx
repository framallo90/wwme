import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';

import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';

import { buildWorldMapModel } from '../lib/worldMap';
import type { SagaAtlasLayer, SagaAtlasRouteMeasurement, SagaMetadata, SagaProject } from '../types/book';

interface WorldMapViewProps {
  saga: SagaProject | null;
  onChange?: (next: SagaMetadata) => void;
  onSave?: () => void;
}

function createLocalId(prefix: 'atlas-layer' | 'atlas-pin' | 'atlas-route'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveAtlasImageSrc(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('asset:') || trimmed.startsWith('tauri:')) {
    return trimmed;
  }
  return convertFileSrc(trimmed);
}

function buildFallbackLayer(): SagaAtlasLayer {
  return {
    id: 'atlas-layer-main',
    name: 'Mapa principal',
    description: 'Capa principal del atlas.',
    color: '#1f5f8b',
    visible: true,
  };
}

function normalizeAtlasLookup(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvRows(raw: string): Array<Record<string, string>> {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
          continue;
        }
        quoted = !quoted;
        continue;
      }
      if (char === ',' && !quoted) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }

    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]).map((entry) => normalizeAtlasLookup(entry));
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? '';
      return acc;
    }, {});
  });
}

interface ImportedAtlasPinDraft {
  locationId: string;
  label: string;
  layerId: string;
  xPct: number;
  yPct: number;
  notes: string;
}

interface ImportedAtlasPinsParseResult {
  pins: ImportedAtlasPinDraft[];
  skipped: string[];
}

function parseImportedAtlasPins(
  raw: string,
  locations: SagaProject['metadata']['worldBible']['locations'],
  defaultLayerId: string,
): ImportedAtlasPinsParseResult {
  const locationLookup = new Map<string, string>();
  for (const location of locations) {
    locationLookup.set(normalizeAtlasLookup(location.id), location.id);
    if (location.name.trim()) {
      locationLookup.set(normalizeAtlasLookup(location.name), location.id);
    }
    for (const alias of location.aliases.split(/[,\n;|]+/g).map((entry) => entry.trim()).filter(Boolean)) {
      locationLookup.set(normalizeAtlasLookup(alias), location.id);
    }
  }

  const normalizePinRecord = (entry: Record<string, unknown>): { pin: ImportedAtlasPinDraft | null; skipped: string | null } => {
    const rawLocationId =
      String(entry.locationId ?? entry.locationid ?? entry.location ?? entry.name ?? entry.label ?? '').trim();
    const resolvedLocationId = locationLookup.get(normalizeAtlasLookup(rawLocationId)) ?? rawLocationId;
    if (!resolvedLocationId || !locations.some((location) => location.id === resolvedLocationId)) {
      return {
        pin: null,
        skipped: rawLocationId || 'ubicacion sin nombre',
      };
    }

    const xPct = Number(entry.xPct ?? entry.xpct ?? entry.x ?? entry.left ?? 0);
    const yPct = Number(entry.yPct ?? entry.ypct ?? entry.y ?? entry.top ?? 0);
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) {
      return {
        pin: null,
        skipped: rawLocationId || resolvedLocationId,
      };
    }

    return {
      pin: {
        locationId: resolvedLocationId,
        label: String(entry.label ?? entry.name ?? rawLocationId).trim(),
        layerId: String(entry.layerId ?? entry.layerid ?? entry.layer ?? defaultLayerId).trim() || defaultLayerId,
        xPct,
        yPct,
        notes: String(entry.notes ?? '').trim(),
      },
      skipped: null,
    };
  };

  const collectResults = (entries: Record<string, unknown>[]): ImportedAtlasPinsParseResult => {
    const pins: ImportedAtlasPinDraft[] = [];
    const skipped: string[] = [];

    for (const entry of entries) {
      const normalized = normalizePinRecord(entry);
      if (normalized.pin) {
        pins.push(normalized.pin);
      } else if (normalized.skipped) {
        skipped.push(normalized.skipped);
      }
    }

    return { pins, skipped };
  };

  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidates =
      Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object'
          ? ((parsed as { pins?: unknown; atlas?: { pins?: unknown } }).pins ??
            (parsed as { atlas?: { pins?: unknown } }).atlas?.pins ??
            [])
          : [];

    if (Array.isArray(candidates)) {
      return collectResults(
        candidates.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'),
      );
    }
  } catch {
    const rows = parseCsvRows(raw);
    return collectResults(rows);
  }

  return { pins: [], skipped: [] };
}

function findNearestPinnedNode(
  nodes: ReturnType<typeof buildWorldMapModel>['nodes'],
  xPct: number,
  yPct: number,
  threshold = 8,
) {
  let winner: (typeof nodes)[number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (!node.pinId) {
      continue;
    }
    const distance = Math.hypot(node.x - xPct, node.y - yPct);
    if (distance <= threshold && distance < bestDistance) {
      winner = node;
      bestDistance = distance;
    }
  }

  return winner;
}

function WorldMapView(props: WorldMapViewProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [atlasNotice, setAtlasNotice] = useState('');
  const [routeSnapMode, setRouteSnapMode] = useState(false);
  const [routeDraft, setRouteDraft] = useState<{
    fromPinId: string;
    toPinId: string;
    routeId: string;
    distanceOverride: string;
    travelHours: string;
    notes: string;
  }>({
    fromPinId: '',
    toPinId: '',
    routeId: '',
    distanceOverride: '',
    travelHours: '',
    notes: '',
  });
  const saga = props.saga;
  const mapModel = useMemo(() => (saga ? buildWorldMapModel(saga) : null), [saga]);

  if (!saga || !mapModel) {
    return (
      <section className="settings-view atlas-view">
        <header>
          <h2>Atlas</h2>
          <p>Abri una saga para visualizar lugares, capas, pines, distancias y rutas del mundo.</p>
        </header>
      </section>
    );
  }

  const atlas = saga.metadata.worldBible.atlas;
  const effectiveLayers = atlas.layers.length > 0 ? atlas.layers : [buildFallbackLayer()];
  const effectiveLayerId =
    effectiveLayers.some((entry) => entry.id === selectedLayerId) ? selectedLayerId : effectiveLayers[0]?.id ?? buildFallbackLayer().id;
  const effectiveSelectedLocationId =
    mapModel.nodes.some((node) => node.locationId === selectedLocationId) ? selectedLocationId : mapModel.nodes[0]?.locationId ?? null;
  const effectiveSelectedPinId =
    mapModel.nodes.some((node) => node.pinId === selectedPinId) ? selectedPinId : mapModel.nodes.find((node) => node.locationId === effectiveSelectedLocationId)?.pinId ?? null;
  const selectedNode = mapModel.nodes.find((node) => node.locationId === effectiveSelectedLocationId) ?? null;
  const selectedPin = atlas.pins.find((pin) => pin.id === effectiveSelectedPinId) ?? null;
  const selectedConnections = selectedNode
    ? mapModel.connections.filter(
        (connection) => connection.fromId === selectedNode.locationId || connection.toId === selectedNode.locationId,
      )
    : [];
  const imageSrc = resolveAtlasImageSrc(atlas.mapImagePath);
  const atlasSummaryCards = [
    {
      label: 'Lugares',
      value: mapModel.nodes.length,
      note: `${atlas.pins.length} pines vinculados`,
    },
    {
      label: 'Capas',
      value: effectiveLayers.length,
      note: `${effectiveLayers.filter((layer) => layer.visible).length} visibles`,
    },
    {
      label: 'Rutas',
      value: mapModel.routeCards.length,
      note: `${mapModel.connections.length} conexiones logicas`,
    },
    {
      label: 'Mapa',
      value: imageSrc ? 1 : 0,
      note: imageSrc ? 'base cartografica cargada' : 'sin imagen base',
    },
  ];

  const updateSaga = (next: SagaMetadata) => {
    props.onChange?.(next);
  };

  const updateAtlas = (patch: Partial<SagaMetadata['worldBible']['atlas']>) => {
    updateSaga({
      ...saga.metadata,
      worldBible: {
        ...saga.metadata.worldBible,
        atlas: {
          ...atlas,
          ...patch,
        },
      },
    });
  };

  const handleSelectMapImage = async () => {
    const selected = await open({
      title: 'Selecciona imagen base del atlas',
      multiple: false,
      filters: [
        {
          name: 'Imagenes',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) {
      return;
    }

    updateAtlas({ mapImagePath: selected });
  };

  const handleImportPins = async () => {
    const selected = await open({
      title: 'Importar pines del atlas',
      multiple: false,
      filters: [
        { name: 'JSON o CSV', extensions: ['json', 'csv'] },
      ],
    });
    if (!selected || Array.isArray(selected)) {
      return;
    }

    const raw = await readTextFile(selected);
    const importResult = parseImportedAtlasPins(raw, saga.metadata.worldBible.locations, effectiveLayerId);
    const importedPins = importResult.pins;
    if (importedPins.length === 0) {
      const skippedPreview =
        importResult.skipped.length > 0
          ? ` Saltadas: ${importResult.skipped.slice(0, 4).join(', ')}${importResult.skipped.length > 4 ? '...' : ''}.`
          : '';
      setAtlasNotice(`No se encontraron pines importables. Usa JSON/CSV con locationId, xPct y yPct.${skippedPreview}`);
      return;
    }

    const mergedPins = [...atlas.pins];
    let updatedCount = 0;
    let createdCount = 0;
    for (const importedPin of importedPins) {
      const existingIndex = mergedPins.findIndex((pin) => pin.locationId === importedPin.locationId);
      const normalizedPin = {
        id: existingIndex >= 0 ? mergedPins[existingIndex].id : createLocalId('atlas-pin'),
        locationId: importedPin.locationId,
        label: importedPin.label || importedPin.locationId,
        layerId: importedPin.layerId,
        xPct: Math.max(0, Math.min(100, importedPin.xPct)),
        yPct: Math.max(0, Math.min(100, importedPin.yPct)),
        notes: importedPin.notes,
      };
      if (existingIndex >= 0) {
        mergedPins[existingIndex] = normalizedPin;
        updatedCount += 1;
      } else {
        mergedPins.push(normalizedPin);
        createdCount += 1;
      }
    }

    const missingLayerIds = Array.from(
      new Set(
        importedPins
          .map((pin) => pin.layerId)
          .filter((layerId) => layerId && !effectiveLayers.some((layer) => layer.id === layerId)),
      ),
    );
    const nextLayers = [
      ...effectiveLayers,
      ...missingLayerIds.map((layerId, index) => ({
        id: layerId,
        name: `Capa importada ${index + 1}`,
        description: 'Creada al importar pines.',
        color: '#1f5f8b',
        visible: true,
      })),
    ];

    updateAtlas({ pins: mergedPins, layers: nextLayers });
    const skippedInfo =
      importResult.skipped.length > 0
        ? ` | Saltadas ${importResult.skipped.length}: ${importResult.skipped.slice(0, 3).join(', ')}${importResult.skipped.length > 3 ? '...' : ''}`
        : '';
    setAtlasNotice(
      `Importacion asistida completada: ${importedPins.length} pin(es), ${createdCount} nuevos, ${updatedCount} actualizados.${skippedInfo}`,
    );
  };

  const handleCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const xPct = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    if (routeSnapMode) {
      const snappedNode = findNearestPinnedNode(mapModel.nodes, xPct, yPct);
      if (!snappedNode?.pinId) {
        setAtlasNotice('No hay un pin cercano para encajar la ruta. Acercate mas al punto deseado.');
        return;
      }

      setSelectedLocationId(snappedNode.locationId);
      setSelectedPinId(snappedNode.pinId);
      setRouteDraft((previous) => {
        if (!previous.fromPinId || previous.toPinId) {
          return { ...previous, fromPinId: snappedNode.pinId ?? '', toPinId: '' };
        }
        if (previous.fromPinId === snappedNode.pinId) {
          return previous;
        }
        return { ...previous, toPinId: snappedNode.pinId ?? '' };
      });
      setAtlasNotice(
        routeDraft.fromPinId && routeDraft.fromPinId !== snappedNode.pinId
          ? `Extremo final encajado en ${snappedNode.label}. Revisa distancia y guarda la ruta.`
          : `Extremo inicial encajado en ${snappedNode.label}. Selecciona el segundo extremo.`,
      );
      return;
    }

    if (!effectiveSelectedLocationId) {
      return;
    }

    const existingPin = atlas.pins.find((pin) => pin.locationId === effectiveSelectedLocationId);
    const targetLocation = saga.metadata.worldBible.locations.find((entry) => entry.id === effectiveSelectedLocationId);
    const nextPins = existingPin
      ? atlas.pins.map((pin) =>
          pin.id === existingPin.id
            ? { ...pin, xPct, yPct, layerId: effectiveLayerId, label: pin.label || targetLocation?.name || pin.locationId }
            : pin,
        )
      : [
          ...atlas.pins,
          {
            id: createLocalId('atlas-pin'),
            locationId: effectiveSelectedLocationId,
            label: targetLocation?.name || effectiveSelectedLocationId,
            layerId: effectiveLayerId,
            xPct,
            yPct,
            notes: '',
          },
        ];

    updateAtlas({ pins: nextPins });
    setAtlasNotice(`Pin actualizado para ${targetLocation?.name || effectiveSelectedLocationId}.`);
  };

  const handleAddLayer = () => {
    const nextLayer = {
      id: createLocalId('atlas-layer'),
      name: `Nueva capa ${effectiveLayers.length + 1}`,
      description: '',
      color: '#1f5f8b',
      visible: true,
    };
    updateAtlas({ layers: [...effectiveLayers, nextLayer] });
    setSelectedLayerId(nextLayer.id);
  };

  const handleToggleLayer = (layerId: string) => {
    updateAtlas({
      layers: effectiveLayers.map((layer) =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
      ),
    });
  };

  const handleAddRouteMeasurement = () => {
    if (!routeDraft.fromPinId || !routeDraft.toPinId || routeDraft.fromPinId === routeDraft.toPinId) {
      return;
    }

    const nextEntry: SagaAtlasRouteMeasurement = {
      id: createLocalId('atlas-route'),
      fromPinId: routeDraft.fromPinId,
      toPinId: routeDraft.toPinId,
      routeId: routeDraft.routeId,
      distanceOverride: routeDraft.distanceOverride.trim() ? Number(routeDraft.distanceOverride) : null,
      travelHours: routeDraft.travelHours.trim() ? Number(routeDraft.travelHours) : null,
      notes: routeDraft.notes,
    };

    updateAtlas({ routeMeasurements: [...atlas.routeMeasurements, nextEntry] });
    setRouteDraft({
      fromPinId: '',
      toPinId: '',
      routeId: '',
      distanceOverride: '',
      travelHours: '',
      notes: '',
    });
  };

  return (
    <section className="settings-view atlas-view cartography-view">
      <header className="atlas-cartography-hero">
        <div className="atlas-cartography-copy">
          <span className="section-kicker">Mesa cartografica</span>
          <div className="bible-section-head atlas-cartography-header-row">
            <div>
              <h2>Atlas visual del mundo</h2>
              <p>Mapa base con capas, pines vinculados a lugares, rutas medibles y lectura espacial real.</p>
            </div>
            <div className="top-toolbar-actions atlas-cartography-actions">
              <button type="button" onClick={() => void handleSelectMapImage()}>
                Cargar mapa
              </button>
              <button type="button" onClick={() => void handleImportPins()}>
                Importar pines
              </button>
              <button type="button" onClick={() => updateAtlas({ mapImagePath: '' })}>
                Quitar mapa
              </button>
              {props.onSave ? (
                <button type="button" onClick={props.onSave}>
                  Guardar atlas
                </button>
              ) : null}
            </div>
          </div>
          <p className="atlas-cartography-summary">
            {imageSrc
              ? 'Mapa base listo para ubicar pines, medir rutas y contrastar capas del mundo.'
              : 'Carga una imagen base para trabajar el atlas sobre una cartografia real.'}
          </p>
        </div>
        <div className="atlas-cartography-ledger" aria-label="Resumen del atlas">
          {atlasSummaryCards.map((card) => (
            <article key={card.label} className="atlas-cartography-card">
              <span className="section-kicker">{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </article>
          ))}
        </div>
      </header>

      <section className="bible-section atlas-config-panel">
        <div className="bible-section-head">
          <h3>Configuracion cartografica</h3>
          <span className="muted">{atlas.mapImagePath ? 'Mapa activo' : 'Sin mapa base'}</span>
        </div>
        <div className="bible-two-col">
          <label>
            Escala horizontal completa
            <input
              type="number"
              min={1}
              value={atlas.distanceScale ?? 100}
              onChange={(event) => updateAtlas({ distanceScale: Number(event.target.value) || 100 })}
            />
          </label>
          <label>
            Unidad de distancia
            <input
              value={atlas.distanceUnit}
              onChange={(event) => updateAtlas({ distanceUnit: event.target.value })}
              placeholder="km"
            />
          </label>
        </div>
        <div className="bible-two-col">
          <label>
            Modo de viaje por defecto
            <input
              value={atlas.defaultTravelMode}
              onChange={(event) => updateAtlas({ defaultTravelMode: event.target.value })}
              placeholder="Caballo"
            />
          </label>
          <label className="atlas-inline-check">
            <input
              type="checkbox"
              checked={atlas.showGrid}
              onChange={(event) => updateAtlas({ showGrid: event.target.checked })}
            />
            Mostrar reticula
          </label>
        </div>
        <label>
          Archivo de mapa
          <input value={atlas.mapImagePath} onChange={(event) => updateAtlas({ mapImagePath: event.target.value })} placeholder="C:\\mapas\\continente.png" />
        </label>
        {atlasNotice ? <p className="muted">{atlasNotice}</p> : null}
      </section>

      <div className="atlas-layout">
        <section className="atlas-canvas-shell">
          <div className="bible-section-head">
            <h3>Mapa de lugares</h3>
            <span className="muted">
              {mapModel.nodes.length} lugares / {mapModel.connections.length} conexiones / {mapModel.routeCards.length} rutas medidas
            </span>
          </div>
          <div className="atlas-editor-toolbar">
            <label>
              Lugar activo para pinchar
              <select
                value={effectiveSelectedLocationId ?? ''}
                onChange={(event) => {
                  setSelectedLocationId(event.target.value || null);
                  const linkedPin = atlas.pins.find((pin) => pin.locationId === event.target.value);
                  setSelectedPinId(linkedPin?.id ?? null);
                }}
              >
                <option value="">Seleccionar lugar</option>
                {saga.metadata.worldBible.locations.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name || entry.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Capa activa
              <select value={effectiveLayerId} onChange={(event) => setSelectedLayerId(event.target.value)}>
                {effectiveLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setRouteSnapMode((previous) => !previous)}>
              {routeSnapMode ? 'Salir de snapping' : 'Snapping de rutas'}
            </button>
            <button type="button" onClick={handleAddLayer}>Agregar capa</button>
          </div>
          {mapModel.nodes.length === 0 ? (
            <p className="muted">No hay lugares cargados en la saga.</p>
          ) : (
            <div
              className={`atlas-canvas ${atlas.showGrid ? 'has-grid' : ''}`}
              onClick={handleCanvasClick}
              role="presentation"
            >
              {imageSrc ? <img src={imageSrc} alt="Mapa base del atlas" className="atlas-base-image" /> : null}
              <svg className="atlas-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {mapModel.connections.map((connection) => {
                  const from = mapModel.nodes.find((node) => node.locationId === connection.fromId);
                  const to = mapModel.nodes.find((node) => node.locationId === connection.toId);
                  if (!from || !to) {
                    return null;
                  }

                  return (
                    <line
                      key={connection.relationshipId}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                    />
                  );
                })}
              </svg>

              {mapModel.nodes.map((node) => {
                const layer = effectiveLayers.find((entry) => entry.id === node.layerId);
                return (
                  <button
                    key={node.locationId}
                    type="button"
                    className={`atlas-node ${effectiveSelectedLocationId === node.locationId ? 'is-selected' : ''}`}
                    style={{ left: `${node.x}%`, top: `${node.y}%`, borderColor: layer?.color || '#1f5f8b' }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedLocationId(node.locationId);
                      setSelectedPinId(node.pinId);
                    }}
                  >
                    <strong>{node.label}</strong>
                    <small>{node.connectedCount} conexiones</small>
                  </button>
                );
              })}
            </div>
          )}
          <p className="muted">
            {routeSnapMode
              ? 'Snapping activo: haz click cerca de dos pines para cargar los extremos de la ruta.'
              : 'Selecciona un lugar y haz click sobre el mapa para crear o mover su pin.'}
          </p>
        </section>

        <aside className="atlas-side">
          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Capas del atlas</h3>
              <span className="muted">{effectiveLayers.length}</span>
            </div>
            <div className="atlas-summary-list">
              {effectiveLayers.map((layer) => (
                <div key={layer.id} className="atlas-summary-item">
                  <strong>{layer.name}</strong>
                  <small>{layer.description || 'Sin descripcion.'}</small>
                  <div className="top-toolbar-actions">
                    <button type="button" onClick={() => handleToggleLayer(layer.id)}>
                      {layer.visible ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <input
                      value={layer.color}
                      onChange={(event) =>
                        updateAtlas({
                          layers: effectiveLayers.map((entry) =>
                            entry.id === layer.id ? { ...entry, color: event.target.value } : entry,
                          ),
                        })
                      }
                      title="Color de referencia de la capa"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Lugar seleccionado</h3>
              <span className="muted">{selectedNode ? selectedNode.connectedCount : 0} conexiones</span>
            </div>
            {!selectedNode ? (
              <p className="muted">Selecciona un lugar para ver su contexto geografico.</p>
            ) : (
              <>
                <strong>{selectedNode.label}</strong>
                <p>{selectedNode.summary || 'Sin resumen.'}</p>
                <p>{selectedNode.notes || 'Sin notas.'}</p>
                {selectedPin ? (
                  <div className="timeline-badges">
                    <span className="timeline-badge">Pin: {selectedPin.xPct.toFixed(1)} / {selectedPin.yPct.toFixed(1)}</span>
                    <span className="timeline-badge">Capa: {effectiveLayers.find((entry) => entry.id === selectedPin.layerId)?.name || selectedPin.layerId}</span>
                  </div>
                ) : (
                  <p className="muted">Este lugar aun no tiene pin propio en el atlas.</p>
                )}
                {selectedConnections.length === 0 ? (
                  <p className="muted">No hay conexiones registradas para este lugar.</p>
                ) : (
                  <div className="atlas-summary-list">
                    {selectedConnections.map((connection) => (
                      <div key={connection.relationshipId} className="atlas-summary-item">
                        <strong>{connection.label}</strong>
                        <small>{connection.notes || 'Sin notas.'}</small>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="bible-section">
            <div className="bible-section-head">
              <h3>Rutas medibles</h3>
              <span className="muted">{mapModel.routeCards.length}</span>
            </div>
            <div className="bible-two-col">
              <label>
                Desde pin
                <select value={routeDraft.fromPinId} onChange={(event) => setRouteDraft((prev) => ({ ...prev, fromPinId: event.target.value }))}>
                  <option value="">Seleccionar</option>
                  {atlas.pins.map((pin) => (
                    <option key={pin.id} value={pin.id}>
                      {pin.label || pin.locationId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hasta pin
                <select value={routeDraft.toPinId} onChange={(event) => setRouteDraft((prev) => ({ ...prev, toPinId: event.target.value }))}>
                  <option value="">Seleccionar</option>
                  {atlas.pins.map((pin) => (
                    <option key={pin.id} value={pin.id}>
                      {pin.label || pin.locationId}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Ruta vinculada
              <select value={routeDraft.routeId} onChange={(event) => setRouteDraft((prev) => ({ ...prev, routeId: event.target.value }))}>
                <option value="">Sin ruta</option>
                {saga.metadata.worldBible.routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.name || route.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="bible-two-col">
              <label>
                Distancia manual
                <input
                  type="number"
                  min={0}
                  value={routeDraft.distanceOverride}
                  onChange={(event) => setRouteDraft((prev) => ({ ...prev, distanceOverride: event.target.value }))}
                />
              </label>
              <label>
                Tiempo de viaje (h)
                <input
                  type="number"
                  min={0}
                  value={routeDraft.travelHours}
                  onChange={(event) => setRouteDraft((prev) => ({ ...prev, travelHours: event.target.value }))}
                />
              </label>
            </div>
            <label>
              Notas de ruta
              <textarea rows={2} value={routeDraft.notes} onChange={(event) => setRouteDraft((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            {routeDraft.fromPinId || routeDraft.toPinId ? (
              <p className="muted">
                Extremos actuales: {atlas.pins.find((pin) => pin.id === routeDraft.fromPinId)?.label || 'sin inicio'} {'->'}{' '}
                {atlas.pins.find((pin) => pin.id === routeDraft.toPinId)?.label || 'sin fin'}
              </p>
            ) : null}
            <button type="button" onClick={handleAddRouteMeasurement}>Agregar ruta medida</button>
            {mapModel.routeCards.length === 0 ? (
              <p className="muted">No hay rutas medidas cargadas en el atlas.</p>
            ) : (
              <div className="atlas-summary-list">
                {mapModel.routeCards.map((route) => (
                  <div key={route.id} className="atlas-summary-item">
                    <strong>{route.label}</strong>
                    <small>{route.distanceText} | {route.travelText}</small>
                    <small>{route.summary || route.notes || 'Sin detalle.'}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

export default WorldMapView;
