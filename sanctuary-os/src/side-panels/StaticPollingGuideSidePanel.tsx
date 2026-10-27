import { useState, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  DashboardStatTile,
  HoverTooltip,
} from "../shared";

type GuideTabId = "workflow" | "hosting" | "lineage" | "templates";

export function StaticPollingGuideSidePanel({
  isOpen,
  onClose,
  mod,
  masonName,
  activeDlcIds = [],
  dependencies = [],
  conflicts = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  mod?: any;
  masonName?: string;
  activeDlcIds?: string[];
  dependencies?: any[];
  conflicts?: any[];
}) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<GuideTabId>("workflow");
  const [copiedKey, setCopiedKey] = useState<"manifest" | "catalog" | null>(null);

  const cleanModName = useMemo(() => {
    const raw = (mod?.name || "MyAwesomeMod").split(/[\\/]/).pop() || "MyAwesomeMod";
    return raw.replace(/\.(package|ts4script|zip)$/i, "");
  }, [mod?.name]);

  const artifactId = useMemo(() => {
    return (
      cleanModName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "my_awesome_mod"
    );
  }, [cleanModName]);

  const singleManifestJson = useMemo(() => {
    const sampleHash =
      mod?.hash ||
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const versionStr = mod?.latest_version || "1.0.0";
    const authorStr = masonName || mod?.master_author || "CreatorName";
    const manifestUrl =
      mod?.static_manifest_url ||
      `https://raw.githubusercontent.com/author/manifests/main/${artifactId}/manifest.json`;
    const downloadUrl =
      mod?.url || `https://patreon.com/posts/${artifactId}-${versionStr}`;

    const depList =
      dependencies.length > 0
        ? dependencies.map((d) => ({
            id: d.mod?.id || d.dependency_id || undefined,
            hash: d.mod?.hash || undefined,
            name: d.mod?.name || d.dependency_name || "XML Injector",
          }))
        : [{ name: "XML Injector" }];

    const confList =
      conflicts.length > 0
        ? conflicts.map((c) => ({
            id: c.enemyMod?.id || undefined,
            hash: c.enemyMod?.hash || undefined,
            name: c.enemyMod?.name || "ConflictingMod",
            severity: c.severity_rank || 4,
            description: c.resolution_note || "Incompatible tuning override",
          }))
        : [
            {
              name: "ExampleConflictingMod",
              severity: 4,
              description: "Edits the same core tuning resources",
            },
          ];

    const obj = {
      schema_version: 2,
      manifest_url: manifestUrl,
      artifact: {
        id: artifactId,
        name: cleanModName,
        author: authorStr,
        version: versionStr,
        release_date: new Date().toISOString().split("T")[0],
        category: mod?.category_override || "Script",
        compliance_tier: typeof mod?.compliance_tier === "number" ? mod.compliance_tier : 1,
        description:
          mod?.description ||
          `${cleanModName} with automatic Static Edge Polling and DNA Lineage tracking.`,
        image_url: mod?.image_url || "",
      },
      payload: {
        download_url: downloadUrl,
        sha256: sampleHash,
        install_depth: 1,
        preserve_subfolder: cleanModName,
      },
      current_hashes: [sampleHash],
      modules: [
        {
          name: `${cleanModName}.package`,
          sha256: sampleHash,
          role: "core",
        },
      ],
      previous_hashes: [
        "0000000000000000000000000000000000000000000000000000000000000001",
      ],
      compatibility: {
        min_engine_version:
          Array.isArray(mod?.compatible_versions) && mod.compatible_versions.length > 0
            ? mod.compatible_versions[0]
            : "1.110.294",
        tested_engine_versions:
          Array.isArray(mod?.compatible_versions) && mod.compatible_versions.length > 0
            ? mod.compatible_versions
            : ["1.110.294"],
        required_dlc: activeDlcIds.length > 0 ? activeDlcIds : ["EP01"],
      },
      atomic_logic: {
        dependencies: depList,
        twins: [],
        addons: [],
        conflicts: confList,
      },
      workbench: {
        config_files: [],
        preserved_user_files: [],
      },
    };

    return JSON.stringify(obj, null, 2);
  }, [mod, masonName, cleanModName, artifactId, activeDlcIds, dependencies, conflicts]);

  const multiCatalogJson = useMemo(() => {
    const parsedSingle = JSON.parse(singleManifestJson);
    const catalogObj = {
      schema_version: 2,
      author: masonName || mod?.master_author || "CreatorName",
      updated_at: new Date().toISOString(),
      artifacts: [parsedSingle],
    };
    return JSON.stringify(catalogObj, null, 2);
  }, [singleManifestJson, masonName, mod?.master_author]);

  const handleCopyJson = (kind: "manifest" | "catalog") => {
    const text = kind === "manifest" ? singleManifestJson : multiCatalogJson;
    navigator.clipboard.writeText(text);
    setCopiedKey(kind);
    useStore.getState().pushStatus(t("copied", "Copied!"), "success");
    setTimeout(() => {
      setCopiedKey((prev) => (prev === kind ? null : prev));
    }, 2000);
  };

  const steps = [
    {
      badge: t("edge_guide_step1_badge", "STEP 01"),
      icon: t("icon_science", "science"),
      title: t("edge_guide_step1_title", "Stage Your {Mod} in the Sandbox"),
      desc: t(
        "edge_guide_step1_desc",
        "Drop your .package, .ts4script, and optional .cfg/.ini files into Dev/Sandbox (or click Import in the {Mason} Workshop). Open the {mod} card and configure its Details & Versions (Name, {Mason} Version, Safety Tier 0–4, Game Versions), Files & Folders (Twin scripts, Add-on modules, Folder Structure), and Rules & Upload (Required DLC, Dependencies, and Severity 3–4 Conflicts)."
      ),
      accentClass: "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
    },
    {
      badge: t("edge_guide_step2_badge", "STEP 02"),
      icon: t("icon_link", "link"),
      title: t("edge_guide_step2_title", "Set Your $0 Static Manifest URL"),
      desc: t(
        "edge_guide_step2_desc",
        "Paste the raw URL where your manifest.json (single {mod}) or catalog.json (all your {mods} in one file) will live—such as GitHub Raw, Cloudflare Pages, GitLab Raw, or your own website. Sanctuary OS embeds this URL directly into both manifest.json and override.json inside your release .zip."
      ),
      accentClass: "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
    },
    {
      badge: t("edge_guide_step3_badge", "STEP 03"),
      icon: t("icon_move_to_inbox", "move_to_inbox"),
      title: t("edge_guide_step3_title", "Export Release (.zip) & Upload"),
      desc: t(
        "edge_guide_step3_desc",
        "Click Export Static Manifest (.zip) in Rules & Upload (or the top-right inbox icon). Sanctuary OS computes the SHA-256 hash of every file in your release, writes manifest.json and override.json into your Sandbox folder, and bundles {ModName}_v{Version}_SanctuaryRelease.zip. Upload the .zip to your download page (Patreon, Itch.io, CurseForge, SFS) and push manifest.json to your static URL."
      ),
      accentClass: "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)]",
    },
    {
      badge: t("edge_guide_step4_badge", "STEP 04"),
      icon: t("icon_history", "history"),
      title: t("edge_guide_step4_title", "Pushing Updates (Automatic Lineage Hash Rollover)"),
      desc: t(
        "edge_guide_step4_desc",
        "When releasing v1.1.0+, place the updated .package/.ts4script files into the same Sandbox folder, bump the {Mason} Version field, and click Export Static Manifest (.zip) again. Sanctuary OS automatically reads your previous manifest.json and SQLite history, rolls the old v1.0.0 SHA-256 hashes into previous_hashes (archive_hashes), and records the new hashes as current_hashes. Replace manifest.json on your static host—every {Citizen} on v1.0.0 will automatically get an Update Available alert!"
      ),
      accentClass: "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)]",
    },
    {
      badge: t("edge_guide_step5_badge", "STEP 05"),
      icon: t("icon_verified", "verified"),
      title: t("edge_guide_step5_title", "What {Citizens} Experience (Zero Popups)"),
      desc: t(
        "edge_guide_step5_desc",
        "A {Citizen} drags your release .zip into Sanctuary OS once. With zero confirmation popups, Sanctuary OS registers your manifest_url and lineage hashes in SQLite, marks the {mod} STABLE, groups multi-file suites into a single parent card, enforces your DLC/Dependency/Conflict rules, alerts them when you update manifest.json, and replaces old files in-place (even if renamed) when they drop the new .zip."
      ),
      accentClass: "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)]",
    },
  ];

  const hostOptions = [
    {
      icon: t("icon_cloud_sync", "cloud_sync"),
      badge: t("studio_static_pill_one_drop", "1-Time Drag & Drop"),
      title: t(
        "edge_guide_autopush_title",
        "1-Click OS Auto-Push (GitHub, Gist, Cloudflare, Neocities & Custom Host)"
      ),
      desc: t(
        "edge_guide_autopush_desc",
        "Want Sanctuary OS to push your updated manifest.json or catalog.json directly from the Sandbox without opening a browser? Select an Auto-Push Provider in Rules & Upload! Your scoped token stays 100% local on your PC, and clicking Export & Auto-Push (.zip) automatically rolls old hashes into previous_hashes, updates your live manifest.json or merges into catalog.json, stamps the live URL into your release .zip, and triggers update pings for all {Citizens}."
      ),
    },
    {
      icon: t("icon_code", "code"),
      badge: t("studio_static_pill_zero_cost", "$0 Static Hosting"),
      title: t("edge_guide_host_github_title", "Option A: GitHub Raw (Free, 2-Minute Setup)"),
      desc: t(
        "edge_guide_host_github_desc",
        "1. Create a free public GitHub repository (e.g., my-sims-manifests). 2. Upload your exported manifest.json (or a single catalog.json for all your {mods}). 3. Click the file on GitHub and click 'Raw' to copy the raw.githubusercontent.com URL. 4. Paste that URL into Static Polling Manifest URL before exporting your release .zip."
      ),
    },
    {
      icon: t("icon_public", "public"),
      badge: t("studio_static_pill_zero_cost", "$0 Static Hosting"),
      title: t(
        "edge_guide_host_cf_title",
        "Option B: Cloudflare Pages / Personal Domain (Free, Unlimited Bandwidth)"
      ),
      desc: t(
        "edge_guide_host_cf_desc",
        "Connect your GitHub repository to Cloudflare Pages (or upload manifest.json to your existing web host). Every git push automatically deploys your updated manifest.json globally with zero bandwidth fees."
      ),
    },
    {
      icon: t("icon_library_books", "library_books"),
      badge: t("studio_static_pill_lineage", "Auto Lineage Hashes"),
      title: t(
        "edge_guide_host_catalog_title",
        "Option C: One Master catalog.json for Your Entire Catalog"
      ),
      desc: t(
        "edge_guide_host_catalog_desc",
        "Instead of managing separate manifest.json URLs for 20+ {mods}, you can point all of your {mods} to a single https://.../catalog.json URL containing an 'artifacts' array. Sanctuary OS automatically matches each installed {mod} inside catalog.json by artifact_id, name, current_hashes, or previous_hashes."
      ),
    },
  ];

  const lineageLayers = [
    {
      icon: t("icon_deployed_code", "deployed_code"),
      title: t(
        "edge_guide_lineage_layer1_title",
        "1. Current Release Hashes (payload.sha256, current_hashes & modules[])"
      ),
      desc: t(
        "edge_guide_lineage_layer1_desc",
        "Records the primary .package hash plus every sibling .package and .ts4script module in the current release. All sibling modules in a multi-file suite (like MCCC) are recognized as current and grouped under a single parent folder card."
      ),
    },
    {
      icon: t("icon_history", "history"),
      title: t(
        "edge_guide_lineage_layer2_title",
        "2. Historical Lineage Hashes (previous_hashes / archive_hashes)"
      ),
      desc: t(
        "edge_guide_lineage_layer2_desc",
        "Every time you click Export Static Manifest (.zip) over an existing Sandbox folder (or add historical hashes in Details & Versions), prior release hashes are rolled into previous_hashes. When Sanctuary OS polls your remote manifest.json, any {Citizen} whose installed file matches a hash in previous_hashes immediately receives an Update Available badge."
      ),
    },
    {
      icon: t("icon_Autorenew", "autorenew"),
      title: t("edge_guide_lineage_layer3_title", "3. In-Place Upgrade Replacement on Drop"),
      desc: t(
        "edge_guide_lineage_layer3_desc",
        "When a {Citizen} drops your new v1.1.0 .zip into Sanctuary OS, the ingestion engine checks their installed {Vault} against previous_hashes. Even if you renamed MyMod_v1.0.package to MyMod_v1.1.package, Sanctuary OS finds the old v1.0 file by its lineage hash and replaces it in-place inside the exact same subfolder—preventing duplicate {mod} collisions."
      ),
    },
    {
      icon: t("icon_hub", "hub"),
      title: t(
        "edge_guide_lineage_rules_title",
        "Flexible Dependency & Conflict Matching (Hash or Name)"
      ),
      desc: t(
        "edge_guide_lineage_rules_desc",
        "In Rules & Upload, dependencies and conflicts can reference other {mods} by SHA-256 hash, Registry UUID, or plain {mod} name (e.g., 'XML Injector'). Sanctuary OS resolves both object rules and plain string names automatically."
      ),
    },
  ];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("edge_guide_title", "Static Polling & Lineage Guide")}
      subtitle={t(
        "edge_guide_subtitle",
        "Step-by-step {Mason} walkthrough for Tier 1–4 & independent {mods}"
      )}
      icon={t("icon_menu_book", "menu_book")}
      widthClass="w-[92vw] max-w-[980px]"
      backdropZ="z-[60000]"
      panelZ="z-[60001]"
    >
      <div className="flex flex-col gap-6 pb-8">
        <SidePanelHeroCard
          icon={t("icon_rocket_launch", "rocket_launch")}
          overline={t(
            "studio_static_section_title",
            "Decentralized Static Edge Polling (Tier 1–4 & Independent {Mods})"
          )}
          title={t("edge_guide_hero_title", "One-Time Drag & Drop Forever")}
          description={t(
            "edge_guide_hero_sub",
            "Make any Tier 1–4 or independent {mod} behave like a synced {mod}—with automatic update alerts, DLC/dependency/conflict rules, multi-file family grouping, and in-place upgrades at $0 hosting cost."
          )}
          badge={t("studio_static_pill_zero_cost", "$0 Static Hosting")}
          badgeIcon={t("icon_savings", "savings")}
          variant="accent"
        />

        {/* 4-Tile SidePanel Filter Grid (No PillTabs) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            isActive={activeTab === "workflow"}
            onClick={() => setActiveTab("workflow")}
            icon={t("icon_checklist", "checklist")}
            value="05"
            label={t("edge_guide_tab_workflow", "5-Step Workflow")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            isActive={activeTab === "hosting"}
            onClick={() => setActiveTab("hosting")}
            icon={t("icon_cloud_done", "cloud_done")}
            value="$0"
            label={t("edge_guide_tab_hosting", "$0 Static Hosting")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            isActive={activeTab === "lineage"}
            onClick={() => setActiveTab("lineage")}
            icon={t("icon_account_tree", "account_tree")}
            value="SHA"
            label={t("edge_guide_tab_lineage", "Lineage & Upgrades")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            isActive={activeTab === "templates"}
            onClick={() => setActiveTab("templates")}
            icon={t("icon_data_object", "data_object")}
            value="JSON"
            label={t("edge_guide_tab_templates", "JSON Templates")}
          />
        </div>

        {/* TAB 1: 5-STEP WORKFLOW */}
        {activeTab === "workflow" && (
          <UniversalGroup
            title={t("edge_guide_tab_workflow", "5-Step Workflow")}
            icon={t("icon_checklist", "checklist")}
          >
            <div className="flex flex-col gap-3.5">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                          {step.icon}
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                        {step.title}
                      </h4>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg bg-transparent border text-[9px] font-black uppercase tracking-widest shrink-0 ${step.accentClass}`}
                    >
                      {step.badge}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed pl-10">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </UniversalGroup>
        )}

        {/* TAB 2: $0 STATIC HOSTING */}
        {activeTab === "hosting" && (
          <UniversalGroup
            title={t("edge_guide_tab_hosting", "$0 Static Hosting")}
            icon={t("icon_cloud_done", "cloud_done")}
          >
            <div className="flex flex-col gap-3.5">
              {hostOptions.map((opt, idx) => (
                <div
                  key={idx}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px] text-[var(--success)]">
                          {opt.icon}
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                        {opt.title}
                      </h4>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] text-[9px] font-black uppercase tracking-widest shrink-0">
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed pl-10">
                    {opt.desc}
                  </p>
                </div>
              ))}
            </div>
          </UniversalGroup>
        )}

        {/* TAB 3: LINEAGE & UPGRADES */}
        {activeTab === "lineage" && (
          <UniversalGroup
            title={t("edge_guide_lineage_how_title", "How Lineage Hash Tracking Works Under the Hood")}
            icon={t("icon_account_tree", "account_tree")}
          >
            <div className="flex flex-col gap-3.5">
              <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed px-1">
                {t(
                  "edge_guide_lineage_how_desc",
                  "Sanctuary OS identifies {mods} by cryptographic SHA-256 DNA rather than fragile filenames. Every exported manifest.json tracks three hash layers so updates and multi-file suites never break:"
                )}
              </p>
              {lineageLayers.map((layer, idx) => (
                <div
                  key={idx}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--warning)]">
                        {layer.icon}
                      </span>
                    </div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {layer.title}
                    </h4>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed pl-10">
                    {layer.desc}
                  </p>
                </div>
              ))}
            </div>
          </UniversalGroup>
        )}

        {/* TAB 4: JSON TEMPLATES */}
        {activeTab === "templates" && (
          <div className="flex flex-col gap-5">
            <UniversalGroup
              title={t("edge_guide_tpl_single_title", "Single-{Mod} manifest.json Template")}
              icon={t("icon_data_object", "data_object")}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs font-semibold text-[var(--subtext)]">
                    {t(
                      "edge_guide_tpl_single_sub",
                      "Pre-filled with your active Sandbox {mod} settings (or standard defaults). Save as manifest.json."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopyJson("manifest")}
                    className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer relative group/btn shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                      {copiedKey === "manifest"
                        ? t("icon_check", "check")
                        : t("icon_content_copy", "content_copy")}
                    </span>
                    {copiedKey === "manifest"
                      ? t("copied", "Copied!")
                      : t("edge_guide_btn_copy_manifest", "Copy manifest.json")}
                    <HoverTooltip
                      title={t("edge_guide_btn_copy_manifest", "Copy manifest.json")}
                    />
                  </button>
                </div>
                <pre className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[11px] font-mono text-[var(--text)] overflow-x-auto max-h-[300px] custom-scrollbar select-all leading-relaxed">
                  {singleManifestJson}
                </pre>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("edge_guide_tpl_catalog_title", "Multi-{Mod} Creator catalog.json Template")}
              icon={t("icon_library_books", "library_books")}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs font-semibold text-[var(--subtext)]">
                    {t(
                      "edge_guide_tpl_catalog_sub",
                      "Host one URL for all your {mods}. Sanctuary OS matches each {mod} in the artifacts[] array automatically."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopyJson("catalog")}
                    className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer relative group/btn shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                      {copiedKey === "catalog"
                        ? t("icon_check", "check")
                        : t("icon_content_copy", "content_copy")}
                    </span>
                    {copiedKey === "catalog"
                      ? t("copied", "Copied!")
                      : t("edge_guide_btn_copy_catalog", "Copy catalog.json")}
                    <HoverTooltip
                      title={t("edge_guide_btn_copy_catalog", "Copy catalog.json")}
                    />
                  </button>
                </div>
                <pre className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[11px] font-mono text-[var(--text)] overflow-x-auto max-h-[260px] custom-scrollbar select-all leading-relaxed">
                  {multiCatalogJson}
                </pre>
              </div>
            </UniversalGroup>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
