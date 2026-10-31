import React, { useState, useEffect, useRef } from 'react';
import { useLexicon } from '../LexiconContext';
import { CustomDropdown, HoverTooltip, VAULT_CHIP_CLASS } from '../shared';

interface WorkbenchVisualEditorProps {
   settings: any[];
   categories?: any[];
   dataSource: any;
   savedDataSource?: any;
   isPreview?: boolean;
   isNested?: boolean;
   parentPath?: string;
   selectedCategory: string;
   searchQuery: string;
   onlyModified?: boolean;
   onlyUnsaved?: boolean;
   onVisualChange: (key: string, value: any) => void;
   onUndoToSaved?: (key: string) => void;
   highlightedKey?: string | null;
}

const clampNumber = (v: number, min?: number, max?: number) => {
   if (isNaN(v)) return min !== undefined ? min : 0;
   if (min !== undefined && v < min) return min;
   if (max !== undefined && v > max) return max;
   return v;
};

export const isNumericTupleValue = (val: any): boolean => {
   if (typeof val !== "string") return false;
   return /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(val);
};

export const parseNumericTuple = (val: any, fallbackMin = 0, fallbackMax = 0): [number, number] => {
   if (typeof val === "string" && val.includes(",")) {
      const parts = val.split(",");
      const a = parseFloat(parts[0]?.trim() || "");
      const b = parseFloat(parts[1]?.trim() || "");
      return [isNaN(a) ? fallbackMin : a, isNaN(b) ? fallbackMax : b];
   }
   return [fallbackMin, fallbackMax];
};

export const countSettingsByCategory = (settings: any[]): Record<string, number> => {
   const counts: Record<string, number> = { ALL: 0 };
   if (!Array.isArray(settings)) return counts;
   for (const s of settings) {
      if (!s) continue;
      const cat = s.category || "UNCATEGORIZED";
      const weight = s.type === "group" && Array.isArray(s.settings) ? s.settings.length : 1;
      counts.ALL = (counts.ALL || 0) + weight;
      counts[cat] = (counts[cat] || 0) + weight;
   }
   return counts;
};

export const humanizeConfigLabel = (raw: string): string => {
   if (!raw) return "";
   return raw
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
};

export const isSettingModified = (setting: any, dataSource: any, parentPath = ""): boolean => {
   if (!setting || !dataSource) return false;
   const localPath = setting.path || setting.key;
   if (!localPath) return false;
   const dataPath = parentPath && !localPath.startsWith(parentPath + ".") ? `${parentPath}.${localPath}` : localPath;

   if (setting.type === "group" && Array.isArray(setting.settings)) {
      return setting.settings.some((child: any) => isSettingModified(child, dataSource, dataPath));
   }

   if (setting.default === undefined) return false;
   const val = dataPath.split('.').reduce((o: any, i: string) => o?.[i], dataSource);
   if (val === undefined) return false;
   return JSON.stringify(val) !== JSON.stringify(setting.default);
};

export const countModifiedSettings = (settings: any[], dataSource: any, parentPath = ""): number => {
   if (!Array.isArray(settings) || !dataSource) return 0;
   let count = 0;
   for (const s of settings) {
      const localPath = s?.path || s?.key;
      if (!localPath) continue;
      const dataPath = parentPath && !localPath.startsWith(parentPath + ".") ? `${parentPath}.${localPath}` : localPath;
      if (s.type === "group" && Array.isArray(s.settings)) {
         count += countModifiedSettings(s.settings, dataSource, dataPath);
      } else if (isSettingModified(s, dataSource, parentPath)) {
         count++;
      }
   }
   return count;
};

export const isSettingEditedFromSaved = (setting: any, dataSource: any, savedDataSource: any, parentPath = ""): boolean => {
   if (!setting || !dataSource || !savedDataSource) return false;
   const localPath = setting.path || setting.key;
   if (!localPath) return false;
   const dataPath = parentPath && !localPath.startsWith(parentPath + ".") ? `${parentPath}.${localPath}` : localPath;

   if (setting.type === "group" && Array.isArray(setting.settings)) {
      return setting.settings.some((child: any) => isSettingEditedFromSaved(child, dataSource, savedDataSource, dataPath));
   }

   const val = dataPath.split('.').reduce((o: any, i: string) => o?.[i], dataSource);
   const savedVal = dataPath.split('.').reduce((o: any, i: string) => o?.[i], savedDataSource);
   if (val === undefined && savedVal === undefined) return false;
   return JSON.stringify(val) !== JSON.stringify(savedVal);
};

export const countEditedFromSavedSettings = (settings: any[], dataSource: any, savedDataSource: any, parentPath = ""): number => {
   if (!Array.isArray(settings) || !dataSource || !savedDataSource) return 0;
   let count = 0;
   for (const s of settings) {
      const localPath = s?.path || s?.key;
      if (!localPath) continue;
      const dataPath = parentPath && !localPath.startsWith(parentPath + ".") ? `${parentPath}.${localPath}` : localPath;
      if (s.type === "group" && Array.isArray(s.settings)) {
         count += countEditedFromSavedSettings(s.settings, dataSource, savedDataSource, dataPath);
      } else if (isSettingEditedFromSaved(s, dataSource, savedDataSource, parentPath)) {
         count++;
      }
   }
   return count;
};

const getCleanDescription = (rawDesc: string, label: string) => {
   if (!rawDesc) return "";
   const trimmed = rawDesc.trim();
   if (!trimmed || trimmed.toLowerCase() === "no description provided.") return "";
   const lowerDesc = trimmed.toLowerCase().replace(/\.$/, "");
   const lowerLabel = (label || "").trim().toLowerCase();
   if (
      lowerDesc === `enable or disable ${lowerLabel}` ||
      lowerDesc === `configure the setting for ${lowerLabel}` ||
      lowerDesc === `configure ${lowerLabel}` ||
      lowerDesc === lowerLabel
   ) {
      return "";
   }
   return trimmed;
};

const SettingNode = React.memo(({ setting, val, savedVal, dataPath, isHighlighted, isPreview, isNested, onVisualChange, onUndoToSaved, t }: any) => {
   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k, k);
      if (tr === `[${k}]`) return k;
      return tr;
   };

   const rawLabel = resolveText(setting.label_key, setting.key);
   const label = humanizeConfigLabel(rawLabel);
   const rawDesc = resolveText(setting.desc_key, "");
   const cleanDesc = getCleanDescription(rawDesc, label);

   const effectiveVal = val !== undefined ? val : setting.default;
   const hasDefault = setting.default !== undefined;
   const isModified = hasDefault && val !== undefined && JSON.stringify(val) !== JSON.stringify(setting.default);
   const isUnsavedEdit = savedVal !== undefined && val !== undefined && JSON.stringify(val) !== JSON.stringify(savedVal);

   const isTupleControl =
      setting.type === "tuple" ||
      (setting.type === "number" && (isNumericTupleValue(effectiveVal) || isNumericTupleValue(setting.default)));

   const isCompactHorizontal =
      setting.type === "boolean" ||
      (setting.type === "number" && !isTupleControl) ||
      ((setting.type === "string" || setting.type === "dropdown") && !isNested);

   const defaultSubtitle = React.useMemo(() => {
      if (cleanDesc) return cleanDesc;
      if (setting.type === "boolean") {
         const defBool = Boolean(setting.default);
         return `${t("cw_default_prefix", "Default:")} ${defBool ? t("enabled", "Enabled") : t("disabled", "Disabled")}`;
      }
      if (setting.type === "dropdown" && Array.isArray(setting.options)) {
         const matchedOpt = setting.options.find((o: any) => String(o.value) === String(setting.default));
         const optLabel = matchedOpt ? resolveText(matchedOpt.label_key, matchedOpt.value) : String(setting.default ?? "");
         return optLabel ? `${t("cw_default_prefix", "Default:")} ${optLabel}` : "";
      }
      if (setting.default !== undefined && String(setting.default).trim() !== "") {
         return `${t("cw_default_prefix", "Default:")} ${String(setting.default)}`;
      }
      return t("cw_not_set_default", "Default (Empty)");
   }, [cleanDesc, setting.type, setting.default, setting.options, t]);

   return (
      <div
         data-setting-key={setting.key}
         style={{ contentVisibility: 'auto', containIntrinsicSize: isNested ? '56px' : '64px' }}
         className={`h-full rounded-2xl border ${isNested ? 'px-3.5 py-2.5' : 'px-4 py-3'} flex flex-col justify-center group transition-colors duration-200 gap-2 relative overflow-hidden ${
            isHighlighted
               ? 'z-10 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.15)]'
               : isNested
                  ? 'glass-surface border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_16%,transparent)]'
                  : 'glass-panel border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)]'
         }`}
      >
         <div className={`flex ${isCompactHorizontal ? 'items-center justify-between gap-3' : 'flex-col gap-2.5'} relative z-10 w-full`}>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
               <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-[12.5px] font-bold tracking-wide text-[var(--text)] leading-snug truncate">
                     <HoverTooltip title={`${label} (${setting.key})`} />
                     {label}
                  </span>
                  {setting.risk === "advanced" && (
                     <span className={`${VAULT_CHIP_CLASS} !h-5 !px-2 !text-[9px]`}>
                        <span className="material-symbols-outlined !text-[11px] text-[var(--danger)]">{t("icon_warning", "warning")}</span>
                        <span>{t("advanced_badge", "Advanced")}</span>
                     </span>
                  )}
                  {isUnsavedEdit ? (
                     <span className={`${VAULT_CHIP_CLASS} !h-5 !px-2 !text-[9px]`}>
                        <span className="material-symbols-outlined !text-[11px] text-[var(--warning)]">{t("icon_edit_note", "edit_note")}</span>
                        <span>{t("unsaved", "Unsaved")}</span>
                     </span>
                  ) : isModified ? (
                     <span className={`${VAULT_CHIP_CLASS} !h-5 !px-2 !text-[9px]`}>
                        <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">{t("icon_track_changes", "track_changes")}</span>
                        <span>{t("modified", "Modified")}</span>
                     </span>
                  ) : null}
               </div>

               {defaultSubtitle && (
                  <span className="text-[10.5px] text-[var(--subtext)] opacity-75 font-medium leading-snug line-clamp-1">
                     <HoverTooltip title={cleanDesc || defaultSubtitle} />
                     {defaultSubtitle}
                  </span>
               )}
            </div>

            <div className={`shrink-0 flex items-center gap-1.5 ${isCompactHorizontal ? 'justify-end' : 'w-full justify-between pt-0.5'}`}>
               {isUnsavedEdit && (
                  <div className="relative flex shrink-0">
                     <button
                        type="button"
                        onClick={() => onUndoToSaved ? onUndoToSaved(dataPath) : onVisualChange(dataPath, savedVal)}
                        className="w-7 h-7 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--warning)] flex items-center justify-center transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_undo", "undo")}</span>
                     </button>
                     <HoverTooltip title={`${t("diff_undo_value", "Undo to Saved")}: ${String(savedVal)}`} />
                  </div>
               )}

               {isModified && (
                  <div className="relative flex shrink-0">
                     <button
                        type="button"
                        onClick={() => onVisualChange(dataPath, setting.default)}
                        className="w-7 h-7 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_restart_alt", "restart_alt")}</span>
                     </button>
                     <HoverTooltip title={`${t("workbench_reset_default", "Reset to Default")}: ${String(setting.default)}`} />
                  </div>
               )}

               {setting.type === "boolean" && (
                  <button
                     type="button"
                     onClick={() => onVisualChange(dataPath, !Boolean(effectiveVal))}
                     className={`sa-glass-toggle ${effectiveVal ? 'is-on' : ''}`}
                  >
                     <div className="sa-glass-toggle-thumb" />
                  </button>
               )}

               {setting.type === "number" && !isTupleControl && (
                  <div className="flex items-center overflow-hidden glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-0.5 shrink-0">
                     <button
                        type="button"
                        onClick={() =>
                           onVisualChange(
                              dataPath,
                              clampNumber(
                                 (effectiveVal !== undefined ? parseFloat(effectiveVal as any) : 0) - (setting.step || 1),
                                 setting.min,
                                 setting.max
                              )
                           )
                        }
                        className="w-6.5 h-6.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_remove", "remove")}</span>
                     </button>
                     <input
                        type="text"
                        value={effectiveVal !== undefined ? effectiveVal : 0}
                        onChange={(e) => {
                           const str = e.target.value;
                           const isDecimalAllowed = setting.allow_decimals !== false;

                           if (str === "" || str === "-") {
                              onVisualChange(dataPath, str);
                           } else if (isDecimalAllowed && (str.endsWith(".") || (str.includes(".") && str.endsWith("0")))) {
                              onVisualChange(dataPath, str);
                           } else {
                              const parsed = isDecimalAllowed ? parseFloat(str) : parseInt(str, 10);
                              if (!isNaN(parsed)) {
                                 onVisualChange(dataPath, clampNumber(parsed, setting.min, setting.max));
                              } else {
                                 onVisualChange(dataPath, str);
                              }
                           }
                        }}
                        className="w-15 px-1 bg-transparent text-[11px] font-black text-[var(--text)] focus:outline-none text-center tabular-nums"
                     />
                     <button
                        type="button"
                        onClick={() =>
                           onVisualChange(
                              dataPath,
                              clampNumber(
                                 (effectiveVal !== undefined ? parseFloat(effectiveVal as any) : 0) + (setting.step || 1),
                                 setting.min,
                                 setting.max
                              )
                           )
                        }
                        className="w-6.5 h-6.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_add", "add")}</span>
                     </button>
                  </div>
               )}

               {isTupleControl && (() => {
                  const [defaultMin, defaultMax] = parseNumericTuple(setting.default, setting.min ?? -100, setting.max ?? 100);
                  const [tupleMin, tupleMax] = parseNumericTuple(effectiveVal, defaultMin, defaultMax);
                  const step = setting.step || 1;
                  const updateTuple = (nextMin: number, nextMax: number) => {
                     const clampedMin = clampNumber(nextMin, setting.min, setting.max);
                     const clampedMax = clampNumber(nextMax, setting.min, setting.max);
                     onVisualChange(dataPath, `${clampedMin},${clampedMax}`);
                  };
                  return (
                     <div className="grid grid-cols-2 gap-2 w-full flex-1">
                        <div className="flex items-center justify-between glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5">
                           <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-70 mr-1">
                              {t("workbench_field_min", "Min")}
                           </span>
                           <div className="flex items-center">
                              <button
                                 type="button"
                                 onClick={() => updateTuple(tupleMin - step, tupleMax)}
                                 className="w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer"
                              >
                                 <span className="material-symbols-outlined !text-[13px]">{t("icon_remove", "remove")}</span>
                              </button>
                              <input
                                 type="text"
                                 value={tupleMin}
                                 onChange={(e) => {
                                    const parsed = parseFloat(e.target.value);
                                    if (!isNaN(parsed)) updateTuple(parsed, tupleMax);
                                 }}
                                 className="w-12 px-0.5 bg-transparent text-[11px] font-black text-[var(--text)] focus:outline-none text-center tabular-nums"
                              />
                              <button
                                 type="button"
                                 onClick={() => updateTuple(tupleMin + step, tupleMax)}
                                 className="w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer"
                              >
                                 <span className="material-symbols-outlined !text-[13px]">{t("icon_add", "add")}</span>
                              </button>
                           </div>
                        </div>

                        <div className="flex items-center justify-between glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5">
                           <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-70 mr-1">
                              {t("workbench_field_max", "Max")}
                           </span>
                           <div className="flex items-center">
                              <button
                                 type="button"
                                 onClick={() => updateTuple(tupleMin, tupleMax - step)}
                                 className="w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer"
                              >
                                 <span className="material-symbols-outlined !text-[13px]">{t("icon_remove", "remove")}</span>
                              </button>
                              <input
                                 type="text"
                                 value={tupleMax}
                                 onChange={(e) => {
                                    const parsed = parseFloat(e.target.value);
                                    if (!isNaN(parsed)) updateTuple(tupleMin, parsed);
                                 }}
                                 className="w-12 px-0.5 bg-transparent text-[11px] font-black text-[var(--text)] focus:outline-none text-center tabular-nums"
                              />
                              <button
                                 type="button"
                                 onClick={() => updateTuple(tupleMin, tupleMax + step)}
                                 className="w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer"
                              >
                                 <span className="material-symbols-outlined !text-[13px]">{t("icon_add", "add")}</span>
                              </button>
                           </div>
                        </div>
                     </div>
                  );
               })()}

               {setting.type === "string" && (
                  <input
                     type="text"
                     value={effectiveVal !== undefined ? effectiveVal : ""}
                     onChange={(e) => onVisualChange(dataPath, e.target.value)}
                     placeholder={
                        setting.default !== undefined && String(setting.default).trim() !== ""
                           ? String(setting.default)
                           : t("cw_not_set_default", "Default (Empty)")
                     }
                     className={`h-8 glass-surface rounded-xl px-3 text-[11px] font-bold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-45 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none transition-all ${
                        isCompactHorizontal ? 'w-[145px] sm:w-[175px]' : 'w-full'
                     }`}
                  />
               )}

               {setting.type === "dropdown" && (
                  <div className={isCompactHorizontal ? 'w-[155px] sm:w-[185px]' : 'w-full flex-1'}>
                     <CustomDropdown
                        disableTint={true}
                        value={effectiveVal !== undefined ? effectiveVal : ""}
                        options={
                           setting.options?.map((opt: any) => ({
                              id: opt.value,
                              label: resolveText(opt.label_key, opt.value)
                           })) || []
                        }
                        onChange={(v: string[]) => onVisualChange(dataPath, v[0])}
                     />
                  </div>
               )}

               {setting.type === "keybinding" && (
                  <div className="w-full flex-1">
                     <KeybindingField
                        val={effectiveVal}
                        setting={setting}
                        isPreview={false}
                        onVisualChange={(newVal: any) => onVisualChange(dataPath, newVal)}
                        t={t}
                     />
                  </div>
               )}
            </div>
         </div>
      </div>
   );
}, (prevProps, nextProps) => {
   return (
      prevProps.setting === nextProps.setting &&
      prevProps.val === nextProps.val &&
      prevProps.savedVal === nextProps.savedVal &&
      prevProps.isHighlighted === nextProps.isHighlighted &&
      prevProps.isPreview === nextProps.isPreview &&
      prevProps.isNested === nextProps.isNested
   );
});

const KeybindingField = React.memo(({ val, setting, isPreview, onVisualChange, t }: any) => {
   const [isListening, setIsListening] = React.useState(false);

   React.useEffect(() => {
      if (!isListening) return;

      const handleKeyDown = (e: KeyboardEvent) => {
         e.preventDefault();
         e.stopPropagation();

         const format = setting.key_format || 'literal';
         let newKey: any;

         if (format === 'keycode') {
            newKey = e.keyCode;
         } else {
            newKey = e.key.toUpperCase();
            if (newKey === ' ') newKey = 'SPACE';
         }

         const isMultiple = setting.allow_multiple === true;

         if (isMultiple) {
            const currentVals = Array.isArray(val) ? val : [];
            if (!currentVals.includes(newKey)) {
               onVisualChange([...currentVals, newKey]);
            }
         } else {
            onVisualChange(newKey);
         }

         setIsListening(false);
      };

      window.addEventListener('keydown', handleKeyDown, { capture: true });
      return () => {
         window.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
   }, [isListening, onVisualChange, setting, val]);

   const isMultiple = setting.allow_multiple === true;
   const vals = isMultiple ? (Array.isArray(val) ? val : []) : (val !== undefined && val !== "" ? [val] : []);

   return (
      <div className="flex flex-wrap items-center gap-2 w-full">
         {vals.map((v: any, idx: number) => (
            <div key={idx} className="flex items-center gap-1.5 glass-surface rounded-lg px-2.5 py-1 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[11px] font-black text-[var(--text)]">
               <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">{t("icon_keyboard", "keyboard")}</span>
               <span className="tracking-wider font-mono">{v}</span>
               {!isPreview && (
                  <button
                     type="button"
                     onClick={() => {
                        if (isMultiple) {
                           onVisualChange(vals.filter((_: any, i: number) => i !== idx));
                        } else {
                           onVisualChange("");
                        }
                     }}
                     className="text-[var(--danger)] hover:text-red-400 opacity-70 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                  >
                     <span className="material-symbols-outlined !text-[13px]">{t("icon_close", "close")}</span>
                  </button>
               )}
            </div>
         ))}

         {!isPreview && (!vals.length || isMultiple) && (
            <button
               type="button"
               onClick={() => setIsListening(!isListening)}
               className={`h-8 rounded-xl px-3 text-[10px] font-black transition-all duration-300 flex items-center justify-center gap-1.5 capitalize tracking-widest cursor-pointer ${
                  isListening
                     ? 'glass-surface sa-glass-pill-active text-[var(--text)] animate-pulse'
                     : 'glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]'
               }`}
            >
               <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">{isListening ? t("icon_keyboard", "keyboard") : t("icon_add", "add")}</span>
               {isListening ? t("keybinding_listening", "Listening...") : (isMultiple && vals.length ? t("keybinding_add", "Add Key") : t("keybinding_set", "Set Key"))}
            </button>
         )}
      </div>
   );
});

const GroupNode = ({
   setting,
   dataPath,
   dataSource,
   savedDataSource,
   isPreview,
   selectedCategory,
   searchQuery,
   onlyModified,
   onlyUnsaved,
   onVisualChange,
   onUndoToSaved,
   highlightedKey,
   resolveText,
   t
}: any) => {
   const [isCollapsed, setIsCollapsed] = useState(false);
   const childSettings: any[] = Array.isArray(setting.settings) ? setting.settings : [];
   const modifiedCount = countModifiedSettings(childSettings, dataSource, dataPath);
   const unsavedCount = countEditedFromSavedSettings(childSettings, dataSource, savedDataSource, dataPath);

   const rawLabel = resolveText(setting.label_key, setting.key);
   const label = humanizeConfigLabel(rawLabel);
   const rawDesc = resolveText(setting.desc_key, "");
   const cleanDesc = getCleanDescription(rawDesc, label);

   const handleResetGroup = (e: React.MouseEvent) => {
      e.stopPropagation();
      for (const child of childSettings) {
         const childLocal = child.path || child.key;
         if (!childLocal || child.default === undefined) continue;
         const childPath = dataPath && !childLocal.startsWith(dataPath + ".") ? `${dataPath}.${childLocal}` : childLocal;
         onVisualChange(childPath, child.default);
      }
   };

   const handleUndoGroup = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!savedDataSource) return;
      for (const child of childSettings) {
         const childLocal = child.path || child.key;
         if (!childLocal) continue;
         const childPath = dataPath && !childLocal.startsWith(dataPath + ".") ? `${dataPath}.${childLocal}` : childLocal;
         const savedVal = childPath.split('.').reduce((o: any, i: string) => o?.[i], savedDataSource);
         if (savedVal !== undefined) {
            if (onUndoToSaved) {
               onUndoToSaved(childPath);
            } else {
               onVisualChange(childPath, savedVal);
            }
         }
      }
   };

   return (
      <div
         style={{ contentVisibility: 'auto', containIntrinsicSize: '120px' }}
         className="col-span-full flex flex-col w-full glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] overflow-hidden transition-colors duration-200 shadow-sm"
      >
         <div
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="px-4 py-3 flex items-center justify-between gap-4 cursor-pointer bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors select-none"
         >
            <div className="flex items-center gap-3 min-w-0">
               <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                     {t("icon_account_tree", "account_tree")}
                  </span>
               </div>
               <div className="flex flex-col min-w-0 gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                     <span className="text-[12.5px] font-black capitalize tracking-tight text-[var(--text)]">{label}</span>
                     <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[11px] text-[var(--subtext)]">{t("icon_tune", "tune")}</span>
                        <span className="tabular-nums">{childSettings.length} {t("workbench_settings_count", "Settings")}</span>
                     </span>
                     {unsavedCount > 0 && (
                        <span className={VAULT_CHIP_CLASS}>
                           <span className="material-symbols-outlined !text-[11px] text-[var(--warning)]">{t("icon_edit_note", "edit_note")}</span>
                           <span className="tabular-nums">{unsavedCount} {t("unsaved", "Unsaved")}</span>
                        </span>
                     )}
                     {modifiedCount > 0 && (
                        <span className={VAULT_CHIP_CLASS}>
                           <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">{t("icon_track_changes", "track_changes")}</span>
                           <span className="tabular-nums">{modifiedCount} {t("modified", "Modified")}</span>
                        </span>
                     )}
                  </div>
                  {cleanDesc && (
                     <span className="text-[10.5px] text-[var(--subtext)] opacity-75 font-medium truncate">{cleanDesc}</span>
                  )}
               </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
               {unsavedCount > 0 && (
                  <div className="relative flex">
                     <button
                        type="button"
                        onClick={handleUndoGroup}
                        className="h-7 px-3 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] flex items-center gap-1.5 text-[10px] font-bold tracking-wider transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[13px] text-[var(--warning)]">{t("icon_undo", "undo")}</span>
                        <span className="hidden sm:inline">{t("workbench_undo_group", "Undo Group")}</span>
                     </button>
                  </div>
               )}
               {modifiedCount > 0 && (
                  <div className="relative flex">
                     <button
                        type="button"
                        onClick={handleResetGroup}
                        className="h-7 px-3 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] flex items-center gap-1.5 text-[10px] font-bold tracking-wider transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">{t("icon_restart_alt", "restart_alt")}</span>
                        <span className="hidden sm:inline">{t("workbench_reset_group", "Reset Group")}</span>
                     </button>
                  </div>
               )}
               <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)]">
                  <span className="material-symbols-outlined !text-[16px]">
                     {isCollapsed ? t("icon_expand_more", "expand_more") : t("icon_expand_less", "expand_less")}
                  </span>
               </div>
            </div>
         </div>

         {!isCollapsed && (
            <div className="p-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 @[440px]:grid-cols-2 @[680px]:grid-cols-3 gap-2.5 items-stretch">
               <WorkbenchVisualEditor
                  settings={childSettings}
                  dataSource={dataSource}
                  savedDataSource={savedDataSource}
                  isPreview={isPreview}
                  isNested={true}
                  parentPath={dataPath}
                  selectedCategory={selectedCategory}
                  searchQuery={searchQuery}
                  onlyModified={onlyModified}
                  onlyUnsaved={onlyUnsaved}
                  onVisualChange={onVisualChange}
                  onUndoToSaved={onUndoToSaved}
                  highlightedKey={highlightedKey}
               />
            </div>
         )}
      </div>
   );
};

const VISUAL_PAGE_BATCH = 60;

export const WorkbenchVisualEditor: React.FC<WorkbenchVisualEditorProps> = ({
   settings,
   categories = [],
   dataSource,
   savedDataSource,
   isPreview = false,
   isNested = false,
   parentPath = "",
   selectedCategory,
   searchQuery,
   onlyModified = false,
   onlyUnsaved = false,
   onVisualChange,
   onUndoToSaved,
   highlightedKey
}) => {
   const { t } = useLexicon();
   const [visibleLimit, setVisibleLimit] = useState(VISUAL_PAGE_BATCH);
   const loadMoreRef = useRef<HTMLDivElement | null>(null);

   useEffect(() => {
      if (!isNested) {
         setVisibleLimit(VISUAL_PAGE_BATCH);
      }
   }, [selectedCategory, searchQuery, onlyModified, onlyUnsaved, isNested]);

   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k, k);
      if (tr === `[${k}]`) return k;
      return tr;
   };

   const filteredSettings = React.useMemo(() => {
      if (!settings || !Array.isArray(settings)) return [];
      let list = settings;
      if (selectedCategory !== "ALL" && !isNested) {
         list = list.filter(s => s.category === selectedCategory);
      }

      if (searchQuery) {
         const q = searchQuery.toLowerCase();
         list = list.filter(s => {
            const lbl = humanizeConfigLabel(resolveText(s.label_key, s.key)).toLowerCase();
            const desc = resolveText(s.desc_key, "").toLowerCase();
            const keyStr = (s.key || "").toLowerCase();
            if (lbl.includes(q) || desc.includes(q) || keyStr.includes(q)) return true;
            if (s.type === "group" && Array.isArray(s.settings)) {
               return s.settings.some((child: any) =>
                  humanizeConfigLabel(resolveText(child.label_key, child.key)).toLowerCase().includes(q) ||
                  (child.key || "").toLowerCase().includes(q)
               );
            }
            return false;
         });
      }

      if (onlyModified) {
         list = list.filter(s => isSettingModified(s, dataSource, parentPath));
      }
      if (onlyUnsaved) {
         list = list.filter(s => isSettingEditedFromSaved(s, dataSource, savedDataSource, parentPath));
      }
      return list;
   }, [settings, selectedCategory, isNested, searchQuery, onlyModified, onlyUnsaved, dataSource, savedDataSource, parentPath, t]);

   useEffect(() => {
      if (isNested || visibleLimit >= filteredSettings.length) return;
      const el = loadMoreRef.current;
      if (!el) return;
      const observer = new IntersectionObserver(
         (entries) => {
            if (entries[0]?.isIntersecting) {
               setVisibleLimit((prev) => Math.min(filteredSettings.length, prev + VISUAL_PAGE_BATCH));
            }
         },
         { rootMargin: "300px" }
      );
      observer.observe(el);
      return () => observer.disconnect();
   }, [isNested, visibleLimit, filteredSettings.length]);

   if (!settings || !Array.isArray(settings)) return null;

   const displayedSettings = isNested ? filteredSettings : filteredSettings.slice(0, visibleLimit);

   const renderSettingItem = (setting: any, idx: number) => {
      const localPath = setting.path || setting.key;

      if (!localPath) {
         return (
            <div key={idx} className="col-span-full p-4 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl">
               <span className="text-red-400 text-xs font-black tracking-widest capitalize">{t("err_invalid_setting", "Invalid Setting Object")}</span>
            </div>
         );
      }

      const dataPath = parentPath && !localPath.startsWith(parentPath + ".") ? `${parentPath}.${localPath}` : localPath;
      const val = dataSource && dataPath ? dataPath.split('.').reduce((o: any, i: string) => o?.[i], dataSource) : undefined;
      const savedVal = savedDataSource && dataPath ? dataPath.split('.').reduce((o: any, i: string) => o?.[i], savedDataSource) : undefined;

      if (setting.type === "group") {
         return (
            <GroupNode
               key={dataPath || idx}
               setting={setting}
               dataPath={dataPath}
               dataSource={dataSource}
               savedDataSource={savedDataSource}
               isPreview={isPreview}
               selectedCategory={selectedCategory}
               searchQuery={searchQuery}
               onlyModified={onlyModified}
               onlyUnsaved={onlyUnsaved}
               onVisualChange={onVisualChange}
               onUndoToSaved={onUndoToSaved}
               highlightedKey={highlightedKey}
               resolveText={resolveText}
               t={t}
            />
         );
      }

      const actualHighlightKey = highlightedKey ? highlightedKey.split('::')[0] : null;
      const isHighlighted = actualHighlightKey === dataPath;

      return (
         <SettingNode
            key={dataPath || idx}
            setting={setting}
            val={val}
            savedVal={savedVal}
            dataPath={dataPath}
            isHighlighted={isHighlighted}
            isPreview={isPreview}
            isNested={isNested}
            onVisualChange={onVisualChange}
            onUndoToSaved={onUndoToSaved}
            t={t}
         />
      );
   };

   if (isNested) {
      return <>{displayedSettings.map((s, idx) => renderSettingItem(s, idx))}</>;
   }

   const groupItems: { setting: any; idx: number }[] = [];
   const leafItems: { setting: any; idx: number }[] = [];
   displayedSettings.forEach((setting, idx) => {
      if (setting?.type === "group") {
         groupItems.push({ setting, idx });
      } else {
         leafItems.push({ setting, idx });
      }
   });

   return (
      <div className="w-full @container flex flex-col gap-3">
         {groupItems.length > 0 && (
            <div className="flex flex-col gap-2.5 w-full">
               {groupItems.map(({ setting, idx }) => renderSettingItem(setting, idx))}
            </div>
         )}

         {leafItems.length > 0 && (
            <div className="grid grid-cols-1 @[620px]:grid-cols-2 gap-2.5 items-stretch w-full">
               {leafItems.map(({ setting, idx }) => renderSettingItem(setting, idx))}
            </div>
         )}

         {visibleLimit < filteredSettings.length && (
            <div ref={loadMoreRef} className="w-full py-4 flex items-center justify-center">
               <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => Math.min(filteredSettings.length, prev + VISUAL_PAGE_BATCH * 2))}
                  className="h-9 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
               >
                  {displayedSettings.length} / {filteredSettings.length} {t("workbench_settings_count", "Settings")}
               </button>
            </div>
         )}
      </div>
   );
};

