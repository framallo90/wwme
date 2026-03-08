import { useEffect, useId, useRef } from 'react';

import type { MainView } from '../types/book';
import './HelpPanel.css';

interface HelpPanelProps {
  isOpen: boolean;
  hasBook: boolean;
  hasSaga: boolean;
  focusMode: boolean;
  onClose: () => void;
  onCreateBook: () => void;
  onOpenBook: () => void;
  onOpenStarterGuide: () => void;
  onGoToView: (view: MainView) => void;
  onToggleFocusMode: () => void;
}

interface GuideStep {
  title: string;
  reason: string;
  actions: string[];
  check: string;
}

interface FunctionGuide {
  name: string;
  purpose: string;
  bestMoment: string;
  howToUse: string[];
}

interface QuickAction {
  title: string;
  description: string;
  buttonLabel: string;
  disabled?: boolean;
  onRun: () => void;
}

const QUICK_START_STEPS: GuideStep[] = [
  {
    title: '1) Abri un manuscrito',
    reason: 'Todo el flujo arranca cuando WriteWMe sabe en que libro estas trabajando.',
    actions: [
      'Usa `Nuevo libro` para empezar desde cero o `Abrir libro` para retomar uno existente.',
      'Mira la banda superior: ahi debe aparecer el titulo del libro activo.',
      'Si es una saga, luego podras vincular el libro al mundo compartido.',
    ],
    check: 'Debes ver el titulo del libro y la lista de capitulos activa.',
  },
  {
    title: '2) Escribi primero, ordena despues',
    reason: 'La herramienta tiene estructura potente, pero no hace falta completarla toda antes de escribir.',
    actions: [
      'Crea un primer capitulo y vuelca un borrador corto.',
      'Si te llegan ideas fuera de lugar, mandalas a `Recortes`.',
      'Usa `Hilos` para preguntas o promesas narrativas que no quieras perder.',
    ],
    check: 'Debes tener texto en el editor o una nota guardada en `Recortes`.',
  },
  {
    title: '3) Fija tu canon minimo',
    reason: 'La IA y los chequeos mejoran mucho cuando conocen personajes, lugares y reglas.',
    actions: [
      'Completa `Base` con promesa, voz y reglas del proyecto.',
      'Carga personajes y lugares en `Biblia`.',
      'Si escribes saga, usa `Saga` para reglas globales y reglas fijadas para IA.',
    ],
    check: 'En `Biblia` o `Saga` deben verse fichas reales, no solo campos vacios.',
  },
  {
    title: '4) Revisa sin perder el pulso',
    reason: 'Las reescrituras fuertes deben sentirse como revision editorial, no como riesgo tecnico.',
    actions: [
      'Antes de un cambio grande, guarda un `Hito`.',
      'Usa `Cambios` para comparar versiones clave.',
      'Si el resultado no sirve, usa `Deshacer IA` o vuelve a un hito.',
    ],
    check: 'Debes poder nombrar al menos una version importante de tu proceso.',
  },
];

const MAIN_VIEWS_GUIDE: FunctionGuide[] = [
  {
    name: 'Editor',
    purpose: 'Escribir el capitulo activo sin salir del flujo.',
    bestMoment: 'Trabajo diario de manuscrito.',
    howToUse: [
      'Selecciona un capitulo desde la izquierda.',
      'Escribe normal; el guardado continuo hace el resto.',
      'Usa `Modo foco` cuando quieras ver solo texto.',
    ],
  },
  {
    name: 'General',
    purpose: 'Revisar la estructura completa del libro.',
    bestMoment: 'Inicio de sesion y revision de orden.',
    howToUse: [
      'Mira la secuencia completa de capitulos.',
      'Entra a cualquier capitulo con un clic.',
      'Usa esta vista para detectar huecos o redundancias.',
    ],
  },
  {
    name: 'Cambios',
    purpose: 'Comparar versiones y puntos de restauracion.',
    bestMoment: 'Despues de una reescritura fuerte o una pasada de IA.',
    howToUse: [
      'Elige capitulo y dos versiones para comparar.',
      'Lee primero lo agregado y lo eliminado.',
      'Apoyate en hitos con nombre para encontrar giros clave.',
    ],
  },
  {
    name: 'Biblia',
    purpose: 'Guardar personajes, lugares y reglas del libro.',
    bestMoment: 'Desde el inicio y cada vez que el canon cambie.',
    howToUse: [
      'Crea fichas cortas pero concretas.',
      'Guarda rasgos, objetivos, atmosfera y reglas de continuidad.',
      'Usala antes de pedir escenas complejas a la IA.',
    ],
  },
  {
    name: 'Saga',
    purpose: 'Gestionar el canon global de varios libros.',
    bestMoment: 'Cuando el proyecto supera un solo volumen.',
    howToUse: [
      'Vincula libros y asigna su volumen.',
      'Carga reglas del mundo, secretos, relaciones y eventos canonicos.',
      'Usa `Reglas fijadas para IA` para cosas que nunca deben olvidarse.',
    ],
  },
  {
    name: 'Timeline',
    purpose: 'Seguir la cronologia real y la ruta de personajes.',
    bestMoment: 'Cuando hay viajes, saltos temporales o subtramas entrelazadas.',
    howToUse: [
      'Filtra por personaje o libro.',
      'Usa la escala visual para encontrar huecos grandes.',
      'Consulta la genealogia dinamica y el detalle del evento en la columna lateral.',
    ],
  },
  {
    name: 'Atlas',
    purpose: 'Visualizar el mundo como mapa de lugares y conexiones.',
    bestMoment: 'Planificacion geografica y revision de rutas.',
    howToUse: [
      'Carga lugares y relaciones en `Saga`.',
      'Selecciona un lugar para ver conexiones y rutas registradas.',
      'Cruza esta vista con `Timeline` si sospechas viajes imposibles.',
    ],
  },
  {
    name: 'Recortes',
    purpose: 'Guardar ideas sueltas fuera del manuscrito y fuera del canon.',
    bestMoment: 'Cuando aparece una escena, frase o giro que aun no tiene lugar.',
    howToUse: [
      'Anota dialogos, suenos, escenas futuras o descartes utiles.',
      'Guarda sin miedo: esto no toca el texto oficial.',
      'Vuelve cuando necesites sembrar algo en un capitulo.',
    ],
  },
  {
    name: 'Hilos',
    purpose: 'Rastrear preguntas abiertas y promesas narrativas.',
    bestMoment: 'Revision de continuidad y cierre de subtramas.',
    howToUse: [
      'Crea un hilo por misterio, promesa o cabo suelto.',
      'Marca si sigue abierto, resuelto o descartado.',
      'Asocialo a un capitulo cuando haga falta.',
    ],
  },
  {
    name: 'Matriz',
    purpose: 'Ver presencia de personajes por capitulo.',
    bestMoment: 'Balance coral y control de desapariciones largas.',
    howToUse: [
      'Abre la matriz para detectar ausencias o saturacion.',
      'Cruza esa lectura con `Timeline` y `Hilos`.',
      'Usala para repartir foco entre protagonistas y secundarios.',
    ],
  },
  {
    name: 'Preview',
    purpose: 'Revisar lectura, saltos y maquetado general.',
    bestMoment: 'Antes de exportar o compartir.',
    howToUse: [
      'Revisa ritmo visual y saltos de pagina.',
      'Chequea portada, contraportada y orden.',
      'Usa esta vista como ultimo control editorial rapido.',
    ],
  },
  {
    name: 'Preferencias',
    purpose: 'Configurar IA, guardado, respaldo y accesibilidad.',
    bestMoment: 'Primer ajuste y cambios de rendimiento.',
    howToUse: [
      'Revisa modelo, temperatura y estado de IA local.',
      'Ajusta auto-aplicado y respaldo.',
      'Entra aqui si algo tecnico necesita atencion.',
    ],
  },
];

const SIDEBAR_GUIDE: FunctionGuide[] = [
  {
    name: 'Biblioteca',
    purpose: 'Abrir, cambiar o limpiar proyectos desde un solo lugar.',
    bestMoment: 'Al entrar a trabajar o cambiar de libro.',
    howToUse: [
      'Abre un libro con un clic.',
      'Usa `Opciones` para abrir chat, Amazon o cambiar estado.',
      'Confirma dos veces antes de eliminar: borra en disco.',
    ],
  },
  {
    name: 'Capitulos',
    purpose: 'Crear y mover la estructura del manuscrito.',
    bestMoment: 'Planificacion y revision de ritmo.',
    howToUse: [
      'Usa `+` para crear un capitulo.',
      'Sube, baja, duplica o renombra desde los controles cortos.',
      'Reordena hasta que el arco se sienta bien en lectura.',
    ],
  },
  {
    name: 'Exportar',
    purpose: 'Sacar el manuscrito a formatos editoriales y de colaboracion.',
    bestMoment: 'Entrega, revision externa o publicacion.',
    howToUse: [
      'Usa Markdown para entregas rapidas.',
      'DOCX y EPUB sirven como salida editorial base.',
      'El `paquete de edicion` permite traer cambios externos con vista previa.',
    ],
  },
];

const AI_GUIDE: FunctionGuide[] = [
  {
    name: 'Acciones rapidas',
    purpose: 'Pulir o reescribir sin redactar prompts largos.',
    bestMoment: 'Bloqueos puntuales o revision rapida.',
    howToUse: [
      'Elige una accion segun tu objetivo.',
      'Guarda un hito antes de cambios grandes.',
      'Si no funciona, compara en `Cambios` o deshaz la version.',
    ],
  },
  {
    name: 'Chat con contexto',
    purpose: 'Consultar por capitulo o por libro sabiendo que contexto recibe la IA.',
    bestMoment: 'Dudas de trama, continuidad o reescritura guiada.',
    howToUse: [
      'Mira el bloque `Contexto visible` antes de enviar.',
      'Por capitulo sirve para una escena; por libro para estructura global.',
      'Las reglas fijadas para IA entran siempre aunque la saga sea grande.',
    ],
  },
  {
    name: 'Seguimiento y resumen',
    purpose: 'Pedir lectura de personaje o resumen de progreso sin releer todo.',
    bestMoment: 'Mitad de libro o antes de tomar decisiones fuertes.',
    howToUse: [
      'Usa `Seguimiento personaje` para una sola linea de accion.',
      'Usa `Resumen historia` con rango de capitulos si quieres acotar.',
      'Sirve para revisar lo que la IA deberia tener presente antes de reescribir.',
    ],
  },
];

const COMMON_ISSUES: GuideStep[] = [
  {
    title: 'La IA no mantiene el canon',
    reason: 'Suele faltar base, biblia o reglas fijadas para IA.',
    actions: [
      'Completa `Base` y `Biblia` con datos concretos.',
      'Si trabajas saga, agrega reglas fijas en `Saga`.',
      'Verifica el bloque `Contexto visible` antes de enviar el mensaje.',
    ],
    check: 'Debes ver personajes, lugares y reglas reales en el contexto cargado.',
  },
  {
    title: 'Me perdi despues de una reescritura',
    reason: 'Falto marcar un hito o comparar la version actual con una anterior.',
    actions: [
      'Guarda hitos antes de cambios delicados.',
      'Abre `Cambios` y compara versiones clave.',
      'Si hace falta, restaura una version anterior y vuelve a intentar.',
    ],
    check: 'Debes poder volver a una etapa reconocible del manuscrito.',
  },
  {
    title: 'La saga marca incoherencias',
    reason: 'Timeline, relaciones o estado de personajes entraron en conflicto.',
    actions: [
      'Abre `Saga` o `Timeline` y filtra por el personaje o evento afectado.',
      'Lee el revisor de coherencia antes de exportar.',
      'Recuerda: el guardado no se bloquea; primero preserva tu trabajo.',
    ],
    check: 'La alerta debe convertirse en aviso resuelto o quedar registrada para despues.',
  },
];

const SHORTCUTS = [
  '`Ctrl + F`: abrir busqueda global',
  '`Ctrl + Shift + H`: abrir o cerrar esta ayuda',
  '`Ctrl + Shift + F`: activar o salir de modo foco',
  '`Ctrl + S`: guardar ahora',
  '`Ctrl + Shift + N`: crear capitulo nuevo',
  '`Alt + Flecha arriba/abajo`: mover capitulo activo',
];

const ADVANCED_NOTES = [
  'Cada libro vive en su propia carpeta con manuscrito, capitulos, exportaciones y versiones.',
  'Los hitos te ayudan a nombrar versiones clave para no depender de numeros sueltos.',
  'El respaldo automatico crea una copia versionada con manifiesto.',
  'Si algo tecnico falla, primero entra en `Preferencias` y revisa `IA local`.',
];

function HelpPanel(props: HelpPanelProps) {
  const {
    isOpen,
    hasBook,
    hasSaga,
    focusMode,
    onClose,
    onCreateBook,
    onOpenBook,
    onOpenStarterGuide,
    onGoToView,
    onToggleFocusMode,
  } = props;
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

  const quickActions: QuickAction[] = [
    {
      title: 'Guiame para arrancar',
      description: 'Abre el recorrido corto con checklist de primer libro.',
      buttonLabel: 'Abrir guia inicial',
      onRun: () => {
        onClose();
        onOpenStarterGuide();
      },
    },
    {
      title: 'Llevarme al manuscrito',
      description: 'Salta directo al editor para seguir escribiendo.',
      buttonLabel: 'Ir al editor',
      disabled: !hasBook,
      onRun: () => {
        onClose();
        onGoToView('editor');
      },
    },
    {
      title: 'Abrir mi banco de ideas',
      description: 'Te lleva a `Recortes` para guardar escenas sueltas o notas.',
      buttonLabel: 'Ir a recortes',
      disabled: !hasBook,
      onRun: () => {
        onClose();
        onGoToView('scratchpad');
      },
    },
    {
      title: 'Ordenar el canon',
      description: 'Abre `Saga` para reglas globales, timeline y relaciones.',
      buttonLabel: 'Ir a saga',
      disabled: !hasSaga,
      onRun: () => {
        onClose();
        onGoToView('saga');
      },
    },
  ];

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
          <h2 id={titleId}>Asistente de escritura WriteWMe</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Cerrar ayuda">
            X
          </button>
        </header>

        <p className="help-lead">
          Esta ayuda esta pensada para escribir, revisar y sostener una saga larga sin tener que pensar como un
          programador. Si algo tecnico aparece, queda al final en `Avanzado`.
        </p>

        <div className="help-quick-grid">
          {quickActions.map((action) => (
            <article key={action.title} className="help-quick-card">
              <h3>{action.title}</h3>
              <p>{action.description}</p>
              <button type="button" onClick={action.onRun} disabled={action.disabled}>
                {action.buttonLabel}
              </button>
            </article>
          ))}
        </div>

        <div className="help-track-grid">
          <article className="help-track-card">
            <h3>Ruta de escritura</h3>
            <p>Para avanzar sin romper el ritmo.</p>
            <ol>
              <li>Editor para el texto vivo.</li>
              <li>Recortes para ideas fuera de capitulo.</li>
              <li>Biblia para fijar canon minimo.</li>
              <li>Cambios para revisar versiones clave.</li>
            </ol>
          </article>

          <article className="help-track-card">
            <h3>Ruta de saga</h3>
            <p>Para controlar un mundo grande sin perder continuidad.</p>
            <ol>
              <li>Saga para reglas globales y secretos.</li>
              <li>Timeline para cronologia real.</li>
              <li>Atlas para lugares y rutas.</li>
              <li>Hilos y Matriz para subtramas y reparto coral.</li>
            </ol>
          </article>
        </div>

        <details className="help-section">
          <summary>1) Primeros pasos sin friccion</summary>
          <div className="help-step-list">
            {QUICK_START_STEPS.map((step) => (
              <article key={step.title} className="help-step-card">
                <h3>{step.title}</h3>
                <p className="help-step-reason">
                  <strong>Por que:</strong> {step.reason}
                </p>
                <ol>
                  {step.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
                <p className="help-step-check">
                  <strong>Como validar:</strong> {step.check}
                </p>
              </article>
            ))}
          </div>
        </details>

        <details className="help-section">
          <summary>2) Pantallas principales</summary>
          <div className="help-function-grid">
            {MAIN_VIEWS_GUIDE.map((entry) => (
              <article key={entry.name} className="help-function-card">
                <h3>{entry.name}</h3>
                <p>
                  <strong>Para que sirve:</strong> {entry.purpose}
                </p>
                <p>
                  <strong>Cuando usar:</strong> {entry.bestMoment}
                </p>
                <ol>
                  {entry.howToUse.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </details>

        <details className="help-section">
          <summary>3) Biblioteca, capitulos y exportacion</summary>
          <div className="help-function-grid">
            {SIDEBAR_GUIDE.map((entry) => (
              <article key={entry.name} className="help-function-card">
                <h3>{entry.name}</h3>
                <p>
                  <strong>Para que sirve:</strong> {entry.purpose}
                </p>
                <p>
                  <strong>Cuando usar:</strong> {entry.bestMoment}
                </p>
                <ol>
                  {entry.howToUse.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </details>

        <details className="help-section">
          <summary>4) IA con contexto claro</summary>
          <div className="help-function-grid">
            {AI_GUIDE.map((entry) => (
              <article key={entry.name} className="help-function-card">
                <h3>{entry.name}</h3>
                <p>
                  <strong>Para que sirve:</strong> {entry.purpose}
                </p>
                <p>
                  <strong>Cuando usar:</strong> {entry.bestMoment}
                </p>
                <ol>
                  {entry.howToUse.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </details>

        <details className="help-section">
          <summary>5) Problemas frecuentes</summary>
          <div className="help-step-list">
            {COMMON_ISSUES.map((issue) => (
              <article key={issue.title} className="help-step-card">
                <h3>{issue.title}</h3>
                <p className="help-step-reason">
                  <strong>Causa tipica:</strong> {issue.reason}
                </p>
                <ol>
                  {issue.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
                <p className="help-step-check">
                  <strong>Resultado esperado:</strong> {issue.check}
                </p>
              </article>
            ))}
          </div>
        </details>

        <div className="help-grid">
          <article>
            <h3>Atajos utiles</h3>
            <ul>
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut}>{shortcut}</li>
              ))}
            </ul>
          </article>
          <article>
            <h3>Orden corto si te abruma todo</h3>
            <p>
              Usa solo este camino: <code>Nuevo/Abrir</code> a <code>Editor</code> a <code>Recortes</code> a{' '}
              <code>Biblia</code> a <code>Panel IA</code> a <code>Cambios</code> a <code>Preview</code>.
            </p>
          </article>
          <article>
            <h3>Modo foco</h3>
            <p>Sirve para escribir sin laterales. Puedes activarlo ahora mismo desde aqui.</p>
          </article>
          <article>
            <h3>Cuando una saga crece</h3>
            <p>
              Fija reglas en <code>Saga</code>, mira rutas en <code>Timeline</code>, y guarda versiones con nombre antes
              de tocar escenas delicadas.
            </p>
          </article>
        </div>

        <details className="help-section">
          <summary>6) Avanzado</summary>
          <div className="help-step-list">
            <article className="help-step-card">
              <h3>Notas tecnicas minimas</h3>
              <ul>
                {ADVANCED_NOTES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
          </div>
        </details>

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
