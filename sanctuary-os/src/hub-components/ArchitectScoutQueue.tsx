import { PanelHeaderGroup, PanelHeaderButton, ActionButton } from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "../components/layouts/ElevatedHubLayout";
import { UniversalGroup, SidePanelHeroCard, StatBox } from "../components/universal/UniversalLayout";
import { useState, useEffect } from "react";
import { fetchAllPaginated, isSupportedExtension } from "../shared";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel, GameVersionMultiSelect,
  CustomComplianceDropdown, ModSearchDropdown, EmptyState
} from "../shared";
import { ArtifactCard } from "../Cards";
import { CustomMasonDropdown } from "../ArchitectHub";
import { logArchitectAction } from "../lib/audit";
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

  const minScoutSubmissions = Math.max(
    1,
    Number(
      activeGameSchema?.min_scout_submissions ??
        activeGameSchema?.scout_min_submissions ??
        3
    ) || 3
  );

  type FieldCandidate = {
    norm: string;
    display: string;
    rawValue: any;
    count: number;
    percent: number;
  };

  const computeFieldCandidates = (
    rows: any[],
    extractor: (row: any) => any,
    normalizer?: (val: any) => { norm: string; display: string; rawValue: any } | null
  ): FieldCandidate[] => {
    const total = Math.max(1, rows.length);
    const map = new Map<string, { display: string; rawValue: any; count: number }>();
    rows.forEach((r) => {
      const raw = extractor(r);
      if (raw === undefined || raw === null) return;
      let parsed: { norm: string; display: string; rawValue: any } | null = null;
      if (normalizer) {
        parsed = normalizer(raw);
      } else {
        const str = String(raw).trim();
        if (!str) return;
        parsed = { norm: str.toLowerCase(), display: str, rawValue: str };
      }
      if (!parsed || !parsed.norm) return;
      const existing = map.get(parsed.norm);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(parsed.norm, {
          display: parsed.display,
          rawValue: parsed.rawValue,
          count: 1,
        });
      }
    });
    return Array.from(map.entries())
      .map(([norm, info]) => ({
        norm,
        display: info.display,
        rawValue: info.rawValue,
        count: info.count,
        percent: Math.round((info.count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  };

  const buildConsensusGroup = (dnaHash: string, rows: any[]) => {
    const sortedRows = [...rows].sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    const primary = sortedRows[0] || rows[0];
    const fields = {
      name: computeFieldCandidates(rows, (r) =>
        r.suggested_name ? String(r.suggested_name).replace(/_/g, " ").trim() : ""
      ),
      author: computeFieldCandidates(rows, (r) => r.suggested_author),
      type: computeFieldCandidates(rows, (r) => r.suggested_type),
      sub_type: computeFieldCandidates(rows, (r) => r.suggested_sub_type),
      version: computeFieldCandidates(rows, (r) => r.suggested_version),
      url: computeFieldCandidates(rows, (r) => r.suggested_url),
      image_url: computeFieldCandidates(rows, (r) => r.image_url),
      description: computeFieldCandidates(rows, (r) => r.description),
      game_versions: computeFieldCandidates(
        rows,
        (r) => r.suggested_game_versions,
        (raw) => {
          const arr = Array.isArray(raw)
            ? raw.map((v: any) => String(v).trim()).filter(Boolean)
            : typeof raw === "string"
              ? raw
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)
              : [];
          if (arr.length === 0) return null;
          const sorted = [...new Set(arr)].sort();
          return {
            norm: sorted.join("|").toLowerCase(),
            display: sorted.join(", "),
            rawValue: sorted,
          };
        }
      ),
      compliance_tier: computeFieldCandidates(
        rows,
        (r) => r.compliance_tier ?? 0,
        (raw) => {
          const n = Number(raw ?? 0);
          return {
            norm: String(n),
            display: `${t("stat_tier", "Tier")} ${n}`,
            rawValue: n,
          };
        }
      ),
    };

    const topPcts = [
      fields.name[0]?.percent,
      fields.author[0]?.percent,
      fields.type[0]?.percent,
      fields.version[0]?.percent,
    ].filter((n): n is number => typeof n === "number");
    const avgConfidence =
      topPcts.length > 0
        ? Math.round(topPcts.reduce((a, b) => a + b, 0) / topPcts.length)
        : 100;

    return {
      ...primary,
      dna_hash: dnaHash,
      suggested_name: fields.name[0]?.display || primary?.suggested_name || dnaHash,
      suggested_author: fields.author[0]?.display || primary?.suggested_author || "",
      suggested_type: fields.type[0]?.display || primary?.suggested_type || "Script",
      suggested_sub_type: fields.sub_type[0]?.display || primary?.suggested_sub_type || "",
      suggested_version: fields.version[0]?.display || primary?.suggested_version || "v.Scout",
      suggested_url: fields.url[0]?.display || primary?.suggested_url || "",
      image_url: fields.image_url[0]?.display || primary?.image_url || "",
      description: fields.description[0]?.display || primary?.description || "",
      suggested_game_versions:
        fields.game_versions[0]?.rawValue || primary?.suggested_game_versions || [],
      compliance_tier:
        fields.compliance_tier[0]?.rawValue ?? primary?.compliance_tier ?? 0,
      submission_count: rows.length,
      consensus_confidence: avgConfidence,
      all_submissions: sortedRows,
      consensus_fields: fields,
    };
  };

  const applyConsensusToForm = (scoutGroup: any) => {
    if (!scoutGroup) return;
    const fields = scoutGroup.consensus_fields;
    const bestAuthor = fields?.author?.[0]?.display || scoutGroup.suggested_author || "";
    const possibleMason = masonsList.find(
      (m: any) =>
        (bestAuthor && String(m.name || "").toLowerCase() === bestAuthor.toLowerCase()) ||
        m.id === scoutGroup.suggested_mason_id
    );
    let st = fields?.sub_type?.[0]?.display || scoutGroup.suggested_sub_type || "";
    let fe = "";
    if (isSupportedExtension(st, useStore.getState().activeGameSchema)) {
      fe = "." + st.toLowerCase().replace(/^\./, "");
      st = "";
    }
    const bestVer = fields?.version?.[0]?.display || scoutGroup.suggested_version || "v.Scout";
    setEditForm({
      name: (fields?.name?.[0]?.display || scoutGroup.suggested_name || "").replace(/_/g, " "),
      mason_id: possibleMason ? possibleMason.id : "",
      category_override: fields?.type?.[0]?.display || scoutGroup.suggested_type || "Script",
      sub_type: st,
      file_extension: fe,
      description: fields?.description?.[0]?.display || scoutGroup.description || "",
      image_url: fields?.image_url?.[0]?.display || scoutGroup.image_url || "",
      latest_version: bestVer,
      url: fields?.url?.[0]?.display || scoutGroup.suggested_url || "",
      compliance_tier: Number(
        fields?.compliance_tier?.[0]?.rawValue ?? scoutGroup.compliance_tier ?? 0
      ),
      compatible_versions: Array.isArray(fields?.game_versions?.[0]?.rawValue)
        ? fields.game_versions[0].rawValue
        : Array.isArray(scoutGroup.suggested_game_versions)
          ? scoutGroup.suggested_game_versions
          : [],
      hash_version: bestVer,
    });
  };

  useEffect(() => {
    if (activeScout) {
      setLineageId("");
      applyConsensusToForm(activeScout);
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

  const pendingRaw = submissions.filter((s: any) => s.status === 'pending');
  const completedRaw = submissions.filter((s: any) => s.status !== 'pending');

  const pendingGroupsMap = new Map<string, any[]>();
  pendingRaw.forEach((s: any) => {
    if (!s.dna_hash) return;
    const key = String(s.dna_hash);
    if (!pendingGroupsMap.has(key)) pendingGroupsMap.set(key, []);
    pendingGroupsMap.get(key)!.push(s);
  });

  const pendingSubmissions = Array.from(pendingGroupsMap.entries())
    .filter(([, rows]) => rows.length >= minScoutSubmissions)
    .map(([dnaHash, rows]) => buildConsensusGroup(dnaHash, rows));

  const completedGroupsMap = new Map<string, any[]>();
  completedRaw.forEach((s: any) => {
    const key = String(s.dna_hash || s.id);
    if (!completedGroupsMap.has(key)) completedGroupsMap.set(key, []);
    completedGroupsMap.get(key)!.push(s);
  });

  const completedSubmissions = Array.from(completedGroupsMap.entries()).map(
    ([dnaHash, rows]) => buildConsensusGroup(dnaHash, rows)
  );

  const activeSubmissions = filterTab === 'pending' ? pendingSubmissions : completedSubmissions;

  const filteredSubmissions = activeSubmissions.filter((s: any) => {
    const q = searchTerm.toLowerCase();
    return (
      s.suggested_name?.toLowerCase().includes(q) ||
      s.suggested_author?.toLowerCase().includes(q) ||
      s.dna_hash?.toLowerCase().includes(q) ||
      s.id?.toLowerCase().includes(q)
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

  const renderScoutCard = (mod: any) => {
    const subCount = Number(mod.submission_count || 1);
    return (
      <ArtifactCard
        key={mod.dna_hash || mod.id}
        mod={{
          ...mod,
          name: mod.suggested_name,
          displayName: mod.suggested_name,
          master_author: mod.suggested_author,
          author: mod.suggested_author,
          latest_version: mod.suggested_version,
          version: mod.suggested_version,
          category_override: mod.suggested_type || t("scout_queue", "Scout Queue"),
        }}
        onClick={() => setActiveScout(mod)}
        masonsList={masonsList}
        overrideActionLabel={`${subCount} ${t("scout_submissions_badge", "Submissions")}`}
      />
    );
  };

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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
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
                <StatBox
                  label={t("scout_submissions_badge", "Submissions")}
                  value={`${activeScout.submission_count || 1} / ${minScoutSubmissions}`}
                  icon={t("icon_group", "group")}
                  iconColorClass="text-[var(--success)]"
                />
                <StatBox
                  label={t("scout_consensus_confidence", "Consensus Match")}
                  value={`${activeScout.consensus_confidence ?? 100}%`}
                  icon={t("icon_verified", "verified")}
                  iconColorClass={
                    (activeScout.consensus_confidence ?? 100) >= 65
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                  }
                />
              </div>
            </SidePanelHeroCard>

            {/* Most Likely True Metadata — Field-by-Field Consensus Comparison */}
            <UniversalGroup
              title={t("scout_consensus_matrix_title", "Most Likely True Metadata (Consensus Comparison)")}
              icon={t("icon_analytics", "analytics")}
              headerAction={
                <button
                  type="button"
                  onClick={() => applyConsensusToForm(activeScout)}
                  className="px-3 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)] inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_auto_fix_high", "auto_fix_high")}
                  </span>
                  <span>{t("scout_btn_apply_consensus", "Apply Top Consensus")}</span>
                </button>
              }
            >
              <div className="flex flex-col gap-2.5">
                <p className="text-[11px] font-bold text-[var(--subtext)] opacity-85 px-1">
                  {t(
                    "scout_consensus_matrix_desc",
                    "Compares matching submissions per field across all {0} reports. Click any candidate value below to apply it to the {Mod} record."
                  ).replace("{0}", String(activeScout.submission_count || 1))}
                </p>

                <div className="flex flex-col gap-2">
                  {[
                    {
                      key: "name",
                      label: t("label_modname", "{Mod} Name"),
                      candidates: activeScout.consensus_fields?.name || [],
                      currentVal: editForm.name,
                      onApply: (c: any) => setEditForm((prev) => ({ ...prev, name: c.display })),
                    },
                    {
                      key: "author",
                      label: t("mason", "{Mason}"),
                      candidates: activeScout.consensus_fields?.author || [],
                      currentVal:
                        masonsList.find((m: any) => m.id === editForm.mason_id)?.name || "",
                      onApply: (c: any) => {
                        const matched = masonsList.find(
                          (m: any) =>
                            String(m.name || "").toLowerCase() === String(c.display || "").toLowerCase()
                        );
                        if (matched) {
                          setEditForm((prev) => ({ ...prev, mason_id: matched.id }));
                        } else {
                          setNewMasonName(c.display);
                          setIsMasonPanelOpen(true);
                        }
                      },
                    },
                    {
                      key: "type",
                      label: t("category", "Category"),
                      candidates: activeScout.consensus_fields?.type || [],
                      currentVal: editForm.category_override,
                      onApply: (c: any) =>
                        setEditForm((prev) => ({ ...prev, category_override: c.display })),
                    },
                    {
                      key: "sub_type",
                      label: t("registry_col_subcat", "Subcategory / Format"),
                      candidates: activeScout.consensus_fields?.sub_type || [],
                      currentVal: editForm.sub_type || editForm.file_extension,
                      onApply: (c: any) => {
                        const val = String(c.display || "");
                        if (isSupportedExtension(val, activeGameSchema)) {
                          setEditForm((prev) => ({
                            ...prev,
                            file_extension: "." + val.toLowerCase().replace(/^\./, ""),
                          }));
                        } else {
                          setEditForm((prev) => ({ ...prev, sub_type: val }));
                        }
                      },
                    },
                    {
                      key: "version",
                      label: t("registry_label_version", "Version"),
                      candidates: activeScout.consensus_fields?.version || [],
                      currentVal: editForm.latest_version || editForm.hash_version,
                      onApply: (c: any) =>
                        setEditForm((prev) => ({
                          ...prev,
                          latest_version: c.display,
                          hash_version: c.display,
                        })),
                    },
                    {
                      key: "url",
                      label: t("ui_url", "Source URL"),
                      candidates: activeScout.consensus_fields?.url || [],
                      currentVal: editForm.url,
                      onApply: (c: any) => setEditForm((prev) => ({ ...prev, url: c.display })),
                    },
                    {
                      key: "game_versions",
                      label: t("game_versions", "Compatible Game Versions"),
                      candidates: activeScout.consensus_fields?.game_versions || [],
                      currentVal: (editForm.compatible_versions || []).join(", "),
                      onApply: (c: any) =>
                        setEditForm((prev) => ({
                          ...prev,
                          compatible_versions: Array.isArray(c.rawValue) ? c.rawValue : [],
                        })),
                    },
                    {
                      key: "image_url",
                      label: t("cc_cover_url", "Cover Image URL"),
                      candidates: activeScout.consensus_fields?.image_url || [],
                      currentVal: editForm.image_url,
                      onApply: (c: any) =>
                        setEditForm((prev) => ({ ...prev, image_url: c.display })),
                    },
                    {
                      key: "description",
                      label: t("upload_desc", "Description"),
                      candidates: activeScout.consensus_fields?.description || [],
                      currentVal: editForm.description,
                      onApply: (c: any) =>
                        setEditForm((prev) => ({ ...prev, description: c.display })),
                    },
                  ]
                    .filter((row) => row.candidates.length > 0)
                    .map((row) => {
                      const totalSubs = Math.max(1, Number(activeScout.submission_count || 1));
                      return (
                        <div
                          key={row.key}
                          className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {row.label}
                            </span>
                            {row.candidates[0] && (
                              <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                <span className="material-symbols-outlined !text-[11px]">
                                  {t("icon_verified", "verified")}
                                </span>
                                {`${t("scout_most_likely_badge", "Most Likely")}: ${row.candidates[0].count}/${totalSubs} (${row.candidates[0].percent}%)`}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {row.candidates.map((cand: any, idx: number) => {
                              const isSelected =
                                String(row.currentVal || "").trim().toLowerCase() ===
                                String(cand.display || "").trim().toLowerCase();
                              const isTop = idx === 0;
                              return (
                                <button
                                  key={cand.norm + idx}
                                  type="button"
                                  onClick={() => row.onApply(cand)}
                                  className={`px-3 py-1.5 rounded-xl text-left text-xs font-bold border bg-transparent transition-all flex items-center gap-2 cursor-pointer max-w-full ${
                                    isSelected
                                      ? "border-[var(--accent)] text-[var(--accent)]"
                                      : isTop
                                        ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--text)] hover:border-[var(--success)]"
                                        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                                  }`}
                                >
                                  <span className="truncate max-w-[340px]">{cand.display}</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-transparent shrink-0 ${
                                      isTop
                                        ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                                        : "border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)]"
                                    }`}
                                  >
                                    {`${cand.count}/${totalSubs} (${cand.percent}%)`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </UniversalGroup>

            {/* All Individual Submissions Drawer */}
            {Array.isArray(activeScout.all_submissions) &&
              activeScout.all_submissions.length > 0 && (
                <UniversalGroup
                  title={`${t("scout_all_submissions_title", "All Citizen Submissions")} (${activeScout.all_submissions.length})`}
                  icon={t("icon_list_alt", "list_alt")}
                >
                  <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                    {activeScout.all_submissions.map((sub: any, idx: number) => (
                      <div
                        key={sub.id || idx}
                        className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider">
                              {`#${idx + 1}`}
                            </span>
                            <span className="text-xs font-black text-[var(--text)] truncate">
                              {sub.suggested_name || t("unknown", "Unknown")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {sub.created_at && (
                              <span className="text-[10px] font-mono font-bold text-[var(--subtext)]">
                                {new Date(sub.created_at).toLocaleDateString()}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const matchedMason = masonsList.find(
                                  (m: any) =>
                                    String(m.name || "").toLowerCase() ===
                                    String(sub.suggested_author || "").toLowerCase()
                                );
                                setEditForm((prev) => ({
                                  ...prev,
                                  name: (sub.suggested_name || prev.name || "").replace(/_/g, " "),
                                  mason_id: matchedMason ? matchedMason.id : prev.mason_id,
                                  category_override: sub.suggested_type || prev.category_override,
                                  sub_type: sub.suggested_sub_type || prev.sub_type,
                                  latest_version: sub.suggested_version || prev.latest_version,
                                  hash_version: sub.suggested_version || prev.hash_version,
                                  url: sub.suggested_url || prev.url,
                                  image_url: sub.image_url || prev.image_url,
                                  description: sub.description || prev.description,
                                  compatible_versions: Array.isArray(sub.suggested_game_versions)
                                    ? sub.suggested_game_versions
                                    : prev.compatible_versions,
                                }));
                              }}
                              className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              {t("scout_btn_use_submission", "Load")}
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-bold text-[var(--subtext)]">
                          <div className="truncate">
                            <span className="opacity-60">{t("mason", "{Mason}")}: </span>
                            <span className="text-[var(--text)]">
                              {sub.suggested_author || t("unknown", "Unknown")}
                            </span>
                          </div>
                          <div className="truncate">
                            <span className="opacity-60">{t("category", "Category")}: </span>
                            <span className="text-[var(--text)]">
                              {sub.suggested_type || t("oversight_na", "N/A")}
                            </span>
                          </div>
                          <div className="truncate">
                            <span className="opacity-60">{t("version", "Version")}: </span>
                            <span className="text-[var(--text)]">
                              {sub.suggested_version || t("oversight_na", "N/A")}
                            </span>
                          </div>
                          <div className="truncate">
                            <span className="opacity-60">{t("ui_url", "URL")}: </span>
                            <span className="text-[var(--text)]">
                              {sub.suggested_url || t("oversight_na", "N/A")}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </UniversalGroup>
              )}

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
