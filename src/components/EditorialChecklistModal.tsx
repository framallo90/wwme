import type { EditorialChecklistReport } from '../lib/editorialChecklist';
import './EditorialChecklistModal.css';

interface EditorialChecklistModalProps {
  isOpen: boolean;
  report: EditorialChecklistReport | null;
  intentLabel: string;
  allowProceed: boolean;
  onClose: () => void;
  onProceed: () => void;
}

function EditorialChecklistModal(props: EditorialChecklistModalProps) {
  if (!props.isOpen || !props.report) {
    return null;
  }

  const { report } = props;

  return (
    <div className="editorial-overlay" onClick={props.onClose}>
      <section
        className="editorial-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Checklist editorial"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="editorial-header">
          <h2>Checklist editorial</h2>
          <p>
            Puntaje: <strong>{report.score}/100</strong> | Errores: {report.errors.length} | Warnings:{' '}
            {report.warnings.length}
          </p>
          <p className={report.isReady ? 'editorial-ok' : 'editorial-blocked'}>
            {report.isReady ? 'Listo para continuar.' : 'Hay bloqueos que debes resolver antes de continuar.'}
          </p>
        </header>

        <div className="editorial-issues">
          {report.issues.length === 0 ? (
            <p className="muted">Sin observaciones. Flujo editorial limpio.</p>
          ) : (
            report.issues.map((issue) => (
              <article key={`${issue.id}-${issue.message}`} className={`editorial-issue issue-${issue.level}`}>
                <h3>{issue.title}</h3>
                <p>{issue.message}</p>
              </article>
            ))
          )}
        </div>

        <footer className="editorial-actions">
          <button type="button" onClick={props.onClose}>
            Cerrar
          </button>
          <button type="button" onClick={props.onProceed} disabled={!props.allowProceed}>
            {props.allowProceed ? props.intentLabel : 'Bloqueado por errores'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default EditorialChecklistModal;
