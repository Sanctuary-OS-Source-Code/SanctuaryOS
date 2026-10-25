import React from "react";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";

export function BulkModal({
  bulkModal,
  setBulkModal,
  bulkName,
  setBulkName,
  executeBulkDraft,
  selectedMods,
  resolveDisplayName,
}: any) {
  const { t } = useLexicon();

  if (!bulkModal) return null;

  const safeMods: string[] = Array.isArray(selectedMods) ? selectedMods : [];

  return (
    <SidePanel
      isOpen={bulkModal}
      onClose={() => setBulkModal(false)}
      title={t("bulk_title", "Draft Blueprint")}
      subtitle={`${t("bulk_desc1", "Bundling")} ${safeMods.length} ${t("bulk_desc2", "selected artifacts")}`}
      icon="architecture"
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[115000]"
      panelZ="z-[115001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon="add_box"
            tooltip={t("btn_draft", "Draft Blueprint")}
            onClick={executeBulkDraft}
            variant="accent"
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon="architecture"
          overline={t("type_blueprint", "Blueprint Architect")}
          title={t("bulk_title", "Create New Blueprint")}
          description={`${t("bulk_desc1", "Bundling")} ${safeMods.length} ${t("bulk_desc2", "selected artifacts into a reusable Play Set.")}`}
          badge={`${safeMods.length} ${t("items", "Items")}`}
          badgeIcon={t("icon_inventory_2", "inventory_2")}
          variant="accent"
        />

        <UniversalGroup
          title={t("draft_placeholder", "Blueprint Name")}
          icon="edit_note"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px] pointer-events-none">
                architecture
              </span>
              <input
                autoFocus
                type="text"
                value={bulkName}
                onChange={(e) => setBulkName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && executeBulkDraft()}
                placeholder={t("draft_placeholder", "Enter Blueprint Name...")}
                className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>
            <ActionButton
              variant="glass"
              icon="add_box"
              label={t("btn_draft", "Draft")}
              disabled={!bulkName?.trim() || safeMods.length === 0}
              onClick={executeBulkDraft}
              className="shrink-0 !text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_42%,transparent)]"
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={`${t("artifacts_linked", "Linked Artifacts")} (${safeMods.length})`}
          icon={t("icon_inventory_2", "inventory_2")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
            {safeMods.map((modName: string, i: number) => {
              const displayName = resolveDisplayName
                ? resolveDisplayName(modName)
                : modName.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
              return (
                <div
                  key={i}
                  className="glass-surface px-3.5 py-2.5 rounded-xl flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                >
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    description
                  </span>
                  <span className="text-xs font-bold text-[var(--text)] truncate">
                    {displayName}
                  </span>
                </div>
              );
            })}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
