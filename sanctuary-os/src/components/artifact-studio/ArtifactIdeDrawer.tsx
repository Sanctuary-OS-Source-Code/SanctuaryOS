import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { PanelHeaderButton, PanelHeaderGroup, SidePanel } from "../../shared";
import { WorkbenchRawEditor } from "../../workbench/WorkbenchRawEditor";
import VersionTimeline from "../../VersionTimeline";

export function ArtifactIdeDrawer({
  cwSelectedFile,
  hasUnsavedIdeChanges,
  wbFileState,
  wbEditorState,
  wbLayoutState,
  wbShowTimeline,
  setWbShowTimeline,
}: {
  cwSelectedFile: { name: string; path: string } | null;
  hasUnsavedIdeChanges: boolean;
  wbFileState: any;
  wbEditorState: any;
  wbLayoutState: any;
  wbShowTimeline: boolean;
  setWbShowTimeline: (val: boolean) => void;
}) {
  const { t } = useLexicon();

  if (!cwSelectedFile) return null;

  return (
    <>
      <SidePanel
        isOpen={!!cwSelectedFile}
        onClose={() => useStore.getState().setCwSelectedFile(null)}
        title={t("editor_mode", "Editor Mode")}
        subtitle={cwSelectedFile.name}
        icon={t("icon_code", "code")}
        iconColorClass="theme-text-accent"
        isResizable={!wbLayoutState.isFullscreen}
        defaultWidth={wbLayoutState.isFullscreen ? window.innerWidth : 900}
        panelClass={wbLayoutState.isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none" : ""}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={wbFileState.isSaving ? t("btn_saving", "Saving...") : t("save", "Save")}
              variant={hasUnsavedIdeChanges ? "success" : "default"}
              disabled={!hasUnsavedIdeChanges || wbFileState.isSaving}
              onClick={() => wbFileState.saveConfig(wbEditorState.rawText, (savedRaw: string) => wbEditorState.syncSavedBaseline(savedRaw))}
            />
            <PanelHeaderButton
              icon={t("icon_history", "history")}
              tooltip={t("btn_timeline", "Version History")}
              onClick={() => setWbShowTimeline(true)}
            />
            <PanelHeaderButton
              icon={wbLayoutState.isFullscreen ? "fullscreen_exit" : "fullscreen"}
              tooltip={
                wbLayoutState.isFullscreen
                  ? t("btn_exit_fullscreen", "Exit Fullscreen")
                  : t("btn_fullscreen", "Fullscreen")
              }
              onClick={() => wbLayoutState.setIsFullscreen(!wbLayoutState.isFullscreen)}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex-1 min-h-0 flex flex-col h-full w-full relative gap-3 p-2">
          {wbEditorState.problemsList.length > 0 && (
            <div
              onClick={() => {
                if (wbEditorState.editorRef && wbEditorState.problemsList[0]) {
                  wbEditorState.editorRef.revealLineInCenter(wbEditorState.problemsList[0].line);
                  wbEditorState.editorRef.setPosition({
                    lineNumber: wbEditorState.problemsList[0].line,
                    column: wbEditorState.problemsList[0].column,
                  });
                  wbEditorState.editorRef.focus();
                }
              }}
              className="w-full flex items-center justify-between gap-4 glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] rounded-xl px-4 py-3 cursor-pointer transition-all shrink-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined !text-[18px] text-[var(--danger)] shrink-0">
                  {t("icon_error", "error")}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-[var(--danger)] flex items-center gap-2">
                    <span>
                      {wbEditorState.problemsList.length} {t("syntax_error_title", "Syntax Error")}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color-mix(in_srgb,var(--danger)_25%,transparent)]">
                      {t("line_label", "Line")} {wbEditorState.problemsList[0]?.line}
                    </span>
                  </span>
                  <span className="text-[11px] text-[var(--subtext)] font-mono truncate">
                    {wbEditorState.problemsList[0]?.message}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="monaco-wrapper relative flex flex-col flex-1 min-w-0 min-h-0 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden">
            <WorkbenchRawEditor
              value={wbEditorState.rawText}
              onChange={wbEditorState.handleRawChange}
              language={
                cwSelectedFile.name.toLowerCase().endsWith(".json") ||
                (wbEditorState.rawText &&
                  (wbEditorState.rawText.trim().startsWith("{") ||
                    wbEditorState.rawText.trim().startsWith("[")))
                  ? "json"
                  : cwSelectedFile.name.toLowerCase().endsWith(".xml")
                    ? "xml"
                    : "ini"
              }
              isLight={wbLayoutState.isLight}
              problemsList={wbEditorState.problemsList}
              setProblemsList={wbEditorState.setProblemsList}
              onEditorMount={(editor) => {
                wbEditorState.setEditorRef(editor);
              }}
            />
          </div>
        </div>
      </SidePanel>

      {wbShowTimeline && cwSelectedFile && (
        <VersionTimeline
          key={cwSelectedFile.path}
          filePath={cwSelectedFile.path}
          hasUnsavedChanges={useStore.getState().cwUnsavedEdits[cwSelectedFile.path] !== undefined}
          activeVersionTimestamp={null}
          currentContent={wbEditorState.rawText}
          savedContent={wbEditorState.savedRawText}
          onApplySettingValue={wbEditorState.handleVisualChange}
          onUndoAllUnsaved={wbEditorState.handleUndoAllUnsaved}
          initialSelection={hasUnsavedIdeChanges ? "unsaved" : "latest"}
          onRestore={async (content) => {
            wbEditorState.syncSavedBaseline(content, cwSelectedFile.name);
            wbEditorState.handleRawChange(content, true);
            useStore.getState().setCwUnsavedEdits((prev) => {
              const next = { ...prev };
              delete next[cwSelectedFile.path];
              return next;
            });
            try {
              await invoke("save_file_silently", { path: cwSelectedFile.path, content });
              useStore.getState().pushStatus(t("alert_saved", "Saved"), "success");
            } catch {
              useStore.getState().pushStatus(t("alert_error", "Error"), "error");
            }
          }}
          onClose={() => setWbShowTimeline(false)}
        />
      )}
    </>
  );
}

