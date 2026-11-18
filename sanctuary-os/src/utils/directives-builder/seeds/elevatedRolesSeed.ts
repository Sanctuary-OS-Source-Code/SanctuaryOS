import type { DirectiveBuilderCard } from "../types";

export function getElevatedRolesCards(
  t: (key: string, fallback?: string) => string
): DirectiveBuilderCard[] {
  const elevatedRolesCards: DirectiveBuilderCard[] = [
    {
      id: "role_citizen",
      icon: t("icon_person", "person"),
      overline: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      badge: t("role_citizen", "{Citizen}"),
      title: t("role_citizen", "{Citizen}"),
      footerMeta: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      desc: t(
        "dir_proto_r1_scope",
        "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions & unrestricted OS Bug Reports."
      ),
      status: "citizen",
      subCards: [
        {
          id: "role_cit_s1",
          icon: t("icon_inventory_2", "inventory_2"),
          title: t("dir_role_cit_s1_title", "9 Core {Citizen} Sectors & Symlink Airgap"),
          desc: t(
            "dir_role_cit_s1_desc",
            "Full offline and online access to Command Center, Your {Vault}, The Nexus, {Blueprints}, Comm-Link, Conflict Radar, Homestead {Lab}, {Citizen}'s Workbench, and {Backups}."
          ),
        },
        {
          id: "role_cit_s2",
          icon: t("icon_handyman", "handyman"),
          title: t("dir_role_cit_s2_title", "Inherited Open {Mason} Workshop & Static Edge Push"),
          desc: t(
            "dir_role_cit_s2_desc",
            "Build {mods} in Dev Sandbox, package .sanctuary.manifest.json / catalog.json releases, and 1-click Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, or WebDAV."
          ),
        },
        {
          id: "role_cit_s3",
          icon: t("icon_travel_explore", "travel_explore"),
          title: t("dir_role_cit_s3_title", "Scout Queue Discovery Submissions"),
          desc: t(
            "dir_role_cit_s3_desc",
            "Scan local Tier-0 {mods}, complete local {Lab} verification proof, and submit verified SHA-256 metadata to the crowd-sourced Scout Queue."
          ),
        },
        {
          id: "role_cit_s4",
          icon: t("icon_support_agent", "support_agent"),
          title: t("dir_role_cit_s4_title", "Tier-0 {Blueprint} Support & OS Bug Reports"),
          desc: t(
            "dir_role_cit_s4_desc",
            "Submit Community {Mod} Support when your active {Blueprint} holds only verified Tier-0 {mods} (no {Vault} file deletion), or file an OS Bug Report directly to Keepers with zero {mod} telemetry."
          ),
        },
      ],
    },
    {
      id: "role_mason",
      icon: t("icon_construction", "construction"),
      overline: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("dir_proto_r2_role", "Verified {Mason}"),
      footerMeta: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      desc: t(
        "dir_proto_r2_scope",
        "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_mas_s1",
          icon: t("icon_rocket_launch", "rocket_launch"),
          title: t("dir_role_mas_s1_title", "Verified Fast-Lane & Direct Nexus Publishing"),
          desc: t(
            "dir_role_mas_s1_desc",
            "Bypass crowd Scout vote thresholds to submit verified Tier-0 {mods}, Lexicons, Chameleons, and Workbench Templates straight to Architect triage."
          ),
        },
        {
          id: "role_mas_s2",
          icon: t("icon_storefront", "storefront"),
          title: t("dir_role_mas_s2_title", "Public {Mason} Profile & Suite Showcases"),
          desc: t(
            "dir_role_mas_s2_desc",
            "Curate your creator banner, featured {mod} suites, Highlander Exclusive Slots, dependency trees, and multi-range version rules on your public profile."
          ),
        },
        {
          id: "role_mas_s3",
          icon: t("icon_campaign", "campaign"),
          title: t("dir_role_mas_s3_title", "Creator Comm-Link {Dispatches} & Changelogs"),
          desc: t(
            "dir_role_mas_s3_desc",
            "Broadcast Markdown release notes, polling updates, and update alerts directly to subscribed {Citizens} on Comm-Link."
          ),
        },
        {
          id: "role_mas_s4",
          icon: t("icon_volunteer_activism", "volunteer_activism"),
          title: t("dir_role_mas_s4_title", "0%-Cut Supporter Bridge & Static Manifests"),
          desc: t(
            "dir_role_mas_s4_desc",
            "Connect Patreon, Ko-fi, or custom supporter links with 0% Sanctuary cut, and publish Tier 1–4 {mods} responsibly via decentralized Static Edge manifests."
          ),
        },
      ],
    },
    {
      id: "role_architect",
      icon: t("icon_architecture", "architecture"),
      overline: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("architect", "Architect"),
      footerMeta: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      desc: t(
        "dir_proto_r3_scope",
        "Unlocks Architect Console (strictly isolated to Compliance Tier 0 Stable records): Registry curation, Verified {Mason} & Scout Queue triage, Conflict Matrix, Known Exception Rules, Template Oversight, and Claimable {Citizen} Support Desk tickets."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_arc_s1",
          icon: t("icon_fact_check", "fact_check"),
          title: t("dir_role_arc_s1_title", "Tier-0 Global Registry & 3-Tile Studio Curation"),
          desc: t(
            "dir_role_arc_s1_desc",
            "Maintain verified Tier-0 Nexus records, configure Parent/Child suite trees, Highlander Exclusive Slots, and multi-range game compatibility."
          ),
        },
        {
          id: "role_arc_s2",
          icon: t("icon_dynamic_feed", "dynamic_feed"),
          title: t("dir_role_arc_s2_title", "Verified {Mason} & Scout Queue Triage"),
          desc: t(
            "dir_role_arc_s2_desc",
            "Review unknown/unverified community submissions in Dedicated Queues, run Check Hash verification, and escalate Tier 1–4 flags cleanly to Oversight."
          ),
        },
        {
          id: "role_arc_s3",
          icon: t("icon_warning_amber", "warning_amber"),
          title: t("dir_role_arc_s3_title", "Conflict Matrix & Known Exception Rules"),
          desc: t(
            "dir_role_arc_s3_desc",
            "Author Severity 1–4 conflict directives, review Workbench Templates, and publish database-driven exception diagnosis rules linked to Homestead {Lab} verdicts."
          ),
        },
        {
          id: "role_arc_s4",
          icon: t("icon_support_agent", "support_agent"),
          title: t("dir_role_arc_s4_title", "Claimable {Citizen} Support Desk & Escalation"),
          desc: t(
            "dir_role_arc_s4_desc",
            "Claim and resolve Tier-0 {Citizen} support tickets with PII-scrubbed crash logs and Active {Blueprint} snapshots, escalating sensitive reports to Oversight."
          ),
        },
      ],
    },
    {
      id: "role_oversight",
      icon: t("icon_admin_panel_settings", "admin_panel_settings"),
      overline: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("role_oversight", "Oversight"),
      footerMeta: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      desc: t(
        "dir_proto_r4_scope",
        "Unlocks Oversight Command: Tier 1–4 & Pending Flag Confirmation, Spoke Heuristic Signatures, Tier 5 Malware blacklisting, DEFCON 1 override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect)."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_ovr_s1",
          icon: t("icon_security", "security"),
          title: t("dir_role_ovr_s1_title", "Tier 1–4 Compliance & Pending Flag Review"),
          desc: t(
            "dir_role_ovr_s1_desc",
            "Exclusive reviewer for escalated Tier 1–4 records and Pending community flags—auto-hidden publicly until confirmed or cleared."
          ),
        },
        {
          id: "role_ovr_s2",
          icon: t("icon_gpp_bad", "gpp_bad"),
          title: t("dir_role_ovr_s2_title", "Spoke Heuristics, Tier 5 Blacklists & DEFCON 1"),
          desc: t(
            "dir_role_ovr_s2_desc",
            "Author game-specific antivirus signatures, blacklist Tier 5 Malware SHA-256 hashes, and engage DEFCON 1 pre-patch shields."
          ),
        },
        {
          id: "role_ovr_s3",
          icon: t("icon_published_with_changes", "published_with_changes"),
          title: t("dir_role_ovr_s3_title", "Game/DLC Patches, Mass Triage & {Mason} Linker"),
          desc: t(
            "dir_role_ovr_s3_desc",
            "Register upstream engine versions and DLC catalogs, run multi-range compatibility mass updates, and claim-link creator registries."
          ),
        },
        {
          id: "role_ovr_s4",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          title: t("dir_role_ovr_s4_title", "Spoke Identity Governance & Audit Logs"),
          desc: t(
            "dir_role_ovr_s4_desc",
            "Promote/demote roles up to Architect, handle escalated security tickets, and inspect read/export-only Spoke audit trails."
          ),
        },
      ],
    },
    {
      id: "role_wayfinder",
      icon: t("icon_explore", "explore"),
      overline: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("role_wayfinder", "Wayfinder"),
      footerMeta: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
      desc: t(
        "dir_proto_r5_scope",
        "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), secret-free SANCTUARY-UPLINK:// bundle export & 1-click Gateway Token rotation, unilateral Cut the Cord severance, Master Schema & Lexicon Studios, 0%-Cut Donations, and The Dispatch."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_way_s1",
          icon: t("icon_hub", "hub"),
          title: t("dir_role_way_s1_title", "Spoke Sovereignty, Covenants & Cut the Cord"),
          desc: t(
            "dir_role_way_s1_desc",
            "Rotate Spoke Gateway Tokens in 1 click, export secret-free SANCTUARY-UPLINK:// bundles, inspect Partner Covenants, or trigger irreversible high-friction severance from the Core Hub."
          ),
        },
        {
          id: "role_way_s2",
          icon: t("icon_schema", "schema"),
          title: t("dir_role_way_s2_title", "Master Schema Studio & Fork Branding"),
          desc: t(
            "dir_role_way_s2_desc",
            "Configure paths, binary headers, install routes, default Chameleon themes, Title Area headers (Standalone mode), and Spoke Lexicon packs."
          ),
        },
        {
          id: "role_way_s3",
          icon: t("icon_manage_accounts", "manage_accounts"),
          title: t("dir_role_way_s3_title", "Full Identity Matrix & Tier 1–4 Authority"),
          desc: t(
            "dir_role_way_s3_desc",
            "Appoint Oversight admins and peer Wayfinders, confirm or dismiss compliance flags, and run in-hub Mass Update compatibility sweeps."
          ),
        },
        {
          id: "role_way_s4",
          icon: t("icon_volunteer_activism", "volunteer_activism"),
          title: t("dir_role_way_s4_title", "0%-Cut Donations, Cost Ledgers & The Dispatch"),
          desc: t(
            "dir_role_way_s4_desc",
            "Publish transparent monthly infrastructure cost ledgers, collect 100% Wayfinder-owned donations, and broadcast top-banner polls."
          ),
        },
        {
          id: "role_way_s5",
          icon: t("icon_support", "support"),
          title: t("dir_role_way_s5_title", "Wayfinder Audit Trails & Keepers Uplink"),
          desc: t(
            "dir_role_way_s5_desc",
            "Audit every Spoke moderation action chronologically and communicate directly with Core Keepers via Wayfinder Support."
          ),
        },
      ],
    },
    {
      id: "role_keeper",
      icon: t("icon_memory", "memory"),
      overline: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("dir_proto_r6_role", "Keeper"),
      footerMeta: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
      desc: t(
        "dir_proto_r6_scope",
        "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Turnkey Spoke Onboarding, Core Heuristics, Threat Manifests, Master Game Schemas, Global Lexicons/Chameleons, Bilateral Directives Sync, OS Bug Reports, and Global Audit Logs."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_kpr_s1",
          icon: t("icon_dns", "dns"),
          title: t("dir_role_kpr_s1_title", "Partner Spoke Onboarding & Dev Cloaking"),
          desc: t(
            "dir_role_kpr_s1_desc",
            "Review Partner Spoke Applications, validate schema readiness, toggle Keepers-Only dev workspaces, and oversee Federation uptime."
          ),
        },
        {
          id: "role_kpr_s2",
          icon: t("icon_verified_user", "verified_user"),
          title: t("dir_role_kpr_s2_title", "Core Heuristics & Threat Manifests"),
          desc: t(
            "dir_role_kpr_s2_desc",
            "Maintain global malware regex signatures (keeper_heuristic_signatures) and triage Zero-PII Threat Manifest submissions from quarantined files."
          ),
        },
        {
          id: "role_kpr_s3",
          icon: t("icon_sync", "sync"),
          title: t("dir_role_kpr_s3_title", "Bilateral Directives, Schemas & Lexicons"),
          desc: t(
            "dir_role_kpr_s3_desc",
            "Author and sync System Directives, Legal Covenants, Default Schemas, Core Aesthetics, and Global Lexicon baselines without app rebuilds."
          ),
        },
        {
          id: "role_kpr_s4",
          icon: t("icon_bug_report", "bug_report"),
          title: t("dir_role_kpr_s4_title", "OS Bug Reports (`keeper_tickets`) & Releases"),
          desc: t(
            "dir_role_kpr_s4_desc",
            "Triage cross-platform OS bug reports (100% free of Spoke mod data/locks), publish Foundry News, and inspect immutable Global Audit Logs."
          ),
        },
      ],
    },
  ];
  return elevatedRolesCards;
}
