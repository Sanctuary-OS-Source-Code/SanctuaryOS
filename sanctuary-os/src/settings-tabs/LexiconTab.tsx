import { useState, useEffect } from 'react';
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { TabContainer } from './shared';

const standardButtonClass = "px-6 py-3 rounded-xl theme-glass-panel text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-[inset_0_0_20px_rgba(255,255,255,0.02),0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1),0_4px_15px_rgba(var(--accent-rgb),0.2)] hover:border-[var(--accent)]/50 hover:scale-105 active:scale-95 border border-white/5 flex items-center justify-center gap-2";

export default function LexiconTab() {
  const { t, registry, activeLang, setActiveLang, importLexicon, deleteLexicon } = useLexicon();
  const setView = useStore(state => state.setView);
  const setMarketTab = useStore(state => state.setMarketTab);

  const [dbLanguages, setDbLanguages] = useState<Record<string, string>>({});
  const [lexiconSearch, setLexiconSearch] = useState("");
  const [selectedLibraryLang, setSelectedLibraryLang] = useState<string | null>(null);
  const [favoriteLexicons, setFavoriteLexicons] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_favorite_lexicons") || '["en-sanctuary", "en-default", "en-sims", "de-default"]'));

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
    if (code === 'en-sanctuary') return { language: 'English', name: cleanName(t("lang_sanctuary") || "English: Sanctuary") };
    if (code === 'en-default') return { language: 'English', name: cleanName(t("lang_standard") || "English: Default") };
    if (code === 'en-sims') return { language: 'English', name: cleanName(t("lang_sims") || "English: Sims Friendly") };
    if (code === 'de-default') return { language: 'German', name: cleanName(t("lang_german") || "German: Default") };
    return { language: registry?.[code]?._meta_language || dbLanguages[code] || 'Custom', name: cleanName(code) };
  };

  const allLexiconCodes = Array.from(new Set(['en-sanctuary', 'en-default', 'en-sims', 'de-default', ...Object.keys(registry || {})]));
  const uniqueLanguages = Array.from(new Set(allLexiconCodes.map(code => getLexiconMetadata(code).language)));

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
          <button onClick={handleImportLexicon} className={standardButtonClass}>{t("settings_btn_import")}</button>
        </>
      }
    >
      <div className="flex flex-col gap-12">

        <div className="flex flex-col gap-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("installed_lexicons")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                <div className="flex flex-col gap-2 pr-4 break-words">
                  <span className={`text-[12px] font-black uppercase tracking-[0.2em] ${activeLang === code ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{getLexiconMetadata(code).name}</span>
                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{getLexiconMetadata(code).language}</span>
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

        <div className="flex flex-col gap-6 mt-8 pt-10 border-t border-white/5">
          <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-2 flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl theme-text-accent">{t("icon_menu_book")}</span>
            {t("library")}
          </h3>

          <div className="flex gap-2 w-full overflow-x-auto accent-scrollbar pb-2">
            <button onClick={() => setSelectedLibraryLang(null)} className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap transition-all ${!selectedLibraryLang ? 'theme-glass-inner theme-border-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'theme-glass-inner border border-white/5 hover:theme-border-accent hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] text-[var(--text)] opacity-70 hover:opacity-100'}`}>
              {t("all_languages")}
            </button>
            {uniqueLanguages.map(lang => (
              <button key={lang} onClick={() => setSelectedLibraryLang(lang)} className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap transition-all ${selectedLibraryLang === lang ? 'theme-glass-inner theme-border-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'theme-glass-inner border border-white/5 hover:theme-border-accent hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] text-[var(--text)] opacity-70 hover:opacity-100'}`}>
                {lang}
              </button>
            ))}
          </div>

          <div className="relative mt-2">
            <input
              type="text"
              value={lexiconSearch}
              onChange={e => setLexiconSearch(e.target.value)}
              placeholder={t("ui_search_lexicons")}
              className="w-full theme-glass-panel rounded-2xl px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)] outline-none focus:theme-border-accent transition-all shadow-inner"
            />
            <span className="absolute right-6 top-1/2 -translate-y-1/2 opacity-50 text-xl material-symbols-outlined">{t("icon_search")}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-4">
            {allLexiconCodes
              .filter(code => !favoriteLexicons.includes(code))
              .filter(code => !selectedLibraryLang || getLexiconMetadata(code).language === selectedLibraryLang)
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
                  <div className="flex flex-col gap-2 pr-4 break-words">
                    <span className={`text-[12px] font-black uppercase tracking-widest ${activeLang === code ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{getLexiconMetadata(code).name}</span>
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{getLexiconMetadata(code).language}</span>
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
                    {code !== 'en-sanctuary' && code !== 'en-default' && code !== 'en-sims' && code !== 'de-default' && (
                      <button onClick={(e) => { e.stopPropagation(); deleteLexicon(code); }} className="p-2 rounded-full hover:bg-red-500/20 text-sm theme-text-danger shadow-sm transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="material-symbols-outlined !text-lg">{t("icon_delete")}</span>
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
