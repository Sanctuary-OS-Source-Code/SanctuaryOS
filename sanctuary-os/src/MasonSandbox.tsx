import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "./hub-components/SharedRegistry";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  SidePanel,
  CustomDropdown,
  GameVersionMultiSelect,
  CustomComplianceDropdown,
  CustomDatePicker,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "./shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
  SidePanelPillToggle,
} from "./components/layouts/ElevatedHubLayout";
import { ArtifactCard } from "./Cards";
import { MasonStatusDropdown } from "./MasonHub";
import {
  LabVerificationGate,
  checkDnaHashVerification,
  recordVerifiedCertificate,
} from "./components/LabVerificationGate";
import { buildFamilyHierarchy } from "./components/artifact-studio/artifactStudioUtils";
import {
  ArtifactWorkspace,
  StudioTabId,
  formatDisplayHash,
  isUuid,
} from "./components/ArtifactStudioTabs";
import { StaticPollingGuideSidePanel } from "./side-panels/StaticPollingGuideSidePanel";

export function MasonSandbox({
  masonId,
  masonName,
  isVerifiedMason = true,
  initialSandboxMod,
  initialActiveModId,
  onClearActiveMod,
  initialViewTab,
  onClear,
  vaultPath,
}: {
  masonId: string;
  masonName?: string;
  isVerifiedMason?: boolean;
  initialSandboxMod?: any;
  initialActiveModId?: string | null;
  onClearActiveMod?: () => void;
  initialViewTab?: "overview" | "sandbox" | "nexus" | "flagged";
  onClear?: any;
  onOpenInProtocols?: (mod: any) => void;
  vaultPath?: string;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const requireMasonLabTest = activeGameSchema?.lab_verification?.require_for_mason_publish !== false;

  const [activeMod, setActiveMod] = useState<any>(initialSandboxMod || null);
  const [editorMode, setEditorMode] = useState<"sandbox" | "registry">("sandbox");
  const [isActiveModLabVerified, setIsActiveModLabVerified] = useState<boolean>(false);
  const [sandboxMods, setSandboxMods] = useState<any[]>([]);
  const [existingMods, setExistingMods] = useState<any[]>([]);
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set());
  const [hashToModMap, setHashToModMap] = useState<Map<string, any>>(new Map());
  const [cloudRelRows, setCloudRelRows] = useState<any[]>([]);
  const [openTicketMap, setOpenTicketMap] = useState<Map<string, any[]>>(new Map());

  const [isCommitting, setIsCommitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [groupFamilies, setGroupFamilies] = useState<boolean>(true);
  const [studioTab, setStudioTab] = useState<StudioTabId>("overview");
  const [familyRefreshTick, setFamilyRefreshTick] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [hubTab, setHubTab] = useState<"overview" | "sandbox" | "nexus" | "flagged">(
    initialViewTab || "overview"
  );
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(!!initialSandboxMod);
  const [isStaticGuideOpen, setIsStaticGuideOpen] = useState(false);

  useEffect(() => {
    if (initialViewTab) setHubTab(initialViewTab);
  }, [initialViewTab]);

  useEffect(() => {
    if (!activeMod?.hash) {
      setIsActiveModLabVerified(false);
      return;
    }
    checkDnaHashVerification(activeMod.hash).then((res) => {
      setIsActiveModLabVerified(res.verified);
    });
  }, [activeMod?.hash]);

  const fetchExistingMods = async () => {
    if (!isVerifiedMason) return;
    const { data } = await supabase
      .from("mods")
      .select("*, mod_versions(id, dna_hash, version_label, game_version)")
      .eq("mason_id", masonId)
      .order("name");
    if (data) {
      setExistingMods(data);
      const hashes = new Set<string>();
      const hMap = new Map<string, any>();
      const myModIds: string[] = [];
      data.forEach((m) => {
        myModIds.push(m.id);
        if (m.mod_versions) {
          m.mod_versions.forEach((v: any) => {
            if (v.dna_hash) {
              hashes.add(v.dna_hash);
              hMap.set(v.dna_hash, m);
            }
          });
        }
      });
      setExistingHashes(hashes);
      setHashToModMap(hMap);

      if (myModIds.length > 0) {
        const [{ data: rels }, { data: tickets }] = await Promise.all([
          supabase
            .from("mod_relationships")
            .select("id, parent_id, child_id, relationship_type")
            .in("parent_id", myModIds),
          supabase
            .from("sanctuary_tickets")
            .select("*")
            .in("status", [
              "NEW",
              "OPEN",
              "PENDING",
              "ESCALATED",
              "INVESTIGATING",
              "new",
              "open",
              "pending",
              "escalated",
              "investigating",
            ]),
        ]);
        if (rels) setCloudRelRows(rels);
        if (tickets) {
          const tMap = new Map<string, any[]>();
          const myIdSet = new Set(myModIds);
          for (const tk of tickets) {
            const targetId = tk.target_mod_id || tk.metadata?.target_mod_id;
            if (targetId && myIdSet.has(targetId)) {
              const arr = tMap.get(targetId) || [];
              arr.push(tk);
              tMap.set(targetId, arr);
            }
          }
          setOpenTicketMap(tMap);
        }
      }
    }
  };

  useEffect(() => {
    fetchExistingMods();
  }, [masonId, isVerifiedMason]);

  // Open a specific Cloud mod when navigated via initialActiveModId
  useEffect(() => {
    if (initialActiveModId && existingMods.length > 0) {
      const found = existingMods.find(
        (m) =>
          m.id === initialActiveModId ||
          (m.mod_versions && m.mod_versions.some((v: any) => v.dna_hash === initialActiveModId))
      );
      if (found) {
        openCloudMod(found);
      }
      if (onClear) onClear();
    }
  }, [initialActiveModId, existingMods]);

  const openSandboxMod = (mod: any) => {
    const matchedCloudMod = mod.hash ? hashToModMap.get(mod.hash) : null;
    setEditorMode("sandbox");
    if (matchedCloudMod) {
      setActiveMod({
        ...matchedCloudMod,
        ...mod,
        id: matchedCloudMod.id,
        name: mod.name,
        physical_path: mod.physical_path || mod.name,
        category_override: mod.category_override || matchedCloudMod.category_override,
        sub_type: mod.sub_type || matchedCloudMod.sub_type,
        description: mod.description || matchedCloudMod.description,
        image_url: mod.image_url || matchedCloudMod.image_url,
        url: mod.url || matchedCloudMod.url,
        latest_version: mod.latest_version || matchedCloudMod.latest_version,
        compatible_versions: mod.compatible_versions?.length
          ? mod.compatible_versions
          : matchedCloudMod.compatible_versions,
        folder_structure: mod.folder_structure?.length
          ? mod.folder_structure
          : matchedCloudMod.folder_structure,
        mod_versions: matchedCloudMod.mod_versions,
      });
    } else {
      const savedAll = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
      const saved = (mod.hash && savedAll[mod.hash]) || {};
      setActiveMod({
        ...mod,
        ...saved,
        id: saved.linked_target_mod_id && isUuid(saved.linked_target_mod_id) ? saved.linked_target_mod_id : undefined,
        physical_path: mod.physical_path || mod.name,
      });
    }
    setStudioTab("overview");
    setIsEditorOpen(true);
    setConfirmPurge(false);
  };

  const openCloudMod = (mod: any) => {
    setEditorMode("registry");
    setActiveMod(mod);
    setStudioTab("overview");
    setIsEditorOpen(true);
    setConfirmPurge(false);
  };

  const parseCsvList = (val: any): string[] => {
    if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
    if (typeof val === "string") return val.split(",").map((v) => v.trim()).filter(Boolean);
    return [];
  };

  const fetchSandboxMods = async () => {
    if (!vaultPath) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const mods = await invoke<any[]>("scan_sandbox", { vaultPath });
      setSandboxMods(mods);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialSandboxMod) {
      openSandboxMod(initialSandboxMod);
    }
    fetchSandboxMods();
  }, [initialSandboxMod, vaultPath]);

  const handleImportToSandbox = async () => {
    if (!vaultPath) {
      useStore.getState().pushStatus(t("auto_vault_path_not_30", "{Vault} path not set"), "error");
      return;
    }

    try {
      setIsImporting(true);
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Artifacts & Configs",
            extensions: [
              ...(useStore.getState().activeGameSchema?.extensions?.supported?.map((e: string) =>
                e.replace(".", "")
              ) || ["package", "ts4script"]),
              "zip",
              "txt",
              "js",
              "ts",
              "xml",
              "json",
              "cfg",
              "ini",
              "html",
              "css",
            ],
          },
        ],
      });

      if (!selected || (Array.isArray(selected) && selected.length === 0)) {
        setIsImporting(false);
        return;
      }

      const files = Array.isArray(selected) ? selected : [selected];
      const importedCount = await invoke<number>("import_to_sandbox", { files, vaultPath });

      useStore.getState().pushStatus(`Imported ${importedCount} file(s) to Sandbox!`, "success");
      await fetchSandboxMods();
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(`Failed to import to Sandbox: ${err.message || String(err)}`, "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportRelease = async () => {
    if (!activeMod) {
      useStore.getState().pushStatus(t("auto_no_valid_sandbox_45", "No valid sandbox {mod}"), "error");
      return;
    }
    setIsCommitting(true);
    try {
      let previousHashes: string[] = [
        ...parseCsvList(activeMod.previous_hashes_str),
        ...(Array.isArray(activeMod.local_versions)
          ? activeMod.local_versions
              .map((v: any) => v.dna_hash)
              .filter((h: string) => h && h !== activeMod.hash)
          : []),
        ...(Array.isArray(activeMod._olderVersions)
          ? activeMod._olderVersions.map((ov: any) => ov.hash).filter(Boolean)
          : []),
      ];
      previousHashes = Array.from(new Set(previousHashes.filter(Boolean)));

      if (activeMod.id && isVerifiedMason) {
        try {
          const { data: verData } = await supabase
            .from("mod_versions")
            .select("dna_hash")
            .eq("mod_id", activeMod.id);
          if (verData) {
            const dbHashes = verData.map((v: any) => v.dna_hash).filter(Boolean);
            previousHashes = Array.from(new Set([...previousHashes, ...dbHashes]));
          }
        } catch {}
      }

      const safeNameSlug = ((activeMod.name || "mod").split(/[\\/]/).pop() || "mod")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      const versionStr = (activeMod.latest_version || "1.0.0").trim();
      const customManifestUrl = (
        activeMod.static_manifest_url ||
        activeMod.manifest_url ||
        ""
      ).trim();
      const customDownloadUrl =
        (activeMod.download_url || activeMod.url || "").trim() ||
        (customManifestUrl
          ? customManifestUrl.replace(
              /\/manifest\.json$/i,
              `/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`
            )
          : `https://example.com/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`);

      const changelogLines =
        typeof activeMod.changelog_cache === "string" && activeMod.changelog_cache.trim()
          ? activeMod.changelog_cache
              .split(/\r?\n/)
              .map((l: string) => l.trim())
              .filter(Boolean)
          : [t("edge_initial_release", "Initial Release")];

      const injectedFolders = parseCsvList(activeMod.injected_folders_str || activeMod.folder_structure);
      const localCollections = parseCsvList(activeMod.collections_str);
      const localFlavors = parseCsvList(activeMod.flavors_str);
      const requiredDlcList = Array.isArray(activeMod.requiredDLC)
        ? activeMod.requiredDLC.map((d: any) => String(d).trim()).filter(Boolean)
        : parseCsvList(activeMod.required_dlc_str);

      const structuredConflicts =
        Array.isArray(activeMod.local_conflicts) && activeMod.local_conflicts.length > 0
          ? activeMod.local_conflicts
              .map((c: any) => ({
                hash: c.enemyMod?.hash || c.enemyMod?.name || "",
                id: c.enemyMod?.id || undefined,
                name: c.enemyMod?.name || undefined,
                severity: Number(c.severity_rank) || 4,
                description: c.resolution_note || undefined,
              }))
              .filter((c: any) => c.hash || c.name)
          : parseCsvList(activeMod.conflicts_str);

      const manifest = {
        schema_version: "1.0",
        manifest_url: customManifestUrl || undefined,
        artifact: {
          id: activeMod.id || safeNameSlug || "unknown",
          name: ((activeMod.name || "Unknown Mod").split(/[\\/]/).pop() || "Unknown Mod").replace(
            /\.(package|ts4script|zip)$/i,
            ""
          ),
          author: masonName || masonId || "Unknown Author",
          version: versionStr,
          game_version: activeMod.compatible_versions?.[0] || "",
          release_date: new Date().toISOString(),
          game_id: useStore.getState().activeGameSchema?.id || "sims4",
        },
        payload: {
          download_url: customDownloadUrl,
          sha256: activeMod.hash || "",
          archive_type: "zip",
        },
        atomic_logic: {
          required_dlc: requiredDlcList,
          dependencies: parseCsvList(activeMod.dependencies_str),
          twins: parseCsvList(activeMod.twins_str),
          addons: parseCsvList(activeMod.addons_str),
          conflicts: structuredConflicts,
          flavors: localFlavors,
          collections: localCollections,
        },
        virtual_filesystem: {
          overrides: [],
          injected_folders: injectedFolders,
        },
        changelog: changelogLines,
        previous_hashes: previousHashes,
      };

      let pushConfig: any = undefined;
      try {
        const globalPush = JSON.parse(
          localStorage.getItem("sanctuary_edge_autopush_global") || "{}"
        );
        const modPush = activeMod.edge_push_config || {};
        const mergedPush = { ...globalPush, ...modPush };
        if (mergedPush.provider && mergedPush.provider !== "manual") {
          pushConfig = {
            provider: mergedPush.provider || "manual",
            target_mode: mergedPush.target_mode || "manifest",
            token: mergedPush.token || "",
            repo_or_project: mergedPush.repo_or_project || "",
            branch: mergedPush.branch || "main",
            remote_path: mergedPush.remote_path || "",
            custom_endpoint: mergedPush.custom_endpoint || "",
            local_folder_path: mergedPush.local_folder_path || "",
          };
        }
      } catch {}

      const releaseDir = await invoke<string>("export_edge_release", {
        vaultPath,
        sandboxModName: activeMod.physical_path || activeMod.name,
        manifest,
        customUrl: customManifestUrl,
        pushConfig,
      });

      if (vaultPath) {
        try {
          const allEdgeRows = await invoke<any[]>("get_all_edge_manifests", { vaultPath }).catch(() => []);
          const exportedRow = (allEdgeRows || []).find(
            (r: any) => r.artifact_id === manifest.artifact.id,
          );
          const resolvedTargetHash = exportedRow?.target_hash || activeMod.hash || "";
          const resolvedArchiveHashes: string[] = Array.isArray(exportedRow?.archive_hashes)
            ? exportedRow.archive_hashes
            : previousHashes;
          const resolvedLiveUrl = exportedRow?.manifest_url || customManifestUrl || "";

          if (resolvedLiveUrl && resolvedLiveUrl !== customManifestUrl) {
            setActiveMod((prev: any) =>
              prev ? { ...prev, static_manifest_url: resolvedLiveUrl, manifest_url: resolvedLiveUrl } : prev
            );
            const modKey = activeMod.hash || activeMod.id;
            if (modKey) {
              const savedConfigs = JSON.parse(
                localStorage.getItem("sanctuary_sandbox_configs") || "{}"
              );
              savedConfigs[modKey] = {
                ...(savedConfigs[modKey] || {}),
                static_manifest_url: resolvedLiveUrl,
                manifest_url: resolvedLiveUrl,
              };
              localStorage.setItem("sanctuary_sandbox_configs", JSON.stringify(savedConfigs));
            }
          }

          const savedOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
          const savedEdgeLogic = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
          const allHashes = Array.from(
            new Set([resolvedTargetHash, activeMod.hash, ...resolvedArchiveHashes, ...previousHashes].filter(Boolean)),
          );
          for (const h of allHashes) {
            savedOverrides[h] = {
              ...(savedOverrides[h] || {}),
              name: manifest.artifact.name,
              displayName: savedOverrides[h]?.displayName || manifest.artifact.name,
              author: manifest.artifact.author,
              version: manifest.artifact.version,
              manifest_url: resolvedLiveUrl || undefined,
              url: activeMod.url || customDownloadUrl || resolvedLiveUrl,
              requiredDLC: manifest.atomic_logic.required_dlc,
              compatible_versions: manifest.artifact.game_version
                ? [manifest.artifact.game_version]
                : undefined,
              folder_structure: injectedFolders,
              collections: localCollections,
              flavors: localFlavors,
              conflicts: manifest.atomic_logic.conflicts,
              dependencies: manifest.atomic_logic.dependencies,
            };
            savedEdgeLogic[h] = {
              ...(savedEdgeLogic[h] || {}),
              ...manifest.atomic_logic,
              manifest_url: resolvedLiveUrl,
              artifact_id: manifest.artifact.id,
              name: manifest.artifact.name,
              author: manifest.artifact.author,
              version: manifest.artifact.version,
              game_version: manifest.artifact.game_version,
              download_url: customDownloadUrl,
              sha256: resolvedTargetHash,
              changelog: changelogLines,
            };
          }
          localStorage.setItem("sanctuary_local_overrides", JSON.stringify(savedOverrides));
          localStorage.setItem("sanctuary_edge_logic", JSON.stringify(savedEdgeLogic));
        } catch (regErr) {
          console.warn("Failed to auto-register exported manifest locally:", regErr);
        }
      }

      useStore.getState().pushStatus(
        `${t("edge_export_release_success", "Exported manifest.json, override.json, and release .zip to:")} ${releaseDir}`,
        "success"
      );
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(`Failed to export release: ${err.message || String(err)}`, "error");
    }
    setIsCommitting(false);
  };

  // Save edits to an already-published Nexus Cloud mod
  const handleSaveCloudModChanges = async () => {
    if (!activeMod || !isUuid(activeMod.id)) return;
    setIsCommitting(true);
    try {
      const { error } = await supabase
        .from("mods")
        .update({
          name: activeMod.name,
          description: activeMod.description,
          image_url: activeMod.image_url,
          url: activeMod.url,
          allow_write: activeMod.allow_write,
          category_override: activeMod.category_override,
          sub_type: activeMod.sub_type,
          file_extension: activeMod.file_extension,
          status: activeMod.status,
          created_at: activeMod.created_at,
          updated_at: new Date().toISOString(),
          compliance_tier: activeMod.compliance_tier,
          is_paid: activeMod.is_paid || false,
          is_early_access: activeMod.is_early_access || false,
          latest_version: activeMod.latest_version,
          compatible_versions: activeMod.compatible_versions,
          folder_structure: activeMod.folder_structure || [],
        })
        .eq("id", activeMod.id);
      if (error) throw error;
      await fetchExistingMods();
      useStore.getState().pushStatus(t("saved_success", "{Mod} Updated Successfully."), "success");
    } catch (err: any) {
      useStore.getState().pushStatus(`${t("alert_error", "Error: ")}${err.message}`, "error");
    }
    setIsCommitting(false);
  };

  // Sync a Sandbox mod (either brand-new or linked to an existing Nexus mod) to the Nexus Cloud Registry
  const handleSyncToNetwork = async () => {
    if (!isVerifiedMason) {
      useStore.getState().pushStatus(
        t("sandbox_verified_upload_only_err", "Nexus {Mod} Queue uploads are restricted to Verified {Masons}. Use Export Release to generate your local manifest.json, override.json, and release archive."),
        "error"
      );
      return;
    }
    if (!activeMod || !activeMod.hash) {
      useStore.getState().pushStatus(t("auto_no_valid_sandbox_45", "No valid sandbox {mod}"), "error");
      return;
    }
    const verCheck = await checkDnaHashVerification(activeMod.hash);
    if (requireMasonLabTest && !verCheck.verified) {
      useStore.getState().pushStatus(
        t(
          "lab_gate_locked_mason_msg",
          "Publish Locked: This spoke requires a clean timed test inside the Homestead Lab before unlocking uploads."
        ),
        "error"
      );
      return;
    }
    setIsCommitting(true);
    try {
      let targetModId = isUuid(activeMod.id) ? activeMod.id : null;

      if (targetModId) {
        // Update existing mod record (when creator chose "Link to Existing Mod -> New Version")
        const { error: updateErr } = await supabase
          .from("mods")
          .update({
            name: activeMod.name,
            description: activeMod.description || "",
            image_url: activeMod.image_url || null,
            url: activeMod.url || null,
            category_override: activeMod.category_override || activeMod.type || null,
            sub_type: activeMod.sub_type || null,
            file_extension: activeMod.file_extension || null,
            updated_at: new Date().toISOString(),
            compatible_versions: activeMod.compatible_versions || [],
            folder_structure: activeMod.folder_structure || [],
            is_paid: activeMod.is_paid || false,
            is_early_access: activeMod.is_early_access || false,
            latest_version: activeMod.latest_version || "1.0.0",
          })
          .eq("id", targetModId);
        if (updateErr) throw updateErr;
      } else {
        // Insert brand-new mod record
        const { data: newMod, error: insertError } = await supabase
          .from("mods")
          .insert([
            {
              name: activeMod.name || "Unknown Sandbox Mod",
              mason_id: masonId,
              description: activeMod.description || "",
              image_url: activeMod.image_url || null,
              url: activeMod.url || null,
              allow_write: activeMod.allow_write || false,
              category_override: activeMod.category_override || activeMod.type || null,
              sub_type: activeMod.sub_type || null,
              file_extension: activeMod.file_extension || null,
              status: activeMod.status || "unverified",
              created_at: activeMod.created_at || new Date().toISOString(),
              updated_at: activeMod.updated_at || new Date().toISOString(),
              compatible_versions: activeMod.compatible_versions || [],
              folder_structure: activeMod.folder_structure || [],
              is_paid: activeMod.is_paid || false,
              is_early_access: activeMod.is_early_access || false,
              latest_version: activeMod.latest_version || "v1.0",
            },
          ])
          .select()
          .single();

        if (insertError) throw insertError;
        targetModId = newMod.id;
      }

      const { error: versionError } = await supabase.from("mod_versions").upsert(
        [
          {
            mod_id: targetModId,
            dna_hash: activeMod.hash,
            version_label: activeMod.latest_version || "v1.0",
            game_version:
              activeMod.compatible_versions && activeMod.compatible_versions.length > 0
                ? activeMod.compatible_versions.join(", ")
                : null,
          },
        ],
        { onConflict: "dna_hash" }
      );

      if (versionError) throw versionError;

      // Sync any local family relationships (Twins, Add-ons, Flavors, Beta) if target mods have Cloud UUIDs
      if (targetModId) {
        if (activeMod.local_parent_rel) {
          const pId = activeMod.local_parent_rel.parent_id || activeMod.local_parent_rel.mod?.id;
          const resolvedParentId = isUuid(pId)
            ? pId
            : activeMod.local_parent_rel.mod?.hash
              ? hashToModMap.get(activeMod.local_parent_rel.mod.hash)?.id
              : null;
          if (resolvedParentId && isUuid(resolvedParentId)) {
            await supabase.from("mod_relationships").insert({
              parent_id: resolvedParentId,
              child_id: targetModId,
              relationship_type: activeMod.local_parent_rel.relationship_type || "addon",
            });
          }
        }
        if (Array.isArray(activeMod.local_child_rels)) {
          for (const rel of activeMod.local_child_rels) {
            const cId = rel.child_id || rel.mod?.id;
            const resolvedChildId = isUuid(cId)
              ? cId
              : rel.mod?.hash
                ? hashToModMap.get(rel.mod.hash)?.id
                : null;
            if (resolvedChildId && isUuid(resolvedChildId)) {
              await supabase.from("mod_relationships").insert({
                parent_id: targetModId,
                child_id: resolvedChildId,
                relationship_type: rel.relationship_type || "addon",
              });
            }
          }
        }
      }

      if (verCheck.cert) {
        await recordVerifiedCertificate(verCheck.cert);
      }

      useStore.getState().pushStatus(t("auto_mod_synced_to_39", "{Mod} synced to network!"), "success");
      setIsEditorOpen(false);
      await fetchExistingMods();
      if (onClear) onClear();
    } catch (err: any) {
      useStore.getState().pushStatus(`Error syncing to network: ${err.message}`, "error");
    }
    setIsCommitting(false);
  };

  const handlePurge = async () => {
    if (!activeMod) return;
    if (!confirmPurge) {
      setConfirmPurge(true);
      setTimeout(() => setConfirmPurge(false), 3000);
      return;
    }

    try {
      let vDir = vaultPath || "";
      let devLane =
        vDir.toLowerCase().endsWith("mods") ||
        vDir.toLowerCase().endsWith("mods/") ||
        vDir.toLowerCase().endsWith("mods\\")
          ? vDir.replace(/[\\/]Mods[\\/]?$/, "") + "/Dev/Sandbox"
          : vDir + "/Dev/Sandbox";

      const fullPath = `${devLane}/${activeMod.physical_path || activeMod.name}`;
      await invoke("delete_local_file", { path: fullPath });
      useStore.getState().pushStatus((t("purge", "Purge")) + " " + activeMod.name, "success");
      setIsEditorOpen(false);
      setConfirmPurge(false);
      fetchSandboxMods();
    } catch (e: any) {
      useStore.getState().pushStatus(`Failed to delete: ${e}`, "error");
    }
  };

  const searchFilter = (m: any) => {
    if (searchTerm && !m.name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    const nameLower = m.name?.toLowerCase() || "";
    return (
      !nameLower.endsWith(".ini") &&
      !nameLower.endsWith(".cfg") &&
      !nameLower.endsWith(".json") &&
      !nameLower.endsWith(".txt")
    );
  };

  const buildSandboxFamilies = (rawList: any[]) => {
    void familyRefreshTick;
    const getVersionStrippedBaseAndExt = (rawName: string) => {
      const fileName = (rawName || "").split(/[\\/]/).pop() || "";
      const extMatch = fileName.match(/(\.[^/.]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : "";
      const withoutExt = fileName.replace(/\.[^/.]+$/, "");
      const strippedVer = withoutExt.replace(/[_\-\s]+v?\d+(\.\d+)+[a-z]?$/i, "").toLowerCase();
      return `${strippedVer}::${ext}`;
    };

    const byFileIdentity = new Map<string, any[]>();
    for (const item of rawList) {
      const key = getVersionStrippedBaseAndExt(item.name);
      if (!byFileIdentity.has(key)) byFileIdentity.set(key, []);
      byFileIdentity.get(key)!.push(item);
    }

    const dedupedVersionsList: any[] = [];
    for (const [, versionsOfSameFile] of byFileIdentity.entries()) {
      if (versionsOfSameFile.length === 1) {
        dedupedVersionsList.push(versionsOfSameFile[0]);
      } else {
        const sorted = [...versionsOfSameFile].sort((a, b) =>
          String(b.name).localeCompare(String(a.name))
        );
        dedupedVersionsList.push({
          ...sorted[0],
          _olderVersions: sorted.slice(1),
        });
      }
    }

    if (!groupFamilies) {
      return {
        families: [] as Array<{ key: string; title: string; coreMod: any; modules: any[] }>,
        standalone: dedupedVersionsList,
      };
    }

    let savedLocalOverrides: Record<string, any> = {};
    try {
      savedLocalOverrides = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
    } catch {}

    const getFamilyStem = (rawName: string) => {
      const fileName = (rawName || "").split(/[\\/]/).pop() || "";
      return fileName
        .replace(/\.[^/.]+$/, "")
        .replace(/[_\-\s]+v?\d+(\.\d+)+[a-z]?$/i, "")
        .replace(/(_scripts|_script|_addon|_part\d+|_hq|_nonhq)$/i, "")
        .toLowerCase();
    };

    const parentMap = new Map<string, { parentKey: string; role: string }>();

    for (const item of dedupedVersionsList) {
      const ov = item.hash ? savedLocalOverrides[item.hash] : null;
      if (ov?.local_parent_rel?.parent_id) {
        parentMap.set(item.hash, {
          parentKey: ov.local_parent_rel.parent_id,
          role: ov.local_parent_rel.relationship_type || "addon",
        });
      }
      if (Array.isArray(ov?.local_child_rels)) {
        for (const cr of ov.local_child_rels) {
          const childKey = cr.child_id || cr.mod?.hash || cr.mod?.id;
          if (childKey) {
            parentMap.set(childKey, {
              parentKey: item.hash,
              role: cr.relationship_type || "addon",
            });
          }
        }
      }
    }

    for (const rel of cloudRelRows) {
      parentMap.set(rel.child_id, {
        parentKey: rel.parent_id,
        role: rel.relationship_type || "addon",
      });
    }

    const stemGroups = new Map<string, any[]>();
    const explicitlyChildHashes = new Set<string>();
    const explicitChildrenByParent = new Map<string, any[]>();

    for (const item of dedupedVersionsList) {
      const cloudMod = item.hash ? hashToModMap.get(item.hash) : null;
      const explicitLink =
        parentMap.get(item.hash) || (cloudMod?.id ? parentMap.get(cloudMod.id) : undefined);
      if (explicitLink) {
        const parentItem = dedupedVersionsList.find(
          (cand) =>
            cand.hash === explicitLink.parentKey ||
            (cand.hash && hashToModMap.get(cand.hash)?.id === explicitLink.parentKey)
        );
        if (parentItem && parentItem.hash !== item.hash) {
          explicitlyChildHashes.add(item.hash);
          if (!explicitChildrenByParent.has(parentItem.hash)) {
            explicitChildrenByParent.set(parentItem.hash, []);
          }
          explicitChildrenByParent.get(parentItem.hash)!.push({
            ...item,
            _familyRole: explicitLink.role,
          });
          continue;
        }
      }
    }

    for (const item of dedupedVersionsList) {
      if (explicitlyChildHashes.has(item.hash)) continue;
      const stem = getFamilyStem(item.name);
      if (!stemGroups.has(stem)) stemGroups.set(stem, []);
      stemGroups.get(stem)!.push(item);
    }

    const families: Array<{ key: string; title: string; coreMod: any; modules: any[] }> = [];
    const standalone: any[] = [];

    for (const [stem, members] of stemGroups.entries()) {
      const sortedMembers = [...members].sort((a, b) => {
        const aPkg = String(a.name).toLowerCase().endsWith(".package") ? 0 : 1;
        const bPkg = String(b.name).toLowerCase().endsWith(".package") ? 0 : 1;
        return aPkg - bPkg;
      });
      const coreMod = sortedMembers[0];
      const stemSiblings = sortedMembers.slice(1).map((sib) => ({
        ...sib,
        _familyRole: String(sib.name).toLowerCase().endsWith(".ts4script") ? "twin" : "addon",
      }));
      const explicitKids = explicitChildrenByParent.get(coreMod.hash) || [];
      const allModules = [...stemSiblings, ...explicitKids];

      if (allModules.length > 0) {
        const cleanTitle = ((coreMod.name || "").split(/[\\/]/).pop() || stem).replace(/\.[^/.]+$/, "");
        families.push({
          key: coreMod.hash || stem,
          title: cleanTitle,
          coreMod: {
            ...coreMod,
            _familyRole: "core",
            _familyChildrenCount: allModules.length,
            _siblingFiles: allModules,
          },
          modules: allModules,
        });
      } else {
        standalone.push(coreMod);
      }
    }

    return { families, standalone };
  };

  // All local Sandbox files (grouped into single parent cards when groupFamilies is enabled)
  const sandboxGroupedAll = useMemo(
    () => buildSandboxFamilies(sandboxMods),
    [sandboxMods, groupFamilies, cloudRelRows, familyRefreshTick]
  );

  const filteredSandboxMods = useMemo(() => {
    if (!groupFamilies) {
      return sandboxMods.filter((m) => searchFilter(m));
    }
    const matchedFamilies = sandboxGroupedAll.families
      .filter((fam) => searchFilter(fam.coreMod) || fam.modules.some((modItem) => searchFilter(modItem)))
      .map((fam) => fam.coreMod);
    const matchedStandalone = sandboxGroupedAll.standalone.filter((m) => searchFilter(m));
    return [...matchedFamilies, ...matchedStandalone];
  }, [sandboxMods, sandboxGroupedAll, groupFamilies, searchTerm]);

  // All Nexus Cloud Mods (filtered & grouped into single parent cards when groupFamilies is enabled)
  const filteredNexusMods = useMemo(() => {
    const myModById = new Map<string, any>();
    for (const m of existingMods) {
      myModById.set(m.id, m);
    }
    const validIds = new Set(existingMods.map((m) => m.id));
    const { childToRootMap, childrenByRootId } = buildFamilyHierarchy(cloudRelRows, validIds);

    const matchesSearch = (mod: any) => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        (mod.name?.toLowerCase() || "").includes(q) ||
        (mod.id || "").toLowerCase().includes(q)
      );
    };

    return existingMods
      .filter((mod) => {
        const childInfo = childToRootMap.get(mod.id);
        // Collapse child family modules into their Root Core Mod card when groupFamilies is active
        if (groupFamilies && childInfo && myModById.has(childInfo.rootId)) {
          return false;
        }
        if (statusFilter !== "ALL") {
          if (statusFilter === "paid" && !mod.is_paid) return false;
          else if (statusFilter === "early_access" && !mod.is_early_access) return false;
          else if (statusFilter !== "paid" && statusFilter !== "early_access" && mod.status !== statusFilter)
            return false;
        }
        if (activeCategory !== "ALL") {
          const modCat = mod.category_override || "Script";
          if (modCat !== activeCategory) return false;
          if (activeCategory === "CAS" && activeSubType !== "ALL") {
            if ((mod.sub_type || "").toLowerCase() !== activeSubType.toLowerCase()) return false;
          }
        }
        if (searchTerm) {
          const childIds = childrenByRootId.get(mod.id);
          const kids = childIds ? Array.from(childIds).map((id) => myModById.get(id)).filter(Boolean) : [];
          return matchesSearch(mod) || (groupFamilies && kids.some((k) => matchesSearch(k)));
        }
        return true;
      })
      .map((mod) => {
        const childInfo = childToRootMap.get(mod.id);
        const childSet = childrenByRootId.get(mod.id);
        const count = childSet ? childSet.size : 0;
        const tickets = openTicketMap.get(mod.id) || [];
        return {
          ...mod,
          _familyChildrenCount: count,
          _familyRole: childInfo ? childInfo.type : count > 0 ? "core" : undefined,
          _parentId: childInfo?.rootId,
          _openTickets: tickets,
        };
      });
  }, [existingMods, cloudRelRows, openTicketMap, groupFamilies, statusFilter, activeCategory, activeSubType, searchTerm]);

  // Flagged Mods (unstable, corrupted, under_review, or open citizen bug/flag reports)
  const flaggedMods = useMemo(() => {
    return filteredNexusMods.filter(
      (m) =>
        m.status === "unstable" ||
        m.status === "corrupted" ||
        m.status === "under_review" ||
        (m._openTickets && m._openTickets.length > 0)
    );
  }, [filteredNexusMods]);

  // 4 Top StatTileCarousel Tabs
  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: "dashboard",
      number: String(filteredSandboxMods.length + (isVerifiedMason ? filteredNexusMods.length : 0)),
    },
    {
      id: "sandbox",
      label: t("mason_mods_tab_sandbox", "Sandbox (Local)"),
      icon: "science",
      number: String(filteredSandboxMods.length),
    },
    ...(isVerifiedMason
      ? [
          {
            id: "nexus",
            label: t("mason_mods_tab_nexus", "Nexus Uploads"),
            icon: "cloud_done",
            number: String(filteredNexusMods.length),
          },
          {
            id: "flagged",
            label: t("mason_mods_tab_flagged", "Flagged & Issues"),
            icon: "warning",
            number: String(flaggedMods.length),
          },
        ]
      : []),
  ];

  const renderSandboxCard = (mod: any) => {
    const isSynced = existingHashes.has(mod.hash);
    const savedAll = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
    const savedLocal = savedAll[mod.hash] || {};
    const cleanName = (savedLocal.name || mod.name || "").split(/[\\/]/).pop() || mod.name;
    const extMatch = String(mod.name || "").match(/\.[a-z0-9]+$/i);
    const ext = mod.file_extension || (extMatch ? extMatch[0].toLowerCase() : ".package");
    const versionCount = (mod._olderVersions?.length || 0) + 1;
    const childCount =
      typeof mod._familyChildrenCount === "number"
        ? mod._familyChildrenCount
        : Array.isArray(savedLocal.local_child_rels)
          ? savedLocal.local_child_rels.length
          : 0;

    const cardMod = {
      ...mod,
      ...savedLocal,
      id: mod.hash,
      name: cleanName,
      status: isSynced ? "synced" : (savedLocal.status || "local"),
      _isLocalSandbox: true,
      _isSyncedSandbox: isSynced,
      _familyChildrenCount: childCount,
      file_extension: ext,
      category_override:
        savedLocal.category_override ||
        mod.category_override ||
        (ext === ".ts4script" ? "Script" : "Package"),
      mod_versions: versionCount > 1 ? Array.from({ length: versionCount }) : [],
    };

    return (
      <ArtifactCard
        key={mod.hash}
        mod={cardMod}
        activeModId={activeMod?.hash || activeMod?.id}
        onClick={() => openSandboxMod(mod)}
      />
    );
  };

  const renderLanding = () => {
    const recentSandboxSlice = filteredSandboxMods.slice(0, isVerifiedMason ? 2 : 4);
    const recentNexusSlice = isVerifiedMason ? filteredNexusMods.slice(0, 2) : [];
    const hasRecent = recentSandboxSlice.length > 0 || recentNexusSlice.length > 0;

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_schedule", "schedule")}
          iconColorClass="text-[var(--accent)]"
          title={t("chameleons_overview_recent", "Recent")}
          isEmpty={!hasRecent}
          emptyIcon={t("icon_deployed_code", "deployed_code")}
          emptyTitle={t("registry_no_mods", "No {Mods} Found")}
          gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {recentSandboxSlice.map((mod) => renderSandboxCard(mod))}
          {recentNexusSlice.map((mod: any) => (
            <ArtifactCard
              key={mod.id}
              mod={mod}
              activeModId={activeMod?.id}
              onClick={() => openCloudMod(mod)}
            />
          ))}
        </HubOverviewSection>

        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("chameleons_overview_anomalies", "Anomalies")}
          isEmpty={flaggedMods.length === 0}
          emptyIcon={t("icon_check_circle", "check_circle")}
          emptyTitle={t("no_issues", "No issues detected")}
          gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {flaggedMods.slice(0, 4).map((mod: any) => (
            <ArtifactCard
              key={mod.id}
              mod={mod}
              activeModId={activeMod?.id}
              onClick={() => openCloudMod(mod)}
            />
          ))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderNexusUploadsView = (listToRender: any[]) => {
    if (listToRender.length === 0) {
      return (
        <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <EmptyState
            icon={t("icon_deployed_code", "deployed_code")}
            title={t("registry_no_mods", "No {Mods} Found")}
            className="py-12"
          />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500 pr-2">
        {listToRender.slice(0, 80).map((mod: any) => (
          <ArtifactCard
            key={mod.id}
            mod={mod}
            activeModId={activeMod?.id}
            onClick={() => openCloudMod(mod)}
          />
        ))}
      </div>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("term_mods", "Mods & Artifacts")}
      headerIcon="deployed_code"
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("search_ph", "Search {mods}...") as string}
      tabs={tabs}
      activeTab={hubTab}
      onTabChange={(id) => setHubTab(id as any)}
      hideSearch={hubTab === "overview"}
      actions={[
        {
          id: "static_polling_guide",
          icon: t("icon_menu_book", "menu_book"),
          label: t("studio_static_guide_btn", "Static Polling Guide") as string,
          onClick: () => setIsStaticGuideOpen(true),
        },
        {
          id: "toggle_group_families",
          icon: groupFamilies ? "account_tree" : "view_module",
          label: groupFamilies
            ? t("studio_group_families", "Group {Mod} Families")
            : t("studio_flat_list", "Flat List"),
          onClick: () => setGroupFamilies(!groupFamilies),
        },
        ...(vaultPath
          ? [
              {
                id: "import",
                icon: (
                  <span
                    className={`material-symbols-outlined !text-[20px] ${isImporting ? "animate-spin" : ""}`}
                  >
                    {isImporting ? "refresh" : "download"}
                  </span>
                ),
                label: (isImporting
                  ? t("btn_importing", "Importing")
                  : t("btn_import", "Import")) as string,
                onClick: () => {
                  if (!isImporting) handleImportToSandbox();
                },
              },
            ]
          : []),
      ]}
      primaryPopover={
        hubTab === "nexus" || hubTab === "flagged"
          ? {
              icon: "tune",
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("category", "Category")}
                    </span>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      disableTint={true}
                      value={activeCategory}
                      onChange={(val: string[]) => {
                        setActiveCategory(val[0]);
                        setActiveSubType("ALL");
                      }}
                      options={[
                        { id: "ALL", label: t("filter_all", "All") },
                        ...(useStore.getState().activeGameSchema?.mod_categories || []).map((c: any) => ({
                          id: c.id,
                          label: t(c.lexicon_key, c.id),
                        })),
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("status", "Status")}
                    </span>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      disableTint={true}
                      value={statusFilter}
                      onChange={(val: string[]) => setStatusFilter(val[0])}
                      options={[
                        { id: "ALL", label: t("filter_all", "All") },
                        { id: "stable", label: t("status_stable", "Stable") },
                        { id: "under_review", label: t("status_dd_review", "Under Review") },
                        { id: "pending", label: t("pending", "Pending") },
                        { id: "unstable", label: t("label_unstable", "Unstable") },
                        { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                      ]}
                    />
                  </div>
                </div>
              ),
            }
          : undefined
      }
    >
      {isLoading && hubTab === "sandbox" ? (
        <div className="flex justify-center items-center h-40 opacity-50 capitalize font-black tracking-widest text-[var(--text)]">
          {t("scanning", "Scanning...")}
        </div>
      ) : hubTab === "overview" ? (
        renderLanding()
      ) : hubTab === "sandbox" ? (
        <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {filteredSandboxMods.length === 0 ? (
            <EmptyState
              icon={t("icon_folder_off", "folder_off")}
              title={t("empty", "Empty")}
              className="col-span-full py-16"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pr-2">
              {filteredSandboxMods.map((mod) => renderSandboxCard(mod))}
            </div>
          )}
        </div>
      ) : hubTab === "flagged" ? (
        renderNexusUploadsView(flaggedMods)
      ) : (
        renderNexusUploadsView(filteredNexusMods)
      )}

      {isEditorOpen && activeMod && (
        <SidePanel
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          title={
            editorMode === "registry"
              ? t("ui_edit_metadata", "Edit Metadata")
              : t("artifact_config", "{Mod} Config")
          }
          subtitle={
            editorMode === "registry"
              ? `UUID: ${activeMod?.id}`
              : `${t("hash_prefix", "HASH:")} ${formatDisplayHash(activeMod?.hash)}`
          }
          icon={editorMode === "registry" ? "inventory_2" : "settings"}
          widthClass="w-[94vw] max-w-[1280px]"
          backdropZ="z-[50000]"
          panelZ="z-[50001]"
          noScroll
          noPadding
          headerActions={
            <PanelHeaderGroup>
              {editorMode === "sandbox" && (
                <>
                  <PanelHeaderButton
                    icon={t("icon_menu_book", "menu_book")}
                    onClick={() => setIsStaticGuideOpen(true)}
                    tooltip={t("studio_static_guide_btn", "Static Polling Guide")}
                  />
                  <PanelHeaderButton
                    icon="move_to_inbox"
                    onClick={handleExportRelease}
                    disabled={isCommitting}
                    tooltip={t("btn_export_release", "Export Release")}
                  />
                  <PanelHeaderButton
                    icon="delete"
                    onClick={handlePurge}
                    disabled={isCommitting}
                    tooltip={confirmPurge ? t("ui_confirm_delete", "Confirm") : t("purge", "Purge")}
                    variant="danger"
                  />
                  {isVerifiedMason && (
                    <PanelHeaderButton
                      icon={requireMasonLabTest && !isActiveModLabVerified ? "lock" : "sync"}
                      onClick={handleSyncToNetwork}
                      disabled={isCommitting || (requireMasonLabTest && !isActiveModLabVerified)}
                      tooltip={
                        requireMasonLabTest && !isActiveModLabVerified
                          ? t("lab_tooltip_publish_locked", "Publish Locked (Lab Test Required)")
                          : isCommitting
                            ? t("btn_syncing", "Syncing...")
                            : t("sandbox_btn_sync", "Sync to Network")
                      }
                      variant="accent"
                    />
                  )}
                </>
              )}
              {editorMode === "registry" && (
                <PanelHeaderButton
                  icon="save"
                  tooltip={t("save_meta", "Save Changes")}
                  onClick={handleSaveCloudModChanges}
                  disabled={isCommitting}
                  variant="accent"
                />
              )}
            </PanelHeaderGroup>
          }
        >
          <ArtifactWorkspace
            mode={editorMode}
            activeTab={studioTab}
            onTabChange={setStudioTab}
            mod={activeMod}
            onUpdateMod={setActiveMod}
            masonId={masonId}
            masonName={masonName}
            isVerifiedMason={isVerifiedMason}
            vaultPath={vaultPath}
            allMyMods={existingMods}
            sandboxMods={sandboxMods}
            onSwitchMod={(target) =>
              target.isLocalSandbox ? openSandboxMod(target) : openCloudMod(target)
            }
            onRefreshParentList={() => {
              setFamilyRefreshTick((n) => n + 1);
              fetchExistingMods();
            }}
            onExportRelease={editorMode === "sandbox" ? handleExportRelease : undefined}
            onSyncToNetwork={editorMode === "sandbox" ? handleSyncToNetwork : undefined}
            onSaveCloudChanges={editorMode === "registry" ? handleSaveCloudModChanges : undefined}
            isCommitting={isCommitting}
            isAlreadySynced={Boolean(activeMod.hash && existingHashes.has(activeMod.hash))}
          >
            <div className="flex flex-col gap-6 pb-4">
              <SidePanelTitleInput
                value={(activeMod.name || "").split(/[\\/]/).pop() || activeMod.name || ""}
                onChange={(val) =>
                  setActiveMod({
                    ...activeMod,
                    physical_path: activeMod.physical_path || activeMod.name,
                    name: val,
                  })
                }
                placeholder={t("label_modname", "{Mod} Name")}
              />

              {editorMode === "sandbox" && (
                <LabVerificationGate
                  dnaHash={activeMod.hash}
                  modName={
                    (activeMod.name || "Sandbox Artifact").split(/[\\/]/).pop() || "Sandbox Artifact"
                  }
                  physicalPath={activeMod.physical_path || activeMod.name}
                  isSandboxMod={true}
                  roleContext="mason"
                  isGateRequired={requireMasonLabTest}
                  onStatusChange={(st) => setIsActiveModLabVerified(st.verified)}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("category", "Category")}
                  </label>
                  <CustomClassificationDropdown
                    value={activeMod.category_override || "Script"}
                    onChange={(val: string) => setActiveMod({ ...activeMod, category_override: val })}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("label_subclass", "Subcategory")}
                  </label>
                  <input
                    value={activeMod.sub_type || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, sub_type: e.target.value })}
                    placeholder={t("placeholder_subclass", "Subcategory")}
                    className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("label_mason_version", "{Mason} Version")}
                  </label>
                  <input
                    value={activeMod.latest_version || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, latest_version: e.target.value })}
                    placeholder={t("ph_mod_version", "1.0.0")}
                    className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent"
                  />
                </div>

                <div className="flex flex-col gap-2 md:col-span-3">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("upload_desc", "Description")}
                  </label>
                  <textarea
                    value={activeMod.description || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, description: e.target.value })}
                    className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold min-h-[96px] custom-scrollbar resize-none focus:outline-none focus:theme-border-accent"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("cc_cover_url", "Cover URL")}
                  </label>
                  <input
                    value={activeMod.image_url || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, image_url: e.target.value })}
                    className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("ui_url", "URL")}
                  </label>
                  <input
                    value={activeMod.url || ""}
                    onChange={(e) => setActiveMod({ ...activeMod, url: e.target.value })}
                    className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("label_condition", "Status")}
                  </label>
                  <MasonStatusDropdown
                    value={activeMod.status || "unverified"}
                    onChange={(newStatus: string) => setActiveMod({ ...activeMod, status: newStatus })}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("registry_col_safety", "Safety Tier")}
                  </label>
                  <CustomComplianceDropdown
                    value={activeMod.compliance_tier || 0}
                    onChange={(newTier: number) =>
                      setActiveMod({ ...activeMod, compliance_tier: newTier })
                    }
                    maxTier={4}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("uploaded_date", "Uploaded Date")}
                  </label>
                  <CustomDatePicker
                    value={activeMod.created_at || null}
                    onChange={(date) => setActiveMod({ ...activeMod, created_at: date })}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("updated_date", "Updated Date")}
                  </label>
                  <CustomDatePicker
                    value={activeMod.updated_at || null}
                    onChange={(date) => setActiveMod({ ...activeMod, updated_at: date })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-full">
                  <SidePanelPillToggle
                    checked={activeMod.is_paid || false}
                    onChange={(checked) => setActiveMod({ ...activeMod, is_paid: checked })}
                    label={t("label_is_paid", "Paid {Mod}")}
                    icon="monetization_on"
                    variant="warning"
                  />
                  <SidePanelPillToggle
                    checked={activeMod.is_early_access || false}
                    onChange={(checked) => setActiveMod({ ...activeMod, is_early_access: checked })}
                    label={t("badge_early_access", "Early Access")}
                    icon="science"
                    variant="accent"
                  />
                </div>

                <div className="flex flex-col gap-2 col-span-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("game_versions", "Game Versions")}
                  </label>
                  <GameVersionMultiSelect
                    selectedVersions={activeMod.compatible_versions || []}
                    onChange={(v) => setActiveMod({ ...activeMod, compatible_versions: v })}
                  />
                </div>
              </div>
            </div>
          </ArtifactWorkspace>
        </SidePanel>
      )}

      <StaticPollingGuideSidePanel
        isOpen={isStaticGuideOpen}
        onClose={() => setIsStaticGuideOpen(false)}
        mod={activeMod}
        masonName={masonName}
      />
    </ElevatedHubLayout>
  );
}
