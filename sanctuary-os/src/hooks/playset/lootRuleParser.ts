export interface ParsedLootRule {
  modA: string;
  modB: string;
  type: "after" | "before";
}

function stripYamlQuotes(raw: string): string {
  const s = raw.trim();
  if (
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2)
  ) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function parseInlineYamlList(raw: string): string[] {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  return s
    .slice(1, -1)
    .split(",")
    .map((item) => stripYamlQuotes(item))
    .filter(Boolean);
}

/**
 * Parses LOOT userlist/masterlist YAML blocks (`plugins:` with `name:`, `after:`, `before:`,
 * `req:`) or JSON rule arrays into directional Sanctuary LoadOrderRule edges.
 * `type === "after"` means `modA` loads AFTER (and wins over) `modB`.
 */
export function parseLootRulesText(rawText: string): ParsedLootRule[] {
  const text = String(rawText || "").trim();
  if (!text) return [];

  const dedup = new Map<string, ParsedLootRule>();
  const pushRule = (modA: string, modB: string, type: "after" | "before") => {
    const cleanA = modA.split(/[/\\]/).pop()?.trim() || modA.trim();
    const cleanB = modB.split(/[/\\]/).pop()?.trim() || modB.trim();
    if (!cleanA || !cleanB || cleanA.toLowerCase() === cleanB.toLowerCase()) return;
    const key = `${cleanA.toLowerCase()}=>${type}=>${cleanB.toLowerCase()}`;
    if (!dedup.has(key)) {
      dedup.set(key, { modA: cleanA, modB: cleanB, type });
    }
  };

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      const list: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.plugins)
          ? parsed.plugins
          : Array.isArray(parsed?.rules)
            ? parsed.rules
            : [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        if (typeof item.name === "string") {
          for (const dep of Array.isArray(item.after) ? item.after : []) {
            if (typeof dep === "string") pushRule(item.name, dep, "after");
            else if (dep && typeof dep.name === "string") pushRule(item.name, dep.name, "after");
          }
          for (const dep of Array.isArray(item.req) ? item.req : []) {
            if (typeof dep === "string") pushRule(item.name, dep, "after");
            else if (dep && typeof dep.name === "string") pushRule(item.name, dep.name, "after");
          }
          for (const dep of Array.isArray(item.before) ? item.before : []) {
            if (typeof dep === "string") pushRule(item.name, dep, "before");
            else if (dep && typeof dep.name === "string") pushRule(item.name, dep.name, "before");
          }
        }
        if (typeof item.modA === "string" && typeof item.modB === "string") {
          pushRule(item.modA, item.modB, item.type === "before" ? "before" : "after");
        } else if (typeof item.winner === "string" && typeof item.loser === "string") {
          pushRule(item.winner, item.loser, "after");
        } else if (typeof item.from === "string" && typeof item.to === "string") {
          pushRule(item.to, item.from, item.type === "before" ? "before" : "after");
        }
      }
      return Array.from(dedup.values());
    } catch {
      // Fall through to YAML parser in case leading braces were not valid JSON
    }
  }

  let currentPlugin = "";
  let currentSection: "after" | "before" | "other" = "other";

  for (const rawLine of text.split(/\r?\n/)) {
    const noComment = rawLine.replace(/\s+#.*$/, "");
    const trimmed = noComment.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const dashNameMatch = trimmed.match(/^-\s*name\s*:\s*(.+)$/i);
    if (dashNameMatch) {
      currentPlugin = stripYamlQuotes(dashNameMatch[1]);
      currentSection = "other";
      continue;
    }

    const nameMatch = trimmed.match(/^name\s*:\s*(.+)$/i);
    if (nameMatch && !trimmed.startsWith("-")) {
      currentPlugin = stripYamlQuotes(nameMatch[1]);
      currentSection = "other";
      continue;
    }

    const secMatch = trimmed.match(/^(after|req|before)\s*:\s*(.*)$/i);
    if (secMatch && currentPlugin) {
      const key = secMatch[1].toLowerCase();
      const rhs = secMatch[2].trim();
      const rel: "after" | "before" = key === "before" ? "before" : "after";
      if (rhs.startsWith("[")) {
        for (const dep of parseInlineYamlList(rhs)) {
          pushRule(currentPlugin, dep, rel);
        }
        currentSection = "other";
      } else if (rhs) {
        pushRule(currentPlugin, stripYamlQuotes(rhs), rel);
        currentSection = "other";
      } else {
        currentSection = rel;
      }
      continue;
    }

    if (currentPlugin && (currentSection === "after" || currentSection === "before")) {
      const listItem = trimmed.match(/^-\s*(?:name\s*:\s*)?(.+)$/i);
      if (listItem) {
        const dep = stripYamlQuotes(listItem[1]);
        if (dep && !dep.includes(":")) {
          pushRule(currentPlugin, dep, currentSection);
        }
        continue;
      }
    }

    if (/^[a-z0-9_]+\s*:/i.test(trimmed) || /^-\s+[a-z0-9_]+\s*:/i.test(trimmed)) {
      currentSection = "other";
    }
  }

  return Array.from(dedup.values());
}
