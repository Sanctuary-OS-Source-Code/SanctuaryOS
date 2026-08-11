import { useState, useEffect } from 'react';
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { ActionButton, SidePanel, CustomDropdown, HoverTooltip, SearchBar, HubTabs, FilterTabs, FilterTabButton, ScreenUtilityBar } from '../shared';

export default function LexiconSidePanel({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t, registry, activeLang, setActiveLang, importLexicon, deleteLexicon, lexiconMeta, useGlobalLexicon, setUseGlobalLexicon } = useLexicon();
  const setView = useStore(state => state.setView);
  const setMarketTab = useStore(state => state.setMarketTab);

  const [dbLanguages, setDbLanguages] = useState<Record<string, string>>({});
  const [lexiconSearch, setLexiconSearch] = useState("");
  const [selectedLibraryLang, setSelectedLibraryLang] = useState<string | null>(null);
  const [selectedLibraryCommunity, setSelectedLibraryCommunity] = useState<string | null>(null);
  const [favoriteLexicons, setFavoriteLexicons] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_favorite_lexicons") || '["en-sanctuary", "en-default"]'));
  const [confirmDelete, setConfirmDelete] = useState<string | false>(false);

  useEffect(() => {
    async function fetchLanguages() {
      try {
        const { data } = await supabase.from('nexus_assets').select('name, language').eq('asset_type', 'lexicon');
        if (data) {
          const map = data.reduce((acc: any, curr: any) => {
            if (curr.name && curr.language) acc[curr.name] = curr.language;
            return acc;
          }, {});
          setDbLanguages(map);
        }
      } catch (e) { }
    }
    fetchLanguages();
  }, []);

  const getLexiconMetadata = (code: string) => {
    const cleanName = (val: string) => val.includes(':') ? val.split(':')[1].trim() : val;

    // Core Built-in OS Lexicons
    if (code === 'en-sanctuary') return { community: 'Sanctuary', language: 'English', name: cleanName(t("lang_sanctuary") || "English: Sanctuary") };
    if (code === 'en-default') return { community: 'Sanctuary', language: 'English', name: cleanName(t("lang_standard") || "English: Default") };

    // Community Lexicons (Pulled from DB)
    const meta = lexiconMeta?.find((m: any) => m.id === code);
    if (meta) {
      let badge = meta.badge || 'Community';
      const state = useStore.getState();

      if (badge === 'Sanctuary' && state.activeGameSchema?.display_name) {
        badge = state.activeGameSchema.display_name;
      }
      return { community: badge, language: meta.lang || 'English', name: meta.name };
    }

    // Imported/Custom JSONs
    return { community: 'Custom', language: registry?.[code]?._meta_lang || dbLanguages[code] || 'English', name: code };
  };

  const dbCodes = lexiconMeta ? lexiconMeta.map((m: any) => m.id) : ['en-sanctuary', 'en-default'];
  const allLexiconCodes = Array.from(new Set([...dbCodes, ...Object.keys(registry || {})]));
  const uniqueLanguages = Array.from(new Set(allLexiconCodes.map(code => getLexiconMetadata(code).language)));
  const uniqueCommunities = Array.from(new Set(allLexiconCodes.map(code => getLexiconMetadata(code).community)));

  const toggleFavoriteLexicon = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let updated;
    if (favoriteLexicons.includes(code)) {
      updated = favoriteLexicons.filter((c: string) => c !== code);
    } else {
      updated = [...favoriteLexicons, code];
    }
    setFavoriteLexicons(updated);
    localStorage.setItem("sanctuary_favorite_lexicons", JSON.stringify(updated));
  };

  const handleImportLexicon = async () => {
    try {
      const selected = await open({ filters: [{ name: 'Lexicon', extensions: ['json'] }] });
      if (!selected) return;
      const content = await readTextFile(selected as string);
      const langCode = prompt(t("prompt_lang_code")) || "custom";
      importLexicon(JSON.parse(content), langCode);
    } catch (err) { useStore.getState().pushStatus(`${t("alert_lexicon_failed")}${err}`); }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("lexicon_title")}
      icon="language"
      widthClass="w-[900px]"
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          <ActionButton onClick={() => { setMarketTab('LEXICONS'); setView('nexus'); onClose(); }} label={t("tab_nexus") || "Nexus"} icon="explore" />
          <ActionButton onClick={handleImportLexicon} label={t("btn_import") || "Import"} icon="download" />
        </div>
      }
      noPadding
    >
      <div className="flex flex-col gap-6 p-10 pt-2 h-full min-h-[600px]">
        <div className="flex flex-col gap-4 w-full shrink-0 z-50 mb-2 px-1">
          <div className="w-full h-12">
            <SearchBar
              value={lexiconSearch}
              onChange={setLexiconSearch}
              placeholder={t("ui_search_lexicons") || "Search lexicons..."}
              className="h-full w-full !rounded-2xl"
            />
          </div>

          <div className="flex items-center gap-4 w-full h-10">
            <div className="flex-1 h-full min-w-[200px]">
              <div className="flex h-full w-full items-stretch overflow-hidden glass-panel rounded-xl divide-x divide-white/5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                <button onClick={() => setUseGlobalLexicon(false)} className={`flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${!useGlobalLexicon ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                  {t("scope_workspace") || "Workspace"}
                </button>
                <button onClick={() => setUseGlobalLexicon(true)} className={`flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${useGlobalLexicon ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                  {t("scope_global") || "Global"}
                </button>
              </div>
            </div>
            
            <div className="flex-1 h-full">
              <CustomDropdown
                className="h-full"
                disableTint={true}
                value={selectedLibraryLang}
                options={[
                  { id: null, label: t("all_languages") || "All Languages" },
                  ...uniqueLanguages.map(lang => ({ id: lang, label: lang }))
                ]}
                onChange={(val: any) => setSelectedLibraryLang(val?.[0] ?? null)}
                placeholder={t("all_languages") || "All Languages"}
              />
            </div>
            
            <div className="flex-1 h-full">
              <CustomDropdown
                className="h-full"
                disableTint={true}
                value={selectedLibraryCommunity}
                options={[
                  { id: null, label: "ALL COMMUNITIES" },
                  ...uniqueCommunities.map(community => ({ id: community, label: typeof community === 'string' ? community.toUpperCase() : community }))
                ]}
                onChange={(val: any) => setSelectedLibraryCommunity(val?.[0] ?? null)}
                placeholder="ALL COMMUNITIES"
              />
            </div>
          </div>
        </div>

        {favoriteLexicons.length > 0 && (
          <div className="flex flex-col gap-4 w-full mb-6 z-10">
            <div className="flex items-center gap-3 pl-1 mb-1">
              <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">{t("icon_keep") || "keep"}</span>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("installed_lexicons")}</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_40%,transparent)] to-transparent" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {favoriteLexicons.map(code => (
                <div
                  key={code}
                  onClick={() => setActiveLang(code)}
                  className={`flex flex-col p-3 rounded-xl glass-panel transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 border cursor-pointer group relative overflow-hidden ${activeLang === code
                      ? 'border-[var(--accent)] bg-[var(--accent)]/[10%] shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]'
                      : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'
                    }`}
                >
                  {activeLang === code && <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent pointer-events-none" />}

                  <div className="flex justify-start items-start mb-3 relative z-10">
                    <div className="w-6 h-6 rounded-full shadow-md border border-[var(--accent)]/[40%] bg-[var(--accent)]/[10%] shrink-0 flex items-center justify-center text-[var(--accent)]">
                      <span className="material-symbols-outlined !text-[12px]">{t("icon_translate") || "translate"}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteLexicon(code, e); }}
                        className={`relative w-6 h-6 rounded-full transition-all bg-black/40 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] backdrop-blur-sm shadow-md ${favoriteLexicons.includes(code)
                            ? 'text-[var(--accent)] border-[var(--accent)] bg-[var(--accent)]/[10%] drop-shadow-[0_0_5px_currentColor]'
                            : 'text-[var(--subtext)] hover:text-white'
                          }`}
                      >
                        <span className="material-symbols-outlined !text-[12px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontVariationSettings: favoriteLexicons.includes(code) ? "'FILL' 1" : "'FILL' 0" }}>{t("icon_star") || "star"}</span>
                      </button>

                      {lexiconMeta && lexiconMeta.find((m: any) => m.id === code) === undefined && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirmDelete === code) { deleteLexicon(code); setConfirmDelete(false); }
                            else { setConfirmDelete(code); }
                          }}
                          onMouseLeave={() => setConfirmDelete(false)}
                          className={`relative w-6 h-6 rounded-full transition-all bg-black/40 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-sm cursor-pointer shadow-md ${confirmDelete === code ? 'bg-red-500/[30%] border-[var(--danger)] text-[var(--danger)] scale-110 shadow-[0_0_10px_rgba(var(--danger-rgb),0.5)]' : 'hover:bg-red-500/10 hover:border-red-500/50 theme-text-danger'}`}
                        >
                          <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{confirmDelete === code ? t("icon_warning") || 'warning' : t("icon_delete") || 'delete'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5 relative z-10">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] truncate ${activeLang === code ? "text-[var(--text)]" : "text-[var(--text)]"}`}>{getLexiconMetadata(code).name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5 opacity-80">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/[15%] text-[7px] font-black uppercase tracking-widest text-[var(--accent)] truncate border border-[var(--accent)]/[30%]">
                        {getLexiconMetadata(code).community}
                      </span>
                      <span className="text-[7px] font-bold uppercase tracking-widest text-[var(--subtext)] truncate">
                        {getLexiconMetadata(code).language}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 w-full z-10">
          <div className="flex items-center gap-3 pl-1 mb-1">
            <span className="material-symbols-outlined text-[var(--subtext)] !text-[16px]">{t("icon_grid_view") || "grid_view"}</span>
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)] opacity-80 drop-shadow-md">{t("library_label")}</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>

              <div className="grid grid-cols-3 gap-3 w-full">
                {allLexiconCodes
                  .filter(code => !favoriteLexicons.includes(code))
                  .filter(code => !selectedLibraryLang || getLexiconMetadata(code).language === selectedLibraryLang)
                  .filter(code => !selectedLibraryCommunity || getLexiconMetadata(code).community === selectedLibraryCommunity)
                  .filter(code => getLexiconMetadata(code).name.toLowerCase().includes(lexiconSearch.toLowerCase()) || code.toLowerCase().includes(lexiconSearch.toLowerCase()))
                  .map(code => (
                    <div
                      key={code}
                      onClick={() => setActiveLang(code)}
                      className={`flex flex-col p-3 rounded-xl glass-panel transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 border cursor-pointer group relative overflow-hidden ${activeLang === code
                          ? 'border-[var(--accent)] bg-[var(--accent)]/[10%] shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]'
                          : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'
                        }`}
                    >
                      {activeLang === code && <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent pointer-events-none" />}

                      <div className="flex justify-start items-start mb-3 relative z-10">
                        <div className="w-6 h-6 rounded-full shadow-md border border-[var(--accent)]/[40%] bg-[var(--accent)]/[10%] shrink-0 flex items-center justify-center text-[var(--accent)]">
                          <span className="material-symbols-outlined !text-[12px]">{t("icon_translate") || "translate"}</span>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavoriteLexicon(code, e); }}
                            className={`relative w-6 h-6 rounded-full transition-all bg-black/40 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] backdrop-blur-sm shadow-md ${favoriteLexicons.includes(code)
                                ? 'text-[var(--accent)] border-[var(--accent)] bg-[var(--accent)]/[10%] drop-shadow-[0_0_5px_currentColor]'
                                : 'text-[var(--subtext)] hover:text-white'
                              }`}
                          >
                            <span className="material-symbols-outlined !text-[12px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontVariationSettings: favoriteLexicons.includes(code) ? "'FILL' 1" : "'FILL' 0" }}>{t("icon_star") || "star"}</span>
                          </button>

                          {lexiconMeta && lexiconMeta.find((m: any) => m.id === code) === undefined && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirmDelete === code) { deleteLexicon(code); setConfirmDelete(false); }
                                else { setConfirmDelete(code); }
                              }}
                              onMouseLeave={() => setConfirmDelete(false)}
                              className={`relative w-6 h-6 rounded-full transition-all bg-black/40 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-sm cursor-pointer shadow-md ${confirmDelete === code ? 'bg-red-500/[30%] border-[var(--danger)] text-[var(--danger)] scale-110 shadow-[0_0_10px_rgba(var(--danger-rgb),0.5)]' : 'hover:bg-red-500/10 hover:border-red-500/50 theme-text-danger'}`}
                            >
                              <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{confirmDelete === code ? t("icon_warning") || 'warning' : t("icon_delete") || 'delete'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5 relative z-10">
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] truncate ${activeLang === code ? "text-[var(--text)]" : "text-[var(--text)]"}`}>{getLexiconMetadata(code).name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5 opacity-80">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/[15%] text-[7px] font-black uppercase tracking-widest text-[var(--accent)] truncate border border-[var(--accent)]/[30%]">
                            {getLexiconMetadata(code).community}
                          </span>
                          <span className="text-[7px] font-bold uppercase tracking-widest text-[var(--subtext)] truncate">
                            {getLexiconMetadata(code).language}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
    </SidePanel>
  );
}
