import { SearchBar, ScreenUtilityBar } from "../shared";
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
  fetchAllPaginated, CustomTierDropdown, PanelHeaderGroup, PanelHeaderButton, FilterPopover
} from "../shared";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";
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



export function MasonLinker() {
  const { t } = useLexicon();
  const session = useStore(state => state.session);
  const myId = session?.user?.id;
  const [masons, setMasons] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "verified" | "unverified">("all");
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
      setStatus("Mason Name is required.");
      return;
    }

    setIsSubmitting(true);
    setStatus(t("status_linking"));

    const userRes = await supabase.auth.getUser();
    const myId = userRes.data.user?.id;

    let masonId = selectedMason?.id;

    if (isCreating) {
      const { data, error } = await supabase.from('masons').insert({
        name: editName.trim(),
        profile_id: linkedProfileId || null,
        is_verified: isVerified
      }).select().single();

      if (error) {
        setStatus("Failed to create: " + error.message);
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
        setStatus("Failed to update: " + (error?.message || "Permission Denied."));
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
        await supabase.from('profiles').update({ role: 'mason' }).eq('id', linkedProfileId);
      }
    }

    setStatus(t("identities_updated"));
    fetchData();
    setTimeout(() => {
      handleClosePanel();
      setIsSubmitting(false);
    }, 1500);
  };

  const filteredMasons = masons.filter((m: any) => {
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase()) || m.id?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterType === "all" ? true : filterType === "verified" ? m.is_verified : !m.is_verified;
    return matchesSearch && matchesFilter;
  });

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_linker") || "Mason Linker"}
      headerSubtitle={t("mason_linker_subtitle") || "Manage Masons and their linked profiles"}
      headerIcon="link"
      headerIconColorClass="theme-text-accent"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("linker_search_mason")}
      headerActions={
        <div className="flex items-center gap-2">
            <FilterPopover icon="tune" label="" className="shrink-0">
                <div className="flex flex-col gap-2 p-4">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">{t("filter_status")}</label>
                    <CustomDropdown disableTint={true}
                        value={filterType}
                        onChange={(v: string[]) => setFilterType(v[0] as any)}
                        options={[
                        { id: "all", label: "ALL MASONS" },
                        { id: "verified", label: "VERIFIED" },
                        { id: "unverified", label: "UNVERIFIED" }
                        ]}
                    />
                </div>
            </FilterPopover>

            <ActionButton
                onClick={() => handleOpenPanel(null)}
                iconOnly={true}
                icon={t("icon_add")}
                label={t("btn_create_mason_naked")}
            />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {loading ? (
          <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">{t("audit_fetching")}</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {filteredMasons.map((m: any) => (
              <UniversalCard
                key={m.id}
                onClick={() => handleOpenPanel(m)}
                layout="vertical"
                icon="architecture"
                title={m.name || t("vlocal")}
                subtitle={
                  <span className="flex gap-1.5 items-center">
                    <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_fingerprint")}</span>
                    {m.id.substring(0, 8)}
                  </span>
                }
                statusColor={m.is_verified ? "border-green-500" : undefined}
                badges={[
                  <span key="status" className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors ${m.is_verified ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-green-400 border-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-60 border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                    {m.is_verified ? t("verified") : t("unverified")}
                  </span>
                ]}
                footer={
                  <span className={`text-[10px] font-bold capitalize flex items-center gap-1.5 truncate ${m.profile_id ? 'text-[var(--text)] opacity-80' : 'text-red-400 opacity-80'}`}>
                    <span className="material-symbols-outlined !text-[12px] opacity-70">{m.profile_id ? "link" : "link_off"}</span>
                    {m.profile_id ? (profiles.find(p => p.id === m.profile_id)?.username || m.profile_id.substring(0, 8)) : (t("sa_unlinked"))}
                  </span>
                }
              />
            ))}
            {filteredMasons.length === 0 && (
              <EmptyState icon={t("ui_icon_group_off")} title={t("no_masons")} className="col-span-full py-16" />
            )}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={!!selectedMason || isCreating}
        onClose={handleClosePanel}
        title={isCreating ? "LINK NEW MASON" : "EDIT MASON"}
        icon={t("icon_link")}
        subtitle={selectedMason ? `UUID: ${selectedMason.id}` : t("create_mason_subtitle")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="close"
              tooltip={t("nav_cancel")}
              onClick={handleClosePanel}
              disabled={isSubmitting}
            />
            <PanelHeaderButton
              icon="save"
              tooltip={isSubmitting ? t("identities_updating") : (isCreating ? t("btn_create_mason_naked") : t("ui_btn_commit"))}
              variant="accent"
              disabled={isSubmitting || !editName.trim()}
              onClick={handleSave}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="p-6 flex flex-col h-full gap-8">
          {status && (
            <div className="text-center bg-black/20 p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
              <p className={`text-[10px] font-black capitalize tracking-widest ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('required') ? 'text-red-400' : 'theme-text-accent'}`}>{status}</p>
            </div>
          )}

          <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent pointer-events-none " />
            <h4 className="text-[10px] font-black theme-text-accent capitalize tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
              {t("metadata")}
            </h4>

            <div className="flex flex-col gap-2 relative z-50 w-full">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("mason_name")}</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder={t("placeholder_mason_name")}
                className="w-full glass-panel rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:opacity-40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none " />
            <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 capitalize tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span>
              {t("linking_verification")}
            </h4>

            <div className="flex flex-col gap-2 relative z-40 w-full">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("link_profile")}</label>
              <ProfileSearchDropdown
                value={linkedProfileId}
                profiles={profiles}
                onChange={setLinkedProfileId}
              />
            </div>

            <div className="flex items-center justify-start mt-4 w-full">
              <label className="text-[10px] font-black text-[var(--text)] capitalize tracking-widest ml-2 flex items-center gap-2">
                {t("mark_verified")}
              </label>
              <button
                onClick={() => setIsVerified(!isVerified)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isVerified ? 'theme-bg-success' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVerified ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}

export function ProfileSearchDropdown({ value, onChange, profiles }: any) {
  const { t } = useLexicon();
  const session = useStore(state => state.session);
  const myId = session?.user?.id;
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
          placeholder={t("search_profile")}
          readOnly={!!value}
          className={`w-full h-12 glass-surface rounded-xl px-5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all relative cursor-text ${value ? 'theme-text-accent' : ''}`}
        />
        {value ? (
          <button className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold" onClick={() => { onChange(""); setQuery(""); setIsOpen(true); inputRef.current?.focus(); }}>
            {t("icon_close")}
          </button>
        ) : (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? "â–²" : "â–¼"}
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
                <span className="text-[11px] font-black capitalize text-[var(--text)]">{p.username || "UNKNOWN"}</span>
                <span className="text-[8px] font-mono opacity-50">{p.id}</span>
              </button>
            ))}
            {filtered.length === 0 && <EmptyState icon={t("ui_icon_person_off")} title={t("no_profiles")} className="col-span-full py-16" />}
          </div>
        </>,
        document.getElementById('sa-portals') || document.body
      )}
    </div>
  );
}






