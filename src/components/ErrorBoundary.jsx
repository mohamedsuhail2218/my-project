import React from "react";
import { AlertTriangle, Home, RefreshCw, Trash2 } from "lucide-react";
import Brand from "./Brand";
import { clearCachedState } from "../data/initialState";

/**
 * Top-level error boundary. A render failure must never leave a blank page:
 * the operator gets a recovery surface, and workspace data stays intact.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // The console is the only sink in the browser build; a production adapter
    // would forward this to Sentry/OpenTelemetry.
    console.error("[ui] Unhandled render error", error, info?.componentStack);
  }

  reload = () => {
    window.location.reload();
  };

  clearCache = () => {
    clearCachedState();
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="auth-shell" style={{ gridTemplateColumns: "1fr" }} role="alert">
        <div className="auth-main">
          <div className="auth-card" style={{ maxWidth: 620 }}>
            <div style={{ marginBottom: 20 }}>
              <Brand />
            </div>
            <div className="eyebrow" style={{ color: "var(--critical)" }}>
              <AlertTriangle size={13} /> Recoverable error
            </div>
            <h1 className="mt-16">This screen failed to render.</h1>
            <p className="mt-12">
              The workspace is safe. Reload the page to re-enter the command center, or clear the local cache if the
              problem repeats.
            </p>
            <pre
              className="mono mt-16"
              style={{
                fontSize: 13,
                color: "var(--muted)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                overflow: "auto",
                maxHeight: 160,
              }}
            >
              {String(error?.message || error)}
            </pre>
            <div className="row mt-24">
              <button type="button" className="btn primary" onClick={this.reload}>
                <RefreshCw /> Reload workspace
              </button>
              <a className="btn outline" href="#/">
                <Home /> Public site
              </a>
              <button type="button" className="btn ghost" onClick={this.clearCache}>
                <Trash2 /> Clear local cache
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
