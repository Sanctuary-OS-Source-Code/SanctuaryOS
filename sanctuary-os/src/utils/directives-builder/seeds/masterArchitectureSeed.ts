import type { DirectiveBuilderSchema, DirectiveBuilderCard } from "../types";
import { CURRENT_DIRECTIVE_SCHEMA_VERSION } from "../types";

export function buildMasterArchitectureSchema(
  t: (key: string, fallback?: string) => string,
  g: (txt: string) => string,
  elevatedRolesCards: DirectiveBuilderCard[]
): DirectiveBuilderSchema {
    return {
      slug: "master_architecture",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Master Architecture & Feature Blueprint"),
      summary: g(
        "Deep-dive interactive explorer into the Tauri v2 Rust core, Universal Master Schema, Code-Switch, Mirror Uplink, Symlink Airgap, Edge Pulse, Groundhog Sandbox, and Bytecode Hound."
      ),
      tabs: [
        {
          id: "p1",
          icon: t("icon_memory", "memory"),
          label: g("PILLAR 1"),
          value: g("Core & Glass"),
          cards: [
            {
              id: "arch_p1",
              icon: t("icon_memory", "memory"),
              overline: g("ARCHITECTURE PILLAR 1 • CORE ENGINE, OPTICS & STUDIOS"),
              badge: t("active", "Active"),
              title: g(
                "Tauri v2 Kernel, Liquid Glass Optics, Schema Forge & Code-Switch"
              ),
              footerMeta: "Tauri v2 • React 19 • Liquid Glass Optics • Win, Mac & Linux / SteamOS",
              desc: g(
                "Sanctuary OS combines a zero-overhead native Rust backend across Windows, macOS, and Linux / SteamOS (Deck Overdrive) with GPU-pinned Liquid Glass Optics, Universal Master Schema tooling, and the Code-Switch."
              ),
              subCards: [
                {
                  id: "arch_p1_c1",
                  icon: t("icon_auto_awesome", "auto_awesome"),
                  title: g("Liquid Glass Optics"),
                  desc: g(
                    "Zero-Tearing WebGL2 Liquid Glass Engine (.glass-panel / .glass-surface) with 6 live Theme Forge optical sliders (Opacity, Blur, Saturation, Rim Light, Glare, Depth), Per-Space Aesthetics, and responsive mobile selector pills."
                  ),
                },
                {
                  id: "arch_p1_c2",
                  icon: t("icon_memory", "memory"),
                  title: g("Deck Overdrive & Native Kernel"),
                  desc: g(
                    "Native Tauri v2 Rust core: Multi-Tier Version Ripper (PE, Info.plist, manifests, storefronts), Deck Overdrive Steam Deck controller + Proton compatdata/user_settings resolver, SQLite .sanctuary_cache.db delta scanner, WebAuthn FIDO2 bridge, and cross-platform auto-updater."
                  ),
                },
                {
                  id: "arch_p1_c3",
                  icon: t("icon_schema", "schema"),
                  title: g("Universal Master Schema"),
                  desc: g(
                    "Declarative Schema Forge JSON editor governing binaries, secondary install_routes, config_extensions watcher, topological DAG + slot_buckets load ordering, container TOC analyzers, database-driven public.taxonomy Categories, and exception matchers."
                  ),
                },
                {
                  id: "arch_p1_c4",
                  icon: t("icon_translate", "translate"),
                  title: g("Code-Switch"),
                  desc: g(
                    "21 Dynamic {Glossary} Tokens interpolated across 6,800+ keys with smart article grammar, Sparse Delta Override packs, Guided Icon Overrides, and 1-click auto-translation across 28+ languages."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p2",
          icon: t("icon_hub", "hub"),
          label: g("PILLAR 2"),
          value: g("Hub & Spokes"),
          cards: [
            {
              id: "arch_p2",
              icon: t("icon_hub", "hub"),
              overline: g("ARCHITECTURE PILLAR 2 • FEDERATION, SYNC & STATIC EDGE"),
              badge: t("active", "Active"),
              title: g(
                "Hub Federation, Mirror Uplink & Edge Pulse"
              ),
              footerMeta: "schema_os.sql • schema.sql • Edge Pulse • Mirror Uplink",
              desc: g(
                "Uses bundled codebase files as an offline baseline paired with Mirror Uplink cloud synchronization, community-owned Spoke DBs (Cut the Cord & SRK1 Relink), Echo Suppressor sync, and 6-provider Edge Pulse polling."
              ),
              subCards: [
                {
                  id: "arch_p2_c1",
                  icon: t("icon_hub", "hub"),
                  title: g("Core Hub & Spoke Sovereignty"),
                  desc: g(
                    "Core OS Hub (schema_os.sql) governs global SSO, FIDO2 passkeys, sanctuary_schemas, keeper_heuristic_signatures & system_directives; Spokes (schema.sql) own 100% of their 52 community tables."
                  ),
                },
                {
                  id: "arch_p2_c2",
                  icon: t("icon_sync", "sync"),
                  title: g("Mirror Uplink"),
                  desc: g(
                    "First-time launch and offline sessions boot from bundled .md, schema, and lexicon files; connected clients pull live updates via Mirror Uplink without requiring an app update."
                  ),
                },
                {
                  id: "arch_p2_c3",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("Edge Pulse & Direct Push"),
                  desc: g(
                    "6-provider 1-click OS Auto-Push (.sanctuary.manifest.json & catalog.json) and concurrent Rust HTTP GET polling with ETag/304 caching and automatic previous_hashes lineage rollover."
                  ),
                },
                {
                  id: "arch_p2_c4",
                  icon: t("icon_favorite", "favorite"),
                  title: g("Sovereign Covenants & Cut the Cord"),
                  desc: g(
                    "Readiness-gated Partner Spoke onboarding with mandatory Covenants, 0%-cut community donations, Stripe-verified Dev Builds, phrase-locked Cut the Cord severance, and SRK1 relink commitments."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p3",
          icon: t("icon_shield", "shield"),
          label: g("PILLAR 3"),
          value: g("{Vault} & Lab"),
          cards: [
            {
              id: "arch_p3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: g("ARCHITECTURE PILLAR 3 • {VAULT}, COMPILER & WORKBENCH"),
              badge: t("active", "Active"),
              title: g(
                "Symlink Airgap, Priority Compiler & Groundhog Sandbox"
              ),
              footerMeta: "Symlink Airgap • Priority Compiler • Groundhog Sandbox",
              desc: g(
                "Protects your game installation via Symlink Airgap, Priority Compiler & Conflict Radar 2.0, Live-Wire Workbench config editing, Groundhog Sandbox save-verified testing, and Time Capsule snapshots."
              ),
              subCards: [
                {
                  id: "arch_p3_c1",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: g("Symlink Airgap & Config Watcher"),
                  desc: g(
                    "Projects {mods} from {Vault}/{Mods}/ into live game folders and secondary install_routes while deduplicating stray root configs and syncing in-game config_extensions writes back to the {Vault}."
                  ),
                },
                {
                  id: "arch_p3_c2",
                  icon: t("icon_layers", "layers"),
                  title: g("Priority Compiler & Conflict Radar 2.0"),
                  desc: g(
                    "5-Tier Severity Matrix, 1-click 'Set Winner' priority tier assignment, The Highlander Rule swap prompts, and Schema-Driven Load Order compilation with topological cycle breaking."
                  ),
                },
                {
                  id: "arch_p3_c3",
                  icon: t("icon_tune", "tune"),
                  title: g("Live-Wire Workbench & Live-Wire Diff"),
                  desc: g(
                    "60 FPS 2-column Visual Config Editor with Category Pill Bar, Min/Max range steppers, No-Code Template Builder, and side-by-side [In-Game Engine Edit] Visual/Raw Diff."
                  ),
                },
                {
                  id: "arch_p3_c4",
                  icon: t("icon_science", "science"),
                  title: g("Groundhog Sandbox & Time Capsule"),
                  desc: g(
                    "Immortal Save-Verify-and-Rewind {Lab} isolation, Crash Autopsy log decoding, fullscreen PCM audio chimes, and zero-bloat Copy-on-Write OS hardlink snapshots with additive save restores."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p4",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          label: g("PILLAR 4"),
          value: g("6-Tier & AV"),
          cards: [
            {
              id: "arch_p4",
              icon: t("icon_admin_panel_settings", "admin_panel_settings"),
              overline: g("ARCHITECTURE PILLAR 4 • GOVERNANCE, PASSKEYS & MALWARE LOCKDOWN"),
              badge: t("active", "Active"),
              title: g(
                "Zero-Knowledge Seal, Echo Suppressor & Zero-Choice Lockdown"
              ),
              footerMeta: "6 Role Tiers • Zero-Knowledge Seal • Bytecode Hound",
              desc: g(
                "Enforces strict separation between Spoke and Core Hub clearances, hardware-backed Zero-Knowledge Seal passkey gates, Echo Suppressor alert sync, and Zero-Choice Lockdown quarantine."
              ),
              subCards: [
                {
                  id: "arch_p4_c1",
                  icon: t("icon_admin_panel_settings", "admin_panel_settings"),
                  title: g("6-Tier Clearance Hierarchy"),
                  desc: g(
                    "Decouples Game Spoke roles ({Citizen}, Verified {Mason}, Architect, Oversight, Wayfinder) from Global Core OS Hub roles (Keeper) with Pending Tier 1–4 compliance gating."
                  ),
                },
                {
                  id: "arch_p4_c2",
                  icon: t("icon_space_dashboard", "space_dashboard"),
                  title: g("Sub-Second Command Hubs & Echo Suppressor"),
                  desc: g(
                    "Every Elevated Hub loads sub-second into a 2-column Recent and Anomalies overview, while Echo Suppressor deduplicates dismissed alerts across all devices via Zero-PII AES-256-GCM sync."
                  ),
                },
                {
                  id: "arch_p4_c3",
                  icon: t("icon_passkey", "passkey"),
                  title: g("Zero-Knowledge Seal & Companion Handshake"),
                  desc: g(
                    "Hardware-bound WebAuthn Passkeys (Windows Hello, Touch ID, YubiKey), OWASP 600k auth, and live Web Push Companion Handshakes guard Elevated Hubs inside a right-hand Security {Vault}."
                  ),
                },
                {
                  id: "arch_p4_c4",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: g("Zero-Choice Lockdown & Bytecode Hound"),
                  desc: g(
                    "Merges Core + Spoke heuristics with Zlib/Zstd decompression to halt launches on Tier 5 Malware and lock the OS shell until a {Citizen}-signed Secure Shred."
                  ),
                },
              ],
            },
          ],
        },
      ],
    };
}
