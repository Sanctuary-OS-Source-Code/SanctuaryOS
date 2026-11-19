import { useEffect, useMemo, useRef, useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  ActionButton,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelHeroCard,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { HubListGrid } from "../../components/layouts/ElevatedHubLayout";
import { CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import {
  buildSanctuaryOsEmailHtml,
  SANCTUARY_AUTH_EMAIL_TEMPLATES,
  SanctuaryAuthEmailTemplate,
} from "../../utils/sanctuaryEmailTemplates";

interface EmailTemplatePreviewAndAuthSectionProps {
  mode: "compose_preview" | "auth_templates";
  fromName: string;
  subject: string;
  bodyText: string;
  externalSearch?: string;
}

/** Extracts style blocks and body markup from email HTML for isolated Shadow-DOM preview rendering without iframes. */
function extractPreviewShadowContent(rawHtml: string): { css: string; markup: string } {
  const withoutScripts = String(rawHtml || "").replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const styleMatches = [...withoutScripts.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  const css = styleMatches.map((m) => m[1] || "").join("\n");
  const bodyMatch = withoutScripts.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const markup = bodyMatch ? bodyMatch[1] : withoutScripts;
  return { css, markup };
}

/** Frameless Shadow-DOM host that isolates email styles while matching natural SidePanel width and scrolling. */
function EmailHtmlPreviewSurface({ html }: { html: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    const { css, markup } = extractPreviewShadowContent(html);
    shadow.innerHTML = `<style>:host { display: block; width: 100%; background: transparent; } * { box-sizing: border-box; } .preview-root { width: 100%; background: transparent; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; }\n${css}</style><div class="preview-root">${markup}</div>`;
  }, [html]);

  return <div ref={hostRef} className="w-full" />;
}

/** Focused Email Preview & Supabase Auth HTML Template Studio subviews for Keepers Core Email Center. */
export default function EmailTemplatePreviewAndAuthSection({
  mode,
  fromName,
  subject,
  bodyText,
  externalSearch = "",
}: EmailTemplatePreviewAndAuthSectionProps) {
  const { t } = useLexicon();
  const [inspectingAuthId, setInspectingAuthId] =
    useState<SanctuaryAuthEmailTemplate["id"] | null>(null);

  const activeAuthTpl = useMemo(
    () =>
      inspectingAuthId
        ? SANCTUARY_AUTH_EMAIL_TEMPLATES.find((tpl) => tpl.id === inspectingAuthId) || null
        : null,
    [inspectingAuthId]
  );

  const filteredAuthTemplates = useMemo(() => {
    const q = externalSearch.trim().toLowerCase();
    if (!q) return SANCTUARY_AUTH_EMAIL_TEMPLATES;
    return SANCTUARY_AUTH_EMAIL_TEMPLATES.filter((tpl) => {
      const label = t(tpl.labelKey, tpl.labelDefault).toLowerCase();
      const desc = t(tpl.descriptionKey, tpl.descriptionDefault).toLowerCase();
      return (
        label.includes(q) ||
        desc.includes(q) ||
        tpl.subject.toLowerCase().includes(q)
      );
    });
  }, [externalSearch, t]);

  const composePreviewHtml = useMemo(
    () =>
      buildSanctuaryOsEmailHtml({
        fromName: fromName.trim() || "Sanctuary OS",
        headerSubtitle: "Sanctuary Foundry",
        subject:
          subject.trim() ||
          t(
            "keepers_email_test_subject",
            "Sanctuary OS — Official Channel Check"
          ),
        bodyText:
          bodyText.trim() ||
          t(
            "keepers_email_test_body",
            "Greetings from Sanctuary Foundry.\n\nThis message confirms that outbound mail relay and support notifications are active for sanctuaryos.net."
          ),
        badgeLabel: "Official",
        metaTiles: [],
        ctaLabel: "sanctuaryos.net",
        ctaUrl: "https://sanctuaryos.net",
        useInlinePreviewAssets: true,
        fitContainer: true,
      }),
    [fromName, subject, bodyText, t]
  );

  const handleCopyText = async (value: string, toastMessage: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      useStore.getState().pushStatus(toastMessage, "success");
    } catch {
      useStore
        .getState()
        .pushStatus(t("keepers_email_copy_failed", "Unable to copy to clipboard."), "error");
    }
  };

  if (mode === "compose_preview") {
    return (
      <div className="flex flex-col gap-2.5 w-full">
        <div className="flex items-center gap-2 px-1 text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">
          <span className="material-symbols-outlined !text-[15px]">
            {t("icon_visibility", "visibility")}
          </span>
          <span>{t("live_preview", "Live Preview")}</span>
        </div>
        <EmailHtmlPreviewSurface html={composePreviewHtml} />
      </div>
    );
  }

  const authFlowLabel = t("keepers_email_supabase_auth", "Supabase Auth");
  const htmlBadgeLabel = t("keepers_email_format_html", "HTML");

  return (
    <div className="flex flex-col gap-4">
      <CommandScreenSectionHeading
        icon={t("icon_verified_user", "verified_user")}
        iconColorClass="text-[var(--accent)]"
        title={t(
          "keepers_email_auth_templates_title",
          "Account & Auth Email Templates (Supabase Auth)"
        )}
        subtitle={t(
          "keepers_email_auth_templates_subtitle",
          "Copyable Liquid Glass HTML templates for Supabase Authentication flows"
        )}
        breadcrumb={`${filteredAuthTemplates.length}`}
      />

      <HubListGrid
        isEmpty={filteredAuthTemplates.length === 0}
        emptyIcon={t("icon_verified_user", "verified_user")}
        emptyTitle={t("no_match_assets", "No Matching Assets")}
        className="!pb-0"
      >
        {filteredAuthTemplates.map((tpl) => {
          const titleText = t(tpl.labelKey, tpl.labelDefault);
          const descText = t(tpl.descriptionKey, tpl.descriptionDefault);
          return (
            <UniversalCard
              key={tpl.id}
              layout="vertical"
              statusColor="accent"
              icon={t("icon_verified_user", "verified_user")}
              bannerTopLabel={authFlowLabel}
              bannerTopRightLabel={htmlBadgeLabel}
              bannerBottomLabel={tpl.subject}
              title={titleText}
              subtitle={
                <span className="no-text-case font-mono text-[11px]">
                  {tpl.subject}
                </span>
              }
              description={descText}
              imageOverlay={
                <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_code", "code")}
                    </span>
                    <span>{htmlBadgeLabel}</span>
                  </span>
                </div>
              }
              onClick={() => setInspectingAuthId(tpl.id)}
              footer={
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                    {authFlowLabel}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
                    <span>{t("inspect", "Inspect")}</span>
                    <span className="text-sm leading-none">&rarr;</span>
                  </span>
                </div>
              }
            />
          );
        })}
      </HubListGrid>

      <SidePanel
        isOpen={Boolean(activeAuthTpl)}
        onClose={() => setInspectingAuthId(null)}
        title={
          activeAuthTpl
            ? t(activeAuthTpl.labelKey, activeAuthTpl.labelDefault)
            : ""
        }
        subtitle={authFlowLabel}
        icon={t("icon_verified_user", "verified_user")}
        widthClass="w-[92vw] md:w-[760px]"
        headerActions={
          activeAuthTpl ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_content_copy", "content_copy")}
                tooltip={t("keepers_email_copy_subject", "Copy Subject")}
                onClick={() =>
                  handleCopyText(
                    activeAuthTpl.subject,
                    t("keepers_email_auth_subject_copied", "Copied Auth email subject line!")
                  )
                }
              />
              <PanelHeaderButton
                icon={t("icon_code", "code")}
                tooltip={t("keepers_email_copy_html", "Copy HTML Template")}
                onClick={() =>
                  handleCopyText(
                    activeAuthTpl.html,
                    t("keepers_email_auth_html_copied", "Copied Sanctuary OS Auth HTML template!")
                  )
                }
              />
            </PanelHeaderGroup>
          ) : null
        }
      >
        {activeAuthTpl && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_verified_user", "verified_user")}
              overline={authFlowLabel}
              title={t(activeAuthTpl.labelKey, activeAuthTpl.labelDefault)}
              description={t(activeAuthTpl.descriptionKey, activeAuthTpl.descriptionDefault)}
              badge={htmlBadgeLabel}
              badgeIcon={t("icon_code", "code")}
              variant="accent"
            >
              <div className="text-[11px] text-[var(--subtext)] pt-1">
                <span className="font-bold text-[var(--accent)]">
                  {t("keepers_email_subject_label", "Subject Line")}:
                </span>{" "}
                <span className="no-text-case font-mono text-[var(--text)] select-all">
                  {activeAuthTpl.subject}
                </span>
              </div>
            </SidePanelHeroCard>

            <div className="flex flex-wrap gap-2">
              <ActionButton
                onClick={() =>
                  handleCopyText(
                    activeAuthTpl.subject,
                    t("keepers_email_auth_subject_copied", "Copied Auth email subject line!")
                  )
                }
                icon={t("icon_content_copy", "content_copy")}
                variant="glass"
                className="w-auto shrink-0"
                label={t("keepers_email_copy_subject", "Copy Subject")}
              />
              <ActionButton
                onClick={() =>
                  handleCopyText(
                    activeAuthTpl.html,
                    t("keepers_email_auth_html_copied", "Copied Sanctuary OS Auth HTML template!")
                  )
                }
                icon={t("icon_code", "code")}
                variant="accent"
                className="flex-1"
                label={t("keepers_email_copy_html", "Copy HTML Template")}
              />
            </div>

            <EmailHtmlPreviewSurface html={activeAuthTpl.previewHtml} />
          </div>
        )}
      </SidePanel>
    </div>
  );
}
