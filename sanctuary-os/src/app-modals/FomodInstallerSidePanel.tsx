import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  ActionButton,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";

type ConditionNode =
  | { kind: "composite"; operator: string; children: ConditionNode[] }
  | { kind: "flag_dependency"; flag: string; value: string }
  | { kind: "file_dependency"; file: string; state: string; resolved_state: string };

interface PluginOption {
  id: string;
  name: string;
  description: string;
  image_data_url?: string | null;
  default_type: string;
  dependency_patterns: { condition: ConditionNode; plugin_type: string }[];
  condition_flags: [string, string][];
}

interface OptionGroup {
  id: string;
  name: string;
  group_type: string;
  options: PluginOption[];
}

interface InstallStep {
  id: string;
  name: string;
  visible?: ConditionNode | null;
  groups: OptionGroup[];
}

export interface InstallerWizardPlan {
  session_id: string;
  wizard_kind: string;
  mod_name: string;
  author: string;
  version: string;
  description: string;
  module_image_data_url?: string | null;
  suggested_target_folder: string;
  saved_selections?: string[];
  steps: InstallStep[];
}

function evalCondition(node: ConditionNode, flags: Record<string, string>): boolean {
  if (node.kind === "flag_dependency") {
    return (flags[node.flag] ?? "") === node.value;
  }
  if (node.kind === "file_dependency") {
    return (
      String(node.state || "").toLowerCase() ===
      String(node.resolved_state || "").toLowerCase()
    );
  }
  const kids = Array.isArray(node.children) ? node.children : [];
  if (String(node.operator || "").toLowerCase() === "or") {
    return kids.some((k) => evalCondition(k, flags));
  }
  return kids.every((k) => evalCondition(k, flags));
}

function resolveOptionType(opt: PluginOption, flags: Record<string, string>): string {
  for (const pat of opt.dependency_patterns || []) {
    if (evalCondition(pat.condition, flags)) {
      return pat.plugin_type || opt.default_type || "Optional";
    }
  }
  return opt.default_type || "Optional";
}

export const FomodInstallerSidePanel: React.FC<{
  runRadarSweep?: (silent?: boolean, forceDetect?: boolean) => void;
}> = ({ runRadarSweep }) => {
  const { t } = useLexicon();
  const pushStatus = useStore((s) => s.pushStatus);
  const { installerWizardQueue, shiftInstallerWizard } = useModalStore(
    useShallow((s) => ({
      installerWizardQueue: s.installerWizardQueue,
      shiftInstallerWizard: s.shiftInstallerWizard,
    }))
  );

  const plan: InstallerWizardPlan | undefined = installerWizardQueue[0];
  const [stepIdx, setStepIdx] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [targetFolder, setTargetFolder] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setStepIdx(0);
    setTargetFolder(plan.suggested_target_folder || "");
    const initial: Record<string, string[]> = {};
    const runningFlags: Record<string, string> = {};
    const savedSet = new Set(
      Array.isArray(plan.saved_selections)
        ? plan.saved_selections.map((s) => String(s).trim()).filter(Boolean)
        : []
    );
    const hasSavedChoices = savedSet.size > 0;

    for (const step of plan.steps || []) {
      for (const grp of step.groups || []) {
        const gType = grp.group_type || "SelectAny";
        const types = grp.options.map((o) => resolveOptionType(o, runningFlags));
        let picked: string[] = [];

        const savedMatches = hasSavedChoices
          ? grp.options
              .filter((o, i) => types[i].toLowerCase() !== "notusable" && savedSet.has(o.id))
              .map((o) => o.id)
          : [];

        if (gType === "SelectAll") {
          picked = grp.options
            .filter((_, i) => types[i].toLowerCase() !== "notusable")
            .map((o) => o.id);
        } else if (gType === "SelectExactlyOne") {
          if (savedMatches.length > 0) {
            picked = [savedMatches[0]];
          } else {
            const prefIdx =
              types.findIndex((x) => x.toLowerCase() === "required") !== -1
                ? types.findIndex((x) => x.toLowerCase() === "required")
                : types.findIndex((x) => x.toLowerCase() === "recommended") !== -1
                  ? types.findIndex((x) => x.toLowerCase() === "recommended")
                  : types.findIndex((x) => x.toLowerCase() !== "notusable");
            if (prefIdx >= 0) picked = [grp.options[prefIdx].id];
          }
        } else if (gType === "SelectAtMostOne") {
          if (hasSavedChoices) {
            picked = savedMatches.length > 0 ? [savedMatches[0]] : [];
          } else {
            const prefIdx =
              types.findIndex((x) => x.toLowerCase() === "required") !== -1
                ? types.findIndex((x) => x.toLowerCase() === "required")
                : types.findIndex((x) => x.toLowerCase() === "recommended");
            if (prefIdx >= 0 && types[prefIdx].toLowerCase() !== "notusable") {
              picked = [grp.options[prefIdx].id];
            }
          }
        } else {
          const requiredIds = grp.options
            .filter((_, i) => types[i].toLowerCase() === "required")
            .map((o) => o.id);
          if (hasSavedChoices) {
            picked = Array.from(new Set([...requiredIds, ...savedMatches]));
          } else {
            picked = grp.options
              .filter((_, i) => {
                const tl = types[i].toLowerCase();
                return tl === "required" || tl === "recommended";
              })
              .map((o) => o.id);
          }
          if (gType === "SelectAtLeastOne" && picked.length === 0) {
            const fallback = types.findIndex((x) => x.toLowerCase() !== "notusable");
            if (fallback >= 0) picked = [grp.options[fallback].id];
          }
        }

        initial[grp.id] = picked;
        for (const opt of grp.options) {
          if (picked.includes(opt.id)) {
            for (const [fk, fv] of opt.condition_flags || []) {
              runningFlags[fk] = fv;
            }
          }
        }
      }
    }

    setSelections(initial);
  }, [plan?.session_id]);

  const { activeFlags, visibleSteps } = useMemo(() => {
    if (!plan) return { activeFlags: {} as Record<string, string>, visibleSteps: [] as InstallStep[] };
    const flags: Record<string, string> = {};
    const vis: InstallStep[] = [];
    for (const step of plan.steps || []) {
      const ok = !step.visible || evalCondition(step.visible, flags);
      if (!ok) continue;
      vis.push(step);
      for (const grp of step.groups || []) {
        const picked = selections[grp.id] || [];
        for (const opt of grp.options || []) {
          if (picked.includes(opt.id)) {
            for (const [fk, fv] of opt.condition_flags || []) {
              flags[fk] = fv;
            }
          }
        }
      }
    }
    return { activeFlags: flags, visibleSteps: vis };
  }, [plan, selections]);

  if (!plan) return null;

  const totalSteps = visibleSteps.length;
  const clampedStepIdx = totalSteps > 0 ? Math.min(stepIdx, totalSteps - 1) : 0;
  const activeStep = visibleSteps[clampedStepIdx];
  const isLastStep = totalSteps === 0 || clampedStepIdx >= totalSteps - 1;

  const canAdvanceCurrentStep = !activeStep
    ? true
    : activeStep.groups.every((grp) => {
        const picked = selections[grp.id] || [];
        const hasUsable = grp.options.some(
          (o) => resolveOptionType(o, activeFlags).toLowerCase() !== "notusable"
        );
        if (!hasUsable) return true;
        if (grp.group_type === "SelectExactlyOne") return picked.length === 1;
        if (grp.group_type === "SelectAtLeastOne") return picked.length >= 1;
        return true;
      });

  const handleToggleOption = (grp: OptionGroup, opt: PluginOption, optType: string) => {
    const typeLow = optType.toLowerCase();
    if (typeLow === "notusable" || typeLow === "required" || grp.group_type === "SelectAll") {
      return;
    }
    setSelections((prev) => {
      const cur = prev[grp.id] || [];
      if (grp.group_type === "SelectExactlyOne") {
        return { ...prev, [grp.id]: [opt.id] };
      }
      if (grp.group_type === "SelectAtMostOne") {
        if (cur.includes(opt.id)) {
          return { ...prev, [grp.id]: [] };
        }
        return { ...prev, [grp.id]: [opt.id] };
      }
      if (cur.includes(opt.id)) {
        const next = cur.filter((id) => id !== opt.id);
        if (grp.group_type === "SelectAtLeastOne" && next.length === 0) {
          return prev;
        }
        return { ...prev, [grp.id]: next };
      }
      return { ...prev, [grp.id]: [...cur, opt.id] };
    });
  };

  const handleCancel = async () => {
    try {
      await invoke("cancel_installer_wizard_session", { sessionId: plan.session_id });
    } catch {}
    shiftInstallerWizard();
  };

  const handleInstall = async () => {
    if (isSubmitting || !canAdvanceCurrentStep) return;
    setIsSubmitting(true);
    try {
      const selectedOptionIds: string[] = [];
      for (const step of visibleSteps) {
        for (const grp of step.groups) {
          const picked = selections[grp.id] || [];
          for (const opt of grp.options) {
            const eff = resolveOptionType(opt, activeFlags).toLowerCase();
            if (eff === "notusable") continue;
            if (eff === "required" || grp.group_type === "SelectAll" || picked.includes(opt.id)) {
              selectedOptionIds.push(opt.id);
            }
          }
        }
      }

      const installed = await invoke<string[]>("commit_installer_wizard_session", {
        sessionId: plan.session_id,
        selectedOptionIds,
        targetFolder: targetFolder.trim() || null,
      });

      shiftInstallerWizard();
      pushStatus(
        t("fomod_install_success", "Installed {count} configured {mods} files.").replace(
          "{count}",
          String(installed.length)
        ),
        "success"
      );
      runRadarSweep?.(true, true);
    } catch (err) {
      pushStatus(`${t("fomod_install_failed", "Installer failed:")} ${String(err)}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBain = plan.wizard_kind === "bain";

  return (
    <SidePanel
      isOpen={Boolean(plan)}
      onClose={handleCancel}
      title={plan.mod_name || t("fomod_wizard_title", "Guided Package Installer")}
      subtitle={
        isBain
          ? t("fomod_wizard_subtitle_bain", "Select BAIN subpackages to stage into your {Vault}.")
          : t("fomod_wizard_subtitle", "Configure FOMOD installation options before staging into your {Vault}.")
      }
      icon={t("icon_deployed_code", "deployed_code")}
      iconColorClass="text-[var(--accent)]"
      backdropZ="z-[50020]"
      panelZ="z-[50021]"
      widthClass="w-[92vw] md:w-[760px]"
      headerActions={
        <PanelHeaderGroup>
          {Array.isArray(plan.saved_selections) && plan.saved_selections.length > 0 && (
            <span className={`${VAULT_CHIP_CLASS} px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--accent)]`}>
              {t("fomod_saved_choices_loaded", "Saved Choices Loaded")}
            </span>
          )}
          {totalSteps > 1 && (
            <span className={`${VAULT_CHIP_CLASS} px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--accent)]`}>
              {t("fomod_step_indicator", "Step {current} of {total}")
                .replace("{current}", String(clampedStepIdx + 1))
                .replace("{total}", String(totalSteps))}
            </span>
          )}
          <PanelHeaderButton
            icon={t("icon_close", "close")}
            tooltip={t("cancel", "Cancel")}
            variant="danger"
            onClick={handleCancel}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 pb-6">
        <SidePanelHeroCard
          icon={t("icon_deployed_code", "deployed_code")}
          overline={
            isBain
              ? t("fomod_wizard_bain_overline", "BAIN Subpackage Installer")
              : t("fomod_wizard_fomod_overline", "FOMOD Quartermaster Wizard")
          }
          title={plan.mod_name}
          description={plan.description || t("fomod_wizard_subtitle", "Configure installation options before staging into your {Vault}.")}
          badge={plan.version ? `${t("label_version", "Version")}: ${plan.version}` : undefined}
          variant="accent"
        />

        {(plan.author || plan.module_image_data_url) && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <div className="flex flex-col gap-0.5 min-w-0">
              {plan.author && (
                <span className="text-xs font-bold text-[var(--text)] truncate">
                  {t("author", "Author")}: {plan.author}
                </span>
              )}
              {plan.version && (
                <span className="text-[11px] font-semibold text-[var(--subtext)]">
                  {t("label_version", "Version")}: {plan.version}
                </span>
              )}
            </div>
            {plan.module_image_data_url && (
              <img
                src={plan.module_image_data_url}
                alt={plan.mod_name}
                className="h-14 w-24 object-cover rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shrink-0"
              />
            )}
          </div>
        )}

        {activeStep && (
          <div className="flex flex-col gap-4">
            {activeStep.groups.map((grp) => {
              const picked = selections[grp.id] || [];
              const gType = grp.group_type || "SelectAny";
              const isRadio = gType === "SelectExactlyOne" || gType === "SelectAtMostOne";

              return (
                <UniversalGroup
                  key={grp.id}
                  title={grp.name}
                  icon={
                    isRadio
                      ? t("icon_radio_button_checked", "radio_button_checked")
                      : t("icon_check_box", "check_box")
                  }
                >
                  <div className="flex flex-col gap-2">
                    {grp.options.map((opt) => {
                      const effType = resolveOptionType(opt, activeFlags);
                      const typeLow = effType.toLowerCase();
                      const isDisabled = typeLow === "notusable";
                      const isLockedOn = typeLow === "required" || gType === "SelectAll";
                      const isSelected = !isDisabled && (isLockedOn || picked.includes(opt.id));

                      const badgeLabel =
                        typeLow === "required"
                          ? t("fomod_required_badge", "Required")
                          : typeLow === "recommended"
                            ? t("fomod_recommended_badge", "Recommended")
                            : typeLow === "notusable"
                              ? t("fomod_unavailable_badge", "Unavailable")
                              : t("lab_optional_label", "Optional");

                      const badgeColor =
                        typeLow === "required"
                          ? "text-[var(--warning)]"
                          : typeLow === "recommended"
                            ? "text-[var(--accent)]"
                            : typeLow === "notusable"
                              ? "text-[var(--danger)]"
                              : "text-[var(--subtext)]";

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => handleToggleOption(grp, opt, effType)}
                          className={`w-full text-left glass-surface rounded-xl p-3 border transition-all flex items-start gap-3 ${
                            isDisabled
                              ? "opacity-45 cursor-not-allowed border-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                              : isSelected
                                ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] cursor-pointer"
                                : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] cursor-pointer"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[18px] mt-0.5 shrink-0 ${
                              isSelected ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                            }`}
                          >
                            {isRadio
                              ? isSelected
                                ? t("icon_radio_button_checked", "radio_button_checked")
                                : t("icon_radio_button_unchecked", "radio_button_unchecked")
                              : isSelected
                                ? t("icon_check_box", "check_box")
                                : t("icon_check_box_outline_blank", "check_box_outline_blank")}
                          </span>

                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {opt.name}
                              </span>
                              <span
                                className={`${VAULT_CHIP_CLASS} px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ml-auto shrink-0 ${badgeColor}`}
                              >
                                {badgeLabel}
                              </span>
                            </div>

                            {opt.description && (
                              <p className="text-[11px] text-[var(--subtext)] leading-relaxed m-0 whitespace-pre-wrap">
                                {opt.description}
                              </p>
                            )}

                            {opt.image_data_url && (
                              <img
                                src={opt.image_data_url}
                                alt={opt.name}
                                className="mt-1.5 max-h-28 w-auto object-contain rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] self-start"
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </UniversalGroup>
              );
            })}
          </div>
        )}

        {isLastStep && (
          <div className="flex flex-col gap-1.5 glass-surface p-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("fomod_target_folder_label", "Target {Vault} Subfolder")}
            </label>
            <input
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              placeholder={t("fomod_target_folder_placeholder", "Folder name inside {Vault}...")}
              className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] outline-none border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <div className="flex items-center gap-2">
            <ActionButton
              variant="glass"
              icon={t("icon_close", "close")}
              label={t("cancel", "Cancel")}
              disabled={isSubmitting}
              onClick={handleCancel}
            />
            {clampedStepIdx > 0 && (
              <ActionButton
                variant="glass"
                icon={t("icon_arrow_back", "arrow_back")}
                label={t("back", "Back")}
                disabled={isSubmitting}
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              />
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {!canAdvanceCurrentStep && (
              <span className="text-[10px] font-bold text-[var(--warning)]">
                {t("fomod_select_at_least_one", "Select required option(s) to continue.")}
              </span>
            )}
            {!isLastStep ? (
              <ActionButton
                variant="accent"
                icon={t("icon_arrow_forward", "arrow_forward")}
                label={t("fomod_next_step", "Next Step")}
                disabled={!canAdvanceCurrentStep}
                onClick={() => setStepIdx((i) => Math.min(totalSteps - 1, i + 1))}
              />
            ) : (
              <ActionButton
                variant="accent"
                icon={t("icon_download", "download")}
                label={
                  isSubmitting
                    ? t("installing", "Installing...")
                    : t("btn_install", "Install")
                }
                disabled={isSubmitting || !canAdvanceCurrentStep}
                onClick={handleInstall}
              />
            )}
          </div>
        </div>
      </div>
    </SidePanel>
  );
};
