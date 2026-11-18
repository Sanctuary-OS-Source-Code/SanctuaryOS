import { parseUplinkBundle } from "../supabase";

export type ParsedDeepLinkAction =
  | {
      kind: "uplink_prompt";
      rawUri: string;
      supabaseHost: string;
    }
  | {
      kind: "uplink_immediate";
      uplinkBundle: string;
    }
  | {
      kind: "direct_https_install";
      scheme: "sanctuary" | "ror2mm" | "nxm" | "curseforge";
      targetUrl: string;
      host: string;
      labelName: string;
      suggestedName: string | null;
      targetFolder: string | null;
      expectedSha256: string | null;
    }
  | {
      kind: "guided_browser";
      scheme: "nxm" | "curseforge";
      id: string;
      displayName: string;
      browseUrl: string;
      modId: string;
      fileId: string | null;
    }
  | {
      kind: "local_path";
      path: string;
    };

function buildDirectHttpsAction(
  scheme: "sanctuary" | "ror2mm" | "nxm" | "curseforge",
  targetUrl: string,
  suggestedName: string | null,
  targetFolder: string | null,
  expectedSha256: string | null,
  fallbackModLabel: string
): ParsedDeepLinkAction | null {
  if (!/^https:\/\//i.test(targetUrl)) return null;
  try {
    const parsedTarget = new URL(targetUrl);
    let tailLabel = "";
    try {
      tailLabel = decodeURIComponent(parsedTarget.pathname.split("/").pop() || "");
    } catch {
      tailLabel = parsedTarget.pathname.split("/").pop() || "";
    }
    const labelName = suggestedName || tailLabel || fallbackModLabel;
    return {
      kind: "direct_https_install",
      scheme,
      targetUrl,
      host: parsedTarget.hostname,
      labelName,
      suggestedName,
      targetFolder,
      expectedSha256,
    };
  } catch {
    return null;
  }
}

export function parseDeepLinkItem(
  rawItem: string,
  fallbackModLabel = "Mod"
): ParsedDeepLinkAction | null {
  const cleaned = String(rawItem || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim();
  if (!cleaned) return null;

  if (/^sanctuary-uplink:\/\//i.test(cleaned)) {
    const parsedBundle = parseUplinkBundle(cleaned);
    if (parsedBundle?.supabase_url && parsedBundle?.supabase_anon_key) {
      try {
        return {
          kind: "uplink_prompt",
          rawUri: cleaned,
          supabaseHost: new URL(parsedBundle.supabase_url).hostname,
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  if (/^sanctuary:\/\//i.test(cleaned)) {
    try {
      const parsedUri = new URL(cleaned);
      const uplinkParam = (parsedUri.searchParams.get("uplink") || "").trim();
      if (uplinkParam && parseUplinkBundle(uplinkParam)) {
        return {
          kind: "uplink_immediate",
          uplinkBundle: uplinkParam,
        };
      }
      const targetUrl = (parsedUri.searchParams.get("url") || "").trim();
      const expectedSha256 = (parsedUri.searchParams.get("sha256") || "").trim() || null;
      const suggestedName = (parsedUri.searchParams.get("name") || "").trim() || null;
      const targetFolder = (parsedUri.searchParams.get("folder") || "").trim() || null;
      return buildDirectHttpsAction(
        "sanctuary",
        targetUrl,
        suggestedName,
        targetFolder,
        expectedSha256,
        fallbackModLabel
      );
    } catch {
      return null;
    }
  }

  if (/^ror2mm:\/\//i.test(cleaned)) {
    try {
      const match = cleaned.match(
        /^ror2mm:\/\/v1\/install\/([^/]+)\/([^/]+)\/([^/]+)\/([^/?#]+)/i
      );
      if (match && match[1].toLowerCase() === "thunderstore.io") {
        const ns = encodeURIComponent(decodeURIComponent(match[2]));
        const pkg = encodeURIComponent(decodeURIComponent(match[3]));
        const ver = encodeURIComponent(decodeURIComponent(match[4]));
        const dlUrl = `https://thunderstore.io/package/download/${ns}/${pkg}/${ver}/`;
        const fileLabel = `${decodeURIComponent(match[3])}-${decodeURIComponent(match[4])}.zip`;
        return buildDirectHttpsAction(
          "ror2mm",
          dlUrl,
          fileLabel,
          null,
          null,
          fallbackModLabel
        );
      }
      return null;
    } catch {
      return null;
    }
  }

  if (/^nxm:\/\//i.test(cleaned)) {
    try {
      const parsedUri = new URL(cleaned);
      const directUrl = (parsedUri.searchParams.get("url") || "").trim();
      if (/^https:\/\//i.test(directUrl)) {
        return buildDirectHttpsAction("nxm", directUrl, null, null, null, fallbackModLabel);
      }
      const segs = parsedUri.pathname.split("/").filter(Boolean);
      const modIdx = segs.findIndex((s) => s.toLowerCase() === "mods");
      const modId = modIdx >= 0 ? (segs[modIdx + 1] || "").trim() : "";
      const fileIdx = segs.findIndex((s) => s.toLowerCase() === "files");
      const fileIdRaw =
        (fileIdx >= 0 ? segs[fileIdx + 1] : "") ||
        parsedUri.searchParams.get("fileId") ||
        parsedUri.searchParams.get("file_id") ||
        "";
      const fileId = fileIdRaw.trim() || null;
      const domain = (parsedUri.hostname || "").trim();
      if (!domain || !modId) return null;

      const browseUrl = `https://www.nexusmods.com/${encodeURIComponent(
        domain
      )}/mods/${encodeURIComponent(modId)}?tab=files${
        fileId ? `&file_id=${encodeURIComponent(fileId)}` : ""
      }`;
      const displayName = fileId
        ? `${domain} #${modId} (File #${fileId})`
        : `${domain} #${modId}`;
      return {
        kind: "guided_browser",
        scheme: "nxm",
        id: fileId ? `${modId}:${fileId}` : modId,
        displayName,
        browseUrl,
        modId,
        fileId,
      };
    } catch {
      return null;
    }
  }

  if (/^curseforge:\/\//i.test(cleaned)) {
    try {
      const parsedUri = new URL(cleaned);
      const directUrl = (parsedUri.searchParams.get("url") || "").trim();
      if (/^https:\/\//i.test(directUrl)) {
        return buildDirectHttpsAction(
          "curseforge",
          directUrl,
          null,
          null,
          null,
          fallbackModLabel
        );
      }
      const segs = parsedUri.pathname.split("/").filter(Boolean);
      const projIdx = segs.findIndex((s) => {
        const l = s.toLowerCase();
        return l === "projects" || l === "addon" || l === "mods";
      });
      const addonFromPath = projIdx >= 0 ? segs[projIdx + 1] || "" : "";
      const fileIdx = segs.findIndex((s) => {
        const l = s.toLowerCase();
        return l === "files" || l === "file";
      });
      const fileFromPath = fileIdx >= 0 ? segs[fileIdx + 1] || "" : "";

      const addonId = (
        parsedUri.searchParams.get("addonId") ||
        parsedUri.searchParams.get("projectId") ||
        parsedUri.searchParams.get("modId") ||
        addonFromPath
      ).trim();
      const fileId =
        (
          parsedUri.searchParams.get("fileId") ||
          parsedUri.searchParams.get("file_id") ||
          fileFromPath
        ).trim() || null;

      if (!addonId) return null;
      const browseUrl = `https://www.curseforge.com/projects/${encodeURIComponent(addonId)}`;
      const displayName = fileId
        ? `CurseForge #${addonId} (File #${fileId})`
        : `CurseForge #${addonId}`;
      return {
        kind: "guided_browser",
        scheme: "curseforge",
        id: fileId ? `${addonId}:${fileId}` : addonId,
        displayName,
        browseUrl,
        modId: addonId,
        fileId,
      };
    } catch {
      return null;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) {
    return null;
  }

  return {
    kind: "local_path",
    path: cleaned,
  };
}
