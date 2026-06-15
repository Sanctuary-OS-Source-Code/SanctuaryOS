import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  onAssetClick?: (type: string, id: string) => void;
}

export default function MarkdownRenderer({ content, onAssetClick }: MarkdownRendererProps) {
  return (
    <div className="prose prose-invert max-w-none text-[var(--text)] opacity-90 leading-relaxed marker:text-[var(--accent)]">
      <ReactMarkdown urlTransform={(uri) => uri}
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-3xl font-black uppercase tracking-tighter mt-6 mb-4 theme-text-accent" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-2xl font-black uppercase tracking-tight mt-5 mb-3 text-[var(--text)]" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xl font-bold uppercase tracking-widest mt-4 mb-2 text-[var(--text)] opacity-90" {...props} />,
          p: ({ node, ...props }) => <p className="mb-4 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
          li: ({ node, ...props }) => <li className="pl-1" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 theme-border-accent pl-4 py-1 my-4 bg-white/5 rounded-r-lg italic opacity-80" {...props} />
          ),
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !content.includes('\n```');
            if (isInline) {
              return <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-sm theme-text-accent" {...props}>{children}</code>;
            }
            return (
              <div className="bg-black/40 border border-white/10 rounded-xl p-4 my-4 overflow-x-auto accent-scrollbar">
                <code className="font-mono text-sm text-[var(--subtext)]" {...props}>
                  {children}
                </code>
              </div>
            );
          },
          img: ({ node, src, alt, ...props }) => {
            return (
              <span className="block my-6 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg theme-glass-inner relative">
                <img src={src} alt={alt} className="w-full h-auto object-cover max-h-96" {...props} />
              </span>
            );
          },
          a: ({ node, href, children, ...props }: any) => {
            if (href && href.startsWith('asset://')) {
              const parts = href.replace('asset://', '').split('/');
              const type = parts[0];
              const id = parts[1];
              return (
                <span 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAssetClick?.(type, id); }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 my-1 rounded-xl theme-glass-inner border border-white/20 theme-text-accent text-xs font-black uppercase tracking-widest cursor-pointer shadow-md hover:scale-105 hover:bg-white/10 transition-all group"
                >
                  <span className="opacity-70 group-hover:opacity-100 transition-opacity flex items-center">
                    <span className="material-symbols-outlined !text-[16px]">
                      {type === 'mod' ? 'inventory_2' : type === 'blueprint' ? 'map' : type === 'lexicon' ? 'translate' : 'palette'}
                    </span>
                  </span>
                  {children}
                </span>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="theme-text-accent hover:underline font-bold" {...props}>
                {children}
              </a>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
