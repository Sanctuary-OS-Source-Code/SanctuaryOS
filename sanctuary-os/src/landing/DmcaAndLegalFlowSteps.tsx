import { useEffect, useState } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabaseAuth } from "../supabase";
import { CustomDropdown, VAULT_CHIP_CLASS } from "../shared";
import {
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
} from "../components/universal/UniversalLayout";

export type LegalNoticeSubType =
  | "dmca_takedown"
  | "dmca_counter"
  | "privacy_general";

export interface LegalTargetItem {
  identifier: string;
  kind: "mod" | "blueprint" | "collection";
  title: string;
  subtitle?: string;
  is_held?: boolean;
}

export interface LegalComplianceDraft {
  subType: LegalNoticeSubType;
  targetScope: "hub" | "spoke";
  targetSpokeId: string;
  selectedTargets: LegalTargetItem[];
  targetIdentifiersRaw: string;
  showManualIdentifierInput?: boolean;
  originalNoticeId: string;
  workDescription: string;
  workUrl: string;
  fullLegalName: string;
  companyOrAgent: string;
  physicalAddress: string;
  phone: string;
  goodFaithAttested: boolean;
  perjuryAuthorityAttested: boolean;
  jurisdictionAttested: boolean;
  forwardingAcknowledged: boolean;
  electronicSignature: string;
}

export const DEFAULT_LEGAL_COMPLIANCE_DRAFT: LegalComplianceDraft = {
  subType: "dmca_takedown",
  targetScope: "hub",
  targetSpokeId: "",
  selectedTargets: [],
  targetIdentifiersRaw: "",
  showManualIdentifierInput: false,
  originalNoticeId: "",
  workDescription: "",
  workUrl: "",
  fullLegalName: "",
  companyOrAgent: "",
  physicalAddress: "",
  phone: "",
  goodFaithAttested: false,
  perjuryAuthorityAttested: false,
  jurisdictionAttested: false,
  forwardingAcknowledged: false,
  electronicSignature: "",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_REGEX = /^[0-9a-f]{64}$/i;
const BLUEPRINT_CODE_REGEX = /^[A-Za-z0-9_-]{4,64}$/;
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const REAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const BLINDED_EMAIL_REGEX = /@blind\.sanctuaryos\.(net|local)$/i;

export function isRealLegalEmail(raw?: string): boolean {
  const email = String(raw || "").trim();
  if (!email || email.startsWith("@")) return false;
  if (BLINDED_EMAIL_REGEX.test(email)) return false;
  return REAL_EMAIL_REGEX.test(email);
}

export function parseLegalTargetIdentifiers(raw: string): string[] {
  const tokens = String(raw || "")
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

export function collectAllLegalTargetIdentifiers(
  draft: LegalComplianceDraft
): string[] {
  const picked = (draft.selectedTargets || [])
    .map((item) => String(item?.identifier || "").trim())
    .filter(Boolean);
  const manual = parseLegalTargetIdentifiers(draft.targetIdentifiersRaw || "");
  return Array.from(new Set([...picked, ...manual]));
}

export function isValidTargetIdentifierToken(
  token: string,
  targetScope: "hub" | "spoke" = "spoke"
): boolean {
  if (!token || /\s/.test(token)) return false;
  if (targetScope === "hub" && URL_REGEX.test(token)) return true;
  return (
    UUID_REGEX.test(token) ||
    SHA256_REGEX.test(token) ||
    BLUEPRINT_CODE_REGEX.test(token)
  );
}

export function isLegalComplianceDraftValid(
  draft: LegalComplianceDraft,
  replyEmail: string,
  subject: string,
  body: string
): boolean {
  if (draft.subType === "privacy_general") {
    return Boolean(
      replyEmail.trim().length >= 3 &&
        subject.trim().length >= 3 &&
        body.trim().length >= 10
    );
  }

  if (!isRealLegalEmail(replyEmail)) return false;
  if (draft.targetScope === "spoke" && !UUID_REGEX.test(draft.targetSpokeId)) {
    return false;
  }

  const tokens = collectAllLegalTargetIdentifiers(draft);
  const sigMatches =
    draft.electronicSignature.trim().length >= 3 &&
    draft.electronicSignature.trim().toLowerCase() ===
      draft.fullLegalName.trim().toLowerCase();

  const hasContactBlock = Boolean(
    draft.fullLegalName.trim().length >= 3 &&
      draft.physicalAddress.trim().length >= 8 &&
      draft.phone.trim().length >= 7 &&
      sigMatches
  );
  if (!hasContactBlock) return false;

  if (draft.subType === "dmca_takedown") {
    const validIds =
      tokens.length > 0 &&
      tokens.every((tok) => isValidTargetIdentifierToken(tok, draft.targetScope));
    const validUrl = URL_REGEX.test(draft.workUrl.trim());
    const validDesc = draft.workDescription.trim().length >= 15;
    return Boolean(
      validIds &&
        validUrl &&
        validDesc &&
        draft.goodFaithAttested &&
        draft.perjuryAuthorityAttested
    );
  }

  // dmca_counter
  const hasNoticeOrIds =
    UUID_REGEX.test(draft.originalNoticeId.trim()) ||
    (tokens.length > 0 &&
      tokens.every((tok) => isValidTargetIdentifierToken(tok, draft.targetScope)));
  const validCounterDesc = draft.workDescription.trim().length >= 10;
  return Boolean(
    hasNoticeOrIds &&
      validCounterDesc &&
      draft.goodFaithAttested &&
      draft.perjuryAuthorityAttested &&
      draft.jurisdictionAttested &&
      draft.forwardingAcknowledged
  );
}

interface StatutoryCheckboxCardProps {
  checked: boolean;
  onToggle: () => void;
  title: string;
  label: string;
}

function StatutoryCheckboxCard({
  checked,
  onToggle,
  title,
  label,
}: StatutoryCheckboxCardProps) {
  const { t } = useLexicon();
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left p-3.5 rounded-2xl glass-surface border flex items-start gap-3 transition-all cursor-pointer no-text-case ${
        checked
          ? "border-[var(--accent)]"
          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
      }`}
    >
      <span
        className={`material-symbols-outlined !text-[20px] shrink-0 mt-0.5 ${
          checked ? "text-[var(--accent)]" : "text-[var(--subtext)] opacity-55"
        }`}
      >
        {checked
          ? t("icon_check_box", "check_box")
          : t("icon_check_box_outline_blank", "check_box_outline_blank")}
      </span>
      <div className="flex flex-col gap-1 min-w-0 flex-1 no-text-case">
        <span className="text-xs font-black text-[var(--text)] leading-snug no-text-case">
          {title}
        </span>
        <span className="text-xs font-normal text-[var(--subtext)] leading-relaxed no-text-case">
          {label}
        </span>
      </div>
    </button>
  );
}

export function DmcaSubTypeSelector({
  draft,
  onChange,
}: {
  draft: LegalComplianceDraft;
  onChange: (next: LegalComplianceDraft) => void;
}) {
  const { t } = useLexicon();
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
        {t("dmca_request_type_label", "Request Type")}
      </label>
      <CustomDropdown
        disableTint={true}
        value={draft.subType}
        onChange={(vals: string[]) => {
          const picked = (vals[0] || "dmca_takedown") as LegalNoticeSubType;
          onChange({
            ...draft,
            subType: picked,
            selectedTargets: [],
            goodFaithAttested: false,
            perjuryAuthorityAttested: false,
            jurisdictionAttested: false,
            forwardingAcknowledged: false,
          });
        }}
        options={[
          {
            id: "dmca_takedown",
            label: t("dmca_opt_takedown", "DMCA Takedown Notice"),
          },
          {
            id: "dmca_counter",
            label: t("dmca_opt_counter", "DMCA Counter-Notice"),
          },
          {
            id: "privacy_general",
            label: t("dmca_opt_privacy", "Privacy or General Legal Inquiry"),
          },
        ]}
      />
    </div>
  );
}

interface DmcaStep2FormProps {
  draft: LegalComplianceDraft;
  onChange: (next: LegalComplianceDraft) => void;
  games: any[];
  replyEmail: string;
  onReplyEmailChange: (val: string) => void;
}

export function DmcaGuidedComplianceForm({
  draft,
  onChange,
  games,
  replyEmail,
  onReplyEmailChange,
}: DmcaStep2FormProps) {
  const { t } = useLexicon();
  const [spokeSearchQuery, setSpokeSearchQuery] = useState("");
  const [spokeItems, setSpokeItems] = useState<LegalTargetItem[]>([]);
  const [isSearchingSpoke, setIsSearchingSpoke] = useState(false);

  const activePublicSpokes = (games || []).filter(
    (g) => g?.id && g?.is_active !== false && g?.is_keepers_only !== true
  );
  const scopeOptions = [
    {
      id: "hub",
      label: t("dmca_form_scope_platform", "Sanctuary OS (Platform & Website)"),
    },
    ...activePublicSpokes.map((g) => ({
      id: String(g.id),
      label: String(g.name || g.schema_id || g.id),
    })),
  ];

  useEffect(() => {
    if (draft.targetScope !== "spoke" || !UUID_REGEX.test(draft.targetSpokeId)) {
      setSpokeItems([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearchingSpoke(true);
      try {
        const token = useStore.getState().session?.access_token || "";
        const { data, error } = await supabaseAuth.functions.invoke(
          "game-gateway",
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: {
              action: "search_spoke_dmca_targets",
              payload: {
                target_spoke_id: draft.targetSpokeId,
                notice_type: draft.subType,
                query: spokeSearchQuery.trim(),
              },
            },
          }
        );
        if (!cancelled && !error && Array.isArray(data?.items)) {
          setSpokeItems(data.items);
        }
      } catch {
        if (!cancelled) setSpokeItems([]);
      } finally {
        if (!cancelled) setIsSearchingSpoke(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.targetScope, draft.targetSpokeId, draft.subType, spokeSearchQuery]);

  const toggleTargetSelection = (item: LegalTargetItem) => {
    const exists = draft.selectedTargets.some(
      (s) =>
        s.identifier.toLowerCase() === item.identifier.toLowerCase() &&
        s.kind === item.kind
    );
    const nextSelected = exists
      ? draft.selectedTargets.filter(
          (s) =>
            !(
              s.identifier.toLowerCase() === item.identifier.toLowerCase() &&
              s.kind === item.kind
            )
        )
      : [...draft.selectedTargets, item];
    onChange({ ...draft, selectedTargets: nextSelected });
  };

  const manualTokens = parseLegalTargetIdentifiers(draft.targetIdentifiersRaw);
  const invalidTokens = manualTokens.filter(
    (tok) => !isValidTargetIdentifierToken(tok, draft.targetScope)
  );
  const signatureMatches =
    draft.electronicSignature.trim().length > 0 &&
    draft.electronicSignature.trim().toLowerCase() ===
      draft.fullLegalName.trim().toLowerCase();

  const kindMeta = (kind: LegalTargetItem["kind"]) => {
    if (kind === "blueprint") {
      return {
        icon: t("icon_layers", "layers"),
        label: t("dmca_kind_blueprint", "{Blueprint}"),
      };
    }
    if (kind === "collection") {
      return {
        icon: t("icon_folder_special", "folder_special"),
        label: t("dmca_kind_collection", "Collection"),
      };
    }
    return {
      icon: t("icon_inventory_2", "inventory_2"),
      label: t("dmca_kind_mod", "{Mod}"),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      {draft.subType === "dmca_counter" && (
        <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-start gap-3">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5">
            {t("icon_info", "info")}
          </span>
          <div className="flex flex-col gap-1 no-text-case">
            <span className="text-xs font-black text-[var(--text)] no-text-case">
              {t("dmca_counter_info_title", "Privacy & Forwarding Notice")}
            </span>
            <p className="text-xs font-normal text-[var(--subtext)] leading-relaxed m-0 no-text-case">
              {t(
                "dmca_counter_privacy_warn_body",
                "Under 17 U.S.C. § 512(g)(3), contesting a takedown requires providing your real legal name, physical mailing address, phone number, and consent to Federal District Court jurisdiction. Sanctuary Foundry is legally required to forward this completed counter-notice directly to the claimant."
              )}
            </p>
          </div>
        </div>
      )}

      <UniversalGroup
        title={t("dmca_form_sec_target", "1. Target Scope & Content")}
        icon={t("icon_hub", "hub")}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
            {`${t("dmca_target_scope_label", "Where Is the Content Hosted?")} *`}
          </label>
          <CustomDropdown
            disableTint={true}
            value={draft.targetScope === "spoke" ? draft.targetSpokeId : "hub"}
            onChange={(vals: string[]) => {
              const picked = vals[0] || "hub";
              setSpokeSearchQuery("");
              if (picked === "hub") {
                onChange({
                  ...draft,
                  targetScope: "hub",
                  targetSpokeId: "",
                  selectedTargets: [],
                  targetIdentifiersRaw: "",
                });
              } else {
                onChange({
                  ...draft,
                  targetScope: "spoke",
                  targetSpokeId: picked,
                  selectedTargets: [],
                  targetIdentifiersRaw: "",
                });
              }
            }}
            options={scopeOptions}
          />
          {draft.targetScope === "spoke" && (
            <span className="text-[11px] text-[var(--subtext)] px-1 leading-relaxed no-text-case">
              {t(
                "dmca_target_scope_hint",
                "Notices for a game workspace route directly to its Wayfinder & Oversight compliance queue with a 48-hour SLA."
              )}
            </span>
          )}
        </div>

        {draft.subType === "dmca_counter" && (
          <UniversalInput
            label={t("dmca_original_notice_id_label", "Original Takedown Reference ID (Optional)")}
            className="no-text-case font-mono"
            value={draft.originalNoticeId}
            onChange={(val) => onChange({ ...draft, originalNoticeId: val })}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        )}

        {draft.targetScope === "spoke" ? (
          <div className="flex flex-col gap-2.5">
            {draft.selectedTargets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.selectedTargets.map((item) => {
                  const meta = kindMeta(item.kind);
                  return (
                    <button
                      key={`${item.kind}:${item.identifier}`}
                      type="button"
                      onClick={() => toggleTargetSelection(item)}
                      className={`${VAULT_CHIP_CLASS} cursor-pointer hover:border-[var(--accent)] no-text-case`}
                    >
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {meta.icon}
                      </span>
                      <span className="truncate max-w-[180px] no-text-case">
                        {item.title}
                      </span>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                        {t("icon_close", "close")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <UniversalInput
              label={`${t("dmca_select_content_label", "Select Reported Content")} *`}
              value={spokeSearchQuery}
              onChange={setSpokeSearchQuery}
              placeholder={t(
                "dmca_spoke_search_ph",
                "Search {mods}, creator name, or {blueprint} code..."
              )}
            />

            <div className="glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] max-h-[210px] overflow-y-auto divide-y divide-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              {isSearchingSpoke ? (
                <div className="px-3.5 py-4 text-xs text-[var(--subtext)] flex items-center gap-2 no-text-case">
                  <span className="material-symbols-outlined !text-[16px] animate-spin">
                    {t("icon_sync", "sync")}
                  </span>
                  <span>{t("dmca_spoke_searching", "Searching workspace catalog...")}</span>
                </div>
              ) : spokeItems.length === 0 ? (
                <div className="px-3.5 py-4 text-xs text-[var(--subtext)] no-text-case">
                  {t(
                    "dmca_spoke_no_matches",
                    "No matching items found in this workspace catalog."
                  )}
                </div>
              ) : (
                spokeItems.map((item) => {
                  const isSelected = draft.selectedTargets.some(
                    (s) =>
                      s.identifier.toLowerCase() === item.identifier.toLowerCase() &&
                      s.kind === item.kind
                  );
                  const meta = kindMeta(item.kind);
                  return (
                    <button
                      key={`${item.kind}:${item.identifier}`}
                      type="button"
                      onClick={() => toggleTargetSelection(item)}
                      className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer no-text-case ${
                        isSelected
                          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                          : "hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`material-symbols-outlined !text-[18px] shrink-0 ${
                            isSelected ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                          }`}
                        >
                          {meta.icon}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-[var(--text)] truncate no-text-case">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-[var(--subtext)] truncate no-text-case">
                            {meta.label}
                            {item.subtitle ? ` • ${item.subtitle}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.is_held && (
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="text-[var(--warning)]">
                              {t("dmca_hold_chip", "DMCA Hold")}
                            </span>
                          </span>
                        )}
                        <span
                          className={`material-symbols-outlined !text-[18px] ${
                            isSelected
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] opacity-55"
                          }`}
                        >
                          {isSelected
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_add_circle_outline", "add_circle_outline")}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  showManualIdentifierInput: !draft.showManualIdentifierInput,
                })
              }
              className="text-[11px] font-bold text-[var(--accent)] hover:underline text-left w-max px-1 cursor-pointer no-text-case"
            >
              {draft.showManualIdentifierInput
                ? t("dmca_manual_id_hide", "Hide manual identifier entry")
                : t(
                    "dmca_manual_id_toggle",
                    "Can't find an item? Enter a SHA-256 hash or UUID manually"
                  )}
            </button>

            {draft.showManualIdentifierInput && (
              <UniversalTextArea
                label={t("dmca_manual_id_label", "Manual UUID, {Blueprint} Code, or SHA-256 Hash")}
                className="no-text-case font-mono min-h-[72px]"
                value={draft.targetIdentifiersRaw}
                onChange={(val) => onChange({ ...draft, targetIdentifiersRaw: val })}
                placeholder={t(
                  "dmca_manual_id_ph",
                  "Optional: paste specific UUID(s), Blueprint code(s), or 64-character SHA-256 hash(es)..."
                )}
              />
            )}
          </div>
        ) : (
          <UniversalInput
            label={`${t("dmca_hub_url_or_ref_label", "Page URL or Content Reference")} *`}
            className="no-text-case"
            value={draft.targetIdentifiersRaw}
            onChange={(val) => onChange({ ...draft, targetIdentifiersRaw: val })}
            placeholder="https://sanctuaryos.net/..."
          />
        )}

        {invalidTokens.length > 0 && (
          <span className="text-[11px] font-bold text-[var(--danger)] px-1 no-text-case">
            {`${t(
              "dmca_invalid_identifiers_err",
              "Invalid reference format — please select content from the list or provide a valid URL, UUID, {Blueprint} code, or 64-hex SHA-256:"
            )} ${invalidTokens.join(", ")}`}
          </span>
        )}
      </UniversalGroup>

      <UniversalGroup
        title={
          draft.subType === "dmca_takedown"
            ? t("dmca_form_sec_work", "2. Original Copyrighted Work")
            : t("dmca_form_sec_removed", "2. Removed Content & Explanation")
        }
        icon={t("icon_description", "description")}
      >
        <UniversalTextArea
          label={`${
            draft.subType === "dmca_takedown"
              ? t("dmca_work_description_label", "Description of Original Work")
              : t(
                  "dmca_counter_work_desc_label",
                  "Why Was the Content Removed by Mistake or Misidentification?"
                )
          } *`}
          value={draft.workDescription}
          onChange={(val) => onChange({ ...draft, workDescription: val })}
          className="min-h-[96px] no-text-case"
          placeholder={
            draft.subType === "dmca_takedown"
              ? t(
                  "dmca_work_description_ph",
                  "Describe the original copyrighted work allegedly infringed (minimum 15 characters)..."
                )
              : t(
                  "dmca_counter_work_desc_ph",
                  "Identify the removed item and explain why removal was a mistake or misidentification..."
                )
          }
        />

        {draft.subType === "dmca_takedown" && (
          <UniversalInput
            label={`${t("dmca_work_url_label", "Authorized Reference URL")} *`}
            className="no-text-case"
            value={draft.workUrl}
            onChange={(val) => onChange({ ...draft, workUrl: val })}
            placeholder="https://example.com/original-work"
          />
        )}
      </UniversalGroup>

      <UniversalGroup
        title={t("dmca_form_sec_contact", "3. Contact Information")}
        icon={t("icon_badge", "badge")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UniversalInput
            label={`${t("dmca_legal_name_label", "Full Legal Name")} *`}
            value={draft.fullLegalName}
            onChange={(val) => onChange({ ...draft, fullLegalName: val })}
            placeholder={t("dmca_legal_name_ph", "Jane Doe")}
          />
          <UniversalInput
            label={t("dmca_company_agent_label", "Company / Organization (Optional)")}
            value={draft.companyOrAgent}
            onChange={(val) => onChange({ ...draft, companyOrAgent: val })}
            placeholder={t("dmca_company_agent_ph", "Rights holder or authorized agent")}
          />
          <UniversalInput
            label={`${t("dmca_phone_label", "Phone Number")} *`}
            className="no-text-case"
            value={draft.phone}
            onChange={(val) => onChange({ ...draft, phone: val })}
            placeholder="+1 (555) 010-9900"
          />
          <UniversalInput
            label={`${t("dmca_email_short_label", "Email Address")} *`}
            type="email"
            className="no-text-case"
            value={replyEmail}
            onChange={onReplyEmailChange}
            placeholder="legal@company.com"
          />
        </div>
        <UniversalTextArea
          label={`${t("dmca_physical_address_label", "Mailing Address")} *`}
          value={draft.physicalAddress}
          onChange={(val) => onChange({ ...draft, physicalAddress: val })}
          className="min-h-[72px] no-text-case"
          placeholder={t(
            "dmca_physical_address_ph",
            "Street address, suite, city, state/province, postal code, and country..."
          )}
        />
      </UniversalGroup>

      <UniversalGroup
        title={t("dmca_form_sec_declarations", "4. Declarations & Signature")}
        icon={t("icon_verified_user", "verified_user")}
      >
        {draft.subType === "dmca_takedown" ? (
          <div className="flex flex-col gap-2.5">
            <StatutoryCheckboxCard
              checked={draft.goodFaithAttested}
              onToggle={() =>
                onChange({ ...draft, goodFaithAttested: !draft.goodFaithAttested })
              }
              title={t("dmca_cb_good_faith_title", "Good-Faith Belief")}
              label={t(
                "dmca_clause_good_faith_text",
                "I have a good-faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law."
              )}
            />
            <StatutoryCheckboxCard
              checked={draft.perjuryAuthorityAttested}
              onToggle={() =>
                onChange({
                  ...draft,
                  perjuryAuthorityAttested: !draft.perjuryAuthorityAttested,
                })
              }
              title={t(
                "dmca_cb_perjury_title",
                "Accuracy & Authorization (Under Penalty of Perjury)"
              )}
              label={t(
                "dmca_clause_perjury_text",
                "Under penalty of perjury, the information in this notification is accurate and I am the copyright owner, or am authorized to act on behalf of the owner, of an exclusive right that is allegedly infringed."
              )}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <StatutoryCheckboxCard
              checked={draft.goodFaithAttested && draft.perjuryAuthorityAttested}
              onToggle={() => {
                const next = !(draft.goodFaithAttested && draft.perjuryAuthorityAttested);
                onChange({
                  ...draft,
                  goodFaithAttested: next,
                  perjuryAuthorityAttested: next,
                });
              }}
              title={t(
                "dmca_cb_mistake_title",
                "Mistake or Misidentification (Under Penalty of Perjury)"
              )}
              label={t(
                "dmca_counter_perjury_text",
                "I declare under penalty of perjury that I have a good-faith belief the material was removed or disabled as a result of mistake or misidentification of the material to be removed or disabled."
              )}
            />
            <StatutoryCheckboxCard
              checked={draft.jurisdictionAttested}
              onToggle={() =>
                onChange({ ...draft, jurisdictionAttested: !draft.jurisdictionAttested })
              }
              title={t("dmca_cb_jurisdiction_title", "Federal Court Jurisdiction Consent")}
              label={t(
                "dmca_counter_jurisdiction_text",
                "I consent to the jurisdiction of the Federal District Court for the judicial district in which my address is located (or any judicial district in which the service provider may be found if outside the U.S.) and will accept service of process from the claimant."
              )}
            />
            <StatutoryCheckboxCard
              checked={draft.forwardingAcknowledged}
              onToggle={() =>
                onChange({
                  ...draft,
                  forwardingAcknowledged: !draft.forwardingAcknowledged,
                })
              }
              title={t("dmca_cb_forwarding_title", "Claimant Forwarding Acknowledgment")}
              label={t(
                "dmca_counter_forward_text",
                "I acknowledge that my full legal name, physical address, phone number, and counter-notice statement will be forwarded directly to the copyright claimant under federal law."
              )}
            />
          </div>
        )}

        <UniversalInput
          label={`${t("dmca_electronic_signature_label", "Electronic Signature (Type your Full Legal Name)")} *`}
          value={draft.electronicSignature}
          onChange={(val) => onChange({ ...draft, electronicSignature: val })}
          placeholder={draft.fullLegalName || t("dmca_legal_name_ph", "Jane Doe")}
        />
        {draft.electronicSignature.trim() && !signatureMatches && (
          <span className="text-[11px] font-bold text-[var(--danger)] px-1 no-text-case">
            {t(
              "dmca_signature_mismatch_err",
              "Electronic signature must match your Full Legal Name above."
            )}
          </span>
        )}
      </UniversalGroup>
    </div>
  );
}
