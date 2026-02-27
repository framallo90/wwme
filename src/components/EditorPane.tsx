import { Suspense, forwardRef, lazy, useState } from 'react';
import type { JSONContent } from '@tiptap/core';

import { CHAPTER_LENGTH_OPTIONS, formatChapterLengthLabel, resolveChapterLengthPreset } from '../lib/chapterLength';
import { formatNumber } from '../lib/metrics';
import type { ChapterDocument, ChapterLengthPreset, InteriorFormat } from '../types/book';
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
  onUndoEdit: () => void;
  onRedoEdit: () => void;
  onLengthPresetChange: (preset: ChapterLengthPreset) => void;
  onContentChange: (payload: { html: string; json: JSONContent }) => void;
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
    <section className="editor-pane">
      <header className="editor-header">
        <div>
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

      {editorEnabled ? (
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
            onChange={props.onContentChange}
            onBlur={props.onBlur}
          />
        </Suspense>
      ) : (
        <section className="editor-lazy-gate" role="status" aria-live="polite">
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
