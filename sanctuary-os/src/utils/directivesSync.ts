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
    title: "Engineering Phase Roadmap (Phase 13 → Phase 1)",
    summary:
      "Reverse-chronological engineering timeline from Phase 13 (V5.8 Multi-Engine Studios, Universal 21+17 Heuristics & Bilateral Cloud Sync) and Phase 12 down to Phase 1 (Genesis & Cartographer).",
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
      "Interactive directory of all 36 Sanctuary OS operational protocols across 5 Domains, Florida Compliance Tiers 0–5, Universal 21+17 Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy.",
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

    if (!dbRow) {
      const record: SystemDirectiveRecord = {
        slug,
        title: canonical.title,
        summary: canonical.summary,
        category: canonical.category,
        file_path: canonical.file_path,
        content: localSnap?.content || canonical.bundledContent,
        version: "v0.5.8-Dev.5",
        updated_at: new Date().toISOString(),
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
    const localContent = localSnap?.content || canonical.bundledContent;
    const isSameContent =
      normalizeMarkdown(dbContent) === normalizeMarkdown(localContent);

    if (isSameContent) {
      syncedRecords.push({
        slug,
        title: dbRow.title || canonical.title,
        summary: dbRow.summary || canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        version: dbRow.version || "v0.5.8-Dev.5",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: dbRow.updated_by || "Sanctuary Foundry",
        sync_state: "synced",
      });
      continue;
    }

    const dbEpochMs = dbRow.updated_at ? new Date(dbRow.updated_at).getTime() : 0;
    const localEpochMs = localSnap?.modified_epoch_ms || 0;

    // 1. If we have real filesystem mtime (`localEpochMs > 0`) and local file was edited more recently than DB:
    if (localEpochMs > 0 && localEpochMs > dbEpochMs + 2000 && canWriteHub) {
      const nowIso = new Date(localEpochMs).toISOString();
      await supabaseAuth.from("system_directives").upsert({
        slug,
        title: canonical.title,
        summary: canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        version: "v0.5.8-Dev.5",
        updated_at: nowIso,
        updated_by: "Codebase Auto-Sync",
      });

      syncedRecords.push({
        slug,
        title: canonical.title,
        summary: canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        version: "v0.5.8-Dev.5",
        updated_at: nowIso,
        updated_by: "Codebase Auto-Sync",
        sync_state: "pushed_to_hub",
      });
    } else if (dbContent.trim().length > 200) {
      // 2. Cloud-First Update Model: Desktop & Web pull live updates from Hub DB (`system_directives`)
      // and update local `.md` backup file when running in Desktop / Dev mode.
      await writeLocalDirectiveFile(slug, dbContent);
      syncedRecords.push({
        slug,
        title: dbRow.title || canonical.title,
        summary: dbRow.summary || canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: dbContent,
        version: dbRow.version || "v0.5.8-Dev.5",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: dbRow.updated_by || "Keepers Core",
        sync_state: "pulled_to_codebase",
      });
    } else {
      syncedRecords.push({
        slug,
        title: canonical.title,
        summary: canonical.summary,
        category: canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        version: "v0.5.8-Dev.5",
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

      if (
        (!isSame &&
          localEpochMs > 0 &&
          localEpochMs > dbEpochMs + 2000 &&
          canWriteHub) ||
        (forcePushLocal && canWriteHub)
      ) {
        const nowIso =
          localEpochMs > 0
            ? new Date(localEpochMs).toISOString()
            : new Date().toISOString();
        const { data: updated } = await supabaseAuth
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
        result[cat] = {
          ...(updated || dbRow),
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
}): Promise<{ error: any; wroteLocal: boolean }> {
  const canonical = CANONICAL_DIRECTIVES[payload.slug];
  const nowIso = new Date().toISOString();

  // 1. Write to local codebase `.md` file first
  const wroteLocal = await writeLocalDirectiveFile(payload.slug, payload.content);

  // 2. Upsert to `public.system_directives` in Keepers Core
  const { error } = await supabaseAuth.from("system_directives").upsert({
    slug: payload.slug,
    title: payload.title.trim() || canonical.title,
    summary: payload.summary.trim() || canonical.summary,
    category: payload.category || canonical.category,
    file_path: canonical.file_path,
    content: payload.content,
    version: "v0.5.8-Dev.5",
    updated_at: nowIso,
    updated_by: payload.updated_by || "Keepers Core",
  });

  return { error, wroteLocal };
}

export async function pushCodebaseDirectivesToKeepersCore(
  updatedBy = "Keepers Core"
): Promise<{ count: number; error: any }> {
  const localMap = await readAllLocalDocSnapshots();
  const nowIso = new Date().toISOString();

  const rows = DIRECTIVE_ORDER.map((slug) => {
    const canonical = CANONICAL_DIRECTIVES[slug];
    const snap = localMap[slug];
    return {
      slug,
      title: canonical.title,
      summary: canonical.summary,
      category: canonical.category,
      file_path: canonical.file_path,
      content: snap?.content || canonical.bundledContent,
      version: "v0.5.8-Dev.5",
      updated_at: nowIso,
      updated_by: updatedBy,
    };
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
