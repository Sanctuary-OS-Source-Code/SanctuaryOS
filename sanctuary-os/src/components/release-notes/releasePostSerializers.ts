import { stripMarkdown } from "../../shared";
import packageJson from "../../../package.json";
import { LEGACY_BLOG_BROADCAST_TITLE, PUBLIC_POST_BROADCAST_TITLE, DEV_POST_BROADCAST_TITLE, KeepersReleasePostRecord, stripEmojiPrefix, cleanPostBodyForViewer } from "./releaseMarkdownParser";

export function parseSeedCommunityBlog(markdown: string) {
  const lines = (markdown || "").split(/\r?\n/);
  let mainTitle = `Sanctuary OS v${packageJson.version}`;
  let subtitle = "";
  let releaseDate = "";
  let version = "";
  let platform = "";
  let intro = "";
  const tldrBullets: string[] = [];
  let inTldr = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      mainTitle = stripEmojiPrefix(line.replace(/^#\s+/, ""));
      continue;
    }
    if (!subtitle && line.startsWith("### ")) {
      subtitle = stripEmojiPrefix(line.replace(/^###\s+/, ""));
      continue;
    }
    if (!releaseDate && /release date:/i.test(line)) {
      const m = line.match(/release date:\s*\*{0,2}([^|*]+)/i);
      if (m && m[1]) releaseDate = m[1].trim();
    }
    if (!version && /version:/i.test(line)) {
      const vm = line.match(/version:\s*\*{0,2}([0-9A-Za-z._-]+)/i);
      if (vm && vm[1]) version = vm[1].trim();
    }
    if (!platform && /platform:/i.test(line)) {
      const pm = line.match(/platform:\s*\*{0,2}([^|*\n]+)/i);
      if (pm && pm[1]) platform = pm[1].trim();
    }
    if (line.startsWith("## ")) {
      const heading = line.replace(/^##\s+/, "").toLowerCase();
      inTldr = heading.includes("short version") || heading.includes("tl;dr");
      continue;
    }
    if (
      !inTldr &&
      !intro &&
      line &&
      line !== "---" &&
      !line.startsWith("**Release Date") &&
      !line.startsWith('*"')
    ) {
      intro = stripMarkdown(line);
    }
    if (inTldr && (line.startsWith("* ") || line.startsWith("- "))) {
      tldrBullets.push(stripMarkdown(line.replace(/^(\*|-)\s+/, "")));
    }
  }

  return {
    mainTitle,
    releaseDate,
    version,
    platform,
    summary: subtitle || intro || tldrBullets[0] || "",
    cleanBody: cleanPostBodyForViewer(markdown),
  };
}

export function formatReleasePostToMarkdownFile(
  record: Omit<KeepersReleasePostRecord, "id">
): string {
  const headerLines: string[] = [];
  if (record.title.trim()) {
    headerLines.push(`# ${record.title.trim()}`);
  }
  if (record.summary.trim()) {
    headerLines.push(`### ${record.summary.trim()}`);
  }
  const metaParts: string[] = [];
  if (record.releaseDate.trim()) {
    metaParts.push(`**Release Date:** ${record.releaseDate.trim()}`);
  }
  if (record.version.trim()) {
    metaParts.push(`**Version:** ${record.version.trim().replace(/^v/i, "")}`);
  }
  if (record.platform.trim()) {
    metaParts.push(`**Platform:** ${record.platform.trim()}`);
  }
  if (metaParts.length > 0) {
    headerLines.push(metaParts.join(" | "));
  }
  const cleanBody = cleanPostBodyForViewer(record.body || "");
  return `${headerLines.join("\n")}\n\n${cleanBody}\n`;
}

export function isBundledVersionNewer(bundledVer?: string, dbVer?: string): boolean {
  const cleanA = String(bundledVer || "")
    .replace(/^v/i, "")
    .trim();
  const cleanB = String(dbVer || "")
    .replace(/^v/i, "")
    .trim();
  if (!cleanA) return false;
  if (!cleanB) return true;
  if (cleanA.toLowerCase() === cleanB.toLowerCase()) return false;
  const parseNums = (v: string) =>
    v
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map((n) => parseInt(n, 10) || 0);
  const a = parseNums(cleanA);
  const b = parseNums(cleanB);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const na = a[i] ?? 0;
    const nb = b[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

export interface ParsedChangelogBlock {
  version: string;
  date: string;
  heading: string;
  markdown: string;
}

export function normalizeReleaseVersionKey(raw?: string): string {
  return String(raw || "").replace(/^v/i, "").trim().toLowerCase();
}

export function parseAllChangelogBlocks(changelog: string): ParsedChangelogBlock[] {
  const lines = (changelog || "").split(/\r?\n/);
  const blocks: ParsedChangelogBlock[] = [];
  let curLines: string[] = [];
  let curDate = "";
  let curVersion = "";
  let curHeading = "";

  const flush = () => {
    const md = curLines.join("\n").trim();
    if (!md) return;
    blocks.push({
      version: curVersion,
      date: curDate,
      heading: curHeading,
      markdown: md,
    });
    curLines = [];
    curDate = "";
    curVersion = "";
    curHeading = "";
  };

  const hasDateHeaders = lines.some((l) => /^\*\*Date:/i.test(l.trim()));

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (hasDateHeaders) {
      if (/^\*\*Date:/i.test(trimmed)) {
        flush();
        curDate = trimmed.replace(/^\*\*Date:\s*/i, "").replace(/\*\*$/g, "").trim();
        curLines.push(rawLine);
        continue;
      }
      if (/^\*\*Version:/i.test(trimmed) && !curVersion) {
        curVersion = trimmed.replace(/^\*\*Version:\s*/i, "").replace(/\*\*$/g, "").trim();
      } else if (trimmed.startsWith("## ") && !curHeading) {
        curHeading = trimmed.replace(/^##\s+/, "").trim();
      }
      curLines.push(rawLine);
    } else {
      const bracketMatch = trimmed.match(/^##\s+\[?v?([0-9]+\.[0-9]+[^\s\]-]*)\]?\s*(?:[-–—]\s*(.+))?$/i);
      if (bracketMatch) {
        flush();
        curVersion = bracketMatch[1].trim();
        curDate = (bracketMatch[2] || "").trim();
        curHeading = trimmed.replace(/^##\s+/, "").trim();
      }
      curLines.push(rawLine);
    }
  }
  flush();
  return blocks;
}

export function parseLatestChangelogBlock(changelog: string) {
  const blocks = parseAllChangelogBlocks(changelog);
  if (blocks.length > 0) {
    return blocks[0];
  }
  return {
    date: "",
    version: "",
    heading: "",
    markdown: (changelog || "").trim(),
  };
}

export function extractChangelogForVersion(
  changelog: string,
  version?: string
): string {
  const blocks = parseAllChangelogBlocks(changelog);
  const targetKey = normalizeReleaseVersionKey(version);
  if (targetKey) {
    const exact = blocks.find(
      (b) => normalizeReleaseVersionKey(b.version) === targetKey
    );
    if (exact) return exact.markdown;
  }
  return blocks[0]?.markdown || (changelog || "").trim();
}

export function serializeReleasePostMessage(
  record: Omit<KeepersReleasePostRecord, "id" | "title">
): string {
  const meta: Record<string, any> = {
    summary: record.summary || "",
    version: record.version || "",
    releaseDate: record.releaseDate || "",
    platform: record.platform || "Windows & macOS",
    imageUrl: record.imageUrl || "",
    codeSnippet: record.codeSnippet || "",
    pollData: record.pollData || null,
    customEdited: true,
  };
  if (record.archivedChangelog && record.archivedChangelog.trim()) {
    meta.archivedChangelog = record.archivedChangelog.trim();
  }
  return `<!-- RELEASE_META:${JSON.stringify(meta)} -->\n${(record.body || "").trim()}`;
}

export function deserializeReleasePostRow(
  row: any,
  fallback: Omit<KeepersReleasePostRecord, "id">,
  usePublished = false
): KeepersReleasePostRecord {
  if (!row) {
    return { id: null, ...fallback };
  }
  const rawMessage = String(
    (usePublished ? row.published_message || row.message : row.message) || ""
  );
  if (!rawMessage.trim()) {
    return { id: row.id || null, ...fallback };
  }
  const rawDescription = usePublished
    ? row.published_description ?? row.description
    : row.description;
  const rawTitle = String(
    (usePublished ? row.published_title || row.title : row.title) || ""
  ).trim();

  const metaMatch = rawMessage.match(/^<!--\s*RELEASE_META:(\{.*?\})\s*-->\s*/s);
  let parsedMeta: any = {};
  let body = rawMessage;

  if (metaMatch && metaMatch[1]) {
    try {
      parsedMeta = JSON.parse(metaMatch[1]);
    } catch {
      parsedMeta = {};
    }
    body = rawMessage.slice(metaMatch[0].length).trim();
  } else {
    const legacyParsed = parseSeedCommunityBlog(rawMessage);
    parsedMeta = {
      summary: rawDescription || legacyParsed.summary,
      releaseDate: legacyParsed.releaseDate,
      version: legacyParsed.version,
      platform: legacyParsed.platform,
    };
    body = legacyParsed.cleanBody || rawMessage;
  }

  const isInternalTitle =
    rawTitle === LEGACY_BLOG_BROADCAST_TITLE ||
    rawTitle === PUBLIC_POST_BROADCAST_TITLE ||
    rawTitle === DEV_POST_BROADCAST_TITLE;

  return {
    id: row.id || null,
    title: !isInternalTitle && rawTitle ? rawTitle : parsedMeta.title || fallback.title,
    summary:
      parsedMeta.summary !== undefined && parsedMeta.summary !== ""
        ? parsedMeta.summary
        : rawDescription || fallback.summary,
    version: parsedMeta.version || fallback.version,
    releaseDate: parsedMeta.releaseDate || fallback.releaseDate,
    platform: parsedMeta.platform || fallback.platform || "Windows & macOS",
    imageUrl: parsedMeta.imageUrl !== undefined ? parsedMeta.imageUrl : fallback.imageUrl || "",
    codeSnippet:
      parsedMeta.codeSnippet !== undefined
        ? parsedMeta.codeSnippet
        : row.code_snippet || fallback.codeSnippet || "",
    pollData:
      parsedMeta.pollData !== undefined
        ? parsedMeta.pollData
        : row.poll_data || fallback.pollData || null,
    body: body || fallback.body,
    archivedChangelog:
      typeof parsedMeta.archivedChangelog === "string"
        ? parsedMeta.archivedChangelog
        : fallback.archivedChangelog || "",
    publishedAt: String(row.published_at || row.updated_at || row.created_at || ""),
  };
}

export function deserializeChangelogRow(
  row: any,
  fallback: string,
  usePublished = false
): string {
  if (!row) return fallback;
  const raw = String(
    (usePublished ? row.published_message || row.message : row.message) || ""
  ).trim();
  if (!raw || raw.length < 300 || raw.includes("- **Title:** Desc")) {
    return fallback;
  }
  return raw;
}

export const normalizeMd = (txt: string): string =>
  (txt || "").replace(/\r\n/g, "\n").trim();

export function areReleasePostsEquivalent(
  a: Omit<KeepersReleasePostRecord, "id">,
  b: Omit<KeepersReleasePostRecord, "id">
): boolean {
  return (
    normalizeMd(a.title) === normalizeMd(b.title) &&
    normalizeMd(a.summary) === normalizeMd(b.summary) &&
    normalizeMd(a.version.replace(/^v/i, "")) ===
      normalizeMd(b.version.replace(/^v/i, "")) &&
    normalizeMd(cleanPostBodyForViewer(a.body)) ===
      normalizeMd(cleanPostBodyForViewer(b.body))
  );
}

export function areChangelogsEquivalent(a: string, b: string): boolean {
  return normalizeMd(a) === normalizeMd(b);
}

