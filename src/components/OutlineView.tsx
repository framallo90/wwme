import type { ChapterDocument } from '../types/book';
import { getChapterWordCount } from '../lib/export';
import { stripHtml } from '../lib/text';

interface OutlineViewProps {
  chapters: ChapterDocument[];
  onSelectChapter: (chapterId: string) => void;
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
            <p>{stripHtml(chapter.content).slice(0, 260) || 'Sin contenido'}</p>
            <button onClick={() => props.onSelectChapter(chapter.id)}>Ir al editor</button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default OutlineView;
