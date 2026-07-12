import { useState } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { SidePanel, standardAccentGlassButtonClass , getFileLabel, isSupportedExtension, formatDisplayName, getExtensionRegex} from "./shared";
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

  const generateId = () => Math.random().toString(36).substr(2, 9);

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

  const handleToggleShared = (id: string) => {
    const updateNode = (nodes: StructureNode[]): StructureNode[] => {
      return nodes.map(n => {
        if (n.id === id) return { ...n, shared: !n.shared };
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
      <div key={node.id} className="flex flex-col items-start relative group/node">
        
        {depth > 0 && (
          <div className="absolute left-[-2rem] top-7 w-8 h-px bg-[var(--accent)]/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] rounded-r-full" />
        )}

        <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-3 pr-6 flex items-center justify-between shadow-2xl hover:border-[var(--accent)]/30 hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] transition-all hover:-translate-y-0.5 group/card relative z-10 shrink-0 backdrop-blur-xl">
          
          <div className="flex items-center gap-4">
            {node.type === "folder" ? (
              <button 
                onClick={() => toggleExpand(node.id)} 
                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[var(--text)]/5 border border-white/10 hover:border-[var(--accent)]/50 transition-all text-[var(--accent)] shrink-0 shadow-lg backdrop-blur-md"
              >
                <span className="material-symbols-outlined !text-[24px] drop-shadow-md">{isExpanded ? "folder_open" : "folder"}</span>
              </button>
            ) : (
              <div className={`w-12 h-12 flex items-center justify-center rounded-2xl border shrink-0 shadow-lg backdrop-blur-md ${isConfigFile ? 'bg-[var(--warning)]/10 border-[var(--warning)]/30 text-[var(--warning)]' : 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]'}`}>
                 <span className="material-symbols-outlined !text-[24px] drop-shadow-md">{isConfigFile ? "settings" : "description"}</span>
              </div>
            )}

            <div className="flex flex-col justify-center min-w-[120px]">
              {node.assignedModName ? (
                <div className="flex items-center gap-2">
                   <span className={`text-sm font-mono truncate tracking-tight ${isConfigFile ? 'text-[var(--warning)] opacity-80' : 'theme-text-accent font-black'}`}>
                     {isConfigFile ? node.assignedModName.replace(/^\[|\]$/g, '') : `[${node.assignedModName}]`}
                   </span>
                   {isPackage && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-black tracking-widest border border-blue-500/20 leading-none">PKG</span>}
                   {isTs4script && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-black tracking-widest border border-green-500/20 leading-none">TS4</span>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input 
                    value={node.name}
                    onChange={(e) => handleUpdateName(node.id, e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:theme-border-accent outline-none text-sm font-mono font-bold text-[var(--text)] transition-all min-w-[150px] py-1"
                    placeholder={node.type === "folder" ? "Folder Name..." : "File Pattern..."}
                  />
                  {isPackage && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-black tracking-widest border border-blue-500/20 leading-none">PKG</span>}
                  {isTs4script && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-black tracking-widest border border-green-500/20 leading-none">TS4</span>}
                </div>
              )}
              {node.shared && <span className="text-[8px] font-black uppercase tracking-[0.3em] theme-text-success opacity-80 mt-1">{t("builder_shared_volume")}</span>}
            </div>
          </div>


          
          <div className="absolute top-[-55px] right-0 flex items-center gap-2 opacity-0 group-hover/card:opacity-100 transition-all scale-95 group-hover/card:scale-100 theme-glass-panel backdrop-blur-2xl p-2 rounded-2xl shadow-2xl border border-white/10 z-50">
            {node.type === "file" && availableMods && (
              <button onClick={() => setActiveDropdown(activeDropdown === node.id ? null : node.id)} className="px-4 py-2.5 rounded-xl bg-[var(--text)]/5 border border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--accent)] hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/50 hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] hover:scale-105 active:scale-95 transition-all">
                {t("auto_assign_binding")}
              </button>
            )}
            
            {node.type === "folder" && (
              <>
                <button onClick={() => handleToggleShared(node.id)} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all border hover:scale-105 active:scale-95 ${node.shared ? 'bg-[var(--success)]/20 border-[var(--success)]/50 text-[var(--success)] shadow-[0_0_15px_rgba(var(--success-rgb),0.3)]' : 'bg-[var(--text)]/5 border-white/5 text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[var(--text)]/10 hover:border-white/20'}`}>
                  {node.shared ? "SHARED" : "SHARE"}
                </button>
                <button onClick={() => handleAddFolder(node.id)} className="px-4 py-2.5 rounded-xl bg-[var(--text)]/5 border border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text)] hover:bg-[var(--text)]/10 hover:border-white/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px]">{t("icon_create_new_folder")}</span> {t("auto_directory")}
                </button>
                <button onClick={() => handleAddFile(node.id)} className="px-4 py-2.5 rounded-xl bg-[var(--text)]/5 border border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text)] hover:bg-[var(--text)]/10 hover:border-white/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px]">{t("icon_note_add")}</span> {t("auto_file")}
                </button>
              </>
            )}
            
            <button onClick={() => handleDelete(node.id)} className="px-4 py-2.5 rounded-xl bg-[var(--text)]/5 border border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--danger)] hover:bg-[var(--danger)]/20 hover:border-[var(--danger)]/50 hover:shadow-[0_0_15px_rgba(var(--danger-rgb),0.3)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
              <span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span>
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

  return (
    <div className="flex flex-col gap-8 w-full p-2">
      <div className="flex justify-between items-center bg-black/20 p-6 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
        <div className="flex flex-col">
          <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">{t("builder_graph_title")}</span>
          <span className="text-[10px] text-[var(--subtext)] font-bold uppercase tracking-widest mt-1">{t("builder_graph_subtitle")}</span>
        </div>
        <button onClick={() => handleAddFolder()} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
          <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_create_new_folder")}</span>
          {t("structure_add_root")}
        </button>
      </div>

      <div className="flex flex-wrap gap-12 w-full min-h-[400px] items-start pb-20 pt-8 pl-8">
        {structure.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center py-20 w-full relative">
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
        onClose={() => { setActiveDropdown(null); setSearchQuery(""); }}
        title={t("structure_assign_title")}
        subtitle={t("structure_assign_desc")}
        icon="account_tree"
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-8 py-6 shrink-0 border-b border-white/5 relative z-10">
            <input type="text" autoFocus placeholder={t("comp_search_mods")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full theme-glass-inner border border-white/10 rounded-xl text-[12px] font-mono text-[var(--text)] px-5 py-4 outline-none focus:theme-border-accent shadow-inner transition-all" />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-6 relative z-10">
            {targetMod && (!searchQuery || targetMod.name.toLowerCase().includes(searchQuery.toLowerCase())) && (
              <div className="flex flex-col gap-3">
                <h4 className="text-[10px] font-black uppercase text-[var(--accent)] tracking-[0.2em] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_stars")}</span> {t("structure_assign_primary")}</h4>
                <div className="flex flex-col theme-glass-inner rounded-xl overflow-hidden border border-[var(--accent)]/30 hover:border-[var(--accent)]/60 transition-all group/item shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]">
                  <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, targetMod); setActiveDropdown(null); setSearchQuery(""); }} className="px-5 py-4 text-[12px] font-mono font-bold text-[var(--text)] group-hover/item:bg-[var(--accent)]/10 transition-colors truncate cursor-pointer leading-tight">{targetMod.name}</div>
                  {(targetMod.sub_type === 'TS4SCRIPT' || targetMod.sub_type === 'PACKAGE') && (
                    <div className="flex bg-black/20 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {targetMod.sub_type !== 'TS4SCRIPT' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, targetMod, pkgExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer border-r border-white/5 transition-all">{t("auto_pkg")}</div>}
                      {targetMod.sub_type !== 'PACKAGE' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, targetMod, scriptExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer transition-all">{t("auto_script")}</div>}
                    </div>
                  )}
                </div>
              </div>
            )}
            {availableMods && availableMods.length > 0 && (
              <div className="flex flex-col gap-3 mt-2">
                <h4 className="text-[10px] font-black uppercase text-[var(--subtext)] tracking-[0.2em] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_folder_shared")}</span> {t("structure_assign_family")}</h4>
                <div className="flex flex-col gap-3">
                  {availableMods.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                    <div key={m.id} className="flex flex-col theme-glass-inner rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all group/item shadow-lg">
                      <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, m); setActiveDropdown(null); setSearchQuery(""); }} className="px-5 py-4 text-[12px] font-mono text-[var(--text)] group-hover/item:bg-[var(--text)]/5 transition-colors truncate cursor-pointer leading-tight">{m.name}</div>
                      {(m.sub_type === 'TS4SCRIPT' || m.sub_type === 'PACKAGE') && (
                        <div className="flex bg-black/20 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {m.sub_type !== 'TS4SCRIPT' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, m, pkgExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer border-r border-white/5 transition-all">{t("auto_pkg")}</div>}
                          {m.sub_type !== 'PACKAGE' && <div onClick={() => { activeDropdown && handleAssignMod(activeDropdown, m, scriptExt.replace('.', '')); setActiveDropdown(null); setSearchQuery(""); }} className="flex-1 text-center py-2.5 hover:bg-white/10 hover:text-[var(--text)] cursor-pointer transition-all">{t("auto_script")}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
