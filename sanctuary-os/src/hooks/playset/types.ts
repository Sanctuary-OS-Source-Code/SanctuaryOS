export interface LoadOrderRule {
  id: string;
  modA: string;
  modB: string;
  type: "after" | "before";
}

export interface CompiledLoadOrderItem {
  rawMod: string;
  cleanName: string;
  displayName: string;
  index: number;
  tierFolder: string;
  tierId: string;
  tierLabel: string;
  tierPriority: number;
  previewPath: string;
  autoPromoted?: boolean;
}

export interface LoadOrderCompilationResult {
  items: CompiledLoadOrderItem[];
  cycles: { ruleIds: string[]; chain: string[] }[];
  strategy: string;
  manifestFile: string;
  direction: string;
  priorityTiers: { id: string; label: string; folder: string; priority: number }[];
}

