import React from 'react';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'dense' | 'flat' | 'navbar' | 'sidebar' | 'statusbar';
}

export function GlassPanel({ children, className = '', variant = 'default', ...props }: GlassPanelProps) {
  const baseClass = "bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_6%,transparent)] rounded-[var(--radius,1rem)] shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-2xl text-[var(--text)] overflow-hidden";
  
  const variants = {
    default: "p-6",
    dense: "p-4",
    flat: "p-0 shadow-none border-transparent bg-[color-mix(in_srgb,var(--text)_2%,transparent)]",
    navbar: "p-0 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-b border-t-0 border-x-0 !rounded-none",
    sidebar: "p-0 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-r border-y-0 border-l-0 !rounded-none",
    statusbar: "p-0 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-t border-b-0 border-x-0 !rounded-none"
  };

  return (
    <div className={`${baseClass} ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
