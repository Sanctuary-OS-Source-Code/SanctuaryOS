import React from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { formatDisplayName , getFileLabel, isSupportedExtension} from "./shared";

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
      <div className="px-2 py-0.5 rounded-md border text-[8px] font-black tracking-widest shrink-0 bg-black/20 border-white/10 text-[var(--subtext)] shadow-inner">
        {type as any}
      </div>
    </div>
  );
};

function ConflictCardInner({ conflict, tier, isSelected, isSelectedA, isSelectedB, onKeepA, onKeepB, onClick, onIgnore }: ConflictCardProps) {
  const { t } = useLexicon();
  
  let label = "";
  
  if (tier === 4) {
    label = t("tier4_title") || "Collision Severity 4"?.replace("dY>` ", "") || "FATAL CLASH";
  } else if (tier === 3) {
    label = t("tier3_title");
  } else if (tier === 2) {
    label = t("tier2_title");
  } else {
    label = t("tier1_title");
  }

  const tColor = tier === 4 ? 'text-[var(--danger)]' : tier === 3 ? 'text-[var(--warning)]' : tier === 2 ? 'text-[var(--accent)]' : 'text-white/50';
  const borderHover = tier === 4 ? 'hover:border-[var(--danger)]/30' : tier === 3 ? 'hover:border-[var(--warning)]/30' : tier === 2 ? 'hover:border-[var(--accent)]/30' : 'hover:border-white/10';

  const getGlowStyles = () => {
    const aColor = isSelectedA ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 
                   tier === 4 ? 'color-mix(in srgb, var(--danger) 15%, transparent)' : 
                   tier === 3 ? 'color-mix(in srgb, var(--warning) 15%, transparent)' : 
                   tier === 2 ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 
                   'color-mix(in srgb, white 5%, transparent)';
                   
    const bColor = isSelectedB ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 
                   tier === 4 ? 'color-mix(in srgb, var(--danger) 15%, transparent)' : 
                   tier === 3 ? 'color-mix(in srgb, var(--warning) 15%, transparent)' : 
                   tier === 2 ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 
                   'color-mix(in srgb, white 5%, transparent)';
                   
    return `radial-gradient(circle at 100% 0%, ${aColor} 0%, transparent 50%), radial-gradient(circle at 0% 100%, ${bColor} 0%, transparent 50%)`;
  };

  return (
    <div 
      onClick={(!onKeepA && !onKeepB) ? onClick : undefined}
      className={`theme-glass-panel p-5 rounded-[var(--radius)] flex flex-col gap-4 group border transition-all duration-500 relative overflow-hidden
        ${(!onKeepA && !onKeepB) ? `cursor-pointer hover:shadow-2xl hover:-translate-y-1 ${borderHover}` : `hover:shadow-2xl hover:-translate-y-1 ${borderHover}`}
        ${isSelected ? "border-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_15%,transparent)]" : "border-white/5"}
      `}
    >
      <div className="absolute inset-0 pointer-events-none transition-all duration-700 opacity-60 group-hover:opacity-100" style={{ background: getGlowStyles() }} />
      
      {isSelected && (
        <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent blur-xl pointer-events-none" />
      )}

      <div className="flex justify-between items-center z-10 relative">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined !text-[14px] ${tier === 4 ? 'text-[var(--danger)]' : tier === 3 ? 'text-[var(--warning)]' : tier === 2 ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'}`}>
            {tier === 4 ? (t("icon_crisis_alert") || 'crisis_alert') : tier === 3 ? (t("icon_tune") || 'tune') : tier === 2 ? 'file_copy' : 'info'}
          </span>
          <span className={`text-[10px] font-black uppercase tracking-widest opacity-80 ${tier === 4 ? 'text-[var(--danger)]' : tier === 3 ? 'text-[var(--warning)]' : tier === 2 ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'}`}>
            {label}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {onIgnore && tier === 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onIgnore?.(); }}
              className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-white transition-colors opacity-0 group-hover:opacity-100 bg-white/5 hover:bg-[var(--danger)] px-2 py-1 rounded-md border border-white/10 shadow-sm"
            >
              {t("btn_ignore")}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 relative z-10">
        <div 
          onClick={onKeepA ? (e) => { e.stopPropagation(); onKeepA(); } : undefined}
          className={`p-4 rounded-2xl border shadow-inner flex flex-col relative transition-colors duration-500 group/moda ${onKeepA ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:border-[var(--success)]/50' : ''} bg-black/10 dark:bg-white/5 border-white/10`}
        >
          <div className="flex justify-between items-start mb-1">
            <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-80 ${tColor}`}>
              <span className="material-symbols-outlined !text-[12px]">{t("icon_inventory_2")}</span> {t("enemy_a")}
            </span>
            {onKeepA && (
              <div className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-all duration-500 border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-transparent bg-black/20 shadow-inner group-hover/moda:border-[var(--success)]/60 group-hover/moda:bg-[var(--success)]/20 group-hover/moda:text-[var(--success)] group-hover/moda:shadow-[0_0_15px_color-mix(in_srgb,var(--success)_40%,transparent),inset_0_0_10px_color-mix(in_srgb,var(--success)_20%,transparent)]">
                <span className="material-symbols-outlined font-black transition-all duration-500 !text-[12px] scale-90 group-hover/moda:scale-110 group-hover/moda:drop-shadow-[0_0_8px_var(--success)]">check</span>
              </div>
            )}
          </div>
          <ModNameWithBadge name={conflict.modA} />
        </div>

        <div className="relative h-px w-full flex items-center justify-center z-20">
          <div className="w-7 h-7 rounded-full theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg flex items-center justify-center bg-[var(--bg)] absolute">
            <span className="text-[8px] font-black text-[var(--subtext)] italic uppercase">{t("vs")}</span>
          </div>
        </div>

        <div 
          onClick={onKeepB ? (e) => { e.stopPropagation(); onKeepB(); } : undefined}
          className={`p-4 rounded-2xl border shadow-inner flex flex-col relative transition-colors duration-500 group/modb ${onKeepB ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:border-[var(--success)]/50' : ''} bg-black/10 dark:bg-white/5 border-white/10`}
        >
          <div className="flex justify-between items-start mb-1">
            <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-80 ${tColor}`}>
              <span className="material-symbols-outlined !text-[12px]">{t("icon_error")}</span> {t("enemy_b")}
            </span>
            {onKeepB && (
              <div className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-all duration-500 border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-transparent bg-black/20 shadow-inner group-hover/modb:border-[var(--success)]/60 group-hover/modb:bg-[var(--success)]/20 group-hover/modb:text-[var(--success)] group-hover/modb:shadow-[0_0_15px_color-mix(in_srgb,var(--success)_40%,transparent),inset_0_0_10px_color-mix(in_srgb,var(--success)_20%,transparent)]">
                <span className="material-symbols-outlined font-black transition-all duration-500 !text-[12px] scale-90 group-hover/modb:scale-110 group-hover/modb:drop-shadow-[0_0_8px_var(--success)]">check</span>
              </div>
            )}
          </div>
          <ModNameWithBadge name={conflict.modB} />
        </div>
      </div>

      {conflict.is_ghost && (
        <div className="flex items-center gap-2 relative z-10 pt-1">
          <span className="material-symbols-outlined !text-[14px] text-[var(--warning)] opacity-80">{t("icon_policy")}</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--warning)] opacity-90">{t("logical_clash")}</span>
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
