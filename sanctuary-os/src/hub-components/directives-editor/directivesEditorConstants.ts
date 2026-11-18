import { LEGAL_DOC_CATEGORIES, DirectiveSlug } from "../../utils/directivesSync";

export const CATEGORY_TO_SLUG: Record<string, DirectiveSlug> = {
  "Citizen Guide": "citizen_guide",
  "Forking Guide": "forking_guide",
  "Phase Roadmap": "phase_roadmap",
  "Master Architecture": "master_architecture",
  "Master Protocol List": "master_protocols",
};

export const SLUG_ICON_MAP: Record<DirectiveSlug, { key: string; fallback: string }> = {
  citizen_guide: { key: "icon_school", fallback: "school" },
  phase_roadmap: { key: "icon_timeline", fallback: "timeline" },
  forking_guide: { key: "icon_call_split", fallback: "call_split" },
  master_architecture: { key: "icon_architecture", fallback: "architecture" },
  master_protocols: { key: "icon_verified_user", fallback: "verified_user" },
};

export const NEWS_CATEGORIES = [
  "Announcement",
  "Blog",
  "Press",
  "Update",
  "Maintenance",
];

export const LEGAL_CATEGORIES: string[] = [...LEGAL_DOC_CATEGORIES];

export type EditorRecordKind = "directive" | "news" | "legal";
export type EditorViewMode = "visual" | "wysiwyg" | "markdown";

