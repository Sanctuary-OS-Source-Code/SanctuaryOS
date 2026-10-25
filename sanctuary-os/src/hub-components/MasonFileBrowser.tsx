import { EmptyState } from "../shared";
import { useState, useEffect } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { UniversalCard } from "../components/universal/UniversalCard";
import { hasIdeCachedDraft } from "../hooks/useMasonFiles";
import {
  DynamicLexiconPreviewBanner,
  DynamicTemplatePreviewBanner,
} from "../chameleon-components/ThemeCard";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function MasonFileBrowser({
  t,
  files,
  searchQuery,
  fileTypeFilter,
  lexiconScopeFilter = "all",
  lexiconLanguageFilter = "all",
  lexiconCommunityFilter = "all",
  openFile,
  renamingFile,
  setRenamingFile,
  renameInput,
  setRenameInput,
  renameExt,
  setRenameExt,
  handleRenameSubmit,
  deleteConfirmPath,
  setDeleteConfirmPath,
  handleDeleteFile,
  openFiles = [],
  isCloudMode,
  internalCloudTarget,
  fetchError,
  layout,
}: any) {
  const [templatePaths, setTemplatePaths] = useState<string[]>([]);

  useEffect(() => {
    if (fileTypeFilter === "templates" && !isCloudMode) {
      const checkTemplates = async () => {
        const tmplPaths: string[] = [];
        for (const f of files) {
          if (f.name.toLowerCase().endsWith(".json")) {
            try {
              const content = await readTextFile(f.path);
              if (content.includes('"template_id"')) {
                tmplPaths.push(f.path);
              }
            } catch {
              // ignore
            }
          }
        }
        setTemplatePaths(tmplPaths);
      };
      checkTemplates();
    }
  }, [fileTypeFilter, files, isCloudMode]);

  const isFileUnsaved = (file: any) => {
    const inMemoryUnsaved = Boolean(
      openFiles.find((o: any) => o.path === file.path && o.content !== o.originalContent)
    );
    return inMemoryUnsaved || hasIdeCachedDraft(file.path);
  };

  const filteredFiles = (files || []).filter((f: any) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = (f.name || "").toLowerCase().includes(q);
      const matchDisplay = (f.displayName || "").toLowerCase().includes(q);
      const matchLang = (f.language || "").toLowerCase().includes(q);
      const matchComm = (f.community || "").toLowerCase().includes(q);
      const matchAuthor = (f.author || "").toLowerCase().includes(q);
      if (!matchName && !matchDisplay && !matchLang && !matchComm && !matchAuthor) return false;
    }

    const isLexiconView =
      (isCloudMode && internalCloudTarget === "sanctuary_lexicons") ||
      fileTypeFilter === "lexicon";

    if (isLexiconView) {
      if (
        !isCloudMode &&
        !f.name.match(/^[a-z]{2}-.+\.json$/i) &&
        f.name.toLowerCase() !== "simlish.json"
      ) {
        return false;
      }
      if (lexiconScopeFilter === "core" && !f.isOfficialCore) return false;
      if (lexiconScopeFilter === "community" && f.isOfficialCore) return false;
      if (lexiconScopeFilter === "unsaved" && !isFileUnsaved(f)) return false;
      if (
        lexiconLanguageFilter &&
        lexiconLanguageFilter !== "all" &&
        (f.language || "English") !== lexiconLanguageFilter
      ) {
        return false;
      }
      if (
        lexiconCommunityFilter &&
        lexiconCommunityFilter !== "all" &&
        (f.community || "Community") !== lexiconCommunityFilter
      ) {
        return false;
      }
      return true;
    }

    if (fileTypeFilter === "templates") {
      if (!templatePaths.includes(f.path)) return false;
    } else if (fileTypeFilter === "settings") {
      if (!f.name.toLowerCase().endsWith(".ini") && !f.name.toLowerCase().endsWith(".cfg"))
        return false;
    } else if (fileTypeFilter !== "all") {
      if (!f.name.toLowerCase().endsWith(`.${fileTypeFilter}`)) return false;
    }
    return true;
  });

  if (fetchError) {
    return (
      <EmptyState
        icon={t("icon_error", "error")}
        title={t("fetch_error", "Fetch Error")}
        subtitle={fetchError}
        className="col-span-full py-16"
      />
    );
  }

  if (filteredFiles.length === 0) {
    return (
      <EmptyState
        icon={t("icon_folder_off", "folder_off")}
        title={t("workbench_no_files_found", "No Files Found")}
        className="col-span-full py-16"
      />
    );
  }

  const gridClass =
    layout === "overview" || layout === "list"
      ? "col-span-full grid grid-cols-1 md:grid-cols-2 gap-6 w-full"
      : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full px-2 py-4";

  return (
    <div className={gridClass}>
      {filteredFiles.map((file: any) => {
        const isTmpl = file.name.toLowerCase().endsWith(".json");
        const isLexicon = isCloudMode
          ? internalCloudTarget === "sanctuary_lexicons"
          : Boolean(
              file.name.match(/^[a-z]{2}-.+\.json$/i) ||
                file.name.toLowerCase() === "simlish.json"
            );
        const isUnsaved = isFileUnsaved(file);
        const rawBaseName =
          file.name.lastIndexOf(".") > 0
            ? file.name.substring(0, file.name.lastIndexOf("."))
            : file.name;
        const displayName = isLexicon && file.displayName ? file.displayName : rawBaseName;
        const displaySub = isLexicon
          ? file.author
            ? `${file.author} • ${file.name}`
            : t("auto_lexicon_pack", "Lexicon Pack")
          : file.name.lastIndexOf(".") > 0
            ? file.name.substring(file.name.lastIndexOf("."))
            : isTmpl
              ? t("json_file", "JSON File")
              : t("source_file", "Source File");
        const cardIcon = isLexicon
          ? t("icon_translate", "translate")
          : isTmpl
            ? t("icon_data_object", "data_object")
            : t("icon_description", "description");

        const canMutateFile =
          !(isCloudMode && internalCloudTarget === "sanctuary_schemas") &&
          !file.isOfficialCore;

        return (
          <UniversalCard
            key={file.path}
            layout="vertical"
            icon={isLexicon || fileTypeFilter === "templates" ? undefined : cardIcon}
            customIcon={
              isLexicon ? (
                <DynamicLexiconPreviewBanner data={file} heightClass="h-full" />
              ) : fileTypeFilter === "templates" ? (
                <DynamicTemplatePreviewBanner data={file} heightClass="h-full" />
              ) : undefined
            }
            title={renamingFile === file.path ? undefined : displayName}
            subtitle={renamingFile === file.path ? undefined : displaySub}
            onClick={() => !renamingFile && openFile(file)}
            className={
              isUnsaved ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)]" : ""
            }
            imageOverlay={
              <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                {isUnsaved ? (
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_warning", "warning")}
                    </span>
                    <span>{t("unsaved_changes", "Unsaved")}</span>
                  </div>
                ) : (
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {isCloudMode
                        ? t("icon_cloud_done", "cloud_done")
                        : t("icon_science", "science")}
                    </span>
                    <span>{isCloudMode ? t("synced", "Synced") : t("local", "Local")}</span>
                  </div>
                )}
              </div>
            }
            badges={
              <div className="flex flex-wrap items-center gap-1.5">
                {isLexicon && file.community && (
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {file.isOfficialCore
                        ? t("icon_verified", "verified")
                        : t("icon_public", "public")}
                    </span>
                    <span>{file.community}</span>
                  </div>
                )}
                {isLexicon && file.language ? (
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_language", "language")}
                    </span>
                    <span>{file.language}</span>
                  </div>
                ) : (
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {cardIcon}
                    </span>
                    <span>
                      {isLexicon
                        ? t("auto_lexicon_pack", "Lexicon Pack")
                        : internalCloudTarget === "sanctuary_schemas"
                          ? t("tab_schemas", "Master Schemas")
                          : isTmpl
                            ? t("json_file", "JSON File")
                            : t("source_file", "Source File")}
                    </span>
                  </div>
                )}
              </div>
            }
            footer={
              renamingFile !== file.path ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-between w-full gap-2"
                >
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 truncate font-mono">
                    {file.name}
                  </span>
                  {deleteConfirmPath === file.path ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(file.path);
                          setDeleteConfirmPath(null);
                        }}
                        className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] bg-transparent hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_check", "check")}
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmPath(null);
                        }}
                        className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] bg-transparent hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_close", "close")}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {canMutateFile && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingFile(file.path);
                              const d = file.name.lastIndexOf(".");
                              setRenameInput(d > 0 ? file.name.substring(0, d) : file.name);
                              setRenameExt(d > 0 ? file.name.substring(d) : "");
                            }}
                            className="w-7 h-7 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_15%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:text-[var(--text)] transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_edit", "edit")}
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmPath(file.path);
                            }}
                            className="w-7 h-7 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_15%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:text-[var(--danger)] transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_delete", "delete")}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : undefined
            }
          >
            {renamingFile === file.path && (
              <div
                className="flex items-center gap-2 z-20 mt-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-1 w-full min-w-0">
                  <input
                    type="text"
                    value={renameInput}
                    onChange={(e) => setRenameInput(e.target.value)}
                    className="h-8 w-full min-w-0 px-3 rounded-xl text-[12px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] text-[var(--text)] focus:outline-none focus:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] shadow-inner font-mono"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(file.path, file.name);
                      if (e.key === "Escape") setRenamingFile(null);
                    }}
                  />
                  <input
                    type="text"
                    value={renameExt}
                    onChange={(e) => setRenameExt(e.target.value)}
                    className="h-6 w-16 px-2 rounded-lg text-[10px] font-bold capitalize tracking-widest bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)] text-[var(--subtext)] focus:outline-none transition-all placeholder:text-[color-mix(in_srgb,var(--subtext)_50%,transparent)] shadow-inner"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(file.path, file.name);
                      if (e.key === "Escape") setRenamingFile(null);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => handleRenameSubmit(file.path, file.name)}
                    className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] bg-transparent hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-sm">
                      {t("icon_check", "check")}
                    </span>
                  </button>
                  <button
                    onClick={() => setRenamingFile(null)}
                    className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] bg-transparent hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-sm">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </UniversalCard>
        );
      })}
    </div>
  );
}
