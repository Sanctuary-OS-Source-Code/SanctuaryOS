import React from 'react';

export function VaultBulkActions({ t, selectedMods, setSelectedMods, finalVisibleMods }: any) {
  return (
    <div className="flex items-center gap-4 py-3 px-6 mb-2 rounded-2xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]">
      <span className="text-xs font-black uppercase tracking-widest text-[var(--accent)]">{selectedMods.length} {t("items")}</span>
      <div className="h-4 w-px bg-white/10 mx-2" />
      <button
        onClick={() => {
          const visibleIds = finalVisibleMods.map((m: any) => m.name).filter(Boolean);
          setSelectedMods(Array.from(new Set([...selectedMods, ...visibleIds])));
        }}
        className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:text-[var(--accent)] transition-colors"
      >
        {t("btn_select_all") || "SELECT ALL"}
      </button>
      <button
        onClick={() => setSelectedMods([])}
        className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-rose-400 transition-colors ml-4"
      >
        {t("btn_deselect_all") || "DESELECT ALL"}
      </button>
    </div>
  );
}
