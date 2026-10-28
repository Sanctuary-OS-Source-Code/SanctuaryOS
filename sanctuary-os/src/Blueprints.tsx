import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import {
  ActionButton,
  ViewHeader,
  getExtensionRegex,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  HoverTabDrawer,
  VerticalTabButton,
  DashboardStatTile,
  HoverTooltip,
  ActionPill,
  formatDisplayName,
  getModIcon,
} from "./shared";
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
  StatTileCarousel,
} from "./hub-components/SharedCommandScreenLayout";
import BlueprintMatrix from "./BlueprintMatrix";
import BlueprintArchitect from "./BlueprintArchitect";
import {
  evaluateModIssues,
  groupBrokenMods,
  resolveBlueprintConflicts,
} from "./side-panels/CommandIncompatiblePanel";
import { GhostStringsModal } from "./side-panels/GhostStringsModal";
import { UniversalCard } from "./components/universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "./chameleon-components/ThemeCard";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function Blueprints({
  playSets,
  setPlaySets,
  activeSetName,
  equipPlaySet,
  deletePlaySet,
  syncCode,
  setSyncCode,
  uploadBlueprintToCloud,
  syncBlueprintByCode,
  renamePlaySet,
  importPlaySet,
  activePlaySetIndex,
  setActivePlaySetIndex,
  exportPlaySet,
  setIsDraftingSet,
  isDraftingSet,
  draftSetName,
  setDraftSetName,
  finalizeDraftSet,
  toggleInActiveSet,
  onSearchNetwork,
  vaultPath,
  onRefreshMods,
  getMissingStrings,
  ignoreMissingString,
  purgeMissingString,
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, modList, activeGameSchema, ignoredGlobal } = useStore();
  const setIsBlueprintSwapOpen = useModalStore((state: any) => state.setIsBlueprintSwapOpen);
  const [activeTab, setActiveTab] = useState("LANDING");
  const [selectedUplinkBlueprint, setSelectedUplinkBlueprint] = useState<any>(null);
  const [pinnedBlueprints, setPinnedBlueprints] = useState<string[]>(() => {
    try {
      const p = localStorage.getItem("myPinnedBlueprints");
      return p ? JSON.parse(p) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("myPinnedBlueprints", JSON.stringify(pinnedBlueprints));
  }, [pinnedBlueprints]);
  const togglePin = (name: string) =>
    setPinnedBlueprints((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [importStatus, setImportStatus] = useState<
    "idle" | "loading" | "success" | "error" | "missing"
  >("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncInputVisible, setSyncInputVisible] = useState(false);
  const [localSyncCode, setLocalSyncCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [ghostModalSet, setGhostModalSet] = useState<string | null>(null);
  const [ghostStrings, setGhostStrings] = useState<string[]>([]);

  const [myCloudBlueprints, setMyCloudBlueprints] = useState<any[]>([]);
  const [cloudFilterTab, setCloudFilterTab] = useState<"all" | "not_in_vault">("all");
  const [cloudSearchQuery, setCloudSearchQuery] = useState("");
  const [uplinkArtifactSearch, setUplinkArtifactSearch] = useState("");
  const [uplinkArtifactsLimit, setUplinkArtifactsLimit] = useState(100);

  useEffect(() => {
    setUplinkArtifactsLimit(100);
  }, [selectedUplinkBlueprint, uplinkArtifactSearch]);

  useEffect(() => {
    const session = useStore.getState().session;
    if (session?.user?.id) {
      supabase
        .from("masons")
        .select("id")
        .eq("profile_id", session.user.id)
        .maybeSingle()
        .then(({ data: masonData }) => {
          if (masonData?.id) {
            supabase
              .from("blueprints")
              .select("name, code, created_at, artifacts")
              .eq("mason_id", masonData.id)
              .order("created_at", { ascending: false })
              .then(({ data }) => setMyCloudBlueprints(data || []));
          } else {
            setMyCloudBlueprints([]);
          }
        });
    }
  }, []);

  const handleImport = async () => {
    setImportStatus("loading");
    const res = await importPlaySet();
    if (res) {
      setImportStatus(res);
      setTimeout(() => setImportStatus("idle"), 3000);
    } else {
      setImportStatus("idle");
    }
  };

  const extRegex = useMemo(() => getExtensionRegex(activeGameSchema), [activeGameSchema]);

  const optimizedModList = useMemo(() => {
    const map = new Map();
    const fallbackArr: any[] = [];
    (modList || []).forEach((m: any) => {
      map.set(m.name, m);
      const mBase = m.name?.split(/[\\/]/).pop()?.replace(extRegex, "");
      const mExt = m.name?.split(".").pop()?.toLowerCase();
      if (mBase && mExt) {
        fallbackArr.push({ ...m, _mBase: mBase, _mExt: mExt });
      }
    });
    return { map, fallbackArr };
  }, [modList, extRegex]);

  const [radarCacheTick, setRadarCacheTick] = useState(0);
  useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () =>
      window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  const getBlueprintAlertCount = (set: any) => {
    const res = { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 };
    if (!set || !set.mods || !Array.isArray(set.mods) || set.mods.length === 0) return res;

    const activeMods = set.mods.map((rawMod: any) => {
      const modName =
        typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
      const exactMatch = optimizedModList.map.get(modName);
      if (exactMatch)
        return {
          ...exactMatch,
          _originalSetName: modName,
        };

      const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, "");
      const targetExt = modName.split(".").pop()?.toLowerCase();

      const fallbackMatch = optimizedModList.fallbackArr.find(
        (m: any) => m._mBase === targetBase && m._mExt === targetExt
      );
      if (fallbackMatch)
        return {
          ...fallbackMatch,
          _originalSetName: modName,
        };

      return {
        name: modName,
        isFallback: true,
        _originalSetName: modName,
      };
    });

    const evaluatedBroken = activeMods
      .map((mod: any) =>
        evaluateModIssues(mod, {
          activeMods,
          selectedVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        })
      )
      .filter(Boolean);

    const groupedBroken = groupBrokenMods(evaluatedBroken);
    for (const gm of groupedBroken) {
      if (gm._alert_type === "red") res.broken++;
      else res.unstable++;
    }

    const resolvedConflicts = resolveBlueprintConflicts(
      set.name,
      activeMods,
      ignoredGlobal,
      t
    );
    for (const c of resolvedConflicts) {
      if (Number(c.conflict?.severity_rank) === 4) res.tier4++;
      else res.tier3++;
    }

    res.total = res.broken + res.unstable + res.tier4 + res.tier3;
    return res;
  };

  const setComputations = useMemo(() => {
    const comps: Record<string, { alertStatus: any; hasGhosts: boolean }> = {};
    (playSets || []).forEach((set: any) => {
      const alertStatus = getBlueprintAlertCount(set);
      let hasGhosts = false;
      if (set && set.mods) {
        for (const rawMod of set.mods) {
          const modName =
            typeof rawMod === "string" ? rawMod : rawMod.name || rawMod.path || "";
          if (!modName) continue;
          if (!optimizedModList.map.has(modName)) {
            hasGhosts = true;
            break;
          }
        }
      }
      comps[set.name] = { alertStatus, hasGhosts };
    });
    return comps;
  }, [
    playSets,
    optimizedModList,
    extRegex,
    selectedVersion,
    ownedDLC,
    maskedDLC,
    ignoredGlobal,
    activeGameSchema,
    t,
    radarCacheTick,
  ]);

  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [matrixPlaySet, setMatrixPlaySet] = useState<any>(null);
  const [editingSetName, setEditingSetName] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [cleanConfirm, setCleanConfirm] = useState<string | null>(null);
  const [isArchitectOpen, setIsArchitectOpen] = useState(false);

  const handleOpenMatrix = (setName: string) => {
    const targetSet = playSets.find((s: any) => s.name === setName);
    if (targetSet) {
      setMatrixPlaySet(targetSet);
      setIsMatrixOpen(true);
    }
  };

  const totalAlerts = Object.values(setComputations).reduce(
    (acc: number, comp: any) => acc + (comp.alertStatus?.total || 0) + (comp.hasGhosts ? 1 : 0),
    0
  );

  const renderVaultCard = (set: any) => {
    const { alertStatus, hasGhosts } = setComputations[set.name] || {
      alertStatus: { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 },
      hasGhosts: false,
    };
    const isPinned = pinnedBlueprints.includes(set.name);
    const hasAlerts = alertStatus && alertStatus.total > 0;
    const isDeployed = activeSetName === set.name;
    const linkedModsCount = (set.mods || [])
      .map((m: any) => (typeof m === "string" ? m : m?.name || ""))
      .filter(
        (modName: string) =>
          modName &&
          !modName.startsWith("FOLDER_") &&
          !modName.startsWith("SET_") &&
          !modName.startsWith("LOCAL_SET_")
      ).length;

    const titleNode =
      editingSetName === set.name ? (
        <div onClick={(e) => e.stopPropagation()} className="w-full">
          <input
            autoFocus
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                  renamePlaySet(set.name, newSetName.trim());
                }
                setEditingSetName(null);
              } else if (e.key === "Escape") {
                setEditingSetName(null);
              }
            }}
            onBlur={() => {
              if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                renamePlaySet(set.name, newSetName.trim());
              }
              setEditingSetName(null);
            }}
            className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-3 py-1.5 rounded-xl text-sm font-black text-[var(--text)] tracking-tight outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      ) : (
        <div
          className="flex items-center gap-2 cursor-pointer w-full group/editbtn"
          onClick={(e) => {
            e.stopPropagation();
            setNewSetName(set.name);
            setEditingSetName(set.name);
          }}
        >
          <span className="truncate">{set.name}</span>
          <span className="material-symbols-outlined !text-[14px] opacity-0 group-hover/editbtn:opacity-100 transition-opacity text-[var(--subtext)] hover:text-[var(--accent)] shrink-0">
            {t("icon_edit", "edit")}
          </span>
        </div>
      );

    return (
      <UniversalCard
        key={set.name}
        layout="vertical"
        isActive={isDeployed}
        icon={isDeployed ? t("icon_verified_user", "verified_user") : t("icon_map", "map")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{ ...set, json_data: { artifacts: set.mods || [] } }}
            heightClass="h-full"
          />
        }
        title={titleNode}
        subtitle={isDeployed ? t("btn_deployed", "Deployed") : t("term_blueprint", "{Blueprint}")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isDeployed ? "text-[var(--success)]" : "text-[var(--subtext)]"
                }`}
              >
                {isDeployed ? t("icon_verified_user", "verified_user") : t("icon_schedule", "schedule")}
              </span>
              <span>
                {isDeployed ? t("status_active", "Active") : t("status_standby", "Standby")}
              </span>
            </div>
          </div>
        }
        actions={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePin(set.name);
            }}
            className={`w-8 h-8 rounded-xl glass-surface border flex items-center justify-center transition-all relative ${
              isPinned
                ? "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_55%,transparent)] opacity-100"
                : "text-[var(--subtext)] opacity-65 hover:opacity-100 border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)]"
            }`}
          >
            <span
              className="material-symbols-outlined !text-[16px]"
              style={{
                fontVariationSettings: isPinned ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {isPinned
                ? t("icon_keep", "keep")
                : t("icon_keep_off", "keep_off")}
            </span>
            <HoverTooltip
              title={
                isPinned
                  ? t("action_unpin", "Unpin {Blueprint}")
                  : t("action_pin", "Pin {Blueprint}")
              }
            />
          </button>
        }
        badges={
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUplinkBlueprint({
                  name: set.name,
                  code: "LOCAL BLUEPRINT",
                  artifacts: set.mods,
                });
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {linkedModsCount} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>
            {selectedVersion && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_sell", "sell")}
                </span>
                <span className="text-[var(--subtext)]">v{selectedVersion}</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (setActivePlaySetIndex)
                  setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name));
                setIsArchitectOpen(true);
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors cursor-pointer`}
            >
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--warning)]"
                    : "text-[var(--success)]"
                }`}
              >
                {hasAlerts
                  ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                    ? t("icon_error", "error")
                    : t("icon_warning", "warning")
                  : t("icon_verified", "verified")}
              </span>
              <span
                className={
                  hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--warning)]"
                    : "text-[var(--subtext)]"
                }
              >
                {hasAlerts
                  ? `${alertStatus.total} ${t("system_alerts_title", "Alerts")}`
                  : t("tier_clean", "Clean")}
              </span>
            </button>
          </>
        }
        footer={
          <div className="flex flex-col gap-2.5 w-full">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  equipPlaySet && equipPlaySet(set.name);
                }}
                className={`flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border glass-surface ${
                  isDeployed
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {isDeployed
                    ? t("icon_verified_user", "verified_user")
                    : t("icon_play_circle", "play_circle")}
                </span>
                <span>
                  {isDeployed ? t("btn_deployed", "Deployed") : t("playsets_btn_equip", "Equip")}
                </span>
                <HoverTooltip
                  title={
                    isDeployed
                      ? t("btn_deployed", "Deployed")
                      : t("action_equip", "Equip {Blueprint}")
                  }
                />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (setActivePlaySetIndex)
                    setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name));
                  setIsArchitectOpen(true);
                }}
                className={`h-9 px-3.5 glass-surface border rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider ${
                  hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                      : "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? t("icon_error", "error")
                      : t("icon_warning", "warning")
                    : t("icon_tune", "tune")}
                </span>
                <HoverTooltip
                  title={
                    hasAlerts
                      ? `${alertStatus.total} ${t("system_alerts_title", "Alerts")}`
                      : t("architect", "Blueprint Architect")
                  }
                />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenMatrix(set.name);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-lg transition-all flex items-center justify-center relative"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_cloud", "cloud")}
                </span>
                <HoverTooltip title={t("action_uplink", "Uplink")} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  exportPlaySet && exportPlaySet(set.name);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-lg transition-all flex items-center justify-center relative"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_upload", "upload")}
                </span>
                <HoverTooltip title={t("action_export", "Export")} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const missingStrings = getMissingStrings ? getMissingStrings(set.name) : [];
                  if (missingStrings.length > 0) {
                    setGhostStrings(missingStrings);
                    setGhostModalSet(set.name);
                  } else {
                    setCleanConfirm(set.name);
                    setTimeout(() => setCleanConfirm(null), 2000);
                    window.dispatchEvent(
                      new CustomEvent("push-status", {
                        detail: {
                          message: t(
                            "status_blueprint_clean",
                            "{Blueprint} is already fully sanitized."
                          ),
                          type: "success",
                        },
                      })
                    );
                  }
                }}
                className={`h-8 rounded-lg transition-all flex items-center justify-center border glass-surface relative ${
                  cleanConfirm === set.name
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : hasGhosts
                      ? "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {cleanConfirm === set.name
                    ? t("icon_check_circle", "check_circle")
                    : t("icon_cleaning_services", "cleaning_services")}
                </span>
                <HoverTooltip
                  title={
                    cleanConfirm === set.name
                      ? t("tier_clean", "Clean")
                      : t("action_clean_blueprint", "Clean {Blueprint}")
                  }
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (deleteConfirm === set.name) {
                    deletePlaySet && deletePlaySet(set.name);
                    setDeleteConfirm(null);
                  } else {
                    setDeleteConfirm(set.name);
                    setTimeout(() => setDeleteConfirm(null), 3000);
                  }
                }}
                className={`h-8 transition-all flex items-center justify-center rounded-lg border glass-surface relative ${
                  deleteConfirm === set.name
                    ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {deleteConfirm === set.name
                    ? t("icon_warning", "warning")
                    : t("icon_delete", "delete")}
                </span>
                <HoverTooltip
                  title={
                    deleteConfirm === set.name ? t("confirm", "Confirm") : t("purge", "Delete")
                  }
                />
              </button>
            </div>
          </div>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full">
      <ViewHeader
        title={t("playsets_title", "{Blueprints}")}
        subtitle={t("playsets_subtitle", "Manage load orders and cloud uplinks")}
        icon={t("icon_map", "map")}
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        shape="circle"
        breadcrumb={
          activeTab !== "LANDING"
            ? t(`tab_${activeTab.toLowerCase()}`, activeTab) || activeTab
            : undefined
        }
        onTitleClick={() => setActiveTab("LANDING")}
      >
        {activeTab === "VAULT" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <ActionPill
              searchQuery={vaultSearchQuery}
              setSearchQuery={setVaultSearchQuery}
              searchPlaceholder={t("nav_search", "Search...") as string}
              actions={[
                {
                  id: "draft_new",
                  icon: (
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_add_circle", "add_circle")}
                    </span>
                  ),
                  label: t("draft_new", "Draft New {Blueprint}"),
                  onClick: () => setIsDraftingSet && setIsDraftingSet(true),
                },
              ]}
            />
          </div>
        )}
        {activeTab === "NETWORK" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <ActionPill
              searchQuery={cloudSearchQuery}
              setSearchQuery={setCloudSearchQuery}
              searchPlaceholder={t("nav_search", "Search...") as string}
              actions={[
                {
                  id: "filter_missing",
                  icon: (
                    <span className="material-symbols-outlined !text-[20px]">
                      {cloudFilterTab === "not_in_vault"
                        ? t("icon_visibility_off", "visibility_off")
                        : t("icon_visibility", "visibility")}
                    </span>
                  ),
                  label:
                    cloudFilterTab === "not_in_vault"
                      ? t("show_all", "Show All {Blueprints}")
                      : t("blueprint_tab_missing", "Missing from {Vault}"),
                  activeClassName:
                    cloudFilterTab === "not_in_vault"
                      ? "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                      : "",
                  onClick: () =>
                    setCloudFilterTab(
                      cloudFilterTab === "not_in_vault" ? "all" : "not_in_vault"
                    ),
                },
              ]}
            />
          </div>
        )}
      </ViewHeader>

      <div className="md:hidden">
        <HoverTabDrawer
          title={t("playsets_title", "{Blueprints}")}
          activeTab={activeTab}
          setTab={setActiveTab}
        >
          <VerticalTabButton
            id="LANDING"
            icon={t("icon_dashboard", "dashboard")}
            label={t("tab_landing", "Overview")}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="VAULT"
            icon={t("icon_map", "map")}
            label={t("playsets_all", "All Blueprints")}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="NETWORK"
            icon={t("icon_cloud", "cloud")}
            label={t("btn_my_cloud_blueprints", "My Cloud {Blueprints}")}
            activeTab={activeTab}
            setTab={setActiveTab}
            iconColorClass="text-sky-500"
          />
        </HoverTabDrawer>
      </div>

      <div className="flex flex-col w-full gap-3 mb-8 md:mb-10">
        <StatTileCarousel>
          <DashboardStatTile
            variant="tab"
            icon={t("icon_dashboard", "dashboard")}
            label={t("tab_landing", "Overview")}
            number={activeSetName || ""}
            onClick={() => setActiveTab("LANDING")}
            isActive={activeTab === "LANDING"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_map", "map")}
            label={t("playsets_all", "All Blueprints")}
            number={playSets?.length || 0}
            onClick={() => setActiveTab("VAULT")}
            isActive={activeTab === "VAULT"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_cloud", "cloud")}
            label={t("btn_my_cloud_blueprints", "My Cloud {Blueprints}")}
            colorClass="text-sky-500"
            number={myCloudBlueprints?.length || 0}
            onClick={() => setActiveTab("NETWORK")}
            isActive={activeTab === "NETWORK"}
          />
        </StatTileCarousel>
      </div>

      {activeTab === "LANDING" && (
        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
          <CommandScreenLayout>
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("pinned_blueprints", "Pinned {Blueprints}")}
                    icon={t("icon_keep", "keep")}
                  />

                  {pinnedBlueprints.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                      {playSets
                        .filter((s: any) => pinnedBlueprints.includes(s.name))
                        .map((set: any) => renderVaultCard(set))}
                    </div>
                  ) : (
                    <div className="text-[10px] font-black tracking-widest capitalize text-[var(--subtext)] opacity-50 text-center py-10 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed rounded-2xl h-full flex items-center justify-center min-h-[9rem] glass-panel">
                      {t("no_pinned_blueprints", "No Pinned {Blueprints}")}
                    </div>
                  )}
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("quick_actions", "Quick Actions")} icon={t("icon_bolt", "bolt")}>
                <CommandScreenQuickLink
                  icon={t("icon_add_circle", "add_circle")}
                  title={t("draft_new", "Draft New {Blueprint}")}
                  subtitle={t("draft_new_desc", "Create a new {blueprint}")}
                  onClick={() => {
                    setActiveTab("VAULT");
                    setIsDraftingSet(true);
                  }}
                  dotColorClass="bg-emerald-500 shadow-md"
                  textColorClass="text-emerald-500"
                  hoverTextColorClass="group-hover:text-emerald-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
                />
                <CommandScreenQuickLink
                  icon={t("icon_check_circle", "check_circle")}
                  title={t("btn_deployed", "Deployed")}
                  subtitle={activeSetName || t("unknown", "Unknown")}
                  onClick={() => setIsBlueprintSwapOpen(true)}
                  dotColorClass="bg-indigo-500 shadow-md"
                  textColorClass="text-indigo-500"
                  hoverTextColorClass="group-hover:text-indigo-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                />
                {totalAlerts > 0 && (
                  <CommandScreenQuickLink
                    icon={t("icon_error", "error")}
                    title={t("system_alerts_title", "System Alerts")}
                    subtitle={`${totalAlerts} ${t("system_alerts_title", "Alerts")}`}
                    onClick={() => {
                      const activeAlertCount =
                        setComputations[activeSetName]?.alertStatus?.total || 0;
                      if (activeAlertCount === 0 && setActivePlaySetIndex) {
                        const firstWithAlertsIdx = (playSets || []).findIndex(
                          (s: any) => (setComputations[s.name]?.alertStatus?.total || 0) > 0
                        );
                        if (firstWithAlertsIdx >= 0) {
                          setActivePlaySetIndex(firstWithAlertsIdx);
                        }
                      }
                      setIsArchitectOpen(true);
                    }}
                    dotColorClass="bg-rose-500 shadow-md"
                    textColorClass="text-rose-500"
                    hoverTextColorClass="group-hover:text-rose-400"
                    iconShadowClass="drop-shadow-md"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                  />
                )}
                <CommandScreenQuickLink
                  icon={
                    importStatus === "loading"
                      ? t("icon_sync", "sync")
                      : t("icon_download", "download")
                  }
                  title={
                    importStatus === "loading"
                      ? t("btn_importing", "Importing...")
                      : importStatus === "success"
                        ? t("status_profile_imported", "Imported")
                        : importStatus === "error"
                          ? t("alert_import_failed", "Import Failed")
                          : t("playsets_btn_import", "IMPORT {Blueprint}")
                  }
                  subtitle={t("import_desc", "Import a JSON file to load an external {Blueprint}.")}
                  onClick={handleImport}
                  dotColorClass="bg-blue-500 shadow-md"
                  textColorClass="text-blue-500"
                  hoverTextColorClass="group-hover:text-blue-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                />
                {syncInputVisible ? (
                  <div className="w-full p-6 glass-panel border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-2xl relative h-24 text-left group animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-5 h-full relative z-10 w-full">
                      <div className="w-12 h-12 rounded-xl glass-surface border flex items-center justify-center shrink-0 border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-3xl">
                          {t("icon_cloud_download", "cloud_download")}
                        </span>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 w-full justify-center">
                        <div className="flex items-center justify-start w-full border-b border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1">
                          <input
                            autoFocus
                            value={localSyncCode}
                            onChange={(e) => setLocalSyncCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && localSyncCode.trim()) {
                                if (setSyncCode) setSyncCode(localSyncCode.trim());
                                if (syncBlueprintByCode) {
                                  setIsSyncing(true);
                                  syncBlueprintByCode(localSyncCode.trim()).finally(() =>
                                    setIsSyncing(false)
                                  );
                                }
                                setLocalSyncCode("");
                                setSyncInputVisible(false);
                              }
                            }}
                            placeholder={t("sidebar_uplink_placeholder", "Enter Uplink Code...")}
                            className="bg-transparent border-none outline-none w-full text-[11px] font-black capitalize tracking-widest text-[var(--accent)] placeholder:text-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          />
                          <button
                            onClick={() => setSyncInputVisible(false)}
                            className="text-[var(--subtext)] hover:text-white ml-2 transition-colors shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_close", "close")}
                            </span>
                          </button>
                        </div>
                        <span className="text-[8px] capitalize font-bold opacity-80 tracking-widest text-[var(--accent)] mt-1.5 flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[10px]">
                            {t("icon_keyboard_return", "keyboard_return")}
                          </span>
                          {t("press_enter_to_sync", "Press Enter to Sync")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CommandScreenQuickLink
                    icon={
                      isSyncing
                        ? t("icon_sync", "sync")
                        : t("icon_cloud_sync", "cloud_sync")
                    }
                    title={
                      isSyncing
                        ? t("btn_importing", "Syncing...")
                        : t("btn_sync", "Sync by Uplink Code")
                    }
                    subtitle={t("sync_desc", "Download a cloud blueprint via code")}
                    onClick={() => setSyncInputVisible(true)}
                    dotColorClass="bg-sky-500 shadow-md"
                    textColorClass="text-sky-500"
                    hoverTextColorClass="group-hover:text-sky-400"
                    iconShadowClass="drop-shadow-md"
                    iconBorderHoverClass="group-hover:border-sky-500/30"
                  />
                )}
                <CommandScreenQuickLink
                  icon={t("icon_camera", "camera")}
                  title={t("btn_snapshot", "Snapshot Active {Blueprint}")}
                  subtitle={t("snapshot_desc", "Clone active {blueprint}")}
                  onClick={() => {
                    const activeSet = playSets[activePlaySetIndex];
                    if (!activeSet) return;
                    let copyIndex = 1;
                    let newName = `${activeSet.name} (Copy)`;
                    while (
                      playSets.some(
                        (s: any) => s.name.toLowerCase() === newName.toLowerCase()
                      )
                    ) {
                      newName = `${activeSet.name} (Copy) (${copyIndex})`;
                      copyIndex++;
                    }
                    const updatedSets = [
                      ...playSets,
                      {
                        name: newName,
                        mods: [...activeSet.mods],
                        modHashes: activeSet.modHashes
                          ? { ...activeSet.modHashes }
                          : undefined,
                        modMeta: activeSet.modMeta ? { ...activeSet.modMeta } : undefined,
                        loadRules: Array.isArray(activeSet.loadRules)
                          ? activeSet.loadRules.map((r: any) => ({ ...r }))
                          : undefined,
                        modTiers: activeSet.modTiers ? { ...activeSet.modTiers } : undefined,
                        loadOrder: Array.isArray(activeSet.loadOrder)
                          ? [...activeSet.loadOrder]
                          : undefined,
                      },
                    ];
                    setPlaySets(updatedSets);
                    window.dispatchEvent(new Event("storage"));
                    if (setActivePlaySetIndex) setActivePlaySetIndex(updatedSets.length - 1);
                    setActiveTab("VAULT");
                  }}
                  dotColorClass="bg-amber-500 shadow-md"
                  textColorClass="text-amber-500"
                  hoverTextColorClass="group-hover:text-amber-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                />
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      )}

      {activeTab === "VAULT" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-12 pt-2">
            {isDraftingSet && (
              <div className="glass-panel border-[color-mix(in_srgb,var(--accent)_35%,transparent)] p-6 rounded-2xl flex flex-col gap-4 animate-in zoom-in-95 relative min-h-[14rem] justify-center">
                <input
                  autoFocus
                  type="text"
                  value={draftSetName}
                  onChange={(e) => setDraftSetName && setDraftSetName(e.target.value)}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-4 text-xl text-[var(--text)] font-black outline-none focus:border-[var(--accent)] transition-all z-10 text-center"
                  placeholder={t("draft_placeholder", "{Blueprint} Name...")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finalizeDraftSet();
                  }}
                />
                <div className="flex gap-3 mt-2 z-10">
                  <button
                    onClick={finalizeDraftSet}
                    className="flex-1 py-3 glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] font-black capitalize tracking-widest text-[10px] rounded-xl hover:border-[color-mix(in_srgb,var(--success)_65%,transparent)] transition-all"
                  >
                    {t("hub_save", "Save")}
                  </button>
                  <button
                    onClick={() => setIsDraftingSet && setIsDraftingSet(false)}
                    className="w-16 py-3 flex items-center justify-center glass-surface text-[var(--text)] font-black rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:text-[var(--danger)] transition-all"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {(playSets || [])
              .filter(
                (s: any) =>
                  !vaultSearchQuery ||
                  s.name.toLowerCase().includes(vaultSearchQuery.toLowerCase())
              )
              .map((set: any) => renderVaultCard(set))}
          </div>
        </div>
      )}

      {activeTab === "NETWORK" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-32">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 h-full pt-2">
            {myCloudBlueprints.length === 0 ? (
              <div className="text-[10px] font-black tracking-widest capitalize text-[var(--subtext)] opacity-50 text-center py-10 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed rounded-xl col-span-full glass-panel">
                <span className="material-symbols-outlined block mb-2 opacity-50">
                  {t("icon_cloud_off", "cloud_off")}
                </span>
                {t("no_cloud_blueprints", "No Cloud {Blueprints}")}
              </div>
            ) : myCloudBlueprints.filter((bp) => {
                const inVault = playSets.some(
                  (set: any) =>
                    (set.code && set.code.toUpperCase() === bp.code.toUpperCase()) ||
                    set.name.toLowerCase() === bp.name.toLowerCase()
                );
                const matchesSearch =
                  !cloudSearchQuery ||
                  bp.name.toLowerCase().includes(cloudSearchQuery.toLowerCase()) ||
                  bp.code.toLowerCase().includes(cloudSearchQuery.toLowerCase());
                return (cloudFilterTab === "all" ? true : !inVault) && matchesSearch;
              }).length === 0 ? (
              <div className="text-[10px] font-black tracking-widest capitalize text-[var(--subtext)] opacity-50 text-center py-10 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed rounded-xl col-span-full glass-panel">
                <span className="material-symbols-outlined block mb-2 opacity-50">
                  {t("icon_task_alt", "task_alt")}
                </span>
                {t("no_cloud_blueprints", "No Cloud {Blueprints}")}
              </div>
            ) : (
              myCloudBlueprints
                .filter((bp) => {
                  const inVault = playSets.some(
                    (set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase()
                  );
                  const matchesSearch =
                    !cloudSearchQuery ||
                    bp.name.toLowerCase().includes(cloudSearchQuery.toLowerCase()) ||
                    bp.code.toLowerCase().includes(cloudSearchQuery.toLowerCase());
                  return (cloudFilterTab === "all" ? true : !inVault) && matchesSearch;
                })
                .map((bp) => {
                  const inVault = playSets.some(
                    (set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase()
                  );
                  return (
                    <UniversalCard
                      key={bp.code}
                      layout="vertical"
                      isActive={inVault}
                      icon={
                        inVault
                          ? t("icon_cloud_done", "cloud_done")
                          : t("icon_cloud_download", "cloud_download")
                      }
                      customIcon={<DynamicBlueprintPreviewBanner data={bp} heightClass="h-full" />}
                      title={bp.name}
                      subtitle={bp.code}
                      onClick={() => setSelectedUplinkBlueprint(bp)}
                      imageOverlay={
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                          <div className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] ${
                                inVault ? "text-[var(--success)]" : "text-[var(--accent)]"
                              }`}
                            >
                              {inVault
                                ? t("icon_verified_user", "verified_user")
                                : t("icon_cloud", "cloud")}
                            </span>
                            <span>
                              {inVault
                                ? t("status_in_vault", "In {Vault}")
                                : t("status_not_in_vault", "Not In {Vault}")}
                            </span>
                          </div>
                        </div>
                      }
                      actions={
                        !inVault ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (setSyncCode) setSyncCode(bp.code);
                              if (syncBlueprintByCode) {
                                setIsSyncing(true);
                                syncBlueprintByCode(bp.code).finally(() => setIsSyncing(false));
                              }
                            }}
                            className="w-8 h-8 rounded-xl glass-surface text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] flex items-center justify-center transition-all relative"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_download", "download")}
                            </span>
                            <HoverTooltip title={t("action_sync", "Sync {Blueprint}")} />
                          </button>
                        ) : undefined
                      }
                      badges={
                        <>
                          {bp.artifacts && bp.artifacts.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUplinkBlueprint(bp);
                              }}
                              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
                            >
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_extension", "extension")}
                              </span>
                              <span>
                                {bp.artifacts.length} {t("artifacts_linked", "{Mods} Linked")}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(bp.code).catch(() => {});
                              setCopiedCode(bp.code);
                              setTimeout(() => setCopiedCode(null), 2000);
                            }}
                            className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-colors cursor-pointer`}
                          >
                            <span
                              className={`material-symbols-outlined !text-[12px] ${
                                copiedCode === bp.code
                                  ? "text-[var(--success)]"
                                  : "text-[var(--subtext)]"
                              }`}
                            >
                              {copiedCode === bp.code
                                ? t("icon_check", "check")
                                : t("icon_content_copy", "content_copy")}
                            </span>
                            <span
                              className={
                                copiedCode === bp.code
                                  ? "text-[var(--success)]"
                                  : "text-[var(--subtext)]"
                              }
                            >
                              {copiedCode === bp.code ? t("copied", "Copied") : bp.code}
                            </span>
                          </button>
                        </>
                      }
                      footer={
                        <div className="flex gap-2 items-center justify-between group">
                          <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_event", "event")}
                            </span>
                            {new Date(bp.created_at).toLocaleDateString()}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!inVault) {
                                if (setSyncCode) setSyncCode(bp.code);
                                if (syncBlueprintByCode) {
                                  setIsSyncing(true);
                                  syncBlueprintByCode(bp.code).finally(() => setIsSyncing(false));
                                }
                              } else {
                                setSelectedUplinkBlueprint(bp);
                              }
                            }}
                            className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0"
                          >
                            {!inVault
                              ? t("action_sync", "Sync {Blueprint}")
                              : t("blueprint_inspector", "Blueprint Mods")}{" "}
                            <span className="text-base leading-none">&rarr;</span>
                          </button>
                        </div>
                      }
                    />
                  );
                })
            )}
          </div>
        </div>
      )}

      <BlueprintMatrix
        isOpen={isMatrixOpen}
        onClose={() => setIsMatrixOpen(false)}
        playSet={matrixPlaySet}
        modList={modList}
        onUpdatePlaySet={(updatedSet: any) => {
          setMatrixPlaySet(updatedSet);
          const updatedSets = playSets.map((s: any) =>
            s.name === updatedSet.name ? updatedSet : s
          );
          setPlaySets(updatedSets);
        }}
        onUpload={async (
          isPublic: boolean,
          isLocked: boolean,
          allowedMods: any[],
          isMarketListed: boolean
        ) => {
          if (uploadBlueprintToCloud && matrixPlaySet) {
            return await uploadBlueprintToCloud(
              matrixPlaySet.name,
              isPublic,
              isLocked,
              allowedMods,
              isMarketListed
            );
          }
          return undefined;
        }}
      />

      <BlueprintArchitect
        isOpen={isArchitectOpen}
        onClose={() => setIsArchitectOpen(false)}
        playSet={playSets[activePlaySetIndex]}
        modList={modList}
        toggleInActiveSet={toggleInActiveSet}
        allow_write={true}
        vaultPath={vaultPath}
        onRefreshMods={onRefreshMods}
        renamePlaySet={renamePlaySet}
      />

      {ghostModalSet && ghostStrings.length > 0 && (
        <GhostStringsModal
          setName={ghostModalSet}
          ghosts={ghostStrings}
          onClose={() => {
            setGhostModalSet(null);
            setGhostStrings([]);
          }}
          onIgnore={(mod: string) => {
            if (ignoreMissingString) ignoreMissingString(ghostModalSet, mod);
            setGhostStrings((prev) => prev.filter((s) => s !== mod));
            if (ghostStrings.length <= 1) setGhostModalSet(null);
          }}
          onPurge={(mod: string) => {
            if (purgeMissingString) purgeMissingString(ghostModalSet, mod);
            setGhostStrings((prev) => prev.filter((s) => s !== mod));
            if (ghostStrings.length <= 1) setGhostModalSet(null);
          }}
          onSearch={(url: string) => {
            if (onSearchNetwork) onSearchNetwork(url);
            else window.open(url, "_blank");
          }}
        />
      )}

      {(() => {
        const filteredArtifacts =
          selectedUplinkBlueprint?.artifacts?.filter((m: any) => {
            const rawName = m.name || m;
            const displayName =
              typeof rawName === "string"
                ? rawName.split("/").pop()?.replace(/\.[^/.]+$/, "") || rawName
                : rawName;
            return displayName.toLowerCase().includes(uplinkArtifactSearch.toLowerCase());
          }) || [];

        return (
          <SidePanel
            isOpen={!!selectedUplinkBlueprint}
            onClose={() => {
              setSelectedUplinkBlueprint(null);
              setUplinkArtifactSearch("");
              setUplinkArtifactsLimit(100);
            }}
            title={selectedUplinkBlueprint?.name || t("blueprint_inspector", "Blueprint Mods")}
            subtitle={selectedUplinkBlueprint?.code || t("sidebar_uplink", "Uplink Code")}
            icon={t("icon_extension", "extension")}
            iconColorClass="text-[var(--accent)]"
            widthClass="w-[90vw] md:w-[760px]"
          >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
              <SidePanelHeroCard
                icon={t("icon_extension", "extension")}
                overline={selectedUplinkBlueprint?.code || t("sidebar_uplink", "Uplink Code")}
                title={
                  selectedUplinkBlueprint?.name || t("blueprint_inspector", "Blueprint Mods")
                }
                description={t("artifacts_linked", "{Mods} Linked")}
                badge={`${selectedUplinkBlueprint?.artifacts?.length || 0} ${t("term_mods", "Items")}`}
                badgeIcon={t("icon_extension", "extension")}
                variant="accent"
              >
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <StatBox
                    label={t("artifacts_linked", "{Mods} Linked")}
                    value={selectedUplinkBlueprint?.artifacts?.length || 0}
                    icon={t("icon_extension", "extension")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("sidebar_uplink", "Uplink Code")}
                    value={selectedUplinkBlueprint?.code || "—"}
                    icon={t("icon_qr_code_2", "qr_code_2")}
                    iconColorClass="text-[var(--success)]"
                  />
                </div>
              </SidePanelHeroCard>

              <ActionPill
                searchQuery={uplinkArtifactSearch}
                setSearchQuery={setUplinkArtifactSearch}
                searchPlaceholder={t("playsets_search_ph", "Search artifacts...")}
                className="shrink-0 w-full"
              />

              <UniversalGroup
                title={`${t("artifacts_linked", "{Mods} Linked")} (${filteredArtifacts.length})`}
                icon={t("icon_extension", "extension")}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                  {filteredArtifacts.slice(0, uplinkArtifactsLimit).map((m: any, idx: number) => {
                    const rawName = String(m?.name || m || "");
                    const filePart = rawName.split(/[\\/]/).pop() || rawName;
                    const displayName = formatDisplayName(
                      filePart.replace(/\.[^/.]+$/, "") || rawName,
                      undefined,
                      activeGameSchema
                    );
                    const isScript = /\.ts4script$/i.test(rawName);
                    const matchedMod =
                      optimizedModList.map.get(rawName) ||
                      optimizedModList.fallbackArr.find(
                        (fm: any) =>
                          fm._mBase?.toLowerCase() ===
                          filePart.replace(extRegex, "").toLowerCase()
                      );
                    const modIcon = matchedMod
                      ? getModIcon(matchedMod, activeGameSchema, t)
                      : isScript
                        ? t("icon_code", "code")
                        : t("icon_extension", "extension");
                    const authorName =
                      (m?.author && m.author !== "Unknown" ? m.author : null) ||
                      (matchedMod?.author && matchedMod.author !== "Unknown"
                        ? matchedMod.author
                        : null) ||
                      t("unknown", "Unknown");
                    const seqNum =
                      typeof m?.load_order_index === "number"
                        ? m.load_order_index + 1
                        : idx + 1;
                    const rawPriority =
                      typeof m === "object" && m?.priority_tier
                        ? String(m.priority_tier)
                        : rawName.includes("/") || rawName.includes("\\")
                          ? rawName.split(/[\\/]/)[0]
                          : "";
                    const isRealPriorityTier = /^!sanctuary/i.test(rawPriority);
                    const hasRules = Array.isArray(m?.load_rules) && m.load_rules.length > 0;

                    return (
                      <div
                        key={idx}
                        className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex flex-col justify-between gap-3 group/mod"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[20px]">
                              {modIcon}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                              {displayName}
                              <HoverTooltip title={displayName} />
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-85 truncate">
                              <span className="truncate">
                                {t("by_author", "BY")} {authorName}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[rgba(var(--text-rgb),0.06)]">
                          <span className={`${VAULT_CHIP_CLASS} font-mono text-[var(--accent)]`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_tag", "tag")}
                            </span>
                            <span>{String(seqNum).padStart(3, "0")}</span>
                          </span>
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {isScript
                                ? t("icon_code", "code")
                                : t("icon_extension", "extension")}
                            </span>
                            <span>
                              {isScript
                                ? t("type_script", "Script")
                                : t("type_package", "Package")}
                            </span>
                          </span>
                          {isRealPriorityTier && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_low_priority", "low_priority")}
                              </span>
                              <span>{rawPriority}</span>
                            </span>
                          )}
                          {hasRules && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                {t("icon_tune", "tune")}
                              </span>
                              <span>
                                {m.load_rules.length} {t("lo_rule_badge", "Rule")}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredArtifacts.length > uplinkArtifactsLimit && (
                    <div className="col-span-full w-full flex justify-center mt-2">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_expand_more", "expand_more")}
                        label={`${t("load_more", "Load More")} (${
                          filteredArtifacts.length - uplinkArtifactsLimit
                        })`}
                        onClick={() => setUplinkArtifactsLimit((prev) => prev + 100)}
                      />
                    </div>
                  )}
                </div>
              </UniversalGroup>
            </div>
          </SidePanel>
        );
      })()}
    </div>
  );
}
