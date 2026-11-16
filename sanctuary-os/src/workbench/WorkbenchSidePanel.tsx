import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { SidePanel, CustomDropdown, ActionPill, PanelHeaderGroup, PanelHeaderButton, HoverTooltip, VAULT_CHIP_CLASS } from '../shared';
import { WorkbenchRawEditor } from './WorkbenchRawEditor';
import { WorkbenchVisualEditor, countModifiedSettings, countEditedFromSavedSettings, countSettingsByCategory, resolveSettingDataPath, resolveCategoryIcon } from './WorkbenchVisualEditor';
import { WorkbenchEmptyVisualState } from './WorkbenchEmptyVisualState';
import { WorkbenchTemplateTools } from './WorkbenchTemplateTools';
import { WorkbenchTemplateBuilder } from './WorkbenchTemplateBuilder';
import { useTheme } from '../ThemeContext';
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from '../utils/monacoTheme';
import { isSanctuaryTemplateFile, detectMonacoLanguage, writeDataPathValue } from './workbenchFormatUtils';
import { useVerifiedMasonOrStaff } from '../utils/hubCommandCache';

export const WorkbenchCategoryBar = ({
   categories,
   settings,
   selectedCategory,
   onSelectCategory,
   resolveText,
   t,
   compact = false
}: {
   categories: any[];
   settings: any[];
   selectedCategory: string;
   onSelectCategory: (id: string) => void;
   resolveText: (k?: string, fallback?: string) => string;
   t: (k: string, fallback: string) => string;
   compact?: boolean;
}) => {
   const [isExpanded, setIsExpanded] = useState(false);
   const counts = React.useMemo(() => countSettingsByCategory(settings), [settings]);

   const pillItems = React.useMemo(() => {
      if (!Array.isArray(categories) || categories.length === 0) return [];
      return [
         {
            id: "ALL",
            label: t("cat_all", "All Settings"),
            icon: t("icon_grid_view", "grid_view"),
            count: counts.ALL || 0
         },
         ...categories.map((cat: any) => ({
            id: cat.id,
            label: resolveText(cat.name_key, cat.name || cat.id),
            icon: resolveCategoryIcon(cat, resolveText, t),
            count: counts[cat.id] || 0
         }))
      ];
   }, [categories, counts, resolveText, t]);

   const COLLAPSED_LIMIT = compact ? 4 : 8;
   const canCollapse = pillItems.length > COLLAPSED_LIMIT;
   const visibleItems = React.useMemo(() => {
      if (!canCollapse || isExpanded) return pillItems;
      const baseSlice = pillItems.slice(0, COLLAPSED_LIMIT);
      if (baseSlice.some((item) => item.id === selectedCategory)) {
         return baseSlice;
      }
      const activeItem = pillItems.find((item) => item.id === selectedCategory);
      if (activeItem) {
         return [...pillItems.slice(0, COLLAPSED_LIMIT - 1), activeItem];
      }
      return baseSlice;
   }, [pillItems, canCollapse, isExpanded, selectedCategory, COLLAPSED_LIMIT]);

   if (!Array.isArray(categories) || categories.length === 0) return null;

   const hiddenCount = Math.max(0, pillItems.length - visibleItems.length);

   return (
      <div className="flex flex-col gap-2 w-full">
         <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80">
               {t("categories", "Categories")} ({categories.length})
            </span>
            {canCollapse && (
               <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="sa-dropdown-action-chip px-2.5 h-6 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer shrink-0"
               >
                  <span>
                     {isExpanded
                        ? t("workbench_categories_compact", "Show Less")
                        : `${t("workbench_categories_show_all", "Show All")} (+${hiddenCount})`}
                  </span>
                  <span className="material-symbols-outlined !text-[14px]">
                     {isExpanded ? t("icon_expand_less", "expand_less") : t("icon_expand_more", "expand_more")}
                  </span>
               </button>
            )}
         </div>

         <div className={`grid gap-2 w-full ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {visibleItems.map((item) => {
               const isActive = selectedCategory === item.id;
               return (
                  <button
                     key={item.id}
                     type="button"
                     onClick={() => onSelectCategory(item.id)}
                     style={
                        isActive
                           ? {
                                boxShadow:
                                   "var(--glass-surface-inset-highlight, inset 0 1px 0 rgba(255,255,255,0.22))"
                             }
                           : undefined
                     }
                     className={`relative h-10 px-2.5 rounded-xl glass-surface border transition-all flex items-center justify-between gap-2 min-w-0 cursor-pointer ${
                        isActive
                           ? 'sa-glass-pill-active !opacity-100 !border-[color-mix(in_srgb,var(--text)_42%,transparent)] text-[var(--text)] z-10'
                           : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-65 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                     }`}
                  >
                     <div className="flex items-center gap-2 min-w-0">
                        <span
                           className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                              isActive
                                 ? 'bg-[color-mix(in_srgb,var(--accent)_20%,rgba(255,255,255,0.1))] border-[color-mix(in_srgb,var(--accent)_55%,rgba(255,255,255,0.4))] text-[var(--accent)]'
                                 : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)]'
                           }`}
                        >
                           <span className="material-symbols-outlined !text-[14px]">
                              {item.icon}
                           </span>
                        </span>
                        <span className={`text-[11px] truncate ${isActive ? 'font-black text-[var(--text)]' : 'font-semibold'}`}>
                           {item.label}
                        </span>
                     </div>
                     <span
                        className={`shrink-0 tabular-nums ${
                           isActive
                              ? 'px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text)_14%,transparent)] border border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-[10px] font-black text-[var(--text)]'
                              : 'text-[10px] font-bold text-[var(--subtext)] opacity-75 px-1'
                        }`}
                     >
                        {item.count}
                     </span>
                     <HoverTooltip
                        onlyWhenTruncated={true}
                        title={`${item.label} (${item.count})`}
                     />
                  </button>
               );
            })}
         </div>
      </div>
   );
};

export function WorkbenchSidePanel({
   fileState,
   editorState,
   layoutState,
   activeTemplate,
   customAppliedTemplate,
   selectedTemplatePath,
   availableTemplates,
   selectedCategory,
   setSelectedTemplatePath,
   setActiveTemplate,
   setCustomAppliedTemplate,
   setSelectedCategory,
   searchQuery,
   setSearchQuery,
   files,
   setShowTimeline,
   setTimelineInitialSelection,
   setIsPushModalOpen
}: any) {
   const { t } = useLexicon();
   const { currentTheme } = useTheme();
   useSanctuaryMonacoTheme(currentTheme, layoutState.isLight);

   const previewEditorOptions = React.useMemo(() => ({
      automaticLayout: true,
      readOnly: false,
      minimap: { enabled: false },
      fontSize: 12,
      wordWrap: "on" as const,
      renderLineHighlight: "none" as const,
      selectionHighlight: false,
      occurrencesHighlight: "off" as const,
      matchBrackets: "never" as const,
      hover: { enabled: "on" as const, above: false },
      contextmenu: false
   }), []);

   const selectedFile = useStore(state => state.cwSelectedFile);
   const setSelectedFile = useStore(state => state.setCwSelectedFile);
   const activeTab = useStore(state => state.cwActiveTab);
   const setActiveTab = useStore(state => state.setCwActiveTab);
   const session = useStore(state => state.session);
   const canPublishNexusAssets = useVerifiedMasonOrStaff();
   const hasUnsavedChanges = selectedFile && useStore(state => state.cwUnsavedEdits)[selectedFile.path] !== undefined;

   const [onlyModified, setOnlyModified] = useState(false);
   const [onlyUnsaved, setOnlyUnsaved] = useState(false);
   const [authorTab, setAuthorTab] = useState<'builder' | 'raw'>('builder');
   const [previewMode, setPreviewMode] = useState<'preview' | 'file' | 'off'>('preview');
   const [previewCategory, setPreviewCategory] = useState<string>("ALL");
   const [previewSearchQuery, setPreviewSearchQuery] = useState<string>("");
   const [previewSandboxData, setPreviewSandboxData] = useState<any>({});

   useEffect(() => {
      setOnlyModified(false);
      setOnlyUnsaved(false);
      setPreviewCategory("ALL");
      setPreviewSearchQuery("");
      setPreviewSandboxData({});
   }, [selectedFile?.path]);

   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k, k);
      if (tr === `[${k}]`) return k;
      return tr;
   };

   const isTemplateMode = isSanctuaryTemplateFile(selectedFile, editorState.parsedData);
   const currentVisualTemplate = React.useMemo(() => {
      const candidate = (selectedTemplatePath && selectedTemplatePath !== "built_in" && customAppliedTemplate)
         ? customAppliedTemplate
         : (activeTemplate || customAppliedTemplate || availableTemplates?.find((tItem: any) => tItem.id === selectedTemplatePath)?.data || availableTemplates?.[0]?.data);
      return Array.isArray(candidate) ? candidate[0] : candidate;
   }, [selectedTemplatePath, customAppliedTemplate, activeTemplate, availableTemplates]);

   const modifiedCount = React.useMemo(() => {
      if (isTemplateMode || !currentVisualTemplate?.settings || !editorState.parsedData) return 0;
      return countModifiedSettings(currentVisualTemplate.settings, editorState.parsedData);
   }, [isTemplateMode, currentVisualTemplate, editorState.parsedData]);

   const unsavedEditCount = React.useMemo(() => {
      if (isTemplateMode || !currentVisualTemplate?.settings || !editorState.parsedData || !editorState.savedParsedData) return 0;
      return countEditedFromSavedSettings(currentVisualTemplate.settings, editorState.parsedData, editorState.savedParsedData);
   }, [isTemplateMode, currentVisualTemplate, editorState.parsedData, editorState.savedParsedData]);

   const handleResetAllModified = () => {
      if (!currentVisualTemplate?.settings) return;
      const resetRecursive = (list: any[], parentPath = "", parentIsVirtual = false) => {
         for (const s of list) {
            const dataPath = resolveSettingDataPath(parentPath, s, parentIsVirtual);
            if (!dataPath) continue;
            if (s.type === "group" && Array.isArray(s.settings)) {
               const isVirt = Boolean(s.virtual_group);
               resetRecursive(s.settings, isVirt ? "" : dataPath, isVirt);
            } else if (s.default !== undefined) {
               editorState.handleVisualChange(dataPath, s.default);
            }
         }
      };
      resetRecursive(currentVisualTemplate.settings);
   };

   const handlePreviewVisualChange = (dataPath: string, value: any) => {
      setPreviewSandboxData((prev: any) => {
         const next = JSON.parse(JSON.stringify(prev || {}));
         writeDataPathValue(next, dataPath, value);
         return next;
      });
   };

   const templatePreviewObject = React.useMemo(() => {
      if (!editorState.parsedData) return null;
      return Array.isArray(editorState.parsedData) ? editorState.parsedData[0] : editorState.parsedData;
   }, [editorState.parsedData]);

   return (
      <SidePanel
         isOpen={!!selectedFile}
         onClose={() => setSelectedFile(null)}
         title={selectedFile ? selectedFile.name : (isTemplateMode ? t("author_mode", "Author Mode") : t("editor_mode", "Editor Mode"))}
         subtitle={isTemplateMode ? t("cw_template_builder_subtitle", "Interactive Template Schema Builder") : t("cw_config_editor_subtitle", "Visual & Raw Configuration IDE")}
         icon={isTemplateMode ? t("icon_data_object", "data_object") : t("icon_tune", "tune")}
         iconColorClass="theme-text-accent"
         isResizable={!layoutState.isFullscreen}
         defaultWidth={layoutState.isFullscreen ? window.innerWidth : ((isTemplateMode && previewMode !== 'off') || activeTab === 'dual' ? 1400 : 960)}
         panelClass={layoutState.isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none" : ""}
         headerActions={
            <>
               {/* 1. Primary View Mode Switcher (Visual | Split View | Raw) */}
               {!isTemplateMode ? (
                  <PanelHeaderGroup>
                     <PanelHeaderButton
                        icon={t("icon_tune", "tune")}
                        tooltip={t("tab_visual", "Visual")}
                        isActive={activeTab === 'visual'}
                        onClick={() => setActiveTab('visual')}
                     />
                     <PanelHeaderButton
                        icon={t("icon_vertical_split", "vertical_split")}
                        tooltip={t("tab_dual_vision", "Split View")}
                        isActive={activeTab === 'dual'}
                        className="hidden lg:inline-flex"
                        onClick={() => setActiveTab('dual')}
                     />
                     <PanelHeaderButton
                        icon={t("icon_code", "code")}
                        tooltip={t("tab_raw", "Raw")}
                        isActive={activeTab === 'raw'}
                        onClick={() => setActiveTab('raw')}
                     />
                  </PanelHeaderGroup>
               ) : (
                  <PanelHeaderGroup>
                     <PanelHeaderButton
                        icon={t("icon_tune", "tune")}
                        tooltip={t("workbench_builder_tab", "Visual Builder")}
                        isActive={authorTab === 'builder'}
                        onClick={() => setAuthorTab('builder')}
                     />
                     <PanelHeaderButton
                        icon={t("icon_code", "code")}
                        tooltip={t("workbench_json_tab", "Raw JSON")}
                        isActive={authorTab === 'raw'}
                        onClick={() => setAuthorTab('raw')}
                     />
                  </PanelHeaderGroup>
               )}

               {/* 2. Primary Actions (Timeline | Save | Publish | Overflow Menu) */}
               <PanelHeaderGroup>
                  <PanelHeaderButton
                     icon={t("icon_history", "history")}
                     tooltip={t("btn_timeline", "Version Timeline")}
                     onClick={() => {
                        if (setTimelineInitialSelection) setTimelineInitialSelection('latest');
                        setShowTimeline(true);
                     }}
                  />

                  {editorState.problemsList.length > 0 && hasUnsavedChanges ? (
                     layoutState.confirmSaveWithErrors ? (
                        <>
                           <PanelHeaderButton
                              icon={t("icon_close", "close")}
                              tooltip={t("cancel", "Cancel")}
                              variant="danger"
                              onClick={() => layoutState.setConfirmSaveWithErrors(false)}
                           />
                           <PanelHeaderButton
                              icon={t("icon_check", "check")}
                              tooltip={t("btn_confirm_save_errors", "Confirm Save with Errors")}
                              variant="warning"
                              disabled={fileState.isSaving}
                              onClick={() => {
                                 layoutState.setConfirmSaveWithErrors(false);
                                 fileState.saveConfig(editorState.rawText, (savedRaw: string) => editorState.syncSavedBaseline(savedRaw));
                              }}
                           />
                        </>
                     ) : (
                        <PanelHeaderButton
                           icon={t("icon_warning", "warning")}
                           tooltip={t("save_with_errors_warning", "Save with syntax errors")}
                           variant="warning"
                           disabled={fileState.isSaving}
                           onClick={() => layoutState.setConfirmSaveWithErrors(true)}
                        />
                     )
                  ) : (
                     <PanelHeaderButton
                        icon={fileState.isSaving ? t("icon_hourglass_empty", "hourglass_empty") : t("icon_save", "save")}
                        tooltip={fileState.isSaving ? t("btn_saving", "Saving...") : t("save", "Save")}
                        variant={hasUnsavedChanges ? "success" : "default"}
                        disabled={!hasUnsavedChanges || fileState.isSaving}
                        onClick={() => fileState.saveConfig(editorState.rawText, (savedRaw: string) => editorState.syncSavedBaseline(savedRaw))}
                     />
                  )}

                  {isTemplateMode && (
                     <PanelHeaderButton
                        icon={t("icon_download", "download")}
                        tooltip={t("export", "Export")}
                        onClick={() => {
                           try {
                              const baseName = (selectedFile?.name || "template.sanctuary.template.json").replace(/\.json$/i, "");
                              const fileName = baseName.toLowerCase().endsWith(".sanctuary.template")
                                 ? `${baseName}.json`
                                 : `${baseName}.sanctuary.template.json`;
                              const blob = new Blob([editorState.rawText || "{}"], { type: "application/json;charset=utf-8" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = fileName;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                           } catch {}
                        }}
                     />
                  )}

                  {isTemplateMode && canPublishNexusAssets && (
                     <PanelHeaderButton
                        icon={t("icon_cloud_upload", "cloud_upload")}
                        tooltip={
                           (!session || localStorage.getItem("sanctuary_blacklisted") === "true")
                              ? (localStorage.getItem("sanctuary_blacklisted") === "true"
                                 ? t("alert_comm_banned", "Community access restricted")
                                 : t("alert_guest_mode", "Sign in required"))
                              : (editorState.problemsList.length > 0
                                 ? t("err_publish_blocks", "Fix syntax errors before publishing")
                                 : t("btn_publish", "Publish"))
                        }
                        variant="accent"
                        disabled={editorState.problemsList.length > 0 || !session || localStorage.getItem("sanctuary_blacklisted") === "true"}
                        onClick={() => setIsPushModalOpen(true)}
                     />
                  )}

                  <PanelHeaderGroup overflow>
                     <PanelHeaderButton
                        icon={t("icon_undo", "undo")}
                        tooltip={t("workbench_undo_all_unsaved", "Revert Edits")}
                        variant={hasUnsavedChanges ? "warning" : "default"}
                        disabled={!hasUnsavedChanges}
                        onClick={() => editorState.handleUndoAllUnsaved()}
                     />
                     {!isTemplateMode && (
                        <PanelHeaderButton
                           icon={t("icon_restart_alt", "restart_alt")}
                           tooltip={t("workbench_reset_all_modified", "Reset Modified")}
                           disabled={modifiedCount === 0}
                           onClick={handleResetAllModified}
                        />
                     )}
                     {isTemplateMode && (
                        <>
                           <PanelHeaderButton
                              icon={t("icon_visibility", "visibility")}
                              tooltip={t("preview", "Preview")}
                              isActive={previewMode === 'preview'}
                              onClick={() => setPreviewMode('preview')}
                           />
                           <PanelHeaderButton
                              icon={t("icon_description", "description")}
                              tooltip={t("tab_file", "Target File")}
                              isActive={previewMode === 'file'}
                              onClick={() => setPreviewMode('file')}
                           />
                           <PanelHeaderButton
                              icon={t("icon_visibility_off", "visibility_off")}
                              tooltip={t("tab_off", "Hide Preview")}
                              isActive={previewMode === 'off'}
                              onClick={() => setPreviewMode('off')}
                           />
                           <PanelHeaderButton
                              icon={t("icon_help", "help")}
                              tooltip={t("btn_info", "Template Guide")}
                              onClick={() => layoutState.setIsTemplateGuideOpen(true)}
                           />
                        </>
                     )}
                     {((!isTemplateMode && activeTab === 'dual') || (isTemplateMode && authorTab === 'raw' && (previewMode === 'preview' || previewMode === 'file'))) && (
                        <PanelHeaderButton
                           icon={layoutState.isScrollLocked ? t("icon_lock", "lock") : t("icon_lock_open", "lock_open")}
                           tooltip={t("sync_scroll", "Sync Scroll")}
                           isActive={layoutState.isScrollLocked}
                           onClick={() => layoutState.setIsScrollLocked(!layoutState.isScrollLocked)}
                        />
                     )}
                     <PanelHeaderButton
                        icon={layoutState.isFullscreen ? t("icon_fullscreen_exit", "fullscreen_exit") : t("icon_fullscreen", "fullscreen")}
                        tooltip={layoutState.isFullscreen ? t("btn_exit_fullscreen", "Exit Fullscreen") : t("btn_fullscreen", "Fullscreen")}
                        isActive={layoutState.isFullscreen}
                        onClick={() => layoutState.setIsFullscreen(!layoutState.isFullscreen)}
                     />
                  </PanelHeaderGroup>
               </PanelHeaderGroup>
            </>
         }
      >
         <div className="flex-1 min-h-0 flex flex-col h-full w-full relative">
            {editorState.problemsList.length > 0 && (
               <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2.5 w-max max-w-[calc(100%-2.5rem)] pointer-events-none">
                  <div
                     className="pointer-events-auto w-fit max-w-full flex items-center justify-between gap-3.5 glass-panel portal-glass-fix sa-dropdown-popover !rounded-2xl px-4 py-3 cursor-pointer transition-all group/problem"
                     onClick={() => {
                        if (isTemplateMode && authorTab !== 'raw') setAuthorTab('raw');
                        if (editorState.editorRef && editorState.problemsList[0]) {
                           editorState.editorRef.revealLineInCenter(editorState.problemsList[0].line);
                           editorState.editorRef.setPosition({ lineNumber: editorState.problemsList[0].line, column: editorState.problemsList[0].column });
                           editorState.editorRef.focus();
                        }
                     }}
                  >
                     <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--danger)] group-hover/problem:animate-pulse shrink-0">
                           <span className="material-symbols-outlined !text-[20px]">{t("icon_error", "error")}</span>
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
                                    <strong>{editorState.problemsList.length}</strong>{" "}
                                    {editorState.problemsList.length === 1
                                       ? t("syntax_error", "Syntax Error")
                                       : t("syntax_errors", "Syntax Errors")}
                                 </span>
                              </div>

                              <div className={`${VAULT_CHIP_CLASS} tabular-nums`}>
                                 <span className="material-symbols-rounded !text-[12px] text-[var(--danger)] shrink-0">
                                    {t("icon_code", "code")}
                                 </span>
                                 <span>
                                    {t("line_label", "Line")} {editorState.problemsList[0]?.line}
                                 </span>
                              </div>
                           </div>

                           <p className="text-[11px] text-[var(--subtext)] font-mono truncate max-w-[460px]">
                              {editorState.problemsList[0]?.message}
                           </p>
                        </div>
                     </div>

                     <div className="pl-3 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                        <button
                           onClick={(e) => { e.stopPropagation(); editorState.setProblemsList([]); }}
                           className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center text-[var(--danger)] opacity-80 hover:opacity-100 transition-all shrink-0 cursor-pointer"
                        >
                           <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
                           <HoverTooltip title={t("close", "Close")} />
                        </button>
                     </div>
                  </div>
               </div>
            )}

            <div
               className="flex-1 relative min-h-0 mx-2 mt-2 mb-2 flex flex-col gap-4"
               style={{
                  "--glass-outer-shadow": "0 0 #0000",
                  "--glass-nested-shadow": "0 0 #0000",
                  "--glass-surface-outer-shadow": "0 0 #0000",
               } as React.CSSProperties}
            >
               {/* CONFIG EDITOR MODE */}
               {!isTemplateMode && (
                  <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${activeTab === 'dual' ? 'flex-row' : 'flex-col'}`}>
                     <div className={`flex flex-col gap-4 flex-1 relative min-w-0 min-h-0 ${activeTab !== 'visual' && activeTab !== 'dual' ? 'hidden' : ''}`}>
                        <div className="flex-1 relative min-h-0 min-w-0">
                           {editorState.problemsList.length > 0 ? (
                              <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                 <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">{t("icon_warning", "warning")}</span>
                                 <h3 className="text-sm font-black text-[var(--text)] tracking-widest capitalize">{t("syntax_error_title", "Syntax Error")}</h3>
                                 <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("syntax_error_desc", "Resolve syntax errors in Raw mode to use the Visual Editor.")}</p>
                              </div>
                           ) : (
                              <div ref={layoutState.visualScrollRef} className="absolute inset-0 rounded-[inherit] overflow-y-scroll overflow-x-hidden custom-scrollbar pr-2 z-10 pb-20">
                                 <div className="flex flex-col gap-3 min-h-[300px] px-1 pt-1">
                                    <div className="flex flex-col gap-3">
                                       {!isTemplateMode && availableTemplates.length > 0 && (
                                          <div className="glass-panel rounded-2xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-wrap items-center justify-between gap-3">
                                             <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                   <span className="material-symbols-outlined !text-[18px]">
                                                      {t("icon_data_object", "data_object")}
                                                   </span>
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                   <span className="text-xs font-black text-[var(--text)] leading-tight truncate">
                                                      {t("workbench_visual_schema", "Visual Schema")}
                                                   </span>
                                                   <span className="text-[10.5px] font-medium text-[var(--subtext)] truncate">
                                                      {`${countSettingsByCategory(currentVisualTemplate?.settings || []).ALL || 0} ${t("workbench_settings_count", "Settings")} • ${(currentVisualTemplate?.categories || []).length} ${t("categories", "Categories")}`}
                                                   </span>
                                                </div>
                                             </div>
                                             <div className="w-full sm:w-[280px] shrink-0">
                                                <CustomDropdown
                                                   disableTint={true}
                                                   menuMinWidth={260}
                                                   className="h-10"
                                                   buttonClassName="!h-10 !px-3.5 !rounded-xl glass-surface !border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] !text-xs font-bold"
                                                   value={selectedTemplatePath}
                                                   options={availableTemplates.map((tmpl: any) => ({
                                                      ...tmpl,
                                                      icon: tmpl.icon || t("icon_data_object", "data_object")
                                                   }))}
                                                   onChange={(val: string[]) => {
                                                      const newPath = val[0];
                                                      setSelectedTemplatePath(newPath);
                                                      const tmpl = availableTemplates.find((tItem: any) => tItem.id === newPath);
                                                      if (tmpl && (tmpl.id === "built_in" || tmpl.isCommunity)) {
                                                         setActiveTemplate(tmpl.data);
                                                         setCustomAppliedTemplate(null);
                                                      } else if (tmpl) {
                                                         setCustomAppliedTemplate(tmpl.data);
                                                         setActiveTemplate(null);
                                                      }
                                                   }}
                                                />
                                             </div>
                                          </div>
                                       )}

                                       <ActionPill
                                          className="!max-w-none w-full"
                                          searchQuery={searchQuery}
                                          setSearchQuery={setSearchQuery}
                                          searchPlaceholder={t("diff_search_settings", "Search settings...")}
                                          primaryPopover={{
                                             icon: t("icon_tune", "tune"),
                                             label: t("filters", "Filters"),
                                             isActive: Boolean(selectedCategory !== "ALL" || onlyModified || onlyUnsaved),
                                             content: (
                                                <div className="flex flex-col w-[320px] p-4 max-w-[calc(100vw-40px)] gap-4">
                                                   <div className="flex items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                                                         {t("filters", "Filters")}
                                                      </span>
                                                      {(selectedCategory !== "ALL" || onlyModified || onlyUnsaved) && (
                                                         <button
                                                            type="button"
                                                            onClick={() => {
                                                               setSelectedCategory("ALL");
                                                               setOnlyModified(false);
                                                               setOnlyUnsaved(false);
                                                            }}
                                                            className="sa-dropdown-action-chip px-2.5 h-6 text-[9px] font-bold uppercase tracking-wider cursor-pointer shrink-0"
                                                         >
                                                            {t("reset", "Reset")}
                                                         </button>
                                                      )}
                                                   </div>

                                                   <div className="flex flex-col gap-2">
                                                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                                         {t("status", "Status")}
                                                      </span>
                                                      <div className="grid grid-cols-3 gap-1.5">
                                                         <button
                                                            type="button"
                                                            onClick={() => {
                                                               setOnlyModified(false);
                                                               setOnlyUnsaved(false);
                                                            }}
                                                            className={`sa-dropdown-filter-tab px-2 h-8 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer truncate ${
                                                               !onlyModified && !onlyUnsaved ? "is-active" : ""
                                                            }`}
                                                         >
                                                            {t("all", "All")}
                                                         </button>
                                                         <button
                                                            type="button"
                                                            onClick={() => {
                                                               setOnlyModified(true);
                                                               setOnlyUnsaved(false);
                                                            }}
                                                            className={`sa-dropdown-filter-tab px-2 h-8 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer truncate ${
                                                               onlyModified ? "is-active" : ""
                                                            }`}
                                                         >
                                                            {t("badge_modified", "Modified")} ({modifiedCount})
                                                         </button>
                                                         <button
                                                            type="button"
                                                            onClick={() => {
                                                               setOnlyUnsaved(true);
                                                               setOnlyModified(false);
                                                            }}
                                                            className={`sa-dropdown-filter-tab px-2 h-8 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer truncate ${
                                                               onlyUnsaved ? "is-active" : ""
                                                            }`}
                                                         >
                                                            {t("unsaved", "Unsaved")} ({unsavedEditCount})
                                                         </button>
                                                      </div>
                                                   </div>

                                                   {currentVisualTemplate?.categories && currentVisualTemplate.categories.length > 0 && (() => {
                                                      const counts = countSettingsByCategory(currentVisualTemplate.settings || []);
                                                      return (
                                                         <>
                                                            <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                                                            <div className="flex flex-col gap-2">
                                                               <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                                                  {t("category", "Category")}
                                                               </span>
                                                               <CustomDropdown
                                                                  disableTint={true}
                                                                  searchable={true}
                                                                  searchPlaceholder={t("btn_search", "Search...")}
                                                                  value={selectedCategory}
                                                                  onChange={(val: string[]) => setSelectedCategory(val[0] || "ALL")}
                                                                  options={[
                                                                     {
                                                                        id: "ALL",
                                                                        label: `${t("cat_all", "All Settings")} (${counts.ALL || 0})`,
                                                                        icon: t("icon_grid_view", "grid_view")
                                                                     },
                                                                     ...currentVisualTemplate.categories.map((cat: any) => {
                                                                        const label = resolveText(cat.name_key, cat.name || cat.id);
                                                                        return {
                                                                           id: cat.id,
                                                                           label: `${label} (${counts[cat.id] || 0})`,
                                                                           searchText: label,
                                                                           icon: resolveCategoryIcon(cat, resolveText, t)
                                                                        };
                                                                     })
                                                                  ]}
                                                               />
                                                            </div>
                                                         </>
                                                      );
                                                   })()}
                                                </div>
                                             )
                                          }}
                                          actions={[
                                             ...((unsavedEditCount > 0 || hasUnsavedChanges) ? [{
                                                id: "undo_unsaved",
                                                icon: t("icon_undo", "undo"),
                                                label: t("workbench_undo_all_unsaved", "Revert Edits"),
                                                onClick: () => editorState.handleUndoAllUnsaved()
                                             }] : []),
                                             ...(modifiedCount > 0 ? [{
                                                id: "reset_modified",
                                                icon: t("icon_restart_alt", "restart_alt"),
                                                label: t("workbench_reset_all_modified", "Reset Modified"),
                                                onClick: handleResetAllModified
                                             }] : [])
                                          ]}
                                       />

                                       {currentVisualTemplate?.categories && currentVisualTemplate.categories.length > 0 && (
                                          <WorkbenchCategoryBar
                                             categories={currentVisualTemplate.categories}
                                             settings={currentVisualTemplate.settings || []}
                                             selectedCategory={selectedCategory}
                                             onSelectCategory={(catId) => setSelectedCategory(catId)}
                                             resolveText={resolveText}
                                             t={t}
                                             compact={activeTab === 'dual'}
                                          />
                                       )}
                                    </div>

                                    {currentVisualTemplate?.settings ? (
                                       <WorkbenchVisualEditor
                                          settings={currentVisualTemplate.settings}
                                          categories={currentVisualTemplate.categories || []}
                                          dataSource={editorState.parsedData}
                                          savedDataSource={editorState.savedParsedData}
                                          isPreview={false}
                                          selectedCategory={selectedCategory}
                                          searchQuery={searchQuery}
                                          onlyModified={onlyModified}
                                          onlyUnsaved={onlyUnsaved}
                                          onVisualChange={editorState.handleVisualChange}
                                          onUndoToSaved={editorState.handleUndoSettingToSaved}
                                          highlightedKey={editorState.highlightedKey}
                                       />
                                    ) : (
                                       <WorkbenchEmptyVisualState
                                          t={t}
                                          selectedFile={selectedFile}
                                          onCreateTemplate={() => fileState.handleNewTemplate(true, selectedFile?.name)}
                                       />
                                    )}
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>

                     {activeTab === 'dual' && (
                        <>
                           {layoutState.isResizingPreview && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
                           <div
                              className="w-2 rounded-full cursor-col-resize hover:bg-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-colors flex items-center justify-center shrink-0 z-10"
                              onMouseDown={(e) => { e.preventDefault(); layoutState.setIsResizingPreview(true); }}
                           >
                              <div className="h-12 w-1 rounded-full bg-[color-mix(in_srgb,var(--text)_15%,transparent)]" />
                           </div>
                        </>
                     )}

                     <div
                        ref={layoutState.rawContainerRef}
                        className={`monaco-wrapper relative flex flex-col glass-panel rounded-2xl shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${activeTab === 'dual' ? 'shrink-0' : 'flex-1 min-w-0 min-h-0'} ${activeTab !== 'raw' && activeTab !== 'dual' ? 'hidden' : ''}`}
                        style={activeTab === 'dual' ? { width: layoutState.isResizingPreview ? layoutState.dragPreviewWidthRef.current : layoutState.previewWidth } : {}}
                     >
                        <WorkbenchRawEditor
                           value={editorState.rawText}
                           onChange={editorState.handleRawChange}
                           language={detectMonacoLanguage(selectedFile?.name, editorState.rawText)}
                           isLight={layoutState.isLight}
                           problemsList={editorState.problemsList}
                           setProblemsList={editorState.setProblemsList}
                           isResizingPreview={layoutState.isResizingPreview}
                           fileName={selectedFile?.name}
                           showSyncScroll={activeTab === 'dual'}
                           isScrollLocked={layoutState.isScrollLocked}
                           onToggleScrollLock={() => layoutState.setIsScrollLocked(!layoutState.isScrollLocked)}
                           onEditorMount={(editor) => {
                              editorState.setEditorRef(editor);

                              editor.onDidChangeModelContent((e: any) => {
                                 if (layoutState.isJumping.current > Date.now()) return;
                                 if (e.changes && e.changes.length > 0) {
                                    const change = e.changes[0];
                                    const lineNum = change.range.startLineNumber;
                                    const model = editor.getModel();
                                    if (model) {
                                       const lineContent = model.getLineContent(lineNum);
                                       let keyMatch = lineContent.match(/"([^"]+)"\s*:/);
                                       if (!keyMatch) {
                                          keyMatch = lineContent.match(/([a-zA-Z0-9_]+)\s*=/);
                                       }
                                       if (keyMatch && keyMatch[1]) {
                                          let key = keyMatch[1];
                                          let currentLine = lineNum - 1;
                                          const indentMatch = lineContent.match(/^\s*/);
                                          let indent = indentMatch ? indentMatch[0].length : 0;

                                          while (currentLine > 0 && indent > 0) {
                                             const prevLine = model.getLineContent(currentLine);
                                             const prevIndentMatch = prevLine.match(/^\s*/);
                                             const prevIndent = prevIndentMatch ? prevIndentMatch[0].length : 0;

                                             if (prevLine.trim() !== '' && prevIndent < indent) {
                                                const parentMatch = prevLine.match(/"([^"]+)"\s*:/) || prevLine.match(/([a-zA-Z0-9_]+)\s*[:=]/);
                                                if (parentMatch && parentMatch[1]) {
                                                   key = parentMatch[1] + "." + key;
                                                }
                                                indent = prevIndent;
                                             }
                                             currentLine--;
                                          }

                                          layoutState.isJumping.current = Date.now() + 1000;
                                          editorState.triggerHighlight(key);

                                          if (layoutState.visualScrollRef.current) {
                                             const visual = layoutState.visualScrollRef.current;
                                             const element = visual.querySelector(`[data-setting-key="${key.split('.').pop()}"]`);
                                             if (element) {
                                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                             }
                                          }
                                       }
                                    }
                                 }
                              });
                           }}
                        />
                     </div>
                  </div>
               )}

               {/* TEMPLATE AUTHOR MODE */}
               {isTemplateMode && (
                  <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${previewMode === 'off' ? 'flex-col' : 'flex-row'}`}>
                     {/* Left Column: Visual Template Builder or Raw JSON Editor */}
                     <div className="flex-1 relative flex flex-col min-h-0 min-w-0 z-[110]">
                        {authorTab === 'builder' ? (
                           <div className="flex-1 overflow-y-auto custom-scrollbar px-1 pt-0.5 pr-2">
                              <WorkbenchTemplateBuilder
                                 parsedData={editorState.parsedData}
                                 rawText={editorState.rawText}
                                 onUpdateTemplate={(newJson, preParsed) => editorState.handleRawChange(newJson, true, preParsed)}
                                 files={files}
                                 handleAutoMap={editorState.handleAutoMap}
                              />
                           </div>
                        ) : (
                           <>
                              <div className="shrink-0 flex items-center justify-center z-10 w-full overflow-visible flex-wrap pb-3 pt-1">
                                 <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full px-4 py-1.5 shadow-lg flex items-center gap-2">
                                    <WorkbenchTemplateTools
                                       parsedData={editorState.parsedData}
                                       rawText={editorState.rawText}
                                       setRawText={(val) => editorState.handleRawChange(val, true)}
                                       files={files}
                                       t={t}
                                       handleInsertSnippet={editorState.handleInsertSnippet}
                                       handleAutoMap={editorState.handleAutoMap}
                                    />
                                 </div>
                              </div>

                              <div className="monaco-wrapper flex-1 relative w-full min-w-0 min-h-0 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                 <WorkbenchRawEditor
                                    value={editorState.rawText}
                                    onChange={editorState.handleRawChange}
                                    language="json"
                                    isLight={layoutState.isLight}
                                    problemsList={editorState.problemsList}
                                    setProblemsList={editorState.setProblemsList}
                                    isResizingPreview={layoutState.isResizingPreview}
                                    fileName={selectedFile?.name}
                                    showSyncScroll={previewMode === 'preview' || previewMode === 'file'}
                                    isScrollLocked={layoutState.isScrollLocked}
                                    onToggleScrollLock={() => layoutState.setIsScrollLocked(!layoutState.isScrollLocked)}
                                    onEditorMount={(editor, monaco) => {
                                       editorState.setEditorRef(editor);
                                       (window as any).monaco = monaco;

                                       editor.onContextMenu((e: any) => {
                                          if (e.event) {
                                             if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                                             window.dispatchEvent(new CustomEvent('sanctuary-monaco-contextmenu', {
                                                detail: {
                                                   x: e.event.posx,
                                                   y: e.event.posy,
                                                   target: e.target?.element || document.body
                                                }
                                             }));
                                          }
                                       });
                                    }}
                                 />
                              </div>
                           </>
                        )}
                     </div>

                     {/* Right Column: Live Interactive Visual Preview or Target File */}
                     {previewMode !== 'off' && (
                        <>
                           {layoutState.isResizingPreview && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
                           <div
                              className="w-2 rounded-full cursor-col-resize hover:bg-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-colors flex items-center justify-center shrink-0 z-10"
                              onMouseDown={(e) => { e.preventDefault(); layoutState.setIsResizingPreview(true); }}
                           >
                              <div className="h-12 w-1 rounded-full bg-[color-mix(in_srgb,var(--text)_15%,transparent)]" />
                           </div>
                           <div
                              className={`shrink-0 flex flex-col relative border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] pl-3 min-h-0 ${layoutState.isResizingPreview ? 'pointer-events-none select-none' : ''}`}
                              style={{ width: layoutState.previewWidth }}
                           >
                              {previewMode !== 'preview' && (
                                 <div className="pb-3 shrink-0 w-full flex flex-col gap-2">
                                    <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-2 flex items-center gap-2.5 w-fit">
                                       <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                          <span className="material-symbols-outlined !text-[18px]">
                                             {t("icon_description", "description")}
                                          </span>
                                       </div>
                                       <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] pr-2">
                                          {templatePreviewObject?.target_file || t("tab_file", "Target File")}
                                       </span>
                                    </div>
                                 </div>
                              )}

                              <div ref={layoutState.visualScrollRef} className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                                 {previewMode === 'preview' ? (
                                    editorState.problemsList.length > 0 ? (
                                       <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                          <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">{t("icon_visibility_off", "visibility_off")}</span>
                                          <h3 className="text-sm font-black text-[var(--text)] tracking-widest capitalize">{t("preview_unavailable", "Preview Unavailable")}</h3>
                                          <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("preview_resolve", "Resolve JSON syntax errors to restore the live preview.")}</p>
                                       </div>
                                    ) : (
                                       <div className="flex flex-col gap-3 px-1 pt-0.5 pb-10">
                                          <div className="flex flex-col gap-2.5">
                                             <ActionPill
                                                className="w-full"
                                                searchQuery={previewSearchQuery}
                                                setSearchQuery={setPreviewSearchQuery}
                                                searchPlaceholder={t("diff_search_settings", "Search settings...")}
                                             />
                                             {templatePreviewObject?.categories && templatePreviewObject.categories.length > 0 && (
                                                <WorkbenchCategoryBar
                                                   categories={templatePreviewObject.categories}
                                                   settings={templatePreviewObject.settings || []}
                                                   selectedCategory={previewCategory}
                                                   onSelectCategory={(catId) => setPreviewCategory(catId)}
                                                   resolveText={resolveText}
                                                   t={t}
                                                   compact={true}
                                                />
                                             )}
                                          </div>
                                          <WorkbenchVisualEditor
                                             settings={templatePreviewObject?.settings || []}
                                             categories={templatePreviewObject?.categories || []}
                                             dataSource={previewSandboxData}
                                             isPreview={false}
                                             selectedCategory={previewCategory}
                                             searchQuery={previewSearchQuery}
                                             onVisualChange={handlePreviewVisualChange}
                                          />
                                       </div>
                                    )
                                 ) : (
                                    <div className="monaco-wrapper h-full w-full glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                       <Editor
                                          height="100%"
                                          language={detectMonacoLanguage(templatePreviewObject?.target_file, editorState.targetFileContent)}
                                          theme={layoutState.isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                                          beforeMount={(monaco) => defineSanctuaryMonacoThemes(monaco, currentTheme)}
                                          value={editorState.targetFileContent}
                                          onChange={(val) => editorState.setTargetFileContent(val || '')}
                                          onMount={(editor, monaco) => {
                                             layoutState.rightEditorRef.current = editor;
                                             (window as any).monaco = monaco;
                                             defineSanctuaryMonacoThemes(monaco, currentTheme);
                                             editor.onContextMenu((e: any) => {
                                                if (e.event) {
                                                   if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                                                   window.dispatchEvent(new CustomEvent('sanctuary-monaco-contextmenu', {
                                                      detail: {
                                                         x: e.event.posx,
                                                         y: e.event.posy,
                                                         target: e.target?.element || document.body
                                                      }
                                                   }));
                                                }
                                             });
                                          }}
                                          options={previewEditorOptions}
                                       />
                                    </div>
                                 )}
                              </div>
                           </div>
                        </>
                     )}
                  </div>
               )}
            </div>
         </div>
      </SidePanel>
   );
}

