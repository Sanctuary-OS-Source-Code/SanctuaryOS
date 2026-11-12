import { useState, useEffect } from "react";
import { useStore } from "../store";
import {
  DEFAULT_SCHEMA_CACHE_KEY,
  getBundledSchema,
  getCachedOrBundledDefaultSchema,
} from "../utils/bundledSchemas";
import { readDir, readTextFile, writeTextFile, exists, remove } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import enDefault from "../lexicons/en-default.json";
import {
  CORE_LEXICONS_CACHE_KEY,
  CORE_GLOSSARY_TERMS,
  useLexicon,
  loadBuiltinLexiconAsync,
  getLoadedBuiltinLexicon,
} from "../LexiconContext";

export interface CreateLexiconOptions {
  fileId: string;
  displayName: string;
  lang: string;
  starterPreset?: string;
}

const CORE_LEXICON_ORDER = ["en-default", "en-sanctuary"];
const BUNDLED_DELTA_LEXICON_IDS = ["en-sanctuary", "en-sims", "Simlish"];

function normalizeLexId(rawId: string): string {
  const lower = String(rawId || "").trim().toLowerCase();
  if (lower === "simlish") return "Simlish";
  if (lower === "en-sims") return "en-sims";
  if (lower === "en-default") return "en-default";
  if (lower === "en-sanctuary") return "en-sanctuary";
  return String(rawId || "").trim();
}

function getActiveEnDefaultTemplate(): Record<string, any> {
  try {
    const raw = localStorage.getItem(CORE_LEXICONS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.["en-default"] && typeof parsed["en-default"] === "object") {
        return { ...(enDefault as Record<string, any>), ...parsed["en-default"] };
      }
    }
  } catch {}
  return enDefault as Record<string, any>;
}

function resolveMasonSandboxDir(rawVaultPath: string): string {
  const normalizedVault = rawVaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  let baseDir = normalizedVault;
  const activeSchema = useStore.getState().activeGameSchema;
  const candidateLeaves = [
    activeSchema?.paths?.default_mod_dir_windows,
    activeSchema?.paths?.default_mod_dir_mac,
    activeSchema?.paths?.default_mod_dir_linux,
    activeSchema?.paths?.default_windows,
    activeSchema?.paths?.default_mac,
    activeSchema?.paths?.default_linux,
  ];
  for (const rawPath of candidateLeaves) {
    if (!rawPath || typeof rawPath !== "string") continue;
    const leaf = rawPath.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop();
    if (leaf && baseDir.toLowerCase().endsWith(`/${leaf.toLowerCase()}`)) {
      baseDir = baseDir.substring(0, baseDir.length - (leaf.length + 1));
      break;
    }
  }
  return `${baseDir}/Dev/Sandbox`;
}

const LANG_NAME_MAP: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  tr: "Turkish",
};

function resolveLanguageLabel(raw?: string): string {
  if (!raw) return "English";
  const clean = String(raw).trim();
  if (!clean) return "English";
  return LANG_NAME_MAP[clean.toLowerCase()] || clean;
}

export function getIdeDraftCacheKey(filePath: string): string {
  return `sanctuary_ide_draft_${filePath}`;
}

export function getIdeCachedDraft(filePath: string): string | null {
  if (!filePath) return null;
  try {
    return localStorage.getItem(getIdeDraftCacheKey(filePath));
  } catch {
    return null;
  }
}

export function hasIdeCachedDraft(filePath: string): boolean {
  const val = getIdeCachedDraft(filePath);
  return val !== null && val !== undefined && val.length > 0;
}

export function setIdeCachedDraft(filePath: string, content: string, originalContent: string) {
  if (!filePath) return;
  try {
    if (content !== originalContent) {
      localStorage.setItem(getIdeDraftCacheKey(filePath), content);
    } else {
      localStorage.removeItem(getIdeDraftCacheKey(filePath));
    }
  } catch {}
}

export function clearIdeCachedDraft(filePath: string) {
  if (!filePath) return;
  try {
    localStorage.removeItem(getIdeDraftCacheKey(filePath));
  } catch {}
}

function getValidCloudSchemaDraft(
  path: string,
  fileId: string,
  canonicalSchema: any
): { raw: string; parsed: any } | null {
  const raw = getIdeCachedDraft(path);
  if (!raw) return null;
  const canonicalStr = canonicalSchema ? JSON.stringify(canonicalSchema, null, 2) : "";
  if (canonicalStr && raw === canonicalStr) {
    clearIdeCachedDraft(path);
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { raw, parsed: null };
    }
    const cleanFileId = String(fileId || "").trim().toLowerCase();
    // Guard Keepers Core 'default' baseline schema from any game-specific draft poisoning (e.g. 'sims4')
    if (cleanFileId === "default") {
      const draftId = String(parsed.id || "default").trim().toLowerCase();
      const draftGameId = String(parsed.game_id || "default").trim().toLowerCase();
      if (draftId !== "default" || draftGameId !== "default") {
        clearIdeCachedDraft(path);
        return null;
      }
    }
    // Discard stale local drafts whose schema_version predates a newer cloud schema version
    const cloudVer = Number(canonicalSchema?.schema_version) || 0;
    const draftVer = Number(parsed?.schema_version) || 0;
    if (cloudVer > 0 && draftVer > 0 && draftVer < cloudVer) {
      clearIdeCachedDraft(path);
      return null;
    }
    return { raw, parsed };
  } catch {
    return { raw, parsed: null };
  }
}

export function useMasonFiles({
  vaultPath,
  isCloudMode,
  cloudTarget = "sanctuary_schemas",
  isKeepers = false,
}: {
  vaultPath?: string;
  isCloudMode?: boolean;
  cloudTarget?: "sanctuary_schemas" | "sanctuary_lexicons" | "sanctuary_games";
  isKeepers?: boolean;
}) {
  const { t, registry } = useLexicon();
  const session = useStore((state) => state.session);
  const pushStatus = useStore((state) => state.pushStatus);
  const localOpenFiles = useStore((state) => state.ideOpenFiles);
  const setLocalOpenFiles = useStore((state) => state.setIdeOpenFiles);
  const localActiveFileIndex = useStore((state) => state.ideActiveFileIndex);
  const setLocalActiveFileIndex = useStore((state) => state.setIdeActiveFileIndex);
  const cloudOpenFiles = useStore((state) => state.cloudIdeOpenFiles);
  const setCloudOpenFiles = useStore((state) => state.setCloudIdeOpenFiles);
  const cloudActiveFileIndex = useStore((state) => state.cloudIdeActiveFileIndex);
  const setCloudActiveFileIndex = useStore((state) => state.setCloudIdeActiveFileIndex);

  const openFiles = isCloudMode ? cloudOpenFiles : localOpenFiles;
  const setOpenFiles = isCloudMode ? setCloudOpenFiles : setLocalOpenFiles;
  const activeFileIndex = isCloudMode ? cloudActiveFileIndex : localActiveFileIndex;
  const setActiveFileIndex = isCloudMode ? setCloudActiveFileIndex : setLocalActiveFileIndex;

  const [files, setFiles] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState(isCloudMode ? "all" : "overview");
  const [lexiconScopeFilter, setLexiconScopeFilter] = useState<"all" | "core" | "community" | "unsaved">("all");
  const [lexiconLanguageFilter, setLexiconLanguageFilter] = useState<string>("all");
  const [lexiconCommunityFilter, setLexiconCommunityFilter] = useState<string>("all");
  const [problemsList, setProblemsList] = useState<any[]>([]);
  const [activeVersionTimestamp, setActiveVersionTimestamp] = useState<number | null>(null);
  const [editorRef, setEditorRef] = useState<any>(null);

  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [renameExt, setRenameExt] = useState("");
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"standard" | "lexicon">("standard");
  const [lexiconLang, setLexiconLang] = useState("es");
  const [createFileName, setCreateFileName] = useState("");
  const [createFileExt, setCreateFileExt] = useState(".json");
  const [showReference, setShowReference] = useState(false);
  const [referenceData, setReferenceData] = useState<any>({});
  const [referenceLabel, setReferenceLabel] = useState<string>("en-default.json Reference");
  const [internalCloudTarget, setInternalCloudTarget] = useState<
    "sanctuary_schemas" | "sanctuary_lexicons" | "sanctuary_games"
  >(cloudTarget || "sanctuary_lexicons");
  const [splitRatio, setSplitRatio] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uploadState, setUploadState] = useState({
    isOpen: false,
    editId: null as string | null,
    assetType: "lexicon",
    isHidden: false,
    fileContent: null as any,
    fileName: "",
    name: "",
    version: "1.0.0",
    description: "",
    releaseNotes: "",
    language: "English",
    newLanguage: "",
    lexiconType: "Theme",
    themeMode: "Dark",
  });
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Automatically clear localStorage draft cache whenever a file's content matches its originalContent (e.g. after saveFile)
  useEffect(() => {
    for (const f of openFiles || []) {
      if (f?.path && f.content === f.originalContent) {
        clearIdeCachedDraft(f.path);
      }
    }
  }, [openFiles]);

  const fetchFiles = async () => {
    if (isCloudMode) {
      try {
        setIsScanning(true);
        const supabaseMod = await import("../supabase");
        const primaryClient = isKeepers ? supabaseMod.supabaseAuth : supabaseMod.supabase;

        const storeState = useStore.getState() as any;
        const activeWs = (storeState.workspaces || []).find(
          (w: any) =>
            String(w.id).toLowerCase() === String(storeState.activeWorkspaceId || "").toLowerCase() ||
            String(w.schema_id || "").toLowerCase() === String(storeState.activeWorkspaceId || "").toLowerCase()
        );
        const spokeDisplayName =
          activeWs?.name ||
          storeState.activeGameSchema?.display_name ||
          storeState.activeGameSchema?.name ||
          "Workspace";

        if (internalCloudTarget === "sanctuary_lexicons") {
          const primaryRes = await primaryClient
            .from("sanctuary_lexicons")
            .select("id, name, badge, version, lexicon_data");

          if (primaryRes.error) {
            console.error("Cloud fetch error:", primaryRes.error);
            setFetchError(primaryRes.error.message || JSON.stringify(primaryRes.error));
          } else {
            setFetchError(null);
          }

          const rowMap = new Map<string, any>();
          for (const row of primaryRes.data || []) {
            if (!row?.id) continue;
            const cid = normalizeLexId(String(row.id));
            // Keepers Core strictly manages Core OS lexicons (never TS4 packs); Spokes never manage Core OS lexicons
            if (isKeepers && (cid === "en-sims" || cid === "Simlish")) continue;
            if (!isKeepers && (cid === "en-default" || cid === "en-sanctuary")) continue;
            rowMap.set(cid, { ...row, id: cid });
          }

          const bundledSpokeSchema = !isKeepers
            ? getBundledSchema(
                String(
                  activeWs?.schema_id ||
                    storeState.activeGameSchema?.id ||
                    storeState.activeWorkspaceId ||
                    ""
                )
              )
            : null;
          const spokeUsesOfflineSimsFallback =
            !isKeepers &&
            rowMap.size === 0 &&
            (bundledSpokeSchema?.default_lexicon === "en-sims" ||
              bundledSpokeSchema?.default_lexicon === "Simlish" ||
              storeState.activeGameSchema?.default_lexicon === "en-sims" ||
              storeState.activeGameSchema?.default_lexicon === "Simlish");

          const seedIds = isKeepers
            ? ["en-default", "en-sanctuary"]
            : spokeUsesOfflineSimsFallback
              ? ["en-sims", "Simlish"]
              : [];

          const loadedSeeds: Record<string, Record<string, any>> = {
            "en-default": enDefault,
          };
          await Promise.all(
            seedIds
              .filter((id) => id !== "en-default")
              .map(async (id) => {
                loadedSeeds[id] = await loadBuiltinLexiconAsync(id);
              })
          );
          for (const id of seedIds) {
            if (!rowMap.has(id)) {
              rowMap.set(id, {
                id,
                name: id,
                badge: id === "en-default" || id === "en-sanctuary" ? "Sanctuary" : spokeDisplayName,
                version: 1,
                lexicon_data: loadedSeeds[id] || {},
              });
            }
          }

          let mapped = Array.from(rowMap.values()).map((row: any) => {
            const id = normalizeLexId(String(row.id));
            const bundled = loadedSeeds[id] || getLoadedBuiltinLexicon(id);
            const lexData = bundled
              ? { ...bundled, ...(row.lexicon_data || {}) }
              : row.lexicon_data || {};
            const isKeepersCorePack = id === "en-default" || id === "en-sanctuary";
            const isSpokeSeedPack = id === "en-sims" || id === "Simlish";
            const isOfficialCore = CORE_LEXICON_ORDER.includes(id);

            const rawMetaName = lexData?._meta_name;
            const displayName =
              id === "en-default"
                ? "English: Default"
                : id === "en-sanctuary"
                  ? "English: Sanctuary"
                  : id === "en-sims"
                    ? rawMetaName && rawMetaName !== "English: Sanctuary"
                      ? rawMetaName
                      : "English: The Sims"
                    : id === "Simlish"
                      ? rawMetaName && rawMetaName !== "English: Sanctuary"
                        ? rawMetaName
                        : "Simlish"
                      : rawMetaName || row.name || id;

            const language = resolveLanguageLabel(
              id === "Simlish"
                ? "Simlish"
                : lexData?._meta_lang || "en"
            );

            const rawBadge = row.badge || lexData?._meta_badge;
            const community = isKeepersCorePack
              ? "Sanctuary"
              : isSpokeSeedPack || !isKeepers
                ? rawBadge && rawBadge !== "Sanctuary" && rawBadge !== "Sanctuary Foundry"
                  ? rawBadge
                  : spokeDisplayName
                : rawBadge || "Community";

            const rawAuthor = lexData?._meta_author;
            const author = isKeepersCorePack
              ? "Sanctuary Foundry"
              : isSpokeSeedPack || !isKeepers
                ? rawAuthor && rawAuthor !== "Sanctuary Foundry" && rawAuthor !== "Sanctuary Core"
                  ? rawAuthor
                  : spokeDisplayName
                : rawAuthor || "Community";

            return {
              name: `${id}.json`,
              path: `cloud://${id}`,
              displayName,
              language,
              community,
              author,
              isOfficialCore,
              version: row.version || lexData?._meta_version || 1,
              lexicon_data: lexData,
            };
          });

          if (!isKeepers) {
            mapped = mapped.filter((f: any) => {
              const n = f.name.toLowerCase();
              return n !== "en-default.json" && n !== "en-sanctuary.json";
            });
          }

          mapped.sort((a: any, b: any) => {
            const aCoreIdx = CORE_LEXICON_ORDER.indexOf(a.name.replace(/\.json$/i, ""));
            const bCoreIdx = CORE_LEXICON_ORDER.indexOf(b.name.replace(/\.json$/i, ""));
            if (aCoreIdx !== -1 && bCoreIdx !== -1) return aCoreIdx - bCoreIdx;
            if (aCoreIdx !== -1) return -1;
            if (bCoreIdx !== -1) return 1;
            return (a.displayName || a.name).localeCompare(b.displayName || b.name);
          });

          setFiles(mapped);
          return;
        }

        const { data, error } = await primaryClient.from(internalCloudTarget).select("*");
        if (error) {
          console.error("Cloud fetch error:", error);
          setFetchError(error.message || JSON.stringify(error));
        } else {
          setFetchError(null);
        }
        const rowMap = new Map<string, any>();
        for (const row of data || []) {
          if (row?.id) {
            const normId = String(row.id).trim().toLowerCase();
            // In Spoke mode (!isKeepers), exclude Keepers Core 'default' baseline schema so it never duplicates the Spoke schema
            if (
              internalCloudTarget === "sanctuary_schemas" &&
              !isKeepers &&
              normId === "default"
            ) {
              continue;
            }
            rowMap.set(normId, { ...row, id: normId });
          }
        }
        if (internalCloudTarget === "sanctuary_schemas") {
          if (isKeepers) {
            if (!rowMap.has("default")) {
              const defSchema = getCachedOrBundledDefaultSchema();
              rowMap.set("default", {
                id: "default",
                name: defSchema?.display_name || defSchema?.name || "Default Master Schema",
                schema_data: defSchema,
                version: defSchema?.schema_version || 1,
              });
            }
          } else {
            const activeGameSchema = storeState.activeGameSchema;
            const rawActiveSchemaId = String(
              activeWs?.schema_id || activeGameSchema?.id || "default"
            )
              .trim()
              .toLowerCase();
            if (
              rawActiveSchemaId &&
              rawActiveSchemaId !== "default" &&
              !rowMap.has(rawActiveSchemaId)
            ) {
              const fallbackSpokeSchema =
                getBundledSchema(rawActiveSchemaId) || activeGameSchema;
              rowMap.set(rawActiveSchemaId, {
                id: rawActiveSchemaId,
                name:
                  fallbackSpokeSchema?.display_name ||
                  fallbackSpokeSchema?.name ||
                  spokeDisplayName ||
                  rawActiveSchemaId,
                schema_data: fallbackSpokeSchema,
                version: fallbackSpokeSchema?.schema_version || 1,
              });
            }
          }
        }
        const mapped = Array.from(rowMap.entries())
          .map(([id, row]) => {
            const path = `cloud://${id}`;
            const schemaData = row?.schema_data || null;
            const validDraft =
              internalCloudTarget === "sanctuary_schemas"
                ? getValidCloudSchemaDraft(path, id, schemaData)
                : (() => {
                    const d = getIdeCachedDraft(path);
                    if (!d) return null;
                    try {
                      return { raw: d, parsed: JSON.parse(d) };
                    } catch {
                      return { raw: d, parsed: null };
                    }
                  })();
            const cachedDraft = validDraft?.raw || null;
            const parsedDraft = validDraft?.parsed || null;
            const effectiveSchema = parsedDraft || schemaData || {};
            const isDefaultId = String(id).trim().toLowerCase() === "default";
            const rowNameClean =
              row?.name && String(row.name).toLowerCase() !== String(id).toLowerCase()
                ? row.name
                : null;
            const displayTitle = isDefaultId
              ? effectiveSchema?.display_name ||
                rowNameClean ||
                "Default Master Schema"
              : effectiveSchema?.display_name ||
                effectiveSchema?.name ||
                effectiveSchema?.game_name ||
                rowNameClean ||
                (!isKeepers ? spokeDisplayName : null) ||
                row?.name ||
                id;
            const rawSchemaAuthor =
              effectiveSchema?.author || effectiveSchema?._meta_author || "";
            const resolvedAuthor = isKeepers
              ? rawSchemaAuthor || "Sanctuary Foundry"
              : rawSchemaAuthor &&
                  rawSchemaAuthor !== "Sanctuary Core" &&
                  rawSchemaAuthor !== "Sanctuary Foundry"
                ? rawSchemaAuthor
                : spokeDisplayName;
            return {
              name: `${id}.json`,
              path,
              displayTitle,
              author: resolvedAuthor,
              version: row?.version || effectiveSchema?.schema_version || 1,
              updated_at: row?.updated_at || row?.created_at || null,
              schema_data: schemaData,
              cachedDraft,
              hasUnsavedDraft: Boolean(cachedDraft),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setFiles(mapped);
      } catch (e) {
        console.error("Failed to load cloud files", e);
      } finally {
        setIsScanning(false);
      }
      return;
    }

    if (!vaultPath) return;
    setIsScanning(true);
    try {
      const sandboxDir = resolveMasonSandboxDir(vaultPath);

      const dirExists = await exists(sandboxDir);
      if (!dirExists) {
        setFiles([]);
        return;
      }

      const entries = await readDir(sandboxDir);
      const foundFiles: any[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory && entry.name) {
          const n = entry.name.toLowerCase();
          if (
            n.endsWith(".json") ||
            n.endsWith(".cfg") ||
            n.endsWith(".ini") ||
            n.endsWith(".js") ||
            n.endsWith(".ts") ||
            n.endsWith(".xml") ||
            n.endsWith(".txt") ||
            n.endsWith(".md")
          ) {
            const fullPath = `${sandboxDir}/${entry.name}`;
            let displayName = entry.name.replace(/\.[^/.]+$/, "");
            let language = "";
            let community = "Local";
            let author = "";
            if (n.match(/^[a-z]{2}-.+\.json$/i) || n === "simlish.json") {
              try {
                const raw = await readTextFile(fullPath);
                const parsed = JSON.parse(raw);
                displayName = parsed?._meta_name || displayName;
                language = resolveLanguageLabel(
                  parsed?._meta_lang || entry.name.split("-")[0] || "en"
                );
                community = parsed?._meta_badge || "Local Pack";
                author = parsed?._meta_author || "";
              } catch {}
            }
            foundFiles.push({
              name: entry.name,
              path: fullPath,
              displayName,
              language,
              community,
              author,
              isOfficialCore: false,
            });
          }
        }
      }

      foundFiles.sort((a, b) => a.name.localeCompare(b.name));
      setFiles(foundFiles);
    } catch (e) {
      console.error("Error reading sandbox:", e);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [vaultPath, internalCloudTarget]);

  const activeOpenFilePath = (isCloudMode ? cloudOpenFiles : localOpenFiles)[
    isCloudMode ? cloudActiveFileIndex : localActiveFileIndex
  ]?.path;

  useEffect(() => {
    const fetchRef = async () => {
      const currentFile = (isCloudMode ? cloudOpenFiles : localOpenFiles)[
        isCloudMode ? cloudActiveFileIndex : localActiveFileIndex
      ];
      if (!currentFile) return;

      const isLexicon = isCloudMode
        ? internalCloudTarget === "sanctuary_lexicons"
        : currentFile.content?.includes("_meta_lang") ||
          currentFile.content?.includes('"a_citizen"') ||
          currentFile.content?.includes('"term_mod"') ||
          currentFile.name.startsWith("en-") ||
          currentFile.name.startsWith("de-") ||
          currentFile.name.startsWith("es-") ||
          currentFile.name.startsWith("fr-") ||
          currentFile.name.toLowerCase() === "simlish.json";

      if (isLexicon) {
        setReferenceData(getActiveEnDefaultTemplate());
        setReferenceLabel(t("validator_source_default_lex", "en-default.json Baseline"));
      } else {
        const fallbackDefaultSchema = getCachedOrBundledDefaultSchema();
        setReferenceData(fallbackDefaultSchema);
        setReferenceLabel(
          t("validator_source_keepers", "Keepers Core Default Schema")
        );
        try {
          const { supabaseAuth } = await import("../supabase");
          const { data } = await supabaseAuth
            .from("sanctuary_schemas")
            .select("schema_data")
            .eq("id", "default")
            .maybeSingle();
          const cloudDefault = (data as any)?.schema_data;
          if (
            cloudDefault &&
            typeof cloudDefault === "object" &&
            Object.keys(cloudDefault).length > 0 &&
            String(cloudDefault.id || "default").trim().toLowerCase() === "default"
          ) {
            try {
              localStorage.setItem(
                DEFAULT_SCHEMA_CACHE_KEY,
                JSON.stringify(cloudDefault)
              );
            } catch {}
            setReferenceData(cloudDefault);
            setReferenceLabel(
              t("validator_source_keepers", "Keepers Core Default Schema")
            );
          }
        } catch {}
      }
    };
    fetchRef();
  }, [
    isCloudMode ? cloudActiveFileIndex : localActiveFileIndex,
    activeOpenFilePath,
    isCloudMode,
    internalCloudTarget,
  ]);

  useEffect(() => {
    if (!editorRef || !(window as any).monaco) return;
    const monaco = (window as any).monaco;
    const model = editorRef.getModel();
    if (!model) return;

    const updateMarkers = () => {
      const markers = monaco.editor.getModelMarkers({});
      setProblemsList(
        markers.map((m: any) => ({
          line: m.startLineNumber,
          column: m.startColumn,
          message: m.message,
        }))
      );
    };

    const disposable = monaco.editor.onDidChangeMarkers(updateMarkers);
    updateMarkers();

    return () => disposable.dispose();
  }, [editorRef, activeFileIndex]);

  const validateContent = (_text: string, monaco: any, model: any) => {
    if (model && monaco) {
      monaco.editor.setModelMarkers(model, "owner", []);
    }
  };

  const openFile = async (file: { name: string; path: string }) => {
    try {
      let canonicalContent = "";
      if (isCloudMode) {
        const fileId = file.name.replace(/\.json$/i, "");
        const supabaseMod = await import("../supabase");
        const client = isKeepers ? supabaseMod.supabaseAuth : supabaseMod.supabase;

        const { data, error } = await client
          .from(internalCloudTarget)
          .select(internalCloudTarget === "sanctuary_lexicons" ? "lexicon_data" : "schema_data")
          .eq("id", fileId)
          .maybeSingle();

        if (!error && data) {
          if (internalCloudTarget === "sanctuary_lexicons") {
            const rawLex = (data as any).lexicon_data || {};
            const normalizedId = normalizeLexId(fileId);
            if (normalizedId === "en-default") {
              const loadedFallback = await loadBuiltinLexiconAsync("en-default");
              const mergedDefault: Record<string, any> = { ...loadedFallback };
              for (const [k, v] of Object.entries(rawLex)) {
                if (k.startsWith("_meta") || k in loadedFallback) {
                  mergedDefault[k] = v;
                }
              }
              canonicalContent = JSON.stringify(mergedDefault, null, 2);
            } else {
              const activeEnDefault = getActiveEnDefaultTemplate();
              const loadedFallback = BUNDLED_DELTA_LEXICON_IDS.includes(normalizedId)
                ? await loadBuiltinLexiconAsync(normalizedId)
                : {};
              const combined = { ...(loadedFallback || {}), ...rawLex };
              const cleanedLex: Record<string, any> = {};
              for (const [k, v] of Object.entries(combined)) {
                if (k.startsWith("_meta")) {
                  cleanedLex[k] = v;
                  continue;
                }
                if (
                  v === "" ||
                  v === null ||
                  v === undefined ||
                  (typeof v === "string" && v.trim() === "")
                ) {
                  continue;
                }
                const isDynamicDomain =
                  k.startsWith("term_") ||
                  k.startsWith("icon_") ||
                  k.startsWith("class_dd_") ||
                  k.startsWith("vault_sub_") ||
                  k.startsWith("dlc_type_");
                if (!isDynamicDomain && activeEnDefault[k] === undefined) {
                  continue;
                }
                if (
                  !k.startsWith("term_") &&
                  !k.startsWith("icon_") &&
                  activeEnDefault[k] !== undefined &&
                  v === activeEnDefault[k]
                ) {
                  continue;
                }
                cleanedLex[k] = v;
              }
              canonicalContent = JSON.stringify(cleanedLex, null, 2);
            }
          } else {
            canonicalContent = JSON.stringify((data as any).schema_data, null, 2);
          }
        } else if (internalCloudTarget === "sanctuary_lexicons") {
          const loadedFallback = await loadBuiltinLexiconAsync(fileId);
          canonicalContent = JSON.stringify(loadedFallback || {}, null, 2);
        } else if (internalCloudTarget === "sanctuary_schemas") {
          const fallbackSchema =
            fileId.toLowerCase() === "default"
              ? getCachedOrBundledDefaultSchema()
              : getBundledSchema(fileId) || useStore.getState().activeGameSchema;
          canonicalContent = JSON.stringify(
            fallbackSchema || { schema_version: 1 },
            null,
            2
          );
        } else {
          canonicalContent = '{\n  "schema_version": 1\n}';
        }
      } else {
        canonicalContent = await readTextFile(file.path);
      }

      // Check local draft cache so unsaved edits are never lost when closing the IDE
      let workingContent = canonicalContent;
      const fileId = file.name.replace(/\.json$/i, "");
      if (isCloudMode && internalCloudTarget === "sanctuary_schemas") {
        let parsedCanonical: any = null;
        try {
          parsedCanonical = JSON.parse(canonicalContent);
        } catch {}
        const validSchemaDraft = getValidCloudSchemaDraft(
          file.path,
          fileId,
          parsedCanonical
        );
        if (validSchemaDraft && validSchemaDraft.raw !== canonicalContent) {
          workingContent = validSchemaDraft.raw;
        }
      } else {
        const cachedDraft = getIdeCachedDraft(file.path);
        if (cachedDraft && cachedDraft !== canonicalContent) {
          let useCached = true;
          const normalizedDraftId = normalizeLexId(fileId);
          if (
            normalizedDraftId === "en-default" ||
            BUNDLED_DELTA_LEXICON_IDS.includes(normalizedDraftId)
          ) {
            try {
              const parsedDraft = JSON.parse(cachedDraft);
              if (
                (normalizedDraftId !== "en-default" && Object.keys(parsedDraft).length > 2000) ||
                (normalizedDraftId !== "en-sanctuary" &&
                  parsedDraft?._meta_name === "English: Sanctuary")
              ) {
                // Discard stale pre-sparse-delta or mislabeled draft
                clearIdeCachedDraft(file.path);
                useCached = false;
              }
            } catch {}
          }
          if (useCached) {
            workingContent = cachedDraft;
          }
        }
      }

      // Closed = Closed: only the active opened file lives in openFiles
      setOpenFiles([
        {
          ...file,
          content: workingContent,
          originalContent: canonicalContent,
        },
      ]);
      setActiveFileIndex(0);
      setActiveVersionTimestamp(null);
    } catch (e) {
      pushStatus(t("err_open", "Failed to open file."), "error");
    }
  };

  // Closed = Closed: closing the IDE closes the file completely (any unsaved edits are already persisted in localStorage draft cache)
  const closeFile = (index?: number, e?: React.MouseEvent) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (typeof index === "number" && openFiles[index]) {
      const f = openFiles[index];
      setIdeCachedDraft(f.path, f.content, f.originalContent);
    } else if (activeFileIndex >= 0 && openFiles[activeFileIndex]) {
      const f = openFiles[activeFileIndex];
      setIdeCachedDraft(f.path, f.content, f.originalContent);
    }
    setOpenFiles([]);
    setActiveFileIndex(-1);
    setActiveVersionTimestamp(null);
  };

  const discardChanges = () => {
    if (activeFileIndex < 0 || !openFiles[activeFileIndex]) return;
    const current = openFiles[activeFileIndex];
    clearIdeCachedDraft(current.path);
    const updated = [...openFiles];
    updated[activeFileIndex] = {
      ...current,
      content: current.originalContent,
    };
    setOpenFiles(updated);
    if (editorRef && (window as any).monaco) {
      validateContent(current.originalContent, (window as any).monaco, editorRef.getModel());
    }
    pushStatus(t("lex_studio_discarded_draft", "Reverted unsaved changes."), "info");
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || activeFileIndex < 0) return;
    const newFiles = [...openFiles];
    const targetFile = newFiles[activeFileIndex];
    if (!targetFile) return;
    targetFile.content = value;
    setIdeCachedDraft(targetFile.path, value, targetFile.originalContent);
    setOpenFiles(newFiles);
    if (editorRef && (window as any).monaco) {
      validateContent(value, (window as any).monaco, editorRef.getModel());
    }
  };

  const handleDeleteFile = async (path: string) => {
    try {
      if (isCloudMode) {
        const fileId = path.replace("cloud://", "");
        const client = isKeepers
          ? (await import("../supabase")).supabaseAuth
          : (await import("../supabase")).supabase;
        const token = session?.access_token;
        if (!isKeepers && token) {
          const { error } = await client.rpc("secure_delete_cloud_file", {
            p_token: token,
            p_target: internalCloudTarget,
            p_id: fileId,
          });
          if (error) throw error;
        } else {
          const { error } = await client.from(internalCloudTarget).delete().eq("id", fileId);
          if (error) throw error;
        }
      } else {
        await remove(path);
      }
      clearIdeCachedDraft(path);
      const openIdx = openFiles.findIndex((f: any) => f.path === path);
      if (openIdx >= 0) {
        closeFile(openIdx);
      }
      fetchFiles();
      pushStatus(t("msg_template_deleted", "Template deleted."), "success");
    } catch (e) {
      console.error("Error deleting file", e);
      pushStatus(t("msg_template_delete_failed", "Failed to delete template."), "error");
    }
  };

  const handleRenameSubmit = async (oldPath: string, oldName: string) => {
    const lastDot = oldName.lastIndexOf(".");
    const oldExt = lastDot > 0 ? oldName.substring(lastDot) : "";
    const baseOldName = lastDot > 0 ? oldName.substring(0, lastDot) : oldName;
    const currentExt = renameExt.startsWith(".") ? renameExt : renameExt ? "." + renameExt : "";
    if (!renameInput.trim() || (renameInput === baseOldName && currentExt === oldExt)) {
      setRenamingFile(null);
      return;
    }
    try {
      if (isCloudMode) {
        const oldId = baseOldName;
        const newId = renameInput.trim();
        const client = (await import("../supabase")).supabase;

        const { data: oldData, error: fetchErr } = await client
          .from(internalCloudTarget)
          .select(
            internalCloudTarget === "sanctuary_games"
              ? "id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor"
              : "*"
          )
          .eq("id", oldId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;

        const newData = { ...(oldData as any), id: newId, name: newId };
        const token = session?.access_token;

        if (!isKeepers && token) {
          const { error: insertErr } = await client.rpc("secure_upsert_cloud_file", {
            p_token: token,
            p_target: internalCloudTarget,
            p_payload: newData,
          });
          if (insertErr) throw insertErr;
          await client.rpc("secure_delete_cloud_file", {
            p_token: token,
            p_target: internalCloudTarget,
            p_id: oldId,
          });
        } else {
          const { error: insertErr } = await client.from(internalCloudTarget).insert(newData);
          if (insertErr) throw insertErr;
          await client.from(internalCloudTarget).delete().eq("id", oldId);
        }

        const newName = newId + currentExt;
        const newPath = "cloud://" + newId;

        clearIdeCachedDraft(oldPath);
        setRenamingFile(null);
        const openIdx = openFiles.findIndex((f: any) => f.path === oldPath);
        if (openIdx >= 0) {
          const newFiles = [...openFiles];
          newFiles[openIdx] = { ...newFiles[openIdx], name: newName, path: newPath };
          setOpenFiles(newFiles);
        }
        fetchFiles();
        pushStatus(t("auto_saved", "Renamed successfully"), "success");
        return;
      }

      const newName = renameInput.trim() + currentExt;
      const lastSlash = Math.max(oldPath.lastIndexOf("/"), oldPath.lastIndexOf("\\"));
      const newPath = oldPath.substring(0, lastSlash) + "/" + newName;

      const content = await readTextFile(oldPath);
      await writeTextFile(newPath, content);
      await remove(oldPath);

      clearIdeCachedDraft(oldPath);
      setRenamingFile(null);
      const openIdx = openFiles.findIndex((f: any) => f.path === oldPath);
      if (openIdx >= 0) {
        const newFiles = [...openFiles];
        newFiles[openIdx] = { ...newFiles[openIdx], name: newName, path: newPath };
        setOpenFiles(newFiles);
      }
      fetchFiles();
      pushStatus(t("auto_saved", "Renamed successfully"), "success");
    } catch (e) {
      console.error("Error renaming file", e);
      pushStatus(t("alert_error", "Error saving:"), "error");
    }
  };

  const buildInitialLexiconDict = (
    displayName: string,
    lang: string,
    author: string,
    starterPreset?: string
  ): Record<string, any> => {
    const dict: Record<string, any> = {
      _meta_name: displayName,
      _meta_lang: lang || "en",
      _meta_author: author,
      _meta_version: 1,
    };
    if (starterPreset && starterPreset !== "en-default") {
      if (starterPreset === "en-sanctuary") {
        for (const term of CORE_GLOSSARY_TERMS) {
          dict[term.key] = term.defaults["en-sanctuary"];
        }
      } else {
        const sourceDict = registry?.[starterPreset] || {};
        for (const term of CORE_GLOSSARY_TERMS) {
          if (sourceDict[term.key]) {
            dict[term.key] = sourceDict[term.key];
          }
        }
      }
    }
    return dict;
  };

  const handleCreateSubmit = async (lexiconOptions?: CreateLexiconOptions) => {
    const isLexiconCreation =
      Boolean(lexiconOptions) ||
      (isCloudMode && internalCloudTarget === "sanctuary_lexicons") ||
      (!isCloudMode && createMode === "lexicon");

    const effectiveRawId = lexiconOptions?.fileId || createFileName;
    if (!effectiveRawId.trim()) return;
    if (!lexiconOptions && createMode === "lexicon" && !lexiconLang.trim()) return;

    try {
      const storeState = useStore.getState() as any;
      const activeWs = (storeState.workspaces || []).find(
        (w: any) =>
          String(w.id).toLowerCase() === String(storeState.activeWorkspaceId || "").toLowerCase() ||
          String(w.schema_id || "").toLowerCase() ===
            String(storeState.activeWorkspaceId || "").toLowerCase()
      );
      const spokeDisplayName =
        activeWs?.name ||
        storeState.activeGameSchema?.display_name ||
        storeState.activeGameSchema?.name ||
        "Community";

      if (isCloudMode) {
        const fileId = effectiveRawId.trim().replace(/\.json$/i, "");
        const supabaseMod = await import("../supabase");
        const client = isKeepers ? supabaseMod.supabaseAuth : supabaseMod.supabase;
        const resolvedAuthor = isKeepers
          ? "Sanctuary Foundry"
          : session?.user?.user_metadata?.username || spokeDisplayName;
        const contentToSave = isLexiconCreation
          ? buildInitialLexiconDict(
              lexiconOptions?.displayName?.trim() || fileId,
              lexiconOptions?.lang?.trim() || lexiconLang.toLowerCase(),
              resolvedAuthor,
              lexiconOptions?.starterPreset
            )
          : { schema_version: 1, metadata: {} };
        const payload =
          internalCloudTarget === "sanctuary_lexicons"
            ? {
                id: fileId,
                name: fileId,
                badge: isKeepers ? "Sanctuary" : spokeDisplayName,
                version: 1,
                lexicon_data: contentToSave,
                updated_at: new Date().toISOString(),
              }
            : {
                id: fileId,
                name: fileId,
                schema_data: contentToSave,
                version: 1,
                updated_at: new Date().toISOString(),
              };

        let error = null;
        const token = session?.access_token;
        if (!isKeepers && token) {
          const res = await client.rpc("secure_upsert_cloud_file", {
            p_token: token,
            p_target: internalCloudTarget,
            p_payload: payload,
          });
          error = res.error;
        } else {
          const res = await client.from(internalCloudTarget).upsert(payload as any);
          error = res.error;
        }

        if (error) {
          pushStatus(t("alert_error", "Error saving:"), "error");
          return;
        }
        setIsCreatePanelOpen(false);
        setCreateFileName("");
        fetchFiles();
        openFile({ name: fileId + ".json", path: "cloud://" + fileId });
        return;
      }
      if (!vaultPath) return;
      const sandboxDir = resolveMasonSandboxDir(vaultPath);
      const baseName = lexiconOptions
        ? lexiconOptions.fileId.trim().replace(/\.json$/i, "")
        : createMode === "lexicon"
          ? `${lexiconLang.toLowerCase()}-${createFileName.trim()}`
          : createFileName.trim();
      const ext = isLexiconCreation
        ? ".json"
        : createFileExt.startsWith(".")
          ? createFileExt
          : "." + createFileExt;
      const newName = baseName + ext;
      const newPath = `${sandboxDir}/${newName}`;
      if (await exists(newPath)) {
        pushStatus(t("alert_error", "Error saving:"), "error");
        return;
      }

      let initialContent = "";
      if (isLexiconCreation) {
        const localDict = buildInitialLexiconDict(
          lexiconOptions?.displayName?.trim() || createFileName.trim() || baseName,
          lexiconOptions?.lang?.trim() || lexiconLang.toLowerCase(),
          session?.user?.user_metadata?.username || "Creator",
          lexiconOptions?.starterPreset
        );
        initialContent = JSON.stringify(localDict, null, 2);
      }

      await writeTextFile(newPath, initialContent);
      setIsCreatePanelOpen(false);
      setCreateFileName("");
      fetchFiles();

      openFile({ name: newName, path: newPath });
    } catch (e) {
      console.error("Error creating file", e);
      pushStatus(t("alert_error", "Error saving:"), "error");
    }
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Config Files", extensions: ["json", "cfg", "ini"] }],
      });
      if (selected && selected.length > 0) {
        if (isCloudMode) {
          const client = isKeepers
            ? (await import("../supabase")).supabaseAuth
            : (await import("../supabase")).supabase;
          const token = session?.access_token;
          for (const path of selected) {
            const name = path.split("\\").pop()?.split("/").pop() || "imported_file.json";
            const fileId = name.replace(/\.json$/i, "");
            const content = await readTextFile(path);
            const parsed = JSON.parse(content);
            const payload =
              internalCloudTarget === "sanctuary_lexicons"
                ? {
                    id: fileId,
                    name: fileId,
                    badge: parsed._meta_badge || "Sanctuary",
                    version: parsed._meta_version || 1,
                    lexicon_data: parsed,
                    updated_at: new Date().toISOString(),
                  }
                : {
                    id: fileId,
                    name: parsed.manifest_name || fileId,
                    schema_data: parsed,
                    version: parsed.schema_version || 1,
                    updated_at: new Date().toISOString(),
                  };
            if (!isKeepers && token) {
              await client.rpc("secure_upsert_cloud_file", {
                p_token: token,
                p_target: internalCloudTarget,
                p_payload: payload,
              });
            } else {
              await client.from(internalCloudTarget).upsert(payload as any);
            }
          }
          fetchFiles();
          pushStatus(t("auto_imported", "Files imported"), "success");
          return;
        }
        if (!vaultPath) return;
        const sandboxDir = resolveMasonSandboxDir(vaultPath);
        const dirExists = await exists(sandboxDir);
        if (!dirExists) return;

        for (const path of selected) {
          const name = path.split("\\").pop()?.split("/").pop() || "imported_file.json";
          const content = await readTextFile(path);
          await writeTextFile(`${sandboxDir}/${name}`, content);
        }
        fetchFiles();
        pushStatus(t("auto_imported", "Files imported"), "success");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return {
    t,
    session,
    pushStatus,
    files,
    setFiles,
    isScanning,
    showTimeline,
    setShowTimeline,
    searchQuery,
    setSearchQuery,
    fileTypeFilter,
    setFileTypeFilter,
    lexiconScopeFilter,
    setLexiconScopeFilter,
    lexiconLanguageFilter,
    setLexiconLanguageFilter,
    lexiconCommunityFilter,
    setLexiconCommunityFilter,
    problemsList,
    setProblemsList,
    activeVersionTimestamp,
    setActiveVersionTimestamp,
    editorRef,
    setEditorRef,
    renamingFile,
    setRenamingFile,
    renameInput,
    setRenameInput,
    renameExt,
    setRenameExt,
    deleteConfirmPath,
    setDeleteConfirmPath,
    isCreatePanelOpen,
    setIsCreatePanelOpen,
    createMode,
    setCreateMode,
    lexiconLang,
    setLexiconLang,
    createFileName,
    setCreateFileName,
    createFileExt,
    setCreateFileExt,
    showReference,
    setShowReference,
    referenceData,
    setReferenceData,
    referenceLabel,
    setReferenceLabel,
    internalCloudTarget,
    setInternalCloudTarget,
    splitRatio,
    setSplitRatio,
    isFullscreen,
    setIsFullscreen,
    uploadState,
    setUploadState,
    fetchError,
    setFetchError,
    openFiles,
    setOpenFiles,
    activeFileIndex,
    setActiveFileIndex,
    fetchFiles,
    validateContent,
    openFile,
    closeFile,
    discardChanges,
    handleEditorChange,
    handleDeleteFile,
    handleRenameSubmit,
    handleCreateSubmit,
    handleImport,
  };
}
