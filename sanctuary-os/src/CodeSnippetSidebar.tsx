import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SidePanel } from './shared';
import { useLexicon } from './LexiconContext';

interface CodeSnippetSidebarProps {
  code: string;
  onClose: () => void;
  widthClass?: string;
}

export default function CodeSnippetSidebar({ code, onClose, widthClass = "w-[50vw] max-w-4xl" }: CodeSnippetSidebarProps) {
  const { t } = useLexicon();

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("feed_code_snippet") || "CODE SNIPPET"}
      icon="data_object"
      panelZ="z-[60001]"
      backdropZ="z-[60000]"
      widthClass={widthClass}
      footer={
        <div className="w-full flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] font-black text-[10px] uppercase tracking-widest transition-all"
          >
            {t("ui_btn_close") || "CLOSE"}
          </button>
          <button 
            onClick={() => { navigator.clipboard.writeText(code); alert(t("alert_copied") || "Copied to clipboard!"); }} 
            className="px-8 py-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] theme-text-accent font-black text-[10px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] flex items-center gap-2"
          >
            <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_content_copy") || "content_copy"}</span> {t("ui_btn_copy_all") || "COPY ALL"}
          </button>
        </div>
      }
    >
      <div className="flex-1 overflow-auto custom-scrollbar p-6 lg:p-10">
        <div className="w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 backdrop-blur-xl flex flex-col relative">
          <div className="absolute top-0 left-0 w-1 h-full theme-bg-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)] z-10" />
          <div className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest text-white/50 pointer-events-none z-10">
            {t("feed_code_snippet") || "CODE SNIPPET"}
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar relative z-0">
            <SyntaxHighlighter 
              language="javascript" 
              style={vscDarkPlus} 
              showLineNumbers 
              customStyle={{ margin: 0, padding: '2rem', background: 'transparent', fontSize: '13px', lineHeight: '1.6', minHeight: '100%' }}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
