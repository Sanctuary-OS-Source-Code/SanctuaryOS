import { describe, expect, it } from "vitest";
import { sanitizeComplianceTierForLocal } from "../utils/blueprintOverrideUtils";
import { getDefaultDirectiveBuilderSchema } from "../utils/directives-builder/defaultSchemas";
import {
  extractDirectiveBuilderSchema,
  stripDirectiveBuilderComment,
} from "../utils/directives-builder/markdownParser";

async function loadNodeFsAndRepoRoot() {
  const fsMod = "node:fs";
  const pathMod = "node:path";
  const fs: any = await import(/* @vite-ignore */ fsMod);
  const path: any = await import(/* @vite-ignore */ pathMod);
  const cwd = (globalThis as any).process.cwd();
  const osRoot = fs.existsSync(path.resolve(cwd, "src/lexicons/en-default.json"))
    ? cwd
    : path.resolve(cwd, "sanctuary-os");
  const repoRoot = path.resolve(osRoot, "..");
  return { fs, path, osRoot, repoRoot };
}

describe("Documentation Reconciliation, Legal Alignment & Governance SOPs Parity", () => {
  it("verifies all 5 root directive markdown files parse via extractDirectiveBuilderSchema with matching _bodySig & zero fallback drift", async () => {
    const { fs, path, repoRoot } = await loadNodeFsAndRepoRoot();
    const mappings = [
      { slug: "phase_roadmap" as const, file: "Phase Roadmap.md" },
      { slug: "master_protocols" as const, file: "Master Protocol List.md" },
      { slug: "master_architecture" as const, file: "Master Architecture & Feature Document.md" },
      { slug: "citizen_guide" as const, file: "Citizen Guide.md" },
      { slug: "forking_guide" as const, file: "Sanctuary OS Forking & Architecture Guide.md" },
    ];

    for (const { slug, file } of mappings) {
      const raw = fs.readFileSync(path.join(repoRoot, file), "utf8");
      const defaultSchema = getDefaultDirectiveBuilderSchema(slug);
      const extracted = extractDirectiveBuilderSchema(raw, slug);

      expect(extracted).not.toBeNull();
      expect(typeof extracted?._bodySig).toBe("number");
      expect(extracted?._bodySig).toBeGreaterThan(0);
      expect(extracted!.tabs).toHaveLength(defaultSchema.tabs.length);

      for (let i = 0; i < defaultSchema.tabs.length; i++) {
        expect(extracted!.tabs[i].cards).toHaveLength(defaultSchema.tabs[i].cards.length);
      }
    }

    const roadmapRaw = fs.readFileSync(path.join(repoRoot, "Phase Roadmap.md"), "utf8");
    const roadmapExtracted = extractDirectiveBuilderSchema(roadmapRaw, "phase_roadmap");
    expect(roadmapExtracted?.tabs[0]?.cards).toHaveLength(16);
    expect(roadmapExtracted?.tabs[0]?.cards?.[0]?.id).toBe("phase_16");
    expect(roadmapExtracted?.tabs[0]?.cards?.[0]?.status).toBe("planned");
    expect(roadmapExtracted?.tabs[0]?.cards?.[1]?.id).toBe("phase_15");
    expect(roadmapExtracted?.tabs[0]?.cards?.[1]?.status).toBe("planned");
    expect(roadmapExtracted?.tabs[0]?.cards?.[2]?.id).toBe("phase_14");
    expect(roadmapExtracted?.tabs[0]?.cards?.[2]?.status).toBe("active");

    const protoRaw = stripDirectiveBuilderComment(
      fs.readFileSync(path.join(repoRoot, "Master Protocol List.md"), "utf8")
    );
    const sec5Matches = protoRaw.match(/^##\s+5\./gm) || [];
    expect(sec5Matches).toHaveLength(1);

    const protoExtracted = getDefaultDirectiveBuilderSchema("master_protocols");
    const listTab = protoExtracted.tabs.find((t) => t.id === "list");
    const totalProtocols = (listTab?.cards || []).reduce(
      (sum, domain) => sum + (domain.subCards?.length || 0),
      0
    );
    expect(totalProtocols).toBe(37);

    const forkingRaw = stripDirectiveBuilderComment(
      fs.readFileSync(path.join(repoRoot, "Sanctuary OS Forking & Architecture Guide.md"), "utf8")
    );
    expect(forkingRaw).toContain("./sanctuary-os/supabase/functions/game-gateway");
    expect(
      fs.existsSync(path.join(repoRoot, "sanctuary-os/supabase/functions/game-gateway/index.ts"))
    ).toBe(true);
  });

  it("verifies all 7 new governance SOPs exist and EULA.md aligns with GNU GPLv3 without revocable clauses", async () => {
    const { fs, path, repoRoot } = await loadNodeFsAndRepoRoot();
    const sopFiles = [
      "SECURITY.md",
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
      "Docs/dmca_and_ownership_dispute_sop.md",
      "Docs/moderation_appeals_and_remediation_sop.md",
      "Docs/verified_mason_and_spoke_governance_sop.md",
      "Docs/spoke_schema_migration_and_trademark_policy.md",
    ];

    for (const rel of sopFiles) {
      const fullPath = path.join(repoRoot, rel);
      expect(fs.existsSync(fullPath)).toBe(true);
      const body = fs.readFileSync(fullPath, "utf8").trim();
      expect(body.length).toBeGreaterThan(500);
    }

    const eula = fs.readFileSync(path.join(repoRoot, "EULA.md"), "utf8");
    expect(eula).toContain("GNU GPLv3");
    expect(eula.toLowerCase()).not.toMatch(/\brevocable\b/);
  });

  it("enforces Compliance Tiers 0–6 parity across Compliance Protocol, SQL schemas, and client sanitizer", async () => {
    const { fs, path, repoRoot } = await loadNodeFsAndRepoRoot();

    expect(sanitizeComplianceTierForLocal(0)).toBe(0);
    expect(sanitizeComplianceTierForLocal(1)).toBe(0);
    expect(sanitizeComplianceTierForLocal(2)).toBe(0);
    expect(sanitizeComplianceTierForLocal(3)).toBe(0);
    expect(sanitizeComplianceTierForLocal(4)).toBe(0);
    expect(sanitizeComplianceTierForLocal(5)).toBe(0);
    expect(sanitizeComplianceTierForLocal(6)).toBe(6);

    const complianceProtocol = fs.readFileSync(path.join(repoRoot, "Compliance Protocol.md"), "utf8");
    expect(complianceProtocol).toMatch(/Tier\s*0/i);
    expect(complianceProtocol).toMatch(/Tier\s*1[^\n]*DMCA/i);
    expect(complianceProtocol).toMatch(/Tier\s*6[^\n]*Malware/i);
    expect(complianceProtocol).toContain("dmca_compliance_notices");

    const spokeSchema = fs.readFileSync(path.join(repoRoot, "schema.sql"), "utf8");
    expect(spokeSchema).toContain("NOT IN (1, 2, 3, 4, 5)");
    expect(spokeSchema).toContain("0003_compliance_tiers_0_to_6_remapping");

    const migration3 = fs.readFileSync(
      path.join(repoRoot, "migrations/spoke/0002_compliance_tiers_0_to_6_remapping.sql"),
      "utf8"
    );
    expect(migration3).toContain("0003_compliance_tiers_0_to_6_remapping");
    expect(migration3).toContain("NOT IN (1, 2, 3, 4, 5)");
  });

  it("ensures repository markdown docs and changelogs never leak local machine file:/// URIs or user home paths", async () => {
    const { fs, path, repoRoot } = await loadNodeFsAndRepoRoot();
    const mdFiles: string[] = [];

    for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        mdFiles.push(path.join(repoRoot, entry.name));
      }
    }
    const docsDir = path.join(repoRoot, "Docs");
    if (fs.existsSync(docsDir)) {
      for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
          mdFiles.push(path.join(docsDir, entry.name));
        }
      }
    }

    expect(mdFiles.length).toBeGreaterThan(10);
    for (const fullPath of mdFiles) {
      const content = fs.readFileSync(fullPath, "utf8");
      expect(content).not.toMatch(/file:\/\/\//i);
      expect(content).not.toMatch(/[A-Za-z]:[/\\]Users[/\\](?!<|\.\.\.|%|\$)/i);
      expect(content).not.toMatch(/(?:^|[\s(`"])\/Users\/(?!<|\.\.\.|%|\$)[A-Za-z0-9._-]+/i);
    }
  });
});
