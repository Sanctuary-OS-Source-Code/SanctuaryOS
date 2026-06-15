import React, { Component, ErrorInfo, ReactNode } from "react";
import { ViewHeader } from "./shared";
import { useLexicon } from "./LexiconContext";

interface Props {
  children?: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorBoundaryContent({ moduleName, error, resetErrorBoundary }: any) {
  const { t } = useLexicon();
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[500px] relative overflow-hidden group rounded-[2rem] border border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
      {/* Theme-Adaptive Glass Base */}
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_85%,#ef4444_5%)] backdrop-blur-3xl"></div>
      
      {/* Radial Red Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.05)_0%,transparent_70%)]"></div>
      
      {/* Cyber Grid Overlay (Adaptive opacity) */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: "linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)", backgroundSize: "30px 30px" }}></div>
      
      {/* Top & Bottom Edge Highlights */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-red-500/60 to-transparent shadow-[0_0_15px_rgba(239,68,68,0.5)]"></div>
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-red-500/10 to-transparent"></div>

      {/* Warning Icon with Pulse */}
      <div className="material-symbols-outlined !text-[80px] text-red-500 mb-6 drop-shadow-[0_0_25px_rgba(239,68,68,0.4)] relative z-10 animate-pulse">{t("ui_icon_warning") || "warning"}</div>
      
      <div className="relative z-10 flex flex-col items-center mb-8">
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-red-600 uppercase tracking-[0.4em] mb-3 drop-shadow-sm">{t("err_module_fail") || "Module Failure"}</h2>
        <div className="w-16 h-1 bg-red-500/40 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.4)] mb-6"></div>
        <p className="text-[var(--text)]/70 text-sm text-center max-w-lg leading-relaxed font-medium">
          The <strong className="text-red-500">{moduleName || "Module"}</strong> {t("err_module_desc") || "encountered a critical error. The rest of Sanctuary OS remains operational."}
        </p>
      </div>
      
      {/* Exception Trace Box */}
      <div className="bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-2xl p-6 rounded-2xl border border-red-500/20 w-full max-w-2xl max-h-[250px] overflow-auto custom-scrollbar shadow-[inset_0_0_30px_rgba(239,68,68,0.05)] relative z-10 flex flex-col group-hover:border-red-500/40 transition-colors duration-500">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-red-500/10">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]"></div>
            <div className="w-3 h-3 rounded-full bg-[var(--text)]/10"></div>
            <div className="w-3 h-3 rounded-full bg-[var(--text)]/10"></div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500/80">Exception Trace</span>
          <span className="ml-auto material-symbols-outlined !text-[14px] text-red-500/50">code</span>
        </div>
        <code className="text-red-500/90 text-xs font-mono leading-relaxed whitespace-pre-wrap">{error?.toString()}</code>
      </div>

      {/* Reboot Button */}
      <button 
        onClick={resetErrorBoundary}
        className="mt-10 px-10 py-4 rounded-2xl bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] backdrop-blur-2xl border border-red-500/30 hover:border-red-500 hover:bg-red-500/10 text-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.2)] hover:-translate-y-1 font-black text-[11px] uppercase tracking-[0.3em] transition-all duration-300 flex items-center gap-3 relative z-10 group/btn"
      >
        <span className="material-symbols-outlined !text-[20px] group-hover/btn:-rotate-180 transition-transform duration-700">restart_alt</span>
        {t("err_reboot") || "Reboot Module"}
      </button>
    </div>
  );
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
      return <ErrorBoundaryContent 
        moduleName={this.props.moduleName} 
        error={this.state.error} 
        resetErrorBoundary={() => this.setState({ hasError: false, error: null })} 
      />;
    }

    return this.props.children;
  }
}
