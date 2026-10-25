import { useState, useEffect, useMemo, useRef } from "react";
import { useLexicon } from "./LexiconContext";
import { supabaseAuth } from "./supabase";
import { useStore } from "./store";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  HoverTooltip,
  ActionButton,
  stripMarkdown,
} from "./shared";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { UniversalCard } from "./components/universal/UniversalCard";
import { SidePanelHeroCard, UniversalGroup } from "./components/layouts/ElevatedHubLayout";
import { extractDispatchMetadata } from "./components/universal/DispatchPollAndMeta";
import { StructuredReleaseNotesView } from "./components/ReleaseNotesShowcase";
import bundledCitizenGuide from "../../Citizen Guide.md?raw";
import bundledRoadmapDoc from "../../Phase Roadmap.md?raw";
import bundledForkingGuide from "../../Sanctuary OS Forking & Architecture Guide.md?raw";
import bundledArchitectureDoc from "../../Master Architecture & Feature Document.md?raw";
import bundledProtocolList from "../../Master Protocol List.md?raw";
import {
  SPOKE_SCHEMA_SQL,
  HUB_SCHEMA_SQL,
  syncDirectivesBidirectional,
  SystemDirectiveRecord,
  DirectiveSlug,
} from "./utils/directivesSync";
import {
  extractDirectiveBuilderSchema,
  stripDirectiveBuilderComment,
} from "./utils/directivesBuilderSchema";

type DirectiveModuleId =
  | "guide"
  | "roadmap"
  | "forking"
  | "architecture"
  | "protocols";

const STANDALONE_BUNDLE_SNIPPET = `export const SANCTUARY_CONFIG = {
  // Paste your exported SANCTUARY-UPLINK:// bundle from Wayfinder Hub:
  uplinkBundle: "SANCTUARY-UPLINK://eyJuYW1lIjoiVGhlIFNpbXMgNCIs...",
  mode: "hub_and_spoke",
};`;

const STANDALONE_MANUAL_SNIPPET = `export const SANCTUARY_CONFIG = {
  uplinkBundle: "",
  mode: "standalone",
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_PUBLIC_KEY",
  standaloneWorkspace: {
    id: "sims4",
    name: "The Sims 4",
    schema_id: "sims4",
    icon: "sports_esports",
  },
};`;

const HUB_AND_SPOKE_FORK_SNIPPET = `// 1. Deploy the Gateway Edge Function to your Central Hub Supabase Project:
//    supabase link --project-ref YOUR_HUB_PROJECT_ID
//    supabase functions deploy game-gateway

// 2. Point SANCTUARY_CONFIG in sanctuary-os/src/supabase.ts to your Central Hub:
export const SANCTUARY_CONFIG = {
  uplinkBundle: "",
  mode: "hub_and_spoke",
  supabaseUrl: "https://YOUR_HUB_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_HUB_SUPABASE_ANON_KEY",
};`;

const DYNAMIC_SCHEMA_SNIPPET = `{
  "id": "sims4",
  "game_id": "sims4",
  "name": "The Sims 4",
  "display_name": "The Sims 4",
  "schema_version": 2,
  "paths": {
    "default_mod_dir_windows": "%USERPROFILE%/Documents/Electronic Arts/The Sims 4/Mods",
    "default_mod_dir_mac": "~/Documents/Electronic Arts/The Sims 4/Mods",
    "manifest_file": "Resource.cfg"
  },
  "extensions": {
    "supported": [".package", ".ts4script"],
    "parsers": { ".package": "dbpf", ".ts4script": "zip_python" }
  },
  "load_order": {
    "strategy": "folder_priority",
    "winner_direction": "higher_wins",
    "manifest_target": "Resource.cfg",
    "tiers": ["Base", "Sanctuary", "Sanctuary2", "Sanctuary3"]
  }
}`;

export default function WebDocumentFeed() {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const osRole = useStore((state: any) => state.osRole);
  const isKeeper =
    osRole === "core_dev" || osRole === "admin" || osRole === "keeper";
  const [posts, setPosts] = useState<any[]>([]);
  const [directivesMap, setDirectivesMap] = useState<
     Partial<Record<DirectiveSlug, SystemDirectiveRecord>>
  >({});
  const [selectedPost, setSelectedPost] = useState<any>(null);

  // Active Interactive Directive SidePanel State
  const [activeModule, setActiveModule] = useState<DirectiveModuleId | null>(null);
  const [showRawDoc, setShowRawDoc] = useState(false);

  // 1. Citizen Guide & Neural Walkthrough State (3 Static Top Tiles + 2-Column Cards with Inline Drawer)
  const [guideMode, setGuideMode] = useState<"walkthrough" | "modules" | "roles">("walkthrough");
  const [walkIdx, setWalkIdx] = useState(0);
  const [guideStepIdx, setGuideStepIdx] = useState(0);
  const [roleTierIdx, setRoleTierIdx] = useState(0);

  // 2. Phase Roadmap Timeline State (3 Static Top Tiles + 2-Column Cards with Inline Drawer)
  const [roadmapFilter, setRoadmapFilter] = useState<"all" | "active" | "completed">("all");
  const [selectedPhaseNum, setSelectedPhaseNum] = useState<number>(12);

  // 3. Forking & Spoke Provisioning Guide State (3 Static Top Tiles)
  const [forkTab, setForkTab] = useState<"spoke" | "standalone" | "sql">("spoke");
  const [forkModeIdx, setForkModeIdx] = useState<0 | 1>(0);
  const [sqlSchemaTab, setSqlSchemaTab] = useState<"spoke" | "hub">("spoke");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 4. Master Architecture Explorer State (3 Static Top Tiles)
  const [archTab, setArchTab] = useState<"p1" | "p2" | "p3">("p1");

  // 5. Master Protocol & Clearance Matrix State (3 Static Top Tiles)
  const [protoTab, setProtoTab] = useState<"roles" | "compliance" | "list">("roles");
  const [protoRoleIdx, setProtoRoleIdx] = useState(0);
  const [protoCompIdx, setProtoCompIdx] = useState(0);
  const [protoDomainIdx, setProtoDomainIdx] = useState(0);

  const guideDrawerRef = useRef<HTMLDivElement | null>(null);
  const roadmapDrawerRef = useRef<HTMLDivElement | null>(null);
  const protoDrawerRef = useRef<HTMLDivElement | null>(null);

  const scrollDrawerIntoCenter = (
    ref: React.RefObject<HTMLDivElement | null>
  ) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  };

  useEffect(() => {
    const loadDirectivesAndBroadcasts = async () => {
      try {
        const synced = await syncDirectivesBidirectional({
          canWriteHub: isKeeper,
        });
        const nextMap: Partial<Record<DirectiveSlug, SystemDirectiveRecord>> = {};
        for (const rec of synced) {
          nextMap[rec.slug] = rec;
        }
        setDirectivesMap(nextMap);
      } catch (err) {
        console.error("Failed to sync system directives:", err);
      }

      const { data } = await supabaseAuth
        .from("system_broadcasts")
        .select("*")
        .in("category", [
          "Citizen Guide",
          "Master Architecture",
          "Master Protocol List",
          "Phase Roadmap",
          "Forking Guide",
        ])
        .ilike("target_audience", "%Public%")
        .order("created_at", { ascending: false });

      if (data) {
        const mappedData = data.map((b) => ({
          ...b,
          mason_id: b.mason_id || "system",
          content: b.message || b.content || "",
          masons: { name: "Sanctuary Foundry" },
          likes: [],
          views: [],
          comments: [],
        }));
        setPosts(mappedData);
      }
    };

    loadDirectivesAndBroadcasts();
    const handleRefresh = () => loadDirectivesAndBroadcasts();
    window.addEventListener("sanctuary_directives_updated", handleRefresh);
    return () =>
      window.removeEventListener("sanctuary_directives_updated", handleRefresh);
  }, [isKeeper]);

  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2200);
  };

  const openDirectiveModule = (modId: DirectiveModuleId) => {
    setShowRawDoc(false);
    setActiveModule(modId);
  };

  // Citizen Guide 9 Interactive Steps
  const citizenSteps = useMemo(
    () => [
      {
        short: t("sd_guide_s1_short", "1. Cartographer"),
        title: t(
          "sd_guide_s1_title",
          "Cartographer Initialization & System Coordinates"
        ),
        badge: t("sd_guide_s1_badge", "INITIAL SETUP • 3 COORDINATES"),
        icon: t("icon_explore", "explore"),
        desc: t(
          "sd_guide_s1_desc",
          "On first boot, the Cartographer maps your machine's file system and extracts your genuine game engine version directly from the binary executable (.exe) using an in-process Rust PE parser (pelite)."
        ),
        tip: t("sd_guide_s1_tip", "Click the Cloud Auto-Detect icon during setup to automatically locate your Game Bin and {Mods} directories for the active workspace."),
        cards: [
          {
            icon: t("icon_terminal", "terminal"),
            title: t("sd_guide_s1_c1_title", "Game Bin Folder (Live Engine)"),
            desc: t(
              "sd_guide_s1_c1_desc",
              "Where your game executable lives. Sanctuary reads PE headers directly from the .exe (with .ini manifest fallback) to guarantee 100% patch version accuracy with zero antivirus false positives."
            ),
          },
          {
            icon: t("icon_folder_open", "folder_open"),
            title: t("sd_guide_s1_c2_title", "Active {Mods} Folder (Symlink Target)"),
            desc: t("sd_guide_s1_c2_desc", "Your game's live {Mods} folder. Never drop files here manually—Sanctuary projects high-speed symlinks into this directory from your isolated {Vault}."),
          },
          {
            icon: t("icon_inventory_2", "inventory_2"),
            title: t("sd_guide_s1_c3_title", "Isolated {Vault} Folder (Deep Storage)"),
            desc: t("sd_guide_s1_c3_desc", "Your airgapped archive containing {Mods}/, {Blueprints}/, Backups/World, Backups/Engine, Quarantine/, and Data/Cache (.sanctuary_cache.db)."),
          },
          {
            icon: t("icon_verified_user", "verified_user"),
            title: t("sd_guide_s1_c4_title", "Windows Symlink Permissions"),
            desc: t(
              "sd_guide_s1_c4_desc",
              "Enable Windows Developer Mode or run Sanctuary OS as Administrator so the Airgap engine can project zero-byte symlinks instead of falling back to hardlinks."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s2_short", "2. Command Center"),
        title: t("sd_guide_s2_title", "The Command Center & Live Telemetry"),
        badge: t("sd_guide_s2_badge", "SYSTEM DASHBOARD • 4 HEALTH STATES"),
        icon: t("icon_space_dashboard", "space_dashboard"),
        desc: t("sd_guide_s2_desc", "Your high-level glassmorphic mission control. Monitors the health of your active {Blueprint}, surfaces {mason} updates and system dispatches, and provides 1-click access to Radar Sweeps and {Vault} Lockdown."),
        tip: t("sd_guide_s2_tip", "Use the global SystemStatusBar at the bottom of the window to trigger a Radar Sweep or instant {Vault} Lockdown from any screen in the OS."),
        cards: [
          {
            icon: t("icon_check_circle", "check_circle"),
            colorClass: "text-[var(--success)]",
            title: t("sd_guide_s2_c1_title", "System Stable (Green State)"),
            desc: t("sd_guide_s2_c1_desc", "All equipped {mods} match your active game version, all required DLCs and dependencies are satisfied, and zero unmitigated collisions exist."),
          },
          {
            icon: t("icon_system_update_alt", "system_update_alt"),
            colorClass: "text-[var(--info)]",
            title: t("sd_guide_s2_c2_title", "{Mod} Updates Available (Blue State)"),
            desc: t("sd_guide_s2_c2_desc", "Newer SHA-256 versions have been detected either via the Spoke Cloud Registry or decentralized {mason} manifest.json endpoints."),
          },
          {
            icon: t("icon_warning", "warning"),
            colorClass: "text-[var(--warning)]",
            title: t("sd_guide_s2_c3_title", "{Citizen} Action Recommended (Amber State)"),
            desc: t("sd_guide_s2_c3_desc", "An equipped {mod} is flagged as Unstable or has an unresolved Severity 3 Tuning Overlap awaiting a Load Order winner."),
          },
          {
            icon: t("icon_error", "error"),
            colorClass: "text-[var(--danger)]",
            title: t("sd_guide_s2_c4_title", "Critical Failure Detected (Red State)"),
            desc: t("sd_guide_s2_c4_desc", "An equipped {mod} is Corrupted, incompatible with your Game Patch, missing a mandatory dependency/DLC, or locked in a Severity 4 Fatal Clash."),
          },
        ],
      },
      {
        short: t("sd_guide_s3_short", "3. Your {Vault}"),
        title: t("sd_guide_s3_title", "Your {Vault} & Symlink Airgap 2.5"),
        badge: t("sd_guide_s3_badge", "ISOLATED STORAGE • SHA-256 DNA"),
        icon: t("icon_inventory_2", "inventory_2"),
        desc: t("sd_guide_s3_desc", "Your local {vault} and secured asset bunker. The game engine never touches your {Vault} directly—files are ingested, hashed via SHA-256, sanitized, and projected via symlinks."),
        tip: t("sd_guide_s3_tip", "Your Local {Mod} Dossier is decoupled from the cloud—you can freely customize {mod} titles, creator URLs, cover images, and tags locally."),
        cards: [
          {
            icon: t("icon_fingerprint", "fingerprint"),
            title: t("sd_guide_s3_c1_title", "Global Drop-Zone & DNA Match"),
            desc: t(
              "sd_guide_s3_c1_desc",
              "Drag and drop .package, .ts4script, .zip, .rar, .7z, .tar.zst, or override.json files anywhere into Sanctuary OS. Duplicate SHA-256 hashes are automatically intercepted."
            ),
          },
          {
            icon: t("icon_cloud_done", "cloud_done"),
            title: t(
              "sd_guide_s3_c2_title",
              "Decentralized Static Edge (override.json)"
            ),
            desc: t("sd_guide_s3_c2_desc", "When a {mod} archive includes a {mason}'s override.json, Sanctuary binds its SHA-256 lineage to the {mason}'s static manifest.json URL for serverless update alerts and atomic rules."),
          },
          {
            icon: t("icon_delete_sweep", "delete_sweep"),
            title: t("sd_guide_s3_c3_title", "Delete Cascade (Deep Yeet 2.0)"),
            desc: t(
              "sd_guide_s3_c3_desc",
              "Removing a core master library (such as XML Injector) automatically alerts you and queues all dependent add-ons so your loadout never breaks."
            ),
          },
          {
            icon: t("icon_visibility_off", "visibility_off"),
            title: t("sd_guide_s3_c4_title", "Ghosted Diagnostic States"),
            desc: t("sd_guide_s3_c4_desc", "Incompatible or broken {mods} automatically enter a translucent Ghosted state with hover tooltips detailing Missing DLC, Version Mismatches, or Collisions."),
          },
        ],
      },
      {
        short: t("sd_guide_s4_short", "4. {Blueprints}"),
        title: t("sd_guide_s4_title", "{Blueprints} & Tactical Loadouts"),
        badge: t("sd_guide_s4_badge", "INSTANT HOT-SWAP • CLOUD & OFFLINE"),
        icon: t("icon_map", "map"),
        desc: t("sd_guide_s4_desc", "Replace manual folder shuffling with {Blueprints}. Switch between completely different {mod} loadouts in seconds without duplicating files on your hard drive."),
        tip: t("sd_guide_s4_tip", "Use 'Snapshot Active {Blueprint}' anytime to clone your currently deployed loadout into an experimental profile before adding new {mods}."),
        cards: [
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: t("sd_guide_s4_c1_title", "1-Click {Blueprint} Hot-Swap"),
            desc: t("sd_guide_s4_c1_desc", "Switch active loadouts directly from the {Vault} header or {Blueprints} view. Sanctuary instantly re-projects the exact symlinks and load order for that profile."),
          },
          {
            icon: t("icon_tag", "tag"),
            title: t("sd_guide_s4_c2_title", "6-Digit Cloud Uplink (SNCXXX)"),
            desc: t(
              "sd_guide_s4_c2_desc",
              "Share your loadout with the community or across devices using a compact 6-character alphanumeric coordinate code."
            ),
          },
          {
            icon: t("icon_data_object", "data_object"),
            title: t("sd_guide_s4_c3_title", "Offline JSON Import/Export with modMeta"),
            desc: t("sd_guide_s4_c3_desc", "Export portable JSON {blueprints} that embed your custom Local Dossier metadata (author links, custom names) and workspace ID for 100% offline preservation."),
          },
          {
            icon: t("icon_install_mobile", "install_mobile"),
            title: t("sd_guide_s4_c4_title", "Remote Mobile/Web Queue Staging"),
            desc: t("sd_guide_s4_c4_desc", "Browse The Nexus on your phone or tablet, stage a {blueprint} queue encrypted in the cloud, and approve it in one click when you sit down at your PC."),
          },
        ],
      },
      {
        short: t("sd_guide_s5_short", "5. Nexus & Browser"),
        title: t("sd_guide_s5_title", "The Nexus & Integrated Side Browser"),
        badge: t("sd_guide_s5_badge", "METADATA REGISTRY • ZERO-TAX DISCOVERY"),
        icon: t("icon_hub", "hub"),
        desc: t("sd_guide_s5_desc", "Discover verified {Mods}, {Blueprints}, Lexicons, Chameleons, and Workbench Templates—and download directly from creator pages using the built-in Side Browser."),
        tip: t(
          "sd_guide_s5_tip",
          "You can toggle the Integrated Side Browser on or off anytime in System Preferences -> Network depending on whether you prefer in-app or external browsing."
        ),
        cards: [
          {
            icon: t("icon_tune", "tune"),
            title: t("sd_guide_s5_c1_title", "Smart Compatibility Filtering"),
            desc: t(
              "sd_guide_s5_c1_desc",
              "The Nexus automatically cross-references your installed Game Patch and owned DLCs, highlighting compatible releases and enforcing Tier-0 public safety."
            ),
          },
          {
            icon: t("icon_download", "download"),
            title: t("sd_guide_s5_c2_title", "Automatic Download Interception"),
            desc: t("sd_guide_s5_c2_desc", "Clicking download on a creator's page inside the Integrated Side Browser automatically intercepts the archive and routes it straight into your {Vault}."),
          },
          {
            icon: t("icon_verified", "verified"),
            title: t("sd_guide_s5_c3_title", "{Mason} Profiles & Direct Attribution"),
            desc: t("sd_guide_s5_c3_desc", "Follow your favorite {Masons} to see their posts in your Comm-Link feed. Sanctuary takes 0% platform tax and links directly to {mason} Patreon, Ko-fi, and websites."),
          },
          {
            icon: t("icon_radar", "radar"),
            title: t("sd_guide_s5_c4_title", "Crowd-Sourced Scout Queue"),
            desc: t("sd_guide_s5_c4_desc", "Unidentified local {mods} can be submitted via the Scout Dossier or marked 'Flag as Local' to permanently exclude private files from cloud lookups."),
          },
        ],
      },
      {
        short: t("sd_guide_s6_short", "6. Conflict Radar"),
        title: t("sd_guide_s6_title", "Conflict Radar & Schema Load Order Engine"),
        badge: t("sd_guide_s6_badge", "TOPOLOGICAL COMPILER • SEVERITY 1–4"),
        icon: t("icon_radar", "radar"),
        desc: t(
          "sd_guide_s6_desc",
          "Sanctuary combines global Architect Directives, creator Static Edge rules, and a topological Load Order compiler to resolve tuning overlaps and prevent crashes before launch."
        ),
        tip: t(
          "sd_guide_s6_tip",
          "Switch between Casual Mode and Advanced Mode anytime using the toggle inside Conflict Radar."
        ),
        cards: [
          {
            icon: t("icon_emoji_events", "emoji_events"),
            title: t("sd_guide_s6_c1_title", "Casual Mode: 1-Click 'Pick a Winner'"),
            desc: t("sd_guide_s6_c1_desc", "For Severity 3 Tuning Overlaps, simply click the {mod} you want to win. Sanctuary automatically compiles the priority rules and routes the winner into the top override tier."),
          },
          {
            icon: t("icon_rule", "rule"),
            title: t(
              "sd_guide_s6_c2_title",
              "Advanced Mode: Directional Rules & Cycle Breaker"
            ),
            desc: t(
              "sd_guide_s6_c2_desc",
              "Author custom 'Must Load After / Before' rules, assign explicit Priority Tiers (Base to Sanctuary3), and resolve circular dependency loops with 1-click Break Loop."
            ),
          },
          {
            icon: t("icon_warning", "warning"),
            title: t(
              "sd_guide_s6_c3_title",
              "Severity 4 (Fatal) vs. Severity 3 (Tuning)"
            ),
            desc: t("sd_guide_s6_c3_desc", "Severity 4 indicates a hard binary/script clash where only one {mod} can remain enabled. Severity 3 indicates a tuning overlap solvable via Load Order priority."),
          },
          {
            icon: t("icon_layers", "layers"),
            title: t("sd_guide_s6_c4_title", "Schema-Driven Deployment Strategies"),
            desc: t(
              "sd_guide_s6_c4_desc",
              "Adapts per game schema: dynamic Resource.cfg multi-tier folders (Sims 4), ordered manifest lists (loadorder.txt / plugins.txt), numeric prefixes (001_), or timestamps."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s7_short", "7. Homestead Lab"),
        title: t("sd_guide_s7_title", "Homestead Lab & 100% Nuke Isolation"),
        badge: t("sd_guide_s7_badge", "AIRGAPPED SANDBOX • LIVE CRASH CAPTURE"),
        icon: t("icon_science", "science"),
        desc: t("sd_guide_s7_desc", "Test unverified {mods} or pit two conflicting {mods} against each other in an airgapped sandbox without risking your real save files or main loadout."),
        tip: t("sd_guide_s7_tip", "Passing a timed Homestead Lab playtest and saving in-game automatically verifies your Sandbox {mod} for publishing!"),
        cards: [
          {
            icon: t("icon_bolt", "bolt"),
            title: t("sd_guide_s7_c1_title", "100% Nuke Symlink Injection"),
            desc: t(
              "sd_guide_s7_c1_desc",
              "Temporarily strips your active loadout symlinks and injects only the isolated test subject plus its mandatory dependencies."
            ),
          },
          {
            icon: t("icon_shield", "shield"),
            title: t("sd_guide_s7_c2_title", "Hardware-Airgapped Lab Test Save"),
            desc: t(
              "sd_guide_s7_c2_desc",
              "Swaps your live Saves folder with a dedicated Lab Test Save slot during testing so your legacy households can never be corrupted."
            ),
          },
          {
            icon: t("icon_bug_report", "bug_report"),
            title: t("sd_guide_s7_c3_title", "Real-Time Exception & Crash Monitor"),
            desc: t(
              "sd_guide_s7_c3_desc",
              "Purges stale logs before launch and watches for LastException / engine crash output in real time, matching against community diagnostic signatures."
            ),
          },
          {
            icon: t("icon_compare_arrows", "compare_arrows"),
            title: t("sd_guide_s7_c4_title", "1v1 Conflict Stability Protocol"),
            desc: t("sd_guide_s7_c4_desc", "Pit two suspected conflicting {mods} together in isolation to verify compatibility and submit telemetry directly to Architects."),
          },
        ],
      },
      {
        short: t("sd_guide_s8_short", "8. {Backups} & IDE"),
        title: t("sd_guide_s8_title", "{Backups} & {Citizen}'s Workbench"),
        badge: t("sd_guide_s8_badge", "HARDLINK SNAPSHOTS • VISUAL CONFIG IDE"),
        icon: t("icon_history", "history"),
        desc: t("sd_guide_s8_desc", "Protect your saves and game binaries with zero-duplication hardlink backups, and fine-tune {mod} configuration files using visual sliders or the built-in Monaco IDE."),
        tip: t("sd_guide_s8_tip", "When DEFCON 1 is declared for an incoming game patch, Sanctuary automatically prompts to seal a Pre-Patch {Backups} before launching."),
        cards: [
          {
            icon: t("icon_archive", "archive"),
            title: t(
              "sd_guide_s8_c1_title",
              "World State (Purple) & Engine Core (Pink)"
            ),
            desc: t(
              "sd_guide_s8_c1_desc",
              "Independently snapshot your Saves/Tray/Configs (World State) and your actual Game Installation Binaries (Engine Core) before patches hit."
            ),
          },
          {
            icon: t("icon_home_storage", "home_storage"),
            title: t("sd_guide_s8_c2_title", "0 MB Delta Hardlink Deduplication"),
            desc: t(
              "sd_guide_s8_c2_desc",
              "Unchanged files are linked via native OS hardlinks rather than copied—making snapshots near-instant and consuming disk space only for changed bytes."
            ),
          },
          {
            icon: t("icon_settings_backup_restore", "settings_backup_restore"),
            title: t(
              "sd_guide_s8_c3_title",
              "Differential Rollback & Surgical Extraction"
            ),
            desc: t("sd_guide_s8_c3_desc", "Restore an entire snapshot via fast differential sync, or browse inside any {Backups} to surgically extract a single household save slot."),
          },
          {
            icon: t("icon_construction", "construction"),
            title: t("sd_guide_s8_c4_title", "{Citizen}'s Workbench & Open {Mason} Workshop"),
            desc: t("sd_guide_s8_c4_desc", "Edit {mod} .json/.ini/.cfg files with safe visual toggles and sliders synced live with a Monaco Raw Code Diff editor—plus full local Sandbox & Export Release tools for all {Citizens}."),
          },
        ],
      },
      {
        short: t("sd_guide_s9_short", "9. Themes & Security"),
        title: t("sd_guide_s9_title", "Chameleons, Lexicons & Malware Defense"),
        badge: t("sd_guide_s9_badge", "LIQUID GLASS V3 • DUAL-TIER HEURISTICS"),
        icon: t("icon_shield", "shield"),
        desc: t(
          "sd_guide_s9_desc",
          "Personalize every pixel and word of Sanctuary OS while staying protected by cryptographic SHA-256 DNA blacklists and the multi-format Rust Heuristic Scanner."
        ),
        tip: t(
          "sd_guide_s9_tip",
          "Sanctuary OS works 100% offline without an account—and if you sign in, elevated roles are protected by hardware/biometric FIDO2 Passkeys."
        ),
        cards: [
          {
            icon: t("icon_palette", "palette"),
            title: t("sd_guide_s9_c1_title", "Chameleon Theme Forge & Liquid Glass"),
            desc: t(
              "sd_guide_s9_c1_desc",
              "Switch between Dark and Light presets, download community Chameleons, or build your own in Theme Forge with live refractive saturation, rim light, and specular glare sliders."
            ),
          },
          {
            icon: t("icon_translate", "translate"),
            title: t("sd_guide_s9_c2_title", "Lexicon Protocol (Word-as-a-Service)"),
            desc: t(
              "sd_guide_s9_c2_desc",
              "Hot-swap the entire OS vocabulary between Standard Technical English, Sanctuary Sci-Fi Cyberpunk, Sims-Friendly Casual, or Simlish."
            ),
          },
          {
            icon: t("icon_security", "security"),
            title: t(
              "sd_guide_s9_c3_title",
              "Dual-Tier Multi-Format Heuristic Scanner"
            ),
            desc: t(
              "sd_guide_s9_c3_desc",
              "Combines Sanctuary Foundry Core Heuristics and Game Spoke Heuristics to inspect .zip, .ts4script, .package, .dll, .exe, and compiled Python .pyc bytecode before execution."
            ),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t("sd_guide_s9_c4_title", "Full-OS Malware Lockdown & Secure Shred"),
            desc: t(
              "sd_guide_s9_c4_desc",
              "If Tier 5 Malware is detected, Sanctuary isolates the file in Quarantine, locks the workspace shell, displays the exact trigger & source in the side panel, and overwrites the file with zeros upon your Secure Shred signature."
            ),
          },
        ],
      },
    ],
    [t]
  );

  // 7-Stage Step-by-Step OS Walkthrough (What Everything Does)
  const walkthroughStages = useMemo(
    () => [
      {
        num: 1,
        short: t("dir_walk_s1_short", "1. Shell & Bars"),
        icon: t("icon_space_dashboard", "space_dashboard"),
        title: t("dir_walk_s1_title", "Global Shell: Sidebar, Top Pill & Dock"),
        sub: t("dir_walk_s1_sub", "Persistent Glass Frame & Context-Aware Navigation"),
        desc: t(
          "dir_walk_s1_desc",
          "Sanctuary OS is framed by three persistent Liquid Glass bars that adapt automatically between the Foundry Landing Page and your mounted Game Workspaces."
        ),
        controls: [
          {
            icon: t("icon_menu", "menu"),
            name: t("dir_walk_s1_c1_name", "Left Sidebar (Context-Aware)"),
            desc: t("dir_walk_s1_c1_desc", "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 {Citizen} modules, unlocked Command Hubs, and the Quick Launch button."),
          },
          {
            icon: t("icon_sports_esports", "sports_esports"),
            name: t("dir_walk_s1_c2_name", "Top Center Workspace Pill"),
            desc: t(
              "dir_walk_s1_c2_desc",
              "Click the game pill in the top TitleBar to switch active games, mount a new workspace, or return to the Sanctuary Foundry Landing Page."
            ),
          },
          {
            icon: t("icon_dock_to_bottom", "dock_to_bottom"),
            name: t("dir_walk_s1_c3_name", "Bottom Morphing Status Pill"),
            desc: t("dir_walk_s1_c3_desc", "Houses 1-Click Radar Sweep, {Vault} Lockdown, {Blueprint} Quick-Swap, Side Browser, Notifications, and live alert counters. Auto-tucks when SidePanels open."),
          },
        ],
      },
      {
        num: 2,
        short: t("dir_walk_s2_short", "2. Cartographer"),
        icon: t("icon_explore", "explore"),
        title: t("dir_walk_s2_title", "Mounting a Workspace & Cartographer"),
        sub: t("dir_walk_s2_sub", "First-Boot Coordinate Mapping & Native PE Ripper"),
        desc: t("dir_walk_s2_desc", "Selecting a workspace on the Landing Page launches The Cartographer to link your game binary, live {Mods} directory, and airgapped {Vault} storage."),
        controls: [
          {
            icon: t("icon_terminal", "terminal"),
            name: t("dir_walk_s2_c1_name", "Bin Folder (Executable Path)"),
            desc: t(
              "dir_walk_s2_c1_desc",
              "Points to your game binary (e.g. TS4_x64.exe). Sanctuary extracts the genuine patch version in-process via Rust pelite without spawning background processes."
            ),
          },
          {
            icon: t("icon_folder_open", "folder_open"),
            name: t("dir_walk_s2_c2_name", "{Mods} Folder (Symlink Target)"),
            desc: t("dir_walk_s2_c2_desc", "Your live game {Mods} folder. Keep this untouched—Sanctuary projects active {mods} here via zero-copy OS symlinks."),
          },
          {
            icon: t("icon_inventory_2", "inventory_2"),
            name: t("dir_walk_s2_c3_name", "{Vault} Folder (Deep Archive)"),
            desc: t("dir_walk_s2_c3_desc", "Your isolated storage directory where Sanctuary builds {Mods}/, {Blueprints}/, Backups/World/, Backups/Engine/, Quarantine/, and Data/Cache/."),
          },
        ],
      },
      {
        num: 3,
        short: t("dir_walk_s3_short", "3. {Vault} & Cards"),
        icon: t("icon_inventory_2", "inventory_2"),
        title: t("dir_walk_s3_title", "Your {Vault}, {Mod} Cards & ActionPill"),
        sub: t("dir_walk_s3_sub", "Drag-and-Drop Ingestion, Suite Grouping & Dossiers"),
        desc: t("dir_walk_s3_desc", "Every {mod} you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Dual-Tier Heuristic Engine, and indexed in Your {Vault}."),
        controls: [
          {
            icon: t("icon_tune", "tune"),
            name: t("dir_walk_s3_c1_name", "ActionPill & Filters Popover"),
            desc: t(
              "dir_walk_s3_c1_desc",
              "Instant search bar, Filters (tune) popover for Game Version / Eligible-Only filtering, sort order, and bulk selection actions."
            ),
          },
          {
            icon: t("icon_toggle_on", "toggle_on"),
            name: t("dir_walk_s3_c2_name", "Parent Suite Card & Equip Toggle"),
            desc: t("dir_walk_s3_c2_desc", "Toggles symlinks in milliseconds. Multi-part {mod} suites (like MC Command Center) group into one Parent Card with an expandable Linked Modules drawer."),
          },
          {
            icon: t("icon_menu_book", "menu_book"),
            name: t("dir_walk_s3_c3_name", "{Mod} Dossier SidePanel"),
            desc: t(
              "dir_walk_s3_c3_desc",
              "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static manifest.json URL, or inspect package files."
            ),
          },
        ],
      },
      {
        num: 4,
        short: t("sd_guide_s4_short", "4. {Blueprints}"),
        icon: t("icon_map", "map"),
        title: t("dir_walk_s4_title", "{Blueprints} & Loadout Hot-Swapping"),
        sub: t("dir_walk_s4_sub", "Zero-Copy Profile Switching & SNCXXX Cloud Uplinks"),
        desc: t(
          "dir_walk_s4_desc",
          "Replace manual folder dragging with saved tactical loadouts that swap thousands of symlinks in under a second."
        ),
        controls: [
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            name: t("dir_walk_s4_c1_name", "{Blueprint} Hot-Swap Dropdown"),
            desc: t("dir_walk_s4_c1_desc", "Switch between playstyles (e.g. Realism Save, Occult Save, Patch Testing) directly from the {Vault} header or Bottom Dock."),
          },
          {
            icon: t("icon_data_object", "data_object"),
            name: t("dir_walk_s4_c2_name", "Portable Offline JSON Export"),
            desc: t(
              "dir_walk_s4_c2_desc",
              "Exports your loadout to a self-contained .json file that preserves custom local modMeta URLs and workspace identity offline."
            ),
          },
          {
            icon: t("icon_tag", "tag"),
            name: t("dir_walk_s4_c3_name", "6-Digit Cloud Uplink (SNCXXX)"),
            desc: t("dir_walk_s4_c3_desc", "Generates a 6-character share code (SNCXXX) or publishes your {Blueprint} to The Nexus while auto-stripping flagged Tier 1–4 hashes."),
          },
        ],
      },
      {
        num: 5,
        short: t("dir_walk_s5_short", "5. Radar & Lab"),
        icon: t("icon_radar", "radar"),
        title: t("dir_walk_s5_title", "Conflict Radar & Homestead Lab"),
        sub: t("dir_walk_s5_sub", "Pick-a-Winner Load Order & 100% Nuke Proving Grounds"),
        desc: t("dir_walk_s5_desc", "Resolve tuning overlaps before launching the game, or isolate suspect {mods} in a sterile crash-monitored sandbox."),
        controls: [
          {
            icon: t("icon_emoji_events", "emoji_events"),
            name: t("dir_walk_s5_c1_name", "Casual Mode (Pick a Winner)"),
            desc: t("dir_walk_s5_c1_desc", "Click 'Pick a Winner' on any Severity 3 Tuning Overlap to automatically route the winning {mod} into a higher priority tier and dynamic Resource.cfg."),
          },
          {
            icon: t("icon_rule", "rule"),
            name: t("dir_walk_s5_c2_name", "Advanced Load Order & Break Loop"),
            desc: t(
              "dir_walk_s5_c2_desc",
              "Build directional Must Load After / Before rules with topological sorting and 1-click circular dependency loop breaking."
            ),
          },
          {
            icon: t("icon_science", "science"),
            name: t("dir_walk_s5_c3_name", "Homestead 100% Nuke & 1v1 Test"),
            desc: t("dir_walk_s5_c3_desc", "Strips your main loadout and boots the game with only the test {mod} (or 2 conflicting {mods}) while harvesting lastException.txt logs."),
          },
        ],
      },
      {
        num: 6,
        short: t("dir_walk_s6_short", "6. IDE & Backups"),
        icon: t("icon_construction", "construction"),
        title: t("dir_walk_s6_title", "Workbench, Timeline Diff & {Backups}"),
        sub: t("dir_walk_s6_sub", "2-Column Visual Config Studio & Hardlink Backups"),
        desc: t("dir_walk_s6_desc", "Edit 430+ setting {mod} config files visually at 60 FPS and safeguard your saves and game binaries with zero-bloat snapshots."),
        controls: [
          {
            icon: t("icon_tune", "tune"),
            name: t("dir_walk_s6_c1_name", "2-Column Visual Config Editor"),
            desc: t(
              "dir_walk_s6_c1_desc",
              "Category Pill Bar, dual Min/Max range steppers, Undo to Saved, Reset to Default, and a No-Code Visual Template Builder."
            ),
          },
          {
            icon: t("icon_compare_arrows", "compare_arrows"),
            name: t("dir_walk_s6_c2_name", "2-Column Timeline & Diff Panel"),
            desc: t(
              "dir_walk_s6_c2_desc",
              "Compare live unsaved edits or historical snapshots side-by-side in Visual Diff cards or Raw Monaco Code Diff."
            ),
          },
          {
            icon: t("icon_history", "history"),
            name: t("dir_walk_s6_c3_name", "{Backups} (World & Engine)"),
            desc: t(
              "dir_walk_s6_c3_desc",
              "Uses OS hardlinks so unchanged files consume 0 extra bytes, paired with differential rollback restoration."
            ),
          },
        ],
      },
      {
        num: 7,
        short: t("dir_walk_s7_short", "7. Hubs & Security"),
        icon: t("icon_shield", "shield"),
        title: t("dir_walk_s7_title", "Open Workshop, Passkeys & Lockdown"),
        sub: t("dir_walk_s7_sub", "{Citizen} Creator Inheritance & Full-OS Security Gates"),
        desc: t("dir_walk_s7_desc", "Every {Citizen} inherits the local {Mason} Workshop, while hardware FIDO2 Passkeys and full-OS Quarantine Lockdowns protect the ecosystem."),
        controls: [
          {
            icon: t("icon_handyman", "handyman"),
            name: t("dir_walk_s7_c1_name", "Open {Mason} Workshop ({Citizen} Tier)"),
            desc: t("dir_walk_s7_c1_desc", "All {Citizens} can use Dev Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge (6 Liquid Glass sliders), and Static Edge Release Packaging."),
          },
          {
            icon: t("icon_passkey", "passkey"),
            name: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP {Vault}"),
            desc: t("dir_walk_s7_c2_desc", "Elevated clearances (Verified {Mason} through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security {Vault} SidePanel."),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            name: t("dir_walk_s7_c3_name", "Quarantine SidePanel OS Lockdown"),
            desc: t(
              "dir_walk_s7_c3_desc",
              "Tier 5 Malware locks the entire OS shell and opens the Quarantine SidePanel with Triggered By diagnostics, Detection Source, and Secure Shred."
            ),
          },
        ],
      },
    ],
    [t]
  );

  // 6 Clearance Tiers (Tier 1 Citizen inheriting Open Workshop + Tier 2 Verified Mason through Tier 6 Keeper)
  const elevatedRoles = useMemo(
    () => [
      {
        short: t("role_citizen", "{Citizen}"),
        icon: t("icon_person", "person"),
        title: t("role_citizen", "{Citizen}"),
        badge: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
        desc: t("dir_proto_r1_scope", "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions."),
        requiresPasskey: false,
      },
      {
        short: t("dir_proto_r2_role", "Verified {Mason}"),
        icon: t("icon_construction", "construction"),
        title: t("dir_proto_r2_role", "Verified {Mason}"),
        badge: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
        desc: t("dir_proto_r2_scope", "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge."),
        requiresPasskey: true,
      },
      {
        short: t("architect", "Architect"),
        icon: t("icon_architecture", "architecture"),
        title: t("architect", "Architect"),
        badge: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
        desc: t("dir_proto_r3_scope", "Unlocks Architect Console: Global Registry curation (3-Tile {Mod} Studio), Verified {Mason} & Scout Queue triage (min_scout_submissions), Global Conflict Matrix directives, Check Hash deep scan, Template Oversight, and claimable {Citizen} Support Desk tickets."),
        requiresPasskey: true,
      },
      {
        short: t("role_oversight", "Oversight"),
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        title: t("role_oversight", "Oversight"),
        badge: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
        desc: t("dir_proto_r4_scope", "Unlocks Oversight Command: Spoke Heuristic Signatures authoring, Compliance Tier 5 Malware flagging, Emergency DEFCON 1 Lockdown override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect)."),
        requiresPasskey: true,
      },
      {
        short: t("role_wayfinder", "Wayfinder"),
        icon: t("icon_explore", "explore"),
        title: t("role_wayfinder", "Wayfinder"),
        badge: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
        desc: t(
          "dir_proto_r5_scope",
          "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), SANCTUARY-UPLINK:// bundle export & live key rotation, unilateral Cut the Cord severance (secure_sever_spoke_cord), The Dispatch (2x2 telemetry headers + polls), and Game Audit Logs."
        ),
        requiresPasskey: true,
      },
      {
        short: t("dir_proto_r6_role", "Keeper"),
        icon: t("icon_memory", "memory"),
        title: t("dir_proto_r6_role", "Keeper"),
        badge: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
        desc: t(
          "dir_proto_r6_scope",
          "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Turnkey Spoke Onboarding, Core Heuristics (keeper_heuristic_signatures), Master Game Schemas, Global Lexicons/Chameleons, Bilateral Codebase-to-Keepers-Core Directives Sync, and Global Audit Logs."
        ),
        requiresPasskey: true,
      },
    ],
    [t]
  );

  // 12 Phases for the Interactive Roadmap Timeline (Reverse Chronological: Phase 12 -> Phase 1, enriched from Phase Roadmaps.txt & Foundry Comm-Logs)
  const roadmapPhases = useMemo(
    () => [
      {
        num: 12,
        status: "active" as const,
        icon: t("icon_rocket_launch", "rocket_launch"),
        code: t("sd_roadmap_p12_period", "PHASE 12 • JULY 15, 2026 — IN PROGRESS"),
        title: t(
          "sd_roadmap_p12_title",
          "Agnostic Future — Multi-Workspace, Sanctuary V6 Liquid Glass & Web PWA"
        ),
        sub: t("sd_roadmap_p12_focus", "{Citizens} Workbench / {Mason} IDE, Lexicon Revamp, Sanctuary Partners, V6 Liquid Glass & Website V2"),
        desc: t("sd_roadmap_p12_summary", "Dual-Vision {Mason} IDE & Cloud Lexicons (Completed), Multi-Workspace Master Schemas & the 0%-cut Sanctuary Partners Agreement, the Sanctuary V6 3D Liquid Glass Engine & 18-Section Revamp, and Website V2 / Mobile PWA."),
        milestones: [
          {
            title: t("sd_roadmap_p12_m5_title", "{Citizens} Workbench & {Mason} IDE 2.0"),
            desc: t("sd_roadmap_p12_m5_desc", "Named Version Timeline entries, simultaneous Dual-Vision (Visual + Raw Monaco) split editing, Author Mode scaffolding, and the side-by-side Lexicon Builder."),
            pending: false,
          },
          {
            title: t("sd_roadmap_p12_m6_title", "Lexicon Revamp & Cloud Schemas"),
            desc: t("sd_roadmap_p12_m6_desc", "Deduplicated all localization dictionaries, moved default Lexicon JSONs to the cloud database, and added official Sanctuary & Community badges."),
            pending: false,
          },
          {
            title: t("sd_roadmap_p12_m7_title", "Multi-Workspace & Sanctuary Partners"),
            desc: t("sd_roadmap_p12_m7_desc", "Shared Core App and SSO with per-game Master Schemas, 100% Partner DB ownership ('Cut the Cord'), 0%-cut Partner Donations, and 1-File Standalone Forking."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m8_title", "Sanctuary V6 & Liquid Glass Engine"),
            desc: t("sd_roadmap_p12_m8_desc", "4-layer 3D Refractive Liquid Glass Engine, revamped Default Themes + The Sims 4 ('Plumbob Crystal') Partner {Chameleon}, and Chameleon {Chameleon} Forge 2.0."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m10_title", "Dynamic Alert Tiles & 18-Section Revamp"),
            desc: t("sd_roadmap_p12_m10_desc", "Floating 2-Pill Title Bar, Hover Dock, 5 Dynamic Alert Stat Tiles (Permissions, Global, Critical, System, Updates), and a full 18-section UI overhaul."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m9_title", "Website V2, Mobile PWA & Remote Queuing"),
            desc: t("sd_roadmap_p12_m9_desc", "Unified single-codebase Web OS & PWA (sanctuaryos.net/sims4) with live Comm-Link, Nexus, Support Desk, Command Hubs, and Web-to-PC {Blueprint} queuing."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m11_title", "Schema-Driven Load Order Compiler"),
            desc: t("sd_roadmap_p12_m11_desc", "Declarative Master Game Schemas powering multi-strategy topological compilation across folder priority, manifest lists, numeric prefixes, and timestamps."),
            pending: false,
          },
          {
            title: t("sd_roadmap_p12_m12_title", "FIDO2 Passkey {Vault} & Quarantine Lockdown"),
            desc: t("sd_roadmap_p12_m12_desc", "Hardware WebAuthn Passkey gates for Elevated Hubs, Full-OS Malware Quarantine SidePanel Lockdown, Silent Updater, and Bilateral Directives Sync."),
            pending: false,
          },
        ],
      },
      {
        num: 11,
        status: "completed" as const,
        icon: t("icon_public", "public"),
        code: t("sd_roadmap_p11_period", "PHASE 11 • MAY 17 – JULY 13, 2026"),
        title: t("sd_roadmap_p11_title", "Technical Debt Repayment, {Citizens} Workbench & The Agnostic Sprint"),
        sub: t("sd_roadmap_p11_focus", "Native Intake & Support Desk, {Citizens} Workbench 1.0 & Game-Agnostic Kernel"),
        desc: t("sd_roadmap_p11_summary", "Integrated {Mason} & Architect intake forms, native Bug Reports & Support Ticket Dossiers, {Citizens} Workbench 1.0 (.cfg/.ini/.json + Monaco IDE + Sanctuary Templates), full 11-section Lexicon/UI sweep, and the Agnostic Sprint."),
        milestones: [
          {
            title: t("sd_roadmap_p11_m5_title", "Native Intake Forms & Support Desk"),
            desc: t("sd_roadmap_p11_m5_desc", "Integrated {Mason} UUID registration, Architect intake forms, Bug Reports, and encrypted Support Ticket dossiers directly into the Desktop App."),
          },
          {
            title: t("sd_roadmap_p11_m6_title", "{Citizens} Workbench 1.0 & Sanctuary Templates"),
            desc: t("sd_roadmap_p11_m6_desc", "Automatic .cfg, .ini, and .json detection in the {Vault} with an embedded Monaco IDE and visual slider/toggle Schema Mapping."),
          },
          {
            title: t("sd_roadmap_p11_m7_title", "The Agnostic Sprint & Master Schemas"),
            desc: t("sd_roadmap_p11_m7_desc", "Extracted all hardcoded Sims 4 (.package / .ts4script) checks across 17 frontend modules and the Rust backend into dynamic Master JSON Schemas."),
          },
          {
            title: t("sd_roadmap_p11_m8_title", "Integrated Side Browser & {Vault} Intercept"),
            desc: t("sd_roadmap_p11_m8_desc", "Embedded multi-tab Side Browser that automatically intercepts .zip, .rar, .7z, .package, and .ts4script downloads straight into the {Vault}."),
          },
          {
            title: t("sd_roadmap_p11_m9_title", "Full-Stack Security & Forensic Audit"),
            desc: t("sd_roadmap_p11_m9_desc", "Hardened Rust path-traversal guards (is_safe_user_file_path), Supabase Row-Level Security (RLS) policies, and immutable append-only audit logs."),
          },
          {
            title: t("sd_roadmap_p11_m10_title", "Oversight {Mason} Linker & Lexicon Sweep"),
            desc: t("sd_roadmap_p11_m10_desc", "Deployed the Oversight {Mason} Linker, automatic Unregistered {Vault} syncing on Nexus verification, and a full 11-section Lexicon/UI sweep."),
          },
        ],
      },
      {
        num: 10,
        status: "completed" as const,
        icon: t("icon_palette", "palette"),
        code: t("sd_roadmap_p10_period", "PHASE 10 • MAY 10 – MAY 16, 2026"),
        title: t(
          "sd_roadmap_p10_title",
          "Post-Alpha Revamp, Visual Protocol Manager & Senior Architect Mass Update"
        ),
        sub: t("sd_roadmap_p10_focus", "Dev Sandbox, Visual Protocol Schema, Theme Forge & Mass Triage"),
        desc: t("sd_roadmap_p10_summary", "Launched the isolated Dev Sandbox & 'Sync to Network' creator pipeline, visual database-schema Protocol Manager, Folder Structure builder, Senior Architect Mass Update console, The Nexus registry, and Chameleon {Chameleon} Forge."),
        milestones: [
          {
            title: t("sd_roadmap_p10_m5_title", "Isolated Dev Sandbox & Sync to Network"),
            desc: t("sd_roadmap_p10_m5_desc", "Dedicated local Dev Sandbox folder bypassing radar hash churn for WIP {mods}, paired with 1-click 'Sync to Network' release promotion."),
          },
          {
            title: t("sd_roadmap_p10_m6_title", "Visual Protocol & Folder Structure Builder"),
            desc: t("sd_roadmap_p10_m6_desc", "Database-schema visual Protocol Manager (Core & Addons, Flavors, Dependencies, DLC) and visual Folder Structure builder enforced by Sanitize {Vault}."),
          },
          {
            title: t("sd_roadmap_p10_m7_title", "Senior Architect Mass Update & Filters"),
            desc: t("sd_roadmap_p10_m7_desc", "Bulk post-patch triage console for Senior Architects alongside 'Game Version', 'Currently Eligible', and 'Exclude Unowned DLC' filters."),
          },
          {
            title: t("sd_roadmap_p10_m8_title", "The Nexus Discovery Registry"),
            desc: t("sd_roadmap_p10_m8_desc", "Global metadata catalog for {Mods}, {Blueprints}, Lexicons, Chameleons, and Templates with automatic game patch and DLC compatibility filtering."),
          },
          {
            title: t("sd_roadmap_p10_m9_title", "Chameleon Theme Forge & Holo Sandbox"),
            desc: t("sd_roadmap_p10_m9_desc", "Interactive Theme Forge suite featuring a multi-stop atmospheric Background Builder, Dark/Light adaptation, and live Holo Sandbox previewing."),
          },
          {
            title: t("sd_roadmap_p10_m10_title", "Hot-Swappable Lexicon Protocol"),
            desc: t("sd_roadmap_p10_m10_desc", "Word-as-a-Service localization engine routing 100% of UI labels and icons through hot-swappable JSON dictionaries."),
          },
        ],
      },
      {
        num: 9,
        status: "completed" as const,
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        code: t("sd_roadmap_p9_period", "PHASE 9 • MAY 8 – MAY 9, 2026"),
        title: t(
          "sd_roadmap_p9_title",
          "Infrastructure Finalization, Laboratory Diagnostics & Command Hubs"
        ),
        sub: t("sd_roadmap_p9_focus", "Proving Grounds Simulation, macOS Universal Pipeline & Command Hubs"),
        desc: t(
          "sd_roadmap_p9_summary",
          "Transitioned Homestead Proving Grounds into a live simulation laboratory with real-time log monitoring, deployed the Senior Architect & Wayfinder Command Hubs, automated signed macOS Universal (.dmg) builds, and enforced Florida Compliance Tiers 1–4."
        ),
        milestones: [
          {
            title: t("sd_roadmap_p9_m5_title", "Live Proving Grounds & macOS Pipeline"),
            desc: t("sd_roadmap_p9_m5_desc", "Real-time crash log monitoring with 1-click conflict rule pushing in the Homestead Lab, plus signed macOS Universal (.dmg) GitHub Actions builds."),
          },
          {
            title: t("sd_roadmap_p9_m6_title", "Five Elevated Command Hubs"),
            desc: t("sd_roadmap_p9_m6_desc", "Dedicated ElevatedHubLayout command centers for {Mason} Workshop, Architect Console, Oversight Command, Wayfinder Operations, and Keepers Core."),
          },
          {
            title: t("sd_roadmap_p9_m7_title", "Claimable Support Desk Ticket Dossiers"),
            desc: t("sd_roadmap_p9_m7_desc", "Interactive ticket dossiers equipped with PII-scrubbed crash logs, response macros, and cross-tier escalation between Architects and Oversight."),
          },
          {
            title: t("sd_roadmap_p9_m8_title", "Florida Compliance Tiers 1–4"),
            desc: t("sd_roadmap_p9_m8_desc", "Automated public feed scrubbing and Cloud {Blueprint} hash purge triggers protecting public discovery while preserving local {Vault} freedom."),
          },
        ],
      },
      {
        num: 8,
        status: "completed" as const,
        icon: t("icon_cell_tower", "cell_tower"),
        code: t("sd_roadmap_p8_period", "PHASE 8 • MAY 7 – MAY 8, 2026"),
        title: t(
          "sd_roadmap_p8_title",
          "Standardized Lexicons, Dynamic Engine Recognition & DEFCON Shield"
        ),
        sub: t("sd_roadmap_p8_focus", "Rust Rip Protocol, Auto-Sanitization Launch & DEFCON 1 Shield"),
        desc: t("sd_roadmap_p8_summary", "Engineered the Rust 'Rip Protocol' for dynamic engine version recognition, Auto-Sanitization Launch purging stale crash logs & caches, Global Lexicon Extraction, the {Blueprint} Architect Load Order UI, and the real-time DEFCON 1 patch shield."),
        milestones: [
          {
            title: t("sd_roadmap_p8_m5_title", "Rust 'Rip Protocol' & Auto-Sanitization"),
            desc: t("sd_roadmap_p8_m5_desc", "Dynamic engine version recognition parsing Default.ini and PE headers in Rust, plus pre-launch purging of stale LastException and cache files."),
          },
          {
            title: t("sd_roadmap_p8_m6_title", "Global Comm-Link Broadcast Feed"),
            desc: t("sd_roadmap_p8_m6_desc", "Real-time community feed supporting WYSIWYG/Markdown dispatches, multi-level threaded replies, and dedicated Discover & Following tabs."),
          },
          {
            title: t("sd_roadmap_p8_m7_title", "DEFCON 1 Pre-Patch Network Shield"),
            desc: t("sd_roadmap_p8_m7_desc", "Real-time network listener that intercepts game launches during breaking engine patches to prompt an emergency {Backups} backup."),
          },
          {
            title: t("sd_roadmap_p8_m8_title", "Tier 5 Malware Scanner & Secure Shred"),
            desc: t("sd_roadmap_p8_m8_desc", "Byte-level heuristic malware scanner, {Citizen}-signed 3-pass Secure Shredding, and the privacy-first hardware_bans Nuclear Override."),
          },
        ],
      },
      {
        num: 7,
        status: "completed" as const,
        icon: t("icon_construction", "construction"),
        code: t("sd_roadmap_p7_period", "PHASE 7 • MAY 6, 2026"),
        title: t("sd_roadmap_p7_title", "Core Architecture, {Backups} Compression & Windows MSI Pipeline"),
        sub: t("sd_roadmap_p7_focus", "Nested {Vault} Taxonomy, 78 GB → 24 GB Engine Compression & Automated MSI Builds"),
        desc: t("sd_roadmap_p7_summary", "Deployed the nested {Vault} directory hierarchy, optimized {Backups} Engine Core compression (78 GB → 24 GB) with <50s rollbacks, automated Windows .msi GitHub Actions builds, and integrated Scout Dossiers into Conflict Radar."),
        milestones: [
          {
            title: t("sd_roadmap_p7_m5_title", "Nested {Vault} Taxonomy & 24 GB Compression"),
            desc: t("sd_roadmap_p7_m5_desc", "Self-healing {Vault} hierarchy (Backups/World, Backups/Engine, Data/cache, Quarantine) and 78 GB → 24 GB Engine Core compression with <50s rollbacks."),
          },
          {
            title: t("sd_roadmap_p7_m6_title", "Schema-Driven Visual Config Workbench"),
            desc: t("sd_roadmap_p7_m6_desc", "Visual configuration studio rendering raw {mod} settings as interactive sliders and toggles synchronized live with a Monaco Raw Editor."),
          },
          {
            title: t("sd_roadmap_p7_m7_title", "{Mason} Workshop & Collections Orchestrator"),
            desc: t("sd_roadmap_p7_m7_desc", "Creator suite featuring an isolated Dev Sandbox, Collections Builder, and relational Protocol Orchestrator for Twins, Flavors, and Dependencies."),
          },
          {
            title: t("sd_roadmap_p7_m8_title", "In-Process Rust PE Executable Parser"),
            desc: t("sd_roadmap_p7_m8_desc", "Native Rust pelite binary parser extracting genuine patch versions directly from .exe headers with zero antivirus false positives."),
          },
        ],
      },
      {
        num: 6,
        status: "completed" as const,
        icon: t("icon_science", "science"),
        code: t("sd_roadmap_p6_period", "PHASE 6 • MAY 3 – MAY 5, 2026"),
        title: t(
          "sd_roadmap_p6_title",
          "Codebase Modularization, Comm-Link Ledger & Homestead Proving Grounds"
        ),
        sub: t("sd_roadmap_p6_focus", "Creator Following Feed, App.tsx Modularization & Nuke Sandbox"),
        desc: t(
          "sd_roadmap_p6_summary",
          "Launched the Creator Following system and real-time Comm-Link discovery ledger, modularized App.tsx into dedicated domain views, extracted Yeet Cascade casualty tracking, and built the 100% Nuke Isolation Proving Grounds."
        ),
        milestones: [
          {
            title: t("sd_roadmap_p6_m5_title", "Creator Following & Domain Modularization"),
            desc: t("sd_roadmap_p6_m5_desc", "Added the Creator Following feed to Comm-Link, modularized App.tsx into dedicated domain views, and extracted Yeet Cascade casualty tracking."),
          },
          {
            title: t("sd_roadmap_p6_m6_title", "100% Nuke Injection Sandbox"),
            desc: t("sd_roadmap_p6_m6_desc", "Temporarily strips active {Vault} symlinks during Proving Grounds runs to inject only the isolated test subject and its mandatory dependencies."),
          },
          {
            title: t("sd_roadmap_p6_m7_title", "1v1 Conflict Stability Arena"),
            desc: t("sd_roadmap_p6_m7_desc", "Pits two suspected colliding {mods} head-to-head in an airgapped test environment while monitoring real-time engine stability."),
          },
          {
            title: t("sd_roadmap_p6_m8_title", "Automated Crash Log Harvester & Scrubber"),
            desc: t("sd_roadmap_p6_m8_desc", "Captures lastException.txt crash logs automatically and scrubs local filesystem paths and PII (scrub_user_data_from_log) before sharing."),
          },
        ],
      },
      {
        num: 5,
        status: "completed" as const,
        icon: t("icon_history", "history"),
        code: t("sd_roadmap_p5_period", "PHASE 5 • MAY 1 – MAY 3, 2026"),
        title: t("sd_roadmap_p5_title", "Defensive Protocols, Symlink Airgap 2.1 & {Mason} Protocol Manager"),
        sub: t("sd_roadmap_p5_focus", "Real-Time Airgap Watcher, DNA Duplicate Intercept & Time Capsule"),
        desc: t("sd_roadmap_p5_summary", "Implemented Symlink Airgap 2.1 real-time .cfg/.ini file watching in Rust, SHA-256 DNA duplicate interception, {Mason} Protocol Manager 1.0, intelligent Google Search fallback, and hardlink {Backups} snapshots."),
        milestones: [
          {
            title: t("sd_roadmap_p5_m5_title", "Real-Time Airgap Watcher & DNA Intercept"),
            desc: t("sd_roadmap_p5_m5_desc", "Non-blocking Rust notify thread syncing live in-game .cfg/.ini edits back to the {Vault}, plus SHA-256 duplicate interception on drop."),
          },
          {
            title: t("sd_roadmap_p5_m6_title", "Dual-State {Backups} Architecture"),
            desc: t("sd_roadmap_p5_m6_desc", "Independently snapshots World State (Saves, Tray & Settings) and Engine Core (Game Installation Binaries) before patches or {mod} tests."),
          },
          {
            title: t("sd_roadmap_p5_m7_title", "Zero-Bloat OS Hardlink Snapshot Engine"),
            desc: t("sd_roadmap_p5_m7_desc", "Pairs native NTFS/POSIX hardlink deduplication with .tar.zst Zstandard compression so unchanged files consume zero extra disk space."),
          },
          {
            title: t("sd_roadmap_p5_m8_title", "Differential Rollback Comparator"),
            desc: t("sd_roadmap_p5_m8_desc", "High-speed diff_backup engine that restores only modified bytes and purges rogue files without re-copying the entire installation."),
          },
        ],
      },
      {
        num: 4,
        status: "completed" as const,
        icon: t("icon_radar", "radar"),
        code: t("sd_roadmap_p4_period", "PHASE 4 • APRIL 28 – MAY 1, 2026"),
        title: t("sd_roadmap_p4_title", "The Global Network, Radiant Light Mode & Cloud {Blueprints}"),
        sub: t("sd_roadmap_p4_focus", "Radiant ThemeProvider, SNC-XXXXX Cloud Codes & Conflict Radar"),
        desc: t("sd_roadmap_p4_summary", "Expanded beyond dark-only Bunker to Radiant Light Mode with real-time ThemeProvider switching, launched 6-digit Cloud {Blueprint} transmissions (SNC-XXXXX), added the Architect Signature gate, and established Conflict Radar Severity 1–4."),
        milestones: [
          {
            title: t("sd_roadmap_p4_m5_title", "Radiant Mode, ThemeProvider & Signature Gate"),
            desc: t("sd_roadmap_p4_m5_desc", "Introduced Radiant (Light Mode) and real-time ThemeProvider profile switching, 6-digit Cloud {Blueprint} codes, and the Architect Signature gate."),
          },
          {
            title: t("sd_roadmap_p4_m6_title", "Severity 1–4 Collision Matrix"),
            desc: t("sd_roadmap_p4_m6_desc", "Proactive conflict classifier distinguishing minor overlaps from Severity 3 Tuning Overlaps and Severity 4 Fatal Clashes."),
          },
          {
            title: t("sd_roadmap_p4_m7_title", "Priority Tier Folders & Dynamic Resource.cfg"),
            desc: t("sd_roadmap_p4_m7_desc", "Multi-tier override directories (Sanctuary1–Sanctuary3) paired with automated Resource.cfg priority depth compilation."),
          },
          {
            title: t("sd_roadmap_p4_m8_title", "Architect Console & Crowd-Sourced Scout Queue"),
            desc: t("sd_roadmap_p4_m8_desc", "Dedicated moderation console for verifying community Scout Dossier submissions behind Copilot confirmation gates."),
          },
        ],
      },
      {
        num: 3,
        status: "completed" as const,
        icon: t("icon_hub", "hub"),
        code: t("sd_roadmap_p3_period", "PHASE 3 • APRIL 15 – APRIL 28, 2026"),
        title: t(
          "sd_roadmap_p3_title",
          "System Rip, Deep Yeet 2.0 & Logic Intelligence"
        ),
        sub: t("sd_roadmap_p3_focus", "Deep Yeet 2.0, UTF-16 Version Ripper, Twin Bonds & Copilot"),
        desc: t("sd_roadmap_p3_summary", "Engineered Deep Yeet 2.0 recursive dependency cascade scanning, the Rust UTF-16 byte-filter System Version Ripper, Twin Bond synchronized script/package links, and the Copilot Philosophy halting for manual {Citizen} signature."),
        milestones: [
          {
            title: t("sd_roadmap_p3_m5_title", "Deep Yeet 2.0 & UTF-16 Version Ripper"),
            desc: t("sd_roadmap_p3_m5_desc", "Recursive dependency cascade scanner queuing orphaned addons on master removal, paired with the Rust UTF-16 binary version ripper."),
          },
          {
            title: t("sd_roadmap_p3_m6_title", "Atomic Logic Triumvirate"),
            desc: t("sd_roadmap_p3_m6_desc", "Relational {mod} rules enforcing Highlander Flavor eviction, bidirectional .package/.ts4script Twin bonds, and Recursive Chain-Link Dependencies."),
          },
          {
            title: t("sd_roadmap_p3_m7_title", "Orphaned Addon Cascade Protection"),
            desc: t("sd_roadmap_p3_m7_desc", "Intercepts master library removal and halts for the {Citizen}'s manual signature before cleanly unequipping or removing dependent child add-ons."),
          },
          {
            title: t("sd_roadmap_p3_m8_title", "SNCXXX Cloud {Blueprints} & Ghosted States"),
            desc: t("sd_roadmap_p3_m8_desc", "6-character alphanumeric Cloud {Blueprint} share codes, portable offline JSON exports, and automatic Missing DLC Ghosting diagnostics."),
          },
        ],
      },
      {
        num: 2,
        status: "completed" as const,
        icon: t("icon_map", "map"),
        code: t("sd_roadmap_p2_period", "PHASE 2 • APRIL 10 – APRIL 15, 2026"),
        title: t(
          "sd_roadmap_p2_title",
          "Visual Uplink, Glassmorphism 1.0 & The Quarantine Zone"
        ),
        sub: t("sd_roadmap_p2_focus", "Glassmorphism 1.0, Quarantine Bio-Hazard Sector & Symlink Airgap"),
        desc: t(
          "sd_roadmap_p2_summary",
          "Introduced the Glassmorphism 1.0 backdrop-blur engine, constructed the dedicated bio-hazard Quarantine Zone for isolating malicious files, and unified the app into a layered desktop OS experience backed by Symlink Airgap and SQLite caching."
        ),
        milestones: [
          {
            title: t("sd_roadmap_p2_m5_title", "Glassmorphism 1.0 & Bio-Hazard Quarantine"),
            desc: t("sd_roadmap_p2_m5_desc", "Translucent backdrop-blur glass containers with deep elevation shadows and a dedicated Quarantine Zone for isolating and shredding threats."),
          },
          {
            title: t("sd_roadmap_p2_m6_title", "Symlink Airgap 2.5 Projection Engine"),
            desc: t("sd_roadmap_p2_m6_desc", "Projects active {mods} from the isolated {Vault} into the live game directory via zero-copy OS symlinks in milliseconds."),
          },
          {
            title: t("sd_roadmap_p2_m7_title", "Sub-Second SQLite Delta Scanner"),
            desc: t("sd_roadmap_p2_m7_desc", "Local .sanctuary_cache.db SQLite engine using mtime-first delta checks to index 5,000+ {mod} Vaults in sub-second sweeps."),
          },
          {
            title: t("sd_roadmap_p2_m8_title", "Self-Healing {Vault} Sanitizer & Profiles"),
            desc: t("sd_roadmap_p2_m8_desc", "Automatically maintains the isolated {Vault} directory structure and powers instant local {Blueprint} loadout switching."),
          },
        ],
      },
      {
        num: 1,
        status: "completed" as const,
        icon: t("icon_inventory_2", "inventory_2"),
        code: t("sd_roadmap_p1_period", "PHASE 1 • APRIL 1 – APRIL 10, 2026"),
        title: t(
          "sd_roadmap_p1_title",
          "Bunker Initialization, Cartographer Protocol & SHA-256 DNA Pathing"
        ),
        sub: t("sd_roadmap_p1_focus", "First-Boot Cartographer Recon & Millisecond Delta Caching"),
        desc: t("sd_roadmap_p1_summary", "Initialized the Tauri v2 + Rust + React 18 architecture, built The Cartographer automated first-boot reconnaissance scanner for Game Bin & {Mods} directories, and engineered SHA-256 DNA delta caching."),
        milestones: [
          {
            title: t("sd_roadmap_p1_m5_title", "Cartographer Recon & Millisecond Delta Cache"),
            desc: t("sd_roadmap_p1_m5_desc", "Automated first-boot drive reconnaissance locating Game Bin & {Mods} folders, paired with SHA-256 delta caching for instant startup."),
          },
          {
            title: t("sd_roadmap_p1_m6_title", "Tauri v2 + Rust + React 18 Kernel"),
            desc: t("sd_roadmap_p1_m6_desc", "Foundational desktop OS architecture combining a native multi-threaded Rust backend with React 18, TypeScript, and Zustand."),
          },
          {
            title: t("sd_roadmap_p1_m7_title", "Automated Coordinate Discovery Wizard"),
            desc: t("sd_roadmap_p1_m7_desc", "Guided first-launch Cartographer setup linking Game Binaries, live {Mods} folders, and airgapped Bunker {Vault} coordinates."),
          },
          {
            title: t("sd_roadmap_p1_m8_title", "Streaming SHA-256 DNA & Archive Inspector"),
            desc: t("sd_roadmap_p1_m8_desc", "Multi-threaded Rust cryptographic hashing and in-memory DBPF/ZIP header inspection without extracting archives to disk."),
          },
        ],
      },
    ],
    [t]
  );

  const buildDirectiveSubtitle = (subtitleText: string) => (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-md glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] backdrop-blur-md shrink-0">
        <span className="material-symbols-outlined !text-[12px] text-[var(--text)] drop-shadow-md">
          {t("icon_memory", "memory")}
        </span>
      </div>
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 whitespace-nowrap shrink-0">
        {t("author_sanctuary_team", "Sanctuary Foundry")}
      </span>
      <span className="text-[10px] font-black opacity-30 text-[var(--text)] shrink-0">
        &bull;
      </span>
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] truncate">
        {subtitleText}
      </span>
    </div>
  );

  // Resolve matching raw reference document synced two-way between Keepers Core (`system_directives`) and Codebase `.md` files
  const activeReferenceMarkdown = useMemo(() => {
    if (!activeModule) return "";
    let raw = "";
    if (activeModule === "guide") {
      raw = directivesMap.citizen_guide?.content || bundledCitizenGuide;
    } else if (activeModule === "roadmap") {
      raw = directivesMap.phase_roadmap?.content || bundledRoadmapDoc;
    } else if (activeModule === "forking") {
      raw = directivesMap.forking_guide?.content || bundledForkingGuide;
    } else if (activeModule === "architecture") {
      raw =
        directivesMap.master_architecture?.content || bundledArchitectureDoc;
    } else if (activeModule === "protocols") {
      raw = directivesMap.master_protocols?.content || bundledProtocolList;
    }
    return stripDirectiveBuilderComment(raw);
  }, [activeModule, directivesMap]);

  // Extract any Keepers Core Visual Builder overrides saved in `system_directives` / `.md`
  const customGuideSchema = useMemo(
    () => extractDirectiveBuilderSchema(directivesMap.citizen_guide?.content),
    [directivesMap.citizen_guide?.content]
  );
  const customRoadmapSchema = useMemo(
    () => extractDirectiveBuilderSchema(directivesMap.phase_roadmap?.content),
    [directivesMap.phase_roadmap?.content]
  );
  const customArchSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(directivesMap.master_architecture?.content),
    [directivesMap.master_architecture?.content]
  );
  const customProtoSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(directivesMap.master_protocols?.content),
    [directivesMap.master_protocols?.content]
  );

  const activePanelMeta = useMemo(() => {
    switch (activeModule) {
      case "guide":
        return {
          title: t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough"),
          subtitle: t(
            "sd_card_guide_sub",
            "Guided OS Tour • Citizen & Elevated Clearances"
          ),
          icon: t("icon_school", "school"),
        };
      case "roadmap":
        return {
          title: t("sd_card_roadmap_title", "Sanctuary OS Phase Roadmap"),
          subtitle: t("sd_card_roadmap_sub", "Evolution Timeline • Phase 12 Active"),
          icon: t("icon_timeline", "timeline"),
        };
      case "forking":
        return {
          title: t("sd_card_fork_title", "Forking & Spoke Provisioning Guide"),
          subtitle: t(
            "sd_card_fork_sub",
            "Standalone Codebase Fork & Partner Uplink"
          ),
          icon: t("icon_call_split", "call_split"),
        };
      case "architecture":
        return {
          title: t("sd_card_arch_title", "Master Architecture & Engine Systems"),
          subtitle: t("sd_card_arch_sub", "Hub-and-Spoke Federation & Rust Core"),
          icon: t("icon_architecture", "architecture"),
        };
      case "protocols":
      default:
        return {
          title: t("sd_card_proto_title", "Master Protocol & Clearance Matrix"),
          subtitle: t(
            "sd_card_proto_sub",
            "Governance, Security & Compliance Tiers"
          ),
          icon: t("icon_policy", "policy"),
        };
    }
  }, [activeModule, t]);

  // Render Interactive OS Walkthrough (3 Static Top Tiles + 2-Column Cards where Selected Card Expands Alone on Its Row)
  const renderInteractiveGuide = () => {
    const customWalkTab = customGuideSchema?.tabs.find(
      (tb) => tb.id === "walkthrough"
    );
    const customModTab = customGuideSchema?.tabs.find(
      (tb) => tb.id === "modules"
    );
    const customRoleTab = customGuideSchema?.tabs.find(
      (tb) => tb.id === "roles"
    );

    const effectiveWalkStages = customWalkTab?.cards?.length
      ? customWalkTab.cards.map((c, idx) => ({
          num: idx + 1,
          short: c.badge,
          overline: c.overline,
          icon: c.icon,
          title: c.title,
          sub: c.footerMeta,
          desc: c.desc,
          controls: (c.subCards || []).map((sc) => ({
            icon: sc.icon,
            name: sc.title,
            desc: sc.desc,
          })),
        }))
      : walkthroughStages;

    const effectiveCitizenSteps = customModTab?.cards?.length
      ? customModTab.cards.map((c) => ({
          short: c.badge,
          overline: c.overline,
          title: c.title,
          badge: c.footerMeta,
          icon: c.icon,
          desc: c.desc,
          tip: c.tip || "",
          cards: (c.subCards || []).map((sc) => ({
            icon: sc.icon,
            title: sc.title,
            desc: sc.desc,
          })),
        }))
      : citizenSteps;

    const effectiveRoles = customRoleTab?.cards?.length
      ? customRoleTab.cards.map((c) => ({
          short: c.title,
          icon: c.icon,
          title: c.title,
          badge: c.overline || c.footerMeta,
          desc: c.desc,
          requiresPasskey: c.status !== "citizen",
          subCards: c.subCards || [],
        }))
      : elevatedRoles;

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Static Top Tiles (Uniform font size, zero scrolling, zero truncation) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_play_circle", "play_circle")}
            label={t("dir_guide_mode_walk_lbl", "7 STAGES")}
            number={t("dir_guide_mode_walk_val", "OS Walkthrough")}
            colorClass="text-[var(--accent)]"
            isActive={guideMode === "walkthrough"}
            onClick={() => setGuideMode("walkthrough")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_explore", "explore")}
            label={t("dir_guide_mode_mod_lbl", "9 MODULES")}
            number={t("dir_guide_mode_mod_val", "Citizen Tools")}
            colorClass="text-[var(--accent)]"
            isActive={guideMode === "modules"}
            onClick={() => setGuideMode("modules")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_admin_panel_settings", "admin_panel_settings")}
            label={t("dir_pr_t1_lbl", "6 TIERS")}
            number={t("dir_wt_t8_val", "Role Tiers")}
            colorClass="text-[var(--accent)]"
            isActive={guideMode === "roles"}
            onClick={() => setGuideMode("roles")}
          />
        </div>

        {/* Mode 1: 7-Stage Interactive UI Walkthrough (Single-Column Stacked Cards: Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        {guideMode === "walkthrough" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveWalkStages.map((stg, idx) => {
              const isActive = walkIdx === idx;
              const stageOverline =
                (stg as any).overline ||
                t("dir_walk_step_counter", "STAGE {0} OF {1}")
                  .replace("{0}", String(idx + 1))
                  .replace("{1}", String(effectiveWalkStages.length));

              return (
                <div
                  key={`${stg.num}-${idx}`}
                  ref={isActive ? guideDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setWalkIdx(idx);
                          scrollDrawerIntoCenter(guideDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setWalkIdx(idx);
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  {!isActive ? (
                    /* Compact Unselected Row */
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined !text-[20px]">
                            {stg.icon}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80">
                            {stageOverline}
                          </span>
                          <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug truncate m-0">
                            {stg.title}
                          </h3>
                          <span className="text-[11px] font-normal text-[var(--subtext)] opacity-75 truncate">
                            {stg.sub}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                          {stg.short}
                        </span>
                        <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_expand_more", "expand_more")}
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Expanded Active Card (100% Opaque) */
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setWalkIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setWalkIdx(-1);
                          }
                        }}
                        className="flex flex-col gap-3 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[22px]">
                                {stg.icon}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                                {stageOverline}
                              </span>
                              <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight leading-snug m-0">
                                {stg.title}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                              <span className="material-symbols-outlined !text-[12px]">
                                {t("icon_check_circle", "check_circle")}
                              </span>
                              {stg.short}
                            </span>
                            <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_expand_less", "expand_less")}
                              </span>
                            </span>
                          </div>
                        </div>

                        <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                          {stg.desc}
                        </p>
                      </div>

                      <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                          {stg.controls.map((ctrl, cIdx) => (
                            <div
                              key={`${ctrl.name}-${cIdx}`}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                  {ctrl.icon}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                                  {ctrl.name}
                                </h4>
                              </div>
                              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                                {ctrl.desc}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <ActionButton
                            variant="glass"
                            icon={t("icon_navigate_before", "navigate_before")}
                            disabled={walkIdx <= 0}
                            onClick={() => {
                              setWalkIdx((prev) => Math.max(0, prev - 1));
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("dir_walk_prev", "Previous Stage")}
                          </ActionButton>
                          <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                            {stg.sub}
                          </span>
                          <ActionButton
                            variant="accent"
                            icon={t("icon_navigate_next", "navigate_next")}
                            disabled={
                              walkIdx >= effectiveWalkStages.length - 1
                            }
                            onClick={() => {
                              setWalkIdx((prev) =>
                                Math.min(
                                  effectiveWalkStages.length - 1,
                                  prev + 1
                                )
                              );
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("dir_walk_next", "Next Stage")}
                          </ActionButton>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Mode 2: 9 Citizen Modules Deep-Dive (Single-Column Stacked Cards: Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        {guideMode === "modules" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveCitizenSteps.map((step, idx) => {
              const isActive = guideStepIdx === idx;
              const modOverline =
                (step as any).overline ||
                t("sd_guide_step_progress", "Module {0} of {1}")
                  .replace("{0}", String(idx + 1))
                  .replace("{1}", String(effectiveCitizenSteps.length));

              return (
                <div
                  key={`${step.short}-${idx}`}
                  ref={isActive ? guideDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setGuideStepIdx(idx);
                          scrollDrawerIntoCenter(guideDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setGuideStepIdx(idx);
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  {!isActive ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined !text-[20px]">
                            {step.icon}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80">
                            {modOverline}
                          </span>
                          <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug truncate m-0">
                            {step.title}
                          </h3>
                          <span className="text-[11px] font-normal text-[var(--subtext)] opacity-75 truncate">
                            {step.badge}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                          {step.short}
                        </span>
                        <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_expand_more", "expand_more")}
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setGuideStepIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setGuideStepIdx(-1);
                          }
                        }}
                        className="flex flex-col gap-3 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[22px]">
                                {step.icon}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                                {modOverline}
                              </span>
                              <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight leading-snug m-0">
                                {step.title}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                              <span className="material-symbols-outlined !text-[12px]">
                                {t("icon_check_circle", "check_circle")}
                              </span>
                              {step.short}
                            </span>
                            <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_expand_less", "expand_less")}
                              </span>
                            </span>
                          </div>
                        </div>

                        <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                          {step.desc}
                        </p>
                      </div>

                      <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {step.cards.map((card, cIdx) => (
                            <div
                              key={`${card.title}-${cIdx}`}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`material-symbols-outlined !text-[16px] shrink-0 ${
                                    (card as any).colorClass ||
                                    "text-[var(--accent)]"
                                  }`}
                                >
                                  {card.icon}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                                  {card.title}
                                </h4>
                              </div>
                              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                                {card.desc}
                              </p>
                            </div>
                          ))}
                        </div>

                        {step.tip && (
                          <div className="glass-surface rounded-2xl p-4 flex items-start gap-2.5 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                              {t("icon_lightbulb", "lightbulb")}
                            </span>
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-sm font-bold text-[var(--text)] leading-snug">
                                {t("sd_guide_pro_tip_label", "{Citizen} Pro Tip")}
                              </span>
                              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                                {step.tip}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <ActionButton
                            variant="glass"
                            icon={t("icon_navigate_before", "navigate_before")}
                            disabled={guideStepIdx <= 0}
                            onClick={() => {
                              setGuideStepIdx((prev) => Math.max(0, prev - 1));
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("sd_btn_prev_step", "Previous Module")}
                          </ActionButton>
                          <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                            {step.badge}
                          </span>
                          <ActionButton
                            variant="accent"
                            icon={t("icon_navigate_next", "navigate_next")}
                            disabled={
                              guideStepIdx >= effectiveCitizenSteps.length - 1
                            }
                            onClick={() => {
                              setGuideStepIdx((prev) =>
                                Math.min(
                                  effectiveCitizenSteps.length - 1,
                                  prev + 1
                                )
                              );
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("sd_btn_next_step", "Next Module")}
                          </ActionButton>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Mode 3: 6-Tier Role Hierarchy (Single-Column Stacked Cards: Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        {guideMode === "roles" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveRoles.map((role, rIdx) => {
              const isActive = roleTierIdx === rIdx;

              return (
                <div
                  key={`${role.short}-${rIdx}`}
                  ref={isActive ? guideDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setRoleTierIdx(rIdx);
                          scrollDrawerIntoCenter(guideDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setRoleTierIdx(rIdx);
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  {!isActive ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined !text-[20px]">
                            {role.icon}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80">
                            {role.badge}
                          </span>
                          <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug truncate m-0">
                            {role.title}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                            role.requiresPasskey
                              ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                              : "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[12px]">
                            {role.requiresPasskey
                              ? t("icon_passkey", "passkey")
                              : t("icon_check_circle", "check_circle")}
                          </span>
                          {role.requiresPasskey
                            ? t("auth_passkey_badge_fido", "FIDO2 PASSKEY")
                            : t("role_citizen", "{Citizen}")}
                        </span>
                        <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_expand_more", "expand_more")}
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setRoleTierIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setRoleTierIdx(-1);
                          }
                        }}
                        className="flex flex-col gap-3 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[22px]">
                                {role.icon}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                                {role.badge}
                              </span>
                              <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight leading-snug m-0">
                                {role.title}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                                role.requiresPasskey
                                  ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                                  : "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[12px]">
                                {role.requiresPasskey
                                  ? t("icon_passkey", "passkey")
                                  : t("icon_check_circle", "check_circle")}
                              </span>
                              {role.requiresPasskey
                                ? t("auth_passkey_badge_fido", "FIDO2 PASSKEY")
                                : t("role_citizen", "{Citizen}")}
                            </span>
                            <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_expand_less", "expand_less")}
                              </span>
                            </span>
                          </div>
                        </div>

                        <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                          {role.desc}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <ActionButton
                          variant="glass"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={roleTierIdx <= 0}
                          onClick={() => {
                            setRoleTierIdx((prev) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_tier", "Previous Tier")}
                        </ActionButton>
                        <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                          {role.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={roleTierIdx >= effectiveRoles.length - 1}
                          onClick={() => {
                            setRoleTierIdx((prev) =>
                              Math.min(effectiveRoles.length - 1, prev + 1)
                            );
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }}
                        >
                          {t("sd_proto_next_tier", "Next Tier")}
                        </ActionButton>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Render Interactive Phase Roadmap Timeline (3 Filter Tabs + 2-Column Card Grid where Selected Phase Expands Alone on Its Row)
  const renderInteractiveRoadmap = () => {
    const customPhasesTab = customRoadmapSchema?.tabs?.find(
      (tab) => tab.id === "all"
    );
    const effectivePhases =
      customPhasesTab && customPhasesTab.cards.length > 0
        ? customPhasesTab.cards.map((c, idx) => ({
            num:
              parseInt((c.overline || "").replace(/\D+/g, ""), 10) ||
              Math.max(1, 12 - idx),
            code: c.overline || `PHASE ${Math.max(1, 12 - idx)}`,
            title: c.title,
            sub: c.footerMeta || "",
            status: (c.status || (idx === 0 ? "active" : "completed")) as
              | "active"
              | "completed",
            icon: c.icon || t("icon_rocket_launch", "rocket_launch"),
            desc: c.desc,
            milestones: (c.subCards || []).map((sc) => ({
              title: sc.title,
              desc: sc.desc,
              pending: Boolean(sc.pending),
            })),
          }))
        : roadmapPhases;

    const filteredPhases = effectivePhases.filter((p) => {
      if (roadmapFilter === "active") return p.status === "active";
      if (roadmapFilter === "completed") return p.status === "completed";
      return true;
    });

    const activePhaseIdx = filteredPhases.findIndex(
      (p) => p.num === selectedPhaseNum
    );

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Interactive Filter Tabs (Uniform font size, zero scrolling, zero truncation) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_timeline", "timeline")}
            label={t("dir_roadmap_tile_all", "12 Phases")}
            number={t("sd_roadmap_filter_all_val", "Full Timeline")}
            colorClass="text-[var(--accent)]"
            isActive={roadmapFilter === "all"}
            onClick={() => {
              setRoadmapFilter("all");
              setSelectedPhaseNum(12);
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_rocket_launch", "rocket_launch")}
            label={t("dir_phase_tab_active_lbl", "Current Era")}
            number={t("dir_phase_tab_active_val", "Phase 12 Active")}
            colorClass="text-[var(--accent)]"
            isActive={roadmapFilter === "active"}
            onClick={() => {
              setRoadmapFilter("active");
              setSelectedPhaseNum(12);
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_check_circle", "check_circle")}
            label={t("dir_roadmap_tile_done", "Completed")}
            number={t("dir_phase_tab_done_val", "Phases 11 → 1")}
            colorClass="text-[var(--success)]"
            isActive={roadmapFilter === "completed"}
            onClick={() => {
              setRoadmapFilter("completed");
              setSelectedPhaseNum(11);
            }}
          />
        </div>

        {/* Single-Column Stacked Phase Cards (Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        <div className="flex flex-col gap-3.5 w-full">
          {filteredPhases.map((phase) => {
            const isActivePhase = phase.status === "active";
            const isExpanded = selectedPhaseNum === phase.num;

            return (
              <div
                key={phase.code}
                ref={isExpanded ? roadmapDrawerRef : undefined}
                role={!isExpanded ? "button" : undefined}
                tabIndex={!isExpanded ? 0 : undefined}
                onClick={
                  !isExpanded
                    ? () => {
                        setSelectedPhaseNum(phase.num);
                        scrollDrawerIntoCenter(roadmapDrawerRef);
                      }
                    : undefined
                }
                onKeyDown={
                  !isExpanded
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedPhaseNum(phase.num);
                          scrollDrawerIntoCenter(roadmapDrawerRef);
                        }
                      }
                    : undefined
                }
                className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                  isExpanded
                    ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                    : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                }`}
              >
                {!isExpanded ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                        <span className="material-symbols-outlined !text-[20px]">
                          {phase.icon}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80">
                          {phase.code}
                        </span>
                        <h3 className="text-sm sm:text-base font-black tracking-tight text-[var(--text)] leading-snug truncate m-0">
                          {phase.title}
                        </h3>
                        <span className="text-[11px] font-normal text-[var(--subtext)] opacity-75 truncate">
                          {phase.sub}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                          isActivePhase
                            ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {isActivePhase
                            ? t("icon_rocket_launch", "rocket_launch")
                            : t("icon_check_circle", "check_circle")}
                        </span>
                        {isActivePhase
                          ? t("sd_roadmap_status_active", "ACTIVE PHASE")
                          : t("status_completed", "COMPLETED")}
                      </span>
                      <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPhaseNum(0)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedPhaseNum(0);
                        }
                      }}
                      className="flex flex-col gap-3 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                              isActivePhase
                                ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"
                                : "border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[22px]">
                              {phase.icon}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span
                              className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                                isActivePhase
                                  ? "text-[var(--accent)]"
                                  : "text-[var(--success)]"
                              }`}
                            >
                              {phase.code}
                            </span>
                            <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--text)] leading-snug m-0">
                              {phase.title}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                              isActivePhase
                                ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                                : "border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[12px]">
                              {isActivePhase
                                ? t("icon_rocket_launch", "rocket_launch")
                                : t("icon_check_circle", "check_circle")}
                            </span>
                            {isActivePhase
                              ? t("sd_roadmap_status_active", "ACTIVE PHASE")
                              : t("status_completed", "COMPLETED")}
                          </span>
                          <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_expand_less", "expand_less")}
                            </span>
                          </span>
                        </div>
                      </div>

                      <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                        {phase.desc}
                      </p>
                    </div>

                    <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {phase.milestones.map((m, mIdx) => {
                          const isPendingItem = Boolean(
                            (m as { pending?: boolean }).pending
                          );
                          return (
                            <div
                              key={mIdx}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`material-symbols-outlined !text-[16px] shrink-0 ${
                                    isPendingItem
                                      ? "text-[var(--accent)]"
                                      : "text-[var(--success)]"
                                  }`}
                                >
                                  {isPendingItem
                                    ? t("icon_rocket_launch", "rocket_launch")
                                    : t("icon_check_circle", "check_circle")}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                                  {m.title.replace(/^(✅|⏳)\s*/, "")}
                                </h4>
                              </div>
                              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                                {m.desc}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {filteredPhases.length > 1 && (
                        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <ActionButton
                            variant="glass"
                            icon={t("icon_navigate_before", "navigate_before")}
                            disabled={activePhaseIdx <= 0}
                            onClick={() => {
                              const prevPhase =
                                filteredPhases[Math.max(0, activePhaseIdx - 1)];
                              if (prevPhase) {
                                setSelectedPhaseNum(prevPhase.num);
                                scrollDrawerIntoCenter(roadmapDrawerRef);
                              }
                            }}
                          >
                            {t("sd_roadmap_prev_phase", "Previous Phase")}
                          </ActionButton>
                          <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                            {phase.sub}
                          </span>
                          <ActionButton
                            variant="accent"
                            icon={t("icon_navigate_next", "navigate_next")}
                            disabled={
                              activePhaseIdx >= filteredPhases.length - 1
                            }
                            onClick={() => {
                              const nextPhase =
                                filteredPhases[
                                  Math.min(
                                    filteredPhases.length - 1,
                                    activePhaseIdx + 1
                                  )
                                ];
                              if (nextPhase) {
                                setSelectedPhaseNum(nextPhase.num);
                                scrollDrawerIntoCenter(roadmapDrawerRef);
                              }
                            }}
                          >
                            {t("sd_roadmap_next_phase", "Next Phase")}
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render Interactive Forking & Spoke Provisioning Guide (3 Static Top Tiles + 2-Column Cards & Full-Width Terminals)
  const renderInteractiveForking = () => {
    const spokeSqlLineCount = SPOKE_SCHEMA_SQL.split(/\r?\n/).length;
    const hubSqlLineCount = HUB_SCHEMA_SQL.split(/\r?\n/).length;
    const isSpokeSqlActive = sqlSchemaTab === "spoke";
    const activeSqlCode = isSpokeSqlActive ? SPOKE_SCHEMA_SQL : HUB_SCHEMA_SQL;
    const activeSqlCopyId = isSpokeSqlActive ? "sql_spoke" : "sql_hub";

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Static Top Tiles (Uniform font size, zero scrolling, zero truncation) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_hub", "hub")}
            label={t("dir_fk_t1_lbl", "STEP 1")}
            number={t("dir_fk_t1_val", "Spoke Setup")}
            colorClass="text-[var(--accent)]"
            isActive={forkTab === "spoke"}
            onClick={() => setForkTab("spoke")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_call_split", "call_split")}
            label={t("dir_fk_t2_lbl", "FORK MODES")}
            number={t("dir_fk_t2_val", "Standalone & Hub")}
            colorClass="text-[var(--accent)]"
            isActive={forkTab === "standalone"}
            onClick={() => setForkTab("standalone")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_database", "database")}
            label={t("dir_fk_t3_lbl", "STEP 3")}
            number={t("dir_fk_t3_val", "SQL Schemas")}
            colorClass="text-[var(--accent)]"
            isActive={forkTab === "sql"}
            onClick={() => setForkTab("sql")}
          />
        </div>

        {/* Tab 1: Official Partner Spoke Setup & Cut the Cord */}
        {forkTab === "spoke" && (
          <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--accent)_45%,transparent)]">
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[22px]">
                  {t("icon_hub", "hub")}
                </span>
              </div>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_verified", "verified")}
                </span>
                {t("active", "Active")}
              </span>
            </div>

            <div className="flex flex-col gap-1 mt-0.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {t(
                  "sd_fork_spoke_hero_badge",
                  "OFFICIAL PARTNER NETWORK • ZERO CODE EDITS"
                )}
              </span>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--text)] leading-snug m-0">
                {t(
                  "sd_fork_spoke_hero_title",
                  "Connect a Sovereign Community Spoke in 3 Steps"
                )}
              </h3>
              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                {t(
                  "sd_fork_spoke_hero_desc",
                  "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {t("icon_database", "database")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_spoke_step1_title",
                      "Step 1: Initialize Your Supabase Spoke (schema.sql)"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_spoke_step1_desc",
                    "Create a free Supabase project, open the SQL Editor, and run schema.sql. This single script provisions all 36 community tables, RLS policies, immutable audit triggers, and role functions."
                  )}
                </p>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {t("icon_key", "key")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_spoke_step2_title",
                      "Step 2: Generate Your SANCTUARY-UPLINK:// Bundle"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_spoke_step2_desc",
                    "In Keepers Core -> Active Workspaces (or Wayfinder Hub), paste your Supabase URL, Anon Key, and Service Role Key to generate an encrypted SANCTUARY-UPLINK:// handshake bundle."
                  )}
                </p>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {t("icon_rocket_launch", "rocket_launch")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_spoke_step3_title",
                      "Step 3: Verify Handshake & Provision Founding Wayfinder"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_spoke_step3_desc",
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--warning)] shrink-0">
                    {t("icon_link_off", "link_off")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_cord_community_title",
                      "Community-Initiated Severance (Wayfinder Hub)"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_cord_community_desc",
                    "A Wayfinder can double-click 'Cut the Cord' in Wayfinder Hub -> Spoke Uplink & Sovereignty at any time. This writes an immutable audit log, sets is_active = false on the Hub, and permanently scrubs (NULLs) the Spoke's supabase_service_key from the Hub while leaving 100% of the community's database intact."
                  )}
                </p>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--success)_35%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--success)] shrink-0">
                    {t("icon_verified", "verified")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_cord_keeper_title",
                      "Zero Platform Tax & 100% Data Ownership"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t("sd_fork_cord_keeper_desc", "Sanctuary OS takes 0% of {mason} Patreon/Ko-fi revenue and 0% of community donations. Export your SANCTUARY-UPLINK:// bundle before severing to paste directly into a standalone fork.")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Forking Modes (Single-Column Stacked Cards: Unselected Compact & Dimmed, Selected Expands In-Place) */}
        {forkTab === "standalone" && (
          <div className="flex flex-col gap-3.5 w-full">
            {/* Mode Card 1: 1-File Standalone Fork */}
            <div
              role={forkModeIdx !== 0 ? "button" : undefined}
              tabIndex={forkModeIdx !== 0 ? 0 : undefined}
              onClick={
                forkModeIdx !== 0 ? () => setForkModeIdx(0) : undefined
              }
              onKeyDown={
                forkModeIdx !== 0
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setForkModeIdx(0);
                      }
                    }
                  : undefined
              }
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                forkModeIdx === 0
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                  : "px-4 py-3.5 gap-2 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                      forkModeIdx === 0
                        ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_call_split", "call_split")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                        forkModeIdx === 0
                          ? "text-[var(--accent)]"
                          : "text-[var(--subtext)]"
                      }`}
                    >
                      {t(
                        "sd_fork_mode_standalone_badge",
                        "MODE 1 • 1-DATABASE STANDALONE"
                      )}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                      {t(
                        "sd_fork_mode_standalone_title",
                        "1-File Standalone Fork (Single Database)"
                      )}
                    </h3>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 ${
                    forkModeIdx === 0
                      ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                      : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[12px]">
                    {forkModeIdx === 0
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_storage", "storage")}
                  </span>
                  {forkModeIdx === 0
                    ? t("active", "Active")
                    : t("dir_fk_t2_val", "1-File Fork")}
                </span>
              </div>

              {forkModeIdx === 0 && (
                <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                    {t(
                      "sd_fork_mode_standalone_desc",
                      "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions."
                    )}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                        {t(
                          "sd_fork_standalone_s1_title",
                          "1. Unified Auth & Direct RPC Engine"
                        )}
                      </h4>
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                        {t(
                          "sd_fork_standalone_s1_desc",
                          "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
                        )}
                      </p>
                    </div>
                    <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                        {t(
                          "sd_fork_standalone_s2_title",
                          "2. Automatic Founding Wayfinder Promotion"
                        )}
                      </h4>
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                        {t(
                          "sd_fork_standalone_s2_desc",
                          "The on_auth_user_created_spoke trigger in schema.sql detects when your standalone database has 0 Wayfinders and automatically promotes the very first registered user to Founding Wayfinder."
                        )}
                      </p>
                    </div>
                    <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                        {t(
                          "sd_fork_standalone_s3_title",
                          "3. Transparent OS-to-Spoke Table Mapping"
                        )}
                      </h4>
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                        {t(
                          "sd_fork_standalone_s3_desc",
                          "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <span className="text-xs font-bold text-[var(--accent)]">
                        {t(
                          "sd_fork_standalone_opt_b",
                          "Option B: Manual Standalone Config"
                        )}{" "}
                        • sanctuary-os/src/supabase.ts
                      </span>
                      <ActionButton
                        variant="accent"
                        icon={
                          copiedId === "supabase_cfg_manual"
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_content_copy", "content_copy")
                        }
                        onClick={() =>
                          handleCopyCode(
                            "supabase_cfg_manual",
                            STANDALONE_MANUAL_SNIPPET
                          )
                        }
                      >
                        {copiedId === "supabase_cfg_manual"
                          ? t("alert_copied", "Copied to Clipboard!")
                          : t("sd_btn_copy_snippet", "Copy Code Snippet")}
                      </ActionButton>
                    </div>
                    <pre className="text-xs font-mono text-[var(--text)] opacity-90 overflow-x-auto custom-scrollbar leading-relaxed p-2 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)]">
                      <code>{STANDALONE_MANUAL_SNIPPET}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Mode Card 2: Full Hub & Spoke Multi-Game Federation Fork */}
            <div
              role={forkModeIdx !== 1 ? "button" : undefined}
              tabIndex={forkModeIdx !== 1 ? 0 : undefined}
              onClick={
                forkModeIdx !== 1 ? () => setForkModeIdx(1) : undefined
              }
              onKeyDown={
                forkModeIdx !== 1
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setForkModeIdx(1);
                      }
                    }
                  : undefined
              }
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                forkModeIdx === 1
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                  : "px-4 py-3.5 gap-2 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                      forkModeIdx === 1
                        ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_hub", "hub")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                        forkModeIdx === 1
                          ? "text-[var(--accent)]"
                          : "text-[var(--subtext)]"
                      }`}
                    >
                      {t(
                        "sd_fork_mode_hub_badge",
                        "MODE 2 • FULL HUB & SPOKE FEDERATION"
                      )}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                      {t(
                        "sd_fork_mode_hub_title",
                        "Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)"
                      )}
                    </h3>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 ${
                    forkModeIdx === 1
                      ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                      : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[12px]">
                    {forkModeIdx === 1
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_hub", "hub")}
                  </span>
                  {forkModeIdx === 1
                    ? t("active", "Active")
                    : t("dir_ar_t2_val", "Hub & Spokes")}
                </span>
              </div>

              {forkModeIdx === 1 && (
                <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                    {t(
                      "sd_fork_mode_hub_desc",
                      "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql)."
                    )}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                          {t("icon_memory", "memory")}
                        </span>
                        <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                          {t(
                            "sd_fork_hub_s1_title",
                            "1. Provision Core Hub Database (schema_os.sql)"
                          )}
                        </h4>
                      </div>
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                        {t(
                          "sd_fork_hub_s1_desc",
                          "Create your central Hub Supabase project and run schema_os.sql in the SQL Editor. This provisions global SSO profiles, FIDO2 user_passkeys, sanctuary_games, sanctuary_schemas, system_directives, and keeper_heuristic_signatures."
                        )}
                      </p>
                    </div>

                    <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                          {t("icon_cloud_done", "cloud_done")}
                        </span>
                        <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                          {t(
                            "sd_fork_hub_s2_title",
                            "2. Deploy game-gateway Edge Function"
                          )}
                        </h4>
                      </div>
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                        {t(
                          "sd_fork_hub_s2_desc",
                          "Deploy supabase/functions/game-gateway to your Hub project (supabase functions deploy game-gateway). It validates Hub JWTs, checks roles, and executes cross-database mutations against each Spoke."
                        )}
                      </p>
                    </div>

                    <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                          {t("icon_code", "code")}
                        </span>
                        <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                          {t(
                            "sd_fork_hub_s3_title",
                            "3. Point src/supabase.ts at Your Core Hub"
                          )}
                        </h4>
                      </div>
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                        {t(
                          "sd_fork_hub_s3_desc",
                          "Keep mode set to 'hub_and_spoke' in src/supabase.ts (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env) pointing to your central Hub project's URL and Anon Key."
                        )}
                      </p>
                    </div>

                    <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                          {t("icon_storage", "storage")}
                        </span>
                        <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                          {t(
                            "sd_fork_hub_s4_title",
                            "4. Provision & Link Child Spoke Databases (schema.sql)"
                          )}
                        </h4>
                      </div>
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                        {t(
                          "sd_fork_hub_s4_desc",
                          "For each game community, create a separate Supabase project, run schema.sql, and register its URL, Anon Key, and Service Role Key (or SANCTUARY-UPLINK:// bundle) in Keepers Core -> Active Workspaces."
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <span className="text-xs font-bold text-[var(--accent)]">
                        {t(
                          "sd_fork_hub_snippet_label",
                          "Hub & Spoke Federation Config • sanctuary-os/src/supabase.ts"
                        )}
                      </span>
                      <ActionButton
                        variant="accent"
                        icon={
                          copiedId === "supabase_cfg_hub"
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_content_copy", "content_copy")
                        }
                        onClick={() =>
                          handleCopyCode(
                            "supabase_cfg_hub",
                            HUB_AND_SPOKE_FORK_SNIPPET
                          )
                        }
                      >
                        {copiedId === "supabase_cfg_hub"
                          ? t("alert_copied", "Copied to Clipboard!")
                          : t("sd_btn_copy_snippet", "Copy Code Snippet")}
                      </ActionButton>
                    </div>
                    <pre className="text-xs font-mono text-[var(--text)] opacity-90 overflow-x-auto custom-scrollbar leading-relaxed p-2 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)]">
                      <code>{HUB_AND_SPOKE_FORK_SNIPPET}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: SQL Schema Cards (Single-Column Stacked Cards: Unselected Compact & Dimmed, Selected Expands In-Place) */}
        {forkTab === "sql" && (
          <div className="flex flex-col gap-3.5 w-full">
            {/* SQL Card 1: schema.sql (Spoke & Standalone DB) */}
            <div
              role={!isSpokeSqlActive ? "button" : undefined}
              tabIndex={!isSpokeSqlActive ? 0 : undefined}
              onClick={
                !isSpokeSqlActive ? () => setSqlSchemaTab("spoke") : undefined
              }
              onKeyDown={
                !isSpokeSqlActive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSqlSchemaTab("spoke");
                      }
                    }
                  : undefined
              }
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                isSpokeSqlActive
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                  : "px-4 py-3.5 gap-2 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                      isSpokeSqlActive
                        ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]"
                        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_storage", "storage")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                        isSpokeSqlActive
                          ? "text-[var(--success)]"
                          : "text-[var(--subtext)]"
                      }`}
                    >
                      {t(
                        "dir_fork_sql_spoke_sub",
                        "SPOKE & STANDALONE DB • 36 TABLES"
                      )}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                      {t("dir_fork_sql_spoke_val", "schema.sql (36 Tables)")}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isSpokeSqlActive && (
                    <ActionButton
                      variant="accent"
                      icon={
                        copiedId === activeSqlCopyId
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_content_copy", "content_copy")
                      }
                      onClick={() =>
                        handleCopyCode(activeSqlCopyId, activeSqlCode)
                      }
                    >
                      {copiedId === activeSqlCopyId
                        ? t("dir_fork_sql_copied", "SQL Copied")
                        : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                    </ActionButton>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                      isSpokeSqlActive
                        ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {isSpokeSqlActive
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_database", "database")}
                    </span>
                    {spokeSqlLineCount} {t("dir_fork_sql_lines", "Lines")}
                  </span>
                </div>
              </div>

              {isSpokeSqlActive && (
                <div className="flex flex-col gap-3.5 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                    {t(
                      "dir_fork_sql_spoke_desc",
                      "Complete community registry schema (mods, blueprints, masons, conflicts, tickets, heuristics, RLS policies, and Founding Wayfinder trigger)."
                    )}
                  </p>
                  <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[380px] overflow-y-auto custom-scrollbar leading-relaxed p-3 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                    <code>{SPOKE_SCHEMA_SQL}</code>
                  </pre>
                </div>
              )}
            </div>

            {/* SQL Card 2: schema_os.sql (Core Hub DB) */}
            <div
              role={isSpokeSqlActive ? "button" : undefined}
              tabIndex={isSpokeSqlActive ? 0 : undefined}
              onClick={
                isSpokeSqlActive ? () => setSqlSchemaTab("hub") : undefined
              }
              onKeyDown={
                isSpokeSqlActive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSqlSchemaTab("hub");
                      }
                    }
                  : undefined
              }
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                !isSpokeSqlActive
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                  : "px-4 py-3.5 gap-2 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                      !isSpokeSqlActive
                        ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_memory", "memory")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                        !isSpokeSqlActive
                          ? "text-[var(--accent)]"
                          : "text-[var(--subtext)]"
                      }`}
                    >
                      {t(
                        "dir_fork_sql_hub_sub",
                        "CENTRAL CORE HUB DB • 16 TABLES"
                      )}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                      {t("dir_fork_sql_hub_val", "schema_os.sql (Hub DB)")}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isSpokeSqlActive && (
                    <ActionButton
                      variant="accent"
                      icon={
                        copiedId === activeSqlCopyId
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_content_copy", "content_copy")
                      }
                      onClick={() =>
                        handleCopyCode(activeSqlCopyId, activeSqlCode)
                      }
                    >
                      {copiedId === activeSqlCopyId
                        ? t("dir_fork_sql_copied", "SQL Copied")
                        : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                    </ActionButton>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                      !isSpokeSqlActive
                        ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {!isSpokeSqlActive
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_database", "database")}
                    </span>
                    {hubSqlLineCount} {t("dir_fork_sql_lines", "Lines")}
                  </span>
                </div>
              </div>

              {!isSpokeSqlActive && (
                <div className="flex flex-col gap-3.5 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                    {t(
                      "dir_fork_sql_hub_desc",
                      "Central multi-game federation schema (global SSO profiles, FIDO2 passkeys, sanctuary_games directory, master schemas, global lexicons/themes, and core heuristics)."
                    )}
                  </p>
                  <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[380px] overflow-y-auto custom-scrollbar leading-relaxed p-3 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                    <code>{HUB_SCHEMA_SQL}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Expanded Interactive Master Architecture Explorer (3 Top Tiles + Clean 3-Tier Pillar Card)
  const renderInteractiveArchitecture = () => {
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
            title: t("dir_walk_s1_title", "Global Shell: Sidebar, Top Pill & Dock"),
            desc: t(
              "dir_arch_p1_b3",
              "Single Morphing Status Pill & context-aware Sidebar that switches cleanly between Foundry Landing Page quick links and Game Workspace tools"
            ),
          },
          {
            icon: t("icon_translate", "translate"),
            title: t("sd_roadmap_p6_title", "Chameleon & Lexicon Protocols"),
            desc: t(
              "dir_arch_p1_b4",
              "Quota-protected Zustand state engine + strict 4-dictionary Lexicon Protocol (en-default, en-sanctuary, en-sims, Simlish)"
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
              "Community Game Spokes (schema.sql — 36 tables) are 100% owned by each game's Wayfinder with zero email/credential bleed and unilateral Cut the Cord severance"
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
              "Decentralized Static Edge Polling (manifest.json)"
            ),
            desc: t(
              "dir_arch_p2_b4",
              "Decentralized Static Edge Polling (manifest.json & override.json) delivers creator updates and atomic_logic via direct HTTP GET without central DB lock-in"
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
              "Topological Load Order Compiler (compileLoadOrder)"
            ),
            desc: t(
              "dir_arch_p3_b2",
              "Schema-Driven Load Order Compiler (folder_priority + dynamic Resource.cfg, manifest_list, numeric_prefix, timestamp) with topological cycle breaking"
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
            desc: t("dir_arch_p3_b4", "Homestead 100% Nuke & 1v1 Stability Lab + {Backups} incremental NTFS/POSIX hardlink snapshots (.tar.zst) with differential rollback"),
          },
          {
            icon: t("icon_passkey", "passkey"),
            title: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP {Vault}"),
            desc: t("dir_arch_p4_b2", "FIDO2 Passkey & TOTP Security {Vault} SidePanel locks Elevated Hubs until verified via Windows Hello, Touch ID, YubiKey, or Authenticator"),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t(
              "dir_walk_s7_c3_name",
              "Quarantine SidePanel OS Lockdown"
            ),
            desc: t("dir_arch_p4_b4", "Full-OS Quarantine SidePanel Lockdown queues multi-file drops without freezing, shows Triggered By & Detection Source diagnostics, and enforces {Citizen}-signed Secure Shred"),
          },
        ],
      },
    };

    const defaultPillar = pillarMeta[archTab] || pillarMeta.p1;
    const customArchTab = customArchSchema?.tabs?.find(
      (tab) => tab.id === archTab
    );
    const customArchCard = customArchTab?.cards?.[0];
    const activePillar = customArchCard
      ? {
          icon: customArchCard.icon || defaultPillar.icon,
          badge: customArchCard.overline || defaultPillar.badge,
          heading: customArchCard.title || defaultPillar.heading,
          summary: customArchCard.desc || defaultPillar.summary,
          cards: (customArchCard.subCards || []).map((sc) => ({
            icon: sc.icon || defaultPillar.icon,
            title: sc.title,
            desc: sc.desc,
          })),
        }
      : defaultPillar;

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Static Top Tiles (Uniform font size, zero scrolling, zero truncation) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_memory", "memory")}
            label={t("dir_ar_t1_lbl", "PILLAR 1")}
            number={t("dir_ar_t1_val", "Core & Glass")}
            colorClass="text-[var(--accent)]"
            isActive={archTab === "p1"}
            onClick={() => setArchTab("p1")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_hub", "hub")}
            label={t("dir_ar_t2_lbl", "PILLAR 2")}
            number={t("dir_ar_t2_val", "Hub & Spokes")}
            colorClass="text-[var(--accent)]"
            isActive={archTab === "p2"}
            onClick={() => setArchTab("p2")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={t("dir_ar_t3_lbl", "PILLAR 3")}
            number={t("dir_ar_t3_val", "{Vault} & Lab")}
            colorClass="text-[var(--accent)]"
            isActive={archTab === "p3"}
            onClick={() => setArchTab("p3")}
          />
        </div>

        {/* Clean 3-Tier Hero Container Below 1x3 Tiles */}
        <div className="relative glass-panel rounded-2xl p-5 flex flex-col gap-4 border !border-[color-mix(in_srgb,var(--text)_22%,transparent)]">
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl border bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[22px]">
                {activePillar.icon}
              </span>
            </div>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
              <span className="material-symbols-outlined !text-[12px]">
                {activePillar.icon}
              </span>
              {t("active", "Active")}
            </span>
          </div>

          <div className="flex flex-col gap-1 mt-0.5">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              {activePillar.badge}
            </span>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--text)] leading-snug m-0">
              {activePillar.heading}
            </h3>
            <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
              {activePillar.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            {activePillar.cards.map((c, idx) => (
              <div
                key={`${c.title}-${idx}`}
                className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {c.icon}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {c.title}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Render Interactive Master Protocol & Clearance Matrix (3 Static Top Tiles + 2-Column 3-Tier Cards & Inline Drawers Across All 3 Tabs)
  const renderInteractiveProtocols = () => {
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
        desc: t("sd_proto_tier12_desc", "Permitted in local Vaults and decentralized Static Edge manifests. Automatically scrubbed from public Nexus feeds and stripped from public Cloud {Blueprints} (trg_purge_flagged_hash_from_blueprints). Eligible for Support Desk with automated 'Dirty Log' sanitization."),
        colorClass:
          "border-[color-mix(in_srgb,var(--info)_45%,transparent)] text-[var(--info)]",
        textColor: "text-[var(--info)]",
        icon: t("icon_visibility_off", "visibility_off"),
      },
      {
        badge: t("sd_proto_tier34_badge", "TIERS 3–4 • SEVERE / RESTRICTED"),
        title: t("sd_proto_tier34_title", "Extreme Violence & Taboo Content — Triggers {Vault} Lock"),
        desc: t("sd_proto_tier34_desc", "Permitted strictly within isolated local Vaults. Scrubbed from all public feeds and Cloud {Blueprints}. Equipping or storing Tier 3–4 {mods} engages a {Vault} Lock that restricts {Citizen} Support Desk ticket submissions until removed."),
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
          "Combines global Core Heuristics (keeper_heuristic_signatures) and community Spoke Heuristics (heuristic_signatures) to inspect .zip, .package, .ts4script, .dll, .exe, and compiled Python .pyc bytecode before execution."
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
              "1-click onboarding handshake on game-gateway that validates all 36 tables in schema.sql, seeds global_network_status, and auto-provisions the Founding Wayfinder."
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
              "Self-service sovereignty protocol executable by either a Keeper or Wayfinder that logs to audit_logs, sets is_active = false, and permanently scrubs supabase_service_key from the Hub."
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
            desc: t("sd_proto_d2_r2_desc", "Binds a {mod}'s SHA-256 lineage in .sanctuary_cache.db and polls creator manifest.json & override.json endpoints directly via HTTP GET during Radar Sweeps."),
          },
          {
            icon: t("icon_folder_open", "folder_open"),
            title: t("sd_proto_d2_r3_title", "{Mod} Suite Parent Grouping"),
            desc: t("sd_proto_d2_r3_desc", "Automatically groups multi-file {mod} suites and .package + .ts4script companions into one clean Parent Card with an expandable Linked Modules drawer."),
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
            desc: t("sd_proto_d2_r6_desc", "Intercepts .zip, .rar, .7z, .package, .ts4script, and override.json downloads inside the built-in browser and routes them straight into the {Vault} scanner."),
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
              "Compiles priority via folder_priority (dynamic Resource.cfg + Sanctuary1–3 folders), manifest_list, numeric_prefix, or timestamp with DFS cycle breaking."
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
              "Automatically evicts rival Flavor files when equipping a chosen Flavor, and bidirectionally links companion .package and .ts4script Twins."
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
          "Hardware WebAuthn FIDO2 gates, Dual-Tier Rust Heuristics, Full-OS Malware Quarantine SidePanel Lockdown with Secure Shred, DEFCON 1 pre-patch shield, and decoupled hardware_bans."
        ),
        rules: [
          {
            icon: t("icon_passkey", "passkey"),
            title: t("sd_proto_d4_r1_title", "FIDO2 Passkey & TOTP Security {Vault}"),
            desc: t("sd_proto_d4_r1_desc", "Requires hardware-bound WebAuthn Passkeys or TOTP verification for all Elevated Clearances (Verified {Mason} through Keeper) inside the right-hand Security {Vault} SidePanel."),
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
      (tab) => tab.id === "roles"
    );
    const customProtoCompTab = customProtoSchema?.tabs?.find(
      (tab) => tab.id === "compliance"
    );
    const customProtoListTab = customProtoSchema?.tabs?.find(
      (tab) => tab.id === "list"
    );

    const effectiveProtoRoles =
      customProtoRolesTab && customProtoRolesTab.cards.length > 0
        ? customProtoRolesTab.cards.map((c) => ({
            short: c.title,
            icon: c.icon,
            title: c.title,
            badge: c.overline || c.footerMeta,
            desc: c.desc,
            requiresPasskey: c.status !== "citizen",
          }))
        : elevatedRoles;

    const effectiveComplianceTiers =
      customProtoCompTab && customProtoCompTab.cards.length > 0
        ? customProtoCompTab.cards.map((c, idx) => ({
            badge: c.overline || c.badge,
            title: c.title,
            desc: c.desc,
            colorClass:
              complianceTiers[idx]?.colorClass ||
              "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]",
            textColor: complianceTiers[idx]?.textColor || "text-[var(--accent)]",
            icon: c.icon || complianceTiers[idx]?.icon || "shield",
          }))
        : complianceTiers;

    const effectiveProtocolDomains =
      customProtoListTab && customProtoListTab.cards.length > 0
        ? customProtoListTab.cards.map((c) => ({
            icon: c.icon,
            badge: c.overline || c.badge,
            title: c.title,
            desc: c.desc,
            rules: (c.subCards || []).map((sc) => ({
              icon: sc.icon,
              title: sc.title,
              desc: sc.desc,
            })),
          }))
        : protocolDomains;

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Static Top Tiles (Uniform font size, zero scrolling, zero truncation) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_admin_panel_settings", "admin_panel_settings")}
            label={t("dir_pr_t1_lbl", "6 TIERS")}
            number={t("dir_pr_t1_val", "Role Matrix")}
            colorClass="text-[var(--accent)]"
            isActive={protoTab === "roles"}
            onClick={() => setProtoTab("roles")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={t("dir_pr_t2_lbl", "TIERS 0–5")}
            number={t("dir_pr_t2_val", "Safety & AV")}
            colorClass="text-[var(--accent)]"
            isActive={protoTab === "compliance"}
            onClick={() => setProtoTab("compliance")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_policy", "policy")}
            label={t("dir_pr_t3_lbl", "32 RULES")}
            number={t("dir_pr_t3_val", "OS Protocols")}
            colorClass="text-[var(--accent)]"
            isActive={protoTab === "list"}
            onClick={() => setProtoTab("list")}
          />
        </div>

        {/* Tab 1: 6-Tier Role Matrix (Single-Column Stacked Cards: Unselected Compact & Dimmed, Selected Expands In-Place) */}
        {protoTab === "roles" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveProtoRoles.map((role, rIdx) => {
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
                  className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
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
                    className={`flex items-start justify-between gap-3 ${
                      isActive ? "cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                          isActive
                            ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {role.icon}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span
                          className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                            isActive
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)]"
                          }`}
                        >
                          {role.badge}
                        </span>
                        <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                          {role.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                          role.requiresPasskey
                            ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                            : "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {role.requiresPasskey
                            ? t("icon_passkey", "passkey")
                            : t("icon_check_circle", "check_circle")}
                        </span>
                        {role.requiresPasskey
                          ? t("auth_passkey_badge_fido", "FIDO2 PASSKEY")
                          : t("role_citizen", "{Citizen}")}
                      </span>
                      <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {isActive
                            ? t("icon_expand_less", "expand_less")
                            : t("icon_expand_more", "expand_more")}
                        </span>
                      </span>
                    </div>
                  </div>

                  {isActive && (
                    <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                        {role.desc}
                      </p>
                      <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <ActionButton
                          variant="glass"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={protoRoleIdx <= 0}
                          onClick={() => {
                            setProtoRoleIdx((prev) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_tier", "Previous Tier")}
                        </ActionButton>
                        <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                          {role.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={
                            protoRoleIdx >= effectiveProtoRoles.length - 1
                          }
                          onClick={() => {
                            setProtoRoleIdx((prev) =>
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
            {effectiveComplianceTiers.map((tier, cIdx) => {
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
                  className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
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
                    className={`flex items-start justify-between gap-3 ${
                      isActive ? "cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl border bg-transparent flex items-center justify-center shrink-0 transition-colors ${tier.colorClass}`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {tier.icon}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span
                          className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                            isActive ? tier.textColor : "text-[var(--subtext)]"
                          }`}
                        >
                          {tier.badge}
                        </span>
                        <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                          {tier.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${tier.colorClass}`}
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {tier.icon}
                        </span>
                        {tier.badge.split("•")[0].trim()}
                      </span>
                      <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {isActive
                            ? t("icon_expand_less", "expand_less")
                            : t("icon_expand_more", "expand_more")}
                        </span>
                      </span>
                    </div>
                  </div>

                  {isActive && (
                    <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                        {tier.desc}
                      </p>
                      <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <ActionButton
                          variant="glass"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={protoCompIdx <= 0}
                          onClick={() => {
                            setProtoCompIdx((prev) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_tier", "Previous Tier")}
                        </ActionButton>
                        <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                          {tier.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={
                            protoCompIdx >=
                            effectiveComplianceTiers.length - 1
                          }
                          onClick={() => {
                            setProtoCompIdx((prev) =>
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
            {effectiveProtocolDomains.map((dom, dIdx) => {
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
                  className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
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
                    className={`flex items-start justify-between gap-3 ${
                      isActive ? "cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                          isActive
                            ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent text-[var(--subtext)] group-hover:text-[var(--text)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {dom.icon}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span
                          className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                            isActive
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)]"
                          }`}
                        >
                          {dom.badge}
                        </span>
                        <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                          {dom.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                          isActive
                            ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {isActive
                            ? t("icon_check_circle", "check_circle")
                            : dom.icon}
                        </span>
                        {dom.badge.split("•")[0].trim()}
                      </span>
                      <span className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {isActive
                            ? t("icon_expand_less", "expand_less")
                            : t("icon_expand_more", "expand_more")}
                        </span>
                      </span>
                    </div>
                  </div>

                  {isActive && (
                    <div className="flex flex-col gap-4 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed m-0">
                        {dom.desc}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {dom.rules.map((r, rIdx) => (
                          <div
                            key={`${r.title}-${rIdx}`}
                            className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                {r.icon}
                              </span>
                              <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                                {r.title}
                              </h4>
                            </div>
                            <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                              {r.desc}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <ActionButton
                          variant="glass"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={protoDomainIdx <= 0}
                          onClick={() => {
                            setProtoDomainIdx((prev) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(protoDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_rule", "Previous Domain")}
                        </ActionButton>
                        <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                          {dom.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={
                            protoDomainIdx >=
                            effectiveProtocolDomains.length - 1
                          }
                          onClick={() => {
                            setProtoDomainIdx((prev) =>
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
  };

  // Extra custom directives created by Keepers beyond the default 4 titles
  const extraCustomDirectives = useMemo(() => {
    const defaultTitles = new Set([
      "official citizen guide",
      "phase 12 - agnostic future",
      "master architecture & feature document",
      "master protocol list",
    ]);
    return posts.filter(
      (p) => !defaultTitles.has((p.title || "").trim().toLowerCase())
    );
  }, [posts]);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Row 1: 2 Primary Featured Interactive Experiences (OS Tutorial & Phase Timeline) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Card 1: Interactive Citizen Guide & OS Walkthrough */}
        <UniversalCard
          layout="vertical"
          icon={t("icon_school", "school")}
          title={t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough")}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_guide_sub", "Walkthrough")
          )}
          onClick={() => openDirectiveModule("guide")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_play_circle", "play_circle")}
                </span>
                {t("sd_card_guide_badge", "CITIZEN GUIDE")}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_explore", "explore")}
                </span>
                {t("sd_card_guide_meta", "9 Interactive Modules")}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest opacity-80 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                {t("sd_card_guide_cta", "Launch OS Tutorial")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {t("sd_card_guide_desc", "Step-by-step interactive walkthrough of Sanctuary OS—from Cartographer setup, Symlink {Vault} & Load Order compilation, to Homestead Lab testing, {Backups} snapshots, and Elevated Clearances.")}
          </p>
        </UniversalCard>

        {/* Card 2: Interactive Phase Roadmap Timeline */}
        <UniversalCard
          layout="vertical"
          icon={t("icon_timeline", "timeline")}
          title={t("sd_card_roadmap_title", "Sanctuary OS Phase Roadmap")}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_roadmap_sub", "Roadmap")
          )}
          onClick={() => openDirectiveModule("roadmap")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_rocket_launch", "rocket_launch")}
                </span>
                {t("sd_card_roadmap_badge", "PHASES 1–12")}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_timeline", "timeline")}
                </span>
                {t("sd_card_roadmap_meta", "12 Architecture Phases")}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest opacity-80 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                {t("sd_card_roadmap_cta", "Explore Timeline")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {t(
              "sd_card_roadmap_desc",
              "Interactive milestone timeline tracking Sanctuary OS from Phase 1 (Local Symlink Core) through Phase 11 (Liquid Glass & FIDO2 Security) into Phase 12 (Game-Agnostic Multi-Spoke Future)."
            )}
          </p>
        </UniversalCard>
      </div>

      {/* Row 2: 3 Dedicated Core System Modules (Forking Guide, Master Architecture, Master Protocol Matrix) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        {/* Card 3: Forking & Spoke Provisioning Guide */}
        <UniversalCard
          layout="vertical"
          icon={t("icon_call_split", "call_split")}
          title={t("sd_card_fork_title", "Forking & Spoke Provisioning Guide")}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_fork_sub", "Provisioning")
          )}
          onClick={() => openDirectiveModule("forking")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--info)]">
                  {t("icon_call_split", "call_split")}
                </span>
                {t("sd_card_fork_badge", "SPOKE & FORK")}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_hub", "hub")}
                </span>
                {t("sd_card_fork_meta", "3-Step Provisioning")}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest opacity-80 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                {t("sd_card_fork_cta", "Open Forking Guide")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {t("sd_card_fork_desc", "Interactive {blueprint} for launching a Sovereign Community Spoke (SANCTUARY-UPLINK://) or a 1-file Standalone Codebase Fork (src/supabase.ts), plus Dynamic Game Schemas and Cut the Cord.")}
          </p>
        </UniversalCard>

        {/* Card 4: Master Architecture & Engine Systems */}
        <UniversalCard
          layout="vertical"
          icon={t("icon_architecture", "architecture")}
          title={t("sd_card_arch_title", "Master Architecture & Engine Systems")}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_arch_sub", "Architecture")
          )}
          onClick={() => openDirectiveModule("architecture")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_architecture", "architecture")}
                </span>
                {t("sd_card_arch_badge", "CORE ENGINE")}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_layers", "layers")}
                </span>
                {t("sd_card_arch_meta", "6 System Layers")}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest opacity-80 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                {t("sd_card_arch_cta", "Inspect Architecture")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {t(
              "sd_card_arch_desc",
              "Deep-dive interactive explorer into the Tauri v2 Rust core, Hub-and-Spoke database federation, Symlink Airgap 2.5, Decentralized Static Edge Manifests, and Atomic Logic."
            )}
          </p>
        </UniversalCard>

        {/* Card 5: Master Protocol & Clearance Matrix */}
        <UniversalCard
          layout="vertical"
          icon={t("icon_policy", "policy")}
          title={t("sd_card_proto_title", "Master Protocol & Clearance Matrix")}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_proto_sub", "Governance")
          )}
          onClick={() => openDirectiveModule("protocols")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_policy", "policy")}
                </span>
                {t("sd_card_proto_badge", "32 PROTOCOLS")}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_shield", "shield")}
                </span>
                {t("sd_card_proto_meta", "5 Protocol Domains")}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest opacity-80 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                {t("sd_card_proto_cta", "Browse Protocols")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {t(
              "sd_card_proto_desc",
              "Interactive directory of all 32 Sanctuary OS operational protocols, Florida Compliance Tiers 0–5, Dual-Tier Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy."
            )}
          </p>
        </UniversalCard>
      </div>

      {/* Optional Row 3: Any extra custom public broadcasts added by Keepers */}
      {extraCustomDirectives.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {extraCustomDirectives.map((p) => {
            const rawBody = p.content || p.message || "";
            const cleanBody = extractDispatchMetadata(p, rawBody).cleanContent;
            const summaryText = stripMarkdown(p.description || cleanBody);
            return (
              <UniversalCard
                key={p.id}
                layout="vertical"
                icon={t("icon_data_object", "data_object")}
                title={p.title}
                subtitle={buildDirectiveSubtitle(p.category)}
                onClick={() => setSelectedPost(p)}
                className="w-full h-full"
                imageOverlay={
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                    <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_folder_special", "folder_special")}
                      </span>
                      {p.category}
                    </span>
                  </div>
                }
                footer={
                  <div className="flex items-center justify-between w-full mt-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_calendar_today", "calendar_today")}
                      </span>
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-80 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                      {t("btn_view", "View")}{" "}
                      <span className="material-symbols-outlined !text-sm">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
                  {summaryText}
                </p>
              </UniversalCard>
            );
          })}
        </div>
      )}

      {/* Interactive System Directives SidePanel */}
      <SidePanel
        isOpen={activeModule !== null}
        onClose={() => setActiveModule(null)}
        title={activePanelMeta.title}
        subtitle={activePanelMeta.subtitle}
        icon={activePanelMeta.icon}
        widthClass="w-[62vw] max-w-5xl"
        panelZ="z-[50001]"
        backdropZ="z-[50000]"
        panelClass="!border-l-[color-mix(in_srgb,var(--text)_15%,transparent)]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              onClick={() => setShowRawDoc((prev) => !prev)}
              tooltip={
                showRawDoc
                  ? t("sd_btn_back_interactive", "Back to Interactive Experience")
                  : t("sd_btn_view_db_doc", "View Full Reference Document")
              }
              icon={
                showRawDoc
                  ? t("icon_play_circle", "play_circle")
                  : t("icon_menu_book", "menu_book")
              }
              variant={showRawDoc ? "accent" : "default"}
              isActive={showRawDoc}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-6 pb-24 w-full">
          <SidePanelHeroCard
            title={activePanelMeta.title}
            subtitle={activePanelMeta.subtitle}
            label={t("author_sanctuary_team", "Sanctuary Foundry")}
            icon={activePanelMeta.icon}
            variant="accent"
            badges={[
              {
                icon: t("icon_verified", "verified"),
                label: t("verified", "Verified"),
                colorClass:
                  "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
              },
            ]}
          />

          {showRawDoc ? (
            <UniversalGroup
              title={activePanelMeta.title}
              icon={t("icon_menu_book", "menu_book")}
            >
              <StructuredReleaseNotesView content={activeReferenceMarkdown} />
            </UniversalGroup>
          ) : (
            <>
              {activeModule === "guide" && renderInteractiveGuide()}
              {activeModule === "roadmap" && renderInteractiveRoadmap()}
              {activeModule === "forking" && renderInteractiveForking()}
              {activeModule === "architecture" &&
                renderInteractiveArchitecture()}
              {activeModule === "protocols" && renderInteractiveProtocols()}
            </>
          )}
        </div>
      </SidePanel>

      {selectedPost && (
        <MasonPostViewer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          userId={session?.user?.id || null}
          hideActions={true}
        />
      )}
    </div>
  );
}
