import React, { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";

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

  const rawStatus = String(mod?.status || "").toLowerCase().replace(/_/g, " ").replace(/[^\w\s-]/gi, "").trim();
  const versionCount = Array.isArray(mod?.mod_versions) ? mod.mod_versions.length : 0;
  const familyChildrenCount = typeof mod?._familyChildrenCount === "number" ? mod._familyChildrenCount : 0;
  const familyRole = mod?._familyRole as string | undefined;

  const roleBadgeLabel = familyRole
    ? familyRole === "core"
      ? t("studio_badge_core", "Core Mod")
      : familyRole === "twin"
        ? t("studio_badge_twin", "Twin")
        : familyRole === "flavor"
          ? t("studio_badge_flavor", "Flavor")
          : familyRole === "beta"
            ? t("studio_badge_beta", "Beta")
            : t("studio_badge_addon", "Addon")
    : null;

  const statusMeta = (() => {
    if (rawStatus === "corrupted" || rawStatus === "broken") {
      return {
        label: t("status_tag_corrupted", "Corrupted"),
        icon: "error",
        iconColor: "text-[var(--danger)]",
      };
    }
    if (rawStatus === "unstable") {
      return {
        label: t("status_tag_unstable", "Unstable"),
        icon: "warning",
        iconColor: "text-[var(--warning)]",
      };
    }
    if (rawStatus === "under review" || rawStatus === "pending") {
      return {
        label: t("status_tag_under_review", "Under Review"),
        icon: "schedule",
        iconColor: "text-[var(--accent)]",
      };
    }
    if (rawStatus === "synced" || mod?._isSyncedSandbox) {
      return {
        label: t("synced_badge", "Synced"),
        icon: "cloud_done",
        iconColor: "text-[var(--success)]",
      };
    }
    if (mod?._isLocalSandbox || rawStatus === "local") {
      return {
        label: t("studio_badge_sandbox", "Sandbox"),
        icon: "science",
        iconColor: "text-[var(--accent)]",
      };
    }
    return {
      label: t("status_tag_stable", "Stable"),
      icon: "verified",
      iconColor: "text-[var(--success)]",
    };
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
          ? "Script"
          : "Package";

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

  const chipClass =
    "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

  const cardBadges = (
    <>
      <div className={chipClass}>
        <span className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColor}`}>
          {statusMeta.icon}
        </span>
        <span>{statusMeta.label}</span>
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

      {versionCount > 1 && (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {t("icon_history", "history")}
          </span>
          <span>
            {versionCount} {t("badge_versions_count", "Versions")}
          </span>
        </div>
      )}

      {familyChildrenCount > 0 && (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {t("icon_account_tree", "account_tree")}
          </span>
          <span>
            +{familyChildrenCount} {t("badge_modules_count", "Modules")}
          </span>
        </div>
      )}

      {extClean && (
        <div className={chipClass}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
            {extClean === "ts4script" ? "terminal" : "deployed_code"}
          </span>
          <span className="text-[var(--subtext)]">{extClean}</span>
        </div>
      )}
    </>
  );

  const footer =
    layout === "vertical" ? (
      <div className="flex gap-2 items-center justify-between group">
        <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
          {categoryLabel}
        </span>
        <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
          {overrideActionLabel || t("emote_edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
        </button>
      </div>
    ) : undefined;

  return (
    <UniversalCard
      layout={layout}
      isActive={activeModId === mod.id}
      onClick={onClick}
      title={mod?.name || t("unnamed_artifact", "Unnamed Mod")}
      image={showImages && mod.image_url ? mod.image_url : undefined}
      icon={t("icon_deployed_code", "deployed_code")}
      actions={removeAction}
      badges={cardBadges}
      footer={footer}
    />
  );
}

export function VaultCard({ setItem, activeSetId, onClick, masonsList, masonNameFallback }: { setItem: any, activeSetId?: string, onClick: () => void, masonsList?: any[], masonNameFallback?: string }) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const masonName = masonsList?.find((m: any) => m.id === setItem.mason_id)?.name || setItem.creator_name || masonNameFallback || t("mason");

  const imageOverlay = (
    <div className="absolute top-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-xl capitalize tracking-widest shadow-lg z-20 border bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
      {t("stat_tier")} {setItem.compliance_tier || 0}
    </div>
  );

  const footer = (
    <div className="flex gap-2 items-center justify-start group">
      <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest flex items-center gap-1.5 truncate pr-2">
        {masonName}
      </span>
      <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
        {t("emote_edit")} <span className="text-lg leading-none">&rarr;</span>
      </button>
    </div>
  );

  return (
    <UniversalCard
      layout="vertical"
      isActive={activeSetId === setItem.id}
      onClick={onClick}
      title={setItem.name || t("unnamed_artifact")}
      subtitle={setItem.id}
      image={showImages && setItem.image_url ? setItem.image_url : undefined}
      icon={t("icon_collections_bookmark")}
      imageOverlay={imageOverlay}
      footer={footer}
    />
  );
}
