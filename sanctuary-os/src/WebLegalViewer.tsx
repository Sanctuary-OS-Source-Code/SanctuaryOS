import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import MarkdownRenderer from "./MarkdownRenderer";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  DashboardStatTile,
  StatTileCarousel,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "./shared";
import { StructuredReleaseNotesView } from "./components/ReleaseNotesShowcase";

export default function WebLegalViewer() {
  const { t } = useLexicon();
  const [activeLegal, setActiveLegal] = useState<string | null>(null);
  const [legalContent, setLegalContent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"ui" | "normal">("ui");

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (["eula", "privacy", "terms"].includes(hash)) {
        setActiveLegal(hash);
      } else {
        setActiveLegal(null);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!activeLegal) {
      setLegalContent(null);
      return;
    }

    const fetchLegal = async () => {
      setLoading(true);

      const catMap: Record<string, string> = {
        eula: "EULA",
        privacy: "Privacy",
        terms: "Terms",
      };

      const { data } = await supabase
        .from("keeper_system_broadcasts")
        .select("*")
        .eq("category", catMap[activeLegal])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setLegalContent(
        data || {
          message: t("legal_not_found", "No {doc} document found.").replace(
            "{doc}",
            t(`landing_${activeLegal}`, catMap[activeLegal])
          ),
        }
      );
      setLoading(false);
    };

    fetchLegal();
  }, [activeLegal, t]);

  return (
    <SidePanel
      isOpen={!!activeLegal}
      onClose={() => {
        window.location.hash = "";
      }}
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
            label={t("btn_view", "View")}
            number={t("landing_eula", "EULA")}
            isActive={activeLegal === "eula"}
            onClick={() => {
              window.location.hash = "eula";
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={t("btn_view", "View")}
            number={t("landing_privacy", "Privacy")}
            isActive={activeLegal === "privacy"}
            onClick={() => {
              window.location.hash = "privacy";
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_description", "description")}
            label={t("btn_view", "View")}
            number={t("landing_terms", "Terms")}
            isActive={activeLegal === "terms"}
            onClick={() => {
              window.location.hash = "terms";
            }}
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
          badge={activeLegal?.toUpperCase()}
          badgeIcon={t("icon_verified", "verified")}
          variant="accent"
        />

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
            />
          ) : (
            <div className="glass-panel rounded-3xl p-5 sm:p-6 prose prose-invert max-w-none text-[var(--text)]">
              <MarkdownRenderer
                content={legalContent?.message || legalContent?.content || ""}
              />
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
