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
      layoutClasses = "flex-row items-center p-4 gap-4 min-h-[80px]";
      imageContainerClasses = "w-12 h-12 shrink-0 flex items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all duration-500 overflow-hidden relative";
      contentClasses = "flex-col justify-center grow min-w-0";
      break;
    case "compact":
      layoutClasses = "flex-row items-center p-3 gap-4 min-h-[64px] hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] transition-colors rounded-xl";
      imageContainerClasses = "w-11 h-11 shrink-0 flex items-center justify-center rounded-xl glass-panel bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all duration-300 overflow-hidden relative";
      contentClasses = "flex-col justify-center grow min-w-0";
      break;
    case "vertical-compact":
      layoutClasses = "flex-col";
      imageContainerClasses = "w-full h-24";
      contentClasses = `flex-col p-4 ${(!image && !customIcon) ? 'justify-center items-center text-center px-6' : ''}`;
      break;
    case "stat":
      layoutClasses = "flex-col items-center justify-center p-4 text-center min-h-[100px]";
      imageContainerClasses = "hidden";
      contentClasses = "flex-col items-center justify-center w-full gap-1";
      break;
    case "vertical":
    default:
      layoutClasses = "flex-col";
      imageContainerClasses = "w-full h-32";
      contentClasses = `flex-col p-5 ${(!image && !customIcon) ? 'justify-center items-center text-center px-6' : ''}`;
      break;
  }

  const cleanStatusColor = statusColor ? statusColor.split(' ').filter((c: string) => !c.startsWith('border-') && !c.startsWith('theme-border-')).join(' ') : "";
  const activeClasses = isActive
    ? "border border-[var(--accent)] shadow-[0_0_40px_-10px_var(--accent),inset_0_0_20px_-5px_var(--accent)] scale-[1.02] z-10"
    : cleanStatusColor;

  // For ghosted or disabled states
  const opacityClasses = isGhosted ? "opacity-50 grayscale-[0.8]" : isDisabled ? "opacity-50 cursor-not-allowed grayscale" : "";

  // The hover effect should only apply if the card is interactive
  const isInteractive = !!onClick || !!onContextMenu;
  const hoverClasses = !isDisabled && isInteractive ? "group-hover/card:shadow-[0_12px_40px_rgba(0,0,0,0.4)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" : "transition-all duration-500";

  const containerClasses = `glass-panel rounded-[inherit] relative flex group/card shrink-0 ${activeClasses} ${opacityClasses} ${hoverClasses} ${layoutClasses} ${isInteractive ? 'cursor-pointer' : ''} ${className}`;

  const renderMedia = () => {
    if (!image && !icon && !customIcon) return null;

    // For vertical layouts with NO image, skip rendering the massive empty banner!
    // The icon/customIcon will be handled by the inline block in the content area instead.
    if ((layout === "vertical" || layout === "vertical-compact") && !image) {
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
        style={{
          ...(layout === 'horizontal' ? { borderTopLeftRadius: 'inherit', borderBottomLeftRadius: 'inherit' } : { borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' })
        }}
      >
        {(image && !imageError) ? (
          <img
            src={image}
            onError={() => setImageError(true)}
            className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700`}
            style={{
              ...(layout === 'horizontal' ? { borderTopLeftRadius: 'inherit', borderBottomLeftRadius: 'inherit' } : { borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' })
            }}
          />
        ) : (
          <div className="absolute inset-0 rounded-[inherit] bg-transparent flex items-center justify-center transition-colors duration-500 overflow-hidden">
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


      {/* Floating or Inline Actions */}
      {actions && layout !== 'horizontal' && layout !== 'compact' && (
        <div className="absolute z-[70] top-3 right-3 flex items-center gap-2">
          {actions}
        </div>
      )}

      {/* Main Content Layout */}
      {renderMedia()}

      {/* Body & Footer Column (Fixes flex squishing in horizontal layout) */}
      <div className="flex flex-col min-w-0 self-stretch w-full grow">
        {/* Dividers (Removed for a cleaner glass look) */}
        <div className={`flex flex-col min-w-0 self-stretch grow ${contentClasses}`}>
          {/* Title & Subtitle */}
          <div className={`flex flex-col gap-1 w-full min-w-0 ${layout === 'stat' || (!image && !customIcon && (layout === 'vertical' || layout === 'vertical-compact')) ? 'items-center' : ''}`}>

            {subtitle && layout === 'stat' && (
              <div className="sanctuary-subtitle">
                {subtitle}
              </div>
            )}

            <div className={`flex min-w-0 w-full ${layout === 'stat' || (!image && (layout === 'vertical' || layout === 'vertical-compact')) ? 'justify-center flex-col items-center gap-3 mb-2' : 'items-center gap-2'} relative group/title`}>
              {/* If no image and it's a vertical layout, show a beautiful large icon! */}
              {!image && (icon || customIcon) && (layout === 'vertical' || layout === 'vertical-compact') && (
                <div className="w-16 h-16 rounded-xl bg-[color-mix(in_srgb,currentColor_5%,transparent)] border border-[color-mix(in_srgb,currentColor_20%,transparent)] flex items-center justify-center shadow-[inset_0_0_15px_color-mix(in_srgb,var(--text)_2%,transparent)] group-hover/card:shadow-[inset_0_0_20px_color-mix(in_srgb,var(--text)_5%,transparent)] group-hover/card:scale-110 group-hover/card:border-[color-mix(in_srgb,currentColor_40%,transparent)] transition-all duration-500">
                  {customIcon ? customIcon : (
                    <span className="material-symbols-outlined opacity-60 group-hover/card:opacity-100 theme-text-accent shrink-0 group-hover/card:drop-shadow-[0_0_15px_currentColor] transition-all duration-500">
                      {icon}
                    </span>
                  )}
                </div>
              )}

              {(image || customIcon || (layout !== 'vertical' && layout !== 'vertical-compact' && layout !== 'horizontal')) && icon && (
                <span className={`material-symbols-outlined ${layout === 'compact' ? 'text-lg opacity-70' : 'text-xl theme-text-accent opacity-90'} shrink-0`}>
                  {icon}
                </span>
              )}

              <span className={`flex-none min-w-0 w-full capitalize break-words ${layout === 'compact' ? 'text-sm truncate' : layout === 'horizontal' ? 'text-sm line-clamp-2 text-balance leading-snug' : layout === 'vertical-compact' ? 'text-base line-clamp-2 text-balance leading-snug' : layout === 'stat' ? 'text-base' : 'text-lg md:text-xl line-clamp-2 text-balance leading-tight'} sanctuary-title group-hover:theme-text-accent transition-colors`}>
                {typeof title === 'string' ? title.toLowerCase() : title}
              </span>
              {/* layout !== 'stat' && typeof title === 'string' && (
                <HoverTooltip title={title} variant="default" noIcon={true} align="center" vAlign="top" className="!hidden group-hover/title:!flex z-[200]" />
              ) */}
            </div>

            {subtitle && layout !== 'stat' && (
              <div className={`sanctuary-subtitle line-clamp-2 relative group/subtitle w-max max-w-full ${(!image && !customIcon && (layout === 'vertical' || layout === 'vertical-compact')) ? 'text-center' : ''}`}>
                {subtitle}
                {/* typeof subtitle === 'string' && (
                  <HoverTooltip title={subtitle} variant="default" noIcon={true} align="center" vAlign="top" className="!hidden group-hover/subtitle:!flex z-[200]" />
                ) */}
              </div>
            )}
          </div>

          {/* Badges / Extras inline (especially useful for horizontal/compact) */}
          {badges && (
            <div className={`flex flex-wrap items-center gap-2 ${layout === 'vertical-compact' ? 'pt-2' : 'mt-2'}`}>
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

        {/* Footer Area */}
        {footer && (
          <div className="w-full shrink-0">
            {(layout === 'vertical' || layout === 'vertical-compact') && <div className="relative h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent w-full flex items-center justify-center shrink-0" />}
            <div className={`w-full ${layout === 'vertical-compact' ? 'py-2 px-4' : layout === 'vertical' ? 'p-4' : 'p-3'}`}>
              {footer}
            </div>
          </div>
        )}
      </div>

      {/* Inline Actions for horizontal/compact */}
      {actions && (layout === 'horizontal' || layout === 'compact') && (
        <div className="relative z-50 flex items-center justify-end gap-2 shrink-0 pr-3 pl-2">
          {actions}
        </div>
      )}
    </div>
  );
}






