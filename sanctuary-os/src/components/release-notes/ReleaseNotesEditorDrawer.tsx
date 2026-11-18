import React, { useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Image from "@tiptap/extension-image";
import { IconPlugin } from "../../IconPlugin";
import { useLexicon } from "../../LexiconContext";
import { SidePanel, PanelHeaderGroup, DashboardStatTile, SidePanelFilterBar } from "../../shared-components/layout";
import { PanelHeaderButton } from "../../shared-components/buttons";
import { getSafeEditorMarkdown } from "../../shared-components/stringUtils";
import { LinkAssetSidePanel } from "../../side-panels/LinkAssetSidePanel";
import { UniversalGroup } from "../universal/UniversalLayout";
import {
  PostEditorMode,
  UnifiedPostBodyEditor,
  PostAttachmentsManager,
} from "../universal/UnifiedPostEditor";
import { KeeperDocPresenceEntry } from "../../utils/useKeeperDocPresence";
import {
  KeeperDocConflictBar,
  KeeperDocConflictInfo,
} from "../universal/KeeperDocConflictBar";
import { DispatchPollData } from "../universal/DispatchPollAndMeta";
import { isDesktop } from "../../utils/envUtils";
import { LocalDocSlug } from "../../utils/directivesSync";

type ReleaseDocSlotKey =
  | "stable:post"
  | "dev:post"
  | "stable:changelog"
  | "dev:changelog";

interface ReleaseNotesEditorDrawerProps {
  isEditorOpen: boolean;
  onClose: () => void;
  editorMode: PostEditorMode;
  setEditorMode: (m: PostEditorMode) => void;
  editorChannel: "stable" | "dev";
  editorDocType: "post" | "changelog";
  populateDraftForChannel: (ch: "stable" | "dev", docType: "post" | "changelog") => void;
  draftTitle: string;
  setDraftTitle: (v: string) => void;
  draftSummary: string;
  setDraftSummary: (v: string) => void;
  draftVersion: string;
  setDraftVersion: (v: string) => void;
  draftReleaseDate: string;
  setDraftReleaseDate: (v: string) => void;
  draftPlatform: string;
  setDraftPlatform: (v: string) => void;
  draftImageUrl: string;
  setDraftImageUrl: (v: string) => void;
  draftCodeSnippet: string;
  setDraftCodeSnippet: (v: string) => void;
  draftPollData: DispatchPollData | null;
  setDraftPollData: (v: DispatchPollData | null) => void;
  draftBody: string;
  setDraftBody: (v: string) => void;
  showCodeInput: boolean;
  setShowCodeInput: (v: boolean) => void;
  isAssetPanelOpen: boolean;
  setIsAssetPanelOpen: (v: boolean) => void;
  isSaving: boolean;
  isPublishing: boolean;
  isDirty: boolean;
  setIsDirty: (v: boolean) => void;
  editorSyncSeq: number;
  tiptapEditorRef: React.MutableRefObject<any>;
  updateTimeoutRef: React.MutableRefObject<any>;
  localMdBySlot: Record<
    ReleaseDocSlotKey,
    {
      slug: LocalDocSlug;
      fileName: string;
      hasLocalChanges: boolean;
      localContent: string;
    }
  >;
  peerEditors: KeeperDocPresenceEntry[];
  conflictServerInfo: KeeperDocConflictInfo | null;
  setConflictServerInfo: (info: KeeperDocConflictInfo | null) => void;
  pendingPublishRef: React.MutableRefObject<boolean>;
  handleImportLocalReleaseMd: () => void;
  handleSaveKeepersPost: (publishLive?: boolean, forceOverwrite?: boolean) => void;
  handleLoadLatestReleaseFromHub: () => void;
  handleLinkAsset: (asset: any) => void;
}

export default function ReleaseNotesEditorDrawer({
  isEditorOpen,
  onClose,
  editorMode,
  setEditorMode,
  editorChannel,
  editorDocType,
  populateDraftForChannel,
  draftTitle,
  setDraftTitle,
  draftSummary,
  setDraftSummary,
  draftVersion,
  setDraftVersion,
  draftReleaseDate,
  setDraftReleaseDate,
  draftPlatform,
  setDraftPlatform,
  draftImageUrl,
  setDraftImageUrl,
  draftCodeSnippet,
  setDraftCodeSnippet,
  draftPollData,
  setDraftPollData,
  draftBody,
  setDraftBody,
  showCodeInput,
  setShowCodeInput,
  isAssetPanelOpen,
  setIsAssetPanelOpen,
  isSaving,
  isPublishing,
  isDirty,
  setIsDirty,
  editorSyncSeq,
  tiptapEditorRef,
  updateTimeoutRef,
  localMdBySlot,
  peerEditors,
  conflictServerInfo,
  setConflictServerInfo,
  pendingPublishRef,
  handleImportLocalReleaseMd,
  handleSaveKeepersPost,
  handleLoadLatestReleaseFromHub,
  handleLinkAsset,
}: ReleaseNotesEditorDrawerProps) {
  const { t } = useLexicon();
  const lastSyncSeqRef = useRef<number>(-1);

  const editor = useEditor({
    extensions: [StarterKit, Markdown, IconPlugin, Image],
    content: draftBody,
    onUpdate: ({ editor: ed }) => {
      if (!ed || ed.isDestroyed) return;
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        if (!ed || ed.isDestroyed || !(ed.storage as any)?.markdown) return;
        setDraftBody(getSafeEditorMarkdown(ed));
        setIsDirty(true);
      }, 300);
    },
    editorProps: {
      attributes: {
        class:
          "w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[350px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_img]:rounded-xl [&_img]:max-w-full [&_code]:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_code]:px-1 [&_code]:rounded [&_hr]:border-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_hr]:my-8",
      },
    },
  });

  useEffect(() => {
    tiptapEditorRef.current = editor;
    return () => {
      if (tiptapEditorRef.current === editor) {
        tiptapEditorRef.current = null;
      }
    };
  }, [editor, tiptapEditorRef]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (lastSyncSeqRef.current !== editorSyncSeq) {
      lastSyncSeqRef.current = editorSyncSeq;
      editor.commands.setContent(draftBody || "", { emitUpdate: false });
    }
  }, [editor, editorSyncSeq, draftBody]);

  return (
    <>
      <SidePanel
        isOpen={isEditorOpen}
        onClose={onClose}
        icon={t("icon_cell_tower", "cell_tower")}
        widthClass="w-[800px]"
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
        title={t("update_transmission", "Update {Dispatch}")}
        subtitle={
          editorChannel === "dev"
            ? `${t("release_notes_dev_post_label", "Dev Channel Post")} • ${
                editorDocType === "changelog"
                  ? t("release_notes_tile_changelog", "Changelog")
                  : t("btn_post", "Post")
              }`
            : `${t("release_notes_public_post_label", "Public Channel Post")} • ${
                editorDocType === "changelog"
                  ? t("release_notes_tile_changelog", "Changelog")
                  : t("btn_post", "Post")
              }`
        }
        headerActions={
          <PanelHeaderGroup>
            {(isDesktop() || import.meta.env.DEV) &&
              Boolean(
                localMdBySlot[`${editorChannel}:${editorDocType}`]?.localContent
              ) && (
                <PanelHeaderButton
                  onClick={handleImportLocalReleaseMd}
                  disabled={isSaving || isPublishing}
                  tooltip={t("keeper_local_md_import_btn", "Import .md to Draft")}
                  icon={t("icon_upload_file", "upload_file")}
                  variant={
                    localMdBySlot[`${editorChannel}:${editorDocType}`]
                      ?.hasLocalChanges
                      ? "warning"
                      : "default"
                  }
                />
              )}
            <PanelHeaderButton
              onClick={() => handleSaveKeepersPost(false)}
              disabled={
                isSaving ||
                !draftBody.trim() ||
                (editorDocType === "post" && !draftTitle.trim())
              }
              tooltip={
                isSaving
                  ? t("btn_saving", "Saving...")
                  : t("dir_btn_save_sync_staged", "Save Shared Draft")
              }
              icon={isSaving ? t("icon_sync", "sync") : t("icon_save", "save")}
              variant={isDirty ? "warning" : "default"}
            />
            <PanelHeaderButton
              onClick={() => handleSaveKeepersPost(true)}
              disabled={
                isSaving ||
                !draftBody.trim() ||
                (editorDocType === "post" && !draftTitle.trim())
              }
              tooltip={
                isSaving
                  ? t("btn_saving", "Saving...")
                  : t("dir_btn_publish_live", "Update / Publish to {Citizens}")
              }
              icon={isSaving ? t("icon_sync", "sync") : t("icon_publish", "publish")}
              variant="accent"
              className={isSaving ? "animate-pulse" : ""}
            />
          </PanelHeaderGroup>
        }
      >
        <div
          className={`flex flex-col gap-6 flex-1 min-h-0 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
            editorMode === "markdown" ? "pb-0" : ""
          }`}
        >
          <KeeperDocConflictBar
            peerEditors={peerEditors}
            hasLocalMdChanges={Boolean(
              (isDesktop() || import.meta.env.DEV) &&
                localMdBySlot[`${editorChannel}:${editorDocType}`]?.hasLocalChanges
            )}
            localFileName={localMdBySlot[`${editorChannel}:${editorDocType}`]?.fileName}
            onImportLocalMd={handleImportLocalReleaseMd}
            conflictInfo={conflictServerInfo}
            onLoadLatestFromHub={handleLoadLatestReleaseFromHub}
            onOverwriteWithMine={() =>
              handleSaveKeepersPost(pendingPublishRef.current, true)
            }
            onDismissConflict={() => setConflictServerInfo(null)}
          />

          <SidePanelFilterBar className="grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={
                <span className="material-symbols-outlined">
                  {t("icon_verified", "verified")}
                </span>
              }
              label={t("release_notes_meta_channel_public", "Public")}
              number={t("btn_post", "Post")}
              isActive={editorChannel === "stable" && editorDocType === "post"}
              onClick={() => populateDraftForChannel("stable", "post")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={
                <span className="material-symbols-outlined">
                  {t("icon_terminal", "terminal")}
                </span>
              }
              label={t("release_notes_meta_channel_public", "Public")}
              number={t("release_notes_tile_changelog", "Changelog")}
              isActive={editorChannel === "stable" && editorDocType === "changelog"}
              onClick={() => populateDraftForChannel("stable", "changelog")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={
                <span className="material-symbols-outlined">
                  {t("icon_bolt", "bolt")}
                </span>
              }
              label={t("release_notes_meta_channel_dev", "Dev")}
              number={t("btn_post", "Post")}
              isActive={editorChannel === "dev" && editorDocType === "post"}
              onClick={() => populateDraftForChannel("dev", "post")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={
                <span className="material-symbols-outlined">
                  {t("icon_terminal", "terminal")}
                </span>
              }
              label={t("release_notes_meta_channel_dev", "Dev")}
              number={t("release_notes_tile_changelog", "Changelog")}
              isActive={editorChannel === "dev" && editorDocType === "changelog"}
              onClick={() => populateDraftForChannel("dev", "changelog")}
            />
          </SidePanelFilterBar>

          {editorDocType === "post" && (
            <UniversalGroup
              title={t("metadata", "Metadata")}
              icon={t("icon_tune", "tune")}
            >
              <div className="flex flex-col gap-4 w-full">
                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                    {t("post_title", "Post Title")}
                  </label>
                  <input
                    value={draftTitle}
                    onChange={(e) => {
                      setDraftTitle(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder={t("post_title", "Title")}
                    className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5 w-full">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest">
                      {t("post_description", "Description")}
                    </label>
                    <span
                      className={`text-[9px] font-black ${
                        draftSummary.length >= 250
                          ? "text-[var(--warning)]"
                          : "text-[var(--subtext)] opacity-60"
                      }`}
                    >
                      {draftSummary.length} / 250
                    </span>
                  </div>
                  <input
                    maxLength={250}
                    value={draftSummary}
                    onChange={(e) => {
                      setDraftSummary(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder={t(
                      "post_description_ph",
                      "Short summary shown on the Release Card..."
                    )}
                    className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-medium focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                      {t("release_notes_meta_release_date", "Release Date")}
                    </label>
                    <input
                      value={draftReleaseDate}
                      onChange={(e) => {
                        setDraftReleaseDate(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                      {t("release_notes_meta_version", "Version Number")}
                    </label>
                    <input
                      value={draftVersion}
                      onChange={(e) => {
                        setDraftVersion(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--accent)] font-mono text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                      {t("release_notes_meta_platform", "Platform")}
                    </label>
                    <input
                      value={draftPlatform}
                      onChange={(e) => {
                        setDraftPlatform(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                    />
                  </div>
                </div>
              </div>
            </UniversalGroup>
          )}

          <UnifiedPostBodyEditor
            mode={editorMode}
            onModeChange={setEditorMode}
            content={draftBody}
            onContentChange={(val) => {
              setDraftBody(val);
              setIsDirty(true);
            }}
            editor={editor}
            placeholder={t("post_content", "{Dispatch} Body...")}
          />

          {editorDocType === "post" && (
            <PostAttachmentsManager
              content={draftBody}
              onContentChange={(val) => {
                setDraftBody(val);
                setIsDirty(true);
              }}
              editor={editor}
              onOpenAssetLinker={() => setIsAssetPanelOpen(true)}
              imageUrl={draftImageUrl}
              onImageUrlChange={(val) => {
                setDraftImageUrl(val);
                setIsDirty(true);
              }}
              showCodeInput={showCodeInput}
              onToggleCodeInput={setShowCodeInput}
              codeSnippet={draftCodeSnippet}
              onCodeSnippetChange={(val) => {
                setDraftCodeSnippet(val);
                setIsDirty(true);
              }}
              pollData={draftPollData}
              onPollDataChange={(val) => {
                setDraftPollData(val);
                setIsDirty(true);
              }}
            />
          )}
        </div>
      </SidePanel>

      <LinkAssetSidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        onAssetSelect={handleLinkAsset}
        widthClass="w-[800px]"
        backdropZ="z-[60002]"
        panelZ="z-[60003]"
      />
    </>
  );
}
