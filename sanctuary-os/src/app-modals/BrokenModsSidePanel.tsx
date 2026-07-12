import { SidePanel } from "../shared";
import { useLexicon } from "../LexiconContext";

export function BrokenModsSidePanel({
  showBrokenModal,
  setShowBrokenModal,
  modList,
  playSets,
  activePlaySetIndex,
  toggleInActiveSet
}: any) {
  const { t } = useLexicon();

  return (
    <SidePanel
      isOpen={showBrokenModal}
      onClose={() => setShowBrokenModal(false)}
      backdropZ="z-[99998]"
      panelZ="z-[99999]"
      title={`${t("status_broken")} ${t("status_broken_detected")}`}
      subtitle={t("broken_modal_desc")}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4">
        {modList.filter((m: any) => {
          const isInActive = playSets[activePlaySetIndex]?.mods.includes(m.name);
          if (!isInActive) return false;
          const isBroken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken' && m.compliance_tier !== 1 && m.compliance_tier !== 2;
          const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH";
          return isBroken || isMismatch;
        }).map((m: any) => {
          const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH";
          return (
            <div key={m.hash} className="flex items-center justify-between p-4 theme-glass-inner rounded-xl border border-white/5 hover:border-amber-500/50 transition-all group gap-4">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-black text-[var(--text)] truncate group-hover:text-amber-500 transition-colors">
                  {m.name.split(/[/\\]/).pop()}
                </span>
                <span className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest">
                  {isMismatch ? (t("modal_version_mismatch")) : (t("modal_severely_broken"))}
                </span>
              </div>
              <button 
                onClick={() => toggleInActiveSet && toggleInActiveSet(m.name)} 
                className="shrink-0 px-5 py-2.5 theme-bg-danger text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-lg transition-all hover:scale-105 shadow-[0_0_15px_rgba(var(--danger-rgb),0.4)]"
              >
                {t("status_remove")}
              </button>
            </div>
          );
        })}
        {modList.filter((m: any) => {
          const isInActive = playSets[activePlaySetIndex]?.mods.includes(m.name);
          if (!isInActive) return false;
          const isBroken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken' && m.compliance_tier !== 1 && m.compliance_tier !== 2;
          const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH";
          return isBroken || isMismatch;
        }).length === 0 && (
          <div className="text-[var(--subtext)] text-center opacity-50 p-6 italic font-bold text-xs uppercase tracking-widest bg-black/10 rounded-xl border border-white/5">
            {t("broken_modal_empty")}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
