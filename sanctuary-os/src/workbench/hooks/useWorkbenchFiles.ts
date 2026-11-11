import { useState, useEffect, useCallback } from 'react';
import { readTextFile, writeTextFile, mkdir, exists, remove } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../../store';
import { supabaseServices } from '../../lib/supabase-services';
import { useLexicon } from '../../LexiconContext';
import {
   isSanctuaryTemplateFile,
   isSanctuaryTemplateFileName,
   isSanctuaryTemplateObject,
   stripJsonCommentsAndTrailingCommas
} from '../workbenchFormatUtils';

import workbenchTemplates from '../../data/workbench_templates.json';

interface UseWorkbenchFilesProps {
   mainTab: string;
   mainSearchQuery: string;
}

export interface WorkbenchFileItem {
   name: string;
   path: string;
   isTemplate?: boolean;
}

export function useWorkbenchFiles({ mainTab, mainSearchQuery }: UseWorkbenchFilesProps) {
   const { t } = useLexicon();
   const vaultPath = useStore(state => state.vaultPath);
   const modsPath = useStore(state => state.modsPath);
   const activeGameSchema = useStore(state => state.activeGameSchema);
   const pushStatus = useStore(state => state.pushStatus);
   const selectedFile = useStore(state => state.cwSelectedFile);
   const setSelectedFile = useStore(state => state.setCwSelectedFile);
   const communityDefaultsRefreshTrigger = useStore(state => state.communityDefaultsRefreshTrigger);
   const setUnsavedEdits = useStore(state => state.setCwUnsavedEdits);

   const [files, setFiles] = useState<WorkbenchFileItem[]>([]);
   const [communityDefaults, setCommunityDefaults] = useState<any[]>([]);
   const [refreshTrigger, setRefreshTrigger] = useState(0);
   const [renamingFile, setRenamingFile] = useState<string | null>(null);
   const [renameInput, setRenameInput] = useState<string>("");
   const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
   const [isSaving, setIsSaving] = useState(false);
   const [activeVersionTimestamp, setActiveVersionTimestamp] = useState<number | null>(null);
   const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);

   const filteredMainFiles = files.filter(f => {
      const isTmpl = isSanctuaryTemplateFile(f);
      if (mainTab === "CONFIGS" && isTmpl) return false;
      if (mainTab === "TEMPLATES" && !isTmpl) return false;
      if (mainSearchQuery && !f.name.toLowerCase().includes(mainSearchQuery.toLowerCase())) return false;
      return true;
   });

   const isTemplateMode = isSanctuaryTemplateFile(selectedFile);

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
         if (!vaultPath && !modsPath) return;
         try {
            const targetCheckPath = vaultPath || modsPath;
            if (!targetCheckPath || !(await exists(targetCheckPath))) return;

            let validFiles: WorkbenchFileItem[] = [];
            try {
               const results: string[] = await invoke("get_workbench_files", {
                  vaultPath: vaultPath || "",
                  modsPath: modsPath || "",
                  gameSchema: activeGameSchema
               });
               const unsavedSnapshot = useStore.getState().cwUnsavedEdits || {};
               validFiles = await Promise.all(
                  results.map(async (r) => {
                     const sep = r.includes('\\') ? '\\' : '/';
                     const parts = r.split(sep);
                     const name = parts[parts.length - 1];
                     if (isSanctuaryTemplateFileName(name)) {
                        return { name, path: r, isTemplate: true };
                     }
                     if (name.toLowerCase().endsWith('.json')) {
                        try {
                           const rawContent = unsavedSnapshot[r] !== undefined
                              ? unsavedSnapshot[r]
                              : await readTextFile(r);
                           const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(rawContent));
                           if (isSanctuaryTemplateObject(parsed)) {
                              return { name, path: r, isTemplate: true };
                           }
                        } catch {
                           // Standard or malformed JSON config -> classify under CONFIGS
                        }
                     }
                     return { name, path: r, isTemplate: false };
                  })
               );
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
   }, [vaultPath, modsPath, activeGameSchema, refreshTrigger]);

   useEffect(() => {
      let unlisten: (() => void) | undefined;
      listen<{ path: string; file_name: string; timestamp: number; source: string }>(
         "workbench_config_intercepted",
         (event) => {
            setRefreshTrigger(prev => prev + 1);
            const fname = event.payload?.file_name || "";
            if (fname) {
               pushStatus(
                  `${t("cw_in_game_intercept_toast", "In-Game Engine Edit captured in Timeline:")} ${fname}`,
                  "info"
               );
            }
         }
      ).then((fn) => {
         unlisten = fn;
      }).catch(() => {});
      return () => {
         if (unlisten) unlisten();
      };
   }, [pushStatus, t]);

   useEffect(() => {
      if (selectedFile && files.length > 0) {
         const loadMatchingTemplates = async () => {
            const matches: any[] = [];

            const rawBuiltIn = (workbenchTemplates as any)?.templates || (workbenchTemplates as any)?.default || workbenchTemplates;
            const templatesArray = Array.isArray(rawBuiltIn)
               ? rawBuiltIn
               : rawBuiltIn
                  ? [rawBuiltIn]
                  : [];
            const builtInMatch = templatesArray.find((tItem: any) => tItem?.target_file?.toLowerCase() === selectedFile.name.toLowerCase());

            if (communityDefaults && communityDefaults.length > 0) {
               const commTmpl = communityDefaults.find((d: any) => {
                  const tData = Array.isArray(d.template_data) ? d.template_data[0] : d.template_data;
                  const targetFile = tData?.target_file || d.name;
                  return targetFile?.toLowerCase() === selectedFile.name.toLowerCase();
               });
               if (commTmpl) {
                  const rawCommData = Array.isArray(commTmpl.template_data) ? commTmpl.template_data[0] : commTmpl.template_data;
                  const useBuiltInUpgrade = builtInMatch && builtInMatch.template_version === "2.0.0" && rawCommData?.template_version !== "2.0.0";
                  const tData = useBuiltInUpgrade ? builtInMatch : rawCommData;
                  const rawLabel = commTmpl.name || t("template_builtin", "Sanctuary Default");
                  matches.push({
                     id: commTmpl.id,
                     label: rawLabel,
                     data: tData,
                     isCommunity: true,
                     author: commTmpl.author || tData?.template_author || t("label_unknown_author", "Unknown Author"),
                     authorId: commTmpl.author_id
                  });
               }
            }

            if (builtInMatch && matches.length === 0) {
               matches.push({ id: "built_in", label: t("template_builtin", "Sanctuary Default"), data: builtInMatch });
            }

            for (const f of files.filter(f => isSanctuaryTemplateFile(f))) {
               try {
                  const unsaved = useStore.getState().cwUnsavedEdits;
                  let content = '';
                  if (unsaved[f.path] !== undefined) {
                     content = unsaved[f.path];
                  } else {
                     content = await readTextFile(f.path);
                  }

                  const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(content));
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
   }, [selectedFile, files, vaultPath, communityDefaults, t]);

   const handleNewTemplate = async (openAfterCreate = true, targetFileOverride?: string) => {
      if (!vaultPath) return;
      try {
         const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
         const targetFileName = targetFileOverride || (selectedFile && !isTemplateMode ? selectedFile.name : "mod_config.json");
         const baseTargetStem = targetFileOverride
            ? targetFileOverride.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")
            : `TEMPLATE_${shortId}`;
         const newFileName = targetFileOverride
            ? `${baseTargetStem}_${shortId}.sanctuary.template.json`
            : `TEMPLATE_${shortId}.sanctuary.template.json`;
         const sep = vaultPath.includes('\\') ? '\\' : '/';
         const tmplPath = vaultPath.endsWith(sep) ? `${vaultPath}Data${sep}Templates` : `${vaultPath}${sep}Data${sep}Templates`;

         if (!(await exists(tmplPath))) {
            await mkdir(tmplPath, { recursive: true });
         }
         const newFilePath = `${tmplPath}${sep}${newFileName}`;
         const lowerTarget = targetFileName.toLowerCase();
         const inferredParser = lowerTarget.endsWith('.json') || lowerTarget.endsWith('.jsonc')
            ? 'json'
            : lowerTarget.endsWith('.toml')
               ? 'toml'
               : lowerTarget.endsWith('.yaml') || lowerTarget.endsWith('.yml')
                  ? 'yaml'
                  : lowerTarget.endsWith('.xml') || lowerTarget.endsWith('.lsx')
                     ? 'xml'
                     : 'ini';

         const defaultContent = {
            "template_id": "custom_template_" + shortId.toLowerCase(),
            "schema_version": 2,
            "supported_mod_versions": ["1.0.0"],
            "target_file": targetFileName,
            "parser_type": inferredParser,
            "write_scope": "active_mod_folder",
            "mod_author": "Unknown",
            "template_author": "Sanctuary OS Citizen",
            "template_version": "1.0.0",
            "categories": [
               { "id": "general", "name_key": "General", "icon_key": "tune" }
            ],
            "settings": [
               {
                  "key": "My_Boolean_Setting",
                  "path": "My_Boolean_Setting",
                  "type": "boolean",
                  "label_key": "Enable Custom Feature",
                  "desc_key": "Toggle this setting on or off.",
                  "category": "general",
                  "default": false
               },
               {
                  "key": "My_Number_Setting",
                  "path": "My_Number_Setting",
                  "type": "number",
                  "label_key": "Numeric Value",
                  "desc_key": "Adjust the numeric value within the allowed range.",
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
                  "label_key": "Custom Text",
                  "desc_key": "Enter a custom text value.",
                  "category": "general",
                  "default": "Default Text"
               },
               {
                  "key": "My_Dropdown_Setting",
                  "path": "My_Dropdown_Setting",
                  "type": "dropdown",
                  "label_key": "Preset Mode",
                  "desc_key": "Choose from the available preset options.",
                  "category": "general",
                  "options": [
                     { "value": "A", "label_key": "Option A" },
                     { "value": "B", "label_key": "Option B" }
                  ],
                  "default": "A"
               }
            ]
         };
         await writeTextFile(newFilePath, JSON.stringify(defaultContent, null, 2));
         const createdFile: WorkbenchFileItem = { name: newFileName, path: newFilePath, isTemplate: true };
         setFiles(prev => [...prev, createdFile].sort((a, b) => a.name.localeCompare(b.name)));
         setRefreshTrigger(prev => prev + 1);
         pushStatus(t("msg_template_created", "New template created."), "success");
         if (openAfterCreate) {
            setSelectedFile(createdFile);
         }
      } catch (e) {
         console.error("Error creating template", e);
         pushStatus(t("msg_template_create_failed", "Failed to create template."), "error");
      }
   };

   const handleDeleteTemplate = useCallback(async (path: string) => {
      try {
         await remove(path);
         if (useStore.getState().cwSelectedFile?.path === path) useStore.getState().setCwSelectedFile(null);
         setRefreshTrigger(prev => prev + 1);
         useStore.getState().pushStatus(t("msg_template_deleted", "Template deleted."), "success");
      } catch (e) {
         console.error("Error deleting template", e);
         useStore.getState().pushStatus(t("msg_template_delete_failed", "Failed to delete template."), "error");
      }
   }, [t]);

   const handleRenameSubmit = useCallback(async (oldPath: string, oldName: string) => {
      const isSanctuaryTmpl = isSanctuaryTemplateFileName(oldName);
      const ext = isSanctuaryTmpl
         ? '.sanctuary.template.json'
         : (oldName.lastIndexOf('.') > 0 ? oldName.substring(oldName.lastIndexOf('.')) : '.sanctuary.template.json');
      const baseOldName = isSanctuaryTmpl
         ? oldName.slice(0, -'.sanctuary.template.json'.length)
         : (oldName.lastIndexOf('.') > 0 ? oldName.substring(0, oldName.lastIndexOf('.')) : oldName);

      if (!renameInput.trim() || renameInput === baseOldName) {
         setRenamingFile(null);
         return;
      }
      try {
         const trimmedInput = renameInput.trim();
         const newName = trimmedInput.toLowerCase().endsWith(ext.toLowerCase()) ? trimmedInput : trimmedInput + ext;
         const sep = oldPath.includes('\\') ? '\\' : '/';
         const dirPath = oldPath.substring(0, oldPath.lastIndexOf(sep));
         const newPath = `${dirPath}${sep}${newName}`;
         const oldContent = await readTextFile(oldPath);
         await writeTextFile(newPath, oldContent);
         await remove(oldPath);
         if (useStore.getState().cwSelectedFile?.path === oldPath) {
            useStore.getState().setCwSelectedFile({
               name: newName,
               path: newPath,
               isTemplate: useStore.getState().cwSelectedFile?.isTemplate ?? true
            });
         }
         setRenamingFile(null);
         setRefreshTrigger(prev => prev + 1);
         useStore.getState().pushStatus(t("alert_saved", "Saved"), "success");
      } catch (e) {
         console.error("Error renaming template", e);
         useStore.getState().pushStatus(t("alert_error", "Error"), "error");
      }
   }, [renameInput, t]);

   const openFile = useCallback(async (file: WorkbenchFileItem) => {
      try {
         useStore.getState().setCwSelectedFile(file);
         if (!isSanctuaryTemplateFile(file)) {
            useStore.getState().setCwActiveTab("visual");
         }
      } catch (e) {
         useStore.getState().pushStatus(t("alert_error", "Error"), "error");
      }
   }, [t]);

   const saveConfig = async (rawText: string, onSaved?: (savedContent: string) => void) => {
      if (!selectedFile) return false;
      setIsSaving(true);
      try {
         await invoke('save_file_with_history', { path: selectedFile.path, content: rawText });
         setUnsavedEdits(prev => {
            const next = { ...prev };
            delete next[selectedFile.path];
            return next;
         });
         if (onSaved) onSaved(rawText);
         setActiveVersionTimestamp(null);
         setRefreshTrigger(prev => prev + 1);
         pushStatus(t("alert_saved", "Saved"), "success");
         return true;
      } catch (e) {
         pushStatus(t("alert_error", "Error"), "error");
         return false;
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
