import React, { useState } from 'react';
import { getModIcon, SidePanel, EmptyState, CustomDropdown } from '../shared';

export default function SidePanelMasonPin({ isOpen, onClose, mason, mods, marketAssets, gameVersions, handlePin, activeGameSchema, t }: any) {
  const [activeTab, setActiveTab] = useState<'mod' | 'blueprint' | 'asset'>('mod');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const modCategories = ['ALL', ...Array.from(new Set(mods?.map((m: any) => m.category_override || t("label_artifact", "Artifact")) || []))];
  const blueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type === 'blueprint');
  const nonBlueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type !== 'blueprint');

  const blueprintVersions = [
    'ALL',
    ...Array.from(
      new Set([
        ...(gameVersions || []),
        ...blueprintAssets.map((b: any) => b.json_data?.game_version).filter(Boolean)
      ])
    )
  ];
  const assetCategories = ['ALL', 'lexicon', 'chameleon', 'workbench_template'];

  const filteredMods = mods?.filter((m: any) => {
    if (activeCategory !== 'ALL' && (m.category_override || t("label_artifact", "Artifact")) !== activeCategory) return false;
    if (searchQuery && !m.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];

  const filteredBlueprints = blueprintAssets.filter((b: any) => {
    if (activeCategory !== 'ALL' && b.json_data?.game_version !== activeCategory) return false;
    if (searchQuery && !b.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  
  const filteredAssets = nonBlueprintAssets.filter((a: any) => {
    if (activeCategory !== 'ALL' && a.asset_type !== activeCategory) return false;
    if (searchQuery && !a.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  
  if (!mason) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      keepMounted={true}
      title={t("panel_pin_details", "Feature Assignment")}
      subtitle={t("panel_pin_subtitle", "Select items to pin to your profile showcase")}
      icon={t("icon_push_pin", "push_pin")}
      widthClass="w-[900px] max-w-[95vw]"
    >
      <div className="flex flex-col h-full">
        <div className="px-6 pt-6 shrink-0 mb-4 flex flex-col gap-4">
          <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] shadow-inner divide-x divide-[color-mix(in_srgb,var(--text)_6%,transparent)]">
            <button 
              onClick={() => { setActiveTab('mod'); setActiveCategory('ALL'); }} 
              className={`flex-1 relative shrink-0 flex flex-col items-center justify-center gap-1.5 px-6 py-3 transition-all duration-500 ${activeTab === 'mod' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}
            >
              <span className="material-symbols-outlined !text-xl">{t("icon_account_balance", "account_balance")}</span>
              <span className="text-[9px] font-black capitalize tracking-[0.2em]">{t("pin_tab_artifacts", "Artifacts")}</span>
            </button>
            <button 
              onClick={() => { setActiveTab('blueprint'); setActiveCategory('ALL'); }} 
              className={`flex-1 relative shrink-0 flex flex-col items-center justify-center gap-1.5 px-6 py-3 transition-all duration-500 ${activeTab === 'blueprint' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}
            >
              <span className="material-symbols-outlined !text-xl">{t("icon_map", "map")}</span>
              <span className="text-[9px] font-black capitalize tracking-[0.2em]">{t("pin_tab_blueprints", "Blueprints")}</span>
            </button>
            <button 
              onClick={() => { setActiveTab('asset'); setActiveCategory('ALL'); }} 
              className={`flex-1 relative shrink-0 flex flex-col items-center justify-center gap-1.5 px-6 py-3 transition-all duration-500 ${activeTab === 'asset' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}
            >
              <span className="material-symbols-outlined !text-xl">{t("icon_inventory_2", "inventory_2")}</span>
              <span className="text-[9px] font-black capitalize tracking-[0.2em]">{t("pin_tab_assets", "Assets")}</span>
            </button>
          </div>
          
          <div className="flex flex-row items-center gap-3 w-full">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)]">{t("icon_search", "search")}</span>
              <input 
                type="text"
                placeholder={activeTab === 'mod' ? t("search_artifacts", "Search artifacts...") : activeTab === 'blueprint' ? t("search_blueprints", "Search blueprints...") : t("search_assets", "Search assets...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-10 glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] focus:border-[var(--accent)] rounded-xl outline-none text-sm transition-all placeholder:text-[color-mix(in_srgb,var(--subtext)_50%,transparent)] focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="material-symbols-outlined !text-lg">{t("icon_close", "close")}</span>
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
                    ? modCategories.map((cat: any) => ({ id: cat, label: cat === 'ALL' ? t("all_classes", "All Classes") : cat, icon: t("icon_folder", "folder") }))
                    : activeTab === 'blueprint'
                    ? blueprintVersions.map((ver: any) => ({ id: ver, label: ver === 'ALL' ? t("filter_all_versions", "All Versions") : ver, icon: ver === 'ALL' ? t("icon_folder", "folder") : t("icon_map", "map") }))
                    : assetCategories.map((cat: any) => ({ id: cat, label: cat === 'ALL' ? t("all_types", "All Types") : (t(cat, cat) || cat), icon: t("icon_folder", "folder") }))
                }
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
          {activeTab === 'mod' ? (
            filteredMods.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMods.map((mod: any) => {
                  const isPinned = mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id;
                  return (
                    <div key={mod.id} onClick={() => { handlePin('mod', mod.id); }} className={`relative flex items-center gap-4 p-4 glass-panel border rounded-2xl transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.01] hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group ${isPinned ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_8%,transparent)]'}`}>
                      <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden glass-surface bg-[color-mix(in_srgb,var(--text)_3%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] flex items-center justify-center transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        {mod.image_url ? (
                          <img src={mod.image_url} alt={mod.name} className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <span className={`material-symbols-outlined !text-3xl transition-all duration-500 ${isPinned ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-50 group-hover:opacity-80 group-hover:text-[var(--accent)] group-hover:scale-110'}`}>{getModIcon(mod, activeGameSchema, t)}</span>
                        )}
                      </div>
                      
                      <div className="flex flex-col flex-1 min-w-0 z-10 justify-center gap-1.5">
                        <h3 className={`text-xs font-black truncate capitalize tracking-tight transition-colors ${isPinned ? 'theme-text-accent' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>{mod.name}</h3>
                        <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest truncate px-2.5 py-0.5 rounded-full glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] w-fit">
                          {mod.category_override || t("label_artifact", "Artifact")}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-center w-8 h-8 shrink-0 z-10 transition-all duration-500">
                        {isPinned ? (
                          <span className="material-symbols-outlined !text-2xl text-[var(--accent)]">{t("icon_check_circle", "check_circle")}</span>
                        ) : (
                          <span className="material-symbols-outlined !text-xl text-[var(--subtext)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] -translate-x-4 group-hover:translate-x-0 transition-all duration-500">{t("icon_push_pin", "push_pin")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 flex justify-center w-full">
                <EmptyState icon={t("icon_search", "search")} title={t("no_match_artifacts", "No Matching Artifacts Found")} minHeightClass="min-h-[200px]" />
              </div>
            )
          ) : activeTab === 'blueprint' ? (
            filteredBlueprints.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBlueprints.map((bp: any) => {
                  const isPinned = mason?.pinned_blueprint_id === bp.id;
                  const bpIcon = t("icon_map", "map");
                  return (
                    <div key={bp.id} onClick={() => { handlePin('blueprint', bp.id); }} className={`relative flex items-center gap-4 p-4 glass-panel border rounded-2xl transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.01] hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group ${isPinned ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_8%,transparent)]'} transform-gpu backface-hidden`}>
                      <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden glass-surface bg-[color-mix(in_srgb,var(--text)_3%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] flex items-center justify-center transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        {bp.image_url ? (
                          <img src={bp.image_url} alt={bp.name} className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <span className={`material-symbols-outlined !text-3xl transition-all duration-500 ${isPinned ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-50 group-hover:opacity-80 group-hover:text-[var(--accent)] group-hover:scale-110'}`}>{bpIcon}</span>
                        )}
                      </div>
                      
                      <div className="flex flex-col flex-1 min-w-0 z-10 justify-center gap-1.5">
                        <h3 className={`text-xs font-black truncate capitalize tracking-tight transition-colors ${isPinned ? 'theme-text-accent' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>{bp.name}</h3>
                        <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest truncate px-2.5 py-0.5 rounded-full glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] w-fit">
                          {t("type_blueprint", "Blueprint")}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-center w-8 h-8 shrink-0 z-10 transition-all duration-500">
                        {isPinned ? (
                          <span className="material-symbols-outlined !text-2xl text-[var(--accent)]">{t("icon_check_circle", "check_circle")}</span>
                        ) : (
                          <span className="material-symbols-outlined !text-xl text-[var(--subtext)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] -translate-x-4 group-hover:translate-x-0 transition-all duration-500">{t("icon_push_pin", "push_pin")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 flex justify-center w-full">
                <EmptyState icon={t("icon_search", "search")} title={t("no_match_blueprints", "No Matching Blueprints Found")} minHeightClass="min-h-[200px]" />
              </div>
            )
          ) : (
            filteredAssets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAssets.map((asset: any) => {
                  const isPinned = mason?.pinned_asset_id === asset.id;
                  const smIcon = asset.asset_type === 'lexicon' ? t("icon_translate", "translate") : asset.asset_type === 'chameleon' ? t("icon_palette", "palette") : t("icon_draw", "draw");
                  return (
                    <div key={asset.id} onClick={() => { handlePin('asset', asset.id); }} className={`relative flex items-center gap-4 p-4 glass-panel border rounded-2xl transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.01] hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group ${isPinned ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_8%,transparent)]'} transform-gpu backface-hidden`}>
                      <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden glass-surface bg-[color-mix(in_srgb,var(--text)_3%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] flex items-center justify-center transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        {asset.image_url ? (
                          <img src={asset.image_url} alt={asset.name} className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <span className={`material-symbols-outlined !text-3xl transition-all duration-500 ${isPinned ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-50 group-hover:opacity-80 group-hover:text-[var(--accent)] group-hover:scale-110'}`}>{smIcon}</span>
                        )}
                      </div>
                      
                      <div className="flex flex-col flex-1 min-w-0 z-10 justify-center gap-1.5">
                        <h3 className={`text-xs font-black truncate capitalize tracking-tight transition-colors ${isPinned ? 'theme-text-accent' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>{asset.name}</h3>
                        <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest truncate px-2.5 py-0.5 rounded-full glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] w-fit">
                          {t(asset.asset_type, asset.asset_type) || asset.asset_type}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-center w-8 h-8 shrink-0 z-10 transition-all duration-500">
                        {isPinned ? (
                          <span className="material-symbols-outlined !text-2xl text-[var(--accent)]">{t("icon_check_circle", "check_circle")}</span>
                        ) : (
                          <span className="material-symbols-outlined !text-xl text-[var(--subtext)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] -translate-x-4 group-hover:translate-x-0 transition-all duration-500">{t("icon_push_pin", "push_pin")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 flex justify-center w-full">
                <EmptyState icon={t("icon_search", "search")} title={t("no_match_assets", "No Matching Assets Found")} minHeightClass="min-h-[200px]" />
              </div>
            )
          )}
        </div>
      </div>
    </SidePanel>
  );
}


