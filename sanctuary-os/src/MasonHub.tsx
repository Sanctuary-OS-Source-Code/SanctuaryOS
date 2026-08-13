
import { useState, useEffect } from "react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { IconPlugin } from './IconPlugin';
import { isVersionMatch, deriveHumanReadableVersion, getHighestVersion, CustomComplianceDropdown, extractPostImage, stripMarkdown, DashboardStatTile, ActionButton } from "./shared";
import MarkdownRenderer from "./MarkdownRenderer";
import IconPicker from "./IconPicker";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import { supabase } from "./supabase";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { SanctuaryAlertsSidePanel } from './side-panels/SanctuaryAlertsSidePanel';
import { ViewHeader, SidePanel, GameVersionMultiSelect, CustomDropdown, ModSearchDropdown, CustomDatePicker, HoverTabDrawer, VerticalTabButton, VerticalTabDropdown, standardButtonClass, standardPrimaryButtonClass, standardDangerButtonClass, standardSuccessButtonClass, standardAccentGlassButtonClass, EmptyState, LoadingScreen } from "./shared";
import { WayfinderPostsEditor } from "./hub-components/WayfinderPostsEditor";
import ProtocolVisualizer from "./ProtocolVisualizer";
import StructureVisualizer from "./StructureVisualizer";
import ModStructureBuilder from "./ModStructureBuilder";
import MasonIDE from "./MasonIDE";
import { useLexicon } from "./LexiconContext";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import MasonConflictsManager from "./MasonConflictsManager";
import MasonBugReports from "./MasonBugReports";
import MasonNotepadSidePanel from './side-panels/MasonNotepadSidePanel';
import MasonRecentRepliesSidePanel from './side-panels/MasonRecentRepliesSidePanel';
import CitizenTicketsSidePanel from './side-panels/CitizenTicketsSidePanel';
import { SharedMetadataEditorSidePanel } from './side-panels/SharedMetadataEditorSidePanel';
import { useStore } from "./store";
import { ArtifactCard, VaultCard } from "./Cards";
import { MasonRegistry, CustomClassificationDropdown } from "./hub-components/SharedRegistry";
import { MasonCommandScreen } from "./hub-components/CommandScreens";
import { MasonCollectionBuilder } from "./hub-components/SharedCollections";
import { MasonPostsEditor } from "./MasonPostsEditor";
import { MasonSettingsSidePanel } from './side-panels/MasonSettingsSidePanel';
import { MasonSandbox } from "./MasonSandbox";
import { MasonNexus } from "./MasonNexus";
import { MasonChameleons } from "./MasonChameleons";
export default function MasonHub({ sandboxMod, clearSandboxMod, vaultPath, handleOpenMasonProfile }: { sandboxMod?: any, clearSandboxMod?: () => void, vaultPath?: string, handleOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const { session, masonActiveTab, setMasonActiveTab } = useStore();
  const [masonProfile, setMasonProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isRecentRepliesOpen, setIsRecentRepliesOpen] = useState(false);
  const [isSupportDeskOpen, setIsSupportDeskOpen] = useState(false);
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const [metadataEditorInitialId, setMetadataEditorInitialId] = useState<string | undefined>(undefined);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [activeAsset, setActiveAsset] = useState<{ type: string, id: string } | null>(null);
  const [registryTargetMod, setRegistryTargetMod] = useState<string | null>(null);

  useEffect(() => {
    if (sandboxMod) setMasonActiveTab("sandbox");
  }, [sandboxMod]);

  useEffect(() => {
    async function fetchMasonProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase.from('masons').select('*').eq('profile_id', session.user.id).single();
        if (!error && data) setMasonProfile(data);
      }
      setLoading(false);
    }
    fetchMasonProfile();
  }, []);

  if (loading) return <LoadingScreen title={t("verifying")} />;

  if (!masonProfile) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
      <div className="w-24 h-24 rounded-[var(--radius)] glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-4">
        <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{t("icon_construction")}</span>
      </div>
      <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)]">{t("unlinked")}</h2>
      <p className="text-sm font-bold capitalize tracking-widest text-[var(--subtext)] opacity-60">{t("unlinked_desc")}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader
        title={t("mason_hub_title")}
        subtitle={t("mason_hub_subtitle")}
        icon={t("icon_construction")}
        iconColorClass="text-[var(--accent)]"
        breadcrumb={masonActiveTab !== "command_center" ? masonActiveTab.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : undefined}
      />

      <HoverTabDrawer
        title="Mason Navigation"
        activeTab={masonActiveTab}
        setTab={setMasonActiveTab}
        footer={
          <>
            <ActionButton
              icon={t("icon_visibility")}
              label={t("btn_view_profile")}
              variant="glass"
              className="w-full"
              onClick={() => handleOpenMasonProfile && handleOpenMasonProfile(masonProfile.id)}
            />
            <ActionButton
              icon={t("icon_description")}
              label={t("ui_btn_notepad")}
              variant="glass"
              className="w-full"
              onClick={() => setIsNotepadOpen(true)}
            />
            <ActionButton
              icon={t("icon_settings")}
              label={t("wf_tab_support")}
              variant="glass"
              className="w-full"
              onClick={() => setIsSettingsOpen(true)}
            />
          </>
        }
      >
        <VerticalTabButton id="command_center" icon={t("icon_desktop_windows")} label={(t("wf_tab_command")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="registry" icon={t("icon_deployed_code")} label={(t("items")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="nexus" icon={t("icon_hub")} label={(t("tab_nexus")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="sandbox" icon={t("icon_handyman")} label={(t("filter_dev")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="chameleons" icon="palette" label={(t("tab_chameleons")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="ide" icon={t("icon_code")} label={(t("ide_tab")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />

        <VerticalTabButton id="collections" icon={t("icon_collections_bookmark")} label={(t("tab_cc")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="protocols" icon={t("icon_link")} label={(t("tab_protocols")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="structure" icon={t("icon_architecture")} label={(t("tab_structure")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="conflicts" icon={t("icon_security")} label={(t("tab_matrix")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="posts" icon={t("icon_edit_document")} label={(t("tab_posts")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
        <VerticalTabButton id="bug_reports" icon={t("icon_bug_report")} label={(t("stat_bugs")).replace(/^[^\w]*/, '').trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
      </HoverTabDrawer>

      <div className="w-full pr-4">
        {masonActiveTab === "command_center" && <MasonCommandScreen onNavigate={setMasonActiveTab} masonId={masonProfile.id} session={session} onOpenRecentReplies={() => setIsRecentRepliesOpen(true)} onOpenSupportDesk={() => setIsSupportDeskOpen(true)} setViewingPost={setViewingPost} />}
        {masonActiveTab === "registry" && <MasonRegistry masonId={masonProfile.id} initialActiveMod={registryTargetMod} onClearActiveMod={() => setRegistryTargetMod(null)} isActiveTab={masonActiveTab === "registry"} />}
        {masonActiveTab === "collections" && <MasonCollectionBuilder masonId={masonProfile.id} masonName={masonProfile.name} />}
        {masonActiveTab === "bug_reports" && <MasonBugReports masonId={masonProfile?.id} onEditMetadata={(hash) => {
          setMetadataEditorInitialId(hash);
          setIsMetadataEditorOpen(true);
        }} />}
        {masonActiveTab === "nexus" && <MasonNexus masonProfile={masonProfile} />}
        {masonActiveTab === "protocols" && <ProtocolVisualizer masonId={masonProfile.id} isArchitect={false} />}
        {masonActiveTab === "structure" && <StructureVisualizer masonId={masonProfile.id} isArchitect={false} />}
        {masonActiveTab === "posts" && <MasonPostsEditor masonId={masonProfile.id} masonProfileId={masonProfile.profile_id} handleOpenMasonProfile={handleOpenMasonProfile} />}
        {masonActiveTab === "sandbox" && <MasonSandbox masonId={masonProfile.id} initialSandboxMod={sandboxMod} onClear={clearSandboxMod} vaultPath={vaultPath} />}
        {masonActiveTab === "conflicts" && <MasonConflictsManager masonId={masonProfile.id} />}
        {masonActiveTab === "ide" && <MasonIDE vaultPath={vaultPath} />}
        {masonActiveTab === "chameleons" && <MasonChameleons masonProfile={masonProfile} />}
      </div>

      <MasonSettingsSidePanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        profile={masonProfile}
        onUpdate={setMasonProfile}
      />

      <MasonNotepadSidePanel isOpen={isNotepadOpen} onClose={() => setIsNotepadOpen(false)} />
      <MasonRecentRepliesSidePanel
        isOpen={isRecentRepliesOpen}
        onClose={() => setIsRecentRepliesOpen(false)}
        masonId={masonProfile.id}
        userProfileId={session?.user?.id}
        onReplyClick={async (postId, replyId) => {
          const { data } = await supabase.from('mason_posts').select('*').eq('id', postId).single();
          if (data) {
            setViewingPost({ ...data, scrollToCommentId: replyId });
          }
        }}
      />
      {session?.user?.id && <CitizenTicketsSidePanel isOpen={isSupportDeskOpen} onClose={() => setIsSupportDeskOpen(false)} userId={session.user.id} />}
      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId={session?.user?.id || masonProfile.id} onOpenMasonProfile={handleOpenMasonProfile} onAssetClick={(type, id) => setActiveAsset({ type, id })} />}
      {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
      <SharedMetadataEditorSidePanel
        isOpen={isMetadataEditorOpen}
        onClose={() => setIsMetadataEditorOpen(false)}
        initialModId={metadataEditorInitialId}
      />
    </div>
  );
}



function ProtocolSearchModal({ isOpen, onClose, onSelect, cloudMods }: any) {
  const { t } = useLexicon();
  const [query, setQuery] = useState("");
  if (!isOpen) return null;
  const results = cloudMods.filter((m: any) =>
    (m.name || '').toLowerCase().includes((query || '').toLowerCase()) ||
    (m.master_author || '').toLowerCase().includes((query || '').toLowerCase())
  ).slice(0, 15);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-[3px] animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <div className="flex justify-start items-center mb-4">
            <h3 className="text-sm font-black capitalize tracking-widest theme-text-accent">{t("sel_artifact")}</h3>
            <button onClick={onClose} className="text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] font-black"><span className="material-symbols-outlined">{t("icon_close")}</span></button>
          </div>
          <input autoFocus placeholder={t("ph_search_catalog")} value={query} onChange={(e) => setQuery(e.target.value)} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent" />
        </div>
        <div className="p-4 flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar">
          {results.length > 0 ? results.map((mod: any) => (
            <button key={mod.id} onClick={() => { onSelect(mod.id); }} className="flex justify-start items-center px-4 py-3 glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent hover:theme-panel-accent rounded-xl transition-all text-left group">
              <div className="flex flex-col">
                <span className="text-xs font-black text-[var(--text)] capitalize truncate">{mod.name}</span>
                <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest">{mod.master_author || "Unknown Architect"}</span>
              </div>
            </button>
          )) : <div className="p-4 text-center text-[10px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("no_matches")}</div>}
        </div>
      </div>
    </div>
  );
}

export function MasonStatusDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const options = [
    { id: 'stable', label: t("status_dd_stable") },
    { id: 'unstable', label: t("label_unstable") },
    { id: 'corrupted', label: t("status_corrupted") },
    { id: 'under_review', label: t("status_dd_review") },
    { id: 'pending', label: t("pending") },
    { id: 'unverified', label: t("unverified") },
  ];
  if (value === 'verified') {
    options.unshift({ id: 'verified', label: t("status_dd_verified") });
  }
  return <CustomDropdown disableTint={true} value={value} options={options} onChange={(v: string[]) => onChange(v[0])} placeholder={t("mason")} />;
}
