import React from "react";
import { useLexicon } from "../LexiconContext";
import { ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../shared";

export function RenameModal({ renameModal, setRenameModal, executeRename, renameTarget, setRenameTarget, nameInput, setNameInput, confirmRename }: any) {
  const { t } = useLexicon();

  if (!renameModal && !renameTarget) return null;

  const isOpen = Boolean(renameModal || renameTarget);
  if (!isOpen) return null;

  const value = renameModal ? renameModal.newName : nameInput;
  const onChange = (val: string) => {
    if (renameModal) setRenameModal({ ...renameModal, newName: val });
    else setNameInput(val);
  };
  const onCancel = () => {
    if (renameModal) setRenameModal(null);
    else setRenameTarget(null);
  };
  const onConfirm = () => {
    if (renameModal) executeRename();
    else confirmRename();
  };

  return (
    <div
      className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/35 backdrop-blur-md animate-in fade-in duration-300 p-6"
      onClick={onCancel}
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
          style={{ backgroundColor: "var(--accent)" }}
        />

        {/* SidePanel-style Header */}
        <div className="pt-6 px-6 pb-5 md:pt-7 md:px-8 shrink-0 relative z-20 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl glass-panel before:!hidden border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] flex items-center justify-center shadow-lg shrink-0 relative">
              <span className="material-symbols-outlined !text-[24px] md:!text-[26px] drop-shadow-[0_0_12px_currentColor]">
                {t("icon_edit", "edit")}
              </span>
            </div>
            <div className="flex flex-col min-w-0 justify-center">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)]">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shadow-[0_0_8px_currentColor]" />
                  {renameModal ? t("rename_desc") : t("redesignate_label")}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight truncate drop-shadow-md m-0">
                {t("rename_title")}
              </h2>
            </div>
          </div>

          <div className="flex items-center z-50 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1 gap-1 shrink-0">
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_close", "close")}
                tooltip={renameModal ? t("nav_cancel") : t("btn_abort")}
                variant="danger"
                onClick={onCancel}
              />
            </PanelHeaderGroup>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8 flex flex-col gap-4 relative z-10">
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onConfirm()}
            className="w-full glass-surface before:!hidden px-5 py-4 rounded-2xl text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
          />
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-5 md:px-8 md:pb-7 flex items-center justify-end gap-3 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
          <ActionButton
            variant="glass"
            icon={t("icon_close", "close")}
            label={renameModal ? t("nav_cancel") : t("btn_abort")}
            onClick={onCancel}
          />
          <ActionButton
            variant="accent"
            icon={t("icon_check", "check")}
            label={renameModal ? t("btn_rename") : t("btn_confirm")}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}


