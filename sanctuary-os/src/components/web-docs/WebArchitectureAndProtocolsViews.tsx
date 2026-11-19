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
              "Community Game Spokes (schema.sql — 61 tables) are 100% owned by each game's Wayfinder with zero email/credential bleed and unilateral Cut the Cord severance"
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
          "Enforces strict separation between Spoke and Core Hub clearances, hardware-backed WebAuthn Passkey gates, and full-OS Tier 6 Malware quarantine."
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
              "Merges Bytecode Hound Core + Spoke rules with Zlib/Zstd decompression to lock the OS shell on Tier 6 Malware and enforce a {Citizen}-signed Secure Shred."
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
        badge: t("sd_proto_tier1_badge", "TIER 1 • LEGAL / DMCA HOLD"),
        title: t("sd_proto_tier1_title", "Statutory IP & Spoke-Routed DMCA Safe Harbor"),
        desc: t(
          "sd_proto_tier1_desc",
          "Applied upon valid 17 U.S.C. § 512 takedown notices or verified creator ownership disputes. Immediately suppresses public Nexus visibility and routes the notice directly to the sovereign Partner Spoke Hub (48h SLA) while Keepers Core appends a minimal compliance audit record (public.dmca_compliance_notices). Never deletes files from {Citizen} drives; counter-notices follow the 10–14 business day § 512(g)(3) restoration window."
        ),
        colorClass:
          "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]",
        textColor: "text-[var(--warning)]",
        icon: t("icon_gavel", "gavel"),
      },
      {
        badge: t("sd_proto_tier23_badge", "TIERS 2–3 • EXPLICIT / ILLICIT"),
        title: t(
          "sd_proto_tier23_title",
          "Explicit (T2) & Illicit Content (T3) — Local Allowed, Public Scrubbed"
        ),
        desc: t("sd_proto_tier23_desc", "Permitted in local Vaults, Personal Rig transfers, and decentralized Static Edge manifests. Automatically scrubbed from public Nexus feeds and stripped from confirmed Cloud {Blueprints} (trg_purge_flagged_hash_from_blueprints). Equipping in the active {Blueprint} engages a non-destructive Support Lock on Community {Mod} Support with 1-click active-{Blueprint} unequip while Keeper OS Bug Reports remain open."),
        colorClass:
          "border-[color-mix(in_srgb,var(--info)_45%,transparent)] text-[var(--info)]",
        textColor: "text-[var(--info)]",
        icon: t("icon_visibility_off", "visibility_off"),
      },
      {
        badge: t("sd_proto_tier45_badge", "TIERS 4–5 • SEVERE / PROHIBITED"),
        title: t("sd_proto_tier45_title", "Extreme Violence (T4) & Taboo / Prohibited (T5) — Support Lock"),
        desc: t("sd_proto_tier45_desc", "Permitted strictly within isolated local Vaults. Scrubbed from all public feeds and confirmed Cloud {Blueprints}. Equipping any Tier 1–5 or Unknown {mod} inside the active {Blueprint} engages a non-destructive Support Lock on Community {Mod} Support (1-click active-{Blueprint} unequip without deleting {Vault} files), while Keeper OS Bug Reports remain accessible with zero {mod} telemetry."),
        colorClass:
          "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]",
        textColor: "text-[var(--danger)]",
        icon: t("icon_lock", "lock"),
      },
      {
        badge: t("sd_proto_tier6_badge", "TIER 6 • CONFIRMED MALWARE"),
        title: t(
          "sd_proto_tier6_title",
          "Zero-Choice OS Lockdown & Destructive Secure Shred"
        ),
        desc: t(
          "sd_proto_tier6_desc",
          "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables (compliance_tier = 6) detected via SHA-256 DNA or Dual-Tier Rust Heuristics. Immediately halts game launch, isolates the file in Quarantine, locks the OS shell, and requires a {Citizen}-signed Secure Shred."
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
          "Sanctuary OS never tracks Hardware IDs on normal users. Clicking the System Preferences subtitle 5 times reveals the offline Nuclear Override toggle for isolated testing—engaging it severs cloud telemetry and stores an irreversible opt-in ledger only if explicitly submitted, while toggling it back OFF offline cleanly restores normal operation."
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
        badge: t("sd_proto_d1_badge", "DOMAIN 1 • 10 PROTOCOLS"),
        title: t(
          "sd_proto_d1_title",
          "Foundation, Federation & Sovereignty Protocols"
        ),
        desc: t(
          "sd_proto_d1_desc",
          "Cross-platform binary reconnaissance, Deck Overdrive & Proton resolution, Liquid Glass Optics, Universal Master Schema (27 presets), Code-Switch (7,300+ strings), Cut the Cord, sanctuary.fork.json forks, Zero-Copy Exodus, and Mirror Uplink."
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
              "1-click onboarding handshake on game-gateway that validates all 61 tables in schema.sql, seeds global_network_status, and auto-provisions the Founding Wayfinder."
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
              "Zero-Conflict Standalone Fork (sanctuary.fork.json)"
            ),
            desc: t(
              "sd_proto_d1_r4_desc",
              "Allows any community to fork Sanctuary OS against a single 61-table schema.sql Supabase project using sanctuary.fork.json + npm run fork:configure without upstream merge conflicts."
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
              "Allows self-hosting a complete multi-game Hub (schema_os.sql 28 tables + game-gateway Edge Function) connected to multiple independent child Spoke databases (schema.sql)."
            ),
          },
          {
            icon: t("icon_sync", "sync"),
            title: t(
              "sd_proto_d1_r6_title",
              "Bilateral Directives Sync & Binary Version Ripper"
            ),
            desc: t(
              "sd_proto_d1_r6_desc",
              "Two-way sync between local .md docs and Keepers Core (public.system_directives), plus in-process Rust pelite PE / Info.plist / manifest version extraction across 27 presets."
            ),
          },
          {
            icon: t("icon_sports_esports", "sports_esports"),
            title: t("sd_proto_d1_r7_title", "Deck Overdrive & Gatekeeper Clearance"),
            desc: t(
              "sd_proto_d1_r7_desc",
              "Unifies Steam Deck Gamescope/hidraw 60 FPS Virtual Pointer & Proton compatdata prefix launching alongside macOS Touch ID WebAuthn and com.apple.quarantine clearing."
            ),
          },
          {
            icon: t("icon_auto_awesome", "auto_awesome"),
            title: t("sd_proto_d1_r8_title", "Liquid Glass Optics & Per-Space Themes"),
            desc: t(
              "sd_proto_d1_r8_desc",
              "1:1 physical-pixel WebGL2 refraction with 7 bundled wallpapers, custom Spoke {Chameleon} packs, and responsive mobile liquid glass pills."
            ),
          },
          {
            icon: t("icon_translate", "translate"),
            title: t("sd_proto_d1_r9_title", "Code-Switch Lexicon Engine V2"),
            desc: t(
              "sd_proto_d1_r9_desc",
              "Auto-synced 7,300+-key Standard English baseline with Sparse Delta Override packs, 21 Dynamic {Glossary} Tokens, and Guided Icon Overrides."
            ),
          },
          {
            icon: t("icon_move_to_inbox", "move_to_inbox"),
            title: t("sd_proto_d1_r10_title", "Zero-Copy Exodus"),
            desc: t(
              "sd_proto_d1_r10_desc",
              "Out-of-tree MO2, Vortex, and staging setup importer with ByteHound screening, OS hardlink absorption, and automatic {Blueprint} profile reconstruction."
            ),
          },
        ],
      },
      {
        icon: t("icon_inventory_2", "inventory_2"),
        badge: t("sd_proto_d2_badge", "DOMAIN 2 • 10 PROTOCOLS"),
        title: t("sd_proto_d2_title", "{Vault} Airgap, Static Edge & {Mod} Pipeline"),
        desc: t("sd_proto_d2_desc", "Differential Rayon VFS projection, Static Edge polling, suite grouping, 3-Tile {Mod} Studio, Live-Wire Workbench, Browser Autoloader, Quartermaster, Rosetta Protocol, and Cloud-Sync Sentinel."),
        rules: [
          {
            icon: t("icon_inventory_2", "inventory_2"),
            title: t("sd_proto_d2_r1_title", "Symlink Airgap 2.5 (Differential VFS)"),
            desc: t("sd_proto_d2_r1_desc", "Projects active {mods} from {Vault}/{Mods}/ into live game directories via differential Rayon NTFS hardlink/junction & POSIX symlink reconciliation."),
          },
          {
            icon: t("icon_cloud_done", "cloud_done"),
            title: t(
              "sd_proto_d2_r2_title",
              "Decentralized Static Edge & Direct Push"
            ),
            desc: t("sd_proto_d2_r2_desc", "Binds SHA-256 lineage in .sanctuary_cache.db, polls .sanctuary.manifest.json & .sanctuary.override.json via HTTP GET, and pushes Ed25519-signed manifests to 6 providers including S3/R2."),
          },
          {
            icon: t("icon_folder_open", "folder_open"),
            title: t("sd_proto_d2_r3_title", "{Mod} Suite Parent Grouping"),
            desc: t("sd_proto_d2_r3_desc", "Automatically groups multi-file {mod} suites and companion module + script pairs into one clean Parent Card with an expandable Linked Modules drawer."),
          },
          {
            icon: t("icon_view_quilt", "view_quilt"),
            title: t("sd_proto_d2_r4_title", "Unified 3-Tile {Mod} Studio"),
            desc: t("sd_proto_d2_r4_desc", "Standardized 3-step publishing workflow (Details & Versions, Files & Folders, Rules & Upload) with Stable/Beta/Alpha channels shared across {Mason} Workshop and Architect Console."),
          },
          {
            icon: t("icon_construction", "construction"),
            title: t("sd_proto_d2_r5_title", "2-Column Live-Wire Workbench & Timeline Diff"),
            desc: t(
              "sd_proto_d2_r5_desc",
              "60 FPS Visual Config Editor with lossless TOML/YAML/JSONC round-trips, category pills, range steppers, No-Code Template Builder, and [In-Game Engine Edit] Monaco diffs."
            ),
          },
          {
            icon: t("icon_public", "public"),
            title: t(
              "sd_proto_d2_r6_title",
              "Browser Autoloader, Direct HTTPS & Deep Links"
            ),
            desc: t("sd_proto_d2_r6_desc", "Guided (1 of N) Side Browser queue alongside direct SHA-256 HTTPS transfers, tri-OS sanctuary:// / nxm:// / ror2mm:// / curseforge:// Deep Links, and local DPAPI BYO-API-Key Broker."),
          },
          {
            icon: t("icon_history", "history"),
            title: t("sd_proto_d2_r7_title", "Echo Archive & Rollback Lineage"),
            desc: t(
              "sd_proto_d2_r7_desc",
              "Retains local previous_hashes archives so rollback swaps to verified prior versions execute offline with zero re-downloads."
            ),
          },
          {
            icon: t("icon_rule_folder", "rule_folder"),
            title: t("sd_proto_d2_r8_title", "The Quartermaster (FOMOD & BAIN Wizard)"),
            desc: t(
              "sd_proto_d2_r8_desc",
              "Guided .fomod (ModuleConfig.xml UTF-8/UTF-16LE, <gameDependency>) and BAIN installer wizard with non-destructive reconfiguration inside ModDossier."
            ),
          },
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: t("sd_proto_d2_r9_title", "The Rosetta Protocol & Lockfile Hydration"),
            desc: t(
              "sd_proto_d2_r9_desc",
              "Translates Modrinth .mrpack, CurseForge manifests, Nexus collections, and .wabbajack archives into deterministic .sanctuary-blueprint.lock.json 1-click hydration plans."
            ),
          },
          {
            icon: t("icon_cloud_off", "cloud_off"),
            title: t("sd_proto_d2_r10_title", "Cloud-Sync Folder Sentinel"),
            desc: t(
              "sd_proto_d2_r10_desc",
              "Detects active OneDrive, Dropbox, iCloud Drive, and Google Drive reparse locks on {Vault}, Staging, and game targets before symlink/hardlink projection can conflict."
            ),
          },
        ],
      },
      {
        icon: t("icon_radar", "radar"),
        badge: t("sd_proto_d3_badge", "DOMAIN 3 • 9 PROTOCOLS"),
        title: t("sd_proto_d3_title", "Stability, Load Order & Sandbox Protocols"),
        desc: t("sd_proto_d3_desc", "Topological LOOT/DAG load order compilation, SQLite-cached Conflict Radar 2.0, Highlander/Twin cohesion, Deep Yeet cascades, Homestead Lab, Creator Airlock, Save Doctor, and Time Capsule hardlinks."),
        rules: [
          {
            icon: t("icon_layers", "layers"),
            title: t(
              "sd_proto_d3_r1_title",
              "Schema-Driven Load Order Compiler"
            ),
            desc: t(
              "sd_proto_d3_r1_desc",
              "Compiles priority via folder_priority (dynamic manifest + schema priority folders), manifest_list, numeric_prefix, or timestamp with DFS cycle breaking and external LOOT rules."
            ),
          },
          {
            icon: t("icon_radar", "radar"),
            title: t(
              "sd_proto_d3_r2_title",
              "Conflict Radar 2.0 (SQLite Cached TOCs)"
            ),
            desc: t(
              "sd_proto_d3_r2_desc",
              "Rayon analyzer parsing TES4/BSA/BA2/LSPK/PAK/UTOC/RDAR/RPF7/JSON/XML with SQLite caching, Casual 'Pick a Winner' overrides, and Advanced Must Load After/Before rules."
            ),
          },
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: t(
              "sd_proto_d3_r3_title",
              "The Highlander Rule"
            ),
            desc: t(
              "sd_proto_d3_r3_desc",
              "Enforces mutually exclusive Flavor/slot groups (highlander_group_id) with explicit Swap, Keep Both, or Cancel confirmation prompts."
            ),
          },
          {
            icon: t("icon_link", "link"),
            title: t(
              "sd_proto_d3_r4_title",
              "Nuclear Family Cohesion (Twins & Groups)"
            ),
            desc: t("sd_proto_d3_r4_desc", "Bidirectionally links companion modules, script twins, and shared-stem artifact_groups across deployment and toggles."),
          },
          {
            icon: t("icon_account_tree", "account_tree"),
            title: t(
              "sd_proto_d3_r5_title",
              "Chain-Link Dependencies & Deep Yeet 2.0"
            ),
            desc: t("sd_proto_d3_r5_desc", "Auto-equips required master {mods} on enable, and halts for {Citizen} confirmation to cleanly cascade-unequip orphaned child {mods} on removal."),
          },
          {
            icon: t("icon_science", "science"),
            title: t("sd_proto_d3_r6_title", "Homestead Lab & Groundhog Sandbox"),
            desc: t(
              "sd_proto_d3_r6_desc",
              "Isolates primary saves while booting 100% Nuke or 1v1 sandbox tests, correlating crash logs in <10ms against SQLite Radar chunks, with strict opt-in OFF cloud certificates."
            ),
          },
          {
            icon: t("icon_history", "history"),
            title: t("sd_proto_d3_r7_title", "Time Capsule (World & Engine Lanes)"),
            desc: t(
              "sd_proto_d3_r7_desc",
              "Rayon CoW OS hardlink snapshots with explicit .delta_manifest.json lane isolation, storage-cap pruning, and strictly additive World-lane save restoration."
            ),
          },
          {
            icon: t("icon_vpn_key", "vpn_key"),
            title: t("sd_proto_d3_r8_title", "Creator Airlock (External Tool Runner)"),
            desc: t(
              "sd_proto_d3_r8_desc",
              "Launches external authoring suites inside Homestead's save-airgapped sandbox via host or Proton and restores live saves on exit (distinct from Open {Mason} Workshop)."
            ),
          },
          {
            icon: t("icon_medical_services", "medical_services"),
            title: t("sd_proto_d3_r9_title", "Save Doctor & Crash Autopsy"),
            desc: t(
              "sd_proto_d3_r9_desc",
              "Records per-save mod DNA manifests (.sanctuary-save-manifest.json) and performs pre-launch missing-mod alerts + instant exception diagnosis."
            ),
          },
        ],
      },
      {
        icon: t("icon_shield", "shield"),
        badge: t("sd_proto_d4_badge", "DOMAIN 4 • 8 PROTOCOLS"),
        title: t(
          "sd_proto_d4_title",
          "Zero-Knowledge Security, DMCA & Shield Protocols"
        ),
        desc: t(
          "sd_proto_d4_desc",
          "Hardware WebAuthn FIDO2 gates, Echo Suppressor alert sync, Dual-Tier Rust Heuristics, Tier 6 Malware Lockdown, Spoke-routed Tier 1 DMCA Safe Harbor, Tiers 2–5 isolation, DEFCON 1 pre-patch shield, and bidirectional Nuclear Override."
        ),
        rules: [
          {
            icon: t("icon_passkey", "passkey"),
            title: t("sd_proto_d4_r1_title", "Zero-Knowledge Seal (FIDO2 & TOTP)"),
            desc: t("sd_proto_d4_r1_desc", "Requires hardware-bound WebAuthn Passkeys, Touch ID, or TOTP verification + OWASP 600k blinding for Elevated Clearances inside the Security {Vault} drawer."),
          },
          {
            icon: t("icon_notifications_off", "notifications_off"),
            title: t("sd_proto_d4_r2_title", "Echo Suppressor (Encrypted Alert Sync)"),
            desc: t("sd_proto_d4_r2_desc", "Synchronizes encrypted alert dismissals across Desktop, Steam Deck, and Web so notices fire once per account; Pocket Radar sync remains strict opt-in OFF."),
          },
          {
            icon: t("icon_cleaning_services", "cleaning_services"),
            title: t("sd_proto_d4_r3_title", "Ghost Scrubber (In-Memory PII Scrubbing)"),
            desc: t("sd_proto_d4_r3_desc", "Scrubs OS usernames, paths, IPs, MACs, SIDs, and HWIDs purely in-memory on read (never mutating live game logs) before telemetry leaves the rig."),
          },
          {
            icon: t("icon_security", "security"),
            title: t("sd_proto_d4_r4_title", "Bytecode Hound Dual-Tier Heuristics"),
            desc: t(
              "sd_proto_d4_r4_desc",
              "Merges global Core and community Spoke signatures with Zlib/Zstd stream & bytecode inspection across executables, archives, and masquerading extensions."
            ),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t(
              "sd_proto_d4_r5_title",
              "Zero-Choice Lockdown & Secure Shred (Tier 6)"
            ),
            desc: t("sd_proto_d4_r5_desc", "Confirmed Tier 6 Malware locks the OS shell, displays Triggered By & Detection Source attribution, and requires a {Citizen} signature for multi-pass Secure Shredding."),
          },
          {
            icon: t("icon_visibility_off", "visibility_off"),
            title: t(
              "sd_proto_d4_r6_title",
              "Compliance Tiers 1–5 Surface Isolation & Support Lock"
            ),
            desc: t("sd_proto_d4_r6_desc", "Permits Tiers 2–5 in local Vaults while stripping Tiers 1–5 from public Nexus feeds and Cloud {Blueprints}, and applies non-destructive Community {Mod} Support Lock."),
          },
          {
            icon: t("icon_cell_tower", "cell_tower"),
            title: t(
              "sd_proto_d4_r7_title",
              "DEFCON 1 Pre-Patch Shield & Bidirectional Nuclear Override"
            ),
            desc: t("sd_proto_d4_r7_desc", "Monitors global_network_status to seal saves before breaking patches; 5-click System Preferences Nuclear Override toggles offline airgap mode bidirectionally without permanent lockouts."),
          },
          {
            icon: t("icon_gavel", "gavel"),
            title: t("sd_proto_d4_r8_title", "Spoke-Routed DMCA Safe Harbor (Tier 1)"),
            desc: t("sd_proto_d4_r8_desc", "Immediately suppresses public visibility on valid 17 U.S.C. § 512 notices (Tier 1) and routes notice resolution to the sovereign Partner Spoke under a 48h SLA while logging minimal statutory compliance records in Keepers Core (public.dmca_compliance_notices)."),
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
                : t("dir_pr_t2_lbl", "TIERS 0–6")
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

        {/* Tab 2: Compliance Tiers 0–6 & Heuristics Defense Matrix (Single-Column Stacked Cards: Unselected Compact & Dimmed, Selected Expands In-Place) */}
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
