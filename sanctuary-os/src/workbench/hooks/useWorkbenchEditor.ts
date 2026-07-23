import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { useLexicon } from '../../LexiconContext';
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs';

export function useWorkbenchEditor() {
   const { t } = useLexicon();
   const pushStatus = useStore(state => state.pushStatus);
   const vaultPath = useStore(state => state.vaultPath);
   const selectedFile = useStore(state => state.cwSelectedFile);
   const setUnsavedEdits = useStore(state => state.setCwUnsavedEdits);

   const [rawText, setRawText] = useState("");
   const [parsedData, setParsedData] = useState<any>(null);
   const [problemsList, setProblemsList] = useState<any[]>([]);
   const [targetFileContent, setTargetFileContent] = useState<string>("");
   const [editorRef, setEditorRef] = useState<any>(null);
   const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

   const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
   const rawUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
   const monacoDecorationsRef = useRef<string[]>([]);
   
   // This jump ref is also used by scroll sync, so we might need to expose it or move it.
   // We'll keep it here since `handleVisualChange` uses it to pause scroll sync.
   const isJumping = useRef(0);

   const isTemplateMode = selectedFile?.name.toLowerCase().endsWith('.json');

   useEffect(() => {
      if (selectedFile) {
         const loadFile = async () => {
            const unsaved = useStore.getState().cwUnsavedEdits;
            let currentContent = '';
            if (unsaved[selectedFile.path] !== undefined) {
               currentContent = unsaved[selectedFile.path];
            } else {
               try {
                  currentContent = await readTextFile(selectedFile.path);
               } catch (e) {
                  pushStatus("Error reading file", "error");
                  return;
               }
            }
            setRawText(currentContent);
            try {
               setParsedData(JSON.parse(currentContent));
            } catch (e) {
               setParsedData(null);
            }
         };
         loadFile();
      }
   }, [selectedFile, pushStatus]);

   const validateContent = useCallback((text: string, monaco: any, model: any) => {
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
   }, [selectedFile]);

   useEffect(() => {
      if (rawText === undefined) return;
      if (editorRef && (window as any).monaco) {
         validateContent(rawText, (window as any).monaco, editorRef.getModel());
      } else {
         validateContent(rawText, null, null);
      }
   }, [rawText, editorRef, validateContent]);

   useEffect(() => {
      if (!editorRef || !(window as any).monaco) return;
      const monaco = (window as any).monaco;
      if (highlightedKey) {
         const actualKey = highlightedKey.split('::')[0];
         const searchKey = actualKey.split('.').pop() || actualKey;
         const model = editorRef.getModel();
         if (model) {
            let matches = model.findMatches(`"${searchKey}"`, false, false, false, null, true, 1);
            if (!matches || matches.length === 0) {
               matches = model.findMatches(`${searchKey}`, false, false, false, null, true, 1);
            }
            if (matches && matches.length > 0) {
               const range = matches[0].range;
               monacoDecorationsRef.current = editorRef.deltaDecorations(monacoDecorationsRef.current, [
                  {
                     range: new monaco.Range(range.startLineNumber, 1, range.startLineNumber, 1),
                     options: {
                        isWholeLine: true,
                        className: 'monaco-highlight-line'
                     }
                  }
               ]);
               return;
            }
         }
      }

      if (monacoDecorationsRef.current.length > 0) {
         monacoDecorationsRef.current = editorRef.deltaDecorations(monacoDecorationsRef.current, []);
      }
   }, [highlightedKey, editorRef]);

   const handleRawChange = useCallback((value: string | undefined) => {
      if (value === undefined) return;
      setRawText(value);
      if (selectedFile) {
         setUnsavedEdits(prev => ({ ...prev, [selectedFile.path]: value }));
      }
      try {
         setParsedData(JSON.parse(value));
      } catch (e) {
         // Keep old parsed data if invalid JSON so visual editor doesn't crash while typing
      }
   }, [selectedFile, setUnsavedEdits]);

   const handleInsertSnippet = useCallback((snippet: string) => {
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
   }, [editorRef, pushStatus, t]);

   const triggerHighlight = useCallback((key: string) => {
      setHighlightedKey(key + "::" + Date.now());
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
         setHighlightedKey(null);
      }, 2000);
   }, []);

   const handleVisualChange = useCallback((dataPath: string, value: any) => {
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
         const currentValue = current[parts[parts.length - 1]];
         const finalValue = typeof value === 'function' ? value(currentValue) : value;
         current[parts[parts.length - 1]] = finalValue;

         if (rawUpdateTimeoutRef.current) clearTimeout(rawUpdateTimeoutRef.current);
         rawUpdateTimeoutRef.current = setTimeout(() => {
            const newRaw = JSON.stringify(newData, null, 2);
            if (editorRef && editorRef.getModel()) {
               const model = editorRef.getModel();
               if (newRaw !== model.getValue()) {
                  editorRef.executeEdits("visual-editor", [{
                     range: model.getFullModelRange(),
                     text: newRaw,
                     forceMoveMarkers: true
                  }]);
               }
            }
            setRawText(newRaw);
            useStore.getState().setCwUnsavedEdits(prevUnsaved => ({ ...prevUnsaved, [sf.path]: newRaw }));
            
            isJumping.current = Date.now() + 1000;
            triggerHighlight(dataPath);
            if (editorRef) {
               const model = editorRef.getModel();
               if (model) {
                  const searchKey = dataPath.split('.').pop() || dataPath;
                  let matches = model.findMatches(`"${searchKey}"`, false, false, false, null, true, 1);
                  if (!matches || matches.length === 0) {
                     matches = model.findMatches(`${searchKey}`, false, false, false, null, true, 1);
                  }
                  if (matches && matches.length > 0) {
                     const lineNumber = matches[0].range.startLineNumber;
                     editorRef.revealLineInCenter(lineNumber);
                  }
               }
            }
         }, 300);

         return newData;
      });
   }, [editorRef, triggerHighlight]);

   useEffect(() => {
      const loadTarget = async () => {
         if (isTemplateMode && selectedFile && parsedData?.target_file && vaultPath) {
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
   }, [isTemplateMode, selectedFile, parsedData?.target_file, vaultPath]);

   const handleAutoMap = useCallback(async () => {
      if (!parsedData || !parsedData.target_file) {
         pushStatus(t("err_select_target_first") || "Please select a Target File first.", "error");
         return;
      }
      
      const content = targetFileContent;
      
      if (!content || content.includes('// Target file not found locally')) {
         pushStatus(t("err_no_content_to_map") || "No content found in Target File pane. Paste your configuration there first.", "error");
         return;
      }

      try {
         let keyData: { key: string, type: string, default: any }[] = [];
         
         let isJson = false;
         let parsed: any = null;
         try {
            parsed = JSON.parse(content);
            isJson = true;
         } catch(e) {}

         let addedCount = 0;
         
         const newParsedData = JSON.parse(rawText || '{}');
         if (!newParsedData.categories) {
            newParsedData.categories = [{ id: "general", name_key: "General", icon_key: "tune" }];
         }
         if (!newParsedData.settings) {
            newParsedData.settings = [];
         }
         
         if (isJson && parsed && typeof parsed === 'object') {
            const defaultCategory = newParsedData.categories[0]?.id || "general";
            
            const buildSettingsRecursively = (obj: any, parentPath: string): any[] => {
               const settings: any[] = [];
               for (const key of Object.keys(obj)) {
                  const val = obj[key];
                  const currentPath = parentPath ? `${parentPath}.${key}` : key;
                  
                  let type = "string";
                  let defaultVal = val;
                  let childSettings: any[] = [];
                  
                  if (typeof val === 'boolean') {
                     type = "boolean";
                  } else if (typeof val === 'number') {
                     type = "number";
                  } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                     type = "group";
                     defaultVal = undefined;
                     childSettings = buildSettingsRecursively(val, currentPath);
                  }
                  
                  const newSetting: any = {
                     key: key,
                     path: currentPath,
                     type: type,
                     label_key: key.replace(/_/g, ' '),
                     desc_key: "",
                     category: defaultCategory
                  };
                  
                  if (type !== 'group') {
                     newSetting.default = defaultVal;
                  } else {
                     newSetting.settings = childSettings;
                  }
                  
                  if (type === 'number') {
                     newSetting.min = 0;
                     newSetting.max = 100;
                     newSetting.allow_decimals = !Number.isInteger(defaultVal);
                  }
                  
                  settings.push(newSetting);
               }
               return settings;
            };

            const generatedSettings = buildSettingsRecursively(parsed, "");
            
            for (const genSet of generatedSettings) {
               const existing = newParsedData.settings.find((s: any) => s.key === genSet.key || s.path === genSet.path);
               if (!existing) {
                  newParsedData.settings.push(genSet);
                  addedCount++;
               } else if (genSet.type === 'group' && (!existing.settings || existing.settings.length === 0) && genSet.settings && genSet.settings.length > 0) {
                  existing.settings = genSet.settings;
                  addedCount++;
               }
            }
         } else {
            // INI Parsing (flat)
            const lines = content.split('\n');
            for (const line of lines) {
               const match = line.match(/^([a-zA-Z0-9_]+)\s*=(.*)/);
               if (match && match[1]) {
                  const key = match[1];
                  const valStr = match[2].trim();
                  let type = "string";
                  let defVal: any = valStr;
                  if (valStr.toLowerCase() === 'true' || valStr.toLowerCase() === 'false') {
                     type = "boolean";
                     defVal = valStr.toLowerCase() === 'true';
                  } else if (!isNaN(Number(valStr)) && valStr !== "") {
                     type = "number";
                     defVal = Number(valStr);
                  }
                  keyData.push({ key, type, default: defVal });
               }
            }
            
            if (keyData.length === 0 && !isJson) {
               pushStatus(t("err_no_keys_found") || "No keys found to auto-map.", "info");
               return;
            }

            for (const item of keyData) {
               if (!newParsedData.settings.find((s: any) => s.key === item.key || s.path === item.key)) {
                  const newSetting: any = {
                     key: item.key,
                     path: item.key,
                     type: item.type,
                     label_key: item.key.replace(/_/g, ' '),
                     desc_key: "",
                     category: newParsedData.categories[0]?.id || "general"
                  };
                  
                  newSetting.default = item.default;
                  if (item.type === 'number') {
                     newSetting.min = 0;
                     newSetting.max = 100;
                     newSetting.allow_decimals = !Number.isInteger(item.default);
                  }
                  
                  newParsedData.settings.push(newSetting);
                  addedCount++;
               }
            }
         }
         
         if (addedCount > 0) {
            handleRawChange(JSON.stringify(newParsedData, null, 2));
            pushStatus(`${t("success_auto_map") || "Auto-mapped"} ${addedCount} keys.`, "success");
         } else {
            pushStatus(t("info_all_mapped") || "All keys are already mapped.", "info");
         }
      } catch (e) {
         pushStatus(t("err_auto_map") || "Failed to auto-map file.", "error");
      }
   }, [parsedData, targetFileContent, rawText, pushStatus, t, handleRawChange]);

   return {
      rawText, setRawText,
      parsedData, setParsedData,
      problemsList, setProblemsList,
      targetFileContent, setTargetFileContent,
      editorRef, setEditorRef,
      highlightedKey, triggerHighlight,
      handleRawChange, handleInsertSnippet, handleAutoMap, handleVisualChange,
      isJumping
   };
}
