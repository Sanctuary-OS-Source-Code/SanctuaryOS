import React from 'react';
import { invoke } from "@tauri-apps/api/core";
import { SidePanel, HoverTooltip } from "../shared";
import { useLexicon } from "../LexiconContext";
import { standardButtonClass, standardAccentGlassButtonClass } from "../shared";

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

  React.useEffect(() => {
    if (dnaMatchQueue?.length === 0 && prevQueueLength.current > 0) {
      if (isResolvingRef.current) {
        setIsSuccess(true);
        if (setStatus) setStatus(t("status_ingest_success"));
        const timer = setTimeout(() => {
          setIsSuccess(false);
          isResolvingRef.current = false;
          runRadarSweep(true);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
    prevQueueLength.current = dnaMatchQueue?.length || 0;
  }, [dnaMatchQueue?.length, runRadarSweep, setStatus, t]);

  const settingsConflicts = dnaMatchQueue.filter((m: any) => m.reason === "SETTINGS_CONFLICT");
  const fileConflicts = dnaMatchQueue.filter((m: any) => m.reason !== "SETTINGS_CONFLICT");

  const handleBulkResolve = async (group: any[], action: "ignore" | "replace") => {
    const queueCopy = [...group];
    isResolvingRef.current = true;
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
      <details className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl shadow-inner group/details" open>
        <summary className="cursor-pointer select-none p-4 flex items-center justify-between font-black text-xs uppercase tracking-widest text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-t-2xl transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">{icon}</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">{title}</span>
              <span className="shrink-0">({group.length})</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={(e) => { e.preventDefault(); handleBulkResolve(group, "ignore"); }}
              className="px-4 py-1.5 rounded-lg font-bold text-[9px] uppercase whitespace-nowrap bg-white/10 backdrop-blur-md text-[var(--text)] hover:text-white hover:bg-[color-mix(in_srgb,var(--danger)_40%,transparent)] transition-all border border-white/20 hover:border-[var(--danger)]/50 shadow-sm"
            >
              {t("btn_keep_all_old") || "KEEP ALL OLD"}
            </button>
            <button
              onClick={(e) => { e.preventDefault(); handleBulkResolve(group, "replace"); }}
              className="px-4 py-1.5 rounded-lg font-bold text-[9px] uppercase whitespace-nowrap bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] backdrop-blur-md text-[var(--accent)] hover:text-white hover:bg-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all border border-[var(--accent)]/30 hover:border-[var(--accent)]"
            >
              {t("btn_replace_all") || "KEEP ALL NEW"}
            </button>
            <span className="material-symbols-outlined !text-[18px] opacity-50 group-open/details:rotate-180 transition-transform duration-300 ml-2">expand_more</span>
          </div>
        </summary>
        <div className="p-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col gap-3 max-h-[400px] overflow-y-auto custom-scrollbar">
          {group.map((match: any, index: number) => (
            <div key={index} className="w-full bg-black/20 rounded-xl p-3 flex justify-between items-center gap-4">
              <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                <span className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px]">{t("icon_call_received") || "download"}</span>
                  {t("overlay_dna_incoming") || "INCOMING"}
                </span>
                <span className="text-xs font-black text-[var(--text)] truncate opacity-90">{match.path?.split(/[\\/]/).pop()?.replace('.tmp_sanctuary_conflict', '')}</span>
                <span className="text-[10px] font-medium text-[var(--subtext)] opacity-60 truncate mt-1">Existing: {match.existing_name ? match.existing_name.split(/[\\/]/).pop() : 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    handleBulkResolve([match], "ignore");
                  }}
                  className="px-3 py-1.5 rounded-lg font-bold text-[9px] uppercase whitespace-nowrap bg-white/10 hover:bg-[color-mix(in_srgb,var(--danger)_40%,transparent)] border border-white/20 hover:border-[var(--danger)]/50 text-[var(--text)] hover:text-white transition-all flex items-center gap-1 shadow-sm"
                >
                  <span className="material-symbols-outlined !text-[12px]">close</span>
                  {t("defcon_btn_skip") || "KEEP OLD"}
                </button>
                <button
                  onClick={async () => {
                    handleBulkResolve([match], "replace");
                  }}
                  className="px-3 py-1.5 rounded-lg font-bold text-[9px] uppercase whitespace-nowrap bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_40%,transparent)] border border-[var(--accent)]/30 hover:border-[var(--accent)] text-[var(--accent)] hover:text-white transition-all flex items-center gap-1"
                >
                  <span className="material-symbols-outlined !text-[12px]">done</span>
                  {t("btn_replace") || "OVERWRITE"}
                </button>
              </div>
            </div>
          ))}
          <div className="h-4 shrink-0 pointer-events-none" />
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
            <span className="material-symbols-outlined !text-4xl text-[var(--accent)]">check_circle</span>
          </div>
          <h2 className="text-xl font-bold text-[var(--text)] uppercase tracking-widest">{t("status_ingest_success") || "Files Successfully Processed"}</h2>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {renderGroup(t("overlay_dna_settings_conflicts") || "Settings Conflicts", "settings", settingsConflicts)}
          {renderGroup(t("overlay_dna_file_conflicts") || "File Conflicts", "file_copy", fileConflicts)}
        </div>
      )}
    </SidePanel>
  );
}
