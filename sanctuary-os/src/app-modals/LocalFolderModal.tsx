import React from "react";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  ActionButton,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";

export function LocalFolderModal({
  localFolderModal,
  setLocalFolderModal,
  localFolderType,
  setLocalFolderType,
  localFolderName,
  setLocalFolderName,
  createLocalFolder,
  selectedMods = [],
  resolveDisplayName,
}: any) {
  const { t } = useLexicon();

  if (!localFolderModal) return null;

  const isCollection = localFolderType === "CC_SET";

  return (
    <SidePanel
      isOpen={localFolderModal}
      onClose={() => setLocalFolderModal(false)}
      title={t("local_folder_title", "Create Local Folder")}
      subtitle={t("local_folder_desc", "Group selected Vault artifacts together")}
      icon="create_new_folder"
      iconColorClass={isCollection ? "text-[var(--accent)]" : "text-[var(--success)]"}
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[115000]"
      panelZ="z-[115001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon="folder_open"
            tooltip={t("btn_create_folder", "Create Folder")}
            onClick={createLocalFolder}
            variant="success"
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={isCollection ? "category" : "create_new_folder"}
          overline={
            isCollection
              ? t("collection", "Collection")
              : t("folder", "Local Folder")
          }
          title={t("local_folder_title", "Organize Selected Artifacts")}
          description={t(
            "local_folder_desc",
            "Bundle multiple Vault packages into a collapsible folder or Custom Content collection."
          )}
          badge={`${selectedMods.length} ${t("items", "Items")}`}
          badgeIcon={t("icon_inventory_2", "inventory_2")}
          variant={isCollection ? "accent" : "success"}
        />

        <div className="grid grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon="folder"
            label={t("local_folder_title", "Container Type")}
            value={t("folder", "Folder")}
            isActive={!isCollection}
            onClick={() => setLocalFolderType("FOLDER")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon="category"
            label={t("local_folder_title", "Container Type")}
            value={t("collection", "Collection")}
            isActive={isCollection}
            onClick={() => setLocalFolderType("CC_SET")}
          />
        </div>

        <UniversalGroup
          title={
            isCollection
              ? t("ph_collection_name", "Collection Name")
              : t("ph_folder_name", "Folder Name")
          }
          icon={isCollection ? "category" : "folder"}
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px] pointer-events-none">
                {isCollection ? "category" : "folder"}
              </span>
              <input
                autoFocus
                type="text"
                value={localFolderName}
                onChange={(e) => setLocalFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createLocalFolder()}
                placeholder={
                  isCollection
                    ? t("ph_collection_name", "Enter Collection Name...")
                    : t("ph_folder_name", "Enter Folder Name...")
                }
                className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>
            <ActionButton
              variant="glass"
              icon="create_new_folder"
              label={t("btn_create_folder", "Create")}
              disabled={!localFolderName?.trim()}
              onClick={createLocalFolder}
              className="shrink-0 !text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_42%,transparent)]"
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={`${t("artifacts_linked", "Linked Artifacts")} (${selectedMods.length})`}
          icon={t("icon_inventory_2", "inventory_2")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
            {selectedMods.map((modName: string, i: number) => {
              const displayName = resolveDisplayName
                ? resolveDisplayName(modName)
                : modName.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
              return (
                <div
                  key={i}
                  className="glass-surface px-3.5 py-2.5 rounded-xl flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                >
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      isCollection
                        ? "text-[var(--accent)]"
                        : "text-[var(--success)]"
                    }`}
                  >
                    {isCollection ? "category" : "folder"}
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
