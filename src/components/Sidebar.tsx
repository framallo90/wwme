import type { ChapterDocument, MainView } from '../types/book';

interface SidebarProps {
  hasBook: boolean;
  bookTitle: string;
  chapters: ChapterDocument[];
  activeChapterId: string | null;
  currentView: MainView;
  onCreateBook: () => void;
  onOpenBook: () => void;
  onCreateChapter: () => void;
  onRenameChapter: (chapterId: string) => void;
  onDuplicateChapter: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  onSelectChapter: (chapterId: string) => void;
  onShowEditor: () => void;
  onShowOutline: () => void;
  onShowCover: () => void;
  onShowFoundation: () => void;
  onShowSettings: () => void;
  onExportChapter: () => void;
  onExportBookSingle: () => void;
  onExportBookSplit: () => void;
}

function Sidebar(props: SidebarProps) {
  return (
    <aside className="left-sidebar">
      <header className="sidebar-header">
        <h1>WriteWMe</h1>
        <p>{props.hasBook ? props.bookTitle : 'Sin libro abierto'}</p>
      </header>

      <div className="sidebar-actions">
        <button onClick={props.onCreateBook}>Nuevo libro</button>
        <button onClick={props.onOpenBook}>Abrir libro</button>
        <button onClick={props.onShowSettings}>Settings</button>
      </div>

      <div className="sidebar-view-actions">
        <button
          className={props.currentView === 'editor' ? 'is-active' : ''}
          onClick={props.onShowEditor}
          disabled={!props.hasBook}
        >
          Editor
        </button>
        <button
          className={props.currentView === 'outline' ? 'is-active' : ''}
          onClick={props.onShowOutline}
          disabled={!props.hasBook}
        >
          Vista general
        </button>
        <button
          className={props.currentView === 'cover' ? 'is-active' : ''}
          onClick={props.onShowCover}
          disabled={!props.hasBook}
        >
          Portada
        </button>
        <button
          className={props.currentView === 'foundation' ? 'is-active' : ''}
          onClick={props.onShowFoundation}
          disabled={!props.hasBook}
        >
          Base
        </button>
      </div>

      <section className="chapter-section">
        <div className="section-title-row">
          <h2>Capitulos</h2>
          <button onClick={props.onCreateChapter} disabled={!props.hasBook}>
            +
          </button>
        </div>

        <div className="chapter-list">
          {props.chapters.map((chapter) => (
            <article
              key={chapter.id}
              className={`chapter-item ${props.activeChapterId === chapter.id ? 'is-active' : ''}`}
            >
              <button
                className="chapter-main"
                onClick={() => props.onSelectChapter(chapter.id)}
                disabled={!props.hasBook}
              >
                <span className="chapter-id">{chapter.id}</span>
                <span className="chapter-title">{chapter.title}</span>
              </button>
              <div className="chapter-controls">
                <button onClick={() => props.onMoveChapter(chapter.id, 'up')} title="Subir">
                  ^
                </button>
                <button onClick={() => props.onMoveChapter(chapter.id, 'down')} title="Bajar">
                  v
                </button>
                <button onClick={() => props.onRenameChapter(chapter.id)} title="Renombrar">
                  R
                </button>
                <button onClick={() => props.onDuplicateChapter(chapter.id)} title="Duplicar">
                  D
                </button>
                <button onClick={() => props.onDeleteChapter(chapter.id)} title="Borrar">
                  X
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="export-section">
        <h2>Exportar</h2>
        <button onClick={props.onExportChapter} disabled={!props.hasBook || !props.activeChapterId}>
          Capitulo a Markdown
        </button>
        <button onClick={props.onExportBookSplit} disabled={!props.hasBook}>
          Libro por capitulos
        </button>
        <button onClick={props.onExportBookSingle} disabled={!props.hasBook}>
          Libro archivo unico
        </button>
      </section>
    </aside>
  );
}

export default Sidebar;
