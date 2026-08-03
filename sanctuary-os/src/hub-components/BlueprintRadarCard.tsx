import { useLexicon } from "../LexiconContext";
import { ActionButton } from "../shared";

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

  return (
    <div 
      onClick={onClick} 
      className={`theme-glass-panel border rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden group transition-all duration-300 cursor-pointer ${
        isActive 
          ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_30%,transparent)] ring-2 ring-[var(--accent)] scale-[1.02]' 
          : 'border-white/5 hover:border-[var(--accent)]/30 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
            isActive 
              ? 'bg-[var(--accent)]/20 border-[var(--accent)]/40 text-[var(--accent)]' 
              : 'bg-[var(--accent)]/10 border-[var(--accent)]/20 text-[var(--accent)]'
          }`}>
            <span className={`material-symbols-outlined text-xl ${isScanning ? 'animate-spin' : ''}`}>
              {isScanning ? 'autorenew' : 'account_tree'}
            </span>
          </div>
          <div>
            <h3 className={`font-black tracking-widest uppercase text-sm ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
              {playSet.name}
            </h3>
            <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
               {isScanning ? t("radar_status_scanning") : `${pkgCount} ${t("stat_artifacts")}`}
            </p>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <ActionButton 
            label={isScanning ? t("radar_status_scanning") : t("btn_sweep_card")} 
            onClick={onSweep} 
            disabled={isScanning} 
            className="!px-6 !py-2 !text-[9px] !rounded-[calc(var(--radius)-4px)]" 
          />
        </div>
      </div>

      {cache?.hasScanned ? (
        <div className="grid grid-cols-4 gap-2 z-10 relative mt-2">
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
        <div className="flex items-center justify-center p-4 mt-2 rounded-lg bg-white/5 border border-white/5 z-10 relative">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">{t("radar_no_scan")}</span>
        </div>
      )}

      {cache?.hasScanned && (
        <div className="mt-2 z-10 relative">
           <button 
             onClick={(e) => { e.stopPropagation(); onView(); }} 
             disabled={!cache?.hasScanned} 
             className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 ${
               isActive 
                 ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/30' 
                 : 'bg-black/20 text-[var(--subtext)] hover:text-white hover:bg-white/5 border border-white/5'
             } disabled:opacity-50 disabled:cursor-not-allowed`}
           >
              {t("btn_access_telemetry")}
           </button>
        </div>
      )}
    </div>
  );
};
