
export interface ResolvedStagingTier {
  id: string;
  labelKey: string;
  fallback: string;
  iconColorClass: string;
  priority: number;
}

const TIER_PALETTE = [
  "text-[var(--success)]",
  "text-cyan-400",
  "text-[var(--accent)]",
  "text-[var(--warning)]",
];

export const PRIORITY_TIERS: ResolvedStagingTier[] = [
  {
    id: "1_Core",
    labelKey: "staging_tier_1",
    fallback: "1: Core / Framework",
    iconColorClass: "text-[var(--success)]",
    priority: 1,
  },
  {
    id: "2_Gameplay",
    labelKey: "staging_tier_2",
    fallback: "2: Gameplay",
    iconColorClass: "text-cyan-400",
    priority: 2,
  },
  {
    id: "3_Standard",
    labelKey: "staging_tier_3",
    fallback: "3: Standard {Mod}",
    iconColorClass: "text-[var(--accent)]",
    priority: 3,
  },
  {
    id: "4_Overrides",
    labelKey: "staging_tier_4",
    fallback: "4: Overrides (Load Last)",
    iconColorClass: "text-[var(--warning)]",
    priority: 4,
  },
];

export function resolveSchemaPriorityTiers(activeGameSchema?: any): ResolvedStagingTier[] {
  const schemaTiers = activeGameSchema?.load_order?.priority_tiers;
  if (!Array.isArray(schemaTiers) || schemaTiers.length === 0) {
    return PRIORITY_TIERS;
  }
  const sorted = [...schemaTiers].sort(
    (a: any, b: any) => Number(a?.priority ?? 99) - Number(b?.priority ?? 99)
  );
  const mapped = sorted
    .map((tier: any, idx: number): ResolvedStagingTier | null => {
      const id = String(tier?.id || tier?.folder || `tier_${idx + 1}`).trim();
      if (!id) return null;
      const fallback = String(tier?.label || tier?.name || tier?.folder || id).trim();
      return {
        id,
        labelKey: String(tier?.label_key || `staging_tier_schema_${idx + 1}`),
        fallback,
        iconColorClass: TIER_PALETTE[idx % TIER_PALETTE.length],
        priority: Number(tier?.priority ?? idx + 1),
      };
    })
    .filter((t): t is ResolvedStagingTier => t !== null);
  return mapped.length > 0 ? mapped : PRIORITY_TIERS;
}

export function resolveKnownAuthor(mod: any, fallbackText: string): string {
  const explicit = String(mod?.master_author || mod?.author || "").trim();
  if (
    explicit &&
    explicit.toLowerCase() !== "unknown" &&
    explicit.toLowerCase() !== "unknown creator" &&
    explicit.toLowerCase() !== "unknown cc creator" &&
    explicit.toLowerCase() !== "unknown mason"
  ) {
    return explicit;
  }
  return fallbackText;
}
