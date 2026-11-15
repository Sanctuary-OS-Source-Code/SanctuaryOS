import { type ReactNode, useState } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  ActionButton,
  DashboardStatTile,
  SidePanelFilterBar,
  VAULT_CHIP_CLASS,
} from "../shared";
import { renderCleanInlineText } from "./ReleaseNotesShowcase";
import { HUB_SCHEMA_SQL, SPOKE_SCHEMA_SQL } from "../utils/directivesSync";
import type {
  DirectiveBuilderCard,
  DirectiveBuilderSchema,
} from "../utils/directivesBuilderSchema";

export type ForkTabId = "spoke" | "standalone" | "deploy" | "sql";

export const STANDALONE_MANUAL_SNIPPET = `export const SANCTUARY_CONFIG = {
  uplinkBundle: "",
  mode: "standalone",
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_PUBLIC_KEY",
  standaloneWorkspace: {
    id: "my_community",
    name: "My Community Workspace",
    schema_id: "universal",
    icon: "sports_esports",
  },
};`;

export const HUB_AND_SPOKE_FORK_SNIPPET = `// 1. Set your Split-Custody Vault key & deploy game-gateway to your Central Hub:
//    supabase link --project-ref YOUR_HUB_PROJECT_ID
//    supabase secrets set SPOKE_VAULT_MASTER_KEY=$(openssl rand -hex 32)
//    supabase functions deploy game-gateway
//
// 2. On each Child Spoke DB: run schema.sql, then mint a scoped handshake token:
//    SELECT public.mint_spoke_gateway_token();

// 3. Point SANCTUARY_CONFIG in sanctuary-os/src/supabase.ts to your Central Hub:
export const SANCTUARY_CONFIG = {
  uplinkBundle: "",
  mode: "hub_and_spoke",
  supabaseUrl: "https://YOUR_HUB_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_HUB_SUPABASE_ANON_KEY",
};`;

const DIRECTIVE_INLINE_TOKEN_REGEX =
  /(`[^`]+`|SANCTUARY-UPLINK:\/\/|mint_spoke_gateway_token\(\)|mint_spoke_gateway_token|SPOKE_VAULT_MASTER_KEY|spk_gw_[a-z0-9_.*]*|\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)*|\b(?:[a-z0-9_-]+\/)+[a-z0-9_.-]+|\b[a-z0-9_]+\.[a-z0-9]{2,6}\b|\b(?:Ctrl\+K|Cmd\+K|1 of N|CoW|SRK1|SNCXXX|Zero-PII|FIDO2|SHA-256|AES-256-GCM|GZIP|TOTP|DEFCON|game-gateway)\b)/g;

export function renderDirectiveHeading(text: string) {
  const cleaned = (text || "").replace(/\*\*([^*]+?)\*\*/g, "$1").trim();
  const parts = cleaned.split(DIRECTIVE_INLINE_TOKEN_REGEX);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="font-sans text-[length:inherit] font-[inherit] bg-transparent p-0 border-0"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      /^(?:SANCTUARY-UPLINK:\/\/|mint_spoke_gateway_token\(\)|mint_spoke_gateway_token|SPOKE_VAULT_MASTER_KEY|spk_gw_[a-z0-9_.*]*|\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)*|(?:[a-z0-9_-]+\/)+[a-z0-9_.-]+|[a-z0-9_]+\.[a-z0-9]{2,6}|Ctrl\+K|Cmd\+K|1 of N|CoW|SRK1|SNCXXX|Zero-PII|FIDO2|SHA-256|AES-256-GCM|GZIP|TOTP|DEFCON|game-gateway)$/.test(
        part
      )
    ) {
      return (
        <code
          key={idx}
          className="font-sans text-[length:inherit] font-[inherit] bg-transparent p-0 border-0"
        >
          {part}
        </code>
      );
    }
    return part;
  });
}

export function BalancedCardColumns<T>({
  items,
  columns = 2,
  className = "",
  getWeight,
  renderItem,
}: {
  items: T[];
  columns?: 2 | 3;
  className?: string;
  getWeight?: (item: T) => number;
  renderItem: (item: T, idx: number) => ReactNode;
}) {
  if (!items || items.length === 0) return null;
  const effectiveCols = items.length < columns ? items.length : columns;
  if (effectiveCols <= 1) {
    return (
      <div className={`flex flex-col gap-3.5 min-w-0 ${className}`}>
        {items.map((item, idx) => renderItem(item, idx))}
      </div>
    );
  }
  const colBuckets: Array<Array<{ item: T; idx: number }>> = Array.from(
    { length: effectiveCols },
    () => []
  );
  const colWeights = new Array<number>(effectiveCols).fill(0);
  items.forEach((item, idx) => {
    let bestCol = 0;
    for (let c = 1; c < effectiveCols; c++) {
      if (colWeights[c] < colWeights[bestCol]) bestCol = c;
    }
    colBuckets[bestCol].push({ item, idx });
    const raw: any = item;
    const est = getWeight
      ? getWeight(item)
      : (raw?.title?.length || raw?.name?.length || 0) +
        (raw?.desc?.length || 0) +
        80;
    colWeights[bestCol] += est;
  });

  const mdGridCols = effectiveCols === 3 ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <>
      <div className={`flex flex-col gap-3.5 md:hidden min-w-0 ${className}`}>
        {items.map((item, idx) => renderItem(item, idx))}
      </div>
      <div
        className={`hidden md:grid ${mdGridCols} gap-3.5 items-start min-w-0 ${className}`}
      >
        {colBuckets.map((col, colIdx) => (
          <div key={colIdx} className="flex flex-col gap-3.5 min-w-0">
            {col.map(({ item, idx }) => renderItem(item, idx))}
          </div>
        ))}
      </div>
    </>
  );
}

interface InteractiveForkingGuideViewProps {
  schema: DirectiveBuilderSchema;
  forkTab: ForkTabId;
  setForkTab: (tab: ForkTabId) => void;
  forkModeIdx: number;
  setForkModeIdx: (idx: number) => void;
  sqlSchemaTab: "spoke" | "hub";
  setSqlSchemaTab: (tab: "spoke" | "hub") => void;
  onInspectCovenants?: () => void;
  filterGridClassName?: string;
}

export function InteractiveForkingGuideView({
  schema,
  forkTab,
  setForkTab,
  forkModeIdx,
  setForkModeIdx,
  sqlSchemaTab,
  setSqlSchemaTab,
  onInspectCovenants,
  filterGridClassName = "sm:grid-cols-2 gap-3",
}: InteractiveForkingGuideViewProps) {
  const { t, td } = useLexicon();
  const pushStatus = useStore((state: any) => state.pushStatus);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const resolveIcon = (glyph?: string, fallbackGlyph = "hub") => {
    const clean = (glyph || fallbackGlyph).trim();
    return t(`icon_${clean}`, clean);
  };

  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    pushStatus?.(t("alert_copied", "Copied to Clipboard!"), "success");
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2200);
  };

  const spokeTab = schema.tabs.find((tb) => tb.id === "spoke");
  const standaloneTab = schema.tabs.find((tb) => tb.id === "standalone");
  const deployTab = schema.tabs.find((tb) => tb.id === "deploy");
  const sqlTab = schema.tabs.find((tb) => tb.id === "sql");

  const filterTiles: Array<{
    id: ForkTabId;
    icon: string;
    label: string;
    value: string;
  }> = [
    {
      id: "spoke",
      icon: resolveIcon(spokeTab?.icon, "hub"),
      label: spokeTab?.label ? td(spokeTab.label) : t("dir_fk_t1_lbl", "STEP 1"),
      value: spokeTab?.value
        ? td(spokeTab.value)
        : t("dir_fk_t1_val", "Spoke Setup"),
    },
    {
      id: "standalone",
      icon: resolveIcon(standaloneTab?.icon, "call_split"),
      label: standaloneTab?.label
        ? td(standaloneTab.label)
        : t("dir_fk_t2_lbl", "STEP 2"),
      value: standaloneTab?.value
        ? td(standaloneTab.value)
        : t("dir_fk_t2_val", "Standalone & Hub"),
    },
    {
      id: "deploy",
      icon: resolveIcon(deployTab?.icon, "language"),
      label: deployTab?.label
        ? td(deployTab.label)
        : t("dir_fk_t_deploy_lbl", "STEP 3"),
      value: deployTab?.value
        ? td(deployTab.value)
        : t("dir_fk_t_deploy_val", "Deploy & Domains"),
    },
    {
      id: "sql",
      icon: resolveIcon(sqlTab?.icon, "database"),
      label: sqlTab?.label ? td(sqlTab.label) : t("dir_fk_t3_lbl", "STEP 4"),
      value: sqlTab?.value
        ? td(sqlTab.value)
        : t("dir_fk_t3_val", "SQL Schemas"),
    },
  ];

  const spokeCards = spokeTab?.cards || [];
  const modeCards = standaloneTab?.cards || [];
  const deployCards = deployTab?.cards || [];
  const sqlCards = sqlTab?.cards || [];

  const spokeSqlCard = sqlCards[0];
  const hubSqlCard = sqlCards[1];
  const extraSqlCards = sqlCards.slice(2);

  const spokeSqlLineCount = SPOKE_SCHEMA_SQL.split(/\r?\n/).length;
  const hubSqlLineCount = HUB_SCHEMA_SQL.split(/\r?\n/).length;
  const isSpokeSqlActive = sqlSchemaTab === "spoke";

  const renderCardHeader = ({
    icon,
    fallbackIcon = "hub",
    overline,
    title,
    badgeLabel,
    badgeIcon,
    accentColorClass = "text-[var(--accent)]",
    isMuted = false,
  }: {
    icon?: string;
    fallbackIcon?: string;
    overline?: string;
    title: ReactNode;
    badgeLabel?: string;
    badgeIcon?: string;
    accentColorClass?: string;
    isMuted?: boolean;
  }) => {
    const resolvedIcon = resolveIcon(icon, fallbackIcon);
    const resolvedBadgeIcon = badgeIcon
      ? resolveIcon(badgeIcon, fallbackIcon)
      : resolvedIcon;
    return (
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors ${
              isMuted
                ? "text-[var(--subtext)] group-hover:text-[var(--text)]"
                : accentColorClass
            }`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {resolvedIcon}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            {overline && (
              <span
                className={`text-[10px] font-black uppercase tracking-[0.16em] leading-snug break-words transition-colors ${
                  isMuted ? "text-[var(--subtext)]" : accentColorClass
                }`}
              >
                {overline}
              </span>
            )}
            <h3 className="text-sm sm:text-base font-black tracking-tight text-[var(--text)] leading-snug break-words [overflow-wrap:anywhere] m-0">
              {title}
            </h3>
          </div>
        </div>

        {badgeLabel && (
          <div className="shrink-0 self-start">
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isMuted ? "text-[var(--subtext)]" : accentColorClass
                }`}
              >
                {resolvedBadgeIcon}
              </span>
              <span>{badgeLabel}</span>
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderSubCardsList = (
    subCards: DirectiveBuilderCard["subCards"],
    keyPrefix: string
  ) => {
    if (!subCards || subCards.length === 0) return null;
    const isPairGrid = subCards.length === 2;
    return (
      <div
        className={`${
          isPairGrid
            ? "grid grid-cols-1 md:grid-cols-2 gap-3"
            : "flex flex-col gap-2.5"
        } pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]`}
      >
        {subCards.map((sc, sIdx) => (
          <div
            key={`${keyPrefix}-${sc.id || sIdx}`}
            className="glass-surface rounded-xl p-3.5 flex items-start gap-3 min-w-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          >
            <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.18))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.06))] text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined !text-[16px]">
                {resolveIcon(sc.icon, "check_circle")}
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-bold text-[var(--text)] leading-snug break-words [overflow-wrap:anywhere] m-0">
                {renderDirectiveHeading(td(sc.title || ""))}
              </h4>
              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed break-words [overflow-wrap:anywhere] m-0">
                {renderCleanInlineText(td(sc.desc || ""))}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSpokeSectionCard = (card: DirectiveBuilderCard, cIdx: number) => {
    const isHero = cIdx === 0;
    const isCovenantsCard = card.id === "fork_spoke_covenants";
    return (
      <div
        key={`fork-spoke-card-${card.id || cIdx}`}
        className={
          isHero
            ? "glass-panel rounded-2xl p-5 flex flex-col gap-4 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
            : "glass-surface rounded-2xl p-5 flex flex-col gap-3.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
        }
      >
        {renderCardHeader({
          icon: card.icon,
          fallbackIcon: isHero ? "hub" : "handshake",
          overline: td(card.overline || ""),
          title: renderDirectiveHeading(td(card.title || "")),
          badgeLabel: card.badge ? td(card.badge) : undefined,
          badgeIcon: t("icon_verified", "verified"),
        })}

        <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
          {renderCleanInlineText(td(card.desc || ""))}
        </p>

        {card.id === "fork_spoke_setup" && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                {t("icon_terminal", "terminal")}
              </span>
              <code className="text-xs font-mono font-bold text-[var(--accent)] break-all select-all">
                {"SELECT public.mint_spoke_gateway_token();"}
              </code>
            </div>
            <ActionButton
              variant="glass"
              icon={t("icon_content_copy", "content_copy")}
              onClick={() =>
                handleCopyCode(
                  "mint-spoke-sql",
                  "SELECT public.mint_spoke_gateway_token();"
                )
              }
              className="!px-3 !py-1.5 shrink-0"
            >
              {copiedId === "mint-spoke-sql"
                ? t("copied", "Copied")
                : t("spoke_btn_copy_mint_sql", "Copy SQL")}
            </ActionButton>
          </div>
        )}

        {renderSubCardsList(card.subCards, `spoke-sc-${card.id || cIdx}`)}

        {isCovenantsCard && onInspectCovenants && (
          <div className="pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-85 flex items-center gap-1.5 min-w-0 break-words">
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                {t("icon_verified_user", "verified_user")}
              </span>
              <span>
                {td(card.footerMeta || "") ||
                  t("partner_covenants_title", "Sovereign Covenants")}
              </span>
            </span>
            <ActionButton
              variant="accent"
              icon={t("icon_gavel", "gavel")}
              onClick={onInspectCovenants}
              className="shrink-0 ml-auto"
            >
              {t("partner_covenants_open_btn", "Inspect Covenants")}
            </ActionButton>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <SidePanelFilterBar className={filterGridClassName}>
        {filterTiles.map((tile) => (
          <DashboardStatTile
            key={tile.id}
            variant="filter"
            className="!w-full"
            icon={tile.icon}
            label={tile.label}
            number={tile.value}
            colorClass="text-[var(--accent)]"
            isActive={forkTab === tile.id}
            onClick={() => setForkTab(tile.id)}
          />
        ))}
      </SidePanelFilterBar>

      {forkTab === "spoke" && (
        <div className="flex flex-col gap-4 w-full">
          {spokeCards.map((card, cIdx) => renderSpokeSectionCard(card, cIdx))}
        </div>
      )}

      {forkTab === "standalone" && (
        <div className="flex flex-col gap-3.5 w-full">
          {modeCards.map((card, modeIndex) => {
            const isSelectedMode = forkModeIdx === modeIndex;
            const isStandaloneMode =
              card.id === "fork_mode_standalone" ||
              (card.id !== "fork_mode_hub" && modeIndex === 0);
            const isHubMode =
              card.id === "fork_mode_hub" ||
              (card.id !== "fork_mode_standalone" && modeIndex === 1);

            return (
              <div
                key={`fork-mode-${card.id || modeIndex}`}
                role={!isSelectedMode ? "button" : undefined}
                tabIndex={!isSelectedMode ? 0 : undefined}
                onClick={
                  !isSelectedMode ? () => setForkModeIdx(modeIndex) : undefined
                }
                onKeyDown={
                  !isSelectedMode
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setForkModeIdx(modeIndex);
                        }
                      }
                    : undefined
                }
                className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                  isSelectedMode
                    ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                    : "px-4 py-3.5 gap-2 opacity-55 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                }`}
              >
                {renderCardHeader({
                  icon: card.icon,
                  fallbackIcon: "call_split",
                  overline: td(card.overline || ""),
                  title: renderDirectiveHeading(td(card.title || "")),
                  badgeLabel: isSelectedMode
                    ? t("active", "Active")
                    : td(card.badge || t("open", "Open")),
                  badgeIcon: isSelectedMode
                    ? t("icon_check_circle", "check_circle")
                    : resolveIcon(card.icon, "call_split"),
                  isMuted: !isSelectedMode,
                })}

                {isSelectedMode && (
                  <div className="flex flex-col gap-4 pt-3.5 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                      {renderCleanInlineText(td(card.desc || ""))}
                    </p>

                    {renderSubCardsList(
                      card.subCards,
                      `mode-sc-${card.id || modeIndex}`
                    )}

                    {(isStandaloneMode || isHubMode) && (
                      <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <span className="text-xs font-bold text-[var(--accent)] font-mono min-w-0 flex-1 break-words">
                            {isStandaloneMode
                              ? `${t("sd_fork_standalone_opt_b", "Option B: Manual Standalone Config")} • sanctuary-os/src/supabase.ts`
                              : t(
                                  "sd_fork_hub_snippet_label",
                                  "Hub & Spoke Federation Config • sanctuary-os/src/supabase.ts"
                                )}
                          </span>
                          <ActionButton
                            variant="accent"
                            className="shrink-0"
                            icon={
                              copiedId ===
                              (isStandaloneMode
                                ? "supabase_cfg_manual"
                                : "supabase_cfg_hub")
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_content_copy", "content_copy")
                            }
                            onClick={() =>
                              handleCopyCode(
                                isStandaloneMode
                                  ? "supabase_cfg_manual"
                                  : "supabase_cfg_hub",
                                isStandaloneMode
                                  ? STANDALONE_MANUAL_SNIPPET
                                  : HUB_AND_SPOKE_FORK_SNIPPET
                              )
                            }
                          >
                            {copiedId ===
                            (isStandaloneMode
                              ? "supabase_cfg_manual"
                              : "supabase_cfg_hub")
                              ? t("alert_copied", "Copied to Clipboard!")
                              : t("sd_btn_copy_snippet", "Copy Code Snippet")}
                          </ActionButton>
                        </div>
                        <pre className="text-xs font-mono text-[var(--text)] opacity-90 overflow-x-auto custom-scrollbar leading-relaxed p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                          <code>
                            {isStandaloneMode
                              ? STANDALONE_MANUAL_SNIPPET
                              : HUB_AND_SPOKE_FORK_SNIPPET}
                          </code>
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {forkTab === "deploy" && (
        <div className="flex flex-col gap-4 w-full">
          {deployCards.map((dc, dIdx) => (
            <div
              key={`fork-deploy-${dc.id || dIdx}`}
              className="glass-panel rounded-2xl p-5 flex flex-col gap-3.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
            >
              {renderCardHeader({
                icon: dc.icon,
                fallbackIcon: "language",
                overline: td(dc.overline || ""),
                title: renderDirectiveHeading(td(dc.title || "")),
                badgeLabel: dc.badge ? td(dc.badge) : undefined,
                badgeIcon: resolveIcon(dc.icon, "language"),
              })}
              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                {renderCleanInlineText(td(dc.desc || ""))}
              </p>
              {renderSubCardsList(dc.subCards, `deploy-sc-${dc.id || dIdx}`)}
            </div>
          ))}
        </div>
      )}

      {forkTab === "sql" && (
        <div className="flex flex-col gap-3.5 w-full">
          {/* SQL Card 1: schema.sql (Spoke & Standalone DB) */}
          <div
            role={!isSpokeSqlActive ? "button" : undefined}
            tabIndex={!isSpokeSqlActive ? 0 : undefined}
            onClick={
              !isSpokeSqlActive ? () => setSqlSchemaTab("spoke") : undefined
            }
            onKeyDown={
              !isSpokeSqlActive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSqlSchemaTab("spoke");
                    }
                  }
                : undefined
            }
            className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
              isSpokeSqlActive
                ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                : "px-4 py-3.5 gap-2 opacity-55 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
            }`}
          >
            {renderCardHeader({
              icon: spokeSqlCard?.icon,
              fallbackIcon: "storage",
              overline: spokeSqlCard?.overline
                ? td(spokeSqlCard.overline)
                : t(
                    "dir_fork_sql_spoke_sub",
                    "Spoke & Standalone DB • 52 Tables"
                  ),
              title: spokeSqlCard?.title
                ? td(spokeSqlCard.title)
                : t("dir_fork_sql_spoke_val", "schema.sql (52 Tables)"),
              badgeLabel: `${spokeSqlLineCount} ${t("dir_fork_sql_lines", "Lines")}`,
              badgeIcon: isSpokeSqlActive
                ? t("icon_check_circle", "check_circle")
                : t("icon_database", "database"),
              accentColorClass: "text-[var(--success)]",
              isMuted: !isSpokeSqlActive,
            })}

            {isSpokeSqlActive && (
              <div className="flex flex-col gap-3.5 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                  {spokeSqlCard?.desc
                    ? renderCleanInlineText(td(spokeSqlCard.desc))
                    : t(
                        "dir_fork_sql_spoke_desc",
                        "Complete community registry schema (mods, blueprints, masons, conflicts, tickets, heuristics, RLS policies, and Founding Wayfinder trigger)."
                      )}
                </p>
                <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <span className="text-xs font-bold text-[var(--success)] font-mono min-w-0 flex-1 break-words">
                      {`schema.sql • ${spokeSqlLineCount} ${t("dir_fork_sql_lines", "Lines")}`}
                    </span>
                    <ActionButton
                      variant="accent"
                      className="shrink-0"
                      icon={
                        copiedId === "sql_spoke"
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_content_copy", "content_copy")
                      }
                      onClick={() => handleCopyCode("sql_spoke", SPOKE_SCHEMA_SQL)}
                    >
                      {copiedId === "sql_spoke"
                        ? t("dir_fork_sql_copied", "SQL Copied")
                        : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                    </ActionButton>
                  </div>
                  <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[380px] overflow-y-auto custom-scrollbar leading-relaxed p-3 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                    <code>{SPOKE_SCHEMA_SQL}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* SQL Card 2: schema_os.sql (Core Hub DB) */}
          <div
            role={isSpokeSqlActive ? "button" : undefined}
            tabIndex={isSpokeSqlActive ? 0 : undefined}
            onClick={
              isSpokeSqlActive ? () => setSqlSchemaTab("hub") : undefined
            }
            onKeyDown={
              isSpokeSqlActive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSqlSchemaTab("hub");
                    }
                  }
                : undefined
            }
            className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
              !isSpokeSqlActive
                ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                : "px-4 py-3.5 gap-2 opacity-55 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
            }`}
          >
            {renderCardHeader({
              icon: hubSqlCard?.icon,
              fallbackIcon: "dns",
              overline: hubSqlCard?.overline
                ? td(hubSqlCard.overline)
                : t(
                    "dir_fork_sql_hub_sub",
                    "Core Hub Federation DB • 22 Tables"
                  ),
              title: hubSqlCard?.title
                ? td(hubSqlCard.title)
                : t("dir_fork_sql_hub_val", "schema_os.sql (22 Tables)"),
              badgeLabel: `${hubSqlLineCount} ${t("dir_fork_sql_lines", "Lines")}`,
              badgeIcon: !isSpokeSqlActive
                ? t("icon_check_circle", "check_circle")
                : t("icon_database", "database"),
              accentColorClass: "text-[var(--accent)]",
              isMuted: isSpokeSqlActive,
            })}

            {!isSpokeSqlActive && (
              <div className="flex flex-col gap-3.5 pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                  {hubSqlCard?.desc
                    ? renderCleanInlineText(td(hubSqlCard.desc))
                    : t(
                        "dir_fork_sql_hub_desc",
                        "Central multi-game federation schema (global SSO profiles, FIDO2 passkeys, sanctuary_games directory, master schemas, global lexicons/themes, and core heuristics)."
                      )}
                </p>
                <div className="glass-surface rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <span className="text-xs font-bold text-[var(--accent)] font-mono min-w-0 flex-1 break-words">
                      {`schema_os.sql • ${hubSqlLineCount} ${t("dir_fork_sql_lines", "Lines")}`}
                    </span>
                    <ActionButton
                      variant="accent"
                      className="shrink-0"
                      icon={
                        copiedId === "sql_hub"
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_content_copy", "content_copy")
                      }
                      onClick={() => handleCopyCode("sql_hub", HUB_SCHEMA_SQL)}
                    >
                      {copiedId === "sql_hub"
                        ? t("dir_fork_sql_copied", "SQL Copied")
                        : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                    </ActionButton>
                  </div>
                  <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[380px] overflow-y-auto custom-scrollbar leading-relaxed p-3 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                    <code>{HUB_SCHEMA_SQL}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>

          {extraSqlCards.map((extra, eIdx) => (
            <div
              key={`sql-extra-${extra.id || eIdx}`}
              className="glass-surface rounded-2xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {td(extra.overline || "")}
              </span>
              <h4 className="text-sm font-black text-[var(--text)] m-0">
                {renderDirectiveHeading(td(extra.title || ""))}
              </h4>
              <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                {renderCleanInlineText(td(extra.desc || ""))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

