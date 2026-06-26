import { useLexicon } from "./LexiconContext";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export const standardButtonClass = "px-8 py-4 rounded-[1.5rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardPrimaryButtonClass = "px-8 py-4 rounded-[1.5rem] theme-bg-accent text-white text-xs font-black uppercase tracking-[0.2em] transition-all hover:brightness-110 hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.4)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardSuccessButtonClass = "px-8 py-4 rounded-[1.5rem] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--success)_20%,transparent)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardDangerButtonClass = "px-8 py-4 rounded-[1.5rem] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--danger)_20%,transparent)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardAccentGlassButtonClass = "px-8 py-4 rounded-[1.5rem] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";

export const deriveHumanReadableVersion = (path: string | undefined | null, fallbackHash: string | undefined | null, t?: (key: string) => string) => {
    if (!path) return fallbackHash ? `v.DNA-${fallbackHash.substring(0, 7).toUpperCase()}` : (t?.("shared_version_unknown") || "v.Unknown");
    
    const tsMatch = path.match(/[/\\]v\.(\d{10})[/\\]/i) || path.match(/^v\.(\d{10})$/i) || path.match(/[/\\]v\.(\d{10})$/i);
    let extractedVersion = "";

    if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1]) * 1000);
        extractedVersion = `v.${d.getFullYear()}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')}-${d.getHours().toString().padStart(2,'0')}${d.getMinutes().toString().padStart(2,'0')}`;
    } else {
        const parts = path.split(/[/\\]/);
        extractedVersion = parts.length > 1 ? parts[parts.length - 2] : parts[0].replace(/\.(package|ts4script)$/i, '');
    }

    if (!extractedVersion.match(/v\.|202\d|\d+\.\d+/i) && fallbackHash) {
        return `${extractedVersion} (DNA-${fallbackHash.substring(0, 5).toUpperCase()})`;
    }

    return extractedVersion;
};
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
  folder_structure?: any[];
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
  mtime?: number;
  isLocalOverride?: boolean;
}

export const formatDisplayName = (name: string, t?: (key: string) => string) => {
  if (!name) return t?.("shared_unknown_artifact") || "Unknown Artifact";
  const rawName = String(name).split(/[\\/]/).pop() || "";
  return rawName.replace(/\.(package|ts4script)$/i, "").replace(/_/g, " ");
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

export const loadDLCMap = async () => {
  try {
    const { data } = await supabase.from('dlc_registry').select('id, name');
    if (data && data.length > 0) {
       for (const key of Object.keys(DLC_MAP)) {
           delete DLC_MAP[key];
       }
       data.forEach((d: any) => {
           DLC_MAP[d.id] = d.name;
       });
    }
  } catch(e) {
    console.error("Failed to load DLC map from DB", e);
  }
};

export const mapDlcCode = (code: string) => {
  let baseCode = code.split(' ')[0].toUpperCase();
  baseCode = baseCode.replace(/^([A-Z]+)(\d)$/, '$10$2');
  return DLC_MAP[baseCode] || code;
};

export const isVersionMatch = (reqs: string[] | string, userVer: string) => {
  if (!reqs || reqs.length === 0) return true;
  if (typeof reqs === 'string') {
    if (reqs.includes('ALL') || reqs.includes('ANY') || reqs.includes('Unknown') || reqs.includes('UNKNOWN')) return true;
  } else {
    if (reqs.includes('ALL') || reqs.includes('ANY') || reqs.includes('Unknown') || reqs.includes('UNKNOWN')) return true;
  }
  if (!userVer) return true;
  const userVerArray = typeof userVer === 'string' ? userVer.split(',').map(s => s.replace(/^V\.?/i, '').trim()) : [userVer];
  const reqArray = typeof reqs === 'string' ? reqs.split(',').map(s => s.trim()) : reqs;

  return reqArray.some(req => {
    if (!req) return false;
    const cleanReq = req.replace(/^V\.?/i, '').trim();
    if (cleanReq.toLowerCase() === 'unknown' || cleanReq.toLowerCase() === 'any' || cleanReq.toLowerCase() === 'all') return true;
    return userVerArray.some(uv => uv === cleanReq || uv.startsWith(cleanReq + "."));
  });
};

export const getHighestVersion = (reqs: string[] | string) => {
    if (!reqs || reqs.length === 0) return "Unknown";
    if (reqs.includes("ALL")) return "ALL";
    const reqArray = typeof reqs === 'string' ? reqs.split(',').map(s => s.trim()) : reqs;
    const flatReqs = reqArray.flatMap(r => r.split(',').map(s => s.trim()));
    const sorted = [...flatReqs].sort((a, b) => {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        for(let i=0; i<Math.max(partsA.length, partsB.length); i++) {
            const valA = partsA[i] || 0;
            const valB = partsB[i] || 0;
            if (valA !== valB) return valB - valA;
        }
        return 0;
    });
    return sorted[0];
};

export function ViewHeader({ title, subtitle, icon, iconColorClass = "bg-gradient-to-br from-blue-500 to-blue-700", children }: any) {
  return (
    <header className="flex flex-col xl:flex-row w-full justify-between items-start mb-10 shrink-0 gap-6">
      <div className="flex items-center gap-5 flex-1 min-w-0 w-full">
        {icon && (
           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] shrink-0 relative overflow-hidden group theme-glass-panel border border-white/10 ${iconColorClass}`}>
             <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
             {typeof icon === "string" ? (
               <span className="material-symbols-outlined text-[28px] drop-shadow-lg relative z-10">{icon}</span>
             ) : (
               icon
             )}
           </div>
        )}
        <div className="flex flex-col gap-1 items-start text-left flex-1 min-w-0">
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-tight m-0 text-left w-full text-[var(--text)] truncate">
            {title}
          </h1>
          <p className="font-black tracking-[0.4em] text-[10px] uppercase opacity-70 m-0 mt-1 text-left w-full text-[var(--subtext)] drop-shadow-sm truncate">
            {subtitle}
          </p>
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-4 shrink-0 xl:pl-6 min-h-[3rem] justify-start xl:justify-end w-full xl:w-auto">
          {children}
        </div>
      )}
    </header>
  );
}

export function ModSearchDropdown({ modList, onSelect, placeholder, selectedItem, onClear, dropUp }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const rawResults = (modList || []).filter((m: any) => 
    !query || 
    m.name.toLowerCase().includes(query.toLowerCase()) || 
    m.displayName?.toLowerCase().includes(query.toLowerCase())
  );
  const results = Array.from(new Map(rawResults.map((m: any) => [m.id || m.name, m])).values()).slice(0, 10);
  
  return (
    <div className="relative w-full">
      <div className="relative z-[10]">
        <input 
          ref={inputRef}
          type="text"
          value={selectedItem ? (selectedItem.displayName || selectedItem.name) : query}
          onChange={(e) => { if (!selectedItem) setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => { if (!selectedItem) setIsOpen(true); }}
          placeholder={placeholder}
          readOnly={!!selectedItem}
          className="w-full h-12 theme-glass-inner rounded-xl px-5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all relative"
        />
        {selectedItem ? (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold flex items-center justify-center" onClick={onClear}>
            <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_close") || "close"}</span>
          </button>
        ) : (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 flex items-center justify-center" onClick={() => setIsOpen(!isOpen)}>
            <span className="material-symbols-outlined !text-[20px]">{isOpen ? "expand_less" : "expand_more"}</span>
          </button>
        )}
      </div>
      {isOpen && !selectedItem && createPortal(
        (() => {
          const rect = inputRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const spaceBelow = window.innerHeight - rect.bottom;
          const shouldDropUp = spaceBelow < 300; // Auto-detect if less than 300px below
          
          return (
            <>
              <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
              <div className="fixed theme-glass-panel border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[50001] max-h-60 overflow-y-auto custom-scrollbar flex flex-col" style={{
                top: shouldDropUp ? undefined : rect.bottom + 8,
                bottom: shouldDropUp ? window.innerHeight - rect.top + 8 : undefined,
                left: rect.left,
                width: rect.width,
              }}>
                {results.map((m: any, idx: number) => (
              <button
                key={`${m.hash || m.name}-${idx}`}
                onClick={() => { onSelect(m); setQuery(""); setIsOpen(false); }}
                className="w-full text-left px-5 py-3 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col gap-0.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-[var(--text)] uppercase">{m.displayName || m.name.split('/').pop()}</span>
                  {m.file_extension && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--text)]/10 text-[8px] font-mono opacity-80 uppercase border border-[var(--text)]/20">
                      {m.file_extension}
                    </span>
                  )}
                </div>
                <span className="text-[8px] font-mono text-[var(--subtext)] opacity-60">
                  {m.version_label ? `Version(s): ${m.version_label}` : (m.master_author || m.author || (m.created_at ? `Created: ${new Date(m.created_at).toLocaleDateString()}` : `ID: ${m.id?.substring(0,8).toUpperCase()}`))}
                </span>
              </button>
            ))}
            {results.length === 0 && <div className="p-5 text-center text-[10px] text-[var(--subtext)] font-bold uppercase">{t("shared_no_signatures") || "No Signatures Found"}</div>}
          </div>
            </>
          );
        })(),
        document.body
      )}
    </div>
  );
}

export function StatTile({ label, value, icon, color, onClick }: any) {
    return (
      <div onClick={onClick} className={`group cursor-pointer ${color || 'theme-glass-panel border-white/5'} border p-6 rounded-3xl shadow-xl transition-all duration-300 hover:scale-[1.03] active:scale-95`}>
        <div className="flex justify-between items-start mb-4"><span className="text-3xl">{icon}</span><div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-[var(--text)] text-xs">{"->"}</span></div></div>
      <h3 className="text-[var(--text)] opacity-80 text-xs font-bold uppercase tracking-widest mb-1">{label}</h3>
      <div className={`text-4xl font-black text-[var(--text)] tracking-tighter`}>{value}</div>
    </div>
  );
}

export function SidebarActionButton({ id, icon, label, subtext, active, onClick, danger, success, customColorClass, className }: any) {
  const { t } = useLexicon();
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full px-5 py-4 h-auto min-h-[64px] flex items-center justify-start gap-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 shadow-sm backdrop-blur-[2px] border relative overflow-hidden group ${
        customColorClass ? customColorClass :
        active 
          ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_20%,transparent)] scale-[1.02]' 
          : danger
          ? 'text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] opacity-90 hover:opacity-100 hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_25%,transparent)]'
          : success
          ? 'text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] opacity-90 hover:opacity-100 hover:shadow-[0_0_20px_color-mix(in_srgb,var(--success)_25%,transparent)]'
          : 'text-[var(--text)] border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 opacity-80 hover:opacity-100 hover:shadow-lg'
      } ${className || ''}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${
        customColorClass ? '' :
        active ? 'from-[color-mix(in_srgb,var(--accent)_20%,transparent)] to-transparent' :
        danger ? 'from-[color-mix(in_srgb,var(--danger)_20%,transparent)] to-transparent' :
        success ? 'from-[color-mix(in_srgb,var(--success)_20%,transparent)] to-transparent' :
        'from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent'
      }`} />
      
      {icon && <span className={`material-symbols-outlined !text-[20px] shrink-0 relative z-10 transition-transform duration-300 group-hover:scale-110 ${active ? 'opacity-100 drop-shadow-md' : 'opacity-80'}`}>{icon}</span>}
      <div className="flex flex-col items-start gap-1 relative z-10 w-full pr-6 overflow-hidden">
        <span className="tracking-[0.15em] truncate w-full text-left pt-0.5">{label}</span>
        {subtext && <span className="text-[8px] font-bold opacity-60 normal-case tracking-normal whitespace-normal text-left leading-tight mt-0.5 w-full">{subtext}</span>}
      </div>
      
      <span className={`material-symbols-outlined !text-[16px] shrink-0 absolute right-5 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 ${active ? 'opacity-100 translate-x-0' : ''}`}>{t("ui_icon_chevron_right") || "chevron_right"}</span>
    </button>
  );
}

export function HubTabButton({ id, icon, label, activeTab, setTab }: any) {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`px-4 py-3 flex-1 flex items-center justify-center gap-2 rounded-lg font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap ${
          isActive 
            ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] scale-[1.02]' 
            : 'text-[var(--subtext)] border border-transparent hover:text-[var(--text)] hover:theme-glass-inner opacity-60 hover:opacity-100'
        }`}
      >
        {icon && <span className="material-symbols-outlined !text-lg">{icon}</span>}
        {label}
      </button>
    );
  }

export function CustomDropdown({ value, selectedValues = [], options, onChange, placeholder, multiSelect, searchable, disableTint, className }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = React.useRef<HTMLButtonElement>(null);
  
  const getSelectedLabel = () => {
     if (multiSelect) {
         if (selectedValues.length === 0) return placeholder || "Select...";
         if (selectedValues.length === 1) return options.find((o:any) => String(o.id) === String(selectedValues[0]))?.label || selectedValues[0];
         return `${selectedValues.length} Selected`;
     }
     const selected = options.find((o: any) => String(o.id) === String(value)) || options.find((o: any) => selectedValues.includes(o.id));
     return selected?.label || placeholder || "Select...";
  };

  const handleSelect = (id: string) => {
     if (multiSelect) {
         const newVals = selectedValues.includes(id) ? selectedValues.filter((v:any) => v !== id) : [...selectedValues, id];
         onChange(newVals);
     } else {
         onChange([id]);
         setIsOpen(false);
     }
  };

  const isActive = !disableTint && (multiSelect 
    ? selectedValues.length > 0 
    : value !== undefined && value !== null && String(value).trim() !== "" && String(value).toLowerCase() !== "all" && String(value).toLowerCase() !== "any" && String(value).toLowerCase() !== "unknown");

  return (
    <div className={`relative ${className?.includes('w-') ? '' : 'w-full'} ${className}`}>
      <button type="button" ref={btnRef} onClick={() => setIsOpen(!isOpen)} className={`w-full ${className ? 'h-full px-4 rounded-full' : 'h-12 px-5 rounded-xl'} transition-all shadow-inner flex justify-between items-center text-sm font-bold focus:outline-none group relative z-[10] backdrop-blur-[3px] ${isActive ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:theme-border-accent'}`}>
        <span className="truncate pr-4">{getSelectedLabel()}</span>
        <span className={`transition-colors shrink-0 flex items-center justify-center ${isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)]'}`}><span className="material-symbols-outlined !text-[20px]">{isOpen ? 'expand_less' : 'expand_more'}</span></span>
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-2 theme-glass-panel border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-[50001] animate-in fade-in slide-in-from-top-2 max-h-60 overflow-y-auto custom-scrollbar flex flex-col backdrop-blur-[3px]" style={{
            top: btnRef.current?.getBoundingClientRect().bottom,
            left: btnRef.current?.getBoundingClientRect().left,
            width: btnRef.current?.getBoundingClientRect().width,
          }}>
            {searchable && (
              <div className="p-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] sticky top-0 theme-glass-panel z-10 shrink-0">
                 <input 
                   autoFocus
                   type="text" 
                   value={query} 
                   onChange={e => setQuery(e.target.value)} 
                   placeholder={t("shared_search") || "Search"} 
                   className="w-full theme-glass-inner rounded-lg px-3 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all"
                 />
              </div>
            )}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {options.filter((opt: any) => !searchable || !query || opt.label.toLowerCase().includes(query.toLowerCase())).map((o: any, index: number) => {
                const isSelected = multiSelect ? selectedValues.includes(o.id) : String(o.id) === String(value);
                return (
                  <button type="button" key={`${o.id}-${index}`} onClick={() => handleSelect(o.id)} className={`w-full text-left px-4 py-3 text-sm font-bold transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex items-center justify-between ${isSelected ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_2px_0_0_var(--accent)]' : 'text-[var(--text)]'}`}>
                    <span className={`text-[11px] font-black uppercase ${isSelected ? 'text-[var(--accent)]' : o.className || 'text-[var(--text)]'}`}>{o.label}</span>
                    {isSelected && <span className="text-[12px] shrink-0 ml-2 flex items-center justify-center text-[var(--accent)]"><span className="material-symbols-outlined !text-[16px]">{t("ui_icon_check") || "check"}</span></span>}
                  </button>
                );
              })}
              {searchable && query && options.filter((opt: any) => opt.label.toLowerCase().includes(query.toLowerCase())).length === 0 && (
                <div className="p-4 text-center text-xs font-bold text-[var(--subtext)] opacity-60">{t("shared_no_options") || "No options found"}</div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

import { supabase } from "./supabase";

export function GameVersionMultiSelect({ selectedVersions, onChange }: { selectedVersions: string[], onChange: (v: string[]) => void }) {
  const { t } = useLexicon();
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
    console.log('toggleVersion called with:', v);
    console.log('Current selectedVersions:', selectedVersions);
    if (selectedVersions.includes(v)) {
      const newVersions = selectedVersions.filter(ver => ver !== v);
      console.log('Removing version, new array:', newVersions);
      onChange(newVersions);
    } else {
      const newVersions = [...selectedVersions, v];
      console.log('Adding version, new array:', newVersions);
      onChange(newVersions);
    }
  };

  const filtered = versions.filter(v => v.version && v.version.includes(query)).slice(0, 10);

  const containerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex flex-wrap gap-1 mb-2">
        {selectedVersions.map(v => (
          <span key={v} className="px-2.5 py-1 theme-glass-inner border border-white/10 rounded-md text-[9px] font-black uppercase flex items-center gap-2">{v} <button type="button" onClick={() => toggleVersion(v)} className="text-red-400 hover:text-red-300 flex items-center justify-center"><span className="material-symbols-outlined !text-[12px]">{t("ui_icon_close") || "close"}</span></button></span>
        ))}
      </div>
      <input 
        placeholder={t("shared_search_versions") || "Search versions..."} 
        value={query} 
        onChange={e => { setQuery(e.target.value); setIsOpen(true); }} 
        onFocus={() => setIsOpen(true)}
        onBlur={(e) => {
          // Delay closing to allow button clicks to register
          setTimeout(() => setIsOpen(false), 200);
        }}
        className="w-full theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all placeholder:opacity-30" 
      />
      {isOpen && createPortal(
        <div className="fixed mt-2 theme-glass-panel border-white/10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[50001] animate-in fade-in slide-in-from-top-2 max-h-60 overflow-y-auto custom-scrollbar" style={{
          top: containerRef.current?.getBoundingClientRect().bottom,
          left: containerRef.current?.getBoundingClientRect().left,
          width: containerRef.current?.getBoundingClientRect().width,
        }}>
          {filtered.map(v => (
            <button 
              key={v.version} 
              type="button" 
              onClick={() => { 
                console.log('Version clicked:', v.version);
                toggleVersion(v.version); 
                setQuery(""); 
                setIsOpen(false);
              }} 
              className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 text-[11px] font-black uppercase text-[var(--text)] flex justify-between cursor-pointer"
            >
              <span>{v.version}</span>
              {selectedVersions.includes(v.version) && <span className="text-emerald-400 flex items-center justify-center"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_check") || "check"}</span></span>}
            </button>
          ))}
          {query && !versions.some(v => v.version === query) && (
            <button 
              type="button" 
              onClick={() => { 
                console.log('Custom version added:', query);
                toggleVersion(query); 
                setQuery(""); 
                setIsOpen(false);
              }} 
              className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 text-[11px] font-black uppercase text-emerald-400 cursor-pointer"
            >
              + {t("shared_add_prefix") || "Add"} "{query}"
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function CustomDatePicker({ value, onChange, placeholder }: { value: string | null, onChange: (date: string | null) => void, placeholder?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const handleSelect = (day: number) => {
    const selected = new Date(year, month, day);
    selected.setMinutes(selected.getMinutes() - selected.getTimezoneOffset());
    onChange(selected.toISOString().split('T')[0]);
    setIsOpen(false);
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="relative w-full">
      <button ref={btnRef} onClick={() => setIsOpen(!isOpen)} className="w-full h-12 px-5 rounded-xl theme-glass-inner outline-none transition-all shadow-inner flex justify-between items-center text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-[10]">
        <span className="truncate pr-4">{value ? new Date(value).toLocaleDateString() : (placeholder || "Select Date...")}</span>
        <span className="text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors shrink-0 flex items-center justify-center"><span className="material-symbols-outlined !text-[20px]">{isOpen ? 'expand_less' : 'expand_more'}</span></span>
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-2 theme-glass-panel border-white/10 rounded-xl shadow-2xl overflow-hidden z-[50001] animate-in fade-in slide-in-from-top-2 p-4 w-64" style={{
            top: btnRef.current?.getBoundingClientRect().bottom,
            left: btnRef.current ? Math.min(btnRef.current.getBoundingClientRect().left, window.innerWidth - 270) : 0,
          }}>
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="text-[var(--subtext)] hover:text-[var(--text)] px-2 py-1">{'<'}</button>
              <div className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{monthNames[month]} {year}</div>
              <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="text-[var(--subtext)] hover:text-[var(--text)] px-2 py-1">{'>'}</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-[8px] font-bold text-[var(--subtext)] opacity-60">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {blanks.map(b => <div key={`blank-${b}`} className="p-1" />)}
              {days.map(d => {
                const isSelected = value && new Date(value).getDate() === d && new Date(value).getMonth() === month && new Date(value).getFullYear() === year;
                const isToday = new Date().getDate() === d && new Date().getMonth() === month && new Date().getFullYear() === year;
                return (
                  <button 
                    key={d} 
                    onClick={() => handleSelect(d)} 
                    className={`p-1.5 text-[10px] rounded-lg transition-all ${isSelected ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] font-black shadow-[inset_0_0_10px_color-mix(in_srgb,var(--accent)_10%,transparent),0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)] backdrop-blur-sm scale-[1.05] relative z-10' : isToday ? 'border border-[color-mix(in_srgb,var(--text)_20%,transparent)] font-bold' : 'border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export function CustomComplianceDropdown({ value, onChange, includeTier3 }: { value: number, onChange: (val: number) => void, includeTier3?: boolean }) {
  const { t } = useLexicon();
  const options = [
    { id: 0, label: "Clean / Safe (Tier 0)"},
    { id: 1, label: "NSFW (Tier 1)" },
    { id: 2, label: "Explicit (Tier 2)" },
    ...(includeTier3 ? [{ id: 3, label: "Malware (Tier 3)" }] : [])
  ];

  return (
    <div className="w-full">
      <CustomDropdown
        value={value}
        options={options}
        onChange={(v: number[]) => onChange(v[0])}
        placeholder={t("shared_select_compliance") || "Select Compliance Tier"}
        disableTint={true}
      />
    </div>
  );
}

export function CustomClassificationDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const options = [
    { id: "Unknown", label: "Unknown" },
    { id: "Core Mod", label: "Core Mod" },
    { id: "Script Mod", label: "Script Mod" },
    { id: "Tuning Mod", label: "Tuning Mod" },
    { id: "Default Replacement", label: "Default Replacement" },
    { id: "Build/Buy", label: "Build/Buy" },
    { id: "CAS Part", label: "CAS Part" },
    { id: "Pose/Animation", label: "Pose/Animation" },
    { id: "Trait/Aspiration", label: "Trait/Aspiration" },
    { id: "Career", label: "Career" }
  ];

  return (
    <div className="w-full">
      <CustomDropdown
        value={value}
        options={options}
        onChange={(v: string[]) => onChange(v[0])}
        placeholder={t("shared_select_classification") || "Select Classification"}
        disableTint={true}
      />
    </div>
  );
}


export const stripMarkdown = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\[ASSET:[^\]]+\]/g, '')
    .replace(/\[IMG:[^\]]+\]/g, '')
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') // Strip images completely
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/(?:^|\s+)[-*+]\s+/g, ' ')
    .replace(/(?:^|\s+)\d+\.\s+/g, ' ')
    .replace(/`{1,3}[^`\n]+`{1,3}/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};


export function SidePanel({ 
  isOpen, 
  onClose, 
  title, 
  subtitle, 
  icon,
  iconColorClass,
  children,
  actions,
  headerActions,
  footer,
  widthClass = "w-[600px]",
  backdropZ = "z-[40000]",
  panelZ = "z-[40001]",
  noScroll = false,
  noPadding = false,
  hideHeader = false,
  badgeText,
  ambientGlows,
  isResizable = false,
  defaultWidth = 800,
  noBackdropDim = false,
  noPanelBlur = false
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  title: string, 
  subtitle?: React.ReactNode, 
  icon?: string,
  iconColorClass?: string,
  children: React.ReactNode,
  actions?: React.ReactNode,
  headerActions?: React.ReactNode,
  footer?: React.ReactNode,
  widthClass?: string,
  backdropZ?: string,
  panelZ?: string,
  noScroll?: boolean,
  noPadding?: boolean,
  hideHeader?: boolean,
  badgeText?: string,
  ambientGlows?: React.ReactNode,
  isResizable?: boolean,
  defaultWidth?: number,
  noBackdropDim?: boolean,
  noPanelBlur?: boolean
}) {
  const { t } = useLexicon();
  const [panelWidth, setPanelWidth] = useState<number>(defaultWidth || 800);
  useEffect(() => {
    if (defaultWidth) setPanelWidth(defaultWidth);
  }, [defaultWidth]);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
       const newWidth = Math.max(400, Math.min(window.innerWidth - e.clientX, window.innerWidth - 100));
       if (panelRef.current) {
         panelRef.current.style.width = `${newWidth}px`;
       }
    };
    const handleMouseUp = () => {
       setIsResizing(false);
       if (panelRef.current) {
         setPanelWidth(parseInt(panelRef.current.style.width) || defaultWidth || 800);
       }
    };
    
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, defaultWidth]);

  if (!isOpen) return null;
  return createPortal(
    <>
      <div className={`fixed top-0 right-0 bottom-10 ${backdropZ} ${noBackdropDim ? 'bg-transparent' : 'bg-black/10 backdrop-blur-[2px]'} animate-in fade-in duration-500 transition-all`} style={{ left: "var(--sidebar-width, 288px)" }} onClick={onClose} />
      <div 
        ref={panelRef}
        className={`fixed top-10 right-0 bottom-10 rounded-tl-[3rem] rounded-bl-[3rem] overflow-hidden ${isResizable ? '' : widthClass} theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[[-20px_0_50px_rgba(0,0,0,0.5)]] flex flex-col ${panelZ} animate-in slide-in-from-right duration-500 ${isResizing ? '!transition-none !duration-0 select-none' : ''} ${noPanelBlur ? '!backdrop-blur-none' : ''}`} 
        style={isResizable ? { width: `${panelWidth}px`, transition: isResizing ? 'none' : undefined, pointerEvents: isResizing ? 'none' : undefined } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {isResizable && (
          <div 
            className="absolute top-0 left-[-6px] w-4 h-full cursor-col-resize hover:bg-[var(--accent)]/30 z-[100] transition-colors flex flex-col items-center justify-center opacity-0 hover:opacity-100"
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="w-1 h-12 rounded-full bg-[var(--accent)]" />
          </div>
        )}
        
        {/* Subtle dynamic ambient glow in the background based on the iconColorClass text class */}
        <div className={`absolute top-0 right-[-10%] w-[100%] h-[40%] bg-current opacity-[0.04] blur-[100px] rounded-full pointer-events-none ${iconColorClass?.split(' ')[0] || ''}`} />
        <div className={`absolute bottom-[-10%] left-[-20%] w-[80%] h-[50%] bg-current opacity-[0.03] blur-[120px] rounded-full pointer-events-none ${iconColorClass?.split(' ')[0] || ''}`} />

        {ambientGlows && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-[-1] rounded-l-3xl">
            {ambientGlows}
          </div>
        )}

        {/* Header - Fixed */}
        {!hideHeader && (
          <div className="pt-[40px] px-10 pb-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_3%,transparent)] to-transparent pointer-events-none" />
            
            {headerActions && (
              <div className="absolute top-[40px] right-[88px] flex items-center gap-3 z-50">
                 {headerActions}
              </div>
            )}

            <button onClick={onClose} className="absolute top-[40px] right-8 z-50 w-12 h-12 rounded-2xl flex items-center justify-center text-[var(--subtext)] transition-all bg-black/10 backdrop-blur-[2px] hover:theme-bg-danger hover:text-white hover:scale-110 active:scale-95 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-xl group/closebtn">
              <span className="material-symbols-outlined !text-[22px] group-hover/closebtn:rotate-90 transition-transform duration-300">{t("ui_icon_close") || "close"}</span>
            </button>

            <div className="flex items-center gap-6 relative z-10 w-full min-w-0 pr-16">
              <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-6 min-w-0 w-full">
                {icon && (
                  <div className={`w-16 h-16 rounded-[1.25rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shadow-lg shrink-0 relative overflow-hidden group/iconbox ${iconColorClass ? '' : 'theme-text-accent'}`}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/iconbox:opacity-100 transition-opacity duration-500"></div>
                    <span className={`material-symbols-outlined !text-[32px] opacity-80 group-hover/iconbox:opacity-100 group-hover/iconbox:scale-110 transition-all duration-300 drop-shadow-[0_0_15px_currentColor] ${iconColorClass || ''}`}>
                      {icon}
                    </span>
                  </div>
                )}
                <div className="flex flex-col min-w-0 w-full justify-center">
                  {badgeText && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-current/10 border border-current/20 ${iconColorClass || 'theme-text-accent'}`}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shadow-[0_0_8px_currentColor]"></span> 
                        {badgeText}
                      </span>
                    </div>
                  )}
                  <span className="leading-tight text-3xl tracking-tighter truncate w-full drop-shadow-md">{title}</span>
                  {subtitle && <span className="text-[10px] font-black text-[var(--subtext)] opacity-50 mt-1 uppercase tracking-[0.25em] truncate">{subtitle}</span>}
                </div>
              </h2>
            </div>
          </div>
        )}

        {/* Content Body - Fills remaining space */}
        <div className={`flex-1 min-h-0 flex flex-col relative z-10 ${noScroll ? '' : 'overflow-y-auto custom-scrollbar'} ${noPadding ? '' : 'p-8'}`}>
          {children}
        </div>

        {/* Footer - Fixed */}
        {(footer || actions) && (
          <div className="px-8 pb-8 pt-4 flex justify-center items-center gap-4 shrink-0 relative z-20 bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[2px]">
            {footer}
            {actions}
          </div>
        )}
      </div>
    </>, document.body
  );
}

export function SearchBar({ value, onChange, placeholder = "Search..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex items-center theme-glass-inner rounded-xl border border-transparent focus-within:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all shadow-inner group w-full">
      <div className="pl-4 pr-2 py-2 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] group-focus-within:text-[var(--accent)] transition-colors">search</span>
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-none px-2 py-2 text-[11px] font-black text-[var(--text)] focus:outline-none placeholder-[var(--subtext)] placeholder:opacity-50 tracking-wider min-w-0"
      />
    </div>
  );
}

export const extractPostImage = (markdown: any): string | undefined => {
  if (!markdown) return undefined;
  let text = markdown;
  if (typeof markdown === 'object') {
     text = markdown.message || markdown.content || markdown.description || markdown.body || "";
  }
  if (typeof text !== 'string') return undefined;
  
  const imgMatch = text.match(/!\[.*?\]\((.*?)\)/);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }
  const htmlImgMatch = text.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (htmlImgMatch && htmlImgMatch[1]) {
    return htmlImgMatch[1];
  }
  return undefined;
};

export const getLowestVersion = (versions: string[]): string => {
  if (!versions || versions.length === 0) return "";
  return versions.reduce((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal < bVal) return a;
      if (aVal > bVal) return b;
    }
    return a;
  });
};
