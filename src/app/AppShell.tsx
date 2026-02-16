import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  center: ReactNode;
  right: ReactNode;
  status: string;
}

function AppShell(props: AppShellProps) {
  return (
    <main className="app-shell">
      {props.sidebar}
      <section className="center-stage">{props.center}</section>
      {props.right}
      <footer className="status-bar">{props.status}</footer>
    </main>
  );
}

export default AppShell;
