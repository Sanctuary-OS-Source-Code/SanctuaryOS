import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  InlineFilterGroup,
  EmptyState,
  ActionPill,
  VAULT_CHIP_CLASS,
} from "../shared";

interface Asset {
  id: string;
  name: string;
  type: string;
}

interface LinkAssetSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAssetSelect: (asset: Asset) => void;
  backdropZ?: string;
  panelZ?: string;
}

export function LinkAssetSidePanel({
  isOpen,
  onClose,
  onAssetSelect,
  backdropZ = "z-[50000]",
  panelZ = "z-[50001]",
}: LinkAssetSidePanelProps) {
  const { t } = useLexicon();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [activeAssetFilter, setActiveAssetFilter] = useState("all");

  useEffect(() => {
    if (!isOpen) return;

    const fetchAssets = async () => {
      const { data: modsData } = await supabase
        .from("mods")
        .select("id, name")
        .eq("compliance_tier", 0)
        .eq("status", "verified");

      const { data: marketAssetsData } = await supabase
        .from("nexus_assets")
        .select("id, name, asset_type");

      const { data: blueprintsData } = await supabase
        .from("blueprints")
        .select("id, name");

      const combinedAssets: Asset[] = [];
      if (modsData)
        combinedAssets.push(
          ...modsData.map((m) => ({ id: m.id, name: m.name, type: "mod" }))
        );
      if (blueprintsData)
        combinedAssets.push(
          ...blueprintsData.map((b) => ({ id: b.id, name: b.name, type: "blueprint" }))
        );
      if (marketAssetsData)
        combinedAssets.push(
          ...marketAssetsData.map((a) => ({ id: a.id, name: a.name, type: a.asset_type }))
        );

      setAssets(combinedAssets.sort((a, b) => a.name.localeCompare(b.name)));
    };

    fetchAssets();
  }, [isOpen]);

  const filteredAssets = useMemo(() => {
    if (!isOpen) return [];
    return assets.filter((a) => {
      if (assetSearchQuery && !a.name.toLowerCase().includes(assetSearchQuery.toLowerCase()))
        return false;
      if (activeAssetFilter !== "all" && a.type !== activeAssetFilter) return false;
      return true;
    });
  }, [assets, assetSearchQuery, activeAssetFilter, isOpen]);

  const handleLink = (asset: Asset) => {
    onAssetSelect(asset);
    setAssetSearchQuery("");
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("link_asset", "Link Asset")}
      subtitle={t("cc_search", "Select an artifact, blueprint, theme, or lexicon to attach")}
      icon={t("icon_link", "link")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ={backdropZ}
      panelZ={panelZ}
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_link", "link")}
          overline={t("link_asset", "Asset Directory")}
          title={t("link_asset", "Attach Nexus or Vault Asset")}
          description={t(
            "cc_search",
            "Search and filter verified mods, blueprints, themes, and lexicons to attach."
          )}
          badge={`${filteredAssets.length} ${t("term_mods", "Items")}`}
          badgeIcon={t("icon_inventory_2", "inventory_2")}
          variant="accent"
        />

        <UniversalGroup
          title={`${t("link_asset", "Available Assets")} (${filteredAssets.length})`}
          icon={t("icon_inventory_2", "inventory_2")}
        >
          <div className="flex flex-col gap-4">
            <ActionPill
              searchQuery={assetSearchQuery}
              setSearchQuery={setAssetSearchQuery}
              searchPlaceholder={t("cc_search", "Search assets...")}
              primaryPopover={{
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters"),
                content: (
                  <div className="flex flex-col gap-4 w-[280px] p-2">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                        {t("asset_type", "Asset Type")}
                      </span>
                      <InlineFilterGroup
                        value={activeAssetFilter}
                        onChange={(v: string) => setActiveAssetFilter(v)}
                        options={[
                          { id: "all", label: t("filter_all", "ALL ASSETS") },
                          { id: "mod", label: t("term_mods", "ARTIFACTS") },
                          { id: "blueprint", label: t("playsets", "BLUEPRINTS") },
                          { id: "chameleon", label: t("themes", "THEMES") },
                          { id: "lexicon", label: t("lexicons", "LEXICONS") },
                        ]}
                      />
                    </div>
                  </div>
                ),
              }}
            />

            <div className="flex flex-col gap-2">
              {filteredAssets.length === 0 && (
                <EmptyState
                  icon={t("ui_icon_image_not_supported", "image_not_supported")}
                  title={t("no_assets", "No Assets Found")}
                  className="col-span-full py-12"
                />
              )}
              {filteredAssets.slice(0, 100).map((asset) => {
                const assetIcon =
                  asset.type === "mod"
                    ? t("icon_extension", "extension")
                    : asset.type === "blueprint"
                      ? t("icon_architecture", "architecture")
                      : asset.type === "lexicon"
                        ? t("icon_translate", "translate")
                        : t("icon_palette", "palette");
                return (
                  <button
                    key={`${asset.type}-${asset.id}`}
                    type="button"
                    onClick={() => handleLink(asset)}
                    className="text-left px-4 py-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:theme-border-accent transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-xl glass-surface border text-[var(--accent)] flex items-center justify-center shrink-0"
                        style={{
                          borderColor:
                            "color-mix(in srgb, var(--accent) 25%, var(--border))",
                        }}
                      >
                        <span className="material-symbols-outlined !text-[18px]">
                          {assetIcon}
                        </span>
                      </div>
                      <span className="text-sm font-black text-[var(--text)] capitalize tracking-tight truncate group-hover:theme-text-accent transition-colors">
                        {asset.name}
                      </span>
                    </div>
                    <span
                      className={VAULT_CHIP_CLASS}
                      style={{
                        color: "var(--accent)",
                        borderColor:
                          "color-mix(in srgb, var(--accent) 35%, var(--border))",
                      }}
                    >
                      <span className="material-symbols-rounded !text-[12px] shrink-0">
                        {assetIcon}
                      </span>
                      {asset.type}
                    </span>
                  </button>
                );
              })}
              {filteredAssets.length > 100 && (
                <div className="text-center text-[var(--subtext)] text-xs py-3 opacity-60 font-black capitalize tracking-widest">
                  {t(
                    "search_to_see_more_results",
                    `+ ${filteredAssets.length - 100} MORE ASSETS`
                  )}
                </div>
              )}
            </div>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
