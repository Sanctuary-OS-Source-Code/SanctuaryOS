import { useState, useEffect, useCallback } from 'react';
import { readTextFile, writeTextFile, mkdir, exists, remove } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store';
import { supabaseServices } from '../../lib/supabase-services';
import { useLexicon } from '../../LexiconContext';

import workbenchTemplates from '../../data/workbench_templates.json';

interface UseWorkbenchFilesProps {
   mainTab: string;
   mainSearchQuery: string;
}

export function useWorkbenchFiles({ mainTab, mainSearchQuery }: UseWorkbenchFilesProps) {
   const { t } = useLexicon();
   const vaultPath = useStore(state => state.vaultPath);
   const pushStatus = useStore(state => state.pushStatus);
   const selectedFile = useStore(state => state.cwSelectedFile);
   const setSelectedFile = useStore(state => state.setCwSelectedFile);
   const setActiveTab = useStore(state => state.setCwActiveTab);
   const communityDefaultsRefreshTrigger = useStore(state => state.communityDefaultsRefreshTrigger);
   const setUnsavedEdits = useStore(state => state.setCwUnsavedEdits);

   const [files, setFiles] = useState<{ name: string, path: string }[]>([]);
   const [communityDefaults, setCommunityDefaults] = useState<any[]>([]);
   const [refreshTrigger, setRefreshTrigger] = useState(0);
   const [renamingFile, setRenamingFile] = useState<string | null>(null);
   const [renameInput, setRenameInput] = useState<string>("");
   const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
   const [isSaving, setIsSaving] = useState(false);
   const [activeVersionTimestamp, setActiveVersionTimestamp] = useState<number | null>(null);
   const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);

   const filteredMainFiles = files.filter(f => {
      const isTmpl = f.name.toLowerCase().endsWith('.json');
      if (mainTab === "CONFIGS" && isTmpl) return false;
      if (mainTab === "TEMPLATES" && !isTmpl) return false;
      if (mainSearchQuery && !f.name.toLowerCase().includes(mainSearchQuery.toLowerCase())) return false;
      return true;
   });

   const isTemplateMode = selectedFile?.name.toLowerCase().endsWith('.json');

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

            const templatesArray = Array.isArray(workbenchTemplates) ? workbenchTemplates : (workbenchTemplates as any).default || [];
            const builtInMatch = templatesArray.find((t: any) => t.target_file?.toLowerCase() === selectedFile.name.toLowerCase());
            if (builtInMatch) matches.push({ id: "built_in", label: t("template_builtin"), data: builtInMatch });

            for (const f of files.filter(f => f.name.toLowerCase().endsWith('.json'))) {
               try {
                  const unsaved = useStore.getState().cwUnsavedEdits;
                  let content = '';
                  if (unsaved[f.path] !== undefined) {
                     content = unsaved[f.path];
                  } else {
                     content = await readTextFile(f.path);
                  }
                  
                  const parsed = JSON.parse(content);
                  const tData = Array.isArray(parsed) ? parsed[0] : parsed;
                  if (tData?.target_file?.toLowerCase() === selectedFile.name.toLowerCase()) {
                     matches.push({ id: f.path, label: f.name, data: tData });
                  }
               } catch (e) {}
            }

            setAvailableTemplates(matches);
         };
         loadMatchingTemplates();
      } else {
         setAvailableTemplates([]);
      }
   }, [selectedFile, files, vaultPath, communityDefaults]);

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
            "supported_mod_versions": ["1.0.0"],
            "target_file": selectedFile && !isTemplateMode ? selectedFile.name : "my_mod_settings.cfg",
            "parser_type": "json",
            "write_scope": "active_mod_folder",
            "mod_author": "Unknown",
            "template_author": "Sanctuary OS Citizen",
            "template_version": "1.0.0",
            "categories": [
               { "id": "general", "name_key": "category_general", "icon_key": "icon_tune" }
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
                  "allow_decimals": false,
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

   const handleDeleteTemplate = useCallback(async (path: string) => {
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

   const handleRenameSubmit = useCallback(async (oldPath: string, oldName: string) => {
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

   const openFile = useCallback(async (file: { name: string, path: string }) => {
      try {
         useStore.getState().setCwSelectedFile(file);
         if (!file.name.toLowerCase().endsWith('.json')) {
            useStore.getState().setCwActiveTab("visual");
         }
      } catch (e) {
         useStore.getState().pushStatus("Error opening file", "error");
      }
   }, []);

   const saveConfig = async (rawText: string) => {
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
         setRefreshTrigger(prev => prev + 1);
         pushStatus(t("alert_saved"), "success");
      } catch (e) {
         pushStatus(t("alert_error"), "error");
      } finally {
         setIsSaving(false);
      }
   };

   return {
      files, communityDefaults, renamingFile, setRenamingFile, renameInput, setRenameInput,
      deleteConfirmPath, setDeleteConfirmPath, isSaving, activeVersionTimestamp, setActiveVersionTimestamp,
      handleNewTemplate, handleDeleteTemplate, handleRenameSubmit, openFile, saveConfig,
      filteredMainFiles, availableTemplates
   };
}
