import React from 'react';
import { Button } from '../design-system/components';
import './ErrorBoundary.css';

/**
 * A crash must be visible and recoverable.
 *
 * The project autosave is deliberately left alone here: if a malformed script
 * is what caused the crash, clearing storage would be the right fix, but doing
 * it automatically would also throw away an hour of tagging when the cause was
 * a render bug. The user is given both choices.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('BreakCraft crashed:', error, info);
    this.setState({ info });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary__card">
          <h1>Something broke</h1>
          <p>
            BreakCraft hit an error it could not recover from. Your work is still in local
            storage — reloading usually restores it.
          </p>
          <pre className="error-boundary__detail">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="error-boundary__actions">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                localStorage.removeItem('breakcraft:autosave');
                window.location.reload();
              }}
            >
              Discard saved project and reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
