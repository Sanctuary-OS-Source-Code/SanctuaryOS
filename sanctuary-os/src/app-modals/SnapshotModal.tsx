import React from "react";
import { useLexicon } from "../LexiconContext";
import { ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useStore } from "../store";

export function SnapshotModal({ snapshotModal, setSnapshotModal, snapshotName, setSnapshotName, executeSnapshot }: any) {
  const { t } = useLexicon();
  const { playSets, activePlaySetIndex } = useStore();

  if (!snapshotModal) return null;

  return (
    <div
      className="fixed inset-0 z-[15000] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md animate-in fade-in duration-300 p-6"
      onClick={() => setSnapshotModal(false)}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-[110px] pointer-events-none mix-blend-screen"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)",
        }}
      />

      <div
        className="relative w-full max-w-lg glass-panel sanctuary-modal-glass backdrop-blur-2xl border rounded-3xl p-8 md:p-10 flex flex-col items-center text-center gap-6 overflow-hidden animate-in zoom-in-95 duration-300"
        style={{
          borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
          boxShadow:
            "0 35px 90px color-mix(in srgb, var(--accent) 20%, transparent), inset 0 0 36px color-mix(in srgb, var(--accent) 8%, transparent), inset 0 1px 1px rgba(255, 255, 255, 0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute top-0 left-0 w-full h-[2px] opacity-85 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 75%, transparent), transparent)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-full h-px opacity-75 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 45%, transparent), transparent)",
          }}
        />

        <div className="absolute top-5 right-5 z-30 flex items-center bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1">
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_close", "close")}
              tooltip={t("cancel", "Cancel")}
              variant="danger"
              onClick={() => setSnapshotModal(false)}
            />
          </PanelHeaderGroup>
        </div>

        {/* Centered Circular Beacon Emblem */}
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center shrink-0 border-2 z-10 mt-1"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
            borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
            boxShadow:
              "0 0 30px color-mix(in srgb, var(--accent) 20%, transparent), inset 0 0 20px color-mix(in srgb, var(--accent) 10%, transparent)",
          }}
        >
          <span
            className="material-symbols-outlined !text-[34px]"
            style={{
              color: "var(--accent)",
              filter: "drop-shadow(0 0 14px var(--accent))",
            }}
          >
            {t("icon_archive", "archive")}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 relative z-10 w-full">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none text-[var(--text)] drop-shadow-md m-0">
            {t("snapshot_title", "Snapshot Active Loadout")}
          </h2>
          <span className="text-[10px] font-black uppercase tracking-[0.35em] text-[var(--accent)] opacity-85">
            {t("snapshot_desc1", "Enter a name to capture all")} {playSets[activePlaySetIndex]?.mods?.length || 0} {t("snapshot_desc2", "currently active {mods}.")}
          </span>

          <div
            className="w-36 h-px my-2 opacity-60"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--accent), transparent)",
            }}
          />

          <input
            autoFocus
            type="text"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && executeSnapshot()}
            placeholder={t("snapshot_placeholder", "e.g., Decades Challenge...")}
            className="w-full glass-surface px-5 py-4 rounded-2xl text-sm font-bold text-center text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3.5 w-full mt-2 pt-5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-10">
          <ActionButton
            variant="glass"
            icon={t("icon_close", "close")}
            label={t("cancel", "Cancel")}
            onClick={() => setSnapshotModal(false)}
            className="w-full !py-3.5"
          />
          <ActionButton
            variant="accent"
            icon={t("icon_save", "save")}
            label={t("hub_save", "Save")}
            onClick={executeSnapshot}
            className="w-full !py-3.5"
          />
        </div>
      </div>
    </div>
  );
}
