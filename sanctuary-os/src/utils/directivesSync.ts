import { invoke } from "@tauri-apps/api/core";
import { supabaseAuth } from "../supabase";

const isDesktop = (): boolean =>
  typeof window !== "undefined" &&
  Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

import citizenGuideRaw from "../../../Citizen Guide.md?raw";
import phaseRoadmapRaw from "../../../Phase Roadmap.md?raw";
import forkingGuideRaw from "../../../Sanctuary OS Forking & Architecture Guide.md?raw";
import masterArchitectureRaw from "../../../Master Architecture & Feature Document.md?raw";
import masterProtocolsRaw from "../../../Master Protocol List.md?raw";
import complianceProtocolRaw from "../../../Compliance Protocol.md?raw";
import partnersAgreementRaw from "../../../Partners Agreement.md?raw";
import eulaRaw from "../../../EULA.md?raw";
import privacyPolicyRaw from "../../../Privacy Policy.md?raw";
import termsOfServiceRaw from "../../../Terms of Service.md?raw";
import spokeSchemaRaw from "../../../schema.sql?raw";
import hubSchemaRaw from "../../../schema_os.sql?raw";

export const SPOKE_SCHEMA_SQL = spokeSchemaRaw;
export const HUB_SCHEMA_SQL = hubSchemaRaw;
export const COMPLIANCE_PROTOCOL_MD = complianceProtocolRaw;
export const PARTNERS_AGREEMENT_MD = partnersAgreementRaw;

export type LegalDocCategory =
  | "EULA"
  | "Privacy"
  | "Terms"
  | "PartnersAgreement"
  | "ComplianceProtocol";

export type LocalDocSlug =
  | DirectiveSlug
  | "compliance_protocol"
  | "partners_agreement"
  | "eula"
  | "privacy"
  | "terms";

export const CANONICAL_LEGAL_DOCS: Record<
  LegalDocCategory,
  {
    category: LegalDocCategory;
    slug: LocalDocSlug;
    title: string;
    file_path: string;
    bundledContent: string;
  }
> = {
  EULA: {
    category: "EULA",
    slug: "eula",
    title: "Sanctuary OS — End-User License Agreement (EULA)",
    file_path: "EULA.md",
    bundledContent: eulaRaw,
  },
  Privacy: {
    category: "Privacy",
    slug: "privacy",
    title: "Sanctuary OS — Privacy Policy",
    file_path: "Privacy Policy.md",
    bundledContent: privacyPolicyRaw,
  },
  Terms: {
    category: "Terms",
    slug: "terms",
    title: "Sanctuary OS — Terms of Service (TOS)",
    file_path: "Terms of Service.md",
    bundledContent: termsOfServiceRaw,
  },
  PartnersAgreement: {
    category: "PartnersAgreement",
    slug: "partners_agreement",
    title: "Sanctuary OS — Sovereign Partners Agreement",
    file_path: "Partners Agreement.md",
    bundledContent: partnersAgreementRaw,
  },
  ComplianceProtocol: {
    category: "ComplianceProtocol",
    slug: "compliance_protocol",
    title: "Sanctuary OS — Compliance & Threat Classification Protocol",
    file_path: "Compliance Protocol.md",
    bundledContent: complianceProtocolRaw,
  },
};

export const LEGAL_DOC_CATEGORIES: LegalDocCategory[] = [
  "EULA",
  "Privacy",
  "Terms",
  "PartnersAgreement",
  "ComplianceProtocol",
];

export type DirectiveSlug =
  | "citizen_guide"
  | "forking_guide"
  | "phase_roadmap"
  | "master_architecture"
  | "master_protocols";

export interface SystemDirectiveRecord {
  slug: DirectiveSlug;
  title: string;
  summary: string;
  category: string;
  file_path: string;
  content: string;
  published_content?: string;
  published_title?: string;
  published_summary?: string;
  published_at?: string;
  has_unpublished_changes?: boolean;
  version: string;
  updated_at: string;
  updated_by?: string;
  sync_state?: "synced" | "pushed_to_hub" | "pulled_to_codebase" | "local_fallback";
}

interface LocalDirectiveSnapshot {
  slug: string;
  file_path: string;
  content: string;
  modified_epoch_ms: number;
}

export const CANONICAL_DIRECTIVES: Record<
  DirectiveSlug,
  {
    slug: DirectiveSlug;
    title: string;
    summary: string;
    category: string;
    file_path: string;
    bundledContent: string;
  }
> = {
  citizen_guide: {
    slug: "citizen_guide",
    title: "Interactive Citizen Guide & Neural Walkthrough",
    summary:
      "10-stage interactive walkthrough of Sanctuary OS, 12 operational & creator modules (Static Edge Direct Push, Master Schema & Lexicon Studios, Spoke Covenants), and the 6-Tier Clearance Hierarchy.",
    category: "Citizen Guide",
    file_path: "Citizen Guide.md",
    bundledContent: citizenGuideRaw,
  },
  forking_guide: {
    slug: "forking_guide",
    title: "Forking & Spoke Provisioning Matrix",
    summary:
      "Interactive schematic for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), reviewing Partner Covenants, launching a 1-file Standalone Codebase Fork (src/supabase.ts), or building cross-platform Master Schemas.",
    category: "Forking Guide",
    file_path: "Sanctuary OS Forking & Architecture Guide.md",
    bundledContent: forkingGuideRaw,
  },
  phase_roadmap: {
    slug: "phase_roadmap",
    title: "Engineering Phase Roadmap (Phase 14 → Phase 1)",
    summary:
      "Reverse-chronological engineering timeline from Phase 14 (V0.6.0 Agnostic Multi-Engine Expansion) and Phase 13 (V5.8 Multi-Engine Studios & Bilateral Cloud Sync) down to Phase 1 (Genesis & Cartographer).",
    category: "Phase Roadmap",
    file_path: "Phase Roadmap.md",
    bundledContent: phaseRoadmapRaw,
  },
  master_architecture: {
    slug: "master_architecture",
    title: "Master Architecture & Feature Blueprint",
    summary:
      "Deep-dive interactive explorer into the Tauri v2 Rust core, Master Schema & Lexicon Visual Studios, Hub-and-Spoke Cloud Federation with Bilateral Codebase Sync, Symlink Airgap 2.5, and the Universal 21+17 Heuristic Scanner.",
    category: "Master Architecture",
    file_path: "Master Architecture & Feature Document.md",
    bundledContent: masterArchitectureRaw,
  },
  master_protocols: {
    slug: "master_protocols",
    title: "Master Protocol List & 6-Tier Clearance Matrix",
    summary:
      "Interactive directory of all 33 Sanctuary OS operational protocols across 4 Domains, Florida Compliance Tiers 0–5, Universal 21+17 Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy.",
    category: "Master Protocol List",
    file_path: "Master Protocol List.md",
    bundledContent: masterProtocolsRaw,
  },
};

export const DIRECTIVE_ORDER: DirectiveSlug[] = [
  "citizen_guide",
  "forking_guide",
  "phase_roadmap",
  "master_architecture",
  "master_protocols",
];

const normalizeMarkdown = (txt: string): string =>
  (txt || "").replace(/\r\n/g, "\n").trim();

export function extractDirectiveMetaFromMarkdown(
  content: string,
  fallbackTitle: string,
  fallbackSummary: string,
  slug?: DirectiveSlug
): { title: string; summary: string } {
  if (!content) return { title: fallbackTitle, summary: fallbackSummary };
  const clean = content
    .replace(/\n*<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:[\s\S]*?-->\s*$/, "")
    .replace(/\r\n/g, "\n");
  const lines = clean.split("\n");
  let title = fallbackTitle;
  let summary = fallbackSummary;

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ") && !/^#\s+Part\s+\d+/i.test(line)) {
      const extracted = line
        .replace(/^#\s+/, "")
        .replace(/^Sanctuary OS\s*[—–:-]\s*/i, "")
        .trim();
      if (extracted) title = extracted;
    } else if (line.startsWith("> ") && !line.toLowerCase().includes("version:")) {
      const quote = line.replace(/^>\s+/, "").replace(/\*\*/g, "").trim();
      if (quote.length > 25) {
        summary = quote;
        break;
      }
    } else if (
      line.length > 35 &&
      !line.startsWith("#") &&
      !line.startsWith("-") &&
      !line.startsWith("*") &&
      !line.startsWith("!") &&
      !line.toLowerCase().startsWith("document version:") &&
      !line.toLowerCase().startsWith("last updated:")
    ) {
      summary = line.replace(/\*\*/g, "").trim();
      break;
    }
  }

  if (slug === "phase_roadmap") {
    const phaseMatches = [...clean.matchAll(/^##\s+Phase\s+(\d+)\b/gim)];
    if (phaseMatches.length > 0) {
      const maxPhase = phaseMatches.reduce(
        (acc, m) => Math.max(acc, parseInt(m[1], 10)),
        0
      );
      if (maxPhase > 0 && !title.includes(`Phase ${maxPhase}`)) {
        title = `Engineering Phase Roadmap (Phase ${maxPhase} → Phase 1)`;
      }
    }
  }

  return { title, summary };
}

async function readAllLocalDocSnapshots(): Promise<
  Record<string, LocalDirectiveSnapshot>
> {
  const result: Record<string, LocalDirectiveSnapshot> = {};

  for (const slug of DIRECTIVE_ORDER) {
    const meta = CANONICAL_DIRECTIVES[slug];
    result[slug] = {
      slug,
      file_path: meta.file_path,
      content: meta.bundledContent,
      modified_epoch_ms: 0,
    };
  }

  for (const cat of LEGAL_DOC_CATEGORIES) {
    const meta = CANONICAL_LEGAL_DOCS[cat];
    result[meta.slug] = {
      slug: meta.slug,
      file_path: meta.file_path,
      content: meta.bundledContent,
      modified_epoch_ms: 0,
    };
  }

  if (isDesktop()) {
    try {
      const snapshots = await invoke<LocalDirectiveSnapshot[]>(
        "read_local_directives"
      );
      if (Array.isArray(snapshots)) {
        for (const snap of snapshots) {
          if (snap.slug) {
            result[snap.slug] = snap;
          }
        }
        return result;
      }
    } catch {
      // Fall through to Vite dev middleware
    }
  }

  if (import.meta.env.DEV) {
    try {
      const res = await fetch("/__sync-directives");
      if (res.ok) {
        const snapshots: LocalDirectiveSnapshot[] = await res.json();
        if (Array.isArray(snapshots)) {
          for (const snap of snapshots) {
            if (snap.slug) {
              result[snap.slug] = snap;
            }
          }
        }
      }
    } catch {
      // Ignore in static web preview
    }
  }

  return result;
}

export async function readLocalDirectiveSnapshots(): Promise<
  Record<DirectiveSlug, LocalDirectiveSnapshot>
> {
  const all = await readAllLocalDocSnapshots();
  const result = {} as Record<DirectiveSlug, LocalDirectiveSnapshot>;
  for (const slug of DIRECTIVE_ORDER) {
    result[slug] = all[slug];
  }
  return result;
}

export async function writeLocalDirectiveFile(
  slug: LocalDocSlug,
  content: string
): Promise<boolean> {
  if (isDesktop()) {
    try {
      await invoke("write_local_directive", { slug, content });
      return true;
    } catch {
      // Fall through to Vite dev middleware
    }
  }

  if (import.meta.env.DEV) {
    try {
      const res = await fetch("/__sync-directives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, content }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return false;
}

export async function syncDirectivesBidirectional(options?: {
  canWriteHub?: boolean;
}): Promise<SystemDirectiveRecord[]> {
  const canWriteHub = options?.canWriteHub ?? false;
  const localMap = await readAllLocalDocSnapshots();

  const { data: dbRows, error } = await supabaseAuth
    .from("system_directives")
    .select("*");

  const dbMap = new Map<DirectiveSlug, any>();
  if (!error && Array.isArray(dbRows)) {
    for (const row of dbRows) {
      if (row.slug && CANONICAL_DIRECTIVES[row.slug as DirectiveSlug]) {
        dbMap.set(row.slug as DirectiveSlug, row);
      }
    }
  }

  const syncedRecords: SystemDirectiveRecord[] = [];

  for (const slug of DIRECTIVE_ORDER) {
    const canonical = CANONICAL_DIRECTIVES[slug];
    const localSnap = localMap[slug];
    const dbRow = dbMap.get(slug);
    const localContent = localSnap?.content || canonical.bundledContent;
    const localMeta = extractDirectiveMetaFromMarkdown(
      localContent,
      canonical.title,
      canonical.summary,
      slug
    );

    if (!dbRow) {
      const nowIso = new Date().toISOString();
      const record: SystemDirectiveRecord = {
        slug,
        title: localMeta.title,
        summary: localMeta.summary,
        category: canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        published_content: localContent,
        published_title: localMeta.title,
        published_summary: localMeta.summary,
        published_at: nowIso,
        has_unpublished_changes: false,
        version: "v0.6.0",
        updated_at: nowIso,
        updated_by: "Sanctuary Foundry",
        sync_state: "local_fallback",
      };

      if (canWriteHub) {
        const { data: inserted } = await supabaseAuth
          .from("system_directives")
          .upsert({
            slug: record.slug,
            title: record.title,
            summary: record.summary,
            category: record.category,
            file_path: record.file_path,
            content: record.content,
            published_content: record.published_content,
            published_title: record.published_title,
            published_summary: record.published_summary,
            published_at: record.published_at,
            version: record.version,
            updated_at: record.updated_at,
            updated_by: record.updated_by,
          })
          .select()
          .maybeSingle();
        if (inserted) {
          record.updated_at = inserted.updated_at || record.updated_at;
          record.sync_state = "pushed_to_hub";
        }
      }

      syncedRecords.push(record);
      continue;
    }

    const dbContent = dbRow.content || "";
    const publishedContent = dbRow.published_content || dbContent || localContent;
    const publishedTitle = dbRow.published_title || dbRow.title || localMeta.title;
    const publishedSummary =
      dbRow.published_summary || dbRow.summary || localMeta.summary;
    const publishedAt =
      dbRow.published_at || dbRow.updated_at || new Date().toISOString();
    const isSameContent =
      normalizeMarkdown(dbContent) === normalizeMarkdown(localContent);

    if (isSameContent) {
      if (
        canWriteHub &&
        (dbRow.title !== localMeta.title || dbRow.summary !== localMeta.summary)
      ) {
        await supabaseAuth.from("system_directives").upsert({
          slug,
          title: localMeta.title,
          summary: localMeta.summary,
          category: dbRow.category || canonical.category,
          file_path: canonical.file_path,
          content: localContent,
          published_content: publishedContent,
          published_title: publishedTitle,
          published_summary: publishedSummary,
          published_at: publishedAt,
          version: dbRow.version || "v0.6.0",
          updated_at: dbRow.updated_at || new Date().toISOString(),
          updated_by: dbRow.updated_by || "Codebase Auto-Sync",
        });
      }

      syncedRecords.push({
        slug,
        title: localMeta.title,
        summary: localMeta.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        published_content: publishedContent,
        published_title: publishedTitle,
        published_summary: publishedSummary,
        published_at: publishedAt,
        has_unpublished_changes:
          normalizeMarkdown(localContent) !== normalizeMarkdown(publishedContent),
        version: dbRow.version || "v0.6.0",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: dbRow.updated_by || "Sanctuary Foundry",
        sync_state: "synced",
      });
      continue;
    }

    const dbEpochMs = dbRow.updated_at ? new Date(dbRow.updated_at).getTime() : 0;
    const localEpochMs = localSnap?.modified_epoch_ms || 0;
    const dbSchemaVerMatch = dbContent.match(/"_schemaVersion"\s*:\s*(\d+)/);
    const dbSchemaVer = dbSchemaVerMatch ? parseInt(dbSchemaVerMatch[1], 10) : 0;
    const localBulletCount = (localContent.match(/^[ \t]*[-*]\s+\*\*/gm) || []).length;
    const dbBulletCount = (dbContent.match(/^[ \t]*[-*]\s+\*\*/gm) || []).length;
    const dbHasBrokenTabs =
      slug === "phase_roadmap" &&
      (dbContent.includes('"value": "Active Era)"') ||
        dbContent.includes("## Phase 14 (V0.6.0): Multi-Engine Live Adapters, Save-Airgapped External Tool Bridge, Guided Diagnostics & Cross-Platform Vault Companion") ||
        !dbContent.includes("External Mod Manager Migration & Out-of-Tree Setup Importer"));
    const localIsNewer =
      (localEpochMs > 0 && localEpochMs > dbEpochMs + 2000) ||
      (dbSchemaVer > 0 && dbSchemaVer < 76) ||
      localBulletCount > dbBulletCount ||
      dbHasBrokenTabs;

    // 1. If local file is newer or contains newer codebase milestones/schema than DB:
    // Sync the file & database working `content` column WITHOUT overwriting `published_content`
    // so the User side stays on the published snapshot until "Update / Publish" is clicked.
    if (localIsNewer) {
      const nowIso = new Date(
        Math.max(localEpochMs, dbEpochMs + 1000, Date.now())
      ).toISOString();
      if (canWriteHub) {
        await supabaseAuth.from("system_directives").upsert({
          slug,
          title: localMeta.title,
          summary: localMeta.summary,
          category: dbRow.category || canonical.category,
          file_path: canonical.file_path,
          content: localContent,
          published_content: publishedContent,
          published_title: publishedTitle,
          published_summary: publishedSummary,
          published_at: publishedAt,
          version: "v0.6.0",
          updated_at: nowIso,
          updated_by: "Codebase Auto-Sync",
        });
      }

      syncedRecords.push({
        slug,
        title: localMeta.title,
        summary: localMeta.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        published_content: publishedContent,
        published_title: publishedTitle,
        published_summary: publishedSummary,
        published_at: publishedAt,
        has_unpublished_changes:
          normalizeMarkdown(localContent) !== normalizeMarkdown(publishedContent),
        version: "v0.6.0",
        updated_at: nowIso,
        updated_by: "Codebase Auto-Sync",
        sync_state: canWriteHub ? "pushed_to_hub" : "local_fallback",
      });
    } else if (dbContent.trim().length > 200) {
      // 2. Cloud-First Update Model: Desktop & Web pull working updates from Hub DB (`system_directives.content`)
      // and update local `.md` backup file when running in Desktop / Dev mode.
      await writeLocalDirectiveFile(slug, dbContent);
      const dbMeta = extractDirectiveMetaFromMarkdown(
        dbContent,
        dbRow.title || canonical.title,
        dbRow.summary || canonical.summary,
        slug
      );
      syncedRecords.push({
        slug,
        title: dbMeta.title,
        summary: dbMeta.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: dbContent,
        published_content: publishedContent,
        published_title: publishedTitle,
        published_summary: publishedSummary,
        published_at: publishedAt,
        has_unpublished_changes:
          normalizeMarkdown(dbContent) !== normalizeMarkdown(publishedContent),
        version: dbRow.version || "v0.6.0",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: dbRow.updated_by || "Keepers Core",
        sync_state: "pulled_to_codebase",
      });
    } else {
      syncedRecords.push({
        slug,
        title: localMeta.title,
        summary: localMeta.summary,
        category: canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        published_content: publishedContent,
        published_title: publishedTitle,
        published_summary: publishedSummary,
        published_at: publishedAt,
        has_unpublished_changes:
          normalizeMarkdown(localContent) !== normalizeMarkdown(publishedContent),
        version: "v0.6.0",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: "Sanctuary Foundry",
        sync_state: "local_fallback",
      });
    }
  }

  return syncedRecords;
}

let inFlightLegalSyncPromise: Promise<Record<LegalDocCategory, any>> | null =
  null;

export async function syncLegalAndCovenantsBidirectional(options?: {
  canWriteHub?: boolean;
  forcePushLocal?: boolean;
}): Promise<Record<LegalDocCategory, any>> {
  if (inFlightLegalSyncPromise && !options?.forcePushLocal) {
    return inFlightLegalSyncPromise;
  }

  const run = async (): Promise<Record<LegalDocCategory, any>> => {
    const canWriteHub = options?.canWriteHub ?? false;
    const forcePushLocal = options?.forcePushLocal ?? false;
    const localMap = await readAllLocalDocSnapshots();

    const { data: dbRows } = await supabaseAuth
      .from("keeper_system_broadcasts")
      .select("*")
      .in("category", LEGAL_DOC_CATEGORIES)
      .order("created_at", { ascending: false });

    const latestByCat = new Map<LegalDocCategory, any>();
    if (Array.isArray(dbRows)) {
      for (const row of dbRows) {
        const cat = row.category as LegalDocCategory;
        if (cat && CANONICAL_LEGAL_DOCS[cat] && !latestByCat.has(cat)) {
          latestByCat.set(cat, row);
        }
      }
    }

    const result = {} as Record<LegalDocCategory, any>;

    for (const cat of LEGAL_DOC_CATEGORIES) {
      const canonical = CANONICAL_LEGAL_DOCS[cat];
      const localSnap = localMap[canonical.slug];
      const localContent = localSnap?.content || canonical.bundledContent;
      const dbRow = latestByCat.get(cat);

      if (!dbRow) {
        const fallbackRecord = {
          id: `legal_${cat.toLowerCase()}`,
          category: cat,
          title: canonical.title,
          message: localContent,
          file_path: canonical.file_path,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        if (canWriteHub) {
          const { data: inserted } = await supabaseAuth
            .from("keeper_system_broadcasts")
            .insert({
              title: canonical.title,
              message: localContent,
              category: cat,
              target_audience: "Public",
              action_required: "No Action Required",
              is_pinned: false,
              is_active: true,
            })
            .select()
            .maybeSingle();
          if (inserted) {
            result[cat] = { ...inserted, file_path: canonical.file_path };
            continue;
          }
        }
        result[cat] = fallbackRecord;
        continue;
      }

      const dbContent = dbRow.message || dbRow.content || "";
      const isSame =
        normalizeMarkdown(dbContent) === normalizeMarkdown(localContent);
      const dbEpochMs = dbRow.created_at
        ? new Date(dbRow.created_at).getTime()
        : 0;
      const localEpochMs = localSnap?.modified_epoch_ms || 0;
      const localIsNewer =
        !isSame && localEpochMs > 0 && localEpochMs > dbEpochMs + 2000;

      if (localIsNewer || forcePushLocal) {
        const nowIso =
          localEpochMs > 0
            ? new Date(localEpochMs).toISOString()
            : new Date().toISOString();
        let updated = dbRow;
        if (canWriteHub) {
          const { data } = await supabaseAuth
            .from("keeper_system_broadcasts")
            .upsert({
              id: dbRow.id,
              title: canonical.title,
              message: localContent,
              category: cat,
              target_audience: "Public",
              action_required: "No Action Required",
              is_pinned: false,
              is_active: true,
              created_at: nowIso,
            })
            .select()
            .maybeSingle();
          if (data) updated = data;
        }
        result[cat] = {
          ...updated,
          title: canonical.title,
          message: localContent,
          file_path: canonical.file_path,
        };
      } else if (!isSame && dbContent.trim().length > 200) {
        await writeLocalDirectiveFile(canonical.slug, dbContent);
        result[cat] = {
          ...dbRow,
          file_path: canonical.file_path,
        };
      } else {
        result[cat] = {
          ...dbRow,
          message: dbContent.trim().length > 200 ? dbContent : localContent,
          file_path: canonical.file_path,
        };
      }
    }

    return result;
  };

  inFlightLegalSyncPromise = run().finally(() => {
    inFlightLegalSyncPromise = null;
  });
  return inFlightLegalSyncPromise;
}

/**
 * Fetches live Legal & Sovereign Covenant documents (`EULA`, `Privacy`, `Terms`, `PartnersAgreement`, `ComplianceProtocol`)
 * from the Hub database (`keeper_system_broadcasts`) with automatic fallback to the bundled codebase `.md` files.
 */
export async function fetchSyncedLegalAndCovenants(): Promise<
  Record<LegalDocCategory, { title: string; content: string; updated_at?: string }>
> {
  const baseline = {} as Record<
    LegalDocCategory,
    { title: string; content: string; updated_at?: string }
  >;
  for (const cat of LEGAL_DOC_CATEGORIES) {
    const meta = CANONICAL_LEGAL_DOCS[cat];
    baseline[cat] = {
      title: meta.title,
      content: meta.bundledContent,
    };
  }

  try {
    const { data } = await supabaseAuth
      .from("keeper_system_broadcasts")
      .select("category, title, message, created_at")
      .in("category", LEGAL_DOC_CATEGORIES)
      .order("created_at", { ascending: false });

    if (Array.isArray(data)) {
      const seen = new Set<string>();
      for (const row of data) {
        const cat = row.category as LegalDocCategory;
        if (cat && CANONICAL_LEGAL_DOCS[cat] && !seen.has(cat)) {
          seen.add(cat);
          const msg = (row.message || "").trim();
          if (msg.length > 100) {
            baseline[cat] = {
              title: row.title || CANONICAL_LEGAL_DOCS[cat].title,
              content: msg,
              updated_at: row.created_at,
            };
          }
        }
      }
    }
  } catch {
    // Offline fallback uses bundled `.md` baseline
  }

  return baseline;
}

export async function saveLegalDocBothWays(payload: {
  id?: string | null;
  category: LegalDocCategory;
  title: string;
  content: string;
  isActive?: boolean;
}): Promise<{ data: any; error: any; wroteLocal: boolean }> {
  const canonical = CANONICAL_LEGAL_DOCS[payload.category];
  const wroteLocal = canonical
    ? await writeLocalDirectiveFile(canonical.slug, payload.content)
    : false;

  const dbPayload: any = {
    title: payload.title.trim() || canonical?.title || payload.category,
    message: payload.content.trim(),
    category: payload.category,
    target_audience: "Public",
    action_required: "No Action Required",
    is_pinned: false,
    is_active: payload.isActive !== false,
    created_at: new Date().toISOString(),
  };

  if (payload.id && !String(payload.id).startsWith("legal_")) {
    dbPayload.id = payload.id;
  }

  const { data, error } = await supabaseAuth
    .from("keeper_system_broadcasts")
    .upsert(dbPayload)
    .select();

  return { data, error, wroteLocal };
}

export async function saveDirectiveBothWays(payload: {
  slug: DirectiveSlug;
  title: string;
  summary: string;
  category: string;
  content: string;
  updated_by?: string;
  publishLive?: boolean;
}): Promise<{ error: any; wroteLocal: boolean }> {
  const canonical = CANONICAL_DIRECTIVES[payload.slug];
  const nowIso = new Date().toISOString();

  // 1. Write to local codebase `.md` file first
  const wroteLocal = await writeLocalDirectiveFile(payload.slug, payload.content);

  // 2. Upsert to `public.system_directives` in Keepers Core
  // Only overwrite `published_content` when `publishLive === true` so the User side stays on the published snapshot until published.
  const resolvedTitle = payload.title.trim() || canonical.title;
  const resolvedSummary = payload.summary.trim() || canonical.summary;
  const upsertRow: Record<string, any> = {
    slug: payload.slug,
    title: resolvedTitle,
    summary: resolvedSummary,
    category: payload.category || canonical.category,
    file_path: canonical.file_path,
    content: payload.content,
    version: "v0.6.0",
    updated_at: nowIso,
    updated_by: payload.updated_by || "Keepers Core",
  };
  if (payload.publishLive) {
    upsertRow.published_content = payload.content;
    upsertRow.published_title = resolvedTitle;
    upsertRow.published_summary = resolvedSummary;
    upsertRow.published_at = nowIso;
  }

  const { error } = await supabaseAuth
    .from("system_directives")
    .upsert(upsertRow);

  return { error, wroteLocal };
}

export async function publishDirectiveToUsers(
  slug: DirectiveSlug,
  updatedBy = "Keepers Core"
): Promise<{ error: any }> {
  const canonical = CANONICAL_DIRECTIVES[slug];
  const localMap = await readAllLocalDocSnapshots();
  const localSnap = localMap[slug];
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabaseAuth
    .from("system_directives")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  const workingContent =
    localSnap?.content || existing?.content || canonical.bundledContent;
  await writeLocalDirectiveFile(slug, workingContent);

  const meta = extractDirectiveMetaFromMarkdown(
    workingContent,
    existing?.title || canonical.title,
    existing?.summary || canonical.summary,
    slug
  );

  const { error } = await supabaseAuth.from("system_directives").upsert({
    slug,
    title: meta.title,
    summary: meta.summary,
    category: existing?.category || canonical.category,
    file_path: canonical.file_path,
    content: workingContent,
    published_content: workingContent,
    published_title: meta.title,
    published_summary: meta.summary,
    published_at: nowIso,
    version: "v0.6.0",
    updated_at: nowIso,
    updated_by: updatedBy,
  });

  return { error };
}

export async function pushCodebaseDirectivesToKeepersCore(
  updatedBy = "Keepers Core",
  publishLive = false
): Promise<{ count: number; error: any }> {
  const localMap = await readAllLocalDocSnapshots();
  const nowIso = new Date().toISOString();

  const rows = DIRECTIVE_ORDER.map((slug) => {
    const canonical = CANONICAL_DIRECTIVES[slug];
    const snap = localMap[slug];
    const content = snap?.content || canonical.bundledContent;
    const meta = extractDirectiveMetaFromMarkdown(
      content,
      canonical.title,
      canonical.summary,
      slug
    );
    const row: Record<string, any> = {
      slug,
      title: meta.title,
      summary: meta.summary,
      category: canonical.category,
      file_path: canonical.file_path,
      content,
      version: "v0.6.0",
      updated_at: nowIso,
      updated_by: updatedBy,
    };
    if (publishLive) {
      row.published_content = content;
      row.published_title = meta.title;
      row.published_summary = meta.summary;
      row.published_at = nowIso;
    }
    return row;
  });

  const { error } = await supabaseAuth.from("system_directives").upsert(rows);

  // Also push the 5 Legal & Sovereign Covenant `.md` files to `keeper_system_broadcasts`
  await syncLegalAndCovenantsBidirectional({
    canWriteHub: true,
    forcePushLocal: true,
  });

  return { count: rows.length + LEGAL_DOC_CATEGORIES.length, error };
}

export async function pullKeepersCoreDirectivesToCodebase(): Promise<{
  count: number;
  error: any;
}> {
  const { data, error } = await supabaseAuth.from("system_directives").select("*");
  if (error || !Array.isArray(data)) {
    return { count: 0, error };
  }

  let count = 0;
  for (const row of data) {
    if (row.slug && CANONICAL_DIRECTIVES[row.slug as DirectiveSlug] && row.content) {
      const ok = await writeLocalDirectiveFile(row.slug as DirectiveSlug, row.content);
      if (ok) count++;
    }
  }

  const legalMap = await fetchSyncedLegalAndCovenants();
  for (const cat of LEGAL_DOC_CATEGORIES) {
    const meta = CANONICAL_LEGAL_DOCS[cat];
    const doc = legalMap[cat];
    if (doc?.content) {
      const ok = await writeLocalDirectiveFile(meta.slug, doc.content);
      if (ok) count++;
    }
  }

  return { count, error: null };
}
