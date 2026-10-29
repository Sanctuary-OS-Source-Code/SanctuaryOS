import React from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SidePanel,
  ActionButton,
  HoverTooltip,
  formatDisplayName,
  SidePanelHeroCard,
  StatBox,
  DashboardStatTile,
  UniversalGroup,
  VAULT_CHIP_CLASS,
  openModDossier,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { EdgeOverrideSidePanel } from "./EdgeOverrideSidePanel";

export function DnaMatchQueueSidePanel({
  dnaMatchQueue,
  setDnaMatchQueue,
  ignoredHashesRef,
  runRadarSweep,
  setPlaySets,
  activePlaySetIndex,
  setStatus,
  modList = [],
  config = {},
}: any) {
  const { t } = useLexicon();
  const prevQueueLength = React.useRef(dnaMatchQueue?.length || 0);
  const isResolvingRef = React.useRef(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [resolveStats, setResolveStats] = React.useState({ kept: 0, skipped: 0 });
  const [selectedOverrideData, setSelectedOverrideData] = React.useState<any>(null);
  const [, setSelectedOverrideName] = React.useState<string>("");
  const [selectedOverrideHash, setSelectedOverrideHash] = React.useState<string>("");
  const [queueFilter, setQueueFilter] = React.useState<"all" | "files" | "settings" | "edge">(
    "all"
  );

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (dnaMatchQueue?.length === 0 && prevQueueLength.current > 0) {
      if (isResolvingRef.current) {
        setIsSuccess(true);
        const finalMsg =
          resolveStats.kept > 0
            ? t("status_ingest_success", "{Mods} Imported Successfully!")
            : t("status_conflicts_resolved", "Conflicts Resolved");
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

  const edgeOverrides = (dnaMatchQueue || []).filter((m: any) => m.reason === "EDGE_OVERRIDE");
  const settingsConflicts = (dnaMatchQueue || []).filter(
    (m: any) => m.reason === "SETTINGS_CONFLICT"
  );
  const fileConflicts = (dnaMatchQueue || []).filter(
    (m: any) => m.reason !== "SETTINGS_CONFLICT" && m.reason !== "EDGE_OVERRIDE"
  );

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

      const currentModList =
        modList && modList.length > 0 ? modList : useStore.getState().modList || [];
      const familySet = new Set<string>([targetHash, ...archiveHashes].filter(Boolean));

      currentModList.forEach((m: any) => {
        const modMatches =
          (m.hash && familySet.has(m.hash)) ||
          (Array.isArray(m.flavors) &&
            m.flavors.some((f: any) => f.hash && familySet.has(f.hash)));
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
          const existingOvr = localOverrides[h];
          const isUserDossier = !!existingOvr?.is_user_dossier;
          localOverrides[h] = {
            ...(existingOvr || {}),
            displayName: isUserDossier && existingOvr?.displayName
              ? existingOvr.displayName
              : (fetchedManifest?.artifact?.name || existingOvr?.displayName || data.artifact_id || undefined),
            author: isUserDossier && existingOvr?.author
              ? existingOvr.author
              : (fetchedManifest?.artifact?.author || masonId),
            version: isUserDossier && existingOvr?.version
              ? existingOvr.version
              : (fetchedManifest?.artifact?.version || existingOvr?.version || undefined),
            url: isUserDossier && existingOvr?.url
              ? existingOvr.url
              : (fetchedManifest?.payload?.download_url || existingOvr?.url || edgeUrl),
            manifest_url: edgeUrl,
            requiredDLC: isUserDossier && existingOvr?.requiredDLC
              ? existingOvr.requiredDLC
              : (fetchedManifest?.atomic_logic?.required_dlc || existingOvr?.requiredDLC),
            compatible_versions: isUserDossier && existingOvr?.compatible_versions
              ? existingOvr.compatible_versions
              : (fetchedManifest?.artifact?.game_version
                ? [fetchedManifest.artifact.game_version]
                : existingOvr?.compatible_versions),
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
    setResolveStats((s) => ({
      kept: action === "replace" ? s.kept + group.length : s.kept,
      skipped: action === "ignore" ? s.skipped + group.length : s.skipped,
    }));
    setDnaMatchQueue((prev: any[]) => prev.filter((m) => !group.includes(m)));

    let localOverrides: any = {};
    let edgeLogicMap: any = {};
    if (action === "replace") {
      try {
        localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      } catch (e) {}
      try {
        edgeLogicMap = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      } catch (e) {}
    }

    for (const match of queueCopy) {
      try {
        if (action === "ignore") ignoredHashesRef.current.add(match.hash || match.path);
        if (match.path) {
          const moveOriginal =
            (localStorage.getItem("sanctuary_ingest_file_mode") || "copy") === "move";
          await invoke("resolve_dna_match", {
            path: match.path,
            existingName: match.existing_name || "",
            action,
            moveOriginal,
          });
        }

        if (action === "replace" && match.override_json) {
          await applyAcceptedEdgeOverride(
            match.override_json,
            match.hash,
            localOverrides,
            edgeLogicMap
          );
        }

        if (action === "replace" && match.existing_name && setPlaySets) {
          const oldName = match.existing_name.split(/[/\\]/).pop();
          const newName = match.path?.split(/[/\\]/).pop();
          if (oldName && newName && oldName !== newName) {
            setPlaySets((prev: any) =>
              prev.map((s: any, idx: number) => {
                if (idx === activePlaySetIndex) {
                  return { ...s, mods: s.mods.filter((m: string) => m !== oldName) };
                }
                return s;
              })
            );
          }
        }
      } catch (e) {}
    }

    if (action === "replace") {
      localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOverrides));
      localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogicMap));
    }

    if (queueCopy.length > 0) runRadarSweep(true);
  };

  const handleEdgeResolve = async (group: any[], action: "ignore" | "replace") => {
    const queueCopy = [...group];
    isResolvingRef.current = true;
    setResolveStats((s) => ({
      kept: action === "replace" ? s.kept + group.length : s.kept,
      skipped: action === "ignore" ? s.skipped + group.length : s.skipped,
    }));
    setDnaMatchQueue((prev: any[]) => prev.filter((m) => !group.includes(m)));

    if (action === "replace") {
      let localOverrides: any = {};
      let edgeLogicMap: any = {};
      try {
        localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      } catch (e) {}
      try {
        edgeLogicMap = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      } catch (e) {}

      for (const event of queueCopy) {
        if (event.override_json) {
          await applyAcceptedEdgeOverride(
            event.override_json,
            event.hash,
            localOverrides,
            edgeLogicMap
          );
        }
      }
      localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOverrides));
      localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogicMap));
    }

    if (queueCopy.length > 0) runRadarSweep(false, true);
  };

  const renderEdgeGroup = (group: any[]) => {
    if (group.length === 0) return null;
    return (
      <UniversalGroup
        title={`${t("title_edge_override_detected", "Edge Network Override")} (${group.length})`}
        icon={t("icon_network_wifi", "network_wifi")}
        headerAction={
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e: any) => {
                e.preventDefault();
                e.stopPropagation();
                handleEdgeResolve(group, "ignore");
              }}
              className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] flex items-center justify-center transition-all text-[var(--danger)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_close", "close")}
              </span>
              <HoverTooltip
                title={t("btn_reject_all", "Reject All")}
                variant="danger"
                className="!hidden group-hover/actionbtn:!flex z-[100]"
              />
            </button>
            <button
              type="button"
              onClick={(e: any) => {
                e.preventDefault();
                e.stopPropagation();
                handleEdgeResolve(group, "replace");
              }}
              className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--accent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_done_all", "done_all")}
              </span>
              <HoverTooltip
                title={t("btn_accept_all", "Accept All")}
                variant="accent"
                className="!hidden group-hover/actionbtn:!flex z-[100]"
              />
            </button>
          </div>
        }
      >
        <div className="max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {group.map((match: any, index: number) => {
            let data: any = {};
            try {
              data = JSON.parse(match.override_json);
            } catch (e) {}
            return (
              <div
                key={index}
                onClick={() => {
                  setSelectedOverrideData(data);
                  setSelectedOverrideName(match.matched_mod_name || "");
                  setSelectedOverrideHash(match.hash || data.target_hash || "");
                }}
                className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex flex-col justify-between gap-3 cursor-pointer transition-all"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_network_wifi", "network_wifi")}
                      </span>
                    </div>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {t("icon_network_wifi", "network_wifi")}
                      </span>
                      {t("title_edge_override_detected", "Edge Override")}
                    </span>
                  </div>

                  <span className="text-sm font-black text-[var(--text)] truncate">
                    {match.matched_mod_name ||
                      data.artifact_id ||
                      t("label_unknown_mod", "Unknown {Mod}")}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--subtext)] truncate">
                    {data.mason_id || t("label_unknown_author", "Unknown Author")}
                  </span>
                  {data.manifest_url && (
                    <span className="text-[9px] font-mono text-[var(--subtext)] opacity-80 break-all">
                      {data.manifest_url}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="glass"
                    label={t("btn_reject", "Deny")}
                    onClick={(e: any) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleEdgeResolve([match], "ignore");
                    }}
                    className="flex-1"
                  />
                  <ActionButton
                    variant="glass"
                    label={t("ui_btn_approve", "Authorize")}
                    onClick={(e: any) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleEdgeResolve([match], "replace");
                    }}
                    className="flex-1"
                  />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </UniversalGroup>
    );
  };

  const renderGroup = (title: string, icon: string, group: any[]) => {
    if (group.length === 0) return null;
    return (
      <UniversalGroup
        title={`${title} (${group.length})`}
        icon={icon}
        headerAction={
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e: any) => {
                e.preventDefault();
                e.stopPropagation();
                handleBulkResolve(group, "ignore");
              }}
              className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] flex items-center justify-center transition-all text-[var(--danger)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_close", "close")}
              </span>
              <HoverTooltip
                title={t("dna_btn_keep_all_existing", "Keep All Existing")}
                className="!hidden group-hover/actionbtn:!flex z-[100]"
              />
            </button>
            <button
              type="button"
              onClick={(e: any) => {
                e.preventDefault();
                e.stopPropagation();
                handleBulkResolve(group, "replace");
              }}
              className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--accent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_done_all", "done_all")}
              </span>
              <HoverTooltip
                title={t("dna_btn_overwrite_all", "Overwrite All")}
                variant="accent"
                className="!hidden group-hover/actionbtn:!flex z-[100]"
              />
            </button>
          </div>
        }
      >
        <div className="max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {group.map((match: any, index: number) => {
            const newName = match.path
              ?.split(/[\\/]/)
              .pop()
              ?.replace(".tmp_sanctuary_conflict", "");
            const oldName = match.existing_name
              ? match.existing_name.split(/[\\/]/).pop()
              : t("unknown", "Unknown");
            let overrideData: any = null;
            if (match.override_json) {
              try {
                overrideData = JSON.parse(match.override_json);
              } catch (e) {}
            }

            const displayTitle = overrideData?.artifact_id
              ? overrideData.artifact_id
              : formatDisplayName(newName);

            return (
              <div
                key={index}
                onClick={
                  overrideData
                    ? () => {
                        setSelectedOverrideData(overrideData);
                        setSelectedOverrideName(oldName);
                        setSelectedOverrideHash(match.hash);
                      }
                    : () =>
                        openModDossier({
                          name: match.existing_name || newName,
                          hash: match.hash,
                          path: match.path,
                        })
                }
                className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex flex-col justify-between gap-3 transition-all cursor-pointer"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_difference", "difference")}
                      </span>
                    </div>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {overrideData
                          ? t("icon_network_wifi", "network_wifi")
                          : t("icon_difference", "difference")}
                      </span>
                      {overrideData
                        ? t("title_edge_override_detected", "Edge Override")
                        : t("overlay_dna_incoming", "Incoming {Mod}")}
                    </span>
                  </div>

                  <span className="text-sm font-black text-[var(--text)] truncate">
                    {displayTitle}
                  </span>

                  {overrideData ? (
                    <span className="text-[10px] font-medium text-[var(--subtext)] truncate">
                      {t("desc_override_authority", "Author Edge Authority")}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-[var(--subtext)] opacity-80 truncate">
                      {t("overlay_dna_existing", "Existing {Mod}")}: {oldName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="glass"
                    label={
                      overrideData
                        ? t("btn_keep_local", "Keep Local")
                        : t("dna_btn_keep_existing", "Keep Existing")
                    }
                    onClick={(e: any) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleBulkResolve([match], "ignore");
                    }}
                    className="flex-1"
                  />
                  <ActionButton
                    variant="glass"
                    label={
                      overrideData
                        ? t("btn_import_override", "Import Override")
                        : t("dna_btn_overwrite", "Overwrite")
                    }
                    onClick={(e: any) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleBulkResolve([match], "replace");
                    }}
                    className="flex-1"
                  />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </UniversalGroup>
    );
  };

  const totalCount = (dnaMatchQueue || []).length;
  const showMultipleCategories =
    [edgeOverrides.length > 0, settingsConflicts.length > 0, fileConflicts.length > 0].filter(
      Boolean
    ).length > 1;

  return (
    <SidePanel
      isOpen={totalCount > 0 || isSuccess}
      onClose={() => {
        isResolvingRef.current = false;
        setDnaMatchQueue([]);
        setIsSuccess(false);
        setResolveStats({ kept: 0, skipped: 0 });
      }}
      backdropZ="z-[115000]"
      panelZ="z-[115001]"
      title={t("overlay_dna_match_title", "DNA Match & Collision Queue")}
      subtitle={t(
        "overlay_dna_match_desc",
        "Resolve duplicate artifacts, settings collisions, and Edge overrides."
      )}
      icon={t("icon_difference", "difference")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={
            isSuccess
              ? t("icon_check_circle", "check_circle")
              : t("icon_difference", "difference")
          }
          overline={t("overlay_dna_match_title", "DNA Match & Collision Queue")}
          title={
            isSuccess
              ? resolveStats.kept > 0
                ? t("status_ingest_success", "{Mods} Imported Successfully!")
                : t("status_conflicts_resolved", "Conflicts Resolved")
              : t(
                  "overlay_dna_match_desc",
                  "Resolve duplicate artifacts, settings collisions, and Edge overrides."
                )
          }
          badge={`${totalCount} ${t("term_mods", "Items")}`}
          badgeIcon={t("icon_difference", "difference")}
          variant={isSuccess ? "success" : "accent"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <StatBox
              label={t("overlay_dna_file_conflicts", "File Conflicts")}
              value={fileConflicts.length}
              icon={t("icon_file_copy", "file_copy")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("overlay_dna_settings_conflicts", "Settings Conflicts")}
              value={settingsConflicts.length}
              icon={t("icon_settings", "settings")}
              iconColorClass="text-[var(--warning)]"
            />
            <StatBox
              label={t("title_edge_override_detected", "Edge Overrides")}
              value={edgeOverrides.length}
              icon={t("icon_network_wifi", "network_wifi")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        {!isSuccess && showMultipleCategories && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={queueFilter === "all"}
              icon={t("icon_tune", "tune")}
              label={t("filter_all", "All")}
              value={totalCount}
              onClick={() => setQueueFilter("all")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={queueFilter === "files"}
              icon={t("icon_file_copy", "file_copy")}
              label={t("overlay_dna_file_conflicts", "Files")}
              value={fileConflicts.length}
              onClick={() => setQueueFilter("files")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={queueFilter === "settings"}
              icon={t("icon_settings", "settings")}
              label={t("overlay_dna_settings_conflicts", "Settings")}
              value={settingsConflicts.length}
              onClick={() => setQueueFilter("settings")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={queueFilter === "edge"}
              icon={t("icon_network_wifi", "network_wifi")}
              label={t("title_edge_override_detected", "Edge")}
              value={edgeOverrides.length}
              onClick={() => setQueueFilter("edge")}
            />
          </div>
        )}

        {!isSuccess && (
          <div className="flex flex-col gap-4">
            {(queueFilter === "all" || queueFilter === "edge") &&
              renderEdgeGroup(edgeOverrides)}
            {(queueFilter === "all" || queueFilter === "settings") &&
              renderGroup(
                t("overlay_dna_settings_conflicts", "Settings Conflicts"),
                t("icon_settings", "settings"),
                settingsConflicts
              )}
            {(queueFilter === "all" || queueFilter === "files") &&
              renderGroup(
                t("overlay_dna_file_conflicts", "File Conflicts"),
                t("icon_file_copy", "file_copy"),
                fileConflicts
              )}
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
      </div>
    </SidePanel>
  );
}
