import { useStore } from '../store';
import { getExtensionRegex } from "./modUtils";

const stripVerDecorators = (raw: string) =>
  String(raw || "")
    .trim()
    .replace(/^(?:>=|<=|!)?\s*[vV]?\.?/, "")
    .replace(/\+\s*$/, "")
    .trim();

const normalizeVerToken = (raw: string) =>
  String(raw || "")
    .replace(/^V\.?/i, "")
    .trim();

export const compareVersions = (v1: string, v2: string) => {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = stripVerDecorators(v1)
    .split(".")
    .map((s) => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    });
  const p2 = stripVerDecorators(v2)
    .split(".")
    .map((s) => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    });
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
};

const matchesSingleVersionRule = (rawRule: string, cleanTarget: string): boolean => {
  const rule = normalizeVerToken(rawRule);
  if (!rule) return false;
  const lower = rule.toLowerCase();
  if (
    lower === "vlocal" ||
    lower === "local" ||
    lower === "any" ||
    lower === "all" ||
    lower === "unknown" ||
    lower === "global"
  ) {
    return true;
  }

  if (rule.includes("..") || rule.includes(" - ") || /\d\s*-\s*\d/.test(rule)) {
    const parts = rule
      .split(/\s*-\s*|\.\./)
      .map((p) => normalizeVerToken(p))
      .filter(Boolean);
    if (parts.length === 2) {
      const low = compareVersions(parts[0], parts[1]) <= 0 ? parts[0] : parts[1];
      const high = compareVersions(parts[0], parts[1]) <= 0 ? parts[1] : parts[0];
      return (
        compareVersions(cleanTarget, low) >= 0 &&
        (compareVersions(cleanTarget, high) <= 0 ||
          cleanTarget.startsWith(high + "."))
      );
    }
  }

  if (rule.endsWith("+") || rule.startsWith(">=")) {
    const minVer = normalizeVerToken(rule.replace(/^>=\s*/, "").replace(/\+\s*$/, ""));
    if (!minVer) return false;
    return compareVersions(cleanTarget, minVer) >= 0;
  }

  if (rule.startsWith("<=")) {
    const maxVer = normalizeVerToken(rule.replace(/^<=\s*/, ""));
    if (!maxVer) return false;
    return (
      compareVersions(cleanTarget, maxVer) <= 0 ||
      cleanTarget.startsWith(maxVer + ".")
    );
  }

  return (
    cleanTarget === rule ||
    cleanTarget.startsWith(rule + ".") ||
    rule.startsWith(cleanTarget + ".")
  );
};

export const isVersionMatch = (reqs: string[] | string, userVer: string) => {
  const reqArray = (
    typeof reqs === "string"
      ? reqs.split(",")
      : Array.isArray(reqs)
        ? reqs.flatMap((r) => String(r || "").split(","))
        : []
  )
    .map((s) => s.trim())
    .filter(Boolean);

  if (reqArray.length === 0) return true;
  if (!userVer) return true;

  const userVerArray = (
    typeof userVer === "string" ? userVer.split(",") : [String(userVer)]
  )
    .map((s) => normalizeVerToken(s))
    .filter(Boolean);

  if (
    userVerArray.length === 0 ||
    userVerArray.some((uv) => {
      const l = uv.toLowerCase();
      return !l || l === "unknown" || l === "all" || l === "any";
    })
  ) {
    return true;
  }

  const exclusions: string[] = [];
  const positives: string[] = [];
  for (const raw of reqArray) {
    if (raw.startsWith("!")) {
      const ex = raw.slice(1).trim();
      if (ex) exclusions.push(ex);
    } else {
      positives.push(raw);
    }
  }

  const hasWildcardPositive = positives.some((p) => {
    const l = normalizeVerToken(p).toLowerCase();
    return (
      l === "all" ||
      l === "any" ||
      l === "unknown" ||
      l === "vlocal" ||
      l === "local" ||
      l === "global"
    );
  });

  if (hasWildcardPositive && exclusions.length === 0) {
    return true;
  }

  return userVerArray.some((uv) => {
    if (exclusions.some((ex) => matchesSingleVersionRule(ex, uv))) {
      return false;
    }
    if (positives.length === 0 || hasWildcardPositive) {
      return true;
    }
    return positives.some((pos) => matchesSingleVersionRule(pos, uv));
  });
};

export const getHighestVersion = (reqs: string[] | string) => {
  const reqArray = (
    typeof reqs === "string"
      ? reqs.split(",")
      : Array.isArray(reqs)
        ? reqs.flatMap((r) => String(r || "").split(","))
        : []
  )
    .map((s) => s.trim())
    .filter(Boolean);
  if (reqArray.length === 0) return "Unknown";
  const positives = reqArray.filter((r) => !r.startsWith("!"));
  if (positives.some((r) => ["all", "any"].includes(normalizeVerToken(r).toLowerCase()))) {
    return "ALL";
  }
  const flatReqs = positives
    .flatMap((r) => r.split(/\s+-\s+|\.\./))
    .map((s) => stripVerDecorators(s))
    .filter((s) => Boolean(s) && /^\d/.test(s));
  if (flatReqs.length === 0) {
    return reqArray.some((r) => r.startsWith("!")) ? "ALL" : "Unknown";
  }
  const sorted = [...flatReqs].sort((a, b) => compareVersions(b, a));
  return sorted[0];
};

export const getLowestVersion = (versions: string[]): string => {
  if (!versions || versions.length === 0) return "";
  const expanded = versions
    .flatMap((v) => String(v || "").split(","))
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && !s.startsWith("!"))
    .flatMap((v) => v.split(/\s+-\s+|\.\./))
    .map((s) => stripVerDecorators(s))
    .filter((s) => Boolean(s) && /^\d/.test(s));
  if (expanded.length === 0) return "";
  return expanded.reduce((a, b) => (compareVersions(a, b) < 0 ? a : b));
};

export const formatVersionRangesLabel = (
  reqs?: readonly unknown[] | string | null
): string => {
  const reqArray = (
    typeof reqs === "string"
      ? reqs.split(",")
      : Array.isArray(reqs)
        ? reqs.flatMap((r) => String(r || "").split(","))
        : []
  )
    .map((s) => s.trim())
    .filter(Boolean);

  if (reqArray.length === 0) return "Unknown";
  if (
    reqArray.length === 1 &&
    ["all", "any", "unknown"].includes(normalizeVerToken(reqArray[0]).toLowerCase())
  ) {
    return reqArray[0].toLowerCase() === "unknown" ? "Unknown" : "ALL";
  }

  const formatted = reqArray.map((raw) => {
    const isNeg = raw.startsWith("!");
    const body = normalizeVerToken(isNeg ? raw.slice(1) : raw);
    let label = body;
    if (body.includes("..") || body.includes(" - ") || /\d\s*-\s*\d/.test(body)) {
      const parts = body
        .split(/\s*-\s*|\.\./)
        .map((p) => normalizeVerToken(p))
        .filter(Boolean);
      if (parts.length === 2) {
        label = `${parts[0]}\u2013${parts[1]}`;
      }
    }
    return isNeg ? `!${label}` : label;
  });

  if (formatted.length > 3) {
    return `${formatted.slice(0, 2).join(", ")} +${formatted.length - 2}`;
  }
  return formatted.join(", ");
};

export const deriveHumanReadableVersion = (
  path: string | undefined | null,
  fallbackHash: string | undefined | null,
  t?: (key: string) => string,
) => {
  if (!path)
    return fallbackHash
      ? `v.DNA-${fallbackHash.substring(0, 7).toUpperCase()}`
      : t?.("shared_version_unknown") || "v.Unknown";

  const tsMatch =
    path.match(/[/\\]v\.(\d{10})[/\\]/i) ||
    path.match(/^v\.(\d{10})$/i) ||
    path.match(/[/\\]v\.(\d{10})$/i);
  let extractedVersion = "";

  if (tsMatch) {
    const d = new Date(parseInt(tsMatch[1]) * 1000);
    extractedVersion = `v.${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getDate().toString().padStart(2, "0")}-${d.getHours().toString().padStart(2, "0")}${d.getMinutes().toString().padStart(2, "0")}`;
  } else {
    const parts = path.split(/[/\\]/);
    extractedVersion =
      parts.length > 1
        ? parts[parts.length - 2]
        : parts[0].replace(
            getExtensionRegex(useStore.getState().activeGameSchema),
            "",
          );
  }

  if (!extractedVersion.match(/v\.|202\d|\d+\.\d+/i) && fallbackHash) {
    return `${extractedVersion} (DNA-${fallbackHash.substring(0, 5).toUpperCase()})`;
  }

  return extractedVersion;
};
