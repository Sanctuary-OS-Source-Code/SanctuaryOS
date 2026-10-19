import { useState, useEffect } from 'react';
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { ActionButton, SidePanel, CustomDropdown, HoverTooltip, HubTabs, FilterTabs, FilterTabButton, PanelHeaderGroup, PanelHeaderButton, ActionPill } from '../shared';

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

  const activeGameSchema = useStore(state => state.activeGameSchema);
  const isSimsGame = `${activeGameSchema?.id || ''} ${activeGameSchema?.name || ''} ${activeGameSchema?.display_name || ''}`.toLowerCase().includes('sims');

  const getLexiconMetadata = (code: string) => {
    const cleanName = (val: string) => val.includes(':') ? val.split(':')[1].trim() : val;

    // Core Built-in OS Lexicons
    if (code === 'en-sanctuary') return { community: 'Sanctuary', language: 'English', name: cleanName(t("lang_sanctuary", "Sanctuary")) };
    if (code === 'en-default') return { community: 'Sanctuary', language: 'English', name: cleanName(t("lang_standard", "Standard English")) };
    if (code === 'en-sims' || code === 'Simlish') {
      const simsMeta = lexiconMeta?.find((m: any) => m.id === code);
      return {
        community: simsMeta?.badge && simsMeta.badge !== 'Sanctuary' ? simsMeta.badge : (activeGameSchema?.display_name || 'The Sims 4'),
        language: simsMeta?.lang || 'English',
        name: simsMeta?.name || cleanName(t("lang_sims", "Simlish"))
      };
    }

    // Community Lexicons (Pulled from Game Spoke DB)
    const meta = lexiconMeta?.find((m: any) => m.id === code);
    if (meta) {
      let badge = meta.badge || 'Community';
      const state = useStore.getState();

      if (badge === 'Sanctuary' && (state.activeGameSchema?.display_name || state.activeGameSchema?.name)) {
        badge = state.activeGameSchema.display_name || state.activeGameSchema.name;
      }
      return { community: badge, language: meta.lang || 'English', name: meta.name || registry?.[code]?._meta_name || code };
    }

    // Imported/Custom JSONs
    return {
      community: registry?.[code]?._meta_badge || activeGameSchema?.display_name || 'Custom',
      language: registry?.[code]?._meta_lang || dbLanguages[code] || 'English',
      name: registry?.[code]?._meta_name || code
    };
  };

  const coreCodes = isSimsGame ? ['en-sanctuary', 'en-default', 'en-sims'] : ['en-sanctuary', 'en-default'];
  const dbCodes = lexiconMeta && lexiconMeta.length > 0 ? lexiconMeta.map((m: any) => m.id) : [];
  const allLexiconCodes = Array.from(new Set([...coreCodes, ...dbCodes, ...Object.keys(registry || {})]))
    .filter(code => isSimsGame || activeLang === code || (code !== 'en-sims' && code !== 'Simlish'));
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

  const renderLexiconCard = (code: string) => {
    const meta = getLexiconMetadata(code);
    const isActive = activeLang === code;
    const isFav = favoriteLexicons.includes(code);

    return (
      <div
        key={code}
        onClick={() => setActiveLang(code)}
        className={`flex flex-col p-4 rounded-2xl glass-panel transition-all shadow-lg hover:shadow-xl active:scale-[0.98] border cursor-pointer group relative ${
          isActive
            ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.2)]'
            : 'border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]'
        }`}
      >
        {isActive && (
          <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_12%,transparent)] to-transparent pointer-events-none" />
        )}

        <div className="flex justify-between items-start mb-3.5 relative z-10">
          <div className="w-8 h-8 rounded-xl shadow-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0 flex items-center justify-center text-[var(--accent)]">
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_translate", "translate")}
            </span>
          </div>

          <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavoriteLexicon(code, e);
              }}
              className={`relative w-7 h-7 rounded-lg transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] backdrop-blur-sm shadow-sm ${
                isFav
                  ? 'text-[var(--accent)] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] drop-shadow-[0_0_5px_currentColor]'
                  : 'text-[var(--subtext)] hover:text-[var(--text)]'
              }`}
            >
              <span
                className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
              >
                {t("icon_star", "star")}
              </span>
            </button>

            {lexiconMeta && lexiconMeta.find((m: any) => m.id === code) === undefined && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDelete === code) {
                    deleteLexicon(code);
                    setConfirmDelete(false);
                  } else {
                    setConfirmDelete(code);
                  }
                }}
                onMouseLeave={() => setConfirmDelete(false)}
                className={`relative w-7 h-7 rounded-lg transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-sm cursor-pointer shadow-sm ${
                  confirmDelete === code
                    ? 'bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border-[var(--danger)] text-[var(--danger)] scale-105 shadow-[0_0_10px_rgba(var(--danger-rgb),0.5)]'
                    : 'hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] theme-text-danger'
                }`}
              >
                <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  {confirmDelete === code ? t("icon_warning", "warning") : t("icon_delete", "delete")}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 relative z-10">
          <span className="text-xs font-black tracking-wide truncate text-[var(--text)]">
            {meta.name}
          </span>
          <div className="flex items-center gap-2 mt-0.5 opacity-90">
            <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[9px] font-black capitalize tracking-wider text-[var(--accent)] truncate border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
              {meta.community}
            </span>
            <span className="text-[10px] font-bold capitalize tracking-wider text-[var(--subtext)] truncate">
              {meta.language}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("lexicon_title", "Language & Lexicon")}
      subtitle={t("lexicon_desc", "Select your interface language and thematic terminology.")}
      icon={t("icon_language", "language")}
      iconColorClass="theme-text-accent"
      widthClass="w-full md:w-[860px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_explore", "explore")}
            tooltip={t("tab_nexus", "Marketplace")}
            onClick={() => { setMarketTab('LEXICONS'); setView('nexus'); onClose(); }}
          />
          <PanelHeaderButton
            icon={t("icon_download", "download")}
            tooltip={t("btn_import", "Import")}
            onClick={handleImportLexicon}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-6 relative z-10 w-full">
        <ActionPill
          searchQuery={lexiconSearch}
          setSearchQuery={setLexiconSearch}
          searchPlaceholder={t("ui_search_lexicons", "Search Lexicons...")}
          primaryPopover={{
            icon: t("icon_tune", "tune"),
            label: t("filters", "Filters"),
            content: (
              <div className="flex flex-col gap-4 w-[280px] p-2">
                <div 
                  onClick={() => setUseGlobalLexicon(!useGlobalLexicon)}
                  className="flex items-center justify-between px-4 glass-surface h-12 rounded-xl border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-inner cursor-pointer transition-all w-full group"
                >
                  <div className="flex flex-col gap-1 pr-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text)]">
                      {useGlobalLexicon ? (t("scope_global", "Global Network")) : (t("scope_workspace", "Local Workspace"))}
                    </span>
                    <span className="text-[8px] text-[var(--subtext)] opacity-70 leading-tight">
                      {useGlobalLexicon ? t("scope_global_desc", "Search all connected communities") : t("scope_workspace_desc_lexicon", "Bound to the active workspace")}
                    </span>
                  </div>
                  <div className={`w-10 h-5 shrink-0 rounded-full p-0.5 flex items-center border transition-all duration-300 ${useGlobalLexicon ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full shadow-md transition-all duration-300 ${useGlobalLexicon ? 'bg-[var(--accent)] translate-x-[18px] shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_60%,transparent)]' : 'bg-[color-mix(in_srgb,var(--text)_40%,transparent)] translate-x-0'}`} />
                  </div>
                </div>
                
                <div className="w-full h-10">
                  <CustomDropdown
                    className="h-full w-full text-xs"
                    value={selectedLibraryLang}
                    options={[
                      { id: null, label: t("all_languages", "All Languages") as string },
                      ...uniqueLanguages.map(lang => ({ id: lang, label: lang }))
                    ]}
                    onChange={(val: any) => setSelectedLibraryLang(val?.[0] ?? null)}
                    placeholder={t("all_languages", "All Languages") as string}
                  />
                </div>
                
                <div className="w-full h-10">
                  <CustomDropdown
                    className="h-full w-full text-xs"
                    value={selectedLibraryCommunity}
                    options={[
                      { id: null, label: t("filter_all", "All") },
                      ...uniqueCommunities.map(community => ({ id: community, label: typeof community === 'string' ? community.toUpperCase() : community }))
                    ]}
                    onChange={(val: any) => setSelectedLibraryCommunity(val?.[0] ?? null)}
                    placeholder={t("filter_all", "All")}
                  />
                </div>
              </div>
            )
          }}
        />

        {favoriteLexicons.length > 0 && (
          <div className="flex flex-col gap-4 w-full z-10">
            <div className="flex items-center gap-3 pl-1">
              <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">{t("icon_keep", "keep")}</span>
              <h3 className="text-xs font-black capitalize tracking-wider text-[var(--text)] drop-shadow-md m-0">{t("installed_lexicons", "Favorite Lexicons")}</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_40%,transparent)] to-transparent" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {favoriteLexicons.map(renderLexiconCard)}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 w-full z-10">
          <div className="flex items-center gap-3 pl-1">
            <span className="material-symbols-outlined text-[var(--subtext)] !text-[16px]">{t("icon_grid_view", "grid_view")}</span>
            <h3 className="text-xs font-black capitalize tracking-wider text-[var(--text)] opacity-85 drop-shadow-md m-0">{t("library_label", "Library")}</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
            {allLexiconCodes
              .filter(code => !favoriteLexicons.includes(code))
              .filter(code => !selectedLibraryLang || getLexiconMetadata(code).language === selectedLibraryLang)
              .filter(code => !selectedLibraryCommunity || getLexiconMetadata(code).community === selectedLibraryCommunity)
              .filter(code => getLexiconMetadata(code).name.toLowerCase().includes(lexiconSearch.toLowerCase()) || code.toLowerCase().includes(lexiconSearch.toLowerCase()))
              .map(renderLexiconCard)}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}



