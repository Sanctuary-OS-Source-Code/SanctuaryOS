import React from "react";
import { useLexicon } from "../../LexiconContext";
import { HoverTooltip } from "../../shared";

export interface UniversalCardProps {
  layout?: "vertical" | "horizontal" | "compact" | "vertical-compact" | "stat";
  isActive?: boolean;
  isGhosted?: boolean;
  isDisabled?: boolean;
  statusColor?: string; // Tailwind class, e.g., 'border-emerald-500' or hex color if needed. We'll stick to classes mostly, or explicit hex.
  
  // Media
  image?: string;
  icon?: string;
  customIcon?: React.ReactNode;
  
  // Content
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  
  // Slots
  badges?: React.ReactNode;
  imageOverlay?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  
  // Events
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  
  className?: string;
  style?: React.CSSProperties;
}

export type UniversalCardComponentProps = UniversalCardProps & Omit<React.HTMLAttributes<HTMLDivElement>, keyof UniversalCardProps>;

export function UniversalCard({
  layout = "vertical",
  isActive = false,
  isGhosted = false,
  isDisabled = false,
  statusColor,
  image,
  icon,
  customIcon,
  title,
  subtitle,
  badges,
  imageOverlay,
  actions,
  footer,
  children,
  onClick,
  onContextMenu,
  className = "",
  style,
  ...restProps
}: UniversalCardComponentProps) {
  const { t } = useLexicon();
  
  // Base classes for the container
  let layoutClasses = "";
  let imageContainerClasses = "";
  let contentClasses = "";
  
  switch (layout) {
    case "horizontal":
      layoutClasses = "flex-row items-center min-h-[112px]";
      imageContainerClasses = "w-32 self-stretch";
      contentClasses = "flex-col justify-center p-4 pr-6";
      break;
    case "vertical-compact":
      layoutClasses = "flex-col h-full";
      imageContainerClasses = "w-full h-28";
      contentClasses = "flex-col p-5 pt-6";
      break;
    case "compact":
      layoutClasses = "flex-row items-center p-4 min-h-[72px] gap-4";
      imageContainerClasses = "w-12 h-12 rounded-[max(0px,calc(var(--radius)-4px))] overflow-hidden shrink-0";
      contentClasses = "flex-col justify-center";
      break;
    case "stat":
      layoutClasses = "flex-col items-center justify-center p-5 text-center min-h-[120px]";
      imageContainerClasses = "hidden";
      contentClasses = "flex-col items-center justify-center w-full gap-2";
      break;
    case "vertical":
    default:
      layoutClasses = "flex-col h-full";
      imageContainerClasses = "w-full h-40";
      contentClasses = "flex-col p-6";
      break;
  }

  const activeClasses = isActive ? "theme-border-accent bg-[var(--accent)]/[15%] shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)]" : `${statusColor ? statusColor : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'} bg-[color-mix(in_srgb,var(--text)_2%,transparent)]`;
  
  // For ghosted or disabled states
  const opacityClasses = isGhosted ? "opacity-50 grayscale-[0.8]" : isDisabled ? "opacity-50 cursor-not-allowed grayscale" : "";

  // The hover effect
  const hoverClasses = !isDisabled ? "hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover/card:shadow-[0_20px_50px_rgba(0,0,0,0.3)] group-hover:theme-border-accent" : "";

  const containerClasses = `glass-panel flex group border transition-all duration-500 relative overflow-hidden ${activeClasses} ${opacityClasses} ${hoverClasses} ${layoutClasses} ${onClick ? 'cursor-pointer' : ''} ${className}`;

  // Image / Icon rendering
  const renderMedia = () => {
    if (!image && !icon && !customIcon) return null;
    
    // For compact, we don't have the big abstract background
    if (layout === "compact") {
      return (
        <div className={`relative flex items-center justify-center glass-surface shadow-inner border border-white/5 ${imageContainerClasses}`}>
          {image ? (
            <img src={image} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
          ) : customIcon ? (
            customIcon
          ) : (
            <span className="material-symbols-outlined text-[20px] text-[var(--subtext)] opacity-70 group-hover:text-[var(--accent)] transition-colors">{icon}</span>
          )}
        </div>
      );
    }

    if (layout === "stat") {
      return (
        <div className="flex items-center justify-center shrink-0 mb-1 relative z-10">
          {customIcon ? customIcon : (
            <span className={`material-symbols-outlined !text-[22px] transition-colors ${isActive ? 'theme-text-accent opacity-100' : 'opacity-50 group-hover:opacity-80'}`}>{icon}</span>
          )}
        </div>
      );
    }
    
    return (
      <div className={`relative flex flex-col items-center justify-center shrink-0 overflow-hidden ${imageContainerClasses} ${layout === 'horizontal' ? 'bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)]' : 'bg-[var(--sidebar)]'}`}>
          {image ? (
            <img src={image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-transparent flex items-center justify-center transition-colors duration-500" style={{ backgroundImage: `linear-gradient(to bottom right, color-mix(in srgb, var(--accent) 10%, transparent), transparent)` }}>
              {(layout === 'vertical' || layout === 'vertical-compact') && <div className="absolute top-0 right-0 w-32 h-32 rounded-[var(--radius)] blur-[30px] pointer-events-none mix-blend-screen" style={{ backgroundColor: `color-mix(in srgb, var(--accent) 10%, transparent)` }} />}
              {customIcon ? customIcon : (
                <span className={`material-symbols-outlined opacity-60 group-hover:opacity-100 theme-text-accent transition-all duration-500 drop-shadow-lg group-hover:scale-110 relative z-10 ${layout === 'horizontal' ? '!text-[36px]' : layout === 'vertical-compact' ? '!text-[48px]' : '!text-[72px]'}`}>
                  {icon || "folder"}
                </span>
              )}
            </div>
          )}
          {imageOverlay}
        </div>
    );
  };

  return (
    <div 
      className={containerClasses} 
      onClick={isDisabled ? undefined : onClick}
      onContextMenu={isDisabled ? undefined : onContextMenu}
      style={style}
      {...restProps}
    >
      {/* Background Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[var(--bg)]/5 to-transparent group-hover:from-[var(--accent)]/5 transition-colors duration-500 pointer-events-none z-0" />

      {/* Floating or Inline Actions */}
      {actions && layout !== 'horizontal' && layout !== 'compact' && (
        <div className="absolute z-[70] top-3 right-3 flex items-center gap-2">
          {actions}
        </div>
      )}

      {/* Main Content Layout */}
      {renderMedia()}
      
      {/* Dividers */}
      {(image || icon || customIcon) && (layout === 'vertical' || layout === 'vertical-compact') && <div className="relative h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full flex items-center justify-center z-10 shrink-0" />}
      {(image || icon || customIcon) && layout === 'horizontal' && <div className="relative w-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-full flex items-center justify-center z-10 shrink-0" />}
      
      <div className={`flex flex-1 min-w-0 relative z-10 self-stretch ${contentClasses}`}>
        {/* Title & Subtitle */}
        <div className={`flex flex-col gap-1 w-full min-w-0 ${layout === 'stat' ? 'items-center' : ''}`}>
          
          {subtitle && layout === 'stat' && (
            <div className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest font-mono">
              {subtitle}
            </div>
          )}

          <div className={`flex items-center gap-2 min-w-0 w-full ${layout === 'stat' ? 'justify-center' : ''} relative group/title`}>
            <span className={`flex-1 min-w-0 block ${layout === 'compact' ? 'text-sm truncate' : layout === 'horizontal' ? 'text-sm truncate' : layout === 'vertical-compact' ? 'text-base truncate' : layout === 'stat' ? 'text-base' : 'text-xl truncate'} font-black text-[var(--text)] uppercase tracking-tighter leading-tight group-hover:theme-text-accent transition-colors`}>
              {title}
            </span>
            {layout !== 'stat' && typeof title === 'string' && (
              <HoverTooltip title={title} variant="default" noIcon={true} className="!hidden group-hover/title:!flex !bottom-[calc(100%+4px)] !left-0 !translate-x-0 z-[200]" />
            )}
          </div>
          
          {subtitle && layout !== 'stat' && (
            <div className={`text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest font-mono line-clamp-2 relative group/subtitle w-max max-w-full`}>
              {subtitle}
              {typeof subtitle === 'string' && (
                <HoverTooltip title={subtitle} variant="default" noIcon={true} className="!hidden group-hover/subtitle:!flex !bottom-[calc(100%+4px)] !left-0 !translate-x-0 z-[200]" />
              )}
            </div>
          )}
        </div>
        
        {/* Badges / Extras inline (especially useful for horizontal/compact) */}
        {badges && (
          <div className={`flex flex-wrap items-center gap-2 ${layout === 'vertical-compact' ? 'mt-auto pt-2' : 'mt-2'}`}>
            {badges}
          </div>
        )}
        
        {/* Children (Custom Body content) */}
        {children && (
          <div className="mt-3 w-full flex flex-col">
            {children}
          </div>
        )}
      </div>

      {/* Inline Actions for horizontal/compact */}
      {actions && (layout === 'horizontal' || layout === 'compact') && (
        <div className="relative z-50 flex items-center gap-2 shrink-0 pr-3 pl-2">
          {actions}
        </div>
      )}

      {/* Footer Area */}
      {footer && (
        <>
          {(layout === 'vertical' || layout === 'vertical-compact') && <div className="relative h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent w-full flex items-center justify-center z-10 shrink-0" />}
          <div className={`w-full relative z-10 ${layout === 'vertical-compact' ? 'py-1.5 px-4' : layout === 'vertical' ? 'p-4' : 'p-3'} bg-gradient-to-t from-[color-mix(in_srgb,var(--text)_2%,transparent)] to-transparent`}>
            {footer}
          </div>
        </>
      )}
    </div>
  );
}
