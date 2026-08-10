import { stripMarkdown, EmptyState, ActionButton } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';

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
        {filteredBlueprints.length === 0 && <EmptyState icon={t("icon_map") || "map"} title={t("no_blueprints") || "NO BLUEPRINTS"} minHeightClass="min-h-[400px]" />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredBlueprints.map((asset: any) => (
            <UniversalCard
              key={asset.id}
              layout="vertical"
              image={asset.image_url ? asset.image_url : undefined}
              icon={!asset.image_url ? t("icon_map") : undefined}
              title={asset.name}
              subtitle={`${mason.name || "UNKNOWN MASON"} • ${(asset.json_data?.artifacts?.length || 0)} ${t("items")}`}
              onClick={() => setSelectedBlueprint(asset)}
              imageOverlay={
                <>
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
                </>
              }
              className="w-full h-full"
              footer={
                <div className="flex items-center justify-start w-full pt-1">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <ActionButton
                      onClick={(e) => { e.stopPropagation(); setSelectedBlueprint(asset); }}
                      variant="primary"
                      icon="download"
                      label={t("update_panel_install")}
                      className="!py-1.5 !px-3 !text-[9px]"
                    />
                  </div>
                </div>
              }
            >
              {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{asset.description}</p>}
            </UniversalCard>
          ))}
        </div>
      </>
    );
  }

  if (activeView === 'LEXICONS') {
    const filteredLexicons = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'lexicon') return false;
      let lang = a.language;
      if (!lang && a.json_data) {
        try {
          const parsed = typeof a.json_data === 'string' ? JSON.parse(a.json_data) : a.json_data;
          lang = parsed.language;
        } catch (e) {}
      }
      lang = lang || "Custom";
      if (modCategory !== "ALL" && lang !== modCategory) return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      return bOutdated - aOutdated;
    });
    return (
      <>
        {filteredLexicons.length === 0 && <EmptyState icon={t("icon_translate") || "translate"} title={t("no_lexicons") || "NO LEXICONS"} minHeightClass="min-h-[400px]" />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredLexicons.map((asset: any) => (
            <UniversalCard
              key={asset.id}
              layout="vertical"
              image={asset.image_url ? asset.image_url : undefined}
              icon={!asset.image_url ? t("icon_translate") : undefined}
              title={asset.name}
              subtitle={mason.name || "UNKNOWN MASON"}
              onClick={() => setActiveAsset({ type: 'lexicon', id: asset.id })}
              imageOverlay={
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                  <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{t("auto_lexicon")} {asset.language || "Custom"}</span>
                </div>
              }
              className="w-full h-full"
              footer={
                <div className="flex items-center justify-start w-full pt-1">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <ActionButton
                      onClick={(e) => {
                        e.stopPropagation();
                        const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                        importLexicon(asset.name, parsed);
                        if (parsed._meta_language) localStorage.setItem("sanctuary_ui_language", parsed._meta_language);
                        if (parsed._meta_version) localStorage.setItem(`sanctuary_lexicon_version_${asset.name}`, parsed._meta_version);
                      }}
                      variant={isInstalled(asset) ? (isOutdated(asset) ? 'primary' : 'glass') : 'success'}
                      icon={isInstalled(asset) ? (isOutdated(asset) ? 'update' : 'refresh') : 'download'}
                      label={isInstalled(asset) ? (isOutdated(asset) ? "UPDATE" : (t("btn_reinstall"))) : (t("update_panel_install"))}
                      className="!py-1.5 !px-3 !text-[9px]"
                    />
                  </div>
                </div>
              }
            >
              {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{stripMarkdown(asset.description)}</p>}
            </UniversalCard>
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
        {filteredChameleons.length === 0 && <EmptyState icon={t("icon_palette") || "palette"} title={t("no_chameleons") || "NO CHAMELEONS"} minHeightClass="min-h-[400px]" />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredChameleons.map((asset: any) => (
            <UniversalCard
              key={asset.id}
              layout="vertical"
              image={asset.image_url ? asset.image_url : undefined}
              icon={!asset.image_url ? t("icon_palette") : undefined}
              title={asset.name}
              subtitle={mason.name || "UNKNOWN MASON"}
              onClick={() => setActiveAsset({ type: 'chameleon', id: asset.id })}
              imageOverlay={
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                  <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{t("type_theme")}</span>
                </div>
              }
              className="w-full h-full"
              footer={
                <div className="flex items-center justify-start w-full pt-1">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <ActionButton
                      onClick={async (e) => {
                        e.stopPropagation();
                        const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                        importTheme(parsed.name || asset.name, parsed);
                        useStore.getState().pushStatus(`Imported ${parsed.name || asset.name} from Cloud`);
                      }}
                      variant={isInstalled(asset) ? (isOutdated(asset) ? 'primary' : 'glass') : 'success'}
                      icon={isInstalled(asset) ? (isOutdated(asset) ? 'update' : 'refresh') : 'download'}
                      label={isInstalled(asset) ? (isOutdated(asset) ? "UPDATE" : (t("btn_reinstall"))) : (t("update_panel_install"))}
                      className="!py-1.5 !px-3 !text-[9px]"
                    />
                  </div>
                </div>
              }
            >
              {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{stripMarkdown(asset.description)}</p>}
            </UniversalCard>
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
        {filteredTemplates.length === 0 && <EmptyState icon={t("icon_draw") || "draw"} title={t("empty_title_templates") || "NO TEMPLATES"} minHeightClass="min-h-[400px]" />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredTemplates.map((asset: any) => (
            <UniversalCard
              key={asset.id}
              layout="vertical"
              image={asset.image_url ? asset.image_url : undefined}
              icon={!asset.image_url ? t("icon_draw") : undefined}
              title={asset.name}
              subtitle={mason.name || "UNKNOWN MASON"}
              onClick={() => setActiveAsset({ type: 'workbench_template', id: asset.id })}
              imageOverlay={
                <div className="absolute top-4 right-4 flex gap-2 z-30">
                  <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{t("type_template")}</span>
                </div>
              }
              className="w-full h-full"
              footer={
                <div className="flex items-center justify-start w-full pt-1">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{asset.downloads || 0} {t("auto_dl")}</span>
                  <div className="flex gap-2 relative z-40">
                    <ActionButton
                      onClick={async (e) => {
                        e.stopPropagation();
                        const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                        if (vaultPath) {
                          const templatesDir = `${vaultPath}\\Data\\Templates`;
                          if (!(await exists(templatesDir))) await importFs.mkdir(templatesDir, { recursive: true });
                          await importFs.writeTextFile(`${templatesDir}\\${asset.name}_template.json`, JSON.stringify(parsed, null, 2));
                          useStore.getState().pushStatus(`Successfully Installed Template: ${asset.name}`);
                          
                          if (setInstalledTemplates) {
                            const entries = await importFs.readDir(templatesDir);
                            const tpls = await Promise.all(
                              entries.filter((en: any) => en.name?.endsWith('.json')).map(async (en: any) => {
                                const content = await importFs.readTextFile(`${templatesDir}\\${en.name}`);
                                return JSON.parse(content);
                              })
                            );
                            setInstalledTemplates(tpls);
                          }
                        }
                      }}
                      variant="success"
                      icon="download"
                      label={t("update_panel_install")}
                      className="!py-1.5 !px-3 !text-[9px]"
                    />
                  </div>
                </div>
              }
            >
              {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{stripMarkdown(asset.description)}</p>}
            </UniversalCard>
          ))}
        </div>
      </>
    );
  }

  return null;
}
