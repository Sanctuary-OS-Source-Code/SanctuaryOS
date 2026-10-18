import React from "react";
import { useLexicon } from "../LexiconContext";
import { ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../shared";

export function QuarantineModal({ showQuarantineModal, setShowQuarantineModal, quarantineList, restoreMod, purgeMod }: any) {
  const { t } = useLexicon();

  if (!showQuarantineModal) return null;

  return (
    <div
      className="fixed inset-0 z-[150000] flex items-center justify-center bg-black/35 backdrop-blur-md animate-in fade-in duration-300 p-6"
      onClick={() => setShowQuarantineModal(false)}
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col backdrop-blur-[var(--glassBlur)] animate-in zoom-in-95 duration-300"
        style={{
          color: "var(--text)",
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
                  {t("urgent_alert", "Quarantine")}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight truncate drop-shadow-md m-0">
                {t("quarantine_modal_title")}
              </h2>
            </div>
          </div>

          <div className="flex items-center z-50 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1 gap-1 shrink-0">
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_close", "close")}
                tooltip={t("nav_cancel")}
                variant="danger"
                onClick={() => setShowQuarantineModal(false)}
              />
            </PanelHeaderGroup>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8 flex flex-col gap-4 relative z-10">
          <p className="text-xs font-medium text-[var(--subtext)] opacity-85 m-0">
            {t("quarantine_modal_desc")}
          </p>

          <div className="glass-surface before:!hidden border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-2xl p-4 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-2.5">
            {quarantineList.length > 0 ? (
              quarantineList.map((q: string) => (
                <div
                  key={q}
                  className="flex justify-between items-center glass-panel before:!hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5 rounded-xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-colors gap-4"
                >
                  <span className="font-mono text-xs opacity-90 truncate flex-1">{q}</span>
                  <div className="flex gap-2 shrink-0">
                    <ActionButton
                      variant="success"
                      icon={t("icon_restore", "restore")}
                      label={t("quarantine_modal_restore")}
                      onClick={() => restoreMod(q)}
                      className="!px-3.5 !py-2"
                    />
                    <ActionButton
                      variant="danger"
                      icon={t("icon_delete", "delete")}
                      label={t("quarantine_modal_purge")}
                      onClick={() => purgeMod(q)}
                      className="!px-3.5 !py-2"
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[var(--text)] text-center opacity-50 p-4 italic">
                {t("quarantine_modal_empty")}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-5 md:px-8 md:pb-7 flex items-center justify-end gap-3 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
          <ActionButton
            variant="glass"
            icon={t("icon_close", "close")}
            label={t("nav_cancel")}
            onClick={() => setShowQuarantineModal(false)}
          />
        </div>
      </div>
    </div>
  );
}


