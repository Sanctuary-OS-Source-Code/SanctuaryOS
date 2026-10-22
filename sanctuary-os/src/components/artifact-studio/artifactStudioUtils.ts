import { StructureNode } from "../../ModStructureBuilder";

export type StudioTabId =
  | "overview"
  | "files"
  | "rules"
  | "family"
  | "structure"
  | "conflicts"
  | "release";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (val: any): boolean =>
  typeof val === "string" && UUID_REGEX.test(val.trim());

export function formatDisplayHash(rawHash?: string | null): string {
  if (!rawHash) return "";
  const str = String(rawHash).trim();
  if (/^dev_(sandbox|vault)_/i.test(str)) {
    return str.replace(/^dev_(sandbox|vault)_/i, "");
  }
  if (/^[0-9a-f]{32,}$/i.test(str)) {
    return `${str.slice(0, 8)}…${str.slice(-6)}`;
  }
  return str;
}

export function parseDLCList(val: any): string[] {
  if (!val) return [];
  const extract = (v: string): string[] => {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      return [v];
    } catch {
      return v
        .replace(/[\{\}\[\]]/g, "")
        .split(",")
        .map((s: string) => s.replace(/^"/, "").replace(/"$/, "").trim())
        .filter(Boolean);
    }
  };
  if (Array.isArray(val)) {
    return val.flatMap((item) => (typeof item === "string" ? extract(item) : String(item))).filter(Boolean);
  }
  if (typeof val === "string") {
    return extract(val);
  }
  return [];
}

export function flattenStructureNodesToPaths(nodes: StructureNode[], prefix = ""): string[] {
  if (!Array.isArray(nodes)) return [];
  const paths: string[] = [];
  for (const node of nodes) {
    if (!node || !node.name) continue;
    const cleanName = node.name.replace(/^\[|\]$/g, "").trim();
    if (!cleanName) continue;
    const currentPath = prefix ? `${prefix}/${cleanName}` : cleanName;
    if (node.type === "folder" || (node as any).node_type === "folder") {
      paths.push(currentPath);
      if (Array.isArray(node.children) && node.children.length > 0) {
        paths.push(...flattenStructureNodesToPaths(node.children, currentPath));
      }
    }
  }
  return Array.from(new Set(paths));
}

export async function fetchAllTableRows(
  supabaseClient: any,
  table: string,
  selectCols: string,
  orderBy?: string
): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    let query = supabaseClient.from(table).select(selectCols);
    if (orderBy) {
      query = query.order(orderBy, { ascending: true });
    }
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export function buildFamilyHierarchy(
  relationships: Array<{
    id?: string;
    parent_id: string;
    child_id: string;
    relationship_type?: string;
  }>,
  validModIds?: Set<string>
) {
  const directParentMap = new Map<string, { parentId: string; type: string; relId?: string }>();
  for (const r of relationships || []) {
    if (!r?.child_id || !r?.parent_id || r.child_id === r.parent_id) continue;
    if (validModIds && (!validModIds.has(r.child_id) || !validModIds.has(r.parent_id))) {
      continue;
    }
    const existing = directParentMap.get(r.child_id);
    // Prefer non-cyclic parent links
    if (!existing) {
      directParentMap.set(r.child_id, {
        parentId: r.parent_id,
        type: r.relationship_type || "addon",
        relId: r.id,
      });
    }
  }

  const getRootParentId = (modId: string): string => {
    let cur = modId;
    const visited = new Set<string>([cur]);
    while (directParentMap.has(cur)) {
      const next = directParentMap.get(cur)!.parentId;
      if (!next || visited.has(next)) break;
      if (validModIds && !validModIds.has(next)) break;
      visited.add(next);
      cur = next;
    }
    return cur;
  };

  const childToRootMap = new Map<
    string,
    { rootId: string; directParentId: string; type: string; relId?: string }
  >();
  const childrenByRootId = new Map<string, Set<string>>();

  for (const [childId, info] of directParentMap.entries()) {
    const rootId = getRootParentId(childId);
    if (rootId && rootId !== childId) {
      childToRootMap.set(childId, {
        rootId,
        directParentId: info.parentId,
        type: info.type,
        relId: info.relId,
      });
      if (!childrenByRootId.has(rootId)) {
        childrenByRootId.set(rootId, new Set());
      }
      childrenByRootId.get(rootId)!.add(childId);
    }
  }

  return {
    directParentMap,
    childToRootMap,
    childrenByRootId,
    getRootParentId,
  };
}


