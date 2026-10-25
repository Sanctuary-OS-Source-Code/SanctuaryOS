import { useState, useEffect, useRef } from "react";
import {
  SidePanel,
  SidePanelHeroCard,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  UniversalGroup,
  ActionButton,
  CustomDropdown,
} from "../shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
} from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useTheme, DEFAULT_CORE_THEMES } from "../ThemeContext";
import enDefault from "../lexicons/en-default.json";

import {
  ThemeCard,
  DynamicLexiconPreviewBanner,
} from "../chameleon-components/ThemeCard";
import { ChameleonControlDashboard } from "../chameleon-components/ChameleonControlDashboard";
import { ChameleonSandboxPreview } from "../chameleon-components/ChameleonSandboxPreview";
import {
  autoHarmonizeThemeColors,
  exportThemeWithAssets,
  importThemeWithAssets,
} from "../chameleon-components/ChameleonShared";
import MasonFileBrowser from "./MasonFileBrowser";
import MasonEditorPanel from "./MasonEditorPanel";
import {
  buildTitleAreaIdeJsonObject,
  parseTitleAreaIdeJsonToConfig,
  KeepersLogoSidePanel,
} from "./KeepersTitleAreaStudio";
import {
  useMasonFiles,
  hasIdeCachedDraft,
  getIdeCachedDraft,
  clearIdeCachedDraft,
} from "../hooks/useMasonFiles";
import {
  deepCountKeys,
  deepCompare,
  deepAddMissing,
  deepPurgeDeprecated,
} from "../lib/MasonValidation";
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from "../utils/monacoTheme";

export function WayfinderChameleons({
  isKeepers = false,
  initialTab = "overview",
}: {
  isKeepers?: boolean;
  initialTab?: string;
}) {
  const { t, osLogoUrl, titleAreaConfig, saveTitleAreaConfig } = useLexicon();
  const pushStatus = useStore((state: any) => state.pushStatus);
  const { activeThemeId, setActiveThemeId, setCoreThemes, currentTheme } = useTheme();
  const [isLogoPanelOpen, setIsLogoPanelOpen] = useState(false);

  const mason = useMasonFiles({
    isCloudMode: true,
    cloudTarget: "sanctuary_lexicons",
    isKeepers,
  });

  const {
    files: lexiconFiles,
    showTimeline,
    setShowTimeline,
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
    isCreatePanelOpen: isCreateLexiconOpen,
    setIsCreatePanelOpen: setIsCreateLexiconOpen,
    lexiconLang,
    setLexiconLang,
    createFileName,
    setCreateFileName,
    showReference,
    setShowReference,
    referenceData,
    referenceLabel,
    splitRatio,
    setSplitRatio,
    isFullscreen,
    setIsFullscreen,
    openFiles,
    setOpenFiles,
    activeFileIndex,
    setActiveFileIndex,
    validateContent,
    openFile,
    closeFile,
    handleEditorChange,
    handleDeleteFile,
    handleRenameSubmit,
    handleCreateSubmit,
    handleImport,
    fetchFiles,
  } = mason;

  const [cloudThemes, setCloudThemes] = useState<Record<string, any>>({});
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [themeStatusFilter, setThemeStatusFilter] = useState<string>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [activeEditingTheme, setActiveEditingTheme] = useState<any>(null);
  const [originalThemeId, setOriginalThemeId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const isResizing = useRef(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      setSplitRatio((prev: number) => {
        const containerWidth = window.innerWidth - 300;
        const deltaPct = (e.movementX / containerWidth) * 100;
        return Math.max(20, Math.min(80, prev + deltaPct));
      });
    };
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "default";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim();
  const bgHex = bg.replace("#", "");
  const r = parseInt(bgHex.substring(0, 2), 16) || 0;
  const g = parseInt(bgHex.substring(2, 4), 16) || 0;
  const b = parseInt(bgHex.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.5;

  useSanctuaryMonacoTheme(currentTheme, isLight);

  const handleEditorWillMount = (monaco: any) => {
    defineSanctuaryMonacoThemes(monaco, currentTheme);
  };

  useEffect(() => {
    fetchThemes();
  }, [isKeepers]);

  const fetchThemes = async () => {
    setLoading(true);
    try {
      const themesMap: Record<string, any> = {};
      if (isKeepers) {
        Object.entries(DEFAULT_CORE_THEMES).forEach(([id, th]: [string, any]) => {
          themesMap[id] = { ...th, id, is_active: true };
        });
      } else {
        const state = useStore.getState();
        const activeWs = (state.workspaces || []).find(
          (w: any) => w.id === state.activeWorkspaceId
        );
        const wsSchemaId = activeWs?.schema_id || "sims4";
        if (DEFAULT_CORE_THEMES[wsSchemaId]) {
          themesMap[wsSchemaId] = {
            ...DEFAULT_CORE_THEMES[wsSchemaId],
            id: wsSchemaId,
            is_active: true,
          };
        }
      }

      const supabaseMod = await import("../supabase");
      const client = isKeepers
        ? supabaseMod.supabaseAuth
        : supabaseMod.getActiveGameClient() || supabaseMod.supabase;

      const { data, error } = await client.from("sanctuary_themes").select("*");
      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => {
          const parsedData =
            typeof row.theme_data === "string"
              ? JSON.parse(row.theme_data)
              : row.theme_data || {};
          themesMap[row.id] = {
            ...(themesMap[row.id] || {}),
            ...parsedData,
            id: row.id,
            name: row.name || parsedData.name || row.id,
          };
        });
      }

      if (Object.keys(themesMap).length === 0) {
        Object.entries(DEFAULT_CORE_THEMES).forEach(([id, th]: [string, any]) => {
          themesMap[id] = { ...th, id, is_active: true };
        });
      }

      setCloudThemes(themesMap);
    } catch (err: any) {
      console.error(err);
      pushStatus(`${t("alert_error", "Error:")} ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTheme = (updates: any) => {
    setHasChanges(true);
    setActiveEditingTheme((prev: any) => ({ ...prev, ...updates }));

    if (editingThemeId) {
      setCoreThemes((prevCore: any) => {
        const baseTheme = prevCore[editingThemeId] || activeEditingTheme;
        return {
          ...prevCore,
          [editingThemeId]: { ...baseTheme, ...updates },
        };
      });
    }
  };

  const saveToCloud = async () => {
    if (!editingThemeId || !activeEditingTheme) return;
    setIsSaving(true);
    try {
      const payload = {
        id: editingThemeId,
        name: activeEditingTheme.name || editingThemeId,
        theme_data: activeEditingTheme,
        updated_at: new Date().toISOString(),
      };

      const { supabase, supabaseAuth } = await import("../supabase");
      const token = useStore.getState().session?.access_token;

      if (!isKeepers && token) {
        const { error } = await supabase.rpc("secure_upsert_cloud_file", {
          p_token: token,
          p_target: "sanctuary_themes",
          p_payload: payload,
        });
        if (error) throw error;
      } else {
        const { error } = await supabaseAuth.from("sanctuary_themes").upsert(payload);
        if (error) throw error;
      }

      pushStatus(t("ui_saved_personal", "Master Theme saved to cloud."), "success");
      setHasChanges(false);
      setCloudThemes((prev) => ({ ...prev, [editingThemeId]: activeEditingTheme }));
    } catch (err: any) {
      console.error(err);
      pushStatus(`${t("alert_error", "Error:")} ${err.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCloudTheme = async (id: string) => {
    try {
      const { supabase, supabaseAuth } = await import("../supabase");
      const token = useStore.getState().session?.access_token;
      if (!isKeepers && token) {
        const { error } = await supabase.rpc("secure_delete_cloud_file", {
          p_token: token,
          p_target: "sanctuary_themes",
          p_id: id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabaseAuth.from("sanctuary_themes").delete().eq("id", id);
        if (error) throw error;
      }
      setCloudThemes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setConfirmDelete(null);
      pushStatus(t("alert_saved", "Saved"), "success");
    } catch (err: any) {
      pushStatus(`${t("alert_error", "Error:")} ${err.message}`, "error");
    }
  };

  const openEditor = (id: string) => {
    setEditingThemeId(id);
    setActiveEditingTheme(cloudThemes[id]);
    setOriginalThemeId(activeThemeId);
    setHasChanges(false);
    if (livePreview) {
      setCoreThemes((prev: any) => ({ ...prev, [id]: cloudThemes[id] }));
      setActiveThemeId(id);
    }
  };

  const closeEditor = () => {
    setEditingThemeId(null);
    setActiveEditingTheme(null);
    setHasChanges(false);
    if (originalThemeId) {
      setActiveThemeId(originalThemeId);
    }
  };

  const renameTheme = (_id: string, newName: string) => {
    setHasChanges(true);
    setActiveEditingTheme((prev: any) => ({ ...prev, name: newName }));
  };

  const handleExportCloudTheme = (e: React.MouseEvent, themeObj: any) => {
    e.stopPropagation();
    exportThemeWithAssets(themeObj, {
      t,
      pushStatus,
    });
  };

  const createNewTheme = () => {
    const id = `theme_${Date.now()}`;
    const newTheme = {
      name: t("chameleons_new_signature", "NEW SIGNATURE"),
      bg: "#0f172a",
      sidebar: "#0f172a",
      sidebartext: "#ffffff",
      accent: "#38bdf8",
      text: "#ffffff",
      subtext: "#94a3b8",
      success: "#10b981",
      warning: "#f59e0b",
      danger: "#ef4444",
      panelTint: "#ffffff",
      headerText: "#ffffff",
      fontFamily: "Inter, sans-serif",
      fontSizeBase: "16px",
      glassOpacity: "0.10",
      glassBlur: "34px",
      radius: "1.25rem",
      bgGradient: "transparent",
    };
    setEditingThemeId(id);
    setActiveEditingTheme(newTheme);
    setOriginalThemeId(activeThemeId);
    setHasChanges(true);
    if (livePreview) {
      setCoreThemes((prev: any) => ({ ...prev, [id]: newTheme }));
      setActiveThemeId(id);
    }
  };

  const openTitleAreaIde = () => {
    const canonicalObj = buildTitleAreaIdeJsonObject(titleAreaConfig);
    const canonicalContent = JSON.stringify(canonicalObj, null, 2);
    const cachedDraft = getIdeCachedDraft("cloud://core-title-area");
    const fileEntry = {
      name: "core-title-area.json",
      path: "cloud://core-title-area",
      content: cachedDraft || canonicalContent,
      originalContent: canonicalContent,
    };
    setOpenFiles([fileEntry]);
    setActiveFileIndex(0);
    setProblemsList([]);
  };

  // Lexicon Editor helpers
  const saveFile = async () => {
    if (activeFileIndex < 0) return;
    const file = openFiles[activeFileIndex];
    try {
      const parsed = JSON.parse(file.content);

      if (file.path === "cloud://core-title-area") {
        const nextCfg = await saveTitleAreaConfig(parseTitleAreaIdeJsonToConfig(parsed));
        const canonicalContent = JSON.stringify(buildTitleAreaIdeJsonObject(nextCfg), null, 2);
        clearIdeCachedDraft(file.path);
        const newFiles = [...openFiles];
        newFiles[activeFileIndex] = {
          ...newFiles[activeFileIndex],
          content: canonicalContent,
          originalContent: canonicalContent,
        };
        setOpenFiles(newFiles);
        setActiveVersionTimestamp(null);
        pushStatus(t("alert_saved", "Saved"), "success");
        return;
      }

      if (!parsed._meta_version || typeof parsed._meta_version !== "number")
        parsed._meta_version = 0;
      parsed._meta_version++;
      if (typeof parsed.schema_version !== "undefined") delete parsed.schema_version;

      const updatedContent = JSON.stringify(parsed, null, 2);
      const fileId = file.name.replace(/\.json$/i, "");
      const { supabase, supabaseAuth } = await import("../supabase");

      const payload = {
        id: fileId,
        name: fileId,
        badge: parsed._meta_badge || "Sanctuary",
        version: parsed._meta_version || 1,
        lexicon_data: parsed,
        updated_at: new Date().toISOString(),
      };

      const token = useStore.getState().session?.access_token;
      if (!isKeepers && token) {
        const { error } = await supabase.rpc("secure_upsert_cloud_file", {
          p_token: token,
          p_target: "sanctuary_lexicons",
          p_payload: payload,
        });
        if (error) throw error;
      } else {
        const { error } = await supabaseAuth.from("sanctuary_lexicons").upsert(payload as any);
        if (error) throw error;
        if (token && fileId !== "en-default" && fileId !== "en-sanctuary") {
          try {
            await supabase.rpc("secure_upsert_cloud_file", {
              p_token: token,
              p_target: "sanctuary_lexicons",
              p_payload: payload,
            });
          } catch {}
        }
      }

      if (
        import.meta.env.DEV &&
        ["en-default", "en-sanctuary", "en-sims", "Simlish"].includes(fileId)
      ) {
        try {
          await fetch("/__update-lexicon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: fileId,
              file: `${fileId}.json`,
              content: parsed,
            }),
          });
        } catch {}
      }

      window.dispatchEvent(
        new CustomEvent("sanctuary-lexicon-updated", {
          detail: { id: fileId, lexiconData: parsed },
        })
      );

      clearIdeCachedDraft(file.path);
      const newFiles = [...openFiles];
      newFiles[activeFileIndex].content = updatedContent;
      newFiles[activeFileIndex].originalContent = updatedContent;
      setOpenFiles(newFiles);
      setActiveVersionTimestamp(null);
      pushStatus(t("alert_saved", "Saved"), "success");
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
  const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;

  let validationStats: {
    total: number;
    missing: number;
    completelyMissing: number;
    deprecated: number;
  } | null = null;
  if (activeFile) {
    try {
      const parsed = JSON.parse(activeFile.content);
      const isEnDefault = activeFile?.name.includes("en-default");
      const reference = isEnDefault
        ? null
        : referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : enDefault;
      if (reference) {
        const total = deepCountKeys(reference);
        const stats = deepCompare(reference, parsed, true);
        validationStats = { total, ...stats };
      }
    } catch {}
  }

  const addMissingStrings = () => {
    if (!activeFile) return;
    try {
      const parsed = JSON.parse(activeFile.content);
      const isEnDefault = activeFile?.name.includes("en-default");
      const reference = isEnDefault
        ? null
        : referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : enDefault;
      if (!reference) return;

      const newObj = deepAddMissing(reference, parsed, true);
      const newContent = JSON.stringify(newObj, null, 2);
      if (editorRef && editorRef.getModel()) {
        const model = editorRef.getModel();
        const fullRange = model.getFullModelRange();
        editorRef.executeEdits("add-missing", [
          { range: fullRange, text: newContent, forceMoveMarkers: true },
        ]);
      } else {
        handleEditorChange(newContent);
      }
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const purgeDeprecatedStrings = () => {
    if (!activeFile) return;
    try {
      const parsed = JSON.parse(activeFile.content);
      const isEnDefault = activeFile?.name.includes("en-default");
      const reference = isEnDefault
        ? null
        : referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : enDefault;
      if (!reference) return;

      const newObj = deepPurgeDeprecated(reference, parsed, true);
      const newContent = JSON.stringify(newObj, null, 2);
      if (editorRef && editorRef.getModel()) {
        const model = editorRef.getModel();
        const fullRange = model.getFullModelRange();
        editorRef.executeEdits("purge-deprecated", [
          { range: fullRange, text: newContent, forceMoveMarkers: true },
        ]);
      } else {
        handleEditorChange(newContent);
      }
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const jumpToNextEmpty = () => {
    if (!editorRef) return;
    const model = editorRef.getModel();
    if (!model) return;
    const matches = model.findMatches(
      '"[^"]+"\\s*:\\s*(""|\\[\\]|\\{\\})',
      false,
      true,
      false,
      null,
      true
    );
    if (matches && matches.length > 0) {
      const position = editorRef.getPosition();
      if (!position) return;
      let nextMatch = matches.find(
        (m: any) =>
          m.range.startLineNumber > position.lineNumber ||
          (m.range.startLineNumber === position.lineNumber &&
            m.range.startColumn > position.column)
      );
      if (!nextMatch) nextMatch = matches[0];
      editorRef.revealLineInCenter(nextMatch.range.startLineNumber);
      editorRef.setPosition({
        lineNumber: nextMatch.range.endLineNumber,
        column: nextMatch.range.endColumn - 1,
      });
      editorRef.focus();
    }
  };

  const allThemeEntries = Object.entries(cloudThemes);
  const unsavedLexicons = (lexiconFiles || []).filter(
    (f: any) =>
      hasIdeCachedDraft(f.path) ||
      (openFiles || []).some((o: any) => o.path === f.path && o.content !== o.originalContent)
  );
  const uniqueLexiconLanguages = Array.from(
    new Set(
      (lexiconFiles || [])
        .map((f: any) => f.language)
        .filter((l: any) => typeof l === "string" && l.trim() !== "")
    )
  ) as string[];
  const uniqueLexiconCommunities = Array.from(
    new Set(
      (lexiconFiles || [])
        .map((f: any) => f.community)
        .filter((c: any) => typeof c === "string" && c.trim() !== "")
    )
  ) as string[];
  const inactiveThemeEntries = allThemeEntries.filter(([, th]: any) => th.is_active === false);

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: String(
        allThemeEntries.length + (lexiconFiles?.length || 0) + (isKeepers ? 2 : 0)
      ),
    },
    {
      id: "lexicons",
      label: t("tab_lexicons", "Lexicons"),
      icon: t("icon_translate", "translate"),
      number: String(lexiconFiles?.length || 0),
    },
    {
      id: "chameleons",
      label: t("ui_chameleons", "{Chameleons}"),
      icon: t("icon_palette", "palette"),
      number: String(allThemeEntries.length),
    },
    ...(isKeepers
      ? [
          {
            id: "title_area",
            label: t("keepers_tab_title_area", "Title Area"),
            icon: t("icon_branding_watermark", "branding_watermark"),
            number: "2",
          },
        ]
      : []),
  ];

  const renderOverview = () => {
    const recentThemes = allThemeEntries.slice(0, 2);
    const recentLexicons = (lexiconFiles || []).slice(0, 2);
    const hasRecent = recentThemes.length > 0 || recentLexicons.length > 0;
    const hasAnomalies =
      unsavedLexicons.length > 0 ||
      inactiveThemeEntries.length > 0 ||
      Boolean(mason.fetchError);

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_schedule", "schedule")}
          iconColorClass="text-[var(--accent)]"
          title={t("chameleons_overview_recent", "Recent")}
          isEmpty={!hasRecent}
          emptyIcon={t("icon_palette", "palette")}
          emptyTitle={t("no_themes", "No {Chameleons} Found")}
          gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {recentThemes.map(([id, theme]: any) => (
            <ThemeCard
              key={id}
              id={id}
              data={theme}
              theme={theme}
              activeThemeId={activeThemeId}
              isCloud={true}
              onClick={() => openEditor(id)}
              handleExportTheme={handleExportCloudTheme}
              deleteTheme={!DEFAULT_CORE_THEMES[id] ? deleteCloudTheme : undefined}
              onDelete={!DEFAULT_CORE_THEMES[id] ? deleteCloudTheme : undefined}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
            />
          ))}
          {recentLexicons.map((file: any) => {
            const isUnsaved =
              hasIdeCachedDraft(file.path) ||
              (openFiles || []).some(
                (o: any) => o.path === file.path && o.content !== o.originalContent
              );
            const rawBaseName = file.name.replace(/\.json$/i, "");
            const displayName = file.displayName || rawBaseName;
            const displaySub = file.author
              ? `${file.author} • ${file.name}`
              : t("auto_lexicon_pack", "Lexicon Pack");
            return (
              <UniversalCard
                key={file.path}
                layout="vertical"
                customIcon={<DynamicLexiconPreviewBanner data={file} heightClass="h-full" />}
                title={displayName}
                subtitle={displaySub}
                onClick={() => openFile(file)}
                className={
                  isUnsaved ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)]" : ""
                }
                imageOverlay={
                  <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span
                        className={`material-symbols-outlined !text-[12px] ${
                          isUnsaved ? "text-[var(--warning)]" : "text-[var(--accent)]"
                        }`}
                      >
                        {isUnsaved
                          ? t("icon_warning", "warning")
                          : t("icon_cloud_done", "cloud_done")}
                      </span>
                      <span>
                        {isUnsaved ? t("unsaved_changes", "Unsaved") : t("synced", "Synced")}
                      </span>
                    </div>
                  </div>
                }
                badges={
                  <div className="flex flex-wrap items-center gap-1.5">
                    {file.community && (
                      <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {file.isOfficialCore
                            ? t("icon_verified", "verified")
                            : t("icon_public", "public")}
                        </span>
                        <span>{file.community}</span>
                      </div>
                    )}
                    <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {file.language
                          ? t("icon_language", "language")
                          : t("icon_translate", "translate")}
                      </span>
                      <span>{file.language || t("auto_lexicon_pack", "Lexicon Pack")}</span>
                    </div>
                  </div>
                }
                footer={
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 truncate font-mono">
                      {file.name}
                    </span>
                  </div>
                }
              />
            );
          })}
        </HubOverviewSection>

        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("chameleons_overview_anomalies", "Anomalies")}
          isEmpty={!hasAnomalies}
          emptyIcon={t("icon_check_circle", "check_circle")}
          emptyTitle={t("no_issues", "No issues detected")}
          gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {unsavedLexicons.map((file: any) => (
            <UniversalCard
              key={`unsaved_${file.path}`}
              layout="vertical"
              customIcon={<DynamicLexiconPreviewBanner data={file} heightClass="h-full" />}
              title={file.displayName || file.name.replace(/\.json$/i, "")}
              subtitle={t("ide_unsaved_files", "Unsaved Changes")}
              onClick={() => openFile(file)}
              className="border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
              imageOverlay={
                <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                  <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_warning", "warning")}
                    </span>
                    <span>{t("unsaved_changes", "Unsaved")}</span>
                  </div>
                </div>
              }
              badges={
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_translate", "translate")}
                    </span>
                    <span>{file.language || t("auto_lexicon_pack", "Lexicon Pack")}</span>
                  </div>
                </div>
              }
              footer={
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 truncate font-mono">
                    {file.name}
                  </span>
                </div>
              }
            />
          ))}
          {inactiveThemeEntries.slice(0, 4).map(([id, theme]: any) => (
            <ThemeCard
              key={`inactive_${id}`}
              id={id}
              data={theme}
              theme={theme}
              activeThemeId={activeThemeId}
              isCloud={true}
              onClick={() => openEditor(id)}
              deleteTheme={!DEFAULT_CORE_THEMES[id] ? deleteCloudTheme : undefined}
              onDelete={!DEFAULT_CORE_THEMES[id] ? deleteCloudTheme : undefined}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
            />
          ))}
          {mason.fetchError && (
            <UniversalCard
              key="lex_fetch_err"
              layout="vertical"
              icon={t("icon_error", "error")}
              title={t("tab_lexicons", "Lexicons")}
              subtitle={mason.fetchError}
              className="border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
              badges={
                <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                    {t("icon_error", "error")}
                  </span>
                  <span>{t("status_error", "Error")}</span>
                </div>
              }
            />
          )}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={
        isKeepers
          ? t("keepers_tab_core_aesthetics", "Core Aesthetics")
          : t("wf_tab_spoke_aesthetics", "Spoke Aesthetics")
      }
      headerSubtitle={t("ui_chameleons_subtitle", "Manage application themes")}
      headerIcon={t("icon_palette", "palette")}
      headerIconColorClass="theme-text-accent"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("ui_search_chameleons", "Search {Chameleons}...") as string}
      hideSearch={activeTab === "overview"}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={tabs}
      primaryPopover={
        activeTab === "chameleons"
          ? {
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col w-[260px] p-4 max-w-[calc(100vw-40px)] gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("status", "Status")}
                  </span>
                  <CustomDropdown
                    flat={true}
                    variant="pill"
                    disableTint={true}
                    value={themeStatusFilter}
                    onChange={(val: string[]) => setThemeStatusFilter(val[0] || "all")}
                    options={[
                      { id: "all", label: t("filter_all", "All") },
                      { id: "active", label: t("status_active", "Active") },
                      { id: "inactive", label: t("tab_inactive", "Inactive") },
                    ]}
                  />
                </div>
              ),
            }
          : activeTab === "lexicons"
            ? {
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters"),
                content: (
                  <div className="flex flex-col w-[270px] p-3 max-w-[calc(100vw-40px)] gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("scope", "Scope")}
                    </span>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      disableTint={true}
                      value={lexiconScopeFilter}
                      onChange={(val: string[]) =>
                        setLexiconScopeFilter((val?.[0] as any) || "all")
                      }
                      options={[
                        { id: "all", label: t("filter_all", "All") },
                        { id: "core", label: t("lex_studio_filter_core", "Official Core") },
                        {
                          id: "community",
                          label: t("lex_studio_filter_community", "Community Packs"),
                        },
                        { id: "unsaved", label: t("unsaved_changes", "Unsaved") },
                      ]}
                    />
                    {uniqueLexiconLanguages.length > 0 && (
                      <>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mt-1">
                          {t("language", "Language")}
                        </span>
                        <CustomDropdown
                          flat={true}
                          variant="pill"
                          disableTint={true}
                          value={lexiconLanguageFilter}
                          onChange={(val: string[]) =>
                            setLexiconLanguageFilter(val?.[0] || "all")
                          }
                          options={[
                            { id: "all", label: t("all_languages", "All Languages") },
                            ...uniqueLexiconLanguages.map((lang) => ({
                              id: lang,
                              label: lang,
                            })),
                          ]}
                        />
                      </>
                    )}
                    {uniqueLexiconCommunities.length > 0 && (
                      <>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mt-1">
                          {t("community", "Community")}
                        </span>
                        <CustomDropdown
                          flat={true}
                          variant="pill"
                          disableTint={true}
                          value={lexiconCommunityFilter}
                          onChange={(val: string[]) =>
                            setLexiconCommunityFilter(val?.[0] || "all")
                          }
                          options={[
                            { id: "all", label: t("filter_all", "All") },
                            ...uniqueLexiconCommunities.map((comm) => ({
                              id: comm,
                              label: comm,
                            })),
                          ]}
                        />
                      </>
                    )}
                  </div>
                ),
              }
            : undefined
      }
      actions={[
        {
          id: "create_theme",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_palette", "palette")}
            </span>
          ),
          label: t("chameleons_btn_new_theme", "New Theme") as string,
          onClick: createNewTheme,
        },
        {
          id: "create_lexicon",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_translate", "translate")}
            </span>
          ),
          label: t("chameleons_btn_new_lexicon", "New Lexicon") as string,
          onClick: () => setIsCreateLexiconOpen(true),
        },
        {
          id: "import_lexicon",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_upload", "upload")}
            </span>
          ),
          label: t("chameleons_btn_import_lexicon", "Import JSON") as string,
          onClick: async () => {
            if (activeTab === "themes") {
              const res = await importThemeWithAssets({ t, pushStatus });
              if (res?.theme) {
                const id = `theme_${Date.now()}`;
                const newTheme = { ...res.theme, id, is_active: true };
                setCloudThemes((prev) => ({ ...prev, [id]: newTheme }));
                setEditingThemeId(id);
                setActiveEditingTheme(newTheme);
                setOriginalThemeId(activeThemeId);
                setHasChanges(true);
              }
            } else {
              handleImport();
            }
          },
        },
        {
          id: "refresh",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_refresh", "refresh")}
            </span>
          ),
          label: t("btn_refresh", "Refresh") as string,
          onClick: () => {
            fetchThemes();
            fetchFiles();
          },
        },
      ]}
    >
      {loading && allThemeEntries.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      ) : activeTab === "overview" ? (
        renderOverview()
      ) : activeTab === "title_area" && isKeepers ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full pb-16">
          {(() => {
            const hasTitleDraft = hasIdeCachedDraft("cloud://core-title-area");
            const VAULT_CHIP_CLASS =
              "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

            return (
              <>
                <UniversalCard
                  key="title_subtitles_ide_card"
                  layout="vertical"
                  icon={t("icon_subtitles", "subtitles")}
                  title={t("title_area_card_title_subtitles", "Title & Subtitles")}
                  subtitle={`${t("lbl_by", "by")} ${t("sanctuary_foundry", "Sanctuary Foundry")}`}
                  onClick={openTitleAreaIde}
                  imageOverlay={
                    <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                      {hasTitleDraft ? (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--warning)] animate-pulse">
                            {t("icon_edit_note", "edit_note")}
                          </span>
                          <span>{t("unsaved_changes", "Unsaved")}</span>
                        </div>
                      ) : (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                            {t("icon_cloud_done", "cloud_done")}
                          </span>
                          <span>{t("synced_badge", "Synced")}</span>
                        </div>
                      )}
                    </div>
                  }
                  badges={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_verified", "verified")}
                        </span>
                        <span>{t("sanctuary_foundry", "Sanctuary Foundry")}</span>
                      </div>
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_subtitles", "subtitles")}
                        </span>
                        <span>
                          {t("title_area_card_title_subtitles", "Title & Subtitles")}
                        </span>
                      </div>
                    </div>
                  }
                  footer={
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 truncate font-mono">
                        core-title-area.json
                      </span>
                    </div>
                  }
                />

                <UniversalCard
                  key="logo_brand_sidepanel_card"
                  layout="vertical"
                  icon={t("icon_branding_watermark", "branding_watermark")}
                  title={t("title_area_logo_group", "Logo & Brand Header")}
                  subtitle={`${t("lbl_by", "by")} ${t("sanctuary_foundry", "Sanctuary Foundry")}`}
                  onClick={() => setIsLogoPanelOpen(true)}
                  imageOverlay={
                    <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                          {t("icon_check_circle", "check_circle")}
                        </span>
                        <span>{t("status_active", "Active")}</span>
                      </div>
                    </div>
                  }
                  badges={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_verified", "verified")}
                        </span>
                        <span>{t("sanctuary_foundry", "Sanctuary Foundry")}</span>
                      </div>
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_image", "image")}
                        </span>
                        <span>{t("keepers_tab_title_area", "Title Area")}</span>
                      </div>
                    </div>
                  }
                  footer={
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 truncate font-mono">
                        {(osLogoUrl || "/icon.png").startsWith("data:")
                          ? "custom-logo.png"
                          : osLogoUrl || "/icon.png"}
                      </span>
                    </div>
                  }
                />
              </>
            );
          })()}
        </div>
      ) : activeTab === "lexicons" ? (
        <MasonFileBrowser
          t={t}
          isCloudMode={true}
          internalCloudTarget="sanctuary_lexicons"
          files={lexiconFiles}
          searchQuery={searchQuery}
          fileTypeFilter="all"
          lexiconScopeFilter={lexiconScopeFilter}
          lexiconLanguageFilter={lexiconLanguageFilter}
          lexiconCommunityFilter={lexiconCommunityFilter}
          fetchError={mason.fetchError}
          openFile={openFile}
          renamingFile={renamingFile}
          setRenamingFile={setRenamingFile}
          renameInput={renameInput}
          setRenameInput={setRenameInput}
          renameExt={renameExt}
          setRenameExt={setRenameExt}
          handleRenameSubmit={handleRenameSubmit}
          deleteConfirmPath={deleteConfirmPath}
          setDeleteConfirmPath={setDeleteConfirmPath}
          handleDeleteFile={handleDeleteFile}
          openFiles={openFiles}
        />
      ) : allThemeEntries.length === 0 ? (
        <EmptyState
          icon={t("icon_palette", "palette")}
          title={t("no_themes", "No Cloud Themes")}
          className="py-20"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full pb-16">
          {allThemeEntries
            .filter(([, theme]: any) => {
              if (
                searchQuery &&
                !(theme.name || "").toLowerCase().includes(searchQuery.toLowerCase())
              )
                return false;
              if (themeStatusFilter === "active" && theme.is_active === false) return false;
              if (themeStatusFilter === "inactive" && theme.is_active !== false) return false;
              return true;
            })
            .map(([id, theme]: any) => (
              <ThemeCard
                key={id}
                id={id}
                data={theme}
                theme={theme}
                activeThemeId={activeThemeId}
                isCloud={true}
                onClick={() => openEditor(id)}
                handleExportTheme={handleExportCloudTheme}
                deleteTheme={!DEFAULT_CORE_THEMES[id] ? deleteCloudTheme : undefined}
                onDelete={!DEFAULT_CORE_THEMES[id] ? deleteCloudTheme : undefined}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
              />
            ))}
        </div>
      )}

      {/* Lexicon Editor Drawer */}
      <MasonEditorPanel
        t={t}
        isCloudMode={true}
        isKeepers={isKeepers}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        showReference={showReference}
        setShowReference={setShowReference}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        activeFile={activeFile}
        activeFileIndex={activeFileIndex}
        setActiveFileIndex={setActiveFileIndex}
        problemsList={problemsList}
        setProblemsList={setProblemsList}
        validationStats={validationStats}
        isDirty={isDirty}
        saveFile={saveFile}
        discardChanges={mason.discardChanges}
        openFiles={openFiles}
        closeFile={closeFile}
        splitRatio={splitRatio}
        isLight={isLight}
        addMissingStrings={addMissingStrings}
        purgeDeprecatedStrings={purgeDeprecatedStrings}
        jumpToNextEmpty={jumpToNextEmpty}
        handleEditorWillMount={handleEditorWillMount}
        handleEditorChange={handleEditorChange}
        setEditorRef={setEditorRef}
        validateContent={validateContent}
        referenceLabel={referenceLabel}
        referenceData={referenceData}
        isResizing={isResizing}
        editorRef={editorRef}
        activeVersionTimestamp={activeVersionTimestamp}
        setActiveVersionTimestamp={setActiveVersionTimestamp}
        setOpenFiles={setOpenFiles}
        pushStatus={pushStatus}
      />

      {/* Create Cloud Lexicon SidePanel */}
      <SidePanel
        isOpen={isCreateLexiconOpen}
        onClose={() => setIsCreateLexiconOpen(false)}
        title={t("chameleons_btn_new_lexicon", "New Lexicon")}
        subtitle={t("auto_lexicon_pack", "Lexicon Pack")}
        icon={t("icon_translate", "translate")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add", "add")}
              variant="accent"
              onClick={handleCreateSubmit}
              disabled={!createFileName.trim()}
              tooltip={t("auto_create", "Create")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_translate", "translate")}
            overline={t("creating_master_lexicon", "CREATING MASTER LEXICON")}
            title={t("chameleons_btn_new_lexicon", "New Lexicon")}
            description={t(
              "create_lexicon_msg",
              "Creating a Lexicon Pack generates a JSON file populated with all keys from en-default.json."
            ).replace(/<[^>]*>/g, "")}
            badge={t("auto_lexicon_pack", "Lexicon")}
            variant="accent"
          />

          <SidePanelTitleInput
            label={t("label_lexicon_name", "Lexicon Name")}
            value={createFileName}
            onChange={setCreateFileName}
            placeholder={t("label_lexicon_name", "Lexicon Name")}
          />

          <UniversalGroup
            title={t("auto_create_file", "File Parameters")}
            icon={t("icon_code", "code")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("label_lang_code", "Language Code")}
                </label>
                <input
                  type="text"
                  value={lexiconLang}
                  onChange={(e) =>
                    setLexiconLang(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  placeholder="es"
                  className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono text-center"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("label_lexicon_name", "Lexicon Name")}
                </label>
                <input
                  type="text"
                  value={createFileName}
                  onChange={(e) => setCreateFileName(e.target.value)}
                  placeholder="default"
                  className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                  }}
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* Theme Editor SidePanel */}
      <SidePanel
        isOpen={!!editingThemeId}
        onClose={closeEditor}
        title={t("ui_theme_editor", "Theme Editor")}
        subtitle={t("wf_master_theme_edit", "Master Cloud Theme Configuration")}
        icon={t("icon_cloud", "cloud")}
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={1400}
        noPadding={true}
        noScroll={true}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_contrast", "contrast")}
              tooltip={t("forge_btn_auto_contrast", "Auto-Harmonize")}
              onClick={() => {
                if (activeEditingTheme) {
                  const harmonized = autoHarmonizeThemeColors(activeEditingTheme);
                  handleUpdateTheme(harmonized);
                  pushStatus(
                    t("forge_status_harmonized", "Text & surface contrast automatically harmonized."),
                    "success"
                  );
                }
              }}
            />
            <PanelHeaderButton
              icon={t("icon_download", "download")}
              tooltip={t("btn_import", "Import")}
              onClick={async () => {
                const res = await importThemeWithAssets({ t, pushStatus });
                if (res?.theme) {
                  handleUpdateTheme(res.theme);
                } else if (res?.imageOnlyDataUrl) {
                  handleUpdateTheme({ bgImage: res.imageOnlyDataUrl });
                }
              }}
            />
            <PanelHeaderButton
              icon={t("icon_upload", "upload")}
              tooltip={t("btn_export", "Export")}
              onClick={() => {
                if (activeEditingTheme) {
                  exportThemeWithAssets(activeEditingTheme, {
                    t,
                    pushStatus,
                  });
                }
              }}
            />
            <PanelHeaderButton
              icon={livePreview ? t("icon_visibility", "visibility") : t("icon_visibility_off", "visibility_off")}
              tooltip={
                livePreview
                  ? t("ui_os_preview_on", "Live Preview On")
                  : t("ui_os_preview_off", "Live Preview Off")
              }
              variant={livePreview ? "success" : "default"}
              onClick={() => {
                if (livePreview) {
                  if (originalThemeId) setActiveThemeId(originalThemeId);
                } else {
                  if (editingThemeId) {
                    if (activeEditingTheme) {
                      setCoreThemes((prev: any) => ({
                        ...prev,
                        [editingThemeId]: activeEditingTheme,
                      }));
                    }
                    setActiveThemeId(editingThemeId);
                  }
                }
                setLivePreview(!livePreview);
              }}
            />
            <PanelHeaderButton
              icon={t("icon_refresh", "refresh")}
              tooltip={t("btn_reset", "Reset")}
              onClick={() => {
                if (originalThemeId) setActiveThemeId(originalThemeId);
                pushStatus(t("ui_theme_reset", "Theme Reset"), "success");
              }}
            />
            <PanelHeaderButton
              icon={t("icon_check_circle", "check_circle")}
              tooltip={t("ui_btn_apply", "Apply Theme")}
              variant="success"
              onClick={() => {
                if (editingThemeId) {
                  setActiveThemeId(editingThemeId);
                  setOriginalThemeId(editingThemeId);
                  setEditingThemeId(null);
                  pushStatus(t("ui_theme_applied", "Theme Applied"), "success");
                }
              }}
            />
            <PanelHeaderButton
              icon={t("icon_cloud_upload", "cloud_upload")}
              tooltip={t("btn_publish", "Publish")}
              onClick={saveToCloud}
              disabled={isSaving || !hasChanges}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeEditingTheme && (
          <div className="flex-1 flex flex-col lg:flex-row w-full h-full min-h-0 overflow-hidden">
            <ChameleonControlDashboard
              currentTheme={activeEditingTheme}
              handleUpdateTheme={handleUpdateTheme}
              editingThemeId={editingThemeId}
              renameTheme={renameTheme}
            />
            <ChameleonSandboxPreview currentTheme={activeEditingTheme} />
          </div>
        )}
      </SidePanel>

      {isKeepers && (
        <KeepersLogoSidePanel
          isOpen={isLogoPanelOpen}
          onClose={() => setIsLogoPanelOpen(false)}
        />
      )}
    </ElevatedHubLayout>
  );
}
