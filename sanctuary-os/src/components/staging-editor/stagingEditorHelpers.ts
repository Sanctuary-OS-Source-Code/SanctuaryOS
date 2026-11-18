
export const PRIORITY_TIERS = [
  {
    id: "1_Core",
    labelKey: "staging_tier_1",
    fallback: "1: Core / Framework",
    iconColorClass: "text-[var(--success)]",
  },
  {
    id: "2_Gameplay",
    labelKey: "staging_tier_2",
    fallback: "2: Gameplay",
    iconColorClass: "text-cyan-400",
  },
  {
    id: "3_Standard",
    labelKey: "staging_tier_3",
    fallback: "3: Standard {Mod} / CC",
    iconColorClass: "text-[var(--accent)]",
  },
  {
    id: "4_Overrides",
    labelKey: "staging_tier_4",
    fallback: "4: Overrides (Load Last)",
    iconColorClass: "text-[var(--warning)]",
  },
];

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
