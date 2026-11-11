import React, { useState, useEffect, useRef, Suspense } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useWorkbenchFiles } from "../workbench/hooks/useWorkbenchFiles";
import { useWorkbenchEditor } from "../workbench/hooks/useWorkbenchEditor";
import { useWorkbenchLayout } from "../workbench/hooks/useWorkbenchLayout";
import { useMasonFiles, clearIdeCachedDraft } from "../hooks/useMasonFiles";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, remove } from "@tauri-apps/plugin-fs";

const WorkbenchSidePanel = React.lazy(() =>
  import("../workbench/WorkbenchSidePanel").then((m) => ({ default: m.WorkbenchSidePanel }))
);
const PushTemplateSidePanel = React.lazy(() =>
  import("../side-panels/PushTemplateSidePanel").then((m) => ({ default: m.PushTemplateSidePanel }))
);
const WorkbenchTemplateGuide = React.lazy(() =>
  import("../workbench/WorkbenchTemplateGuide").then((m) => ({ default: m.WorkbenchTemplateGuide }))
);
const VersionTimeline = React.lazy(() => import("../VersionTimeline"));
const MasonEditorPanel = React.lazy(() => import("../hub-components/MasonEditorPanel"));

function StandaloneWorkbenchSidePanel() {
  const { t } = useLexicon();
  const mainTab = useStore((state) => state.cwMainTab);
  const selectedFile = useStore((state) => state.cwSelectedFile);

  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineInitialSelection, setTimelineInitialSelection] = useState<
    "unsaved" | "latest"
  >("latest");

  const fileState = useWorkbenchFiles({ mainTab, mainSearchQuery: "" });
  const editorState = useWorkbenchEditor();
  const layoutState = useWorkbenchLayout({
    editorRef: editorState.editorRef,
    previewMode: "preview",
    isTemplateMode: selectedFile?.name.toLowerCase().endsWith(".json") || false,
  });

  const [activeTemplate, setActiveTemplate] = useState<any>(null);
  const [customAppliedTemplate, setCustomAppliedTemplate] = useState<any>(null);
  const [selectedTemplatePath, setSelectedTemplatePath] =
    useState<string>("built_in");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastInitializedFile, setLastInitializedFile] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!selectedFile) {
      setLastInitializedFile(null);
      setActiveTemplate(null);
      setCustomAppliedTemplate(null);
      setSelectedCategory("ALL");
      setSearchQuery("");
      return;
    }

    if (lastInitializedFile !== selectedFile.path) {
      setSelectedCategory("ALL");
      setSearchQuery("");
    }

    if (fileState.availableTemplates.length > 0) {
      const existingMatch = fileState.availableTemplates.find(
        (tmpl: any) => tmpl.id === selectedTemplatePath
      );
      const currentData = activeTemplate || customAppliedTemplate;
      const hasHydratedData = Boolean(currentData);
      const versionChanged =
        existingMatch?.data?.template_version &&
        currentData?.template_version !== existingMatch.data.template_version;
      if (
        lastInitializedFile !== selectedFile.path ||
        !existingMatch ||
        !hasHydratedData ||
        versionChanged
      ) {
        setLastInitializedFile(selectedFile.path);

        const commTmpl = fileState.availableTemplates.find(
          (tmpl: any) => tmpl.isCommunity
        );
        const builtIn = fileState.availableTemplates.find(
          (tmpl: any) => tmpl.id === "built_in"
        );

        const defaultId =
          lastInitializedFile === selectedFile.path && existingMatch
            ? existingMatch.id
            : commTmpl
              ? commTmpl.id
              : builtIn
                ? "built_in"
                : fileState.availableTemplates[0].id;
        setSelectedTemplatePath(defaultId);

        const tmpl = fileState.availableTemplates.find(
          (tItem: any) => tItem.id === defaultId
        );
        const resolvedData = tmpl?.data
          ? Array.isArray(tmpl.data)
            ? tmpl.data[0]
            : tmpl.data
          : null;
        if (tmpl && (tmpl.id === "built_in" || tmpl.isCommunity)) {
          setActiveTemplate(resolvedData);
          setCustomAppliedTemplate(null);
        } else if (tmpl) {
          setCustomAppliedTemplate(resolvedData);
          setActiveTemplate(null);
        }
      }
    } else {
      setActiveTemplate(null);
      setCustomAppliedTemplate(null);
    }
  }, [
    selectedFile,
    fileState.availableTemplates,
    lastInitializedFile,
    selectedTemplatePath,
    activeTemplate,
    customAppliedTemplate,
  ]);

  if (!selectedFile) return null;

  return (
    <>
      <WorkbenchSidePanel
        fileState={fileState}
        editorState={editorState}
        layoutState={layoutState}
        activeTemplate={activeTemplate}
        customAppliedTemplate={customAppliedTemplate}
        selectedTemplatePath={selectedTemplatePath}
        availableTemplates={fileState.availableTemplates}
        selectedCategory={selectedCategory}
        setSelectedTemplatePath={setSelectedTemplatePath}
        setActiveTemplate={setActiveTemplate}
        setCustomAppliedTemplate={setCustomAppliedTemplate}
        setSelectedCategory={setSelectedCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        files={fileState.files}
        setShowTimeline={setShowTimeline}
        setTimelineInitialSelection={setTimelineInitialSelection}
        setIsPushModalOpen={setIsPushModalOpen}
      />

      <PushTemplateSidePanel
        isOpen={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        templateContent={editorState.rawText}
        onChange={editorState.handleRawChange}
        onPushSuccess={async (newName, newJson) => {
          if (selectedFile) {
            try {
              const sanitizedName = newName.replace(/[^a-z0-9_\-\.]/gi, "_");
              const newFileName = sanitizedName.toLowerCase().endsWith(".json")
                ? sanitizedName
                : sanitizedName + ".json";

              if (newFileName !== selectedFile.name) {
                const dirPath = selectedFile.path.substring(
                  0,
                  selectedFile.path.lastIndexOf(
                    selectedFile.path.includes("\\") ? "\\" : "/"
                  )
                );
                const sep = selectedFile.path.includes("\\") ? "\\" : "/";
                const newPath = `${dirPath}${sep}${newFileName}`;

                await writeTextFile(newPath, newJson);
                await remove(selectedFile.path);

                useStore
                  .getState()
                  .setCwSelectedFile({ name: newFileName, path: newPath });
              } else {
                await invoke("save_file_silently", {
                  path: selectedFile.path,
                  content: newJson,
                });
              }
            } catch (e) {
              console.error("Failed to rename file after push", e);
            }
          }
          setIsPushModalOpen(false);
        }}
      />

      <WorkbenchTemplateGuide
        isOpen={layoutState.isTemplateGuideOpen}
        onClose={() => layoutState.setIsTemplateGuideOpen(false)}
      />

      {showTimeline && selectedFile && (
        <VersionTimeline
          key={selectedFile.path}
          filePath={selectedFile.path}
          hasUnsavedChanges={
            useStore.getState().cwUnsavedEdits[selectedFile.path] !== undefined
          }
          activeVersionTimestamp={null}
          currentContent={editorState.rawText}
          savedContent={editorState.savedRawText}
          visualTemplate={
            !selectedFile.name.toLowerCase().endsWith(".json")
              ? selectedTemplatePath &&
                selectedTemplatePath !== "built_in" &&
                customAppliedTemplate
                ? customAppliedTemplate
                : activeTemplate
              : undefined
          }
          onApplySettingValue={editorState.handleVisualChange}
          onUndoAllUnsaved={editorState.handleUndoAllUnsaved}
          initialSelection={timelineInitialSelection}
          onRestore={async (content) => {
            editorState.syncSavedBaseline(content, selectedFile.name);
            editorState.handleRawChange(content, true);

            useStore.getState().setCwUnsavedEdits((prev) => {
              const next = { ...prev };
              delete next[selectedFile.path];
              return next;
            });

            try {
              await invoke("save_file_silently", {
                path: selectedFile.path,
                content,
              });
              useStore
                .getState()
                .pushStatus(t("alert_saved", "Saved"), "success");
            } catch {
              useStore
                .getState()
                .pushStatus(
                  t("alert_error", "Failed to save restored version"),
                  "error"
                );
            }
          }}
          onClose={() => setShowTimeline(false)}
        />
      )}
    </>
  );
}

function StandaloneMasonEditorSidePanel() {
  const { t } = useLexicon();
  const vaultPath = useStore((state) => state.vaultPath);
  const mason = useMasonFiles({ vaultPath, isCloudMode: false });
  const isResizing = useRef(false);

  const {
    pushStatus,
    showTimeline,
    setShowTimeline,
    problemsList,
    setProblemsList,
    activeVersionTimestamp,
    setActiveVersionTimestamp,
    editorRef,
    setEditorRef,
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
    closeFile,
    handleEditorChange,
    discardChanges,
  } = mason;

  const activeFile =
    activeFileIndex >= 0 && openFiles ? openFiles[activeFileIndex] : null;
  const isDirty = activeFile
    ? activeFile.content !== activeFile.originalContent
    : false;

  const saveFile = async () => {
    if (activeFileIndex < 0 || !openFiles[activeFileIndex]) return;
    const file = openFiles[activeFileIndex];
    try {
      const normalizedPath = file.path.replace(/\//g, "\\");
      await invoke("save_file_with_history", {
        path: normalizedPath,
        content: file.content,
      });
      clearIdeCachedDraft(file.path);
      const newFiles = [...openFiles];
      newFiles[activeFileIndex] = {
        ...file,
        originalContent: file.content,
      };
      setOpenFiles(newFiles);
      setActiveVersionTimestamp(null);
      pushStatus(t("alert_saved", "Saved"), "success");
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  if (!activeFile) return null;

  return (
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
      validationStats={null}
      isDirty={isDirty}
      saveFile={saveFile}
      discardChanges={discardChanges}
      openFiles={openFiles}
      closeFile={closeFile}
      splitRatio={splitRatio}
      isLight={false}
      addMissingStrings={() => {}}
      purgeDeprecatedStrings={() => {}}
      jumpToNextEmpty={() => {}}
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
  );
}

export function GlobalWorkbenchSidePanelHost() {
  const view = useStore((state) => state.view);
  const cwSelectedFile = useStore((state) => state.cwSelectedFile);
  const masonActiveTab = useStore((state) => state.masonActiveTab);
  const wayfinderActiveTab = useStore((state) => state.wayfinderActiveTab);
  const ideOpenFiles = useStore((state) => state.ideOpenFiles);
  const ideActiveFileIndex = useStore((state) => state.ideActiveFileIndex);

  const [isGlobalWorkbenchRequested, setIsGlobalWorkbenchRequested] =
    useState(false);
  const [isGlobalIdeRequested, setIsGlobalIdeRequested] = useState(false);

  useEffect(() => {
    const onOpenWorkbench = () => setIsGlobalWorkbenchRequested(true);
    const onOpenIde = () => setIsGlobalIdeRequested(true);
    window.addEventListener(
      "sanctuary-open-global-workbench",
      onOpenWorkbench
    );
    window.addEventListener("sanctuary-open-global-ide", onOpenIde);
    return () => {
      window.removeEventListener(
        "sanctuary-open-global-workbench",
        onOpenWorkbench
      );
      window.removeEventListener("sanctuary-open-global-ide", onOpenIde);
    };
  }, []);

  useEffect(() => {
    if (!cwSelectedFile && isGlobalWorkbenchRequested) {
      setIsGlobalWorkbenchRequested(false);
    }
  }, [cwSelectedFile, isGlobalWorkbenchRequested]);

  useEffect(() => {
    if (
      (ideActiveFileIndex < 0 || !ideOpenFiles || ideOpenFiles.length === 0) &&
      isGlobalIdeRequested
    ) {
      setIsGlobalIdeRequested(false);
    }
  }, [ideActiveFileIndex, ideOpenFiles, isGlobalIdeRequested]);

  const isWorkbenchMountedInView = view === "CitizensWorkbench";

  const isMasonEditorMountedInView =
    (view === "MasonHub" && masonActiveTab === "chameleons") ||
    (view === "WayfinderHub" &&
      (wayfinderActiveTab === "wf_chameleons" ||
        wayfinderActiveTab === "wf_schemas_title")) ||
    view === "KeepersCore";

  return (
    <Suspense fallback={null}>
      {isGlobalWorkbenchRequested &&
        Boolean(cwSelectedFile) &&
        !isWorkbenchMountedInView && <StandaloneWorkbenchSidePanel />}

      {isGlobalIdeRequested &&
        ideActiveFileIndex >= 0 &&
        Array.isArray(ideOpenFiles) &&
        ideOpenFiles.length > 0 &&
        !isMasonEditorMountedInView && <StandaloneMasonEditorSidePanel />}
    </Suspense>
  );
}
