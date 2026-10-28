import React from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { EmptyState } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { DynamicTemplatePreviewBanner } from "../chameleon-components/ThemeCard";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

interface WorkbenchFileCardProps {
  file: { name: string; path: string };
  isTmpl: boolean;
  renamingFile: string | null;
  renameInput: string;
  deleteConfirmPath: string | null;
  setRenameInput: (val: string) => void;
  setRenamingFile: (path: string | null) => void;
  setDeleteConfirmPath: (path: string | null) => void;
  handleRenameSubmit: (path: string, name: string) => void;
  handleDeleteTemplate: (path: string) => void;
  openFile: (file: any) => void;
}

const WorkbenchFileCard = React.memo(
  ({
    file,
    isTmpl,
    renamingFile,
    renameInput,
    deleteConfirmPath,
    setRenameInput,
    setRenamingFile,
    setDeleteConfirmPath,
    handleRenameSubmit,
    handleDeleteTemplate,
    openFile,
  }: WorkbenchFileCardProps) => {
    const { t } = useLexicon();
    const hasUnsavedEdits = useStore((state) => state.cwUnsavedEdits[file.path] !== undefined);

    const dotIndex = file.name.lastIndexOf(".");
    const baseTitle = dotIndex > 0 ? file.name.substring(0, dotIndex) : file.name;
    const extLabel =
      dotIndex > 0
        ? file.name.substring(dotIndex)
        : isTmpl
          ? t("schema_json", ".json")
          : t("schema_system", ".cfg");

    const titleContent =
      renamingFile === file.path ? (
        <div
          className="flex items-center gap-2 w-full mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit(file.path, file.name);
              if (e.key === "Escape") setRenamingFile(null);
            }}
            className="h-8 w-full min-w-0 px-3 rounded-xl text-[12px] font-black glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] text-[var(--text)] focus:outline-none transition-all placeholder:text-[var(--subtext)]"
            placeholder={file.name}
          />
          <button
            type="button"
            onClick={() => handleRenameSubmit(file.path, file.name)}
            className="shrink-0 w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] hover:border-[var(--success)] flex items-center justify-center transition-all"
          >
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_check", "check")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRenamingFile(null)}
            className="shrink-0 w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] flex items-center justify-center transition-all"
          >
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_close", "close")}
            </span>
          </button>
        </div>
      ) : (
        baseTitle
      );

    const actionsNode =
      isTmpl && renamingFile !== file.path ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5"
        >
          {deleteConfirmPath === file.path ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTemplate(file.path);
                  setDeleteConfirmPath(null);
                }}
                className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_check", "check")}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmPath(null);
                }}
                className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_close", "close")}
                </span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingFile(file.path);
                  const d = file.name.lastIndexOf(".");
                  setRenameInput(d > 0 ? file.name.substring(0, d) : file.name);
                }}
                className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] opacity-80 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] transition-all"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_edit", "edit")}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmPath(file.path);
                }}
                className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] opacity-80 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-[var(--danger)] transition-all"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_delete", "delete")}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : undefined;

    return (
      <UniversalCard
        layout="vertical"
        onClick={() => openFile(file)}
        icon={isTmpl ? t("icon_data_object", "data_object") : t("icon_settings", "settings")}
        customIcon={
          isTmpl ? (
            <DynamicTemplatePreviewBanner data={file} heightClass="h-full" />
          ) : undefined
        }
        title={titleContent}
        subtitle={isTmpl ? t("ql_templates", "Templates") : t("configs", "Configs")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            {hasUnsavedEdits ? (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_edit_note", "edit_note")}
                </span>
                <span>{t("unsaved", "Unsaved")}</span>
              </div>
            ) : (
              <div className={VAULT_CHIP_CLASS}>
                <span
                  className={`material-symbols-outlined !text-[12px] ${
                    isTmpl ? "text-[var(--success)]" : "text-[var(--accent)]"
                  }`}
                >
                  {isTmpl ? t("icon_data_object", "data_object") : t("icon_settings", "settings")}
                </span>
                <span>{isTmpl ? t("ql_templates", "Templates") : t("configs", "Configs")}</span>
              </div>
            )}
          </div>
        }
        actions={actionsNode}
        badges={
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
              {isTmpl ? t("icon_data_object", "data_object") : t("icon_description", "description")}
            </span>
            <span className="text-[var(--subtext)]">{extLabel}</span>
          </div>
        }
        footer={
          <div className="flex gap-2 items-center justify-between w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
              {extLabel}
            </span>
            <button
              type="button"
              className="text-[10px] font-black text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0"
            >
              {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
            </button>
          </div>
        }
      />
    );
  }
);

interface WorkbenchFileGridProps {
  filteredMainFiles: { name: string; path: string }[];
  mainTab: string;
  renamingFile: string | null;
  renameInput: string;
  deleteConfirmPath: string | null;
  setRenameInput: (val: string) => void;
  setRenamingFile: (path: string | null) => void;
  setDeleteConfirmPath: (path: string | null) => void;
  handleRenameSubmit: (path: string, name: string) => void;
  handleDeleteTemplate: (path: string) => void;
  openFile: (file: any) => void;
  onNewTemplate?: () => void;
}

export const WorkbenchFileGrid = React.memo(
  ({
    filteredMainFiles,
    mainTab,
    renamingFile,
    renameInput,
    deleteConfirmPath,
    setRenameInput,
    setRenamingFile,
    setDeleteConfirmPath,
    handleRenameSubmit,
    handleDeleteTemplate,
    openFile,
    onNewTemplate,
  }: WorkbenchFileGridProps) => {
    const { t } = useLexicon();

    if (filteredMainFiles.length === 0) {
      return (
        <EmptyState
          icon={
            mainTab === "CONFIGS"
              ? t("icon_search_off", "search_off")
              : t("icon_data_object", "data_object")
          }
          title={t("workbench_no_files_found", "No Files Found")}
          action={
            mainTab === "TEMPLATES" && onNewTemplate ? (
              <button
                type="button"
                onClick={onNewTemplate}
                className="h-11 px-5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] font-black capitalize tracking-widest text-[11px] flex items-center justify-center gap-2 hover:scale-[1.02] transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_add", "add")}
                </span>
                {t("btn_new_template", "New Template")}
              </button>
            ) : undefined
          }
        />
      );
    }

    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {filteredMainFiles.map((file) => (
          <WorkbenchFileCard
            key={file.path}
            file={file}
            isTmpl={file.name.toLowerCase().endsWith(".json")}
            renamingFile={renamingFile}
            renameInput={renameInput}
            deleteConfirmPath={deleteConfirmPath}
            setRenameInput={setRenameInput}
            setRenamingFile={setRenamingFile}
            setDeleteConfirmPath={setDeleteConfirmPath}
            handleRenameSubmit={handleRenameSubmit}
            handleDeleteTemplate={handleDeleteTemplate}
            openFile={openFile}
          />
        ))}
      </div>
    );
  }
);
