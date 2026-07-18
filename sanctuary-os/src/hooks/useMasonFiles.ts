import { useState, useEffect } from "react";
import { useStore } from "../store";
import { readDir, readTextFile, writeTextFile, exists, remove } from '@tauri-apps/plugin-fs';
import { open } from "@tauri-apps/plugin-dialog";
import enDefault from '../lexicons/en-default.json';
import { useLexicon } from "../LexiconContext";

export function useMasonFiles({ vaultPath, isCloudMode, cloudTarget }: { vaultPath?: string, isCloudMode?: boolean, cloudTarget?: "sanctuary_schemas" | "sanctuary_lexicons" }) {
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
   const [referenceData, setReferenceData] = useState<any>(enDefault);
   const [referenceLabel, setReferenceLabel] = useState<string>("en-default.json Reference");
   const [internalCloudTarget, setInternalCloudTarget] = useState<"sanctuary_schemas" | "sanctuary_lexicons">(cloudTarget || "sanctuary_schemas");
   const [splitRatio, setSplitRatio] = useState(50);
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

   const fetchFiles = async () => {
      if (isCloudMode) {
         try {
            setIsScanning(true);
            const { supabase } = await import('../supabase');
            const { data, error } = await supabase.from(internalCloudTarget).select('id');
            if (error) {
               console.error("Cloud fetch error:", error);
               return;
            }
            const mapped = (data || []).map(row => ({ name: `${row.id}.json`, path: `cloud://${row.id}` }));
            mapped.sort((a, b) => a.name.localeCompare(b.name));
            setFiles(mapped);
         } catch (e) {
            console.error("Failed to load cloud files", e);
         } finally {
            setIsScanning(false);
         }
         return;
      }

      if (!vaultPath) return;
      setIsScanning(true);
      try {
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
   }, [vaultPath, internalCloudTarget]);

   useEffect(() => {
      if (isCloudMode) {
         const fetchRef = async () => {
            const currentFile = (isCloudMode ? cloudOpenFiles : localOpenFiles)[isCloudMode ? cloudActiveFileIndex : localActiveFileIndex];
            if (!currentFile) return;

            const isLexicon = currentFile.content?.includes('_meta_lang') || currentFile.content?.includes('"a_citizen"') || currentFile.name.startsWith('en-') || currentFile.name.startsWith('de-') || currentFile.name.startsWith('es-') || currentFile.name.startsWith('fr-');

            const { supabase } = await import('../supabase');
            if (isLexicon) {
               const { data } = await supabase.from('sanctuary_lexicons').select('lexicon_data').eq('id', 'en-default').single();
               if (data) {
                  setReferenceData((data as any).lexicon_data);
                  setReferenceLabel("en-default.json Reference");
               }
            } else {
               const { data } = await supabase.from('sanctuary_schemas').select('schema_data').eq('id', 'sims4').single();
               if (data) {
                  setReferenceData((data as any).schema_data);
                  setReferenceLabel("sims4.json Reference");
               }
            }
         };
         fetchRef();
      }
   }, [isCloudMode ? cloudActiveFileIndex : localActiveFileIndex, isCloudMode]);

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
      const idx = openFiles.findIndex((f: any) => f.path === file.path);
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
               const { supabase } = await import('../supabase');
               const { data, error } = await supabase.from(internalCloudTarget).select(internalCloudTarget === 'sanctuary_lexicons' ? 'lexicon_data' : 'schema_data').eq('id', file.name.replace('.json', '')).single();
               if (!error && data) {
                  content = internalCloudTarget === 'sanctuary_lexicons' ? JSON.stringify((data as any).lexicon_data, null, 2) : JSON.stringify((data as any).schema_data, null, 2);
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
         const openIdx = openFiles.findIndex((f: any) => f.path === path);
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
         const openIdx = openFiles.findIndex((f: any) => f.path === oldPath);
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
            const fileId = createFileName.trim();
            const { supabase } = await import('../supabase');
            const contentToSave = (isCloudMode && internalCloudTarget === 'sanctuary_lexicons') || (!isCloudMode && createMode === 'lexicon')
               ? { _meta_lang: lexiconLang.toLowerCase(), _meta_name: fileId } 
               : { schema_version: 1, metadata: {} };
            const payload = internalCloudTarget === 'sanctuary_lexicons' 
               ? { id: fileId, name: fileId, badge: 'Sanctuary', version: 1, lexicon_data: contentToSave }
               : { id: fileId, name: fileId, schema_data: contentToSave, version: 1, updated_at: new Date().toISOString() };
            
            const { error } = await supabase.from(internalCloudTarget).insert(payload);
            if (error) {
               pushStatus(t("alert_error") || "File already exists or error", "error");
               return;
            }
            setIsCreatePanelOpen(false);
            setCreateFileName("");
            fetchFiles();
            openFile({ name: fileId + ".json", path: "cloud://" + fileId });
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

   const handleImport = async () => {
      try {
         const selected = await open({
            multiple: true,
            filters: [{ name: 'Config Files', extensions: ['json', 'cfg', 'ini'] }]
         });
         if (selected && selected.length > 0) {
            if (!vaultPath) return;
            const normalizedVault = vaultPath.replace(/\\/g, '/');
            let baseDir = normalizedVault;
            if (baseDir.toLowerCase().endsWith('/mods')) baseDir = baseDir.substring(0, baseDir.length - 5);
            else if (baseDir.toLowerCase().endsWith('mods')) baseDir = baseDir.substring(0, baseDir.length - 4);
            const sandboxDir = `${baseDir}/Dev/Sandbox`;
            const dirExists = await exists(sandboxDir);
            if (!dirExists) return;

            for (const path of selected) {
               const name = path.split('\\').pop()?.split('/').pop() || 'imported_file.json';
               const content = await readTextFile(path);
               await writeTextFile(`${sandboxDir}/${name}`, content);
            }
            fetchFiles();
            pushStatus(t("auto_imported") || "Files imported", "success");
         }
      } catch (e) {
         console.error(e);
      }
   };

   return {
      t, session, pushStatus,
      files, setFiles, isScanning,
      showTimeline, setShowTimeline,
      searchQuery, setSearchQuery,
      fileTypeFilter, setFileTypeFilter,
      problemsList, setProblemsList,
      activeVersionTimestamp, setActiveVersionTimestamp,
      editorRef, setEditorRef,
      renamingFile, setRenamingFile,
      renameInput, setRenameInput,
      renameExt, setRenameExt,
      deleteConfirmPath, setDeleteConfirmPath,
      isCreatePanelOpen, setIsCreatePanelOpen,
      createMode, setCreateMode,
      lexiconLang, setLexiconLang,
      createFileName, setCreateFileName,
      createFileExt, setCreateFileExt,
      showReference, setShowReference,
      referenceData, setReferenceData,
      referenceLabel, setReferenceLabel,
      internalCloudTarget, setInternalCloudTarget,
      splitRatio, setSplitRatio,
      isFullscreen, setIsFullscreen,
      uploadState, setUploadState,
      openFiles, setOpenFiles,
      activeFileIndex, setActiveFileIndex,
      fetchFiles, validateContent, openFile, closeFile,
      handleEditorChange, handleDeleteFile, handleRenameSubmit,
      handleCreateSubmit, handleImport
   };
}
