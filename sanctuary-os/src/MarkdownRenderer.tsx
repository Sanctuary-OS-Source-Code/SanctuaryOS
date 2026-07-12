import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useLexicon } from './LexiconContext';
import { useModalStore } from './store/modalStore';
import { openUrl } from '@tauri-apps/plugin-opener';

interface MarkdownRendererProps {
  content: string;
  onAssetClick?: (type: string, id: string) => void;
  isAlert?: boolean;
}

export default function MarkdownRenderer({ content, onAssetClick, isAlert }: MarkdownRendererProps) {
  const { t } = useLexicon();
  const { useInternalBrowser, setSideBrowserUrl, setIsSideBrowserOpen } = useModalStore();
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const processedContent = content.replace(/\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/gi, '![](icon://$1)');

  return (
    <div className="prose prose-invert max-w-none text-[var(--text)] opacity-90 leading-relaxed marker:text-[var(--accent)]">
      <ReactMarkdown urlTransform={(uri) => uri}
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ node, ...props }) => <h1 className={`text-3xl font-black uppercase tracking-tighter mt-6 mb-4 ${isAlert ? 'text-[var(--danger)]' : 'theme-text-accent'}`} {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-2xl font-black uppercase tracking-tight mt-5 mb-3 text-[var(--text)]" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xl font-bold uppercase tracking-widest mt-4 mb-2 text-[var(--text)] opacity-90" {...props} />,
          p: ({ node, ...props }) => <p className="mb-4 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
          li: ({ node, ...props }) => <li className="pl-1" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 theme-border-accent pl-4 py-1 my-4 bg-white/5 rounded-r-lg italic opacity-80" {...props} />
          ),
          hr: ({ node, ...props }) => <hr className="my-8 border-white/10" {...props} />,
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !content.includes('\n```');
            if (isInline) {
              return <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-sm theme-text-accent" {...props}>{children}</code>;
            }
            return (
              <div className="bg-black/40 border border-white/10 rounded-xl p-4 my-4 overflow-x-auto accent-scrollbar relative group">
                <button 
                  onClick={() => navigator.clipboard.writeText(String(children))} 
                  className="absolute top-2 right-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--subtext)] hover:text-[var(--text)] transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer"
                  title={t("ctx_copy") || "Copy"}
                >
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_content_copy") || "content_copy"}</span>
                </button>
                <code className="font-mono text-sm text-[var(--subtext)] block pr-8" {...props}>
                  {children}
                </code>
              </div>
            );
          },
          img: ({ node, src, alt, ...props }) => {
            if (src && src.startsWith('icon://')) {
              const iconName = src.replace('icon://', '');
              return <span className="material-symbols-outlined !text-[inherit] align-middle opacity-90 mx-0.5" title={alt || iconName}>{iconName}</span>;
            }
            const isExpanded = expandedImage === src;
            return (
              <span 
                className={`group block my-6 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg theme-glass-inner relative cursor-pointer transition-all duration-500`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedImage(isExpanded ? null : (src || null)); }}
              >
                <img src={src} alt={alt} className={`w-full object-cover transition-all duration-500 ${isExpanded ? 'max-h-none' : 'max-h-96 group-hover:scale-105 group-hover:blur-[2px]'}`} {...props} />
                {!isExpanded && (
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                    <span className="material-symbols-outlined !text-5xl text-white drop-shadow-xl scale-50 group-hover:scale-100 transition-transform duration-500 ease-out">fullscreen</span>
                  </span>
                )}
                {isExpanded && (
                  <span className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 rounded-full w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none backdrop-blur-md border border-white/10">
                    <span className="material-symbols-outlined text-white">close_fullscreen</span>
                  </span>
                )}
              </span>
            );
          },
          a: ({ node, href, children, ...props }: any) => {
            if (href && href.startsWith('asset://')) {
              const parts = href.replace('asset://', '').split('/');
              const type = parts[0];
              const id = parts[1];
              const cleanChildren = React.Children.toArray(children).map(c => typeof c === 'string' ? c.replace(/^[\s:]+/, '') : c);
              return (
                <span 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAssetClick?.(type, id); }}
                  className="my-2 mx-1 group relative inline-flex flex-row items-center justify-between gap-3 p-4 px-5 rounded-[var(--radius)] border theme-glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5 hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-2xl backdrop-blur-2xl transition-all cursor-pointer hover:scale-[1.01] w-[calc(100%-0.5rem)] sm:w-[calc(50%-0.5rem)] align-top no-underline"
                >
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-black text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors drop-shadow-sm flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:opacity-100 transition-opacity">
                        {type === 'mod' ? 'inventory_2' : type === 'blueprint' ? 'map' : type === 'lexicon' ? 'translate' : 'palette'}
                      </span>
                      {cleanChildren}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-1.5 shrink-0 bg-black/20 px-2 py-0.5 rounded-md">
                         <span>{type.toUpperCase()}</span>
                         <span className="opacity-50">•</span>
                         <span>{t("attached_asset") || "ATTACHED ASSET"}</span>
                      </span>
                    </span>
                  </span>
                  <span className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0 group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] transition-all shadow-inner">
                    <span className="material-symbols-outlined !text-[16px]">arrow_forward</span>
                  </span>
                </span>
              );
            }
            return (
              <a 
                href={href} 
                onClick={(e) => {
                  e.preventDefault();
                  if (href) {
                    if (useInternalBrowser) {
                      setSideBrowserUrl(href);
                      setIsSideBrowserOpen(true);
                    } else {
                      openUrl(href).catch(err => console.error("Failed to open URL externally", err));
                    }
                  }
                }}
                className="theme-text-accent hover:underline font-bold cursor-pointer" 
                {...props}
              >
                {children}
              </a>
            );
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
