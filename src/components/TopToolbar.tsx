import {
  BookImage,
  BookOpenText,
  BookPlus,
  BookX,
  ChartColumn,
  Database,
  FileText,
  FolderOpen,
  GitCompare,
  Languages,
  ListTree,
  Search,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';
import type { MainView } from '../types/book';

interface TopToolbarProps {
  hasBook: boolean;
  currentView: MainView;
  onCreateBook: () => void;
  onOpenBook: () => void;
  onCloseBook: () => void;
  onShowEditor: () => void;
  onShowOutline: () => void;
  onShowPreview: () => void;
  onShowDiff: () => void;
  onShowStyle: () => void;
  onShowCover: () => void;
  onShowFoundation: () => void;
  onShowBible: () => void;
  onShowAmazon: () => void;
  onShowSearch: () => void;
  onShowSettings: () => void;
  onShowLanguage: () => void;
}

function TopToolbar(props: TopToolbarProps) {
  return (
    <section className="top-toolbar" aria-label="Barra superior de acciones y vistas">
      <div className="top-toolbar-group">
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
          title="Abrir settings."
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>

      <div className="top-toolbar-group top-toolbar-views">
        <button
          type="button"
          className={`icon-button ${props.currentView === 'editor' ? 'is-active' : ''}`}
          onClick={props.onShowEditor}
          disabled={!props.hasBook}
          title="Vista editor."
        >
          <FileText size={16} />
          <span>Editor</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'outline' ? 'is-active' : ''}`}
          onClick={props.onShowOutline}
          disabled={!props.hasBook}
          title="Vista general del libro."
        >
          <ListTree size={16} />
          <span>General</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'preview' ? 'is-active' : ''}`}
          onClick={props.onShowPreview}
          disabled={!props.hasBook}
          title="Vista previa de maquetado."
        >
          <BookOpenText size={16} />
          <span>Preview</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'diff' ? 'is-active' : ''}`}
          onClick={props.onShowDiff}
          disabled={!props.hasBook}
          title="Control de cambios entre snapshots."
        >
          <GitCompare size={16} />
          <span>Diff</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'style' ? 'is-active' : ''}`}
          onClick={props.onShowStyle}
          disabled={!props.hasBook}
          title="Metricas de estilo y ritmo narrativo."
        >
          <ChartColumn size={16} />
          <span>Estilo</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'search' ? 'is-active' : ''}`}
          onClick={props.onShowSearch}
          disabled={!props.hasBook}
          title="Buscar y reemplazar."
        >
          <Search size={16} />
          <span>Buscar</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'cover' ? 'is-active' : ''}`}
          onClick={props.onShowCover}
          disabled={!props.hasBook}
          title="Gestion de portada y contraportada."
        >
          <BookImage size={16} />
          <span>Portada</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'foundation' ? 'is-active' : ''}`}
          onClick={props.onShowFoundation}
          disabled={!props.hasBook}
          title="Base narrativa del libro."
        >
          <Database size={16} />
          <span>Base</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'bible' ? 'is-active' : ''}`}
          onClick={props.onShowBible}
          disabled={!props.hasBook}
          title="Personajes, lugares y continuidad para IA."
        >
          <Users size={16} />
          <span>Biblia</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'language' ? 'is-active' : ''}`}
          onClick={props.onShowLanguage}
          disabled={!props.hasBook}
          title="Idioma de salida para IA."
        >
          <Languages size={16} />
          <span>Idioma</span>
        </button>
        <button
          type="button"
          className={`icon-button ${props.currentView === 'amazon' ? 'is-active' : ''}`}
          onClick={props.onShowAmazon}
          disabled={!props.hasBook}
          title="Panel Amazon/KDP."
        >
          <ShoppingCart size={16} />
          <span>Amazon</span>
        </button>
      </div>
    </section>
  );
}

export default TopToolbar;
