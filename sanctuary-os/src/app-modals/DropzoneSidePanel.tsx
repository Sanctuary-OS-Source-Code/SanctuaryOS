import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
export function DropzoneSidePanel({
  isDropzoneOpen,
  isDragging,
  setIsDragging,
  dropzoneState,
  setIsDropzoneOpen,
  setDropzoneState,
  droppedFiles,
  setDroppedFiles,
  ingestProgress,
  handleDroppedFiles,
  runRadarSweep
}: any) {
  const { t } = useLexicon();

  return (
    <SidePanel
      isOpen={isDropzoneOpen || isDragging}
      onClose={() => { setIsDragging(false); if (dropzoneState !== 'ingesting') { setIsDropzoneOpen(false); setDropzoneState('awaiting'); setDroppedFiles([]); } }}
      backdropZ="z-[99998]"
      panelZ="z-[99999]"
      title={dropzoneState === "awaiting" ? t("awaiting_title") : t("secured_title")}
      subtitle={
        dropzoneState === "awaiting" ? 
          <>{t("awaiting_desc1")}<span className="text-[var(--text)]">{t("auto_package")}</span>{t("awaiting_desc2")}<span className="text-[var(--text)]">{t("auto_ts4script")}</span>{t("awaiting_desc3")}<span className="text-[var(--text)]">{t("auto_zip")}</span>{t("awaiting_desc4")}</>
          : 
          <>{droppedFiles.length > 0 ? `${t("_")}${droppedFiles.length}${t("secured_desc_suffix")}` : t("secured_desc_empty")}</>
      }
      icon={t("icon_cloud")}
      iconColorClass={dropzoneState === "received" ? "text-emerald-400 drop-shadow-md" : "theme-text-accent"}
      widthClass="w-[550px]"
      headerActions={
        dropzoneState === "received" ? (
          <PanelHeaderGroup>
            <PanelHeaderButton 
              onClick={() => { handleDroppedFiles(droppedFiles); }} 
              variant="accent" 
              icon="flight_takeoff" 
              tooltip={t("btn_import")} 
            />
          </PanelHeaderGroup>
        ) : null
      }
    >
      <div className="flex-1 flex flex-col h-full min-h-[400px]">
        {dropzoneState === "awaiting" ? (
          <div className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center pointer-events-none transition-all ${isDragging ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[inset_0_0_50px_rgba(37,99,235,0.2)]' : 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-black/10'}`}>
            <span className="material-symbols-outlined !text-[120px] opacity-20 drop-shadow-md mb-4 animate-bounce">{t("icon_cloud")}</span>
            <span className="text-xs font-black text-[var(--subtext)] capitalize tracking-widest opacity-50">{t("modal_drop_files")}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {droppedFiles.length > 0 && (
              <div className="w-full glass-surface rounded-2xl p-4 flex flex-col gap-2 shadow-inner border border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)]">
                {droppedFiles.map((f: any, i: number) => (
                  <div key={i} className="text-xs font-bold text-[var(--text)] py-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 truncate flex items-center gap-3">
                    <span className="text-emerald-400 material-symbols-outlined !text-sm">{t("icon_check_circle")}</span>
                    {f}
                  </div>
                ))}
              </div>
            )}
            {dropzoneState === "ingesting" && (
              <div className="w-full py-4 theme-bg-accent/20 text-[var(--text)] rounded-xl border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-lg flex flex-col items-center justify-center gap-1 backdrop-blur-md mt-4">
                <span className="text-sm font-black capitalize tracking-widest animate-pulse">{t("btn_importing")}</span>
                <span className="text-[9px] font-bold opacity-70 capitalize tracking-widest">{ingestProgress?.current || 0} / {ingestProgress?.total || 0} {t("modal_files")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
}


