import React from 'react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/** Keep a render failure recoverable instead of leaving the whole shell blank. */
export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled application render error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-bg)] p-6">
        <section
          role="alert"
          className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-danger)]">应用发生异常</p>
          <h1 className="mt-2 text-lg font-semibold text-[var(--color-text)]">当前页面无法继续渲染</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            已保留本地数据。可以先重试当前页面；如果问题仍然存在，再重新加载应用。
          </p>
          <div className="mt-5 flex gap-2">
            <button className="btn-primary" onClick={this.reset} type="button">重试</button>
            <button className="btn-secondary" onClick={this.reload} type="button">重新加载</button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-text-tertiary)]">
              {this.state.error.message}
            </pre>
          )}
        </section>
      </main>
    );
  }
}
