import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { useStore, getSafeSchema } from "./store";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, SidePanel, CustomDropdown, standardButtonClass, standardGlassButtonClass, standardAccentGlassButtonClass, standardPrimaryButtonClass, EmptyState, HoverTooltip, FilterTabs, FilterTabButton, ActionButton, FilterPopover } from "./shared";
import { readDir, readTextFile, writeTextFile, exists, remove, rename } from '@tauri-apps/plugin-fs';
import { open } from "@tauri-apps/plugin-dialog";
import VersionTimeline from './VersionTimeline';
import enDefault from './lexicons/en-default.json';
import { supabase } from "./supabase";
import { MarketUploadPanel } from "./side-panels/NexusSidePanels";
import MasonFileBrowser from "./hub-components/MasonFileBrowser";
import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
import MasonEditorPanel from "./hub-components/MasonEditorPanel";
import { deepCountKeys, deepCompare, createEmptyClone, deepAddMissing, deepPurgeDeprecated } from "./lib/MasonValidation";
import { useMasonFiles } from "./hooks/useMasonFiles";

export default function MasonIDE({ vaultPath, isCloudMode, cloudTarget = "sanctuary_schemas", isKeepers = false }: { vaultPath?: string, isCloudMode?: boolean, cloudTarget?: "sanctuary_schemas" | "sanctuary_lexicons" | "sanctuary_games", isKeepers?: boolean }) {
   const mason = useMasonFiles({ vaultPath, isCloudMode, cloudTarget, isKeepers });
   const {
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
      fetchError, setFetchError,
      openFiles, setOpenFiles,
      activeFileIndex, setActiveFileIndex,
      fetchFiles, validateContent, openFile, closeFile,
      handleEditorChange, handleDeleteFile, handleRenameSubmit,
      handleCreateSubmit, handleImport
   } = mason;

   const isResizing = useRef(false);

   useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
         if (!isResizing.current) return;
         setSplitRatio((prev: number) => {
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



   const saveFile = async () => {
      if (activeFileIndex < 0) return;
      const file = openFiles[activeFileIndex];
      try {
         if (isCloudMode) {
            const parsed = JSON.parse(file.content);
            const isLex = internalCloudTarget === 'sanctuary_lexicons';
            if (isLex) {
               if (!parsed._meta_version || typeof parsed._meta_version !== 'number') parsed._meta_version = 0;
               parsed._meta_version++;
               if (typeof parsed.schema_version !== 'undefined') delete parsed.schema_version; // Purge the accidental injection!
            } else {
               if (!parsed.schema_version || typeof parsed.schema_version !== 'number') parsed.schema_version = 0;
               parsed.schema_version++;
            }

            const updatedContent = JSON.stringify(parsed, null, 2);

            const { supabase } = await import('./supabase');
            const fileId = file.name.replace(".json", "");

            const actualCloudTarget = isLex ? 'sanctuary_lexicons' : 'sanctuary_schemas';
            const client = isKeepers ? (await import('./supabase')).supabaseAuth : (await import('./supabase')).supabase;

            const payload = actualCloudTarget === 'sanctuary_lexicons'
               ? { id: fileId, name: fileId, badge: parsed._meta_badge || 'Sanctuary', version: parsed._meta_version || 1, lexicon_data: parsed, updated_at: new Date().toISOString() }
               : { id: fileId, name: parsed.manifest_name || fileId, schema_data: parsed, version: parsed.schema_version || 1, updated_at: new Date().toISOString() };

            const token = useStore.getState().session?.access_token;
            if (!isKeepers && token) {
               const { error } = await client.rpc('secure_upsert_cloud_file', {
                  p_token: token,
                  p_target: actualCloudTarget,
                  p_payload: payload
               });
               if (error) throw error;
            } else {
               const { error } = await client.from(actualCloudTarget).upsert(payload);
               if (error) throw error;
            }

            if (fileId === useStore.getState().activeGameSchema?.id) {
               useStore.getState().setActiveGameSchema(getSafeSchema(parsed, parsed.id || 'default_schema'));
            }

            const newFiles = [...openFiles];
            newFiles[activeFileIndex].content = updatedContent;
            newFiles[activeFileIndex].originalContent = updatedContent;
            setOpenFiles(newFiles);
            setActiveVersionTimestamp(null);
            pushStatus(t("alert_saved"), "success");
         } else {
            const normalizedPath = file.path.replace(/\//g, '\\');
            await invoke('save_file_with_history', { path: normalizedPath, content: file.content });
            const newFiles = [...openFiles];
            newFiles[activeFileIndex].originalContent = file.content;
            setOpenFiles(newFiles);
            setActiveVersionTimestamp(null);
            pushStatus(t("alert_saved"), "success");
         }
      } catch (e) {
         pushStatus(t("alert_error"), "error");
      }
   };

   const handlePublishLexicon = async (file: any) => {
      try {
         const content = file.content;
         const parsed = JSON.parse(content);

         if (!parsed._meta_name) {
            pushStatus(t("alert_error"), "error");
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
         pushStatus((t("alert_error")) + e.message, "error");
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
            .or(`author_id.eq.${session?.user?.id},author.ilike.${authorName}`)
            .eq('asset_type', uploadState.assetType)
            .maybeSingle();

         if (existing) {
            const { error } = await supabase.from('nexus_assets').update({ ...payload }).eq('id', existing.id);
            if (error) throw error;
         } else {
            const { error } = await supabase.from('nexus_assets').insert([{ ...payload, author: authorName, author_id: session?.user?.id, downloads: 0 }]);
            if (error) throw error;
         }

         pushStatus(t("upload_success") || `Asset published successfully.`, "success");
         setUploadState((s: any) => ({ ...s, isOpen: false }));
      } catch (err: any) {
         console.error("SUPABASE ERROR:", err);
         pushStatus((t("alert_error") || `Error: `) + `${err.message}`, "error");
      }
   };

   // Actively inject backdrop-filter directly onto Monaco's floating widgets
   useEffect(() => {
      const applyGlass = () => {
         const processRoot = (root: Document | ShadowRoot) => {
            const widgets = root.querySelectorAll('.quick-input-widget, .monaco-editor .find-widget, .suggest-widget, .monaco-hover');
            widgets.forEach((w: any) => {
               // Apply glassmorphism directly inline
               w.style.setProperty('background', 'rgba(15, 23, 42, 0.4)', 'important');
               w.style.setProperty('background-color', 'rgba(15, 23, 42, 0.4)', 'important');
               w.style.setProperty('backdrop-filter', 'blur(24px) saturate(1.5)', 'important');
               w.style.setProperty('-webkit-backdrop-filter', 'blur(24px) saturate(1.5)', 'important');
               w.style.setProperty('border-radius', '12px', 'important');
               w.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
               w.style.setProperty('box-shadow', '0 20px 50px rgba(0,0,0,0.5)', 'important');

               // Find internal wrappers and force them to be transparent
               const internals = w.querySelectorAll('.quick-input-header, .quick-input-and-more, .quick-input-list, .monaco-list, .monaco-list-rows, .find-part, .replace-part');
               internals.forEach((inner: any) => {
                  inner.style.setProperty('background', 'transparent', 'important');
                  inner.style.setProperty('background-color', 'transparent', 'important');
               });
            });
         };

         processRoot(document);
         document.body.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) processRoot(el.shadowRoot);
         });
      };

      const interval = setInterval(applyGlass, 100);
      return () => clearInterval(interval);
   }, []);

   const handleEditorWillMount = (monaco: any) => {
      const bgCol = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#0f172a';
      const accentCol = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#38bdf8';
      const getHex = (c: string, alpha: string) => {
         if (!c || c === 'transparent') return `#0f172a${alpha}`;
         if (c.startsWith('#') && c.length === 7) return `${c}${alpha}`;
         return `#0f172a${alpha}`;
      };

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
            'editorSuggestWidget.background': getHex(bgCol, '80'),
            'editorSuggestWidget.border': getHex(textCol, '1a'),
            'editorSuggestWidget.selectedBackground': getHex(accentCol, '40'),
            'editorHoverWidget.background': getHex(bgCol, '80'),
            'editorHoverWidget.border': getHex(textCol, '1a'),
            'editorWidget.background': getHex(bgCol, '80'),
            'editorWidget.border': getHex(textCol, '1a'),
            'quickInput.background': getHex(bgCol, '80'),
            'quickInputList.focusBackground': getHex(accentCol, '40'),
            'list.activeSelectionBackground': getHex(accentCol, '40'),
            'list.hoverBackground': getHex(accentCol, '1a'),
            'editorWidget.foreground': textCol,
            'input.background': getHex(textCol, '0a'),
            'input.foreground': textCol,
            'inputOption.activeBorder': getHex(accentCol, '80'),
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
            'editorSuggestWidget.background': '#00000000',
            'editorSuggestWidget.border': '#00000000',
            'editorWidget.background': '#00000000',
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

   const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
   const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;

   let validationStats: { total: number, missing: number, completelyMissing: number, deprecated: number } | null = null;
   const isLexicon = isCloudMode ? internalCloudTarget === 'sanctuary_lexicons' : (activeFile?.content?.includes('_meta_lang') || activeFile?.content?.includes('"a_citizen"') || activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) !== null);
   const isSchema = isCloudMode ? internalCloudTarget === 'sanctuary_schemas' : (activeFile?.content?.includes('"schema_version"'));
   const isGame = isCloudMode && internalCloudTarget === 'sanctuary_games';

   if (activeFile && (isLexicon || isSchema || isGame)) {
      try {
         const parsed = JSON.parse(activeFile.content);
         const isEnDefault = activeFile?.name.includes('en-default');
         const reference = isEnDefault ? null : (referenceData && Object.keys(referenceData).length > 0 ? referenceData : (isLexicon ? enDefault : null));

         if (reference) {
            const total = deepCountKeys(reference);
            const stats = deepCompare(reference, parsed, !!isLexicon);
            validationStats = { total, ...stats };
         }
      } catch (e) {
         // Ignore invalid JSON parsing for stats
      }
   }

   const addMissingStrings = () => {
      if (!editorRef || !activeFile) return;
      try {
         const parsed = JSON.parse(activeFile.content);
         const isLexiconActive = activeFile?.content?.includes('_meta_lang') || activeFile?.content?.includes('"a_citizen"') || activeFile?.name.startsWith('en-') || activeFile?.name.startsWith('de-') || activeFile?.name.startsWith('es-') || activeFile?.name.startsWith('fr-');
         const isEnDefault = activeFile?.name.includes('en-default');
         const reference = isEnDefault ? null : (referenceData && Object.keys(referenceData).length > 0 ? referenceData : (isLexiconActive ? enDefault : null));

         if (!reference) return;

         const newObj = deepAddMissing(reference, parsed, isLexiconActive);
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
         pushStatus(t("alert_error"), "error");
      }
   };

   const purgeDeprecatedStrings = () => {
      if (!editorRef || !activeFile) return;
      try {
         const parsed = JSON.parse(activeFile.content);
         const isLexiconActive = activeFile?.content?.includes('_meta_lang') || activeFile?.content?.includes('"a_citizen"') || activeFile?.name.startsWith('en-') || activeFile?.name.startsWith('de-') || activeFile?.name.startsWith('es-') || activeFile?.name.startsWith('fr-');
         const isEnDefault = activeFile?.name.includes('en-default');
         const reference = isEnDefault ? null : (referenceData && Object.keys(referenceData).length > 0 ? referenceData : (isLexiconActive ? enDefault : null));

         if (!reference) return;

         const newObj = deepPurgeDeprecated(reference, parsed, isLexiconActive);
         const newContent = JSON.stringify(newObj, null, 2);
         const model = editorRef.getModel();
         if (model) {
            const fullRange = model.getFullModelRange();
            editorRef.executeEdits("purge-deprecated", [{ range: fullRange, text: newContent, forceMoveMarkers: true }]);
         }
      } catch (e) {
         pushStatus(t("alert_error"), "error");
      }
   };

   const jumpToNextEmpty = () => {
      if (!editorRef) return;
      const model = editorRef.getModel();
      if (!model) return;
      const matches = model.findMatches('"[^"]+"\\s*:\\s*(""|\\[\\]|\\{\\})', false, true, false, null, true);
      if (matches && matches.length > 0) {
         const position = editorRef.getPosition();
         if (!position) return;
         let nextMatch = matches.find((m: any) => m.range.startLineNumber > position.lineNumber || (m.range.startLineNumber === position.lineNumber && m.range.startColumn > position.column));
         if (!nextMatch) nextMatch = matches[0]; // Wrap around
         editorRef.revealLineInCenter(nextMatch.range.startLineNumber);
         editorRef.setPosition({ lineNumber: nextMatch.range.endLineNumber, column: nextMatch.range.endColumn - 1 });
         editorRef.focus();
      }
   };

   const cloudTabs = [
      { id: "sanctuary_schemas", label: "Schemas", icon: "data_object" },
      { id: "sanctuary_lexicons", label: "Lexicons", icon: "translate" }
   ];

   const localTabs = [
      { id: "overview", label: t("landing_overview") || "Overview", icon: "dashboard" },
      { id: "templates", label: t("upload_template_title") || "Templates", icon: "data_object" },
      { id: "lexicon", label: t("tab_lexicons") || "Lexicons", icon: "translate" },
      { id: "settings", label: t("tab_settings") || "Settings", icon: "settings" }
   ];

   const tabs = isCloudMode ? cloudTabs : localTabs;
   const activeTab = isCloudMode ? internalCloudTarget : fileTypeFilter;

   return (
      <ElevatedHubLayout
         headerTitle={t("ide_title") || "Architect Studio"}
         headerIcon="code"
         search={searchQuery}
         onSearchChange={setSearchQuery}
         searchPlaceholder={t("search_files") as string}
         tabs={tabs}
         activeTab={activeTab}
         onTabChange={(id) => {
            if (isCloudMode) setInternalCloudTarget(id as any);
            else setFileTypeFilter(id);
         }}
         headerActions={
            <div className="flex items-center gap-2">
               {!(isCloudMode && internalCloudTarget === 'sanctuary_schemas') && (
                  <>
                     <div className="md:hidden">
                        <FilterPopover icon="more_vert" label={t("hub_actions") || "Actions"}>
                           <div className="flex flex-col gap-4">
                              <ActionButton
                                 onClick={() => setIsCreatePanelOpen(true)}
                                 icon={t("icon_add") || "add"}
                                 label={t("auto_create_file")}
                                 className="w-full h-10 px-6 font-black capitalize tracking-widest text-[10px] !w-auto"
                              />
                              <ActionButton
                                 onClick={handleImport}
                                 icon={t("icon_upload") || "upload"}
                                 label={t("import_file")}
                                 className="w-full h-10 px-6 font-black capitalize tracking-widest text-[10px] !w-auto"
                              />
                           </div>
                        </FilterPopover>
                     </div>
                     <ActionButton
                        onClick={() => setIsCreatePanelOpen(true)}
                        iconOnly={true}
                        icon={t("icon_add")}
                        label={t("auto_create_file")}
                        className="hidden md:flex shrink-0 h-10 w-10 px-0"
                     />
                     <ActionButton
                        onClick={handleImport}
                        iconOnly={true}
                        icon={t("icon_upload")}
                        label={t("import_file")}
                        className="hidden md:flex shrink-0 h-10 w-10 px-0"
                     />
                  </>
               )}
            </div>
         }
      >
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

         <div className="flex-1 overflow-hidden relative px-6 flex flex-col pt-4">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
               {fileTypeFilter === 'overview' && !isCloudMode ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                     <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                           <span className="material-symbols-outlined text-[var(--accent)]">history</span>
                           <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("ide_recent_files") || "Recent Files"}</h3>
                           <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
                        </div>
                        <MasonFileBrowser
                           t={t}
                           isCloudMode={isCloudMode}
                           internalCloudTarget={internalCloudTarget}
                           files={files.slice(0, 10)}
                           searchQuery={searchQuery}
                           fileTypeFilter="all"
                           openFile={openFile}
                           renamingFile={renamingFile}
                           setRenamingFile={setRenamingFile}
                           renameInput={renameInput}
                           setRenameInput={setRenameInput}
                           renameExt={renameExt}
                           setRenameExt={setRenameExt}
                           handleRenameSubmit={handleRenameSubmit}
                           deleteConfirmPath={deleteConfirmPath}
                           setDeleteConfirmPath={setDeleteConfirmPath}
                           handleDeleteFile={handleDeleteFile}
                           openFiles={openFiles}
                           handlePublishLexicon={handlePublishLexicon}
                        />
                     </div>
                     <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                           <span className="material-symbols-outlined text-[var(--warning)]">warning</span>
                           <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("ide_unsaved_files") || "Unsaved Changes"}</h3>
                           <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
                        </div>
                        <MasonFileBrowser
                           t={t}
                           isCloudMode={isCloudMode}
                           internalCloudTarget={internalCloudTarget}
                           files={openFiles.filter((f: any) => f.content !== f.originalContent)}
                           searchQuery={searchQuery}
                           fileTypeFilter="all"
                           openFile={openFile}
                           renamingFile={renamingFile}
                           setRenamingFile={setRenamingFile}
                           renameInput={renameInput}
                           setRenameInput={setRenameInput}
                           renameExt={renameExt}
                           setRenameExt={setRenameExt}
                           handleRenameSubmit={handleRenameSubmit}
                           deleteConfirmPath={deleteConfirmPath}
                           setDeleteConfirmPath={setDeleteConfirmPath}
                           handleDeleteFile={handleDeleteFile}
                           openFiles={openFiles}
                           handlePublishLexicon={handlePublishLexicon}
                        />
                     </div>
                  </div>
               ) : (
                  <MasonFileBrowser
                     t={t}
                     isCloudMode={isCloudMode}
                     internalCloudTarget={internalCloudTarget}
                     files={files}
                     searchQuery={searchQuery}
                     fileTypeFilter={fileTypeFilter}
                     fetchError={mason.fetchError}
                     openFile={openFile}
                     renamingFile={renamingFile}
                     setRenamingFile={setRenamingFile}
                     renameInput={renameInput}
                     setRenameInput={setRenameInput}
                     renameExt={renameExt}
                     setRenameExt={setRenameExt}
                     handleRenameSubmit={handleRenameSubmit}
                     deleteConfirmPath={deleteConfirmPath}
                     setDeleteConfirmPath={setDeleteConfirmPath}
                     handleDeleteFile={handleDeleteFile}
                     openFiles={openFiles}
                     handlePublishLexicon={handlePublishLexicon}
                  />
               )}
            </div>
         </div>

         <MasonEditorPanel
            t={t}
            isCloudMode={isCloudMode}
            isKeepers={isKeepers}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            showReference={showReference}
            setShowReference={setShowReference}
            showTimeline={showTimeline}
            setShowTimeline={setShowTimeline}
            activeFile={activeFile}
            activeFileIndex={activeFileIndex}
            setActiveFileIndex={setActiveFileIndex}
            problemsList={problemsList}
            setProblemsList={setProblemsList}
            validationStats={validationStats}
            isDirty={isDirty}
            saveFile={saveFile}
            handlePublishLexicon={handlePublishLexicon}
            openFiles={openFiles}
            closeFile={closeFile}
            splitRatio={splitRatio}
            isLight={isLight}
            addMissingStrings={addMissingStrings}
            purgeDeprecatedStrings={purgeDeprecatedStrings}
            jumpToNextEmpty={jumpToNextEmpty}
            handleEditorWillMount={handleEditorWillMount}
            handleEditorChange={handleEditorChange}
            setEditorRef={setEditorRef}
            validateContent={validateContent}
            referenceLabel={referenceLabel}
            referenceData={referenceData}
            isResizing={isResizing}
            editorRef={editorRef}
            activeVersionTimestamp={activeVersionTimestamp}
            setActiveVersionTimestamp={setActiveVersionTimestamp}
            setOpenFiles={setOpenFiles}
            pushStatus={pushStatus}
         />

         <SidePanel
            isOpen={isCreatePanelOpen}
            onClose={() => setIsCreatePanelOpen(false)}
            title={t("auto_create_file")}
            subtitle={t("auto_create_file_sub")}
            icon={t("icon_add")}
            footer={
               <div className="flex justify-center items-center gap-4 w-full">
                  <ActionButton
                     type="button"
                     onClick={() => { setIsCreatePanelOpen(false); setCreateFileName(""); }} label={t("nav_cancel")}
                  >

                  </ActionButton>
                  <ActionButton
                     onClick={handleCreateSubmit}
                     disabled={!createFileName.trim() || !createFileExt.trim()}
                     className="shrink-0 h-12"
                     label={t("auto_create")}
                  />
               </div>
            }
         >
            <div className="p-6 flex flex-col gap-6 h-full">
               {!isCloudMode && (
                  <div className="flex p-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl shadow-inner mb-2">
                     <button
                        onClick={() => setCreateMode("standard")}
                        className={`flex-1 py-3 text-[11px] font-black capitalize tracking-widest rounded-xl transition-all ${createMode === "standard" ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent'}`}
                     >
                        {t("auto_standard_file")}
                     </button>
                     <button
                        onClick={() => setCreateMode("lexicon")}
                        className={`flex-1 py-3 text-[11px] font-black capitalize tracking-widest rounded-xl transition-all ${createMode === "lexicon" ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent'}`}
                     >
                        <span className="material-symbols-outlined !text-[14px] align-middle mr-2">translate</span>
                        {t("auto_lexicon_pack")}
                     </button>
                  </div>
               )}

               {isCloudMode && (
                  <div className="text-center text-[var(--accent)] font-black text-[12px] tracking-widest capitalize mb-2">
                     CREATING {internalCloudTarget === 'sanctuary_lexicons' ? 'MASTER LEXICON' : 'MASTER SCHEMA'}
                  </div>
               )}

               {(!isCloudMode && createMode === "lexicon") || (isCloudMode && internalCloudTarget === 'sanctuary_lexicons') ? (
                  <div className="flex gap-4">
                     <div className="flex flex-col gap-2 w-30">
                        <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] ml-1">{t("label_lang_code")}</label>
                        <input
                           type="text"
                           value={lexiconLang}
                           onChange={e => setLexiconLang(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                           placeholder="es"
                           className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono text-center"
                           autoFocus
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSubmit();
                           }}
                        />
                     </div>
                     <div className="flex flex-col gap-2 flex-1">
                        <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] ml-1">{t("label_lexicon_name")}</label>
                        <input
                           type="text"
                           value={createFileName}
                           onChange={e => setCreateFileName(e.target.value)}
                           placeholder="default"
                           className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSubmit();
                           }}
                        />
                     </div>
                  </div>
               ) : (
                  <div className="flex gap-4">
                     <div className="flex flex-col gap-2 flex-1">
                        <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] ml-1">{t("author_filename")}</label>
                        <input
                           type="text"
                           value={createFileName}
                           onChange={e => setCreateFileName(e.target.value)}
                           placeholder="example"
                           className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                           autoFocus
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSubmit();
                           }}
                        />
                     </div>
                     <div className="flex flex-col gap-2 w-32">
                        <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] ml-1">{t("auto_extension")}</label>
                        <input
                           type="text"
                           value={createFileExt}
                           onChange={e => setCreateFileExt(e.target.value)}
                           placeholder=".json"
                           className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
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
      </ElevatedHubLayout>
   );
}


