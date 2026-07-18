import React from "react";
import { SidePanel } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";

interface BlueprintSwapSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BlueprintSwapSidePanel({ 
  isOpen, 
  onClose
}: BlueprintSwapSidePanelProps) {
  const { t } = useLexicon();
  const { playSets, activePlaySetIndex, setActivePlaySetIndex } = useStore();

  const handleSelect = (index: number) => {
    setActivePlaySetIndex(index);
  };

  if (!isOpen) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("playsets_title")}
      subtitle={t("bp_available_blueprints")}
      widthClass="w-[550px]"
      icon={t("icon_map")}
    >
      <div className="flex flex-col gap-6 h-full pb-10 px-2">
        {!playSets || playSets.length === 0 ? (
          <div className="flex justify-center items-center h-32 theme-glass-inner rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-[0.2em] opacity-50 flex items-center gap-3">
              <span className="material-symbols-outlined !text-xl">{t("icon_scan_delete")}</span>
              {t("bp_no_blueprints_found")}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {playSets.map((bp, index) => {
              const isActive = activePlaySetIndex === index;
              return (
                <div 
                  key={bp.name}
                  onClick={() => handleSelect(index)}
                  className={`relative group cursor-pointer w-full rounded-[var(--radius)] overflow-hidden transition-all duration-500 border ${
                    isActive 
                      ? 'border-[var(--accent)] shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-[1.02]' 
                      : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-lg hover:shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_10%,transparent)] hover:scale-[1.02]'
                  }`}
                >
                  <div className={`absolute inset-0 rounded-[inherit] transition-opacity duration-500 ${isActive ? 'bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] opacity-100' : 'theme-glass-panel opacity-100 group-hover:opacity-0'}`} />
                  <div className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[var(--accent)] via-transparent to-transparent opacity-0 transition-opacity duration-500 ${isActive ? 'opacity-10' : 'group-hover:opacity-10'}`} />
                  
                  <div className="relative p-6 flex flex-col sm:flex-row items-center gap-6 z-10">
                    <div className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${
                      isActive 
                        ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] backdrop-blur-xl shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_30%,transparent)]' 
                        : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'
                    }`}>
                      <span className={`material-symbols-outlined !text-[32px] transition-colors duration-500 ${isActive ? 'theme-text-accent drop-shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_50%,transparent)]' : 'text-[var(--text)] opacity-50 group-hover:opacity-100 group-hover:theme-text-accent'}`}>
                        {t("icon_map")}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col min-w-0 w-full">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <h4 className={`text-xl font-black uppercase tracking-widest truncate transition-colors duration-500 ${isActive ? 'theme-text-accent drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_50%,transparent)]' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>
                          {bp.name}
                        </h4>
                        {isActive && (
                          <span className="px-4 py-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] backdrop-blur-xl theme-text-accent text-[9px] font-black uppercase tracking-[0.2em] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] animate-[pulse_2s_ease-in-out_infinite] shrink-0 flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[12px]">{t("icon_check")}</span>
                            {t("status_active")}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${isActive ? 'theme-text-accent opacity-80' : 'text-[var(--subtext)] opacity-50'}`}>
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_architecture")}</span>
                          {bp.mods?.length || 0} {t("items")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
