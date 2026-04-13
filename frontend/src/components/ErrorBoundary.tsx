'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

// Class component required because React only supports error boundaries
// as class components (hooks cannot catch render errors).
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the error in the console with component stack for debugging.
    // In production this is where you'd send to Sentry / Datadog.
    console.error('[ErrorBoundary] Render error', error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-8">
          <div className="border border-[#1a1a1a] p-8 max-w-md w-full text-center space-y-4">
            <div className="text-2xl">⚡</div>
            <h2 className="text-sm font-bold tracking-widest uppercase">Something went wrong</h2>
            <p className="text-[10px] text-[#555] font-mono break-all">
              {this.state.error?.message ?? 'Unknown render error'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-[#26D962] text-[#26D962] hover:bg-[#26D962] hover:text-black transition-all"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-[#333] text-[#555] hover:border-white hover:text-white transition-all"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
