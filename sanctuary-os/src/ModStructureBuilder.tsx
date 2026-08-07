import { useState } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { MasonPostsEditor } from "./MasonPostsEditor";
import { ModSearchDropdown, standardAccentGlassButtonClass, standardSuccessButtonClass, EmptyState, ActionButton, SidePanel, getFileLabel, isSupportedExtension, formatDisplayName, getExtensionRegex} from "./shared";
import { useStore } from "./store";

export interface StructureNode {
  id: string;
  name: string;
  type: "folder" | "file";
  assignedModId?: string;
  assignedModName?: string;
  shared?: boolean;
  children?: StructureNode[];
}

interface ModStructureBuilderProps {
  structure: StructureNode[];
  onChange: (newStructure: StructureNode[]) => void;
  targetMod?: any;
  availableMods?: any[];
}

export default function ModStructureBuilder({ structure, onChange, targetMod, availableMods }: ModStructureBuilderProps) {
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const { t } = useLexicon();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [availablePage, setAvailablePage] = useState(0);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const getAssignedModIds = (nodes: StructureNode[]): Set<string> => {
    let ids = new Set<string>();
    for (const node of nodes) {
      if (node.assignedModId) ids.add(node.assignedModId);
      if (node.children) {
        const childIds = getAssignedModIds(node.children);
        for (const id of childIds) ids.add(id);
      }
    }
    return ids;
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedNodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedNodes(next);
  };

  const handleAddFolder = (parentId?: string) => {
    const newFolder: StructureNode = { id: generateId(), name: t("structure_new_folder"), type: "folder", children: [] };
    if (!parentId) {
      onChange([...structure, newFolder]);
      return;
    }
    const updateNode = (nodes: StructureNode[]): StructureNode[] => {
      return nodes.map(n => {
        if (n.id === parentId) {
          if (!expandedNodes.has(parentId)) toggleExpand(parentId);
          return { ...n, children: [...(n.children || []), newFolder] };
        }
        if (n.children) return { ...n, children: updateNode(n.children) };
        return n;
      });
    };
    onChange(updateNode(structure));
  };

  const handleAddFile = (parentId: string) => {
    const newFile: StructureNode = { id: generateId(), name: t("structure_new_file"), type: "file" };
    const updateNode = (nodes: StructureNode[]): StructureNode[] => {
      return nodes.map(n => {
        if (n.id === parentId) {
          if (!expandedNodes.has(parentId)) toggleExpand(parentId);
          return { ...n, children: [...(n.children || []), newFile] };
        }
        if (n.children) return { ...n, children: updateNode(n.children) };
        return n;
      });
    };
    onChange(updateNode(structure));
  };

  const handleUpdateName = (id: string, name: string) => {
    const updateNode = (nodes: StructureNode[]): StructureNode[] => {
      return nodes.map(n => {
        if (n.id === id) return { ...n, name, assignedModId: undefined, assignedModName: undefined };
        if (n.children) return { ...n, children: updateNode(n.children) };
        return n;
      });
    };
    onChange(updateNode(structure));
  };

  const scriptExt = Object.keys(activeGameSchema?.extensions?.labels || {}).find(k => activeGameSchema.extensions.labels[k] === "SCRIPT") || ".ts4script";
  const pkgExt = Object.keys(activeGameSchema?.extensions?.labels || {}).find(k => activeGameSchema.extensions.labels[k] === "PACKAGE") || ".package";

  const handleAssignMod = (id: string, mod: any, ext?: string) => {
    
    let assignedName = mod.name;
    if (ext) {
      const baseName = mod.name.replace(getExtensionRegex(activeGameSchema), '');
      assignedName = `${baseName}.${ext}`;
    } else if (mod.is_script !== undefined && getFileLabel(mod.name, activeGameSchema) !== "PACKAGE" && getFileLabel(mod.name, activeGameSchema) !== "SCRIPT" && !mod.name.toLowerCase().endsWith('.tmcatalog')) {
      assignedName = mod.is_script ? `${mod.name}${scriptExt}` : `${mod.name}${pkgExt}`;
    }

    const assignedExt = assignedName.split('.').pop()?.toLowerCase();
    const isPackage = assignedExt === pkgExt.replace('.', '');
    const isTs4script = assignedExt === scriptExt.replace('.', '');
    
    let twinName: string | null = null;
    let twinExt: string | null = null;
    if (isPackage) {
        twinName = assignedName.replace(/\.[^/.]+$/, scriptExt);
        twinExt = scriptExt.replace('.', '');
    } else if (isTs4script) {
        twinName = assignedName.replace(/\.[^/.]+$/, pkgExt);
        twinExt = pkgExt.replace('.', '');
    }

    const updateNode = (nodes: StructureNode[]): StructureNode[] => {
      return nodes.map(n => {
        if (n.id === id) return { ...n, name: assignedName, assignedModId: mod.id, assignedModName: assignedName };
        if (twinName && !n.assignedModId && n.type === 'file' && n.name.toLowerCase() === twinName.toLowerCase()) {
            return { ...n, name: twinName, assignedModId: mod.id, assignedModName: twinName };
        }
        if (n.children) return { ...n, children: updateNode(n.children) };
        return n;
      });
    };
    onChange(updateNode(structure));
  };

  const handleDelete = (id: string) => {
    const filterNode = (nodes: StructureNode[]): StructureNode[] => {
      return nodes.filter(n => n.id !== id).map(n => {
        if (n.children) return { ...n, children: filterNode(n.children) };
        return n;
      });
    };
    onChange(filterNode(structure));
  };

  const renderNode = (node: StructureNode, depth: number = 0, isLastChild: boolean = false) => {
    const isExpanded = expandedNodes.has(node.id);
    const isConfigFile = node.name.toLowerCase().endsWith('.cfg') || 
                         node.name.toLowerCase().endsWith('.ini') || 
                         node.name.toLowerCase().endsWith('.xml') ||
                         node.name.toLowerCase().endsWith('.json') ||
                         node.name.toLowerCase().endsWith('.tmcatalog');

    const isPackage = getFileLabel(node.name, activeGameSchema) === "PACKAGE";
    const isTs4script = getFileLabel(node.name, activeGameSchema) === "SCRIPT";

    return (
      <div key={node.id} className="flex flex-col items-start relative group/node hover:z-[100]">
        
        {depth > 0 && (
          <div className="absolute left-[-2rem] top-7 w-8 h-px bg-[var(--accent)]/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] rounded-r-full" />
        )}

        <div className="theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-3xl p-4 pr-6 flex items-center justify-between shadow-xl hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all duration-300 group/card relative z-10 hover:z-[100] shrink-0 backdrop-blur-xl min-w-[280px]">
          
          <div className="flex items-center gap-4">
            {node.type === "folder" ? (
              <button 
                onClick={() => toggleExpand(node.id)} 
                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:text-[var(--accent)] transition-all text-[var(--text)] shrink-0 shadow-inner group-hover/card:border-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
              >
                <span className="material-symbols-outlined !text-[24px] drop-shadow-md transition-transform duration-300 group-hover/card:scale-110">{isExpanded ? "folder_open" : "folder"}</span>
              </button>
            ) : (
              <div className={`w-12 h-12 flex items-center justify-center rounded-2xl border shrink-0 shadow-inner ${isConfigFile ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)]' : 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]'}`}>
                 <span className="material-symbols-outlined !text-[24px] drop-shadow-md">{isConfigFile ? "settings" : "description"}</span>
              </div>
            )}

            <div className="flex flex-col justify-center flex-1 min-w-0">
              {node.assignedModName ? (
                <div className="flex items-center gap-2">
                   <span className={`text-[13px] font-black uppercase tracking-widest truncate leading-tight ${isConfigFile ? 'text-[var(--warning)]' : 'text-[var(--text)] group-hover/card:text-[var(--accent)] transition-colors'}`}>
                     {isConfigFile ? node.assignedModName.replace(/^\[|\]$/g, '') : `[${node.assignedModName.replace(/^\[|\]$/g, '')}]`}
                   </span>
                   {isPackage && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] font-black tracking-widest border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] leading-none shrink-0">PKG</span>}
                   {isTs4script && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] font-black tracking-widest border border-[color-mix(in_srgb,var(--success)_30%,transparent)] leading-none shrink-0">TS4</span>}
                </div>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <input 
                    value={node.name}
                    onChange={(e) => handleUpdateName(node.id, e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:theme-border-accent outline-none text-[13px] font-black uppercase tracking-widest text-[var(--text)] transition-all flex-1 min-w-[120px] py-1 placeholder-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                    placeholder={node.type === "folder" ? "DIR NAME..." : "FILE PATTERN..."}
                  />
                  {isPackage && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] font-black tracking-widest border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] leading-none shrink-0">PKG</span>}
                  {isTs4script && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] font-black tracking-widest border border-[color-mix(in_srgb,var(--success)_30%,transparent)] leading-none shrink-0">TS4</span>}
                </div>
              )}
            </div>
          </div>


          
          <div className="absolute top-12 left-10 opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto transition-all scale-95 group-hover/card:scale-100 w-48 h-max theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl rounded-xl overflow-hidden flex flex-col py-1 z-[60] origin-top-left">
            {node.type === "file" && availableMods && (
              <button onClick={() => setActiveDropdown(activeDropdown === node.id ? null : node.id)} className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-bold text-[var(--accent)] group">
                <span className="material-symbols-outlined !text-[16px] opacity-70 group-hover:opacity-100">link</span>
                {t("auto_assign_binding")}
              </button>
            )}
            
            {node.type === "folder" && (
              <>
                <button onClick={() => handleAddFolder(node.id)} className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-bold text-[var(--text)] group">
                  <span className="material-symbols-outlined !text-[16px] opacity-70 group-hover:opacity-100">{t("icon_create_new_folder")}</span>
                  {t("auto_directory")}
                </button>
                <button onClick={() => handleAddFile(node.id)} className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-bold text-[var(--text)] group">
                  <span className="material-symbols-outlined !text-[16px] opacity-70 group-hover:opacity-100">{t("icon_note_add")}</span>
                  {t("auto_file")}
                </button>
                <div className="h-px w-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] my-1" />
              </>
            )}
            
            <button onClick={() => handleDelete(node.id)} className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-bold text-[var(--danger)] group">
              <span className="material-symbols-outlined !text-[16px] opacity-70 group-hover:opacity-100">{t("icon_delete")}</span>
              DELETE
            </button>
          </div>
        </div>

        {node.type === "folder" && isExpanded && node.children && node.children.length > 0 && (
          <div className="flex flex-wrap gap-8 pl-12 relative mt-4 pb-4">
            <div className="absolute top-[-1rem] left-6 bottom-4 w-px bg-[var(--accent)]/30 rounded-b-full shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" />
            
            {node.children.map((child, idx) => 
              renderNode(child, depth + 1, idx === node.children!.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  const assignedModIds = getAssignedModIds(structure);
  const isTargetModAssigned = targetMod && assignedModIds.has(targetMod.id);
  const filteredAvailableMods = availableMods
    ? availableMods
        .filter(m => !assignedModIds.has(m.id))
        .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];
  
  const displayAvailableMods = filteredAvailableMods.slice(0, (availablePage + 1) * 20);
  const hasMoreAvailable = filteredAvailableMods.length > displayAvailableMods.length;

  return (
    <div className="flex flex-col gap-8 w-full p-2 h-full">
      <div className="flex flex-wrap gap-12 w-full min-h-[400px] items-start pb-20 pt-8 pl-8 flex-1">
        {structure.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center relative mt-20">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[var(--accent)] rounded-full blur-[120px] opacity-20 pointer-events-none" />
            <span className="material-symbols-outlined !text-6xl mb-4 text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]">{t("icon_folder_off")}</span>
            <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] relative z-10">{t("structure_no_structure")}</span>
          </div>
        ) : (
          structure.map(node => renderNode(node, 0))
        )}
      </div>
      <SidePanel
        isOpen={!!activeDropdown}
        onClose={() => { setActiveDropdown(null); setSearchQuery(""); setAvailablePage(0); }}
        title={t("structure_assign_title")}
        icon="account_tree"
        widthClass="w-[90vw] max-w-[800px]"
        noPadding
      >
        <div className="flex flex-col h-[calc(100vh-100px)] w-full overflow-hidden p-8">
          <div className="flex-1 flex flex-col h-full min-w-0 relative z-10 theme-glass-panel rounded-[32px] p-6 border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-3xl">
            
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/3 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--text)]/5 rounded-full blur-[80px] pointer-events-none translate-y-1/3 -translate-x-1/3" />

            {/* Header for Right Pane */}
            <div className="shrink-0 flex items-center justify-between pb-4 mb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 mt-2 h-14">
              <h3 className="text-[14px] font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">apps</span>
                {t("available_lists") || "AVAILABLE ARTIFACTS"}
              </h3>

              <div className="w-full md:w-[280px]">
                <input 
                  type="text" 
                  autoFocus 
                  placeholder={t("search_ph")} 
                  value={searchQuery} 
                  onChange={e => { setSearchQuery(e.target.value); setAvailablePage(0); }} 
                  className="w-full theme-glass-inner border border-white/10 rounded-xl text-[12px] font-mono text-[var(--text)] px-5 py-2.5 outline-none focus:theme-border-accent shadow-inner transition-all bg-transparent" 
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 transform-gpu" onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 50 && hasMoreAvailable) {
                setAvailablePage(p => p + 1);
              }
            }}>
              {(!targetMod || isTargetModAssigned) && displayAvailableMods.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-30">
                  <span className="material-symbols-outlined !text-[48px] text-[var(--text)]">apps</span>
                  <span className="text-[12px] font-black uppercase tracking-[0.3em] text-center max-w-sm leading-relaxed">{t("no_artifact") || "NO COMPATIBLE ARTIFACTS AVAILABLE TO ASSIGN"}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-6 pb-4">
                  
                  {/* Primary Artifact */}
                  {targetMod && !isTargetModAssigned && (!searchQuery || targetMod.name.toLowerCase().includes(searchQuery.toLowerCase())) && (
                    <div className="flex flex-col gap-4">
                      <h4 className="text-[10px] font-black uppercase text-[var(--accent)] tracking-[0.2em] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">stars</span> {t("structure_assign_primary")}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative group/item flex flex-col p-4 rounded-3xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all duration-300 isolate">
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="w-12 h-12 flex items-center justify-center shrink-0 rounded-2xl bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner overflow-hidden">
                              {targetMod.image_url ? <img src={targetMod.image_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-40">extension</span>}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--accent)] text-right break-words max-w-[100px] leading-tight">
                                PRIMARY
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col min-w-0 flex-1 justify-center relative z-10 mb-4 cursor-pointer" onClick={() => { activeDropdown && handleAssignMod(activeDropdown, targetMod); setActiveDropdown(null); setSearchQuery(""); setAvailablePage(0); }}>
                            <span className="text-[13px] font-black text-[var(--text)] uppercase tracking-widest leading-tight group-hover/item:text-[var(--accent)] transition-colors duration-300 break-words line-clamp-2">{targetMod.name}</span>
                          </div>

                          {(targetMod.sub_type === 'TS4SCRIPT' || targetMod.sub_type === 'PACKAGE') && (
                            <div className="flex bg-black/20 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] rounded-xl overflow-hidden mt-auto">
                              {targetMod.sub_type !== 'TS4SCRIPT' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, targetMod, pkgExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); setAvailablePage(0); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer border-r border-white/5 transition-all">{t("auto_pkg")}</div>}
                              {targetMod.sub_type !== 'PACKAGE' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, targetMod, scriptExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); setAvailablePage(0); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer transition-all">{t("auto_script")}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Family Artifacts */}
                  {displayAvailableMods.length > 0 && (
                    <div className="flex flex-col gap-4">
                      <h4 className="text-[10px] font-black uppercase text-[var(--subtext)] tracking-[0.2em] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">folder_shared</span> {t("structure_assign_family")}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 min-[2000px]:grid-cols-3 gap-4">
                        {displayAvailableMods.map(m => (
                          <div key={m.id} className="relative group/item flex flex-col p-4 rounded-3xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all duration-300 isolate">
                            <div className="flex items-start justify-between gap-3 mb-4">
                              <div className="w-12 h-12 flex items-center justify-center shrink-0 rounded-2xl bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner overflow-hidden">
                                {m.image_url ? <img src={m.image_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-40">extension</span>}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--text)] text-right break-words max-w-[100px] leading-tight">
                                  {m.file_extension ? m.file_extension.replace(".", "") : (m.sub_type || 'PACKAGE')}
                                </span>
                                {m.latest_version && (
                                   <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase">v{m.latest_version}</span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex flex-col min-w-0 flex-1 justify-center relative z-10 mb-4 cursor-pointer" onClick={() => { activeDropdown && handleAssignMod(activeDropdown, m); setActiveDropdown(null); setSearchQuery(""); setAvailablePage(0); }}>
                              <span className="text-[13px] font-black text-[var(--text)] uppercase tracking-widest leading-tight group-hover/item:text-[var(--accent)] transition-colors duration-300 break-words line-clamp-2">{m.name}</span>
                            </div>

                            {(m.sub_type === 'TS4SCRIPT' || m.sub_type === 'PACKAGE') && (
                              <div className="flex bg-black/20 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] rounded-xl overflow-hidden mt-auto">
                                {m.sub_type !== 'TS4SCRIPT' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, m, pkgExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); setAvailablePage(0); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer border-r border-white/5 transition-all">{t("auto_pkg")}</div>}
                                {m.sub_type !== 'PACKAGE' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, m, scriptExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); setAvailablePage(0); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer transition-all">{t("auto_script")}</div>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
