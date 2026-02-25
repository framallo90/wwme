import type { KeyboardEvent, MouseEvent } from 'react';
import type { ChapterDocument, LibraryBookEntry } from '../types/book';
import logoImage from '../assets/wwme-logo.png';

interface SidebarProps {
  hasBook: boolean;
  activeBookPath: string | null;
  bookTitle: string;
  chapters: ChapterDocument[];
  libraryBooks: LibraryBookEntry[];
  libraryExpanded: boolean;
  activeChapterId: string | null;
  onToggleLibrary: () => void;
  onOpenLibraryBook: (bookPath: string) => void;
  onOpenLibraryBookChat: (bookPath: string) => void;
  onOpenLibraryBookAmazon: (bookPath: string) => void;
  onDeleteLibraryBook: (bookPath: string) => void;
  onSetBookPublished: (bookPath: string, published: boolean) => void;
  onCreateChapter: () => void;
  onRenameChapter: (chapterId: string) => void;
  onDuplicateChapter: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  onSelectChapter: (chapterId: string) => void;
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

  const stopLibraryTogglePropagation = (event: MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
  };

  const handleLibraryItemKeyDown = (event: KeyboardEvent<HTMLElement>, bookPath: string): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      props.onOpenLibraryBook(bookPath);
    }
  };

  return (
    <aside className="left-sidebar">
      <header className="sidebar-header">
        <section className="sidebar-logo-showcase sidebar-logo-showcase-top" aria-label="Identidad visual de WriteWMe">
          <img src={logoImage} alt="Logo WriteWMe" />
        </section>
        <p className="sidebar-active-book">{props.hasBook ? props.bookTitle : 'Sin libro abierto'}</p>
      </header>

      <section className="library-section">
        <div className="section-title-row">
          <h2>Biblioteca</h2>
          <button
            type="button"
            onClick={props.onToggleLibrary}
            title="Expandir o contraer la lista de libros."
            aria-label={props.libraryExpanded ? 'Contraer biblioteca' : 'Expandir biblioteca'}
          >
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
                onKeyDown={(event) => handleLibraryItemKeyDown(event, entry.path)}
                role="button"
                tabIndex={0}
                aria-label={`Abrir libro ${entry.title}`}
              >
                <div className="library-head">
                  <h3>{entry.title}</h3>
                  <span className={`status-pill status-${entry.status}`}>{statusLabel[entry.status]}</span>
                </div>
                <p>{entry.author}</p>
                <p>{`${entry.chapterCount} caps - ${entry.wordCount} palabras`}</p>
                <div className="library-actions library-actions-compact">
                  <button
                    type="button"
                    title="Abrir este libro en el editor."
                    onClick={(event) => runLibraryAction(event, () => props.onOpenLibraryBook(entry.path))}
                  >
                    Abrir
                  </button>
                  <details className="library-options-menu" onClick={stopLibraryTogglePropagation}>
                    <summary onClick={stopLibraryTogglePropagation} title="Ver acciones avanzadas de este libro.">
                      Opciones
                    </summary>
                    <div className="library-options-dropdown">
                      <button
                        type="button"
                        title="Abrir chat del libro completo."
                        onClick={(event) => runLibraryAction(event, () => props.onOpenLibraryBookChat(entry.path))}
                      >
                        Chat
                      </button>
                      <button
                        type="button"
                        title="Abrir la seccion Amazon de este libro."
                        onClick={(event) => runLibraryAction(event, () => props.onOpenLibraryBookAmazon(entry.path))}
                      >
                        Amazon
                      </button>
                      <button
                        type="button"
                        title="Cambiar estado entre publicado y no publicado."
                        onClick={(event) =>
                          runLibraryAction(event, () => props.onSetBookPublished(entry.path, entry.status !== 'publicado'))
                        }
                      >
                        {entry.status === 'publicado' ? 'Despublicar' : 'Publicar'}
                      </button>
                      <button
                        type="button"
                        title="Eliminar este libro de la biblioteca y del disco."
                        onClick={(event) => runLibraryAction(event, () => props.onDeleteLibraryBook(entry.path))}
                      >
                        Eliminar
                      </button>
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="chapter-section">
        <div className="section-title-row">
          <h2>Capitulos</h2>
          <button
            type="button"
            onClick={props.onCreateChapter}
            disabled={!props.hasBook}
            title="Crea un nuevo capitulo en el libro."
            aria-label="Crear nuevo capitulo"
          >
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
                title="Abrir capitulo en el editor."
              >
                <span className="chapter-id">{chapter.id}</span>
                <span className="chapter-title">{chapter.title}</span>
              </button>
              <div className="chapter-controls">
                <button
                  type="button"
                  onClick={() => props.onMoveChapter(chapter.id, 'up')}
                  title="Sube el capitulo una posicion."
                  aria-label={`Subir ${chapter.title}`}
                >
                  ^
                </button>
                <button
                  type="button"
                  onClick={() => props.onMoveChapter(chapter.id, 'down')}
                  title="Baja el capitulo una posicion."
                  aria-label={`Bajar ${chapter.title}`}
                >
                  v
                </button>
                <button
                  type="button"
                  onClick={() => props.onRenameChapter(chapter.id)}
                  title="Renombra el capitulo."
                  aria-label={`Renombrar ${chapter.title}`}
                >
                  R
                </button>
                <button
                  type="button"
                  onClick={() => props.onDuplicateChapter(chapter.id)}
                  title="Duplica el capitulo seleccionado."
                  aria-label={`Duplicar ${chapter.title}`}
                >
                  D
                </button>
                <button
                  type="button"
                  onClick={() => props.onDeleteChapter(chapter.id)}
                  title="Elimina el capitulo seleccionado."
                  aria-label={`Eliminar ${chapter.title}`}
                >
                  X
                </button>
              </div>
              </article>
            ))}
          </div>
        </section>

      <details className="sidebar-collapsible">
        <summary>Exportar</summary>
        <div className="collapsible-body export-section">
          <button
            type="button"
            onClick={props.onExportChapter}
            disabled={!props.hasBook || !props.activeChapterId}
            title="Exporta el capitulo activo a Markdown."
          >
            Capitulo a Markdown
          </button>
          <button type="button" onClick={props.onExportBookSplit} disabled={!props.hasBook} title="Exporta un archivo por capitulo.">
            Libro por capitulos
          </button>
          <button type="button" onClick={props.onExportBookSingle} disabled={!props.hasBook} title="Exporta todo el libro en un solo archivo.">
            Libro archivo unico
          </button>
          <button type="button" onClick={props.onExportAmazonBundle} disabled={!props.hasBook} title="Genera pack TXT + HTML para carga rapida en Amazon.">
            Pack Amazon (TXT + HTML)
          </button>
        </div>
      </details>
    </aside>
  );
}

export default Sidebar;
