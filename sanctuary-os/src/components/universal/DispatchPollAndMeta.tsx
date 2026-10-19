import React, { useState, useEffect, useMemo } from "react";
import { supabase, supabaseAuth } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { renderTextWithIcons, HoverTooltip, StatBox } from "../../shared";

let cachedHubCommunities: string[] | null = null;
let isFetchingHubCommunities = false;

export interface DispatchPollOption {
  id: string;
  label: string;
}

export interface DispatchPollData {
  id: string;
  question: string;
  allow_multiple: boolean;
  options: DispatchPollOption[];
}

export function formatDispatchCategory(cat: string | undefined, t?: (key: string, fallback?: string) => string): string {
  if (!cat) return t ? t("comms_btn_update", "Update") : "Update";
  const trimmed = cat.trim();
  if (trimmed.toLowerCase() === "info" || trimmed.toLowerCase() === "information") {
    return t ? t("category_info", "Information") : "Information";
  }
  return trimmed;
}

export function extractDispatchMetadata(post: any, rawContentInput?: string) {
  let content = rawContentInput !== undefined ? rawContentInput : (post?.message || post?.content || "");
  let parsedType = "";
  let parsedAudience = "";
  let parsedSeverity = "";
  let parsedActionRequired = "";

  // Strip leading [IMG:...] if present in rawContentInput
  let workingContent = content;
  let leadingImgTag = "";
  const imgMatch = workingContent.match(/^(\[IMG:.*?\]\s*)/);
  if (imgMatch) {
    leadingImgTag = imgMatch[1];
    workingContent = workingContent.substring(leadingImgTag.length);
  }

  // Detect legacy manual top metadata block before the first --- or blank section
  // Matches lines like: **Alert Type:** Malware Alert\
  const lines = workingContent.split(/\r?\n/);
  let metaLinesCount = 0;
  let foundMetaKey = false;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (foundMetaKey) {
        metaLinesCount = i + 1;
        continue;
      } else {
        break;
      }
    }
    if (/^---+$/.test(trimmed)) {
      if (foundMetaKey) {
        metaLinesCount = i + 1;
      }
      break;
    }

    const match = trimmed.match(/^\*\*(Alert Type|Dispatch Type|Dispatch Date|Impact|Audience|Severity|Action Required|Action Needed):\*\*\s*(.*?)\s*\\?$/i);
    if (match) {
      foundMetaKey = true;
      metaLinesCount = i + 1;
      const key = match[1].toLowerCase();
      const val = match[2].replace(/\\+$/, "").trim();
      if (key === "alert type" || key === "dispatch type" || key === "impact") {
        parsedType = val;
      } else if (key === "audience") {
        parsedAudience = val;
      } else if (key === "severity") {
        parsedSeverity = val;
      } else if (key === "action required" || key === "action needed") {
        parsedActionRequired = val;
      }
    } else {
      break;
    }
  }

  let cleanBody = workingContent;
  if (foundMetaKey && metaLinesCount > 0) {
    cleanBody = lines.slice(metaLinesCount).join("\n").replace(/^\s*---+\s*/, "").trim();
  }

  const isPinned = post?.is_pinned === true || post?.is_pinned === "true";
  const isAlert = Boolean(post?.category?.toLowerCase().includes("alert") || parsedType?.toLowerCase().includes("alert") || isPinned);

  const isGenericCat = !post?.category || ["alert", "update", "dispatch"].includes(String(post.category).trim().toLowerCase());
  const rawType = (isGenericCat && parsedType) ? parsedType : (post?.category || parsedType || "Update");
  const finalType = rawType.trim().toLowerCase() === "info" ? "Information" : rawType;
  const rawAudience = post?.target_audience || parsedAudience || "All";
  const finalSeverity = isPinned
    ? "Urgent"
    : isAlert
      ? (parsedSeverity || "Standard Alert")
      : (parsedSeverity || "Advisory");
  const finalActionRequired = post?.action_required || parsedActionRequired || "";

  return {
    cleanContent: cleanBody,
    alertOrDispatchType: finalType,
    audience: rawAudience,
    severity: finalSeverity,
    actionRequired: finalActionRequired,
    isAlert,
    isUrgent: isPinned,
    hadLegacyBlock: foundMetaKey
  };
}

export function DispatchMetadataHeader({
  post,
  categoryOverride,
  audienceOverride,
  availableTargets,
  deliveryMethodOverride,
  isUrgentOverride,
  actionRequiredOverride
}: {
  post?: any;
  categoryOverride?: string;
  audienceOverride?: string[];
  availableTargets?: string[];
  deliveryMethodOverride?: "Dispatch" | "Alert";
  isUrgentOverride?: boolean;
  actionRequiredOverride?: string;
}) {
  const { t } = useLexicon();
  const currentView = useStore(state => state.view);
  const workspaces = useStore(state => state.workspaces);
  const [hubCommunities, setHubCommunities] = useState<string[]>(cachedHubCommunities || []);

  useEffect(() => {
    if (cachedHubCommunities) {
      setHubCommunities(cachedHubCommunities);
      return;
    }
    if (isFetchingHubCommunities) return;
    isFetchingHubCommunities = true;
    supabase
      .from("sanctuary_games")
      .select("name")
      .not("is_active", "eq", false)
      .then(({ data }) => {
        isFetchingHubCommunities = false;
        if (data && data.length > 0) {
          cachedHubCommunities = data.map((g: any) => g.name).filter(Boolean);
          setHubCommunities(cachedHubCommunities);
        }
      });
  }, []);

  const parsed = useMemo(() => extractDispatchMetadata(post), [post]);

  const isUrgent = isUrgentOverride !== undefined ? isUrgentOverride : parsed.isUrgent;
  const rawCategory = categoryOverride !== undefined ? categoryOverride : parsed.alertOrDispatchType;
  const category = formatDispatchCategory(rawCategory, t);
  const isAlert = deliveryMethodOverride !== undefined
    ? deliveryMethodOverride === "Alert"
    : (parsed.isAlert || Boolean(category?.toLowerCase().includes("alert")));

  const rawAudienceStr = audienceOverride !== undefined
    ? (audienceOverride.length > 0 ? audienceOverride.join(", ") : "All")
    : parsed.audience;

  const isHubBroadcast = useMemo(() => {
    if (post?._sourceTable === "keeper_system_broadcasts") return true;
    if (post && "author_id" in post && !("wayfinder_id" in post)) return true;
    if (currentView === "KeepersCore") return true;
    if (typeof rawAudienceStr === "string" && (rawAudienceStr.includes("Communities") || rawAudienceStr.includes("Keeper Core"))) return true;
    return false;
  }, [post, currentView, rawAudienceStr]);

  const allContextTargets = useMemo(() => {
    if (availableTargets && availableTargets.length > 0) {
      return availableTargets.filter(item => item !== "All" && item !== "All Communities" && item !== "All Citizens");
    }
    if (isHubBroadcast) {
      const workspaceNames = Object.values(workspaces || {})
        .filter((ws: any) => ws && ws.id !== "default_workspace" && ws.name)
        .map((ws: any) => ws.name);
      const gamesList = hubCommunities.length > 0 ? hubCommunities : workspaceNames;
      const combined = Array.from(new Set([...gamesList, t("dispatch_keeper_core", "Keeper Core")]));
      return combined.length > 0 ? combined : [t("dispatch_all_communities", "All Communities")];
    }
    return [
      t("role_citizens", "Citizens"),
      t("role_masons", "Masons"),
      t("role_architects", "Architects"),
      t("role_oversight", "Oversight"),
      t("role_wayfinders", "Wayfinders")
    ];
  }, [availableTargets, isHubBroadcast, workspaces, hubCommunities, t]);

  const { audienceDisplay, audienceTooltipTitle, audienceTooltipSubtitle } = useMemo(() => {
    const rawItems = (rawAudienceStr || "All")
      .split(",")
      .map((a: string) => {
        const trimmed = a.trim();
        if (trimmed === "Senior Architects") return t("role_oversight", "Oversight");
        return trimmed;
      })
      .filter(Boolean);

    const hasAllToken =
      rawItems.length === 0 ||
      rawItems.some((item: string) => item === "All" || item === "All Communities" || item === "All Citizens") ||
      (allContextTargets.length > 1 && rawItems.length >= allContextTargets.length && allContextTargets.every((target: string) => rawItems.includes(target)));

    if (hasAllToken) {
      const allLabel = isHubBroadcast
        ? t("dispatch_all_communities", "All Communities")
        : t("dispatch_all_citizens", "All Citizens");
      const hoverItems = allContextTargets.length > 0 ? allContextTargets : [allLabel];
      return {
        audienceDisplay: allLabel,
        audienceTooltipTitle: t("dispatch_tt_audience_all", "Included Broadcast Targets"),
        audienceTooltipSubtitle: hoverItems.map((item: string) => `• ${item}`).join("\n")
      };
    }

    const inlineText =
      rawItems.length <= 2
        ? rawItems.join(", ")
        : `${rawItems.slice(0, 2).join(", ")} +${rawItems.length - 2}`;

    return {
      audienceDisplay: inlineText,
      audienceTooltipTitle: t("dispatch_tt_audience_selected", "Selected Broadcast Targets"),
      audienceTooltipSubtitle: rawItems.map((item: string) => `• ${item}`).join("\n")
    };
  }, [rawAudienceStr, allContextTargets, isHubBroadcast, t]);

  const severityLabel = isUrgent
    ? t("dispatch_severity_urgent", "Urgent")
    : isAlert
      ? t("dispatch_severity_standard_alert", "Standard Alert")
      : t("dispatch_severity_advisory", "Advisory");

  const severityTooltipDesc = isUrgent
    ? t("dispatch_tt_sev_urgent", "Critical priority broadcast pinned across all targeted feeds.")
    : isAlert
      ? t("dispatch_tt_sev_alert", "Elevated priority notice highlighting important changes or issues.")
      : t("dispatch_tt_sev_advisory", "Standard informational priority with no immediate disruption.");

  const actionRequired = actionRequiredOverride !== undefined
    ? (actionRequiredOverride || t("dispatch_action_none", "No Action Required"))
    : (parsed.actionRequired || t("dispatch_action_none", "No Action Required"));

  const isNoAction = !actionRequired || actionRequired === "No Action Required" || actionRequired === t("dispatch_action_none", "No Action Required");
  const actionTooltipDesc = isNoAction
    ? t("dispatch_tt_action_none", "No action is required from recipients for this broadcast.")
    : actionRequired;

  const severityColorClass = isUrgent
    ? "text-[var(--danger)]"
    : isAlert
      ? "text-[var(--warning)]"
      : "text-[var(--accent)]";

  const typeLabel = isAlert
    ? t("dispatch_lbl_alert_type", "Alert Type")
    : t("dispatch_lbl_dispatch_type", "Dispatch Type");
  const typeValue = category || t("comms_btn_update", "Update");

  const typeTooltipDesc = useMemo(() => {
    const lower = typeValue.toLowerCase();
    if (lower === "info" || lower === "information") {
      return t("dispatch_tt_type_info", "General platform information, documentation, and ecosystem notices.");
    }
    if (lower === "update") {
      return t("dispatch_tt_type_update", "Official platform updates, feature deployments, and patch notes.");
    }
    if (lower === "event") {
      return t("dispatch_tt_type_event", "Scheduled community events, broadcasts, and coordinated activities.");
    }
    if (isAlert) {
      return t("dispatch_tt_type_alert_default", "Official system alert requiring community attention.");
    }
    return t("dispatch_tt_type_dispatch_default", "Official broadcast transmission from the operations team.");
  }, [typeValue, isAlert, t]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full my-4">
      <StatBox
        icon={t("icon_category", "category")}
        iconColorClass={severityColorClass}
        label={typeLabel}
        value={isUrgent ? <span className="text-[var(--danger)]">{typeValue}</span> : typeValue}
        tooltipTitle={typeValue}
        tooltipSubtitle={typeTooltipDesc}
        tooltipVariant={isUrgent ? "danger" : isAlert ? "warning" : "info"}
      />

      <StatBox
        icon={t("icon_groups", "groups")}
        iconColorClass="text-[var(--accent)]"
        label={t("dispatch_lbl_audience", "Audience")}
        value={audienceDisplay}
        tooltipTitle={audienceTooltipTitle}
        tooltipSubtitle={audienceTooltipSubtitle}
        tooltipVariant="accent"
      />

      <StatBox
        icon={t("icon_shield", "shield")}
        iconColorClass={severityColorClass}
        label={t("dispatch_lbl_severity", "Severity")}
        value={<span className={severityColorClass}>{severityLabel}</span>}
        tooltipTitle={severityLabel}
        tooltipSubtitle={severityTooltipDesc}
        tooltipVariant={isUrgent ? "danger" : isAlert ? "warning" : "accent"}
      />

      <StatBox
        icon={t("icon_bolt", "bolt")}
        iconColorClass={!isNoAction ? (isUrgent ? "text-[var(--danger)]" : "text-[var(--warning)]") : "text-[var(--accent)]"}
        label={t("dispatch_lbl_action_required", "Action Required")}
        value={actionRequired}
        tooltipTitle={t("dispatch_tt_action_title", "Recommended Recipient Action")}
        tooltipSubtitle={actionTooltipDesc}
        tooltipVariant={!isNoAction ? "warning" : "default"}
      />
    </div>
  );
}

export function DispatchPollBuilder({
  pollData,
  onChange
}: {
  pollData: DispatchPollData | null;
  onChange: (next: DispatchPollData | null) => void;
}) {
  const { t } = useLexicon();

  const handleEnablePoll = () => {
    onChange({
      id: crypto.randomUUID(),
      question: "",
      allow_multiple: false,
      options: [
        { id: crypto.randomUUID(), label: "" },
        { id: crypto.randomUUID(), label: "" }
      ]
    });
  };

  if (!pollData) {
    return (
      <div className="flex items-center justify-between p-4 rounded-2xl glass-surface border border-dashed border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)]">
            <span className="material-symbols-outlined !text-[18px]">{t("icon_poll", "poll")}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-widest uppercase text-[var(--text)]">
              {t("poll_section_title", "Community Poll")}
            </span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-70">
              {t("poll_desc_single_choice", "Single Choice • Click an option to vote")}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleEnablePoll}
          className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-all flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined !text-[15px]">{t("icon_add_circle", "add_circle")}</span>
          {t("poll_btn_add_poll", "Add Poll")}
        </button>
      </div>
    );
  }

  const updateQuestion = (question: string) => {
    onChange({ ...pollData, question });
  };

  const toggleMultiple = () => {
    onChange({ ...pollData, allow_multiple: !pollData.allow_multiple });
  };

  const updateOptionLabel = (idx: number, label: string) => {
    const nextOpts = pollData.options.map((o, i) => (i === idx ? { ...o, label } : o));
    onChange({ ...pollData, options: nextOpts });
  };

  const addOption = () => {
    if (pollData.options.length >= 10) return;
    onChange({
      ...pollData,
      options: [...pollData.options, { id: crypto.randomUUID(), label: "" }]
    });
  };

  const removeOption = (idx: number) => {
    if (pollData.options.length <= 2) return;
    onChange({
      ...pollData,
      options: pollData.options.filter((_, i) => i !== idx)
    });
  };

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">{t("icon_poll", "poll")}</span>
          <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
            {t("poll_section_title", "Community Poll")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMultiple}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 ${
              pollData.allow_multiple
                ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-[var(--text)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[14px]">
              {pollData.allow_multiple
                ? t("icon_check_box", "check_box")
                : t("icon_check_box_outline_blank", "check_box_outline_blank")}
            </span>
            {t("poll_lbl_allow_multiple", "Allow Multiple Selections")}
          </button>

          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-all flex items-center gap-1"
          >
            <span className="material-symbols-outlined !text-[14px]">{t("icon_delete", "delete")}</span>
            {t("poll_btn_remove_poll", "Remove Poll")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
          {t("poll_lbl_question", "Poll Question")}
        </label>
        <input
          value={pollData.question}
          onChange={(e) => updateQuestion(e.target.value)}
          placeholder={t("poll_ph_question", "Ask a question...")}
          className="w-full glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-4 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
          {t("poll_lbl_options", "Poll Options")}
        </label>
        {pollData.options.map((opt, idx) => (
          <div key={opt.id || idx} className="flex items-center gap-2">
            <span className="w-6 text-center text-[10px] font-mono font-black text-[var(--subtext)] opacity-60">
              {idx + 1}.
            </span>
            <input
              value={opt.label}
              onChange={(e) => updateOptionLabel(idx, e.target.value)}
              placeholder={`${t("poll_ph_option", "Option")} ${idx + 1}`}
              className="flex-1 glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-4 h-11 text-[var(--text)] text-xs font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all"
            />
            {pollData.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-colors"
              >
                <span className="material-symbols-outlined !text-[18px]">{t("icon_remove_circle", "remove_circle")}</span>
              </button>
            )}
          </div>
        ))}

        {pollData.options.length < 10 && (
          <button
            type="button"
            onClick={addOption}
            className="self-start mt-1 ml-6 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined !text-[14px]">{t("icon_add_circle", "add_circle")}</span>
            {t("poll_btn_add_option", "Add Option")}
          </button>
        )}
      </div>
    </div>
  );
}

export function DispatchPollViewer({ post, userId = null }: { post: any; userId?: string | null }) {
  const { t } = useLexicon();
  const pollData: DispatchPollData | null = useMemo(() => {
    if (!post?.poll_data) return null;
    if (typeof post.poll_data === "string") {
      try {
        return JSON.parse(post.poll_data);
      } catch {
        return null;
      }
    }
    return post.poll_data;
  }, [post?.poll_data]);

  const [votes, setVotes] = useState<any[]>([]);
  const [loadingVotes, setLoadingVotes] = useState(false);
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null);

  const isHubBroadcast = useMemo(() => {
    if (!post) return false;
    if (post._sourceTable === "keeper_system_broadcasts") return true;
    if ("author_id" in post) return true;
    if (useStore.getState().view === "KeepersCore") return true;
    return false;
  }, [post]);

  const votesTable = isHubBroadcast ? "keeper_dispatch_poll_votes" : "dispatch_poll_votes";

  const fetchVotes = async () => {
    if (!post?.id || !pollData) return;
    setLoadingVotes(true);
    try {
      const client = isHubBroadcast ? supabaseAuth : supabase;
      const { data, error } = await client
        .from(votesTable)
        .select("*")
        .eq("broadcast_id", post.id);
      if (!error && data) {
        setVotes(data);
      }
    } catch (e) {
      console.error("Failed to fetch poll votes:", e);
    }
    setLoadingVotes(false);
  };

  useEffect(() => {
    fetchVotes();
  }, [post?.id, isHubBroadcast]);

  if (!pollData || !pollData.question || !Array.isArray(pollData.options) || pollData.options.length === 0) {
    return null;
  }

  const pollId = pollData.id || "default";
  const pollVotes = votes.filter((v) => (v.poll_id || "default") === pollId);
  const myVotes = userId ? pollVotes.filter((v) => v.user_id === userId) : [];
  const myVotedOptionIds = new Set(myVotes.map((v) => v.option_id));
  const totalVotes = pollVotes.length;

  const handleToggleVote = async (optionId: string) => {
    const effectiveUserId = userId && userId !== "keeper" ? userId : useStore.getState().session?.user?.id || null;
    if (!effectiveUserId) {
      useStore.getState().pushStatus(t("poll_err_login_required", "Please sign in to vote in this poll."), "error");
      return;
    }

    setSubmittingOptionId(optionId);
    const sessionToken = useStore.getState().session?.access_token || "";
    const existingVoteForOption = pollVotes.find(
      (v) => v.user_id === effectiveUserId && v.option_id === optionId
    );

    try {
      if (existingVoteForOption) {
        // Remove this vote
        if (isHubBroadcast) {
          await supabaseAuth.from(votesTable).delete().eq("id", existingVoteForOption.id);
        } else {
          await supabase.rpc("secure_delete_cloud_file", {
            p_target: votesTable,
            p_id: existingVoteForOption.id,
            p_token: sessionToken
          });
        }
      } else {
        // If single choice, remove any existing votes by this user on this poll first
        if (!pollData.allow_multiple && myVotes.length > 0) {
          for (const oldVote of myVotes) {
            if (isHubBroadcast) {
              await supabaseAuth.from(votesTable).delete().eq("id", oldVote.id);
            } else {
              await supabase.rpc("secure_delete_cloud_file", {
                p_target: votesTable,
                p_id: oldVote.id,
                p_token: sessionToken
              });
            }
          }
        }

        const newVotePayload = {
          id: crypto.randomUUID(),
          broadcast_id: post.id,
          poll_id: pollId,
          option_id: optionId,
          user_id: effectiveUserId
        };

        if (isHubBroadcast) {
          await supabaseAuth.from(votesTable).insert(newVotePayload);
        } else {
          await supabase.rpc("secure_upsert_cloud_file", {
            p_target: votesTable,
            p_payload: newVotePayload,
            p_token: sessionToken
          });
        }
      }

      await fetchVotes();
    } catch (e: any) {
      console.error("Poll vote error:", e);
    }
    setSubmittingOptionId(null);
  };

  return (
    <div className="mt-8 p-6 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-xl relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center text-[var(--accent)] shadow-inner">
            <span className="material-symbols-outlined !text-[22px]">{t("icon_how_to_vote", "how_to_vote")}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
              {t("poll_section_title", "Community Poll")}
            </span>
            <h4 className="text-base font-black text-[var(--text)] tracking-tight">
              {renderTextWithIcons(pollData.question)}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {myVotedOptionIds.size > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] flex items-center gap-1">
              <span className="material-symbols-outlined !text-[12px]">{t("icon_task_alt", "task_alt")}</span>
              {t("poll_status_voted", "Voted")}
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            {totalVotes} {totalVotes === 1 ? t("poll_vote_singular", "vote") : t("poll_vote_plural", "votes")}
          </span>
        </div>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-4">
        {pollData.allow_multiple
          ? t("poll_desc_multi_choice", "Multiple Choice • Select one or more options")
          : t("poll_desc_single_choice", "Single Choice • Click an option to vote")}
      </p>

      <div className="flex flex-col gap-2.5">
        {pollData.options.map((opt) => {
          const optVotes = pollVotes.filter((v) => v.option_id === opt.id).length;
          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
          const isSelected = myVotedOptionIds.has(opt.id);
          const isBusy = submittingOptionId === opt.id;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={Boolean(submittingOptionId) || loadingVotes}
              onClick={() => handleToggleVote(opt.id)}
              className={`w-full relative overflow-hidden rounded-2xl p-3.5 text-left border transition-all duration-300 group ${
                isSelected
                  ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)]"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
              }`}
            >
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none ${
                  isSelected
                    ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                }`}
                style={{ width: `${pct}%` }}
              />

              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`material-symbols-outlined !text-[18px] transition-colors ${
                      isSelected ? "text-[var(--accent)]" : "text-[var(--subtext)] opacity-60 group-hover:opacity-100"
                    }`}
                  >
                    {isBusy
                      ? t("icon_sync", "sync")
                      : pollData.allow_multiple
                        ? isSelected
                          ? t("icon_check_box", "check_box")
                          : t("icon_check_box_outline_blank", "check_box_outline_blank")
                        : isSelected
                          ? t("icon_radio_button_checked", "radio_button_checked")
                          : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                  <span className={`text-xs font-bold tracking-wide truncate ${isSelected ? "text-[var(--text)] font-black" : "text-[var(--text)] opacity-90"}`}>
                    {renderTextWithIcons(opt.label)}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-80">
                    {optVotes} {optVotes === 1 ? t("poll_vote_singular", "vote") : t("poll_vote_plural", "votes")}
                  </span>
                  <span className={`text-xs font-mono font-black min-w-[38px] text-right ${isSelected ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                    {pct}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

