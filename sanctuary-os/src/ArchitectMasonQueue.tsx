import { ActionPill, FilterTabs, FilterTabButton, PillTabs, PillTabButton, HeaderActionPortal, PanelHeaderGroup, PanelHeaderButton } from "./shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "./components/layouts/ElevatedHubLayout";
import { UniversalGroup } from "./components/universal/UniversalLayout";
import React, { useState, useEffect } from "react";
import { fetchAllPaginated } from "./shared";
import { CustomClassificationDropdown } from "./hub-components/SharedRegistry";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, DashboardStatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { logArchitectAction } from "./lib/audit";
import { MasonStatusDropdown } from "./MasonHub";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import MarkdownRenderer from "./MarkdownRenderer";
import { StatTileCarousel } from "./hub-components/SharedCommandScreenLayout";


export function MasonQueue({ modList = [], setStatus }: { modList?: any[], setStatus?: any }) {
  const { t } = useLexicon();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<'overview' | 'pending' | 'completed'>('overview');
  const [visibleCount, setVisibleCount] = useState(100);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [editForm, setEditForm] = useState({
    name: '',
    mason_id: '',
    category_override: '',
    sub_type: '',
    file_extension: '',
    description: '',
    image_url: '',
    latest_version: '',
    url: '',
    compliance_tier: 0,
    compatible_versions: [] as string[]
  });

  const fetchData = async () => {
    setLoading(true);
    const { data: qData } = await fetchAllPaginated(() => supabase.from('mods').select('*').order('updated_at', { ascending: false }));
    if (qData) setSubmissions(qData);
    const { data: mData } = await supabase.from('masons').select('id, name').order('name');
    if (mData) setMasonsList(mData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => { setVisibleCount(100); }, [searchTerm, filterTab]);

  const handleSelect = (mod: any) => {
    setActiveMod(mod);
    setEditForm({
      name: mod.name || '',
      mason_id: mod.mason_id || '',
      category_override: mod.category_override || 'Script',
      sub_type: mod.sub_type || '',
      file_extension: mod.file_extension || '',
      description: mod.description || '',
      image_url: mod.image_url || '',
      latest_version: mod.latest_version || '',
      url: mod.url || '',
      compliance_tier: mod.compliance_tier || 0,
      compatible_versions: mod.compatible_versions || []
    });
  };

  const handleApprove = async () => {
    if (!activeMod) return;
    setIsProcessing(true);

    const { error } = await supabase.from('mods').update({
      ...editForm,
      status: 'verified'
    }).eq('id', activeMod.id);

    if (!error) {
      logArchitectAction('Updated Mod Metadata', 'mods', activeMod.name);
      setActiveMod(null);
      fetchData();
    } else {
      if (setStatus) setStatus(`${t("icon_block") || "block"} ${t("err_save_failed") || "Save failed:"} ${t(error.message) || error.message}`);
    }
    setIsProcessing(false);
  };

  const handleReject = async () => {
    if (!activeMod) return;
    const reason = prompt(t("prompt_reject_reason") || "Enter rejection reason:");
    if (reason === null) return;
    setIsProcessing(true);

    const { error } = await supabase.from('mods').update({
      status: 'unverified',
      description: (editForm.description + '\n\nREJECTION REASON: ' + reason).trim()
    }).eq('id', activeMod.id);

    if (!error) {
      logArchitectAction('Updated Mod Metadata', 'mods', activeMod.name);
      setActiveMod(null);
      fetchData();
    } else {
      if (setStatus) setStatus(`${t("icon_block") || "block"} ${t("err_save_failed") || "Save failed:"} ${t(error.message) || error.message}`);
    }
    setIsProcessing(false);
  };

  const activeSubmissions = submissions.filter((s: any) => {
    if (!s.mason_id) return false;
    if (filterTab === 'pending') return s.status === 'under_review';
    if (filterTab === 'completed') return s.status === 'verified' || s.status === 'unverified';
    return true;
  });
  let filteredSubmissions = activeSubmissions.filter((s: any) => s.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  const seenNames = new Set();
  filteredSubmissions = filteredSubmissions.filter((s: any) => {
    if (!s.name) return true;
    const lowerName = s.name.toLowerCase();
    if (seenNames.has(lowerName)) return false;
    seenNames.add(lowerName);
    return true;
  });

  const pendingList = filteredSubmissions.filter(s => s.status === 'under_review');
  const completedList = filteredSubmissions.filter(s => s.status === 'verified' || s.status === 'unverified');

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: submissions.filter(s => s.mason_id).length.toString()
    },
    {
      id: "pending",
      label: t("pending") || "Pending",
      icon: "schedule",
      number: submissions.filter(s => s.mason_id && s.status === 'under_review').length.toString()
    },
    {
      id: "completed",
      label: t("status_completed") || "Completed",
      icon: "check_circle",
      number: submissions.filter(s => s.mason_id && (s.status === 'verified' || s.status === 'unverified')).length.toString()
    }
  ];

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon="schedule"
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending") || "Recent Pending"}
        isEmpty={pendingList.length === 0}
        emptyIcon="check_circle"
        emptyTitle={t("no_pending_masons") || "No pending submissions"}
      >
        {pendingList.slice(0, 4).map((mod: any) => (
          <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view") || "View"} />
        ))}
      </HubOverviewSection>

      <HubOverviewSection
        icon="check_circle"
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed") || "Recent Completed"}
        isEmpty={completedList.length === 0}
        emptyIcon="history"
        emptyTitle={t("no_history") || "No history"}
      >
        {completedList.slice(0, 4).map((mod: any) => (
          <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view") || "View"} />
        ))}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("mason_queue") || "Mason Queue"}
        headerSubtitle={t("mason_queue_desc") || "Review submissions from Masons."}
        headerIcon="construction"
        headerIconColorClass="theme-text-accent"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={(t("search_ph") || "Search submissions...") as string}
        hideSearch={filterTab === 'overview'}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={tabs}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs capitalize animate-pulse">{t("hub_loading") || "Loading..."}</div>
        ) : filterTab === 'overview' ? (
          renderLanding()
        ) : filteredSubmissions.length === 0 ? (
          <EmptyState icon={t("icon_account_balance") || "account_balance"} title={t("no_pending_masons") || "No submissions found"} className="col-span-full py-16" />
        ) : (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {filteredSubmissions.slice(0, visibleCount).map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view") || "View"} />
              ))}
            </div>
            {filteredSubmissions.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "Load More"} ({visibleCount} / {filteredSubmissions.length})
              </button>
            )}
          </div>
        )}
      </ElevatedHubLayout>

      <SidePanel
        isOpen={!!activeMod}
        onClose={() => setActiveMod(null)}
        title={t("registry_select_master") || "Review Submission"}
        icon={t("icon_construction") || "construction"}
        subtitle={`UUID: ${activeMod?.id}`}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="block"
              variant="danger"
              tooltip={t("registry_btn_sever") || "Reject"}
              onClick={handleReject}
              disabled={isProcessing}
            />
            <PanelHeaderButton
              icon="check"
              variant="success"
              tooltip={isProcessing ? (t("btn_saving") || "Saving...") : (t("ui_btn_approve") || "Approve")}
              onClick={handleApprove}
              disabled={isProcessing}
            />
          </PanelHeaderGroup>
        }
      >
        {activeMod && (
          <div className="flex flex-col h-full gap-8">
            <SidePanelTitleInput
              value={editForm.name || ""}
              onChange={val => setEditForm({ ...editForm, name: val })}
              placeholder={t("label_modname") || "Artifact Name"}
              subtitle={t("label_modname") || "Artifact Name"}
            />

            <UniversalGroup title={t("btn_view") || "Classification"} icon={t("icon_info") || "info"}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("mason") || "Mason"}</label>
                  <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({ ...editForm, mason_id: id })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("category") || "Category"}</label>
                  <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({ ...editForm, category_override: newType })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_file_ext") || "File Extension"}</label>
                  <input value={editForm.file_extension} onChange={e => setEditForm({ ...editForm, file_extension: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("ph_file_ext") || ".package"} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_col_subcat") || "Subcategory"}</label>
                  <input value={editForm.sub_type} onChange={e => setEditForm({ ...editForm, sub_type: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_e_g_tuning_26") || "e.g. Tuning"} />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup title={t("label_resources") || "Resources"} icon={t("icon_link") || "link"}>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_label_url") || "Source URL"}</label>
                <input value={editForm.url || ""} onChange={e => setEditForm({ ...editForm, url: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--success)_50%,transparent)]" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("cc_cover_url") || "Cover Image URL"}</label>
                <input value={editForm.image_url || ""} onChange={e => setEditForm({ ...editForm, image_url: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--success)_50%,transparent)]" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_desc") || "Description"}</label>
                <textarea value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-28 resize-none focus:outline-none focus:border-[color-mix(in_srgb,var(--success)_50%,transparent)] custom-scrollbar" />
              </div>
            </UniversalGroup>

            <UniversalGroup title={t("compliance_tier") || "Compliance & Compatibility"} icon={t("verified") || "verified"} className="pb-24">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("compliance_tier") || "Compliance Tier"}</label>
                <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({ ...editForm, compliance_tier: val })} maxTier={4} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("game_versions") || "Compatible Game Versions"}</label>
                <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({ ...editForm, compatible_versions: v })} />
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </>
  );
}






