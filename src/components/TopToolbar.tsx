import {
  BookImage,
  BookOpenText,
  BookPlus,
  BookX,
  ChartColumn,
  Clock3,
  Compass,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  GitCompare,
  Grid3x3,
  LayoutDashboard,
  Languages,
  Link2,
  ListTree,
  LogOut,
  Map,
  NotebookPen,
  Search,
  Settings,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { MainView } from '../types/book';

type ToolbarMode = 'escritura' | 'mundo' | 'saga' | 'publicacion';
type ToolbarTone = ToolbarMode | 'utility';

interface TopToolbarProps {
  hasBook: boolean;
  hasSaga: boolean;
  currentView: MainView;
  focusMode: boolean;
  onCreateBook: () => void;
  onOpenBook: () => void;
  onCloseBook: () => void;
  onToggleFocusMode: () => void;
  onShowEditor: () => void;
  onShowOutline: () => void;
  onShowPreview: () => void;
  onShowDiff: () => void;
  onShowStyle: () => void;
  onShowCover: () => void;
  onShowFoundation: () => void;
  onShowBible: () => void;
  onShowSaga: () => void;
  onShowSagaDashboard: () => void;
  onShowTimeline: () => void;
  onShowPlot: () => void;
  onShowRelations: () => void;
  onShowAtlas: () => void;
  onShowAmazon: () => void;
  onShowSearch: () => void;
  onShowSettings: () => void;
  onShowLanguage: () => void;
  onShowScratchpad: () => void;
  onShowLooseThreads: () => void;
  onShowCharMatrix: () => void;
  onQuitApp: () => void;
}

interface ViewConfig {
  id: MainView;
  label: string;
  title: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}

interface ModeConfig {
  id: ToolbarMode;
  label: string;
  hint: string;
  summary: string;
  icon: LucideIcon;
  disabled: boolean;
  views: ViewConfig[];
}

const VIEW_MODE_MAP: Partial<Record<MainView, ToolbarMode>> = {
  editor: 'escritura',
  outline: 'escritura',
  diff: 'escritura',
  style: 'escritura',
  search: 'escritura',
  scratchpad: 'escritura',
  'loose-threads': 'escritura',
  'char-matrix': 'escritura',
  foundation: 'mundo',
  bible: 'mundo',
  language: 'mundo',
  saga: 'saga',
  timeline: 'saga',
  plot: 'saga',
  relations: 'saga',
  atlas: 'saga',
  preview: 'publicacion',
  cover: 'publicacion',
  amazon: 'publicacion',
};

function getToolbarTone(view: MainView): ToolbarTone {
  return VIEW_MODE_MAP[view] ?? 'utility';
}

function buildModes(props: TopToolbarProps): ModeConfig[] {
  return [
    {
      id: 'escritura',
      label: 'Escritura',
      hint: 'Borrador, revision y mesa de trabajo.',
      summary: 'Pulso del manuscrito, revision, busqueda y notas vivas.',
      icon: FileText,
      disabled: !props.hasBook,
      views: [
        {
          id: 'editor',
          label: 'Editor',
          title: 'Vista editor.',
          icon: FileText,
          disabled: !props.hasBook,
          onClick: props.onShowEditor,
        },
        {
          id: 'outline',
          label: 'General',
          title: 'Vista general del libro.',
          icon: ListTree,
          disabled: !props.hasBook,
          onClick: props.onShowOutline,
        },
        {
          id: 'diff',
          label: 'Cambios',
          title: 'Comparar cambios entre versiones y puntos de restauracion.',
          icon: GitCompare,
          disabled: !props.hasBook,
          onClick: props.onShowDiff,
        },
        {
          id: 'style',
          label: 'Estilo',
          title: 'Metricas de estilo y ritmo narrativo.',
          icon: ChartColumn,
          disabled: !props.hasBook,
          onClick: props.onShowStyle,
        },
        {
          id: 'search',
          label: 'Buscar',
          title: 'Buscar y reemplazar.',
          icon: Search,
          disabled: !props.hasBook,
          onClick: props.onShowSearch,
        },
        {
          id: 'scratchpad',
          label: 'Recortes',
          title: 'Banco de ideas: recortes, bocetos y apuntes que no van en ningun capitulo.',
          icon: NotebookPen,
          disabled: !props.hasBook,
          onClick: props.onShowScratchpad,
        },
        {
          id: 'loose-threads',
          label: 'Hilos',
          title: 'Hilos abiertos - promesas narrativas y preguntas sin resolver.',
          icon: Link2,
          disabled: !props.hasBook,
          onClick: props.onShowLooseThreads,
        },
        {
          id: 'char-matrix',
          label: 'Matriz',
          title: 'Matriz personaje por capitulo basada en menciones.',
          icon: Grid3x3,
          disabled: !props.hasBook,
          onClick: props.onShowCharMatrix,
        },
      ],
    },
    {
      id: 'mundo',
      label: 'Mundo',
      hint: 'Canon, reglas, idioma y base del libro.',
      summary: 'Leyendas del mundo, personajes, lugares y leyes narrativas.',
      icon: Database,
      disabled: !props.hasBook,
      views: [
        {
          id: 'foundation',
          label: 'Base',
          title: 'Base narrativa del libro.',
          icon: Database,
          disabled: !props.hasBook,
          onClick: props.onShowFoundation,
        },
        {
          id: 'bible',
          label: 'Biblia',
          title: 'Personajes, lugares y continuidad para IA.',
          icon: Users,
          disabled: !props.hasBook,
          onClick: props.onShowBible,
        },
        {
          id: 'language',
          label: 'Idioma',
          title: 'Idioma de salida para IA.',
          icon: Languages,
          disabled: !props.hasBook,
          onClick: props.onShowLanguage,
        },
      ],
    },
    {
      id: 'saga',
      label: 'Saga',
      hint: 'Arcos, cronologia, relaciones y atlas.',
      summary: 'Vista de mando para una obra larga con historia entretejida.',
      icon: Map,
      disabled: !props.hasSaga,
      views: [
        {
          id: 'saga-dashboard',
          label: 'Panel',
          title: 'Panel general de la saga: progreso, riesgo y accesos rapidos.',
          icon: LayoutDashboard,
          disabled: !props.hasSaga,
          onClick: props.onShowSagaDashboard,
        },
        {
          id: 'saga',
          label: 'Saga',
          title: 'Biblia ampliada y gestion de saga.',
          icon: Map,
          disabled: !props.hasSaga,
          onClick: props.onShowSaga,
        },
        {
          id: 'timeline',
          label: 'Timeline',
          title: 'Cronologia canonica y seguimiento por personaje.',
          icon: Clock3,
          disabled: !props.hasSaga,
          onClick: props.onShowTimeline,
        },
        {
          id: 'plot',
          label: 'Plot',
          title: 'Visualizacion de arcos, ritmo y conflictos narrativos.',
          icon: GitBranch,
          disabled: !props.hasSaga,
          onClick: props.onShowPlot,
        },
        {
          id: 'relations',
          label: 'Relaciones',
          title: 'Grafo de relaciones entre entidades de la saga.',
          icon: Users,
          disabled: !props.hasSaga,
          onClick: props.onShowRelations,
        },
        {
          id: 'atlas',
          label: 'Atlas',
          title: 'Mapa visual de lugares, rutas, capas y conexiones del mundo.',
          icon: Compass,
          disabled: !props.hasSaga,
          onClick: props.onShowAtlas,
        },
      ],
    },
    {
      id: 'publicacion',
      label: 'Publicacion',
      hint: 'Maquetacion, portada y salida comercial.',
      summary: 'Revision final, presencia editorial y entrega lista para mercado.',
      icon: ShoppingCart,
      disabled: !props.hasBook,
      views: [
        {
          id: 'preview',
          label: 'Preview',
          title: 'Vista previa de maquetado.',
          icon: BookOpenText,
          disabled: !props.hasBook,
          onClick: props.onShowPreview,
        },
        {
          id: 'cover',
          label: 'Portada',
          title: 'Gestion de portada y contraportada.',
          icon: BookImage,
          disabled: !props.hasBook,
          onClick: props.onShowCover,
        },
        {
          id: 'amazon',
          label: 'Amazon',
          title: 'Panel Amazon/KDP.',
          icon: ShoppingCart,
          disabled: !props.hasBook,
          onClick: props.onShowAmazon,
        },
      ],
    },
  ];
}

function TopToolbar(props: TopToolbarProps) {
  const modes = buildModes(props);
  const activeMode = VIEW_MODE_MAP[props.currentView] ?? null;
  const visibleMode = modes.find((mode) => mode.id === (activeMode ?? 'escritura')) ?? modes[0];
  const tone = getToolbarTone(props.currentView);

  const openMode = (modeId: ToolbarMode) => {
    const mode = modes.find((entry) => entry.id === modeId);
    const fallbackView = mode?.views.find((view) => !view.disabled);
    fallbackView?.onClick();
  };

  return (
    <section className="top-toolbar" data-tone={tone} aria-label="Barra superior de acciones y vistas">
      <div className="top-toolbar-group top-toolbar-utility">
        <button type="button" className="icon-button" onClick={props.onCreateBook} title="Crear libro nuevo.">
          <BookPlus size={16} />
          <span>Nuevo</span>
        </button>
        <button type="button" className="icon-button" onClick={props.onOpenBook} title="Abrir libro existente.">
          <FolderOpen size={16} />
          <span>Abrir</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={props.onCloseBook}
          disabled={!props.hasBook}
          title="Cerrar libro activo."
        >
          <BookX size={16} />
          <span>Cerrar</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'settings' ? 'is-active' : ''}`}
          onClick={props.onShowSettings}
          title="Abrir preferencias."
        >
          <Settings size={16} />
          <span>Preferencias</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.focusMode ? 'is-active' : ''}`}
          onClick={props.onToggleFocusMode}
          title="Oculta o muestra los paneles laterales para escribir con foco total. Atajo: Ctrl+Shift+F."
        >
          <span>{props.focusMode ? 'Salir foco' : 'Foco 100%'}</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={props.onQuitApp}
          title="Guarda y cierra la aplicacion."
        >
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </div>

      <div className="top-toolbar-mode-board">
        <div className="top-toolbar-mode-copy">
          <span className="top-toolbar-kicker">{activeMode ? 'Area activa' : 'Control general'}</span>
          <strong>{activeMode ? visibleMode.label : 'Preferencias y regreso al flujo'}</strong>
          <p>
            {activeMode
              ? visibleMode.summary
              : 'Ajusta la mesa de trabajo y vuelve a una zona narrativa desde los modos de abajo.'}
          </p>
        </div>

        <div className="top-toolbar-mode-tabs" aria-label="Areas principales de trabajo">
          {modes.map((mode) => {
            const Icon = mode.icon;
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={`top-toolbar-mode-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => openMode(mode.id)}
                disabled={mode.disabled}
                aria-pressed={isActive}
                title={mode.summary}
              >
                <span className="top-toolbar-mode-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="top-toolbar-mode-text">
                  <strong>{mode.label}</strong>
                  <small>{mode.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="top-toolbar-group top-toolbar-views">
        <div className="top-toolbar-view-heading">
          <span className="top-toolbar-kicker">Vistas de {visibleMode.label}</span>
          <strong>{visibleMode.summary}</strong>
        </div>
        <div className="top-toolbar-view-strip">
          {visibleMode.views.map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.id}
                type="button"
                className={`icon-button toolbar-view-button ${props.currentView === view.id ? 'is-active' : ''}`}
                onClick={view.onClick}
                disabled={view.disabled}
                title={view.title}
              >
                <Icon size={16} />
                <span>{view.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default TopToolbar;
