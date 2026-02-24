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
import logoImage from '../assets/wwme-logo.png';

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
        <div className="sidebar-brand">
          <img src={logoImage} alt="WriteWMe" className="brand-logo" />
          <div className="brand-text">
            <h1>WriteWMe</h1>
            <p>{props.hasBook ? props.bookTitle : 'Sin libro abierto'}</p>
          </div>
        </div>
      </header>

      <section className="library-section">
        <div className="section-title-row">
          <h2>Biblioteca</h2>
          <button type="button" onClick={props.onToggleLibrary} title="Expandir o contraer la lista de libros.">
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
                  <button
                    type="button"
                    title="Abrir este libro en el editor."
                    onClick={(event) => runLibraryAction(event, () => props.onOpenLibraryBook(entry.path))}
                  >
                    Abrir
                  </button>
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
                    title="Eliminar este libro de la biblioteca y del disco."
                    onClick={(event) => runLibraryAction(event, () => props.onDeleteLibraryBook(entry.path))}
                  >
                    Eliminar
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
                <button type="button" onClick={() => props.onMoveChapter(chapter.id, 'up')} title="Sube el capitulo una posicion.">
                  ^
                </button>
                <button type="button" onClick={() => props.onMoveChapter(chapter.id, 'down')} title="Baja el capitulo una posicion.">
                  v
                </button>
                <button type="button" onClick={() => props.onRenameChapter(chapter.id)} title="Renombra el capitulo.">
                  R
                </button>
                <button type="button" onClick={() => props.onDuplicateChapter(chapter.id)} title="Duplica el capitulo seleccionado.">
                  D
                </button>
                <button type="button" onClick={() => props.onDeleteChapter(chapter.id)} title="Elimina el capitulo seleccionado.">
                  X
                </button>
              </div>
              </article>
            ))}
          </div>
        </section>

      <details className="sidebar-collapsible">
        <summary>Opciones y vistas</summary>
        <div className="collapsible-body">
          <div className="sidebar-actions">
            <button
              type="button"
              className="icon-button"
              onClick={props.onCreateBook}
              title="Crea un libro nuevo y abre el procesador de texto."
            >
              <BookPlus size={16} />
              <span>Nuevo libro</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={props.onOpenBook}
              title="Abre una carpeta de libro existente."
            >
              <FolderOpen size={16} />
              <span>Abrir libro</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={props.onCloseBook}
              disabled={!props.hasBook}
              title="Cierra el libro activo sin salir de la app."
            >
              <BookX size={16} />
              <span>Cerrar libro</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={props.onShowSettings}
              title="Abre la configuracion persistente del modelo, prompt y opciones."
            >
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
              title="Vista principal para escribir y editar."
            >
              <FileText size={16} />
              <span>Editor</span>
            </button>
            <button
              className={`icon-button ${props.currentView === 'outline' ? 'is-active' : ''}`}
              type="button"
              onClick={props.onShowOutline}
              disabled={!props.hasBook}
              title="Muestra todos los capitulos con su resumen."
            >
              <ListTree size={16} />
              <span>Vista general</span>
            </button>
            <button
              className={`icon-button ${props.currentView === 'cover' ? 'is-active' : ''}`}
              type="button"
              onClick={props.onShowCover}
              disabled={!props.hasBook}
              title="Gestiona portada, contraportada y texto del lomo."
            >
              <BookImage size={16} />
              <span>Portada</span>
            </button>
            <button
              className={`icon-button ${props.currentView === 'foundation' ? 'is-active' : ''}`}
              type="button"
              onClick={props.onShowFoundation}
              disabled={!props.hasBook}
              title="Define base narrativa: idea central, voz y reglas de estilo."
            >
              <Database size={16} />
              <span>Base</span>
            </button>
            <button
              className={`icon-button ${props.currentView === 'amazon' ? 'is-active' : ''}`}
              type="button"
              onClick={props.onShowAmazon}
              disabled={!props.hasBook}
              title="Completa metadatos y presets para publicar en Amazon."
            >
              <ShoppingCart size={16} />
              <span>Amazon</span>
            </button>
          </div>
        </div>
      </details>

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
