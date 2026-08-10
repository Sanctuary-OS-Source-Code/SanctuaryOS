import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { logArchitectAction } from "./lib/audit";
import { useLexicon } from "./LexiconContext";
import { SidePanel, CustomDropdown, FilterTabs, FilterTabButton, ModSearchDropdown, EmptyState, ActionButton, cleanSearchName, SearchBar, HoverTooltip } from "./shared";
import ModLineageTree from "./ModLineageTree";
import { useStore } from './store';

const fetchAllPaginated = async (queryFn: () => any) => {
  let allData: any[] = [];
  let from = 0;
  const step = 999;
  while (true) {
    const { data, error } = await queryFn().range(from, from + step);
    if (error || !data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length <= step) break;
    from += step + 1;
  }
  return { data: allData, error: null };
};


function ServerModSearchDropdown({ onSelect, selectedItem, placeholder, masonId, isArchitect, onClear, className }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) { setResults([]); return; }
      let q = supabase.from('mods').select('id, name, master_author, latest_version, sub_type, file_extension, requiredDLC').ilike('name', `%${query}%`).limit(10);
      if (!isArchitect && masonId) q = q.eq('mason_id', masonId);
      const { data } = await q;
      if (data) setResults(data);
    };
    const timeoutId = setTimeout(fetchResults, 300);
    return () => clearTimeout(timeoutId);
  }, [query, masonId, isArchitect]);

  return (
    <div className="relative w-full">
      <div className="relative z-[10]">
        <input
          ref={inputRef}
          type="text"
          value={selectedItem ? (selectedItem.displayName || selectedItem.name || selectedItem.id) : query}
          onChange={(e) => { if (!selectedItem) setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => { if (!selectedItem) setIsOpen(true); }}
          placeholder={placeholder}
          readOnly={!!selectedItem}
          className={className || "w-full h-12 glass-surface rounded-[calc(var(--radius)-4px)] px-5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all relative"}
        />
        {selectedItem ? (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold flex items-center justify-center" onClick={onClear}>
            <span className="material-symbols-outlined !text-[18px]">{t("icon_close") || "close"}</span>
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
              <div className="fixed glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-2xl overflow-hidden z-[200001] max-h-60 overflow-y-auto custom-scrollbar flex flex-col" style={{
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
                      {(m.file_extension || m.sub_type) && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--text)]/10 text-[8px] font-mono opacity-80 uppercase border border-[var(--text)]/20">
                          {(m.file_extension || m.sub_type).replace(".", "")}
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] font-mono text-[var(--subtext)] opacity-60">
                      {m.version_label ? `Version(s): ${m.version_label}` : (m.master_author || m.author || (m.created_at ? `Created: ${new Date(m.created_at).toLocaleDateString()}` : `ID: ${m.id?.substring(0, 8).toUpperCase()}`))}
                    </span>
                  </button>
                ))}
                {results.length === 0 && <div className="p-5 text-center text-[10px] text-[var(--subtext)] font-bold uppercase">{query ? (t("link_no_results") || "No results found") : "Type to search Supabase..."}</div>}
              </div>
            </>
          );
        })(),
        document.body
      )}
    </div>
  );
}
const getDlcAbbreviation = (type: string) => {
  if (!type) return '';
  const t = type.toLowerCase();
  if (t.includes('expansion')) return 'EP';
  if (t.includes('game')) return 'GP';
  if (t.includes('stuff')) return 'SP';
  if (t.includes('kit')) return 'KIT';
  return type;
};

export default function ProtocolVisualizer({ masonId, isArchitect }: { masonId?: string, isArchitect?: boolean }) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [targetMod, setTargetMod] = useState<any | null>(null);
  const [targetVersions, setTargetVersions] = useState<any[]>([]);

  const [twinsAndAddons, setTwinsAndAddons] = useState<any[]>([]);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [communityMods, setCommunityMods] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);

  const [allFlavorGroups, setAllFlavorGroups] = useState<any[]>([]);
  const [activeFlavorGroup, setActiveFlavorGroup] = useState<any | null>(null);
  const [allCommunityGroups, setAllCommunityGroups] = useState<any[]>([]);
  const [activeCommunityGroup, setActiveCommunityGroup] = useState<any | null>(null);

  const [activePanel, setActivePanel] = useState<'lineage' | 'twins' | 'flavors' | 'community' | 'dependencies' | 'dlc' | null>(null);
  const [availableSearch, setAvailableSearch] = useState("");

  const [allModsForDependencies, setAllModsForDependencies] = useState<any[]>([]);
  const [showFlavorGroupModal, setShowFlavorGroupModal] = useState(false);
  const [newFlavorGroupName, setNewFlavorGroupName] = useState('');
  const [showCommunityGroupModal, setShowCommunityGroupModal] = useState(false);
  const [newCommunityGroupName, setNewCommunityGroupName] = useState('');
  const [dlcRegistry, setDlcRegistry] = useState<any[]>([]);
  const [dlcSearch, setDlcSearch] = useState("");
  const [dlcTab, setDlcTab] = useState('Expansion Pack');
  const [leftTab, setLeftTab] = useState('All');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');

  const fetchData = async () => {
    let modsQuery = supabase.from('mods').select('*');
    if (!isArchitect && masonId) modsQuery = modsQuery.eq('mason_id', masonId);



    const { data: groups } = await supabase.from('flavor_groups').select('*').order('name');
    if (groups) setAllFlavorGroups(groups);

    const { data: cGroups } = await supabase.from('community_groups').select('*').order('name');
    if (cGroups) setAllCommunityGroups(cGroups);

    const { data: dlcData } = await supabase.from('dlc_registry').select('*');
    if (dlcData) setDlcRegistry(dlcData);
  };

  useEffect(() => {
    fetchData();
  }, [isArchitect]);

  const loadLinks = async () => {
    if (!targetMod) {
      setTwinsAndAddons([]);
      setAlternatives([]);
      setDependencies([]);
      setCommunityMods([]);
      setActiveFlavorGroup(null);
      setActiveCommunityGroup(null);
      setTargetVersions([]);
      return;
    }

    const { data: rels } = await fetchAllPaginated(() => supabase.from('mod_relationships').select('*').or(`parent_id.eq.${targetMod.id},child_id.eq.${targetMod.id}`));
    const { data: deps } = await fetchAllPaginated(() => supabase.from('mod_dependencies').select('*').eq('child_id', targetMod.id));

    let flavorModIds: string[] = [];
    let communityModIds: string[] = [];

    const { data: versions } = await supabase.from('mod_versions').select('*').eq('mod_id', targetMod.id).order('version_label');
    if (versions) {
      setTargetVersions(versions);
      if (versions.length > 0) {
        const hashes = versions.map((v: any) => v.dna_hash);

        // FLAVORS
        const { data: fgm } = await supabase.from('flavor_group_members').select('group_id').in('mod_hash', hashes);
        if (fgm && fgm.length > 0) {
          const groupId = fgm[0].group_id;
          const grp = allFlavorGroups.find(g => g.id === groupId);
          setActiveFlavorGroup(grp || null);

          // Get all mods in this flavor group
          const { data: allFgm } = await supabase.from('flavor_group_members').select('mod_hash').eq('group_id', groupId);
          if (allFgm && allFgm.length > 0) {
            const allHashes = allFgm.map(m => m.mod_hash);
            const { data: allVersions } = await supabase.from('mod_versions').select('mod_id').in('dna_hash', allHashes);
            if (allVersions) {
              flavorModIds = allVersions.map(v => v.mod_id).filter(id => id !== targetMod.id);
            }
          }
        } else {
          setActiveFlavorGroup(null);
        }

        // COMMUNITY
        const { data: cgm } = await supabase.from('community_group_members').select('group_id').in('mod_hash', hashes);
        if (cgm && cgm.length > 0) {
          const groupId = cgm[0].group_id;
          const cGrp = allCommunityGroups.find(g => g.id === groupId);
          setActiveCommunityGroup(cGrp || null);

          // Get all mods in this community group
          const { data: allCgm } = await supabase.from('community_group_members').select('mod_hash').eq('group_id', groupId);
          if (allCgm && allCgm.length > 0) {
            const allHashes = allCgm.map(m => m.mod_hash);
            const { data: allVersions } = await supabase.from('mod_versions').select('mod_id').in('dna_hash', allHashes);
            if (allVersions) {
              communityModIds = allVersions.map(v => v.mod_id).filter(id => id !== targetMod.id);
            }
          }
        } else {
          setActiveCommunityGroup(null);
        }
      } else {
        setActiveFlavorGroup(null);
        setActiveCommunityGroup(null);
      }
    } else {
      setTargetVersions([]);
      setActiveFlavorGroup(null);
      setActiveCommunityGroup(null);
    }

    if (!rels && !deps && flavorModIds.length === 0 && communityModIds.length === 0) return;

    const twinIds = rels?.filter((r: any) => r.relationship_type === 'twin' || r.relationship_type === 'addon').map((r: any) => r.parent_id === targetMod.id ? r.child_id : r.parent_id) || [];
    const altIds = [...(rels?.filter((r: any) => r.relationship_type === 'flavor' || r.relationship_type === 'beta').map((r: any) => r.child_id) || []), ...flavorModIds];
    const depIds = deps?.map((d: any) => d.parent_id) || [];

    const resolveMods = async (ids: string[], relsSource?: any[], overrideType?: string) => {
      // Deduplicate IDs
      ids = Array.from(new Set(ids));
      let finalMods = cloudMods.filter(m => ids.includes(m.id));
      const missingIds = ids.filter(id => !finalMods.find(m => m.id === id));
      if (missingIds.length > 0) {
        const { data: missingMods } = await supabase.from('mods').select('*').in('id', missingIds);
        if (missingMods) finalMods = [...finalMods, ...missingMods];
      }
      return finalMods.map(m => {
        if (overrideType) {
          return { ...m, _rel_type: overrideType };
        }
        if (relsSource) {
          const rel = relsSource.find(r => r.parent_id === m.id || r.child_id === m.id);
          return rel ? { ...m, _rel_type: rel.relationship_type } : m;
        }
        return m;
      });
    };

    setTwinsAndAddons(await resolveMods(twinIds, rels));
    
    const resolvedAlts = await resolveMods(altIds, rels);
    setAlternatives(resolvedAlts.map((a: any) => ({ ...a, _rel_type: a._rel_type || 'flavor' })));

    setCommunityMods(await resolveMods(communityModIds, undefined, 'community'));
    setDependencies(await resolveMods(depIds, deps));
  };

  useEffect(() => {
    loadLinks();
  }, [targetMod]);

  const handleAddLink = async (targetId: string, relType: string) => {
    if (!targetMod) return;

    if (relType === 'dependency') {
      const { error } = await supabase.from('mod_dependencies').insert({ parent_id: targetId, child_id: targetMod.id });
      if (error) useStore.getState().pushStatus(`Failed to add dependency: ${error.message}`);
    } else if (relType === 'flavor') {
      let groupId = activeFlavorGroup?.id;
      if (!groupId) {
        // Create a new flavor group for the active mod
        const { data: newG, error: gErr } = await supabase.from('flavor_groups').insert({ name: targetMod.name || "Variant Group" }).select().single();
        if (gErr) {
          useStore.getState().pushStatus(`Failed to create variant group: ${gErr.message}`);
          return;
        }
        groupId = newG.id;

        // Join targetMod itself
        const { data: activeVersions } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', targetMod.id);
        if (activeVersions) {
          for (const v of activeVersions) {
            const { data: existing } = await supabase.from('flavor_group_members').select('*').eq('group_id', groupId).eq('mod_hash', v.dna_hash);
            if (!existing || existing.length === 0) {
              await supabase.from('flavor_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
            }
          }
        }
      }

      // Now join the right-side targetId mod to this flavor group
      const { data: targetVersions } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', targetId);
      if (targetVersions) {
        for (const v of targetVersions) {
          const { data: existing } = await supabase.from('flavor_group_members').select('*').eq('group_id', groupId).eq('mod_hash', v.dna_hash);
          if (!existing || existing.length === 0) {
            await supabase.from('flavor_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
          }
        }
      }
    } else if (relType === 'community') {
      if (!activeCommunityGroup) {
        useStore.getState().pushStatus('Please select or create a Global Class first!');
        return;
      }
      const groupId = activeCommunityGroup.id;
      // Join targetMod itself
      const { data: activeVersions } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', targetMod.id);
      if (activeVersions) {
        for (const v of activeVersions) {
          const { data: existing } = await supabase.from('community_group_members').select('*').eq('group_id', groupId).eq('mod_hash', v.dna_hash);
          if (!existing || existing.length === 0) {
            await supabase.from('community_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
          }
        }
      }
      // Join right-side targetId mod
      const { data: targetVersions } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', targetId);
      if (targetVersions) {
        for (const v of targetVersions) {
          const { data: existing } = await supabase.from('community_group_members').select('*').eq('group_id', groupId).eq('mod_hash', v.dna_hash);
          if (!existing || existing.length === 0) {
            await supabase.from('community_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
          }
        }
      }
    } else {
      const { error } = await supabase.from('mod_relationships').insert({ parent_id: targetMod.id, child_id: targetId, relationship_type: relType });
      if (error) useStore.getState().pushStatus(`Failed to add link: ${error.message}`);
    }
    await loadLinks();
  };

  const handleRemoveLink = async (targetId: string, relType: string) => {
    if (!targetMod) return;

    if (relType === 'dependency') {
      await supabase.from('mod_dependencies').delete().match({ parent_id: targetId, child_id: targetMod.id });
    } else if (relType === 'flavor' && activeFlavorGroup) {
      const { data: targetVersions } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', targetId);
      if (targetVersions) {
        const hashes = targetVersions.map(v => v.dna_hash);
        await supabase.from('flavor_group_members').delete().eq('group_id', activeFlavorGroup.id).in('mod_hash', hashes);
      }
    } else if (relType === 'community' && activeCommunityGroup) {
      const { data: targetVersions } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', targetId);
      if (targetVersions) {
        const hashes = targetVersions.map(v => v.dna_hash);
        await supabase.from('community_group_members').delete().eq('group_id', activeCommunityGroup.id).in('mod_hash', hashes);
      }
    } else {
      await supabase.from('mod_relationships').delete().in('parent_id', [targetMod.id, targetId]).in('child_id', [targetMod.id, targetId]).in('relationship_type', ['twin', 'addon', 'flavor', 'beta']);
    }
    await loadLinks();
  };

  const handleRenameGroup = async (groupId: string, type: 'flavor' | 'community') => {
    if (!editGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    const table = type === 'flavor' ? 'flavor_groups' : 'community_groups';
    const { error } = await supabase.from(table).update({ name: editGroupName.trim() }).eq('id', groupId);
    if (error) {
      useStore.getState().pushStatus(`Failed to rename group: ${error.message}`);
      return;
    }
    setEditingGroupId(null);
    await fetchData();
    if (type === 'flavor' && activeFlavorGroup?.id === groupId) setActiveFlavorGroup({ ...activeFlavorGroup, name: editGroupName.trim() });
    if (type === 'community' && activeCommunityGroup?.id === groupId) setActiveCommunityGroup({ ...activeCommunityGroup, name: editGroupName.trim() });
  };

  const handleLeaveFlavorGroup = async () => {
    if (!targetMod || !activeFlavorGroup) return;
    const { data: versions } = await supabase.from('mod_versions').select("dna_hash").eq('mod_id', targetMod.id);
    if (versions) {
      const hashes = versions.map(v => v.dna_hash);
      await supabase.from('flavor_group_members').delete().eq('group_id', activeFlavorGroup.id).in('mod_hash', hashes);
    }
    await loadLinks();
  };

  const handleLeaveCommunityGroup = async () => {
    if (!targetMod || !activeCommunityGroup) return;
    const { data: versions } = await supabase.from('mod_versions').select("dna_hash").eq('mod_id', targetMod.id);
    if (versions) {
      const hashes = versions.map(v => v.dna_hash);
      await supabase.from('community_group_members').delete().eq('group_id', activeCommunityGroup.id).in('mod_hash', hashes);
    }
    await loadLinks();
  };

  const handleJoinFlavorGroup = async (groupId: string) => {
    if (!targetMod) return;
    const { data: versions } = await supabase.from('mod_versions').select("dna_hash").eq('mod_id', targetMod.id);
    if (!versions || versions.length === 0) return useStore.getState().pushStatus(t("auto_artifact_has_no_45"));

    for (const v of versions) {
      const { data: existing } = await supabase.from('flavor_group_members').select('*').eq('group_id', groupId).eq('mod_hash', v.dna_hash);
      if (!existing || existing.length === 0) {
        await supabase.from('flavor_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
      }
    }
    await loadLinks();
  };

  const handleCreateFlavorGroup = async () => {
    if (!newFlavorGroupName.trim()) return;

    const { data, error } = await supabase.from('flavor_groups').insert({ name: newFlavorGroupName.trim() }).select().single();

    if (error) {
      useStore.getState().pushStatus(`Failed to create flavor group: ${error.message}`);
      return;
    }

    if (data) {
      setAllFlavorGroups([...allFlavorGroups, data]);
      setShowFlavorGroupModal(false);
      setNewFlavorGroupName('');
      handleJoinFlavorGroup(data.id);

    }
  };

  const handleJoinCommunityGroup = async (groupId: string) => {
    if (!targetMod) return;
    const { data: versions } = await supabase.from('mod_versions').select("dna_hash").eq('mod_id', targetMod.id);
    if (!versions || versions.length === 0) return useStore.getState().pushStatus(t("auto_artifact_has_no_45"));

    for (const v of versions) {
      const { data: existing } = await supabase.from('community_group_members').select('*').eq('group_id', groupId).eq('mod_hash', v.dna_hash);
      if (!existing || existing.length === 0) {
        await supabase.from('community_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
      }
    }
    await loadLinks();
  };

  const handleCreateCommunityGroup = async () => {
    if (!newCommunityGroupName.trim()) return;

    const { data, error } = await supabase.from('community_groups').insert({ name: newCommunityGroupName.trim() }).select().single();

    if (error) {
      useStore.getState().pushStatus(`Failed to create community group: ${error.message}`);
      return;
    }

    if (data) {
      setAllCommunityGroups([...allCommunityGroups, data]);
      setShowCommunityGroupModal(false);
      setNewCommunityGroupName('');
      handleJoinCommunityGroup(data.id);
    }
  };

  const parseDLC = (val: any): string[] => {
    if (!val) return [];

    // Helper to extract clean strings
    const extract = (v: string): string[] => {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed;
        return [v];
      } catch {
        return v.replace(/[\{\}\[\]]/g, '').split(',').map((s: string) => s.replace(/^"/, '').replace(/"$/, '').trim()).filter(Boolean);
      }
    };

    if (Array.isArray(val)) {
      // Flatten in case we have ['["EP01"]']
      return val.flatMap(item => typeof item === 'string' ? extract(item) : item);
    }

    if (typeof val === 'string') {
      return extract(val);
    }
    return [];
  };

  const handleToggleDLC = async (dlcId: string, isActive: boolean) => {
    if (!targetMod) return;
    const current = parseDLC(targetMod.requiredDLC);
    const newReqs = isActive ? current.filter(c => c !== dlcId) : [...current, dlcId];

    const { error } = await supabase.from('mods').update({ requiredDLC: newReqs.join(',') }).eq('id', targetMod.id);
    if (error) {
      console.error('Failed to update DLC:', error);
      useStore.getState().pushStatus(`Failed to update DLC: ${error.message}`);
      return;
    }
    if (isArchitect) logArchitectAction(`Updated DLC Protocols`, `mods`, targetMod.name);
    setTargetMod({ ...targetMod, requiredDLC: newReqs });
  };

  const [availableMods, setAvailableMods] = useState<any[]>([]);
  const [availablePage, setAvailablePage] = useState(0);
  const [hasMoreAvailable, setHasMoreAvailable] = useState(true);
  const [isFetchingAvailable, setIsFetchingAvailable] = useState(false);

  useEffect(() => {
    const fetchAvailable = async () => {
      if (!activePanel && activePanel !== 'dependencies') return;
      if (activePanel === 'dlc') return;
      setIsFetchingAvailable(true);

      let q = supabase.from('mods').select('id, name, master_author, latest_version, sub_type, image_url, file_extension').neq('id', targetMod?.id || '00000000-0000-0000-0000-000000000000');
      if (!isArchitect && masonId && activePanel !== 'dependencies') {
        q = q.eq('mason_id', masonId);
      }
      if (availableSearch) {
        q = q.ilike('name', `%${availableSearch}%`);
      }

      const pageSize = 20;
      const from = availablePage * pageSize;
      q = q.range(from, from + pageSize - 1).order('name');

      const { data, error } = await q;
      if (error) console.error("SUPABASE BATCH ERROR:", error);
      if (data) {
        const filtered = data.filter((m: any) => {
          const isTwin = twinsAndAddons.find(t => t.id === m.id);
          const isAlt = alternatives.find(a => a.id === m.id);
          const isDep = dependencies.find(d => d.id === m.id);
          return !isTwin && !isAlt && !isDep;
        });
        if (availablePage === 0) setAvailableMods(filtered);
        else setAvailableMods(prev => {
          const newItems = filtered.filter(f => !prev.find(p => p.id === f.id));
          return [...prev, ...newItems];
        });
        setHasMoreAvailable(data.length === pageSize);
      } else {
        setHasMoreAvailable(false);
      }
      setIsFetchingAvailable(false);
    };

    const timeoutId = setTimeout(fetchAvailable, availableSearch ? 300 : 0);
    return () => clearTimeout(timeoutId);
  }, [availableSearch, activePanel, availablePage, targetMod, twinsAndAddons, alternatives, dependencies, masonId, isArchitect]);

  useEffect(() => {
    setAvailablePage(0);
    setLeftTab('All');
  }, [availableSearch, activePanel, targetMod]);

  const renderTriggerBox = (icon: string, title: string, desc: string, count: number, panelType: 'lineage' | 'twins' | 'flavors' | 'community' | 'dependencies' | 'dlc') => (
    <button
      onClick={async () => {

        setActivePanel(panelType);
      }}
      className="group glass-panel rounded-3xl p-8 shadow-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/[5%] transition-all text-left flex flex-col justify-start h-56 relative overflow-hidden hover:scale-[1.02] active:scale-[0.98]"
    >
      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[var(--accent)] opacity-[0.05] group-hover:opacity-[0.15] transition-opacity pointer-events-none rounded-full blur-2xl group-hover:scale-150 duration-700" />

      <div className="flex justify-start items-start w-full relative z-10">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[var(--text)]/5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:bg-[var(--accent)]/20 group-hover:border-[var(--accent)]/50 transition-all shadow-inner">
          <span className="material-symbols-outlined !text-[28px] text-[var(--text)] group-hover:text-[var(--accent)] transition-colors drop-shadow-md">{icon}</span>
        </div>
        <div className="px-4 py-1.5 rounded-full bg-[var(--text)]/5 text-[11px] font-black uppercase tracking-widest text-[var(--subtext)] group-hover:bg-[var(--accent)]/20 group-hover:text-[var(--accent)] transition-colors border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group-hover:border-[var(--accent)]/30 shadow-sm">
          {count} {t("items") || "ITEMS"}
        </div>
      </div>

      <div className="flex flex-col gap-2 relative z-10 mt-auto">
        <h3 className="text-lg font-black uppercase tracking-[0.1em] text-[var(--text)]">{title}</h3>
        <p className="text-[11px] font-bold text-[var(--subtext)] opacity-70 uppercase tracking-widest leading-relaxed line-clamp-2">{desc}</p>
      </div>
    </button>
  );
  const renderDualSection = (icon: string, title: string, desc: string, activeItems: any[], availableItems: any[], type: string) => {
    const activeFiltered = activeItems.filter(m => {
      if (leftTab !== 'All' && m._rel_type !== leftTab) return false;
      if (type === 'dlc' && dlcSearch) return m.name?.toLowerCase().includes(dlcSearch.toLowerCase());
      if (type !== 'dlc' && availableSearch) return m.name?.toLowerCase().includes(availableSearch.toLowerCase());
      return true;
    });

    return (
      <div className="absolute inset-0 flex flex-col xl:flex-row bg-transparent p-6 xl:p-8 gap-6 xl:gap-8 isolate">

        {/* Left Side: The Master Hero Card */}
        <div className="w-full xl:w-[380px] shrink-0 flex flex-col relative z-10 h-full">
          <div className="w-full h-full glass-panel rounded-[32px] p-6 border border-[var(--accent)]/[20%] shadow-md backdrop-blur-3xl [transform:translateZ(0)] [backface-visibility:hidden]">

            {/* Hero Background Effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)]/10 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[var(--text)]/5 rounded-full blur-[60px] pointer-events-none translate-y-1/3 -translate-x-1/3" />

            {/* Hero Header is removed as it's redundant with the Panel Title */}

            <div className="flex items-center justify-start pb-4 mb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 mt-2 h-14">
              <h3 className="text-[14px] font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">check_circle</span>
                {t("assigned_artifacts") || "ACTIVE PROTOCOLS"}
              </h3>
              <span className="px-3 py-1 rounded-md bg-[var(--accent)]/[10%] border border-[var(--accent)]/[20%] text-[10px] font-black text-[var(--accent)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]">{activeFiltered.length}</span>
            </div>

            {/* Filter Tabs for Left Pane */}
            {(type === 'twins' || type === 'flavors') && (
              <FilterTabs className="w-full mb-4">
                {[
                  { id: 'All', label: 'All' },
                  ...(type === 'twins' ? [
                    { id: 'twin', label: t('link_twin') || 'Twins' },
                    { id: 'addon', label: t('link_addon') || 'Addons' }
                  ] : []),
                  ...(type === 'flavors' ? [
                    { id: 'flavor', label: t('link_flavor') || 'Flavors' },
                    { id: 'beta', label: t('link_beta') || 'Betas' }
                  ] : [])
                ].map(tab => (
                  <FilterTabButton key={tab.id} id={tab.id} label={tab.label} activeTab={leftTab} setTab={setLeftTab} />
                ))}
              </FilterTabs>
            )}

            {type === 'flavors' && (
              <div className="mb-4 relative z-10">
                {activeFlavorGroup ? (
                  <div className="flex items-center gap-4 bg-[var(--accent)]/[10%] border border-[var(--accent)]/[30%] px-4 py-3 rounded-xl w-full justify-start shadow-inner">
                    <div className="flex items-center gap-3 w-full max-w-[200px]">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">{t("icon_hub")}</span>
                      {editingGroupId === activeFlavorGroup.id ? (
                        <input
                          type="text"
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameGroup(activeFlavorGroup.id, 'flavor'); if (e.key === 'Escape') setEditingGroupId(null); }}
                          onBlur={() => handleRenameGroup(activeFlavorGroup.id, 'flavor')}
                          autoFocus
                          className="bg-transparent border-b border-[var(--accent)] text-[var(--accent)] text-[12px] font-black uppercase tracking-wider px-1 py-0 w-full focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingGroupId(activeFlavorGroup.id); setEditGroupName(activeFlavorGroup.name); }}
                          className="text-[12px] font-black uppercase text-[var(--text)] tracking-wider truncate cursor-text hover:text-[var(--accent)] transition-colors"
                          title="Click to rename"
                        >
                          {activeFlavorGroup.name}
                        </span>
                      )}
                    </div>
                    <button onClick={handleLeaveFlavorGroup} className="w-8 h-8 flex items-center justify-center text-[var(--danger)] hover:bg-red-500/[20%] rounded-lg transition-all relative group/btn">
                      <span className="material-symbols-outlined !text-[18px]">{t("icon_link_off")}</span>
                      <HoverTooltip title={t("nav_leave_group") || "Leave Group"} variant="danger" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-3 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <span className="text-[11px] font-black uppercase text-[var(--text)] tracking-wider opacity-60">{t("no_variant_group")}</span>
                  </div>
                )}
              </div>
            )}

            {type === 'community' && (
              <div className="mb-4 relative z-10">
                {activeCommunityGroup ? (
                  <div className="flex items-center gap-4 bg-[var(--accent)]/[10%] border border-[var(--accent)]/[30%] px-4 py-3 rounded-xl w-full justify-start shadow-inner">
                    <div className="flex items-center gap-3 w-full max-w-[200px]">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">{t("icon_community_groups") || "category"}</span>
                      {editingGroupId === activeCommunityGroup.id ? (
                        <input
                          type="text"
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameGroup(activeCommunityGroup.id, 'community'); if (e.key === 'Escape') setEditingGroupId(null); }}
                          onBlur={() => handleRenameGroup(activeCommunityGroup.id, 'community')}
                          autoFocus
                          className="bg-transparent border-b border-[var(--accent)] text-[var(--accent)] text-[12px] font-black uppercase tracking-wider px-1 py-0 w-full focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingGroupId(activeCommunityGroup.id); setEditGroupName(activeCommunityGroup.name); }}
                          className="text-[12px] font-black uppercase text-[var(--text)] tracking-wider truncate cursor-text hover:text-[var(--accent)] transition-colors"
                          title="Click to rename"
                        >
                          {activeCommunityGroup.name}
                        </span>
                      )}
                    </div>
                    <button onClick={handleLeaveCommunityGroup} className="w-8 h-8 flex items-center justify-center text-[var(--danger)] hover:bg-red-500/[20%] rounded-lg transition-all relative group/btn">
                      <span className="material-symbols-outlined !text-[18px]">{t("icon_link_off")}</span>
                      <HoverTooltip title={t("nav_leave_group") || "Leave Group"} variant="danger" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 w-full">
                    {showCommunityGroupModal ? (
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <input
                          type="text"
                          value={newCommunityGroupName}
                          onChange={(e) => setNewCommunityGroupName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCommunityGroup(); if (e.key === 'Escape') { setShowCommunityGroupModal(false); setNewCommunityGroupName(''); } }}
                          placeholder={t("modal_community_group_name_placeholder") || "Name..."}
                          autoFocus
                          className="flex-1 min-w-0 bg-transparent border-b border-[var(--accent)] text-[var(--accent)] text-[12px] font-black uppercase tracking-wider px-1 py-1 focus:outline-none placeholder:text-[var(--text)]/30 placeholder:tracking-widest"
                        />
                        <button
                          onClick={handleCreateCommunityGroup}
                          disabled={!newCommunityGroupName.trim()}
                          className="px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent)]/[15%] hover:border-[var(--accent)]/[50%] hover:text-[var(--accent)] hover:shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.2)] transition-all shrink-0 disabled:opacity-50"
                        >
                          {t("nav_save") || "Save"}
                        </button>
                        <button
                          onClick={() => { setShowCommunityGroupModal(false); setNewCommunityGroupName(''); }}
                          className="px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-widest hover:bg-red-500/[15%] hover:border-red-500/[50%] hover:text-[var(--danger)] hover:shadow-[inset_0_0_15px_rgba(var(--danger-rgb),0.2)] transition-all shrink-0"
                        >
                          {t("nav_cancel") || "Cancel"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <CustomDropdown disableTint={true}
                            searchable={true}
                            value=""
                            options={allCommunityGroups.map(g => ({ label: g.name, value: g.id }))}
                            onChange={(val: string) => { if (val) handleJoinCommunityGroup(val); }}
                            placeholder={t("community_groups_select") || "Select a Community Group..."}
                          />
                        </div>
                        <button
                          onClick={() => setShowCommunityGroupModal(true)}
                          className="w-12 h-12 rounded-[calc(var(--radius)-4px)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[var(--accent)]/[15%] hover:border-[var(--accent)]/[50%] text-[var(--text)] hover:text-[var(--accent)] hover:shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.2)] transition-all flex items-center justify-center shrink-0 relative group"
                        >
                          <HoverTooltip title={t("community_groups_create") || "Create"} />
                          <span className="material-symbols-outlined !text-[20px]">{t("icon_add")}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Inner Scrolling List for Active Items */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 transform-gpu pb-10">
              {activeFiltered.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center opacity-30 py-10">
                  <span className="text-[11px] font-black uppercase tracking-[0.3em] text-center px-4 leading-relaxed">{t("no_links") || "NO ASSIGNED PROTOCOLS FOUND"}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 pb-4">
                  {activeFiltered.map((item) => (
                    <div key={item.id} className="relative group/item flex flex-col p-4 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-red-500/[30%] hover:shadow-[0_10px_30px_rgba(var(--danger-rgb),0.15)] hover:bg-red-500/[5%] transition-all duration-300 isolate">
                      
                      {/* Top Row: Icon + Badge */}
                      <div className="flex items-start justify-start gap-3 mb-4">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 rounded-2xl bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner overflow-hidden">
                          {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-40">{type === 'dlc' ? 'widgets' : (t("icon_deployed_code") || "extension")}</span>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {item._rel_type && (
                             <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest leading-none border ${
                               item._rel_type === 'twin' ? 'bg-[var(--accent)]/[15%] text-[var(--accent)] border-[var(--accent)]/[30%] shadow-[inset_0_0_10px_rgba(var(--accent-rgb),0.1)]' :
                               item._rel_type === 'addon' ? 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]' :
                               'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'
                             }`}>
                               {item._rel_type}
                             </span>
                          )}
                          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase mt-1">
                            {type === 'dlc' ? getDlcAbbreviation(item.type) : (item.latest_version ? `v${item.latest_version}` : 'PACKAGE')}
                          </span>
                        </div>
                      </div>
                      
                      {/* Middle Row: Name */}
                      <div className="flex flex-col min-w-0 flex-1 justify-center relative z-10 mb-4">
                        <span className="text-[13px] font-black text-[var(--text)] uppercase tracking-widest leading-tight group-hover/item:text-[var(--danger)] transition-colors duration-300 break-words line-clamp-2">{cleanSearchName(item.name || item.id, activeGameSchema)}</span>
                      </div>

                      {/* Bottom Row: Actions */}
                      <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10 opacity-60 group-hover/item:opacity-100 transition-opacity duration-300">
                        <ActionButton
                          onClick={() => type === 'dlc' ? handleToggleDLC(item.id, true) : handleRemoveLink(item.id, type)}
                          className="w-full !px-2 !py-2 !h-10 !rounded-xl !text-[9px] hover:!bg-red-500/[15%] hover:!text-[var(--danger)] hover:!border-[var(--danger)]/50 hover:!shadow-[0_0_30px_rgba(var(--danger-rgb),0.4)]"
                          icon="close"
                          label={t("nav_unlink") || "Unlink"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Subtle anchor gradient behind the master card */}
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-[var(--accent)]/10 blur-[60px] rounded-full pointer-events-none z-[-1]" />
        </div>

        {/* Right Side: Available Artifacts */}
        <div className="flex-1 flex flex-col h-full min-w-0 relative z-10 glass-panel rounded-[32px] p-6 border border-[var(--accent)]/[20%] shadow-md backdrop-blur-3xl [transform:translateZ(0)] [backface-visibility:hidden]">

          {/* Right Master Card Background Effects */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/3 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--text)]/5 rounded-full blur-[80px] pointer-events-none translate-y-1/3 -translate-x-1/3" />

          {/* Header for Right Pane */}
          <div className="shrink-0 flex items-center justify-start pb-4 mb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 mt-2 h-14">
            <h3 className="text-[14px] font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">apps</span>
              {t("available_lists") || "AVAILABLE ARTIFACTS"}
            </h3>

            <div className="w-full md:w-[280px]">
              <SearchBar
                value={type === 'dlc' ? dlcSearch : availableSearch}
                onChange={(v) => type === 'dlc' ? setDlcSearch(v) : setAvailableSearch(v)}
                placeholder={t("search_ph") || "Search Artifacts..."}
                className="w-full text-[11px]"
              />
            </div>
          </div>

          {type === 'dlc' && (
            <FilterTabs className="w-full mb-6">
              {[
                { id: 'Expansion Pack', label: t("tab_expansion") },
                { id: 'Game Pack', label: t("tab_game_pack") },
                { id: 'Stuff Pack', label: t("tab_stuff_pack") },
                { id: 'Kit', label: t("tab_kit") }
              ].map(tab => (
                <FilterTabButton key={tab.id} id={tab.id} label={tab.label} activeTab={dlcTab} setTab={setDlcTab} />
              ))}
            </FilterTabs>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 transform-gpu" onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 50 && hasMoreAvailable && !isFetchingAvailable) {
              setAvailablePage(p => p + 1);
            }
          }}>
            {availableItems.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-30">
                <span className="material-symbols-outlined !text-[48px] text-[var(--text)]">apps</span>
                <span className="text-[12px] font-black uppercase tracking-[0.3em] text-center max-w-sm leading-relaxed">{t("no_artifact") || "NO COMPATIBLE ARTIFACTS AVAILABLE TO ASSIGN"}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 min-[2000px]:grid-cols-4 gap-4 pb-4">
                {availableItems.map((item) => (
                  <div key={item.id} className="relative group/item flex flex-col p-4 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/[30%] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] hover:bg-[var(--accent)]/[5%] transition-all duration-300 isolate">

                    {/* Top Row: Icon + Badge */}
                    <div className="flex items-start justify-start gap-3 mb-4">
                      <div className="w-12 h-12 flex items-center justify-center shrink-0 rounded-2xl bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner overflow-hidden">
                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-40">{type === 'dlc' ? 'widgets' : (t("icon_deployed_code") || "extension")}</span>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--text)] text-right break-words max-w-[100px] leading-tight">
                          {type === 'dlc' ? getDlcAbbreviation(item.type) : (item.file_extension || item.sub_type || 'PACKAGE').replace(".", "")}
                        </span>
                        {item.latest_version && (
                          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase">v{item.latest_version}</span>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Name */}
                    <div className="flex flex-col min-w-0 flex-1 justify-center relative z-10 mb-4">
                      <span className="text-[13px] font-black text-[var(--text)] uppercase tracking-widest leading-tight group-hover/item:text-[var(--accent)] transition-colors duration-300 break-words line-clamp-2">{cleanSearchName(item.name || item.id, activeGameSchema)}</span>
                    </div>

                    {/* Bottom Row: Actions */}
                    <div className="flex flex-wrap items-center gap-2 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10 opacity-60 group-hover/item:opacity-100 transition-opacity duration-300">
                      {type === 'twins' && (
                        <>
                          <ActionButton onClick={() => handleAddLink(item.id, 'twin')} className="flex-1 !px-2 !py-2 !h-10 !rounded-xl !text-[9px]" icon="device_hub" label={t("link_twin") || "Twin"} />
                          <ActionButton onClick={() => handleAddLink(item.id, 'addon')} className="flex-1 !px-2 !py-2 !h-10 !rounded-xl !text-[9px]" icon="extension" label={t("link_addon") || "Addon"} />
                        </>
                      )}
                      {type === 'flavors' && (
                        <>
                          <ActionButton onClick={() => handleAddLink(item.id, 'flavor')} className="flex-1 !px-2 !py-2 !h-10 !rounded-xl !text-[9px]" icon="alt_route" label={t("link_flavor") || "Flavor"} />
                          <ActionButton onClick={() => handleAddLink(item.id, 'beta')} className="flex-1 !px-2 !py-2 !h-10 !rounded-xl !text-[9px]" icon="science" label={t("link_beta") || "Beta"} />
                        </>
                      )}
                      {(type === 'dependencies' || type === 'dlc' || (type === 'community' && activeCommunityGroup)) && (
                        <ActionButton
                          onClick={() => {
                            if (type === 'dlc') handleToggleDLC(item.id, false);
                            else if (type === 'community') handleAddLink(item.id, 'community');
                            else handleAddLink(item.id, 'dependency');
                          }}
                          className="w-full !px-2 !py-2 !h-10 !rounded-xl !text-[9px]"
                          icon={type === 'dlc' ? 'add_circle' : (type === 'community' ? 'category' : 'account_tree')}
                          label={t("btn_add_link") || "Assign"}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  const getDlcAvailable = () => {
    if (!targetMod) return [];
    return dlcRegistry.filter(d => d.type === dlcTab && !parseDLC(targetMod.requiredDLC).includes(d.id) && (!dlcSearch || d.name.toLowerCase().includes(dlcSearch.toLowerCase()))).sort((a, b) => a.id.localeCompare(b.id));
  };

  const getDlcAssigned = () => {
    if (!targetMod) return [];
    return dlcRegistry.filter(d => parseDLC(targetMod.requiredDLC).includes(d.id));
  };

  return (
    <div className="flex flex-col w-full relative animate-in fade-in h-full">

      {/* 1. The Seamless Header */}
      <div className="flex items-center justify-start px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full z-20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[var(--text)]/5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner shrink-0">
            <span className="material-symbols-outlined !text-[24px] text-[var(--accent)] drop-shadow-md opacity-80">{t("icon_link")}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest">
              {t("pv_title")}
            </h2>
            <span className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-[0.2em] opacity-70">{t("pv_subtitle")}</span>
          </div>
        </div>

        <div className="w-full max-w-lg z-50">
          <ServerModSearchDropdown
            masonId={masonId}
            isArchitect={isArchitect}
            onSelect={(mod: any) => setTargetMod(mod)}
            selectedItem={targetMod}
            onClear={() => { setTargetMod(null); setActivePanel(null); }}
            placeholder={t("search_ph")}
            className="w-full h-12 rounded-full glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]/[30%] px-6 text-[var(--text)] text-[11px] font-black uppercase tracking-[0.2em] focus:outline-none focus:theme-border-accent transition-all relative"
          />
        </div>
      </div>

      {/* 2. The Main Body (The Trigger Grid) */}
      <div className="flex-1 overflow-y-auto accent-scrollbar w-full p-6">
        {!targetMod ? (
          <div className="w-full h-full flex items-center justify-center opacity-80">
            <EmptyState icon="dashboard_customize" className="py-24" />
          </div>
        ) : (
          <div className="w-full flex flex-col gap-10 animate-in fade-in zoom-in-95 duration-500 pb-32">

            {/* The Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {renderTriggerBox("timeline", t("lineage_title"), t("lineage_desc"), targetVersions.length, "lineage")}
              {renderTriggerBox("device_hub", t("section_folder_title"), t("section_folder_desc"), twinsAndAddons.length, "twins")}
              {renderTriggerBox("alt_route", t("section_alternatives_title"), t("section_alternatives_desc"), alternatives.length, "flavors")}
              {renderTriggerBox("category", t("section_community_groups_title"), t("section_community_groups_desc"), activeCommunityGroup ? 1 : 0, "community")}
              {renderTriggerBox("widgets", t("section_dlc_title"), t("section_dlc_desc"), parseDLC(targetMod.requiredDLC).length, "dlc")}
              {renderTriggerBox("extension", t("section_deps_title"), t("section_deps_desc"), dependencies.length, "dependencies")}
            </div>
          </div>
        )}
      </div>

      {/* 3. The Dedicated Panels */}

      {/* Lineage Panel */}
      <SidePanel
        isOpen={activePanel === 'lineage'}
        onClose={() => setActivePanel(null)}
        title={t("lineage_title")}
        icon="timeline"
        widthClass="w-[90vw] max-w-[800px]"
        noPadding
      >
        <div className="flex flex-col h-[calc(100vh-100px)] w-full overflow-y-auto accent-scrollbar p-10">
          {targetMod && <ModLineageTree targetMod={targetMod} cloudMods={cloudMods} onRefresh={loadLinks} />}
        </div>
      </SidePanel>

      {/* Dual Panels (Twins, Flavors, Dependencies, DLC, Community) */}
      <SidePanel
        isOpen={activePanel === 'twins' || activePanel === 'flavors' || activePanel === 'community' || activePanel === 'dependencies' || activePanel === 'dlc'}
        onClose={() => { setActivePanel(null); setAvailableSearch(""); }}
        title={activePanel === 'twins' ? t("section_folder_title") : activePanel === 'flavors' ? t("section_alternatives_title") : activePanel === 'community' ? t("section_community_groups_title") : activePanel === 'dlc' ? t("section_dlc_title") : t("section_deps_title")}
        icon={activePanel === 'twins' ? 'device_hub' : activePanel === 'flavors' ? 'alt_route' : activePanel === 'community' ? 'category' : activePanel === 'dlc' ? 'widgets' : 'extension'}
        widthClass="w-[95vw] max-w-[1400px]"
        noPadding
        noScroll
      >
        {activePanel === 'twins' && renderDualSection("device_hub", t("section_folder_title"), t("section_folder_desc"), twinsAndAddons, availableMods, "twins")}
        {activePanel === 'dependencies' && renderDualSection("extension", t("section_deps_title"), t("section_deps_desc"), dependencies, availableMods, "dependencies")}
        {activePanel === 'dlc' && renderDualSection("widgets", t("section_dlc_title"), t("section_dlc_desc"), getDlcAssigned(), getDlcAvailable(), "dlc")}
        {activePanel === 'flavors' && renderDualSection("alt_route", t("section_alternatives_title"), t("section_alternatives_desc"), alternatives, availableMods, "flavors")}
        {activePanel === 'community' && renderDualSection("category", t("section_community_groups_title"), t("section_community_groups_desc"), communityMods, availableMods, "community")}
      </SidePanel>

      {/* Flavor Group Modal */}
      <SidePanel
        isOpen={showFlavorGroupModal}
        onClose={() => { setShowFlavorGroupModal(false); setNewFlavorGroupName(''); }}
        title={t("modal_create_group_title")}
        icon="hub"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <ActionButton
              onClick={() => { setShowFlavorGroupModal(false); setNewFlavorGroupName(''); }} label={t("nav_cancel")}
            >
            </ActionButton>
            <ActionButton
              onClick={handleCreateFlavorGroup}
              disabled={!newFlavorGroupName.trim()} label={t("modal_btn_create")} icon={t("icon_add_circle")}
            >
            </ActionButton>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("modal_group_name_label")}</label>
          <input
            autoFocus
            type="text"
            value={newFlavorGroupName}
            onChange={(e) => setNewFlavorGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFlavorGroup()}
            placeholder={t("modal_group_name_placeholder")}
            className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
          />
        </div>
      </SidePanel>



    </div>
  );
}
