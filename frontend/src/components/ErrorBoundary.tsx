import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: 'var(--ink)', background: 'var(--canvas)', minHeight: '100vh' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: 12 }}>Something went wrong</h2>
          <p>Reload the page or try again. If the problem continues, contact the BowlSense owner.</p>
          {import.meta.env.DEV && (
            <pre style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 10, padding: 16, fontSize: 12, overflowX: 'auto', color: 'var(--danger)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          )}
          <button
            onClick={() => this.setState({ error: null })}
            className="btn btn-primary"
            style={{ marginTop: 16 }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
