import React, { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";
import { DynamicArtifactPreviewBanner } from "./chameleon-components/ThemeCard";

export const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export function ArtifactCard({
  mod,
  activeModId,
  onClick,
  masonsList,
  overrideActionLabel,
  onRemove,
  layout = "vertical",
}: {
  mod: any;
  activeModId?: string;
  onClick: () => void;
  masonsList?: any[];
  overrideActionLabel?: string;
  onRemove?: (e: React.MouseEvent) => void;
  layout?: "vertical" | "horizontal";
}) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rawStatus = String(mod?.status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^\w\s-]/gi, "")
    .trim();
  const versionCount = Array.isArray(mod?.mod_versions) ? mod.mod_versions.length : 0;
  const familyChildrenCount =
    typeof mod?._familyChildrenCount === "number" ? mod._familyChildrenCount : 0;
  const familyRole = mod?._familyRole as string | undefined;

  const authorName =
    masonsList?.find(
      (m: any) => m.id === mod?.mason_id || m.id === mod?.suggested_mason_id
    )?.name ||
    mod?.master_author ||
    mod?.author ||
    mod?.suggested_author ||
    t("unknown_mason", "Unknown {Mason}");

  const roleBadgeLabel = familyRole
    ? familyRole === "core"
      ? t("core_artifact", "Core {Mod}")
      : familyRole === "twin"
        ? t("editor_twin", "Twin")
        : familyRole === "flavor"
          ? t("studio_badge_flavor", "Flavor")
          : familyRole === "beta"
            ? t("badge_beta", "Beta")
            : t("editor_addon", "Addon")
    : null;

  const openTickets = Array.isArray(mod?._openTickets) ? mod._openTickets : [];
  const isModFlagged =
    rawStatus === "corrupted" ||
    rawStatus === "broken" ||
    rawStatus === "rejected" ||
    rawStatus === "unstable" ||
    rawStatus === "under review" ||
    rawStatus === "under_review" ||
    openTickets.length > 0;

  const statusMeta = (() => {
    if (rawStatus === "corrupted" || rawStatus === "broken") {
      return {
        label: t("status_corrupted", "Corrupted"),
        icon: t("icon_error", "error"),
        iconColor: "text-[var(--danger)]",
      };
    }
    if (rawStatus === "rejected") {
      return {
        label: t("rejected", "Rejected"),
        icon: t("icon_block", "block"),
        iconColor: "text-[var(--danger)]",
      };
    }
    if (rawStatus === "unstable") {
      return {
        label: t("label_unstable", "Unstable"),
        icon: t("icon_warning", "warning"),
        iconColor: "text-[var(--warning)]",
      };
    }
    if (rawStatus === "under review" || rawStatus === "under_review" || rawStatus === "pending") {
      return {
        label: t("status_dd_review", "Under Review"),
        icon: t("icon_schedule", "schedule"),
        iconColor: "text-[var(--accent)]",
      };
    }
    if (openTickets.length > 0) {
      return {
        label: t("flagged", "Flagged"),
        icon: t("icon_flag", "flag"),
        iconColor: "text-[var(--danger)]",
      };
    }
    if (rawStatus === "unverified" || rawStatus === "unknown") {
      return {
        label: t("unverified", "Unverified"),
        icon: t("icon_help", "help"),
        iconColor: "text-[var(--subtext)]",
      };
    }
    if (rawStatus === "synced" || mod?._isSyncedSandbox) {
      return {
        label: t("synced_badge", "Synced"),
        icon: t("icon_cloud_done", "cloud_done"),
        iconColor: "text-[var(--success)]",
      };
    }
    if (mod?._isLocalSandbox || rawStatus === "local") {
      return {
        label: t("studio_badge_sandbox", "Sandbox"),
        icon: t("icon_science", "science"),
        iconColor: "text-[var(--accent)]",
      };
    }
    if (rawStatus === "verified" || rawStatus === "approved") {
      return {
        label: t("verified", "Verified"),
        icon: t("icon_verified", "verified"),
        iconColor: "text-[var(--success)]",
      };
    }
    return {
      label: t("status_stable", "Stable"),
      icon: t("icon_verified", "verified"),
      iconColor: "text-[var(--success)]",
    };
  })();

  const flagSummary = (() => {
    if (!isModFlagged) return "";
    if (openTickets.length > 0) {
      const first = openTickets[0];
      const text =
        first?.title ||
        first?.subject ||
        first?.description ||
        first?.content ||
        first?.steps ||
        "";
      if (text) return String(text).replace(/\s+\?\s+/g, " — ");
    }
    if (rawStatus === "corrupted" || rawStatus === "broken") {
      return t(
        "flag_res_mod_corrupted_short",
        "Marked Corrupted — crashes or critical game errors reported."
      );
    }
    if (rawStatus === "unstable") {
      return t(
        "flag_res_mod_unstable_short",
        "Marked Unstable — compatibility issues or glitches reported."
      );
    }
    if (rawStatus === "under review" || rawStatus === "under_review") {
      return t(
        "flag_res_mod_review_short",
        "Under Review — pending safety or compatibility verification."
      );
    }
    if (rawStatus === "rejected") {
      return t(
        "flag_res_mod_rejected_short",
        "Rejected — requires compliance or metadata fixes."
      );
    }
    return "";
  })();

  const extClean = mod?.file_extension
    ? String(mod.file_extension).replace(/^\./, "").toLowerCase()
    : "";
  const categoryLabel =
    mod?.category_override && String(mod.category_override).toLowerCase() !== "unknown"
      ? mod.category_override
      : mod?.suggested_type && String(mod.suggested_type).toLowerCase() !== "unknown"
        ? mod.suggested_type
        : extClean === "ts4script"
          ? t("type_script", "Script")
          : t("type_package", "Package");

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete && onRemove) {
      onRemove(e);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2000);
    }
  };

  const removeAction = onRemove ? (
    <button
      onClick={handleRemove}
      className={`w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] opacity-80 hover:opacity-100 transition-all ${
        confirmDelete
          ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]"
          : "hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-[var(--danger)]"
      }`}
    >
      <span className="material-symbols-outlined !text-[16px]">
        {confirmDelete ? t("icon_warning_amber", "warning") : t("icon_close", "close")}
      </span>
    </button>
  ) : undefined;

  const chipClass = VAULT_CHIP_CLASS;

  const statusChip = (
    <div className={chipClass}>
      <span className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColor}`}>
        {statusMeta.icon}
      </span>
      <span>{statusMeta.label}</span>
    </div>
  );

  const cardBadges = (
    <>
      {layout !== "vertical" && statusChip}

      <div className={chipClass}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
          {String(categoryLabel).toLowerCase().includes("script") || extClean === "ts4script"
            ? t("icon_terminal", "terminal")
            : t("icon_deployed_code", "deployed_code")}
        </span>
        <span>{categoryLabel}</span>
      </div>

      {roleBadgeLabel && (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {familyRole === "core"
              ? t("icon_account_tree", "account_tree")
              : t("icon_extension", "extension")}
          </span>
          <span>{roleBadgeLabel}</span>
        </div>
      )}

      {versionCount > 1 ? (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {t("icon_history", "history")}
          </span>
          <span>
            {versionCount} {t("badge_versions_count", "Versions")}
          </span>
        </div>
      ) : mod?.latest_version || mod?.suggested_version ? (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
            {t("icon_history", "history")}
          </span>
          <span>
            {String(mod.latest_version || mod.suggested_version).startsWith("v")
              ? mod.latest_version || mod.suggested_version
              : `${t("auto_v", "v")}${mod.latest_version || mod.suggested_version}`}
          </span>
        </div>
      ) : null}

      {extClean && String(categoryLabel).toLowerCase() !== extClean && (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
            {extClean === "ts4script"
              ? t("icon_terminal", "terminal")
              : t("icon_deployed_code", "deployed_code")}
          </span>
          <span className="text-[var(--subtext)]">{extClean}</span>
        </div>
      )}

      {typeof mod?.compliance_tier === "number" && mod.compliance_tier > 0 && (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
            {t("icon_shield", "shield")}
          </span>
          <span>
            {t("stat_tier", "Tier")} {mod.compliance_tier}
          </span>
        </div>
      )}
    </>
  );

  const footer =
    layout === "vertical" ? (
      <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
        {familyChildrenCount > 0 ? (
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)]">
            <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
              {t("icon_account_tree", "account_tree")}
            </span>
            <span>
              +{familyChildrenCount} {t("badge_modules_count", "Modules")}
            </span>
          </div>
        ) : mod?.dna_hash ? (
          <span className="flex items-center gap-1.5 font-mono truncate pr-2 opacity-75">
            <span className="material-symbols-outlined !text-[13px] text-[var(--subtext)]">
              {t("icon_fingerprint", "fingerprint")}
            </span>
            <span>{String(mod.dna_hash).slice(0, 8)}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 truncate pr-2 opacity-75">
            {mod?.updated_at || mod?.created_at ? (
              <>
                <span className="material-symbols-outlined !text-[13px] text-[var(--subtext)]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                <span>
                  {new Date(mod.updated_at || mod.created_at).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </>
            ) : (
              <span>{categoryLabel}</span>
            )}
          </span>
        )}
        <button
          className="text-[10px] font-black text-[var(--text)] opacity-85 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0"
        >
          {overrideActionLabel ||
            (isModFlagged
              ? t("flag_res_card_action", "Resolve & Resubmit")
              : t("edit", "Edit"))}{" "}
          <span className="text-base leading-none">&rarr;</span>
        </button>
      </div>
    ) : undefined;

  return (
    <UniversalCard
      layout={layout}
      isActive={activeModId === mod.id}
      onClick={onClick}
      title={mod?.name || t("unnamed_artifact", "Unnamed Mod")}
      subtitle={`${t("by_prefix", "By")} ${authorName}`}
      image={showImages && mod.image_url ? mod.image_url : undefined}
      icon={t("icon_deployed_code", "deployed_code")}
      customIcon={
        layout === "vertical" ? (
          <DynamicArtifactPreviewBanner
            data={mod}
            icon={t("icon_deployed_code", "deployed_code")}
            heightClass="h-full"
          />
        ) : undefined
      }
      imageOverlay={
        layout === "vertical" ? (
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            {statusChip}
          </div>
        ) : undefined
      }
      actions={removeAction}
      badges={cardBadges}
      footer={footer}
    >
      {layout === "vertical" && isModFlagged && flagSummary ? (
        <div className="rounded-xl px-3 py-2 glass-surface border border-[color-mix(in_srgb,var(--danger)_26%,transparent)] flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center shrink-0">
            <span
              className={`material-symbols-outlined !text-[13px] ${
                rawStatus === "unstable" || rawStatus === "under review" || rawStatus === "under_review"
                  ? "text-[var(--warning)]"
                  : "text-[var(--danger)]"
              }`}
            >
              {t("icon_flag", "flag")}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text)] opacity-90 leading-snug line-clamp-2">
            {flagSummary}
          </span>
        </div>
      ) : undefined}
    </UniversalCard>
  );
}

export function VaultCard({
  setItem,
  activeSetId,
  onClick,
  masonsList,
  masonNameFallback,
}: {
  setItem: any;
  activeSetId?: string;
  onClick: () => void;
  masonsList?: any[];
  masonNameFallback?: string;
}) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const masonName =
    masonsList?.find((m: any) => m.id === setItem.mason_id)?.name ||
    setItem.creator_name ||
    masonNameFallback ||
    t("mason", "{Mason}");

  const statusChip = (
    <div className={VAULT_CHIP_CLASS}>
      <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
        {t("icon_verified", "verified")}
      </span>
      <span>{t("verified", "Verified")}</span>
    </div>
  );

  const cardBadges = (
    <div className={VAULT_CHIP_CLASS}>
      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
        {t("icon_shield", "shield")}
      </span>
      <span>
        {t("stat_tier", "Tier")} {setItem.compliance_tier || 0}
      </span>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
      <span className="flex items-center gap-1.5 font-mono truncate pr-2 opacity-75">
        {String(setItem.id || "").slice(0, 8)}
      </span>
      <button className="text-[10px] font-black text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0">
        {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
      </button>
    </div>
  );

  return (
    <UniversalCard
      layout="vertical"
      isActive={activeSetId === setItem.id}
      onClick={onClick}
      title={setItem.name || t("unnamed_artifact", "Unnamed Mod")}
      subtitle={`${t("by_prefix", "By")} ${masonName}`}
      image={showImages && setItem.image_url ? setItem.image_url : undefined}
      icon={t("icon_collections_bookmark", "collections_bookmark")}
      customIcon={
        <DynamicArtifactPreviewBanner
          data={{ ...setItem, isCollection: true }}
          icon={t("icon_collections_bookmark", "collections_bookmark")}
          heightClass="h-full"
        />
      }
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          {statusChip}
        </div>
      }
      badges={cardBadges}
      footer={footer}
    />
  );
}
