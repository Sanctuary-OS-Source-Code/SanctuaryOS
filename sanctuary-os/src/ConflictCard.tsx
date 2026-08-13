import React from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { formatDisplayName , getFileLabel, isSupportedExtension} from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";

interface ConflictCardProps {
  conflict: any;
  tier: number;
  isSelected?: boolean; 
  isSelectedA?: boolean;
  isSelectedB?: boolean;
  onKeepA?: () => void;
  onKeepB?: () => void;
  onIgnore?: () => void;
  onClick?: () => void;
}

const extractType = (name: string) => {
  const upper = String(name).toUpperCase();
  const activeGameSchema = useStore.getState().activeGameSchema;
  if (activeGameSchema?.extensions?.labels) {
    for (const [ext, label] of Object.entries(activeGameSchema.extensions.labels)) {
      if (upper.includes(`[${label}]`) || upper.endsWith(ext.toUpperCase())) return label;
    }
  }
  return "PACKAGE";
};

const cleanModName = (name: string) => {
  let cleaned = formatDisplayName(String(name).split('/').pop()?.split('\\').pop() || name);
  const activeGameSchema = useStore.getState().activeGameSchema;
  if (activeGameSchema?.extensions?.labels) {
    for (const [ext, label] of Object.entries(activeGameSchema.extensions.labels)) {
      cleaned = cleaned.replace(new RegExp(`\\[${label}\\]`, 'i'), '').replace(new RegExp(ext.replace('.', '\\.'), 'i'), '');
    }
  }
  cleaned = cleaned.trim();
  return cleaned;
};

const ModNameWithBadge = ({ name }: { name: string }) => {
  const type = extractType(name);
  const cleanName = cleanModName(name);
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span className="text-sm font-black text-[var(--text)] truncate tracking-tight drop-shadow-md">
        {cleanName}
      </span>
      <div className="px-2 py-0.5 rounded-md border text-[8px] font-black tracking-widest shrink-0 bg-black/20 border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] shadow-inner">
        {type as any}
      </div>
    </div>
  );
};

function ConflictCardInner({ conflict, tier, isSelected, isSelectedA, isSelectedB, onKeepA, onKeepB, onClick, onIgnore }: ConflictCardProps) {
  const { t } = useLexicon();
  
  let label = "";
  
  if (tier === 4) {
    label = t("tier4_title")?.replace("dY>` ", "") || "FATAL CLASH";
  } else if (tier === 3) {
    label = t("tier3_title");
  } else if (tier === 2) {
    label = t("tier2_title");
  } else {
    label = t("tier1_title");
  }

  const tColor = tier === 4 ? 'text-[var(--danger)]' : tier === 3 ? 'text-[var(--warning)]' : tier === 2 ? 'text-[var(--accent)]' : 'text-white/50';
  const borderHover = tier === 4 ? 'hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : tier === 3 ? 'hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]' : tier === 2 ? 'hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]';
  const statusColor = tier === 4 ? 'var(--danger)' : tier === 3 ? 'var(--warning)' : tier === 2 ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 50%, transparent)';



  const titleNode = (
    <div className="flex items-center gap-2 w-full">
      <span className={`material-symbols-outlined !text-[14px] ${tColor}`}>
        {tier === 4 ? (t("icon_crisis_alert")) : tier === 3 ? (t("icon_tune")) : tier === 2 ? 'file_copy' : 'info'}
      </span>
      <span className={`text-[10px] font-black capitalize tracking-widest opacity-80 ${tColor}`}>
        {label}
      </span>
    </div>
  );

  const actionsNode = onIgnore && tier === 1 ? (
    <button
      onClick={(e) => { e.stopPropagation(); onIgnore?.(); }}
      className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] hover:text-white transition-colors opacity-0 group-hover:opacity-100 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[var(--danger)] px-2 py-1 rounded-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm"
    >
      {t("btn_ignore")}
    </button>
  ) : undefined;

  return (
    <div 
      onClick={(!onKeepA && !onKeepB) ? onClick : undefined}
      className={`glass-panel p-5 rounded-[var(--radius)] flex flex-col gap-4 group border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-xl ${borderHover} transition-all duration-500 overflow-hidden relative ${isSelected ? 'ring-2 ring-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]' : ''} ${(!onKeepA && !onKeepB) ? 'cursor-pointer' : ''}`}
    >


      {/* Header */}
      <div className="flex justify-start items-start z-10 relative">
        {titleNode}
        {actionsNode && (
          <div className="shrink-0 ml-4">
            {actionsNode}
          </div>
        )}
      </div>

      {/* A vs B Section */}
      <div className="flex flex-col gap-2 relative z-10 w-full mt-2">
        <div 
          onClick={onKeepA ? (e) => { e.stopPropagation(); onKeepA(); } : undefined}
          className={`flex flex-col relative group/moda transition-colors duration-500 ${onKeepA ? 'cursor-pointer p-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : ''} ${isSelectedA ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-xl p-2' : ''}`}
        >
          <div className="flex justify-start items-center mb-1">
            <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${tColor}`}>
              {t("enemy_a")}
            </span>
            {onKeepA && (
              <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all duration-500 shadow-inner group-hover/moda:border-[color-mix(in_srgb,var(--success)_60%,transparent)] group-hover/moda:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover/moda:text-[var(--success)] group-hover/moda:shadow-md ${isSelectedA ? 'border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-transparent bg-black/20'}`}>
                <span className={`material-symbols-outlined font-black transition-all duration-500 !text-[12px] ${isSelectedA ? 'scale-100' : 'scale-90 group-hover/moda:scale-110 group-hover/moda:drop-shadow-[0_0_8px_var(--success)]'}`}>check</span>
              </div>
            )}
          </div>
          <ModNameWithBadge name={conflict.modA} />
        </div>

        <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg)] absolute border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm text-[var(--subtext)]">
            <span className="text-[7px] font-black italic capitalize">{t("vs")}</span>
          </div>
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
        </div>

        <div 
          onClick={onKeepB ? (e) => { e.stopPropagation(); onKeepB(); } : undefined}
          className={`flex flex-col relative group/modb transition-colors duration-500 ${onKeepB ? 'cursor-pointer p-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : ''} ${isSelectedB ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-xl p-2' : ''}`}
        >
          <div className="flex justify-start items-center mb-1">
            <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${tColor}`}>
              {t("enemy_b")}
            </span>
            {onKeepB && (
              <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all duration-500 shadow-inner group-hover/modb:border-[color-mix(in_srgb,var(--success)_60%,transparent)] group-hover/modb:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover/modb:text-[var(--success)] group-hover/modb:shadow-md ${isSelectedB ? 'border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-transparent bg-black/20'}`}>
                <span className={`material-symbols-outlined font-black transition-all duration-500 !text-[12px] ${isSelectedB ? 'scale-100' : 'scale-90 group-hover/modb:scale-110 group-hover/modb:drop-shadow-[0_0_8px_var(--success)]'}`}>check</span>
              </div>
            )}
          </div>
          <ModNameWithBadge name={conflict.modB} />
        </div>
      </div>

      {conflict.is_ghost && (
        <div className="flex flex-col gap-1 relative z-10 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] mt-1">
          <div className={`flex items-center gap-2 opacity-80 ${tColor}`}>
            <span className="material-symbols-outlined !text-[14px]">{t("icon_policy")}</span>
            <span className="text-[9px] font-black capitalize tracking-widest">{t("logical_clash")}</span>
          </div>
          <span className={`text-[10px] font-medium opacity-80 pl-6 ${tColor}`}>{conflict.resolution_note}</span>
        </div>
      )}
    </div>
  );
}

const arePropsEqual = (prev: ConflictCardProps, next: ConflictCardProps) => {
  return (
    prev.conflict.mod_pair === next.conflict.mod_pair &&
    prev.tier === next.tier &&
    prev.isSelected === next.isSelected &&
    prev.isSelectedA === next.isSelectedA &&
    prev.isSelectedB === next.isSelectedB
  );
};

export default React.memo(ConflictCardInner, arePropsEqual);
