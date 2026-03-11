import { useMemo } from 'react';
import type { SagaProject, BookProject, LooseThread } from '../types/book';
import { buildSagaConsistencyReport } from '../lib/sagaConsistency';
import { countWordsFromHtml } from '../lib/metrics';

interface SagaDashboardViewProps {
  saga: SagaProject | null;
  book: BookProject | null;
  orderedChapters: Array<{ id: string; title: string; content: string; status?: string }>;
  looseThreads: LooseThread[];
  onOpenBook: (bookPath: string) => void;
  onShowView: (view: 'timeline' | 'saga' | 'loose-threads' | 'plot' | 'relations') => void;
}

interface BookSummary {
  path: string;
  title: string;
  volume: number | null;
  wordCount: number;
  chapterCount: number;
  isActive: boolean;
}

function SagaDashboardView(props: SagaDashboardViewProps) {
  const { saga, book, orderedChapters, looseThreads, onOpenBook, onShowView } = props;

  const consistencyReport = useMemo(() => {
    if (!saga) {
      return null;
    }
    return buildSagaConsistencyReport(saga);
  }, [saga]);

  const bookSummaries = useMemo<BookSummary[]>(() => {
    if (!saga) {
      return [];
    }
    return saga.metadata.books.map((link) => {
      const isActive = book?.path === link.bookPath;
      const chapters = isActive ? orderedChapters : [];
      const wordCount = chapters.reduce((total, ch) => total + countWordsFromHtml(ch.content), 0);
      return {
        path: link.bookPath,
        title: link.title || link.bookId,
        volume: link.volumeNumber,
        wordCount,
        chapterCount: isActive ? chapters.length : 0,
        isActive,
      };
    });
  }, [saga, book, orderedChapters]);

  const activeBookWordCount = useMemo(
    () => orderedChapters.reduce((total, ch) => total + countWordsFromHtml(ch.content), 0),
    [orderedChapters],
  );

  const openThreads = useMemo(() => looseThreads.filter((t) => t.status === 'open'), [looseThreads]);
  const resolvedThreads = useMemo(() => looseThreads.filter((t) => t.status === 'resolved'), [looseThreads]);

  const timelineEventCount = saga?.metadata.worldBible.timeline.length ?? 0;
  const characterCount = saga?.metadata.worldBible.characters.length ?? 0;
  const locationCount = saga?.metadata.worldBible.locations.length ?? 0;
  const relationshipCount = saga?.metadata.worldBible.relationships.length ?? 0;

  const riskLevel = useMemo(() => {
    if (!consistencyReport) {
      return 'desconocido';
    }
    if (consistencyReport.errorCount > 0) {
      return 'alto';
    }
    if (consistencyReport.warningCount > 3) {
      return 'medio';
    }
    return 'bajo';
  }, [consistencyReport]);

  if (!saga) {
    return (
      <div className="saga-dashboard-empty">
        <h2>Panel de saga</h2>
        <p>No hay ninguna saga activa. Abre o crea una saga para ver el panel.</p>
      </div>
    );
  }

  return (
    <div className="saga-dashboard">
      <header className="saga-dashboard-header">
        <h2>{saga.metadata.title || 'Saga sin titulo'}</h2>
        {saga.metadata.description ? <p className="muted">{saga.metadata.description}</p> : null}
      </header>

      <div className="saga-dashboard-grid">
        <section className="saga-dashboard-card">
          <h3>Resumen general</h3>
          <div className="saga-dashboard-stats">
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{saga.metadata.books.length}</span>
              <span className="saga-dashboard-stat-label">Libros</span>
            </div>
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{characterCount}</span>
              <span className="saga-dashboard-stat-label">Personajes</span>
            </div>
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{locationCount}</span>
              <span className="saga-dashboard-stat-label">Lugares</span>
            </div>
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{timelineEventCount}</span>
              <span className="saga-dashboard-stat-label">Eventos</span>
            </div>
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{relationshipCount}</span>
              <span className="saga-dashboard-stat-label">Relaciones</span>
            </div>
          </div>
        </section>

        <section className="saga-dashboard-card">
          <h3>Riesgo de continuidad</h3>
          <div className={`saga-dashboard-risk is-${riskLevel}`}>
            <span className="saga-dashboard-risk-badge">{riskLevel.toUpperCase()}</span>
            {consistencyReport ? (
              <div className="saga-dashboard-risk-detail">
                <span>{consistencyReport.errorCount} errores</span>
                <span>{consistencyReport.warningCount} advertencias</span>
                <span>{consistencyReport.issues.length} issues totales</span>
              </div>
            ) : (
              <span className="muted">Sin datos de consistencia.</span>
            )}
          </div>
          <button type="button" onClick={() => onShowView('timeline')}>
            Ver timeline
          </button>
        </section>

        <section className="saga-dashboard-card">
          <h3>Hilos narrativos</h3>
          <div className="saga-dashboard-stats">
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{openThreads.length}</span>
              <span className="saga-dashboard-stat-label">Abiertos</span>
            </div>
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{resolvedThreads.length}</span>
              <span className="saga-dashboard-stat-label">Resueltos</span>
            </div>
            <div className="saga-dashboard-stat">
              <span className="saga-dashboard-stat-value">{looseThreads.length}</span>
              <span className="saga-dashboard-stat-label">Total</span>
            </div>
          </div>
          {openThreads.length > 0 ? (
            <ul className="saga-dashboard-thread-list">
              {openThreads.slice(0, 5).map((thread) => (
                <li key={thread.id}>
                  <strong>{thread.title}</strong>
                  {thread.chapterRef ? <span className="muted"> (cap. {thread.chapterRef})</span> : null}
                </li>
              ))}
              {openThreads.length > 5 ? <li className="muted">y {openThreads.length - 5} mas...</li> : null}
            </ul>
          ) : (
            <p className="muted">No hay hilos abiertos.</p>
          )}
          <button type="button" onClick={() => onShowView('loose-threads')}>
            Gestionar hilos
          </button>
        </section>

        <section className="saga-dashboard-card">
          <h3>Progreso por libro</h3>
          {book ? (
            <div className="saga-dashboard-active-book">
              <strong>{book.metadata.title || 'Sin titulo'}</strong>
              <span>{activeBookWordCount.toLocaleString()} palabras | {orderedChapters.length} capitulos</span>
            </div>
          ) : null}
          <div className="saga-dashboard-book-list">
            {bookSummaries.map((entry) => (
              <div
                key={entry.path}
                className={`saga-dashboard-book-row ${entry.isActive ? 'is-active' : ''}`}
              >
                <span className="saga-dashboard-book-title">
                  {entry.volume !== null ? `Vol. ${entry.volume} — ` : ''}
                  {entry.title}
                </span>
                {entry.isActive ? (
                  <span className="muted">{entry.wordCount.toLocaleString()} palabras</span>
                ) : (
                  <button type="button" onClick={() => onOpenBook(entry.path)}>
                    Abrir
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {consistencyReport && consistencyReport.issues.length > 0 ? (
          <section className="saga-dashboard-card saga-dashboard-card-wide">
            <h3>Issues de consistencia recientes</h3>
            <ul className="saga-dashboard-issue-list">
              {consistencyReport.issues.slice(0, 10).map((issue, index) => (
                <li key={`${issue.code}-${index}`} className={`is-${issue.severity}`}>
                  <span className="saga-dashboard-issue-badge">{issue.severity}</span>
                  <span>{issue.message}</span>
                </li>
              ))}
              {consistencyReport.issues.length > 10 ? (
                <li className="muted">{consistencyReport.issues.length - 10} issues adicionales.</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <section className="saga-dashboard-card">
          <h3>Accesos rapidos</h3>
          <div className="saga-dashboard-shortcuts">
            <button type="button" onClick={() => onShowView('saga')}>Biblia de saga</button>
            <button type="button" onClick={() => onShowView('timeline')}>Timeline</button>
            <button type="button" onClick={() => onShowView('plot')}>Tablero de trama</button>
            <button type="button" onClick={() => onShowView('relations')}>Relaciones</button>
            <button type="button" onClick={() => onShowView('loose-threads')}>Hilos sueltos</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SagaDashboardView;
