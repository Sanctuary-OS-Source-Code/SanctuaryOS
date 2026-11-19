import {
  DashboardStatTile,
  SidePanelFilterBar,
  ActionButton,
} from "../../shared";
import { renderCleanInlineText } from "../release-notes/ReleaseMarkdownViewer";
import { BalancedCardColumns, renderDirectiveHeading } from "../InteractiveForkingGuideView";
import {
  resolveRoadmapSubCardStatus,
  getRoadmapStatusMeta,
  RoadmapMilestoneStatus,
} from "../../utils/directivesBuilderSchema";

export function WebGuideView({
  td,
  t,
  guideMode,
  setGuideMode,
  walkIdx,
  setWalkIdx,
  guideStepIdx,
  setGuideStepIdx,
  roleTierIdx,
  setRoleTierIdx,
  guideDrawerRef,
  scrollDrawerIntoCenter,
  citizenSteps,
  walkthroughStages,
  elevatedRoles,
  customGuideSchema,
}: any) {
    const customWalkTab = customGuideSchema?.tabs.find(
      (tb: any) => tb.id === "walkthrough"
    );
    const customModTab = customGuideSchema?.tabs.find(
      (tb: any) => tb.id === "modules"
    );
    const customRoleTab = customGuideSchema?.tabs.find(
      (tb: any) => tb.id === "roles"
    );

    const effectiveWalkStages = customWalkTab?.cards?.length
      ? customWalkTab.cards.map((c: any, idx: any) => ({
          num: idx + 1,
          short: td(c.badge || ""),
          overline: td(c.overline || ""),
          icon: c.icon,
          title: td(c.title || ""),
          sub: td(c.footerMeta || ""),
          desc: td(c.desc || ""),
          controls: (c.subCards || []).map((sc: any) => ({
            icon: sc.icon,
            name: td(sc.title || ""),
            desc: td(sc.desc || ""),
          })),
        }))
      : walkthroughStages;

    const effectiveCitizenSteps = customModTab?.cards?.length
      ? customModTab.cards.map((c: any) => ({
          short: td(c.badge || ""),
          overline: td(c.overline || ""),
          title: td(c.title || ""),
          badge: td(c.footerMeta || ""),
          icon: c.icon,
          desc: td(c.desc || ""),
          tip: td(c.tip || ""),
          cards: (c.subCards || []).map((sc: any) => ({
            icon: sc.icon,
            title: td(sc.title || ""),
            desc: td(sc.desc || ""),
          })),
        }))
      : citizenSteps;

    const effectiveRoles = customRoleTab?.cards?.length
      ? customRoleTab.cards.map((c: any) => ({
          short: td(c.title || ""),
          icon: c.icon,
          title: td(c.title || ""),
          badge: td(c.overline || c.footerMeta || ""),
          desc: td(c.desc || ""),
          requiresPasskey: c.status !== "citizen",
          subCards: (c.subCards || []).map((sc: any) => ({
            ...sc,
            title: td(sc.title || ""),
            desc: td(sc.desc || ""),
          })),
        }))
      : elevatedRoles;

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Top Tiles (Responsive SidePanel Filter Grid) */}
        <SidePanelFilterBar className="sm:grid-cols-3 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_play_circle", "play_circle")}
            label={`${effectiveWalkStages.length} ${t("dir_guide_stages_unit", "STAGES")}`}
            number={td(
              customWalkTab?.value ||
                t("dir_guide_mode_walk_val", "OS Walkthrough")
            )}
            colorClass="text-[var(--accent)]"
            isActive={guideMode === "walkthrough"}
            onClick={() => setGuideMode("walkthrough")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_explore", "explore")}
            label={`${effectiveCitizenSteps.length} ${t("dir_guide_modules_unit", "MODULES")}`}
            number={td(
              customModTab?.value ||
                t("dir_guide_mode_mod_val", "{Citizen} Tools")
            )}
            colorClass="text-[var(--accent)]"
            isActive={guideMode === "modules"}
            onClick={() => setGuideMode("modules")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_admin_panel_settings", "admin_panel_settings")}
            label={`${effectiveRoles.length} ${t("dir_guide_tiers_unit", "TIERS")}`}
            number={td(
              customRoleTab?.value || t("dir_wt_t8_val", "Role Tiers")
            )}
            colorClass="text-[var(--accent)]"
            isActive={guideMode === "roles"}
            onClick={() => setGuideMode("roles")}
          />
        </SidePanelFilterBar>

        {/* Mode 1: 7-Stage Interactive UI Walkthrough (Single-Column Stacked Cards: Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        {guideMode === "walkthrough" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveWalkStages.map((stg: any, idx: any) => {
              const isActive = walkIdx === idx;
              const stageOverline =
                (stg as any).overline ||
                t("dir_walk_step_counter", "STAGE {0} OF {1}")
                  .replace("{0}", String(idx + 1))
                  .replace("{1}", String(effectiveWalkStages.length));

              return (
                <div
                  key={`${stg.num}-${idx}`}
                  ref={isActive ? guideDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setWalkIdx(idx);
                          scrollDrawerIntoCenter(guideDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setWalkIdx(idx);
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  {!isActive ? (
                    /* Compact Unselected Row */
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex flex-wrap items-center md:items-start justify-between gap-2.5 min-w-0">
                        <div className="flex items-center md:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                            <span className="material-symbols-outlined !text-[20px]">
                              {stg.icon}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80 leading-snug truncate">
                              {stageOverline}
                            </span>
                            <h3 className="hidden md:block text-base font-black text-[var(--text)] tracking-tight leading-snug break-words m-0">
                              {renderDirectiveHeading(stg.title)}
                            </h3>
                            <span className="hidden md:block text-[11px] font-normal text-[var(--subtext)] opacity-75 truncate">
                              {stg.sub}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                            <span>{stg.short}</span>
                          </span>
                          <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_expand_more", "expand_more")}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex md:hidden flex-col gap-0.5 min-w-0">
                        <h3 className="text-sm font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                          {renderDirectiveHeading(stg.title)}
                        </h3>
                        <span className="text-[11px] font-normal text-[var(--subtext)] opacity-75 break-words">
                          {stg.sub}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Expanded Active Card (100% Opaque) */
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setWalkIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setWalkIdx(-1);
                          }
                        }}
                        className="flex flex-col gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center md:items-start justify-between gap-2.5 min-w-0">
                          <div className="flex items-center md:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[20px] sm:!text-[22px]">
                                {stg.icon}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] leading-snug text-[var(--accent)] break-words">
                                {stageOverline}
                              </span>
                              <h3 className="hidden md:block text-lg font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                                {renderDirectiveHeading(stg.title)}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_check_circle", "check_circle")}
                              </span>
                              <span>{stg.short}</span>
                            </span>
                            <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_expand_less", "expand_less")}
                              </span>
                            </span>
                          </div>
                        </div>

                        <h3 className="md:hidden text-base font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                          {renderDirectiveHeading(stg.title)}
                        </h3>

                        <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                          {renderCleanInlineText(stg.desc)}
                        </p>
                      </div>

                      <div className="flex flex-col gap-4 pt-3.5 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <BalancedCardColumns
                          items={stg.controls}
                          columns={3}
                          renderItem={(ctrl: any, cIdx: any) => (
                            <div
                              key={`${ctrl.name}-${cIdx}`}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                                  {ctrl.icon}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--text)] leading-snug min-w-0 flex-1 break-words [overflow-wrap:anywhere] m-0">
                                  {renderDirectiveHeading(ctrl.name)}
                                </h4>
                              </div>
                              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                                {renderCleanInlineText(ctrl.desc)}
                              </p>
                            </div>
                          )}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <ActionButton
                            variant="glass"
                            className="shrink-0"
                            icon={t("icon_navigate_before", "navigate_before")}
                            disabled={walkIdx <= 0}
                            onClick={() => {
                              setWalkIdx((prev: any) => Math.max(0, prev - 1));
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("dir_walk_prev", "Previous Stage")}
                          </ActionButton>
                          <span className="hidden sm:block min-w-0 flex-1 text-center text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                            {stg.sub}
                          </span>
                          <ActionButton
                            variant="accent"
                            className="shrink-0"
                            icon={t("icon_navigate_next", "navigate_next")}
                            disabled={
                              walkIdx >= effectiveWalkStages.length - 1
                            }
                            onClick={() => {
                              setWalkIdx((prev: any) =>
                                Math.min(
                                  effectiveWalkStages.length - 1,
                                  prev + 1
                                )
                              );
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("dir_walk_next", "Next Stage")}
                          </ActionButton>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Mode 2: 9 Citizen Modules Deep-Dive (Single-Column Stacked Cards: Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        {guideMode === "modules" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveCitizenSteps.map((step: any, idx: any) => {
              const isActive = guideStepIdx === idx;
              const modOverline =
                (step as any).overline ||
                t("sd_guide_step_progress", "Module {0} of {1}")
                  .replace("{0}", String(idx + 1))
                  .replace("{1}", String(effectiveCitizenSteps.length));

              return (
                <div
                  key={`${step.short}-${idx}`}
                  ref={isActive ? guideDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setGuideStepIdx(idx);
                          scrollDrawerIntoCenter(guideDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setGuideStepIdx(idx);
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  {!isActive ? (
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex items-center justify-between gap-2.5 sm:gap-3 min-w-0">
                        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                            <span className="material-symbols-outlined !text-[20px]">
                              {step.icon}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80 leading-snug truncate">
                              {modOverline}
                            </span>
                            <h3 className="hidden sm:block text-base font-black text-[var(--text)] tracking-tight leading-snug truncate m-0">
                              {renderDirectiveHeading(step.title)}
                            </h3>
                            <span className="hidden sm:block text-[11px] font-normal text-[var(--subtext)] opacity-75 truncate">
                              {step.badge}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                            <span>{step.short}</span>
                          </span>
                          <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_expand_more", "expand_more")}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex md:hidden flex-col gap-0.5 min-w-0">
                        <h3 className="text-sm font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                          {renderDirectiveHeading(step.title)}
                        </h3>
                        <span className="text-[11px] font-normal text-[var(--subtext)] opacity-75 break-words">
                          {step.badge}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setGuideStepIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setGuideStepIdx(-1);
                          }
                        }}
                        className="flex flex-col gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center md:items-start justify-between gap-2.5 min-w-0">
                          <div className="flex items-center md:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[20px] sm:!text-[22px]">
                                {step.icon}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] leading-snug text-[var(--accent)] break-words">
                                {modOverline}
                              </span>
                              <h3 className="hidden md:block text-lg font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                                {renderDirectiveHeading(step.title)}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_check_circle", "check_circle")}
                              </span>
                              <span>{step.short}</span>
                            </span>
                            <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_expand_less", "expand_less")}
                              </span>
                            </span>
                          </div>
                        </div>

                        <h3 className="md:hidden text-base font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                          {renderDirectiveHeading(step.title)}
                        </h3>

                        <p className="text-xs font-normal text-[var(--subtext)] opacity-95 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                          {renderCleanInlineText(step.desc)}
                        </p>
                      </div>

                      <div className="flex flex-col gap-4 pt-3.5 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <BalancedCardColumns
                          items={step.cards}
                          columns={2}
                          renderItem={(card: any, cIdx: any) => (
                            <div
                              key={`${card.title}-${cIdx}`}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span
                                  className={`material-symbols-outlined !text-[16px] shrink-0 mt-0.5 ${
                                    (card as any).colorClass ||
                                    "text-[var(--accent)]"
                                  }`}
                                >
                                  {card.icon}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--text)] leading-snug min-w-0 flex-1 break-words [overflow-wrap:anywhere] m-0">
                                  {renderDirectiveHeading(card.title)}
                                </h4>
                              </div>
                              <p className="text-xs font-normal text-[color-mix(in_srgb,var(--text)_80%,transparent)] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                                {renderCleanInlineText(card.desc)}
                              </p>
                            </div>
                          )}
                        />

                        {step.tip && (
                          <div className="glass-surface rounded-2xl p-4 flex items-start gap-2.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                              {t("icon_lightbulb", "lightbulb")}
                            </span>
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <span className="text-sm font-bold text-[var(--text)] leading-snug">
                                {t("sd_guide_pro_tip_label", "{Citizen} Pro Tip")}
                              </span>
                              <p className="text-xs font-normal text-[color-mix(in_srgb,var(--text)_80%,transparent)] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                                {renderCleanInlineText(step.tip)}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3 pt-3 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <ActionButton
                            variant="glass"
                            className="shrink-0"
                            icon={t("icon_navigate_before", "navigate_before")}
                            disabled={guideStepIdx <= 0}
                            onClick={() => {
                              setGuideStepIdx((prev: any) => Math.max(0, prev - 1));
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("sd_btn_prev_step", "Previous Module")}
                          </ActionButton>
                          <span className="hidden sm:block min-w-0 flex-1 text-center text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                            {step.badge}
                          </span>
                          <ActionButton
                            variant="accent"
                            className="shrink-0"
                            icon={t("icon_navigate_next", "navigate_next")}
                            disabled={
                              guideStepIdx >= effectiveCitizenSteps.length - 1
                            }
                            onClick={() => {
                              setGuideStepIdx((prev: any) =>
                                Math.min(
                                  effectiveCitizenSteps.length - 1,
                                  prev + 1
                                )
                              );
                              scrollDrawerIntoCenter(guideDrawerRef);
                            }}
                          >
                            {t("sd_btn_next_step", "Next Module")}
                          </ActionButton>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Mode 3: 6-Tier Role Hierarchy (Single-Column Stacked Cards: Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        {guideMode === "roles" && (
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveRoles.map((role: any, rIdx: any) => {
              const isActive = roleTierIdx === rIdx;

              return (
                <div
                  key={`${role.short}-${rIdx}`}
                  ref={isActive ? guideDrawerRef : undefined}
                  role={!isActive ? "button" : undefined}
                  tabIndex={!isActive ? 0 : undefined}
                  onClick={
                    !isActive
                      ? () => {
                          setRoleTierIdx(rIdx);
                          scrollDrawerIntoCenter(guideDrawerRef);
                        }
                      : undefined
                  }
                  onKeyDown={
                    !isActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setRoleTierIdx(rIdx);
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }
                        }
                      : undefined
                  }
                  className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                    isActive
                      ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                      : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                  }`}
                >
                  {!isActive ? (
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex items-center justify-between gap-2.5 sm:gap-3 min-w-0">
                        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                            <span className="material-symbols-outlined !text-[20px]">
                              {role.icon}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80 leading-snug truncate">
                              {role.badge}
                            </span>
                            <h3 className="hidden sm:block text-base font-black text-[var(--text)] tracking-tight leading-snug truncate m-0">
                              {renderDirectiveHeading(role.title)}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                            <span
                              className={`material-symbols-outlined !text-[12px] ${
                                role.requiresPasskey
                                  ? "text-[var(--warning)]"
                                  : "text-[var(--success)]"
                              }`}
                            >
                              {role.requiresPasskey
                                ? t("icon_passkey", "passkey")
                                : t("icon_check_circle", "check_circle")}
                            </span>
                            <span>
                              {role.requiresPasskey
                                ? t("auth_passkey_badge_fido", "FIDO2 Passkey")
                                : t("role_citizen", "{Citizen}")}
                            </span>
                          </span>
                          <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_expand_more", "expand_more")}
                            </span>
                          </span>
                        </div>
                      </div>

                      <h3 className="md:hidden text-sm font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                        {renderDirectiveHeading(role.title)}
                      </h3>
                    </div>
                  ) : (
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setRoleTierIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setRoleTierIdx(-1);
                          }
                        }}
                        className="flex flex-col gap-3 min-w-0 cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center md:items-start justify-between gap-2.5 min-w-0">
                          <div className="flex items-center md:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[20px] sm:!text-[22px]">
                                {role.icon}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] leading-snug text-[var(--accent)] break-words">
                                {role.badge}
                              </span>
                              <h3 className="hidden md:block text-lg font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                                {renderDirectiveHeading(role.title)}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                              <span
                                className={`material-symbols-outlined !text-[12px] ${
                                  role.requiresPasskey
                                    ? "text-[var(--warning)]"
                                    : "text-[var(--success)]"
                                }`}
                              >
                                {role.requiresPasskey
                                  ? t("icon_passkey", "passkey")
                                  : t("icon_check_circle", "check_circle")}
                              </span>
                              <span>
                                {role.requiresPasskey
                                  ? t("auth_passkey_badge_fido", "FIDO2 Passkey")
                                  : t("role_citizen", "{Citizen}")}
                              </span>
                            </span>
                            <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_expand_less", "expand_less")}
                              </span>
                            </span>
                          </div>
                        </div>

                        <h3 className="md:hidden text-base font-black text-[var(--text)] tracking-tight leading-snug break-words [overflow-wrap:anywhere] m-0">
                          {renderDirectiveHeading(role.title)}
                        </h3>

                        <p className="text-xs font-normal text-[color-mix(in_srgb,var(--text)_82%,transparent)] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                          {renderCleanInlineText(role.desc)}
                        </p>
                      </div>

                      {(role as any).subCards?.length > 0 && (
                        <BalancedCardColumns
                          items={(role as any).subCards as any[]}
                          columns={2}
                          className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          renderItem={(sc: any, scIdx: number) => (
                            <div
                              key={`${sc.id || scIdx}`}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                                  {sc.icon ||
                                    t("icon_check_circle", "check_circle")}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--text)] leading-snug min-w-0 flex-1 break-words [overflow-wrap:anywhere] m-0">
                                  {renderDirectiveHeading(sc.title)}
                                </h4>
                              </div>
                              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                                {renderCleanInlineText(sc.desc)}
                              </p>
                            </div>
                          )}
                        />
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <ActionButton
                          variant="glass"
                          className="shrink-0"
                          icon={t("icon_navigate_before", "navigate_before")}
                          disabled={roleTierIdx <= 0}
                          onClick={() => {
                            setRoleTierIdx((prev: any) => Math.max(0, prev - 1));
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }}
                        >
                          {t("sd_proto_prev_tier", "Previous Tier")}
                        </ActionButton>
                        <span className="hidden sm:block min-w-0 flex-1 text-center text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                          {role.badge}
                        </span>
                        <ActionButton
                          variant="accent"
                          className="shrink-0"
                          icon={t("icon_navigate_next", "navigate_next")}
                          disabled={roleTierIdx >= effectiveRoles.length - 1}
                          onClick={() => {
                            setRoleTierIdx((prev: any) =>
                              Math.min(effectiveRoles.length - 1, prev + 1)
                            );
                            scrollDrawerIntoCenter(guideDrawerRef);
                          }}
                        >
                          {t("sd_proto_next_tier", "Next Tier")}
                        </ActionButton>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };


export function WebRoadmapView({
  td,
  t,
  roadmapFilter,
  setRoadmapFilter,
  selectedPhaseNum,
  setSelectedPhaseNum,
  roadmapDrawerRef,
  scrollDrawerIntoCenter,
  roadmapPhases,
  customRoadmapSchema,
}: any) {
    const customPhasesTab =
      customRoadmapSchema?.tabs?.find(
        (tab: any) => tab.id === "all" || tab.id === "phases"
      ) || customRoadmapSchema?.tabs?.[0];
    const totalCustomPhases = customPhasesTab?.cards?.length || 14;
    const rawPhases =
      customPhasesTab && customPhasesTab.cards.length > 0
        ? customPhasesTab.cards.map((c: any, idx: any) => {
            const idMatch = (c.id || "").match(/^phase_(\d+)$/i);
            const phaseMatch = (c.overline || c.title || "").match(
              /\bPhase\s+(\d+)/i
            );
            const parsedNum = idMatch
              ? parseInt(idMatch[1], 10)
              : phaseMatch
                ? parseInt(phaseMatch[1], 10)
                : Math.max(1, totalCustomPhases - idx);
            const resolvedCardStatus: "planned" | "active" | "in_testing" | "completed" =
              c.status === "planned" ||
              /\bplanned\b/i.test(c.badge || "")
                ? "planned"
                : c.status === "in_testing" ||
                    /in\s+testing|in\s+dev\s+build/i.test(c.badge || "")
                  ? "in_testing"
                  : c.status === "active"
                    ? "active"
                    : "completed";
            return {
              num: parsedNum,
              code: td(c.overline || `Phase ${parsedNum}`),
              title: td(c.title || ""),
              sub: td(c.footerMeta || ""),
              status: resolvedCardStatus,
              icon: c.icon || t("icon_rocket_launch", "rocket_launch"),
              desc: td(c.desc || ""),
              milestones: (c.subCards || []).map((sc: any) => {
                const mStatus = resolveRoadmapSubCardStatus(sc);
                return {
                  title: td(sc.title || ""),
                  desc: td(sc.desc || ""),
                  icon: sc.icon || "",
                  pending: mStatus === "in_progress" || mStatus === "planned",
                  roadmapStatus: mStatus,
                };
              }),
            };
          })
        : roadmapPhases.map((rp: any) => ({
            ...rp,
            status: rp.status as "planned" | "active" | "in_testing" | "completed",
            milestones: rp.milestones.map((m: any) => ({
              ...m,
              icon: "",
              pending: Boolean((m as any).pending),
              roadmapStatus: (rp.status === "planned"
                ? "planned"
                : (m as any).pending
                  ? "in_progress"
                  : "completed") as RoadmapMilestoneStatus,
            })),
          }));

    const seenPhaseNums = new Set<number>();
    const effectivePhases = rawPhases.filter((p: any) => {
      if (seenPhaseNums.has(p.num)) return false;
      seenPhaseNums.add(p.num);
      return true;
    });

    const topPhaseNum = effectivePhases[0]?.num || 16;
    const activeEraPhase =
      effectivePhases.find((p: any) => p.status === "active") || effectivePhases[0];
    const completedPhases = effectivePhases.filter(
      (p: any) => p.status === "completed"
    );
    const topCompletedPhaseNum =
      completedPhases[0]?.num ?? Math.max(1, topPhaseNum - 1);

    const filteredPhases = effectivePhases.filter((p: any) => {
      if (roadmapFilter === "active") return p.status !== "completed";
      if (roadmapFilter === "completed") return p.status === "completed";
      return true;
    });

    const resolvedSelectedPhaseNum =
      selectedPhaseNum === 0
        ? 0
        : filteredPhases.some((p: any) => p.num === selectedPhaseNum)
          ? selectedPhaseNum
          : filteredPhases[0]?.num ?? 0;

    const activePhaseIdx = filteredPhases.findIndex(
      (p: any) => p.num === resolvedSelectedPhaseNum
    );

    return (
      <div className="flex flex-col gap-6">
        {/* 1x3 Interactive Filter Tabs (Responsive SidePanel Filter Grid) */}
        <SidePanelFilterBar className="sm:grid-cols-3 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_timeline", "timeline")}
            label={`${effectivePhases.length} ${t("dir_roadmap_phases_unit", "Phases")}`}
            number={t("sd_roadmap_filter_all_val", "Full Timeline")}
            colorClass="text-[var(--accent)]"
            isActive={roadmapFilter === "all"}
            onClick={() => {
              setRoadmapFilter("all");
              setSelectedPhaseNum(topPhaseNum);
            }}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_rocket_launch", "rocket_launch")}
            label={t("dir_phase_tab_active_lbl", "Current Era")}
            number={`${t("dir_phase_word", "Phase")} ${activeEraPhase?.num || topPhaseNum} ${t("active", "Active")}`}
            colorClass="text-[var(--accent)]"
            isActive={roadmapFilter === "active"}
            onClick={() => {
              setRoadmapFilter("active");
              setSelectedPhaseNum(activeEraPhase?.num || topPhaseNum);
            }}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_check_circle", "check_circle")}
            label={t("dir_roadmap_tile_done", "Completed")}
            number={`${t("dir_roadmap_phases_unit", "Phases")} ${topCompletedPhaseNum} → 1`}
            colorClass="text-[var(--success)]"
            isActive={roadmapFilter === "completed"}
            onClick={() => {
              setRoadmapFilter("completed");
              setSelectedPhaseNum(topCompletedPhaseNum);
            }}
          />
        </SidePanelFilterBar>

        {/* Single-Column Stacked Phase Cards (Unselected Compact & Dimmed opacity-50, Active Expanded In-Place) */}
        <div className="flex flex-col gap-3.5 w-full">
          {filteredPhases.map((phase: any, idx: any) => {
            const phaseMeta = getRoadmapStatusMeta(phase.status, t);
            const isExpanded = resolvedSelectedPhaseNum === phase.num;

            return (
              <div
                key={`phase-${phase.num}-${idx}`}
                ref={isExpanded ? roadmapDrawerRef : undefined}
                role={!isExpanded ? "button" : undefined}
                tabIndex={!isExpanded ? 0 : undefined}
                onClick={
                  !isExpanded
                    ? () => {
                        setSelectedPhaseNum(phase.num);
                        scrollDrawerIntoCenter(roadmapDrawerRef);
                      }
                    : undefined
                }
                onKeyDown={
                  !isExpanded
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedPhaseNum(phase.num);
                          scrollDrawerIntoCenter(roadmapDrawerRef);
                        }
                      }
                    : undefined
                }
                className={`relative glass-panel rounded-2xl flex flex-col min-w-0 overflow-hidden border text-left transition-all duration-300 ${
                  isExpanded
                    ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
                    : "px-4 py-3.5 opacity-50 hover:opacity-85 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer"
                }`}
              >
                {!isExpanded ? (
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between gap-2.5 sm:gap-3 min-w-0">
                      <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--subtext)] group-hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined !text-[20px]">
                            {phase.icon}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--subtext)] opacity-80 leading-snug truncate">
                            {phase.code}
                          </span>
                          <h3 className="hidden sm:block text-base font-black tracking-tight text-[var(--text)] leading-snug truncate m-0">
                            {renderDirectiveHeading(phase.title)}
                          </h3>
                          <span className="hidden sm:block text-[11px] font-normal text-[var(--subtext)] opacity-75 truncate">
                            {phase.sub}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                          <span
                            className={`material-symbols-outlined !text-[12px] ${phaseMeta.colorClass}`}
                          >
                            {phaseMeta.icon}
                          </span>
                          <span>{phaseMeta.label}</span>
                        </span>
                        <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] group-hover:text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_expand_more", "expand_more")}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex md:hidden flex-col gap-0.5 min-w-0">
                      <h3 className="text-sm font-black tracking-tight text-[var(--text)] leading-snug break-words [overflow-wrap:anywhere] m-0">
                        {renderDirectiveHeading(phase.title)}
                      </h3>
                      <span className="text-[11px] font-normal text-[var(--subtext)] opacity-75 break-words">
                        {phase.sub}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPhaseNum(0)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedPhaseNum(0);
                        }
                      }}
                      className="flex flex-col gap-3 min-w-0 cursor-pointer"
                    >
                      <div className="flex flex-wrap items-center md:items-start justify-between gap-2.5 min-w-0">
                        <div className="flex items-center md:items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                          <div
                            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors ${phaseMeta.colorClass}`}
                          >
                            <span className="material-symbols-outlined !text-[20px] sm:!text-[22px]">
                              {phase.icon}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span
                              className={`text-[10px] font-black uppercase tracking-[0.18em] leading-snug break-words ${phaseMeta.colorClass}`}
                            >
                              {phase.code}
                            </span>
                            <h3 className="hidden md:block text-lg font-black tracking-tight text-[var(--text)] leading-snug break-words [overflow-wrap:anywhere] m-0">
                              {renderDirectiveHeading(phase.title)}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                            <span
                              className={`material-symbols-outlined !text-[12px] ${phaseMeta.colorClass}`}
                            >
                              {phaseMeta.icon}
                            </span>
                            <span>{phaseMeta.label}</span>
                          </span>
                          <span className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)]">
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_expand_less", "expand_less")}
                            </span>
                          </span>
                        </div>
                      </div>

                      <h3 className="md:hidden text-base font-black tracking-tight text-[var(--text)] leading-snug break-words [overflow-wrap:anywhere] m-0">
                        {renderDirectiveHeading(phase.title)}
                      </h3>

                      <p className="text-xs font-normal text-[color-mix(in_srgb,var(--text)_82%,transparent)] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                        {renderCleanInlineText(phase.desc)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-4 pt-3.5 min-w-0 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <BalancedCardColumns
                        items={phase.milestones}
                        columns={2}
                        renderItem={(m: any, mIdx: any) => {
                          const mStatus = resolveRoadmapSubCardStatus(m);
                          const mMeta = getRoadmapStatusMeta(mStatus, t);
                          return (
                            <div
                              key={mIdx}
                              className="glass-surface rounded-2xl p-4 flex flex-col gap-2 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                                <span
                                  className={`material-symbols-outlined !text-[16px] shrink-0 ${mMeta.colorClass}`}
                                >
                                  {mMeta.icon}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[8px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap">
                                  <span
                                    className={`material-symbols-outlined !text-[11px] ${mMeta.colorClass}`}
                                  >
                                    {mMeta.icon}
                                  </span>
                                  <span>{mMeta.label}</span>
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-[var(--text)] leading-snug min-w-0 break-words [overflow-wrap:anywhere] m-0">
                                {renderDirectiveHeading(
                                  m.title.replace(/^(\u2705|\u23F3|\u{1F9EA})\s*/u, "")
                                )}
                              </h4>
                              <p className="text-xs font-normal text-[color-mix(in_srgb,var(--text)_80%,transparent)] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] m-0">
                                {renderCleanInlineText(m.desc)}
                              </p>
                            </div>
                          );
                        }}
                      />

                      {filteredPhases.length > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <ActionButton
                            variant="glass"
                            icon={t("icon_navigate_before", "navigate_before")}
                            disabled={activePhaseIdx <= 0}
                            onClick={() => {
                              const prevPhase =
                                filteredPhases[Math.max(0, activePhaseIdx - 1)];
                              if (prevPhase) {
                                setSelectedPhaseNum(prevPhase.num);
                                scrollDrawerIntoCenter(roadmapDrawerRef);
                              }
                            }}
                          >
                            {t("sd_roadmap_prev_phase", "Previous Phase")}
                          </ActionButton>
                          <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                            {phase.sub}
                          </span>
                          <ActionButton
                            variant="accent"
                            icon={t("icon_navigate_next", "navigate_next")}
                            disabled={
                              activePhaseIdx >= filteredPhases.length - 1
                            }
                            onClick={() => {
                              const nextPhase =
                                filteredPhases[
                                  Math.min(
                                    filteredPhases.length - 1,
                                    activePhaseIdx + 1
                                  )
                                ];
                              if (nextPhase) {
                                setSelectedPhaseNum(nextPhase.num);
                                scrollDrawerIntoCenter(roadmapDrawerRef);
                              }
                            }}
                          >
                            {t("sd_roadmap_next_phase", "Next Phase")}
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
}
