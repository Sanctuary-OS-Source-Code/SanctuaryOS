import React, { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";

export function ArtifactCard({ mod, activeModId, onClick, masonsList, overrideActionLabel, onRemove, layout = "vertical" }: { mod: any, activeModId?: string, onClick: () => void, masonsList?: any[], overrideActionLabel?: string, onRemove?: (e: React.MouseEvent) => void, layout?: "vertical" | "horizontal" }) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const masonName = masonsList?.find((m: any) => m.id === mod.mason_id)?.name || mod.master_author || mod.suggested_author || "";
  const cleanStatus = (mod.status || "unverified").replace(/_/g, ' ').replace(/[^\w\s-]/gi, '').trim();

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
      className={`w-8 h-8 rounded-[var(--radius)] bg-black/50 backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-white/70 hover:text-white transition-all shadow-lg shadow-black/20 ${confirmDelete ? 'bg-[color-mix(in_srgb,var(--danger)_40%,transparent)] backdrop-blur-md border-[color-mix(in_srgb,var(--danger)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_50%,transparent)] scale-110 text-white shadow-md' : 'hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-md'}`}
    >
      <span className="material-symbols-outlined !text-[16px]">{confirmDelete ? (t("icon_warning_amber")) : (t("icon_close"))}</span>
    </button>
  ) : undefined;

  const statusBadgeColor = (() => {
    if (cleanStatus === 'stable') return 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_20%,transparent)]';
    if (cleanStatus === 'unstable') return 'bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]';
    if (cleanStatus === 'broken' || cleanStatus === 'corrupted' || cleanStatus === 'danger') return 'bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]';
    if (cleanStatus === 'under review') return 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-cyan-400 border-[color-mix(in_srgb,var(--accent)_20%,transparent)]';
    if (cleanStatus === 'pending') return 'bg-sky-500/20 text-sky-400 border-sky-500/20';
    if (cleanStatus === 'early access') return 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-purple-400 border-[color-mix(in_srgb,var(--accent)_20%,transparent)]';
    if (cleanStatus === 'paid') return 'bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-amber-400 border-[color-mix(in_srgb,var(--warning)_20%,transparent)]';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/20';
  })();

  const imageOverlay = layout === 'vertical' ? (
    <>
      {cleanStatus && (
        <div className={`absolute top-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg capitalize tracking-widest shadow-lg z-20 border ${statusBadgeColor}`}>
          {cleanStatus}
        </div>
      )}
      {mod?.file_extension && (
        <div className="absolute bottom-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg capitalize tracking-widest shadow-lg z-20 border bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] drop-shadow-md">
          {mod.file_extension.replace(/^\./, '')}
        </div>
      )}
    </>
  ) : undefined;

  const horizontalBadges = layout === 'horizontal' ? (
    <>
      {cleanStatus && (
        <div className={`text-[8px] font-black px-1.5 py-0.5 backdrop-blur-md rounded-md capitalize tracking-widest border shrink-0 ${statusBadgeColor}`}>
          {cleanStatus}
        </div>
      )}
      <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate font-mono">
        {mod?.category_override || mod?.suggested_type || t("vlocal")}
      </span>
      {mod?.file_extension && (
        <div className="text-[8px] font-black px-1.5 py-0.5 backdrop-blur-md rounded-md capitalize tracking-widest border shrink-0 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] ml-2">
          {mod.file_extension.replace(/^\./, '')}
        </div>
      )}
    </>
  ) : undefined;

  const footer = layout === 'vertical' ? (
    <div className="flex gap-2 items-center justify-start group">
      <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest flex items-center gap-1.5 truncate pr-2">
        {mod?.category_override || mod?.suggested_type || t("vlocal")}
      </span>
      <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
        {overrideActionLabel || t("emote_edit")} <span className="text-lg leading-none">&rarr;</span>
      </button>
    </div>
  ) : undefined;

  return (
    <UniversalCard
      layout={layout}
      isActive={activeModId === mod.id}
      onClick={onClick}
      title={mod?.name || t("unnamed_artifact")}
      image={showImages && mod.image_url ? mod.image_url : undefined}
      icon={t("icon_deployed_code")}
      imageOverlay={imageOverlay}
      actions={removeAction}
      badges={horizontalBadges}
      footer={footer}
    />
  );
}

export function VaultCard({ setItem, activeSetId, onClick, masonsList, masonNameFallback }: { setItem: any, activeSetId?: string, onClick: () => void, masonsList?: any[], masonNameFallback?: string }) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const masonName = masonsList?.find((m: any) => m.id === setItem.mason_id)?.name || setItem.creator_name || masonNameFallback || t("mason");

  const imageOverlay = (
    <div className="absolute top-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg capitalize tracking-widest shadow-lg z-20 border bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-amber-400 border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
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
      title={setItem.name || "UNNAMED COLLECTION"}
      subtitle={setItem.id}
      image={showImages && setItem.image_url ? setItem.image_url : undefined}
      icon={t("icon_collections_bookmark")}
      imageOverlay={imageOverlay}
      footer={footer}
    />
  );
}
