import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { useLexicon } from '../../LexiconContext';
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs';

export function parseIniConfig(content: string) {
   const obj: any = {};
   const lines = (content || "").split('\n');
   for (const line of lines) {
      const match = line.match(/^\s*([^#;=\s]+)\s*=\s*(.*)/);
      if (match) {
         const key = match[1];
         let val: any = match[2].trim();
         if (val.toLowerCase() === 'true') val = true;
         else if (val.toLowerCase() === 'false') val = false;
         else if (!isNaN(Number(val)) && val !== '') val = Number(val);
         if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"') && val.length > 1) {
            val = val.substring(1, val.length - 1);
         }
         obj[key] = val;
      }
   }
   return obj;
}

export function parseConfigContent(content: string, fileName?: string): any {
   const trimmed = content ? content.trim() : '';
   const isJson =
      Boolean(fileName && fileName.toLowerCase().endsWith('.json')) ||
      Boolean(trimmed && (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.endsWith('}') || trimmed.startsWith('"')));
   if (isJson) {
      try {
         const sanitized = content.replace(/,\s*([\]}])/g, '$1');
         return JSON.parse(sanitized);
      } catch {
         return null;
      }
   }
   return parseIniConfig(content || '');
}

export function useWorkbenchEditor() {
   const parseIni = parseIniConfig;

   const stringifyIni = (data: any, originalContent: string) => {
      const lines = originalContent.split('\n');
      const updatedKeys = new Set<string>();
      const newLines = [];
      
      for (const line of lines) {
         const match = line.match(/^(\s*)([^#;=\s]+)(\s*=\s*)(.*)/);
         if (match) {
            const key = match[2];
            if (data[key] !== undefined) {
               let val = data[key];
               if (typeof val === 'string' && match[4].startsWith('"') && match[4].endsWith('"')) {
                  val = `"${val}"`;
               }
               newLines.push(`${match[1]}${key}${match[3]}${val}`);
               updatedKeys.add(key);
            } else {
               newLines.push(line);
            }
         } else {
            newLines.push(line);
         }
      }
      
      for (const key of Object.keys(data)) {
         if (!updatedKeys.has(key)) {
            newLines.push(`${key}=${data[key]}`);
         }
      }
      return newLines.join('\n');
   };
   const { t } = useLexicon();
   const pushStatus = useStore(state => state.pushStatus);
   const vaultPath = useStore(state => state.vaultPath);
   const selectedFile = useStore(state => state.cwSelectedFile);
   const setUnsavedEdits = useStore(state => state.setCwUnsavedEdits);

   const [rawText, setRawText] = useState("");
   const [parsedData, setParsedData] = useState<any>(null);
   const [savedRawText, setSavedRawText] = useState("");
   const [savedParsedData, setSavedParsedData] = useState<any>(null);
   const [problemsList, setProblemsList] = useState<any[]>([]);
   const [targetFileContent, setTargetFileContent] = useState<string>("");
   const [editorRef, setEditorRef] = useState<any>(null);
   const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

   const savedRawTextRef = useRef("");
   const savedParsedDataRef = useRef<any>(null);
   const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const rawUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const monacoDecorationsRef = useRef<string[]>([]);
   const skipNextValidateRef = useRef<boolean>(false);
   const isJumping = useRef(0);

   const isTemplateMode = selectedFile?.name.toLowerCase().endsWith('.json');

   const syncSavedBaseline = useCallback((content: string, fileNameOverride?: string) => {
      const fName = fileNameOverride || selectedFile?.name;
      savedRawTextRef.current = content;
      setSavedRawText(content);
      const parsed = parseConfigContent(content, fName);
      savedParsedDataRef.current = parsed;
      setSavedParsedData(parsed);
   }, [selectedFile?.name]);

   useEffect(() => {
      if (selectedFile) {
         const loadFile = async () => {
            const unsaved = useStore.getState().cwUnsavedEdits;
            let diskContent = '';
            try {
               diskContent = await readTextFile(selectedFile.path);
            } catch (e) {
               if (unsaved[selectedFile.path] === undefined) {
                  pushStatus(t("alert_error", "Error reading file"), "error");
                  return;
               }
            }
            savedRawTextRef.current = diskContent;
            setSavedRawText(diskContent);
            const diskParsed = parseConfigContent(diskContent, selectedFile.name);
            savedParsedDataRef.current = diskParsed;
            setSavedParsedData(diskParsed);

            const currentContent = unsaved[selectedFile.path] !== undefined ? unsaved[selectedFile.path] : diskContent;
            setRawText(currentContent);
            const trimmedContent = currentContent ? currentContent.trim() : '';
            const isJson = selectedFile.name.toLowerCase().endsWith('.json') || (trimmedContent && (trimmedContent.startsWith('{') || trimmedContent.startsWith('[') || trimmedContent.endsWith('}') || trimmedContent.startsWith('"')));
            if (isJson) {
               try {
                  const sanitizedContent = currentContent.replace(/,\s*([\]}])/g, '$1');
                  setParsedData(JSON.parse(sanitizedContent));
                  setProblemsList([]);
               } catch (e: any) {
                  setParsedData(null);
                  let line = 1;
                  let col = 1;
                  const match = e.message.match(/at position (\d+)/);
                  if (match) {
                     const pos = parseInt(match[1], 10);
                     const upToError = currentContent.substring(0, pos);
                     const lines = upToError.split('\n');
                     line = lines.length;
                     col = lines[lines.length - 1].length + 1;
                  }
                  setProblemsList([{ line, column: col, message: e.message }]);
               }
            } else {
               setParsedData(parseIni(currentContent));
               setProblemsList([]);
            }
         };
         loadFile();
      }
   }, [selectedFile, pushStatus, t]);

   const validateContent = useCallback((text: string, monaco: any, model: any) => {
      let problems: any[] = [];
      let markers: any[] = [];
      
      const trimmedText = text ? text.trim() : '';
      const isJson = selectedFile?.name.toLowerCase().endsWith('.json') || (trimmedText && (trimmedText.startsWith('{') || trimmedText.startsWith('[') || trimmedText.endsWith('}') || trimmedText.startsWith('"')));

      if (isJson) {
         try {
            const sanitizedText = text.replace(/,\s*([\]}])/g, '$1');
            const parsed = JSON.parse(sanitizedText);
            setParsedData(parsed);
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
      } else {
         setParsedData(parseIni(text));
      }
      if (model && monaco) {
         monaco.editor.setModelMarkers(model, 'owner', markers);
      }
      setProblemsList(problems);
   }, [selectedFile]);

   useEffect(() => {
      if (rawText === undefined) return;
      if (skipNextValidateRef.current) {
         skipNextValidateRef.current = false;
         return;
      }
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

   const handleRawChange = useCallback((value: string | undefined, syncMonaco = false, preParsedData?: any) => {
      if (value === undefined) return;
      if (preParsedData !== undefined) {
         skipNextValidateRef.current = true;
         setParsedData(preParsedData);
         setProblemsList([]);
      }
      setRawText(value);
      if (syncMonaco && editorRef && editorRef.getModel()) {
         const model = editorRef.getModel();
         if (value !== model.getValue()) {
            editorRef.executeEdits("template-builder", [{
               range: model.getFullModelRange(),
               text: value,
               forceMoveMarkers: true
            }]);
         }
      }
      if (selectedFile) {
         setUnsavedEdits(prev => ({ ...prev, [selectedFile.path]: value }));
      }
      if (preParsedData !== undefined) return;

      const trimmedValue = value ? value.trim() : '';
      const isJson = selectedFile?.name.toLowerCase().endsWith('.json') || (trimmedValue && (trimmedValue.startsWith('{') || trimmedValue.startsWith('[') || trimmedValue.endsWith('}') || trimmedValue.startsWith('"')));

      if (isJson) {
         try {
            const sanitizedText = value.replace(/,\s*([\]}])/g, '$1');
            setParsedData(JSON.parse(sanitizedText));
         } catch (e) {
            // Keep old parsed data if invalid JSON so visual editor doesn't crash while typing
         }
      } else if (selectedFile) {
         setParsedData(parseIni(value));
      }
   }, [selectedFile, setUnsavedEdits, editorRef]);

   const handleInsertSnippet = useCallback((snippet: string) => {
      const appendToParsed = () => {
         try {
            const parsed = JSON.parse(rawText || '{}');
            if (!parsed.settings || !Array.isArray(parsed.settings)) parsed.settings = [];
            parsed.settings.push(JSON.parse(snippet));
            handleRawChange(JSON.stringify(parsed, null, 2), true);
            return true;
         } catch (e) {
            return false;
         }
      };

      if (editorRef) {
         const position = editorRef.getPosition() || { lineNumber: 1, column: 1 };
         if (position.lineNumber === 1 && position.column === 1) {
            if (appendToParsed()) return;
            pushStatus(t("err_no_focus", "Click inside the editor first"), "warning");
            return;
         }
         editorRef.executeEdits("insert-snippet", [{
            range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
            text: snippet,
            forceMoveMarkers: true
         }]);
         editorRef.focus();
      } else {
         appendToParsed();
      }
   }, [editorRef, rawText, handleRawChange, pushStatus, t]);

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
            let newRaw = "";
            let currentModelRaw = "";
            if (editorRef && editorRef.getModel()) {
               currentModelRaw = editorRef.getModel().getValue();
            }
            if (!currentModelRaw) currentModelRaw = useStore.getState().cwUnsavedEdits[sf.path] || "";
            
            const trimmedModelRaw = currentModelRaw ? currentModelRaw.trim() : '';
            const isJson = sf.name.toLowerCase().endsWith('.json') || (trimmedModelRaw && (trimmedModelRaw.startsWith('{') || trimmedModelRaw.startsWith('[') || trimmedModelRaw.endsWith('}') || trimmedModelRaw.startsWith('"')));

            if (isJson) {
               newRaw = JSON.stringify(newData, null, 2);
            } else {
               newRaw = stringifyIni(newData, currentModelRaw);
            }
            
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

   const handleUndoSettingToSaved = useCallback((dataPath: string) => {
      if (savedParsedDataRef.current && dataPath in savedParsedDataRef.current) {
         handleVisualChange(dataPath, savedParsedDataRef.current[dataPath]);
      }
   }, [handleVisualChange]);

   const handleUndoAllUnsaved = useCallback(() => {
      const sf = selectedFile || useStore.getState().cwSelectedFile;
      if (!sf) return;
      const baseline = savedRawTextRef.current;
      handleRawChange(baseline, true);
      useStore.getState().setCwUnsavedEdits(prev => {
         const next = { ...prev };
         delete next[sf.path];
         return next;
      });
      pushStatus(t("cw_reverted_to_saved", "Reverted all unsaved edits to last saved state"), "info");
   }, [selectedFile, handleRawChange, pushStatus, t]);

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
         pushStatus(t("err_select_target_first", "Select a target file first"), "error");
         return;
      }
      
      const content = targetFileContent;
      
      if (!content || content.includes('// Target file not found locally')) {
         pushStatus(t("err_no_content_to_map", "Target file content not found locally"), "error");
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
         
         const formatKeyLabel = (rawKey: string) =>
            rawKey
               .replace(/_/g, ' ')
               .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
               .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
               .replace(/\s+/g, ' ')
               .trim();

         const isTupleString = (v: any): boolean =>
            typeof v === 'string' && /^\s*-?\d+(?:\.\d+)?\s*(?:,\s*-?\d+(?:\.\d+)?\s*)+$/.test(v);

         const applyNumericTupleBounds = (settingObj: any, rawTupleStr: string) => {
            const nums = rawTupleStr
               .split(',')
               .map((s) => parseFloat(s.trim()))
               .filter((n) => !isNaN(n));
            const hasNegative = nums.some((n) => n < 0);
            const maxAbs = Math.max(100, ...nums.map((n) => Math.ceil(Math.abs(n))));
            settingObj.min = hasNegative ? -maxAbs : Math.min(0, ...nums);
            settingObj.max = maxAbs;
            settingObj.step = 1;
            settingObj.allow_decimals = nums.some((n) => !Number.isInteger(n));
         };

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
                  } else if (isTupleString(val)) {
                     type = "tuple";
                  } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                     type = "group";
                     defaultVal = undefined;
                     childSettings = buildSettingsRecursively(val, currentPath);
                  }
                  
                  const newSetting: any = {
                     key: key,
                     path: currentPath,
                     type: type,
                     label_key: formatKeyLabel(key),
                     desc_key: "",
                     category: defaultCategory
                  };
                  
                  if (type !== 'group') {
                     newSetting.default = defaultVal;
                  } else {
                     newSetting.settings = childSettings;
                  }
                  
                  if (type === 'number') {
                     const numDef = typeof defaultVal === 'number' ? defaultVal : 0;
                     newSetting.min = numDef < 0 ? Math.min(-100, Math.floor(numDef * 2)) : 0;
                     newSetting.max = Math.max(100, Math.ceil(Math.abs(numDef) * 2));
                     newSetting.step = 1;
                     newSetting.allow_decimals = !Number.isInteger(numDef);
                  } else if (type === 'tuple') {
                     applyNumericTupleBounds(newSetting, String(defaultVal));
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
               } else if (genSet.type === 'tuple' && existing.type !== 'tuple') {
                  existing.type = 'tuple';
                  existing.min = genSet.min;
                  existing.max = genSet.max;
                  existing.step = genSet.step;
                  existing.allow_decimals = genSet.allow_decimals;
                  addedCount++;
               }
            }
         } else {
            const lines = content.split('\n');
            for (const line of lines) {
               const match = line.match(/^([a-zA-Z0-9_]+)\s*=(.*)/);
               if (match && match[1]) {
                  const key = match[1];
                  let valStr = match[2].trim();
                  if (valStr.startsWith('"') && valStr.endsWith('"') && valStr.length > 1) {
                     valStr = valStr.substring(1, valStr.length - 1);
                  }
                  
                  let type = "string";
                  let defVal: any = valStr;
                  const keyLower = key.toLowerCase();
                  const isKeybindingGuess = keyLower.includes('key') || keyLower.includes('bind') || keyLower.includes('button');
                  
                  if (isKeybindingGuess) {
                     type = "keybinding";
                     if (!isNaN(Number(valStr)) && valStr !== "") {
                        defVal = Number(valStr);
                     }
                  } else if (valStr.toLowerCase() === 'true' || valStr.toLowerCase() === 'false') {
                     type = "boolean";
                     defVal = valStr.toLowerCase() === 'true';
                  } else if (isTupleString(valStr)) {
                     type = "tuple";
                     defVal = valStr;
                  } else if (!isNaN(Number(valStr)) && valStr !== "") {
                     type = "number";
                     defVal = Number(valStr);
                  }
                  
                  keyData.push({ key, type, default: defVal });
               }
            }
            
            if (keyData.length === 0 && !isJson) {
               pushStatus(t("err_no_keys_found", "No mappable keys found"), "info");
               return;
            }

            for (const item of keyData) {
               if (!newParsedData.settings.find((s: any) => s.key === item.key || s.path === item.key)) {
                  const newSetting: any = {
                     key: item.key,
                     path: item.key,
                     type: item.type,
                     label_key: formatKeyLabel(item.key),
                     desc_key: "",
                     category: newParsedData.categories[0]?.id || "general"
                  };
                  
                  newSetting.default = item.default;
                  if (item.type === 'number') {
                     const numDef = typeof item.default === 'number' ? item.default : 0;
                     newSetting.min = numDef < 0 ? Math.min(-100, Math.floor(numDef * 2)) : 0;
                     newSetting.max = Math.max(100, Math.ceil(Math.abs(numDef) * 2));
                     newSetting.step = 1;
                     newSetting.allow_decimals = !Number.isInteger(numDef);
                  } else if (item.type === 'tuple') {
                     applyNumericTupleBounds(newSetting, String(item.default));
                  }
                  if (item.type === 'keybinding') {
                     newSetting.key_format = typeof item.default === 'number' ? 'keycode' : 'literal';
                     newSetting.allow_multiple = false;
                  }
                  
                  newParsedData.settings.push(newSetting);
                  addedCount++;
               }
            }
         }
         
         if (addedCount > 0) {
            handleRawChange(JSON.stringify(newParsedData, null, 2), true, newParsedData);
            pushStatus(`${t("success_auto_map", "Auto-mapped")}: ${addedCount}`, "success");
         } else {
            pushStatus(t("info_all_mapped", "All keys are already mapped"), "info");
         }
      } catch (e) {
         pushStatus(t("err_auto_map", "Failed to auto-map keys"), "error");
      }
   }, [parsedData, targetFileContent, rawText, pushStatus, t, handleRawChange]);

   return {
      rawText, setRawText,
      parsedData, setParsedData,
      savedRawText, savedParsedData,
      savedRawTextRef, savedParsedDataRef,
      syncSavedBaseline,
      problemsList, setProblemsList,
      targetFileContent, setTargetFileContent,
      editorRef, setEditorRef,
      highlightedKey, triggerHighlight,
      handleRawChange, handleInsertSnippet, handleAutoMap, handleVisualChange,
      handleUndoSettingToSaved, handleUndoAllUnsaved,
      isJumping
   };
}
