import { EMAIL_PNG_ASSETS } from "./sanctuaryEmailAssetData";
import { SANCTUARY_CONFIG } from "../supabase";

/**
 * Sanctuary OS Unified <UniversalCard> Liquid Glass HTML Email Renderer & Email Privacy Masking.
 * Renders a single 540px rounded Liquid Glass UniversalCard over blurred & saturated Architect
 * backdrop PNG texture so light and dark email clients (including Outlook Web) preserve true frosted optics.
 */

export interface SanctuaryEmailMetaTile {
  label: string;
  value: string;
}

export interface SanctuaryEmailTemplateParams {
  fromName: string;
  fromEmail?: string;
  subject: string;
  bodyText: string;
  ticketId?: string | null;
  badgeLabel?: string;
  headerSubtitle?: string;
  metaTiles?: SanctuaryEmailMetaTile[];
  ctaLabel?: string;
  ctaUrl?: string;
  showPrimaryCtaButton?: boolean;
  tokenCode?: string;
  footerNote?: string;
  allowTemplateTokensInUrl?: boolean;
  useInlinePreviewAssets?: boolean;
  fitContainer?: boolean;
}

export interface SanctuaryAuthEmailTemplate {
  id: "confirm_signup" | "reset_password" | "magic_link" | "email_change";
  labelKey: string;
  labelDefault: string;
  subject: string;
  descriptionKey: string;
  descriptionDefault: string;
  html: string;
  previewHtml: string;
}

const LIVE_EMAIL_ASSET_BASE = `${String(
  SANCTUARY_CONFIG.supabaseUrl || "https://tpsbtaqxlczrysqqmanp.supabase.co"
).replace(/\/+$/, "")}/functions/v1/keeper-email-dispatch/assets`;

/** Masks a single email address to l•••@d•••.tld so full addresses are never flashed in UI/logs. */
export function maskEmailAddress(email: string): string {
  const clean = String(email || "").trim();
  const atIdx = clean.indexOf("@");
  if (atIdx <= 0) return clean;
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  if (!domain) return clean;

  const maskedLocal = `${local.slice(0, 1)}•••`;
  const dotIdx = domain.indexOf(".");
  const maskedDomain =
    dotIdx > 0
      ? `${domain.slice(0, 1)}•••.${domain.slice(dotIdx + 1)}`
      : `${domain.slice(0, 1)}•••`;

  return `${maskedLocal}@${maskedDomain}`;
}

/** Replaces every email address inside arbitrary text with a masked form while keeping @handles intact. */
export function maskEmailsInText(raw: string): string {
  const input = String(raw || "");
  if (!input.includes("@")) return input;
  return input.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    (match) => maskEmailAddress(match)
  );
}

/** Maps raw dispatch statuses into localized UI badge metadata for Sanctuary OS cards. */
export function getEmailDispatchStatusMeta(
  status: string | undefined,
  t: (key: string, fallback?: string) => string
): {
  label: string;
  iconName: string;
  iconColorClass: string;
  cardStatusColor: "success" | "warning" | "accent";
} {
  const s = String(status || "").toUpperCase();
  if (s === "DELIVERED" || s === "SENT") {
    return {
      label: t("keepers_email_status_delivered", "Delivered"),
      iconName: t("icon_mark_email_read", "mark_email_read"),
      iconColorClass: "text-[var(--success)]",
      cardStatusColor: "success",
    };
  }
  if (s.includes("WARN") || s.includes("ERR") || s.includes("FAIL")) {
    return {
      label: t("keepers_email_status_relay_warning", "Relay Warning"),
      iconName: t("icon_warning", "warning"),
      iconColorClass: "text-[var(--warning)]",
      cardStatusColor: "warning",
    };
  }
  return {
    label: t("keepers_email_status_logged", "Logged"),
    iconName: t("icon_outgoing_mail", "outgoing_mail"),
    iconColorClass: "text-[var(--accent)]",
    cardStatusColor: "accent",
  };
}

/** Formats raw mail relay provider constants into clean display names. */
export function formatEmailProviderLabel(provider?: string): string {
  const p = String(provider || "").toUpperCase();
  if (p === "RESEND") return "Resend";
  if (p === "CUSTOM_WEBHOOK") return "Webhook";
  return "Sanctuary Foundry";
}

function resolveEmailAssetUrl(
  assetName: keyof typeof EMAIL_PNG_ASSETS | string,
  useInlinePreviewAssets: boolean
): string {
  if (useInlinePreviewAssets && EMAIL_PNG_ASSETS[assetName]) {
    return `data:image/png;base64,${EMAIL_PNG_ASSETS[assetName]}`;
  }
  return `${LIVE_EMAIL_ASSET_BASE}/${assetName}?v=2`;
}

function escapeEmailHtml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeCtaHref(rawUrl: string, allowTemplateTokens: boolean): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  if (allowTemplateTokens && /^{{\s*\.[A-Za-z0-9_]+\s*}}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return escapeEmailHtml(trimmed);
    }
  } catch {
    // ignore malformed URL
  }
  return "";
}

function renderBodyParagraphsHtml(bodyText: string): string {
  const blocks = String(bodyText || "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return `<p class="sanctuary-body" style="margin:0;color:#dce7f7;font-size:14px;line-height:1.68;">&nbsp;</p>`;
  }

  return blocks
    .map((block, idx) => {
      const margin = idx === blocks.length - 1 ? "0" : "0 0 12px 0";
      const safeLines = escapeEmailHtml(block).replace(/\r?\n/g, "<br/>");
      return `<p class="sanctuary-body" style="margin:${margin};color:#dce7f7;font-size:14px;line-height:1.68;">${safeLines}</p>`;
    })
    .join("");
}

function renderMetadataChipsHtml(
  tiles: SanctuaryEmailMetaTile[],
  glassChipFillUrl: string
): string {
  const validTiles = tiles.filter(
    (tile) => tile && String(tile.label || "").trim() && String(tile.value || "").trim()
  );
  if (validTiles.length === 0) return "";

  const chips = validTiles
    .map(
      (tile) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:8px;background-color:transparent;background-image:url('${glassChipFillUrl}');background-repeat:repeat;border:1px solid rgba(248,250,252,0.13);font-size:11px;line-height:1.3;color:#f8fafc;"><span class="sanctuary-label" style="color:#94adc9;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-right:5px;">${escapeEmailHtml(tile.label)}:</span><span class="sanctuary-title" style="color:#ffffff;font-weight:800;">${escapeEmailHtml(tile.value)}</span></span>`
    )
    .join("");

  return `<div style="margin-top:16px;font-size:0;line-height:0;">${chips}</div>`;
}

function normalizePublicEmailIdentity(raw?: string | null, fallback = "Sanctuary OS"): string {
  const clean = String(raw || "").trim();
  if (!clean || /^(sanctuary\s+os\s+keepers\s+core|keepers\s+core)$/i.test(clean)) {
    return fallback;
  }
  return clean;
}

/** Builds a cohesive Sanctuary OS UniversalCard Liquid Glass email without dark backdrop bands or row seams. */
export function buildSanctuaryOsEmailHtml(params: SanctuaryEmailTemplateParams): string {
  const useInline = Boolean(params.useInlinePreviewAssets);
  const fitContainer = Boolean(params.fitContainer);
  const cardSurfaceUrl = resolveEmailAssetUrl("email-card-surface.png", useInline);
  const logoUrl = resolveEmailAssetUrl("sanctuary-logo.png", useInline);
  const glassIconTileUrl = resolveEmailAssetUrl("glass-icon-tile.png", useInline);
  const badgeIconUrl = resolveEmailAssetUrl("icon-badge-shield.png", useInline);
  const glassChipFillUrl = resolveEmailAssetUrl("glass-chip-fill.png", useInline);
  const glassBtnFillUrl = resolveEmailAssetUrl("glass-btn-fill.png", useInline);

  const safeFromName = escapeEmailHtml(normalizePublicEmailIdentity(params.fromName, "Sanctuary OS"));
  const safeHeaderSubtitle = escapeEmailHtml(
    normalizePublicEmailIdentity(params.headerSubtitle, "Sanctuary Foundry")
  );
  const safeSubject = escapeEmailHtml(params.subject);
  const safeFooterBrand = escapeEmailHtml(params.footerNote || "Sanctuary Foundry");
  const badgeText = params.ticketId
    ? `Ticket #${escapeEmailHtml(params.ticketId.slice(0, 8).toUpperCase())}`
    : escapeEmailHtml(params.badgeLabel || "Official");

  const explicitTiles: SanctuaryEmailMetaTile[] = Array.isArray(params.metaTiles)
    ? params.metaTiles
    : [];
  const metaChipsHtml = renderMetadataChipsHtml(explicitTiles, glassChipFillUrl);
  const bodyHtml = renderBodyParagraphsHtml(params.bodyText);
  const safeHref = params.ctaUrl
    ? sanitizeCtaHref(params.ctaUrl, Boolean(params.allowTemplateTokensInUrl))
    : "";

  const tokenBlockHtml = params.tokenCode
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;width:100%;border-collapse:separate;background-color:transparent;background-image:url('${glassChipFillUrl}');background-repeat:repeat;border-top:1px solid rgba(214,241,255,0.26);border-left:1px solid rgba(186,230,253,0.18);border-right:1px solid rgba(255,255,255,0.10);border-bottom:1px solid rgba(255,255,255,0.12);border-radius:12px;">
        <tr>
          <td align="center" background="${glassChipFillUrl}" style="padding:14px 16px;background-color:transparent;background-image:url('${glassChipFillUrl}');background-repeat:repeat;border-radius:12px;">
            <div class="sanctuary-accent" style="font-size:10px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#38bdf8;margin-bottom:6px;">Verification Code</div>
            <div class="sanctuary-title" style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:22px;font-weight:800;letter-spacing:0.24em;color:#ffffff;">${escapeEmailHtml(params.tokenCode)}</div>
          </td>
        </tr>
      </table>`
    : "";

  const showPrimaryCta = Boolean(params.showPrimaryCtaButton || params.tokenCode);
  const ctaSectionHtml =
    showPrimaryCta && params.ctaLabel && safeHref
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;width:auto;border-collapse:separate;">
        <tr>
          <td background="${glassBtnFillUrl}" style="background-color:transparent;background-image:url('${glassBtnFillUrl}');background-repeat:repeat;border-top:1px solid rgba(224,242,254,0.30);border-left:1px solid rgba(224,242,254,0.20);border-right:1px solid rgba(255,255,255,0.10);border-bottom:1px solid rgba(255,255,255,0.12);border-radius:12px;">
            <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 20px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:800;color:#f8fafc;line-height:1.25;">
              <span class="sanctuary-title" style="color:#f8fafc;">${escapeEmailHtml(params.ctaLabel)}</span><span class="sanctuary-accent" style="color:#38bdf8;margin-left:6px;">&rarr;</span>
            </a>
          </td>
        </tr>
      </table>`
      : "";

  const footerActionHref = showPrimaryCta ? "https://sanctuaryos.net" : (safeHref || "https://sanctuaryos.net");
  const footerActionLabel = showPrimaryCta
    ? "sanctuaryos.net"
    : escapeEmailHtml(params.ctaLabel || "sanctuaryos.net");

  const outerPadding = fitContainer ? "0" : "16px 8px";
  const cardMaxWidth = fitContainer ? "100%" : "600px";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${safeSubject}</title>
    <style type="text/css">
      :root { color-scheme: dark; supported-color-schemes: dark; }
      body, table, td, p, a, span, div, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      [data-ogsc] .sanctuary-title { color: #ffffff !important; }
      [data-ogsc] .sanctuary-body { color: #dce7f7 !important; }
      [data-ogsc] .sanctuary-subtext { color: #8fa8c8 !important; }
      [data-ogsc] .sanctuary-label { color: #94adc9 !important; }
      [data-ogsc] .sanctuary-accent { color: #38bdf8 !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:transparent;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:transparent;">
      <tr>
        <td align="center" style="padding:${outerPadding};background-color:transparent;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${cardMaxWidth};width:100%;margin:0 auto;border-collapse:separate;border-top:1px solid rgba(214,241,255,0.28);border-left:1px solid rgba(186,230,253,0.18);border-right:1px solid rgba(255,255,255,0.09);border-bottom:1px solid rgba(255,255,255,0.11);border-radius:20px;overflow:hidden;">
            <tr>
              <td bgcolor="#09152b" background="${cardSurfaceUrl}" style="padding:0;background-color:#09152b;background-image:url('${cardSurfaceUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;border-radius:20px;">
                <!-- Brand Header Bar -->
                <div style="padding:18px 22px;border-bottom:1px solid rgba(226,236,249,0.09);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td align="left" valign="middle" style="vertical-align:middle;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                          <tr>
                            <td valign="middle" style="vertical-align:middle;">
                              <table role="presentation" width="40" height="40" cellspacing="0" cellpadding="0" border="0" style="width:40px;height:40px;border-collapse:separate;background-color:transparent;background-image:url('${glassIconTileUrl}');background-size:100% 100%;background-repeat:no-repeat;border-top:1px solid rgba(224,242,254,0.30);border-left:1px solid rgba(224,242,254,0.18);border-right:1px solid rgba(255,255,255,0.10);border-bottom:1px solid rgba(255,255,255,0.12);border-radius:11px;">
                                <tr>
                                  <td align="center" valign="middle" background="${glassIconTileUrl}" style="padding:0;background-color:transparent;background-image:url('${glassIconTileUrl}');background-size:100% 100%;background-repeat:no-repeat;border-radius:11px;">
                                    <img src="${logoUrl}" width="26" height="26" alt="Sanctuary OS" style="display:block;width:26px;height:26px;margin:0 auto;border:0;" />
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td valign="middle" style="padding-left:12px;vertical-align:middle;">
                              <div class="sanctuary-title" style="font-size:14px;font-weight:800;color:#ffffff;line-height:1.25;">${safeFromName}</div>
                              <div class="sanctuary-subtext" style="font-size:11px;font-weight:600;color:#8fa8c8;line-height:1.3;margin-top:2px;">${safeHeaderSubtitle}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td align="right" valign="middle" style="vertical-align:middle;white-space:nowrap;">
                        <span style="display:inline-block;padding:5px 10px;border-radius:8px;background-color:transparent;background-image:url('${glassChipFillUrl}');background-repeat:repeat;border:1px solid rgba(248,250,252,0.13);font-size:11px;font-weight:700;letter-spacing:0.02em;text-transform:none;color:#e2ecf9;line-height:1.2;">
                          <img src="${badgeIconUrl}" width="13" height="13" alt="" style="display:inline-block;width:13px;height:13px;vertical-align:-2px;border:0;margin-right:6px;" /><span class="sanctuary-title" style="color:#e2ecf9;">${badgeText}</span>
                        </span>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Content Body -->
                <div style="padding:20px 22px 22px 22px;">
                  <h1 class="sanctuary-title" style="margin:0 0 12px 0;font-size:18px;font-weight:800;letter-spacing:-0.015em;line-height:1.35;color:#ffffff;">${safeSubject}</h1>
                  ${bodyHtml}
                  ${metaChipsHtml}
                  ${tokenBlockHtml}
                  ${ctaSectionHtml}
                </div>

                <!-- Hairline Footer -->
                <div style="padding:13px 22px;border-top:1px solid rgba(226,236,249,0.08);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td align="left" valign="middle" class="sanctuary-subtext" style="font-size:11px;font-weight:600;color:#8fa8c8;">
                        ${safeFooterBrand}
                      </td>
                      <td align="right" valign="middle" style="white-space:nowrap;">
                        <a href="${footerActionHref}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;font-size:11px;font-weight:700;letter-spacing:0;text-transform:none;color:#dce7f7;">
                          <span class="sanctuary-title" style="color:#dce7f7;text-transform:none;">${footerActionLabel}</span><span class="sanctuary-accent" style="color:#38bdf8;margin-left:5px;">&rarr;</span>
                        </a>
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildAuthTemplatePair(spec: {
  id: SanctuaryAuthEmailTemplate["id"];
  labelKey: string;
  labelDefault: string;
  subject: string;
  descriptionKey: string;
  descriptionDefault: string;
  bodyText: string;
  ctaLabel: string;
  includeToken?: boolean;
}): SanctuaryAuthEmailTemplate {
  const makeHtml = (isPreview: boolean) =>
    buildSanctuaryOsEmailHtml({
      fromName: "Sanctuary OS",
      headerSubtitle: "Identity & Access Security",
      subject: spec.subject,
      bodyText: spec.bodyText,
      badgeLabel: "Security",
      metaTiles: [],
      ctaLabel: spec.ctaLabel,
      ctaUrl: isPreview ? "https://sanctuaryos.net/auth/verify" : "{{ .ConfirmationURL }}",
      showPrimaryCtaButton: true,
      tokenCode: spec.includeToken ? (isPreview ? "849201" : "{{ .Token }}") : undefined,
      footerNote: "Sanctuary Foundry",
      allowTemplateTokensInUrl: true,
      useInlinePreviewAssets: isPreview,
      fitContainer: isPreview,
    });

  return {
    id: spec.id,
    labelKey: spec.labelKey,
    labelDefault: spec.labelDefault,
    subject: spec.subject,
    descriptionKey: spec.descriptionKey,
    descriptionDefault: spec.descriptionDefault,
    html: makeHtml(false),
    previewHtml: makeHtml(true),
  };
}

export const SANCTUARY_AUTH_EMAIL_TEMPLATES: SanctuaryAuthEmailTemplate[] = [
  buildAuthTemplatePair({
    id: "confirm_signup",
    labelKey: "keepers_auth_tpl_confirm_signup",
    labelDefault: "Confirm Signup",
    subject: "Confirm Your Sanctuary OS Account",
    descriptionKey: "keepers_auth_tpl_confirm_signup_desc",
    descriptionDefault: "Supabase Dashboard -> Authentication -> Emails -> Confirm signup",
    bodyText:
      "Welcome to Sanctuary OS.\n\nConfirm your email address below to activate your Hub identity and cross-device workspace access. If you did not create this account, you can safely disregard this message.",
    ctaLabel: "Confirm Email Address",
    includeToken: true,
  }),
  buildAuthTemplatePair({
    id: "reset_password",
    labelKey: "keepers_auth_tpl_reset_password",
    labelDefault: "Reset Password",
    subject: "Reset Your Sanctuary OS Password",
    descriptionKey: "keepers_auth_tpl_reset_password_desc",
    descriptionDefault: "Supabase Dashboard -> Authentication -> Emails -> Reset password",
    bodyText:
      "A password recovery request was initiated for your Sanctuary OS Hub account.\n\nUse the button or one-time verification code below to set a new password. If you did not request this change, no action is required and your current credentials remain unchanged.",
    ctaLabel: "Reset Password",
    includeToken: true,
  }),
  buildAuthTemplatePair({
    id: "magic_link",
    labelKey: "keepers_auth_tpl_magic_link",
    labelDefault: "Magic Link",
    subject: "Your Sanctuary OS Sign-In Link",
    descriptionKey: "keepers_auth_tpl_magic_link_desc",
    descriptionDefault: "Supabase Dashboard -> Authentication -> Emails -> Magic Link",
    bodyText:
      "Use the single-use link or verification code below to sign in to Sanctuary OS without typing your password.\n\nFor security, this token expires automatically after a short window and can only be used once.",
    ctaLabel: "Sign In To Sanctuary OS",
    includeToken: true,
  }),
  buildAuthTemplatePair({
    id: "email_change",
    labelKey: "keepers_auth_tpl_email_change",
    labelDefault: "Change Email Address",
    subject: "Confirm Your New Sanctuary OS Email",
    descriptionKey: "keepers_auth_tpl_email_change_desc",
    descriptionDefault: "Supabase Dashboard -> Authentication -> Emails -> Change email address",
    bodyText:
      "A request was made to update the email address associated with your Sanctuary OS Hub account.\n\nConfirm this change below to bind your new address, or ignore this dispatch if you did not authorize the update.",
    ctaLabel: "Confirm Email Change",
    includeToken: true,
  }),
];
