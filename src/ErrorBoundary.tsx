import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          backgroundColor: '#141413',
          color: 'white',
          padding: '40px',
          fontFamily: 'monospace',
          minHeight: '100vh'
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '20px' }}>⚠️ Something went wrong</h1>
          <details style={{ whiteSpace: 'pre-wrap', marginBottom: '20px' }}>
            <summary style={{ cursor: 'pointer', marginBottom: '10px', fontSize: '18px' }}>
              Error Details (click to expand)
            </summary>
            <div style={{
              backgroundColor: '#1f1f1f',
              padding: '20px',
              borderRadius: '8px',
              overflow: 'auto'
            }}>
              <h3 style={{ color: '#fbbf24' }}>Error Message:</h3>
              <p style={{ color: '#ef4444' }}>{this.state.error?.toString()}</p>

              <h3 style={{ color: '#fbbf24', marginTop: '20px' }}>Stack Trace:</h3>
              <pre style={{ color: '#9ca3af', fontSize: '12px' }}>
                {this.state.error?.stack}
              </pre>

              {this.state.errorInfo && (
                <>
                  <h3 style={{ color: '#fbbf24', marginTop: '20px' }}>Component Stack:</h3>
                  <pre style={{ color: '#9ca3af', fontSize: '12px' }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
