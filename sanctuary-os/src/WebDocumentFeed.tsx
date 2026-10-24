import { useState, useEffect, useMemo } from "react";
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

  // 1. Citizen Guide & Neural Walkthrough State (3 Static Top Tiles + Hero Card with Bottom Stepper)
  const [guideMode, setGuideMode] = useState<"walkthrough" | "modules" | "roles">("walkthrough");
  const [walkIdx, setWalkIdx] = useState(0);
  const [guideStepIdx, setGuideStepIdx] = useState(0);

  // 2. Phase Roadmap Timeline State (3 Static Top Tiles + Vertical Reverse-Chronological Timeline)
  const [roadmapFilter, setRoadmapFilter] = useState<"all" | "active" | "completed">("all");
  const [selectedPhaseNum, setSelectedPhaseNum] = useState<number>(12);

  // 3. Forking & Spoke Provisioning Guide State (3 Static Top Tiles)
  const [forkTab, setForkTab] = useState<"spoke" | "standalone" | "sql">("spoke");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 4. Master Architecture Explorer State (3 Static Top Tiles)
  const [archTab, setArchTab] = useState<"p1" | "p2" | "p3">("p1");

  // 5. Master Protocol & Clearance Matrix State (3 Static Top Tiles)
  const [protoTab, setProtoTab] = useState<"roles" | "compliance" | "list">("roles");

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
        tip: t(
          "sd_guide_s1_tip",
          "Click the Cloud Auto-Detect icon during setup to automatically locate your Game Bin and Mods directories for the active workspace."
        ),
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
            title: t("sd_guide_s1_c2_title", "Active Mods Folder (Symlink Target)"),
            desc: t(
              "sd_guide_s1_c2_desc",
              "Your game's live Mods folder. Never drop files here manually—Sanctuary projects high-speed symlinks into this directory from your isolated Vault."
            ),
          },
          {
            icon: t("icon_inventory_2", "inventory_2"),
            title: t("sd_guide_s1_c3_title", "Isolated Vault Folder (Deep Storage)"),
            desc: t(
              "sd_guide_s1_c3_desc",
              "Your airgapped archive containing Mods/, Blueprints/, Backups/World, Backups/Engine, Quarantine/, and Data/Cache (.sanctuary_cache.db)."
            ),
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
        desc: t(
          "sd_guide_s2_desc",
          "Your high-level glassmorphic mission control. Monitors the health of your active Blueprint, surfaces creator updates and system dispatches, and provides 1-click access to Radar Sweeps and Vault Lockdown."
        ),
        tip: t(
          "sd_guide_s2_tip",
          "Use the global SystemStatusBar at the bottom of the window to trigger a Radar Sweep or instant Vault Lockdown from any screen in the OS."
        ),
        cards: [
          {
            icon: t("icon_check_circle", "check_circle"),
            colorClass: "text-[var(--success)]",
            title: t("sd_guide_s2_c1_title", "System Stable (Green State)"),
            desc: t(
              "sd_guide_s2_c1_desc",
              "All equipped artifacts match your active game version, all required DLCs and dependencies are satisfied, and zero unmitigated collisions exist."
            ),
          },
          {
            icon: t("icon_system_update_alt", "system_update_alt"),
            colorClass: "text-[var(--info)]",
            title: t("sd_guide_s2_c2_title", "Artifact Updates Available (Blue State)"),
            desc: t(
              "sd_guide_s2_c2_desc",
              "Newer SHA-256 versions have been detected either via the Spoke Cloud Registry or decentralized creator manifest.json endpoints."
            ),
          },
          {
            icon: t("icon_warning", "warning"),
            colorClass: "text-[var(--warning)]",
            title: t(
              "sd_guide_s2_c3_title",
              "Citizen Action Recommended (Amber State)"
            ),
            desc: t(
              "sd_guide_s2_c3_desc",
              "An equipped mod is flagged as Unstable or has an unresolved Severity 3 Tuning Overlap awaiting a Load Order winner."
            ),
          },
          {
            icon: t("icon_error", "error"),
            colorClass: "text-[var(--danger)]",
            title: t("sd_guide_s2_c4_title", "Critical Failure Detected (Red State)"),
            desc: t(
              "sd_guide_s2_c4_desc",
              "An equipped artifact is Corrupted, incompatible with your Game Patch, missing a mandatory dependency/DLC, or locked in a Severity 4 Fatal Clash."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s3_short", "3. Your Vault"),
        title: t("sd_guide_s3_title", "Your Vault & Symlink Airgap 2.5"),
        badge: t("sd_guide_s3_badge", "ISOLATED STORAGE • SHA-256 DNA"),
        icon: t("icon_inventory_2", "inventory_2"),
        desc: t(
          "sd_guide_s3_desc",
          "Your local library and secured asset bunker. The game engine never touches your Vault directly—files are ingested, hashed via SHA-256, sanitized, and projected via symlinks."
        ),
        tip: t(
          "sd_guide_s3_tip",
          "Your Local Mod Dossier is decoupled from the cloud—you can freely customize mod titles, creator URLs, cover images, and tags locally."
        ),
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
            desc: t(
              "sd_guide_s3_c2_desc",
              "When a mod archive includes a creator's override.json, Sanctuary binds its SHA-256 lineage to the creator's static manifest.json URL for serverless update alerts and atomic rules."
            ),
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
            desc: t(
              "sd_guide_s3_c4_desc",
              "Incompatible or broken mods automatically enter a translucent Ghosted state with hover tooltips detailing Missing DLC, Version Mismatches, or Collisions."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s4_short", "4. Blueprints"),
        title: t("sd_guide_s4_title", "Blueprints & Tactical Loadouts"),
        badge: t("sd_guide_s4_badge", "INSTANT HOT-SWAP • CLOUD & OFFLINE"),
        icon: t("icon_map", "map"),
        desc: t(
          "sd_guide_s4_desc",
          "Replace manual folder shuffling with Blueprints. Switch between completely different mod loadouts in seconds without duplicating files on your hard drive."
        ),
        tip: t(
          "sd_guide_s4_tip",
          "Use 'Snapshot Active Blueprint' anytime to clone your currently deployed loadout into an experimental profile before adding new mods."
        ),
        cards: [
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: t("sd_guide_s4_c1_title", "1-Click Blueprint Hot-Swap"),
            desc: t(
              "sd_guide_s4_c1_desc",
              "Switch active loadouts directly from the Vault header or Blueprints view. Sanctuary instantly re-projects the exact symlinks and load order for that profile."
            ),
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
            desc: t(
              "sd_guide_s4_c3_desc",
              "Export portable JSON blueprints that embed your custom Local Dossier metadata (author links, custom names) and workspace ID for 100% offline preservation."
            ),
          },
          {
            icon: t("icon_install_mobile", "install_mobile"),
            title: t("sd_guide_s4_c4_title", "Remote Mobile/Web Queue Staging"),
            desc: t(
              "sd_guide_s4_c4_desc",
              "Browse The Nexus on your phone or tablet, stage a modpack queue encrypted in the cloud, and approve it in one click when you sit down at your PC."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s5_short", "5. Nexus & Browser"),
        title: t("sd_guide_s5_title", "The Nexus & Integrated Side Browser"),
        badge: t("sd_guide_s5_badge", "METADATA REGISTRY • ZERO-TAX DISCOVERY"),
        icon: t("icon_hub", "hub"),
        desc: t(
          "sd_guide_s5_desc",
          "Discover verified Artifacts, Blueprints, Lexicons, Chameleons, and Workbench Templates—and download directly from creator pages using the built-in Side Browser."
        ),
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
            desc: t(
              "sd_guide_s5_c2_desc",
              "Clicking download on a creator's page inside the Integrated Side Browser automatically intercepts the archive and routes it straight into your Vault."
            ),
          },
          {
            icon: t("icon_verified", "verified"),
            title: t("sd_guide_s5_c3_title", "Creator Profiles & Direct Attribution"),
            desc: t(
              "sd_guide_s5_c3_desc",
              "Follow your favorite Masons to see their posts in your Comm-Link feed. Sanctuary takes 0% platform tax and links directly to creator Patreon, Ko-fi, and websites."
            ),
          },
          {
            icon: t("icon_radar", "radar"),
            title: t("sd_guide_s5_c4_title", "Crowd-Sourced Scout Queue"),
            desc: t(
              "sd_guide_s5_c4_desc",
              "Unidentified local mods can be submitted via the Scout Dossier or marked 'Flag as Local' to permanently exclude private files from cloud lookups."
            ),
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
            desc: t(
              "sd_guide_s6_c1_desc",
              "For Severity 3 Tuning Overlaps, simply click the mod you want to win. Sanctuary automatically compiles the priority rules and routes the winner into the top override tier."
            ),
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
            desc: t(
              "sd_guide_s6_c3_desc",
              "Severity 4 indicates a hard binary/script clash where only one mod can remain enabled. Severity 3 indicates a tuning overlap solvable via Load Order priority."
            ),
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
        desc: t(
          "sd_guide_s7_desc",
          "Test unverified mods or pit two conflicting artifacts against each other in an airgapped sandbox without risking your real save files or main loadout."
        ),
        tip: t(
          "sd_guide_s7_tip",
          "Passing a timed Homestead Lab playtest and saving in-game automatically verifies your Sandbox artifact for publishing!"
        ),
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
            desc: t(
              "sd_guide_s7_c4_desc",
              "Pit two suspected conflicting mods together in isolation to verify compatibility and submit telemetry directly to Architects."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s8_short", "8. Time Capsule & IDE"),
        title: t("sd_guide_s8_title", "Time Capsule & Citizen's Workbench"),
        badge: t("sd_guide_s8_badge", "HARDLINK SNAPSHOTS • VISUAL CONFIG IDE"),
        icon: t("icon_history", "history"),
        desc: t(
          "sd_guide_s8_desc",
          "Protect your saves and game binaries with zero-duplication hardlink backups, and fine-tune mod configuration files using visual sliders or the built-in Monaco IDE."
        ),
        tip: t(
          "sd_guide_s8_tip",
          "When DEFCON 1 is declared for an incoming game patch, Sanctuary automatically prompts to seal a Pre-Patch Time Capsule before launching."
        ),
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
            desc: t(
              "sd_guide_s8_c3_desc",
              "Restore an entire snapshot via fast differential sync, or browse inside any Time Capsule to surgically extract a single household save slot."
            ),
          },
          {
            icon: t("icon_construction", "construction"),
            title: t(
              "sd_guide_s8_c4_title",
              "Citizen's Workbench & Open Mason Workshop"
            ),
            desc: t(
              "sd_guide_s8_c4_desc",
              "Edit mod .json/.ini/.cfg files with safe visual toggles and sliders synced live with a Monaco Raw Code Diff editor—plus full local Sandbox & Export Release tools for all Citizens."
            ),
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
            desc: t(
              "dir_walk_s1_c1_desc",
              "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 Citizen modules, unlocked Command Hubs, and the Quick Launch button."
            ),
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
            desc: t(
              "dir_walk_s1_c3_desc",
              "Houses 1-Click Radar Sweep, Vault Lockdown, Blueprint Quick-Swap, Side Browser, Notifications, and live alert counters. Auto-tucks when SidePanels open."
            ),
          },
        ],
      },
      {
        num: 2,
        short: t("dir_walk_s2_short", "2. Cartographer"),
        icon: t("icon_explore", "explore"),
        title: t("dir_walk_s2_title", "Mounting a Workspace & Cartographer"),
        sub: t("dir_walk_s2_sub", "First-Boot Coordinate Mapping & Native PE Ripper"),
        desc: t(
          "dir_walk_s2_desc",
          "Selecting a workspace on the Landing Page launches The Cartographer to link your game binary, live Mods directory, and airgapped Vault storage."
        ),
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
            name: t("dir_walk_s2_c2_name", "Mods Folder (Symlink Target)"),
            desc: t(
              "dir_walk_s2_c2_desc",
              "Your live game Mods folder. Keep this untouched—Sanctuary projects active mods here via zero-copy OS symlinks."
            ),
          },
          {
            icon: t("icon_inventory_2", "inventory_2"),
            name: t("dir_walk_s2_c3_name", "Vault Folder (Deep Archive)"),
            desc: t(
              "dir_walk_s2_c3_desc",
              "Your isolated storage directory where Sanctuary builds Mods/, Blueprints/, Backups/World/, Backups/Engine/, Quarantine/, and Data/Cache/."
            ),
          },
        ],
      },
      {
        num: 3,
        short: t("dir_walk_s3_short", "3. Vault & Cards"),
        icon: t("icon_inventory_2", "inventory_2"),
        title: t("dir_walk_s3_title", "Your Vault, Mod Cards & ActionPill"),
        sub: t("dir_walk_s3_sub", "Drag-and-Drop Ingestion, Suite Grouping & Dossiers"),
        desc: t(
          "dir_walk_s3_desc",
          "Every mod you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Dual-Tier Heuristic Engine, and indexed in Your Vault."
        ),
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
            desc: t(
              "dir_walk_s3_c2_desc",
              "Toggles symlinks in milliseconds. Multi-part mod suites (like MC Command Center) group into one Parent Card with an expandable Linked Modules drawer."
            ),
          },
          {
            icon: t("icon_menu_book", "menu_book"),
            name: t("dir_walk_s3_c3_name", "Mod Dossier SidePanel"),
            desc: t(
              "dir_walk_s3_c3_desc",
              "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static manifest.json URL, or inspect package files."
            ),
          },
        ],
      },
      {
        num: 4,
        short: t("dir_walk_s4_short", "4. Blueprints"),
        icon: t("icon_map", "map"),
        title: t("dir_walk_s4_title", "Blueprints & Loadout Hot-Swapping"),
        sub: t("dir_walk_s4_sub", "Zero-Copy Profile Switching & SNCXXX Cloud Uplinks"),
        desc: t(
          "dir_walk_s4_desc",
          "Replace manual folder dragging with saved tactical loadouts that swap thousands of symlinks in under a second."
        ),
        controls: [
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            name: t("dir_walk_s4_c1_name", "Blueprint Hot-Swap Dropdown"),
            desc: t(
              "dir_walk_s4_c1_desc",
              "Switch between playstyles (e.g. Realism Save, Occult Save, Patch Testing) directly from the Vault header or Bottom Dock."
            ),
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
            desc: t(
              "dir_walk_s4_c3_desc",
              "Generates a 6-character share code (SNCXXX) or publishes your Blueprint to The Nexus while auto-stripping flagged Tier 1–4 hashes."
            ),
          },
        ],
      },
      {
        num: 5,
        short: t("dir_walk_s5_short", "5. Radar & Lab"),
        icon: t("icon_radar", "radar"),
        title: t("dir_walk_s5_title", "Conflict Radar & Homestead Lab"),
        sub: t("dir_walk_s5_sub", "Pick-a-Winner Load Order & 100% Nuke Proving Grounds"),
        desc: t(
          "dir_walk_s5_desc",
          "Resolve tuning overlaps before launching the game, or isolate suspect mods in a sterile crash-monitored sandbox."
        ),
        controls: [
          {
            icon: t("icon_emoji_events", "emoji_events"),
            name: t("dir_walk_s5_c1_name", "Casual Mode (Pick a Winner)"),
            desc: t(
              "dir_walk_s5_c1_desc",
              "Click 'Pick a Winner' on any Severity 3 Tuning Overlap to automatically route the winning mod into a higher priority tier and dynamic Resource.cfg."
            ),
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
            desc: t(
              "dir_walk_s5_c3_desc",
              "Strips your main loadout and boots the game with only the test mod (or 2 conflicting mods) while harvesting lastException.txt logs."
            ),
          },
        ],
      },
      {
        num: 6,
        short: t("dir_walk_s6_short", "6. IDE & Backups"),
        icon: t("icon_construction", "construction"),
        title: t("dir_walk_s6_title", "Workbench, Timeline Diff & Time Capsule"),
        sub: t("dir_walk_s6_sub", "2-Column Visual Config Studio & Hardlink Backups"),
        desc: t(
          "dir_walk_s6_desc",
          "Edit 430+ setting mod config files visually at 60 FPS and safeguard your saves and game binaries with zero-bloat snapshots."
        ),
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
            name: t("dir_walk_s6_c3_name", "Time Capsule (World & Engine)"),
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
        sub: t("dir_walk_s7_sub", "Citizen Creator Inheritance & Full-OS Security Gates"),
        desc: t(
          "dir_walk_s7_desc",
          "Every Citizen inherits the local Mason Workshop, while hardware FIDO2 Passkeys and full-OS Quarantine Lockdowns protect the ecosystem."
        ),
        controls: [
          {
            icon: t("icon_handyman", "handyman"),
            name: t("dir_walk_s7_c1_name", "Open Mason Workshop (Citizen Tier)"),
            desc: t(
              "dir_walk_s7_c1_desc",
              "All Citizens can use Dev Sandbox, Mason IDE, 3-Tile Artifact Studio, Theme Forge (6 Liquid Glass sliders), and Static Edge Release Packaging."
            ),
          },
          {
            icon: t("icon_passkey", "passkey"),
            name: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP Vault"),
            desc: t(
              "dir_walk_s7_c2_desc",
              "Elevated clearances (Verified Mason through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security Vault SidePanel."
            ),
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
        short: t("dir_proto_r1_role", "Citizen"),
        icon: t("icon_person", "person"),
        title: t("dir_proto_r1_role", "Citizen"),
        badge: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
        desc: t(
          "dir_proto_r1_scope",
          "All 9 Citizen Modules (Vault, Nexus, Blueprints, Conflict Radar, Homestead Lab, Workbench, Time Capsule) + Inherited Open Mason Workshop (Sandbox, Mason IDE, 3-Tile Artifact Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions."
        ),
        requiresPasskey: false,
      },
      {
        short: t("dir_proto_r2_role", "Verified Mason"),
        icon: t("icon_construction", "construction"),
        title: t("dir_proto_r2_role", "Verified Mason"),
        badge: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
        desc: t(
          "dir_proto_r2_scope",
          "Inherits all Citizen & Open Workshop tools + FIDO2 Passkey Vault gate, Direct Nexus Artifact Publishing, Verified Mason Queue Fast-Lane (bypasses Scout threshold), Public Mason Profile Showcase, Creator Comm-Link Broadcasts, and 0%-Cut Supporter Bridge."
        ),
        requiresPasskey: true,
      },
      {
        short: t("dir_proto_r3_role", "Architect"),
        icon: t("icon_architecture", "architecture"),
        title: t("dir_proto_r3_role", "Architect"),
        badge: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
        desc: t(
          "dir_proto_r3_scope",
          "Unlocks Architect Console: Global Registry curation (3-Tile Artifact Studio), Verified Mason & Scout Queue triage (min_scout_submissions), Global Conflict Matrix directives, Check Hash deep scan, Template Oversight, and claimable Citizen Support Desk tickets."
        ),
        requiresPasskey: true,
      },
      {
        short: t("dir_proto_r4_role", "Oversight"),
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        title: t("dir_proto_r4_role", "Oversight"),
        badge: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
        desc: t(
          "dir_proto_r4_scope",
          "Unlocks Oversight Command: Spoke Heuristic Signatures authoring, Compliance Tier 5 Malware flagging, Emergency DEFCON 1 Lockdown override, Game/DLC patch registration, Mass Batch Updater, Mason Linker, and Spoke Identity Matrix (up to Architect)."
        ),
        requiresPasskey: true,
      },
      {
        short: t("dir_proto_r5_role", "Wayfinder"),
        icon: t("icon_explore", "explore"),
        title: t("dir_proto_r5_role", "Wayfinder"),
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

  // 12 Phases for the Interactive Roadmap Timeline (Reverse Chronological: Phase 12 -> Phase 1, enriched from Foundry Comm-Logs)
  const roadmapPhases = useMemo(
    () => [
      {
        num: 12,
        status: "active" as const,
        icon: t("icon_rocket_launch", "rocket_launch"),
        code: t("dir_phase_12_num", "PHASE 12 • AUG–OCT 2026"),
        title: t(
          "dir_phase_12_title",
          "Agnostic Multi-Game Future, Sovereignty & Liquid Glass"
        ),
        sub: t("sd_roadmap_p12_sub", "Multi-Game Schemas, 1-File Forks & Liquid Glass"),
        desc: t(
          "dir_phase_12_summary",
          "Hub-and-Spoke database sovereignty (SANCTUARY-UPLINK:// & Cut the Cord), Dynamic Game Schemas, Static Edge Polling, Zero-Tearing Liquid Glass, 2-Column Visual Workbench, 3-Tile Artifact Studio, FIDO2 Passkeys, Full-OS Quarantine SidePanel, and Bilateral Directives Sync."
        ),
        milestones: [
          t(
            "dir_phase_12_m1",
            "Hub-and-Spoke Sovereignty (schema.sql & schema_os.sql) + Single-File Standalone Fork (src/supabase.ts) + Cut the Cord"
          ),
          t(
            "dir_phase_12_m2",
            "Dynamic Game Schemas & Schema-Driven Load Order Compiler (folder_priority, manifest_list, numeric_prefix, timestamp)"
          ),
          t(
            "dir_phase_12_m3",
            "Zero-Tearing Liquid Glass Optics, 2-Column Visual Workbench & Timeline Diff, and Unified 3-Tile Artifact Studio"
          ),
          t(
            "dir_phase_12_m4",
            "FIDO2 Passkey Vault, Full-OS Quarantine SidePanel Lockdown, Silent In-App Updater & Bilateral Codebase-to-Hub Directives Sync"
          ),
        ],
      },
      {
        num: 11,
        status: "completed" as const,
        icon: t("icon_public", "public"),
        code: t("dir_phase_11_num", "PHASE 11 • JULY 2026"),
        title: t(
          "dir_phase_11_title",
          "Integrated Side Browser, Mason Linker & Security Audit"
        ),
        sub: t("sd_roadmap_p11_sub", "In-App Download Interception & Forensic Audit"),
        desc: t(
          "dir_phase_11_summary",
          "Embedded multi-tab Side Browser with automatic download interception, full-stack path-traversal & RLS security audit hardening, Mason Linker, and unified ActionPill navigation."
        ),
        milestones: [
          t(
            "dir_phase_11_m1",
            "Integrated Side Browser with automatic .zip/.rar/.7z/.package/.ts4script download interception directly into the Vault"
          ),
          t(
            "dir_phase_11_m2",
            "Full-stack Security & Forensic Audit: path traversal guards (is_safe_user_file_path), RLS hardening & append-only audit_logs"
          ),
          t(
            "dir_phase_11_m3",
            "Oversight Mason Linker, Unregistered Vault auto-sync on Nexus verification & unified ActionPill toolbar"
          ),
        ],
      },
      {
        num: 10,
        status: "completed" as const,
        icon: t("icon_palette", "palette"),
        code: t("dir_phase_10_num", "PHASE 10 • JUNE 2026"),
        title: t(
          "dir_phase_10_title",
          "The Nexus Registry, Theme Forge & Lexicon Matrix"
        ),
        sub: t("sd_roadmap_p6_sub", "Word-as-a-Service Localization & Live Theme Forge"),
        desc: t(
          "dir_phase_10_summary",
          "Launched The Nexus global discovery registry, the Chameleon Theme Forge Suite with live Holo Sandbox, and the 4-dictionary Lexicon Word-as-a-Service engine."
        ),
        milestones: [
          t(
            "dir_phase_10_m1",
            "The Nexus Discovery Registry for Artifacts, Blueprints, Lexicons, Chameleons & Templates with version/DLC auto-filtering"
          ),
          t(
            "dir_phase_10_m2",
            "Chameleon Theme Forge Suite with multi-stop Background Builder, Dark/Light adaptation & live Holo Sandbox"
          ),
          t(
            "dir_phase_10_m3",
            "Lexicon Protocol routing 100% of UI strings and icons through hot-swappable JSON dictionaries"
          ),
        ],
      },
      {
        num: 9,
        status: "completed" as const,
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        code: t("dir_phase_9_num", "PHASE 9 • JUNE 2026"),
        title: t(
          "dir_phase_9_title",
          "Oversight Command, Wayfinder Hub & Keepers Core"
        ),
        sub: t("sd_roadmap_p8_sub", "Elevated Command Hubs, Support Desk & Compliance"),
        desc: t(
          "dir_phase_9_summary",
          "Constructed the 5 Elevated Command Hubs, claimable Citizen Support Desk Ticket Dossiers, and Florida Compliance Tiers 1–4 with Cloud Blueprint auto-purge."
        ),
        milestones: [
          t(
            "dir_phase_9_m1",
            "Dedicated ElevatedHubLayout command centers for Mason, Architect, Oversight, Wayfinder & Keepers Core"
          ),
          t(
            "dir_phase_9_m2",
            "Claimable Citizen Support Desk Ticket Dossiers with scrubbed crash logs, macros & cross-tier escalation"
          ),
          t(
            "dir_phase_9_m3",
            "Florida Compliance Tiers 1–4 with automatic public feed scrubbing and Cloud Blueprint hash purge triggers"
          ),
        ],
      },
      {
        num: 8,
        status: "completed" as const,
        icon: t("icon_cell_tower", "cell_tower"),
        code: t("dir_phase_8_num", "PHASE 8 • MAY–JUNE 2026"),
        title: t(
          "dir_phase_8_title",
          "Global Comm-Link, DEFCON Patch Shield & Quarantine"
        ),
        sub: t("sd_roadmap_p9_sub", "Social Broadcasts, Patch Shield & Malware Shred"),
        desc: t(
          "dir_phase_8_summary",
          "Real-time Comm-Link social broadcast feed, Supabase Realtime DEFCON 1 patch shield listener, Tier 5 Malware Secure Shred, and the 5-click Nuclear Override."
        ),
        milestones: [
          t(
            "dir_phase_8_m1",
            "Global Comm-Link feed with WYSIWYG/Markdown dispatches, multi-level threaded replies & Discover/Following tabs"
          ),
          t(
            "dir_phase_8_m2",
            "Real-time DEFCON 1 network listener intercepting game launches during breaking patches to force emergency backups"
          ),
          t(
            "dir_phase_8_m3",
            "Tier 5 Malware byte-level heuristic scanner, Citizen-signed Secure Shred & privacy-first hardware_bans Nuclear Override"
          ),
        ],
      },
      {
        num: 7,
        status: "completed" as const,
        icon: t("icon_construction", "construction"),
        code: t("dir_phase_7_num", "PHASE 7 • MAY 2026"),
        title: t(
          "dir_phase_7_title",
          "Mason Workshop, Monaco IDE & Citizen's Workbench"
        ),
        sub: t("sd_roadmap_p7_sub", "Visual Config Sliders, Monaco IDE & Creator Suite"),
        desc: t(
          "dir_phase_7_summary",
          "Created the Citizen's Workbench dual Visual/Raw Config Studio, the Mason Workshop with embedded Monaco IDE & Dev Sandbox, and the native Rust pelite PE version ripper."
        ),
        milestones: [
          t(
            "dir_phase_7_m1",
            "Citizen's Workbench schema-driven Visual Config Editor synchronized in real time with a Monaco Raw Editor"
          ),
          t(
            "dir_phase_7_m2",
            "Mason Workshop with isolated Dev Sandbox, Collections Builder & Protocol Orchestrator for Twins/Flavors/Dependencies"
          ),
          t(
            "dir_phase_7_m3",
            "In-process Rust pelite PE executable parser extracting genuine patch versions from .exe headers with zero AV false positives"
          ),
        ],
      },
      {
        num: 6,
        status: "completed" as const,
        icon: t("icon_science", "science"),
        code: t("dir_phase_6_num", "PHASE 6 • MAY 2026"),
        title: t(
          "dir_phase_6_title",
          "Homestead Lab & 100% Nuke Isolation Proving Grounds"
        ),
        sub: t("sd_roadmap_p4_sub", "Isolated Sandbox Testing & Crash Log Scrubber"),
        desc: t(
          "dir_phase_6_summary",
          "Engineered the Homestead Lab to strip active Vault symlinks for 100% isolated mod testing, 1v1 conflict stability arenas, and automated crash log harvesting."
        ),
        milestones: [
          t(
            "dir_phase_6_m1",
            "100% Nuke Injection Sandbox stripping active symlinks to inject only the isolated test subject and its mandatory dependencies"
          ),
          t(
            "dir_phase_6_m2",
            "1v1 Conflict Stability Arena pitting two colliding mods head-to-head while monitoring real-time engine stability"
          ),
          t(
            "dir_phase_6_m3",
            "Automated lastException.txt crash log harvester and local PII/path scrubber (scrub_user_data_from_log)"
          ),
        ],
      },
      {
        num: 5,
        status: "completed" as const,
        icon: t("icon_history", "history"),
        code: t("dir_phase_5_num", "PHASE 5 • MAY 2026"),
        title: t(
          "dir_phase_5_title",
          "Time Capsule Hardlink & Differential Rollback Engine"
        ),
        sub: t("sd_roadmap_p5_sub", "Zero-Duplication Incremental Backups & Restore"),
        desc: t(
          "dir_phase_5_summary",
          "Built the dual-state Time Capsule (World State & Engine Core) using native OS hardlinks for zero-bloat incremental snapshots and differential state rollbacks."
        ),
        milestones: [
          t(
            "dir_phase_5_m1",
            "Dual-State Time Capsule separating World State (Saves/Settings) from Engine Core (Game Installation Binaries)"
          ),
          t(
            "dir_phase_5_m2",
            "Zero-bloat NTFS/POSIX hardlink snapshot engine paired with .tar.zst zstandard compression"
          ),
          t(
            "dir_phase_5_m3",
            "Differential rollback comparator (diff_backup) restoring only modified bytes and purging rogue files"
          ),
        ],
      },
      {
        num: 4,
        status: "completed" as const,
        icon: t("icon_radar", "radar"),
        code: t("dir_phase_4_num", "PHASE 4 • MAY 2026"),
        title: t(
          "dir_phase_4_title",
          "Conflict Radar Severity 1–4 & Architect Console"
        ),
        sub: t("sd_roadmap_p10_sub", "Collision Matrix, Priority Folders & Scout Queue"),
        desc: t(
          "dir_phase_4_summary",
          "Established the Severity 1–4 collision classification matrix, Priority Tier folders with dynamic Resource.cfg, and the Architect Console with Scout Queue triage."
        ),
        milestones: [
          t(
            "dir_phase_4_m1",
            "Severity 1–4 Collision Matrix distinguishing Minor/Duplicate overlaps from Severity 3 Tuning Overlaps and Severity 4 Clashes"
          ),
          t(
            "dir_phase_4_m2",
            "Priority Tier override folders (Sanctuary1–Sanctuary3) and automated Resource.cfg priority compilation"
          ),
          t(
            "dir_phase_4_m3",
            "Architect Console & crowd-sourced Scout Queue with Copilot confirmation gates"
          ),
        ],
      },
      {
        num: 3,
        status: "completed" as const,
        icon: t("icon_hub", "hub"),
        code: t("dir_phase_3_num", "PHASE 3 • APR–MAY 2026"),
        title: t(
          "dir_phase_3_title",
          "Atomic Logic Engine, Ghosted States & Cloud Uplinks"
        ),
        sub: t("sd_roadmap_p3_sub", "Highlander Flavors, Twins, Cascades & SNCXXX"),
        desc: t(
          "dir_phase_3_summary",
          "Engineered the Atomic Logic Triumvirate (Highlander Flavors, Nuclear Family Twins, Recursive Dependencies), Deep Yeet 2.0 Delete Cascade, and SNCXXX Cloud Blueprints."
        ),
        milestones: [
          t(
            "dir_phase_3_m1",
            "Atomic Logic Triumvirate: Highlander Flavor eviction, bidirectional .package/.ts4script Twins & Recursive Chain-Link Dependencies"
          ),
          t(
            "dir_phase_3_m2",
            "Deep Yeet 2.0 Delete Cascade intercepting master mod removal to queue dependent child add-ons cleanly"
          ),
          t(
            "dir_phase_3_m3",
            "6-character SNCXXX Cloud Blueprint Uplink codes, portable JSON exports & automatic Missing DLC Ghosting"
          ),
        ],
      },
      {
        num: 2,
        status: "completed" as const,
        icon: t("icon_map", "map"),
        code: t("dir_phase_2_num", "PHASE 2 • APRIL 2026"),
        title: t(
          "dir_phase_2_title",
          "Symlink Airgap 2.5, SQLite Delta Cache & Blueprints"
        ),
        sub: t("sd_roadmap_p2_sub", "Zero-Copy Symlinks & Sub-Second SQLite Indexing"),
        desc: t(
          "dir_phase_2_summary",
          "Replaced physical file copying with Symlink Airgap 2.5 projection, built the mtime-first .sanctuary_cache.db SQLite delta scanner, and launched local Blueprints."
        ),
        milestones: [
          t(
            "dir_phase_2_m1",
            "Symlink Airgap 2.5 projecting mods from the isolated Vault into the live game directory in milliseconds"
          ),
          t(
            "dir_phase_2_m2",
            "SQLite .sanctuary_cache.db mtime-first delta scanner indexing 5,000+ mod Vaults in sub-second sweeps"
          ),
          t(
            "dir_phase_2_m3",
            "Self-healing Vault Sanitizer directory hierarchy and local Blueprint profile switching"
          ),
        ],
      },
      {
        num: 1,
        status: "completed" as const,
        icon: t("icon_inventory_2", "inventory_2"),
        code: t("dir_phase_1_num", "PHASE 1 • APRIL 2026"),
        title: t(
          "dir_phase_1_title",
          "Genesis, Tauri v2 Rust Core & The Cartographer"
        ),
        sub: t("sd_roadmap_p1_sub", "Zero-Pollution Symlink Projection & SHA-256 DNA"),
        desc: t(
          "dir_phase_1_summary",
          "Initialized the Tauri v2 + Rust + React 18 workspace, built The Cartographer first-boot reconnaissance wizard, and engineered multi-threaded SHA-256 DNA hashing."
        ),
        milestones: [
          t(
            "dir_phase_1_m1",
            "Tauri v2 + Rust + React 18 + TypeScript + Zustand desktop architecture initialization"
          ),
          t(
            "dir_phase_1_m2",
            "The Cartographer automated path discovery wizard for Game Bin, Mods & Vault coordinates"
          ),
          t(
            "dir_phase_1_m3",
            "Multi-threaded streaming SHA-256 DNA file hashing and DBPF/ZIP archive inspection in Rust"
          ),
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
    if (activeModule === "guide") {
      return directivesMap.citizen_guide?.content || bundledCitizenGuide;
    }
    if (activeModule === "roadmap") {
      return directivesMap.phase_roadmap?.content || bundledRoadmapDoc;
    }
    if (activeModule === "forking") {
      return directivesMap.forking_guide?.content || bundledForkingGuide;
    }
    if (activeModule === "architecture") {
      return (
        directivesMap.master_architecture?.content || bundledArchitectureDoc
      );
    }
    if (activeModule === "protocols") {
      return directivesMap.master_protocols?.content || bundledProtocolList;
    }
    return "";
  }, [activeModule, directivesMap]);

  const activePanelMeta = useMemo(() => {
    switch (activeModule) {
      case "guide":
        return {
          title: t(
            "sd_card_guide_title",
            "Interactive Citizen Guide & OS Walkthrough"
          ),
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

  // Render Interactive OS Walkthrough (3 Static Top Tiles + Submit-a-Ticket Stacked Click-to-Jump Stepper)
  const renderInteractiveGuide = () => {
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

        {/* Mode 1: 7-Stage Interactive UI Walkthrough (Submit-A-Ticket Stacked Click-to-Jump Stepper) */}
        {guideMode === "walkthrough" && (
          <div className="flex flex-col gap-3">
            {walkthroughStages.map((stg, idx) => {
              const isActive = walkIdx === idx;
              const isCompleted = idx < walkIdx;

              if (!isActive) {
                return (
                  <div
                    key={stg.num}
                    onClick={() => setWalkIdx(idx)}
                    className="glass-panel rounded-2xl px-5 py-4 flex items-center justify-between gap-4 cursor-pointer transition-all border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest ${
                          isCompleted
                            ? "text-[var(--success)] opacity-85"
                            : "text-[var(--subtext)] opacity-60"
                        }`}
                      >
                        {isCompleted
                          ? `${t("sd_roadmap_status_completed", "COMPLETED")} • ${t("dir_walk_step_counter", "STAGE {0} OF {1}").replace("{0}", String(idx + 1)).replace("{1}", String(walkthroughStages.length))}`
                          : t("dir_walk_step_counter", "STAGE {0} OF {1}")
                              .replace("{0}", String(idx + 1))
                              .replace("{1}", String(walkthroughStages.length))}
                      </span>
                      <span className="text-sm font-black text-[var(--text)] truncate">
                        {stg.title}
                      </span>
                    </div>
                    <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] opacity-60 shrink-0">
                      {t("icon_expand_more", "expand_more")}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={stg.num}
                  className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] shadow-[0_0_24px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                      {stg.sub}
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-75">
                      {t("dir_walk_step_counter", "STAGE {0} OF {1}")
                        .replace("{0}", String(idx + 1))
                        .replace("{1}", String(walkthroughStages.length))}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)] leading-snug">
                      {stg.title}
                    </h2>
                    <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
                      {stg.desc}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                      {t(
                        "dir_walk_controls_hdr",
                        "What Each Control & Button Does"
                      )}
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      {stg.controls.map((ctrl, cIdx) => (
                        <div
                          key={`${ctrl.name}-${cIdx}`}
                          className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
                              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                                {ctrl.icon}
                              </span>
                            </div>
                            <h3 className="text-xs sm:text-sm font-bold text-[var(--text)] leading-snug">
                              {ctrl.name}
                            </h3>
                          </div>
                          <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                            {ctrl.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_navigate_before", "navigate_before")}
                      disabled={walkIdx <= 0}
                      onClick={() =>
                        setWalkIdx((prev) => Math.max(0, prev - 1))
                      }
                    >
                      {t("dir_walk_prev", "Previous Stage")}
                    </ActionButton>
                    <ActionButton
                      variant="accent"
                      icon={t("icon_navigate_next", "navigate_next")}
                      disabled={walkIdx >= walkthroughStages.length - 1}
                      onClick={() =>
                        setWalkIdx((prev) =>
                          Math.min(walkthroughStages.length - 1, prev + 1)
                        )
                      }
                    >
                      {t("dir_walk_next", "Next Stage")}
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mode 2: 9 Citizen Modules Deep-Dive (Submit-A-Ticket Stacked Click-to-Jump Stepper) */}
        {guideMode === "modules" && (
          <div className="flex flex-col gap-3">
            {citizenSteps.map((step, idx) => {
              const isActive = guideStepIdx === idx;
              const isCompleted = idx < guideStepIdx;

              if (!isActive) {
                return (
                  <div
                    key={step.short}
                    onClick={() => setGuideStepIdx(idx)}
                    className="glass-panel rounded-2xl px-5 py-4 flex items-center justify-between gap-4 cursor-pointer transition-all border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest ${
                          isCompleted
                            ? "text-[var(--success)] opacity-85"
                            : "text-[var(--subtext)] opacity-60"
                        }`}
                      >
                        {isCompleted
                          ? `${t("sd_roadmap_status_completed", "COMPLETED")} • ${t("sd_guide_step_progress", "Module {0} of {1}").replace("{0}", String(idx + 1)).replace("{1}", String(citizenSteps.length))}`
                          : t("sd_guide_step_progress", "Module {0} of {1}")
                              .replace("{0}", String(idx + 1))
                              .replace("{1}", String(citizenSteps.length))}
                      </span>
                      <span className="text-sm font-black text-[var(--text)] truncate">
                        {step.title}
                      </span>
                    </div>
                    <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] opacity-60 shrink-0">
                      {t("icon_expand_more", "expand_more")}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={step.short}
                  className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] shadow-[0_0_24px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                      {step.badge}
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-75">
                      {t("sd_guide_step_progress", "Module {0} of {1}")
                        .replace("{0}", String(idx + 1))
                        .replace("{1}", String(citizenSteps.length))}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)] leading-snug">
                      {step.title}
                    </h2>
                    <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                      {t(
                        "sd_guide_key_mechanics_label",
                        "Interactive Breakdown & Core Mechanics"
                      )}
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {step.cards.map((card, cIdx) => (
                        <div
                          key={`${card.title}-${cIdx}`}
                          className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                              <span
                                className={`material-symbols-outlined !text-[16px] ${
                                  (card as any).colorClass ||
                                  "text-[var(--accent)]"
                                }`}
                              >
                                {card.icon}
                              </span>
                            </div>
                            <h3 className="text-xs sm:text-sm font-bold text-[var(--text)] leading-snug">
                              {card.title}
                            </h3>
                          </div>
                          <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                            {card.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 flex items-start gap-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                    <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5">
                      {t("icon_lightbulb", "lightbulb")}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                        {t("sd_guide_pro_tip_label", "Citizen Pro Tip")}
                      </span>
                      <p className="text-xs text-[var(--text)] opacity-85 leading-relaxed">
                        {step.tip}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_navigate_before", "navigate_before")}
                      disabled={guideStepIdx <= 0}
                      onClick={() =>
                        setGuideStepIdx((prev) => Math.max(0, prev - 1))
                      }
                    >
                      {t("sd_btn_prev_step", "Previous Module")}
                    </ActionButton>
                    <ActionButton
                      variant="accent"
                      icon={t("icon_navigate_next", "navigate_next")}
                      disabled={guideStepIdx >= citizenSteps.length - 1}
                      onClick={() =>
                        setGuideStepIdx((prev) =>
                          Math.min(citizenSteps.length - 1, prev + 1)
                        )
                      }
                    >
                      {t("sd_btn_next_step", "Next Module")}
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mode 3: 6-Tier Role Hierarchy & Open Workshop Inheritance */}
        {guideMode === "roles" && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="w-fit px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_admin_panel_settings", "admin_panel_settings")}
              </span>
              {t(
                "dir_proto_matrix_badge",
                "6-TIER CLEARANCE & INHERITANCE MATRIX"
              )}
            </span>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)] leading-snug">
              {t(
                "dir_guide_s11_title",
                "6-Tier Role Hierarchy & Passkey Command Hubs"
              )}
            </h2>

            <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
              {t(
                "dir_guide_s11_desc",
                "Every Citizen automatically inherits the local Open Mason Workshop with zero passkey friction, while Verified Masons and Community Command Hubs are protected by hardware FIDO2 WebAuthn Passkeys."
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {elevatedRoles.map((role, rIdx) => (
                <div
                  key={`${role.short}-${rIdx}`}
                  className="glass-surface rounded-2xl p-4 flex flex-col gap-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2 py-0.5 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-md flex items-center gap-1">
                      <span className="material-symbols-outlined !text-[12px]">
                        {role.icon}
                      </span>
                      {role.badge}
                    </span>
                    <span
                      className={`px-2 py-0.5 bg-transparent border text-[8px] font-black uppercase tracking-widest rounded-md flex items-center gap-1 ${
                        role.requiresPasskey
                          ? "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                          : "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[11px]">
                        {role.requiresPasskey
                          ? t("icon_passkey", "passkey")
                          : t("icon_check_circle", "check_circle")}
                      </span>
                      {role.requiresPasskey
                        ? t("auth_passkey_badge_fido", "FIDO2 PASSKEY")
                        : t("dir_proto_r1_role", "Citizen")}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-[var(--text)]">
                    {role.title}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                    {role.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Interactive Phase Roadmap Timeline (3 Static Top Tiles + Collapsible Reverse-Chronological Timeline)
  const renderInteractiveRoadmap = () => {
    const filteredPhases = roadmapPhases.filter((p) => {
      if (roadmapFilter === "active") return p.status === "active";
      if (roadmapFilter === "completed") return p.status === "completed";
      return true;
    });

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Static Top Filter Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_timeline", "timeline")}
            label={t("dir_roadmap_tile_all", "All Phases")}
            number="12"
            colorClass="text-[var(--accent)]"
            isActive={roadmapFilter === "all"}
            onClick={() => setRoadmapFilter("all")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_rocket_launch", "rocket_launch")}
            label={t("dir_roadmap_tile_active", "Active Phase")}
            number="1"
            colorClass="text-[var(--accent)]"
            isActive={roadmapFilter === "active"}
            onClick={() => setRoadmapFilter("active")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_check_circle", "check_circle")}
            label={t("dir_roadmap_tile_done", "Completed")}
            number="11"
            colorClass="text-[var(--success)]"
            isActive={roadmapFilter === "completed"}
            onClick={() => setRoadmapFilter("completed")}
          />
        </div>

        {/* Reverse-Chronological Vertical Timeline (Collapsed by default minus Active Phase) */}
        <div className="relative flex flex-col gap-4 pl-6 sm:pl-8">
          <div className="pointer-events-none absolute left-2.5 sm:left-3.5 top-4 bottom-4 w-0.5 bg-gradient-to-b from-[var(--accent)] via-[var(--success)] to-transparent opacity-70" />

          {filteredPhases.map((phase) => {
            const isActivePhase = phase.status === "active";
            const isExpanded = selectedPhaseNum === phase.num;

            return (
              <div key={phase.code} className="relative flex flex-col">
                {/* Timeline Spine Node Marker */}
                <div
                  onClick={() =>
                    setSelectedPhaseNum(isExpanded ? 0 : phase.num)
                  }
                  className={`absolute -left-6 sm:-left-8 top-4 w-6 h-6 sm:w-7 sm:h-7 rounded-xl glass-panel flex items-center justify-center cursor-pointer z-10 border ${
                    isActivePhase
                      ? "border-[color-mix(in_srgb,var(--accent)_65%,transparent)] text-[var(--accent)]"
                      : "border-[color-mix(in_srgb,var(--success)_55%,transparent)] text-[var(--success)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {phase.icon}
                  </span>
                </div>

                {/* Phase Timeline Card */}
                <div
                  onClick={() =>
                    setSelectedPhaseNum(isExpanded ? 0 : phase.num)
                  }
                  className={`glass-panel rounded-3xl p-4 sm:p-5 flex flex-col gap-3 cursor-pointer transition-all border ${
                    isExpanded
                      ? isActivePhase
                        ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 bg-transparent border text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5 ${
                          isActivePhase
                            ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {phase.icon}
                        </span>
                        {phase.code}
                      </span>
                      <span className="text-xs font-bold text-[var(--subtext)] opacity-85">
                        {phase.sub}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 bg-transparent border text-[9px] font-black uppercase tracking-widest rounded-lg ${
                          isActivePhase
                            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                        }`}
                      >
                        {isActivePhase
                          ? t("sd_roadmap_status_active", "ACTIVE PHASE")
                          : t("sd_roadmap_status_completed", "COMPLETED")}
                      </span>
                      <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] opacity-70">
                        {isExpanded
                          ? t("icon_expand_less", "expand_less")
                          : t("icon_expand_more", "expand_more")}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--text)] leading-snug">
                    {phase.title}
                  </h3>

                  {isExpanded && (
                    <>
                      <p className="text-xs text-[var(--text)] opacity-85 leading-relaxed">
                        {phase.desc}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {phase.milestones.map((m, mIdx) => (
                          <div
                            key={mIdx}
                            className="glass-surface rounded-2xl p-3.5 flex items-start gap-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          >
                            <span className="material-symbols-outlined !text-[15px] text-[var(--success)] shrink-0 mt-0.5">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                            <span className="text-xs text-[var(--text)] opacity-90 leading-relaxed">
                              {m}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render Interactive Forking & Spoke Provisioning Guide (3 Static Top Tiles + 1 Clean Hero Card — Zero Scrolling Tiles)
  const renderInteractiveForking = () => {
    const spokeSqlLineCount = SPOKE_SCHEMA_SQL.split(/\r?\n/).length;
    const hubSqlLineCount = HUB_SCHEMA_SQL.split(/\r?\n/).length;

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
            label={t("dir_fk_t2_lbl", "STEP 2")}
            number={t("dir_fk_t2_val", "1-File Fork")}
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

        {forkTab === "spoke" && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="w-fit px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_hub", "hub")}
              </span>
              {t(
                "sd_fork_spoke_hero_badge",
                "OFFICIAL PARTNER NETWORK • ZERO CODE EDITS"
              )}
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)]">
              {t(
                "sd_fork_spoke_hero_title",
                "Connect a Sovereign Community Spoke in 3 Steps"
              )}
            </h2>
            <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
              {t(
                "sd_fork_spoke_hero_desc",
                "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="text-xs font-black text-[var(--accent)]">
                  {t(
                    "sd_fork_spoke_step1_title",
                    "Step 1: Initialize Your Supabase Spoke (schema.sql)"
                  )}
                </span>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_spoke_step1_desc",
                    "Create a free Supabase project, open the SQL Editor, and run schema.sql. This single script provisions all 36 community tables, RLS policies, immutable audit triggers, and role functions."
                  )}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="text-xs font-black text-[var(--accent)]">
                  {t(
                    "sd_fork_spoke_step2_title",
                    "Step 2: Generate Your SANCTUARY-UPLINK:// Bundle"
                  )}
                </span>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_spoke_step2_desc",
                    "In Keepers Core -> Active Workspaces (or Wayfinder Hub), paste your Supabase URL, Anon Key, and Service Role Key to generate an encrypted SANCTUARY-UPLINK:// handshake bundle."
                  )}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="text-xs font-black text-[var(--accent)]">
                  {t(
                    "sd_fork_spoke_step3_title",
                    "Step 3: Verify Handshake & Provision Founding Wayfinder"
                  )}
                </span>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_spoke_step3_desc",
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--warning)]">
                    {t("icon_link_off", "link_off")}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[var(--text)]">
                    {t(
                      "sd_fork_cord_community_title",
                      "Community-Initiated Severance (Wayfinder Hub)"
                    )}
                  </span>
                </div>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_cord_community_desc",
                    "A Wayfinder can double-click 'Cut the Cord' in Wayfinder Hub -> Spoke Uplink & Sovereignty at any time. This writes an immutable audit log, sets is_active = false on the Hub, and permanently scrubs (NULLs) the Spoke's supabase_service_key from the Hub while leaving 100% of the community's database intact."
                  )}
                </p>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--success)_35%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--success)]">
                    {t("icon_verified", "verified")}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[var(--text)]">
                    {t(
                      "sd_fork_cord_keeper_title",
                      "Zero Platform Tax & 100% Data Ownership"
                    )}
                  </span>
                </div>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_cord_keeper_desc",
                    "Sanctuary OS takes 0% of creator Patreon/Ko-fi revenue and 0% of community donations. Export your SANCTUARY-UPLINK:// bundle before severing to paste directly into a standalone fork."
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {forkTab === "standalone" && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="w-fit px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_call_split", "call_split")}
              </span>
              {t(
                "sd_fork_standalone_hero_badge",
                "TRUE CODEBASE FORK • EDIT ONLY SRC/SUPABASE.TS"
              )}
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)]">
              {t(
                "sd_fork_standalone_hero_title",
                "Launch an Independent Standalone Fork with 1 Database"
              )}
            </h2>
            <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
              {t(
                "sd_fork_standalone_hero_desc",
                "Want to run your own completely independent build of Sanctuary OS—or transition an existing Spoke after clicking Cut the Cord? You only need a single Supabase database (schema.sql) and a 1-file edit in src/supabase.ts. Zero Edge Functions required."
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="text-xs font-bold text-[var(--text)]">
                  {t(
                    "sd_fork_standalone_s1_title",
                    "1. Unified Auth & Direct RPC Engine"
                  )}
                </span>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_standalone_s1_desc",
                    "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
                  )}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="text-xs font-bold text-[var(--text)]">
                  {t(
                    "sd_fork_standalone_s2_title",
                    "2. Automatic Founding Wayfinder Promotion"
                  )}
                </span>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_standalone_s2_desc",
                    "The on_auth_user_created_spoke trigger in schema.sql detects when your standalone database has 0 Wayfinders and automatically promotes the very first registered user to Founding Wayfinder."
                  )}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="text-xs font-bold text-[var(--text)]">
                  {t(
                    "sd_fork_standalone_s3_title",
                    "3. Transparent OS-to-Spoke Table Mapping"
                  )}
                </span>
                <p className="text-xs text-[var(--subtext)] leading-relaxed">
                  {t(
                    "sd_fork_standalone_s3_desc",
                    "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
                  )}
                </p>
              </div>
            </div>

            <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="px-2.5 py-0.5 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-md">
                  {t(
                    "sd_fork_standalone_opt_b",
                    "Option B: Manual Standalone Config"
                  )}{" "}
                  • sanctuary-os/src/supabase.ts
                </span>
                <ActionButton
                  variant="glass"
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
                    ? t("sd_btn_copied", "Copied to Clipboard!")
                    : t("sd_btn_copy_snippet", "Copy Code Snippet")}
                </ActionButton>
              </div>
              <pre className="text-xs font-mono text-[var(--text)] opacity-90 overflow-x-auto custom-scrollbar leading-relaxed">
                <code>{STANDALONE_MANUAL_SNIPPET}</code>
              </pre>
            </div>
          </div>
        )}

        {forkTab === "sql" && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="w-fit px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_database", "database")}
              </span>
              {t(
                "dir_fork_sql_badge",
                "TURNKEY POSTGRESQL PROVISIONING"
              )}
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)]">
              {t(
                "dir_fork_sql_title",
                "Complete SQL Schemas (Spoke & Core Hub)"
              )}
            </h2>
            <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
              {t(
                "dir_fork_sql_desc",
                "Copy or inspect the complete PostgreSQL provisioning scripts directly. Run schema.sql for Partner Spokes and Standalone Forks; run schema_os.sql only if operating a multi-game Hub."
              )}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--success)_30%,transparent)]">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_storage", "storage")}
                      </span>
                      {t("dir_fork_sql_spoke_val", "schema.sql (36 Tables)")}
                    </span>
                    <span className="px-2 py-0.5 bg-transparent border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--subtext)] text-[9px] font-mono rounded-md">
                      {spokeSqlLineCount} {t("dir_fork_sql_lines", "Lines")}
                    </span>
                  </div>

                  <ActionButton
                    variant="accent"
                    icon={
                      copiedId === "sql_spoke"
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_content_copy", "content_copy")
                    }
                    onClick={() =>
                      handleCopyCode("sql_spoke", SPOKE_SCHEMA_SQL)
                    }
                  >
                    {copiedId === "sql_spoke"
                      ? t("dir_fork_sql_copied", "SQL Copied")
                      : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                  </ActionButton>
                </div>
                <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[260px] overflow-y-auto custom-scrollbar leading-relaxed p-2 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)]">
                  <code>{SPOKE_SCHEMA_SQL}</code>
                </pre>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_memory", "memory")}
                      </span>
                      {t("dir_fork_sql_hub_val", "schema_os.sql (Hub DB)")}
                    </span>
                    <span className="px-2 py-0.5 bg-transparent border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--subtext)] text-[9px] font-mono rounded-md">
                      {hubSqlLineCount} {t("dir_fork_sql_lines", "Lines")}
                    </span>
                  </div>

                  <ActionButton
                    variant="accent"
                    icon={
                      copiedId === "sql_hub"
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_content_copy", "content_copy")
                    }
                    onClick={() => handleCopyCode("sql_hub", HUB_SCHEMA_SQL)}
                  >
                    {copiedId === "sql_hub"
                      ? t("dir_fork_sql_copied", "SQL Copied")
                      : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                  </ActionButton>
                </div>
                <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[260px] overflow-y-auto custom-scrollbar leading-relaxed p-2 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)]">
                  <code>{HUB_SCHEMA_SQL}</code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Expanded Interactive Master Architecture Explorer (Single 4-Pillar StatTileCarousel + 1 Hero Card)
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
        badge: t(
          "dir_arch_p3_badge",
          "ARCHITECTURE PILLAR 3 • VAULT, AIRGAP & DEFENSE"
        ),
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
            desc: t(
              "dir_arch_p3_b1",
              "Symlink Airgap 2.5 projects mods from Vault/Mods/ into the live game folder, grouping multi-file mod suites into expandable Parent Cards"
            ),
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
            title: t(
              "sd_roadmap_p7_title",
              "Citizen's Workbench & Open Mason Workshop"
            ),
            desc: t(
              "dir_arch_p3_b3",
              "Reimagined 2-Column Citizen's Workbench (430+ settings at 60 FPS), No-Code Visual Template Builder, 2-Column Timeline Diff & Unified 3-Tile Artifact Studio"
            ),
          },
          {
            icon: t("icon_science", "science"),
            title: t(
              "sd_arch_logic_c3_title",
              "Homestead Lab 100% Nuke & 1v1 Stability"
            ),
            desc: t(
              "dir_arch_p3_b4",
              "Homestead 100% Nuke & 1v1 Stability Lab + Time Capsule incremental NTFS/POSIX hardlink snapshots (.tar.zst) with differential rollback"
            ),
          },
          {
            icon: t("icon_passkey", "passkey"),
            title: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP Vault"),
            desc: t(
              "dir_arch_p4_b2",
              "FIDO2 Passkey & TOTP Security Vault SidePanel locks Elevated Hubs until verified via Windows Hello, Touch ID, YubiKey, or Authenticator"
            ),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t(
              "dir_walk_s7_c3_name",
              "Quarantine SidePanel OS Lockdown"
            ),
            desc: t(
              "dir_arch_p4_b4",
              "Full-OS Quarantine SidePanel Lockdown queues multi-file drops without freezing, shows Triggered By & Detection Source diagnostics, and enforces Citizen-signed Secure Shred"
            ),
          },
        ],
      },
    };

    const activePillar = pillarMeta[archTab] || pillarMeta.p1;

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
            number={t("dir_ar_t3_val", "Vault & Lab")}
            colorClass="text-[var(--accent)]"
            isActive={archTab === "p3"}
            onClick={() => setArchTab("p3")}
          />
        </div>

        {/* Single Unified Hero Container Below 1x3 Tiles */}
        <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <span className="w-fit px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
            <span className="material-symbols-outlined !text-[13px]">
              {activePillar.icon}
            </span>
            {activePillar.badge}
          </span>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)] leading-snug">
            {activePillar.heading}
          </h2>

          <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
            {activePillar.summary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {activePillar.cards.map((c, idx) => (
              <div
                key={`${c.title}-${idx}`}
                className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                      {c.icon}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--text)] leading-snug">
                    {c.title}
                  </h3>
                </div>
                <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Render Interactive Master Protocol & Clearance Matrix (3 Static Top Tiles + 1 Unified Hero Card — Zero Scrolling Tiles)
  const renderInteractiveProtocols = () => {
    const complianceTiers = [
      {
        badge: t("sd_proto_tier0_badge", "TIER 0 • PUBLIC SAFE"),
        title: t("sd_proto_tier0_title", "Standard Verified & General Audience"),
        desc: t(
          "sd_proto_tier0_desc",
          "Eligible for full public indexing across The Nexus, shared Cloud Blueprints (SNCXXX), and public Mason Profiles. Full Citizen Support Desk access."
        ),
        colorClass:
          "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]",
        icon: t("icon_check_circle", "check_circle"),
      },
      {
        badge: t("sd_proto_tier12_badge", "TIERS 1–2 • EXPLICIT / ILLICIT"),
        title: t(
          "sd_proto_tier12_title",
          "Adult (NSFW) & Illicit Themes — Local Allowed, Public Scrubbed"
        ),
        desc: t(
          "sd_proto_tier12_desc",
          "Permitted in local Vaults and decentralized Static Edge manifests. Automatically scrubbed from public Nexus feeds and stripped from public Cloud Blueprints (trg_purge_flagged_hash_from_blueprints). Eligible for Support Desk with automated 'Dirty Log' sanitization."
        ),
        colorClass:
          "border-[color-mix(in_srgb,var(--info)_45%,transparent)] text-[var(--info)]",
        icon: t("icon_visibility_off", "visibility_off"),
      },
      {
        badge: t("sd_proto_tier34_badge", "TIERS 3–4 • SEVERE / RESTRICTED"),
        title: t(
          "sd_proto_tier34_title",
          "Extreme Violence & Taboo Content — Triggers Vault Lock"
        ),
        desc: t(
          "sd_proto_tier34_desc",
          "Permitted strictly within isolated local Vaults. Scrubbed from all public feeds and Cloud Blueprints. Equipping or storing Tier 3–4 artifacts engages a Vault Lock that restricts Citizen Support Desk ticket submissions until removed."
        ),
        colorClass:
          "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]",
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
        icon: t("icon_gpp_bad", "gpp_bad"),
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
        icon: t("icon_policy", "policy"),
      },
    ];

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

        {protoTab === "roles" && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="w-fit px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_admin_panel_settings", "admin_panel_settings")}
              </span>
              {t(
                "dir_proto_roles_hero_badge",
                "6-TIER ROLE HIERARCHY • CITIZEN TO KEEPER"
              )}
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)] leading-snug">
              {t(
                "dir_proto_roles_hero_title",
                "Role Clearances, Open Workshop Inheritance & FIDO2 Passkey Gates"
              )}
            </h2>
            <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
              {t(
                "dir_proto_roles_hero_desc",
                "Citizens inherit the complete local Mason Workshop (Sandbox, Mason IDE, 3-Tile Studio, Theme Forge, Static Edge packaging) with zero passkey requirement. Verified Masons and Community Command Hubs require a bound FIDO2 Passkey."
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {elevatedRoles.map((role, idx) => (
                <div
                  key={idx}
                  className="glass-surface rounded-2xl p-4 flex flex-col gap-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2 py-0.5 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-md flex items-center gap-1">
                      <span className="material-symbols-outlined !text-[12px]">
                        {role.icon}
                      </span>
                      {role.badge}
                    </span>
                    <span
                      className={`px-2 py-0.5 bg-transparent border text-[8px] font-black uppercase tracking-widest rounded-md flex items-center gap-1 ${
                        role.requiresPasskey
                          ? "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                          : "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[11px]">
                        {role.requiresPasskey
                          ? t("icon_passkey", "passkey")
                          : t("icon_check_circle", "check_circle")}
                      </span>
                      {role.requiresPasskey
                        ? t("auth_passkey_badge_fido", "FIDO2 PASSKEY")
                        : t("dir_proto_r1_role", "Citizen")}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-[var(--text)]">
                    {role.title}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                    {role.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {protoTab === "compliance" && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="w-fit px-2.5 py-1 bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_shield", "shield")}
              </span>
              {t(
                "dir_proto_tiers_hero_badge",
                "COMPLIANCE TIERS 0–5 • AUTOMATED DEFENSE MATRIX"
              )}
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)] leading-snug">
              {t(
                "dir_proto_tiers_hero_title",
                "Public Feed Safety, Local Vault Autonomy & Malware Lockdown"
              )}
            </h2>
            <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed">
              {t(
                "dir_proto_tiers_hero_desc",
                "Sanctuary OS balances uncompromised public feed safety with local Vault freedom—allowing Adult/NSFW mods locally while automatically scrubbing public feeds and enforcing a full-OS Quarantine Lockdown on confirmed Tier 5 Malware."
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {complianceTiers.map((tier, idx) => (
                <div
                  key={idx}
                  className={`glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${
                    idx === complianceTiers.length - 1 ? "md:col-span-2" : ""
                  }`}
                >
                  <span
                    className={`w-fit px-2.5 py-0.5 bg-transparent border text-[9px] font-black uppercase tracking-widest rounded-md flex items-center gap-1.5 ${tier.colorClass}`}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {tier.icon}
                    </span>
                    {tier.badge}
                  </span>
                  <h3 className="text-sm font-black text-[var(--text)]">
                    {tier.title}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                    {tier.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {protoTab === "list" && (
          <StructuredReleaseNotesView
            content={
              directivesMap.master_protocols?.content || bundledProtocolList
            }
          />
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
          title={t(
            "sd_card_guide_title",
            "Interactive Citizen Guide & OS Walkthrough"
          )}
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
            {t(
              "sd_card_guide_desc",
              "Step-by-step interactive walkthrough of Sanctuary OS—from Cartographer setup, Symlink Vault & Load Order compilation, to Homestead Lab testing, Time Capsule snapshots, and Elevated Clearances."
            )}
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
            {t(
              "sd_card_fork_desc",
              "Interactive blueprint for launching a Sovereign Community Spoke (SANCTUARY-UPLINK://) or a 1-file Standalone Codebase Fork (src/supabase.ts), plus Dynamic Game Schemas and Cut the Cord."
            )}
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
        noPadding={true}
        noScroll={true}
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
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
          <div className="px-4 sm:px-8 md:px-10 pb-36 pt-8 gap-6 flex flex-col flex-1 relative z-20">
            {/* Author Identity Header matching ReleaseNotesShowcase */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5 relative z-20">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,var(--surface))] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] shadow-inner">
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_memory", "memory")}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 z-20 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base sm:text-lg font-black capitalize tracking-tight text-[var(--text)] leading-tight">
                      {t("author_sanctuary_team", "Sanctuary Foundry")}
                    </span>
                    <span className="relative inline-flex items-center cursor-default">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                        {t("icon_verified", "verified")}
                      </span>
                      <HoverTooltip
                        title={t("verified", "Verified")}
                        icon={t("icon_verified", "verified")}
                        variant="default"
                      />
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[var(--subtext)] opacity-85">
                    {t(
                      "sd_panel_author_sub",
                      "Core System Directives & Interactive Documentation"
                    )}
                  </span>
                </div>
              </div>
            </div>

            {showRawDoc ? (
              <StructuredReleaseNotesView content={activeReferenceMarkdown} />
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
