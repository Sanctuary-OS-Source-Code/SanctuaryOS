import React, { useMemo, useState } from "react";
import { SidePanel, formatDisplayName, isVersionMatch, mapDlcCode } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";

export default function CommandIncompatiblePanel({
  isOpen, onClose, activeMods, allow_write, toggleInActiveSet
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion } = useStore();
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());

  const brokenMods = useMemo(() => {
    return activeMods.map((mod: any) => {
      if (mod.isFallback) return null;

      let reason = null;

      if ((typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken') || mod.compliance_tier === 3 || mod.compliance_tier === 4) {
        reason = t("bp_status_broken_noncompliant") || "BROKEN / NON-COMPLIANT";
      } else {
        if (mod.compatible_versions && selectedVersion && !isVersionMatch(mod.compatible_versions, selectedVersion)) {
           reason = t("bp_status_version_mismatch");
        } else if (mod.requiredDLC) {
           let rawDLC: string[] = [];
           if (typeof mod.requiredDLC === 'string') {
             rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
           } else if (Array.isArray(mod.requiredDLC)) {
             rawDLC = [...mod.requiredDLC];
           }
           const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
           const missing = rawDLC.filter((req: string) => {
               const cleanReq = req.toUpperCase().trim();
               if (cleanReq === 'BASE') return false;
               return !activeDLC.some((owned: string) => owned.toUpperCase() === cleanReq);
           });
           if (missing.length > 0) {
              const missingNames = missing.map((m: string) => mapDlcCode(m)).join(", ");
              reason = `${t("bp_status_missing_dlc")}${missingNames}`;
           }
        }
      }

      if (reason) {
        return { ...mod, _alert_reason: reason };
      }
      return null;
    }).filter(Boolean);
  }, [activeMods, selectedVersion, ownedDLC, maskedDLC, t]);

  if (!isOpen) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("cmd_citizen_action_incompatible") || "INCOMPATIBLE"}
      subtitle={t("cmd_incompatible_broken") || "Incompatible / Broken"}
      icon={t("ui_icon_warning") || "warning"}
      iconColorClass="text-amber-500"
      widthClass="w-[500px]"
    >
      <div className="flex-1 min-h-0 flex flex-col gap-6 w-full">
        <div className="p-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-between theme-glass-panel rounded-3xl mt-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent pointer-events-none" />
          <h3 className="text-xs font-black text-[var(--subtext)] uppercase tracking-widest relative z-10">{t("cmd_incompatible_broken")}</h3>
          <span className="text-rose-400 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-rose-500/30 px-4 py-1.5 rounded-full text-[10px] font-black shadow-inner flex items-center gap-2 relative z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            {brokenMods.length} {t("modcard_artifacts")}
          </span>
        </div>
        
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {brokenMods.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4 py-12">
              <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">{t("ui_icon_shield") || "shield"}</span>
              <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("cmd_optimal") || "All systems are fully optimal"}</p>
            </div>
          ) : (
            brokenMods.map((mod: any) => {
              const isIgnored = ignoredBroken.has(mod.name);
              return (
                <div 
                  key={mod.name} 
                  className={`theme-glass-panel rounded-[2rem] border transition-all duration-500 relative overflow-hidden group/alert shrink-0 ${
                    isIgnored ? 'border-white/5 opacity-50' : 'border-rose-500/30 hover:border-rose-500/50 hover:shadow-[0_0_30px_rgba(244,63,94,0.1)]'
                  }`}
                >
                  <div className={`absolute inset-0 transition-opacity duration-500 ${isIgnored ? 'opacity-0' : 'bg-gradient-to-br from-rose-500/10 to-transparent opacity-100'}`} />
                  
                  <div className="relative p-6 z-10 flex items-center gap-5 w-full">
                    <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${
                      isIgnored ? 'border-white/10 bg-black/50' : 'border-rose-500/50 bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                    }`}>
                      <span className={`material-symbols-outlined !text-[24px] ${isIgnored ? 'text-[var(--text)] opacity-30' : 'text-rose-400'}`}>warning</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-black text-[var(--text)] uppercase break-words">
                          {formatDisplayName(mod.name)}
                        </span>
                        <button 
                          onClick={() => {
                            const newSet = new Set(ignoredBroken);
                            if (isIgnored) newSet.delete(mod.name);
                            else newSet.add(mod.name);
                            setIgnoredBroken(newSet);
                          }}
                          className="text-[9px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] px-4 py-1.5 rounded-full uppercase transition-all active:scale-95 shrink-0 ml-4"
                        >
                          {isIgnored ? t("bp_restore_alert") : t("bp_ignore_alert")}
                        </button>
                      </div>
                      <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest block mt-1">
                        {mod._alert_reason}
                      </span>
                    </div>
                    
                    {allow_write && !isIgnored && toggleInActiveSet && (
                      <button 
                        onClick={() => toggleInActiveSet(mod._originalSetName || mod.name, true, true)}
                        className="shrink-0 w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-black transition-all hover:bg-red-500/30 hover:border-red-500/60 hover:text-red-200 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] backdrop-blur-md active:scale-95 flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined !text-lg">{t("ui_icon_close") || "close"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </SidePanel>
  );
}
