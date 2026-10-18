import React from "react";
import { useLexicon } from "../LexiconContext";
import { ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useModalStore } from "../store/modalStore";

export function GlobalConfirmDialog() {
  const { t } = useLexicon();
  const confirmDialog = useModalStore((state: any) => state.confirmDialog);
  const setConfirmDialog = useModalStore((state: any) => state.setConfirmDialog);

  if (!confirmDialog) return null;

  const isDefcon = Boolean(confirmDialog.isDefcon);
  const isAlert = Boolean(confirmDialog.isAlert);

  const accentVar = isDefcon ? "--danger" : isAlert ? "--warning" : "--accent";
  const headerIcon = isDefcon
    ? t("icon_warning_amber", "warning")
    : isAlert
      ? t("icon_warning", "warning")
      : t("icon_help_center", "help_center");
  const badgeLabel = isDefcon
    ? t("urgent_alert", "Urgent Alert")
    : isAlert
      ? t("category_system", "System")
      : t("status", "Confirm");
  const titleText =
    confirmDialog.title ||
    (isDefcon ? t("defcon_alert_title", "Global Alert") : t("status", "Confirmation"));

  const handleCancel = () => {
    if (confirmDialog.cancelAction) confirmDialog.cancelAction();
    else setConfirmDialog(null);
  };

  const handleConfirm = () => {
    confirmDialog.action();
    setConfirmDialog(null);
  };

  return (
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/35 backdrop-blur-md p-6 animate-in fade-in duration-300"
      onClick={handleCancel}
    >
      <div
        className="relative w-full max-w-xl rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col backdrop-blur-[var(--glassBlur)] animate-in zoom-in-95 duration-300"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, var(--text) 5%, transparent) 0%, transparent 100%), color-mix(in srgb, var(--sidebar) calc(var(--glassOpacityDecimal, 0.85) * 100%), transparent)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle SidePanel-style corner ambient glow */}
        <div
          className="absolute -top-24 -left-24 w-72 h-72 rounded-full opacity-15 blur-[90px] pointer-events-none z-0"
          style={{ backgroundColor: `var(${accentVar})` }}
        />

        {/* SidePanel-style Header */}
        <div className="pt-6 px-6 pb-5 md:pt-7 md:px-8 shrink-0 relative z-20 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-12 h-12 md:w-14 md:h-14 rounded-2xl glass-panel before:!hidden border flex items-center justify-center shadow-lg shrink-0 relative"
              style={{
                borderColor: `color-mix(in srgb, var(${accentVar}) 30%, transparent)`,
                color: `var(${accentVar})`,
              }}
            >
              <span className="material-symbols-outlined !text-[24px] md:!text-[26px] drop-shadow-[0_0_12px_currentColor]">
                {headerIcon}
              </span>
            </div>

            <div className="flex flex-col min-w-0 justify-center">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border"
                  style={{
                    color: `var(${accentVar})`,
                    backgroundColor: `color-mix(in srgb, var(${accentVar}) 12%, transparent)`,
                    borderColor: `color-mix(in srgb, var(${accentVar}) 25%, transparent)`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shadow-[0_0_8px_currentColor]" />
                  {badgeLabel}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight truncate drop-shadow-md m-0">
                {titleText}
              </h2>
            </div>
          </div>

          <div className="flex items-center z-50 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1 gap-1 shrink-0">
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_close", "close")}
                tooltip={confirmDialog.cancelText || t("btn_close", "Close")}
                variant="danger"
                onClick={handleCancel}
              />
            </PanelHeaderGroup>
          </div>
        </div>

        {/* Clean inner message well */}
        <div className="p-6 md:p-8 flex flex-col gap-4 relative z-10">
          <div className="glass-surface before:!hidden rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <p className="text-sm font-medium text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-line m-0">
              {confirmDialog.message}
            </p>
          </div>
        </div>

        {/* SidePanel-style Footer with ActionButtons */}
        <div className="px-6 pb-6 pt-5 md:px-8 md:pb-7 flex items-center justify-end gap-3 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
          {!isAlert && (
            <ActionButton
              variant="glass"
              icon={t("icon_close", "close")}
              label={confirmDialog.cancelText || t("nav_cancel")}
              onClick={handleCancel}
            />
          )}
          <ActionButton
            variant={isDefcon ? "danger" : isAlert ? "warning" : "accent"}
            icon={
              isDefcon
                ? t("icon_shield", "shield")
                : t("icon_check", "check")
            }
            label={
              confirmDialog.confirmText ||
              (isAlert ? t("btn_ok") : t("btn_proceed"))
            }
            onClick={handleConfirm}
          />
        </div>
      </div>
    </div>
  );
}




