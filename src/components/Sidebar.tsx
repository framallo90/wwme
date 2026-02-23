import type { MouseEvent } from 'react';
import type { ChapterDocument, LibraryBookEntry, MainView } from '../types/book';
import {
  BookPlus,
  FolderOpen,
  BookX,
  Settings,
  FileText,
  ListTree,
  BookImage,
  Database,
  ShoppingCart,
} from 'lucide-react';

interface SidebarProps {
  hasBook: boolean;
  activeBookPath: string | null;
  bookTitle: string;
  chapters: ChapterDocument[];
  libraryBooks: LibraryBookEntry[];
  libraryExpanded: boolean;
  activeChapterId: string | null;
  currentView: MainView;
  onToggleLibrary: () => void;
  onOpenLibraryBook: (bookPath: string) => void;
  onOpenLibraryBookChat: (bookPath: string) => void;
  onOpenLibraryBookAmazon: (bookPath: string) => void;
  onDeleteLibraryBook: (bookPath: string) => void;
  onSetBookPublished: (bookPath: string, published: boolean) => void;
  onCreateBook: () => void;
  onOpenBook: () => void;
  onCloseBook: () => void;
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
  onShowAmazon: () => void;
  onShowSettings: () => void;
  onExportChapter: () => void;
  onExportBookSingle: () => void;
  onExportBookSplit: () => void;
  onExportAmazonBundle: () => void;
}

function Sidebar(props: SidebarProps) {
  const statusLabel: Record<LibraryBookEntry['status'], string> = {
    recien_creado: 'Recien creado',
    avanzado: 'Avanzado',
    publicado: 'Publicado',
  };

  const runLibraryAction = (event: MouseEvent<HTMLButtonElement>, action: () => void): void => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  return (
    <aside className="left-sidebar">
      <header className="sidebar-header">
        <h1>WriteWMe</h1>
        <p>{props.hasBook ? props.bookTitle : 'Sin libro abierto'}</p>
      </header>

      <section className="library-section">
        <div className="section-title-row">
          <h2>Biblioteca</h2>
          <button type="button" onClick={props.onToggleLibrary}>
            {props.libraryExpanded ? '-' : '+'}
          </button>
        </div>
        {props.libraryExpanded ? (
          <div className="library-list">
            {props.libraryBooks.length === 0 ? <p className="muted">Sin libros registrados.</p> : null}
            {props.libraryBooks.map((entry) => (
              <article
                key={entry.id}
                className={`library-item ${props.activeBookPath === entry.path ? 'is-active' : ''}`}
                onClick={() => props.onOpenLibraryBook(entry.path)}
              >
                <div className="library-head">
                  <h3>{entry.title}</h3>
                  <span className={`status-pill status-${entry.status}`}>{statusLabel[entry.status]}</span>
                </div>
                <p>{entry.author}</p>
                <p>{`${entry.chapterCount} caps - ${entry.wordCount} palabras`}</p>
                <div className="library-actions">
                  <button type="button" onClick={(event) => runLibraryAction(event, () => props.onOpenLibraryBook(entry.path))}>
                    Abrir
                  </button>
                  <button
                    type="button"
                    onClick={(event) => runLibraryAction(event, () => props.onOpenLibraryBookChat(entry.path))}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={(event) => runLibraryAction(event, () => props.onOpenLibraryBookAmazon(entry.path))}
                  >
                    Amazon
                  </button>
                  <button
                    type="button"
                    onClick={(event) => runLibraryAction(event, () => props.onDeleteLibraryBook(entry.path))}
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={(event) =>
                      runLibraryAction(event, () => props.onSetBookPublished(entry.path, entry.status !== 'publicado'))
                    }
                  >
                    {entry.status === 'publicado' ? 'Despublicar' : 'Publicar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <div className="sidebar-actions">
        <button type="button" className="icon-button" onClick={props.onCreateBook}>
          <BookPlus size={16} />
          <span>Nuevo libro</span>
        </button>
        <button type="button" className="icon-button" onClick={props.onOpenBook}>
          <FolderOpen size={16} />
          <span>Abrir libro</span>
        </button>
        <button type="button" className="icon-button" onClick={props.onCloseBook} disabled={!props.hasBook}>
          <BookX size={16} />
          <span>Cerrar libro</span>
        </button>
        <button type="button" className="icon-button" onClick={props.onShowSettings}>
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>

      <div className="sidebar-view-actions">
        <button
          className={`icon-button ${props.currentView === 'editor' ? 'is-active' : ''}`}
          type="button"
          onClick={props.onShowEditor}
          disabled={!props.hasBook}
        >
          <FileText size={16} />
          <span>Editor</span>
        </button>
        <button
          className={`icon-button ${props.currentView === 'outline' ? 'is-active' : ''}`}
          type="button"
          onClick={props.onShowOutline}
          disabled={!props.hasBook}
        >
          <ListTree size={16} />
          <span>Vista general</span>
        </button>
        <button
          className={`icon-button ${props.currentView === 'cover' ? 'is-active' : ''}`}
          type="button"
          onClick={props.onShowCover}
          disabled={!props.hasBook}
        >
          <BookImage size={16} />
          <span>Portada</span>
        </button>
        <button
          className={`icon-button ${props.currentView === 'foundation' ? 'is-active' : ''}`}
          type="button"
          onClick={props.onShowFoundation}
          disabled={!props.hasBook}
        >
          <Database size={16} />
          <span>Base</span>
        </button>
        <button
          className={`icon-button ${props.currentView === 'amazon' ? 'is-active' : ''}`}
          type="button"
          onClick={props.onShowAmazon}
          disabled={!props.hasBook}
        >
          <ShoppingCart size={16} />
          <span>Amazon</span>
        </button>
      </div>

      <section className="chapter-section">
        <div className="section-title-row">
          <h2>Capitulos</h2>
          <button type="button" onClick={props.onCreateChapter} disabled={!props.hasBook}>
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
                  type="button"
                  onClick={() => props.onSelectChapter(chapter.id)}
                  disabled={!props.hasBook}
                >
                <span className="chapter-id">{chapter.id}</span>
                <span className="chapter-title">{chapter.title}</span>
              </button>
              <div className="chapter-controls">
                <button type="button" onClick={() => props.onMoveChapter(chapter.id, 'up')} title="Subir">
                  ^
                </button>
                <button type="button" onClick={() => props.onMoveChapter(chapter.id, 'down')} title="Bajar">
                  v
                </button>
                <button type="button" onClick={() => props.onRenameChapter(chapter.id)} title="Renombrar">
                  R
                </button>
                <button type="button" onClick={() => props.onDuplicateChapter(chapter.id)} title="Duplicar">
                  D
                </button>
                <button type="button" onClick={() => props.onDeleteChapter(chapter.id)} title="Borrar">
                  X
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="export-section">
        <h2>Exportar</h2>
        <button type="button" onClick={props.onExportChapter} disabled={!props.hasBook || !props.activeChapterId}>
          Capitulo a Markdown
        </button>
        <button type="button" onClick={props.onExportBookSplit} disabled={!props.hasBook}>
          Libro por capitulos
        </button>
        <button type="button" onClick={props.onExportBookSingle} disabled={!props.hasBook}>
          Libro archivo unico
        </button>
        <button type="button" onClick={props.onExportAmazonBundle} disabled={!props.hasBook}>
          Pack Amazon (TXT + HTML)
        </button>
      </section>
    </aside>
  );
}

export default Sidebar;
