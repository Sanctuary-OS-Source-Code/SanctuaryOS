import { useStore } from './store';
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useModalStore } from "./store/modalStore";
import { supabase } from "./supabase";
import { UniversalCard } from './components/universal/UniversalCard';

export const DeferredRender = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return ready ? <>{children}</> : <div className="flex items-center justify-center p-20 w-full"><div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" /></div>;
};

export const AccordionDrawer = ({ children, isOpen }: { children: React.ReactNode, isOpen: boolean }) => {
  const [render, setRender] = React.useState(isOpen);
  const [visible, setVisible] = React.useState(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setRender(true);
      const timer = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRender(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!render) return null;

  return (
    <div className={`col-span-full overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)] ${visible ? 'max-h-[1000px] opacity-100 scale-100' : 'max-h-0 opacity-0 scale-[0.98]'}`}>
      <div className="pt-4 pb-12 px-2">
        {children}
      </div>
    </div>
  );
};

export const handleOpenUrl = (url: string) => {
  const { useInternalBrowser, setSideBrowserUrl, setIsSideBrowserOpen } = useModalStore.getState();
  if (useInternalBrowser) {
    setSideBrowserUrl(url);
    setIsSideBrowserOpen(true);
  } else {
    openUrl(url);
  }
};

export const standardButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black capitalize tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardGlassButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black capitalize tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardPrimaryButtonClass = "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black capitalize tracking-[0.2em] transition-all hover:theme-bg-accent/20 hover:theme-text-accent hover:theme-border-accent hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.4)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none group";
export const standardSuccessButtonClass = "px-8 py-4 rounded-[var(--radius)] theme-panel-success theme-btn-success text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none hover:shadow-md hover:scale-105 active:scale-95";
export const standardDangerButtonClass = "px-8 py-4 rounded-[var(--radius)] theme-panel-danger theme-btn-danger text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none hover:shadow-md hover:scale-105 active:scale-95";
export const standardAccentGlassButtonClass = "px-8 py-4 rounded-[var(--radius)] theme-panel-accent theme-btn-accent text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none hover:shadow-md hover:scale-105 active:scale-95";

export function ActionButton({ icon, label, onClick, onDoubleClick, disabled, className = "", type = "button", form, children, variant = "default" }: {
  icon?: string;
  label?: React.ReactNode;
  onClick?: (e?: any) => void;
  onDoubleClick?: (e?: any) => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  form?: string;
  children?: React.ReactNode;
  variant?: "default" | "primary" | "success" | "danger" | "accent" | "glass" | "warning" | "world" | "engine" | "solid";
}) {
  let variantClasses = "";
  let borderColorVar = "--accent";
  let customHoverColor = "";

  switch (variant) {
    case "solid":
      variantClasses = "!border-[var(--accent)] !bg-[var(--accent)] !text-[var(--bg)] hover:!bg-[color-mix(in_srgb,var(--accent)_80%,white)] hover:!border-[color-mix(in_srgb,var(--accent)_80%,white)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_40%,transparent)]";
      borderColorVar = "transparent";
      break;
    case "world":
      variantClasses = "!border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] !text-indigo-500 hover:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]";
      customHoverColor = "rgba(99, 102, 241, 0.5)";
      break;
    case "engine":
      variantClasses = "!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] !text-rose-500 hover:!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:shadow-[0_0_20px_rgba(244,63,94,0.2)]";
      customHoverColor = "rgba(244, 63, 94, 0.5)";
      break;
    case "danger":
      variantClasses = "!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] !text-[var(--danger)] hover:!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_20%,transparent)]";
      borderColorVar = "--danger";
      break;
    case "success":
      variantClasses = "!border-[color-mix(in_srgb,var(--success)_30%,transparent)] !bg-[color-mix(in_srgb,var(--success)_5%,transparent)] !text-[var(--success)] hover:!border-[color-mix(in_srgb,var(--success)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--success)_20%,transparent)]";
      borderColorVar = "--success";
      break;
    case "warning":
      variantClasses = "!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] !text-[var(--warning)] hover:!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)]";
      borderColorVar = "--warning";
      break;
    case "accent":
    case "primary":
    case "default":
      variantClasses = "!border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] !text-[var(--accent)] hover:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]";
      borderColorVar = "--accent";
      break;
    case "glass":
      variantClasses = "!border-[color-mix(in_srgb,var(--text)_15%,transparent)] !bg-[color-mix(in_srgb,var(--text)_5%,transparent)] !text-[var(--text)] hover:!border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:!bg-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--text)_10%,transparent)]";
      borderColorVar = "--text";
      break;
  }

  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={disabled}
      className={`${variant === 'solid' ? 'shadow-md border' : 'relative overflow-hidden backdrop-blur-md shadow-lg border hover:shadow-xl'} px-8 py-4 rounded-[var(--radius)] text-[10px] font-black capitalize tracking-[0.2em] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none group ${variantClasses} ${className}`}
      style={!disabled ? { '--tw-hover-border-color': customHoverColor || `color-mix(in srgb, var(${borderColorVar}) 50%, transparent)` } as React.CSSProperties : undefined}
    >
      {variant !== 'solid' && (
        <>
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,white_20%,transparent)] to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,white_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" style={{ backgroundColor: `var(${borderColorVar})` }} />
        </>
      )}
      {icon && <span className="material-symbols-outlined !text-[16px] relative z-10 transition-transform group-hover:-translate-y-0.5">{icon}</span>}
      <span className="relative z-10 flex items-center gap-2">{label}{children}</span>
    </button>
  );
}

export function LoadingScreen({ title, subtitle, icon = "sync" }: { title: string, subtitle?: string, icon?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] rounded-full blur-[100px] opacity-10 pointer-events-none" 
        style={{ backgroundColor: 'var(--accent)' }} />

      <div className="flex flex-col items-center gap-12 relative z-10 text-center">
        <div className="relative w-28 h-28 flex items-center justify-center">
          {/* Outer high-speed ring */}
          <div className="absolute inset-0 rounded-full border-[2px] border-transparent border-t-[var(--accent)] border-r-[color-mix(in_srgb,var(--accent)_30%,transparent)] opacity-80" 
            style={{ animation: 'spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite' }} />
            
          {/* Inner reverse ring */}
          <div className="absolute inset-2 rounded-full border-[1px] border-transparent border-b-[var(--accent)] border-l-[color-mix(in_srgb,var(--accent)_50%,transparent)] opacity-60" 
            style={{ animation: 'spin 3s linear infinite reverse' }} />
            
          {/* Dashed track */}
          <div className="absolute inset-4 rounded-full border-[1px] border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)]" 
            style={{ animation: 'spin 10s linear infinite' }} />

          {/* Core glow */}
          <div className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-5 blur-xl animate-pulse" />

          {/* Icon */}
          <span className={`material-symbols-outlined !text-3xl ${icon === 'sync' ? 'animate-spin' : ''}`}
            style={{ color: 'var(--text)', filter: `drop-shadow(0 0 10px var(--accent))` }}>{icon}</span>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-6 opacity-90">
            <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[var(--accent)] opacity-50" />
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-[var(--text)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
              {title}
            </h2>
            <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[var(--accent)] opacity-50" />
          </div>
          {subtitle && (
            <p className="text-[10px] font-bold text-[var(--subtext)] tracking-[0.2em] uppercase opacity-50">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PanelHeaderGroup({ children, className = "" }: any) {
   return (
      <div className={`flex items-center bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl shadow-xl p-1.5 gap-1 shrink-0 ${className}`}>
         {children}
      </div>
   );
}

export function PanelHeaderButton({
   icon,
   label,
   tooltip,
   onClick,
   disabled = false,
   variant = "default",
   isActive = false,
   tooltipAlign = "center",
   tooltipVariant,
   className = ""
}: any) {
   let colorClass = "text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";

   if (isActive) {
      if (variant === "accent" || variant === "default") colorClass = "!text-[var(--accent)] !opacity-100 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--accent)_10%,transparent)]";
      else if (variant === "error" || variant === "danger") colorClass = "!text-[var(--danger)] !opacity-100 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--danger)_10%,transparent)]";
      else if (variant === "success") colorClass = "!text-[var(--success)] !opacity-100 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--success)_10%,transparent)]";
   } else {
      if (variant === "error" || variant === "danger") {
         colorClass = "text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]";
      } else if (variant === "success") {
         colorClass = "text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]";
      } else if (variant === "warning") {
         colorClass = "text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]";
      }
   }

   if (disabled) {
      colorClass = "text-[var(--text)] opacity-30 cursor-not-allowed";
   }

   const tVariant = tooltipVariant || (variant === "default" || variant === "accent" ? "info" : variant);

   return (
      <div className={`relative group/btn shrink-0 ${className}`}>
         <button
            onClick={(e) => { if (!disabled && onClick) onClick(e); }}
            className={`flex items-center justify-center transition-all rounded-[10px] ${!disabled ? 'active:scale-95' : ''} ${label ? 'px-4 h-9 gap-2' : 'w-9 h-9'} ${colorClass}`}
         >
            <span className={`material-symbols-outlined ${label ? '!text-[15px] normal-case' : '!text-[18px]'}`}>{icon}</span>
            {label && <span className="text-[10px] font-bold capitalize tracking-wider">{label}</span>}
         </button>
         {tooltip && (
            <HoverTooltip title={tooltip} variant={disabled ? "error" : tVariant} align={tooltipAlign} vAlign="bottom" className="z-[100]" />
         )}
      </div>
   );
}

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
    return filename.split('.').pop()?.toUpperCase() || "FILE";
  }
  const ext = Object.keys(schema.extensions.labels).find(e => filename.toLowerCase().endsWith(e.toLowerCase()));
  return ext ? schema.extensions.labels[ext] : (filename.split('.').pop()?.toUpperCase() || "UNKNOWN");
};

export const cleanSearchName = (raw: string, schema?: any) => {
  if (!raw) return "";
  const parts = raw.split(/[/\\]/);
  let name = parts[parts.length - 1];

  if (schema) {
    name = name.replace(getExtensionRegex(schema), "");
  } else if (name.includes('.')) {
    const splitExt = name.split('.');
    splitExt.pop();
    name = splitExt.join('.');
  }
  return name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
};

let _cachedExtSchema: any = null;
let _cachedExtRegex: RegExp | null = null;
export const getExtensionRegex = (schema: any) => {
  const cacheKey = JSON.stringify(schema?.extensions?.supported || []);
  if (_cachedExtSchema === cacheKey && _cachedExtRegex) return _cachedExtRegex;
  const exts = schema?.extensions?.supported || [];
  let regex;
  if (exts.length === 0) {
    regex = /\.[a-z0-9]+$/i;
  } else {
    regex = new RegExp(`\\.(${exts.map((e: any) => e.replace('.', '')).join('|')})$`, 'i');
  }
  _cachedExtSchema = cacheKey;
  _cachedExtRegex = regex;
  return regex;
};

export const isSupportedExtension = (filename: string, schema: any): boolean => {
  if (!filename || !schema || !schema.extensions || !schema.extensions.supported) return false;
  return schema.extensions.supported.some((ext: string) => filename.toLowerCase().endsWith(ext.toLowerCase()));
};

export const DLC_MAP: Record<string, string> = {};

export const loadDLCMap = async () => {
  try {
    if (!navigator.onLine) return;
    const { data } = await supabase.from('dlc_registry').select('id, name');
    if (data && data.length > 0) {
      for (const key of Object.keys(DLC_MAP)) {
        delete DLC_MAP[key];
      }
      data.forEach((d: any) => {
        DLC_MAP[d.id.toUpperCase()] = d.name;
      });
    }
  } catch (e) {
    console.error("Failed to load DLC map from DB", e);
  }
};

export const LOCAL_DLC_MAP: Record<string, string> = {
  "EP01": "Get to Work", "EP02": "Get Together", "EP03": "City Living", "EP04": "Cats & Dogs", "EP05": "Seasons", "EP06": "Get Famous", "EP07": "Island Living", "EP08": "Discover University", "EP09": "Eco Lifestyle", "EP10": "Snowy Escape", "EP11": "Cottage Living", "EP12": "High School Years", "EP13": "Growing Together", "EP14": "Horse Ranch", "EP15": "For Rent", "EP16": "Lovestruck", "EP17": "Life & Death",
  "GP01": "Outdoor Retreat", "GP02": "Spa Day", "GP03": "Dine Out", "GP04": "Vampires", "GP05": "Parenthood", "GP06": "Jungle Adventure", "GP07": "StrangerVille", "GP08": "Realm of Magic", "GP09": "Star Wars: Journey to Batuu", "GP10": "Dream Home Decorator", "GP11": "My Wedding Stories", "GP12": "Werewolves",
  "SP01": "Luxury Party", "SP02": "Perfect Patio", "SP03": "Cool Kitchen", "SP04": "Spooky Stuff", "SP05": "Movie Hangout", "SP06": "Romantic Garden", "SP07": "Kids Room", "SP08": "Backyard Stuff", "SP09": "Vintage Glamour", "SP10": "Bowling Night", "SP11": "Fitness Stuff", "SP12": "Toddler Stuff", "SP13": "Laundry Day", "SP14": "First Pet", "SP15": "Moschino", "SP16": "Tiny Living", "SP17": "Nifty Knitting", "SP18": "Paranormal", "SP46": "Home Chef Hustle", "SP47": "Crystal Creations",
  "SP22": "Throwback Fit Kit", "SP23": "Country Kitchen Kit", "SP24": "Bust the Dust Kit", "SP64": "Riviera Retreat Kit", "SP65": "Cozy Bistro Kit", "SP68": "SpongeBob’s House Kit", "SP70": "SpongeBob Kid’s Room Kit", "SP75": "Wonderland Playroom Set", "SP81": "Prairie Dreams Set", "SP82": "Yard Charm Kit"
};

export const mapDlcCode = (code: string) => {
  let baseCode = code.split(' ')[0].toUpperCase();
  baseCode = baseCode.replace(/^([A-Z]+)(\d)$/, '$10$2');
  return DLC_MAP[baseCode] || LOCAL_DLC_MAP[baseCode] || code;
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
    if (cleanReq.toLowerCase() === 'vlocal' || cleanReq.toLowerCase() === 'any' || cleanReq.toLowerCase() === 'all') return true;
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

export function ViewHeader({ title, subtitle, icon, iconColorClass = "text-[var(--accent)]", children, onSubtitleClick, onTitleClick, breadcrumb, shape = "circle" }: any) {
  const shapeClass = shape === "square" ? "rounded-[calc(var(--radius)-4px)]" : "rounded-[var(--radius)]";
  return (
    <header className="flex flex-col xl:flex-row w-full justify-start items-start mb-6 shrink-0 gap-6">
      <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
        {icon && (
          <div className={`w-10 h-10 ${shapeClass} flex items-center justify-center shrink-0 border glass-panel relative group shadow-md`}>
            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {typeof icon === "string" ? (
              <span className={`material-symbols-outlined !text-[20px] relative z-10 ${iconColorClass}`}>{icon}</span>
            ) : (
              icon
            )}
          </div>
        )}
        <div className="flex flex-col gap-1 items-start text-left flex-1 min-w-0">
          <div className="flex items-center gap-2 w-full">
            <h1
              className={`text-2xl font-semibold tracking-tight leading-tight m-0 text-left text-[var(--text)] shrink-0 transition-colors ${onTitleClick ? 'hover:theme-text-accent cursor-pointer' : ''}`}
              onClick={onTitleClick}
            >
              {title}
            </h1>
            {breadcrumb && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--subtext)] opacity-40 font-semibold text-2xl leading-none">/</span>
                <span className="text-2xl font-medium tracking-tight text-[var(--subtext)] animate-in fade-in slide-in-from-left-2 duration-300 leading-tight">
                  {breadcrumb}
                </span>
              </div>
            )}
          </div>
          {subtitle && (
            <h2
              className={`text-[11px] font-medium tracking-wide text-[var(--subtext)] m-0 text-left opacity-80 leading-snug line-clamp-2 max-w-2xl ${onSubtitleClick ? 'hover:theme-text-accent cursor-pointer transition-colors' : ''}`}
              onClick={onSubtitleClick}
            >
              {subtitle}
            </h2>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-3 w-full xl:w-auto xl:justify-end xl:ml-auto">
          {children}
        </div>
      )}
    </header>
  );
}

export function ModSearchDropdown({ modList, onSelect, placeholder, selectedItem, onClear, dropUp, className }: any) {
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
          className={className || "w-full h-12 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-5 text-[var(--text)] text-[11px] font-black capitalize tracking-widest focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all relative"}
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
      {isOpen && !selectedItem && (
        (() => {
          const rect = inputRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const spaceBelow = window.innerHeight - rect.bottom;
          const shouldDropUp = spaceBelow < 300;

          return (
            <>
              <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 300000 }} onClick={() => setIsOpen(false)} />
              <div className="fixed glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-2xl pointer-events-auto max-h-60 overflow-y-auto custom-scrollbar flex flex-col" style={{
                zIndex: 300001,
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
                      <span className="text-[11px] font-black text-[var(--text)] capitalize">{m.displayName || m.name.split('/').pop()}</span>
                      {m.file_extension && (
                        <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[8px] font-mono opacity-80 capitalize border border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                          {m.file_extension}
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] font-mono text-[var(--subtext)] opacity-60">
                      {m.version_label ? `Version(s): ${m.version_label}` : (m.master_author || m.author || (m.created_at ? `Created: ${new Date(m.created_at).toLocaleDateString()}` : `ID: ${m.id?.substring(0, 8).toUpperCase()}`))}
                    </span>
                  </button>
                ))}
                {results.length === 0 && <div className="p-5 text-center text-[10px] text-[var(--subtext)] font-bold capitalize">{t("shared_no_signatures")}</div>}
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}

export function SidebarActionButton({ id, icon, label, subtext, active, onClick, danger, success, customColorClass, className, iconClassName }: any) {
  const { t } = useLexicon();
  return (
    <button
      onClick={() => onClick(id)}
      className={`glass-surface w-full px-5 py-4 h-auto min-h-[64px] flex items-center justify-start gap-4 rounded-[var(--radius)] font-black text-[10px] capitalize tracking-widest transition-all duration-300 group ${customColorClass ? customColorClass :
        active
          ? '!border-[var(--accent)] !text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] scale-[1.02]'
          : danger
            ? 'text-[var(--danger)] hover:!border-[var(--danger)]'
            : success
              ? 'text-[var(--success)] hover:!border-[var(--success)]'
              : 'text-[var(--text)] hover:!border-[var(--text)] hover:text-[var(--accent)]'
        } ${className || ''}`}
      style={(active || danger || success) ? { '--panelTint': active ? 'var(--accent)' : danger ? 'var(--danger)' : 'var(--success)' } as React.CSSProperties : undefined}
    >
      {icon && <span className={`material-symbols-outlined !text-[20px] shrink-0 relative z-10 transition-transform duration-300 group-hover:scale-110 ${active ? 'opacity-100 drop-shadow-md' : 'opacity-80'} ${iconClassName || ''}`}>{icon}</span>}
      <div className="flex flex-col items-start gap-1 relative z-10 w-full pr-6 overflow-hidden">
        <span className="tracking-[0.15em] truncate w-full text-left pt-0.5">{label}</span>
        {subtext && <span className="text-[8px] font-bold opacity-60 normal-case tracking-normal whitespace-normal text-left leading-tight mt-0.5 w-full">{subtext}</span>}
      </div>

      <span className={`material-symbols-outlined !text-[16px] shrink-0 absolute right-5 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 ${active ? 'opacity-100 translate-x-0' : ''}`}>{t("icon_chevron_right")}</span>
    </button>
  );
}

export function HubActionButton({ icon, label, onClick, className = "", isDanger = false, isWarning = false }: any) {
  return (
    <button
      onClick={onClick}
      className={`glass-surface h-10 px-5 !rounded-full transition-all duration-300 flex items-center justify-center gap-2 shrink-0 font-black capitalize tracking-widest group ${isDanger ? '!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-red-500 hover:text-red-400'
        : isWarning ? '!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-amber-500 hover:text-amber-400'
          : 'text-[var(--text)] hover:text-[var(--accent)] hover:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)]'
        } ${className}`}
      style={(isDanger || isWarning) ? { '--panelTint': isDanger ? 'var(--danger)' : 'var(--warning)' } as React.CSSProperties : undefined}
    >
      <span className={`material-symbols-outlined !text-[18px] transition-transform ${isDanger ? 'animate-bounce' : 'opacity-70 group-hover:opacity-100 group-hover:scale-110'}`}>
        {icon}
      </span>
      <span className="text-[10px]">{label}</span>
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
    <FilterTabs className={className}>
      {tabs.map((tab: any) => (
        <FilterTabButton key={tab.id} {...tab} activeTab={activeTab} setTab={setTab} />
      ))}
    </FilterTabs>
  );
}

export function FilterTabs({ children, className = "", icon = "tune", label, buttonClassName = "" }: any) {
  const childrenArray = React.Children.toArray(children);
  if (childrenArray.length === 0) return null;

  const firstChild: any = childrenArray[0];
  const activeTab = firstChild?.props?.activeTab;
  const setTab = firstChild?.props?.setTab;

  const options = childrenArray.map((child: any) => ({
    id: child.props.id,
    label: child.props.label || child.props.children,
    icon: child.props.icon
  })).filter((o: any) => o.id !== undefined);

  return (
    <FilterPopover
      icon={icon}
      label={label}
      options={options}
      activeTab={activeTab}
      setTab={setTab}
      className={className}
      buttonClassName={buttonClassName}
    />
  );
}

export function FilterTabButton({ id, icon, label, activeTab, setTab, className = "", children }: any) {
  return <></>;
}

export function ViewToggle({ options, activeTab, setTab, className = "" }: any) {
  return (
    <div className={`flex items-center gap-1 p-1 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner rounded-full w-fit ${className}`}>
      {options.map((opt: any) => {
        const isActive = activeTab === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id)}
            className={`h-7 px-4 flex items-center justify-center gap-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${isActive
              ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)] shadow-[0_2px_10px_rgba(0,0,0,0.2)]'
              : 'border border-transparent text-[var(--subtext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
              }`}
          >
            {opt.icon && <span className="material-symbols-outlined !text-[14px]">{opt.icon}</span>}
            <span className="leading-none pt-0.5">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FilterPopover({ icon = "tune", label, options, activeTab, setTab, multiSelect = false, className = "", buttonClassName = "", children }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  const handleSelect = (id: string) => {
    if (multiSelect) {
      const current = Array.isArray(activeTab) ? activeTab : (activeTab ? [activeTab] : []);
      const newVals = current.includes(id) ? current.filter((v: any) => v !== id) : [...current, id];
      setTab(newVals);
    } else {
      setTab(id);
      setIsOpen(false);
    }
  };

  const isOptionActive = (id: string) => {
    if (multiSelect) {
      return Array.isArray(activeTab) ? activeTab.includes(id) : activeTab === id;
    }
    return activeTab === id;
  };

  const hasActiveFilter = multiSelect
    ? (Array.isArray(activeTab) && activeTab.length > 0)
    : (activeTab !== undefined && activeTab !== null && String(activeTab).toLowerCase() !== "all" && String(activeTab).toLowerCase() !== "any");

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center gap-2 h-12 ${label ? 'px-5' : 'w-12'} rounded-[calc(var(--radius)-4px)] transition-all duration-300 backdrop-blur-[3px] ${hasActiveFilter || isOpen
          ? 'border border-[var(--accent)] text-[var(--accent)] bg-transparent shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]'
          : 'glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:theme-border-accent'
          } ${buttonClassName}`}
      >
        <span className="material-symbols-outlined !text-[20px]">{icon}</span>
        {label && <span className="text-[10px] font-black uppercase tracking-widest leading-none pt-0.5">{label}</span>}
      </button>

      {isOpen && (
        (() => {
          const portalRoot = document.getElementById("sa-portals");
          if (!portalRoot) return null;

          const rect = btnRef.current?.getBoundingClientRect();
          const isRightSide = (rect?.left || 0) >= window.innerWidth / 2;

          return createPortal(
            <>
              <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 200000 }} onClick={() => setIsOpen(false)} />
              <div
                className="fixed glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(var(--accent-rgb),0.15)] pointer-events-auto animate-in fade-in zoom-in-95 duration-200 min-w-[200px] p-2 flex flex-col gap-1 backdrop-blur-2xl bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]"
                style={{
                  zIndex: 200001,
                  top: rect ? rect.bottom + 8 : 0,
                  left: rect ? (isRightSide ? rect.right : rect.left) : 0,
                  transform: isRightSide ? 'translateX(-100%)' : undefined,
                  width: 'max-content',
                }}
              >
                {children ? children : options?.map((opt: any) => {
                  const active = isOptionActive(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSelect(opt.id)}
                      className={`flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg transition-all duration-300 group relative overflow-hidden ${active
                        ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.2)]'
                        : 'text-[var(--text)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
                        }`}
                    >
                      {multiSelect && (
                        <div className={`absolute left-4 w-4 h-4 rounded-[4px] border-[1.5px] flex items-center justify-center transition-colors shrink-0 ${active ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--bg)]' : 'border-[color-mix(in_srgb,var(--text)_30%,transparent)] group-hover:border-[var(--text)]'}`}>
                          {active && <span className="material-symbols-outlined !text-[12px] font-bold">check</span>}
                        </div>
                      )}
                      <span className={`text-[11px] font-black capitalize tracking-widest leading-none pt-0.5 text-center ${active ? 'drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]' : ''}`}>{opt.label}</span>
                      {active && !multiSelect && (
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] absolute right-4 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]">check</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>,
            portalRoot
          );
        })()
      )}
    </div>
  );
}

export function RadioCardGroup({ children, className = "" }: any) {
  return (
    <div className={`grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 w-full ${className}`}>
      {children}
    </div>
  );
}

export function RadioCard({ id, icon, label, description, activeValue, onChange, className = "" }: any) {
  const isActive = activeValue === id;
  return (
    <button
      type="button"
      onClick={() => onChange(id)}
      className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border transition-all duration-300 ${isActive
        ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[var(--accent)] text-[var(--accent)] shadow-lg scale-[1.02] z-10'
        : 'glass-panel bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
        } ${className}`}
    >
      {icon && <span className={`material-symbols-outlined !text-3xl mb-1 ${isActive ? 'scale-110 drop-shadow-[0_0_10px_currentColor]' : 'opacity-70'} transition-all duration-500`}>{icon}</span>}
      <span className="text-[11px] font-black uppercase tracking-widest leading-none text-center pt-1">{label}</span>
      {description && <span className="text-[9px] font-bold text-center opacity-60 mt-1 leading-relaxed">{description}</span>}
    </button>
  );
};

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
        className={`w-full h-full px-4 py-3 flex items-center justify-center gap-2 font-black text-xs capitalize tracking-widest transition-all whitespace-nowrap ${isActiveGroup || isOpen
          ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-md'
          : 'text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)] opacity-60 hover:opacity-100'
          }`}
      >
        {displayIcon && <span className="material-symbols-outlined !text-lg">{displayIcon}</span>}
        {displayLabel}
        <span className="material-symbols-outlined !text-md ml-1 opacity-50">{isOpen ? 'expand_less' : 'expand_more'}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 200000 }} onClick={() => setIsOpen(false)} />
          <div
            ref={menuRef}
            className="absolute mt-2 min-w-[200px] glass-panel border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-[calc(var(--radius)-4px)] shadow-xl pointer-events-auto flex flex-col p-1 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-md"
            style={{
              zIndex: 200001,
              top: 'calc(100% + 4px)',
              right: (btnRef.current?.getBoundingClientRect().left || 0) >= window.innerWidth / 2 ? 0 : undefined,
              left: (btnRef.current?.getBoundingClientRect().left || 0) < window.innerWidth / 2 ? 0 : undefined,
              width: Math.max(200, btnRef.current?.getBoundingClientRect().width || 0),
            }}
          >
            <div className="px-3 py-2 text-[12px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-50 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-1">{label}</div>
            {options.map((opt: any) => (
              <button
                key={opt.id}
                onClick={() => { setTab(opt.id); setIsOpen(false); }}
                className={`px-4 py-3 w-full flex items-center gap-3 rounded-lg text-[12px] font-black capitalize tracking-widest transition-all text-left ${activeTab === opt.id
                  ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]'
                  : 'text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
                  }`}
              >
                {opt.icon && <span className="material-symbols-outlined !text-md opacity-80">{opt.icon}</span>}
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function VerticalTabButton({ id, icon, label, activeTab, setTab, badge, badgeColorClass }: any) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group
        ${isActive
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] backdrop-blur-md border border-transparent"
          : "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent"
        }`}
    >
      {/* Sweep Micro-Animation on Hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />

      {icon && (
        <span className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${isActive ? "scale-110" : "group-hover:scale-110"}`}>
          {icon}
        </span>
      )}
      <span
        className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 relative z-10 text-left flex-1"
        style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
      >
        {label}
      </span>
      {badge !== undefined && badge !== null && (
        <span className={`ml-2 px-2 py-0.5 rounded-[calc(var(--radius)-6px)] border text-[10px] font-black shrink-0 relative z-10 ${badgeColorClass ? badgeColorClass : isActive ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)]'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function VerticalTabDropdown({ icon, label, options, activeTab, setTab }: any) {
  const [isOpen, setIsOpen] = useState(false);

  const isActiveGroup = options.some((opt: any) => opt.id === activeTab);
  const activeOption = options.find((opt: any) => opt.id === activeTab);
  const displayLabel = activeOption ? activeOption.label : label;
  const displayIcon = activeOption?.icon || icon;

  return (
    <div className="w-full flex flex-col mb-1 shrink-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group
          ${isActiveGroup
            ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] backdrop-blur-md border border-transparent"
            : "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent"
          }`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10 overflow-hidden flex-1 text-left">
          {displayIcon && (
            <span className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 ${isActiveGroup ? "scale-110" : "group-hover:scale-110"}`}>
              {displayIcon}
            </span>
          )}
          <span
            className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 flex-1"
            style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
          >
            {displayLabel}
          </span>
        </div>
        <span className="material-symbols-outlined !text-[18px] opacity-50 relative z-10 shrink-0">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-1 mt-1 pl-8 relative before:content-[''] before:absolute before:left-[1.35rem] before:top-2 before:bottom-2 before:w-[2px] before:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] before:rounded-full shrink-0">
          {options.map((opt: any) => (
            <button
              key={opt.id}
              onClick={() => { setTab(opt.id); setIsOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 relative overflow-hidden group
                ${activeTab === opt.id
                  ? "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
                  : "text-[var(--sidebartext)] opacity-60 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                }`}
            >
              {opt.icon && <span className={`material-symbols-outlined !text-[18px] transition-all duration-500 shrink-0 ${activeTab === opt.id ? "scale-110" : "group-hover:scale-110"}`}>{opt.icon}</span>}
              <span className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 text-left flex-1" style={{ fontSize: "10px" }}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HoverTabDrawer({ title = "Navigation", tabs, activeTab, setTab, children, footer, position = "right", className = "", panelClassName = "", panelStyle = {}, onHoverChange }: any) {
  const isLeft = position === "left";
  return (
    <div 
      className={`fixed ${isLeft ? 'left-0' : 'right-0'} top-[72px] bottom-[24px] z-[9999] group flex ${isLeft ? 'justify-start' : 'justify-end'} w-12 hover:w-[284px] transition-all duration-0 pointer-events-none ${className}`}
      onMouseEnter={() => onHoverChange && onHoverChange(true)}
      onMouseLeave={() => onHoverChange && onHoverChange(false)}
    >

      {/* Invisible Trigger Area */}
      <div className={`absolute ${isLeft ? 'left-0' : 'right-0'} top-0 bottom-0 w-6 pointer-events-auto`} />

      {/* Invisible Expanded Area Catcher */}
      <div className="absolute inset-0 pointer-events-none group-hover:pointer-events-auto" />

      {/* Sliding Panel */}
      <div 
        className={`h-full w-[260px] ${isLeft ? 'ml-6 rounded-3xl -translate-x-[calc(100%+40px)]' : 'mr-6 rounded-3xl translate-x-[calc(100%+40px)]'} shrink-0 glass-panel group-hover:translate-x-0 transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)] flex flex-col items-start pt-6 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative pointer-events-auto border border-[color-mix(in_srgb,var(--text)_5%,transparent)] ${panelClassName}`}
        style={panelStyle}
      >

        <div className="w-full px-6 mb-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100 shrink-0">
          <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">{isLeft ? 'folder_open' : 'swipe_left'}</span>
          <div className="font-black text-[10px] tracking-widest text-[var(--subtext)] capitalize">{title}</div>
        </div>

        <div className="flex flex-col w-full gap-2 px-3 overflow-y-auto accent-scrollbar pb-6 flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
          {tabs && tabs.map((tab: any) => (
            <VerticalTabButton key={tab.id} {...tab} activeTab={activeTab} setTab={setTab} />
          ))}
          {children}
        </div>

        {footer && (
          <div className="w-full px-3 pb-4 mt-auto opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100 shrink-0 flex flex-col gap-1">
            <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent mb-2" />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export function SidebarFooterButton({ icon, label, onClick, variant = "default", className = "" }: any) {
  let variantClasses = "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)] border-transparent";

  if (variant === "danger") {
    variantClasses = "text-[var(--danger)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)] border-transparent";
  } else if (variant === "success") {
    variantClasses = "text-[var(--success)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:text-[var(--success)] border-transparent";
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group ${variantClasses} ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />

      {icon && (
        <span className={`material-symbols-outlined !text-[20px] transition-all duration-500 shrink-0 relative z-10 group-hover:scale-110`}>
          {icon}
        </span>
      )}
      <span
        className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 relative z-10 text-left flex-1"
        style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
      >
        {label}
      </span>
    </button>
  );
}

export function CustomDropdown({ value, selectedValues = [], options, onChange, placeholder, multiSelect, searchable, disableTint, className, buttonClassName, flat, allowCustom }: any) {
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
    if (allowCustom && !selected && value) return value;
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
    : value !== undefined && value !== null && String(value).trim() !== "" && String(value).toLowerCase() !== "all" && String(value).toLowerCase() !== "any" && String(value).toLowerCase() !== "vlocal");

  const dropdownMenu = isOpen ? createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 300000 }} onClick={() => setIsOpen(false)} />
      <div className="fixed glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[calc(var(--radius)-4px)] shadow-xl animate-in fade-in max-h-60 overflow-y-auto custom-scrollbar flex flex-col" style={{
        zIndex: 300001,
        top: btnRef.current ? btnRef.current.getBoundingClientRect().bottom + 4 : 0,
        left: btnRef.current ? btnRef.current.getBoundingClientRect().left : 0,
        width: btnRef.current ? btnRef.current.getBoundingClientRect().width : 'max-content',
        minWidth: btnRef.current ? btnRef.current.getBoundingClientRect().width : 200,
      }}>
        {searchable && (
          <div className="border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] sticky top-0 bg-transparent z-10 shrink-0 flex items-center px-4">
            <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] mr-3 opacity-60">search</span>
            <input
              type="text"
              placeholder={t("shared_search") || "Search"}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-transparent border-none py-3.5 text-xs font-black text-[var(--text)] focus:outline-none placeholder-[var(--subtext)] placeholder:opacity-40 tracking-wider min-w-0"
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {(options || []).filter((opt: any) => {
            if (!searchable || !query) return true;
            const searchTarget = opt.searchText !== undefined ? opt.searchText : (typeof opt.label === 'string' ? opt.label : '');
            return searchTarget.toLowerCase().includes(query.toLowerCase());
          }).map((o: any, index: number) => {
            const isSelected = multiSelect ? selectedValues.includes(o.id) : String(o.id) === String(value);
            return (
              <button type="button" key={`${o.id}-${index}`} onClick={() => handleSelect(o.id)} className={`w-full text-left px-4 py-3 text-sm font-bold transition-all border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex items-center justify-start ${isSelected ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-[inset_2px_0_0_var(--accent)]' : 'text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <span className={`text-[11px] font-black capitalize w-full flex items-center ${isSelected ? 'text-[var(--accent)]' : o.className || 'text-[var(--text)]'}`}>{o.label}</span>
                {isSelected && !multiSelect && (
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] absolute right-4 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]">check</span>
                )}
              </button>
            );
          })}
          {searchable && query && (options || []).filter((opt: any) => {
            const searchTarget = opt.searchText !== undefined ? opt.searchText : (typeof opt.label === 'string' ? opt.label : '');
            return searchTarget.toLowerCase().includes(query.toLowerCase());
          }).length === 0 && !allowCustom && (
              <div className="p-4 text-center text-xs font-bold text-[var(--subtext)] opacity-60">{t("shared_no_options")}</div>
            )}
          {searchable && query && allowCustom && !(options || []).some((o: any) => String(o.id).toLowerCase() === query.toLowerCase() || (typeof o.label === 'string' && o.label.toLowerCase() === query.toLowerCase())) && (
            <button type="button" onClick={() => handleSelect(query)} className="w-full text-left px-4 py-3 text-sm font-bold transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] flex items-center gap-2">
              <span className="material-symbols-outlined !text-[16px] opacity-60">add</span>
              <span className="text-[11px] font-black capitalize w-full">Create "{query}"</span>
            </button>
          )}
        </div>
      </div>
    </>,
    document.getElementById('sa-portals') || document.body
  ) : null;

  return (
    <div className={`relative ${className?.includes('w-') ? '' : 'w-full'} ${className || ''}`}>
      <button type="button" ref={btnRef} onClick={() => setIsOpen(!isOpen)} className={`w-full flex justify-start items-center focus:outline-none relative z-[10] transition-all ${flat ? 'bg-transparent border-b-2 border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[var(--accent)] px-0 py-1 text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-90' : `${className ? 'h-full px-4 rounded-full' : 'h-12 px-5 rounded-[12px]'} text-sm font-bold ${isActive ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-[calc(var(--radius)-4px)] text-[var(--accent)] shadow-md' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] focus:border-[var(--accent)] transform-gpu'}`} ${buttonClassName || ''}`}>
        <span className="pr-4 flex-1 text-left flex items-center h-full capitalize overflow-hidden">{getSelectedLabel()}</span>
        <span className={`transition-colors shrink-0 flex items-center justify-center ${isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)]'}`}><span className={`material-symbols-outlined ${flat ? '!text-[16px]' : '!text-[20px]'}`}>{isOpen ? 'expand_less' : 'expand_more'}</span></span>
      </button>
      {dropdownMenu}
    </div>
  );
}

export function GameVersionMultiSelect({ selectedVersions, onChange }: { selectedVersions: string[], onChange: (v: string[]) => void }) {
  selectedVersions = Array.isArray(selectedVersions) ? selectedVersions : (typeof selectedVersions === 'string' ? [selectedVersions] : []);
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
          <span key={v} className="px-2.5 py-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-md text-[9px] font-black capitalize flex items-center gap-2">{v} <button type="button" onClick={() => toggleVersion(v)} className="text-red-400 hover:text-red-300 flex items-center justify-center"><span className="material-symbols-outlined !text-[12px]">{t("icon_close")}</span></button></span>
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
        className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-5 h-12 text-[var(--text)] text-[11px] font-black capitalize tracking-widest focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all placeholder:opacity-30"
      />
      {isOpen && (
        <>
          <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 200000 }} onClick={() => setIsOpen(false)} />
          <div className="fixed mt-2 glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[calc(var(--radius)-4px)] shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-top-2 flex flex-col" style={{
            zIndex: 200001,
            top: containerRef.current?.getBoundingClientRect().bottom,
            left: (containerRef.current?.getBoundingClientRect().left || 0) < window.innerWidth / 2
              ? containerRef.current?.getBoundingClientRect().left
              : undefined,
            right: (containerRef.current?.getBoundingClientRect().left || 0) >= window.innerWidth / 2
              ? window.innerWidth - (containerRef.current?.getBoundingClientRect().right || 0)
              : undefined,
            width: containerRef.current?.getBoundingClientRect().width,
          }}>
            <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col p-1">
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
                  className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 text-[11px] font-black capitalize text-[var(--text)] flex justify-start cursor-pointer"
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
                  className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 text-[11px] font-black capitalize text-emerald-400 cursor-pointer"
                >
                  + {t("cc_btn_add")} "{query}"
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CustomDatePicker({ value, onChange, placeholder, className = "" }: { value: string | null, onChange: (date: string | null) => void, placeholder?: string, className?: string }) {
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
    <div className={`relative w-full ${className}`}>
      <button ref={btnRef} onClick={() => setIsOpen(!isOpen)} className="w-full h-12 px-5 rounded-[calc(var(--radius)-4px)] glass-surface outline-none transition-all shadow-inner flex justify-start items-center text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-[10]">
        <span className="truncate pr-4">{value ? new Date(value).toLocaleDateString() : (placeholder || "Select Date...")}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span onClick={(e) => { e.stopPropagation(); onChange(null); }} className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-60 hover:opacity-100 transition-all cursor-pointer rounded-full hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] p-0.5">
              close
            </span>
          )}
          <span className="text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined !text-[20px]">{isOpen ? 'expand_less' : 'expand_more'}</span>
          </span>
        </div>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 200000 }} onClick={() => setIsOpen(false)} />
          <div className="fixed mt-2 glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[calc(var(--radius)-4px)] shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-top-2 p-4 w-64" style={{
            zIndex: 200001,
            top: btnRef.current?.getBoundingClientRect().bottom,
            left: (btnRef.current?.getBoundingClientRect().left || 0) < window.innerWidth / 2
              ? btnRef.current?.getBoundingClientRect().left
              : undefined,
            right: (btnRef.current?.getBoundingClientRect().left || 0) >= window.innerWidth / 2
              ? window.innerWidth - (btnRef.current?.getBoundingClientRect().right || 0)
              : undefined,
            minWidth: btnRef.current?.getBoundingClientRect().width,
          }}>
            <div className="flex justify-start items-center mb-4">
              <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="text-[var(--subtext)] hover:text-[var(--text)] px-2 py-1">{'<'}</button>
              <div className="text-[11px] font-black capitalize tracking-widest text-[var(--text)]">{monthNames[month]} {year}</div>
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
                    className={`p-1.5 text-[10px] rounded-lg transition-all ${isSelected ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] font-black shadow-md backdrop-blur-sm scale-[1.05] relative z-10' : isToday ? 'border border-[color-mix(in_srgb,var(--text)_20%,transparent)] font-bold' : 'border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
        </>
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

export function CustomClassificationDropdown({ value, onChange, className, buttonClassName, flat }: { value: string, onChange: (val: string) => void, className?: string, buttonClassName?: string, flat?: boolean }) {
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
        className={className}
        buttonClassName={buttonClassName}
        flat={flat}
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
            <span key={i} className="material-symbols-outlined !text-[1.1em] align-middle px-1 inline-block">
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
    .replace(/<img[^>]*>/gi, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export const PanelDepthContext = React.createContext(0);

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
  panelClass,
  panelStyle,
  position,
  keepMounted = false,
  forceShowCloseBtn = false,
  coverImage,
  hideCloseButton = false
}: {
  isOpen: boolean,
  onClose: () => void,
  title?: React.ReactNode | string,
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
  panelClass?: string,
  panelStyle?: React.CSSProperties,
  position?: "left" | "right",
  keepMounted?: boolean,
  coverImage?: string, forceShowCloseBtn?: boolean,
  hideCloseButton?: boolean
}) {
  const { t } = useLexicon();
  const theme = useTheme();
  const depth = React.useContext(PanelDepthContext);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
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

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
    } else if (shouldRender && !keepMounted) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, 500); // Wait for the 0.5s slide-out animation
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender, keepMounted]);

  if (!shouldRender && !keepMounted) return null;

  const calculatedBackdropZ = 40000 + (depth * 10);
  const calculatedPanelZ = 40000 + (depth * 10) + 1;
  const parsedBackdropZ = parseInt(backdropZ.replace(/\D/g, '')) || 40000;
  const parsedPanelZ = parseInt(panelZ.replace(/\D/g, '')) || 40001;
  const finalBackdropZ = depth > 0 ? calculatedBackdropZ : parsedBackdropZ;
  const finalPanelZ = depth > 0 ? calculatedPanelZ : parsedPanelZ;

  const panelContent = (
    <PanelDepthContext.Provider value={depth + 1}>
      <div className={`sa-side-panel-wrapper ${isOpen && !isAnimatingOut ? 'sa-panel-open' : ''}`} data-depth={depth} style={keepMounted && (!isOpen || isAnimatingOut) ? { opacity: 0, pointerEvents: 'none', transition: 'opacity 0.2s ease-in-out' } : { opacity: 1, pointerEvents: 'auto', transition: 'opacity 0.2s ease-in-out' }}>
        {isResizing && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
        <div
          className={`sa-side-panel-backdrop fixed inset-0 z-0 ${depth > 0 || noBackdropDim ? 'bg-transparent' : 'bg-black/10 backdrop-blur-[3px]'} ${isAnimatingOut ? 'animate-out fade-out opacity-0 duration-500' : 'animate-in fade-in duration-500'}`}
          style={{ zIndex: finalBackdropZ }}
          onClick={onClose}
        />
        <div
          ref={panelRef}
          className={`sa-side-panel-window ${position === 'left' ? 'sa-panel-left' : 'sa-panel-right'} fixed top-[0px] bottom-[0px] ${position === 'left' ? 'left-[var(--sidebarWidth,288px)]' : 'right-0'} overflow-hidden ${isResizable ? '' : widthClass} ${position === 'left' ? '!rounded-r-3xl !rounded-l-none !border-y-0 !border-l-0 border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl' : '!rounded-l-3xl !rounded-r-none !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[[-20px_0_50px_rgba(0,0,0,0.2)]]'} flex flex-col ${depth > 0 ? '' : panelZ} ${isResizing ? '!transition-none !duration-0 select-none' : ''} ${panelClass || ''} ${keepMounted ? '' : (isAnimatingOut ? (position === 'left' ? 'sa-panel-slide-out-left' : 'sa-panel-slide-out-right') : (position === 'left' ? 'sa-panel-slide-left' : 'sa-panel-slide-right'))} ${noPanelBlur ? '' : 'backdrop-blur-[var(--glassBlur)]'}`}
          style={{ zIndex: finalPanelZ, background: `linear-gradient(135deg, color-mix(in srgb, var(--text) 5%, transparent) 0%, transparent 100%), color-mix(in srgb, var(--sidebar) calc(var(--glassOpacityDecimal) * 100%), transparent)`, ...(isResizable ? { width: `${isResizing ? dragWidthRef.current : panelWidth}px`, pointerEvents: isResizing ? 'none' : undefined } : {}), ...panelStyle }}
          onClick={(e) => e.stopPropagation()}
        >
          {theme.ambientNoise && (
            <div className="absolute inset-0 z-[-1] opacity-[0.05] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
          )}

          {isResizable && (
            <div
              className="absolute top-0 left-[-6px] w-4 h-full cursor-col-resize hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] z-[100] transition-colors flex flex-col items-center justify-center opacity-0 hover:opacity-100"
              onMouseDown={() => setIsResizing(true)}
            >
              <div className="w-1 h-12 rounded-full bg-[var(--accent)]" />
            </div>
          )}



          {ambientGlows && (
            <div className={`absolute inset-0 overflow-hidden pointer-events-none z-[-1] ${position === 'left' ? 'rounded-r-[var(--radius)]' : 'rounded-l-[var(--radius)]'}`}>
              {ambientGlows}
            </div>
          )}

          {hideHeader && forceShowCloseBtn && (
            <div className="absolute top-8 right-8 z-[10000]">
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon="close"
                  tooltip={t("btn_close") || "Close"}
                  variant="danger"
                  onClick={onClose}
                />
              </PanelHeaderGroup>
            </div>
          )}

          {!hideHeader && (
            <div className={`pt-8 px-10 pb-4 shrink-0 relative z-30 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] ${coverImage ? 'pt-48' : ''}`}>

              {coverImage && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-[-1] rounded-tl-[var(--radius)] rounded-tr-[var(--radius)]">
                  <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-100 opacity-60"
                    style={{ backgroundImage: `url('${coverImage}')` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--bg)_60%,transparent)] to-[color-mix(in_srgb,var(--bg)_65%,transparent)] pointer-events-none" />
                </div>
              )}

              <div className="absolute top-8 right-8 flex items-center gap-3 z-50">
                {headerActions}
                {!hideCloseButton && onClose && (
                  <PanelHeaderGroup className={headerActions ? "ml-2" : ""}>
                    <PanelHeaderButton
                      icon="close"
                      tooltip={t("btn_close") || "Close"}
                      variant="danger"
                      onClick={onClose}
                    />
                  </PanelHeaderGroup>
                )}
              </div>

              <div className="flex items-center gap-6 relative z-10 w-full min-w-0 pr-16">
                <h2 className="text-xl font-black text-[var(--text)] capitalize tracking-widest flex items-center gap-6 min-w-0 w-full">
                  {icon && (
                    <div className={`w-16 h-16 rounded-[1.25rem] glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shadow-lg shrink-0 relative group/iconbox ${iconColorClass || ''}`}>
                      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/iconbox:opacity-100 transition-opacity duration-500"></div>
                      <span className={`material-symbols-outlined opacity-80 group-hover/iconbox:opacity-100 group-hover/iconbox:scale-110 transition-all duration-300 drop-shadow-[0_0_15px_currentColor] ${iconColorClass || ''}`}>
                        {icon}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 w-full justify-center">
                    {badgeText && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-black capitalize tracking-widest flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-current/10 border border-current/20 ${iconColorClass || 'theme-text-accent'}`}>
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shadow-[0_0_8px_currentColor]"></span>
                          {badgeText}
                        </span>
                      </div>
                    )}
                    <span className="leading-tight text-3xl tracking-tight truncate w-full drop-shadow-md">{title}</span>
                    {subtitle && <span className="text-[10px] font-black text-[var(--subtext)] opacity-50 mt-1 capitalize tracking-[0.25em] line-clamp-2 break-words">{subtitle}</span>}
                  </div>
                </h2>
              </div>
            </div>
          )}

          <div className={`flex-1 min-h-0 flex flex-col relative z-10 ${noScroll ? '' : 'overflow-y-auto custom-scrollbar'} ${noPadding ? '' : 'p-8'} ${isResizing ? 'pointer-events-none select-none overflow-hidden' : ''}`}>
            {children}
          </div>

          {(footer || actions) && (
            <div className={`px-8 pb-8 pt-10 flex justify-center items-center gap-4 shrink-0 relative z-30 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] ${footerClass || ''}`}>
              {footer}
              {actions}
            </div>
          )}
        </div>
      </div>
    </PanelDepthContext.Provider>
  );

  const portalRoot = document.getElementById('sa-portals') || document.body;
  return createPortal(panelContent, portalRoot);
}

export function SearchBar({ value, onChange, placeholder = "Search...", className = "", isLoading }: { value: string; onChange: (v: string) => void; placeholder?: string, className?: string, isLoading?: boolean }) {
  return (
    <div className={`relative flex items-center glass-surface ${className || 'rounded-full'} border border-transparent focus-within:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all shadow-inner group w-full`}>
      <div className="pl-4 pr-2 py-2 flex items-center justify-center shrink-0">
        {isLoading ? (
          <span className="material-symbols-outlined !text-[16px] theme-text-accent animate-spin">refresh</span>
        ) : (
          <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] group-focus-within:text-[var(--accent)] transition-colors">search</span>
        )}
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-none px-2 py-2 text-[11px] font-black text-[var(--text)] focus:outline-none placeholder-[var(--subtext)] placeholder:opacity-50 tracking-wider min-w-0"
      />
      {value.trim() !== "" && (
        <button
          onClick={() => onChange("")}
          className="pr-4 pl-2 flex items-center justify-center shrink-0 text-[var(--subtext)] opacity-50 hover:opacity-100 hover:text-[var(--danger)] transition-all focus:outline-none"
        >
          <span className="material-symbols-outlined !text-[16px]">close</span>
        </button>
      )}
    </div>
  );
}

export const extractPostImage = (markdown: any): string | undefined => {
  if (!markdown) return undefined;

  if (typeof markdown === 'object') {
    if (markdown.image_url) return markdown.image_url;
    const text = markdown.message || markdown.content || markdown.description || markdown.body || "";

    if (typeof text === 'string') {
      const directMatch = text.match(/\[IMG:([\s\S]*?)\]/);
      if (directMatch && directMatch[1]) return directMatch[1];
      const imgMatch = text.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch && imgMatch[1]) return imgMatch[1];
      const htmlImgMatch = text.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (htmlImgMatch && htmlImgMatch[1]) return htmlImgMatch[1];
    }
  } else if (typeof markdown === 'string') {
    const directMatch = markdown.match(/\[IMG:([\s\S]*?)\]/);
    if (directMatch && directMatch[1]) return directMatch[1];
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

export function EmptyState({ icon, title, subtitle, action, minHeightClass = "min-h-[200px]", className = "" }: { icon: string, title?: string, subtitle?: string, action?: React.ReactNode, minHeightClass?: string, className?: string }) {
  return (
    <div className={`text-center py-10 px-4 flex flex-col items-center justify-center gap-4 ${minHeightClass} w-full ${className}`}>
      <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-30 drop-shadow-md mb-2">{icon}</span>
      {(title || subtitle) && (
        <div className="flex flex-col gap-1.5 items-center text-center">
          {title && <span className="text-[11px] font-black capitalize tracking-[0.2em] text-[var(--text)]">{title}</span>}
          {subtitle && <span className="text-[9px] font-bold text-[var(--subtext)] capitalize tracking-widest max-w-sm leading-relaxed opacity-60">{subtitle}</span>}
        </div>
      )}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };

export function CustomTierDropdown({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  return (
    <div className="w-full glass-panel rounded-[var(--radius)] relative">
      <select value={value} onChange={e => onChange(Number(e.target.value))} className="w-full px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] appearance-none bg-transparent cursor-pointer relative z-10">
        <option value={1} className="bg-[var(--bg)] text-[var(--text)]">T1 - Universal</option>
        <option value={2} className="bg-[var(--bg)] text-[var(--text)]">T2 - Overrides</option>
        <option value={3} className="bg-[var(--bg)] text-[var(--text)]">T3 - Structural</option>
        <option value={4} className="bg-[var(--bg)] text-[var(--text)]">T4 - Core</option>
      </select>
      <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 z-10">expand_more</span>
    </div>
  );
}
export function DashboardStatTile({ icon, number, value, label, colorClass, style, onClick, disabled, onMouseEnter, onMouseLeave, disableBgStrip, className = "" }: any) {
  const displayValue = number !== undefined ? number : value;
  const isStatusRed = colorClass?.includes('red') || colorClass?.includes('danger');
  const isStatusYellow = colorClass?.includes('amber') || colorClass?.includes('warning');
  const isStatusGreen = colorClass?.includes('emerald') || colorClass?.includes('teal') || colorClass?.includes('success');
  const isStatusBlue = colorClass?.includes('blue') || colorClass?.includes('cyan') || colorClass?.includes('info');

  let textColor = "text-[var(--text)]";
  if (isStatusRed) { textColor = "text-[var(--danger)]"; }
  else if (isStatusYellow) { textColor = "text-[var(--warning)]"; }
  else if (isStatusGreen) { textColor = "text-[var(--success)]"; }
  else if (isStatusBlue) { textColor = "text-[var(--accent)]"; }
  else if (colorClass) { textColor = colorClass.split(' ').find((c: string) => c.startsWith('text-')) || textColor; }

  const cleanColorClass = typeof colorClass === "string"
    ? disableBgStrip 
        ? colorClass 
        : colorClass.split(' ').filter((c: string) => !c.startsWith('bg-') && !c.startsWith('hover:bg-')).join(' ')
    : "";

  const strVal = String(displayValue);
  let sizeClass = "text-3xl lg:text-4xl xl:text-5xl";
  if (strVal.length > 15) sizeClass = "text-base xl:text-lg";
  else if (strVal.length > 10) sizeClass = "text-lg xl:text-xl";
  else if (strVal.length > 5) sizeClass = "text-xl lg:text-2xl xl:text-3xl";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className={`flex-1 min-w-0 h-full flex items-center p-3 gap-3 glass-panel ${cleanColorClass} ${textColor} relative group transition duration-500 ${disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="absolute inset-0 bg-radial-[at_0%_0%] from-[color-mix(in_srgb,currentColor_15%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-[inherit]" />

      <div className="h-14 w-14 rounded-[1rem] flex flex-col items-center justify-center shrink-0 relative overflow-hidden transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_20px_color-mix(in_srgb,currentColor_20%,transparent)] bg-[color-mix(in_srgb,currentColor_10%,transparent)] border border-[color-mix(in_srgb,currentColor_30%,transparent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--text)_5%,transparent)]">
        <span className="opacity-80 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-[0_0_15px_currentColor] shrink-0 [&_.material-symbols-outlined]:!text-[28px]">{icon}</span>
      </div>

      <div className="w-[1px] h-10 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,currentColor_30%,transparent)] to-transparent shrink-0 opacity-50 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="flex flex-col flex-1 min-w-0 relative z-10 py-1">
        <span className="text-[11px] uppercase tracking-widest font-black text-[var(--subtext)] opacity-70 group-hover:opacity-100 transition-opacity duration-500 mb-0 w-full leading-tight">{label}</span>
        <span className={`${sizeClass} font-[900] tracking-tighter truncate drop-shadow-[0_2px_10px_rgba(0,0,0,0.2)] group-hover:brightness-125 transition-all duration-500`}>
          {displayValue}
        </span>
      </div>
    </div>
  );
};

import { useTooltipStore } from './store/tooltipStore';

export function HoverTooltip({ title, subtitle, variant = 'default', className = '', noIcon = false, icon, normalFont = false, align: explicitAlign, vAlign: explicitVAlign, content, delay = 300 }: any) {
  const { setTooltip, clearTooltip } = useTooltipStore();
  const ref = React.useRef<HTMLDivElement>(null);
  const propsRef = React.useRef({ title, subtitle, variant, className, noIcon, icon, normalFont, explicitAlign, explicitVAlign, content });
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync and update store if currently hovered and already shown
  React.useEffect(() => {
    propsRef.current = { title, subtitle, variant, className, noIcon, icon, normalFont, explicitAlign, explicitVAlign, content };
    const parent = ref.current?.parentElement;
    if (parent && parent.matches(':hover') && !timerRef.current) {
      const p = propsRef.current;
      const rect = parent.getBoundingClientRect();
      let x = rect.left + rect.width / 2;
      let y = rect.top - 8;
      let align: 'center' | 'left' | 'right' = p.explicitAlign || 'center';
      let vAlign: 'top' | 'bottom' = p.explicitVAlign || 'top';

      if (!p.explicitAlign) {
        if (p.className.includes('!right-0') || p.className.includes('right-0')) {
          align = 'right';
        } else if (p.className.includes('!left-0') || p.className.includes('left-0')) {
          align = 'left';
        }
      }

      if (!p.explicitVAlign) {
        if (p.className.includes('bottom-[calc(100%')) {
          vAlign = 'top';
        } else if (p.className.includes('top-[calc(100%')) {
          vAlign = 'bottom';
        }
      }

      // Calculate base x and y based on final align/vAlign
      if (align === 'left') {
        x = rect.left;
      } else if (align === 'right') {
        x = rect.right;
      }

      if (vAlign === 'bottom') {
        y = rect.bottom + 8;
      } else {
        y = rect.top - 8;
      }

      setTooltip({ ...p, x, y, align, vAlign });
    }
  }, [title, subtitle, variant, className, noIcon, icon, normalFont, explicitAlign, explicitVAlign, content, setTooltip]);

  // Bind DOM events exactly once
  React.useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const showTooltip = () => {
      const p = propsRef.current;
      const rect = parent.getBoundingClientRect();
      let x = rect.left + rect.width / 2;
      let y = rect.top - 8;
      let align: 'center' | 'left' | 'right' = p.explicitAlign || 'center';
      let vAlign: 'top' | 'bottom' = p.explicitVAlign || 'top';

      if (!p.explicitAlign) {
        if (p.className.includes('!right-0') || p.className.includes('right-0')) {
          align = 'right';
        } else if (p.className.includes('!left-0') || p.className.includes('left-0')) {
          align = 'left';
        }
      }

      if (!p.explicitVAlign) {
        if (p.className.includes('bottom-[calc(100%')) {
          vAlign = 'top';
        } else if (p.className.includes('top-[calc(100%')) {
          vAlign = 'bottom';
        }
      }

      // Calculate base x and y based on final align/vAlign
      if (align === 'left') {
        x = rect.left;
      } else if (align === 'right') {
        x = rect.right;
      }

      if (vAlign === 'bottom') {
        y = rect.bottom + 8;
      } else {
        y = rect.top - 8;
      }

      setTooltip({ ...p, x, y, align, vAlign });
      timerRef.current = null;
    };

    const handleMouseEnter = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const isTooltipActive = useTooltipStore.getState().tooltip !== null;
      timerRef.current = setTimeout(showTooltip, isTooltipActive ? 0 : delay);
    };

    const handleMouseLeave = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      clearTooltip();
    };

    parent.addEventListener('mouseenter', handleMouseEnter);
    parent.addEventListener('mouseleave', handleMouseLeave);

    if (parent.matches(':hover')) {
      handleMouseEnter();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      parent.removeEventListener('mouseenter', handleMouseEnter);
      parent.removeEventListener('mouseleave', handleMouseLeave);
      clearTooltip();
    };
  }, [setTooltip, clearTooltip, delay]);

  return <div ref={ref} className="hidden" />;
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
            familyCount: members.length,
            is_paid: parentMod.is_paid || members.some(m => m.is_paid),
            is_early_access: parentMod.is_early_access || members.some(m => m.is_early_access)
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
          isParent: true,
          is_paid: members.some(m => m.is_paid),
          is_early_access: members.some(m => m.is_early_access)
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
          isParent: true,
          is_paid: members.some(m => m.is_paid),
          is_early_access: members.some(m => m.is_early_access)
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

export const enrichBlueprintsWithPremiumStatus = async (supabase: any, blueprintsData: any[]) => {
  let premiumMap: Record<string, any> = {};
  const allHashes = new Set<string>();
  blueprintsData.forEach((b: any) => {
    const artifacts = b.json_data?.artifacts || b.artifacts || [];
    artifacts.forEach((a: any) => { if (a.hash) allHashes.add(a.hash); });
  });

  if (allHashes.size > 0) {
    const hashes = Array.from(allHashes);
    const chunkSize = 100;
    const promises = [];
    for (let i = 0; i < hashes.length; i += chunkSize) {
      promises.push(
        supabase.from('mod_versions').select('dna_hash, mods(id, is_paid, is_early_access)').in('dna_hash', hashes.slice(i, i + chunkSize))
      );
    }
    const results = await Promise.all(promises);
    const hashToPremium: Record<string, any> = {};
    results.forEach(({ data }) => {
      if (data) {
        data.forEach((d: any) => {
          const modRef = Array.isArray(d.mods) ? d.mods[0] : d.mods;
          if (modRef && (modRef.is_paid || modRef.is_early_access)) {
            hashToPremium[d.dna_hash] = { is_paid: modRef.is_paid, is_early_access: modRef.is_early_access };
          }
        });
      }
    });

    // Fetch all premium mods for a quick fuzzy search fallback
    const { data: premiumMods } = await supabase.from('mods').select('id, name, is_paid, is_early_access').or('is_paid.eq.true,is_early_access.eq.true');
    const premiumNameMap = new Map();
    if (premiumMods) {
      premiumMods.forEach((m: any) => {
        if (m.name) premiumNameMap.set(cleanSearchName(m.name), m);
      });
    }

    blueprintsData.forEach((b: any) => {
      const artifacts = b.json_data?.artifacts || b.artifacts || [];
      let is_paid = false;
      let is_early_access = false;
      artifacts.forEach((a: any, index: number) => {
        const isStr = typeof a === 'string';
        const aName = isStr ? a : a.name;
        const aHash = isStr ? undefined : a.hash;

        if (aHash && hashToPremium[aHash]) {
          if (hashToPremium[aHash].is_paid) {
            is_paid = true;
            if (isStr) { artifacts[index] = { name: a, is_paid: true }; }
            else { a.is_paid = true; }
          }
          if (hashToPremium[aHash].is_early_access) {
            is_early_access = true;
            if (isStr) {
              if (typeof artifacts[index] === 'string') artifacts[index] = { name: a, is_early_access: true };
              else artifacts[index].is_early_access = true;
            } else { a.is_early_access = true; }
          }
        } else if (aName) {
          const clean = cleanSearchName(aName);
          let pMod = premiumNameMap.get(clean);
          if (!pMod) {
            const superCleanTarget = clean.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            for (const [pName, pObj] of premiumNameMap.entries()) {
              const superCleanP = pName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
              if (superCleanP.length > 10 && (superCleanTarget.includes(superCleanP) || superCleanP.includes(superCleanTarget))) {
                pMod = pObj;
                break;
              }
            }
          }
          if (pMod) {
            if (pMod.is_paid) {
              is_paid = true;
              if (isStr) { artifacts[index] = { name: a, is_paid: true }; }
              else { a.is_paid = true; }
            }
            if (pMod.is_early_access) {
              is_early_access = true;
              if (isStr) {
                if (typeof artifacts[index] === 'string') artifacts[index] = { name: a, is_early_access: true };
                else artifacts[index].is_early_access = true;
              } else { a.is_early_access = true; }
            }
          }
        }
      });
      if (is_paid || is_early_access) {
        premiumMap[b.id] = { is_paid, is_early_access };
      }
    });
  }
  return premiumMap;
};

export function SidePanelActionFooter({
  onCancel,
  cancelLabel,
  cancelIcon,
  hideCancel = false,

  onAction,
  actionLabel,
  actionIcon,
  actionDisabled = false,
  actionVariant = "accent",
  actionTooltip,

  isProcessing = false,
  processingLabel,

  onDanger,
  dangerLabel,
  dangerIcon,
  dangerDisabled = false,
  centerDanger = false,

  className = "flex flex-row items-center justify-center gap-4 w-full"
}: {
  onCancel?: () => void;
  cancelLabel?: string;
  cancelIcon?: string;
  hideCancel?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: string;
  actionDisabled?: boolean;
  actionVariant?: "accent" | "success" | "danger" | "primary" | "glass";
  actionTooltip?: string;
  isProcessing?: boolean;
  processingLabel?: string;
  onDanger?: () => void;
  dangerLabel?: string;
  dangerIcon?: string;
  dangerDisabled?: boolean;
  centerDanger?: boolean;
  className?: string;
}) {
  const { t } = useLexicon();

  return (
    <div className={className}>
      {onDanger && (
        <ActionButton
          onClick={onDanger}
          disabled={dangerDisabled || isProcessing}
          variant="danger"
          icon={dangerIcon}
          label={dangerLabel || t("ui_btn_delete")}
        />
      )}

      {!hideCancel && (
        <ActionButton
          onClick={onCancel}
          disabled={isProcessing}
          icon={cancelIcon}
          variant="glass"
          label={cancelLabel || t("nav_cancel")}
        />
      )}

      {onAction && (
        <div className={actionTooltip ? (actionDisabled || isProcessing ? "cursor-not-allowed" : "") : ""}>
          {actionTooltip && <HoverTooltip title={actionTooltip} variant="warning" />}
          <ActionButton
            onClick={onAction}
            disabled={actionDisabled || isProcessing}
            variant={actionVariant}
            icon={isProcessing ? "sync" : actionIcon}
            label={isProcessing ? (processingLabel || t("ui_btn_processing")) : actionLabel}
          />
        </div>
      )}
    </div>
  );
}


export function ScreenUtilityBar({
  search,
  onSearchChange,
  searchPlaceholder,
  hideSearch = false,
  leftContent,
  children,
  className = "",
  innerClassName = "justify-end",
  isSidePanel = false
}: any) {
  return (
    <div className={`flex items-center gap-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full flex-wrap ${isSidePanel ? 'pb-4' : 'px-6 py-4 mb-4'} ${className}`}>
      {leftContent && (
        <div className="flex items-center gap-3 shrink-0">
          {leftContent}
        </div>
      )}
      <div className={`flex gap-3 relative flex-1 w-full flex-wrap items-center ${isSidePanel ? 'flex-col items-stretch' : innerClassName}`}>
        {!hideSearch && (
          <div className={`relative ${isSidePanel ? 'w-full' : 'flex-1 min-w-[200px] max-w-[300px]'}`}>
            <SearchBar
              value={search || ""}
              onChange={onSearchChange}
              placeholder={searchPlaceholder || "Search..."}
              className="h-12 w-full rounded-2xl"
            />
          </div>
        )}
        {children && (
          <div className={`flex items-center gap-3 shrink-0 flex-wrap ${isSidePanel ? 'w-full' : ''}`}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export function SystemAlertBanner({ type = 'info', title, message, icon, action, onClose, className = "" }: any) {
  const themeType = type === 'info' ? 'accent' : type;

  const iconName = icon || (
    type === 'danger' ? 'gpp_bad' :
      type === 'warning' ? 'warning' :
        type === 'success' ? 'check_circle' : 'info'
  );

  return (
    <div className={`w-full theme-panel-${themeType} p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden transition-all duration-300 animate-in fade-in zoom-in-95 group rounded-[var(--radius)] ${className}`}>
      <div className={`absolute inset-0 z-0 pointer-events-none bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:translate-x-full duration-1000 transition-all ease-in-out`} />

      <div className="flex items-center gap-5 z-10 flex-1 min-w-0">
        <div className={`w-12 h-12 rounded-full border border-current flex items-center justify-center shrink-0 shadow-md transition-transform group-hover:scale-105 opacity-80 theme-text-${themeType}`}>
          <span className="material-symbols-outlined !text-[24px] drop-shadow-md">
            {typeof iconName === 'string' ? iconName : iconName}
          </span>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {message && <span className={`text-[9px] capitalize font-bold tracking-widest leading-tight truncate opacity-80 theme-text-${themeType}`}>{message}</span>}
          <h3 className={`text-base font-black capitalize tracking-widest leading-tight truncate theme-text-${themeType}`}>{title}</h3>
        </div>
      </div>

      <div className="flex items-center gap-3 z-10 shrink-0">
        {action}
        {onClose && (
          <button onClick={onClose} className={`w-8 h-8 rounded-full border border-current flex items-center justify-center transition-colors opacity-50 hover:opacity-100 ml-2 hover:bg-white/10 theme-text-${themeType}`}>
            <span className="material-symbols-outlined !text-[16px]">close</span>
          </button>
        )}
      </div>
    </div>
  );
};

