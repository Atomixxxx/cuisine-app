import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logger } from '../../services/logger';
import { reportError } from '../../services/errorTracking';

interface SectionErrorBoundaryProps {
  section: string;
  children: ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Section crash', {
      section: this.props.section,
      error,
      componentStack: info.componentStack,
    });
    reportError(error, {
      section: this.props.section,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-page-wrap py-8">
        <div className="glass-card glass-panel rounded-2xl p-5 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-[color:var(--app-warning)]/15 text-[color:var(--app-warning)] flex items-center justify-center">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          </div>
          <h2 className="ios-title3 app-text">{this.props.section} indisponible</h2>
          <p className="ios-body app-muted">
            Une erreur est survenue dans cette section.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-xl app-accent-bg ios-body font-semibold active:opacity-70"
            >
              Reessayer
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              className="px-4 py-2 rounded-xl app-surface-2 app-text ios-body font-semibold active:opacity-70"
            >
              Retour accueil
            </button>
          </div>
        </div>
      </div>
    );
  }
}

