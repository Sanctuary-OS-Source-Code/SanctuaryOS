import { useState, useEffect } from 'react';
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { TabContainer } from './shared';
import { CustomDropdown } from '../shared';

const standardButtonClass = "px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center justify-center gap-3 hover:bg-white/5";

export default function LexiconTab() {
  const { t, registry, activeLang, setActiveLang, importLexicon, deleteLexicon, lexiconMeta } = useLexicon();
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
    <TabContainer
      title={t("lexicon_title")}
      icon="language"
      actions={
        <>
          <button onClick={() => { setMarketTab('LEXICONS'); setView('nexus'); }} className={standardButtonClass}>{t("btn_browse")}</button>
          <button onClick={handleImportLexicon} className={standardButtonClass}>{t("btn_import")}</button>
        </>
      }
    >
      <div className="flex flex-col gap-12">

        <div className="flex flex-col gap-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("installed_lexicons")}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
            {favoriteLexicons.map(code => (
              <button 
                key={code} 
                onClick={() => setActiveLang(code)} 
                className={`p-6 rounded-[var(--radius)] border transition-all text-left flex justify-between items-center group relative backdrop-blur-xl shadow-lg ${activeLang === code ? 'theme-border-accent' : 'theme-glass-panel opacity-80 hover:opacity-100'}`}
                style={activeLang === code ? {
                  backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  boxShadow: '0 0 30px rgba(var(--accent-rgb), 0.2)'
                } : undefined}
              >
                <div className="flex flex-col gap-1 pr-4 break-words">
                  <span className={`text-[12px] font-black uppercase tracking-[0.2em] mb-1 ${activeLang === code ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{getLexiconMetadata(code).name}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[8px] font-black uppercase tracking-widest text-[var(--text)] opacity-80">{getLexiconMetadata(code).language}</span>
                    <span className="px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--accent)] opacity-90">{getLexiconMetadata(code).community}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div 
                    onClick={(e) => toggleFavoriteLexicon(code, e)} 
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${favoriteLexicons.includes(code) ? 'theme-border-accent shadow-sm hover:scale-110' : 'border border-white/5 bg-white/5 text-[var(--subtext)] opacity-40 hover:opacity-100 hover:theme-text-accent'}`}
                    style={favoriteLexicons.includes(code) ? {
                      backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                      color: 'var(--accent)'
                    } : undefined}
                  >
                    <span className="material-symbols-outlined !text-[16px]">star</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6 mt-16 pt-12 border-t border-white/5">
          <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-2 flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl theme-text-accent">{t("icon_menu_book")}</span>
            {t("library")}
          </h3>

          <div className="flex items-center gap-4 w-full mt-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={lexiconSearch}
                onChange={e => setLexiconSearch(e.target.value)}
                placeholder={t("ui_search_lexicons") || "Search lexicons..."}
                className="w-full theme-glass-panel rounded-2xl px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)] outline-none focus:theme-border-accent transition-all shadow-inner"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 opacity-50 text-xl material-symbols-outlined">{t("icon_search")}</span>
            </div>

            <div className="w-[220px] shrink-0">
              <CustomDropdown
                value={selectedLibraryLang}
                options={[
                  { value: null, label: t("all_languages") || "All Languages" },
                  ...uniqueLanguages.map(lang => ({ value: lang, label: lang }))
                ]}
                onChange={setSelectedLibraryLang}
                placeholder={t("all_languages") || "All Languages"}
                disableTint={true}
              />
            </div>

            <div className="w-[220px] shrink-0">
              <CustomDropdown
                value={selectedLibraryCommunity}
                options={[
                  { value: null, label: "ALL COMMUNITIES" },
                  ...uniqueCommunities.map(community => ({ value: community, label: typeof community === 'string' ? community.toUpperCase() : community }))
                ]}
                onChange={setSelectedLibraryCommunity}
                placeholder="ALL COMMUNITIES"
                disableTint={true}
              />
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8 mt-6">
            {allLexiconCodes
              .filter(code => !favoriteLexicons.includes(code))
              .filter(code => !selectedLibraryLang || getLexiconMetadata(code).language === selectedLibraryLang)
              .filter(code => !selectedLibraryCommunity || getLexiconMetadata(code).community === selectedLibraryCommunity)
              .filter(code => getLexiconMetadata(code).name.toLowerCase().includes(lexiconSearch.toLowerCase()) || code.toLowerCase().includes(lexiconSearch.toLowerCase()))
              .map(code => (
                <div 
                  key={code} 
                  className={`p-6 rounded-[var(--radius)] border transition-all flex justify-between items-center group relative cursor-pointer backdrop-blur-xl shadow-lg ${activeLang === code ? 'theme-border-accent' : 'theme-glass-panel opacity-80 hover:opacity-100'}`} 
                  onClick={() => setActiveLang(code)}
                  style={activeLang === code ? {
                    backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                    boxShadow: '0 0 30px rgba(var(--accent-rgb), 0.2)'
                  } : undefined}
                >
                  <div className="flex flex-col gap-1 pr-4 break-words">
                    <span className={`text-[12px] font-black uppercase tracking-widest mb-1 ${activeLang === code ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{getLexiconMetadata(code).name}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[8px] font-black uppercase tracking-widest text-[var(--text)] opacity-80">{getLexiconMetadata(code).language}</span>
                      <span className="px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--accent)] opacity-90">{getLexiconMetadata(code).community}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button 
                      onClick={(e) => toggleFavoriteLexicon(code, e)} 
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${favoriteLexicons.includes(code) ? 'theme-border-accent shadow-sm hover:scale-110' : 'border border-white/5 bg-white/5 text-[var(--subtext)] opacity-40 hover:opacity-100 hover:theme-text-accent'}`}
                      style={favoriteLexicons.includes(code) ? {
                        backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        color: 'var(--accent)'
                      } : undefined}
                    >
                      <span className="material-symbols-outlined !text-[16px]">star</span>
                    </button>
                    {lexiconMeta && lexiconMeta.find((m: any) => m.id === code) === undefined && (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (confirmDelete === code) { deleteLexicon(code); setConfirmDelete(false); }
                          else { setConfirmDelete(code); }
                        }} 
                        onMouseLeave={() => setConfirmDelete(false)}
                        className={`p-2 rounded-full text-sm transition-all shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 ${confirmDelete === code ? 'bg-red-500/20 text-red-500 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'hover:bg-red-500/20 theme-text-danger'}`}
                      >
                        <span className="material-symbols-outlined !text-lg">{confirmDelete === code ? t("icon_warning") || 'warning' : t("icon_delete")}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </TabContainer>
  );
}
