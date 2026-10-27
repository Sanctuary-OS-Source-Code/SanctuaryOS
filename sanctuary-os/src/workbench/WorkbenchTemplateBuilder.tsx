import React, { useState, useEffect, useRef } from 'react';
import { useLexicon } from '../LexiconContext';
import { CustomDropdown, ActionPill } from '../shared';
import IconPicker from '../IconPicker';
import { humanizeConfigLabel } from './WorkbenchVisualEditor';

interface WorkbenchTemplateBuilderProps {
   parsedData: any;
   rawText: string;
   onUpdateTemplate: (newJsonText: string, preParsed?: any) => void;
   files: { name: string; path: string }[];
   handleAutoMap?: () => void;
}

const BUILDER_PAGE_BATCH = 40;

const FLAT_CARD_SHADOW_VARS = {
   "--glass-outer-shadow": "0 0 #0000",
   "--glass-nested-shadow": "0 0 #0000",
   "--glass-surface-outer-shadow": "0 0 #0000",
} as React.CSSProperties;

const createDefaultSettingByType = (type: string, category = "general", parentKey = "", index = 1) => {
   const suffix = index > 0 ? `_${index}` : "";
   const baseKey =
      type === "boolean" ? `New_Boolean${suffix}` :
      type === "number" ? `New_Number${suffix}` :
      type === "tuple" ? `New_Range${suffix}` :
      type === "string" ? `New_String${suffix}` :
      type === "dropdown" ? `New_Dropdown${suffix}` :
      type === "keybinding" ? `New_Keybind${suffix}` :
      `New_Group${suffix}`;

   const fullPath = parentKey ? `${parentKey}.${baseKey}` : baseKey;

   const base: any = {
      key: baseKey,
      path: fullPath,
      type,
      label_key: humanizeConfigLabel(baseKey),
      desc_key: "",
      category
   };

   if (type === "boolean") {
      base.default = false;
   } else if (type === "number") {
      base.allow_decimals = false;
      base.min = 0;
      base.max = 100;
      base.step = 1;
      base.default = 50;
   } else if (type === "tuple") {
      base.allow_decimals = false;
      base.min = -100;
      base.max = 100;
      base.step = 1;
      base.default = "-100,100";
   } else if (type === "string") {
      base.default = "";
   } else if (type === "dropdown") {
      base.options = [
         { value: "opt1", label_key: "Option 1" },
         { value: "opt2", label_key: "Option 2" }
      ];
      base.default = "opt1";
   } else if (type === "keybinding") {
      base.key_format = "literal";
      base.allow_multiple = false;
      base.default = "";
   } else if (type === "group") {
      base.settings = [];
   }

   return base;
};

export const WorkbenchTemplateBuilder: React.FC<WorkbenchTemplateBuilderProps> = ({
   parsedData,
   rawText,
   onUpdateTemplate,
   files,
   handleAutoMap
}) => {
   const { t } = useLexicon();

   const [showMetaDrawer, setShowMetaDrawer] = useState(false);
   const [showCategoriesDrawer, setShowCategoriesDrawer] = useState(false);
   const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("ALL");
   const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
   const [showCategoryIconPicker, setShowCategoryIconPicker] = useState(false);
   const [builderSearch, setBuilderSearch] = useState("");
   const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
   const [visibleLimit, setVisibleLimit] = useState(BUILDER_PAGE_BATCH);

   const loadMoreRef = useRef<HTMLDivElement | null>(null);
   const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

   const [localTemplate, setLocalTemplate] = useState<any>(() => {
      if (parsedData && typeof parsedData === "object") {
         return Array.isArray(parsedData) ? parsedData[0] || {} : parsedData;
      }
      try {
         const parsed = JSON.parse(rawText || "{}");
         return Array.isArray(parsed) ? parsed[0] || {} : parsed;
      } catch {
         return {};
      }
   });

   useEffect(() => {
      if (parsedData && typeof parsedData === "object") {
         setLocalTemplate(Array.isArray(parsedData) ? parsedData[0] || {} : parsedData);
      }
   }, [parsedData]);

   useEffect(() => {
      setVisibleLimit(BUILDER_PAGE_BATCH);
   }, [activeCategoryFilter, builderSearch]);

   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k, k);
      if (tr === `[${k}]`) return k;
      return tr;
   };

   const commitTemplate = (mutator: (draft: any) => void) => {
      setLocalTemplate((prev: any) => {
         const draft = JSON.parse(JSON.stringify(prev || {}));
         if (!draft.schema_version) draft.schema_version = 2;
         if (!Array.isArray(draft.categories)) {
            draft.categories = [{ id: "general", name_key: "General", icon_key: "tune" }];
         }
         if (!Array.isArray(draft.settings)) {
            draft.settings = [];
         }
         mutator(draft);

         if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
         syncTimerRef.current = setTimeout(() => {
            onUpdateTemplate(JSON.stringify(draft, null, 2), draft);
         }, 150);

         return draft;
      });
   };

   const categories: any[] = Array.isArray(localTemplate?.categories) && localTemplate.categories.length > 0
      ? localTemplate.categories
      : [{ id: "general", name_key: "General", icon_key: "tune" }];

   const settingsList: any[] = Array.isArray(localTemplate?.settings) ? localTemplate.settings : [];

   const configFileOptions = React.useMemo(() => {
      const opts = files
         .filter((f) => !f.name.toLowerCase().endsWith(".json"))
         .map((f) => {
            const name = f.path.split(/[\\/]/).pop() || f.name;
            return { id: name, label: name };
         });
      if (
         localTemplate?.target_file &&
         !opts.some((o) => o.id.toLowerCase() === String(localTemplate.target_file).toLowerCase())
      ) {
         opts.unshift({ id: localTemplate.target_file, label: localTemplate.target_file });
      }
      return opts;
   }, [files, localTemplate?.target_file]);

   const typeOptions = [
      { id: "boolean", label: t("workbench_add_boolean", "Boolean"), icon: t("icon_toggle_on", "toggle_on") },
      { id: "number", label: t("workbench_add_number", "Number"), icon: t("icon_numbers", "123") },
      { id: "tuple", label: t("workbench_add_tuple", "Range"), icon: t("icon_swap_horiz", "swap_horiz") },
      { id: "string", label: t("workbench_add_string", "Text"), icon: t("icon_title", "title") },
      { id: "dropdown", label: t("support_type_dropdown", "Dropdown"), icon: t("icon_dropdown", "arrow_drop_down_circle") },
      { id: "keybinding", label: t("workbench_add_keybinding", "Keybind"), icon: t("icon_keyboard", "keyboard") },
      { id: "group", label: t("workbench_add_group", "Group"), icon: t("icon_account_tree", "account_tree") }
   ];

   const childTypeOptions = typeOptions.filter((o) => o.id !== "group");

   const categoryDropdownOptions = categories.map((cat: any) => ({
      id: cat.id,
      label: resolveText(cat.name_key, cat.name || cat.id),
      icon: resolveText(cat.icon_key, cat.icon || "folder")
   }));

   const getIconForType = (type: string) => {
      if (type === "boolean") return t("icon_toggle_on", "toggle_on");
      if (type === "number") return t("icon_numbers", "123");
      if (type === "tuple") return t("icon_swap_horiz", "swap_horiz");
      if (type === "string") return t("icon_title", "title");
      if (type === "dropdown") return t("icon_dropdown", "arrow_drop_down_circle");
      if (type === "keybinding") return t("icon_keyboard", "keyboard");
      if (type === "group") return t("icon_account_tree", "account_tree");
      return t("icon_tune", "tune");
   };

   const handleAddSetting = (type: string, parentIdx: number | null = null) => {
      const defaultCat = activeCategoryFilter !== "ALL" ? activeCategoryFilter : (categories[0]?.id || "general");
      commitTemplate((draft) => {
         if (parentIdx !== null && draft.settings[parentIdx]) {
            const parent = draft.settings[parentIdx];
            if (!Array.isArray(parent.settings)) parent.settings = [];
            const nextIdx = parent.settings.length + 1;
            const newChild = createDefaultSettingByType(type, parent.category || defaultCat, parent.path || parent.key, nextIdx);
            parent.settings.push(newChild);
            const childId = `${parentIdx}-${parent.settings.length - 1}`;
            setExpandedPaths((prev) => ({ ...prev, [String(parentIdx)]: true, [childId]: true }));
         } else {
            const nextIdx = draft.settings.length + 1;
            const newSetting = createDefaultSettingByType(type, defaultCat, "", nextIdx);
            draft.settings.unshift(newSetting);
            setExpandedPaths((prev) => ({ ...prev, ["0"]: true }));
         }
      });
   };

   const filteredIndexedSettings = React.useMemo(() => {
      return settingsList
         .map((s, idx) => ({ setting: s, idx }))
         .filter(({ setting }) => {
            if (activeCategoryFilter !== "ALL" && setting.category !== activeCategoryFilter) return false;
            if (builderSearch.trim()) {
               const q = builderSearch.toLowerCase();
               const lbl = humanizeConfigLabel(resolveText(setting.label_key, setting.key)).toLowerCase();
               const keyStr = (setting.key || "").toLowerCase();
               if (lbl.includes(q) || keyStr.includes(q)) return true;
               if (setting.type === "group" && Array.isArray(setting.settings)) {
                  return setting.settings.some((ch: any) =>
                     humanizeConfigLabel(resolveText(ch.label_key, ch.key)).toLowerCase().includes(q) ||
                     (ch.key || "").toLowerCase().includes(q)
                  );
               }
               return false;
            }
            return true;
         });
   }, [settingsList, activeCategoryFilter, builderSearch, t]);

   useEffect(() => {
      if (visibleLimit >= filteredIndexedSettings.length) return;
      const el = loadMoreRef.current;
      if (!el) return;
      const observer = new IntersectionObserver(
         (entries) => {
            if (entries[0]?.isIntersecting) {
               setVisibleLimit((prev) => Math.min(filteredIndexedSettings.length, prev + BUILDER_PAGE_BATCH));
            }
         },
         { rootMargin: "300px" }
      );
      observer.observe(el);
      return () => observer.disconnect();
   }, [visibleLimit, filteredIndexedSettings.length]);

   const renderSettingEditorCard = (setting: any, idx: number, parentIdx: number | null = null, totalSiblings = 1) => {
      const cardId = parentIdx !== null ? `${parentIdx}-${idx}` : String(idx);
      const isExpanded = !!expandedPaths[cardId];
      const isChild = parentIdx !== null;

      const updateThisSetting = (updater: (target: any, parent?: any) => void) => {
         commitTemplate((draft) => {
            if (parentIdx !== null) {
               const parent = draft.settings[parentIdx];
               if (parent && Array.isArray(parent.settings) && parent.settings[idx]) {
                  updater(parent.settings[idx], parent);
               }
            } else if (draft.settings[idx]) {
               updater(draft.settings[idx]);
            }
         });
      };

      const moveSetting = (dir: -1 | 1, e: React.MouseEvent) => {
         e.stopPropagation();
         commitTemplate((draft) => {
            const list = parentIdx !== null ? draft.settings[parentIdx]?.settings : draft.settings;
            if (!Array.isArray(list)) return;
            const targetIdx = idx + dir;
            if (targetIdx < 0 || targetIdx >= list.length) return;
            const temp = list[idx];
            list[idx] = list[targetIdx];
            list[targetIdx] = temp;
         });
      };

      const duplicateSetting = (e: React.MouseEvent) => {
         e.stopPropagation();
         commitTemplate((draft) => {
            const list = parentIdx !== null ? draft.settings[parentIdx]?.settings : draft.settings;
            if (!Array.isArray(list) || !list[idx]) return;
            const copy = JSON.parse(JSON.stringify(list[idx]));
            copy.key = `${copy.key}_Copy`;
            const parentPrefix = parentIdx !== null ? (draft.settings[parentIdx]?.path || draft.settings[parentIdx]?.key || "") : "";
            copy.path = parentPrefix ? `${parentPrefix}.${copy.key}` : copy.key;
            copy.label_key = `${copy.label_key || copy.key} (Copy)`;
            list.splice(idx + 1, 0, copy);
         });
      };

      const deleteSetting = (e: React.MouseEvent) => {
         e.stopPropagation();
         commitTemplate((draft) => {
            const list = parentIdx !== null ? draft.settings[parentIdx]?.settings : draft.settings;
            if (!Array.isArray(list)) return;
            list.splice(idx, 1);
         });
      };

      const handleTypeChange = (newType: string) => {
         updateThisSetting((target, parent) => {
            const oldKey = target.key;
            const oldLabel = target.label_key;
            const oldDesc = target.desc_key;
            const oldCat = target.category;
            const parentKey = parent ? (parent.path || parent.key || "") : "";
            const fresh = createDefaultSettingByType(newType, oldCat || "general", parentKey, 0);
            Object.keys(target).forEach((k) => delete target[k]);
            Object.assign(target, fresh, {
               key: oldKey,
               path: parentKey ? `${parentKey}.${oldKey}` : oldKey,
               label_key: oldLabel,
               desc_key: oldDesc,
               category: oldCat || "general"
            });
         });
      };

      const rawDisplayLabel = resolveText(setting.label_key, setting.key);
      const displayLabel = humanizeConfigLabel(rawDisplayLabel);
      const catObj = categories.find((c: any) => c.id === setting.category);
      const catLabel = catObj ? resolveText(catObj.name_key, catObj.id) : setting.category;

      return (
         <div
            key={cardId}
            style={FLAT_CARD_SHADOW_VARS}
            className={`group rounded-2xl border transition-colors duration-200 overflow-hidden ${
               isChild
                  ? 'glass-surface border-[color-mix(in_srgb,var(--text)_8%,transparent)]'
                  : 'glass-panel border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_16%,transparent)]'
            } ${isExpanded ? '!border-[color-mix(in_srgb,var(--accent)_35%,transparent)]' : ''}`}
         >
            {/* Compact Card Header */}
            <div
               onClick={() => setExpandedPaths((prev) => ({ ...prev, [cardId]: !prev[cardId] }))}
               className="px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors select-none"
            >
               <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={`material-symbols-outlined !text-[17px] shrink-0 ${
                     setting.type === "group" ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'
                  }`}>
                     {getIconForType(setting.type)}
                  </span>
                  <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                     <span className="text-[12px] font-black text-[var(--text)] tracking-wide truncate">
                        {displayLabel || setting.key}
                     </span>
                     <span className="px-2 py-0.5 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[8px] font-black uppercase tracking-wider text-[var(--accent)]">
                        {setting.type}
                     </span>
                     {!isChild && catLabel && categories.length > 1 && (
                        <span className="px-2 py-0.5 rounded-full glass-surface border !border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[8px] font-bold text-[var(--subtext)]">
                           {catLabel}
                        </span>
                     )}
                     {setting.type === "group" && Array.isArray(setting.settings) && (
                        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60">
                           ({setting.settings.length})
                        </span>
                     )}
                  </div>
               </div>

               <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <div className={`flex items-center gap-1 transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                     <button
                        type="button"
                        disabled={idx === 0}
                        onClick={(e) => moveSetting(-1, e)}
                        className="w-6.5 h-6.5 rounded-lg glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-25 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_arrow_upward", "arrow_upward")}</span>
                     </button>
                     <button
                        type="button"
                        disabled={idx >= totalSiblings - 1}
                        onClick={(e) => moveSetting(1, e)}
                        className="w-6.5 h-6.5 rounded-lg glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] disabled:opacity-25 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_arrow_downward", "arrow_downward")}</span>
                     </button>
                     <button
                        type="button"
                        onClick={duplicateSetting}
                        className="w-6.5 h-6.5 rounded-lg glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[13px]">{t("icon_content_copy", "content_copy")}</span>
                     </button>
                     <button
                        type="button"
                        onClick={deleteSetting}
                        className="w-6.5 h-6.5 rounded-lg glass-surface hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center text-[var(--danger)] transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_delete", "delete")}</span>
                     </button>
                  </div>
                  <button
                     type="button"
                     onClick={() => setExpandedPaths((prev) => ({ ...prev, [cardId]: !prev[cardId] }))}
                     className="w-6.5 h-6.5 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer"
                  >
                     <span className="material-symbols-outlined !text-[17px]">
                        {isExpanded ? t("icon_expand_less", "expand_less") : t("icon_expand_more", "expand_more")}
                     </span>
                  </button>
               </div>
            </div>

            {/* Expanded Form */}
            {isExpanded && (
               <div className="p-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     {/* Config Key */}
                     <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                           {t("workbench_field_key", "Config Key")}
                        </label>
                        <input
                           type="text"
                           value={setting.key || ""}
                           onChange={(e) => {
                              const newKey = e.target.value;
                              updateThisSetting((target, parent) => {
                                 target.key = newKey;
                                 const parentPrefix = parent ? (parent.path || parent.key || "") : "";
                                 target.path = parentPrefix ? `${parentPrefix}.${newKey}` : newKey;
                                 if (target.type === "group" && Array.isArray(target.settings)) {
                                    target.settings.forEach((ch: any) => {
                                       ch.path = `${target.path}.${ch.key}`;
                                    });
                                 }
                              });
                           }}
                           className="h-9 glass-surface rounded-xl px-3 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                        />
                     </div>

                     {/* Display Label */}
                     <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                           {t("workbench_field_label", "Display Label")}
                        </label>
                        <input
                           type="text"
                           value={setting.label_key || ""}
                           onChange={(e) => updateThisSetting((target) => { target.label_key = e.target.value; })}
                           className="h-9 glass-surface rounded-xl px-3 text-[11px] font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                        />
                     </div>

                     {/* Control Type */}
                     <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                           {t("workbench_field_type", "Control Type")}
                        </label>
                        <CustomDropdown
                           disableTint={true}
                           value={setting.type || "boolean"}
                           options={isChild ? childTypeOptions : typeOptions}
                           onChange={(val: string[]) => val[0] && handleTypeChange(val[0])}
                        />
                     </div>

                     {/* Category or Risk */}
                     {!isChild ? (
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("category", "Category")}
                           </label>
                           <CustomDropdown
                              disableTint={true}
                              value={setting.category || categories[0]?.id || "general"}
                              options={categoryDropdownOptions}
                              onChange={(val: string[]) => updateThisSetting((target) => { target.category = val[0]; })}
                           />
                        </div>
                     ) : (
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_field_risk", "Risk Level")}
                           </label>
                           <CustomDropdown
                              disableTint={true}
                              value={setting.risk || "normal"}
                              options={[
                                 { id: "normal", label: t("badge_standard", "Standard") },
                                 { id: "advanced", label: t("advanced_badge", "Advanced") }
                              ]}
                              onChange={(val: string[]) => updateThisSetting((target) => {
                                 if (val[0] === "normal") delete target.risk;
                                 else target.risk = val[0];
                              })}
                           />
                        </div>
                     )}

                     {/* Description */}
                     <div className={`flex flex-col gap-1 ${!isChild ? '' : 'sm:col-span-2'}`}>
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                           {t("upload_desc", "Description")}
                        </label>
                        <input
                           type="text"
                           value={setting.desc_key || ""}
                           onChange={(e) => updateThisSetting((target) => { target.desc_key = e.target.value; })}
                           placeholder={t("upload_desc", "Description")}
                           className="h-9 glass-surface rounded-xl px-3 text-[11px] font-medium text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                        />
                     </div>

                     {!isChild && (
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_field_risk", "Risk Level")}
                           </label>
                           <CustomDropdown
                              disableTint={true}
                              value={setting.risk || "normal"}
                              options={[
                                 { id: "normal", label: t("badge_standard", "Standard") },
                                 { id: "advanced", label: t("advanced_badge", "Advanced") }
                              ]}
                              onChange={(val: string[]) => updateThisSetting((target) => {
                                 if (val[0] === "normal") delete target.risk;
                                 else target.risk = val[0];
                              })}
                           />
                        </div>
                     )}
                  </div>

                  {/* Type-specific settings */}
                  {setting.type === "boolean" && (
                     <div className="flex items-center justify-between glass-surface rounded-xl px-3.5 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                           {t("type_default", "Default")}
                        </span>
                        <button
                           type="button"
                           onClick={() => updateThisSetting((target) => { target.default = !Boolean(target.default); })}
                           className={`sa-glass-toggle ${setting.default ? 'is-on' : ''}`}
                        >
                           <div className="sa-glass-toggle-thumb" />
                        </button>
                     </div>
                  )}

                  {(setting.type === "number" || setting.type === "tuple") && (
                     <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-end glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("type_default", "Default")}
                           </label>
                           <input
                              type={setting.type === "tuple" ? "text" : "number"}
                              placeholder={setting.type === "tuple" ? "-100,100" : "0"}
                              value={setting.default ?? (setting.type === "tuple" ? "-100,100" : 0)}
                              onChange={(e) => updateThisSetting((target) => {
                                 target.default = setting.type === "tuple" ? e.target.value : Number(e.target.value);
                              })}
                              className="h-8 glass-surface rounded-lg px-2.5 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                           />
                        </div>
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_field_min", "Min")}
                           </label>
                           <input
                              type="number"
                              value={setting.min ?? (setting.type === "tuple" ? -100 : 0)}
                              onChange={(e) => updateThisSetting((target) => { target.min = Number(e.target.value); })}
                              className="h-8 glass-surface rounded-lg px-2.5 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                           />
                        </div>
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_field_max", "Max")}
                           </label>
                           <input
                              type="number"
                              value={setting.max ?? 100}
                              onChange={(e) => updateThisSetting((target) => { target.max = Number(e.target.value); })}
                              className="h-8 glass-surface rounded-lg px-2.5 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                           />
                        </div>
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_field_step", "Step")}
                           </label>
                           <input
                              type="number"
                              value={setting.step ?? 1}
                              onChange={(e) => updateThisSetting((target) => { target.step = Number(e.target.value) || 1; })}
                              className="h-8 glass-surface rounded-lg px-2.5 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                           />
                        </div>
                        <div className="flex items-center justify-between sm:justify-center gap-2 h-8 px-2">
                           <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_field_decimals", "Allow Decimals")}
                           </span>
                           <button
                              type="button"
                              onClick={() => updateThisSetting((target) => { target.allow_decimals = !Boolean(target.allow_decimals); })}
                              className={`sa-glass-toggle scale-90 ${setting.allow_decimals ? 'is-on' : ''}`}
                           >
                              <div className="sa-glass-toggle-thumb" />
                           </button>
                        </div>
                     </div>
                  )}

                  {setting.type === "string" && (
                     <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                           {t("type_default", "Default")}
                        </label>
                        <input
                           type="text"
                           value={setting.default ?? ""}
                           onChange={(e) => updateThisSetting((target) => { target.default = e.target.value; })}
                           className="h-9 glass-surface rounded-xl px-3 text-[11px] font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                        />
                     </div>
                  )}

                  {setting.type === "dropdown" && (
                     <div className="flex flex-col gap-2.5 glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                        <div className="flex items-center justify-between">
                           <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_field_options", "Dropdown Options")}
                           </span>
                           <button
                              type="button"
                              onClick={() => updateThisSetting((target) => {
                                 if (!Array.isArray(target.options)) target.options = [];
                                 const nextNum = target.options.length + 1;
                                 target.options.push({ value: `opt${nextNum}`, label_key: `Option ${nextNum}` });
                              })}
                              className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:sa-glass-pill-active text-[var(--text)] flex items-center gap-1 text-[10px] font-black tracking-wider transition-all cursor-pointer"
                           >
                              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_add", "add")}</span>
                              {t("support_add_option", "Add Option")}
                           </button>
                        </div>

                        <div className="flex flex-col gap-2">
                           {(setting.options || []).map((opt: any, optIdx: number) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                 <input
                                    type="text"
                                    value={opt.value ?? ""}
                                    placeholder={t("workbench_option_value", "Raw Value")}
                                    onChange={(e) => updateThisSetting((target) => {
                                       if (target.options?.[optIdx]) target.options[optIdx].value = e.target.value;
                                    })}
                                    className="h-8 w-1/3 glass-surface rounded-lg px-2.5 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                                 />
                                 <input
                                    type="text"
                                    value={opt.label_key ?? ""}
                                    placeholder={t("workbench_field_label", "Display Label")}
                                    onChange={(e) => updateThisSetting((target) => {
                                       if (target.options?.[optIdx]) target.options[optIdx].label_key = e.target.value;
                                    })}
                                    className="h-8 flex-1 glass-surface rounded-lg px-2.5 text-[11px] font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                                 />
                                 <button
                                    type="button"
                                    onClick={() => updateThisSetting((target) => {
                                       target.default = opt.value;
                                    })}
                                    className={`h-8 px-2.5 rounded-lg glass-surface text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                                       setting.default === opt.value
                                          ? 'sa-glass-pill-active text-[var(--text)]'
                                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-65 hover:opacity-100 hover:text-[var(--text)]'
                                    }`}
                                 >
                                    <span className={`material-symbols-outlined !text-[12px] ${setting.default === opt.value ? "text-[var(--accent)]" : "text-[var(--subtext)]"}`}>
                                       {setting.default === opt.value ? t("icon_check_circle", "check_circle") : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                                    </span>
                                    {t("type_default", "Default")}
                                 </button>
                                 <button
                                    type="button"
                                    onClick={() => updateThisSetting((target) => {
                                       if (Array.isArray(target.options)) target.options.splice(optIdx, 1);
                                    })}
                                    className="w-8 h-8 rounded-lg glass-surface hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center text-[var(--danger)] transition-all cursor-pointer shrink-0"
                                 >
                                    <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
                                 </button>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

                  {setting.type === "keybinding" && (
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_key_format", "Key Format")}
                           </label>
                           <CustomDropdown
                              disableTint={true}
                              value={setting.key_format || "literal"}
                              options={[
                                 { id: "literal", label: t("workbench_key_literal", "Key Name (SPACE, J)") },
                                 { id: "keycode", label: t("workbench_key_keycode", "Numeric Keycode (32, 74)") }
                              ]}
                              onChange={(val: string[]) => updateThisSetting((target) => { target.key_format = val[0]; })}
                           />
                        </div>
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("type_default", "Default")}
                           </label>
                           <input
                              type="text"
                              value={setting.default ?? ""}
                              onChange={(e) => updateThisSetting((target) => { target.default = e.target.value; })}
                              className="h-9 glass-surface rounded-xl px-3 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                           />
                        </div>
                        <div className="flex items-center justify-between glass-surface rounded-xl px-3 h-9 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] mt-auto">
                           <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_allow_multiple", "Allow Multiple Keys")}
                           </span>
                           <button
                              type="button"
                              onClick={() => updateThisSetting((target) => { target.allow_multiple = !Boolean(target.allow_multiple); })}
                              className={`sa-glass-toggle scale-90 ${setting.allow_multiple ? 'is-on' : ''}`}
                           >
                              <div className="sa-glass-toggle-thumb" />
                           </button>
                        </div>
                     </div>
                  )}

                  {/* Group Nested Settings Builder */}
                  {setting.type === "group" && !isChild && (
                     <div className="flex flex-col gap-3 glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
                        <div className="flex flex-col gap-2">
                           <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] flex items-center gap-1.5">
                              <span className="material-symbols-outlined !text-[15px]">{t("icon_account_tree", "account_tree")}</span>
                              {t("workbench_group_children", "Grouped Settings")} ({(setting.settings || []).length})
                           </span>
                           <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 w-full">
                              {childTypeOptions.map((ct) => (
                                 <button
                                    key={ct.id}
                                    type="button"
                                    onClick={() => handleAddSetting(ct.id, idx)}
                                    className="h-8 px-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-1 text-[10px] font-bold tracking-tight transition-all cursor-pointer min-w-0"
                                 >
                                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">{ct.icon}</span>
                                    <span className="truncate">{ct.label}</span>
                                 </button>
                              ))}
                           </div>
                        </div>

                        <div className="flex flex-col gap-2">
                           {(setting.settings || []).map((childSetting: any, childIdx: number) =>
                              renderSettingEditorCard(childSetting, childIdx, idx, (setting.settings || []).length)
                           )}
                        </div>
                     </div>
                  )}
               </div>
            )}
         </div>
      );
   };

   const displayedSettings = filteredIndexedSettings.slice(0, visibleLimit);

   return (
      <div className="flex flex-col gap-3 w-full pb-16" style={FLAT_CARD_SHADOW_VARS}>
         {/* 1. Compact Target File, Auto-Map, Categories & Metadata Bar */}
         <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
               <div className="flex-1 min-w-[200px]">
                  <CustomDropdown
                     disableTint={true}
                     className="h-10"
                     buttonClassName="!h-10 !px-3.5 !rounded-xl !text-xs"
                     value={localTemplate?.target_file ? [localTemplate.target_file] : []}
                     options={configFileOptions}
                     placeholder={t("ui_placeholder_target_file", "Select target config file...")}
                     onChange={(val: string[]) => {
                        commitTemplate((draft) => {
                           draft.target_file = val[0];
                        });
                     }}
                  />
               </div>

               {handleAutoMap && (
                  <button
                     type="button"
                     onClick={handleAutoMap}
                     className="h-10 px-4 rounded-xl glass-surface border !border-[color-mix(in_srgb,var(--accent)_42%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_68%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] flex items-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0"
                  >
                     <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_auto_fix_high", "auto_fix_high")}</span>
                     <span>{t("workbench_btn_automap", "Auto-Map Target Keys")}</span>
                  </button>
               )}

               <button
                  type="button"
                  onClick={() => setShowCategoriesDrawer(!showCategoriesDrawer)}
                  className={`h-10 px-3.5 rounded-xl glass-surface border flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                     showCategoriesDrawer
                        ? '!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]'
                        : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                  }`}
               >
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_folder", "folder")}</span>
                  <span>{t("categories", "Categories")} ({categories.length})</span>
               </button>

               <button
                  type="button"
                  onClick={() => setShowMetaDrawer(!showMetaDrawer)}
                  className={`w-10 h-10 rounded-xl glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                     showMetaDrawer
                        ? '!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]'
                        : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                  }`}
               >
                  <span className="material-symbols-outlined !text-[17px]">{t("icon_settings", "settings")}</span>
               </button>
            </div>

            {/* Collapsible Categories Manager */}
            {showCategoriesDrawer && (
               <div className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                     <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("categories", "Categories")}
                     </span>
                     <button
                        type="button"
                        onClick={() => {
                           commitTemplate((draft) => {
                              const nextNum = draft.categories.length + 1;
                              draft.categories.push({
                                 id: `category_${nextNum}`,
                                 name_key: `Category ${nextNum}`,
                                 icon_key: "folder"
                              });
                              setEditingCategoryIndex(draft.categories.length - 1);
                              setShowCategoryIconPicker(false);
                           });
                        }}
                        className="h-7 px-3 rounded-full glass-surface border !border-[color-mix(in_srgb,var(--accent)_42%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_68%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_add", "add")}</span>
                        {t("support_add_cat", "Add Category")}
                     </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                     {categories.map((cat: any, cIdx: number) => {
                        const count = settingsList.filter((s) => s.category === cat.id).length;
                        const iconName = resolveText(cat.icon_key, cat.icon || "folder");
                        const labelName = resolveText(cat.name_key, cat.name || cat.id);

                        return (
                           <div
                              key={cat.id || cIdx}
                              className={`h-8 pl-2.5 pr-1.5 rounded-xl border glass-surface text-[var(--text)] flex items-center gap-1.5 transition-colors ${
                                 editingCategoryIndex === cIdx
                                    ? '!border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                                    : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'
                              }`}
                           >
                              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{iconName}</span>
                              <span className="text-[10px] font-black tracking-wider">{labelName}</span>
                              <span className="text-[9px] opacity-60">({count})</span>
                              <button
                                 type="button"
                                 onClick={() => {
                                    setEditingCategoryIndex(editingCategoryIndex === cIdx ? null : cIdx);
                                    setShowCategoryIconPicker(false);
                                 }}
                                 className="w-5 h-5 rounded-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer ml-0.5"
                              >
                                 <span className="material-symbols-outlined !text-[12px]">{t("icon_edit", "edit")}</span>
                              </button>
                              {categories.length > 1 && (
                                 <button
                                    type="button"
                                    onClick={() => {
                                       commitTemplate((draft) => {
                                          const removed = draft.categories.splice(cIdx, 1)[0];
                                          const fallbackCat = draft.categories[0]?.id || "general";
                                          if (removed && Array.isArray(draft.settings)) {
                                             draft.settings.forEach((s: any) => {
                                                if (s.category === removed.id) s.category = fallbackCat;
                                             });
                                          }
                                       });
                                       if (activeCategoryFilter === cat.id) setActiveCategoryFilter("ALL");
                                       if (editingCategoryIndex === cIdx) {
                                          setEditingCategoryIndex(null);
                                          setShowCategoryIconPicker(false);
                                       }
                                    }}
                                    className="w-5 h-5 rounded-md hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer"
                                 >
                                    <span className="material-symbols-outlined !text-[12px]">{t("icon_close", "close")}</span>
                                 </button>
                              )}
                           </div>
                        );
                     })}
                  </div>

                  {editingCategoryIndex !== null && categories[editingCategoryIndex] && (
                     <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_category_id", "Category ID")}
                           </label>
                           <input
                              type="text"
                              value={categories[editingCategoryIndex].id || ""}
                              onChange={(e) => {
                                 const newId = e.target.value;
                                 commitTemplate((draft) => {
                                    const oldId = draft.categories[editingCategoryIndex]?.id;
                                    if (draft.categories[editingCategoryIndex]) {
                                       draft.categories[editingCategoryIndex].id = newId;
                                       draft.settings.forEach((s: any) => {
                                          if (s.category === oldId) s.category = newId;
                                       });
                                    }
                                 });
                              }}
                              className="h-8 glass-surface rounded-lg px-2.5 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                           />
                        </div>
                        <div className="flex flex-col gap-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("registry_label_name", "Display Name")}
                           </label>
                           <input
                              type="text"
                              value={categories[editingCategoryIndex].name_key || ""}
                              onChange={(e) => {
                                 const val = e.target.value;
                                 commitTemplate((draft) => {
                                    if (draft.categories[editingCategoryIndex]) {
                                       draft.categories[editingCategoryIndex].name_key = val;
                                    }
                                 });
                              }}
                              className="h-8 glass-surface rounded-lg px-2.5 text-[11px] font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                           />
                        </div>
                        <div className="flex flex-col gap-1 relative">
                           <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("workbench_category_icon", "Icon")}
                           </label>
                           <button
                              type="button"
                              onClick={() => setShowCategoryIconPicker(!showCategoryIconPicker)}
                              className={`h-8 w-full glass-surface rounded-lg px-2.5 border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                 showCategoryIconPicker
                                    ? '!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]'
                                    : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--text)]'
                              }`}
                           >
                              <div className="flex items-center gap-2 min-w-0">
                                 <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                    {resolveText(categories[editingCategoryIndex].icon_key, "folder")}
                                 </span>
                                 <span className="text-[11px] font-mono font-bold truncate">
                                    {categories[editingCategoryIndex].icon_key || "folder"}
                                 </span>
                              </div>
                              <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-70 shrink-0">
                                 {showCategoryIconPicker ? t("icon_expand_less", "expand_less") : t("icon_expand_more", "expand_more")}
                              </span>
                           </button>
                           {showCategoryIconPicker && (
                              <IconPicker
                                 onSelect={(icon) => {
                                    commitTemplate((draft) => {
                                       if (draft.categories[editingCategoryIndex]) {
                                          draft.categories[editingCategoryIndex].icon_key = icon;
                                       }
                                    });
                                    setShowCategoryIconPicker(false);
                                 }}
                                 onClose={() => setShowCategoryIconPicker(false)}
                              />
                           )}
                        </div>
                     </div>
                  )}
               </div>
            )}

            {/* Collapsible Metadata Drawer */}
            {showMetaDrawer && (
               <div className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("workbench_target_config_label", "Target Config File")}
                     </label>
                     <input
                        type="text"
                        value={localTemplate?.target_file || ""}
                        onChange={(e) => commitTemplate((draft) => { draft.target_file = e.target.value; })}
                        className="h-9 glass-surface rounded-xl px-3 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                     />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("workbench_parser_type", "Parser Format")}
                     </label>
                     <CustomDropdown
                        disableTint={true}
                        value={localTemplate?.parser_type || "json"}
                        options={[
                           { id: "json", label: "JSON (.json / .cfg)" },
                           { id: "ini", label: "INI / Key=Value (.ini / .cfg)" }
                        ]}
                        onChange={(val: string[]) => commitTemplate((draft) => { draft.parser_type = val[0]; })}
                     />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("workbench_write_scope", "Write Scope")}
                     </label>
                     <CustomDropdown
                        disableTint={true}
                        value={localTemplate?.write_scope || "active_mod_folder"}
                        options={[
                           { id: "active_mod_folder", label: "Active Mod Folder" },
                           { id: "mods_root", label: "Mods Root" }
                        ]}
                        onChange={(val: string[]) => commitTemplate((draft) => { draft.write_scope = val[0]; })}
                     />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("auto_mod_author", "{Mod} Author")}
                     </label>
                     <input
                        type="text"
                        value={localTemplate?.mod_author || ""}
                        onChange={(e) => commitTemplate((draft) => { draft.mod_author = e.target.value; })}
                        className="h-9 glass-surface rounded-xl px-3 text-[11px] font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                     />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("workbench_template_author", "Template Author")}
                     </label>
                     <input
                        type="text"
                        value={localTemplate?.template_author || ""}
                        onChange={(e) => commitTemplate((draft) => { draft.template_author = e.target.value; })}
                        className="h-9 glass-surface rounded-xl px-3 text-[11px] font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                     />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("workbench_template_version", "Template Version")}
                     </label>
                     <input
                        type="text"
                        value={localTemplate?.template_version || "1.0.0"}
                        onChange={(e) => commitTemplate((draft) => { draft.template_version = e.target.value; })}
                        className="h-9 glass-surface rounded-xl px-3 text-[11px] font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] focus:outline-none"
                     />
                  </div>
               </div>
            )}
         </div>

         {/* 2. Search & Filter ActionPill + Symmetrical 6-Button Add Row */}
         <div className="flex flex-col gap-2.5">
            <ActionPill
               className="w-full"
               searchQuery={builderSearch}
               setSearchQuery={setBuilderSearch}
               searchPlaceholder={t("workbench_search_builder", "Search template fields...")}
               rightContent={
                  <div className="flex items-center gap-2 px-3 h-full py-2">
                     <CustomDropdown
                        flat={true}
                        variant="pill"
                        disableTint={true}
                        value={activeCategoryFilter}
                        options={[
                           { id: "ALL", label: `${t("cat_all", "All")} (${settingsList.length})` },
                           ...categories.map((cat: any) => ({
                              id: cat.id,
                              label: `${resolveText(cat.name_key, cat.name || cat.id)} (${settingsList.filter(s => s.category === cat.id).length})`,
                              icon: resolveText(cat.icon_key, cat.icon || "folder")
                           }))
                        ]}
                        onChange={(val: string[]) => setActiveCategoryFilter(val[0])}
                     />
                  </div>
               }
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
               {typeOptions.map((opt) => (
                  <button
                     key={opt.id}
                     type="button"
                     onClick={() => handleAddSetting(opt.id, null)}
                     className="h-9 px-2 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-tight transition-all cursor-pointer min-w-0"
                  >
                     <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">{opt.icon}</span>
                     <span className="truncate">{opt.label}</span>
                  </button>
               ))}
            </div>
         </div>

         {/* 3. Settings Cards List */}
         {filteredIndexedSettings.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col items-center justify-center text-center gap-3 opacity-70">
               <span className="material-symbols-outlined !text-4xl text-[var(--subtext)]">{t("icon_tune", "tune")}</span>
               <p className="text-[11px] font-bold text-[var(--subtext)] max-w-md leading-relaxed">
                  {t("workbench_empty_builder", "No settings in this template yet. Add a setting above or Auto-Map from a target config file.")}
               </p>
            </div>
         ) : (
            <div className="flex flex-col gap-2">
               {displayedSettings.map(({ setting, idx }) =>
                  renderSettingEditorCard(setting, idx, null, settingsList.length)
               )}
               {visibleLimit < filteredIndexedSettings.length && (
                  <div ref={loadMoreRef} className="w-full py-4 flex items-center justify-center">
                     <button
                        type="button"
                        onClick={() => setVisibleLimit((prev) => Math.min(filteredIndexedSettings.length, prev + BUILDER_PAGE_BATCH * 2))}
                        className="h-9 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                     >
                        {displayedSettings.length} / {filteredIndexedSettings.length} {t("workbench_settings_count", "Settings")}
                     </button>
                  </div>
               )}
            </div>
         )}
      </div>
   );
};
