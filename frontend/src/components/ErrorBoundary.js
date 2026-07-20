import React from "react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-6 animate-pulse">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "Outfit" }}>Something went wrong</h1>
          <p className="text-sm text-slate-500 max-w-md mb-6">
            An unexpected error occurred. Please try reloading the page. If the issue persists, contact support.
          </p>
          {this.state.error && (
            <pre className="text-left text-xs bg-slate-100 text-slate-600 p-4 rounded-lg max-w-lg overflow-auto mb-6 max-h-40 w-full border border-slate-200 font-mono">
              {this.state.error.toString()}
            </pre>
          )}
          <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700">
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
