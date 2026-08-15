import { useLexicon } from '../LexiconContext';
import React, { useState } from 'react';
import { getModIcon, SidePanel, EmptyState, CustomDropdown } from '../shared';
export default function SidePanelMasonPin({ isOpen, onClose, mason, mods, marketAssets, handlePin, activeGameSchema, t }: any) {
  const [activeTab, setActiveTab] = useState<'mod' | 'asset'>('mod');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const modCategories = ['ALL', ...Array.from(new Set(mods?.map((m: any) => m.category_override || t("label_artifact")) || []))];
  const assetCategories = ['ALL', 'blueprint', 'lexicon', 'chameleon', 'workbench_template'];

  const filteredMods = mods?.filter((m: any) => {
    if (activeCategory !== 'ALL' && (m.category_override || t("label_artifact")) !== activeCategory) return false;
    if (searchQuery && !m.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];
  
  const filteredAssets = marketAssets?.filter((a: any) => {
    if (activeCategory !== 'ALL' && a.asset_type !== activeCategory) return false;
    if (searchQuery && !a.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];
  
  if (!mason) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      keepMounted={true}
      title={t("panel_pin_details")}
      subtitle={t("panel_pin_subtitle")}
      icon="push_pin"
      widthClass="w-[900px] max-w-[95vw]"
    >
      <div className="flex flex-col h-full">
        <div className="px-6 pt-6 shrink-0 mb-4 flex flex-col gap-4">
          <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner divide-x divide-white/5">
            <button 
              onClick={() => { setActiveTab('mod'); setActiveCategory('ALL'); }} 
              className={`flex-1 relative shrink-0 flex flex-col items-center justify-center gap-1.5 px-6 py-3 transition-all duration-500 ${activeTab === 'mod' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-b-2 border-b-[var(--accent)]' : 'text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}
            >
              <span className="material-symbols-outlined !text-xl">account_balance</span>
              <span className="text-[9px] font-black capitalize tracking-[0.2em]">{t("type_artifacts")}</span>
            </button>
            <button 
              onClick={() => { setActiveTab('asset'); setActiveCategory('ALL'); }} 
              className={`flex-1 relative shrink-0 flex flex-col items-center justify-center gap-1.5 px-6 py-3 transition-all duration-500 ${activeTab === 'asset' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-b-2 border-b-[var(--accent)]' : 'text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}
            >
              <span className="material-symbols-outlined !text-xl">inventory_2</span>
              <span className="text-[9px] font-black capitalize tracking-[0.2em]">{t("type_assets")}</span>
            </button>
          </div>
          
          <div className="flex flex-row items-center gap-3 w-full">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)]">search</span>
              <input 
                type="text"
                placeholder={activeTab === 'mod' ? (t("search_artifacts")) : (t("search_assets"))}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-10 glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)] rounded-xl outline-none text-sm transition-all placeholder:text-[color-mix(in_srgb,var(--subtext)_50%,transparent)] focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="material-symbols-outlined !text-lg">close</span>
                </button>
              )}
            </div>
            
            <div className="min-w-[200px] shrink-0">
              <CustomDropdown 
                disableTint={true}
                value={activeCategory}
                onChange={(v: any) => setActiveCategory(v[0])}
                options={
                  activeTab === 'mod' 
                    ? modCategories.map(cat => ({ id: cat, label: cat === 'ALL' ? (t('all_classes')) : cat, icon: t("icon_folder") }))
                    : assetCategories.map(cat => ({ id: cat, label: cat === 'ALL' ? (t('all_types')) : (t(cat) || cat), icon: t("icon_folder") }))
                }
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
          {activeTab === 'mod' ? (
            filteredMods.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMods.map((mod: any) => (
         <div key={mod.id} onClick={() => { handlePin('mod', mod.id); }} className={`relative flex items-center gap-4 p-4 glass-panel border rounded-2xl transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group ${(mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id) ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                    
                    <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                      {mod.image_url ? (
                        <img src={mod.image_url} alt={mod.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                      ) : (
                        <span className={`material-symbols-outlined !text-3xl transition-all duration-500 ${(mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id) ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:text-[var(--accent)] group-hover:scale-110'}`}>{getModIcon(mod, activeGameSchema, t)}</span>
                      )}
                    </div>
                    
                    <div className="flex flex-col flex-1 min-w-0 z-10 justify-center">
                      <h3 className={`text-xs font-black truncate capitalize tracking-tight transition-colors mb-1 ${(mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id) ? 'theme-text-accent' : 'group-hover:theme-text-accent'}`}>{mod.name}</h3>
                      <span className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate">
                        {mod.category_override || t("label_artifact")}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-center w-8 h-8 shrink-0 z-10 transition-all duration-500">
                      {(mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id) ? (
                        <span className="material-symbols-outlined !text-2xl text-[var(--accent)]">check_circle</span>
                      ) : (
                        <span className="material-symbols-outlined !text-xl text-[var(--subtext)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] -translate-x-4 group-hover:translate-x-0 transition-all duration-500">push_pin</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-8 flex justify-center w-full">
                <EmptyState icon="search" title={t("no_match_artifacts")} minHeightClass="min-h-[200px]" />
              </div>
            )
          ) : (
            filteredAssets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAssets.map((asset: any) => {
                  const isBp = asset.asset_type === 'blueprint';
                  const smIcon = isBp ? t("icon_map") : asset.asset_type === 'lexicon' ? t("icon_translate") : asset.asset_type === 'chameleon' ? t("icon_palette") : t("icon_draw");
                  return (
          <div key={asset.id} onClick={() => { handlePin(isBp ? 'blueprint' : 'asset', asset.id); }} className={`relative flex items-center gap-4 p-4 glass-panel border rounded-2xl transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group ${(mason?.pinned_asset_id === asset.id || mason?.pinned_blueprint_id === asset.id) ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'} transform-gpu backface-hidden`}>

                      <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                        {asset.image_url ? (
                          <img src={asset.image_url} alt={asset.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                        ) : (
                          <span className={`material-symbols-outlined !text-3xl transition-all duration-500 ${(mason?.pinned_asset_id === asset.id || mason?.pinned_blueprint_id === asset.id) ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:text-[var(--accent)] group-hover:scale-110'}`}>{smIcon}</span>
                        )}
                      </div>
                      
                      <div className="flex flex-col flex-1 min-w-0 z-10 justify-center">
                        <h3 className={`text-xs font-black truncate capitalize tracking-tight transition-colors mb-1 ${(mason?.pinned_asset_id === asset.id || mason?.pinned_blueprint_id === asset.id) ? 'theme-text-accent' : 'group-hover:theme-text-accent'}`}>{asset.name}</h3>
                        <span className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate">
                          {t(asset.asset_type) || asset.asset_type}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-center w-8 h-8 shrink-0 z-10 transition-all duration-500">
                        {(mason?.pinned_asset_id === asset.id || mason?.pinned_blueprint_id === asset.id) ? (
                          <span className="material-symbols-outlined !text-2xl text-[var(--accent)]">check_circle</span>
                        ) : (
                          <span className="material-symbols-outlined !text-xl text-[var(--subtext)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] -translate-x-4 group-hover:translate-x-0 transition-all duration-500">push_pin</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 flex justify-center w-full">
                <EmptyState icon="search" title={t("no_match_assets")} minHeightClass="min-h-[200px]" />
              </div>
            )
          )}
        </div>
      </div>
    </SidePanel>
  );
}


