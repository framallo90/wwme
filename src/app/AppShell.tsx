import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  center: ReactNode;
  right: ReactNode;
  status: string;
  focusMode?: boolean;
}

function AppShell(props: AppShellProps) {
  return (
    <main className={`app-shell ${props.focusMode ? 'is-focus-mode' : ''}`}>
      {props.focusMode ? null : props.sidebar}
      <section className="center-stage">{props.center}</section>
      {props.focusMode ? null : props.right}
      <footer className="status-bar" role="status" aria-live="polite">
        {props.status}
      </footer>
    </main>
  );
}

export default AppShell;
