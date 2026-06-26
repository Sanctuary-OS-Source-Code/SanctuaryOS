import React, { useState, useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { readDir, readTextFile, writeTextFile, mkdir, exists, remove, rename } from '@tauri-apps/plugin-fs';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { SearchBar, ViewHeader, CustomDropdown, SidePanel, standardButtonClass, standardPrimaryButtonClass, HubTabButton } from './shared';
import { PushTemplateSidePanel } from "./PushTemplateSidePanel";
import workbenchTemplates from './data/workbench_templates.json';

export default function CitizensWorkbench() {
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

  const modsPath = useStore(state => state.modsPath);
  const pushStatus = useStore(state => state.pushStatus);
  const setView = useStore(state => state.setView);
  const setMarketSearchQuery = useStore(state => state.setMarketSearchQuery);
  const setMarketTab = useStore(state => state.setMarketTab);
  
  const [files, setFiles] = useState<{name: string, path: string}[]>([]);
  const selectedFile = useStore(state => state.cwSelectedFile);
  const setSelectedFile = useStore(state => state.setCwSelectedFile);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState<string>("");

  const [rawText, setRawText] = useState("");
  const [parsedData, setParsedData] = useState<any>(null);
  
  const activeTab = useStore(state => state.cwActiveTab);
  const setActiveTab = useStore(state => state.setCwActiveTab);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [activeTemplate, setActiveTemplate] = useState<any>(null);
  const [customAppliedTemplate, setCustomAppliedTemplate] = useState<any>(null);
  const [selectedTemplatePath, setSelectedTemplatePath] = useState<string>("built_in");
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  
  const unsavedEdits = useStore(state => state.cwUnsavedEdits);
  const setUnsavedEdits = useStore(state => state.setCwUnsavedEdits);
  const hasUnsavedChanges = selectedFile && unsavedEdits[selectedFile.path] !== undefined;
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mainTab, setMainTab] = useState<"CONFIGS" | "TEMPLATES">("CONFIGS");
  const [mainSearchQuery, setMainSearchQuery] = useState("");
  const [problemsList, setProblemsList] = useState<any[]>([]);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [isTemplateGuideOpen, setIsTemplateGuideOpen] = useState(false);



  const isTemplateMode = selectedFile?.name.toLowerCase().endsWith('.json');

  // Initial load
  useEffect(() => {
    const loadFiles = async () => {
      if (!modsPath) return;
      try {
        if (!(await exists(modsPath))) return;
        
        const scanDirectory = async (dirPath: string, depth: number = 0): Promise<any[]> => {
            if (depth > 2) return [];
            try {
               const entries = await readDir(dirPath);
               const promises = entries.map(async (entry) => {
                  if (entry.isDirectory && entry.name && !entry.name.startsWith('.')) {
                     return scanDirectory(`${dirPath}\\${entry.name}`, depth + 1);
                  } else if (entry.name && (entry.name.endsWith('.cfg') || entry.name.endsWith('.json') || entry.name.endsWith('.ini'))) {
                     return [{ name: entry.name, path: `${dirPath}\\${entry.name}` }];
                  }
                  return [];
               });
               const results = await Promise.all(promises);
               return results.flat();
            } catch (err) {
               console.error("Error scanning dir:", dirPath, err);
               return [];
            }
        };

        const validFiles = await scanDirectory(modsPath);
        validFiles.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(validFiles);
      } catch (error) {
        console.error("Failed to load files:", error);
      }
    };
    loadFiles();
  }, [modsPath, refreshTrigger]);

  const handleNewTemplate = async () => {
     if (!modsPath) return;
     try {
        const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const newFileName = `TEMPLATE_${shortId}.json`;
        const newFilePath = `${modsPath}\\${newFileName}`;
        const defaultContent = {
          "template_id": "custom_template_" + shortId.toLowerCase(),
          "schema_version": 2,
          "supported_mod_versions": [
            "1.0.0"
          ],
          "target_file": selectedFile && !isTemplateMode ? selectedFile.name : "mc_settings.cfg",
          "parser_type": "json",
          "write_scope": "active_mod_folder",
          "mod_author": "Unknown",
          "template_author": "Sanctuary OS Citizen",
          "template_version": "1.0.0",
          "categories": [
            {
              "id": "population",
              "name_key": "workbench_category_population",
              "icon_key": "workbench_icon_categories"
            },
            {
              "id": "system",
              "name_key": "workbench_category_system",
              "icon_key": "workbench_icon_tune"
            }
          ],
          "settings": [
            {
              "key": "Adopt_Neglected_Child",
              "path": "Adopt_Neglected_Child",
              "type": "boolean",
              "label_key": "workbench_mccc_adopt_neglected",
              "desc_key": "workbench_mccc_adopt_neglected_desc",
              "category": "population",
              "default": false
            },
            {
              "key": "Adopt_No_Caregiver",
              "path": "Adopt_No_Caregiver",
              "type": "boolean",
              "label_key": "workbench_mccc_adopt_nocare",
              "desc_key": "workbench_mccc_adopt_nocare_desc",
              "category": "population",
              "default": false
            },
            {
              "key": "Max_Household_Size",
              "path": "Max_Household_Size",
              "type": "number",
              "label_key": "workbench_mccc_max_household",
              "desc_key": "workbench_mccc_max_household_desc",
              "category": "population",
              "min": 1,
              "max": 104,
              "step": 1,
              "default": 8,
              "risk": "advanced"
            },
            {
              "key": "Pregnancy_Percent_Chance",
              "path": "Pregnancy_Percent_Chance",
              "type": "number",
              "label_key": "workbench_mccc_pregnancy_chance",
              "desc_key": "workbench_mccc_pregnancy_chance_desc",
              "category": "population",
              "min": 0,
              "max": 100,
              "step": 5,
              "default": 20
            },
            {
              "key": "Teens_Quit_School",
              "path": "Teens_Quit_School",
              "type": "boolean",
              "label_key": "workbench_mccc_teens_quit_school",
              "desc_key": "workbench_mccc_teens_quit_school_desc",
              "category": "population",
              "default": false
            },
            {
              "key": "Allow_Teen_Parenting",
              "path": "Allow_Teen_Parenting",
              "type": "boolean",
              "label_key": "workbench_mccc_teen_parenting",
              "desc_key": "workbench_mccc_teen_parenting_desc",
              "category": "population",
              "default": false,
              "risk": "advanced"
            },
            {
              "key": "AutoSave_Enabled",
              "path": "AutoSave_Enabled",
              "type": "boolean",
              "label_key": "workbench_mccc_autosave",
              "desc_key": "workbench_mccc_autosave_desc",
              "category": "system",
              "default": true
            },
            {
              "key": "Autosave_Interval",
              "path": "Autosave_Interval",
              "type": "number",
              "label_key": "workbench_mccc_autosave_interval",
              "desc_key": "workbench_mccc_autosave_interval_desc",
              "category": "system",
              "min": 1,
              "max": 24,
              "step": 1,
              "default": 1
            }
          ]
        };
        await writeTextFile(newFilePath, JSON.stringify(defaultContent, null, 2));
        setRefreshTrigger(prev => prev + 1);
        pushStatus("New template created.", "success");
     } catch (e) {
        console.error("Error creating template", e);
        pushStatus("Failed to create template.", "error");
     }
  };

  const handleDeleteTemplate = async (path: string) => {
     try {
        await remove(path);
        if (selectedFile?.path === path) setSelectedFile(null);
        setRefreshTrigger(prev => prev + 1);
        pushStatus(t("workbench_msg_template_deleted") || "Template deleted.", "success");
     } catch (e) {
        console.error("Error deleting template", e);
        pushStatus(t("workbench_msg_template_delete_failed") || "Failed to delete template.", "error");
     }
  };

  const handleRenameSubmit = async (oldPath: string, oldName: string) => {
     if (!renameInput.trim() || renameInput === oldName) {
        setRenamingFile(null);
        return;
     }
     try {
        let newName = renameInput.trim();
        if (!newName.endsWith('.json')) newName += '.json';
        const dirPath = oldPath.substring(0, oldPath.lastIndexOf('\\'));
        const newPath = `${dirPath}\\${newName}`;
        const oldContent = await readTextFile(oldPath);
        await writeTextFile(newPath, oldContent);
        await remove(oldPath);
        if (selectedFile?.path === oldPath) {
           setSelectedFile({ name: newName, path: newPath });
        }
        setRenamingFile(null);
        setRefreshTrigger(prev => prev + 1);
        pushStatus("Template renamed.", "success");
     } catch (e) {
        console.error("Error renaming template", e);
        pushStatus("Failed to rename template.", "error");
     }
  };

  const openFile = async (file: {name: string, path: string}) => {
    try {
       let currentContent = '';
       if (unsavedEdits[file.path] !== undefined) {
          currentContent = unsavedEdits[file.path];
          setRawText(currentContent);
       } else {
          currentContent = await readTextFile(file.path);
          setRawText(currentContent);
       }
       setSelectedFile(file);
       
       try {
          setParsedData(JSON.parse(currentContent));
       } catch (e) {
          setParsedData(null);
       }
       if (!file.name.toLowerCase().endsWith('.json')) {
           setActiveTab("visual");
       }
    } catch (e) {
       pushStatus(t("ide_err_open") || "Failed to open file.", "error");
    }
  };

  const handleRawChange = (value: string | undefined) => {
     if (value === undefined) return;
     setRawText(value);
     if (selectedFile) {
        setUnsavedEdits(prev => ({...prev, [selectedFile.path]: value}));
     }
     
     if (editorRef && (window as any).monaco) {
        validateContent(value, (window as any).monaco, editorRef.getModel());
     }
     try {
        setParsedData(JSON.parse(value));
     } catch (e) {
        setParsedData(null);
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
           }
           problems.push({ line, column: col, message: err.message });
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
      if (model && monaco) {
         monaco.editor.setModelMarkers(model, 'owner', markers);
      }
      setProblemsList(problems);
  };

  const handleEditorWillMount = (monaco: any) => {
      monaco.editor.defineTheme('sanctuary-glass-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'string', foreground: '#e2e8f0' }, 
            { token: 'string.key.json', foreground: '#38bdf8' }, 
            { token: 'string.value.json', foreground: '#f8fafc' }, 
            { token: 'keyword', foreground: '#38bdf8' }, 
            { token: 'number', foreground: '#a78bfa' }, 
            { token: 'boolean', foreground: '#818cf8' }, 
            { token: 'comment', foreground: '#64748b', fontStyle: 'italic' }, 
            { token: 'type', foreground: '#2dd4bf' }, 
            { token: 'identifier', foreground: '#f8fafc' }, 
          ],
          colors: {
            'editor.background': '#00000000',
            'editor.lineHighlightBackground': '#ffffff0a',
            'editorLineNumber.foreground': '#ffffff40',
            'editorLineNumber.activeForeground': '#38bdf8',
            'editorIndentGuide.background': '#ffffff10',
            'editorSuggestWidget.background': '#0f172a',
            'editorSuggestWidget.border': '#334155',
            'minimap.background': '#00000000',
            'minimapSlider.background': '#ffffff10',
            'minimapSlider.hoverBackground': '#ffffff20',
            'minimapSlider.activeBackground': '#ffffff30',
            'scrollbarSlider.background': '#ffffff00',
            'scrollbarSlider.hoverBackground': '#ffffff10',
            'scrollbarSlider.activeBackground': '#ffffff20',
          }
      });
      monaco.editor.defineTheme('sanctuary-glass-light', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'string', foreground: '#475569' }, 
            { token: 'string.key.json', foreground: '#0284c7' }, 
            { token: 'string.value.json', foreground: '#0f172a' }, 
            { token: 'keyword', foreground: '#0284c7' }, 
            { token: 'number', foreground: '#7c3aed' }, 
            { token: 'boolean', foreground: '#4f46e5' }, 
            { token: 'comment', foreground: '#94a3b8', fontStyle: 'italic' }, 
            { token: 'type', foreground: '#0d9488' }, 
            { token: 'identifier', foreground: '#0f172a' }, 
          ],
          colors: {
            'editor.background': '#00000000',
            'editor.lineHighlightBackground': '#0000000a',
            'editorLineNumber.foreground': '#00000040',
            'editorLineNumber.activeForeground': '#0284c7',
            'editorIndentGuide.background': '#00000010',
            'editorSuggestWidget.background': '#f8fafc',
            'editorSuggestWidget.border': '#cbd5e1',
            'minimap.background': '#00000000',
            'minimapSlider.background': '#00000010',
            'minimapSlider.hoverBackground': '#00000020',
            'minimapSlider.activeBackground': '#00000030',
            'scrollbarSlider.background': '#00000000',
            'scrollbarSlider.hoverBackground': '#00000010',
            'scrollbarSlider.activeBackground': '#00000020',
          }
      });
  };

  const saveConfig = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      await writeTextFile(selectedFile.path, rawText);
      setUnsavedEdits(prev => {
          const next = {...prev};
          delete next[selectedFile.path];
          return next;
      });
      pushStatus(t("alert_saved") || "Saved successfully!", "success");
    } catch (e) {
      pushStatus(t("alert_error") || "Error saving:", "error");
    } finally {
      setIsSaving(false);
    }
  };



  useEffect(() => {
    if (selectedFile && !isTemplateMode) {
        const loadMatchingTemplates = async () => {
           const jsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.json'));
           const matches: any[] = [];
           
           const templatesArray = Array.isArray(workbenchTemplates) ? workbenchTemplates : (workbenchTemplates as any).default || [];
           const builtInMatch = templatesArray.find((t: any) => t.target_file?.toLowerCase() === selectedFile.name.toLowerCase());
           if (builtInMatch) matches.push({ id: "built_in", label: "Sanctuary Default", data: builtInMatch });
           
           for (const f of jsonFiles) {
               try {
                   const content = await readTextFile(f.path);
                   const parsed = JSON.parse(content);
                   const tData = Array.isArray(parsed) ? parsed[0] : parsed;
                   if (tData?.target_file?.toLowerCase() === selectedFile.name.toLowerCase()) {
                       matches.push({ id: f.path, label: f.name, data: tData });
                   }
               } catch (e) {
                   // ignore parse error
               }
           }
           
           setAvailableTemplates(matches);
           if (matches.length > 0) {
              const toSelect = matches.find(m => m.id === selectedTemplatePath) || matches[0];
              setSelectedTemplatePath(toSelect.id);
              if (toSelect.id === "built_in") {
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
  }, [selectedFile, isTemplateMode, files]);

  const currentVisualTemplate = (selectedTemplatePath && selectedTemplatePath !== "built_in" && customAppliedTemplate)
      ? customAppliedTemplate
      : activeTemplate;

  const handleVisualChange = (key: string, value: any) => {
     if (!parsedData) return;
     const newData = { ...parsedData, [key]: value };
     setParsedData(newData);
     const newRaw = JSON.stringify(newData, null, 2);
     setRawText(newRaw);
     if (selectedFile) {
        setUnsavedEdits(prev => ({...prev, [selectedFile.path]: newRaw}));
     }
  };

  const renderVisualSettingsList = (settings: any[], dataSource: any, isPreview = false) => {
      if (!settings) return null;
      
      let filteredSettings = settings;
      if (selectedCategory !== "ALL" && !isPreview) {
          filteredSettings = filteredSettings.filter(s => s.category === selectedCategory);
      }
      if (searchQuery && !isPreview) {
          filteredSettings = filteredSettings.filter(s => {
              const lbl = t(s.label_key) || s.label_key || s.key || "";
              const desc = t(s.desc_key) || s.desc_key || "";
              return lbl.toLowerCase().includes(searchQuery.toLowerCase()) || desc.toLowerCase().includes(searchQuery.toLowerCase());
          });
      }

      return filteredSettings.map((setting, idx) => {
          const val = dataSource ? dataSource[setting.key] : undefined;
          return (
             <div key={idx} className={`theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-3xl p-6 shadow-inner flex justify-between group hover:border-white/30 transition-all duration-300 gap-6 ${isPreview ? 'flex-col' : 'flex-col xl:flex-row xl:items-center'}`}>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                   <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">{t(setting.label_key) || setting.label_key || setting.key}</span>
                      {setting.risk === "advanced" && (
                         <span className="px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] text-[8px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">{t("workbench_advanced_badge") || "ADVANCED"}</span>
                      )}
                      {!isPreview && setting.type === 'boolean' && (
                         <span className={`text-[8px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md border ${val ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10' : 'text-[var(--subtext)] border-[var(--text)]/10 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                           {val ? 'ENABLED' : 'DISABLED'}
                         </span>
                      )}
                   </div>
                   <span className="text-[10px] text-[var(--subtext)] opacity-80 font-medium leading-relaxed max-w-2xl">{t(setting.desc_key) || setting.desc_key || "No description provided."}</span>
                </div>
                <div className="shrink-0 flex items-center justify-end">
                   {setting.type === "boolean" && (
                      <div className={`w-14 h-8 rounded-full transition-all duration-300 relative flex items-center px-1 border cursor-pointer shadow-inner ${val ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]' : 'theme-glass-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`} onClick={() => !isPreview && handleVisualChange(setting.key, !val)}>
                         <div className={`w-6 h-6 rounded-full shadow-md transition-all duration-300 ${val ? 'translate-x-6 bg-[var(--accent)]' : 'translate-x-0 bg-[var(--text)] opacity-40'}`}></div>
                      </div>
                   )}
                   {setting.type === "number" && (
                      <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 shadow-inner border border-white/10 shrink-0">
                         <button type="button" onClick={() => !isPreview && handleVisualChange(setting.key, (val !== undefined ? val : setting.default || 0) - (setting.step || 1))} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                            <span className="material-symbols-outlined !text-[16px]">remove</span>
                         </button>
                         <input type="number" min={setting.min} max={setting.max} step={setting.step} value={val !== undefined ? val : setting.default || 0} onChange={(e) => !isPreview && handleVisualChange(setting.key, parseFloat(e.target.value))} readOnly={isPreview} className="w-16 bg-transparent text-[12px] font-black text-[var(--text)] focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                         <button type="button" onClick={() => !isPreview && handleVisualChange(setting.key, (val !== undefined ? val : setting.default || 0) + (setting.step || 1))} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                            <span className="material-symbols-outlined !text-[16px]">add</span>
                         </button>
                      </div>
                   )}
                   {setting.type === "string" && (
                      <input type="text" value={val || setting.default || ""} onChange={(e) => !isPreview && handleVisualChange(setting.key, e.target.value)} readOnly={isPreview} className={`h-10 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4 text-[11px] font-black text-[var(--text)] focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] focus:outline-none transition-colors shadow-inner hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] w-full ${!isPreview && 'sm:w-48 xl:w-64'}`} />
                   )}
                </div>
             </div>
          );
      });
  };

  const filteredMainFiles = files.filter(f => {
     const isTmpl = f.name.toLowerCase().endsWith('.json');
     if (mainTab === "CONFIGS" && isTmpl) return false;
     if (mainTab === "TEMPLATES" && !isTmpl) return false;
     if (mainSearchQuery && !f.name.toLowerCase().includes(mainSearchQuery.toLowerCase())) return false;
     return true;
  });

  return (
    <div className="flex flex-col h-full w-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--accent)] opacity-[0.03] blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[var(--accent)] opacity-[0.02] blur-[100px] pointer-events-none rounded-full" />

      {/* HEADER ALWAYS VISIBLE */}
      <ViewHeader 
         title={t("workbench_title") || "CITIZENS WORKBENCH"} 
         subtitle={t("workbench_subtitle") || "COMMUNITY-POWERED CONFIGURATION EDITOR"}
         icon={t("ui_icon_design_services") || "design_services"}
         iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
         {mainTab === "TEMPLATES" && (
            <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
               <button onClick={() => setIsTemplateGuideOpen(true)} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                  <span className="material-symbols-outlined text-xl normal-case">help</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("workbench_btn_info") || "TEMPLATE GUIDE"}</span>
               </button>
               <div className="w-px h-6 bg-white/10 mx-2" />
               <button onClick={handleNewTemplate} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                 <span className="material-symbols-outlined text-xl normal-case">add</span>
                 <span className="text-[10px] font-black uppercase tracking-widest">{t("workbench_btn_new_template") || "NEW TEMPLATE"}</span>
               </button>
            </div>
         )}
      </ViewHeader>

      <div className="flex flex-col gap-6 h-full w-full overflow-hidden p-2">
         {/* Main Tabs */}
         <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 mx-2 mt-2">
            <div className="flex items-center gap-1 overflow-x-auto accent-scrollbar p-1 theme-glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner shrink-0">
               <HubTabButton id="CONFIGS" icon="settings" label={t("workbench_configs") || "CONFIGURATIONS"} activeTab={mainTab} setTab={setMainTab as any} />
               <HubTabButton id="TEMPLATES" icon="data_object" label={t("workbench_templates") || "TEMPLATES"} activeTab={mainTab} setTab={setMainTab as any} />
            </div>

         </div>

         {/* Filter Row */}
         <div className="theme-glass-panel p-6 rounded-[2rem] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20 mx-2">
            <div className="flex-1 min-w-[250px] relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)] text-lg flex items-center justify-center">
                <span className="material-symbols-outlined !text-[20px] drop-shadow-md">{t("ui_icon_search") || "search"}</span>
              </div>
              <input 
                value={mainSearchQuery} 
                onChange={e => setMainSearchQuery(e.target.value)} 
                placeholder={t("workbench_search_files") || "Search files..."} 
                className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
              />
            </div>
         </div>

         {/* GRID VIEW */}
         <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-32">
            {filteredMainFiles.length === 0 ? (
                 <div className="w-full p-12 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center gap-4 opacity-60 shadow-inner">
                    <span className="material-symbols-outlined !text-4xl text-[var(--subtext)]">{mainTab === "CONFIGS" ? "settings_off" : "data_object"}</span>
                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{t("workbench_no_files_found") || "No Files Found"}</span>
                 </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 p-2">
                   {filteredMainFiles.map(file => {
                      const isTmpl = file.name.toLowerCase().endsWith('.json');
                      return (
                         <div key={file.path} className="group relative break-inside-avoid">
                           <button 
                             onClick={() => openFile(file)}
                             className={`w-full text-left p-6 rounded-[2rem] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] ${unsavedEdits[file.path] !== undefined ? 'border border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/50 backdrop-blur-[3px] shadow-[0_8px_32px_rgba(245,158,11,0.15)]' : 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}
                           >
                              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                              <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner group-hover:border-[var(--accent)]/50 transition-colors">
                                 <span className="material-symbols-outlined !text-2xl text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">{isTmpl ? "data_object" : "settings"}</span>
                              </div>
                              <div className="flex flex-col gap-1 z-10 pr-10">
                                 <span className="text-sm font-black text-[var(--text)] tracking-wider truncate">{file.name}</span>
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60">{isTmpl ? "JSON Schema" : "System Configuration"}</span>
                              </div>
                           </button>
                           {unsavedEdits[file.path] !== undefined && (
                              <div className="absolute top-6 right-6 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full shadow-inner animate-pulse z-20 pointer-events-none">
                                 <span className="material-symbols-outlined !text-[12px]">warning</span>
                                 {t("workbench_unsaved_changes") || "UNSAVED CHANGES"}
                              </div>
                           )}
                           {isTmpl && (
                             <div onClick={(e) => e.stopPropagation()} className={`absolute right-6 flex flex-col items-end gap-2 ${unsavedEdits[file.path] !== undefined ? 'top-16' : 'top-6'}`}>
                                {deleteConfirmPath === file.path ? (
                                    <>
                                      <button onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(file.path); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-rose-500/30 text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 hover:border-rose-500/50 backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-30 shadow-[0_4px_12px_rgba(244,63,94,0.15)]">
                                         <span className="material-symbols-outlined !text-sm drop-shadow-md">check</span>
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-white/10 text-[var(--subtext)] bg-white/5 hover:bg-white/10 hover:text-[var(--text)] hover:border-white/20 backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-30 shadow-lg">
                                         <span className="material-symbols-outlined !text-sm">close</span>
                                      </button>
                                   </>
                                ) : (
                                   <button 
                                     onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(file.path); }} 
                                     className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 shadow-lg z-20"
                                   >
                                      <span className="material-symbols-outlined !text-sm">delete</span>
                                   </button>
                                )}
                             </div>
                           )}
                         </div>
                      )
                   })}
                </div>
            )}
         </div>
      </div>

      <SidePanel 
        isOpen={!!selectedFile} 
        onClose={() => setSelectedFile(null)} 
        title={selectedFile?.name || ""} 
        subtitle={isTemplateMode ? (t("workbench_template_architect") || "TEMPLATE ARCHITECT") : (t("workbench_tab_visual") || "VISUAL TUNING")}
        icon={isTemplateMode ? "data_object" : "tune"}
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={isTemplateMode && isPreviewVisible ? 1400 : 900}
         footer={
          <div className="flex items-center justify-center gap-3 w-full shrink-0 relative">
             {!isTemplateMode && (
                <>
                   <button onClick={() => setActiveTab("visual")} className={activeTab === "visual" ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]') : standardButtonClass}>
                      <span className="material-symbols-outlined !text-[16px]">tune</span>
                      {t("workbench_tab_visual") || "VISUAL INTERFACE"}
                   </button>
                   <button onClick={() => setActiveTab("raw")} className={activeTab === "raw" ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]') : standardButtonClass}>
                      <span className="material-symbols-outlined !text-[16px]">code</span>
                      {t("workbench_tab_raw") || "RAW EDITOR"}
                   </button>
                </>
             )}

             {isTemplateMode && (
                <>
                   <button onClick={() => setIsPreviewVisible(!isPreviewVisible)} className={isPreviewVisible ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]') : standardButtonClass}>
                      <span className="material-symbols-outlined !text-[18px]">{isPreviewVisible ? 'visibility_off' : 'visibility'}</span>
                      {isPreviewVisible ? (t("workbench_btn_hide_preview") || "HIDE PREVIEW") : (t("workbench_btn_show_preview") || "PREVIEW")}
                   </button>
                   <button 
                     onClick={() => setIsPushModalOpen(true)} 
                     disabled={problemsList.length > 0}
                     className={`${standardButtonClass} disabled:opacity-30 disabled:saturate-0`}
                     title={problemsList.length > 0 ? "Cannot publish with errors" : ""}
                   >
                      <span className="material-symbols-outlined !text-[18px]">cloud_upload</span>
                      {t("workbench_btn_publish") || "PUBLISH"}
                   </button>
                </>
             )}

             <div className="relative group">
                {hasUnsavedChanges && (
                   <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-500 animate-pulse whitespace-nowrap bg-black/40 px-3 py-1 rounded-full border border-amber-500/30">
                      <span className="material-symbols-outlined !text-[12px]">warning</span>
                      {t("workbench_unsaved_changes") || "UNSAVED CHANGES"}
                   </div>
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
                  <span className={`material-symbols-outlined !text-[18px] ${isSaving ? 'animate-spin' : ''}`}>{t("workbench_icon_save") || "save"}</span>
                  {isSaving ? (t("workbench_btn_saving") || "SAVING...") : (t("workbench_btn_save") || "SAVE CONFIG")}
                </button>
             </div>
          </div>
        }
      >
         {/* EDITOR CONTENT AREA */}
         <div className="flex-1 min-h-0 flex flex-col gap-6 h-full w-full relative">
             
             {/* VISUAL TUNING MODE */}
             {!isTemplateMode && activeTab === "visual" && (
                <div className="absolute inset-0 flex flex-col gap-6">
                   {/* Templates Row */}
                   <div className="flex items-center justify-between shrink-0 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-2 pl-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                         {t("workbench_active_template") || "ACTIVE TEMPLATE:"}
                      </span>
                      {availableTemplates.length > 0 ? (
                         <div className="w-64">
                             <CustomDropdown
                               value={selectedTemplatePath}
                               options={availableTemplates}
                               onChange={(val: string[]) => {
                                   const newPath = val[0];
                                   setSelectedTemplatePath(newPath);
                                   const tmpl = availableTemplates.find(t => t.id === newPath);
                                   if (newPath === "built_in" && tmpl) {
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
                      ) : (
                         <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] pr-4">
                           {t("workbench_template_builtin") || "BUILT-IN"}
                         </span>
                      )}
                   </div>

                   {/* Categories Pills */}
                   {currentVisualTemplate?.categories && currentVisualTemplate.categories.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 shrink-0">
                         <button 
                            onClick={() => setSelectedCategory("ALL")} 
                            className={`shrink-0 h-8 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border flex items-center gap-2 shadow-md ${selectedCategory === "ALL" ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'theme-glass-panel text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}
                         >
                            {t("workbench_cat_all") || "ALL"}
                         </button>
                         {currentVisualTemplate.categories.map((cat: any) => (
                            <button 
                               key={cat.id} 
                               onClick={() => setSelectedCategory(cat.id)} 
                               className={`shrink-0 h-8 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border flex items-center gap-2 shadow-md ${selectedCategory === cat.id ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'theme-glass-panel text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}
                            >
                               {t(cat.icon_key) || cat.icon || "folder"} {t(cat.name_key) || cat.name || cat.id}
                            </button>
                         ))}
                      </div>
                   )}

                   {/* Search Bar */}
                   <div className="shrink-0 relative">
                     <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] flex items-center pointer-events-none">
                       <span className="material-symbols-outlined !text-[18px]">search</span>
                     </div>
                     <input
                       type="text"
                       placeholder={t("workbench_search_placeholder") || "Search settings..."}
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-[11px] font-black tracking-wider focus:outline-none focus:theme-border-accent transition-all shadow-inner"
                     />
                   </div>

                   {/* Visual Settings Grid */}
                   <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative z-10 pb-20">
                      <div className="flex flex-col gap-4">
                         {currentVisualTemplate?.settings ? (
                            renderVisualSettingsList(currentVisualTemplate.settings, parsedData, false)
                         ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8 min-h-[400px]">
                               <div className="w-24 h-24 rounded-full theme-glass-panel flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-40 shadow-inner">
                                  <span className="material-symbols-outlined !text-5xl text-[var(--text)]">visibility_off</span>
                               </div>
                               <div className="flex flex-col items-center gap-3 text-center opacity-60">
                                  <span className="text-[14px] font-black uppercase tracking-[0.2em] text-[var(--text)]">{t("workbench_no_visual_template") || "NO VISUAL TEMPLATE AVAILABLE"}</span>
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] max-w-sm leading-relaxed">{t("workbench_author_mode_hint") || "USE THE RAW EDITOR TO EDIT DIRECTLY."}</span>
                               </div>
                               <div className="mt-4 flex items-center gap-4">
                                  <button onClick={() => { window.location.href = '#/marketplace?tab=templates&q=' + encodeURIComponent(selectedFile?.name || ''); }} className="mt-8 h-12 px-6 rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-[0_10px_30px_rgba(var(--accent-rgb),0.1)]">
                              <span className="material-symbols-outlined !text-[16px]">travel_explore</span>
                              {t("workbench_search_nexus") || "SEARCH THE NEXUS"}
                           </button>
                               </div>
                            </div>
                         )}
                      </div>
                   </div>
                </div>
             )}

             {/* RAW TUNING MODE */}
             {!isTemplateMode && activeTab === "raw" && (
                <div className="absolute inset-0 flex flex-col theme-glass-panel rounded-3xl overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                   <div className="flex-1 relative">
                      <Editor
                         height="100%"
                         language={selectedFile?.name.endsWith('.json') || (rawText && (rawText.trim().startsWith('{') || rawText.trim().startsWith('['))) ? 'json' : 'ini'}
                         theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                         beforeMount={handleEditorWillMount}
                         value={rawText}
                         onChange={handleRawChange}
                         onMount={(editor, monaco) => {
                            setEditorRef(editor);
                            (window as any).monaco = monaco;
                            validateContent(rawText, monaco, editor.getModel());
                         }}
                         options={{
                           minimap: { enabled: true },
                           fontSize: 14,
                           fontFamily: "var(--font-mono), Consolas, monospace",
                           padding: { top: 24, bottom: 24 },
                           smoothScrolling: true,
                           cursorBlinking: "smooth",
                           lineHeight: 24
                         }}
                      />
                   </div>

                   {problemsList.length > 0 && (
                      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-2xl rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] overflow-hidden animate-in slide-in-from-bottom-10 z-[100] flex flex-col max-h-72">
                        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] shrink-0">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2 drop-shadow-md">
                            <span className="material-symbols-outlined !text-[16px]">error</span>
                            {t("ide_problems") || "PROBLEMS"} ({problemsList.length})
                          </span>
                          <button onClick={() => setProblemsList([])} className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors">
                            <span className="material-symbols-outlined !text-[14px]">close</span>
                          </button>
                        </div>
                        <div className="p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar relative z-10">
                          {problemsList.map((p, i) => (
                            <div key={i} onClick={() => { if (editorRef) { editorRef.revealLineInCenter(p.line); editorRef.setPosition({ lineNumber: p.line, column: p.column }); editorRef.focus(); } }} className="flex items-start gap-4 px-4 py-3 rounded-xl hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] cursor-pointer group transition-colors">
                              <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] mt-0.5">cancel</span>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[11px] font-mono font-bold text-[var(--text)] group-hover:text-[var(--danger)] transition-colors whitespace-normal break-words">{p.message}</span>
                                <span className="text-[9px] text-[var(--subtext)] font-mono uppercase tracking-widest opacity-60">Ln {p.line}, Col {p.column}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                   )}

                </div>
             )}

             {/* TEMPLATE ARCHITECT MODE */}
             {isTemplateMode && (
                <div className={`absolute inset-0 flex gap-4 ${isPreviewVisible ? 'flex-row' : 'flex-col'}`}>
                   <div className="flex-1 theme-glass-panel rounded-3xl overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                     <Editor
                        height="100%"
                        language="json"
                        theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                        beforeMount={handleEditorWillMount}
                        value={rawText}
                        onChange={handleRawChange}
                        onMount={(editor, monaco) => {
                           setEditorRef(editor);
                           (window as any).monaco = monaco;
                           validateContent(rawText, monaco, editor.getModel());
                        }}
                        options={{
                          minimap: { enabled: true },
                          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                          fontSize: 14,
                          fontFamily: "var(--font-mono), Consolas, monospace",
                          padding: { top: 24, bottom: 24 },
                          smoothScrolling: true,
                          lineHeight: 24
                        }}
                      />
                                      {problemsList.length > 0 && (
                      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-2xl rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] overflow-hidden animate-in slide-in-from-bottom-10 z-[100] flex flex-col max-h-72">
                        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] shrink-0">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2 drop-shadow-md">
                            <span className="material-symbols-outlined !text-[16px]">error</span>
                            {t("ide_problems") || "PROBLEMS"} ({problemsList.length})
                          </span>
                          <button onClick={() => setProblemsList([])} className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors">
                            <span className="material-symbols-outlined !text-[14px]">close</span>
                          </button>
                        </div>
                        <div className="p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar relative z-10">
                          {problemsList.map((p, i) => (
                            <div key={i} onClick={() => { if (editorRef) { editorRef.revealLineInCenter(p.line); editorRef.setPosition({ lineNumber: p.line, column: p.column }); editorRef.focus(); } }} className="flex items-start gap-4 px-4 py-3 rounded-xl hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] cursor-pointer group transition-colors">
                              <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] mt-0.5">cancel</span>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[11px] font-mono font-bold text-[var(--text)] group-hover:text-[var(--danger)] transition-colors whitespace-normal break-words">{p.message}</span>
                                <span className="text-[9px] text-[var(--subtext)] font-mono uppercase tracking-widest opacity-60">Ln {p.line}, Col {p.column}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                   )}
                   </div>

                   {/* Preview Pane */}
                   {isPreviewVisible && (
                     <div className="w-[500px] shrink-0 theme-glass-panel rounded-3xl overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col relative">
                       <div className="p-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shrink-0 text-center">
                         <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("workbench_preview_title") || "VISUAL PREVIEW"}</span>
                       </div>
                       <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                         {problemsList.length > 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                               <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">visibility_off</span>
                               <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase">{t("workbench_preview_unavailable") || "Preview Unavailable"}</h3>
                               <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("workbench_preview_resolve") || "Resolve template errors to regenerate the visual preview."}</p>
                            </div>
                         ) : (
                            <div className="flex flex-col gap-4 pb-10">
                               {renderVisualSettingsList(parsedData?.settings || (parsedData?.length ? parsedData[0]?.settings : []), null, true)}
                            </div>
                         )}
                       </div>
                     </div>
                   )}
                </div>
             )}
         </div>
      </SidePanel>

      <PushTemplateSidePanel isOpen={isPushModalOpen} onClose={() => setIsPushModalOpen(false)} templateContent={rawText} />

       {/* Template Guide SidePanel */}
       <SidePanel
          isOpen={isTemplateGuideOpen}
          onClose={() => setIsTemplateGuideOpen(false)}
          title={t("workbench_guide_title") || "TEMPLATE ARCHITECTURE"}
          subtitle={t("workbench_guide_subtitle") || "SCHEMA GUIDE"}
          icon="help"
          iconColorClass="theme-text-accent"
          defaultWidth={800}
       >
          <div className="p-8 flex flex-col gap-6 text-[var(--text)] h-full overflow-y-auto custom-scrollbar">
             <div className="theme-glass-panel p-6 rounded-3xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] blur-[100px] opacity-20 pointer-events-none"></div>
                <h3 className="text-lg font-black uppercase tracking-widest text-[var(--accent)] mb-2">{t("workbench_author_guide_intro") || "A workbench template maps an unstructured config file into a beautiful UI. Write your template in JSON."}</h3>
                <p className="text-[12px] opacity-80 leading-relaxed font-mono whitespace-pre-wrap">
                   {t("workbench_author_guide_fields_desc") || "Define the `target_file` (e.g. settings.json), the `parser_type` (json or ini), and map the settings keys to their data types."}
                   <br/><br/>
                   <span className="text-[var(--accent)]">Supported Types:</span> boolean, number, string
                   <br/>
                   <span className="text-[var(--accent)]">Organization:</span> Create items in the `categories` array to structure the settings into beautiful UI tabs.
                </p>
             </div>
             
             <div className="flex flex-col gap-4">
                <h4 className="text-sm font-black uppercase tracking-widest opacity-60 ml-2">Example Blueprint</h4>
                <div className="theme-glass-panel rounded-2xl p-4 overflow-x-auto border border-white/10 font-mono text-[12px] leading-relaxed custom-scrollbar bg-black/20">
                   <pre className="text-[var(--text)]">
{`{
  "template_id": "mc_settings_v1",
  "target_file": "mc_settings.cfg",
  "parser_type": "json",
  "name_key": "workbench_mc_settings",
  "desc_key": "workbench_mc_settings_desc",
  "icon": "settings",
  "author": "Sanctuary OS",
  "version": "1.0.0",
  "categories": [
    {
      "id": "population",
      "name_key": "workbench_category_population",
      "icon": "groups"
    }
  ],
  "settings": [
    {
      "key": "Max_Household_Size",
      "path": "Max_Household_Size",
      "type": "number",
      "label_key": "workbench_mccc_max_household",
      "category": "population",
      "min": 1,
      "max": 104,
      "default": 8
    }
  ]
}`}
                   </pre>
                </div>
             </div>
          </div>
       </SidePanel>
    </div>
  );
}
