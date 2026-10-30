import { PanelHeaderGroup, PanelHeaderButton } from "./shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "./components/layouts/ElevatedHubLayout";
import { UniversalGroup, SidePanelHeroCard, StatBox } from "./components/universal/UniversalLayout";
import { useState, useEffect } from "react";
import { fetchAllPaginated } from "./shared";
import { CustomClassificationDropdown } from "./hub-components/SharedRegistry";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  SidePanel, GameVersionMultiSelect,
  CustomComplianceDropdown, EmptyState
} from "./shared";
import { ArtifactCard } from "./Cards";
import { CustomMasonDropdown } from "./ArchitectHub";
import { logArchitectAction } from "./lib/audit";
import {
  LabVerificationGate,
  checkDnaHashVerification,
} from "./components/LabVerificationGate";


export function MasonQueue({ modList = [], setStatus }: { modList?: any[], setStatus?: any }) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const requireMasonLabTest = activeGameSchema?.lab_verification?.require_for_mason_publish !== false;
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<'overview' | 'pending' | 'completed'>('overview');
  const [visibleCount, setVisibleCount] = useState(100);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [activeDnaHash, setActiveDnaHash] = useState<string>("");
  const [isActiveVerified, setIsActiveVerified] = useState<boolean>(false);
  const [isActiveFailed, setIsActiveFailed] = useState<boolean>(false);
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

  const handleSelect = async (mod: any) => {
    setActiveMod(mod);
    setIsActiveVerified(false);
    setIsActiveFailed(false);
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

    let resolvedHash = mod.dna_hash || mod.hash || "";
    if (!resolvedHash && mod.id) {
      const { data: vRows } = await supabase
        .from("mod_versions")
        .select("dna_hash")
        .eq("mod_id", mod.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (vRows && vRows[0]?.dna_hash) {
        resolvedHash = vRows[0].dna_hash;
      }
    }
    if (!resolvedHash && modList?.length) {
      const localMatch = modList.find(
        (m: any) => m.dbId === mod.id || m.name === mod.name || m.displayName === mod.name
      );
      if (localMatch?.hash) resolvedHash = localMatch.hash;
    }
    setActiveDnaHash(resolvedHash);
    if (resolvedHash) {
      const verRes = await checkDnaHashVerification(resolvedHash);
      setIsActiveVerified(verRes.verified);
      setIsActiveFailed(verRes.failed);
    }
  };

  const handleApprove = async () => {
    if (!activeMod) return;
    if (requireMasonLabTest && (!isActiveVerified || isActiveFailed)) {
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

    const { error } = await supabase.from('mods').update({
      ...editForm,
      status: 'verified'
    }).eq('id', activeMod.id);

    if (!error) {
      logArchitectAction('Updated Mod Metadata', 'mods', activeMod.name);
      setActiveMod(null);
      fetchData();
    } else {
      if (setStatus) setStatus(`${t("icon_block", "block")} ${t("err_save_failed", "Save failed:")} ${t(error.message, error.message)}`);
    }
    setIsProcessing(false);
  };

  const handleReject = async () => {
    if (!activeMod) return;
    const reason = prompt(t("prompt_reject_reason", "Enter rejection reason:"));
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
      if (setStatus) setStatus(`${t("icon_block", "block")} ${t("err_save_failed", "Save failed:")} ${t(error.message, error.message)}`);
    }
    setIsProcessing(false);
  };

  const verifiedMasonIds = new Set(masonsList.map((m: any) => m.id));
  const verifiedSubmissions = submissions.filter((s: any) => s.mason_id && verifiedMasonIds.has(s.mason_id));

  const activeSubmissions = verifiedSubmissions.filter((s: any) => {
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
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: verifiedSubmissions.length.toString()
    },
    {
      id: "pending",
      label: t("pending", "Pending"),
      icon: t("icon_schedule", "schedule"),
      number: verifiedSubmissions.filter(s => s.status === 'under_review').length.toString()
    },
    {
      id: "completed",
      label: t("status_completed", "Completed"),
      icon: t("icon_check_circle", "check_circle"),
      number: verifiedSubmissions.filter(s => s.status === 'verified' || s.status === 'unverified').length.toString()
    }
  ];

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon={t("icon_schedule", "schedule")}
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending", "Recent Pending")}
        isEmpty={pendingList.length === 0}
        emptyIcon={t("icon_check_circle", "check_circle")}
        emptyTitle={t("no_pending_masons", "No Pending {Mason} Submissions")}
      >
        {pendingList.slice(0, 4).map((mod: any) => (
          <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view", "View")} />
        ))}
      </HubOverviewSection>

      <HubOverviewSection
        icon={t("icon_check_circle", "check_circle")}
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed", "Recent Completed")}
        isEmpty={completedList.length === 0}
        emptyIcon={t("icon_history", "history")}
        emptyTitle={t("no_history", "No history")}
      >
        {completedList.slice(0, 4).map((mod: any) => (
          <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view", "View")} />
        ))}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("mason_queue", "{Mason} Queue")}
        headerSubtitle={t("mason_queue_desc", "Review submissions from {masons}.")}
        headerIcon={t("icon_construction", "construction")}
        headerIconColorClass="theme-text-accent"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("search_ph", "Search {mods}...") as string}
        hideSearch={filterTab === 'overview'}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={tabs}
      >
        {loading ? (
          <EmptyState
            icon={t("icon_sync", "sync")}
            title={t("hub_loading", "Loading...")}
          />
        ) : filterTab === 'overview' ? (
          renderLanding()
        ) : filteredSubmissions.length === 0 ? (
          <EmptyState icon={t("icon_account_balance", "account_balance")} title={t("no_pending_masons", "No Pending {Mason} Submissions")} className="col-span-full py-16" />
        ) : (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
              {filteredSubmissions.slice(0, visibleCount).map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view", "View")} />
              ))}
            </div>
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
        isOpen={!!activeMod}
        onClose={() => setActiveMod(null)}
        title={t("registry_select_master", "Review Submission")}
        icon={t("icon_construction", "construction")}
        iconColorClass="text-[var(--accent)]"
        subtitle={activeMod ? `${t("lbl_uuid", "UUID")}: ${activeMod.id}` : t("mason_queue_desc", "Review submissions from {masons}.")}
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_block", "block")}
              variant="danger"
              tooltip={t("registry_btn_sever", "Reject")}
              onClick={handleReject}
              disabled={isProcessing}
            />
            <PanelHeaderButton
              icon={requireMasonLabTest && (!isActiveVerified || isActiveFailed) ? t("icon_lock", "lock") : t("icon_check", "check")}
              variant="success"
              tooltip={
                requireMasonLabTest && (!isActiveVerified || isActiveFailed)
                  ? (isActiveFailed
                      ? t("lab_gate_failed_reject_only_msg", "Fatal error detected — Reject Only")
                      : t("lab_gate_locked_architect_msg", "Approval Locked: Timed Lab test required"))
                  : isProcessing
                  ? t("btn_saving", "Saving...")
                  : t("ui_btn_approve", "Approve")
              }
              onClick={handleApprove}
              disabled={isProcessing || (requireMasonLabTest && (!isActiveVerified || isActiveFailed))}
            />
          </PanelHeaderGroup>
        }
      >
        {activeMod && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_construction", "construction")}
              overline={t("mason_queue", "{Mason} Queue")}
              title={editForm.name || activeMod.name || t("registry_select_master", "Review Submission")}
              description={t("mason_queue_desc", "Review submissions from {masons}.")}
              badge={(activeMod.status || t("pending", "Pending")).replace(/_/g, " ")}
              badgeIcon={activeMod.status === "verified" ? t("icon_verified", "verified") : t("icon_schedule", "schedule")}
              variant={activeMod.status === "verified" ? "success" : "accent"}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <StatBox
                  label={t("mason", "{Mason}")}
                  value={
                    masonsList.find((m: any) => m.id === editForm.mason_id)?.name ||
                    activeMod.master_author ||
                    t("unknown_mason", "Unknown {Mason}")
                  }
                  icon={t("icon_architecture", "architecture")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("compliance_tier", "Compliance Tier")}
                  value={`${t("auto_tier", "Tier")} ${editForm.compliance_tier || 0}`}
                  icon={t("icon_verified_user", "verified_user")}
                  iconColorClass={
                    (editForm.compliance_tier || 0) >= 3
                      ? "text-[var(--danger)]"
                      : (editForm.compliance_tier || 0) >= 1
                        ? "text-[var(--warning)]"
                        : "text-[var(--success)]"
                  }
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              value={editForm.name || ""}
              onChange={val => setEditForm({ ...editForm, name: val })}
              label={t("label_modname", "{Mod} Name")}
              placeholder={t("label_modname", "{Mod} Name")}
              subtitle={`${t("lbl_uuid", "UUID")}: ${String(activeMod.id || "").substring(0, 8)}`}
            />

            <LabVerificationGate
              dnaHash={activeDnaHash || activeMod?.id}
              modName={editForm.name || activeMod?.name || t("registry_select_master", "Submission")}
              physicalPath={
                (modList || []).find(
                  (m: any) =>
                    (activeDnaHash && m.hash === activeDnaHash) ||
                    m.dbId === activeMod?.id ||
                    m.name === activeMod?.name ||
                    m.displayName === activeMod?.name
                )?.name || activeMod?.name
              }
              roleContext="architect"
              isGateRequired={requireMasonLabTest}
              onStatusChange={(st) => {
                setIsActiveVerified(st.verified);
                setIsActiveFailed(st.failed);
              }}
            />

            <UniversalGroup title={t("section_classification_creator", "Classification & {Mason}")} icon={t("icon_info", "info")}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("mason", "{Mason}")}</label>
                  <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({ ...editForm, mason_id: id })} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("category", "Category")}</label>
                  <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({ ...editForm, category_override: newType })} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("label_file_ext", "File Extension")}</label>
                  <input value={editForm.file_extension} onChange={e => setEditForm({ ...editForm, file_extension: e.target.value })} className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all" placeholder={t("ph_file_ext", ".package")} />
                </div>
                <div className="flex flex-col gap-1.5">
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

            <UniversalGroup title={t("section_compliance_compatibility", "Compliance & Compatibility")} icon={t("icon_verified", "verified")}>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("compliance_tier", "Compliance Tier")}</label>
                <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({ ...editForm, compliance_tier: val })} maxTier={4} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("game_versions", "Compatible Game Versions")}</label>
                <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({ ...editForm, compatible_versions: v })} />
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </>
  );
}
