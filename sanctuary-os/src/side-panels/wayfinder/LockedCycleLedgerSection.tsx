import { useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { UniversalGroup, HoverTooltip } from "../../shared";
import { dollarsToCents, centsToDollarInput } from "./wayfinderPanelHelpers";

export function LockedCycleLedgerSection({
  grossDollars,
  setGrossDollars,
  stripeFeesDollars,
  setStripeFeesDollars,
  carryoverDollars,
  setCarryoverDollars,
}: {
  grossDollars: string;
  setGrossDollars: (v: string) => void;
  stripeFeesDollars: string;
  setStripeFeesDollars: (v: string) => void;
  carryoverDollars: string;
  setCarryoverDollars: (v: string) => void;
}) {
  const { t } = useLexicon();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [grossDelta, setGrossDelta] = useState("5");
  const [feesDelta, setFeesDelta] = useState("1");
  const [carryoverDelta, setCarryoverDelta] = useState("5");

  const applyFieldDelta = (
    field: "gross" | "fees" | "carryover",
    sign: 1 | -1
  ) => {
    if (field === "gross") {
      const deltaCents = Math.max(0, dollarsToCents(grossDelta)) * sign;
      if (!deltaCents) return;
      const next = Math.max(0, dollarsToCents(grossDollars) + deltaCents);
      setGrossDollars(centsToDollarInput(next, 0));
    } else if (field === "fees") {
      const deltaCents = Math.max(0, dollarsToCents(feesDelta)) * sign;
      if (!deltaCents) return;
      const next = Math.max(0, dollarsToCents(stripeFeesDollars) + deltaCents);
      setStripeFeesDollars(centsToDollarInput(next, 0));
    } else {
      const deltaCents = Math.max(0, dollarsToCents(carryoverDelta)) * sign;
      if (!deltaCents) return;
      const next = dollarsToCents(carryoverDollars) + deltaCents;
      setCarryoverDollars(centsToDollarInput(next, 0));
    }
  };

  const formatReadOnlyUsd = (valStr: string, allowSigned = false) => {
    const cents = dollarsToCents(valStr);
    const abs = Math.abs(cents) / 100;
    if (allowSigned && cents < 0) return `-$${abs.toFixed(2)}`;
    if (allowSigned && cents > 0) return `+$${abs.toFixed(2)}`;
    return `$${abs.toFixed(2)}`;
  };

  const cards = [
    {
      id: "gross" as const,
      icon: t("icon_payments", "payments"),
      label: t("report_gross_contributions", "Gross Contributions"),
      formattedValue: formatReadOnlyUsd(grossDollars),
      valueColor: "text-[var(--text)]",
      deltaValue: grossDelta,
      setDeltaValue: setGrossDelta,
    },
    {
      id: "fees" as const,
      icon: t("icon_percent", "percent"),
      label: t("report_stripe_fees", "Payment Processing / Stripe Fees"),
      formattedValue: `-${formatReadOnlyUsd(stripeFeesDollars)}`,
      valueColor: "text-[var(--warning)]",
      deltaValue: feesDelta,
      setDeltaValue: setFeesDelta,
    },
    {
      id: "carryover" as const,
      icon: t("icon_history", "history"),
      label: t("report_prior_carryover_card_title", "Prior Cycle Carryover"),
      formattedValue: formatReadOnlyUsd(carryoverDollars, true),
      valueColor:
        dollarsToCents(carryoverDollars) > 0
          ? "text-[var(--success)]"
          : dollarsToCents(carryoverDollars) < 0
            ? "text-[var(--warning)]"
            : "text-[var(--text)]",
      deltaValue: carryoverDelta,
      setDeltaValue: setCarryoverDelta,
    },
  ];

  return (
    <UniversalGroup
      title={t(
        "report_payment_processing_title",
        "Payment Processing & Cycle Ledger"
      )}
      icon={t("icon_account_balance", "account_balance")}
      headerActions={
        <button
          type="button"
          onClick={() => setIsUnlocked((prev) => !prev)}
          className={`px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer transition-colors ${isUnlocked
            ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--accent)]"
            : "border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
            }`}
        >
          <span className="material-symbols-outlined !text-[13px]">
            {isUnlocked
              ? t("icon_lock_open", "lock_open")
              : t("icon_lock", "lock")}
          </span>
          <span>
            {isUnlocked
              ? t("report_btn_lock_ledger", "Lock Ledger")
              : t("report_btn_unlock_adjust", "Unlock to Adjust")}
          </span>
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed m-0 px-0.5">
          {t(
            "report_ledger_locked_hint",
            "Totals update automatically from donations and monthly rollovers. Unlock only if you need to add or subtract a manual correction."
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`p-3.5 rounded-2xl glass-surface border flex flex-col justify-between gap-2.5 transition-colors ${isUnlocked
                ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[15px]">
                    {card.icon}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] inline-flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[11px]">
                    {t("icon_lock", "lock")}
                  </span>
                  <span>{t("report_ledger_locked_badge", "Auto-Synced")}</span>
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85 leading-snug">
                  {card.label}
                </span>
                <span
                  className={`text-base font-black font-mono select-none ${card.valueColor}`}
                >
                  {card.formattedValue}
                </span>
              </div>

              {isUnlocked && (
                <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyFieldDelta(card.id, -1)}
                    className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[var(--text)] hover:text-[var(--warning)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_remove", "remove")}
                    </span>
                    <HoverTooltip title={t("decrease", "Decrease")} />
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={card.deltaValue}
                    onChange={(e) => card.setDeltaValue(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-full min-w-0 glass-panel border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-lg px-2 py-1 text-center text-xs font-mono font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => applyFieldDelta(card.id, 1)}
                    className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[var(--text)] hover:text-[var(--success)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_add", "add")}
                    </span>
                    <HoverTooltip title={t("increase", "Increase")} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </UniversalGroup>
  );
}

