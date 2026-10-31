import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readDir, writeTextFile, exists, remove } from "@tauri-apps/plugin-fs";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { logArchitectAction } from "../lib/audit";
import { StructureNode } from "../ModStructureBuilder";
import { useWorkbenchFiles } from "../workbench/hooks/useWorkbenchFiles";
import { useWorkbenchEditor } from "../workbench/hooks/useWorkbenchEditor";
import { useWorkbenchLayout } from "../workbench/hooks/useWorkbenchLayout";
import {
  StudioTabId,
  isUuid,
  formatDisplayHash,
  parseDLCList,
  flattenStructureNodesToPaths,
  fetchAllTableRows,
  buildFamilyHierarchy,
} from "./artifact-studio/artifactStudioUtils";
import { ArtifactVersionHistorySection } from "./artifact-studio/EditableVersionHistoryCard";
import { ArtifactEntryChoice } from "./artifact-studio/ArtifactEntryChoice";
import { ArtifactFilesTab } from "./artifact-studio/ArtifactFilesTab";
import { ArtifactRulesTab } from "./artifact-studio/ArtifactRulesTab";
import { ArtifactIdeDrawer } from "./artifact-studio/ArtifactIdeDrawer";

export {
  type StudioTabId,
  isUuid,
  formatDisplayHash,
  parseDLCList,
  flattenStructureNodesToPaths,
};

interface ArtifactWorkspaceProps {
  mode: "registry" | "sandbox";
  activeTab: StudioTabId;
  onTabChange: (tab: StudioTabId) => void;
  mod: any;
  onUpdateMod: (updated: any) => void;
  masonId?: string;
  masonName?: string;
  isVerifiedMason?: boolean;
  vaultPath?: string;
  allMyMods?: any[];
  sandboxMods?: any[];
  onSwitchMod?: (targetMod: any) => void;
  onRefreshParentList?: () => void;
  onExportRelease?: () => void;
  onSyncToNetwork?: () => void;
  onSaveCloudChanges?: () => void;
  onOpenLinkExisting?: () => void;
  isCommitting?: boolean;
  isAlreadySynced?: boolean;
  children: React.ReactNode;
}

export function ArtifactWorkspace({
  mode,
  activeTab,
  onTabChange,
  mod,
  onUpdateMod,
  masonId,
  isVerifiedMason = false,
  vaultPath,
  allMyMods = [],
  sandboxMods = [],
  onSwitchMod,
  onRefreshParentList,
  onExportRelease,
  onSyncToNetwork,
  onSaveCloudChanges,
  isCommitting = false,
  isAlreadySynced = false,
  children,
}: ArtifactWorkspaceProps) {
  const { t } = useLexicon();
  const isCloudMod = Boolean(isUuid(mod?.id) && isVerifiedMason);

  const normalizedTab: "overview" | "files" | "rules" = useMemo(() => {
    if (activeTab === "files" || activeTab === "family" || activeTab === "structure") return "files";
    if (activeTab === "rules" || activeTab === "conflicts" || activeTab === "release") return "rules";
    return "overview";
  }, [activeTab]);

  // Entry Choice screen state for unlinked Sandbox files
  const [showEntryChoice, setShowEntryChoice] = useState<boolean>(false);
  const [entryLinkMode, setEntryLinkMode] = useState<"version" | "module">("version");
  const [entryModuleRole, setEntryModuleRole] = useState<"twin" | "addon" | "flavor" | "beta">("twin");
  const [entryTargetMod, setEntryTargetMod] = useState<any | null>(null);
  const [isPullingFromTarget, setIsPullingFromTarget] = useState<boolean>(false);

  // Catalog & DLC Registry
  const [catalogMods, setCatalogMods] = useState<any[]>([]);
  const [dlcRegistry, setDlcRegistry] = useState<any[]>([]);
  const [myCollections, setMyCollections] = useState<any[]>([]);
  const [localSandboxFiles, setLocalSandboxFiles] = useState<any[]>(sandboxMods || []);
  const [modTickets, setModTickets] = useState<any[]>([]);

  // Active Mod Links
  const [parentRel, setParentRel] = useState<any | null>(null);
  const [childRels, setChildRels] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [assignedCollectionIds, setAssignedCollectionIds] = useState<Set<string>>(new Set());
  const [localCollectionNames, setLocalCollectionNames] = useState<string[]>([]);
  const [versions, setVersions] = useState<any[]>([]);

  // Config files & Sanctuary Workbench IDE state
  const [sandboxConfigFiles, setSandboxConfigFiles] = useState<Array<{ name: string; path: string }>>([]);
  const [attachedConfigNames, setAttachedConfigNames] = useState<string[]>([]);
  const [excludedConfigNames, setExcludedConfigNames] = useState<string[]>([]);
  const [newConfigNameInput, setNewConfigNameInput] = useState("");
  const [newConfigExt, setNewConfigExt] = useState(".cfg");
  const [showNewConfigForm, setShowNewConfigForm] = useState(false);
  const [showParentLinkPicker, setShowParentLinkPicker] = useState(false);
  const [familyRoleFilter, setFamilyRoleFilter] = useState<"ALL" | "twin" | "addon" | "flavor" | "beta">("ALL");
  const [familySearchFilter, setFamilySearchFilter] = useState("");
  const [newFamilyRole, setNewFamilyRole] = useState<"twin" | "addon" | "flavor" | "beta">("twin");

  const cwSelectedFile = useStore((state) => state.cwSelectedFile);
  const cwUnsavedEdits = useStore((state) => state.cwUnsavedEdits);
  const hasUnsavedIdeChanges = Boolean(
    cwSelectedFile && cwUnsavedEdits[cwSelectedFile.path] !== undefined
  );
  const wbFileState = useWorkbenchFiles({ mainTab: "CONFIGS", mainSearchQuery: "" });
  const wbEditorState = useWorkbenchEditor();
  const wbLayoutState = useWorkbenchLayout({
    editorRef: wbEditorState.editorRef,
    previewMode: "off",
    isTemplateMode: false,
  });
  const [wbShowTimeline, setWbShowTimeline] = useState<boolean>(false);

  // Form states for Conflicts, Collections, Versions, Structure
  const [conflictSeverity, setConflictSeverity] = useState<number>(4);
  const [newCollectionName, setNewCollectionName] = useState<string>("");
  const [showAddVersionModal, setShowAddVersionModal] = useState(false);
  const [selectedSandboxVersionHash, setSelectedSandboxVersionHash] = useState<string>("");
  const [manualVersionHash, setManualVersionHash] = useState<string>("");
  const [newVersionLabel, setNewVersionLabel] = useState<string>("");
  const [isSavingStructure, setIsSavingStructure] = useState(false);

  useEffect(() => {
    if (mode !== "sandbox" || !mod?.hash) {
      setShowEntryChoice(false);
      return;
    }
    const savedAll = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
    const saved = savedAll[mod.hash] || {};
    const alreadyConfigured =
      isAlreadySynced ||
      Boolean(mod.id) ||
      Boolean(saved.setup_choice_completed) ||
      Boolean(saved.local_parent_rel) ||
      (Array.isArray(saved.local_child_rels) && saved.local_child_rels.length > 0);
    setShowEntryChoice(!alreadyConfigured);
    setEntryTargetMod(null);
    const lowerName = String(mod.name || "").toLowerCase();
    setEntryModuleRole(lowerName.endsWith(".ts4script") ? "twin" : "addon");
  }, [mode, mod?.hash, isAlreadySynced]);

  const scanSandboxConfigs = async () => {
    if (!vaultPath) return;
    try {
      const normalizedVault = vaultPath.replace(/\\/g, "/");
      let baseDir = normalizedVault;
      if (baseDir.toLowerCase().endsWith("/mods")) {
        baseDir = baseDir.substring(0, baseDir.length - 5);
      } else if (baseDir.toLowerCase().endsWith("mods")) {
        baseDir = baseDir.substring(0, baseDir.length - 4);
      }
      const sandboxDir = `${baseDir}/Dev/Sandbox`;
      const dirExists = await exists(sandboxDir);
      if (!dirExists) {
        setSandboxConfigFiles([]);
        return;
      }
      const entries = await readDir(sandboxDir);
      const found: Array<{ name: string; path: string }> = [];
      for (const entry of entries) {
        if (!entry.isDirectory && entry.name) {
          const n = entry.name.toLowerCase();
          if (
            n === "manifest.json" ||
            n === "override.json" ||
            n === "resource.cfg" ||
            /^[a-z]{2}-.+\.json$/i.test(entry.name)
          ) {
            continue;
          }
          if (
            n.endsWith(".cfg") ||
            n.endsWith(".ini") ||
            n.endsWith(".json") ||
            n.endsWith(".xml") ||
            n.endsWith(".txt")
          ) {
            found.push({ name: entry.name, path: `${sandboxDir}/${entry.name}` });
          }
        }
      }
      found.sort((a, b) => a.name.localeCompare(b.name));
      setSandboxConfigFiles(found);
    } catch {
      // ignore fs errors on web
    }
  };

  useEffect(() => {
    scanSandboxConfigs();
    if (sandboxMods && sandboxMods.length > 0) {
      setLocalSandboxFiles(sandboxMods);
      return;
    }
    if (vaultPath) {
      invoke("scan_sandbox", { vaultPath })
        .then((res: any) => {
          if (Array.isArray(res)) setLocalSandboxFiles(res);
        })
        .catch(() => {});
    }
  }, [vaultPath, sandboxMods]);

  useEffect(() => {
    let mounted = true;
    const fetchGlobals = async () => {
      try {
        const [{ data: dlcs }, catMods] = await Promise.all([
          supabase.from("dlc_registry").select("id, name, type, release_date").order("id"),
          fetchAllTableRows(
            supabase,
            "mods",
            "id, name, master_author, mason_id, latest_version, sub_type, file_extension, image_url, category_override, description, url, is_paid, is_early_access, requiredDLC, folder_structure",
            "name"
          ),
        ]);
        if (!mounted) return;
        if (dlcs) setDlcRegistry(dlcs);
        if (catMods) setCatalogMods(catMods);

        let colQuery = supabase
          .from("collections")
          .select("id, name, mason_id, is_official, set_type, compliance_tier, image_url, url")
          .order("name");
        if (isUuid(masonId)) {
          colQuery = colQuery.eq("mason_id", masonId);
        } else {
          colQuery = colQuery.limit(100);
        }
        const { data: cols } = await colQuery;
        if (mounted && cols) setMyCollections(cols);
      } catch (e) {
        console.error("ArtifactWorkspace global load error:", e);
      }
    };
    fetchGlobals();
    return () => {
      mounted = false;
    };
  }, [masonId]);

  useEffect(() => {
    if (!mod?.id || !isUuid(mod.id)) {
      setModTickets([]);
      return;
    }
    let active = true;
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
      ])
      .then(({ data }) => {
        if (!active || !data) return;
        const matched = data.filter((tk: any) => {
          const targetId = tk.target_mod_id || tk.metadata?.target_mod_id;
          return targetId === mod.id;
        });
        setModTickets(matched);
      });
    return () => {
      active = false;
    };
  }, [mod?.id]);

  const myModCandidates = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of allMyMods) {
      if (m?.id && m.id !== mod?.id) map.set(String(m.id), m);
    }
    for (const m of catalogMods) {
      if (m.id !== mod?.id && (!masonId || m.mason_id === masonId || mode === "registry")) {
        map.set(String(m.id), m);
      }
    }
    for (const sb of localSandboxFiles) {
      const key = sb.id || sb.hash || sb.name;
      const lower = String(sb.name || "").toLowerCase();
      if (
        lower.endsWith(".cfg") ||
        lower.endsWith(".ini") ||
        lower.endsWith(".json") ||
        lower.endsWith(".txt")
      ) {
        continue;
      }
      if (key && sb.hash !== mod?.hash && key !== mod?.id) {
        if (!map.has(String(key))) {
          map.set(String(key), {
            id: sb.id || sb.hash,
            hash: sb.hash,
            name: (sb.name || "").split(/[\\/]/).pop() || sb.name,
            latest_version: sb.latest_version || "1.0.0",
            file_extension: sb.file_extension,
            isLocalSandbox: true,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [allMyMods, catalogMods, localSandboxFiles, masonId, mode, mod?.id, mod?.hash]);

  const allConflictAndDepCandidates = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of myModCandidates) {
      map.set(String(m.id || m.hash), m);
    }
    for (const m of catalogMods) {
      if (m.id !== mod?.id) {
        map.set(String(m.id), m);
      }
    }
    return Array.from(map.values());
  }, [myModCandidates, catalogMods, mod?.id]);

  const loadModLinks = async () => {
    if (!mod) return;

    const savedAll = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
    const savedLocal = (mod.hash && savedAll[mod.hash]) || (mod.id && savedAll[mod.id]) || {};
    setAttachedConfigNames(Array.isArray(savedLocal.attached_configs) ? savedLocal.attached_configs : []);
    setExcludedConfigNames(Array.isArray(savedLocal.excluded_configs) ? savedLocal.excluded_configs : []);

    if (isCloudMod) {
      try {
        const [relsRes, depsRes, confsRes, colsRes, versRes] = await Promise.all([
          supabase
            .from("mod_relationships")
            .select("id, parent_id, child_id, relationship_type")
            .or(`parent_id.eq.${mod.id},child_id.eq.${mod.id}`),
          supabase
            .from("mod_dependencies")
            .select("*")
            .eq("child_id", mod.id),
          supabase
            .from("logical_conflicts")
            .select("id, mod_a_id, mod_b_id, severity_rank, resolution_note, status")
            .or(`mod_a_id.eq.${mod.id},mod_b_id.eq.${mod.id}`),
          supabase.from("collection_members").select("id, set_id, mod_id").eq("mod_id", mod.id),
          supabase
            .from("mod_versions")
            .select("id, dna_hash, version_label, game_version, created_at")
            .eq("mod_id", mod.id)
            .order("created_at", { ascending: false }),
        ]);

        // Expand connected family cluster up to 2 additional hops so opening Core (.package),
        // Twin (.ts4script), or Add-on always retrieves the entire connected mod family!
        const clusterRelsMap = new Map<string, any>();
        const clusterNodeIds = new Set<string>([mod.id]);
        for (const r of relsRes.data || []) {
          if (r?.id) clusterRelsMap.set(r.id, r);
          if (r?.parent_id && isUuid(r.parent_id)) clusterNodeIds.add(r.parent_id);
          if (r?.child_id && isUuid(r.child_id)) clusterNodeIds.add(r.child_id);
        }

        for (let hop = 0; hop < 2; hop++) {
          const idsArr = Array.from(clusterNodeIds).filter(isUuid);
          if (idsArr.length <= 1) break;
          const idList = idsArr.join(",");
          const { data: moreRels } = await supabase
            .from("mod_relationships")
            .select("id, parent_id, child_id, relationship_type")
            .or(`parent_id.in.(${idList}),child_id.in.(${idList})`);
          let addedNewNode = false;
          for (const r of moreRels || []) {
            if (r?.id) clusterRelsMap.set(r.id, r);
            if (r?.parent_id && isUuid(r.parent_id) && !clusterNodeIds.has(r.parent_id)) {
              clusterNodeIds.add(r.parent_id);
              addedNewNode = true;
            }
            if (r?.child_id && isUuid(r.child_id) && !clusterNodeIds.has(r.child_id)) {
              clusterNodeIds.add(r.child_id);
              addedNewNode = true;
            }
          }
          if (!addedNewNode) break;
        }

        const allClusterRels = Array.from(clusterRelsMap.values());

        // Directly fetch all referenced mods by UUID so lookupMod NEVER falls back to 8-char UUIDs
        const referencedIds = new Set<string>();
        for (const id of clusterNodeIds) {
          if (isUuid(id)) referencedIds.add(id);
        }
        for (const d of depsRes.data || []) {
          if (d?.parent_id && isUuid(d.parent_id)) referencedIds.add(d.parent_id);
        }
        for (const c of confsRes.data || []) {
          if (c?.mod_a_id && isUuid(c.mod_a_id)) referencedIds.add(c.mod_a_id);
          if (c?.mod_b_id && isUuid(c.mod_b_id)) referencedIds.add(c.mod_b_id);
        }

        const directModMap = new Map<string, any>();
        if (referencedIds.size > 0) {
          const { data: fetchedMods } = await supabase
            .from("mods")
            .select(
              "id, name, master_author, mason_id, latest_version, sub_type, file_extension, image_url, category_override, description, url, is_paid, is_early_access, requiredDLC, folder_structure, status, compliance_tier, compatible_versions"
            )
            .in("id", Array.from(referencedIds));
          for (const fm of fetchedMods || []) {
            if (fm?.id) directModMap.set(fm.id, fm);
          }
        }

        const lookupMod = (id: string) =>
          directModMap.get(id) ||
          allConflictAndDepCandidates.find((c) => c.id === id) ||
          allMyMods.find((c) => c.id === id) ||
          catalogMods.find((c) => c.id === id) || { id, name: id.slice(0, 8) };

        const { getRootParentId } = buildFamilyHierarchy(allClusterRels);
        const rootParentId = getRootParentId(mod.id);
        const directParentRow = allClusterRels.find((r) => r.child_id === mod.id && r.parent_id !== mod.id);

        if (directParentRow) {
          const resolvedParentId = rootParentId !== mod.id ? rootParentId : directParentRow.parent_id;
          setParentRel({
            ...directParentRow,
            parent_id: resolvedParentId,
            mod: lookupMod(resolvedParentId),
          });
        } else {
          setParentRel(null);
        }

        // Gather all family module relationships in this cluster (excluding self and root parent)
        const excludedParentId = directParentRow
          ? rootParentId !== mod.id
            ? rootParentId
            : directParentRow.parent_id
          : null;
        const seenChildIds = new Set<string>([mod.id]);
        if (excludedParentId) seenChildIds.add(excludedParentId);

        const cRows: any[] = [];
        for (const r of allClusterRels) {
          if (!r?.child_id || r.child_id === r.parent_id) continue;
          if (seenChildIds.has(r.child_id)) continue;
          seenChildIds.add(r.child_id);
          cRows.push({
            ...r,
            mod: lookupMod(r.child_id),
          });
        }
        cRows.sort((a, b) => {
          const aTwin = a.relationship_type === "twin" ? 0 : 1;
          const bTwin = b.relationship_type === "twin" ? 0 : 1;
          if (aTwin !== bTwin) return aTwin - bTwin;
          return String(a.mod?.name || "").localeCompare(String(b.mod?.name || ""));
        });
        setChildRels(cRows);

        if (depsRes.data) {
          setDependencies(
            depsRes.data.map((d) => ({
              ...d,
              mod: d.parent_id ? lookupMod(d.parent_id) : { id: d.id, name: d.dependency_name || "Required Mod" },
            }))
          );
        }

        if (confsRes.data) {
          setConflicts(
            confsRes.data.map((c) => {
              const otherId = c.mod_a_id === mod.id ? c.mod_b_id : c.mod_a_id;
              return { ...c, enemyMod: lookupMod(otherId) };
            })
          );
        }

        if (colsRes.data) {
          setAssignedCollectionIds(new Set(colsRes.data.map((c) => c.set_id)));
        }

        if (versRes.data) {
          setVersions(versRes.data);
        }
      } catch (e) {
        console.error("Failed loading cloud mod studio links:", e);
      }
    } else {
      setParentRel(mod.local_parent_rel || null);
      if (Array.isArray(mod.local_child_rels) && mod.local_child_rels.length > 0) {
        setChildRels(mod.local_child_rels);
      } else if (Array.isArray(mod._siblingFiles) && mod._siblingFiles.length > 0) {
        const autoSeeded = mod._siblingFiles.map((sf: any, idx: number) => ({
          id: `local_rel_seed_${sf.hash || idx}`,
          parent_id: mod.id || mod.hash,
          child_id: sf.id || sf.hash,
          relationship_type: sf._familyRole || "twin",
          mod: sf,
        }));
        setChildRels(autoSeeded);
      } else {
        setChildRels([]);
      }
      setDependencies(Array.isArray(mod.local_dependencies) ? mod.local_dependencies : []);
      setConflicts(Array.isArray(mod.local_conflicts) ? mod.local_conflicts : []);
      setLocalCollectionNames(
        typeof mod.collections_str === "string" && mod.collections_str.trim()
          ? mod.collections_str
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : []
      );
      if (Array.isArray(mod.local_versions) && mod.local_versions.length > 0) {
        setVersions(mod.local_versions);
      } else if (mod.hash) {
        const autoVersions = [
          {
            id: mod.hash,
            dna_hash: mod.hash,
            version_label: mod.latest_version || "1.0.0",
            file_name: (mod.name || "").split(/[\\/]/).pop(),
            game_version: Array.isArray(mod.compatible_versions) ? mod.compatible_versions.join(", ") : "",
          },
          ...(Array.isArray(mod._olderVersions)
            ? mod._olderVersions.map((ov: any) => ({
                id: ov.hash,
                dna_hash: ov.hash,
                version_label: ov.latest_version || "0.9",
                file_name: (ov.name || "").split(/[\\/]/).pop(),
              }))
            : []),
        ];
        setVersions(autoVersions);
      }
    }
  };

  useEffect(() => {
    loadModLinks();
  }, [mod?.id, mod?.hash, isCloudMod, catalogMods.length]);

  const persistLocalSandboxConfig = (patch: Record<string, any>) => {
    if (!mod?.hash && !mod?.id) return;
    const key = mod.hash || mod.id;
    const saved = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
    const current = saved[key] || {};
    const merged = { ...current, ...patch };
    saved[key] = merged;
    localStorage.setItem("sanctuary_sandbox_configs", JSON.stringify(saved));

    const updatedMod = { ...mod, ...patch };
    if (patch.local_child_rels !== undefined) {
      const twinHashes = patch.local_child_rels
        .filter((r: any) => r.relationship_type === "twin")
        .map((r: any) => r.mod?.hash || r.mod?.name)
        .filter(Boolean);
      const addonHashes = patch.local_child_rels
        .filter((r: any) => r.relationship_type === "addon" || r.relationship_type === "beta")
        .map((r: any) => r.mod?.hash || r.mod?.name)
        .filter(Boolean);
      const flavorHashes = patch.local_child_rels
        .filter((r: any) => r.relationship_type === "flavor")
        .map((r: any) => r.mod?.hash || r.mod?.name)
        .filter(Boolean);
      updatedMod.twins_str = twinHashes.join(", ");
      updatedMod.companion_hashes_str = twinHashes.join(", ");
      updatedMod.addons_str = addonHashes.join(", ");
      updatedMod.flavors_str = flavorHashes.join(", ");
    }
    if (patch.local_dependencies !== undefined) {
      updatedMod.dependencies_str = patch.local_dependencies
        .map((d: any) => d.mod?.hash || d.mod?.name || d.dependency_name)
        .filter(Boolean)
        .join(", ");
    }
    if (patch.local_conflicts !== undefined) {
      updatedMod.conflicts_str = patch.local_conflicts
        .map((c: any) => c.enemyMod?.hash || c.enemyMod?.name)
        .filter(Boolean)
        .join(", ");
    }
    if (patch.collections !== undefined) {
      updatedMod.collections_str = patch.collections.join(", ");
    }
    if (patch.folder_structure_nodes !== undefined) {
      updatedMod.folder_structure = patch.folder_structure_nodes;
      updatedMod.injected_folders_str = flattenStructureNodesToPaths(patch.folder_structure_nodes).join(", ");
    }
    if (patch.local_versions !== undefined) {
      updatedMod.previous_hashes_str = patch.local_versions
        .map((v: any) => v.dna_hash)
        .filter((h: string) => h && h !== mod.hash)
        .join(", ");
    }
    onUpdateMod(updatedMod);
    if (onRefreshParentList) onRefreshParentList();
  };

  const handlePullFromExistingMod = async () => {
    if (!entryTargetMod) return;
    setIsPullingFromTarget(true);
    try {
      let targetFull = entryTargetMod;
      let targetDeps: any[] = [];
      let targetConfs: any[] = [];
      let targetRels: any[] = [];
      let targetCols: string[] = [];
      let targetVersions: any[] = [];

      if (isUuid(entryTargetMod.id)) {
        const [modRes, relsRes, depsRes, confsRes, colsRes, versRes] = await Promise.all([
          supabase.from("mods").select("*").eq("id", entryTargetMod.id).single(),
          supabase
            .from("mod_relationships")
            .select("id, parent_id, child_id, relationship_type")
            .eq("parent_id", entryTargetMod.id),
          supabase
            .from("mod_dependencies")
            .select("*")
            .eq("child_id", entryTargetMod.id),
          supabase
            .from("logical_conflicts")
            .select("id, mod_a_id, mod_b_id, severity_rank, resolution_note, status")
            .or(`mod_a_id.eq.${entryTargetMod.id},mod_b_id.eq.${entryTargetMod.id}`),
          supabase.from("collection_members").select("id, set_id, mod_id").eq("mod_id", entryTargetMod.id),
          supabase
            .from("mod_versions")
            .select("id, dna_hash, version_label, game_version, created_at")
            .eq("mod_id", entryTargetMod.id)
            .order("created_at", { ascending: false }),
        ]);

        if (modRes.data) targetFull = modRes.data;
        const lookupMod = (id: string) =>
          allConflictAndDepCandidates.find((c) => c.id === id) || { id, name: id.slice(0, 8) };

        if (relsRes.data) {
          targetRels = relsRes.data
            .filter((r) => r.child_id !== entryTargetMod.id)
            .map((r) => ({ ...r, mod: lookupMod(r.child_id) }));
        }
        if (depsRes.data) {
          targetDeps = depsRes.data.map((d) => ({
            ...d,
            mod: d.parent_id ? lookupMod(d.parent_id) : { id: d.id, name: d.dependency_name || "Required Mod" },
          }));
        }
        if (confsRes.data) {
          targetConfs = confsRes.data.map((c) => {
            const otherId = c.mod_a_id === entryTargetMod.id ? c.mod_b_id : c.mod_a_id;
            return { ...c, enemyMod: lookupMod(otherId) };
          });
        }
        if (colsRes.data) {
          const colSet = new Set(colsRes.data.map((c) => c.set_id));
          targetCols = myCollections.filter((mc) => colSet.has(mc.id)).map((mc) => mc.name);
          setAssignedCollectionIds(colSet);
        }
        if (versRes.data) {
          targetVersions = versRes.data;
        }
      } else {
        const savedAll = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
        const savedTarget = savedAll[entryTargetMod.hash || entryTargetMod.id] || {};
        targetFull = { ...entryTargetMod, ...savedTarget };
        targetRels = savedTarget.local_child_rels || [];
        targetDeps = savedTarget.local_dependencies || [];
        targetConfs = savedTarget.local_conflicts || [];
        targetCols = savedTarget.collections || [];
        targetVersions = savedTarget.local_versions || [];
      }

      if (entryLinkMode === "version") {
        const nextVers = [
          {
            id: mod.hash,
            dna_hash: mod.hash,
            version_label: mod.latest_version || targetFull.latest_version || "1.0.0",
            file_name: (mod.name || "").split(/[\\/]/).pop(),
            game_version: "",
          },
          ...targetVersions.filter((v) => v.dna_hash !== mod.hash),
        ];

        const dlcArr = parseDLCList(targetFull.requiredDLC);
        const structNodes = Array.isArray(targetFull.folder_structure) ? targetFull.folder_structure : [];

        setChildRels(targetRels);
        setDependencies(targetDeps);
        setConflicts(targetConfs);
        setLocalCollectionNames(targetCols);
        setVersions(nextVers);

        persistLocalSandboxConfig({
          setup_choice_completed: true,
          setup_mode: "linked_version",
          id: isUuid(targetFull.id) ? targetFull.id : undefined,
          name: targetFull.name || mod.name,
          physical_path: mod.physical_path || mod.name,
          category_override: targetFull.category_override || "Script",
          sub_type: targetFull.sub_type || "",
          description: targetFull.description || "",
          image_url: targetFull.image_url || "",
          url: targetFull.url || "",
          status: targetFull.status || "stable",
          is_paid: Boolean(targetFull.is_paid),
          is_early_access: Boolean(targetFull.is_early_access),
          requiredDLC: dlcArr,
          compatible_versions: [],
          folder_structure: structNodes,
          folder_structure_nodes: structNodes,
          local_child_rels: targetRels,
          local_dependencies: targetDeps,
          local_conflicts: targetConfs,
          collections: targetCols,
          local_versions: nextVers,
        });
        setShowEntryChoice(false);
        onTabChange("overview");
        useStore
          .getState()
          .pushStatus(
            t("studio_entry_autopulled_toast", "Pulled previous version info! Select the new Game Version below."),
            "success"
          );
      } else {
        const pObj = {
          id: `local_parent_${Date.now()}`,
          parent_id: targetFull.id || targetFull.hash,
          child_id: mod.id || mod.hash,
          relationship_type: entryModuleRole,
          mod: targetFull,
        };
        setParentRel(pObj);

        if (targetFull.hash || targetFull.id) {
          const pKey = targetFull.hash || targetFull.id;
          const savedAll = JSON.parse(localStorage.getItem("sanctuary_sandbox_configs") || "{}");
          const pSaved = savedAll[pKey] || {};
          const existingKids = Array.isArray(pSaved.local_child_rels) ? pSaved.local_child_rels : [];
          const filteredKids = existingKids.filter(
            (k: any) => (k.child_id || k.mod?.hash) !== (mod.hash || mod.id)
          );
          pSaved.local_child_rels = [
            ...filteredKids,
            {
              id: `local_rel_${Date.now()}`,
              parent_id: pKey,
              child_id: mod.hash || mod.id,
              relationship_type: entryModuleRole,
              mod: {
                id: mod.id || mod.hash,
                hash: mod.hash,
                name: (mod.name || "").split(/[\\/]/).pop() || mod.name,
              },
            },
          ];
          savedAll[pKey] = pSaved;
          localStorage.setItem("sanctuary_sandbox_configs", JSON.stringify(savedAll));
        }

        const dlcArr = parseDLCList(targetFull.requiredDLC);
        persistLocalSandboxConfig({
          setup_choice_completed: true,
          setup_mode: "companion_module",
          local_parent_rel: pObj,
          category_override: targetFull.category_override || mod.category_override || "Script",
          requiredDLC: dlcArr,
        });
        setShowEntryChoice(false);
        onTabChange("files");
        useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
      }
    } finally {
      setIsPullingFromTarget(false);
    }
  };

  const getAuthToken = () => useStore.getState().session?.access_token || "";

  // Handlers: Family Modules
  const handleLinkChildModule = async (childMod: any, role: "twin" | "addon" | "flavor" | "beta") => {
    if (!childMod) return;
    if (isCloudMod && isUuid(childMod.id)) {
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_relationships",
        p_payload: {
          parent_id: mod.id,
          child_id: childMod.id,
          relationship_type: role,
        },
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const next = [
        ...childRels.filter((r) => (r.child_id || r.mod?.hash) !== (childMod.id || childMod.hash)),
        {
          id: `local_rel_${Date.now()}`,
          parent_id: mod.id || mod.hash,
          child_id: childMod.id || childMod.hash,
          relationship_type: role,
          mod: childMod,
        },
      ];
      setChildRels(next);
      persistLocalSandboxConfig({ local_child_rels: next });
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
    }
  };

  const handleChangeChildRole = async (rel: any, newRole: "twin" | "addon" | "flavor" | "beta") => {
    if (isCloudMod && rel.id && !String(rel.id).startsWith("local_")) {
      await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_relationships",
        p_payload: {
          id: rel.id,
          parent_id: rel.parent_id || mod.id,
          child_id: rel.child_id,
          relationship_type: newRole,
        },
      });
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const next = childRels.map((r) => (r.id === rel.id ? { ...r, relationship_type: newRole } : r));
      setChildRels(next);
      persistLocalSandboxConfig({ local_child_rels: next });
    }
  };

  const handleUnlinkChildModule = async (rel: any) => {
    if (isCloudMod && rel.id && !String(rel.id).startsWith("local_")) {
      await supabase.rpc("secure_delete_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_relationships",
        p_id: rel.id,
      });
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const next = childRels.filter((r) => r.id !== rel.id);
      setChildRels(next);
      persistLocalSandboxConfig({ local_child_rels: next });
    }
  };

  const handleSetParentMod = async (parentCandidate: any, role: "twin" | "addon" | "flavor" | "beta") => {
    if (!parentCandidate) return;
    if (isCloudMod && isUuid(parentCandidate.id)) {
      if (parentRel?.id && !String(parentRel.id).startsWith("local_")) {
        await supabase.rpc("secure_delete_cloud_file", {
          p_token: getAuthToken(),
          p_target: "mod_relationships",
          p_id: parentRel.id,
        });
      }
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_relationships",
        p_payload: {
          parent_id: parentCandidate.id,
          child_id: mod.id,
          relationship_type: role,
        },
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      setShowParentLinkPicker(false);
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const nextParent = {
        id: `local_parent_${Date.now()}`,
        parent_id: parentCandidate.id || parentCandidate.hash,
        child_id: mod.id || mod.hash,
        relationship_type: role,
        mod: parentCandidate,
      };
      setParentRel(nextParent);
      setShowParentLinkPicker(false);
      persistLocalSandboxConfig({ local_parent_rel: nextParent });
      if (onRefreshParentList) onRefreshParentList();
    }
  };

  const handleChangeParentRole = async (newRole: "twin" | "addon" | "flavor" | "beta") => {
    if (!parentRel) return;
    if (isCloudMod && parentRel.id && !String(parentRel.id).startsWith("local_")) {
      await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_relationships",
        p_payload: {
          id: parentRel.id,
          parent_id: parentRel.parent_id,
          child_id: parentRel.child_id || mod.id,
          relationship_type: newRole,
        },
      });
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const nextParent = { ...parentRel, relationship_type: newRole };
      setParentRel(nextParent);
      persistLocalSandboxConfig({ local_parent_rel: nextParent });
    }
  };

  const handleUnlinkParentMod = async () => {
    if (!parentRel) return;
    if (isCloudMod && parentRel.id && !String(parentRel.id).startsWith("local_")) {
      await supabase.rpc("secure_delete_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_relationships",
        p_id: parentRel.id,
      });
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      setParentRel(null);
      persistLocalSandboxConfig({ local_parent_rel: null });
      if (onRefreshParentList) onRefreshParentList();
    }
  };

  // Handlers: Configs & IDE
  const modStem = useMemo(() => {
    const raw = (mod?.name || "").split(/[\\/]/).pop() || "";
    return raw
      .replace(/\.[^/.]+$/, "")
      .replace(/[_\-\s]+v?\d+(\.\d+)+[a-z]?$/i, "")
      .toLowerCase();
  }, [mod?.name]);

  const linkedConfigFiles = useMemo(() => {
    const map = new Map<string, { name: string; path: string }>();
    const excludedSet = new Set(excludedConfigNames.map((n) => n.toLowerCase()));
    for (const cfg of sandboxConfigFiles) {
      if (excludedSet.has(cfg.name.toLowerCase())) continue;
      const cfgStem = cfg.name.replace(/\.[^/.]+$/, "").toLowerCase();
      if (
        (modStem && modStem.length >= 4 && (cfgStem === modStem || cfgStem.startsWith(modStem))) ||
        attachedConfigNames.includes(cfg.name)
      ) {
        map.set(cfg.name, cfg);
      }
    }
    for (const name of attachedConfigNames) {
      if (!excludedSet.has(name.toLowerCase()) && !map.has(name)) {
        const normalizedVault = (vaultPath || "").replace(/\\/g, "/").replace(/\/mods$/i, "");
        map.set(name, { name, path: `${normalizedVault}/Dev/Sandbox/${name}` });
      }
    }
    return Array.from(map.values());
  }, [sandboxConfigFiles, attachedConfigNames, excludedConfigNames, modStem, vaultPath]);

  const handleOpenConfigInIde = (cfg: { name: string; path: string }) => {
    wbFileState.openFile({ name: cfg.name, path: cfg.path });
  };

  const handleCreateAndOpenConfig = async () => {
    const cleanBase = (newConfigNameInput.trim() || modStem || "mod_settings").replace(/\.[^/.]+$/, "");
    const fileName = `${cleanBase}${newConfigExt}`;
    const normalizedVault = (vaultPath || "").replace(/\\/g, "/").replace(/\/mods$/i, "");
    const fullPath = `${normalizedVault}/Dev/Sandbox/${fileName}`;
    const starterContent =
      newConfigExt === ".json"
        ? "{\n  \"enabled\": true\n}\n"
        : `# Configuration for ${(mod?.name || "").split(/[\\/]/).pop() || cleanBase}\nEnabled = True\n`;

    try {
      if (vaultPath) {
        await writeTextFile(fullPath, starterContent);
      }
    } catch {
      // fallback to localStorage if fs write fails
    }

    const nextAttached = Array.from(new Set([...attachedConfigNames, fileName]));
    const nextExcluded = excludedConfigNames.filter((n) => n.toLowerCase() !== fileName.toLowerCase());
    setAttachedConfigNames(nextAttached);
    setExcludedConfigNames(nextExcluded);
    persistLocalSandboxConfig({
      attached_configs: nextAttached,
      excluded_configs: nextExcluded,
      config_contents: {
        ...(mod?.config_contents || {}),
        [fileName]: starterContent,
      },
    });
    setNewConfigNameInput("");
    setShowNewConfigForm(false);
    await scanSandboxConfigs();
    wbFileState.openFile({ name: fileName, path: fullPath });
  };

  const handleDetachConfig = (fileName: string) => {
    const nextAttached = attachedConfigNames.filter((n) => n.toLowerCase() !== fileName.toLowerCase());
    const nextExcluded = Array.from(new Set([...excludedConfigNames, fileName]));
    setAttachedConfigNames(nextAttached);
    setExcludedConfigNames(nextExcluded);
    persistLocalSandboxConfig({
      attached_configs: nextAttached,
      excluded_configs: nextExcluded,
    });
    useStore.getState().pushStatus(t("btn_saved", "Saved"), "info");
  };

  const handleDeleteConfigFile = async (cfg: { name: string; path?: string }) => {
    try {
      if (cfg.path) {
        await remove(cfg.path);
      }
    } catch {
      // ignore if file already removed on disk
    }
    if (cwSelectedFile?.name === cfg.name) {
      useStore.getState().setCwSelectedFile(null);
    }
    const nextAttached = attachedConfigNames.filter((n) => n.toLowerCase() !== cfg.name.toLowerCase());
    const nextExcluded = Array.from(new Set([...excludedConfigNames, cfg.name]));
    setAttachedConfigNames(nextAttached);
    setExcludedConfigNames(nextExcluded);
    persistLocalSandboxConfig({
      attached_configs: nextAttached,
      excluded_configs: nextExcluded,
    });
    await scanSandboxConfigs();
    useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
  };

  // Handlers: DLC, Dependencies, Conflicts, Collections, Structure, Versions
  const activeDlcIds = useMemo(() => parseDLCList(mod?.requiredDLC), [mod?.requiredDLC]);

  const handleToggleDlc = async (dlcId: string) => {
    const isAdded = activeDlcIds.includes(dlcId);
    const nextDlc = isAdded ? activeDlcIds.filter((id) => id !== dlcId) : [...activeDlcIds, dlcId];
    onUpdateMod({ ...mod, requiredDLC: nextDlc });
    if (isCloudMod) {
      await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mods",
        p_payload: { id: mod.id, name: mod.name, requiredDLC: nextDlc },
      });
      await logArchitectAction(
        "Updated DLC Protocols",
        "mods",
        mod.name || mod.id,
        undefined,
        mode === "registry" ? "Architect Console" : "Mason Workshop",
        false,
        {
          requiredDLC: { from: activeDlcIds, to: nextDlc },
        }
      );
    } else {
      persistLocalSandboxConfig({ requiredDLC: nextDlc });
    }
  };

  const handleAddDependencyDirect = async (depCandidate: any) => {
    if (!depCandidate) return;
    if (isCloudMod && isUuid(depCandidate.id)) {
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_dependencies",
        p_payload: {
          parent_id: depCandidate.id,
          child_id: mod.id,
        },
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      await loadModLinks();
    } else {
      const next = [
        ...dependencies,
        {
          id: `local_dep_${Date.now()}`,
          parent_id: depCandidate.id || depCandidate.hash,
          mod: depCandidate,
        },
      ];
      setDependencies(next);
      persistLocalSandboxConfig({ local_dependencies: next });
    }
  };

  const handleRemoveDependency = async (dep: any) => {
    if (isCloudMod && dep.id && !String(dep.id).startsWith("local_")) {
      await supabase.rpc("secure_delete_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_dependencies",
        p_id: dep.id,
      });
      await loadModLinks();
    } else {
      const next = dependencies.filter((d) => d.id !== dep.id);
      setDependencies(next);
      persistLocalSandboxConfig({ local_dependencies: next });
    }
  };

  const structureNodes: StructureNode[] = useMemo(() => {
    const parseRaw = (rawVal: any): StructureNode[] => {
      let val = rawVal;
      if (typeof val === "string") {
        try {
          val = JSON.parse(val);
        } catch {
          return [];
        }
      }
      if (Array.isArray(val) && val.length > 0) {
        if (typeof val[0] === "string") {
          return val.map((p: string, idx: number) => ({
            id: `folder_${idx}`,
            name: p,
            type: "folder" as const,
            children: [],
          }));
        }
        return val as StructureNode[];
      }
      return [];
    };

    const own = parseRaw(mod?.folder_structure || mod?.folder_structure_nodes);
    if (own.length > 0) return own;

    const fromParent = parseRaw(parentRel?.mod?.folder_structure);
    if (fromParent.length > 0) return fromParent;

    for (const rel of childRels) {
      const fromChild = parseRaw(rel?.mod?.folder_structure);
      if (fromChild.length > 0) return fromChild;
    }

    return [];
  }, [mod?.folder_structure, mod?.folder_structure_nodes, parentRel, childRels]);

  const handleStructureChange = (newNodes: StructureNode[]) => {
    const serializedNext = JSON.stringify(newNodes || []);
    if (
      serializedNext === JSON.stringify(structureNodes || []) &&
      serializedNext === JSON.stringify(mod?.folder_structure || mod?.folder_structure_nodes || [])
    ) {
      return;
    }
    if (isCloudMod) {
      if (serializedNext === JSON.stringify(mod?.folder_structure || [])) return;
      onUpdateMod({
        ...mod,
        folder_structure: newNodes,
        injected_folders_str: flattenStructureNodesToPaths(newNodes).join(", "),
      });
    } else {
      persistLocalSandboxConfig({ folder_structure_nodes: newNodes });
    }
  };

  const handleSaveCloudStructure = async () => {
    if (!isCloudMod) return;
    setIsSavingStructure(true);
    try {
      const targets: Array<{ id: string; name: string }> = [
        { id: mod.id, name: mod.name || "Mod" },
      ];
      if (parentRel?.parent_id && isUuid(parentRel.parent_id) && parentRel.mod?.name) {
        targets.push({ id: parentRel.parent_id, name: parentRel.mod.name });
      }
      for (const rel of childRels) {
        if (rel?.relationship_type === "twin" && isUuid(rel.child_id) && rel.mod?.name) {
          targets.push({ id: rel.child_id, name: rel.mod.name });
        }
      }
      for (const target of targets) {
        const { error } = await supabase.rpc("secure_upsert_cloud_file", {
          p_token: getAuthToken(),
          p_target: "mods",
          p_payload: {
            id: target.id,
            name: target.name,
            folder_structure: structureNodes,
          },
        });
        if (error) throw error;
      }
      await logArchitectAction(
        "Updated Mod Folder Structure",
        "mods",
        mod.name || mod.id,
        undefined,
        mode === "registry" ? "Architect Console" : "Mason Workshop",
        false,
        {
          folder_structure: {
            to: flattenStructureNodesToPaths(structureNodes),
          },
        }
      );
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
    } catch (e: any) {
      useStore.getState().pushStatus(e.message, "error");
    } finally {
      setIsSavingStructure(false);
    }
  };

  const handleAddConflictCard = async (targetEnemy: any) => {
    if (!targetEnemy) return;
    if (isCloudMod && isUuid(targetEnemy.id)) {
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "logical_conflicts",
        p_payload: {
          mod_a_id: mod.id,
          mod_b_id: targetEnemy.id,
          mod_a: mod.name,
          mod_b: targetEnemy.name,
          severity_rank: conflictSeverity,
          status: "pending",
        },
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
      await loadModLinks();
    } else {
      const next = [
        ...conflicts,
        {
          id: `local_conf_${Date.now()}`,
          severity_rank: conflictSeverity,
          resolution_note: "",
          enemyMod: targetEnemy,
        },
      ];
      setConflicts(next);
      persistLocalSandboxConfig({ local_conflicts: next });
    }
  };

  const handleRemoveConflict = async (conf: any) => {
    if (isCloudMod && conf.id && !String(conf.id).startsWith("local_")) {
      const { error } = await supabase.rpc("secure_delete_cloud_file", {
        p_token: getAuthToken(),
        p_target: "logical_conflicts",
        p_id: conf.id,
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      await loadModLinks();
    } else {
      const next = conflicts.filter((c) => c.id !== conf.id);
      setConflicts(next);
      persistLocalSandboxConfig({ local_conflicts: next });
    }
  };

  const handleToggleCloudCollection = async (colId: string) => {
    if (!isCloudMod) return;
    const isAssigned = assignedCollectionIds.has(colId);
    if (isAssigned) {
      const { data: existingMember } = await supabase
        .from("collection_members")
        .select("id")
        .match({ set_id: colId, mod_id: mod.id })
        .maybeSingle();
      if (existingMember?.id) {
        await supabase.rpc("secure_delete_cloud_file", {
          p_token: getAuthToken(),
          p_target: "collection_members",
          p_id: existingMember.id,
        });
      }
    } else {
      await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "collection_members",
        p_payload: { set_id: colId, mod_id: mod.id },
      });
    }
    await loadModLinks();
  };

  const handleAddCollectionQuick = async () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    if (isCloudMod && isUuid(masonId)) {
      const newColId = crypto.randomUUID();
      const newColPayload = {
        id: newColId,
        name: trimmed,
        mason_id: masonId,
        is_official: true,
        compliance_tier: 0,
      };
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "collections",
        p_payload: newColPayload,
      });
      if (!error) {
        setMyCollections((prev) => [...prev, newColPayload]);
        await supabase.rpc("secure_upsert_cloud_file", {
          p_token: getAuthToken(),
          p_target: "collection_members",
          p_payload: { set_id: newColId, mod_id: mod.id },
        });
        setNewCollectionName("");
        await loadModLinks();
      } else {
        useStore.getState().pushStatus(error.message, "error");
      }
    } else {
      const next = Array.from(new Set([...localCollectionNames, trimmed]));
      setLocalCollectionNames(next);
      setNewCollectionName("");
      persistLocalSandboxConfig({ collections: next });
    }
  };

  const handleAddVersionUnified = async () => {
    const targetHash = selectedSandboxVersionHash || manualVersionHash.trim();
    if (!targetHash) return;
    const sbFile = localSandboxFiles.find((f) => f.hash === targetHash);
    const label = newVersionLabel.trim() || mod.latest_version || "1.0.0";

    if (isCloudMod) {
      const { data: existingVer } = await supabase
        .from("mod_versions")
        .select("id")
        .eq("dna_hash", targetHash)
        .maybeSingle();
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_versions",
        p_payload: {
          id: existingVer?.id || crypto.randomUUID(),
          mod_id: mod.id,
          dna_hash: targetHash,
          version_label: label,
          game_version:
            Array.isArray(mod.compatible_versions) && mod.compatible_versions.length > 0
              ? mod.compatible_versions.join(", ")
              : null,
        },
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      if (selectedSandboxVersionHash) {
        await supabase.rpc("secure_upsert_cloud_file", {
          p_token: getAuthToken(),
          p_target: "mods",
          p_payload: {
            id: mod.id,
            name: mod.name,
            latest_version: label,
            updated_at: new Date().toISOString(),
          },
        });
        onUpdateMod({ ...mod, latest_version: label });
      }
      await logArchitectAction(
        "Added Mod Version",
        "mod_versions",
        mod.name || mod.id,
        undefined,
        mode === "registry" ? "Architect Console" : "Mason Workshop",
        false,
        {
          version_label: { from: mod.latest_version, to: label },
          dna_hash: { to: targetHash },
        }
      );
      setSelectedSandboxVersionHash("");
      setManualVersionHash("");
      setNewVersionLabel("");
      setShowAddVersionModal(false);
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const next = [
        {
          id: targetHash,
          dna_hash: targetHash,
          version_label: label,
          file_name: sbFile?.name,
          game_version: Array.isArray(mod.compatible_versions) ? mod.compatible_versions.join(", ") : "",
        },
        ...versions.filter((v) => v.dna_hash !== targetHash),
      ];
      setVersions(next);
      setSelectedSandboxVersionHash("");
      setManualVersionHash("");
      setNewVersionLabel("");
      setShowAddVersionModal(false);
      persistLocalSandboxConfig({ local_versions: next });
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
    }
  };

  const handleSaveVersionLabel = async (ver: any, newLabel: string) => {
    if (isCloudMod && ver.dna_hash) {
      let verId = ver.id;
      if (!isUuid(verId)) {
        const { data: existingVer } = await supabase
          .from("mod_versions")
          .select("id")
          .eq("dna_hash", ver.dna_hash)
          .maybeSingle();
        verId = existingVer?.id;
      }
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_versions",
        p_payload: {
          id: verId || crypto.randomUUID(),
          mod_id: mod.id,
          dna_hash: ver.dna_hash,
          version_label: newLabel,
          game_version: ver.game_version ?? null,
        },
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      await logArchitectAction(
        "Updated Mod Version Label",
        "mod_versions",
        mod.name || mod.id,
        undefined,
        mode === "registry" ? "Architect Console" : "Mason Workshop",
        false,
        {
          version_label: { from: ver.version_label, to: newLabel },
          dna_hash: { to: ver.dna_hash },
        }
      );
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const next = versions.map((v) => (v.dna_hash === ver.dna_hash ? { ...v, version_label: newLabel } : v));
      setVersions(next);
      persistLocalSandboxConfig({ local_versions: next });
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
    }
  };

  const handleSaveVersionGameVersions = async (ver: any, newGameVers: string[]) => {
    const joined = newGameVers.join(", ");
    if (isCloudMod && ver.dna_hash) {
      let verId = ver.id;
      if (!isUuid(verId)) {
        const { data: existingVer } = await supabase
          .from("mod_versions")
          .select("id")
          .eq("dna_hash", ver.dna_hash)
          .maybeSingle();
        verId = existingVer?.id;
      }
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: getAuthToken(),
        p_target: "mod_versions",
        p_payload: {
          id: verId || crypto.randomUUID(),
          mod_id: mod.id,
          dna_hash: ver.dna_hash,
          version_label: ver.version_label || mod.latest_version || "1.0.0",
          game_version: joined,
        },
      });
      if (error) {
        useStore.getState().pushStatus(error.message, "error");
        return;
      }
      await logArchitectAction(
        "Updated Mod Version Compatibility",
        "mod_versions",
        mod.name || mod.id,
        undefined,
        mode === "registry" ? "Architect Console" : "Mason Workshop",
        false,
        {
          game_version: { from: ver.game_version, to: joined },
          version_label: { to: ver.version_label || mod.latest_version || "1.0.0" },
        }
      );
      await loadModLinks();
    } else {
      const next = versions.map((v) => (v.dna_hash === ver.dna_hash ? { ...v, game_version: joined } : v));
      setVersions(next);
      persistLocalSandboxConfig({ local_versions: next });
    }
  };

  const handleDeleteVersionEntry = async (ver: any) => {
    if (isCloudMod && ver.dna_hash) {
      let verId = ver.id;
      if (!isUuid(verId)) {
        const { data: existingVer } = await supabase
          .from("mod_versions")
          .select("id")
          .eq("dna_hash", ver.dna_hash)
          .maybeSingle();
        verId = existingVer?.id;
      }
      if (verId) {
        const { error } = await supabase.rpc("secure_delete_cloud_file", {
          p_token: getAuthToken(),
          p_target: "mod_versions",
          p_id: verId,
        });
        if (error) {
          useStore.getState().pushStatus(error.message, "error");
          return;
        }
        await logArchitectAction(
          "Deleted Mod Version",
          "mod_versions",
          mod.name || mod.id,
          undefined,
          mode === "registry" ? "Architect Console" : "Mason Workshop",
          false,
          {
            version_label: { from: ver.version_label, to: null },
            dna_hash: { from: ver.dna_hash, to: null },
          }
        );
      }
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
      await loadModLinks();
      if (onRefreshParentList) onRefreshParentList();
    } else {
      const next = versions.filter((v) => v.dna_hash !== ver.dna_hash);
      setVersions(next);
      persistLocalSandboxConfig({ local_versions: next });
      useStore.getState().pushStatus(t("btn_saved", "Saved"), "success");
    }
  };

  const unlinkedSandboxVersionOptions = useMemo(() => {
    return localSandboxFiles
      .filter((f) => f.hash && f.hash !== mod?.hash && !versions.some((v) => v.dna_hash === f.hash))
      .map((f) => ({
        id: f.hash,
        label: `${(f.name || "").split(/[\\/]/).pop()} (${formatDisplayHash(f.hash)})`,
      }));
  }, [localSandboxFiles, mod?.hash, versions]);

  const isModFlagged =
    mod?.status === "corrupted" ||
    mod?.status === "broken" ||
    mod?.status === "rejected" ||
    mod?.status === "unstable" ||
    mod?.status === "under_review" ||
    mod?.status === "under review" ||
    modTickets.length > 0;

  const handleResolveSingleTicket = async (ticketId: string) => {
    try {
      await supabase
        .from("sanctuary_tickets")
        .update({ status: "RESOLVED" })
        .eq("id", ticketId);
      setModTickets((prev) => prev.filter((tk) => tk.id !== ticketId));
      useStore
        .getState()
        .pushStatus(t("flag_res_ticket_resolved_toast", "Bug report marked as resolved."), "success");
      if (onRefreshParentList) onRefreshParentList();
    } catch (e: any) {
      useStore.getState().pushStatus(e.message || "Error", "error");
    }
  };

  const handleResolveAndResubmitMod = async () => {
    try {
      if (modTickets.length > 0) {
        const ticketIds = modTickets.map((tk) => tk.id).filter(Boolean);
        if (ticketIds.length > 0) {
          await supabase
            .from("sanctuary_tickets")
            .update({ status: "RESOLVED" })
            .in("id", ticketIds);
        }
        setModTickets([]);
      }
      const nextMod = { ...mod, status: "stable", _openTickets: [] };
      onUpdateMod(nextMod);

      if (isCloudMod && isUuid(mod.id)) {
        const { error } = await supabase.rpc("secure_upsert_cloud_file", {
          p_token: getAuthToken(),
          p_target: "mods",
          p_payload: {
            id: mod.id,
            name: mod.name,
            category_override: mod.category_override || "Script",
            sub_type: mod.sub_type || null,
            description: mod.description || null,
            image_url: mod.image_url || null,
            url: mod.url || null,
            latest_version: mod.latest_version || "1.0.0",
            status: "stable",
            compliance_tier: mod.compliance_tier || 0,
            is_paid: Boolean(mod.is_paid),
            is_early_access: Boolean(mod.is_early_access),
            requiredDLC: mod.requiredDLC || [],
            compatible_versions: mod.compatible_versions || [],
          },
        });
        if (error) throw error;
      } else if (onSyncToNetwork) {
        await Promise.resolve(onSyncToNetwork());
      } else if (onSaveCloudChanges) {
        await Promise.resolve(onSaveCloudChanges());
      }

      if (onRefreshParentList) onRefreshParentList();
      useStore
        .getState()
        .pushStatus(
          t("flag_res_toast_success", "Updated and resubmitted! Active flag cleared."),
          "success"
        );
    } catch (e: any) {
      useStore.getState().pushStatus(e.message || "Error", "error");
    }
  };

  if (showEntryChoice && mode === "sandbox") {
    return (
      <ArtifactEntryChoice
        entryLinkMode={entryLinkMode}
        setEntryLinkMode={setEntryLinkMode}
        entryModuleRole={entryModuleRole}
        setEntryModuleRole={setEntryModuleRole}
        entryTargetMod={entryTargetMod}
        setEntryTargetMod={setEntryTargetMod}
        myModCandidates={myModCandidates}
        isPullingFromTarget={isPullingFromTarget}
        onStartNewMod={() => {
          persistLocalSandboxConfig({
            setup_choice_completed: true,
            setup_mode: "new_mod",
          });
          setShowEntryChoice(false);
          onTabChange("overview");
        }}
        onPullFromExistingMod={handlePullFromExistingMod}
      />
    );
  }

  const topTiles: Array<{ id: StudioTabId; label: string; icon: string }> = [
    { id: "overview", label: t("studio_tile_core", "Details & Versions"), icon: "tune" },
    { id: "files", label: t("studio_tile_files", "Files & Folders"), icon: "folder_open" },
    { id: "rules", label: t("studio_tile_rules", "Rules & Upload"), icon: "rocket_launch" },
  ];

  const unassignedCloudCollections = myCollections.filter((col) => !assignedCollectionIds.has(col.id));
  const assignedCloudCollections = myCollections.filter((col) => assignedCollectionIds.has(col.id));

  return (
    <div className="flex flex-col w-full h-full min-h-0 overflow-y-auto custom-scrollbar p-6 gap-6">
      {/* 3 Top Tiles — Clean Matte Surface */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        {topTiles.map((tile) => {
          const isActive = normalizedTab === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => onTabChange(tile.id)}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all duration-200 cursor-pointer group ${
                isActive
                  ? "glass-surface border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)]"
                  : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_16%,transparent)]"
              }`}
            >
              <span
                className={`material-symbols-outlined !text-[22px] transition-colors ${
                  isActive
                    ? "text-[var(--accent)]"
                    : "text-[var(--subtext)] group-hover:text-[var(--text)]"
                }`}
              >
                {tile.icon}
              </span>
              <span
                className={`text-[10px] font-black uppercase tracking-[0.18em] transition-colors text-center ${
                  isActive
                    ? "text-[var(--text)]"
                    : "text-[var(--subtext)] group-hover:text-[var(--text)]"
                }`}
              >
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* TILE 1: DETAILS & VERSIONS */}
      {normalizedTab === "overview" && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-6 pb-8">
          {isModFlagged && (
            <div className="p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] flex flex-col gap-4">
              <div className="flex items-start gap-3 pb-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_report_problem", "report_problem")}
                  </span>
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("flag_res_dossier_title", "Flag & Resolution Dossier")}
                    </h4>
                    <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_flag", "flag")}
                      </span>
                      {t("studio_flagged_status_reason", "Status:")}{" "}
                      {String(mod?.status || "flagged").toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                    {mod?.status === "corrupted" || mod?.status === "broken"
                      ? t(
                          "flag_res_mod_why_corrupted",
                          "This {Mod} was flagged as Corrupted due to critical game errors, broken script tuning, or patch incompatibility."
                        )
                      : mod?.status === "unstable"
                        ? t(
                            "flag_res_mod_why_unstable",
                            "This {Mod} was marked Unstable after compatibility warnings or minor gameplay glitches were reported."
                          )
                        : mod?.status === "under_review" || mod?.status === "under review"
                          ? t(
                              "flag_res_mod_why_review",
                              "This {Mod} is currently Under Review by Sanctuary moderation or automated compatibility checks."
                            )
                          : t(
                              "flag_res_mod_why_tickets",
                              "This {Mod} has open {Citizen} bug or compatibility reports awaiting {Mason} review."
                            )}
                  </p>
                </div>
              </div>

              {/* DIAGNOSTIC & REPORTS */}
              <div className="flex flex-col gap-2">
                {(mod?.status === "corrupted" ||
                  mod?.status === "broken" ||
                  mod?.status === "unstable" ||
                  mod?.status === "under_review" ||
                  mod?.status === "under review" ||
                  mod?.status === "rejected") && (
                  <div className="rounded-xl p-3 glass-surface border border-[color-mix(in_srgb,var(--danger)_24%,transparent)] flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_bug_report", "bug_report")}
                      </span>
                      {t("flag_res_mod_status_diag_label", "System Status Diagnostic")}
                    </span>
                    <p className="text-xs font-semibold text-[var(--text)] leading-relaxed">
                      {mod?.status === "corrupted" || mod?.status === "broken"
                        ? t(
                            "flag_res_mod_corrupted_detail",
                            "The current release hash is flagged as Corrupted. {Citizens} with this {Mod} installed receive a critical alert in their {Vault} until a patched version hash is published and status is restored to Stable."
                          )
                        : mod?.status === "unstable"
                          ? t(
                              "flag_res_mod_unstable_detail",
                              "The current release is marked Unstable. {Citizens} see a caution badge in their {Vault}. Verify compatibility with the latest game patch or attach a hotfix version below."
                            )
                          : t(
                              "flag_res_mod_review_detail",
                              "This {Mod} is awaiting verification of its metadata, safety tier, or release hash. Review the fields below and resubmit to restore Stable status."
                            )}
                    </p>
                  </div>
                )}

                {modTickets.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {modTickets.map((tk: any, idx: number) => {
                      const titleText =
                        tk.title ||
                        tk.subject ||
                        t("flag_res_ticket_default_title", "{Citizen} Issue Report");
                      const descText =
                        tk.description ||
                        tk.content ||
                        tk.steps ||
                        tk.reason ||
                        t("flag_res_legacy_reason", "No additional details were attached to this report.");
                      const reporterName =
                        tk.reporter_name ||
                        tk.author_name ||
                        tk.user_email ||
                        t("term_citizen", "{Citizen}");
                      const dateStr = tk.created_at
                        ? new Date(tk.created_at).toLocaleDateString()
                        : "";
                      return (
                        <div
                          key={tk.id || idx}
                          className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[9px] font-black uppercase tracking-widest text-[var(--danger)]">
                                {tk.status || t("flagged", "Flagged")}
                              </span>
                              <span className="text-xs font-black text-[var(--text)]">
                                {titleText}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-[var(--subtext)]">
                                {`${t("by_prefix", "By")} ${reporterName}${
                                  dateStr ? ` • ${dateStr}` : ""
                                }`}
                              </span>
                              {tk.id && (
                                <button
                                  type="button"
                                  onClick={() => handleResolveSingleTicket(tk.id)}
                                  className="px-2.5 py-1 rounded-lg glass-surface hover:bg-[color-mix(in_srgb,var(--success)_16%,transparent)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--success)] transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[12px]">
                                    {t("icon_check_circle", "check_circle")}
                                  </span>
                                  {t("flag_res_ticket_resolve_btn", "Resolve Ticket")}
                                </button>
                              )}
                            </div>
                          </div>
                          {descText && descText !== titleText && (
                            <p className="text-xs text-[var(--subtext)] leading-relaxed whitespace-pre-wrap">
                              {descText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RESOLUTION STEPS */}
              <div className="pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                    {t("icon_task_alt", "task_alt")}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                    {t("flag_res_sec_how", "3. How to Resolve & Resubmit")}
                  </span>
                </div>
                <ol className="flex flex-col gap-2 text-xs font-semibold text-[var(--subtext)] leading-relaxed list-none">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      {t(
                        "flag_res_mod_step_1",
                        "Review the diagnostic or {Citizen} bug report(s) above and test your updated {Mod} files in your {Lab}."
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      {t(
                        "flag_res_mod_step_2",
                        "Bump the {Mason} Version, verify compatible Game Versions, and link your patched file hash under Version History below."
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      {t(
                        "flag_res_mod_step_3",
                        "Click Resolve & Resubmit {Mod} below to close open tickets, set status back to Stable, and publish your fix."
                      )}
                    </span>
                  </li>
                </ol>
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleResolveAndResubmitMod}
                    disabled={isCommitting}
                    className="w-full justify-center px-4 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-xs font-black uppercase tracking-wider text-[var(--text)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                      {t("icon_published_with_changes", "published_with_changes")}
                    </span>
                    {t("flag_res_mod_btn_resolve", "Resolve & Resubmit {Mod}")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {children}

          <ArtifactVersionHistorySection
            versions={versions}
            showAddVersionModal={showAddVersionModal}
            setShowAddVersionModal={setShowAddVersionModal}
            unlinkedSandboxVersionOptions={unlinkedSandboxVersionOptions}
            selectedSandboxVersionHash={selectedSandboxVersionHash}
            setSelectedSandboxVersionHash={setSelectedSandboxVersionHash}
            manualVersionHash={manualVersionHash}
            setManualVersionHash={setManualVersionHash}
            newVersionLabel={newVersionLabel}
            setNewVersionLabel={setNewVersionLabel}
            onAddVersionUnified={handleAddVersionUnified}
            onSaveVersionLabel={handleSaveVersionLabel}
            onSaveVersionGameVersions={handleSaveVersionGameVersions}
            onDeleteVersionEntry={handleDeleteVersionEntry}
          />
        </div>
      )}

      {/* TILE 2: FILES & FOLDERS */}
      {normalizedTab === "files" && (
        <ArtifactFilesTab
          mod={mod}
          modStem={modStem}
          isCloudMod={isCloudMod}
          childRels={childRels}
          parentRel={parentRel}
          myModCandidates={myModCandidates}
          familyRoleFilter={familyRoleFilter}
          setFamilyRoleFilter={setFamilyRoleFilter}
          familySearchFilter={familySearchFilter}
          setFamilySearchFilter={setFamilySearchFilter}
          showParentLinkPicker={showParentLinkPicker}
          setShowParentLinkPicker={setShowParentLinkPicker}
          newFamilyRole={newFamilyRole}
          setNewFamilyRole={setNewFamilyRole}
          onSwitchMod={onSwitchMod}
          onLinkChildModule={handleLinkChildModule}
          onChangeChildRole={handleChangeChildRole}
          onUnlinkChildModule={handleUnlinkChildModule}
          onSetParentMod={handleSetParentMod}
          onChangeParentRole={handleChangeParentRole}
          onUnlinkParentMod={handleUnlinkParentMod}
          structureNodes={structureNodes}
          onStructureChange={handleStructureChange}
          isSavingStructure={isSavingStructure}
          onSaveCloudStructure={handleSaveCloudStructure}
          showNewConfigForm={showNewConfigForm}
          setShowNewConfigForm={setShowNewConfigForm}
          newConfigNameInput={newConfigNameInput}
          setNewConfigNameInput={setNewConfigNameInput}
          newConfigExt={newConfigExt}
          setNewConfigExt={setNewConfigExt}
          onCreateAndOpenConfig={handleCreateAndOpenConfig}
          linkedConfigFiles={linkedConfigFiles}
          onOpenConfigInIde={handleOpenConfigInIde}
          onDetachConfig={handleDetachConfig}
          onDeleteConfigFile={handleDeleteConfigFile}
        />
      )}

      {/* TILE 3: RULES & UPLOAD */}
      {normalizedTab === "rules" && (
        <ArtifactRulesTab
          mode={mode}
          mod={mod}
          isCloudMod={isCloudMod}
          isVerifiedMason={isVerifiedMason}
          isCommitting={isCommitting}
          dlcRegistry={dlcRegistry}
          activeDlcIds={activeDlcIds}
          onToggleDlc={handleToggleDlc}
          onClearAllDlc={() => {
            onUpdateMod({ ...mod, requiredDLC: [] });
            if (isCloudMod) {
              supabase.rpc("secure_upsert_cloud_file", {
                p_token: getAuthToken(),
                p_target: "mods",
                p_payload: { id: mod.id, name: mod.name, requiredDLC: [] },
              });
            } else {
              persistLocalSandboxConfig({ requiredDLC: [] });
            }
          }}
          dependencies={dependencies}
          allConflictAndDepCandidates={allConflictAndDepCandidates}
          onAddDependencyDirect={handleAddDependencyDirect}
          onRemoveDependency={handleRemoveDependency}
          conflicts={conflicts}
          conflictSeverity={conflictSeverity}
          setConflictSeverity={setConflictSeverity}
          onAddConflictCard={handleAddConflictCard}
          onRemoveConflict={handleRemoveConflict}
          unassignedCloudCollections={unassignedCloudCollections}
          assignedCloudCollections={assignedCloudCollections}
          localCollectionNames={localCollectionNames}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          onToggleCloudCollection={handleToggleCloudCollection}
          onAddCollectionQuick={handleAddCollectionQuick}
          onRemoveLocalCollection={(name) => {
            const next = localCollectionNames.filter((n) => n !== name);
            setLocalCollectionNames(next);
            persistLocalSandboxConfig({ collections: next });
          }}
          onChangeStaticManifestUrl={(url) => {
            onUpdateMod({ ...mod, static_manifest_url: url });
            persistLocalSandboxConfig({ static_manifest_url: url });
          }}
          onExportRelease={onExportRelease}
          onSyncToNetwork={onSyncToNetwork}
          onSaveCloudChanges={onSaveCloudChanges}
        />
      )}

      {/* CLEAN RAW-CODE IDE DRAWER */}
      <ArtifactIdeDrawer
        cwSelectedFile={cwSelectedFile}
        hasUnsavedIdeChanges={hasUnsavedIdeChanges}
        wbFileState={wbFileState}
        wbEditorState={wbEditorState}
        wbLayoutState={wbLayoutState}
        wbShowTimeline={wbShowTimeline}
        setWbShowTimeline={setWbShowTimeline}
      />
    </div>
  );
}
