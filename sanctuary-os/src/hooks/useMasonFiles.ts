import { useState, useEffect } from "react";
import { useStore } from "../store";
import { readDir, readTextFile, writeTextFile, exists, remove } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import enDefault from "../lexicons/en-default.json";
import enSanctuary from "../lexicons/en-sanctuary.json";
import enSims from "../lexicons/en-sims.json";
import simlish from "../lexicons/Simlish.json";
import { useLexicon } from "../LexiconContext";

const BUNDLED_LEXICONS: Record<string, any> = {
  "en-default": enDefault,
  "en-sanctuary": enSanctuary,
  "en-sims": enSims,
  Simlish: simlish,
};

const CORE_LEXICON_ORDER = ["en-default", "en-sanctuary", "en-sims", "Simlish"];

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
  const { t } = useLexicon();
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

        if (internalCloudTarget === "sanctuary_lexicons") {
          const [primaryRes, spokeRes] = await Promise.all([
            primaryClient
              .from("sanctuary_lexicons")
              .select("id, name, badge, version, lexicon_data"),
            isKeepers
              ? supabaseMod.supabase
                  .from("sanctuary_lexicons")
                  .select("id, name, badge, version, lexicon_data")
              : Promise.resolve({ data: [] as any[], error: null }),
          ]);

          if (primaryRes.error) {
            console.error("Cloud fetch error:", primaryRes.error);
            setFetchError(primaryRes.error.message || JSON.stringify(primaryRes.error));
          } else {
            setFetchError(null);
          }

          const rowMap = new Map<string, any>();
          for (const row of spokeRes.data || []) {
            if (row?.id) rowMap.set(String(row.id), row);
          }
          for (const row of primaryRes.data || []) {
            if (row?.id) rowMap.set(String(row.id), row);
          }

          const seedIds = isKeepers
            ? ["en-default", "en-sanctuary", "en-sims", "Simlish"]
            : ["en-sims", "Simlish"];
          for (const id of seedIds) {
            if (!rowMap.has(id)) {
              rowMap.set(id, {
                id,
                name: id,
                badge: id === "en-sims" || id === "Simlish" ? "The Sims 4" : "Sanctuary",
                version: 1,
                lexicon_data: BUNDLED_LEXICONS[id] || {},
              });
            }
          }

          let mapped = Array.from(rowMap.values()).map((row: any) => {
            const id = String(row.id);
            const bundled = BUNDLED_LEXICONS[id];
            const lexData = bundled || row.lexicon_data || {};
            const isOfficialCore = CORE_LEXICON_ORDER.includes(id);
            const displayName =
              lexData?._meta_name ||
              (id === "en-default"
                ? "English: Default"
                : id === "en-sanctuary"
                  ? "English: Sanctuary"
                  : id === "en-sims"
                    ? "English: The Sims"
                    : id === "Simlish"
                      ? "Simlish"
                      : row.name || id);
            const language = resolveLanguageLabel(
              lexData?._meta_lang || (id === "Simlish" ? "Simlish" : "en")
            );
            const community =
              row.badge ||
              lexData?._meta_badge ||
              (id === "en-default" || id === "en-sanctuary"
                ? "Sanctuary"
                : id === "en-sims" || id === "Simlish"
                  ? "The Sims 4"
                  : "Community");
            const author =
              lexData?._meta_author || (isOfficialCore ? "Sanctuary Foundry" : "Community");

            return {
              name: `${id}.json`,
              path: `cloud://${id}`,
              displayName,
              language,
              community,
              author,
              isOfficialCore,
              version: row.version || lexData?._meta_version || 1,
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
          if (row?.id) rowMap.set(String(row.id), row);
        }
        if (internalCloudTarget === "sanctuary_schemas") {
          const activeGameSchema = useStore.getState().activeGameSchema;
          const activeSchemaId = activeGameSchema?.id;
          if (activeSchemaId && !rowMap.has(String(activeSchemaId))) {
            rowMap.set(String(activeSchemaId), {
              id: String(activeSchemaId),
              name: activeGameSchema?.display_name || activeGameSchema?.name || String(activeSchemaId),
              schema_data: activeGameSchema,
              version: activeGameSchema?.schema_version || 1,
            });
          }
          if (isKeepers && rowMap.size === 0) {
            rowMap.set("default", { id: "default", name: "Default Master Schema" });
            rowMap.set("sims4", { id: "sims4", name: "The Sims 4" });
          }
        }
        const mapped = Array.from(rowMap.entries())
          .map(([id, row]) => {
            const path = `cloud://${id}`;
            const schemaData = row?.schema_data || null;
            const cachedDraft = getIdeCachedDraft(path);
            let parsedDraft: any = null;
            if (cachedDraft) {
              try {
                parsedDraft = JSON.parse(cachedDraft);
              } catch {}
            }
            const effectiveSchema = parsedDraft || schemaData || {};
            const displayTitle =
              row?.name ||
              effectiveSchema?.display_name ||
              effectiveSchema?.name ||
              effectiveSchema?.game_name ||
              id;
            return {
              name: `${id}.json`,
              path,
              displayTitle,
              author: effectiveSchema?.author || effectiveSchema?._meta_author || "Sanctuary Core",
              version: row?.version || effectiveSchema?.schema_version || 1,
              updated_at: row?.updated_at || row?.created_at || null,
              schema_data: schemaData,
              cachedDraft: cachedDraft || null,
              hasUnsavedDraft: hasIdeCachedDraft(path),
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
        setReferenceData(enDefault);
        setReferenceLabel("en-default.json Reference");
      } else {
        const { supabaseAuth } = await import("../supabase");
        const client = supabaseAuth;
        const { data } = await client
          .from("sanctuary_schemas")
          .select("schema_data")
          .eq("id", "default")
          .maybeSingle();
        if (data && Object.keys((data as any).schema_data || {}).length > 0) {
          setReferenceData((data as any).schema_data);
          setReferenceLabel("Default Master Schema");
        }
      }
    };
    fetchRef();
  }, [isCloudMode ? cloudActiveFileIndex : localActiveFileIndex, isCloudMode, internalCloudTarget]);

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

        if (internalCloudTarget === "sanctuary_lexicons" && BUNDLED_LEXICONS[fileId]) {
          // Built-in Master Lexicons: use canonical 1,253-key bundled lexicon & sync cloud if needed
          const bundledObj = { ...BUNDLED_LEXICONS[fileId] };
          canonicalContent = JSON.stringify(bundledObj, null, 2);

          // Check if cloud row still has deprecated keys and auto-sync in background
          (async () => {
            try {
              const { data } = await client
                .from("sanctuary_lexicons")
                .select("id, name, badge, version, lexicon_data")
                .eq("id", fileId)
                .maybeSingle();
              const cloudKeys = Object.keys((data as any)?.lexicon_data || {});
              const bundledKeys = Object.keys(bundledObj);
              if (cloudKeys.length !== bundledKeys.length) {
                const payload = {
                  id: fileId,
                  name: (data as any)?.name || fileId,
                  badge:
                    (data as any)?.badge ||
                    bundledObj._meta_badge ||
                    (fileId === "en-sims" || fileId === "Simlish" ? "The Sims 4" : "Sanctuary"),
                  version: (data as any)?.version || bundledObj._meta_version || 1,
                  lexicon_data: bundledObj,
                  updated_at: new Date().toISOString(),
                };
                if (isKeepers) {
                  await supabaseMod.supabaseAuth
                    .from("sanctuary_lexicons")
                    .upsert(payload as any);
                } else {
                  const token = useStore.getState().session?.access_token;
                  if (token) {
                    await supabaseMod.supabase.rpc("secure_upsert_cloud_file", {
                      p_token: token,
                      p_target: "sanctuary_lexicons",
                      p_payload: payload,
                    });
                  }
                }
              }
            } catch {}
          })();
        } else {
          let { data, error } = await client
            .from(internalCloudTarget)
            .select(internalCloudTarget === "sanctuary_lexicons" ? "lexicon_data" : "schema_data")
            .eq("id", fileId)
            .maybeSingle();

          if ((!data || error) && isKeepers && internalCloudTarget === "sanctuary_lexicons") {
            const spokeFallback = await supabaseMod.supabase
              .from("sanctuary_lexicons")
              .select("lexicon_data")
              .eq("id", fileId)
              .maybeSingle();
            if (!spokeFallback.error && spokeFallback.data) {
              data = spokeFallback.data;
              error = null;
            }
          }

          if (!error && data) {
            if (internalCloudTarget === "sanctuary_lexicons") {
              const rawLex = (data as any).lexicon_data || {};
              const cleanedLex: Record<string, any> = {};
              for (const [k, v] of Object.entries(rawLex)) {
                if (k.startsWith("_meta")) {
                  cleanedLex[k] = v;
                  continue;
                }
                if (v === "" || v === null || v === undefined) continue;
                if (
                  !k.startsWith("term_") &&
                  !k.startsWith("icon_") &&
                  (enDefault as any)[k] === undefined
                ) {
                  continue;
                }
                cleanedLex[k] = v;
              }
              canonicalContent = JSON.stringify(cleanedLex, null, 2);
            } else {
              canonicalContent = JSON.stringify((data as any).schema_data, null, 2);
            }
          } else if (internalCloudTarget === "sanctuary_schemas" && useStore.getState().activeGameSchema) {
            canonicalContent = JSON.stringify(useStore.getState().activeGameSchema, null, 2);
          } else {
            canonicalContent = '{\n  "schema_version": 1\n}';
          }
        }
      } else {
        canonicalContent = await readTextFile(file.path);
      }

      // Check local draft cache so unsaved edits are never lost when closing the IDE
      let workingContent = canonicalContent;
      const cachedDraft = getIdeCachedDraft(file.path);
      if (cachedDraft && cachedDraft !== canonicalContent) {
        let useCached = true;
        const fileId = file.name.replace(/\.json$/i, "");
        if (BUNDLED_LEXICONS[fileId]) {
          try {
            const parsedDraft = JSON.parse(cachedDraft);
            if (Object.keys(parsedDraft).length > 1400) {
              // Discard stale pre-simplification 2,300+ key draft
              clearIdeCachedDraft(file.path);
              useCached = false;
            }
          } catch {}
        }
        if (useCached) {
          workingContent = cachedDraft;
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

  const handleCreateSubmit = async () => {
    if (!createFileName.trim()) return;
    if (createMode === "lexicon" && !lexiconLang.trim()) return;
    try {
      if (isCloudMode) {
        const fileId = createFileName.trim();
        const client = (await import("../supabase")).supabase;
        const contentToSave =
          (isCloudMode && internalCloudTarget === "sanctuary_lexicons") ||
          (!isCloudMode && createMode === "lexicon")
            ? { _meta_lang: lexiconLang.toLowerCase(), _meta_name: fileId }
            : { schema_version: 1, metadata: {} };
        const payload =
          internalCloudTarget === "sanctuary_lexicons"
            ? {
                id: fileId,
                name: fileId,
                badge: "Sanctuary",
                version: 1,
                lexicon_data: contentToSave,
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
          const res = await client.from(internalCloudTarget).insert(payload as any);
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
      const normalizedVault = vaultPath.replace(/\\/g, "/");
      let baseDir = normalizedVault;
      if (baseDir.toLowerCase().endsWith("/mods"))
        baseDir = baseDir.substring(0, baseDir.length - 5);
      else if (baseDir.toLowerCase().endsWith("mods"))
        baseDir = baseDir.substring(0, baseDir.length - 4);
      const sandboxDir = `${baseDir}/Dev/Sandbox`;
      const baseName =
        createMode === "lexicon"
          ? `${lexiconLang.toLowerCase()}-${createFileName.trim()}`
          : createFileName.trim();
      const ext =
        createMode === "lexicon"
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
      if (createMode === "lexicon") {
        const emptyLexicon: any = {
          _meta_lang: lexiconLang.toLowerCase(),
          _meta_name: createFileName.trim(),
          _meta_author: session?.user?.user_metadata?.username || "Unknown",
        };
        for (const key of Object.keys(enDefault)) {
          if (key.startsWith("term_")) {
            emptyLexicon[key] = (enDefault as any)[key] || "";
          }
        }
        initialContent = JSON.stringify(emptyLexicon, null, 2);
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
        const normalizedVault = vaultPath.replace(/\\/g, "/");
        let baseDir = normalizedVault;
        if (baseDir.toLowerCase().endsWith("/mods"))
          baseDir = baseDir.substring(0, baseDir.length - 5);
        else if (baseDir.toLowerCase().endsWith("mods"))
          baseDir = baseDir.substring(0, baseDir.length - 4);
        const sandboxDir = `${baseDir}/Dev/Sandbox`;
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
