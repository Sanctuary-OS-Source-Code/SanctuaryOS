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
import { ArtifactCard, VAULT_CHIP_CLASS } from "../Cards";
import { CustomMasonDropdown } from "../ArchitectHub";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import {
  LabVerificationGate,
  checkDnaHashVerification,
} from "../components/LabVerificationGate";

export function ScoutQueue({ modList = [], setStatus }: { modList?: any[]; setStatus?: any }) {
  const { t } = useLexicon();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<"overview" | "pending" | "completed">("overview");
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
  const [copiedHash, setCopiedHash] = useState(false);
  const [showRawSubmissions, setShowRawSubmissions] = useState(false);

  const activeGameSchema = useStore((state) => state.activeGameSchema);
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
    const { error } = await supabase.from("masons").insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      const { data: mData } = await supabase.from("masons").select("id, name").order("name");
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
    sub_type: "",
    file_extension: "",
    description: "",
    image_url: "",
    latest_version: "",
    url: "",
    compliance_tier: 0,
    compatible_versions: [] as string[],
    hash_version: "",
  });

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data: mData } = await supabase.from("masons").select("*").order("name");
    if (mData) setMasonsList(mData);

    const { data: cData } = await fetchAllPaginated(() =>
      supabase
        .from("mods")
        .select(
          "id, name, master_author, latest_version, url, image_url, description, sub_type, file_extension, mason_id, category_override, compliance_tier, compatible_versions"
        )
        .order("name")
    );
    if (cData) setCloudModsList(cData);

    const { data, error } = await supabase
      .from("scout_suggestions")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  useEffect(() => {
    setVisibleCount(100);
  }, [searchTerm, filterTab]);

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
      setCopiedHash(false);
      setShowRawSubmissions(false);
      applyConsensusToForm(activeScout);
    } else {
      setEditForm({
        name: "",
        mason_id: "",
        category_override: "",
        sub_type: "",
        file_extension: "",
        description: "",
        image_url: "",
        latest_version: "",
        url: "",
        compliance_tier: 0,
        compatible_versions: [],
        hash_version: "",
      });
      setLineageId("");
    }
  }, [activeScout, masonsList]);

  useEffect(() => {
    if (lineageId && cloudModsList) {
      const existing = cloudModsList.find((m) => m.id === lineageId);
      if (existing) {
        setEditForm((prev) => ({
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
          compatible_versions: existing.compatible_versions || prev.compatible_versions,
        }));
      }
    }
  }, [lineageId, cloudModsList]);

  const handleAction = async (action: "approved" | "rejected") => {
    if (!activeScout) return;
    if (action === "approved" && requireScoutLabTest && (!isActiveVerified || isActiveFailed)) {
      if (setStatus) {
        setStatus(
          isActiveFailed
            ? t(
                "lab_gate_failed_reject_only_msg",
                "Fatal error detected or no clean test produced. Only Rejection is permitted for this submission."
              )
            : t(
                "lab_gate_locked_architect_msg",
                "Approval Locked: No clean timed Lab test exists for this SHA-256 hash."
              )
        );
      }
      return;
    }
    setIsProcessing(true);

    if (action === "approved") {
      if (lineageId) {
        await supabase.from("mod_versions").upsert(
          {
            mod_id: lineageId,
            dna_hash: activeScout.dna_hash,
            version_label: editForm.hash_version,
          },
          { onConflict: "dna_hash" }
        );

        await supabase
          .from("mods")
          .update({
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
            status: "verified",
          })
          .eq("id", lineageId);
      } else {
        const { data: modData } = await supabase
          .from("mods")
          .insert({
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
            status: "verified",
          })
          .select()
          .single();

        if (modData) {
          await supabase.from("mod_versions").upsert(
            {
              mod_id: modData.id,
              dna_hash: activeScout.dna_hash,
              version_label: editForm.hash_version,
            },
            { onConflict: "dna_hash" }
          );
        }
      }
      if (activeScout.dna_hash) {
        await supabase
          .from("scout_suggestions")
          .update({ status: "approved" })
          .eq("dna_hash", activeScout.dna_hash)
          .eq("status", "pending");
      } else {
        await supabase
          .from("scout_suggestions")
          .update({ status: "approved" })
          .eq("id", activeScout.id);
      }
      const existingMod = lineageId
        ? cloudModsList.find((m: any) => m.id === lineageId) || null
        : null;
      await logArchitectAction(
        "Approved Scout Submission",
        "scout_suggestions",
        editForm.name || activeScout.id,
        undefined,
        "Architect Console",
        false,
        computeAuditDiff(existingMod, {
          name: editForm.name,
          category_override: editForm.category_override,
          sub_type: editForm.sub_type,
          latest_version: editForm.hash_version || editForm.latest_version,
          status: "approved",
          dna_hash: activeScout.dna_hash,
        })
      );
    } else {
      if (activeScout.dna_hash) {
        await supabase
          .from("scout_suggestions")
          .update({ status: "rejected" })
          .eq("dna_hash", activeScout.dna_hash)
          .eq("status", "pending");
      } else {
        await supabase
          .from("scout_suggestions")
          .update({ status: "rejected" })
          .eq("id", activeScout.id);
      }
      await logArchitectAction(
        "Rejected Scout Submission",
        "scout_suggestions",
        editForm.name || activeScout.suggested_name || activeScout.id,
        undefined,
        "Architect Console",
        false,
        {
          status: { from: activeScout.status || "pending", to: "rejected" },
          name: { to: editForm.name || activeScout.suggested_name },
          dna_hash: { to: activeScout.dna_hash },
        }
      );
    }

    setActiveScout(null);
    await fetchSubmissions();
    setIsProcessing(false);
  };

  const pendingRaw = submissions.filter((s: any) => s.status === "pending");
  const completedRaw = submissions.filter((s: any) => s.status !== "pending");

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

  const activeSubmissions = filterTab === "pending" ? pendingSubmissions : completedSubmissions;

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
    },
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

  const totalActiveSubs = Math.max(1, Number(activeScout?.submission_count || 1));

  const renderFieldConsensusBadge = (candidates: FieldCandidate[] = []) => {
    if (!candidates || candidates.length === 0) return null;
    const top = candidates[0];
    const isUnanimous = candidates.length === 1;
    return (
      <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] inline-flex items-center gap-1 shrink-0">
        <span
          className={`material-symbols-outlined !text-[11px] ${
            isUnanimous || top.percent >= 65 ? "text-[var(--success)]" : "text-[var(--warning)]"
          }`}
        >
          {isUnanimous ? t("icon_verified", "verified") : t("icon_analytics", "analytics")}
        </span>
        <span>
          {`${t("scout_most_likely_badge", "Most Likely")}: ${top.count}/${totalActiveSubs} (${top.percent}%)`}
        </span>
      </span>
    );
  };

  const renderFieldCandidateChips = (
    candidates: FieldCandidate[] = [],
    currentVal: string,
    onSelect: (cand: FieldCandidate) => void,
    options?: { isCode?: boolean; alwaysShowIfSingleDiffers?: boolean }
  ) => {
    if (!candidates || candidates.length === 0) return null;
    const normCurrent = String(currentVal || "").trim().toLowerCase();
    const topMatchesCurrent =
      candidates.length === 1 &&
      normCurrent === String(candidates[0].display || "").trim().toLowerCase();

    if (candidates.length === 1 && (topMatchesCurrent || !options?.alwaysShowIfSingleDiffers)) {
      return null;
    }

    return (
      <div className="flex flex-col gap-1.5 pt-1">
        {candidates.map((cand, idx) => {
          const isSelected = normCurrent === String(cand.display || "").trim().toLowerCase();
          const isTop = idx === 0;
          return (
            <button
              key={cand.norm + idx}
              type="button"
              onClick={() => onSelect(cand)}
              className={`w-full px-3 py-2 rounded-xl glass-surface sa-glass-pill-hover border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                isSelected
                  ? "sa-glass-pill-active"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
              }`}
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span
                  className={`material-symbols-outlined !text-[14px] mt-0.5 shrink-0 ${
                    isSelected
                      ? "text-[var(--accent)]"
                      : isTop
                        ? "text-[var(--success)]"
                        : "text-[var(--subtext)]"
                  }`}
                >
                  {isSelected
                    ? t("icon_radio_button_checked", "radio_button_checked")
                    : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                </span>
                {options?.isCode ? (
                  <code className="text-xs font-mono font-bold text-[var(--text)] whitespace-normal break-all leading-snug">
                    {cand.display}
                  </code>
                ) : (
                  <span className="text-xs font-bold text-[var(--text)] whitespace-normal break-words leading-snug">
                    {cand.display}
                  </span>
                )}
              </div>
              <span className="px-2 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] inline-flex items-center gap-1 shrink-0">
                {isTop && (
                  <span className="material-symbols-outlined !text-[11px] text-[var(--success)]">
                    {t("icon_check_circle", "check_circle")}
                  </span>
                )}
                <span>{`${cand.count}/${totalActiveSubs} (${cand.percent}%)`}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const isApproveLocked = requireScoutLabTest && (!isActiveVerified || isActiveFailed);
  const resolvedMasonName =
    masonsList.find((m: any) => m.id === editForm.mason_id)?.name ||
    activeScout?.suggested_author ||
    t("unknown_mason", "Unknown {Mason}");

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
        hideSearch={filterTab === "overview"}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={tabs}
      >
        {filterTab === "overview" ? (
          renderLanding()
        ) : (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loading ? (
              <EmptyState
                icon={t("icon_sync", "sync")}
                title={t("intercepting", "Intercepting {Dispatches}...")}
              />
            ) : filteredSubmissions.length === 0 ? (
              <EmptyState
                icon={t("icon_account_balance", "account_balance")}
                title={t("no_pending_submissions", "No pending submissions")}
                className="col-span-full py-16"
              />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                {filteredSubmissions.slice(0, visibleCount).map(renderScoutCard)}
              </div>
            )}
            {filteredSubmissions.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((v) => v + 100)}
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
        title={t("scout_queue", "Scout Queue")}
        subtitle={t("scout_queue_desc", "Review automated network anomaly submissions.")}
        icon={t("icon_radar", "radar")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_auto_fix_high", "auto_fix_high")}
              tooltip={t("scout_btn_apply_consensus", "Apply Top Consensus")}
              onClick={() => applyConsensusToForm(activeScout)}
              disabled={isProcessing}
            />
            <PanelHeaderButton
              icon={t("icon_delete", "delete")}
              variant="danger"
              tooltip={t("discard", "Discard")}
              onClick={() => handleAction("rejected")}
              disabled={isProcessing}
            />
            <PanelHeaderButton
              icon={isApproveLocked ? t("icon_lock", "lock") : t("icon_check", "check")}
              variant="success"
              tooltip={
                isApproveLocked
                  ? isActiveFailed
                    ? t("lab_badge_short_failed", "Lab Failed")
                    : t("lab_tooltip_approve_locked", "Approval Locked (Lab Test Required)")
                  : isProcessing
                    ? t("btn_saving", "Saving...")
                    : t("approve", "Approve & Bind")
              }
              onClick={() => handleAction("approved")}
              disabled={isProcessing || isApproveLocked}
            />
          </PanelHeaderGroup>
        }
      >
        {activeScout && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_radar", "radar")}
              overline={`${t("by_prefix", "By")} ${resolvedMasonName}`}
              title={
                editForm.name ||
                activeScout.suggested_name ||
                t("reviewing", "Reviewing Submission")
              }
              description={t(
                "scout_consensus_matrix_desc",
                "Compares matching submissions per field across all {0} reports. Click any candidate value below to apply it to the {Mod} record."
              ).replace("{0}", String(totalActiveSubs))}
              badge={(activeScout.status || t("pending", "Pending")).replace(/_/g, " ")}
              badgeIcon={
                activeScout.status === "approved"
                  ? t("icon_verified", "verified")
                  : t("icon_pending_actions", "pending_actions")
              }
              variant={activeScout.status === "approved" ? "success" : "accent"}
            >
              {/* 2-Column Telemetry Grid — Zero Cut-off Labels or Values */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <StatBox
                  label={t("scout_submissions_badge", "Submissions")}
                  value={`${totalActiveSubs} / ${minScoutSubmissions}`}
                  icon={t("icon_group", "group")}
                  iconColorClass="text-[var(--accent)]"
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

              {/* Full-Width Copyable SHA-256 Fingerprint Bar */}
              {activeScout.dna_hash && (
                <div className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                      {t("icon_fingerprint", "fingerprint")}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                        {t("dna_hash", "DNA Hash")}
                      </span>
                      <code className="text-[11px] font-mono font-bold text-[var(--text)] break-all leading-snug">
                        {String(activeScout.dna_hash)}
                      </code>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(String(activeScout.dna_hash));
                      setCopiedHash(true);
                      setTimeout(() => setCopiedHash(false), 2000);
                    }}
                    className="px-2.5 py-1.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <span
                      className={`material-symbols-outlined !text-[13px] ${
                        copiedHash ? "text-[var(--success)]" : "text-[var(--accent)]"
                      }`}
                    >
                      {copiedHash ? t("icon_check", "check") : t("icon_content_copy", "content_copy")}
                    </span>
                    <span>{copiedHash ? t("copied", "Copied") : t("btn_copy", "Copy")}</span>
                  </button>
                </div>
              )}

              {/* Primary Review Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <ActionButton
                  onClick={() => handleAction("approved")}
                  disabled={isProcessing || isApproveLocked}
                  variant={isApproveLocked ? "glass" : "success"}
                  icon={isApproveLocked ? t("icon_lock", "lock") : t("icon_verified", "verified")}
                  label={
                    isProcessing
                      ? t("btn_saving", "Saving...")
                      : isApproveLocked
                        ? t("lab_tooltip_approve_locked", "Approval Locked (Lab Test Required)")
                        : t("approve", "Approve & Bind")
                  }
                  className="flex-1 min-w-[200px] justify-center"
                />
                <ActionButton
                  onClick={() => handleAction("rejected")}
                  disabled={isProcessing}
                  variant="danger"
                  icon={t("icon_delete", "delete")}
                  label={t("btn_reject", "Reject")}
                  className=" justify-center"
                />
                <ActionButton
                  onClick={() => applyConsensusToForm(activeScout)}
                  disabled={isProcessing}
                  variant="glass"
                  icon={t("icon_auto_fix_high", "auto_fix_high")}
                  label={t("scout_btn_apply_consensus", "Apply Top Consensus")}
                  className="justify-center"
                />
              </div>
            </SidePanelHeroCard>

            {/* Step 1: Live Simulation Verification Gate at the top so the Architect sees why approval is unlocked/locked */}
            <LabVerificationGate
              dnaHash={activeScout.dna_hash}
              modName={
                editForm.name || activeScout.suggested_name || t("reviewing", "Scout Artifact")
              }
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

            {/* Step 2: Unified Metadata & Inline Consensus Form */}
            <UniversalGroup
              title={t("section_classification_creator", "Classification & {Mason}")}
              icon={t("icon_info", "info")}
            >
              {/* {Mod} Name + Inline Consensus */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                    {t("label_modname", "{Mod} Name")}
                  </label>
                  {renderFieldConsensusBadge(activeScout.consensus_fields?.name)}
                </div>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder={t("label_modname", "{Mod} Name")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                />
                {renderFieldCandidateChips(
                  activeScout.consensus_fields?.name,
                  editForm.name,
                  (c) => setEditForm((prev) => ({ ...prev, name: c.display })),
                  { alwaysShowIfSingleDiffers: true }
                )}
              </div>

              {/* {Mason} + Inline Consensus */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                    {t("mason", "{Mason}")}
                  </label>
                  {renderFieldConsensusBadge(activeScout.consensus_fields?.author)}
                </div>
                <div className="flex items-center gap-2 relative">
                  <div className="flex-1 min-w-0">
                    <CustomMasonDropdown
                      value={editForm.mason_id}
                      options={masonsList}
                      onChange={(id: string) => setEditForm({ ...editForm, mason_id: id })}
                    />
                  </div>
                  <ActionButton
                    onClick={() => {
                      if (!newMasonName && activeScout.suggested_author) {
                        setNewMasonName(activeScout.suggested_author);
                      }
                      setIsMasonPanelOpen(true);
                    }}
                    variant="glass"
                    icon={t("icon_person_add", "person_add")}
                    label={t("create_title", "New {Mason}")}
                    iconOnly={true}
                    className="!h-11 !w-11 !px-0 rounded-xl shrink-0"
                  />
                </div>
                {renderFieldCandidateChips(
                  activeScout.consensus_fields?.author,
                  masonsList.find((m: any) => m.id === editForm.mason_id)?.name || "",
                  (c) => {
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
                  { alwaysShowIfSingleDiffers: true }
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category + Inline Consensus */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                      {t("category", "Category")}
                    </label>
                    {renderFieldConsensusBadge(activeScout.consensus_fields?.type)}
                  </div>
                  <CustomClassificationDropdown
                    value={editForm.category_override}
                    onChange={(newType: string) =>
                      setEditForm({ ...editForm, category_override: newType })
                    }
                  />
                  {renderFieldCandidateChips(
                    activeScout.consensus_fields?.type,
                    editForm.category_override,
                    (c) => setEditForm((prev) => ({ ...prev, category_override: c.display })),
                    { alwaysShowIfSingleDiffers: true }
                  )}
                </div>

                {/* File Extension */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                      {t("label_file_ext", "File Extension")}
                    </label>
                  </div>
                  <input
                    value={editForm.file_extension}
                    onChange={(e) => setEditForm({ ...editForm, file_extension: e.target.value })}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                    placeholder={t("ph_file_ext", ".package")}
                  />
                </div>

                {/* Subcategory + Inline Consensus */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                      {t("registry_col_subcat", "Subcategory")}
                    </label>
                    {renderFieldConsensusBadge(activeScout.consensus_fields?.sub_type)}
                  </div>
                  <input
                    value={editForm.sub_type}
                    onChange={(e) => setEditForm({ ...editForm, sub_type: e.target.value })}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                    placeholder={t("auto_e_g_tuning_26", "e.g. Tuning")}
                  />
                  {renderFieldCandidateChips(
                    activeScout.consensus_fields?.sub_type,
                    editForm.sub_type || editForm.file_extension,
                    (c) => {
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
                    { alwaysShowIfSingleDiffers: true }
                  )}
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("section_compliance_compatibility", "Compliance & Compatibility")}
              icon={t("icon_verified", "verified")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                      {t("compliance_tier", "Compliance Tier")}
                    </label>
                    {renderFieldConsensusBadge(activeScout.consensus_fields?.compliance_tier)}
                  </div>
                  <CustomComplianceDropdown
                    value={editForm.compliance_tier || 0}
                    onChange={(val: number) => setEditForm({ ...editForm, compliance_tier: val })}
                    maxTier={4}
                  />
                  {renderFieldCandidateChips(
                    activeScout.consensus_fields?.compliance_tier,
                    `${t("stat_tier", "Tier")} ${editForm.compliance_tier ?? 0}`,
                    (c) =>
                      setEditForm((prev) => ({
                        ...prev,
                        compliance_tier: Number(c.rawValue ?? 0),
                      }))
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                      {t("registry_label_version", "Version")}
                    </label>
                    {renderFieldConsensusBadge(activeScout.consensus_fields?.version)}
                  </div>
                  <input
                    value={editForm.latest_version}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        latest_version: e.target.value,
                        hash_version: e.target.value,
                      })
                    }
                    placeholder={t("ph_mod_version", "1.0.0")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--accent)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                  {renderFieldCandidateChips(
                    activeScout.consensus_fields?.version,
                    editForm.latest_version || editForm.hash_version,
                    (c) =>
                      setEditForm((prev) => ({
                        ...prev,
                        latest_version: c.display,
                        hash_version: c.display,
                      })),
                    { alwaysShowIfSingleDiffers: true }
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                    {t("game_versions", "Compatible Game Versions")}
                  </label>
                  {renderFieldConsensusBadge(activeScout.consensus_fields?.game_versions)}
                </div>
                <GameVersionMultiSelect
                  selectedVersions={editForm.compatible_versions || []}
                  onChange={(v: string[]) => setEditForm({ ...editForm, compatible_versions: v })}
                />
                {renderFieldCandidateChips(
                  activeScout.consensus_fields?.game_versions,
                  (editForm.compatible_versions || []).slice().sort().join(", "),
                  (c) =>
                    setEditForm((prev) => ({
                      ...prev,
                      compatible_versions: Array.isArray(c.rawValue) ? c.rawValue : [],
                    }))
                )}
              </div>
            </UniversalGroup>

            <UniversalGroup title={t("resources", "Resources")} icon={t("icon_link", "link")}>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                    {t("ui_url", "Source URL")}
                  </label>
                  {renderFieldConsensusBadge(activeScout.consensus_fields?.url)}
                </div>
                <input
                  value={editForm.url || ""}
                  onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  placeholder={t("auto_https", "https://...")}
                />
                {renderFieldCandidateChips(
                  activeScout.consensus_fields?.url,
                  editForm.url,
                  (c) => setEditForm((prev) => ({ ...prev, url: c.display })),
                  { isCode: true, alwaysShowIfSingleDiffers: true }
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                    {t("cc_cover_url", "Cover Image URL")}
                  </label>
                  {renderFieldConsensusBadge(activeScout.consensus_fields?.image_url)}
                </div>
                <input
                  value={editForm.image_url || ""}
                  onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  placeholder={t("auto_https", "https://...")}
                />
                {renderFieldCandidateChips(
                  activeScout.consensus_fields?.image_url,
                  editForm.image_url,
                  (c) => setEditForm((prev) => ({ ...prev, image_url: c.display })),
                  { isCode: true, alwaysShowIfSingleDiffers: true }
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                    {t("upload_desc", "Description")}
                  </label>
                  {renderFieldConsensusBadge(activeScout.consensus_fields?.description)}
                </div>
                <textarea
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold min-h-[96px] resize-y border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all custom-scrollbar"
                />
                {renderFieldCandidateChips(
                  activeScout.consensus_fields?.description,
                  editForm.description,
                  (c) => setEditForm((prev) => ({ ...prev, description: c.display })),
                  { alwaysShowIfSingleDiffers: true }
                )}
              </div>
            </UniversalGroup>

            {/* Step 3: Optional Lineage Linker */}
            <UniversalGroup
              title={t("label_lineage", "{Mod} Lineage")}
              icon={t("icon_account_tree", "account_tree")}
            >
              <ModSearchDropdown
                modList={cloudModsList || []}
                onSelect={(m: any) => setLineageId(m.id)}
                selectedItem={cloudModsList?.find((m: any) => m.id === lineageId)}
                onClear={() => setLineageId("")}
                placeholder={t("ph_link_lineage", "Search to link with existing {Mod} Lineage...")}
              />
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-70 mt-1 px-1">
                {t(
                  "label_lineage_desc",
                  "Linking will append this signature to the existing {Mod} rather than creating a new one."
                )}
              </p>
            </UniversalGroup>

            {/* Step 4: Individual Citizen Submissions Inspector (No Nested Scroll Trap or Flex Crushing) */}
            {Array.isArray(activeScout.all_submissions) &&
              activeScout.all_submissions.length > 0 && (
                <UniversalGroup
                  title={t("scout_all_submissions_title", "All {Citizen} Submissions")}
                  count={activeScout.all_submissions.length}
                  icon={t("icon_list_alt", "list_alt")}
                  headerAction={
                    <button
                      type="button"
                      onClick={() => setShowRawSubmissions((prev) => !prev)}
                      className="px-3 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                        {showRawSubmissions
                          ? t("icon_expand_less", "expand_less")
                          : t("icon_expand_more", "expand_more")}
                      </span>
                      <span>
                        {showRawSubmissions ? t("btn_hide_reply", "Hide") : t("all", "All")}
                      </span>
                    </button>
                  }
                >
                  <div className="flex flex-col gap-2.5">
                    {(showRawSubmissions
                      ? activeScout.all_submissions
                      : activeScout.all_submissions.slice(0, 2)
                    ).map((sub: any, idx: number) => (
                      <div
                        key={sub.id || idx}
                        className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5 shrink-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                                {t("icon_person", "person")}
                              </span>
                              <span>{`#${idx + 1}`}</span>
                            </span>
                            <span className="text-xs font-black text-[var(--text)] break-words">
                              {(sub.suggested_name || t("unknown", "Unknown")).replace(/_/g, " ")}
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
                                  compliance_tier: Number(
                                    sub.compliance_tier ?? prev.compliance_tier ?? 0
                                  ),
                                  compatible_versions: Array.isArray(sub.suggested_game_versions)
                                    ? sub.suggested_game_versions
                                    : prev.compatible_versions,
                                }));
                              }}
                              className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_download_done", "download_done")}
                              </span>
                              <span>{t("scout_btn_use_submission", "Load")}</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                              {t("icon_architecture", "architecture")}
                            </span>
                            <span>{sub.suggested_author || t("unknown", "Unknown")}</span>
                          </span>
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                              {t("icon_deployed_code", "deployed_code")}
                            </span>
                            <span>
                              {sub.suggested_type || t("oversight_na", "N/A")}
                              {sub.suggested_sub_type ? ` • ${sub.suggested_sub_type}` : ""}
                            </span>
                          </span>
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[11px] text-[var(--subtext)]">
                              {t("icon_history", "history")}
                            </span>
                            <span>{sub.suggested_version || t("oversight_na", "N/A")}</span>
                          </span>
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[11px] text-[var(--warning)]">
                              {t("icon_shield", "shield")}
                            </span>
                            <span>
                              {t("stat_tier", "Tier")} {Number(sub.compliance_tier ?? 0)}
                            </span>
                          </span>
                        </div>

                        {sub.description && (
                          <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0 break-words">
                            {sub.description}
                          </p>
                        )}
                      </div>
                    ))}

                    {!showRawSubmissions && activeScout.all_submissions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setShowRawSubmissions(true)}
                        className="w-full py-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        <span>
                          {`${t("all", "All")} (${activeScout.all_submissions.length})`}
                        </span>
                      </button>
                    )}
                  </div>
                </UniversalGroup>
              )}
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
              tooltip={t("create_mason_btn", "Create {Mason}")}
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
