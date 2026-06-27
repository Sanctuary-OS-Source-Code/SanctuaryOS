import { useState, Fragment } from "react";
import { useLexicon } from "./LexiconContext";
import { formatDisplayName, SidePanel } from "./shared";

const extractType = (name: string) => {
  const upper = String(name).toUpperCase();
  if (upper.includes("[PACKAGE]") || upper.endsWith(".PACKAGE")) return "PACKAGE";
  if (upper.includes("[SCRIPT]") || upper.endsWith(".TS4SCRIPT")) return "SCRIPT";
  return "PACKAGE";
};

const cleanModName = (name: string) => {
  let cleaned = formatDisplayName(String(name).split('/').pop()?.split('\\').pop() || name);
  cleaned = cleaned.replace(/\[PACKAGE\]/i, "").replace(/\[SCRIPT\]/i, "").replace(/\.PACKAGE/i, "").replace(/\.TS4SCRIPT/i, "").trim();
  return cleaned;
};

const ModNameWithBadge = ({ name }: { name: string }) => {
  const type = extractType(name);
  const cleanName = cleanModName(name);
  return (
    <div className="flex flex-col gap-1 min-w-0 w-full">
      <div className="text-sm font-black text-[var(--text)] break-words whitespace-normal drop-shadow-md leading-tight">
        {cleanName}
      </div>
      <div className="self-start px-2 py-0.5 rounded-md border text-[9px] font-black tracking-widest shrink-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-white/10 text-[var(--subtext)] backdrop-blur-md shadow-inner">
        {type}
      </div>
    </div>
  );
};

interface ConflictResolutionSidebarProps {
  conflict: any;
  onClose: () => void;
  onVault: (modName: string) => void;
  onOverride: (winnerName: string, modPair: string) => void;
  onUndo?: (winnerName: string) => void;
}

export default function ConflictResolutionSidebar({ conflict, onClose, onVault, onOverride, onUndo }: ConflictResolutionSidebarProps) {
  const { t } = useLexicon();
  const [selectedMod, setSelectedMod] = useState<string | null>(null);
  
  if (!conflict) return null;
  
  const isTier4 = conflict.severity_rank === 4;
  const isTier3 = conflict.severity_rank === 3;
  const isTier2 = conflict.severity_rank === 2;

  return (
    <SidePanel
      isOpen={!!conflict}
      onClose={onClose}
      title={t("radar_title")}
      subtitle={isTier4 ? (t("radar_tier4_title") || "Collision Severity 4"?.replace("dY>` ", "") || "FATAL CLASH") : isTier3 ? (t("radar_tier3_title")) : (t("scout_duplicate_clones"))}
      icon="warning"
      iconColorClass={isTier4 ? "text-[var(--danger)]" : isTier3 ? "text-[var(--warning)]" : "text-[var(--accent)]"}
      widthClass="w-[500px]"
      footer={
        selectedMod ? (
          <div className="flex flex-col gap-3 w-full animate-in slide-in-from-bottom-4">
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => { 
                  if (isTier3) {
                     onOverride(selectedMod, conflict.mod_pair);
                  } else {
                     const loser = conflict.modA === selectedMod ? conflict.modB : conflict.modA;
                     onVault(loser);
                  }
                  onClose(); 
                }} 
                className="w-full py-5 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-xl shadow-[0_10px_30px_color-mix(in_srgb,var(--success)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[var(--success)] hover:scale-105 active:scale-95 text-[11px] font-black tracking-[0.2em] uppercase rounded-[1.5rem] transition-all flex flex-col items-center justify-center gap-1 group"
              >
                <span className="material-symbols-outlined !text-[24px] group-hover:scale-110 transition-transform">{t("ui_icon_check_circle")}</span>
                <span>{t("radar_btn_set_winner")}</span>
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-8 h-full px-2">
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest opacity-60">
            {t("radar_conflict_details")}
          </h3>
          {conflict.is_ghost && (
             <div className={`px-4 py-3 border rounded-xl text-xs font-black tracking-wide ${isTier4 ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[var(--danger)] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[var(--warning)] text-[var(--warning)]"}`}>
               <span className="material-symbols-outlined !text-[12px] opacity-70 mr-1">{t("ui_icon_policy")}</span> {t("scout_logical_clash")} {conflict.resolution_note}
             </div>
          )}
          <p className="text-sm text-[var(--text)] opacity-80 leading-relaxed font-bold">
            {isTier4 
              ? (t("radar_tier4_desc_winner"))
              : isTier3 
                ? (t("radar_tier3_desc_winner"))
                : (t("scout_identical_assets_winner"))
            }
          </p>
        </div>

        <div className="flex flex-col relative mt-2">
          {[conflict.modA, conflict.modB].map((modName, idx) => {
            const isActive = selectedMod === modName;
            return (
              <Fragment key={modName}>
                {idx === 1 && (
                  <div className="relative h-12 flex items-center justify-center z-20 shrink-0">
                    <div className="absolute left-8 right-8 h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] z-10 pointer-events-none" />
                    <div className={`relative z-20 w-8 h-8 rounded-full border flex items-center justify-center text-[9px] font-black shadow-xl transition-all pointer-events-none backdrop-blur-md ${
                      isTier4 ? 'bg-[color-mix(in_srgb,var(--bg)_80%,var(--danger))] border-[var(--danger)] text-[var(--danger)]' : 
                      isTier3 ? 'bg-[color-mix(in_srgb,var(--bg)_80%,var(--warning))] border-[var(--warning)] text-[var(--warning)]' : 
                      'bg-[color-mix(in_srgb,var(--bg)_80%,var(--text))] border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)]'
                    }`}>
                      {t("nexus_vs")}
                    </div>
                  </div>
                )}
                <div className="flex flex-col relative z-10">
                  <div 
                    onClick={() => setSelectedMod(modName)}
                    className={`relative group cursor-pointer w-full rounded-[2rem] overflow-hidden transition-colors duration-300 border-2 ${
                    isActive 
                      ? `border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_10px_30px_color-mix(in_srgb,var(--accent)_20%,transparent)]` 
                      : `border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]`
                  }`}
                >
                  {/* Glow Overlay */}
                  {isActive && <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] to-transparent opacity-10 pointer-events-none" />}
                  
                  <div className="relative p-6 flex items-center gap-6 z-10">
                    {/* Icon Tile */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 ${
                      isActive 
                        ? 'border-transparent bg-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_40%,transparent)]' 
                        : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'
                    }`}>
                      <span className={`material-symbols-outlined !text-[28px] transition-colors duration-300 ${isActive ? 'text-[var(--bg)]' : 'text-[var(--text)] opacity-50 group-hover:opacity-100'}`}>
                        {t("ui_icon_extension")}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 flex flex-col min-w-0 w-full gap-2">
                      <ModNameWithBadge name={modName} />
                    </div>

                    {/* Selection Indicator */}
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      isActive ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]' : 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-transparent group-hover:border-[color-mix(in_srgb,var(--text)_50%,transparent)]'
                    }`}>
                      <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_check")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Fragment>
            );
          })}
        </div>
      </div>
    </SidePanel>
  );
}
