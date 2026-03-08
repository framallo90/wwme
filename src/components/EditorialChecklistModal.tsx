import { useState } from 'react';
import type { EditorialChecklistReport } from '../lib/editorialChecklist';
import type { EditorialChecklistCustomItem } from '../types/book';
import './EditorialChecklistModal.css';

interface EditorialChecklistModalProps {
  isOpen: boolean;
  report: EditorialChecklistReport | null;
  customItems: EditorialChecklistCustomItem[];
  intentLabel: string;
  allowProceed: boolean;
  onClose: () => void;
  onProceed: () => void;
  onAddCustomItem: (input: { title: string; description: string; level: 'error' | 'warning' }) => void;
  onToggleCustomItem: (id: string) => void;
  onDeleteCustomItem: (id: string) => void;
}

function EditorialChecklistModal(props: EditorialChecklistModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<'error' | 'warning'>('warning');

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

        <div className="editorial-custom-builder">
          <h3>Checklist propia</h3>
          <p className="muted">Agrega controles de revision que formen parte de tu metodo personal.</p>
          <div className="editorial-custom-form">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: revisar dialogos del antagonista" />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Detalle o criterio para marcarlo como resuelto"
            />
            <select value={level} onChange={(event) => setLevel(event.target.value as 'error' | 'warning')}>
              <option value="warning">Warning si falta</option>
              <option value="error">Error si falta</option>
            </select>
            <button
              type="button"
              onClick={() => {
                if (!title.trim()) {
                  return;
                }

                props.onAddCustomItem({ title, description, level });
                setTitle('');
                setDescription('');
                setLevel('warning');
              }}
            >
              Agregar item
            </button>
          </div>
          <div className="editorial-custom-list">
            {props.customItems.length === 0 ? (
              <p className="muted">Sin items personalizados todavia.</p>
            ) : (
              props.customItems.map((item) => (
                <article key={item.id} className={`editorial-custom-item ${item.checked ? 'is-done' : ''}`}>
                  <label>
                    <input type="checkbox" checked={item.checked} onChange={() => props.onToggleCustomItem(item.id)} />
                    <span>
                      <strong>{item.title}</strong>
                      {item.description ? <small>{item.description}</small> : null}
                    </span>
                  </label>
                  <div className="editorial-custom-actions">
                    <span className={`status-pill status-${item.level === 'error' ? 'publicado' : 'avanzado'}`}>
                      {item.level}
                    </span>
                    <button type="button" onClick={() => props.onDeleteCustomItem(item.id)}>
                      Quitar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

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
