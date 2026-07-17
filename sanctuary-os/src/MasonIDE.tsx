import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, SidePanel, CustomDropdown, standardButtonClass, standardGlassButtonClass, standardAccentGlassButtonClass, standardPrimaryButtonClass, EmptyState, HoverTooltip, FilterTabs, FilterTabButton } from "./shared";
import { readDir, readTextFile, writeTextFile, exists, remove, rename } from '@tauri-apps/plugin-fs';
import { open } from "@tauri-apps/plugin-dialog";
import VersionTimeline from './VersionTimeline';
import enDefault from './lexicons/en-default.json';
import { supabase } from "./supabase";
import { MarketUploadPanel } from "./side-panels/NexusSidePanels";

export default function MasonIDE({ vaultPath, isCloudMode }: { vaultPath?: string, isCloudMode?: boolean }) {
   const { t } = useLexicon();
   const session = useStore(state => state.session);
   const pushStatus = useStore(state => state.pushStatus);
   const localOpenFiles = useStore(state => state.ideOpenFiles);
   const setLocalOpenFiles = useStore(state => state.setIdeOpenFiles);
   const localActiveFileIndex = useStore(state => state.ideActiveFileIndex);
   const setLocalActiveFileIndex = useStore(state => state.setIdeActiveFileIndex);

   const cloudOpenFiles = useStore(state => state.cloudIdeOpenFiles);
   const setCloudOpenFiles = useStore(state => state.setCloudIdeOpenFiles);
   const cloudActiveFileIndex = useStore(state => state.cloudIdeActiveFileIndex);
   const setCloudActiveFileIndex = useStore(state => state.setCloudIdeActiveFileIndex);

   const openFiles = isCloudMode ? cloudOpenFiles : localOpenFiles;
   const setOpenFiles = isCloudMode ? setCloudOpenFiles : setLocalOpenFiles;
   const activeFileIndex = isCloudMode ? cloudActiveFileIndex : localActiveFileIndex;
   const setActiveFileIndex = isCloudMode ? setCloudActiveFileIndex : setLocalActiveFileIndex;
   const [files, setFiles] = useState<{ name: string, path: string }[]>([]);
   const [isScanning, setIsScanning] = useState(false);
   const [showTimeline, setShowTimeline] = useState(false);
   const [searchQuery, setSearchQuery] = useState("");
   const [fileTypeFilter, setFileTypeFilter] = useState("all");
   const [problemsList, setProblemsList] = useState<any[]>([]);
   const [activeVersionTimestamp, setActiveVersionTimestamp] = useState<number | null>(null);
   const [editorRef, setEditorRef] = useState<any>(null);

   const [renamingFile, setRenamingFile] = useState<string | null>(null);
   const [renameInput, setRenameInput] = useState("");
   const [renameExt, setRenameExt] = useState("");
   const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
   const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
   const [createMode, setCreateMode] = useState<"standard" | "lexicon">("standard");
   const [lexiconLang, setLexiconLang] = useState("es");
   const [createFileName, setCreateFileName] = useState("");
   const [createFileExt, setCreateFileExt] = useState(".json");
   const [showReference, setShowReference] = useState(false);
   const [splitRatio, setSplitRatio] = useState(50);
   const isResizing = useRef(false);
   const [isFullscreen, setIsFullscreen] = useState(false);

   const [uploadState, setUploadState] = useState({
      isOpen: false,
      editId: null as string | null,
      assetType: 'lexicon',
      isHidden: false,
      fileContent: null as any,
      fileName: '',
      name: '',
      version: '1.0.0',
      description: '',
      releaseNotes: '',
      language: 'English',
      newLanguage: '',
      lexiconType: 'Theme',
      themeMode: 'Dark'
   });

   useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
         if (!isResizing.current) return;
         setSplitRatio((prev) => {
            const containerWidth = window.innerWidth - 300;
            const deltaPct = (e.movementX / containerWidth) * 100;
            return Math.max(20, Math.min(80, prev + deltaPct));
         });
      };
      const handleMouseUp = () => {
         if (isResizing.current) {
            isResizing.current = false;
            document.body.style.cursor = 'default';
         }
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
         window.removeEventListener('mousemove', handleMouseMove);
         window.removeEventListener('mouseup', handleMouseUp);
      };
   }, []);

   const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
   const bgHex = bg.replace('#', '');
   const r = parseInt(bgHex.substring(0, 2), 16) || 0;
   const g = parseInt(bgHex.substring(2, 4), 16) || 0;
   const b = parseInt(bgHex.substring(4, 6), 16) || 0;
   const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
   const isLight = luminance > 0.5;

   const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ea580c';
   const textCol = getComputedStyle(document.body).getPropertyValue('--text').trim() || (isLight ? '#0f172a' : '#f8fafc');

   const fetchFiles = async () => {
      setIsScanning(true);
      try {
         if (isCloudMode) {
            const { supabase } = await import('./supabase');
            const { data, error } = await supabase.from('sanctuary_schemas').select('id');
            if (!error && data) {
               setFiles(data.map(r => ({ name: r.id + ".json", path: "cloud://" + r.id })));
            }
            return;
         }
         if (!vaultPath) return;
         const normalizedVault = vaultPath.replace(/\\/g, '/');
         let baseDir = normalizedVault;
         if (baseDir.toLowerCase().endsWith('/mods')) {
            baseDir = baseDir.substring(0, baseDir.length - 5);
         } else if (baseDir.toLowerCase().endsWith('mods')) {
            baseDir = baseDir.substring(0, baseDir.length - 4);
         }
         const sandboxDir = `${baseDir}/Dev/Sandbox`;

         const dirExists = await exists(sandboxDir);
         if (!dirExists) {
            setFiles([]);
            return;
         }

         const entries = await readDir(sandboxDir);
         const foundFiles: { name: string, path: string }[] = [];
         for (const entry of entries) {
            if (!entry.isDirectory && entry.name) {
               const n = entry.name.toLowerCase();
               if (n.endsWith('.json') || n.endsWith('.cfg') || n.endsWith('.ini') || n.endsWith('.js') || n.endsWith('.ts') || n.endsWith('.xml') || n.endsWith('.txt') || n.endsWith('.md')) {
                  foundFiles.push({ name: entry.name, path: `${sandboxDir}/${entry.name}` });
               }
            }
         }

         foundFiles.sort((a, b) => a.name.localeCompare(b.name));
         setFiles(foundFiles);
      } catch (e) {
         console.error("Error reading sandbox:", e);
      } finally {
         setIsScanning(false);
      }
   };

   useEffect(() => {
      fetchFiles();
   }, [vaultPath]);

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
            'editorWidget.background': '#151515f2',
            'editorWidget.border': '#00000000',
            'editorWidget.foreground': textCol,
            'input.background': '#00000000',
            'input.foreground': textCol,
            'inputOption.activeBorder': '#00000000',
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
            'editorWidget.background': '#f8fafcf2',
            'editorWidget.border': '#00000000',
            'editorWidget.foreground': textCol,
            'input.background': '#00000000',
            'input.foreground': textCol,
            'inputOption.activeBorder': '#00000000',
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

   const validateContent = (text: string, monaco: any, model: any) => {
      let problems: any[] = [];
      let markers: any[] = [];
      const activeFile = openFiles[activeFileIndex];
      const isJson = activeFile?.name.endsWith('.json') || (activeFile?.content && (activeFile.content.trim().startsWith('{') || activeFile.content.trim().startsWith('[')));

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

   const openFile = async (file: { name: string, path: string }) => {
      const idx = openFiles.findIndex(f => f.path === file.path);
      if (idx >= 0) {
         if ((openFiles[idx] as any).isHidden) {
            const newFiles = [...openFiles];
            (newFiles[idx] as any).isHidden = false;
            setOpenFiles(newFiles);
         }
         setActiveFileIndex(idx);
         setActiveVersionTimestamp(null);
      } else {
         try {
            let content = "";
            if (isCloudMode) {
               const { supabase } = await import('./supabase');
               const schemaId = file.name.replace(".json", "");
               const { data, error } = await supabase.from('sanctuary_schemas').select('schema_data').eq('id', schemaId).single();
               if (!error && data && data.schema_data) {
                  content = JSON.stringify(data.schema_data, null, 2);
               } else {
                  content = "{\n  \"schema_version\": 1\n}";
               }
            } else {
               content = await readTextFile(file.path);
            }
            setOpenFiles([...openFiles, { ...file, content, originalContent: content }]);
            setActiveFileIndex(openFiles.length);
            setActiveVersionTimestamp(null);
         } catch (e) {
            pushStatus(t("err_open") || "Error opening file", "error");
         }
      }
   };

   const closeFile = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const newFiles = [...openFiles];
      const wasActive = activeFileIndex === index;
      let isRemoving = false;

      if (newFiles[index].content !== newFiles[index].originalContent) {
         (newFiles[index] as any).isHidden = true;
      } else {
         newFiles.splice(index, 1);
         isRemoving = true;
      }

      setOpenFiles(newFiles);

      if (wasActive) {
         let newActive = -1;
         for (let i = newFiles.length - 1; i >= 0; i--) {
            if (!(newFiles[i] as any).isHidden) {
               newActive = i;
               break;
            }
         }
         setActiveFileIndex(newActive);
         setActiveVersionTimestamp(null);
      } else {
         if (isRemoving && activeFileIndex > index) {
            setActiveFileIndex(activeFileIndex - 1);
         }
      }
   };

   const handleEditorChange = (value: string | undefined) => {
      if (value === undefined || activeFileIndex < 0) return;
      const newFiles = [...openFiles];
      newFiles[activeFileIndex].content = value;
      setOpenFiles(newFiles);
      if (editorRef && (window as any).monaco) {
         validateContent(value, (window as any).monaco, editorRef.getModel());
      }
   };

   const handleDeleteFile = async (path: string) => {
      try {
         await remove(path);
         const openIdx = openFiles.findIndex(f => f.path === path);
         if (openIdx >= 0) {
            closeFile(openIdx, { stopPropagation: () => { } } as any);
         }
         fetchFiles();
         pushStatus(t("msg_template_deleted") || "File deleted", "success");
      } catch (e) {
         console.error("Error deleting file", e);
         pushStatus(t("msg_template_delete_failed") || "Error deleting file", "error");
      }
   };

   const handleRenameSubmit = async (oldPath: string, oldName: string) => {
      const lastDot = oldName.lastIndexOf('.');
      const oldExt = lastDot > 0 ? oldName.substring(lastDot) : '';
      const baseOldName = lastDot > 0 ? oldName.substring(0, lastDot) : oldName;
      const currentExt = renameExt.startsWith('.') ? renameExt : (renameExt ? '.' + renameExt : '');
      if (!renameInput.trim() || (renameInput === baseOldName && currentExt === oldExt)) {
         setRenamingFile(null);
         return;
      }
      try {
         const newName = renameInput.trim() + currentExt;
         const lastSlash = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'));
         const newPath = oldPath.substring(0, lastSlash) + '/' + newName;

         const content = await readTextFile(oldPath);
         await writeTextFile(newPath, content);
         await remove(oldPath);

         setRenamingFile(null);
         const openIdx = openFiles.findIndex(f => f.path === oldPath);
         if (openIdx >= 0) {
            const newFiles = [...openFiles];
            newFiles[openIdx] = { ...newFiles[openIdx], name: newName, path: newPath };
            setOpenFiles(newFiles);
         }
         fetchFiles();
         pushStatus(t("auto_saved") || "Renamed successfully", "success");
      } catch (e) {
         console.error("Error renaming file", e);
         pushStatus(t("alert_error") || "Error renaming file", "error");
      }
   };

   const handleCreateSubmit = async () => {
      if (!createFileName.trim()) return;
      if (createMode === 'lexicon' && !lexiconLang.trim()) return;
      try {
         if (isCloudMode) {
            const newName = createFileName.trim();
            const schemaId = newName;
            const { supabase } = await import('./supabase');
            const { error } = await supabase.from('sanctuary_schemas').insert({
               id: schemaId,
               schema_data: { schema_version: 1, metadata: {} },
               version: 1,
               updated_at: new Date().toISOString()
            });
            if (error) {
               pushStatus(t("alert_error") || "File already exists or error", "error");
               return;
            }
            setIsCreatePanelOpen(false);
            setCreateFileName("");
            fetchFiles();
            openFile({ name: newName + ".json", path: "cloud://" + newName });
            return;
         }
         if (!vaultPath) return;
         const normalizedVault = vaultPath.replace(/\\/g, '/');
         let baseDir = normalizedVault;
         if (baseDir.toLowerCase().endsWith('/mods')) baseDir = baseDir.substring(0, baseDir.length - 5);
         else if (baseDir.toLowerCase().endsWith('mods')) baseDir = baseDir.substring(0, baseDir.length - 4);
         const sandboxDir = `${baseDir}/Dev/Sandbox`;
         const baseName = createMode === 'lexicon' ? `${lexiconLang.toLowerCase()}-${createFileName.trim()}` : createFileName.trim();
         const ext = createMode === 'lexicon' ? '.json' : (createFileExt.startsWith('.') ? createFileExt : '.' + createFileExt);
         const newName = baseName + ext;
         const newPath = `${sandboxDir}/${newName}`;
         if (await exists(newPath)) {
            pushStatus(t("alert_error") || "File already exists", "error");
            return;
         }

         let initialContent = "";
         if (createMode === 'lexicon') {
            const emptyLexicon: any = {
               _meta_lang: lexiconLang.toLowerCase(),
               _meta_name: createFileName.trim(),
               _meta_author: session?.user?.user_metadata?.username || "Unknown"
            };
            for (const key of Object.keys(enDefault)) {
               emptyLexicon[key] = "";
            }
            initialContent = JSON.stringify(emptyLexicon, null, 2);
         }

         await writeTextFile(newPath, initialContent);
         setIsCreatePanelOpen(false);
         setCreateFileName("");
         fetchFiles();

         openFile({ name: newName, path: newPath });
      } catch (e) {
         console.error("Error creating file", e);
         pushStatus(t("alert_error") || "Error creating file", "error");
      }
   };

   const saveFile = async () => {
      if (activeFileIndex < 0) return;
      const file = openFiles[activeFileIndex];
      try {
         if (isCloudMode) {
            const parsed = JSON.parse(file.content);
            parsed.schema_version = (parsed.schema_version || 0) + 1;
            const updatedContent = JSON.stringify(parsed, null, 2);

            const { supabase } = await import('./supabase');
            const schemaId = file.name.replace(".json", "");
            const { error } = await supabase.from('sanctuary_schemas').upsert({
               id: schemaId,
               schema_data: parsed,
               version: parsed.schema_version,
               updated_at: new Date().toISOString()
            });
            if (error) throw error;

            if (schemaId === 'sims4') {
               useStore.getState().setActiveGameSchema(parsed);
            }

            const newFiles = [...openFiles];
            newFiles[activeFileIndex].content = updatedContent;
            newFiles[activeFileIndex].originalContent = updatedContent;
            setOpenFiles(newFiles);
            setActiveVersionTimestamp(null);
            pushStatus(t("alert_saved") || "Saved to Cloud", "success");
         } else {
            const normalizedPath = file.path.replace(/\//g, '\\');
            await invoke('save_file_with_history', { path: normalizedPath, content: file.content });
            const newFiles = [...openFiles];
            newFiles[activeFileIndex].originalContent = file.content;
            setOpenFiles(newFiles);
            setActiveVersionTimestamp(null);
            pushStatus(t("alert_saved") || "Saved successfully", "success");
         }
      } catch (e) {
         pushStatus(t("alert_error") || "Error saving file", "error");
      }
   };

   const handleImport = async () => {
      if (isCloudMode) return;
      try {
         const selected = await open({
            multiple: true,
            filters: [{ name: "Text Files", extensions: ["json", "cfg", "ini", "xml", "js", "ts", "md", "txt"] }]
         });
         if (selected) {
            if (!vaultPath) return;
            let baseDir = vaultPath.replace(/\\/g, '/');
            if (baseDir.toLowerCase().endsWith('/mods')) baseDir = baseDir.substring(0, baseDir.length - 5);
            else if (baseDir.toLowerCase().endsWith('mods')) baseDir = baseDir.substring(0, baseDir.length - 4);
            const sandboxDir = `${baseDir}/Dev/Sandbox`;

            const paths = Array.isArray(selected) ? selected : [selected];
            for (const p of paths) {
               const fileName = p.substring(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
               const content = await readTextFile(p);
               await writeTextFile(`${sandboxDir}/${fileName}`, content);
            }
            fetchFiles();
            pushStatus(t("workbench_msg_template_saved") || "Import successful", "success");
         }
      } catch (e) {
         console.error("Import failed", e);
         pushStatus(t("alert_error") || "Import failed", "error");
      }
   };

   const handlePublishLexicon = async (file: any) => {
      try {
         const content = file.content;
         const parsed = JSON.parse(content);

         if (!parsed._meta_name) {
            pushStatus(t("alert_error") || "Missing _meta_name in lexicon JSON", "error");
            return;
         }

         const langMap: Record<string, string> = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese'
         };

         let resolvedLang = parsed._meta_lang ? (langMap[parsed._meta_lang.toLowerCase()] || parsed._meta_lang) : 'add_new';

         setUploadState({
            isOpen: true,
            editId: null,
            assetType: 'lexicon',
            isHidden: false,
            fileContent: parsed,
            fileName: file.name,
            name: parsed._meta_name,
            version: parsed._meta_version || '1.0.0',
            description: `Language Pack: ${resolvedLang === 'add_new' ? 'Custom' : resolvedLang}`,
            releaseNotes: '',
            language: resolvedLang,
            newLanguage: '',
            lexiconType: 'Theme',
            themeMode: 'Dark'
         });
      } catch (e: any) {
         pushStatus((t("alert_error") || "Error publishing: ") + e.message, "error");
      }
   };

   const submitUpload = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
         const finalLanguage = uploadState.language === 'add_new' ? uploadState.newLanguage : uploadState.language;
         const finalContent = { ...uploadState.fileContent };
         finalContent.version = uploadState.version;
         finalContent._meta_version = uploadState.version;

         const payload = {
            name: uploadState.name,
            version: uploadState.version,
            description: uploadState.description,
            release_notes: uploadState.releaseNotes,
            json_data: finalContent,
            asset_type: uploadState.assetType,
            is_public: true,
            language: finalLanguage,
            lexicon_type: uploadState.lexiconType
         };

         const authorName = session?.user?.user_metadata?.mason_name || session?.user?.user_metadata?.username || "Unknown";

         // Check if it exists
         const { data: existing } = await supabase
            .from('nexus_assets')
            .select('id')
            .eq('name', uploadState.name)
            .eq('author', authorName)
            .eq('asset_type', uploadState.assetType)
            .maybeSingle();

         if (existing) {
            const { error } = await supabase.from('nexus_assets').update({ ...payload }).eq('id', existing.id);
            if (error) throw error;
         } else {
            const { error } = await supabase.from('nexus_assets').insert([{ ...payload, author: authorName, downloads: 0 }]);
            if (error) throw error;
         }

         pushStatus(t("upload_success") || `Asset published successfully.`, "success");
         setUploadState(s => ({ ...s, isOpen: false }));
      } catch (err: any) {
         console.error("SUPABASE ERROR:", err);
         pushStatus((t("alert_error") || `Error: `) + `${err.message}`, "error");
      }
   };

   const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
   const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;

   let lexiconStats: { total: number, missing: number, completelyMissing: number, deprecated: number } | null = null;
   if (activeFile && activeFile.name.match(/^[a-z]{2}-.+\.json$/i)) {
      try {
         const parsed = JSON.parse(activeFile.content);
         const baseKeys = Object.keys(enDefault).filter(k => !k.startsWith('_meta'));
         const parsedKeys = Object.keys(parsed).filter(k => !k.startsWith('_meta'));
         let total = baseKeys.length;
         let missing = 0;
         let completelyMissing = 0;
         let deprecated = 0;
         for (const key of baseKeys) {
            if (typeof parsed[key] === 'undefined') {
               missing++;
               completelyMissing++;
            } else if (typeof parsed[key] !== 'string' || parsed[key] === "") {
               missing++;
            }
         }
         for (const key of parsedKeys) {
            if (typeof (enDefault as any)[key] === 'undefined') {
               deprecated++;
            }
         }
         lexiconStats = { total, missing, completelyMissing, deprecated };
      } catch (e) {
         // Ignore invalid JSON parsing for stats
      }
   }

   const addMissingStrings = () => {
      if (!editorRef || !activeFile) return;
      try {
         const parsed = JSON.parse(activeFile.content);
         const newObj: any = {};
         // Keep _meta keys first
         for (const k of Object.keys(parsed)) {
            if (k.startsWith('_meta')) newObj[k] = parsed[k];
         }
         // Add all base keys in order
         for (const key of Object.keys(enDefault)) {
            if (key.startsWith('_meta')) continue;
            if (typeof parsed[key] !== 'undefined') {
               newObj[key] = parsed[key];
            } else {
               newObj[key] = "";
            }
         }
         // Keep any extra keys
         for (const k of Object.keys(parsed)) {
            if (typeof newObj[k] === 'undefined') newObj[k] = parsed[k];
         }

         const newContent = JSON.stringify(newObj, null, 2);
         const model = editorRef.getModel();
         if (model) {
            const fullRange = model.getFullModelRange();
            editorRef.executeEdits("add-missing", [
               {
                  range: fullRange,
                  text: newContent,
                  forceMoveMarkers: true
               }
            ]);
         }
      } catch (e) {
         pushStatus(t("alert_error") || "Invalid JSON. Fix syntax errors before adding missing strings.", "error");
      }
   };

   const purgeDeprecatedStrings = () => {
      if (!editorRef || !activeFile) return;
      try {
         const parsed = JSON.parse(activeFile.content);
         const newObj: any = {};
         for (const k of Object.keys(parsed)) {
            if (k.startsWith('_meta') || typeof (enDefault as any)[k] !== 'undefined') {
               newObj[k] = parsed[k];
            }
         }
         const newContent = JSON.stringify(newObj, null, 2);
         const model = editorRef.getModel();
         if (model) {
            const fullRange = model.getFullModelRange();
            editorRef.executeEdits("purge-deprecated", [{ range: fullRange, text: newContent, forceMoveMarkers: true }]);
         }
      } catch (e) {
         pushStatus(t("alert_error") || "Invalid JSON", "error");
      }
   };

   const jumpToNextEmpty = () => {
      if (!editorRef) return;
      const model = editorRef.getModel();
      if (!model) return;
      const matches = model.findMatches('""', false, false, false, null, true);
      if (matches && matches.length > 0) {
         const position = editorRef.getPosition();
         if (!position) return;
         let nextMatch = matches.find((m: any) => m.range.startLineNumber > position.lineNumber || (m.range.startLineNumber === position.lineNumber && m.range.startColumn > position.column));
         if (!nextMatch) nextMatch = matches[0]; // Wrap around
         editorRef.revealLineInCenter(nextMatch.range.startLineNumber);
         editorRef.setPosition({ lineNumber: nextMatch.range.startLineNumber, column: nextMatch.range.startColumn + 1 });
         editorRef.focus();
      }
   };

   return (
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-[800px] h-[calc(100vh-250px)] w-full pb-12 relative">
         {uploadState.isOpen && (
            <MarketUploadPanel
               uploadState={uploadState}
               setUploadState={setUploadState}
               marketTab="LEXICONS"
               availableLanguages={["English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian", "Japanese", "Korean", "Chinese"]}
               submitUpload={submitUpload}
               backdropZ="z-[50000]"
               panelZ="z-[50001]"
            />
         )}
         <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 relative z-10">
            <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
               <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_code")}</span>
               </div>
               <span className="truncate">{isCloudMode ? (t("schema_ide") || "MASTER SCHEMA EDITOR") : t("tools_ide")}</span>
            </h2>

            <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
               <div className="relative flex-1 max-w-[300px]">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
                  <input
                     value={searchQuery}
                     onChange={e => setSearchQuery(e.target.value)}
                     placeholder={t("search_files")}
                     className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                  />
               </div>

               <div className="w-max min-w-[160px] max-w-xs shrink-0 relative z-50 h-12">
                  <CustomDropdown
                     disableTint={true}
                     options={[
                        { id: "all", label: "ALL FILES" },
                        { id: "json", label: "JSON DATA" },
                        { id: "cfg", label: "CONFIG (.CFG)" },
                        { id: "ini", label: "SETTINGS (.INI)" },
                        { id: "lexicon", label: "LEXICON PACK" }
                     ]}
                     value={fileTypeFilter}
                     onChange={(val: string[]) => setFileTypeFilter(val[0])}
                     placeholder={t("auto_file_type")}
                  />
               </div>

               <div className="flex items-center gap-4 shrink-0">
                  <button onClick={() => setIsCreatePanelOpen(true)} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
                     <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform duration-500">{t("icon_add") || "add"}</span>
                     {t("auto_create_file") || "Create File"}
                  </button>
                  <button onClick={handleImport} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
                     <span className="material-symbols-outlined !text-[16px] group-hover:-translate-y-1 transition-transform duration-500">{t("icon_upload") || "upload"}</span>
                     {t("import_file")}
                  </button>
               </div>
            </div>
         </div>

         <div className="flex-1 overflow-hidden relative px-6 flex flex-col">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">


               {(() => {
                  const filteredFiles = files.filter(f => {
                     if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                     if (fileTypeFilter === "lexicon") {
                        if (!f.name.match(/^[a-z]{2}-.+\.json$/i)) return false;
                     } else if (fileTypeFilter !== "all") {
                        if (!f.name.toLowerCase().endsWith(`.${fileTypeFilter}`)) return false;
                     }
                     return true;
                  });

                  if (filteredFiles.length === 0) {
                     return <EmptyState icon={t("icon_folder_off") || "folder_off"} title={t("tools_ide")} className="col-span-full py-16" />;
                  }

                  return (
                     <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
                        {filteredFiles.map(file => {
                           const isTmpl = file.name.toLowerCase().endsWith('.json');
                           const isLexicon = file.name.match(/^[a-z]{2}-.+\.json$/i);
                           return (
                              <div key={file.path} className="group relative break-inside-avoid">
                                 <div
                                    onClick={() => !renamingFile && openFile(file)}
                                    className={`w-full text-left p-6 rounded-[var(--radius)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] cursor-pointer ${openFiles.find(o => o.path === file.path && o.content !== o.originalContent) ? 'border border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/50 backdrop-blur-[3px] shadow-[0_8px_32px_rgba(245,158,11,0.15)]' : 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}
                                 >
                                    <div className="absolute inset-0 rounded-[var(--radius)] bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                    {openFiles.find(o => o.path === file.path && o.content !== o.originalContent) && (
                                       <div className="absolute top-6 right-6 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[var(--warning)] bg-[var(--warning)]/20 border border-[var(--warning)]/40 px-3 py-1.5 rounded-full shadow-lg z-20 pointer-events-none backdrop-blur-xl">
                                          <span className="material-symbols-outlined !text-[12px]">{t("icon_warning")}</span>
                                          {t("unsaved_changes")}
                                       </div>
                                    )}

                                    <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner group-hover:border-[var(--accent)]/50 transition-colors relative z-10">
                                       <span className="material-symbols-outlined !text-2xl text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">{isLexicon ? "translate" : (isTmpl ? "data_object" : "description")}</span>
                                    </div>

                                    {renamingFile === file.path ? (
                                       <div className="flex items-center gap-2 z-20 mt-2" onClick={(e) => e.stopPropagation()}>
                                          <div className="flex flex-col gap-1 w-full min-w-0">
                                             <input
                                                type="text"
                                                value={renameInput}
                                                onChange={(e) => setRenameInput(e.target.value)}
                                                className="h-8 w-full min-w-0 px-3 rounded-xl text-[12px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] text-[var(--text)] focus:outline-none focus:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] shadow-inner font-mono"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                   if (e.key === 'Enter') handleRenameSubmit(file.path, file.name);
                                                   if (e.key === 'Escape') setRenamingFile(null);
                                                }}
                                             />
                                             <input
                                                type="text"
                                                value={renameExt}
                                                onChange={(e) => setRenameExt(e.target.value)}
                                                className="h-6 w-16 px-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)] text-[var(--subtext)] focus:outline-none transition-all placeholder:text-[var(--subtext)]/50 shadow-inner"
                                                onKeyDown={(e) => {
                                                   if (e.key === 'Enter') handleRenameSubmit(file.path, file.name);
                                                   if (e.key === 'Escape') setRenamingFile(null);
                                                }}
                                             />
                                          </div>
                                          <div className="flex flex-col gap-1 shrink-0">
                                             <button onClick={() => handleRenameSubmit(file.path, file.name)} className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95">
                                                <span className="material-symbols-outlined !text-sm">{t("icon_check") || "check"}</span>
                                             </button>
                                             <button onClick={() => setRenamingFile(null)} className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95">
                                                <span className="material-symbols-outlined !text-sm">{t("icon_close") || "close"}</span>
                                             </button>
                                          </div>
                                       </div>
                                    ) : (
                                       <div className="flex flex-col gap-1 z-10 pr-10 text-left">
                                          <span className="text-sm font-black text-[var(--text)] tracking-wider truncate block">{file.name.lastIndexOf('.') > 0 ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name}</span>
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 block">{isLexicon ? "Lexicon Pack" : (file.name.lastIndexOf('.') > 0 ? file.name.substring(file.name.lastIndexOf('.')) : (isTmpl ? "JSON File" : "Source File"))}</span>
                                       </div>
                                    )}

                                    {renamingFile !== file.path && (
                                       <div onClick={(e) => e.stopPropagation()} className="absolute bottom-6 right-6 flex items-center gap-2 z-20">
                                          {deleteConfirmPath === file.path ? (
                                             <>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.path); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-[var(--danger)]/50 text-[var(--danger)] bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 hover:border-[var(--danger)]/80 backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_4px_12px_rgba(244,63,94,0.15)]">
                                                   <span className="material-symbols-outlined !text-sm drop-shadow-md">{t("icon_check") || "check"}</span>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg">
                                                   <span className="material-symbols-outlined !text-sm">{t("icon_close") || "close"}</span>
                                                </button>
                                             </>
                                          ) : (
                                             <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {isLexicon && (
                                                   <button
                                                      onClick={(e) => { e.stopPropagation(); handlePublishLexicon(file); }}
                                                      className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all hover:scale-110 active:scale-95 shadow-lg mr-1"

                                                   >
                                                      <span className="material-symbols-outlined !text-sm">cloud_upload</span>
                                                   </button>
                                                )}
                                                <button
                                                   onClick={(e) => { e.stopPropagation(); setRenamingFile(file.path); const d = file.name.lastIndexOf('.'); setRenameInput(d > 0 ? file.name.substring(0, d) : file.name); setRenameExt(d > 0 ? file.name.substring(d) : ''); }}
                                                   className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:text-[var(--text)] transition-all hover:scale-110 active:scale-95 shadow-lg"
                                                >
                                                   <span className="material-symbols-outlined !text-sm">{t("icon_edit") || "edit"}</span>
                                                </button>
                                                <button
                                                   onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(file.path); }}
                                                   className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] transition-all hover:scale-110 active:scale-95 shadow-lg"
                                                >
                                                   <span className="material-symbols-outlined !text-sm">{t("icon_delete") || "delete"}</span>
                                                </button>
                                             </div>
                                          )}
                                       </div>
                                    )}
                                 </div>
                              </div>
                           )
                        })}
                     </div>
                  );
               })()}
            </div>
         </div>

         <SidePanel
            isOpen={!!activeFile}
            onClose={() => setActiveFileIndex(-1)}
            title={t("tools_ide") || "MASON IDE"}
            subtitle={t("mason_ide_subtitle") || "DEVELOPMENT & LOCALIZATION ENVIRONMENT"}
            icon="code"
            iconColorClass="theme-text-accent"
            isResizable={!isFullscreen}
            defaultWidth={isFullscreen ? window.innerWidth : (showReference ? 1400 : 1000)}
            panelClass={isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none transition-all duration-500" : "transition-all duration-500"}
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
                  <button
                     onClick={() => setShowReference(!showReference)}
                     disabled={!activeFile}
                     className={`h-12 px-6 transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent font-black ${showReference ? '!opacity-100 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : ''}`}
                  >
                     <span className="material-symbols-outlined !text-[18px] normal-case">{showReference ? "vertical_split" : "splitscreen"}</span>
                     <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_reference") || "Reference"}</span>
                  </button>
                  <button
                     onClick={() => setShowTimeline(true)}
                     disabled={!activeFile}
                     className="h-12 px-6 transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent font-black"
                  >
                     <span className="material-symbols-outlined !text-[18px] normal-case">{t("icon_history")}</span>
                     <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_timeline")}</span>
                  </button>
               </div>
            }
            footer={
               <div className="flex items-center justify-center gap-3 w-full shrink-0">
                  <div className="relative group">
                     {isDirty && (
                        <HoverTooltip title={t("unsaved_changes")} variant="warning" className="z-[100]" />
                     )}

                     <button
                        onClick={saveFile}
                        disabled={!activeFile || !isDirty}
                        className={
                           isDirty
                              ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] hover:shadow-[0_5px_20px_rgba(245,158,11,0.4)]')
                              : standardButtonClass
                        }
                     >
                        <span className="material-symbols-outlined !text-[18px]">{t("icon_save")}</span>
                        {t("btn_save")}
                     </button>
                  </div>

                  {activeFile && activeFile.name.match(/^[a-z]{2}-.+\.json$/i) && (
                     <div className="relative group">
                        {(problemsList.length > 0 || (lexiconStats && lexiconStats.missing > 0)) && (
                           <HoverTooltip title={problemsList.length > 0 ? t("publish_disabled_errors_desc") : t("lexicon_missing_keys_btn")} variant="error" className="z-[100]" />
                        )}
                        <button
                           onClick={() => handlePublishLexicon(activeFile)}
                           disabled={problemsList.length > 0 || (lexiconStats ? lexiconStats.missing > 0 : false)}
                           className={
                              (problemsList.length > 0 || (lexiconStats ? lexiconStats.missing > 0 : false))
                                 ? standardButtonClass.replace('hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', '').replace('active:scale-95', '') + ' opacity-50 cursor-not-allowed grayscale'
                                 : standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]')
                           }
                        >
                           <span className="material-symbols-outlined !text-[18px]">{t("icon_upload") || "cloud_upload"}</span>
                           {t("sandbox_btn_sync") || "SYNC LEXICON"}
                        </button>
                     </div>
                  )}
               </div>
            }
         >
            <div className="flex flex-col h-full relative">
               <div className="flex flex-col relative z-20 shrink-0 px-6 pt-0 pb-4 pointer-events-none">
                  <div className="flex items-center overflow-x-auto custom-scrollbar theme-glass-panel rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0 w-max max-w-full mx-auto pointer-events-auto h-10">
                     {openFiles.map((file: any, i) => {
                        if (file.isHidden) return null;
                        const isActive = activeFileIndex === i;
                        const isDirty = file.content !== file.originalContent;
                        return (
                           <button
                              key={file.path}
                              onClick={() => setActiveFileIndex(i)}
                              className={`h-full px-5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap first:rounded-l-full last:rounded-r-full group shrink-0 ${isActive ? (isDirty ? 'bg-[var(--warning)]/20 text-[var(--warning)]' : 'bg-[var(--accent)]/20 text-[var(--accent)]') : 'bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}
                           >
                              <span className="material-symbols-outlined !text-[16px]">{file.name.endsWith('.json') ? 'data_object' : 'description'}</span>
                              {file.name}
                              <div onClick={(e) => { e.stopPropagation(); closeFile(i, e); }} className={`material-symbols-outlined !text-[14px] p-0.5 rounded-full transition-colors ml-1 ${isActive ? (isDirty ? 'text-[var(--warning)] hover:bg-[var(--warning)]/20' : 'text-[var(--accent)] hover:bg-[var(--accent)]/20') : 'text-transparent group-hover:text-[var(--subtext)] hover:!text-[var(--danger)] hover:!bg-[var(--danger)]/20'}`}>{t("icon_close") || "close"}</div>
                           </button>
                        );
                     })}
                  </div>
               </div>

               <div className="flex-1 relative flex w-full min-h-0">
                  <style>{`
                    [widgetid="editor.contrib.findWidget"] {
                        background: color-mix(in srgb, ${isLight ? '#ffffff' : '#0f172a'} 70%, transparent) !important;
                    }
                `}</style>

                  <div style={{ width: showReference ? `${splitRatio}%` : '100%' }} className="flex-shrink-0 relative h-full min-w-0 transition-none">
                     {lexiconStats && (
                        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-[50] flex items-center gap-6 theme-glass-panel rounded-full border px-6 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all ${lexiconStats.missing === 0 ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--success)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_10%,transparent)]'}`}>
                           <div className="flex items-center gap-3">

                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap opacity-90">
                                 <strong>{lexiconStats.total - lexiconStats.missing}</strong> {t("lexicon_translated_count")?.replace("{translated} / {total}", `/ ${lexiconStats.total}`) || `/ ${lexiconStats.total} Translated`}
                              </span>
                           </div>
                           {lexiconStats.missing > 0 && (
                              <>
                                 <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                                 <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 opacity-90 whitespace-nowrap">
                                       <span className="material-symbols-outlined !text-[16px] text-[var(--warning)]">warning</span>
                                       {t("lexicon_missing_count")?.replace("{missing}", lexiconStats.missing.toString()) || `${lexiconStats.missing} Missing Strings`}
                                    </span>
                                 </div>
                                 {lexiconStats.completelyMissing > 0 ? (
                                    <button
                                       onClick={addMissingStrings}
                                       className="ml-2 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                                    >
                                       <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                       <span>{t("lexicon_add_missing") || "Add Missing Keys"}</span>
                                    </button>
                                 ) : lexiconStats.missing > 0 ? (
                                    <button
                                       onClick={jumpToNextEmpty}
                                       className="ml-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                                    >
                                       <span>{t("lexicon_next_empty") || "Next Empty"}</span>
                                       <span className="material-symbols-outlined !text-[14px]">arrow_downward</span>
                                    </button>
                                 ) : null}
                              </>
                           )}
                           {lexiconStats.deprecated > 0 && (
                              <button
                                 onClick={purgeDeprecatedStrings}
                                 className="ml-2 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                              >
                                 <span className="material-symbols-outlined !text-[14px]">delete</span>
                                 <span>{t("lexicon_purge_keys") || "Purge Keys"} ({lexiconStats.deprecated})</span>
                              </button>
                           )}
                        </div>
                     )}
                     {activeFile && (
                        <Editor
                           height="100%"
                           language={activeFile.name.endsWith('.json') || (activeFile.content && (activeFile.content.trim().startsWith('{') || activeFile.content.trim().startsWith('['))) ? 'json' : activeFile.name.endsWith('.ts') || activeFile.name.endsWith('.tsx') ? 'typescript' : 'javascript'}
                           theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                           beforeMount={handleEditorWillMount}
                           value={activeFile.content}
                           onChange={handleEditorChange}
                           onMount={(editor, monaco) => {
                              setEditorRef(editor);
                              (window as any).monaco = monaco;
                              validateContent(activeFile.content, monaco, editor.getModel());
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
                              contextmenu: false,
                              minimap: { enabled: true },
                              fontSize: 14,
                              fontFamily: "var(--font-mono), Consolas, monospace",
                              padding: { top: 24, bottom: 24 },
                              smoothScrolling: true,
                              cursorBlinking: "smooth",
                              lineHeight: 24,
                              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
                           }}
                        />
                     )}
                  </div>

                  {showReference && (
                     <>
                        <div
                           onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; document.body.style.cursor = 'col-resize'; }}
                           className="w-4 cursor-col-resize hover:bg-[var(--accent)]/10 active:bg-[var(--accent)]/20 transition-colors z-50 flex items-center justify-center -ml-2 mr-2 relative group shrink-0"
                        >
                           <div className="w-[2px] h-12 bg-[var(--text)]/20 group-hover:bg-[var(--accent)] transition-colors rounded-full" />
                        </div>
                        <div style={{ width: `${100 - splitRatio}%` }} className="flex-1 relative h-full min-w-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] pl-2 transition-none">
                           <div className="absolute top-4 right-6 z-10 theme-glass-panel px-4 py-1.5 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] shadow-md">en-default.json Reference</div>
                           <Editor
                              height="100%"
                              language="json"
                              theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                              value={JSON.stringify(enDefault, null, 2)}
                              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, fontFamily: "var(--font-mono)", padding: { top: 24, bottom: 24 } }}
                           />
                        </div>
                     </>
                  )}
               </div>

               {problemsList.length > 0 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-2xl rounded-[var(--radius)] shadow-[0_30px_60px_rgba(0,0,0,0.8)] border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] overflow-hidden animate-in slide-in-from-bottom-10 z-[100] flex flex-col max-h-72">
                     <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2 drop-shadow-md">
                           <span className="material-symbols-outlined !text-[16px]">{t("icon_error")}</span>
                           {t("problems")} ({problemsList.length})
                        </span>
                        <button onClick={() => setProblemsList([])} className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors">
                           <span className="material-symbols-outlined !text-[14px]">{t("icon_close")}</span>
                        </button>
                     </div>
                     <div className="p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar relative z-10">
                        {problemsList.map((p: any, i: number) => (
                           <div key={i} onClick={() => { if (editorRef) { editorRef.revealLineInCenter(p.line); editorRef.setPosition({ lineNumber: p.line, column: p.column }); editorRef.focus(); } }} className="flex items-start gap-4 px-4 py-3 rounded-xl hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] cursor-pointer group transition-colors">
                              <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] mt-0.5">{t("lineage_cancel")}</span>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                 <span className="text-[11px] font-mono font-bold text-[var(--text)] group-hover:text-[var(--danger)] transition-colors whitespace-normal break-words">{p.message}</span>
                                 <span className="text-[9px] text-[var(--subtext)] font-mono uppercase tracking-widest opacity-60">{t("auto_ln")} {p.line}{t("auto_col")} {p.column}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </SidePanel>

         {showTimeline && activeFile && (
            <VersionTimeline
               key={activeFile.path}
               filePath={activeFile.path.replace(/\//g, '\\')}
               hasUnsavedChanges={activeFile.content !== activeFile.originalContent}
               activeVersionTimestamp={activeVersionTimestamp}
               onRestore={async (content, timestamp) => {
                  setOpenFiles(prev => prev.map((f, i) => i === activeFileIndex ? { ...f, content, originalContent: content } : f));
                  if (editorRef && (window as any).monaco) {
                     validateContent(content, (window as any).monaco, editorRef.getModel());
                  }
                  try {
                     await invoke('save_file_silently', { path: activeFile.path.replace(/\//g, '\\'), content });
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

         <SidePanel
            isOpen={isCreatePanelOpen}
            onClose={() => setIsCreatePanelOpen(false)}
            title={t("auto_create_file") || "Create File"}
            subtitle={t("auto_create_file_sub") || "Create a new file in your sandbox"}
            icon={t("icon_add")}
            footer={
               <div className="flex justify-center items-center gap-4 w-full">
                  <button
                     type="button"
                     onClick={() => { setIsCreatePanelOpen(false); setCreateFileName(""); }}
                     className={standardGlassButtonClass}
                  >
                     {t("lineage_cancel") || "Cancel"}
                  </button>
                  <button
                     onClick={handleCreateSubmit}
                     disabled={!createFileName.trim() || !createFileExt.trim()}
                     className={standardAccentGlassButtonClass}
                  >
                     {t("auto_create") || "Create"}
                  </button>
               </div>
            }
         >
            <div className="p-6 flex flex-col gap-6 h-full">
               <div className="flex p-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl shadow-inner mb-2">
                  <button
                     onClick={() => setCreateMode("standard")}
                     className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${createMode === "standard" ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent'}`}
                  >
                     {t("auto_standard_file") || "Standard File"}
                  </button>
                  <button
                     onClick={() => setCreateMode("lexicon")}
                     className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${createMode === "lexicon" ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent'}`}
                  >
                     <span className="material-symbols-outlined !text-[14px] align-middle mr-2">translate</span>
                     {t("auto_lexicon_pack") || "Lexicon Pack"}
                  </button>
               </div>

               {createMode === "lexicon" ? (
                  <div className="flex gap-4">
                     <div className="flex flex-col gap-2 w-30">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">{t("label_lang_code") || "Lang Code"}</label>
                        <input
                           type="text"
                           value={lexiconLang}
                           onChange={e => setLexiconLang(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                           placeholder="es"
                           className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono text-center"
                           autoFocus
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSubmit();
                           }}
                        />
                     </div>
                     <div className="flex flex-col gap-2 flex-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">{t("label_lexicon_name") || "Lexicon Name"}</label>
                        <input
                           type="text"
                           value={createFileName}
                           onChange={e => setCreateFileName(e.target.value)}
                           placeholder="default"
                           className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSubmit();
                           }}
                        />
                     </div>
                  </div>
               ) : (
                  <div className="flex gap-4">
                     <div className="flex flex-col gap-2 flex-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">{t("author_filename") || "File Name"}</label>
                        <input
                           type="text"
                           value={createFileName}
                           onChange={e => setCreateFileName(e.target.value)}
                           placeholder="example"
                           className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                           autoFocus
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSubmit();
                           }}
                        />
                     </div>
                     <div className="flex flex-col gap-2 w-32">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">{t("auto_extension") || "Extension"}</label>
                        <input
                           type="text"
                           value={createFileExt}
                           onChange={e => setCreateFileExt(e.target.value)}
                           placeholder=".json"
                           className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSubmit();
                           }}
                        />
                     </div>
                  </div>
               )}

               {createMode === "lexicon" && (
                  <div className="bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-2xl p-4 flex gap-4 mt-2">
                     <span className="material-symbols-outlined text-[var(--accent)] text-3xl">info</span>
                     <p
                        className="text-xs text-[var(--text)] opacity-80 leading-relaxed font-bold"
                        dangerouslySetInnerHTML={{ __html: t("create_lexicon_msg")?.replace(/className/g, "class") || "Creating a Lexicon Pack will automatically generate a JSON file populated with all keys from <strong class='text-[var(--accent)]'>en-default.json</strong>. You can then translate the values and publish the pack to the Nexus." }}
                     />
                  </div>
               )}
            </div>
         </SidePanel>
      </div>
   );
}
