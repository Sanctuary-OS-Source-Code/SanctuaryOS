import React from "react";
import { useLexicon } from "./LexiconContext";
import { ActionButton, PanelHeaderGroup, PanelHeaderButton } from "./shared";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";

export function DefconAlert() {
  const { t } = useLexicon();
  const backupProgress = useStore((state) => state.backupProgress);
  const setShowDefconAlert = useModalStore((state) => state.setShowDefconAlert);
  const isBackingUp = useModalStore((state) => state.isBackingUp);

  return (
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/35 backdrop-blur-md p-6 animate-in fade-in duration-300"
      onClick={() => !isBackingUp && setShowDefconAlert(false)}
    >
      <div
        className="relative w-full max-w-xl rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col backdrop-blur-[var(--glassBlur)] animate-in zoom-in-95 duration-300"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, var(--text) 5%, transparent) 0%, transparent 100%), color-mix(in srgb, var(--sidebar) calc(var(--glassOpacityDecimal, 0.85) * 100%), transparent)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute -top-24 -left-24 w-72 h-72 rounded-full opacity-15 blur-[90px] pointer-events-none z-0"
          style={{ backgroundColor: "var(--danger)" }}
        />

        {/* SidePanel-style Header */}
        <div className="pt-6 px-6 pb-5 md:pt-7 md:px-8 shrink-0 relative z-20 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl glass-panel before:!hidden border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] flex items-center justify-center shadow-lg shrink-0 relative">
              <span className="material-symbols-outlined !text-[24px] md:!text-[26px] drop-shadow-[0_0_12px_currentColor]">
                {t("icon_warning_amber", "warning")}
              </span>
            </div>

            <div className="flex flex-col min-w-0 justify-center">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] text-[var(--danger)]">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shadow-[0_0_8px_currentColor]" />
                  {t("defcon_patch_detected")}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight truncate drop-shadow-md m-0">
                {t("defcon_alert_title")}
              </h2>
            </div>
          </div>

          {!isBackingUp && (
            <div className="flex items-center z-50 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1 gap-1 shrink-0">
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_close", "close")}
                  tooltip={t("defcon_btn_dismiss")}
                  variant="danger"
                  onClick={() => setShowDefconAlert(false)}
                />
              </PanelHeaderGroup>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6 md:p-8 flex flex-col gap-5 relative z-10">
          <div className="glass-surface before:!hidden rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <p className="text-sm font-medium text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-line m-0">
              {t(
                !isBackingUp
                  ? "defcon_sealing_desc_secured"
                  : backupProgress?.action?.toLowerCase().includes("world")
                    ? "defcon_sealing_desc_world"
                    : "defcon_sealing_desc_engine"
              )}
            </p>
          </div>

          {isBackingUp && (
            <div className="glass-surface before:!hidden p-5 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex flex-col gap-3">
              {backupProgress ? (
                <>
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--danger)]">
                    <span className="truncate pr-4">{backupProgress.action}</span>
                    <span className="shrink-0 opacity-80">
                      {backupProgress.current} / {backupProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-black/60 rounded-full h-2.5 overflow-hidden border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
                    <div
                      className="h-full bg-gradient-to-r from-[color-mix(in_srgb,var(--danger)_50%,transparent)] to-[var(--danger)] transition-all duration-300 relative"
                      style={{
                        width: `${Math.max(2, (backupProgress.current / backupProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--danger)]">
                    <span>{t("defcon_init_secure")}</span>
                    <span className="animate-pulse opacity-80">{t("defcon_stand_by")}</span>
                  </div>
                  <div className="w-full bg-black/60 rounded-full h-2.5 overflow-hidden border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
                    <div className="h-full w-full bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] relative">
                      <div className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-r from-transparent via-[var(--danger)] to-transparent animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isBackingUp && (
          <div className="px-6 pb-6 pt-5 md:px-8 md:pb-7 flex items-center justify-end gap-3 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
            <ActionButton
              variant="danger"
              icon={t("icon_check", "check")}
              label={t("defcon_btn_dismiss")}
              onClick={() => setShowDefconAlert(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}




