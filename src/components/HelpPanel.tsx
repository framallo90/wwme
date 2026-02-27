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

const QUICK_START_STEPS: GuideStep[] = [
  {
    title: 'Paso 1 - Crear o abrir un libro',
    reason: 'Sin un libro abierto, el resto de funciones queda bloqueado para evitar errores.',
    actions: [
      'Usa `Nuevo` para crear desde cero o `Abrir` para continuar uno existente.',
      'Si creas uno nuevo, elige una carpeta donde quieras guardar todo.',
      'Confirma titulo y autor.',
    ],
    check: 'Debes ver el titulo del libro en la barra superior y en la columna izquierda.',
  },
  {
    title: 'Paso 2 - Crear el primer capitulo',
    reason: 'WriteWMe trabaja por capitulos para ordenar mejor versiones y contexto IA.',
    actions: [
      'En `Capitulos`, pulsa `+`.',
      'Haz clic en el capitulo para abrirlo en `Editor`.',
      'Escribe texto base (aunque sea un borrador corto).',
    ],
    check: 'Debes ver el texto en el editor y el contador de palabras actualizado.',
  },
  {
    title: 'Paso 3 - Dar contexto narrativo a la IA',
    reason: 'La IA responde mejor cuando conoce personajes, lugares y reglas de continuidad.',
    actions: [
      'Abre `Base` y define idea central, tono y publico.',
      'Abre `Biblia` y carga personajes, lugares y reglas.',
      'Guarda los cambios antes de pedir reescrituras.',
    ],
    check: 'En `Biblia` deben aparecer tus fichas y en `Base` tu direccion narrativa.',
  },
  {
    title: 'Paso 4 - Iterar con IA sin perder control',
    reason: 'Las acciones IA aceleran, pero los snapshots permiten volver atras sin riesgo.',
    actions: [
      'En panel derecho, elige una accion rapida o usa chat.',
      'Antes de cambios grandes, toma nota del estado actual.',
      'Si no te convence, usa `Deshacer IA`.',
    ],
    check: 'Debes poder volver al texto anterior con `Deshacer IA`.',
  },
  {
    title: 'Paso 5 - Revisar y exportar',
    reason: 'El flujo profesional termina en revision y salida, no en primer borrador.',
    actions: [
      'Revisa `Estilo`, `Diff` y `Preview`.',
      'Completa `Portada` y `Amazon` si vas a publicar.',
      'Exporta a Markdown, DOCX, EPUB o pack Amazon segun tu objetivo.',
    ],
    check: 'Debes generar al menos un archivo de salida en la carpeta `exports` del libro.',
  },
];

const MAIN_VIEWS_GUIDE: FunctionGuide[] = [
  {
    name: 'Editor',
    purpose: 'Escribir y editar el capitulo activo.',
    bestMoment: 'Uso diario de escritura.',
    howToUse: [
      'Selecciona un capitulo desde la izquierda.',
      'Escribe directamente y deja que el guardado automatico trabaje.',
      'Usa guardado manual (`Ctrl + S`) antes de cerrar la app.',
    ],
  },
  {
    name: 'General',
    purpose: 'Ver el libro completo por capitulos y estructura.',
    bestMoment: 'Planificacion y control de avance.',
    howToUse: [
      'Abre `General` para revisar secuencia de capitulos.',
      'Entra a un capitulo haciendo clic sobre su bloque.',
      'Usa esta vista al inicio de cada sesion para orientarte.',
    ],
  },
  {
    name: 'Preview',
    purpose: 'Previsualizar maquetado y ritmo visual.',
    bestMoment: 'Revision previa a exportar o publicar.',
    howToUse: [
      'Abre `Preview` para ver portada, capitulos y contraportada.',
      'Revisa saltos, densidad de texto y orden de lectura.',
      'Usa `Imprimir / PDF` para comprobacion final.',
    ],
  },
  {
    name: 'Diff',
    purpose: 'Comparar cambios entre versiones y snapshots.',
    bestMoment: 'Cuando una reescritura cambia demasiado y necesitas auditar.',
    howToUse: [
      'Selecciona capitulo y versiones a comparar.',
      'Lee bloques insertados/eliminados antes de aprobar.',
      'Combinalo con `Deshacer IA` si detectas regresiones.',
    ],
  },
  {
    name: 'Estilo',
    purpose: 'Analizar ritmo, repeticiones y señales de calidad.',
    bestMoment: 'Segunda vuelta de revision (despues de escribir).',
    howToUse: [
      'Abre `Estilo` para detectar muletillas y frases largas.',
      'Corrige primero alertas grandes, luego detalles finos.',
      'Exporta reporte si quieres seguimiento entre sesiones.',
    ],
  },
  {
    name: 'Buscar',
    purpose: 'Buscar/reemplazar en un capitulo o en todo el libro.',
    bestMoment: 'Cambios globales de nombres, terminos o tono.',
    howToUse: [
      'Define texto a buscar y reemplazo.',
      'Ejecuta `Simular reemplazo global` para ver impacto antes de tocar texto.',
      'Prueba primero en un capitulo y luego aplica al libro completo con cuidado.',
    ],
  },
  {
    name: 'Portada',
    purpose: 'Asignar portada, contraportada y texto de lomo.',
    bestMoment: 'Cuando el manuscrito ya esta estable.',
    howToUse: [
      'Pulsa `Cambiar portada` o `Cambiar contraportada`.',
      'Valida la recomendacion de medidas KDP que aparece en pantalla.',
      'Guarda datos de portada para persistir cambios.',
    ],
  },
  {
    name: 'Base',
    purpose: 'Definir fundamento del libro: promesa, voz, reglas.',
    bestMoment: 'Antes de escribir fuerte o si el proyecto se desordena.',
    howToUse: [
      'Completa idea central y publico objetivo.',
      'Define reglas de estilo para mantener coherencia.',
      'Actualiza cuando cambie el rumbo del libro.',
    ],
  },
  {
    name: 'Biblia',
    purpose: 'Guardar personajes, lugares y continuidad narrativa.',
    bestMoment: 'Desde el inicio y en cada hito importante.',
    howToUse: [
      'Crea fichas claras con rasgos y rol narrativo.',
      'Usa el boton `Consejo de coherencia` para ver flujo recomendado paso a paso.',
      'Al guardar un hito, el sistema intenta sincronizar automaticamente personajes/lugares del capitulo activo.',
      'Revisa y corrige esas altas automaticas (edad, heridas, relaciones, motivacion).',
      'Usala antes de pedir escenas complejas a la IA.',
    ],
  },
  {
    name: 'Idioma',
    purpose: 'Alinear idioma del libro, IA y configuracion de mercado.',
    bestMoment: 'Inicio de proyecto y antes de exportar/publicar.',
    howToUse: [
      'Selecciona idioma principal de trabajo.',
      'Revisa advertencias de mercado/moneda si aparecen.',
      'Guarda para mantener prompts y metadata consistentes.',
    ],
  },
  {
    name: 'Amazon',
    purpose: 'Completar metadata, pricing y pack de publicacion KDP.',
    bestMoment: 'Fase editorial final.',
    howToUse: [
      'Completa titulo, descripcion, categorias y precios.',
      'Revisa validaciones de campos obligatorios.',
      'Exporta pack Amazon para carga rapida.',
    ],
  },
  {
    name: 'Settings',
    purpose: 'Configurar IA, autosave, accesibilidad y comportamiento global.',
    bestMoment: 'Primera configuracion y ajustes de rendimiento.',
    howToUse: [
      'Define modelo y temperatura.',
      'Ajusta guardado automatico y modo de aplicacion de chat.',
      'Activa accesibilidad (alto contraste, texto grande) si lo necesitas.',
    ],
  },
];

const SIDEBAR_GUIDE: FunctionGuide[] = [
  {
    name: 'Biblioteca',
    purpose: 'Gestionar todos tus libros desde un solo lugar.',
    bestMoment: 'Al iniciar sesion o cambiar de proyecto.',
    howToUse: [
      'Abre un libro con `Abrir`.',
      'Usa `Opciones` para chat, Amazon, publicar/despublicar o eliminar.',
      'Confirma siempre antes de eliminar: borra tambien en disco.',
    ],
  },
  {
    name: 'Capitulos',
    purpose: 'Crear, ordenar y mantener la estructura narrativa.',
    bestMoment: 'Planificacion de estructura y revision de flujo.',
    howToUse: [
      'Usa `+` para nuevo capitulo.',
      'Controles por capitulo: `^` subir, `v` bajar, `R` renombrar, `D` duplicar, `X` borrar.',
      'Reordena hasta que el arco narrativo tenga sentido.',
    ],
  },
  {
    name: 'Exportar',
    purpose: 'Sacar el manuscrito en formato de trabajo o publicacion.',
    bestMoment: 'Cierre de borrador o entrega editorial.',
    howToUse: [
      'Capitulo Markdown: entrega puntual.',
      'Libro archivo unico o por capitulos: revision externa.',
      'DOCX/EPUB/Amazon pack: salida editorial o KDP.',
      'Patch colaboracion: importa y revisa el preview diff antes de aplicar.',
    ],
  },
];

const AI_GUIDE: FunctionGuide[] = [
  {
    name: 'Acciones rapidas IA',
    purpose: 'Aplicar mejoras puntuales sin escribir prompts largos.',
    bestMoment: 'Bloqueos de redaccion o pulido rapido.',
    howToUse: [
      'Elige la accion segun objetivo (expandir, simplificar, etc.).',
      'Evalua el resultado en el editor.',
      'Si no te sirve, usa `Deshacer IA`.',
    ],
  },
  {
    name: 'Chat por capitulo o libro',
    purpose: 'Conseguir ayuda contextual segun alcance.',
    bestMoment: 'Consultas de trama, tono o reescrituras guiadas.',
    howToUse: [
      '`Por capitulo`: cambios localizados.',
      '`Por libro`: decisiones globales de estructura y continuidad.',
      'Usa `Seguimiento personaje` para ver, en chat, todas las acciones de un personaje a lo largo del libro.',
      'Usa `Desde cap / Hasta cap` para filtrar rango antes de rastrear o resumir.',
      'Usa `Resumen historia` para obtener estado cronologico desde el inicio hasta el punto actual.',
      'Usa mensajes concretos: objetivo + tono + limite de palabras.',
    ],
  },
  {
    name: 'Auto-aplicar y agente continuo',
    purpose: 'Automatizar ciclos de mejora con menos pasos manuales.',
    bestMoment: 'Cuando ya confias en el estilo base del proyecto.',
    howToUse: [
      'Auto-aplicar: envia y modifica texto automaticamente.',
      'Agente continuo: varias rondas de mejora en cascada.',
      'Para cambios delicados, desactiva auto-aplicar y usa modo consulta.',
    ],
  },
];

const COMMON_ISSUES: GuideStep[] = [
  {
    title: 'No veo portada o contraportada',
    reason: 'Suele ser ruta invalida, archivo movido o fallo de carga.',
    actions: [
      'Vuelve a `Portada` y pulsa `Cambiar portada`.',
      'Si no aparece, pulsa `Reintentar` para forzar nueva carga del archivo.',
      'Confirma que la imagen exista en disco.',
      'Usa formato JPG/JPEG o PNG y valida medidas sugeridas de KDP.',
      'Guarda y revisa en `Preview`.',
    ],
    check: 'La imagen debe verse en `Portada` y tambien en `Preview`.',
  },
  {
    title: 'La IA responde raro o no mantiene estilo',
    reason: 'Falta de contexto narrativo y/o idioma inconsistente.',
    actions: [
      'Completa `Base` y `Biblia` con datos concretos.',
      'Revisa `Idioma` y `Settings` (modelo, temperatura).',
      'Da instrucciones especificas: tono, longitud, objetivo.',
    ],
    check: 'Las respuestas deben acercarse mas al tono definido.',
  },
  {
    title: 'Hice un cambio masivo y arruine texto',
    reason: 'Busqueda/reemplazo global o accion IA demasiado agresiva.',
    actions: [
      'Usa `Deshacer IA` si fue por IA.',
      'Revisa `Diff` para detectar en que se rompio.',
      'Repite cambio en lotes pequenos, primero por capitulo.',
    ],
    check: 'El texto debe recuperar coherencia y continuidad.',
  },
];

const SHORTCUTS = [
  '`Ctrl + F`: abrir busqueda global',
  '`Ctrl + Shift + H`: abrir/cerrar ayuda',
  '`Ctrl + Shift + F`: activar/desactivar modo foco',
  '`Ctrl + S`: guardado manual inmediato',
  '`Ctrl + Shift + N`: crear capitulo nuevo',
  '`Alt + Flecha arriba/abajo`: mover capitulo activo',
];

const TECHNICAL_NOTES = [
  'Cada libro vive en su carpeta con `book.json`, `chapters/`, `assets/`, `versions/`, `exports/`.',
  'Config por libro en `config.json` para modelo, idioma, autosave y opciones IA.',
  'Antes de publicar: revisar `Preview`, `Diff`, `Estilo`, `Amazon` y export final.',
  'Para chequeo local rapido: `npm run verify:local`.',
];

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
          <h2 id={titleId}>Guia completa WriteWMe</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Cerrar ayuda">
            X
          </button>
        </header>

        <p className="help-lead">
          Esta guia esta pensada para dos perfiles: personas no tecnicas que quieren escribir sin friccion y personas
          tecnicas que quieren control total del flujo. Puedes recorrerla de arriba hacia abajo.
        </p>

        <div className="help-track-grid">
          <article className="help-track-card">
            <h3>Ruta recomendada (no tecnica)</h3>
            <p>Si quieres escribir sin meterte en detalles de archivos o configuracion avanzada.</p>
            <ol>
              <li>Crear/Abrir libro.</li>
              <li>Escribir en Editor.</li>
              <li>Definir Base + Biblia.</li>
              <li>Pulir con IA y Estilo.</li>
              <li>Revisar en Preview y exportar.</li>
            </ol>
          </article>

          <article className="help-track-card">
            <h3>Ruta avanzada (tecnica)</h3>
            <p>Si necesitas trazabilidad, control de versiones y salida editorial estricta.</p>
            <ol>
              <li>Validar estructura de libro y settings.</li>
              <li>Trabajar por capitulos con snapshots y Diff.</li>
              <li>Auditar metrica de estilo y continuidad.</li>
              <li>Cerrar metadata Amazon y validaciones.</li>
              <li>Exportar DOCX/EPUB/pack KDP.</li>
            </ol>
          </article>
        </div>

        <details className="help-section" open>
          <summary>1) Primeros 15 minutos: paso a paso guiado</summary>
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

        <details className="help-section" open>
          <summary>2) Para que sirve cada pantalla (barra superior)</summary>
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
          <summary>3) Columna izquierda: biblioteca, capitulos y exportaciones</summary>
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
          <summary>4) Panel IA: como usarlo bien</summary>
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
          <summary>5) Problemas frecuentes y solucion rapida</summary>
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
            <h3>Notas tecnicas</h3>
            <ul>
              {TECHNICAL_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>
          <article>
            <h3>Flujo recomendado de trabajo</h3>
            <ol>
              <li>Planifica en `Base` + `Biblia`.</li>
              <li>Escribe en `Editor` por bloques cortos.</li>
              <li>Pule con IA y confirma con `Diff`.</li>
              <li>Audita con `Estilo`.</li>
              <li>Cierra salida en `Preview`, `Amazon` y export.</li>
            </ol>
          </article>
          <article>
            <h3>Consejo para no tecnicos</h3>
            <p>
              Si te abruma la cantidad de opciones, usa solo este orden: <code>Nuevo/Abrir</code> a{' '}
              <code>Editor</code> a <code>Biblia</code> a <code>Panel IA</code> a <code>Preview</code> a{' '}
              <code>Exportar</code>. El resto puede sumarse despues.
            </p>
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
