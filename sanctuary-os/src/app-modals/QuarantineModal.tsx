import React from "react";
import { useLexicon } from "../LexiconContext";
import { ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../shared";

export function QuarantineModal({ showQuarantineModal, setShowQuarantineModal, quarantineList, restoreMod, purgeMod }: any) {
  const { t } = useLexicon();

  if (!showQuarantineModal) return null;

  return (
    <div
      className="fixed inset-0 z-[150000] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md animate-in fade-in duration-300 p-6"
      onClick={() => setShowQuarantineModal(false)}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full blur-[110px] pointer-events-none mix-blend-screen"
        style={{
          backgroundColor: "color-mix(in srgb, var(--danger) 14%, transparent)",
        }}
      />

      <div
        className="relative w-full max-w-2xl glass-panel sanctuary-modal-glass backdrop-blur-2xl border rounded-3xl p-8 md:p-10 flex flex-col items-center text-center gap-6 overflow-hidden animate-in zoom-in-95 duration-300"
        style={{
          color: "var(--text)",
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

        <div className="absolute top-5 right-5 z-30 flex items-center bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1">
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_close", "close")}
              tooltip={t("cancel", "Cancel")}
              variant="danger"
              onClick={() => setShowQuarantineModal(false)}
            />
          </PanelHeaderGroup>
        </div>

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

        <div className="flex flex-col items-center gap-2 relative z-10 w-full">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none text-[var(--danger)] drop-shadow-md m-0">
            {t("malware_alert_title", "Malware Detected")}
          </h2>
          <span className="text-[10px] font-black uppercase tracking-[0.35em] text-[var(--danger)] opacity-85">
            {t("urgent_alert", "Quarantine")}
          </span>

          <div
            className="w-36 h-px my-2 opacity-60"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--danger), transparent)",
            }}
          />

          <p className="text-sm font-medium text-[var(--text)] opacity-90 leading-relaxed max-w-lg m-0">
            {t("quarantine_modal_desc", "These files are highly volatile and have been structurally disabled to protect your environment.")}
          </p>
        </div>

        <div className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-2xl p-4 max-h-72 overflow-y-auto custom-scrollbar flex flex-col gap-2.5 text-left relative z-10">
          {quarantineList.length > 0 ? (
            quarantineList.map((q: string) => (
              <div
                key={q}
                className="flex justify-between items-center glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5 rounded-xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-colors gap-4"
              >
                <span className="font-mono text-xs opacity-90 truncate flex-1">{q}</span>
                <div className="flex gap-2 shrink-0">
                  <ActionButton
                    variant="success"
                    icon={t("icon_restore", "restore")}
                    label={t("quarantine_modal_restore", "Restore File")}
                    onClick={() => restoreMod(q)}
                    className="!px-3.5 !py-2"
                  />
                  <ActionButton
                    variant="danger"
                    icon={t("icon_delete", "delete")}
                    label={t("quarantine_modal_purge", "{Delete} Permanently")}
                    onClick={() => purgeMod(q)}
                    className="!px-3.5 !py-2"
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="text-[var(--text)] text-center opacity-50 p-4 italic">
              {t("quarantine_modal_empty", "Quarantine is empty!")}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 w-full mt-2 pt-5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-10">
          <ActionButton
            variant="glass"
            icon={t("icon_close", "close")}
            label={t("cancel", "Cancel")}
            onClick={() => setShowQuarantineModal(false)}
            className="w-full !py-3.5"
          />
        </div>
      </div>
    </div>
  );
}
