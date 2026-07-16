import { useStore } from './store';
import { useLexicon } from "./LexiconContext";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useModalStore } from "./store/modalStore";

export const handleOpenUrl = (url: string) => {
  const { useInternalBrowser, setSideBrowserUrl, setIsSideBrowserOpen } = useModalStore.getState();
  if (useInternalBrowser) {
    setSideBrowserUrl(url);
    setIsSideBrowserOpen(true);
  } else {
    openUrl(url);
  }
};

export const standardButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardGlassButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-white/5 backdrop-blur-md border border-white/10 text-[var(--text)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-white/10 hover:border-white/20 hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardPrimaryButtonClass = "px-8 py-4 rounded-[var(--radius)] theme-bg-accent text-white text-xs font-black uppercase tracking-[0.2em] transition-all hover:brightness-110 hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.4)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardSuccessButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--success)_20%,transparent)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardDangerButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--danger)_20%,transparent)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardAccentGlassButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";

export const deriveHumanReadableVersion = (path: string | undefined | null, fallbackHash: string | undefined | null, t?: (key: string) => string) => {
  if (!path) return fallbackHash ? `v.DNA-${fallbackHash.substring(0, 7).toUpperCase()}` : (t?.("shared_version_unknown") || "v.Unknown");

  const tsMatch = path.match(/[/\\]v\.(\d{10})[/\\]/i) || path.match(/^v\.(\d{10})$/i) || path.match(/[/\\]v\.(\d{10})$/i);
  let extractedVersion = "";

  if (tsMatch) {
    const d = new Date(parseInt(tsMatch[1]) * 1000);
    extractedVersion = `v.${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}-${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;
  } else {
    const parts = path.split(/[/\\]/);
    extractedVersion = parts.length > 1 ? parts[parts.length - 2] : parts[0].replace(getExtensionRegex(useStore.getState().activeGameSchema), '');
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
  isCollection?: boolean;
  allow_write?: boolean;
  compliance_tier?: number;
  mtime?: number;
  isLocalOverride?: boolean;
}

export const formatDisplayName = (name: string, t?: (key: string) => string, schema?: any) => {
  if (!name) return t?.("shared_unknown_artifact") || "Unknown Artifact";
  const rawName = String(name).split(/[\\/]/).pop() || "";

  if (schema && schema.extensions && schema.extensions.supported) {
    let cleaned = rawName;
    for (const ext of schema.extensions.supported) {
      if (cleaned.toLowerCase().endsWith(ext.toLowerCase())) {
        cleaned = cleaned.substring(0, cleaned.length - ext.length);
        break;
      }
    }
    return cleaned.replace(/_/g, " ");
  }

  return rawName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
};

export const getFileLabel = (filename: string, schema: any): string => {
  if (!filename) return "UNKNOWN";
  if (!schema || !schema.extensions || !schema.extensions.labels) {
    if (filename.toLowerCase().endsWith('.zip') || filename.toLowerCase().endsWith('.rar')) return "ARCHIVE";
    return filename.split('.').pop()?.toUpperCase() || "FILE";
  }
  const ext = Object.keys(schema.extensions.labels).find(e => filename.toLowerCase().endsWith(e.toLowerCase()));
  return ext ? schema.extensions.labels[ext] : (filename.split('.').pop()?.toUpperCase() || "UNKNOWN");
};

export const getExtensionRegex = (schema: any) => {
  const exts = schema?.extensions?.supported || [];
  if (exts.length === 0) return /\.[a-z0-9]+$/i;
  return new RegExp(`\\.(${exts.map((e: any) => e.replace('.', '')).join('|')})$`, 'i');
};

export const isSupportedExtension = (filename: string, schema: any): boolean => {
  if (!filename || !schema || !schema.extensions || !schema.extensions.supported) return false;
  return schema.extensions.supported.some((ext: string) => filename.toLowerCase().endsWith(ext.toLowerCase()));
};

export const DLC_MAP: Record<string, string> = {};

export const loadDLCMap = async () => {
  try {
    if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
    const { data } = await supabase.from('dlc_registry').select('id, name');
    if (data && data.length > 0) {
      for (const key of Object.keys(DLC_MAP)) {
        delete DLC_MAP[key];
      }
      data.forEach((d: any) => {
        DLC_MAP[d.id] = d.name;
      });
    }
  } catch (e) {
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
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const valA = partsA[i] || 0;
      const valB = partsB[i] || 0;
      if (valA !== valB) return valB - valA;
    }
    return 0;
  });
  return sorted[0];
};

export function ViewHeader({ title, subtitle, icon, iconColorClass = "bg-gradient-to-br from-blue-500 to-blue-700", children, onSubtitleClick }: any) {
  return (
    <header className="flex flex-col xl:flex-row w-full justify-between items-start mb-10 shrink-0 gap-6">
      <div className="flex items-center gap-5 flex-1 min-w-0 w-full">
        {icon && (
          <div className={`w-14 h-14 rounded-[var(--radius)] flex items-center justify-center shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] shrink-0 relative overflow-hidden group theme-glass-panel border border-white/10 ${iconColorClass}`}>
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
          <p 
            className="font-black tracking-[0.4em] text-[10px] uppercase opacity-70 m-0 mt-1 text-left w-full text-[var(--subtext)] drop-shadow-sm truncate"
            onClick={onSubtitleClick}
          >
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
          className="w-full h-12 theme-glass-inner rounded-[calc(var(--radius)-4px)] px-5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all relative"
        />
        {selectedItem ? (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold flex items-center justify-center" onClick={onClear}>
            <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
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
          const shouldDropUp = spaceBelow < 300;

          return (
            <>
              <div className="fixed inset-0 z-[200000]" onClick={() => setIsOpen(false)} />
              <div className="fixed theme-glass-panel border-white/10 rounded-[var(--radius)] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[200001] max-h-60 overflow-y-auto custom-scrollbar flex flex-col" style={{
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
                      {m.version_label ? `Version(s): ${m.version_label}` : (m.master_author || m.author || (m.created_at ? `Created: ${new Date(m.created_at).toLocaleDateString()}` : `ID: ${m.id?.substring(0, 8).toUpperCase()}`))}
                    </span>
                  </button>
                ))}
                {results.length === 0 && <div className="p-5 text-center text-[10px] text-[var(--subtext)] font-bold uppercase">{t("shared_no_signatures")}</div>}
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
    <div onClick={onClick} className={`group cursor-pointer ${color || 'theme-glass-panel border-white/5'} border p-6 rounded-[var(--radius)] shadow-xl transition-all duration-300 hover:scale-[1.03] active:scale-95`}>
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
      className={`w-full px-5 py-4 h-auto min-h-[64px] flex items-center justify-start gap-4 rounded-[var(--radius)] font-black text-[10px] uppercase tracking-widest transition-all duration-300 shadow-sm backdrop-blur-[2px] border relative overflow-hidden group ${customColorClass ? customColorClass :
        active
          ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_20%,transparent)] scale-[1.02]'
          : danger
            ? 'text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] opacity-90 hover:opacity-100 hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_25%,transparent)]'
            : success
              ? 'text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] opacity-90 hover:opacity-100 hover:shadow-[0_0_20px_color-mix(in_srgb,var(--success)_25%,transparent)]'
              : 'text-[var(--text)] border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 opacity-80 hover:opacity-100 hover:shadow-lg'
        } ${className || ''}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${customColorClass ? '' :
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

      <span className={`material-symbols-outlined !text-[16px] shrink-0 absolute right-5 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 ${active ? 'opacity-100 translate-x-0' : ''}`}>{t("icon_chevron_right")}</span>
    </button>
  );
}

export function HubTabButton({ id, icon, label, activeTab, setTab }: any) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`h-full px-4 py-3 flex-1 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap ${isActive
        ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]'
        : 'text-[var(--subtext)] hover:bg-white/5 hover:text-[var(--text)] opacity-60 hover:opacity-100'
        }`}
    >
      {icon && <span className="material-symbols-outlined !text-lg">{icon}</span>}
      {label}
    </button>
  );
}

export function HubTabs({ tabs, activeTab, setTab, className = "" }: any) {
  return (
    <div className={`flex items-center overflow-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0 w-full ${className}`}>
      {tabs.map((tab: any) => (
        <HubTabButton key={tab.id} {...tab} activeTab={activeTab} setTab={setTab} />
      ))}
    </div>
  );
}

export function FilterTabs({ children, className = "" }: any) {
  return (
    <div className={`flex items-center overflow-hidden theme-glass-panel rounded-full p-1 border border-white/5 shadow-inner shrink-0 gap-1 ${className}`}>
      {children}
    </div>
  );
}

export function FilterTabButton({ id, icon, label, activeTab, setTab, className = "", children }: any) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`h-full px-4 py-1.5 rounded-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
        isActive
          ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-md'
          : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 opacity-70 hover:opacity-100'
      } ${className}`}
    >
      {icon && <span className="material-symbols-outlined !text-[14px]">{icon}</span>}
      {label}
      {children}
    </button>
  );
}

export function HubTabDropdown({ icon, label, options, activeTab, setTab }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActiveGroup = options.some((opt: any) => opt.id === activeTab);
  const activeOption = options.find((opt: any) => opt.id === activeTab);
  const displayLabel = activeOption ? activeOption.label : label;
  const displayIcon = activeOption?.icon || icon;

  return (
    <div className="relative flex-1 h-full" ref={containerRef}>
      <button
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-full px-4 py-3 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap ${isActiveGroup || isOpen
          ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]'
          : 'text-[var(--subtext)] hover:bg-white/5 hover:text-[var(--text)] opacity-60 hover:opacity-100'
          }`}
      >
        {displayIcon && <span className="material-symbols-outlined !text-lg">{displayIcon}</span>}
        {displayLabel}
        <span className="material-symbols-outlined !text-md ml-1 opacity-50">{isOpen ? 'expand_less' : 'expand_more'}</span>
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed mt-2 min-w-[200px] theme-glass-panel border border-[var(--accent)]/20 rounded-[calc(var(--radius)-4px)] shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-[200001] overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-md"
          style={{
            top: btnRef.current?.getBoundingClientRect().bottom,
            left: btnRef.current?.getBoundingClientRect().left,
            width: Math.max(200, btnRef.current?.getBoundingClientRect().width || 0),
          }}
        >
          <div className="px-3 py-2 text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50 border-b border-white/5 mb-1">{label}</div>
          {options.map((opt: any) => (
            <button
              key={opt.id}
              onClick={() => { setTab(opt.id); setIsOpen(false); }}
              className={`px-4 py-3 w-full flex items-center gap-3 rounded-lg text-[12px] font-black uppercase tracking-widest transition-all text-left ${activeTab === opt.id
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'text-[var(--text)] hover:bg-white/5'
                }`}
            >
              {opt.icon && <span className="material-symbols-outlined !text-md opacity-80">{opt.icon}</span>}
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
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
      if (selectedValues.length === 1) return options.find((o: any) => String(o.id) === String(selectedValues[0]))?.label || selectedValues[0];
      return `${selectedValues.length} Selected`;
    }
    const selected = options.find((o: any) => String(o.id) === String(value)) || options.find((o: any) => selectedValues.includes(o.id));
    return selected?.label || placeholder || "Select...";
  };

  const handleSelect = (id: string) => {
    if (multiSelect) {
      const newVals = selectedValues.includes(id) ? selectedValues.filter((v: any) => v !== id) : [...selectedValues, id];
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
      <button type="button" ref={btnRef} onClick={() => setIsOpen(!isOpen)} className={`w-full ${className ? 'h-full px-4 rounded-full' : 'h-12 px-5 rounded-[calc(var(--radius)-4px)]'} transition-all shadow-inner flex justify-between items-center text-sm font-bold focus:outline-none group relative z-[10] backdrop-blur-[3px] ${isActive ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:theme-border-accent'}`}>
        <span className="truncate pr-4">{getSelectedLabel()}</span>
        <span className={`transition-colors shrink-0 flex items-center justify-center ${isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)]'}`}><span className="material-symbols-outlined !text-[20px]">{isOpen ? 'expand_less' : 'expand_more'}</span></span>
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[200000]" onClick={() => setIsOpen(false)} />
          <div className="fixed theme-glass-panel border border-white/10 rounded-[calc(var(--radius)-4px)] shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-[200001] animate-in fade-in max-h-60 overflow-y-auto custom-scrollbar flex flex-col backdrop-blur-[3px]" style={{
            top: (btnRef.current?.getBoundingClientRect().bottom || 0) > window.innerHeight - 300 ? undefined : (btnRef.current?.getBoundingClientRect().bottom || 0) + 8,
            bottom: (btnRef.current?.getBoundingClientRect().bottom || 0) > window.innerHeight - 300 ? window.innerHeight - (btnRef.current?.getBoundingClientRect().top || 0) + 8 : undefined,
            left: btnRef.current?.getBoundingClientRect().left,
            minWidth: btnRef.current?.getBoundingClientRect().width,
            width: 'max-content',
          }}>
            {searchable && (
              <div className="p-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] sticky top-0 theme-glass-panel z-10 shrink-0">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t("shared_search")}
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
                    {isSelected && <span className="text-[12px] shrink-0 ml-2 flex items-center justify-center text-[var(--accent)]"><span className="material-symbols-outlined !text-[16px]">{t("icon_check")}</span></span>}
                  </button>
                );
              })}
              {searchable && query && options.filter((opt: any) => opt.label.toLowerCase().includes(query.toLowerCase())).length === 0 && (
                <div className="p-4 text-center text-xs font-bold text-[var(--subtext)] opacity-60">{t("shared_no_options")}</div>
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
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
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
          <span key={v} className="px-2.5 py-1 theme-glass-inner border border-white/10 rounded-md text-[9px] font-black uppercase flex items-center gap-2">{v} <button type="button" onClick={() => toggleVersion(v)} className="text-red-400 hover:text-red-300 flex items-center justify-center"><span className="material-symbols-outlined !text-[12px]">{t("icon_close")}</span></button></span>
        ))}
      </div>
      <input
        placeholder={t("shared_search_versions")}
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onBlur={(e) => {
          setTimeout(() => setIsOpen(false), 200);
        }}
        className="w-full theme-glass-inner rounded-[calc(var(--radius)-4px)] px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all placeholder:opacity-30"
      />
      {isOpen && createPortal(
        <div className="fixed mt-2 theme-glass-panel border-white/10 rounded-[calc(var(--radius)-4px)] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[200001] animate-in fade-in slide-in-from-top-2 max-h-60 overflow-y-auto custom-scrollbar" style={{
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
              {selectedVersions.includes(v.version) && <span className="text-emerald-400 flex items-center justify-center"><span className="material-symbols-outlined !text-[14px]">{t("icon_check")}</span></span>}
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
              + {t("shared_add_prefix")} "{query}"
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
      <button ref={btnRef} onClick={() => setIsOpen(!isOpen)} className="w-full h-12 px-5 rounded-[calc(var(--radius)-4px)] theme-glass-inner outline-none transition-all shadow-inner flex justify-between items-center text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-[10]">
        <span className="truncate pr-4">{value ? new Date(value).toLocaleDateString() : (placeholder || "Select Date...")}</span>
        <span className="text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors shrink-0 flex items-center justify-center"><span className="material-symbols-outlined !text-[20px]">{isOpen ? 'expand_less' : 'expand_more'}</span></span>
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[200000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-2 theme-glass-panel border-white/10 rounded-[calc(var(--radius)-4px)] shadow-2xl overflow-hidden z-[200001] animate-in fade-in slide-in-from-top-2 p-4 w-64" style={{
            top: btnRef.current?.getBoundingClientRect().bottom,
            left: btnRef.current ? Math.min(btnRef.current.getBoundingClientRect().left, window.innerWidth - 270) : 0,
            minWidth: btnRef.current?.getBoundingClientRect().width,
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
    { id: 0, label: "Clean / Safe (Tier 0)" },
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
        placeholder={t("shared_select_compliance")}
        disableTint={true}
      />
    </div>
  );
}

export const getModIcon = (mod: any, schema: any, t: any) => {
  if (mod.isFlavorFolder) return t("icon_style") || "style";
  if (mod.isParent && mod.flavors?.some((f: any) => ["twin", "beta", "addon"].includes(f.relationshipType))) return t("icon_account_tree") || "account_tree";
  if (mod.isParent) return t("icon_folder_open") || "folder_open";

  const name = (mod.name || "").toLowerCase();
  const rawType = (mod.type || mod.category_override || "").toLowerCase();

  const category = schema?.mod_categories?.find((c: any) => c.id.toLowerCase() === rawType);
  if (category && category.icon_key) {
    const translation = t(category.icon_key);
    if (translation && translation !== category.icon_key) return translation;
  }

  if (rawType.includes('cas') || name.includes('hair') || name.includes('clothes') || name.includes('tattoo')) return t("icon_checkroom") || "checkroom";
  if (rawType.includes('build') || name.includes('furniture') || name.includes('object')) return t("icon_chair") || "chair";
  if (rawType.includes('script') || getFileLabel(name, schema) === "SCRIPT") return t("icon_receipt_long") || "code";
  if (rawType.includes('anim') || name.includes('anim')) return t("icon_movie") || "animation";
  if (rawType.includes('cc') || name.includes('set')) return t("icon_folder_special") || "folder_special";
  return t("icon_extension") || "extension";
};

export function CustomClassificationDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const options = [
    { id: "Unknown", label: t("ui_icon_unknown") || "Unknown" },
    ...(activeGameSchema?.mod_categories || []).map((c: any) => ({
      id: c.id,
      label: t(c.lexicon_key) || c.id
    }))
  ];

  return (
    <div className="w-full">
      <CustomDropdown

        value={value}
        options={options}
        onChange={(v: string[]) => onChange(v[0])}
        placeholder={t("shared_select_classification")}
        disableTint={true}
      />
    </div>
  );
}


export const renderTextWithIcons = (text: string) => {
  if (!text || typeof text !== 'string') return text;

  const parts = text.split(/(\\?\[ICON:[a-zA-Z0-9_-]+\\?\])/gi);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/i);
        if (match) {
          const iconName = match[1].toLowerCase();
          return (
            <span key={i} className="material-symbols-outlined !text-[inherit] align-middle px-1 leading-none -mt-1 inline-block">
              {iconName}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};

export const stripMarkdown = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\\?\[ICON:[a-zA-Z0-9_-]+\\?\]/gi, (match) => match.replace(/\\/g, ''))
    .replace(/\[ASSET:[^\]]+\]/g, '')
    .replace(/\[IMG:[^\]]+\]/g, '')
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/(?:^|\s+)[-*+]\s+/g, ' ')
    .replace(/(?:^|\s+)\d+\.\s+/g, ' ')
    .replace(/`{1,3}[^`\import { getExtensionRegex } from "./shared";\nn]+`{1,3}/g, '')
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
  noPanelBlur = false,
  footerClass,
  panelClass
}: {
  isOpen: boolean,
  onClose: () => void,
  title: React.ReactNode | string,
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
  noPanelBlur?: boolean,
  footerClass?: string,
  panelClass?: string
}) {
  const { t } = useLexicon();
  const [panelWidth, setPanelWidth] = useState<number>(defaultWidth || 800);
  useEffect(() => {
    if (defaultWidth) setPanelWidth(defaultWidth);
  }, [defaultWidth]);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragWidthRef = useRef<number>(defaultWidth || 800);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(400, Math.min(window.innerWidth - e.clientX, window.innerWidth - 100));
      dragWidthRef.current = newWidth;
      if (panelRef.current) {
        panelRef.current.style.width = `${newWidth}px`;
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      setPanelWidth(dragWidthRef.current);
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
      {isResizing && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
      <div className={`fixed top-[50px] bottom-[40px] right-0 ${backdropZ} ${noBackdropDim ? 'bg-transparent' : 'bg-black/10 backdrop-blur-[2px]'} animate-in fade-in duration-500 transition-all`} style={{ left: "var(--sidebar-width, 288px)" }} onClick={onClose} />
      <div
        ref={panelRef}
        className={`fixed top-[50px] bottom-[40px] right-0 overflow-hidden ${isResizable ? '' : widthClass} !rounded-l-[var(--radius)] !rounded-r-none !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[[-20px_0_50px_rgba(0,0,0,0.5)]] flex flex-col ${panelZ} animate-in slide-in-from-right duration-500 ${isResizing ? '!transition-none !duration-0 select-none' : ''} ${panelClass || ''}`}
        style={isResizable ? { width: `${isResizing ? dragWidthRef.current : panelWidth}px`, pointerEvents: isResizing ? 'none' : undefined } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`absolute inset-0 pointer-events-none z-[-2] theme-glass-panel !border-none !shadow-none !rounded-none ${noPanelBlur ? '!backdrop-blur-none' : ''}`} />
        {isResizable && (
          <div
            className="absolute top-0 left-[-6px] w-4 h-full cursor-col-resize hover:bg-[var(--accent)]/30 z-[100] transition-colors flex flex-col items-center justify-center opacity-0 hover:opacity-100"
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="w-1 h-12 rounded-full bg-[var(--accent)]" />
          </div>
        )}



        {ambientGlows && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-[-1] rounded-l-[var(--radius)]">
            {ambientGlows}
          </div>
        )}

        {!hideHeader && (
          <div className="pt-[40px] px-10 pb-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_0%,transparent)] via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-[color-mix(in_srgb,var(--text)_0%,transparent)] opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_3%,transparent)] to-[color-mix(in_srgb,var(--text)_0%,transparent)] pointer-events-none" />

            {headerActions && (
              <div className="absolute top-[40px] right-[88px] flex items-center gap-3 z-50">
                {headerActions}
              </div>
            )}

            <button onClick={onClose} className="absolute top-[40px] right-8 z-50 w-12 h-12 rounded-[var(--radius)] flex items-center justify-center text-[var(--subtext)] transition-all bg-black/10 backdrop-blur-[2px] hover:theme-bg-danger hover:text-white hover:scale-110 active:scale-95 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-xl group/closebtn">
              <span className="material-symbols-outlined !text-[22px] group-hover/closebtn:rotate-90 transition-transform duration-300">{t("icon_close")}</span>
            </button>

            <div className="flex items-center gap-6 relative z-10 w-full min-w-0 pr-16">
              <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-6 min-w-0 w-full">
                {icon && (
                  <div className={`w-16 h-16 rounded-[1.25rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shadow-lg shrink-0 relative overflow-hidden group/iconbox ${iconColorClass || ''}`}>
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

        <div className={`flex-1 min-h-0 flex flex-col relative z-10 ${noScroll ? '' : 'overflow-y-auto custom-scrollbar'} ${noPadding ? '' : 'p-8'} ${isResizing ? 'pointer-events-none select-none overflow-hidden' : ''}`}>
          {children}
        </div>

        {(footer || actions) && (
          <div className={`px-8 pb-8 pt-4 flex justify-center items-center gap-4 shrink-0 relative z-20 bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[2px] ${footerClass || ''}`}>
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
    <div className="relative flex items-center theme-glass-inner rounded-[calc(var(--radius)-4px)] border border-transparent focus-within:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all shadow-inner group w-full">
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

  if (typeof markdown === 'object') {
    if (markdown.image_url) return markdown.image_url;
    const text = markdown.message || markdown.content || markdown.description || markdown.body || "";

    if (typeof text === 'string') {
      if (text.startsWith('[IMG:')) {
        const endIdx = text.indexOf(']');
        if (endIdx !== -1) {
          return text.substring(5, endIdx);
        }
      }
      const imgMatch = text.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch && imgMatch[1]) return imgMatch[1];
      const htmlImgMatch = text.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (htmlImgMatch && htmlImgMatch[1]) return htmlImgMatch[1];
    }
  } else if (typeof markdown === 'string') {
    if (markdown.startsWith('[IMG:')) {
      const endIdx = markdown.indexOf(']');
      if (endIdx !== -1) {
        return markdown.substring(5, endIdx);
      }
    }
    const imgMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
    if (imgMatch && imgMatch[1]) return imgMatch[1];
    const htmlImgMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (htmlImgMatch && htmlImgMatch[1]) return htmlImgMatch[1];
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

export function EmptyState({ icon, title, subtitle, action, minHeightClass = "min-h-[200px]", className = "" }: { icon: string, title: string, subtitle?: string, action?: React.ReactNode, minHeightClass?: string, className?: string }) {
  return (
    <div className={`text-center py-10 px-4 flex flex-col items-center justify-center gap-4 ${minHeightClass} w-full ${className}`}>
      <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-30 drop-shadow-md mb-2">{icon}</span>
      <div className="flex flex-col gap-1.5 items-center text-center">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)]">{title}</span>
        {subtitle && <span className="text-[9px] font-bold text-[var(--subtext)] uppercase tracking-widest max-w-sm leading-relaxed opacity-60">{subtitle}</span>}
      </div>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };

export function CustomTierDropdown({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))} className="w-full theme-glass-panel rounded-[var(--radius)] px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 appearance-none bg-transparent cursor-pointer shadow-inner">
      <option value={1} className="bg-[var(--surface)] text-[var(--text)]">Tier 1</option>
      <option value={2} className="bg-[var(--surface)] text-[var(--text)]">Tier 2</option>
      <option value={3} className="bg-[var(--surface)] text-[var(--text)]">Tier 3</option>
    </select>
  );
}


export function DashboardStatTile({ icon, number, label, colorClass, onClick, setStatus, disabled }: any) {
  return (
    <div onClick={disabled ? undefined : onClick} className={`flex-1 flex flex-col justify-center items-start gap-1 p-6 rounded-[var(--radius)] border border-white/10 backdrop-blur-[40px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.3)] ${colorClass} transition-all relative overflow-hidden group ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:shadow-xl'}`}>
      <div className="absolute inset-0 bg-current opacity-[0.05] group-hover:opacity-[0.15] transition-opacity duration-300" />
      <div className="flex items-center gap-3 w-full relative z-10">
        <span className="text-3xl opacity-50 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-110 transition-all drop-shadow-md">{icon}</span>
        <span className={`text-4xl lg:text-5xl font-black drop-shadow-lg tracking-tighter`}>{number}</span>
      </div>
      <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--subtext)] opacity-60 mt-2">{label}</span>
    </div>
  );
}

export function HoverTooltip({ title, subtitle, variant = 'danger', className = '' }: any) {
  const isDanger = variant === 'danger';
  const isInfo = variant === 'info';

  let borderColorClass = 'border-orange-500/40';
  let textColorClass = 'text-orange-500';
  let iconName = 'warning';

  if (isDanger) {
    borderColorClass = 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)]';
    textColorClass = 'text-[var(--danger)]';
    iconName = 'error';
  } else if (isInfo) {
    borderColorClass = 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]';
    textColorClass = 'text-[var(--text)]';
    iconName = 'info';
  }

  return (
    <div className={`absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-[70] hidden group-hover:flex flex-col items-start justify-center theme-glass-panel backdrop-blur-3xl bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] border px-5 py-3 rounded-[var(--radius)] max-w-[320px] w-max pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${borderColorClass} ${className}`}>
      <div className="relative z-10 flex flex-col items-start gap-1 w-full">
        <div className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-start text-left gap-2 whitespace-pre-line ${textColorClass}`}>
          <span className="material-symbols-outlined !text-[14px] shrink-0 mt-[1px]">{iconName}</span>
          <span>{title}</span>
        </div>
        {subtitle && (
          <div className="text-[10px] font-bold text-[var(--text)] opacity-60 text-left whitespace-normal leading-tight ml-[22px]">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

export const isValidVersion = (version: string) => {
  return /^\d+\.\d+\.\d+$/.test(version);
};

export const compareVersions = (v1: string, v2: string) => {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
};


export const processModsIntoCollections = (
  modsData: any[],
  flavorGroups: any[],
  collections: any[],
  relationships: any[],
  allFlavorMembers: any[],
  allSetMembers: any[]
) => {
  let allItems: any[] = [];
  const modsById = new Map<string, any>();
  if (modsData) {
    modsData.forEach((mod: any) => {
      modsById.set(String(mod.id), mod);
    });
  }

  const familyMap = new Map<string, Set<string>>();
  const processedMods = new Set<string>();

  if (relationships) {
    relationships.forEach((rel: any) => {
      const parentId = String(rel.parent_id);
      const childId = String(rel.child_id);

      if (modsById.has(parentId) && modsById.has(childId)) {
        if (!familyMap.has(parentId)) {
          familyMap.set(parentId, new Set([parentId]));
        }
        familyMap.get(parentId)!.add(childId);
      }
    });

    familyMap.forEach((memberIds, parentId) => {
      if (memberIds.size > 1) {
        const members = Array.from(memberIds)
          .map(id => modsById.get(id))
          .filter(Boolean);

        const parentMod = modsById.get(parentId);
        const isValidName = parentMod?.name && !parentMod.name.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        if (members.length > 1 && parentMod && isValidName) {
          allItems.push({
            ...parentMod,
            isVirtual: true,
            isParent: true,
            familyId: parentId,
            flavors: members,
            familyCount: members.length
          });
          memberIds.forEach(id => processedMods.add(id));
        }
      }
    });
  }

  if (flavorGroups) {
    const membersByGroup = new Map<string, any[]>();
    if (allFlavorMembers) {
      for (const fm of allFlavorMembers) {
        if (!membersByGroup.has(fm.group_id)) membersByGroup.set(fm.group_id, []);
        membersByGroup.get(fm.group_id)!.push(fm);
      }
    }

    for (const group of flavorGroups) {
      const flavorMembers = membersByGroup.get(group.id) || [];
      const members: any[] = [];
      const memberIds = new Set<string>();

      if (flavorMembers.length > 0) {
        for (const fm of flavorMembers) {
          for (const [modId, mod] of modsById.entries()) {
            if (mod.mod_versions?.some((v: any) => v.dna_hash === fm.mod_hash)) {
              if (!memberIds.has(modId)) {
                members.push(mod);
                memberIds.add(modId);
                processedMods.add(modId);
              }
              break;
            }
          }
        }
      }

      if (members.length > 0) {
        allItems.push({
          id: `flavor_${group.id}`,
          name: group.name,
          category_override: "Exclusives",
          image_url: group.image_url || null,
          master_author: "Flavor Group",
          description: null,
          created_at: group.created_at,
          isFlavorGroup: true,
          flavorGroupId: group.id,
          flavors: members,
          familyCount: members.length,
          isVirtual: true,
          isParent: true
        });
      }
    }
  }

  if (collections) {
    const membersBySet = new Map<string, any[]>();
    if (allSetMembers) {
      for (const sm of allSetMembers) {
        if (!membersBySet.has(sm.set_id)) membersBySet.set(sm.set_id, []);
        membersBySet.get(sm.set_id)!.push(sm);
      }
    }

    for (const set of collections) {
      const setMembers = membersBySet.get(set.id) || [];
      const members = setMembers
        .map((sm: any) => modsById.get(String(sm.mod_id)))
        .filter(Boolean) || [];

      if (setMembers.length > 0) {
        setMembers.forEach((sm: any) => processedMods.add(String(sm.mod_id)));
      }

      if (members.length > 0) {
        allItems.push({
          id: `ccset_${set.id}`,
          name: set.name,
          category_override: "Collection",
          image_url: set.image_url || null,
          master_author: set.creator_name || "Unknown Creator",
          description: null,
          created_at: set.created_at,
          url: set.url || null,
          isCollection: true,
          collectionId: set.id,
          flavors: members,
          familyCount: members.length,
          isVirtual: true,
          isParent: true
        });
      }
    }
  }

  modsById.forEach((mod, id) => {
    if (!processedMods.has(id)) {
      allItems.push(mod);
    }
  });

  const nameMap = new Map<string, any>();
  allItems.forEach(item => {
    const name = item.name?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!name) return;

    const existing = nameMap.get(name);
    if (!existing) {
      nameMap.set(name, item);
    } else {
      if ((existing.isVirtual || existing.isParent) && (item.isVirtual || item.isParent)) return;
      if (item.isVirtual || item.isParent) {
        nameMap.set(name, item);
      } else if (existing.isVirtual || existing.isParent) {
        return;
      } else {
        const existingVersions = existing.compatible_versions || [];
        const itemVersions = item.compatible_versions || [];
        const mergedVersions = Array.from(new Set([...existingVersions, ...itemVersions]));
        if (itemVersions.length > existingVersions.length) {
          nameMap.set(name, { ...item, compatible_versions: mergedVersions });
        } else {
          nameMap.set(name, { ...existing, compatible_versions: mergedVersions });
        }
      }
    }
  });

  return Array.from(nameMap.values());
};

