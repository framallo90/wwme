import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MainView } from '../types/book';
import './OnboardingPanel.css';

interface OnboardingPanelProps {
  isOpen: boolean;
  expertMode: boolean;
  backupGuardMode: 'strict' | 'explore';
  hasBook: boolean;
  hasBackupConfigured: boolean;
  hasChapters: boolean;
  hasWritingStarted: boolean;
  hasFoundation: boolean;
  hasStoryBible: boolean;
  onClose: () => void;
  onDismissForever: () => void;
  onBackupGuardModeChange: (mode: 'strict' | 'explore') => void;
  onConfigureBackup: () => void;
  onCreateBook: () => void;
  onCreateSagaTemplateBook: () => void;
  onOpenBook: () => void;
  onGoToView: (view: MainView) => void;
}

interface TourStep {
  title: string;
  description: string;
  tips: string[];
  actionLabel: string;
  actionView: MainView | null;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '1) Columna izquierda',
    description: 'Aqui manejas biblioteca, capitulos y exportaciones.',
    tips: [
      'Biblioteca: abre o cambia de libro rapido.',
      'Capitulos: crear, reordenar, duplicar, eliminar.',
      'Exportar: salida a Markdown, DOCX, EPUB y pack Amazon.',
    ],
    actionLabel: 'Ir a General',
    actionView: 'outline',
  },
  {
    title: '2) Zona central',
    description: 'Es el espacio principal para escribir y revisar.',
    tips: [
      'Editor para escritura diaria.',
      'Diff para comparar versiones.',
      'Preview para revisar maquetado final.',
    ],
    actionLabel: 'Ir a Editor',
    actionView: 'editor',
  },
  {
    title: '3) Columna derecha (IA)',
    description: 'Usa IA con contexto de tu libro para destrabar o pulir.',
    tips: [
      'Acciones rapidas para cambios concretos.',
      'Chat por capitulo o libro completo.',
      'Deshacer/Rehacer IA mediante snapshots.',
    ],
    actionLabel: 'Ir al Editor',
    actionView: 'editor',
  },
];

function OnboardingPanel(props: OnboardingPanelProps) {
  const {
    isOpen,
    expertMode,
    backupGuardMode,
    hasBook,
    hasBackupConfigured,
    hasChapters,
    hasWritingStarted,
    hasFoundation,
    hasStoryBible,
    onClose,
    onDismissForever,
    onBackupGuardModeChange,
    onConfigureBackup,
    onCreateBook,
    onCreateSagaTemplateBook,
    onOpenBook,
    onGoToView,
  } = props;
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [tourIndex, setTourIndex] = useState(0);

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

  const checklist = useMemo(
    () => [
      {
        id: 'book',
        label: 'Libro abierto',
        done: hasBook,
      },
      {
        id: 'backup',
        label: 'Backup configurado (carpeta de resguardo)',
        done: hasBackupConfigured,
      },
      {
        id: 'chapter',
        label: 'Primer capitulo creado',
        done: hasChapters,
      },
      {
        id: 'writing',
        label: 'Primeras palabras en el manuscrito',
        done: hasWritingStarted,
      },
      {
        id: 'foundation',
        label: 'Base narrativa minima definida',
        done: hasFoundation,
      },
      {
        id: 'bible',
        label: 'Canon minimo cargado en Biblia o Saga',
        done: hasStoryBible,
      },
    ],
    [hasBackupConfigured, hasBook, hasChapters, hasFoundation, hasStoryBible, hasWritingStarted],
  );

  const completedSteps = checklist.filter((item) => item.done).length;
  const progress = Math.round((completedSteps / checklist.length) * 100);
  const currentStep = TOUR_STEPS[Math.max(0, Math.min(tourIndex, TOUR_STEPS.length - 1))];
  const backupGateActive = backupGuardMode === 'strict' && !hasBackupConfigured;

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
    <div className="onboarding-overlay" onClick={onClose}>
      <section
        ref={dialogRef}
        className="onboarding-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="onboarding-header">
          <h2 id={titleId}>{expertMode ? 'Inicio rapido profesional' : 'Recorrido inicial WriteWMe'}</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Cerrar onboarding">
            X
          </button>
        </header>

        <p>
          {expertMode
            ? 'Modo escritor experto activo: este panel funciona como puesta a punto rapida y no se abre automaticamente.'
            : 'Esta guia se abre una sola vez en un arranque nuevo. Despues queda disponible desde '}
          {expertMode ? null : <strong>Guia inicial</strong>}
          {expertMode ? null : ' cuando la necesites.'}
        </p>

        <section className="onboarding-progress" aria-live="polite">
          <p>
            Modo de respaldo: <strong>{backupGuardMode === 'strict' ? 'Seguro (recomendado)' : 'Exploracion'}</strong>
          </p>
          <div className="onboarding-actions">
            <button
              type="button"
              className={backupGuardMode === 'strict' ? 'is-active' : ''}
              onClick={() => onBackupGuardModeChange('strict')}
            >
              Seguro
            </button>
            <button
              type="button"
              className={backupGuardMode === 'explore' ? 'is-active' : ''}
              onClick={() => onBackupGuardModeChange('explore')}
            >
              Exploracion
            </button>
          </div>
          <p className="muted">
            {backupGuardMode === 'strict'
              ? 'En modo seguro, no permite continuar sin carpeta de backup.'
              : 'En exploracion puedes escribir sin backup, pero con aviso visible de riesgo.'}
          </p>
        </section>

        <section className="onboarding-progress" aria-live="polite">
          <p>
            Progreso de arranque: <strong>{completedSteps}/{checklist.length}</strong> ({progress}%)
          </p>
          <div className="onboarding-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>

        <div className="onboarding-grid">
          <article className="onboarding-card">
            <h3>{expertMode ? 'Arranque profesional' : 'Checklist "Primer arranque"'}</h3>
            <ul className="onboarding-checklist">
              {checklist.map((item) => (
                <li key={item.id}>
                  <label>
                    <input type="checkbox" checked={item.done} readOnly />
                    <span>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="onboarding-actions">
              <button
                type="button"
                onClick={onConfigureBackup}
              >
                Configurar backup
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateBook();
                }}
              >
                Libro limpio
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateSagaTemplateBook();
                }}
              >
                Plantilla de saga
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBook();
                }}
              >
                Abrir libro
              </button>
            </div>
          </article>

          {expertMode ? (
            <article className="onboarding-card">
              <h3>Puesta a punto de saga</h3>
              <ul>
                <li>Abre `Fundamentos` para fijar promesa, tono y reglas de la serie.</li>
                <li>Abre `Biblia` o `Saga` para cargar canon, atlas y cronologia antes de escribir.</li>
                <li>Salta al `Editor` cuando ya tengas estructura minima y capitulo activo.</li>
              </ul>
              <div className="onboarding-actions">
                <button type="button" onClick={() => onGoToView('foundation')}>
                  Fundamentos
                </button>
                <button type="button" onClick={() => onGoToView('bible')}>
                  Biblia
                </button>
                <button type="button" onClick={() => onGoToView('editor')}>
                  Editor
                </button>
              </div>
            </article>
          ) : (
            <article className="onboarding-card">
              <h3>Tour de interfaz</h3>
              <p className="onboarding-step-title">{currentStep.title}</p>
              <p>{currentStep.description}</p>
              <ul>
                {currentStep.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
              <div className="onboarding-actions">
                <button type="button" onClick={() => setTourIndex((value) => Math.max(0, value - 1))} disabled={tourIndex === 0}>
                  Paso anterior
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep.actionView) {
                      onGoToView(currentStep.actionView);
                    }
                    onClose();
                  }}
                >
                  {currentStep.actionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setTourIndex((value) => Math.min(TOUR_STEPS.length - 1, value + 1))}
                  disabled={tourIndex >= TOUR_STEPS.length - 1}
                >
                  Siguiente paso
                </button>
              </div>
            </article>
          )}
        </div>

        <footer className="onboarding-footer">
          <button
            type="button"
            onClick={onDismissForever}
            disabled={backupGateActive}
            title={backupGateActive ? 'Primero configura backup para desactivar el auto-onboarding.' : undefined}
          >
            No volver a abrir automaticamente
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={backupGateActive}
            title={backupGateActive ? 'Primero configura backup para continuar.' : undefined}
          >
            Lo veo luego
          </button>
        </footer>
      </section>
    </div>
  );
}

export default OnboardingPanel;
