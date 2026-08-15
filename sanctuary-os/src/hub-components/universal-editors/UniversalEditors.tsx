import React, { useState } from 'react';
import { useLexicon } from '../../LexiconContext';
import { formatDisplayName, SearchBar, CustomDropdown } from '../../shared';

export const UniversalInjectableSearch = ({
  dataset,
  excludeIds = [],
  searchPlaceholder,
  targets,
  onInject,
  activeGameSchema,
  getModIcon
}: any) => {
  const { t } = useLexicon();
  const [search, setSearch] = useState("");
  const [activeTarget, setActiveTarget] = useState(targets[0]?.id || "inject");

  const filtered = search.length > 0 
    ? dataset.filter((d: any) => 
        !excludeIds.includes(d.hash) && 
        (d.name?.toLowerCase().includes(search.toLowerCase()) || d.displayName?.toLowerCase().includes(search.toLowerCase()))
      ).slice(0, 5)
    : [];

  return (
    <div className="flex flex-col gap-2 relative w-full z-[115005]">
      <div className="flex gap-2 w-full">
        <div className="flex-1">
          <SearchBar 
            value={search} 
            onChange={setSearch} 
            placeholder={searchPlaceholder || t("btn_search")} 
          />
        </div>
        {targets.length > 1 && (
          <div className="w-40 shrink-0">
            <CustomDropdown
               value={activeTarget}
               onChange={(v: any) => setActiveTarget(v[0])}
               options={targets.map((t: any) => ({ id: t.id, label: t.label, icon: 'api' }))}
               disableSearch={true}
            />
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-panel rounded-full shadow-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col w-full bg-black/20 max-h-64 overflow-y-auto custom-scrollbar">
          {filtered.slice(0, 20).map((art: any) => (
            <div 
              key={art.hash}
              onClick={() => {
                onInject(art.hash, activeTarget);
                setSearch("");
              }}
              className="flex items-center gap-4 p-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer transition-colors border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-b-0 group"
            >
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0 shadow-inner overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                {art.image_url || art.imageUrl ? (
                  <img src={art.image_url || art.imageUrl} className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] opacity-70">
                    {getModIcon ? getModIcon(art, activeGameSchema, t) : 'extension'}
                  </span>
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-bold text-[var(--text)] capitalize truncate tracking-wide">
                  {formatDisplayName(art.displayName || art.name)}
                </span>
                {art.author && (
                  <span className="text-[11px] font-mono text-[var(--subtext)] truncate opacity-60">
                    {art.author}
                  </span>
                )}
              </div>
              <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[color-mix(in_srgb,var(--text)_50%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined !text-[18px]">add</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const UniversalBucketEditor = ({
  items,
  dataset,
  onRemove,
  activeGameSchema,
  getModIcon
}: any) => {
  const { t } = useLexicon();
  
  const flatItems: { hash: string, type: string, label: string, colorVar: string }[] = [];
  
  if (items.core) flatItems.push({ hash: items.core, type: 'core', label: t('editor_core'), colorVar: '--subtext' });
  (items.twins || []).forEach((h: string) => flatItems.push({ hash: h, type: 'twins', label: t('editor_twin'), colorVar: '--success' }));
  (items.addons || []).forEach((h: string) => flatItems.push({ hash: h, type: 'addons', label: t('editor_addon'), colorVar: '--warning' }));

  return (
  <div className="glass-panel rounded-full flex flex-col w-full shadow-lg border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-black/10">
      {flatItems.map((item) => {
        const art = dataset.find((m: any) => m.hash === item.hash) || { name: item.hash, hash: item.hash };
        
        return (
          <div 
            key={item.hash}
            className="flex items-center gap-4 p-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-pointer border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-b-0 group"
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0 shadow-inner overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              {art.image_url || art.imageUrl ? (
                <img src={art.image_url || art.imageUrl} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] opacity-70">
                  {getModIcon ? getModIcon(art, activeGameSchema, t) : 'extension'}
                </span>
              )}
            </div>

            {/* Title & Author */}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[13px] font-bold text-[var(--text)] capitalize truncate tracking-wide">
                {formatDisplayName(art.displayName || art.name)}
              </span>
              {art.author && (
                <span className="text-[11px] font-mono text-[var(--subtext)] truncate opacity-60">
                  {art.author}
                </span>
              )}
            </div>

            {/* Badge */}
            <div className="shrink-0 flex items-center">
              <span 
                className="text-[9px] font-black capitalize px-2.5 py-1 rounded-full border tracking-widest"
                style={{ color: `var(${item.colorVar})`, backgroundColor: `color-mix(in srgb, var(${item.colorVar}) 10%, transparent)`, borderColor: `color-mix(in srgb, var(${item.colorVar}) 20%, transparent)` }}
              >
                {item.label}
              </span>
            </div>

            {/* Remove Button */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(item.hash, item.type); }}
              className="w-8 h-8 rounded-full text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 ml-1 shrink-0"
            >
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const UniversalListEditor = ({
  items,
  dataset,
  onRemove,
  activeGameSchema,
  getModIcon
}: any) => {
  const { t } = useLexicon();

  return (
  <div className="glass-panel rounded-full flex flex-col w-full shadow-lg border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-black/10">
      {items.map((hash: string) => {
        const art = dataset.find((d: any) => d.hash === hash);
        if (!art) return null;
        return (
          <div 
            key={hash}
            className="flex items-center gap-4 p-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-pointer border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-b-0 group"
          >
            <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0 shadow-inner overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              {art.image_url || art.imageUrl ? (
                <img src={art.image_url || art.imageUrl} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] opacity-70">
                  {getModIcon ? getModIcon(art, activeGameSchema, t) : 'extension'}
                </span>
              )}
            </div>
            
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[13px] font-bold text-[var(--text)] capitalize truncate tracking-wide">
                {formatDisplayName(art.displayName || art.name)}
              </span>
              {art.author && (
                <span className="text-[11px] font-mono text-[var(--subtext)] truncate opacity-60">
                  {art.author}
                </span>
              )}
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); onRemove(hash); }}
              className="w-8 h-8 rounded-full text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 ml-1 shrink-0"
            >
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const UniversalListPicker = ({
  items,
  onSelect,
  emptyStateTitle,
  emptyStateIcon
}: any) => {
  if (!items || items.length === 0) {
    return (
      <div className="w-full h-32 flex flex-col items-center justify-center text-[var(--subtext)] opacity-50 border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full glass-panel">
        <span className="material-symbols-outlined mb-2 opacity-50">{emptyStateIcon || 'inventory_2'}</span>
        <span className="text-[10px] font-black capitalize tracking-widest">{emptyStateTitle || "EMPTY"}</span>
      </div>
    );
  }

  return (
  <div className="glass-panel rounded-full flex flex-col w-full shadow-lg border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-black/10">
      {items.map((item: any) => (
        <div 
          key={item.id}
          onClick={() => onSelect(item.id, item.originalItem || item)}
          className="flex items-center gap-4 p-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-pointer border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-b-0 group"
        >
          <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0 shadow-inner overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            {item.imageUrl ? (
              <img src={item.imageUrl} className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] opacity-70">
                {item.icon || 'extension'}
              </span>
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center justify-start gap-2">
              <span className="text-[13px] font-bold text-[var(--text)] capitalize truncate tracking-wide">
                {item.title}
              </span>
              {item.topRightBadge && (
                <span className="text-[9px] font-black text-[var(--accent)] capitalize px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] truncate max-w-[120px]">
                  {item.topRightBadge}
                </span>
              )}
            </div>
            
            {item.metaTags && item.metaTags.length > 0 && (
              <div className="flex items-center gap-3 mt-1">
                {item.metaTags.map((tag: any, i: number) => (
                  <div key={i} className="flex items-center gap-1 text-[var(--subtext)] opacity-80" title={tag.label}>
                    <span className="material-symbols-outlined !text-[12px]">{tag.icon}</span>
                    <span className="text-[9px] font-bold capitalize truncate max-w-[100px]">{tag.value}</span>
                  </div>
                ))}
              </div>
            )}
            
            {item.subtitle && (
              <span className="text-[11px] font-mono text-[var(--subtext)] truncate opacity-60 mt-1">
                {item.subtitle}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export const UniversalGridPicker = ({
  items,
  selectedId,
  onSelect,
  emptyStateTitle,
  emptyStateIcon
}: any) => {
  if (!items || items.length === 0) {
    return (
      <div className="w-full h-32 flex flex-col items-center justify-center text-[var(--subtext)] opacity-50 border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full glass-panel col-span-full">
        <span className="material-symbols-outlined mb-2 opacity-50">{emptyStateIcon || 'inventory_2'}</span>
        <span className="text-[10px] font-black capitalize tracking-widest">{emptyStateTitle || "EMPTY"}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
      {items.map((item: any) => {
        const isSelected = selectedId === item.id;
        return (
          <div 
            key={item.id} 
            onClick={() => onSelect(item.id, item.originalItem || item)}
            className={`glass-panel border transition-all duration-300 rounded-full p-4 flex flex-col cursor-pointer group
              ${isSelected 
                ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]' 
                : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}
          >
            <div className="w-full aspect-square rounded-xl bg-black/20 flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden mb-3">
              {item.imageUrl ? (
                <img src={item.imageUrl} className="w-full h-full object-cover" />
              ) : (
                <span className={`material-symbols-outlined transition-colors duration-300 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--accent)] opacity-70 group-hover:opacity-100'}`}>
                  {item.icon || 'extension'}
                </span>
              )}
            </div>
            
            <span className={`text-[11px] font-black capitalize truncate tracking-wider mb-1 transition-colors duration-300 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
              {item.title}
            </span>
            
            {item.subtitle && (
              <span className="text-[9px] font-bold text-[var(--subtext)] truncate opacity-60">
                {item.subtitle}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};


