import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  InlineFilterGroup,
  EmptyState,
  ActionPill,
  HoverTooltip,
} from "../shared";

interface Asset {
  id: string;
  name: string;
  type: string;
}

const formatCleanAssetName = (rawName: string): string => {
  if (!rawName) return "";
  let cleaned = String(rawName)
    .split(/[\\/]/)
    .pop() || "";
  cleaned = cleaned
    .replace(/\.(package|ts4script|zip|rar|7z|json|dll|asi|lua|reds|csx)$/i, "")
    .replace(/_/g, " ")
    .replace(/^['`’]+(?=[A-Za-z])/, (m) => (cleaned.toUpperCase().startsWith("'OFFEE") ? "C" : ""))
    .replace(/\]\s*(?=[A-Za-z0-9])/g, "] ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (/^\[.*\]$/.test(word)) {
        const inner = word.slice(1, -1);
        if (inner.length <= 4) return `[${inner.toUpperCase()}]`;
        return `[${inner.charAt(0).toUpperCase()}${inner.slice(1).toLowerCase()}]`;
      }
      if (/^\(.*\)$/.test(word)) {
        return word.toUpperCase();
      }
      if (/^(v\d+(\.\d+)*|hq|cc|cas|ui|dlc|max\d+)$/i.test(word)) {
        return word.toUpperCase();
      }
      const letters = word.replace(/[^A-Za-z]/g, "");
      if (letters.length > 2 && letters === letters.toUpperCase()) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(" ");
};

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
        .select("id, name, compliance_tier, status")
        .eq("compliance_tier", 0)
        .in("status", ["verified", "stable"]);

      const { data: marketAssetsData } = await supabase
        .from("nexus_assets")
        .select("id, name, asset_type")
        .or("is_public.eq.true,is_public.is.null");

      const { data: blueprintsData } = await supabase
        .from("blueprints")
        .select("id, name, compliance_tier, is_public")
        .eq("compliance_tier", 0)
        .eq("is_public", true);

      const combinedAssets: Asset[] = [];
      if (modsData)
        combinedAssets.push(
          ...modsData.map((m) => ({
            id: m.id,
            name: formatCleanAssetName(m.name) || m.name,
            type: "mod",
          }))
        );
      if (blueprintsData)
        combinedAssets.push(
          ...blueprintsData.map((b) => ({
            id: b.id,
            name: formatCleanAssetName(b.name) || b.name,
            type: "blueprint",
          }))
        );
      if (marketAssetsData)
        combinedAssets.push(
          ...marketAssetsData.map((a) => ({
            id: a.id,
            name: formatCleanAssetName(a.name) || a.name,
            type: a.asset_type,
          }))
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
      widthClass="w-[92vw] md:w-[760px]"
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

            {filteredAssets.length === 0 ? (
              <EmptyState
                icon={t("ui_icon_image_not_supported", "image_not_supported")}
                title={t("no_assets", "No Assets Found")}
                className="col-span-full py-12"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[540px] overflow-y-auto custom-scrollbar pr-1">
                {filteredAssets.slice(0, 100).map((asset) => {
                  const assetIcon =
                    asset.type === "mod"
                      ? t("icon_deployed_code", "deployed_code")
                      : asset.type === "blueprint"
                        ? t("icon_map", "map")
                        : asset.type === "lexicon"
                          ? t("icon_translate", "translate")
                          : asset.type === "workbench_template"
                            ? t("icon_draw", "draw")
                            : t("icon_palette", "palette");

                  const iconColorClass =
                    asset.type === "mod"
                      ? "text-teal-400"
                      : asset.type === "blueprint"
                        ? "text-blue-400"
                        : asset.type === "lexicon"
                          ? "text-indigo-400"
                          : asset.type === "workbench_template"
                            ? "text-pink-400"
                            : "text-purple-400";

                  const assetTypeLabel =
                    asset.type === "mod"
                      ? t("term_mod", "{Mod}")
                      : asset.type === "blueprint"
                        ? t("term_blueprint", "{Blueprint}")
                        : asset.type === "lexicon"
                          ? t("lexicon", "Lexicon")
                          : asset.type === "workbench_template"
                            ? t("workbench_template", "Template")
                            : t("chameleon", "Chameleon");

                  return (
                    <button
                      key={`${asset.type}-${asset.id}`}
                      type="button"
                      onClick={() => handleLink(asset)}
                      className="relative text-left p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all duration-300 flex items-center justify-between gap-3 group cursor-pointer"
                    >
                      <HoverTooltip
                        title={asset.name}
                        subtitle={assetTypeLabel}
                        icon={assetIcon}
                        delay={120}
                      />
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                          <span className={`material-symbols-outlined !text-[19px] ${iconColorClass}`}>
                            {assetIcon}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-xs font-black text-[var(--text)] tracking-tight truncate group-hover:text-[var(--accent)] transition-colors">
                            {asset.name}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-80 flex items-center gap-1 truncate">
                            <span className={`material-symbols-outlined !text-[11px] ${iconColorClass}`}>
                              {assetIcon}
                            </span>
                            <span className="truncate">{assetTypeLabel}</span>
                          </span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center shrink-0 text-[var(--subtext)] group-hover:text-[var(--accent)] transition-all">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_add_link", "add_link")}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {filteredAssets.length > 100 && (
                  <div className="col-span-full text-center text-[var(--subtext)] text-xs py-3 opacity-60 font-black capitalize tracking-widest">
                    {t(
                      "search_to_see_more_results",
                      `+ ${filteredAssets.length - 100} MORE ASSETS`
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
