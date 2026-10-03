import { useStore } from '../store';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useModalStore } from '../store/modalStore';
import { useTooltipStore } from '../store/tooltipStore';
import { supabase } from '../supabase';
import { UniversalCard } from '../components/universal/UniversalCard';

import { getExtensionRegex } from "./modUtils";
export const isVersionMatch = (reqs: string[] | string, userVer: string) => {
  if (!reqs || reqs.length === 0) return true;
  if (typeof reqs === "string") {
    if (
      reqs.includes("ALL") ||
      reqs.includes("ANY") ||
      reqs.includes("Unknown") ||
      reqs.includes("UNKNOWN")
    )
      return true;
  } else {
    if (
      reqs.includes("ALL") ||
      reqs.includes("ANY") ||
      reqs.includes("Unknown") ||
      reqs.includes("UNKNOWN")
    )
      return true;
  }
  if (!userVer) return true;
  const userVerArray =
    typeof userVer === "string"
      ? userVer.split(",").map((s) => s.replace(/^V\.?/i, "").trim())
      : [userVer];
  const reqArray =
    typeof reqs === "string" ? reqs.split(",").map((s) => s.trim()) : reqs;

  return reqArray.some((req) => {
    if (!req) return false;
    const cleanReq = req.replace(/^V\.?/i, "").trim();
    if (
      cleanReq.toLowerCase() === "vlocal" ||
      cleanReq.toLowerCase() === "any" ||
      cleanReq.toLowerCase() === "all"
    )
      return true;
    return userVerArray.some(
      (uv) => uv === cleanReq || uv.startsWith(cleanReq + "."),
    );
  });
};
export const getHighestVersion = (reqs: string[] | string) => {
  if (!reqs || reqs.length === 0) return "Unknown";
  if (reqs.includes("ALL")) return "ALL";
  const reqArray =
    typeof reqs === "string" ? reqs.split(",").map((s) => s.trim()) : reqs;
  const flatReqs = reqArray.flatMap((r) => r.split(",").map((s) => s.trim()));
  const sorted = [...flatReqs].sort((a, b) => {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const valA = partsA[i] || 0;
      const valB = partsB[i] || 0;
      if (valA !== valB) return valB - valA;
    }
    return 0;
  });
  return sorted[0];
};
export const isValidVersion = (version: string) => {
  return /^\d+\.\d+\.\d+$/.test(version);
};
export const compareVersions = (v1: string, v2: string) => {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = v1.split(".").map(Number);
  const p2 = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
};
export const getLowestVersion = (versions: string[]): string => {
  if (!versions || versions.length === 0) return "";
  return versions.reduce((a, b) => {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal < bVal) return a;
      if (aVal > bVal) return b;
    }
    return a;
  });
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

