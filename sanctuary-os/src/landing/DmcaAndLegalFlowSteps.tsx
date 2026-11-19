import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabaseAuth } from "../supabase";
import { CustomDropdown, VAULT_CHIP_CLASS } from "../shared";
import {
  computeDropdownViewportCoords,
  type DropdownViewportCoords,
} from "../shared-components/dropdown-controls/typesAndPosition";
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

const PLACEHOLDER_LEGAL_NAMES = new Set([
  "none",
  "n/a",
  "na",
  "null",
  "unknown",
  "anonymous",
  "redacted",
  "private",
]);

const JUNK_ADDRESS_PREFIXES = [
  "n/a",
  "none",
  "unknown",
  "online only",
  "digital only",
  "no address",
  "internet",
  "123 fake",
];

export function isRealLegalEmail(raw?: string): boolean {
  const email = String(raw || "").trim();
  if (!email || email.startsWith("@")) return false;
  if (BLINDED_EMAIL_REGEX.test(email)) return false;
  return REAL_EMAIL_REGEX.test(email);
}

export function isPlausibleLegalName(raw?: string): boolean {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("@") || trimmed.includes("@")) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  if (PLACEHOLDER_LEGAL_NAMES.has(trimmed.toLowerCase())) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every(
    (tok) => tok.replace(/[^a-zA-Z0-9\p{L}]/gu, "").length >= 2
  );
}

export function isPlausiblePhysicalAddress(raw?: string): boolean {
  const trimmed = String(raw || "").trim();
  if (trimmed.length < 12) return false;
  if (!/\d/.test(trimmed)) return false;
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (
    JUNK_ADDRESS_PREFIXES.some(
      (prefix) => lower === prefix || lower.startsWith(prefix)
    )
  ) {
    return false;
  }
  return true;
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
    isPlausibleLegalName(draft.fullLegalName) &&
      isPlausiblePhysicalAddress(draft.physicalAddress) &&
      draft.phone.trim().length >= 7 &&
      sigMatches
  );
  if (!hasContactBlock) return false;

  if (draft.subType === "dmca_takedown") {
    const validIds =
      tokens.length > 0 &&
      tokens.every((tok) => isValidTargetIdentifierToken(tok, draft.targetScope));
    const trimmedUrl = draft.workUrl.trim();
    const validOptionalUrl = trimmedUrl.length === 0 || URL_REGEX.test(trimmedUrl);
    const validDesc = draft.workDescription.trim().length >= 15;
    return Boolean(
      validIds &&
        validOptionalUrl &&
        validDesc &&
        draft.goodFaithAttested &&
        draft.perjuryAuthorityAttested &&
        draft.forwardingAcknowledged
    );
  }

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
      <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
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
}

export function DmcaGuidedComplianceForm({
  draft,
  onChange,
  games,
}: DmcaStep2FormProps) {
  const { t } = useLexicon();
  const [spokeSearchQuery, setSpokeSearchQuery] = useState("");
  const [spokeItems, setSpokeItems] = useState<LegalTargetItem[]>([]);
  const [isSearchingSpoke, setIsSearchingSpoke] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const instanceId = useId();
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<DropdownViewportCoords>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 260,
    isRight: false,
    isDropUp: false,
  });

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
    if (!isPickerOpen) return;
    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", {
        detail: { id: instanceId, triggerEl: inputWrapRef.current },
      })
    );
    const onOtherOpen = (e: any) => {
      const detailId =
        typeof e.detail === "object" && e.detail !== null ? e.detail.id : e.detail;
      if (detailId !== instanceId) setIsPickerOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputWrapRef.current &&
        !inputWrapRef.current.contains(target) &&
        (!popoverRef.current || !popoverRef.current.contains(target))
      ) {
        setIsPickerOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPickerOpen(false);
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("sa-close-popovers", onOtherOpen);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isPickerOpen, instanceId]);

  useLayoutEffect(() => {
    if (!isPickerOpen) return;
    const updatePosition = (e?: Event) => {
      if (
        e &&
        e.type === "scroll" &&
        popoverRef.current &&
        e.target instanceof Node &&
        popoverRef.current.contains(e.target)
      ) {
        return;
      }
      if (inputWrapRef.current) {
        const rect = inputWrapRef.current.getBoundingClientRect();
        const minW = Math.max(220, Math.round(rect.width));
        const computed = computeDropdownViewportCoords(rect, {
          preferredHeight: 260,
          minWidth: minW,
          gap: 6,
        });
        const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
        computed.width = Math.min(Math.round(rect.width), Math.max(200, vw - 24));
        setCoords(computed);
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (
      draft.subType !== "dmca_takedown" ||
      draft.targetScope !== "spoke" ||
      !UUID_REGEX.test(draft.targetSpokeId)
    ) {
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
                notice_type: "dmca_takedown",
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
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.subType, draft.targetScope, draft.targetSpokeId, spokeSearchQuery]);

  const selectOrToggleTarget = (item: LegalTargetItem) => {
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
    setSpokeSearchQuery("");
    setIsPickerOpen(false);
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
        title={t("dmca_form_sec_target", "Target Scope & Content")}
        icon={t("icon_hub", "hub")}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
            {`${t("dmca_target_scope_label", "Where Is the Content Hosted?")} *`}
          </label>
          <CustomDropdown
            disableTint={true}
            value={draft.targetScope === "spoke" ? draft.targetSpokeId : "hub"}
            onChange={(vals: string[]) => {
              const picked = vals[0] || "hub";
              setSpokeSearchQuery("");
              setIsPickerOpen(false);
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
            label={`${t("dmca_original_notice_id_label", "Original Takedown Notice ID (UUID)")} ${draft.targetScope === "spoke" ? "*" : ""}`}
            className="no-text-case font-mono"
            value={draft.originalNoticeId}
            onChange={(val) => onChange({ ...draft, originalNoticeId: val })}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        )}

        {draft.subType === "dmca_takedown" && draft.targetScope === "spoke" ? (
          <div className="flex flex-col gap-2.5">
            {draft.selectedTargets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.selectedTargets.map((item) => {
                  const meta = kindMeta(item.kind);
                  return (
                    <button
                      key={`${item.kind}:${item.identifier}`}
                      type="button"
                      onClick={() => selectOrToggleTarget(item)}
                      className={`${VAULT_CHIP_CLASS} cursor-pointer hover:border-[var(--accent)] no-text-case`}
                    >
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {meta.icon}
                      </span>
                      <span className="truncate max-w-[200px] no-text-case">
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

            <div ref={inputWrapRef} className="flex flex-col gap-1.5 relative">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                {`${t("dmca_select_content_label", "Select Reported Content")} *`}
              </label>
              <div className="relative w-full">
                <input
                  type="text"
                  data-1p-ignore="true"
                  value={spokeSearchQuery}
                  onFocus={() => setIsPickerOpen(true)}
                  onChange={(e) => {
                    setSpokeSearchQuery(e.target.value);
                    setIsPickerOpen(true);
                  }}
                  placeholder={t(
                    "dmca_spoke_search_ph",
                    "Search {mods}, creator name, or {blueprint} code..."
                  )}
                  className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] rounded-xl pl-3.5 pr-10 text-xs font-medium text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-55 focus:outline-none focus:border-[var(--accent)] transition-all no-text-case"
                />
                <button
                  type="button"
                  onClick={() => setIsPickerOpen((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-70 hover:opacity-100 flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[18px]">
                    {isPickerOpen
                      ? t("icon_expand_less", "expand_less")
                      : t("icon_expand_more", "expand_more")}
                  </span>
                </button>
              </div>
              {isPickerOpen &&
                createPortal(
                  <>
                    <div
                      className="!fixed inset-0 pointer-events-auto"
                      style={{ zIndex: 100000000 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPickerOpen(false);
                      }}
                    />
                    <div
                      ref={popoverRef}
                      onClick={(e) => e.stopPropagation()}
                      className="!fixed glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl pointer-events-auto overflow-hidden flex flex-col text-[var(--text)] animate-in fade-in zoom-in-95 duration-150"
                      style={
                        {
                          zIndex: 100000001,
                          top: coords.isDropUp ? "auto" : coords.top,
                          bottom: coords.isDropUp
                            ? window.innerHeight - coords.top
                            : "auto",
                          left: coords.left,
                          width: coords.width || 280,
                          maxWidth: "calc(100vw - 24px)",
                          maxHeight: coords.maxHeight,
                          "--glass-x": `${Math.round(coords.left)}px`,
                          "--glass-y": `${Math.round(coords.top)}px`,
                        } as React.CSSProperties
                      }
                    >
                      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-1">
                        {isSearchingSpoke ? (
                          <div className="px-3.5 py-3 text-xs text-[var(--subtext)] flex items-center gap-2 no-text-case">
                            <span className="material-symbols-outlined !text-[16px] animate-spin">
                              {t("icon_sync", "sync")}
                            </span>
                            <span>
                              {t("dmca_spoke_searching", "Searching workspace catalog...")}
                            </span>
                          </div>
                        ) : spokeItems.length === 0 ? (
                          <div className="px-3.5 py-3 text-xs text-[var(--subtext)] no-text-case">
                            {t(
                              "dmca_spoke_no_matches",
                              "No matching Tier 0 items found in this workspace."
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectOrToggleTarget(item);
                                }}
                                className={`sa-dropdown-item w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between gap-3 cursor-pointer shrink-0 no-text-case ${
                                  isSelected ? "is-selected font-bold" : "font-medium"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className={`material-symbols-outlined !text-[18px] shrink-0 ${
                                      isSelected
                                        ? "text-[var(--accent)]"
                                        : "text-[var(--subtext)]"
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
                                <span
                                  className={`material-symbols-outlined !text-[18px] shrink-0 ${
                                    isSelected
                                      ? "text-[var(--accent)]"
                                      : "text-[var(--subtext)] opacity-55"
                                  }`}
                                >
                                  {isSelected
                                    ? t("icon_check_circle", "check_circle")
                                    : t("icon_add_circle_outline", "add_circle_outline")}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>,
                  document.getElementById("sa-portals") || document.body
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
                  "Optional: paste specific UUID(s), {Blueprint} code(s), or 64-character SHA-256 hash(es)..."
                )}
              />
            )}
          </div>
        ) : draft.subType === "dmca_counter" && draft.targetScope === "spoke" ? (
          <UniversalInput
            label={t("dmca_counter_item_ref_label", "Or Removed Item UUID / {Blueprint} Code (Optional if Notice ID provided)")}
            className="no-text-case font-mono"
            value={draft.targetIdentifiersRaw}
            onChange={(val) => onChange({ ...draft, targetIdentifiersRaw: val })}
            placeholder={t(
              "dmca_counter_item_ref_ph",
              "Paste item UUID, SHA-256 hash, or {Blueprint} code if Notice ID is unknown"
            )}
          />
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
            ? t("dmca_form_sec_work", "Original Copyrighted Work")
            : t("dmca_form_sec_removed", "Removed Content & Explanation")
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
          <div className="flex flex-col gap-1">
            <UniversalInput
              label={t("dmca_work_url_opt_label", "Original Work / Reference URL (Optional)")}
              className="no-text-case"
              value={draft.workUrl}
              onChange={(val) => onChange({ ...draft, workUrl: val })}
              placeholder="https://example.com/original-work"
            />
            {draft.workUrl.trim().length > 0 && !URL_REGEX.test(draft.workUrl.trim()) && (
              <span className="text-[11px] font-bold text-[var(--warning)] px-1 no-text-case">
                {t(
                  "dmca_invalid_optional_url_err",
                  "Leave blank if no online URL exists, or enter a valid http(s) URL."
                )}
              </span>
            )}
          </div>
        )}
      </UniversalGroup>

      <UniversalGroup
        title={t("dmca_form_sec_contact", "Contact Details")}
        icon={t("icon_badge", "badge")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <UniversalInput
              label={`${t("dmca_legal_name_label", "Full Legal Name")} *`}
              value={draft.fullLegalName}
              onChange={(val) => onChange({ ...draft, fullLegalName: val })}
              placeholder={t("dmca_legal_name_ph", "Jane Doe")}
            />
            {draft.fullLegalName.trim().length > 0 && !isPlausibleLegalName(draft.fullLegalName) && (
              <span className="text-[11px] font-bold text-[var(--warning)] px-1 no-text-case">
                {t(
                  "dmca_invalid_legal_name_err",
                  "Enter your full first and last legal name — aliases, screennames, and handles fail 17 U.S.C. § 512(c)(3)."
                )}
              </span>
            )}
          </div>
          <UniversalInput
            label={`${t("dmca_phone_label", "Phone Number")} *`}
            className="no-text-case"
            value={draft.phone}
            onChange={(val) => onChange({ ...draft, phone: val })}
            placeholder="+1 (555) 010-9900"
          />
        </div>
        <UniversalInput
          label={t("dmca_company_agent_label", "Company / Organization (Optional)")}
          value={draft.companyOrAgent}
          onChange={(val) => onChange({ ...draft, companyOrAgent: val })}
          placeholder={t("dmca_company_agent_ph", "Rights holder or authorized agent")}
        />
        <div className="flex flex-col gap-1">
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
          {draft.physicalAddress.trim().length > 0 &&
            !isPlausiblePhysicalAddress(draft.physicalAddress) && (
              <span className="text-[11px] font-bold text-[var(--warning)] px-1 no-text-case">
                {t(
                  "dmca_invalid_address_err",
                  "Enter a complete physical street mailing address (street number, city, and postal code)."
                )}
              </span>
            )}
        </div>
      </UniversalGroup>

      <UniversalGroup
        title={t("dmca_form_sec_declarations", "Declarations & Signature")}
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
            <StatutoryCheckboxCard
              checked={draft.forwardingAcknowledged}
              onToggle={() =>
                onChange({
                  ...draft,
                  forwardingAcknowledged: !draft.forwardingAcknowledged,
                })
              }
              title={t(
                "dmca_cb_takedown_forwarding_title",
                "Creator Identity Disclosure & § 512(f) Liability"
              )}
              label={t(
                "dmca_clause_takedown_forwarding_text",
                "I understand that my full legal name, physical mailing address, and email address will be forwarded directly to the affected {Mason} if this notice is validated, that {mod} ideas, mechanics, titles, and personal disputes are not copyrightable, and that false claims carry federal damages under 17 U.S.C. § 512(f)."
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
