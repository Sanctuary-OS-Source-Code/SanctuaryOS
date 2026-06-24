import React, { useState, useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { readDir, readTextFile, writeTextFile, mkdir, exists, remove, rename } from '@tauri-apps/plugin-fs';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { SearchBar, ViewHeader, CustomDropdown } from './shared';
import { PushTemplateSidePanel } from "./PushTemplateSidePanel";
import { ImportTemplateSidePanel } from "./ImportTemplateSidePanel";
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
  const [selectedFile, setSelectedFile] = useState<{name: string, path: string} | null>(null);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState<string>("");

  const [rawText, setRawText] = useState("");
  const [parsedData, setParsedData] = useState<any>(null);
  
  const [activeTab, setActiveTab] = useState<"visual"|"raw">("visual");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [activeTemplate, setActiveTemplate] = useState<any>(null);
  const [customAppliedTemplate, setCustomAppliedTemplate] = useState<any>(null);
  const [selectedTemplatePath, setSelectedTemplatePath] = useState<string>("built_in");
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [problemsList, setProblemsList] = useState<any[]>([]);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);

  const [categoriesHeight, setCategoriesHeight] = useState(250);
  const isDraggingCategories = useRef(false);

  useEffect(() => {
    const savedHeight = localStorage.getItem('sanctuary_workbench_cats_height');
    if (savedHeight) {
      setCategoriesHeight(parseInt(savedHeight, 10));
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingCategories.current) return;
      // Calculate height from bottom of screen. This is a bit tricky, 
      // instead, it's easier to just use window.innerHeight - e.clientY.
      let newHeight = window.innerHeight - e.clientY - 60; // offset for padding
      if (newHeight < 100) newHeight = 100;
      if (newHeight > 600) newHeight = 600;
      setCategoriesHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (isDraggingCategories.current) {
        isDraggingCategories.current = false;
        localStorage.setItem('sanctuary_workbench_cats_height', categoriesHeight.toString());
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [categoriesHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingCategories.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

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

  const handleDeleteTemplate = async (e: React.MouseEvent, path: string) => {
     e.stopPropagation();
     if (!confirm("Are you sure you want to delete this template?")) return;
     try {
        await remove(path);
        if (selectedFile?.path === path) setSelectedFile(null);
        setRefreshTrigger(prev => prev + 1);
        pushStatus("Template deleted.", "success");
     } catch (e) {
        console.error("Error deleting template", e);
        pushStatus("Failed to delete template.", "error");
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
    if (hasUnsavedChanges) {
       if (!confirm("You have unsaved changes. Are you sure you want to open a different file? Your changes will be lost.")) {
          return;
       }
    }
    try {
       const content = await readTextFile(file.path);
       setRawText(content);
       setSelectedFile(file);
       setHasUnsavedChanges(false);
       try {
          setParsedData(JSON.parse(content));
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
     setHasUnsavedChanges(true);
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
          }
      });
  };

  const saveConfig = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      await writeTextFile(selectedFile.path, rawText);
      setHasUnsavedChanges(false);
      pushStatus(t("alert_saved") || "Saved successfully!", "success");
    } catch (e) {
      pushStatus(t("alert_error") || "Error saving:", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const applyTemplateToMemory = () => {
      const displayData = Array.isArray(parsedData) ? parsedData[0] : parsedData;
      if (displayData && displayData.target_file) {
          setCustomAppliedTemplate(displayData);
          pushStatus("Template loaded. Open its target config file to preview it.", "success");
      } else {
          pushStatus("Invalid template: Missing target_file.", "error");
      }
  };

  useEffect(() => {
    if (selectedFile && !isTemplateMode) {
        const loadMatchingTemplates = async () => {
           const jsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.json'));
           const matches: any[] = [];
           
           const templatesArray = Array.isArray(workbenchTemplates) ? workbenchTemplates : (workbenchTemplates as any).default || [];
           const builtInMatch = templatesArray.find((t: any) => t.target_file?.toLowerCase() === selectedFile.name.toLowerCase());
           if (builtInMatch) matches.push({ id: "built_in", label: "Built-in Template", data: builtInMatch });
           
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
     setRawText(JSON.stringify(newData, null, 2));
     setHasUnsavedChanges(true);
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
             <div key={idx} className={`theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] p-6 flex justify-between group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.1)] hover:scale-[1.01] transition-all duration-300 gap-6 ${isPreview ? 'flex-col' : 'flex-col xl:flex-row xl:items-center'}`}>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                   <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">{t(setting.label_key) || setting.label_key || setting.key}</span>
                      {setting.risk === "advanced" && (
                         <span className="px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] text-[8px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">{t("workbench_advanced_badge") || "ADVANCED"}</span>
                      )}
                      {!isPreview && setting.type === 'boolean' && (
                         <span className={`text-[8px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md border ${val ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10' : 'text-[var(--subtext)] border-[var(--text)]/10 bg-black/20'}`}>
                           {val ? 'ENABLED' : 'DISABLED'}
                         </span>
                      )}
                   </div>
                   <span className="text-[10px] text-[var(--subtext)] opacity-80 font-medium leading-relaxed max-w-2xl">{t(setting.desc_key) || setting.desc_key || "No description provided."}</span>
                </div>
                <div className="shrink-0 flex items-center justify-end">
                   {setting.type === "boolean" && (
                      <div className={`w-14 h-8 rounded-full transition-all duration-300 relative flex items-center px-1 border cursor-pointer shadow-inner ${val ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`} onClick={() => !isPreview && handleVisualChange(setting.key, !val)}>
                         <div className={`w-6 h-6 rounded-full shadow-md transition-all duration-300 ${val ? 'translate-x-6 bg-[var(--accent)]' : 'translate-x-0 bg-[var(--text)] opacity-40'}`}></div>
                      </div>
                   )}
                   {setting.type === "number" && (
                      <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                         <button type="button" onClick={() => !isPreview && handleVisualChange(setting.key, (val !== undefined ? val : setting.default || 0) - (setting.step || 1))} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] transition-colors">
                            <span className="material-symbols-outlined !text-[16px]">remove</span>
                         </button>
                         <input type="number" min={setting.min} max={setting.max} step={setting.step} value={val !== undefined ? val : setting.default || 0} onChange={(e) => !isPreview && handleVisualChange(setting.key, parseFloat(e.target.value))} readOnly={isPreview} className="w-16 bg-transparent text-[12px] font-black text-[var(--text)] focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                         <button type="button" onClick={() => !isPreview && handleVisualChange(setting.key, (val !== undefined ? val : setting.default || 0) + (setting.step || 1))} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] transition-colors">
                            <span className="material-symbols-outlined !text-[16px]">add</span>
                         </button>
                      </div>
                   )}
                   {setting.type === "string" && (
                      <input type="text" value={val || setting.default || ""} onChange={(e) => !isPreview && handleVisualChange(setting.key, e.target.value)} readOnly={isPreview} className={`h-10 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4 text-[11px] font-black text-[var(--text)] focus:border-[var(--accent)] focus:outline-none transition-colors shadow-inner hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] w-full ${!isPreview && 'sm:w-48 xl:w-64'}`} />
                   )}
                </div>
             </div>
          );
      });
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full overflow-hidden pb-12 pr-4">      
      <div className="shrink-0 pt-6">
         <ViewHeader 
            title={t("workbench_title") || "CITIZENS WORKBENCH"} 
            subtitle={t("workbench_subtitle") || "COMMUNITY-POWERED CONFIGURATION EDITOR"}
            icon="home_repair_service"
            iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
         />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1800px] flex-1 min-h-0 mx-auto">
          {/* SIDEBAR - File Explorer */}
          <div className={`shrink-0 flex flex-col theme-glass-panel rounded-[2rem] shadow-2xl relative overflow-hidden h-[300px] lg:h-full border border-transparent transition-all duration-500 ease-in-out ${isSidebarCollapsed ? 'w-full lg:w-[88px]' : 'w-full lg:w-[320px]'}`}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 bg-black/10 backdrop-blur-xl">
                 <div className={`flex items-center gap-3 transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0 hidden lg:flex lg:invisible' : 'opacity-100'}`}>
                    <span className="material-symbols-outlined !text-xl text-[var(--accent)] drop-shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]">account_tree</span>
                    <span className="text-[14px] font-black uppercase tracking-widest text-[var(--text)] drop-shadow-md whitespace-nowrap">{t("workbench_explorer") || "WORKSPACE"}</span>
                 </div>
                 <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-[var(--subtext)] hover:text-[var(--text)] transition-colors hidden lg:flex">
                    <span className="material-symbols-outlined !text-xl">{isSidebarCollapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}</span>
                 </button>
              </div>
              
              {!isSidebarCollapsed && (
                 <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 bg-[color-mix(in_srgb,var(--bg)_20%,transparent)] flex flex-col gap-2">
                    <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">{t("workbench_explorer") || "WORKSPACE CONTENT"}</span>
                 </div>
              )}
             <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-4 gap-4 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)]">
                {files.length === 0 && !isSidebarCollapsed && (
                   <div className="flex flex-col items-center justify-center p-8 opacity-40 text-center gap-2">
                     <span className="material-symbols-outlined !text-3xl">folder_off</span>
                     <span className="text-[9px] font-black uppercase tracking-widest">{t("workbench_no_configs_found") || "No configurations found"}</span>
                   </div>
                )}
                
                {/* CONFIGURATIONS */}
                {files.filter(f => !f.name.toLowerCase().endsWith('.json')).length > 0 && (
                   <div className="flex flex-col gap-2">
                      {!isSidebarCollapsed && <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">{t("workbench_configs") || "CONFIGURATIONS"}</span>}
                      {files.filter(f => !f.name.toLowerCase().endsWith('.json')).map(file => {
                         const isSelected = selectedFile?.path === file.path;
                         return (
                           <button key={file.path} onClick={() => openFile(file)} className={`w-full text-left ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-4'} py-3.5 rounded-[1rem] flex items-center gap-3 transition-all border group shrink-0 ${isSelected ? 'theme-glass-panel border-[var(--accent)]/30 !bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1)] backdrop-blur-md' : 'theme-glass-panel border-transparent text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:shadow-md hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                             <span className={`material-symbols-outlined !text-[18px] shrink-0 ${isSelected ? 'text-[var(--accent)]' : 'opacity-40 group-hover:text-[var(--accent)] group-hover:opacity-100 transition-colors duration-500'}`}>settings</span>
                             {!isSidebarCollapsed && (
                                <span className="text-[11px] font-black uppercase tracking-widest truncate">{file.name}</span>
                             )}
                           </button>
                         );
                      })}
                   </div>
                )}

                {/* TEMPLATES */}
                {(!isSidebarCollapsed || files.filter(f => f.name.toLowerCase().endsWith('.json')).length > 0) && (
                   <div className="flex flex-col gap-2">
                      {!isSidebarCollapsed && (
                         <div className="flex items-center justify-between px-2">
                            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("workbench_templates") || "TEMPLATES"}</span>
                            <button onClick={handleNewTemplate} className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-white/10 text-[var(--subtext)] hover:text-[var(--accent)] transition-colors">
                               <span className="material-symbols-outlined !text-[14px]">add</span>
                            </button>
                         </div>
                      )}
                      {files.filter(f => f.name.toLowerCase().endsWith('.json')).map(file => {
                         const isSelected = selectedFile?.path === file.path;
                         const isRenaming = renamingFile === file.path;
                         return (
                           <div key={file.path} className={`w-full flex items-center gap-2 group ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                             <button onClick={() => !isRenaming && openFile(file)} className={`flex-1 text-left ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-4'} py-3.5 rounded-[1rem] flex items-center gap-3 transition-all border shrink-0 ${isSelected ? 'theme-glass-panel border-[var(--accent)]/30 !bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1)] backdrop-blur-md' : 'theme-glass-panel border-transparent text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:shadow-md hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                               <span className={`material-symbols-outlined !text-[18px] shrink-0 ${isSelected ? 'text-[var(--accent)]' : 'opacity-40 group-hover:text-[var(--accent)] group-hover:opacity-100 transition-colors duration-500'}`}>data_object</span>
                               {!isSidebarCollapsed && (
                                  isRenaming ? (
                                    <input 
                                       autoFocus
                                       value={renameInput}
                                       onChange={e => setRenameInput(e.target.value)}
                                       onBlur={() => handleRenameSubmit(file.path, file.name)}
                                       onKeyDown={e => e.key === 'Enter' && handleRenameSubmit(file.path, file.name)}
                                       className="w-full bg-black/20 border border-[var(--accent)] rounded px-1 text-[11px] font-black text-[var(--text)] focus:outline-none"
                                       onClick={e => e.stopPropagation()}
                                    />
                                  ) : (
                                    <span 
                                       className="text-[11px] font-black uppercase tracking-widest truncate cursor-text"
                                       onClick={(e) => {
                                          if (isSelected) {
                                            e.stopPropagation();
                                            setRenameInput(file.name);
                                            setRenamingFile(file.path);
                                          }
                                       }}
                                    >
                                       {file.name}
                                    </span>
                                  )
                               )}
                             </button>
                             {!isSidebarCollapsed && !isRenaming && (
                               <button onClick={(e) => handleDeleteTemplate(e, file.path)} className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--danger)]/20 text-[var(--danger)]/60 hover:text-[var(--danger)] transition-all">
                                 <span className="material-symbols-outlined !text-[16px]">delete</span>
                               </button>
                             )}
                           </div>
                         );
                      })}
                   </div>
                )}
             </div>
             
             {/* Categories Render (Subtle) */}
             {!isSidebarCollapsed && !isTemplateMode && activeTab === "visual" && currentVisualTemplate?.categories && currentVisualTemplate.categories.length > 0 && (
                 <>
                   {/* Vertical Drag Resizer */}
                   <div 
                     className="w-full h-2 shrink-0 cursor-row-resize flex items-center justify-center group z-50 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors"
                     onMouseDown={handleMouseDown}
                   >
                      <div className="h-[2px] w-8 rounded-full bg-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:bg-[var(--accent)] transition-colors" />
                   </div>
                   
                   <div style={{ height: `${categoriesHeight}px` }} className="px-4 py-3 shrink-0 flex flex-col gap-1 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-md overflow-y-auto custom-scrollbar transition-[height] duration-75 ease-in-out">
                       <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] px-2 mb-1">{t("workbench_categories") || "CATEGORIES"}</span>
                       <button onClick={() => setSelectedCategory("ALL")} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-all shrink-0 group ${selectedCategory === "ALL" ? 'text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                           <span className="material-symbols-outlined !text-[14px] opacity-70">apps</span>
                           <span className="text-[10px] font-bold uppercase tracking-widest truncate">{t("workbench_cat_all") || "ALL SETTINGS"}</span>
                       </button>
                       {currentVisualTemplate.categories.map((cat: any) => (
                          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-all shrink-0 group ${selectedCategory === cat.id ? 'text-[var(--text)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                             <span className="material-symbols-outlined !text-[14px] opacity-70">{t(cat.icon_key) || cat.icon || "folder"}</span>
                             <span className="text-[10px] font-bold uppercase tracking-widest truncate">{t(cat.name_key) || cat.name || cat.id}</span>
                          </button>
                       ))}
                   </div>
                 </>
             )}
             
             {/* Template Architect Guide */}
             {!isSidebarCollapsed && isTemplateMode && (
                <div className="px-5 py-5 shrink-0 flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] backdrop-blur-md">
                   <div className="flex items-center gap-2">
                       <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] drop-shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]">lightbulb</span>
                       <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">{t("workbench_guide_title") || "TEMPLATE ARCHITECT GUIDE"}</span>
                   </div>
                   <p className="text-[10px] text-[var(--subtext)] leading-relaxed">
                       {t("workbench_guide_desc") || "Define your UI using the `settings` array. Each object needs a `key` (matching the raw file), `type` (boolean, number, string, dropdown), `label_key`, and `category`. Use the `categories` array to organize them into tabs."}
                   </p>
                </div>
             )}
          </div>



          {/* MAIN CANVAS AREA */}
          <div className="flex-1 flex flex-col gap-6 min-w-0 h-full">
              
              {/* Floating Pill Toolbar */}
              <div className="theme-glass-panel rounded-[2rem] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] px-6 py-4 flex flex-col xl:flex-row items-center justify-between gap-6 w-full shrink-0 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-3xl relative z-30">
                 
                 {/* Left: Segmented Control Toggle OR Architect Badge */}
                 <div className="flex items-center justify-center xl:justify-start shrink-0">
                    {selectedFile && !isTemplateMode && (
                       <div className="flex items-center p-1 theme-glass-panel rounded-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner backdrop-blur-md flex-wrap justify-center shrink-0">
                          <button onClick={() => setActiveTab("visual")} className={`h-9 px-6 rounded-full flex items-center gap-2 transition-all font-black text-[10px] uppercase tracking-widest ${activeTab === "visual" ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-[0_5px_15px_rgba(var(--accent-rgb),0.3)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                             <span className="material-symbols-outlined !text-[16px]">tune</span>
                             <span className="hidden sm:inline">{t("workbench_tab_visual") || "VISUAL TUNING"}</span>
                          </button>
                          <button onClick={() => setActiveTab("raw")} className={`h-9 px-6 rounded-full flex items-center gap-2 transition-all font-black text-[10px] uppercase tracking-widest ${activeTab === "raw" ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-[0_5px_15px_rgba(var(--accent-rgb),0.3)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                             <span className="material-symbols-outlined !text-[16px]">code</span>
                             <span className="hidden sm:inline">{t("workbench_tab_raw") || "RAW FILE"}</span>
                          </button>
                       </div>
                    )}
                    
                    {selectedFile && isTemplateMode && (
                       <div className="flex items-center justify-center pointer-events-auto">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] theme-glass-panel border border-[var(--accent)]/30 px-6 py-2 rounded-full shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] backdrop-blur-xl">{t("workbench_template_architect") || "TEMPLATE ARCHITECT"}</span>
                       </div>
                    )}
                 </div>

                 {/* Right: Actions */}
                 {selectedFile && (
                    <div className="flex flex-wrap items-center justify-center xl:justify-end gap-3 shrink-0 pointer-events-auto">
                        {!isTemplateMode && activeTab === "visual" && (
                           <div className="w-full sm:w-64 shrink-0 z-40 relative">
                             <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)] text-lg flex items-center justify-center pointer-events-none">
                               <span className="material-symbols-outlined !text-[18px] drop-shadow-md">{t("ui_icon_search") || "search"}</span>
                             </div>
                             <input
                               type="text"
                               placeholder={t("workbench_search_placeholder") || "Search settings..."}
                               value={searchQuery}
                               onChange={(e) => setSearchQuery(e.target.value)}
                               className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-2.5 text-[var(--text)] text-[11px] font-black tracking-wider focus:outline-none focus:theme-border-accent transition-all shadow-inner border border-transparent"
                             />
                           </div>
                        )}

                       {isTemplateMode && (
                           <div className="flex flex-wrap items-center justify-center gap-2 shrink-0 z-40">
                              <button onClick={() => setIsPreviewVisible(!isPreviewVisible)} className={`h-10 px-5 rounded-full flex items-center justify-center gap-2 transition-all shrink-0 shadow-sm font-black text-[10px] uppercase tracking-widest ${isPreviewVisible ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'theme-glass-panel text-[var(--subtext)] hover:text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                                 <span className="material-symbols-outlined !text-[18px]">{isPreviewVisible ? 'visibility_off' : 'visibility'}</span>
                                 <span className="hidden xl:inline">{isPreviewVisible ? (t("workbench_btn_hide_preview") || "HIDE PREVIEW") : (t("workbench_btn_show_preview") || "LIVE PREVIEW")}</span>
                              </button>
                              <button onClick={() => setIsImportModalOpen(true)} className="h-10 px-5 rounded-full theme-glass-panel text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shrink-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm">
                                 <span className="material-symbols-outlined !text-[18px]">download</span>
                                 <span className="hidden xl:inline">{t("workbench_btn_import") || "IMPORT"}</span>
                              </button>
                              <button onClick={() => setIsPushModalOpen(true)} className="h-10 px-5 rounded-full theme-glass-panel text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shrink-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm">
                                 <span className="material-symbols-outlined !text-[18px]">cloud_upload</span>
                                 <span className="hidden xl:inline">{t("workbench_btn_publish") || "PUBLISH"}</span>
                              </button>
                              <button 
                                onClick={applyTemplateToMemory} 
                                className="h-10 px-5 rounded-full theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shrink-0 shadow-sm"
                              >
                                 <span className="material-symbols-outlined !text-[18px]">play_circle</span>
                                 <span className="hidden xl:inline">{t("workbench_btn_test_template") || "TEST PREVIEW"}</span>
                              </button>
                           </div>
                       )}

                       <button 
                         onClick={saveConfig} 
                         disabled={!selectedFile || !hasUnsavedChanges || isSaving}
                         className="h-10 px-8 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:scale-[1.02] hover:shadow-[0_10px_20px_rgba(var(--accent-rgb),0.2)] transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:saturate-0 disabled:hover:scale-100 disabled:hover:shadow-none shrink-0"
                       >
                          <span className={`material-symbols-outlined !text-[18px] ${isSaving ? 'animate-spin' : ''}`}>{t("workbench_icon_save") || "save"}</span>
                          <span className="hidden sm:inline">{isSaving ? (t("workbench_btn_saving") || "SAVING...") : (t("workbench_btn_save") || "SAVE CHANGES")}</span>
                       </button>
                    </div>
                 )}
              </div>

              {/* DYNAMIC CONTENT AREA */}
              {!selectedFile ? (
                 <div className="flex-1 flex flex-col items-center justify-center opacity-40 gap-6 p-12 theme-glass-panel rounded-[2rem] shadow-inner border border-transparent bg-black/10">
                     <div className="w-32 h-32 rounded-[3rem] bg-black/20 flex items-center justify-center border border-white/5 shadow-2xl backdrop-blur-md">
                       <span className="material-symbols-outlined !text-[64px] text-[var(--text)] drop-shadow-md">account_tree</span>
                     </div>
                     <span className="text-2xl font-black uppercase tracking-[0.4em] drop-shadow-md text-center">{t("workbench_ui_no_selection") || "NO FILE OPEN"}</span>
                 </div>
              ) : (
                 <div className="flex-1 min-h-0 relative">
                     {/* VISUAL TUNING MODE */}
                    {!isTemplateMode && activeTab === "visual" && (
                       <div className="absolute inset-0 flex flex-col gap-4">
                          {/* Template Selector Row (if multiple) */}
                          {availableTemplates.length > 1 && (
                             <div className="shrink-0 flex items-center justify-center p-2 theme-glass-panel rounded-full border border-white/5 shadow-inner backdrop-blur-md mx-auto relative z-[60]">
                                {availableTemplates.map(tmpl => (
                                   <button 
                                      key={tmpl.id} 
                                      onClick={() => {
                                          setSelectedTemplatePath(tmpl.id);
                                          if (tmpl.id === "built_in") {
                                              setActiveTemplate(tmpl.data);
                                              setCustomAppliedTemplate(null);
                                          } else {
                                              setCustomAppliedTemplate(tmpl.data);
                                              setActiveTemplate(null);
                                          }
                                      }}
                                      className={`h-8 px-6 rounded-full font-black text-[10px] uppercase tracking-widest transition-all border ${selectedTemplatePath === tmpl.id ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border-[var(--accent)]/30 shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.1)]' : 'border-transparent text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/10'}`}
                                   >
                                      {tmpl.label}
                                   </button>
                                ))}
                             </div>
                          )}
                          <div className="flex-1 theme-glass-panel rounded-[2rem] shadow-[0_10px_40px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] border border-transparent">
                             <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12">
                                <div className="max-w-4xl mx-auto flex flex-col gap-5 pb-20">
                                   {currentVisualTemplate?.settings ? (
                                      renderVisualSettingsList(currentVisualTemplate.settings, parsedData, false)
                                   ) : (
                                      <div className="flex-1 flex flex-col items-center justify-center h-full gap-6 min-h-[400px]">
                                         <div className="w-24 h-24 rounded-full bg-black/20 flex items-center justify-center border border-white/5 opacity-40">
                                            <span className="material-symbols-outlined !text-5xl">visibility_off</span>
                                         </div>
                                         <div className="flex flex-col items-center gap-2 text-center mb-4 opacity-40">
                                            <span className="text-[14px] font-black uppercase tracking-widest text-[var(--text)]">{t("workbench_no_visual_template") || "NO VISUAL TEMPLATE AVAILABLE"}</span>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] max-w-sm">{t("workbench_author_mode_hint") || "Use the Author Mode by selecting a .json file to create one."}</span>
                                         </div>
                                         <button 
                                           onClick={() => {
                                              setMarketTab("TEMPLATES");
                                              setMarketSearchQuery(selectedFile.name);
                                              setView("marketplace");
                                           }}
                                           className="h-10 px-6 rounded-xl theme-glass-panel border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/20 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest pointer-events-auto shadow-md"
                                         >
                                            <span className="material-symbols-outlined !text-[16px]">travel_explore</span>
                                            {t("workbench_btn_search_nexus") || "SEARCH NEXUS"}
                                         </button>
                                      </div>
                                   )}
                                </div>
                             </div>
                          </div>
                       </div>
                    )}

                    {/* RAW TUNING MODE */}
                    {!isTemplateMode && activeTab === "raw" && (
                       <div className="absolute inset-0 flex flex-col bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] rounded-[2rem] overflow-hidden theme-glass-panel shadow-[0_10px_40px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-xl">
                          <div className="flex-1 relative p-4 lg:p-6 pb-20 flex flex-col">
                             <div className="flex-1 relative rounded-2xl overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
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
                                 minimap: { enabled: true, scale: 0.75, renderCharacters: false },
                                 fontSize: 14,
                                 fontFamily: "var(--font-mono), Consolas, monospace",
                                 padding: { top: 32, bottom: 32 },
                                 smoothScrolling: true,
                                 cursorBlinking: "smooth",
                                 lineHeight: 24,
                                 rulers: [80]
                               }}
                             />
                          </div>
                          {problemsList.length > 0 && (
                             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] theme-glass-panel rounded-2xl shadow-2xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] overflow-hidden animate-in slide-in-from-bottom-10 z-20 backdrop-blur-3xl">
                               <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--danger)]/20 bg-[var(--danger)]/10">
                                 <span className="text-[9px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2">
                                   <span className="material-symbols-outlined !text-[12px]">error</span>
                                   {t("ide_problems") || "PROBLEMS"} ({problemsList.length})
                                 </span>
                                 <button onClick={() => setProblemsList([])} className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)]">CLEAR</button>
                               </div>
                               <div className="p-2">
                                 {problemsList.map((p, i) => (
                                   <div key={i} onClick={() => { if (editorRef) { editorRef.revealLineInCenter(p.line); editorRef.setPosition({ lineNumber: p.line, column: p.column }); editorRef.focus(); } }} className="flex items-start gap-3 px-4 py-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer group">
                                     <span className="material-symbols-outlined !text-[14px] text-[var(--danger)] mt-0.5">cancel</span>
                                     <div className="flex flex-col">
                                       <span className="text-[11px] font-mono text-[var(--text)] group-hover:text-[var(--accent)]">{p.message}</span>
                                       <span className="text-[9px] text-[var(--subtext)] font-mono uppercase opacity-60">[{p.line}, {p.column}]</span>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                            </div>
                          )}
                          </div>
                       </div>
                    )}

                    {/* TEMPLATE ARCHITECT MODE */}
                    {isTemplateMode && (
                       <div className="absolute inset-0 flex flex-col xl:flex-row gap-6 min-w-0">
                          {/* Left: JSON Editor Card */}
                          <div className="flex-1 theme-glass-panel rounded-[2rem] shadow-2xl flex flex-col relative overflow-hidden bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] min-h-[400px]">
                            <div className="flex-1 relative min-h-0">
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
                                   minimap: { enabled: false },
                                   scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                                   fontSize: 14,
                                   fontFamily: "var(--font-mono), Consolas, monospace",
                                   padding: { top: 32, bottom: 32 },
                                   smoothScrolling: true,
                                   lineHeight: 24
                                 }}
                               />
                            </div>
                            {problemsList.length > 0 && (
                               <div className="theme-glass-panel border-t border-[var(--danger)]/30 max-h-64 overflow-y-auto custom-scrollbar z-40 shrink-0 bg-black/40 backdrop-blur-3xl">
                                  <div className="flex items-center justify-between px-8 py-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] sticky top-0 bg-black/20 backdrop-blur-md">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2 drop-shadow-md">
                                      <span className="material-symbols-outlined !text-[16px]">error</span>
                                      {t("ide_problems") || "PROBLEMS"} ({problemsList.length})
                                    </span>
                                    <button onClick={() => setProblemsList([])} className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] transition-colors">CLEAR</button>
                                  </div>
                                  <div className="p-4 flex flex-col gap-1">
                                    {problemsList.map((p, i) => (
                                      <div key={i} className="flex items-start gap-4 px-6 py-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                        <span className="material-symbols-outlined !text-[18px] text-[var(--danger)] mt-0.5">cancel</span>
                                        <div className="flex flex-col gap-1">
                                          <span className="text-[12px] font-mono font-bold text-[var(--text)]">{p.message}</span>
                                          <span className="text-[10px] text-[var(--subtext)] font-mono uppercase tracking-widest opacity-60">Line {p.line}, Col {p.column}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                               </div>
                              )}
                          </div>
                          
                          {/* Right: Live Preview Card */}
                          {isPreviewVisible && (
                             <div className="w-full xl:w-[500px] shrink-0 theme-glass-panel rounded-[2rem] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-2xl flex flex-col relative overflow-hidden bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] backdrop-blur-2xl min-h-[400px]">
                                <div className="absolute top-0 left-0 w-full h-14 flex items-center justify-between px-6 border-b border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] z-10 shrink-0 backdrop-blur-2xl shadow-sm">
                                   <div className="flex items-center gap-3">
                                      <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] drop-shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]">visibility</span>
                                      <span className="text-[11px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-md">{t("workbench_live_preview") || "LIVE PREVIEW"}</span>
                                   </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-20">
                                   <div className="flex flex-col gap-4 pointer-events-none pb-12">
                                      {(() => {
                                          const displayData = Array.isArray(parsedData) ? parsedData[0] : parsedData;
                                          return displayData?.settings ? (
                                            displayData.settings.length > 0 ? (
                                               renderVisualSettingsList(displayData.settings, null, true)
                                            ) : (
                                               <div className="flex flex-col items-center justify-center opacity-40 gap-4 min-h-[300px]">
                                                  <div className="w-16 h-16 rounded-full bg-black/20 flex items-center justify-center border border-white/5">
                                                     <span className="material-symbols-outlined !text-3xl text-[var(--text)]">list_alt_add</span>
                                                  </div>
                                                  <span className="text-[10px] font-black uppercase tracking-widest text-center text-[var(--text)] max-w-[200px]">{t("workbench_add_settings") || "ADD SETTINGS IN RAW EDITOR TO SEE PREVIEW"}</span>
                                               </div>
                                            )
                                          ) : (
                                            <div className="flex flex-col items-center justify-center opacity-40 gap-4 min-h-[300px]">
                                               <div className="w-16 h-16 rounded-full bg-[var(--danger)]/10 flex items-center justify-center border border-[var(--danger)]/20">
                                                  <span className="material-symbols-outlined !text-3xl text-[var(--danger)]">code_off</span>
                                               </div>
                                               <span className="text-[10px] font-black uppercase tracking-widest text-center text-[var(--danger)]">{t("workbench_fix_syntax") || "FIX JSON SYNTAX TO SEE PREVIEW"}</span>
                                            </div>
                                          );
                                      })()}
                                   </div>
                                </div>
                             </div>
                          )}
                       </div>
                    )}
                 </div>
              )}
          </div>
      </div>

      <PushTemplateSidePanel isOpen={isPushModalOpen} onClose={() => setIsPushModalOpen(false)} templateContent={rawText} />
      <ImportTemplateSidePanel isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onSelectTemplate={(t) => { setRawText(t); handleRawChange(t); setIsImportModalOpen(false); }} />
    </div>
  );
}