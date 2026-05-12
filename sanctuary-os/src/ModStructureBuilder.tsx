import { useState } from "react";
import { useLexicon } from "./LexiconContext";

export interface StructureNode {
  id: string;
  name: string;
  type: "folder" | "file";
  children?: StructureNode[];
}

interface ModStructureBuilderProps {
  structure: StructureNode[];
  onChange: (newStructure: StructureNode[]) => void;
}

export default function ModStructureBuilder({ structure, onChange }: ModStructureBuilderProps) {
  const { t } = useLexicon();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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
            <button onClick={() => toggleExpand(node.id)} className="w-6 h-6 flex items-center justify-center rounded-lg bg-black/40 hover:bg-white/10 transition-colors text-[10px] theme-text-accent shrink-0">
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
          
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity ml-auto">
            {node.type === "folder" && (
              <>
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
    <div className="flex flex-col gap-4 w-full bg-black/40 backdrop-blur-md rounded-2xl p-6 border border-white/5 shadow-inner">
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
