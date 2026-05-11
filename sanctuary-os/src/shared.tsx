import { useState, useEffect } from "react";
export interface ModData {
  name: string;
  physical_path?: string;
  hash: string;
  id?: string;
  status: string;
  status_reason?: string;
  updated_at?: string;
  created_at?: string;
  compatible_versions?: string[];
  color: string;
  displayName?: string;
  author?: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  category?: string;
  family_slug?: string | null;
  type?: string; 
  bondedTo?: string | null;
  relationshipType?: 'twin' | 'addon' | 'flavor' | 'set_item' | 'requirement' | 'beta' | null;
  requires?: string[];
  isSynced?: boolean;
  conflicts?: string[];
  isVirtual?: boolean;
  flavors?: any[]; 
  dbId?: string | null;
  isParent?: boolean;
  parentId?: string | null;
  familyId?: string | null;
  version?: string;
  requirements?: string[];
  flavorGroupId?: string | null;
  isFlavorFolder?: boolean;
  flavorGroupName?: string | null;
  invisibleRivals?: string[];
  setId?: string | null; 
  isCCSet?: boolean;
  allow_write?: boolean; 
  compliance_tier?: number;
}

export const formatDisplayName = (name: string) => {
  return name.replace(/\.(package|ts4script)$/i, "").replace(/_/g, " ");
};

export const DLC_MAP: Record<string, string> = {
  "EP01": "Get to Work", "EP02": "Get Together", "EP03": "City Living", "EP04": "Cats & Dogs",
  "EP05": "Seasons", "EP06": "Get Famous", "EP07": "Island Living", "EP08": "Discover University",
  "EP09": "Eco Lifestyle", "EP10": "Snowy Escape", "EP11": "Cottage Living", "EP12": "High School Years",
  "EP13": "Growing Together", "EP14": "Horse Ranch", "EP15": "For Rent", "EP16": "Lovestruck", "EP17": "Life and Death",
  "GP01": "Outdoor Retreat", "GP02": "Spa Day", "GP03": "Dine Out", "GP04": "Vampires",
  "GP05": "Parenthood", "GP06": "Jungle Adventure", "GP07": "StrangerVille", "GP08": "Realm of Magic",
  "GP09": "Star Wars: Journey to Batuu", "GP10": "Dream Home Decorator", "GP11": "My Wedding Stories", "GP12": "Werewolves",
  "SP01": "Luxury Party Stuff", "SP02": "Perfect Patio Stuff", "SP03": "Cool Kitchen Stuff", "SP04": "Spooky Stuff",
  "SP05": "Movie Hangout Stuff", "SP06": "Romantic Garden Stuff", "SP07": "Kids Room Stuff", "SP08": "Backyard Stuff",
  "SP09": "Vintage Glamour Stuff", "SP10": "Bowling Night Stuff", "SP11": "Fitness Stuff", "SP12": "Toddler Stuff",
  "SP13": "Laundry Day Stuff", "SP14": "My First Pet Stuff", "SP15": "Moschino Stuff", "SP16": "Tiny Living Stuff",
  "SP17": "Nifty Knitting Stuff", "SP18": "Paranormal Stuff", "SP46": "Home Chef Hustle Stuff", "SP49": "Crystal Creations Stuff"
};

export const mapDlcCode = (code: string) => {
  const baseCode = code.split(' ')[0].toUpperCase();
  return DLC_MAP[baseCode] || code;
};

export function ViewHeader({ title, subtitle, children }: any) {
  return (
    <header className="flex w-full justify-between items-start mb-10 shrink-0">
      <div className="flex flex-col gap-3 items-start text-left flex-1">
        <h1 className="text-4xl font-black tracking-tighter uppercase leading-tight m-0 text-left w-full text-[var(--text)]">
          {title}
        </h1>
        <p className="font-black tracking-[0.4em] text-[10px] uppercase opacity-70 m-0 mt-1 text-left w-full text-[var(--subtext)] drop-shadow-sm">
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-4 shrink-0 pl-6 min-h-[3rem]">
        {children}
      </div>
    </header>
  );
}

export function ModSearchDropdown({ modList, onSelect, placeholder, selectedItem, onClear }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = (modList || []).filter((m: any) => 
    !query || 
    m.name.toLowerCase().includes(query.toLowerCase()) || 
    m.displayName?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);
  return (
    <div className={`relative w-full ${isOpen ? 'z-[6000]' : ''}`}>
      <div className="relative">
        <input 
          type="text"
          value={selectedItem ? (selectedItem.displayName || selectedItem.name) : query}
          onChange={(e) => { if (!selectedItem) setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => { if (!selectedItem) setIsOpen(true); }}
          placeholder={placeholder}
          readOnly={!!selectedItem}
          className="w-full theme-glass-panel rounded-2xl px-6 py-4 text-[var(--text)] text-xs font-bold focus:outline-none border border-white/10 focus:theme-border-accent transition-all shadow-md"
        />
        {selectedItem ? (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold" onClick={onClear}>
            ✕
          </button>
        ) : (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? "▲" : "▼"}
          </button>
        )}
      </div>
      {isOpen && !selectedItem && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl shadow-2xl z-[6000] overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
          {results.map((m: any) => (
            <button
              key={m.hash || m.name}
              onClick={() => { onSelect(m); setQuery(""); setIsOpen(false); }}
              className="w-full text-left px-5 py-3 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col gap-0.5"
            >
              <span className="text-[11px] font-black text-[var(--text)] uppercase">{m.displayName || m.name.split('/').pop()}</span>
              <span className="text-[8px] font-mono text-[var(--subtext)] opacity-60">{m.author || 'UNKNOWN'}</span>
            </button>
          ))}
          {results.length === 0 && <div className="p-5 text-center text-[10px] text-[var(--subtext)] font-bold uppercase">No Signatures Found</div>}
        </div>
      )}
      {isOpen && !selectedItem && <div className="fixed inset-0 z-[5999]" onClick={() => setIsOpen(false)} />}
    </div>
  );
}

export function StatTile({ label, value, icon, color, onClick }: any) {
  return (
    <div onClick={onClick} className={`group cursor-pointer ${color || 'theme-glass-panel'} border p-6 rounded-3xl shadow-xl transition-all duration-300 hover:bg-white/10 hover:scale-[1.03] active:scale-95`}>
      <div className="flex justify-between items-start mb-4"><span className="text-3xl">{icon}</span><div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-[var(--text)] text-xs">{"->"}</span></div></div>
      <h3 className="text-[var(--text)] opacity-80 text-xs font-bold uppercase tracking-widest mb-1">{label}</h3>
      <div className={`text-4xl font-black text-[var(--text)] tracking-tighter`}>{value}</div>
    </div>
  );
}

export function CustomDropdown({ value, options, onChange }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o: any) => String(o.id) === String(value)) || options[0];

  return (
    <div className="relative w-full">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full p-4 rounded-2xl border border-white/10 theme-glass-inner outline-none transition-all shadow-inner flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--text)] focus:theme-border-accent group hover:bg-white/5 relative z-[10]">
        <span>{selected?.label || "Select..."}</span>
        <span className="text-[var(--subtext)] opacity-60 text-[10px] group-hover:text-[var(--text)] transition-colors">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[9999] animate-in fade-in slide-in-from-top-2 max-h-60 overflow-y-auto custom-scrollbar">
            {options.map((opt: any) => (
              <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className="w-full text-left px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/10 text-[var(--text)] border-b border-white/5 last:border-0 flex items-center hover:theme-text-accent">
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { supabase } from "./supabase";

export function GameVersionMultiSelect({ selectedVersions, onChange }: { selectedVersions: string[], onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    async function fetchVersions() {
      const { data } = await supabase.from('game_versions').select('version').order('version', { ascending: false });
      if (data) setVersions(data);
    }
    fetchVersions();
  }, []);

  const toggleVersion = (v: string) => {
    if (selectedVersions.includes(v)) onChange(selectedVersions.filter(ver => ver !== v));
    else onChange([...selectedVersions, v]);
  };

  const filtered = versions.filter(v => v.version && v.version.includes(query)).slice(0, 10);

  return (
    <div className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`}>
      <div className="flex flex-wrap gap-1 mb-2">
        {selectedVersions.map(v => (
          <span key={v} className="px-2 py-1 bg-white/10 rounded-lg text-[9px] font-mono flex items-center gap-1">{v} <button type="button" onClick={() => toggleVersion(v)} className="text-red-400 hover:text-red-300">?</button></span>
        ))}
      </div>
      <input placeholder="Search versions..." value={query} onChange={e => { setQuery(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} className="w-full bg-transparent border-b border-white/20 text-center text-[10px] font-mono text-[var(--text)] uppercase focus:outline-none focus:border-white transition-all placeholder:opacity-30 pb-1" />
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full mt-1 left-0 right-0 bg-[var(--sidebar)] border border-white/10 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
            {filtered.map(v => (
              <button key={v.version} type="button" onClick={() => { toggleVersion(v.version); setQuery(""); }} className="w-full text-left px-4 py-2 hover:bg-white/10 text-[10px] font-mono flex justify-between">
                <span>{v.version}</span>
                {selectedVersions.includes(v.version) && <span className="text-emerald-400">?</span>}
              </button>
            ))}
            {query && !versions.some(v => v.version === query) && (
              <button type="button" onClick={() => { toggleVersion(query); setQuery(""); }} className="w-full text-left px-4 py-2 hover:bg-white/10 text-[10px] font-mono text-emerald-400">
                + Add "{query}"
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

