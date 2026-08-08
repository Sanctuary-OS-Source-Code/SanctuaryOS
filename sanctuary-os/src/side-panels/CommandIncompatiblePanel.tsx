import React, { useMemo, useState, useEffect } from "react";
import { SidePanel, formatDisplayName, isVersionMatch, mapDlcCode, getHighestVersion, HoverTooltip, getModIcon } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";

export function IncompatibleModCard({ mod, isIgnored, isAmber, setIgnoredBroken, ignoredBroken, toggleInActiveSet, allow_write, t, activeGameSchema }: any) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [delayedFlipped, setDelayedFlipped] = useState(false);

  useEffect(() => {
    if (isFlipped) {
      setDelayedFlipped(true);
    } else {
      const timer = setTimeout(() => setDelayedFlipped(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isFlipped]);

  const iconName = isIgnored ? "visibility_off" : isAmber ? "gpp_maybe" : "gpp_bad";
  const showImages = useStore((state: any) => state.showImages);
  const image = (showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "") ? (mod.image_url || mod.imageUrl) : undefined;
  
  return (
    <div className="relative group/shadow h-[250px] shadow-xl [perspective:1000px] transition-all duration-500 hover:-translate-y-1 z-10 hover:z-[100]" style={{ borderRadius: 'var(--radius)' }}>
      <div className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        
        <UniversalCard
          layout="vertical-compact"
          isGhosted={isIgnored}
          image={image}
          icon={!image ? getModIcon(mod, activeGameSchema, t) : undefined}
          statusColor={isIgnored ? "border-[color-mix(in_srgb,var(--text)_5%,transparent)]" : isAmber ? "border-amber-500/30" : "theme-border-danger"}
          className={`w-full h-full [backface-visibility:hidden] [transform:translateZ(0)] ${isIgnored ? "bg-black/20 opacity-50 grayscale" : isAmber ? "bg-amber-500/5 hover:bg-amber-500/10" : "bg-[var(--danger)]/5 hover:bg-[var(--danger)]/10"}`}
          title={formatDisplayName(mod.displayName || mod.name)}
          subtitle={
            <div className="flex items-center gap-1.5 opacity-80 mt-0.5">
               <span>{mod.author || t("unknown_mason") || "Unknown Mason"}</span>
            </div>
          }
          actions={
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                onClick={(e) => { e.stopPropagation(); setIsFlipped(true); }}
                className={`relative group/actionbtn w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 pointer-events-auto ${isIgnored ? 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)]' : isAmber ? 'bg-amber-500/[15%] border-amber-500/[30%] text-amber-500' : 'theme-panel-danger border-[var(--danger)] text-[var(--text)]'}`}
              >
                <span className="material-symbols-outlined !text-[16px]">{iconName}</span>
                {!isFlipped && !delayedFlipped && (
                  <HoverTooltip
                    className="z-[100] !right-0 !translate-x-0 !left-auto"
                    variant={isIgnored ? "default" : isAmber ? "warning" : "danger"}
                    title={isIgnored ? t("bp_restore_alert") : isAmber ? t("bp_pill_unstable") : t("bp_pill_corrupted")}
                    subtitle={mod._alert_reason}
                  />
                )}
              </button>
            </div>
          }
          badges={
            <div className="flex flex-wrap items-center gap-2">
               <div className="backdrop-blur-md bg-cyan-400/10 border border-cyan-400/30 px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] shadow-sm flex items-center gap-1">
                 <span className="text-[7px] font-black uppercase tracking-widest text-cyan-400">{mod.version || "v.Local"}</span>
               </div>
            </div>
          }
        />

        {delayedFlipped && (
          <div className="absolute inset-0 z-[100] pointer-events-none [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <div className={`pointer-events-auto relative h-full w-full glass-panel [box-shadow:inset_0_1px_1px_rgba(255,255,255,0.1)_!important] flex flex-col border overflow-hidden [transform:translateZ(0)] ${isAmber ? 'border-amber-500/[30%]' : 'border-red-500/[30%]'}`} style={{ borderRadius: 'var(--radius)' }}>
              
              <div className="relative z-10 pt-5 pb-1 flex flex-col items-center justify-center gap-2 shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-inner ${isAmber ? 'bg-amber-500/[5%] border-amber-500/[20%]' : 'bg-red-500/[5%] border-red-500/[20%]'}`}>
                  <span className={`material-symbols-outlined !text-[20px] ${isAmber ? 'text-amber-500' : 'text-[var(--danger)]'}`}>
                    {iconName}
                  </span>
                </div>
                <span className={`text-[12px] font-black uppercase tracking-widest text-center px-4 leading-normal ${isAmber ? 'text-amber-500' : 'text-[var(--danger)]'}`}>
                  {isAmber ? t("bp_pill_unstable") : t("bp_pill_corrupted")}
                </span>
              </div>

              <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar px-5 flex flex-col gap-2 mb-4">
                 <div className="flex items-start gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm p-3 rounded-2xl">
                    <span className={`material-symbols-outlined !text-[16px] shrink-0 mt-0.5 ${isAmber ? 'text-amber-500' : 'text-[var(--danger)]'}`}>info</span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-[8px] font-black opacity-70 uppercase tracking-widest ${isAmber ? 'text-amber-500' : 'text-[var(--danger)]'}`}>{t("directive_note")}</span>
                      <span className={`text-[10px] font-mono font-black uppercase tracking-widest leading-tight ${isAmber ? 'text-amber-500' : 'text-[var(--danger)]'}`}>{mod._alert_reason}</span>
                    </div>
                 </div>
              </div>

              <div className="w-full z-20 px-4 pb-4 pt-1 flex flex-row gap-2 shrink-0 isolate">
                 <button onClick={(e) => { 
                    e.stopPropagation(); 
                    const newSet = new Set(ignoredBroken);
                    if (isIgnored) newSet.delete(mod.name);
                    else newSet.add(mod.name);
                    setIgnoredBroken(newSet);
                    setIsFlipped(false); 
                 }} className={`flex-1 min-w-0 py-2 rounded-[16px] border font-black text-[10px] uppercase tracking-widest px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)]`}>
                    {isIgnored ? t("bp_restore_alert") : t("btn_ignore")}
                 </button>
                 {allow_write && toggleInActiveSet && (
                   <button onClick={(e) => { 
                      e.stopPropagation(); 
                      toggleInActiveSet(mod._originalSetName || mod.name, true, true);
                      setIsFlipped(false); 
                   }} className={`flex-1 min-w-0 py-2 rounded-[16px] border font-black text-[10px] uppercase tracking-widest px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all ${isAmber ? 'bg-amber-500/[10%] border-amber-500/[30%] text-amber-500' : 'bg-red-500/[10%] border-red-500/[30%] text-[var(--danger)]'}`}>
                      {t("icon_delete")}
                   </button>
                 )}
                 <button onClick={(e) => { e.stopPropagation(); setIsFlipped(false); }} className="flex-1 min-w-0 py-2 rounded-[16px] border border-[color-mix(in_srgb,var(--safe)_30%,transparent)] bg-[color-mix(in_srgb,var(--safe)_10%,transparent)] text-[var(--safe)] font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words">
                    {t("btn_back") || "BACK"}
                 </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommandIncompatiblePanel({
  isOpen, onClose, activeMods, allow_write, toggleInActiveSet
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, activeGameSchema } = useStore();
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
          <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest">
            <span>{brokenMods.length} {t("items")}</span>
            {(redMods.length > 0 || amberMods.length > 0) && <span className="opacity-50">•</span>}
            {redMods.length > 0 && <span className="text-red-400">{redMods.length} {t("bp_pill_corrupted")}</span>}
            {amberMods.length > 0 && <span className="text-amber-400">{amberMods.length} {t("bp_pill_unstable")}</span>}
            {brokenMods.length === 0 && <span className="text-[var(--success)]">• {t("auto_0")} {t("items")}</span>}
          </div>
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

        <div className={brokenMods.length === 0 ? "flex flex-col gap-3 pb-24" : "grid grid-cols-2 gap-4 pb-24"}>
          {brokenMods.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4 py-12">
              <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">gpp_bad</span>
              <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("no_incompatible_detected")}</p>
            </div>
          ) : (
            brokenMods.map((mod: any) => (
               <IncompatibleModCard
                 key={mod.name}
                 mod={mod}
                 isIgnored={ignoredBroken.has(mod.name)}
                 isAmber={mod._alert_type === 'amber'}
                 setIgnoredBroken={setIgnoredBroken}
                 ignoredBroken={ignoredBroken}
                 toggleInActiveSet={toggleInActiveSet}
                 allow_write={allow_write}
                 t={t}
                 activeGameSchema={activeGameSchema}
               />
            ))
          )}
        </div>
      </div>
    </SidePanel>
  );
}

