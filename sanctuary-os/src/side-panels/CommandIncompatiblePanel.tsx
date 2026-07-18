import React, { useMemo, useState } from "react";
import { SidePanel, formatDisplayName, isVersionMatch, mapDlcCode, getHighestVersion } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";

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
      let alertType = 'red';

      let isBroken = typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken';
      if (isBroken && mod.compatible_versions && mod.compatible_versions.length > 0 && selectedVersion) {
        if (selectedVersion !== getHighestVersion(mod.compatible_versions)) {
          isBroken = false;
        }
      }
      if (isBroken || mod.compliance_tier === 3 || mod.compliance_tier === 4) {
        reason = t("bp_status_broken_noncompliant");
        alertType = 'red';
      } else if (mod.compatible_versions && selectedVersion && !isVersionMatch(mod.compatible_versions, selectedVersion)) {
        reason = t("bp_status_version_mismatch");
        alertType = 'red';
      } else {
        if (mod.requiredDLC) {
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
            alertType = 'red';
          }
        }

        if (!reason && mod.dependencies) {
          let rawDeps: string[] = [];
          if (typeof mod.dependencies === 'string') {
            rawDeps = mod.dependencies.split(',').map((s: string) => s.trim());
          } else if (Array.isArray(mod.dependencies)) {
            rawDeps = [...mod.dependencies];
          }
          if (rawDeps.length > 0) {
            const activeModNames = activeMods.map((m: any) => (m._originalSetName || m.name)?.toLowerCase());
            const missing = rawDeps.filter((req: string) => !activeModNames.includes(req.toLowerCase()));
            if (missing.length > 0) {
              reason = `${t("missing_deps")}: ${missing.join(", ")}`;
              alertType = 'red';
            }
          }
        }

        if (!reason && typeof mod.status === 'string' && mod.status.toLowerCase() === 'unstable') {
          reason = t("bp_status_unstable");
          alertType = 'amber';
        }
      }

      if (reason) {
        return { ...mod, _alert_reason: reason, _alert_type: alertType };
      }
      return null;
    }).filter(Boolean).sort((a: any, b: any) => {
      if (a._alert_type === 'red' && b._alert_type === 'amber') return -1;
      if (a._alert_type === 'amber' && b._alert_type === 'red') return 1;
      return 0;
    });
  }, [activeMods, selectedVersion, ownedDLC, maskedDLC, t]);

  const redMods = useMemo(() => brokenMods.filter((m: any) => m._alert_type === 'red'), [brokenMods]);
  const amberMods = useMemo(() => brokenMods.filter((m: any) => m._alert_type === 'amber'), [brokenMods]);

  if (!isOpen) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("citizen_action_incompatible")}
      subtitle={t("incompatible_broken")}
      icon={redMods.length > 0 ? "gpp_bad" : "gpp_maybe"}
      iconColorClass={redMods.length > 0 ? "theme-text-danger border-[var(--danger)]/30" : "text-amber-500 border-amber-500/30"}
      widthClass="w-[550px]"
    >
      <div className="flex flex-col gap-4 w-full">
        <div className="px-1 py-2 shrink-0 flex flex-col gap-4 relative">
          <div className="flex items-center justify-between w-full relative z-10">
            <h3 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-[0.2em] opacity-80">{t("incompatible_broken")}</h3>
            {brokenMods.length > 0 ? (
              <div className="flex gap-2">
                {redMods.length > 0 && (
                  <span className="text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3 py-1 rounded-full text-[9px] font-black shadow-inner flex items-center gap-1.5">
                    {redMods.length} {t("items")}
                  </span>
                )}
                {amberMods.length > 0 && (
                  <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full text-[9px] font-black shadow-inner flex items-center gap-1.5">
                    {amberMods.length} {t("items")}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[var(--subtext)] opacity-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                {t("auto_0")} {t("items")}
              </span>
            )}
          </div>

          {allow_write && brokenMods.length > 0 && (
            <div className="flex gap-2 w-full">
              {redMods.length > 0 && (
                <button onClick={() => {
                  redMods.forEach((m: any) => toggleInActiveSet && toggleInActiveSet(m._originalSetName || m.name, true, true));
                }} className={`flex-1 py-3 rounded-xl bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 border border-[var(--danger)]/30 hover:border-[var(--danger)]/50 text-[10px] font-black uppercase tracking-widest relative z-10 flex items-center justify-center gap-2 transition-all active:scale-95`}>
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_sweep")}</span>
                  {(t("bp_purge_corrupted")).replace("{0}", String(redMods.length))}
                </button>
              )}
              {amberMods.length > 0 && (
                <button onClick={() => {
                  amberMods.forEach((m: any) => toggleInActiveSet && toggleInActiveSet(m._originalSetName || m.name, true, true));
                }} className={`flex-1 py-3 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-[10px] font-black uppercase tracking-widest relative z-10 flex items-center justify-center gap-2 transition-all active:scale-95`}>
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_sweep")}</span>
                  {(t("bp_purge_unstable")).replace("{0}", String(amberMods.length))}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pb-24">
          {brokenMods.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4 py-12">
              <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">{t("icon_security")}</span>
              <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("optimal")}</p>
            </div>
          ) : (
            brokenMods.map((mod: any) => {
              const isIgnored = ignoredBroken.has(mod.name);
              const isAmber = mod._alert_type === 'amber';
              return (
                <div
                  key={mod.name}
                  className={`w-full rounded-[var(--radius)] border transition-all duration-500 relative overflow-hidden group/alert shrink-0 flex items-center ${isIgnored ? 'border-white/5 bg-black/20 opacity-50' : isAmber ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] shadow-lg' : 'border-[var(--danger)]/30 bg-[var(--danger)]/5 hover:bg-[var(--danger)]/10 hover:border-[var(--danger)]/50 hover:shadow-[0_0_30px_rgba(var(--danger-rgb),0.15)] shadow-lg'
                    }`}
                >

                  <div className="relative p-6 z-10 flex items-center gap-5 w-full">
                    <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${isIgnored ? 'border-white/10 bg-black/50' : isAmber ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-[var(--danger)]/50 bg-[var(--danger)]/10 shadow-[0_0_20px_rgba(var(--danger-rgb),0.2)]'
                      }`}>
                      <span className={`material-symbols-outlined !text-[24px] ${isIgnored ? 'text-[var(--text)] opacity-30' : isAmber ? 'text-amber-400' : 'theme-text-danger'}`}>{isAmber ? "gpp_maybe" : "gpp_bad"}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-black text-[var(--text)] uppercase break-words">
                            {formatDisplayName(mod.name)}
                          </span>
                          <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20 w-fit">
                            {mod.version || "v.Local"}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const newSet = new Set(ignoredBroken);
                            if (isIgnored) newSet.delete(mod.name);
                            else newSet.add(mod.name);
                            setIgnoredBroken(newSet);
                          }}
                          className="text-[9px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] px-4 py-1.5 rounded-full uppercase transition-all active:scale-95 shrink-0 ml-4"
                        >
                          {isIgnored ? t("bp_restore_alert") : t("btn_ignore")}
                        </button>
                      </div>
                      <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest block mt-1">
                        {mod._alert_reason}
                      </span>
                    </div>

                    {allow_write && !isIgnored && toggleInActiveSet && (
                      <button
                        onClick={() => toggleInActiveSet(mod._originalSetName || mod.name, true, true)}
                        className={`shrink-0 w-10 h-10 rounded-full border font-black transition-all backdrop-blur-md active:scale-95 flex items-center justify-center ${isAmber ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/30 hover:border-amber-500/60 hover:text-amber-200 hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-[var(--danger)]/10 border-[var(--danger)]/30 theme-text-danger hover:bg-[var(--danger)]/30 hover:border-[var(--danger)]/60 hover:text-[var(--danger)] hover:shadow-[0_0_15px_rgba(var(--danger-rgb),0.4)]'}`}
                      >
                        <span className="material-symbols-outlined !text-lg">{t("icon_close")}</span>
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
