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
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[500px] relative overflow-hidden group rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] p-12">
      <div className="material-symbols-outlined !text-[80px] text-[color-mix(in_srgb,var(--danger)_80%,transparent)] mb-6 animate-pulse">{t("icon_warning_amber")}</div>
      
      <div className="relative z-10 flex flex-col items-center mb-8 text-center">
        <h2 className="text-3xl font-black text-[var(--text)] capitalize tracking-[0.2em] mb-4">{t("err_module_fail")}</h2>
        <p className="text-[var(--subtext)] text-sm max-w-lg leading-relaxed font-semibold">
          {t("auto_the")} <strong className="text-[var(--danger)]">{moduleName || (t("err_module_default"))}</strong> {t("err_module_desc")}
        </p>
      </div>
      
      <div className="glass-panel p-6 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] w-full max-w-2xl max-h-[250px] overflow-auto custom-scrollbar relative z-10 flex flex-col transition-colors duration-500 hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]">
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-[color-mix(in_srgb,var(--danger)_10%,transparent)] shrink-0">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[color-mix(in_srgb,var(--danger)_50%,transparent)]"></div>
            <div className="w-3 h-3 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"></div>
            <div className="w-3 h-3 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"></div>
          </div>
          <span className="text-[10px] font-black capitalize tracking-[0.3em] text-[color-mix(in_srgb,var(--danger)_80%,transparent)] ml-2">{t("err_exception_trace")}</span>
          <span className="ml-auto material-symbols-outlined !text-[14px] text-[color-mix(in_srgb,var(--danger)_50%,transparent)]">{t("icon_code")}</span>
        </div>
        <code className="text-[color-mix(in_srgb,var(--danger)_90%,transparent)] text-xs font-mono font-medium leading-relaxed whitespace-pre-wrap">{error?.toString()}</code>
      </div>

      <button 
        onClick={resetErrorBoundary}
        className="mt-10 px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] text-xs font-black capitalize tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-3 relative z-10 group/btn"
      >
        <span className="material-symbols-outlined !text-[18px] group-hover/btn:-rotate-180 transition-transform duration-700">{t("icon_restart_alt")}</span>
        {t("err_reboot")}
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



