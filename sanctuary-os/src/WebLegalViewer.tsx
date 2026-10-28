import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import MarkdownRenderer from "./MarkdownRenderer";
import {
  CANONICAL_LEGAL_DOCS,
  fetchSyncedLegalAndCovenants,
  LegalDocCategory,
} from "./utils/directivesSync";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  DashboardStatTile,
  StatTileCarousel,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "./shared";
import {
  StructuredReleaseNotesView,
  LegalDocVersionInfoBlock,
  cleanPostBodyForViewer,
  useStableReleaseMeta,
} from "./components/ReleaseNotesShowcase";

export default function WebLegalViewer() {
  const { t } = useLexicon();
  const { stableVersion } = useStableReleaseMeta();
  const [activeLegal, setActiveLegal] = useState<string | null>(null);
  const [legalContent, setLegalContent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"ui" | "normal">("ui");

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (["eula", "privacy", "terms"].includes(hash)) {
        setActiveLegal(hash);
      } else if (!hash) {
        setActiveLegal(null);
      }
    };

    const handleOpenLegalEvent = (e: Event) => {
      const detail = String((e as CustomEvent)?.detail || "")
        .trim()
        .toLowerCase();
      const map: Record<string, string> = {
        eula: "eula",
        privacy: "privacy",
        terms: "terms",
      };
      if (map[detail]) {
        setActiveLegal(map[detail]);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("open_legal_doc", handleOpenLegalEvent);
    handleHashChange();
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("open_legal_doc", handleOpenLegalEvent);
    };
  }, []);

  useEffect(() => {
    if (!activeLegal) {
      setLegalContent(null);
      return;
    }

    const fetchLegal = async () => {
      setLoading(true);

      const catMap: Record<string, LegalDocCategory> = {
        eula: "EULA",
        privacy: "Privacy",
        terms: "Terms",
      };

      const targetCategory = catMap[activeLegal] || "EULA";
      const canonicalDoc = CANONICAL_LEGAL_DOCS[targetCategory];
      const syncedMap = await fetchSyncedLegalAndCovenants();
      const syncedRec = syncedMap[targetCategory];

      setLegalContent(
        syncedRec
          ? {
              title: syncedRec.title,
              category: targetCategory,
              message: syncedRec.content,
            }
          : {
              title: canonicalDoc.title,
              category: canonicalDoc.category,
              message: canonicalDoc.bundledContent,
            }
      );
      setLoading(false);
    };

    fetchLegal();
    const handleUpdated = () => fetchLegal();
    window.addEventListener("sanctuary_directives_updated", handleUpdated);
    return () =>
      window.removeEventListener("sanctuary_directives_updated", handleUpdated);
  }, [activeLegal, t]);

  const handleClose = () => {
    setActiveLegal(null);
    if (
      ["eula", "privacy", "terms"].includes(
        window.location.hash.replace("#", "").toLowerCase()
      )
    ) {
      window.location.hash = "";
    }
  };

  return (
    <SidePanel
      isOpen={!!activeLegal}
      onClose={handleClose}
      icon={t("icon_gavel", "gavel")}
      iconColorClass="text-[var(--accent)]"
      title={
        legalContent?.title ||
        activeLegal?.toUpperCase() ||
        t("legal_subtitle", "Legal Document")
      }
      subtitle={t("legal_subtitle", "Sanctuary Foundry OS")}
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_dashboard", "dashboard")}
            tooltip={t("tab_visual", "Visual")}
            onClick={() => setViewMode("ui")}
            variant={viewMode === "ui" ? "accent" : "default"}
          />
          <PanelHeaderButton
            icon={t("icon_menu_book", "menu_book")}
            tooltip={t("btn_post", "Post")}
            onClick={() => setViewMode("normal")}
            variant={viewMode === "normal" ? "accent" : "default"}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
        <StatTileCarousel innerClassName="px-0">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_gavel", "gavel")}
            label={`V${stableVersion} • ${t("btn_view", "View")}`}
            number={t("landing_eula", "EULA")}
            isActive={activeLegal === "eula"}
            onClick={() => setActiveLegal("eula")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={`V${stableVersion} • ${t("btn_view", "View")}`}
            number={t("landing_privacy", "Privacy")}
            isActive={activeLegal === "privacy"}
            onClick={() => setActiveLegal("privacy")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_description", "description")}
            label={`V${stableVersion} • ${t("btn_view", "View")}`}
            number={t("landing_terms", "Terms")}
            isActive={activeLegal === "terms"}
            onClick={() => setActiveLegal("terms")}
          />
        </StatTileCarousel>

        <SidePanelHeroCard
          icon={t("icon_gavel", "gavel")}
          overline={t("legal_subtitle", "Sanctuary Foundry OS")}
          title={
            legalContent?.title ||
            activeLegal?.toUpperCase() ||
            t("legal_subtitle", "Legal Document")
          }
          description={t(
            "subtitle_sanctuary_alerts",
            "Official legal terms, privacy policy, and end-user license agreement."
          )}
          badge={`V${stableVersion} • ${activeLegal?.toUpperCase() || "LEGAL"}`}
          badgeIcon={t("icon_verified", "verified")}
          variant="accent"
        >
          <LegalDocVersionInfoBlock />
        </SidePanelHeroCard>

        <UniversalGroup
          title={
            legalContent?.title ||
            activeLegal?.toUpperCase() ||
            t("legal_subtitle", "Document")
          }
          icon={t("icon_description", "description")}
        >
          {loading ? (
            <div className="glass-surface rounded-xl py-16 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex justify-center items-center">
              <span className="material-symbols-outlined animate-spin text-4xl text-[var(--accent)]">
                {t("icon_autorenew", "autorenew")}
              </span>
            </div>
          ) : viewMode === "ui" ? (
            <StructuredReleaseNotesView
              content={legalContent?.message || legalContent?.content || ""}
              hideIntro={true}
            />
          ) : (
            <div className="glass-panel rounded-3xl p-5 sm:p-6 prose prose-invert max-w-none text-[var(--text)]">
              <MarkdownRenderer
                content={cleanPostBodyForViewer(
                  legalContent?.message || legalContent?.content || ""
                )}
              />
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
