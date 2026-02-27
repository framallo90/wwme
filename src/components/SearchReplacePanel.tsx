import type { ChapterSearchMatch, ReplacePreviewReport } from '../lib/searchReplace';

interface SearchReplacePanelProps {
  hasBook: boolean;
  bookTitle: string;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  activeChapterId: string | null;
  results: ChapterSearchMatch[];
  totalMatches: number;
  busy: boolean;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onWholeWordChange: (value: boolean) => void;
  onRunSearch: () => void;
  onPreviewReplaceInBook: () => void;
  onReplaceInChapter: () => void;
  onReplaceInBook: () => void;
  onSelectChapter: (chapterId: string) => void;
  previewReport: ReplacePreviewReport | null;
}

function SearchReplacePanel(props: SearchReplacePanelProps) {
  if (!props.hasBook) {
    return (
      <section className="search-view empty-state">
        <h2>Buscar y reemplazar</h2>
        <p>Abri un libro para usar busqueda global.</p>
      </section>
    );
  }

  return (
    <section className="search-view">
      <header>
        <h2>Buscar y reemplazar</h2>
        <p>
          Libro activo: <strong>{props.bookTitle}</strong>
        </p>
      </header>

      <div className="search-form-grid">
        <label>
          Buscar
          <input
            type="text"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Texto a buscar en todo el libro"
          />
        </label>
        <label>
          Reemplazar por
          <input
            type="text"
            value={props.replacement}
            onChange={(event) => props.onReplacementChange(event.target.value)}
            placeholder="Texto nuevo"
          />
        </label>
      </div>

      <div className="search-options-row">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={props.caseSensitive}
            onChange={(event) => props.onCaseSensitiveChange(event.target.checked)}
          />
          Mayusculas/minusculas exactas
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={props.wholeWord} onChange={(event) => props.onWholeWordChange(event.target.checked)} />
          Palabra completa
        </label>
      </div>

      <div className="search-actions-row">
        <button type="button" onClick={props.onRunSearch} disabled={props.busy}>
          Buscar en libro
        </button>
        <button type="button" onClick={props.onPreviewReplaceInBook} disabled={props.busy}>
          Simular reemplazo global
        </button>
        <button type="button" onClick={props.onReplaceInChapter} disabled={props.busy || !props.activeChapterId}>
          Reemplazar en capitulo activo
        </button>
        <button type="button" onClick={props.onReplaceInBook} disabled={props.busy}>
          Reemplazar en todo el libro
        </button>
      </div>

      <p className="muted">
        Coincidencias encontradas: <strong>{props.totalMatches}</strong> en <strong>{props.results.length}</strong> capitulo/s.
      </p>

      {props.previewReport ? (
        <section className="search-preview">
          <h3>Simulacion de reemplazo global</h3>
          <p className="muted">
            Query: <strong>{props.previewReport.query || '(vacio)'}</strong> | Reemplazo:{' '}
            <strong>{props.previewReport.replacement || '(vacio)'}</strong>
          </p>
          <p className="muted">
            Cambios estimados: <strong>{props.previewReport.totalMatches}</strong> en{' '}
            <strong>{props.previewReport.affectedChapters}</strong> capitulo/s.
          </p>
          <div className="search-preview-list">
            {props.previewReport.items.length === 0 ? (
              <p className="muted">La simulacion no encontro coincidencias.</p>
            ) : (
              props.previewReport.items.map((item) => (
                <article key={`preview-${item.chapterId}`} className="search-preview-item">
                  <header>
                    <strong>
                      {item.chapterId} - {item.chapterTitle}
                    </strong>
                    <span>{item.matches} cambio/s</span>
                  </header>
                  <p className="muted">Antes: {item.beforeSample || '(sin muestra)'}</p>
                  <p className="muted">Despues: {item.afterSample || '(sin muestra)'}</p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      <div className="search-results">
        {props.results.length === 0 ? (
          <p className="muted">Todavia no hay resultados o no se encontraron coincidencias.</p>
        ) : (
          props.results.map((result) => (
            <article key={result.chapterId} className="search-result-item">
              <div>
                <h3>{result.chapterTitle}</h3>
                <p>ID {result.chapterId}</p>
              </div>
              <div className="search-result-actions">
                <span>{result.matches} coincidencias</span>
                <button type="button" onClick={() => props.onSelectChapter(result.chapterId)}>
                  Abrir
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default SearchReplacePanel;
