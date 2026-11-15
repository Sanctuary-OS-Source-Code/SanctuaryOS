import { useEffect, useMemo, useState } from "react";
import { useLexicon } from "../LexiconContext";
import MarkdownRenderer from "../MarkdownRenderer";
import {
  CANONICAL_DIRECTIVES,
  CANONICAL_LEGAL_DOCS,
  fetchSyncedLegalAndCovenants,
  LegalDocCategory,
  syncDirectivesBidirectional,
} from "../utils/directivesSync";
import {
  DashboardStatTile,
  EmptyState,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelFilterBar,
  VAULT_CHIP_CLASS,
} from "../shared";
import { SidePanelHeroCard } from "../components/universal/UniversalLayout";
import {
  cleanPostBodyForViewer,
  LegalDocVersionInfoBlock,
  StructuredReleaseNotesView,
  useStableReleaseMeta,
} from "../components/ReleaseNotesShowcase";

type UserLegalCategory = Exclude<LegalDocCategory, "PartnersAgreement">;

export type CitizenOnboardingDrawerTab = "intro" | UserLegalCategory;

interface CitizenOnboardingCovenantsSidePanelProps {
  activeTab: CitizenOnboardingDrawerTab | null;
  onSelectTab: (tab: CitizenOnboardingDrawerTab) => void;
  onClose: () => void;
  onAcceptAllCovenants?: () => void;
  legalAccepted?: boolean;
}

const LEGAL_ORDER: UserLegalCategory[] = [
  "Terms",
  "Privacy",
  "EULA",
  "ComplianceProtocol",
];

function buildInitialLegalDocs(): Record<
  UserLegalCategory,
  { title: string; content: string; updated_at?: string }
> {
  return {
    Terms: {
      title: CANONICAL_LEGAL_DOCS.Terms.title,
      content: CANONICAL_LEGAL_DOCS.Terms.bundledContent,
    },
    Privacy: {
      title: CANONICAL_LEGAL_DOCS.Privacy.title,
      content: CANONICAL_LEGAL_DOCS.Privacy.bundledContent,
    },
    EULA: {
      title: CANONICAL_LEGAL_DOCS.EULA.title,
      content: CANONICAL_LEGAL_DOCS.EULA.bundledContent,
    },
    ComplianceProtocol: {
      title: CANONICAL_LEGAL_DOCS.ComplianceProtocol.title,
      content: CANONICAL_LEGAL_DOCS.ComplianceProtocol.bundledContent,
    },
  };
}

export function CitizenOnboardingCovenantsSidePanel({
  activeTab,
  onSelectTab,
  onClose,
  onAcceptAllCovenants,
  legalAccepted = false,
}: CitizenOnboardingCovenantsSidePanelProps) {
  const { t } = useLexicon();
  const { stableVersion } = useStableReleaseMeta();

  const [guideMode, setGuideMode] = useState<"tour" | "doc">("tour");
  const [expandedStageId, setExpandedStageId] = useState<string | null>(
    "vault_airgap"
  );
  const [covenantViewMode, setCovenantViewMode] = useState<"ui" | "normal">(
    "ui"
  );
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [syncedLegalDocs, setSyncedLegalDocs] = useState(buildInitialLegalDocs);
  const [syncedGuideDoc, setSyncedGuideDoc] = useState<string>(
    CANONICAL_DIRECTIVES.citizen_guide.bundledContent
  );

  useEffect(() => {
    if (!activeTab) return;
    let cancelled = false;

    const loadAllDocs = async () => {
      setLoadingDocs(true);
      try {
        const [legalMap, directives] = await Promise.all([
          fetchSyncedLegalAndCovenants(),
          syncDirectivesBidirectional({ canWriteHub: false }),
        ]);
        if (cancelled) return;
        setSyncedLegalDocs({
          Terms: legalMap.Terms || buildInitialLegalDocs().Terms,
          Privacy: legalMap.Privacy || buildInitialLegalDocs().Privacy,
          EULA: legalMap.EULA || buildInitialLegalDocs().EULA,
          ComplianceProtocol:
            legalMap.ComplianceProtocol ||
            buildInitialLegalDocs().ComplianceProtocol,
        });
        const guideRec = directives.find((d) => d.slug === "citizen_guide");
        const resolvedGuide = (
          guideRec?.published_content ||
          guideRec?.content ||
          CANONICAL_DIRECTIVES.citizen_guide.bundledContent ||
          ""
        ).trim();
        if (resolvedGuide) {
          setSyncedGuideDoc(resolvedGuide);
        }
      } catch {
        // Fallback baseline already loaded from bundled canonical docs
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
    };

    loadAllDocs();
    window.addEventListener("sanctuary_directives_updated", loadAllDocs);
    return () => {
      cancelled = true;
      window.removeEventListener("sanctuary_directives_updated", loadAllDocs);
    };
  }, [activeTab]);

  const tourStages = useMemo(
    () => [
      {
        id: "vault_airgap",
        overline: t("auth_tour_stage_1_step", "STAGE 01 • CORE STORAGE"),
        icon: t("icon_account_balance", "account_balance"),
        badge: t("auth_tour_stage_1_badge", "Symlink Airgap"),
        badgeIcon: t("icon_inventory_2", "inventory_2"),
        title: t(
          "auth_tour_stage_1_title",
          "Local-First {Vault} & Symlink Airgap"
        ),
        subtitle: t(
          "auth_tour_stage_1_sub",
          "Isolate every installed file inside your local {Vault} with reversible OS symlinks."
        ),
        items: [
          {
            icon: t("icon_link", "link"),
            title: t(
              "auth_tour_stage_1_i1_title",
              "Zero-Copy Symbolic Projection"
            ),
            desc: t(
              "auth_tour_stage_1_b1",
              "Organizes all artifacts inside an isolated local {Vault} and projects only active entries into game directories via OS symbolic links."
            ),
          },
          {
            icon: t("icon_alt_route", "alt_route"),
            title: t(
              "auth_tour_stage_1_i2_title",
              "Multi-Root Install Routing & Deduplication"
            ),
            desc: t(
              "auth_tour_stage_1_b2",
              "Supports secondary install routes, automatic conflict detection, load-order compilation, and single-active binary deduplication across engines."
            ),
          },
          {
            icon: t("icon_history", "history"),
            title: t(
              "auth_tour_stage_1_i3_title",
              "Time Capsule CoW Snapshots"
            ),
            desc: t(
              "auth_tour_stage_1_b3",
              "Includes Copy-on-Write Time Capsule snapshots and Version History {Backups} on your own storage drive."
            ),
          },
          {
            icon: t("icon_radar", "radar"),
            title: t(
              "auth_tour_stage_1_i4_title",
              "Conflict Radar & Load Order"
            ),
            desc: t(
              "auth_tour_stage_1_b4",
              "Scans overlapping binaries and record tables before launch and lets you assign deterministic override winners."
            ),
          },
        ],
      },
      {
        id: "blueprints_sync",
        overline: t("auth_tour_stage_2_step", "STAGE 02 • LOADOUTS & SYNC"),
        icon: t("icon_map", "map"),
        badge: t("auth_tour_stage_2_badge", "AES-256 Sync"),
        badgeIcon: t("icon_enhanced_encryption", "enhanced_encryption"),
        title: t(
          "auth_tour_stage_2_title",
          "{Blueprints}, Patch Fire Drill & Encrypted Sync"
        ),
        subtitle: t(
          "auth_tour_stage_2_sub",
          "Build hash-verified loadouts, simulate patches, and sync rigs privately."
        ),
        items: [
          {
            icon: t("icon_data_object", "data_object"),
            title: t(
              "auth_tour_stage_2_i1_title",
              "Hash-Verified JSON Loadouts"
            ),
            desc: t(
              "auth_tour_stage_2_b1",
              "Cloud {Blueprints} (SNCXXX) store strictly non-media JSON loadouts of cryptographic SHA-256 / Blake3 DNA hashes and compatibility strings."
            ),
          },
          {
            icon: t("icon_local_fire_department", "local_fire_department"),
            title: t(
              "auth_tour_stage_2_i2_title",
              "Patch Fire Drill Readiness"
            ),
            desc: t(
              "auth_tour_stage_2_b2",
              "Patch Fire Drill simulates upcoming game updates against your active setup before deploying changes."
            ),
          },
          {
            icon: t("icon_lock", "lock"),
            title: t(
              "auth_tour_stage_2_i3_title",
              "Client-Side AES-256-GCM Staging"
            ),
            desc: t(
              "auth_tour_stage_2_b3",
              "Cross-rig staging uses client-side AES-256-GCM encryption and blinded tokens so cloud databases cannot read your private {mod} lists."
            ),
          },
          {
            icon: t("icon_devices", "devices"),
            title: t(
              "auth_tour_stage_2_i4_title",
              "Companion PWA Rig Telemetry"
            ),
            desc: t(
              "auth_tour_stage_2_b4",
              "Review encrypted loadout snapshots and launch readiness from Mobile PWA or browser without exposing local folder paths."
            ),
          },
        ],
      },
      {
        id: "lab_security",
        overline: t("auth_tour_stage_3_step", "STAGE 03 • SANDBOX & SECURITY"),
        icon: t("icon_biotech", "biotech"),
        badge: t("auth_tour_stage_3_badge", "Rust Heuristics"),
        badgeIcon: t("icon_shield_lock", "shield_lock"),
        title: t(
          "auth_tour_stage_3_title",
          "{Lab} Sandbox & Bytecode Hound Shield"
        ),
        subtitle: t(
          "auth_tour_stage_3_sub",
          "Multi-format heuristic scanning, airgapped save verification, and PII scrubbing."
        ),
        items: [
          {
            icon: t("icon_security", "security"),
            title: t(
              "auth_tour_stage_3_i1_title",
              "Dual-Tier Core & Spoke Signatures"
            ),
            desc: t(
              "auth_tour_stage_3_b1",
              "Dual-Tier Core + Spoke Rust heuristics scan archives, binaries, and script payloads prior to deployment."
            ),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t(
              "auth_tour_stage_3_i2_title",
              "Tier-5 Quarantine & Secure Shred"
            ),
            desc: t(
              "auth_tour_stage_3_b2",
              "Quarantine Lockdown isolates confirmed Tier 5 threats immediately until a {Citizen}-signed Secure Shred clears the file."
            ),
          },
          {
            icon: t("icon_cleaning_services", "cleaning_services"),
            title: t(
              "auth_tour_stage_3_i3_title",
              "On-Device PII Log Scrubber"
            ),
            desc: t(
              "auth_tour_stage_3_b3",
              "Diagnostic log analyzers automatically scrub Windows, macOS, Linux, and SteamOS/Proton usernames, paths, IPs, and SIDs on-device."
            ),
          },
          {
            icon: t("icon_replay", "replay"),
            title: t(
              "auth_tour_stage_3_i4_title",
              "Ephemeral Sandbox Save Rewind"
            ),
            desc: t(
              "auth_tour_stage_3_b4",
              "Sandbox test runs rewind mounted test saves back to a clean airgapped baseline when finished so corrupted files never linger."
            ),
          },
        ],
      },
      {
        id: "nexus_comm",
        overline: t("auth_tour_stage_4_step", "STAGE 04 • VERIFIED NETWORK"),
        icon: t("icon_hub", "hub"),
        badge: t("auth_tour_stage_4_badge", "Verified {Masons}"),
        badgeIcon: t("icon_verified", "verified"),
        title: t(
          "auth_tour_stage_4_title",
          "{Nexus}, Verified {Mason} Comm-Link & Workshop"
        ),
        subtitle: t(
          "auth_tour_stage_4_sub",
          "Metadata-only Tier-0 indexing with non-overridable creator verification."
        ),
        items: [
          {
            icon: t("icon_campaign", "campaign"),
            title: t(
              "auth_tour_stage_4_i1_title",
              "Creator Release Dispatch Channel"
            ),
            desc: t(
              "auth_tour_stage_4_b1",
              "Comm-Link operates strictly as a Verified {Mason} Changelog & Release Dispatch Channel with zero general user profiles, zero DMs, and zero open social feeds."
            ),
          },
          {
            icon: t("icon_verified_user", "verified_user"),
            title: t(
              "auth_tour_stage_4_i2_title",
              "Non-Overridable {Mason} Hardgates"
            ),
            desc: t(
              "auth_tour_stage_4_b2",
              "Cloud Nexus Asset uploads ({Chameleon} themes, Sparse Delta {Lexicons}, Workbench templates, and Collections) are hard-locked to FIDO2-verified {Masons}."
            ),
          },
          {
            icon: t("icon_construction", "construction"),
            title: t(
              "auth_tour_stage_4_i3_title",
              "Open Local Creator Workshop"
            ),
            desc: t(
              "auth_tour_stage_4_b3",
              "All {Citizens} still enjoy full offline Open Workshop tools with local JSON import/export and decentralized Static Edge manifests."
            ),
          },
          {
            icon: t("icon_cloud_done", "cloud_done"),
            title: t(
              "auth_tour_stage_4_i4_title",
              "Static Edge Update Manifests"
            ),
            desc: t(
              "auth_tour_stage_4_b4",
              "Creators can host lightweight .sanctuary.manifest.json feeds on GitHub Pages or personal domains for serverless version alerts."
            ),
          },
        ],
      },
      {
        id: "zk_auth",
        overline: t("auth_tour_stage_5_step", "STAGE 05 • ZERO-PII IDENTITY"),
        icon: t("icon_passkey", "passkey"),
        badge: t("auth_tour_stage_5_badge", "600k PBKDF2"),
        badgeIcon: t("icon_key", "key"),
        title: t(
          "auth_tour_stage_5_title",
          "Zero-Knowledge Auth, Blinded Email & FIDO2 Passkeys"
        ),
        subtitle: t(
          "auth_tour_stage_5_sub",
          "Credentials are cryptographically hardened on your device before transmission."
        ),
        items: [
          {
            icon: t("icon_enhanced_encryption", "enhanced_encryption"),
            title: t(
              "auth_tour_stage_5_i1_title",
              "600k PBKDF2 + Bcrypt Hardening"
            ),
            desc: t(
              "auth_tour_stage_5_b1",
              "Passcodes are stretched 600,000 iterations client-side (PBKDF2-HMAC-SHA256) and layered with server bcrypt so plaintext passcodes stay off the wire."
            ),
          },
          {
            icon: t("icon_visibility_off", "visibility_off"),
            title: t(
              "auth_tour_stage_5_i2_title",
              "Blinded Email Alias Protection"
            ),
            desc: t(
              "auth_tour_stage_5_b2",
              "Blinded Email Aliases derive deterministic on-device identifiers so zero plaintext email needs to live in the Hub database."
            ),
          },
          {
            icon: t("icon_passkey", "passkey"),
            title: t(
              "auth_tour_stage_5_i3_title",
              "Hardware & Biometric Passkeys"
            ),
            desc: t(
              "auth_tour_stage_5_b3",
              "Bind Windows Hello, Touch ID, password-manager passkeys, or hardware keys plus a 256-Bit Sovereign Key for phishing-resistant recovery."
            ),
          },
          {
            icon: t("icon_privacy_tip", "privacy_tip"),
            title: t(
              "auth_tour_stage_5_i4_title",
              "Zero-Surveillance Age Privacy"
            ),
            desc: t(
              "auth_tour_stage_5_b4",
              "Eligibility is enforced via non-social architecture, Verified {Mason} hardgates, and FIDO2 keys—never storing ID scans or biometric photos."
            ),
          },
        ],
      },
      {
        id: "sovereignty_offline",
        overline: t("auth_tour_stage_6_step", "STAGE 06 • SOVEREIGNTY"),
        icon: t("icon_offline_bolt", "offline_bolt"),
        badge: t("auth_tour_stage_6_badge", "0% Cut • Offline"),
        badgeIcon: t("icon_volunteer_activism", "volunteer_activism"),
        title: t(
          "auth_tour_stage_6_title",
          "Sovereignty, 0% Platform Cut & 100% Offline Mode"
        ),
        subtitle: t(
          "auth_tour_stage_6_sub",
          "Local-first technical software built for independent game communities."
        ),
        items: [
          {
            icon: t("icon_payments", "payments"),
            title: t(
              "auth_tour_stage_6_i1_title",
              "Technical Middleware & 0% Cut"
            ),
            desc: t(
              "auth_tour_stage_6_b1",
              "Sanctuary OS is technical configuration middleware—not a storefront or binary host—and takes a 0% cut of external non-custodial creator or Spoke donations."
            ),
          },
          {
            icon: t("icon_hub", "hub"),
            title: t(
              "auth_tour_stage_6_i2_title",
              "Cut-the-Cord Spoke Ownership"
            ),
            desc: t(
              "auth_tour_stage_6_b2",
              "Community Spokes retain 100% database ownership with bilateral Cut the Cord sovereignty and cryptographic SRK1 relinking."
            ),
          },
          {
            icon: t("icon_explore_off", "explore_off"),
            title: t(
              "auth_tour_stage_6_i3_title",
              "100% Offline & Guest Operation"
            ),
            desc: t(
              "auth_tour_stage_6_b3",
              "No account is ever required to manage local files—Guest / Offline mode works anytime on Windows, macOS, Linux, SteamOS, and Web/PWA."
            ),
          },
          {
            icon: t("icon_translate", "translate"),
            title: t(
              "auth_tour_stage_6_i4_title",
              "The Rosetta Protocol & Chameleon"
            ),
            desc: t(
              "auth_tour_stage_6_b4",
              "Adapt UI terminology and Liquid Glass aesthetics per community using Sparse Delta {Lexicons} and dynamic glossary tokens."
            ),
          },
        ],
      },
    ],
    [t]
  );

  const legalMetaMap: Record<
    UserLegalCategory,
    {
      label: string;
      badge: string;
      desc: string;
      icon: string;
    }
  > = {
    Terms: {
      label: t("landing_terms", "Terms of Service"),
      badge: t("auth_covenant_terms_badge", "User Rules & Clearances"),
      desc: t(
        "auth_covenant_terms_desc",
        "6-Tier Clearance Hierarchy, Platform Classification & Minor Safety, metadata registry, and 0%-cut terms."
      ),
      icon: t("icon_description", "description"),
    },
    Privacy: {
      label: t("landing_privacy", "Privacy Protocol"),
      badge: t("auth_covenant_privacy_badge", "Zero-PII & Age Privacy"),
      desc: t(
        "auth_covenant_privacy_desc",
        "Blinded emails, 600k PBKDF2 hashing, FIDO2 public keys, PII log scrubbing, and zero ID-scan age privacy."
      ),
      icon: t("icon_shield", "shield"),
    },
    EULA: {
      label: t("landing_eula", "System EULA"),
      badge: t("auth_covenant_eula_badge", "Software License"),
      desc: t(
        "auth_covenant_eula_desc",
        "Desktop & PWA software license, Symlink Airgap middleware classification, cross-platform rules, and warranty limits."
      ),
      icon: t("icon_gavel", "gavel"),
    },
    ComplianceProtocol: {
      label: t("compliance_protocol_title", "Compliance Protocol"),
      badge: t("compliance_protocol_badge", "Safety & Privacy"),
      desc: t(
        "compliance_protocol_desc",
        "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
      ),
      icon: t("icon_verified_user", "verified_user"),
    },
  };

  const activeCategory: UserLegalCategory | null =
    activeTab && activeTab !== "intro" ? activeTab : null;
  const activeLegalRecord = activeCategory
    ? syncedLegalDocs[activeCategory]
    : null;
  const cleanGuideMarkdown = useMemo(
    () => (syncedGuideDoc || "").replace(/<!--[\s\S]*?-->/g, "").trim(),
    [syncedGuideDoc]
  );

  return (
    <SidePanel
      isOpen={Boolean(activeTab)}
      onClose={onClose}
      icon={
        activeTab === "intro"
          ? t("icon_explore", "explore")
          : activeCategory
            ? legalMetaMap[activeCategory].icon
            : t("icon_gavel", "gavel")
      }
      iconColorClass="text-[var(--accent)]"
      title={
        activeTab === "intro"
          ? t("auth_tour_drawer_title", "Sanctuary OS Tour & {Citizen} Guide")
          : activeLegalRecord?.title ||
            (activeCategory ? legalMetaMap[activeCategory].label : "")
      }
      subtitle={
        activeTab === "intro"
          ? t(
              "auth_tour_drawer_sub",
              "Interactive 6-Stage Orientation & Official {Citizen} Reference Guide"
            )
          : t("legal_subtitle", "Sanctuary Foundry OS")
      }
      widthClass="w-[92vw] md:w-[780px]"
      backdropZ="z-[50100]"
      panelZ="z-[50101]"
      headerActions={
        <PanelHeaderGroup>
          {activeTab === "intro" ? (
            <>
              <PanelHeaderButton
                icon={t("icon_gavel", "gavel")}
                tooltip={t("partner_covenants_open_btn", "Inspect Covenants")}
                onClick={() => onSelectTab("Terms")}
              />
              <PanelHeaderButton
                icon={
                  guideMode === "doc"
                    ? t("icon_play_circle", "play_circle")
                    : t("icon_menu_book", "menu_book")
                }
                tooltip={
                  guideMode === "doc"
                    ? t(
                        "sd_btn_back_interactive",
                        "Back to Interactive Experience"
                      )
                    : t("sd_btn_view_db_doc", "View Full Reference Document")
                }
                variant={guideMode === "doc" ? "accent" : "default"}
                onClick={() =>
                  setGuideMode((prev) => (prev === "doc" ? "tour" : "doc"))
                }
              />
            </>
          ) : (
            <>
              <PanelHeaderButton
                icon={t("icon_explore", "explore")}
                tooltip={t(
                  "auth_tour_drawer_title",
                  "Sanctuary OS Tour & {Citizen} Guide"
                )}
                onClick={() => onSelectTab("intro")}
              />
              {onAcceptAllCovenants && (
                <PanelHeaderButton
                  icon={t("icon_check_circle", "check_circle")}
                  tooltip={
                    legalAccepted
                      ? t(
                          "auth_covenants_agreed_return_btn",
                          "User Covenants Accepted • Return"
                        )
                      : t(
                          "auth_covenants_agree_all_btn",
                          "Agree to All User Covenants & Return"
                        )
                  }
                  variant="accent"
                  onClick={onAcceptAllCovenants}
                />
              )}
              <PanelHeaderButton
                icon={t("icon_dashboard", "dashboard")}
                tooltip={t("tab_visual", "Visual")}
                onClick={() => setCovenantViewMode("ui")}
                variant={covenantViewMode === "ui" ? "accent" : "default"}
              />
              <PanelHeaderButton
                icon={t("icon_menu_book", "menu_book")}
                tooltip={t("btn_post", "Post")}
                onClick={() => setCovenantViewMode("normal")}
                variant={covenantViewMode === "normal" ? "accent" : "default"}
              />
            </>
          )}
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
        {activeTab === "intro" ? (
          <>
            <SidePanelHeroCard
              icon={t("icon_explore", "explore")}
              overline={t(
                "auth_tour_hero_overline",
                "Local-First Middleware • Zero-PII Identity • 100% Offline"
              )}
              title={t("auth_tour_hero_title", "Welcome to Sanctuary OS")}
              description={t(
                "auth_tour_hero_desc",
                "Explore how Sanctuary OS isolates local files with Symlink Airgap, scans archives with Rust heuristics, and syncs hash-only {Blueprints} while remaining 100% usable offline."
              )}
              badge={`V${stableVersion}`}
              badgeIcon={t("icon_verified", "verified")}
              variant="accent"
            />

            {guideMode === "doc" ? (
              loadingDocs ? (
                <EmptyState
                  icon={t("icon_sync", "sync")}
                  title={t("loading", "Loading...")}
                />
              ) : (
                <StructuredReleaseNotesView
                  content={cleanGuideMarkdown}
                  hideIntro={true}
                />
              )
            ) : (
              <div className="flex flex-col gap-3.5 w-full">
                {tourStages.map((stage) => {
                  const isExpanded = expandedStageId === stage.id;
                  return (
                    <div
                      key={stage.id}
                      onClick={() => {
                        if (!isExpanded) setExpandedStageId(stage.id);
                      }}
                      className={`glass-panel rounded-2xl transition-all duration-300 flex flex-col relative overflow-hidden ${
                        isExpanded
                          ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_24%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                          : "px-4 py-3.5 opacity-65 hover:opacity-95 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                      }`}
                    >
                      <div
                        onClick={(e) => {
                          if (isExpanded) {
                            e.stopPropagation();
                            setExpandedStageId(null);
                          }
                        }}
                        className={`flex flex-col gap-2 w-full ${
                          isExpanded ? "cursor-pointer group/hdr" : ""
                        }`}
                      >
                        <div className="flex items-center sm:items-start justify-between gap-2.5 sm:gap-3 w-full">
                          <div className="flex items-center sm:items-start gap-3 min-w-0">
                            <div
                              className={`${
                                isExpanded
                                  ? "w-10 h-10 sm:w-11 sm:h-11"
                                  : "w-10 h-10"
                              } rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center shrink-0 transition-transform ${
                                !isExpanded ? "group-hover:scale-105" : ""
                              }`}
                            >
                              <span
                                className={`material-symbols-outlined ${
                                  isExpanded
                                    ? "!text-[20px] sm:!text-[22px] text-[var(--accent)]"
                                    : "!text-[19px] text-[var(--text)] opacity-80"
                                }`}
                              >
                                {stage.icon}
                              </span>
                            </div>

                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span
                                className={`text-[10px] font-black uppercase tracking-[0.2em] leading-snug ${
                                  isExpanded
                                    ? "text-[var(--accent)]"
                                    : "text-[var(--subtext)]"
                                }`}
                              >
                                {stage.overline}
                              </span>
                              <h3
                                className={`hidden sm:block ${
                                  isExpanded ? "text-base sm:text-lg" : "text-sm sm:text-base truncate"
                                } font-black text-[var(--text)] tracking-tight leading-snug m-0`}
                              >
                                {stage.title}
                              </h3>
                              {!isExpanded && (
                                <span className="hidden sm:block text-[11px] text-[var(--subtext)] opacity-75 truncate">
                                  {stage.subtitle}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {stage.badgeIcon}
                              </span>
                              <span>{stage.badge}</span>
                            </span>

                            <span
                              className={`w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] transition-colors ${
                                isExpanded
                                  ? "group-hover/hdr:text-[var(--text)] group-hover/hdr:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                                  : "group-hover:text-[var(--text)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[16px]">
                                {isExpanded
                                  ? t("icon_expand_less", "expand_less")
                                  : t("icon_expand_more", "expand_more")}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex sm:hidden flex-col gap-0.5 min-w-0">
                          <h3
                            className={`${
                              isExpanded ? "text-base" : "text-sm"
                            } font-black text-[var(--text)] tracking-tight leading-snug m-0`}
                          >
                            {stage.title}
                          </h3>
                          {!isExpanded && (
                            <span className="text-[11px] text-[var(--subtext)] opacity-75 truncate">
                              {stage.subtitle}
                            </span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex flex-col gap-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] animate-in fade-in duration-200 cursor-default"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {stage.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] transition-all flex flex-col gap-2"
                              >
                                <div className="flex items-start gap-2.5">
                                  <span className="material-symbols-outlined !text-[18px] mt-0.5 shrink-0 text-[var(--accent)]">
                                    {item.icon}
                                  </span>
                                  <h4 className="text-xs sm:text-sm font-black text-[var(--text)] leading-snug m-0">
                                    {item.title}
                                  </h4>
                                </div>
                                <p className="text-xs text-[var(--subtext)] leading-relaxed pl-7 m-0 opacity-90">
                                  {item.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          activeCategory && (
            <>
              <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
                {LEGAL_ORDER.map((cat) => (
                  <DashboardStatTile
                    key={cat}
                    variant="filter"
                    className="!w-full"
                    icon={legalMetaMap[cat].icon}
                    label={legalMetaMap[cat].badge}
                    number={legalMetaMap[cat].label}
                    isActive={activeTab === cat}
                    onClick={() => onSelectTab(cat)}
                  />
                ))}
              </SidePanelFilterBar>

              <SidePanelHeroCard
                icon={legalMetaMap[activeCategory].icon}
                overline={t("legal_subtitle", "Sanctuary Foundry OS")}
                title={
                  activeLegalRecord?.title ||
                  legalMetaMap[activeCategory].label
                }
                description={legalMetaMap[activeCategory].desc}
                badge={`V${stableVersion}`}
                badgeIcon={t("icon_verified", "verified")}
                variant="accent"
              >
                <LegalDocVersionInfoBlock
                  content={activeLegalRecord?.content}
                  updatedAt={activeLegalRecord?.updated_at}
                />
              </SidePanelHeroCard>

              {loadingDocs ? (
                <EmptyState
                  icon={t("icon_sync", "sync")}
                  title={t("loading", "Loading...")}
                />
              ) : covenantViewMode === "ui" ? (
                <StructuredReleaseNotesView
                  content={activeLegalRecord?.content || ""}
                  hideIntro={true}
                />
              ) : (
                <div className="glass-panel rounded-2xl p-5 sm:p-6 prose prose-invert max-w-none text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <MarkdownRenderer
                    content={cleanPostBodyForViewer(
                      activeLegalRecord?.content || ""
                    )}
                  />
                </div>
              )}
            </>
          )
        )}
      </div>
    </SidePanel>
  );
}

export default CitizenOnboardingCovenantsSidePanel;
