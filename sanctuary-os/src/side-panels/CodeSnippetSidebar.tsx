import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from '../shared';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';

interface CodeSnippetSidebarProps {
  code: string;
  title?: string;
  onClose: () => void;
  widthClass?: string;
}

export default function CodeSnippetSidebar({ code, title, onClose, widthClass = "w-[50vw] max-w-4xl" }: CodeSnippetSidebarProps) {
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
      title={title || t("code_snippet")}
      icon="data_object"
      panelZ="z-[60001]"
      backdropZ="z-[60000]"
      isResizable={true}
      defaultWidth={750}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton 
            icon={t("icon_content_copy")}
            tooltip={t("ui_btn_copy_all") || "Copy All"}
            onClick={() => { navigator.clipboard.writeText(code); useStore.getState().pushStatus(t("alert_copied")); }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex-1 overflow-hidden p-2 lg:p-2 flex flex-col gap-6">
        
        <div className="flex flex-col md:flex-row items-center justify-between w-full shrink-0 gap-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 rounded-2xl backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-2 relative flex-1 w-full max-w-2xl">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text)] text-[20px] opacity-50 z-10">{t("icon_search")}</span>
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              placeholder={t("ui_placeholder_search_code")}
              className="w-full h-12 bg-black/20 rounded-xl pl-12 pr-12 text-[13px] font-bold text-[var(--text)] focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] border border-transparent focus:bg-black/40 transition-all shadow-inner relative z-0 focus:shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]"
            />
            {searchTerm && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3 z-10">
                <span className="text-[11px] font-black text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] px-2.5 py-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-sm">{matchCount} matches</span>
                <button onClick={() => setSearchTerm("")} className="w-6 h-6 flex items-center justify-center rounded-md bg-black/30 text-[var(--subtext)] hover:text-white hover:bg-black/50 transition-colors">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={() => setWrapText(!wrapText)}
              className={`flex items-center justify-center gap-2 h-12 px-6 rounded-xl text-xs font-black capitalize tracking-widest transition-all flex-1 md:flex-none ${wrapText ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'bg-black/20 text-[var(--subtext)] hover:text-[var(--text)] border border-transparent hover:bg-black/40 hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}
            >
              <span className="material-symbols-outlined !text-[18px]">{wrapText ? 'wrap_text' : 'segment'}</span>
              {t("ui_btn_wrap_text")}
            </button>
          </div>
        </div>

        <div className="w-full flex-1 min-h-0 rounded-2xl overflow-hidden shadow-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-xl flex flex-col relative">
          
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
                    <mark key={i} className="bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-white font-black px-1 py-0.5 rounded-md shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)] backdrop-blur-sm">{part}</mark> : 
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


