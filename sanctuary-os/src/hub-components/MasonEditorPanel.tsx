import React, { useState, useRef, useEffect } from "react";
import {
  SidePanel,
  ActionButton,
  PanelHeaderButton,
  PanelHeaderGroup,
  HoverTooltip,
  VAULT_CHIP_CLASS,
} from "../shared";
import Editor from "@monaco-editor/react";
import VersionTimeline from "../VersionTimeline";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../ThemeContext";
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from "../utils/monacoTheme";
import LexiconVisualStudio from "./LexiconVisualStudio";
import SchemaVisualStudio from "./SchemaVisualStudio";
import KeepersTitleAreaStudio from "./KeepersTitleAreaStudio";

export default function MasonEditorPanel({
  t,
  isCloudMode,
  isKeepers = false,
  isFullscreen,
  setIsFullscreen,
  showReference,
  setShowReference,
  showTimeline,
  setShowTimeline,
  activeFile,
  activeFileIndex,
  setActiveFileIndex,
  problemsList = [],
  setProblemsList,
  validationStats,
  isDirty,
  saveFile,
  discardChanges,
  handlePublishLexicon,
  closeFile,
  splitRatio = 50,
  isLight = false,
  addMissingStrings,
  purgeDeprecatedStrings,
  jumpToNextEmpty,
  handleEditorWillMount,
  handleEditorChange,
  setEditorRef,
  validateContent,
  referenceLabel,
  referenceData,
  isResizing,
  editorRef,
  activeVersionTimestamp,
  setActiveVersionTimestamp,
  setOpenFiles,
  pushStatus,
}: any) {
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const [editorViewMode, setEditorViewMode] = useState<"visual" | "split" | "raw">("visual");
  const rightEditorRef = useRef<any>(null);
  const isSyncingScroll = useRef(false);

  useEffect(() => {
    if (!isScrollLocked || !editorRef || !rightEditorRef.current) return;

    const leftEditor = editorRef;
    const rightEditor = rightEditorRef.current;

    const leftScrollListener = leftEditor.onDidScrollChange((e: any) => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      const leftHeight = leftEditor.getScrollHeight() - leftEditor.getLayoutInfo().height;
      const perc = leftHeight > 0 ? e.scrollTop / leftHeight : 0;
      const rightHeight = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
      rightEditor.setScrollTop(perc * rightHeight);
      setTimeout(() => {
        isSyncingScroll.current = false;
      }, 10);
    });

    const rightScrollListener = rightEditor.onDidScrollChange((e: any) => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      const rightHeight = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
      const perc = rightHeight > 0 ? e.scrollTop / rightHeight : 0;
      const leftHeight = leftEditor.getScrollHeight() - leftEditor.getLayoutInfo().height;
      leftEditor.setScrollTop(perc * leftHeight);
      setTimeout(() => {
        isSyncingScroll.current = false;
      }, 10);
    });

    return () => {
      leftScrollListener.dispose();
      rightScrollListener.dispose();
    };
  }, [isScrollLocked, editorRef]);

  const isTitleAreaActive = Boolean(
    activeFile?.name?.toLowerCase() === "core-title-area.json" ||
      activeFile?.path === "cloud://core-title-area"
  );
  const isLexiconActive = Boolean(
    !isTitleAreaActive &&
      (activeFile?.content?.includes("_meta_lang") ||
        activeFile?.content?.includes('"a_citizen"') ||
        activeFile?.content?.includes('"term_mod"') ||
        activeFile?.name?.match(/^[a-z]{2}-.+\.json$/i) !== null ||
        activeFile?.name?.toLowerCase() === "simlish.json")
  );
  const isSchemaActive = Boolean(
    !isTitleAreaActive &&
      !isLexiconActive &&
      activeFile?.content?.includes('"schema_version"') &&
      !activeFile?.content?.includes('"template_id"')
  );
  const hasVisualStudio = isLexiconActive || isSchemaActive || isTitleAreaActive;
  const isJsonFile = Boolean(
    activeFile?.name?.toLowerCase().endsWith(".json") ||
      isLexiconActive ||
      isSchemaActive ||
      isTitleAreaActive
  );
  const hasReference = isJsonFile && referenceData && Object.keys(referenceData).length > 0;

  const isJsonParseError = React.useMemo(() => {
    if (!activeFile || !isJsonFile) return false;
    try {
      JSON.parse(activeFile.content);
      return false;
    } catch {
      return true;
    }
  }, [activeFile?.content, isJsonFile]);

  const isValidationRequired =
    activeFile && !isLexiconActive && activeFile.name?.includes("Sims4");
  const isPublishDisabled =
    !activeFile ||
    !isDirty ||
    problemsList.length > 0 ||
    isJsonParseError ||
    (isCloudMode && !isKeepers && isValidationRequired && !validationStats) ||
    (!isKeepers && isValidationRequired && validationStats ? validationStats.missing > 0 : false);

  const { currentTheme } = useTheme();
  useSanctuaryMonacoTheme(currentTheme, isLight);

  const ensureSanctuaryThemes = (monaco: any) => {
    defineSanctuaryMonacoThemes(monaco, currentTheme);
    if (handleEditorWillMount) {
      handleEditorWillMount(monaco);
    }
  };

  const resolveEditorLanguage = (fileName = "", content = "") => {
    const lower = fileName.toLowerCase();
    if (
      lower.endsWith(".json") ||
      content.trim().startsWith("{") ||
      content.trim().startsWith("[")
    )
      return "json";
    if (lower.endsWith(".cfg") || lower.endsWith(".ini")) return "ini";
    if (lower.endsWith(".xml")) return "xml";
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
    if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
    if (lower.endsWith(".md")) return "markdown";
    return "ini";
  };

  const getSaveTooltip = () => {
    if (isPublishDisabled) {
      if (isJsonParseError) return t("err_invalid_json", "Cannot save invalid JSON");
      if (problemsList.length > 0)
        return t("publish_disabled_errors_desc", "Fix syntax errors before saving");
      if (isCloudMode && !isKeepers && isValidationRequired && !validationStats)
        return t("awaiting_schema_validation", "Awaiting schema validation");
      return t("lexicon_missing_keys_btn", "No unsaved changes");
    }
    return isDirty
      ? t("unsaved_changes", "Save Changes")
      : isCloudMode
        ? t("btn_publish", "Publish")
        : t("save", "Save");
  };

  const getSaveVariant = () => {
    if (isPublishDisabled && (isJsonParseError || problemsList.length > 0)) return "error";
    if (isDirty) return "warning";
    return "default";
  };

  const syncTooltip =
    problemsList.length > 0
      ? t("publish_disabled_errors_desc", "Fix syntax errors")
      : t("lexicon_missing_keys_btn", "Complete missing keys");
  const isSyncDisabled =
    problemsList.length > 0 ||
    (!isLexiconActive && validationStats ? validationStats.missing > 0 : false);

  const renderVisualPane = () => {
    if (!activeFile) return null;
    if (isTitleAreaActive) {
      return (
        <KeepersTitleAreaStudio
          content={activeFile.content}
          onChange={(val) => handleEditorChange && handleEditorChange(val)}
          fileName={activeFile.name}
        />
      );
    }
    if (isLexiconActive) {
      return (
        <LexiconVisualStudio
          content={activeFile.content}
          onChange={(val) => handleEditorChange && handleEditorChange(val)}
          referenceData={referenceData}
          fileName={activeFile.name}
          onAddMissing={addMissingStrings}
          onPurgeDeprecated={purgeDeprecatedStrings}
          isKeepers={isKeepers}
        />
      );
    }
    if (isSchemaActive) {
      return (
        <SchemaVisualStudio
          content={activeFile.content}
          onChange={(val) => handleEditorChange && handleEditorChange(val)}
          fileName={activeFile.name}
          isKeepers={isKeepers}
        />
      );
    }
    return null;
  };

  const renderMonacoPane = () => {
    if (!activeFile) return null;
    return (
      <div className="flex-1 min-h-0 relative flex flex-col h-full w-full">
        <div className="px-5 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
              {activeFile.name?.endsWith(".json")
                ? t("icon_data_object", "data_object")
                : t("icon_description", "description")}
            </span>
            <span className="text-xs font-black text-[var(--text)] truncate font-mono">
              {activeFile.name}
            </span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span
              className={`material-symbols-outlined !text-[12px] ${
                problemsList.length > 0 || isJsonParseError
                  ? "text-[var(--danger)]"
                  : isDirty
                    ? "text-[var(--warning)]"
                    : "text-[var(--success)]"
              }`}
            >
              {problemsList.length > 0 || isJsonParseError
                ? t("icon_error", "error")
                : isDirty
                  ? t("icon_edit_note", "edit_note")
                  : t("icon_check_circle", "check_circle")}
            </span>
            <span>{isDirty ? t("unsaved_changes", "Modified") : t("status_synced", "Synced")}</span>
          </div>
        </div>
        <div className="monaco-wrapper flex-1 min-h-0 relative w-full">
          <Editor
            height="100%"
            language={resolveEditorLanguage(activeFile.name, activeFile.content)}
            theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
            beforeMount={ensureSanctuaryThemes}
            value={activeFile.content}
            onChange={handleEditorChange}
            onMount={(editor, monaco) => {
              ensureSanctuaryThemes(monaco);
              monaco.editor.setTheme(
                isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"
              );
              if (setEditorRef) setEditorRef(editor);
              (window as any).monaco = monaco;
              if (isJsonFile && validateContent) {
                validateContent(activeFile.content, monaco, editor.getModel());
              }
              editor.onContextMenu((e: any) => {
                if (e.event) {
                  if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent("sanctuary-monaco-contextmenu", {
                      detail: {
                        x: e.event.browserEvent ? e.event.browserEvent.clientX : e.event.posx,
                        y: e.event.browserEvent ? e.event.browserEvent.clientY : e.event.posy,
                        target: e.target?.element || document.body,
                        isReadOnly: false,
                      },
                    })
                  );
                }
              });
            }}
            options={{
              contextmenu: false,
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "var(--font-mono), Consolas, monospace",
              padding: { top: 20, bottom: 120 },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              lineHeight: 24,
              automaticLayout: true,
              hover: { enabled: "on", above: false },
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <SidePanel
        isOpen={!!activeFile}
        onClose={() => {
          if (closeFile) {
            closeFile();
          } else {
            setActiveFileIndex(-1);
          }
        }}
        title={
          isCloudMode
            ? isKeepers
              ? t("keepers_ide", "Keepers IDE")
              : t("wayfinder_ide", "Wayfinder IDE")
            : t("tools_ide", "{Mason} Editor")
        }
        subtitle={
          isLexiconActive
            ? t("lex_studio_glossary_title", "Core Terminology Matrix")
            : isSchemaActive
              ? t("schema_studio_title", "Master Schema Studio")
              : t("mason_ide_subtitle", "Development & Localization Environment")
        }
        icon={isLexiconActive ? "translate" : isSchemaActive ? "data_object" : "code"}
        iconColorClass="theme-text-accent"
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
        isResizable={!isFullscreen}
        defaultWidth={
          isFullscreen
            ? window.innerWidth
            : showReference || (hasVisualStudio && editorViewMode === "split")
              ? 1450
              : hasVisualStudio
                ? 1240
                : 1000
        }
        panelClass={
          isFullscreen
            ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none transition-all duration-500"
            : "transition-all duration-500"
        }
        headerActions={
          <>
            {hasVisualStudio && (
              <PanelHeaderGroup className="mr-2">
                <PanelHeaderButton
                  icon={t("icon_auto_awesome", "auto_awesome")}
                  tooltip={t("lex_studio_visual", "Visual Studio")}
                  isActive={editorViewMode === "visual"}
                  onClick={() => setEditorViewMode("visual")}
                />
                <PanelHeaderButton
                  icon={t("icon_vertical_split", "vertical_split")}
                  tooltip={t("lex_studio_split", "Split View")}
                  isActive={editorViewMode === "split"}
                  onClick={() => setEditorViewMode("split")}
                />
                <PanelHeaderButton
                  icon={t("icon_data_object", "data_object")}
                  tooltip={t("lex_studio_raw", "Raw JSON")}
                  isActive={editorViewMode === "raw"}
                  onClick={() => setEditorViewMode("raw")}
                />
              </PanelHeaderGroup>
            )}

            <PanelHeaderGroup>
              {isDirty && discardChanges && (
                <PanelHeaderButton
                  icon={t("icon_undo", "undo")}
                  tooltip={t("lex_studio_discard_draft_btn", "Revert Unsaved Changes")}
                  onClick={discardChanges}
                />
              )}
              <PanelHeaderButton
                icon={isCloudMode ? "cloud" : "save"}
                tooltip={getSaveTooltip()}
                variant={getSaveVariant()}
                disabled={isPublishDisabled}
                onClick={saveFile}
                isActive={isDirty}
              />
              {activeFile &&
                activeFile.name?.match(/^[a-z]{2}-.+\.json$/i) &&
                !isCloudMode &&
                handlePublishLexicon && (
                  <PanelHeaderButton
                    icon={t("icon_upload", "upload")}
                    tooltip={isSyncDisabled ? syncTooltip : t("sync_schema", "Sync Schema")}
                    variant={isSyncDisabled ? "error" : "success"}
                    disabled={isSyncDisabled}
                    onClick={() => handlePublishLexicon(activeFile)}
                  />
                )}
            </PanelHeaderGroup>

            {hasReference && (!hasVisualStudio || editorViewMode === "raw") && (
              <PanelHeaderGroup className="ml-2">
                <PanelHeaderButton
                  icon={showReference ? "vertical_split" : "splitscreen"}
                  tooltip={t("btn_reference", "Toggle Reference Split")}
                  isActive={showReference}
                  disabled={!activeFile}
                  onClick={() => setShowReference(!showReference)}
                />
              </PanelHeaderGroup>
            )}

            <PanelHeaderGroup className="ml-2">
              {hasReference &&
                showReference &&
                (!hasVisualStudio || editorViewMode === "raw") && (
                  <PanelHeaderButton
                    icon={isScrollLocked ? "lock" : "lock_open"}
                    tooltip={t("sync_scroll", "Sync Scroll")}
                    isActive={isScrollLocked}
                    onClick={() => setIsScrollLocked(!isScrollLocked)}
                  />
                )}
              {activeFile && !isCloudMode && setShowTimeline && (
                <PanelHeaderButton
                  icon={t("icon_history", "history")}
                  tooltip={t("btn_timeline", "Version Timeline")}
                  disabled={!activeFile}
                  onClick={() => setShowTimeline(true)}
                />
              )}
              {setIsFullscreen && (
                <PanelHeaderButton
                  icon={isFullscreen ? "fullscreen_exit" : "fullscreen"}
                  tooltip={
                    isFullscreen
                      ? t("exit_fullscreen", "Exit Fullscreen")
                      : t("fullscreen", "Fullscreen")
                  }
                  onClick={() => setIsFullscreen(!isFullscreen)}
                />
              )}
            </PanelHeaderGroup>
          </>
        }
      >
        <div className="absolute inset-0 flex flex-col w-full min-w-full">
          <div className="flex-1 relative flex w-full min-w-full h-full min-h-0">
            <div className="flex-1 flex w-full min-w-0 relative h-full">
              {hasVisualStudio && editorViewMode === "visual" ? (
                <div className="w-full h-full min-w-0 flex flex-col">{renderVisualPane()}</div>
              ) : hasVisualStudio && editorViewMode === "split" ? (
                <>
                  <div
                    style={{ width: `${splitRatio}%` }}
                    className="flex-shrink-0 h-full min-w-0 flex flex-col"
                  >
                    {renderVisualPane()}
                  </div>
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (isResizing) isResizing.current = true;
                      document.body.style.cursor = "col-resize";
                    }}
                    className="w-4 cursor-col-resize hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors z-50 flex items-center justify-center -ml-2 mr-2 relative group shrink-0"
                  >
                    <div className="w-[2px] h-12 bg-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:bg-[var(--accent)] transition-colors rounded-full" />
                  </div>
                  <div
                    style={{ width: `${100 - splitRatio}%` }}
                    className="flex-1 relative h-full min-w-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col bg-[color-mix(in_srgb,var(--bg)_30%,transparent)]"
                  >
                    {renderMonacoPane()}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{ width: showReference && hasReference ? `${splitRatio}%` : "100%" }}
                    className="flex-shrink-0 w-full flex flex-col relative h-full min-w-0 transition-none"
                  >
                    {renderMonacoPane()}
                  </div>

                  {showReference && hasReference && (
                    <>
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (isResizing) isResizing.current = true;
                          document.body.style.cursor = "col-resize";
                        }}
                        className="w-4 cursor-col-resize hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors z-50 flex items-center justify-center -ml-2 mr-2 relative group shrink-0"
                      >
                        <div className="w-[2px] h-12 bg-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:bg-[var(--accent)] transition-colors rounded-full" />
                      </div>
                      <div
                        style={{ width: `${100 - splitRatio}%` }}
                        className="flex-1 relative h-full min-w-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col transition-none bg-[color-mix(in_srgb,var(--bg)_30%,transparent)]"
                      >
                        <div className="flex-1 min-h-0 relative flex flex-col">
                          <div className="px-5 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 shrink-0">
                            <span className="text-xs font-black text-[var(--text)] truncate font-mono">
                              {referenceLabel || t("reference_schema", "Reference Schema")}
                            </span>
                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_lock", "lock")}
                              </span>
                              <span>{t("read_only", "Read Only")}</span>
                            </div>
                          </div>
                          <div className="monaco-wrapper flex-1 min-h-0 relative w-full">
                            <Editor
                              height="100%"
                              language="json"
                              theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                              beforeMount={ensureSanctuaryThemes}
                              value={JSON.stringify(referenceData, null, 2)}
                              onMount={(editor, monaco) => {
                                ensureSanctuaryThemes(monaco);
                                monaco.editor.setTheme(
                                  isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"
                                );
                                rightEditorRef.current = editor;
                                editor.onContextMenu((e: any) => {
                                  if (e.event) {
                                    if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                                    window.dispatchEvent(
                                      new CustomEvent("sanctuary-monaco-contextmenu", {
                                        detail: {
                                          x: e.event.browserEvent
                                            ? e.event.browserEvent.clientX
                                            : e.event.posx,
                                          y: e.event.browserEvent
                                            ? e.event.browserEvent.clientY
                                            : e.event.posy,
                                          target: e.target?.element || document.body,
                                          isReadOnly: true,
                                        },
                                      })
                                    );
                                  }
                                });
                              }}
                              options={{
                                contextmenu: false,
                                readOnly: true,
                                minimap: { enabled: false },
                                fontSize: 13,
                                fontFamily: "var(--font-mono)",
                                padding: { top: 20, bottom: 120 },
                                automaticLayout: true,
                                hover: { enabled: "on", above: false },
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Floating 3D Liquid Glass Key Validator & Syntax Error Alert Dock */}
            {(problemsList.length > 0 ||
              (validationStats &&
                (validationStats.deprecated > 0 ||
                  (!isLexiconActive && validationStats.missing > 0) ||
                  (isLexiconActive &&
                    editorViewMode !== "visual" &&
                    validationStats.missing > 0)))) && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2.5 w-max max-w-[calc(100%-2.5rem)] pointer-events-none">
                {validationStats &&
                  (validationStats.deprecated > 0 ||
                    (!isLexiconActive && validationStats.missing > 0) ||
                    (isLexiconActive &&
                      editorViewMode !== "visual" &&
                      validationStats.missing > 0)) && (
                    <div className="pointer-events-auto w-fit max-w-full glass-panel sa-floating-glass-pill rounded-2xl px-4 py-3 border flex flex-wrap items-center justify-between gap-3.5 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--warning)] shrink-0">
                          <span className="material-symbols-outlined !text-[20px]">
                            {t("icon_neurology", "neurology")}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="text-xs font-black tracking-wide text-[var(--text)]">
                              {isLexiconActive
                                ? t("validator_lexicon_title", "Lexicon Validation Alert")
                                : t("validator_schema_title", "Schema Validation Alert")}
                            </span>

                            <div className={`${VAULT_CHIP_CLASS} font-mono`}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                {t("icon_fact_check", "fact_check")}
                              </span>
                              <span>
                                {`${Math.max(
                                  0,
                                  validationStats.total - validationStats.missing
                                )} / ${validationStats.total}`}
                              </span>
                            </div>

                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_verified", "verified")}
                              </span>
                              <span>
                                {referenceLabel ||
                                  (isLexiconActive
                                    ? t("validator_source_default_lex", "en-default.json Baseline")
                                    : t(
                                        "validator_source_keepers",
                                        "Keepers Core Default Schema"
                                      ))}
                              </span>
                            </div>
                          </div>

                          <p className="text-[11px] font-medium text-[var(--subtext)] leading-snug">
                            {validationStats.missing > 0 && validationStats.deprecated > 0
                              ? (isLexiconActive
                                  ? t(
                                      "validator_desc_lex_both",
                                      "{missing} missing strings and {deprecated} deprecated keys detected against baseline."
                                    )
                                  : t(
                                      "validator_desc_schema_both",
                                      "{missing} missing schema keys and {deprecated} unrecognized fields detected against baseline."
                                    )
                                )
                                  .replace("{missing}", String(validationStats.missing))
                                  .replace("{deprecated}", String(validationStats.deprecated))
                              : validationStats.missing > 0
                                ? (isLexiconActive
                                    ? t(
                                        "validator_desc_lex_missing",
                                        "{missing} untranslated or missing strings detected — add missing keys or jump to next empty."
                                      )
                                    : t(
                                        "validator_desc_schema_missing",
                                        "{missing} required schema keys are missing from this configuration — inject defaults to sync."
                                      )
                                  ).replace("{missing}", String(validationStats.missing))
                                : (isLexiconActive
                                    ? t(
                                        "validator_desc_lex_deprecated",
                                        "{deprecated} deprecated or unused keys are no longer in the baseline and can be removed."
                                      )
                                    : t(
                                        "validator_desc_schema_deprecated",
                                        "{deprecated} unrecognized fields are not in the baseline schema and can be safely removed."
                                      )
                                  ).replace("{deprecated}", String(validationStats.deprecated))}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 pl-3 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        {validationStats.deprecated > 0 && (
                          <ActionButton
                            onClick={purgeDeprecatedStrings}
                            variant="danger"
                            icon={t("icon_delete", "delete")}
                            label={
                              <span className="whitespace-nowrap">{`${t(
                                "lexicon_purge_keys",
                                "Purge Keys"
                              )} (${validationStats.deprecated})`}</span>
                            }
                            className="!h-9 !px-3.5 !text-xs !rounded-xl"
                          />
                        )}
                        {validationStats.completelyMissing > 0 ? (
                          <ActionButton
                            onClick={addMissingStrings}
                            variant="accent"
                            icon={t("icon_add_circle", "add_circle")}
                            label={
                              <span className="whitespace-nowrap">{`${t(
                                "lexicon_add_missing",
                                "Add Missing"
                              )} (${validationStats.completelyMissing})`}</span>
                            }
                            className="!h-9 !px-3.5 !text-xs !rounded-xl"
                          />
                        ) : validationStats.missing > 0 ? (
                          <ActionButton
                            onClick={() => {
                              if (hasVisualStudio && editorViewMode === "visual") {
                                setEditorViewMode("split");
                              }
                              if (jumpToNextEmpty) jumpToNextEmpty();
                            }}
                            variant="glass"
                            icon={t("icon_arrow_downward", "arrow_downward")}
                            label={
                              <span className="whitespace-nowrap">
                                {t("lexicon_next_empty", "Next Empty")}
                              </span>
                            }
                            className="!h-9 !px-3.5 !text-xs !rounded-xl"
                          />
                        ) : null}
                      </div>
                    </div>
                  )}

                {problemsList.length > 0 && (
                  <div
                    className="pointer-events-auto w-fit max-w-full glass-panel sa-floating-glass-pill rounded-2xl px-4 py-3 border flex items-center justify-between gap-3.5 cursor-pointer transition-all group/problem"
                    onClick={() => {
                      if (hasVisualStudio && editorViewMode === "visual") {
                        setEditorViewMode("split");
                      }
                      if (editorRef && problemsList[0]) {
                        editorRef.revealLineInCenter(problemsList[0].line);
                        editorRef.setPosition({
                          lineNumber: problemsList[0].line,
                          column: problemsList[0].column,
                        });
                        editorRef.focus();
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--danger)] group-hover/problem:animate-pulse shrink-0">
                        <span className="material-symbols-outlined !text-[20px]">
                          {t("icon_error", "error")}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-xs font-black tracking-wide text-[var(--text)]">
                            {t("syntax_error_title", "Syntax Error Detected")}
                          </span>

                          <div className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                              {t("icon_bug_report", "bug_report")}
                            </span>
                            <span>
                              <strong>{problemsList.length}</strong>{" "}
                              {problemsList.length === 1
                                ? t("syntax_error", "Syntax Error")
                                : t("syntax_errors", "Syntax Errors")}
                            </span>
                          </div>

                          <div className={`${VAULT_CHIP_CLASS} font-mono`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                              {t("icon_code", "code")}
                            </span>
                            <span>
                              {t("line_label", "Line")} {problemsList[0]?.line}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-[var(--subtext)] font-mono truncate max-w-[460px]">
                          {problemsList[0]?.message}
                        </p>
                      </div>
                    </div>

                    <div className="pl-3 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (setProblemsList) setProblemsList([]);
                        }}
                        className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[var(--danger)] flex items-center justify-center text-[var(--danger)] opacity-80 hover:opacity-100 transition-all shrink-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_close", "close")}
                        </span>
                        <HoverTooltip title={t("close", "Close")} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SidePanel>

      {showTimeline && activeFile && (
        <VersionTimeline
          key={activeFile.path}
          filePath={activeFile.path.replace(/\//g, "\\")}
          hasUnsavedChanges={activeFile.content !== activeFile.originalContent}
          activeVersionTimestamp={activeVersionTimestamp}
          onRestore={async (content: string, timestamp: number) => {
            if (setOpenFiles) {
              setOpenFiles((prev: any) =>
                prev.map((f: any, i: number) =>
                  i === activeFileIndex ? { ...f, content, originalContent: content } : f
                )
              );
            }
            if (editorRef && (window as any).monaco && validateContent) {
              validateContent(content, (window as any).monaco, editorRef.getModel());
            }
            try {
              await invoke("save_file_silently", {
                path: activeFile.path.replace(/\//g, "\\"),
                content,
              });
              if (setActiveVersionTimestamp) setActiveVersionTimestamp(timestamp);
              if (pushStatus) pushStatus(t("alert_saved", "Saved"), "success");
            } catch (e) {
              console.error(e);
              if (pushStatus)
                pushStatus(
                  t("err_save_restored_version", "Failed to save restored version"),
                  "error"
                );
            }
          }}
          onClose={() => setShowTimeline && setShowTimeline(false)}
        />
      )}
    </>
  );
}
