import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel, InlineFilterGroup, EmptyState } from "../shared-components/layout";
import { ActionPill, HoverTooltip } from "../shared-components/alerts";
import { getExtensionRegex } from "../shared-components/modUtils";
import { SidePanelHeroCard, UniversalGroup } from "../components/universal/UniversalLayout";

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
  const extRegex = getExtensionRegex(useStore.getState().activeGameSchema);
  cleaned = cleaned
    .replace(extRegex, "")
    .replace(/\.(zip|rar|7z|tar|gz|json|toml|yaml|yml|xml|cfg|ini|dll|asi|so|dylib|lua)$/i, "")
    .replace(/_/g, " ")
    .replace(/^['`’]+(?=[A-Za-z])/, "")
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
      if (/^(v\d+(\.\d+)*|hq|cc|ui|dlc|sdk|api)$/i.test(word)) {
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
  widthClass?: string;
  backdropZ?: string;
  panelZ?: string;
}

export function LinkAssetSidePanel({
  isOpen,
  onClose,
  onAssetSelect,
  widthClass = "w-[90vw] md:w-[800px]",
  backdropZ = "z-[50000]",
  panelZ = "z-[50001]",
}: LinkAssetSidePanelProps) {
  const { t } = useLexicon();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [activeAssetFilter, setActiveAssetFilter] = useState("all");
  const [underlayWidth, setUnderlayWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setUnderlayWidth(null);
      return;
    }

    const measureUnderlay = () => {
      if (window.innerWidth < 768) {
        setUnderlayWidth(null);
        return;
      }
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".sa-side-panel-wrapper.sa-panel-open .sa-side-panel-window.sa-panel-right:not(.sa-link-asset-panel)"
        )
      );
      let maxWidth = 0;
      for (const el of candidates) {
        const w = el.getBoundingClientRect().width;
        if (w > maxWidth) maxWidth = w;
      }
      setUnderlayWidth(maxWidth > 0 ? Math.ceil(maxWidth) : null);
    };

    measureUnderlay();
    const rafId = window.requestAnimationFrame(measureUnderlay);
    window.addEventListener("resize", measureUnderlay);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureUnderlay)
        : null;
    if (observer) {
      document
        .querySelectorAll<HTMLElement>(
          ".sa-side-panel-wrapper.sa-panel-open .sa-side-panel-window.sa-panel-right:not(.sa-link-asset-panel)"
        )
        .forEach((el) => observer.observe(el));
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measureUnderlay);
      observer?.disconnect();
    };
  }, [isOpen]);

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
      widthClass={widthClass}
      panelClass="sa-link-asset-panel"
      panelStyle={underlayWidth ? { width: `${underlayWidth}px`, maxWidth: "100vw" } : undefined}
      noScroll={true}
      backdropZ={backdropZ}
      panelZ={panelZ}
    >
      <div className="flex flex-col gap-4 flex-1 min-h-0 relative z-10 w-full">
        <SidePanelHeroCard
          icon={t("icon_link", "link")}
          overline={t("pin_tab_assets", "Assets")}
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
          className="flex-1 min-h-0 !shrink"
          innerClassName="flex flex-col gap-4 flex-1 min-h-0"
        >
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="shrink-0">
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
            </div>

            {filteredAssets.length === 0 ? (
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <EmptyState
                  icon={t("ui_icon_image_not_supported", "image_not_supported")}
                  title={t("no_assets", "No Assets Found")}
                  className="py-12"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 min-h-0 overflow-y-auto content-start custom-scrollbar pr-1">
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
