import { useState } from "react";
import { useLexicon } from "./LexiconContext";

export interface StructureNode {
  id: string;
  name: string;
  type: "folder" | "file";
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
    const newFolder: StructureNode = { id: generateId(), name: "New Folder", type: "folder", children: [] };
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
    const newFile: StructureNode = { id: generateId(), name: "*.package", type: "file" };
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
        if (n.id === id) return { ...n, name };
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

  const renderNode = (node: StructureNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);

    return (
      <div key={node.id} className="flex flex-col gap-1 w-full" style={{ paddingLeft: `${depth > 0 ? 1.5 : 0}rem` }}>
        <div className="flex items-center gap-2 group p-2 rounded-xl border border-transparent hover:theme-border-accent hover:bg-white/5 transition-all">
          
          {node.type === "folder" ? (
            <button onClick={() => toggleExpand(node.id)} className="w-6 h-6 flex items-center justify-center rounded-lg theme-glass-inner hover:bg-white/10 transition-colors text-[10px] theme-text-accent shrink-0">
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center text-[10px] opacity-40 text-[var(--text)] shrink-0">
              📄
            </div>
          )}

          <input 
            value={node.name}
            onChange={(e) => handleUpdateName(node.id, e.target.value)}
            className="bg-transparent border-b border-transparent focus:border-white/30 outline-none text-xs font-mono text-[var(--text)] transition-colors w-48 py-1 shrink-0"
            placeholder={node.type === "folder" ? "Folder Name..." : "File Pattern..."}
          />

          {node.type === "file" && availableMods && (
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(activeDropdown === node.id ? null : node.id)}
                className="theme-glass-inner border border-white/10 rounded-lg text-[10px] font-mono text-[var(--text)] px-2 py-1 outline-none focus:theme-border-accent w-8 text-center cursor-pointer hover:bg-white/10 transition-colors"
                title="Insert Artifact Name"
              >
                +
              </button>
              
              {activeDropdown === node.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setActiveDropdown(null); setSearchQuery(""); }} />
                  <div className="absolute top-full left-0 mt-2 w-72 max-h-72 overflow-y-auto custom-scrollbar theme-glass-panel backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col py-2 animate-in fade-in zoom-in-95">
                    <input 
                      type="text" 
                      autoFocus 
                      placeholder="Search Artifacts..." 
                      value={searchQuery} 
                      onChange={e => setSearchQuery(e.target.value)} 
                      className="bg-white/5 border border-white/10 rounded-lg text-[10px] font-mono text-[var(--text)] px-3 py-2 mx-2 mb-2 outline-none focus:theme-border-accent"
                    />
                    
                    {targetMod && (!searchQuery || targetMod.name.toLowerCase().includes(searchQuery.toLowerCase())) && (
                      <div 
                        onClick={() => { handleUpdateName(node.id, targetMod.name + ".package"); setActiveDropdown(null); setSearchQuery(""); }}
                        className="text-left px-4 py-2.5 text-[10px] font-mono text-[var(--text)] hover:theme-bg-accent hover:text-[var(--bg)] transition-colors truncate cursor-pointer leading-tight"
                      >
                        {targetMod.name}.package
                      </div>
                    )}
                    {availableMods && availableMods.length > 0 && (
                      <>
                        <div className="px-4 py-1 text-[8px] font-black uppercase text-[var(--subtext)] opacity-50 tracking-widest mt-2 mb-1 border-t border-white/5 pt-2 shrink-0">
                          Available Family
                        </div>
                        {availableMods.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                          <div 
                            key={m.id}
                            onClick={() => { handleUpdateName(node.id, m.name + ".package"); setActiveDropdown(null); setSearchQuery(""); }}
                            className="text-left px-4 py-2.5 text-[10px] font-mono text-[var(--text)] hover:theme-bg-accent hover:text-[var(--bg)] transition-colors truncate cursor-pointer leading-tight shrink-0"
                          >
                            {m.name}.package
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity ml-auto">
            {node.type === "folder" && (
              <>
                <button 
                  onClick={() => handleToggleShared(node.id)} 
                  className={`px-2 py-1 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1 ${node.shared ? 'theme-bg-accent text-[var(--bg)]' : 'bg-white/5 hover:bg-white/10 text-[var(--subtext)]'}`}
                  title="Share this folder across Addons/Twins"
                >
                  {node.shared ? "🔗 SHARED" : "🔗 SHARE"}
                </button>
                <button onClick={() => handleAddFolder(node.id)} className="px-2 py-1 bg-white/5 hover:theme-bg-accent hover:text-[var(--bg)] text-[10px] font-black uppercase rounded-lg transition-colors">
                  + Folder
                </button>
                <button onClick={() => handleAddFile(node.id)} className="px-2 py-1 bg-white/5 hover:theme-bg-accent hover:text-[var(--bg)] text-[10px] font-black uppercase rounded-lg transition-colors">
                  + File
                </button>
              </>
            )}
            <button onClick={() => handleDelete(node.id)} className="px-2 py-1 bg-red-500/20 hover:bg-red-500 hover:text-white text-red-300 text-[10px] font-black uppercase rounded-lg transition-colors">
              Delete
            </button>
          </div>
        </div>

        {node.type === "folder" && isExpanded && node.children && (
          <div className="flex flex-col gap-1 w-full relative">
            <div className="absolute left-[-1.1rem] top-0 bottom-4 w-px bg-white/10" />
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full theme-glass-panel backdrop-blur-md rounded-2xl p-6 border border-white/5 shadow-inner">
      <div className="flex justify-between items-center mb-2">
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-widest theme-text-accent">Structure Blueprint</span>
          <span className="text-[10px] text-[var(--subtext)] font-bold opacity-60">Define the exact folder layout required for deployment.</span>
        </div>
        <button onClick={() => handleAddFolder()} className="px-4 py-2 theme-glass-inner hover:theme-bg-accent hover:text-[var(--bg)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
          + Add Root Folder
        </button>
      </div>

      <div className="flex flex-col gap-2 w-full mt-2 min-h-[150px]">
        {structure.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center py-10">
            <span className="text-4xl mb-2 grayscale">📁</span>
            <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em]">No Structure Defined</span>
          </div>
        ) : (
          structure.map(node => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
