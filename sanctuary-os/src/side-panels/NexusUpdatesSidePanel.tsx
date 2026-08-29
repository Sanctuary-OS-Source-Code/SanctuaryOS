import React from "react";
import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";

export function NexusUpdatesSidePanel() {
  const { t } = useLexicon();
  const { isNexusUpdatesPanelOpen, setIsNexusUpdatesPanelOpen, setNexusPreviewAsset } = useModalStore();
  const nexusAvailableUpdates = useStore((state) => state.nexusAvailableUpdates) || [];
  const setNexusUpdatesCount = useStore((state) => state.setNexusUpdatesCount);

  if (!isNexusUpdatesPanelOpen) return null;

  return (
    <SidePanel
      isOpen={isNexusUpdatesPanelOpen}
      onClose={() => setIsNexusUpdatesPanelOpen(false)}
      title={t("nexus_updates_title") || "Nexus Updates"}
      subtitle={t("nexus_updates_subtitle") || "Available updates for your installed Nexus assets."}
      icon="cloud_download"
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[550px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon="done_all"
            tooltip={t("dismiss_all") || "Dismiss All"}
            variant="default"
            onClick={() => {
              setNexusUpdatesCount(0);
              setIsNexusUpdatesPanelOpen(false);
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative">
        {nexusAvailableUpdates.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 h-full opacity-50 py-12">
            <span className="material-symbols-outlined !text-[48px] mb-4">check_circle</span>
            <span className="font-bold tracking-widest text-xs uppercase">{t("no_updates_available") || "All assets are up to date"}</span>
          </div>
        ) : (
          nexusAvailableUpdates.map((update, idx) => (
            <div
              key={`${update.id}-${idx}`}
              onClick={() => {
                setNexusPreviewAsset({ id: update.id, type: update.type });
              }}
              className={`cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out relative z-10 glass-panel rounded-2xl overflow-hidden group border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all`}
              style={{ animationDelay: `${idx * 150}ms` }}
            >
              {/* Animated Gradient Background */}
              <div className="absolute inset-0 bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_5%,transparent)] via-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="relative z-10 p-5 flex items-center justify-between gap-4">
                
                {/* Left Side: Icon & Details */}
                <div className="flex items-center gap-5">
                  {/* Icon Container */}
                  <div className="w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:scale-110 group-hover:shadow-[0_0_25px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all duration-500">
                    <span className="material-symbols-outlined !text-[28px] text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]">
                      {update.type === 'chameleon' ? 'palette' : update.type === 'lexicon' ? 'translate' : 'extension'}
                    </span>
                  </div>
                  
                  {/* Title & Version */}
                  <div className="flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-black text-xl tracking-tight text-white drop-shadow-sm leading-none">
                        {update.name}
                      </h3>
                      <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 border border-white/10 px-1.5 py-0.5 rounded-full leading-none">
                        {update.type}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] uppercase tracking-widest font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 line-through leading-none">
                        v{update.oldVersion}
                      </span>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--text)] opacity-40">arrow_forward</span>
                      <span className="text-[10px] uppercase tracking-widest font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.2)] leading-none">
                        v{update.newVersion}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Subtle Chevron */}
                <div className="shrink-0 flex items-center justify-center text-[var(--text)] opacity-30 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all duration-300 group-hover:translate-x-1">
                  <span className="material-symbols-outlined !text-[24px]">chevron_right</span>
                </div>

              </div>
            </div>
          ))
        )}
      </div>
    </SidePanel>
  );
}
