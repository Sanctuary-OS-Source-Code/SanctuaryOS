import { useLexicon } from "../LexiconContext";
import { ActionButton } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";

export const BlueprintRadarCard = ({ 
  playSet, 
  cache, 
  isActive, 
  isScanning, 
  onClick, 
  onSweep, 
  onView, 
  onTabNavigate 
}: { 
  playSet: any, 
  cache: any, 
  isActive: boolean, 
  isScanning: boolean, 
  onClick: () => void, 
  onSweep: () => void, 
  onView: () => void, 
  onTabNavigate: (tab: string) => void 
}) => {
  const { t } = useLexicon();
  const pkgCount = playSet.mods?.length || 0;

  const actionsNode = (
    <div onClick={(e) => e.stopPropagation()}>
      <ActionButton 
        label={isScanning ? t("radar_status_scanning") : t("btn_sweep_card")} 
        onClick={onSweep} 
        disabled={isScanning} 
        className="!px-4 !py-1.5 !text-[9px] !rounded-[calc(var(--radius)-4px)]" 
      />
    </div>
  );

  const customIcon = (
    <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'} opacity-70 group-hover:text-[var(--accent)] transition-colors ${isScanning ? 'animate-spin' : ''}`}>
      {isScanning ? 'autorenew' : 'account_tree'}
    </span>
  );

  const statsGrid = cache?.hasScanned ? (
    <div className="grid grid-cols-4 gap-2 mt-2 w-full">
      <div onClick={(e) => { e.stopPropagation(); onTabNavigate('fatal'); }} className="flex flex-col items-center p-2 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/50 hover:scale-105 transition-all cursor-pointer">
        <span className="text-red-500 font-black text-lg">{cache.fatal?.length || 0}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-red-500/70">{t("radar_label_fatal")}</span>
      </div>
      <div onClick={(e) => { e.stopPropagation(); onTabNavigate('tuning'); }} className="flex flex-col items-center p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/50 hover:scale-105 transition-all cursor-pointer">
        <span className="text-orange-500 font-black text-lg">{cache.tuning?.length || 0}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-orange-500/70">{t("radar_label_tuning")}</span>
      </div>
      <div onClick={(e) => { e.stopPropagation(); onTabNavigate('clones'); }} className="flex flex-col items-center p-2 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 hover:bg-fuchsia-500/20 hover:border-fuchsia-500/50 hover:scale-105 transition-all cursor-pointer">
        <span className="text-fuchsia-500 font-black text-lg">{cache.clones?.length || 0}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-fuchsia-500/70">{t("radar_label_clones")}</span>
      </div>
      <div onClick={(e) => { e.stopPropagation(); onTabNavigate('soft'); }} className="flex flex-col items-center p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:scale-105 transition-all cursor-pointer">
        <span className="text-indigo-500 font-black text-lg">{cache.soft?.length || 0}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-500/70">{t("radar_label_soft")}</span>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-center p-4 mt-2 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
      <span className="text-xs font-bold uppercase tracking-widest text-white/40">{t("radar_no_scan")}</span>
    </div>
  );

  const viewButton = cache?.hasScanned && (
    <div className="mt-2 w-full">
       <button 
         onClick={(e) => { e.stopPropagation(); onView(); }} 
         disabled={!cache?.hasScanned} 
         className={`w-full py-3 rounded-[var(--radius)] font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 ${
           isActive 
             ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/30' 
             : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)]'
         } disabled:opacity-50 disabled:cursor-not-allowed`}
       >
          {t("btn_access_telemetry")}
       </button>
    </div>
  );

  return (
    <UniversalCard
      layout="compact"
      isActive={isActive}
      onClick={onClick}
      title={playSet.name}
      subtitle={isScanning ? t("radar_status_scanning") : `${pkgCount} ${t("stat_artifacts")}`}
      customIcon={customIcon}
      actions={actionsNode}
      className="p-2"
    >
      {statsGrid}
      {viewButton}
    </UniversalCard>
  );
};
