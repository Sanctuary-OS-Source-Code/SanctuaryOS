import { LocalDocSlug } from "../../utils/directivesSync";

export type PostEditorMode = "visual" | "wysiwyg" | "markdown";

export type ReleaseDocSlotKey =
  | "stable:post"
  | "dev:post"
  | "stable:changelog"
  | "dev:changelog";

export const RELEASE_SLOT_LOCAL_META: Record<
  ReleaseDocSlotKey,
  { slug: LocalDocSlug; fileName: string }
> = {
  "stable:post": {
    slug: "release_notes_public",
    fileName: "Release Notes (Community Blog).md",
  },
  "dev:post": {
    slug: "release_notes_dev",
    fileName: "Release Notes (Dev).md",
  },
  "stable:changelog": {
    slug: "changelog_running",
    fileName: "changelog (running).md",
  },
  "dev:changelog": {
    slug: "changelog_dev",
    fileName: "changelog.md",
  },
};
