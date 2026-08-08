import { useState, Fragment } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { formatDisplayName, SidePanel, getFileLabel, isSupportedExtension, SidePanelActionFooter } from "../shared";

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
    <div className="flex flex-col gap-1 min-w-0 w-full">
      <div className="text-sm font-black text-[var(--text)] break-words whitespace-normal drop-shadow-md leading-tight">
        {cleanName}
      </div>
      <div className="self-start px-2 py-0.5 rounded-md border text-[9px] font-black tracking-widest shrink-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] backdrop-blur-md shadow-inner">
        {type as any}
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

  const isTier4 = conflict.severity_rank == 4;
  const isTier3 = conflict.severity_rank == 3;
  const isTier2 = conflict.severity_rank == 2;

  return (
    <SidePanel
      isOpen={!!conflict}
      onClose={onClose}
      title={t("radar_title")}
      subtitle={isTier4 ? (t("tier4_title") || "Collision Severity 4"?.replace("dY>` ", "") || "FATAL CLASH") : isTier3 ? (t("tier3_title")) : (t("duplicate_clones"))}
      icon="warning"
      iconColorClass={isTier4 ? "text-[var(--danger)]" : isTier3 ? "text-[var(--warning)]" : "text-[var(--accent)]"}
      widthClass="w-[500px]"
      footer={
        selectedMod ? (
          <div className="w-full animate-in slide-in-from-bottom-4">
            <SidePanelActionFooter
              onAction={() => {
                if (isTier3) {
                  onOverride(selectedMod, conflict.mod_pair);
                } else {
                  const loser = conflict.modA === selectedMod ? conflict.modB : conflict.modA;
                  onVault(loser);
                }
                onClose();
              }}
              actionLabel={t("btn_set_winner")}
              actionIcon={t("icon_check_circle") || "check_circle"}
              actionVariant="success"
              onCancel={onClose}
            />
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-8 h-full px-2">
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest opacity-60">
            {t("conflict_details")}
          </h3>
          {conflict.is_ghost && (
             <div className={`p-4 rounded-2xl border flex flex-col gap-2 relative overflow-hidden glass-panel backdrop-blur-md ${isTier4 ? "border-[var(--danger)]/20 shadow-[inset_0_0_20px_rgba(239,68,68,0.05)] bg-[var(--danger)]/5" : "border-[var(--warning)]/20 shadow-[inset_0_0_20px_rgba(245,158,11,0.05)] bg-[var(--warning)]/5"}`}>
               <div className="flex items-center gap-2">
                 <span className={`material-symbols-outlined !text-[16px] drop-shadow-md ${isTier4 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{t("icon_policy")}</span>
                 <span className={`uppercase tracking-widest text-[10px] font-black ${isTier4 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{t("logical_clash")}</span>
               </div>
               <div className="opacity-80 font-bold pl-6 text-xs leading-relaxed text-[var(--text)]">
                 {conflict.resolution_note}
               </div>
             </div>
          )}
          <p className="text-sm text-[var(--text)] opacity-80 leading-relaxed font-bold">
            {isTier4
              ? (t("tier4_desc_winner"))
              : isTier3
                ? (t("tier3_desc_winner"))
                : (t("identical_assets_winner"))
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
                    <div className={`relative z-20 w-8 h-8 rounded-full border flex items-center justify-center text-[9px] font-black shadow-xl transition-all pointer-events-none backdrop-blur-md ${isTier4 ? 'bg-[var(--bg)] border-[var(--danger)] text-[var(--danger)] shadow-[0_0_15px_rgba(239,68,68,0.3)]' :
                        isTier3 ? 'bg-[var(--bg)] border-[var(--warning)] text-[var(--warning)] shadow-[0_0_15px_rgba(245,158,11,0.3)]' :
                          'bg-[var(--bg)] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                      }`}>
                      {t("vs")}
                    </div>
                  </div>
                )}
                <div className="flex flex-col relative z-10">
                  <div
                    onClick={() => setSelectedMod(modName)}
                    className={`relative group cursor-pointer w-full rounded-2xl overflow-hidden transition-all duration-500 border glass-panel backdrop-blur-2xl ${isActive
                        ? `border-[var(--accent)] bg-[var(--accent)]/[15%] shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_20%,transparent)] scale-[1.02] z-10`
                        : `border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-2xl`
                      }`}
                  >
                    {isActive && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] to-transparent opacity-10 pointer-events-none mix-blend-screen" />
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50" />
                        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-20" />
                      </>
                    )}

                    <div className="relative p-6 flex items-center gap-6 z-10">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500 ${isActive
                          ? 'border-[var(--accent)] bg-[var(--accent)]/[20%] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent),0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] backdrop-blur-md'
                          : 'glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] shadow-inner'
                        }`}>
                        <span className={`material-symbols-outlined !text-[28px] transition-colors duration-500 ${isActive ? 'text-[var(--accent)] drop-shadow-[0_0_10px_var(--accent)]' : 'text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:opacity-100'}`}>
                          {t("icon_extension")}
                        </span>
                      </div>

                      <div className="flex-1 flex flex-col min-w-0 w-full gap-2">
                        <ModNameWithBadge name={modName} />
                      </div>

                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-all duration-500 ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_40%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-transparent group-hover:border-[color-mix(in_srgb,var(--text)_50%,transparent)] bg-black/20 shadow-inner'
                        }`}>
                        <span className={`material-symbols-outlined font-black transition-all duration-500 ${isActive ? '!text-[18px] drop-shadow-[0_0_8px_var(--accent)] scale-110' : '!text-[16px] scale-90'}`}>{t("icon_check")}</span>
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
