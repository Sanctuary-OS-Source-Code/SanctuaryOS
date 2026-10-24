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
import spokeSchemaRaw from "../../../schema.sql?raw";
import hubSchemaRaw from "../../../schema_os.sql?raw";

export const SPOKE_SCHEMA_SQL = spokeSchemaRaw;
export const HUB_SCHEMA_SQL = hubSchemaRaw;

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
  slug: DirectiveSlug;
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
      "Interactive 7-stage OS interface walkthrough (what every bar, button, and card does), 9 Citizen operational modules, and the 6-Tier Clearance Hierarchy.",
    category: "Citizen Guide",
    file_path: "Citizen Guide.md",
    bundledContent: citizenGuideRaw,
  },
  forking_guide: {
    slug: "forking_guide",
    title: "Forking & Spoke Provisioning Matrix",
    summary:
      "Interactive schematic for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), a 1-file Standalone Codebase Fork (src/supabase.ts), Dynamic Schemas, Cut the Cord, and embedded SQL schemas.",
    category: "Forking Guide",
    file_path: "Sanctuary OS Forking & Architecture Guide.md",
    bundledContent: forkingGuideRaw,
  },
  phase_roadmap: {
    slug: "phase_roadmap",
    title: "Engineering Phase Roadmap (Phase 12 → Phase 1)",
    summary:
      "Reverse-chronological engineering timeline from Phase 12 (Agnostic Multi-Game Future, Sovereignty & Liquid Glass) down to Phase 1 (Genesis & Cartographer), reconstructed from Foundry Comm-Logs.",
    category: "Phase Roadmap",
    file_path: "Phase Roadmap.md",
    bundledContent: phaseRoadmapRaw,
  },
  master_architecture: {
    slug: "master_architecture",
    title: "Master Architecture & Feature Blueprint",
    summary:
      "4-Pillar deep dive into the Core Stack & Liquid Glass Engine, Hub/Spokes/Static Edge Manifests, Vault Airgap & Schema-Driven Load Order Compiler, and 6-Tier FIDO2/Quarantine Security.",
    category: "Master Architecture",
    file_path: "Master Architecture & Feature Document.md",
    bundledContent: masterArchitectureRaw,
  },
  master_protocols: {
    slug: "master_protocols",
    title: "Master Protocol List & 6-Tier Clearance Matrix",
    summary:
      "Comprehensive protocol registry and 6-Tier Clearance Matrix: Tier 1 Citizen (inheriting Open Mason Workshop), Tier 2 Verified Mason, Tier 3 Architect, Tier 4 Oversight, Tier 5 Wayfinder, and Tier 6 Keeper.",
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

export async function readLocalDirectiveSnapshots(): Promise<
  Record<DirectiveSlug, LocalDirectiveSnapshot>
> {
  const result = {} as Record<DirectiveSlug, LocalDirectiveSnapshot>;

  // Initialize with bundled `?raw` files as baseline
  for (const slug of DIRECTIVE_ORDER) {
    const meta = CANONICAL_DIRECTIVES[slug];
    result[slug] = {
      slug,
      file_path: meta.file_path,
      content: meta.bundledContent,
      modified_epoch_ms: 0,
    };
  }

  // 1. Try Tauri Desktop Rust FS command
  if (isDesktop()) {
    try {
      const snapshots = await invoke<LocalDirectiveSnapshot[]>("read_local_directives");
      if (Array.isArray(snapshots)) {
        for (const snap of snapshots) {
          if (snap.slug && CANONICAL_DIRECTIVES[snap.slug as DirectiveSlug]) {
            result[snap.slug as DirectiveSlug] = snap;
          }
        }
        return result;
      }
    } catch {
      // Fall through to Vite dev middleware if Tauri command unavailable
    }
  }

  // 2. Try Vite dev middleware `/__sync-directives`
  if (import.meta.env.DEV) {
    try {
      const res = await fetch("/__sync-directives");
      if (res.ok) {
        const snapshots: LocalDirectiveSnapshot[] = await res.json();
        if (Array.isArray(snapshots)) {
          for (const snap of snapshots) {
            if (snap.slug && CANONICAL_DIRECTIVES[snap.slug as DirectiveSlug]) {
              result[snap.slug as DirectiveSlug] = snap;
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

export async function writeLocalDirectiveFile(
  slug: DirectiveSlug,
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
  const localMap = await readLocalDirectiveSnapshots();

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
        content: localSnap.content || canonical.bundledContent,
        version: "v0.5.8-Dev.3",
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
    const localContent = localSnap.content || canonical.bundledContent;
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
        version: dbRow.version || "v0.5.8-Dev.3",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: dbRow.updated_by || "Sanctuary Foundry",
        sync_state: "synced",
      });
      continue;
    }

    const dbEpochMs = dbRow.updated_at ? new Date(dbRow.updated_at).getTime() : 0;
    const localEpochMs = localSnap.modified_epoch_ms || 0;

    // If local codebase file was modified more recently than the DB record, push Local -> Keepers Core
    if (localEpochMs > dbEpochMs + 2000 && canWriteHub) {
      const nowIso = new Date(localEpochMs).toISOString();
      await supabaseAuth.from("system_directives").upsert({
        slug,
        title: dbRow.title || canonical.title,
        summary: dbRow.summary || canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        version: "v0.5.8-Dev.3",
        updated_at: nowIso,
        updated_by: "Codebase Auto-Sync",
      });

      syncedRecords.push({
        slug,
        title: dbRow.title || canonical.title,
        summary: dbRow.summary || canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent,
        version: "v0.5.8-Dev.3",
        updated_at: nowIso,
        updated_by: "Codebase Auto-Sync",
        sync_state: "pushed_to_hub",
      });
    } else if (dbEpochMs > localEpochMs + 2000 && dbContent.trim().length > 200) {
      // Keepers Core DB is newer than local file -> pull Keepers Core -> Local Codebase `.md`
      await writeLocalDirectiveFile(slug, dbContent);
      syncedRecords.push({
        slug,
        title: dbRow.title || canonical.title,
        summary: dbRow.summary || canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: dbContent,
        version: dbRow.version || "v0.5.8-Dev.3",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: dbRow.updated_by || "Keepers Core",
        sync_state: "pulled_to_codebase",
      });
    } else {
      // Prefer the richer local codebase `.md` file and sync if permitted
      if (canWriteHub && localContent.length >= dbContent.length) {
        const nowIso = new Date().toISOString();
        await supabaseAuth.from("system_directives").upsert({
          slug,
          title: dbRow.title || canonical.title,
          summary: dbRow.summary || canonical.summary,
          category: dbRow.category || canonical.category,
          file_path: canonical.file_path,
          content: localContent,
          version: "v0.5.8-Dev.3",
          updated_at: nowIso,
          updated_by: "Codebase Auto-Sync",
        });
      }
      syncedRecords.push({
        slug,
        title: dbRow.title || canonical.title,
        summary: dbRow.summary || canonical.summary,
        category: dbRow.category || canonical.category,
        file_path: canonical.file_path,
        content: localContent.length >= dbContent.length ? localContent : dbContent,
        version: dbRow.version || "v0.5.8-Dev.3",
        updated_at: dbRow.updated_at || new Date().toISOString(),
        updated_by: dbRow.updated_by || "Sanctuary Foundry",
        sync_state: "synced",
      });
    }
  }

  return syncedRecords;
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
    version: "v0.5.8-Dev.3",
    updated_at: nowIso,
    updated_by: payload.updated_by || "Keepers Core",
  });

  return { error, wroteLocal };
}

export async function pushCodebaseDirectivesToKeepersCore(
  updatedBy = "Keepers Core"
): Promise<{ count: number; error: any }> {
  const localMap = await readLocalDirectiveSnapshots();
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
      version: "v0.5.8-Dev.3",
      updated_at: nowIso,
      updated_by: updatedBy,
    };
  });

  const { error } = await supabaseAuth.from("system_directives").upsert(rows);
  return { count: rows.length, error };
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
  return { count, error: null };
}
