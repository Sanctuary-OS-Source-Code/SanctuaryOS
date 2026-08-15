import React from 'react';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function GlassButton({ children, icon, variant = 'secondary', size = 'md', className = '', ...props }: GlassButtonProps) {
  const baseClass = "relative inline-flex items-center justify-center gap-2 font-black capitalize tracking-widest rounded-lg transition-all duration-200 overflow-hidden backdrop-blur-md border disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 hover:scale-[1.02] active:scale-95";
  
  const variants = {
    primary: "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]",
    secondary: "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]",
    danger: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]",
    success: "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]",
    ghost: "bg-transparent border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-4 py-2 text-[11px]",
    lg: "px-6 py-3 text-[12px]"
  };

  return (
    <button className={`${baseClass} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {icon && <span className={`material-symbols-outlined shrink-0 ${size === 'sm' ? '!text-[14px]' : size === 'lg' ? '!text-[20px]' : '!text-[16px]'}`}>{icon}</span>}
      {children}
    </button>
  );
}

export function GlassIconButton({ icon, variant = 'secondary', size = 'md', className = '', ...props }: Omit<GlassButtonProps, 'children'> & { icon: string }) {
  const baseClass = "relative inline-flex items-center justify-center rounded-lg transition-all duration-200 overflow-hidden backdrop-blur-md border disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.05] active:scale-95";
  
  const variants = {
    primary: "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]",
    secondary: "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
    danger: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]",
    success: "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]",
    ghost: "bg-transparent border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
  };

  const sizes = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10"
  };

  const iconSizes = {
    sm: "!text-[14px]",
    md: "!text-[16px]",
    lg: "!text-[20px]"
  };

  return (
    <button className={`${baseClass} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      <span className={`material-symbols-outlined ${iconSizes[size]}`}>{icon}</span>
    </button>
  );
}


