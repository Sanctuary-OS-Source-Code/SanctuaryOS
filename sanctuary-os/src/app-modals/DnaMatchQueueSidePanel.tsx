import React from 'react';
import { invoke } from "@tauri-apps/api/core";
import { SidePanel, ActionButton, HoverTooltip, formatDisplayName } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { useLexicon } from "../LexiconContext";

export function DnaMatchQueueSidePanel({
  dnaMatchQueue,
  setDnaMatchQueue,
  ignoredHashesRef,
  runRadarSweep,
  setPlaySets,
  activePlaySetIndex,
  setStatus
}: any) {
  const { t } = useLexicon();
  const prevQueueLength = React.useRef(dnaMatchQueue?.length || 0);
  const isResolvingRef = React.useRef(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [resolveStats, setResolveStats] = React.useState({ kept: 0, skipped: 0 });

  React.useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (dnaMatchQueue?.length === 0 && prevQueueLength.current > 0) {
      if (isResolvingRef.current) {
        setIsSuccess(true);
        const finalMsg = resolveStats.kept > 0 ? t("status_ingest_success") : (t("status_conflicts_resolved"));
        if (setStatus) setStatus(finalMsg);
        timer = setTimeout(() => {
          setIsSuccess(false);
          isResolvingRef.current = false;
          setResolveStats({ kept: 0, skipped: 0 });
          runRadarSweep(true);
        }, 2000);
      }
    }
    
    prevQueueLength.current = dnaMatchQueue?.length || 0;
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [dnaMatchQueue?.length, runRadarSweep, setStatus, t, resolveStats]);

  const settingsConflicts = dnaMatchQueue.filter((m: any) => m.reason === "SETTINGS_CONFLICT");
  const fileConflicts = dnaMatchQueue.filter((m: any) => m.reason !== "SETTINGS_CONFLICT");

  const handleBulkResolve = async (group: any[], action: "ignore" | "replace") => {
    const queueCopy = [...group];
    isResolvingRef.current = true;
    setResolveStats(s => ({ 
      kept: action === "replace" ? s.kept + group.length : s.kept, 
      skipped: action === "ignore" ? s.skipped + group.length : s.skipped 
    }));
    setDnaMatchQueue((prev: any[]) => prev.filter(m => !group.includes(m)));
    for (const match of queueCopy) {
      try {
        if (action === "ignore") ignoredHashesRef.current.add(match.hash || match.path);
        await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name || "", action });
        if (action === "replace" && match.existing_name && setPlaySets) {
          const oldName = match.existing_name.split(/[/\\]/).pop();
          const newName = match.path.split(/[/\\]/).pop();
          if (oldName && newName && oldName !== newName) {
            setPlaySets((prev: any) => prev.map((s: any, idx: number) => {
              if (idx === activePlaySetIndex) {
                return { ...s, mods: s.mods.filter((m: string) => m !== oldName) };
              }
              return s;
            }));
          }
        }
      } catch(e) {}
    }
    if (queueCopy.length > 0) runRadarSweep(true);
  };

  const renderGroup = (title: string, icon: string, group: any[]) => {
    if (group.length === 0) return null;
    return (
      <details className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl shadow-inner group/details" open>
        <summary className="cursor-pointer select-none p-5 flex items-center justify-between font-black text-xs capitalize tracking-widest text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-t-2xl transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">{icon}</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">{title}</span>
              <span className="shrink-0">({group.length})</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4 pointer-events-auto">
            <button
              onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve(group, "ignore"); }}
              className="relative group/actionbtn w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)]"
            >
              <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
              <HoverTooltip title={t("btn_keep_all_old")} variant="danger" className="!hidden group-hover/actionbtn:!flex z-[100]" />
            </button>
            <button
              onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve(group, "replace"); }}
              className="relative group/actionbtn w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            >
              <span className="material-symbols-outlined !text-[16px]">{t("icon_done_all")}</span>
              <HoverTooltip title={t("btn_replace_all")} variant="accent" className="!hidden group-hover/actionbtn:!flex z-[100]" />
            </button>
            <span className="material-symbols-outlined !text-[18px] opacity-50 group-open/details:rotate-180 transition-transform duration-300 ml-2">expand_more</span>
          </div>
        </summary>
        <div className="p-5 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
          {group.map((match: any, index: number) => {
            const newName = match.path?.split(/[\\/]/).pop()?.replace('.tmp_sanctuary_conflict', '');
            const oldName = match.existing_name ? match.existing_name.split(/[\\/]/).pop() : 'Unknown';
            return (
              <UniversalCard
                key={index}
                layout="vertical-compact"
                icon="difference"
                title={formatDisplayName(newName)}
                subtitle={
                  <div className="flex flex-col gap-0.5 opacity-80 mt-1">
                    <span className="text-[9px] font-black theme-text-accent capitalize tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined !text-[12px]">{t("icon_call_received")}</span>
                      {t("overlay_dna_incoming")}
                    </span>
                    <span className="text-[9px] truncate">Existing: {oldName}</span>
                  </div>
                }
                className="h-[250px] shadow-xl z-10 hover:z-[100]"
                badges={
                  <div className="flex justify-center items-center gap-4 w-full mt-2 pointer-events-auto px-2">
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve([match], "ignore"); }}
                      className="h-9 px-6 rounded-xl bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 hover:shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_20%,transparent)] group/btn"
                    >
                      <span className="material-symbols-outlined !text-[14px] text-[var(--danger)] transition-colors">{t("icon_close")}</span>
                      {t("defcon_btn_skip")}
                    </button>
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve([match], "replace"); }}
                      className="h-9 px-6 rounded-xl bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 hover:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] group/btn"
                    >
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] transition-colors">{t("icon_done")}</span>
                      {t("btn_keep_new")}
                    </button>
                  </div>
                }
              />
            );
          })}
          <div className="col-span-2 h-2 shrink-0 pointer-events-none" />
        </div>
      </details>
    );
  };

  return (
    <SidePanel
      isOpen={dnaMatchQueue.length > 0 || isSuccess}
      onClose={() => { 
        isResolvingRef.current = false; 
        setDnaMatchQueue([]); 
        setIsSuccess(false); 
        setResolveStats({ kept: 0, skipped: 0 });
      }}
      backdropZ="z-[115000]"
      panelZ="z-[115001]"
      title={t("overlay_dna_match_title")}
      subtitle={t("overlay_dna_match_desc")}
      icon="difference"
      widthClass="w-[650px]"
    >
      {isSuccess ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center h-full">
          <div className="w-16 h-16 rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-[var(--accent)]">
              {resolveStats.kept > 0 ? "check_circle" : "done_all"}
            </span>
          </div>
          <h2 className="text-xl font-bold text-[var(--text)] capitalize tracking-widest">
            {resolveStats.kept > 0 ? (t("status_ingest_success")) : (t("status_conflicts_resolved"))}
          </h2>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {renderGroup(t("overlay_dna_settings_conflicts"), "settings", settingsConflicts)}
          {renderGroup(t("overlay_dna_file_conflicts"), "file_copy", fileConflicts)}
        </div>
      )}
    </SidePanel>
  );
}




