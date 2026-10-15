
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass, ActionButton,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown, PanelHeaderGroup, PanelHeaderButton, HeaderActionPortal, ActionPill,
} from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput, SidePanelPillToggle } from "../components/layouts/ElevatedHubLayout";
import { UniversalGroup } from "../components/universal/UniversalLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";
import { StatTileCarousel } from "./SharedCommandScreenLayout";



export function MasonLinker() {
  const { t } = useLexicon();
  const session = useStore(state => state.session);
  const myId = session?.user?.id;
  const [masons, setMasons] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "pending" | "linked">("overview");
  const [loading, setLoading] = useState(true);

  const [selectedMason, setSelectedMason] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [linkedProfileId, setLinkedProfileId] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const { data: mData } = await supabase.from('masons').select('id, name, profile_id, is_verified, created_at').order('name');
    if (mData) setMasons(mData);

    const { data: pData } = await supabase.from('profiles').select('id, username, role').order('username');
    if (pData) setProfiles(pData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenPanel = (m: any = null) => {
    setStatus("");
    if (m) {
      setSelectedMason(m);
      setIsCreating(false);
      setEditName(m.name || "");
      setIsVerified(m.is_verified || false);
      setLinkedProfileId(m.profile_id || "");
    } else {
      setSelectedMason(null);
      setIsCreating(true);
      setEditName("");
      setIsVerified(false);
      setLinkedProfileId("");
    }
  };

  const handleClosePanel = () => {
    setSelectedMason(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      setStatus(t("err_mason_name_req") || "Mason Name is required.");
      return;
    }

    setIsSubmitting(true);
    setStatus(t("status_linking") || "Linking...");

    let masonId = selectedMason?.id;

    if (isCreating) {
      const { data, error } = await supabase.from('masons').insert({
        name: editName.trim(),
        profile_id: linkedProfileId || null,
        is_verified: isVerified
      }).select().single();

      if (error) {
        setStatus((t("identities_failed_prefix") || "Failed to create:") + " " + error.message);
        setIsSubmitting(false);
        return;
      }
      masonId = data.id;

      await logArchitectAction(
        `Created new Mason: ${editName.trim()}`,
        'masons',
        masonId,
        "Mason Creation",
        "Mason Linker"
      );
    } else {
      const { data, error } = await supabase.from('masons').update({
        name: editName.trim(),
        profile_id: linkedProfileId || null,
        is_verified: isVerified
      }).eq('id', masonId).select();

      if (error || !data || data.length === 0) {
        setStatus((t("identities_failed_prefix") || "Failed to update:") + " " + (error?.message || "Permission Denied."));
        setIsSubmitting(false);
        return;
      }

      await logArchitectAction(
        `Updated Mason: ${editName.trim()} (Verified: ${isVerified}, Linked: ${linkedProfileId || 'None'})`,
        'masons',
        editName.trim(),
        "Mason Update/Link",
        "Mason Linker"
      );
    }

    if (linkedProfileId) {
      const linkedProfile = profiles.find(p => p.id === linkedProfileId);
      if (linkedProfile && (linkedProfile.role === 'citizen' || !linkedProfile.role)) {
        await supabase.rpc('secure_update_spoke_profile', {
          p_target_user_id: linkedProfileId,
          p_updates: { role: 'mason' }
        });
      }
    }

    setStatus(t("identities_updated") || "Updated successfully.");
    fetchData();
    setTimeout(() => {
      handleClosePanel();
      setIsSubmitting(false);
    }, 1500);
  };

  const filteredMasons = masons.filter((m: any) => {
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase()) || m.id?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeTab === "overview" ? true : activeTab === "linked" ? m.is_verified : !m.is_verified;
    return matchesSearch && matchesFilter;
  });

  const pendingMasons = masons.filter(m => !m.is_verified);
  const linkedMasons = masons.filter(m => m.is_verified);

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: masons.length.toString()
    },
    { id: 'pending', label: t("pending") || "Pending", icon: 'pending', number: pendingMasons.length.toString() },
    { id: 'linked', label: t("linked") || "Linked", icon: 'link', number: linkedMasons.length.toString() }
  ];

  const renderMasonCard = (m: any) => (
    <UniversalCard
      key={m.id}
      onClick={() => handleOpenPanel(m)}
      layout="vertical"
      icon="architecture"
      title={m.name || t("vlocal") || "Unknown"}
      subtitle={
        <span className="flex gap-1.5 items-center">
          <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_fingerprint") || "fingerprint"}</span>
          {m.id.substring(0, 8)}
        </span>
      }
      statusColor={m.is_verified ? "border-[var(--success)]" : undefined}
      badges={[
        <span key="status" className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors ${m.is_verified ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-60 border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
          {m.is_verified ? (t("verified") || "Verified") : (t("unverified") || "Unverified")}
        </span>
      ]}
      footer={
        <span className={`text-[10px] font-bold capitalize flex items-center gap-1.5 truncate ${m.profile_id ? 'text-[var(--text)] opacity-80' : 'text-[var(--danger)] opacity-80'}`}>
          <span className="material-symbols-outlined !text-[12px] opacity-70">{m.profile_id ? "link" : "link_off"}</span>
          {m.profile_id ? (profiles.find(p => p.id === m.profile_id)?.username || m.profile_id.substring(0, 8)) : (t("sa_unlinked") || "Unlinked")}
        </span>
      }
    />
  );

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon="pending"
        iconColorClass="text-[var(--warning)]"
        title={t("pending") || "Unlinked / Pending Masons"}
        isEmpty={pendingMasons.length === 0}
        emptyIcon={t("ui_icon_group_off") || "group_off"}
        emptyTitle={t("no_masons") || "No pending masons"}
      >
        {pendingMasons.slice(0, 4).map((m: any) => renderMasonCard(m))}
      </HubOverviewSection>

      <HubOverviewSection
        icon="link"
        iconColorClass="text-[var(--success)]"
        title={t("linked") || "Linked Masons"}
        isEmpty={linkedMasons.length === 0}
        emptyIcon={t("ui_icon_group_off") || "group_off"}
        emptyTitle={t("no_masons") || "No linked masons"}
      >
        {linkedMasons.slice(0, 4).map((m: any) => renderMasonCard(m))}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_linker") || "Mason Linker"}
      headerSubtitle={t("mason_linker_subtitle") || "Manage Masons and their linked profiles"}
      headerIcon="link"
      headerIconColorClass="theme-text-accent"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={(t("linker_search_mason") || "Search masons...") as string}
      hideSearch={activeTab === 'overview'}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      tabs={tabs}
      actions={
        activeTab !== 'overview' ? [
          {
            id: "create_mason",
            icon: (t("icon_add") || "add") as string,
            label: (t("btn_create_mason_naked") || "Create Mason") as string,
            onClick: () => handleOpenPanel(null)
          }
        ] : undefined
      }
    >
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">{t("audit_fetching") || "Fetching masons..."}</div>
      ) : activeTab === 'overview' ? (
        renderLanding()
      ) : (
        <div className="flex flex-col gap-6 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {filteredMasons.map((m: any) => renderMasonCard(m))}
            {filteredMasons.length === 0 && (
              <EmptyState icon={t("ui_icon_group_off") || "group_off"} title={t("no_masons") || "No masons found"} className="col-span-full py-16" />
            )}
          </div>
        </div>
      )}

      <SidePanel
        isOpen={!!selectedMason || isCreating}
        onClose={handleClosePanel}
        title={isCreating ? (t("link_new_mason") || "LINK NEW MASON") : (t("edit_mason") || "EDIT MASON")}
        icon={t("icon_link") || "link"}
        subtitle={selectedMason ? `UUID: ${selectedMason.id}` : (t("create_mason_subtitle") || "Create a new mason entry")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="save"
              tooltip={isSubmitting ? (t("identities_updating") || "Updating...") : (isCreating ? (t("btn_create_mason_naked") || "Create Mason") : (t("ui_btn_commit") || "Commit"))}
              variant="accent"
              disabled={isSubmitting || !editName.trim()}
              onClick={handleSave}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col h-full gap-8">
          {status && (
            <div className="text-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
              <p className={`text-[10px] font-black capitalize tracking-widest ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('required') ? 'text-[var(--danger)]' : 'theme-text-accent'}`}>{status}</p>
            </div>
          )}

          <SidePanelTitleInput
            value={editName}
            onChange={setEditName}
            placeholder={t("placeholder_mason_name") || "Mason Name"}
            subtitle={t("mason_name") || "Mason Handle"}
          />

          <UniversalGroup title={t("linking_verification") || "Linking & Verification"} icon={t("icon_link") || "link"}>
            <div className="flex flex-col gap-2 relative z-40 w-full">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("link_profile") || "Linked Profile"}</label>
              <ProfileSearchDropdown
                value={linkedProfileId}
                profiles={profiles}
                onChange={setLinkedProfileId}
              />
            </div>

            <div className="mt-2 w-full">
              <SidePanelPillToggle
                checked={isVerified}
                onChange={setIsVerified}
                label={t("mark_verified") || "Mark Verified"}
                icon="verified"
                variant="success"
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}

export function ProfileSearchDropdown({ value, onChange, profiles }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        });
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const selectedProfile = profiles.find((p: any) => p.id === value);
  const displayValue = selectedProfile ? `${selectedProfile.username || 'Unknown'} (${selectedProfile.id.substring(0, 8)})` : query;

  const filtered = profiles.filter((p: any) =>
    !query ||
    p.username?.toLowerCase().includes(query.toLowerCase()) ||
    p.id?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50);

  return (
    <div className="relative w-full">
      <div className="relative z-[10]">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            if (!value) {
              setQuery(e.target.value);
              setIsOpen(true);
            }
          }}
          onFocus={() => { if (!value) setIsOpen(true); }}
          placeholder={t("search_profile") || "Search profile..."}
          readOnly={!!value}
          className={`w-full h-12 glass-surface rounded-xl px-5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all relative cursor-text ${value ? 'theme-text-accent' : ''}`}
        />
        {value ? (
          <button className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold" onClick={() => { onChange(""); setQuery(""); setIsOpen(true); inputRef.current?.focus(); }}>
            {t("icon_close") || "close"}
          </button>
        ) : (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60" onClick={() => setIsOpen(!isOpen)}>
            &rarr;
          </button>
        )}
      </div>

      {isOpen && !value && createPortal(
        <>
          <div className="!fixed inset-0 pointer-events-auto" style={{ zIndex: 300000 }} onClick={() => setIsOpen(false)} />
          <div className="!fixed mt-2 glass-panel pointer-events-auto border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 flex flex-col max-h-60 overflow-y-auto custom-scrollbar" style={{
            zIndex: 300001,
            top: coords.top,
            left: coords.left,
            width: coords.width,
          }}>
            {filtered.map((p: any) => (
              <button
                key={p.id}
                onClick={() => { onChange(p.id); setIsOpen(false); setQuery(""); }}
                className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col gap-0.5"
              >
                <span className="text-[11px] font-black capitalize text-[var(--text)]">{p.username || (t("vlocal") || "UNKNOWN")}</span>
                <span className="text-[8px] font-mono opacity-50">&rarr; {p.id}</span>
              </button>
            ))}
            {filtered.length === 0 && <EmptyState icon={t("ui_icon_person_off") || "person_off"} title={t("no_profiles") || "No profiles found"} className="col-span-full py-16" />}
          </div>
        </>,
        document.getElementById('sa-portals') || document.body
      )}
    </div>
  );
}








