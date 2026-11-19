import { DirectiveSlug } from "../directivesSync";

export type RoadmapMilestoneStatus = "planned" | "in_progress" | "in_testing" | "completed";

export interface DirectiveBuilderSubCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
  pending?: boolean;
  roadmapStatus?: RoadmapMilestoneStatus;
}

export interface DirectiveBuilderCard {
  id: string;
  icon: string;
  overline: string;
  badge: string;
  title: string;
  footerMeta: string;
  desc: string;
  tip?: string;
  codeSnippet?: string;
  status?:
    | "planned"
    | "active"
    | "in_testing"
    | "completed"
    | "passkey"
    | "citizen"
    | "warning"
    | "danger"
    | "info";
  subCards: DirectiveBuilderSubCard[];
}

export function resolveRoadmapSubCardStatus(sub?: {
  pending?: boolean;
  roadmapStatus?: RoadmapMilestoneStatus;
  title?: string;
  desc?: string;
} | null): RoadmapMilestoneStatus {
  if (!sub) return "completed";
  if (
    sub.roadmapStatus === "planned" ||
    sub.roadmapStatus === "in_progress" ||
    sub.roadmapStatus === "in_testing" ||
    sub.roadmapStatus === "completed"
  ) {
    return sub.roadmapStatus;
  }
  const combined = `${sub.title || ""} ${sub.desc || ""}`;
  if (/\bplanned\b/i.test(combined)) {
    return "planned";
  }
  if (
    /in\s+testing|in\s+dev\s+build/i.test(combined) ||
    combined.includes("\u{1F9EA}")
  ) {
    return "in_testing";
  }
  if (
    sub.pending === true ||
    /in\s+progress/i.test(combined) ||
    combined.includes("\u23F3")
  ) {
    return "in_progress";
  }
  return "completed";
}

export function getRoadmapStatusMeta(
  status: RoadmapMilestoneStatus | "active",
  t: (key: string, fallback: string) => string = defaultT
): {
  status: RoadmapMilestoneStatus;
  label: string;
  icon: string;
  colorClass: string;
} {
  if (status === "planned") {
    return {
      status: "planned",
      label: t("dir_roadmap_status_planned", "Planned"),
      icon: t("icon_upcoming", "upcoming"),
      colorClass: "text-[var(--info)]",
    };
  }
  if (status === "in_testing") {
    return {
      status: "in_testing",
      label: t("dir_roadmap_status_testing", "In Testing [In Dev Build]"),
      icon: t("icon_science", "science"),
      colorClass: "text-[var(--warning)]",
    };
  }
  if (status === "in_progress" || status === "active") {
    return {
      status: "in_progress",
      label: t("dir_roadmap_status_wip", "In Progress"),
      icon: t("icon_rocket_launch", "rocket_launch"),
      colorClass: "text-[var(--accent)]",
    };
  }
  return {
    status: "completed",
    label: t("dir_roadmap_status_complete_stable", "Complete"),
    icon: t("icon_check_circle", "check_circle"),
    colorClass: "text-[var(--success)]",
  };
}

export interface DirectiveBuilderTab {
  id: string;
  icon: string;
  label: string;
  value: string;
  cards: DirectiveBuilderCard[];
}

export interface DirectiveBuilderSchema {
  slug: DirectiveSlug;
  title: string;
  summary: string;
  isActive?: boolean;
  _schemaVersion?: number;
  _bodySig?: number;
  tabs: DirectiveBuilderTab[];
}

export const CURRENT_DIRECTIVE_SCHEMA_VERSION = 88;


export const defaultT = (_key: string, fallback?: string): string => fallback || _key;

export function interpolateDynamicText(
  t: (key: string, fallback: string) => string,
  rawText: string
): string {
  if (!rawText) return "";
  return t("__glossary_prose__", rawText);
}
