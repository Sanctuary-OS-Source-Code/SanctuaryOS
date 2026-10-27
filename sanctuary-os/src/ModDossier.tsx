import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./utils/envUtils";
import { resolvePayloadDependencies } from "./utils/stagingCrypto";
import { useLexicon } from "./LexiconContext";
import { supabase, submitThreatManifestToSpoke } from "./supabase";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import {
  GameVersionMultiSelect,
  deriveHumanReadableVersion,
  CustomDatePicker,
  CustomClassificationDropdown,
  getHighestVersion,
  getLowestVersion,
  getFileLabel,
  getExtensionRegex,
  getModIcon,
  HoverTooltip,
  cleanSearchName,
  SidePanel,
  SidePanelHeroCard,
  SidePanelTitleInput,
  SidePanelPillToggle,
  UniversalGroup,
  StatBox,
  ActionButton,
  getModFallbackUrl,
  handleOpenUrl,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "./shared";
import {
  LabVerificationGate,
  LabVerificationBadge,
  checkDnaHashVerification,
} from "./components/LabVerificationGate";

export default function ModDossier({
  mod: rawMod,
  modList,
  activePlaySet,
  onToggleInActiveSet,
  onShowYeetAlert,
  onClose,
  metaInputs,
  setMetaInputs,
  onSaveMetadata,
  onResetMetadata,
  onOpenMasonProfile,
  editMode,
  setEditMode,
  onSendToLab,
  onSecureShred,
  isCorrecting,
  setIsCorrecting,
  onSyncToNetwork,
}: any) {
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const requireScoutLabTest =
    activeGameSchema?.lab_verification?.require_for_scout_approval !== false;
  const session = useStore((state) => state.session);
  const [isDossierOpen, setIsDossierOpen] = useState(true);
  const [isModLabVerified, setIsModLabVerified] = useState<boolean>(false);
  const [hydratedMeta, setHydratedMeta] = useState<any | null>(null);

  useEffect(() => {
    setHydratedMeta(null);
    if (!rawMod) return;

    let cancelled = false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const candidateId =
      rawMod.dbId && uuidRegex.test(String(rawMod.dbId))
        ? String(rawMod.dbId)
        : rawMod.id && uuidRegex.test(String(rawMod.id))
          ? String(rawMod.id)
          : "";
    const candidateHash = String(rawMod.hash || "").trim();
    const candidateName = String(rawMod.name || rawMod.displayName || "").trim();

    const MOD_SELECT =
      "id, name, created_at, category_override, master_author, compliance_tier, image_url, description, url, compatible_versions, requiredDLC, status, status_reason, is_paid, is_early_access, mod_versions(dna_hash, version_label, created_at)";

    const hydrateFromSpoke = async () => {
      try {
        let matchedMod: any = null;
        if (candidateId) {
          const { data } = await supabase
            .from("mods")
            .select(MOD_SELECT)
            .eq("id", candidateId)
            .maybeSingle();
          if (data) matchedMod = data;
        }
        if (!matchedMod && candidateHash) {
          const { data: vRow } = await supabase
            .from("mod_versions")
            .select(`mod_id, dna_hash, mods(${MOD_SELECT})`)
            .eq("dna_hash", candidateHash)
            .limit(1)
            .maybeSingle();
          if (vRow?.mods) {
            matchedMod = Array.isArray(vRow.mods) ? vRow.mods[0] : vRow.mods;
          }
        }
        if (!matchedMod && candidateName) {
          const { data } = await supabase
            .from("mods")
            .select(MOD_SELECT)
            .eq("name", candidateName)
            .limit(1)
            .maybeSingle();
          if (data) matchedMod = data;
        }

        const resolvedId = matchedMod?.id || candidateId;
        let parentMod: any = null;

        if (resolvedId) {
          const [{ data: relRows }, { data: depRows }] = await Promise.all([
            supabase
              .from("mod_relationships")
              .select("parent_id, child_id, relationship_type")
              .in("relationship_type", ["addon", "flavor", "set_item", "beta"])
              .eq("child_id", resolvedId)
              .limit(5),
            supabase
              .from("mod_dependencies")
              .select("parent_id, child_id")
              .eq("child_id", resolvedId)
              .limit(5),
          ]);

          const parentRow = [...(relRows || []), ...(depRows || [])].find(
            (r: any) => r.parent_id && r.parent_id !== resolvedId
          );
          if (parentRow?.parent_id) {
            const { data: pData } = await supabase
              .from("mods")
              .select(MOD_SELECT)
              .eq("id", parentRow.parent_id)
              .maybeSingle();
            if (pData) parentMod = pData;
          }
        }

        if (cancelled || (!matchedMod && !parentMod)) return;

        const latestVer =
          Array.isArray(matchedMod?.mod_versions) && matchedMod.mod_versions.length > 0
            ? matchedMod.mod_versions[0]
            : null;
        const parentLatestVer =
          Array.isArray(parentMod?.mod_versions) && parentMod.mod_versions.length > 0
            ? parentMod.mod_versions[0]
            : null;

        setHydratedMeta({
          dbId: matchedMod?.id || resolvedId || undefined,
          hash: latestVer?.dna_hash || undefined,
          author: matchedMod?.master_author || parentMod?.master_author || undefined,
          master_author: matchedMod?.master_author || parentMod?.master_author || undefined,
          category_override:
            matchedMod?.category_override || parentMod?.category_override || undefined,
          description: matchedMod?.description || parentMod?.description || undefined,
          url: matchedMod?.url || parentMod?.url || undefined,
          image_url: matchedMod?.image_url || parentMod?.image_url || undefined,
          compatible_versions:
            Array.isArray(matchedMod?.compatible_versions) &&
            matchedMod.compatible_versions.length > 0
              ? matchedMod.compatible_versions
              : Array.isArray(parentMod?.compatible_versions)
                ? parentMod.compatible_versions
                : undefined,
          created_at:
            matchedMod?.created_at ||
            latestVer?.created_at ||
            parentMod?.created_at ||
            undefined,
          updated_at:
            latestVer?.created_at ||
            matchedMod?.created_at ||
            parentLatestVer?.created_at ||
            parentMod?.created_at ||
            undefined,
          version:
            latestVer?.version_label || parentLatestVer?.version_label || undefined,
          status: matchedMod?.status || parentMod?.status || "stable",
          status_reason:
            matchedMod?.status_reason || parentMod?.status_reason || undefined,
          compliance_tier:
            matchedMod?.compliance_tier ?? parentMod?.compliance_tier ?? undefined,
          mod_versions: matchedMod?.mod_versions || parentMod?.mod_versions || undefined,
        });
      } catch {
        // Ignore non-fatal hydration error
      }
    };

    hydrateFromSpoke();
    return () => {
      cancelled = true;
    };
  }, [rawMod?.id, rawMod?.dbId, rawMod?.hash, rawMod?.name]);

  const mod = useMemo(() => {
    if (!rawMod) return null;
    const isUnknownStr = (val?: string) => {
      if (!val) return true;
      const low = String(val).trim().toLowerCase();
      return (
        low === "" ||
        low === "unknown" ||
        low === "unknown creator" ||
        low === "unknown mason" ||
        low === "local"
      );
    };

    const resolvedAuthor = !isUnknownStr(rawMod.author)
      ? rawMod.author
      : !isUnknownStr(rawMod.master_author)
        ? rawMod.master_author
        : hydratedMeta?.author || rawMod.author || "";

    const resolvedCategory =
      rawMod.category_override ||
      rawMod.category ||
      rawMod.type ||
      hydratedMeta?.category_override ||
      "";

    const resolvedCompat =
      Array.isArray(rawMod.compatible_versions) && rawMod.compatible_versions.length > 0
        ? rawMod.compatible_versions
        : hydratedMeta?.compatible_versions || [];

    const latestVerCreated =
      rawMod.mod_versions?.[0]?.created_at ||
      hydratedMeta?.mod_versions?.[0]?.created_at;

    return {
      ...rawMod,
      dbId: rawMod.dbId || hydratedMeta?.dbId || (rawMod.isNexusView ? rawMod.id : undefined),
      hash: rawMod.hash || hydratedMeta?.hash || "",
      author: resolvedAuthor,
      master_author: resolvedAuthor,
      category: resolvedCategory,
      category_override: resolvedCategory,
      type: resolvedCategory,
      description: rawMod.description || rawMod.desc || hydratedMeta?.description || "",
      url: rawMod.url || hydratedMeta?.url || "",
      image_url: rawMod.image_url || hydratedMeta?.image_url || "",
      compatible_versions: resolvedCompat,
      created_at: rawMod.created_at || hydratedMeta?.created_at || latestVerCreated || null,
      updated_at:
        rawMod.updated_at ||
        hydratedMeta?.updated_at ||
        latestVerCreated ||
        rawMod.created_at ||
        hydratedMeta?.created_at ||
        null,
      version: rawMod.version || rawMod.latest_version || hydratedMeta?.version || "",
      status:
        rawMod.status ||
        hydratedMeta?.status ||
        (rawMod.isNexusView ? "stable" : ""),
      status_reason: rawMod.status_reason || hydratedMeta?.status_reason || undefined,
      compliance_tier: rawMod.compliance_tier ?? hydratedMeta?.compliance_tier ?? 0,
      mod_versions: rawMod.mod_versions || hydratedMeta?.mod_versions,
    };
  }, [rawMod, hydratedMeta]);

  useEffect(() => {
    if (!mod?.hash) {
      setIsModLabVerified(false);
      return;
    }
    checkDnaHashVerification(mod.hash).then((res) => {
      setIsModLabVerified(res.verified);
    });
  }, [mod?.hash]);

  const handleClose = () => {
    setIsDossierOpen(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 500);
  };

  const [selectedKid, setSelectedKid] = useState<any | null>(null);
  const [displayedKid, setDisplayedKid] = useState<any | null>(null);
  useEffect(() => {
    if (selectedKid) setDisplayedKid(selectedKid);
  }, [selectedKid]);
  const kidToRender = selectedKid || displayedKid;
  const [isSaving, setIsSaving] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const isNexusView = mod?.isNexusView;
  const targetDbId =
    mod?.dbId ||
    (isNexusView &&
    mod?.id &&
    String(mod.id).match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
      ? mod.id
      : null);
  const [isBanned, setIsBanned] = useState(false);
  const [, setBanReason] = useState("");

  useEffect(() => {
    if (session?.user?.id) {
      supabase
        .from("profiles")
        .select("is_comm_banned, comm_blacklist_reason")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.is_comm_banned) {
            setIsBanned(true);
            setBanReason(data.comm_blacklist_reason || "Communications Ban");
          }
        });
    }
  }, [session]);

  const [localCreatedAt, setLocalCreatedAt] = useState<string | null>(
    mod?.created_at || null
  );
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(
    mod?.updated_at || null
  );
  const showImages = useStore((state: any) => state.showImages);
  const [localCategory, setLocalCategory] = useState<string>(
    mod?.category_override || mod?.category || mod?.type || ""
  );
  const [localCompatibleVersions, setLocalCompatibleVersions] = useState<
    string[]
  >(mod?.compatible_versions || []);

  useEffect(() => {
    if (mod) {
      setLocalCreatedAt(mod.created_at || null);
      setLocalUpdatedAt(mod.updated_at || null);
      setLocalCategory(mod.category_override || mod.category || mod.type || "");
      setLocalCompatibleVersions(mod.compatible_versions || []);
    }
  }, [mod]);

  const { t } = useLexicon();
  const userRole = useStore((state: any) => state.userRole);
  const {
    stagingDraftItems,
    setStagingDraftItems,
    toggleModInStagingDraft,
  } = useModalStore();
  const isModStaged = stagingDraftItems.some((item: any) => {
    const itemId = String(item.id || item.mod_id || "").toLowerCase();
    const itemHash = String(item.hash || item.dna_hash || "").toLowerCase();
    const itemName = String(item.name || item.displayName || "").toLowerCase();
    const targetId = String(mod?.id || mod?.dbId || "").toLowerCase();
    const targetHash = String(mod?.hash || "").toLowerCase();
    const targetName = String(mod?.name || mod?.displayName || "").toLowerCase();
    return (
      (targetId && itemId === targetId) ||
      (targetHash && itemHash && itemHash === targetHash) ||
      (targetName && itemName === targetName)
    );
  });

  if (!mod) return null;

  const hasExplicitStatus =
    mod.status &&
    mod.status.trim() !== "" &&
    mod.status.toLowerCase() !== "local folder" &&
    mod.status.toLowerCase() !== "local node";
  const statusType = hasExplicitStatus
    ? mod.status.toLowerCase()
    : !mod.dbId || mod.version?.toLowerCase() === "v.local"
      ? "local"
      : (mod.status || "").toLowerCase();

  const activeMods = activePlaySet?.mods || [];
  const kids = mod.flavors || [];
  const isCollection = mod.isCollection;

  const localOverrides = JSON.parse(
    localStorage.getItem("sanctuary_local_overrides") || "{}"
  );
  const hasOverrides = !!localOverrides[mod.hash];

  const getVersions = (target: any) => {
    const v = target.compatible_versions;
    return typeof v === "string"
      ? v.split(",").map((s: string) => s.trim())
      : v || [];
  };

  let familyVersion = "Unknown";
  if (mod.isVirtual) {
    const highestPerFlavor = (mod.flavors || []).map((f: any) =>
      getHighestVersion(getVersions(f))
    );
    familyVersion = getLowestVersion(highestPerFlavor);
  } else {
    familyVersion = getHighestVersion(getVersions(mod));
  }

  const getCasualties = (targetName: string): string[] => {
    const target = (modList || []).find((m: any) => m.name === targetName);
    if (!target) return [];

    const toDelete = new Set<string>();
    const initialMods =
      target.isVirtual && target.flavors ? target.flavors : [target];

    initialMods.forEach((mItem: any) => {
      toDelete.add(mItem.name);

      const familyAnchor = mItem.familyId || mItem.dbId;
      const isMaster =
        mItem.dbId && String(mItem.dbId) === String(familyAnchor);

      const localSets = JSON.parse(
        localStorage.getItem(
          `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`
        ) || "[]"
      );
      const isArchMember = localSets.some(
        (s: any) =>
          s.archetypes?.core === mItem.hash ||
          s.archetypes?.twins?.includes(mItem.hash)
      );

      if (
        mItem.isVirtual ||
        isMaster ||
        isArchMember ||
        mItem.relationshipType === "twin" ||
        mItem.relationshipType === "core" ||
        mItem.relationshipType === "beta"
      ) {
        (modList || [])
          .filter(
            (m: any) =>
              (String(m.familyId) === String(familyAnchor) ||
                String(m.dbId) === String(familyAnchor) ||
                String(m.setId) === String(mItem.dbId) ||
                (isArchMember &&
                  localSets.some(
                    (s: any) =>
                      (s.archetypes?.core === mItem.hash ||
                        s.archetypes?.twins?.includes(mItem.hash)) &&
                      s.items.includes(m.hash)
                  ))) &&
              m.name &&
              !m.isVirtual &&
              m.name !== mItem.name &&
              activeMods.includes(m.name)
          )
          .forEach((m: any) => toDelete.add(m.name));
      }
    });

    let keepChecking = true;
    while (keepChecking) {
      keepChecking = false;
      (modList || []).forEach((m: any) => {
        if (
          !m.isVirtual &&
          activeMods.includes(m.name) &&
          !toDelete.has(m.name)
        ) {
          const isDependent = m.requirements?.some((r: any) => {
            const reqId = typeof r === "string" ? r : r.id || r.dbId;
            const reqName = typeof r === "string" ? r : r.name;
            const isReqNumeric = !isNaN(Number(reqName));
            const reqBaseName = String(reqName)
              .split(/[\\/]/)
              .pop()
              ?.replace(getExtensionRegex(activeGameSchema), "")
              .toUpperCase();

            return Array.from(toDelete).some((delName) => {
              const delMod = modList.find((ml: any) => ml.name === delName);
              if (!delMod) return false;
              return (
                (reqId && String(delMod.dbId) === String(reqId)) ||
                (reqId && delMod.hash === reqId) ||
                (!isReqNumeric &&
                  reqBaseName &&
                  delMod.displayName &&
                  (delMod.displayName.toUpperCase().includes(reqBaseName) ||
                    delMod.displayName
                      .toUpperCase()
                      .replace(/_/g, " ")
                      .includes(reqBaseName.replace(/_/g, " "))))
              );
            });
          });

          if (isDependent) {
            toDelete.add(m.name);
            keepChecking = true;
          }
        }
      });
    }

    toDelete.delete(target.name);

    if (toDelete.size === 0) return [];

    const cleanTarget = (
      target.displayName ||
      (target.name || "").split("/").pop() ||
      ""
    )
      .replace(/_/g, " ")
      .replace(/\.[^/.]+$/, "");

    const cleanDeps = Array.from(toDelete).map((delName) => {
      const d = modList.find((m: any) => m.name === delName);
      if (!d) return delName;
      return (d.displayName || (d.name || "").split("/").pop() || "")
        .replace(/_/g, " ")
        .replace(/\.[^/.]+$/, "");
    });

    return [cleanTarget, ...cleanDeps];
  };

  const safeToggle = (targetName: string) => {
    const isCurrentlyEquipped = activeMods.includes(targetName);
    const doToggle = () => {
      onToggleInActiveSet(targetName);
      if (
        selectedKid &&
        selectedKid.name === targetName &&
        isCurrentlyEquipped
      ) {
        setSelectedKid(null);
      }
    };

    if (isCurrentlyEquipped) {
      const c = getCasualties(targetName);
      if (c.length > 0 && onShowYeetAlert) {
        onShowYeetAlert(c, doToggle);
        return;
      }
    }
    doToggle();
  };

  const allEquipped =
    kids.length > 0 && kids.every((k: any) => activeMods.includes(k.name));

  const handleToggleAll = () => {
    if (allEquipped && kids.length > 0) {
      const allDeps: any[] = [];
      kids.forEach((k: any) => {
        if (activeMods.includes(k.name)) {
          allDeps.push(
            (k.displayName || (k.name || "").split("/").pop() || "")
              .replace(/_/g, " ")
              .replace(/\.[^/.]+$/, "")
          );
          const c = getCasualties(k.name);
          if (c.length > 0) allDeps.push(...c);
        }
      });
      const uniqueDeps = [...new Set(allDeps)];
      if (uniqueDeps.length > 0 && onShowYeetAlert) {
        onShowYeetAlert(uniqueDeps, () => onToggleInActiveSet(mod.name));
        return;
      }
    }
    onToggleInActiveSet(mod.name);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSaveMetadata({
      created_at: localCreatedAt,
      updated_at: localUpdatedAt,
      category_override: localCategory,
      compatible_versions: localCompatibleVersions,
      manifest_url: metaInputs.manifest_url?.trim() || undefined,
      is_paid: metaInputs.is_paid || false,
      is_early_access: metaInputs.is_early_access || false,
    });
    setIsSaving(false);
    setEditMode(false);
    setIsCorrecting(false);
  };

  const handleExportLocalRelease = async () => {
    const vaultPath = useStore.getState().vaultPath;
    if (!vaultPath || !mod?.name) return;
    setIsSaving(true);
    try {
      const localOvr = JSON.parse(
        localStorage.getItem("sanctuary_local_overrides") || "{}"
      );
      const edgeLogic = JSON.parse(
        localStorage.getItem("sanctuary_edge_logic") || "{}"
      );
      const existingManifestUrl =
        metaInputs.manifest_url?.trim() ||
        mod.manifest_url ||
        (mod.hash && localOvr[mod.hash]?.manifest_url) ||
        (mod.hash && edgeLogic[mod.hash]?.manifest_url) ||
        "https://your-domain.com/manifest.json";

      const cleanModName = (
        mod.displayName ||
        mod.name.split(/[\\/]/).pop() ||
        "local_mod"
      ).trim();
      const artifactId = cleanModName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");
      const previousHashes = Array.from(
        new Set(
          [
            ...(Array.isArray(mod.flavors)
              ? mod.flavors.map((f: any) => f.hash)
              : []),
            ...(Array.isArray(edgeLogic[mod.hash]?.previous_hashes)
              ? edgeLogic[mod.hash].previous_hashes
              : []),
          ].filter((h: any) => h && h !== mod.hash)
        )
      );

      const manifestPayload = {
        schema_version: "1.0",
        artifact: {
          id: artifactId,
          name: cleanModName,
          author: (metaInputs.author || mod.author || "Local Mason").trim(),
          version:
            (metaInputs.version || mod.version || "1.0.0")
              .replace(/^v\.?/i, "")
              .trim() || "1.0.0",
          game_version:
            (Array.isArray(localCompatibleVersions) &&
              localCompatibleVersions[0]) ||
            useStore.getState().selectedVersion ||
            "Any",
          release_date: new Date().toISOString(),
          game_id: useStore.getState().activeWorkspaceId || "sims4",
        },
        payload: {
          download_url: (
            metaInputs.url ||
            mod.url ||
            existingManifestUrl
          ).trim(),
          sha256: mod.hash || "",
          archive_type: "zip",
        },
        atomic_logic: {
          required_dlc:
            Array.isArray(metaInputs.requiredDLC) &&
            metaInputs.requiredDLC.length > 0
              ? metaInputs.requiredDLC
              : Array.isArray(mod.requiredDLC)
                ? mod.requiredDLC
                : [],
          dependencies: Array.isArray(mod.requirements)
            ? mod.requirements.map((r: any) => ({
                hash: String(r.hash || r.id || r),
                min_version: r.min_version || null,
              }))
            : [],
          twins: Array.isArray(mod.twins)
            ? mod.twins.map((tw: any) => String(tw.hash || tw.id || tw))
            : [],
          addons: [],
          conflicts: Array.isArray(mod.conflicts)
            ? mod.conflicts.map((c: any) => ({
                hash: String(c.enemy_id || c.enemy_name || ""),
                severity: Number(c.severity_rank || 3),
                description: c.resolution_note || undefined,
              }))
            : [],
          flavors: Array.isArray(mod.flavors)
            ? mod.flavors.map((f: any) => f.hash).filter(Boolean)
            : [],
        },
        virtual_filesystem: {
          overrides: [],
          injected_folders: [],
        },
        changelog: metaInputs.desc
          ? [metaInputs.desc]
          : [t("label_initial_edge_release", "Static Edge Release")],
        previous_hashes: previousHashes,
      };

      const targetFolderOrFile = mod.physical_path || mod.name;
      await invoke("export_edge_release", {
        vaultPath,
        sandboxModName: targetFolderOrFile,
        manifest: manifestPayload,
        customUrl: existingManifestUrl,
      });

      useStore
        .getState()
        .pushStatus(
          t("msg_export_release_success", "Exported manifest.json, override.json, and release .zip to {mod} folder!")
        );
    } catch (err: any) {
      console.error("Failed to export edge release from Dossier:", err);
      useStore.getState().pushStatus(`Export failed: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFlagMod = async (reason: string) => {
    if (
      reason === "Outdated Information" ||
      reason === "Inaccurate Information"
    ) {
      setShowFlagModal(false);
      setIsCorrecting(true);
      setEditMode(true);
      return;
    }

    if (!targetDbId) {
      useStore.getState().pushStatus(t("auto_cannot_flag_local_32", "Cannot flag a local-only {mod}."));
      return;
    }

    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Authentication required."));
      return;
    }

    let payload: any = {};
    if (reason === "adult") payload = { compliance_tier: 2 };
    else if (reason === "NSFW") payload = { compliance_tier: 1 };
    else if (reason === "Suspected Malware") {
      const { error: reportError } = await submitThreatManifestToSpoke(
        {
          artifact_name: mod.name || "Unknown Mod",
          detected_hash: mod.hash || "unknown-hash",
          signature: "User Flagged: Suspected Malware",
          status: "pending",
          original_exists: true,
          original_shredded: false,
        },
        { isAuto: false, defaultSignature: "User Flagged: Suspected Malware" }
      );
      if (reportError) {
        useStore
          .getState()
          .pushStatus(`Failed to flag mod: ${reportError.message}`);
        return;
      }
      payload = { status: "unverified" };
    } else payload = { status: "unverified" };

    const { error } = await supabase
      .from("mods")
      .update(payload)
      .eq("id", targetDbId);
    if (!error) {
      useStore
        .getState()
        .pushStatus(
          `Mod flagged for: ${reason}. It has been updated pending review.`
        );
      setShowFlagModal(false);
      onClose();
    } else {
      useStore.getState().pushStatus(`Failed to flag mod: ${error.message}`);
    }
  };

  const handleSubmitToVault = async () => {
    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Authentication required."));
      return;
    }

    if (requireScoutLabTest && mod?.hash) {
      const verRes = await checkDnaHashVerification(mod.hash);
      if (!verRes.verified) {
        useStore
          .getState()
          .pushStatus(
            t(
              "lab_gate_locked_scout_msg",
              "Submission Locked: This spoke requires a clean timed test before unlocking Scout Queue submissions."
            ),
            "error"
          );
        return;
      }
    }

    let bondedHash = metaInputs.lineage || null;
    if (bondedHash) {
      const parentMod = (modList || []).find(
        (m: any) =>
          (m.displayName || (m.name || "").split(/[\\/]/).pop() || m.name) ===
          bondedHash
      );
      if (parentMod && parentMod.hash) {
        bondedHash = parentMod.hash;
      }
    }

    setIsSaving(true);
    const { error } = await supabase.from("scout_suggestions").insert([
      {
        dna_hash: mod.hash,
        suggested_name: metaInputs.name,
        suggested_author: metaInputs.author,
        suggested_url: metaInputs.url,
        suggested_type: localCategory || mod.type || "FILE",
        suggested_bonded_to: bondedHash,
        suggested_version:
          metaInputs.version || deriveHumanReadableVersion(mod.name, mod.hash),
        suggested_sub_type:
          getFileLabel(mod.name || "", activeGameSchema) === "PACKAGE"
            ? "Package"
            : getFileLabel(mod.name || "", activeGameSchema) === "SCRIPT"
              ? "ts4Script"
              : null,
        suggested_game_versions:
          localCompatibleVersions.length > 0 ? localCompatibleVersions : null,
        submitter_id: session.user.id,
        description: metaInputs.desc || null,
        image_url: metaInputs.image || null,
        compliance_tier: mod.compliance_tier || 0,
        is_paid: metaInputs.is_paid || false,
        is_early_access: metaInputs.is_early_access || false,
        status: "pending",
      },
    ]);

    if (error) {
      useStore
        .getState()
        .pushStatus(`Failed to submit to Vault: ${error.message}`);
    } else {
      const submitted = JSON.parse(
        localStorage.getItem("sanctuary_submitted_hashes") || "[]"
      );
      if (mod.hash && !submitted.includes(mod.hash)) {
        submitted.push(mod.hash);
        localStorage.setItem(
          "sanctuary_submitted_hashes",
          JSON.stringify(submitted)
        );
      }
      useStore
        .getState()
        .pushStatus(t("auto_successfully_submitted_to_45", "Successfully submitted to Scout Queue."));
      setEditMode(false);
    }
    setIsSaving(false);
  };

  const requirements = (mod.requirements || mod.requires || []).filter(
    (v: any, i: number, a: any[]) =>
      a.findIndex((tItem: any) => (tItem.id || tItem) === (v.id || v)) === i
  );
  const conflicts = mod.conflicts || [];
  const twins = (mod.twins || []).filter(
    (v: any, i: number, a: any[]) =>
      a.findIndex(
        (tItem: any) => (tItem.id || tItem.name) === (v.id || v.name)
      ) === i
  );

  const cleanArtifactTitle = (
    mod.displayName ||
    (mod.name || "").split(/[/\\]/).pop() ||
    ""
  )
    .replace(/_/g, " ")
    .replace(/\.[^/.]+$/, "");

  const statusLabel = (() => {
    if (
      !hasExplicitStatus &&
      (!mod.dbId || mod.version?.toLowerCase() === "v.local")
    )
      return t("badge_local", "Unlinked");
    const raw = mod.status || "";
    const cleaned = raw.replace(/[\[\]]/g, "").toLowerCase();
    if (cleaned === "broken") return t("status_corrupted", "Broken");
    if (cleaned === "stable") return t("status_stable", "Stable");
    if (cleaned === "unverified") return t("unverified", "Unverified");
    if (cleaned === "local folder" || cleaned === "local node")
      return t("local_node", "Local Node");
    if (cleaned.includes("sandbox")) return t("filter_dev", "Sandbox");
    const translated = cleaned.includes("status_")
      ? t(cleaned, cleaned.replace(/_/g, " "))
      : cleaned.replace(/_/g, " ");
    return translated || t("badge_local", "Unlinked");
  })();

  const statusVariant: "accent" | "success" | "warning" | "danger" =
    statusType === "stable"
      ? "success"
      : statusType === "broken" || statusType === "corrupted"
        ? "danger"
        : statusType === "unstable" || statusType === "paid"
          ? "warning"
          : "accent";

  const statusIcon =
    statusType === "stable"
      ? t("icon_verified_user", "verified_user")
      : statusType === "unstable"
        ? t("icon_warning", "warning")
        : statusType === "broken" || statusType === "corrupted"
          ? t("icon_pest_control", "pest_control")
          : statusType === "under review"
            ? t("icon_science", "science")
            : statusType === "pending"
              ? t("icon_pending", "pending")
              : statusType === "early access"
                ? t("icon_experiment", "experiment")
                : statusType === "paid"
                  ? t("icon_monetization_on", "monetization_on")
                  : getModIcon(mod, activeGameSchema, t);

  const resolvedVersion = (() => {
    if (mod.isLocalOverride && mod.version) return mod.version;
    let v = mod.mod_versions?.[0]?.version_label || mod.version;
    if (!v && mod.isVirtual && mod.flavors) {
      const flavorV = mod.flavors.find(
        (f: any) => (f.isLocalOverride && f.version) || f.mod_versions?.[0]?.version_label || f.version
      );
      if (flavorV)
        v = (flavorV.isLocalOverride && flavorV.version) || flavorV.mod_versions?.[0]?.version_label || flavorV.version;
    }
    return v || t("unknown", "Local");
  })();

  const resolvedCreatedAt = (() => {
    let dt = mod.created_at || mod.mod_versions?.[0]?.created_at;
    if (!dt && mod.isVirtual && mod.flavors) {
      const dates = mod.flavors
        .map((f: any) => f.created_at || f.mod_versions?.[0]?.created_at)
        .filter(Boolean)
        .sort()
        .reverse();
      if (dates.length > 0) dt = dates[0];
    }
    return dt ? new Date(dt).toLocaleDateString() : t("unknown", "Local");
  })();

  const resolvedUpdatedAt = (() => {
    let dt = mod.updated_at || mod.mod_versions?.[0]?.created_at || mod.created_at;
    if (!dt && mod.isVirtual && mod.flavors) {
      const dates = mod.flavors
        .map((f: any) => f.updated_at || f.mod_versions?.[0]?.created_at || f.created_at)
        .filter(Boolean)
        .sort()
        .reverse();
      if (dates.length > 0) dt = dates[0];
    }
    return dt ? new Date(dt).toLocaleDateString() : t("unknown", "Local");
  })();

  const coverImageUrl =
    metaInputs.image || mod.image_url || mod.imageUrl || "";
  const hasValidCover =
    (showImages || editMode) &&
    coverImageUrl &&
    String(coverImageUrl) !== "null" &&
    String(coverImageUrl).trim() !== "";

  return (
    <>
      <SidePanel
        isOpen={isDossierOpen}
        onClose={handleClose}
        title={cleanArtifactTitle}
        subtitle={`${mod.author || t("unknown", "Local")} • ${statusLabel}`}
        icon={getModIcon(mod, activeGameSchema, t)}
        iconColorClass={
          statusVariant === "danger"
            ? "text-[var(--danger)]"
            : statusVariant === "warning"
              ? "text-[var(--warning)]"
              : statusVariant === "success"
                ? "text-[var(--success)]"
                : "text-[var(--accent)]"
        }
        widthClass="w-[820px] max-w-[100vw]"
        backdropZ="z-[100001]"
        panelZ="z-[100002]"
        headerActions={
          <PanelHeaderGroup>
            {editMode ? (
              <>
                {!isCorrecting && (
                  <>
                    <PanelHeaderButton
                      icon={t("hub_save", "save")}
                      label={
                        isSaving
                          ? t("dossier_btn_saving", "Saving...")
                          : t("btn_save_local", "Save")
                      }
                      variant="success"
                      onClick={handleSave}
                      disabled={isSaving}
                    />
                    <PanelHeaderButton
                      icon={t("icon_refresh", "refresh")}
                      label={t("btn_reset", "Reset")}
                      variant="danger"
                      onClick={() => {
                        if (onResetMetadata) onResetMetadata(mod.hash);
                        handleClose();
                      }}
                    />
                  </>
                )}
                {isCorrecting &&
                  session &&
                  !(Number(mod.compliance_tier || 0) >= 1 && Number(mod.compliance_tier || 0) <= 4) && (
                    <PanelHeaderButton
                      icon={
                        requireScoutLabTest && !isModLabVerified
                          ? t("icon_lock", "lock")
                          : t("icon_send", "send")
                      }
                      label={
                        isSaving
                          ? t("btn_submitting", "Submitting...")
                          : t("btn_submit_corrections", "Submit")
                      }
                      variant="success"
                      onClick={handleSubmitToVault}
                      disabled={
                        isSaving || (requireScoutLabTest && !isModLabVerified)
                      }
                    />
                  )}
                <PanelHeaderButton
                  icon={t("icon_close", "close")}
                  label={t("cancel", "Cancel")}
                  onClick={() => {
                    setEditMode(false);
                    setIsCorrecting(false);
                  }}
                />
              </>
            ) : (
              <>
                {mod.hash?.startsWith("dev_sandbox_") && isDesktop() && (
                  <PanelHeaderButton
                    icon={t("icon_cloud_sync", "cloud_sync")}
                    tooltip={t("btn_sync_network", "Sync Network")}
                    variant="success"
                    onClick={() => {
                      if (onSyncToNetwork) onSyncToNetwork(mod);
                      else setEditMode(true);
                    }}
                  />
                )}
                {!mod.isVirtual &&
                  !isNexusView &&
                  !mod.name?.startsWith("LOCAL_SET_") &&
                  isDesktop() && (
                    <PanelHeaderButton
                      icon={t("icon_rocket_launch", "rocket_launch")}
                      tooltip={t("btn_export_release", "Export Release")}
                      onClick={handleExportLocalRelease}
                      disabled={isSaving}
                    />
                  )}
                {!(Number(mod.compliance_tier || 0) >= 1 && Number(mod.compliance_tier || 0) <= 4) &&
                  isDesktop() && (
                    <PanelHeaderButton
                      icon={t("icon_science", "science")}
                      tooltip={t("btn_send_to_lab", "Send to Lab")}
                      onClick={() => {
                        handleClose();
                        onSendToLab();
                      }}
                    />
                  )}
                {mod.name?.startsWith("LOCAL_SET_")
                  ? isDesktop() && (
                      <PanelHeaderButton
                        icon={t("icon_tune", "tune")}
                        tooltip={t("local_folders_edit", "Edit Folder")}
                        variant="warning"
                        onClick={() => {
                          handleClose();
                          window.dispatchEvent(
                            new CustomEvent("openLocalFolderEditor", {
                              detail: mod.dbId,
                            })
                          );
                        }}
                      />
                    )
                  : isDesktop() && (
                      <PanelHeaderButton
                        icon={t("icon_edit", "edit")}
                        tooltip={
                          isCorrecting
                            ? t("btn_submit_corrections", "Submit Corrections")
                            : t("btn_edit", "Edit")
                        }
                        variant="warning"
                        onClick={() => setEditMode(true)}
                      />
                    )}
                {userRole === "oversight" && mod.compliance_tier === 5 && (
                  <PanelHeaderButton
                    icon={t("icon_delete_forever", "delete_forever")}
                    tooltip={t("malware_alert_btn_shred", "Shred")}
                    variant="danger"
                    onClick={() => {
                      handleClose();
                      onSecureShred(mod.name);
                    }}
                  />
                )}
                {!(Number(mod.compliance_tier || 0) >= 1 && Number(mod.compliance_tier || 0) <= 4) &&
                  targetDbId &&
                  session &&
                  !isBanned && (
                    <PanelHeaderButton
                      icon={t("icon_flag", "flag")}
                      tooltip={t("btn_flag", "Flag {Mod}")}
                      variant="warning"
                      onClick={() => setShowFlagModal(true)}
                    />
                  )}
                {!mod.isVirtual && !isDesktop() && (
                  <PanelHeaderButton
                    icon={
                      isModStaged
                        ? t("icon_playlist_add_check", "playlist_add_check")
                        : t("icon_playlist_add", "playlist_add")
                    }
                    label={
                      isModStaged
                        ? t("staging_btn_staged", "Staged")
                        : t("staging_btn_stage_mod", "Stage to PC")
                    }
                    variant={isModStaged ? "success" : "default"}
                    onClick={async () => {
                      const wasStaged = isModStaged;
                      const added = toggleModInStagingDraft(mod);
                      const latestItems = useModalStore.getState().stagingDraftItems || [];
                      if (latestItems.length > 0) {
                        const { mergedItems, addedCount } = await resolvePayloadDependencies(latestItems);
                        setStagingDraftItems(
                          mergedItems.map((item, idx) => ({ ...item, load_order_index: idx }))
                        );
                        if (added && addedCount > 0) {
                          useStore
                            .getState()
                            .pushStatus(
                              `${t("resolved", "Resolved")} ${addedCount} ${t(
                                "status_deps_resolved_suffix",
                                "child dependencies."
                              )}`,
                              "info"
                            );
                          return;
                        }
                      }
                      useStore
                        .getState()
                        .pushStatus(
                          wasStaged
                            ? t(
                                "status_staging_item_removed",
                                "Removed from Remote Staging Queue."
                              )
                            : t(
                                "status_staging_item_added",
                                "Added to Remote Staging Queue."
                              )
                        );
                    }}
                  />
                )}
                <PanelHeaderButton
                  icon={
                    mod.url || hasOverrides
                      ? t("icon_download", "download")
                      : t("icon_search", "search")
                  }
                  tooltip={
                    mod.url || hasOverrides
                      ? t("btn_download", "Download")
                      : t("btn_search_web", "Search Web")
                  }
                  onClick={() => {
                    const url = getModFallbackUrl(
                      mod.displayName || mod.name || "",
                      mod.hash,
                      activeGameSchema,
                      { url: mod.url }
                    );
                    handleOpenUrl(url);
                  }}
                />
              </>
            )}
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={statusIcon}
            overline={t("system_status", "System Status")}
            title={statusLabel}
            description={
              mod.status_reason ||
              `${cleanArtifactTitle} • ${mod.author || t("unknown", "Local")}`
            }
            badge={
              mod.name?.includes(".")
                ? `.${(mod.name || "").split(".").pop()?.toUpperCase()}`
                : isCollection
                  ? t("collection", "Collection")
                  : mod.isFlavorFolder
                    ? t("exclusive", "Exclusive")
                    : mod.isParent
                      ? t("folder", "Folder")
                      : localCategory || t("label_artifact", "{Mod}")
            }
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            variant={statusVariant}
          >
            <div className="flex flex-col gap-3">
              {hasValidCover && (
                <div className="w-full h-40 rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] glass-surface relative">
                  <img
                    src={coverImageUrl}
                    className="w-full h-full object-cover opacity-80"
                    alt={t("cc_cover_url", "Cover")}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {!mod.isVirtual && mod.hash && (
                    <LabVerificationBadge
                      dnaHash={mod.hash}
                      required={requireScoutLabTest && isCorrecting}
                    />
                  )}
                  {(editMode ? metaInputs.is_early_access : mod.is_early_access) && (
                    <span
                      className={VAULT_CHIP_CLASS}
                      style={{
                        color: "var(--accent)",
                        borderColor:
                          "color-mix(in srgb, var(--accent) 35%, var(--border))",
                      }}
                    >
                      <span className="material-symbols-rounded !text-[12px] shrink-0">
                        {t("icon_science", "science")}
                      </span>
                      {t("badge_early_access", "Early Access")}
                    </span>
                  )}
                  {(editMode ? metaInputs.is_paid : mod.is_paid) && (
                    <span
                      className={VAULT_CHIP_CLASS}
                      style={{
                        color: "var(--warning)",
                        borderColor:
                          "color-mix(in srgb, var(--warning) 35%, var(--border))",
                      }}
                    >
                      <span className="material-symbols-rounded !text-[12px] shrink-0">
                        {t("icon_monetization_on", "monetization_on")}
                      </span>
                      {t("badge_paid", "Paid")}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!editMode &&
                    mod.compliance_tier !== 1 &&
                    mod.compliance_tier !== 2 &&
                    isDesktop() && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_science", "science")}
                        label={t("btn_send_to_lab", "Send to Lab")}
                        onClick={() => {
                          handleClose();
                          onSendToLab();
                        }}
                      />
                    )}
                  {!editMode && (
                    <ActionButton
                      variant="glass"
                      icon={
                        mod.url || hasOverrides
                          ? t("icon_download", "download")
                          : t("icon_search", "search")
                      }
                      label={
                        mod.url || hasOverrides
                          ? t("btn_download", "Download")
                          : t("btn_search_web", "Search Web")
                      }
                      onClick={() => {
                        const url = getModFallbackUrl(
                          mod.displayName || mod.name || "",
                          mod.hash,
                          activeGameSchema,
                          { url: mod.url }
                        );
                        handleOpenUrl(url);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </SidePanelHeroCard>

          {editMode && (
            <SidePanelTitleInput
              value={metaInputs.name}
              onChange={setMetaInputs.name}
              placeholder={t("mod_name", "Artifact Name")}
              label={t("mod_name", "Artifact Name")}
              icon={t("icon_deployed_code", "deployed_code")}
            />
          )}

          {!mod.isVirtual &&
            !isNexusView &&
            mod.hash &&
            mod.compliance_tier !== 1 &&
            mod.compliance_tier !== 2 &&
            editMode &&
            isCorrecting && (
              <LabVerificationGate
                dnaHash={mod.hash}
                modName={mod.displayName || mod.name || "Artifact"}
                physicalPath={mod.physical_path || mod.name}
                roleContext="scout"
                isGateRequired={requireScoutLabTest}
                onStatusChange={(st) => setIsModLabVerified(st.verified)}
                onOpenInFullLab={
                  onSendToLab
                    ? () => {
                        handleClose();
                        onSendToLab();
                      }
                    : undefined
                }
              />
            )}

          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_analytics", "analytics")}
          >
            {!editMode ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatBox
                    label={t("mason", "{Mason}")}
                    value={mod.author || t("unknown", "Local")}
                    icon={t("icon_person", "person")}
                    iconColorClass="text-[var(--accent)]"
                    onClick={
                      mod.mason_id && onOpenMasonProfile
                        ? () => {
                            onOpenMasonProfile(mod.mason_id);
                            onClose();
                          }
                        : undefined
                    }
                  />
                  <StatBox
                    label={t("revision", "Revision")}
                    value={resolvedVersion}
                    icon={t("icon_tag", "tag")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("label_game_version", "Game Version")}
                    value={
                      familyVersion === "Unknown" ||
                      familyVersion === "ALL" ||
                      familyVersion === ""
                        ? t("any", "Any")
                        : familyVersion
                    }
                    icon={t("icon_sports_esports", "sports_esports")}
                    iconColorClass="text-[var(--success)]"
                  />
                  <StatBox
                    label={t("label_mod_category", "{Mod} Category")}
                    value={
                      isCollection
                        ? t("collection", "Collection")
                        : mod.isFlavorFolder
                          ? t("exclusive", "Exclusive")
                          : mod.isParent
                            ? t("folder", "Folder")
                            : localCategory || t("uncategorized", "Uncategorized")
                    }
                    icon={t("icon_category", "category")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("tab_compliance", "Compliance")}
                    value={
                      mod.compliance_tier === 1
                        ? t("tier_nsfw", "NSFW")
                        : mod.compliance_tier === 2
                          ? t("tier_adult", "Adult")
                          : t("tier_clean", "Clean")
                    }
                    icon={t("icon_shield", "shield")}
                    iconColorClass={
                      mod.compliance_tier === 1 || mod.compliance_tier === 2
                        ? "text-[var(--warning)]"
                        : "text-[var(--success)]"
                    }
                  />
                  <StatBox
                    label={t("badge_early_access", "Access Tier")}
                    value={
                      mod.is_early_access
                        ? t("badge_early_access", "Early Access")
                        : mod.is_paid
                          ? t("badge_paid", "Paid")
                          : t("badge_free", "Free")
                    }
                    icon={
                      mod.is_early_access
                        ? t("icon_science", "science")
                        : mod.is_paid
                          ? t("icon_monetization_on", "monetization_on")
                          : t("icon_public", "public")
                    }
                    iconColorClass={
                      mod.is_paid
                        ? "text-[var(--warning)]"
                        : mod.is_early_access
                          ? "text-[var(--accent)]"
                          : "text-[var(--success)]"
                    }
                  />
                  <StatBox
                    label={t("label_uploaded", "Uploaded")}
                    value={resolvedCreatedAt}
                    icon={t("icon_calendar_today", "calendar_today")}
                  />
                  <StatBox
                    label={t("updated_date", "Updated")}
                    value={resolvedUpdatedAt}
                    icon={t("icon_update", "update")}
                  />
                </div>

                {(metaInputs.manifest_url || mod.manifest_url) && (
                  <div className="flex items-center justify-between gap-4 p-3.5 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl glass-surface border text-[var(--accent)] flex items-center justify-center shrink-0"
                        style={{
                          borderColor:
                            "color-mix(in srgb, var(--accent) 25%, var(--border))",
                        }}
                      >
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_network_wifi", "network_wifi")}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
                          {t(
                            "label_static_manifest_linked",
                            "Static Edge Manifest Linked"
                          )}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--subtext)] truncate">
                          {metaInputs.manifest_url || mod.manifest_url}
                        </span>
                      </div>
                    </div>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_sync", "sync")}
                      label={t("btn_poll_manifest", "Poll Manifest")}
                      onClick={() =>
                        onSaveMetadata({
                          manifest_url:
                            metaInputs.manifest_url || mod.manifest_url,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("mason", "{Mason}")}
                    </label>
                    <input
                      value={metaInputs.author}
                      onChange={(e) => setMetaInputs.author(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("author_placeholder", "{Mason} Name...")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("revision", "Revision")}
                    </label>
                    <input
                      value={metaInputs.version || ""}
                      onChange={(e) => setMetaInputs.version(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("unknown", "1.0.0")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_mod_category", "{Mod} Category")}
                    </label>
                    <CustomClassificationDropdown
                      value={localCategory || "Script"}
                      onChange={(val: string) => setLocalCategory(val)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_game_version", "Game Version")}
                    </label>
                    <GameVersionMultiSelect
                      selectedVersions={localCompatibleVersions || []}
                      onChange={(v) => setLocalCompatibleVersions(v)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_uploaded", "Uploaded")}
                    </label>
                    <CustomDatePicker
                      value={localCreatedAt}
                      onChange={setLocalCreatedAt}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("updated_date", "Updated")}
                    </label>
                    <CustomDatePicker
                      value={localUpdatedAt}
                      onChange={setLocalUpdatedAt}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SidePanelPillToggle
                    checked={metaInputs.is_paid || false}
                    onChange={(val) => setMetaInputs.is_paid(val)}
                    icon={
                      metaInputs.is_paid
                        ? t("icon_monetization_on", "monetization_on")
                        : t("icon_money_off", "money_off")
                    }
                    label={`${t("label_is_paid", "Paid {Mod}")}: ${
                      metaInputs.is_paid
                        ? t("badge_paid", "Paid")
                        : t("badge_free", "Free")
                    }`}
                    activeColor="var(--warning)"
                  />
                  <SidePanelPillToggle
                    checked={metaInputs.is_early_access || false}
                    onChange={(val) => setMetaInputs.is_early_access(val)}
                    icon={
                      metaInputs.is_early_access
                        ? t("icon_science", "science")
                        : t("icon_public", "public")
                    }
                    label={`${t("badge_early_access", "Early Access")}: ${
                      metaInputs.is_early_access
                        ? t("badge_early_access", "Early Access")
                        : t("badge_standard", "Standard")
                    }`}
                    activeColor="var(--accent)"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("external_url_placeholder", "External URL")}
                    </label>
                    <input
                      value={metaInputs.url}
                      onChange={(e) => setMetaInputs.url(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("cc_cover_url", "Cover Image URL")}
                    </label>
                    <input
                      value={metaInputs.image}
                      onChange={(e) => setMetaInputs.image(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-[var(--accent)] uppercase tracking-wider px-1">
                      {t(
                        "edge_manifest_url_label",
                        "Static Edge Manifest URL (manifest.json)"
                      )}
                    </label>
                    <input
                      value={metaInputs.manifest_url || ""}
                      onChange={(e) =>
                        setMetaInputs.manifest_url &&
                        setMetaInputs.manifest_url(e.target.value)
                      }
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t(
                        "placeholder_static_manifest_url",
                        "https://your-domain.com/manifest.json"
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
          </UniversalGroup>

          <UniversalGroup
            title={t("log_manifest", "{Mod} Description")}
            icon={t("icon_description", "description")}
          >
            {editMode ? (
              <textarea
                value={metaInputs.desc}
                onChange={(e) => setMetaInputs.desc(e.target.value)}
                className="w-full h-36 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3.5 text-xs font-medium text-[var(--text)] resize-none focus:outline-none transition-all custom-scrollbar"
                placeholder={t("local_desc_placeholder", "Enter description...")}
              />
            ) : (
              <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] whitespace-pre-wrap">
                {mod.description || t("no_desc_manifest", "No description provided for this {Mod}.")}
              </div>
            )}
          </UniversalGroup>

          {editMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ActionButton
                variant="glass"
                icon={t("icon_close", "close")}
                label={t("cancel", "Cancel")}
                onClick={() => {
                  setEditMode(false);
                  setIsCorrecting(false);
                }}
                className="!w-full !h-11"
              />
              {isCorrecting &&
              session &&
              mod.compliance_tier !== 1 &&
              mod.compliance_tier !== 2 ? (
                <ActionButton
                  variant="glass"
                  icon={
                    requireScoutLabTest && !isModLabVerified
                      ? t("icon_lock", "lock")
                      : t("icon_send", "send")
                  }
                  label={
                    isSaving
                      ? t("btn_submitting", "Submitting...")
                      : t("btn_submit_corrections", "Submit Corrections")
                  }
                  onClick={handleSubmitToVault}
                  disabled={
                    isSaving || (requireScoutLabTest && !isModLabVerified)
                  }
                  className="!w-full !h-11 !text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                />
              ) : (
                <ActionButton
                  variant="glass"
                  icon={t("hub_save", "save")}
                  label={
                    isSaving
                      ? t("dossier_btn_saving", "Saving...")
                      : t("btn_save_local", "Save Changes")
                  }
                  onClick={handleSave}
                  disabled={isSaving}
                  className="!w-full !h-11 !text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                />
              )}
            </div>
          )}

          {kids.length > 0 && (
            <UniversalGroup
              title={`${t("manifest", "Manifest")} (${kids.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
              headerAction={
                !isNexusView && (
                  <ActionButton
                    onClick={handleToggleAll}
                    variant="glass"
                    icon={
                      allEquipped
                        ? t("icon_remove_circle_outline", "remove_circle_outline")
                        : t("icon_add_circle_outline", "add_circle_outline")
                    }
                    label={
                      allEquipped
                        ? t("remove_all", "Remove All")
                        : t("add_all", "Add All")
                    }
                    className={
                      allEquipped
                        ? "!text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                        : "!text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                    }
                  />
                )
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {kids.map((kid: any, kidIndex: number) => {
                  const isEquipped = activeMods.includes(kid.name);
                  const kidStatusRaw = (kid.status || "")
                    .toLowerCase()
                    .replace(/[\[\]]/g, "");
                  const kidStatusVar =
                    kidStatusRaw === t("status_stable", "stable").toLowerCase() ||
                    kidStatusRaw === "stable"
                      ? "var(--success)"
                      : kidStatusRaw === "broken" ||
                          kidStatusRaw === "corrupted"
                        ? "var(--danger)"
                        : kidStatusRaw === "unstable" || kidStatusRaw === "paid"
                          ? "var(--warning)"
                          : "var(--subtext)";
                  const kidStatusIcon =
                    kidStatusVar === "var(--success)"
                      ? t("icon_verified_user", "verified_user")
                      : kidStatusVar === "var(--danger)"
                        ? t("icon_pest_control", "pest_control")
                        : kidStatusVar === "var(--warning)"
                          ? t("icon_warning", "warning")
                          : t("icon_label", "label");

                  return (
                    <div
                      key={kid.hash || kid.id || `${kid.name}_${kidIndex}`}
                      onClick={() => setSelectedKid(kid)}
                      className={`group relative flex items-center justify-between gap-3 p-3.5 rounded-xl glass-surface border transition-all cursor-pointer ${
                        isEquipped
                          ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                      }`}
                    >
                      <div className="flex flex-col min-w-0 flex-1 relative group/title">
                        <span className="text-xs font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                          {(
                            kid.displayName ||
                            (kid.name || "").split("/").pop() ||
                            ""
                          )
                            .replace(/_/g, " ")
                            .replace(/\.[^/.]+$/, "")}
                        </span>
                        <HoverTooltip
                          title={
                            kid.displayName ||
                            (kid.name || "").split("/").pop() ||
                            ""
                          }
                          variant="default"
                          className="!hidden group-hover/title:!flex z-[100] left-0 bottom-full mb-1"
                        />
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span
                            className={VAULT_CHIP_CLASS}
                            style={{
                              color: "var(--subtext)",
                              borderColor:
                                "color-mix(in srgb, var(--subtext) 35%, var(--border))",
                            }}
                          >
                            <span className="material-symbols-rounded !text-[12px] shrink-0">
                              {String(kid.name || "")
                                .toLowerCase()
                                .includes("ts4script")
                                ? t("icon_terminal", "terminal")
                                : t("icon_deployed_code", "deployed_code")}
                            </span>
                            {kid.name?.includes(".")
                              ? getFileLabel(kid.name, activeGameSchema)
                              : (
                                  kid.type ||
                                  kid.category_override ||
                                  t("label_artifact", "{Mod}")
                                ).toUpperCase()}
                          </span>
                          <span
                            className={VAULT_CHIP_CLASS}
                            style={{
                              color: "var(--accent)",
                              borderColor:
                                "color-mix(in srgb, var(--accent) 35%, var(--border))",
                            }}
                          >
                            <span className="material-symbols-rounded !text-[12px] shrink-0">
                              {t("icon_history", "history")}
                            </span>
                            <span className="truncate max-w-[110px]">
                              {kid.mod_versions?.[0]?.version_label ||
                                kid.version ||
                                t("unknown", "Local")}
                            </span>
                          </span>
                          <span
                            className={`${VAULT_CHIP_CLASS} max-w-[140px]`}
                            style={{
                              color: kidStatusVar,
                              borderColor: `color-mix(in srgb, ${kidStatusVar} 35%, var(--border))`,
                            }}
                          >
                            <span className="material-symbols-rounded !text-[12px] shrink-0">
                              {kidStatusIcon}
                            </span>
                            <span className="truncate">
                              {(() => {
                                const raw = kid.status || "";
                                const cleaned = raw.replace(/[\[\]]/g, "");
                                if (cleaned.toLowerCase() === "broken")
                                  return t("status_corrupted", "Broken");
                                const translated = cleaned.includes("status_")
                                  ? t(cleaned, cleaned.replace(/_/g, " "))
                                  : cleaned.replace(/_/g, " ");
                                return translated || t("badge_local", "Unlinked");
                              })()}
                            </span>
                          </span>
                        </div>
                      </div>
                      {!isNexusView && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            safeToggle(kid.name);
                          }}
                          className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-black transition-all glass-surface border ${
                            isEquipped
                              ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)]"
                              : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[18px]">
                            {isEquipped
                              ? t("icon_close", "close")
                              : t("icon_add", "add")}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </UniversalGroup>
          )}

          {(requirements.length > 0 ||
            twins.length > 0 ||
            conflicts.length > 0) && (
            <UniversalGroup
              title={t("network_protocols", "Required {Mods}")}
              icon={t("auto_extension", "extension")}
            >
              <div className="flex flex-col gap-2.5">
                {requirements.map((req: any, i: number) => {
                  const reqId =
                    typeof req === "string" ? req : req.id || req.dbId;
                  const reqUrl = typeof req === "string" ? null : req.url;
                  const match =
                    modList?.find(
                      (m: any) =>
                        String(m.dbId) === String(reqId) || m.hash === reqId
                    ) || (typeof req !== "string" ? req : null);
                  const displayName = match
                    ? match.displayName || match.name
                    : typeof req === "string"
                      ? req
                      : req.name;
                  const searchUrl =
                    reqUrl ||
                    `https://www.google.com/search?q=${encodeURIComponent(
                      activeGameSchema?.display_name || "Mod"
                    )}+${encodeURIComponent(
                      cleanSearchName(displayName, activeGameSchema)
                    )}`;
                  return (
                    <div
                      key={i}
                      onClick={() =>
                        match
                          ? setSelectedKid(match)
                          : handleOpenUrl(searchUrl)
                      }
                      className={`group flex items-center justify-between gap-3 p-3.5 rounded-xl glass-surface border transition-all cursor-pointer ${
                        !match
                          ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-9 h-9 rounded-xl glass-surface border flex items-center justify-center shrink-0 ${
                            match
                              ? "text-[var(--accent)]"
                              : "text-[var(--danger)]"
                          }`}
                          style={{
                            borderColor: match
                              ? "color-mix(in srgb, var(--accent) 25%, var(--border))"
                              : "color-mix(in srgb, var(--danger) 25%, var(--border))",
                          }}
                        >
                          <span className="material-symbols-outlined !text-[18px]">
                            {match
                              ? t("icon_extension", "extension")
                              : t("icon_error", "error")}
                          </span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                          {displayName}
                        </span>
                      </div>
                      <span
                        className={VAULT_CHIP_CLASS}
                        style={{
                          color: match ? "var(--accent)" : "var(--danger)",
                          borderColor: match
                            ? "color-mix(in srgb, var(--accent) 35%, var(--border))"
                            : "color-mix(in srgb, var(--danger) 35%, var(--border))",
                        }}
                      >
                        <span className="material-symbols-rounded !text-[12px] shrink-0">
                          {match
                            ? t("icon_extension", "extension")
                            : t("icon_error", "error")}
                        </span>
                        {match
                          ? t("requirement_essential", "Requirement")
                          : t("vault_missing_artifacts", "Missing {Mods}:")}
                      </span>
                    </div>
                  );
                })}
                {twins.map((twin: any, i: number) => {
                  const twinId = twin.id || twin.dbId || twin.name;
                  const match =
                    modList?.find(
                      (m: any) =>
                        String(m.dbId) === String(twinId) || m.hash === twinId
                    ) || twin;
                  const displayName = match
                    ? match.displayName || match.name
                    : twin.displayName || twin.name;
                  return (
                    <div
                      key={i}
                      onClick={() => match && setSelectedKid(match)}
                      className="group flex items-center justify-between gap-3 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="w-9 h-9 rounded-xl glass-surface border text-[var(--accent)] flex items-center justify-center shrink-0"
                          style={{
                            borderColor:
                              "color-mix(in srgb, var(--accent) 25%, var(--border))",
                          }}
                        >
                          <span className="material-symbols-outlined !text-[18px]">
                            {t("icon_account_tree", "account_tree")}
                          </span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                          {displayName}
                        </span>
                      </div>
                      <span
                        className={VAULT_CHIP_CLASS}
                        style={{
                          color: "var(--accent)",
                          borderColor:
                            "color-mix(in srgb, var(--accent) 35%, var(--border))",
                        }}
                      >
                        <span className="material-symbols-rounded !text-[12px] shrink-0">
                          {t("icon_account_tree", "account_tree")}
                        </span>
                        {t("identity_twin", "Twin")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {kidToRender && (
        <SidePanel
          isOpen={!!selectedKid}
          onClose={() => setSelectedKid(null)}
          title={(
            kidToRender.displayName ||
            (kidToRender.name || "").split(/[/\\]/).pop() ||
            ""
          )
            .replace(/_/g, " ")
            .replace(/\.[^/.]+$/, "")}
          subtitle={`${kidToRender.author || mod.author || t("unknown", "Local")} • ${
            kidToRender.mod_versions?.[0]?.version_label ||
            kidToRender.version ||
            t("unknown", "Local")
          }`}
          icon={getModIcon(kidToRender, activeGameSchema, t)}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[660px] max-w-[100vw]"
          backdropZ="z-[100005]"
          panelZ="z-[100006]"
          headerActions={
            !isNexusView && (
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={
                    activeMods.includes(kidToRender.name)
                      ? t("icon_remove", "remove")
                      : t("icon_add", "add")
                  }
                  tooltip={
                    activeMods.includes(kidToRender.name)
                      ? t("btn_unequip", "Unequip {Mod}")
                      : t("btn_equip", "Equip {Mod}")
                  }
                  variant={
                    activeMods.includes(kidToRender.name) ? "danger" : "success"
                  }
                  onClick={() => {
                    safeToggle(kidToRender.name);
                    if (!activeMods.includes(kidToRender.name))
                      setSelectedKid(null);
                  }}
                  label={
                    activeMods.includes(kidToRender.name)
                      ? t("btn_unequip", "Unequip {Mod}")
                      : t("btn_equip", "Equip {Mod}")
                  }
                />
              </PanelHeaderGroup>
            )
          }
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={getModIcon(kidToRender, activeGameSchema, t)}
              overline={
                kidToRender.author || mod.author || t("unknown", "Local")
              }
              title={(
                kidToRender.displayName ||
                (kidToRender.name || "").split(/[/\\]/).pop() ||
                ""
              )
                .replace(/_/g, " ")
                .replace(/\.[^/.]+$/, "")}
              description={kidToRender.status_reason || kidToRender.name}
              badge={
                kidToRender.mod_versions?.[0]?.version_label ||
                kidToRender.version ||
                t("unknown", "Local")
              }
              badgeIcon={t("icon_tag", "tag")}
              variant="accent"
            />

            <UniversalGroup
              title={t("tab_metadata", "Module Telemetry")}
              icon={t("icon_analytics", "analytics")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatBox
                  label={t("comp_type", "Component Type")}
                  value={
                    kidToRender.type ||
                    kidToRender.category_override ||
                    getFileLabel(kidToRender.name || "", activeGameSchema)
                  }
                  icon={t("icon_deployed_code", "deployed_code")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("label_uploaded", "Uploaded")}
                  value={
                    kidToRender.created_at
                      ? new Date(kidToRender.created_at).toLocaleDateString()
                      : t("unknown", "Local")
                  }
                  icon={t("icon_calendar_today", "calendar_today")}
                />
                <StatBox
                  label={t("updated_date", "Updated")}
                  value={
                    kidToRender.updated_at
                      ? new Date(kidToRender.updated_at).toLocaleDateString()
                      : t("unknown", "Local")
                  }
                  icon={t("icon_update", "update")}
                />
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("log_manifest", "{Mod} Description")}
              icon={t("icon_description", "description")}
            >
              <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                {kidToRender.description || t("no_desc_sub", "No specific local description provided for this sub-{mod}.")}
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {showFlagModal && (
        <SidePanel
          isOpen={showFlagModal}
          onClose={() => setShowFlagModal(false)}
          title={t("flag_title", "Flag Artifact")}
          subtitle={t("flag_desc", "Select a reason to flag this {Mod} for Moderator review.")}
          icon={t("icon_flag", "flag")}
          iconColorClass="text-[var(--warning)]"
          widthClass="w-[520px] max-w-[100vw]"
          backdropZ="z-[110000]"
          panelZ="z-[110001]"
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_flag", "flag")}
              overline={t("flag_title", "Flag Artifact")}
              title={cleanArtifactTitle}
              description={t("flag_desc", "Select a reason to flag this {Mod} for Moderator review.")}
              variant="warning"
            />

            <UniversalGroup
              title={t("flag_title", "Report Reason")}
              icon={t("icon_report", "report")}
            >
              <div className="flex flex-col gap-2.5">
                <ActionButton
                  variant="glass"
                  icon={t("icon_history", "history")}
                  label={t("dossier_flag_outdated", "Outdated Information")}
                  onClick={() => handleFlagMod("Outdated Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_edit_note", "edit_note")}
                  label={t("flag_inaccurate", "Inaccurate Information")}
                  onClick={() => handleFlagMod("Inaccurate Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_warning", "warning")}
                  label={t("flag_nsfw", "NSFW Content")}
                  onClick={() => handleFlagMod("NSFW")}
                  className="!w-full !h-11 !justify-start !px-4 !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_shield", "shield")}
                  label={t("flag_adult", "Adult Content")}
                  onClick={() => handleFlagMod("adult")}
                  className="!w-full !h-11 !justify-start !px-4 !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_gpp_bad", "gpp_bad")}
                  label={t("flag_malware", "Suspected Malware")}
                  onClick={() => handleFlagMod("Suspected Malware")}
                  className="!w-full !h-11 !justify-start !px-4 !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                />
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}
    </>
  );
}
