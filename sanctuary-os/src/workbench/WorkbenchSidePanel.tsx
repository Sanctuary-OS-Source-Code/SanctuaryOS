import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { SidePanel, CustomDropdown, ActionPill, PanelHeaderGroup, PanelHeaderButton, HoverTooltip, VAULT_CHIP_CLASS } from '../shared';
import { WorkbenchRawEditor } from './WorkbenchRawEditor';
import { WorkbenchVisualEditor, countModifiedSettings, countEditedFromSavedSettings, countSettingsByCategory } from './WorkbenchVisualEditor';
import { WorkbenchEmptyVisualState } from './WorkbenchEmptyVisualState';
import { WorkbenchTemplateTools } from './WorkbenchTemplateTools';
import { WorkbenchTemplateBuilder } from './WorkbenchTemplateBuilder';
import { useTheme } from '../ThemeContext';
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from '../utils/monacoTheme';

const resolveCategoryIcon = (
   cat: any,
   resolveText: (k?: string, fallback?: string) => string,
   t: (k: string, fallback: string) => string
): string => {
   const rawIcon = resolveText(cat?.icon_key, cat?.icon || "");
   if (rawIcon && rawIcon !== "tag" && rawIcon !== "folder" && rawIcon !== "#") {
      return rawIcon;
   }
   const key = `${cat?.id || ""} ${cat?.name || ""}`.toLowerCase();
   if (key.includes("general") || key.includes("core") || key.includes("main")) return t("icon_tune", "tune");
   if (key.includes("appear") || key.includes("cas") || key.includes("body") || key.includes("face")) return t("icon_face", "face");
   if (key.includes("autosave") || key.includes("save") || key.includes("backup")) return t("icon_save", "save");
   if (key.includes("bb") || key.includes("build") || key.includes("buy") || key.includes("lot")) return t("icon_home_work", "home_work");
   if (key.includes("bill") || key.includes("money") || key.includes("finance") || key.includes("pay")) return t("icon_receipt_long", "receipt_long");
   if (key.includes("career") || key.includes("work") || key.includes("job") || key.includes("school")) return t("icon_work", "work");
   if (key.includes("clean")) return t("icon_cleaning_services", "cleaning_services");
   if (key.includes("club") || key.includes("group") || key.includes("social")) return t("icon_groups", "groups");
   if (key.includes("dress") || key.includes("outfit") || key.includes("cloth")) return t("icon_checkroom", "checkroom");
   if (key.includes("marri") || key.includes("romance") || key.includes("love")) return t("icon_favorite", "favorite");
   if (key.includes("occult") || key.includes("magic") || key.includes("alien") || key.includes("vampire")) return t("icon_auto_fix_high", "auto_fix_high");
   if (key.includes("populat") || key.includes("world") || key.includes("neighborhood")) return t("icon_public", "public");
   if (key.includes("pregnan") || key.includes("baby") || key.includes("child") || key.includes("offspring")) return t("icon_child_care", "child_care");
   if (key.includes("relation") || key.includes("friend")) return t("icon_handshake", "handshake");
   if (key.includes("notif") || key.includes("show") || key.includes("alert") || key.includes("ui")) return t("icon_notifications", "notifications");
   if (key.includes("tuner") || key.includes("autonom") || key.includes("interac")) return t("icon_build", "build");
   if (key.includes("woohoo") || key.includes("intima")) return t("icon_volunteer_activism", "volunteer_activism");
   return t("icon_category", "category");
};

const WorkbenchCategoryBar = ({
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

   if (!Array.isArray(categories) || categories.length === 0) return null;

   const pillItems = [
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

   const COLLAPSED_LIMIT = compact ? 5 : 7;
   const canCollapse = pillItems.length > (compact ? 6 : 8);
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

   const hiddenCount = Math.max(0, pillItems.length - visibleItems.length);

   return (
      <div className={`grid gap-2 w-full ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
         {visibleItems.map((item) => {
            const isActive = selectedCategory === item.id;
            return (
               <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectCategory(item.id)}
                  className={`h-9 px-3 rounded-xl text-[11px] font-bold tracking-wide transition-all flex items-center justify-between gap-2 min-w-0 cursor-pointer border ${
                     isActive
                        ? 'sa-glass-pill-active text-[var(--text)]'
                        : 'glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'
                  }`}
               >
                  <div className="flex items-center gap-2 min-w-0">
                     <span
                        className={`material-symbols-outlined !text-[15px] shrink-0 ${
                           isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-75'
                        }`}
                     >
                        {item.icon}
                     </span>
                     <span className="truncate">{item.label}</span>
                  </div>
                  <span
                     className={`text-[10px] font-extrabold tabular-nums shrink-0 ${
                        isActive
                           ? 'text-[var(--accent)]'
                           : 'text-[var(--subtext)] opacity-55'
                     }`}
                  >
                     {item.count}
                  </span>
               </button>
            );
         })}

         {canCollapse && (
            <button
               type="button"
               onClick={() => setIsExpanded(!isExpanded)}
               className="h-9 px-3 rounded-xl text-[11px] font-bold tracking-wide transition-all flex items-center justify-between gap-2 min-w-0 cursor-pointer glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
            >
               <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                     {isExpanded
                        ? t("icon_unfold_less", "unfold_less")
                        : t("icon_unfold_more", "unfold_more")}
                  </span>
                  <span className="truncate">
                     {isExpanded
                        ? t("workbench_categories_compact", "Compact Row")
                        : t("workbench_categories_show_all", "Show All Categories")}
                  </span>
               </div>
               {!isExpanded && hiddenCount > 0 && (
                  <span className="text-[10px] font-extrabold tabular-nums text-[var(--accent)] shrink-0">
                     +{hiddenCount}
                  </span>
               )}
            </button>
         )}
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

   const isTemplateMode = selectedFile?.name.toLowerCase().endsWith('.json');
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
      const resetRecursive = (list: any[], parentPath = "") => {
         for (const s of list) {
            const localPath = s?.path || s?.key;
            if (!localPath) continue;
            const dataPath = parentPath && !localPath.startsWith(parentPath + ".") ? `${parentPath}.${localPath}` : localPath;
            if (s.type === "group" && Array.isArray(s.settings)) {
               resetRecursive(s.settings, dataPath);
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
         const parts = dataPath.split('.');
         let curr = next;
         for (let i = 0; i < parts.length - 1; i++) {
            if (!curr[parts[i]]) curr[parts[i]] = {};
            curr = curr[parts[i]];
         }
         curr[parts[parts.length - 1]] = value;
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
                                    <div className="flex flex-col gap-2.5">
                                       <div className="flex flex-row items-center gap-2 w-full">
                                          <ActionPill
                                             className="w-full"
                                             searchQuery={searchQuery}
                                             setSearchQuery={setSearchQuery}
                                             searchPlaceholder={t("diff_search_settings", "Search settings...")}
                                             rightContent={
                                                <div className="flex items-center gap-1.5 px-2.5 h-full py-1.5">
                                                   {(unsavedEditCount > 0 || onlyUnsaved || hasUnsavedChanges) && (
                                                      <>
                                                         <div className="relative flex">
                                                            <button
                                                               type="button"
                                                               onClick={() => setOnlyUnsaved(!onlyUnsaved)}
                                                               className={`h-9 px-3 rounded-xl text-[11px] font-bold tracking-wide glass-surface border transition-all flex items-center gap-1.5 cursor-pointer ${
                                                                  onlyUnsaved
                                                                     ? 'sa-glass-pill-active text-[var(--text)]'
                                                                     : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                                                               }`}
                                                            >
                                                               <span className="material-symbols-outlined !text-[15px] text-[var(--warning)]">{t("icon_edit_note", "edit_note")}</span>
                                                               <span className="hidden sm:inline">{t("unsaved", "Unsaved")}</span>
                                                               <span className="text-[10px] font-extrabold tabular-nums text-[var(--warning)]">{unsavedEditCount}</span>
                                                            </button>
                                                            <HoverTooltip title={t("workbench_filter_unsaved_only", "Unsaved Edits Only")} />
                                                         </div>
                                                         <div className="relative flex">
                                                            <button
                                                               type="button"
                                                               onClick={() => editorState.handleUndoAllUnsaved()}
                                                               className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--warning)] flex items-center justify-center transition-all cursor-pointer"
                                                            >
                                                               <span className="material-symbols-outlined !text-[16px] text-[var(--warning)]">{t("icon_undo", "undo")}</span>
                                                            </button>
                                                            <HoverTooltip title={t("workbench_undo_all_unsaved", "Revert Edits")} />
                                                         </div>
                                                      </>
                                                   )}

                                                   {(modifiedCount > 0 || onlyModified) && (
                                                      <>
                                                         <div className="relative flex">
                                                            <button
                                                               type="button"
                                                               onClick={() => setOnlyModified(!onlyModified)}
                                                               className={`h-9 px-3 rounded-xl text-[11px] font-bold tracking-wide glass-surface border transition-all flex items-center gap-1.5 cursor-pointer ${
                                                                  onlyModified
                                                                     ? 'sa-glass-pill-active text-[var(--text)]'
                                                                     : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                                                               }`}
                                                            >
                                                               <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">{t("icon_track_changes", "track_changes")}</span>
                                                               <span className="hidden sm:inline">{t("badge_modified", "Modified")}</span>
                                                               <span className="text-[10px] font-extrabold tabular-nums text-[var(--accent)]">{modifiedCount}</span>
                                                            </button>
                                                            <HoverTooltip title={t("workbench_filter_modified_only", "Modified Only")} />
                                                         </div>
                                                         <div className="relative flex">
                                                            <button
                                                               type="button"
                                                               onClick={handleResetAllModified}
                                                               className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                                                            >
                                                               <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_restart_alt", "restart_alt")}</span>
                                                            </button>
                                                            <HoverTooltip title={t("workbench_reset_all_modified", "Reset Modified")} />
                                                         </div>
                                                      </>
                                                   )}

                                                   {!isTemplateMode && availableTemplates.length > 0 && (
                                                      <CustomDropdown
                                                         disableTint={true}
                                                         className="h-9"
                                                         buttonClassName="!h-9 !px-3.5 !rounded-xl glass-surface !border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] !text-[11px] font-bold"
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
                                                   )}
                                                </div>
                                             }
                                          />
                                       </div>

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
                           language={selectedFile?.name.endsWith('.json') || (editorState.rawText && (editorState.rawText.trim().startsWith('{') || editorState.rawText.trim().startsWith('['))) ? 'json' : 'ini'}
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
                                          language={templatePreviewObject?.target_file?.endsWith('.json') ? 'json' : 'ini'}
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

