import { ActionPill, FilterTabs, FilterTabButton, PanelHeaderGroup, PanelHeaderButton, ActionButton } from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "../components/layouts/ElevatedHubLayout";
import { UniversalGroup, SidePanelHeroCard, StatBox } from "../components/universal/UniversalLayout";
import { StatTileCarousel } from "../hub-components/SharedCommandScreenLayout";
import React, { useState, useEffect } from "react";
import { fetchAllPaginated, isSupportedExtension } from "../shared";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, DashboardStatTile,
  HubTabButton, ModSearchDropdown, EmptyState, HeaderActionPortal,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";
import {
  LabVerificationGate,
  checkDnaHashVerification,
} from "../components/LabVerificationGate";


export function ScoutQueue({ modList = [], setStatus }: { modList?: any[], setStatus?: any }) {
  const { t } = useLexicon();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<'overview' | 'pending' | 'completed'>('overview');
  const [visibleCount, setVisibleCount] = useState(100);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [cloudModsList, setCloudModsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScout, setActiveScout] = useState<any | null>(null);
  const [isActiveVerified, setIsActiveVerified] = useState<boolean>(false);
  const [isActiveFailed, setIsActiveFailed] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lineageId, setLineageId] = useState<string>("");
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const requireScoutLabTest = activeGameSchema?.lab_verification?.require_for_scout_approval !== false;

  useEffect(() => {
    if (!activeScout?.dna_hash) {
      setIsActiveVerified(false);
      setIsActiveFailed(false);
      return;
    }
    checkDnaHashVerification(activeScout.dna_hash).then((res) => {
      setIsActiveVerified(res.verified);
      setIsActiveFailed(res.failed);
    });
  }, [activeScout?.dna_hash]);

  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      const { data: mData } = await supabase.from('masons').select('id, name').order('name');
      if (mData) setMasonsList(mData);
      setEditForm({ ...editForm, mason_id: newId });
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const [editForm, setEditForm] = useState({
    name: "",
    mason_id: "",
    category_override: "",
    sub_type: "", file_extension: "",
    description: "",
    image_url: "",
    latest_version: "",
    url: "",
    compliance_tier: 0,
    compatible_versions: [] as string[],
    hash_version: ""
  });

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data: mData } = await supabase.from('masons').select('*').order('name');
    if (mData) setMasonsList(mData);

    const { data: cData } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, latest_version, url, image_url, description, sub_type, file_extension, mason_id, category_override, compliance_tier, compatible_versions').order('name'));
    if (cData) setCloudModsList(cData);

    const { data, error } = await supabase
      .from('scout_suggestions')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => { fetchSubmissions(); }, []);

  useEffect(() => { setVisibleCount(100); }, [searchTerm, filterTab]);

  useEffect(() => {
    if (activeScout) {
      setLineageId("");
      const possibleMason = masonsList.find((m: any) => m.name === activeScout.suggested_author || m.id === activeScout.suggested_mason_id);
      let st = activeScout.suggested_sub_type || "";
      let fe = "";
      if (isSupportedExtension(st, useStore.getState().activeGameSchema)) {
        fe = "." + st.toLowerCase();
        st = "";
      }

      setEditForm({
        name: (activeScout.suggested_name || "").replace(/_/g, " "),
        mason_id: possibleMason ? possibleMason.id : "",
        category_override: activeScout.suggested_type || "Script",
        sub_type: st,
        file_extension: fe,
        description: "",
        image_url: "",
        latest_version: "",
        url: activeScout.suggested_url || "",
        compliance_tier: 0,
        compatible_versions: [],
        hash_version: activeScout.suggested_version || "v.Scout"
      });
    } else {
      setEditForm({
        name: "", mason_id: "", category_override: "", sub_type: "", file_extension: "", description: "", image_url: "", latest_version: "", url: "", compliance_tier: 0, compatible_versions: [], hash_version: ""
      });
      setLineageId("");
    }
  }, [activeScout, masonsList]);

  useEffect(() => {
    if (lineageId && cloudModsList) {
      const existing = cloudModsList.find(m => m.id === lineageId);
      if (existing) {
        setEditForm(prev => ({
          ...prev,
          name: existing.name || prev.name,
          mason_id: existing.mason_id || prev.mason_id,
          category_override: existing.category_override || prev.category_override,
          sub_type: existing.sub_type || prev.sub_type,
          file_extension: existing.file_extension || prev.file_extension,
          description: existing.description || prev.description,
          image_url: existing.image_url || prev.image_url,
          url: existing.url || prev.url,
          compliance_tier: existing.compliance_tier || prev.compliance_tier,
          compatible_versions: existing.compatible_versions || prev.compatible_versions
        }));
      }
    }
  }, [lineageId, cloudModsList]);

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!activeScout) return;
    if (action === 'approved' && requireScoutLabTest && (!isActiveVerified || isActiveFailed)) {
      if (setStatus) {
        setStatus(
          isActiveFailed
            ? t("lab_gate_failed_reject_only_msg", "Fatal error detected or no clean test produced. Only Rejection is permitted for this submission.")
            : t("lab_gate_locked_architect_msg", "Approval Locked: No clean timed Lab test exists for this SHA-256 hash.")
        );
      }
      return;
    }
    setIsProcessing(true);

    if (action === 'approved') {
      if (lineageId) {
        await supabase.from('mod_versions').upsert({
          mod_id: lineageId,
          dna_hash: activeScout.dna_hash,
          version_label: editForm.hash_version
        }, { onConflict: 'dna_hash' });

        await supabase.from('mods').update({
          name: editForm.name,
          mason_id: editForm.mason_id || null,
          category_override: editForm.category_override,
          sub_type: editForm.sub_type,
          file_extension: editForm.file_extension,
          description: editForm.description,
          image_url: editForm.image_url,
          url: editForm.url,
          compliance_tier: editForm.compliance_tier,
          compatible_versions: editForm.compatible_versions,
          status: 'verified'
        }).eq('id', lineageId);
      } else {
        const { data: modData } = await supabase.from('mods').insert({
          name: editForm.name,
          mason_id: editForm.mason_id || null,
          category_override: editForm.category_override,
          sub_type: editForm.sub_type,
          file_extension: editForm.file_extension,
          description: editForm.description,
          image_url: editForm.image_url,
          latest_version: editForm.latest_version,
          url: editForm.url,
          compliance_tier: editForm.compliance_tier,
          compatible_versions: editForm.compatible_versions,
          status: 'verified'
        }).select().single();

        if (modData) {
          await supabase.from('mod_versions').upsert({
            mod_id: modData.id,
            dna_hash: activeScout.dna_hash,
            version_label: editForm.hash_version
          }, { onConflict: 'dna_hash' });
        }
      }
      if (activeScout.dna_hash) {
        await supabase.from('scout_suggestions').update({ status: 'approved' }).eq('dna_hash', activeScout.dna_hash).eq('status', 'pending');
      } else {
        await supabase.from('scout_suggestions').update({ status: 'approved' }).eq('id', activeScout.id);
      }
      logArchitectAction('Approved Scout Submission', 'scout_suggestions', activeScout.id);
    } else {
      if (activeScout.dna_hash) {
        await supabase.from('scout_suggestions').update({ status: 'rejected' }).eq('dna_hash', activeScout.dna_hash).eq('status', 'pending');
      } else {
        await supabase.from('scout_suggestions').update({ status: 'rejected' }).eq('id', activeScout.id);
      }
      logArchitectAction('Rejected Scout Submission', 'scout_suggestions', activeScout.id);
    }

    setActiveScout(null);
    await fetchSubmissions();
    setIsProcessing(false);
  };

  const minScoutSubmissions = Math.max(1, Number(activeGameSchema?.min_scout_submissions ?? 5) || 5);

  const pendingRaw = submissions.filter((s: any) => s.status === 'pending');
  const completedRaw = submissions.filter((s: any) => s.status !== 'pending');

  const pendingHashCounts = new Map<string, number>();
  pendingRaw.forEach((s: any) => {
    if (s.dna_hash) {
      pendingHashCounts.set(s.dna_hash, (pendingHashCounts.get(s.dna_hash) || 0) + 1);
    }
  });

  const seenPendingHashes = new Set<string>();
  const pendingSubmissions = pendingRaw.filter((s: any) => {
    if (!s.dna_hash) return false;
    if ((pendingHashCounts.get(s.dna_hash) || 0) < minScoutSubmissions) return false;
    if (seenPendingHashes.has(s.dna_hash)) return false;
    seenPendingHashes.add(s.dna_hash);
    return true;
  });

  const seenCompletedHashes = new Set<string>();
  const completedSubmissions = completedRaw.filter((s: any) => {
    if (!s.dna_hash) return true;
    if (seenCompletedHashes.has(s.dna_hash)) return false;
    seenCompletedHashes.add(s.dna_hash);
    return true;
  });

  const activeSubmissions = filterTab === 'pending' ? pendingSubmissions : completedSubmissions;

  const filteredSubmissions = activeSubmissions.filter((s: any) => {
    return (
      s.suggested_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.dna_hash?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: (pendingSubmissions.length + completedSubmissions.length).toString(),
    },
    {
      id: "pending",
      label: t("pending", "Pending"),
      icon: t("icon_pending_actions", "pending_actions"),
      number: pendingSubmissions.length.toString(),
    },
    {
      id: "completed",
      label: t("status_completed", "Completed"),
      icon: t("icon_check_circle", "check_circle"),
      number: completedSubmissions.length.toString(),
    }
  ];

  const renderScoutCard = (mod: any) => (
    <ArtifactCard key={mod.id} mod={{ ...mod, name: mod.suggested_name, category_override: mod.suggested_type || t("scout_queue", "Scout Queue") }} onClick={() => setActiveScout(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view", "View")} />
  );

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon={t("icon_pending_actions", "pending_actions")}
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending", "Recent Pending")}
        isEmpty={pendingSubmissions.length === 0}
        emptyIcon={t("icon_check_circle", "check_circle")}
        emptyTitle={t("no_pending", "No Pending Submissions")}
      >
        {pendingSubmissions.slice(0, 4).map(renderScoutCard)}
      </HubOverviewSection>

      <HubOverviewSection
        icon={t("icon_check_circle", "check_circle")}
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed", "Recent Completed")}
        isEmpty={completedSubmissions.length === 0}
        emptyIcon={t("icon_history", "history")}
        emptyTitle={t("no_history", "No History")}
      >
        {completedSubmissions.slice(0, 4).map(renderScoutCard)}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("scout_queue", "Scout Queue")}
        headerSubtitle={t("scout_queue_desc", "Review automated network anomaly submissions.")}
        headerIcon={t("icon_radar", "radar")}
        headerIconColorClass="theme-text-accent"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("search_queue", "Search queue...") as string}
        hideSearch={filterTab === 'overview'}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={tabs}
      >
        {filterTab === 'overview' ? renderLanding() : (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loading ? (
              <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs capitalize animate-pulse">{t("intercepting", "Intercepting {Dispatches}...")}</div>
            ) : filteredSubmissions.length === 0 ? (
              <EmptyState icon={t("icon_account_balance", "account_balance")} title={t("no_pending_submissions", "No pending submissions")} className="col-span-full py-16" />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                {filteredSubmissions.slice(0, visibleCount).map(renderScoutCard)}
              </div>
            )}
            {filteredSubmissions.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("load_more", "Load More")} ({visibleCount} / {filteredSubmissions.length})
              </button>
            )}
          </div>
        )}
      </ElevatedHubLayout>

      <SidePanel
        isOpen={!!activeScout}
        onClose={() => setActiveScout(null)}
        title={t("reviewing", "Reviewing Submission")}
        icon={t("icon_search", "search")}
        iconColorClass="text-[var(--accent)]"
        subtitle={activeScout ? `${t("dna_hash", "HASH")}: ${activeScout.dna_hash}` : t("scout_queue_desc", "Review automated network anomaly submissions.")}
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_delete", "delete")}
              variant="danger"
              tooltip={t("discard", "Discard")}
              onClick={() => handleAction('rejected')}
              disabled={isProcessing}
            />
            <PanelHeaderButton
              icon={requireScoutLabTest && (!isActiveVerified || isActiveFailed) ? t("icon_lock", "lock") : t("icon_check", "check")}
              variant="success"
              tooltip={
                requireScoutLabTest && (!isActiveVerified || isActiveFailed)
                  ? (isActiveFailed
                      ? t("lab_badge_short_failed", "Lab Failed")
                      : t("lab_tooltip_approve_locked", "Approval Locked (Lab Test Required)"))
                  : isProcessing
                  ? t("btn_saving", "Saving...")
                  : t("approve", "Approve")
              }
              onClick={() => handleAction('approved')}
              disabled={isProcessing || (requireScoutLabTest && (!isActiveVerified || isActiveFailed))}
            />
          </PanelHeaderGroup>
        }
      >
        {activeScout && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_radar", "radar")}
              overline={t("scout_queue", "Scout Queue")}
              title={editForm.name || activeScout.suggested_name || t("reviewing", "Reviewing Submission")}
              description={t("scout_queue_desc", "Review automated network anomaly submissions.")}
              badge={(activeScout.status || t("pending", "Pending")).replace(/_/g, " ")}
              badgeIcon={activeScout.status === "approved" ? t("icon_verified", "verified") : t("icon_pending_actions", "pending_actions")}
              variant={activeScout.status === "approved" ? "success" : "accent"}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <StatBox
                  label={t("dna_hash", "DNA Hash")}
                  value={activeScout.dna_hash ? `${String(activeScout.dna_hash).substring(0, 12)}...` : t("oversight_na", "N/A")}
                  icon={t("icon_fingerprint", "fingerprint")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("mason", "{Mason}")}
                  value={
                    masonsList.find((m: any) => m.id === editForm.mason_id)?.name ||
                    activeScout.suggested_author ||
                    t("unknown_mason", "Unknown {Mason}")
                  }
                  icon={t("icon_architecture", "architecture")}
                  iconColorClass="text-[var(--accent)]"
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              value={editForm.name}
              onChange={val => setEditForm({ ...editForm, name: val })}
              label={t("label_modname", "{Mod} Name")}
              placeholder={t("label_modname", "{Mod} Name")}
              subtitle={`${t("dna_hash", "HASH")}: ${String(activeScout.dna_hash || "").substring(0, 12)}`}
            />

            <LabVerificationGate
              dnaHash={activeScout.dna_hash}
              modName={editForm.name || activeScout.suggested_name || t("reviewing", "Scout Artifact")}
              physicalPath={
                (modList || []).find(
                  (m: any) =>
                    (activeScout.dna_hash && m.hash === activeScout.dna_hash) ||
                    m.name === activeScout.suggested_name ||
                    m.displayName === activeScout.suggested_name
                )?.name || activeScout.suggested_name
              }
              roleContext="architect"
              isGateRequired={requireScoutLabTest}
              onStatusChange={(st) => {
                setIsActiveVerified(st.verified);
                setIsActiveFailed(st.failed);
              }}
            />

            <UniversalGroup title={t("label_lineage", "Artifact Lineage")} icon={t("icon_account_tree", "account_tree")}>
              <ModSearchDropdown
                modList={cloudModsList || []}
                onSelect={(m: any) => setLineageId(m.id)}
                selectedItem={cloudModsList?.find((m: any) => m.id === lineageId)}
                onClear={() => setLineageId("")}
                placeholder={t("ph_link_lineage", "Search to link with existing {Mod} Lineage...")}
              />
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-70 mt-1 px-1">
                {t("label_lineage_desc", "Linking will append this signature to the existing {Mod} rather than creating a new one.")}
              </p>
            </UniversalGroup>

            <UniversalGroup title={t("btn_view", "Classification")} icon={t("icon_info", "info")}>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("mason", "{Mason}")}</label>
                <div className="flex items-center gap-2 relative">
                  <div className="flex-1 min-w-0">
                    <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({ ...editForm, mason_id: id })} />
                  </div>
                  <ActionButton
                    onClick={() => setIsMasonPanelOpen(true)}
                    variant="glass"
                    icon={t("icon_person_add", "person_add")}
                    label={t("create_title", "New {Mason}")}
                    iconOnly={true}
                    className="!h-11 !w-11 !px-0 rounded-xl shrink-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("category", "Category")}</label>
                  <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({ ...editForm, category_override: newType })} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("label_file_ext", "File Extension")}</label>
                  <input value={editForm.file_extension} onChange={e => setEditForm({ ...editForm, file_extension: e.target.value })} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all" placeholder={t("ph_file_ext", ".package")} />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("registry_col_subcat", "Subcategory")}</label>
                  <input value={editForm.sub_type} onChange={e => setEditForm({ ...editForm, sub_type: e.target.value })} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all" placeholder={t("auto_e_g_tuning_26", "e.g. Tuning")} />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup title={t("resources", "Resources")} icon={t("icon_link", "link")}>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("ui_url", "Source URL")}</label>
                <input value={editForm.url || ""} onChange={e => setEditForm({ ...editForm, url: e.target.value })} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("cc_cover_url", "Cover Image URL")}</label>
                <input value={editForm.image_url || ""} onChange={e => setEditForm({ ...editForm, image_url: e.target.value })} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("upload_desc", "Description")}</label>
                <textarea value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold min-h-[112px] resize-y border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all custom-scrollbar" />
              </div>
            </UniversalGroup>

            <UniversalGroup title={t("compliance_tier", "Compliance & Compatibility")} icon={t("icon_verified", "verified")}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("compliance_tier", "Compliance Tier")}</label>
                  <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({ ...editForm, compliance_tier: val })} maxTier={4} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 flex items-center gap-1">
                    {t("registry_label_version", "Version")}
                  </label>
                  <input value={editForm.latest_version} onChange={e => setEditForm({ ...editForm, latest_version: e.target.value })} placeholder={t("ph_mod_version", "1.0.0")} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--accent)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("game_versions", "Compatible Game Versions")}</label>
                <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({ ...editForm, compatible_versions: v })} />
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("create_title", "New {Mason}")}
        subtitle={t("create_mason_subtitle", "Link a new verified or unverified {Mason}")}
        icon={t("icon_person_add", "person_add")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_check", "check")}
              variant="accent"
              tooltip={t("create_btn_create", "Create Mason")}
              onClick={handleCreateMason}
              disabled={isCreatingMason || !newMasonName.trim()}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_person_add", "person_add")}
            overline={t("mason", "{Mason}")}
            title={t("create_title", "New {Mason}")}
            description={t("create_mason_subtitle", "Link a new verified or unverified {Mason}")}
            variant="accent"
          />

          <SidePanelTitleInput
            value={newMasonName}
            onChange={setNewMasonName}
            label={t("mason_name", "{Mason} Name")}
            placeholder={t("create_ph_name", "Enter {mason} name...")}
          />
        </div>
      </SidePanel>
    </>
  );
}
