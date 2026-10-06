// ===== ERROR BOUNDARY =====
// A render error in one screen must not blank the whole app (or the Host page this Remote is mounted in).
// It shows what happened, lets the person retry, and resets itself when they navigate (resetKey).

import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[CaseManagement] A screen crashed:', error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 24px', textAlign: 'center', color: '#1e293b' }}>
        <AlertTriangle size={36} color="#dc2626" />
        <h2 style={{ margin: 0, fontSize: 18 }}>{this.props.title || 'Something went wrong on this screen'}</h2>
        <p style={{ margin: 0, maxWidth: 480, fontSize: 14, color: '#64748b' }}>
          The rest of the application is still working. You can try again, or go to another page.
        </p>
        {import.meta.env?.DEV && <pre style={{ maxWidth: 640, overflow: 'auto', fontSize: 12, color: '#b91c1c', textAlign: 'left' }}>{String(error?.stack || error)}</pre>}
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          Try again
        </button>
      </div>
    );
  }
}
