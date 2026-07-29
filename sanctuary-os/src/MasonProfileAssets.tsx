import { stripMarkdown } from './shared';

export default function MasonProfileAssets({ 
  activeView, 
  marketAssets, 
  modSearch, 
  modCategory, 
  mason, 
  setSelectedBlueprint, 
  setActiveAsset, 
  isInstalled, 
  isOutdated, 
  importLexicon, 
  importTheme, 
  vaultPath, 
  exists, 
  importFs, 
  setInstalledTemplates, 
  getAssetDisplayVersion, 
  useStore, 
  t,
  hidePaid,
  hideEarlyAccess
}: any) {
  if (activeView === 'BLUEPRINTS') {
    const filteredBlueprints = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'blueprint') return false;
      if (hidePaid && a.is_paid) return false;
      if (hideEarlyAccess && a.is_early_access) return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      if (modCategory && modCategory !== 'ALL' && modCategory !== 'all') {
        if (a.json_data?.game_version !== modCategory) return false;
      }
      return true;
    });
    return (
      <>
        {filteredBlueprints.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_blueprints")}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredBlueprints.map((asset: any) => (
            <div key={asset.id} onClick={() => setSelectedBlueprint(asset)} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
              <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                {asset.image_url ? (
                  <img src={asset.image_url} alt={asset.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700" />
                ) : (
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("icon_map")}</span>
                )}
                
                <div className="absolute top-4 left-4 flex flex-col items-start gap-2 z-30">
                  {(asset.is_early_access || asset.is_paid) && (
                    <div className="flex flex-col gap-1.5 items-start">
                      {asset.is_early_access && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[color-mix(in_srgb,#a855f7_15%,transparent)] border border-[color-mix(in_srgb,#a855f7_30%,transparent)] rounded-lg backdrop-blur-sm shadow-md">
                          <span className="material-symbols-outlined !text-[10px] text-[#d8b4fe]">science</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#d8b4fe]">{t("badge_early_access") || "Early Access"}</span>
                        </div>
                      )}
                      {asset.is_paid && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[color-mix(in_srgb,#eab308_15%,transparent)] border border-[color-mix(in_srgb,#eab308_30%,transparent)] rounded-lg backdrop-blur-sm shadow-md">
                          <span className="material-symbols-outlined !text-[10px] text-[#fef08a]">monetization_on</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#fef08a]">{t("badge_paid") || "Paid"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-30">
                  <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[3px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest shadow-lg">
                    {t("type_blueprint")}
                  </span>
                </div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">{asset.name}</h3>
                <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                  {mason.name || "UNKNOWN MASON"} • {(asset.json_data?.artifacts?.length || 0)} {t("items")}
                </p>
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">{asset.description}</p>}
                <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedBlueprint(asset); }} className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105">{t("update_panel_install")}</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (activeView === 'LEXICONS') {
    const filteredLexicons = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'lexicon') return false;
      if (modCategory !== "ALL" && a.lexicon_type !== modCategory) return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      return bOutdated - aOutdated;
    });
    return (
      <>
        {filteredLexicons.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_lexicons")}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredLexicons.map((asset: any) => (
            <div key={asset.id} onClick={() => setActiveAsset({ type: 'lexicon', id: asset.id })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
              <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                {asset.image_url ? (
                  <img src={asset.image_url} alt={asset.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700" />
                ) : (
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("icon_translate")}</span>
                )}
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                  <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{t("auto_lexicon")} {asset.language || "Custom"}</span>
                </div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">{asset.name}</h3>
                <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">{mason.name || "UNKNOWN MASON"}</p>
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">{stripMarkdown(asset.description)}</p>}
                <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                        importLexicon(asset.name, parsed);
                        if (parsed._meta_language) localStorage.setItem("sanctuary_ui_language", parsed._meta_language);
                        if (parsed._meta_version) localStorage.setItem(`sanctuary_lexicon_version_${asset.name}`, parsed._meta_version);
                      }}
                      className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset) ? isOutdated(asset) ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[#10b981] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'}`}
                    >
                      {isInstalled(asset) ? isOutdated(asset) ? "UPDATE" : (t("btn_reinstall")) : (t("update_panel_install"))}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (activeView === 'CHAMELEONS') {
    const filteredChameleons = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'chameleon') return false;
      if (modCategory !== "ALL" && a.theme_mode !== modCategory) return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      return bOutdated - aOutdated;
    });
    return (
      <>
        {filteredChameleons.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_chameleons")}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredChameleons.map((asset: any) => (
            <div key={asset.id} onClick={() => setActiveAsset({ type: 'chameleon', id: asset.id })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
              <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                {asset.image_url ? (
                  <img src={asset.image_url} alt={asset.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700" />
                ) : (
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("icon_palette")}</span>
                )}
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                  <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{t("type_theme")}</span>
                </div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">{asset.name}</h3>
                <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">{mason.name || "UNKNOWN MASON"}</p>
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">{stripMarkdown(asset.description)}</p>}
                <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                        importTheme(parsed.name || asset.name, parsed);
                        useStore.getState().pushStatus(`Imported ${parsed.name || asset.name} from Cloud`);
                      }}
                      className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset) ? isOutdated(asset) ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[#10b981] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'}`}
                    >
                      {isInstalled(asset) ? isOutdated(asset) ? "UPDATE" : (t("btn_reinstall")) : (t("update_panel_install"))}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (activeView === 'TEMPLATES') {
    const filteredTemplates = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'workbench_template') return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      return bOutdated - aOutdated;
    });
    return (
      <>
        {filteredTemplates.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("empty_title_templates")}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredTemplates.map((asset: any) => (
            <div key={asset.id} onClick={() => setActiveAsset({ type: 'workbench_template', id: asset.id })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
              <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("icon_draw")}</span>
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                  <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{t("type_template")}</span>
                </div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">{asset.name}</h3>
                <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">{mason.name || "UNKNOWN MASON"}</p>
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">{stripMarkdown(asset.description)}</p>}
                <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                        if (vaultPath) {
                          const templatesDir = `${vaultPath}\\Data\\Templates`;
                          if (!(await exists(templatesDir))) await importFs.mkdir(templatesDir, { recursive: true });
                          await importFs.writeTextFile(`${templatesDir}\\${asset.name}_template.json`, JSON.stringify(parsed, null, 2));
                          useStore.getState().pushStatus(`Successfully Installed Template: ${asset.name}`);
                          setInstalledTemplates((prev: any) => ({ ...prev, [asset.name]: getAssetDisplayVersion(asset) }));
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset) ? isOutdated(asset) ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[#10b981] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'}`}
                    >
                      {isInstalled(asset) ? isOutdated(asset) ? "UPDATE" : (t("btn_reinstall")) : (t("update_panel_install"))}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return null;
}
