import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  image?: string;
  icon?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  isActive?: boolean;
  statusColor?: string; // e.g. var(--success), var(--danger)
}

export function GlassCard({ title, subtitle, image, icon, badges, actions, isActive = false, statusColor, className = '', ...props }: GlassCardProps) {
  const activeClass = isActive 
    ? 'border-[var(--accent)]/[30%] bg-[var(--accent)]/[10%] shadow-md' 
    : 'hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:scale-[1.02] shadow-sm hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)]';

  const statusBorder = statusColor ? `border-l-4` : '';

  return (
    <div 
      className={`group flex items-stretch gap-4 p-3 glass-surface transition-all duration-300 overflow-hidden cursor-pointer ${activeClass} ${statusBorder} ${className}`}
      style={statusColor ? { borderLeftColor: statusColor } : undefined}
      {...props}
    >
      {/* Visual / Icon Side */}
      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center">
        {image ? (
          <img src={image} alt={title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform duration-500" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <span className="material-symbols-outlined text-[32px] text-[var(--subtext)] opacity-50 group-hover:opacity-80 group-hover:text-[var(--accent)] transition-all">
            {icon || 'folder'}
          </span>
        )}
      </div>

      {/* Content Side */}
      <div className="flex flex-col justify-center flex-1 min-w-0 py-1">
        <h4 className="text-[12px] font-black uppercase tracking-widest text-[var(--text)] truncate mb-0.5 group-hover:text-[var(--accent)] transition-colors">
          {title}
        </h4>
        {subtitle && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
            {subtitle}
          </p>
        )}
        
        {badges && (
          <div className="flex items-center gap-1.5 mt-2 overflow-hidden">
            {badges}
          </div>
        )}
      </div>

      {/* Actions / Right Side */}
      {actions && (
        <div className="flex flex-col items-end justify-center shrink-0 pl-2">
          {actions}
        </div>
      )}
    </div>
  );
}
