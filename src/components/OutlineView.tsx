import type { ChapterDocument } from '../types/book';
import { getChapterWordCount } from '../lib/export';
import { stripHtml } from '../lib/text';

interface OutlineViewProps {
  chapters: ChapterDocument[];
  onSelectChapter: (chapterId: string) => void;
  onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  onMoveToPosition: (chapterId: string, position: number) => void;
}

function OutlineView(props: OutlineViewProps) {
  return (
    <section className="outline-view">
      <header>
        <h2>Vista general del libro</h2>
        <p>{props.chapters.length} capitulos</p>
      </header>

      <div className="outline-list">
        {props.chapters.map((chapter, index) => (
          <article key={chapter.id} className="outline-item">
            <div className="outline-head">
              <h3>
                {index + 1}. {chapter.title}
              </h3>
              <span>{getChapterWordCount(chapter)} palabras</span>
            </div>
            <div className="outline-order-controls">
              <button
                type="button"
                onClick={() => props.onMoveChapter(chapter.id, 'up')}
                disabled={index === 0}
                title="Subir capitulo"
              >
                Subir
              </button>
              <label>
                Posicion
                <input
                  type="number"
                  min={1}
                  max={props.chapters.length}
                  defaultValue={index + 1}
                  onBlur={(event) => {
                    const nextPosition = Number.parseInt(event.currentTarget.value || '', 10);
                    if (Number.isFinite(nextPosition)) {
                      props.onMoveToPosition(chapter.id, nextPosition);
                    }
                    event.currentTarget.value = String(
                      props.chapters.findIndex((item) => item.id === chapter.id) + 1,
                    );
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => props.onMoveChapter(chapter.id, 'down')}
                disabled={index >= props.chapters.length - 1}
                title="Bajar capitulo"
              >
                Bajar
              </button>
            </div>
            <p>{stripHtml(chapter.content).slice(0, 260) || 'Sin contenido'}</p>
            <button type="button" onClick={() => props.onSelectChapter(chapter.id)}>
              Ir al editor
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default OutlineView;
