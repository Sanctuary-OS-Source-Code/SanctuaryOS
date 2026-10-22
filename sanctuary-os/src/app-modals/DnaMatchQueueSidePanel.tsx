import React from 'react';
import { invoke } from "@tauri-apps/api/core";
import { SidePanel, ActionButton, HoverTooltip, formatDisplayName } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
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
  setStatus,
  modList = [],
  config = {}
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    
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

  const applyAcceptedEdgeOverride = async (
    rawOverrideJson: string,
    fallbackHash: string | undefined,
    localOverrides: Record<string, any>,
    edgeLogicMap: Record<string, any>
  ) => {
    try {
      const data = JSON.parse(rawOverrideJson);
      const targetHash = data.target_hash || fallbackHash || "";
      const archiveHashes = Array.isArray(data.archive_hashes) ? data.archive_hashes : [];
      const edgeUrl = data.manifest_url || "";
      const artifactId = data.artifact_id || targetHash || "edge_artifact";
      const masonId = data.mason_id || "Unknown";
      const gameId = data.game_id || "";

      const currentModList = (modList && modList.length > 0) ? modList : (useStore.getState().modList || []);
      const familySet = new Set<string>([targetHash, ...archiveHashes].filter(Boolean));

      // Include any local mod or flavor family hashes that match targetHash or archiveHashes
      currentModList.forEach((m: any) => {
        const modMatches = (m.hash && familySet.has(m.hash)) ||
          (Array.isArray(m.flavors) && m.flavors.some((f: any) => f.hash && familySet.has(f.hash)));
        if (modMatches) {
          if (m.hash) familySet.add(m.hash);
          if (Array.isArray(m.flavors)) {
            m.flavors.forEach((f: any) => {
              if (f.hash) familySet.add(f.hash);
            });
          }
        }
      });

      const vaultPath = config?.vault_path || useStore.getState().vaultPath;
      let fetchedManifest: any = null;

      if (vaultPath && edgeUrl) {
        try {
          await invoke("register_edge_override", {
            vaultPath,
            overrideData: {
              artifact_id: artifactId,
              mason_id: masonId,
              game_id: gameId,
              manifest_url: edgeUrl,
              target_hash: targetHash,
              archive_hashes: Array.from(familySet).filter((h) => h !== targetHash),
            },
          });
          fetchedManifest = await invoke("fetch_and_sync_edge_manifest", {
            vaultPath,
            artifactId,
          });
        } catch (err) {
          console.warn("Edge manifest Tauri sync fallback to fetch:", err);
        }
      }

      if (!fetchedManifest && edgeUrl && /^https?:\/\//i.test(edgeUrl)) {
        try {
          const resp = await fetch(edgeUrl);
          if (resp.ok) {
            fetchedManifest = await resp.json();
          }
        } catch (fetchErr) {
          console.warn("Direct edge manifest fetch failed:", fetchErr);
        }
      }

      if (fetchedManifest) {
        if (fetchedManifest.payload?.sha256) familySet.add(fetchedManifest.payload.sha256);
        if (Array.isArray(fetchedManifest.previous_hashes)) {
          fetchedManifest.previous_hashes.forEach((h: string) => {
            if (h) familySet.add(h);
          });
        }
        if (Array.isArray(fetchedManifest.atomic_logic?.flavors)) {
          fetchedManifest.atomic_logic.flavors.forEach((h: string) => {
            if (h) familySet.add(h);
          });
        }
      }

      const hashes = Array.from(familySet).filter(Boolean);
      if (edgeUrl && hashes.length > 0) {
        for (const h of hashes) {
          localOverrides[h] = {
            ...(localOverrides[h] || {}),
            displayName: fetchedManifest?.artifact?.name || localOverrides[h]?.displayName || data.artifact_id || undefined,
            author: fetchedManifest?.artifact?.author || masonId,
            version: fetchedManifest?.artifact?.version || localOverrides[h]?.version || undefined,
            url: fetchedManifest?.payload?.download_url || localOverrides[h]?.url || edgeUrl,
            manifest_url: edgeUrl,
            requiredDLC: fetchedManifest?.atomic_logic?.required_dlc || localOverrides[h]?.requiredDLC,
            compatible_versions: fetchedManifest?.artifact?.game_version
              ? [fetchedManifest.artifact.game_version]
              : localOverrides[h]?.compatible_versions,
            timestamp: Date.now(),
          };
          if (fetchedManifest?.atomic_logic) {
            edgeLogicMap[h] = {
              ...fetchedManifest.atomic_logic,
              manifest_url: edgeUrl,
              artifact_id: artifactId,
              version: fetchedManifest.artifact?.version,
              game_version: fetchedManifest.artifact?.game_version,
              download_url: fetchedManifest.payload?.download_url,
              sha256: fetchedManifest.payload?.sha256,
              changelog: fetchedManifest.changelog || [],
            };
          }
        }
      }
    } catch (e) {
      console.error("Failed to apply accepted edge override:", e);
    }
  };

  const handleBulkResolve = async (group: any[], action: "ignore" | "replace") => {
    const queueCopy = [...group];
    isResolvingRef.current = true;
    setResolveStats(s => ({ 
      kept: action === "replace" ? s.kept + group.length : s.kept, 
      skipped: action === "ignore" ? s.skipped + group.length : s.skipped 
    }));
    setDnaMatchQueue((prev: any[]) => prev.filter(m => !group.includes(m)));

    let localOverrides: any = {};
    let edgeLogicMap: any = {};
    if (action === "replace") {
      try {
        localOverrides = JSON.parse(localStorage.getItem('sanctuary_local_overrides') || '{}');
      } catch(e) {}
      try {
        edgeLogicMap = JSON.parse(localStorage.getItem('sanctuary_edge_logic') || '{}');
      } catch(e) {}
    }

    for (const match of queueCopy) {
      try {
        if (action === "ignore") ignoredHashesRef.current.add(match.hash || match.path);
        if (match.path) {
          await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name || "", action });
        }
        
        if (action === "replace" && match.override_json) {
          await applyAcceptedEdgeOverride(match.override_json, match.hash, localOverrides, edgeLogicMap);
        }

        if (action === "replace" && match.existing_name && setPlaySets) {
          const oldName = match.existing_name.split(/[/\\]/).pop();
          const newName = match.path?.split(/[/\\]/).pop();
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
      localStorage.setItem('sanctuary_edge_logic', JSON.stringify(edgeLogicMap));
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
      let edgeLogicMap: any = {};
      try {
        localOverrides = JSON.parse(localStorage.getItem('sanctuary_local_overrides') || '{}');
      } catch(e) {}
      try {
        edgeLogicMap = JSON.parse(localStorage.getItem('sanctuary_edge_logic') || '{}');
      } catch(e) {}

      for (const event of queueCopy) {
        if (event.override_json) {
          await applyAcceptedEdgeOverride(event.override_json, event.hash, localOverrides, edgeLogicMap);
        }
      }
      localStorage.setItem('sanctuary_local_overrides', JSON.stringify(localOverrides));
      localStorage.setItem('sanctuary_edge_logic', JSON.stringify(edgeLogicMap));
    }
    
    if (queueCopy.length > 0) runRadarSweep(false, true);
  };

  const renderEdgeGroup = (group: any[]) => {
    if (group.length === 0) return null;
    return (
      <details className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl shadow-inner group/details" open>
        <summary className="cursor-pointer select-none p-5 flex items-center justify-between font-black text-xs capitalize tracking-widest text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-t-2xl transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">{t("icon_network_wifi") || "network_wifi"}</span>
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
              <span className="material-symbols-outlined !text-[16px]">{t("icon_close") || "close"}</span>
              <HoverTooltip title={t("btn_reject_all") || "Reject All"} variant="danger" className="!hidden group-hover/actionbtn:!flex z-[100]" />
            </button>
            <button
              onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleEdgeResolve(group, "replace"); }}
              className="relative group/actionbtn w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            >
              <span className="material-symbols-outlined !text-[16px]">{t("icon_done_all") || "done_all"}</span>
              <HoverTooltip title={t("btn_accept_all") || "Accept All"} variant="accent" className="!hidden group-hover/actionbtn:!flex z-[100]" />
            </button>
            <span className="material-symbols-outlined !text-[18px] opacity-50 group-open/details:rotate-180 transition-transform duration-300 ml-2">{t("icon_expand_more") || "expand_more"}</span>
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
                icon={t("icon_network_wifi") || "network_wifi"}
                title={match.matched_mod_name || data.artifact_id || (t("label_unknown_mod") || "Unknown Mod")}
                subtitle={
                  <div className="flex flex-col gap-0.5 opacity-80 mt-1">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] truncate">
                      {data.mason_id || (t("label_unknown_author") || "Unknown Author")}
                    </span>
                    <span className="text-[9px] font-black text-[var(--accent)] tracking-widest flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined !text-[12px]">{t("icon_network_wifi") || "network_wifi"}</span>
                      {t("desc_edge_override_prompt") || "This mod author has provided an Edge Network manifest URL."}
                    </span>
                    <span className="text-[9px] mt-1 bg-[var(--bg-tertiary)] p-1 rounded-sm break-all font-mono">{data.manifest_url}</span>
                  </div>
                }
                className="min-h-[240px] shadow-xl z-10 hover:z-[100] cursor-pointer"
                onClick={() => {
                  setSelectedOverrideData(data);
                  setSelectedOverrideName(match.matched_mod_name || "");
                  setSelectedOverrideHash(match.hash || data.target_hash || "");
                }}
                badges={
                  <div className="flex w-full mt-2 mb-1 pointer-events-auto rounded-lg overflow-hidden border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-sm">
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleEdgeResolve([match], "ignore"); }}
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] flex items-center justify-center transition-all text-[9px] font-black tracking-wider uppercase border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-1.5 cursor-pointer"
                    >
                      <span className="truncate">{t("btn_reject") || "Deny"}</span>
                    </button>
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleEdgeResolve([match], "replace"); }}
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)] flex items-center justify-center transition-all text-[9px] font-black tracking-wider uppercase px-1.5 cursor-pointer"
                    >
                      <span className="truncate">{t("ui_btn_approve") || "Authorize"}</span>
                    </button>
                  </div>
                }
              />
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
              <HoverTooltip title={t("dna_btn_keep_all_existing", "Keep All Existing")} className="!hidden group-hover/actionbtn:!flex z-[100]" />
            </button>
            <button
              onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve(group, "replace"); }}
              className="relative group/actionbtn w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            >
              <span className="material-symbols-outlined !text-[16px]">{t("icon_done_all")}</span>
              <HoverTooltip title={t("dna_btn_overwrite_all", "Overwrite All")} variant="accent" className="!hidden group-hover/actionbtn:!flex z-[100]" />
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
                        <span className="text-[9px] truncate">{t("overlay_dna_existing", "Existing")}: {oldName}</span>
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
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] flex items-center justify-center transition-all text-[9px] font-black tracking-wider uppercase border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-1.5 cursor-pointer"
                    >
                      <span className="truncate">{overrideData ? t("btn_keep_local", "Keep Local") : t("dna_btn_keep_existing", "Keep Existing")}</span>
                    </button>
                    <button
                      onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); handleBulkResolve([match], "replace"); }}
                      className="flex-1 h-8 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)] flex items-center justify-center transition-all text-[9px] font-black tracking-wider uppercase px-1.5 cursor-pointer"
                    >
                      <span className="truncate">{overrideData ? t("btn_import_override", "Import Override") : t("dna_btn_overwrite", "Overwrite")}</span>
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




