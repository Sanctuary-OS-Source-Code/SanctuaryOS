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
      <div className="flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 px-2">
        <span className="material-symbols-outlined !text-[24px] text-[var(--info)] opacity-80">bolt</span>
        <h2 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("quick_actions")}</h2>
      </div>
      
      <div className="flex flex-col gap-4">
    <button onClick={() => setIsBulkMode(!isBulkMode)} className={`w-full p-5 glass-panel border rounded-2xl transition-all text-left group relative flex items-center gap-4 ${isBulkMode ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]'}`}>
          <div className={`w-12 h-12 rounded-xl glass-surface border flex items-center justify-center shrink-0 transition-colors ${isBulkMode ? 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)] border-[color-mix(in_srgb,var(--success)_50%,transparent)] text-emerald-500' : 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-emerald-500 shadow-md'}`}>
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-md">{t("icon_checklist")}</span>
          </div>
          <div>
            <div className={`text-[10px] font-black capitalize tracking-widest mb-1 transition-colors ${isBulkMode ? 'text-emerald-400' : 'text-emerald-500 group-hover:text-emerald-400'}`}>{t("ui_btn_bulk")}</div>
            <div className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed">{t("ui_btn_bulk_desc")}</div>
          </div>
        </button>

    <button onClick={() => setLocalFolderModal(true)} className="w-full p-5 glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all text-left group relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl glass-surface border flex items-center justify-center shrink-0 transition-colors border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-purple-500 shadow-md">
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-md">{t("icon_account_tree")}</span>
          </div>
          <div>
            <div className="text-[10px] font-black capitalize tracking-widest mb-1 transition-colors text-purple-500 group-hover:text-purple-400">{t("ui_btn_edit_folder")}</div>
            <div className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed">{t("ui_btn_edit_folder_desc")}</div>
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
    }} className="w-full p-5 glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all text-left group relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl glass-surface border flex items-center justify-center shrink-0 transition-colors border-[color-mix(in_srgb,var(--danger)_30%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-rose-500 shadow-md">
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-md">{t("icon_delete_sweep")}</span>
          </div>
          <div>
            <div className="text-[10px] font-black capitalize tracking-widest mb-1 transition-colors text-rose-500 group-hover:text-rose-400">{t("btn_purge_archives")}</div>
            <div className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed text-rose-500">{t("purge_archives_desc")}</div>
          </div>
        </button>

    <button onClick={() => useStore.getState().setView("nexus")} className="w-full p-5 glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] transition-all text-left group relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl glass-surface border flex items-center justify-center shrink-0 transition-colors border-[color-mix(in_srgb,var(--warning)_30%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-amber-500 shadow-md">
            <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-md">{t("icon_auto_awesome")}</span>
          </div>
          <div>
            <div className="text-[10px] font-black capitalize tracking-widest mb-1 transition-colors text-amber-500 group-hover:text-amber-400">{t("tab_nexus")}</div>
            <div className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 leading-relaxed text-amber-500">{t("hub_title_market")}</div>
          </div>
        </button>
      </div>
    </div>
  );
}


