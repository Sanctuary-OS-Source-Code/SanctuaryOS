import { useState } from "react";
import { ModData , getFileLabel, isSupportedExtension, formatDisplayName, getExtensionRegex} from "./shared";
import { ViewHeader } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";

interface CCManagerProps {
  modList: ModData[];
  activePlaySet: { name: string; mods: string[] } | undefined;
  toggleInActiveSet: (name: string) => void;
}

export default function CCManager({ modList, activePlaySet, toggleInActiveSet }: CCManagerProps) {
  const { t } = useLexicon();
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const[searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const activeSetMods = activePlaySet?.mods ||[];

  const ccMods = modList.filter(m =>
    !m.isVirtual &&
    m.type !== "Script" &&
    m.type !== "Animation"
  );

  const filteredCC = ccMods.filter(m => {
    const matchesSearch = (m.displayName || m.name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = activeFilter === "ALL" || m.type === activeFilter;
    return matchesSearch && matchesType;
  });

  const equippedCount = filteredCC.filter(m => activeSetMods.includes(m.name!)).length;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full">
      <ViewHeader
        title={t("cc_title")}
        subtitle={t("cc_subtitle")}
        icon={t("icon_cloud")}
        iconColorClass="text-sky-400 border-sky-500/30"
      >
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("cc_deployed")}</span>
          <span className="text-2xl font-black theme-text-accent">{equippedCount} / {filteredCC.length}</span>
        </div>
      </ViewHeader>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-black/40 backdrop-blur-[3px] border border-white/10 p-4 rounded-[var(--radius)] shadow-inner shrink-0">

        <div className="flex items-center gap-3 theme-glass-panel px-4 py-2 rounded-xl w-full md:w-96">
          <span className="theme-text-accent">{t("_")}</span>
          <input
            type="text"
            placeholder={t("cc_search")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-[var(--text)] text-sm font-bold w-full placeholder:text-[var(--text)]/20"
          />
        </div>

        <div className="flex gap-2">
          {["ALL", ...(useStore.getState().activeGameSchema?.mod_categories?.map((c: any) => c.id) || [])].map((f: string) => {
            const schemaCat = activeGameSchema?.mod_categories?.find((c: any) => c.id === f);
            const label = f === "ALL" ? t("ql_all") : (schemaCat ? t(schemaCat.lexicon_key) : t(`vault_cat_${f.toLowerCase()}`));
            return (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                  ${activeFilter === f
                    ? 'theme-bg-accent text-[var(--bg)] shadow-lg'
                    : 'bg-white/5 border border-white/5 text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:border-white/20'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-20">
        {filteredCC.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50">
            <span className="text-6xl mb-4 grayscale">{t("_")}</span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("cc_no_assets")}</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
            {filteredCC.map((mod: any) => {
              const isEquipped = activeSetMods.includes(mod.name);
              return (
                <div
                  key={mod.hash || mod.name}
                  onClick={() => toggleInActiveSet(mod.name)}
                  className={`relative group cursor-pointer rounded-2xl overflow-hidden border transition-all duration-300 aspect-[3/4] flex flex-col bg-black/40
                    ${isEquipped
                      ? 'theme-border-accent shadow-lg scale-[1.02]'
                      : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'}`}
                >

                  <div className="flex-1 relative w-full bg-black flex items-center justify-center overflow-hidden">
                    {mod.image_url ? (
                      <img src={mod.image_url} alt={t("cover_alt")} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <span className="material-symbols-outlined text-4xl opacity-20 group-hover:opacity-40 transition-opacity">
                        {t(useStore.getState().activeGameSchema?.mod_categories?.find((c: any) => c.id === (mod.type || mod.category_override))?.icon_key || "icon_extension")}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  </div>

                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center border backdrop-blur-[3px] transition-all
                    ${isEquipped ? 'theme-bg-accent text-[var(--bg)] theme-border-accent' : 'bg-black/50 text-transparent border-white/20'}`}>
                    ✓
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col">
                    <span className="text-[10px] theme-text-accent font-black uppercase tracking-widest mb-0.5 truncate drop-shadow-md">
                      {mod.author || t("vlocal") || "UNKNOWN"}
                    </span>
                    <span className="text-xs text-[var(--text)] font-bold truncate drop-shadow-md leading-tight">
                      {mod.displayName || mod.name.replace(getExtensionRegex(useStore.getState().activeGameSchema), '')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
