import { DirectiveSlug } from "./directivesSync";

export interface DirectiveBuilderSubCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
  pending?: boolean;
}

export interface DirectiveBuilderCard {
  id: string;
  icon: string;
  overline: string;
  badge: string;
  title: string;
  footerMeta: string;
  desc: string;
  tip?: string;
  codeSnippet?: string;
  status?: "active" | "completed" | "passkey" | "citizen" | "warning" | "danger" | "info";
  subCards: DirectiveBuilderSubCard[];
}

export interface DirectiveBuilderTab {
  id: string;
  icon: string;
  label: string;
  value: string;
  cards: DirectiveBuilderCard[];
}

export interface DirectiveBuilderSchema {
  slug: DirectiveSlug;
  title: string;
  summary: string;
  isActive?: boolean;
  _schemaVersion?: number;
  _bodySig?: number;
  tabs: DirectiveBuilderTab[];
}

export const CURRENT_DIRECTIVE_SCHEMA_VERSION = 58;

const BUILDER_COMMENT_PREFIX = "<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:";
const BUILDER_COMMENT_REGEX =
  /\n*<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:\s*([\s\S]*?)\s*-->\s*$/;

const defaultT = (_key: string, fallback?: string): string => fallback || _key;

function computeBodySig(cleanBody: string): number {
  const normalized = (cleanBody || "").replace(/\r\n/g, "\n").trim();
  let hash = normalized.length;
  for (let i = 0; i < normalized.length; i += 7) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function stripDirectiveMarkdownClutter(content: string): string {
  if (!content) return "";
  return content
    .replace(/^[ \t]*!\[[^\]]*\]\(https?:\/\/img\.shields\.io\/[^)]+\)[ \t]*\r?\n?/gm, "")
    .replace(/<img[^>]+src=["']https?:\/\/img\.shields\.io\/[^"']+["'][^>]*>\s*/gi, "")
    .replace(/(\n---\s*\n)?##+\s*Table of Contents[\s\S]*?\n---\s*\n/gi, "\n")
    .replace(/##+\s*Table of Contents[\s\S]*?(?=\n# |\n## (?!Table of Contents))/gi, "")
    .replace(/^[ \t]*>[ \t]*\*\*Official Citizen Guide[^\r\n]*\r?\n[ \t]*>[ \t]*Synced bidirectionally[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>[ \t]*\*\*Live Directive Synchronization:\*\*[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Document Version:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Last Updated:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Sync Pipeline:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*\*\*Version:\*\*[^\r\n]*\|\s*\*\*Last Updated:\*\*[^\r\n]*\r?\n?/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripDirectiveBuilderComment(content: string): string {
  if (!content) return "";
  return stripDirectiveMarkdownClutter(
    content.replace(BUILDER_COMMENT_REGEX, "").trim()
  );
}

/**
 * Dynamically parses raw Markdown headings (`#`, `##`, `###`) and bullet points (`- **Title:** Desc`)
 * so that editing a `.md` file in the codebase or updating markdown in the cloud database
 * automatically updates the directive's cards, tabs, and subCards even if the JSON comment wasn't manually rebuilt.
 */
export function parseMarkdownToDirectiveSchema(
  rawContent: string,
  slug: DirectiveSlug,
  t: (key: string, fallback?: string) => string = defaultT
): DirectiveBuilderSchema {
  const baseSchema = getDefaultDirectiveBuilderSchema(slug, t);
  const clean = stripDirectiveBuilderComment(rawContent);
  if (!clean) return baseSchema;

  const lines = clean.replace(/\r\n/g, "\n").split("\n");
  let docTitle = baseSchema.title;
  let docSummary = baseSchema.summary;

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ")) {
      const extractedTitle = line.replace(/^#\s+/, "").replace(/^Sanctuary OS\s*[—–-]\s*/i, "").trim();
      if (extractedTitle) docTitle = extractedTitle;
    } else if (line.startsWith("> ") && !line.toLowerCase().includes("version:")) {
      const extractedQuote = line.replace(/^>\s+/, "").replace(/\*\*/g, "").trim();
      if (extractedQuote.length > 25) {
        docSummary = extractedQuote;
        break;
      }
    } else if (
      line.length > 35 &&
      !line.startsWith("#") &&
      !line.startsWith("-") &&
      !line.startsWith("*") &&
      !line.startsWith("!")
    ) {
      docSummary = line.replace(/\*\*/g, "").trim();
      break;
    }
  }

  // Check if markdown was compiled by compileDirectiveSchemaToMarkdown (`## LABEL — VALUE` & `### OVERLINE: TITLE`)
  const compiledTabMatches = [...clean.matchAll(/^##\s+([^—\n]+?)\s+—\s+([^\n]+)$/gm)];
  if (compiledTabMatches.length >= baseSchema.tabs.length) {
    const parsedTabs: DirectiveBuilderTab[] = [];
    for (let tIdx = 0; tIdx < compiledTabMatches.length; tIdx++) {
      const match = compiledTabMatches[tIdx];
      const label = match[1].trim();
      const value = match[2].trim();
      const startPos = (match.index || 0) + match[0].length;
      const endPos =
        tIdx + 1 < compiledTabMatches.length
          ? compiledTabMatches[tIdx + 1].index || clean.length
          : clean.length;
      const tabBody = clean.slice(startPos, endPos);
      const fallbackTab = baseSchema.tabs[tIdx] || baseSchema.tabs[0];

      const cardMatches = [...tabBody.matchAll(/^###\s+([^\n]+)$/gm)];
      const cards: DirectiveBuilderCard[] = cardMatches.map((cm, cIdx) => {
        const rawHeading = cm[1].trim();
        const cStart = (cm.index || 0) + cm[0].length;
        const cEnd =
          cIdx + 1 < cardMatches.length
            ? cardMatches[cIdx + 1].index || tabBody.length
            : tabBody.length;
        const cardBody = tabBody.slice(cStart, cEnd).trim();
        const fallbackCard = fallbackTab?.cards?.[cIdx];

        let overline = fallbackCard?.overline || `ITEM ${cIdx + 1}`;
        let title = rawHeading;
        const colonIdx = rawHeading.indexOf(":");
        if (colonIdx > 0 && colonIdx < 48) {
          overline = rawHeading.slice(0, colonIdx).trim();
          title = rawHeading.slice(colonIdx + 1).trim();
        }

        const cLines = cardBody.split("\n");
        let badge = fallbackCard?.badge || "";
        let footerMeta = fallbackCard?.footerMeta || "";
        const descLines: string[] = [];
        const subCards: DirectiveBuilderSubCard[] = [];
        let tip: string | undefined = fallbackCard?.tip;

        for (const cl of cLines) {
          const trimmed = cl.trim();
          if (!trimmed || trimmed === "---") continue;
          if (/^\*[^*]+\*$/.test(trimmed) && !badge) {
            const metaParts = trimmed.slice(1, -1).split("•").map((s) => s.trim());
            badge = metaParts[0] || badge;
            footerMeta = metaParts.slice(1).join(" • ") || footerMeta;
          } else if (trimmed.startsWith("- **") || trimmed.startsWith("* **")) {
            const subMatch = trimmed.match(/^[-*]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/);
            if (subMatch) {
              subCards.push({
                id: `sub_${tIdx}_${cIdx}_${subCards.length + 1}`,
                icon:
                  fallbackCard?.subCards?.[subCards.length]?.icon ||
                  t("icon_check_circle", "check_circle"),
                title: subMatch[1].trim(),
                desc: subMatch[2].trim(),
                pending: fallbackCard?.subCards?.[subCards.length]?.pending,
              });
            }
          } else if (/^>\s*\*\*Tip:?\*\*/i.test(trimmed)) {
            tip = trimmed.replace(/^>\s*\*\*Tip:?\*\*:?\s*/i, "").trim();
          } else if (!trimmed.startsWith("```")) {
            descLines.push(trimmed);
          }
        }

        return {
          id: fallbackCard?.id || `card_${tIdx}_${cIdx + 1}`,
          icon: fallbackCard?.icon || t("icon_layers", "layers"),
          overline,
          badge: badge || overline,
          title,
          footerMeta: footerMeta || badge,
          desc: descLines.join(" ").trim() || fallbackCard?.desc || "",
          tip,
          status: fallbackCard?.status,
          subCards: subCards.length > 0 ? subCards : fallbackCard?.subCards || [],
        };
      });

      parsedTabs.push({
        id: fallbackTab?.id || `tab_${tIdx + 1}`,
        icon: fallbackTab?.icon || t("icon_folder_special", "folder_special"),
        label,
        value,
        cards: cards.length > 0 ? cards : fallbackTab?.cards || [],
      });
    }

    if (
      parsedTabs.length > 0 &&
      parsedTabs.every((tb) => tb.cards.length > 0 && tb.cards.every((c) => Boolean(c.desc)))
    ) {
      return {
        ...baseSchema,
        title: docTitle,
        summary: docSummary,
        _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
        _bodySig: computeBodySig(clean),
        tabs: parsedTabs,
      };
    }
  }

  return {
    ...baseSchema,
    title: docTitle,
    summary: docSummary,
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    _bodySig: computeBodySig(clean),
  };
}

export function extractDirectiveBuilderSchema(
  content?: string | null,
  slug?: DirectiveSlug,
  t: (key: string, fallback?: string) => string = defaultT
): DirectiveBuilderSchema | null {
  if (!content) {
    return slug ? getDefaultDirectiveBuilderSchema(slug, t) : null;
  }

  const cleanBody = stripDirectiveBuilderComment(content);
  const currentBodySig = computeBodySig(cleanBody);
  const match = content.match(BUILDER_COMMENT_REGEX);

  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]) as DirectiveBuilderSchema;
      if (parsed && Array.isArray(parsed.tabs)) {
        const effectiveSlug = (slug || parsed.slug || "citizen_guide") as DirectiveSlug;
        // If the embedded JSON is from an older schema version (< 58) and hasn't been custom-edited in V5.8,
        // upgrade to the V5.8 schema so new stages/modules/cards automatically appear!
        if ((parsed._schemaVersion || 0) < CURRENT_DIRECTIVE_SCHEMA_VERSION) {
          return parseMarkdownToDirectiveSchema(content, effectiveSlug, t);
        }
        // If the markdown body above the comment was edited directly (signature changed), re-parse from markdown
        if (parsed._bodySig && parsed._bodySig !== currentBodySig) {
          return parseMarkdownToDirectiveSchema(content, effectiveSlug, t);
        }
        return parsed;
      }
    } catch {
      // Fall through to dynamic markdown parser
    }
  }

  if (slug) {
    return parseMarkdownToDirectiveSchema(content, slug, t);
  }
  return null;
}

export function embedDirectiveBuilderSchema(
  cleanMarkdown: string,
  schema: DirectiveBuilderSchema | null
): string {
  const base = stripDirectiveBuilderComment(cleanMarkdown);
  if (!schema) return base;
  const enrichedSchema: DirectiveBuilderSchema = {
    ...schema,
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    _bodySig: computeBodySig(base),
  };
  return `${base}\n\n${BUILDER_COMMENT_PREFIX}\n${JSON.stringify(enrichedSchema, null, 2)}\n-->\n`;
}

export function compileDirectiveSchemaToMarkdown(
  schema: DirectiveBuilderSchema
): string {
  const lines: string[] = [];
  lines.push(`# ${schema.title}`);
  if (schema.summary) {
    lines.push("");
    lines.push(`> ${schema.summary}`);
  }
  lines.push("");

  for (const tab of schema.tabs) {
    lines.push("---");
    lines.push("");
    lines.push(`## ${tab.label} — ${tab.value}`);
    lines.push("");

    for (const card of tab.cards) {
      lines.push(`### ${card.overline ? `${card.overline}: ` : ""}${card.title}`);
      if (card.badge || card.footerMeta) {
        const metaParts = [card.badge, card.footerMeta].filter(Boolean);
        if (metaParts.length > 0) {
          lines.push(`*${metaParts.join(" • ")}*`);
        }
      }
      if (card.desc) {
        lines.push("");
        lines.push(card.desc);
      }
      if (card.subCards && card.subCards.length > 0) {
        lines.push("");
        for (const sub of card.subCards) {
          lines.push(`- **${sub.title}:** ${sub.desc}`);
        }
      }
      if (card.tip) {
        lines.push("");
        lines.push(`> **Tip:** ${card.tip}`);
      }
      if (card.codeSnippet) {
        lines.push("");
        lines.push("```ts");
        lines.push(card.codeSnippet);
        lines.push("```");
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

export function getDefaultDirectiveBuilderSchema(
  slug: DirectiveSlug,
  t: (key: string, fallback?: string) => string = defaultT
): DirectiveBuilderSchema {
  const g = (txt: string) => (txt ? t("", txt) : "");
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
        "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Static Edge Direct Push, Schema & Lexicon Codex) + Scout Queue submissions."
      ),
      status: "citizen",
      subCards: [
        {
          id: "role_cit_s1",
          icon: t("icon_inventory_2", "inventory_2"),
          title: t("dir_role_cit_s1_title", "9 Core {Citizen} Sectors & Symlink Airgap"),
          desc: t(
            "dir_role_cit_s1_desc",
            "Full offline and online access to Command Center, Your {Vault}, The Nexus, {Blueprints}, Comm-Link, Conflict Radar, Homestead Lab, {Citizen}'s Workbench, and {Backups}."
          ),
        },
        {
          id: "role_cit_s2",
          icon: t("icon_handyman", "handyman"),
          title: t("dir_role_cit_s2_title", "Inherited Open {Mason} Workshop & Static Edge Push"),
          desc: t(
            "dir_role_cit_s2_desc",
            "Build {mods} in Dev Sandbox, package manifest.json / catalog.json releases, and 1-click Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, or WebDAV."
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
            "Bypasses crowd Scout thresholds to submit verified {mods} directly to Architect review and manage public creator portfolios."
          ),
        },
        {
          id: "role_mas_s2",
          icon: t("icon_volunteer_activism", "volunteer_activism"),
          title: t("dir_role_mas_s2_title", "0%-Cut Supporter Bridge & Creator Dispatches"),
          desc: t(
            "dir_role_mas_s2_desc",
            "Link Patreon, Ko-fi, or custom supporter URLs with 0% platform cut and broadcast release alerts to followers."
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
        "Unlocks Architect Console: Global Registry curation (3-Tile {Mod} Studio), Verified {Mason} & Scout Queue triage (min_scout_submissions), Global Conflict Matrix directives, Check Hash deep scan, Template Oversight, and claimable {Citizen} Support Desk tickets."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_arc_s1",
          icon: t("icon_fact_check", "fact_check"),
          title: t("dir_role_arc_s1_title", "Global Registry & Conflict Matrix Curation"),
          desc: t(
            "dir_role_arc_s1_desc",
            "Approve Verified {Mason} & Scout submissions, author Severity 1–4 conflict directives, and run deep Check Hash heuristic verification."
          ),
        },
        {
          id: "role_arc_s2",
          icon: t("icon_support_agent", "support_agent"),
          title: t("dir_role_arc_s2_title", "{Citizen} Support Desk & Diagnostic Dossiers"),
          desc: t(
            "dir_role_arc_s2_desc",
            "Claim and resolve encrypted {Citizen} support tickets with PII-scrubbed crash logs and active loadout telemetry."
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
        "Unlocks Oversight Command: Spoke Heuristic Signatures authoring (17+ Spoke rules), Compliance Tier 5 Malware flagging, Emergency DEFCON 1 Lockdown override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect)."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_ovr_s1",
          icon: t("icon_security", "security"),
          title: t("dir_role_ovr_s1_title", "Spoke Heuristics, Tier 5 Blacklists & DEFCON 1"),
          desc: t(
            "dir_role_ovr_s1_desc",
            "Author game-specific heuristic signatures, flag Tier 5 Malware DNA hashes, and trigger DEFCON 1 pre-patch shields."
          ),
        },
        {
          id: "role_ovr_s2",
          icon: t("icon_published_with_changes", "published_with_changes"),
          title: t("dir_role_ovr_s2_title", "Engine Patch Registration & Mass Batch Triage"),
          desc: t(
            "dir_role_ovr_s2_desc",
            "Register upstream game binary patches and DLC packs, and execute mass compatibility updates across the Spoke registry."
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
        "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), Spoke Setup & Maintenance, Partners Agreement & Compliance Protocol covenants, unilateral Cut the Cord severance, Master Schema & Lexicon Studios, Non-Custodial 0%-Cut Donations, and The Dispatch."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_way_s1",
          icon: t("icon_hub", "hub"),
          title: t("dir_role_way_s1_title", "Spoke Sovereignty, Covenants & Cut the Cord"),
          desc: t(
            "dir_role_way_s1_desc",
            "Rotate Spoke Supabase keys, inspect the Partners Agreement & Compliance Protocol, configure 0%-cut community donations, or sever from the Hub at any time."
          ),
        },
        {
          id: "role_way_s2",
          icon: t("icon_schema", "schema"),
          title: t("dir_role_way_s2_title", "Master Schema Studio & Spoke Aesthetics"),
          desc: t(
            "dir_role_way_s2_desc",
            "Customize your game's Master Schema JSON (paths, install routes, config watcher, mod categories) and publish Spoke Lexicons & Chameleons."
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
        "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Partner Spoke Applications & Turnkey SANCTUARY-UPLINK:// Onboarding, Core Heuristics (21+ signatures) & Threat Manifests, Master Game Schemas, Global Lexicons/Chameleons, Bilateral Codebase ↔ Cloud Directives Sync, and Global Audit Logs."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_kpr_s1",
          icon: t("icon_verified_user", "verified_user"),
          title: t("dir_role_kpr_s1_title", "Core Heuristics (21+ Rules) & Threat Manifests"),
          desc: t(
            "dir_role_kpr_s1_desc",
            "Maintain global antivirus signatures (keeper_heuristic_signatures) and triage Zero-PII Threat Manifest reports submitted from quarantined files."
          ),
        },
        {
          id: "role_kpr_s2",
          icon: t("icon_sync", "sync"),
          title: t("dir_role_kpr_s2_title", "Bilateral Codebase ↔ Hub Sync & Partner Onboarding"),
          desc: t(
            "dir_role_kpr_s2_desc",
            "Sync Directives, Legal Covenants, Schemas, and Lexicons between the codebase offline baseline and the live Cloud Hub database without app rebuilds."
          ),
        },
      ],
    },
  ];

  if (slug === "citizen_guide") {
    return {
      slug: "citizen_guide",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough"),
      summary: t(
        "sd_card_guide_desc",
        "10-stage interactive walkthrough of Sanctuary OS, 12 operational & creator modules (including Static Edge Direct Push, Master Schema & Lexicon Studios, and Spoke Covenants), and the 6-Tier Clearance Hierarchy."
      ),
      tabs: [
        {
          id: "walkthrough",
          icon: t("icon_play_circle", "play_circle"),
          label: t("dir_guide_mode_walk_v58_lbl", "10 STAGES"),
          value: t("dir_guide_mode_walk_val", "OS Walkthrough"),
          cards: [
            {
              id: "walk_1",
              icon: t("icon_space_dashboard", "space_dashboard"),
              overline: "STAGE 1 OF 10",
              badge: t("dir_walk_s1_short", "1. Shell & Bars"),
              title: t("dir_walk_s1_title", "Global Shell: Sidebar, Top Pill & Dock"),
              footerMeta: t("dir_walk_s1_sub", "Persistent Glass Frame & Context-Aware Navigation"),
              desc: t(
                "dir_walk_s1_desc",
                "Sanctuary OS is framed by three persistent Liquid Glass bars that adapt automatically between the Foundry Landing Page and your mounted Game Workspaces."
              ),
              subCards: [
                {
                  id: "walk_1_c1",
                  icon: t("icon_menu", "menu"),
                  title: t("dir_walk_s1_c1_name", "Left Sidebar (Context-Aware)"),
                  desc: t(
                    "dir_walk_s1_c1_desc",
                    "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 {Citizen} modules, unlocked Command Hubs, and the Quick Launch button."
                  ),
                },
                {
                  id: "walk_1_c2",
                  icon: t("icon_sports_esports", "sports_esports"),
                  title: t("dir_walk_s1_c2_name", "Top Center Workspace Pill"),
                  desc: t(
                    "dir_walk_s1_c2_desc",
                    "Click the game pill in the top TitleBar to switch active games, mount a new workspace, or return to the Sanctuary Foundry Landing Page."
                  ),
                },
                {
                  id: "walk_1_c3",
                  icon: t("icon_dock_to_bottom", "dock_to_bottom"),
                  title: t("dir_walk_s1_c3_name", "Bottom Morphing Status Pill"),
                  desc: t(
                    "dir_walk_s1_c3_desc",
                    "Houses 1-Click Radar Sweep, {Vault} Lockdown, {Blueprint} Quick-Swap, Side Browser, Notifications, and live alert counters. Auto-tucks when SidePanels open."
                  ),
                },
              ],
            },
            {
              id: "walk_2",
              icon: t("icon_explore", "explore"),
              overline: "STAGE 2 OF 10",
              badge: t("dir_walk_s2_short", "2. Cartographer"),
              title: t("dir_walk_s2_title", "Mounting a Workspace & Cartographer (Win & Mac)"),
              footerMeta: t("dir_walk_s2_sub", "First-Boot Coordinate Mapping & Native PE/Plist Ripper"),
              desc: t(
                "dir_walk_s2_desc",
                "Selecting a workspace on the Landing Page launches The Cartographer to link your Windows (.exe) or macOS (.app) game binary, live {Mods} directory, and airgapped {Vault} storage."
              ),
              subCards: [
                {
                  id: "walk_2_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: t("dir_walk_s2_c1_name", "Bin Folder (Windows .exe & macOS .app)"),
                  desc: t(
                    "dir_walk_s2_c1_desc",
                    "Points to your game binary (e.g. TS4_x64.exe or The Sims 4.app). Sanctuary extracts the genuine patch version in-process via Rust pelite or macOS Info.plist."
                  ),
                },
                {
                  id: "walk_2_c2",
                  icon: t("icon_folder_open", "folder_open"),
                  title: t("dir_walk_s2_c2_name", "{Mods} Folder (Symlink Target)"),
                  desc: t(
                    "dir_walk_s2_c2_desc",
                    "Your live game {Mods} folder. Keep this untouched—Sanctuary projects active {mods} here via zero-copy OS symlinks and custom install_routes."
                  ),
                },
                {
                  id: "walk_2_c3",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: t("dir_walk_s2_c3_name", "{Vault} Folder (Deep Archive)"),
                  desc: t(
                    "dir_walk_s2_c3_desc",
                    "Your isolated storage directory where Sanctuary builds {Mods}/, {Blueprints}/, Backups/World/, Backups/Engine/, Quarantine/, and Data/Cache/."
                  ),
                },
              ],
            },
            {
              id: "walk_3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: "STAGE 3 OF 10",
              badge: t("dir_walk_s3_short", "3. {Vault} & Cards"),
              title: t("dir_walk_s3_title", "Your {Vault}, {Mod} Cards & ActionPill"),
              footerMeta: t("dir_walk_s3_sub", "Drag-and-Drop Ingestion, Suite Grouping & Dossiers"),
              desc: t(
                "dir_walk_s3_desc",
                "Every {mod} you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Universal 21+17 Heuristic Engine, and indexed in Your {Vault}."
              ),
              subCards: [
                {
                  id: "walk_3_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s3_c1_name", "ActionPill & Filters Popover"),
                  desc: t(
                    "dir_walk_s3_c1_desc",
                    "Instant search bar, Filters (tune) popover for Game Version / Eligible-Only filtering, sort order, and bulk selection actions."
                  ),
                },
                {
                  id: "walk_3_c2",
                  icon: t("icon_toggle_on", "toggle_on"),
                  title: t("dir_walk_s3_c2_name", "Parent Suite Card & Equip Toggle"),
                  desc: t(
                    "dir_walk_s3_c2_desc",
                    "Toggles symlinks in milliseconds. Multi-part {mod} suites (like MC Command Center) group into one Parent Card with an expandable Linked Modules drawer."
                  ),
                },
                {
                  id: "walk_3_c3",
                  icon: t("icon_menu_book", "menu_book"),
                  title: t("dir_walk_s3_c3_name", "{Mod} Dossier SidePanel"),
                  desc: t(
                    "dir_walk_s3_c3_desc",
                    "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static manifest.json / catalog.json URL, or inspect package files."
                  ),
                },
              ],
            },
            {
              id: "walk_4",
              icon: t("icon_map", "map"),
              overline: "STAGE 4 OF 10",
              badge: t("sd_guide_s4_short", "4. {Blueprints}"),
              title: t("dir_walk_s4_title", "{Blueprints} & Loadout Hot-Swapping"),
              footerMeta: t("dir_walk_s4_sub", "Zero-Copy Profile Switching & SNCXXX Cloud Uplinks"),
              desc: t(
                "dir_walk_s4_desc",
                "Replace manual folder dragging with saved tactical loadouts that swap thousands of symlinks in under a second."
              ),
              subCards: [
                {
                  id: "walk_4_c1",
                  icon: t("icon_swap_horiz", "swap_horiz"),
                  title: t("dir_walk_s4_c1_name", "{Blueprint} Hot-Swap Dropdown"),
                  desc: t(
                    "dir_walk_s4_c1_desc",
                    "Switch between playstyles (e.g. Realism Save, Occult Save, Patch Testing) directly from the {Vault} header or Bottom Dock."
                  ),
                },
                {
                  id: "walk_4_c2",
                  icon: t("icon_data_object", "data_object"),
                  title: t("dir_walk_s4_c2_name", "Portable Offline JSON Export"),
                  desc: t(
                    "dir_walk_s4_c2_desc",
                    "Exports your loadout to a self-contained .json file that preserves custom local modMeta URLs and workspace identity offline."
                  ),
                },
                {
                  id: "walk_4_c3",
                  icon: t("icon_tag", "tag"),
                  title: t("dir_walk_s4_c3_name", "6-Digit Cloud Uplink (SNCXXX)"),
                  desc: t(
                    "dir_walk_s4_c3_desc",
                    "Generates a 6-character share code (SNCXXX) or publishes your {Blueprint} to The Nexus while auto-stripping flagged Tier 1–4 hashes."
                  ),
                },
              ],
            },
            {
              id: "walk_5",
              icon: t("icon_radar", "radar"),
              overline: "STAGE 5 OF 10",
              badge: t("dir_walk_s5_short", "5. Radar & Lab"),
              title: t("dir_walk_s5_title", "Conflict Radar & Homestead Lab"),
              footerMeta: t("dir_walk_s5_sub", "Pick-a-Winner Load Order & 100% Nuke Proving Grounds"),
              desc: t(
                "dir_walk_s5_desc",
                "Resolve tuning overlaps before launching the game, or isolate suspect {mods} in a sterile crash-monitored sandbox."
              ),
              subCards: [
                {
                  id: "walk_5_c1",
                  icon: t("icon_emoji_events", "emoji_events"),
                  title: t("dir_walk_s5_c1_name", "Casual Mode (Pick a Winner)"),
                  desc: t(
                    "dir_walk_s5_c1_desc",
                    "Click 'Pick a Winner' on any Severity 3 Tuning Overlap to automatically route the winning {mod} into a higher priority tier and dynamic Resource.cfg."
                  ),
                },
                {
                  id: "walk_5_c2",
                  icon: t("icon_rule", "rule"),
                  title: t("dir_walk_s5_c2_name", "Advanced Load Order & Break Loop"),
                  desc: t(
                    "dir_walk_s5_c2_desc",
                    "Build directional Must Load After / Before rules with topological sorting and 1-click circular dependency loop breaking."
                  ),
                },
                {
                  id: "walk_5_c3",
                  icon: t("icon_science", "science"),
                  title: t("dir_walk_s5_c3_name", "Homestead 100% Nuke & Save Airgap"),
                  desc: t(
                    "dir_walk_s5_c3_desc",
                    "Snapshots save_airgap_targets (saves & Tray), boots with only the test {mod} (or 1v1 pair), harvests crash logs, and restores your saves."
                  ),
                },
              ],
            },
            {
              id: "walk_6",
              icon: t("icon_construction", "construction"),
              overline: "STAGE 6 OF 10",
              badge: t("dir_walk_s6_short", "6. IDE & Backups"),
              title: t("dir_walk_s6_title", "Workbench, Config Watcher & {Backups}"),
              footerMeta: t("dir_walk_s6_sub", "2-Column Visual Config Studio & Hardlink Backups"),
              desc: t(
                "dir_walk_s6_desc",
                "Edit 430+ setting {mod} config files visually at 60 FPS, sync live in-game config writes back to the {Vault}, and safeguard saves with hardlink snapshots."
              ),
              subCards: [
                {
                  id: "walk_6_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s6_c1_name", "2-Column Visual Config Editor & Watcher"),
                  desc: t(
                    "dir_walk_s6_c1_desc",
                    "Category Pill Bar, dual Min/Max range steppers, Undo/Reset, plus the Dynamic Config Watcher that syncs in-game .cfg/.ini/.json edits back to your {Vault}."
                  ),
                },
                {
                  id: "walk_6_c2",
                  icon: t("icon_compare_arrows", "compare_arrows"),
                  title: t("dir_walk_s6_c2_name", "2-Column Timeline & Diff Panel"),
                  desc: t(
                    "dir_walk_s6_c2_desc",
                    "Compare live unsaved edits or historical snapshots side-by-side in Visual Diff cards or Raw Monaco Code Diff."
                  ),
                },
                {
                  id: "walk_6_c3",
                  icon: t("icon_history", "history"),
                  title: t("dir_walk_s6_c3_name", "{Backups} (World & Engine)"),
                  desc: t(
                    "dir_walk_s6_c3_desc",
                    "Uses OS hardlinks so unchanged files consume 0 extra bytes, paired with differential rollback restoration."
                  ),
                },
              ],
            },
            {
              id: "walk_7",
              icon: t("icon_shield", "shield"),
              overline: "STAGE 7 OF 10",
              badge: t("dir_walk_s7_short", "7. Hubs & Security"),
              title: t("dir_walk_s7_title", "Open Workshop, Passkeys & Universal AV Lockdown"),
              footerMeta: t("dir_walk_s7_sub", "21+17 Heuristic Rules, FIDO2 Passkeys & Quarantine Shred"),
              desc: t(
                "dir_walk_s7_desc",
                "Every {Citizen} inherits the local {Mason} Workshop, while hardware FIDO2 Passkeys and the Universal Multi-Format Heuristic Scanner protect the OS."
              ),
              subCards: [
                {
                  id: "walk_7_c1",
                  icon: t("icon_handyman", "handyman"),
                  title: t("dir_walk_s7_c1_name", "Open {Mason} Workshop ({Citizen} Tier)"),
                  desc: t(
                    "dir_walk_s7_c1_desc",
                    "All {Citizens} can use Dev Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge (6 Liquid Glass sliders), and Static Edge Release Packaging."
                  ),
                },
                {
                  id: "walk_7_c2",
                  icon: t("icon_passkey", "passkey"),
                  title: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP {Vault}"),
                  desc: t(
                    "dir_walk_s7_c2_desc",
                    "Elevated clearances (Verified {Mason} through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security {Vault} SidePanel."
                  ),
                },
                {
                  id: "walk_7_c3",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: t("dir_walk_s7_c3_name", "Universal AV Quarantine & Threat Manifest"),
                  desc: t(
                    "dir_walk_s7_c3_desc",
                    "Decompresses Zlib/Zstd DBPF streams and Base64/Hex strings against 21 Core + 17 Spoke rules, locking the OS with Move-mode source disposition and Secure Shred."
                  ),
                },
              ],
            },
            {
              id: "walk_8",
              icon: t("icon_cloud_upload", "cloud_upload"),
              overline: "STAGE 8 OF 10",
              badge: t("dir_walk_s8_short", "8. Static Edge"),
              title: t("dir_walk_s8_title", "Decentralized Static Edge Polling & 1-Click Auto-Push"),
              footerMeta: t("dir_walk_s8_sub", "manifest.json • catalog.json • Lineage Hash Rollover"),
              desc: t(
                "dir_walk_s8_desc",
                "Publish {mod} updates without a central server using static manifest.json or multi-{mod} catalog.json endpoints with 1-click OS Auto-Push and automatic SHA-256 lineage rollover."
              ),
              subCards: [
                {
                  id: "walk_8_c1",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: t("dir_walk_s8_c1_name", "6-Provider 1-Click OS Auto-Push"),
                  desc: t(
                    "dir_walk_s8_c1_desc",
                    "Push manifest.json or catalog.json directly from your PC to GitHub Repo/Cloudflare Pages, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
                  ),
                },
                {
                  id: "walk_8_c2",
                  icon: t("icon_history", "history"),
                  title: t("dir_walk_s8_c2_name", "Automatic Lineage Hash Rollover"),
                  desc: t(
                    "dir_walk_s8_c2_desc",
                    "Exporting a new version automatically rolls prior v1.0 hashes into previous_hashes so {Citizens} get instant Update Available alerts and in-place file replacement."
                  ),
                },
                {
                  id: "walk_8_c3",
                  icon: t("icon_library_books", "library_books"),
                  title: t("dir_walk_s8_c3_name", "Single Master catalog.json Support"),
                  desc: t(
                    "dir_walk_s8_c3_desc",
                    "Point all of your {mods} to one shared catalog.json URL—Sanctuary OS matches each installed {mod} by artifact ID, current_hashes, or previous_hashes."
                  ),
                },
              ],
            },
            {
              id: "walk_9",
              icon: t("icon_schema", "schema"),
              overline: "STAGE 9 OF 10",
              badge: t("dir_walk_s9_short", "9. Schema & Lexicon"),
              title: t("dir_walk_s9_title", "Master Schema Studio & Lexicon Terminology Studio"),
              footerMeta: t("dir_walk_s9_sub", "7 Engine Presets • 21 {Glossary} Tokens • Guided Icon Builder"),
              desc: t(
                "dir_walk_s9_desc",
                "Configure any game engine across Windows and macOS with the 4-Tab Master Schema Visual Studio, and hot-swap all 1,700+ OS strings and icons with the Lexicon Studio."
              ),
              subCards: [
                {
                  id: "walk_9_c1",
                  icon: t("icon_schema", "schema"),
                  title: t("dir_walk_s9_c1_name", "7 Engine Architecture Presets & Routes"),
                  desc: t(
                    "dir_walk_s9_c1_desc",
                    "Load presets for The Sims 4, Cyberpunk 2077, Skyrim SE, GTA V, Baldur's Gate 3, Stardew Valley, or Universal—complete with install_routes and mod_categories."
                  ),
                },
                {
                  id: "walk_9_c2",
                  icon: t("icon_translate", "translate"),
                  title: t("dir_walk_s9_c2_name", "21 Dynamic {Glossary} Tokens & Parity Alert"),
                  desc: t(
                    "dir_walk_s9_c2_desc",
                    "Editing {Mod}, {Vault}, or {Blueprint} updates 1,700+ strings with automatic Title/lower/UPPER casing, a/an grammar, and livecloud updates without rebuilding the app."
                  ),
                },
                {
                  id: "walk_9_c3",
                  icon: t("icon_Apps", "apps"),
                  title: t("dir_walk_s9_c3_name", "Guided Icon Override Builder & Codex Guides"),
                  desc: t(
                    "dir_walk_s9_c3_desc",
                    "Search and remap any OS Material Symbol icon visually with side-by-side Default → New glyph previews, or open the interactive Schema & Lexicon Codex."
                  ),
                },
              ],
            },
            {
              id: "walk_10",
              icon: t("icon_handshake", "handshake"),
              overline: "STAGE 10 OF 10",
              badge: t("dir_walk_s10_short", "10. Support & Partners"),
              title: t("dir_walk_s10_title", "Supporter Pipeline, Core Feedback & Partner Spoke Onboarding"),
              footerMeta: t("dir_walk_s10_sub", "$5 = +30 Days Dev Builds • 0% Partner Cut • Sovereign Covenants"),
              desc: t(
                "dir_walk_s10_desc",
                "Submit Core OS feedback or bug reports from the Landing Page, unlock Daily Dev Builds via the Supporter Pipeline, or apply to launch a Sovereign Partner Spoke."
              ),
              subCards: [
                {
                  id: "walk_10_c1",
                  icon: t("icon_Favorite", "favorite"),
                  title: t("dir_walk_s10_c1_name", "Supporter Pipeline ($5 = +30 Days Dev Builds)"),
                  desc: t(
                    "dir_walk_s10_c1_desc",
                    "Every $5 contribution adds +30 days of automated Daily Dev Build access (Windows .msi & macOS .dmg) verified via Stripe Receipt / Order ID."
                  ),
                },
                {
                  id: "walk_10_c2",
                  icon: t("icon_gavel", "gavel"),
                  title: t("dir_walk_s10_c2_name", "Readiness-Gated Partner Spoke Application"),
                  desc: t(
                    "dir_walk_s10_c2_desc",
                    "Review the Sanctuary Partners Agreement and Compliance Protocol in an interactive overlay drawer, verify your schema.sql Spoke readiness, and retain 100% of community donations."
                  ),
                },
                {
                  id: "walk_10_c3",
                  icon: t("icon_cloud_sync", "cloud_sync"),
                  title: t("dir_walk_s10_c3_name", "Offline Codebase Baseline + Live Cloud Updates"),
                  desc: t(
                    "dir_walk_s10_c3_desc",
                    "Bundled .md, schema, and lexicon files power instant first-launch & offline use, while connected desktops receive live cloud updates without reinstalling."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "modules",
          icon: t("icon_explore", "explore"),
          label: g("12 MODULES"),
          value: g("{Citizen} Tools"),
          cards: [
            {
              id: "mod_1",
              icon: t("icon_explore", "explore"),
              overline: "MODULE 1 OF 12",
              badge: g("1. Cartographer"),
              title: g("Cartographer Initialization & System Coordinates"),
              footerMeta: g("INITIAL SETUP • 3 COORDINATES"),
              desc: g(
                "On first boot, the Cartographer maps your machine's file system and extracts your genuine game engine version directly from the binary executable (.exe / .app) using an in-process Rust PE/plist parser."
              ),
              tip: g(
                "Click the Cloud Auto-Detect icon during setup to automatically locate your Game Bin and {Mods} directories for the active workspace."
              ),
              subCards: [
                {
                  id: "mod_1_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: g("Game Bin Folder (Live Engine)"),
                  desc: g(
                    "Where your game executable lives. Sanctuary reads PE headers directly from the .exe (or macOS .app Info.plist) to guarantee 100% patch version accuracy with zero antivirus false positives."
                  ),
                },
                {
                  id: "mod_1_c2",
                  icon: t("icon_folder_open", "folder_open"),
                  title: g("Active {Mods} Folder (Symlink Target)"),
                  desc: g(
                    "Your game's live {Mods} folder. Never drop files here manually—Sanctuary projects high-speed symlinks into this directory from your isolated {Vault}."
                  ),
                },
                {
                  id: "mod_1_c3",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: g("Isolated {Vault} Folder (Deep Storage)"),
                  desc: g(
                    "Your airgapped archive containing {Mods}/, {Blueprints}/, Backups/World, Backups/Engine, Quarantine/, and Data/Cache (.sanctuary_cache.db)."
                  ),
                },
                {
                  id: "mod_1_c4",
                  icon: t("icon_verified_user", "verified_user"),
                  title: g("Windows & macOS Symlink Permissions"),
                  desc: g(
                    "Enable Windows Developer Mode (or macOS Full Disk Access) so the Airgap engine can project zero-byte symlinks and manage com.apple.quarantine attributes cleanly."
                  ),
                },
              ],
            },
            {
              id: "mod_2",
              icon: t("icon_space_dashboard", "space_dashboard"),
              overline: "MODULE 2 OF 12",
              badge: g("2. Command Center"),
              title: g("The Command Center & Live Telemetry"),
              footerMeta: g("SYSTEM DASHBOARD • 4 HEALTH STATES"),
              desc: g(
                "Your high-level glassmorphic mission control. Monitors the health of your active {Blueprint}, surfaces {mason} updates and system dispatches, and provides 1-click access to Radar Sweeps and {Vault} Lockdown."
              ),
              tip: g(
                "Use the global SystemStatusBar at the bottom of the window to trigger a Radar Sweep or instant {Vault} Lockdown from any screen in the OS."
              ),
              subCards: [
                {
                  id: "mod_2_c1",
                  icon: t("icon_check_circle", "check_circle"),
                  title: g("System Stable (Green State)"),
                  desc: g(
                    "All equipped {mods} match your active game version, all required DLCs and dependencies are satisfied, and zero unmitigated collisions exist."
                  ),
                },
                {
                  id: "mod_2_c2",
                  icon: t("icon_system_update_alt", "system_update_alt"),
                  title: g("{Mod} Updates Available (Blue State)"),
                  desc: g(
                    "Newer SHA-256 versions have been detected either via the Spoke Cloud Registry or decentralized {mason} manifest.json / catalog.json endpoints."
                  ),
                },
                {
                  id: "mod_2_c3",
                  icon: t("icon_warning", "warning"),
                  title: g("{Citizen} Action Recommended (Amber State)"),
                  desc: g(
                    "An equipped {mod} is flagged as Unstable or has an unresolved Severity 3 Tuning Overlap awaiting a Load Order winner."
                  ),
                },
                {
                  id: "mod_2_c4",
                  icon: t("icon_error", "error"),
                  title: g("Critical Failure Detected (Red State)"),
                  desc: g(
                    "An equipped {mod} is Corrupted, incompatible with your Game Patch, missing a mandatory dependency/DLC, or locked in a Severity 4 Fatal Clash."
                  ),
                },
              ],
            },
            {
              id: "mod_3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: "MODULE 3 OF 12",
              badge: g("3. Your {Vault}"),
              title: g("Your {Vault} & Symlink Airgap 2.5"),
              footerMeta: g("ISOLATED STORAGE • SHA-256 DNA"),
              desc: g(
                "Your local {vault} and secured asset bunker. The game engine never touches your {Vault} directly—files are ingested, hashed via SHA-256, scanned by 21+17 heuristics, and projected via symlinks."
              ),
              tip: g(
                "Your Local {Mod} Dossier is decoupled from the cloud—you can freely customize {mod} titles, creator URLs, cover images, and tags locally."
              ),
              subCards: [
                {
                  id: "mod_3_c1",
                  icon: t("icon_fingerprint", "fingerprint"),
                  title: g("Global Drop-Zone & DNA Match"),
                  desc: g(
                    "Drag and drop .package, .ts4script, .zip, .rar, .7z, .tar.zst, or override.json files anywhere into Sanctuary OS. Duplicate SHA-256 hashes are automatically intercepted."
                  ),
                },
                {
                  id: "mod_3_c2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("Decentralized Static Edge (override.json)"),
                  desc: g(
                    "When a {mod} archive includes a {mason}'s override.json, Sanctuary binds its SHA-256 lineage to the {mason}'s static manifest.json or catalog.json URL for serverless update alerts."
                  ),
                },
                {
                  id: "mod_3_c3",
                  icon: t("icon_delete_sweep", "delete_sweep"),
                  title: g("Delete Cascade (Deep Yeet 2.0)"),
                  desc: g(
                    "Removing a core master library (such as XML Injector) automatically alerts you and queues all dependent add-ons so your loadout never breaks."
                  ),
                },
                {
                  id: "mod_3_c4",
                  icon: t("icon_visibility_off", "visibility_off"),
                  title: g("Ghosted Diagnostic States"),
                  desc: g(
                    "Incompatible or broken {mods} automatically enter a translucent Ghosted state with hover tooltips detailing Missing DLC, Version Mismatches, or Collisions."
                  ),
                },
              ],
            },
            {
              id: "mod_4",
              icon: t("icon_map", "map"),
              overline: "MODULE 4 OF 12",
              badge: g("4. {Blueprints}"),
              title: g("{Blueprints} & Tactical Loadouts"),
              footerMeta: g("INSTANT HOT-SWAP • CLOUD & OFFLINE"),
              desc: g(
                "Replace manual folder shuffling with {Blueprints}. Switch between completely different {mod} loadouts in seconds without duplicating files on your hard drive."
              ),
              tip: g(
                "Use 'Snapshot Active {Blueprint}' anytime to clone your currently deployed loadout into an experimental profile before adding new {mods}."
              ),
              subCards: [
                {
                  id: "mod_4_c1",
                  icon: t("icon_swap_horiz", "swap_horiz"),
                  title: g("1-Click {Blueprint} Hot-Swap"),
                  desc: g(
                    "Switch active loadouts directly from the {Vault} header or {Blueprints} view. Sanctuary instantly re-projects the exact symlinks and load order for that profile."
                  ),
                },
                {
                  id: "mod_4_c2",
                  icon: t("icon_tag", "tag"),
                  title: g("6-Digit Cloud Uplink (SNCXXX)"),
                  desc: g(
                    "Share your loadout with the community or across devices using a compact 6-character alphanumeric coordinate code."
                  ),
                },
                {
                  id: "mod_4_c3",
                  icon: t("icon_data_object", "data_object"),
                  title: g("Offline JSON Import/Export with modMeta"),
                  desc: g(
                    "Export portable JSON {blueprints} that embed your custom Local Dossier metadata (author links, custom names) and workspace ID for 100% offline preservation."
                  ),
                },
                {
                  id: "mod_4_c4",
                  icon: t("icon_install_mobile", "install_mobile"),
                  title: g("Remote Mobile/Web Queue Staging"),
                  desc: g(
                    "Browse The Nexus on your phone or tablet, stage a {blueprint} queue encrypted in the cloud, and approve it in one click when you sit down at your PC."
                  ),
                },
              ],
            },
            {
              id: "mod_5",
              icon: t("icon_hub", "hub"),
              overline: "MODULE 5 OF 12",
              badge: g("5. Nexus & Browser"),
              title: g("The Nexus & Integrated Side Browser"),
              footerMeta: g("METADATA REGISTRY • ZERO-TAX DISCOVERY"),
              desc: g(
                "Discover verified {Mods}, {Blueprints}, Lexicons, Chameleons, and Workbench Templates—and download directly from creator pages using the built-in Side Browser."
              ),
              tip: g(
                "You can toggle the Integrated Side Browser on or off anytime in System Preferences -> Network depending on whether you prefer in-app or external browsing."
              ),
              subCards: [
                {
                  id: "mod_5_c1",
                  icon: t("icon_tune", "tune"),
                  title: g("Smart Compatibility Filtering"),
                  desc: g(
                    "The Nexus automatically cross-references your installed Game Patch and owned DLCs, highlighting compatible releases and enforcing Tier-0 public safety."
                  ),
                },
                {
                  id: "mod_5_c2",
                  icon: t("icon_download", "download"),
                  title: g("Automatic Download Interception"),
                  desc: g(
                    "Clicking download on a creator's page inside the Integrated Side Browser automatically intercepts the archive and routes it straight into your {Vault}."
                  ),
                },
                {
                  id: "mod_5_c3",
                  icon: t("icon_verified", "verified"),
                  title: g("{Mason} Profiles & Direct Attribution"),
                  desc: g(
                    "Follow your favorite {Masons} to see their posts in your Comm-Link feed. Sanctuary takes 0% platform tax and links directly to {mason} Patreon, Ko-fi, and websites."
                  ),
                },
                {
                  id: "mod_5_c4",
                  icon: t("icon_radar", "radar"),
                  title: g("Crowd-Sourced Scout Queue"),
                  desc: g(
                    "Unidentified local {mods} can be submitted via the Scout Dossier or marked 'Flag as Local' to permanently exclude private files from cloud lookups."
                  ),
                },
              ],
            },
            {
              id: "mod_6",
              icon: t("icon_radar", "radar"),
              overline: "MODULE 6 OF 12",
              badge: g("6. Conflict Radar"),
              title: g("Conflict Radar & Schema Load Order Engine"),
              footerMeta: g("TOPOLOGICAL COMPILER • SEVERITY 1–4"),
              desc: g(
                "Sanctuary combines global Architect Directives, creator Static Edge rules, and a topological Load Order compiler to resolve tuning overlaps and prevent crashes before launch."
              ),
              tip: g(
                "Switch between Casual Mode and Advanced Mode anytime using the toggle inside Conflict Radar."
              ),
              subCards: [
                {
                  id: "mod_6_c1",
                  icon: t("icon_emoji_events", "emoji_events"),
                  title: g("Casual Mode: 1-Click 'Pick a Winner'"),
                  desc: g(
                    "For Severity 3 Tuning Overlaps, simply click the {mod} you want to win. Sanctuary automatically compiles the priority rules and routes the winner into the top override tier."
                  ),
                },
                {
                  id: "mod_6_c2",
                  icon: t("icon_rule", "rule"),
                  title: g("Advanced Mode: Directional Rules & Cycle Breaker"),
                  desc: g(
                    "Author custom 'Must Load After / Before' rules, assign explicit Priority Tiers (Base to Sanctuary3), and resolve circular dependency loops with 1-click Break Loop."
                  ),
                },
                {
                  id: "mod_6_c3",
                  icon: t("icon_warning", "warning"),
                  title: g("Severity 4 (Fatal) vs. Severity 3 (Tuning)"),
                  desc: g(
                    "Severity 4 indicates a hard binary/script clash where only one {mod} can remain enabled. Severity 3 indicates a tuning overlap solvable via Load Order priority."
                  ),
                },
                {
                  id: "mod_6_c4",
                  icon: t("icon_layers", "layers"),
                  title: g("Schema-Driven Deployment Strategies"),
                  desc: g(
                    "Adapts per game schema: dynamic Resource.cfg multi-tier folders (Sims 4), ordered manifest lists (loadorder.txt / plugins.txt), numeric prefixes (001_), or timestamps."
                  ),
                },
              ],
            },
            {
              id: "mod_7",
              icon: t("icon_science", "science"),
              overline: "MODULE 7 OF 12",
              badge: g("7. Homestead Lab"),
              title: g("Homestead Lab & 100% Nuke Isolation"),
              footerMeta: g("AIRGAPPED SANDBOX • LIVE CRASH CAPTURE"),
              desc: g(
                "Test unverified {mods} or pit two conflicting {mods} against each other in an airgapped sandbox without risking your real save files or main loadout."
              ),
              tip: g(
                "Passing a timed Homestead Lab playtest and saving in-game automatically verifies your Sandbox {mod} for publishing!"
              ),
              subCards: [
                {
                  id: "mod_7_c1",
                  icon: t("icon_bolt", "bolt"),
                  title: g("100% Nuke Symlink Injection"),
                  desc: g(
                    "Temporarily strips your active loadout symlinks and injects only the isolated test subject plus its mandatory dependencies."
                  ),
                },
                {
                  id: "mod_7_c2",
                  icon: t("icon_shield", "shield"),
                  title: g("Hardware-Airgapped Lab Test Save"),
                  desc: g(
                    "Swaps your live Saves folder with a dedicated Lab Test Save slot during testing so your legacy households can never be corrupted."
                  ),
                },
                {
                  id: "mod_7_c3",
                  icon: t("icon_bug_report", "bug_report"),
                  title: g("Real-Time Exception & Crash Monitor"),
                  desc: g(
                    "Purges stale logs before launch and watches for LastException / engine crash output in real time, matching against community diagnostic signatures."
                  ),
                },
                {
                  id: "mod_7_c4",
                  icon: t("icon_compare_arrows", "compare_arrows"),
                  title: g("1v1 Conflict Stability Protocol"),
                  desc: g(
                    "Pit two suspected conflicting {mods} together in isolation to verify compatibility and submit telemetry directly to Architects."
                  ),
                },
              ],
            },
            {
              id: "mod_8",
              icon: t("icon_history", "history"),
              overline: "MODULE 8 OF 12",
              badge: g("8. {Backups} & IDE"),
              title: g("{Backups} & {Citizen}'s Workbench"),
              footerMeta: g("HARDLINK SNAPSHOTS • VISUAL CONFIG IDE"),
              desc: g(
                "Protect your saves and game binaries with zero-duplication hardlink backups, and fine-tune {mod} configuration files using visual sliders or the built-in Monaco IDE."
              ),
              tip: g(
                "When DEFCON 1 is declared for an incoming game patch, Sanctuary automatically prompts to seal a Pre-Patch {Backups} before launching."
              ),
              subCards: [
                {
                  id: "mod_8_c1",
                  icon: t("icon_archive", "archive"),
                  title: g("World State (Purple) & Engine Core (Pink)"),
                  desc: g(
                    "Independently snapshot your Saves/Tray/Configs (World State) and your actual Game Installation Binaries (Engine Core) before patches hit."
                  ),
                },
                {
                  id: "mod_8_c2",
                  icon: t("icon_home_storage", "home_storage"),
                  title: g("0 MB Delta Hardlink Deduplication"),
                  desc: g(
                    "Unchanged files are linked via native OS hardlinks rather than copied—making snapshots near-instant and consuming disk space only for changed bytes."
                  ),
                },
                {
                  id: "mod_8_c3",
                  icon: t("icon_settings_backup_restore", "settings_backup_restore"),
                  title: g("Differential Rollback & Surgical Extraction"),
                  desc: g(
                    "Restore an entire snapshot via fast differential sync, or browse inside any {Backups} to surgically extract a single household save slot."
                  ),
                },
                {
                  id: "mod_8_c4",
                  icon: t("icon_construction", "construction"),
                  title: g("{Citizen}'s Workbench & Open {Mason} Workshop"),
                  desc: g(
                    "Edit {mod} .json/.ini/.cfg files with safe visual toggles and sliders synced live with a Monaco Raw Code Diff editor—plus full local Sandbox & Export Release tools for all {Citizens}."
                  ),
                },
              ],
            },
            {
              id: "mod_9",
              icon: t("icon_shield", "shield"),
              overline: "MODULE 9 OF 12",
              badge: g("9. Themes & Security"),
              title: g("Chameleons, Lexicons & Malware Defense"),
              footerMeta: g("LIQUID GLASS V3 • UNIVERSAL 21+17 HEURISTICS"),
              desc: g(
                "Personalize every pixel and word of Sanctuary OS while staying protected by cryptographic SHA-256 DNA blacklists and the multi-format Rust Heuristic Scanner."
              ),
              tip: g(
                "Sanctuary OS works 100% offline without an account—and if you sign in, elevated roles are protected by hardware/biometric FIDO2 Passkeys."
              ),
              subCards: [
                {
                  id: "mod_9_c1",
                  icon: t("icon_palette", "palette"),
                  title: g("Chameleon Theme Forge & Liquid Glass"),
                  desc: g(
                    "Switch between Dark and Light presets, download community Chameleons, or build your own in Theme Forge with live refractive saturation, rim light, and specular glare sliders."
                  ),
                },
                {
                  id: "mod_9_c2",
                  icon: t("icon_translate", "translate"),
                  title: g("Lexicon Protocol (Word-as-a-Service)"),
                  desc: g(
                    "Hot-swap the entire OS vocabulary between Standard Technical English, Sanctuary Sci-Fi Cyberpunk, Sims-Friendly Casual, or Simlish."
                  ),
                },
                {
                  id: "mod_9_c3",
                  icon: t("icon_security", "security"),
                  title: g("Universal 21+17 Multi-Format Heuristic Scanner"),
                  desc: g(
                    "Combines 21 Sanctuary Foundry Core Heuristics and 17 Spoke Heuristics with Zlib/Zstd DBPF stream decompression to inspect .zip, .ts4script, .package, .dll, .exe, and .pyc files."
                  ),
                },
                {
                  id: "mod_9_c4",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: g("Full-OS Malware Lockdown & Secure Shred"),
                  desc: g(
                    "If Tier 5 Malware is detected, Sanctuary isolates the file in Quarantine, locks the workspace shell, displays the exact trigger & source in the side panel, and overwrites the file with zeros upon your Secure Shred signature."
                  ),
                },
              ],
            },
            {
              id: "mod_10",
              icon: t("icon_cloud_upload", "cloud_upload"),
              overline: "MODULE 10 OF 12",
              badge: g("10. Static Edge"),
              title: g("Decentralized Static Edge Release & Catalog Engine"),
              footerMeta: g("MANIFEST.JSON • CATALOG.JSON • 6-PROVIDER AUTO-PUSH"),
              desc: g(
                "Zero-server update distribution for independent {Masons} and Tier 1–4 creators—supporting 1-click direct push, automatic SHA-256 lineage rollover, and in-place {Vault} upgrades."
              ),
              tip: g(
                "Use a single catalog.json URL across your entire {mod} portfolio so {Citizens} receive update pings for every {mod} from one static file."
              ),
              subCards: [
                {
                  id: "mod_10_c1",
                  icon: t("icon_cloud_upload", "cloud_upload"),
                  title: g("6-Provider 1-Click Direct Push"),
                  desc: g(
                    "Push manifest.json or catalog.json directly from the Rust backend to GitHub, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
                  ),
                },
                {
                  id: "mod_10_c2",
                  icon: t("icon_history", "history"),
                  title: g("Automatic previous_hashes Lineage Rollover"),
                  desc: g(
                    "Absorbs historical SHA-256 hashes from your Sandbox and remote manifest so existing {Citizens} are notified immediately when v1.1+ ships."
                  ),
                },
                {
                  id: "mod_10_c3",
                  icon: t("icon_find_replace", "find_replace"),
                  title: g("In-Place Lineage File Replacement"),
                  desc: g(
                    "Dropping an updated .zip automatically locates the older file by its previous_hashes lineage and replaces it in-place without leaving duplicate {mods}."
                  ),
                },
                {
                  id: "mod_10_c4",
                  icon: t("icon_lock", "lock"),
                  title: g("100% Local API Token Isolation"),
                  desc: g(
                    "Personal Access Tokens stay strictly on your local machine and are never transmitted to Sanctuary servers or bundled into exported .zip archives."
                  ),
                },
              ],
            },
            {
              id: "mod_11",
              icon: t("icon_schema", "schema"),
              overline: "MODULE 11 OF 12",
              badge: g("11. Schema & Lexicon"),
              title: g("Master Schema Studio & Lexicon Terminology Studio"),
              footerMeta: g("7 ENGINE PRESETS • 21 {GLOSSARY} TOKENS • ICON OVERRIDES"),
              desc: g(
                "Visual IDEs for engineering cross-platform game schemas (Windows & macOS) and hot-swapping all 1,700+ OS localization strings, dynamic glossary tokens, and Material icons."
              ),
              tip: g(
                "Click the book icon (Schema Codex / Lexicon Codex) in the studio header at any time for an interactive field-by-field reference."
              ),
              subCards: [
                {
                  id: "mod_11_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: g("Cross-Platform Binaries, Routes & Config Watcher"),
                  desc: g(
                    "Map Windows (.exe) and macOS (.app) paths, custom secondary install_routes (.world, .asi, .dll), and config_extensions for live in-game config syncing."
                  ),
                },
                {
                  id: "mod_11_c2",
                  icon: t("icon_category", "category"),
                  title: g("Game-Agnostic {Mod} Categories & Exception Rules"),
                  desc: g(
                    "Define custom per-game {mod} categories and regex/keyword exception log diagnostic matchers directly inside the Master Schema JSON."
                  ),
                },
                {
                  id: "mod_11_c3",
                  icon: t("icon_translate", "translate"),
                  title: g("21 Dynamic {Glossary} Tokens & Smart Grammar"),
                  desc: g(
                    "Change {Mod}, {Vault}, or {Blueprint} once in Tab 1 to interpolate across 1,700+ strings with automatic casing and indefinite article ('a'/'an') grammar."
                  ),
                },
                {
                  id: "mod_11_c4",
                  icon: t("icon_apps", "apps"),
                  title: g("Guided Searchable Icon Override Builder"),
                  desc: g(
                    "Select any target OS icon from a searchable dropdown and pick a replacement Material Symbol with live Default → New glyph previews."
                  ),
                },
              ],
            },
            {
              id: "mod_12",
              icon: t("icon_handshake", "handshake"),
              overline: "MODULE 12 OF 12",
              badge: g("12. Spoke & Covenants"),
              title: g("Wayfinder Spoke Control, Covenants & Supporter Bridge"),
              footerMeta: g("PARTNERS AGREEMENT • CUT THE CORD • 0%-CUT DONATIONS"),
              desc: g(
                "Full community database sovereignty for Partner Spokes, transparent legal covenants, non-custodial 0%-cut community donations, and the $5 = +30 Days Dev Build pipeline."
              ),
              tip: g(
                "All Directives, Legal Covenants, Schemas, and Lexicons use local codebase files for offline backup while syncing live updates from the Hub database."
              ),
              subCards: [
                {
                  id: "mod_12_c1",
                  icon: t("icon_gavel", "gavel"),
                  title: g("Partners Agreement & Compliance Protocol"),
                  desc: g(
                    "Accessible anytime in Wayfinder Spoke Maintenance and required before submitting a Partner Spoke application on the Landing Page."
                  ),
                },
                {
                  id: "mod_12_c2",
                  icon: t("icon_link_off", "link_off"),
                  title: g("Unilateral 'Cut the Cord' Severance"),
                  desc: g(
                    "Double-click Cut the Cord in Wayfinder Hub to scrub your service key from the Hub while keeping 100% of your community's 36-table Supabase database."
                  ),
                },
                {
                  id: "mod_12_c3",
                  icon: t("icon_volunteer_activism", "volunteer_activism"),
                  title: g("0%-Cut Non-Custodial Community Donations"),
                  desc: g(
                    "Bind your community's own Stripe, Ko-fi, or OpenCollective checkout link in Spoke Control—Sanctuary OS takes 0% platform cut."
                  ),
                },
                {
                  id: "mod_12_c4",
                  icon: t("icon_system_update_alt", "system_update_alt"),
                  title: g("Daily Dev Builds & Cross-Platform Auto-Updater"),
                  desc: g(
                    "Supporters ($5 = +30 Days) and Partner team members receive automated Windows (.msi/.exe) and macOS (.dmg/.app.tar.gz) Dev Build updates."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "roles",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          label: g("6 TIERS"),
          value: g("Role Tiers"),
          cards: elevatedRolesCards,
        },
      ],
    };
  }

  if (slug === "phase_roadmap") {
    const roadmapCards: DirectiveBuilderCard[] = [
      {
        id: "phase_13",
        icon: t("icon_auto_awesome", "auto_awesome"),
        overline: g("PHASE 13 (V5.8) • OCTOBER 2026 — ACTIVE ERA"),
        badge: g("ACTIVE PHASE"),
        title: g(
          "Sovereign Multi-Engine Studios, Universal 21+17 Heuristics & Bilateral Cloud Sync"
        ),
        footerMeta: g(
          "Master Schema & Lexicon Studios, Guided Icon Builder, Universal AV, Static Edge Auto-Push & Partner Covenants"
        ),
        desc: g(
          "Delivered the 4-Tab Master Schema Studio & Lexicon Terminology Studio with Guided Icon Overrides and Interactive Codex Guides, upgraded the Universal Heuristic Scanner (21 Core + 17 Spoke rules with Zlib/Zstd DBPF & Base64/Hex deobfuscation), added 6-provider Static Edge Direct Push, Readiness-Gated Partner Applications with mandatory Covenants, and Bilateral Codebase ↔ Cloud Sync."
        ),
        status: "active",
        subCards: [
          {
            id: "phase_13_m1",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Master Schema Studio, macOS Pathing & Dynamic Config Watcher"),
            desc: g(
              "7 multi-game architecture presets, Windows (.exe) & macOS (.app) coordinate mapping, secondary install_routes, game-agnostic mod_categories, and live config_extensions syncing."
            ),
            pending: false,
          },
          {
            id: "phase_13_m2",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Lexicon Visual Studio, Guided Icon Override Builder & Codex Guides"),
            desc: g(
              "Searchable Material Symbol override builder with Default → New glyph previews, themed checkboxes, parity validation bar, and interactive Schema & Lexicon Codex drawers."
            ),
            pending: false,
          },
          {
            id: "phase_13_m3",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Universal Multi-Format Heuristic Scanner (21 Core + 17 Spoke Rules)"),
            desc: g(
              "In-memory Zlib/Zstd DBPF stream decompression, Base64/Hex deobfuscation, Move-mode source disposition tracking, and Zero-PII Threat Manifest reporting."
            ),
            pending: false,
          },
          {
            id: "phase_13_m4",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Decentralized Static Edge Direct Push & Multi-Mod catalog.json"),
            desc: g(
              "1-click OS Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, WebDAV, and Local Folders with automatic previous_hashes lineage rollover."
            ),
            pending: false,
          },
          {
            id: "phase_13_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Readiness-Gated Partner Onboarding, Covenants & Supporter Pipeline"),
            desc: g(
              "Mandatory Partners Agreement & Compliance Protocol review before Partner Spoke application, 0%-cut community donations, $5 = +30 Days Dev Builds, and Bilateral Codebase ↔ Cloud Sync."
            ),
            pending: false,
          },
        ],
      },
      {
        id: "phase_12",
        icon: t("icon_rocket_launch", "rocket_launch"),
        overline: g("PHASE 12 • JULY 15 – OCTOBER 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Agnostic Future — Multi-Workspace, Sanctuary V6 Liquid Glass & Web PWA"
        ),
        footerMeta: g(
          "{Citizens} Workbench / {Mason} IDE, Lexicon Revamp, Sanctuary Partners, V6 Liquid Glass & Website V2"
        ),
        desc: g(
          "Dual-Vision {Mason} IDE & Cloud Lexicons, Multi-Workspace Master Schemas & the 0%-cut Sanctuary Partners Agreement, the Sanctuary V6 3D Liquid Glass Engine & 18-Section Revamp, and Website V2 / Mobile PWA."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_12_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Citizens} Workbench & {Mason} IDE 2.0"),
            desc: g(
              "Named Version Timeline entries, simultaneous Dual-Vision (Visual + Raw Monaco) split editing, Author Mode scaffolding, and the side-by-side Lexicon Builder."
            ),
          },
          {
            id: "phase_12_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Lexicon Revamp & Cloud Schemas"),
            desc: g(
              "Deduplicated all localization dictionaries, moved default Lexicon JSONs to the cloud database, and added official Sanctuary & Community badges."
            ),
          },
          {
            id: "phase_12_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Multi-Workspace & Sanctuary Partners"),
            desc: g(
              "Shared Core App and SSO with per-game Master Schemas, 100% Partner DB ownership ('Cut the Cord'), 0%-cut Partner Donations, and 1-File Standalone Forking."
            ),
          },
          {
            id: "phase_12_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Sanctuary V6 & Liquid Glass Engine"),
            desc: g(
              "4-layer 3D Refractive Liquid Glass Engine, revamped Default Themes + The Sims 4 ('Plumbob Crystal') Partner Chameleon, and Chameleon Theme Forge 2.0."
            ),
          },
          {
            id: "phase_12_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Dynamic Alert Tiles & 18-Section Revamp"),
            desc: g(
              "Floating 2-Pill Title Bar, Hover Dock, 5 Dynamic Alert Stat Tiles (Permissions, Global, Critical, System, Updates), and a full 18-section UI overhaul."
            ),
          },
          {
            id: "phase_12_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Website V2, Mobile PWA & Remote Queuing"),
            desc: g(
              "Unified single-codebase Web OS & PWA (sanctuaryos.net/sims4) with live Comm-Link, Nexus, Support Desk, Command Hubs, and Web-to-PC {Blueprint} queuing."
            ),
          },
          {
            id: "phase_12_m11",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Schema-Driven Load Order Compiler"),
            desc: g(
              "Declarative Master Game Schemas powering multi-strategy topological compilation across folder priority, manifest lists, numeric prefixes, and timestamps."
            ),
          },
          {
            id: "phase_12_m12",
            icon: t("icon_check_circle", "check_circle"),
            title: g("FIDO2 Passkey {Vault} & Quarantine Lockdown"),
            desc: g(
              "Hardware WebAuthn Passkey gates for Elevated Hubs, Full-OS Malware Quarantine SidePanel Lockdown, Silent Updater, and Bilateral Directives Sync."
            ),
          },
        ],
      },
      {
        id: "phase_11",
        icon: t("icon_public", "public"),
        overline: g("PHASE 11 • MAY 17 – JULY 13, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Technical Debt Repayment, {Citizens} Workbench & The Agnostic Sprint"
        ),
        footerMeta: g(
          "Native Intake & Support Desk, {Citizens} Workbench 1.0 & Game-Agnostic Kernel"
        ),
        desc: g(
          "Integrated {Mason} & Architect intake forms, native Bug Reports & Support Ticket Dossiers, {Citizens} Workbench 1.0 (.cfg/.ini/.json + Monaco IDE + Sanctuary Templates), full 11-section Lexicon/UI sweep, and the Agnostic Sprint."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_11_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Native Intake Forms & Support Desk"),
            desc: g(
              "Integrated {Mason} UUID registration, Architect intake forms, Bug Reports, and encrypted Support Ticket dossiers directly into the Desktop App."
            ),
          },
          {
            id: "phase_11_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Citizens} Workbench 1.0 & Sanctuary Templates"),
            desc: g(
              "Automatic .cfg, .ini, and .json detection in the {Vault} with an embedded Monaco IDE and visual slider/toggle Schema Mapping."
            ),
          },
          {
            id: "phase_11_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Agnostic Sprint & Master Schemas"),
            desc: g(
              "Extracted all hardcoded Sims 4 (.package / .ts4script) checks across 17 frontend modules and the Rust backend into dynamic Master JSON Schemas."
            ),
          },
          {
            id: "phase_11_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Integrated Side Browser & {Vault} Intercept"),
            desc: g(
              "Embedded multi-tab Side Browser that automatically intercepts .zip, .rar, .7z, .package, and .ts4script downloads straight into the {Vault}."
            ),
          },
          {
            id: "phase_11_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Full-Stack Security & Forensic Audit"),
            desc: g(
              "Hardened Rust path-traversal guards (is_safe_user_file_path), Supabase Row-Level Security (RLS) policies, and immutable append-only audit logs."
            ),
          },
          {
            id: "phase_11_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Oversight {Mason} Linker & Lexicon Sweep"),
            desc: g(
              "Deployed the Oversight {Mason} Linker, automatic Unregistered {Vault} syncing on Nexus verification, and a full 11-section Lexicon/UI sweep."
            ),
          },
        ],
      },
      {
        id: "phase_10",
        icon: t("icon_palette", "palette"),
        overline: g("PHASE 10 • MAY 10 – MAY 16, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Post-Alpha Revamp, Visual Protocol Manager & Senior Architect Mass Update"
        ),
        footerMeta: g(
          "Dev Sandbox, Visual Protocol Schema, Theme Forge & Mass Triage"
        ),
        desc: g(
          "Launched the isolated Dev Sandbox & 'Sync to Network' creator pipeline, visual database-schema Protocol Manager, Folder Structure builder, Senior Architect Mass Update console, The Nexus registry, and Chameleon Theme Forge."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_10_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Isolated Dev Sandbox & Sync to Network"),
            desc: g(
              "Dedicated local Dev Sandbox folder bypassing radar hash churn for WIP {mods}, paired with 1-click 'Sync to Network' release promotion."
            ),
          },
          {
            id: "phase_10_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Visual Protocol & Folder Structure Builder"),
            desc: g(
              "Database-schema visual Protocol Manager (Core & Addons, Flavors, Dependencies, DLC) and visual Folder Structure builder enforced by Sanitize {Vault}."
            ),
          },
          {
            id: "phase_10_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Senior Architect Mass Update & Filters"),
            desc: g(
              "Bulk post-patch triage console for Senior Architects alongside 'Game Version', 'Currently Eligible', and 'Exclude Unowned DLC' filters."
            ),
          },
          {
            id: "phase_10_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Nexus Discovery Registry"),
            desc: g(
              "Global metadata catalog for {Mods}, {Blueprints}, Lexicons, Chameleons, and Templates with automatic game patch and DLC compatibility filtering."
            ),
          },
          {
            id: "phase_10_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Chameleon Theme Forge & Holo Sandbox"),
            desc: g(
              "Interactive Theme Forge suite featuring a multi-stop atmospheric Background Builder, Dark/Light adaptation, and live Holo Sandbox previewing."
            ),
          },
          {
            id: "phase_10_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Hot-Swappable Lexicon Protocol"),
            desc: g(
              "Word-as-a-Service localization engine routing 100% of UI labels and icons through hot-swappable JSON dictionaries."
            ),
          },
        ],
      },
      {
        id: "phase_9",
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        overline: g("PHASE 9 • MAY 8 – MAY 9, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Infrastructure Finalization, Laboratory Diagnostics & Command Hubs"
        ),
        footerMeta: g(
          "Proving Grounds Simulation, macOS Universal Pipeline & Command Hubs"
        ),
        desc: g(
          "Transitioned Homestead Proving Grounds into a live simulation laboratory with real-time log monitoring, deployed the Senior Architect & Wayfinder Command Hubs, automated signed macOS Universal (.dmg) builds, and enforced Florida Compliance Tiers 1–4."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_9_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Live Proving Grounds & macOS Pipeline"),
            desc: g(
              "Real-time crash log monitoring with 1-click conflict rule pushing in the Homestead Lab, plus signed macOS Universal (.dmg) GitHub Actions builds."
            ),
          },
          {
            id: "phase_9_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Five Elevated Command Hubs"),
            desc: g(
              "Dedicated ElevatedHubLayout command centers for {Mason} Workshop, Architect Console, Oversight Command, Wayfinder Operations, and Keepers Core."
            ),
          },
          {
            id: "phase_9_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Claimable Support Desk Ticket Dossiers"),
            desc: g(
              "Interactive ticket dossiers equipped with PII-scrubbed crash logs, response macros, and cross-tier escalation between Architects and Oversight."
            ),
          },
          {
            id: "phase_9_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Florida Compliance Tiers 1–4"),
            desc: g(
              "Automated public feed scrubbing and Cloud {Blueprint} hash purge triggers protecting public discovery while preserving local {Vault} freedom."
            ),
          },
        ],
      },
      {
        id: "phase_8",
        icon: t("icon_cell_tower", "cell_tower"),
        overline: g("PHASE 8 • MAY 7 – MAY 8, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Standardized Lexicons, Dynamic Engine Recognition & DEFCON Shield"
        ),
        footerMeta: g(
          "Rust Rip Protocol, Auto-Sanitization Launch & DEFCON 1 Shield"
        ),
        desc: g(
          "Engineered the Rust 'Rip Protocol' for dynamic engine version recognition, Auto-Sanitization Launch purging stale crash logs & caches, Global Lexicon Extraction, the {Blueprint} Architect Load Order UI, and the real-time DEFCON 1 patch shield."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_8_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Rust 'Rip Protocol' & Auto-Sanitization"),
            desc: g(
              "Dynamic engine version recognition parsing Default.ini and PE headers in Rust, plus pre-launch purging of stale LastException and cache files."
            ),
          },
          {
            id: "phase_8_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Global Comm-Link Broadcast Feed"),
            desc: g(
              "Real-time community feed supporting WYSIWYG/Markdown dispatches, multi-level threaded replies, and dedicated Discover & Following tabs."
            ),
          },
          {
            id: "phase_8_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("DEFCON 1 Pre-Patch Network Shield"),
            desc: g(
              "Real-time network listener that intercepts game launches during breaking engine patches to prompt an emergency {Backups} backup."
            ),
          },
          {
            id: "phase_8_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Tier 5 Malware Scanner & Secure Shred"),
            desc: g(
              "Byte-level heuristic malware scanner, {Citizen}-signed 3-pass Secure Shredding, and the privacy-first hardware_bans Nuclear Override."
            ),
          },
        ],
      },
      {
        id: "phase_7",
        icon: t("icon_construction", "construction"),
        overline: g("PHASE 7 • MAY 6, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Core Architecture, {Backups} Compression & Windows MSI Pipeline"
        ),
        footerMeta: g(
          "Nested {Vault} Taxonomy, 78 GB → 24 GB Engine Compression & Automated MSI Builds"
        ),
        desc: g(
          "Deployed the nested {Vault} directory hierarchy, optimized {Backups} Engine Core compression (78 GB → 24 GB) with <50s rollbacks, automated Windows .msi GitHub Actions builds, and integrated Scout Dossiers into Conflict Radar."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_7_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Nested {Vault} Taxonomy & 24 GB Compression"),
            desc: g(
              "Self-healing {Vault} hierarchy (Backups/World, Backups/Engine, Data/cache, Quarantine) and 78 GB → 24 GB Engine Core compression with <50s rollbacks."
            ),
          },
          {
            id: "phase_7_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Schema-Driven Visual Config Workbench"),
            desc: g(
              "Visual configuration studio rendering raw {mod} settings as interactive sliders and toggles synchronized live with a Monaco Raw Editor."
            ),
          },
          {
            id: "phase_7_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Mason} Workshop & Collections Orchestrator"),
            desc: g(
              "Creator suite featuring an isolated Dev Sandbox, Collections Builder, and relational Protocol Orchestrator for Twins, Flavors, and Dependencies."
            ),
          },
          {
            id: "phase_7_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("In-Process Rust PE Executable Parser"),
            desc: g(
              "Native Rust pelite binary parser extracting genuine patch versions directly from .exe headers with zero antivirus false positives."
            ),
          },
        ],
      },
      {
        id: "phase_6",
        icon: t("icon_science", "science"),
        overline: g("PHASE 6 • MAY 3 – MAY 5, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Codebase Modularization, Comm-Link Ledger & Homestead Proving Grounds"
        ),
        footerMeta: g(
          "Creator Following Feed, App.tsx Modularization & Nuke Sandbox"
        ),
        desc: g(
          "Launched the Creator Following system and real-time Comm-Link discovery ledger, modularized App.tsx into dedicated domain views, extracted Yeet Cascade casualty tracking, and built the 100% Nuke Isolation Proving Grounds."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_6_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Creator Following & Domain Modularization"),
            desc: g(
              "Added the Creator Following feed to Comm-Link, modularized App.tsx into dedicated domain views, and extracted Yeet Cascade casualty tracking."
            ),
          },
          {
            id: "phase_6_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("100% Nuke Injection Sandbox"),
            desc: g(
              "Temporarily strips active {Vault} symlinks during Proving Grounds runs to inject only the isolated test subject and its mandatory dependencies."
            ),
          },
          {
            id: "phase_6_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("1v1 Conflict Stability Arena"),
            desc: g(
              "Pits two suspected colliding {mods} head-to-head in an airgapped test environment while monitoring real-time engine stability."
            ),
          },
          {
            id: "phase_6_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Automated Crash Log Harvester & Scrubber"),
            desc: g(
              "Captures lastException.txt crash logs automatically and scrubs local filesystem paths and PII (scrub_user_data_from_log) before sharing."
            ),
          },
        ],
      },
      {
        id: "phase_5",
        icon: t("icon_history", "history"),
        overline: g("PHASE 5 • MAY 1 – MAY 3, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Defensive Protocols, Symlink Airgap 2.1 & {Mason} Protocol Manager"
        ),
        footerMeta: g(
          "Real-Time Airgap Watcher, DNA Duplicate Intercept & Time Capsule"
        ),
        desc: g(
          "Implemented Symlink Airgap 2.1 real-time .cfg/.ini file watching in Rust, SHA-256 DNA duplicate interception, {Mason} Protocol Manager 1.0, intelligent Google Search fallback, and hardlink {Backups} snapshots."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_5_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Real-Time Airgap Watcher & DNA Intercept"),
            desc: g(
              "Non-blocking Rust notify thread syncing live in-game .cfg/.ini edits back to the {Vault}, plus SHA-256 duplicate interception on drop."
            ),
          },
          {
            id: "phase_5_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Dual-State {Backups} Architecture"),
            desc: g(
              "Independently snapshots World State (Saves, Tray & Settings) and Engine Core (Game Installation Binaries) before patches or {mod} tests."
            ),
          },
          {
            id: "phase_5_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Zero-Bloat OS Hardlink Snapshot Engine"),
            desc: g(
              "Pairs native NTFS/POSIX hardlink deduplication with .tar.zst Zstandard compression so unchanged files consume zero extra disk space."
            ),
          },
          {
            id: "phase_5_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Differential Rollback Comparator"),
            desc: g(
              "High-speed diff_backup engine that restores only modified bytes and purges rogue files without re-copying the entire installation."
            ),
          },
        ],
      },
      {
        id: "phase_4",
        icon: t("icon_radar", "radar"),
        overline: g("PHASE 4 • APRIL 28 – MAY 1, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "The Global Network, Radiant Light Mode & Cloud {Blueprints}"
        ),
        footerMeta: g(
          "Radiant ThemeProvider, SNC-XXXXX Cloud Codes & Conflict Radar"
        ),
        desc: g(
          "Expanded beyond dark-only Bunker to Radiant Light Mode with real-time ThemeProvider switching, launched 6-digit Cloud {Blueprint} transmissions (SNC-XXXXX), added the Architect Signature gate, and established Conflict Radar Severity 1–4."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_4_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Radiant Mode, ThemeProvider & Signature Gate"),
            desc: g(
              "Introduced Radiant (Light Mode) and real-time ThemeProvider profile switching, 6-digit Cloud {Blueprint} codes, and the Architect Signature gate."
            ),
          },
          {
            id: "phase_4_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Severity 1–4 Collision Matrix"),
            desc: g(
              "Proactive conflict classifier distinguishing minor overlaps from Severity 3 Tuning Overlaps and Severity 4 Fatal Clashes."
            ),
          },
          {
            id: "phase_4_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Priority Tier Folders & Dynamic Resource.cfg"),
            desc: g(
              "Multi-tier override directories (Sanctuary1–Sanctuary3) paired with automated Resource.cfg priority depth compilation."
            ),
          },
          {
            id: "phase_4_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Architect Console & Crowd-Sourced Scout Queue"),
            desc: g(
              "Dedicated moderation console for verifying community Scout Dossier submissions behind Copilot confirmation gates."
            ),
          },
        ],
      },
      {
        id: "phase_3",
        icon: t("icon_hub", "hub"),
        overline: g("PHASE 3 • APRIL 15 – APRIL 28, 2026"),
        badge: g("COMPLETED"),
        title: g("System Rip, Deep Yeet 2.0 & Logic Intelligence"),
        footerMeta: g(
          "Deep Yeet 2.0, UTF-16 Version Ripper, Twin Bonds & Copilot"
        ),
        desc: g(
          "Engineered Deep Yeet 2.0 recursive dependency cascade scanning, the Rust UTF-16 byte-filter System Version Ripper, Twin Bond synchronized script/package links, and the Copilot Philosophy halting for manual {Citizen} signature."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_3_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Deep Yeet 2.0 & UTF-16 Version Ripper"),
            desc: g(
              "Recursive dependency cascade scanner queuing orphaned addons on master removal, paired with the Rust UTF-16 binary version ripper."
            ),
          },
          {
            id: "phase_3_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Atomic Logic Triumvirate"),
            desc: g(
              "Relational {mod} rules enforcing Highlander Flavor eviction, bidirectional .package/.ts4script Twin bonds, and Recursive Chain-Link Dependencies."
            ),
          },
          {
            id: "phase_3_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Orphaned Addon Cascade Protection"),
            desc: g(
              "Intercepts master library removal and halts for the {Citizen}'s manual signature before cleanly unequipping or removing dependent child add-ons."
            ),
          },
          {
            id: "phase_3_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("SNCXXX Cloud {Blueprints} & Ghosted States"),
            desc: g(
              "6-character alphanumeric Cloud {Blueprint} share codes, portable offline JSON exports, and automatic Missing DLC Ghosting diagnostics."
            ),
          },
        ],
      },
      {
        id: "phase_2",
        icon: t("icon_map", "map"),
        overline: g("PHASE 2 • APRIL 10 – APRIL 15, 2026"),
        badge: g("COMPLETED"),
        title: g("Visual Uplink, Glassmorphism 1.0 & The Quarantine Zone"),
        footerMeta: g(
          "Glassmorphism 1.0, Quarantine Bio-Hazard Sector & Symlink Airgap"
        ),
        desc: g(
          "Introduced the Glassmorphism 1.0 backdrop-blur engine, constructed the dedicated bio-hazard Quarantine Zone for isolating malicious files, and unified the app into a layered desktop OS experience backed by Symlink Airgap and SQLite caching."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_2_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Glassmorphism 1.0 & Bio-Hazard Quarantine"),
            desc: g(
              "Translucent backdrop-blur glass containers with deep elevation shadows and a dedicated Quarantine Zone for isolating and shredding threats."
            ),
          },
          {
            id: "phase_2_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Symlink Airgap 2.5 Projection Engine"),
            desc: g(
              "Projects active {mods} from the isolated {Vault} into the live game directory via zero-copy OS symlinks in milliseconds."
            ),
          },
          {
            id: "phase_2_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Sub-Second SQLite Delta Scanner"),
            desc: g(
              "Local .sanctuary_cache.db SQLite engine using mtime-first delta checks to index 5,000+ {mod} Vaults in sub-second sweeps."
            ),
          },
          {
            id: "phase_2_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Self-Healing {Vault} Sanitizer & Profiles"),
            desc: g(
              "Automatically maintains the isolated {Vault} directory structure and powers instant local {Blueprint} loadout switching."
            ),
          },
        ],
      },
      {
        id: "phase_1",
        icon: t("icon_inventory_2", "inventory_2"),
        overline: g("PHASE 1 • APRIL 1 – APRIL 10, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Bunker Initialization, Cartographer Protocol & SHA-256 DNA Pathing"
        ),
        footerMeta: g(
          "First-Boot Cartographer Recon & Millisecond Delta Caching"
        ),
        desc: g(
          "Initialized the Tauri v2 + Rust + React 18 architecture, built The Cartographer automated first-boot reconnaissance scanner for Game Bin & {Mods} directories, and engineered SHA-256 DNA delta caching."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_1_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Cartographer Recon & Millisecond Delta Cache"),
            desc: g(
              "Automated first-boot drive reconnaissance locating Game Bin & {Mods} folders, paired with SHA-256 delta caching for instant startup."
            ),
          },
          {
            id: "phase_1_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Tauri v2 + Rust + React 18 Kernel"),
            desc: g(
              "Foundational desktop OS architecture combining a native multi-threaded Rust backend with React 18, TypeScript, and Zustand."
            ),
          },
          {
            id: "phase_1_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Automated Coordinate Discovery Wizard"),
            desc: g(
              "Guided first-launch Cartographer setup linking Game Binaries, live {Mods} folders, and airgapped Bunker {Vault} coordinates."
            ),
          },
          {
            id: "phase_1_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Streaming SHA-256 DNA & Archive Inspector"),
            desc: g(
              "Multi-threaded Rust cryptographic hashing and in-memory DBPF/ZIP header inspection without extracting archives to disk."
            ),
          },
        ],
      },
    ];

    return {
      slug: "phase_roadmap",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Engineering Phase Roadmap (Phase 13 → Phase 1)"),
      summary: g(
        "Interactive reverse-chronological engineering timeline tracking Sanctuary OS from Phase 13 (V5.8 Multi-Engine Studios, Universal Heuristics & Bilateral Cloud Sync) and Phase 12 down to Phase 1."
      ),
      tabs: [
        {
          id: "all",
          icon: t("icon_timeline", "timeline"),
          label: g("13 Phases"),
          value: g("Full Timeline"),
          cards: roadmapCards,
        },
      ],
    };
  }

  if (slug === "forking_guide") {
    return {
      slug: "forking_guide",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: t("sd_card_fork_title", "Forking & Spoke Provisioning Matrix"),
      summary: t(
        "sd_card_fork_desc",
        "Interactive schematic for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), reviewing Partner Covenants, launching a 1-file Standalone Codebase Fork (src/supabase.ts), or building cross-platform Master Schemas."
      ),
      tabs: [
        {
          id: "spoke",
          icon: t("icon_hub", "hub"),
          label: t("dir_fk_t1_lbl", "STEP 1"),
          value: t("dir_fk_t1_val", "Spoke Setup"),
          cards: [
            {
              id: "fork_spoke_setup",
              icon: t("icon_hub", "hub"),
              overline: t(
                "sd_fork_spoke_hero_badge",
                "OFFICIAL PARTNER NETWORK • ZERO CODE EDITS"
              ),
              badge: t("active", "Active"),
              title: t(
                "sd_fork_spoke_hero_title",
                "Connect a Sovereign Community Spoke in 3 Steps"
              ),
              footerMeta: "SANCTUARY-UPLINK:// • schema.sql",
              desc: t(
                "sd_fork_spoke_hero_desc",
                "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
              ),
              subCards: [
                {
                  id: "fork_spoke_s1",
                  icon: t("icon_database", "database"),
                  title: t(
                    "sd_fork_spoke_step1_title",
                    "Step 1: Initialize Your Supabase Spoke (schema.sql)"
                  ),
                  desc: t(
                    "sd_fork_spoke_step1_desc",
                    "Create a free Supabase project, open the SQL Editor, and run schema.sql. This single script provisions all 36 community tables, RLS policies, immutable audit triggers, and role functions."
                  ),
                },
                {
                  id: "fork_spoke_s2",
                  icon: t("icon_key", "key"),
                  title: t(
                    "sd_fork_spoke_step2_title",
                    "Step 2: Generate Your SANCTUARY-UPLINK:// Bundle"
                  ),
                  desc: t(
                    "sd_fork_spoke_step2_desc",
                    "In Keepers Core -> Active Workspaces (or Wayfinder Hub), paste your Supabase URL, Anon Key, and Service Role Key to generate an encrypted SANCTUARY-UPLINK:// handshake bundle."
                  ),
                },
                {
                  id: "fork_spoke_s3",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: t(
                    "sd_fork_spoke_step3_title",
                    "Step 3: Verify Handshake & Provision Founding Wayfinder"
                  ),
                  desc: t(
                    "sd_fork_spoke_step3_desc",
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  ),
                },
              ],
            },
            {
              id: "fork_spoke_covenants",
              icon: t("icon_gavel", "gavel"),
              overline: t(
                "sd_fork_covenants_badge",
                "PARTNER APPLICATION • SOVEREIGN COVENANTS"
              ),
              badge: t("verified", "Verified"),
              title: t(
                "sd_fork_covenants_title",
                "Readiness-Gated Partner Application & Sovereign Covenants"
              ),
              footerMeta: "Partners Agreement • Compliance Protocol",
              desc: t(
                "sd_fork_covenants_desc",
                "Prospective community leaders can apply directly from the Landing Page after inspecting and accepting the Sanctuary Partners Agreement and Compliance Protocol."
              ),
              subCards: [
                {
                  id: "fork_cov_s1",
                  icon: t("icon_handshake", "handshake"),
                  title: t(
                    "sd_fork_cov_s1_title",
                    "Mandatory Partners Agreement & Compliance Review"
                  ),
                  desc: t(
                    "sd_fork_cov_s1_desc",
                    "Both covenants open in an interactive overlay drawer during Step 1 of the Partner Application and remain permanently accessible inside Wayfinder Hub -> Spoke Maintenance."
                  ),
                },
                {
                  id: "fork_cov_s2",
                  icon: t("icon_link_off", "link_off"),
                  title: t(
                    "sd_fork_cord_community_title",
                    "Community-Initiated Severance ('Cut the Cord')"
                  ),
                  desc: t(
                    "sd_fork_cord_community_desc",
                    "A Wayfinder can double-click 'Cut the Cord' in Wayfinder Hub at any time—writing an immutable audit log, setting is_active = false, and scrubbing the Spoke's service key from the Hub."
                  ),
                },
                {
                  id: "fork_cov_s3",
                  icon: t("icon_volunteer_activism", "volunteer_activism"),
                  title: t(
                    "sd_fork_cord_keeper_title",
                    "0% Platform Tax & Non-Custodial Community Donations"
                  ),
                  desc: t(
                    "sd_fork_cord_keeper_desc",
                    "Sanctuary OS takes 0% of {mason} Patreon/Ko-fi revenue and 0% of Partner community donations. Export your SANCTUARY-UPLINK:// bundle at any time."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "standalone",
          icon: t("icon_call_split", "call_split"),
          label: t("dir_fk_t2_lbl", "FORK MODES"),
          value: t("dir_fk_t2_val", "Standalone & Hub"),
          cards: [
            {
              id: "fork_mode_standalone",
              icon: t("icon_call_split", "call_split"),
              overline: t(
                "sd_fork_mode_standalone_badge",
                "MODE 1 • 1-DATABASE STANDALONE"
              ),
              badge: t("dir_fk_t2_val", "1-File Fork"),
              title: t(
                "sd_fork_mode_standalone_title",
                "1-File Standalone Fork (Single Database)"
              ),
              footerMeta: "schema.sql • src/supabase.ts",
              desc: t(
                "sd_fork_mode_standalone_desc",
                "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions."
              ),
              subCards: [
                {
                  id: "fork_m1_s1",
                  icon: t("icon_bolt", "bolt"),
                  title: t(
                    "sd_fork_standalone_s1_title",
                    "1. Unified Auth & Direct RPC Engine"
                  ),
                  desc: t(
                    "sd_fork_standalone_s1_desc",
                    "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
                  ),
                },
                {
                  id: "fork_m1_s2",
                  icon: t("icon_verified", "verified"),
                  title: t(
                    "sd_fork_standalone_s2_title",
                    "2. Automatic Founding Wayfinder Promotion"
                  ),
                  desc: t(
                    "sd_fork_standalone_s2_desc",
                    "The on_auth_user_created_spoke trigger in schema.sql detects when your standalone database has 0 Wayfinders and automatically promotes the very first registered user to Founding Wayfinder."
                  ),
                },
                {
                  id: "fork_m1_s3",
                  icon: t("icon_storage", "storage"),
                  title: t(
                    "sd_fork_standalone_s3_title",
                    "3. Transparent OS-to-Spoke Table Mapping"
                  ),
                  desc: t(
                    "sd_fork_standalone_s3_desc",
                    "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_hub",
              icon: t("icon_hub", "hub"),
              overline: t(
                "sd_fork_mode_hub_badge",
                "MODE 2 • FULL HUB & SPOKE FEDERATION"
              ),
              badge: t("dir_ar_t2_val", "Hub & Spokes"),
              title: t(
                "sd_fork_mode_hub_title",
                "Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)"
              ),
              footerMeta: "schema_os.sql + schema.sql • game-gateway",
              desc: t(
                "sd_fork_mode_hub_desc",
                "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql)."
              ),
              subCards: [
                {
                  id: "fork_m2_s1",
                  icon: t("icon_memory", "memory"),
                  title: t(
                    "sd_fork_hub_s1_title",
                    "1. Provision Core Hub Database (schema_os.sql)"
                  ),
                  desc: t(
                    "sd_fork_hub_s1_desc",
                    "Create your central Hub Supabase project and run schema_os.sql in the SQL Editor. This provisions global SSO profiles, FIDO2 user_passkeys, sanctuary_games, sanctuary_schemas, system_directives, and keeper_heuristic_signatures."
                  ),
                },
                {
                  id: "fork_m2_s2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: t(
                    "sd_fork_hub_s2_title",
                    "2. Deploy game-gateway Edge Function"
                  ),
                  desc: t(
                    "sd_fork_hub_s2_desc",
                    "Deploy supabase/functions/game-gateway to your Hub project (supabase functions deploy game-gateway). It validates Hub JWTs, checks roles, and executes cross-database mutations against each Spoke."
                  ),
                },
                {
                  id: "fork_m2_s3",
                  icon: t("icon_code", "code"),
                  title: t(
                    "sd_fork_hub_s3_title",
                    "3. Point src/supabase.ts at Your Core Hub"
                  ),
                  desc: t(
                    "sd_fork_hub_s3_desc",
                    "Keep mode set to 'hub_and_spoke' in src/supabase.ts (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env) pointing to your central Hub project's URL and Anon Key."
                  ),
                },
                {
                  id: "fork_m2_s4",
                  icon: t("icon_storage", "storage"),
                  title: t(
                    "sd_fork_hub_s4_title",
                    "4. Provision & Link Child Spoke Databases (schema.sql)"
                  ),
                  desc: t(
                    "sd_fork_hub_s4_desc",
                    "For each game community, create a separate Supabase project, run schema.sql, and register its URL, Anon Key, and Service Role Key (or SANCTUARY-UPLINK:// bundle) in Keepers Core -> Active Workspaces."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_schema",
              icon: t("icon_schema", "schema"),
              overline: t(
                "sd_fork_mode_schema_badge",
                "MODE 3 • MASTER GAME SCHEMAS & CROSS-PLATFORM"
              ),
              badge: t("sd_fork_mode_schema_short", "7 Engine Presets"),
              title: t(
                "sd_fork_mode_schema_title",
                "Master Schema Studio & Windows/macOS Build Pipeline"
              ),
              footerMeta: "sims4.json • Universal Darwin .dmg & Windows .msi",
              desc: t(
                "sd_fork_mode_schema_desc",
                "Adapt Sanctuary OS to any game engine without touching Rust or React code by configuring a declarative Master Schema JSON in Wayfinder or Keepers IDE."
              ),
              subCards: [
                {
                  id: "fork_m3_s1",
                  icon: t("icon_schema", "schema"),
                  title: t(
                    "sd_fork_m3_s1_title",
                    "7 Built-In Engine Architecture Presets"
                  ),
                  desc: t(
                    "sd_fork_m3_s1_desc",
                    "1-click templates for DBPF + Python, REDengine 4, Creation Engine, RAGE / OpenIV, Larian .pak, SMAPI, and Universal engines."
                  ),
                },
                {
                  id: "fork_m3_s2",
                  icon: t("icon_laptop_mac", "laptop_mac"),
                  title: t(
                    "sd_fork_m3_s2_title",
                    "Windows (.exe) & macOS (.app) Native Parity"
                  ),
                  desc: t(
                    "sd_fork_m3_s2_desc",
                    "Supports Windows %USERPROFILE% and macOS ~/Documents & /Applications/*.app bundles, plus universal-apple-darwin .dmg builds."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "sql",
          icon: t("icon_database", "database"),
          label: t("dir_fk_t3_lbl", "STEP 3"),
          value: t("dir_fk_t3_val", "SQL Schemas"),
          cards: [
            {
              id: "fork_sql_spoke",
              icon: t("icon_storage", "storage"),
              overline: t("dir_fork_sql_spoke_sub", "Spoke & Standalone DB • 36 Tables"),
              badge: "schema.sql",
              title: t("dir_fork_sql_spoke_val", "schema.sql (36 Tables)"),
              footerMeta: "Community Spoke & Standalone Fork SQL",
              desc: t(
                "dir_fork_sql_spoke_desc",
                "Complete community registry schema (mods, blueprints, masons, conflicts, tickets, heuristics, RLS policies, and Founding Wayfinder trigger)."
              ),
              subCards: [],
            },
            {
              id: "fork_sql_hub",
              icon: t("icon_dns", "dns"),
              overline: t("dir_fork_sql_hub_sub", "Core Hub Federation DB • SSO & Security"),
              badge: "schema_os.sql",
              title: t("dir_fork_sql_hub_val", "schema_os.sql (Core Hub DB)"),
              footerMeta: "Central Multi-Game Federation SQL",
              desc: t(
                "dir_fork_sql_hub_desc",
                "Central multi-game federation schema (global SSO profiles, FIDO2 passkeys, sanctuary_games directory, master schemas, global lexicons/themes, and core heuristics)."
              ),
              subCards: [],
            },
          ],
        },
      ],
    };
  }

  if (slug === "master_architecture") {
    return {
      slug: "master_architecture",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: t("sd_card_arch_title", "Master Architecture & Feature Blueprint"),
      summary: t(
        "sd_card_arch_desc",
        "Deep-dive interactive explorer into the Tauri v2 Rust core, Master Schema & Lexicon Visual Studios, Hub-and-Spoke Cloud Federation with Bilateral Codebase Sync, Symlink Airgap 2.5, and the Universal 21+17 Heuristic Scanner."
      ),
      tabs: [
        {
          id: "p1",
          icon: t("icon_memory", "memory"),
          label: t("dir_ar_t1_lbl", "PILLAR 1"),
          value: t("dir_ar_t1_val", "Core & Glass"),
          cards: [
            {
              id: "arch_p1",
              icon: t("icon_memory", "memory"),
              overline: t(
                "dir_arch_p1_badge",
                "ARCHITECTURE PILLAR 1 • CORE ENGINE, OPTICS & STUDIOS"
              ),
              badge: t("active", "Active"),
              title: t(
                "dir_arch_p1_heading",
                "Tauri v2 Rust Kernel, Liquid Glass V3, Schema Studio & Lexicon Engine"
              ),
              footerMeta: "Tauri v2 • React 18 • Liquid Glass V3 • Win & Mac",
              desc: t(
                "dir_arch_p1_summary",
                "Sanctuary OS combines a zero-overhead native Rust backend across Windows and macOS with a GPU-pinned 3D refractive Liquid Glass interface, a 4-Tab Master Schema Studio, and a 21-token Lexicon Engine."
              ),
              subCards: [
                {
                  id: "arch_p1_c1",
                  icon: t("icon_auto_awesome", "auto_awesome"),
                  title: t("sd_arch_stack_c1_title", "Frontend & Liquid Glass V3 UI"),
                  desc: t(
                    "dir_arch_p1_b1",
                    "Zero-Tearing Liquid Glass Engine (.glass-panel / .glass-surface) with 6 live Theme Forge optical sliders (Opacity, Blur, Saturation, Rim Light, Glare, Depth)."
                  ),
                },
                {
                  id: "arch_p1_c2",
                  icon: t("icon_memory", "memory"),
                  title: t("sd_arch_stack_c2_title", "Tauri v2 Native Rust Core (Win & Mac)"),
                  desc: t(
                    "dir_arch_p1_b2",
                    "Native Tauri v2 Rust core: pelite PE & macOS Info.plist version ripper, SQLite .sanctuary_cache.db mtime delta scanner, WebAuthn FIDO2 bridge, and .msi/.dmg auto-updater."
                  ),
                },
                {
                  id: "arch_p1_c3",
                  icon: t("icon_schema", "schema"),
                  title: t("dir_arch_p1_c3_title", "Master Schema Visual Studio & 7 Engine Presets"),
                  desc: t(
                    "dir_arch_p1_c3_desc",
                    "Declarative Master Schema JSON editor governing binaries, secondary install_routes, config_extensions watcher, load order strategies, mod_categories, and exception matchers."
                  ),
                },
                {
                  id: "arch_p1_c4",
                  icon: t("icon_translate", "translate"),
                  title: t("sd_roadmap_p6_title", "Lexicon Studio & Guided Icon Overrides"),
                  desc: t(
                    "dir_arch_p1_b4",
                    "21 Dynamic {Glossary} Tokens interpolated across 1,700+ keys with smart article grammar, plus the Guided Searchable Material Icon Override Builder."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p2",
          icon: t("icon_hub", "hub"),
          label: t("dir_ar_t2_lbl", "PILLAR 2"),
          value: t("dir_ar_t2_val", "Hub & Spokes"),
          cards: [
            {
              id: "arch_p2",
              icon: t("icon_hub", "hub"),
              overline: t(
                "dir_arch_p2_badge",
                "ARCHITECTURE PILLAR 2 • FEDERATION, SYNC & STATIC EDGE"
              ),
              badge: t("active", "Active"),
              title: t(
                "dir_arch_p2_heading",
                "Decoupled Hub-and-Spoke Cloud, Bilateral Sync & Static Edge Polling"
              ),
              footerMeta: "schema_os.sql • schema.sql • Static Edge • Cloud Sync",
              desc: t(
                "dir_arch_p2_summary",
                "Uses bundled codebase files as the offline baseline while syncing Directives, Legal Covenants, Schemas, and Lexicons live from the Hub database—paired with community-owned Spoke DBs and 6-provider Static Edge polling."
              ),
              subCards: [
                {
                  id: "arch_p2_c1",
                  icon: t("icon_hub", "hub"),
                  title: t(
                    "sd_arch_stack_c3_title",
                    "Core OS Hub vs. Sovereign Community Spoke DBs"
                  ),
                  desc: t(
                    "dir_arch_p2_b1",
                    "Core OS Hub (schema_os.sql) governs global SSO, FIDO2 passkeys, sanctuary_schemas, keeper_heuristic_signatures & system_directives; Spokes (schema.sql) own 100% of their 36 community tables."
                  ),
                },
                {
                  id: "arch_p2_c2",
                  icon: t("icon_sync", "sync"),
                  title: t(
                    "dir_arch_p2_c2_title",
                    "Offline Codebase Baseline + Live Cloud Sync"
                  ),
                  desc: t(
                    "dir_arch_p2_c2_desc",
                    "First-time launch and offline sessions boot from bundled .md, schema, and lexicon files; connected clients pull live updates from the Hub DB without requiring an app update."
                  ),
                },
                {
                  id: "arch_p2_c3",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: t(
                    "sd_arch_vault_c3_title",
                    "Decentralized Static Edge Direct Push (manifest.json & catalog.json)"
                  ),
                  desc: t(
                    "dir_arch_p2_b4",
                    "6-provider 1-click OS Auto-Push and HTTP GET polling with automatic previous_hashes lineage rollover and in-place file upgrades."
                  ),
                },
                {
                  id: "arch_p2_c4",
                  icon: t("icon_Favorite", "favorite"),
                  title: t(
                    "dir_arch_p2_c4_title",
                    "0%-Cut Partner Covenants & $5 = +30 Days Supporter Pipeline"
                  ),
                  desc: t(
                    "dir_arch_p2_c4_desc",
                    "Readiness-gated Partner Spoke onboarding with mandatory Partners Agreement & Compliance Protocol review, 0%-cut community donations, and Stripe-verified Daily Dev Builds."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p3",
          icon: t("icon_shield", "shield"),
          label: t("dir_ar_t3_lbl", "PILLAR 3"),
          value: t("dir_ar_t3_val", "{Vault} & Lab"),
          cards: [
            {
              id: "arch_p3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: t(
                "dir_arch_p3_badge",
                "ARCHITECTURE PILLAR 3 • {VAULT}, COMPILER & UNIVERSAL AV"
              ),
              badge: t("active", "Active"),
              title: t(
                "dir_arch_p3_heading",
                "Symlink Airgap 2.5, Config Watcher, Topological Compiler & 21+17 Heuristics"
              ),
              footerMeta: "Symlink Airgap • Config Watcher • 21+17 Rust AV",
              desc: t(
                "dir_arch_p3_summary",
                "Protects your game installation and accounts via zero-copy symlink projection, live in-game config syncing, hardlink Time Capsules, FIDO2 WebAuthn passkeys, and full-OS malware quarantine."
              ),
              subCards: [
                {
                  id: "arch_p3_c1",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: t(
                    "sd_arch_vault_c2_title",
                    "Symlink Airgap 2.5, Custom Routes & Dynamic Config Watcher"
                  ),
                  desc: t(
                    "dir_arch_p3_b1",
                    "Projects {mods} from {Vault}/{Mods}/ into live game folders and secondary install_routes while syncing in-game config_extensions writes back to the {Vault}."
                  ),
                },
                {
                  id: "arch_p3_c2",
                  icon: t("icon_layers", "layers"),
                  title: t(
                    "sd_arch_vault_c4_title",
                    "Topological Load Order Compiler (compileLoadOrder)"
                  ),
                  desc: t(
                    "dir_arch_p3_b2",
                    "Schema-Driven Load Order Compiler (folder_priority + dynamic Resource.cfg, manifest_list, numeric_prefix, timestamp) with topological cycle breaking."
                  ),
                },
                {
                  id: "arch_p3_c3",
                  icon: t("icon_security", "security"),
                  title: t(
                    "dir_arch_p3_c3_title",
                    "Universal Multi-Format Heuristic Scanner (21 Core + 17 Spoke Rules)"
                  ),
                  desc: t(
                    "dir_arch_p3_c3_desc",
                    "Decompresses Zlib/Zstd DBPF streams and deobfuscates Base64/Hex strings in memory to catch credential stealers, webhooks, and shell spawners before execution."
                  ),
                },
                {
                  id: "arch_p3_c4",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: t(
                    "dir_walk_s7_c3_name",
                    "Quarantine SidePanel Lockdown & Zero-PII Threat Manifest"
                  ),
                  desc: t(
                    "dir_arch_p4_b4",
                    "Locks the OS shell on Tier 5 Malware, tracks Move-mode source disposition, offers optional Zero-PII Threat Manifest telemetry, and enforces Secure Shred."
                  ),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  // Default: master_protocols
  return {
    slug: "master_protocols",
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    title: t("sd_card_proto_title", "Master Protocol & Clearance Matrix"),
    summary: t(
      "sd_card_proto_desc",
      "Interactive directory of all 36 Sanctuary OS operational protocols across 5 Domains, Florida Compliance Tiers 0–5, Universal 21+17 Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy."
    ),
    tabs: [
      {
        id: "roles",
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        label: t("dir_pr_t1_lbl", "6 TIERS"),
        value: t("dir_pr_t1_val", "Role Matrix"),
        cards: elevatedRolesCards,
      },
      {
        id: "compliance",
        icon: t("icon_shield", "shield"),
        label: t("dir_pr_t2_lbl", "TIERS 0–5"),
        value: t("dir_pr_t2_val", "Safety & AV"),
        cards: [
          {
            id: "comp_t0",
            icon: t("icon_check_circle", "check_circle"),
            overline: t("sd_proto_tier0_badge", "TIER 0 • PUBLIC SAFE"),
            badge: "TIER 0",
            title: t("sd_proto_tier0_title", "Standard Verified & General Audience"),
            footerMeta: t("sd_proto_tier0_badge", "TIER 0 • PUBLIC SAFE"),
            desc: t(
              "sd_proto_tier0_desc",
              "Eligible for full public indexing across The Nexus, shared Cloud {Blueprints} (SNCXXX), and public {Mason} Profiles. Full {Citizen} Support Desk access."
            ),
            subCards: [],
          },
          {
            id: "comp_t12",
            icon: t("icon_visibility_off", "visibility_off"),
            overline: t("sd_proto_tier12_badge", "TIERS 1–2 • EXPLICIT / ILLICIT"),
            badge: "TIERS 1–2",
            title: t(
              "sd_proto_tier12_title",
              "Adult (NSFW) & Illicit Themes — Local & Static Edge Allowed, Public Scrubbed"
            ),
            footerMeta: t("sd_proto_tier12_badge", "TIERS 1–2 • EXPLICIT / ILLICIT"),
            desc: t(
              "sd_proto_tier12_desc",
              "Permitted in local Vaults and decentralized Static Edge manifests (manifest.json / catalog.json). Automatically scrubbed from public Nexus feeds and stripped from public Cloud {Blueprints}. Eligible for Support Desk with automated 'Dirty Log' sanitization."
            ),
            subCards: [],
          },
          {
            id: "comp_t34",
            icon: t("icon_lock", "lock"),
            overline: t("sd_proto_tier34_badge", "TIERS 3–4 • SEVERE / RESTRICTED"),
            badge: "TIERS 3–4",
            title: t("sd_proto_tier34_title", "Extreme Violence & Taboo Content — Triggers {Vault} Lock"),
            footerMeta: t("sd_proto_tier34_badge", "TIERS 3–4 • SEVERE / RESTRICTED"),
            desc: t(
              "sd_proto_tier34_desc",
              "Permitted strictly within isolated local Vaults and Static Edge manifests. Scrubbed from all public feeds and Cloud {Blueprints}. Equipping or storing Tier 3–4 {mods} engages a {Vault} Lock that restricts {Citizen} Support Desk ticket submissions until removed."
            ),
            subCards: [],
          },
          {
            id: "comp_t5",
            icon: t("icon_gpp_bad", "gpp_bad"),
            overline: t("sd_proto_tier5_badge", "TIER 5 • CONFIRMED MALWARE"),
            badge: "TIER 5",
            title: t(
              "sd_proto_tier5_title",
              "Zero-Choice OS Lockdown, Move-Mode Isolation & Secure Shred"
            ),
            footerMeta: t("sd_proto_tier5_badge", "TIER 5 • CONFIRMED MALWARE"),
            desc: t(
              "sd_proto_tier5_desc",
              "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables detected via SHA-256 DNA or Universal 21+17 Rust Heuristics. Immediately halts game launch, moves/isolates the file in Quarantine, locks the OS shell, and requires a Secure Shred signature."
            ),
            subCards: [],
          },
          {
            id: "comp_av",
            icon: t("icon_security", "security"),
            overline: t(
              "sd_proto_heuristics_v58_badge",
              "UNIVERSAL 21+17 RUST AV • DBPF & BYTECODE DECOMPRESSION"
            ),
            badge: "21+17 RULES",
            title: t(
              "sd_proto_heuristics_title",
              "Universal Multi-Format Heuristic & Decompression Scanner"
            ),
            footerMeta: "21 Core + 17 Spoke Signatures • Zlib/Zstd/Base64",
            desc: t(
              "sd_proto_heuristics_desc",
              "Combines 21 Core Heuristics (keeper_heuristic_signatures) and 17+ Spoke Heuristics (heuristic_signatures) with in-memory Zlib/Zstd DBPF decompression and Base64/Hex deobfuscation to inspect .zip, .package, .ts4script, .asi, .dll, .exe, and .pyc bytecode."
            ),
            subCards: [],
          },
          {
            id: "comp_nuclear",
            icon: t("icon_policy", "policy"),
            overline: t(
              "sd_proto_nuclear_badge",
              "NUCLEAR OVERRIDE & ZERO-PII THREAT MANIFEST"
            ),
            badge: "PRIVACY-FIRST",
            title: t(
              "sd_proto_nuclear_title",
              "Decoupled Hardware Ban Ledger & Anonymous Threat Telemetry"
            ),
            footerMeta: "hardware_bans • Zero-PII Threat Manifest",
            desc: t(
              "sd_proto_nuclear_desc",
              "Sanctuary OS never tracks Hardware IDs on normal users. Quarantined files offer an optional Zero-PII Threat Manifest report (SHA-256 + matched rule IDs only), while the 5-click Nuclear Override records a one-way hash in hardware_bans and severs cloud access."
            ),
            subCards: [],
          },
        ],
      },
      {
        id: "list",
        icon: t("icon_policy", "policy"),
        label: t("dir_pr_t3_v58_lbl", "36 RULES"),
        value: t("dir_pr_t3_val", "OS Protocols"),
        cards: [
          ...[1, 2, 3, 4].map((d) => ({
            id: `proto_d${d}`,
            icon:
              d === 1
                ? t("icon_hub", "hub")
                : d === 2
                  ? t("icon_inventory_2", "inventory_2")
                  : d === 3
                    ? t("icon_radar", "radar")
                    : t("icon_shield", "shield"),
            overline: t(`sd_proto_d${d}_badge`, `DOMAIN ${d}`),
            badge: `DOMAIN ${d}`,
            title: t(`sd_proto_d${d}_title`, `Domain ${d}`),
            footerMeta: t(`sd_proto_d${d}_badge`, `DOMAIN ${d}`),
            desc: t(`sd_proto_d${d}_desc`, ""),
            subCards: [1, 2, 3, 4, 5, 6].map((r) => ({
              id: `proto_d${d}_r${r}`,
              icon: t("icon_check_circle", "check_circle"),
              title: t(`sd_proto_d${d}_r${r}_title`, ""),
              desc: t(`sd_proto_d${d}_r${r}_desc`, ""),
            })),
          })),
          {
            id: "proto_d5",
            icon: t("icon_schema", "schema"),
            overline: t("sd_proto_d5_badge", "DOMAIN 5 • 6 PROTOCOLS"),
            badge: "DOMAIN 5",
            title: t(
              "sd_proto_d5_title",
              "Master Schema Studio, Lexicon Engine, Covenants & Supporter Pipeline"
            ),
            footerMeta: t("sd_proto_d5_badge", "DOMAIN 5 • 6 PROTOCOLS"),
            desc: t(
              "sd_proto_d5_desc",
              "Cross-platform engine schemas, Dynamic Config Watcher, 21-token Lexicon interpolation with Guided Icon Overrides, Partner Covenants, and the $5 = +30 Days Supporter Pipeline."
            ),
            subCards: [
              {
                id: "proto_d5_r1",
                icon: t("icon_schema", "schema"),
                title: t("sd_proto_d5_r1_title", "Master Schema Studio & 7 Engine Presets"),
                desc: t(
                  "sd_proto_d5_r1_desc",
                  "Declarative per-game JSON schemas governing Windows/macOS binaries, secondary install_routes, mod_categories, and exception log diagnostic rules."
                ),
              },
              {
                id: "proto_d5_r2",
                icon: t("icon_sync_saved_locally", "sync_saved_locally"),
                title: t("sd_proto_d5_r2_title", "Dynamic Config Watcher & Stray Deduplication"),
                desc: t(
                  "sd_proto_d5_r2_desc",
                  "Watches config_extensions (.cfg, .ini, .json, .toml, .yaml) in the live game folder, syncs changes back to the {Vault}, and purges duplicate root strays."
                ),
              },
              {
                id: "sd_proto_d5_r3",
                icon: t("icon_translate", "translate"),
                title: t("sd_proto_d5_r3_title", "21-Token Lexicon Protocol & Guided Icon Builder"),
                desc: t(
                  "sd_proto_d5_r3_desc",
                  "Runtime {Glossary} token interpolation with automatic casing and a/an grammar, paired with the searchable Material Symbol override builder."
                ),
              },
              {
                id: "sd_proto_d5_r4",
                icon: t("icon_cloud_upload", "cloud_upload"),
                title: t("sd_proto_d5_r4_title", "Static Edge 6-Provider Auto-Push & catalog.json"),
                desc: t(
                  "sd_proto_d5_r4_desc",
                  "1-click direct push to GitHub, Gist, GitLab/Codeberg, Neocities, WebDAV, and Local Folders with automatic previous_hashes lineage rollover."
                ),
              },
              {
                id: "sd_proto_d5_r5",
                icon: t("icon_gavel", "gavel"),
                title: t("sd_proto_d5_r5_title", "Readiness-Gated Partner Application & Covenants"),
                desc: t(
                  "sd_proto_d5_r5_desc",
                  "Requires reviewing and accepting the Sanctuary Partners Agreement and Compliance Protocol before Spoke onboarding, with 0%-cut community donations."
                ),
              },
              {
                id: "sd_proto_d5_r6",
                icon: t("icon_favorite", "favorite"),
                title: t("sd_proto_d5_r6_title", "$5 = +30 Days Supporter Pipeline & Cloud Sync"),
                desc: t(
                  "sd_proto_d5_r6_desc",
                  "Stripe-verified Daily Dev Build access (Windows .msi & macOS .dmg) and bilateral offline codebase ↔ live Hub database synchronization."
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}
