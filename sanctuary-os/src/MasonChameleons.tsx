import {
  EmptyState,
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "./shared";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import { MarketUploadPanel } from "./side-panels/NexusSidePanels";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
} from "./components/layouts/ElevatedHubLayout";
import {
  ThemeCard,
  DynamicLexiconPreviewBanner,
} from "./chameleon-components/ThemeCard";
import { ChameleonControlDashboard } from "./chameleon-components/ChameleonControlDashboard";
import { ChameleonSandboxPreview } from "./chameleon-components/ChameleonSandboxPreview";
import {
  analyzeAndHarmonizeTheme,
  exportThemeWithAssets,
  importThemeWithAssets,
  uploadThemeAssetsToCloud,
} from "./chameleon-components/ChameleonShared";
import { UniversalCard } from "./components/universal/UniversalCard";
import MasonFileBrowser from "./hub-components/MasonFileBrowser";
import MasonEditorPanel from "./hub-components/MasonEditorPanel";
import {
  useMasonFiles,
  clearIdeCachedDraft,
} from "./hooks/useMasonFiles";
import enDefault from "./lexicons/en-default.json";
import {
  deepCountKeys,
  deepCompare,
  deepAddMissing,
  deepPurgeDeprecated,
} from "./lib/MasonValidation";

function CreateThemePanel({ isOpen, onClose, onSelect, CORE_THEMES, customThemes }: any) {
  const { t } = useLexicon();
  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      widthClass="w-[800px] max-w-[95vw]"
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
      title={t("theme_select_base", "Select Base {Chameleon}")}
      subtitle={t("theme_choose_blueprint", "Choose a {blueprint} to start your new signature")}
      icon="palette"
    >
      <div className="flex flex-col gap-8">
        <UniversalCard
          layout="horizontal"
          icon="add"
          title={t("theme_blank", "Blank Theme")}
          onClick={() => onSelect(null)}
          className="w-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-[1.01] transition-all cursor-pointer shadow-sm group"
        >
          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 mt-1">
            {t("theme_scratch_desc", "Start from scratch")}
          </p>
        </UniversalCard>

        <div>
          <h4 className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest mb-4 ml-2">
            {t("theme_core_arch", "Core Themes")}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(CORE_THEMES).map(([id, theme]: any) => (
              <UniversalCard
                key={id}
                layout="horizontal"
                title={theme.name}
                customIcon={
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 shadow-sm"
                    style={{
                      backgroundColor: theme.bg || "var(--bg)",
                      border: `1px solid ${theme.accent || "var(--accent)"}`,
                    }}
                  />
                }
                onClick={() => onSelect(theme)}
                className="w-full cursor-pointer hover:scale-[1.02] transition-all group"
              >
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate mt-1">
                  {t("theme_core_os", "Core Theme")}
                </p>
              </UniversalCard>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest mb-4 ml-2">
            {t("theme_personal", "Your Personal {Chameleons}")}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(customThemes).map(([id, theme]: any) => (
              <UniversalCard
                key={id}
                layout="horizontal"
                title={theme.name}
                customIcon={
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 shadow-sm"
                    style={{
                      backgroundColor: theme.bg || "var(--bg)",
                      border: `1px solid ${theme.accent || "var(--accent)"}`,
                    }}
                  />
                }
                onClick={() => onSelect(theme)}
                className="w-full cursor-pointer hover:scale-[1.02] transition-all group"
              >
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate mt-1">
                  {t("theme_custom", "Custom Theme")}
                </p>
              </UniversalCard>
            ))}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

export function MasonChameleons({
  masonProfile,
  isVerifiedMason = true,
  vaultPath,
}: {
  masonProfile: any;
  isVerifiedMason?: boolean;
  vaultPath?: string;
}) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const {
    currentTheme: osTheme,
    activeThemeId,
    setActiveThemeId,
    CORE_THEMES,
    customThemes,
    devThemes,
    updateTheme,
    renameTheme,
    createNewDevTheme,
    exportDevThemeToCustom,
    importTheme,
    deleteTheme,
  } = useTheme();

  // Lexicon file management hook (local Dev/Sandbox lexicons + Monaco IDE)
  const mason = useMasonFiles({ vaultPath, isCloudMode: false });
  const {
    pushStatus,
    files,
    showTimeline,
    setShowTimeline,
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
  } = mason;

  const isResizing = useRef(false);

  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [originalThemeId, setOriginalThemeId] = useState(activeThemeId);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "themes_local" | "themes_synced" | "lexicons_local" | "lexicons_synced"
  >("overview");
  const [syncedThemes, setSyncedThemes] = useState<any[]>([]);
  const [syncedThemeEdits, setSyncedThemeEdits] = useState<Record<string, any>>({});
  const [syncedLexicons, setSyncedLexicons] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);

  const parseSyncedThemeData = (pt: any) => {
    const raw =
      typeof pt?.json_data === "string"
        ? (() => {
            try {
              return JSON.parse(pt.json_data);
            } catch {
              return {};
            }
          })()
        : pt?.json_data || pt?.theme_data || {};
    return {
      ...raw,
      id: pt?.id,
      name: raw?.name || pt?.name || t("market_untitled", "Untitled"),
    };
  };

  const fetchPublished = async () => {
    if (!masonProfile?.id) return;
    const { supabase } = await import("./supabase");
    const uid = session?.user?.id || masonProfile?.profile_id || masonProfile?.id;
    const orParts = [`author_id.eq.${masonProfile.id}`];
    if (uid && uid !== masonProfile.id) orParts.push(`author_id.eq.${uid}`);
    if (masonProfile.name) {
      const safeName = String(masonProfile.name).replace(/"/g, "");
      orParts.push(`author.ilike."${safeName}"`);
    }
    const orFilter = orParts.join(",");

    const [themesRes, lexRes, flagsRes] = await Promise.all([
      supabase
        .from("nexus_assets")
        .select("*")
        .eq("asset_type", "chameleon")
        .or(orFilter),
      supabase
        .from("nexus_assets")
        .select("*")
        .eq("asset_type", "lexicon")
        .or(orFilter),
      supabase.from("nexus_reports").select("*").order("created_at", { ascending: false }),
    ]);

    if (themesRes.data) setSyncedThemes(themesRes.data);
    if (lexRes.data) setSyncedLexicons(lexRes.data);
    if (flagsRes.data) {
      const myAssetIds = [
        ...(themesRes.data || []).map((d: any) => d.id),
        ...(lexRes.data || []).map((d: any) => d.id),
      ];
      setFlags(flagsRes.data.filter((f: any) => myAssetIds.includes(f.asset_id)));
    }
  };

  useEffect(() => {
    fetchPublished();
  }, [masonProfile?.id, session?.user?.id]);

  const syncedThemesMap = syncedThemes.reduce((acc: Record<string, any>, pt: any) => {
    acc[pt.id] = syncedThemeEdits[pt.id] || parseSyncedThemeData(pt);
    return acc;
  }, {});

  const allThemes: Record<string, any> = {
    ...CORE_THEMES,
    ...syncedThemesMap,
    ...customThemes,
    ...devThemes,
  };
  const currentTheme = editingThemeId && allThemes[editingThemeId] ? allThemes[editingThemeId] : osTheme;

  const handleUpdateTheme = (updates: any) => {
    if (!editingThemeId) return;
    if (syncedThemes.some((st) => st.id === editingThemeId) && !customThemes[editingThemeId] && !devThemes[editingThemeId]) {
      const merged = { ...(syncedThemeEdits[editingThemeId] || syncedThemesMap[editingThemeId] || {}), ...updates };
      setSyncedThemeEdits((prev) => ({
        ...prev,
        [editingThemeId]: merged,
      }));
      if (activeThemeId === editingThemeId || livePreview) {
        updateTheme(editingThemeId, merged);
      }
    } else {
      updateTheme(editingThemeId, updates);
    }
  };

  const handleExportThemeCard = (e: React.MouseEvent, themeObj: any) => {
    e.stopPropagation();
    exportThemeWithAssets(themeObj, {
      vaultPath,
      t,
      pushStatus: useStore.getState().pushStatus,
    });
  };

  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | false>(false);
  const [uploadState, setUploadState] = useState({
    isOpen: false,
    editId: null as string | null,
    assetType: "chameleon",
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

  const publishThemeToNexus = () => {
    const bgHex = (currentTheme.bg || "#000000").replace("#", "");
    let themeMode = "Dark";
    if (bgHex.length === 6) {
      const r = parseInt(bgHex.substring(0, 2), 16);
      const g = parseInt(bgHex.substring(2, 4), 16);
      const b = parseInt(bgHex.substring(4, 6), 16);
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      themeMode = yiq >= 128 ? "Light" : "Dark";
    }

    const isEdit =
      !!editingThemeId &&
      !editingThemeId.startsWith("dev_") &&
      !editingThemeId.startsWith("custom_") &&
      syncedThemes.some((st) => st.id === editingThemeId);
    const editThemeMeta = isEdit ? syncedThemes.find((st) => st.id === editingThemeId) : null;

    setUploadState({
      isOpen: true,
      editId: isEdit ? editingThemeId : null,
      assetType: "chameleon",
      isHidden: false,
      fileContent: currentTheme,
      fileName: currentTheme.name + ".json",
      name: currentTheme.name,
      version: editThemeMeta?.version || "1.0.0",
      description: editThemeMeta?.description || "",
      releaseNotes: "",
      language: "English",
      newLanguage: "",
      lexiconType: "Theme",
      themeMode,
    });
  };

  const handlePublishLexicon = async (file: any) => {
    try {
      const parsed = JSON.parse(file.content);
      if (!parsed._meta_name) {
        pushStatus(t("alert_error", "Error"), "error");
        return;
      }
      const langMap: Record<string, string> = {
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
      };
      const resolvedLang = parsed._meta_lang
        ? langMap[parsed._meta_lang.toLowerCase()] || parsed._meta_lang
        : "add_new";

      setUploadState({
        isOpen: true,
        editId: null,
        assetType: "lexicon",
        isHidden: false,
        fileContent: parsed,
        fileName: file.name,
        name: parsed._meta_name,
        version: String(parsed._meta_version || "1.0.0"),
        description: `Language Pack: ${resolvedLang === "add_new" ? "Custom" : resolvedLang}`,
        releaseNotes: "",
        language: resolvedLang,
        newLanguage: "",
        lexiconType: "Theme",
        themeMode: "Dark",
      });
    } catch (e: any) {
      pushStatus((t("alert_error", "Error: ")) + e.message, "error");
    }
  };

  const submitUpload = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      const { supabase } = await import("./supabase");
      const finalContent = { ...uploadState.fileContent };

      if (uploadState.assetType === "lexicon") {
        const finalLanguage =
          uploadState.language === "add_new" ? uploadState.newLanguage : uploadState.language;
        finalContent.version = uploadState.version;
        finalContent._meta_version = uploadState.version;

        const payload = {
          name: uploadState.name,
          version: uploadState.version,
          description: uploadState.description,
          release_notes: uploadState.releaseNotes,
          json_data: finalContent,
          asset_type: "lexicon",
          is_public: true,
          language: finalLanguage,
          lexicon_type: uploadState.lexiconType,
          author: masonProfile.name,
          author_id: session?.user?.id || masonProfile.id,
        };

        if (uploadState.editId) {
          const { error } = await supabase
            .from("nexus_assets")
            .update(payload)
            .eq("id", uploadState.editId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("nexus_assets")
            .insert([{ ...payload, downloads: 0 }]);
          if (error) throw error;
        }
        pushStatus(t("upload_success", "Asset published successfully."), "success");
        setUploadState((s) => ({ ...s, isOpen: false }));
        fetchPublished();
        return;
      }

      const { themeData: syncedThemeContent } = await uploadThemeAssetsToCloud(
        finalContent,
        supabase
      );

      const payload: any = {
        name: uploadState.name,
        version: uploadState.version,
        description: uploadState.description,
        release_notes: uploadState.releaseNotes,
        json_data: syncedThemeContent,
        asset_type: "chameleon",
        is_public: true,
        theme_mode: uploadState.themeMode,
        author: masonProfile.name,
        author_id: session?.user?.id || masonProfile.id,
      };

      if (uploadState.editId) {
        const { error } = await supabase
          .from("nexus_assets")
          .update(payload)
          .eq("id", uploadState.editId);
        if (error) throw error;
        useStore.getState().pushStatus("Theme updated successfully.", "success");
      } else {
        payload.downloads = 0;
        const { error } = await supabase.from("nexus_assets").insert([payload]);
        if (error) throw error;
        useStore.getState().pushStatus("Theme published successfully.", "success");
      }
      setUploadState((s) => ({ ...s, isOpen: false }));
      fetchPublished();
    } catch (err: any) {
      useStore.getState().pushStatus(`Error: ${err.message}`, "error");
    }
  };

  // Lexicon Editor helpers
  const saveFile = async () => {
    if (activeFileIndex < 0) return;
    const file = openFiles[activeFileIndex];
    try {
      const normalizedPath = file.path.replace(/\//g, "\\");
      await invoke("save_file_with_history", { path: normalizedPath, content: file.content });
      clearIdeCachedDraft(file.path);
      const newFiles = [...openFiles];
      newFiles[activeFileIndex].originalContent = file.content;
      setOpenFiles(newFiles);
      setActiveVersionTimestamp(null);
      try {
        const parsedLocal = JSON.parse(file.content);
        if (parsedLocal && (parsedLocal._meta_lang || parsedLocal.term_mod)) {
          const localId = file.name.replace(/\.json$/i, "");
          window.dispatchEvent(
            new CustomEvent("sanctuary-lexicon-updated", {
              detail: { id: localId, lexiconData: parsedLocal },
            })
          );
        }
      } catch {}
      pushStatus(t("alert_saved", "Saved"), "success");
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
  const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;
  const isActiveFileLexicon = Boolean(
    activeFile &&
      (activeFile.content?.includes("_meta_lang") ||
        activeFile.content?.includes('"a_citizen"') ||
        activeFile.content?.includes('"term_mod"') ||
        activeFile.name?.match(/^[a-z]{2}-.+\.json$/i) !== null ||
        activeFile.name?.toLowerCase() === "simlish.json")
  );

  let validationStats: {
    total: number;
    missing: number;
    completelyMissing: number;
    deprecated: number;
  } | null = null;

  if (activeFile) {
    try {
      const parsed = JSON.parse(activeFile.content);
      const isEnDefault = activeFile.name.includes("en-default");
      const reference = isEnDefault
        ? null
        : referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : isActiveFileLexicon
            ? enDefault
            : null;
      if (reference) {
        const total = deepCountKeys(reference);
        const stats = deepCompare(reference, parsed, isActiveFileLexicon);
        validationStats = { total, ...stats };
      }
    } catch {}
  }

  const addMissingStrings = () => {
    if (!activeFile) return;
    try {
      const parsed = JSON.parse(activeFile.content);
      const reference =
        referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : isActiveFileLexicon
            ? enDefault
            : null;
      if (!reference) return;
      const newObj = deepAddMissing(reference, parsed, isActiveFileLexicon);
      const newContent = JSON.stringify(newObj, null, 2);
      if (editorRef && editorRef.getModel()) {
        const model = editorRef.getModel();
        editorRef.executeEdits("add-missing", [
          { range: model.getFullModelRange(), text: newContent, forceMoveMarkers: true },
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
      const reference =
        referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : isActiveFileLexicon
            ? enDefault
            : null;
      if (!reference) return;
      const newObj = deepPurgeDeprecated(reference, parsed, isActiveFileLexicon);
      const newContent = JSON.stringify(newObj, null, 2);
      if (editorRef && editorRef.getModel()) {
        const model = editorRef.getModel();
        editorRef.executeEdits("purge-deprecated", [
          { range: model.getFullModelRange(), text: newContent, forceMoveMarkers: true },
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
    const matches = model.findMatches('"[^"]+"\\s*:\\s*(""|\\[\\]|\\{\\})', false, true, false, null, true);
    if (matches && matches.length > 0) {
      const position = editorRef.getPosition();
      if (!position) return;
      let nextMatch = matches.find(
        (m: any) =>
          m.range.startLineNumber > position.lineNumber ||
          (m.range.startLineNumber === position.lineNumber && m.range.startColumn > position.column)
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

  const openEditor = (id: string) => {
    setEditingThemeId(id);
    setOriginalThemeId(activeThemeId);
    if (livePreview) setActiveThemeId(id);
  };

  const localCustomThemes = Object.entries(customThemes);
  const localDevThemes = Object.entries(devThemes);
  const localLexiconFiles = (files || []).filter(
    (f: any) => f.name.match(/^[a-z]{2}-.+\.json$/i) || f.name.toLowerCase() === "simlish.json"
  );

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: "dashboard",
      number: String(
        localCustomThemes.length +
          localDevThemes.length +
          syncedThemes.length +
          localLexiconFiles.length +
          syncedLexicons.length
      ),
    },
    {
      id: "themes_local",
      label: t("chameleons_tab_themes_local", "Local Themes"),
      icon: "palette",
      number: String(localCustomThemes.length + localDevThemes.length),
    },
    {
      id: "themes_synced",
      label: t("chameleons_tab_themes_synced", "Nexus Themes"),
      icon: "cloud_done",
      number: String(syncedThemes.length),
    },
    {
      id: "lexicons_local",
      label: t("chameleons_tab_lexicons_local", "Local Lexicons"),
      icon: "translate",
      number: String(localLexiconFiles.length),
    },
    {
      id: "lexicons_synced",
      label: t("chameleons_tab_lexicons_synced", "Nexus Lexicons"),
      icon: "public",
      number: String(syncedLexicons.length),
    },
  ];

  const renderLanding = () => {
    const recentThemeItems = [
      ...localDevThemes.map(([id, th]: any) => ({
        id,
        themeData: th,
        isDev: true,
        isCloud: false,
      })),
      ...localCustomThemes.map(([id, th]: any) => ({
        id,
        themeData: th,
        isDev: false,
        isCloud: false,
      })),
      ...[...syncedThemes]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((pt: any) => ({
          id: pt.id,
          themeData: syncedThemesMap[pt.id] || parseSyncedThemeData(pt),
          isDev: false,
          isCloud: true,
        })),
    ].slice(0, 2);

    const recentLexiconItems = [
      ...localLexiconFiles.map((file: any) => ({
        kind: "local" as const,
        id: file.path,
        title: file.name.replace(/\.json$/i, ""),
        subtitle: t("auto_lexicon_pack", "Lexicon Pack"),
        badge: t("local", "Local"),
        onClick: () => openFile(file),
      })),
      ...syncedLexicons.map((lx: any) => ({
        kind: "synced" as const,
        id: lx.id,
        title: lx.name,
        subtitle: `${lx.language || "English"} • v${lx.version || "1.0.0"}`,
        badge: t("synced_badge", "Synced"),
        onClick: () => {
          const parsed =
            typeof lx.json_data === "string" ? JSON.parse(lx.json_data) : lx.json_data;
          setUploadState({
            isOpen: true,
            editId: lx.id,
            assetType: "lexicon",
            isHidden: false,
            fileContent: parsed,
            fileName: `${lx.name}.json`,
            name: lx.name,
            version: lx.version || "1.0.0",
            description: lx.description || "",
            releaseNotes: lx.release_notes || "",
            language: lx.language || "English",
            newLanguage: "",
            lexiconType: lx.lexicon_type || "Theme",
            themeMode: "Dark",
          });
        },
      })),
    ].slice(0, 2);

    const unsavedLexicons = openFiles.filter((f: any) => f.content !== f.originalContent);
    const flaggedThemes = syncedThemes.filter((st) => flags.some((f) => f.asset_id === st.id));
    const flaggedLexicons = syncedLexicons.filter((lx) => flags.some((f) => f.asset_id === lx.id));
    const hasRecent = recentThemeItems.length > 0 || recentLexiconItems.length > 0;
    const hasAnomalies =
      unsavedLexicons.length > 0 || flaggedThemes.length > 0 || flaggedLexicons.length > 0;

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_schedule", "schedule")}
          iconColorClass="text-[var(--accent)]"
          title={t("chameleons_overview_recent", "Recent")}
          isEmpty={!hasRecent}
          emptyIcon={t("icon_palette", "palette")}
          emptyTitle={t("registry_no_mods", "No {Mods} Found")}
          gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {recentThemeItems.map((item) => (
            <ThemeCard
              key={item.id}
              id={item.id}
              data={item.themeData}
              theme={item.themeData}
              isDev={item.isDev}
              activeThemeId={activeThemeId}
              onClick={() => openEditor(item.id)}
              handleExportTheme={handleExportThemeCard}
              deleteTheme={item.isCloud ? undefined : deleteTheme}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              isCloud={item.isCloud}
            />
          ))}
          {recentLexiconItems.map((lx) => (
            <UniversalCard
              key={lx.id}
              layout="vertical"
              icon={t("icon_translate", "translate")}
              customIcon={<DynamicLexiconPreviewBanner data={{ name: lx.title, ...lx }} heightClass="h-full" />}
              title={lx.title}
              subtitle={lx.subtitle}
              onClick={lx.onClick}
              imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                  <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {lx.kind === "synced"
                        ? t("icon_cloud_done", "cloud_done")
                        : t("icon_science", "science")}
                    </span>
                    <span>{lx.badge}</span>
                  </div>
                </div>
              }
              badges={
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_translate", "translate")}
                    </span>
                    <span>{t("auto_lexicon_pack", "Lexicon Pack")}</span>
                  </div>
                </div>
              }
            />
          ))}
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
              icon={t("icon_translate", "translate")}
              customIcon={<DynamicLexiconPreviewBanner data={file} heightClass="h-full" />}
              title={file.name.replace(/\.json$/i, "")}
              subtitle={t("ide_unsaved_files", "Unsaved Changes")}
              onClick={() => openFile(file)}
              className="border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
              imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                  <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_warning", "warning")}
                    </span>
                    <span>{t("unsaved_changes", "Unsaved")}</span>
                  </div>
                </div>
              }
              badges={
                <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_translate", "translate")}
                  </span>
                  <span>{t("auto_lexicon_pack", "Lexicon Pack")}</span>
                </div>
              }
            />
          ))}
          {flaggedThemes.map((pt: any) => {
            const themeData = syncedThemesMap[pt.id] || parseSyncedThemeData(pt);
            return (
              <ThemeCard
                key={`flag_theme_${pt.id}`}
                id={pt.id}
                data={themeData}
                theme={themeData}
                isDev={false}
                activeThemeId={activeThemeId}
                onClick={() => openEditor(pt.id)}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
                isCloud={true}
              />
            );
          })}
          {flaggedLexicons.map((lx: any) => (
            <UniversalCard
              key={`flag_lex_${lx.id}`}
              layout="vertical"
              icon={t("icon_translate", "translate")}
              customIcon={<DynamicLexiconPreviewBanner data={lx} heightClass="h-full" />}
              title={lx.name}
              subtitle={t("flagged", "Flagged")}
              onClick={() => {
                const parsed =
                  typeof lx.json_data === "string" ? JSON.parse(lx.json_data) : lx.json_data;
                setUploadState({
                  isOpen: true,
                  editId: lx.id,
                  assetType: "lexicon",
                  isHidden: false,
                  fileContent: parsed,
                  fileName: `${lx.name}.json`,
                  name: lx.name,
                  version: lx.version || "1.0.0",
                  description: lx.description || "",
                  releaseNotes: lx.release_notes || "",
                  language: lx.language || "English",
                  newLanguage: "",
                  lexiconType: lx.lexicon_type || "Theme",
                  themeMode: "Dark",
                });
              }}
              imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                  <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                      {t("icon_flag", "flag")}
                    </span>
                    <span>{t("flagged", "Flagged")}</span>
                  </div>
                </div>
              }
              badges={
                <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_translate", "translate")}
                  </span>
                  <span>{t("auto_lexicon_pack", "Lexicon Pack")}</span>
                </div>
              }
            />
          ))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderContent = () => {
    if (activeTab === "overview") return renderLanding();

    if (activeTab === "themes_synced") {
      const filteredSynced = syncedThemes.filter(
        (pt) => !searchQuery || (pt.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
      return (
        <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {filteredSynced.length === 0 ? (
            <EmptyState
              icon={t("icon_cloud_done", "cloud_done")}
              title={t("no_themes", "No Synced {Chameleons}")}
              className="py-12"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
              {filteredSynced.map((pt: any) => {
                const themeData = syncedThemesMap[pt.id] || parseSyncedThemeData(pt);
                return (
                  <ThemeCard
                    key={pt.id}
                    id={pt.id}
                    data={themeData}
                    theme={themeData}
                    isDev={false}
                    activeThemeId={activeThemeId}
                    onClick={() => openEditor(pt.id)}
                    handleExportTheme={handleExportThemeCard}
                    confirmDelete={confirmDelete}
                    setConfirmDelete={setConfirmDelete}
                    isCloud={true}
                  />
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "themes_local") {
      const filteredCustom = localCustomThemes.filter(
        ([, theme]: any) =>
          !searchQuery || (theme?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
      const filteredDev = localDevThemes.filter(
        ([, theme]: any) =>
          !searchQuery || (theme?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
      return (
        <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {filteredCustom.length === 0 && filteredDev.length === 0 ? (
            <EmptyState
              icon={t("icon_palette", "palette")}
              title={t("no_themes", "No Local {Chameleons}")}
              className="py-12"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
              {filteredCustom.map(([id, theme]: any) => (
                <ThemeCard
                  key={id}
                  id={id}
                  data={theme}
                  theme={theme}
                  isDev={false}
                  activeThemeId={activeThemeId}
                  onClick={() => openEditor(id)}
                  handleExportTheme={handleExportThemeCard}
                  deleteTheme={deleteTheme}
                  onDelete={deleteTheme}
                  confirmDelete={confirmDelete}
                  setConfirmDelete={setConfirmDelete}
                />
              ))}
              {filteredDev.map(([id, theme]: any) => (
                <ThemeCard
                  key={id}
                  id={id}
                  data={theme}
                  theme={theme}
                  isDev={true}
                  activeThemeId={activeThemeId}
                  onClick={() => openEditor(id)}
                  handleExportTheme={handleExportThemeCard}
                  deleteTheme={deleteTheme}
                  onDelete={deleteTheme}
                  confirmDelete={confirmDelete}
                  setConfirmDelete={setConfirmDelete}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "lexicons_local") {
      return (
        <MasonFileBrowser
          t={t}
          isCloudMode={false}
          internalCloudTarget="sanctuary_lexicons"
          files={localLexiconFiles}
          searchQuery={searchQuery}
          fileTypeFilter="lexicon"
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
          handlePublishLexicon={isVerifiedMason ? handlePublishLexicon : undefined}
        />
      );
    }

    // lexicons_synced
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {syncedLexicons.length === 0 ? (
          <EmptyState icon="public" title={t("registry_no_mods", "No {Mods} Found")} className="py-12" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 w-full">
            {syncedLexicons
              .filter(
                (lx) => !searchQuery || (lx.name || "").toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((lx: any) => (
                <UniversalCard
                  key={lx.id}
                  layout="vertical"
                  title={lx.name}
                  subtitle={`${lx.language || "Language"} • v${lx.version || "1.0.0"}`}
                  onClick={() => {
                    const parsed =
                      typeof lx.json_data === "string" ? JSON.parse(lx.json_data) : lx.json_data;
                    setUploadState({
                      isOpen: true,
                      editId: lx.id,
                      assetType: "lexicon",
                      isHidden: false,
                      fileContent: parsed,
                      fileName: `${lx.name}.json`,
                      name: lx.name,
                      version: lx.version || "1.0.0",
                      description: lx.description || "",
                      releaseNotes: lx.release_notes || "",
                      language: lx.language || "English",
                      newLanguage: "",
                      lexiconType: lx.lexicon_type || "Theme",
                      themeMode: "Dark",
                    });
                  }}
                  customIcon={<DynamicLexiconPreviewBanner data={lx} heightClass="h-full" />}
                  imageOverlay={
                    <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                      <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_cloud_done", "cloud_done")}
                        </span>
                        <span>{t("synced", "Synced")}</span>
                      </div>
                    </div>
                  }
                  badges={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_language", "language")}
                        </span>
                        <span>{lx.language || t("auto_lexicon_pack", "Lexicon Pack")}</span>
                      </div>
                    </div>
                  }
                />
              ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_aesthetics", "Aesthetics")}
      headerIcon={t("icon_palette", "palette") as string}
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("ui_search_chameleons", "Search {Chameleons}...") as string}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      hideSearch={activeTab === "overview"}
      actions={[
        {
          id: "create_theme",
          icon: <span className="material-symbols-outlined !text-[20px]">{t("icon_palette", "palette")}</span>,
          label: t("chameleons_btn_new_theme", "New Theme") as string,
          onClick: () => setIsCreatePanelOpen(true),
        },
        {
          id: "create_lexicon",
          icon: <span className="material-symbols-outlined !text-[20px]">{t("icon_translate", "translate")}</span>,
          label: t("chameleons_btn_new_lexicon", "New Lexicon") as string,
          onClick: () => {
            mason.setCreateMode("lexicon");
            setIsCreateLexiconOpen(true);
          },
        },
        {
          id: "import_lexicon",
          icon: <span className="material-symbols-outlined !text-[20px]">{t("icon_upload", "upload")}</span>,
          label: t("chameleons_btn_import_lexicon", "Import JSON") as string,
          onClick: async () => {
            if (activeTab === "themes_local" || activeTab === "themes_synced") {
              const res = await importThemeWithAssets({
                t,
                pushStatus: useStore.getState().pushStatus,
              });
              if (res?.theme) {
                importTheme(res.theme);
              }
            } else {
              handleImport();
            }
          },
        },
      ]}
    >
      {renderContent()}

      {/* Chameleon Theme Editor SidePanel */}
      <SidePanel
        isOpen={!!editingThemeId}
        onClose={() => {
          setEditingThemeId(null);
          setActiveThemeId(originalThemeId);
        }}
        title={t("ui_theme_editor", "Theme Editor")}
        subtitle={
          typeof editingThemeId === "string" && editingThemeId.startsWith("dev_")
            ? t("ui_dev_matrix", "Dev Matrix")
            : t("ui_system_theme", "System Theme")
        }
        icon="palette"
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={1400}
        noPadding={true}
        noScroll={true}
        headerActions={
          typeof editingThemeId === "string" ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_contrast", "contrast")}
                tooltip={t("forge_btn_auto_contrast", "Auto-Harmonize")}
                onClick={async () => {
                  const harmonized = await analyzeAndHarmonizeTheme(currentTheme);
                  handleUpdateTheme(harmonized);
                  useStore.getState().pushStatus(
                    t("forge_status_harmonized", "Liquid Glass optics, surfaces & text contrast harmonized to active background."),
                    "success"
                  );
                }}
              />
              <PanelHeaderButton
                icon={t("icon_download", "download")}
                tooltip={t("btn_import", "Import")}
                onClick={async () => {
                  const res = await importThemeWithAssets({
                    t,
                    pushStatus: useStore.getState().pushStatus,
                  });
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
                  exportThemeWithAssets(currentTheme, {
                    vaultPath,
                    t,
                    pushStatus: useStore.getState().pushStatus,
                  });
                }}
              />
              <PanelHeaderButton
                icon={livePreview ? t("icon_visibility", "visibility") : t("icon_visibility_off", "visibility_off")}
                tooltip={livePreview ? t("ui_os_preview_on", "Preview On") : t("ui_os_preview_off", "Preview Off")}
                variant={livePreview ? "success" : "default"}
                onClick={() => {
                  if (livePreview) setActiveThemeId(originalThemeId);
                  else setActiveThemeId(editingThemeId);
                  setLivePreview(!livePreview);
                }}
              />
              {editingThemeId.startsWith("dev_") && (
                <>
                  <PanelHeaderButton
                    icon="refresh"
                    tooltip={t("btn_reset", "Reset")}
                    onClick={() => {
                      setActiveThemeId(originalThemeId);
                      useStore.getState().pushStatus(t("ui_theme_reset", "Theme Reset"), "success");
                    }}
                  />
                  <PanelHeaderButton
                    icon="check_circle"
                    tooltip={t("ui_btn_apply", "Apply Theme")}
                    variant="success"
                    onClick={() => {
                      setActiveThemeId(editingThemeId);
                      setOriginalThemeId(editingThemeId);
                      setEditingThemeId(null);
                      useStore.getState().pushStatus(t("ui_theme_applied", "Theme Applied"), "success");
                    }}
                  />
                </>
              )}
              {isVerifiedMason && (
                <PanelHeaderButton
                  icon="cloud_upload"
                  tooltip={t("btn_publish", "Publish")}
                  onClick={publishThemeToNexus}
                  variant="primary"
                />
              )}
              {editingThemeId.startsWith("dev_") && (
                <PanelHeaderButton
                  icon="save"
                  tooltip={t("ui_export_theme", "Save Locally")}
                  onClick={() => {
                    exportDevThemeToCustom(editingThemeId);
                    useStore.getState().pushStatus(t("ui_saved_personal", "Saved to Themes"), "success");
                  }}
                  variant="primary"
                />
              )}
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex-1 flex flex-col lg:flex-row w-full h-full min-h-0 overflow-hidden">
          <ChameleonControlDashboard
            currentTheme={currentTheme}
            handleUpdateTheme={handleUpdateTheme}
            editingThemeId={editingThemeId}
            renameTheme={renameTheme}
          />
          <ChameleonSandboxPreview currentTheme={currentTheme} />
        </div>
      </SidePanel>

      {/* Lexicon Monaco IDE Editor Panel */}
      <MasonEditorPanel
        t={t}
        isCloudMode={false}
        isKeepers={false}
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
        handlePublishLexicon={isVerifiedMason ? handlePublishLexicon : undefined}
        openFiles={openFiles}
        closeFile={closeFile}
        splitRatio={splitRatio}
        isLight={false}
        addMissingStrings={addMissingStrings}
        purgeDeprecatedStrings={purgeDeprecatedStrings}
        jumpToNextEmpty={jumpToNextEmpty}
        handleEditorWillMount={() => {}}
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

      {/* Create New Lexicon Pack SidePanel */}
      <SidePanel
        isOpen={isCreateLexiconOpen}
        onClose={() => setIsCreateLexiconOpen(false)}
        title={t("chameleons_btn_new_lexicon", "New Lexicon")}
        subtitle={t("auto_create_file_sub", "Create a new lexicon pack")}
        icon="translate"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="add"
              variant="accent"
              onClick={handleCreateSubmit}
              disabled={!createFileName.trim()}
              tooltip={t("auto_create", "Create")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="pb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <SidePanelTitleInput
              value={createFileName}
              onChange={setCreateFileName}
              placeholder={t("label_lexicon_name", "Lexicon Name")}
            />
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col gap-2 w-32">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                {t("label_lang_code", "Language Code")}
              </label>
              <input
                type="text"
                value={lexiconLang}
                onChange={(e) =>
                  setLexiconLang(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="es"
                className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono text-center"
              />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                {t("label_lexicon_name", "Lexicon Name")}
              </label>
              <input
                type="text"
                value={createFileName}
                onChange={(e) => setCreateFileName(e.target.value)}
                placeholder="default"
                className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSubmit();
                }}
              />
            </div>
          </div>
        </div>
      </SidePanel>

      <MarketUploadPanel
        uploadState={uploadState}
        setUploadState={setUploadState}
        marketTab={uploadState.assetType === "lexicon" ? "LEXICONS" : "CHAMELEONS"}
        availableLanguages={[
          "English",
          "Spanish",
          "French",
          "German",
          "Italian",
          "Portuguese",
          "Russian",
          "Japanese",
          "Korean",
          "Chinese",
        ]}
        submitUpload={submitUpload}
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      />
      <CreateThemePanel
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        onSelect={(baseTheme: any) => {
          setIsCreatePanelOpen(false);
          const newId = createNewDevTheme(baseTheme);
          setEditingThemeId(newId);
        }}
        CORE_THEMES={CORE_THEMES}
        customThemes={customThemes}
      />
    </ElevatedHubLayout>
  );
}
