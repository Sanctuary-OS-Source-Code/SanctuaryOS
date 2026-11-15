import React, { useState, useMemo, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  CustomDropdown,
  HoverTooltip,
  getExtensionRegex,
  isScriptExtension,
  openModDossier,
} from "./shared";

export interface StructureNode {
  id: string;
  name: string;
  type: "folder" | "file";
  assignedModId?: string;
  assignedModName?: string;
  shared?: boolean;
  children?: StructureNode[];
}

interface ModFileItem {
  id: string;
  name: string;
  role: "core" | "twin" | "addon" | "flavor" | "beta" | "config" | "orphan";
  ext: string;
  modId?: string;
  rawModName?: string;
  rawRef?: any;
  isOrphanNode?: boolean;
}

export interface ModStructureBuilderProps {
  structure: StructureNode[];
  onChange: (newStructure: StructureNode[]) => void;
  targetMod?: any;
  parentRel?: any;
  availableMods?: any[];
  familyMods?: any[];
  configFiles?: Array<{ name: string; path?: string }>;
  onOpenConfigInIde?: (cfg: { name: string; path: string }) => void;
  onDetachConfig?: (name: string) => void;
  onDeleteConfigFile?: (cfg: { name: string; path?: string }) => void;
  onChangeFamilyRole?: (rel: any, role: "twin" | "addon" | "flavor" | "beta") => void;
  onUnlinkFamilyMod?: (rel: any) => void;
  onOpenModDossier?: (modObj: any) => void;
  childRels?: any[];
}

const ROOT_MODS_ID = "__root_mods__";
const FALLBACK_TEXT_CONFIG_EXTS = new Set([
  ".cfg",
  ".ini",
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".xml",
  ".txt",
]);

const isFolderNode = (n: any): boolean =>
  n?.type === "folder" || n?.node_type === "folder" || Array.isArray(n?.children);

function isTextConfigExtension(ext: string, activeGameSchema?: any): boolean {
  const norm = (ext || "").toLowerCase();
  if (!norm) return false;
  if (FALLBACK_TEXT_CONFIG_EXTS.has(norm)) return true;
  const editableExts = activeGameSchema?.workbench?.editable_extensions;
  if (Array.isArray(editableExts)) {
    return editableExts.some((e: string) => {
      const s = String(e || "").trim().toLowerCase();
      return (s.startsWith(".") ? s : `.${s}`) === norm;
    });
  }
  return false;
}

function resolveModFileName(
  m: any,
  activeGameSchema?: any
): { fileName: string; ext: string; rawModName: string } {
  const defaultPrimaryExt =
    activeGameSchema?.extensions?.packages?.[0] ||
    activeGameSchema?.extensions?.supported?.[0] ||
    ".bin";
  const defaultScriptExt = activeGameSchema?.extensions?.scripts?.[0] || defaultPrimaryExt;
  const rawModName = String(m?.file_name || m?.name || "")
    .split(/[\\/]/)
    .pop()
    ?.trim() || "";
  if (!rawModName) return { fileName: "", ext: defaultPrimaryExt, rawModName: "" };

  const hasKnownExt = /\.[a-z0-9]{2,12}$/i.test(rawModName);
  if (hasKnownExt) {
    const dotIdx = rawModName.lastIndexOf(".");
    const ext = dotIdx !== -1 ? rawModName.slice(dotIdx).toLowerCase() : defaultPrimaryExt;
    return { fileName: rawModName, ext, rawModName };
  }

  const rawExt = String(
    m?.file_extension || (m?.is_script ? defaultScriptExt : defaultPrimaryExt)
  )
    .trim()
    .toLowerCase();
  const ext = rawExt ? (rawExt.startsWith(".") ? rawExt : `.${rawExt}`) : defaultPrimaryExt;
  return {
    fileName: `${rawModName}${ext}`,
    ext,
    rawModName,
  };
}

export default function ModStructureBuilder({
  structure,
  onChange,
  targetMod,
  parentRel,
  familyMods = [],
  configFiles = [],
  onOpenConfigInIde,
  onDetachConfig,
  onDeleteConfigFile,
  onChangeFamilyRole,
  onUnlinkFamilyMod,
  onOpenModDossier,
  childRels = [],
}: ModStructureBuilderProps) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [addingChildToFolderId, setAddingChildToFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [draggedFileName, setDraggedFileName] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const maxFolderDepth =
    typeof activeGameSchema?.constraints?.max_folder_depth === "number" &&
    activeGameSchema.constraints.max_folder_depth > 0
      ? activeGameSchema.constraints.max_folder_depth
      : undefined;

  const defaultModFolderName = useMemo(() => {
    const raw = (targetMod?.name || "").split(/[\\/]/).pop() || "";
    return (
      raw
        .replace(/\.[^/.]+$/, "")
        .replace(/[_\-\s]+v?\d+(\.\d+)+[a-z]?$/i, "")
        .trim() || "Folder"
    );
  }, [targetMod?.name]);

  const modFiles: ModFileItem[] = useMemo(() => {
    const list: ModFileItem[] = [];
    const seenNames = new Set<string>();
    const seenModIds = new Set<string>();

    const pushModItem = (
      modObj: any,
      role: ModFileItem["role"],
      rawRef?: any,
      isOrphanNode = false
    ) => {
      if (!modObj) return;
      const { fileName, ext, rawModName } = resolveModFileName(modObj, activeGameSchema);
      if (!fileName) return;
      const lower = fileName.toLowerCase();
      const manifestFile = String(activeGameSchema?.load_order?.manifest_file || "").toLowerCase();
      if (
        lower === ".sanctuary.manifest.json" ||
        lower === ".sanctuary.override.json" ||
        (manifestFile && lower === manifestFile)
      )
        return;
      const modId = modObj.id ? String(modObj.id) : undefined;
      if (modId && seenModIds.has(modId)) return;
      if (seenNames.has(lower)) return;
      seenNames.add(lower);
      if (modId) seenModIds.add(modId);

      list.push({
        id: lower,
        name: fileName,
        role,
        ext,
        modId,
        rawModName,
        rawRef: rawRef || modObj,
        isOrphanNode,
      });
    };

    if (parentRel?.mod?.name) {
      pushModItem(parentRel.mod, "core", parentRel.mod);
    }

    if (targetMod?.name) {
      const targetRole: ModFileItem["role"] = parentRel
        ? ((parentRel.relationship_type as ModFileItem["role"]) || "twin")
        : "core";
      pushModItem(targetMod, targetRole, targetMod);
    }

    for (const rel of childRels) {
      if (rel?.mod?.name) {
        const role = (rel.relationship_type as ModFileItem["role"]) || "addon";
        pushModItem(rel.mod, role, rel.mod);
      }
    }

    for (const fm of familyMods) {
      if (fm?.name) {
        pushModItem(fm, (fm._familyRole as ModFileItem["role"]) || "addon", fm);
      }
    }

    for (const cfg of configFiles) {
      if (!cfg?.name) continue;
      pushModItem(cfg, "config", cfg);
    }

    // Track saved structure file nodes that are no longer backed by active links/configs as removable orphans
    const walkExistingFiles = (nodes: any[]) => {
      for (const n of nodes || []) {
        if (!n) continue;
        if (isFolderNode(n)) {
          if (Array.isArray(n.children)) walkExistingFiles(n.children);
        } else if (n.name || n.assignedModName) {
          const rawNodeName = String(n.name || n.assignedModName).trim();
          if (!rawNodeName) continue;
          const matchedExisting = list.some(
            (item) =>
              (n.assignedModId && item.modId === String(n.assignedModId)) ||
              item.name.toLowerCase() === rawNodeName.toLowerCase() ||
              (item.rawModName && item.rawModName.toLowerCase() === rawNodeName.toLowerCase())
          );
          if (!matchedExisting) {
            const fallbackExt =
              activeGameSchema?.extensions?.packages?.[0] ||
              activeGameSchema?.extensions?.supported?.[0] ||
              undefined;
            const dotIdx = rawNodeName.lastIndexOf(".");
            const nodeExt = dotIdx !== -1 ? rawNodeName.slice(dotIdx).toLowerCase() : "";
            const isConfigOrphan = isTextConfigExtension(nodeExt, activeGameSchema);
            pushModItem(
              {
                id: n.assignedModId,
                name: rawNodeName,
                file_extension: /\.[a-z0-9]+$/i.test(rawNodeName) ? undefined : fallbackExt,
              },
              isConfigOrphan ? "config" : "orphan",
              n,
              true
            );
          }
        }
      }
    };
    walkExistingFiles(Array.isArray(structure) ? structure : []);

    return list;
  }, [targetMod, parentRel, childRels, familyMods, configFiles, structure, activeGameSchema]);

  // Synchronize modFiles with structure tree while preserving folder assignments
  useEffect(() => {
    if (modFiles.length === 0) return;

    const findMatchingModFile = (n: any): ModFileItem | undefined => {
      const nModId = n?.assignedModId ? String(n.assignedModId) : undefined;
      if (nModId) {
        const byId = modFiles.find((f) => f.modId === nModId);
        if (byId) return byId;
      }
      const nNameLower = String(n?.name || "").trim().toLowerCase();
      if (nNameLower) {
        const byExact = modFiles.find((f) => f.name.toLowerCase() === nNameLower);
        if (byExact) return byExact;
      }
      const extRegex = getExtensionRegex(activeGameSchema);
      const nBaseLower = String(n?.assignedModName || n?.name || "")
        .replace(extRegex, "")
        .trim()
        .toLowerCase();
      if (nBaseLower) {
        const candidates = modFiles.filter(
          (f) =>
            (f.rawModName || f.name.replace(extRegex, ""))
              .trim()
              .toLowerCase() === nBaseLower
        );
        if (candidates.length === 1) return candidates[0];
      }
      return undefined;
    };

    const placedSet = new Set<string>();
    let changed = false;

    const syncNodes = (nodes: StructureNode[]): StructureNode[] => {
      const out: StructureNode[] = [];
      for (const n of nodes) {
        if (!n) continue;
        if (isFolderNode(n)) {
          const nextChildren = syncNodes(n.children || []);
          const folderId = n.id || `folder_${n.name}`;
          if (n.type !== "folder" || n.id !== folderId) {
            changed = true;
          }
          const normalizedFolder: StructureNode = {
            ...n,
            id: folderId,
            type: "folder",
            children: nextChildren,
          };
          out.push(normalizedFolder);
        } else {
          const matched = findMatchingModFile(n);
          if (matched && !placedSet.has(matched.id)) {
            placedSet.add(matched.id);
            const expectedId = n.id || `file_${matched.id}`;
            const expectedModId = matched.modId || n.assignedModId;
            const expectedModName = matched.rawModName || n.assignedModName;
            const needsUpdate =
              n.type !== "file" ||
              n.id !== expectedId ||
              n.name !== matched.name ||
              n.assignedModId !== expectedModId ||
              n.assignedModName !== expectedModName;
            if (needsUpdate) {
              changed = true;
              out.push({
                ...n,
                id: expectedId,
                name: matched.name,
                type: "file",
                assignedModId: expectedModId,
                assignedModName: expectedModName,
              });
            } else {
              out.push(n);
            }
          } else if (!matched && n.name) {
            // Preserve unknown file nodes instead of deleting them
            if (n.type !== "file") changed = true;
            out.push({ ...n, type: "file" });
          } else {
            changed = true;
          }
        }
      }
      return out;
    };

    const nextTree = syncNodes(Array.isArray(structure) ? structure : []);
    const missingFiles = modFiles.filter((f) => !placedSet.has(f.id));

    if (missingFiles.length > 0) {
      changed = true;
      const firstFolderIdx = nextTree.findIndex((n) => isFolderNode(n));
      if (firstFolderIdx !== -1) {
        const firstFolder = nextTree[firstFolderIdx];
        nextTree[firstFolderIdx] = {
          ...firstFolder,
          type: "folder",
          children: [
            ...(firstFolder.children || []),
            ...missingFiles.map((mf) => ({
              id: `file_${mf.id}`,
              name: mf.name,
              type: "file" as const,
              assignedModId: mf.modId,
              assignedModName: mf.rawModName,
            })),
          ],
        };
      } else {
        for (const mf of missingFiles) {
          nextTree.push({
            id: `file_${mf.id}`,
            name: mf.name,
            type: "file" as const,
            assignedModId: mf.modId,
            assignedModName: mf.rawModName,
          });
        }
      }
    }

    if (changed && JSON.stringify(nextTree) !== JSON.stringify(Array.isArray(structure) ? structure : [])) {
      onChange(nextTree);
    }
  }, [modFiles]);

  const rootModsLabel = useMemo(() => {
    const rawSubdir = String(
      activeGameSchema?.paths?.mods_subdir ||
      activeGameSchema?.paths?.default_relative_mods ||
      ""
    )
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    const leaf = rawSubdir ? rawSubdir.split("/").pop() || rawSubdir : t("term_mods", "Mods");
    return `${leaf}/`;
  }, [activeGameSchema, t]);

  const allFolders = useMemo(() => {
    const list: Array<{ id: string; name: string; path: string }> = [
      {
        id: ROOT_MODS_ID,
        name: rootModsLabel,
        path: rootModsLabel,
      },
    ];
    const walk = (nodes: StructureNode[], relPrefix: string) => {
      for (const n of nodes) {
        if (n.type === "folder") {
          const currentRelPath = `${relPrefix}${n.name}/`;
          list.push({ id: n.id, name: currentRelPath, path: currentRelPath });
          if (n.children) walk(n.children, currentRelPath);
        }
      }
    };
    walk(structure || [], "/");
    return list;
  }, [structure, rootModsLabel]);

  const fileFolderLocationMap = useMemo(() => {
    const map = new Map<string, { folderId: string; folderPath: string }>();
    const walk = (nodes: StructureNode[], folderId: string, folderPath: string) => {
      for (const n of nodes) {
        if (n.type === "file") {
          map.set(n.name.toLowerCase(), { folderId, folderPath });
        } else if (n.type === "folder" && n.children) {
          const nextPath = folderId === ROOT_MODS_ID ? `/${n.name}/` : `${folderPath}${n.name}/`;
          walk(n.children, n.id, nextPath);
        }
      }
    };
    walk(structure || [], ROOT_MODS_ID, rootModsLabel);
    return map;
  }, [structure, rootModsLabel]);

  const moveFileToFolder = (fileName: string, targetFolderId: string) => {
    const lower = fileName.toLowerCase();
    let preserved: StructureNode | undefined;
    const stripFile = (nodes: StructureNode[]): StructureNode[] =>
      nodes
        .filter((n) => {
          if (n.type === "file" && n.name.toLowerCase() === lower) {
            if (!preserved) preserved = n;
            return false;
          }
          return true;
        })
        .map((n) => (n.type === "folder" ? { ...n, children: stripFile(n.children || []) } : n));

    const cleaned = stripFile(structure || []);
    const prev = preserved as StructureNode | undefined;
    const fileNode: StructureNode = {
      ...(prev || {}),
      id: prev?.id || `file_${lower}`,
      name: fileName,
      type: "file",
    };

    if (targetFolderId === ROOT_MODS_ID) {
      onChange([...cleaned, fileNode]);
      return;
    }

    const insertInto = (nodes: StructureNode[]): StructureNode[] =>
      nodes.map((n) => {
        if (n.type === "folder" && n.id === targetFolderId) {
          return { ...n, children: [...(n.children || []), fileNode] };
        }
        if (n.type === "folder" && n.children) {
          return { ...n, children: insertInto(n.children) };
        }
        return n;
      });

    onChange(insertInto(cleaned));
  };

  const handleAddFolder = (parentFolderId: string | null, rawName?: string) => {
    const hasAnyFolder = (structure || []).some((n) => n.type === "folder");
    const clean = (rawName ?? newFolderName).trim() || (!hasAnyFolder ? defaultModFolderName : "Subfolder");
    const newFolder: StructureNode = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: clean,
      type: "folder",
      children: [],
    };

    if (!parentFolderId || parentFolderId === ROOT_MODS_ID) {
      // If this is the very first folder created in Mods/, automatically move root-level mod files into it
      if (!hasAnyFolder) {
        const rootFiles = (structure || []).filter((n) => n.type === "file");
        const remaining = (structure || []).filter((n) => n.type !== "file");
        onChange([...remaining, { ...newFolder, children: rootFiles }]);
      } else {
        onChange([...(structure || []), newFolder]);
      }
    } else {
      const insertSubfolder = (nodes: StructureNode[]): StructureNode[] =>
        nodes.map((n) => {
          if (n.type === "folder" && n.id === parentFolderId) {
            return { ...n, children: [...(n.children || []), newFolder] };
          }
          if (n.type === "folder" && n.children) {
            return { ...n, children: insertSubfolder(n.children) };
          }
          return n;
        });
      onChange(insertSubfolder(structure || []));
    }

    setNewFolderName("");
    setAddingChildToFolderId(null);
  };

  const handleRenameFolder = (folderId: string) => {
    const clean = editingFolderName.trim();
    if (!clean) {
      setEditingFolderId(null);
      return;
    }
    const updateTree = (nodes: StructureNode[]): StructureNode[] =>
      nodes.map((n) => {
        if (n.type === "folder" && n.id === folderId) {
          return { ...n, name: clean };
        }
        if (n.type === "folder" && n.children) {
          return { ...n, children: updateTree(n.children) };
        }
        return n;
      });
    onChange(updateTree(structure || []));
    setEditingFolderId(null);
  };

  const handleDeleteFolder = (folderId: string) => {
    const rescuedFiles: StructureNode[] = [];
    const collectFiles = (nodes: StructureNode[]) => {
      for (const n of nodes) {
        if (n.type === "file") rescuedFiles.push(n);
        if (n.type === "folder" && n.children) collectFiles(n.children);
      }
    };

    const removeFolderNode = (nodes: StructureNode[]): StructureNode[] => {
      const out: StructureNode[] = [];
      for (const n of nodes) {
        if (n.type === "folder" && n.id === folderId) {
          collectFiles(n.children || []);
          continue;
        }
        if (n.type === "folder" && n.children) {
          out.push({ ...n, children: removeFolderNode(n.children) });
        } else {
          out.push(n);
        }
      }
      return out;
    };

    const next = removeFolderNode(structure || []);
    onChange([...next, ...rescuedFiles]);
  };

  const toggleCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const removeFileFromStructure = (file: ModFileItem) => {
    const lowerName = file.name.toLowerCase();
    const targetModId = file.modId ? String(file.modId) : undefined;
    const stripTarget = (nodes: StructureNode[]): StructureNode[] =>
      (nodes || [])
        .filter((n) => {
          if (isFolderNode(n)) return true;
          const nBase = String(n.name || "").split(/[\\/]/).pop()?.toLowerCase() || "";
          const matchById = Boolean(targetModId && n.assignedModId && String(n.assignedModId) === targetModId);
          const matchByName = Boolean(nBase && nBase === lowerName) || String(n.name || "").toLowerCase() === lowerName;
          return !(matchById || matchByName);
        })
        .map((n) => (isFolderNode(n) && n.children ? { ...n, children: stripTarget(n.children) } : n));

    if (file.role === "config" && onDetachConfig) {
      onDetachConfig(file.name);
      return;
    }
    onChange(stripTarget(structure || []));
  };

  const renderFileRow = (file: ModFileItem) => {
    const loc = fileFolderLocationMap.get(file.name.toLowerCase()) || {
      folderId: ROOT_MODS_ID,
      folderPath: rootModsLabel,
    };
    const isCore = file.role === "core";
    const isConfig = file.role === "config";
    const isOrphan = Boolean(file.isOrphanNode);
    const canOpenDossier = !isOrphan && !isCore && !isConfig && Boolean(file.rawRef?.id || file.rawRef?.hash || file.rawRef?.name);

    const iconName = isCore
      ? t("icon_deployed_code", "deployed_code")
      : isConfig
        ? t("icon_tune", "tune")
        : isScriptExtension(file.ext, activeGameSchema)
          ? t("icon_terminal", "terminal")
          : t("icon_extension", "extension");

    const roleLabel =
      file.role === "core"
        ? t("studio_file_role_core", "Core")
        : file.role === "twin"
          ? t("editor_twin", "Twin")
          : file.role === "flavor"
            ? t("studio_badge_flavor", "Flavor")
            : file.role === "beta"
              ? t("badge_beta", "Beta")
              : file.role === "config"
                ? t("studio_file_role_config", "Config")
                : file.role === "orphan"
                  ? t("status_unlinked", "Unlinked")
                  : t("editor_addon", "Add-on");

    return (
      <div
        key={file.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", file.name);
          e.dataTransfer.effectAllowed = "move";
          setDraggedFileName(file.name);
        }}
        onDragEnd={() => {
          setDraggedFileName(null);
          setDragOverFolderId(null);
        }}
        className={`min-h-[48px] p-3 sm:px-3.5 sm:py-2.5 rounded-xl glass-surface border flex flex-wrap items-center justify-between gap-2.5 transition-colors cursor-grab active:cursor-grabbing ${
          draggedFileName === file.name
            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] opacity-75"
            : isOrphan
              ? "border-[color-mix(in_srgb,var(--warning)_28%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)]"
              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
        }`}
      >
        {/* Left: Drag Handle + Icon + Filename + Compact Install Folder */}
        <div className="flex items-start sm:items-center gap-2 sm:gap-2.5 min-w-[160px] flex-1">
          <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-40 shrink-0 hidden sm:inline mt-0.5 sm:mt-0">
            {t("icon_drag_indicator", "drag_indicator")}
          </span>
          <span
            className={`material-symbols-outlined !text-[18px] shrink-0 mt-0.5 sm:mt-0 ${
              isCore
                ? "text-[var(--accent)]"
                : isOrphan
                  ? "text-[var(--warning)]"
                  : "text-[var(--subtext)]"
            }`}
          >
            {iconName}
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
              {canOpenDossier ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenModDossier) {
                      onOpenModDossier(file.rawRef);
                    } else {
                      openModDossier({ ...file.rawRef, isNexusView: true });
                    }
                  }}
                  className="text-xs font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors break-words sm:truncate text-left cursor-pointer relative group/dossier"
                >
                  {file.name}
                  <HoverTooltip title={t("open_dossier", "Open {Mod} Dossier")} />
                </button>
              ) : (
                <span className="text-xs font-bold text-[var(--text)] break-words sm:truncate">
                  {file.name}
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-md bg-transparent border text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                  isCore
                    ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                    : isOrphan
                      ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                      : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)]"
                }`}
              >
                {roleLabel}
              </span>
              {isOrphan && isConfig && (
                <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[9px] font-bold uppercase tracking-wider text-[var(--warning)] shrink-0">
                  {t("status_unlinked", "Unlinked")}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70 truncate mt-0.5">
              {loc.folderPath}
            </span>
          </div>
        </div>

        {/* Right: Folder Placement + Config / Orphan Cleanup Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 w-full md:w-auto">
          {allFolders.length > 1 && (
            <div className="w-full sm:w-44 min-w-0">
              <CustomDropdown
                disableTint={true}
                className="h-8"
                buttonClassName="!h-8 !px-3 !text-xs !rounded-lg"
                value={loc.folderId}
                onChange={(val: string[]) => {
                  if (val[0]) moveFileToFolder(file.name, val[0]);
                }}
                options={allFolders.map((f) => ({
                  id: f.id,
                  label: f.path,
                }))}
              />
            </div>
          )}

          {isConfig && !isOrphan && onOpenConfigInIde && (
            <button
              type="button"
              onClick={() =>
                onOpenConfigInIde({
                  name: file.name,
                  path: file.rawRef?.path || file.name,
                })
              }
              className="h-8 px-3 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[11px] font-bold text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                {t("icon_code", "code")}
              </span>
              {t("studio_configs_btn_open_ide", "Edit in IDE")}
            </button>
          )}

          {(isConfig && (onDetachConfig || isOrphan)) || isOrphan ? (
            <button
              type="button"
              onClick={() => removeFileFromStructure(file)}
              className={`w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center transition-all cursor-pointer relative group/btn shrink-0 ${
                isOrphan
                  ? "hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)]"
                  : "hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {isOrphan ? t("icon_close", "close") : t("icon_link_off", "link_off")}
              </span>
              <HoverTooltip
                title={isOrphan ? t("remove", "Remove") : t("nav_unlink", "Unlink")}
                variant={isOrphan ? "danger" : undefined}
              />
            </button>
          ) : null}

          {isConfig && !isOrphan && onDeleteConfigFile && file.rawRef?.path && (
            <button
              type="button"
              onClick={() =>
                onDeleteConfigFile({
                  name: file.name,
                  path: file.rawRef?.path,
                })
              }
              className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer relative group/btn shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_delete", "delete")}
              </span>
              <HoverTooltip title={t("delete_file", "Delete")} variant="danger" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderFolderTree = (nodes: StructureNode[], parentPath: string, depth = 1): React.ReactNode => {
    const folders = nodes.filter((n) => isFolderNode(n));
    const filesInThisNode = nodes
      .filter((n) => !isFolderNode(n))
      .map((n) =>
        modFiles.find(
          (mf) =>
            mf.name.toLowerCase() === (n.name || "").toLowerCase() ||
            (n.assignedModId && mf.modId === String(n.assignedModId))
        )
      )
      .filter(Boolean) as ModFileItem[];
    const canAddSubfolder = maxFolderDepth === undefined || depth < maxFolderDepth;

    return (
      <div className="flex flex-col gap-2">
        {folders.map((folder) => {
          const isCollapsed = collapsedFolders.has(folder.id);
          const isEditing = editingFolderId === folder.id;
          const isAddingSub = addingChildToFolderId === folder.id;
          const isDragTarget = dragOverFolderId === folder.id;
          const relParent = parentPath.startsWith(rootModsLabel)
            ? parentPath.slice(rootModsLabel.length).replace(/^\/+|\/+$/g, "")
            : parentPath.replace(/^\/+|\/+$/g, "");
          const currentPath = `${parentPath}${folder.name}/`;
          const childCount = Array.isArray(folder.children) ? folder.children.length : 0;

          return (
            <div key={folder.id} className="flex flex-col gap-1.5">
              {/* Folder Row (Drag Drop Target) */}
              <div
                onDragOver={(e) => {
                  if (!draggedFileName) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id);
                }}
                onDragLeave={() => {
                  if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const fileName = draggedFileName || e.dataTransfer.getData("text/plain");
                  if (fileName) moveFileToFolder(fileName, folder.id);
                  setDraggedFileName(null);
                  setDragOverFolderId(null);
                }}
                className={`min-h-[44px] py-2 px-3 sm:px-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 sm:gap-3 transition-colors ${
                  isDragTarget
                    ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                }`}
              >
                <div className="flex items-center gap-2 min-w-[160px] flex-1">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(folder.id)}
                    className="w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {isCollapsed ? t("icon_chevron_right", "chevron_right") : t("icon_expand_more", "expand_more")}
                    </span>
                  </button>
                  <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                    {isCollapsed ? t("icon_folder", "folder") : t("icon_folder_open", "folder_open")}
                  </span>

                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-1 max-w-sm min-w-[160px]">
                      <input
                        autoFocus
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameFolder(folder.id);
                          if (e.key === "Escape") setEditingFolderId(null);
                        }}
                        className="h-8 px-2.5 rounded-lg glass-surface border border-[var(--accent)] text-xs font-bold text-[var(--text)] flex-1 min-w-[110px] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameFolder(folder.id)}
                        className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[10px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer shrink-0"
                      >
                        {t("hub_save", "Save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingFolderId(null)}
                        className="h-8 px-2 rounded-lg text-[10px] font-bold text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer shrink-0"
                      >
                        {t("btn_cancel", "Cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1">
                      <span className="text-xs font-bold text-[var(--text)] break-words sm:truncate">
                        {folder.name}/
                      </span>
                      <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 shrink-0">
                        ({childCount})
                      </span>
                      {relParent && (
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-55 truncate hidden sm:inline">
                          /{relParent}/
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Folder Actions: Rename, + Subfolder, Delete */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFolderId(folder.id);
                      setEditingFolderName(folder.name);
                    }}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer relative group/btn"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_edit", "edit")}
                    </span>
                    <HoverTooltip title={t("lineage_btn_edit", "Rename Folder")} />
                  </button>

                  {canAddSubfolder && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingChildToFolderId(isAddingSub ? null : folder.id);
                        setNewFolderName("");
                      }}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer relative group/btn"
                    >
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_create_new_folder", "create_new_folder")}
                      </span>
                      <HoverTooltip title={t("studio_structure_btn_add_subfolder", "Add Subfolder")} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer relative group/btn"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_delete", "delete")}
                    </span>
                    <HoverTooltip title={t("lineage_btn_delete", "Delete Folder")} variant="danger" />
                  </button>
                </div>
              </div>

              {/* Inline Add Subfolder Input */}
              {isAddingSub && (
                <div className="pl-2.5 ml-1.5 sm:pl-6 sm:ml-3 border-l border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-2 py-1">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddFolder(folder.id);
                      if (e.key === "Escape") setAddingChildToFolderId(null);
                    }}
                    placeholder={t("studio_structure_subfolder_ph", "Subfolder name...")}
                    className="h-9 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] focus:border-[var(--accent)] text-xs font-bold text-[var(--text)] flex-1 max-w-xs min-w-0 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddFolder(folder.id)}
                    className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-xs font-bold text-[var(--text)] cursor-pointer shrink-0"
                  >
                    {t("ql_add", "Add")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingChildToFolderId(null)}
                    className="h-9 px-2.5 text-xs font-bold text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer shrink-0"
                  >
                    {t("btn_cancel", "Cancel")}
                  </button>
                </div>
              )}

              {/* Folder Children (Subfolders + Files inside this folder) */}
              {!isCollapsed && (
                <div className="pl-2.5 ml-1.5 sm:pl-6 sm:ml-3 border-l border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-1.5">
                  {folder.children && folder.children.length > 0 ? (
                    renderFolderTree(folder.children, currentPath, depth + 1)
                  ) : (
                    <div className="py-2 px-3 text-[11px] font-semibold text-[var(--subtext)] opacity-55">
                      {t("studio_folder_empty", "Empty folder")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Files at this level */}
        {filesInThisNode.map((file) => renderFileRow(file))}
      </div>
    );
  };

  return (
    <div className="w-full rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden flex flex-col">
      {/* Root Directory Bar (Also Root Drag Drop Target) */}
      <div
        onDragOver={(e) => {
          if (!draggedFileName) return;
          e.preventDefault();
          if (dragOverFolderId !== ROOT_MODS_ID) setDragOverFolderId(ROOT_MODS_ID);
        }}
        onDragLeave={() => {
          if (dragOverFolderId === ROOT_MODS_ID) setDragOverFolderId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fileName = draggedFileName || e.dataTransfer.getData("text/plain");
          if (fileName) moveFileToFolder(fileName, ROOT_MODS_ID);
          setDraggedFileName(null);
          setDragOverFolderId(null);
        }}
        className={`px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-wrap items-center justify-between gap-3 transition-colors ${
          dragOverFolderId === ROOT_MODS_ID
            ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">
            {t("icon_folder_open", "folder_open")}
          </span>
          <span className="text-xs font-black font-mono tracking-wider text-[var(--text)]">
            {rootModsLabel}
          </span>
          <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-75">
            ({modFiles.length} {t("modal_files", "Files")} • {allFolders.length - 1}{" "}
            {t("studio_folders_label", "Folders")})
          </span>
          {maxFolderDepth !== undefined && (
            <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9.5px] font-bold uppercase tracking-wider text-[var(--subtext)]">
              {t("schema_max_depth", "Max Depth")}: {maxFolderDepth}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {addingChildToFolderId === ROOT_MODS_ID ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddFolder(ROOT_MODS_ID);
                  if (e.key === "Escape") setAddingChildToFolderId(null);
                }}
                placeholder={defaultModFolderName}
                className="h-9 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] focus:border-[var(--accent)] text-xs font-bold text-[var(--text)] flex-1 sm:w-48 min-w-0 outline-none"
              />
              <button
                type="button"
                onClick={() => handleAddFolder(ROOT_MODS_ID)}
                className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-xs font-bold text-[var(--text)] cursor-pointer shrink-0"
              >
                {t("ql_add", "Add")}
              </button>
              <button
                type="button"
                onClick={() => setAddingChildToFolderId(null)}
                className="h-9 px-2.5 text-xs font-bold text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer shrink-0"
              >
                {t("btn_cancel", "Cancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAddingChildToFolderId(ROOT_MODS_ID);
                setNewFolderName(
                  allFolders.length === 1 ? defaultModFolderName : ""
                );
              }}
              className="h-8 px-3 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-xs font-bold text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_create_new_folder", "create_new_folder")}
              </span>
              {t("context_new_folder", "New Folder")}
            </button>
          )}
        </div>
      </div>

      {/* Directory Tree Contents */}
      <div className="p-4 flex flex-col gap-2 min-h-[120px]">
        {modFiles.length === 0 && (structure || []).length === 0 ? (
          <div className="py-4 px-3 text-center text-xs font-semibold text-[var(--subtext)] opacity-60">
            {t("studio_folder_empty", "Empty folder")}
          </div>
        ) : (
          renderFolderTree(structure || [], rootModsLabel, 1)
        )}
      </div>
    </div>
  );
}
