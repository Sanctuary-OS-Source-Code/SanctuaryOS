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
import MasonHeader from "./hub-components/MasonHeader";
import MasonFileBrowser from "./hub-components/MasonFileBrowser";
import MasonEditorPanel from "./hub-components/MasonEditorPanel";
import { deepCountKeys, deepCompare, createEmptyClone, deepAddMissing, deepPurgeDeprecated } from "./lib/MasonValidation";
import { useMasonFiles } from "./hooks/useMasonFiles";

export default function MasonIDE({ vaultPath, isCloudMode, cloudTarget = "sanctuary_schemas" }: { vaultPath?: string, isCloudMode?: boolean, cloudTarget?: "sanctuary_schemas" | "sanctuary_lexicons" }) {
   const mason = useMasonFiles({ vaultPath, isCloudMode, cloudTarget });
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
            const isLex = file.name.match(/^[a-z]{2}-.+\.json$/i);
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

            const payload = actualCloudTarget === 'sanctuary_lexicons'
               ? { id: fileId, name: fileId, badge: parsed._meta_badge || 'Sanctuary', version: parsed._meta_version || 1, lexicon_data: parsed, updated_at: new Date().toISOString() }
               : { id: fileId, schema_data: parsed, version: parsed.schema_version || 1, updated_at: new Date().toISOString() };

            const { error } = await supabase.from(actualCloudTarget).upsert(payload);
            if (error) throw error;

            if (fileId === 'sims4') {
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
         setUploadState((s: any) => ({ ...s, isOpen: false }));
      } catch (err: any) {
         console.error("SUPABASE ERROR:", err);
         pushStatus((t("alert_error") || `Error: `) + `${err.message}`, "error");
      }
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

   const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
   const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;

   let validationStats: { total: number, missing: number, completelyMissing: number, deprecated: number } | null = null;
   const isLexicon = activeFile?.content?.includes('_meta_lang') || activeFile?.content?.includes('"a_citizen"') || activeFile?.name.startsWith('en-') || activeFile?.name.startsWith('de-') || activeFile?.name.startsWith('es-') || activeFile?.name.startsWith('fr-');
   const isSchema = activeFile?.content?.includes('"schema_version"') || (isCloudMode && !isLexicon);

   if (activeFile && (isLexicon || isSchema)) {
      try {
         const parsed = JSON.parse(activeFile.content);
         const reference = isLexicon ? enDefault : (referenceData && typeof referenceData === 'object' && !Array.isArray(referenceData) && !referenceData._meta_lang ? referenceData : null);

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
         const reference = isLexiconActive ? enDefault : (referenceData && typeof referenceData === 'object' && !Array.isArray(referenceData) && !referenceData._meta_lang ? referenceData : null);

         if (!reference) return;

         const newObj = deepAddMissing(reference, parsed);
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
         const isLexiconActive = activeFile?.content?.includes('_meta_lang') || activeFile?.content?.includes('"a_citizen"') || activeFile?.name.startsWith('en-') || activeFile?.name.startsWith('de-') || activeFile?.name.startsWith('es-') || activeFile?.name.startsWith('fr-');
         const reference = isLexiconActive ? enDefault : (referenceData && typeof referenceData === 'object' && !Array.isArray(referenceData) && !referenceData._meta_lang ? referenceData : null);

         if (!reference) return;

         const newObj = deepPurgeDeprecated(reference, parsed);
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
         <MasonHeader
            t={t}
            isCloudMode={isCloudMode}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            fileTypeFilter={fileTypeFilter}
            setFileTypeFilter={setFileTypeFilter}
            internalCloudTarget={internalCloudTarget}
            setInternalCloudTarget={setInternalCloudTarget}
            setIsCreatePanelOpen={setIsCreatePanelOpen}
            handleImport={handleImport}
         />

         <div className="flex-1 overflow-hidden relative px-6 flex flex-col">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">


               <MasonFileBrowser
                  t={t}
                  files={files}
                  searchQuery={searchQuery}
                  fileTypeFilter={fileTypeFilter}
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

         <MasonEditorPanel
            t={t}
            isCloudMode={isCloudMode}
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
                     {t("nav_cancel") || "Cancel"}
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
               {!isCloudMode && (
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
               )}

               {isCloudMode && (
                  <div className="text-center text-[var(--accent)] font-black text-[12px] tracking-widest uppercase mb-2">
                     CREATING {internalCloudTarget === 'sanctuary_lexicons' ? 'MASTER LEXICON' : 'MASTER SCHEMA'}
                  </div>
               )}

               {(!isCloudMode && createMode === "lexicon") || (isCloudMode && internalCloudTarget === 'sanctuary_lexicons') ? (
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
