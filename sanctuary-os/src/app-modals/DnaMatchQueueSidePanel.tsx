import React from 'react';
import { invoke } from "@tauri-apps/api/core";
import { SidePanel, ActionButton, HoverTooltip, formatDisplayName } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { useLexicon } from "../LexiconContext";
import { EdgeOverrideSidePanel } from "./EdgeOverrideSidePanel";

export function DnaMatchQueueSidePanel({
  dnaMatchQueue,
  setDnaMatchQueue,
  edgeOverrideQueue,
  setEdgeOverrideQueue,
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
  const [selectedOverrideData, setSelectedOverrideData] = React.useState<any>(null);
  const [selectedOverrideName, setSelectedOverrideName] = React.useState<string>("");
  const [selectedOverrideHash, setSelectedOverrideHash] = React.useState<string>("");

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
  }, [dnaMatchQueue?.length, t]);

  const edgeOverrides = dnaMatchQueue.filter((m: any) => m.reason === "EDGE_OVERRIDE");
  const settingsConflicts = dnaMatchQueue.filter((m: any) => m.reason === "SETTINGS_CONFLICT");
  const fileConflicts = dnaMatchQueue.filter((m: any) => m.reason !== "SETTINGS_CONFLICT" && m.reason !== "EDGE_OVERRIDE");

  const handleBulkResolve = async (group: any[], action: "ignore" | "replace") => {
    const queueCopy = [...group];
    isResolvingRef.current = true;
    setResolveStats(s => ({ 
      kept: action === "replace" ? s.kept + group.length : s.kept, 
      skipped: action === "ignore" ? s.skipped + group.length : s.skipped 
    }));
    setDnaMatchQueue((prev: any[]) => prev.filter(m => !group.includes(m)));

    let localOverrides: any = {};
    if (action === "replace") {
      try {
        localOverrides = JSON.parse(localStorage.getItem('sanctuary_local_overrides') || '{}');
      } catch(e) {}
    }

    for (const match of queueCopy) {
      try {
        if (action === "ignore") ignoredHashesRef.current.add(match.hash || match.path);
        await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name || "", action });
        
        if (action === "replace" && match.override_json) {
           try {
              const data = JSON.parse(match.override_json);
              const targetHash = data.target_hash;
              const archiveHashes = data.archive_hashes || [];
              const hashes = [targetHash, ...archiveHashes].filter(Boolean);
              const edgeUrl = data.manifest_url;
              if (edgeUrl && hashes.length > 0) {
                for (const h of hashes) {
                  localOverrides[h] = { url: edgeUrl, author: data.mason_id || "Unknown", timestamp: Date.now() };
                }
              }
           } catch(e) {}
        }

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
    
    if (action === "replace") {
      localStorage.setItem('sanctuary_local_overrides', JSON.stringify(localOverrides));
    }

    if (queueCopy.length > 0) runRadarSweep(true);
  };

  const handleEdgeResolve = async (group: any[], action: "ignore" | "replace") => {
    const queueCopy = [...group];
    isResolvingRef.current = true;
    setResolveStats(s => ({ 
      kept: action === "replace" ? s.kept + group.length : s.kept, 
      skipped: action === "ignore" ? s.skipped + group.length : s.skipped 
    }));
    setDnaMatchQueue((prev: any[]) => prev.filter(m => !group.includes(m)));

    if (action === "replace") {
      let localOverrides: any = {};
      try {
        localOverrides = JSON.parse(localStorage.getItem('sanctuary_local_overrides') || '{}');
      } catch(e) {}

      for (const event of queueCopy) {
        try {
          const data = JSON.parse(event.override_json);
          const targetHash = data.target_hash;
          const archiveHashes = data.archive_hashes || [];
          const hashes = [targetHash, ...archiveHashes].filter(Boolean);
          const edgeUrl = data.manifest_url;

          if (edgeUrl && hashes.length > 0) {
            for (const hash of hashes) {
              localOverrides[hash] = {
                  url: edgeUrl,
                  author: data.mason_id || "Unknown",
                  timestamp: Date.now()
              };
            }
          }
        } catch(e) {}
      }
      localStorage.setItem('sanctuary_local_overrides', JSON.stringify(localOverrides));
    }
    
    if (queueCopy.length > 0) runRadarSweep(false, true);
  };

  const renderEdgeGroup = (group: any[]) => {
    if (group.length === 0) return null;
    return (
      <details className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl shadow-inner group/details" open>
        <summary className="cursor-pointer select-none p-5 flex items-center justify-between font-black text-xs capitalize tracking-widest text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-t-2xl transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">network_wifi</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">{t("title_edge_override_detected") || "Edge Network Override"}</span>
              <span className="shrink-0">({group.length})</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4 pointer-events-auto">
            <button
              onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleEdgeResolve(group, "ignore"); }}
              className="relative group/actionbtn w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)]"
            >
              <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
              <HoverTooltip title={t("btn_reject_all") || "Reject All"} variant="danger" className="!hidden group-hover/actionbtn:!flex z-[100]" />
            </button>
            <button
              onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleEdgeResolve(group, "replace"); }}
              className="relative group/actionbtn w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            >
              <span className="material-symbols-outlined !text-[16px]">{t("icon_done_all")}</span>
              <HoverTooltip title={t("btn_accept_all") || "Accept All"} variant="accent" className="!hidden group-hover/actionbtn:!flex z-[100]" />
            </button>
            <span className="material-symbols-outlined !text-[18px] opacity-50 group-open/details:rotate-180 transition-transform duration-300 ml-2">expand_more</span>
          </div>
        </summary>
        <div className="p-5 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
          {group.map((match: any, index: number) => {
            let data: any = {};
            try { data = JSON.parse(match.override_json); } catch(e) {}
            return (
              <UniversalCard
                key={index}
                layout="vertical-compact"
                icon="network_wifi"
                title={data.artifact_id || "Unknown Mod"}
                subtitle={data.mason_id || "Unknown Author"}
                className="min-h-[240px] shadow-xl z-10 hover:z-[100] cursor-pointer"
                onClick={() => {
                  setSelectedOverrideData(data);
                  setSelectedOverrideName("");
                  setSelectedOverrideHash(match.hash);
                }}
              >
                  <div className="flex flex-col gap-0.5 opacity-80 mt-1">
                    <span className="text-[9px] font-black text-[var(--accent)] tracking-widest flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined !text-[12px]">network_wifi</span>
                      {t("desc_edge_override_prompt") || "This mod author has provided an Edge Network manifest URL."}
                    </span>
                    <span className="text-[9px] mt-1 bg-[var(--bg-tertiary)] p-1 rounded-sm break-all">{data.manifest_url}</span>
                  </div>
                badges={
                  <div className="flex w-full mt-2 mb-1 pointer-events-auto rounded-lg overflow-hidden border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-sm">
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleEdgeResolve([match], "ignore"); }}
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] flex items-center justify-center transition-all text-[9px] font-black tracking-widest uppercase border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-1"
                    >
                      <span className="truncate">{t("btn_reject") || "Deny"}</span>
                    </button>
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleEdgeResolve([match], "replace"); }}
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] flex items-center justify-center transition-all text-[9px] font-black tracking-widest uppercase px-1"
                    >
                      <span className="truncate">{t("btn_accept") || "Authorize"}</span>
                    </button>
                  </div>
                }
              </UniversalCard>
            );
          })}
        </div>
      </details>
    );
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
            let overrideData: any = null;
            if (match.override_json) {
              try { overrideData = JSON.parse(match.override_json); } catch(e) {}
            }
            
            const displayTitle = overrideData?.artifact_id ? overrideData.artifact_id : formatDisplayName(newName);
            
            return (
              <UniversalCard
                key={index}
                layout="vertical-compact"
                icon="difference"
                title={displayTitle}
                subtitle={
                  <div className="flex flex-col gap-0.5 opacity-80 mt-1">
                    {overrideData ? (
                      <>
                        <span className="text-[9px] font-black text-[var(--accent)] tracking-widest flex items-center gap-1 mt-1">
                          <span className="material-symbols-outlined !text-[12px]">network_wifi</span>
                          {t("title_edge_override_detected") || "Edge Network Override"}
                        </span>
                        <span className="text-[9px] truncate text-[var(--accent)]">{t("desc_override_authority")}</span>
                        {oldName && oldName.toLowerCase() === 'override.json' && (
                          <span className="text-[9px] truncate opacity-80">{t("desc_override_replaces_existing")}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-[9px] font-black theme-text-accent capitalize tracking-widest flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[12px]">{t("icon_call_received")}</span>
                          {t("overlay_dna_incoming")}
                        </span>
                        <span className="text-[9px] truncate">Existing: {oldName}</span>
                      </>
                    )}
                  </div>
                }
                className={`min-h-[240px] shadow-xl z-10 hover:z-[100] ${overrideData ? "cursor-pointer" : ""}`}
                onClick={overrideData ? () => {
                  setSelectedOverrideData(overrideData);
                  setSelectedOverrideName(oldName);
                  setSelectedOverrideHash(match.hash);
                } : undefined}
                badges={
                  <div className="flex w-full mt-2 mb-1 pointer-events-auto rounded-lg overflow-hidden border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-sm">
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve([match], "ignore"); }}
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] flex items-center justify-center transition-all text-[9px] font-black tracking-widest uppercase border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-1"
                    >
                      <span className="truncate">{overrideData ? t("btn_keep_local") : t("defcon_btn_skip")}</span>
                    </button>
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve([match], "replace"); }}
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] flex items-center justify-center transition-all text-[9px] font-black tracking-widest uppercase px-1"
                    >
                      <span className="truncate">{overrideData ? t("btn_import_override") : t("btn_keep_new")}</span>
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
          {renderEdgeGroup(edgeOverrides)}
          {renderGroup(t("overlay_dna_settings_conflicts"), "settings", settingsConflicts)}
          {renderGroup(t("overlay_dna_file_conflicts"), "file_copy", fileConflicts)}
        </div>
      )}
      
      <EdgeOverrideSidePanel 
        isOpen={!!selectedOverrideData}
        onClose={() => {
          setSelectedOverrideData(null);
          setSelectedOverrideName("");
          setSelectedOverrideHash("");
        }}
        data={selectedOverrideData}
        modHash={selectedOverrideHash}
      />
    </SidePanel>
  );
}




