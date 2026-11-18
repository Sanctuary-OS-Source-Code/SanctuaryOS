import { useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { ActionButton } from "../../shared-components/buttons";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";
import { KeeperDocPresenceEntry } from "../../utils/useKeeperDocPresence";

export interface KeeperDocConflictInfo {
  baseRevision: number;
  serverRevision: number;
  updatedBy: string;
  updatedAt?: string;
  serverTitle?: string;
  serverMarkdown: string;
  localMarkdown: string;
  isSaveBlocked?: boolean;
}

export function KeeperDocConflictBar({
  peerEditors = [],
  hasLocalMdChanges = false,
  localFileName,
  onImportLocalMd,
  conflictInfo,
  onLoadLatestFromHub,
  onOverwriteWithMine,
  onDismissConflict,
}: {
  peerEditors?: KeeperDocPresenceEntry[];
  hasLocalMdChanges?: boolean;
  localFileName?: string;
  onImportLocalMd?: () => void;
  conflictInfo?: KeeperDocConflictInfo | null;
  onLoadLatestFromHub?: () => void;
  onOverwriteWithMine?: () => void;
  onDismissConflict?: () => void;
}) {
  const { t } = useLexicon();
  const [showCompare, setShowCompare] = useState(false);
  const [copiedMine, setCopiedMine] = useState(false);

  if (peerEditors.length === 0 && !conflictInfo && !hasLocalMdChanges) {
    return null;
  }

  const handleCopyMine = async () => {
    if (!conflictInfo?.localMarkdown) return;
    try {
      await navigator.clipboard?.writeText(conflictInfo.localMarkdown);
      setCopiedMine(true);
      setTimeout(() => setCopiedMine(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 1. Soft Realtime Presence Banner */}
      {peerEditors.length > 0 && (
        <div className="glass-panel rounded-2xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_group", "group")}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-black text-[var(--text)] tracking-tight truncate">
                {t("keeper_collab_editing_now", "Another Keeper is currently viewing or editing this document")}
              </span>
              <span className="text-[10px] text-[var(--subtext)] opacity-80 truncate">
                {t("keeper_collab_presence_hint", "Save conflicts are guarded by optimistic revision checks so no edits are silently lost.")}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {peerEditors.map((peer) => (
              <span key={peer.sessionId} className={VAULT_CHIP_CLASS}>
                <span
                  className={`material-symbols-outlined !text-[12px] ${peer.hasUnsavedChanges ? "text-[var(--warning)]" : "text-[var(--accent)]"
                    }`}
                >
                  {peer.hasUnsavedChanges
                    ? t("icon_edit_note", "edit_note")
                    : t("icon_visibility", "visibility")}
                </span>
                <span>
                  @{peer.username}
                  {peer.hasUnsavedChanges
                    ? ` • ${t("status_unsaved_changes", "Unsaved Changes")}`
                    : ""}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 2. Revision Conflict / Upstream Update Resolution Panel */}
      {conflictInfo && (
        <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined !text-[17px] text-[var(--warning)]">
                  {t("icon_merge_type", "merge_type")}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-black text-[var(--text)] tracking-tight">
                  {conflictInfo.isSaveBlocked
                    ? t(
                      "keeper_conflict_blocked_title",
                      "Save paused — newer revision detected on Keepers Core"
                    )
                    : t(
                      "keeper_conflict_upstream_title",
                      "Newer revision saved on Keepers Core while you have a draft"
                    )}
                </span>
                <p className="text-[11px] text-[var(--subtext)] opacity-85 leading-relaxed">
                  {t(
                    "keeper_conflict_desc",
                    "{0} saved revision v{1} while your draft is based on v{2}. Load Latest, Compare side-by-side, or explicitly Overwrite Hub with your version."
                  )
                    .replace("{0}", conflictInfo.updatedBy || t("author_sanctuary_team", "Sanctuary Foundry"))
                    .replace("{1}", String(conflictInfo.serverRevision))
                    .replace("{2}", String(conflictInfo.baseRevision))}
                </p>
              </div>
            </div>

            {onDismissConflict && (
              <ActionButton
                variant="glass"
                icon={t("icon_close", "close")}
                label={t("dismiss", "Dismiss")}
                iconOnly={true}
                onClick={onDismissConflict}
                className="!w-7 !h-7 !rounded-lg shrink-0"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onLoadLatestFromHub && (
              <ActionButton
                variant="accent"
                icon={t("icon_cloud_download", "cloud_download")}
                onClick={onLoadLatestFromHub}
                className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("keeper_conflict_btn_load_latest", "Load Latest (Hub)")}
              </ActionButton>
            )}
            <ActionButton
              variant="glass"
              icon={t("icon_compare_arrows", "compare_arrows")}
              onClick={() => setShowCompare((prev) => !prev)}
              className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
            >
              {showCompare
                ? t("keeper_conflict_btn_hide_compare", "Hide Compare")
                : t("keeper_conflict_btn_compare", "Compare")}
            </ActionButton>
            {onOverwriteWithMine && (
              <ActionButton
                variant="warning"
                icon={t("icon_upload", "upload")}
                onClick={onOverwriteWithMine}
                className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("keeper_conflict_btn_overwrite_mine", "Overwrite Hub with Mine")}
              </ActionButton>
            )}
          </div>

          {showCompare && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_edit", "edit")}
                    </span>
                    <span>
                      {t("keeper_conflict_col_mine", "Your Unsaved Draft (v{0})").replace(
                        "{0}",
                        String(conflictInfo.baseRevision)
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMine}
                    className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] hover:border-[var(--accent)] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                      {copiedMine ? t("icon_check", "check") : t("icon_content_copy", "content_copy")}
                    </span>
                    <span>
                      {copiedMine
                        ? t("copied", "Copied")
                        : t("keeper_conflict_btn_copy_mine", "Copy My Draft")}
                    </span>
                  </button>
                </div>
                <pre className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[11px] font-mono text-[var(--text)] whitespace-pre-wrap break-words max-h-60 overflow-y-auto custom-scrollbar">
                  {conflictInfo.localMarkdown}
                </pre>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_cloud_done", "cloud_done")}
                    </span>
                    <span>
                      {t("keeper_conflict_col_hub", "Hub Latest (v{0})").replace(
                        "{0}",
                        String(conflictInfo.serverRevision)
                      )}
                    </span>
                  </span>
                  {conflictInfo.updatedBy && (
                    <span className="text-[10px] font-bold text-[var(--subtext)] truncate">
                      @{conflictInfo.updatedBy}
                    </span>
                  )}
                </div>
                <pre className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[11px] font-mono text-[var(--text)] whitespace-pre-wrap break-words max-h-60 overflow-y-auto custom-scrollbar">
                  {conflictInfo.serverMarkdown}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Unimported Local Workspace .md Notice */}
      {hasLocalMdChanges && !conflictInfo && onImportLocalMd && (
        <div className="glass-panel rounded-2xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[16px] text-[var(--warning)]">
                {t("icon_description", "description")}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-black text-[var(--text)] tracking-tight truncate">
                {t(
                  "keeper_local_md_ahead_title",
                  "Local workspace file ({0}) has unimported edits"
                ).replace("{0}", localFileName || ".md")}
              </span>
              <span className="text-[10px] text-[var(--subtext)] opacity-80 truncate">
                {t(
                  "keeper_local_md_ahead_desc",
                  "Protected from auto-overwrite. Import into your draft when ready to review and publish."
                )}
              </span>
            </div>
          </div>

          <ActionButton
            variant="warning"
            icon={t("icon_upload_file", "upload_file")}
            onClick={onImportLocalMd}
            className="!px-3 !py-1.5 !text-[10px] !rounded-xl shrink-0"
          >
            {t("keeper_btn_import_local_md", "Import .md to Draft")}
          </ActionButton>
        </div>
      )}
    </div>
  );
}
