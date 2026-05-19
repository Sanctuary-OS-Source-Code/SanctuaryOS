import { useState } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";

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

  const handleAssignMod = (id: string, mod: any, ext?: string) => {
    let assignedName = mod.name;
    // If the user explicitly clicked .PKG or .SCRIPT, append that extension
    if (ext) {
      const baseName = mod.name.replace(/\.(package|ts4script)$/i, '');
      assignedName = `${baseName}.${ext}`;
    } 
    // Otherwise try to infer from is_script if available
    else if (mod.is_script !== undefined && !mod.name.toLowerCase().endsWith('.package') && !mod.name.toLowerCase().endsWith('.ts4script')) {
      assignedName = mod.is_script ? `${mod.name}.ts4script` : `${mod.name}.package`;
    }

    const updateNode = (nodes: StructureNode[]): StructureNode[] => {
      return nodes.map(n => {
        if (n.id === id) return { ...n, name: assignedName, assignedModId: mod.id, assignedModName: assignedName };
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
                         node.name.toLowerCase().endsWith('.json');
    const isPackageModule = node.assignedModName && 
                           (node.name.toLowerCase().includes('[') || 
                            node.name.toLowerCase().endsWith('.package') || 
                            node.name.toLowerCase().endsWith('.ts4script'));

    return (
      <div key={node.id} className="flex flex-col gap-2 w-full">
        {/* Glass Node Container */}
        <div className="bg-zinc-950/50 backdrop-blur-md border border-zinc-800/40 rounded-xl p-3 flex items-center justify-between shadow-lg hover:border-zinc-700/60 transition-all group relative">
          
          {/* Tree connection lines */}
          {depth > 0 && (
            <>
              <div className="absolute left-[-1.5rem] top-1/2 w-6 h-px bg-zinc-700/50" />
              {!isLastChild && (
                <div className="absolute left-[-1.5rem] top-0 bottom-0 w-px bg-zinc-700/50" />
              )}
            </>
          )}

          {/* Left Side: Icon + Name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Folder/File Icon */}
            {node.type === "folder" ? (
              <button 
                onClick={() => toggleExpand(node.id)} 
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-cyan-500/50 transition-all text-cyan-400 text-sm shrink-0"
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <div className={`w-8 h-8 flex items-center justify-center rounded-lg border text-lg shrink-0 ${isConfigFile ? 'bg-amber-950/20 border-amber-900/40 text-amber-500/60' : 'bg-emerald-950/20 border-emerald-900/40 text-emerald-400'}`}>
                {isConfigFile ? t("ui_icon_gear") : t("ui_icon_package")}
              </div>
            )}

            {/* Name Display/Input */}
            {node.assignedModName ? (
              <span className={`text-sm font-mono truncate ${isConfigFile ? 'text-amber-500/50 opacity-50' : 'text-cyan-400 font-bold'}`}>
                {isConfigFile ? node.assignedModName.replace(/^\[|\]$/g, '') : `[${node.assignedModName}]`}
              </span>
            ) : (
              <input 
                value={node.name}
                onChange={(e) => handleUpdateName(node.id, e.target.value)}
                className="bg-transparent border-b border-zinc-800 focus:border-cyan-500 outline-none text-sm font-mono text-zinc-300 transition-all flex-1 min-w-0 py-1"
                placeholder={node.type === "folder" ? "Folder Name..." : "File Pattern..."}
              />
            )}
          </div>

          {/* Dropdown for file assignment */}
          {activeDropdown === node.id && createPortal(
            <>
              <div className="fixed inset-0 z-[99998]" onClick={() => { setActiveDropdown(null); setSearchQuery(""); }} />
              <div className="fixed mt-2 w-72 max-h-80 overflow-y-auto custom-scrollbar bg-[#0f172a]/95 backdrop-blur-3xl border border-white/20 rounded-xl shadow-2xl z-[99999] flex flex-col py-2 animate-in fade-in zoom-in-95" style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
              }}>
                <input 
                  type="text" 
                  autoFocus 
                  placeholder="Search Artifacts..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="bg-white/5 border border-white/10 rounded-lg text-[10px] font-mono text-[var(--text)] px-3 py-2 mx-2 mb-2 outline-none focus:theme-border-accent"
                />
                
                {targetMod && (!searchQuery || targetMod.name.toLowerCase().includes(searchQuery.toLowerCase())) && (
                  <div className="px-2 mb-2">
                    <div className="flex flex-col theme-glass-inner rounded-md overflow-hidden border border-white/5 hover:border-white/20 transition-all group/item">
                      <div 
                        onClick={() => { handleAssignMod(node.id, targetMod); setActiveDropdown(null); setSearchQuery(""); }}
                        className="text-left px-2 py-2 text-[9px] font-mono text-[var(--text)] group-hover/item:theme-bg-accent group-hover/item:text-[var(--bg)] transition-colors truncate cursor-pointer leading-tight"
                        title={targetMod.name}
                      >
                        {targetMod.name}
                      </div>
                      {(targetMod.sub_type === 'TS4SCRIPT' || targetMod.sub_type === 'PACKAGE') && (
                        <div className="flex bg-black/20 text-[8px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {targetMod.sub_type !== 'TS4SCRIPT' && (
                            <div 
                              onClick={() => { handleAssignMod(node.id, targetMod, 'package'); setActiveDropdown(null); setSearchQuery(""); }}
                              className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white cursor-pointer border-r border-white/5"
                              title="Assign as .package"
                            >
                              .PKG
                            </div>
                          )}
                          {targetMod.sub_type !== 'PACKAGE' && (
                            <div 
                              onClick={() => { handleAssignMod(node.id, targetMod, 'ts4script'); setActiveDropdown(null); setSearchQuery(""); }}
                              className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white cursor-pointer"
                              title="Assign as .ts4script"
                            >
                              .SCRIPT
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {availableMods && availableMods.length > 0 && (
                  <>
                    <div className="px-4 py-1 text-[8px] font-black uppercase text-[var(--subtext)] opacity-50 tracking-widest mt-2 mb-1 border-t border-white/5 pt-2 shrink-0">
                      Available Family
                    </div>
                    <div className="flex flex-col gap-1 px-2">
                      {availableMods.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                        <div key={m.id} className="flex flex-col theme-glass-inner rounded-md overflow-hidden border border-white/5 hover:border-white/20 transition-all group/item">
                          <div 
                            onClick={() => { handleAssignMod(node.id, m); setActiveDropdown(null); setSearchQuery(""); }}
                            className="text-left px-2 py-2 text-[9px] font-mono text-[var(--text)] group-hover/item:theme-bg-accent group-hover/item:text-[var(--bg)] transition-colors truncate cursor-pointer leading-tight"
                            title={m.name}
                          >
                            {m.name}
                          </div>
                          {(m.sub_type === 'TS4SCRIPT' || m.sub_type === 'PACKAGE') && (
                            <div className="flex bg-black/20 text-[8px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {m.sub_type !== 'TS4SCRIPT' && (
                                <div 
                                  onClick={() => { handleAssignMod(node.id, m, 'package'); setActiveDropdown(null); setSearchQuery(""); }}
                                  className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white cursor-pointer border-r border-white/5"
                                  title="Assign as .package"
                                >
                                  .PKG
                                </div>
                              )}
                              {m.sub_type !== 'PACKAGE' && (
                                <div 
                                  onClick={() => { handleAssignMod(node.id, m, 'ts4script'); setActiveDropdown(null); setSearchQuery(""); }}
                                  className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white cursor-pointer"
                                  title="Assign as .ts4script"
                                >
                                  .SCRIPT
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>,
            document.body
          )}
          
          {/* Terminal Command Chips (Right Side) */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {node.type === "file" && availableMods && (
              <button
                onClick={() => setActiveDropdown(activeDropdown === node.id ? null : node.id)}
                className="px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 hover:border-cyan-500/50 rounded-lg text-[10px] font-mono text-cyan-400 uppercase tracking-wider transition-all"
              >
                + ASSIGN
              </button>
            )}
            
            {node.type === "folder" && (
              <>
                <button 
                  onClick={() => handleToggleShared(node.id)} 
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all ${
                    node.shared 
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400' 
                      : 'bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 text-zinc-500'
                  }`}
                >
                  🔗 {node.shared ? "SHARED" : "SHARE"}
                </button>
                <button 
                  onClick={() => handleAddFolder(node.id)} 
                  className="px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 hover:border-emerald-500/50 hover:text-emerald-400 rounded-lg text-[10px] font-mono text-zinc-400 uppercase tracking-wider transition-all"
                >
                  + DIR
                </button>
                <button 
                  onClick={() => handleAddFile(node.id)} 
                  className="px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 hover:border-blue-500/50 hover:text-blue-400 rounded-lg text-[10px] font-mono text-zinc-400 uppercase tracking-wider transition-all"
                >
                  + FILE
                </button>
              </>
            )}
            
            <button 
              onClick={() => handleDelete(node.id)} 
              className="px-3 py-1.5 bg-red-950/20 border border-red-900/40 hover:bg-red-500/20 hover:border-red-500/50 rounded-lg text-[10px] font-mono text-red-400 uppercase tracking-wider transition-all"
            >
              DEL
            </button>
          </div>
        </div>

        {/* Nested children with proper tree lines - TWO COLUMNS */}
        {node.type === "folder" && isExpanded && node.children && node.children.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-8 relative">
            <div className="absolute left-[0.75rem] top-0 bottom-0 w-px bg-zinc-700/50" />
            {node.children.map((child, idx) => 
              renderNode(child, depth + 1, idx === node.children!.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full theme-glass-panel backdrop-blur-md rounded-2xl p-6 border border-white/5 shadow-inner">
      <div className="flex justify-between items-center mb-2">
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-widest theme-text-accent">{t("structure_title")}</span>
          <span className="text-[10px] text-[var(--subtext)] font-bold opacity-60">{t("structure_subtitle")}</span>
        </div>
        <button onClick={() => handleAddFolder()} className="px-4 py-2 theme-glass-inner hover:theme-bg-accent hover:text-[var(--bg)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
          {t("structure_btn_add_root")}
        </button>
      </div>

      <div className="flex flex-col gap-2 w-full mt-2 min-h-[150px]">
        {structure.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center py-10">
            <span className="text-4xl mb-2 grayscale">📁</span>
            <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em]">{t("structure_no_structure")}</span>
          </div>
        ) : (
          structure.map(node => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
