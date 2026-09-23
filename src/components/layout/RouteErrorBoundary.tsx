import { Component, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { House, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { Page } from './PageHeader';

interface RouteErrorBoundaryProps {
  resetKey: string;
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
  resetKey: string;
}

function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|importing a module script failed|failed to fetch|loading chunk/i.test(
    error.message,
  );
}

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const navigate = useNavigate();
  const chunk = isChunkLoadError(error);

  return (
    <Page width="narrow">
      <div role="alert" className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
        <span className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
          <TriangleAlert aria-hidden="true" className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold text-fg md:text-3xl">
          {chunk ? 'This page needs a refresh' : 'Something went wrong'}
        </h1>
        <p className="mt-2 max-w-md text-pretty text-fg-3">
          {chunk
            ? 'There might be a newer version of Cadence. Reload to keep going. Your data is safe on this device.'
            : 'This page crashed. Your data is safe, so try again or go back to Today.'}
        </p>
        {!chunk && error.message && (
          <code className="mt-4 max-w-full truncate rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-fg-3">
            {error.message}
          </code>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            variant="primary"
            icon={<RotateCcw aria-hidden="true" />}
            onClick={chunk ? () => window.location.reload() : onRetry}
          >
            {chunk ? 'Reload' : 'Try again'}
          </Button>
          <Button
            variant="secondary"
            icon={<House aria-hidden="true" />}
            onClick={() => {
              onRetry();
              navigate('/');
            }}
          >
            Back to Today
          </Button>
        </div>
      </div>
    </Page>
  );
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<RouteErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProps,
    state: RouteErrorBoundaryState,
  ): Partial<RouteErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) return <ErrorFallback error={error} onRetry={this.reset} />;
    return this.props.children;
  }
}
