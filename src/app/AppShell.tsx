import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  center: ReactNode;
  right: ReactNode;
  status: string;
  focusMode?: boolean;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
}

function AppShell(props: AppShellProps) {
  const leftCollapsed = Boolean(props.leftCollapsed);
  const rightCollapsed = Boolean(props.rightCollapsed);

  return (
    <main
      className={`app-shell ${props.focusMode ? 'is-focus-mode' : ''} ${leftCollapsed ? 'is-left-collapsed' : ''} ${rightCollapsed ? 'is-right-collapsed' : ''}`}
    >
      <section className={`shell-side shell-side-left ${leftCollapsed ? 'is-collapsed' : ''}`}>
        {leftCollapsed ? null : props.sidebar}
        <button
          type="button"
          className="shell-side-toggle shell-side-toggle-left"
          onClick={props.onToggleLeft}
          title={leftCollapsed ? 'Expandir panel izquierdo.' : 'Ocultar panel izquierdo.'}
          aria-label={leftCollapsed ? 'Expandir panel izquierdo' : 'Ocultar panel izquierdo'}
        >
          {leftCollapsed ? '>' : '<'}
        </button>
      </section>
      <section className="center-stage">{props.center}</section>
      <section className={`shell-side shell-side-right ${rightCollapsed ? 'is-collapsed' : ''}`}>
        <button
          type="button"
          className="shell-side-toggle shell-side-toggle-right"
          onClick={props.onToggleRight}
          title={rightCollapsed ? 'Expandir panel derecho.' : 'Ocultar panel derecho.'}
          aria-label={rightCollapsed ? 'Expandir panel derecho' : 'Ocultar panel derecho'}
        >
          {rightCollapsed ? '<' : '>'}
        </button>
        {rightCollapsed ? null : props.right}
      </section>
      <footer className="status-bar" role="status" aria-live="polite">
        {props.status}
      </footer>
    </main>
  );
}

export default AppShell;
