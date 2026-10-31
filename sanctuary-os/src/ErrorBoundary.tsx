import { Component, ErrorInfo, ReactNode } from "react";
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
      <div className="w-16 h-16 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] flex items-center justify-center mb-5 shadow-lg">
        <span className="material-symbols-outlined !text-[34px] text-[var(--danger)]">
          {t("icon_warning_amber", "warning_amber")}
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center mb-8 text-center gap-2.5">
        <span className="px-3 py-1 rounded-full bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] text-[10px] font-black uppercase tracking-widest">
          {moduleName || t("err_module_default", "Module")}
        </span>
        <h2 className="text-2xl font-black text-[var(--text)] capitalize tracking-[0.15em]">
          {t("err_module_fail", "Module Failure")}
        </h2>
        <p className="text-[var(--subtext)] text-xs max-w-lg leading-relaxed font-semibold">
          {t(
            "err_module_desc",
            "The module encountered a critical error. The rest of Sanctuary OS remains operational.",
          )}
        </p>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] w-full max-w-2xl max-h-[250px] overflow-auto custom-scrollbar relative z-10 flex flex-col transition-colors duration-500 hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]">
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-[color-mix(in_srgb,var(--danger)_10%,transparent)] shrink-0">
          <div className="flex gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_60%,transparent)]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"></div>
          </div>
          <span className="text-[10px] font-black capitalize tracking-[0.25em] text-[color-mix(in_srgb,var(--danger)_85%,transparent)] ml-1">
            {t("err_exception_trace", "Exception Trace")}
          </span>
          <span className="ml-auto material-symbols-outlined !text-[14px] text-[color-mix(in_srgb,var(--danger)_60%,transparent)]">
            {t("icon_code", "code")}
          </span>
        </div>
        <code className="text-[color-mix(in_srgb,var(--danger)_90%,transparent)] text-xs font-mono font-medium leading-relaxed whitespace-pre-wrap">
          {error?.toString()}
        </code>
      </div>

      <button
        onClick={resetErrorBoundary}
        className="mt-8 px-7 py-3.5 rounded-xl bg-transparent glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] text-xs font-black capitalize tracking-[0.18em] transition-all hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] hover:shadow-xl active:scale-95 flex items-center justify-center gap-2.5 relative z-10 group/btn cursor-pointer"
      >
        <span className="material-symbols-outlined !text-[18px] group-hover/btn:-rotate-180 transition-transform duration-700">
          {t("icon_restart_alt", "restart_alt")}
        </span>
        {t("err_reboot", "Reboot Module")}
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



