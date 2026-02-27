import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MainView } from '../types/book';
import './OnboardingPanel.css';

interface OnboardingPanelProps {
  isOpen: boolean;
  hasBook: boolean;
  hasChapters: boolean;
  hasFoundation: boolean;
  hasStoryBible: boolean;
  hasCover: boolean;
  hasAmazonCore: boolean;
  onClose: () => void;
  onDismissForever: () => void;
  onCreateBook: () => void;
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
    actionLabel: 'Abrir Biblia',
    actionView: 'bible',
  },
];

function OnboardingPanel(props: OnboardingPanelProps) {
  const {
    isOpen,
    hasBook,
    hasChapters,
    hasFoundation,
    hasStoryBible,
    hasCover,
    hasAmazonCore,
    onClose,
    onDismissForever,
    onCreateBook,
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
        id: 'chapter',
        label: 'Primer capitulo creado',
        done: hasChapters,
      },
      {
        id: 'foundation',
        label: 'Base narrativa completada',
        done: hasFoundation,
      },
      {
        id: 'bible',
        label: 'Biblia de historia cargada',
        done: hasStoryBible,
      },
      {
        id: 'cover',
        label: 'Portada o contraportada cargada',
        done: hasCover,
      },
      {
        id: 'amazon',
        label: 'Amazon minimo listo (titulo, autor, descripcion, categoria, keyword)',
        done: hasAmazonCore,
      },
    ],
    [hasAmazonCore, hasBook, hasChapters, hasCover, hasFoundation, hasStoryBible],
  );

  const completedSteps = checklist.filter((item) => item.done).length;
  const progress = Math.round((completedSteps / checklist.length) * 100);
  const currentStep = TOUR_STEPS[Math.max(0, Math.min(tourIndex, TOUR_STEPS.length - 1))];

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
          <h2 id={titleId}>Recorrido inicial WriteWMe</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Cerrar onboarding">
            X
          </button>
        </header>

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
            <h3>Checklist "Tu primer libro"</h3>
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
                onClick={() => {
                  onClose();
                  onCreateBook();
                }}
              >
                Nuevo libro
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
        </div>

        <footer className="onboarding-footer">
          <button type="button" onClick={onDismissForever}>
            No mostrar otra vez
          </button>
          <button type="button" onClick={onClose}>
            Cerrar guia
          </button>
        </footer>
      </section>
    </div>
  );
}

export default OnboardingPanel;
