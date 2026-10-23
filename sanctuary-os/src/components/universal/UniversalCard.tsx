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
      imageContainerClasses = "w-12 h-12 shrink-0 flex items-center justify-center rounded-xl group-hover:border-[color-mix(in_srgb,var(--accent)_35%,rgba(255,255,255,0.5))] group-hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--glass-card-icon-bg))] transition-all duration-500 overflow-hidden relative";
      contentClasses = "flex-col justify-center grow min-w-0";
      break;
    case "compact":
      layoutClasses = "flex-row items-center p-3 gap-4 min-h-[64px] transition-colors rounded-xl";
      imageContainerClasses = "w-11 h-11 shrink-0 flex items-center justify-center rounded-xl group-hover:border-[color-mix(in_srgb,var(--accent)_35%,rgba(255,255,255,0.5))] group-hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--glass-card-icon-bg))] transition-all duration-300 overflow-hidden relative";
      contentClasses = "flex-col justify-center grow min-w-0";
      break;
    case "vertical-compact":
      layoutClasses = "flex-col";
      imageContainerClasses = "w-full h-24";
      contentClasses = `flex-col p-4`;
      break;
    case "stat":
      layoutClasses = "flex-col items-center justify-center p-4 text-center min-h-[100px] shadow-none";
      imageContainerClasses = "hidden";
      contentClasses = "flex-col items-center justify-center w-full gap-1";
      break;
    case "vertical":
    default:
      layoutClasses = "flex-col";
      imageContainerClasses = "w-full h-32";
      contentClasses = `flex-col p-5`;
      break;
  }

  const cleanStatusColor = statusColor ? statusColor.split(' ').filter((c: string) => !c.startsWith('border-') && !c.startsWith('theme-border-')).join(' ') : "";
  const activeClasses = isActive
    ? "ring-1 ring-[color-mix(in_srgb,var(--accent)_55%,rgba(255,255,255,0.5))] z-10"
    : `${cleanStatusColor}`;

  // For ghosted or disabled states
  const opacityClasses = isGhosted ? "opacity-50 grayscale-[0.8]" : isDisabled ? "opacity-50 cursor-not-allowed grayscale" : "";

  // The hover effect should only apply if the card is interactive
  const isInteractive = !!onClick || !!onContextMenu;
  const hoverClasses = !isDisabled && isInteractive ? "hover:-translate-y-0.5 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" : "transition-all duration-500";

  const containerClasses = `glass-panel rounded-[var(--radius)] relative flex group group/card shrink-0 ${activeClasses} ${opacityClasses} ${hoverClasses} ${layoutClasses} ${isInteractive ? 'cursor-pointer' : ''} ${className}`;

  const renderMedia = () => {
    if (!image && !icon && !customIcon) return null;

    // Render banner for vertical layouts, using the icon if image is missing

    // For compact, we don't have the big abstract background
    if (layout === "compact" || layout === "horizontal") {
      return (
        <div className={`relative flex items-center justify-center glass-surface ${imageContainerClasses}`}>
          {(image && !imageError) ? (
            <img src={image} onError={() => setImageError(true)} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
          ) : customIcon ? (
            customIcon
          ) : (
            <span className={`material-symbols-outlined ${layout === "horizontal" ? "!text-[24px] text-[var(--text)] opacity-80" : "text-[20px] text-[var(--subtext)] opacity-70"} group-hover:opacity-100 group-hover:text-[var(--accent)] transition-colors`}>
              {icon || t("icon_folder", "folder")}
            </span>
          )}
          {imageOverlay}
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
          borderTopLeftRadius: 'inherit',
          borderTopRightRadius: 'inherit'
        }}
      >
        {(image && !imageError) ? (
          <img
            src={image}
            onError={() => setImageError(true)}
            className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700`}
            style={{
              borderTopLeftRadius: 'inherit',
              borderTopRightRadius: 'inherit'
            }}
          />
        ) : (
          <div
            className="absolute inset-0 rounded-t-[inherit] border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] flex items-center justify-center transition-colors duration-500 overflow-hidden"
            style={{ background: 'var(--glass-card-banner-bg)' }}
          >
            {customIcon ? customIcon : (
              <div
                className={`rounded-2xl border flex items-center justify-center transition-all duration-500 group-hover:scale-105 ${layout === 'vertical-compact' ? 'w-12 h-12' : 'w-16 h-16'}`}
                style={{
                  backgroundColor: 'var(--glass-card-icon-bg)',
                  borderColor: 'var(--glass-card-icon-border)',
                  boxShadow: 'var(--glass-card-icon-shadow)',
                }}
              >
                <span className={`material-symbols-outlined text-[var(--text)] opacity-85 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all duration-500 drop-shadow-sm relative z-10 ${layout === 'vertical-compact' ? '!text-[24px]' : '!text-[34px]'}`}>
                  {icon || t("icon_folder", "folder")}
                </span>
              </div>
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
      style={
        layout === "stat"
          ? ({
              "--glass-outer-shadow": "0 0 #0000",
              "--glass-nested-shadow": "0 0 #0000",
              boxShadow: "var(--glass-inset-highlight, inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.24), inset 1px 0 1px 0 rgba(255, 255, 255, 0.12))",
              ...style,
            } as React.CSSProperties)
          : style
      }
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
          <div className={`flex flex-col gap-1.5 w-full min-w-0 ${layout === 'stat' ? 'items-center' : ''}`}>

            {subtitle && layout === 'stat' && (
              <div className="sanctuary-subtitle text-xs font-medium text-[var(--subtext)] opacity-80 leading-relaxed">
                {subtitle}
              </div>
            )}

            <div className={`flex min-w-0 w-full ${layout === 'stat' ? 'justify-center flex-col items-center gap-3 mb-2' : 'items-center gap-2'} relative group/title`}>
              {/* Removed large inline icon since it now renders in the banner */}

              <span className={`flex-none min-w-0 w-full break-words font-bold tracking-tight text-[var(--text)] ${layout === 'compact' ? 'text-sm truncate' : layout === 'horizontal' ? 'text-sm line-clamp-2 leading-snug' : layout === 'vertical-compact' ? 'text-[15px] line-clamp-2 leading-snug' : layout === 'stat' ? 'text-base' : 'text-[15px] md:text-base line-clamp-2 leading-snug'} sanctuary-title group-hover:theme-text-accent transition-colors`}>
                {title}
              </span>
              {/* layout !== 'stat' && typeof title === 'string' && (
                <HoverTooltip title={title} variant="default" noIcon={true} align="center" vAlign="top" className="!hidden group-hover/title:!flex z-[200]" />
              ) */}
            </div>

            {subtitle && layout !== 'stat' && (
              <div className="sanctuary-subtitle text-xs font-medium text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-3 relative group/subtitle w-full">
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
            <div className="mt-auto pt-3 w-full flex flex-col">
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






