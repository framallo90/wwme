import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
  onGoEditor: () => void;
  onRetry: () => void;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      error,
      copied: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly handleCopyError = async (): Promise<void> => {
    const message = this.state.error?.stack || this.state.error?.message || 'Error de render sin detalle.';
    try {
      await navigator.clipboard.writeText(message);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message || 'Error de renderizado inesperado.';
    return (
      <section className="app-error-boundary" role="alert" aria-live="assertive">
        <h2>Se detecto un error en la vista activa</h2>
        <p className="muted">{message}</p>
        <p className="muted">
          El texto en disco no se pierde, pero esta vista se recupera mejor con reinicio controlado.
        </p>
        <div className="app-error-boundary-actions">
          <button type="button" onClick={this.props.onGoEditor}>
            Volver al editor
          </button>
          <button type="button" onClick={this.props.onRetry}>
            Reintentar vista
          </button>
          <button type="button" onClick={() => { void this.handleCopyError(); }}>
            {this.state.copied ? 'Error copiado' : 'Copiar error'}
          </button>
        </div>
      </section>
    );
  }
}

export default AppErrorBoundary;
