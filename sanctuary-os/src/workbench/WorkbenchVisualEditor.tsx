import React from 'react';
import { useLexicon } from '../LexiconContext';
import { CustomDropdown } from '../shared';

interface WorkbenchVisualEditorProps {
   settings: any[];
   dataSource: any;
   isPreview?: boolean;
   isNested?: boolean;
   parentPath?: string;
   selectedCategory: string;
   searchQuery: string;
   onVisualChange: (key: string, value: any) => void;
   highlightedKey?: string | null;
}

const clampNumber = (v: number, min?: number, max?: number) => {
   if (isNaN(v)) return min !== undefined ? min : 0;
   if (min !== undefined && v < min) return min;
   if (max !== undefined && v > max) return max;
   return v;
};

const SettingNode = React.memo(({ setting, val, dataPath, isHighlighted, isPreview, onVisualChange, t }: any) => {
   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k);
      if (tr === `[${k}]`) return k;
      return tr;
   };

   return (
      <div data-setting-key={setting.key} className={`rounded-[var(--radius)] border p-4 sm:p-6 flex justify-between group hover:bg-white/5 transition-all duration-500 gap-4 sm:gap-6 transform-gpu backface-hidden relative overflow-hidden ${isPreview ? 'flex-col' : 'flex-col flex-wrap md:flex-row md:items-center'} ${isHighlighted ? 'z-10 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)]' : 'theme-glass-inner border-transparent'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '80px' }}>
         {isHighlighted && (
            <>
               <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: `linear-gradient(90deg, color-mix(in srgb, var(--accent) 5%, transparent), transparent)` }} />
               <div className="absolute top-0 right-0 w-32 h-32 blur-[50px] rounded-full pointer-events-none" style={{ backgroundColor: `color-mix(in srgb, var(--accent) 15%, transparent)` }} />
            </>
         )}
         <div className="flex flex-col gap-1.5 flex-1 min-w-0 relative z-10">
            <div className="flex flex-wrap items-center gap-3">
               <span className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">{resolveText(setting.label_key, setting.key)}</span>
               {setting.risk === "advanced" && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] text-[8px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">{t("advanced_badge")}</span>
               )}
               {!isPreview && setting.type === 'boolean' && (
                  <span className={`text-[8px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md border ${val ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10' : 'text-[var(--subtext)] border-[var(--text)]/10 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                     {val ? 'ENABLED' : 'DISABLED'}
                  </span>
               )}
            </div>
            <span className="text-[10px] text-[var(--subtext)] opacity-80 font-medium leading-relaxed max-w-2xl">{resolveText(setting.desc_key, "No description provided.")}</span>
         </div>
         <div className="shrink-0 flex items-center justify-end relative z-10">
            {setting.type === "boolean" && (
               <div className={`w-14 h-8 rounded-full transition-all duration-300 relative flex items-center px-1 cursor-pointer ${val ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]' : 'theme-glass-inner'}`} onClick={() => !isPreview && onVisualChange(dataPath, !val)}>
                  <div className={`w-6 h-6 rounded-full shadow-md transition-all duration-300 ${val ? 'translate-x-6 bg-[var(--accent)]' : 'translate-x-0 bg-[var(--text)] opacity-40'}`}></div>
               </div>
            )}
            {setting.type === "number" && (
               <div className="flex items-stretch overflow-hidden theme-glass-inner rounded-xl shrink-0">
                  <button type="button" onClick={() => !isPreview && onVisualChange(dataPath, clampNumber((val !== undefined ? parseFloat(val as any) : setting.default || 0) - (setting.step || 1), setting.min, setting.max))} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                     <span className="material-symbols-outlined !text-[16px]">{t("icon_remove")}</span>
                  </button>
                  <input type="text" value={val !== undefined ? val : setting.default || 0} onChange={(e) => {
                     if (isPreview) return;
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
                  }} readOnly={isPreview} className="w-16 bg-transparent text-[12px] font-black text-[var(--text)] focus:outline-none text-center" />
                  <button type="button" onClick={() => !isPreview && onVisualChange(dataPath, clampNumber((val !== undefined ? parseFloat(val as any) : setting.default || 0) + (setting.step || 1), setting.min, setting.max))} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                     <span className="material-symbols-outlined !text-[16px]">{t("icon_add")}</span>
                  </button>
               </div>
            )}
            {setting.type === "string" && (
               <input type="text" value={val || setting.default || ""} onChange={(e) => !isPreview && onVisualChange(dataPath, e.target.value)} readOnly={isPreview} className={`h-10 theme-glass-inner rounded-xl px-4 text-[11px] font-black text-[var(--text)] focus:outline-none transition-colors w-full ${!isPreview && 'md:max-w-xs'}`} />
            )}
            {setting.type === "dropdown" && (
               <div className={`w-full ${!isPreview && 'md:max-w-xs min-w-[200px]'}`}>
                  <CustomDropdown
                     disableTint={true}
                     value={val !== undefined ? val : setting.default || ""}
                     options={setting.options?.map((opt: any) => ({
                        id: opt.value,
                        label: resolveText(opt.label_key, opt.value)
                     })) || []}
                     onChange={(v: string[]) => !isPreview && onVisualChange(dataPath, v[0])}
                  />
               </div>
            )}
            {setting.type === "keybinding" && (
               <KeybindingField 
                  val={val} 
                  setting={setting} 
                  isPreview={isPreview} 
                  onVisualChange={(newVal: any) => !isPreview && onVisualChange(dataPath, newVal)}
                  t={t}
               />
            )}
         </div>
      </div>
   );
}, (prevProps, nextProps) => {
   return (
      prevProps.setting === nextProps.setting &&
      prevProps.val === nextProps.val &&
      prevProps.isHighlighted === nextProps.isHighlighted &&
      prevProps.isPreview === nextProps.isPreview
   );
});

const KeybindingField = React.memo(({ val, setting, isPreview, onVisualChange, t }: any) => {
   const [isListening, setIsListening] = React.useState(false);

   React.useEffect(() => {
      if (!isListening) return;

      const handleKeyDown = (e: KeyboardEvent) => {
         e.preventDefault();
         e.stopPropagation();

         const format = setting.key_format || 'literal'; // 'literal' or 'keycode'
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
      <div className="flex flex-col gap-2 w-full md:max-w-xs">
         <div className="flex flex-wrap gap-2">
            {vals.map((v: any, idx: number) => (
               <div key={idx} className="flex items-center gap-2 theme-glass-inner rounded-lg px-3 py-1.5 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[12px] font-black text-[var(--text)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.1)]">
                  <span className="tracking-widest">{v}</span>
                  {!isPreview && (
                     <button
                        onClick={() => {
                           if (isMultiple) {
                              onVisualChange(vals.filter((_: any, i: number) => i !== idx));
                           } else {
                              onVisualChange("");
                           }
                        }}
                        className="text-[var(--danger)] hover:text-red-400 opacity-70 hover:opacity-100 transition-opacity flex items-center justify-center"
                     >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_remove") || "close"}</span>
                     </button>
                  )}
               </div>
            ))}
         </div>
         
         {!isPreview && (!vals.length || isMultiple) && (
            <button
               onClick={() => setIsListening(!isListening)}
               className={`h-10 rounded-xl px-4 text-[11px] font-black transition-all duration-300 flex items-center justify-center gap-2 uppercase tracking-widest ${isListening ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[var(--accent)] text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] animate-pulse' : 'theme-glass-inner border border-transparent text-[var(--text)] hover:bg-white/5 hover:border-white/10'}`}
            >
               <span className="material-symbols-outlined !text-[16px]">{isListening ? 'keyboard' : 'add'}</span>
               {isListening ? (t("keybinding_listening") || "PRESS ANY KEY...") : (isMultiple && vals.length ? (t("keybinding_add") || "ADD BINDING") : (t("keybinding_set") || "SET BINDING"))}
            </button>
         )}
      </div>
   );
});

export const WorkbenchVisualEditor: React.FC<WorkbenchVisualEditorProps> = ({
   settings,
   dataSource,
   isPreview = false,
   isNested = false,
   parentPath = "",
   selectedCategory,
   searchQuery,
   onVisualChange,
   highlightedKey
}) => {
   const { t } = useLexicon();

   if (!settings) return null;

   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k);
      if (tr === `[${k}]`) return k;
      return tr;
   };

   let filteredSettings = settings;
   if (selectedCategory !== "ALL" && !isPreview && !isNested) {
      filteredSettings = filteredSettings.filter(s => s.category === selectedCategory);
   }

   if (searchQuery && !isPreview) {
      filteredSettings = filteredSettings.filter(s => {
         const lbl = resolveText(s.label_key, s.key);
         const desc = resolveText(s.desc_key, "");
         return lbl.toLowerCase().includes(searchQuery.toLowerCase()) || desc.toLowerCase().includes(searchQuery.toLowerCase());
      });
   }

   return (
      <>
         {filteredSettings.map((setting, idx) => {
            const localPath = setting.path || setting.key;
            
            if (!localPath) {
               return (
                  <div key={idx} className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-4">
                     <span className="text-red-400 text-xs font-black tracking-widest uppercase">Invalid Setting Object</span>
                     <p className="text-red-400/70 text-[10px] mt-1">A setting must contain at least a "key" or "path" property.</p>
                  </div>
               );
            }

            const dataPath = parentPath && !localPath.startsWith(parentPath + ".") ? `${parentPath}.${localPath}` : localPath;
            const val = dataSource && dataPath ? dataPath.split('.').reduce((o: any, i: string) => o?.[i], dataSource) : undefined;

            if (setting.type === "group") {
               return (
                  <div key={idx} className="flex flex-col gap-4 w-full mt-2 mb-4 bg-black/10 p-4 rounded-2xl border border-white/5" style={{ contentVisibility: 'auto', containIntrinsicSize: '200px' }}>
                     <div className="flex flex-col gap-1 px-2">
                        <span className="text-[12px] font-black uppercase tracking-widest text-[var(--accent)]">{resolveText(setting.label_key, setting.key)}</span>
                        <span className="text-[10px] text-[var(--subtext)] opacity-80 font-medium">{resolveText(setting.desc_key, "")}</span>
                     </div>
                     <div className="flex flex-col gap-4">
                        <WorkbenchVisualEditor
                           settings={setting.settings}
                           dataSource={dataSource}
                           isPreview={isPreview}
                           isNested={true}
                           parentPath={dataPath}
                           selectedCategory={selectedCategory}
                           searchQuery={searchQuery}
                           onVisualChange={onVisualChange}
                           highlightedKey={highlightedKey}
                        />
                     </div>
                  </div>
               );
            }

            const actualHighlightKey = highlightedKey ? highlightedKey.split('::')[0] : null;
            const isHighlighted = actualHighlightKey === dataPath;

            return (
               <SettingNode
                  key={idx}
                  setting={setting}
                  val={val}
                  dataPath={dataPath}
                  isHighlighted={isHighlighted}
                  isPreview={isPreview}
                  onVisualChange={onVisualChange}
                  t={t}
               />
            );
         })}
      </>
   );
};
