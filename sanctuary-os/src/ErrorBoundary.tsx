import React, { Component, ErrorInfo, ReactNode } from "react";
import { ViewHeader } from "./shared";

interface Props {
  children?: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in module:", this.props.moduleName, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-black/20 border border-red-500/30 rounded-3xl p-8 animate-in fade-in zoom-in duration-500">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-black text-red-500 uppercase tracking-widest mb-2">Module Failure</h2>
          <p className="text-white/70 text-sm mb-6 text-center max-w-md">
            The <strong>{this.props.moduleName || "Module"}</strong> encountered a critical error. The rest of Sanctuary OS remains operational.
          </p>
          <div className="bg-black/40 p-4 rounded-xl border border-red-500/20 w-full max-w-lg overflow-auto">
            <code className="text-red-400 text-xs font-mono">{this.state.error?.toString()}</code>
          </div>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-6 px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold uppercase tracking-widest transition-all"
          >
            Reboot Module
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
