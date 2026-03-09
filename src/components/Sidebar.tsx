import { memo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { ChapterDocument, LibraryBookEntry, LibrarySagaEntry } from '../types/book';
import logoImage from '../assets/wwme-logo-2.0.png';
import ContextTip from './ContextTip';

const compactFormatter = new Intl.NumberFormat('es-AR');

interface SidebarProps {
  hasBook: boolean;
  hasSaga: boolean;
  activeBookPath: string | null;
  activeSagaPath: string | null;
  bookTitle: string;
  chapters: ChapterDocument[];
  libraryBooks: LibraryBookEntry[];
  librarySagas: LibrarySagaEntry[];
  libraryExpanded: boolean;
  activeChapterId: string | null;
  onToggleLibrary: () => void;
  onCreateSaga: () => void;
  onOpenLibraryBook: (bookPath: string) => void;
  onOpenLibraryBookChat: (bookPath: string) => void;
  onOpenLibraryBookAmazon: (bookPath: string) => void;
  onOpenLibrarySaga: (sagaPath: string) => void;
  onAttachActiveBookToSaga: (sagaPath: string) => void;
  onDeleteLibrarySaga: (sagaPath: string) => void;
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
  onExportBookDocx: () => void;
  onExportBookPdf: () => void;
  onExportBookEpub: () => void;
  onExportAudiobook: () => void;
  onExportCartographerPack: () => void;
  onExportEditorPack: () => void;
  onExportLayoutPack: () => void;
  onExportConsultantPack: () => void;
  onExportHistorianPack: () => void;
  onExportTimelineInteractive: () => void;
  onExportAllRolePacks: () => void;
  onExportSagaBible: () => void;
  onOpenEditorialChecklist: () => void;
  onExportCollaborationPatch: () => void;
  onImportCollaborationPatch: () => void;
}

function formatCount(value: number): string {
  return compactFormatter.format(value);
}

function Sidebar(props: SidebarProps) {
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const statusLabel: Record<LibraryBookEntry['status'], string> = {
    recien_creado: 'Recien creado',
    avanzado: 'Avanzado',
    publicado: 'Publicado',
  };

  const publishedCount = props.libraryBooks.filter((entry) => entry.status === 'publicado').length;
  const draftCount = props.libraryBooks.length - publishedCount;
  const activeSagaTitle = props.activeSagaPath
    ? props.librarySagas.find((entry) => entry.path === props.activeSagaPath)?.title ?? 'Saga activa'
    : null;

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

  const handleSagaItemKeyDown = (event: KeyboardEvent<HTMLElement>, sagaPath: string): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      props.onOpenLibrarySaga(sagaPath);
    }
  };

  const getSagaTitleForBook = (entry: LibraryBookEntry): string | null => {
    if (!entry.sagaPath) {
      return null;
    }

    const saga = props.librarySagas.find((item) => item.path === entry.sagaPath);
    return saga?.title ?? 'Saga vinculada';
  };

  return (
    <aside className="left-sidebar">
      <header className="sidebar-header sidebar-card">
        <section className="sidebar-identity-card" aria-label="Identidad visual de WriteWMe">
          <div className="sidebar-logo-showcase sidebar-logo-showcase-top">
            {logoLoadFailed ? (
              <p aria-hidden="true">WriteWMe</p>
            ) : (
              <img
                src={logoImage}
                alt="Logo WriteWMe"
                onError={() => {
                  setLogoLoadFailed(true);
                }}
              />
            )}
          </div>
          <div className="sidebar-identity-copy">
            <span className="section-kicker">Archivo de las eras</span>
            <p className="sidebar-active-book">{props.hasBook ? props.bookTitle : 'Sin libro abierto'}</p>
            <p className="sidebar-active-context">
              {activeSagaTitle
                ? `Saga activa: ${activeSagaTitle}`
                : props.hasBook
                  ? `${formatCount(props.chapters.length)} capitulos en mesa de trabajo.`
                  : 'Abre un libro o crea una saga para comenzar.'}
            </p>
          </div>
        </section>

        <div className="sidebar-ledger" aria-label="Resumen del archivo activo">
          <article className="sidebar-ledger-item">
            <strong>{formatCount(props.libraryBooks.length)}</strong>
            <span>Libros</span>
          </article>
          <article className="sidebar-ledger-item">
            <strong>{formatCount(props.librarySagas.length)}</strong>
            <span>Sagas</span>
          </article>
          <article className="sidebar-ledger-item">
            <strong>{formatCount(props.chapters.length)}</strong>
            <span>Capitulos</span>
          </article>
        </div>
      </header>

      <section className="library-section sidebar-card">
        <div className="section-title-row">
          <div className="section-heading">
            <span className="section-kicker">Archivo</span>
            <h2>
              Biblioteca <ContextTip text="Gestiona libros: abrir, publicar, eliminar y estado de avance." />
            </h2>
            <p>{`${formatCount(publishedCount)} publicados · ${formatCount(draftCount)} en trabajo`}</p>
          </div>
          <button
            type="button"
            className="section-action-button"
            onClick={props.onToggleLibrary}
            title="Expandir o contraer la lista de libros."
            aria-label={props.libraryExpanded ? 'Contraer biblioteca' : 'Expandir biblioteca'}
          >
            {props.libraryExpanded ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {props.libraryExpanded ? (
          <div className="library-list">
            {props.libraryBooks.length === 0 ? <p className="muted library-empty">Sin libros registrados.</p> : null}
            {props.libraryBooks.map((entry) => (
              <article
                key={entry.id}
                className={`library-item library-item-book ${props.activeBookPath === entry.path ? 'is-active' : ''}`}
                data-status={entry.status}
                onClick={() => props.onOpenLibraryBook(entry.path)}
                onKeyDown={(event) => handleLibraryItemKeyDown(event, entry.path)}
                role="button"
                tabIndex={0}
                aria-label={`Abrir libro ${entry.title}`}
              >
                <span className="library-spine" aria-hidden="true" />
                <div className="library-body">
                  <div className="library-head">
                    <div className="library-title-block">
                      <h3>{entry.title}</h3>
                      <p className="library-author">{entry.author || 'Autor sin definir'}</p>
                    </div>
                    <span className={`status-pill status-${entry.status}`}>{statusLabel[entry.status]}</span>
                  </div>
                  <div className="library-meta">
                    <span>{`${formatCount(entry.chapterCount)} caps`}</span>
                    <span>{`${formatCount(entry.wordCount)} palabras`}</span>
                  </div>
                  <p className={`library-lineage ${entry.sagaPath ? '' : 'is-muted'}`}>
                    {entry.sagaPath
                      ? `${getSagaTitleForBook(entry)}${entry.sagaVolume ? ` · Vol. ${entry.sagaVolume}` : ''}`
                      : 'Volumen independiente'}
                  </p>
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
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="library-section sidebar-card">
        <div className="section-title-row">
          <div className="section-heading">
            <span className="section-kicker">Mundo</span>
            <h2>
              Sagas <ContextTip text="Mundos y biblias extendidas que agrupan varios libros." />
            </h2>
            <p>{`${formatCount(props.librarySagas.length)} mundos enlazados en el archivo.`}</p>
          </div>
          <button type="button" className="section-action-button" onClick={props.onCreateSaga} title="Crear una saga nueva.">
            Nueva saga
          </button>
        </div>
        {props.libraryExpanded ? (
          <div className="library-list">
            {props.librarySagas.length === 0 ? <p className="muted library-empty">Sin sagas registradas.</p> : null}
            {props.librarySagas.map((entry) => (
              <article
                key={entry.id}
                className={`library-item library-item-saga ${props.activeSagaPath === entry.path ? 'is-active' : ''}`}
                onClick={() => props.onOpenLibrarySaga(entry.path)}
                onKeyDown={(event) => handleSagaItemKeyDown(event, entry.path)}
                role="button"
                tabIndex={0}
                aria-label={`Abrir saga ${entry.title}`}
              >
                <span className="library-spine" aria-hidden="true" />
                <div className="library-body">
                  <div className="library-head">
                    <div className="library-title-block">
                      <h3>{entry.title}</h3>
                      <p className="library-author">Puente de mando de saga</p>
                    </div>
                    <span className="status-pill">{`${formatCount(entry.bookCount)} libros`}</span>
                  </div>
                  <p className="library-description">{entry.description || 'Sin descripcion todavia.'}</p>
                  <div className="library-meta">
                    <span>{`${formatCount(entry.bookCount)} volumenes`}</span>
                    <span>{props.activeSagaPath === entry.path ? 'Activa ahora' : 'Archivo de mundo'}</span>
                  </div>
                  <div className="library-actions library-actions-compact">
                    <button
                      type="button"
                      title="Abrir esta saga."
                      onClick={(event) => runLibraryAction(event, () => props.onOpenLibrarySaga(entry.path))}
                    >
                      Abrir
                    </button>
                    <details className="library-options-menu" onClick={stopLibraryTogglePropagation}>
                      <summary onClick={stopLibraryTogglePropagation} title="Ver acciones de esta saga.">
                        Opciones
                      </summary>
                      <div className="library-options-dropdown">
                        <button
                          type="button"
                          title="Vincula el libro activo a esta saga."
                          onClick={(event) => runLibraryAction(event, () => props.onAttachActiveBookToSaga(entry.path))}
                          disabled={!props.hasBook}
                        >
                          Vincular libro activo
                        </button>
                        <button
                          type="button"
                          title="Eliminar esta saga de la biblioteca y del disco."
                          onClick={(event) => runLibraryAction(event, () => props.onDeleteLibrarySaga(entry.path))}
                        >
                          Eliminar
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="chapter-section sidebar-card">
        <div className="section-title-row">
          <div className="section-heading">
            <span className="section-kicker">Manuscrito</span>
            <h2>
              Capitulos <ContextTip text="Estructura narrativa: crea, reordena, duplica y elimina." />
            </h2>
            <p>
              {props.hasBook
                ? `${formatCount(props.chapters.length)} piezas activas en el manuscrito.`
                : 'Abre un libro para estructurar el manuscrito.'}
            </p>
          </div>
          <button
            type="button"
            className="section-action-button"
            onClick={props.onCreateChapter}
            disabled={!props.hasBook}
            title="Crea un nuevo capitulo en el libro."
            aria-label="Crear nuevo capitulo"
          >
            Nuevo
          </button>
        </div>

        <div className="chapter-list">
          {props.chapters.map((chapter) => (
            <article key={chapter.id} className={`chapter-item ${props.activeChapterId === chapter.id ? 'is-active' : ''}`}>
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
                  onClick={() => {
                    if (globalThis.confirm(`¿Eliminar el capitulo "${chapter.title}"? Esta accion no se puede deshacer.`)) {
                      props.onDeleteChapter(chapter.id);
                    }
                  }}
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

      <details className="sidebar-collapsible sidebar-card">
        <summary>
          Exportar <ContextTip text="Genera salidas editoriales, Amazon y colaboracion offline." />
        </summary>
        <div className="collapsible-body export-section">
          <button
            type="button"
            onClick={props.onOpenEditorialChecklist}
            disabled={!props.hasBook}
            title="Revisa bloqueos editoriales antes de exportar o publicar."
          >
            Checklist editorial
          </button>
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
          <button type="button" onClick={props.onExportBookDocx} disabled={!props.hasBook} title="Genera manuscrito editorial en formato DOCX.">
            Libro DOCX editorial
          </button>
          <button type="button" onClick={props.onExportBookPdf} disabled={!props.hasBook} title="Genera manuscrito editorial en formato PDF con perfil reproducible.">
            Libro PDF editorial
          </button>
          <button type="button" onClick={props.onExportBookEpub} disabled={!props.hasBook} title="Genera eBook en formato EPUB.">
            Libro EPUB editorial
          </button>
          <button
            type="button"
            onClick={props.onExportAudiobook}
            disabled={!props.hasBook}
            title="Genera audiolibro WAV con la voz del sistema en el idioma configurado."
          >
            Audiolibro WAV
          </button>
          <button
            type="button"
            onClick={props.onExportCartographerPack}
            disabled={!props.hasSaga}
            title="Exporta atlas, pines, capas y rutas en un pack dedicado para cartografia."
          >
            Pack cartografo
          </button>
          <button
            type="button"
            onClick={props.onExportEditorPack}
            disabled={!props.hasBook}
            title="Exporta manuscrito y contexto narrativo para revision editorial."
          >
            Pack editor
          </button>
          <button
            type="button"
            onClick={props.onExportLayoutPack}
            disabled={!props.hasBook}
            title="Exporta hoja de estilos interior, muestra y metricas para maquetacion."
          >
            Pack maquetacion
          </button>
          <button
            type="button"
            onClick={props.onExportConsultantPack}
            disabled={!props.hasBook}
            title="Exporta manuscrito + contexto canonicamente relevante para consultoria analitica."
          >
            Pack consultoria
          </button>
          <button
            type="button"
            onClick={props.onExportHistorianPack}
            disabled={!props.hasSaga}
            title="Exporta cronologia, secretos y carriles para revisiones historicas."
          >
            Pack cronologia
          </button>
          <button
            type="button"
            onClick={props.onExportTimelineInteractive}
            disabled={!props.hasSaga}
            title="Genera una timeline HTML readonly tipo Gantt para compartir con edicion."
          >
            Timeline interactiva
          </button>
          <button
            type="button"
            onClick={props.onExportAllRolePacks}
            disabled={!props.hasBook && !props.hasSaga}
            title="Genera en lote los packs por rol disponibles segun el contexto abierto."
          >
            Lote packs por rol
          </button>
          <button
            type="button"
            onClick={props.onExportSagaBible}
            disabled={!props.hasSaga}
            title="Compila una biblia de saga en HTML imprimible, util para revision o PDF."
          >
            Biblia de saga
          </button>
          <button
            type="button"
            onClick={props.onExportCollaborationPatch}
            disabled={!props.hasBook}
            title="Exporta un paquete de edicion JSON para enviar a un coautor."
          >
            Exportar paquete de edicion
          </button>
          <button
            type="button"
            onClick={props.onImportCollaborationPatch}
            disabled={!props.hasBook}
            title="Importa un paquete de edicion y aplica cambios al libro."
          >
            Importar paquete de edicion
          </button>
        </div>
      </details>
    </aside>
  );
}

export default memo(Sidebar);
