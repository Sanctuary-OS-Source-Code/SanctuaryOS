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
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md p-6 animate-in fade-in duration-300"
      onClick={() => !isBackingUp && setShowDefconAlert(false)}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-[110px] pointer-events-none mix-blend-screen"
        style={{
          backgroundColor: "color-mix(in srgb, var(--danger) 14%, transparent)",
        }}
      />

      <div
        className="relative w-full max-w-lg glass-panel sanctuary-modal-glass backdrop-blur-2xl border rounded-3xl p-8 md:p-10 flex flex-col items-center text-center gap-6 overflow-hidden animate-in zoom-in-95 duration-300"
        style={{
          borderColor: "color-mix(in srgb, var(--danger) 35%, transparent)",
          boxShadow:
            "0 35px 90px color-mix(in srgb, var(--danger) 22%, transparent), inset 0 0 36px color-mix(in srgb, var(--danger) 8%, transparent), inset 0 1px 1px rgba(255, 255, 255, 0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute inset-0 rounded-[inherit] animate-pulse pointer-events-none"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 4%, transparent)",
          }}
        />
        <div
          className="absolute top-0 left-0 w-full h-[2px] opacity-85 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, color-mix(in srgb, var(--danger) 75%, transparent), transparent)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-full h-px opacity-75 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, color-mix(in srgb, var(--danger) 45%, transparent), transparent)",
          }}
        />

        {!isBackingUp && (
          <div className="absolute top-5 right-5 z-30 flex items-center bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1">
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

        {/* Centered Circular Beacon Emblem */}
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center shrink-0 border-2 z-10 mt-1"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
            borderColor: "color-mix(in srgb, var(--danger) 35%, transparent)",
            boxShadow:
              "0 0 30px color-mix(in srgb, var(--danger) 20%, transparent), inset 0 0 20px color-mix(in srgb, var(--danger) 10%, transparent)",
          }}
        >
          <div
            className="absolute inset-0 rounded-full border-2 animate-ping opacity-35"
            style={{
              borderColor: "color-mix(in srgb, var(--danger) 50%, transparent)",
            }}
          />
          <span
            className="material-symbols-outlined !text-[36px] animate-pulse"
            style={{
              color: "var(--danger)",
              filter: "drop-shadow(0 0 14px var(--danger))",
            }}
          >
            {t("icon_warning_amber", "warning")}
          </span>
        </div>

        {/* Title & Message */}
        <div className="flex flex-col items-center gap-2 relative z-10 w-full">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none text-[var(--danger)] drop-shadow-md m-0">
            {t("defcon_alert_title")}
          </h2>
          <span className="text-[10px] font-black uppercase tracking-[0.35em] text-[var(--danger)] opacity-85">
            {t("defcon_patch_detected")}
          </span>

          <div
            className="w-36 h-px my-2 opacity-60"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--danger), transparent)",
            }}
          />

          <p className="text-sm font-medium text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-line max-w-md m-0">
            {t(
              !isBackingUp
                ? "defcon_sealing_desc_secured"
                : backupProgress?.action?.toLowerCase().includes("world")
                  ? "defcon_sealing_desc_world"
                  : "defcon_sealing_desc_engine"
            )}
          </p>
        </div>

        {isBackingUp ? (
          <div className="w-full glass-surface p-5 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] flex flex-col gap-3 relative z-10">
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
        ) : (
          <div className="grid grid-cols-1 w-full mt-2 pt-5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-10">
            <ActionButton
              variant="danger"
              icon={t("icon_check", "check")}
              label={t("defcon_btn_dismiss")}
              onClick={() => setShowDefconAlert(false)}
              className="w-full !py-3.5"
            />
          </div>
        )}
      </div>
    </div>
  );
}
