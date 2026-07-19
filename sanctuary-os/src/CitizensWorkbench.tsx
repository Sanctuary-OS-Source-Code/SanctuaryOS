import React, { useState, useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { readDir, readTextFile, writeTextFile, mkdir, exists, remove, rename } from '@tauri-apps/plugin-fs';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { SearchBar, ViewHeader, CustomDropdown, SidePanel, standardButtonClass, standardPrimaryButtonClass, standardDangerButtonClass, HubTabButton, HoverTooltip } from './shared';
import { PushTemplateSidePanel } from './side-panels/PushTemplateSidePanel';
import VersionTimeline from "./VersionTimeline";
import { invoke } from '@tauri-apps/api/core';
import workbenchTemplates from './data/workbench_templates.json';
import { supabaseServices } from './lib/supabase-services';
import { supabase } from './supabase';
import { WorkbenchTemplateGuide } from './workbench/WorkbenchTemplateGuide';
import { WorkbenchRawEditor } from './workbench/WorkbenchRawEditor';
import { WorkbenchVisualEditor } from './workbench/WorkbenchVisualEditor';
import { WorkbenchFileGrid } from './workbench/WorkbenchFileGrid';
import { WorkbenchEmptyVisualState } from './workbench/WorkbenchEmptyVisualState';
import { WorkbenchTemplateTools } from './workbench/WorkbenchTemplateTools';

export default function CitizensWorkbench({ onOpenMasonProfile }: { onOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
   const { t } = useLexicon();
   const [isLight, setIsLight] = useState(false);

   useEffect(() => {
      const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
      if (bg) {
         const bgHex = bg.replace('#', '');
         const r = parseInt(bgHex.substring(0, 2), 16) || 0;
         const g = parseInt(bgHex.substring(2, 4), 16) || 0;
         const b = parseInt(bgHex.substring(4, 6), 16) || 0;
         const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
         setIsLight(luminance > 0.5);
      }
   }, []);

   const vaultPath = useStore(state => state.vaultPath);
   const pushStatus = useStore(state => state.pushStatus);
   const setView = useStore(state => state.setView);
   const setMarketSearchQuery = useStore(state => state.setMarketSearchQuery);
   const setMarketTab = useStore(state => state.setMarketTab);
   const selectedFile = useStore(state => state.cwSelectedFile);
   const setSelectedFile = useStore(state => state.setCwSelectedFile);
   const activeTab = useStore(state => state.cwActiveTab);
   const setActiveTab = useStore(state => state.setCwActiveTab);
   const communityDefaultsRefreshTrigger = useStore(state => state.communityDefaultsRefreshTrigger);

   const [files, setFiles] = useState<{ name: string, path: string }[]>([]);
   const [communityDefaults, setCommunityDefaults] = useState<any[]>([]);
   const lastLoadedFileRef = useRef<string | null>(null);

   const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
   const [isPushModalOpen, setIsPushModalOpen] = useState(false);

   const [refreshTrigger, setRefreshTrigger] = useState(0);
   const [renamingFile, setRenamingFile] = useState<string | null>(null);
   const [renameInput, setRenameInput] = useState<string>("");

   const [rawText, setRawText] = useState("");
   const [parsedData, setParsedData] = useState<any>(null);

   const [activeTemplate, setActiveTemplate] = useState<any>(null);
   const [customAppliedTemplate, setCustomAppliedTemplate] = useState<any>(null);
   const [selectedTemplatePath, setSelectedTemplatePath] = useState<string>("built_in");
   const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
   const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

   const unsavedEdits = useStore(state => state.cwUnsavedEdits);
   const setUnsavedEdits = useStore(state => state.setCwUnsavedEdits);
   const hasUnsavedChanges = selectedFile && unsavedEdits[selectedFile.path] !== undefined;

   const [isFlagPanelOpen, setIsFlagPanelOpen] = useState(false);
   const [flagReason, setFlagReason] = useState("");
   const [isFlagging, setIsFlagging] = useState(false);
   const [flagSuccess, setFlagSuccess] = useState(false);
   const [isSaving, setIsSaving] = useState(false);
   const [activeVersionTimestamp, setActiveVersionTimestamp] = useState<number | null>(null);
   const [searchQuery, setSearchQuery] = useState("");
   const mainTab = useStore(state => state.cwMainTab);
   const setMainTab = useStore(state => state.setCwMainTab);
   const [mainSearchQuery, setMainSearchQuery] = useState("");
   const [problemsList, setProblemsList] = useState<any[]>([]);
   const [editorRef, setEditorRef] = useState<any>(null);
   const [previewMode, setPreviewMode] = useState<'preview' | 'file' | 'off'>('preview');
   const [targetFileContent, setTargetFileContent] = useState<string>("");
   const [isFullscreen, setIsFullscreen] = useState(false);
   const [previewWidth, setPreviewWidth] = useState(600);
   const [isResizingPreview, setIsResizingPreview] = useState(false);
   const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
   const [isTemplateGuideOpen, setIsTemplateGuideOpen] = useState(false);
   const [showTimeline, setShowTimeline] = useState(false);
   const [confirmSaveWithErrors, setConfirmSaveWithErrors] = useState(false);

   const isTemplateMode = selectedFile?.name.toLowerCase().endsWith('.json');

   useEffect(() => {
      if (!isResizingPreview) return;
      const handleMouseMove = (e: MouseEvent) => {
         const newWidth = Math.max(300, window.innerWidth - e.clientX - 40);
         setPreviewWidth(newWidth);
      };
      const handleMouseUp = () => setIsResizingPreview(false);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
         document.removeEventListener('mousemove', handleMouseMove);
         document.removeEventListener('mouseup', handleMouseUp);
      };
   }, [isResizingPreview]);

   useEffect(() => {
      const loadTarget = async () => {
         if (previewMode === 'file' && isTemplateMode && selectedFile && parsedData?.target_file && vaultPath) {
            try {
               const targetName = parsedData.target_file;
               const sep = vaultPath.includes('\\') ? '\\' : '/';
               const modsDir = vaultPath + sep + "Mods";
               let targetPath = "";
               if (await exists(modsDir)) {
                  if (await exists(modsDir + sep + targetName)) {
                     targetPath = modsDir + sep + targetName;
                  } else {
                     const entries = await readDir(modsDir);
                     for (const entry of entries) {
                        if (entry.isDirectory) {
                           const p = modsDir + sep + entry.name + sep + targetName;
                           if (await exists(p)) {
                              targetPath = p;
                              break;
                           }
                        }
                     }
                  }
               }
               if (!targetPath) {
                  const dir = selectedFile.path.substring(0, selectedFile.path.lastIndexOf(selectedFile.path.includes('\\') ? '\\' : '/'));
                  const fallbackPath = dir + sep + targetName;
                  if (await exists(fallbackPath)) targetPath = fallbackPath;
               }

               if (targetPath) {
                  const content = await readTextFile(targetPath);
                  setTargetFileContent(content);
               } else {
                  setTargetFileContent(`// Target file not found locally.\n// You can use this space as a scratchpad.`);
               }
            } catch (err: any) {
               setTargetFileContent(`// Error reading file:\n// ${err.message}`);
            }
         }
      };
      loadTarget();
   }, [previewMode, isTemplateMode, selectedFile, parsedData?.target_file, vaultPath]);

   useEffect(() => {
      const fetchDefaults = async () => {
         if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
         try {
            const defaults = await supabaseServices.getAllCommunityDefaults();
            if (defaults) {
               setCommunityDefaults(defaults);
            }
         } catch (e) {
            console.error("Failed to fetch community defaults:", e);
         }
      };
      fetchDefaults();
   }, [communityDefaultsRefreshTrigger]);

   useEffect(() => {
      const loadFiles = async () => {
         if (!vaultPath) return;
         try {
            if (!(await exists(vaultPath))) return;

            let validFiles: any[] = [];
            try {
               const results: string[] = await invoke("get_workbench_files", { vaultPath });
               validFiles = results.map(r => {
                  const sep = r.includes('\\') ? '\\' : '/';
                  const parts = r.split(sep);
                  return { name: parts[parts.length - 1], path: r };
               });
            } catch (e) {
               console.error("Native scanner failed:", e);
            }

            validFiles.sort((a, b) => a.name.localeCompare(b.name));
            setFiles(validFiles);
         } catch (error) {
            console.error("Failed to load files:", error);
         }
      };
      loadFiles();
   }, [vaultPath, refreshTrigger]);

   const handleNewTemplate = async () => {
      if (!vaultPath) return;
      try {
         const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
         const newFileName = `TEMPLATE_${shortId}.json`;
         const sep = vaultPath.includes('\\') ? '\\' : '/';
         const tmplPath = vaultPath.endsWith(sep) ? `${vaultPath}Data${sep}Templates` : `${vaultPath}${sep}Data${sep}Templates`;

         if (!(await exists(tmplPath))) {
            await mkdir(tmplPath, { recursive: true });
         }
         const newFilePath = `${tmplPath}${sep}${newFileName}`;
         const defaultContent = {
            "template_id": "custom_template_" + shortId.toLowerCase(),
            "schema_version": 2,
            "supported_mod_versions": [
               "1.0.0"
            ],
            "target_file": selectedFile && !isTemplateMode ? selectedFile.name : "my_mod_settings.cfg",
            "parser_type": "json",
            "write_scope": "active_mod_folder",
            "mod_author": "Unknown",
            "template_author": "Sanctuary OS Citizen",
            "template_version": "1.0.0",
            "categories": [
               {
                  "id": "general",
                  "name_key": "category_general",
                  "icon_key": "icon_tune"
               }
            ],
            "settings": [
               {
                  "key": "My_Boolean_Setting",
                  "path": "My_Boolean_Setting",
                  "type": "boolean",
                  "label_key": "author_boilerplate_label",
                  "desc_key": "author_boilerplate_desc",
                  "category": "general",
                  "default": false
               },
               {
                  "key": "My_Number_Setting",
                  "path": "My_Number_Setting",
                  "type": "number",
                  "label_key": "author_boilerplate_label",
                  "desc_key": "author_boilerplate_desc",
                  "category": "general",
                  "min": 0,
                  "max": 100,
                  "default": 50
               },
               {
                  "key": "My_String_Setting",
                  "path": "My_String_Setting",
                  "type": "string",
                  "label_key": "author_boilerplate_label",
                  "desc_key": "author_boilerplate_desc",
                  "category": "general",
                  "default": "Default Text"
               },
               {
                  "key": "My_Dropdown_Setting",
                  "path": "My_Dropdown_Setting",
                  "type": "dropdown",
                  "label_key": "author_boilerplate_label",
                  "desc_key": "author_boilerplate_desc",
                  "category": "general",
                  "options": [
                     { "value": "A", "label_key": "cat_all" },
                     { "value": "B", "label_key": "category_system" }
                  ],
                  "default": "A"
               }
            ]
         };
         await writeTextFile(newFilePath, JSON.stringify(defaultContent, null, 2));
         setRefreshTrigger(prev => prev + 1);
         pushStatus(t("msg_template_created"), "success");
      } catch (e) {
         console.error("Error creating template", e);
         pushStatus(t("msg_template_create_failed"), "error");
      }
   };

   const handleDeleteTemplate = React.useCallback(async (path: string) => {
      try {
         await remove(path);
         if (useStore.getState().cwSelectedFile?.path === path) useStore.getState().setCwSelectedFile(null);
         setRefreshTrigger(prev => prev + 1);
         useStore.getState().pushStatus("Template deleted", "success");
      } catch (e) {
         console.error("Error deleting template", e);
         useStore.getState().pushStatus("Failed to delete template", "error");
      }
   }, []);

   const handleRenameSubmit = React.useCallback(async (oldPath: string, oldName: string) => {
      const lastDot = oldName.lastIndexOf('.');
      const ext = lastDot > 0 ? oldName.substring(lastDot) : '.json';
      const baseOldName = lastDot > 0 ? oldName.substring(0, lastDot) : oldName;
      if (!renameInput.trim() || renameInput === baseOldName) {
         setRenamingFile(null);
         return;
      }
      try {
         let newName = renameInput.trim() + ext;
         const dirPath = oldPath.substring(0, oldPath.lastIndexOf('\\'));
         const newPath = `${dirPath}\\${newName}`;
         const oldContent = await readTextFile(oldPath);
         await writeTextFile(newPath, oldContent);
         await remove(oldPath);
         if (useStore.getState().cwSelectedFile?.path === oldPath) {
            useStore.getState().setCwSelectedFile({ name: newName, path: newPath });
         }
         setRenamingFile(null);
         setRefreshTrigger(prev => prev + 1);
         useStore.getState().pushStatus("Template renamed", "success");
      } catch (e) {
         console.error("Error renaming template", e);
         useStore.getState().pushStatus("Failed to rename template", "error");
      }
   }, [renameInput]);

   const openFile = React.useCallback(async (file: { name: string, path: string }) => {
      try {
         const unsaved = useStore.getState().cwUnsavedEdits;
         let currentContent = '';
         if (unsaved[file.path] !== undefined) {
            currentContent = unsaved[file.path];
            setRawText(currentContent);
         } else {
            currentContent = await readTextFile(file.path);
            setRawText(currentContent);
         }
         setSelectedFile(file);
         setActiveVersionTimestamp(null);
         setProblemsList([]);
         try {
            setParsedData(JSON.parse(currentContent));
         } catch (e) {
            setParsedData(null);
         }
         if (!file.name.toLowerCase().endsWith('.json')) {
            setActiveTab("visual");
         }
      } catch (e) {
         useStore.getState().pushStatus("Error opening file", "error");
      }
   }, []);

   // Hydrate on mount if the store remembered a selected file
   useEffect(() => {
      if (selectedFile && rawText === "") {
         openFile(selectedFile);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   useEffect(() => {
      if (rawText === undefined) return;
      if (editorRef && (window as any).monaco) {
         validateContent(rawText, (window as any).monaco, editorRef.getModel());
      } else {
         validateContent(rawText, null, null);
      }
   }, [rawText, editorRef]);

   const handleRawChange = (value: string | undefined) => {
      if (value === undefined) return;
      setRawText(value);
      if (selectedFile) {
         setUnsavedEdits(prev => ({ ...prev, [selectedFile.path]: value }));
      }
      try {
         setParsedData(JSON.parse(value));
      } catch (e) {
         setParsedData(null);
      }
   };

   const handleInsertSnippet = (snippet: string) => {
      if (editorRef) {
         const position = editorRef.getPosition() || { lineNumber: 1, column: 1 };
         if (position.lineNumber === 1 && position.column === 1) {
            pushStatus(t("err_no_focus") || "Please click inside the Raw Code editor to place your cursor first.", "warning");
            return;
         }
         editorRef.executeEdits("insert-snippet", [{
            range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
            text: snippet,
            forceMoveMarkers: true
         }]);
         editorRef.focus();
      }
   };

   const validateContent = (text: string, monaco: any, model: any) => {
      let problems: any[] = [];
      let markers: any[] = [];
      const isJson = selectedFile?.name.endsWith('.json') || (text && (text.trim().startsWith('{') || text.trim().startsWith('[')));

      if (isJson) {
         try {
            JSON.parse(text);
         } catch (err: any) {
            const match = err.message.match(/at position (\d+)/);
            let line = 1;
            let col = 1;
            if (match && model) {
               const pos = parseInt(match[1], 10);
               const p = model.getPositionAt(pos);
               line = p.lineNumber;
               col = p.column;
            } else if (err.message.includes("Unexpected end of JSON input") && model) {
               line = model.getLineCount() || 1;
               col = model.getLineMaxColumn(line) || 1;
            }
            problems.push({ line, column: col, message: err.message });
            if (monaco) {
               markers.push({
                  startLineNumber: line,
                  startColumn: col,
                  endLineNumber: line,
                  endColumn: col + 1,
                  message: err.message,
                  severity: monaco.MarkerSeverity.Error
               });
            }
         }
      }
      if (model && monaco) {
         monaco.editor.setModelMarkers(model, 'owner', markers);
      }
      setProblemsList(problems);
   };


   const saveConfig = async () => {
      if (!selectedFile) return;
      setIsSaving(true);
      try {
         await invoke('save_file_with_history', { path: selectedFile.path, content: rawText });
         setUnsavedEdits(prev => {
            const next = { ...prev };
            delete next[selectedFile.path];
            return next;
         });
         setActiveVersionTimestamp(null);
         pushStatus(t("alert_saved"), "success");
      } catch (e) {
         pushStatus(t("alert_error"), "error");
      } finally {
         setIsSaving(false);
      }
   };

   useEffect(() => {
      if (selectedFile && files.length > 0) {
         const loadMatchingTemplates = async () => {
            const matches: any[] = [];

            let hasCommunityDefault = false;
            if (communityDefaults && communityDefaults.length > 0) {
               const commTmpl = communityDefaults.find((d: any) => {
                  const tData = Array.isArray(d.template_data) ? d.template_data[0] : d.template_data;
                  const targetFile = tData?.target_file || d.name;
                  return targetFile?.toLowerCase() === selectedFile.name.toLowerCase();
               });
               if (commTmpl) {
                  const tData = Array.isArray(commTmpl.template_data) ? commTmpl.template_data[0] : commTmpl.template_data;
                  matches.push({ id: commTmpl.id, label: commTmpl.name || t("template_builtin"), data: tData, isCommunity: true, author: commTmpl.author || tData.template_author || "Unknown Mason", authorId: commTmpl.author_id });
                  hasCommunityDefault = true;
               }
            }

            if (!hasCommunityDefault) {
               const templatesArray = Array.isArray(workbenchTemplates) ? workbenchTemplates : (workbenchTemplates as any).default || [];
               const builtInMatch = templatesArray.find((t: any) => t.target_file?.toLowerCase() === selectedFile.name.toLowerCase());
               if (builtInMatch) matches.push({ id: "built_in", label: t("template_builtin"), data: builtInMatch });
            }

            for (const f of files.filter(f => f.name.toLowerCase().endsWith('.json'))) {
               try {
                  const content = await readTextFile(f.path);
                  const parsed = JSON.parse(content);
                  const tData = Array.isArray(parsed) ? parsed[0] : parsed;
                  if (tData?.target_file?.toLowerCase() === selectedFile.name.toLowerCase()) {
                     matches.push({ id: f.path, label: f.name, data: tData });
                  }
               } catch (e) {
               }
            }

            setAvailableTemplates(matches);
            if (matches.length > 0) {
               const prevMatch = matches.find(m => m.id === selectedTemplatePath);
               let toSelect;

               if (lastLoadedFileRef.current !== selectedFile.path) {
                  toSelect = matches[0];
                  lastLoadedFileRef.current = selectedFile.path;
               } else {
                  toSelect = prevMatch || matches[0];
               }

               setSelectedTemplatePath(toSelect.id);
               if (toSelect.id === "built_in" || toSelect.isCommunity) {
                  setActiveTemplate(toSelect.data);
                  setCustomAppliedTemplate(null);
               } else {
                  setCustomAppliedTemplate(toSelect.data);
                  setActiveTemplate(null);
               }
            } else {
               setSelectedTemplatePath("");
               setActiveTemplate(null);
               setCustomAppliedTemplate(null);
            }
         };
         loadMatchingTemplates();
      } else {
         setAvailableTemplates([]);
      }
   }, [selectedFile, isTemplateMode, files, vaultPath, communityDefaults]);

   const currentVisualTemplate = (selectedTemplatePath && selectedTemplatePath !== "built_in" && customAppliedTemplate)
      ? customAppliedTemplate
      : activeTemplate;

   const handleVisualChange = React.useCallback((dataPath: string, value: any) => {
      const sf = useStore.getState().cwSelectedFile;
      if (!sf) return;

      setParsedData((prev: any) => {
         const newData = JSON.parse(JSON.stringify(prev || {}));
         
         const parts = dataPath.split('.');
         let current = newData;
         for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
         }
         current[parts[parts.length - 1]] = value;

         const newRaw = JSON.stringify(newData, null, 2);
         setRawText(newRaw);
         useStore.getState().setCwUnsavedEdits(prevUnsaved => ({ ...prevUnsaved, [sf.path]: newRaw }));
         
         return newData;
      });
   }, []);

   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k);
      if (tr === `[${k}]`) return k;
      return tr;
   };


   const filteredMainFiles = React.useMemo(() => files.filter(f => {
      const isTmpl = f.name.toLowerCase().endsWith('.json');
      if (mainTab === "CONFIGS" && isTmpl) return false;
      if (mainTab === "TEMPLATES" && !isTmpl) return false;
      if (mainSearchQuery && !f.name.toLowerCase().includes(mainSearchQuery.toLowerCase())) return false;
      return true;
   }), [files, mainTab, mainSearchQuery]);

   return (
      <div className="flex flex-col h-full w-full overflow-y-scroll custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-700 relative pr-4">


         <ViewHeader
            title={t("workbench_title")}
            subtitle={t("workbench_subtitle")}
            icon={t("icon_design_services")}
            iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
         >
            {mainTab === "TEMPLATES" && (
               <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner">
                  <button onClick={() => setIsTemplateGuideOpen(true)} className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                     <span className="material-symbols-outlined text-xl normal-case">{t("icon_help")}</span>
                     <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_info")}</span>
                  </button>

                  <button onClick={handleNewTemplate} className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                     <span className="material-symbols-outlined text-xl normal-case">{t("icon_add")}</span>
                     <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_new_template")}</span>
                  </button>
               </div>
            )}
         </ViewHeader>

         <div className="flex flex-col gap-6 min-h-max w-full p-2">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 mx-2 mt-2">
               <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
                  <HubTabButton id="CONFIGS" icon="settings" label={t("configs")} activeTab={mainTab} setTab={setMainTab as any} />
                  <HubTabButton id="TEMPLATES" icon="data_object" label={t("ql_templates")} activeTab={mainTab} setTab={setMainTab as any} />
               </div>

            </div>

            <div className="theme-glass-panel p-6 rounded-[var(--radius)] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20 mx-2">
               <div className="flex-1 min-w-[250px] relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)] text-lg flex items-center justify-center">
                     <span className="material-symbols-outlined !text-[20px] drop-shadow-md">{t("icon_search")}</span>
                  </div>
                  <input
                     value={mainSearchQuery}
                     onChange={e => setMainSearchQuery(e.target.value)}
                     placeholder={t("search_files")}
                     className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
                  />
               </div>
            </div>

            <div className="flex-1 pb-32">
               <WorkbenchFileGrid
                  filteredMainFiles={filteredMainFiles}
                  mainTab={mainTab}
                  renamingFile={renamingFile}
                  renameInput={renameInput}
                  deleteConfirmPath={deleteConfirmPath}
                  setRenameInput={setRenameInput}
                  setRenamingFile={setRenamingFile}
                  setDeleteConfirmPath={setDeleteConfirmPath}
                  handleRenameSubmit={handleRenameSubmit}
                  handleDeleteTemplate={handleDeleteTemplate}
                  openFile={openFile}
               />
            </div>
         </div>

         <SidePanel
            isOpen={!!selectedFile}
            onClose={() => setSelectedFile(null)}
            title={isTemplateMode ? (t("author_mode") || "AUTHOR MODE") : (t("editor_mode") || "EDITOR MODE")}
            subtitle={selectedFile ? selectedFile.name : (t("workbench_subtitle") || "CITIZENS WORKBENCH")}
            icon={isTemplateMode ? (t("icon_data_object")) : (t("icon_tune"))}
            iconColorClass="theme-text-accent"
            isResizable={!isFullscreen}
            defaultWidth={isFullscreen ? window.innerWidth : ((isTemplateMode && previewMode !== 'off') || activeTab === 'dual' ? 1400 : 900)}
            panelClass={isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none" : ""}
            headerActions={
               <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner mr-2 backdrop-blur-md">
                  <div className="relative group flex">
                     <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="w-12 h-12 flex items-center justify-center text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shrink-0"
                     >
                        <span className="material-symbols-outlined !text-[18px]">{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
                     </button>
                     <HoverTooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} variant="info" className="z-[100] top-[120%]" />
                  </div>

                  {isTemplateMode && (
                     <div className="flex items-center">
                        <button
                           onClick={() => setIsTemplateGuideOpen(true)}
                           className="h-12 px-6 transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent font-black"
                        >
                           <span className="material-symbols-outlined text-xl normal-case">{t("icon_help")}</span>
                           <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_info")}</span>
                        </button>
                     </div>
                  )}
                  <button
                     onClick={() => setShowTimeline(true)}
                     disabled={!selectedFile}
                     className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black disabled:opacity-50 disabled:pointer-events-none"
                  >
                     <span className="material-symbols-outlined text-xl normal-case">{t("icon_history")}</span>
                     <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_timeline")}</span>
                  </button>
               </div>
            }
            footer={
               <div className="flex items-center justify-center w-full gap-4">
                  {isTemplateMode && (
                     <div className="relative group/publishbtn">
                        {(!useStore.getState().session || localStorage.getItem("sanctuary_blacklisted") === "true") ? (
                           <HoverTooltip
                              title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("alert_guest_mode")}
                              subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
                              className="group-hover/publishbtn:flex z-[1000] left-1/2 -translate-x-1/2 bottom-[120%]"
                           />
                        ) : problemsList.length > 0 ? (
                           <HoverTooltip
                              title={t("err_publish_blocks")}
                              subtitle={t("publish_disabled_errors_desc")}
                              variant="danger"
                              className="group-hover/publishbtn:flex z-[1000] left-1/2 -translate-x-1/2 bottom-[120%]"
                           />
                        ) : null}
                        <button
                           onClick={() => setIsPushModalOpen(true)}
                           disabled={problemsList.length > 0 || !useStore.getState().session || localStorage.getItem("sanctuary_blacklisted") === "true"}
                           className={`${standardButtonClass} disabled:opacity-30 disabled:saturate-0`}
                        >
                           <span className="material-symbols-outlined !text-[18px]">{t("icon_cloud_upload")}</span>
                           {t("btn_publish")}
                        </button>
                     </div>
                  )}
                  <div className="relative group">
                     {problemsList.length > 0 && hasUnsavedChanges ? (
                        confirmSaveWithErrors ? (
                           <div className="flex items-center gap-2">
                              <button
                                 onClick={() => setConfirmSaveWithErrors(false)}
                                 className="px-6 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all hover:scale-105 active:scale-95 group"
                              >
                                 <span className="material-symbols-outlined !text-[20px] opacity-60 group-hover:opacity-100 transition-opacity">close</span>
                                 {t("nav_cancel")}
                              </button>
                              <button
                                 onClick={() => {
                                    setConfirmSaveWithErrors(false);
                                    saveConfig();
                                 }}
                                 disabled={isSaving}
                                 className={`${standardDangerButtonClass} shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_30%,transparent)]`}
                              >
                                 <span className="material-symbols-outlined !text-[18px]">check</span>
                                 {t("btn_confirm_save_errors") || "FORCE SAVE"}
                              </button>
                           </div>
                        ) : (
                           <div className="relative group">
                              <HoverTooltip title={t("save_with_errors_warning") || "Saving not recommended until errors resolved"} variant="danger" className="z-[100] right-0 translate-x-0 left-auto bottom-[120%]" />
                              <button
                                 onClick={() => setConfirmSaveWithErrors(true)}
                                 disabled={isSaving}
                                 className={standardDangerButtonClass}
                              >
                                 <span className={`material-symbols-outlined !text-[18px] ${isSaving ? 'animate-spin' : ''}`}>warning</span>
                                 {isSaving ? (t("btn_saving")) : (t("btn_save_with_errors") || "SAVE WITH ERRORS")}
                              </button>
                           </div>
                        )
                     ) : (
                        <div className="relative group">
                           {hasUnsavedChanges && (
                              <HoverTooltip title={t("unsaved_changes")} variant="warning" className="z-[100] right-0 translate-x-0 left-auto bottom-[120%]" />
                           )}
                           <button
                              onClick={saveConfig}
                              disabled={!hasUnsavedChanges || isSaving}
                              className={
                                 hasUnsavedChanges
                                    ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] hover:shadow-[0_5px_20px_rgba(245,158,11,0.4)]')
                                    : standardButtonClass
                              }
                           >
                              <span className={`material-symbols-outlined !text-[18px] ${isSaving ? 'animate-spin' : ''}`}>{t("icon_save")}</span>
                              {isSaving ? (t("btn_saving")) : (t("save"))}
                           </button>
                        </div>
                     )}
                  </div>
               </div>
            }
         >
            <div className="flex-1 min-h-0 flex flex-col h-full w-full relative">

               <div className="flex-1 relative min-h-0 mx-2 mb-2 flex flex-col gap-4">
                  {!isTemplateMode && (
                     <div className="flex justify-start items-center px-2 mt-2 shrink-0 z-[100]">
                        <div className="flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
                           <HubTabButton id="visual" activeTab={activeTab} setTab={setActiveTab} label={t("tab_visual") || "Visual"} icon={t("icon_tune") || "tune"} />
                           <HubTabButton id="raw" activeTab={activeTab} setTab={setActiveTab} label={t("tab_raw") || "Raw"} icon={t("icon_code") || "code"} />
                           <HubTabButton id="dual" activeTab={activeTab} setTab={setActiveTab} label={t("tab_dual_vision") || "Dual Vision"} icon="splitscreen" />
                        </div>
                     </div>
                  )}

                  {!isTemplateMode && (
                     <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${activeTab === 'dual' ? 'flex-row' : 'flex-col'}`}>
                        {(activeTab === "visual" || activeTab === "dual") && (
                           <div className={`flex flex-col gap-6 flex-1 relative min-w-0 min-h-0`}>
                              <div className="flex flex-col gap-2 shrink-0 mb-4">
                                 <div className="flex flex-row items-center gap-2 w-full">
                                    <div className="flex-[2] min-w-[120px] relative">
                                       <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] flex items-center pointer-events-none">
                                          <span className="material-symbols-outlined !text-[18px]">{t("icon_search")}</span>
                                       </div>
                                       <input
                                          type="text"
                                          placeholder={t("workbench_search_placeholder")}
                                          value={searchQuery}
                                          onChange={(e) => setSearchQuery(e.target.value)}
                                          className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl pl-12 pr-5 py-2.5 h-10 text-[var(--text)] text-[11px] font-black tracking-wider focus:outline-none focus:theme-border-accent transition-all shadow-inner"
                                       />
                                    </div>

                                    {!isTemplateMode && availableTemplates.length > 0 && (
                                       <div className="w-max shrink-0 relative z-[100]">
                                          <CustomDropdown
                                             value={selectedTemplatePath}
                                             options={availableTemplates}
                                             onChange={(val: string[]) => {
                                                const newPath = val[0];
                                                setSelectedTemplatePath(newPath);
                                                const tmpl = availableTemplates.find(t => t.id === newPath);
                                                if (tmpl && (tmpl.id === "built_in" || tmpl.isCommunity)) {
                                                   setActiveTemplate(tmpl.data);
                                                   setCustomAppliedTemplate(null);
                                                } else if (tmpl) {
                                                   setCustomAppliedTemplate(tmpl.data);
                                                   setActiveTemplate(null);
                                                }
                                             }}
                                             disableTint={true}
                                          />
                                       </div>
                                    )}

                                    {currentVisualTemplate?.categories && currentVisualTemplate.categories.length > 0 && (
                                       <div className="w-max shrink-0 relative z-[40]">
                                          <CustomDropdown
                                             value={selectedCategory}
                                             options={[
                                                { id: "ALL", label: t("cat_all") || "All Settings" },
                                                ...currentVisualTemplate.categories.map((cat: any) => ({
                                                   id: cat.id,
                                                   label: resolveText(cat.name_key, cat.name || cat.id) as string,
                                                   icon: resolveText(cat.icon_key, cat.icon || "folder") as string
                                                }))
                                             ]}
                                             onChange={(val: string[]) => setSelectedCategory(val[0])}
                                             disableTint={true}
                                          />
                                       </div>
                                    )}
                                 </div>
                              </div>

                              <div className="flex-1 relative min-h-0 min-w-0">
                                 {problemsList.length > 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                       <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">warning</span>
                                       <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase">{t("syntax_error_title")}</h3>
                                       <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("syntax_error_desc")}</p>
                                    </div>
                                 ) : (
                                    <div className="absolute inset-0 overflow-y-scroll custom-scrollbar pr-2 z-10 pb-20">
                                       <div className="flex flex-col gap-4 min-h-[300px] transition-all duration-300">
                                          {currentVisualTemplate?.settings ? (
                                             <WorkbenchVisualEditor
                                                settings={currentVisualTemplate.settings}
                                                dataSource={parsedData}
                                                isPreview={false}
                                                selectedCategory={selectedCategory}
                                                searchQuery={searchQuery}
                                                onVisualChange={handleVisualChange}
                                             />
                                          ) : (
                                             <WorkbenchEmptyVisualState t={t} selectedFile={selectedFile} />
                                          )}
                                       </div>
                                    </div>
                                 )}
                              </div>
                           </div>
                        )}
                        {activeTab === 'dual' && (
                           <>
                              {isResizingPreview && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
                              <div
                                 className="w-2 rounded-full cursor-col-resize hover:bg-[var(--accent)]/50 transition-colors flex items-center justify-center shrink-0 z-10"
                                 onMouseDown={(e) => { e.preventDefault(); setIsResizingPreview(true); }}
                              >
                                 <div className="h-12 w-1 rounded-full bg-[var(--accent)]/30" />
                              </div>
                           </>
                        )}

                        {(activeTab === "raw" || activeTab === "dual") && (
                           <div className={`monaco-wrapper relative flex flex-col theme-glass-panel rounded-[var(--radius)] overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${activeTab === 'dual' ? 'shrink-0' : 'flex-1 min-w-0 min-h-0'}`} style={activeTab === 'dual' ? { width: previewWidth } : {}}>
                               <WorkbenchRawEditor
                                  value={rawText}
                                  onChange={handleRawChange}
                                  language={selectedFile?.name.endsWith('.json') || (rawText && (rawText.trim().startsWith('{') || rawText.trim().startsWith('['))) ? 'json' : 'ini'}
                                  isLight={isLight}
                                  problemsList={problemsList}
                                  setProblemsList={setProblemsList}
                                  isResizingPreview={isResizingPreview}
                                  onEditorMount={(editor, monaco) => setEditorRef(editor)}
                               />
                           </div>
                        )}
                     </div>
                  )}


                  {isTemplateMode && (
                     <div className="flex justify-start items-center px-2 mt-2 mb-2 shrink-0 z-[100]">
                        <div className="flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
                           <HubTabButton id="preview" activeTab={previewMode} setTab={setPreviewMode} label={t("preview") || "Preview"} icon="visibility" />
                           <HubTabButton id="file" activeTab={previewMode} setTab={setPreviewMode} label={t("tab_file") || "File"} icon="description" />
                           <HubTabButton id="off" activeTab={previewMode} setTab={setPreviewMode} label={t("tab_off") || "Off"} icon="visibility_off" />
                        </div>
                     </div>
                  )}

                  {isTemplateMode && (
                     <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${previewMode === 'off' ? 'flex-col' : 'flex-row'}`}>
                        <div className="flex-1 theme-glass-panel rounded-[var(--radius)] overflow-visible shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative flex flex-col min-h-0 min-w-0 z-[110]">
                           <div className="p-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shrink-0 flex items-center justify-between z-10 w-full overflow-visible flex-wrap rounded-t-[var(--radius)]">
                              <WorkbenchTemplateTools 
                                 parsedData={parsedData}
                                 rawText={rawText}
                                 setRawText={setRawText}
                                 files={files}
                                 t={t}
                                 handleInsertSnippet={handleInsertSnippet}
                              />
                           </div>

                           <div className="flex-1 relative w-full min-w-0 min-h-0 overflow-hidden rounded-b-[var(--radius)]">
                              <WorkbenchRawEditor
                                 value={rawText}
                                 onChange={handleRawChange}
                                 language="json"
                                 isLight={isLight}
                                 problemsList={problemsList}
                                 setProblemsList={setProblemsList}
                                 isResizingPreview={isResizingPreview}
                                 onEditorMount={(editor, monaco) => {
                                    setEditorRef(editor);
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

                        </div>

                        {previewMode !== 'off' && (
                           <>
                              {isResizingPreview && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
                              <div
                                 className="w-2 rounded-full cursor-col-resize hover:bg-[var(--accent)]/50 transition-colors flex items-center justify-center shrink-0 z-10"
                                 onMouseDown={(e) => { e.preventDefault(); setIsResizingPreview(true); }}
                              >
                                 <div className="h-12 w-1 rounded-full bg-[var(--accent)]/30" />
                              </div>
                              <div className={`shrink-0 theme-glass-panel rounded-[var(--radius)] overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col relative ${isResizingPreview ? 'pointer-events-none select-none' : ''}`} style={{ width: previewWidth }}>
                                 <div className="p-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shrink-0 text-center flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">{previewMode === 'preview' ? t("workbench_preview_title") : (parsedData?.target_file || 'Target File')}</span>
                                 </div>
                                 <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                    {previewMode === 'preview' ? (
                                       problemsList.length > 0 ? (
                                          <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                             <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">{t("icon_visibility_off")}</span>
                                             <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase">{t("preview_unavailable")}</h3>
                                             <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("preview_resolve")}</p>
                                          </div>
                                       ) : (
                                          <div className="flex flex-col gap-4 pb-10">
                                             <WorkbenchVisualEditor
                                                settings={parsedData?.settings || (parsedData?.length ? parsedData[0]?.settings : [])}
                                                dataSource={null}
                                                isPreview={true}
                                                selectedCategory="ALL"
                                                searchQuery=""
                                                onVisualChange={() => {}}
                                             />
                                          </div>
                                       )
                                    ) : (
                                       <div className="h-full w-full">
                                          <Editor
                                             height="100%"
                                             language={parsedData?.target_file?.endsWith('.json') ? 'json' : 'ini'}
                                             theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                                             value={targetFileContent}
                                             onMount={(editor, monaco) => {
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
                                             options={{
                                                automaticLayout: true,
                                                readOnly: true,
                                                minimap: { enabled: false },
                                                fontSize: 12,
                                                wordWrap: "on",
                                                renderLineHighlight: "none",
                                                selectionHighlight: false,
                                                occurrencesHighlight: "off",
                                                matchBrackets: "never",
                                                contextmenu: false
                                             }}
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

         <PushTemplateSidePanel 
            isOpen={isPushModalOpen} 
            onClose={() => setIsPushModalOpen(false)} 
            templateContent={rawText} 
            onChange={handleRawChange} 
            onPushSuccess={async (newName, newJson) => {
               if (selectedFile) {
                  try {
                     const sanitizedName = newName.replace(/[^a-z0-9_\-\.]/gi, '_');
                     const newFileName = sanitizedName.toLowerCase().endsWith('.json') ? sanitizedName : sanitizedName + '.json';
                     
                     if (newFileName !== selectedFile.name) {
                        const dirPath = selectedFile.path.substring(0, selectedFile.path.lastIndexOf(selectedFile.path.includes('\\') ? '\\' : '/'));
                        const sep = selectedFile.path.includes('\\') ? '\\' : '/';
                        const newPath = `${dirPath}${sep}${newFileName}`;
                        
                        await writeTextFile(newPath, newJson);
                        await remove(selectedFile.path);
                        
                        useStore.getState().setCwSelectedFile({ name: newFileName, path: newPath });
                        setRefreshTrigger(prev => prev + 1);
                     } else {
                        await invoke('save_file_silently', { path: selectedFile.path, content: newJson });
                     }
                  } catch (e) {
                     console.error("Failed to rename file after push", e);
                  }
               }
            }}
         />

         <WorkbenchTemplateGuide isOpen={isTemplateGuideOpen} onClose={() => setIsTemplateGuideOpen(false)} />

         <SidePanel
            isOpen={isFlagPanelOpen}
            onClose={() => setIsFlagPanelOpen(false)}
            title={t("auto_report") || "Flag Template"}
            subtitle="Report an issue with this community template"
            icon="flag"
            iconColorClass="text-rose-500"
            footer={
               flagSuccess ? undefined : (
                  <div className="flex w-full gap-3 mt-4">
                     <button
                        onClick={() => setIsFlagPanelOpen(false)}
                        className={standardButtonClass + " flex-1"}
                     >
                        {t("nav_cancel") || "Cancel"}
                     </button>
                     <button
                        onClick={async () => {
                           if (!flagReason.trim()) return;
                           setIsFlagging(true);
                           const { data: { session } } = await supabase.auth.getSession();
                           const userId = session?.user?.id || "system";
                           await supabaseServices.flagTemplate(selectedTemplatePath, flagReason, userId);
                           setIsFlagging(false);
                           setFlagSuccess(true);
                        }}
                        disabled={isFlagging || !flagReason.trim()}
                        className={standardDangerButtonClass + " flex-1"}
                     >
                        {isFlagging ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">{t("icon_flag")}</span>}
                        {isFlagging ? t("create_btn_creating") : t("auto_report")}
                     </button>
                  </div>
               )
            }
         >
            <div className="p-8 flex flex-col gap-6">
               {flagSuccess ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center gap-4">
                     <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                        <span className="material-symbols-outlined !text-3xl">{t("icon_check")}</span>
                     </div>
                     <p className="text-[var(--text)] font-bold">{t("verify_panel_flag_success") || "Template flagged successfully"}</p>
                  </div>
               ) : (
                  <div className="theme-glass-panel p-6 rounded-2xl border border-white/10 flex flex-col gap-4">
                     <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("flag_reason")}</label>
                     <textarea
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        className="w-full h-32 bg-black/20 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 text-[12px] font-bold text-[var(--text)] focus:outline-none focus:border-rose-500/50 resize-none custom-scrollbar"
                        placeholder="E.g. The configuration fields don't match the mod, it contains invalid types..."
                     />
                  </div>
               )}
            </div>
         </SidePanel>

         {showTimeline && selectedFile && (
            <VersionTimeline
               key={selectedFile.path}
               filePath={selectedFile.path}
               hasUnsavedChanges={!!hasUnsavedChanges}
               activeVersionTimestamp={activeVersionTimestamp}
               onRestore={async (content, timestamp) => {
                  setRawText(content);
                  try {
                     setParsedData(JSON.parse(content));
                  } catch (e) {
                     setParsedData(null);
                  }
                  
                  setUnsavedEdits(prev => {
                     const next = { ...prev };
                     delete next[selectedFile.path];
                     return next;
                  });
                  
                  try {
                     await invoke('save_file_silently', { path: selectedFile.path, content });
                     setActiveVersionTimestamp(timestamp);
                     pushStatus(t("alert_saved"), "success");
                  } catch (e) {
                     console.error(e);
                     pushStatus("Failed to save restored version", "error");
                  }
               }}
               onClose={() => setShowTimeline(false)}
            />
         )}
      </div>
   );
}

