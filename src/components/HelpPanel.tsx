import { useEffect, useId, useRef } from 'react';
import './HelpPanel.css';

interface HelpPanelProps {
  isOpen: boolean;
  focusMode: boolean;
  onClose: () => void;
  onCreateBook: () => void;
  onOpenBook: () => void;
  onToggleFocusMode: () => void;
}

function HelpPanel(props: HelpPanelProps) {
  const { isOpen, focusMode, onClose, onCreateBook, onOpenBook, onToggleFocusMode } = props;
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleCreateBook = () => {
    onClose();
    onCreateBook();
  };

  const handleOpenBook = () => {
    onClose();
    onOpenBook();
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') {
      return;
    }

    const container = dialogRef.current;
    if (!container) {
      return;
    }

    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );

    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="help-overlay" onClick={onClose}>
      <section
        ref={dialogRef}
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="help-header">
          <h2 id={titleId}>Ayuda rapida WriteWMe</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Cerrar ayuda">
            X
          </button>
        </header>

        <div className="help-grid">
          <article>
            <h3>Zonas de la app</h3>
            <ul>
              <li>Izquierda: biblioteca, capitulos, vistas y exportaciones.</li>
              <li>Centro: editor principal (TipTap) y contenido del capitulo activo.</li>
              <li>Derecha: chat IA, acciones rapidas y devoluciones.</li>
            </ul>
          </article>

          <article>
            <h3>Botones clave</h3>
            <ul>
              <li>Nuevo libro: crea carpeta estructurada y abre el procesador.</li>
              <li>Abrir libro: carga una carpeta valida con `book.json`.</li>
              <li>Capitulos (+): crea, renombra, duplica y reordena.</li>
              <li>Undo snapshot: vuelve a la version anterior del capitulo.</li>
              <li>Acciones IA: reescribe o mejora seleccion/capitulo.</li>
            </ul>
          </article>

          <article>
            <h3>Atajos</h3>
            <ul>
              <li>`Ctrl + F`: abrir busqueda global del libro.</li>
              <li>`Ctrl + Shift + H`: abrir/cerrar esta ayuda.</li>
              <li>`Ctrl + Shift + F`: activar/desactivar modo foco.</li>
              <li>`Ctrl + S`: guardado manual inmediato.</li>
              <li>`Ctrl + Shift + N`: crear capitulo nuevo.</li>
              <li>`Alt + Flecha arriba/abajo`: mover capitulo activo.</li>
            </ul>
          </article>

          <article>
            <h3>Pasos para crear un libro</h3>
            <ol>
              <li>Haz clic en `Nuevo libro` y completa titulo y autor.</li>
              <li>Elige la carpeta padre donde guardar el proyecto.</li>
              <li>Se crea la estructura (`book.json`, `chapters`, `assets`, `versions`).</li>
              <li>Se abre directo el editor y puedes escribir el capitulo 1.</li>
              <li>Usa IA para reescribir y snapshots para deshacer.</li>
            </ol>
          </article>
        </div>

        <footer className="help-actions">
          <button type="button" onClick={handleCreateBook} title="Inicia un libro nuevo desde este panel.">
            Nuevo libro
          </button>
          <button type="button" onClick={handleOpenBook} title="Abre una carpeta de libro ya creada.">
            Abrir libro
          </button>
          <button
            type="button"
            onClick={onToggleFocusMode}
            title="Oculta paneles laterales para concentrarte solo en el texto."
          >
            {focusMode ? 'Salir modo foco' : 'Activar modo foco'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default HelpPanel;
