import { useState, useEffect, useMemo, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { supabaseAuth } from "../supabase";
import { useStore } from "../store";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  EmptyState,
  stripMarkdown,
} from "../shared";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { UniversalCard } from "../components/universal/UniversalCard";
import { SidePanelHeroCard, UniversalGroup } from "../components/layouts/ElevatedHubLayout";
import { extractDispatchMetadata } from "../components/universal/DispatchPollAndMeta";
import { StructuredReleaseNotesView } from "../components/release-notes/ReleaseMarkdownViewer";
import { type ForkTabId } from "../components/InteractiveForkingGuideView";
import bundledCitizenGuide from "../../../Citizen Guide.md?raw";
import bundledRoadmapDoc from "../../../Phase Roadmap.md?raw";
import bundledForkingGuide from "../../../Sanctuary OS Forking & Architecture Guide.md?raw";
import bundledArchitectureDoc from "../../../Master Architecture & Feature Document.md?raw";
import bundledProtocolList from "../../../Master Protocol List.md?raw";
import docPartnerSpokePitch from "../../../Docs/executive_partner_spoke_pitch_matrix.md?raw";
import docCompetitorComparison from "../../../Docs/modding_ecosystem_competitor_comparison.md?raw";
import docWhySwitch from "../../../Docs/public_comparison_page_why_switch_to_sanctuary_os.md?raw";
import docTechnicalDeepDive from "../../../Docs/technical_deep_dive_formats_malware_cloud_traps.md?raw";
import docMigrationGuide from "../../../Docs/zero_reinstall_player_creator_migration_guide.md?raw";
import {
  syncDirectivesBidirectional,
  SystemDirectiveRecord,
  DirectiveSlug,
} from "../utils/directivesSync";
import {
  extractDirectiveBuilderSchema,
  stripDirectiveBuilderComment,
  getDefaultDirectiveBuilderSchema,
} from "../utils/directivesBuilderSchema";

type DirectiveModuleId =
  | "guide"
  | "roadmap"
  | "forking"
  | "architecture"
  | "protocols";

import { useWebDirectiveCatalogs } from "../components/web-docs/webDirectiveCatalogData";
import { WebGuideView, WebRoadmapView } from "../components/web-docs/WebGuideAndRoadmapViews";
import { WebForkingView, WebArchitectureView, WebProtocolsView } from "../components/web-docs/WebArchitectureAndProtocolsViews";
export default function WebDocumentFeed({
  searchQuery = "",
  moduleFilter = "ALL",
}: {
  searchQuery?: string;
  moduleFilter?: string;
} = {}) {
  const { t, td } = useLexicon();
  const session = useStore((state: any) => state.session);
  const [posts, setPosts] = useState<any[]>([]);
  const [directivesMap, setDirectivesMap] = useState<
     Partial<Record<DirectiveSlug, SystemDirectiveRecord>>
  >({});
  const [selectedPost, setSelectedPost] = useState<any>(null);

  // Active Interactive Directive SidePanel State
  const [activeModule, setActiveModule] = useState<DirectiveModuleId | null>(null);
  const [showRawDoc, setShowRawDoc] = useState(false);
  const [activeWhitepaperId, setActiveWhitepaperId] = useState<string | null>(null);

  // 1. Citizen Guide & Neural Walkthrough State (3 Static Top Tiles + 2-Column Cards with Inline Drawer)
  const [guideMode, setGuideMode] = useState<"walkthrough" | "modules" | "roles">("walkthrough");
  const [walkIdx, setWalkIdx] = useState(0);
  const [guideStepIdx, setGuideStepIdx] = useState(0);
  const [roleTierIdx, setRoleTierIdx] = useState(0);

  // 2. Phase Roadmap Timeline State (3 Static Top Tiles + 2-Column Cards with Inline Drawer)
  const [roadmapFilter, setRoadmapFilter] = useState<"all" | "active" | "completed">("all");
  const [selectedPhaseNum, setSelectedPhaseNum] = useState<number>(14);

  // 3. Forking & Spoke Provisioning Guide State (4 Static Top Tiles)
  const [forkTab, setForkTab] = useState<ForkTabId>("spoke");
  const [forkModeIdx, setForkModeIdx] = useState<number>(0);
  const [sqlSchemaTab, setSqlSchemaTab] = useState<"spoke" | "hub">("spoke");

  // 4. Master Architecture Explorer State (4 Static Top Tiles)
  const [archTab, setArchTab] = useState<"p1" | "p2" | "p3" | "p4">("p1");

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
          canWriteHub: false,
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
    window.addEventListener("focus", handleRefresh);
    return () => {
      window.removeEventListener("sanctuary_directives_updated", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, []);

  const openDirectiveModule = (modId: DirectiveModuleId) => {
    setShowRawDoc(false);
    setActiveModule(modId);
  };

  const { citizenSteps, walkthroughStages, elevatedRoles, roadmapPhases } = useWebDirectiveCatalogs(t);

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

  // Resolve matching raw reference document (renders published_content snapshot so User side only updates on explicit Publish)
  const activeReferenceMarkdown = useMemo(() => {
    if (!activeModule) return "";
    let raw = "";
    if (activeModule === "guide") {
      raw =
        directivesMap.citizen_guide?.published_content ||
        directivesMap.citizen_guide?.content ||
        bundledCitizenGuide;
    } else if (activeModule === "roadmap") {
      raw =
        directivesMap.phase_roadmap?.published_content ||
        directivesMap.phase_roadmap?.content ||
        bundledRoadmapDoc;
    } else if (activeModule === "forking") {
      raw =
        directivesMap.forking_guide?.published_content ||
        directivesMap.forking_guide?.content ||
        bundledForkingGuide;
    } else if (activeModule === "architecture") {
      raw =
        directivesMap.master_architecture?.published_content ||
        directivesMap.master_architecture?.content ||
        bundledArchitectureDoc;
    } else if (activeModule === "protocols") {
      raw =
        directivesMap.master_protocols?.published_content ||
        directivesMap.master_protocols?.content ||
        bundledProtocolList;
    }
    return stripDirectiveBuilderComment(raw);
  }, [activeModule, directivesMap]);

  // Extract published Keepers Core Visual Builder / Live Markdown schemas for the User side
  const customGuideSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(
        directivesMap.citizen_guide?.published_content ||
          directivesMap.citizen_guide?.content ||
          bundledCitizenGuide,
        "citizen_guide",
        t
      ) || getDefaultDirectiveBuilderSchema("citizen_guide", t),
    [
      directivesMap.citizen_guide?.published_content,
      directivesMap.citizen_guide?.content,
      t,
    ]
  );
  const customRoadmapSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(
        directivesMap.phase_roadmap?.published_content ||
          directivesMap.phase_roadmap?.content ||
          bundledRoadmapDoc,
        "phase_roadmap",
        t
      ) || getDefaultDirectiveBuilderSchema("phase_roadmap", t),
    [
      directivesMap.phase_roadmap?.published_content,
      directivesMap.phase_roadmap?.content,
      t,
    ]
  );

  const topRoadmapPhaseNum = useMemo(() => {
    const cards =
      customRoadmapSchema?.tabs?.find(
        (tab) => tab.id === "all" || tab.id === "phases"
      )?.cards ||
      customRoadmapSchema?.tabs?.[0]?.cards ||
      [];
    if (cards.length === 0) return 14;
    const idMatch = (cards[0]?.id || "").match(/^phase_(\d+)$/i);
    if (idMatch) return parseInt(idMatch[1], 10);
    const firstMatch = (cards[0]?.overline || cards[0]?.title || "").match(
      /\bPhase\s+(\d+)/i
    );
    return firstMatch ? parseInt(firstMatch[1], 10) : cards.length;
  }, [customRoadmapSchema]);

  const lastTopRoadmapPhaseRef = useRef<number>(topRoadmapPhaseNum);
  useEffect(() => {
    if (lastTopRoadmapPhaseRef.current !== topRoadmapPhaseNum) {
      lastTopRoadmapPhaseRef.current = topRoadmapPhaseNum;
      if (roadmapFilter !== "completed") {
        setSelectedPhaseNum(topRoadmapPhaseNum);
      }
    }
  }, [topRoadmapPhaseNum, roadmapFilter]);
  const customForkSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(
        directivesMap.forking_guide?.published_content ||
          directivesMap.forking_guide?.content ||
          bundledForkingGuide,
        "forking_guide",
        t
      ) || getDefaultDirectiveBuilderSchema("forking_guide", t),
    [
      directivesMap.forking_guide?.published_content,
      directivesMap.forking_guide?.content,
      t,
    ]
  );
  const customArchSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(
        directivesMap.master_architecture?.published_content ||
          directivesMap.master_architecture?.content ||
          bundledArchitectureDoc,
        "master_architecture",
        t
      ) || getDefaultDirectiveBuilderSchema("master_architecture", t),
    [
      directivesMap.master_architecture?.published_content,
      directivesMap.master_architecture?.content,
      t,
    ]
  );
  const customProtoSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(
        directivesMap.master_protocols?.published_content ||
          directivesMap.master_protocols?.content ||
          bundledProtocolList,
        "master_protocols",
        t
      ) || getDefaultDirectiveBuilderSchema("master_protocols", t),
    [
      directivesMap.master_protocols?.published_content,
      directivesMap.master_protocols?.content,
      t,
    ]
  );

  const activePanelMeta = useMemo(() => {
    switch (activeModule) {
      case "guide":
        return {
          title: td(
            customGuideSchema?.title ||
              t(
                "sd_card_guide_title",
                "Interactive {Citizen} Guide & OS Walkthrough"
              )
          ),
          subtitle: t(
            "sd_card_guide_sub",
            "Guided OS Tour • {Citizen} & Elevated Clearances"
          ),
          description: td(
            customGuideSchema?.summary ||
              directivesMap.citizen_guide?.published_summary ||
              directivesMap.citizen_guide?.summary ||
              t(
                "sd_card_guide_desc",
                "10-stage interactive walkthrough of Sanctuary OS, 12 operational & creator modules (including Static Edge Direct Push, Master Schema & Lexicon Studios, and Spoke Covenants), and the 6-Tier Clearance Hierarchy."
              )
          ),
          icon: t("icon_school", "school"),
        };
      case "roadmap":
        return {
          title: td(
            customRoadmapSchema?.title ||
              t("sd_card_roadmap_title", "Sanctuary OS Phase Roadmap")
          ),
          subtitle: `${t("dir_roadmap_tab_value", "Evolution Timeline")} • ${t("dir_phase_word", "Phase")} ${topRoadmapPhaseNum} ${t("active", "Active")}`,
          description: td(
            customRoadmapSchema?.summary ||
              directivesMap.phase_roadmap?.published_summary ||
              directivesMap.phase_roadmap?.summary ||
              t(
                "sd_card_roadmap_desc",
                "Reverse-chronological engineering timeline tracking Sanctuary OS from Phase 14 (V0.6.0 Agnostic Multi-Engine Expansion) down to Phase 1."
              )
          ),
          icon: t("icon_timeline", "timeline"),
        };
      case "forking":
        return {
          title: td(
            customForkSchema?.title ||
              t("sd_card_fork_title", "Forking & Spoke Provisioning Guide")
          ),
          subtitle: t(
            "sd_card_fork_sub",
            "Standalone Codebase Fork & Partner Uplink"
          ),
          description: td(
            customForkSchema?.summary ||
              directivesMap.forking_guide?.published_summary ||
              directivesMap.forking_guide?.summary ||
              t(
                "sd_card_fork_desc",
                "Interactive {blueprint} for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), reviewing Partner Covenants, launching a 1-file Standalone Codebase Fork (src/supabase.ts), or building cross-platform Master Schemas."
              )
          ),
          icon: t("icon_call_split", "call_split"),
        };
      case "architecture":
        return {
          title: td(
            customArchSchema?.title ||
              t("sd_card_arch_title", "Master Architecture & Engine Systems")
          ),
          subtitle: t("sd_card_arch_sub", "Hub-and-Spoke Federation & Rust Core"),
          description: td(
            customArchSchema?.summary ||
              directivesMap.master_architecture?.published_summary ||
              directivesMap.master_architecture?.summary ||
              t(
                "sd_card_arch_desc",
                "Deep-dive interactive explorer into the Tauri v2 Rust core, Hub-and-Spoke database federation, Offline Codebase Baseline + Live Cloud Sync, Symlink Airgap 2.5, Static Edge Auto-Push, and Bytecode Hound Core + Spoke Heuristics."
              )
          ),
          icon: t("icon_architecture", "architecture"),
        };
      case "protocols":
      default:
        return {
          title: td(
            customProtoSchema?.title ||
              t("sd_card_proto_title", "Master Protocol & Clearance Matrix")
          ),
          subtitle: t(
            "sd_card_proto_sub",
            "Governance, Security & Compliance Tiers"
          ),
          description: td(
            customProtoSchema?.summary ||
              directivesMap.master_protocols?.published_summary ||
              directivesMap.master_protocols?.summary ||
              t(
                "sd_card_proto_desc",
                "Interactive directory of all 30 Sanctuary OS operational protocols across 4 domains, Florida Compliance Tiers 0–5, Bytecode Hound Core + Spoke Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy."
              )
          ),
          icon: t("icon_policy", "policy"),
        };
    }
  }, [
    activeModule,
    customGuideSchema?.title,
    customGuideSchema?.summary,
    customRoadmapSchema?.title,
    customRoadmapSchema?.summary,
    customForkSchema?.title,
    customForkSchema?.summary,
    customArchSchema?.title,
    customArchSchema?.summary,
    customProtoSchema?.title,
    customProtoSchema?.summary,
    directivesMap,
    topRoadmapPhaseNum,
    t,
    td,
  ]);

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

  const guideWalkCount =
    customGuideSchema?.tabs.find((tb) => tb.id === "walkthrough")?.cards
      .length || 10;
  const guideModCount =
    customGuideSchema?.tabs.find((tb) => tb.id === "modules")?.cards.length ||
    12;
  const roadmapPhaseCount =
    customRoadmapSchema?.tabs[0]?.cards.length || 14;
  const forkTotalTabs = customForkSchema?.tabs.length || 3;
  const forkTotalCards =
    customForkSchema?.tabs.reduce((acc, tb) => acc + (tb.cards?.length || 0), 0) ||
    7;
  const archSubCardCount =
    customArchSchema?.tabs.reduce(
      (acc, tb) =>
        acc +
        (tb.cards || []).reduce(
          (cAcc, c) => cAcc + (c.subCards?.length || 0),
          0
        ),
      0
    ) || 18;
  const protoDomainTab = customProtoSchema?.tabs.find((tb) => tb.id === "list");
  const protoDomainCount = protoDomainTab?.cards.length || 5;
  const protoRuleCount =
    protoDomainTab?.cards.reduce(
      (acc, c) => acc + (c.subCards?.length || 0),
      0
    ) || 36;

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesModuleCard = (
    modId: DirectiveModuleId,
    title: string,
    summary: string,
    extraKeywords: string
  ) => {
    if (moduleFilter && moduleFilter !== "ALL" && moduleFilter !== modId) {
      return false;
    }
    if (!normalizedSearch) return true;
    return `${title} ${summary} ${extraKeywords}`
      .toLowerCase()
      .includes(normalizedSearch);
  };

  const showGuideCard = matchesModuleCard(
    "guide",
    customGuideSchema?.title ||
      directivesMap.citizen_guide?.title ||
      t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough"),
    customGuideSchema?.summary ||
      directivesMap.citizen_guide?.summary ||
      t(
        "sd_card_guide_desc",
        "Step-by-step interactive walkthrough of Sanctuary OS"
      ),
    "citizen guide tutorial walkthrough modules roles"
  );
  const showRoadmapCard = matchesModuleCard(
    "roadmap",
    customRoadmapSchema?.title ||
      directivesMap.phase_roadmap?.title ||
      t("sd_card_roadmap_title", "Sanctuary OS Phase Roadmap"),
    customRoadmapSchema?.summary ||
      directivesMap.phase_roadmap?.summary ||
      t("sd_card_roadmap_desc", "Interactive milestone timeline"),
    "phase roadmap timeline milestones evolution"
  );
  const showForkCard = matchesModuleCard(
    "forking",
    customForkSchema?.title ||
      directivesMap.forking_guide?.title ||
      t("sd_card_fork_title", "Forking & Spoke Provisioning Guide"),
    customForkSchema?.summary ||
      directivesMap.forking_guide?.summary ||
      t("sd_card_fork_desc", "Sovereign Community Spoke"),
    "forking spoke provisioning uplink sql standalone"
  );
  const showArchCard = matchesModuleCard(
    "architecture",
    customArchSchema?.title ||
      directivesMap.master_architecture?.title ||
      t("sd_card_arch_title", "Master Architecture & Engine Systems"),
    customArchSchema?.summary ||
      directivesMap.master_architecture?.summary ||
      t("sd_card_arch_desc", "Tauri v2 Rust core"),
    "architecture engine rust core federation airgap"
  );
  const showProtoCard = matchesModuleCard(
    "protocols",
    customProtoSchema?.title ||
      directivesMap.master_protocols?.title ||
      t("sd_card_proto_title", "Master Protocol & Clearance Matrix"),
    customProtoSchema?.summary ||
      directivesMap.master_protocols?.summary ||
      t(
        "sd_card_proto_desc",
        "Interactive directory of all 30 Sanctuary OS operational protocols across 4 domains, Florida Compliance Tiers 0–5, Bytecode Hound Core + Spoke Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy."
      ),
    "protocol clearance matrix governance security compliance"
  );

  const ecosystemWhitepapers = useMemo(
    () => [
      {
        id: "why_switch",
        title: t("sd_wp_why_switch_title", "Why Switch to Sanctuary OS"),
        badge: t("sd_wp_badge_comparison", "COMPARISON"),
        subtitle: t("sd_wp_why_switch_sub", "Overview & Ecosystem Fit"),
        summary: t(
          "sd_wp_why_switch_desc",
          "Plain-language comparison covering non-destructive VFS links, universal engine schemas, ByteHound security, and community sovereignty."
        ),
        icon: t("icon_compare_arrows", "compare_arrows"),
        content: docWhySwitch,
      },
      {
        id: "zero_reinstall_migration",
        title: t("sd_wp_migration_title", "Zero-Reinstall {Citizen} & {Mason} Migration Guide"),
        badge: t("sd_wp_badge_migration", "MIGRATION"),
        subtitle: t("sd_wp_migration_sub", "MO2, Vortex, BG3MM & r2modman"),
        summary: t(
          "sd_wp_migration_desc",
          "Step-by-step zero-copy hardlink Exodus migration guide and static edge catalog publishing for creators leaving legacy platforms."
        ),
        icon: t("icon_move_to_inbox", "move_to_inbox"),
        content: docMigrationGuide,
      },
      {
        id: "competitor_comparison",
        title: t("sd_wp_competitor_title", "Modding Ecosystem Competitor Matrix"),
        badge: t("sd_wp_badge_matrix", "MATRIX"),
        subtitle: t("sd_wp_competitor_sub", "Feature & Protocol Parity"),
        summary: t(
          "sd_wp_competitor_desc",
          "Side-by-side breakdown comparing Sanctuary OS against Vortex, MO2, r2modman, BG3MM, and centralized mod networks."
        ),
        icon: t("icon_table_chart", "table_chart"),
        content: docCompetitorComparison,
      },
      {
        id: "technical_deep_dive",
        title: t("sd_wp_tech_deep_title", "Technical Deep Dive: Formats, Malware & Cloud Traps"),
        badge: t("sd_wp_badge_engineering", "ENGINEERING"),
        subtitle: t("sd_wp_tech_deep_sub", "Binary TOCs & Zero-PII"),
        summary: t(
          "sd_wp_tech_deep_desc",
          "Architectural deep dive into binary container TOCs, ByteHound malware heuristics, symlink atomicity, and local-first privacy."
        ),
        icon: t("icon_memory", "memory"),
        content: docTechnicalDeepDive,
      },
      {
        id: "partner_spoke_pitch",
        title: t("sd_wp_partner_pitch_title", "Executive Partner Spoke Pitch Matrix"),
        badge: t("sd_wp_badge_partners", "PARTNERS"),
        subtitle: t("sd_wp_partner_pitch_sub", "Sovereign Hub Federation"),
        summary: t(
          "sd_wp_partner_pitch_desc",
          "Executive brief for game studios, community leaders, and Spoke hosts adopting sovereign federation with SANCTUARY-UPLINK://."
        ),
        icon: t("icon_hub", "hub"),
        content: docPartnerSpokePitch,
      },
    ],
    [t]
  );

  const filteredWhitepapers = ecosystemWhitepapers.filter((wp) => {
    if (moduleFilter && moduleFilter !== "ALL" && moduleFilter !== "whitepapers") return false;
    if (!normalizedSearch) return true;
    return `${wp.title} ${wp.subtitle} ${wp.summary} ${wp.badge}`
      .toLowerCase()
      .includes(normalizedSearch);
  });

  const activeWhitepaper =
    ecosystemWhitepapers.find((wp) => wp.id === activeWhitepaperId) || null;

  const filteredExtraDirectives = extraCustomDirectives.filter((p) => {
    if (moduleFilter && moduleFilter !== "ALL") return false;
    if (!normalizedSearch) return true;
    const rawBody = p.content || p.message || "";
    const haystack = `${p.title || ""} ${p.category || ""} ${rawBody}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const hasAnyDirectiveVisible =
    showGuideCard ||
    showRoadmapCard ||
    showForkCard ||
    showArchCard ||
    showProtoCard ||
    filteredWhitepapers.length > 0 ||
    filteredExtraDirectives.length > 0;

  return (
    <div className="w-full flex flex-col gap-6">
      {!hasAnyDirectiveVisible && (
        <EmptyState
          icon={t("icon_folder_special", "folder_special")}
          title={t("no_results", "No matching items found.")}
        />
      )}
      {/* Row 1: 2 Primary Featured Interactive Experiences (OS Tutorial & Phase Timeline) */}
      {(showGuideCard || showRoadmapCard) && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Card 1: Interactive Citizen Guide & OS Walkthrough */}
        {showGuideCard && (
        <UniversalCard
          layout="vertical"
          icon={t("icon_school", "school")}
          title={td(
            customGuideSchema?.title ||
              directivesMap.citizen_guide?.published_title ||
              directivesMap.citizen_guide?.title ||
              t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough")
          )}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_guide_sub", "Walkthrough")
          )}
          bannerTopLabel={t("sd_card_guide_badge", "CITIZEN GUIDE")}
          bannerBottomLabel={`${t("dir_guide_mode_walk_val", "OS Walkthrough")} • ${t("dir_guide_mode_mod_val", "Citizen Tools")} • ${t("dir_wt_t8_val", "Role Tiers")}`}
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
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_explore", "explore")}
                </span>
                {`${guideWalkCount} ${t("dir_guide_stages_unit", "Stages")} • ${guideModCount} ${t("dir_guide_modules_unit", "Modules")}`}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                {t("sd_card_guide_cta", "Launch OS Tutorial")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {td(
              customGuideSchema?.summary ||
                directivesMap.citizen_guide?.published_summary ||
                directivesMap.citizen_guide?.summary ||
                t(
                  "sd_card_guide_desc",
                  "Step-by-step interactive walkthrough of Sanctuary OS—from Cartographer setup, Symlink {Vault} & Load Order compilation, to Homestead Lab testing, {Backups} snapshots, Static Edge Auto-Push, Master Schema & Lexicon Studios, and Elevated Clearances."
                )
            )}
          </p>
        </UniversalCard>
        )}

        {/* Card 2: Interactive Phase Roadmap Timeline */}
        {showRoadmapCard && (
        <UniversalCard
          layout="vertical"
          icon={t("icon_timeline", "timeline")}
          title={td(
            customRoadmapSchema?.title ||
              directivesMap.phase_roadmap?.published_title ||
              directivesMap.phase_roadmap?.title ||
              t("sd_card_roadmap_title", "Sanctuary OS Phase Roadmap")
          )}
          subtitle={buildDirectiveSubtitle(
            `${t("dir_roadmap_tab_value", "Evolution Timeline")} • ${t("dir_phase_word", "Phase")} ${topRoadmapPhaseNum} ${t("active", "Active")}`
          )}
          bannerTopLabel={`${t("dir_roadmap_phases_unit", "PHASES")} 1–${roadmapPhaseCount}`}
          bannerBottomLabel={`${t("author_sanctuary_team", "Sanctuary Foundry")} • ${t("dir_phase_word", "Phase")} ${topRoadmapPhaseNum} ${t("active", "Active")}`}
          onClick={() => openDirectiveModule("roadmap")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_rocket_launch", "rocket_launch")}
                </span>
                {`${t("dir_roadmap_phases_unit", "PHASES")} 1–${roadmapPhaseCount}`}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_timeline", "timeline")}
                </span>
                {`${roadmapPhaseCount} ${t("dir_roadmap_phases_unit", "Phases")}`}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                {t("sd_card_roadmap_cta", "Explore Timeline")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {td(
              customRoadmapSchema?.summary ||
                directivesMap.phase_roadmap?.published_summary ||
                directivesMap.phase_roadmap?.summary ||
                t(
                  "sd_card_roadmap_desc",
                  "Interactive milestone timeline tracking Sanctuary OS from Phase 1 (Local Symlink Core) through Phase 12 (Multi-Spoke Sovereignty) into Phase 13 (V5.8 Multi-Engine Studios, Core + Spoke Bytecode Hound Heuristics & Bilateral Cloud Sync)."
                )
            )}
          </p>
        </UniversalCard>
        )}
      </div>
      )}

      {/* Row 2: 3 Dedicated Core System Modules (Forking Guide, Master Architecture, Master Protocol Matrix) */}
      {(showForkCard || showArchCard || showProtoCard) && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        {/* Card 3: Forking & Spoke Provisioning Guide */}
        {showForkCard && (
        <UniversalCard
          layout="vertical"
          icon={t("icon_call_split", "call_split")}
          title={td(
            customForkSchema?.title ||
              directivesMap.forking_guide?.published_title ||
              directivesMap.forking_guide?.title ||
              t("sd_card_fork_title", "Forking & Spoke Provisioning Guide")
          )}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_fork_sub", "Provisioning")
          )}
          bannerTopLabel={t("sd_card_fork_badge", "SPOKE & FORK")}
          bannerBottomLabel={t(
            "sd_card_fork_sub",
            "Standalone Codebase Fork & Partner Uplink"
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
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_hub", "hub")}
                </span>
                {`${forkTotalTabs} ${t("dir_builder_tabs_lbl", "Tabs")} • ${forkTotalCards} ${t("dir_builder_cards_lbl", "Cards")}`}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                {t("sd_card_fork_cta", "Open Forking Guide")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {td(
              customForkSchema?.summary ||
                directivesMap.forking_guide?.published_summary ||
                directivesMap.forking_guide?.summary ||
                t(
                  "sd_card_fork_desc",
                  "Interactive {blueprint} for launching a Sovereign Community Spoke (SANCTUARY-UPLINK://) or a 1-file Standalone Codebase Fork (src/supabase.ts), plus Master Schema & Lexicon Studios and Cut the Cord."
                )
            )}
          </p>
        </UniversalCard>
        )}

        {/* Card 4: Master Architecture & Engine Systems */}
        {showArchCard && (
        <UniversalCard
          layout="vertical"
          icon={t("icon_architecture", "architecture")}
          title={td(
            customArchSchema?.title ||
              directivesMap.master_architecture?.published_title ||
              directivesMap.master_architecture?.title ||
              t("sd_card_arch_title", "Master Architecture & Engine Systems")
          )}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_arch_sub", "Architecture")
          )}
          bannerTopLabel={t("sd_card_arch_badge", "CORE ENGINE")}
          bannerBottomLabel={t(
            "sd_card_arch_sub",
            "Hub-and-Spoke Federation & Rust Core"
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
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_layers", "layers")}
                </span>
                {`${customArchSchema?.tabs.length || 4} ${t("dir_builder_tabs_lbl", "Tabs")} • ${archSubCardCount} ${t("dir_builder_cards_lbl", "Cards")}`}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                {t("sd_card_arch_cta", "Inspect Architecture")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {td(
              customArchSchema?.summary ||
                directivesMap.master_architecture?.published_summary ||
                directivesMap.master_architecture?.summary ||
                t(
                  "sd_card_arch_desc",
                  "Deep-dive interactive explorer into the Tauri v2 Rust core, Hub-and-Spoke database federation, Offline Codebase Baseline + Live Cloud Sync, Symlink Airgap 2.5, Static Edge Auto-Push, and Bytecode Hound Core + Spoke Heuristics."
                )
            )}
          </p>
        </UniversalCard>
        )}

        {/* Card 5: Master Protocol & Clearance Matrix */}
        {showProtoCard && (
        <UniversalCard
          layout="vertical"
          icon={t("icon_policy", "policy")}
          title={td(
            customProtoSchema?.title ||
              directivesMap.master_protocols?.published_title ||
              directivesMap.master_protocols?.title ||
              t("sd_card_proto_title", "Master Protocol & Clearance Matrix")
          )}
          subtitle={buildDirectiveSubtitle(
            t("sd_card_proto_sub", "Governance")
          )}
          bannerTopLabel={`${protoRuleCount} ${t("dir_proto_rules_unit", "PROTOCOLS")}`}
          bannerBottomLabel={t(
            "sd_card_proto_sub",
            "Governance, Security & Compliance Tiers"
          )}
          onClick={() => openDirectiveModule("protocols")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_policy", "policy")}
                </span>
                {`${protoRuleCount} ${t("dir_proto_rules_unit", "PROTOCOLS")}`}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_shield", "shield")}
                </span>
                {`${protoDomainCount} ${t("sd_card_proto_meta", "Protocol Domains")} • ${protoRuleCount} ${t("dir_proto_rules_unit", "Rules")}`}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                {t("sd_card_proto_cta", "Browse Protocols")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {td(
              customProtoSchema?.summary ||
                directivesMap.master_protocols?.published_summary ||
                directivesMap.master_protocols?.summary ||
                t(
                  "sd_card_proto_desc",
                  "Interactive directory of all 30 Sanctuary OS operational protocols across 4 domains, Florida Compliance Tiers 0–5, Bytecode Hound Core + Spoke Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy."
                )
            )}
          </p>
        </UniversalCard>
        )}
      </div>
      )}

      {/* Row 3: Ecosystem Whitepapers & Migration Guides (/Docs/*.md) */}
      {filteredWhitepapers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {filteredWhitepapers.map((wp) => (
            <UniversalCard
              key={wp.id}
              layout="vertical"
              icon={wp.icon}
              title={wp.title}
              subtitle={buildDirectiveSubtitle(wp.subtitle)}
              bannerTopLabel={wp.badge}
              bannerBottomLabel={wp.subtitle}
              onClick={() => setActiveWhitepaperId(wp.id)}
              className="w-full h-full"
              imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                  <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {wp.icon}
                    </span>
                    {wp.badge}
                  </span>
                </div>
              }
              footer={
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_menu_book", "menu_book")}
                    </span>
                    {t("sd_wp_card_tag", "Ecosystem Brief")}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                    {t("btn_view", "View")}{" "}
                    <span className="material-symbols-outlined !text-sm">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                </div>
              }
            >
              <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
                {wp.summary}
              </p>
            </UniversalCard>
          ))}
        </div>
      )}

      {/* Optional Row 4: Any extra custom public broadcasts added by Keepers */}
      {filteredExtraDirectives.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {filteredExtraDirectives.map((p) => {
            const rawBody = p.content || p.message || "";
            const cleanBody = extractDispatchMetadata(p, rawBody).cleanContent;
            const summaryText = stripMarkdown(p.description || cleanBody);
            return (
              <UniversalCard
                key={p.id}
                layout="vertical"
                icon={t("icon_data_object", "data_object")}
                title={td(p.title)}
                subtitle={buildDirectiveSubtitle(td(p.category || ""))}
                onClick={() => setSelectedPost(p)}
                className="w-full h-full"
                imageOverlay={
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                    <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_folder_special", "folder_special")}
                      </span>
                      {td(p.category || "")}
                    </span>
                  </div>
                }
                footer={
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_calendar_today", "calendar_today")}
                      </span>
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      {t("btn_view", "View")}{" "}
                      <span className="material-symbols-outlined !text-sm">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
                  {td(summaryText)}
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
        widthClass="w-[94vw] sm:w-[88vw] lg:w-[74vw] xl:w-[64vw] max-w-5xl"
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
            description={activePanelMeta.description}
            label={t("author_sanctuary_team", "Sanctuary Foundry")}
            icon={activePanelMeta.icon}
            variant="accent"
            badges={[
              {
                icon: t("icon_verified", "verified"),
                label: t("verified", "Verified"),
                colorClass:
                  "text-[var(--text)] border-[color-mix(in_srgb,var(--text)_12%,transparent)]",
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
              {activeModule === "guide" && <WebGuideView td={td} t={t} guideMode={guideMode} setGuideMode={setGuideMode} walkIdx={walkIdx} setWalkIdx={setWalkIdx} guideStepIdx={guideStepIdx} setGuideStepIdx={setGuideStepIdx} roleTierIdx={roleTierIdx} setRoleTierIdx={setRoleTierIdx} guideDrawerRef={guideDrawerRef} scrollDrawerIntoCenter={scrollDrawerIntoCenter} citizenSteps={citizenSteps} walkthroughStages={walkthroughStages} elevatedRoles={elevatedRoles} customGuideSchema={customGuideSchema} />}
              {activeModule === "roadmap" && <WebRoadmapView td={td} t={t} roadmapFilter={roadmapFilter} setRoadmapFilter={setRoadmapFilter} selectedPhaseNum={selectedPhaseNum} setSelectedPhaseNum={setSelectedPhaseNum} roadmapDrawerRef={roadmapDrawerRef} scrollDrawerIntoCenter={scrollDrawerIntoCenter} roadmapPhases={roadmapPhases} customRoadmapSchema={customRoadmapSchema} />}
              {activeModule === "forking" && <WebForkingView forkTab={forkTab} setForkTab={setForkTab} forkModeIdx={forkModeIdx} setForkModeIdx={setForkModeIdx} sqlSchemaTab={sqlSchemaTab} setSqlSchemaTab={setSqlSchemaTab} customForkSchema={customForkSchema} />}
              {activeModule === "architecture" && <WebArchitectureView t={t} td={td} archTab={archTab} setArchTab={setArchTab} customArchSchema={customArchSchema} />}
              {activeModule === "protocols" && <WebProtocolsView t={t} td={td} protoTab={protoTab} setProtoTab={setProtoTab} protoRoleIdx={protoRoleIdx} setProtoRoleIdx={setProtoRoleIdx} protoCompIdx={protoCompIdx} setProtoCompIdx={setProtoCompIdx} protoDomainIdx={protoDomainIdx} setProtoDomainIdx={setProtoDomainIdx} protoDrawerRef={protoDrawerRef} scrollDrawerIntoCenter={scrollDrawerIntoCenter} elevatedRoles={elevatedRoles} customProtoSchema={customProtoSchema} />}
            </>
          )}
        </div>
      </SidePanel>

      {activeWhitepaper && (
        <SidePanel
          isOpen={true}
          onClose={() => setActiveWhitepaperId(null)}
          title={activeWhitepaper.title}
          subtitle={activeWhitepaper.subtitle}
          icon={activeWhitepaper.icon}
          widthClass="w-[94vw] sm:w-[88vw] lg:w-[74vw] xl:w-[64vw] max-w-5xl"
          panelZ="z-[50001]"
          backdropZ="z-[50000]"
          panelClass="!border-l-[color-mix(in_srgb,var(--text)_15%,transparent)]"
        >
          <div className="flex flex-col gap-6 pb-24 w-full">
            <SidePanelHeroCard
              title={activeWhitepaper.title}
              subtitle={activeWhitepaper.subtitle}
              description={activeWhitepaper.summary}
              label={t("author_sanctuary_team", "Sanctuary Foundry")}
              icon={activeWhitepaper.icon}
              variant="accent"
            />
            <UniversalGroup title={activeWhitepaper.title} icon={t("icon_menu_book", "menu_book")}>
              <StructuredReleaseNotesView content={activeWhitepaper.content} />
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

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
