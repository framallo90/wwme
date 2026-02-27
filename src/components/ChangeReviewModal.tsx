import { useEffect, useMemo, useRef } from 'react';
import { diffTextBlocks, summarizeDiffOperations } from '../lib/diff';
import './ChangeReviewModal.css';

interface ChangeReviewModalProps {
  isOpen: boolean;
  title: string;
  subtitle: string;
  beforeText: string;
  afterText: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ChangeReviewModal(props: ChangeReviewModalProps) {
  const { isOpen, title, subtitle, beforeText, afterText, confirmLabel, cancelLabel, onConfirm, onCancel } = props;
  const dialogRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const operations = useMemo(() => diffTextBlocks(beforeText, afterText), [beforeText, afterText]);
  const summary = useMemo(() => summarizeDiffOperations(operations), [operations]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    confirmButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

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
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    <div className="change-review-overlay" onClick={onCancel}>
      <section
        ref={dialogRef}
        className="change-review-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="change-review-header">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </header>

        <p className="change-review-summary">
          Bloques sin cambios: {summary.equalCount} | agregados: {summary.insertCount} | eliminados: {summary.deleteCount}
        </p>

        <div className="change-review-diff">
          {operations.length === 0 ? (
            <p className="muted">No se detectaron diferencias sustanciales.</p>
          ) : (
            operations.map((operation, index) => (
              <article key={`${operation.type}-${index}`} className={`change-review-block diff-${operation.type}`}>
                <header>
                  {operation.type === 'insert' ? '+' : operation.type === 'delete' ? '-' : '='}
                </header>
                <p>{operation.value || ' '}</p>
              </article>
            ))
          )}
        </div>

        <footer className="change-review-actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel ?? 'Cancelar'}
          </button>
          <button ref={confirmButtonRef} type="button" onClick={onConfirm}>
            {confirmLabel ?? 'Aplicar cambios'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default ChangeReviewModal;
