import { getExtensionRegex } from "./modUtils";
export const formatDisplayName = (
  name: string,
  t?: (key: string) => string,
  schema?: any,
) => {
  if (!name) return t?.("shared_unknown_artifact") || "Unknown Artifact";
  const rawName = String(name).split(/[\\/]/).pop() || "";

  if (schema && schema.extensions && schema.extensions.supported) {
    let cleaned = rawName;
    for (const ext of schema.extensions.supported) {
      if (cleaned.toLowerCase().endsWith(ext.toLowerCase())) {
        cleaned = cleaned.substring(0, cleaned.length - ext.length);
        break;
      }
    }
    return cleaned.replace(/_/g, " ");
  }

  return rawName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
};
export const cleanSearchName = (raw: string, schema?: any) => {
  if (!raw) return "";
  const parts = raw.split(/[/\\]/);
  let name = parts[parts.length - 1];

  if (schema) {
    name = name.replace(getExtensionRegex(schema), "");
  } else if (name.includes(".")) {
    const splitExt = name.split(".");
    splitExt.pop();
    name = splitExt.join(".");
  }
  return name
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
};
const RE_EXT_SUFFIX = /\.[^.]+$/;
const RE_SCRIPTS_SUFFIX = /_script(s)?$/i;
const RE_NON_ALPHANUM = /[^a-z0-9]/gi;

export const getNormalizedArtifactName = (name: string): string => {
  if (!name) return "";
  const str = String(name);
  const lastSlash = Math.max(str.lastIndexOf("/"), str.lastIndexOf("\\"));
  let clean = lastSlash >= 0 ? str.slice(lastSlash + 1) : str;
  clean = clean.replace(RE_EXT_SUFFIX, "");
  clean = clean.replace(RE_SCRIPTS_SUFFIX, "");
  clean = clean.replace(RE_NON_ALPHANUM, "");
  return clean.toLowerCase();
};
export const parseStringArray = (
  input: string | string[] | undefined | null,
): string[] => {
  if (!input) return [];

  let rawArray: string[] = [];
  if (Array.isArray(input)) {
    rawArray = [...input];
  } else if (typeof input === "string") {
    try {
      let parsed = JSON.parse(input);
      // Handle double-encoded JSON (e.g. '"[\"EP01\"]"' -> '["EP01"]')
      if (
        typeof parsed === "string" &&
        parsed.startsWith("[") &&
        parsed.endsWith("]")
      ) {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {}
      }

      if (Array.isArray(parsed)) {
        rawArray = parsed.map(String);
      } else {
        rawArray = [String(parsed)];
      }
    } catch (e) {
      rawArray = input.split(",");
    }
  }

  // Aggressively clean any lingering array brackets, quotes, or whitespace
  return rawArray
    .map((s) => {
      let clean = typeof s === "string" ? s.trim() : String(s);
      // Removes optional leading [ or " or ', and optional trailing ] or " or '
      clean = clean.replace(/^\[?\s*["']?|["']?\s*\]?$/g, "");
      return clean.trim();
    })
    .filter(Boolean);
};
export const stripMarkdown = (text: string) => {
  if (!text) return "";
  return text
    .replace(/\[IMG:[^\]]+\]\s*/g, "")
    .replace(/^(?:\*\*(?:Alert Type|Dispatch Type|Dispatch Date|Impact|Audience|Severity|Action Required|Action Needed):\*\*[^\r\n]*[\r\n]+)+(?:\s*---+\s*[\r\n]*)?/i, "")
    .replace(/(?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]\s*)?\\?\[((?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]|[^\]])+?)\\?\]\(asset:\/\/[^)]+\)/gi, "")
    .replace(/\\?\[ICON:[a-zA-Z0-9_-]+\\?\]/gi, (match) =>
      match.replace(/\\/g, ""),
    )
    .replace(/\[ASSET:[^\]]+\]/g, "")
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/(?:^|\n)\s*[-*_]{3,}\s*(?:\n|$)/g, " ")
    .replace(/(?:^|\s+)[-*+]\s+/g, " ")
    .replace(/(?:^|\s+)\d+\.\s+/g, " ")
    .replace(/`{1,3}[^`\n]+`{1,3}/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/\\\s*(?:\n|$)/g, " ")
    .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
};
export const formatOverviewMetric = (
  items: any[],
  dateField: string = "created_at",
) => {
  if (!items || items.length === 0) return "0 / 0";
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recent = items.filter(
    (i) => i && i[dateField] && new Date(i[dateField]) >= thirtyDaysAgo,
  ).length;
  return `${recent} / ${items.length}`;
};
export const renderTextWithIcons = (text: string) => {
  if (!text || typeof text !== "string") return text;

  const parts = text.split(/(\\?\[ICON:[a-zA-Z0-9_-]+\\?\])/gi);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/i);
        if (match) {
          const iconName = match[1].toLowerCase();
          return (
            <span
              key={i}
              className="material-symbols-outlined !text-[1.1em] align-middle px-1 inline-block"
            >
              {iconName}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};
export const extractPostImage = (markdown: any): string | undefined => {
  if (!markdown) return undefined;

  const cleanUrl = (u?: string) =>
    u ? u.trim().replace(/\\+$/, "").trim() : undefined;

  if (typeof markdown === "object") {
    if (markdown.image_url) return cleanUrl(String(markdown.image_url));
    const text =
      markdown.message ||
      markdown.content ||
      markdown.description ||
      markdown.body ||
      "";

    if (typeof text === "string") {
      const directMatch = text.match(/\[IMG:([\s\S]*?)\]/);
      if (directMatch && directMatch[1]) return cleanUrl(directMatch[1]);
    }
  } else if (typeof markdown === "string") {
    const directMatch = markdown.match(/\[IMG:([\s\S]*?)\]/);
    if (directMatch && directMatch[1]) return cleanUrl(directMatch[1]);
    const imgMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
    if (imgMatch && imgMatch[1]) return cleanUrl(imgMatch[1]);
    const htmlImgMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (htmlImgMatch && htmlImgMatch[1]) return cleanUrl(htmlImgMatch[1]);
  }

  return undefined;
};

