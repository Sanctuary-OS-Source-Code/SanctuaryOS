import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SidePanel, standardButtonClass, standardAccentGlassButtonClass } from './shared';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';

interface CodeSnippetSidebarProps {
  code: string;
  onClose: () => void;
  widthClass?: string;
}

export default function CodeSnippetSidebar({ code, onClose, widthClass = "w-[50vw] max-w-4xl" }: CodeSnippetSidebarProps) {
  const { t } = useLexicon();
  const [wrapText, setWrapText] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const matchCount = searchTerm ? (code.match(new RegExp(escapeRegExp(searchTerm), 'gi')) || []).length : 0;

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("feed_code_snippet") || "CODE SNIPPET"}
      icon="data_object"
      panelZ="z-[60001]"
      backdropZ="z-[60000]"
      isResizable={true}
      defaultWidth={575}
      footer={
        <div className="flex items-center justify-center w-full gap-4">
          <button 
            onClick={onClose} 
            className={standardButtonClass}
          >
            {t("ui_btn_close") || "CLOSE"}
          </button>
          <button 
            onClick={() => { navigator.clipboard.writeText(code); useStore.getState().pushStatus(t("alert_copied") || "Copied to clipboard!"); }} 
            className={standardAccentGlassButtonClass}
          >
            <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_content_copy") || "content_copy"}</span> {t("ui_btn_copy_all") || "COPY ALL"}
          </button>
        </div>
      }
    >
      <div className="flex-1 overflow-hidden p-2 lg:p-2 flex flex-col gap-6">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 relative w-1/2 max-w-md">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-[18px] opacity-50 z-10">{t("ui_icon_search") || "search"}</span>
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              placeholder={t("ui_placeholder_search_code") || "Search code snippet..."}
              className="w-full h-10 theme-glass-inner rounded-xl pl-12 pr-12 text-[12px] font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all relative z-0"
            />
            {searchTerm && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
                <span className="text-[10px] font-black text-[var(--subtext)] opacity-70 bg-black/20 px-2 py-0.5 rounded-md border border-white/5">{matchCount}</span>
                <button onClick={() => setSearchTerm("")} className="text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                  <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_close") || "close"}</span>
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setWrapText(!wrapText)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${wrapText ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-inner' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}
            >
              <span className="material-symbols-outlined !text-[14px]">{wrapText ? 'wrap_text' : 'segment'}</span>
              {t("ui_btn_wrap_text") || "WRAP TEXT"}
            </button>
          </div>
        </div>

        {/* Code Container */}
        <div className="w-full flex-1 min-h-0 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 backdrop-blur-xl flex flex-col relative">
          <div className="absolute top-0 left-0 w-1 h-full theme-bg-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)] z-10 pointer-events-none" />
          
          <div className="flex-1 overflow-auto custom-scrollbar relative z-0">
            {!searchTerm ? (
              <SyntaxHighlighter 
                language="javascript" 
                style={vscDarkPlus} 
                showLineNumbers={!wrapText}
                codeTagProps={wrapText ? { style: { wordBreak: 'break-all', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' } } : undefined}
                customStyle={{ 
                  margin: 0, 
                  padding: '2rem', 
                  background: 'transparent', 
                  fontSize: '13px', 
                  lineHeight: '1.6', 
                  minHeight: '100%',
                  ...(wrapText ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'anywhere' } : {})
                }}
              >
                {code}
              </SyntaxHighlighter>
            ) : (
              <pre className="m-0 p-8 bg-transparent text-[13px] leading-[1.6] text-[#d4d4d4] font-mono" style={{ whiteSpace: wrapText ? 'pre-wrap' : 'pre', wordBreak: wrapText ? 'break-all' : 'normal', overflowWrap: 'anywhere' }}>
                {code.split(new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi')).map((part, i) => 
                  part.toLowerCase() === searchTerm.toLowerCase() ? 
                    <mark key={i} className="bg-[var(--accent)]/30 border border-[var(--accent)]/50 text-white font-black px-1 py-0.5 rounded-md shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)] backdrop-blur-sm">{part}</mark> : 
                    <span key={i}>{part}</span>
                )}
              </pre>
            )}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
