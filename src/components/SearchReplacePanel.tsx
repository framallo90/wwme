import type { ChapterSearchMatch } from '../lib/searchReplace';

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
  onReplaceInChapter: () => void;
  onReplaceInBook: () => void;
  onSelectChapter: (chapterId: string) => void;
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
