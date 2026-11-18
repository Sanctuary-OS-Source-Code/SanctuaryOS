import { useLexicon } from "../LexiconContext";
import {
  CustomDropdown,
  DashboardStatTile,
  SidePanelFilterBar,
  VAULT_CHIP_CLASS,
} from "../shared";
import {
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
} from "../components/universal/UniversalLayout";

export type LegalNoticeSubType =
  | "dmca_takedown"
  | "dmca_counter"
  | "privacy_general";

export interface LegalComplianceDraft {
  subType: LegalNoticeSubType;
  targetScope: "hub" | "spoke";
  targetSpokeId: string;
  targetIdentifiersRaw: string;
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
  targetIdentifiersRaw: "",
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

export function isValidTargetIdentifierToken(token: string): boolean {
  if (!token || /\s/.test(token)) return false;
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

  const tokens = parseLegalTargetIdentifiers(draft.targetIdentifiersRaw);
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
      tokens.length > 0 && tokens.every(isValidTargetIdentifierToken);
    const validUrl = /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(draft.workUrl.trim());
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
    (tokens.length > 0 && tokens.every(isValidTargetIdentifierToken));
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
  badgeText: string;
  label: string;
  highlightDanger?: boolean;
}

function StatutoryCheckboxCard({
  checked,
  onToggle,
  badgeText,
  label,
  highlightDanger = false,
}: StatutoryCheckboxCardProps) {
  const { t } = useLexicon();
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left p-3.5 rounded-2xl glass-surface border flex items-start gap-3 transition-all cursor-pointer ${
        checked
          ? highlightDanger
            ? "border-[var(--warning)]"
            : "border-[var(--accent)]"
          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
      }`}
    >
      <span
        className={`material-symbols-outlined !text-[20px] shrink-0 mt-0.5 ${
          checked
            ? highlightDanger
              ? "text-[var(--warning)]"
              : "text-[var(--accent)]"
            : "text-[var(--subtext)] opacity-55"
        }`}
      >
        {checked
          ? t("icon_check_box", "check_box")
          : t("icon_check_box_outline_blank", "check_box_outline_blank")}
      </span>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className={VAULT_CHIP_CLASS}>
          <span
            className={`material-symbols-outlined !text-[12px] ${
              highlightDanger ? "text-[var(--warning)]" : "text-[var(--accent)]"
            }`}
          >
            {highlightDanger ? t("icon_gavel", "gavel") : t("icon_verified", "verified")}
          </span>
          <span>{badgeText}</span>
        </span>
        <span className="text-xs font-medium text-[var(--text)] leading-relaxed">
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
    <div className="flex flex-col gap-2.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
        {t("dmca_subtype_label", "Select Legal / Compliance Flow")}
      </span>
      <SidePanelFilterBar className="grid-cols-1 sm:grid-cols-3 gap-2.5">
        <DashboardStatTile
          variant="filter"
          className="!w-full"
          isActive={draft.subType === "dmca_takedown"}
          icon={t("icon_copyright", "copyright")}
          label={t("dmca_flow_takedown_label", "DMCA Takedown")}
          value={t("dmca_flow_takedown_statute", "§ 512(c)(3)")}
          onClick={() =>
            onChange({
              ...draft,
              subType: "dmca_takedown",
              goodFaithAttested: false,
              perjuryAuthorityAttested: false,
              jurisdictionAttested: false,
              forwardingAcknowledged: false,
            })
          }
        />
        <DashboardStatTile
          variant="filter"
          className="!w-full"
          isActive={draft.subType === "dmca_counter"}
          icon={t("icon_gavel", "gavel")}
          label={t("dmca_flow_counter_label", "Counter-Notice")}
          value={t("dmca_flow_counter_statute", "§ 512(g)(3)")}
          onClick={() =>
            onChange({
              ...draft,
              subType: "dmca_counter",
              goodFaithAttested: false,
              perjuryAuthorityAttested: false,
              jurisdictionAttested: false,
              forwardingAcknowledged: false,
            })
          }
        />
        <DashboardStatTile
          variant="filter"
          className="!w-full"
          isActive={draft.subType === "privacy_general"}
          icon={t("icon_policy", "policy")}
          label={t("dmca_flow_privacy_label", "Privacy & Legal")}
          value={t("dmca_flow_privacy_tag", "General")}
          onClick={() =>
            onChange({
              ...draft,
              subType: "privacy_general",
            })
          }
        />
      </SidePanelFilterBar>
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
  const activePublicSpokes = (games || []).filter(
    (g) => g?.id && g?.is_active !== false && g?.is_keepers_only !== true
  );
  const scopeOptions = [
    {
      id: "hub",
      label: t("dmca_scope_core", "Sanctuary OS Core Infrastructure (Keepers Core)"),
    },
    ...activePublicSpokes.map((g) => ({
      id: String(g.id),
      label: `${g.name || g.schema_id} (${t("keepers_tab_partner_spokes", "Partner Spoke")})`,
    })),
  ];

  const identifierTokens = parseLegalTargetIdentifiers(draft.targetIdentifiersRaw);
  const invalidTokens = identifierTokens.filter(
    (tok) => !isValidTargetIdentifierToken(tok)
  );
  const signatureMatches =
    draft.electronicSignature.trim().length > 0 &&
    draft.electronicSignature.trim().toLowerCase() ===
      draft.fullLegalName.trim().toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      {draft.subType === "dmca_counter" && (
        <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] flex items-start gap-3">
          <span className="material-symbols-outlined !text-[20px] text-[var(--warning)] shrink-0 mt-0.5">
            {t("icon_warning", "warning")}
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--warning)]">
              {t("dmca_counter_privacy_warn_title", "Zero-PII & Blinded Email Legal Disclosure Notice")}
            </span>
            <p className="text-xs font-medium text-[var(--text)] leading-relaxed">
              {t(
                "dmca_counter_privacy_warn_body",
                "Under 17 U.S.C. § 512(g)(3), contesting a takedown requires providing your real legal name, physical mailing address, phone number, and consent to Federal District Court jurisdiction. Sanctuary Foundry is legally required to forward this completed counter-notice directly to the claimant."
              )}
            </p>
          </div>
        </div>
      )}

      <UniversalGroup
        title={t("dmca_section_scope_targets", "1. Target Scope & Specific Identifiers")}
        icon={t("icon_hub", "hub")}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
            {`${t("dmca_target_scope_label", "Target Network Owner / Scope")} *`}
          </label>
          <CustomDropdown
            disableTint={true}
            value={draft.targetScope === "spoke" ? draft.targetSpokeId : "hub"}
            onChange={(vals: string[]) => {
              const picked = vals[0] || "hub";
              if (picked === "hub") {
                onChange({ ...draft, targetScope: "hub", targetSpokeId: "" });
              } else {
                onChange({ ...draft, targetScope: "spoke", targetSpokeId: picked });
              }
            }}
            options={scopeOptions}
          />
          <span className="text-[11px] text-[var(--subtext)] px-1">
            {t(
              "dmca_target_scope_hint",
              "Partner Spoke notices route directly into that Spoke's Wayfinder & Oversight compliance queue under a strict 48-hour SLA."
            )}
          </span>
        </div>

        {draft.subType === "dmca_counter" && (
          <UniversalInput
            label={t("dmca_original_notice_id_label", "Original Takedown Notice ID (UUID, if provided)")}
            className="no-text-case font-mono"
            value={draft.originalNoticeId}
            onChange={(val) => onChange({ ...draft, originalNoticeId: val })}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        )}

        <UniversalTextArea
          label={`${t("dmca_target_identifiers_label", "Exact Target Identifier(s): UUID, Public Cloud {Blueprint} Code, or 64-char SHA-256 Hash")} *`}
          className="no-text-case font-mono min-h-[84px]"
          value={draft.targetIdentifiersRaw}
          onChange={(val) => onChange({ ...draft, targetIdentifiersRaw: val })}
          placeholder={t(
            "dmca_target_identifiers_ph",
            "One UUID, public Cloud Blueprint uplink code, or 64-character SHA-256 hash per line (blanket studio demands without specific identifiers are rejected)..."
          )}
        />
        {invalidTokens.length > 0 && (
          <span className="text-[11px] font-bold text-[var(--danger)] px-1">
            {`${t("dmca_invalid_identifiers_err", "Invalid identifier format — each entry must be an exact UUID, Blueprint code (4–64 chars, no spaces), or 64-hex SHA-256:")} ${invalidTokens.join(", ")}`}
          </span>
        )}
      </UniversalGroup>

      <UniversalGroup
        title={
          draft.subType === "dmca_takedown"
            ? t("dmca_section_work_proof", "2. Copyrighted Work Proof")
            : t("dmca_section_removed_material", "2. Removed Material & Misidentification Basis")
        }
        icon={t("icon_description", "description")}
      >
        <UniversalTextArea
          label={`${
            draft.subType === "dmca_takedown"
              ? t("dmca_work_description_label", "Description of Original Copyrighted Work")
              : t("dmca_counter_work_desc_label", "Description of Removed Material & Good-Faith Mistake Basis")
          } *`}
          value={draft.workDescription}
          onChange={(val) => onChange({ ...draft, workDescription: val })}
          className="min-h-[100px]"
          placeholder={
            draft.subType === "dmca_takedown"
              ? t(
                  "dmca_work_description_ph",
                  "Identify and describe the original copyrighted work allegedly infringed (minimum 15 characters)..."
                )
              : t(
                  "dmca_counter_work_desc_ph",
                  "Describe the material removed and explain why removal was a mistake or misidentification..."
                )
          }
        />

        {draft.subType === "dmca_takedown" && (
          <UniversalInput
            label={`${t("dmca_work_url_label", "Official Copyrighted Work / Reference URL")} *`}
            className="no-text-case"
            value={draft.workUrl}
            onChange={(val) => onChange({ ...draft, workUrl: val })}
            placeholder="https://example.com/original-work"
          />
        )}
      </UniversalGroup>

      <UniversalGroup
        title={t("dmca_section_legal_contact", "3. Full Statutory Contact Block (Encrypted Vault)")}
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
            label={t("dmca_company_agent_label", "Studio / Organization / Agent (Optional)")}
            value={draft.companyOrAgent}
            onChange={(val) => onChange({ ...draft, companyOrAgent: val })}
            placeholder={t("dmca_company_agent_ph", "Rights Holder or Authorized Agent")}
          />
          <UniversalInput
            label={`${t("dmca_phone_label", "Telephone Number")} *`}
            className="no-text-case"
            value={draft.phone}
            onChange={(val) => onChange({ ...draft, phone: val })}
            placeholder="+1 (555) 010-9900"
          />
          <UniversalInput
            label={`${t("dmca_real_email_label", "Valid Legal Email Address (No @handles or Blinded Aliases)")} *`}
            type="email"
            className="no-text-case"
            value={replyEmail}
            onChange={onReplyEmailChange}
            placeholder="legal@company.com"
          />
        </div>
        <UniversalTextArea
          label={`${t("dmca_physical_address_label", "Full Physical Mailing Address")} *`}
          value={draft.physicalAddress}
          onChange={(val) => onChange({ ...draft, physicalAddress: val })}
          className="min-h-[72px]"
          placeholder={t(
            "dmca_physical_address_ph",
            "Street address, suite, city, state/province, postal code, and country..."
          )}
        />
      </UniversalGroup>

      <UniversalGroup
        title={t("dmca_section_attestations", "4. Statutory Statements & Electronic Signature")}
        icon={t("icon_verified_user", "verified_user")}
      >
        {draft.subType === "dmca_takedown" ? (
          <div className="flex flex-col gap-2.5">
            <StatutoryCheckboxCard
              checked={draft.goodFaithAttested}
              onToggle={() =>
                onChange({ ...draft, goodFaithAttested: !draft.goodFaithAttested })
              }
              badgeText={t("dmca_clause_good_faith_badge", "17 U.S.C. § 512(c)(3)(A)(v)")}
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
              highlightDanger={true}
              badgeText={t(
                "dmca_clause_perjury_badge",
                "Penalty of Perjury • § 512(c)(3)(A)(vi) & § 512(f)"
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
              highlightDanger={true}
              badgeText={t("dmca_counter_perjury_badge", "Penalty of Perjury • § 512(g)(3)(C)")}
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
              badgeText={t("dmca_counter_jurisdiction_badge", "Federal Jurisdiction • § 512(g)(3)(D)")}
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
              highlightDanger={true}
              badgeText={t("dmca_counter_forward_badge", "Claimant Forwarding Required")}
              label={t(
                "dmca_counter_forward_text",
                "I acknowledge that my full legal name, physical address, phone number, and counter-notice statement will be forwarded directly to the copyright claimant under federal law."
              )}
            />
          </div>
        )}

        <UniversalInput
          label={`${t("dmca_electronic_signature_label", "Electronic Signature (Must match Full Legal Name above)")} *`}
          value={draft.electronicSignature}
          onChange={(val) => onChange({ ...draft, electronicSignature: val })}
          placeholder={draft.fullLegalName || t("dmca_legal_name_ph", "Jane Doe")}
        />
        {draft.electronicSignature.trim() && !signatureMatches && (
          <span className="text-[11px] font-bold text-[var(--danger)] px-1">
            {t(
              "dmca_signature_mismatch_err",
              "Electronic signature must exactly match your Full Legal Name above."
            )}
          </span>
        )}
      </UniversalGroup>
    </div>
  );
}
