import React from 'react';
import { isVersionMatch } from "../../shared";

export function VaultSidebar({
  t,
  isBulkMode,
  setIsBulkMode,
  setLocalFolderModal,
  displayModList,
  selectedVersion,
  setPurgeTargetFiles,
  useStore
}: any) {
  return (
    <div className="w-full xl:w-[320px] shrink-0 xl:sticky xl:top-0 space-y-6">
      <div className="flex items-center gap-4 border-b border-white/5 pb-4 px-2">
        <span className="material-symbols-outlined !text-[24px] text-[var(--info)] opacity-80">bolt</span>
        <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text)]">{t("quick_actions") || "QUICK ACTIONS"}</h2>
      </div>
      
      <div className="flex flex-col gap-4">
        <button onClick={() => setIsBulkMode(!isBulkMode)} className={`w-full p-5 theme-glass-panel border rounded-[var(--radius)] transition-all text-left group relative overflow-hidden flex items-center gap-4 ${isBulkMode ? 'bg-emerald-500/10 border-emerald-500/50' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-white/5 hover:border-emerald-500/30'}`}>
          <div className={`w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors ${isBulkMode ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500' : 'border-emerald-500/30 group-hover:bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}>
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">{t("icon_checklist") || "checklist"}</span>
          </div>
          <div>
            <div className={`text-[10px] font-black uppercase tracking-widest mb-1 transition-colors ${isBulkMode ? 'text-emerald-400' : 'text-emerald-500 group-hover:text-emerald-400'}`}>{t("ui_btn_bulk") || "BULK OVERRIDE"}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed">{t("ui_btn_bulk_desc") || "MASS SELECTION AND ACTION TARGETING"}</div>
          </div>
        </button>

        <button onClick={() => setLocalFolderModal(true)} className="w-full p-5 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] hover:bg-white/5 hover:border-purple-500/30 transition-all text-left group relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors border-purple-500/30 group-hover:bg-purple-500/10 text-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">{t("icon_account_tree") || "account_tree"}</span>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest mb-1 transition-colors text-purple-500 group-hover:text-purple-400">{t("ui_btn_edit_folder") || "CONFIGURE VIRTUAL NODES"}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed">{t("ui_btn_edit_folder_desc") || "MANAGE VIRTUAL MOUNT POINTS"}</div>
          </div>
        </button>

        <button onClick={() => {
          const allFilesToPurge = new Map<string, string>();
          displayModList.forEach((mod: any) => {
            let modGameVersions: string[] = [];
            if (mod.isVirtual) {
              modGameVersions = Array.from(new Set((mod.flavors || []).flatMap((f: any) => {
                const v = f.compatible_versions;
                if (!v) return [];
                if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean);
                return Array.isArray(v) ? v : [];
              }))).filter(Boolean) as string[];
            } else {
              const v = mod.compatible_versions;
              if (typeof v === 'string') {
                modGameVersions = v.split(',').map((s: string) => s.trim()).filter(Boolean);
              } else {
                modGameVersions = Array.isArray(v) ? v : [];
              }
            }

            let isCompatibleWithOS = true;
            if (selectedVersion && selectedVersion !== "") {
              isCompatibleWithOS = isVersionMatch(modGameVersions, selectedVersion);
            }

            if (!isCompatibleWithOS || mod.status === 'outdated' || mod.status === 'unverified') {
              if (mod.isVirtual && mod.flavors) {
                mod.flavors.forEach((f: any) => {
                  if (f.name) allFilesToPurge.set(f.name, mod.displayName || mod.name);
                });
              } else if (mod.name) {
                allFilesToPurge.set(mod.name, mod.displayName || mod.name);
              }
            }
          });
          setPurgeTargetFiles(Array.from(allFilesToPurge.entries()).map(([file, name]) => ({ file, name })));
        }} className="w-full p-5 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] hover:bg-white/5 hover:border-rose-500/30 transition-all text-left group relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors border-rose-500/30 group-hover:bg-rose-500/10 text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">{t("icon_delete_sweep") || "delete_sweep"}</span>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest mb-1 transition-colors text-rose-500 group-hover:text-rose-400">{t("btn_purge_archives") || "PURGE ARCHIVES"}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed text-rose-500">{t("purge_archives_desc") || "CLEAN UP OUTDATED ARTIFACTS"}</div>
          </div>
        </button>

        <button onClick={() => useStore.getState().setView("nexus")} className="w-full p-5 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] hover:bg-white/5 hover:border-amber-500/30 transition-all text-left group relative overflow-hidden flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors border-amber-500/30 group-hover:bg-amber-500/10 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">{t("icon_auto_awesome") || "auto_awesome"}</span>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest mb-1 transition-colors text-amber-500 group-hover:text-amber-400">{t("tab_nexus") || "NEXUS"}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed text-amber-500">{t("hub_title_market") || "NEXUS CORE"}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
