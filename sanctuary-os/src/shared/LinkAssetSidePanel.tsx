import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { SidePanel, ScreenUtilityBar, FilterPopover, InlineFilterGroup, EmptyState } from '../shared';

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

export function LinkAssetSidePanel({ isOpen, onClose, onAssetSelect, backdropZ = "z-[50000]", panelZ = "z-[50001]" }: LinkAssetSidePanelProps) {
  const { t } = useLexicon();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [activeAssetFilter, setActiveAssetFilter] = useState("all");

  useEffect(() => {
    if (!isOpen) return;

    const fetchAssets = async () => {
      const { data: modsData } = await supabase
        .from('mods')
        .select('id, name')
        .eq('compliance_tier', 0)
        .eq('status', 'verified');
        
      const { data: marketAssetsData } = await supabase
        .from('nexus_assets')
        .select('id, name, asset_type');
        
      const { data: blueprintsData } = await supabase
        .from('blueprints')
        .select('id, name');

      let combinedAssets: Asset[] = [];
      if (modsData) combinedAssets.push(...modsData.map(m => ({ id: m.id, name: m.name, type: 'mod' })));
      if (blueprintsData) combinedAssets.push(...blueprintsData.map(b => ({ id: b.id, name: b.name, type: 'blueprint' })));
      if (marketAssetsData) combinedAssets.push(...marketAssetsData.map(a => ({ id: a.id, name: a.name, type: a.asset_type })));
      
      setAssets(combinedAssets.sort((a, b) => a.name.localeCompare(b.name)));
    };

    fetchAssets();
  }, [isOpen]);

  const filteredAssets = useMemo(() => {
    if (!isOpen) return [];
    return assets.filter(a => {
      if (assetSearchQuery && !a.name.toLowerCase().includes(assetSearchQuery.toLowerCase())) return false;
      if (activeAssetFilter !== 'all' && a.type !== activeAssetFilter) return false;
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
      title={t("link_asset")}
      icon="link"
      backdropZ={backdropZ}
      panelZ={panelZ}
    >
      <div className="flex flex-col gap-6">
        <div className="animate-in slide-in-from-top-2">
          <ScreenUtilityBar
            isSidePanel={true}
            search={assetSearchQuery}
            onSearchChange={setAssetSearchQuery}
            searchPlaceholder={t("search_assets") || "Search assets..."}
            className="!mb-0 !pb-0 !px-0 !border-0 flex-none w-full"
          >
            <FilterPopover icon="tune" label={t("filters") || "Filters"} className="shrink-0" buttonClassName="!rounded-2xl">
              <div className="flex flex-col gap-4 w-[280px] p-2">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">{t("asset_type") || "Asset Type"}</span>
                  <InlineFilterGroup 
                    value={activeAssetFilter}
                    onChange={(v: string) => setActiveAssetFilter(v)}
                    options={[
                      { id: 'all', label: 'ALL ASSETS' },
                      { id: 'mod', label: 'ARTIFACTS' },
                      { id: 'blueprint', label: 'BLUEPRINTS' },
                      { id: 'chameleon', label: 'THEMES' },
                      { id: 'lexicon', label: 'LEXICONS' }
                    ]}
                  />
                </div>
              </div>
            </FilterPopover>
          </ScreenUtilityBar>
        </div>
        <div className="flex flex-col gap-2">
          {filteredAssets.length === 0 && <EmptyState icon={t("ui_icon_image_not_supported")} title={t("no_assets")} className="col-span-full py-16" />}
          {filteredAssets.slice(0, 100).map(asset => (
            <button key={`${asset.type}-${asset.id}`} type="button" onClick={() => handleLink(asset)} className="text-left px-5 py-4 rounded-2xl glass-surface hover:theme-border-accent transition-all flex items-center gap-4 group">
              <span className="material-symbols-outlined opacity-70 text-xl shrink-0 group-hover:scale-110 transition-transform">{asset.type === 'mod' ? (t("icon_extension")) : asset.type === 'blueprint' ? (t("icon_architecture")) : asset.type === 'lexicon' ? (t("icon_translate")) : (t("icon_palette"))}</span>
              <span className="text-sm font-black text-[var(--text)] capitalize tracking-tight truncate w-full group-hover:theme-text-accent transition-colors">{asset.name}</span>
            </button>
          ))}
          {filteredAssets.length > 100 && (
            <div className="text-center text-[var(--subtext)] text-xs py-4 opacity-50 font-black capitalize tracking-widest">
              {t("search_to_see_more_results") || `+ ${filteredAssets.length - 100} MORE ASSETS`}
            </div>
          )}
        </div>
      </div>
    </SidePanel>
  );
}
