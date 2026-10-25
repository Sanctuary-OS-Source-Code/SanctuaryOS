import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore, getSafeSchema } from "./store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  CustomDropdown,
  DashboardStatTile,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "./shared";
import enDefault from "./lexicons/en-default.json";
import { supabase } from "./supabase";
import { MarketUploadPanel } from "./side-panels/NexusSidePanels";
import MasonFileBrowser from "./hub-components/MasonFileBrowser";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
} from "./components/layouts/ElevatedHubLayout";
import MasonEditorPanel from "./hub-components/MasonEditorPanel";
import {
  deepCountKeys,
  deepCompare,
  deepAddMissing,
  deepPurgeDeprecated,
} from "./lib/MasonValidation";
import {
  useMasonFiles,
  hasIdeCachedDraft,
  clearIdeCachedDraft,
} from "./hooks/useMasonFiles";
import { useTheme } from "./ThemeContext";
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from "./utils/monacoTheme";

export default function MasonIDE({
  vaultPath,
  isCloudMode,
  cloudTarget = "sanctuary_schemas",
  isKeepers = false,
  isVerifiedMason = true,
}: {
  vaultPath?: string;
  isCloudMode?: boolean;
  cloudTarget?: "sanctuary_schemas" | "sanctuary_lexicons" | "sanctuary_games";
  isKeepers?: boolean;
  isVerifiedMason?: boolean;
}) {
  const mason = useMasonFiles({ vaultPath, isCloudMode, cloudTarget, isKeepers });
  const {
    t,
    session,
    pushStatus,
    files,
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
    referenceLabel,
    internalCloudTarget,
    setInternalCloudTarget,
    splitRatio,
    setSplitRatio,
    isFullscreen,
    setIsFullscreen,
    uploadState,
    setUploadState,
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

  const saveFile = async () => {
    if (activeFileIndex < 0) return;
    const file = openFiles[activeFileIndex];
    try {
      if (isCloudMode) {
        const parsed = JSON.parse(file.content);
        const isLex = internalCloudTarget === "sanctuary_lexicons";
        if (isLex) {
          if (!parsed._meta_version || typeof parsed._meta_version !== "number")
            parsed._meta_version = 0;
          parsed._meta_version++;
          if (typeof parsed.schema_version !== "undefined") delete parsed.schema_version;
        } else {
          if (!parsed.schema_version || typeof parsed.schema_version !== "number")
            parsed.schema_version = 0;
          parsed.schema_version++;
        }

        const updatedContent = JSON.stringify(parsed, null, 2);
        const fileId = file.name.replace(".json", "");
        const actualCloudTarget = isLex ? "sanctuary_lexicons" : "sanctuary_schemas";
        const client = isKeepers
          ? (await import("./supabase")).supabaseAuth
          : (await import("./supabase")).supabase;

        const payload =
          actualCloudTarget === "sanctuary_lexicons"
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

        const token = useStore.getState().session?.access_token;
        if (!isKeepers && token) {
          const { error } = await client.rpc("secure_upsert_cloud_file", {
            p_token: token,
            p_target: actualCloudTarget,
            p_payload: payload,
          });
          if (error) throw error;
        } else {
          const { error } = await client.from(actualCloudTarget).upsert(payload as any);
          if (error) throw error;
          if (isLex && token && fileId !== "en-default" && fileId !== "en-sanctuary") {
            try {
              const spokeClient = (await import("./supabase")).supabase;
              await spokeClient.rpc("secure_upsert_cloud_file", {
                p_token: token,
                p_target: "sanctuary_lexicons",
                p_payload: payload,
              });
            } catch {}
          }
        }

        if (fileId === useStore.getState().activeGameSchema?.id) {
          useStore
            .getState()
            .setActiveGameSchema(getSafeSchema(parsed, parsed.id || "default_schema"));
        }

        if (
          isLex &&
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
          } catch (err) {}
        }

        if (isLex) {
          window.dispatchEvent(
            new CustomEvent("sanctuary-lexicon-updated", {
              detail: { id: fileId, lexiconData: parsed },
            })
          );
        }

        clearIdeCachedDraft(file.path);
        const newFiles = [...openFiles];
        newFiles[activeFileIndex].content = updatedContent;
        newFiles[activeFileIndex].originalContent = updatedContent;
        setOpenFiles(newFiles);
        setActiveVersionTimestamp(null);
        pushStatus(t("alert_saved", "Saved"), "success");
      } else {
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
      }
    } catch (e) {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const handlePublishLexicon = async (file: any) => {
    try {
      const content = file.content;
      const parsed = JSON.parse(content);

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
        version: parsed._meta_version || "1.0.0",
        description: `Language Pack: ${resolvedLang === "add_new" ? "Custom" : resolvedLang}`,
        releaseNotes: "",
        language: resolvedLang,
        newLanguage: "",
        lexiconType: "Theme",
        themeMode: "Dark",
      });
    } catch (e: any) {
      pushStatus((t("alert_error", "Error: ") || "Error: ") + e.message, "error");
    }
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalLanguage =
        uploadState.language === "add_new" ? uploadState.newLanguage : uploadState.language;
      const finalContent = { ...uploadState.fileContent };
      finalContent.version = uploadState.version;
      finalContent._meta_version = uploadState.version;

      const payload = {
        name: uploadState.name,
        version: uploadState.version,
        description: uploadState.description,
        release_notes: uploadState.releaseNotes,
        json_data: finalContent,
        asset_type: uploadState.assetType,
        is_public: true,
        language: finalLanguage,
        lexicon_type: uploadState.lexiconType,
      };

      const authorName =
        session?.user?.user_metadata?.mason_name ||
        session?.user?.user_metadata?.username ||
        "Unknown";

      const { data: existing } = await supabase
        .from("nexus_assets")
        .select("id")
        .eq("name", uploadState.name)
        .or(`author_id.eq.${session?.user?.id},author.ilike.${authorName}`)
        .eq("asset_type", uploadState.assetType)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("nexus_assets")
          .update({ ...payload })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("nexus_assets")
          .insert([
            {
              ...payload,
              author: authorName,
              author_id: session?.user?.id,
              downloads: 0,
            },
          ]);
        if (error) throw error;
      }

      pushStatus(t("upload_success", "Asset published successfully."), "success");
      setUploadState((s: any) => ({ ...s, isOpen: false }));
    } catch (err: any) {
      console.error("SUPABASE ERROR:", err);
      pushStatus((t("alert_error", "Error: ") || "Error: ") + `${err.message}`, "error");
    }
  };

  const { currentTheme } = useTheme();
  useSanctuaryMonacoTheme(currentTheme, isLight);

  const handleEditorWillMount = (monaco: any) => {
    defineSanctuaryMonacoThemes(monaco, currentTheme);
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
  const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;

  let validationStats: {
    total: number;
    missing: number;
    completelyMissing: number;
    deprecated: number;
  } | null = null;
  const isLexicon = isCloudMode
    ? internalCloudTarget === "sanctuary_lexicons"
    : activeFile?.content?.includes("_meta_lang") ||
      activeFile?.content?.includes('"a_citizen"') ||
      activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) !== null;
  const isSchema = isCloudMode
    ? internalCloudTarget === "sanctuary_schemas"
    : activeFile?.content?.includes('"schema_version"');
  const isGame = isCloudMode && internalCloudTarget === "sanctuary_games";

  if (activeFile && (isLexicon || isSchema || isGame)) {
    try {
      const parsed = JSON.parse(activeFile.content);
      const isEnDefault = activeFile?.name.includes("en-default");
      const reference = isEnDefault
        ? null
        : referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : isLexicon
            ? enDefault
            : null;

      if (reference) {
        const total = deepCountKeys(reference);
        const stats = deepCompare(reference, parsed, !!isLexicon);
        validationStats = { total, ...stats };
      }
    } catch (e) {}
  }

  const addMissingStrings = () => {
    if (!activeFile) return;
    try {
      const parsed = JSON.parse(activeFile.content);
      const isLexiconActive =
        activeFile?.content?.includes("_meta_lang") ||
        activeFile?.content?.includes('"a_citizen"') ||
        activeFile?.content?.includes('"term_mod"') ||
        activeFile?.name.startsWith("en-") ||
        activeFile?.name.startsWith("de-") ||
        activeFile?.name.startsWith("es-") ||
        activeFile?.name.startsWith("fr-");
      const isEnDefault = activeFile?.name.includes("en-default");
      const reference = isEnDefault
        ? null
        : referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : isLexiconActive
            ? enDefault
            : null;

      if (!reference) return;

      const newObj = deepAddMissing(reference, parsed, isLexiconActive);
      const newContent = JSON.stringify(newObj, null, 2);
      if (editorRef && editorRef.getModel()) {
        const model = editorRef.getModel();
        const fullRange = model.getFullModelRange();
        editorRef.executeEdits("add-missing", [
          {
            range: fullRange,
            text: newContent,
            forceMoveMarkers: true,
          },
        ]);
      } else {
        handleEditorChange(newContent);
      }
    } catch (e) {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const purgeDeprecatedStrings = () => {
    if (!activeFile) return;
    try {
      const parsed = JSON.parse(activeFile.content);
      const isLexiconActive =
        activeFile?.content?.includes("_meta_lang") ||
        activeFile?.content?.includes('"a_citizen"') ||
        activeFile?.content?.includes('"term_mod"') ||
        activeFile?.name.startsWith("en-") ||
        activeFile?.name.startsWith("de-") ||
        activeFile?.name.startsWith("es-") ||
        activeFile?.name.startsWith("fr-");
      const isEnDefault = activeFile?.name.includes("en-default");
      const reference = isEnDefault
        ? null
        : referenceData && Object.keys(referenceData).length > 0
          ? referenceData
          : isLexiconActive
            ? enDefault
            : null;

      if (!reference) return;

      const newObj = deepPurgeDeprecated(reference, parsed, isLexiconActive);
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
    } catch (e) {
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

  const cloudTabs = [
    {
      id: "sanctuary_schemas",
      label: t("tab_schemas", "Schemas"),
      icon: "data_object",
      number: internalCloudTarget === "sanctuary_schemas" ? files.length.toString() : undefined,
    },
    {
      id: "sanctuary_lexicons",
      label: t("tab_lexicons", "Lexicons"),
      icon: "translate",
      number: internalCloudTarget === "sanctuary_lexicons" ? files.length.toString() : undefined,
    },
  ];

  const localTabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: "dashboard",
      number: (files?.length || 0).toString(),
    },
    {
      id: "templates",
      label: t("upload_template_title", "Templates"),
      icon: "data_object",
      number: (
        files?.filter(
          (f: any) =>
            f.name.toLowerCase().endsWith(".json") && !f.name.match(/^[a-z]{2}-.+\.json$/i)
        ).length || 0
      ).toString(),
    },
    {
      id: "lexicon",
      label: t("tab_lexicons", "Lexicons"),
      icon: "translate",
      number: (
        files?.filter((f: any) => f.name.match(/^[a-z]{2}-.+\.json$/i)).length || 0
      ).toString(),
    },
    {
      id: "settings",
      label: t("tab_configs", "Configurations"),
      icon: "settings",
      number: (
        files?.filter(
          (f: any) => f.name.toLowerCase().endsWith(".ini") || f.name.toLowerCase().endsWith(".cfg")
        ).length || 0
      ).toString(),
    },
  ];

  const tabs = isCloudMode ? cloudTabs : localTabs;
  const activeTab = isCloudMode ? internalCloudTarget : fileTypeFilter;
  const isLexiconCreation =
    (!isCloudMode && createMode === "lexicon") ||
    (isCloudMode && internalCloudTarget === "sanctuary_lexicons");

  const isLexiconTabActive =
    (isCloudMode && internalCloudTarget === "sanctuary_lexicons") ||
    (!isCloudMode && fileTypeFilter === "lexicon");

  const uniqueLanguages = Array.from(
    new Set(
      (files || [])
        .map((f: any) => f.language)
        .filter((l: any) => typeof l === "string" && l.trim() !== "")
    )
  ) as string[];

  const uniqueCommunities = Array.from(
    new Set(
      (files || [])
        .map((f: any) => f.community)
        .filter((c: any) => typeof c === "string" && c.trim() !== "")
    )
  ) as string[];

  return (
    <ElevatedHubLayout
      headerTitle={t("ide_title", "Architect Studio")}
      headerIcon="code"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("search_files", "Search files...") as string}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => {
        if (isCloudMode) setInternalCloudTarget(id as any);
        else setFileTypeFilter(id);
      }}
      hideSearch={activeTab === "overview"}
      primaryPopover={
        isLexiconTabActive
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
                  {uniqueLanguages.length > 0 && (
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
                          ...uniqueLanguages.map((lang) => ({ id: lang, label: lang })),
                        ]}
                      />
                    </>
                  )}
                  {uniqueCommunities.length > 0 && (
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
                          ...uniqueCommunities.map((comm) => ({ id: comm, label: comm })),
                        ]}
                      />
                    </>
                  )}
                </div>
              ),
            }
          : undefined
      }
      actions={
        activeTab !== "overview"
          ? [
              {
                id: "create",
                icon: (
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_add", "add")}
                  </span>
                ),
                label: t("auto_create_file", "Create") as string,
                onClick: () => setIsCreatePanelOpen(true),
              },
              {
                id: "import",
                icon: (
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_upload", "upload")}
                  </span>
                ),
                label: t("import_file", "Import") as string,
                onClick: handleImport,
              },
            ]
          : undefined
      }
    >
      {uploadState.isOpen && (
        <MarketUploadPanel
          uploadState={uploadState}
          setUploadState={setUploadState}
          marketTab="LEXICONS"
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
      )}

      {fileTypeFilter === "overview" && !isCloudMode ? (
        <HubOverviewLanding>
          <HubOverviewSection
            icon="history"
            iconColorClass="text-[var(--accent)]"
            title={t("ide_recent_file", "Recent Files")}
          >
            <MasonFileBrowser
              t={t}
              isCloudMode={isCloudMode}
              internalCloudTarget={internalCloudTarget}
              files={files.slice(0, 10)}
              searchQuery={searchQuery}
              fileTypeFilter="all"
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
              layout="list"
            />
          </HubOverviewSection>
          <HubOverviewSection
            icon="warning"
            iconColorClass="text-[var(--warning)]"
            title={t("ide_unsaved_files", "Unsaved Changes")}
          >
            <MasonFileBrowser
              t={t}
              isCloudMode={isCloudMode}
              internalCloudTarget={internalCloudTarget}
              files={(files || []).filter(
                (f: any) =>
                  hasIdeCachedDraft(f.path) ||
                  openFiles.some((o: any) => o.path === f.path && o.content !== o.originalContent)
              )}
              searchQuery={searchQuery}
              fileTypeFilter="all"
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
              layout="list"
            />
          </HubOverviewSection>
        </HubOverviewLanding>
      ) : (
        <MasonFileBrowser
          t={t}
          isCloudMode={isCloudMode}
          internalCloudTarget={internalCloudTarget}
          files={files}
          searchQuery={searchQuery}
          fileTypeFilter={fileTypeFilter}
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
          handlePublishLexicon={isVerifiedMason ? handlePublishLexicon : undefined}
        />
      )}

      <MasonEditorPanel
        t={t}
        isCloudMode={isCloudMode}
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
        handlePublishLexicon={isVerifiedMason ? handlePublishLexicon : undefined}
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

      <SidePanel
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        title={t("auto_create_file", "Create File")}
        subtitle={t("auto_create_file_sub", "Create a new file")}
        icon={t("icon_add", "add")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="add"
              variant="accent"
              onClick={handleCreateSubmit}
              disabled={!createFileName.trim() || (!isLexiconCreation && !createFileExt.trim())}
              tooltip={t("auto_create", "Create")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={isLexiconCreation ? t("icon_translate", "translate") : t("icon_add", "add")}
            overline={
              isCloudMode
                ? internalCloudTarget === "sanctuary_lexicons"
                  ? t("creating_master_lexicon", "CREATING MASTER LEXICON")
                  : t("creating_master_schema", "CREATING MASTER SCHEMA")
                : t("ide_title", "Architect Studio")
            }
            title={t("auto_create_file", "Create File")}
            description={
              isLexiconCreation
                ? t(
                    "create_lexicon_msg",
                    "Creating a Lexicon Pack generates a JSON file populated with all keys from en-default.json."
                  ).replace(/<[^>]*>/g, "")
                : t(
                    "auto_create_file_sub",
                    "Initialize a new configuration, template, or lexicon pack inside Architect Studio."
                  )
            }
            badge={isLexiconCreation ? t("auto_lexicon_pack", "Lexicon") : createFileExt || ".json"}
            variant="accent"
          />

          {!isCloudMode && (
            <div className="grid grid-cols-2 gap-2.5">
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_description", "description")}
                label={t("auto_standard_file", "Standard File")}
                active={createMode === "standard"}
                onClick={() => setCreateMode("standard")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_translate", "translate")}
                label={t("auto_lexicon_pack", "Lexicon Pack")}
                active={createMode === "lexicon"}
                onClick={() => setCreateMode("lexicon")}
              />
            </div>
          )}

          <SidePanelTitleInput
            label={
              isLexiconCreation
                ? t("label_lexicon_name", "Lexicon Name")
                : t("author_filename", "File Name")
            }
            value={createFileName}
            onChange={setCreateFileName}
            placeholder={
              isLexiconCreation
                ? t("label_lexicon_name", "Lexicon Name")
                : t("author_filename", "File Name")
            }
          />

          <UniversalGroup
            title={t("auto_create_file", "File Parameters")}
            icon={t("icon_code", "code")}
          >
            {isLexiconCreation ? (
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
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                    {t("author_filename", "File Name")}
                  </label>
                  <input
                    type="text"
                    value={createFileName}
                    onChange={(e) => setCreateFileName(e.target.value)}
                    placeholder="example"
                    className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateSubmit();
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                    {t("auto_extension", "Extension")}
                  </label>
                  <input
                    type="text"
                    value={createFileExt}
                    onChange={(e) => setCreateFileExt(e.target.value)}
                    placeholder=".json"
                    className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateSubmit();
                    }}
                  />
                </div>
              </div>
            )}
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
