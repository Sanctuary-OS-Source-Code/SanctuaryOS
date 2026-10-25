import { useState, useEffect } from "react";
import { ActionButton, ViewHeader, CustomDropdown, HoverTabDrawer, VerticalTabButton, LoadingScreen } from "./shared";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import { supabase } from "./supabase";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { useLexicon } from "./LexiconContext";
import { isDesktop } from "./utils/envUtils";
import MasonBugReports from "./MasonBugReports";
import MasonNotepadSidePanel from "./side-panels/MasonNotepadSidePanel";
import MasonRecentRepliesSidePanel from "./side-panels/MasonRecentRepliesSidePanel";
import CitizenTicketsSidePanel from "./side-panels/CitizenTicketsSidePanel";
import { SharedMetadataEditorSidePanel } from "./side-panels/SharedMetadataEditorSidePanel";
import { useStore } from "./store";
import { MasonCommandScreen } from "./hub-components/CommandScreens";
import { MasonCollectionBuilder } from "./hub-components/SharedCollections";
import { MasonPostsEditor } from "./MasonPostsEditor";
import { MasonSettingsSidePanel } from "./side-panels/MasonSettingsSidePanel";
import { MasonSandbox } from "./MasonSandbox";
import { MasonNexus } from "./MasonNexus";
import { MasonChameleons } from "./MasonChameleons";
import { ElevatedPasskeyGate } from "./components/ElevatedPasskeyGate";

const VERIFIED_ONLY_TABS = ["collections", "posts", "bug_reports"];

export default function MasonHub({ sandboxMod, clearSandboxMod, vaultPath, handleOpenMasonProfile }: { sandboxMod?: any, clearSandboxMod?: () => void, vaultPath?: string, handleOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);
  const session = useStore((state) => state.session);
  const masonActiveTab = useStore((state) => state.masonActiveTab);
  const setMasonActiveTab = useStore((state) => state.setMasonActiveTab);
  const [masonProfile, setMasonProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isRecentRepliesOpen, setIsRecentRepliesOpen] = useState(false);
  const [isSupportDeskOpen, setIsSupportDeskOpen] = useState(false);
  const [supportTicketInitialId, setSupportTicketInitialId] = useState<string | undefined>(undefined);
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const [metadataEditorInitialId, setMetadataEditorInitialId] = useState<string | undefined>(undefined);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [activeAsset, setActiveAsset] = useState<{ type: string, id: string } | null>(null);
  const [registryTargetMod, setRegistryTargetMod] = useState<string | null>(null);
  const [, setProtocolTargetMod] = useState<any | null>(null);
  const [, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (sandboxMod) setMasonActiveTab("sandbox");
  }, [sandboxMod]);

  useEffect(() => {
    async function fetchMasonProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase.from("masons").select("*").eq("profile_id", session.user.id).single();
        if (!error && data) {
          setMasonProfile(data);
        } else {
          setMasonProfile({
            id: session.user.id,
            profile_id: session.user.id,
            name: session.user.user_metadata?.mason_name || session.user.user_metadata?.username || session.user.email?.split("@")[0] || (t("citizen_creator", "{Citizen} Creator")),
            isUnverifiedLocal: true
          });
        }
      }
      setLoading(false);
    }
    fetchMasonProfile();
  }, []);

  const isVerifiedMason = !masonProfile?.isUnverifiedLocal && (
    masonProfile?.is_verified === true ||
    ["mason", "architect", "senior_architect", "oversight", "wayfinder", "admin"].includes(userRole) ||
    ["core_dev", "admin", "keeper"].includes(osRole)
  );

  useEffect(() => {
    if (!loading && !isVerifiedMason && VERIFIED_ONLY_TABS.includes(masonActiveTab)) {
      setMasonActiveTab("command_center");
    }
  }, [loading, isVerifiedMason, masonActiveTab, setMasonActiveTab]);

  if (loading) return <LoadingScreen title={t("verifying", "Verifying {Mason} Credentials...")} />;

  if (!masonProfile) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
      <div className="w-24 h-24 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-4">
        <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{t("icon_construction", "construction")}</span>
      </div>
      <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)]">{t("unlinked", "Unlinked")}</h2>
      <p className="text-sm font-bold capitalize tracking-widest text-[var(--subtext)] opacity-60">{t("unlinked_desc", "Your profile is not linked to a {Mason} Entity. Contact a Dev.")}</p>
    </div>
  );

  return (
    <ElevatedPasskeyGate
      requirePasskey={isVerifiedMason}
      roleLabelKey="passkey_gate_role_verified_mason"
      roleLabelFallback="Verified Mason"
    >
      <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
        <ViewHeader
          title={t("mason_hub_title", "{Mason} Workshop") || "Mason Hub"}
          subtitle={t("mason_hub_subtitle", "Creator Studio & Asset Management") || "Creator Studio & Asset Management"}
          icon={t("icon_construction", "construction") || "construction"}
          iconColorClass="text-[var(--accent)]"
          breadcrumb={masonActiveTab !== "command_center" ? masonActiveTab.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : undefined}
          onTitleClick={() => setMasonActiveTab("command_center")}
          hubActions={[
            ...(isVerifiedMason ? [{
              id: "mason_view_profile",
              icon: t("icon_visibility", "visibility") || "visibility",
              label: t("btn_view_profile", "View Profile") || "View Profile",
              onClick: () => handleOpenMasonProfile && handleOpenMasonProfile(masonProfile.id)
            }] : []),
            {
              id: "mason_notepad",
              icon: t("icon_description", "description") || "description",
              label: t("ui_btn_notepad", "Notepad") || "Notepad",
              onClick: () => setIsNotepadOpen(true)
            },
            ...(isVerifiedMason ? [{
              id: "mason_settings",
              icon: t("icon_settings", "settings") || "settings",
              label: t("masonhub_settings_title", "{Mason} Settings") || "Mason Settings",
              onClick: () => setIsSettingsOpen(true)
            }] : [])
          ]}
        />

        <div className="md:hidden">
          <HoverTabDrawer
            title={t("mason_hub_title", "{Mason} Workshop") || "Mason Navigation"}
            activeTab={masonActiveTab}
            setTab={setMasonActiveTab}
            hideMobilePills={true}
            footer={
              <>
                {isVerifiedMason && (
                  <ActionButton
                    icon={t("icon_visibility", "visibility") || "visibility"}
                    label={t("btn_view_profile", "View Profile") || "View Profile"}
                    variant="glass"
                    className="w-full"
                    onClick={() => handleOpenMasonProfile && handleOpenMasonProfile(masonProfile.id)}
                  />
                )}
                <ActionButton
                  icon={t("icon_description", "description") || "description"}
                  label={t("ui_btn_notepad", "Notepad") || "Notepad"}
                  variant="glass"
                  className="w-full"
                  onClick={() => setIsNotepadOpen(true)}
                />
                {isVerifiedMason && (
                  <ActionButton
                    icon={t("icon_settings", "settings") || "settings"}
                    label={t("masonhub_settings_title", "{Mason} Settings") || "Mason Settings"}
                    variant="glass"
                    className="w-full"
                    onClick={() => setIsSettingsOpen(true)}
                  />
                )}
              </>
            }
          >
            <VerticalTabButton id="command_center" icon={t("icon_desktop_windows", "desktop_windows") || "desktop_windows"} label={(t("wf_tab_command", "Command") || "Command Center").replace(/^[^\w]*/, "").trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
            <VerticalTabButton id="sandbox" icon={isVerifiedMason ? (t("icon_deployed_code", "deployed_code") || "deployed_code") : (t("icon_handyman", "handyman") || "handyman")} label={(isVerifiedMason ? (t("term_mods", "Mods") || "Mods") : (t("filter_dev", "Sandbox") || "Sandbox")).replace(/^[^\w]*/, "").trim()} activeTab={masonActiveTab === "registry" ? "sandbox" : masonActiveTab} setTab={setMasonActiveTab} />
            <VerticalTabButton id="nexus" icon={t("icon_hub", "hub") || "hub"} label={(t("tab_nexus", "{Nexus}") || "Nexus").replace(/^[^\w]*/, "").trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
            {isDesktop() && (
              <VerticalTabButton id="chameleons" icon={t("icon_palette", "palette")} label={(t("tab_chameleons", "Chameleons") || "Chameleons").replace(/^[^\w]*/, "").trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
            )}

            {isVerifiedMason && (
              <>
                <VerticalTabButton id="collections" icon={t("icon_collections_bookmark", "collections_bookmark") || "collections_bookmark"} label={(t("tab_cc", "Collections") || "Collections").replace(/^[^\w]*/, "").trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
                <VerticalTabButton id="posts" icon={t("icon_edit_document", "edit_document") || "edit_document"} label={(t("tab_posts", "{Dispatches}") || "Posts").replace(/^[^\w]*/, "").trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
                <VerticalTabButton id="bug_reports" icon={t("icon_bug_report", "bug_report") || "bug_report"} label={(t("stat_bugs", "Reports") || "Bug Reports").replace(/^[^\w]*/, "").trim()} activeTab={masonActiveTab} setTab={setMasonActiveTab} />
              </>
            )}
          </HoverTabDrawer>
        </div>

        <div className="w-full flex-1 flex flex-col min-h-0">
          {masonActiveTab === "command_center" && <MasonCommandScreen 
            onNavigate={setMasonActiveTab} 
            masonId={masonProfile.id} 
            isVerifiedMason={isVerifiedMason}
            session={session} 
            onOpenRecentReplies={() => setIsRecentRepliesOpen(true)} 
            onOpenSupportDesk={() => { setSupportTicketInitialId(undefined); setIsSupportDeskOpen(true); }} 
            setViewingPost={setViewingPost} 
            onOpenMetadataEditor={(id: string) => { setRegistryTargetMod(id); setMasonActiveTab("registry"); }}
            onOpenBugReport={(bugId: string) => { setSupportTicketInitialId(bugId); setIsSupportDeskOpen(true); }}
          />}
          {(masonActiveTab === "sandbox" || masonActiveTab === "registry") && (
            <MasonSandbox
              masonId={masonProfile.id}
              masonName={masonProfile.name}
              isVerifiedMason={isVerifiedMason}
              initialSandboxMod={sandboxMod}
              onClear={clearSandboxMod}
              vaultPath={vaultPath}
              initialActiveModId={registryTargetMod}
              onClearActiveMod={() => setRegistryTargetMod(null)}
              initialViewTab={masonActiveTab === "registry" ? "nexus" : "overview"}
            />
          )}
          {isVerifiedMason && masonActiveTab === "collections" && <MasonCollectionBuilder masonId={masonProfile.id} masonName={masonProfile.name} />}
          {isVerifiedMason && masonActiveTab === "bug_reports" && <MasonBugReports masonId={masonProfile?.id} onEditMetadata={(hash) => {
            setMetadataEditorInitialId(hash);
            setIsMetadataEditorOpen(true);
          }} />}
          {masonActiveTab === "nexus" && <MasonNexus masonProfile={masonProfile} isVerifiedMason={isVerifiedMason} />}
          {isVerifiedMason && masonActiveTab === "posts" && <MasonPostsEditor masonId={masonProfile.id} masonProfileId={masonProfile.profile_id} handleOpenMasonProfile={handleOpenMasonProfile} />}
          {isDesktop() && masonActiveTab === "chameleons" && <MasonChameleons masonProfile={masonProfile} isVerifiedMason={isVerifiedMason} vaultPath={vaultPath} />}
        </div>

        {isVerifiedMason && (
          <MasonSettingsSidePanel
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            profile={masonProfile}
            onUpdate={setMasonProfile}
          />
        )}

        <MasonNotepadSidePanel isOpen={isNotepadOpen} onClose={() => setIsNotepadOpen(false)} />
        {isVerifiedMason && (
          <MasonRecentRepliesSidePanel
            isOpen={isRecentRepliesOpen}
            onClose={() => setIsRecentRepliesOpen(false)}
            masonId={masonProfile.id}
            userProfileId={session?.user?.id}
            onReplyClick={async (postId, replyId) => {
              const { data } = await supabase.from("mason_posts").select("*").eq("id", postId).single();
              if (data) {
                setViewingPost({ ...data, scrollToCommentId: replyId });
              }
            }}
          />
        )}
        {session?.user?.id && <CitizenTicketsSidePanel isOpen={isSupportDeskOpen} onClose={() => { setIsSupportDeskOpen(false); setSupportTicketInitialId(undefined); }} userId={session.user.id} initialTicketId={supportTicketInitialId} />}
        {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId={session?.user?.id || masonProfile.id} onOpenMasonProfile={handleOpenMasonProfile} onAssetClick={(type, id) => setActiveAsset({ type, id })} />}
        {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
        {isVerifiedMason && (
          <SharedMetadataEditorSidePanel
            isOpen={isMetadataEditorOpen}
            onClose={() => setIsMetadataEditorOpen(false)}
            initialModId={metadataEditorInitialId}
          />
        )}
      </div>
    </ElevatedPasskeyGate>
  );
}

export function MasonStatusDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const options = [
    { id: "stable", label: t("status_stable", "STABLE") || "Stable" },
    { id: "unstable", label: t("label_unstable", "Unstable") || "Unstable" },
    { id: "corrupted", label: t("status_corrupted", "Corrupted") || "Corrupted" }
  ];
  return <CustomDropdown disableTint={true} value={value} options={options} onChange={(v: string[]) => onChange(v[0])} placeholder={t("registry_label_status", "Status")} />;
}
