import { useMemo, useState } from 'react';
import { formatNumber } from '../lib/metrics';
import { analyzeBookStyleFromChapters, getStyleLevelLabel, type StyleLevel } from '../lib/styleMetrics';
import type { ChapterDocument } from '../types/book';

interface StylePanelProps {
  hasBook: boolean;
  bookTitle: string;
  chapters: ChapterDocument[];
  activeChapterId: string | null;
  onExportReport: () => void;
}

function StyleLevelBadge(props: { level: StyleLevel }) {
  return <span className={`style-level-badge level-${props.level}`}>{getStyleLevelLabel(props.level)}</span>;
}

function formatReading(minutes: number): string {
  if (minutes <= 0) {
    return '0 min';
  }

  return `${minutes} min`;
}

function StylePanel(props: StylePanelProps) {
  const [chapterSelection, setChapterSelection] = useState<string>('');
  const styleReport = useMemo(() => analyzeBookStyleFromChapters(props.chapters), [props.chapters]);

  const selectedChapterId = useMemo(() => {
    if (props.chapters.length === 0) {
      return null;
    }

    if (chapterSelection && props.chapters.some((chapter) => chapter.id === chapterSelection)) {
      return chapterSelection;
    }

    if (props.activeChapterId && props.chapters.some((chapter) => chapter.id === props.activeChapterId)) {
      return props.activeChapterId;
    }

    return props.chapters[0].id;
  }, [props.chapters, props.activeChapterId, chapterSelection]);

  const activeChapterReport = styleReport.chapters.find((entry) => entry.chapterId === selectedChapterId) ?? null;

  return (
    <section className="style-view">
      <header className="style-header">
        <div>
          <h2>Analisis de estilo</h2>
          <p>
            Mide ritmo y repeticion para mantener una prosa clara. Semaforo: verde OK, amarillo revisar, rojo alerta.
          </p>
        </div>
        <button type="button" onClick={props.onExportReport} disabled={!props.hasBook || props.chapters.length === 0}>
          Exportar reporte (.txt)
        </button>
      </header>

      {!props.hasBook || props.chapters.length === 0 ? (
        <p className="muted">Abre un libro con capitulos para activar el analisis de estilo.</p>
      ) : (
        <>
          <div className="style-kpi-grid">
            <article className="style-kpi-card">
              <h3>Libro</h3>
              <p>{props.bookTitle}</p>
              <StyleLevelBadge level={styleReport.book.overallLevel} />
            </article>
            <article className="style-kpi-card">
              <h3>Palabras</h3>
              <p>{formatNumber(styleReport.book.wordCount)}</p>
            </article>
            <article className="style-kpi-card">
              <h3>Promedio por oracion</h3>
              <p>{styleReport.book.avgWordsPerSentence} palabras</p>
              <StyleLevelBadge level={styleReport.book.sentenceLengthLevel} />
            </article>
            <article className="style-kpi-card">
              <h3>Lectura estimada</h3>
              <p>{formatReading(styleReport.book.readingMinutes)}</p>
            </article>
          </div>

          <section className="style-chapter-panel">
            <label>
              Capitulo para detalle
              <select
                value={selectedChapterId ?? ''}
                onChange={(event) => {
                  setChapterSelection(event.target.value);
                }}
              >
                {styleReport.chapters.map((entry) => (
                  <option key={entry.chapterId} value={entry.chapterId}>
                    {entry.chapterId} - {entry.title}
                  </option>
                ))}
              </select>
            </label>

            {activeChapterReport ? (
              <div className="style-selected-summary">
                <p>
                  <strong>{activeChapterReport.title}</strong> | palabras: {formatNumber(activeChapterReport.analysis.wordCount)} |
                  oraciones: {formatNumber(activeChapterReport.analysis.sentenceCount)} | promedio:{' '}
                  {activeChapterReport.analysis.avgWordsPerSentence}
                </p>
                <div className="style-badge-row">
                  <span>Ritmo: <StyleLevelBadge level={activeChapterReport.analysis.sentenceLengthLevel} /></span>
                  <span>Repeticion: <StyleLevelBadge level={activeChapterReport.analysis.repetitionLevel} /></span>
                  <span>Total: <StyleLevelBadge level={activeChapterReport.analysis.overallLevel} /></span>
                </div>
                <p className="muted">Tiempo estimado: {formatReading(activeChapterReport.analysis.readingMinutes)}</p>
                <h4>Top repeticiones</h4>
                {activeChapterReport.analysis.topRepetitions.length === 0 ? (
                  <p className="muted">Sin repeticiones relevantes (&gt;=2 ocurrencias, filtrando stopwords).</p>
                ) : (
                  <ul className="style-repetition-list">
                    {activeChapterReport.analysis.topRepetitions.map((entry) => (
                      <li key={entry.term}>
                        <code>{entry.term}</code> | {entry.count} veces | {entry.perThousand} por 1000 palabras
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          <section className="style-chapter-table">
            <h3>Resumen por capitulo</h3>
            <div className="style-table-head">
              <span>Capitulo</span>
              <span>Palabras</span>
              <span>Promedio</span>
              <span>Lectura</span>
              <span>Semaforo</span>
            </div>
            {styleReport.chapters.map((entry) => (
              <article key={entry.chapterId} className="style-table-row">
                <span>{entry.chapterId} - {entry.title}</span>
                <span>{formatNumber(entry.analysis.wordCount)}</span>
                <span>{entry.analysis.avgWordsPerSentence}</span>
                <span>{formatReading(entry.analysis.readingMinutes)}</span>
                <span><StyleLevelBadge level={entry.analysis.overallLevel} /></span>
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}

export default StylePanel;
