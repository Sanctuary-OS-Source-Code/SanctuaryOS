import { useEffect, useMemo, useRef, useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { ActionButton, CustomDropdown } from "../../shared";
import { UniversalGroup } from "../../components/universal/UniversalLayout";
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
}: EmailTemplatePreviewAndAuthSectionProps) {
  const { t } = useLexicon();
  const [selectedAuthId, setSelectedAuthId] =
    useState<SanctuaryAuthEmailTemplate["id"]>("confirm_signup");
  const [showAuthPreview, setShowAuthPreview] = useState(false);

  const selectedAuthTpl = useMemo(
    () =>
      SANCTUARY_AUTH_EMAIL_TEMPLATES.find((tpl) => tpl.id === selectedAuthId) ||
      SANCTUARY_AUTH_EMAIL_TEMPLATES[0],
    [selectedAuthId]
  );

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

  return (
    <UniversalGroup
      title={t(
        "keepers_email_auth_templates_title",
        "Account & Auth Email Templates (Supabase Auth)"
      )}
      icon={t("icon_verified_user", "verified_user")}
    >
      <div className="flex flex-col gap-3 text-xs text-[var(--subtext)] leading-relaxed">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
            {t("keepers_email_auth_template_select", "Supabase Auth Email Template")}
          </label>
          <CustomDropdown
            disableTint={true}
            value={selectedAuthTpl.id}
            onChange={(v: string[]) =>
              setSelectedAuthId(
                (v[0] as SanctuaryAuthEmailTemplate["id"]) || "confirm_signup"
              )
            }
            options={SANCTUARY_AUTH_EMAIL_TEMPLATES.map((tpl) => ({
              id: tpl.id,
              label: t(tpl.labelKey, tpl.labelDefault),
            }))}
          />
        </div>

        <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-[var(--text)]">
            {t(selectedAuthTpl.descriptionKey, selectedAuthTpl.descriptionDefault)}
          </span>
          <div className="text-[11px] text-[var(--subtext)]">
            <span className="font-bold text-[var(--accent)]">
              {t("keepers_email_subject_label", "Subject Line")}:
            </span>{" "}
            <span className="no-text-case font-mono text-[var(--text)] select-all">
              {selectedAuthTpl.subject}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            onClick={() =>
              handleCopyText(
                selectedAuthTpl.subject,
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
                selectedAuthTpl.html,
                t("keepers_email_auth_html_copied", "Copied Sanctuary OS Auth HTML template!")
              )
            }
            icon={t("icon_code", "code")}
            variant="accent"
            className="flex-1"
            label={t("keepers_email_copy_html", "Copy HTML Template")}
          />
          <ActionButton
            onClick={() => setShowAuthPreview((prev) => !prev)}
            icon={
              showAuthPreview
                ? t("icon_visibility_off", "visibility_off")
                : t("icon_visibility", "visibility")
            }
            variant="glass"
            className="w-auto shrink-0"
            label={
              showAuthPreview
                ? t("hide", "Hide")
                : t("preview", "Preview")
            }
          />
        </div>

        {showAuthPreview && <EmailHtmlPreviewSurface html={selectedAuthTpl.previewHtml} />}
      </div>
    </UniversalGroup>
  );
}
