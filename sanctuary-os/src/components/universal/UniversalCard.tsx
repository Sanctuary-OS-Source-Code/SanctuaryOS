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
  const [imageError, setImageError] = React.useState(false);

  // Base classes for the container
  let layoutClasses = "";
  let imageContainerClasses = "";
  let contentClasses = "";

  switch (layout) {
    case "horizontal":
      layoutClasses = "flex-row items-center min-h-[96px]";
      imageContainerClasses = "w-28 self-stretch rounded-l-[inherit]";
      contentClasses = "flex-col justify-center p-4 pr-5";
      break;
    case "vertical-compact":
      layoutClasses = "flex-col h-full";
      imageContainerClasses = "w-full h-24 rounded-t-[inherit]";
      contentClasses = `flex-col flex-1 p-4 pt-5 ${(!image && !customIcon) ? 'justify-center items-center text-center' : ''}`;
      break;
    case "compact":
      layoutClasses = "flex-row items-center p-3 min-h-[64px] gap-4 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] transition-colors";
      imageContainerClasses = "w-11 h-11 rounded-[max(0px,calc(var(--radius)-4px))] overflow-hidden shrink-0 shadow-sm border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] flex items-center justify-center";
      contentClasses = "flex-col justify-center flex-1 min-w-0";
      break;
    case "stat":
      layoutClasses = "flex-col items-center justify-center p-4 text-center min-h-[100px]";
      imageContainerClasses = "hidden";
      contentClasses = "flex-col items-center justify-center w-full gap-1";
      break;
    case "vertical":
    default:
      layoutClasses = "flex-col h-full";
      imageContainerClasses = "w-full h-32 rounded-t-[inherit]";
      contentClasses = `flex-col flex-1 p-5 ${(!image && !customIcon) ? 'justify-center items-center text-center px-6' : ''}`;
      break;
  }

  const cleanStatusColor = statusColor ? statusColor.split(' ').filter((c: string) => !c.startsWith('border-') && !c.startsWith('theme-border-')).join(' ') : "";
  const activeClasses = isActive
    ? "border border-[var(--accent)] shadow-[0_0_40px_-10px_var(--accent),inset_0_0_20px_-5px_var(--accent)] scale-[1.02] z-10"
    : cleanStatusColor;

  // For ghosted or disabled states
  const opacityClasses = isGhosted ? "opacity-50 grayscale-[0.8]" : isDisabled ? "opacity-50 cursor-not-allowed grayscale" : "";

  // The hover effect
  const hoverClasses = !isDisabled ? "group-hover/card:shadow-2xl group-hover/card:shadow-[color-mix(in_srgb,currentColor_10%,transparent)] group-hover/card:-translate-y-1 transition-all duration-700 ease-out" : "";

  const containerClasses = `glass-panel rounded-[var(--radius)] relative overflow-hidden flex group/card ${activeClasses} ${opacityClasses} ${hoverClasses} ${layoutClasses} ${onClick ? 'cursor-pointer' : ''} ${className}`;

  const renderMedia = () => {
    if (!image && !icon && !customIcon) return null;

    // For vertical layouts with ONLY an icon, skip rendering the massive empty banner!
    if ((layout === "vertical" || layout === "vertical-compact") && !image && !customIcon) {
      return null;
    }

    // For compact, we don't have the big abstract background
    if (layout === "compact") {
      return (
        <div className={`relative flex items-center justify-center glass-surface ${imageContainerClasses}`}>
          {(image && !imageError) ? (
            <img src={image} onError={() => setImageError(true)} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
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
      <div
        className={`relative flex flex-col items-center justify-center shrink-0 overflow-hidden ${imageContainerClasses}`}
        style={(image && !imageError && (layout === 'vertical' || layout === 'vertical-compact')) ? { WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' } : {}}
      >
        {(image && !imageError) ? (
          <img src={image} onError={() => setImageError(true)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
        ) : (
          <div className="absolute inset-0 bg-transparent flex items-center justify-center transition-colors duration-500 overflow-hidden">
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
      {/* Flagship Glass Glare & Light Leaks */}
      <div className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-transparent to-[color-mix(in_srgb,var(--base)_10%,transparent)] mix-blend-overlay" />
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
        <div className="absolute inset-0 shadow-[inset_0_0_30px_color-mix(in_srgb,var(--text)_2%,transparent)]" />
      </div>

      {/* Floating or Inline Actions */}
      {actions && layout !== 'horizontal' && layout !== 'compact' && (
        <div className="absolute z-[70] top-3 right-3 flex items-center gap-2">
          {actions}
        </div>
      )}

      {/* Main Content Layout */}
      {renderMedia()}

      {/* Dividers (Removed for a cleaner glass look) */}
      <div className={`flex flex-1 min-w-0 relative z-10 self-stretch ${contentClasses}`}>
        {/* Title & Subtitle */}
        <div className={`flex flex-col gap-1 w-full min-w-0 ${layout === 'stat' || (!image && !customIcon && (layout === 'vertical' || layout === 'vertical-compact')) ? 'items-center' : ''}`}>

          {subtitle && layout === 'stat' && (
            <div className="sanctuary-subtitle">
              {subtitle}
            </div>
          )}

          <div className={`flex min-w-0 w-full ${layout === 'stat' || (!image && !customIcon && (layout === 'vertical' || layout === 'vertical-compact')) ? 'justify-center flex-col items-center gap-3 mb-2' : 'items-center gap-2'} relative group/title`}>
            {/* If no image and it's a vertical layout, show a beautiful large icon! */}
            {!image && !customIcon && icon && (layout === 'vertical' || layout === 'vertical-compact') && (
              <div className="w-16 h-16 rounded-[calc(var(--radius)-4px)] bg-[color-mix(in_srgb,currentColor_5%,transparent)] border border-[color-mix(in_srgb,currentColor_20%,transparent)] flex items-center justify-center shadow-[inset_0_0_15px_color-mix(in_srgb,var(--text)_2%,transparent)] group-hover/card:shadow-[inset_0_0_20px_color-mix(in_srgb,var(--text)_5%,transparent)] group-hover/card:scale-110 group-hover/card:border-[color-mix(in_srgb,currentColor_40%,transparent)] transition-all duration-500">
                <span className="material-symbols-outlined opacity-60 group-hover/card:opacity-100 theme-text-accent shrink-0 group-hover/card:drop-shadow-[0_0_15px_currentColor] transition-all duration-500">
                  {icon}
                </span>
              </div>
            )}

            {!image && !customIcon && icon && (layout !== 'vertical' && layout !== 'vertical-compact' && layout !== 'compact' && layout !== 'stat') && (
              <span className="material-symbols-outlined !text-[20px] opacity-60 theme-text-accent shrink-0">
                {icon}
              </span>
            )}

            <span className={`flex-1 min-w-0 block w-full capitalize ${layout === 'compact' ? 'text-sm truncate' : layout === 'horizontal' ? 'text-sm truncate' : layout === 'vertical-compact' ? 'text-base line-clamp-2 text-balance leading-snug' : layout === 'stat' ? 'text-base' : 'text-lg md:text-xl line-clamp-2 text-balance leading-tight'} sanctuary-title group-hover:theme-text-accent transition-colors`}>
              {typeof title === 'string' ? title.toLowerCase() : title}
            </span>
            {layout !== 'stat' && typeof title === 'string' && (
              <HoverTooltip title={title} variant="default" noIcon={true} className="!hidden group-hover/title:!flex !bottom-[calc(100%+4px)] !left-0 !translate-x-0 z-[200]" />
            )}
          </div>

          {subtitle && layout !== 'stat' && (
            <div className={`sanctuary-subtitle line-clamp-2 relative group/subtitle w-full ${(!image && !customIcon && (layout === 'vertical' || layout === 'vertical-compact')) ? 'text-center' : ''}`}>
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
          <div className={`w-full relative z-10 ${layout === 'vertical-compact' ? 'py-2 px-4' : layout === 'vertical' ? 'p-4' : 'p-3'}`}>
            {footer}
          </div>
        </>
      )}
    </div>
  );
}
