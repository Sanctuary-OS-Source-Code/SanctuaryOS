import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { ViewHeader } from "./shared";
import { useLexicon } from "./LexiconContext";

interface MarketplaceProps {
  ownedHashes: string[];
  onSetStatus: (msg: string) => void;
  onOpenMasonProfile?: (id: string) => void; // <-- Add this
}

export default function Marketplace({ ownedHashes, onSetStatus, onOpenMasonProfile }: MarketplaceProps) {
  const { t } = useLexicon();
  const [results, setResults] = useState<any[]>([]);
  const[loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchMarketplace();
  },[ownedHashes]); 

  async function fetchMarketplace() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("marketplace_discovery")
        .select("*")
        .limit(100);

      if (error) throw error;

      const ownedSet = new Set(ownedHashes);
      const unownedMods = (data ||[]).filter(mod => !ownedSet.has(mod.dna_hash));

      setResults(unownedMods);
    } catch (err: any) {
      onSetStatus(`${t("market_error_prefix")}${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <ViewHeader 
          title={t("market_title")} 
          subtitle={`${t("market_subtitle_prefix")}${results.length}${t("market_subtitle_suffix")}`} 
        >
          <input 
            type="text" 
            placeholder="Search Mods or Masons..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="theme-glass-inner rounded-2xl px-5 py-0 h-12 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent w-[220px]"
          />
        </ViewHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest animate-pulse">
            {t("market_searching")}
          </div>
        ) : results.length > 0 ? (
          results.filter((mod: any) => !searchQuery || mod.name.toLowerCase().includes(searchQuery.toLowerCase()) || (mod.master_author || "").toLowerCase().includes(searchQuery.toLowerCase())).map((mod: any) => (
            <div key={mod.dna_hash} className="group theme-glass-panel p-6 rounded-4xl hover:theme-border-accent transition-all flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 rounded-xl theme-panel-accent flex items-center justify-center text-xl">{t("market_icon_cart")}</div>
                <span className="text-[9px] font-black px-2 py-1 bg-white/5 rounded border border-white/10 text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("market_unacquired")}</span>
              </div>
              
              <div>
                <h3 className="text-lg font-black text-[var(--text)] truncate">{mod.name}</h3>
                <p className="text-[10px] font-bold theme-text-accent uppercase tracking-widest">{mod.master_author || t("market_unknown_creator")}</p>
              </div>

             <button 
  onClick={(e) => {
    e.stopPropagation();
    if (onOpenMasonProfile && mod.mason_id) onOpenMasonProfile(mod.mason_id);
  }}
  className={`text-[10px] font-bold uppercase tracking-widest text-left ${mod.mason_id ? 'theme-text-accent hover:opacity-80 transition-opacity' : 'text-[var(--subtext)] opacity-60 cursor-default'}`}
>
  {mod.master_author || t("market_unknown_creator")}
</button>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center opacity-50">
            <p className="font-black uppercase tracking-widest">{t("market_empty_title")}</p>
            <p className="text-[10px] text-[var(--subtext)] opacity-60 mt-2">{t("market_empty_desc")}</p>
          </div>
        )}
      </div>
    </div>
  );
}