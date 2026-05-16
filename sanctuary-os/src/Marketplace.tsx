import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { ViewHeader } from "./shared";
import { useLexicon } from "./LexiconContext";

interface MarketplaceProps {
  ownedHashes: string[];
  onSetStatus: (msg: string) => void;
  onOpenMasonProfile?: (id: string) => void;
}

export default function Marketplace({ ownedHashes, onSetStatus, onOpenMasonProfile }: MarketplaceProps) {
  const { t } = useLexicon();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchMarketplace();
  },[ownedHashes]); 

  async function fetchMarketplace() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("marketplace_discovery")
        .select("*")
        .limit(1000);

      if (error) throw error;

      const ownedSet = new Set(ownedHashes);
      const unownedMods = (data ||[]).filter(mod => {
        if (ownedSet.has(mod.dna_hash)) return false;
        // Always hide NSFW (1), explicit (2) and malware (3) from marketplace
        if (mod.compliance_tier > 0) return false;
        return true;
      });

      setResults(unownedMods);
      setCurrentPage(1);
    } catch (err: any) {
      onSetStatus(`${t("market_error_prefix")}${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const filteredResults = results.filter((mod: any) => !searchQuery || mod.name.toLowerCase().includes(searchQuery.toLowerCase()) || (mod.master_author || "").toLowerCase().includes(searchQuery.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / itemsPerPage));
  const paginatedResults = filteredResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader 
        title={t("market_title")} 
        subtitle={`${t("market_subtitle_prefix")}${results.length}${t("market_subtitle_suffix")}`} 
      >
        <div className="flex gap-2 items-center">
          <input 
            type="text" 
            placeholder={t("market_search_placeholder")} 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="theme-glass-inner rounded-2xl px-5 py-0 h-12 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent w-[220px]"
          />
          <button
            onClick={fetchMarketplace}
            className="w-12 h-12 rounded-2xl theme-glass-inner flex items-center justify-center text-[var(--text)] hover:theme-bg-accent transition-all shadow-md shrink-0"
          >
            {t("ui_icon_refresh") || "⟳"}
          </button>
        </div>
      </ViewHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
        {loading ? (
          <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest animate-pulse">
            {t("market_searching")}
          </div>
        ) : filteredResults.length > 0 ? (
          <>
            {paginatedResults.map((mod: any) => (
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
            ))}
          </>
        ) : (
          <div className="col-span-full py-20 text-center opacity-50">
            <p className="font-black uppercase tracking-widest">{t("market_empty_title")}</p>
            <p className="text-[10px] text-[var(--subtext)] opacity-60 mt-2">{t("market_empty_desc")}</p>
          </div>
        )}
      </div>

      {totalPages > 1 && !loading && (
        <div className="flex justify-center items-center gap-4 mt-4 mb-20">
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
          >
            {t("nav_prev") || "PREV"}
          </button>
          <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
            {currentPage} / {totalPages}
          </span>
          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
          >
            {t("nav_next") || "NEXT"}
          </button>
        </div>
      )}
    </div>
  );
}