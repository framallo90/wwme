import { Suspense, forwardRef, lazy, useState } from 'react';
import type { JSONContent } from '@tiptap/core';

import { CHAPTER_LENGTH_OPTIONS, formatChapterLengthLabel, resolveChapterLengthPreset } from '../lib/chapterLength';
import type { ChapterContinuityBriefing } from '../lib/chapterContinuityBriefing';
import { formatNumber } from '../lib/metrics';
import type { ContinuityGuardReport, ContinuityHighlightTerm } from '../lib/continuityGuard';
import type { SemanticReferenceCatalogEntry } from '../lib/semanticReferences';
import type { AudioPlaybackState } from '../lib/audio';
import type { ChapterDocument, ChapterLengthPreset, ChapterManuscriptNote, InteriorFormat } from '../types/book';
import type { TiptapEditorHandle } from './TiptapEditor';

const LazyTiptapEditor = lazy(() => import('./TiptapEditor'));

interface EditorPaneProps {
  chapter: ChapterDocument | null;
  interiorFormat: InteriorFormat;
  autosaveIntervalMs: number;
  canUndoEdit: boolean;
  canRedoEdit: boolean;
  chapterWordCount: number;
  chapterEstimatedPages: number;
  chapterPageStart: number;
  chapterPageEnd: number;
  bookWordCount: number;
  bookEstimatedPages: number;
  continuityHighlightEnabled: boolean;
  continuityHighlights: ContinuityHighlightTerm[];
  continuityReport: ContinuityGuardReport | null;
  continuityBriefing: ChapterContinuityBriefing | null;
  semanticReferenceCharacterCount: number;
  semanticReferenceLocationCount: number;
  semanticReferencesCatalog: SemanticReferenceCatalogEntry[];
  audioPlaybackState: AudioPlaybackState;
  manuscriptNotes: ChapterManuscriptNote[];
  onUndoEdit: () => void;
  onRedoEdit: () => void;
  onReadAloud: () => void;
  onTogglePauseReadAloud: () => void;
  onStopReadAloud: () => void;
  onExportChapterAudio: () => void;
  onLengthPresetChange: (preset: ChapterLengthPreset) => void;
  onContinuityHighlightToggle: (enabled: boolean) => void;
  onRefreshContinuityBriefing: () => void;
  onContentChange: (payload: { html: string; json: JSONContent }) => void;
  onInsertCharacterReference: () => void;
  onInsertLocationReference: () => void;
  onOpenSemanticReference: (reference: {
    id: string;
    kind: 'character' | 'location';
    label: string;
    targetView: 'bible' | 'saga';
  }) => void;
  onAddManuscriptNote: () => void;
  onToggleManuscriptNote: (noteId: string) => void;
  onDeleteManuscriptNote: (noteId: string) => void;
  onBlur: () => void;
}

const EditorPane = forwardRef<TiptapEditorHandle, EditorPaneProps>((props, ref) => {
  const [editorEnabled, setEditorEnabled] = useState(false);
  const [advancedToolsVisible, setAdvancedToolsVisible] = useState(false);

  if (!props.chapter) {
    return (
      <section className="editor-pane empty-state">
        <h2>Editor</h2>
        <p>Abri o crea un libro para empezar.</p>
      </section>
    );
  }

  return (
    <section className="editor-pane manuscript-view">
      <header className="editor-header editor-hero">
        <div className="editor-title-block">
          <span className="section-kicker">Manuscrito activo</span>
          <h2>{props.chapter.title}</h2>
          <p>ID {props.chapter.id}</p>
        </div>
        <div className="editor-header-meta">
          <span>Auto-guardado {Math.round(props.autosaveIntervalMs / 1000)}s</span>
          <button
            type="button"
            className="editor-tools-toggle"
            onClick={() => setAdvancedToolsVisible((previous) => !previous)}
          >
            {advancedToolsVisible ? 'Ocultar herramientas' : 'Mostrar herramientas'}
          </button>
          {advancedToolsVisible ? (
            <>
              <div className="editor-history-actions">
                <button
                  type="button"
                  onClick={props.onUndoEdit}
                  disabled={!props.canUndoEdit}
                  title="Deshace el ultimo cambio de texto (Ctrl+Z)."
                >
                  Deshacer
                </button>
                <button
                  type="button"
                  onClick={props.onRedoEdit}
                  disabled={!props.canRedoEdit}
                  title="Rehace el cambio deshecho (Ctrl+Y)."
                >
                  Rehacer
                </button>
                <button
                  type="button"
                  onClick={props.onReadAloud}
                  title="Lee el capitulo activo con la voz del idioma configurado."
                >
                  Leer audio
                </button>
                <button
                  type="button"
                  onClick={props.onTogglePauseReadAloud}
                  disabled={props.audioPlaybackState === 'idle'}
                  title="Pausa o reanuda la lectura en voz alta."
                >
                  {props.audioPlaybackState === 'paused' ? 'Reanudar audio' : 'Pausar audio'}
                </button>
                <button
                  type="button"
                  onClick={props.onStopReadAloud}
                  disabled={props.audioPlaybackState === 'idle'}
                  title="Detiene la lectura en voz alta."
                >
                  Detener audio
                </button>
                <button
                  type="button"
                  onClick={props.onExportChapterAudio}
                  title="Exporta el capitulo activo a WAV usando la voz del sistema."
                >
                  Exportar audio
                </button>
              </div>
              <div className="editor-metrics" title="Conteo y paginacion estimada segun formato interior.">
                <span>Capitulo: {formatNumber(props.chapterWordCount)} palabras</span>
                <span>
                  Hojas capitulo: {props.chapterEstimatedPages > 0 ? formatNumber(props.chapterEstimatedPages) : '0'} (
                  {props.chapterPageStart > 0 ? `${props.chapterPageStart}-${props.chapterPageEnd}` : '-'})
                </span>
                <span>
                  Libro: {formatNumber(props.bookWordCount)} palabras | hojas {formatNumber(props.bookEstimatedPages)}
                </span>
                <span>Audio: {props.audioPlaybackState === 'idle' ? 'detenido' : props.audioPlaybackState}</span>
              </div>
              <label className="chapter-length-control" title="Define el largo objetivo de este capitulo para las acciones de IA.">
                <span>Extension objetivo</span>
                <select
                  value={resolveChapterLengthPreset(props.chapter.lengthPreset)}
                  onChange={(event) => props.onLengthPresetChange(event.target.value as ChapterLengthPreset)}
                >
                  {CHAPTER_LENGTH_OPTIONS.map((option) => (
                    <option key={option.preset} value={option.preset}>
                      {formatChapterLengthLabel(option.preset)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>
      </header>

      <section className="continuity-guard-panel editor-reference-panel" aria-live="polite">
        <div className="continuity-guard-header">
          <div>
            <h3>Guardian de continuidad</h3>
            <p className="muted">Detecta personajes/lugares y alerta contradicciones probables en tiempo real.</p>
          </div>
          <label className="continuity-highlight-toggle" title="Resalta nombres de la biblia dentro del editor.">
            <input
              type="checkbox"
              checked={props.continuityHighlightEnabled}
              onChange={(event) => props.onContinuityHighlightToggle(event.target.checked)}
            />
            Resaltar nombres en editor
          </label>
        </div>
        <p className="continuity-guard-summary">
          Entidades detectadas: {props.continuityReport?.mentions.length ?? 0} | alertas activas:{' '}
          {props.continuityReport?.issues.length ?? 0} | refs semanticas: {props.semanticReferenceCharacterCount} personajes /{' '}
          {props.semanticReferenceLocationCount} lugares
        </p>
        <div className="editor-reference-toolbar">
          <button type="button" onClick={props.onInsertCharacterReference} title="Inserta una referencia semantica a un personaje del canon.">
            Insertar @Personaje
          </button>
          <button type="button" onClick={props.onInsertLocationReference} title="Inserta una referencia semantica a un lugar del canon.">
            Insertar #Lugar
          </button>
          <button type="button" onClick={props.onAddManuscriptNote} title="Guarda una nota privada sobre el fragmento actual o la seleccion.">
            Nueva nota al margen
          </button>
        </div>
        {(props.continuityReport?.mentions.length ?? 0) > 0 ? (
          <div className="continuity-entity-list" role="list" aria-label="Entidades detectadas en el capitulo">
            {(props.continuityReport?.mentions ?? []).slice(0, 10).map((entry) => (
              <span
                key={`${entry.kind}-${entry.id}`}
                className={`continuity-entity-chip continuity-entity-chip--${entry.kind}`}
                title={entry.tooltip}
                role="listitem"
              >
                {entry.label} x{entry.occurrences}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">Sin entidades de la biblia detectadas en el texto actual.</p>
        )}
        {(props.continuityReport?.issues.length ?? 0) > 0 ? (
          <ul className="continuity-issue-list">
            {(props.continuityReport?.issues ?? []).slice(0, 4).map((issue) => (
              <li key={issue.id}>
                <strong>{issue.message}</strong>
                <p>{issue.evidence}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Sin inconsistencias detectadas por las reglas actuales.</p>
        )}
        <section className="continuity-briefing-panel" aria-label="Briefing de continuidad">
          <div className="continuity-guard-header">
            <div>
              <h3>Briefing de continuidad</h3>
              <p className="muted">Resumen previo para escribir sin perder el hilo de personajes, lugares e hilos activos.</p>
            </div>
            <button type="button" onClick={props.onRefreshContinuityBriefing}>
              Actualizar briefing
            </button>
          </div>
          {props.continuityBriefing ? (
            <>
              <p className="continuity-briefing-summary">
                Base: {props.continuityBriefing.source === 'previous' ? 'arrastre del capitulo anterior' : 'capitulo activo'} |{' '}
                fuente {props.continuityBriefing.sourceChapterTitle}
                {props.continuityBriefing.pointOfView ? ` | POV ${props.continuityBriefing.pointOfView}` : ''}
              </p>
              {props.continuityBriefing.synopsis ? (
                <p className="muted continuity-briefing-synopsis">{props.continuityBriefing.synopsis}</p>
              ) : null}
              <div className="continuity-briefing-grid">
                <article className="continuity-briefing-card">
                  <h4>Personajes en foco</h4>
                  {props.continuityBriefing.characters.length === 0 ? (
                    <p className="muted">Sin personajes dominantes detectados en el contexto actual.</p>
                  ) : (
                    <ul>
                      {props.continuityBriefing.characters.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.label}</strong> x{entry.occurrences}
                          {entry.lastMentionChapterTitle ? ` | ultima mencion: ${entry.lastMentionChapterTitle}` : ''}
                          {entry.chaptersAgo !== null ? ` (${entry.chaptersAgo} cap. atras)` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
                <article className="continuity-briefing-card">
                  <h4>Lugares en foco</h4>
                  {props.continuityBriefing.locations.length === 0 ? (
                    <p className="muted">Sin lugares dominantes detectados todavia.</p>
                  ) : (
                    <ul>
                      {props.continuityBriefing.locations.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.label}</strong> x{entry.occurrences}
                          {entry.lastMentionChapterTitle ? ` | ultima referencia: ${entry.lastMentionChapterTitle}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
                <article className="continuity-briefing-card">
                  <h4>Hilos abiertos</h4>
                  {props.continuityBriefing.openThreads.length === 0 ? (
                    <p className="muted">No hay hilos abiertos registrados en el libro.</p>
                  ) : (
                    <ul>
                      {props.continuityBriefing.openThreads.map((thread) => (
                        <li key={thread.id}>
                          <strong>{thread.title}</strong>
                          {thread.chapterRefTitle ? ` | anclado en ${thread.chapterRefTitle}` : ''}
                          {thread.description ? <span> | {thread.description}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
                <article className="continuity-briefing-card">
                  <h4>Riesgos inmediatos</h4>
                  {props.continuityBriefing.alerts.length === 0 ? (
                    <p className="muted">Sin alertas narrativas nuevas en este contexto.</p>
                  ) : (
                    <ul>
                      {props.continuityBriefing.alerts.map((alert) => (
                        <li key={alert.id}>
                          <strong>{alert.message}</strong>
                          <span> | {alert.evidence}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </div>
            </>
          ) : (
            <p className="muted">Todavia no hay suficiente contexto para generar un briefing de continuidad.</p>
          )}
        </section>
        <section className="manuscript-notes-panel" aria-label="Notas privadas del manuscrito">
          <div className="continuity-guard-header">
            <div>
              <h3>Notas al margen</h3>
              <p className="muted">Comentarios privados del proceso. No forman parte del texto exportado.</p>
            </div>
            <span className="muted">{props.manuscriptNotes.length} nota/s</span>
          </div>
          {props.manuscriptNotes.length === 0 ? (
            <p className="muted">Todavia no hay notas privadas en este capitulo.</p>
          ) : (
            <div className="manuscript-note-list">
              {props.manuscriptNotes.map((note) => (
                <article
                  key={note.id}
                  className={`manuscript-note-card ${note.status === 'resolved' ? 'is-resolved' : ''}`}
                >
                  <div className="manuscript-note-head">
                    <strong>{note.status === 'resolved' ? 'Resuelta' : 'Pendiente'}</strong>
                    <div className="top-toolbar-actions">
                      <button type="button" onClick={() => props.onToggleManuscriptNote(note.id)}>
                        {note.status === 'resolved' ? 'Reabrir' : 'Resolver'}
                      </button>
                      <button type="button" onClick={() => props.onDeleteManuscriptNote(note.id)}>
                        Quitar
                      </button>
                    </div>
                  </div>
                  {note.excerpt ? <blockquote>{note.excerpt}</blockquote> : null}
                  <p>{note.note}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {editorEnabled ? (
        <section className="editor-stage-shell">
          <div className="editor-stage-note">
            <span className="section-kicker">Mesa de escritura</span>
            <strong>Modo manuscrito</strong>
          </div>
          <div className="editor-paper-frame">
            <Suspense
              fallback={
                <section className="editor-lazy-gate" role="status" aria-live="polite">
                  <p className="muted">Cargando motor de edicion...</p>
                </section>
              }
            >
              <LazyTiptapEditor
                ref={ref}
                content={props.chapter.content}
                interiorFormat={props.interiorFormat}
                continuityHighlightEnabled={props.continuityHighlightEnabled}
                continuityHighlights={props.continuityHighlights}
                semanticReferencesCatalog={props.semanticReferencesCatalog}
                onChange={props.onContentChange}
                onSemanticReferenceOpen={props.onOpenSemanticReference}
                onBlur={props.onBlur}
              />
            </Suspense>
          </div>
        </section>
      ) : (
        <section className="editor-lazy-gate editor-stage-shell" role="status" aria-live="polite">
          <span className="section-kicker">Motor bajo demanda</span>
          <h3>Editor bajo demanda</h3>
          <p className="muted">
            Para acelerar el arranque, el motor de escritura se carga cuando vas a editar.
          </p>
          <button type="button" onClick={() => setEditorEnabled(true)}>
            Activar editor
          </button>
        </section>
      )}
    </section>
  );
});

EditorPane.displayName = 'EditorPane';

export default EditorPane;
