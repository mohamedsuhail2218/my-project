import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('NetPulse UI error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-app p-6">
          <div className="panel max-w-lg p-8 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-danger/40 bg-danger/10 text-danger">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <h1 className="font-display text-2xl text-app">The interface hit an unexpected error</h1>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Your monitoring data is safe. Reload the page to recover the dashboard. If the issue repeats, check the browser console and backend logs.
            </p>
            <pre className="mt-4 max-h-24 overflow-auto border border-app bg-black/40 p-3 text-left font-mono text-[10px] text-danger">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button onClick={() => window.location.reload()} className="btn-primary mt-5">
              <RotateCcw className="h-4 w-4" /> Reload application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
