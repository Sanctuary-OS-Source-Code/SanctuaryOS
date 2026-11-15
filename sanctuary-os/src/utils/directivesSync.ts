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
import releaseNotesPublicRaw from "../../../Release Notes (Community Blog).md?raw";
import releaseNotesDevRaw from "../../../Release Notes (Dev).md?raw";
import changelogRunningRaw from "../../../changelog (running).md?raw";
import changelogDevRaw from "../../../changelog.md?raw";
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
  | "terms"
  | "release_notes_public"
  | "release_notes_dev"
  | "changelog_running"
  | "changelog_dev";

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
  has_local_md_changes?: boolean;
  local_md_content?: string;
  revision: number;
  version: string;
  updated_at: string;
  updated_by?: string;
  sync_state?: "synced" | "pushed_to_hub" | "pulled_to_codebase" | "local_fallback";
}

export interface KeeperLegalDocRecord {
  id: string;
  category: LegalDocCategory;
  slug: LocalDocSlug;
  file_path: string;
  title: string;
  content: string;
  message: string;
  published_title: string;
  published_content: string;
  published_at: string;
  updated_at: string;
  created_at: string;
  updated_by: string;
  revision: number;
  is_active: boolean;
  has_unpublished_changes: boolean;
  has_local_md_changes?: boolean;
  local_md_content?: string;
}

export interface DocSaveResult<T = any> {
  ok: boolean;
  conflict?: boolean;
  serverRow?: T;
  row?: T;
  error?: any;
  wroteLocal?: boolean;
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
    title: "Interactive Citizen Guide & OS Walkthrough",
    summary:
      "10-stage interactive walkthrough of Sanctuary OS, 12 operational & creator modules (including Static Edge Direct Push, Master Schema & Lexicon Studios, and Spoke Covenants), and the 6-Tier Clearance Hierarchy.",
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
      "Interactive reverse-chronological engineering timeline tracking Sanctuary OS from Phase 14 (V0.6.0 Agnostic Multi-Engine Expansion) and Phase 13 (V5.8 Multi-Engine Studios & Bilateral Cloud Sync) down to Phase 1.",
    category: "Phase Roadmap",
    file_path: "Phase Roadmap.md",
    bundledContent: phaseRoadmapRaw,
  },
  master_architecture: {
    slug: "master_architecture",
    title: "Master Architecture & Feature Blueprint",
    summary:
      "Deep-dive interactive explorer into the Tauri v2 Rust core, Universal Master Schema, Code-Switch, Mirror Uplink, Symlink Airgap, Edge Pulse, Groundhog Sandbox, and Bytecode Hound.",
    category: "Master Architecture",
    file_path: "Master Architecture & Feature Document.md",
    bundledContent: masterArchitectureRaw,
  },
  master_protocols: {
    slug: "master_protocols",
    title: "Master Protocol List & 6-Tier Clearance Matrix",
    summary:
      "Interactive directory of all 30 Sanctuary OS operational protocols across 4 Domains, Florida Compliance Tiers 0–5, Bytecode Hound heuristics, and the 6-Tier Role Clearance Hierarchy.",
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

export function normalizeDocMarkdown(txt: string): string {
  return (txt || "").replace(/\r\n/g, "\n").trim();
}

const normalizeMarkdown = normalizeDocMarkdown;

export function hashNormalizedDoc(txt: string): string {
  const norm = normalizeDocMarkdown(txt);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < norm.length; i++) {
    const ch = norm.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((i & 0xff) << 1);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0)
    .toString(16)
    .padStart(8, "0")}_${norm.length}`;
}

const DOC_SYNC_HASHES_KEY = "sanctuary_doc_sync_hashes_v1";
const PUBLISHED_DIRECTIVES_CACHE_KEY = "sanctuary_published_directives_cache_v1";
const PUBLISHED_LEGAL_CACHE_KEY = "sanctuary_published_legal_cache_v1";

type SyncHashLedger = Record<
  string,
  { lastSyncedPublishedHash: string; updatedAtMs: number }
>;

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, val: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function markLocalDocSyncedHash(slug: LocalDocSlug, content: string): void {
  const ledger = readJsonStorage<SyncHashLedger>(DOC_SYNC_HASHES_KEY, {});
  ledger[slug] = {
    lastSyncedPublishedHash: hashNormalizedDoc(content),
    updatedAtMs: Date.now(),
  };
  writeJsonStorage(DOC_SYNC_HASHES_KEY, ledger);
}

export async function syncPublishedToLocalFallbackIfSafe(params: {
  slug: LocalDocSlug;
  publishedContent: string;
  bundledBaseline: string;
  localSnapshot?: { content: string };
  forceOverwriteLocal?: boolean;
}): Promise<{
  localState: "synced" | "local_ahead" | "unavailable";
  localContent: string;
}> {
  const pubContent = params.publishedContent || "";
  const pubHash = hashNormalizedDoc(pubContent);
  const bundledHash = hashNormalizedDoc(params.bundledBaseline || "");
  const localContent = params.localSnapshot?.content ?? params.bundledBaseline ?? "";
  const localHash = hashNormalizedDoc(localContent);

  const ledger = readJsonStorage<SyncHashLedger>(DOC_SYNC_HASHES_KEY, {});
  const lastSynced = ledger[params.slug]?.lastSyncedPublishedHash;

  if (pubHash === localHash) {
    ledger[params.slug] = {
      lastSyncedPublishedHash: pubHash,
      updatedAtMs: Date.now(),
    };
    writeJsonStorage(DOC_SYNC_HASHES_KEY, ledger);
    return { localState: "synced", localContent };
  }

  const canWriteDownstream =
    params.forceOverwriteLocal === true ||
    (!lastSynced && localHash === bundledHash) ||
    (Boolean(lastSynced) && localHash === lastSynced);

  if (canWriteDownstream && pubContent.trim().length > 50) {
    const wroteOk = await writeLocalDirectiveFile(params.slug, pubContent);
    if (wroteOk) {
      ledger[params.slug] = {
        lastSyncedPublishedHash: pubHash,
        updatedAtMs: Date.now(),
      };
      writeJsonStorage(DOC_SYNC_HASHES_KEY, ledger);
      return { localState: "synced", localContent: pubContent };
    }
    return { localState: "unavailable", localContent };
  }

  // Local `.md` file has unimported workspace modifications — protect it from overwrite
  return { localState: "local_ahead", localContent };
}

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

export async function readAllLocalDocSnapshots(): Promise<
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

  result.release_notes_public = {
    slug: "release_notes_public",
    file_path: "Release Notes (Community Blog).md",
    content: releaseNotesPublicRaw,
    modified_epoch_ms: 0,
  };
  result.release_notes_dev = {
    slug: "release_notes_dev",
    file_path: "Release Notes (Dev).md",
    content: releaseNotesDevRaw,
    modified_epoch_ms: 0,
  };
  result.changelog_running = {
    slug: "changelog_running",
    file_path: "changelog (running).md",
    content: changelogRunningRaw,
    modified_epoch_ms: 0,
  };
  result.changelog_dev = {
    slug: "changelog_dev",
    file_path: "changelog.md",
    content: changelogDevRaw,
    modified_epoch_ms: 0,
  };

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
      const res = await fetch("/__sync-directives", {
        headers: {
          "x-sanctuary-dev-token":
            typeof __SANCTUARY_DEV_TOKEN__ !== "undefined" ? __SANCTUARY_DEV_TOKEN__ : "",
        },
      });
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
        headers: {
          "Content-Type": "application/json",
          "x-sanctuary-dev-token":
            typeof __SANCTUARY_DEV_TOKEN__ !== "undefined" ? __SANCTUARY_DEV_TOKEN__ : "",
        },
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
  forcePullLocal?: boolean;
}): Promise<SystemDirectiveRecord[]> {
  const canWriteHub = options?.canWriteHub ?? false;
  const forcePullLocal = options?.forcePullLocal ?? false;
  const localMap = await readAllLocalDocSnapshots();
  const publishedCache = readJsonStorage<Record<string, any>>(
    PUBLISHED_DIRECTIVES_CACHE_KEY,
    {}
  );

  const { data: dbRows, error } = await supabaseAuth
    .from("system_directives")
    .select("*");

  const dbMap = new Map<DirectiveSlug, any>();
  const hasHubConnection = !error && Array.isArray(dbRows);
  if (hasHubConnection) {
    const nextCache: Record<string, any> = { ...publishedCache };
    for (const row of dbRows) {
      if (row.slug && CANONICAL_DIRECTIVES[row.slug as DirectiveSlug]) {
        dbMap.set(row.slug as DirectiveSlug, row);
        nextCache[row.slug] = {
          title: row.title,
          summary: row.summary,
          published_title: row.published_title || row.title,
          published_summary: row.published_summary || row.summary,
          published_content: row.published_content || row.content,
          published_at: row.published_at || row.updated_at,
          updated_at: row.updated_at,
          updated_by: row.updated_by,
          revision: Number(row.revision || 1),
        };
      }
    }
    writeJsonStorage(PUBLISHED_DIRECTIVES_CACHE_KEY, nextCache);
  }

  const syncedRecords: SystemDirectiveRecord[] = [];

  for (const slug of DIRECTIVE_ORDER) {
    const canonical = CANONICAL_DIRECTIVES[slug];
    const localSnap = localMap[slug];
    let dbRow = dbMap.get(slug);

    // Seed missing canonical row ONLY on a brand-new unseeded Hub when Keeper has write privileges
    if (hasHubConnection && !dbRow && canWriteHub) {
      const nowIso = new Date().toISOString();
      const seedContent = canonical.bundledContent;
      const seedMeta = extractDirectiveMetaFromMarkdown(
        seedContent,
        canonical.title,
        canonical.summary,
        slug
      );
      const { data: seeded } = await supabaseAuth
        .from("system_directives")
        .upsert(
          {
            slug,
            title: seedMeta.title,
            summary: seedMeta.summary,
            category: canonical.category,
            file_path: canonical.file_path,
            content: seedContent,
            published_content: seedContent,
            published_title: seedMeta.title,
            published_summary: seedMeta.summary,
            published_at: nowIso,
            version: "v0.6.0",
            revision: 1,
            updated_at: nowIso,
            updated_by: "Sanctuary Foundry",
          },
          { onConflict: "slug", ignoreDuplicates: true }
        )
        .select()
        .maybeSingle();

      if (seeded) {
        dbRow = seeded;
      } else {
        const { data: refetched } = await supabaseAuth
          .from("system_directives")
          .select("*")
          .eq("slug", slug)
          .maybeSingle();
        if (refetched) dbRow = refetched;
      }
    }

    if (dbRow) {
      const workingContent = dbRow.content || canonical.bundledContent;
      const publishedContent = dbRow.published_content || workingContent;
      const workingMeta = extractDirectiveMetaFromMarkdown(
        workingContent,
        dbRow.title || canonical.title,
        dbRow.summary || canonical.summary,
        slug
      );
      const publishedTitle =
        dbRow.published_title || dbRow.title || workingMeta.title;
      const publishedSummary =
        dbRow.published_summary || dbRow.summary || workingMeta.summary;
      const publishedAt =
        dbRow.published_at || dbRow.updated_at || new Date().toISOString();

      const localSync = await syncPublishedToLocalFallbackIfSafe({
        slug,
        publishedContent,
        bundledBaseline: canonical.bundledContent,
        localSnapshot: localSnap,
        forceOverwriteLocal: forcePullLocal,
      });

      const localMatchesPub =
        normalizeMarkdown(localSnap?.content || "") ===
        normalizeMarkdown(publishedContent);

      syncedRecords.push({
        slug,
        title: dbRow.title || workingMeta.title,
        summary: dbRow.summary || workingMeta.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: workingContent,
        published_content: publishedContent,
        published_title: publishedTitle,
        published_summary: publishedSummary,
        published_at: publishedAt,
        has_unpublished_changes:
          normalizeMarkdown(workingContent) !== normalizeMarkdown(publishedContent),
        has_local_md_changes: localSync.localState === "local_ahead",
        local_md_content: localSync.localContent,
        revision: Number(dbRow.revision || 1),
        version: dbRow.version || "v0.6.0",
        updated_at: dbRow.updated_at || publishedAt,
        updated_by: dbRow.updated_by || "Keepers Core",
        sync_state:
          localSync.localState === "synced" && !localMatchesPub
            ? "pulled_to_codebase"
            : "synced",
      });
    } else {
      const cached = publishedCache[slug];
      const fallbackContent =
        cached?.published_content || localSnap?.content || canonical.bundledContent;
      const fallbackMeta = extractDirectiveMetaFromMarkdown(
        fallbackContent,
        cached?.published_title || canonical.title,
        cached?.published_summary || canonical.summary,
        slug
      );
      const nowIso = new Date().toISOString();
      syncedRecords.push({
        slug,
        title: cached?.published_title || fallbackMeta.title,
        summary: cached?.published_summary || fallbackMeta.summary,
        category: canonical.category,
        file_path: canonical.file_path,
        content: fallbackContent,
        published_content: fallbackContent,
        published_title: cached?.published_title || fallbackMeta.title,
        published_summary: cached?.published_summary || fallbackMeta.summary,
        published_at: cached?.published_at || nowIso,
        has_unpublished_changes: false,
        has_local_md_changes: false,
        local_md_content: localSnap?.content || canonical.bundledContent,
        revision: Number(cached?.revision || 1),
        version: "v0.6.0",
        updated_at: cached?.updated_at || nowIso,
        updated_by: cached?.updated_by || "Sanctuary Foundry",
        sync_state: "local_fallback",
      });
    }
  }

  return syncedRecords;
}

let inFlightLegalSyncPromise: Promise<
  Record<LegalDocCategory, KeeperLegalDocRecord>
> | null = null;

export async function syncLegalAndCovenantsBidirectional(options?: {
  canWriteHub?: boolean;
  forcePullLocal?: boolean;
}): Promise<Record<LegalDocCategory, KeeperLegalDocRecord>> {
  if (inFlightLegalSyncPromise && !options?.forcePullLocal) {
    return inFlightLegalSyncPromise;
  }

  const run = async (): Promise<Record<LegalDocCategory, KeeperLegalDocRecord>> => {
    const canWriteHub = options?.canWriteHub ?? false;
    const forcePullLocal = options?.forcePullLocal ?? false;
    const localMap = await readAllLocalDocSnapshots();
    const publishedCache = readJsonStorage<Record<string, any>>(
      PUBLISHED_LEGAL_CACHE_KEY,
      {}
    );

    const { data: dbRows, error } = await supabaseAuth
      .from("keeper_system_broadcasts")
      .select("*")
      .in("category", LEGAL_DOC_CATEGORIES)
      .order("updated_at", { ascending: false });

    const latestByCat = new Map<LegalDocCategory, any>();
    const hasHubConnection = !error && Array.isArray(dbRows);
    if (hasHubConnection) {
      const nextCache: Record<string, any> = { ...publishedCache };
      for (const row of dbRows) {
        const cat = row.category as LegalDocCategory;
        if (cat && CANONICAL_LEGAL_DOCS[cat] && !latestByCat.has(cat)) {
          latestByCat.set(cat, row);
          nextCache[cat] = {
            id: row.id,
            title: row.published_title || row.title,
            published_title: row.published_title || row.title,
            published_message: row.published_message || row.message,
            published_at: row.published_at || row.updated_at || row.created_at,
            updated_at: row.updated_at || row.created_at,
            updated_by: row.updated_by || "Keepers Core",
            revision: Number(row.revision || 1),
            is_active: row.is_active !== false,
          };
        }
      }
      writeJsonStorage(PUBLISHED_LEGAL_CACHE_KEY, nextCache);
    }

    const result = {} as Record<LegalDocCategory, KeeperLegalDocRecord>;

    for (const cat of LEGAL_DOC_CATEGORIES) {
      const canonical = CANONICAL_LEGAL_DOCS[cat];
      const localSnap = localMap[canonical.slug];
      let dbRow = latestByCat.get(cat);

      if (hasHubConnection && !dbRow && canWriteHub) {
        const nowIso = new Date().toISOString();
        const { data: inserted } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .insert({
            title: canonical.title,
            message: canonical.bundledContent,
            published_title: canonical.title,
            published_message: canonical.bundledContent,
            published_at: nowIso,
            updated_at: nowIso,
            updated_by: "Sanctuary Foundry",
            revision: 1,
            category: cat,
            target_audience: "Public",
            action_required: "No Action Required",
            is_pinned: "false",
            is_active: true,
          })
          .select()
          .maybeSingle();

        if (inserted) {
          dbRow = inserted;
        } else {
          const { data: refetched } = await supabaseAuth
            .from("keeper_system_broadcasts")
            .select("*")
            .eq("category", cat)
            .maybeSingle();
          if (refetched) dbRow = refetched;
        }
      }

      if (dbRow) {
        const workingContent =
          (dbRow.message || "").trim().length > 0
            ? dbRow.message
            : dbRow.published_message || canonical.bundledContent;
        const publishedContent =
          (dbRow.published_message || "").trim().length > 0
            ? dbRow.published_message
            : workingContent;
        const publishedTitle =
          dbRow.published_title || dbRow.title || canonical.title;
        const resolvedUpdatedAt =
          dbRow.updated_at || dbRow.created_at || new Date().toISOString();
        const resolvedPublishedAt =
          dbRow.published_at || resolvedUpdatedAt;

        const localSync = await syncPublishedToLocalFallbackIfSafe({
          slug: canonical.slug,
          publishedContent,
          bundledBaseline: canonical.bundledContent,
          localSnapshot: localSnap,
          forceOverwriteLocal: forcePullLocal,
        });

        result[cat] = {
          id: dbRow.id,
          category: cat,
          slug: canonical.slug,
          file_path: canonical.file_path,
          title: dbRow.title || canonical.title,
          content: workingContent,
          message: workingContent,
          published_title: publishedTitle,
          published_content: publishedContent,
          published_at: resolvedPublishedAt,
          updated_at: resolvedUpdatedAt,
          created_at: dbRow.created_at || resolvedUpdatedAt,
          updated_by: dbRow.updated_by || "Keepers Core",
          revision: Number(dbRow.revision || 1),
          is_active: dbRow.is_active !== false,
          has_unpublished_changes:
            normalizeMarkdown(workingContent) !==
            normalizeMarkdown(publishedContent),
          has_local_md_changes: localSync.localState === "local_ahead",
          local_md_content: localSync.localContent,
        };
      } else {
        const cached = publishedCache[cat];
        const fallbackBody =
          cached?.published_message ||
          localSnap?.content ||
          canonical.bundledContent;
        const nowIso = new Date().toISOString();
        result[cat] = {
          id: cached?.id || `legal_${cat.toLowerCase()}`,
          category: cat,
          slug: canonical.slug,
          file_path: canonical.file_path,
          title: cached?.published_title || canonical.title,
          content: fallbackBody,
          message: fallbackBody,
          published_title: cached?.published_title || canonical.title,
          published_content: fallbackBody,
          published_at: cached?.published_at || nowIso,
          updated_at: cached?.updated_at || nowIso,
          created_at: cached?.updated_at || nowIso,
          updated_by: cached?.updated_by || "Sanctuary Foundry",
          revision: Number(cached?.revision || 1),
          is_active: cached?.is_active !== false,
          has_unpublished_changes: false,
          has_local_md_changes: false,
          local_md_content: localSnap?.content || canonical.bundledContent,
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
 * Fetches LIVE PUBLISHED Legal & Sovereign Covenant documents (`EULA`, `Privacy`, `Terms`, `PartnersAgreement`, `ComplianceProtocol`)
 * from the Hub database (`keeper_system_broadcasts.published_message`) with automatic fallback to cached snapshots and bundled `.md` baselines.
 */
export async function fetchSyncedLegalAndCovenants(): Promise<
  Record<LegalDocCategory, { title: string; content: string; updated_at?: string }>
> {
  const publishedCache = readJsonStorage<Record<string, any>>(
    PUBLISHED_LEGAL_CACHE_KEY,
    {}
  );
  const baseline = {} as Record<
    LegalDocCategory,
    { title: string; content: string; updated_at?: string }
  >;
  for (const cat of LEGAL_DOC_CATEGORIES) {
    const meta = CANONICAL_LEGAL_DOCS[cat];
    const cached = publishedCache[cat];
    baseline[cat] = {
      title: cached?.published_title || meta.title,
      content:
        (cached?.published_message || "").trim().length > 100
          ? cached.published_message
          : meta.bundledContent,
      updated_at: cached?.published_at || cached?.updated_at,
    };
  }

  try {
    const { data, error } = await supabaseAuth
      .from("keeper_system_broadcasts")
      .select(
        "id, category, title, message, published_title, published_message, published_at, updated_at, created_at"
      )
      .in("category", LEGAL_DOC_CATEGORIES)
      .order("updated_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      const seen = new Set<string>();
      const nextCache: Record<string, any> = { ...publishedCache };
      for (const row of data) {
        const cat = row.category as LegalDocCategory;
        if (cat && CANONICAL_LEGAL_DOCS[cat] && !seen.has(cat)) {
          seen.add(cat);
          const pubBody = (
            row.published_message ||
            row.message ||
            ""
          ).trim();
          const pubTitle =
            (row.published_title || row.title || "").trim() ||
            CANONICAL_LEGAL_DOCS[cat].title;
          const pubDate =
            row.published_at || row.updated_at || row.created_at;
          if (pubBody.length > 100) {
            baseline[cat] = {
              title: pubTitle,
              content: pubBody,
              updated_at: pubDate,
            };
            nextCache[cat] = {
              ...(nextCache[cat] || {}),
              id: row.id,
              title: pubTitle,
              published_title: pubTitle,
              published_message: pubBody,
              published_at: pubDate,
              updated_at: row.updated_at || row.created_at,
            };
          }
        }
      }
      writeJsonStorage(PUBLISHED_LEGAL_CACHE_KEY, nextCache);
    }
  } catch {
    // Offline fallback uses cached / bundled `.md` baseline
  }

  return baseline;
}

export async function saveLegalDocWithConcurrency(payload: {
  id?: string | null;
  category: LegalDocCategory;
  title: string;
  content: string;
  isActive?: boolean;
  updated_by?: string;
  publishLive?: boolean;
  expectedRevision?: number | null;
  forceOverwrite?: boolean;
}): Promise<DocSaveResult> {
  const canonical = CANONICAL_LEGAL_DOCS[payload.category];
  const nowIso = new Date().toISOString();
  const resolvedTitle =
    payload.title.trim() || canonical?.title || payload.category;
  const resolvedContent = payload.content.trim();
  const resolvedUpdater = (payload.updated_by || "Keepers Core").trim();
  const publishLive = Boolean(payload.publishLive);

  const { data: current, error: fetchError } = await supabaseAuth
    .from("keeper_system_broadcasts")
    .select("*")
    .eq("category", payload.category)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError };
  }

  if (current) {
    const currentRev = Number(current.revision || 1);
    const currentWorking = (current.message || "").trim();
    const hasMeaningfulDiff =
      normalizeMarkdown(currentWorking) !== normalizeMarkdown(resolvedContent) ||
      (current.title || "").trim() !== resolvedTitle;

    if (
      !payload.forceOverwrite &&
      payload.expectedRevision != null &&
      currentRev !== Number(payload.expectedRevision) &&
      hasMeaningfulDiff
    ) {
      return { ok: false, conflict: true, serverRow: current };
    }

    const nextRevision = currentRev + 1;
    const updatePayload: Record<string, any> = {
      title: resolvedTitle,
      message: resolvedContent,
      is_active: payload.isActive !== false,
      updated_at: nowIso,
      updated_by: resolvedUpdater,
      revision: nextRevision,
    };

    if (publishLive) {
      updatePayload.published_title = resolvedTitle;
      updatePayload.published_message = resolvedContent;
      updatePayload.published_at = nowIso;
    }

    let updateQuery = supabaseAuth
      .from("keeper_system_broadcasts")
      .update(updatePayload)
      .eq("id", current.id);

    if (!payload.forceOverwrite && payload.expectedRevision != null) {
      updateQuery = updateQuery.eq("revision", currentRev);
    }

    const { data: updated, error: updateErr } = await updateQuery
      .select()
      .maybeSingle();

    if (updateErr) {
      return { ok: false, error: updateErr };
    }

    if (!updated && !payload.forceOverwrite) {
      const { data: latest } = await supabaseAuth
        .from("keeper_system_broadcasts")
        .select("*")
        .eq("id", current.id)
        .maybeSingle();
      return { ok: false, conflict: true, serverRow: latest || current };
    }

    let wroteLocal = false;
    if (publishLive && canonical) {
      wroteLocal = await writeLocalDirectiveFile(canonical.slug, resolvedContent);
      markLocalDocSyncedHash(canonical.slug, resolvedContent);
    }

    return { ok: true, row: updated || current, wroteLocal };
  }

  // Brand-new category row insert
  const insertPayload: Record<string, any> = {
    title: resolvedTitle,
    message: resolvedContent,
    category: payload.category,
    target_audience: "Public",
    action_required: "No Action Required",
    is_pinned: "false",
    is_active: payload.isActive !== false,
    published_title: publishLive
      ? resolvedTitle
      : canonical?.title || resolvedTitle,
    published_message: publishLive
      ? resolvedContent
      : canonical?.bundledContent || resolvedContent,
    published_at: nowIso,
    updated_at: nowIso,
    updated_by: resolvedUpdater,
    revision: 1,
  };

  const { data: inserted, error: insertErr } = await supabaseAuth
    .from("keeper_system_broadcasts")
    .insert(insertPayload)
    .select()
    .maybeSingle();

  if (insertErr) {
    return { ok: false, error: insertErr };
  }

  let wroteLocal = false;
  if (publishLive && canonical) {
    wroteLocal = await writeLocalDirectiveFile(canonical.slug, resolvedContent);
    markLocalDocSyncedHash(canonical.slug, resolvedContent);
  }

  return { ok: true, row: inserted, wroteLocal };
}

export async function publishLegalDocToUsers(
  category: LegalDocCategory,
  updatedBy = "Keepers Core",
  options?: { expectedRevision?: number | null; forceOverwrite?: boolean }
): Promise<DocSaveResult> {
  const canonical = CANONICAL_LEGAL_DOCS[category];
  const nowIso = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabaseAuth
    .from("keeper_system_broadcasts")
    .select("*")
    .eq("category", category)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError };
  }

  if (!existing) {
    return saveLegalDocWithConcurrency({
      category,
      title: canonical.title,
      content: canonical.bundledContent,
      updated_by: updatedBy,
      publishLive: true,
      forceOverwrite: true,
    });
  }

  const currentRev = Number(existing.revision || 1);
  if (
    !options?.forceOverwrite &&
    options?.expectedRevision != null &&
    currentRev !== Number(options.expectedRevision)
  ) {
    return { ok: false, conflict: true, serverRow: existing };
  }

  const workingBody =
    (existing.message || "").trim() || canonical.bundledContent;
  const workingTitle = (existing.title || "").trim() || canonical.title;
  const nextRevision = currentRev + 1;

  let updateQuery = supabaseAuth
    .from("keeper_system_broadcasts")
    .update({
      published_title: workingTitle,
      published_message: workingBody,
      published_at: nowIso,
      updated_at: nowIso,
      updated_by: updatedBy,
      revision: nextRevision,
    })
    .eq("id", existing.id);

  if (!options?.forceOverwrite && options?.expectedRevision != null) {
    updateQuery = updateQuery.eq("revision", currentRev);
  }

  const { data: updated, error: updateErr } = await updateQuery
    .select()
    .maybeSingle();

  if (updateErr) {
    return { ok: false, error: updateErr };
  }

  if (!updated && !options?.forceOverwrite) {
    const { data: latest } = await supabaseAuth
      .from("keeper_system_broadcasts")
      .select("*")
      .eq("id", existing.id)
      .maybeSingle();
    return { ok: false, conflict: true, serverRow: latest || existing };
  }

  const wroteLocal = await writeLocalDirectiveFile(canonical.slug, workingBody);
  markLocalDocSyncedHash(canonical.slug, workingBody);

  return { ok: true, row: updated || existing, wroteLocal };
}

export async function saveDirectiveWithConcurrency(payload: {
  slug: DirectiveSlug;
  title: string;
  summary: string;
  category: string;
  content: string;
  updated_by?: string;
  publishLive?: boolean;
  expectedRevision?: number | null;
  forceOverwrite?: boolean;
}): Promise<DocSaveResult> {
  const canonical = CANONICAL_DIRECTIVES[payload.slug];
  const nowIso = new Date().toISOString();
  const resolvedTitle = payload.title.trim() || canonical.title;
  const resolvedSummary = payload.summary.trim() || canonical.summary;
  const resolvedUpdater = (payload.updated_by || "Keepers Core").trim();
  const publishLive = Boolean(payload.publishLive);

  const { data: current, error: fetchError } = await supabaseAuth
    .from("system_directives")
    .select("*")
    .eq("slug", payload.slug)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError };
  }

  if (current) {
    const currentRev = Number(current.revision || 1);
    const hasMeaningfulDiff =
      normalizeMarkdown(current.content || "") !==
        normalizeMarkdown(payload.content) ||
      (current.title || "").trim() !== resolvedTitle ||
      (current.summary || "").trim() !== resolvedSummary;

    if (
      !payload.forceOverwrite &&
      payload.expectedRevision != null &&
      currentRev !== Number(payload.expectedRevision) &&
      hasMeaningfulDiff
    ) {
      return { ok: false, conflict: true, serverRow: current };
    }

    const nextRevision = currentRev + 1;
    const updateRow: Record<string, any> = {
      title: resolvedTitle,
      summary: resolvedSummary,
      category: payload.category || canonical.category,
      file_path: canonical.file_path,
      content: payload.content,
      version: "v0.6.0",
      updated_at: nowIso,
      updated_by: resolvedUpdater,
      revision: nextRevision,
    };

    if (publishLive) {
      updateRow.published_content = payload.content;
      updateRow.published_title = resolvedTitle;
      updateRow.published_summary = resolvedSummary;
      updateRow.published_at = nowIso;
    }

    let updateQuery = supabaseAuth
      .from("system_directives")
      .update(updateRow)
      .eq("slug", payload.slug);

    if (!payload.forceOverwrite && payload.expectedRevision != null) {
      updateQuery = updateQuery.eq("revision", currentRev);
    }

    const { data: updated, error: updateErr } = await updateQuery
      .select()
      .maybeSingle();

    if (updateErr) {
      return { ok: false, error: updateErr };
    }

    if (!updated && !payload.forceOverwrite) {
      const { data: latest } = await supabaseAuth
        .from("system_directives")
        .select("*")
        .eq("slug", payload.slug)
        .maybeSingle();
      return { ok: false, conflict: true, serverRow: latest || current };
    }

    let wroteLocal = false;
    if (publishLive) {
      wroteLocal = await writeLocalDirectiveFile(payload.slug, payload.content);
      markLocalDocSyncedHash(payload.slug, payload.content);
    }

    return { ok: true, row: updated || current, wroteLocal };
  }

  // Brand-new directive row insert
  const insertRow: Record<string, any> = {
    slug: payload.slug,
    title: resolvedTitle,
    summary: resolvedSummary,
    category: payload.category || canonical.category,
    file_path: canonical.file_path,
    content: payload.content,
    published_content: publishLive ? payload.content : canonical.bundledContent,
    published_title: publishLive ? resolvedTitle : canonical.title,
    published_summary: publishLive ? resolvedSummary : canonical.summary,
    published_at: nowIso,
    version: "v0.6.0",
    updated_at: nowIso,
    updated_by: resolvedUpdater,
    revision: 1,
  };

  const { data: inserted, error: insertErr } = await supabaseAuth
    .from("system_directives")
    .insert(insertRow)
    .select()
    .maybeSingle();

  if (insertErr) {
    return { ok: false, error: insertErr };
  }

  let wroteLocal = false;
  if (publishLive) {
    wroteLocal = await writeLocalDirectiveFile(payload.slug, payload.content);
    markLocalDocSyncedHash(payload.slug, payload.content);
  }

  return { ok: true, row: inserted, wroteLocal };
}

export async function publishDirectiveToUsers(
  slug: DirectiveSlug,
  updatedBy = "Keepers Core",
  options?: { expectedRevision?: number | null; forceOverwrite?: boolean }
): Promise<DocSaveResult> {
  const canonical = CANONICAL_DIRECTIVES[slug];
  const nowIso = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabaseAuth
    .from("system_directives")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError };
  }

  if (!existing) {
    return saveDirectiveWithConcurrency({
      slug,
      title: canonical.title,
      summary: canonical.summary,
      category: canonical.category,
      content: canonical.bundledContent,
      updated_by: updatedBy,
      publishLive: true,
      forceOverwrite: true,
    });
  }

  const currentRev = Number(existing.revision || 1);
  if (
    !options?.forceOverwrite &&
    options?.expectedRevision != null &&
    currentRev !== Number(options.expectedRevision)
  ) {
    return { ok: false, conflict: true, serverRow: existing };
  }

  const workingContent = existing.content || canonical.bundledContent;
  const meta = extractDirectiveMetaFromMarkdown(
    workingContent,
    existing.title || canonical.title,
    existing.summary || canonical.summary,
    slug
  );
  const resolvedTitle = (existing.title || "").trim() || meta.title;
  const resolvedSummary = (existing.summary || "").trim() || meta.summary;
  const nextRevision = currentRev + 1;

  let updateQuery = supabaseAuth
    .from("system_directives")
    .update({
      title: resolvedTitle,
      summary: resolvedSummary,
      published_content: workingContent,
      published_title: resolvedTitle,
      published_summary: resolvedSummary,
      published_at: nowIso,
      version: "v0.6.0",
      updated_at: nowIso,
      updated_by: updatedBy,
      revision: nextRevision,
    })
    .eq("slug", slug);

  if (!options?.forceOverwrite && options?.expectedRevision != null) {
    updateQuery = updateQuery.eq("revision", currentRev);
  }

  const { data: updated, error: updateErr } = await updateQuery
    .select()
    .maybeSingle();

  if (updateErr) {
    return { ok: false, error: updateErr };
  }

  if (!updated && !options?.forceOverwrite) {
    const { data: latest } = await supabaseAuth
      .from("system_directives")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    return { ok: false, conflict: true, serverRow: latest || existing };
  }

  const wroteLocal = await writeLocalDirectiveFile(slug, workingContent);
  markLocalDocSyncedHash(slug, workingContent);

  return { ok: true, row: updated || existing, wroteLocal };
}

export async function saveLegalDocBothWays(payload: {
  id?: string | null;
  category: LegalDocCategory;
  title: string;
  content: string;
  isActive?: boolean;
  updated_by?: string;
  publishLive?: boolean;
}): Promise<{ data: any; error: any; wroteLocal: boolean }> {
  const res = await saveLegalDocWithConcurrency({
    ...payload,
    forceOverwrite: true,
    publishLive: payload.publishLive ?? true,
  });
  return {
    data: res.row ? [res.row] : null,
    error: res.error || null,
    wroteLocal: Boolean(res.wroteLocal),
  };
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
  const res = await saveDirectiveWithConcurrency({
    ...payload,
    forceOverwrite: true,
  });
  return {
    error: res.error || null,
    wroteLocal: Boolean(res.wroteLocal),
  };
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
    const pubBody = row.published_content || row.content;
    if (row.slug && CANONICAL_DIRECTIVES[row.slug as DirectiveSlug] && pubBody) {
      const ok = await writeLocalDirectiveFile(row.slug as DirectiveSlug, pubBody);
      if (ok) {
        markLocalDocSyncedHash(row.slug as DirectiveSlug, pubBody);
        count++;
      }
    }
  }

  const legalMap = await fetchSyncedLegalAndCovenants();
  for (const cat of LEGAL_DOC_CATEGORIES) {
    const meta = CANONICAL_LEGAL_DOCS[cat];
    const doc = legalMap[cat];
    if (doc?.content) {
      const ok = await writeLocalDirectiveFile(meta.slug, doc.content);
      if (ok) {
        markLocalDocSyncedHash(meta.slug, doc.content);
        count++;
      }
    }
  }

  return { count, error: null };
}
