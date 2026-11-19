import { useState, useMemo, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { supabase } from "../../supabase";
import { isDesktop } from "../../utils/envUtils";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  CustomDropdown,
  CustomTierDropdown,
  HoverTooltip,
  ModSearchDropdown,
  openModDossier,
  isScriptExtension,
  toHighlanderSlotSlug,
  formatHighlanderSlotLabel,
  resolveModHighlanderSlot,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { StaticPollingGuideSidePanel } from "../../side-panels/StaticPollingGuideSidePanel";
import { ArtifactReleaseChannelsAndSigningCard } from "./ArtifactReleaseChannelsAndSigningCard";
import type { MasonReleaseChannel, PatchCompatibilityEntry } from "../../utils/blueprintLockfile";

function getStudioModStatusMeta(status: any, t: (k: string, f: string) => string) {
  const s = String(status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();
  if (!s || s === "stable" || s === "verified" || s === "approved") return null;
  if (s === "corrupted" || s === "broken") {
    return {
      label: t("status_corrupted", "Corrupted"),
      icon: t("icon_error", "error"),
      iconColor: "text-[var(--danger)]",
    };
  }
  if (s === "rejected") {
    return {
      label: t("rejected", "Rejected"),
      icon: t("icon_block", "block"),
      iconColor: "text-[var(--danger)]",
    };
  }
  if (s === "unstable") {
    return {
      label: t("label_unstable", "Unstable"),
      icon: t("icon_warning", "warning"),
      iconColor: "text-[var(--warning)]",
    };
  }
  if (s === "under review" || s === "pending") {
    return {
      label: s === "pending" ? t("pending", "Pending") : t("status_dd_review", "Under Review"),
      icon: t("icon_schedule", "schedule"),
      iconColor: "text-[var(--accent)]",
    };
  }
  if (s === "unverified" || s === "unknown") {
    return {
      label: t("unverified", "Unverified"),
      icon: t("icon_help", "help"),
      iconColor: "text-[var(--subtext)]",
    };
  }
  return null;
}

function StudioModMiniCard({
  item,
  fallbackName,
  onInspect,
  onRemove,
  removeTooltip,
  leadingBadge,
}: {
  item: any;
  fallbackName: string;
  onInspect: () => void;
  onRemove?: () => void;
  removeTooltip?: string;
  leadingBadge?: ReactNode;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const rawName = String(item?.name || fallbackName || "").trim();
  const joinedAuthor = Array.isArray(item?.masons)
    ? item.masons[0]?.name
    : item?.masons?.name;
  const author = String(joinedAuthor || item?.master_author || item?.author || "").trim();
  const cleanAuthor = author && !author.toLowerCase().includes("unknown") ? author : "";
  const category = String(item?.category_override || "").trim();
  const cleanCategory = category && category.toLowerCase() !== "unknown" ? category : "";
  const ext = item?.file_extension
    ? String(item.file_extension).replace(/^\./, "").toLowerCase()
    : "";
  const isScript = isScriptExtension(
    rawName || (ext ? `.${ext}` : ""),
    activeGameSchema
  );
  const version = String(item?.latest_version || "").trim();
  const cleanVersion =
    version && !/^(v?\.?local|unknown)$/i.test(version)
      ? version.startsWith("v")
        ? version
        : `v${version}`
      : "";
  const statusMeta = getStudioModStatusMeta(item?.status, t);
  const subtitleText = [
    cleanAuthor ? `${t("by_prefix", "By")} ${cleanAuthor}` : "",
    cleanVersion,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="px-3 py-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] flex items-center justify-between gap-2.5 transition-all">
      <button
        type="button"
        onClick={onInspect}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group/modcard"
      >
        <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
            {isScript ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-xs font-bold text-[var(--text)] group-hover/modcard:text-[var(--accent)] leading-snug break-words line-clamp-2 transition-colors">
            {rawName}
          </span>
          {subtitleText && (
            <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 truncate">
              {subtitleText}
            </span>
          )}
        </div>
      </button>

      {(leadingBadge || statusMeta || cleanCategory || onRemove) && (
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {leadingBadge}
          {statusMeta && (
            <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[10px]`}>
              <span className={`material-symbols-outlined !text-[11px] ${statusMeta.iconColor}`}>
                {statusMeta.icon}
              </span>
              <span>{statusMeta.label}</span>
            </span>
          )}
          {cleanCategory && (
            <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[10px]`}>
              <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                {t("icon_deployed_code", "deployed_code")}
              </span>
              <span>{cleanCategory}</span>
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_close", "close")}
              </span>
              {removeTooltip && <HoverTooltip title={removeTooltip} variant="danger" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ArtifactRulesTab({
  mode,
  mod,
  isCloudMod,
  isVerifiedMason,
  isCommitting,
  dlcRegistry,
  activeDlcIds,
  onToggleDlc,
  onSetDlcList,
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
  onChangeHighlanderSlot,
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
  onSetDlcList?: (dlcIds: string[]) => void;
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
  onChangeHighlanderSlot?: (slot: {
    groupId: string | null;
    slug: string;
    name: string;
  }) => void;
  onChangeStaticManifestUrl: (url: string) => void;
  onExportRelease?: () => void;
  onSyncToNetwork?: () => void;
  onSaveCloudChanges?: () => void;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const userRole = useStore((s) => s.userRole);
  const osRole = useStore((s) => s.osRole);
  const canManageSpokeSlots =
    mode === "registry" &&
    (["architect", "senior_architect", "oversight", "wayfinder", "admin"].includes(
      String(userRole || "").toLowerCase()
    ) ||
      ["core_dev", "admin", "keeper"].includes(String(osRole || "").toLowerCase()));

  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [showPushToken, setShowPushToken] = useState<boolean>(false);
  const [isPushingManifest, setIsPushingManifest] = useState<boolean>(false);
  const [spokeHighlanderSlots, setSpokeHighlanderSlots] = useState<any[]>([]);
  const [newSlotTagInput, setNewSlotTagInput] = useState<string>("");
  const [isCreatingSlotTag, setIsCreatingSlotTag] = useState<boolean>(false);
  const [isDeletingSlotTag, setIsDeletingSlotTag] = useState<boolean>(false);
  const [slotSiblingMods, setSlotSiblingMods] = useState<any[]>([]);
  const [isLoadingSlotSiblings, setIsLoadingSlotSiblings] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("flavor_groups")
      .select("id, name, slug, description")
      .order("name")
      .then(async ({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          setSpokeHighlanderSlots(data);
        } else {
          const fb = await supabase.from("flavor_groups").select("id, name").order("name");
          if (active && fb.data) setSpokeHighlanderSlots(fb.data);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const currentHighlanderState = useMemo(() => {
    const gid = String(mod?.highlander_group_id || mod?.highlanderGroupId || "").trim();
    if (gid) {
      const matched = spokeHighlanderSlots.find((fg: any) => String(fg.id) === gid);
      const slug = toHighlanderSlotSlug(
        matched?.slug || mod?.highlander_slot_slug || mod?.highlanderSlotKey || matched?.name || gid
      );
      const name =
        matched?.name ||
        mod?.highlander_slot_name ||
        mod?.highlanderSlotName ||
        formatHighlanderSlotLabel(slug);
      return { groupId: gid, slug, name, isCustom: false };
    }
    const rawCustomSlug = String(
      mod?.highlander_slot_slug || mod?.highlanderSlotKey || ""
    ).trim();
    const rawCustomName = String(
      mod?.highlander_slot_name || mod?.highlanderSlotName || ""
    ).trim();
    const resolved = resolveModHighlanderSlot(mod);
    const effSlug = toHighlanderSlotSlug(rawCustomSlug || resolved?.key || rawCustomName);
    if (effSlug) {
      const matchedBySlug = spokeHighlanderSlots.find(
        (fg: any) => toHighlanderSlotSlug(fg.slug || fg.name) === effSlug
      );
      if (matchedBySlug) {
        return {
          groupId: String(matchedBySlug.id),
          slug: effSlug,
          name: matchedBySlug.name || rawCustomName || formatHighlanderSlotLabel(effSlug),
          isCustom: false,
        };
      }
      return {
        groupId: null,
        slug: effSlug,
        name: rawCustomName || resolved?.name || formatHighlanderSlotLabel(effSlug),
        isCustom: true,
      };
    }
    return { groupId: null, slug: "", name: "", isCustom: false };
  }, [mod, spokeHighlanderSlots]);

  useEffect(() => {
    const gid = currentHighlanderState.groupId;
    if (!gid) {
      setSlotSiblingMods([]);
      setIsLoadingSlotSiblings(false);
      return;
    }
    let active = true;
    setIsLoadingSlotSiblings(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("mods")
          .select("id, name, master_author, category_override, file_extension, latest_version, status, compliance_tier, masons(name)")
          .eq("highlander_group_id", gid)
          .order("name");
        if (!active) return;
        const rows = (data || []).filter(
          (m: any) =>
            Number(m?.compliance_tier || 0) === 0 &&
            (!mod?.id || String(m.id) !== String(mod.id))
        );
        setSlotSiblingMods(rows);
      } catch {
        if (active) setSlotSiblingMods([]);
      } finally {
        if (active) setIsLoadingSlotSiblings(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentHighlanderState.groupId, mod?.id]);

  const handleCreateOrAssignSlotTag = async () => {
    const trimmed = newSlotTagInput.trim();
    const slug = toHighlanderSlotSlug(trimmed);
    if (!trimmed || !slug || isCreatingSlotTag) return;

    const existing = spokeHighlanderSlots.find(
      (fg: any) =>
        toHighlanderSlotSlug(fg.slug || fg.name) === slug ||
        String(fg.name || "").trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      onChangeHighlanderSlot?.({
        groupId: String(existing.id),
        slug: toHighlanderSlotSlug(existing.slug || existing.name) || slug,
        name: existing.name || trimmed,
      });
      setNewSlotTagInput("");
      return;
    }

    if (canManageSpokeSlots) {
      setIsCreatingSlotTag(true);
      try {
        const { data, error } = await supabase
          .from("flavor_groups")
          .insert([{ name: trimmed, slug }])
          .select("id, name, slug, description")
          .single();
        if (error) {
          useStore.getState().pushStatus(error.message, "error");
          return;
        }
        if (data) {
          setSpokeHighlanderSlots((prev) =>
            [...prev, data].sort((a, b) =>
              String(a?.name || "").localeCompare(String(b?.name || ""))
            )
          );
          onChangeHighlanderSlot?.({
            groupId: String(data.id),
            slug: toHighlanderSlotSlug(data.slug || data.name) || slug,
            name: data.name || trimmed,
          });
          setNewSlotTagInput("");
        }
      } finally {
        setIsCreatingSlotTag(false);
      }
      return;
    }

    if (!isCloudMod) {
      onChangeHighlanderSlot?.({
        groupId: null,
        slug,
        name: trimmed,
      });
      setNewSlotTagInput("");
    }
  };

  const handleDeleteUnusedSlotTag = async () => {
    const gid = currentHighlanderState.groupId;
    if (!canManageSpokeSlots || !gid || slotSiblingMods.length > 0 || isDeletingSlotTag) {
      return;
    }
    setIsDeletingSlotTag(true);
    try {
      onChangeHighlanderSlot?.({ groupId: null, slug: "", name: "" });
      const { error } = await supabase.from("flavor_groups").delete().eq("id", gid);
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      setSpokeHighlanderSlots((prev) => prev.filter((fg: any) => String(fg.id) !== String(gid)));
      useStore.getState().pushStatus(t("alert_deleted", "Deleted"), "success");
    } finally {
      setIsDeletingSlotTag(false);
    }
  };

  const pushScopeKey = useMemo(() => {
    const modKey = String(mod?.hash || mod?.id || "").trim();
    return modKey ? `mod:${modKey}` : "global";
  }, [mod?.hash, mod?.id]);

  const [pushConfig, setPushConfig] = useState<{
    provider: string;
    target_mode: string;
    token: string;
    repo_or_project: string;
    branch: string;
    remote_path: string;
    custom_endpoint: string;
    local_folder_path: string;
    s3_bucket: string;
    s3_region: string;
    s3_access_key_id: string;
    public_base_url: string;
  }>(() => {
    try {
      const globalPush = JSON.parse(
        localStorage.getItem("sanctuary_edge_autopush_global") || "{}"
      );
      const modPush = mod?.edge_push_config || {};
      return {
        provider: modPush.provider || globalPush.provider || "manual",
        target_mode: modPush.target_mode || globalPush.target_mode || "manifest",
        token: "",
        repo_or_project: modPush.repo_or_project || globalPush.repo_or_project || "",
        branch: modPush.branch || globalPush.branch || "main",
        remote_path: modPush.remote_path || "",
        custom_endpoint: modPush.custom_endpoint || globalPush.custom_endpoint || "",
        local_folder_path: modPush.local_folder_path || globalPush.local_folder_path || "",
        s3_bucket: modPush.s3_bucket || globalPush.s3_bucket || "",
        s3_region: modPush.s3_region || globalPush.s3_region || "auto",
        s3_access_key_id: modPush.s3_access_key_id || globalPush.s3_access_key_id || "",
        public_base_url: modPush.public_base_url || globalPush.public_base_url || "",
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
        s3_bucket: "",
        s3_region: "auto",
        s3_access_key_id: "",
        public_base_url: "",
      };
    }
  });

  const [releaseChannel, setReleaseChannel] = useState<MasonReleaseChannel>(
    () => (mod?.edge_channel as MasonReleaseChannel) || "stable"
  );
  const [patchMatrix, setPatchMatrix] = useState<PatchCompatibilityEntry[]>(() =>
    Array.isArray(mod?.patch_compatibility_matrix) ? mod.patch_compatibility_matrix : []
  );

  const persistReleaseChannelMeta = (
    nextChannel: MasonReleaseChannel,
    nextMatrix: PatchCompatibilityEntry[]
  ) => {
    try {
      const modKey = mod?.hash || mod?.id;
      if (!modKey) return;
      const savedAll = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
      savedAll[modKey] = {
        ...(savedAll[modKey] || {}),
        edge_channel: nextChannel,
        patch_compatibility_matrix: nextMatrix,
      };
      localStorage.setItem("sanctuary_sandbox_configs", JSON.stringify(savedAll));
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    const hydrateAndMigrateToken = async () => {
      let legacyToken = "";
      let legacyModToken = "";
      let legacyGlobalToken = "";
      try {
        const rawGlobal = JSON.parse(
          localStorage.getItem("sanctuary_edge_autopush_global") || "{}"
        );
        if (typeof rawGlobal.token === "string" && rawGlobal.token.trim()) {
          legacyGlobalToken = rawGlobal.token.trim();
          rawGlobal.token = "";
          localStorage.setItem(
            "sanctuary_edge_autopush_global",
            JSON.stringify(rawGlobal)
          );
        }
        const savedAll = JSON.parse(
          localStorage.getItem("sanctuary_sandbox_configs") || "{}"
        );
        const modKey = String(mod?.hash || mod?.id || "").trim();
        let mutatedSavedAll = false;
        for (const [k, entry] of Object.entries(savedAll as Record<string, any>)) {
          const tok = entry?.edge_push_config?.token;
          if (typeof tok === "string" && tok.trim()) {
            if (k === modKey) legacyModToken = tok.trim();
            entry.edge_push_config = { ...(entry.edge_push_config || {}), token: "" };
            mutatedSavedAll = true;
          }
        }
        if (mutatedSavedAll) {
          localStorage.setItem("sanctuary_sandbox_configs", JSON.stringify(savedAll));
        }
        if (typeof mod?.edge_push_config?.token === "string" && mod.edge_push_config.token.trim()) {
          legacyModToken = legacyModToken || mod.edge_push_config.token.trim();
        }
        legacyToken = legacyModToken || legacyGlobalToken;
      } catch {}

      if (legacyToken) {
        if (isDesktop()) {
          if (legacyModToken && pushScopeKey !== "global") {
            await invoke("set_edge_push_token", {
              scopeKey: pushScopeKey,
              token: legacyModToken,
            }).catch(() => {});
          }
          if (legacyGlobalToken) {
            await invoke("set_edge_push_token", {
              scopeKey: "global",
              token: legacyGlobalToken,
            }).catch(() => {});
          }
        } else {
          try {
            sessionStorage.setItem(`sanctuary_edge_push_token_${pushScopeKey}`, legacyToken);
          } catch {}
        }
        if (!cancelled) {
          setPushConfig((prev) => ({ ...prev, token: legacyToken }));
        }
        return;
      }

      let sealed = "";
      if (isDesktop()) {
        sealed = await invoke<string>("get_edge_push_token", {
          scopeKey: pushScopeKey,
        }).catch(() => "");
        if (!sealed && pushScopeKey !== "global") {
          sealed = await invoke<string>("get_edge_push_token", {
            scopeKey: "global",
          }).catch(() => "");
        }
      } else {
        try {
          sealed =
            sessionStorage.getItem(`sanctuary_edge_push_token_${pushScopeKey}`) ||
            sessionStorage.getItem("sanctuary_edge_push_token_global") ||
            "";
        } catch {}
      }
      if (!cancelled) {
        setPushConfig((prev) => ({ ...prev, token: sealed || "" }));
      }
    };
    void hydrateAndMigrateToken();
    return () => {
      cancelled = true;
    };
  }, [pushScopeKey, mod?.edge_push_config]);

  const updatePushConfig = (patch: Partial<typeof pushConfig>) => {
    const next = { ...pushConfig, ...patch };
    setPushConfig(next);
    if (patch.token !== undefined) {
      if (isDesktop()) {
        void invoke("set_edge_push_token", {
          scopeKey: pushScopeKey,
          token: String(next.token || ""),
        }).catch(() => {});
        void invoke("set_edge_push_token", {
          scopeKey: "global",
          token: String(next.token || ""),
        }).catch(() => {});
      } else {
        try {
          sessionStorage.setItem(
            `sanctuary_edge_push_token_${pushScopeKey}`,
            String(next.token || "")
          );
          sessionStorage.setItem(
            "sanctuary_edge_push_token_global",
            String(next.token || "")
          );
        } catch {}
      }
    }
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
          token: "",
          repo_or_project: next.repo_or_project,
          branch: next.branch,
          custom_endpoint: next.custom_endpoint,
          local_folder_path: next.local_folder_path,
          s3_bucket: next.s3_bucket,
          s3_region: next.s3_region,
          s3_access_key_id: next.s3_access_key_id,
          public_base_url: next.public_base_url,
        })
      );
      const modKey = mod?.hash || mod?.id;
      if (modKey) {
        const savedAll = JSON.parse(
          localStorage.getItem("sanctuary_sandbox_configs") || "{}"
        );
        savedAll[modKey] = {
          ...(savedAll[modKey] || {}),
          edge_push_config: { ...next, token: "" },
        };
        localStorage.setItem("sanctuary_sandbox_configs", JSON.stringify(savedAll));
      }
    } catch { }
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
    } catch { }
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
            /\/(\.sanctuary\.)?manifest\.json$/i,
            `/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`
          )
          : `https://example.com/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`);

      const resolvedPrimaryHash =
        mod?.hash || mod?.mod_versions?.[0]?.dna_hash || "";

      const prevHashes = Array.from(
        new Set(
          [
            ...(Array.isArray(mod?.local_versions)
              ? mod.local_versions
                .map((v: any) => v.dna_hash)
                .filter((h: string) => h && h !== resolvedPrimaryHash)
              : []),
            ...(Array.isArray(mod?.mod_versions)
              ? mod.mod_versions
                .map((v: any) => v.dna_hash)
                .filter((h: string) => h && h !== resolvedPrimaryHash)
              : []),
            ...(Array.isArray(mod?._olderVersions)
              ? mod._olderVersions.map((ov: any) => ov.hash).filter(Boolean)
              : []),
          ].filter(Boolean)
        )
      );

      const fallbackExt =
        activeGameSchema?.extensions?.packages?.[0] ||
        activeGameSchema?.extensions?.supported?.[0] ||
        ".bin";

      const manifestPayload = {
        schema_version: "1.0",
        manifest_url: customManifestUrl || undefined,
        artifact: {
          id: mod?.id || safeNameSlug || "unknown",
          name: ((mod?.name || "Unknown Mod").split(/[\\/]/).pop() || "Unknown Mod").replace(
            /\.[^/.]+$/,
            ""
          ),
          author: mod?.master_author || "Unknown Author",
          version: versionStr,
          game_version: mod?.compatible_versions?.[0] || "",
          compatible_versions: Array.isArray(mod?.compatible_versions)
            ? mod.compatible_versions
            : [],
          release_date: new Date().toISOString(),
          game_id:
            useStore.getState().activeGameSchema?.id ||
            useStore.getState().activeWorkspaceId ||
            "universal",
          channel: releaseChannel,
          patch_compatibility_matrix: patchMatrix,
        },
        payload: {
          download_url: customDownloadUrl,
          sha256: resolvedPrimaryHash,
          archive_type: "zip",
        },
        current_hashes: resolvedPrimaryHash ? [resolvedPrimaryHash] : [],
        modules: resolvedPrimaryHash
          ? [
            {
              name:
                (mod?.name || `artifact${fallbackExt}`).split(/[\\/]/).pop() ||
                `artifact${fallbackExt}`,
              sha256: resolvedPrimaryHash,
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
          ...(currentHighlanderState.slug
            ? {
              highlander_group: {
                slug: currentHighlanderState.slug,
                name:
                  currentHighlanderState.name ||
                  formatHighlanderSlotLabel(currentHighlanderState.slug),
              },
            }
            : {}),
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
  const [dlcAssignedFilter, setDlcAssignedFilter] = useState<string>("");
  const [depsSearchFilter, setDepsSearchFilter] = useState<string>("");
  const [conflictsSearchFilter, setConflictsSearchFilter] = useState<string>("");

  const effectiveDlcRegistry = useMemo(() => {
    return Array.isArray(dlcRegistry) ? dlcRegistry : [];
  }, [dlcRegistry]);

  const dlcCategories = useMemo(() => {
    const types = Array.from(
      new Set(
        effectiveDlcRegistry
          .map((pack: any) => String(pack?.type || "").trim())
          .filter(Boolean)
      )
    );
    return [
      { id: "ALL", label: t("dlc_tab_all", "All Packs") },
      ...types.map((tp) => ({ id: tp, label: tp })),
    ];
  }, [effectiveDlcRegistry, t]);

  const dlcOptions = useMemo(
    () =>
      effectiveDlcRegistry.map((pack: any) => ({
        id: pack.id,
        label: pack.name || pack.id,
        badge: pack.id,
        category: pack.type,
        searchText: `${pack.name || ""} ${pack.id || ""} ${pack.type || ""}`,
      })),
    [effectiveDlcRegistry]
  );

  const handleDlcSelectionChange = (nextIds: string[]) => {
    const cleaned = Array.isArray(nextIds) ? nextIds.map(String) : [];
    if (onSetDlcList) {
      onSetDlcList(cleaned);
      return;
    }
    if (cleaned.length === 0) {
      onClearAllDlc();
      return;
    }
    const added = cleaned.find((id) => !activeDlcIds.includes(id));
    if (added) {
      onToggleDlc(added);
      return;
    }
    const removed = activeDlcIds.find((id) => !cleaned.includes(id));
    if (removed) {
      onToggleDlc(removed);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-5 pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* CARD 1: REQUIRED ADD-ONS / DLC */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                {t("icon_inventory_2", "inventory_2")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("studio_rules_dlc_title_agnostic", "Required Add-Ons / DLC")} ({activeDlcIds.length})
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
            <CustomDropdown
              multiSelect={true}
              searchable={true}
              disableTint={true}
              value={activeDlcIds}
              displayLabel={
                activeDlcIds.length > 0
                  ? `${activeDlcIds.length} ${t("studio_dlc_selected_count", "Packs Selected")}`
                  : undefined
              }
              placeholder={t("studio_dlc_select_ph_agnostic", "Select Required Add-Ons / DLC...")}
              searchPlaceholder={t("search_ph", "Search {mods}...")}
              categoryTabs={dlcCategories}
              options={dlcOptions}
              onChange={handleDlcSelectionChange}
            />
          </div>

          {activeDlcIds.length === 0 ? (
            <div className="min-h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("dlc_base_game_only", "Base Game Compatible — No Add-Ons / DLC Required")}
            </div>
          ) : (
            <div className="min-h-[116px] max-h-[240px] overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 gap-2 content-start">
              {activeDlcIds
                .filter((id) => {
                  if (!dlcAssignedFilter.trim()) return true;
                  const pack = effectiveDlcRegistry.find((d: any) => d.id === id);
                  const q = dlcAssignedFilter.toLowerCase();
                  return id.toLowerCase().includes(q) || (pack?.name || "").toLowerCase().includes(q);
                })
                .map((id) => {
                  const pack = effectiveDlcRegistry.find((d: any) => d.id === id);
                  return (
                    <div
                      key={id}
                      className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                            {t("icon_extension", "extension")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-xs font-bold text-[var(--text)] leading-snug break-words line-clamp-2">
                            {pack?.name || id}
                          </span>
                          {pack?.type && (
                            <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 truncate">
                              {pack.type}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[10px] font-mono !text-[var(--accent)]`}>
                          {id}
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggleDlc(id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                        >
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                          <HoverTooltip title={t("lineage_btn_delete", "Remove")} variant="danger" />
                        </button>
                      </div>
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
              onClear={() => { }}
              placeholder={t("studio_rules_deps_search_ph", "Search catalog to add a required {mod}...")}
            />
          </div>

          {dependencies.length === 0 ? (
            <div className="min-h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_deps_empty", "No required {mods} assigned")}
            </div>
          ) : (
            <div className="min-h-[116px] max-h-[240px] overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 gap-2 content-start">
              {dependencies
                .filter((dep) => {
                  if (!depsSearchFilter.trim()) return true;
                  return (dep.mod?.name || dep.dependency_name || "")
                    .toLowerCase()
                    .includes(depsSearchFilter.toLowerCase());
                })
                .map((dep) => {
                  const target =
                    dep.mod ||
                    (dep.dependency_mod_id || dep.dependency_name
                      ? {
                        id: dep.dependency_mod_id,
                        name: dep.dependency_name,
                      }
                      : null);
                  return (
                    <StudioModMiniCard
                      key={dep.id}
                      item={dep.mod || target}
                      fallbackName={dep.dependency_name || ""}
                      onInspect={() => {
                        if (target) openModDossier({ ...target, isNexusView: true });
                      }}
                      onRemove={() => onRemoveDependency(dep)}
                      removeTooltip={t("lineage_btn_delete", "Remove")}
                    />
                  );
                })}
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
                onClear={() => { }}
                placeholder={t("studio_rules_conflicts_search_ph", "Search catalog to flag a conflicting {mod}...")}
              />
            </div>
          </div>

          {conflicts.length === 0 ? (
            <div className="min-h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_conflicts_empty", "No conflicting {mods} flagged")}
            </div>
          ) : (
            <div className="min-h-[116px] max-h-[240px] overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 gap-2 content-start">
              {conflicts
                .filter((conf) => {
                  if (!conflictsSearchFilter.trim()) return true;
                  return (conf.enemyMod?.name || "")
                    .toLowerCase()
                    .includes(conflictsSearchFilter.toLowerCase());
                })
                .map((conf) => {
                  const sev = conf.severity_rank || 4;
                  const target =
                    conf.enemyMod ||
                    (conf.enemy_mod_id ? { id: conf.enemy_mod_id } : null);
                  return (
                    <StudioModMiniCard
                      key={conf.id}
                      item={conf.enemyMod || target}
                      fallbackName={t("conflict_mod_fallback", "Conflicting {Mod}")}
                      onInspect={() => {
                        if (target) openModDossier({ ...target, isNexusView: true });
                      }}
                      onRemove={() => onRemoveConflict(conf)}
                      removeTooltip={t("lineage_btn_delete", "Remove")}
                      leadingBadge={
                        <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[10px] font-black`}>
                          <span
                            className={`material-symbols-outlined !text-[11px] ${
                              sev === 4 ? "text-[var(--danger)]" : "text-[var(--warning)]"
                            }`}
                          >
                            {sev === 4
                              ? t("icon_crisis_alert", "crisis_alert")
                              : t("icon_tune", "tune")}
                          </span>
                          <span>{sev === 4 ? "S4" : "S3"}</span>
                        </span>
                      }
                    />
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
                className="h-11 glass-surface rounded-xl px-4 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={onAddCollectionQuick}
                className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                  {t("icon_add", "add")}
                </span>
                {t("ql_add", "Add")}
              </button>
            </div>
          </div>

          {(isCloudMod ? assignedCloudCollections.length : localCollectionNames.length) === 0 ? (
            <div className="min-h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_collections_empty", "Not added to any collections")}
            </div>
          ) : (
            <div className="min-h-[116px] max-h-[240px] overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 gap-2 content-start">
              {(isCloudMod
                ? assignedCloudCollections.map((col) => ({
                    key: col.id,
                    name: col.name,
                    creator:
                      (Array.isArray(col?.masons) ? col.masons[0]?.name : col?.masons?.name) ||
                      col?.creator_name ||
                      "",
                    url: col?.url || "",
                    onRemove: () => onToggleCloudCollection(col.id),
                  }))
                : localCollectionNames.map((name) => ({
                    key: name,
                    name,
                    creator: "",
                    url: "",
                    onRemove: () => onRemoveLocalCollection(name),
                  }))
              ).map((entry) => (
                <div
                  key={entry.key}
                  className="px-3 py-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_collections_bookmark", "collections_bookmark")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-xs font-bold text-[var(--text)] leading-snug break-words line-clamp-2">
                        {entry.name}
                      </span>
                      {entry.creator && (
                        <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 truncate">
                          {t("by_prefix", "By")} {entry.creator}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {entry.url && (
                      <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[10px]`}>
                        <span className="material-symbols-outlined !text-[11px] text-[var(--subtext)]">
                          {t("icon_public", "public")}
                        </span>
                        <span>{t("source", "Source")}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={entry.onRemove}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                    >
                      <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                      <HoverTooltip title={t("lineage_btn_delete", "Remove")} variant="danger" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CARD 5: HIGHLANDER EXCLUSIVE SLOT */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                {t("icon_swap_horiz", "swap_horiz")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("highlander_exclusive_slot", "Exclusive Slot")}
                {currentHighlanderState.groupId ? ` (${slotSiblingMods.length + 1})` : ""}
              </h4>
            </div>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {currentHighlanderState.slug && (
                <span className={`${VAULT_CHIP_CLASS} !text-[var(--accent)] font-mono`}>
                  {currentHighlanderState.slug}
                </span>
              )}
              {(currentHighlanderState.groupId || currentHighlanderState.slug) && (
                <button
                  type="button"
                  onClick={() => onChangeHighlanderSlot?.({ groupId: null, slug: "", name: "" })}
                  className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                >
                  {t("clear", "Clear")}
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] font-semibold text-[var(--subtext)] leading-relaxed">
            {t(
              "studio_highlander_slot_desc",
              "Enforces the Highlander Rule — only one {mod} in the same Exclusive Slot (e.g. Main Menu Replacements or Global Lighting Presets) can be active at a time, automatically swapping rivals without manual conflict links."
            )}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start relative z-10">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                {t("studio_highlander_spoke_slot_label", "Exclusive Slot Category")}
              </label>
              <CustomDropdown
                disableTint={true}
                searchable={true}
                searchPlaceholder={t("highlander_search_slots_ph", "Search Exclusive Slots...")}
                value={
                  currentHighlanderState.groupId
                    ? currentHighlanderState.groupId
                    : currentHighlanderState.isCustom && currentHighlanderState.slug
                      ? "__custom__"
                      : "__none__"
                }
                options={[
                  {
                    id: "__none__",
                    label: t("highlander_slot_none", "None (Coexists Freely)"),
                  },
                  ...spokeHighlanderSlots.map((fg: any) => ({
                    id: String(fg.id),
                    label: fg.name,
                    badge: fg.slug || toHighlanderSlotSlug(fg.name),
                    searchText: `${fg.name || ""} ${fg.slug || ""} ${fg.description || ""}`,
                  })),
                  ...(currentHighlanderState.isCustom && currentHighlanderState.slug
                    ? [
                      {
                        id: "__custom__",
                        label:
                          currentHighlanderState.name ||
                          formatHighlanderSlotLabel(currentHighlanderState.slug),
                        badge: currentHighlanderState.slug,
                      },
                    ]
                    : []),
                ]}
                onChange={(val: string[]) => {
                  const picked = val[0] || "__none__";
                  if (picked === "__none__") {
                    onChangeHighlanderSlot?.({ groupId: null, slug: "", name: "" });
                  } else if (picked !== "__custom__") {
                    const fg = spokeHighlanderSlots.find(
                      (item: any) => String(item.id) === String(picked)
                    );
                    if (fg) {
                      const slug = toHighlanderSlotSlug(fg.slug || fg.name);
                      onChangeHighlanderSlot?.({
                        groupId: String(fg.id),
                        slug,
                        name: fg.name || formatHighlanderSlotLabel(slug),
                      });
                    }
                  }
                }}
              />
            </div>

            {canManageSpokeSlots || !isCloudMod ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                  {t("highlander_btn_new_slot", "New Exclusive Slot")}
                </label>
                <div className="flex items-center gap-2 w-full">
                  <input
                    value={newSlotTagInput}
                    onChange={(e) => setNewSlotTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreateOrAssignSlotTag();
                      }
                    }}
                    placeholder={t(
                      "studio_highlander_custom_ph",
                      "e.g. Main Menu Replacements"
                    )}
                    className="h-11 glass-surface rounded-xl px-4 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    disabled={isCreatingSlotTag || !toHighlanderSlotSlug(newSlotTagInput)}
                    onClick={() => void handleCreateOrAssignSlotTag()}
                    className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                      {t("icon_add", "add")}
                    </span>
                    {t("ql_add", "Add")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-11 md:mt-[22px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                {currentHighlanderState.slug ? (
                  <>
                    <span className="text-xs font-bold text-[var(--text)] truncate">
                      {currentHighlanderState.name}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--accent)] shrink-0">
                      {currentHighlanderState.slug}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] font-semibold text-[var(--subtext)] truncate">
                    {t(
                      "studio_highlander_inactive_hint",
                      "Can be equipped alongside any other {mod} unless explicitly conflicted"
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {!currentHighlanderState.slug ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t(
                "studio_highlander_inactive_hint",
                "Can be equipped alongside any other {mod} unless explicitly conflicted"
              )}
            </div>
          ) : isLoadingSlotSiblings ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("loading", "Loading...")}
            </div>
          ) : slotSiblingMods.length === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold text-[var(--subtext)]">
                {t(
                  "highlander_no_mods_in_slot",
                  "No {mods} assigned to this Exclusive Slot"
                )}
              </span>
              {canManageSpokeSlots && currentHighlanderState.groupId && (
                <button
                  type="button"
                  disabled={isDeletingSlotTag}
                  onClick={() => void handleDeleteUnusedSlotTag()}
                  className="h-8 px-3 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-wider text-[var(--danger)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_delete", "delete")}
                  </span>
                  {t("highlander_delete_unused_slot", "Delete Unused Slot")}
                </button>
              )}
            </div>
          ) : (
            <div className="min-h-[116px] max-h-[240px] overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
              {slotSiblingMods.map((sib) => (
                <StudioModMiniCard
                  key={sib.id}
                  item={sib}
                  fallbackName={sib.name || ""}
                  onInspect={() => openModDossier({ ...sib, isNexusView: true })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ArtifactReleaseChannelsAndSigningCard
        releaseChannel={releaseChannel}
        onChangeReleaseChannel={(nextCh) => {
          setReleaseChannel(nextCh);
          persistReleaseChannelMeta(nextCh, patchMatrix);
        }}
        patchMatrix={patchMatrix}
        onChangePatchMatrix={(nextM) => {
          setPatchMatrix(nextM);
          persistReleaseChannelMeta(releaseChannel, nextM);
        }}
      />

      {/* Bottom Action Bar: Static Manifest / Export / Sync & Cloud Registry Save */}
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
            {t("edge_manifest_url_label", "Static Polling Manifest URL (.sanctuary.manifest.json / catalog.json)")}
          </label>
          <input
            value={mod.static_manifest_url || ""}
            onChange={(e) => onChangeStaticManifestUrl(e.target.value)}
            placeholder={t(
              "placeholder_static_manifest_url",
              "https://raw.githubusercontent.com/author/mod/main/.sanctuary.manifest.json"
            )}
            className="h-11 glass-surface rounded-xl px-4 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                  id: "s3_r2",
                  label: t(
                    "edge_autopush_prov_s3_r2",
                    "S3 / Cloudflare R2 (SigV4 Auto-Push)"
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
                    label: t("edge_autopush_mode_single", "Single-{Mod} .sanctuary.manifest.json"),
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
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                          : "my_mod/.sanctuary.manifest.json"
                      }
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                        pushConfig.target_mode === "catalog" ? "catalog.json" : ".sanctuary.manifest.json"
                      }
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                          : "manifests/.sanctuary.manifest.json"
                      }
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                        : "https://your-domain.com/upload/.sanctuary.manifest.json"
                    }
                    className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}

              {pushConfig.provider === "s3_r2" && (
                <>
                  {[
                    { k: "s3_bucket" as const, l: t("edge_autopush_s3_bucket", "Bucket Name"), ph: "my-mod-bucket" },
                    { k: "s3_region" as const, l: t("edge_autopush_s3_region", "Region (R2: auto)"), ph: "auto" },
                    { k: "s3_access_key_id" as const, l: t("edge_autopush_s3_key_id", "Access Key ID"), ph: "AKIA..." },
                    { k: "custom_endpoint" as const, l: t("edge_autopush_endpoint_label", "Custom Endpoint / Host URL"), ph: "https://<account>.r2.cloudflarestorage.com" },
                    { k: "public_base_url" as const, l: t("edge_autopush_public_base_url", "Public CDN Base URL"), ph: "https://cdn.example.com" },
                    { k: "remote_path" as const, l: t("edge_autopush_path_label", "Remote File Path"), ph: "my_mod/.sanctuary.manifest.json" },
                  ].map((f) => (
                    <div key={f.k} className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">{f.l}</label>
                      <input
                        value={pushConfig[f.k]}
                        onChange={(e) => updatePushConfig({ [f.k]: e.target.value })}
                        placeholder={f.ph}
                        className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  ))}
                </>
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
                        className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={handleBrowsePushFolder}
                        className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 cursor-pointer shrink-0"
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
                          : "my_mod/.sanctuary.manifest.json"
                      }
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
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
                      className="h-11 glass-surface rounded-xl px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPushToken(!showPushToken)}
                      className="w-11 h-11 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer shrink-0 relative group/btn"
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
                className={`material-symbols-outlined !text-[16px] text-[var(--accent)] ${isPushingManifest ? "animate-spin" : ""
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
          {mode === "sandbox" && isVerifiedMason && onSyncToNetwork && (
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
          {mode === "registry" && (onSaveCloudChanges || onSyncToNetwork) && (
            <button
              type="button"
              disabled={isCommitting || isPushingManifest}
              onClick={onSaveCloudChanges || onSyncToNetwork}
              className="h-11 px-5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_36%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_save", "save")}
              </span>
              {t("hub_save", "Save")}
            </button>
          )}
        </div>
      </div>

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

