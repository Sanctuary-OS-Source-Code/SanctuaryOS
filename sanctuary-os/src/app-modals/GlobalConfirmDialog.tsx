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
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md p-6 animate-in fade-in duration-300"
      onClick={handleCancel}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-[110px] pointer-events-none mix-blend-screen"
        style={{
          backgroundColor: `color-mix(in srgb, var(${accentVar}) 14%, transparent)`,
        }}
      />

      <div
        className="relative w-full max-w-lg glass-panel sanctuary-modal-glass backdrop-blur-2xl border rounded-3xl p-8 md:p-10 flex flex-col items-center text-center gap-6 overflow-hidden animate-in zoom-in-95 duration-300"
        style={{
          borderColor: `color-mix(in srgb, var(${accentVar}) 35%, transparent)`,
          boxShadow: `0 35px 90px color-mix(in srgb, var(${accentVar}) 22%, transparent), inset 0 0 36px color-mix(in srgb, var(${accentVar}) 8%, transparent), inset 0 1px 1px rgba(255, 255, 255, 0.22)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute inset-0 rounded-[inherit] animate-pulse pointer-events-none"
          style={{
            backgroundColor: `color-mix(in srgb, var(${accentVar}) 4%, transparent)`,
          }}
        />
        <div
          className="absolute top-0 left-0 w-full h-[2px] opacity-85 pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent, color-mix(in srgb, var(${accentVar}) 75%, transparent), transparent)`,
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-full h-px opacity-75 pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent, color-mix(in srgb, var(${accentVar}) 45%, transparent), transparent)`,
          }}
        />

        <div className="absolute top-5 right-5 z-30 flex items-center bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1">
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_close", "close")}
              tooltip={confirmDialog.cancelText || t("btn_close", "Close")}
              variant="danger"
              onClick={handleCancel}
            />
          </PanelHeaderGroup>
        </div>

        {/* Centered Circular Beacon Emblem */}
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center shrink-0 border-2 z-10 mt-1"
          style={{
            backgroundColor: `color-mix(in srgb, var(${accentVar}) 10%, transparent)`,
            borderColor: `color-mix(in srgb, var(${accentVar}) 35%, transparent)`,
            boxShadow: `0 0 30px color-mix(in srgb, var(${accentVar}) 20%, transparent), inset 0 0 20px color-mix(in srgb, var(${accentVar}) 10%, transparent)`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full border-2 animate-ping opacity-35"
            style={{
              borderColor: `color-mix(in srgb, var(${accentVar}) 50%, transparent)`,
            }}
          />
          <span
            className="material-symbols-outlined !text-[36px] animate-pulse"
            style={{
              color: `var(${accentVar})`,
              filter: `drop-shadow(0 0 14px var(${accentVar}))`,
            }}
          >
            {headerIcon}
          </span>
        </div>

        {/* Centered Title, Status Subtitle & Message */}
        <div className="flex flex-col items-center gap-2 relative z-10 w-full">
          <h2
            className="text-2xl md:text-3xl font-black tracking-tight leading-none drop-shadow-md m-0"
            style={{ color: isDefcon ? `var(${accentVar})` : "var(--text)" }}
          >
            {titleText}
          </h2>
          <span
            className="text-[10px] font-black uppercase tracking-[0.35em] opacity-85"
            style={{ color: `var(${accentVar})` }}
          >
            {badgeLabel}
          </span>

          <div
            className="w-36 h-px my-2 opacity-60"
            style={{
              background: `linear-gradient(to right, transparent, var(${accentVar}), transparent)`,
            }}
          />

          <p className="text-sm font-medium text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-line max-w-md m-0">
            {confirmDialog.message}
          </p>
        </div>

        {/* 50/50 Bottom Action Buttons */}
        <div
          className={`grid ${isAlert ? "grid-cols-1" : "grid-cols-2"} gap-3.5 w-full mt-2 pt-5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-10`}
        >
          {!isAlert && (
            <ActionButton
              variant="glass"
              icon={t("icon_close", "close")}
              label={confirmDialog.cancelText || t("nav_cancel")}
              onClick={handleCancel}
              className="w-full !py-3.5"
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
            className="w-full !py-3.5"
          />
        </div>
      </div>
    </div>
  );
}
