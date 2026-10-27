import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  CustomDropdown,
  CustomTierDropdown,
  HoverTooltip,
  ModSearchDropdown,
} from "../../shared";
import { StaticPollingGuideSidePanel } from "../../side-panels/StaticPollingGuideSidePanel";

export function ArtifactRulesTab({
  mode,
  mod,
  isCloudMod,
  isVerifiedMason,
  isCommitting,
  dlcRegistry,
  activeDlcIds,
  onToggleDlc,
  onClearAllDlc,
  dependencies,
  allConflictAndDepCandidates,
  onAddDependencyDirect,
  onRemoveDependency,
  conflicts,
  conflictSeverity,
  setConflictSeverity,
  onAddConflictCard,
  onRemoveConflict,
  unassignedCloudCollections,
  assignedCloudCollections,
  localCollectionNames,
  newCollectionName,
  setNewCollectionName,
  onToggleCloudCollection,
  onAddCollectionQuick,
  onRemoveLocalCollection,
  onChangeStaticManifestUrl,
  onExportRelease,
  onSyncToNetwork,
  onSaveCloudChanges,
}: {
  mode: "registry" | "sandbox";
  mod: any;
  isCloudMod: boolean;
  isVerifiedMason: boolean;
  isCommitting: boolean;
  dlcRegistry: any[];
  activeDlcIds: string[];
  onToggleDlc: (dlcId: string) => Promise<void>;
  onClearAllDlc: () => void;
  dependencies: any[];
  allConflictAndDepCandidates: any[];
  onAddDependencyDirect: (depCandidate: any) => Promise<void>;
  onRemoveDependency: (dep: any) => Promise<void>;
  conflicts: any[];
  conflictSeverity: number;
  setConflictSeverity: (val: number) => void;
  onAddConflictCard: (targetEnemy: any) => Promise<void>;
  onRemoveConflict: (conf: any) => Promise<void>;
  unassignedCloudCollections: any[];
  assignedCloudCollections: any[];
  localCollectionNames: string[];
  newCollectionName: string;
  setNewCollectionName: (val: string) => void;
  onToggleCloudCollection: (colId: string) => Promise<void>;
  onAddCollectionQuick: () => Promise<void>;
  onRemoveLocalCollection: (name: string) => void;
  onChangeStaticManifestUrl: (url: string) => void;
  onExportRelease?: () => void;
  onSyncToNetwork?: () => void;
  onSaveCloudChanges?: () => void;
}) {
  const { t } = useLexicon();

  const [isDlcDropdownOpen, setIsDlcDropdownOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [showPushToken, setShowPushToken] = useState<boolean>(false);
  const [isPushingManifest, setIsPushingManifest] = useState<boolean>(false);

  const [pushConfig, setPushConfig] = useState<{
    provider: string;
    target_mode: string;
    token: string;
    repo_or_project: string;
    branch: string;
    remote_path: string;
    custom_endpoint: string;
    local_folder_path: string;
  }>(() => {
    try {
      const globalPush = JSON.parse(
        localStorage.getItem("sanctuary_edge_autopush_global") || "{}"
      );
      const modPush = mod?.edge_push_config || {};
      return {
        provider: modPush.provider || globalPush.provider || "manual",
        target_mode: modPush.target_mode || globalPush.target_mode || "manifest",
        token: modPush.token || globalPush.token || "",
        repo_or_project: modPush.repo_or_project || globalPush.repo_or_project || "",
        branch: modPush.branch || globalPush.branch || "main",
        remote_path: modPush.remote_path || "",
        custom_endpoint: modPush.custom_endpoint || globalPush.custom_endpoint || "",
        local_folder_path: modPush.local_folder_path || globalPush.local_folder_path || "",
      };
    } catch {
      return {
        provider: "manual",
        target_mode: "manifest",
        token: "",
        repo_or_project: "",
        branch: "main",
        remote_path: "",
        custom_endpoint: "",
        local_folder_path: "",
      };
    }
  });

  const updatePushConfig = (patch: Partial<typeof pushConfig>) => {
    const next = { ...pushConfig, ...patch };
    setPushConfig(next);
    try {
      const globalPush = JSON.parse(
        localStorage.getItem("sanctuary_edge_autopush_global") || "{}"
      );
      localStorage.setItem(
        "sanctuary_edge_autopush_global",
        JSON.stringify({
          ...globalPush,
          provider: next.provider,
          target_mode: next.target_mode,
          token: next.token,
          repo_or_project: next.repo_or_project,
          branch: next.branch,
          custom_endpoint: next.custom_endpoint,
          local_folder_path: next.local_folder_path,
        })
      );
      const modKey = mod?.hash || mod?.id;
      if (modKey) {
        const savedAll = JSON.parse(
          localStorage.getItem("sanctuary_sandbox_configs") || "{}"
        );
        savedAll[modKey] = {
          ...(savedAll[modKey] || {}),
          edge_push_config: next,
        };
        localStorage.setItem("sanctuary_sandbox_configs", JSON.stringify(savedAll));
      }
    } catch {}
  };

  const handleBrowsePushFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        updatePushConfig({ local_folder_path: selected });
      }
    } catch {}
  };

  const handlePushManifestNow = async () => {
    if (pushConfig.provider === "manual") return;
    setIsPushingManifest(true);
    try {
      const safeNameSlug = ((mod?.name || "mod").split(/[\\/]/).pop() || "mod")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      const versionStr = (mod?.latest_version || "1.0.0").trim();
      const customManifestUrl = (mod?.static_manifest_url || mod?.manifest_url || "").trim();
      const customDownloadUrl =
        (mod?.download_url || mod?.url || "").trim() ||
        (customManifestUrl
          ? customManifestUrl.replace(
              /\/manifest\.json$/i,
              `/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`
            )
          : `https://example.com/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`);

      const prevHashes = Array.from(
        new Set(
          [
            ...(Array.isArray(mod?.local_versions)
              ? mod.local_versions
                  .map((v: any) => v.dna_hash)
                  .filter((h: string) => h && h !== mod?.hash)
              : []),
            ...(Array.isArray(mod?._olderVersions)
              ? mod._olderVersions.map((ov: any) => ov.hash).filter(Boolean)
              : []),
          ].filter(Boolean)
        )
      );

      const manifestPayload = {
        schema_version: "1.0",
        manifest_url: customManifestUrl || undefined,
        artifact: {
          id: mod?.id || safeNameSlug || "unknown",
          name: ((mod?.name || "Unknown Mod").split(/[\\/]/).pop() || "Unknown Mod").replace(
            /\.(package|ts4script|zip)$/i,
            ""
          ),
          author: mod?.master_author || "Unknown Author",
          version: versionStr,
          game_version: mod?.compatible_versions?.[0] || "",
          release_date: new Date().toISOString(),
          game_id: useStore.getState().activeGameSchema?.id || "sims4",
        },
        payload: {
          download_url: customDownloadUrl,
          sha256: mod?.hash || "",
          archive_type: "zip",
        },
        current_hashes: mod?.hash ? [mod.hash] : [],
        modules: mod?.hash
          ? [
              {
                name: (mod?.name || "mod.package").split(/[\\/]/).pop() || "mod.package",
                sha256: mod.hash,
                role: "core",
              },
            ]
          : [],
        atomic_logic: {
          required_dlc: activeDlcIds,
          dependencies: dependencies.map(
            (d) => d.mod?.hash || d.mod?.name || d.dependency_name || ""
          ).filter(Boolean),
          twins: [],
          addons: [],
          conflicts: conflicts.map((c) => ({
            hash: c.enemyMod?.hash || c.enemyMod?.name || "",
            id: c.enemyMod?.id || undefined,
            name: c.enemyMod?.name || undefined,
            severity: Number(c.severity_rank) || 4,
            description: c.resolution_note || undefined,
          })),
          flavors: [],
          collections: localCollectionNames,
        },
        virtual_filesystem: {
          overrides: [],
          injected_folders: [],
        },
        changelog: [t("edge_initial_release", "Initial Release")],
        previous_hashes: prevHashes,
      };

      const res = await invoke<{
        resolved_manifest_url: string;
        provider_ref: string;
        message: string;
      }>("push_static_edge_manifest", {
        manifest: manifestPayload,
        customUrl: customManifestUrl,
        pushConfig,
      });

      if (res?.resolved_manifest_url) {
        onChangeStaticManifestUrl(res.resolved_manifest_url);
      }
      if (pushConfig.provider === "github_gist" && res?.provider_ref && !pushConfig.repo_or_project) {
        updatePushConfig({ repo_or_project: res.provider_ref });
      }
      useStore.getState().pushStatus(res?.message || t("btn_saved", "Saved"), "success");
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setIsPushingManifest(false);
    }
  };
  const [dlcFilterTab, setDlcFilterTab] = useState<string>("ALL");
  const [dlcSearchQuery, setDlcSearchQuery] = useState<string>("");
  const [dlcAssignedFilter, setDlcAssignedFilter] = useState<string>("");
  const [depsSearchFilter, setDepsSearchFilter] = useState<string>("");
  const [conflictsSearchFilter, setConflictsSearchFilter] = useState<string>("");
  const dlcBtnRef = useRef<HTMLButtonElement>(null);
  const dlcInstanceId = React.useId();
  const [dlcCoords, setDlcCoords] = useState({
    top: 0,
    left: 0,
    width: 340,
    isDropUp: false,
  });

  useEffect(() => {
    if (!isDlcDropdownOpen) return;
    window.dispatchEvent(new CustomEvent("sa-close-popovers", { detail: dlcInstanceId }));
    const onOtherOpen = (e: any) => {
      if (e.detail !== dlcInstanceId) setIsDlcDropdownOpen(false);
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    return () => window.removeEventListener("sa-close-popovers", onOtherOpen);
  }, [isDlcDropdownOpen, dlcInstanceId]);

  React.useLayoutEffect(() => {
    if (!isDlcDropdownOpen) return;
    const updatePosition = () => {
      if (dlcBtnRef.current) {
        const rect = dlcBtnRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = spaceBelow < 360 && rect.top > 360;
        const menuWidth = Math.min(Math.max(rect.width, 340), window.innerWidth - 24);
        const clampedLeft = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
        setDlcCoords({
          top: shouldDropUp ? rect.top - 6 : rect.bottom + 6,
          left: clampedLeft,
          width: menuWidth,
          isDropUp: shouldDropUp,
        });
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isDlcDropdownOpen]);

  const dlcCategories = [
    { id: "ALL", label: t("dlc_tab_all", "All Packs") },
    { id: "Expansion Pack", label: t("tab_expansion", "Expansions") },
    { id: "Game Pack", label: t("tab_game_pack", "Game Packs") },
    { id: "Stuff Pack", label: t("tab_stuff_pack", "Stuff Packs") },
    { id: "Kit", label: t("tab_kit", "Kits") },
  ];

  const filteredDlcList = dlcRegistry
    .filter((d) => dlcFilterTab === "ALL" || d.type === dlcFilterTab)
    .filter(
      (d) =>
        !dlcSearchQuery ||
        String(d.name || "").toLowerCase().includes(dlcSearchQuery.toLowerCase()) ||
        String(d.id || "").toLowerCase().includes(dlcSearchQuery.toLowerCase())
    );

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-5 pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* CARD 1: REQUIRED EA PACKS (DLC) */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                {t("icon_inventory_2", "inventory_2")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("studio_rules_dlc_title", "Required EA Packs (DLC)")} ({activeDlcIds.length})
              </h4>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activeDlcIds.length > 4 && (
                <input
                  value={dlcAssignedFilter}
                  onChange={(e) => setDlcAssignedFilter(e.target.value)}
                  placeholder={t("filters", "Filter...")}
                  className="h-6 px-2 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-bold text-[var(--text)] w-24 outline-none"
                />
              )}
              {activeDlcIds.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAllDlc}
                  className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                >
                  {t("nav_clear_all", "Clear All")}
                </button>
              )}
            </div>
          </div>

          <div className="relative w-full">
            <button
              ref={dlcBtnRef}
              type="button"
              onClick={() => setIsDlcDropdownOpen(!isDlcDropdownOpen)}
              className="w-full h-12 px-4 rounded-[var(--radius)] glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-between gap-2 text-xs font-bold text-[var(--text)] transition-all cursor-pointer"
            >
              <span className={activeDlcIds.length === 0 ? "text-[var(--subtext)]" : "text-[var(--text)]"}>
                {activeDlcIds.length === 0
                  ? t("studio_dlc_select_ph", "Select Required EA Packs...")
                  : `${activeDlcIds.length} ${t("studio_dlc_selected_count", "Packs Selected")}`}
              </span>
              <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)]">
                {isDlcDropdownOpen ? "expand_less" : "expand_more"}
              </span>
            </button>

            {isDlcDropdownOpen &&
              createPortal(
                <>
                  <div
                    className="!fixed inset-0 pointer-events-auto"
                    style={{ zIndex: 100000000 }}
                    onClick={() => setIsDlcDropdownOpen(false)}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="!fixed pointer-events-auto rounded-2xl glass-panel portal-glass-fix sa-dropdown-popover p-3 flex flex-col gap-2.5 text-[var(--text)] animate-in fade-in zoom-in-95 duration-150"
                    style={{
                      zIndex: 100000001,
                      top: dlcCoords.isDropUp ? "auto" : dlcCoords.top,
                      bottom: dlcCoords.isDropUp ? window.innerHeight - dlcCoords.top + 8 : "auto",
                      left: dlcCoords.left,
                      width: dlcCoords.width,
                      maxWidth: "calc(100vw - 24px)",
                    }}
                  >
                    <div className="flex items-center gap-2 px-3 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">
                        {t("icon_search", "search")}
                      </span>
                      <input
                        type="text"
                        autoFocus
                        value={dlcSearchQuery}
                        onChange={(e) => setDlcSearchQuery(e.target.value)}
                        placeholder={t("search_ph", "Search {mods}...")}
                        className="bg-transparent border-none outline-none text-xs font-bold text-[var(--text)] w-full placeholder:text-[var(--subtext)]/60"
                      />
                      {dlcSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setDlcSearchQuery("")}
                          className="text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {dlcCategories.map((cat) => {
                        const active = dlcFilterTab === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setDlcFilterTab(cat.id)}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                              active
                                ? "glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)]"
                                : "text-[var(--subtext)] hover:text-[var(--text)] border border-transparent"
                            }`}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                      {filteredDlcList.map((pack) => {
                        const isChecked = activeDlcIds.includes(pack.id);
                        return (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() => onToggleDlc(pack.id)}
                            className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs font-bold transition-all cursor-pointer ${
                              isChecked
                                ? "glass-surface border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--text)]"
                                : "hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`material-symbols-outlined !text-[16px] shrink-0 ${
                                  isChecked ? "text-[var(--accent)]" : "text-[var(--subtext)] opacity-50"
                                }`}
                              >
                                {isChecked ? "check_box" : "check_box_outline_blank"}
                              </span>
                              <span className="truncate">{pack.name || pack.id}</span>
                            </div>
                            <span className="font-mono text-[10px] text-[var(--subtext)] shrink-0">{pack.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>,
                document.getElementById("sa-portals") || document.body
              )}
          </div>

          {activeDlcIds.length === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("dlc_base_game_only", "Base Game Compatible — No Expansion Packs Required")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {activeDlcIds
                .filter((id) => {
                  if (!dlcAssignedFilter.trim()) return true;
                  const pack = dlcRegistry.find((d) => d.id === id);
                  const q = dlcAssignedFilter.toLowerCase();
                  return id.toLowerCase().includes(q) || (pack?.name || "").toLowerCase().includes(q);
                })
                .map((id) => {
                  const pack = dlcRegistry.find((d) => d.id === id);
                  return (
                    <div
                      key={id}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[10px] font-bold text-[var(--accent)] shrink-0">{id}</span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {pack?.name || id}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleDlc(id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Remove")} variant="danger" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* CARD 2: REQUIRED MODS (DEPENDENCIES) */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                {t("icon_extension", "extension")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("studio_rules_deps_title", "Required {Mods} (Dependencies)")} ({dependencies.length})
              </h4>
            </div>
            {dependencies.length > 4 && (
              <input
                value={depsSearchFilter}
                onChange={(e) => setDepsSearchFilter(e.target.value)}
                placeholder={t("filters", "Filter...")}
                className="h-6 px-2 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-bold text-[var(--text)] w-24 outline-none shrink-0"
              />
            )}
          </div>

          <div className="w-full relative z-30">
            <ModSearchDropdown
              modList={allConflictAndDepCandidates.filter(
                (m) => !dependencies.some((d) => (d.mod?.id || d.mod?.hash) === (m.id || m.hash))
              )}
              onSelect={(selectedMod: any) => {
                if (selectedMod) onAddDependencyDirect(selectedMod);
              }}
              selectedItem={null}
              onClear={() => {}}
              placeholder={t("studio_rules_deps_search_ph", "Search catalog to add a required {mod}...")}
            />
          </div>

          {dependencies.length === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_deps_empty", "No required {mods} assigned")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {dependencies
                .filter((dep) => {
                  if (!depsSearchFilter.trim()) return true;
                  return (dep.mod?.name || dep.dependency_name || "")
                    .toLowerCase()
                    .includes(depsSearchFilter.toLowerCase());
                })
                .map((dep) => (
                  <div
                    key={dep.id}
                    className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                  >
                    <span className="text-[11px] font-bold text-[var(--text)] truncate">
                      {dep.mod?.name || dep.dependency_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveDependency(dep)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                    >
                      <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                      <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* CARD 3: INCOMPATIBLE MODS (CONFLICTS) */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--danger)] shrink-0">
                {t("icon_security", "security")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("studio_rules_conflicts_title", "Incompatible {Mods} (Conflicts)")} ({conflicts.length})
              </h4>
            </div>
            {conflicts.length > 4 && (
              <input
                value={conflictsSearchFilter}
                onChange={(e) => setConflictsSearchFilter(e.target.value)}
                placeholder={t("filters", "Filter...")}
                className="h-6 px-2 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-bold text-[var(--text)] w-24 outline-none shrink-0"
              />
            )}
          </div>

          <div className="flex flex-col gap-2.5 relative z-20">
            <div className="w-full">
              <CustomTierDropdown value={conflictSeverity} onChange={setConflictSeverity} />
            </div>
            <div className="w-full">
              <ModSearchDropdown
                modList={allConflictAndDepCandidates.filter(
                  (m) => !conflicts.some((c) => (c.enemyMod?.id || c.enemyMod?.hash) === (m.id || m.hash))
                )}
                onSelect={(selectedMod: any) => {
                  if (selectedMod) onAddConflictCard(selectedMod);
                }}
                selectedItem={null}
                onClear={() => {}}
                placeholder={t("studio_rules_conflicts_search_ph", "Search catalog to flag a conflicting {mod}...")}
              />
            </div>
          </div>

          {conflicts.length === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_conflicts_empty", "No conflicting {mods} flagged")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {conflicts
                .filter((conf) => {
                  if (!conflictsSearchFilter.trim()) return true;
                  return (conf.enemyMod?.name || "")
                    .toLowerCase()
                    .includes(conflictsSearchFilter.toLowerCase());
                })
                .map((conf) => {
                  const sev = conf.severity_rank || 4;
                  return (
                    <div
                      key={conf.id}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                            sev === 4
                              ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                              : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                          }`}
                        >
                          {sev === 4 ? "S4" : "S3"}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {conf.enemyMod?.name || "Conflict Mod"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveConflict(conf)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* CARD 4: COLLECTIONS */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {t("icon_collections_bookmark", "collections_bookmark")}
            </span>
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              {t("studio_rules_collections_title", "Collections & {Mod} Sets")} (
              {isCloudMod ? assignedCloudCollections.length : localCollectionNames.length})
            </h4>
          </div>

          <div className="flex flex-col gap-2.5 relative z-10">
            {isCloudMod && unassignedCloudCollections.length > 0 && (
              <div className="w-full">
                <CustomDropdown
                  disableTint={true}
                  value=""
                  placeholder={t("studio_collections_select_ph", "Add to Existing Collection...")}
                  onChange={(val: string[]) => {
                    if (val[0]) onToggleCloudCollection(val[0]);
                  }}
                  options={unassignedCloudCollections.map((c) => ({
                    id: c.id,
                    label: c.name,
                  }))}
                />
              </div>
            )}
            <div className="flex items-center gap-2 w-full">
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddCollectionQuick()}
                placeholder={t("studio_add_local_collection_ph", "New Collection name...")}
                className="h-12 glass-surface rounded-[var(--radius)] px-4 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={onAddCollectionQuick}
                className="h-12 px-4 rounded-[var(--radius)] glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                  {t("icon_add", "add")}
                </span>
                {t("ql_add", "Add")}
              </button>
            </div>
          </div>

          {(isCloudMod ? assignedCloudCollections.length : localCollectionNames.length) === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_collections_empty", "Not added to any collections")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {isCloudMod
                ? assignedCloudCollections.map((col) => (
                    <div
                      key={col.id}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <span className="text-[11px] font-bold text-[var(--text)] truncate">{col.name}</span>
                      <button
                        type="button"
                        onClick={() => onToggleCloudCollection(col.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                      </button>
                    </div>
                  ))
                : localCollectionNames.map((name) => (
                    <div
                      key={name}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <span className="text-[11px] font-bold text-[var(--text)] truncate">{name}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveLocalCollection(name)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                      </button>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar: Sandbox Static Manifest / Export / Sync OR Cloud Registry Save */}
      {mode === "sandbox" ? (
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                  {t("icon_rocket_launch", "rocket_launch")}
                </span>
                <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  {t(
                    "studio_static_section_title",
                    "Decentralized Static Edge Polling (Tier 1–4 & Independent {Mods})"
                  )}
                </h4>
              </div>
              <p className="text-[11px] font-semibold text-[var(--subtext)] ml-6">
                {t(
                  "studio_static_section_sub",
                  "One-time drag & drop for {Citizens} with automatic lineage hash rollover and $0 static hosting."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--success)] text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_savings", "savings")}
                </span>
                {t("studio_static_pill_zero_cost", "$0 Static Hosting")}
              </span>
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_history", "history")}
                </span>
                {t("studio_static_pill_lineage", "Auto Lineage Hashes")}
              </span>
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer relative group/btn"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_menu_book", "menu_book")}
                </span>
                {t("studio_static_guide_btn", "Static Polling Guide")}
                <HoverTooltip
                  title={t("edge_guide_title", "Static Polling & Lineage Guide")}
                />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
              {t("edge_manifest_url_label", "Static Polling Manifest URL (manifest.json / catalog.json)")}
            </label>
            <input
              value={mod.static_manifest_url || ""}
              onChange={(e) => onChangeStaticManifestUrl(e.target.value)}
              placeholder={t(
                "placeholder_static_manifest_url",
                "https://raw.githubusercontent.com/author/mod/main/manifest.json"
              )}
              className="h-12 glass-surface rounded-[var(--radius)] px-4 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Multi-Provider 1-Click Auto-Push Engine */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                {t("edge_autopush_provider_label", "Auto-Push Provider (1-Click Remote Update)")}
              </label>
              <CustomDropdown
                disableTint={true}
                value={pushConfig.provider}
                onChange={(val: string[]) => {
                  if (val[0]) updatePushConfig({ provider: val[0] });
                }}
                options={[
                  {
                    id: "manual",
                    label: t("edge_autopush_prov_manual", "Manual Upload (Export .zip Only)"),
                  },
                  {
                    id: "github_repo",
                    label: t(
                      "edge_autopush_prov_github_repo",
                      "GitHub Repo / Cloudflare Pages (Auto-Push)"
                    ),
                  },
                  {
                    id: "github_gist",
                    label: t(
                      "edge_autopush_prov_github_gist",
                      "GitHub Gist (Zero-Repo Auto-Create & Push)"
                    ),
                  },
                  {
                    id: "gitlab",
                    label: t("edge_autopush_prov_gitlab", "GitLab / Codeberg / Gitea (Auto-Push)"),
                  },
                  {
                    id: "neocities",
                    label: t("edge_autopush_prov_neocities", "Neocities Site API (Auto-Push)"),
                  },
                  {
                    id: "custom_http",
                    label: t(
                      "edge_autopush_prov_custom_http",
                      "Personal Domain (HTTP PUT / WebDAV)"
                    ),
                  },
                  {
                    id: "local_folder",
                    label: t(
                      "edge_autopush_prov_local_folder",
                      "Local Synced Folder (GitHub Desktop / Drive)"
                    ),
                  },
                ]}
              />
            </div>

            {pushConfig.provider !== "manual" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                  {t("edge_autopush_mode_label", "Manifest Target Mode")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={pushConfig.target_mode}
                  onChange={(val: string[]) => {
                    if (val[0]) updatePushConfig({ target_mode: val[0] });
                  }}
                  options={[
                    {
                      id: "manifest",
                      label: t("edge_autopush_mode_single", "Single-{Mod} manifest.json"),
                    },
                    {
                      id: "catalog",
                      label: t(
                        "edge_autopush_mode_catalog",
                        "Master Creator catalog.json (All {Mods} in 1 File)"
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>

          {pushConfig.provider !== "manual" && (
            <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(pushConfig.provider === "github_repo" || pushConfig.provider === "gitlab") && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_repo_label", "Repository (owner/repo)")}
                      </label>
                      <input
                        value={pushConfig.repo_or_project}
                        onChange={(e) => updatePushConfig({ repo_or_project: e.target.value })}
                        placeholder={t("edge_autopush_repo_label", "Repository (owner/repo)")}
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_branch_label", "Branch")}
                      </label>
                      <input
                        value={pushConfig.branch}
                        onChange={(e) => updatePushConfig({ branch: e.target.value })}
                        placeholder="main"
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_path_label", "Remote File Path")}
                      </label>
                      <input
                        value={pushConfig.remote_path}
                        onChange={(e) => updatePushConfig({ remote_path: e.target.value })}
                        placeholder={
                          pushConfig.target_mode === "catalog"
                            ? "catalog.json"
                            : "my_mod/manifest.json"
                        }
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </>
                )}

                {pushConfig.provider === "github_gist" && (
                  <>
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t(
                          "edge_autopush_gist_label",
                          "Gist ID (Blank = Auto-Create on First Push)"
                        )}
                      </label>
                      <input
                        value={pushConfig.repo_or_project}
                        onChange={(e) => updatePushConfig({ repo_or_project: e.target.value })}
                        placeholder={t(
                          "edge_autopush_gist_label",
                          "Gist ID (Blank = Auto-Create on First Push)"
                        )}
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_path_label", "Remote File Path")}
                      </label>
                      <input
                        value={pushConfig.remote_path}
                        onChange={(e) => updatePushConfig({ remote_path: e.target.value })}
                        placeholder={
                          pushConfig.target_mode === "catalog" ? "catalog.json" : "manifest.json"
                        }
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </>
                )}

                {pushConfig.provider === "neocities" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_site_label", "Neocities Site Name")}
                      </label>
                      <input
                        value={pushConfig.repo_or_project}
                        onChange={(e) => updatePushConfig({ repo_or_project: e.target.value })}
                        placeholder={t("edge_autopush_site_label", "Neocities Site Name")}
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_path_label", "Remote File Path")}
                      </label>
                      <input
                        value={pushConfig.remote_path}
                        onChange={(e) => updatePushConfig({ remote_path: e.target.value })}
                        placeholder={
                          pushConfig.target_mode === "catalog"
                            ? "catalog.json"
                            : "manifests/manifest.json"
                        }
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </>
                )}

                {(pushConfig.provider === "custom_http" || pushConfig.provider === "gitlab") && (
                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                      {t("edge_autopush_endpoint_label", "Custom Endpoint / Host URL")}
                    </label>
                    <input
                      value={pushConfig.custom_endpoint}
                      onChange={(e) => updatePushConfig({ custom_endpoint: e.target.value })}
                      placeholder={
                        pushConfig.provider === "gitlab"
                          ? "https://gitlab.com"
                          : "https://your-domain.com/upload/manifest.json"
                      }
                      className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                )}

                {pushConfig.provider === "local_folder" && (
                  <>
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_folder_label", "Local Synced Folder Path")}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          value={pushConfig.local_folder_path}
                          onChange={(e) => updatePushConfig({ local_folder_path: e.target.value })}
                          placeholder={t("edge_autopush_folder_label", "Local Synced Folder Path")}
                          className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={handleBrowsePushFolder}
                          className="h-10 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                            {t("icon_folder_open", "folder_open")}
                          </span>
                          {t("edge_autopush_btn_browse", "Browse")}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                        {t("edge_autopush_path_label", "Remote File Path")}
                      </label>
                      <input
                        value={pushConfig.remote_path}
                        onChange={(e) => updatePushConfig({ remote_path: e.target.value })}
                        placeholder={
                          pushConfig.target_mode === "catalog"
                            ? "catalog.json"
                            : "my_mod/manifest.json"
                        }
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </>
                )}

                {pushConfig.provider !== "local_folder" && (
                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                      {t(
                        "edge_autopush_token_label",
                        "Scoped API Token / Key (Stored Locally Only)"
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type={showPushToken ? "text" : "password"}
                        value={pushConfig.token}
                        onChange={(e) => updatePushConfig({ token: e.target.value })}
                        placeholder={t(
                          "edge_autopush_token_label",
                          "Scoped API Token / Key (Stored Locally Only)"
                        )}
                        className="h-10 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPushToken(!showPushToken)}
                        className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {showPushToken
                            ? t("icon_visibility_off", "visibility_off")
                            : t("icon_visibility", "visibility")}
                        </span>
                        <HoverTooltip
                          title={t(
                            "edge_autopush_token_label",
                            "Scoped API Token / Key (Stored Locally Only)"
                          )}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-[10px] font-semibold text-[var(--subtext)] px-1">
                <span className="material-symbols-outlined !text-[14px] text-[var(--success)] shrink-0">
                  {t("icon_verified_user", "verified_user")}
                </span>
                <span>
                  {t(
                    "edge_autopush_security_note",
                    "100% Client-Side: Your token stays strictly on this PC and connects directly to your host. Sanctuary servers never see your token or manifest."
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {pushConfig.provider !== "manual" && (
              <button
                type="button"
                disabled={isCommitting || isPushingManifest}
                onClick={handlePushManifestNow}
                className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
              >
                <span
                  className={`material-symbols-outlined !text-[16px] text-[var(--accent)] ${
                    isPushingManifest ? "animate-spin" : ""
                  }`}
                >
                  {isPushingManifest
                    ? t("icon_refresh", "refresh")
                    : t("icon_cloud_sync", "cloud_sync")}
                </span>
                {t("edge_autopush_btn_push_now", "Push Manifest Now")}
              </button>
            )}
            {onExportRelease && (
              <button
                type="button"
                disabled={isCommitting || isPushingManifest}
                onClick={onExportRelease}
                className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                  {t("icon_move_to_inbox", "move_to_inbox")}
                </span>
                {pushConfig.provider !== "manual"
                  ? t("edge_autopush_btn_export_and_push", "Export & Auto-Push (.zip)")
                  : t("studio_publish_export_btn", "Export Static Manifest (.zip)")}
              </button>
            )}
            {isVerifiedMason && onSyncToNetwork && (
              <button
                type="button"
                disabled={isCommitting || isPushingManifest}
                onClick={onSyncToNetwork}
                className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_36%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                  {t("icon_cloud_upload", "cloud_upload")}
                </span>
                {t("studio_publish_sync_btn", "Sync to Nexus")}
              </button>
            )}
          </div>
        </div>
      ) : (
        (onSaveCloudChanges || onSyncToNetwork) && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isCommitting}
              onClick={onSaveCloudChanges || onSyncToNetwork}
              className="h-11 px-5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_36%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_save", "save")}
              </span>
              {t("hub_save", "Save")}
            </button>
          </div>
        )
      )}

      <StaticPollingGuideSidePanel
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        mod={mod}
        activeDlcIds={activeDlcIds}
        dependencies={dependencies}
        conflicts={conflicts}
      />
    </div>
  );
}

