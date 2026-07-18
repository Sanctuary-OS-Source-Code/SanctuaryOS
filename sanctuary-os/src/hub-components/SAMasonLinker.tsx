import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown
} from "../shared";
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

      await supabase.from('audit_logs').insert({
        action: `Created new Mason: ${editName.trim()}`,
        target_table: 'masons',
        target_name: editName.trim(),
        actor_id: myId,
        reason: "Mason Creation"
      });
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

      await supabase.from('audit_logs').insert({
        action: `Updated Mason: ${editName.trim()} (Verified: ${isVerified}, Linked: ${linkedProfileId || 'None'})`,
        target_table: 'masons',
        target_name: editName.trim(),
        actor_id: myId,
        reason: "Mason Update/Link"
      });
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
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_link")}</span>
          </div>
          <span className="truncate">{t("linker_title")}</span>
        </h2>

        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("linker_search_mason")}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>

          <div className="w-max min-w-[192px] max-w-xs z-40">
            <CustomDropdown disableTint={true}
              value={filterType}
              onChange={(v: string[]) => setFilterType(v[0] as any)}
              options={[
                { id: "all", label: "ALL MASONS" },
                { id: "verified", label: "VERIFIED" },
                { id: "unverified", label: "UNVERIFIED" }
              ]}
              placeholder={t("filter_status")}
            />
          </div>

          <button
            onClick={() => handleOpenPanel(null)}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group"
          >
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_add")}</span>
            {t("btn_create_mason_naked")}
          </button>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
        {loading ? (
          <div className="theme-glass-panel p-8 rounded-[var(--radius)] text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("audit_fetching")}</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {filteredMasons.map((m: any) => (
              <div
                key={m.id}
                onClick={() => handleOpenPanel(m)}
                className={`theme-glass-panel rounded-[var(--radius)] flex flex-col group border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] cursor-pointer ${m.is_verified ? 'hover:border-green-500/50 hover:shadow-[0_0_40px_rgba(34,197,94,0.15)]' : 'hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)]'} hover:-translate-y-1.5`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${m.is_verified ? 'from-green-500/5' : 'from-[var(--accent)]/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

                <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${m.is_verified ? 'bg-green-500/50 group-hover:bg-green-500 group-hover:shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'theme-bg-accent/50 group-hover:theme-bg-accent group-hover:shadow-[0_0_20px_var(--accent)]'}`} />

                <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                  <div className="flex justify-between items-start gap-4">
                    <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] ${m.is_verified ? 'group-hover:border-green-500/30' : 'group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}>
                      <span className={`material-symbols-outlined !text-[24px] text-[var(--text)] opacity-50 group-hover:opacity-100 transition-colors duration-500 ${m.is_verified ? 'group-hover:text-green-400' : 'group-hover:theme-text-accent'}`}>
                        {t("icon_architecture")}
                      </span>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors ${m.is_verified ? 'bg-green-500/10 text-green-400 border-green-500/20 group-hover:bg-green-500/20' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-60 border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                      {m.is_verified ? t("verified") : t("unverified")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 mt-auto pt-2">
                    <span className={`text-lg font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight transition-colors ${m.is_verified ? 'group-hover:text-green-400' : 'group-hover:theme-text-accent'}`}>
                      {m.name || t("vlocal") || "UNKNOWN"}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 flex gap-1.5 items-center">
                      <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_fingerprint")}</span>
                      {m.id.substring(0, 8)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-3">
                    <span className={`text-[10px] font-bold uppercase flex items-center gap-1.5 truncate ${m.profile_id ? 'text-[var(--text)] opacity-80' : 'text-red-400 opacity-80'}`}>
                      <span className="material-symbols-outlined !text-[12px] opacity-70">{m.profile_id ? "link" : "link_off"}</span>
                      {m.profile_id ? (profiles.find(p => p.id === m.profile_id)?.username || m.profile_id.substring(0, 8)) : (t("sa_unlinked"))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {filteredMasons.length === 0 && (
              <EmptyState icon={t("ui_icon_group_off") || "group_off"} title={t("no_masons")} className="col-span-full py-16" />
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
        footer={
          <div className="flex flex-col gap-4 w-full">
            {status && (
              <div className="text-center bg-black/20 p-3 rounded-xl border border-white/5 w-full">
                <p className={`text-[10px] font-black uppercase tracking-widest ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('required') ? 'text-red-400' : 'theme-text-accent'}`}>{status}</p>
              </div>
            )}
            <div className="flex justify-center items-center gap-4 w-full">
              <button type="button" onClick={handleClosePanel} disabled={isSubmitting} className={standardButtonClass}>
                {t("nav_cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting || !editName.trim()}
                className={standardAccentGlassButtonClass}
              >
                {isSubmitting ? t("identities_updating") : (isCreating ? t("btn_create_mason_naked") : t("ui_btn_commit"))}
              </button>
            </div>
          </div>
        }
      >
        <div className="p-6 flex flex-col h-full gap-8">

          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
              {t("metadata")}
            </h4>

            <div className="flex flex-col gap-2 relative z-50">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_name")}</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder={t("placeholder_mason_name")}
                className="w-full theme-glass-panel rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span>
              {t("linking_verification")}
            </h4>

            <div className="flex flex-col gap-2 relative z-40">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("link_profile")}</label>
              <ProfileSearchDropdown
                value={linkedProfileId}
                profiles={profiles}
                onChange={setLinkedProfileId}
              />
            </div>

            <div className="flex items-center justify-between mt-4">
              <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest ml-2 flex items-center gap-2">
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
    </div>
  );
}

export function ProfileSearchDropdown({ value, onChange, profiles }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

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
          className={`w-full h-12 theme-glass-inner rounded-xl px-5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all relative cursor-text ${value ? 'theme-text-accent' : ''}`}
        />
        {value ? (
          <button className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold" onClick={() => { onChange(""); setQuery(""); setIsOpen(true); inputRef.current?.focus(); }}>
            {t("icon_close")}
          </button>
        ) : (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? "▲" : "▼"}
          </button>
        )}
      </div>

      {isOpen && !value && createPortal(
        <>
          <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-2 theme-glass-panel border-white/10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[50001] animate-in fade-in slide-in-from-top-2 flex flex-col max-h-60 overflow-y-auto custom-scrollbar" style={{
            top: inputRef.current?.getBoundingClientRect().bottom,
            left: inputRef.current?.getBoundingClientRect().left,
            width: inputRef.current?.getBoundingClientRect().width,
          }}>
            {filtered.map((p: any) => (
              <button
                key={p.id}
                onClick={() => { onChange(p.id); setIsOpen(false); setQuery(""); }}
                className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col gap-0.5"
              >
                <span className="text-[11px] font-black uppercase text-[var(--text)]">{p.username || "UNKNOWN"}</span>
                <span className="text-[8px] font-mono opacity-50">{p.id}</span>
              </button>
            ))}
            {filtered.length === 0 && <EmptyState icon={t("ui_icon_person_off") || "person_off"} title={t("no_profiles")} className="col-span-full py-16" />}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

