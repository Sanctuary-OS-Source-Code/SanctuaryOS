import {
  DashboardStatTile,
  SidePanelFilterBar,
  ActionButton,
} from "../../shared";
import { renderCleanInlineText } from "../release-notes/ReleaseMarkdownViewer";
import {
  InteractiveForkingGuideView,
  BalancedCardColumns,
  renderDirectiveHeading,
} from "../InteractiveForkingGuideView";

export function WebForkingView({
  forkTab,
  setForkTab,
  forkModeIdx,
  setForkModeIdx,
  sqlSchemaTab,
  setSqlSchemaTab,
  customForkSchema,
}: any) {
  return (
    <InteractiveForkingGuideView
      schema={customForkSchema}
      forkTab={forkTab}
      setForkTab={setForkTab}
      forkModeIdx={forkModeIdx}
      setForkModeIdx={setForkModeIdx}
      sqlSchemaTab={sqlSchemaTab}
      setSqlSchemaTab={setSqlSchemaTab}
    />
  );
}


export function WebArchitectureView({
  t,
  td,
  archTab,
  setArchTab,
  customArchSchema,
}: any) {
    const pillarMeta = {
      p1: {
        icon: t("icon_memory", "memory"),
        badge: t("dir_arch_p1_badge", "ARCHITECTURE PILLAR 1 • CORE ENGINE & OPTICS"),
        heading: t(
          "dir_arch_p1_heading",
          "Tauri v2 Rust Kernel, Liquid Glass V3 & Lexicon Engine"
        ),
        summary: t(
          "dir_arch_p1_summary",
          "Sanctuary OS combines a zero-overhead native Rust backend with a GPU-pinned 3D refractive Liquid Glass interface and a 4-theme localization engine."
        ),
        cards: [
          {
            icon: t("icon_auto_awesome", "auto_awesome"),
            title: t("sd_arch_stack_c1_title", "Frontend & Liquid Glass V3 UI"),
            desc: t(
              "dir_arch_p1_b1",
              "Zero-Tearing Liquid Glass Engine (.glass-panel / .glass-surface) with 6 live Theme Forge optical sliders (Opacity, Blur, Saturation, Rim Light, Glare, Depth)"
            ),
          },
          {
            icon: t("icon_memory", "memory"),
            title: t("sd_arch_stack_c2_title", "Tauri v2 Native Rust Core"),
            desc: t(
              "dir_arch_p1_b2",
              "Native Tauri v2 Rust core: pelite PE executable version ripper, SQLite .sanctuary_cache.db mtime delta scanner, WebAuthn FIDO2 bridge & silent updater"
            ),
          },
          {
            icon: t("icon_view_sidebar", "view_sidebar"),
            title: t(
              "dir_walk_s1_title",
              "Global Shell: Sidebar, Top Control Capsule & Telemetry Toast"
            ),
            desc: t(
              "dir_arch_p1_b3",
              "Unified Top-Right Control Capsule, context-aware Sidebar & transient bottom-right System Telemetry Toast opening System Log History"
            ),
          },
          {
            icon: t("icon_translate", "translate"),
            title: t("sd_roadmap_p6_title", "Chameleon & Lexicon Protocols"),
            desc: t(
              "dir_arch_p1_b4",
              "Quota-protected Zustand state engine + Sparse Delta Lexicon Engine V2 (en-default, en-sanctuary & community override packs)"
            ),
          },
        ],
      },
      p2: {
        icon: t("icon_hub", "hub"),
        badge: t(
          "dir_arch_p2_badge",
          "ARCHITECTURE PILLAR 2 • FEDERATION & STATIC EDGE"
        ),
        heading: t(
          "dir_arch_p2_heading",
          "Decoupled Hub-and-Spoke Cloud, Static Edge & Standalone Mode"
        ),
        summary: t(
          "dir_arch_p2_summary",
          "Separates global SSO and baseline security on the Core Hub from community-owned Spoke databases, serverless creator manifest polling, and 1-file standalone forks."
        ),
        cards: [
          {
            icon: t("icon_hub", "hub"),
            title: t(
              "sd_arch_stack_c3_title",
              "Core OS Hub vs. Community Spoke DBs"
            ),
            desc: t(
              "dir_arch_p2_b1",
              "Core OS Hub (schema_os.sql) governs global SSO auth, FIDO2 passkeys, hardware_bans, sanctuary_schemas, keeper_heuristic_signatures & system_directives"
            ),
          },
          {
            icon: t("icon_storage", "storage"),
            title: t(
              "sd_fork_arch_spoke_title",
              "Community Spoke DB (schema.sql — Wayfinder)"
            ),
            desc: t(
              "dir_arch_p2_b2",
              "Community Game Spokes (schema.sql — 52 tables) are 100% owned by each game's Wayfinder with zero email/credential bleed and unilateral Cut the Cord severance"
            ),
          },
          {
            icon: t("icon_call_split", "call_split"),
            title: t(
              "sd_fork_standalone_hero_title",
              "Launch an Independent Standalone Fork with 1 Database"
            ),
            desc: t(
              "dir_arch_p2_b3",
              "Single-File Standalone Fork mode (src/supabase.ts) runs the entire OS against a single schema.sql database with zero Edge Functions"
            ),
          },
          {
            icon: t("icon_cloud_done", "cloud_done"),
            title: t(
              "sd_arch_vault_c3_title",
              "Decentralized Static Edge Polling (.sanctuary.manifest.json)"
            ),
            desc: t(
              "dir_arch_p2_b4",
              "Decentralized Static Edge Polling (.sanctuary.manifest.json & .sanctuary.override.json) delivers creator updates and atomic_logic via direct HTTP GET without central DB lock-in"
            ),
          },
        ],
      },
      p3: {
        icon: t("icon_inventory_2", "inventory_2"),
        badge: t("dir_arch_p3_badge", "ARCHITECTURE PILLAR 3 • {VAULT}, AIRGAP & DEFENSE"),
        heading: t(
          "dir_arch_p3_heading",
          "Symlink Airgap 2.5, Topological Compiler, FIDO2 & Malware Lockdown"
        ),
        summary: t(
          "dir_arch_p3_summary",
          "Protects your game installation and accounts via zero-copy symlink projection, hardlink Time Capsules, FIDO2 WebAuthn passkeys, and full-OS malware quarantine."
        ),
        cards: [
          {
            icon: t("icon_inventory_2", "inventory_2"),
            title: t(
              "sd_arch_vault_c2_title",
              "Symlink Airgap 2.5 & Dynamic Config Watcher"
            ),
            desc: t("dir_arch_p3_b1", "Symlink Airgap 2.5 projects {mods} from {Vault}/{Mods}/ into the live game folder, grouping multi-file {mod} suites into expandable Parent Cards"),
          },
          {
            icon: t("icon_layers", "layers"),
            title: t(
              "sd_arch_vault_c4_title",
              "Topological Load Order Compiler"
            ),
            desc: t(
              "dir_arch_p3_b2",
              "Schema-Driven Load Order Compiler (folder_priority + dynamic manifest, manifest_list, numeric_prefix, timestamp) with topological cycle breaking"
            ),
          },
          {
            icon: t("icon_construction", "construction"),
            title: t("sd_roadmap_p7_title", "Core Architecture, {Backups} Compression & Windows MSI Pipeline"),
            desc: t("dir_arch_p3_b3", "Reimagined 2-Column {Citizen}'s Workbench (430+ settings at 60 FPS), No-Code Visual Template Builder, 2-Column Timeline Diff & Unified 3-Tile {Mod} Studio"),
          },
          {
            icon: t("icon_science", "science"),
            title: t(
              "sd_arch_logic_c3_title",
              "Homestead Lab 100% Nuke & 1v1 Stability"
            ),
            desc: t("dir_arch_p3_b4", "Homestead 100% Nuke & 1v1 Stability Lab + {Backups} Parallel Copy-on-Write (CoW) NTFS/POSIX hardlink snapshots with differential rollback"),
          },
          {
            icon: t("icon_passkey", "passkey"),
            title: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP {Vault}"),
            desc: t("dir_arch_p4_b2", "FIDO2 Passkey & TOTP Security {Vault} drawer locks Elevated Hubs until verified via Windows Hello, Touch ID, YubiKey, or Authenticator"),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t(
              "dir_walk_s7_c3_name",
              "Universal AV Quarantine & Threat Manifest"
            ),
            desc: t("dir_arch_p4_b4", "Full-OS Quarantine Lockdown drawer queues multi-file drops without freezing, shows Triggered By & Detection Source diagnostics, and enforces {Citizen}-signed Secure Shred"),
          },
        ],
      },
      p4: {
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        badge: t(
          "dir_arch_p4_badge",
          "ARCHITECTURE PILLAR 4 • GOVERNANCE, PASSKEYS & MALWARE LOCKDOWN"
        ),
        heading: t(
          "dir_arch_p4_heading",
          "6-Tier Clearance Matrix, 2-Column Hub Overviews, FIDO2 Passkeys & Malware Lockdown"
        ),
        summary: t(
          "dir_arch_p4_summary",
          "Enforces strict separation between Spoke and Core Hub clearances, hardware-backed WebAuthn Passkey gates, and full-OS Tier 5 Malware quarantine."
        ),
        cards: [
          {
            icon: t("icon_admin_panel_settings", "admin_panel_settings"),
            title: t(
              "dir_arch_p4_c1_title",
              "6-Tier Clearance Hierarchy ({Citizen} to Keeper)"
            ),
            desc: t(
              "dir_arch_p4_c1_desc",
              "Decouples Game Spoke roles ({Citizen}, Verified {Mason}, Architect, Oversight, Wayfinder) from Global Core OS Hub roles (Keeper)."
            ),
          },
          {
            icon: t("icon_space_dashboard", "space_dashboard"),
            title: t(
              "dir_arch_p4_c2_title",
              "Standardized 2-Column Recent & Anomalies Hub Overviews"
            ),
            desc: t(
              "dir_arch_p4_c2_desc",
              "Every Elevated Hub opens to a 2-column Recent and Anomalies overview surfacing live schema/lexicon edits and actionable configuration alerts."
            ),
          },
          {
            icon: t("icon_passkey", "passkey"),
            title: t(
              "dir_arch_p4_c3_title",
              "FIDO2 Passkey & TOTP Security {Vault}"
            ),
            desc: t(
              "dir_arch_p4_c3_desc",
              "Hardware-bound WebAuthn Passkeys (Windows Hello, Touch ID, YubiKey) and TOTP gates protect Elevated Hubs inside a right-hand Security {Vault} drawer."
            ),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t(
              "dir_arch_p4_c4_title",
              "Dual-Tier Heuristic Scanner & Quarantine Lockdown"
            ),
            desc: t(
              "dir_arch_p4_c4_desc",
              "Merges Bytecode Hound Core + Spoke rules with Zlib/Zstd decompression to lock the OS shell on Tier 5 Malware and enforce a {Citizen}-signed Secure Shred."
            ),
          },
        ],
      },
    };

    const defaultPillar = (pillarMeta as any)[archTab] || pillarMeta.p1;
    const customArchTab = customArchSchema?.tabs?.find(
      (tab: any) => tab.id === archTab
    );
    const customArchCard = customArchTab?.cards?.[0];
    const activePillar = customArchCard
      ? {
          icon: customArchCard.icon || defaultPillar.icon,
          badge: td(customArchCard.overline || defaultPillar.badge),
          heading: td(customArchCard.title || defaultPillar.heading),
          summary: td(customArchCard.desc || defaultPillar.summary),
          cards: (customArchCard.subCards || []).map((sc: any) => ({
            icon: sc.icon || defaultPillar.icon,
            title: td(sc.title || ""),
            desc: td(sc.desc || ""),
          })),
        }
      : defaultPillar;

    const archPillarDefs = [
      {
        id: "p1" as const,
        defaultIcon: t("icon_memory", "memory"),
        defaultLabel: t("dir_ar_t1_lbl", "PILLAR 1"),
        defaultValue: t("dir_ar_t1_val", "Core & Glass"),
      },
      {
        id: "p2" as const,
        defaultIcon: t("icon_hub", "hub"),
        defaultLabel: t("dir_ar_t2_lbl", "PILLAR 2"),
        defaultValue: t("dir_ar_t2_val", "Hub & Spokes"),
      },
      {
        id: "p3" as const,
        defaultIcon: t("icon_shield", "shield"),
        defaultLabel: t("dir_ar_t3_lbl", "PILLAR 3"),
        defaultValue: t("dir_ar_t3_val", "{Vault} & {Lab}"),
      },
      {
        id: "p4" as const,
        defaultIcon: t("icon_admin_panel_settings", "admin_panel_settings"),
        defaultLabel: t("dir_ar_t4_lbl", "PILLAR 4"),
        defaultValue: t("dir_ar_t4_val", "6-Tier & AV"),
      },
    ];

    return (
      <div className="flex flex-col gap-6">
        {/* 4 Pillar Tiles (Responsive SidePanel Filter Grid) */}
        <SidePanelFilterBar className="sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {archPillarDefs.map((pDef) => {
            const matchedTab = customArchSchema?.tabs?.find(
              (tb: any) => tb.id === pDef.id
            );
            const resolvedIcon = matchedTab?.icon
              ? t(`icon_${matchedTab.icon}`, matchedTab.icon)
              : pDef.defaultIcon;
            return (
              <DashboardStatTile
                key={pDef.id}
                variant="filter"
                className="!w-full"
                icon={resolvedIcon}
                label={
                  matchedTab?.label ? td(matchedTab.label) : pDef.defaultLabel
                }
                number={
                  matchedTab?.value ? td(matchedTab.value) : pDef.defaultValue
                }
                colorClass="text-[var(--accent)]"
                isActive={archTab === pDef.id}
                onClick={() => setArchTab(pDef.id)}
              />
            );
          })}
        </SidePanelFilterBar>

        {/* Clean 3-Tier Hero Container */}
        <div className="relative glass-panel rounded-2xl p-5 flex flex-col gap-4 min-w-0 overflow-hidden border !border-[color-mix(in_srgb,var(--text)_22%,transparent)]">
          <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[22px]">
                {activePillar.icon}
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap">
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {activePillar.icon}
              </span>
              <span>{t("active", "Active")}</span>
            </span>
          </div>

          <div className="flex flex-col gap-1 mt-0.5 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)] break-words">
              {activePillar.badge}
            </span>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--text)] leading-snug break-words [overflow-wrap:anywhere] m-0">
              {renderDirectiveHeading(activePillar.heading)}
            </h3>
            <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
              {renderCleanInlineText(activePillar.summary)}
            </p>
          </div>

          <BalancedCardColumns
            items={activePillar.cards}
            columns={2}
            className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
            renderItem={(c: any, idx: any) => (
              <div
                key={`${c.title}-${idx}`}
                className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                    {c.icon}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug min-w-0 flex-1 break-words [overflow-wrap:anywhere] m-0">
                    {renderDirectiveHeading(c.title)}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                  {renderCleanInlineText(c.desc)}
                </p>
              </div>
            )}
          />
        </div>
      </div>
    );
}


export function WebProtocolsView({
  t,
  td,
  protoTab,
  setProtoTab,
  protoRoleIdx,
  setProtoRoleIdx,
  protoCompIdx,
  setProtoCompIdx,
  protoDomainIdx,
  setProtoDomainIdx,
  protoDrawerRef,
  scrollDrawerIntoCenter,
  elevatedRoles,
  customProtoSchema,
}: any) {
    const complianceTiers = [
      {
        badge: t("sd_proto_tier0_badge", "TIER 0 • PUBLIC SAFE"),
        title: t("sd_proto_tier0_title", "Standard Verified & General Audience"),
        desc: t("sd_proto_tier0_desc", "Eligible for full public indexing across The Nexus, shared Cloud {Blueprints} (SNCXXX), and public {Mason} Profiles. Full {Citizen} Support Desk access."),
        colorClass:
          "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]",
        textColor: "text-[var(--success)]",
        icon: t("icon_check_circle", "check_circle"),
      },
      {
        badge: t("sd_proto_tier12_badge", "TIERS 1–2 • EXPLICIT / ILLICIT"),
        title: t(
          "sd_proto_tier12_title",
          "Adult (NSFW) & Illicit Themes — Local Allowed, Public Scrubbed"
        ),
        desc: t("sd_proto_tier12_desc", "Permitted in local Vaults, Personal Rig transfers, and decentralized Static Edge manifests. Automatically scrubbed from public Nexus feeds and stripped from confirmed Cloud {Blueprints} (trg_purge_flagged_hash_from_blueprints). Equipping in the active {Blueprint} engages a non-destructive Support Lock on Community {Mod} Support with 1-click active-{Blueprint} unequip while Keeper OS Bug Reports remain open."),
        colorClass:
          "border-[color-mix(in_srgb,var(--info)_45%,transparent)] text-[var(--info)]",
        textColor: "text-[var(--info)]",
        icon: t("icon_visibility_off", "visibility_off"),
      },
      {
        badge: t("sd_proto_tier34_badge", "TIERS 3–4 • SEVERE / RESTRICTED"),
        title: t("sd_proto_tier34_title", "Extreme Violence & Taboo Content — Active {Blueprint} Support Lock"),
        desc: t("sd_proto_tier34_desc", "Permitted strictly within isolated local Vaults. Scrubbed from all public feeds and confirmed Cloud {Blueprints}. Equipping any Tier 3–4 {mod} inside the active {Blueprint} engages a non-destructive Support Lock on Community {Mod} Support (1-click active-{Blueprint} unequip without deleting {Vault} files), while Keeper OS Bug Reports remain accessible with zero {mod} telemetry."),
        colorClass:
          "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]",
        textColor: "text-[var(--warning)]",
        icon: t("icon_lock", "lock"),
      },
      {
        badge: t("sd_proto_tier5_badge", "TIER 5 • CONFIRMED MALWARE"),
        title: t(
          "sd_proto_tier5_title",
          "Zero-Choice OS Lockdown & Destructive Secure Shred"
        ),
        desc: t(
          "sd_proto_tier5_desc",
          "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables detected via SHA-256 DNA or Dual-Tier Rust Heuristics. Immediately halts game launch, isolates the file in Quarantine, locks the OS shell, and requires a Secure Shred signature."
        ),
        colorClass:
          "border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]",
        textColor: "text-[var(--danger)]",
        icon: t("icon_gpp_bad", "gpp_bad"),
      },
      {
        badge: t(
          "sd_proto_heuristics_badge",
          "DUAL-TIER RUST AV • BYTECODE & ARCHIVE SCAN"
        ),
        title: t(
          "sd_proto_heuristics_title",
          "Multi-Format Heuristic & Bytecode Scanner"
        ),
        desc: t(
          "sd_proto_heuristics_desc",
          "Combines global Core Heuristics (keeper_heuristic_signatures) and community Spoke Heuristics (heuristic_signatures) to inspect archives, native {mod} modules, script bundles, .dll, .exe, and compiled Python .pyc bytecode before execution."
        ),
        colorClass:
          "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]",
        textColor: "text-[var(--accent)]",
        icon: t("icon_security", "security"),
      },
      {
        badge: t(
          "sd_proto_nuclear_badge",
          "NUCLEAR OVERRIDE • PRIVACY-FIRST BAN LEDGER"
        ),
        title: t(
          "sd_proto_nuclear_title",
          "Decoupled Hardware Ban Ledger (hardware_bans)"
        ),
        desc: t(
          "sd_proto_nuclear_desc",
          "Sanctuary OS never tracks Hardware IDs on normal users. Clicking the System Preferences subtitle 5 times reveals the Nuclear Override for isolated local sandbox testing—engaging it records a one-way hardware hash in hardware_bans and permanently severs cloud network access."
        ),
        colorClass:
          "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]",
        textColor: "text-[var(--accent)]",
        icon: t("icon_policy", "policy"),
      },
    ];

    const protocolDomains = [
      {
        icon: t("icon_hub", "hub"),
        badge: t("sd_proto_d1_badge", "DOMAIN 1 • 7 PROTOCOLS"),
        title: t(
          "sd_proto_d1_title",
          "System Foundation, Hub-and-Spoke & Bilateral Sync"
        ),
        desc: t(
          "sd_proto_d1_desc",
          "Core kernel protocols governing first-boot reconnaissance, SANCTUARY-UPLINK:// spoke onboarding, Cut the Cord severance, 1-file standalone forks, and two-way .md directive sync."
        ),
        rules: [
          {
            icon: t("icon_explore", "explore"),
            title: t("sd_proto_d1_r1_title", "The Cartographer (First-Boot Recon)"),
            desc: t("sd_proto_d1_r1_desc", "Automated first-boot reconnaissance scanner that locates the Game Bin, live {Mods} directory, and external {Vault} archive path."),
          },
          {
            icon: t("icon_hub", "hub"),
            title: t(
              "sd_proto_d1_r2_title",
              "Turnkey Spoke Uplink (SANCTUARY-UPLINK://)"
            ),
            desc: t(
              "sd_proto_d1_r2_desc",
              "1-click onboarding handshake on game-gateway that validates all 52 tables in schema.sql, seeds global_network_status, and auto-provisions the Founding Wayfinder."
            ),
          },
          {
            icon: t("icon_link_off", "link_off"),
            title: t(
              "sd_proto_d1_r3_title",
              "Bilateral Severance ('Cut the Cord')"
            ),
            desc: t(
              "sd_proto_d1_r3_desc",
              "Self-service sovereignty protocol executable by either a Keeper or Wayfinder that logs to audit_logs, sets is_active = false, revokes all active Spoke Gateway Tokens, and permanently purges the sealed Vault credential from the Hub."
            ),
          },
          {
            icon: t("icon_call_split", "call_split"),
            title: t(
              "sd_proto_d1_r4_title",
              "Single-File Standalone Fork (src/supabase.ts)"
            ),
            desc: t(
              "sd_proto_d1_r4_desc",
              "Allows any community to fork Sanctuary OS against a single schema.sql Supabase project by editing only SANCTUARY_CONFIG in src/supabase.ts without Edge Functions."
            ),
          },
          {
            icon: t("icon_dns", "dns"),
            title: t(
              "sd_proto_d1_r5_title",
              "Full Hub & Spoke Federation Fork"
            ),
            desc: t(
              "sd_proto_d1_r5_desc",
              "Allows self-hosting a complete multi-game Hub (schema_os.sql + game-gateway Edge Function) connected to multiple independent child Spoke databases (schema.sql)."
            ),
          },
          {
            icon: t("icon_sync", "sync"),
            title: t(
              "sd_proto_d1_r6_title",
              "Bilateral Directives Sync & System Version Ripper"
            ),
            desc: t(
              "sd_proto_d1_r6_desc",
              "Two-way sync between local .md docs and Keepers Core (public.system_directives), plus in-process Rust pelite PE header version extraction and declarative Game Schemas."
            ),
          },
        ],
      },
      {
        icon: t("icon_inventory_2", "inventory_2"),
        badge: t("sd_proto_d2_badge", "DOMAIN 2 • 6 PROTOCOLS"),
        title: t("sd_proto_d2_title", "{Vault} Airgap, Static Edge & {Mod} Management"),
        desc: t("sd_proto_d2_desc", "Zero-copy symlink projection, decentralized creator manifest polling, multi-file parent suite grouping, 3-Tile {Mod} Studio, and the 2-column {Citizen}'s Workbench."),
        rules: [
          {
            icon: t("icon_inventory_2", "inventory_2"),
            title: t("sd_proto_d2_r1_title", "Symlink Airgap 2.5"),
            desc: t("sd_proto_d2_r1_desc", "Projects active {mods} from the isolated {Vault}/{Mods}/ archive into the live game directory via zero-copy OS symlinks in milliseconds."),
          },
          {
            icon: t("icon_cloud_done", "cloud_done"),
            title: t(
              "sd_proto_d2_r2_title",
              "Decentralized Static Edge Polling"
            ),
            desc: t("sd_proto_d2_r2_desc", "Binds a {mod}'s SHA-256 lineage in .sanctuary_cache.db and polls creator .sanctuary.manifest.json & .sanctuary.override.json endpoints directly via HTTP GET during Radar Sweeps."),
          },
          {
            icon: t("icon_folder_open", "folder_open"),
            title: t("sd_proto_d2_r3_title", "{Mod} Suite Parent Grouping"),
            desc: t("sd_proto_d2_r3_desc", "Automatically groups multi-file {mod} suites and companion module + script pairs into one clean Parent Card with an expandable Linked Modules drawer."),
          },
          {
            icon: t("icon_view_quilt", "view_quilt"),
            title: t("sd_proto_d2_r4_title", "Unified 3-Tile {Mod} Studio"),
            desc: t("sd_proto_d2_r4_desc", "Standardized 3-step publishing workflow (Details & Versions, Files & Folders, Rules & Upload) shared across {Mason} Workshop and Architect Console."),
          },
          {
            icon: t("icon_construction", "construction"),
            title: t("sd_proto_d2_r5_title", "2-Column {Citizen}'s Workbench & Timeline Diff"),
            desc: t(
              "sd_proto_d2_r5_desc",
              "60 FPS Visual Config Editor with category pills, Min/Max range steppers, No-Code Template Builder, and side-by-side Visual + Raw Monaco Timeline Diff."
            ),
          },
          {
            icon: t("icon_public", "public"),
            title: t(
              "sd_proto_d2_r6_title",
              "Integrated Side Browser Interception"
            ),
            desc: t("sd_proto_d2_r6_desc", "Intercepts archive containers, schema-supported {mod} modules, and .sanctuary.override.json downloads inside the built-in browser and routes them straight into the {Vault} scanner."),
          },
        ],
      },
      {
        icon: t("icon_radar", "radar"),
        badge: t("sd_proto_d3_badge", "DOMAIN 3 • 7 PROTOCOLS"),
        title: t("sd_proto_d3_title", "Stability, Load Order & Atomic Logic"),
        desc: t("sd_proto_d3_desc", "Schema-driven topological load order compilation, Casual vs. Advanced Conflict Radar, Highlander flavors, Twin bonds, Deep Yeet 2.0 cascades, Homestead Lab, and {Backups} hardlinks."),
        rules: [
          {
            icon: t("icon_layers", "layers"),
            title: t(
              "sd_proto_d3_r1_title",
              "Schema-Driven Load Order Compiler"
            ),
            desc: t(
              "sd_proto_d3_r1_desc",
              "Compiles priority via folder_priority (dynamic manifest + Sanctuary1–3 folders), manifest_list, numeric_prefix, or timestamp with DFS cycle breaking."
            ),
          },
          {
            icon: t("icon_radar", "radar"),
            title: t(
              "sd_proto_d3_r2_title",
              "Conflict Radar (Casual vs. Advanced Mode)"
            ),
            desc: t(
              "sd_proto_d3_r2_desc",
              "Casual Mode provides 1-click 'Pick a Winner' resolution for Severity 3 Tuning Overlaps; Advanced Mode unlocks directional Must Load After/Before rules."
            ),
          },
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: t(
              "sd_proto_d3_r3_title",
              "The Highlander Rule & Twin Cohesion"
            ),
            desc: t(
              "sd_proto_d3_r3_desc",
              "Automatically evicts rival Flavor files when equipping a chosen Flavor, and bidirectionally links companion module and script Twins."
            ),
          },
          {
            icon: t("icon_account_tree", "account_tree"),
            title: t(
              "sd_proto_d3_r4_title",
              "Chain-Link Dependencies & Deep Yeet 2.0"
            ),
            desc: t("sd_proto_d3_r4_desc", "Auto-equips required master {mods} when enabling an add-on, and halts for {Citizen} confirmation to cleanly cascade-unequip orphaned child {mods} on removal."),
          },
          {
            icon: t("icon_science", "science"),
            title: t(
              "sd_proto_d3_r5_title",
              "Homestead Lab (100% Nuke & 1v1 Arena)"
            ),
            desc: t("sd_proto_d3_r5_desc", "Strips active symlinks to test suspect {mods} or 1v1 conflicts in an isolated sandbox save while harvesting and PII-scrubbing crash logs."),
          },
          {
            icon: t("icon_history", "history"),
            title: t("sd_proto_d3_r6_title", "Hardlink {Backups} & Differential Rollback"),
            desc: t(
              "sd_proto_d3_r6_desc",
              "Snapshots World State (Saves/Settings) and Engine Core (Binaries) using zero-bloat OS hardlinks and restores modified bytes via differential comparison."
            ),
          },
        ],
      },
      {
        icon: t("icon_shield", "shield"),
        badge: t("sd_proto_d4_badge", "DOMAIN 4 • 6 PROTOCOLS"),
        title: t(
          "sd_proto_d4_title",
          "Security, FIDO2 Passkeys & Quarantine Lockdown"
        ),
        desc: t(
          "sd_proto_d4_desc",
          "Hardware WebAuthn FIDO2 gates, Dual-Tier Rust Heuristics, Full-OS Malware Quarantine Lockdown with Secure Shred, DEFCON 1 pre-patch shield, and decoupled hardware_bans."
        ),
        rules: [
          {
            icon: t("icon_passkey", "passkey"),
            title: t("sd_proto_d4_r1_title", "FIDO2 Passkey & TOTP Security {Vault}"),
            desc: t("sd_proto_d4_r1_desc", "Requires hardware-bound WebAuthn Passkeys or TOTP verification for all Elevated Clearances (Verified {Mason} through Keeper) inside the right-hand Security {Vault} drawer."),
          },
          {
            icon: t("icon_security", "security"),
            title: t(
              "sd_proto_d4_r2_title",
              "Dual-Tier Multi-Format Heuristic Scanner"
            ),
            desc: t(
              "sd_proto_d4_r2_desc",
              "Merges global Core Heuristics and community Spoke Heuristics to scan archives, raw binaries, UTF-16LE strings, and Python bytecode symbol chains."
            ),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t(
              "sd_proto_d4_r3_title",
              "Full-OS Quarantine Lockdown & Secure Shred"
            ),
            desc: t("sd_proto_d4_r3_desc", "Confirmed Tier 5 Malware locks the OS shell, displays Triggered By & Detection Source attribution, and requires a {Citizen} signature for multi-pass Secure Shredding."),
          },
          {
            icon: t("icon_visibility_off", "visibility_off"),
            title: t(
              "sd_proto_d4_r4_title",
              "Florida Compliance Tiers 1–4 & Auto-Purge"
            ),
            desc: t("sd_proto_d4_r4_desc", "Permits Tiers 1–4 in local Vaults while scrubbing public Nexus feeds and stripping flagged hashes from Cloud {Blueprints} automatically."),
          },
          {
            icon: t("icon_cell_tower", "cell_tower"),
            title: t(
              "sd_proto_d4_r5_title",
              "DEFCON 1 Pre-Patch Network Shield"
            ),
            desc: t("sd_proto_d4_r5_desc", "Real-time listener on global_network_status that intercepts game launches during breaking engine patches to prompt an emergency {Backups} backup."),
          },
          {
            icon: t("icon_policy", "policy"),
            title: t(
              "sd_proto_d4_r6_title",
              "Nuclear Override & Decoupled hardware_bans"
            ),
            desc: t(
              "sd_proto_d4_r6_desc",
              "Revealed by clicking the System Preferences subtitle 5 times; bypasses local quarantine while recording a one-way hash in hardware_bans to sever cloud access."
            ),
          },
        ],
      },
    ];

    const customProtoRolesTab = customProtoSchema?.tabs?.find(
      (tab: any) => tab.id === "roles"
    );
    const customProtoCompTab = customProtoSchema?.tabs?.find(
      (tab: any) => tab.id === "compliance"
    );
    const customProtoListTab = customProtoSchema?.tabs?.find(
      (tab: any) => tab.id === "list"
    );

    const effectiveProtoRoles =
      customProtoRolesTab && customProtoRolesTab.cards.length > 0
        ? customProtoRolesTab.cards.map((c: any) => ({
            short: td(c.title || ""),
            icon: c.icon,
            title: td(c.title || ""),
            badge: td(c.overline || c.footerMeta || ""),
            desc: td(c.desc || ""),
            requiresPasskey: c.status !== "citizen",
            subCards: (c.subCards || []).map((sc: any) => ({
              ...sc,
              title: td(sc.title || ""),
              desc: td(sc.desc || ""),
            })),
          }))
        : elevatedRoles;

    const effectiveComplianceTiers =
      customProtoCompTab && customProtoCompTab.cards.length > 0
        ? customProtoCompTab.cards.map((c: any, idx: any) => ({
            badge: td(c.overline || c.badge || ""),
            title: td(c.title || ""),
            desc: td(c.desc || ""),
            colorClass:
              complianceTiers[idx]?.colorClass ||
              "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]",
            textColor: complianceTiers[idx]?.textColor || "text-[var(--accent)]",
            icon: c.icon || complianceTiers[idx]?.icon || t("icon_shield", "shield"),
          }))
        : complianceTiers;

    const effectiveProtocolDomains =
      customProtoListTab && customProtoListTab.cards.length > 0
        ? customProtoListTab.cards.map((c: any) => ({
            icon: c.icon,
            badge: td(c.overline || c.badge || ""),
            title: td(c.title || ""),
            desc: td(c.desc || ""),
            rules: (c.subCards || []).map((sc: any) => ({
              icon: sc.icon,
              title: td(sc.title || ""),
              desc: td(sc.desc || ""),
            })),
          }))
        : protocolDomains;

    const totalProtoRules = effectiveProtocolDomains.reduce(
      (acc: any, d: any) => acc + (d.rules?.length || 0),
      0
    );

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Top Tiles (Responsive SidePanel Filter Grid) */}
        <SidePanelFilterBar className="sm:grid-cols-3 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={
              customProtoRolesTab?.icon
                ? t(
                    `icon_${customProtoRolesTab.icon}`,
                    customProtoRolesTab.icon
                  )
                : t("icon_admin_panel_settings", "admin_panel_settings")
            }
            label={`${effectiveProtoRoles.length} ${t("dir_guide_tiers_unit", "TIERS")}`}
            number={
              customProtoRolesTab?.value
                ? td(customProtoRolesTab.value)
                : t("dir_pr_t1_val", "Role Matrix")
            }
            colorClass="text-[var(--accent)]"
            isActive={protoTab === "roles"}
            onClick={() => setProtoTab("roles")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={
              customProtoCompTab?.icon
                ? t(`icon_${customProtoCompTab.icon}`, customProtoCompTab.icon)
                : t("icon_shield", "shield")
            }
            label={
              customProtoCompTab?.label
                ? td(customProtoCompTab.label)
                : t("dir_pr_t2_lbl", "TIERS 0–5")
            }
            number={
              customProtoCompTab?.value
                ? td(customProtoCompTab.value)
                : t("dir_pr_t2_val", "Safety & AV")
            }
            colorClass="text-[var(--accent)]"
            isActive={protoTab === "compliance"}
            onClick={() => setProtoTab("compliance")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={
              customProtoListTab?.icon
                ? t(`icon_${customProtoListTab.icon}`, customProtoListTab.icon)
                : t("icon_policy", "policy")
            }
            label={`${totalProtoRules} ${t("dir_proto_rules_unit", "RULES")}`}
            number={
              customProtoListTab?.value
                ? td(customProtoListTab.value)
                : t("dir_pr_t3_val", "OS Protocols")
            }
            colorClass="text-[var(--accent)]"
            isActive={protoTab === "list"}
            onClick={() => setProtoTab("list")}
          />
        </SidePanelFilterBar>

        {/* Tab 1: 6-Tier Role Matrix (Single-Column Stacked Cards: Unselected Compact & Dimmed, Selected Expands In-Place) */}
        {protoTab === "roles" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveProtoRoles.map((role: any, rIdx: any) => {
              const isActive = protoRoleIdx === rIdx;

              return (
                <div
                  key={`${role.short}-${rIdx}`}
                  ref={isActive ? protoDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setProtoRoleIdx(rIdx);
                          scrollDrawerIntoCenter(protoDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setProtoRoleIdx(rIdx);
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 gap-2 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  <div
                    role={isActive ? "button" : undefined}
                    tabIndex={isActive ? 0 : undefined}
                    onClick={isActive ? () => setProtoRoleIdx(-1) : undefined}
                    onKeyDown={
                      isActive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setProtoRoleIdx(-1);
                            }
                          }
                        : undefined
                    }
                    className={`flex flex-col gap-2 min-w-0 ${
                      isActive ? "cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center md:items-start justify-between gap-2.5 min-w-0">
                      <div className="flex items-center md:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors ${
                            isActive
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] group-hover:text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {role.icon}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span
                            className={`text-[10px] font-black uppercase tracking-[0.18em] leading-snug break-words [overflow-wrap:anywhere] ${
                              isActive
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)]"
                            }`}
                          >
                            {role.badge}
                          </span>
                          <h3 className="hidden md:block text-base font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                            {renderDirectiveHeading(role.title)}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                          <span
                            className={`material-symbols-outlined !text-[12px] ${
                              role.requiresPasskey
                                ? "text-[var(--warning)]"
                                : "text-[var(--success)]"
                            }`}
                          >
                            {role.requiresPasskey
                              ? t("icon_passkey", "passkey")
                              : t("icon_check_circle", "check_circle")}
                          </span>
                          <span>
                            {role.requiresPasskey
                              ? t("auth_passkey_badge_fido", "FIDO2 Passkey")
                              : t("role_citizen", "{Citizen}")}
                          </span>
                        </span>
                        <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {isActive
                              ? t("icon_expand_less", "expand_less")
                              : t("icon_expand_more", "expand_more")}
                          </span>
                        </span>
                      </div>
                    </div>

                    <h3 className="md:hidden text-sm font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                      {renderDirectiveHeading(role.title)}
                    </h3>
                  </div>

                  {isActive && (
                    <div className="flex flex-col gap-4 min-w-0 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed break-words [overflow-wrap:anywhere] m-0">
                        {renderCleanInlineText(role.desc)}
                      </p>
                      {(role as any).subCards?.length > 0 && (
                        <BalancedCardColumns
                          items={(role as any).subCards as any[]}
                          columns={2}
                          className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          renderItem={(sc: any, scIdx: number) => (
                            <div
                              key={`${sc.id || scIdx}`}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                                  {sc.icon ||
                                    t("icon_check_circle", "check_circle")}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--text)] leading-snug min-w-0 flex-1 break-words [overflow-wrap:anywhere] m-0">
                                  {renderDirectiveHeading(sc.title)}
                                </h4>
                              </div>
                              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                                {renderCleanInlineText(sc.desc)}
                              </p>
                            </div>
                          )}
                        />
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] min-w-0">
                        <ActionButton
                          variant="glass"
                          className="shrink-0"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={protoRoleIdx <= 0}
                          onClick={() => {
                            setProtoRoleIdx((prev: any) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_tier", "Previous Tier")}
                        </ActionButton>
                        <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate min-w-0 flex-1 text-center">
                          {role.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          className="shrink-0"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={
                            protoRoleIdx >= effectiveProtoRoles.length - 1
                          }
                          onClick={() => {
                            setProtoRoleIdx((prev: any) =>
                              Math.min(
                                effectiveProtoRoles.length - 1,
                                prev + 1
                              )
                            );
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_next_tier", "Next Tier")}
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Compliance Tiers 0–5 & Heuristics Defense Matrix (Single-Column Stacked Cards: Unselected Compact & Dimmed, Selected Expands In-Place) */}
        {protoTab === "compliance" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveComplianceTiers.map((tier: any, cIdx: any) => {
              const isActive = protoCompIdx === cIdx;

              return (
                <div
                  key={`${tier.badge}-${cIdx}`}
                  ref={isActive ? protoDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setProtoCompIdx(cIdx);
                          scrollDrawerIntoCenter(protoDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setProtoCompIdx(cIdx);
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 gap-2 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  <div
                    role={isActive ? "button" : undefined}
                    tabIndex={isActive ? 0 : undefined}
                    onClick={isActive ? () => setProtoCompIdx(-1) : undefined}
                    onKeyDown={
                      isActive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setProtoCompIdx(-1);
                            }
                          }
                        : undefined
                    }
                    className={`flex flex-col gap-2 min-w-0 ${
                      isActive ? "cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex items-center sm:items-start justify-between gap-2.5 sm:gap-3 min-w-0">
                      <div className="flex items-center sm:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors ${tier.textColor}`}
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {tier.icon}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span
                            className={`text-[10px] font-black uppercase tracking-[0.18em] leading-snug break-words [overflow-wrap:anywhere] ${
                              isActive ? tier.textColor : "text-[var(--subtext)]"
                            }`}
                          >
                            {tier.badge}
                          </span>
                          <h3 className="hidden sm:block text-base font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                            {renderDirectiveHeading(tier.title)}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                          <span className={`material-symbols-outlined !text-[12px] ${tier.textColor}`}>
                            {tier.icon}
                          </span>
                          <span>{tier.badge.split("•")[0].trim()}</span>
                        </span>
                        <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {isActive
                              ? t("icon_expand_less", "expand_less")
                              : t("icon_expand_more", "expand_more")}
                          </span>
                        </span>
                      </div>
                    </div>

                    <h3 className="sm:hidden text-sm font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                      {renderDirectiveHeading(tier.title)}
                    </h3>
                  </div>

                  {isActive && (
                    <div className="flex flex-col gap-4 min-w-0 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed break-words [overflow-wrap:anywhere] m-0">
                        {renderCleanInlineText(tier.desc)}
                      </p>
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] min-w-0">
                        <ActionButton
                          variant="glass"
                          className="shrink-0"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={protoCompIdx <= 0}
                          onClick={() => {
                            setProtoCompIdx((prev: any) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_tier", "Previous Tier")}
                        </ActionButton>
                        <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate min-w-0 flex-1 text-center">
                          {tier.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          className="shrink-0"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={
                            protoCompIdx >=
                            effectiveComplianceTiers.length - 1
                          }
                          onClick={() => {
                            setProtoCompIdx((prev: any) =>
                              Math.min(
                                effectiveComplianceTiers.length - 1,
                                prev + 1
                              )
                            );
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_next_tier", "Next Tier")}
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: 32 OS Protocols Organized into 4 Interactive Domain Cards (Single-Column Stacked Cards: Unselected Compact & Dimmed, Selected Expands In-Place) */}
        {protoTab === "list" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveProtocolDomains.map((dom: any, dIdx: any) => {
              const isActive = protoDomainIdx === dIdx;

              return (
                <div
                  key={dom.badge}
                  ref={isActive ? protoDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setProtoDomainIdx(dIdx);
                          scrollDrawerIntoCenter(protoDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setProtoDomainIdx(dIdx);
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 gap-2 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  <div
                    role={isActive ? "button" : undefined}
                    tabIndex={isActive ? 0 : undefined}
                    onClick={
                      isActive ? () => setProtoDomainIdx(-1) : undefined
                    }
                    onKeyDown={
                      isActive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setProtoDomainIdx(-1);
                            }
                          }
                        : undefined
                    }
                    className={`flex flex-col gap-2 min-w-0 ${
                      isActive ? "cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center md:items-start justify-between gap-2.5 min-w-0">
                      <div className="flex items-center md:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors ${
                            isActive
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] group-hover:text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {dom.icon}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span
                            className={`text-[10px] font-black uppercase tracking-[0.18em] leading-snug break-words ${
                              isActive
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)]"
                            }`}
                          >
                            {dom.badge}
                          </span>
                          <h3 className="hidden md:block text-base font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                            {renderDirectiveHeading(dom.title)}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                          <span
                            className={`material-symbols-outlined !text-[12px] ${
                              isActive
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)]"
                            }`}
                          >
                            {isActive
                              ? t("icon_check_circle", "check_circle")
                              : dom.icon}
                          </span>
                          <span>{dom.badge.split("•")[0].trim()}</span>
                        </span>
                        <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {isActive
                              ? t("icon_expand_less", "expand_less")
                              : t("icon_expand_more", "expand_more")}
                          </span>
                        </span>
                      </div>
                    </div>

                    <h3 className="md:hidden text-sm font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                      {renderDirectiveHeading(dom.title)}
                    </h3>
                  </div>

                  {isActive && (
                    <div className="flex flex-col gap-4 pt-3.5 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                        {renderCleanInlineText(dom.desc)}
                      </p>
                      <BalancedCardColumns
                        items={dom.rules}
                        columns={2}
                        renderItem={(r: any, rIdx: any) => (
                          <div
                            key={`${r.title}-${rIdx}`}
                            className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                                {r.icon}
                              </span>
                              <h4 className="text-sm font-bold text-[var(--text)] leading-snug min-w-0 flex-1 break-words [overflow-wrap:anywhere] m-0">
                                {renderDirectiveHeading(r.title)}
                              </h4>
                            </div>
                            <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                              {renderCleanInlineText(r.desc)}
                            </p>
                          </div>
                        )}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <ActionButton
                          variant="glass"
                          className="shrink-0"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={protoDomainIdx <= 0}
                          onClick={() => {
                            setProtoDomainIdx((prev: any) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_rule", "Previous Domain")}
                        </ActionButton>
                        <span className="hidden sm:block min-w-0 flex-1 text-center text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                          {dom.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          className="shrink-0"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={
                            protoDomainIdx >=
                            effectiveProtocolDomains.length - 1
                          }
                          onClick={() => {
                            setProtoDomainIdx((prev: any) =>
                              Math.min(
                                effectiveProtocolDomains.length - 1,
                                prev + 1
                              )
                            );
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_next_rule", "Next Domain")}
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
}
