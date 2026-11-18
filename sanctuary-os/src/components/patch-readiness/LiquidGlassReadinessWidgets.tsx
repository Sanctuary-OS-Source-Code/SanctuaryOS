import React from "react";
import { useLexicon } from "../../LexiconContext";
import { ActionButton, HoverTooltip, VAULT_CHIP_CLASS } from "../../shared";

export function LiquidGlassReadinessBar({
  readyCount,
  updateCount,
  blockingCount,
  totalCount,
  heightClass = "h-2.5",
}: {
  readyCount: number;
  updateCount: number;
  blockingCount: number;
  totalCount: number;
  heightClass?: string;
}) {
  return (
    <div
      className={`w-full ${heightClass} rounded-full p-[1.5px] sa-liquid-progress-track overflow-hidden flex items-center gap-[2px]`}
    >
      {totalCount > 0 ? (
        <>
          {readyCount > 0 && (
            <div
              className="h-full min-w-[6px] sa-liquid-progress-segment"
              style={
                {
                  width: `${(readyCount / totalCount) * 100}%`,
                  "--seg-color": "var(--success)",
                } as React.CSSProperties
              }
            />
          )}
          {updateCount > 0 && (
            <div
              className="h-full min-w-[6px] sa-liquid-progress-segment"
              style={
                {
                  width: `${(updateCount / totalCount) * 100}%`,
                  "--seg-color": "var(--warning)",
                } as React.CSSProperties
              }
            />
          )}
          {blockingCount > 0 && (
            <div
              className="h-full min-w-[6px] sa-liquid-progress-segment"
              style={
                {
                  width: `${(blockingCount / totalCount) * 100}%`,
                  "--seg-color": "var(--danger)",
                } as React.CSSProperties
              }
            />
          )}
        </>
      ) : (
        <div
          className="h-full w-full sa-liquid-progress-segment opacity-40"
          style={{ "--seg-color": "var(--success)" } as React.CSSProperties}
        />
      )}
    </div>
  );
}

export interface LiquidGlassAlertCardProps {
  icon: string;
  accentVar?: string;
  iconColorClass?: string;
  badgeIcon?: string;
  badgeLabel: string;
  overline: string;
  title: string;
  description: string;
  isAlertCard?: boolean;
  actionLabel?: string;
  actionIcon?: string;
  actionVariant?: "glass" | "accent" | "warning" | "danger" | "success";
  onAction?: () => void;
  ignoreLabel?: string;
  ignoreIcon?: string;
  onIgnore?: () => void;
  secondaryActionIcon?: string;
  secondaryActionLabel?: string;
  secondaryActionTooltip?: string;
  onSecondaryAction?: () => void;
  onClick?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function LiquidGlassAlertCard({
  icon,
  accentVar = "var(--accent)",
  iconColorClass = "text-[var(--accent)]",
  badgeIcon,
  badgeLabel,
  overline,
  title,
  description,
  isAlertCard = false,
  actionLabel,
  actionIcon,
  actionVariant = "glass",
  onAction,
  ignoreLabel,
  ignoreIcon,
  onIgnore,
  secondaryActionIcon,
  secondaryActionLabel,
  secondaryActionTooltip,
  onSecondaryAction,
  onClick,
  children,
  footer,
}: LiquidGlassAlertCardProps) {
  const { t } = useLexicon();

  const actionIconColorClass =
    actionVariant === "danger"
      ? "[&_span.material-symbols-outlined]:!text-[var(--danger)]"
      : actionVariant === "warning"
        ? "[&_span.material-symbols-outlined]:!text-[var(--warning)]"
        : actionVariant === "success"
          ? "[&_span.material-symbols-outlined]:!text-[var(--success)]"
          : "[&_span.material-symbols-outlined]:!text-[var(--accent)]";

  return (
    <div
      onClick={onClick}
      className={`glass-panel rounded-[var(--radius)] p-5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3.5 relative overflow-hidden h-full transition-all duration-300 ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
          : ""
      }`}
      style={{
        backgroundColor: `color-mix(in srgb, ${accentVar} ${isAlertCard ? "5%" : "4%"}, transparent)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: isAlertCard
            ? `radial-gradient(115% 85% at 0% 0%, color-mix(in srgb, ${accentVar} 12%, transparent) 0%, color-mix(in srgb, ${accentVar} 4%, transparent) 44%, transparent 74%), radial-gradient(circle at 90% 12%, color-mix(in srgb, ${accentVar} 10%, transparent) 0%, transparent 56%)`
            : `radial-gradient(circle at 88% 12%, color-mix(in srgb, ${accentVar} 14%, transparent) 0%, transparent 62%)`,
        }}
      />
      <span
        className={`material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] ${iconColorClass} ${
          isAlertCard ? "opacity-[0.055]" : "opacity-[0.04]"
        } pointer-events-none select-none rotate-[-10deg]`}
      >
        {icon}
      </span>

      <div className="flex items-center justify-between gap-3 relative z-10">
        <div
          className={`w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] ${iconColorClass} flex items-center justify-center shrink-0 relative overflow-hidden`}
        >
          {isAlertCard && (
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background: `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${accentVar} 20%, transparent) 0%, transparent 75%)`,
              }}
            />
          )}
          <span className="material-symbols-outlined !text-[22px] relative z-10">
            {icon}
          </span>
        </div>
        <span className={`${VAULT_CHIP_CLASS} max-w-[calc(100%-3.5rem)]`}>
          <span
            className={`material-symbols-outlined !text-[12px] shrink-0 ${iconColorClass}`}
          >
            {badgeIcon || icon}
          </span>
          <span className="truncate">{badgeLabel}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1 relative z-10">
        <span
          className={`text-[10px] font-mono font-black uppercase tracking-[0.14em] ${iconColorClass} leading-snug`}
        >
          {overline}
        </span>
        <h3 className="text-[15px] md:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
          {title}
        </h3>
      </div>

      <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0 relative z-10">
        {description}
      </p>

      {children && <div className="relative z-10">{children}</div>}

      {footer ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-3.5 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-10 w-full"
        >
          {footer}
        </div>
      ) : actionLabel && onAction ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`pt-3.5 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-10 w-full ${
            onIgnore || (secondaryActionLabel && onSecondaryAction)
              ? "grid grid-cols-2 gap-2.5"
              : "flex items-center gap-2.5"
          }`}
        >
          {onIgnore ? (
            <>
              <ActionButton
                variant="glass"
                icon={ignoreIcon || t("icon_visibility_off", "visibility_off")}
                label={ignoreLabel || t("btn_ignore", "Ignore")}
                onClick={onIgnore}
                className="w-full !px-3 !py-2.5 opacity-75 hover:opacity-100 [&_span.material-symbols-outlined]:!text-[var(--subtext)] hover:[&_span.material-symbols-outlined]:!text-[var(--text)]"
              />
              <ActionButton
                variant="glass"
                icon={actionIcon}
                label={actionLabel}
                onClick={onAction}
                className={`w-full !px-3 !py-2.5 ${actionIconColorClass}`}
              />
            </>
          ) : secondaryActionLabel && onSecondaryAction ? (
            <>
              <ActionButton
                variant="glass"
                icon={actionIcon}
                label={actionLabel}
                onClick={onAction}
                className={`w-full !px-3 !py-2.5 ${actionIconColorClass}`}
              />
              <ActionButton
                variant="glass"
                icon={secondaryActionIcon}
                label={secondaryActionLabel}
                onClick={onSecondaryAction}
                className={`w-full !px-3 !py-2.5 ${actionIconColorClass}`}
              />
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <ActionButton
                  variant="glass"
                  icon={actionIcon}
                  label={actionLabel}
                  onClick={onAction}
                  className={`w-full !px-4 !py-2.5 ${actionIconColorClass}`}
                />
              </div>
              {secondaryActionIcon && onSecondaryAction && (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center shrink-0 transition-all relative cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[17px]">
                    {secondaryActionIcon}
                  </span>
                  {secondaryActionTooltip && (
                    <HoverTooltip title={secondaryActionTooltip} />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

