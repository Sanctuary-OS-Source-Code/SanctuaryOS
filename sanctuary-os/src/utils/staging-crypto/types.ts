export interface StagedArtifactItem {
  id: string;
  dbId?: string;
  name: string;
  displayName?: string;
  hash?: string;
  author?: string;
  master_author?: string;
  url?: string;
  manifest_url?: string;
  version?: string;
  image_url?: string;
  category?: string;
  category_override?: string;
  type?: string;
  description?: string;
  compatible_versions?: string[];
  created_at?: string;
  updated_at?: string;
  status?: string;
  status_reason?: string;
  compliance_tier?: number;
  is_paid?: boolean;
  is_early_access?: boolean;
  requiredDLC?: string[];
  priority_tier?: string;
  load_order_index?: number;
  load_rules?: any[];
  ignored_conflicts?: string[];
  isLocalOverride?: boolean;
  isDependency?: boolean;
  dependencyOf?: string;
  asset_type?: "lexicon" | "chameleon" | "workbench_template";
  asset_id?: string | number;
  language?: string;
  theme_mode?: string;
  lexicon_type?: string;
}

export interface StagedCloudPayload {
  mode: "mod_queue" | "blueprint";
  blueprintName: string;
  blueprintCode?: string;
  targetDesktopBlueprint?: string;
  gameVersion?: string;
  notes?: string;
  autoEquip: boolean;
  items: StagedArtifactItem[];
  removedItems?: StagedArtifactItem[];
  loadOrderStrategy?: string;
  loadRules?: any;
  modTiers?: Record<string, string>;
  loadOrder?: string[];
  ignoredConflicts?: string[];
  isFullRigBlueprint?: boolean;
  stagedAt: string;
  sourceDevice: string;
}

export interface VaultCompanionArtifact {
  hash: string;
  dbId?: string;
  name: string;
  displayName?: string;
  author?: string;
  version?: string;
  status?: string;
  isEquipped?: boolean;
  hasUpdate?: boolean;
  newVersion?: string;
  url?: string;
  manifestUrl?: string;
  complianceTier?: number;
  category?: string;
  compatibleVersions?: string[];
  isScript?: boolean;
  alertType?: "critical" | "alert";
  alertReason?: string;
}

export interface VaultCompanionDesktopBlueprint {
  name: string;
  code?: string;
  isActive: boolean;
  modsCount: number;
  artifactIndices?: number[];
  artifacts?: VaultCompanionArtifact[];
}

export interface VaultCompanionSnapshot {
  activeBlueprintName?: string;
  gameVersion?: string;
  syncedAt: string;
  vaultCount?: number;
  criticalCount?: number;
  alertsCount?: number;
  updatesCount?: number;
  blueprintsCount?: number;
  criticalArtifacts?: VaultCompanionArtifact[];
  alertArtifacts?: VaultCompanionArtifact[];
  updateArtifacts?: VaultCompanionArtifact[];
  desktopBlueprints?: VaultCompanionDesktopBlueprint[];
  artifacts: VaultCompanionArtifact[];
}

export interface ResolvedStagedArtifact extends StagedArtifactItem {
  isOwned: boolean;
  localModName?: string;
  localHash?: string;
  selected: boolean;
}

export interface ResolvedStagedPayload {
  rowId: string;
  createdAt: string;
  payload: StagedCloudPayload;
  resolvedItems: ResolvedStagedArtifact[];
  isCompletedLocally?: boolean;
}

