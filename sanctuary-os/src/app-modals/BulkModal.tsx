import React from 'react';
import { useLexicon } from "../LexiconContext";
import { SidePanel, SidePanelActionFooter } from "../shared";

export function BulkModal({ bulkModal, setBulkModal, bulkName, setBulkName, executeBulkDraft, selectedMods, resolveDisplayName }: any) {
  const { t } = useLexicon();

  if (!bulkModal) return null;

  return (
    <SidePanel
      isOpen={bulkModal}
      onClose={() => setBulkModal(false)}
      title={t("bulk_title")}
      subtitle={`${t("bulk_desc1")} ${selectedMods?.length || 0} ${t("bulk_desc2")}`}
      icon="architecture"
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[700px]"
      backdropZ="z-[115000]"
      panelZ="z-[115001]"
      ambientGlows={
        <>
          <div className="absolute -top-20 -right-20 w-96 h-96 bg-[var(--accent)] opacity-20 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute bottom-1/3 -left-32 w-96 h-96 bg-[var(--text)] opacity-10 blur-[100px] rounded-full pointer-events-none" />
        </>
      }
      footer={
        <SidePanelActionFooter
          actionLabel={t("btn_draft")}
          actionIcon="add_box"
          onAction={executeBulkDraft}
          actionVariant="accent"
          cancelLabel={t("nav_cancel")}
          onCancel={() => setBulkModal(false)}
        />
      }
    >
      <div className="flex flex-col gap-6 p-8 h-full min-h-[400px]">
        {/* Sleek Segmented Input Row */}
        <div className="flex items-center w-full overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/5 shadow-inner h-12 shrink-0">
          <div className="relative flex-1 h-full flex items-center">
            <span className="absolute left-4 opacity-50 text-[18px] material-symbols-outlined pointer-events-none">architecture</span>
            <input 
              autoFocus 
              type="text" 
              value={bulkName} 
              onChange={(e) => setBulkName(e.target.value)} 
              onKeyDown={(e) => e.key === "Enter" && executeBulkDraft()} 
              placeholder={t("draft_placeholder")}
              className="w-full h-full bg-transparent border-none outline-none px-4 pl-12 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)]"
            />
          </div>
          <button 
             onClick={executeBulkDraft}
             disabled={!bulkName?.trim() || selectedMods?.length === 0}
             className="h-full px-6 text-[10px] font-black uppercase tracking-widest transition-all bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black flex items-center justify-center gap-2 shrink-0 border-none outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
             <span className="material-symbols-outlined text-[16px]">add_box</span>
             {t("btn_draft")}
          </button>
        </div>

        {/* Selected Files List */}
        <div className="flex-1 flex flex-col min-h-0 pt-6 border-t border-white/5">
          <div className="flex items-center gap-3 mb-6 shrink-0">
            <span className="material-symbols-outlined !text-[18px] text-[var(--text)]">{t("icon_inventory_2") || "inventory_2"}</span>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)]">{t("artifacts_linked") || "ARTIFACTS LINKED"} ({(selectedMods || []).length})</h3>
          </div>
          
          <div className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto custom-scrollbar pr-2 items-start content-start">
            {(selectedMods || []).map((modName: string, i: number) => {
              const displayName = resolveDisplayName ? resolveDisplayName(modName) : modName.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
              return (
                <div key={i} className="theme-glass-inner p-3 rounded-xl flex items-center gap-4 group/item transition-colors hover:bg-white/5 border border-white/5 hover:border-white/10">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-50">description</span>
                  <span className="text-[11px] font-black text-[var(--text)] uppercase truncate">{displayName}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
