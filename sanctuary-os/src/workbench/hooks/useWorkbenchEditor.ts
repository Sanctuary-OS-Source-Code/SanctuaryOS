import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { useLexicon } from '../../LexiconContext';
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs';
import { listen } from '@tauri-apps/api/event';
import {
   isSanctuaryTemplateFile,
   parseSectionedIni,
   parseStructuredConfig,
   stringifyStructuredConfig,
   readDataPathValue,
   writeDataPathValue
} from '../workbenchFormatUtils';

export function parseIniConfig(content: string) {
   return parseSectionedIni(content || '').data;
}

export function parseConfigContent(content: string, fileName?: string): any {
   return parseStructuredConfig(content || '', fileName).data;
}

export function useWorkbenchEditor() {
   const { t } = useLexicon();
   const pushStatus = useStore(state => state.pushStatus);
   const vaultPath = useStore(state => state.vaultPath);
   const modsPath = useStore(state => state.modsPath);
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

   const isTemplateMode = isSanctuaryTemplateFile(selectedFile, parsedData);

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
            const structured = parseStructuredConfig(currentContent, selectedFile.name);
            setParsedData(structured.data);
            setProblemsList(structured.problems);
         };
         loadFile();
      }
   }, [selectedFile, pushStatus, t]);

   useEffect(() => {
      if (!selectedFile) return;
      let unlisten: (() => void) | undefined;
      listen<{ path: string; file_name: string; timestamp: number; source: string }>(
         "workbench_config_intercepted",
         async (event) => {
            const payload = event.payload;
            if (!payload) return;
            const normSelected = selectedFile.path.replace(/\\/g, '/').toLowerCase();
            const normPayload = (payload.path || '').replace(/\\/g, '/').toLowerCase();
            const matchesFile =
               normSelected === normPayload ||
               selectedFile.name.toLowerCase() === (payload.file_name || '').toLowerCase();
            if (!matchesFile) return;

            try {
               const diskContent = await readTextFile(selectedFile.path);
               savedRawTextRef.current = diskContent;
               setSavedRawText(diskContent);
               const diskParsed = parseConfigContent(diskContent, selectedFile.name);
               savedParsedDataRef.current = diskParsed;
               setSavedParsedData(diskParsed);

               const unsaved = useStore.getState().cwUnsavedEdits;
               if (unsaved[selectedFile.path] === undefined) {
                  setRawText(diskContent);
                  setParsedData(diskParsed);
                  if (editorRef && editorRef.getModel()) {
                     const model = editorRef.getModel();
                     if (diskContent !== model.getValue()) {
                        editorRef.executeEdits("in-game-intercept", [{
                           range: model.getFullModelRange(),
                           text: diskContent,
                           forceMoveMarkers: true
                        }]);
                     }
                  }
               }
            } catch {
               // Ignore transient read errors while game flushes
            }
         }
      ).then((fn) => {
         unlisten = fn;
      }).catch(() => {});
      return () => {
         if (unlisten) unlisten();
      };
   }, [selectedFile, editorRef]);

   const validateContent = useCallback((text: string, monaco: any, model: any) => {
      const structured = parseStructuredConfig(text, selectedFile?.name);
      if (structured.data !== null) {
         setParsedData(structured.data);
      }
      const problems = structured.problems;
      const markers: any[] = [];
      if (monaco && problems.length > 0) {
         for (const p of problems) {
            markers.push({
               startLineNumber: p.line,
               startColumn: p.column,
               endLineNumber: p.line,
               endColumn: p.column + 1,
               message: p.message,
               severity: monaco.MarkerSeverity.Error
            });
         }
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
         const actualKey = highlightedKey.replace(/@ts:\d+$/, '');
         const rawLeaf = actualKey.includes('::') ? actualKey.split('::').pop() || actualKey : (actualKey.split('.').pop() || actualKey);
         const searchKey = rawLeaf.replace(/^@/, '');
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

      const structured = parseStructuredConfig(value, selectedFile?.name);
      if (structured.data !== null) {
         setParsedData(structured.data);
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
      setHighlightedKey(`${key}@ts:${Date.now()}`);
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
         writeDataPathValue(newData, dataPath, value);

         if (rawUpdateTimeoutRef.current) clearTimeout(rawUpdateTimeoutRef.current);
         rawUpdateTimeoutRef.current = setTimeout(() => {
            let currentModelRaw = "";
            if (editorRef && editorRef.getModel()) {
               currentModelRaw = editorRef.getModel().getValue();
            }
            if (!currentModelRaw) currentModelRaw = useStore.getState().cwUnsavedEdits[sf.path] || savedRawTextRef.current || "";

            const newRaw = stringifyStructuredConfig(newData, currentModelRaw, sf.name);

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
                  const rawLeaf = dataPath.includes('::') ? dataPath.split('::').pop() || dataPath : (dataPath.split('.').pop() || dataPath);
                  const searchKey = rawLeaf.replace(/^@/, '');
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
      if (savedParsedDataRef.current) {
         const savedVal = readDataPathValue(savedParsedDataRef.current, dataPath);
         if (savedVal !== undefined) {
            handleVisualChange(dataPath, savedVal);
         }
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
         if (isTemplateMode && selectedFile && parsedData?.target_file) {
            try {
               const targetName = parsedData.target_file;
               let targetPath = "";
               const candidateRoots = [modsPath, vaultPath].filter((p): p is string => Boolean(p && p.trim()));

               for (const rootDir of candidateRoots) {
                  if (!(await exists(rootDir))) continue;
                  const sep = rootDir.includes('\\') ? '\\' : '/';
                  const trimmedRoot = rootDir.endsWith(sep) ? rootDir.slice(0, -1) : rootDir;
                  const directCandidate = `${trimmedRoot}${sep}${targetName}`;
                  if (await exists(directCandidate)) {
                     targetPath = directCandidate;
                     break;
                  }
                  const entries = await readDir(trimmedRoot);
                  for (const entry of entries) {
                     if (entry.isDirectory) {
                        const subCandidate = `${trimmedRoot}${sep}${entry.name}${sep}${targetName}`;
                        if (await exists(subCandidate)) {
                           targetPath = subCandidate;
                           break;
                        }
                     }
                  }
                  if (targetPath) break;
               }

               if (!targetPath) {
                  const sep = selectedFile.path.includes('\\') ? '\\' : '/';
                  const dir = selectedFile.path.substring(0, selectedFile.path.lastIndexOf(sep));
                  const fallbackPath = `${dir}${sep}${targetName}`;
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
   }, [isTemplateMode, selectedFile, parsedData?.target_file, vaultPath, modsPath]);

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
         const structuredTarget = parseStructuredConfig(content, parsedData.target_file);
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
               .replace(/^@/, '')
               .replace(/_/g, ' ')
               .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
               .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
               .replace(/\s+/g, ' ')
               .trim();

         const isTupleString = (v: any): boolean =>
            typeof v === 'string' && /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(v);

         const isTupleArray = (v: any): boolean =>
            Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';

         const applyNumericTupleBounds = (settingObj: any, rawTupleVal: any) => {
            const nums = Array.isArray(rawTupleVal)
               ? rawTupleVal.map((n) => Number(n)).filter((n) => !isNaN(n))
               : String(rawTupleVal)
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

         const ensureCategoryForSection = (sectionName: string): string => {
            const cleanId = sectionName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            if (!cleanId) return newParsedData.categories[0]?.id || "general";
            const existing = newParsedData.categories.find((c: any) => String(c.id).toLowerCase() === cleanId);
            if (existing) return existing.id;
            newParsedData.categories.push({
               id: cleanId,
               name_key: formatKeyLabel(sectionName),
               icon_key: "tune"
            });
            return cleanId;
         };

         const inferCategoryFromKey = (rawKey: string, cats: any[], fallbackCat: string): string => {
            if (!Array.isArray(cats) || cats.length === 0) return fallbackCat;
            const prefixMatch = rawKey.match(/^([A-Za-z]+)_/);
            if (prefixMatch) {
               const pref = prefixMatch[1].toLowerCase();
               const direct = cats.find((c: any) => String(c.id).toLowerCase() === pref);
               if (direct) return direct.id;
            }
            return fallbackCat;
         };

         if (structuredTarget.format === 'ini') {
            const iniObj = structuredTarget.data || {};
            const entries = Object.entries(iniObj);
            if (entries.length === 0) {
               pushStatus(t("err_no_keys_found", "No mappable keys found"), "info");
               return;
            }

            for (const [compositePath, defValRaw] of entries) {
               const hasSection = compositePath.includes('::');
               const sectionName = hasSection ? compositePath.slice(0, compositePath.indexOf('::')) : '';
               const rawKey = hasSection ? compositePath.slice(compositePath.indexOf('::') + 2) : compositePath;

               if (newParsedData.settings.find((s: any) => s.path === compositePath || (!hasSection && s.key === rawKey))) {
                  continue;
               }

               let type = "string";
               let defVal: any = defValRaw;
               const keyLower = rawKey.toLowerCase();
               const isKeybindingGuess = keyLower.includes('key') || keyLower.includes('bind') || keyLower.includes('button');

               if (isKeybindingGuess && typeof defValRaw !== 'boolean') {
                  type = "keybinding";
               } else if (typeof defValRaw === 'boolean') {
                  type = "boolean";
               } else if (isTupleString(defValRaw) || isTupleArray(defValRaw)) {
                  type = "tuple";
               } else if (typeof defValRaw === 'number') {
                  type = "number";
               }

               const resolvedCategory = sectionName
                  ? ensureCategoryForSection(sectionName)
                  : inferCategoryFromKey(rawKey, newParsedData.categories, newParsedData.categories[0]?.id || "general");

               const newSetting: any = {
                  key: rawKey,
                  path: compositePath,
                  type,
                  label_key: formatKeyLabel(rawKey),
                  desc_key: "",
                  category: resolvedCategory,
                  default: defVal
               };

               if (type === 'number') {
                  const numDef = typeof defVal === 'number' ? defVal : 0;
                  newSetting.min = numDef < 0 ? Math.min(-100, Math.floor(numDef * 2)) : 0;
                  newSetting.max = Math.max(100, Math.ceil(Math.abs(numDef) * 2));
                  newSetting.step = 1;
                  newSetting.allow_decimals = !Number.isInteger(numDef);
               } else if (type === 'tuple') {
                  applyNumericTupleBounds(newSetting, defVal);
               } else if (type === 'keybinding') {
                  newSetting.key_format = typeof defVal === 'number' ? 'keycode' : 'literal';
                  newSetting.allow_multiple = false;
               }

               newParsedData.settings.push(newSetting);
               addedCount++;
            }
         } else if (structuredTarget.data && typeof structuredTarget.data === 'object') {
            const defaultCategory = newParsedData.categories[0]?.id || "general";

            const buildSettingsRecursively = (obj: any, parentPath: string, inheritedCategory?: string): any[] => {
               const settings: any[] = [];
               for (const key of Object.keys(obj)) {
                  const val = obj[key];
                  const currentPath = parentPath ? `${parentPath}.${key}` : key;
                  const resolvedCategory = inheritedCategory || inferCategoryFromKey(key, newParsedData.categories, defaultCategory);

                  let type = "string";
                  let defaultVal = val;
                  let childSettings: any[] = [];

                  if (typeof val === 'boolean') {
                     type = "boolean";
                  } else if (typeof val === 'number') {
                     type = "number";
                  } else if (isTupleString(val) || isTupleArray(val)) {
                     type = "tuple";
                  } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                     type = "group";
                     defaultVal = undefined;
                     childSettings = buildSettingsRecursively(val, currentPath, resolvedCategory);
                  }

                  const newSetting: any = {
                     key: key,
                     path: currentPath,
                     type: type,
                     label_key: formatKeyLabel(key),
                     desc_key: "",
                     category: resolvedCategory
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
                     applyNumericTupleBounds(newSetting, defaultVal);
                  }

                  settings.push(newSetting);
               }
               return settings;
            };

            const generatedSettings = buildSettingsRecursively(structuredTarget.data, "");

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
            pushStatus(t("err_no_keys_found", "No mappable keys found"), "info");
            return;
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
