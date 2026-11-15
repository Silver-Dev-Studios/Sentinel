import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a render error inside one page. React unmounts the whole tree on an
 * uncaught error, so without this a single broken page leaves every other
 * route blank until the user hard-reloads.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Card className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-rose-400">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-semibold">This page failed to render</span>
        </div>
        <p className="text-sm text-sentinel-muted">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-1.5 text-xs text-sentinel-muted transition hover:bg-sentinel-border/40"
        >
          Try again
        </button>
      </Card>
    );
  }
}
