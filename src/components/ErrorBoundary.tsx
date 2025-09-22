'use client';

import React, { Component, ErrorInfo, ReactNode, useState } from 'react';
import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo
    });

    // Here you could also log the error to an error reporting service
    // this.logErrorToService(error, errorInfo);
  }

  private logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    // In a real application, you would send this to your error tracking service
    // Example: Sentry, LogRocket, custom API endpoint
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    console.log('Error logged to service:', errorData);
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  private renderErrorDetails() {
    const { error, errorInfo } = this.state;

    if (!error) return null;

    return (
      <details className="mt-4 text-left">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
          Error Details
        </summary>
        <div className="mt-2 p-3 bg-gray-100 rounded-md">
          <div className="space-y-2">
            <div>
              <span className="font-semibold text-gray-700">Error:</span>
              <code className="ml-2 text-sm text-red-600 bg-red-50 px-2 py-1 rounded">
                {error.message}
              </code>
            </div>
            {errorInfo && (
              <div>
                <span className="font-semibold text-gray-700">Component Stack:</span>
                <pre className="mt-1 text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                  {errorInfo.componentStack}
                </pre>
              </div>
            )}
            {process.env.NODE_ENV === 'development' && error.stack && (
              <div>
                <span className="font-semibold text-gray-700">Stack Trace:</span>
                <pre className="mt-1 text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                  {error.stack}
                </pre>
              </div>
            )}
          </div>
        </div>
      </details>
    );
  }

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-red-200 p-6">
            <div className="text-center">
              {/* Error Icon */}
              <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>

              {/* Security Badge */}
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-4">
                <Shield className="w-3 h-3 mr-1" />
                Protected by Error Boundary
              </div>

              {/* Error Title */}
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Something went wrong
              </h3>

              {/* Error Message */}
              <p className="text-gray-600 mb-6">
                We encountered an unexpected error. Don't worry, your data is safe and this has been logged.
              </p>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={this.handleRetry}
                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </button>

                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
                >
                  Reload Page
                </button>
              </div>

              {/* Error Details (Expandable) */}
              {this.renderErrorDetails()}

              {/* Support Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  If this problem persists, please contact support with the error details above.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Default fallback component for non-critical errors
interface ErrorFallbackProps {
  error: Error;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorFallback({ error, onRetry, compact = false }: ErrorFallbackProps) {
  if (compact) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-md">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-800 font-medium truncate">
              {error.message || 'An error occurred'}
            </p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex-shrink-0 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-red-800 mb-1">
            Operation Failed
          </h4>
          <p className="text-sm text-red-700 mb-2">
            {error.message || 'An unexpected error occurred during this operation.'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry Operation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook for error handling in functional components
interface UseErrorHandlerReturn {
  error: Error | null;
  setError: (error: Error | null) => void;
  handleError: (error: unknown, context?: string) => void;
  clearError: () => void;
  ErrorFallback: React.ComponentType<{ onRetry?: () => void }>;
}

export function useErrorHandler(): UseErrorHandlerReturn {
  const [error, setError] = useState<Error | null>(null);

  const handleError = (error: unknown, context?: string) => {
    console.error('Error caught by useErrorHandler:', { error, context });

    const errorObj = error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Unknown error');

    // Add context to error message if provided
    if (context) {
      errorObj.message = `${context}: ${errorObj.message}`;
    }

    setError(errorObj);
  };

  const clearError = () => setError(null);

  const ErrorFallbackComponent = ({ onRetry }: { onRetry?: () => void }) => (
    <ErrorFallback
      error={error!}
      onRetry={() => {
        clearError();
        onRetry?.();
      }}
    />
  );

  return {
    error,
    setError,
    handleError,
    clearError,
    ErrorFallback: ErrorFallbackComponent
  };
}