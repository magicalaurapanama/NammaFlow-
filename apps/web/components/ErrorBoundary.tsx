'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card border-accent-red/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-accent-red mb-1">
                {this.props.fallbackTitle ?? 'Something went wrong'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {this.state.error?.message ?? 'An unexpected error occurred'}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded bg-surface-overlay hover:bg-surface-overlay/80 text-gray-300 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
